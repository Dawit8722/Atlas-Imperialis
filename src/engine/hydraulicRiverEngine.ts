import { Point2D, SeasonalState, CustomRiver } from '../types/world';
import { VoronoiDualMesh } from './voronoiDualMesh';
import { TerrainSimulationResult } from './terrainSimulationEngine';
import { lerpColorHex } from './weatherSimulation';

/**
 * Procedural River Engine & River Shader
 * - Hydraulic geometry width scaling: W proportional to sqrt(flow)
 * - Continuous chained river polylines (Spring -> Confluence -> Sea) with Chaikin spline smoothing
 * - Tapered seamless ribbon polygons (zero segment kinks, zero V-notches, zero black rgba-lerp artifacts)
 * - Clean shoreline estuary termination & gentle funnel widening
 */

export interface RiverSegment {
  fromRegion: number;
  toRegion: number;
  p0: Point2D;
  cp1: Point2D;
  cp2: Point2D;
  p1: Point2D;
  width0: number;
  width1: number;
  flow0: number;
  flow1: number;
  isEstuary: boolean;
}

export interface RiverChainNode {
  x: number;
  y: number;
  width: number;
  flow: number;
}

export interface RiverChain {
  nodes: RiverChainNode[];
  isEstuary: boolean;
}

export interface HydraulicRiverData {
  segments: RiverSegment[];
  chains: RiverChain[];
  confluences: Point2D[];
  springHeads: Point2D[];
}

export function customRiverToChain(customRiver: CustomRiver, flowScale = 1.0): RiverChain {
  const pts = customRiver.points || [];
  const scale = Math.max(0.5, Math.min(2.6, customRiver.widthScale || 1.0));
  const rawNodes: RiverChainNode[] = pts.map((p, idx) => {
    const t = pts.length > 1 ? idx / (pts.length - 1) : 1;
    const width = (0.75 + t * 2.15) * scale * flowScale;
    const flow = (6 + t * 42) * scale;
    return { x: p.x, y: p.y, width, flow };
  });
  const smoothed = rawNodes.length >= 2 ? smoothRiverChain(rawNodes, 2) : rawNodes;
  return {
    nodes: smoothed,
    isEstuary: pts.length >= 3,
  };
}

/**
 * Calculates river channel width from water flux using Leopold-Maddock hydraulic geometry:
 * W = baseWidth + scale * sqrt(flow)
 */
export function calculateRiverWidth(flow: number, flowMultiplier = 1.0): number {
  const scaledFlow = Math.max(0, flow) * flowMultiplier;
  const sqrtFlow = Math.sqrt(scaledFlow);
  return Math.max(0.75, Math.min(3.5, 0.55 + sqrtFlow * 0.34));
}

/**
 * Endpoint-preserving Chaikin + gentle deterministic meander smoothing on a tapered river polyline.
 * Eliminates sharp Voronoi cell-to-cell kinks while keeping springs, confluences,
 * and shoreline estuaries locked cleanly to their exact coordinates.
 */
function smoothRiverChain(nodes: RiverChainNode[], iterations = 2): RiverChainNode[] {
  if (nodes.length <= 2) return nodes;

  // Step 1: Subtle deterministic meander displacement on interior midpoints so straight Voronoi runs curve organically
  const meandered: RiverChainNode[] = [nodes[0]];
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i];
    const b = nodes[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen > 5.5) {
      const nx = -dy / segLen;
      const ny = dx / segLen;
      // Deterministic sinusoidal wave keyed to midpoint coordinates (no jitter across frames)
      const mx = (a.x + b.x) * 0.5;
      const my = (a.y + b.y) * 0.5;
      const hash = Math.sin(mx * 0.137 + my * 0.193) * Math.cos(mx * 0.071 - my * 0.113);
      const amp = Math.min(3.2, segLen * 0.14) * hash;
      meandered.push({
        x: mx + nx * amp,
        y: my + ny * amp,
        width: (a.width + b.width) * 0.5,
        flow: (a.flow + b.flow) * 0.5,
      });
    }
    meandered.push(b);
  }

  // Step 2: Endpoint-preserving Chaikin subdivision
  let current = meandered;
  for (let iter = 0; iter < iterations; iter++) {
    const next: RiverChainNode[] = [current[0]];
    for (let i = 0; i < current.length - 1; i++) {
      const a = current[i];
      const b = current[i + 1];
      next.push({
        x: a.x * 0.75 + b.x * 0.25,
        y: a.y * 0.75 + b.y * 0.25,
        width: a.width * 0.75 + b.width * 0.25,
        flow: a.flow * 0.75 + b.flow * 0.25,
      });
      next.push({
        x: a.x * 0.25 + b.x * 0.75,
        y: a.y * 0.25 + b.y * 0.75,
        width: a.width * 0.25 + b.width * 0.75,
        flow: a.flow * 0.25 + b.flow * 0.75,
      });
    }
    next.push(current[current.length - 1]);
    current = next;
  }

  return current;
}

/**
 * Builds continuous smoothed river chains (Spring/Confluence -> Confluence/Ocean)
 * plus segment metadata for any downstream consumers.
 */
export function buildHydraulicRiverNetwork(
  mesh: VoronoiDualMesh,
  sim: TerrainSimulationResult,
  seaLevel: number,
  flowMultiplier = 1.0,
  projCoords?: { x: Float64Array; y: Float64Array }
): HydraulicRiverData {
  const numRegions = mesh.numRegions;
  const r_x = projCoords ? projCoords.x : mesh.r_x;
  const r_y = projCoords ? projCoords.y : mesh.r_y;
  const { downhill, isRiver, waterFlux, elevation, isLake, isOcean } = sim;

  const isWaterBody = (r: number) =>
    Boolean(isOcean?.[r] || isLake?.[r] || elevation[r] < seaLevel);

  const incomingCount = new Int32Array(numRegions);
  const incomingLakeSource = new Int32Array(numRegions).fill(-1);
  const springHeads: Point2D[] = [];
  const confluences: Point2D[] = [];

  for (let r = 0; r < numRegions; r++) {
    const target = downhill[r];
    if (target === -1) continue;
    if (isLake?.[r] && isRiver[target] && !isWaterBody(target)) {
      if (incomingLakeSource[target] === -1 || waterFlux[r] > waterFlux[incomingLakeSource[target]]) {
        incomingLakeSource[target] = r;
      }
    }
    if (!isRiver[r] || isWaterBody(r)) continue;
    if (isRiver[target] && !isWaterBody(target)) {
      incomingCount[target]++;
    }
  }

  for (let r = 0; r < numRegions; r++) {
    if (!isRiver[r] || isWaterBody(r)) continue;
    if (incomingCount[r] === 0 && incomingLakeSource[r] === -1) {
      springHeads.push({ x: r_x[r], y: r_y[r] });
    }
    if (incomingCount[r] >= 2) {
      confluences.push({ x: r_x[r], y: r_y[r] });
    }
  }

  // Helper to compute shoreline intersection when a river cell meets an ocean or lake cell
  const getShorelinePoint = (fromR: number, toR: number, isLakeShore = false): Point2D => {
    const p0x = r_x[fromR];
    const p0y = r_y[fromR];
    const p1x = r_x[toR];
    const p1y = r_y[toR];
    if (isLakeShore) {
      // Extend cleanly into the lake polygon so the river tucks seamlessly under the lake shoreline ink
      return {
        x: p0x + (p1x - p0x) * 0.62,
        y: p0y + (p1y - p0y) * 0.62,
      };
    }
    const elevR = elevation[fromR];
    const elevT = elevation[toR];
    const t = (elevR - seaLevel) / Math.max(0.001, elevR - elevT);
    // Extend past the coastline edge (0.58..0.76) so the carved river mouth cleanly breaches the black shoreline into open sea
    const clampT = Math.max(0.58, Math.min(0.76, t + 0.16));
    return {
      x: p0x + (p1x - p0x) * clampT,
      y: p0y + (p1y - p0y) * clampT,
    };
  };

  // Trace continuous river chains starting at every spring head, lake spillway outlet, AND confluence
  const chains: RiverChain[] = [];
  const segments: RiverSegment[] = [];
  const chainStartRegions: number[] = [];

  for (let r = 0; r < numRegions; r++) {
    if (!isRiver[r] || isWaterBody(r)) continue;
    if (incomingCount[r] === 0 || incomingCount[r] >= 2) {
      chainStartRegions.push(r);
    }
  }

  const visitedStartEdges = new Set<number>();

  for (const startR of chainStartRegions) {
    if (visitedStartEdges.has(startR)) continue;
    const rawNodes: RiverChainNode[] = [];
    const seenInChain = new Set<number>();
    let curr = startR;
    let isEstuary = false;

    // If this river emerges from a lake spillway, start seamlessly inside the lake shoreline
    const lakeSrc = incomingLakeSource[startR];
    if (lakeSrc !== -1 && incomingCount[startR] === 0) {
      const lakeShore = getShorelinePoint(startR, lakeSrc, true);
      const outFlow = Math.max(waterFlux[startR], waterFlux[lakeSrc]);
      rawNodes.push({
        x: lakeShore.x,
        y: lakeShore.y,
        width: calculateRiverWidth(outFlow, flowMultiplier),
        flow: outFlow,
      });
    }

    while (curr !== -1 && !seenInChain.has(curr)) {
      seenInChain.add(curr);
      visitedStartEdges.add(curr);

      const flow = waterFlux[curr];
      const w = calculateRiverWidth(flow, flowMultiplier);
      const isPureSpringHead = curr === startR && incomingCount[startR] === 0 && lakeSrc === -1;
      rawNodes.push({
        x: r_x[curr],
        y: r_y[curr],
        width: isPureSpringHead ? Math.min(w, 0.9) : w,
        flow,
      });

      const next = downhill[curr];
      if (next === -1) break;

      if (isWaterBody(next)) {
        // Reached an ocean OR a lake: terminate cleanly inside the shoreline with gentle funnel widening
        const enteringLake = Boolean(isLake?.[next] && !isOcean?.[next]);
        const shore = getShorelinePoint(curr, next, enteringLake);
        const endFlow = Math.max(flow, waterFlux[next]);
        const endW = calculateRiverWidth(endFlow, flowMultiplier) * (enteringLake ? 1.18 : 1.42);
        rawNodes.push({
          x: shore.x,
          y: shore.y,
          width: endW,
          flow: endFlow,
        });
        isEstuary = !enteringLake;
        break;
      }

      if (!isRiver[next]) break;

      // Stop this chain AT the next confluence (the confluence starts its own combined downstream chain)
      if (incomingCount[next] >= 2) {
        const nextFlow = waterFlux[next];
        rawNodes.push({
          x: r_x[next],
          y: r_y[next],
          width: calculateRiverWidth(Math.min(nextFlow, flow * 1.35), flowMultiplier),
          flow: nextFlow,
        });
        break;
      }

      curr = next;
    }

    if (rawNodes.length >= 2) {
      const smoothed = smoothRiverChain(rawNodes, 2);
      chains.push({ nodes: smoothed, isEstuary });

      for (let i = 0; i < smoothed.length - 1; i++) {
        const a = smoothed[i];
        const b = smoothed[i + 1];
        segments.push({
          fromRegion: startR,
          toRegion: startR,
          p0: { x: a.x, y: a.y },
          cp1: { x: a.x + (b.x - a.x) * 0.33, y: a.y + (b.y - a.y) * 0.33 },
          cp2: { x: a.x + (b.x - a.x) * 0.67, y: a.y + (b.y - a.y) * 0.67 },
          p1: { x: b.x, y: b.y },
          width0: a.width,
          width1: b.width,
          flow0: a.flow,
          flow1: b.flow,
          isEstuary: isEstuary && i === smoothed.length - 2,
        });
      }
    }
  }

  return {
    segments,
    chains,
    confluences,
    springHeads,
  };
}

/**
 * Traces a smooth Catmull-Rom-derived cubic Bezier curve through a sequence of points
 * with tangent clamping to prevent loops or self-intersections on sharp bends.
 */
function traceCubicBezierPoints(ctx: CanvasRenderingContext2D, pts: Point2D[], moveToFirst = true): void {
  const n = pts.length;
  if (n < 2) return;
  if (moveToFirst) {
    ctx.moveTo(pts[0].x, pts[0].y);
  } else {
    ctx.lineTo(pts[0].x, pts[0].y);
  }
  if (n === 2) {
    ctx.lineTo(pts[1].x, pts[1].y);
    return;
  }
  const tension = 1 / 6;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(n - 1, i + 2)];

    const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
    const maxHandle = segLen * 0.42;

    let t1x = (p2.x - p0.x) * tension;
    let t1y = (p2.y - p0.y) * tension;
    const t1Len = Math.hypot(t1x, t1y);
    if (t1Len > maxHandle) {
      const s = maxHandle / t1Len;
      t1x *= s;
      t1y *= s;
    }

    let t2x = (p3.x - p1.x) * tension;
    let t2y = (p3.y - p1.y) * tension;
    const t2Len = Math.hypot(t2x, t2y);
    if (t2Len > maxHandle) {
      const s = maxHandle / t2Len;
      t2x *= s;
      t2y *= s;
    }

    ctx.bezierCurveTo(
      p1.x + t1x,
      p1.y + t1y,
      p2.x - t2x,
      p2.y - t2y,
      p2.x,
      p2.y
    );
  }
}

/**
 * Traces a single continuous, seamless tapered cubic-Bezier ribbon subpath (without calling beginPath/fill)
 * so multiple rivers, confluences, estuaries, and lakes can be unified into one carved cutout or clip region.
 */
export function traceChainRibbonSubpath(
  ctx: CanvasRenderingContext2D,
  nodes: RiverChainNode[],
  widthExpansion = 0,
  offsetX = 0,
  offsetY = 0
): void {
  const n = nodes.length;
  if (n < 2) return;

  const leftBank: Point2D[] = new Array(n);
  const rightBankRev: Point2D[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const prev = nodes[Math.max(0, i - 1)];
    const next = nodes[Math.min(n - 1, i + 1)];
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    const nx = -ty / len;
    const ny = tx / len;

    const halfW = Math.max(0.25, (nodes[i].width + widthExpansion) * 0.5);
    leftBank[i] = { x: nodes[i].x + offsetX + nx * halfW, y: nodes[i].y + offsetY + ny * halfW };
    rightBankRev[n - 1 - i] = { x: nodes[i].x + offsetX - nx * halfW, y: nodes[i].y + offsetY - ny * halfW };
  }

  traceCubicBezierPoints(ctx, leftBank, true);
  traceCubicBezierPoints(ctx, rightBankRev, false);
  ctx.closePath();
}

/**
 * Traces all river chains and confluence circles into the current canvas path.
 */
export function traceRiverNetworkSubpaths(
  ctx: CanvasRenderingContext2D,
  riverData: HydraulicRiverData,
  widthExpansion = 0,
  offsetX = 0,
  offsetY = 0
): void {
  for (const chain of riverData.chains) {
    traceChainRibbonSubpath(ctx, chain.nodes, widthExpansion, offsetX, offsetY);
  }
  const confR = Math.max(0.4, 1.15 + widthExpansion * 0.45);
  for (const conf of riverData.confluences) {
    ctx.moveTo(conf.x + offsetX + confR, conf.y + offsetY);
    ctx.arc(conf.x + offsetX, conf.y + offsetY, confR, 0, Math.PI * 2);
  }
}

/**
 * Traces smooth cubic-Bezier centerlines for major river depth/sheen accents.
 */
export function drawRiverFlowAccents2D(
  ctx: CanvasRenderingContext2D,
  riverData: HydraulicRiverData,
  seasonal: SeasonalState
): void {
  const { chains } = riverData;
  if (chains.length === 0) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 1. Subtle deeper thalweg channel down the center of wide rivers
  const depthAlpha = seasonal.currentSeason === 'Winter' ? 0.14 : 0.22;
  ctx.strokeStyle = `rgba(38, 98, 118, ${depthAlpha.toFixed(2)})`;
  for (const chain of chains) {
    const nodes = chain.nodes;
    if (nodes.length < 2) continue;
    const maxW = nodes[nodes.length - 1].width;
    if (maxW < 2.1) continue;
    const midPts: Point2D[] = [];
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].width >= 1.8) midPts.push({ x: nodes[i].x, y: nodes[i].y });
    }
    if (midPts.length >= 2) {
      ctx.lineWidth = Math.max(0.7, Math.min(2.0, maxW * 0.42));
      ctx.beginPath();
      traceCubicBezierPoints(ctx, midPts, true);
      ctx.stroke();
    }
  }

  // 2. Delicate sunlit specular flow sheen on major rivers
  const glintAlpha = 0.26 + seasonal.winterWeight * 0.22;
  ctx.strokeStyle = `rgba(242, 251, 255, ${glintAlpha.toFixed(2)})`;
  for (const chain of chains) {
    const nodes = chain.nodes;
    if (nodes.length < 2) continue;
    const maxW = nodes[nodes.length - 1].width;
    if (maxW < 1.85) continue;

    const sheenPts: Point2D[] = [];
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].width >= 1.55) {
        sheenPts.push({ x: nodes[i].x, y: nodes[i].y });
      }
    }
    if (sheenPts.length >= 2) {
      ctx.lineWidth = Math.max(0.4, Math.min(0.85, maxW * 0.20));
      ctx.beginPath();
      traceCubicBezierPoints(ctx, sheenPts, true);
      ctx.stroke();
    }
  }

  ctx.restore();
}

/**
 * Renders a single continuous, seamless tapered cubic-Bezier ribbon along a smoothed river chain.
 */
function renderChainRibbon(
  ctx: CanvasRenderingContext2D,
  nodes: RiverChainNode[],
  widthExpansion = 0
): void {
  if (nodes.length < 2) return;
  ctx.beginPath();
  traceChainRibbonSubpath(ctx, nodes, widthExpansion);
  ctx.fill();
}

/**
 * Standalone 2D river renderer (carved valley bevel + opaque water cutout + inner bank shadow).
 */
export function drawHydraulicRiverShader2D(
  ctx: CanvasRenderingContext2D,
  mesh: VoronoiDualMesh,
  sim: TerrainSimulationResult,
  seaLevel: number,
  seasonal: SeasonalState
): void {
  const riverData = buildHydraulicRiverNetwork(mesh, sim, seaLevel, seasonal.riverSwelling);
  if (riverData.chains.length === 0) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Pass 1: Recessed valley bevel into land
  ctx.fillStyle = 'rgba(14, 18, 26, 0.12)';
  ctx.beginPath();
  traceRiverNetworkSubpaths(ctx, riverData, 4.4);
  ctx.fill();

  // Pass 2: Crisp carved shoreline ink (matching coastline #181822)
  ctx.fillStyle = lerpColorHex('#18242e', '#4c6675', seasonal.winterWeight * 0.65);
  ctx.globalAlpha = 0.82;
  ctx.beginPath();
  traceRiverNetworkSubpaths(ctx, riverData, 1.45);
  ctx.fill();

  // Pass 3: 100% Opaque water cutout (zero land/political bleed-through)
  ctx.globalAlpha = 1.0;
  ctx.fillStyle = lerpColorHex('#5ca8ba', '#c3deeb', seasonal.winterWeight * 0.92);
  ctx.beginPath();
  traceRiverNetworkSubpaths(ctx, riverData, 0);
  ctx.fill();

  // Pass 4: Thalweg depth & flow sheen
  drawRiverFlowAccents2D(ctx, riverData, seasonal);

  ctx.restore();
}
