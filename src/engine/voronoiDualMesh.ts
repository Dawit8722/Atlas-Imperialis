import Delaunator from 'delaunator';
import { Point2D } from '../types/world';
import { PRNG } from '../utils/proceduralNoise';

/**
 * Planar Voronoi/Delaunay DualMesh topology for RealmSmith cartography.
 * Represents points (r = regions / Voronoi centers), triangles (t = Delaunay faces),
 * and directed halfedges (s = sides).
 */
export interface VoronoiDualMesh {
  numRegions: number;
  numTriangles: number;
  numSides: number;

  // Region properties
  r_x: Float64Array;
  r_y: Float64Array;
  r_neighbors: number[][]; // r -> array of neighbor regions
  r_polygon: Point2D[][];  // r -> Voronoi polygon vertices
  r_is_boundary: boolean[];

  // Triangle properties (Voronoi vertices)
  t_x: Float64Array;
  t_y: Float64Array;

  // Halfedges / Sides
  halfedges: Int32Array; // s -> opposite side s' (-1 if boundary)
  s_start_r: Int32Array; // side s starts at region r
  s_end_r: Int32Array;   // side s ends at region r
  s_left_t: Int32Array;  // side s has triangle t on left
}

export function createVoronoiDualMesh(
  width: number,
  height: number,
  cols = 52,
  rows = 36,
  prng: PRNG
): VoronoiDualMesh {
  const dx = width / cols;
  const dy = height / rows;

  // 1. Generate jittered grid points with boundary margins
  const coords: number[] = [];
  const r_is_boundary: boolean[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isOdd = r % 2 === 1;
      const offsetX = isOdd ? dx * 0.5 : 0;
      const baseX = c * dx + offsetX + dx * 0.5;
      const baseY = r * dy + dy * 0.5;

      const isEdge = c === 0 || c === cols - 1 || r === 0 || r === rows - 1;
      let jx = 0;
      let jy = 0;

      if (!isEdge) {
        jx = (prng.next() - 0.5) * dx * 0.85;
        jy = (prng.next() - 0.5) * dy * 0.85;
      }

      const x = Math.max(2, Math.min(width - 2, baseX + jx));
      const y = Math.max(2, Math.min(height - 2, baseY + jy));

      coords.push(x, y);
      r_is_boundary.push(isEdge);
    }
  }

  const numRegions = coords.length / 2;
  const r_x = new Float64Array(numRegions);
  const r_y = new Float64Array(numRegions);

  for (let i = 0; i < numRegions; i++) {
    r_x[i] = coords[i * 2];
    r_y[i] = coords[i * 2 + 1];
  }

  // 2. Delaunator Delaunay Triangulation
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

  // 3. Compute Triangle Circumcenters (Voronoi Vertices)
  const t_x = new Float64Array(numTriangles);
  const t_y = new Float64Array(numTriangles);

  for (let t = 0; t < numTriangles; t++) {
    const s0 = 3 * t;
    const r0 = triangles[s0];
    const r1 = triangles[s0 + 1];
    const r2 = triangles[s0 + 2];

    const ax = r_x[r0], ay = r_y[r0];
    const bx = r_x[r1], by = r_y[r1];
    const cx = r_x[r2], cy = r_y[r2];

    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < 1e-6) {
      t_x[t] = (ax + bx + cx) / 3;
      t_y[t] = (ay + by + cy) / 3;
    } else {
      const aSq = ax * ax + ay * ay;
      const bSq = bx * bx + by * by;
      const cSq = cx * cx + cy * cy;
      t_x[t] = (aSq * (by - cy) + bSq * (cy - ay) + cSq * (ay - by)) / d;
      t_y[t] = (aSq * (cx - bx) + bSq * (ax - cx) + cSq * (bx - ax)) / d;
    }
  }

  // 4. Map Regions to Neighbors and Voronoi Polygons
  const r_neighbors: number[][] = new Array(numRegions).fill(null).map(() => []);
  const r_circums: number[][] = new Array(numRegions).fill(null).map(() => []);

  for (let s = 0; s < numSides; s++) {
    const rStart = s_start_r[s];
    const rEnd = s_end_r[s];
    const t = s_left_t[s];

    if (!r_neighbors[rStart].includes(rEnd)) {
      r_neighbors[rStart].push(rEnd);
    }
    if (!r_circums[rStart].includes(t)) {
      r_circums[rStart].push(t);
    }
  }

  // Construct ordered Voronoi polygon vertices for each region
  const r_polygon: Point2D[][] = new Array(numRegions).fill(null).map(() => []);

  for (let r = 0; r < numRegions; r++) {
    const tList = r_circums[r];
    const center = { x: r_x[r], y: r_y[r] };

    // Sort triangle circumcenters angularly around region center
    const sortedTs = [...tList].sort((tA, tB) => {
      const angA = Math.atan2(t_y[tA] - center.y, t_x[tA] - center.x);
      const angB = Math.atan2(t_y[tB] - center.y, t_x[tB] - center.x);
      return angA - angB;
    });

    const rawPts = sortedTs.map((t) => ({
      x: t_x[t],
      y: t_y[t],
    }));

    const clippedPts = clipPolygonToBox(rawPts, width, height);

    const cleanPts: Point2D[] = [];
    for (let i = 0; i < clippedPts.length; i++) {
      const p = clippedPts[i];
      const prev = cleanPts[cleanPts.length - 1];
      if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) > 0.8) {
        cleanPts.push(p);
      }
    }
    if (
      cleanPts.length > 2 &&
      Math.hypot(cleanPts[0].x - cleanPts[cleanPts.length - 1].x, cleanPts[0].y - cleanPts[cleanPts.length - 1].y) < 0.8
    ) {
      cleanPts.pop();
    }
    r_polygon[r] = cleanPts.length >= 3 ? cleanPts : clippedPts;
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

/**
 * Edge-by-edge Sutherland-Hodgman polygon clipping against [0, width] x [0, height].
 * Prevents folded or pinched Voronoi cells when obtuse coastal triangles have circumcenters outside the viewport.
 */
function clipPolygonToBox(poly: Point2D[], width: number, height: number): Point2D[] {
  if (poly.length === 0) return poly;

  type EdgeTest = (p: Point2D) => boolean;
  type EdgeIntersect = (a: Point2D, b: Point2D) => Point2D;

  const edges: Array<{ inside: EdgeTest; intersect: EdgeIntersect }> = [
    {
      inside: (p) => p.x >= 0,
      intersect: (a, b) => {
        const dx = b.x - a.x;
        const t = Math.abs(dx) < 1e-9 ? 0 : (0 - a.x) / dx;
        return { x: 0, y: a.y + t * (b.y - a.y) };
      },
    },
    {
      inside: (p) => p.x <= width,
      intersect: (a, b) => {
        const dx = b.x - a.x;
        const t = Math.abs(dx) < 1e-9 ? 0 : (width - a.x) / dx;
        return { x: width, y: a.y + t * (b.y - a.y) };
      },
    },
    {
      inside: (p) => p.y >= 0,
      intersect: (a, b) => {
        const dy = b.y - a.y;
        const t = Math.abs(dy) < 1e-9 ? 0 : (0 - a.y) / dy;
        return { x: a.x + t * (b.x - a.x), y: 0 };
      },
    },
    {
      inside: (p) => p.y <= height,
      intersect: (a, b) => {
        const dy = b.y - a.y;
        const t = Math.abs(dy) < 1e-9 ? 0 : (height - a.y) / dy;
        return { x: a.x + t * (b.x - a.x), y: height };
      },
    },
  ];

  let output = poly;
  for (const edge of edges) {
    if (output.length === 0) break;
    const input = output;
    output = [];
    let s = input[input.length - 1];
    for (const e of input) {
      const eIn = edge.inside(e);
      const sIn = edge.inside(s);
      if (eIn) {
        if (!sIn) output.push(edge.intersect(s, e));
        output.push(e);
      } else if (sIn) {
        output.push(edge.intersect(s, e));
      }
      s = e;
    }
  }
  return output;
}

