import { WorldState, WorldCell, TradeRoute } from '../types/world';
import { Army, ArmyWaypoint } from '../types/warfare';

class PathMinHeap {
  private items: { node: number; f: number }[] = [];

  push(node: number, f: number): void {
    this.items.push({ node, f });
    let idx = this.items.length - 1;
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (this.items[idx].f >= this.items[parent].f) break;
      const tmp = this.items[idx];
      this.items[idx] = this.items[parent];
      this.items[parent] = tmp;
      idx = parent;
    }
  }

  pop(): { node: number; f: number } | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      let idx = 0;
      const len = this.items.length;
      while (true) {
        let smallest = idx;
        const left = (idx << 1) + 1;
        const right = left + 1;
        if (left < len && this.items[left].f < this.items[smallest].f) smallest = left;
        if (right < len && this.items[right].f < this.items[smallest].f) smallest = right;
        if (smallest === idx) break;
        const tmp = this.items[idx];
        this.items[idx] = this.items[smallest];
        this.items[smallest] = tmp;
        idx = smallest;
      }
    }
    return top;
  }

  get size(): number {
    return this.items.length;
  }
}

interface RoadSnap {
  x: number;
  y: number;
  routeType: TradeRoute['type'];
}

interface CachedSpatialGraph {
  neighbors: number[][];
  roadMap: Map<number, RoadSnap>;
}

const graphCache = new WeakMap<WorldCell[], CachedSpatialGraph>();

function buildSpatialCellIndex(cells: WorldCell[]): {
  buckets: Map<number, number[]>;
  bucketSize: number;
} {
  const bucketSize = 35;
  const buckets = new Map<number, number[]>();
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (!c) continue;
    const bx = Math.floor(c.x / bucketSize);
    const by = Math.floor(c.y / bucketSize);
    const key = bx * 1000 + by;
    let arr = buckets.get(key);
    if (!arr) {
      arr = [];
      buckets.set(key, arr);
    }
    arr.push(i);
  }
  return { buckets, bucketSize };
}

function findNearestCellInBuckets(
  x: number,
  y: number,
  cells: WorldCell[],
  buckets: Map<number, number[]>,
  bucketSize: number,
  landOnly: boolean = false,
  seaLevel: number = 0
): number {
  const bx = Math.floor(x / bucketSize);
  const by = Math.floor(y / bucketSize);
  let bestIdx = -1;
  let bestD2 = Infinity;

  for (let dx = -3; dx <= 3; dx++) {
    for (let dy = -3; dy <= 3; dy++) {
      const list = buckets.get((bx + dx) * 1000 + (by + dy));
      if (!list) continue;
      for (const idx of list) {
        const c = cells[idx];
        if (landOnly && c.elevation < seaLevel) continue;
        const d2 = (c.x - x) ** 2 + (c.y - y) ** 2;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestIdx = idx;
        }
      }
    }
  }

  if (bestIdx !== -1 && bestD2 < Infinity) return bestIdx;

  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (landOnly && c.elevation < seaLevel) continue;
    const d2 = (c.x - x) ** 2 + (c.y - y) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      bestIdx = i;
    }
  }
  return bestIdx !== -1 ? bestIdx : 0;
}

function getWorldRoutingGraph(world: WorldState): CachedSpatialGraph {
  const cells = world.cells || [];
  const cached = graphCache.get(cells);
  if (cached) return cached;

  const n = cells.length;
  const { buckets, bucketSize } = buildSpatialCellIndex(cells);
  const neighbors: number[][] = Array.from({ length: n }, () => []);
  const seaLevel = world.settings?.terrainSim?.seaLevel ?? 0;

  const meshNeighbors: number[][] | undefined = world.mesh?.r_neighbors;
  if (meshNeighbors && meshNeighbors.length === n) {
    for (let i = 0; i < n; i++) {
      neighbors[i] = meshNeighbors[i] || [];
    }
  } else {
    // Fallback spatial k-NN neighbor graph
    for (let i = 0; i < n; i++) {
      const c = cells[i];
      const bx = Math.floor(c.x / bucketSize);
      const by = Math.floor(c.y / bucketSize);
      const cands: { idx: number; d2: number }[] = [];
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const list = buckets.get((bx + dx) * 1000 + (by + dy));
          if (!list) continue;
          for (const j of list) {
            if (j === i) continue;
            const d2 = (cells[j].x - c.x) ** 2 + (cells[j].y - c.y) ** 2;
            cands.push({ idx: j, d2 });
          }
        }
      }
      cands.sort((a, b) => a.d2 - b.d2);
      neighbors[i] = cands.slice(0, 6).map((x) => x.idx);
    }
  }

  // Index overland roads & mountain passes onto nearest LAND Voronoi cells only
  const roadMap = new Map<number, RoadSnap>();
  const routes = world.tradeNetwork?.routes || [];
  const routePriority = (t: TradeRoute['type']): number =>
    t === 'Imperial Highway' ? 4 : t === 'Merchant Road' ? 3 : t === 'Mountain Pass' ? 2 : 1;

  for (const route of routes) {
    if (route.isMaritime || route.type === 'Maritime Sea Lane') continue;
    const pts = route.pathPoints || [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const samples =
        i < pts.length - 1
          ? [
              p,
              { x: (p.x + pts[i + 1].x) * 0.5, y: (p.y + pts[i + 1].y) * 0.5 },
            ]
          : [p];
      for (const s of samples) {
        const cellIdx = findNearestCellInBuckets(s.x, s.y, cells, buckets, bucketSize, true, seaLevel);
        const c = cells[cellIdx];
        if (!c || c.elevation < seaLevel) continue;
        const existing = roadMap.get(cellIdx);
        if (!existing || routePriority(route.type) >= routePriority(existing.routeType)) {
          roadMap.set(cellIdx, { x: s.x, y: s.y, routeType: route.type });
        }
      }
    }
  }

  const built = { neighbors, roadMap };
  graphCache.set(cells, built);
  return built;
}

export function getCellTerrainCostAndLabel(
  cell: WorldCell,
  seaLevel: number,
  roadSnap: RoadSnap | undefined,
  season?: WorldState['currentSeason']
): { multiplier: number; label: string; isRoad: boolean } {
  // Water cells are completely impassable to ground paths
  if (cell.elevation < seaLevel) {
    return { multiplier: Infinity, label: 'Sea', isRoad: false };
  }

  if (roadSnap) {
    const baseRoad =
      roadSnap.routeType === 'Imperial Highway'
        ? 0.48
        : roadSnap.routeType === 'Mountain Pass'
        ? 0.78
        : 0.56;
    const winterRoad = season === 'Winter' ? 1.12 : 1.0;
    return {
      multiplier: baseRoad * winterRoad,
      label: roadSnap.routeType,
      isRoad: true,
    };
  }

  let mult = 1.0;
  let label = 'Plains';

  if (cell.reliefType === 'mountain' || cell.elevation >= 0.65) {
    mult = 3.2;
    label = 'Mountains';
  } else if (cell.biome === 'Misty Wetland' || cell.reliefType === 'swamp') {
    mult = 2.25;
    label = 'Wetland';
  } else if (cell.reliefType === 'hill' || cell.elevation >= 0.48) {
    mult = 1.78;
    label = 'Hills';
  } else if (
    cell.isManualForest ||
    cell.reliefType === 'forest' ||
    cell.biome === 'Temperate Forest' ||
    cell.biome === 'Boreal Taiga' ||
    cell.biome === 'Tropical Rainforest'
  ) {
    mult = 1.68;
    label = 'Forest';
  } else if (cell.biome === 'Scorched Desert' || cell.biome === 'Glacial Tundra') {
    mult = 1.55;
    label = cell.biome === 'Scorched Desert' ? 'Desert' : 'Tundra';
  }

  if (cell.isRiver) {
    mult += 0.55;
    if (label === 'Plains') label = 'River Ford';
  }

  if (season === 'Winter') {
    mult *= 1.24;
  }

  return { multiplier: mult, label, isRoad: false };
}

function runCellAStar(
  startIdx: number,
  goalIdx: number,
  cells: WorldCell[],
  neighbors: number[][],
  roadMap: Map<number, RoadSnap>,
  buckets: Map<number, number[]>,
  bucketSize: number,
  seaLevel: number,
  season: WorldState['currentSeason'],
  mode: 'overland' | 'maritime'
): number[] | null {
  if (startIdx === goalIdx) return [startIdx];
  const n = cells.length;
  const startCell = cells[startIdx];
  const goalCell = cells[goalIdx];
  if (!startCell || !goalCell) return null;
  if (mode === 'overland' && (startCell.elevation < seaLevel || goalCell.elevation < seaLevel)) {
    return null;
  }
  if (mode === 'maritime' && (startCell.elevation >= seaLevel || goalCell.elevation >= seaLevel)) {
    return null;
  }

  const gScore = new Float32Array(n);
  gScore.fill(Infinity);
  const cameFrom = new Int32Array(n);
  cameFrom.fill(-1);
  const closed = new Uint8Array(n);

  gScore[startIdx] = 0;
  const heap = new PathMinHeap();
  heap.push(startIdx, Math.hypot(goalCell.x - startCell.x, goalCell.y - startCell.y) * 0.45);

  let found = false;
  let iterations = 0;
  const maxIter = Math.max(n * 2, 24000);

  while (heap.size > 0 && iterations++ < maxIter) {
    const cur = heap.pop()!;
    const u = cur.node;
    if (u === goalIdx) {
      found = true;
      break;
    }
    if (closed[u]) continue;
    closed[u] = 1;

    const uCell = cells[u];
    const uCostInfo =
      mode === 'overland'
        ? getCellTerrainCostAndLabel(uCell, seaLevel, roadMap.get(u), season)
        : { multiplier: 1.45, label: 'Naval Crossing', isRoad: false };
    if (!isFinite(uCostInfo.multiplier)) continue;

    const nbrs = neighbors[u];
    for (let k = 0; k < nbrs.length; k++) {
      const v = nbrs[k];
      if (closed[v]) continue;
      const vCell = cells[v];
      if (!vCell) continue;

      if (mode === 'overland') {
        if (vCell.elevation < seaLevel) continue;
      } else {
        if (vCell.elevation >= seaLevel) continue;
      }

      const stepDist = Math.hypot(vCell.x - uCell.x, vCell.y - uCell.y) || 1;
      if (mode === 'overland' && stepDist > 26) {
        const midIdx = findNearestCellInBuckets(
          (uCell.x + vCell.x) * 0.5,
          (uCell.y + vCell.y) * 0.5,
          cells,
          buckets,
          bucketSize,
          false,
          seaLevel
        );
        if (cells[midIdx] && cells[midIdx].elevation < seaLevel) continue;
      }

      let edgeMult: number;
      if (mode === 'overland') {
        const vCostInfo = getCellTerrainCostAndLabel(vCell, seaLevel, roadMap.get(v), season);
        if (!isFinite(vCostInfo.multiplier)) continue;
        edgeMult = uCostInfo.isRoad && vCostInfo.isRoad
          ? Math.min(uCostInfo.multiplier, vCostInfo.multiplier)
          : (uCostInfo.multiplier + vCostInfo.multiplier) * 0.5;
      } else {
        // Maritime prefers open ocean slightly over hugging land shoals
        const nearShore = neighbors[v].some((nb) => cells[nb] && cells[nb].elevation >= seaLevel);
        edgeMult = nearShore ? 1.65 : 1.35;
      }

      const tentativeG = gScore[u] + stepDist * edgeMult;
      if (tentativeG < gScore[v]) {
        cameFrom[v] = u;
        gScore[v] = tentativeG;
        const h = Math.hypot(goalCell.x - vCell.x, goalCell.y - vCell.y) * 0.45;
        heap.push(v, tentativeG + h);
      }
    }
  }

  if (!found) return null;

  const chain: number[] = [];
  let trace = goalIdx;
  while (trace !== -1) {
    chain.push(trace);
    if (trace === startIdx) break;
    trace = cameFrom[trace];
  }
  chain.reverse();
  return chain;
}

function collectLandComponentCoast(
  seedLandIdx: number,
  cells: WorldCell[],
  neighbors: number[][],
  seaLevel: number
): { visited: Uint8Array; coastWaterPairs: Array<{ land: number; water: number }> } {
  const n = cells.length;
  const visited = new Uint8Array(n);
  const coastWaterPairs: Array<{ land: number; water: number }> = [];
  if (cells[seedLandIdx]?.elevation < seaLevel) return { visited, coastWaterPairs };

  const queue: number[] = [seedLandIdx];
  visited[seedLandIdx] = 1;
  let head = 0;

  while (head < queue.length) {
    const u = queue[head++];
    let waterNbr = -1;
    for (const v of neighbors[u]) {
      const vc = cells[v];
      if (!vc) continue;
      if (vc.elevation < seaLevel) {
        if (waterNbr === -1) waterNbr = v;
      } else if (!visited[v]) {
        visited[v] = 1;
        queue.push(v);
      }
    }
    if (waterNbr !== -1) {
      coastWaterPairs.push({ land: u, water: waterNbr });
    }
  }

  return { visited, coastWaterPairs };
}

/**
 * Computes a strictly land-preserving A* march path over world cells.
 * Armies prefer roads/highways (fast) and NEVER march across water cells.
 * Only if no overland path exists at all (separated islands/continents) does
 * the army march overland to the nearest coastal embarkation point, sail over
 * water cells as a Naval Crossing, and disembark onto the target landmass.
 */
export function computeArmyMarchPath(
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
  world: WorldState
): {
  waypoints: ArmyWaypoint[];
  totalMarchCost: number;
  speed: number;
  landReachable?: boolean;
  embarkationPortId?: string;
  embarkationPortName?: string;
  destinationPortId?: string;
  destinationPortName?: string;
  seaDistanceKm?: number;
} {
  const cells = world.cells || [];
  const straightDist = Math.hypot(targetX - startX, targetY - startY) || 80;

  if (cells.length === 0) {
    const waypoints: ArmyWaypoint[] = [
      { x: startX, y: startY, cumCost: 0, isRoad: false, terrainLabel: 'Plains' },
      { x: targetX, y: targetY, cumCost: straightDist, isRoad: false, terrainLabel: 'Plains' },
    ];
    return {
      waypoints,
      totalMarchCost: straightDist,
      speed: Math.max(0.025, Math.min(0.14, 180 / Math.max(80, straightDist))),
      landReachable: true,
    };
  }

  const { neighbors, roadMap } = getWorldRoutingGraph(world);
  const { buckets, bucketSize } = buildSpatialCellIndex(cells);
  const seaLevel = world.settings?.terrainSim?.seaLevel ?? 0;

  const startIdx = findNearestCellInBuckets(startX, startY, cells, buckets, bucketSize, true, seaLevel);
  const goalIdx = findNearestCellInBuckets(targetX, targetY, cells, buckets, bucketSize, true, seaLevel);

  if (startIdx === goalIdx) {
    const cInfo = getCellTerrainCostAndLabel(cells[startIdx], seaLevel, roadMap.get(startIdx), world.currentSeason);
    const mult = isFinite(cInfo.multiplier) ? cInfo.multiplier : 1.0;
    const totalCost = Math.max(20, straightDist * mult);
    return {
      waypoints: [
        { x: startX, y: startY, cumCost: 0, isRoad: cInfo.isRoad, terrainLabel: cInfo.label },
        { x: targetX, y: targetY, cumCost: totalCost, isRoad: cInfo.isRoad, terrainLabel: cInfo.label },
      ],
      totalMarchCost: totalCost,
      speed: Math.max(0.03, Math.min(0.18, 200 / totalCost)),
      landReachable: true,
    };
  }

  // 1. Primary strict OVERLAND A* (water cells strictly excluded)
  const landChain = runCellAStar(
    startIdx,
    goalIdx,
    cells,
    neighbors,
    roadMap,
    buckets,
    bucketSize,
    seaLevel,
    world.currentSeason,
    'overland'
  );

  if (landChain && landChain.length >= 1) {
    const waypoints: ArmyWaypoint[] = [
      { x: startX, y: startY, cumCost: 0, isRoad: roadMap.has(startIdx), terrainLabel: 'Muster' },
    ];

    let cumCost = 0;
    let prevX = startX;
    let prevY = startY;

    for (let i = 0; i < landChain.length; i++) {
      const cIdx = landChain[i];
      const c = cells[cIdx];
      const rSnap = roadMap.get(cIdx);
      const info = getCellTerrainCostAndLabel(c, seaLevel, rSnap, world.currentSeason);
      const mult = isFinite(info.multiplier) ? info.multiplier : 1.0;
      const wx = rSnap && Math.hypot(rSnap.x - c.x, rSnap.y - c.y) <= 22 ? rSnap.x : c.x;
      const wy = rSnap && Math.hypot(rSnap.x - c.x, rSnap.y - c.y) <= 22 ? rSnap.y : c.y;
      const segDist = Math.hypot(wx - prevX, wy - prevY);
      if (segDist < 3 && i < landChain.length - 1) continue;
      cumCost += segDist * mult;
      waypoints.push({
        x: wx,
        y: wy,
        cumCost,
        isRoad: info.isRoad,
        terrainLabel: info.label,
      });
      prevX = wx;
      prevY = wy;
    }

    const endSeg = Math.hypot(targetX - prevX, targetY - prevY);
    const goalInfo = getCellTerrainCostAndLabel(cells[goalIdx], seaLevel, roadMap.get(goalIdx), world.currentSeason);
    const goalMult = isFinite(goalInfo.multiplier) ? goalInfo.multiplier : 1.0;
    cumCost += Math.max(1, endSeg) * goalMult;
    waypoints.push({
      x: targetX,
      y: targetY,
      cumCost,
      isRoad: goalInfo.isRoad,
      terrainLabel: goalInfo.label,
    });

    const totalMarchCost = Math.max(25, cumCost);
    // Tuned visible march pace so armies visibly travel across the map over multiple steps
    const speed = Math.max(0.018, Math.min(0.095, 130 / totalMarchCost));
    return { waypoints, totalMarchCost, speed, landReachable: true };
  }

  // 2. Disconnected landmass: Route Overland -> Actual Port Settlement -> Maritime Sea Crossing -> Target Port -> Overland
  const startComp = collectLandComponentCoast(startIdx, cells, neighbors, seaLevel);
  const goalComp = collectLandComponentCoast(goalIdx, cells, neighbors, seaLevel);

  // Identify real Port Settlements on each landmass (Fishing Port, Trade Port, or coastal Capital/Metropolis)
  const portBurgs = (world.burgs || []).filter((b) => {
    if (b.type === 'Trade Port' || b.type === 'Fishing Port' || b.tier === 'port') return true;
    const bCellIdx = findNearestCellInBuckets(b.x, b.y, cells, buckets, bucketSize, true, seaLevel);
    return Boolean(cells[bCellIdx]?.isCoast);
  });

  const findPortCoastPairs = (comp: { visited: Uint8Array; coastWaterPairs: Array<{ land: number; water: number }> }) => {
    const pairs: Array<{ land: number; water: number; portId?: string; portName?: string }> = [];
    for (const pb of portBurgs) {
      const landIdx = findNearestCellInBuckets(pb.x, pb.y, cells, buckets, bucketSize, true, seaLevel);
      if (!comp.visited[landIdx]) continue;
      // Find nearest coastWaterPair to this port
      let nearestPair: { land: number; water: number } | null = null;
      let bestD2 = Infinity;
      for (const cp of comp.coastWaterPairs) {
        const d2 = (cells[cp.land].x - pb.x) ** 2 + (cells[cp.land].y - pb.y) ** 2;
        if (d2 < bestD2) {
          bestD2 = d2;
          nearestPair = cp;
        }
      }
      if (nearestPair) {
        pairs.push({ land: nearestPair.land, water: nearestPair.water, portId: pb.id, portName: pb.name });
      }
    }
    return pairs;
  };

  const startPorts = findPortCoastPairs(startComp);
  const goalPorts = findPortCoastPairs(goalComp);

  const startCandidates: Array<{ land: number; water: number; portId?: string; portName?: string }> =
    startPorts.length > 0 ? startPorts : startComp.coastWaterPairs;
  const goalCandidates: Array<{ land: number; water: number; portId?: string; portName?: string }> =
    goalPorts.length > 0 ? goalPorts : goalComp.coastWaterPairs;

  let bestPair: {
    embarkLand: number;
    embarkWater: number;
    disembarkWater: number;
    disembarkLand: number;
    embarkPortId?: string;
    embarkPortName?: string;
    disembarkPortId?: string;
    disembarkPortName?: string;
  } | null = null;
  let bestScore = Infinity;

  if (startCandidates.length > 0 && goalCandidates.length > 0) {
    const sStep = Math.max(1, Math.floor(startCandidates.length / 40));
    const gStep = Math.max(1, Math.floor(goalCandidates.length / 40));
    for (let i = 0; i < startCandidates.length; i += sStep) {
      const sp = startCandidates[i];
      const sc = cells[sp.land];
      const dToStart = Math.hypot(sc.x - startX, sc.y - startY) * 0.45;
      for (let j = 0; j < goalCandidates.length; j += gStep) {
        const gp = goalCandidates[j];
        const gc = cells[gp.land];
        const seaDist = Math.hypot(gc.x - sc.x, gc.y - sc.y);
        const dToGoal = Math.hypot(gc.x - targetX, gc.y - targetY) * 0.45;
        const score = dToStart + seaDist * 1.35 + dToGoal;
        if (score < bestScore) {
          bestScore = score;
          bestPair = {
            embarkLand: sp.land,
            embarkWater: sp.water,
            disembarkWater: gp.water,
            disembarkLand: gp.land,
            embarkPortId: sp.portId,
            embarkPortName: sp.portName,
            disembarkPortId: gp.portId,
            disembarkPortName: gp.portName,
          };
        }
      }
    }
  }

  if (bestPair) {
    const leg1 =
      runCellAStar(startIdx, bestPair.embarkLand, cells, neighbors, roadMap, buckets, bucketSize, seaLevel, world.currentSeason, 'overland') ||
      [startIdx, bestPair.embarkLand];
    const seaLeg =
      runCellAStar(bestPair.embarkWater, bestPair.disembarkWater, cells, neighbors, roadMap, buckets, bucketSize, seaLevel, world.currentSeason, 'maritime') ||
      [];
    const leg3 =
      runCellAStar(bestPair.disembarkLand, goalIdx, cells, neighbors, roadMap, buckets, bucketSize, seaLevel, world.currentSeason, 'overland') ||
      [bestPair.disembarkLand, goalIdx];

    const waypoints: ArmyWaypoint[] = [
      { x: startX, y: startY, cumCost: 0, isRoad: roadMap.has(startIdx), isSea: false, terrainLabel: 'Muster' },
    ];
    let cumCost = 0;
    let prevX = startX;
    let prevY = startY;
    let seaDistancePx = 0;

    const pushChain = (chain: number[], isNaval: boolean, portMeta?: { id?: string; name?: string }) => {
      for (let i = 0; i < chain.length; i++) {
        const cIdx = chain[i];
        const c = cells[cIdx];
        if (!c) continue;
        const rSnap = isNaval ? undefined : roadMap.get(cIdx);
        const info = isNaval
          ? { multiplier: 1.35, label: 'Naval Voyage', isRoad: false }
          : getCellTerrainCostAndLabel(c, seaLevel, rSnap, world.currentSeason);
        const mult = isFinite(info.multiplier) ? info.multiplier : 1.35;
        const wx = rSnap && Math.hypot(rSnap.x - c.x, rSnap.y - c.y) <= 22 ? rSnap.x : c.x;
        const wy = rSnap && Math.hypot(rSnap.x - c.x, rSnap.y - c.y) <= 22 ? rSnap.y : c.y;
        const segDist = Math.hypot(wx - prevX, wy - prevY);
        if (segDist < 3 && i < chain.length - 1) continue;
        if (isNaval) seaDistancePx += segDist;
        cumCost += Math.max(1, segDist) * mult;
        waypoints.push({
          x: wx,
          y: wy,
          cumCost,
          isRoad: info.isRoad,
          isSea: isNaval,
          portBurgId: i === 0 && portMeta?.id ? portMeta.id : undefined,
          portBurgName: i === 0 && portMeta?.name ? portMeta.name : undefined,
          terrainLabel: info.label,
        });
        prevX = wx;
        prevY = wy;
      }
    };

    pushChain(leg1, false);
    if (seaLeg.length > 0) {
      pushChain(seaLeg, true, { id: bestPair.embarkPortId, name: bestPair.embarkPortName });
    }
    pushChain(leg3, false, { id: bestPair.disembarkPortId, name: bestPair.disembarkPortName });

    const endSeg = Math.hypot(targetX - prevX, targetY - prevY);
    const goalInfo = getCellTerrainCostAndLabel(cells[goalIdx], seaLevel, roadMap.get(goalIdx), world.currentSeason);
    const goalMult = isFinite(goalInfo.multiplier) ? goalInfo.multiplier : 1.0;
    cumCost += Math.max(1, endSeg) * goalMult;
    waypoints.push({
      x: targetX,
      y: targetY,
      cumCost,
      isRoad: goalInfo.isRoad,
      isSea: false,
      terrainLabel: goalInfo.label,
    });

    const totalMarchCost = Math.max(30, cumCost);
    const speed = Math.max(0.016, Math.min(0.085, 125 / totalMarchCost));
    return {
      waypoints,
      totalMarchCost,
      speed,
      landReachable: false,
      embarkationPortId: bestPair.embarkPortId,
      embarkationPortName: bestPair.embarkPortName,
      destinationPortId: bestPair.disembarkPortId,
      destinationPortName: bestPair.disembarkPortName,
      seaDistanceKm: Math.round(seaDistancePx * 1.4),
    };
  }

  // Last-resort fallback
  const fallbackCost = Math.max(35, straightDist * 1.65);
  return {
    waypoints: [
      { x: startX, y: startY, cumCost: 0, isRoad: false, isSea: false, terrainLabel: 'Plains' },
      { x: targetX, y: targetY, cumCost: fallbackCost, isRoad: false, isSea: true, terrainLabel: 'Naval Voyage' },
    ],
    totalMarchCost: fallbackCost,
    speed: Math.max(0.016, Math.min(0.08, 120 / fallbackCost)),
    landReachable: false,
    seaDistanceKm: Math.round(straightDist * 1.4),
  };
}

/**
 * Calculates upfront ship charter fees and ongoing monthly naval transport upkeep
 * based on embarked army size, sea crossing distance, and embarkation port infrastructure.
 */
export function calculateNavalCharterCost(
  strength: number,
  seaDistanceKm: number,
  embarkPortBurg?: { id?: string; buildingSlots?: Record<string, { level: number }> },
  world?: WorldState
): { shipsRequired: number; charterGold: number; monthlySeaUpkeep: number } {
  const men = Math.max(50, strength || 100);
  const shipsRequired = Math.max(1, Math.ceil(men / 250));
  const ratePer100 = seaDistanceKm > 600 ? 10 : seaDistanceKm > 250 ? 7 : 4;
  let discount = 1.0;
  if (embarkPortBurg?.buildingSlots) {
    const hasShipyard =
      (embarkPortBurg.buildingSlots.tp_shipyard?.level || 0) >= 1 ||
      (embarkPortBurg.buildingSlots.fp_boatyard?.level || 0) >= 1;
    const hasGrandHarbor = (embarkPortBurg.buildingSlots.tp_harbor?.level || 0) >= 3;
    if (hasGrandHarbor) discount = 0.55;
    else if (hasShipyard) discount = 0.65;
  }

  if (embarkPortBurg?.id && world?.economy?.burgMarkets?.[embarkPortBurg.id]) {
    const portMarkets = world.economy.burgMarkets[embarkPortBurg.id].markets;
    const navalGoods = ['Timber', 'Tar & Pitch', 'Rope & Cordage', 'Distilled Spirits'] as const;
    let totalRatio = 0;
    for (const good of navalGoods) {
      const m = portMarkets[good];
      const stock = m?.stockpile || 0;
      const need = Math.max(1, (m?.monthlyConsumption || 3) * 2);
      totalRatio += Math.min(2.0, stock / need);
    }
    const avgRatio = totalRatio / navalGoods.length;
    // Abundant naval stores cut charter cost up to -30%; scarce stores add up to +35%
    const marketMod = avgRatio >= 1.0 ? Math.max(0.70, 1.0 - (avgRatio - 1.0) * 0.30) : Math.min(1.35, 1.0 + (1.0 - avgRatio) * 0.35);
    discount *= marketMod;
  }

  const charterGold = Math.max(5, Math.round((men / 100) * ratePer100 * discount));
  const monthlySeaUpkeep = Math.round((men / 100) * 3.5 * 10) / 10;
  return { shipsRequired, charterGold, monthlySeaUpkeep };
}

/**
 * Interpolates army world position along its terrain/road/sea waypoints.
 * Supports optional overrideProgress for smooth sub-tick visual animation.
 */
export function getArmyPositionAtProgress(
  army: Army,
  overrideProgress?: number
): {
  x: number;
  y: number;
  isRoad: boolean;
  isSea: boolean;
  terrainLabel: string;
} {
  const p = Math.max(0, Math.min(1, overrideProgress ?? army.progress ?? 0));
  const wps = army.waypoints;
  if (!wps || wps.length < 2) {
    return {
      x: army.startX + (army.targetX - army.startX) * p,
      y: army.startY + (army.targetY - army.startY) * p,
      isRoad: false,
      isSea: Boolean(army.isEmbarked),
      terrainLabel: army.isEmbarked ? 'Naval Voyage' : 'Plains',
    };
  }

  const total = wps[wps.length - 1].cumCost || 1;
  const targetCost = p * total;

  // Binary search segment containing targetCost
  let lo = 0;
  let hi = wps.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (wps[mid].cumCost <= targetCost) lo = mid;
    else hi = mid - 1;
  }

  const a = wps[lo];
  const b = wps[lo + 1];
  const span = Math.max(0.0001, b.cumCost - a.cumCost);
  const segT = Math.max(0, Math.min(1, (targetCost - a.cumCost) / span));
  const isSea = Boolean(a.isSea || b.isSea || b.terrainLabel === 'Naval Voyage' || b.terrainLabel === 'Naval Crossing');

  return {
    x: a.x + (b.x - a.x) * segT,
    y: a.y + (b.y - a.y) * segT,
    isRoad: Boolean(a.isRoad && b.isRoad),
    isSea,
    terrainLabel: b.terrainLabel || a.terrainLabel || 'Plains',
  };
}

/**
 * Reverses an army's road/terrain/sea waypoints for a retreating or homebound march.
 */
export function reverseArmyWaypoints(army: Army): void {
  const ox = army.startX;
  const oy = army.startY;
  army.startX = army.targetX;
  army.startY = army.targetY;
  army.targetX = ox;
  army.targetY = oy;

  if (!army.waypoints || army.waypoints.length < 2) return;
  const total = army.waypoints[army.waypoints.length - 1].cumCost || 1;
  const reversed: ArmyWaypoint[] = [];
  for (let i = army.waypoints.length - 1; i >= 0; i--) {
    const wp = army.waypoints[i];
    reversed.push({
      x: wp.x,
      y: wp.y,
      cumCost: Math.max(0, total - wp.cumCost),
      isRoad: wp.isRoad,
      isSea: wp.isSea,
      portBurgId: wp.portBurgId,
      portBurgName: wp.portBurgName,
      terrainLabel: wp.terrainLabel,
    });
  }
  army.waypoints = reversed;
}
