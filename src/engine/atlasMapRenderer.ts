import { VoronoiDualMesh } from './voronoiDualMesh';
import { TerrainSimulationResult } from './terrainSimulationEngine';
import {
  Burg,
  Realm,
  County,
  WorldCell,
  BiomeType,
  TradeNetwork,
  TradeRoute,
  TraderCaravan,
  RouteClassification,
  Season,
  WeatherEvent,
  SeasonalState,
  Province,
  Epidemic,
  Character,
  Army,
  Point2D,
  CoatOfArmsData,
  Culture,
  Religion,
  MapMode,
  Holding,
  MapPin,
  CustomRiver,
  CartographyStyle,
  BorderKind,
  CustomBorderEdge,
} from '../types/world';
import { getCachedHeraldryCanvasImage } from '../utils/heraldryBridge';
import { computeSeasonalState, blend4Colors, lerpColorHex } from './weatherSimulation';
import {
  buildHydraulicRiverNetwork,
  customRiverToChain,
  traceRiverNetworkSubpaths,
  drawRiverFlowAccents2D,
} from './hydraulicRiverEngine';
import {
  drawAtlasMountain,
  drawAtlasHill,
  drawAtlasTree,
  drawAtlasSwampOrDesert,
  drawAtlasBurgSettlement,
  drawAtlasLandmark,
  drawAtlasCompassRose,
  drawAtlasScale,
  ReliefAtlasStyle,
} from './reliefAtlas';
import { getArmyPositionAtProgress } from './armyPathfinding';
import { resolveSelectedTerritoryMask, SelectionFocus, SelectedTerritoryMask } from './territorySelection';
import { drawStateAndDuchyBanners } from './mapBanners';

export interface AtlasRenderOptions {
  renderMode?: 'static' | 'dynamic' | 'all';
  activeLayers: {
    political: boolean;
    feudal: boolean;
    heightmap: boolean;
    biomes: boolean;
    rainfall: boolean;
    wind: boolean;
    burgs: boolean;
    rivers: boolean;
    relief: boolean;
    reliefMountains?: boolean;
    reliefHills?: boolean;
    reliefForests?: boolean;
    reliefTrees?: boolean;
    reliefSwamps?: boolean;
    routes: boolean;
    caravans?: boolean;
    contours?: boolean;
    textures?: boolean;
    density?: boolean;
    weather?: boolean;
    provinces?: boolean;
    epidemics?: boolean;
    armies?: boolean;
    banners?: boolean;
    devastation?: boolean;
  };
  seaLevel: number;
  reliefStyle?: ReliefAtlasStyle;
  mapStyle?: CartographyStyle;
  season?: Season;
  seasonal?: SeasonalState;
  weatherEvent?: WeatherEvent;
  selectedRealmId?: string;
  selectedBurgId?: string;
  circledBurgId?: string;
  selectedCountyId?: string;
  selectedCharacterId?: string;
  selectionFocus?: SelectionFocus;
  selectedRouteId?: string;
  selectedArmyId?: string;
  hoveredTerritoryMask?: SelectedTerritoryMask | null;
  projectionMode?: 'parchment' | 'relief';
  mountainHeight?: number;
  worldName: string;
  currentYear: number;
  tradeNetwork?: TradeNetwork;
  caravanTick?: number;
  windAngleDeg?: number;
  provinces?: Province[];
  holdings?: Holding[];
  epidemics?: Epidemic[];
  lockedDownProvinces?: string[];
  characters?: Character[];
  armies?: Army[];
  cultures?: Culture[];
  religions?: Religion[];
  mapMode?: MapMode;
  zoomLevel?: number;
  paintRevision?: number;
  isBuilderMode?: boolean;
  mapPins?: MapPin[];
  customRivers?: CustomRiver[];
  customBorders?: CustomBorderEdge[];
  borderKindOverrides?: Record<string, BorderKind>;
  visibleEntities?: {
    realmIds: Set<string>;
    countyIds: Set<string>;
    burgIds: Set<string>;
  };
}

const regionGridCache = new WeakMap<VoronoiDualMesh, { cols: number; rows: number; w: number; h: number; buckets: number[][] }>();

function findNearestRegionFast(mesh: VoronoiDualMesh, x: number, y: number): number {
  let cached = regionGridCache.get(mesh);
  const cols = 25;
  const rows = 18;
  const w = 1000;
  const h = 700;
  if (!cached) {
    const buckets: number[][] = Array.from({ length: cols * rows }, () => []);
    for (let r = 0; r < mesh.numRegions; r++) {
      const c = Math.max(0, Math.min(cols - 1, Math.floor((mesh.r_x[r] / w) * cols)));
      const row = Math.max(0, Math.min(rows - 1, Math.floor((mesh.r_y[r] / h) * rows)));
      buckets[row * cols + c].push(r);
    }
    cached = { cols, rows, w, h, buckets };
    regionGridCache.set(mesh, cached);
  }
  const cc = Math.max(0, Math.min(cols - 1, Math.floor((x / w) * cols)));
  const rr = Math.max(0, Math.min(rows - 1, Math.floor((y / h) * rows)));
  let bestR = 0;
  let bestD = Infinity;
  for (let dr = -1; dr <= 1; dr++) {
    const nr = rr + dr;
    if (nr < 0 || nr >= rows) continue;
    for (let dc = -1; dc <= 1; dc++) {
      const nc = cc + dc;
      if (nc < 0 || nc >= cols) continue;
      for (const r of cached.buckets[nr * cols + nc]) {
        const dx = mesh.r_x[r] - x;
        const dy = mesh.r_y[r] - y;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          bestR = r;
        }
      }
    }
  }
  return bestR;
}

// ============================================================================
// CHAIKIN CURVE SMOOTHING FOR HAND-DRAWN FANTASY COASTLINES
// ============================================================================

function wobbleBorderPolyline(points: Point2D[], amplitude = 3.2): Point2D[] {
  if (points.length <= 2) return points;
  const out: Point2D[] = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    if (len > 4.5) {
      const mx = (p0.x + p1.x) * 0.5;
      const my = (p0.y + p1.y) * 0.5;
      // Deterministic normal displacement seeded by midpoint coordinates
      const nx = -dy / len;
      const ny = dx / len;
      const h =
        Math.sin(mx * 0.083 + my * 0.067) * 0.65 +
        Math.cos(mx * 0.191 - my * 0.149) * 0.35;
      const disp = h * Math.min(amplitude, len * 0.24);
      out.push({ x: mx + nx * disp, y: my + ny * disp });
    }
    out.push(p1);
  }
  return out;
}

function smoothPolyline(points: Point2D[], iterations = 2): Point2D[] {
  if (points.length <= 2) return points;
  let current = points;

  for (let it = 0; it < iterations; it++) {
    const next: Point2D[] = [current[0]];
    for (let i = 0; i < current.length - 1; i++) {
      const p0 = current[i];
      const p1 = current[i + 1];
      next.push({
        x: 0.75 * p0.x + 0.25 * p1.x,
        y: 0.75 * p0.y + 0.25 * p1.y,
      });
      next.push({
        x: 0.25 * p0.x + 0.75 * p1.x,
        y: 0.25 * p0.y + 0.75 * p1.y,
      });
    }
    next.push(current[current.length - 1]);
    current = next;
  }
  return current;
}

export function buildSmoothCoastlines(
  mesh: VoronoiDualMesh,
  elevation: Float32Array,
  seaLevel: number,
  isOcean?: boolean[]
): Point2D[][] {
  const { numSides, halfedges, s_start_r, s_end_r, s_left_t, t_x, t_y } = mesh;
  const edges: { x1: number; y1: number; x2: number; y2: number }[] = [];

  for (let s = 0; s < numSides; s++) {
    const opp = halfedges[s];
    if (opp === -1 || opp < s) continue;
    const rA = s_start_r[s];
    const rB = s_end_r[s];
    const waterA = isOcean ? isOcean[rA] : elevation[rA] < seaLevel;
    const waterB = isOcean ? isOcean[rB] : elevation[rB] < seaLevel;

    if (waterA !== waterB) {
      const tA = s_left_t[s];
      const tB = s_left_t[opp];
      edges.push({ x1: t_x[tA], y1: t_y[tA], x2: t_x[tB], y2: t_y[tB] });
    }
  }

  const polylines: Point2D[][] = [];
  const used = new Uint8Array(edges.length);
  const bucketMap = new Map<string, number[]>();
  const keyFor = (x: number, y: number) => `${Math.round(x * 0.5)},${Math.round(y * 0.5)}`;
  const addToBucket = (x: number, y: number, idx: number) => {
    const k = keyFor(x, y);
    let arr = bucketMap.get(k);
    if (!arr) {
      arr = [];
      bucketMap.set(k, arr);
    }
    arr.push(idx);
  };

  for (let i = 0; i < edges.length; i++) {
    addToBucket(edges[i].x1, edges[i].y1, i);
    addToBucket(edges[i].x2, edges[i].y2, i);
  }

  for (let i = 0; i < edges.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const line: Point2D[] = [
      { x: edges[i].x1, y: edges[i].y1 },
      { x: edges[i].x2, y: edges[i].y2 },
    ];

    let extended = true;
    while (extended) {
      extended = false;
      const head = line[line.length - 1];
      const gx = Math.round(head.x * 0.5);
      const gy = Math.round(head.y * 0.5);

      let matchedIdx = -1;
      let matchEnd2 = false;
      for (let dx = -1; dx <= 1 && matchedIdx === -1; dx++) {
        for (let dy = -1; dy <= 1 && matchedIdx === -1; dy++) {
          const candidates = bucketMap.get(`${gx + dx},${gy + dy}`);
          if (!candidates) continue;
          for (let c = 0; c < candidates.length; c++) {
            const j = candidates[c];
            if (used[j]) continue;
            const e = edges[j];
            if (Math.hypot(e.x1 - head.x, e.y1 - head.y) < 2.0) {
              matchedIdx = j;
              matchEnd2 = false;
              break;
            } else if (Math.hypot(e.x2 - head.x, e.y2 - head.y) < 2.0) {
              matchedIdx = j;
              matchEnd2 = true;
              break;
            }
          }
        }
      }

      if (matchedIdx !== -1) {
        const e = edges[matchedIdx];
        line.push(matchEnd2 ? { x: e.x1, y: e.y1 } : { x: e.x2, y: e.y2 });
        used[matchedIdx] = 1;
        extended = true;
      }
    }
    if (line.length >= 2) polylines.push(smoothPolyline(line, 2));
  }
  return polylines;
}

function smoothClosedLoop(points: Point2D[], iterations = 1): Point2D[] {
  if (points.length < 3) return points;
  let current = points;
  for (let it = 0; it < iterations; it++) {
    const next: Point2D[] = [];
    const len = current.length;
    for (let i = 0; i < len; i++) {
      const p0 = current[i];
      const p1 = current[(i + 1) % len];
      next.push({ x: 0.75 * p0.x + 0.25 * p1.x, y: 0.75 * p0.y + 0.25 * p1.y });
      next.push({ x: 0.25 * p0.x + 0.75 * p1.x, y: 0.25 * p0.y + 0.75 * p1.y });
    }
    current = next;
  }
  return current;
}

/**
 * Merges an arbitrary subset of Voronoi regions into unified, non-overlapping
 * outer boundary & hole loops using DualMesh halfedges (no internal cell edges).
 */
export function traceMergedGroupLoops(
  mesh: VoronoiDualMesh,
  inGroup: (r: number) => boolean,
  width: number,
  height: number,
  smoothIterations = 1
): { loops: Point2D[][]; boundaryFallbackRegions: number[] } {
  const { numSides, numRegions, halfedges, s_start_r, s_end_r, s_left_t, t_x, t_y, r_is_boundary } = mesh;
  const outEdges = new Map<number, number[]>();
  const boundaryFallbackRegions: number[] = [];
  let hasBoundaryCell = false;

  for (let r = 0; r < numRegions; r++) {
    if (r_is_boundary[r] && inGroup(r)) {
      hasBoundaryCell = true;
      boundaryFallbackRegions.push(r);
    }
  }

  for (let s = 0; s < numSides; s++) {
    const rA = s_start_r[s];
    if (!inGroup(rA)) continue;
    const opp = halfedges[s];
    if (opp === -1) continue;
    const rB = s_end_r[s];
    if (inGroup(rB)) continue;

    // Consistent boundary orientation around the inGroup set
    const tFrom = s_left_t[opp];
    const tTo = s_left_t[s];
    if (tFrom === tTo) continue;

    let list = outEdges.get(tFrom);
    if (!list) {
      list = [];
      outEdges.set(tFrom, list);
    }
    list.push(tTo);
  }

  const loops: Point2D[][] = [];
  for (const [startT, targets] of outEdges.entries()) {
    while (targets.length > 0) {
      const nextT = targets.pop()!;
      const loopIds: number[] = [startT, nextT];
      let curr = nextT;
      let guard = 0;

      while (curr !== startT && guard < numSides) {
        guard++;
        const nextList = outEdges.get(curr);
        if (!nextList || nextList.length === 0) break;
        curr = nextList.pop()!;
        if (curr !== startT) {
          loopIds.push(curr);
        }
      }

      if (loopIds.length >= 3) {
        const pts = loopIds.map((t) => ({
          x: Math.max(-2, Math.min(width + 2, t_x[t])),
          y: Math.max(-2, Math.min(height + 2, t_y[t])),
        }));
        loops.push(smoothIterations > 0 ? smoothClosedLoop(pts, smoothIterations) : pts);
      }
    }
  }

  return { loops, boundaryFallbackRegions: hasBoundaryCell ? boundaryFallbackRegions : [] };
}

function drawMergedLoops(
  ctx: CanvasRenderingContext2D,
  mesh: VoronoiDualMesh,
  loops: Point2D[][],
  fallbackRegions: number[],
  fillStyle: string
) {
  if (loops.length === 0 && fallbackRegions.length === 0) return;
  ctx.fillStyle = fillStyle;
  ctx.beginPath();
  for (const loop of loops) {
    if (loop.length < 3) continue;
    ctx.moveTo(loop[0].x, loop[0].y);
    for (let i = 1; i < loop.length; i++) {
      ctx.lineTo(loop[i].x, loop[i].y);
    }
    ctx.closePath();
  }
  for (const r of fallbackRegions) {
    const poly = mesh.r_polygon[r];
    if (!poly || poly.length < 3) continue;
    ctx.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) {
      ctx.lineTo(poly[i].x, poly[i].y);
    }
    ctx.closePath();
  }
  ctx.fill('evenodd');
}

// ============================================================================
// SMOOTH CONTINUOUS OCEAN & LAND GRADIENT SHADER (Zero Voronoi Patchiness)
// ============================================================================

interface SpatialGridCache {
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  buckets: number[][];
}

const meshSpatialGridCache = new WeakMap<VoronoiDualMesh, SpatialGridCache>();
const smoothTerrainCanvasCache = new Map<
  string,
  { ocean: HTMLCanvasElement; land: HTMLCanvasElement }
>();

function parseColorToRgb(col: string): [number, number, number] {
  if (col.startsWith('#')) {
    const clean = col.slice(1);
    if (clean.length === 3) {
      return [
        parseInt(clean[0] + clean[0], 16) || 0,
        parseInt(clean[1] + clean[1], 16) || 0,
        parseInt(clean[2] + clean[2], 16) || 0,
      ];
    }
    return [
      parseInt(clean.slice(0, 2), 16) || 0,
      parseInt(clean.slice(2, 4), 16) || 0,
      parseInt(clean.slice(4, 6), 16) || 0,
    ];
  }
  const m = col.match(/\d+/g);
  if (m && m.length >= 3) {
    return [Number(m[0]), Number(m[1]), Number(m[2])];
  }
  return [218, 210, 192];
}

interface CartographyTheme {
  id: CartographyStyle;
  oceanFill: string;
  deepOceanFill: string;
  landBase: string;
  shoreInk: string;
  waveRgb: string;
  borderInk: string;
  duchyInk: string;
  countyInk: string;
  paperTint: string;
  vignetteAlpha: number;
  biomeDesat: number;
  biomeWarmMix?: [number, number, number];
  biomeWarmAmt: number;
  politicalAlphaScale: number;
  forceEngraved: boolean;
  handDrawnJitter: boolean;
  hatchOcean: boolean;
  oceanStops: [number, [number, number, number]][];
}

const BATHYMETRY_STOPS: [number, [number, number, number]][] = [
  [0.0, [138, 178, 190]],
  [0.18, [118, 160, 176]],
  [0.40, [94, 136, 154]],
  [0.64, [72, 110, 129]],
  [0.85, [54, 88, 106]],
  [1.0, [40, 67, 84]],
];

const PARCHMENT_OCEAN_STOPS: [number, [number, number, number]][] = [
  [0.0, [212, 214, 200]],
  [0.20, [196, 202, 189]],
  [0.45, [174, 184, 172]],
  [0.72, [152, 165, 154]],
  [1.0, [132, 146, 136]],
];

const VINTAGE_OCEAN_STOPS: [number, [number, number, number]][] = [
  [0.0, [164, 176, 162]],
  [0.22, [142, 158, 146]],
  [0.48, [114, 136, 128]],
  [0.75, [90, 114, 108]],
  [1.0, [72, 94, 90]],
];

const INK_OCEAN_STOPS: [number, [number, number, number]][] = [
  [0.0, [238, 234, 224]],
  [0.22, [226, 223, 214]],
  [0.50, [212, 210, 203]],
  [0.80, [198, 197, 192]],
  [1.0, [186, 185, 180]],
];

const HAND_DRAWN_OCEAN_STOPS: [number, [number, number, number]][] = [
  [0.0, [209, 223, 226]],
  [0.25, [188, 207, 213]],
  [0.55, [162, 186, 196]],
  [0.85, [138, 164, 176]],
  [1.0, [120, 148, 162]],
];

function getCartographyTheme(style?: CartographyStyle): CartographyTheme {
  switch (style) {
    case 'parchment':
      return {
        id: 'parchment',
        oceanFill: '#c7ccb9',
        deepOceanFill: '#849288',
        landBase: '#e6d8b8',
        shoreInk: '#3d2c1e',
        waveRgb: '82, 60, 38',
        borderInk: 'rgba(54, 38, 24, 0.84)',
        duchyInk: 'rgba(104, 72, 42, 0.44)',
        countyInk: 'rgba(72, 54, 38, 0.28)',
        paperTint: 'rgba(176, 144, 96, 0.18)',
        vignetteAlpha: 0.22,
        biomeDesat: 0.36,
        biomeWarmMix: [228, 212, 180],
        biomeWarmAmt: 0.34,
        politicalAlphaScale: 0.56,
        forceEngraved: false,
        handDrawnJitter: false,
        hatchOcean: false,
        oceanStops: PARCHMENT_OCEAN_STOPS,
      };
    case 'vintage':
      return {
        id: 'vintage',
        oceanFill: '#96a89c',
        deepOceanFill: '#425652',
        landBase: '#d1b582',
        shoreInk: '#2a1c10',
        waveRgb: '56, 42, 26',
        borderInk: 'rgba(40, 24, 14, 0.90)',
        duchyInk: 'rgba(84, 48, 26, 0.50)',
        countyInk: 'rgba(64, 44, 28, 0.34)',
        paperTint: 'rgba(154, 114, 62, 0.26)',
        vignetteAlpha: 0.36,
        biomeDesat: 0.48,
        biomeWarmMix: [198, 168, 118],
        biomeWarmAmt: 0.44,
        politicalAlphaScale: 0.52,
        forceEngraved: false,
        handDrawnJitter: false,
        hatchOcean: true,
        oceanStops: VINTAGE_OCEAN_STOPS,
      };
    case 'ink':
      return {
        id: 'ink',
        oceanFill: '#e6e3d8',
        deepOceanFill: '#bab7ae',
        landBase: '#f4efe2',
        shoreInk: '#141210',
        waveRgb: '24, 22, 19',
        borderInk: 'rgba(16, 14, 12, 0.95)',
        duchyInk: 'rgba(38, 34, 30, 0.62)',
        countyInk: 'rgba(54, 50, 46, 0.38)',
        paperTint: 'rgba(195, 186, 170, 0.10)',
        vignetteAlpha: 0.16,
        biomeDesat: 0.94,
        biomeWarmMix: [242, 236, 224],
        biomeWarmAmt: 0.72,
        politicalAlphaScale: 0.16,
        forceEngraved: true,
        handDrawnJitter: false,
        hatchOcean: true,
        oceanStops: INK_OCEAN_STOPS,
      };
    case 'hand_drawn':
      return {
        id: 'hand_drawn',
        oceanFill: '#c4d9df',
        deepOceanFill: '#7492a0',
        landBase: '#efe3ca',
        shoreInk: '#211811',
        waveRgb: '34, 44, 50',
        borderInk: 'rgba(28, 20, 14, 0.90)',
        duchyInk: 'rgba(88, 56, 32, 0.50)',
        countyInk: 'rgba(68, 52, 38, 0.34)',
        paperTint: 'rgba(170, 148, 114, 0.14)',
        vignetteAlpha: 0.24,
        biomeDesat: 0.24,
        biomeWarmMix: [236, 224, 198],
        biomeWarmAmt: 0.24,
        politicalAlphaScale: 0.46,
        forceEngraved: true,
        handDrawnJitter: true,
        hatchOcean: true,
        oceanStops: HAND_DRAWN_OCEAN_STOPS,
      };
    case 'atlas':
    case 'relief':
    default:
      return {
        id: style || 'atlas',
        oceanFill: '#89aeb9',
        deepOceanFill: '#2a4556',
        landBase: '#d6d0c2',
        shoreInk: '#181822',
        waveRgb: '20, 50, 65',
        borderInk: 'rgba(22, 22, 32, 0.84)',
        duchyInk: 'rgba(92, 66, 42, 0.36)',
        countyInk: 'rgba(58, 52, 46, 0.26)',
        paperTint: 'rgba(155, 140, 115, 0.10)',
        vignetteAlpha: 0,
        biomeDesat: 0,
        biomeWarmAmt: 0,
        politicalAlphaScale: 1.0,
        forceEngraved: false,
        handDrawnJitter: false,
        hatchOcean: false,
        oceanStops: BATHYMETRY_STOPS,
      };
  }
}

function styleColorForTheme(hex: string, theme: CartographyTheme): string {
  if (theme.id === 'atlas' || theme.id === 'relief') return hex;
  let [r, g, b] = parseColorToRgb(hex);
  const lum = r * 0.299 + g * 0.587 + b * 0.114;
  if (theme.biomeDesat > 0) {
    r = r + (lum - r) * theme.biomeDesat;
    g = g + (lum - g) * theme.biomeDesat;
    b = b + (lum - b) * theme.biomeDesat;
  }
  if (theme.biomeWarmMix && theme.biomeWarmAmt > 0) {
    const mixAmt = theme.biomeWarmAmt * 0.85;
    r = r + (theme.biomeWarmMix[0] - r) * mixAmt;
    g = g + (theme.biomeWarmMix[1] - g) * mixAmt;
    b = b + (theme.biomeWarmMix[2] - b) * mixAmt;
  }
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function sampleSmoothBathymetryRgb(
  depth: number,
  stops: [number, [number, number, number]][] = BATHYMETRY_STOPS
): [number, number, number] {
  const d = Math.max(0, Math.min(1, depth));
  for (let i = 0; i < stops.length - 1; i++) {
    const [d0, c0] = stops[i];
    const [d1, c1] = stops[i + 1];
    if (d <= d1) {
      const t = (d - d0) / Math.max(0.0001, d1 - d0);
      return [
        c0[0] + (c1[0] - c0[0]) * t,
        c0[1] + (c1[1] - c0[1]) * t,
        c0[2] + (c1[2] - c0[2]) * t,
      ];
    }
  }
  return stops[stops.length - 1][1];
}

function getMeshSpatialGrid(
  mesh: VoronoiDualMesh,
  width: number,
  height: number
): SpatialGridCache {
  const cached = meshSpatialGridCache.get(mesh);
  if (cached) return cached;

  const cols = 50;
  const rows = 35;
  const cellW = width / cols;
  const cellH = height / rows;
  const buckets: number[][] = Array.from({ length: cols * rows }, () => []);

  for (let r = 0; r < mesh.numRegions; r++) {
    const gx = Math.max(0, Math.min(cols - 1, Math.floor(mesh.r_x[r] / cellW)));
    const gy = Math.max(0, Math.min(rows - 1, Math.floor(mesh.r_y[r] / cellH)));
    buckets[gy * cols + gx].push(r);
  }

  const entry: SpatialGridCache = { cols, rows, cellW, cellH, buckets };
  meshSpatialGridCache.set(mesh, entry);
  return entry;
}

function getSmoothTerrainCanvases(
  mesh: VoronoiDualMesh,
  sim: TerrainSimulationResult,
  cells: WorldCell[],
  options: AtlasRenderOptions,
  seasonal: SeasonalState,
  width: number,
  height: number
): { ocean: HTMLCanvasElement; land: HTMLCanvasElement } | null {
  if (typeof document === 'undefined') return null;

  const activeMapMode: MapMode = options.mapMode || 'political';
  const theme = getCartographyTheme(options.mapStyle);
  const useUniformThematicBase =
    activeMapMode !== 'geographic' &&
    activeMapMode !== 'population' &&
    !options.activeLayers.density &&
    !options.activeLayers.heightmap &&
    !options.activeLayers.rainfall;

  const layerMode = options.activeLayers.density || activeMapMode === 'population'
    ? 'density'
    : useUniformThematicBase
    ? 'uniform-parchment'
    : options.activeLayers.biomes
    ? 'biomes'
    : options.activeLayers.heightmap
    ? 'heightmap'
    : options.activeLayers.rainfall
    ? 'rainfall'
    : 'parchment';

  const { numRegions, r_x, r_y } = mesh;
  const { elevation, rainfall, biomes } = sim;
  const { seaLevel } = options;

  let elevSig = 0;
  let climateSig = 0;
  for (let i = 0; i < numRegions; i += 23) {
    elevSig += Math.round(elevation[i] * 1000);
    climateSig += Math.round(rainfall[i] * 100) + (biomes[i]?.charCodeAt(0) || 0) * 7;
  }
  const densitySig = options.activeLayers.density || activeMapMode === 'population'
    ? Math.round(
        cells.reduce((acc, c, idx) => acc + (idx % 17 === 0 ? c.populationDensity || 0 : 0), 0)
      )
    : 0;
  const cacheKey = `${mesh.numRegions}|${Math.round(mesh.r_x[0] * 10)}|${layerMode}|${theme.id}|${options.seaLevel.toFixed(3)}|${seasonal.currentSeason}|${Math.round(seasonal.transitionProgress * 10)}|${seasonal.packIceAlpha.toFixed(2)}|${densitySig}|${elevSig}|${climateSig}|p${options.paintRevision || 0}`;

  const hit = smoothTerrainCanvasCache.get(cacheKey);
  if (hit) return hit;

  // Precompute target RGB per region for the active layer
  const regionRgb = new Float32Array(numRegions * 3);
  for (let r = 0; r < numRegions; r++) {
    const e = elevation[r];
    if (e < seaLevel) continue;
    let landColor: string;
    if (options.activeLayers.density || activeMapMode === 'population') {
      landColor = getPopulationDensityColor(cells[r]?.populationDensity || 0);
    } else if (useUniformThematicBase) {
      // Clean uniform paper/parchment base calibrated for the selected CartographyStyle
      landColor = theme.landBase;
    } else if (options.activeLayers.biomes) {
      landColor = getInterpolatedBiomeColor(biomes[r], e, seasonal);
    } else if (options.activeLayers.heightmap) {
      landColor = getHeightmapColor(e);
    } else if (options.activeLayers.rainfall) {
      landColor = getRainfallColor(rainfall[r]);
    } else {
      landColor = theme.landBase;
    }
    let [cr, cg, cb] = parseColorToRgb(landColor);
    if (!useUniformThematicBase && !options.activeLayers.density && activeMapMode !== 'population') {
      if (theme.biomeDesat > 0) {
        const lum = cr * 0.299 + cg * 0.587 + cb * 0.114;
        cr = cr + (lum - cr) * theme.biomeDesat;
        cg = cg + (lum - cg) * theme.biomeDesat;
        cb = cb + (lum - cb) * theme.biomeDesat;
      }
      if (theme.biomeWarmMix && theme.biomeWarmAmt > 0) {
        cr = cr + (theme.biomeWarmMix[0] - cr) * theme.biomeWarmAmt;
        cg = cg + (theme.biomeWarmMix[1] - cg) * theme.biomeWarmAmt;
        cb = cb + (theme.biomeWarmMix[2] - cb) * theme.biomeWarmAmt;
      }
    }
    regionRgb[r * 3] = cr;
    regionRgb[r * 3 + 1] = cg;
    regionRgb[r * 3 + 2] = cb;
  }

  const rw = 760;
  const rh = 532;
  const scaleX = width / rw;
  const scaleY = height / rh;

  const oceanCanvas = document.createElement('canvas');
  oceanCanvas.width = rw;
  oceanCanvas.height = rh;
  const oceanCtx = oceanCanvas.getContext('2d')!;
  const oceanImg = oceanCtx.createImageData(rw, rh);
  const oData = oceanImg.data;

  const landCanvas = document.createElement('canvas');
  landCanvas.width = rw;
  landCanvas.height = rh;
  const landCtx = landCanvas.getContext('2d')!;
  const landImg = landCtx.createImageData(rw, rh);
  const lData = landImg.data;

  const grid = getMeshSpatialGrid(mesh, width, height);
  const { cols, rows, cellW, cellH, buckets } = grid;
  const sigmaOcean = 180;
  // Tighter quartic color kernel keeps biome edges crisp & organic without airbrushed mushing,
  // while a slightly gentler elevation kernel keeps ridge hillshading smooth without Voronoi facets.
  const sigmaLandColor4 = 1200; // (~5.9px)^4
  const sigmaLandElev = 54;
  // Compact radial support strictly inside the 3x3 bucket radius so weight & derivative hit 0 before any grid seam
  const kernelRadius = Math.min(cellW, cellH) * 0.99;
  const kernelR2 = kernelRadius * kernelRadius;
  const coldThresholdY = height * 0.36;
  const packIceActive = seasonal.packIceAlpha > 0.35;
  const landElevGrid = new Float32Array(rw * rh);

  for (let py = 0; py < rh; py++) {
    const wy = (py + 0.5) * scaleY;
    const gy = Math.max(0, Math.min(rows - 1, Math.floor(wy / cellH)));
    const yMin = Math.max(0, gy - 1);
    const yMax = Math.min(rows - 1, gy + 1);

    for (let px = 0; px < rw; px++) {
      const wx = (px + 0.5) * scaleX;
      const gx = Math.max(0, Math.min(cols - 1, Math.floor(wx / cellW)));
      const xMin = Math.max(0, gx - 1);
      const xMax = Math.min(cols - 1, gx + 1);

      let wOceanSum = 0;
      let elevSum = 0;

      let wLandSum = 0;
      let wElevSum = 0;
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let landElevSum = 0;

      for (let cy = yMin; cy <= yMax; cy++) {
        const rowOff = cy * cols;
        for (let cx = xMin; cx <= xMax; cx++) {
          const list = buckets[rowOff + cx];
          for (let i = 0; i < list.length; i++) {
            const r = list[i];
            const dx = r_x[r] - wx;
            const dy = r_y[r] - wy;
            const d2 = dx * dx + dy * dy;
            if (d2 >= kernelR2) continue;

            // C2-continuous compact radial envelope: smoothly hits 0 value & 0 slope at d = kernelRadius
            const u = 1 - d2 / kernelR2;
            const env = u * u * u;
            const e = elevation[r];

            // Ocean interpolates smoothly across all nearby nodes (clamping land to seaLevel
            // creates a silky continuous coastal shelf gradient right up to every shoreline)
            const wO = env / (d2 + sigmaOcean);
            wOceanSum += wO;
            elevSum += (e > seaLevel ? seaLevel : e) * wO;

            if (e >= seaLevel) {
              const wL = env / (d2 * d2 + sigmaLandColor4);
              wLandSum += wL;
              const off3 = r * 3;
              rSum += regionRgb[off3] * wL;
              gSum += regionRgb[off3 + 1] * wL;
              bSum += regionRgb[off3 + 2] * wL;

              const wE = env / (d2 + sigmaLandElev);
              wElevSum += wE;
              const riverCarve = sim.isRiver[r]
                ? Math.min(0.048, 0.014 + Math.log10(Math.max(2, sim.waterFlux[r])) * 0.015)
                : 0;
              landElevSum += Math.max(seaLevel, e - riverCarve) * wE;
            }
          }
        }
      }

      // Expanded fallback search only if near empty map margin
      if (wOceanSum === 0 || wLandSum === 0) {
        const xMin2 = Math.max(0, gx - 2);
        const xMax2 = Math.min(cols - 1, gx + 2);
        const yMin2 = Math.max(0, gy - 2);
        const yMax2 = Math.min(rows - 1, gy + 2);
        const needOcean = wOceanSum === 0;
        const needLand = wLandSum === 0;
        const fallbackR2 = kernelR2 * 4;
        for (let cy = yMin2; cy <= yMax2; cy++) {
          const rowOff = cy * cols;
          for (let cx = xMin2; cx <= xMax2; cx++) {
            const list = buckets[rowOff + cx];
            for (let i = 0; i < list.length; i++) {
              const r = list[i];
              const dx = r_x[r] - wx;
              const dy = r_y[r] - wy;
              const d2 = dx * dx + dy * dy;
              if (d2 >= fallbackR2) continue;
              const u = 1 - d2 / fallbackR2;
              const env = u * u * u;
              const e = elevation[r];
              if (needOcean) {
                const wO = env / (d2 + sigmaOcean);
                wOceanSum += wO;
                elevSum += (e > seaLevel ? seaLevel : e) * wO;
              }
              if (needLand && e >= seaLevel) {
                const wL = env / (d2 * d2 + sigmaLandColor4);
                wLandSum += wL;
                const off3 = r * 3;
                rSum += regionRgb[off3] * wL;
                gSum += regionRgb[off3 + 1] * wL;
                bSum += regionRgb[off3 + 2] * wL;

                const wE = env / (d2 + sigmaLandElev);
                wElevSum += wE;
                landElevSum += e * wE;
              }
            }
          }
        }
      }

      const idx4 = (py * rw + px) * 4;

      // Write Ocean pixel with organic seafloor/shelf variation so shallow water
      // does not form a uniform glowing band around coastlines
      const smoothOceanE = wOceanSum > 0 ? elevSum / wOceanSum : 0;
      const rawDepth = Math.max(0, Math.min(1, (seaLevel - smoothOceanE) / Math.max(0.001, seaLevel)));
      const n1 = Math.sin(wx * 0.011 + wy * 0.007) * Math.cos(wx * 0.006 - wy * 0.012);
      const n2 = Math.sin(wx * 0.027 - wy * 0.019 + 1.4) * Math.cos(wx * 0.021 + wy * 0.025);
      const n3 = Math.sin(wx * 0.058 + wy * 0.049 + 2.9) * 0.5;
      const shelfWarp = (n1 * 0.55 + n2 * 0.30 + n3 * 0.15);
      // Stronger modulation in mid-shallows & shelves, tapered at shoreline & abyss
      const warpEnvelope = Math.sin(Math.min(1, rawDepth * 1.15) * Math.PI);
      const warpedDepth = Math.max(
        0,
        Math.min(1, Math.pow(rawDepth, 0.88 + n1 * 0.16) + shelfWarp * 0.22 * (0.28 + warpEnvelope * 0.72))
      );
      let [or, og, ob] = sampleSmoothBathymetryRgb(warpedDepth, theme.oceanStops);
      // Subtle currents / bathymetric luminance mottling + optional fine ocean engraving grain
      const seaGrain = (n2 * 4.5 + n3 * 3.0);
      or = Math.max(0, Math.min(255, or + seaGrain * 0.75));
      og = Math.max(0, Math.min(255, og + seaGrain * 0.9));
      ob = Math.max(0, Math.min(255, ob + seaGrain));
      if (theme.hatchOcean && py % 3 === 0) {
        const hatchRipple = Math.sin(px * 0.35 + py * 0.9) * 3.5;
        or = Math.max(0, Math.min(255, or - hatchRipple));
        og = Math.max(0, Math.min(255, og - hatchRipple));
        ob = Math.max(0, Math.min(255, ob - hatchRipple));
      }
      if (packIceActive && wy < coldThresholdY && rawDepth < 0.36) {
        const latFactor = Math.max(0, Math.min(1, (coldThresholdY - wy) / (coldThresholdY * 0.45)));
        const shelfFactor = Math.max(0, Math.min(1, (0.36 - rawDepth) / 0.22));
        const iceMix = latFactor * shelfFactor * 0.85;
        or = or + (222 - or) * iceMix;
        og = og + (236 - og) * iceMix;
        ob = ob + (245 - ob) * iceMix;
      }
      oData[idx4] = Math.round(or);
      oData[idx4 + 1] = Math.round(og);
      oData[idx4 + 2] = Math.round(ob);
      oData[idx4 + 3] = 255;

      // Write Land pixel
      if (wLandSum > 0) {
        let lr = rSum / wLandSum;
        let lg = gSum / wLandSum;
        let lb = bSum / wLandSum;
        const smoothLandE = wElevSum > 0 ? landElevSum / wElevSum : 0;
        landElevGrid[py * rw + px] = smoothLandE;

        // Hypsometric warmth & organic paper mottling tailored to active CartographyStyle
        if (!options.activeLayers.density && !useUniformThematicBase) {
          const elevShade = Math.max(-12, Math.min(14, (smoothLandE - 0.44) * 28));
          lr += elevShade * 0.7;
          lg += elevShade * 0.55;
          lb += elevShade * 0.4;

          // Smooth highland snowline transition
          const snowStart = seasonal.snowline - 0.045;
          const snowEnd = seasonal.snowline + 0.035;
          // Transitional Thermal Treeline / Alpine Scree talus band below snowline
          const screeStart = snowStart - 0.085;
          if (smoothLandE > screeStart && smoothLandE <= snowStart) {
            const tScree = Math.max(0, Math.min(1, (smoothLandE - screeStart) / 0.085));
            const sT = tScree * tScree * (3 - 2 * tScree) * 0.52;
            lr = lr + (152 - lr) * sT;
            lg = lg + (146 - lg) * sT;
            lb = lb + (138 - lb) * sT;
          }
          if (smoothLandE > snowStart) {
            const tSnow = Math.max(0, Math.min(1, (smoothLandE - snowStart) / (snowEnd - snowStart)));
            const smoothT = tSnow * tSnow * (3 - 2 * tSnow);
            lr = lr + (238 - lr) * smoothT;
            lg = lg + (242 - lg) * smoothT;
            lb = lb + (246 - lb) * smoothT;
          }
        } else if (!options.activeLayers.density && activeMapMode !== 'population') {
          // Thematic / Political mode landmass elevation sculpting + theme-specific parchment patina
          const highlandLift = Math.max(-6, Math.min(14, (smoothLandE - seaLevel - 0.14) * 26));
          if (theme.id === 'parchment') {
            lr += highlandLift * 0.65;
            lg += highlandLift * 0.52;
            lb += highlandLift * 0.30;
          } else if (theme.id === 'vintage') {
            lr += highlandLift * 0.85;
            lg += highlandLift * 0.62;
            lb += highlandLift * 0.22;
          } else if (theme.id === 'ink') {
            lr -= Math.max(0, highlandLift) * 0.45;
            lg -= Math.max(0, highlandLift) * 0.45;
            lb -= Math.max(0, highlandLift) * 0.42;
          } else if (theme.id === 'hand_drawn') {
            lr += highlandLift * 0.55;
            lg += highlandLift * 0.48;
            lb += highlandLift * 0.34;
          }
        }

        // Organic aged-vellum / sepia blotching & paper fiber mottling per CartographyStyle
        if (!options.activeLayers.density) {
          if (theme.id === 'parchment' || theme.id === 'vintage' || theme.id === 'hand_drawn') {
            const mottle1 = Math.sin(wx * 0.014 + wy * 0.011) * Math.cos(wx * 0.008 - wy * 0.018);
            const mottle2 = Math.sin(wx * 0.036 - wy * 0.029 + 1.2) * 0.5;
            const mottleAmt =
              theme.id === 'vintage'
                ? (mottle1 * 12 + mottle2 * 6)
                : theme.id === 'parchment'
                ? (mottle1 * 8 + mottle2 * 4)
                : (mottle1 * 5 + mottle2 * 3);
            lr += mottleAmt * 1.05;
            lg += mottleAmt * 0.82;
            lb += mottleAmt * 0.46;
          }

          const h = Math.imul(px * 374761393 + py * 668265263, 1274126177);
          const grainScale =
            theme.id === 'vintage'
              ? 12.5
              : theme.id === 'parchment'
              ? 10.5
              : theme.id === 'hand_drawn'
              ? 11.5
              : theme.id === 'ink'
              ? 8.5
              : useUniformThematicBase
              ? 4.0
              : 6.5;
          const grain = (((h ^ (h >>> 13)) & 255) / 255 - 0.5) * grainScale;
          lr += grain;
          lg += grain * 0.96;
          lb += grain * 0.88;
        }

        lData[idx4] = Math.max(0, Math.min(255, Math.round(lr)));
        lData[idx4 + 1] = Math.max(0, Math.min(255, Math.round(lg)));
        lData[idx4 + 2] = Math.max(0, Math.min(255, Math.round(lb)));
        lData[idx4 + 3] = 255;
      } else {
        lData[idx4] = 218;
        lData[idx4 + 1] = 210;
        lData[idx4 + 2] = 192;
        lData[idx4 + 3] = 255;
      }
    }
  }

  // Crisp directional NW-to-SE topographic hillshading + optional engraved slope hatching
  if (!options.activeLayers.density && activeMapMode !== 'population') {
    const hillStrength = useUniformThematicBase
      ? theme.id === 'ink'
        ? 19
        : theme.id === 'vintage' || theme.id === 'hand_drawn'
        ? 16
        : theme.id === 'parchment'
        ? 13
        : 9.5
      : theme.id === 'ink'
      ? 24
      : 20;
    const drawSlopeHatch = theme.id === 'ink' || theme.id === 'hand_drawn';
    for (let py = 1; py < rh - 1; py++) {
      const rowOff = py * rw;
      for (let px = 1; px < rw - 1; px++) {
        const eCenter = landElevGrid[rowOff + px];
        if (eCenter < seaLevel) continue;
        const dx = landElevGrid[rowOff + px + 1] - landElevGrid[rowOff + px - 1];
        const dy = landElevGrid[rowOff + rw + px] - landElevGrid[rowOff - rw + px];
        // Light from NW (-0.707, -0.707): subtle crisp ridge shading without muddy pillowing
        const shade = Math.max(-1, Math.min(1, (-dx * 0.72 - dy * 0.72) * 38));
        const reliefBoost = 0.45 + Math.max(0, eCenter - seaLevel) * 1.25;
        let delta = shade * hillStrength * reliefBoost;

        // Copperplate & Sketchbook slope hachures on shaded ridges & valleys
        if (drawSlopeHatch && shade < -0.16) {
          const hatch1 = (px + py) % 3 === 0;
          const hatch2 = shade < -0.42 && (px - py + 1200) % 4 === 0;
          if (hatch1 || hatch2) {
            delta -= theme.id === 'ink' ? 26 : 18;
          }
        }

        const idx4 = (rowOff + px) * 4;
        // Warm highlight on lit faces, cool umber/ink shadow on shaded faces
        const rDelta = delta >= 0 ? delta * 1.05 : delta * 1.0;
        const gDelta = delta >= 0 ? delta * 0.96 : delta * 1.04;
        const bDelta = delta >= 0 ? delta * 0.82 : delta * 1.10;
        lData[idx4] = Math.max(0, Math.min(255, Math.round(lData[idx4] + rDelta)));
        lData[idx4 + 1] = Math.max(0, Math.min(255, Math.round(lData[idx4 + 1] + gDelta)));
        lData[idx4 + 2] = Math.max(0, Math.min(255, Math.round(lData[idx4 + 2] + bDelta)));
      }
    }
  }

  oceanCtx.putImageData(oceanImg, 0, 0);
  landCtx.putImageData(landImg, 0, 0);

  if (smoothTerrainCanvasCache.size > 16) {
    const firstKey = smoothTerrainCanvasCache.keys().next().value;
    if (firstKey !== undefined) smoothTerrainCanvasCache.delete(firstKey);
  }
  const result = { ocean: oceanCanvas, land: landCanvas };
  smoothTerrainCanvasCache.set(cacheKey, result);
  return result;
}

export function renderAtlasMap(
  ctx: CanvasRenderingContext2D,
  mesh: VoronoiDualMesh,
  sim: TerrainSimulationResult,
  burgs: Burg[],
  realms: Realm[],
  counties: County[],
  cells: WorldCell[],
  options: AtlasRenderOptions,
  width = 1000,
  height = 700
) {
  const { numRegions, r_x, r_y, r_polygon, halfedges, s_start_r, s_end_r, s_left_t, numSides, t_x, t_y } = mesh;
  const { elevation, rainfall, biomes, waterFlux, isRiver } = sim;
  const { seaLevel } = options;

  const showContours = !!options.activeLayers.contours;
  const showTextures = options.activeLayers.textures !== false;
  const mode = options.renderMode || 'all';
  const theme = getCartographyTheme(options.mapStyle);

  if (mode === 'all' || mode === 'static') {
    // 1. Base Canvas Styled to Active Cartography Theme
    ctx.fillStyle = theme.oceanFill;
    ctx.fillRect(-200, -200, width + 400, height + 400);

    // Region lookup maps
    const regionRealmMap = new Map<number, Realm>();
    const regionCountyMap = new Map<number, County>();

    for (let r = 0; r < numRegions; r++) {
      const cell = cells[r];
      if (cell && cell.realmId) {
        const rm = realms.find((x) => x.id === cell.realmId);
        if (rm) regionRealmMap.set(r, rm);
      }
      if (cell && cell.countyId) {
        const ct = counties.find((x) => x.id === cell.countyId);
        if (ct) regionCountyMap.set(r, ct);
      }
    }

    const seasonal =
      options.seasonal ||
      computeSeasonalState(
        options.season === 'Winter'
          ? 3.5
          : options.season === 'Autumn'
          ? 2.5
          : options.season === 'Summer'
          ? 1.5
          : 0.5,
        options.weatherEvent
      );

    // 2. Smooth Continuous Gradient Ocean & Land (Exclude landlocked lakes from abyssal ocean cutout)
    const { loops: allLandLoops, boundaryFallbackRegions: allLandFallback } = traceMergedGroupLoops(
      mesh,
      (r) => (sim.isOcean ? !sim.isOcean[r] : elevation[r] >= seaLevel),
      width,
      height,
      1
    );

    const smoothCanvases = getSmoothTerrainCanvases(
      mesh,
      sim,
      cells,
      options,
      seasonal,
      width,
      height
    );

    if (smoothCanvases) {
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      // Deep outer margin fallback
      ctx.fillStyle = theme.deepOceanFill;
      ctx.fillRect(-200, -200, width + 400, height + 400);
      // Smooth continuous ocean bathymetry gradient
      ctx.drawImage(smoothCanvases.ocean, 0, 0, width, height);

      // Clip precisely to the smooth merged coastline silhouette & paint smooth continuous land gradient
      ctx.beginPath();
      for (const loop of allLandLoops) {
        if (loop.length < 3) continue;
        ctx.moveTo(loop[0].x, loop[0].y);
        for (let i = 1; i < loop.length; i++) ctx.lineTo(loop[i].x, loop[i].y);
        ctx.closePath();
      }
      for (const r of allLandFallback) {
        const poly = mesh.r_polygon[r];
        if (!poly || poly.length < 3) continue;
        ctx.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
        ctx.closePath();
      }
      ctx.clip('evenodd');
      ctx.drawImage(smoothCanvases.land, 0, 0, width, height);

      // Style-specific landmass surface finish (strictly clipped inside continents & islands)
      if (theme.id === 'parchment' || theme.id === 'vintage') {
        ctx.strokeStyle =
          theme.id === 'vintage' ? 'rgba(116, 76, 32, 0.22)' : 'rgba(138, 98, 48, 0.14)';
        ctx.lineWidth = theme.id === 'vintage' ? 14 : 10;
        ctx.stroke();
      } else if (theme.id === 'hand_drawn') {
        // Subtle sketchbook diagonal pen shading along coastal bluffs
        ctx.strokeStyle = 'rgba(42, 32, 22, 0.16)';
        ctx.lineWidth = 4.5;
        ctx.setLineDash([1.5, 3.5]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    } else {
      drawMergedLoops(ctx, mesh, allLandLoops, allLandFallback, theme.landBase);
    }

    // 3. Smooth Ocean Coastlines & Wave Rings (strictly global ocean — never landlocked lakes)
    const smoothCoastlines = buildSmoothCoastlines(mesh, elevation, seaLevel, sim.isOcean);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Vintage & Hand-Drawn Maritime Rhumb Lines across Ocean Waters
    if (theme.id === 'vintage' || theme.id === 'hand_drawn') {
      ctx.save();
      ctx.strokeStyle = `rgba(${theme.waveRgb}, ${theme.id === 'vintage' ? 0.11 : 0.08})`;
      ctx.lineWidth = 0.65;
      const centers = [
        { x: width * 0.16, y: height * 0.78 },
        { x: width * 0.84, y: height * 0.24 },
      ];
      for (const c of centers) {
        for (let k = 0; k < 16; k++) {
          const ang = (k * Math.PI * 2) / 16;
          ctx.beginPath();
          ctx.moveTo(c.x, c.y);
          ctx.lineTo(c.x + Math.cos(ang) * width * 1.2, c.y + Math.sin(ang) * width * 1.2);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    const waveRings =
      theme.id === 'ink'
        ? [
            { width: 15, color: `rgba(${theme.waveRgb}, 0.09)` },
            { width: 9.0, color: `rgba(${theme.waveRgb}, 0.16)` },
            { width: 4.5, color: `rgba(${theme.waveRgb}, 0.26)` },
          ]
        : [
            { width: 22, color: `rgba(${theme.waveRgb}, 0.08)` },
            { width: 14, color: `rgba(${theme.waveRgb}, 0.16)` },
            { width: 8.0, color: `rgba(${theme.waveRgb}, 0.28)` },
            { width: 3.8, color: `rgba(${theme.waveRgb}, 0.45)` },
          ];
    for (const ring of waveRings) {
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = ring.width;
      for (const line of smoothCoastlines) {
        ctx.beginPath();
        ctx.moveTo(line[0].x, line[0].y);
        for (let i = 1; i < line.length; i++) ctx.lineTo(line[i].x, line[i].y);
        ctx.stroke();
      }
    }

    // Inner-Bevel Embossed Coastal Shadow (clipped strictly inside land so dark bevel fades inward)
    ctx.save();
    ctx.beginPath();
    for (const loop of allLandLoops) {
      if (loop.length < 3) continue;
      ctx.moveTo(loop[0].x, loop[0].y);
      for (let i = 1; i < loop.length; i++) ctx.lineTo(loop[i].x, loop[i].y);
      ctx.closePath();
    }
    for (const r of allLandFallback) {
      const poly = mesh.r_polygon[r];
      if (!poly || poly.length < 3) continue;
      ctx.moveTo(poly[0].x, poly[0].y);
      for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
      ctx.closePath();
    }
    ctx.clip('evenodd');

    const coastInnerBevel = [
      { width: 16.0, color: 'rgba(14, 14, 24, 0.07)' },
      { width: 10.5, color: 'rgba(14, 14, 24, 0.12)' },
      { width: 6.2, color: 'rgba(14, 14, 24, 0.20)' },
      { width: 3.4, color: 'rgba(14, 14, 24, 0.30)' },
    ];
    for (const pass of coastInnerBevel) {
      ctx.strokeStyle = pass.color;
      ctx.lineWidth = pass.width;
      for (const line of smoothCoastlines) {
        ctx.beginPath();
        ctx.moveTo(line[0].x, line[0].y);
        for (let i = 1; i < line.length; i++) ctx.lineTo(line[i].x, line[i].y);
        ctx.stroke();
      }
    }
    ctx.restore();

    // Crisp Dark Outer Shoreline Edge
    ctx.strokeStyle = theme.shoreInk;
    ctx.lineWidth = theme.id === 'ink' || theme.id === 'hand_drawn' ? 2.25 : 2.05;
    for (const line of smoothCoastlines) {
      ctx.beginPath();
      ctx.moveTo(line[0].x, line[0].y);
      for (let i = 1; i < line.length; i++) ctx.lineTo(line[i].x, line[i].y);
      ctx.stroke();
    }
    if (theme.handDrawnJitter) {
      ctx.strokeStyle = `rgba(${theme.waveRgb}, 0.36)`;
      ctx.lineWidth = 0.9;
      ctx.setLineDash([6, 3.5]);
      for (const line of smoothCoastlines) {
        ctx.beginPath();
        for (let i = 0; i < line.length; i++) {
          const jx = Math.sin(line[i].x * 0.45 + line[i].y * 0.3) * 1.15;
          const jy = Math.cos(line[i].y * 0.42 - line[i].x * 0.28) * 1.15;
          if (i === 0) ctx.moveTo(line[i].x + jx, line[i].y + jy);
          else ctx.lineTo(line[i].x + jx, line[i].y + jy);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    ctx.restore();

    // 4. Topographic Elevation Contour Lines disabled to prevent raw Voronoi cell grid artifacts across ocean and terrain
    void showContours;

    // 5. Procedural Biome Textures & Ground Patterns (adapted to active CartographyStyle)
    if (showTextures) {
      drawBiomeTextures(ctx, mesh, sim, seaLevel, seasonal, height, theme);
    }

    const activeMapMode: MapMode = options.mapMode || 'political';

    // 6. Merged Thematic / Political Map Mode Washes & Inner-Bevel Embossed Borders
    if (options.activeLayers.political && activeMapMode !== 'geographic' && activeMapMode !== 'population') {
      ctx.save();

      // Deterministic fallback color helper for Culture / Religion names
      const hashPalette = ['#c084fc', '#38bdf8', '#f59e0b', '#10b981', '#f43f5e', '#818cf8', '#fb923c', '#2dd4bf', '#a3e635', '#e879f9'];
      const hashColor = (label: string) => {
        let h = 0;
        for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) | 0;
        return hashPalette[Math.abs(h) % hashPalette.length];
      };

      const cultureColorMap = new Map<string, string>();
      for (const cu of options.cultures || []) {
        cultureColorMap.set(cu.name, cu.color);
        cultureColorMap.set(cu.id, cu.color);
      }
      const religionColorMap = new Map<string, string>();
      for (const rel of options.religions || []) {
        religionColorMap.set(rel.name, rel.color);
        religionColorMap.set(rel.id, rel.color);
      }

      const focusRealm =
        realms.find((r) => r.id === options.selectedRealmId) || realms[0];

      if (activeMapMode === 'economic') {
        // Economic Map Mode: County-level prosperity & trade wealth choropleth
        for (const county of counties) {
          const countyBurgs = burgs.filter(
            (b) => b.countyId === county.id || county.baronyBurgIds?.includes(b.id)
          );
          const popSum = countyBurgs.reduce((acc, b) => acc + (b.population || 0), 0);
          const hasPort = countyBurgs.some((b) => b.type === 'Trade Port' || b.isCapital);
          const wealthScore =
            (county.development || 30) * 1.35 +
            Math.min(85, popSum / 420) +
            (hasPort ? 28 : 0);

          const econHex =
            wealthScore >= 165
              ? '#eab308' // Grand Trade Metropolis (Gold)
              : wealthScore >= 125
              ? '#10b981' // Thriving Commercial Hub (Emerald)
              : wealthScore >= 90
              ? '#d97706' // Prosperous Market County (Amber)
              : wealthScore >= 60
              ? '#92400e' // Agrarian Heartland (Warm Ochre)
              : '#475569'; // Frontier / Sparse Economy (Slate)

          const countySet = new Set(county.cellIndices);
          const { loops, boundaryFallbackRegions } = traceMergedGroupLoops(
            mesh,
            (r) => elevation[r] >= seaLevel && countySet.has(r),
            width,
            height,
            1
          );
          drawMergedLoops(ctx, mesh, loops, boundaryFallbackRegions, hexToRgba(econHex, 0.54));
        }
      }

      for (const realm of realms) {
        const isSelected = options.selectedRealmId === realm.id;
        let fillHex = realm.color;
        let realmAlpha = isSelected ? 0.62 : 0.48;

        if (activeMapMode === 'cultural') {
          fillHex = cultureColorMap.get(realm.culture) || hashColor(realm.culture || realm.name);
          realmAlpha = isSelected ? 0.66 : 0.54;
        } else if (activeMapMode === 'religious') {
          fillHex = religionColorMap.get(realm.religion) || hashColor(realm.religion || realm.name);
          realmAlpha = isSelected ? 0.66 : 0.54;
        } else if (activeMapMode === 'diplomatic' && focusRealm) {
          if (realm.id === focusRealm.id) {
            fillHex = '#2563eb'; // Selected Realm: Royal Sapphire
            realmAlpha = 0.58;
          } else if (focusRealm.enemyRealmIds?.includes(realm.id) || realm.enemyRealmIds?.includes(focusRealm.id)) {
            fillHex = '#dc2626'; // At War / Hostile: Crimson
            realmAlpha = 0.56;
          } else if (focusRealm.alliedRealmIds?.includes(realm.id) || realm.alliedRealmIds?.includes(focusRealm.id)) {
            fillHex = '#16a34a'; // Allied: Emerald
            realmAlpha = 0.54;
          } else if (focusRealm.tradePactRealmIds?.includes(realm.id) || realm.tradePactRealmIds?.includes(focusRealm.id)) {
            fillHex = '#0d9488'; // Trade Pact / Friendly: Teal
            realmAlpha = 0.48;
          } else if (
            focusRealm.embargoedRealmIds?.includes(realm.id) ||
            (focusRealm.diplomaticRelations?.[realm.id] ?? 0) <= -25
          ) {
            fillHex = '#d97706'; // Embargoed / Rivals: Amber-Orange
            realmAlpha = 0.50;
          } else if ((focusRealm.diplomaticRelations?.[realm.id] ?? 0) >= 25) {
            fillHex = '#65a30d'; // Cordial: Olive Green
            realmAlpha = 0.42;
          } else {
            fillHex = '#64748b'; // Neutral: Muted Slate
            realmAlpha = 0.24;
          }
        }

        const themedHex = styleColorForTheme(fillHex, theme);
        const fillCol = hexToRgba(themedHex, realmAlpha * theme.politicalAlphaScale);

        const { loops, boundaryFallbackRegions } = traceMergedGroupLoops(
          mesh,
          (r) => elevation[r] >= seaLevel && regionRealmMap.get(r)?.id === realm.id,
          width,
          height,
          1
        );
        if (activeMapMode !== 'economic') {
          drawMergedLoops(ctx, mesh, loops, boundaryFallbackRegions, fillCol);
        }

        // Inner-bevel embossed shading clipped strictly inside each realm's perimeter
        if (loops.length > 0) {
          ctx.save();
          ctx.beginPath();
          for (const loop of loops) {
            if (loop.length < 3) continue;
            ctx.moveTo(loop[0].x, loop[0].y);
            for (let i = 1; i < loop.length; i++) ctx.lineTo(loop[i].x, loop[i].y);
            ctx.closePath();
          }
          ctx.clip('evenodd');
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          const realmInnerBevel = [
            { width: 12.0, color: 'rgba(14, 14, 24, 0.07)' },
            { width: 7.2, color: 'rgba(14, 14, 24, 0.13)' },
            { width: 3.8, color: 'rgba(14, 14, 24, 0.22)' },
          ];
          for (const pass of realmInnerBevel) {
            ctx.strokeStyle = pass.color;
            ctx.lineWidth = pass.width;
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      const borderZoom = options.zoomLevel || 1.0;
      if (options.activeLayers.feudal) {
        // On Macro zoom (<1.25x): render subtle borders for vassal Duchies only (Crown Duchy border stays hidden unless selected);
        // On Meso & Micro zoom (>=1.25x): render refined county tints & subtle internal borders
        const showAllCounties = borderZoom >= 1.25;
        const COUNTY_TINTS = [
          'rgba(255, 250, 236, 0.11)',
          'rgba(180, 145, 95, 0.09)',
          'rgba(218, 228, 210, 0.09)',
          'rgba(235, 212, 178, 0.10)',
          'rgba(195, 205, 218, 0.09)',
        ];

        for (let ci = 0; ci < counties.length; ci++) {
          const county = counties[ci];
          const isDuchy = county.tier === 'Duchy' || county.name.includes('Duchy');
          const isCrownDuchy = Boolean(
            county.duchyId?.endsWith('_crown') || county.name.startsWith('Royal Duchy')
          );
          if (!showAllCounties && (!isDuchy || isCrownDuchy)) continue;

          const { loops, boundaryFallbackRegions } = traceMergedGroupLoops(
            mesh,
            (r) => {
              if (elevation[r] < seaLevel) return false;
              const rc = regionCountyMap.get(r);
              if (!rc) return false;
              if (!showAllCounties && isDuchy && county.duchyId) {
                return rc.duchyId === county.duchyId || rc.id === county.id;
              }
              return rc.id === county.id;
            },
            width,
            height,
            1
          );
          if (loops.length === 0 && boundaryFallbackRegions.length === 0) continue;

          if (showAllCounties) {
            drawMergedLoops(
              ctx,
              mesh,
              loops,
              boundaryFallbackRegions,
              COUNTY_TINTS[ci % COUNTY_TINTS.length]
            );
          }

          // Keep Crown Duchy border hidden unless selected (selection outline handles it cleanly without overlap)
          if (isCrownDuchy && !showAllCounties) continue;

          ctx.save();
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';

          ctx.beginPath();
          for (const loop of loops) {
            if (loop.length < 3) continue;
            ctx.moveTo(loop[0].x, loop[0].y);
            for (let i = 1; i < loop.length; i++) ctx.lineTo(loop[i].x, loop[i].y);
            ctx.closePath();
          }

          if (showAllCounties) {
            // Subtle, soft cartographic fiefdom boundaries
            ctx.strokeStyle = 'rgba(255, 248, 232, 0.16)';
            ctx.lineWidth = Math.max(0.4, 1.0 / Math.pow(borderZoom, 0.55));
            ctx.setLineDash([]);
            ctx.stroke();

            ctx.strokeStyle = isDuchy && !isCrownDuchy ? theme.duchyInk : theme.countyInk;
            ctx.lineWidth = Math.max(0.32, (isDuchy && !isCrownDuchy ? 0.95 : 0.65) / Math.pow(borderZoom, 0.55));
            ctx.setLineDash(isDuchy && !isCrownDuchy ? [6.5, 3.5] : [3.8, 3.5]);
            ctx.stroke();
          } else {
            // Zoomed out: clear vassal & inter-duchy borders
            ctx.strokeStyle = theme.duchyInk;
            ctx.lineWidth = 0.92;
            ctx.setLineDash([6.0, 3.5]);
            ctx.stroke();
          }

          ctx.setLineDash([]);
          ctx.restore();
        }
      }

      // Render Inter-Duchy Frontiers within realms (distinct medium dashed bronze-umber stroke)
      if (options.activeLayers.feudal || options.activeLayers.political) {
        const duchySegments: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
        for (let s = 0; s < numSides; s++) {
          const opp = halfedges[s];
          if (opp === -1 || opp < s) continue;
          const rA = s_start_r[s];
          const rB = s_end_r[s];
          if (elevation[rA] < seaLevel || elevation[rB] < seaLevel) continue;
          const realmA = regionRealmMap.get(rA);
          const realmB = regionRealmMap.get(rB);
          if (!realmA || !realmB || realmA.id !== realmB.id) continue;
          const countyA = regionCountyMap.get(rA);
          const countyB = regionCountyMap.get(rB);
          if (!countyA || !countyB || countyA.id === countyB.id) continue;
          const pairKey = rA < rB ? `${rA}:${rB}` : `${rB}:${rA}`;
          if (options.borderKindOverrides?.[pairKey]) continue;
          const duchyA = countyA.duchyId || countyA.id;
          const duchyB = countyB.duchyId || countyB.id;
          if (duchyA !== duchyB) {
            const tA = s_left_t[s];
            const tB = s_left_t[opp];
            duchySegments.push({ x1: t_x[tA], y1: t_y[tA], x2: t_x[tB], y2: t_y[tB] });
          }
        }
        if (duchySegments.length > 0) {
          ctx.save();
          ctx.strokeStyle = theme.duchyInk;
          ctx.lineWidth = borderZoom >= 1.25 ? 1.15 : 0.95;
          ctx.setLineDash([6.5, 3.2]);
          ctx.beginPath();
          for (const seg of duchySegments) {
            ctx.moveTo(seg.x1, seg.y1);
            ctx.lineTo(seg.x2, seg.y2);
          }
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }
      }

      // Chain and Chaikin-smooth inter-realm (Interstate) borders so they curve organically
      type BorderSeg = { tA: number; tB: number; colorA: string; colorB: string };
      const borderSegsByPair = new Map<string, BorderSeg[]>();
      const vertexDegree = new Map<number, number>();
      const overriddenSegmentsByKind = new Map<BorderKind, Array<{ x1: number; y1: number; x2: number; y2: number }>>();

      for (let s = 0; s < numSides; s++) {
        const opp = halfedges[s];
        if (opp === -1 || opp < s) continue;
        const rA = s_start_r[s];
        const rB = s_end_r[s];

        if (elevation[rA] >= seaLevel && elevation[rB] >= seaLevel) {
          const tA = s_left_t[s];
          const tB = s_left_t[opp];
          const edgeKey = rA < rB ? `${rA}:${rB}` : `${rB}:${rA}`;
          const overrideKind = options.borderKindOverrides?.[edgeKey];
          if (overrideKind) {
            let list = overriddenSegmentsByKind.get(overrideKind);
            if (!list) {
              list = [];
              overriddenSegmentsByKind.set(overrideKind, list);
            }
            list.push({ x1: t_x[tA], y1: t_y[tA], x2: t_x[tB], y2: t_y[tB] });
            continue;
          }

          const realmA = regionRealmMap.get(rA);
          const realmB = regionRealmMap.get(rB);
          if (realmA && realmB && realmA.id !== realmB.id) {
            const pairKey = realmA.id < realmB.id ? `${realmA.id}|${realmB.id}` : `${realmB.id}|${realmA.id}`;
            let list = borderSegsByPair.get(pairKey);
            if (!list) {
              list = [];
              borderSegsByPair.set(pairKey, list);
            }
            list.push({
              tA,
              tB,
              colorA: realmA.id < realmB.id ? realmA.color : realmB.color,
              colorB: realmA.id < realmB.id ? realmB.color : realmA.color,
            });
            vertexDegree.set(tA, (vertexDegree.get(tA) || 0) + 1);
            vertexDegree.set(tB, (vertexDegree.get(tB) || 0) + 1);
          }
        }
      }

      const smoothedBorderLines: { pts: Point2D[]; colorA: string; colorB: string }[] = [];

      borderSegsByPair.forEach((segs) => {
        const adj = new Map<number, { next: number; segIdx: number }[]>();
        for (let i = 0; i < segs.length; i++) {
          const { tA, tB } = segs[i];
          if (!adj.has(tA)) adj.set(tA, []);
          if (!adj.has(tB)) adj.set(tB, []);
          adj.get(tA)!.push({ next: tB, segIdx: i });
          adj.get(tB)!.push({ next: tA, segIdx: i });
        }
        const used = new Uint8Array(segs.length);
        const isJunction = (v: number) => (vertexDegree.get(v) || 0) !== 2 || (adj.get(v)?.length || 0) !== 2;

        const traceFrom = (startV: number, firstEdge: { next: number; segIdx: number }) => {
          used[firstEdge.segIdx] = 1;
          const verts: number[] = [startV, firstEdge.next];
          let curr = firstEdge.next;
          while (!isJunction(curr) && curr !== startV) {
            const edgesAt = adj.get(curr) || [];
            const nextEdge = edgesAt.find((e) => !used[e.segIdx]);
            if (!nextEdge) break;
            used[nextEdge.segIdx] = 1;
            curr = nextEdge.next;
            verts.push(curr);
          }
          const rawPts: Point2D[] = verts.map((v) => ({ x: t_x[v], y: t_y[v] }));
          const organicPts = rawPts.length >= 2 ? wobbleBorderPolyline(rawPts, 4.2) : rawPts;
          const smoothPts = organicPts.length >= 3 ? smoothPolyline(organicPts, 2) : organicPts;
          smoothedBorderLines.push({
            pts: smoothPts,
            colorA: segs[0].colorA,
            colorB: segs[0].colorB,
          });
        };

        // Pass 1: start from junctions / endpoints so polylines terminate cleanly at triple-junctions
        adj.forEach((edgesAt, v) => {
          if (!isJunction(v)) return;
          for (const e of edgesAt) {
            if (!used[e.segIdx]) traceFrom(v, e);
          }
        });
        // Pass 2: closed enclaves / loops with no junctions
        for (let i = 0; i < segs.length; i++) {
          if (used[i]) continue;
          traceFrom(segs[i].tA, { next: segs[i].tB, segIdx: i });
        }
      });

      // Crisp Dark Embossed Inter-Realm Frontier Line (paired with per-realm inner-bevel gradient above)
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = theme.borderInk;
      ctx.lineWidth = theme.id === 'hand_drawn' ? 2.1 : 1.9;
      ctx.setLineDash([]);
      ctx.beginPath();
      for (const line of smoothedBorderLines) {
        if (line.pts.length < 2) continue;
        ctx.moveTo(line.pts[0].x, line.pts[0].y);
        for (let i = 1; i < line.pts.length; i++) {
          ctx.lineTo(line.pts[i].x, line.pts[i].y);
        }
      }
      ctx.stroke();

      // Render Hand-Painted / Edge-Classified Custom & Overridden Borders
      const strokeBorderKindPath = (kind: BorderKind) => {
        if (kind === 'interstate') {
          ctx.strokeStyle = theme.borderInk;
          ctx.lineWidth = 2.15;
          ctx.setLineDash([]);
          ctx.stroke();
        } else if (kind === 'inter_duchy') {
          ctx.strokeStyle = 'rgba(116, 66, 28, 0.88)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([7, 3.5]);
          ctx.stroke();
        } else if (kind === 'county') {
          ctx.strokeStyle = 'rgba(64, 54, 46, 0.72)';
          ctx.lineWidth = 1.05;
          ctx.setLineDash([4, 3.5]);
          ctx.stroke();
        } else if (kind === 'barony') {
          ctx.strokeStyle = 'rgba(84, 72, 64, 0.58)';
          ctx.lineWidth = 0.85;
          ctx.setLineDash([1.8, 3.2]);
          ctx.stroke();
        } else if (kind === 'march') {
          ctx.strokeStyle = 'rgba(32, 24, 24, 0.86)';
          ctx.lineWidth = 2.8;
          ctx.setLineDash([]);
          ctx.stroke();
          ctx.strokeStyle = '#dc2626';
          ctx.lineWidth = 1.3;
          ctx.setLineDash([5, 3]);
          ctx.stroke();
        } else if (kind === 'disputed') {
          ctx.strokeStyle = '#dc2626';
          ctx.lineWidth = 2.1;
          ctx.setLineDash([6, 4]);
          ctx.stroke();
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 1.1;
          ctx.setLineDash([2, 8]);
          ctx.stroke();
        } else if (kind === 'ecclesiastical') {
          ctx.strokeStyle = '#6b21a8';
          ctx.lineWidth = 1.85;
          ctx.setLineDash([2, 4.5]);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      };

      overriddenSegmentsByKind.forEach((segs, kind) => {
        if (segs.length === 0) return;
        ctx.beginPath();
        for (const seg of segs) {
          ctx.moveTo(seg.x1, seg.y1);
          ctx.lineTo(seg.x2, seg.y2);
        }
        strokeBorderKindPath(kind);
      });

      if (options.customBorders && options.customBorders.length > 0) {
        for (const cb of options.customBorders) {
          if (!cb.points || cb.points.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(cb.points[0].x, cb.points[0].y);
          for (let i = 1; i < cb.points.length; i++) {
            ctx.lineTo(cb.points[i].x, cb.points[i].y);
          }
          strokeBorderKindPath(cb.kind);
        }
      }

      ctx.restore();
    } else if (options.customBorders && options.customBorders.length > 0) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const cb of options.customBorders) {
        if (!cb.points || cb.points.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(cb.points[0].x, cb.points[0].y);
        for (let i = 1; i < cb.points.length; i++) {
          ctx.lineTo(cb.points[i].x, cb.points[i].y);
        }
        ctx.strokeStyle =
          cb.kind === 'march' || cb.kind === 'disputed'
            ? '#dc2626'
            : cb.kind === 'ecclesiastical'
            ? '#6b21a8'
            : theme.borderInk;
        ctx.lineWidth = cb.kind === 'interstate' ? 2.1 : 1.4;
        ctx.setLineDash(cb.kind === 'interstate' ? [] : [6, 3.5]);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    // 7. Unified Carved Hydrology Pass — Rivers, Flared Estuaries & Freshwater Lakes
    // Physically cuts through land, political washes, and ocean coastlines rather than sitting as a translucent layer on top.
    const riverData = options.activeLayers.rivers
      ? buildHydraulicRiverNetwork(mesh, sim, seaLevel, seasonal.riverSwelling)
      : null;

    if (riverData && options.customRivers && options.customRivers.length > 0) {
      for (const cr of options.customRivers) {
        if (cr.points && cr.points.length >= 2) {
          riverData.chains.push(customRiverToChain(cr, seasonal.riverSwelling));
        }
      }
    }

    const lakeTrace = sim.isLake
      ? traceMergedGroupLoops(
          mesh,
          (r) => Boolean(sim.isLake && sim.isLake[r]),
          width,
          height,
          2 // 2 passes of Chaikin smoothing for organic, soft lake shorelines
        )
      : { loops: [] as Point2D[][], boundaryFallbackRegions: [] as number[] };

    const hasRivers = Boolean(riverData && riverData.chains.length > 0);
    const hasLakes = lakeTrace.loops.length > 0 || lakeTrace.boundaryFallbackRegions.length > 0;

    if (hasRivers || hasLakes) {
      drawCarvedHydrology2D(
        ctx,
        mesh,
        sim,
        seaLevel,
        seasonal,
        allLandLoops,
        allLandFallback,
        riverData,
        lakeTrace.loops,
        lakeTrace.boundaryFallbackRegions
      );
    }

    // 8. Masterwork Cartographic Relief — Displayed across Political, Geographic, Simulation & Brush Modes whenever Relief layer is enabled
    if (options.activeLayers.relief) {
      let reliefSeasonal = options.seasonal;
      if (!reliefSeasonal) {
        const p = options.season === 'Winter' ? 3.5 : options.season === 'Autumn' ? 2.5 : options.season === 'Summer' ? 1.5 : 0.5;
        reliefSeasonal = computeSeasonalState(p, options.weatherEvent);
      }
      ctx.save();
      ctx.globalAlpha = activeMapMode === 'geographic' || theme.id === 'ink' || theme.id === 'hand_drawn' ? 1.0 : 0.88;
      drawCartographicReliefs(ctx, mesh, sim, burgs, seaLevel, reliefSeasonal, options, cells);
      ctx.restore();
    }

    // 8B. Unified, High-Contrast Territory Outline for Selected Duke/Duchy, County, or Barony
    const territoryMask = resolveSelectedTerritoryMask({
      selectionFocus: options.selectionFocus,
      selectedCountyId: options.selectedCountyId,
      selectedBurgId: options.selectedBurgId,
      selectedCharacterId: options.selectedCharacterId,
      counties,
      burgs,
      characters: options.characters,
      cells,
    });
    if (territoryMask) {
      const selZoom = Math.max(0.75, options.zoomLevel || 1.0);
      const { loops, boundaryFallbackRegions } = traceMergedGroupLoops(
        mesh,
        (r) => elevation[r] >= seaLevel && territoryMask.cellSet.has(r),
        width,
        height,
        1
      );
      if (loops.length > 0 || boundaryFallbackRegions.length > 0) {
        ctx.save();
        drawMergedLoops(ctx, mesh, loops, boundaryFallbackRegions, territoryMask.fillColor);

        ctx.beginPath();
        for (const loop of loops) {
          if (loop.length < 3) continue;
          ctx.moveTo(loop[0].x, loop[0].y);
          for (let i = 1; i < loop.length; i++) ctx.lineTo(loop[i].x, loop[i].y);
          ctx.closePath();
        }
        for (const r of boundaryFallbackRegions) {
          const poly = mesh.r_polygon[r];
          if (!poly || poly.length < 3) continue;
          ctx.moveTo(poly[0].x, poly[0].y);
          for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
          ctx.closePath();
        }

        const scaleInv = Math.pow(selZoom, 0.42);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.setLineDash([]);

        // Pass 1: Soft warm translucent golden halo (restrained, never neon)
        ctx.save();
        ctx.strokeStyle = 'rgba(217, 164, 24, 0.28)';
        ctx.lineWidth = Math.max(4.0, 6.8 / scaleInv);
        ctx.shadowColor = 'rgba(234, 179, 8, 0.38)';
        ctx.shadowBlur = 5;
        ctx.stroke();
        ctx.restore();

        // Pass 2: Warm muted gold selection ribbon
        ctx.strokeStyle = 'rgba(234, 179, 8, 0.72)';
        ctx.lineWidth = Math.max(2.2, 3.6 / scaleInv);
        ctx.stroke();

        // Pass 3: Soft muted warm-sepia dashed line centered INSIDE the gold outline
        ctx.strokeStyle = 'rgba(116, 88, 34, 0.54)';
        ctx.lineWidth = Math.max(0.95, 1.35 / scaleInv);
        ctx.setLineDash([5.5 / scaleInv, 4.5 / scaleInv]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.restore();
      }
    }

    const z = options.zoomLevel || 1.0;

    if (!options.activeLayers.routes || !options.tradeNetwork || options.tradeNetwork.routes.length === 0) {
      if (options.activeLayers.routes) {
        drawFallbackRoutes(ctx, realms, burgs, z);
      }
    } else {
      drawCartographicTradeRoutes(ctx, options.tradeNetwork.routes, options.selectedRouteId, z);
    }

    // =========================================================================
    // LEVEL-OF-DETAIL (LOD) TITLES:
    //   Tier 1 (Macro, z < 1.25): Kingdoms, Duchies & Capitals only
    //   Tier 2 (Meso, 1.25 <= z < 2.2): + Counties
    //   Tier 3 (Micro, z >= 2.2): + Baronies, Cities, Towns, Ports, Villages & Hamlets
    // =========================================================================
    const isMacro = z < 1.25;
    const isMeso = z >= 1.25 && z < 2.2;
    const isMicro = z >= 2.2;

    const visRealms = new Set<string>();
    const visCounties = new Set<string>();
    const visBurgs = new Set<string>();

    const baronyBurgIds = new Set<string>();
    for (const c of counties) {
      if (c.baronyBurgIds) {
        for (const bid of c.baronyBurgIds) baronyBurgIds.add(bid);
      }
    }

    const placedAdminLabelRects: { x1: number; y1: number; x2: number; y2: number }[] = [];
    // Reserve small zones around visible settlements so Duchy/County titles never stamp over cities
    for (const b of burgs) {
      const isVisibleAtZoom = isMicro || b.isCapital || b.id === options.selectedBurgId;
      if (!isVisibleAtZoom) continue;
      const pad = (b.isCapital ? 20 : 12) / Math.pow(Math.max(1, z), 0.4);
      placedAdminLabelRects.push({ x1: b.x - pad, y1: b.y - pad, x2: b.x + pad, y2: b.y + pad + 10 });
    }

    const stripTitlePrefix = (raw: string): string =>
      raw
        .replace(
          /^(?:High\s+Realm|Grand\s+Duchy|Royal\s+Duchy|Crown\s+Duchy|Archduchy|Duchy|Appanage\s+County|Crown\s+County|County|Earldom|Viscounty|Margraviate|March|Barony|Principality)\s+of\s+/i,
          ''
        )
        .trim();

    const snapAnchorToLand = (cx: number, cy: number, candidateCells: number[]): { x: number; y: number } => {
      if (candidateCells.length === 0) return { x: cx, y: cy };
      let bestR = candidateCells[0];
      let bestD2 = Infinity;
      for (const r of candidateCells) {
        const dx = r_x[r] - cx;
        const dy = r_y[r] - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestR = r;
        }
      }
      // If centroid is already very close to a land cell, keep smooth centroid; otherwise snap onto land
      return bestD2 <= 220 ? { x: cx, y: cy } : { x: r_x[bestR], y: r_y[bestR] };
    };

    // 1. REALM TITLES — Macro zoom ONLY (clean, spacious, never collides with Duchies/Counties)
    if (options.activeLayers.political && isMacro) {
      ctx.save();
      for (const realm of realms) {
        let sumX = 0, sumY = 0;
        let minX = Infinity, maxX = -Infinity;
        const landCells: number[] = [];
        for (let r = 0; r < numRegions; r++) {
          if (elevation[r] >= seaLevel && regionRealmMap.get(r)?.id === realm.id) {
            sumX += r_x[r];
            sumY += r_y[r];
            if (r_x[r] < minX) minX = r_x[r];
            if (r_x[r] > maxX) maxX = r_x[r];
            landCells.push(r);
          }
        }

        if (landCells.length > 0) {
          visRealms.add(realm.id);
          const anchor = snapAnchorToLand(sumX / landCells.length, sumY / landCells.length, landCells);
          const isSelected = options.selectedRealmId === realm.id;
          const baseLabel =
            activeMapMode === 'cultural'
              ? realm.culture || realm.name
              : activeMapMode === 'religious'
              ? realm.religion || realm.name
              : landCells.length < 55
              ? stripTitlePrefix(realm.name)
              : realm.name;
          const shortName = baseLabel.toUpperCase();

          let screenPx = Math.max(10.2, Math.min(12.6, 9.6 + Math.sqrt(landCells.length) * 0.16)) + (isSelected ? 0.8 : 0);
          let realmFontPx = screenPx / Math.max(0.75, z);
          ctx.font = `600 ${realmFontPx.toFixed(2)}px "Cinzel", Georgia, serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          // Constrain realm label width so it stays neatly over its own landmass
          const realmSpanW = Math.max(68, (maxX - minX) * 0.86);
          const measuredW = ctx.measureText(shortName).width * 1.15;
          if (measuredW > realmSpanW) {
            const fitScale = Math.max(0.68, realmSpanW / measuredW);
            realmFontPx *= fitScale;
            ctx.font = `600 ${realmFontPx.toFixed(2)}px "Cinzel", Georgia, serif`;
          }

          drawCartographicText(ctx, shortName, anchor.x, anchor.y, {
            fillColor: isSelected ? '#5c2800' : '#1a130c',
            fontPx: realmFontPx,
            zoom: z,
            letterSpacing: '0.13em',
            strength: 'strong',
          });
          const tw = ctx.measureText(shortName).width * 1.15;
          placedAdminLabelRects.push({
            x1: anchor.x - tw / 2 - 4 / z,
            y1: anchor.y - realmFontPx * 0.72,
            x2: anchor.x + tw / 2 + 4 / z,
            y2: anchor.y + realmFontPx * 0.72,
          });
        }
      }
      ctx.restore();
    }

    // 2. DUCHY TITLES — Visible on BOTH Macro (zoomed out) and Meso zoom levels
    if ((options.activeLayers.feudal || options.activeLayers.political) && (isMacro || isMeso)) {
      ctx.save();
      const duchies = counties.filter((c) => c.tier === 'Duchy' || c.name.includes('Duchy'));
      const duchyFontPx = (isMacro ? 8.2 : 9.4) / Math.max(0.85, z);

      for (const duchy of duchies) {
        let dX = 0, dY = 0;
        const landCells: number[] = [];
        const memberCounties = duchy.duchyId
          ? counties.filter((c) => c.duchyId === duchy.duchyId || c.id === duchy.id)
          : [duchy];
        for (const mc of memberCounties) {
          for (const idx of mc.cellIndices) {
            if (elevation[idx] >= seaLevel) {
              dX += r_x[idx];
              dY += r_y[idx];
              landCells.push(idx);
            }
          }
        }

        if (landCells.length > 0) {
          for (const mc of memberCounties) visCounties.add(mc.id);
          visCounties.add(duchy.id);
          const anchor = snapAnchorToLand(dX / landCells.length, dY / landCells.length, landCells);
          const duchyTitle = stripTitlePrefix(duchy.duchyName || duchy.name).toUpperCase();

          ctx.font = `600 ${duchyFontPx.toFixed(2)}px "Cinzel", Georgia, serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          const dw = ctx.measureText(duchyTitle).width * 1.12;
          const padX = 4 / z;
          const halfH = duchyFontPx * 0.68;

          // Try center first, then slight vertical offsets so Duchy names tuck neatly around Realm titles on Macro
          const offsets = isMacro ? [0, 11 / z, -11 / z, 18 / z, -18 / z] : [0, 10 / z, -10 / z];
          let chosenY: number | null = null;
          for (const dy of offsets) {
            const cy = anchor.y + dy;
            const x1 = anchor.x - dw / 2 - padX;
            const x2 = anchor.x + dw / 2 + padX;
            const y1 = cy - halfH;
            const y2 = cy + halfH;
            const overlaps = placedAdminLabelRects.some(
              (r) => !(x2 < r.x1 || x1 > r.x2 || y2 < r.y1 || y1 > r.y2)
            );
            if (!overlaps) {
              chosenY = cy;
              placedAdminLabelRects.push({ x1, y1, x2, y2 });
              break;
            }
          }
          if (chosenY === null) continue;

          drawCartographicText(ctx, duchyTitle, anchor.x, chosenY, {
            fillColor: isMacro ? '#2d2218' : '#211810',
            fontPx: duchyFontPx,
            zoom: z,
            letterSpacing: '0.10em',
            strength: 'soft',
          });
        }
      }
      ctx.restore();
    }

    // 3. COUNTY TITLES — Micro zoom ONLY (quiet, concise italic Lora sitting peacefully in open land)
    if ((options.activeLayers.feudal || options.activeLayers.political) && isMicro) {
      ctx.save();
      const localCounties = counties
        .filter((c) => c.tier !== 'Duchy' && !c.name.includes('Duchy'))
        .sort((a, b) => {
          const selA = a.id === options.selectedCountyId ? 10000 : 0;
          const selB = b.id === options.selectedCountyId ? 10000 : 0;
          return (selB + (b.cellIndices?.length || 0)) - (selA + (a.cellIndices?.length || 0));
        });

      const countyFontPx = 9.0 / Math.max(1, z);
      const padMargin = 5 / z;

      for (const county of localCounties) {
        const isSelectedCounty = county.id === options.selectedCountyId;

        let cX = 0, cY = 0;
        const landCells: number[] = [];
        for (const idx of county.cellIndices) {
          if (elevation[idx] >= seaLevel) {
            cX += r_x[idx];
            cY += r_y[idx];
            landCells.push(idx);
          }
        }

        if (landCells.length > 0) {
          const anchor = snapAnchorToLand(cX / landCells.length, cY / landCells.length, landCells);
          const countyTitle = stripTitlePrefix(county.name);

          ctx.font = `italic 600 ${countyFontPx.toFixed(2)}px "Lora", Georgia, serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          const textW = ctx.measureText(countyTitle).width * 1.05;
          const halfW = textW / 2 + padMargin;
          const halfH = countyFontPx * 0.78 + padMargin * 0.5;

          const candidateOffsets = [0, -14 / z, 14 / z, -24 / z, 24 / z];
          let chosenY: number | null = null;

          for (const dy of candidateOffsets) {
            const cy = anchor.y + dy;
            const x1 = anchor.x - halfW;
            const x2 = anchor.x + halfW;
            const y1 = cy - halfH;
            const y2 = cy + halfH;
            const overlaps = placedAdminLabelRects.some(
              (r) => !(x2 < r.x1 || x1 > r.x2 || y2 < r.y1 || y1 > r.y2)
            );
            if (!overlaps || (isSelectedCounty && dy === 0)) {
              chosenY = cy;
              placedAdminLabelRects.push({ x1, y1, x2, y2 });
              break;
            }
          }

          if (chosenY !== null) {
            visCounties.add(county.id);
            drawCartographicText(ctx, countyTitle, anchor.x, chosenY, {
              fillColor: isSelectedCounty ? '#6b2c00' : '#261b12',
              fontPx: countyFontPx,
              zoom: z,
              letterSpacing: '0.03em',
              strength: 'soft',
            });
          }
        }
      }
      ctx.restore();
    }

    // 4. SETTLEMENTS (Capitals at Macro & Meso; Cities, Towns, Ports & Villages at Micro)
    if (options.activeLayers.burgs) {
      ctx.save();

      const sortedBurgs = [...burgs].sort((a, b) => {
        const scoreA = (a.id === options.selectedBurgId ? 1000 : 0) + (a.isCapital ? 500 : 0) + (a.population || 0);
        const scoreB = (b.id === options.selectedBurgId ? 1000 : 0) + (b.isCapital ? 500 : 0) + (b.population || 0);
        return scoreB - scoreA;
      });

      const placedLabelRects: { x1: number; y1: number; x2: number; y2: number }[] = [
        ...placedAdminLabelRects,
      ];

      for (const burg of sortedBurgs) {
        const isCapital = burg.isCapital;
        const isSelected = options.selectedBurgId === burg.id;
        const isCircled = options.circledBurgId === burg.id;

        if (!isMicro && !isCapital && !isCircled) {
          continue;
        }

        const realm = realms.find((r) => r.id === burg.stateId);

        const isMinorSettlement =
          burg.tier === 'village' ||
          burg.tier === 'hamlet' ||
          burg.type === 'Farming Village' ||
          burg.type === 'Mountain Hamlet';
        const isMarketTown = burg.tier === 'town' || burg.type === 'Market Town';

        visBurgs.add(burg.id);

        if (isCircled) {
          ctx.save();
          const ringRadius = isCapital ? 21 : 17;
          ctx.beginPath();
          ctx.arc(burg.x, burg.y, ringRadius, 0, Math.PI * 2);
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 3.0;
          ctx.shadowColor = 'rgba(245, 158, 11, 0.55)';
          ctx.shadowBlur = 6;
          ctx.stroke();
          ctx.restore();
        }

        const iconScale = isCapital
          ? 1.2
          : isMinorSettlement
          ? 0.78
          : 0.95;

        const drawnWithAtlas = drawAtlasBurgSettlement(
          ctx,
          burg.type,
          burg.tier || 'city',
          isCapital,
          burg.x,
          burg.y,
          iconScale,
          options.reliefStyle || 'watercolor'
        );

        if (!drawnWithAtlas) {
          if (isCapital) drawClassicCapitalCitadel(ctx, burg.x, burg.y, realm?.heraldry.symbol || '👑', realm?.heraldry.bg || '#d97706', realm?.color || '#b45309', realm?.heraldry, realm?.id);
          else if (burg.type === 'Trade Port') drawClassicPortWithShip(ctx, burg.x, burg.y);
          else if (burg.type === 'Fishing Port') drawClassicFishingPort(ctx, burg.x, burg.y);
          else if (burg.type === 'Market Town') drawClassicMarketTown(ctx, burg.x, burg.y);
          else if (burg.type === 'Farming Village') drawClassicVillage(ctx, burg.x, burg.y);
          else if (burg.type === 'Mountain Hamlet') drawClassicHamlet(ctx, burg.x, burg.y);
          else if (burg.type === 'Border Fortress') drawClassicBorderFortress(ctx, burg.x, burg.y);
          else drawClassicMetropolis(ctx, burg.x, burg.y);
        }

        let labelText = isCapital && isMicro ? burg.name.toUpperCase() : burg.name;
        if (burg.isHolySite) {
          drawHolySiteAura(ctx, burg.x, burg.y - (isCapital ? 24 : 14));
          labelText = `✧ ${labelText}`;
        }

        const targetScreenPx = isCapital
          ? isMacro
            ? 9.2
            : isMeso
            ? 10.6
            : 13.0
          : isMinorSettlement
          ? isMicro
            ? 10.4
            : 8.6
          : isMarketTown
          ? isMicro
            ? 11.4
            : 9.2
          : isMicro
          ? 12.0
          : 9.8;
        const scaledBurgFont = targetScreenPx / Math.max(0.85, z);

        ctx.font =
          isCapital && isMicro
            ? `600 ${scaledBurgFont.toFixed(2)}px "Cinzel", Georgia, serif`
            : `${isMinorSettlement ? '500' : '600'} ${scaledBurgFont.toFixed(2)}px "Lora", Georgia, serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const baseOffset = (isCapital ? 18 : isMinorSettlement ? 11 : 13) + scaledBurgFont * 0.48;
        const textMetric = ctx.measureText(labelText);
        const labelW = textMetric.width * (isCapital && isMicro ? 1.08 : 1.02);
        const padX = 4 / Math.max(1, z);
        const halfH = scaledBurgFont * 0.7;

        // Try below icon first, then above icon, then slightly lower so Capitals & Duchy names never overlap
        const candidateYs = [
          burg.y + baseOffset,
          burg.y - baseOffset * 0.95,
          burg.y + baseOffset + scaledBurgFont * 1.4,
        ];
        let chosenLabelY: number | null = null;
        let chosenRect: { x1: number; y1: number; x2: number; y2: number } | null = null;

        for (const candY of candidateYs) {
          const rect = {
            x1: burg.x - labelW / 2 - padX,
            x2: burg.x + labelW / 2 + padX,
            y1: candY - halfH,
            y2: candY + halfH,
          };
          const hits = placedLabelRects.some(
            (r) => !(rect.x2 < r.x1 || rect.x1 > r.x2 || rect.y2 < r.y1 || rect.y1 > r.y2)
          );
          if (!hits) {
            chosenLabelY = candY;
            chosenRect = rect;
            break;
          }
        }

        if (chosenLabelY === null && (isSelected || isCircled || isCapital)) {
          chosenLabelY = candidateYs[1];
          chosenRect = {
            x1: burg.x - labelW / 2 - padX,
            x2: burg.x + labelW / 2 + padX,
            y1: chosenLabelY - halfH,
            y2: chosenLabelY + halfH,
          };
        }

        if (chosenLabelY !== null && chosenRect !== null) {
          placedLabelRects.push(chosenRect);
          const textColor = isCircled
            ? '#6b2c00'
            : isCapital
            ? '#140f0a'
            : isMinorSettlement
            ? '#2a2017'
            : '#18110b';
          drawCartographicText(ctx, labelText, burg.x, chosenLabelY, {
            fillColor: textColor,
            fontPx: scaledBurgFont,
            zoom: z,
            letterSpacing: isCapital && isMicro ? '0.07em' : '0.015em',
            strength: isCapital ? 'medium' : 'soft',
          });
        }
      }
      ctx.restore();
    }

    if (options.visibleEntities) {
      options.visibleEntities.realmIds = visRealms;
      options.visibleEntities.countyIds = visCounties;
      options.visibleEntities.burgIds = visBurgs;
    }

    drawClassicCartouche(ctx, width - 248, 22, options.worldName, options.currentYear, theme);
    const scaleDrawn = drawAtlasScale(ctx, 36, height - 28, 120);
    if (!scaleDrawn) {
      drawClassicScaleBar(ctx, 36, height - 38);
    }
    const compassDrawn = drawAtlasCompassRose(ctx, 75, height - 95, 86);
    if (!compassDrawn) {
      drawClassicCompassRose(ctx, 70, height - 100);
    }
    drawClassicNeatline(ctx, width, height, theme);

    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = theme.paperTint;
    ctx.fillRect(0, 0, width, height);
    if (theme.vignetteAlpha > 0) {
      const vig = ctx.createRadialGradient(
        width * 0.5,
        height * 0.5,
        Math.min(width, height) * 0.34,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.72
      );
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, `rgba(68, 44, 20, ${theme.vignetteAlpha})`);
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.globalCompositeOperation = 'source-over';
  } // End Static Rendering

  if (mode === 'all' || mode === 'dynamic') {
    const projectY = (_x: number, y: number) => y;

    // Zoom-Aware Hover Highlight (Duchy at Macro, County at Meso, Barony at Micro)
    if (options.hoveredTerritoryMask && options.hoveredTerritoryMask.cellSet.size > 0) {
      const hoverMask = options.hoveredTerritoryMask;
      const hoverZoom = Math.max(0.75, options.zoomLevel || 1.0);
      const { loops, boundaryFallbackRegions } = traceMergedGroupLoops(
        mesh,
        (r) => elevation[r] >= seaLevel && hoverMask.cellSet.has(r),
        width,
        height,
        1
      );
      if (loops.length > 0 || boundaryFallbackRegions.length > 0) {
        ctx.save();
        drawMergedLoops(ctx, mesh, loops, boundaryFallbackRegions, 'rgba(234, 179, 8, 0.06)');

        ctx.beginPath();
        for (const loop of loops) {
          if (loop.length < 3) continue;
          ctx.moveTo(loop[0].x, loop[0].y);
          for (let i = 1; i < loop.length; i++) ctx.lineTo(loop[i].x, loop[i].y);
          ctx.closePath();
        }
        for (const r of boundaryFallbackRegions) {
          const poly = mesh.r_polygon[r];
          if (!poly || poly.length < 3) continue;
          ctx.moveTo(poly[0].x, poly[0].y);
          for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
          ctx.closePath();
        }

        const scaleInv = Math.pow(hoverZoom, 0.42);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.setLineDash([]);

        ctx.strokeStyle = 'rgba(217, 164, 24, 0.24)';
        ctx.lineWidth = Math.max(3.2, 5.4 / scaleInv);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(234, 179, 8, 0.62)';
        ctx.lineWidth = Math.max(1.2, 1.9 / scaleInv);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Dynamic Overlays
    if (options.activeLayers.banners !== false) {
      drawStateAndDuchyBanners(ctx, realms, counties, burgs, options.zoomLevel || 1.0, projectY);
    }

    if (options.activeLayers.routes && options.tradeNetwork && options.activeLayers.caravans !== false) {
      drawCartographicCaravans(ctx, options.tradeNetwork.caravans, options.tradeNetwork.routes, options.caravanTick || 0, options.zoomLevel || 1.0, projectY);
    }
    
    // RENDER MEDIEVAL GONFALON BANNERS & TROOP COUNTERS
    if (options.armies && options.armies.length > 0 && options.activeLayers.armies !== false) {
      const armies = options.armies;
      const tick = options.caravanTick || 0;
      const zoom = options.zoomLevel || 1.0;
      const invScale = 1 / Math.pow(Math.max(0.75, zoom), 0.72);
      const placedPositions: { x: number; y: number }[] = [];

      for (let idx = 0; idx < armies.length; idx++) {
        const army = armies[idx];
        const p = Math.max(0, Math.min(1, army.progress || 0));
        const pos = getArmyPositionAtProgress(army);
        let curX = pos.x;
        let curY = projectY(pos.x, pos.y);
        let headingDx = army.targetX - army.startX;

        // Road, terrain & maritime port-to-port campaign trajectory
        if (!army.isReturning && p < 0.98) {
          ctx.save();
          ctx.lineWidth = Math.max(1.0, 1.65 * invScale);
          ctx.setLineDash([4.5 * invScale, 3.5 * invScale]);
          const wps = army.waypoints;
          if (wps && wps.length >= 2) {
            const totalCost = wps[wps.length - 1].cumCost || 1;
            const curCost = p * totalCost;
            let prevPt: { x: number; y: number; isRoad?: boolean; isSea?: boolean } = {
              x: curX,
              y: curY,
              isRoad: pos.isRoad,
              isSea: pos.isSea,
            };
            for (const wp of wps) {
              if (wp.cumCost <= curCost) continue;
              const wpProjY = projectY(wp.x, wp.y);
              if (Math.hypot(wp.x - prevPt.x, wpProjY - prevPt.y) > 0.5 && headingDx === army.targetX - army.startX) {
                headingDx = wp.x - prevPt.x;
              }
              const isMaritimeSeg = Boolean(wp.isSea || prevPt.isSea);
              ctx.strokeStyle = isMaritimeSeg
                ? 'rgba(56, 189, 248, 0.88)'
                : wp.isRoad && prevPt.isRoad
                ? army.isDefender
                  ? 'rgba(56, 189, 248, 0.72)'
                  : 'rgba(245, 158, 11, 0.78)'
                : army.isDefender
                ? 'rgba(59, 130, 246, 0.52)'
                : 'rgba(220, 38, 38, 0.55)';
              ctx.beginPath();
              ctx.moveTo(prevPt.x, prevPt.y);
              ctx.lineTo(wp.x, wpProjY);
              ctx.stroke();

              // Draw a crisp port embarkation/disembarkation beacon
              if (wp.portBurgId) {
                ctx.setLineDash([]);
                ctx.fillStyle = '#38bdf8';
                ctx.strokeStyle = '#0c4a6e';
                ctx.lineWidth = 1.1 * invScale;
                ctx.beginPath();
                ctx.arc(wp.x, wpProjY, 3.2 * invScale, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.setLineDash([4.5 * invScale, 3.5 * invScale]);
              }
              prevPt = { x: wp.x, y: wpProjY, isRoad: wp.isRoad, isSea: wp.isSea };
            }
          } else {
            ctx.strokeStyle = army.isEmbarked
              ? 'rgba(56, 189, 248, 0.85)'
              : army.isDefender
              ? 'rgba(59, 130, 246, 0.5)'
              : 'rgba(220, 38, 38, 0.52)';
            ctx.beginPath();
            ctx.moveTo(curX, curY);
            ctx.lineTo(army.targetX, projectY(army.targetX, army.targetY));
            ctx.stroke();
          }
          ctx.setLineDash([]);
          ctx.restore();
        }

        // De-overlap converging hosts around the same castle/battlefield
        let clusterCount = 0;
        for (const prev of placedPositions) {
          if (Math.hypot(prev.x - curX, prev.y - curY) < 20 * invScale) clusterCount++;
        }
        placedPositions.push({ x: curX, y: curY });
        if (clusterCount > 0) {
          const offsetAngle = clusterCount * 2.1;
          curX += Math.cos(offsetAngle) * 14 * invScale;
          curY += Math.sin(offsetAngle) * 10 * invScale;
        }

        const dir = headingDx >= 0 ? -1 : 1; // Pennant streams opposite march direction
        const isAtSea = Boolean(pos.isSea || army.isEmbarked);
        const marchBobY = isAtSea
          ? Math.sin(tick * 3.8 + idx) * 1.6
          : p < 0.99 && !army.awaitingShipFunds
          ? Math.abs(Math.sin(tick * 6.0 + idx * 1.9)) * -1.4
          : 0;
        const waveX = Math.sin(tick * 4.5 + idx * 1.7 + curX * 0.05) * 2.2;
        const waveY = Math.cos(tick * 5.2 + idx * 1.3) * 1.2;
        const troopText =
          army.strength >= 1000
            ? `${(army.strength / 1000).toFixed(1)}k`
            : `${Math.round(army.strength)}`;

        const avgMorale =
          army.regiments && army.regiments.length > 0
            ? army.regiments.reduce((sum, r) => sum + r.morale, 0) / army.regiments.length
            : 100;
        const isBesiegingCamp = !army.isReturning && !army.isDefender && p >= 0.99 && !isAtSea;
        const isSelectedArmy = options.selectedArmyId === army.id;

        ctx.save();
        ctx.translate(curX, curY + marchBobY);
        ctx.scale(invScale, invScale);
        if (options.isBuilderMode) {
          ctx.globalAlpha = 0.28;
        } else if (army.isReturning) {
          ctx.globalAlpha = 0.72;
        }

        // Player Selection Halo
        if (isSelectedArmy) {
          const haloRadius = 15 + Math.sin(tick * 4.2) * 1.5;
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          ctx.ellipse(0, 4, haloRadius, haloRadius * 0.55, 0, 0, Math.PI * 2);
          ctx.stroke();
        }

        if (isAtSea) {
          // Draw Medieval Transport Ship / Cog Hull & Wake when sailing at sea
          ctx.strokeStyle = 'rgba(186, 230, 253, 0.72)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.ellipse(0, 6.5, 11.5, 3.2, 0, 0, Math.PI * 2);
          ctx.stroke();

          // Oak Hull
          ctx.fillStyle = '#78350f';
          ctx.strokeStyle = '#451a03';
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(-10, 1);
          ctx.lineTo(10, 1);
          ctx.lineTo(7, 6);
          ctx.lineTo(-7, 6);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Billowing Square Sail
          ctx.fillStyle = '#f8fafc';
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(-6, -12);
          ctx.quadraticCurveTo(0, -14, 6, -12);
          ctx.quadraticCurveTo(8, -6, 6, -1);
          ctx.quadraticCurveTo(0, -2, -6, -1);
          ctx.quadraticCurveTo(-4, -6, -6, -12);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else {
          // Ground anchor shadow
          ctx.fillStyle = 'rgba(15, 10, 5, 0.36)';
          ctx.beginPath();
          ctx.ellipse(0, 5, 6.5, 2.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        // Siege encampment ring pulse when camped outside enemy walls
        if (isBesiegingCamp) {
          const pulse = 10 + Math.sin(tick * 3.5 + idx) * 2;
          ctx.strokeStyle = 'rgba(220, 38, 38, 0.65)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.ellipse(0, 3, pulse, pulse * 0.52, 0, 0, Math.PI * 2);
          ctx.stroke();
        }

        // 1. Iron Lance Flagpole / Ship Mast
        ctx.strokeStyle = '#1c1917';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(0, isAtSea ? 1 : 5);
        ctx.lineTo(0, -23);
        ctx.stroke();

        // Steel Spearpoint Tip
        ctx.fillStyle = army.isDefender ? '#cbd5e1' : '#e2e8f0';
        ctx.beginPath();
        ctx.moveTo(0, -27.5);
        ctx.lineTo(2.2, -23);
        ctx.lineTo(-2.2, -23);
        ctx.closePath();
        ctx.fill();

        // 2. Directional Swallowtail Silk Pennant (with cloth fold gradient)
        const fly = 19 * dir + waveX * dir;
        const notch = 12 * dir + waveX * 0.6 * dir;
        const pennantGrad = ctx.createLinearGradient(0, -22, fly, -8);
        pennantGrad.addColorStop(0, army.color || (army.isDefender ? '#2563eb' : '#991b1b'));
        pennantGrad.addColorStop(1, 'rgba(18, 12, 8, 0.78)');

        ctx.fillStyle = pennantGrad;
        ctx.beginPath();
        ctx.moveTo(0, -22);
        ctx.lineTo(fly, -22 + waveY);
        ctx.lineTo(notch, -15 + waveY * 0.5);
        ctx.lineTo(fly, -8 + waveY);
        ctx.lineTo(0, -8);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = army.isDefender ? '#e2e8f0' : '#fde68a';
        ctx.lineWidth = 0.85;
        ctx.stroke();

        // 3. Troop Count Badge + Regiment Morale Bar
        ctx.font = 'bold 9px "Plus Jakarta Sans", system-ui, sans-serif';
        const label = isBesiegingCamp ? `⚔ ${troopText}` : troopText;
        const tw = ctx.measureText(label).width;
        const pillW = tw + 10;
        const pillX = -pillW / 2;

        ctx.fillStyle = 'rgba(20, 16, 12, 0.92)';
        ctx.strokeStyle = isSelectedArmy ? '#fbbf24' : army.isDefender ? '#94a3b8' : '#b45309';
        ctx.lineWidth = isSelectedArmy ? 1.5 : 1.0;
        ctx.beginPath();
        ctx.roundRect(pillX, 4, pillW, 15, 3);
        ctx.fill();
        ctx.stroke();

        // Thin morale bar along bottom of badge
        const moraleRatio = Math.max(0.08, Math.min(1, avgMorale / 100));
        ctx.fillStyle =
          moraleRatio > 0.6 ? '#22c55e' : moraleRatio > 0.35 ? '#f59e0b' : '#ef4444';
        ctx.fillRect(pillX + 2, 16.5, (pillW - 4) * moraleRatio, 1.5);

        ctx.fillStyle = '#fef3c7';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, 0, 11);

        // Commander nameplate on close zoom
        if ((zoom >= 1.6 || isSelectedArmy) && army.commanderName) {
          const cmdFontPx = 10 / Math.max(1.2, zoom);
          ctx.font = `600 ${cmdFontPx.toFixed(2)}px "Cinzel", Georgia, serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          drawCartographicText(ctx, army.commanderName, 0, 26, {
            fillColor: '#fde68a',
            edgeColor: 'rgba(15, 11, 7, 0.78)',
            shadowColor: 'rgba(8, 6, 4, 0.60)',
            fontPx: cmdFontPx,
            zoom,
            letterSpacing: '0.06em',
            edgeRatio: 0.11,
          });
        }

        ctx.restore();
      }
    }

    let seasonal = options.seasonal;
    if (!seasonal) {
      const p = options.season === 'Winter' ? 3.5 : options.season === 'Autumn' ? 2.5 : options.season === 'Summer' ? 1.5 : 0.5;
      seasonal = computeSeasonalState(p, options.weatherEvent);
    }
    if (options.activeLayers.weather !== false || options.activeLayers.wind) {
      drawSeasonalWeatherAtmosphere(ctx, width, height, seasonal, options.weatherEvent, options.caravanTick || 0, options.windAngleDeg || 30, options.activeLayers.wind);
    }
    if (options.provinces && options.activeLayers.provinces !== false) {
      drawV17Provinces(ctx, options.provinces, options.lockedDownProvinces || []);
    }
    if (options.epidemics && options.epidemics.length > 0 && options.activeLayers.epidemics !== false) {
      drawV17Epidemics(ctx, options.epidemics, options.provinces || [], options.lockedDownProvinces || [], options.caravanTick || 0, projectY);
    }
    if (options.holdings && options.holdings.length > 0) {
      drawOccupiedSettlementsOverlay(
        ctx,
        mesh,
        burgs,
        realms,
        options.holdings,
        cells,
        options.zoomLevel || 1,
        projectY
      );
    }
    if (options.activeLayers.devastation) {
      drawDevastationHeatmapOverlay(ctx, burgs, options.caravanTick || 0, options.zoomLevel || 1, projectY);
    }
    if (options.characters && options.provinces) {
      drawV17TravelingNobles(ctx, options.characters, options.provinces, options.caravanTick || 0, projectY);
    }
    if (options.mapPins && options.mapPins.length > 0) {
      drawWorldMapPins(ctx, options.mapPins, options.zoomLevel || 1, projectY, Boolean(options.isBuilderMode));
    }
  } // End Dynamic Rendering
}

function drawWorldMapPins(
  ctx: CanvasRenderingContext2D,
  pins: MapPin[],
  zoom: number,
  projectY: (x: number, y: number) => number,
  isBuilderMode: boolean
) {
  const invScale = 1 / Math.pow(Math.max(0.75, zoom), 0.72);
  ctx.save();
  for (const pin of pins) {
    const px = pin.x;
    const py = projectY(pin.x, pin.y);
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(invScale, invScale);
    ctx.globalAlpha = isBuilderMode ? 0.98 : 0.85;

    // Pin teardrop halo
    ctx.fillStyle = 'rgba(28, 25, 23, 0.92)';
    ctx.strokeStyle = isBuilderMode ? '#f59e0b' : '#cbd5e1';
    ctx.lineWidth = isBuilderMode ? 1.8 : 1.2;
    ctx.beginPath();
    ctx.arc(0, -10, 8.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-4, -3);
    ctx.lineTo(0, 2);
    ctx.lineTo(4, -3);
    ctx.closePath();
    ctx.fillStyle = isBuilderMode ? '#f59e0b' : '#475569';
    ctx.fill();

    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fef3c7';
    ctx.fillText(pin.icon || '📍', 0, -9.5);

    if (pin.label) {
      ctx.font = '600 9px "Plus Jakarta Sans", system-ui, sans-serif';
      const tw = ctx.measureText(pin.label).width;
      ctx.fillStyle = 'rgba(15, 11, 7, 0.78)';
      ctx.beginPath();
      ctx.roundRect(-tw / 2 - 4, 4, tw + 8, 12, 3);
      ctx.fill();
      ctx.fillStyle = '#fde68a';
      ctx.fillText(pin.label, 0, 10);
    }
    ctx.restore();
  }
  ctx.restore();
}

interface EstuaryFunnelGeom {
  x0: number;
  y0: number;
  mx: number;
  my: number;
  ux: number;
  uy: number;
  px: number;
  py: number;
  neckHalfW: number;
  mouthHalfW: number;
  flareLen: number;
  fluxScale: number;
  waterFlux: number;
}

function collectEstuaryFunnels(
  mesh: VoronoiDualMesh,
  sim: TerrainSimulationResult,
  seaLevel: number
): EstuaryFunnelGeom[] {
  const { numRegions, r_x, r_y } = mesh;
  const { elevation, isRiver, waterFlux, downhill, isOcean } = sim;
  const result: EstuaryFunnelGeom[] = [];

  for (let r = 0; r < numRegions; r++) {
    if (!isRiver[r] || waterFlux[r] < 22) continue;
    const d = downhill[r];
    if (d < 0 || d === r) continue;

    const entersOcean = isOcean ? isOcean[d] : elevation[d] < seaLevel;
    if (!entersOcean) continue;

    const x0 = r_x[r];
    const y0 = r_y[r];
    const x1 = r_x[d];
    const y1 = r_y[d];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 1.5 || segLen > 85) continue;

    const ux = dx / segLen;
    const uy = dy / segLen;
    const px = -uy;
    const py = ux;

    const fluxScale = Math.min(1.85, 0.72 + Math.log10(Math.max(10, waterFlux[r])) * 0.42);
    const neckHalfW = 1.5 * fluxScale;
    const mouthHalfW = 5.2 * fluxScale;
    const flareLen = Math.min(segLen * 0.96, 16.5 * fluxScale);

    result.push({
      x0,
      y0,
      mx: x0 + ux * flareLen,
      my: y0 + uy * flareLen,
      ux,
      uy,
      px,
      py,
      neckHalfW,
      mouthHalfW,
      flareLen,
      fluxScale,
      waterFlux: waterFlux[r],
    });
  }
  return result;
}

function traceEstuaryFunnelSubpath(
  ctx: CanvasRenderingContext2D,
  est: EstuaryFunnelGeom,
  widthExpansion = 0
): void {
  const halfExp = widthExpansion * 0.5;
  const nw = est.neckHalfW + halfExp;
  const mw = est.mouthHalfW + halfExp;
  const midX = est.x0 + est.ux * (est.flareLen * 0.55);
  const midY = est.y0 + est.uy * (est.flareLen * 0.55);
  const ctrlW = mw * 0.62;

  ctx.moveTo(est.x0 + est.px * nw, est.y0 + est.py * nw);
  ctx.quadraticCurveTo(
    midX + est.px * ctrlW,
    midY + est.py * ctrlW,
    est.mx + est.px * mw,
    est.my + est.py * mw
  );
  ctx.lineTo(est.mx - est.px * mw, est.my - est.py * mw);
  ctx.quadraticCurveTo(
    midX - est.px * ctrlW,
    midY - est.py * ctrlW,
    est.x0 - est.px * nw,
    est.y0 - est.py * nw
  );
  ctx.closePath();
}

/**
 * Unified 5-pass physical terrain-carving hydrology renderer:
 * 1. Land-clipped recessed canyon/valley bevel (slopes surrounding land/political wash into the cut)
 * 2. Land-clipped dark shoreline cut edge (seamless with #181822 coastline; zero interior seams)
 * 3. Unclipped 100% opaque water cutout (rivers + estuaries + lakes physically slice through land & coastlines)
 * 4. Clipped directional NW bank drop-shadow + SE sunlit shore rim + thalweg depth/sheen
 * 5. Alluvial delta silt bars on major ocean mouths
 */
function drawCarvedHydrology2D(
  ctx: CanvasRenderingContext2D,
  mesh: VoronoiDualMesh,
  sim: TerrainSimulationResult,
  seaLevel: number,
  seasonal: SeasonalState,
  allLandLoops: Point2D[][],
  allLandFallback: number[],
  riverData: ReturnType<typeof buildHydraulicRiverNetwork> | null,
  lakeLoops: Point2D[][],
  lakeFallback: number[]
): void {
  const hasRivers = Boolean(riverData && riverData.chains.length > 0);
  const hasLakes = lakeLoops.length > 0 || lakeFallback.length > 0;
  const estuaries = hasRivers ? collectEstuaryFunnels(mesh, sim, seaLevel) : [];

  const waterColor = lerpColorHex('#5ca8ba', '#c3deeb', seasonal.winterWeight * 0.92);
  const coastalShelfColor = lerpColorHex('#7ca8b7', '#b8d5e4', seasonal.winterWeight * 0.88);
  const cutBankInkColor = lerpColorHex('#182028', '#4c6675', seasonal.winterWeight * 0.65);

  const traceLandMask = () => {
    ctx.beginPath();
    for (const loop of allLandLoops) {
      if (loop.length < 3) continue;
      ctx.moveTo(loop[0].x, loop[0].y);
      for (let i = 1; i < loop.length; i++) ctx.lineTo(loop[i].x, loop[i].y);
      ctx.closePath();
    }
    for (const r of allLandFallback) {
      const poly = mesh.r_polygon[r];
      if (!poly || poly.length < 3) continue;
      ctx.moveTo(poly[0].x, poly[0].y);
      for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
      ctx.closePath();
    }
  };

  const traceLakesSubpaths = (offsetX = 0, offsetY = 0) => {
    for (const loop of lakeLoops) {
      if (loop.length < 3) continue;
      ctx.moveTo(loop[0].x + offsetX, loop[0].y + offsetY);
      for (let i = 1; i < loop.length; i++) {
        ctx.lineTo(loop[i].x + offsetX, loop[i].y + offsetY);
      }
      ctx.closePath();
    }
    for (const r of lakeFallback) {
      const poly = mesh.r_polygon[r];
      if (!poly || poly.length < 3) continue;
      ctx.moveTo(poly[0].x + offsetX, poly[0].y + offsetY);
      for (let i = 1; i < poly.length; i++) {
        ctx.lineTo(poly[i].x + offsetX, poly[i].y + offsetY);
      }
      ctx.closePath();
    }
  };

  // =========================================================================
  // PASS 1 & 2 (CLIPPED STRICTLY INSIDE LAND):
  // Recessed valley bevel + crisp dark bank cut edge.
  // Clipping to land ensures ocean river mouths never get a dark rim out in the sea!
  // =========================================================================
  ctx.save();
  traceLandMask();
  ctx.clip('evenodd');
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);

  // Pass 1A: Wide outer recessed valley slope
  ctx.fillStyle = 'rgba(14, 18, 26, 0.08)';
  ctx.strokeStyle = 'rgba(14, 18, 26, 0.08)';
  if (hasRivers && riverData) {
    ctx.beginPath();
    traceRiverNetworkSubpaths(ctx, riverData, 5.6);
    for (const est of estuaries) traceEstuaryFunnelSubpath(ctx, est, 5.6);
    ctx.fill();
  }
  if (hasLakes) {
    ctx.lineWidth = 7.6;
    ctx.beginPath();
    traceLakesSubpaths();
    ctx.stroke();
  }

  // Pass 1B: Tighter inner embankment slope
  ctx.fillStyle = 'rgba(14, 18, 26, 0.16)';
  ctx.strokeStyle = 'rgba(14, 18, 26, 0.16)';
  if (hasRivers && riverData) {
    ctx.beginPath();
    traceRiverNetworkSubpaths(ctx, riverData, 2.7);
    for (const est of estuaries) traceEstuaryFunnelSubpath(ctx, est, 2.7);
    ctx.fill();
  }
  if (hasLakes) {
    ctx.lineWidth = 3.8;
    ctx.beginPath();
    traceLakesSubpaths();
    ctx.stroke();
  }

  // Pass 2: Crisp carved shoreline ink (harmonized with #181822 coastline)
  ctx.globalAlpha = 0.86;
  ctx.fillStyle = cutBankInkColor;
  ctx.strokeStyle = cutBankInkColor;
  if (hasRivers && riverData) {
    ctx.beginPath();
    traceRiverNetworkSubpaths(ctx, riverData, 1.55);
    for (const est of estuaries) traceEstuaryFunnelSubpath(ctx, est, 1.55);
    ctx.fill();
  }
  if (hasLakes) {
    ctx.lineWidth = 2.3;
    ctx.beginPath();
    traceLakesSubpaths();
    ctx.stroke();
  }
  ctx.restore();

  // =========================================================================
  // PASS 3 (UNCLIPPED — BREACHES THE COASTLINE):
  // 100% Opaque Water Cutout — completely severs land, political washes, and coastline borders!
  // =========================================================================
  ctx.save();
  ctx.globalAlpha = 1.0;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.fillStyle = waterColor;

  // 3A. Fill all lakes and rivers seamlessly in one opaque pass
  ctx.beginPath();
  if (hasLakes) traceLakesSubpaths();
  if (hasRivers && riverData) traceRiverNetworkSubpaths(ctx, riverData, 0);
  ctx.fill();

  // 3B. Fill flared ocean estuaries with a smooth river-to-coastal-shelf gradient
  // so major river mouths physically open into the sea with no hard color seam
  for (const est of estuaries) {
    const grad = ctx.createLinearGradient(est.x0, est.y0, est.mx, est.my);
    grad.addColorStop(0.0, waterColor);
    grad.addColorStop(0.65, waterColor);
    grad.addColorStop(1.0, coastalShelfColor);
    ctx.fillStyle = grad;
    ctx.beginPath();
    traceEstuaryFunnelSubpath(ctx, est, 0);
    ctx.fill();

    // Distributary branches for large rivers (waterFlux >= 45)
    if (est.waterFlux >= 45) {
      const branchAngles = [-0.44, 0.0, 0.44];
      const baseAngle = Math.atan2(est.uy, est.ux);
      ctx.strokeStyle = coastalShelfColor;
      ctx.lineWidth = Math.max(1.2, 1.55 * est.fluxScale);
      for (const offset of branchAngles) {
        const ang = baseAngle + offset;
        const bLen = est.flareLen * (offset === 0 ? 1.16 : 1.0);
        ctx.beginPath();
        ctx.moveTo(est.x0 + est.ux * (est.flareLen * 0.38), est.y0 + est.uy * (est.flareLen * 0.38));
        ctx.lineTo(est.x0 + Math.cos(ang) * bLen, est.y0 + Math.sin(ang) * bLen);
        ctx.stroke();
      }
    }
  }
  ctx.restore();

  // =========================================================================
  // PASS 4 (CLIPPED STRICTLY INSIDE THE CARVED WATER CHANNEL):
  // Directional NW bank drop-shadow (elevated land casting shadow down onto sunken water)
  // + SE sunlit interior glint + thalweg depth & flow sheen.
  // =========================================================================
  ctx.save();
  ctx.beginPath();
  if (hasLakes) traceLakesSubpaths();
  if (hasRivers && riverData) traceRiverNetworkSubpaths(ctx, riverData, 0);
  for (const est of estuaries) traceEstuaryFunnelSubpath(ctx, est, 0);
  ctx.clip();

  // 4A. Recessed NW Bank Shadow along riverbanks + thalweg depth & specular flow sheen
  if (hasRivers && riverData) {
    ctx.strokeStyle = 'rgba(12, 32, 44, 0.24)';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    traceRiverNetworkSubpaths(ctx, riverData, 0, 0.65, 0.75);
    ctx.stroke();

    drawRiverFlowAccents2D(ctx, riverData, seasonal);
  }

  // 4B. Clean lake interior refill (erases any river end-cap strokes poking into lake water)
  // followed by recessed NW Bank Drop-Shadow & SE sunlit shore glint on lakes
  if (hasLakes) {
    ctx.fillStyle = waterColor;
    ctx.beginPath();
    traceLakesSubpaths();
    ctx.fill();

    ctx.strokeStyle = 'rgba(12, 32, 44, 0.28)';
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    traceLakesSubpaths(1.0, 1.1);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(242, 252, 255, 0.26)';
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    traceLakesSubpaths(-0.6, -0.6);
    ctx.stroke();
  }
  ctx.restore();

  // =========================================================================
  // PASS 5: Alluvial Delta Sand/Silt Bars inside major ocean mouths
  // =========================================================================
  if (estuaries.length > 0) {
    const isWinter = seasonal.currentSeason === 'Winter';
    const siltBarFill = isWinter ? 'rgba(218, 226, 224, 0.62)' : 'rgba(186, 174, 138, 0.60)';
    ctx.save();
    ctx.fillStyle = siltBarFill;
    for (const est of estuaries) {
      if (est.waterFlux < 45) continue;
      const baseAngle = Math.atan2(est.uy, est.ux);
      ctx.beginPath();
      ctx.ellipse(
        est.x0 + est.ux * (est.flareLen * 0.76),
        est.y0 + est.uy * (est.flareLen * 0.76),
        2.2 * est.fluxScale,
        1.1 * est.fluxScale,
        baseAngle,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawOccupiedSettlementsOverlay(
  ctx: CanvasRenderingContext2D,
  mesh: VoronoiDualMesh,
  burgs: Burg[],
  realms: Realm[],
  holdings: Holding[],
  cells: WorldCell[],
  zoom: number,
  projectY: (x: number, y: number) => number
) {
  const occupiedHoldings = holdings.filter((h) => Boolean(h.occupiedByRealmId));
  if (occupiedHoldings.length === 0) return;

  const realmById = new Map<string, Realm>();
  for (const r of realms) realmById.set(r.id, r);

  ctx.save();

  for (const h of occupiedHoldings) {
    const occupierId = h.occupiedByRealmId;
    if (!occupierId) continue;

    const burg = burgs.find(
      (b) => b.id === h.id || `holding_${b.id}` === h.id || h.id.endsWith(b.id)
    );
    if (!burg) continue;

    // Skip if already owned by the same realm
    if (burg.stateId === occupierId) continue;

    const occupier = realmById.get(occupierId);
    const occColor = occupier?.color || '#dc2626';
    const bx = burg.x;
    const by = projectY(burg.x, burg.y);

    // Collect Voronoi territory cells belonging to this occupied settlement
    const territoryCellIndices: number[] = [];
    if (burg.cellIndices && burg.cellIndices.length > 0) {
      for (const idx of burg.cellIndices) {
        if (idx >= 0 && idx < mesh.numRegions) territoryCellIndices.push(idx);
      }
    } else if (burg.countyId) {
      for (let i = 0; i < cells.length; i++) {
        if (cells[i]?.countyId === burg.countyId) {
          territoryCellIndices.push(cells[i].index ?? i);
        }
      }
    }

    ctx.save();
    ctx.beginPath();
    let minX = bx - 24;
    let maxX = bx + 24;
    let minY = by - 24;
    let maxY = by + 24;

    if (territoryCellIndices.length > 0) {
      minX = Infinity;
      maxX = -Infinity;
      minY = Infinity;
      maxY = -Infinity;
      for (const rIdx of territoryCellIndices) {
        const poly = mesh.r_polygon[rIdx];
        if (!poly || poly.length < 3) continue;
        const p0y = projectY(poly[0].x, poly[0].y);
        ctx.moveTo(poly[0].x, p0y);
        if (poly[0].x < minX) minX = poly[0].x;
        if (poly[0].x > maxX) maxX = poly[0].x;
        if (p0y < minY) minY = p0y;
        if (p0y > maxY) maxY = p0y;
        for (let k = 1; k < poly.length; k++) {
          const py = projectY(poly[k].x, poly[k].y);
          ctx.lineTo(poly[k].x, py);
          if (poly[k].x < minX) minX = poly[k].x;
          if (poly[k].x > maxX) maxX = poly[k].x;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        }
        ctx.closePath();
      }
    } else {
      ctx.arc(bx, by, 22, 0, Math.PI * 2);
      ctx.closePath();
    }

    // 1. Translucent occupier tint wash
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = occColor;
    ctx.fill();

    // 2. Crisp 45-degree diagonal occupation hatching clipped to the settlement's territory
    ctx.clip();
    const stripeSpacing = Math.max(5, 7 / Math.max(0.85, Math.min(2.2, zoom)));
    const diagSpan = (maxX - minX) + (maxY - minY);
    ctx.globalAlpha = 0.72;
    ctx.strokeStyle = occColor;
    ctx.lineWidth = Math.max(1.4, 2.1 / Math.max(0.9, Math.min(2.0, zoom)));
    ctx.beginPath();
    for (let d = -diagSpan; d <= diagSpan; d += stripeSpacing) {
      ctx.moveTo(minX + d, minY);
      ctx.lineTo(minX + d - (maxY - minY), maxY);
    }
    ctx.stroke();
    ctx.restore();

    // 3. Occupation ring & badge right on the settlement marker
    ctx.save();
    ctx.strokeStyle = occColor;
    ctx.lineWidth = 1.9 / Math.max(0.85, Math.min(1.8, zoom));
    ctx.setLineDash([4, 2.5]);
    ctx.beginPath();
    ctx.arc(bx, by, 10.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  ctx.restore();
}

function drawDevastationHeatmapOverlay(
  ctx: CanvasRenderingContext2D,
  burgs: Burg[],
  tick: number,
  zoom: number,
  projectY: (x: number, y: number) => number
) {
  ctx.save();
  const pulse = 0.88 + 0.12 * Math.sin(tick * 2.2);

  for (const b of burgs) {
    const dev = Math.max(0, Math.min(100, Math.round(b.devastation || 0)));
    if (dev <= 0) continue;

    const bx = b.x;
    const by = projectY(b.x, b.y);
    const severity = dev / 100; // 0..1
    const baseRadius = (26 + severity * 52) * pulse;

    // Radial thermal devastation cloud (amber -> fiery orange -> deep scorched crimson)
    const grad = ctx.createRadialGradient(bx, by, 2, bx, by, baseRadius);
    if (dev >= 65) {
      grad.addColorStop(0, `rgba(185, 28, 28, ${0.72 * pulse})`);
      grad.addColorStop(0.45, `rgba(220, 38, 38, ${0.46 * pulse})`);
      grad.addColorStop(0.78, `rgba(234, 88, 12, ${0.22 * pulse})`);
      grad.addColorStop(1, 'rgba(234, 88, 12, 0)');
    } else if (dev >= 30) {
      grad.addColorStop(0, `rgba(234, 88, 12, ${0.65 * pulse})`);
      grad.addColorStop(0.5, `rgba(245, 158, 11, ${0.36 * pulse})`);
      grad.addColorStop(1, 'rgba(245, 158, 11, 0)');
    } else {
      grad.addColorStop(0, `rgba(245, 158, 11, ${0.48 * pulse})`);
      grad.addColorStop(0.55, `rgba(251, 191, 36, ${0.24 * pulse})`);
      grad.addColorStop(1, 'rgba(251, 191, 36, 0)');
    }

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(bx, by, baseRadius, 0, Math.PI * 2);
    ctx.fill();

    // Dashed scorched perimeter ring for severe devastation (>= 40%)
    if (dev >= 40) {
      ctx.save();
      ctx.strokeStyle = dev >= 70 ? 'rgba(248, 113, 113, 0.7)' : 'rgba(251, 146, 60, 0.6)';
      ctx.lineWidth = Math.max(0.8, 1.4 / Math.max(0.8, zoom));
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(bx, by, baseRadius * 0.58, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Compact devastation percentage badge
    const fontSize = Math.max(8, Math.min(11, 10 / Math.pow(Math.max(0.75, zoom), 0.35)));
    const label = `🔥 ${dev}%`;
    ctx.font = `700 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    const tw = ctx.measureText(label).width;
    const padX = 5;
    const boxW = tw + padX * 2;
    const boxH = fontSize + 6;
    const boxX = bx - boxW / 2;
    const boxY = by - boxH - 8;

    ctx.fillStyle = dev >= 65 ? 'rgba(69, 10, 10, 0.92)' : dev >= 30 ? 'rgba(67, 20, 7, 0.9)' : 'rgba(41, 37, 36, 0.88)';
    ctx.strokeStyle = dev >= 65 ? 'rgba(248, 113, 113, 0.85)' : dev >= 30 ? 'rgba(251, 146, 60, 0.85)' : 'rgba(251, 191, 36, 0.75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = dev >= 65 ? '#fecaca' : dev >= 30 ? '#fed7aa' : '#fde68a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bx, boxY + boxH / 2 + 0.5);
  }

  ctx.restore();
}

// ==========================================
// CARTOGRAPHIC RELIEF & TRADE ROUTE RENDERING
// ==========================================

export function drawCartographicReliefs(
  ctx: CanvasRenderingContext2D,
  mesh: VoronoiDualMesh,
  sim: TerrainSimulationResult,
  burgs: Burg[],
  seaLevel: number,
  seasonal: SeasonalState,
  options: AtlasRenderOptions,
  cells?: WorldCell[]
) {
  const { numRegions, r_x, r_y, r_polygon } = mesh;
  const { elevation, biomes } = sim;
  const placedFeatures: { x: number; y: number; r: number }[] = [];

  // 1. Clear zones around cities so relief art never obscures settlements
  for (const b of burgs) {
    placedFeatures.push({ x: b.x, y: b.y, r: 22 });
  }

  const hasReliefType = 'reliefType' in sim && Array.isArray((sim as any).reliefType);
  const isCoastalCell = (r: number) => Boolean(cells?.[r]?.isCoast || sim.isCoast?.[r]);
  const getReliefAt = (r: number): string | null | undefined => {
    const sr = hasReliefType ? (sim as any).reliefType[r] : undefined;
    return sr !== undefined ? sr : cells?.[r]?.reliefType;
  };
  const isClearedCell = (r: number): boolean => {
    if (!hasReliefType) return false;
    const sr = (sim as any).reliefType[r];
    const cr = cells?.[r]?.reliefType;
    return sr === null && (!cells || cr === null);
  };

  const showMountains = options.activeLayers.reliefMountains !== false;
  const showHills = options.activeLayers.reliefHills !== false;
  const showForests = options.activeLayers.reliefForests !== false;
  const showTrees = options.activeLayers.reliefTrees !== false;
  const showSwamps = options.activeLayers.reliefSwamps !== false;

  // Compute adaptive elevation quantile AND local highland prominence so EVERY continent displays rich engraved mountain chains
  const landElevs: number[] = [];
  for (let r = 0; r < numRegions; r++) {
    if (elevation[r] >= seaLevel) landElevs.push(elevation[r]);
  }
  landElevs.sort((a, b) => a - b);
  const p74 = landElevs.length > 20 ? landElevs[Math.floor(landElevs.length * 0.74)] : 0.45;
  const p56 = landElevs.length > 20 ? landElevs[Math.floor(landElevs.length * 0.56)] : 0.39;
  const mountainThreshold = Math.min(0.47, Math.max(seaLevel + 0.10, p74));
  const hillThreshold = Math.min(0.41, Math.max(seaLevel + 0.06, p56));

  // Mountain & Mountain Chain Candidates
  const placedMountains: { x: number; y: number; sz: number; r: number; e: number; isChain: boolean }[] = [];
  if (showMountains) {
    const mountainCandidates: { r: number; e: number; x: number; y: number; isChain: boolean; isExplicit: boolean }[] = [];
    for (let r = 0; r < numRegions; r++) {
      const e = elevation[r];
      const rel = getReliefAt(r);
      const isExplicit = rel === 'mountain';
      if (!isExplicit && e < seaLevel + 0.06) continue;
      if (!isExplicit && e >= 0.42 && !isCoastalCell(r) && isClearedCell(r)) continue;
      const nbrs = mesh.r_neighbors[r] || [];
      let nbrElevSum = 0;
      let highlandNeighbors = 0;
      for (const n of nbrs) {
        nbrElevSum += elevation[n];
        if (elevation[n] >= hillThreshold) highlandNeighbors++;
      }
      const localMean = nbrs.length > 0 ? nbrElevSum / nbrs.length : e;
      const isLocalRidge = e >= seaLevel + 0.11 && e >= localMean + 0.018 && highlandNeighbors >= 2;
      const isMountain = isExplicit || e >= mountainThreshold || isLocalRidge;

      if (isMountain) {
        if (!isExplicit && isCoastalCell(r) && e < mountainThreshold + 0.05) continue;
        if (!isExplicit && e < mountainThreshold + 0.03 && nbrs.some((n) => elevation[n] < seaLevel)) continue;
        mountainCandidates.push({
          r,
          e: isExplicit ? Math.max(e, mountainThreshold + 0.06) : e,
          x: r_x[r],
          y: r_y[r],
          isChain: highlandNeighbors >= 2 || e >= mountainThreshold + 0.03,
          isExplicit,
        });
      }
    }
    mountainCandidates.sort((a, b) => (a.isExplicit === b.isExplicit ? b.e - a.e : a.isExplicit ? -1 : 1));

    for (const cand of mountainCandidates) {
      // Cluster ridge peaks at ~18px spacing so mountain brushes form continuous engraved ranges
      const tooClose = placedFeatures.some((f) => Math.hypot(f.x - cand.x, f.y - cand.y) < Math.max(17, f.r));
      if (!tooClose) {
        const sz = Math.min(30, Math.max(17, 17 + (cand.e - mountainThreshold) * 42));
        placedMountains.push({ x: cand.x, y: cand.y, sz, r: cand.r, e: cand.e, isChain: cand.isChain });
        placedFeatures.push({ x: cand.x, y: cand.y, r: 17 });
      }
    }
  }

  // Hill Candidates (explicit hill strokes always render; procedural hills fill rolling highlands)
  const placedHills: { x: number; y: number; r: number; e: number; isExplicit: boolean }[] = [];
  if (showHills) {
    const hillCandidates: { r: number; e: number; x: number; y: number; isExplicit: boolean }[] = [];
    for (let r = 0; r < numRegions; r++) {
      const e = elevation[r];
      if (e < seaLevel) continue;
      const rel = getReliefAt(r);
      const isExplicit = rel === 'hill';
      if (!isExplicit && (rel === 'mountain' || rel === 'forest' || rel === 'tree' || rel === 'swamp')) continue;
      if (!isExplicit && e >= 0.42 && !isCoastalCell(r) && isClearedCell(r)) continue;
      const isHill = isExplicit || (e >= hillThreshold && e < mountainThreshold);
      if (isHill) {
        if (!isExplicit && isCoastalCell(r)) continue;
        const nbrs = mesh.r_neighbors[r] || [];
        if (!isExplicit && nbrs.some((n) => elevation[n] < seaLevel)) continue;
        hillCandidates.push({ r, e, x: r_x[r], y: r_y[r], isExplicit });
      }
    }
    hillCandidates.sort((a, b) => (a.isExplicit === b.isExplicit ? b.e - a.e : a.isExplicit ? -1 : 1));

    for (const cand of hillCandidates) {
      if (!cand.isExplicit && placedHills.length >= 110) break;
      const minDist = cand.isExplicit ? 15 : 22;
      const tooClose = placedFeatures.some((f) => Math.hypot(f.x - cand.x, f.y - cand.y) < Math.max(minDist, f.r));
      if (!tooClose) {
        placedHills.push({ x: cand.x, y: cand.y, r: cand.r, e: cand.e, isExplicit: cand.isExplicit });
        placedFeatures.push({ x: cand.x, y: cand.y, r: cand.isExplicit ? 15 : 20 });
      }
    }
  }

  // Forest & Individual Tree Candidates: prioritize painted forest/tree strokes & lush biome woodlands
  const placedTrees: {
    x: number;
    y: number;
    b: BiomeType;
    r: number;
    isManual?: boolean;
    treeKind: 'auto' | 'forest' | 'tree';
  }[] = [];
  if (showForests || showTrees) {
    const manualForestCells: {
      r: number;
      b: BiomeType;
      x: number;
      y: number;
      treeKind: 'forest' | 'tree';
    }[] = [];
    const forestCandidates: { r: number; b: BiomeType; x: number; y: number; treeKind: 'forest' | 'tree' }[] = [];
    for (let r = 0; r < numRegions; r++) {
      const e = elevation[r];
      if (e < seaLevel) continue;
      const b = biomes[r];
      const rel = getReliefAt(r);
      const isClearedForest =
        (b === 'Temperate Forest' || b === 'Boreal Taiga' || b === 'Tropical Rainforest') &&
        isClearedCell(r) &&
        !cells?.[r]?.isManualForest;
      if (isClearedForest) continue;

      if (rel === 'tree') {
        if (showTrees) {
          manualForestCells.push({ r, b, x: r_x[r], y: r_y[r], treeKind: 'tree' });
        }
        continue;
      }
      const isManualForest = Boolean(cells?.[r]?.isManualForest) || rel === 'forest';
      if (isManualForest && (Boolean(cells?.[r]?.isManualForest) || (cells?.[r]?.reliefType === 'forest' && e >= seaLevel))) {
        if (showForests) {
          manualForestCells.push({ r, b, x: r_x[r], y: r_y[r], treeKind: 'forest' });
        }
        continue;
      }
      const isNaturalForest = hasReliefType
        ? rel === 'forest'
        : e < 0.50 && (b === 'Temperate Forest' || b === 'Boreal Taiga' || b === 'Tropical Rainforest');
      if (isNaturalForest) {
        if (isCoastalCell(r)) continue;
        const nbrs = mesh.r_neighbors[r] || [];
        if (nbrs.some((n) => elevation[n] < seaLevel)) continue;
        const naturalKind: 'forest' | 'tree' = r % 4 === 0 ? 'tree' : 'forest';
        if ((naturalKind === 'tree' && showTrees) || (naturalKind === 'forest' && showForests)) {
          forestCandidates.push({ r, b, x: r_x[r], y: r_y[r], treeKind: naturalKind });
        }
      }
    }
    forestCandidates.sort((a, b) => Math.sin(a.r * 78.233) - Math.sin(b.r * 78.233));

    const placedManualTreeCoords: { x: number; y: number }[] = [];
    for (const mf of manualForestCells) {
      // Allow dense painted woodlands or individual stamped trees while avoiding stacking on settlements
      const spacing = mf.treeKind === 'tree' ? 13 : 16;
      const tooCloseBurg = placedFeatures.some((f) => f.r <= 24 && Math.hypot(f.x - mf.x, f.y - mf.y) < 16);
      const tooCloseTree = placedManualTreeCoords.some((t) => Math.hypot(t.x - mf.x, t.y - mf.y) < spacing);
      if (!tooCloseBurg && !tooCloseTree) {
        placedTrees.push({
          x: mf.x,
          y: mf.y,
          b: mf.b,
          r: mf.r,
          isManual: true,
          treeKind: mf.treeKind,
        });
        placedManualTreeCoords.push({ x: mf.x, y: mf.y });
        placedFeatures.push({ x: mf.x, y: mf.y, r: spacing });
      }
    }

    let naturalTreesCount = 0;
    for (const cand of forestCandidates) {
      if (naturalTreesCount >= 95) break;
      const tooClose = placedFeatures.some((f) => Math.hypot(f.x - cand.x, f.y - cand.y) < Math.max(26, f.r));
      if (!tooClose) {
        placedTrees.push({ x: cand.x, y: cand.y, b: cand.b, r: cand.r, treeKind: cand.treeKind });
        placedFeatures.push({ x: cand.x, y: cand.y, r: 24 });
        naturalTreesCount++;
      }
    }
  }

  // Swamp/Desert Candidates
  const aridWetCandidates: { r: number; b: BiomeType; x: number; y: number; isExplicit: boolean }[] = [];
  for (let r = 0; r < numRegions; r++) {
    const e = elevation[r];
    if (e < seaLevel) continue;
    const b = biomes[r];
    const rel = getReliefAt(r);
    const isExplicit = rel === 'swamp';
    const isSwampEntry = isExplicit || b === 'Misty Wetland';
    if (isSwampEntry && !showSwamps) continue;
    if (!isExplicit && b === 'Misty Wetland' && isClearedCell(r)) continue;
    const isSwampOrDune = hasReliefType
      ? isExplicit || (e < 0.55 && (b === 'Scorched Desert' || b === 'Arid Savanna'))
      : e < 0.55 && (b === 'Misty Wetland' || b === 'Scorched Desert' || b === 'Arid Savanna');
    if (isSwampOrDune) {
      if (!isExplicit && isCoastalCell(r)) continue;
      const nbrs = mesh.r_neighbors[r] || [];
      if (!isExplicit && nbrs.some((n) => elevation[n] < seaLevel)) continue;
      aridWetCandidates.push({
        r,
        b: isExplicit ? 'Misty Wetland' : b,
        x: r_x[r],
        y: r_y[r],
        isExplicit,
      });
    }
  }
  aridWetCandidates.sort((a, b) =>
    a.isExplicit === b.isExplicit
      ? Math.sin(a.r * 43.123) - Math.sin(b.r * 43.123)
      : a.isExplicit
      ? -1
      : 1
  );

  const placedAridWet: { x: number; y: number; b: BiomeType; r: number; isExplicit: boolean }[] = [];
  for (const cand of aridWetCandidates) {
    if (!cand.isExplicit && placedAridWet.length >= 32) break;
    const minDist = cand.isExplicit ? 18 : 34;
    const tooClose = placedFeatures.some((f) => Math.hypot(f.x - cand.x, f.y - cand.y) < Math.max(minDist, f.r));
    if (!tooClose) {
      placedAridWet.push({ x: cand.x, y: cand.y, b: cand.b, r: cand.r, isExplicit: cand.isExplicit });
      placedFeatures.push({ x: cand.x, y: cand.y, r: cand.isExplicit ? 18 : 26 });
    }
  }

  // Landmark Candidates
  const landmarkCandidates: { r: number; x: number; y: number; type: 'ruins' | 'monolith' | 'cave' | 'standing_stones' }[] = [];
  const landmarkTypes: ('ruins' | 'monolith' | 'cave' | 'standing_stones')[] = ['standing_stones', 'cave', 'ruins', 'monolith'];
  let lTypeIdx = 0;
  for (let r = 0; r < numRegions; r++) {
    if (elevation[r] >= seaLevel && (sim.shadedRelief?.[r] || 0) < 0.6 && (cells?.[r]?.populationDensity || 0) < 18) {
      if (isCoastalCell(r)) continue;
      const nbrs = mesh.r_neighbors[r] || [];
      if (nbrs.some((n) => elevation[n] < seaLevel)) continue;
      if ((r * 19 + 7) % 211 === 0 && landmarkCandidates.length < 3) {
        landmarkCandidates.push({
          r,
          x: r_x[r],
          y: r_y[r],
          type: landmarkTypes[lTypeIdx % landmarkTypes.length],
        });
        lTypeIdx++;
      }
    }
  }

  const placedLandmarks: { x: number; y: number; type: 'ruins' | 'monolith' | 'cave' | 'standing_stones' }[] = [];
  for (const cand of landmarkCandidates) {
    const tooClose = placedFeatures.some((f) => Math.hypot(f.x - cand.x, f.y - cand.y) < Math.max(68, f.r));
    if (!tooClose) {
      placedLandmarks.push({ x: cand.x, y: cand.y, type: cand.type });
      placedFeatures.push({ x: cand.x, y: cand.y, r: 42 });
    }
  }

  type PictorialSymbol =
    | { type: 'mountain'; x: number; y: number; sz: number; r: number; e: number; isChain: boolean }
    | { type: 'hill'; x: number; y: number; r: number; isExplicit: boolean }
    | { type: 'tree'; x: number; y: number; b: BiomeType; r: number; isManual?: boolean; treeKind: 'auto' | 'forest' | 'tree' }
    | { type: 'arid_wet'; x: number; y: number; b: BiomeType; r: number; isExplicit: boolean }
    | { type: 'landmark'; x: number; y: number; lType: 'ruins' | 'monolith' | 'cave' | 'standing_stones' };

  let symbolsToDraw: PictorialSymbol[] = [
    ...placedMountains.map((m) => ({ type: 'mountain' as const, x: m.x, y: m.y, sz: m.sz, r: m.r, e: m.e, isChain: m.isChain })),
    ...placedHills.map((h) => ({ type: 'hill' as const, x: h.x, y: h.y, r: h.r, isExplicit: h.isExplicit })),
    ...placedTrees.map((t) => ({ type: 'tree' as const, x: t.x, y: t.y, b: t.b, r: t.r, isManual: t.isManual, treeKind: t.treeKind })),
    ...placedAridWet.map((w) => ({ type: 'arid_wet' as const, x: w.x, y: w.y, b: w.b, r: w.r, isExplicit: w.isExplicit })),
    ...placedLandmarks.map((l) => ({ type: 'landmark' as const, x: l.x, y: l.y, lType: l.type })),
  ];

  const zoomLvl = options.zoomLevel ?? 1.0;
  const isZoomedOut = zoomLvl < 1.35;

  // Helper to identify large contiguous geographic massifs (forests, deserts, swamps)
  const countSameBiomeNeighbors = (r: number, targetBiome: BiomeType) => {
    const nbrs = mesh.r_neighbors[r] || [];
    let count = 0;
    for (const n of nbrs) {
      if (biomes[n] === targetBiome) count++;
    }
    return count;
  };

  if (isZoomedOut) {
    // Macro / Zoomed-Out LOD: always show mountain ranges, hills, explicit brush relief & major woodlands/wetlands
    symbolsToDraw = symbolsToDraw.filter((s) => {
      if (s.type === 'mountain') {
        return true;
      }
      if (s.type === 'hill') {
        return true;
      }
      if (s.type === 'tree') {
        if (s.isManual) return true;
        return countSameBiomeNeighbors(s.r, s.b) >= 2;
      }
      if (s.type === 'arid_wet') {
        if (s.isExplicit) return true;
        return countSameBiomeNeighbors(s.r, s.b) >= 2;
      }
      // Hide local landmarks until zoomed in
      return false;
    });
  }

  symbolsToDraw.sort((a, b) => a.y - b.y);

  const isWinter = seasonal.currentSeason === 'Winter';
  const isAutumn = seasonal.currentSeason === 'Autumn';
  const cartTheme = getCartographyTheme(options.mapStyle);
  const relStyle: ReliefAtlasStyle = cartTheme.forceEngraved
    ? 'engraved'
    : options.reliefStyle || 'watercolor';

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.beginPath();
  for (let r = 0; r < numRegions; r++) {
    if (elevation[r] >= seaLevel) {
      const poly = r_polygon[r];
      if (poly && poly.length >= 3) {
        ctx.moveTo(poly[0].x, poly[0].y);
        for (let p = 1; p < poly.length; p++) {
          ctx.lineTo(poly[p].x, poly[p].y);
        }
        ctx.closePath();
      }
    }
  }
  ctx.clip();

  for (const sym of symbolsToDraw) {
    if (sym.type === 'mountain') {
      const mountainSize = isZoomedOut ? sym.sz * 2.05 : sym.sz * 1.85;
      const drawn = drawAtlasMountain(
        ctx,
        sym.x,
        sym.y,
        mountainSize,
        sym.r,
        sym.e,
        isWinter,
        relStyle,
        isZoomedOut || sym.isChain
      );
      if (!drawn) {
        drawClassicMountainMassif(ctx, sym.x, sym.y, sym.sz);
      }
    } else if (sym.type === 'hill') {
      const drawn = drawAtlasHill(ctx, sym.x, sym.y, sym.isExplicit ? 26 : 24, sym.r, relStyle);
      if (!drawn) {
        drawClassicHillMound(ctx, sym.x, sym.y, 9.5);
      }
    } else if (sym.type === 'tree') {
      const treeSize = sym.treeKind === 'tree' ? 24 : 28;
      const drawn = drawAtlasTree(
        ctx,
        sym.x,
        sym.y,
        treeSize,
        sym.b,
        sym.r,
        relStyle,
        isWinter,
        isAutumn,
        sym.treeKind
      );
      if (!drawn) {
        if (sym.b === 'Boreal Taiga') {
          drawClassicPineTree(ctx, sym.x, sym.y);
        } else if (sym.b === 'Tropical Rainforest') {
          drawClassicPalmTree(ctx, sym.x, sym.y);
        } else {
          drawClassicOakTree(ctx, sym.x, sym.y);
        }
      }
    } else if (sym.type === 'arid_wet') {
      drawAtlasSwampOrDesert(ctx, sym.x, sym.y, 26, sym.b, sym.r, relStyle);
    } else if (sym.type === 'landmark') {
      drawAtlasLandmark(ctx, sym.lType, sym.x, sym.y, 1.25, relStyle);
    }
  }

  ctx.restore();
}

function drawCartographicTradeRoutes(
  ctx: CanvasRenderingContext2D,
  routes: TradeRoute[],
  selectedRouteId?: string,
  zoomLevel: number = 1.0
) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const showMinorRoads = zoomLevel >= 1.35;

  for (const route of routes) {
    if (route.pathPoints.length < 2) continue;
    const isSelected = selectedRouteId === route.id;
    const isCustom = Boolean(route.isCustom);

    if (route.type === 'Maritime Sea Lane') {
      ctx.beginPath();
      ctx.moveTo(route.pathPoints[0].x, route.pathPoints[0].y);
      for (let i = 1; i < route.pathPoints.length; i++) {
        ctx.lineTo(route.pathPoints[i].x, route.pathPoints[i].y);
      }
      ctx.strokeStyle = isSelected
        ? '#38bdf8'
        : isCustom
        ? 'rgba(14, 116, 144, 0.78)'
        : showMinorRoads
        ? 'rgba(30, 82, 108, 0.56)'
        : 'rgba(30, 82, 108, 0.42)';
      ctx.lineWidth = isSelected ? 2.1 : isCustom ? 1.45 : showMinorRoads ? 1.1 : 0.95;
      ctx.setLineDash(isCustom ? [4, 4] : [3, 5]);
      ctx.stroke();
    } else if (route.type === 'River Barge Route') {
      if (!isSelected && !isCustom) continue;
      ctx.beginPath();
      ctx.moveTo(route.pathPoints[0].x, route.pathPoints[0].y);
      for (let i = 1; i < route.pathPoints.length; i++) {
        ctx.lineTo(route.pathPoints[i].x, route.pathPoints[i].y);
      }
      ctx.strokeStyle = isSelected ? '#2dd4bf' : 'rgba(13, 148, 136, 0.78)';
      ctx.lineWidth = isSelected ? 2.2 : 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
    }
  }

  for (const route of routes) {
    if (route.pathPoints.length < 2) continue;
    if (route.type === 'Maritime Sea Lane' || route.type === 'River Barge Route') continue;

    const isSelected = selectedRouteId === route.id;
    const isCustom = Boolean(route.isCustom);
    const isMajorRoad = route.type === 'Imperial Highway';
    if (!showMinorRoads && !isMajorRoad && !isSelected && !isCustom) continue;

    ctx.beginPath();
    ctx.moveTo(route.pathPoints[0].x, route.pathPoints[0].y);
    for (let i = 1; i < route.pathPoints.length; i++) {
      ctx.lineTo(route.pathPoints[i].x, route.pathPoints[i].y);
    }

    if (route.type === 'Imperial Highway') {
      ctx.strokeStyle = isSelected ? '#f59e0b' : 'rgba(45, 32, 20, 0.74)';
      ctx.lineWidth = isSelected ? 3.6 : 2.2;
      ctx.setLineDash([]);
      ctx.stroke();

      ctx.strokeStyle = isSelected ? '#ffffff' : '#f5ece1';
      ctx.lineWidth = isSelected ? 1.8 : 1.1;
      ctx.stroke();
    } else if (route.type === 'Mountain Pass') {
      ctx.strokeStyle = isSelected ? '#38bdf8' : isCustom ? 'rgba(120, 53, 15, 0.85)' : 'rgba(15, 10, 10, 0.80)';
      ctx.lineWidth = isSelected ? 1.9 : isCustom ? 1.4 : 1.2;
      ctx.setLineDash([2, 3.8]);
      ctx.stroke();
    } else {
      ctx.strokeStyle = isSelected ? '#38bdf8' : isCustom ? 'rgba(68, 42, 20, 0.86)' : 'rgba(15, 10, 10, 0.80)';
      ctx.lineWidth = isSelected ? 2.4 : isCustom ? 1.65 : 1.4;
      ctx.setLineDash(isCustom ? [3.5, 3.5] : [1.5, 4.5]);
      ctx.stroke();
    }
  }

  ctx.setLineDash([]);
  ctx.restore();
}

// Route Arc-Length Distance Cache (Zero garbage collection & zero frame allocations)
interface RouteArcCache {
  totalDist: number;
  cumDists: Float64Array;
}
const routeArcCache = new WeakMap<TradeRoute, RouteArcCache>();

function getRouteArcCache(route: TradeRoute): RouteArcCache {
  let cached = routeArcCache.get(route);
  if (cached && cached.cumDists.length === route.pathPoints.length) {
    return cached;
  }
  const pts = route.pathPoints;
  const n = pts.length;
  const cumDists = new Float64Array(n);
  let totalDist = 0;
  cumDists[0] = 0;
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const dy = pts[i + 1].y - pts[i].y;
    totalDist += Math.hypot(dx, dy);
    cumDists[i + 1] = totalDist;
  }
  cached = { totalDist, cumDists };
  routeArcCache.set(route, cached);
  return cached;
}

function interpolatePointAlongRoute(
  route: TradeRoute,
  progress: number
): { x: number; y: number; angle: number } | null {
  const pts = route.pathPoints;
  if (!pts || pts.length < 2) return null;
  const { totalDist, cumDists } = getRouteArcCache(route);
  if (totalDist <= 0.001) {
    return { x: pts[0].x, y: pts[0].y, angle: 0 };
  }

  // Strictly clamp progress between 0.0 and 1.0
  const p = Math.max(0, Math.min(1.0, progress));
  const targetDist = p * totalDist;

  const maxSeg = pts.length - 2;
  let segIdx = 0;
  while (segIdx < maxSeg && cumDists[segIdx + 1] < targetDist) {
    segIdx++;
  }

  const p0 = pts[segIdx];
  const p1 = pts[segIdx + 1];
  const segDist = Math.max(0.0001, cumDists[segIdx + 1] - cumDists[segIdx]);
  const segT = Math.max(0, Math.min(1.0, (targetDist - cumDists[segIdx]) / segDist));

  // Safe tangent angle - handle degenerate micro-segments
  let dx = p1.x - p0.x;
  let dy = p1.y - p0.y;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    if (segIdx > 0) {
      dx = p0.x - pts[segIdx - 1].x;
      dy = p0.y - pts[segIdx - 1].y;
    } else if (segIdx + 2 < pts.length) {
      dx = pts[segIdx + 2].x - p1.x;
      dy = pts[segIdx + 2].y - p1.y;
    }
  }
  const angle = Math.atan2(dy, dx);

  return {
    x: p0.x + (p1.x - p0.x) * segT,
    y: p0.y + (p1.y - p0.y) * segT,
    angle,
  };
}

const caravanRouteLookupCache = new WeakMap<TradeRoute[], Map<string, TradeRoute>>();

function drawCartographicCaravans(
  ctx: CanvasRenderingContext2D,
  caravans: TraderCaravan[],
  routes: TradeRoute[],
  _caravanTick: number,
  zoomLevel: number = 1.0,
  projectY: (x: number, y: number) => number = (_x, y) => y
) {
  if (!caravans || caravans.length === 0 || !routes || routes.length === 0) return;

  const showMinorRoads = zoomLevel >= 1.25;

  let routeMap = caravanRouteLookupCache.get(routes);
  if (!routeMap || routeMap.size !== routes.length) {
    routeMap = new Map<string, TradeRoute>();
    for (const r of routes) routeMap.set(r.id, r);
    caravanRouteLookupCache.set(routes, routeMap);
  }

  for (const c of caravans) {
    if (c.isLooted) continue;
    const route = routeMap.get(c.routeId);
    if (!route || !route.pathPoints || route.pathPoints.length < 2) continue;

    if (!showMinorRoads && route.type !== 'Imperial Highway' && !(route.type === 'Maritime Sea Lane' && route.distanceKm >= 220)) {
      continue;
    }

    const { totalDist } = getRouteArcCache(route);
    if (totalDist < 10) continue;

    const isReverse = c.direction === -1;
    const clampedProgress = Math.max(0, Math.min(1.0, c.progress || 0));
    const t = isReverse ? 1.0 - clampedProgress : clampedProgress;
    const pt = interpolatePointAlongRoute(route, t);

    if (!pt || isNaN(pt.angle) || isNaN(pt.x) || isNaN(pt.y)) continue;

    const angle = isReverse ? pt.angle + Math.PI : pt.angle;
    const py = projectY(pt.x, pt.y);

    ctx.save();

    if (clampedProgress < 0.04) {
      ctx.globalAlpha = Math.max(0.05, clampedProgress / 0.04);
    } else if (clampedProgress > 0.94) {
      ctx.globalAlpha = Math.max(0.0, (1.0 - clampedProgress) / 0.06);
    }

    if (route.isMaritime && route.type === 'Maritime Sea Lane') {
      drawMaritimeSkiffIcon(ctx, pt.x, py, c.heraldryColor, angle);
    } else {
      drawCaravanParticle(ctx, pt.x, py, c.heraldryColor, angle, route.type);
    }

    ctx.restore();
  }
}

function drawCaravanParticle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cargoColor: string,
  angle: number,
  routeType: RouteClassification
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  const isHighway = routeType === 'Imperial Highway';
  const radius = isHighway ? 2.8 : 2.2;

  ctx.fillStyle = 'rgba(18, 14, 10, 0.38)';
  ctx.beginPath();
  ctx.ellipse(0, 0.8, radius + 1.0, radius * 0.58, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.70)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(radius * 0.4, 0);
  ctx.lineTo(radius + 1.6, 0);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#1c1917';
  ctx.fill();
  ctx.strokeStyle = isHighway ? '#ffffff' : '#0c0a09';
  ctx.lineWidth = isHighway ? 0.75 : 0.6;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.72, 0, Math.PI * 2);
  ctx.fillStyle = cargoColor || '#d97706';
  ctx.fill();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  ctx.arc(-radius * 0.32, -radius * 0.32, radius * 0.28, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawRiverBargeIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cargoColor: string,
  angle: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-4, -1.8);
  ctx.lineTo(-7, -3.2);
  ctx.moveTo(-4, 1.8);
  ctx.lineTo(-7, 3.2);
  ctx.stroke();

  ctx.fillStyle = '#452610';
  ctx.fillRect(-3.8, -1.8, 7.6, 3.6);
  ctx.strokeStyle = '#1c0f06';
  ctx.lineWidth = 0.6;
  ctx.strokeRect(-3.8, -1.8, 7.6, 3.6);

  ctx.fillStyle = cargoColor || '#d97706';
  ctx.fillRect(-1.5, -1.1, 3.0, 2.2);

  ctx.restore();
}

function drawMaritimeSkiffIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cargoColor: string,
  angle: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  ctx.strokeStyle = 'rgba(230, 245, 255, 0.55)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-4, -1.6);
  ctx.lineTo(-8, -3.8);
  ctx.moveTo(-4, 1.6);
  ctx.lineTo(-8, 3.8);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-4.0, -1.8);
  ctx.lineTo(3.5, -1.4);
  ctx.lineTo(5.2, 0);
  ctx.lineTo(3.5, 1.4);
  ctx.lineTo(-4.0, 1.8);
  ctx.closePath();
  ctx.fillStyle = '#2d1808';
  ctx.fill();
  ctx.strokeStyle = '#120a04';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-1, 0);
  ctx.lineTo(0.8, -4.5);
  ctx.lineTo(2.8, 0);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  ctx.fillStyle = cargoColor || '#38bdf8';
  ctx.fillRect(0, -2.8, 1.5, 2.8);

  ctx.restore();
}

function drawFallbackRoutes(ctx: CanvasRenderingContext2D, realms: Realm[], burgs: Burg[], zoomLevel: number = 1.0) {
  ctx.save();
  ctx.strokeStyle = 'rgba(125, 88, 48, 0.45)';
  ctx.lineWidth = 1.35;
  ctx.setLineDash([3, 3]);
  const showMinor = zoomLevel >= 1.25;

  for (const realm of realms) {
    const capBurg = burgs.find((b) => b.id === realm.capitalBurgId);
    if (!capBurg) continue;

    const realmBurgs = burgs.filter((b) => b.stateId === realm.id && b.id !== capBurg.id);
    for (const rb of realmBurgs) {
      if (!showMinor && rb.type !== 'Royal Metropolis' && rb.type !== 'Trade Port') continue;
      ctx.beginPath();
      ctx.moveTo(capBurg.x, capBurg.y);
      const midX = (capBurg.x + rb.x) / 2 + (capBurg.y % 2 === 0 ? 8 : -8);
      const midY = (capBurg.y + rb.y) / 2;
      ctx.quadraticCurveTo(midX, midY, rb.x, rb.y);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
  ctx.restore();
}

function drawTopographicContours(
  ctx: CanvasRenderingContext2D,
  mesh: VoronoiDualMesh,
  elevation: Float32Array,
  seaLevel: number
) {
  const { numSides, halfedges, s_start_r, s_end_r, s_left_t, t_x, t_y, r_x, r_y } = mesh;

  interface ContourDef {
    level: number;
    width: number;
    color: string;
    dash?: number[];
    isShelfBreak?: boolean;
    isLand?: boolean;
  }

  const contourLevels: ContourDef[] = [
    { level: Math.max(0.02, seaLevel * (1 - 0.90)), width: 1.15, color: 'rgba(22, 48, 62, 0.48)', dash: [8, 4] },
    { level: Math.max(0.04, seaLevel * (1 - 0.75)), width: 0.90, color: 'rgba(26, 56, 72, 0.36)' },
    { level: Math.max(0.07, seaLevel * (1 - 0.52)), width: 0.95, color: 'rgba(32, 66, 84, 0.42)' },
    { level: Math.max(0.10, seaLevel * (1 - 0.32)), width: 1.30, color: 'rgba(30, 72, 92, 0.58)', dash: [6, 3], isShelfBreak: true },
    { level: Math.max(0.13, seaLevel * (1 - 0.18)), width: 0.85, color: 'rgba(42, 86, 106, 0.38)' },
    { level: Math.max(0.16, seaLevel * (1 - 0.08)), width: 0.75, color: 'rgba(48, 96, 118, 0.32)', dash: [2.5, 2.5] },
    { level: seaLevel + 0.08, width: 0.85, color: 'rgba(85, 62, 40, 0.28)', isLand: true },
    { level: seaLevel + 0.18, width: 0.95, color: 'rgba(85, 62, 40, 0.35)', isLand: true },
    { level: seaLevel + 0.30, width: 1.25, color: 'rgba(70, 48, 28, 0.50)', isLand: true },
    { level: seaLevel + 0.44, width: 0.95, color: 'rgba(85, 62, 40, 0.35)', isLand: true },
    { level: seaLevel + 0.58, width: 1.35, color: 'rgba(60, 40, 22, 0.55)', isLand: true },
  ];

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const c of contourLevels) {
    ctx.strokeStyle = c.color;
    ctx.lineWidth = c.width;
    if (c.dash && c.dash.length > 0) {
      ctx.setLineDash(c.dash);
    } else {
      ctx.setLineDash([]);
    }
    ctx.beginPath();

    const shelfBreakTicks: { x1: number; y1: number; x2: number; y2: number; rDeep: number }[] = [];

    for (let s = 0; s < numSides; s++) {
      const opp = halfedges[s];
      if (opp === -1 || opp < s) continue;
      const rA = s_start_r[s];
      const rB = s_end_r[s];
      const eA = elevation[rA];
      const eB = elevation[rB];

      if ((eA < c.level && eB >= c.level) || (eA >= c.level && eB < c.level)) {
        const tA = s_left_t[s];
        const tB = s_left_t[opp];
        const x1 = t_x[tA];
        const y1 = t_y[tA];
        const x2 = t_x[tB];
        const y2 = t_y[tB];

        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);

        if (c.isShelfBreak) {
          shelfBreakTicks.push({
            x1, y1, x2, y2,
            rDeep: eA < eB ? rA : rB,
          });
        }
      }
    }
    ctx.stroke();

    if (c.isShelfBreak && shelfBreakTicks.length > 0) {
      ctx.save();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(28, 66, 84, 0.42)';
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      for (const tick of shelfBreakTicks) {
        const midX = (tick.x1 + tick.x2) * 0.5;
        const midY = (tick.y1 + tick.y2) * 0.5;
        const toDeepX = r_x[tick.rDeep] - midX;
        const toDeepY = r_y[tick.rDeep] - midY;
        const dist = Math.hypot(toDeepX, toDeepY) || 1;
        ctx.moveTo(midX, midY);
        ctx.lineTo(midX + (toDeepX / dist) * 3.5, midY + (toDeepY / dist) * 3.5);
      }
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawOceanWavelet(ctx: CanvasRenderingContext2D, x: number, y: number, isDeep: boolean, waveRgb = '32, 60, 72') {
  ctx.save();
  ctx.strokeStyle = isDeep ? `rgba(${waveRgb}, 0.48)` : `rgba(${waveRgb}, 0.38)`;
  ctx.lineWidth = 0.85;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.arc(x - 3.5, y - 1.5, 4.2, Math.PI * 0.18, Math.PI * 0.82);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + 3.5, y - 1.5, 4.2, Math.PI * 0.18, Math.PI * 0.82);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y + 2.5, 3.8, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();
  ctx.restore();
}

function drawOceanShoal(ctx: CanvasRenderingContext2D, x: number, y: number, waveRgb = '38, 72, 85') {
  ctx.save();
  ctx.fillStyle = `rgba(${waveRgb}, 0.50)`;
  ctx.strokeStyle = `rgba(${waveRgb}, 0.36)`;
  ctx.lineWidth = 0.75;

  ctx.beginPath();
  ctx.arc(x - 4, y - 2, 0.8, 0, Math.PI * 2);
  ctx.arc(x - 1, y - 3, 0.7, 0, Math.PI * 2);
  ctx.arc(x + 3, y - 1.5, 0.9, 0, Math.PI * 2);
  ctx.arc(x - 2, y + 2, 0.8, 0, Math.PI * 2);
  ctx.arc(x + 2, y + 2.5, 0.7, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y + 0.5, 5, Math.PI * 0.22, Math.PI * 0.78);
  ctx.stroke();
  ctx.restore();
}

function drawBiomeTextures(
  ctx: CanvasRenderingContext2D,
  mesh: VoronoiDualMesh,
  sim: TerrainSimulationResult,
  seaLevel: number,
  seasonal?: SeasonalState,
  height: number = 700,
  theme?: CartographyTheme
) {
  const { numRegions, r_x, r_y } = mesh;
  const { elevation, biomes } = sim;
  const waveRgb = theme?.waveRgb || '34, 66, 80';
  const isMono = theme?.id === 'ink';
  const isWarm = theme?.id === 'vintage' || theme?.id === 'parchment';

  ctx.save();

  for (let r = 0; r < numRegions; r++) {
    const x = r_x[r];
    const y = r_y[r];
    const e = elevation[r];

    const rand = Math.abs(Math.sin(r * 127.1 + 311.7) * 43758.5453) % 1;

    if (e < seaLevel) {
      const depth = (seaLevel - e) / seaLevel;
      if (depth < 0.28) {
        if (rand < 0.45) drawOceanShoal(ctx, x, y, waveRgb);
      } else if (depth >= 0.28 && depth < 0.68) {
        if (rand < 0.38) drawOceanWavelet(ctx, x, y, false, waveRgb);
      } else {
        if (rand < 0.42) drawOceanWavelet(ctx, x, y, true, waveRgb);
      }
      continue;
    }

    const b = biomes[r];
    if (b === 'Scorched Desert') {
      ctx.fillStyle = isMono
        ? 'rgba(38, 34, 30, 0.34)'
        : isWarm
        ? 'rgba(138, 96, 44, 0.42)'
        : 'rgba(160, 120, 60, 0.40)';
      ctx.fillRect(x - 2, y + 2, 1.2, 1.2);
      ctx.fillRect(x + 3, y - 2, 1.2, 1.2);
    } else if (b === 'Temperate Forest' || b === 'Tropical Rainforest' || b === 'Boreal Taiga') {
      if (rand < 0.45) {
        ctx.fillStyle = isMono
          ? 'rgba(32, 30, 28, 0.28)'
          : isWarm
          ? 'rgba(72, 82, 42, 0.34)'
          : 'rgba(35, 75, 45, 0.38)';
        ctx.beginPath();
        ctx.arc(x - 3, y - 1, 1.4, 0, Math.PI * 2);
        ctx.arc(x + 2, y + 2, 1.2, 0, Math.PI * 2);
        ctx.arc(x, y - 3, 1.0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (b === 'Steppe Grassland' || b === 'Arid Savanna') {
      if (rand < 0.25) {
        ctx.fillStyle = isMono ? 'rgba(42, 40, 36, 0.24)' : 'rgba(125, 115, 65, 0.3)';
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  ctx.restore();
}

function drawClassicMountainMassif(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const w = size * 1.25;
  const h = size * 1.6;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.lineTo(x, y - h);
  ctx.lineTo(x, y);
  ctx.fillStyle = '#fefdfa';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x + w, y);
  ctx.lineTo(x, y - h);
  ctx.lineTo(x, y);
  ctx.fillStyle = '#dbcebe';
  ctx.fill();

  ctx.strokeStyle = '#3e2a14';
  ctx.lineWidth = 1.25;

  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.lineTo(x, y - h);
  ctx.lineTo(x + w, y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.lineTo(x - w * 0.1, y - h * 0.65);
  ctx.lineTo(x + w * 0.08, y - h * 0.35);
  ctx.lineTo(x, y);
  ctx.stroke();

  ctx.beginPath();
  const hatches = Math.max(3, Math.floor(size * 0.6));
  for (let i = 1; i <= hatches; i++) {
    const f = i / (hatches + 1);
    const hy = (y - h) + h * f;
    let hx = x;
    if (f < 0.35) hx = x - w * 0.1 * (f / 0.35);
    else if (f < 0.65) hx = x - w * 0.1 + (w * 0.18) * ((f - 0.35) / 0.3);
    else hx = x + w * 0.08 - (w * 0.08) * ((f - 0.65) / 0.35);

    const span = w * 1.0 * (1 - f);
    ctx.moveTo(hx + 2, hy);
    ctx.lineTo(hx + span * 0.8, hy + span * 0.4);
  }
  ctx.stroke();

  ctx.restore();
}

function drawClassicHillMound(ctx: CanvasRenderingContext2D, x: number, y: number, r: number = 9.5) {
  ctx.save();
  const w = r * 1.5;
  const h = r * 0.95;

  ctx.beginPath();
  ctx.ellipse(x + w * 0.25, y + 1.2, w * 0.75, h * 0.32, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(45, 35, 25, 0.10)';
  ctx.fill();

  const shW = w * 0.65;
  const shH = h * 0.68;
  const shX = x - w * 0.52;
  ctx.beginPath();
  ctx.moveTo(shX - shW, y);
  ctx.quadraticCurveTo(shX, y - shH * 1.1, shX + shW * 0.75, y);
  ctx.closePath();
  ctx.fillStyle = '#e8decb';
  ctx.fill();
  ctx.strokeStyle = '#382b20';
  ctx.lineWidth = 0.95;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.bezierCurveTo(x - w * 0.45, y - h * 1.15, x + w * 0.2, y - h * 1.08, x + w * 0.95, y);
  ctx.closePath();

  const hillGrad = ctx.createLinearGradient(x - w * 0.5, y - h, x + w * 0.6, y);
  hillGrad.addColorStop(0, '#f5ede0');
  hillGrad.addColorStop(0.5, '#e4d6bf');
  hillGrad.addColorStop(1, '#cabb9f');
  ctx.fillStyle = hillGrad;
  ctx.fill();

  ctx.strokeStyle = '#2d2218';
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.bezierCurveTo(x - w * 0.45, y - h * 1.15, x + w * 0.2, y - h * 1.08, x + w * 0.95, y);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(65, 48, 34, 0.55)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  const ticks = [
    { ox: w * 0.05, oy: -h * 0.65, len: 3.5, ang: 0.8 },
    { ox: w * 0.22, oy: -h * 0.52, len: 4.2, ang: 0.9 },
    { ox: w * 0.40, oy: -h * 0.38, len: 4.0, ang: 1.0 },
    { ox: w * 0.58, oy: -h * 0.22, len: 3.2, ang: 1.1 },
  ];
  for (const t of ticks) {
    ctx.moveTo(x + t.ox, y + t.oy);
    ctx.lineTo(x + t.ox + Math.cos(t.ang) * t.len, y + t.oy + Math.sin(t.ang) * t.len);
  }
  ctx.stroke();

  ctx.fillStyle = 'rgba(80, 60, 40, 0.35)';
  ctx.beginPath();
  ctx.arc(x - w * 0.2, y + 0.5, 0.8, 0, Math.PI * 2);
  ctx.arc(x + w * 0.25, y + 0.8, 0.9, 0, Math.PI * 2);
  ctx.arc(x + w * 0.55, y + 0.4, 0.7, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawClassicOakTree(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x + 2, y + 1, 5, 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(35, 45, 25, 0.18)';
  ctx.fill();

  ctx.strokeStyle = '#4e3828';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x, y + 1);
  ctx.quadraticCurveTo(x - 0.5, y - 3, x + 0.2, y - 6);
  ctx.stroke();

  const lobes = [
    { dx: -4.0, dy: -8.0, r: 4.2, col: '#457a40', shade: '#2d542a' },
    { dx: 3.8, dy: -7.5, r: 3.8, col: '#3b6a37', shade: '#264823' },
    { dx: 0.0, dy: -11.5, r: 4.6, col: '#558f4f', shade: '#356331' },
    { dx: -1.2, dy: -8.5, r: 3.5, col: '#629e5a', shade: '#3e7039' },
  ];

  for (const l of lobes) {
    ctx.beginPath();
    ctx.arc(x + l.dx, y + l.dy, l.r, 0, Math.PI * 2);
    ctx.fillStyle = l.col;
    ctx.fill();
    ctx.strokeStyle = '#1b3317';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x + l.dx + 0.8, y + l.dy + 0.8, l.r * 0.75, Math.PI * 0.1, Math.PI * 0.9);
    ctx.fillStyle = l.shade;
    ctx.fill();
  }

  ctx.restore();
}

function drawClassicPineTree(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x + 1.5, y + 1, 4, 1.8, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(25, 38, 28, 0.18)';
  ctx.fill();

  ctx.strokeStyle = '#423022';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(x, y + 1);
  ctx.lineTo(x, y - 3);
  ctx.stroke();

  const tiers = [
    { topY: -13, botY: -8.5, w: 4.5, fillL: '#3a6646', fillR: '#23442c' },
    { topY: -9.5, botY: -5.0, w: 6.2, fillL: '#335c3e', fillR: '#1d3a25' },
    { topY: -6.0, botY: -1.8, w: 8.0, fillL: '#2c5236', fillR: '#17301e' },
  ];

  for (const t of tiers) {
    ctx.beginPath();
    ctx.moveTo(x, y + t.topY);
    ctx.lineTo(x, y + t.botY);
    ctx.lineTo(x - t.w, y + t.botY);
    ctx.closePath();
    ctx.fillStyle = t.fillL;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x, y + t.topY);
    ctx.lineTo(x + t.w, y + t.botY);
    ctx.lineTo(x, y + t.botY);
    ctx.closePath();
    ctx.fillStyle = t.fillR;
    ctx.fill();

    ctx.strokeStyle = '#122416';
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.moveTo(x - t.w, y + t.botY);
    ctx.lineTo(x, y + t.topY);
    ctx.lineTo(x + t.w, y + t.botY);
    ctx.stroke();
  }

  ctx.restore();
}

function drawClassicPalmTree(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.strokeStyle = '#6b4f2c';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + 2, y - 5, x + 1, y - 10);
  ctx.stroke();

  ctx.strokeStyle = '#2d6a36';
  ctx.lineWidth = 1.1;

  const fronds = [
    [x + 1, y - 10, x - 5, y - 12],
    [x + 1, y - 10, x + 6, y - 12],
    [x + 1, y - 10, x - 4, y - 7],
    [x + 1, y - 10, x + 5, y - 7],
  ];

  for (const [fx1, fy1, fx2, fy2] of fronds) {
    ctx.beginPath();
    ctx.moveTo(fx1, fy1);
    ctx.quadraticCurveTo((fx1 + fx2) / 2, fy1 - 2, fx2, fy2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawClassicMetropolis(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(x - 7, y - 4, 14, 8);
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1.3;
  ctx.strokeRect(x - 7, y - 4, 14, 8);

  const towerW = 3.8;
  const towerH = 10;

  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(x - 8.5, y - 6, towerW, towerH);
  ctx.strokeRect(x - 8.5, y - 6, towerW, towerH);

  ctx.fillStyle = '#b91c1c';
  ctx.beginPath();
  ctx.moveTo(x - 8.5, y - 6);
  ctx.lineTo(x - 6.6, y - 11.5);
  ctx.lineTo(x - 4.7, y - 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(x + 4.7, y - 6, towerW, towerH);
  ctx.strokeRect(x + 4.7, y - 6, towerW, towerH);

  ctx.fillStyle = '#b91c1c';
  ctx.beginPath();
  ctx.moveTo(x + 4.7, y - 6);
  ctx.lineTo(x + 6.6, y - 11.5);
  ctx.lineTo(x + 8.5, y - 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x, y - 4);
  ctx.lineTo(x, y - 13);
  ctx.moveTo(x - 2, y - 10);
  ctx.lineTo(x + 2, y - 10);
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(x - 1.8, y, 3.6, 4);

  ctx.restore();
}

function drawClassicCapitalCitadel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  emblem: string,
  heraldryBg: string,
  stateColor: string,
  heraldry?: CoatOfArmsData,
  realmId?: string
) {
  ctx.save();
  const w = 16;
  const h = 19;

  const svgImg = heraldry ? getCachedHeraldryCanvasImage(heraldry, realmId || 'realm') : null;
  if (svgImg && svgImg.complete && svgImg.naturalWidth > 0) {
    ctx.drawImage(svgImg, x - 9, y - 10, 18, 21.6);
    ctx.beginPath();
    ctx.moveTo(x - 7.5, y - 8.5);
    ctx.lineTo(x + 7.5, y - 8.5);
    ctx.lineTo(x + 7.5, y);
    ctx.bezierCurveTo(x + 7.5, y + 7.5, x, y + 10.5, x, y + 11.6);
    ctx.bezierCurveTo(x, y + 10.5, x - 7.5, y + 7.5, x - 7.5, y);
    ctx.closePath();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.0;
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y - h / 2);
    ctx.lineTo(x + w / 2, y - h / 2);
    ctx.lineTo(x + w / 2, y);
    ctx.bezierCurveTo(x + w / 2, y + h * 0.45, x, y + h * 0.65, x, y + h * 0.75);
    ctx.bezierCurveTo(x, y + h * 0.65, x - w / 2, y + h * 0.45, x - w / 2, y);
    ctx.closePath();

    ctx.fillStyle = heraldryBg || '#991b1b';
    ctx.fill();
    ctx.strokeStyle = '#1a1612';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 0.9;
    ctx.stroke();

    ctx.font = '9px "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emblem || '👑', x, y + 1);
  }

  const cY = y - h / 2 - 4;
  ctx.fillStyle = '#f59e0b';
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  ctx.moveTo(x - 6, cY + 3);
  ctx.lineTo(x - 7, cY - 3);
  ctx.lineTo(x - 2.5, cY);
  ctx.lineTo(x, cY - 4.5);
  ctx.lineTo(x + 2.5, cY);
  ctx.lineTo(x + 7, cY - 3);
  ctx.lineTo(x + 6, cY + 3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = stateColor || '#b45309';
  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x + 7, cY - 2);
  ctx.lineTo(x + 15, cY - 4);
  ctx.lineTo(x + 12, cY + 1);
  ctx.lineTo(x + 15, cY + 5);
  ctx.lineTo(x + 7, cY + 3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function drawClassicPortWithShip(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.fillStyle = '#475569';
  ctx.fillRect(x - 8, y + 3, 16, 2.8);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.0;
  ctx.strokeRect(x - 8, y + 3, 16, 2.8);

  ctx.fillStyle = '#6b4f2c';
  ctx.beginPath();
  ctx.moveTo(x - 9, y - 1);
  ctx.lineTo(x - 2, y - 1);
  ctx.lineTo(x - 4, y + 3);
  ctx.lineTo(x - 8, y + 3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#1e1812';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  ctx.strokeStyle = '#38281a';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(x - 5.5, y - 1);
  ctx.lineTo(x - 5.5, y - 8);
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.moveTo(x - 5.5, y - 7.5);
  ctx.lineTo(x - 2, y - 3);
  ctx.lineTo(x - 5.5, y - 3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x + 4, y - 4, 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 4, y - 2);
  ctx.lineTo(x + 4, y + 3);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + 4, y + 1, 3.5, 0, Math.PI);
  ctx.stroke();
  ctx.restore();
}

function drawClassicBorderFortress(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  const bw = 11;
  const bh = 11;
  ctx.fillStyle = '#64748b';
  ctx.fillRect(x - bw / 2, y - bh / 2, bw, bh);
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1.3;
  ctx.strokeRect(x - bw / 2, y - bh / 2, bw, bh);

  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(x - 5.5, y - 8, 2.8, 2.8);
  ctx.fillRect(x + 2.7, y - 8, 2.8, 2.8);
  ctx.strokeRect(x - 5.5, y - 8, 2.8, 2.8);
  ctx.strokeRect(x + 2.7, y - 8, 2.8, 2.8);

  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.moveTo(x, y - 8);
  ctx.lineTo(x + 7, y - 10);
  ctx.lineTo(x, y - 12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawClassicMarketTown(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(x - 6.5, y - 3.5, 13, 6.5);
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1.1;
  ctx.strokeRect(x - 6.5, y - 3.5, 13, 6.5);

  ctx.fillStyle = '#c2410c';
  ctx.beginPath();
  ctx.moveTo(x - 6.5, y - 3.5);
  ctx.lineTo(x - 2, y - 8.5);
  ctx.lineTo(x + 1, y - 3.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#b91c1c';
  ctx.beginPath();
  ctx.moveTo(x + 0.5, y - 3.5);
  ctx.lineTo(x + 4.5, y - 8);
  ctx.lineTo(x + 6.5, y - 3.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#f59e0b';
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x - 1, y - 5.5);
  ctx.lineTo(x, y - 11);
  ctx.lineTo(x + 1, y - 5.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  const stalls = [
    { ox: -5.5, color: '#dc2626' },
    { ox: -1.5, color: '#f59e0b' },
    { ox: 2.5, color: '#2563eb' },
  ];
  for (const st of stalls) {
    ctx.fillStyle = st.color;
    ctx.fillRect(x + st.ox, y + 1.2, 3.2, 2.2);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 0.6;
    ctx.strokeRect(x + st.ox, y + 1.2, 3.2, 2.2);
  }
  ctx.restore();
}

function drawClassicVillage(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.fillStyle = '#785b3b';
  ctx.fillRect(x - 6.5, y - 1.5, 7, 4.5);
  ctx.strokeStyle = '#382512';
  ctx.lineWidth = 0.9;
  ctx.strokeRect(x - 6.5, y - 1.5, 7, 4.5);

  ctx.fillStyle = '#eab308';
  ctx.beginPath();
  ctx.moveTo(x - 7.5, y - 1.5);
  ctx.lineTo(x - 3, y - 6);
  ctx.lineTo(x + 1.5, y - 1.5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  const wx = x + 4;
  const wy = y;
  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.moveTo(wx - 2.2, wy + 3);
  ctx.lineTo(wx - 1.3, wy - 4);
  ctx.lineTo(wx + 1.3, wy - 4);
  ctx.lineTo(wx + 2.2, wy + 3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  ctx.fillStyle = '#b91c1c';
  ctx.beginPath();
  ctx.moveTo(wx - 1.8, wy - 4);
  ctx.lineTo(wx, wy - 6.5);
  ctx.lineTo(wx + 1.8, wy - 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 0.85;
  const sailLen = 4.2;
  const hubX = wx;
  const hubY = wy - 4.2;
  ctx.beginPath();
  ctx.moveTo(hubX - sailLen * 0.7, hubY - sailLen * 0.7);
  ctx.lineTo(hubX + sailLen * 0.7, hubY + sailLen * 0.7);
  ctx.moveTo(hubX - sailLen * 0.7, hubY + sailLen * 0.7);
  ctx.lineTo(hubX + sailLen * 0.7, hubY - sailLen * 0.7);
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(hubX + 0.5, hubY - sailLen * 0.7, 1.8, 2.2);
  ctx.fillRect(hubX - 2.3, hubY + 0.6, 1.8, 2.2);
  ctx.restore();
}

function drawClassicFishingPort(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.fillStyle = '#64748b';
  ctx.fillRect(x - 7, y + 1, 14, 2.4);
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 0.9;
  ctx.strokeRect(x - 7, y + 1, 14, 2.4);

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x - 5, y + 3.4);
  ctx.lineTo(x - 5, y + 6);
  ctx.moveTo(x + 1, y + 3.4);
  ctx.lineTo(x + 1, y + 6);
  ctx.moveTo(x + 5, y + 3.4);
  ctx.lineTo(x + 5, y + 6);
  ctx.stroke();

  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(x - 6, y - 4, 5.5, 5);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(x - 6, y - 4, 5.5, 5);

  ctx.fillStyle = '#0284c7';
  ctx.beginPath();
  ctx.moveTo(x - 6.5, y - 4);
  ctx.lineTo(x - 3.25, y - 7);
  ctx.lineTo(x - 0.5, y - 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#543d2b';
  ctx.beginPath();
  ctx.moveTo(x + 2, y);
  ctx.lineTo(x + 7.5, y);
  ctx.lineTo(x + 6, y + 3);
  ctx.lineTo(x + 3, y + 3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#231810';
  ctx.lineWidth = 0.75;
  ctx.stroke();

  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(x + 4.5, y);
  ctx.lineTo(x + 6.5, y - 3.2);
  ctx.stroke();
  ctx.restore();
}

function drawClassicHamlet(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.fillStyle = '#64748b';
  ctx.fillRect(x - 5.5, y - 2, 7, 5);
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 0.9;
  ctx.strokeRect(x - 5.5, y - 2, 7, 5);

  ctx.fillStyle = '#475569';
  ctx.beginPath();
  ctx.moveTo(x - 6.5, y - 2);
  ctx.lineTo(x - 2, y - 6);
  ctx.lineTo(x + 2.5, y - 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 0.85;
  ctx.stroke();

  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(x + 1.5, y, 4.5, 3);
  ctx.strokeRect(x + 1.5, y, 4.5, 3);

  ctx.fillStyle = '#334155';
  ctx.beginPath();
  ctx.moveTo(x + 0.5, y);
  ctx.lineTo(x + 3.8, y - 3);
  ctx.lineTo(x + 6.5, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#334155';
  ctx.fillRect(x - 4.5, y - 7, 1.6, 2.5);

  ctx.strokeStyle = 'rgba(230, 235, 245, 0.65)';
  ctx.lineWidth = 0.85;
  ctx.beginPath();
  ctx.moveTo(x - 3.7, y - 7);
  ctx.quadraticCurveTo(x - 2, y - 9.5, x - 3.5, y - 12);
  ctx.stroke();
  ctx.restore();
}

function drawCartographicText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: {
    fillColor: string;
    edgeColor?: string;
    shadowColor?: string;
    fontPx: number;
    zoom?: number;
    letterSpacing?: string;
    edgeRatio?: number;
    rotation?: number;
    strength?: 'soft' | 'medium' | 'strong';
  }
) {
  const z = Math.max(0.75, opts.zoom || 1);
  const strength = opts.strength ?? 'medium';
  ctx.save();
  ctx.translate(x, y);
  if (opts.rotation) ctx.rotate(opts.rotation);
  ctx.setLineDash([]);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.miterLimit = 2;

  const ctxAny = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if (opts.letterSpacing && 'letterSpacing' in ctxAny) {
    ctxAny.letterSpacing = opts.letterSpacing;
  }

  // Pure, crisp dark engraved ink with ZERO white outline or white halo
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = opts.fillColor;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawHaloText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  textColor: string,
  haloColor: string,
  rotation = 0,
  fontPx = 9
) {
  drawCartographicText(ctx, text, x, y, {
    fillColor: textColor,
    edgeColor: haloColor,
    fontPx,
    rotation,
    edgeRatio: 0.11,
  });
}

function drawHolySiteAura(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  const grad = ctx.createRadialGradient(x, y, 0, x, y, 16);
  grad.addColorStop(0, 'rgba(253, 230, 138, 0.7)');
  grad.addColorStop(1, 'rgba(253, 230, 138, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawClassicCartouche(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  worldName: string,
  currentYear: number,
  theme?: CartographyTheme
) {
  const w = 224;
  const h = 92;
  const paperBg =
    theme?.id === 'vintage'
      ? '#ead7b2'
      : theme?.id === 'parchment'
      ? '#f2e8d0'
      : theme?.id === 'ink'
      ? '#f7f3ea'
      : theme?.id === 'hand_drawn'
      ? '#f5ecda'
      : '#f8f4ea';
  const strokeMain = theme?.shoreInk || '#2c2217';

  ctx.save();
  ctx.fillStyle = paperBg;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = strokeMain;
  ctx.lineWidth = 2.2;
  ctx.strokeRect(x, y, w, h);
  ctx.strokeStyle = '#8c7659';
  ctx.lineWidth = 1.0;
  ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);

  const cSize = 7;
  ctx.fillStyle = strokeMain;
  ctx.fillRect(x + 2, y + 2, cSize, cSize);
  ctx.fillRect(x + w - cSize - 2, y + 2, cSize, cSize);
  ctx.fillRect(x + 2, y + h - cSize - 2, cSize, cSize);
  ctx.fillRect(x + w - cSize - 2, y + h - cSize - 2, cSize, cSize);

  ctx.textAlign = 'center';
  ctx.font = '700 8px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = theme?.id === 'ink' ? '#4a453e' : '#785b3b';
  ctx.fillText('COMPENDIUM OF THE REALM', x + w / 2, y + 20);

  ctx.font = 'bold 15px "Cinzel", Georgia, serif';
  ctx.fillStyle = '#1c1610';
  ctx.fillText(worldName.toUpperCase(), x + w / 2, y + 42);

  ctx.strokeStyle = '#c4b59f';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 24, y + 51);
  ctx.lineTo(x + w - 24, y + 51);
  ctx.stroke();

  ctx.font = 'italic 10.5px "Georgia", serif';
  ctx.fillStyle = '#4a3f35';
  ctx.fillText(`Anno ${currentYear} · Sovereign Dynasties`, x + w / 2, y + 68);

  ctx.font = '700 7px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#9c8a74';
  ctx.fillText('CARTOGRAPHIA IMPERIALIS', x + w / 2, y + 81);
  ctx.restore();
}

function drawClassicCompassRose(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  const radius = 35;

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = '#2b2218';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, radius - 4.5, 0, Math.PI * 2);
  ctx.strokeStyle = '#8a765e';
  ctx.lineWidth = 0.9;
  ctx.stroke();

  const points = 8;
  for (let i = 0; i < points; i++) {
    const ang = (i * Math.PI * 2) / points;
    const isMajor = i % 2 === 0;
    const len = isMajor ? radius - 2 : radius * 0.65;
    const halfAng = Math.PI / points;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
    ctx.lineTo(cx + Math.cos(ang - halfAng * 0.5) * (len * 0.35), cy + Math.sin(ang - halfAng * 0.5) * (len * 0.35));
    ctx.closePath();
    ctx.fillStyle = isMajor ? (i === 6 ? '#b91c1c' : '#f8f4ea') : '#e5dccb';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
    ctx.lineTo(cx + Math.cos(ang + halfAng * 0.5) * (len * 0.35), cy + Math.sin(ang + halfAng * 0.5) * (len * 0.35));
    ctx.closePath();
    ctx.fillStyle = isMajor ? '#3a2e22' : '#706050';
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, 3.8, 0, Math.PI * 2);
  ctx.fillStyle = '#b45309';
  ctx.fill();
  ctx.strokeStyle = '#2b2218';
  ctx.lineWidth = 1.0;
  ctx.stroke();

  ctx.font = 'bold 9.5px "Cinzel", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#1c1610';
  ctx.fillText('N', cx, cy - radius - 9);
  ctx.fillText('S', cx, cy + radius + 9);
  ctx.fillText('E', cx + radius + 9, cy);
  ctx.fillText('W', cx - radius - 9, cy);

  ctx.restore();
}

function drawClassicScaleBar(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const segW = 32;
  const h = 7;
  const numSegs = 4;

  ctx.save();
  ctx.font = '600 8px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#1c1610';
  ctx.textAlign = 'center';

  for (let i = 0; i < numSegs; i++) {
    const sx = x + i * segW;
    ctx.fillStyle = i % 2 === 0 ? '#1c1610' : '#f8f4ea';
    ctx.fillRect(sx, y, segW, h);
    ctx.strokeStyle = '#1c1610';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx, y, segW, h);
    ctx.fillStyle = '#1c1610';
    ctx.fillText(`${i * 50}`, sx, y - 4);
  }
  ctx.fillText('200 Leagues', x + numSegs * segW + 30, y + 5);
  ctx.restore();
}

function drawClassicNeatline(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  theme?: CartographyTheme
) {
  ctx.save();
  const m1 = 7;
  const m2 = 14;
  const m3 = 18;

  ctx.fillStyle =
    theme?.id === 'vintage'
      ? '#b99c72'
      : theme?.id === 'parchment'
      ? '#dac8a5'
      : theme?.id === 'ink'
      ? '#dcd8cd'
      : theme?.id === 'hand_drawn'
      ? '#e2d4b8'
      : '#d0c1ae';
  ctx.fillRect(0, 0, width, m1);
  ctx.fillRect(0, height - m1, width, m1);
  ctx.fillRect(0, 0, m1, height);
  ctx.fillRect(width - m1, 0, m1, height);

  ctx.strokeStyle = theme?.shoreInk || '#18120c';
  ctx.lineWidth = 2.4;
  ctx.strokeRect(m1, m1, width - m1 * 2, height - m1 * 2);

  ctx.strokeStyle = '#6e5a45';
  ctx.lineWidth = 1.0;
  ctx.strokeRect(m2, m2, width - m2 * 2, height - m2 * 2);

  const ribbonW = m2 - m1;
  const segLen = 22;

  for (let x = m1; x < width - m1; x += segLen) {
    const isDark = Math.floor((x - m1) / segLen) % 2 === 0;
    ctx.fillStyle = isDark ? (theme?.shoreInk || '#241a12') : (theme?.landBase || '#fcf8ee');
    const curW = Math.min(segLen, width - m1 - x);
    ctx.fillRect(x, m1, curW, ribbonW);
    ctx.fillRect(x, height - m2, curW, ribbonW);
  }

  for (let y = m1; y < height - m1; y += segLen) {
    const isDark = Math.floor((y - m1) / segLen) % 2 === 0;
    ctx.fillStyle = isDark ? (theme?.shoreInk || '#241a12') : (theme?.landBase || '#fcf8ee');
    const curH = Math.min(segLen, height - m1 - y);
    ctx.fillRect(m1, y, ribbonW, curH);
    ctx.fillRect(width - m2, y, ribbonW, curH);
  }

  ctx.strokeStyle = '#8c765c';
  ctx.lineWidth = 0.6;
  ctx.strokeRect(m3, m3, width - m3 * 2, height - m3 * 2);

  const sz = 14;
  const cornerPositions = [
    [m1, m1],
    [width - m1 - sz, m1],
    [m1, height - m1 - sz],
    [width - m1 - sz, height - m1 - sz],
  ];

  for (const [cx, cy] of cornerPositions) {
    ctx.fillStyle = '#18120c';
    ctx.fillRect(cx, cy, sz, sz);
    ctx.strokeStyle = '#e2c58e';
    ctx.lineWidth = 1.0;
    ctx.strokeRect(cx + 2, cy + 2, sz - 4, sz - 4);
    ctx.fillStyle = '#e2c58e';
    ctx.beginPath();
    ctx.arc(cx + sz / 2, cy + sz / 2, 2.0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function hexToRgba(hex: string, alpha: number): string {
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length === 6) {
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(180, 83, 9, ${alpha})`;
}

const BIOME_SEASON_PALETTES: Record<BiomeType, [string, string, string, string]> = {
  'Glacial Tundra': ['#dce5ed', '#e8edf2', '#dce3ea', '#f8fafc'],
  'Boreal Taiga': ['#78a67c', '#8fa88a', '#658262', '#6c8678'],
  'Temperate Forest': ['#5ebb7b', '#a7c19c', '#d97706', '#c0ccc0'],
  'Tropical Rainforest': ['#16a34a', '#6d9966', '#4d7c48', '#507e4d'],
  'Steppe Grassland': ['#84cc16', '#d7d4a6', '#cbb37a', '#e1e5de'],
  'Arid Savanna': ['#d9be79', '#e2cf9f', '#cca05b', '#d9ccb4'],
  'Scorched Desert': ['#ecd197', '#eed09f', '#e4be88', '#ebd6b0'],
  'Misty Wetland': ['#5eead4', '#9bb4a7', '#8ea499', '#bfd0da'],
  'Deep Ocean': ['#1b324b', '#1b324b', '#16283b', '#1e3852'],
  'Shallow Sea': ['#2d506d', '#2d506d', '#244158', '#345b7c'],
};

function getInterpolatedBiomeColor(
  biome: BiomeType,
  elev: number,
  seasonal: SeasonalState
): string {
  const pal = BIOME_SEASON_PALETTES[biome] || ['#d2e7c4', '#e6dac8', '#d4c28f', '#e2e8f0'];
  const baseCol = blend4Colors(
    pal[0], pal[1], pal[2], pal[3],
    seasonal.springWeight, seasonal.summerWeight, seasonal.autumnWeight, seasonal.winterWeight
  );

  // Snap highland snow cleanly instead of per-cell gradient interpolation
  if (elev >= seasonal.snowline) {
    return '#eef2f6';
  }
  return baseCol;
}

export function getBathymetricColor(depth: number): string {
  const d = Math.max(0, Math.min(1, depth));
  // Flat stepped bathymetric bands (eliminates per-Voronoi-cell gradient mosaic)
  if (d <= 0.14) return '#9ec2cc';
  if (d <= 0.32) return '#88aeb9';
  if (d <= 0.56) return '#6f96a4';
  if (d <= 0.78) return '#537887';
  return '#3b5b6b';
}

function getHeightmapColor(elev: number): string {
  if (elev < 0.28) return '#335b6c';
  if (elev < 0.38) return '#d8cfa9';
  if (elev < 0.50) return '#b5c898';
  if (elev < 0.65) return '#d4c28f';
  if (elev < 0.80) return '#a68c71';
  return '#eae6df';
}

function getRainfallColor(rain: number): string {
  if (rain < 0.25) return '#f0d9ab';
  if (rain < 0.50) return '#d4d8a5';
  if (rain < 0.75) return '#a2c89e';
  if (rain < 1.0) return '#6faea0';
  return '#438ea2';
}

export function getPopulationDensityColor(density: number): string {
  if (density <= 0) return '#d9d2c2';
  if (density < 16) return '#e2dccf';
  if (density < 30) return '#c8d6aa';
  if (density < 50) return '#e8d898';
  if (density < 75) return '#eab562';
  if (density < 110) return '#de8e44';
  if (density < 150) return '#d25b2a';
  return '#a8241e';
}

function drawSeasonalWeatherAtmosphere(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  seasonal: SeasonalState,
  weatherEvent?: WeatherEvent,
  caravanTick: number = 0,
  windAngleDeg: number = 30,
  showWind: boolean = true
) {
  ctx.save();

  if (showWind) {
    const rad = (windAngleDeg * Math.PI) / 180;
    const cosW = Math.cos(rad);
    const sinW = Math.sin(rad);

    const windR = Math.round(52 * seasonal.springWeight + 245 * seasonal.summerWeight + 217 * seasonal.autumnWeight + 186 * seasonal.winterWeight);
    const windG = Math.round(211 * seasonal.springWeight + 158 * seasonal.summerWeight + 119 * seasonal.autumnWeight + 218 * seasonal.winterWeight);
    const windB = Math.round(153 * seasonal.springWeight + 11 * seasonal.summerWeight + 6 * seasonal.autumnWeight + 235 * seasonal.winterWeight);
    ctx.strokeStyle = `rgba(${windR}, ${windG}, ${windB}, 0.26)`;

    ctx.lineWidth = 1.15;
    ctx.setLineDash([14, 18]);
    ctx.lineDashOffset = -(caravanTick * 32) % 64;

    const streams = [
      { startX: -60, startY: 100, len: 1250 },
      { startX: -60, startY: 230, len: 1250 },
      { startX: -60, startY: 360, len: 1250 },
      { startX: -60, startY: 490, len: 1250 },
      { startX: -60, startY: 620, len: 1250 },
      { startX: 180, startY: -60, len: 1150 },
      { startX: 480, startY: -60, len: 1150 },
      { startX: 780, startY: -60, len: 1150 },
    ];

    for (const st of streams) {
      ctx.beginPath();
      ctx.moveTo(st.startX, st.startY);
      const endX = st.startX + cosW * st.len;
      const endY = st.startY + sinW * st.len;
      const ctrlX = (st.startX + endX) / 2 + sinW * 50;
      const ctrlY = (st.startY + endY) / 2 - cosW * 50;
      ctx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  if (seasonal.winterWeight > 0.05) {
    ctx.fillStyle = `rgba(255, 255, 255, ${0.75 * seasonal.winterWeight})`;
    const flakeCount = Math.round(65 * seasonal.winterWeight);
    for (let i = 0; i < flakeCount; i++) {
      const seedX = (Math.sin(i * 91.3 + 12.5) * 0.5 + 0.5) * width;
      const seedY = (Math.cos(i * 47.7 + 34.1) * 0.5 + 0.5) * height;
      const speed = 18 + (i % 5) * 8;
      const fx = (seedX + caravanTick * speed * 0.8) % width;
      const fy = (seedY + caravanTick * speed * 1.4) % height;
      const sz = 1.0 + (i % 3) * 0.75;
      ctx.beginPath();
      ctx.arc(fx, fy, sz, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (seasonal.autumnWeight > 0.05) {
    const leafColors = ['#d97706', '#b45309', '#c2410c', '#eab308'];
    const leafCount = Math.round(40 * seasonal.autumnWeight);
    for (let i = 0; i < leafCount; i++) {
      const seedX = (Math.sin(i * 63.1 + 8.2) * 0.5 + 0.5) * width;
      const seedY = (Math.cos(i * 31.9 + 17.5) * 0.5 + 0.5) * height;
      const speed = 14 + (i % 4) * 6;
      const lx = (seedX + caravanTick * speed) % width;
      const ly = (seedY + Math.sin(caravanTick * 2 + i) * 12 + caravanTick * (speed * 0.4)) % height;
      ctx.fillStyle = leafColors[i % leafColors.length];
      ctx.beginPath();
      ctx.ellipse(lx, ly, 2.2, 1.2, caravanTick * 1.5 + i, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (seasonal.springWeight > 0.05) {
    ctx.strokeStyle = `rgba(110, 231, 183, ${0.28 * seasonal.springWeight})`;
    ctx.lineWidth = 0.8;
    const rainCount = Math.round(48 * seasonal.springWeight);
    for (let i = 0; i < rainCount; i++) {
      const seedX = (Math.sin(i * 88.3 + 4.1) * 0.5 + 0.5) * width;
      const seedY = (Math.cos(i * 52.1 + 9.8) * 0.5 + 0.5) * height;
      const rx = (seedX + caravanTick * 28) % width;
      const ry = (seedY + caravanTick * 45) % height;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + 2.5, ry + 6);
      ctx.stroke();
    }
  }

  if (seasonal.summerWeight > 0.05) {
    ctx.strokeStyle = `rgba(253, 230, 138, ${0.14 * seasonal.summerWeight})`;
    ctx.lineWidth = 16;
    for (let i = 0; i < 4; i++) {
      const x0 = 100 + i * 260 + Math.sin(caravanTick * 0.5 + i) * 20;
      ctx.beginPath();
      ctx.moveTo(x0, 0);
      ctx.lineTo(x0 + 120, height);
      ctx.stroke();
    }
  }

  if (weatherEvent) {
    drawWeatherCataclysmVignette(ctx, width, height, weatherEvent);
  }

  ctx.restore();
}

function drawWeatherCataclysmVignette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  event: WeatherEvent
) {
  ctx.save();
  const bx = width * 0.5;
  const by = 46;
  const bw = 330;
  const bh = 34;

  ctx.fillStyle =
    event.season === 'Winter'
      ? 'rgba(15, 23, 42, 0.90)'
      : event.season === 'Autumn'
      ? 'rgba(67, 20, 7, 0.90)'
      : event.season === 'Summer'
      ? 'rgba(69, 26, 3, 0.90)'
      : 'rgba(6, 78, 59, 0.90)';

  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.roundRect(bx - bw / 2, by - bh / 2, bw, bh, 6);
  ctx.fill();
  ctx.stroke();

  const icon =
    event.type === 'Heavy Blizzard' || event.type === 'Alpine Whiteout'
      ? '❄️'
      : event.type === 'Sea Pack Ice'
      ? '🧊'
      : event.type === 'Spring Thaw & Deluge'
      ? '🌊'
      : event.type === 'Scorching Heatwave'
      ? '☀️'
      : '🌪️';

  ctx.font = 'bold 11px "Cinzel", Georgia, serif';
  ctx.fillStyle = '#fef08a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${icon} ${event.title.toUpperCase()} · ${event.season.toUpperCase()}`, bx, by - 4);

  ctx.font = '600 9px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(event.effect, bx, by + 8);

  ctx.restore();
}

function drawV17Provinces(
  ctx: CanvasRenderingContext2D,
  provinces: Province[],
  lockedDown: string[]
) {
  ctx.save();
  for (const prov of provinces) {
    const isLocked = lockedDown.includes(prov.id);
    const terrainIcon =
      prov.terrain === 'Mountains'
        ? '🏔️'
        : prov.terrain === 'Forest'
        ? '🌲'
        : prov.terrain === 'Coastal'
        ? '🌊'
        : '🌾';

    const pillY = prov.capitalY - 32;
    const pillText = `${terrainIcon} ${prov.name} · ${prov.terrain}`;
    ctx.font = '600 9.5px "Plus Jakarta Sans", system-ui, sans-serif';
    const textW = ctx.measureText(pillText).width;

    ctx.fillStyle = isLocked ? 'rgba(127, 29, 29, 0.90)' : 'rgba(28, 25, 23, 0.85)';
    ctx.strokeStyle = isLocked ? '#ef4444' : '#a8a29e';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.roundRect(prov.capitalX - textW / 2 - 8, pillY - 12, textW + 16, 20, 5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isLocked ? '#fecaca' : '#f5f5f4';
    ctx.textAlign = 'center';
    ctx.fillText(pillText, prov.capitalX, pillY + 2);

    if (isLocked) {
      ctx.font = 'bold 8px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillStyle = '#f87171';
      ctx.fillText('🔒 QUARANTINED', prov.capitalX, pillY + 16);
    }
  }
  ctx.restore();
}

function drawV17Epidemics(
  ctx: CanvasRenderingContext2D,
  epidemics: Epidemic[],
  provinces: Province[],
  lockedDown: string[],
  tick: number,
  projectY: (x: number, y: number) => number = (_x, y) => y
) {
  ctx.save();
  const pulse = Math.sin(tick * 0.08) * 0.12 + 0.28;

  for (const ep of epidemics) {
    if (!ep.infectedProvinceIds || ep.infectedProvinceIds.length === 0) continue;

    let sumX = 0;
    let sumY = 0;
    let validCount = 0;

    for (const pid of ep.infectedProvinceIds) {
      const prov = provinces.find((p) => p.id === pid);
      if (!prov) continue;
      const py = projectY(prov.capitalX, prov.capitalY);
      sumX += prov.capitalX;
      sumY += py;
      validCount++;

      const rad = 42 + Math.sin(tick * 0.05 + pid.length) * 6;
      const grad = ctx.createRadialGradient(
        prov.capitalX,
        py,
        6,
        prov.capitalX,
        py,
        rad
      );
      grad.addColorStop(0, `rgba(220, 38, 38, ${pulse * 0.65})`);
      grad.addColorStop(0.7, `rgba(185, 28, 28, ${pulse * 0.22})`);
      grad.addColorStop(1, 'rgba(153, 27, 27, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(prov.capitalX, py, rad, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
      ctx.font = '9px "Segoe UI Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('☠', prov.capitalX, py - 14);

      if (lockedDown.includes(pid)) {
        ctx.font = '8px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.fillStyle = '#fca5a5';
        ctx.fillText('🔒', prov.capitalX + 12, py - 14);
      }
    }

    if (validCount > 0) {
      const epicX = sumX / validCount;
      const epicY = sumY / validCount - 26;

      ctx.font = 'bold 9.5px "Plus Jakarta Sans", system-ui, sans-serif';
      const plagueText = `☠️ ${ep.name} · ${validCount} Provinces (${Math.round(ep.lethality * 100)}% Lethal)`;
      const pW = ctx.measureText(plagueText).width;

      ctx.fillStyle = 'rgba(45, 10, 10, 0.92)';
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(epicX - pW / 2 - 8, epicY - 10, pW + 16, 20, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fecaca';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(plagueText, epicX, epicY);
    }
  }
  ctx.restore();
}

function drawV17TravelingNobles(
  ctx: CanvasRenderingContext2D,
  characters: Character[],
  provinces: Province[],
  tick: number,
  projectY: (x: number, y: number) => number = (_x, y) => y
) {
  const travelers = characters.filter(
    (c) => c.isAlive && c.isTraveling && c.provinceId && c.travelDestProvinceId
  );
  if (travelers.length === 0) return;

  ctx.save();
  for (const c of travelers) {
    const fromP = provinces.find((p) => p.id === c.provinceId);
    const toP = provinces.find((p) => p.id === c.travelDestProvinceId);
    if (!fromP || !toP) continue;

    const totalDuration = 2;
    const progress = Math.max(
      0.08,
      Math.min(
        0.92,
        1 - (c.travelMonthsLeft || 1) / totalDuration + Math.sin(tick * 0.05) * 0.02
      )
    );
    const fromY = projectY(fromP.capitalX, fromP.capitalY);
    const toY = projectY(toP.capitalX, toP.capitalY);
    const rawCurX = fromP.capitalX + (toP.capitalX - fromP.capitalX) * progress;
    const rawCurY = fromP.capitalY + (toP.capitalY - fromP.capitalY) * progress;
    const curX = rawCurX;
    const curY = projectY(rawCurX, rawCurY);

    ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(fromP.capitalX, fromY);
    ctx.lineTo(toP.capitalX, toY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(24, 24, 27, 0.92)';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(curX, curY, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.font = '10px serif';
    ctx.textAlign = 'center';
    ctx.fillText('🏇', curX, curY + 3.5);

    const travLabel = `${c.name} (${c.travelPurpose || 'Journey'})`;
    ctx.font = '600 8.5px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 2.5;
    ctx.strokeText(travLabel, curX, curY - 12);
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(travLabel, curX, curY - 12);
  }
  ctx.restore();
}