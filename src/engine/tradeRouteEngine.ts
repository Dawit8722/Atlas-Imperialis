import { VoronoiDualMesh } from './voronoiDualMesh';
import { TerrainSimulationResult } from './terrainSimulationEngine';
import {
  Burg,
  Realm,
  Point2D,
  RouteClassification,
  TradeRoute,
  TraderCaravan,
  BiomeType,
  TradeNetwork,
  TradeHub,
  WorldState,
} from '../types/world';
import { PRNG } from '../utils/proceduralNoise';
import {
  deriveRealisticBurgExports,
  deriveRealisticBurgImports,
  evaluateGeographicSiteCommodity,
} from './geographyExportsEngine';

export type { TradeNetwork, TradeHub };

export interface SettlementSite {
  region: number;
  score: number;
  siteType: 'Estuary Harbor' | 'River Confluence' | 'Mountain Pass' | 'Crossroads' | 'Fertile Basin';
  suggestedType: Burg['type'];
  tradeGoodSuggestion: string;
}

/**
 * Geographic Settlement Suitability Evaluator
 * Identifies natural trading locations: Estuaries, River Confluences,
 * Sheltered Harbors, Mountain Passes, and Fertile Basins.
 */
export function evaluateSettlementSite(
  r: number,
  mesh: VoronoiDualMesh,
  sim: TerrainSimulationResult,
  seaLevel: number
): SettlementSite | null {
  const elev = sim.elevation[r];
  if (elev < seaLevel) return null;

  const neighbors = mesh.r_neighbors[r];
  let waterNeighborCount = 0;
  let riverNeighborCount = 0;
  let mountainNeighborCount = 0;
  let lowNeighborCount = 0;

  for (let i = 0; i < neighbors.length; i++) {
    const n = neighbors[i];
    const nElev = sim.elevation[n];
    if (nElev < seaLevel) waterNeighborCount++;
    if (sim.isRiver[n]) riverNeighborCount++;
    if (nElev > 0.65) mountainNeighborCount++;
    if (nElev < elev) lowNeighborCount++;
  }

  const isRiver = sim.isRiver[r];
  const isCoast = sim.isCoast[r] || waterNeighborCount > 0;
  const flux = sim.waterFlux[r] || 0;
  const moist = sim.rainfall[r] || 0;
  const geoCtx = {
    biome: sim.biomes[r],
    elevation: elev,
    temperature: sim.temperature[r],
    moisture: moist,
    isCoast,
    isRiver,
    reliefType: sim.reliefType[r],
  };

  // 1. Estuary Harbor: River meets sea
  if (isRiver && isCoast) {
    const score = 100 + flux * 4 + waterNeighborCount * 8;
    return {
      region: r,
      score,
      siteType: 'Estuary Harbor',
      suggestedType: 'Trade Port',
      tradeGoodSuggestion: evaluateGeographicSiteCommodity('Estuary Harbor', geoCtx),
    };
  }

  // 2. River Confluence
  if (isRiver && (riverNeighborCount >= 2 || flux > 12)) {
    const score = 85 + flux * 3 + riverNeighborCount * 6;
    return {
      region: r,
      score,
      siteType: 'River Confluence',
      suggestedType: 'Royal Metropolis',
      tradeGoodSuggestion: evaluateGeographicSiteCommodity('River Confluence', geoCtx),
    };
  }

  // 3. Natural Coastal Harbor
  if (isCoast && waterNeighborCount >= 1 && waterNeighborCount <= 3 && elev <= 0.45) {
    const score = 75 + waterNeighborCount * 7;
    return {
      region: r,
      score,
      siteType: 'Estuary Harbor',
      suggestedType: 'Trade Port',
      tradeGoodSuggestion: evaluateGeographicSiteCommodity('Estuary Harbor', geoCtx),
    };
  }

  // 4. Mountain Pass
  if (elev >= 0.42 && elev <= 0.68 && mountainNeighborCount >= 2 && lowNeighborCount >= 2) {
    const score = 70 + mountainNeighborCount * 8;
    return {
      region: r,
      score,
      siteType: 'Mountain Pass',
      suggestedType: 'Border Fortress',
      tradeGoodSuggestion: evaluateGeographicSiteCommodity('Mountain Pass', geoCtx),
    };
  }

  // 5. Fertile Basin
  if (moist >= 0.7 && elev >= seaLevel + 0.03 && elev <= 0.52) {
    const score = 60 + moist * 15 + (isRiver ? 18 : 0);
    return {
      region: r,
      score,
      siteType: 'Fertile Basin',
      suggestedType: 'Market Town',
      tradeGoodSuggestion: evaluateGeographicSiteCommodity('Fertile Basin', geoCtx),
    };
  }

  return {
    region: r,
    score: 40 + (1 - elev) * 20,
    siteType: 'Crossroads',
    suggestedType: 'Market Town',
    tradeGoodSuggestion: evaluateGeographicSiteCommodity('Crossroads', geoCtx),
  };
}

interface PathNode {
  region: number;
  cost: number;
  dist: number;
}

// Priority Queue for Dijkstra / A*
class MinHeap {
  private items: PathNode[] = [];

  push(node: PathNode) {
    this.items.push(node);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): PathNode | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const bottom = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = bottom;
      this.sinkDown(0);
    }
    return top;
  }

  get size(): number {
    return this.items.length;
  }

  private bubbleUp(idx: number) {
    while (idx > 0) {
      const parentIdx = (idx - 1) >> 1;
      if (this.items[idx].cost >= this.items[parentIdx].cost) break;
      const tmp = this.items[idx];
      this.items[idx] = this.items[parentIdx];
      this.items[parentIdx] = tmp;
      idx = parentIdx;
    }
  }

  private sinkDown(idx: number) {
    const len = this.items.length;
    while (true) {
      let smallest = idx;
      const left = (idx << 1) + 1;
      const right = left + 1;

      if (left < len && this.items[left].cost < this.items[smallest].cost) {
        smallest = left;
      }
      if (right < len && this.items[right].cost < this.items[smallest].cost) {
        smallest = right;
      }
      if (smallest === idx) break;

      const tmp = this.items[idx];
      this.items[idx] = this.items[smallest];
      this.items[smallest] = tmp;
      idx = smallest;
    }
  }
}

/**
 * Calculates movement cost between region u and neighbor v on the Voronoi DualMesh.
 * Supports 'overland' (strictly land), 'maritime' (strictly water), or boolean flags.
 */
function getMovementCost(
  u: number,
  v: number,
  mesh: VoronoiDualMesh,
  elevation: Float32Array,
  moisture: Float32Array,
  isRiver: boolean[],
  isCoast: boolean[],
  seaLevel: number,
  mode: 'overland' | 'maritime' | boolean = 'overland',
  existingEdges?: Set<string>
): number {
  const effectiveMode = typeof mode === 'boolean' ? (mode ? 'maritime' : 'overland') : mode;
  const { r_x, r_y } = mesh;
  const dx = r_x[v] - r_x[u];
  const dy = r_y[v] - r_y[u];
  const distance = Math.hypot(dx, dy);

  const elevU = elevation[u];
  const elevV = elevation[v];
  const isWaterU = elevU < seaLevel;
  const isWaterV = elevV < seaLevel;

  // OVERLAND MODE: Water is completely impassable; geography strongly shapes road paths
  if (effectiveMode === 'overland') {
    if (isWaterU || isWaterV) return Infinity;
    if (isCoast[u] && isCoast[v]) {
      const mx = (r_x[u] + r_x[v]) * 0.5;
      const my = (r_y[u] + r_y[v]) * 0.5;
      const midR = findClosestRegion(mx, my, mesh, elevation, seaLevel, false);
      if (elevation[midR] < seaLevel) return Infinity;
    }

    const dElev = Math.abs(elevV - elevU);
    const slope = dElev / (distance || 1.0);
    // Steep gradients heavily penalized so roads wind naturally through valleys & passes
    let slopeCost = 1.0 + 30.0 * slope * slope;

    const maxElev = Math.max(elevU, elevV);
    if (maxElev > 0.56) {
      slopeCost += 24.0 * (maxElev - 0.56);
    }
    if (maxElev > 0.70) {
      slopeCost += 95.0 * (maxElev - 0.70);
    }

    // Biome & ground conditions: avoid bogs/marshes, dense forests, and arid dunes when plains exist
    let biomeFactor = 1.0;
    const moist = (moisture[u] + moisture[v]) / 2;
    if (moist > 1.85) biomeFactor = 2.8;
    else if (moist > 1.35) biomeFactor = 1.45;
    else if (moist < 0.35) biomeFactor = 1.75;

    // Keep overland roads off riverbeds (penalize running along rivers; allow brief perpendicular bridge crossings only when needed)
    let riverFactor = 1.0;
    if (isRiver[u] && isRiver[v]) riverFactor = 4.6;
    else if (isRiver[u] !== isRiver[v]) riverFactor = 1.9;

    // Trunk-sharing discount: encourage new routes to merge onto established roadbeds
    let trunkFactor = 1.0;
    if (existingEdges) {
      const key = u < v ? `${u}-${v}` : `${v}-${u}`;
      if (existingEdges.has(key)) {
        trunkFactor = 0.45;
      }
    }

    return distance * slopeCost * biomeFactor * riverFactor * trunkFactor;
  }

  // MARITIME MODE: Land is strictly forbidden; ships navigate purely through open water
  if (effectiveMode === 'maritime') {
    if (!isWaterU || !isWaterV) {
      return Infinity; // Zero land tolerance for sea lanes
    }

    // Prefer open sea (1.0x) over shore-hugging coastal cells (1.35x) so ships swing clear of peninsulas
    const isShoreU = mesh.r_neighbors[u].some((n) => elevation[n] >= seaLevel);
    const isShoreV = mesh.r_neighbors[v].some((n) => elevation[n] >= seaLevel);
    const shorePenalty = (isShoreU || isShoreV) ? 1.35 : 1.0;
    return distance * shorePenalty;
  }

  return Infinity;
}

/**
 * A* Pathfinding between start and goal regions on the Voronoi DualMesh.
 */
function findLowestCostPath(
  startR: number,
  goalR: number,
  mesh: VoronoiDualMesh,
  elevation: Float32Array,
  moisture: Float32Array,
  isRiver: boolean[],
  isCoast: boolean[],
  seaLevel: number,
  mode: 'overland' | 'maritime' | boolean = 'overland',
  existingEdges?: Set<string>
): number[] | null {
  const { numRegions, r_x, r_y, r_neighbors } = mesh;

  const distTo = new Float32Array(numRegions).fill(Infinity);
  const cameFrom = new Int32Array(numRegions).fill(-1);
  const visited = new Uint8Array(numRegions);

  const openSet = new MinHeap();
  distTo[startR] = 0;

  // Admissible heuristic scaled by 0.45 when trunk-sharing is active so A* stays optimal
  const hScale = existingEdges && mode === 'overland' ? 0.45 : 1.0;
  const hStart = Math.hypot(r_x[goalR] - r_x[startR], r_y[goalR] - r_y[startR]) * hScale;
  openSet.push({ region: startR, cost: hStart, dist: 0 });

  while (openSet.size > 0) {
    const current = openSet.pop()!;
    const u = current.region;

    if (u === goalR) {
      const path: number[] = [];
      let curr = goalR;
      while (curr !== -1) {
        path.push(curr);
        curr = cameFrom[curr];
      }
      path.reverse();
      return path;
    }

    if (visited[u]) continue;
    visited[u] = 1;

    const neighbors = r_neighbors[u];
    for (let i = 0; i < neighbors.length; i++) {
      const v = neighbors[i];
      if (visited[v]) continue;

      const edgeCost = getMovementCost(
        u,
        v,
        mesh,
        elevation,
        moisture,
        isRiver,
        isCoast,
        seaLevel,
        mode,
        existingEdges
      );

      if (!isFinite(edgeCost)) continue;

      const newDist = distTo[u] + edgeCost;
      if (newDist < distTo[v]) {
        distTo[v] = newDist;
        cameFrom[v] = u;
        const h = Math.hypot(r_x[goalR] - r_x[v], r_y[goalR] - r_y[v]) * hScale;
        openSet.push({ region: v, cost: newDist + h, dist: newDist });
      }
    }
  }

  return null;
}

interface MeshSpatialCache {
  cols: number;
  rows: number;
  bucketSize: number;
  buckets: number[][];
}

const _meshSpatialCache = new WeakMap<VoronoiDualMesh, MeshSpatialCache>();

function getMeshSpatialCache(mesh: VoronoiDualMesh): MeshSpatialCache {
  let cached = _meshSpatialCache.get(mesh);
  if (cached) return cached;

  const bucketSize = 36;
  const cols = Math.ceil(1050 / bucketSize);
  const rows = Math.ceil(750 / bucketSize);
  const buckets: number[][] = Array.from({ length: cols * rows }, () => []);

  for (let r = 0; r < mesh.numRegions; r++) {
    const col = Math.max(0, Math.min(cols - 1, Math.floor(mesh.r_x[r] / bucketSize)));
    const row = Math.max(0, Math.min(rows - 1, Math.floor(mesh.r_y[r] / bucketSize)));
    buckets[row * cols + col].push(r);
  }

  cached = { cols, rows, bucketSize, buckets };
  _meshSpatialCache.set(mesh, cached);
  return cached;
}

/**
 * Finds the closest region on the mesh to a given coordinate (x, y) using O(1) spatial buckets
 */
function findClosestRegion(
  x: number,
  y: number,
  mesh: VoronoiDualMesh,
  elevation: Float32Array,
  seaLevel: number,
  mustBeLand = true
): number {
  const { cols, rows, bucketSize, buckets } = getMeshSpatialCache(mesh);
  const cx = Math.max(0, Math.min(cols - 1, Math.floor(x / bucketSize)));
  const cy = Math.max(0, Math.min(rows - 1, Math.floor(y / bucketSize)));

  let closest = -1;
  let minD2 = Infinity;

  for (let radius = 0; radius <= 2; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      const ry = cy + dy;
      if (ry < 0 || ry >= rows) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        if (radius > 0 && Math.abs(dx) < radius && Math.abs(dy) < radius) continue;
        const rx = cx + dx;
        if (rx < 0 || rx >= cols) continue;
        const list = buckets[ry * cols + rx];
        for (let k = 0; k < list.length; k++) {
          const r = list[k];
          if (mustBeLand && elevation[r] < seaLevel) continue;
          const ddx = mesh.r_x[r] - x;
          const ddy = mesh.r_y[r] - y;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 < minD2) {
            minD2 = d2;
            closest = r;
          }
        }
      }
    }
    if (closest !== -1 && radius >= 1) return closest;
  }

  if (closest !== -1) return closest;

  // Fallback linear scan if sparse region outside grid bounds
  let fallback = 0;
  for (let r = 0; r < mesh.numRegions; r++) {
    if (mustBeLand && elevation[r] < seaLevel) continue;
    const ddx = mesh.r_x[r] - x;
    const ddy = mesh.r_y[r] - y;
    const d2 = ddx * ddx + ddy * ddy;
    if (d2 < minD2) {
      minD2 = d2;
      fallback = r;
    }
  }
  return fallback;
}

/**
 * Checks whether a straight segment between p0 and p1 stays strictly over land regions.
 */
function isSegmentOnLand(
  p0: Point2D,
  p1: Point2D,
  mesh: VoronoiDualMesh,
  elevation: Float32Array,
  seaLevel: number
): boolean {
  const samples = [0.2, 0.35, 0.5, 0.65, 0.8];
  for (const t of samples) {
    const sx = p0.x + (p1.x - p0.x) * t;
    const sy = p0.y + (p1.y - p0.y) * t;
    const r = findClosestRegion(sx, sy, mesh, elevation, seaLevel, false);
    if (elevation[r] < seaLevel) return false;
  }
  return true;
}

/**
 * Land-safe Chaikin smoothing for overland roads:
 * Smooths corners only when every new vertex and sub-segment stays strictly on land.
 */
function smoothLandPath(
  points: Point2D[],
  mesh: VoronoiDualMesh,
  elevation: Float32Array,
  seaLevel: number,
  iterations = 2
): Point2D[] {
  if (points.length <= 2) return points;

  const isPointOnLand = (pt: Point2D): boolean => {
    const r = findClosestRegion(pt.x, pt.y, mesh, elevation, seaLevel, false);
    return elevation[r] >= seaLevel;
  };

  let current = points;
  for (let it = 0; it < iterations; it++) {
    const next: Point2D[] = [current[0]];
    for (let i = 0; i < current.length - 1; i++) {
      const p0 = current[i];
      const p1 = current[i + 1];
      const prevAdded = next[next.length - 1];

      const q = {
        x: 0.75 * p0.x + 0.25 * p1.x,
        y: 0.75 * p0.y + 0.25 * p1.y,
      };
      const r = {
        x: 0.25 * p0.x + 0.75 * p1.x,
        y: 0.25 * p0.y + 0.75 * p1.y,
      };

      if (
        isPointOnLand(q) &&
        isPointOnLand(r) &&
        isSegmentOnLand(prevAdded, q, mesh, elevation, seaLevel) &&
        isSegmentOnLand(q, r, mesh, elevation, seaLevel) &&
        isSegmentOnLand(r, p1, mesh, elevation, seaLevel)
      ) {
        next.push(q, r);
      } else {
        if (i > 0 && (prevAdded.x !== p0.x || prevAdded.y !== p0.y)) {
          next.push(p0);
        }
        if (i < current.length - 2) {
          next.push(p1);
        }
      }
    }
    const last = current[current.length - 1];
    const tail = next[next.length - 1];
    if (tail.x !== last.x || tail.y !== last.y) {
      next.push(last);
    }
    current = next;
  }
  return current.length >= 2 ? current : points;
}

/**
 * Land-safe Chaikin smoothing for maritime sea lanes:
 * Never pulls a waypoint or segment midpoint onto land terrain.
 */
function smoothWaterPath(
  points: Point2D[],
  mesh: VoronoiDualMesh,
  elevation: Float32Array,
  seaLevel: number
): Point2D[] {
  if (points.length <= 2) return points;

  const isPointInWater = (pt: Point2D): boolean => {
    const r = findClosestRegion(pt.x, pt.y, mesh, elevation, seaLevel, false);
    return elevation[r] < seaLevel;
  };

  const next: Point2D[] = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];

    const q = { x: 0.75 * p0.x + 0.25 * p1.x, y: 0.75 * p0.y + 0.25 * p1.y };
    const r = { x: 0.25 * p0.x + 0.75 * p1.x, y: 0.25 * p0.y + 0.75 * p1.y };
    const mid = { x: 0.5 * (q.x + r.x), y: 0.5 * (q.y + r.y) };

    if (isPointInWater(q) && isPointInWater(r) && isPointInWater(mid)) {
      next.push(q, r);
    } else {
      if (i > 0) next.push(p0);
    }
  }
  next.push(points[points.length - 1]);
  return next.length >= 2 ? next : points;
}

/**
 * Locates the navigable coastal water cell (harbor anchor) immediately adjacent to a coastal port.
 * Guarantees maritime pathfinding begins and remains strictly in open water (< 35px from port).
 */
function findPortWaterAnchor(
  burg: Burg,
  burgRegionMap: Map<string, number>,
  mesh: VoronoiDualMesh,
  elevation: Float32Array,
  seaLevel: number,
  isOcean?: boolean[]
): number | null {
  const { numRegions, r_x, r_y, r_neighbors } = mesh;
  const landR = burgRegionMap.get(burg.id);

  const isNavigableOcean = (r: number) =>
    isOcean ? Boolean(isOcean[r]) : elevation[r] < seaLevel;
  const hasWaterChannel = (r: number) =>
    isNavigableOcean(r) && r_neighbors[r].some((n) => isNavigableOcean(n));

  if (landR !== undefined) {
    if (hasWaterChannel(landR)) return landR;

    // 1. Direct adjacent water neighbor (strictly immediate harbor shore)
    let bestWater = -1;
    let minD = Infinity;
    for (const n of r_neighbors[landR]) {
      if (hasWaterChannel(n)) {
        const d = Math.hypot(r_x[n] - burg.x, r_y[n] - burg.y);
        if (d < minD && d < 35) {
          minD = d;
          bestWater = n;
        }
      }
    }
    if (bestWater !== -1) return bestWater;

    // 2. Secondary immediate coastal neighbor only if within 32px
    for (const n of r_neighbors[landR]) {
      for (const n2 of r_neighbors[n]) {
        if (hasWaterChannel(n2)) {
          const d = Math.hypot(r_x[n2] - burg.x, r_y[n2] - burg.y);
          if (d < minD && d < 32) {
            minD = d;
            bestWater = n2;
          }
        }
      }
    }
    if (bestWater !== -1) return bestWater;
  }

  // 3. Fallback: Closest coastal water cell within strict harbor distance (< 32px)
  let nearestWater = -1;
  let minD = Infinity;
  for (let r = 0; r < numRegions; r++) {
    if (hasWaterChannel(r)) {
      const d = Math.hypot(r_x[r] - burg.x, r_y[r] - burg.y);
      if (d < minD && d < 32) {
        minD = d;
        nearestWater = r;
      }
    }
  }

  return nearestWater !== -1 ? nearestWater : null;
}

export function generateTradeNetwork(
  mesh: VoronoiDualMesh,
  sim: TerrainSimulationResult,
  burgs: Burg[],
  realms: Realm[],
  seaLevel: number,
  prng: PRNG,
  options?: { scope?: 'all' | 'overland' | 'maritime'; skipSpawnBurgs?: boolean }
): TradeNetwork {
  const scope = options?.scope || 'all';
  const includeOverland = scope === 'all' || scope === 'overland';
  const includeMaritime = scope === 'all' || scope === 'maritime';
  const skipSpawnBurgs = Boolean(options?.skipSpawnBurgs);
  const r_elevation = sim.elevation;
  const r_moisture = sim.rainfall;
  const r_river = sim.isRiver;
  const r_coast = sim.isCoast;
  const { r_x, r_y } = mesh;

  // Map each burg to its corresponding mesh region
  const burgRegionMap = new Map<string, number>();
  for (const b of burgs) {
    const r = findClosestRegion(b.x, b.y, mesh, r_elevation, seaLevel, true);
    burgRegionMap.set(b.id, r);
  }

  const edgeTraffic = new Map<string, number>();
  const cellTrafficVolume = new Float32Array(mesh.numRegions);
  const rawRoutes: {
    fromBurg: Burg;
    toBurg: Burg;
    regions: number[];
    isMaritime: boolean;
    isTrunk?: boolean;
  }[] = [];

  const existingOverlandEdges = new Set<string>();
  const recordEdge = (r1: number, r2: number, isOverland = true) => {
    const key = r1 < r2 ? `${r1}-${r2}` : `${r2}-${r1}`;
    edgeTraffic.set(key, (edgeTraffic.get(key) || 0) + 1);
    if (isOverland) existingOverlandEdges.add(key);
    cellTrafficVolume[r1] += 1;
    cellTrafficVolume[r2] += 1;
  };

  // =========================================================================
  // 1. INTER-CAPITAL IMPERIAL HIGH ROADS (Clean MST backbone + strategic loops per landmass)
  // =========================================================================
  const capitalBurgs = includeOverland
    ? (realms
        .map((r) => burgs.find((b) => b.id === r.capitalBurgId))
        .filter(Boolean) as Burg[])
    : [];

  const capitalConnections = new Map<string, Set<string>>();
  for (const c of capitalBurgs) capitalConnections.set(c.id, new Set<string>());

  // Build candidate capital pairs sorted by distance (MST first, then 1 strategic secondary link)
  const capitalPairs: { bA: Burg; bB: Burg; dist: number }[] = [];
  for (let i = 0; i < capitalBurgs.length; i++) {
    for (let j = i + 1; j < capitalBurgs.length; j++) {
      capitalPairs.push({
        bA: capitalBurgs[i],
        bB: capitalBurgs[j],
        dist: Math.hypot(capitalBurgs[j].x - capitalBurgs[i].x, capitalBurgs[j].y - capitalBurgs[i].y),
      });
    }
  }
  capitalPairs.sort((a, b) => a.dist - b.dist);

  // Disjoint-set union to form a clean continental Minimum Spanning Tree of Imperial Highways
  const ufParent = new Map<string, string>();
  for (const c of capitalBurgs) ufParent.set(c.id, c.id);
  const ufFind = (id: string): string => {
    let curr = id;
    while (ufParent.get(curr) !== curr) curr = ufParent.get(curr)!;
    ufParent.set(id, curr);
    return curr;
  };

  const deferredLoopPairs: { bA: Burg; bB: Burg; dist: number }[] = [];

  for (const pair of capitalPairs) {
    const { bA, bB } = pair;
    const rA = burgRegionMap.get(bA.id)!;
    const rB = burgRegionMap.get(bB.id)!;

    if (ufFind(bA.id) !== ufFind(bB.id)) {
      const path = findLowestCostPath(
        rA, rB, mesh, r_elevation, r_moisture, r_river, r_coast, seaLevel, 'overland', existingOverlandEdges
      );
      if (path && path.length > 1) {
        for (let k = 0; k < path.length - 1; k++) {
          recordEdge(path[k], path[k + 1], true);
        }
        rawRoutes.push({ fromBurg: bA, toBurg: bB, regions: path, isMaritime: false, isTrunk: true });
        capitalConnections.get(bA.id)!.add(bB.id);
        capitalConnections.get(bB.id)!.add(bA.id);
        ufParent.set(ufFind(bA.id), ufFind(bB.id));
      }
    } else {
      deferredLoopPairs.push(pair);
    }
  }

  // 1B. Add a small number of strategic secondary trunk loops (max degree 3 per capital)
  let secondaryTrunkLoops = 0;
  for (const { bA, bB, dist } of deferredLoopPairs) {
    if (secondaryTrunkLoops >= Math.max(2, Math.floor(capitalBurgs.length * 0.45))) break;
    if (dist > 480) continue;
    if ((capitalConnections.get(bA.id)?.size || 0) >= 3) continue;
    if ((capitalConnections.get(bB.id)?.size || 0) >= 3) continue;

    const rA = burgRegionMap.get(bA.id)!;
    const rB = burgRegionMap.get(bB.id)!;
    const path = findLowestCostPath(
      rA, rB, mesh, r_elevation, r_moisture, r_river, r_coast, seaLevel, 'overland', existingOverlandEdges
    );
    if (path && path.length > 1) {
      for (let k = 0; k < path.length - 1; k++) {
        recordEdge(path[k], path[k + 1], true);
      }
      rawRoutes.push({ fromBurg: bA, toBurg: bB, regions: path, isMaritime: false, isTrunk: true });
      capitalConnections.get(bA.id)!.add(bB.id);
      capitalConnections.get(bB.id)!.add(bA.id);
      secondaryTrunkLoops++;
    }
  }

  // =========================================================================
  // 2. INTRA-REALM FEUDAL ROUTES (Connect subordinate burgs to Capital or same-island Port)
  // =========================================================================
  if (includeOverland) {
    for (const realm of realms) {
      const capBurg = burgs.find((b) => b.id === realm.capitalBurgId);
      if (!capBurg) continue;
      const capR = burgRegionMap.get(capBurg.id)!;

    const subordinateBurgs = burgs
      .filter((b) => b.stateId === realm.id && b.id !== capBurg.id)
      .sort((a, b) => Math.hypot(a.x - capBurg.x, a.y - capBurg.y) - Math.hypot(b.x - capBurg.x, b.y - capBurg.y));

    for (const b of subordinateBurgs) {
      const bR = burgRegionMap.get(b.id)!;
      let path = findLowestCostPath(
        capR, bR, mesh, r_elevation, r_moisture, r_river, r_coast, seaLevel, 'overland', existingOverlandEdges
      );
      let routeFrom: Burg = capBurg;
      let routeTo: Burg = b;

      // If no overland path exists (b is on an island/separate landmass), connect b ONLY to a local port on the SAME island
      if (!path) {
        const localPorts = burgs.filter(
          (p) => p.id !== b.id && (p.type === 'Trade Port' || p.type === 'Fishing Port' || sim.isCoast[burgRegionMap.get(p.id)!])
        );
        const sortedPorts = localPorts
          .map((p) => ({ port: p, dist: Math.hypot(p.x - b.x, p.y - b.y) }))
          .sort((a, b) => a.dist - b.dist);

        for (const { port: pPort } of sortedPorts.slice(0, 4)) {
          const pR = burgRegionMap.get(pPort.id)!;
          const islandPath = findLowestCostPath(
            bR, pR, mesh, r_elevation, r_moisture, r_river, r_coast, seaLevel, 'overland', existingOverlandEdges
          );
          if (islandPath && islandPath.length > 1) {
            // Avoid duplicate island link if already connected in either direction
            const dup = rawRoutes.some(
              (rr) =>
                !rr.isMaritime &&
                ((rr.fromBurg.id === b.id && rr.toBurg.id === pPort.id) ||
                  (rr.fromBurg.id === pPort.id && rr.toBurg.id === b.id))
            );
            if (!dup) {
              path = islandPath;
              routeFrom = b;
              routeTo = pPort;
            }
            break;
          }
        }
      }

      if (path && path.length > 1) {
        for (let k = 0; k < path.length - 1; k++) {
          recordEdge(path[k], path[k + 1], true);
        }
        const isMajorFeeder =
          routeFrom.isCapital &&
          (routeTo.type === 'Trade Port' || routeTo.type === 'Royal Metropolis');
        rawRoutes.push({
          fromBurg: routeFrom,
          toBurg: routeTo,
          regions: path,
          isMaritime: false,
          isTrunk: isMajorFeeder,
        });
      }
    }
    }
  }

  // =========================================================================
  // 3. GENERATE SETTLEMENTS FROM TRADE FLOWS (Runs BEFORE sea lanes)
  // =========================================================================
  const townNames = [
    'Stoneford Market', 'Aldermere', 'Barrow Crossing', 'Highcross', 'Kingsford',
    'Riverwatch Town', 'Millhaven', 'Fairview Fair', 'Oxenford', 'Goldenhill Market'
  ];
  const portNames = [
    'Saltshore Harbor', 'Seawatch Haven', 'Gull Point', 'Pelican Cove', 'Driftwood Port',
    'Anchor Bay', 'Tidefall Port', 'Coral Harbor'
  ];
  const villageNames = [
    'Greenvale Village', 'Oakhaven Village', 'Wheatfield', 'Willowbrook', 'Appledore',
    'Sunhollow', 'Birchwood', 'Honeycreek', 'Riverbend', 'Foxgrove'
  ];
  const hamletNames = [
    'Ironcrest Hamlet', 'Cloudpeak Post', 'Frosthollow', 'Eagle Crag', 'Pinepass',
    'Windy Gap', 'Stonehearth'
  ];

  let nextBurgId = burgs.length + 1;
  const existingCoords = burgs.map((b) => ({ x: b.x, y: b.y }));

  const isFarEnough = (x: number, y: number, minDistance: number, majorMinDistance = minDistance) => {
    return burgs.every((b) => {
      const dist = Math.hypot(b.x - x, b.y - y);
      const isMajor =
        b.isCapital ||
        b.type === 'Royal Metropolis' ||
        b.type === 'Trade Port' ||
        b.type === 'Market Town' ||
        b.type === 'Border Fortress';
      return dist >= (isMajor ? majorMinDistance : minDistance);
    });
  };

  const candidateRegions: number[] = [];
  for (let r = 0; r < mesh.numRegions; r++) {
    if (r_elevation[r] >= seaLevel && cellTrafficVolume[r] > 0) {
      candidateRegions.push(r);
    }
  }
  candidateRegions.sort((a, b) => cellTrafficVolume[b] - cellTrafficVolume[a]);

  for (const r of candidateRegions) {
    if (!includeOverland || skipSpawnBurgs) break;
    if (burgs.length >= 34) break;
    const x = r_x[r];
    const y = r_y[r];
    const traffic = cellTrafficVolume[r];
    const isCoast = r_coast[r];
    const isRiver = r_river[r];
    const elev = r_elevation[r];
    const cellGeoCtx = {
      biome: sim.biomes[r],
      elevation: elev,
      temperature: sim.temperature[r],
      moisture: r_moisture[r],
      isCoast,
      isRiver,
      reliefType: sim.reliefType[r],
    };

    let closestBurg = burgs[0];
    let minD = Infinity;
    for (const b of burgs) {
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < minD) { minD = d; closestBurg = b; }
    }

    // A. Major Crossroads Junction -> Market Town (kept clearly apart from major cities)
    if (traffic >= 2 && elev < 0.60 && isFarEnough(x, y, 54, 68)) {
      const name = townNames.shift() || `Market of ${closestBurg.name}`;
      const siteType: Burg['settlementSite'] = isRiver ? 'River Confluence' : 'Crossroads';
      const exportsList = deriveRealisticBurgExports('Market Town', siteType, cellGeoCtx, prng);
      const importsList = deriveRealisticBurgImports(exportsList, cellGeoCtx, 'Market Town');
      const newBurg: Burg = {
        id: `burg_${nextBurgId++}`,
        name,
        x,
        y,
        cellIndex: r,
        stateId: closestBurg.stateId,
        countyId: closestBurg.countyId,
        isCapital: false,
        type: 'Market Town',
        tier: 'town',
        tradeGood: exportsList[0],
        culture: closestBurg.culture,
        lore: `Flourishing market crossroad founded in ${sim.biomes[r]} terrain at the convergence of commercial travel corridors.`,
        settlementSite: siteType,
        population: prng.range(6800, 13500),
        developmentLevel: prng.range(35, 65),
        buildings: ['slot_keep_1', 'slot_walls_1', 'slot_guildhall_1'],
        exports: exportsList,
        imports: importsList,
        garrisonCount: 220,
        garrisonMax: 300,
        garrisonUpkeepGold: 1.1,
        garrisonUpkeepFood: 1.3,
        levyPool: 300,
        leviesRaised: false,
      };
      burgs.push(newBurg);
      existingCoords.push({ x, y });
      burgRegionMap.set(newBurg.id, r);
    }
    // B. Coastal Terminus with Traffic -> Trade Port or Fishing Port
    else if (isCoast && traffic >= 1 && isFarEnough(x, y, 48, 66)) {
      const name = portNames.shift() || `Haven of ${closestBurg.name}`;
      const isMajorPort = traffic >= 2 || isRiver;
      const portType: Burg['type'] = isMajorPort ? 'Trade Port' : 'Fishing Port';
      const exportsList = deriveRealisticBurgExports(portType, 'Estuary Harbor', cellGeoCtx, prng);
      const importsList = deriveRealisticBurgImports(exportsList, cellGeoCtx, portType);
      const newBurg: Burg = {
        id: `burg_${nextBurgId++}`,
        name,
        x,
        y,
        cellIndex: r,
        population: isMajorPort ? prng.range(12500, 22000) : prng.range(3000, 5600),
        stateId: closestBurg.stateId,
        countyId: closestBurg.countyId,
        isCapital: false,
        type: portType,
        tier: 'port',
        tradeGood: exportsList[0],
        culture: closestBurg.culture,
        lore: `Bustling coastal harbor along ${sim.biomes[r]} shores where overland routes meet maritime channels.`,
        settlementSite: 'Estuary Harbor',
        developmentLevel: prng.range(40, 75),
        buildings: ['slot_keep_1', 'slot_walls_1', 'slot_guildhall_1'],
        exports: exportsList,
        imports: importsList,
        garrisonCount: 280,
        garrisonMax: 400,
        garrisonUpkeepGold: 1.4,
        garrisonUpkeepFood: 1.6,
        levyPool: 380,
        leviesRaised: false,
      };
      burgs.push(newBurg);
      existingCoords.push({ x, y });
      burgRegionMap.set(newBurg.id, r);
    }
    // C. High Mountain Pass Bottleneck -> Mountain Hamlet
    else if (elev >= 0.52 && traffic >= 1 && isFarEnough(x, y, 38, 48)) {
      const name = hamletNames.shift() || `Pass of ${closestBurg.name}`;
      const exportsList = deriveRealisticBurgExports('Mountain Hamlet', 'Mountain Pass', cellGeoCtx, prng);
      const importsList = deriveRealisticBurgImports(exportsList, cellGeoCtx, 'Mountain Hamlet');
      const newBurg: Burg = {
        id: `burg_${nextBurgId++}`,
        name,
        x,
        y,
        cellIndex: r,
        population: prng.range(900, 1900),
        stateId: closestBurg.stateId,
        countyId: closestBurg.countyId,
        isCapital: false,
        type: 'Mountain Hamlet',
        tier: 'hamlet',
        tradeGood: exportsList[0],
        culture: closestBurg.culture,
        lore: `Alpine outpost shielding traveler caravans along ${sim.biomes[r]} passes.`,
        settlementSite: 'Mountain Pass',
        developmentLevel: prng.range(25, 45),
        buildings: ['slot_keep_1', 'slot_walls_1'],
        exports: exportsList,
        imports: importsList,
        garrisonCount: 160,
        garrisonMax: 240,
        garrisonUpkeepGold: 0.8,
        garrisonUpkeepFood: 0.9,
        levyPool: 120,
        leviesRaised: false,
      };
      burgs.push(newBurg);
      existingCoords.push({ x, y });
      burgRegionMap.set(newBurg.id, r);
    }
    // D. Agricultural Corridor Village
    else if (traffic >= 1 && elev < 0.50 && isFarEnough(x, y, 38, 48)) {
      const name = villageNames.shift() || `Village of ${closestBurg.name}`;
      const exportsList = deriveRealisticBurgExports('Farming Village', 'Fertile Basin', cellGeoCtx, prng);
      const importsList = deriveRealisticBurgImports(exportsList, cellGeoCtx, 'Farming Village');
      const newBurg: Burg = {
        id: `burg_${nextBurgId++}`,
        name,
        x,
        y,
        cellIndex: r,
        population: prng.range(1500, 3400),
        stateId: closestBurg.stateId,
        countyId: closestBurg.countyId,
        isCapital: false,
        type: 'Farming Village',
        tier: 'village',
        tradeGood: exportsList[0],
        culture: closestBurg.culture,
        lore: `Prosperous ${sim.biomes[r].toLowerCase()} settlement providing local produce and inns to passing traders.`,
        settlementSite: 'Fertile Basin',
        developmentLevel: prng.range(22, 48),
        buildings: ['slot_mill_1', 'slot_walls_1'],
        exports: exportsList,
        imports: importsList,
        garrisonCount: 100,
        garrisonMax: 150,
        garrisonUpkeepGold: 0.5,
        garrisonUpkeepFood: 0.6,
        levyPool: 180,
        leviesRaised: false,
      };
      burgs.push(newBurg);
      existingCoords.push({ x, y });
      burgRegionMap.set(newBurg.id, r);
    }
  }

  // =========================================================================
  // 4. INTERCONNECTED MARITIME SEA LANE NETWORK
  // Combines coastal cabotage, cross-strait crossings, and trans-oceanic routes
  // =========================================================================
  const portBurgs = includeMaritime
    ? burgs.filter((b) => {
        if (b.type === 'Trade Port' || b.type === 'Fishing Port') return true;
        if (b.settlementSite === 'Estuary Harbor') return true;
        const r = burgRegionMap.get(b.id);
        if (r !== undefined && sim.isCoast[r]) return true;
        return false;
      })
    : [];

  const portAnchorMap = new Map<string, number>();
  for (const p of portBurgs) {
    const anchor = findPortWaterAnchor(p, burgRegionMap, mesh, r_elevation, seaLevel, sim.isOcean);
    if (anchor !== null) {
      portAnchorMap.set(p.id, anchor);
    }
  }

  const activePorts = portBurgs.filter((p) => portAnchorMap.has(p.id));
  const portConnections = new Map<string, Set<string>>();
  for (const p of activePorts) portConnections.set(p.id, new Set<string>());

  // 4A. Regional Coastal & Mid-Sea Routes
  for (let i = 0; i < activePorts.length; i++) {
    const pA = activePorts[i];
    const anchorA = portAnchorMap.get(pA.id)!;

    const candidateTargets = activePorts
      .filter((pB) => pB.id !== pA.id && !portConnections.get(pA.id)!.has(pB.id))
      .map((pB) => ({
        port: pB,
        dist: Math.hypot(pB.x - pA.x, pB.y - pA.y),
      }))
      .sort((a, b) => a.dist - b.dist);

    const closeTargets = candidateTargets
      .filter((t) => t.dist <= 210)
      .slice(0, 2);

    const midTargets = candidateTargets
      .filter((t) => t.dist > 210 && t.dist <= 450)
      .slice(0, 2);

    const selectedTargets = [...closeTargets, ...midTargets];

    for (const { port: pB } of selectedTargets) {
      if ((portConnections.get(pA.id)?.size || 0) >= 4) break;
      if ((portConnections.get(pB.id)?.size || 0) >= 4) continue;

      const anchorB = portAnchorMap.get(pB.id)!;

      const waterPath = findLowestCostPath(
        anchorA,
        anchorB,
        mesh,
        r_elevation,
        r_moisture,
        r_river,
        r_coast,
        seaLevel,
        'maritime'
      );

      if (waterPath && waterPath.length >= 2) {
        for (let k = 0; k < waterPath.length - 1; k++) {
          recordEdge(waterPath[k], waterPath[k + 1], false);
        }

        rawRoutes.push({
          fromBurg: pA,
          toBurg: pB,
          regions: waterPath,
          isMaritime: true,
        });

        portConnections.get(pA.id)!.add(pB.id);
        portConnections.get(pB.id)!.add(pA.id);
      }
    }
  }

  // 4B. Grand Trans-Oceanic Shipping Lanes (Long-haul crossings across the open ocean)
  const transOceanicPairs: { pA: Burg; pB: Burg; dist: number }[] = [];
  for (let i = 0; i < activePorts.length; i++) {
    for (let j = i + 1; j < activePorts.length; j++) {
      const pA = activePorts[i];
      const pB = activePorts[j];
      if (portConnections.get(pA.id)?.has(pB.id)) continue;
      const dist = Math.hypot(pB.x - pA.x, pB.y - pA.y);
      if (dist >= 320) {
        transOceanicPairs.push({ pA, pB, dist });
      }
    }
  }
  transOceanicPairs.sort((a, b) => b.dist - a.dist);

  let transOceanicAdded = 0;
  for (const { pA, pB } of transOceanicPairs) {
    if (transOceanicAdded >= 8) break;
    if ((portConnections.get(pA.id)?.size || 0) >= 6) continue;
    if ((portConnections.get(pB.id)?.size || 0) >= 6) continue;

    const anchorA = portAnchorMap.get(pA.id)!;
    const anchorB = portAnchorMap.get(pB.id)!;

    const waterPath = findLowestCostPath(
      anchorA,
      anchorB,
      mesh,
      r_elevation,
      r_moisture,
      r_river,
      r_coast,
      seaLevel,
      'maritime'
    );

    if (waterPath && waterPath.length >= 2) {
      for (let k = 0; k < waterPath.length - 1; k++) {
        recordEdge(waterPath[k], waterPath[k + 1], false);
      }

      rawRoutes.push({
        fromBurg: pA,
        toBurg: pB,
        regions: waterPath,
        isMaritime: true,
      });

      portConnections.get(pA.id)!.add(pB.id);
      portConnections.get(pB.id)!.add(pA.id);
      transOceanicAdded++;
    }
  }

  // =========================================================================
  // 5. LOCAL REGIONAL & MARKET ROUTES (< 95px within same realm)
  // =========================================================================
  if (includeOverland) {
    for (let i = 0; i < burgs.length; i++) {
      const bA = burgs[i];
      const rA = burgRegionMap.get(bA.id);
      if (rA === undefined) continue;

    const localNeighbors = burgs
      .filter((bB) => bB.id !== bA.id && bB.stateId === bA.stateId)
      .map((bB) => ({ burg: bB, dist: Math.hypot(bB.x - bA.x, bB.y - bA.y) }))
      .filter(({ dist }) => dist < 95)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 1);

    for (const { burg: bB } of localNeighbors) {
      const rB = burgRegionMap.get(bB.id);
      if (rB === undefined) continue;

      const alreadyConnected = rawRoutes.some(
        (rr) =>
          (rr.fromBurg.id === bA.id && rr.toBurg.id === bB.id) ||
          (rr.fromBurg.id === bB.id && rr.toBurg.id === bA.id)
      );
      if (alreadyConnected) continue;

      const path = findLowestCostPath(
        rA, rB, mesh, r_elevation, r_moisture, r_river, r_coast, seaLevel, 'overland', existingOverlandEdges
      );

      if (path && path.length > 1) {
        for (let k = 0; k < path.length - 1; k++) {
          recordEdge(path[k], path[k + 1], true);
        }
        rawRoutes.push({ fromBurg: bA, toBurg: bB, regions: path, isMaritime: false, isTrunk: false });
      }
    }
    }
  }

  // =========================================================================
  // 6. CONSTRUCT FINAL TRADE ROUTES
  // =========================================================================
  const routes: TradeRoute[] = [];
  const routeCommodities = [
    'Steel Arms & Armor', 'Silk', 'Wine',
    'Silver', 'Spices', 'Dried Fish',
    'Timber', 'Grain',
  ];

  rawRoutes.forEach((rr, idx) => {
    let totalTraffic = 0;
    let maxSlope = 0;
    let riverCount = 0;

    for (let k = 0; k < rr.regions.length - 1; k++) {
      const r1 = rr.regions[k];
      const r2 = rr.regions[k + 1];
      const key = r1 < r2 ? `${r1}-${r2}` : `${r2}-${r1}`;
      totalTraffic += edgeTraffic.get(key) || 1;

      const dH = Math.abs(r_elevation[r2] - r_elevation[r1]);
      const dD = Math.hypot(r_x[r2] - r_x[r1], r_y[r2] - r_y[r1]);
      const s = dH / (dD || 1);
      if (s > maxSlope) maxSlope = s;
      if (r_river[r1] && r_river[r2]) riverCount++;
    }

    const avgTraffic = Math.max(1, Math.round(totalTraffic / (rr.regions.length - 1 || 1)));

    let type: RouteClassification = 'Merchant Road';

    // Define what constitutes a major economic hub
    const isMajorHubA = rr.fromBurg.isCapital || rr.fromBurg.type === 'Trade Port' || rr.fromBurg.type === 'Royal Metropolis';
    const isMajorHubB = rr.toBurg.isCapital || rr.toBurg.type === 'Trade Port' || rr.toBurg.type === 'Royal Metropolis';

    // Imperial Highways are primary trunk corridors between capitals & major hubs
    const isImperialHighway = Boolean(rr.isTrunk) || (isMajorHubA && isMajorHubB);

    // ORDER OF PRIORITY MATTERS HERE:
    if (rr.isMaritime) {
      type = 'Maritime Sea Lane';
    } else if (isImperialHighway) {
      type = 'Imperial Highway';
    } else if (riverCount > rr.regions.length * 0.45) {
      type = 'River Barge Route';
    } else if (maxSlope > 0.035 || rr.regions.some((r) => r_elevation[r] > 0.65)) {
      type = 'Mountain Pass';
    } else {
      type = 'Merchant Road';
    }
    // Maritime routes stay strictly in water regions (never snap endpoints onto inland town centers)
    let rawPoints: Point2D[];
    if (rr.isMaritime) {
      rawPoints = rr.regions.map((r) => ({ x: r_x[r], y: r_y[r] }));
    } else {
      const regionPts = rr.regions.map((r) => ({ x: r_x[r], y: r_y[r] }));
      const startPt = { x: rr.fromBurg.x, y: rr.fromBurg.y };
      const endPt = { x: rr.toBurg.x, y: rr.toBurg.y };
      rawPoints = [...regionPts];
      if (regionPts.length > 0 && isSegmentOnLand(startPt, regionPts[0], mesh, r_elevation, seaLevel)) {
        rawPoints.unshift(startPt);
      }
      if (regionPts.length > 0 && isSegmentOnLand(regionPts[regionPts.length - 1], endPt, mesh, r_elevation, seaLevel)) {
        rawPoints.push(endPt);
      }
    }

    const smoothed = rr.isMaritime
      ? smoothWaterPath(rawPoints, mesh, r_elevation, seaLevel)
      : smoothLandPath(rawPoints, mesh, r_elevation, seaLevel, 2);

    let totalDist = 0;
    for (let k = 0; k < smoothed.length - 1; k++) {
      totalDist += Math.hypot(smoothed[k + 1].x - smoothed[k].x, smoothed[k + 1].y - smoothed[k].y);
    }
    const distanceKm = Math.round(totalDist * 2.4);

    routes.push({
      id: `route_${idx}_${rr.fromBurg.id}_${rr.toBurg.id}`,
      fromBurgId: rr.fromBurg.id,
      toBurgId: rr.toBurg.id,
      fromBurgName: rr.fromBurg.name,
      toBurgName: rr.toBurg.name,
      type,
      pathPoints: smoothed,
      distanceKm,
      trafficVolume: avgTraffic,
      primaryGood: rr.fromBurg.tradeGood || prng.pick(routeCommodities),
      isMaritime: rr.isMaritime,
    });
  });

  // 7. Aggregate Trade Hub statistics
  const tradeHubs = burgs.map((burg) => {
    const connected = routes.filter((r) => r.fromBurgId === burg.id || r.toBurgId === burg.id);
    const volume = connected.reduce((acc, r) => acc + r.trafficVolume, 0) || Math.max(1, cellTrafficVolume[burgRegionMap.get(burg.id) || 0]);
    const exports = Array.from(new Set(connected.map((r) => r.primaryGood))).slice(0, 3);

    return {
      burgId: burg.id,
      name: burg.name,
      connectedRoutesCount: connected.length,
      totalTradeVolume: volume,
      primaryExports: exports.length > 0 ? exports : [burg.tradeGood],
    };
  }).sort((a, b) => b.totalTradeVolume - a.totalTradeVolume);

  // 8. Natural Hierarchical & Geographic Population Scaling
  for (const burg of burgs) {
    const hub = tradeHubs.find((h) => h.burgId === burg.id);
    const volume = hub ? hub.totalTradeVolume : 1;
    const conn = hub ? hub.connectedRoutesCount : 1;
    burg.connectedRouteCount = conn;
    burg.tradeVolume = volume;

    const rIdx = burgRegionMap.get(burg.id) ?? 0;
    const elev = r_elevation[rIdx] ?? 0.38;
    const moist = r_moisture[rIdx] ?? 0.6;
    const isRiv = r_river[rIdx];
    const isCst = r_coast[rIdx];

    // Geographic fertility multiplier (0.72 in harsh peaks/arid steppes to 1.28 in fertile river estuaries)
    let geoFactor = 1.0;
    if (isRiv) geoFactor += 0.14;
    if (isCst) geoFactor += 0.10;
    if (moist > 0.7) geoFactor += 0.06;
    else if (moist < 0.3) geoFactor -= 0.14;
    if (elev > 0.60) geoFactor -= 0.18;

    // Organic variance so settlements don't look clone-stamped
    const organicNoise = 0.86 + prng.next() * 0.28;
    const flowLift = Math.sqrt(Math.max(1, volume)) * 0.14 + Math.min(6, conn) * 0.05;

    if (burg.isCapital) {
      burg.tier = 'citadel';
      burg.population = Math.round(
        (62000 + Math.min(58000, flowLift * 18000)) * geoFactor * organicNoise
      );
    } else if (burg.type === 'Royal Metropolis') {
      burg.tier = 'metropolis';
      burg.population = Math.round(
        (32000 + Math.min(30000, flowLift * 10000)) * geoFactor * organicNoise
      );
    } else if (burg.type === 'Trade Port') {
      burg.tier = 'port';
      burg.population = Math.round(
        (18500 + Math.min(22000, flowLift * 7000)) * geoFactor * organicNoise
      );
    } else if (burg.type === 'Market Town') {
      burg.tier = 'town';
      burg.population = Math.round(
        (9500 + Math.min(11500, flowLift * 3600)) * geoFactor * organicNoise
      );
    } else if (burg.type === 'Fishing Port') {
      burg.tier = 'port';
      burg.population = Math.round(
        (4200 + Math.min(4800, flowLift * 1500)) * geoFactor * organicNoise
      );
    } else if (burg.type === 'Border Fortress') {
      burg.tier = 'hamlet';
      burg.population = Math.round(
        (3600 + Math.min(4000, flowLift * 1300)) * geoFactor * organicNoise
      );
    } else if (burg.type === 'Ancient Sanctuary') {
      burg.tier = 'village';
      burg.population = Math.round(
        (2800 + Math.min(3200, flowLift * 1100)) * geoFactor * organicNoise
      );
    } else if (burg.type === 'Farming Village') {
      burg.tier = 'village';
      burg.population = Math.round(
        (2400 + Math.min(2800, flowLift * 950)) * geoFactor * organicNoise
      );
    } else if (burg.type === 'Mountain Hamlet') {
      burg.tier = 'hamlet';
      burg.population = Math.round(
        (1150 + Math.min(1550, flowLift * 550)) * geoFactor * organicNoise
      );
    } else {
      burg.tier = 'village';
      burg.population = Math.round((2500 + Math.min(2800, flowLift * 900)) * geoFactor * organicNoise);
    }

    burg.population = Math.max(950, burg.population);
    burg.levyPool = Math.max(40, Math.round(burg.population * 0.042));
  }

  // 9. Regional Population Density (balanced medieval rural souls/km²)
  const cellPopulationDensity = new Float32Array(mesh.numRegions);
  for (let r = 0; r < mesh.numRegions; r++) {
    if (r_elevation[r] < seaLevel) {
      cellPopulationDensity[r] = 0;
      continue;
    }
    let base = 52;
    const elev = r_elevation[r];
    const moist = r_moisture[r];
    if (elev > 0.65) base = 12;
    else if (elev > 0.50) base = 30;
    else if (moist < 0.25) base = 16;
    else if (moist > 0.7) base = 68;

    if (r_river[r]) base += 42;
    if (r_coast[r]) base += 30;
    const movementBonus = Math.min(54, (cellTrafficVolume[r] || 0) * 6.5);
    cellPopulationDensity[r] = Math.round(base + movementBonus);
  }

  const smoothedDensity = new Float32Array(cellPopulationDensity);
  for (let r = 0; r < mesh.numRegions; r++) {
    if (r_elevation[r] < seaLevel) continue;
    const nbrs = mesh.r_neighbors[r] || [];
    let sum = cellPopulationDensity[r];
    let count = 1;
    for (const n of nbrs) {
      if (r_elevation[n] >= seaLevel) {
        sum += cellPopulationDensity[n];
        count++;
      }
    }
    smoothedDensity[r] = Math.round(sum / count);
  }

  // =========================================================================
  // 10. POPULATE ACTIVE CARAVANS & TRANS-OCEANIC SHIPS (~56-60 total)
  // =========================================================================
  const caravans: TraderCaravan[] = [];
  const capitalIds = new Set(burgs.filter((b) => b.isCapital).map((b) => b.id));

  const allOverland = routes.filter((r) => !r.isMaritime);

  // 1. Prioritize Imperial Highways and routes linked to Royal Capitals
  const highways = allOverland
    .filter((r) => r.type === 'Imperial Highway' || capitalIds.has(r.fromBurgId) || capitalIds.has(r.toBurgId) || (r.trafficVolume || 0) >= 3)
    .sort((a, b) => {
      const aCap = capitalIds.has(a.fromBurgId) || capitalIds.has(a.toBurgId) ? 1 : 0;
      const bCap = capitalIds.has(b.fromBurgId) || capitalIds.has(b.toBurgId) ? 1 : 0;
      if (bCap !== aCap) return bCap - aCap;
      return (b.distanceKm || 0) - (a.distanceKm || 0);
    });

  // 2. Shuffle regional roads so they distribute evenly across the continent
  const regionalRoads = allOverland.filter((r) => !highways.includes(r));
  for (let i = regionalRoads.length - 1; i > 0; i--) {
    const j = Math.floor(prng.next() * (i + 1));
    [regionalRoads[i], regionalRoads[j]] = [regionalRoads[j], regionalRoads[i]];
  }

  // Target ~40 overland caravans; include inbound and outbound convoys along capital arteries
  const selectedOverland: TradeRoute[] = [...highways, ...regionalRoads].slice(0, 40);
  if (selectedOverland.length < 40 && highways.length > 0) {
    let idx = 0;
    while (selectedOverland.length < 40 && idx < highways.length * 2) {
      selectedOverland.push(highways[idx % highways.length]);
      idx++;
    }
  }

  // Target ~18 maritime ships; prioritize longest trans-oceanic crossings first
  const allMaritime = routes
    .filter((r) => r.isMaritime && r.type === 'Maritime Sea Lane')
    .sort((a, b) => (b.distanceKm || 0) - (a.distanceKm || 0));

  const selectedMaritime: TradeRoute[] = [...allMaritime].slice(0, 18);
  if (selectedMaritime.length < 18 && allMaritime.length > 0) {
    let idx = 0;
    while (selectedMaritime.length < 18 && idx < allMaritime.length * 2) {
      selectedMaritime.push(allMaritime[idx % allMaritime.length]);
      idx++;
    }
  }

  const activeRoutes = [...selectedOverland, ...selectedMaritime];

  activeRoutes.forEach((route, rIdx) => {
    const fromRealm = realms.find((r) => r.id === burgs.find((b) => b.id === route.fromBurgId)?.stateId);
    const toRealm = realms.find((r) => r.id === burgs.find((b) => b.id === route.toBurgId)?.stateId);
    const isReverse = rIdx % 2 === 1;
    const progress = (rIdx * 0.19 + (prng.next() * 0.12)) % 1.0;

    const speed = route.isMaritime ? 0.08 : 0.055;
    const realm = isReverse ? toRealm : fromRealm;

    caravans.push({
      id: `caravan_${rIdx}`,
      routeId: route.id,
      fromBurgId: isReverse ? route.toBurgId : route.fromBurgId,
      toBurgId: isReverse ? route.fromBurgId : route.toBurgId,
      fromBurgName: isReverse ? route.toBurgName : route.fromBurgName,
      toBurgName: isReverse ? route.fromBurgName : route.toBurgName,
      commodity: route.primaryGood || 'Grain',
      progress,
      speed,
      isMaritime: route.isMaritime,
      heraldryColor: realm?.color || (route.isMaritime ? '#0284c7' : '#d97706'),
      direction: isReverse ? -1 : 1,
      antIndex: 0,
      cargoUnits: 20 + Math.floor(prng.next() * 25),
      cargoValue: 80 + Math.floor(prng.next() * 120),
      isLooted: false,
    });
  });

  return {
    routes,
    caravans,
    tradeHubs,
    cellTrafficVolume,
    cellPopulationDensity: smoothedDensity,
  };
}

function findClosestWaterRegion(
  x: number,
  y: number,
  mesh: VoronoiDualMesh,
  elevation: Float32Array,
  seaLevel: number
): number {
  let best = -1;
  let minD2 = Infinity;
  for (let r = 0; r < mesh.numRegions; r++) {
    if (elevation[r] >= seaLevel) continue;
    const dx = mesh.r_x[r] - x;
    const dy = mesh.r_y[r] - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < minD2) {
      minD2 = d2;
      best = r;
    }
  }
  return best !== -1 ? best : findClosestRegion(x, y, mesh, elevation, seaLevel, false);
}

/**
 * Constructs a custom overland or maritime trade route from user-clicked waypoints.
 * Supports automatic burg/port snapping and terrain/sea A* pathfinding assist.
 */
export function buildCustomTradeRoute(
  world: WorldState,
  rawPoints: Point2D[],
  routeType: RouteClassification = 'Merchant Road',
  options?: {
    snapToBurgs?: boolean;
    usePathfinding?: boolean;
  }
): { route: TradeRoute; caravan: TraderCaravan } | null {
  if (!rawPoints || rawPoints.length < 2) return null;

  const isMaritime = routeType === 'Maritime Sea Lane';
  const snapToBurgs = options?.snapToBurgs !== false;
  const usePathfinding = options?.usePathfinding !== false;
  const seaLevel = world.settings?.terrainSim?.seaLevel ?? world.settings?.seaLevel ?? 0.28;
  const mesh = world.mesh as VoronoiDualMesh | undefined;
  const sim = world.sim as TerrainSimulationResult | undefined;

  const findNearestBurg = (pt: Point2D, maxDist: number): Burg | null => {
    let best: Burg | null = null;
    let bestD = maxDist;
    for (const b of world.burgs || []) {
      const d = Math.hypot(b.x - pt.x, b.y - pt.y);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  };

  const snappedFirst = snapToBurgs ? findNearestBurg(rawPoints[0], 30) : null;
  const snappedLast = snapToBurgs ? findNearestBurg(rawPoints[rawPoints.length - 1], 30) : null;

  const controlPts: Point2D[] = rawPoints.map((p, idx) => {
    if (idx === 0 && snappedFirst) return { x: snappedFirst.x, y: snappedFirst.y };
    if (idx === rawPoints.length - 1 && snappedLast) return { x: snappedLast.x, y: snappedLast.y };
    return { x: p.x, y: p.y };
  });

  let combinedPoints: Point2D[] = [];

  if (usePathfinding && mesh && sim) {
    for (let i = 0; i < controlPts.length - 1; i++) {
      const pA = controlPts[i];
      const pB = controlPts[i + 1];

      const rA = isMaritime
        ? findClosestWaterRegion(pA.x, pA.y, mesh, sim.elevation, seaLevel)
        : findClosestRegion(pA.x, pA.y, mesh, sim.elevation, seaLevel, true);
      const rB = isMaritime
        ? findClosestWaterRegion(pB.x, pB.y, mesh, sim.elevation, seaLevel)
        : findClosestRegion(pB.x, pB.y, mesh, sim.elevation, seaLevel, true);

      const segRegions = findLowestCostPath(
        rA,
        rB,
        mesh,
        sim.elevation,
        sim.rainfall,
        sim.isRiver,
        sim.isCoast,
        seaLevel,
        isMaritime ? 'maritime' : 'overland'
      );

      let legPts: Point2D[];
      if (segRegions && segRegions.length >= 2) {
        legPts = segRegions.map((r) => ({ x: mesh.r_x[r], y: mesh.r_y[r] }));
        if (!isMaritime) {
          if (i === 0) legPts.unshift({ x: pA.x, y: pA.y });
          if (i === controlPts.length - 2) legPts.push({ x: pB.x, y: pB.y });
        }
      } else {
        legPts = [pA, pB];
      }

      if (combinedPoints.length > 0 && legPts.length > 0) {
        combinedPoints.push(...legPts.slice(1));
      } else {
        combinedPoints.push(...legPts);
      }
    }

    combinedPoints = isMaritime
      ? smoothWaterPath(combinedPoints, mesh, sim.elevation, seaLevel)
      : smoothLandPath(combinedPoints, mesh, sim.elevation, seaLevel, 1);
  } else {
    combinedPoints = controlPts;
  }

  let totalDist = 0;
  for (let i = 0; i < combinedPoints.length - 1; i++) {
    totalDist += Math.hypot(
      combinedPoints[i + 1].x - combinedPoints[i].x,
      combinedPoints[i + 1].y - combinedPoints[i].y
    );
  }

  const fromBurg = snappedFirst || findNearestBurg(controlPts[0], 90);
  const toBurg = snappedLast || findNearestBurg(controlPts[controlPts.length - 1], 90);
  const routeId = `route_custom_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const route: TradeRoute = {
    id: routeId,
    fromBurgId: fromBurg?.id || `waypoint_start_${routeId}`,
    toBurgId: toBurg?.id || `waypoint_end_${routeId}`,
    fromBurgName: snappedFirst?.name || (fromBurg ? `Near ${fromBurg.name}` : 'Western Anchorage'),
    toBurgName: snappedLast?.name || (toBurg ? `Near ${toBurg.name}` : 'Eastern Terminus'),
    type: routeType,
    pathPoints: combinedPoints,
    distanceKm: Math.max(12, Math.round(totalDist * 2.4)),
    trafficVolume: routeType === 'Imperial Highway' || isMaritime ? 4 : 2,
    primaryGood: fromBurg?.tradeGood || (isMaritime ? 'Spices' : 'Grain'),
    isMaritime,
    isCustom: true,
  };

  const realmColor =
    world.realms.find((r) => r.id === fromBurg?.stateId)?.color ||
    (isMaritime ? '#0284c7' : '#d97706');

  const caravan: TraderCaravan = {
    id: `caravan_${routeId}`,
    routeId,
    fromBurgId: route.fromBurgId,
    toBurgId: route.toBurgId,
    fromBurgName: route.fromBurgName,
    toBurgName: route.toBurgName,
    commodity: route.primaryGood,
    progress: 0.12,
    speed: isMaritime ? 0.08 : 0.055,
    isMaritime,
    heraldryColor: realmColor,
    direction: 1,
    antIndex: 0,
    cargoUnits: 32,
    cargoValue: 140,
    isLooted: false,
  };

  return { route, caravan };
}

/**
 * Re-generates procedural trade routes (all, overland-only, or maritime-only)
 * on demand from Builder or Toolbar without clobbering user-drawn custom routes.
 */
export function regenerateTradeRoutes(
  world: WorldState,
  scope: 'all' | 'overland' | 'maritime' = 'all',
  preserveCustom = true
): TradeNetwork {
  const mesh = world.mesh as VoronoiDualMesh | undefined;
  const sim = world.sim as TerrainSimulationResult | undefined;
  const existingRoutes = world.tradeNetwork?.routes || [];
  const existingCaravans = world.tradeNetwork?.caravans || [];

  if (!mesh || !sim) {
    return (
      world.tradeNetwork || {
        routes: [],
        caravans: [],
        tradeHubs: [],
      }
    );
  }

  const seaLevel = world.settings?.terrainSim?.seaLevel ?? world.settings?.seaLevel ?? 0.28;
  const prng = new PRNG(`${world.settings?.seed || 'realmsmith'}_routes_${scope}`);

  const generated = generateTradeNetwork(
    mesh,
    sim,
    world.burgs,
    world.realms,
    seaLevel,
    prng,
    { scope, skipSpawnBurgs: true }
  );

  const customRoutes = preserveCustom ? existingRoutes.filter((r) => r.isCustom) : [];
  const keptProceduralRoutes =
    scope === 'overland'
      ? existingRoutes.filter((r) => !r.isCustom && r.isMaritime)
      : scope === 'maritime'
      ? existingRoutes.filter((r) => !r.isCustom && !r.isMaritime)
      : [];

  const mergedRoutes = [...keptProceduralRoutes, ...generated.routes, ...customRoutes];
  const mergedRouteIds = new Set(mergedRoutes.map((r) => r.id));

  const keptCaravans = existingCaravans.filter((c) => {
    if (!mergedRouteIds.has(c.routeId)) return false;
    if (customRoutes.some((cr) => cr.id === c.routeId)) return true;
    return keptProceduralRoutes.some((pr) => pr.id === c.routeId);
  });

  const mergedCaravans = [...keptCaravans, ...generated.caravans];

  const tradeHubs = world.burgs
    .map((burg) => {
      const connected = mergedRoutes.filter(
        (r) => r.fromBurgId === burg.id || r.toBurgId === burg.id
      );
      const volume = connected.reduce((acc, r) => acc + (r.trafficVolume || 1), 0) || 1;
      const exports = Array.from(new Set(connected.map((r) => r.primaryGood))).slice(0, 3);
      return {
        burgId: burg.id,
        name: burg.name,
        connectedRoutesCount: connected.length,
        totalTradeVolume: volume,
        primaryExports: exports.length > 0 ? exports : [burg.tradeGood],
      };
    })
    .sort((a, b) => b.totalTradeVolume - a.totalTradeVolume);

  return {
    routes: mergedRoutes,
    caravans: mergedCaravans,
    tradeHubs,
    cellTrafficVolume:
      generated.cellTrafficVolume || world.tradeNetwork?.cellTrafficVolume,
    cellPopulationDensity:
      generated.cellPopulationDensity || world.tradeNetwork?.cellPopulationDensity,
  };
}