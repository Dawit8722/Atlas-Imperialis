import Delaunator from 'delaunator';
import type { Burg, MapPin, Point2D, WorldState } from '../types/world';
import { PRNG } from '../utils/proceduralNoise';
import { traceMergedGroupLoops } from './atlasMapRenderer';
import type { VoronoiDualMesh } from './voronoiDualMesh';
import {
  BespokeBuildingSlot,
  ensureBurgBuildingSlots,
  getSettlementBlueprint,
} from './settlementDevelopmentEngine';

export type SlotVisualRole =
  | 'fortification'
  | 'citadel'
  | 'market'
  | 'temple'
  | 'harbor'
  | 'industry'
  | 'garrison'
  | 'civic';

export interface CityBuildingFootprint {
  id: string;
  polygon: Point2D[];
  roofColor: string;
  wallColor: string;
  ridgeStart?: Point2D;
  ridgeEnd?: Point2D;
  isRuined: boolean;
  isLandmark?: boolean;
  isCircular?: boolean;
  center: Point2D;
  radius?: number;
  wardKind: 'core' | 'suburb' | 'citadel' | 'harbor' | 'rural';
}

export interface CityFieldStrip {
  id: string;
  polygon: Point2D[];
  fillColor: string;
  furrowAngle: number;
  kind: 'crop' | 'pasture' | 'orchard' | 'commons';
}

export interface CityRoadSegment {
  id: string;
  points: Point2D[];
  width: number;
  kind: 'artery' | 'street' | 'quayside' | 'lane';
  destinationLabel?: string;
}

export interface CityBridge {
  id: string;
  center: Point2D;
  angle: number;
  width: number;
  length: number;
}

export interface CityGatehouse {
  id: string;
  x: number;
  y: number;
  angle: number;
  tier: 1 | 2 | 3;
  label: string;
  isBreached: boolean;
}

export interface CityWallSegment {
  id: string;
  a: Point2D;
  b: Point2D;
  isOuter: boolean;
  isBreached: boolean;
  tier: 1 | 2 | 3;
}

export interface CityBastionTower {
  id: string;
  x: number;
  y: number;
  angle: number;
  kind: 'round' | 'star' | 'timber' | 'beacon';
  radius: number;
  isBreached: boolean;
}

export interface CitySlotFeature {
  slotId: string;
  slotIndex: number;
  name: string;
  builtName: string;
  role: SlotVisualRole;
  level: number;
  maxLevel: number;
  isUnlocked: boolean;
  dilapidated: boolean;
  center: Point2D;
  boundsRadius: number;
  plotPolygon: Point2D[];
  structures: CityBuildingFootprint[];
  courtyards?: Point2D[][];
  piers?: Point2D[][];
  legendNumber?: number;
}

export interface CityMapPinFeature {
  id: string;
  label: string;
  category: MapPin['category'];
  notes?: string;
  center: Point2D;
  legendNumber?: number;
}

export interface CityLegendEntry {
  number: number;
  kind: 'slot' | 'pin';
  id: string;
  title: string;
  subtitle: string;
  roleOrCategory: string;
  level?: number;
  center: Point2D;
  dilapidated?: boolean;
}

export interface CityRubblePatch {
  x: number;
  y: number;
  radius: number;
  angle: number;
}

export interface CityBlueprint {
  burgId: string;
  burgName: string;
  settlementType: string;
  population: number;
  development: number;
  devastation: number;
  width: number;
  height: number;
  center: Point2D;
  parishRadius: number;
  fortLevel: number; // 0 = open, 1 = palisade, 2 = curtain wall, 3+ = concentric + moat + bastions
  citadelLevel: number;
  marketLevel: number;
  templeLevel: number;
  harborLevel: number;
  industryLevel: number;
  garrisonLevel: number;
  hasCoastalWater: boolean;
  hasRiver: boolean;
  waterAngle: number;
  waterPolygon: Point2D[];
  riverPolygons: Point2D[][];
  moatLoop: Point2D[];
  marketPlaza: Point2D[];
  citadelWardLoop: Point2D[];
  fields: CityFieldStrip[];
  treeClusters: Array<{ x: number; y: number; r: number }>;
  roads: CityRoadSegment[];
  bridges: CityBridge[];
  wallSegments: CityWallSegment[];
  bastions: CityBastionTower[];
  gatehouses: CityGatehouse[];
  houses: CityBuildingFootprint[];
  rubblePatches: CityRubblePatch[];
  slotFeatures: CitySlotFeature[];
  pinFeatures: CityMapPinFeature[];
  legend: CityLegendEntry[];
  scaleFeetPer100Units: number;
}

/**
 * Maps any vanilla or modded BespokeBuildingSlot into a canonical visual role
 * for procedural architecture generation.
 */
export function inferSlotVisualRole(
  slot: BespokeBuildingSlot,
  builtName?: string
): SlotVisualRole {
  const hay = `${slot.id} ${slot.name} ${builtName || ''}`.toLowerCase();

  if (
    /(keep|citadel|donjon|palace|motte)/.test(hay) &&
    !/(curtain|outer|beacon)/.test(hay)
  ) {
    return 'citadel';
  }
  if (/(wall|palisade|stockade|rampart|curtain|moat|bastion|seawall|watchtower|defense)/.test(hay)) {
    return 'fortification';
  }
  if (/(wharf|quay|harbor|port|dock|drydock|shipyard|boatyard|jetty|lighthouse|pharos|beacon)/.test(hay)) {
    return 'harbor';
  }
  if (/(cathedral|abbey|shrine|scriptorium|chapel|sanctum|temple|basilica|relig|church|parish)/.test(hay)) {
    return 'temple';
  }
  if (/(barracks|armory|arsenal|garrison|parade|lists|war college|stable)/.test(hay)) {
    return 'garrison';
  }
  if (/(market|bourse|guild|counting|bank|fondaco|warehouse|customs|fairground|exchange|mint|steelyard)/.test(hay)) {
    return 'market';
  }
  if (/(mill|granary|smelter|bloomery|mine|quarry|tillage|pasture|vineyard|saltworks|cistern|aqueduct)/.test(hay)) {
    return 'industry';
  }

  switch (slot.category) {
    case 'maritime':
      return 'harbor';
    case 'ecclesiastical':
      return 'temple';
    case 'military':
      return 'garrison';
    case 'economic':
      return 'market';
    case 'wonder':
      return /(pharos|harbor|lighthouse)/.test(hay) ? 'harbor' : 'civic';
    default:
      return 'civic';
  }
}

// ============================================================================
// GEOMETRY & MESH HELPERS
// ============================================================================

function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function polygonCentroid(poly: Point2D[]): Point2D {
  if (poly.length === 0) return { x: 500, y: 400 };
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  return { x: x / poly.length, y: y / poly.length };
}

function polygonArea(poly: Point2D[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) * 0.5;
}

function insetPolygon(poly: Point2D[], factor: number): Point2D[] {
  const c = polygonCentroid(poly);
  return poly.map((p) => ({
    x: c.x + (p.x - c.x) * factor,
    y: c.y + (p.y - c.y) * factor,
  }));
}

function pointInPolygon(pt: Point2D, poly: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function clipPolyToRect(poly: Point2D[], width: number, height: number): Point2D[] {
  let out = poly;
  const edges = [
    { inside: (p: Point2D) => p.x >= 0, hit: (a: Point2D, b: Point2D) => ({ x: 0, y: a.y + ((0 - a.x) / (b.x - a.x || 1e-9)) * (b.y - a.y) }) },
    { inside: (p: Point2D) => p.x <= width, hit: (a: Point2D, b: Point2D) => ({ x: width, y: a.y + ((width - a.x) / (b.x - a.x || 1e-9)) * (b.y - a.y) }) },
    { inside: (p: Point2D) => p.y >= 0, hit: (a: Point2D, b: Point2D) => ({ x: a.x + ((0 - a.y) / (b.y - a.y || 1e-9)) * (b.x - a.x), y: 0 }) },
    { inside: (p: Point2D) => p.y <= height, hit: (a: Point2D, b: Point2D) => ({ x: a.x + ((height - a.y) / (b.y - a.y || 1e-9)) * (b.x - a.x), y: height }) },
  ];
  for (const edge of edges) {
    if (out.length === 0) break;
    const input = out;
    out = [];
    let s = input[input.length - 1];
    for (const e of input) {
      const eIn = edge.inside(e);
      const sIn = edge.inside(s);
      if (eIn) {
        if (!sIn) out.push(edge.hit(s, e));
        out.push(e);
      } else if (sIn) {
        out.push(edge.hit(s, e));
      }
      s = e;
    }
  }
  return out;
}

function splitPolygonByLine(
  poly: Point2D[],
  p1: Point2D,
  p2: Point2D
): [Point2D[], Point2D[]] {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const side = (p: Point2D) => (p.x - p1.x) * dy - (p.y - p1.y) * dx;

  const left: Point2D[] = [];
  const right: Point2D[] = [];

  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = side(a);
    const sb = side(b);

    if (sa >= 0) left.push(a);
    if (sa <= 0) right.push(a);

    if ((sa > 0 && sb < 0) || (sa < 0 && sb > 0)) {
      const t = sa / (sa - sb);
      const hit = {
        x: a.x + t * (b.x - a.x),
        y: a.y + t * (b.y - a.y),
      };
      left.push(hit);
      right.push(hit);
    }
  }

  return [left, right];
}

function makeRect(cx: number, cy: number, w: number, h: number, angle: number): Point2D[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const hw = w * 0.5;
  const hh = h * 0.5;
  const corners = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];
  return corners.map((c) => ({
    x: cx + c.x * cos - c.y * sin,
    y: cy + c.x * sin + c.y * cos,
  }));
}

function makeRegularPoly(cx: number, cy: number, radius: number, sides: number, rot = 0): Point2D[] {
  const pts: Point2D[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    pts.push({
      x: cx + Math.cos(a) * radius,
      y: cy + Math.sin(a) * radius,
    });
  }
  return pts;
}

function segmentIntersect(a: Point2D, b: Point2D, c: Point2D, d: Point2D): Point2D | null {
  const rX = b.x - a.x;
  const rY = b.y - a.y;
  const sX = d.x - c.x;
  const sY = d.y - c.y;
  const denom = rX * sY - rY * sX;
  if (Math.abs(denom) < 1e-6) return null;
  const u = ((c.x - a.x) * rY - (c.y - a.y) * rX) / denom;
  const t = ((c.x - a.x) * sY - (c.y - a.y) * sX) / denom;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return { x: a.x + t * rX, y: a.y + t * rY };
  }
  return null;
}

/**
 * Recursively bisects an urban ward block along its longest edge with slight angular twist
 * to carve authentic irregular medieval townhouse & cottage footprints.
 */
function subdivideWardIntoBuildings(
  poly: Point2D[],
  prng: PRNG,
  minArea: number,
  maxArea: number,
  depth = 0
): Point2D[][] {
  if (poly.length < 3) return [];
  const area = polygonArea(poly);
  if (area < minArea) return [];
  if (depth >= 5 || (area <= maxArea && prng.next() < 0.72)) {
    const shrunk = insetPolygon(poly, 0.78 + prng.next() * 0.1);
    return polygonArea(shrunk) >= minArea * 0.65 ? [shrunk] : [];
  }

  // Find longest edge to cut perpendicular/twisted across it
  let bestLen = 0;
  let bestIdx = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const l = dist(a, b);
    if (l > bestLen) {
      bestLen = l;
      bestIdx = i;
    }
  }

  const eA = poly[bestIdx];
  const eB = poly[(bestIdx + 1) % poly.length];
  const ratio = 0.38 + prng.next() * 0.24;
  const mid = {
    x: eA.x + (eB.x - eA.x) * ratio,
    y: eA.y + (eB.y - eA.y) * ratio,
  };
  const edgeAngle = Math.atan2(eB.y - eA.y, eB.x - eA.x);
  const twist = (prng.next() - 0.5) * 0.24;
  const cutAngle = edgeAngle + Math.PI * 0.5 + twist;
  const p2 = {
    x: mid.x + Math.cos(cutAngle) * 400,
    y: mid.y + Math.sin(cutAngle) * 400,
  };

  const [left, right] = splitPolygonByLine(poly, mid, p2);
  const gap = 1.6;
  const nx = Math.cos(cutAngle + Math.PI * 0.5) * gap;
  const ny = Math.sin(cutAngle + Math.PI * 0.5) * gap;

  const leftShifted = left.map((p) => ({ x: p.x - nx, y: p.y - ny }));
  const rightShifted = right.map((p) => ({ x: p.x + nx, y: p.y + ny }));

  const out: Point2D[][] = [];
  if (leftShifted.length >= 3) {
    out.push(...subdivideWardIntoBuildings(leftShifted, prng, minArea, maxArea, depth + 1));
  }
  if (rightShifted.length >= 3) {
    out.push(...subdivideWardIntoBuildings(rightShifted, prng, minArea, maxArea, depth + 1));
  }
  return out;
}

/**
 * Builds a spiral VoronoiDualMesh compatible with traceMergedGroupLoops.
 */
function buildSpiralCityMesh(
  width: number,
  height: number,
  interiorCount: number,
  prng: PRNG
): VoronoiDualMesh {
  const cx = width * 0.5;
  const cy = height * 0.5;
  const coords: number[] = [];
  const r_is_boundary: boolean[] = [];

  // Golden-angle spiral interior seeds (dense near center, sparser outward)
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const maxSpiralR = Math.min(width, height) * 0.48;
  for (let i = 0; i < interiorCount; i++) {
    const t = (i + 0.5) / interiorCount;
    const r = Math.pow(t, 0.58) * maxSpiralR;
    const ang = i * goldenAngle + (prng.next() - 0.5) * 0.28;
    const px = cx + Math.cos(ang) * r + (prng.next() - 0.5) * 14;
    const py = cy + Math.sin(ang) * r + (prng.next() - 0.5) * 14;
    coords.push(
      Math.max(18, Math.min(width - 18, px)),
      Math.max(18, Math.min(height - 18, py))
    );
    r_is_boundary.push(false);
  }

  // Outer perimeter ring so Voronoi cells around the edge remain closed and finite
  const ringPts = 28;
  for (let i = 0; i < ringPts; i++) {
    const ang = (i / ringPts) * Math.PI * 2;
    const px = cx + Math.cos(ang) * (width * 0.62);
    const py = cy + Math.sin(ang) * (height * 0.62);
    coords.push(px, py);
    r_is_boundary.push(true);
  }

  const numRegions = coords.length / 2;
  const r_x = new Float64Array(numRegions);
  const r_y = new Float64Array(numRegions);
  for (let i = 0; i < numRegions; i++) {
    r_x[i] = coords[i * 2];
    r_y[i] = coords[i * 2 + 1];
  }

  const delaunay = new Delaunator(coords);
  const { triangles, halfedges } = delaunay;
  const numSides = triangles.length;
  const numTriangles = numSides / 3;

  const s_start_r = new Int32Array(numSides);
  const s_end_r = new Int32Array(numSides);
  const s_left_t = new Int32Array(numSides);
  for (let s = 0; s < numSides; s++) {
    s_start_r[s] = triangles[s];
    s_end_r[s] = triangles[s % 3 === 2 ? s - 2 : s + 1];
    s_left_t[s] = Math.floor(s / 3);
  }

  const t_x = new Float64Array(numTriangles);
  const t_y = new Float64Array(numTriangles);
  for (let t = 0; t < numTriangles; t++) {
    const s0 = 3 * t;
    const r0 = triangles[s0];
    const r1 = triangles[s0 + 1];
    const r2 = triangles[s0 + 2];
    const ax = r_x[r0], ay = r_y[r0];
    const bx = r_x[r1], by = r_y[r1];
    const cx0 = r_x[r2], cy0 = r_y[r2];
    const d = 2 * (ax * (by - cy0) + bx * (cy0 - ay) + cx0 * (ay - by));
    if (Math.abs(d) < 1e-6) {
      t_x[t] = (ax + bx + cx0) / 3;
      t_y[t] = (ay + by + cy0) / 3;
    } else {
      const aSq = ax * ax + ay * ay;
      const bSq = bx * bx + by * by;
      const cSq = cx0 * cx0 + cy0 * cy0;
      t_x[t] = (aSq * (by - cy0) + bSq * (cy0 - ay) + cSq * (ay - by)) / d;
      t_y[t] = (aSq * (cx0 - bx) + bSq * (ax - cx0) + cSq * (bx - ax)) / d;
    }
  }

  const r_neighbors: number[][] = new Array(numRegions).fill(null).map(() => []);
  const r_circums: number[][] = new Array(numRegions).fill(null).map(() => []);
  for (let s = 0; s < numSides; s++) {
    const rStart = s_start_r[s];
    const rEnd = s_end_r[s];
    const t = s_left_t[s];
    if (!r_neighbors[rStart].includes(rEnd)) r_neighbors[rStart].push(rEnd);
    if (!r_circums[rStart].includes(t)) r_circums[rStart].push(t);
  }

  const r_polygon: Point2D[][] = new Array(numRegions).fill(null).map(() => []);
  for (let r = 0; r < numRegions; r++) {
    const cPt = { x: r_x[r], y: r_y[r] };
    const sortedTs = [...r_circums[r]].sort(
      (a, b) =>
        Math.atan2(t_y[a] - cPt.y, t_x[a] - cPt.x) -
        Math.atan2(t_y[b] - cPt.y, t_x[b] - cPt.x)
    );
    const rawPts = sortedTs.map((t) => ({ x: t_x[t], y: t_y[t] }));
    r_polygon[r] = clipPolyToRect(rawPts, width, height);
  }

  return {
    numRegions,
    numTriangles,
    numSides,
    r_x,
    r_y,
    r_neighbors,
    r_polygon,
    r_is_boundary,
    t_x,
    t_y,
    halfedges,
    s_start_r,
    s_end_r,
    s_left_t,
  };
}

// ============================================================================
// MAIN PROCEDURAL CITY GENERATOR
// ============================================================================

function getCultureRoofPalette(burg: Burg): { roofs: string[]; wall: string } {
  const c = (burg.culture || '').toLowerCase();
  if (/(norse|nord|frost|fjord|varang|highland|celt)/.test(c)) {
    return { roofs: ['#4a5562', '#5b636e', '#6f5b47', '#3f4b56'], wall: '#b9b2a4' };
  }
  if (/(desert|qadir|emir|sultan|oasis|sun|caliph|sand|harad)/.test(c)) {
    return { roofs: ['#c99e6c', '#b78254', '#d6b489', '#9f6a43'], wall: '#e4d3b6' };
  }
  if (/(mediterr|roman|venet|ionic|thallas|republic|valyr)/.test(c)) {
    return { roofs: ['#a9523b', '#ba6648', '#8d4332', '#c27a57'], wall: '#d8cbb5' };
  }
  return { roofs: ['#8d4d3a', '#7c4e3e', '#605b59', '#965c44', '#555d68'], wall: '#cfc3ae' };
}

function buildCruciformTemple(cx: number, cy: number, radius: number, angle: number, roof: string, wall: string, isRuined: boolean, seedId: string): CityBuildingFootprint[] {
  const naveLen = radius * 1.45;
  const naveW = radius * 0.56;
  const transeptLen = radius * 1.1;
  const transeptW = radius * 0.44;
  return [
    {
      id: `${seedId}_nave`,
      polygon: makeRect(cx, cy, naveLen, naveW, angle),
      roofColor: roof,
      wallColor: wall,
      isRuined,
      isLandmark: true,
      center: { x: cx, y: cy },
      wardKind: 'core',
    },
    {
      id: `${seedId}_transept`,
      polygon: makeRect(cx - Math.cos(angle) * radius * 0.14, cy - Math.sin(angle) * radius * 0.14, transeptW, transeptLen, angle),
      roofColor: roof,
      wallColor: wall,
      isRuined,
      isLandmark: true,
      center: { x: cx, y: cy },
      wardKind: 'core',
    },
  ];
}

export function generateCityBlueprint(world: WorldState, burg: Burg): CityBlueprint {
  const width = 1000;
  const height = 800;
  const center: Point2D = { x: width * 0.5, y: height * 0.5 };
  const prng = new PRNG(`${world.settings?.seed || 'realmsmith'}:city:${burg.id}`);

  const blueprint = getSettlementBlueprint(burg.type);
  const slotStates = ensureBurgBuildingSlots(burg);
  const dev = Math.floor(burg.developmentLevel ?? 15);
  const devastation = Math.max(0, Math.min(100, Math.round(burg.devastation || 0)));
  const pop = burg.population < 50 ? Math.round(burg.population * 1000) : (burg.population || 1500);

  // 1. Analyze Building Slots via Mod-Friendly Role Mapping
  let fortLevel = 0;
  let citadelLevel = 0;
  let marketLevel = 0;
  let templeLevel = 0;
  let harborLevel = 0;
  let industryLevel = 0;
  let garrisonLevel = 0;

  let fortDilapidated = false;
  for (const slot of blueprint.slots) {
    const st = slotStates[slot.id] || { level: 0 };
    const lvl = st.level || 0;
    const lvlDef = lvl > 0 ? slot.levels.find((l) => l.level === lvl) : undefined;
    const role = inferSlotVisualRole(slot, lvlDef?.name);
    if (role === 'fortification') {
      fortLevel = Math.max(fortLevel, lvl);
      if (st.dilapidated) fortDilapidated = true;
    } else if (role === 'citadel') {
      citadelLevel = Math.max(citadelLevel, lvl);
    } else if (role === 'market') {
      marketLevel = Math.max(marketLevel, lvl);
    } else if (role === 'temple') {
      templeLevel = Math.max(templeLevel, lvl);
    } else if (role === 'harbor') {
      harborLevel = Math.max(harborLevel, lvl);
    } else if (role === 'industry') {
      industryLevel = Math.max(industryLevel, lvl);
    } else if (role === 'garrison') {
      garrisonLevel = Math.max(garrisonLevel, lvl);
    }
  }

  // 2. Inspect WorldCell Neighbors & TradeNetwork Bearings
  const cells = world.cells || [];
  const homeCell =
    (burg.cellIndex !== undefined ? cells[burg.cellIndex] : undefined) ||
    cells.find((c) => Math.hypot(c.x - burg.x, c.y - burg.y) < 35);

  let waterVecX = 0;
  let waterVecY = 0;
  let waterWeight = 0;
  let riverVecX = 0;
  let riverVecY = 0;
  let riverWeight = 0;

  const neighborCells = homeCell
    ? cells.filter((c) => c.index !== homeCell.index && Math.hypot(c.x - homeCell.x, c.y - homeCell.y) < 65)
    : [];

  for (const nc of neighborCells) {
    const dx = nc.x - (homeCell?.x ?? burg.x);
    const dy = nc.y - (homeCell?.y ?? burg.y);
    const d = Math.max(1, Math.hypot(dx, dy));
    if (nc.isOcean || nc.isLake) {
      waterVecX += (dx / d) * (1 / d);
      waterVecY += (dy / d) * (1 / d);
      waterWeight += 1;
    }
    if (nc.isRiver) {
      riverVecX += dx / d;
      riverVecY += dy / d;
      riverWeight += 1;
    }
  }

  const isMaritimeSettlement =
    burg.type === 'Trade Port' ||
    burg.type === 'Fishing Port' ||
    burg.settlementSite === 'Estuary Harbor';
  const hasCoastalWater = Boolean(
    waterWeight > 0 || homeCell?.isCoast || isMaritimeSettlement || harborLevel > 0
  );
  const waterAngle =
    waterWeight > 0
      ? Math.atan2(waterVecY, waterVecX)
      : Math.PI * 0.68 + (prng.next() - 0.5) * 0.5;

  const hasRiver = Boolean(
    homeCell?.isRiver ||
      riverWeight > 0 ||
      burg.settlementSite === 'River Confluence' ||
      (!hasCoastalWater && prng.next() < 0.42)
  );
  const riverAngle =
    riverWeight > 0
      ? Math.atan2(riverVecY, riverVecX)
      : waterAngle + Math.PI * 0.45;

  // Incoming world trade route bearings
  const incomingBearings: Array<{ angle: number; label: string; isMaritime: boolean; weight: number }> = [];
  for (const r of world.tradeNetwork?.routes || []) {
    if (r.fromBurgId !== burg.id && r.toBurgId !== burg.id) continue;
    const pts = r.pathPoints || [];
    if (pts.length < 2) continue;
    const isFrom = r.fromBurgId === burg.id;
    const pSelf = isFrom ? pts[0] : pts[pts.length - 1];
    const pNext = isFrom ? pts[Math.min(2, pts.length - 1)] : pts[Math.max(0, pts.length - 3)];
    const ang = Math.atan2(pNext.y - pSelf.y, pNext.x - pSelf.x);
    const destName = isFrom ? r.toBurgName : r.fromBurgName;
    incomingBearings.push({
      angle: ang,
      label: `to ${destName}`,
      isMaritime: Boolean(r.isMaritime),
      weight: r.type === 'Imperial Highway' ? 2 : 1,
    });
  }

  // Ensure at least 3 overland road bearings away from ocean shore
  const roadBearings: Array<{ angle: number; label: string }> = incomingBearings
    .filter((b) => !b.isMaritime)
    .slice(0, 5)
    .map((b) => ({ angle: b.angle, label: b.label }));

  let candidateCount = 0;
  while (roadBearings.length < 3 && candidateCount < 16) {
    candidateCount++;
    const cand = (candidateCount * 2.1 + prng.next() * 0.5) % (Math.PI * 2);
    const diffFromWater = Math.abs(Math.atan2(Math.sin(cand - waterAngle), Math.cos(cand - waterAngle)));
    if (hasCoastalWater && diffFromWater < 0.85) continue;
    const tooClose = roadBearings.some(
      (rb) => Math.abs(Math.atan2(Math.sin(cand - rb.angle), Math.cos(cand - rb.angle))) < 0.65
    );
    if (!tooClose) {
      roadBearings.push({
        angle: cand,
        label: roadBearings.length === 0 ? 'Old Highway' : 'Parish Road',
      });
    }
  }

  // 3. Generate Spiral Voronoi Town Topology
  const sizeMult =
    blueprint.tierNum >= 4
      ? 1.24
      : blueprint.tierNum === 3
      ? 1.08
      : blueprint.tierNum === 2
      ? 0.92
      : 0.78;
  const popBonus = Math.min(0.22, Math.log10(Math.max(400, pop)) * 0.045);
  const parishRadius = Math.round(235 * sizeMult + popBonus * 140);
  const coreRadius = Math.round(parishRadius * (fortLevel > 0 ? 0.72 : 0.64));
  const seedCount = Math.round(145 + blueprint.tierNum * 28 + Math.min(45, pop / 450));

  const mesh = buildSpiralCityMesh(width, height, seedCount, prng);

  // Identify coastal ocean basin regions
  const waterRegions = new Set<number>();
  if (hasCoastalWater) {
    const shoreDist = coreRadius * 0.72;
    for (let r = 0; r < mesh.numRegions; r++) {
      const dx = mesh.r_x[r] - center.x;
      const dy = mesh.r_y[r] - center.y;
      const proj = dx * Math.cos(waterAngle) + dy * Math.sin(waterAngle);
      const perp = -dx * Math.sin(waterAngle) + dy * Math.cos(waterAngle);
      const undulation = Math.sin(perp * 0.015 + prng.next() * 0.1) * 18;
      if (proj > shoreDist + undulation) {
        waterRegions.add(r);
      }
    }
  }

  // Trace smooth waterfront polygon if coastal
  let waterPolygon: Point2D[] = [];
  if (hasCoastalWater && waterRegions.size > 0) {
    const { loops } = traceMergedGroupLoops(mesh, (r) => waterRegions.has(r), width, height, 1);
    if (loops.length > 0) {
      waterPolygon = loops.sort((a, b) => polygonArea(b) - polygonArea(a))[0];
    }
  }
  if (hasCoastalWater && waterPolygon.length < 3) {
    // Fallback coastal crescent polygon along waterAngle
    const nx = Math.cos(waterAngle);
    const ny = Math.sin(waterAngle);
    const tx = -ny;
    const ty = nx;
    const baseD = coreRadius * 0.78;
    waterPolygon = clipPolyToRect(
      [
        { x: center.x + nx * baseD - tx * 900, y: center.y + ny * baseD - ty * 900 },
        { x: center.x + nx * baseD + tx * 900, y: center.y + ny * baseD + ty * 900 },
        { x: center.x + nx * 950 + tx * 900, y: center.y + ny * 950 + ty * 900 },
        { x: center.x + nx * 950 - tx * 900, y: center.y + ny * 950 - ty * 900 },
      ],
      width,
      height
    );
  }

  // Build river ribbon if river exists
  const riverPolygons: Point2D[][] = [];
  let riverCenterline: Point2D[] = [];
  if (hasRiver) {
    const riverW = blueprint.tierNum >= 3 ? 28 : 20;
    const perp = riverAngle + Math.PI * 0.5;
    const offsetDist = hasCoastalWater ? coreRadius * 0.25 : coreRadius * 0.42;
    const anchor = {
      x: center.x + Math.cos(perp) * offsetDist,
      y: center.y + Math.sin(perp) * offsetDist,
    };
    const steps = 14;
    const spine: Point2D[] = [];
    for (let i = 0; i <= steps; i++) {
      const s = (i / steps - 0.5) * 1150;
      const bend = Math.sin((i / steps) * Math.PI * 2.2) * 32;
      spine.push({
        x: anchor.x + Math.cos(riverAngle) * s + Math.cos(perp) * bend,
        y: anchor.y + Math.sin(riverAngle) * s + Math.sin(perp) * bend,
      });
    }
    riverCenterline = spine;
    const leftBank: Point2D[] = [];
    const rightBank: Point2D[] = [];
    for (let i = 0; i < spine.length; i++) {
      const prev = spine[Math.max(0, i - 1)];
      const next = spine[Math.min(spine.length - 1, i + 1)];
      const tang = Math.atan2(next.y - prev.y, next.x - prev.x);
      const nX = -Math.sin(tang) * riverW * 0.5;
      const nY = Math.cos(tang) * riverW * 0.5;
      leftBank.push({ x: spine[i].x + nX, y: spine[i].y + nY });
      rightBank.push({ x: spine[i].x - nX, y: spine[i].y - nY });
    }
    riverPolygons.push([...leftBank, ...rightBank.reverse()]);
  }

  // Classify spiral Voronoi cells into Urban Core, Suburbs, and Rural Farmland
  const urbanCoreSet = new Set<number>();
  const suburbSet = new Set<number>();
  const citadelCandidateIds: number[] = [];

  for (let r = 0; r < mesh.numRegions; r++) {
    if (mesh.r_is_boundary[r] || waterRegions.has(r)) continue;
    const rx = mesh.r_x[r];
    const ry = mesh.r_y[r];
    const d = Math.hypot(rx - center.x, ry - center.y);
    const poly = mesh.r_polygon[r];
    if (poly.length < 3) continue;

    // Slight organic distortion along trade arteries so cities swell toward highways
    let arteryBoost = 0;
    const cellAng = Math.atan2(ry - center.y, rx - center.x);
    for (const rb of roadBearings) {
      const diff = Math.abs(Math.atan2(Math.sin(cellAng - rb.angle), Math.cos(cellAng - rb.angle)));
      if (diff < 0.35) arteryBoost = Math.max(arteryBoost, (0.35 - diff) * 90);
    }

    if (d <= coreRadius + arteryBoost * 0.45) {
      urbanCoreSet.add(r);
      if (d > coreRadius * 0.28 && d < coreRadius * 0.72) {
        citadelCandidateIds.push(r);
      }
    } else if (d <= coreRadius + 55 + arteryBoost * 0.85) {
      suburbSet.add(r);
    }
  }

  // Pick Citadel Ward regions if Citadel slot exists or is unlocked
  const citadelSet = new Set<number>();
  let citadelCenter: Point2D = {
    x: center.x - Math.cos(waterAngle) * coreRadius * 0.45,
    y: center.y - Math.sin(waterAngle) * coreRadius * 0.45,
  };
  if (citadelCandidateIds.length > 0) {
    // Orient citadel away from ocean shore or toward high flank
    const bestCit = [...citadelCandidateIds].sort((a, b) => {
      const scoreA =
        (mesh.r_x[a] - center.x) * -Math.cos(waterAngle) +
        (mesh.r_y[a] - center.y) * -Math.sin(waterAngle);
      const scoreB =
        (mesh.r_x[b] - center.x) * -Math.cos(waterAngle) +
        (mesh.r_y[b] - center.y) * -Math.sin(waterAngle);
      return scoreB - scoreA;
    })[0];
    citadelSet.add(bestCit);
    for (const nb of mesh.r_neighbors[bestCit]) {
      if (urbanCoreSet.has(nb) && citadelSet.size < (citadelLevel >= 2 ? 3 : 2)) {
        citadelSet.add(nb);
      }
    }
    citadelCenter = { x: mesh.r_x[bestCit], y: mesh.r_y[bestCit] };
  }

  let citadelWardLoop: Point2D[] = [];
  if (citadelLevel > 0 && citadelSet.size > 0) {
    const { loops } = traceMergedGroupLoops(mesh, (r) => citadelSet.has(r), width, height, 0);
    if (loops.length > 0) {
      citadelWardLoop = loops.sort((a, b) => polygonArea(b) - polygonArea(a))[0];
    }
  }

  // 4. Market Plaza Geometry (scales directly with Market / Guildhall level)
  const plazaRadius = 24 + marketLevel * 12 + (blueprint.tierNum >= 3 ? 6 : 0);
  const marketPlaza = makeRegularPoly(
    center.x,
    center.y,
    plazaRadius,
    marketLevel >= 2 ? 6 : 4,
    0.22 + prng.next() * 0.35
  );

  // 5. Trace Unified Curtain Wall Boundary via traceMergedGroupLoops
  const wallSegments: CityWallSegment[] = [];
  const bastions: CityBastionTower[] = [];
  const gatehouses: CityGatehouse[] = [];
  let moatLoop: Point2D[] = [];
  let wallLoops: Point2D[][] = [];

  if (fortLevel >= 1 && urbanCoreSet.size > 0) {
    const wallGroup = new Set<number>(urbanCoreSet);
    const { loops } = traceMergedGroupLoops(mesh, (r) => wallGroup.has(r), width, height, 0);
    wallLoops = loops.filter((l) => l.length >= 4);

    // Subdivide wall segments + apply War Devastation breaches
    const tier: 1 | 2 | 3 = fortLevel >= 3 ? 3 : fortLevel === 2 ? 2 : 1;
    const breachChance =
      (fortDilapidated ? 0.22 : 0) + Math.max(0, (devastation - 12) / 140);

    for (let li = 0; li < wallLoops.length; li++) {
      const loop = wallLoops[li];
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i];
        const b = loop[(i + 1) % loop.length];
        const len = dist(a, b);
        if (len < 4) continue;
        const isBreached = breachChance > 0 && prng.next() < breachChance;

        wallSegments.push({
          id: `wall_${li}_${i}`,
          a,
          b,
          isOuter: false,
          isBreached,
          tier,
        });

        // Towers / Bastions at wall vertices
        if (i % (tier >= 2 ? 2 : 3) === 0) {
          const ang = Math.atan2(a.y - center.y, a.x - center.x);
          bastions.push({
            id: `bastion_${li}_${i}`,
            x: a.x,
            y: a.y,
            angle: ang,
            kind: tier === 3 ? 'star' : tier === 2 ? 'round' : 'timber',
            radius: tier === 3 ? 11 : tier === 2 ? 7.5 : 4.5,
            isBreached: isBreached && prng.next() < 0.6,
          });
        }
      }

      // Level 3: Double concentric outer rampart + water/dry moat
      if (tier === 3) {
        const outerLoop = loop.map((p) => {
          const ang = Math.atan2(p.y - center.y, p.x - center.x);
          return {
            x: p.x + Math.cos(ang) * 20,
            y: p.y + Math.sin(ang) * 20,
          };
        });
        moatLoop = loop.map((p) => {
          const ang = Math.atan2(p.y - center.y, p.x - center.x);
          return {
            x: p.x + Math.cos(ang) * 33,
            y: p.y + Math.sin(ang) * 33,
          };
        });
        for (let i = 0; i < outerLoop.length; i++) {
          const a = outerLoop[i];
          const b = outerLoop[(i + 1) % outerLoop.length];
          const isBreached = breachChance > 0 && prng.next() < breachChance * 0.7;
          wallSegments.push({
            id: `outer_wall_${li}_${i}`,
            a,
            b,
            isOuter: true,
            isBreached,
            tier: 3,
          });
        }
      }
    }
  }

  // 6. Arterial Trade Roads, Bridges & Wall Gatehouses
  const roads: CityRoadSegment[] = [];
  const bridges: CityBridge[] = [];

  for (let idx = 0; idx < roadBearings.length; idx++) {
    const rb = roadBearings[idx];
    const startDist = plazaRadius * 0.85;
    const endDist = 560;
    const pts: Point2D[] = [];
    const segs = 12;
    const wobbleSign = idx % 2 === 0 ? 1 : -1;
    for (let s = 0; s <= segs; s++) {
      const r = startDist + ((endDist - startDist) * s) / segs;
      // Gently bend roads only outside core or slightly organically
      const bend =
        s === 0
          ? 0
          : Math.sin((s / segs) * Math.PI * 1.4) * (10 + prng.next() * 8) * wobbleSign;
      const px = center.x + Math.cos(rb.angle) * r - Math.sin(rb.angle) * bend;
      const py = center.y + Math.sin(rb.angle) * r + Math.cos(rb.angle) * bend;
      // Stop overland road cleanly if it hits ocean shore
      if (hasCoastalWater && waterPolygon.length >= 3 && pointInPolygon({ x: px, y: py }, waterPolygon)) {
        break;
      }
      pts.push({ x: px, y: py });
    }
    if (pts.length >= 2) {
      roads.push({
        id: `artery_${idx}`,
        points: pts,
        width: idx < 2 ? 9.5 : 7.5,
        kind: 'artery',
        destinationLabel: rb.label,
      });

      // Place Gatehouse at intersection of road and primary curtain wall
      if (fortLevel >= 1 && wallLoops.length > 0) {
        const mainLoop = wallLoops[0];
        let placed = false;
        for (let i = 0; i < pts.length - 1 && !placed; i++) {
          for (let j = 0; j < mainLoop.length && !placed; j++) {
            const hit = segmentIntersect(
              pts[i],
              pts[i + 1],
              mainLoop[j],
              mainLoop[(j + 1) % mainLoop.length]
            );
            if (hit) {
              placed = true;
              const tier: 1 | 2 | 3 = fortLevel >= 3 ? 3 : fortLevel === 2 ? 2 : 1;
              gatehouses.push({
                id: `gate_${idx}`,
                x: hit.x,
                y: hit.y,
                angle: rb.angle,
                tier,
                label: rb.label,
                isBreached: devastation >= 55 && idx === 0,
              });
            }
          }
        }
      }

      // Place Bridge if road crosses river centerline
      if (hasRiver && riverCenterline.length >= 2) {
        for (let i = 0; i < pts.length - 1; i++) {
          for (let j = 0; j < riverCenterline.length - 1; j++) {
            const hit = segmentIntersect(pts[i], pts[i + 1], riverCenterline[j], riverCenterline[j + 1]);
            if (hit) {
              const rTang = Math.atan2(
                riverCenterline[j + 1].y - riverCenterline[j].y,
                riverCenterline[j + 1].x - riverCenterline[j].x
              );
              bridges.push({
                id: `bridge_${idx}`,
                center: hit,
                angle: rTang + Math.PI * 0.5,
                width: 11,
                length: (blueprint.tierNum >= 3 ? 28 : 20) + 10,
              });
              break;
            }
          }
        }
      }
    }
  }

  // Secondary interior Voronoi-edge streets inside urban core
  const seenStreetPairs = new Set<string>();
  for (let r = 0; r < mesh.numRegions; r++) {
    if (!urbanCoreSet.has(r)) continue;
    for (const nb of mesh.r_neighbors[r]) {
      if (!urbanCoreSet.has(nb) || r >= nb) continue;
      const key = `${r}_${nb}`;
      if (seenStreetPairs.has(key)) continue;
      seenStreetPairs.add(key);
      if (prng.next() < 0.48) continue;
      const a = { x: mesh.r_x[r], y: mesh.r_y[r] };
      const b = { x: mesh.r_x[nb], y: mesh.r_y[nb] };
      if (dist(a, center) < plazaRadius * 0.9 || dist(b, center) < plazaRadius * 0.9) continue;
      roads.push({
        id: `st_${key}`,
        points: [a, b],
        width: 4.5,
        kind: 'street',
      });
    }
  }

  // 7. Outer Farmland Quilted Strips, Hedges & Woodland Clusters
  const fields: CityFieldStrip[] = [];
  const treeClusters: Array<{ x: number; y: number; r: number }> = [];
  const fieldColors = ['#c9cfa3', '#b8c48d', '#d3cb9b', '#a9b882', '#c3be8c'];

  for (let r = 0; r < mesh.numRegions; r++) {
    if (mesh.r_is_boundary[r] || waterRegions.has(r) || urbanCoreSet.has(r) || suburbSet.has(r)) {
      continue;
    }
    const poly = mesh.r_polygon[r];
    if (poly.length < 3 || polygonArea(poly) < 350) continue;

    // Split farmland cell into 2–3 agricultural strips or woods
    if (prng.next() < 0.19) {
      const c = polygonCentroid(poly);
      const trees = 3 + prng.range(0, 4);
      for (let t = 0; t < trees; t++) {
        const ang = prng.next() * Math.PI * 2;
        const rad = prng.next() * 24;
        treeClusters.push({
          x: c.x + Math.cos(ang) * rad,
          y: c.y + Math.sin(ang) * rad,
          r: 4 + prng.next() * 5,
        });
      }
      continue;
    }

    const shrunk = insetPolygon(poly, 0.93);
    const edgeAng = prng.next() * Math.PI;
    const c = polygonCentroid(shrunk);
    const p2 = { x: c.x + Math.cos(edgeAng) * 200, y: c.y + Math.sin(edgeAng) * 200 };
    const [fA, fB] = splitPolygonByLine(shrunk, c, p2);
    for (const [subIdx, sub] of [fA, fB].entries()) {
      if (sub.length >= 3 && polygonArea(sub) > 160) {
        fields.push({
          id: `field_${r}_${subIdx}`,
          polygon: insetPolygon(sub, 0.94),
          fillColor: fieldColors[prng.range(0, fieldColors.length - 1)],
          furrowAngle: edgeAng,
          kind: prng.next() < 0.25 ? 'pasture' : prng.next() < 0.2 ? 'orchard' : 'crop',
        });
      }
    }
  }

  // 8. Twisted-Bisection Houses inside Urban Wards & Suburbs
  const palette = getCultureRoofPalette(burg);
  const houses: CityBuildingFootprint[] = [];
  const ruinRatio = Math.min(0.75, devastation / 118);

  const generateHousesInCell = (r: number, wardKind: 'core' | 'suburb') => {
    const poly = mesh.r_polygon[r];
    if (poly.length < 3) return;
    const c = polygonCentroid(poly);
    // Keep central Market Plaza clear
    if (dist(c, center) < plazaRadius + 10) return;
    // Keep away from water / river channel
    if (hasCoastalWater && waterPolygon.length >= 3 && pointInPolygon(c, waterPolygon)) return;

    const blockPoly = insetPolygon(poly, wardKind === 'core' ? 0.86 : 0.82);
    const rawFootprints = subdivideWardIntoBuildings(
      blockPoly,
      prng,
      wardKind === 'core' ? 95 : 130,
      wardKind === 'core' ? 280 : 340
    );

    for (let hIdx = 0; hIdx < rawFootprints.length; hIdx++) {
      // Ribbon density drops off in suburbs
      if (wardKind === 'suburb' && prng.next() < 0.45) continue;
      if (wardKind === 'core' && prng.next() < 0.11) continue; // Interior courtyards

      const fp = rawFootprints[hIdx];
      const hCenter = polygonCentroid(fp);
      if (pointInPolygon(hCenter, marketPlaza)) continue;
      if (citadelWardLoop.length >= 3 && pointInPolygon(hCenter, citadelWardLoop)) continue;

      const isRuined = ruinRatio > 0 && prng.next() < ruinRatio;
      // Ridge spine along longest box axis
      let ridgeStart: Point2D | undefined;
      let ridgeEnd: Point2D | undefined;
      if (fp.length >= 4) {
        ridgeStart = { x: (fp[0].x + fp[3].x) * 0.5, y: (fp[0].y + fp[3].y) * 0.5 };
        ridgeEnd = { x: (fp[1].x + fp[2].x) * 0.5, y: (fp[1].y + fp[2].y) * 0.5 };
      }

      houses.push({
        id: `house_${r}_${hIdx}`,
        polygon: fp,
        roofColor: isRuined ? '#3b3530' : palette.roofs[prng.range(0, palette.roofs.length - 1)],
        wallColor: isRuined ? '#5c534a' : palette.wall,
        ridgeStart,
        ridgeEnd,
        isRuined,
        center: hCenter,
        wardKind,
      });
    }
  };

  for (const r of urbanCoreSet) {
    if (citadelSet.has(r)) continue;
    generateHousesInCell(r, 'core');
  }
  for (const r of suburbSet) {
    generateHousesInCell(r, 'suburb');
  }

  // 9. Slot-Driven Architectural Landmarks & Buildable Empty Plots
  const slotFeatures: CitySlotFeature[] = [];
  const usedAngles: number[] = [];

  const pickDistinctAnchor = (preferredAngle: number, radiusDist: number): Point2D => {
    let ang = preferredAngle;
    for (let attempt = 0; attempt < 8; attempt++) {
      const clash = usedAngles.some(
        (ua) => Math.abs(Math.atan2(Math.sin(ang - ua), Math.cos(ang - ua))) < 0.48
      );
      if (!clash) break;
      ang += 0.55;
    }
    usedAngles.push(ang);
    return {
      x: center.x + Math.cos(ang) * radiusDist,
      y: center.y + Math.sin(ang) * radiusDist,
    };
  };

  blueprint.slots.forEach((slot, idx) => {
    const st = slotStates[slot.id] || { level: 0 };
    const lvl = st.level || 0;
    const isUnlocked = dev >= slot.unlockDev;
    const builtDef = lvl > 0 ? slot.levels.find((l) => l.level === lvl) : undefined;
    const role = inferSlotVisualRole(slot, builtDef?.name);
    const isDilapidated = Boolean(st.dilapidated) || (lvl > 0 && devastation >= 60 && idx % 2 === 0);

    let anchor: Point2D;
    const structures: CityBuildingFootprint[] = [];
    const courtyards: Point2D[][] = [];
    const piers: Point2D[][] = [];
    let boundsRadius = 24;

    if (role === 'fortification') {
      const gate = gatehouses[0];
      anchor = gate
        ? { x: gate.x, y: gate.y }
        : {
            x: center.x + Math.cos(waterAngle + Math.PI * 0.85) * (coreRadius * 0.92),
            y: center.y + Math.sin(waterAngle + Math.PI * 0.85) * (coreRadius * 0.92),
          };
      boundsRadius = 26;
      if (lvl > 0) {
        structures.push({
          id: `${slot.id}_barbican`,
          polygon: makeRect(anchor.x, anchor.y, 18 + lvl * 4, 14 + lvl * 2, gate?.angle ?? 0),
          roofColor: lvl >= 2 ? '#5d656f' : '#7b5b3e',
          wallColor: '#cfc5b2',
          isRuined: isDilapidated,
          isLandmark: true,
          center: anchor,
          wardKind: 'core',
        });
      }
    } else if (role === 'citadel') {
      anchor = { ...citadelCenter };
      boundsRadius = 32;
      if (lvl > 0) {
        courtyards.push(makeRegularPoly(anchor.x, anchor.y, 26 + lvl * 3, 6, 0.2));
        structures.push({
          id: `${slot.id}_keep`,
          polygon: makeRect(anchor.x, anchor.y, 20 + lvl * 4, 16 + lvl * 3, 0.35),
          roofColor: '#48525e',
          wallColor: '#dbd1bd',
          isRuined: isDilapidated,
          isLandmark: true,
          center: anchor,
          wardKind: 'citadel',
        });
        if (lvl >= 3) {
          // Corner turret flanks
          for (let t = 0; t < 4; t++) {
            const ta = 0.35 + (t * Math.PI) / 2;
            const tx = anchor.x + Math.cos(ta) * 18;
            const ty = anchor.y + Math.sin(ta) * 18;
            structures.push({
              id: `${slot.id}_turret_${t}`,
              polygon: makeRegularPoly(tx, ty, 5.5, 8),
              roofColor: '#3d4752',
              wallColor: '#e2d8c5',
              isRuined: isDilapidated,
              isLandmark: true,
              isCircular: true,
              center: { x: tx, y: ty },
              radius: 5.5,
              wardKind: 'citadel',
            });
          }
        }
      }
    } else if (role === 'market') {
      const mAng = roadBearings[0]?.angle ? roadBearings[0].angle + 0.45 : -0.7;
      anchor = pickDistinctAnchor(mAng, plazaRadius + 16);
      boundsRadius = 26;
      if (lvl > 0) {
        structures.push({
          id: `${slot.id}_guildhall`,
          polygon: makeRect(anchor.x, anchor.y, 26 + lvl * 4, 12 + lvl * 2, mAng + Math.PI * 0.5),
          roofColor: '#9c4c39',
          wallColor: '#ded1ba',
          isRuined: isDilapidated,
          isLandmark: true,
          center: anchor,
          wardKind: 'core',
        });
        if (lvl >= 2) {
          const wh = {
            x: anchor.x + Math.cos(mAng) * 14,
            y: anchor.y + Math.sin(mAng) * 14,
          };
          structures.push({
            id: `${slot.id}_warehouse`,
            polygon: makeRect(wh.x, wh.y, 18, 10, mAng),
            roofColor: '#7a523e',
            wallColor: '#cfc1aa',
            isRuined: isDilapidated,
            isLandmark: true,
            center: wh,
            wardKind: 'core',
          });
        }
      }
    } else if (role === 'temple') {
      const tAng = waterAngle + Math.PI + 0.42;
      anchor = pickDistinctAnchor(tAng, coreRadius * 0.46);
      boundsRadius = 28;
      if (lvl > 0) {
        courtyards.push(makeRegularPoly(anchor.x, anchor.y, 24 + lvl * 2, 4, 0.3));
        structures.push(
          ...buildCruciformTemple(
            anchor.x,
            anchor.y,
            16 + lvl * 3.5,
            tAng,
            '#4f6277',
            '#e3dac6',
            isDilapidated,
            slot.id
          )
        );
      }
    } else if (role === 'harbor') {
      const shoreDist = coreRadius * 0.72;
      const offset = (idx % 2 === 0 ? 1 : -1) * 32;
      anchor = {
        x: center.x + Math.cos(waterAngle) * shoreDist - Math.sin(waterAngle) * offset,
        y: center.y + Math.sin(waterAngle) * shoreDist + Math.cos(waterAngle) * offset,
      };
      boundsRadius = 28;
      // Timber fishing piers (L1) -> Stone breakwater & ships/cranes (L2) -> Drydocks & Pharos Beacon (L3+)
      const pierCount = lvl === 0 ? 0 : Math.min(4, lvl + 1);
      for (let p = 0; p < pierCount; p++) {
        const perpOff = (p - (pierCount - 1) * 0.5) * 13;
        const px = anchor.x - Math.sin(waterAngle) * perpOff;
        const py = anchor.y + Math.cos(waterAngle) * perpOff;
        const pierLen = 18 + lvl * 10;
        piers.push(
          makeRect(
            px + Math.cos(waterAngle) * (pierLen * 0.5),
            py + Math.sin(waterAngle) * (pierLen * 0.5),
            pierLen,
            lvl >= 2 ? 5.5 : 3.5,
            waterAngle
          )
        );
      }
      if (lvl > 0) {
        structures.push({
          id: `${slot.id}_quayhouse`,
          polygon: makeRect(anchor.x, anchor.y, 22, 11, waterAngle + Math.PI * 0.5),
          roofColor: lvl >= 2 ? '#596673' : '#7d5f44',
          wallColor: '#d7cab4',
          isRuined: isDilapidated,
          isLandmark: true,
          center: anchor,
          wardKind: 'harbor',
        });
      }
      if (lvl >= 3 || /(lighthouse|pharos|beacon)/.test(slot.id)) {
        const bx = anchor.x + Math.cos(waterAngle) * (18 + lvl * 8);
        const by = anchor.y + Math.sin(waterAngle) * (18 + lvl * 8);
        structures.push({
          id: `${slot.id}_beacon`,
          polygon: makeRegularPoly(bx, by, 7, 8),
          roofColor: '#d97706',
          wallColor: '#ebe2cf',
          isRuined: isDilapidated,
          isLandmark: true,
          isCircular: true,
          center: { x: bx, y: by },
          radius: 7,
          wardKind: 'harbor',
        });
      }
    } else if (role === 'industry') {
      if (hasRiver && riverCenterline.length > 5 && /(mill|water)/.test(slot.name.toLowerCase())) {
        const rPt = riverCenterline[Math.floor(riverCenterline.length * 0.62)];
        anchor = { x: rPt.x, y: rPt.y };
      } else {
        anchor = pickDistinctAnchor(riverAngle + 0.9, coreRadius * 0.68);
      }
      boundsRadius = 24;
      if (lvl > 0) {
        // Silo / Granary / Mill cluster
        const isSilo = /(granary|mill|cistern|salt|smelter)/.test(slot.name.toLowerCase());
        if (isSilo && lvl >= 2) {
          for (let cIdx = 0; cIdx < 3; cIdx++) {
            const sx = anchor.x + (cIdx - 1) * 11;
            const sy = anchor.y + (cIdx % 2 === 0 ? -4 : 5);
            structures.push({
              id: `${slot.id}_silo_${cIdx}`,
              polygon: makeRegularPoly(sx, sy, 5.5, 10),
              roofColor: '#8d6c4d',
              wallColor: '#d7ccb8',
              isRuined: isDilapidated,
              isLandmark: true,
              isCircular: true,
              center: { x: sx, y: sy },
              radius: 5.5,
              wardKind: 'core',
            });
          }
        } else {
          structures.push({
            id: `${slot.id}_works`,
            polygon: makeRect(anchor.x, anchor.y, 20 + lvl * 3, 12 + lvl * 2, riverAngle),
            roofColor: '#725643',
            wallColor: '#cfc4af',
            isRuined: isDilapidated,
            isLandmark: true,
            center: anchor,
            wardKind: 'core',
          });
        }
      }
    } else if (role === 'garrison') {
      anchor = pickDistinctAnchor(waterAngle + Math.PI - 0.65, coreRadius * 0.64);
      boundsRadius = 26;
      if (lvl > 0) {
        courtyards.push(makeRect(anchor.x, anchor.y, 32, 24, 0.2));
        structures.push({
          id: `${slot.id}_barracks_n`,
          polygon: makeRect(anchor.x, anchor.y - 9, 24, 7, 0.2),
          roofColor: '#5e5552',
          wallColor: '#cfc3ae',
          isRuined: isDilapidated,
          isLandmark: true,
          center: { x: anchor.x, y: anchor.y - 9 },
          wardKind: 'core',
        });
        structures.push({
          id: `${slot.id}_barracks_s`,
          polygon: makeRect(anchor.x, anchor.y + 9, 24, 7, 0.2),
          roofColor: '#5e5552',
          wallColor: '#cfc3ae',
          isRuined: isDilapidated,
          isLandmark: true,
          center: { x: anchor.x, y: anchor.y + 9 },
          wardKind: 'core',
        });
      }
    } else {
      // Civic / Hall / University / Cistern
      anchor = pickDistinctAnchor(-Math.PI * 0.35 + idx * 0.7, plazaRadius + 24);
      boundsRadius = 22;
      if (lvl > 0) {
        structures.push({
          id: `${slot.id}_hall`,
          polygon: makeRect(anchor.x, anchor.y, 20 + lvl * 3, 12 + lvl * 2, 0.15),
          roofColor: '#546478',
          wallColor: '#ded3bf',
          isRuined: isDilapidated,
          isLandmark: true,
          center: anchor,
          wardKind: 'core',
        });
      }
    }

    const plotPolygon = makeRegularPoly(anchor.x, anchor.y, boundsRadius * 0.85, 6, 0.25);

    slotFeatures.push({
      slotId: slot.id,
      slotIndex: slot.slotIndex,
      name: slot.name,
      builtName: builtDef ? builtDef.name : slot.name,
      role,
      level: lvl,
      maxLevel: slot.levels.length,
      isUnlocked,
      dilapidated: isDilapidated,
      center: anchor,
      boundsRadius,
      plotPolygon,
      structures,
      courtyards,
      piers,
    });
  });

  // 10. War Rubble Patches inside town when devastation > 10
  const rubblePatches: CityRubblePatch[] = [];
  const rubbleCount = Math.floor(devastation / 5);
  for (let i = 0; i < rubbleCount; i++) {
    const a = prng.next() * Math.PI * 2;
    const r = prng.next() * coreRadius * 0.88;
    rubblePatches.push({
      x: center.x + Math.cos(a) * r,
      y: center.y + Math.sin(a) * r,
      radius: 4 + prng.next() * 7,
      angle: prng.next() * Math.PI,
    });
  }

  // 11. Nearby TTRPG MapPins mapped onto the city quarters
  const nearbyPins = (world.mapPins || []).filter(
    (pin) => Math.hypot(pin.x - burg.x, pin.y - burg.y) <= 45
  );
  const pinFeatures: CityMapPinFeature[] = nearbyPins.slice(0, 6).map((pin, pIdx) => {
    const ang = (pIdx * 1.9 + prng.next() * 0.4) % (Math.PI * 2);
    const rad = coreRadius * (0.28 + (pIdx % 3) * 0.22);
    return {
      id: pin.id,
      label: pin.label,
      category: pin.category,
      notes: pin.notes,
      center: {
        x: center.x + Math.cos(ang) * rad,
        y: center.y + Math.sin(ang) * rad,
      },
    };
  });

  // 12. Sword-Coast-Style Keyed Legend (1..10: Built Slots 1-8 + MapPins up to 10)
  const legend: CityLegendEntry[] = [];
  const builtSlots = slotFeatures
    .filter((sf) => sf.level > 0)
    .sort((a, b) => b.level - a.level || a.slotIndex - b.slotIndex)
    .slice(0, 8);

  builtSlots.forEach((sf) => {
    const num = legend.length + 1;
    sf.legendNumber = num;
    legend.push({
      number: num,
      kind: 'slot',
      id: sf.slotId,
      title: sf.builtName,
      subtitle: `${sf.name} — Lvl ${sf.level}/${sf.maxLevel}`,
      roleOrCategory: sf.role,
      level: sf.level,
      center: sf.center,
      dilapidated: sf.dilapidated,
    });
  });

  for (const pf of pinFeatures) {
    if (legend.length >= 10) break;
    const num = legend.length + 1;
    pf.legendNumber = num;
    legend.push({
      number: num,
      kind: 'pin',
      id: pf.id,
      title: pf.label,
      subtitle: pf.notes ? pf.notes : `${pf.category} Pin`,
      roleOrCategory: pf.category,
      center: pf.center,
    });
  }

  return {
    burgId: burg.id,
    burgName: burg.name,
    settlementType: burg.type,
    population: pop,
    development: dev,
    devastation,
    width,
    height,
    center,
    parishRadius,
    fortLevel,
    citadelLevel,
    marketLevel,
    templeLevel,
    harborLevel,
    industryLevel,
    garrisonLevel,
    hasCoastalWater,
    hasRiver,
    waterAngle,
    waterPolygon,
    riverPolygons,
    moatLoop,
    marketPlaza,
    citadelWardLoop,
    fields,
    treeClusters,
    roads,
    bridges,
    wallSegments,
    bastions,
    gatehouses,
    houses,
    rubblePatches,
    slotFeatures,
    pinFeatures,
    legend,
    scaleFeetPer100Units: Math.round(320 + blueprint.tierNum * 65),
  };
}
