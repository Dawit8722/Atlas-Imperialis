import {
  WorldState,
  WorldSettings,
  WorldCell,
  Burg,
  County,
  Realm,
  Character,
  CourtRole,
  TitleTier,
  Culture,
  Religion,
  HistoricalEvent,
  LoreEntity,
  SagaStory,
  Point2D,
  River,
  BiomeType,
  PaintBrushMode,
  BrushFalloff,
  ContinentSummary,
  CoatOfArmsData,
  CustomRiver,
  MapPin,
  BorderKind,
} from '../types/world';
import { PRNG, Noise2D } from '../utils/proceduralNoise';
import { pickContextualDeathCause } from './deathAndJusticeEngine';
import {
  generateRealmHeraldry,
  generateNobleArms,
  generateUniqueHouseHeraldry,
  cloneCoatOfArmsData,
  syncWorldBanners,
} from '../utils/heraldryBridge';
import { createVoronoiDualMesh, VoronoiDualMesh } from './voronoiDualMesh';
import { runTerrainSimulation, TerrainSimulationResult, ReliefType } from './terrainSimulationEngine';
import { generateSagaChapter } from './storyGenerator';
import { generateTradeNetwork, evaluateSettlementSite } from './tradeRouteEngine';
import { WorldNameRegistry } from './namingEngine';
import { globalModRegistry } from './modSystem/registryManager';
import { canonicalizeTradeGood } from './economyEngine';
import { deriveRealisticBurgExports, deriveRealisticBurgImports } from './geographyExportsEngine';
import {
  CULTURE_PRESETS,
  RELIGION_PRESETS,
  MEDIEVAL_GOVERNMENT_TYPES,
  MEDIEVAL_SOCIETY_TYPES,
  TerrainAffinity,
  getGovernmentProfile,
  getSocietyProfile,
  synthesizeProceduralCultures,
  synthesizeProceduralReligions,
  BURG_PREFIXES,
  BURG_SUFFIXES,
  TRADE_GOODS,
  SCHEME_TYPES,
  CHARACTER_TRAITS,
  CHARACTER_SECRETS,
  HOOK_REASONS,
  deriveAIArchetype,
  calculateCharacterOpinion,
  computeCharacterStats,
  getRealmSovereignRank,
  stripRealmPrefix,
  getLowerTitleTier,
  getSovereignTerritoryProfile,
  getHeirStyleForRealm,
  getSubordinateVassalStyle,
} from './fantasyTables';

type CulturePresetItem = (typeof CULTURE_PRESETS)[number];
type ReligionPresetItem = (typeof RELIGION_PRESETS)[number];

function getActiveCulturePresets(): CulturePresetItem[] {
  const reg = globalModRegistry.getRegistry<CulturePresetItem & { id: string }>('cultures');
  return reg.size() > 0 ? reg.getAll() : CULTURE_PRESETS;
}

function getActiveReligionPresets(): ReligionPresetItem[] {
  const reg = globalModRegistry.getRegistry<ReligionPresetItem & { id: string }>('religions');
  return reg.size() > 0 ? reg.getAll() : RELIGION_PRESETS;
}

function getModdedCustomCultures(): CulturePresetItem[] {
  const vanillaNames = new Set(CULTURE_PRESETS.map((c) => c.name));
  return getActiveCulturePresets().filter((c) => !vanillaNames.has(c.name));
}

function getModdedCustomReligions(): ReligionPresetItem[] {
  const vanillaNames = new Set(RELIGION_PRESETS.map((r) => r.name));
  return getActiveReligionPresets().filter((r) => !vanillaNames.has(r.name));
}

function detectTerrainAffinities(cells: WorldCell[], seaLevel: number): TerrainAffinity[] {
  let coastal = 0;
  let mountain = 0;
  let forest = 0;
  let arid = 0;
  let steppe = 0;
  let temperate = 0;
  for (const c of cells) {
    if (c.elevation < seaLevel) continue;
    if (c.isCoast) coastal++;
    if (c.elevation >= 0.54) mountain++;
    if (c.biome.includes('Forest') || c.biome.includes('Taiga')) forest++;
    else if (c.biome.includes('Desert') || c.biome.includes('Savanna')) arid++;
    else if (c.biome.includes('Steppe')) steppe++;
    else temperate++;
  }
  const scored: Array<{ tag: TerrainAffinity; count: number }> = [
    { tag: 'temperate', count: temperate },
    { tag: 'coastal', count: coastal * 1.4 },
    { tag: 'forest', count: forest },
    { tag: 'mountain', count: mountain * 1.6 },
    { tag: 'arid', count: arid * 1.4 },
    { tag: 'steppe', count: steppe * 1.4 },
  ];
  scored.sort((a, b) => b.count - a.count);
  return scored.filter((s) => s.count > 0).slice(0, 3).map((s) => s.tag);
}

function inferCellAffinity(cell: WorldCell): TerrainAffinity {
  if (cell.elevation >= 0.56) return 'mountain';
  if (cell.biome.includes('Desert') || cell.biome.includes('Savanna')) return 'arid';
  if (cell.biome.includes('Steppe')) return 'steppe';
  if (cell.biome.includes('Forest') || cell.biome.includes('Taiga')) return 'forest';
  if (cell.isCoast) return 'coastal';
  return 'temperate';
}
import {
  ensureV17WorldInitialized,
  recalculateAllGravitas,
  recalculateCharacterRelationships,
} from './v17GrandStrategyEngine';
import {
  recalculateFeudalDemesne,
  calculateDemesneLimit,
  calculateBurgEconomicLedger,
  reconcileFeudalHierarchy,
} from './feudalEngine';
export { reconcileFeudalHierarchy };
import { OceanCurrentsEngine } from './oceanCurrentsEngine';
import { CarryingCapacityEngine } from './carryingCapacityEngine';
import { syncCharacterTraits } from './v17TraitDB';

// Global dual mesh and paint buffer caching for high performance
let cachedMesh: VoronoiDualMesh | null = null;
let cachedPaintBuffer: Float32Array | null = null;
let cachedCustomBaseHeights: Float32Array | null = null;
let cachedBiomeOverrides: (BiomeType | null)[] | null = null;
let cachedReliefOverrides: (ReliefType | 'clear' | 'clear_all' | null)[] | null = null;
let cachedTempOverrides: Float32Array | null = null;
let cachedManualForest: Uint8Array | null = null;
let cachedRealmOverrides: (string | null | undefined)[] | null = null;
let cachedCountyOverrides: (string | null | undefined)[] | null = null;
let cachedNoise: Noise2D | null = null;

export interface SparseBrushDiffs {
  paintDiffs: Array<[number, number]>;
  biomeDiffs: Array<[number, BiomeType]>;
  reliefDiffs: Array<[number, ReliefType | 'clear' | 'clear_all']>;
  tempDiffs: Array<[number, number]>;
  manualForestIndices: number[];
  realmDiffs: Array<[number, string | null]>;
  countyDiffs: Array<[number, string | null]>;
}

export function getCachedPaintBuffer(): Float32Array {
  if (!cachedPaintBuffer && cachedMesh) {
    cachedPaintBuffer = new Float32Array(cachedMesh.numRegions);
  }
  return cachedPaintBuffer || new Float32Array(2000);
}

export function resetPaintBuffer() {
  if (cachedPaintBuffer) cachedPaintBuffer.fill(0);
  if (cachedBiomeOverrides) cachedBiomeOverrides.fill(null);
  if (cachedReliefOverrides) cachedReliefOverrides.fill(null);
  if (cachedTempOverrides) cachedTempOverrides.fill(NaN);
  if (cachedManualForest) cachedManualForest.fill(0);
  if (cachedRealmOverrides) cachedRealmOverrides.fill(undefined);
  if (cachedCountyOverrides) cachedCountyOverrides.fill(undefined);
}

function initOverrideBuffers(numRegions: number) {
  cachedPaintBuffer = new Float32Array(numRegions);
  cachedBiomeOverrides = new Array<BiomeType | null>(numRegions).fill(null);
  cachedReliefOverrides = new Array<ReliefType | 'clear' | 'clear_all' | null>(numRegions).fill(null);
  cachedTempOverrides = new Float32Array(numRegions).fill(NaN);
  cachedManualForest = new Uint8Array(numRegions);
  cachedRealmOverrides = new Array<string | null | undefined>(numRegions).fill(undefined);
  cachedCountyOverrides = new Array<string | null | undefined>(numRegions).fill(undefined);
}

export function exportBrushDiffs(): SparseBrushDiffs {
  const n = cachedMesh?.numRegions ?? cachedPaintBuffer?.length ?? 0;
  const paintDiffs: Array<[number, number]> = [];
  const biomeDiffs: Array<[number, BiomeType]> = [];
  const reliefDiffs: Array<[number, ReliefType | 'clear' | 'clear_all']> = [];
  const tempDiffs: Array<[number, number]> = [];
  const manualForestIndices: number[] = [];
  const realmDiffs: Array<[number, string | null]> = [];
  const countyDiffs: Array<[number, string | null]> = [];

  for (let i = 0; i < n; i++) {
    const pv = cachedPaintBuffer?.[i] ?? 0;
    if (Math.abs(pv) > 1e-5) paintDiffs.push([i, Number(pv.toFixed(5))]);
    const bv = cachedBiomeOverrides?.[i];
    if (bv !== null && bv !== undefined) biomeDiffs.push([i, bv]);
    const rv = cachedReliefOverrides?.[i];
    if (rv !== null && rv !== undefined) reliefDiffs.push([i, rv]);
    const tv = cachedTempOverrides?.[i];
    if (tv !== undefined && !Number.isNaN(tv)) tempDiffs.push([i, Number(tv.toFixed(4))]);
    if (cachedManualForest?.[i] === 1) manualForestIndices.push(i);
    const rlm = cachedRealmOverrides?.[i];
    if (rlm !== undefined) realmDiffs.push([i, rlm]);
    const cnt = cachedCountyOverrides?.[i];
    if (cnt !== undefined) countyDiffs.push([i, cnt]);
  }

  return {
    paintDiffs,
    biomeDiffs,
    reliefDiffs,
    tempDiffs,
    manualForestIndices,
    realmDiffs,
    countyDiffs,
  };
}

export function rehydrateMeshAndSim(
  world: WorldState,
  diffs?: SparseBrushDiffs
): WorldState {
  const WIDTH = 1000;
  const HEIGHT = 700;
  const COLS = 75;
  const ROWS = 52;
  const prng = new PRNG(world.settings.seed);
  cachedNoise = new Noise2D(prng);
  cachedMesh = createVoronoiDualMesh(WIDTH, HEIGHT, COLS, ROWS, prng);
  const n = cachedMesh.numRegions;
  initOverrideBuffers(n);
  cachedCustomBaseHeights = null;

  if (diffs) {
    for (const [idx, v] of diffs.paintDiffs || []) {
      if (idx >= 0 && idx < n) cachedPaintBuffer![idx] = v;
    }
    for (const [idx, b] of diffs.biomeDiffs || []) {
      if (idx >= 0 && idx < n) cachedBiomeOverrides![idx] = b;
    }
    for (const [idx, r] of diffs.reliefDiffs || []) {
      if (idx >= 0 && idx < n) cachedReliefOverrides![idx] = r;
    }
    for (const [idx, t] of diffs.tempDiffs || []) {
      if (idx >= 0 && idx < n) cachedTempOverrides![idx] = t;
    }
    for (const idx of diffs.manualForestIndices || []) {
      if (idx >= 0 && idx < n) cachedManualForest![idx] = 1;
    }
    for (const [idx, rid] of diffs.realmDiffs || []) {
      if (idx >= 0 && idx < n) cachedRealmOverrides![idx] = rid;
    }
    for (const [idx, cid] of diffs.countyDiffs || []) {
      if (idx >= 0 && idx < n) cachedCountyOverrides![idx] = cid;
    }
  }

  const terrainSimCfg = world.settings.terrainSim || {
    windAngleDeg: 45,
    raininess: 0.65,
    seaLevel: world.settings.seaLevel ?? 0.28,
    minRiverFlow: 7.5,
    brushMode: 'inspect' as const,
    brushSize: 40,
    brushStrength: 0.5,
    brushFalloff: 'medium' as const,
  };
  const sim = runTerrainSimulation(
    cachedMesh,
    cachedNoise,
    world.settings.template,
    cachedPaintBuffer!,
    {
      windAngleDeg: terrainSimCfg.windAngleDeg,
      raininess: terrainSimCfg.raininess,
      seaLevel: terrainSimCfg.seaLevel,
      minRiverFlow: terrainSimCfg.minRiverFlow,
      continentCount: world.settings.continentCount || 2,
      continentConfigs: world.settings.continentConfigs,
      climateTemplate: world.settings.climateTemplate || 'Temperate Hearth',
      seed: world.settings.seed,
      biomeOverrides: cachedBiomeOverrides || undefined,
      reliefOverrides: cachedReliefOverrides || undefined,
      tempOverrides: cachedTempOverrides || undefined,
      customBaseHeights: cachedCustomBaseHeights || undefined,
    },
    WIDTH,
    HEIGHT
  );
  cachedSim = sim;

  const rebuiltCells: WorldCell[] = world.cells.map((cell, idx) => {
    const r = cell.index ?? idx;
    const poly = cachedMesh!.r_polygon[r] || [];
    const realmOv = cachedRealmOverrides?.[r];
    const countyOv = cachedCountyOverrides?.[r];
    const isManual = cachedManualForest?.[r] === 1;
    return {
      ...cell,
      x: cachedMesh!.r_x[r] ?? cell.x,
      y: cachedMesh!.r_y[r] ?? cell.y,
      polygon: poly,
      elevation: r < n ? sim.elevation[r] : cell.elevation,
      moisture: r < n ? sim.rainfall[r] : cell.moisture,
      temperature: r < n ? sim.temperature[r] : cell.temperature,
      biome: r < n ? sim.biomes[r] : cell.biome,
      isCoast: r < n ? sim.isCoast[r] : cell.isCoast,
      isRiver: r < n ? sim.isRiver[r] : cell.isRiver,
      isLake: r < n ? sim.isLake?.[r] : cell.isLake,
      isOcean: r < n ? sim.isOcean?.[r] : cell.isOcean,
      isEndorheicSea: r < n ? sim.isEndorheicSea?.[r] : cell.isEndorheicSea,
      lakeElevation: r < n ? sim.lakeElevation?.[r] : cell.lakeElevation,
      lakeDepth: r < n ? sim.lakeDepth?.[r] : cell.lakeDepth,
      riverFlow: r < n ? Math.sqrt(sim.waterFlux[r]) : cell.riverFlow,
      shadedRelief: r < n ? sim.shadedRelief[r] : cell.shadedRelief,
      isManualForest: isManual || cell.isManualForest,
      realmId: realmOv !== undefined ? (realmOv === null ? undefined : realmOv) : cell.realmId,
      countyId: countyOv !== undefined ? (countyOv === null ? undefined : countyOv) : cell.countyId,
    };
  });

  // Reconstruct optional typed arrays stripped during dehydration
  let nextTradeNetwork = world.tradeNetwork;
  if (nextTradeNetwork) {
    const cellTrafficVolume = new Float32Array(n);
    const cellPopulationDensity = new Float32Array(n);
    for (const route of nextTradeNetwork.routes || []) {
      for (const pt of route.pathPoints || []) {
        let bestR = -1;
        let bestD = Infinity;
        for (let r = 0; r < n; r++) {
          const d = Math.hypot(cachedMesh!.r_x[r] - pt.x, cachedMesh!.r_y[r] - pt.y);
          if (d < bestD) {
            bestD = d;
            bestR = r;
          }
        }
        if (bestR >= 0 && bestD < 28) {
          cellTrafficVolume[bestR] = Math.min(1, cellTrafficVolume[bestR] + (route.trafficVolume || 0.25));
        }
      }
    }
    for (const b of world.burgs || []) {
      if (b.cellIndex !== undefined && b.cellIndex >= 0 && b.cellIndex < n) {
        cellPopulationDensity[b.cellIndex] = Math.max(cellPopulationDensity[b.cellIndex], Math.min(120, Math.round(b.population / 250)));
      }
    }
    nextTradeNetwork = {
      ...nextTradeNetwork,
      cellTrafficVolume,
      cellPopulationDensity,
    };
  }

  return {
    ...world,
    settings: {
      ...world.settings,
      terrainSim: terrainSimCfg,
    },
    cells: rebuiltCells,
    mesh: cachedMesh,
    sim,
    tradeNetwork: nextTradeNetwork,
    paintRevision: (world.paintRevision || 0) + 1,
    territoryRevision: (world.territoryRevision || 0) + 1,
    burgRevision: (world.burgRevision || 0) + 1,
  };
}

function summarizeContinentsFromCells(
  cells: WorldCell[],
  seaLevel: number,
  settings: WorldSettings
): ContinentSummary[] {
  const WIDTH = 1000;
  const HEIGHT = 700;
  const continentBuckets = new Map<number, { count: number; sumX: number; sumY: number }>();
  for (const cell of cells) {
    if (cell.elevation < seaLevel || cell.continentId === undefined) continue;
    const b = continentBuckets.get(cell.continentId) || { count: 0, sumX: 0, sumY: 0 };
    b.count++;
    b.sumX += cell.x;
    b.sumY += cell.y;
    continentBuckets.set(cell.continentId, b);
  }
  return Array.from(continentBuckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([id, stats]) => {
      const cx = stats.sumX / Math.max(1, stats.count);
      const cy = stats.sumY / Math.max(1, stats.count);
      const ns = cy < HEIGHT * 0.38 ? 'Northern' : cy > HEIGHT * 0.62 ? 'Southern' : '';
      const ew = cx < WIDTH * 0.38 ? 'Western' : cx > WIDTH * 0.62 ? 'Eastern' : 'Central';
      const dir = [ns, ew].filter(Boolean).join(' ') || `Continent ${id + 1}`;
      return {
        id,
        name: settings.continentConfigs?.[id]?.name || `${dir} Continent`,
        cellCount: stats.count,
        centerX: Math.round(cx),
        centerY: Math.round(cy),
      };
    });
}

export function generateWorld(settings: WorldSettings): WorldState {
  const prng = new PRNG(settings.seed);
  cachedNoise = new Noise2D(prng);

  const WIDTH = 1000;
  const HEIGHT = 700;
  const COLS = 75;
  const ROWS = 52;

  // 1. Create Delaunay + Voronoi DualMesh
  cachedMesh = createVoronoiDualMesh(WIDTH, HEIGHT, COLS, ROWS, prng);
  initOverrideBuffers(cachedMesh.numRegions);
  cachedCustomBaseHeights = null;

  // 2. Run Environmental Terrain & Hydrology Simulation
  const sim = runTerrainSimulation(
    cachedMesh,
    cachedNoise,
    settings.template,
    cachedPaintBuffer!,
    {
      windAngleDeg: settings.terrainSim.windAngleDeg,
      raininess: settings.terrainSim.raininess,
      seaLevel: settings.terrainSim.seaLevel,
      minRiverFlow: settings.terrainSim.minRiverFlow,
      continentCount: settings.continentCount || 2,
      continentConfigs: settings.continentConfigs,
      climateTemplate: settings.climateTemplate || 'Temperate Hearth',
      seed: settings.seed,
    },
    WIDTH,
    HEIGHT
  );
  cachedSim = sim;

  return compileWorldState(cachedMesh, sim, settings, prng);
}

export interface BrushPaintOptions {
  falloff?: BrushFalloff;
  targetRealmId?: string;
  targetDuchyId?: string;
  targetCountyId?: string;
  targetBorderKind?: BorderKind;
}

export interface BrushSnapshot {
  paintBuffer: Float32Array;
  biomeOverrides: (BiomeType | null)[];
  reliefOverrides: (ReliefType | 'clear' | 'clear_all' | null)[];
  tempOverrides: Float32Array;
  manualForest?: Uint8Array;
  cellStates: {
    elevation: number;
    moisture: number;
    temperature: number;
    biome: BiomeType;
    isCoast: boolean;
    isRiver: boolean;
    riverFlow?: number;
    shadedRelief?: number;
    reliefType?: WorldCell['reliefType'];
    continentId?: number;
    realmId?: string;
    countyId?: string;
    isManualForest?: boolean;
  }[];
  countyStates: { id: string; realmId: string; cellIndices: number[] }[];
  provinceStates?: { id: string; realmId: string; cellIndices?: number[] }[];
}

export function captureBrushSnapshot(world: WorldState): BrushSnapshot | null {
  if (!cachedMesh || !cachedPaintBuffer) return null;
  const n = cachedMesh.numRegions;
  if (!cachedBiomeOverrides) cachedBiomeOverrides = new Array<BiomeType | null>(n).fill(null);
  if (!cachedReliefOverrides) cachedReliefOverrides = new Array<ReliefType | 'clear' | 'clear_all' | null>(n).fill(null);
  if (!cachedTempOverrides) cachedTempOverrides = new Float32Array(n).fill(NaN);
  if (!cachedManualForest) cachedManualForest = new Uint8Array(n);

  return {
    paintBuffer: new Float32Array(cachedPaintBuffer),
    biomeOverrides: [...cachedBiomeOverrides],
    reliefOverrides: [...cachedReliefOverrides],
    tempOverrides: new Float32Array(cachedTempOverrides),
    manualForest: new Uint8Array(cachedManualForest),
    cellStates: world.cells.map((c) => ({
      elevation: c.elevation,
      moisture: c.moisture,
      temperature: c.temperature,
      biome: c.biome,
      isCoast: c.isCoast,
      isRiver: c.isRiver,
      riverFlow: c.riverFlow,
      shadedRelief: c.shadedRelief,
      reliefType: c.reliefType,
      continentId: c.continentId,
      realmId: c.realmId,
      countyId: c.countyId,
      isManualForest: c.isManualForest,
    })),
    countyStates: world.counties.map((ct) => ({
      id: ct.id,
      realmId: ct.realmId,
      cellIndices: [...ct.cellIndices],
    })),
    provinceStates: world.provinces?.map((p) => ({
      id: p.id,
      realmId: p.realmId,
      cellIndices: p.cellIndices ? [...p.cellIndices] : undefined,
    })),
  };
}

export function restoreBrushSnapshot(world: WorldState, snap: BrushSnapshot): WorldState {
  if (!cachedMesh || !cachedNoise) return world;
  const n = cachedMesh.numRegions;
  cachedPaintBuffer = new Float32Array(snap.paintBuffer);
  cachedBiomeOverrides = [...snap.biomeOverrides];
  cachedReliefOverrides = [...snap.reliefOverrides];
  cachedTempOverrides = new Float32Array(snap.tempOverrides);
  cachedManualForest = snap.manualForest ? new Uint8Array(snap.manualForest) : new Uint8Array(n);

  const sim = runTerrainSimulation(
    cachedMesh,
    cachedNoise,
    world.settings.template,
    cachedPaintBuffer,
    {
      windAngleDeg: world.settings.terrainSim.windAngleDeg,
      raininess: world.settings.terrainSim.raininess,
      seaLevel: world.settings.terrainSim.seaLevel,
      minRiverFlow: world.settings.terrainSim.minRiverFlow,
      continentCount: world.settings.continentCount || 2,
      continentConfigs: world.settings.continentConfigs,
      climateTemplate: world.settings.climateTemplate || 'Temperate Hearth',
      seed: world.settings.seed,
      biomeOverrides: cachedBiomeOverrides,
      reliefOverrides: cachedReliefOverrides,
      tempOverrides: cachedTempOverrides,
      customBaseHeights: cachedCustomBaseHeights || undefined,
    }
  );

  const nextCells = world.cells.map((cell, r) => {
    const cs = snap.cellStates[r];
    if (!cs) return cell;
    if (r < n) {
      sim.biomes[r] = cs.biome;
      sim.elevation[r] = cs.elevation;
      sim.temperature[r] = cs.temperature;
      sim.rainfall[r] = cs.moisture;
      sim.isCoast[r] = cs.isCoast;
      sim.isRiver[r] = cs.isRiver;
      sim.reliefType[r] =
        cs.reliefType === 'mountain' ||
        cs.reliefType === 'hill' ||
        cs.reliefType === 'forest' ||
        cs.reliefType === 'tree' ||
        cs.reliefType === 'swamp'
          ? cs.reliefType
          : null;
    }
    return {
      ...cell,
      elevation: cs.elevation,
      moisture: cs.moisture,
      temperature: cs.temperature,
      biome: cs.biome,
      isCoast: cs.isCoast,
      isRiver: cs.isRiver,
      riverFlow: cs.riverFlow,
      shadedRelief: cs.shadedRelief,
      reliefType: cs.reliefType,
      continentId: cs.continentId,
      realmId: cs.realmId,
      countyId: cs.countyId,
      isManualForest: cs.isManualForest,
    };
  });

  const countyMap = new Map(snap.countyStates.map((cs) => [cs.id, cs]));
  const nextCounties = world.counties.map((ct) => {
    const cs = countyMap.get(ct.id);
    return cs ? { ...ct, realmId: cs.realmId, cellIndices: [...cs.cellIndices] } : ct;
  });

  const provMap = snap.provinceStates ? new Map(snap.provinceStates.map((ps) => [ps.id, ps])) : null;
  const nextProvinces =
    world.provinces && provMap
      ? world.provinces.map((p) => {
          const ps = provMap.get(p.id);
          return ps
            ? {
                ...p,
                realmId: ps.realmId,
                cellIndices: ps.cellIndices ? [...ps.cellIndices] : p.cellIndices,
              }
            : p;
        })
      : world.provinces;

  const seaLevel = world.settings.terrainSim.seaLevel;
  const continents = summarizeContinentsFromCells(nextCells, seaLevel, world.settings);

  cachedSim = sim;
  return {
    ...world,
    cells: nextCells,
    counties: nextCounties,
    provinces: nextProvinces,
    continents,
    sim,
    mesh: cachedMesh,
    paintRevision: (world.paintRevision || 0) + 1,
    territoryRevision: (world.territoryRevision || 0) + 1,
  };
}

export function resetAllBrushEdits(world: WorldState): WorldState {
  if (!cachedMesh || !cachedNoise) return world;
  resetPaintBuffer();
  const sim = runTerrainSimulation(
    cachedMesh,
    cachedNoise,
    world.settings.template,
    cachedPaintBuffer!,
    {
      windAngleDeg: world.settings.terrainSim.windAngleDeg,
      raininess: world.settings.terrainSim.raininess,
      seaLevel: world.settings.terrainSim.seaLevel,
      minRiverFlow: world.settings.terrainSim.minRiverFlow,
      continentCount: world.settings.continentCount || 2,
      continentConfigs: world.settings.continentConfigs,
      climateTemplate: world.settings.climateTemplate || 'Temperate Hearth',
      seed: world.settings.seed,
      customBaseHeights: cachedCustomBaseHeights || undefined,
    }
  );
  const nextCells = world.cells.map((c, r) => ({
    ...c,
    elevation: sim.elevation[r],
    moisture: sim.rainfall[r],
    temperature: sim.temperature[r],
    biome: sim.biomes[r],
    isCoast: sim.isCoast[r],
    isRiver: sim.isRiver[r],
    isLake: sim.isLake?.[r],
    isOcean: sim.isOcean?.[r],
    isEndorheicSea: sim.isEndorheicSea?.[r],
    lakeElevation: sim.lakeElevation?.[r],
    lakeDepth: sim.lakeDepth?.[r],
    riverFlow: Math.sqrt(sim.waterFlux[r]),
    shadedRelief: sim.shadedRelief[r],
    continentId: sim.continentIds[r] >= 0 ? sim.continentIds[r] : undefined,
    isManualForest: false,
    reliefType:
      sim.reliefType[r] ??
      (sim.elevation[r] >= 0.65
        ? 'mountain'
        : sim.elevation[r] >= 0.48
        ? 'hill'
        : sim.biomes[r].includes('Forest') || sim.biomes[r].includes('Taiga')
        ? 'forest'
        : null),
  }));
  const continents = summarizeContinentsFromCells(
    nextCells,
    world.settings.terrainSim.seaLevel,
    world.settings
  );
  cachedSim = sim;
  return {
    ...world,
    cells: nextCells,
    continents,
    sim,
    mesh: cachedMesh,
    paintRevision: (world.paintRevision || 0) + 1,
  };
}

export function resynthesizeWorldFromSculptedTerrain(world: WorldState): WorldState {
  if (!cachedMesh || !cachedPaintBuffer || !cachedNoise) return world;
  const sim = runTerrainSimulation(
    cachedMesh,
    cachedNoise,
    world.settings.template,
    cachedPaintBuffer,
    {
      windAngleDeg: world.settings.terrainSim.windAngleDeg,
      raininess: world.settings.terrainSim.raininess,
      seaLevel: world.settings.terrainSim.seaLevel,
      minRiverFlow: world.settings.terrainSim.minRiverFlow,
      continentCount: world.settings.continentCount || 2,
      continentConfigs: world.settings.continentConfigs,
      climateTemplate: world.settings.climateTemplate || 'Temperate Hearth',
      seed: world.settings.seed,
      biomeOverrides: cachedBiomeOverrides || undefined,
      reliefOverrides: cachedReliefOverrides || undefined,
      tempOverrides: cachedTempOverrides || undefined,
      customBaseHeights: cachedCustomBaseHeights || undefined,
    }
  );
  cachedSim = sim;
  const prng = new PRNG(world.settings.seed);
  const rebuilt = compileWorldState(cachedMesh, sim, world.settings, prng);
  return {
    ...rebuilt,
    paintRevision: (world.paintRevision || 0) + 1,
    territoryRevision: (world.territoryRevision || 0) + 1,
    burgRevision: (world.burgRevision || 0) + 1,
  };
}

function computeBrushFalloff(dist: number, radius: number, shape: BrushFalloff): number {
  const t = Math.max(0, Math.min(1, 1 - dist / Math.max(1, radius)));
  if (shape === 'soft') return t * t;
  if (shape === 'hard') return dist <= radius * 0.72 ? 1.0 : Math.min(1, t / 0.28);
  return t;
}

/**
 * Interactively paints terrain, climate/biomes, or political/county borders onto the map
 * with real-time hydrology, coastlines, hillshading, and territory synchronization.
 */
export function paintOnWorld(
  world: WorldState,
  worldX: number,
  worldY: number,
  radius: number,
  strength: number,
  mode: PaintBrushMode,
  options?: BrushPaintOptions
): WorldState {
  if (!cachedMesh || !cachedPaintBuffer || !cachedNoise || mode === 'inspect') return world;

  const { numRegions, r_x, r_y, r_neighbors } = cachedMesh;
  const seaLevel = world.settings.terrainSim.seaLevel;
  const falloffShape: BrushFalloff = options?.falloff || world.settings.terrainSim.brushFalloff || 'medium';

  if (!cachedBiomeOverrides) cachedBiomeOverrides = new Array<BiomeType | null>(numRegions).fill(null);
  if (!cachedReliefOverrides) cachedReliefOverrides = new Array<ReliefType | 'clear' | 'clear_all' | null>(numRegions).fill(null);
  if (!cachedTempOverrides) cachedTempOverrides = new Float32Array(numRegions).fill(NaN);
  if (!cachedManualForest) cachedManualForest = new Uint8Array(numRegions);

  const isTerrainMode =
    mode === 'mountain' ||
    mode === 'valley' ||
    mode === 'plateau' ||
    mode === 'smooth' ||
    mode === 'ocean';

  if (isTerrainMode) {
    let targetElev = 0.45;
    if (mode === 'plateau') {
      let bestDist = Infinity;
      for (let r = 0; r < numRegions; r++) {
        const d = Math.hypot(r_x[r] - worldX, r_y[r] - worldY);
        if (d < bestDist) {
          bestDist = d;
          targetElev = world.cells[r]?.elevation ?? 0.45;
        }
      }
      if (targetElev < seaLevel) {
        targetElev = Math.min(0.55, seaLevel + 0.08);
      }
    }

    // Pre-read current elevations for smooth/plateau consistency across brush region
    const prevElevs = new Float32Array(numRegions);
    for (let r = 0; r < numRegions; r++) {
      prevElevs[r] = world.cells[r]?.elevation ?? cachedSim?.elevation[r] ?? 0.2;
    }

    let touched = false;
    for (let r = 0; r < numRegions; r++) {
      const d = Math.hypot(r_x[r] - worldX, r_y[r] - worldY);
      if (d >= radius) continue;
      touched = true;
      const falloff = computeBrushFalloff(d, radius, falloffShape);

      if (mode === 'mountain') {
        cachedPaintBuffer[r] = Math.min(0.85, cachedPaintBuffer[r] + strength * 0.14 * falloff);
        if (cachedReliefOverrides[r] === 'clear_all') cachedReliefOverrides[r] = null;
      } else if (mode === 'valley') {
        cachedPaintBuffer[r] = Math.max(-0.75, cachedPaintBuffer[r] - strength * 0.14 * falloff);
      } else if (mode === 'plateau') {
        const diff = targetElev - prevElevs[r];
        cachedPaintBuffer[r] = Math.max(
          -0.75,
          Math.min(0.85, cachedPaintBuffer[r] + diff * Math.min(1, strength * 0.65 * falloff))
        );
      } else if (mode === 'smooth') {
        const nbrs = r_neighbors[r];
        let sum = prevElevs[r];
        for (const n of nbrs) {
          sum += prevElevs[n];
        }
        const avgElev = sum / (nbrs.length + 1);
        const diff = avgElev - prevElevs[r];
        cachedPaintBuffer[r] = Math.max(
          -0.75,
          Math.min(0.85, cachedPaintBuffer[r] + diff * Math.min(1, strength * 0.78 * falloff))
        );
      } else if (mode === 'ocean') {
        const targetOceanElev = Math.max(0.02, seaLevel - 0.18);
        const diff = targetOceanElev - prevElevs[r];
        if (diff < 0) {
          cachedPaintBuffer[r] = Math.max(
            -0.85,
            cachedPaintBuffer[r] + diff * Math.min(1, strength * 0.85 * falloff)
          );
        }
        if (falloff > 0.35) {
          cachedBiomeOverrides[r] = null;
          cachedReliefOverrides[r] = null;
          cachedTempOverrides[r] = NaN;
          cachedManualForest[r] = 0;
        }
      }
    }

    if (!touched) return world;

    const sim = runTerrainSimulation(
      cachedMesh,
      cachedNoise,
      world.settings.template,
      cachedPaintBuffer,
      {
        windAngleDeg: world.settings.terrainSim.windAngleDeg,
        raininess: world.settings.terrainSim.raininess,
        seaLevel,
        minRiverFlow: world.settings.terrainSim.minRiverFlow,
        continentCount: world.settings.continentCount || 2,
        continentConfigs: world.settings.continentConfigs,
        climateTemplate: world.settings.climateTemplate || 'Temperate Hearth',
        seed: world.settings.seed,
        biomeOverrides: cachedBiomeOverrides,
        reliefOverrides: cachedReliefOverrides,
        tempOverrides: cachedTempOverrides,
        customBaseHeights: cachedCustomBaseHeights || undefined,
      }
    );

    const nextCells = world.cells.map((cell, r) => {
      const aboveSea = sim.elevation[r] >= seaLevel;
      if (!aboveSea) cachedManualForest![r] = 0;
      return {
        ...cell,
        elevation: sim.elevation[r],
        moisture: sim.rainfall[r],
        temperature: sim.temperature[r],
        biome: sim.biomes[r],
        isCoast: sim.isCoast[r],
        isRiver: sim.isRiver[r],
        isLake: sim.isLake?.[r],
        isOcean: sim.isOcean?.[r],
        isEndorheicSea: sim.isEndorheicSea?.[r],
        lakeElevation: sim.lakeElevation?.[r],
        lakeDepth: sim.lakeDepth?.[r],
        riverFlow: Math.sqrt(sim.waterFlux[r]),
        shadedRelief: sim.shadedRelief[r],
        continentId: sim.continentIds[r] >= 0 ? sim.continentIds[r] : undefined,
        isManualForest: aboveSea && Boolean(cachedManualForest![r]),
        reliefType:
          cachedReliefOverrides?.[r] === 'clear_all'
            ? null
            : sim.reliefType && sim.reliefType[r]
            ? sim.reliefType[r]
            : sim.elevation[r] >= 0.65
            ? 'mountain'
            : sim.elevation[r] >= 0.48
            ? 'hill'
            : sim.biomes[r].includes('Forest') || sim.biomes[r].includes('Taiga')
            ? 'forest'
            : sim.biomes[r].includes('Wetland')
            ? 'swamp'
            : null,
      };
    });

    const continents = summarizeContinentsFromCells(nextCells, seaLevel, world.settings);
    const resyncedBurgs = syncUnlockedBurgsToGeography(world.burgs, nextCells, world.settings.seed);

    cachedSim = sim;
    return {
      ...world,
      cells: nextCells,
      burgs: resyncedBurgs,
      continents,
      sim,
      mesh: cachedMesh,
      paintRevision: (world.paintRevision || 0) + 1,
    };
  }

  // Dedicated Cartographic Relief Painting Modes (Hills, Solitary Trees, Clear Relief)
  if (mode === 'hill' || mode === 'tree' || mode === 'clear_relief') {
    const sim = cachedSim || (world.sim as TerrainSimulationResult | undefined);
    let changed = false;
    const nextCells = [...world.cells];

    for (let r = 0; r < numRegions; r++) {
      const d = Math.hypot(r_x[r] - worldX, r_y[r] - worldY);
      if (d >= radius) continue;
      const cell = nextCells[r];
      if (!cell || cell.elevation < seaLevel) continue;
      const falloff = computeBrushFalloff(d, radius, falloffShape);
      if (falloff < 0.08 && strength < 0.85) continue;

      changed = true;
      let nextRelief: WorldCell['reliefType'] = cell.reliefType ?? null;
      let nextManualForest = Boolean(cell.isManualForest);

      if (mode === 'hill') {
        nextRelief = 'hill';
        nextManualForest = false;
        cachedReliefOverrides[r] = 'hill';
        cachedManualForest[r] = 0;
      } else if (mode === 'tree') {
        nextRelief = 'tree';
        nextManualForest = true;
        cachedReliefOverrides[r] = 'tree';
        cachedManualForest[r] = 1;
      } else if (mode === 'clear_relief') {
        nextRelief = null;
        nextManualForest = false;
        cachedReliefOverrides[r] = 'clear_all';
        cachedManualForest[r] = 0;
      }

      if (sim) {
        sim.reliefType[r] =
          nextRelief === 'mountain' ||
          nextRelief === 'hill' ||
          nextRelief === 'forest' ||
          nextRelief === 'tree' ||
          nextRelief === 'swamp'
            ? nextRelief
            : null;
      }

      nextCells[r] = {
        ...cell,
        reliefType: nextRelief,
        isManualForest: nextManualForest,
      };
    }

    if (!changed) return world;
    return {
      ...world,
      cells: nextCells,
      sim: sim || world.sim,
      mesh: cachedMesh,
      paintRevision: (world.paintRevision || 0) + 1,
    };
  }

  // Biome & Climate Painting Modes
  if (
    mode === 'forest' ||
    mode === 'desert' ||
    mode === 'snow' ||
    mode === 'swamp' ||
    mode === 'clear_biome'
  ) {
    const sim = cachedSim || (world.sim as TerrainSimulationResult | undefined);
    let changed = false;
    const nextCells = [...world.cells];

    for (let r = 0; r < numRegions; r++) {
      const d = Math.hypot(r_x[r] - worldX, r_y[r] - worldY);
      if (d >= radius) continue;
      const cell = nextCells[r];
      if (!cell || cell.elevation < seaLevel) continue;
      const falloff = computeBrushFalloff(d, radius, falloffShape);
      if (falloff < 0.12 && strength < 0.85) continue;

      changed = true;
      let nextBiome: BiomeType = cell.biome;
      let nextRelief: WorldCell['reliefType'] = cell.reliefType ?? null;
      let nextTemp = cell.temperature;
      let nextMoist = cell.moisture;
      let nextManualForest = Boolean(cell.isManualForest);

      if (mode === 'forest') {
        nextBiome =
          cell.temperature > 0.72
            ? 'Tropical Rainforest'
            : cell.temperature < 0.30
            ? 'Boreal Taiga'
            : 'Temperate Forest';
        nextRelief = cell.elevation >= 0.65 ? 'mountain' : 'forest';
        nextMoist = Math.min(1, Math.max(cell.moisture, 0.58));
        nextManualForest = true;
        cachedBiomeOverrides[r] = nextBiome;
        cachedReliefOverrides[r] = nextRelief;
        cachedTempOverrides[r] = NaN;
        cachedManualForest[r] = 1;
      } else if (mode === 'desert') {
        nextBiome = 'Scorched Desert';
        nextTemp = Math.max(cell.temperature, 0.58);
        nextRelief = cell.elevation >= 0.65 ? 'mountain' : cell.elevation >= 0.50 ? 'hill' : null;
        nextMoist = Math.min(cell.moisture, 0.14);
        nextManualForest = false;
        cachedBiomeOverrides[r] = nextBiome;
        cachedReliefOverrides[r] = nextRelief || 'clear';
        cachedTempOverrides[r] = nextTemp;
        cachedManualForest[r] = 0;
      } else if (mode === 'snow') {
        nextBiome = 'Glacial Tundra';
        nextTemp = Math.min(0.14, cell.temperature * 0.45);
        nextRelief = cell.elevation >= 0.65 ? 'mountain' : cell.elevation >= 0.48 ? 'hill' : null;
        nextManualForest = false;
        cachedBiomeOverrides[r] = nextBiome;
        cachedReliefOverrides[r] = nextRelief || 'clear';
        cachedTempOverrides[r] = nextTemp;
        cachedManualForest[r] = 0;
      } else if (mode === 'swamp') {
        nextBiome = 'Misty Wetland';
        nextRelief = cell.elevation >= 0.65 ? 'mountain' : 'swamp';
        nextMoist = Math.min(1, Math.max(cell.moisture, 0.76));
        nextManualForest = false;
        cachedBiomeOverrides[r] = nextBiome;
        cachedReliefOverrides[r] = nextRelief;
        cachedTempOverrides[r] = NaN;
        cachedManualForest[r] = 0;
      } else if (mode === 'clear_biome') {
        nextManualForest = false;
        cachedBiomeOverrides[r] = null;
        cachedReliefOverrides[r] = null;
        cachedTempOverrides[r] = NaN;
        cachedManualForest[r] = 0;
      }

      if (sim && mode !== 'clear_biome') {
        sim.biomes[r] = nextBiome;
        sim.temperature[r] = nextTemp;
        sim.rainfall[r] = nextMoist;
        sim.reliefType[r] =
          nextRelief === 'mountain' ||
          nextRelief === 'hill' ||
          nextRelief === 'forest' ||
          nextRelief === 'tree' ||
          nextRelief === 'swamp'
            ? nextRelief
            : null;
      }

      nextCells[r] = {
        ...cell,
        biome: nextBiome,
        reliefType: nextRelief,
        temperature: nextTemp,
        moisture: nextMoist,
        isManualForest: nextManualForest,
      };
    }

    if (!changed) return world;

    if (mode === 'clear_biome') {
      const rebuiltSim = runTerrainSimulation(
        cachedMesh,
        cachedNoise,
        world.settings.template,
        cachedPaintBuffer,
        {
          windAngleDeg: world.settings.terrainSim.windAngleDeg,
          raininess: world.settings.terrainSim.raininess,
          seaLevel,
          minRiverFlow: world.settings.terrainSim.minRiverFlow,
          continentCount: world.settings.continentCount || 2,
          continentConfigs: world.settings.continentConfigs,
          climateTemplate: world.settings.climateTemplate || 'Temperate Hearth',
          seed: world.settings.seed,
          biomeOverrides: cachedBiomeOverrides,
          reliefOverrides: cachedReliefOverrides,
          tempOverrides: cachedTempOverrides,
          customBaseHeights: cachedCustomBaseHeights || undefined,
        }
      );
      cachedSim = rebuiltSim;
      for (let r = 0; r < numRegions; r++) {
        nextCells[r] = {
          ...nextCells[r],
          temperature: rebuiltSim.temperature[r],
          moisture: rebuiltSim.rainfall[r],
          biome: rebuiltSim.biomes[r],
          reliefType: rebuiltSim.reliefType[r],
          isManualForest: Boolean(cachedManualForest[r]),
        };
      }
      const resyncedBurgs = syncUnlockedBurgsToGeography(world.burgs, nextCells, world.settings.seed);
      return {
        ...world,
        cells: nextCells,
        burgs: resyncedBurgs,
        sim: rebuiltSim,
        mesh: cachedMesh,
        paintRevision: (world.paintRevision || 0) + 1,
      };
    }

    const resyncedBurgs = syncUnlockedBurgsToGeography(world.burgs, nextCells, world.settings.seed);
    return {
      ...world,
      cells: nextCells,
      burgs: resyncedBurgs,
      sim: sim || world.sim,
      mesh: cachedMesh,
      paintRevision: (world.paintRevision || 0) + 1,
    };
  }

  // Political (Interstate Realm), Inter-Duchy, & County Territorial Painting Modes
  if (mode === 'realm' || mode === 'duchy' || mode === 'county') {
    const targetRealmId = options?.targetRealmId ?? world.settings.terrainSim.targetRealmId ?? world.realms[0]?.id;
    const targetDuchyId = options?.targetDuchyId ?? world.settings.terrainSim.targetDuchyId;
    const targetCountyId = options?.targetCountyId ?? world.settings.terrainSim.targetCountyId ?? world.counties[0]?.id;

    const targetCounty =
      mode === 'county' ? world.counties.find((c) => c.id === targetCountyId) : undefined;
    if (mode === 'county' && !targetCounty) return world;

    const duchyCounties =
      mode === 'duchy'
        ? world.counties.filter(
            (c) =>
              (targetDuchyId && (c.duchyId === targetDuchyId || c.id === targetDuchyId)) ||
              (!targetDuchyId && (c.tier === 'Duchy' || c.name.includes('Duchy')))
          )
        : [];
    if (mode === 'duchy' && duchyCounties.length === 0) return world;

    const resolvedRealmId =
      mode === 'county'
        ? targetCounty!.realmId
        : mode === 'duchy'
        ? duchyCounties[0].realmId
        : targetRealmId === '__unclaimed__'
        ? undefined
        : targetRealmId;

    const realmCounties =
      mode === 'duchy'
        ? duchyCounties
        : mode === 'realm' && resolvedRealmId
        ? world.counties.filter((c) => c.realmId === resolvedRealmId)
        : [];

    const countyCellSets = new Map<string, Set<number>>();
    for (const c of world.counties) {
      countyCellSets.set(c.id, new Set(c.cellIndices));
    }

    // Precompute county centroids for nearest county matching when painting realm or duchy borders
    const realmCountyCenters = realmCounties.map((rc) => {
      const capBurg = world.burgs.find((b) => b.id === rc.capitalBurgId);
      if (capBurg) return { id: rc.id, x: capBurg.x, y: capBurg.y };
      const pts = rc.cellIndices.map((idx) => world.cells[idx]).filter(Boolean);
      if (pts.length > 0) {
        return {
          id: rc.id,
          x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
          y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
        };
      }
      return { id: rc.id, x: 500, y: 350 };
    });

    const nextCells = [...world.cells];
    let changed = false;

    for (let r = 0; r < numRegions; r++) {
      const d = Math.hypot(r_x[r] - worldX, r_y[r] - worldY);
      if (d >= radius) continue;
      const cell = nextCells[r];
      if (!cell || cell.elevation < seaLevel) continue;

      let nextCountyId = cell.countyId;
      if (mode === 'county') {
        nextCountyId = targetCounty!.id;
      } else if (!resolvedRealmId) {
        nextCountyId = undefined;
      } else if (!cell.countyId || !realmCounties.some((rc) => rc.id === cell.countyId)) {
        // Pick nearest county inside target realm or duchy
        let bestId = realmCountyCenters[0]?.id;
        let bestD = Infinity;
        for (const rc of realmCountyCenters) {
          const dist = Math.hypot(rc.x - cell.x, rc.y - cell.y);
          if (dist < bestD) {
            bestD = dist;
            bestId = rc.id;
          }
        }
        nextCountyId = bestId;
      }

      if (cell.realmId === resolvedRealmId && cell.countyId === nextCountyId) continue;
      changed = true;

      if (cell.countyId && cell.countyId !== nextCountyId) {
        countyCellSets.get(cell.countyId)?.delete(r);
      }
      if (nextCountyId) {
        countyCellSets.get(nextCountyId)?.add(r);
      }

      if (!cachedRealmOverrides) cachedRealmOverrides = new Array<string | null | undefined>(numRegions).fill(undefined);
      if (!cachedCountyOverrides) cachedCountyOverrides = new Array<string | null | undefined>(numRegions).fill(undefined);
      cachedRealmOverrides[r] = resolvedRealmId ?? null;
      cachedCountyOverrides[r] = nextCountyId ?? null;

      nextCells[r] = {
        ...cell,
        realmId: resolvedRealmId,
        countyId: nextCountyId,
      };
    }

    if (!changed) return world;

    const nextCounties = world.counties.map((c) => {
      const set = countyCellSets.get(c.id);
      return set ? { ...c, cellIndices: Array.from(set) } : c;
    });

    const nextProvinces = world.provinces?.map((p) => {
      const set = countyCellSets.get(p.id);
      return set ? { ...p, cellIndices: Array.from(set) } : p;
    });

    return {
      ...world,
      cells: nextCells,
      counties: nextCounties,
      provinces: nextProvinces,
      paintRevision: (world.paintRevision || 0) + 1,
      territoryRevision: (world.territoryRevision || 0) + 1,
    };
  }

  // Border Edge Classification Brush (paint or erase border styles along cell frontiers)
  if (mode === 'draw_border' || mode === 'clear_border') {
    const nextOverrides: Record<string, BorderKind> = { ...(world.borderKindOverrides || {}) };
    let changed = false;
    const targetKind = options?.targetBorderKind ?? world.settings.terrainSim.targetBorderKind ?? 'march';

    for (let r = 0; r < numRegions; r++) {
      const d = Math.hypot(r_x[r] - worldX, r_y[r] - worldY);
      if (d >= radius) continue;
      const nbrs = r_neighbors[r] || [];
      for (const n of nbrs) {
        if (n <= r) continue;
        const c1 = world.cells[r];
        const c2 = world.cells[n];
        if (!c1 || !c2) continue;
        // Classify frontier edges between distinct counties/realms, or internal land boundaries
        const crossesBoundary =
          c1.realmId !== c2.realmId || c1.countyId !== c2.countyId;
        if (!crossesBoundary) continue;
        const edgeMidX = (c1.x + c2.x) * 0.5;
        const edgeMidY = (c1.y + c2.y) * 0.5;
        if (Math.hypot(edgeMidX - worldX, edgeMidY - worldY) > radius) continue;

        const pairKey = `${r}:${n}`;
        if (mode === 'clear_border') {
          if (nextOverrides[pairKey]) {
            delete nextOverrides[pairKey];
            changed = true;
          }
        } else if (nextOverrides[pairKey] !== targetKind) {
          nextOverrides[pairKey] = targetKind;
          changed = true;
        }
      }
    }

    // Also allow clear_border to erase nearby custom polyline borders
    let nextCustomBorders = world.customBorders;
    if (mode === 'clear_border' && world.customBorders && world.customBorders.length > 0) {
      const filtered = world.customBorders.filter(
        (cb) =>
          !cb.points.some(
            (pt) => Math.hypot(pt.x - worldX, pt.y - worldY) <= radius * 0.9
          )
      );
      if (filtered.length !== world.customBorders.length) {
        nextCustomBorders = filtered;
        changed = true;
      }
    }

    if (!changed) return world;
    return {
      ...world,
      borderKindOverrides: nextOverrides,
      customBorders: nextCustomBorders,
      paintRevision: (world.paintRevision || 0) + 1,
      territoryRevision: (world.territoryRevision || 0) + 1,
    };
  }

  return world;
}

let cachedSim: TerrainSimulationResult | null = null;

export function getCachedTerrainSim() {
  return { mesh: cachedMesh, sim: cachedSim };
}

function syncUnlockedBurgsToGeography(
  burgs: Burg[],
  cells: WorldCell[],
  seed: string
): Burg[] {
  return burgs.map((b) => {
    if (b.lockedFromAutoSim || b.cellIndex === undefined) return b;
    const cell = cells[b.cellIndex];
    if (!cell) return b;
    const prng = new PRNG(`${seed}_sync_${b.id}`);
    const site: Burg['settlementSite'] = cell.isCoast
      ? 'Estuary Harbor'
      : cell.isRiver
      ? 'River Confluence'
      : cell.reliefType === 'mountain' || cell.elevation >= 0.56
      ? 'Mountain Pass'
      : cell.moisture >= 0.6
      ? 'Fertile Basin'
      : 'Crossroads';
    const ctx = {
      biome: cell.biome,
      elevation: cell.elevation,
      temperature: cell.temperature,
      moisture: cell.moisture,
      isCoast: cell.isCoast,
      isRiver: cell.isRiver,
      reliefType: cell.reliefType,
    };
    const nextExports = deriveRealisticBurgExports(b.type, site, ctx, prng);
    const nextImports = deriveRealisticBurgImports(nextExports, ctx, b.type);
    return {
      ...b,
      settlementSite: site,
      exports: nextExports,
      imports: nextImports,
      tradeGood: canonicalizeTradeGood(nextExports[0] || b.tradeGood),
    };
  });
}

function deriveBurgExports(burgType: Burg['type'], site: string, cell: WorldCell, prng: PRNG): string[] {
  return deriveRealisticBurgExports(
    burgType,
    site,
    {
      biome: cell.biome,
      elevation: cell.elevation,
      temperature: cell.temperature,
      moisture: cell.moisture,
      isCoast: cell.isCoast,
      isRiver: cell.isRiver,
      reliefType: cell.reliefType,
    },
    prng
  );
}

function deriveBurgImports(exports: string[], cell?: WorldCell, burgType: Burg['type'] = 'Market Town'): string[] {
  return deriveRealisticBurgImports(
    exports,
    {
      biome: cell?.biome,
      elevation: cell?.elevation ?? 0.35,
      temperature: cell?.temperature ?? 0.5,
      moisture: cell?.moisture ?? 0.5,
      isCoast: cell?.isCoast,
      isRiver: cell?.isRiver,
      reliefType: cell?.reliefType,
    },
    burgType
  );
}

function deriveBurgGarrison(burgType: Burg['type'], pop: number): number {
  const safePop = Math.max(200, pop);
  if (burgType === 'Border Fortress') return Math.max(60, Math.round(safePop * 0.026));
  if (burgType === 'Capital Citadel') return Math.max(80, Math.round(safePop * 0.020));
  if (burgType === 'Royal Metropolis') return Math.max(50, Math.round(safePop * 0.015));
  if (burgType === 'Trade Port') return Math.max(40, Math.round(safePop * 0.014));
  if (burgType === 'Market Town') return Math.max(30, Math.round(safePop * 0.012));
  return Math.max(20, Math.round(safePop * 0.010));
}

// Declarative Interface for Courtiers
interface CourtBlueprint {
  role: CourtRole;
  titleGen: (isMale: boolean, realmName: string) => string;
  domain?: 'diplomacy' | 'martial' | 'stewardship' | 'intrigue' | 'learning';
  ageRange: [number, number];
  maleChance?: number;
  useRoyalHouse?: boolean;
  customHouseName?: string;
  customMotto?: string;
  statusTrait?: string;
  tier?: TitleTier;
  setup?: (
    courtier: Character,
    ctx: {
      monarch: Character;
      heir: Character;
      consort: Character;
      marshal?: Character;
      steward?: Character;
      inquisitor?: Character;
      prng: PRNG;
    }
  ) => void;
}

function compileWorldState(
  mesh: VoronoiDualMesh,
  sim: TerrainSimulationResult,
  settings: WorldSettings,
  prng: PRNG
): WorldState {
  const { numRegions, r_x, r_y, r_polygon, r_neighbors } = mesh;
  const WIDTH = 1000;
  const HEIGHT = 700;

  // 1. Cells
  const cells: WorldCell[] = [];
  for (let r = 0; r < numRegions; r++) {
      const reliefType =
        sim.reliefType && sim.reliefType[r]
          ? sim.reliefType[r]
          : sim.elevation[r] >= 0.65
          ? 'mountain'
          : sim.elevation[r] >= 0.48
          ? 'hill'
          : sim.biomes[r].includes('Forest') || sim.biomes[r].includes('Taiga')
          ? 'forest'
          : null;

    const continentId = sim.continentIds ? sim.continentIds[r] : (sim.elevation[r] >= settings.terrainSim.seaLevel ? 0 : -1);

    cells.push({
      index: r,
      x: r_x[r],
      y: r_y[r],
      polygon: r_polygon[r],
      elevation: sim.elevation[r],
      temperature: sim.temperature[r],
      moisture: sim.rainfall[r],
      biome: sim.biomes[r],
      continentId: continentId >= 0 ? continentId : undefined,
      isCoast: sim.isCoast[r],
      isRiver: sim.isRiver[r],
      isLake: sim.isLake?.[r],
      isOcean: sim.isOcean?.[r],
      isEndorheicSea: sim.isEndorheicSea?.[r],
      lakeElevation: sim.lakeElevation?.[r],
      lakeDepth: sim.lakeDepth?.[r],
      riverFlow: Math.sqrt(sim.waterFlux[r]),
      reliefType,
      shadedRelief: sim.shadedRelief[r],
    });
  }

  // Summarize detected continents for continent-by-continent configuration
  const continentBuckets = new Map<number, { count: number; sumX: number; sumY: number }>();
  for (const cell of cells) {
    if (cell.elevation < settings.terrainSim.seaLevel || cell.continentId === undefined) continue;
    const b = continentBuckets.get(cell.continentId) || { count: 0, sumX: 0, sumY: 0 };
    b.count++;
    b.sumX += cell.x;
    b.sumY += cell.y;
    continentBuckets.set(cell.continentId, b);
  }
  const continents = Array.from(continentBuckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([id, stats]) => {
      const cx = stats.sumX / Math.max(1, stats.count);
      const cy = stats.sumY / Math.max(1, stats.count);
      const ns = cy < HEIGHT * 0.38 ? 'Northern' : cy > HEIGHT * 0.62 ? 'Southern' : '';
      const ew = cx < WIDTH * 0.38 ? 'Western' : cx > WIDTH * 0.62 ? 'Eastern' : 'Central';
      const dir = [ns, ew].filter(Boolean).join(' ') || `Continent ${id + 1}`;
      return {
        id,
        name: settings.continentConfigs?.[id]?.name || `${dir} Continent`,
        cellCount: stats.count,
        centerX: Math.round(cx),
        centerY: Math.round(cy),
      };
    });

  // 1b. Ocean currents (calibrated to active seaLevel & climateTemplate, synced back to sim)
  OceanCurrentsEngine.applyOceanicCurrents(
    cells,
    1000,
    700,
    settings.terrainSim.seaLevel,
    settings.climateTemplate || 'Temperate Hearth'
  );
  for (let r = 0; r < numRegions; r++) {
    sim.temperature[r] = cells[r].temperature;
    sim.rainfall[r] = cells[r].moisture;
    sim.biomes[r] = cells[r].biome;
    if (cells[r].elevation < 0.48 && (cells[r].biome.includes('Forest') || cells[r].biome.includes('Taiga'))) {
      cells[r].reliefType = 'forest';
      sim.reliefType[r] = 'forest';
    } else if (cells[r].elevation < 0.48 && cells[r].biome.includes('Wetland')) {
      cells[r].reliefType = 'swamp';
      sim.reliefType[r] = 'swamp';
    }
  }

  // 2. Procedural Medieval Cultures & Religions (unique per seed & terrain, honoring modded entries)
  const activeCulturePool = getActiveCulturePresets();
  const worldAffinities = detectTerrainAffinities(cells, settings.terrainSim.seaLevel);
  const desiredCultureCount = Math.max(4, Math.min(8, settings.cultureCount || 5));
  const cultures: Culture[] = synthesizeProceduralCultures(
    desiredCultureCount,
    prng,
    worldAffinities,
    getModdedCustomCultures()
  );

  const desiredReligionCount = Math.max(4, Math.min(7, Math.max(4, Math.ceil((settings.realmCount || 10) * 0.7))));
  const religions: Religion[] = synthesizeProceduralReligions(
    desiredReligionCount,
    prng,
    worldAffinities,
    getModdedCustomReligions()
  );

// ========================================================================
  // 3. SOVEREIGN REALMS (Capitals at Geographic Bottlenecks & Intersections)
  // ========================================================================
  // Score every cell on the map based on its natural trade/traffic potential
  const scoredCells: { cell: WorldCell; score: number }[] = [];
  for (let r = 0; r < numRegions; r++) {
    const site = evaluateSettlementSite(r, mesh, sim, settings.terrainSim.seaLevel);
    if (site) {
      scoredCells.push({ cell: cells[r], score: site.score });
    }
  }
  scoredCells.sort((a, b) => b.score - a.score);

  const pickCapitalsFromPool = (
    pool: { cell: WorldCell; score: number }[],
    targetCount: number,
    existingSeeds: WorldCell[]
  ): WorldCell[] => {
    const picked: WorldCell[] = [];
    for (const minDist of [140, 90, 55, 28, 12, 0]) {
      for (const cand of pool) {
        if (picked.length >= targetCount) break;
        if (existingSeeds.some((s) => s.index === cand.cell.index) || picked.some((s) => s.index === cand.cell.index)) {
          continue;
        }
        const tooClose = [...existingSeeds, ...picked].some(
          (seed) => Math.hypot(seed.x - cand.cell.x, seed.y - cand.cell.y) < minDist
        );
        if (!tooClose) {
          picked.push(cand.cell);
        }
      }
      if (picked.length >= targetCount) break;
    }
    return picked;
  };

  interface SeedSpec {
    cell: WorldCell;
    continentId?: number;
    duchies: number;
    counties: number;
  }

  const seedSpecs: SeedSpec[] = [];
  const defaultDuchies = Math.max(0, settings.duchiesPerRealm ?? 2);
  const defaultCounties = Math.max(1, settings.countiesPerRealm ?? 10);
  const usePerContinent = Boolean(settings.perContinentMode && settings.continentConfigs && settings.continentConfigs.length > 0 && continents.length > 0);

  if (usePerContinent) {
    for (const cont of continents) {
      const cfg = settings.continentConfigs?.[cont.id];
      const targetR = Math.max(0, Math.min(24, cfg?.realmCount ?? 2));
      if (targetR === 0) continue;
      const contPool = scoredCells.filter((sc) => sc.cell.continentId === cont.id);
      const picked = pickCapitalsFromPool(
        contPool,
        targetR,
        seedSpecs.map((s) => s.cell)
      );
      for (const cell of picked) {
        seedSpecs.push({
          cell,
          continentId: cont.id,
          duchies: Math.max(0, cfg?.duchiesPerRealm ?? defaultDuchies),
          counties: Math.max(1, cfg?.countiesPerRealm ?? defaultCounties),
        });
      }
    }
    // Safety fallback if every continent was set to 0
    if (seedSpecs.length === 0 && scoredCells.length > 0) {
      seedSpecs.push({
        cell: scoredCells[0].cell,
        continentId: scoredCells[0].cell.continentId,
        duchies: defaultDuchies,
        counties: defaultCounties,
      });
    }
  } else {
    const desiredRealms = Math.max(1, Math.min(settings.realmCount ?? 10, 24));
    if (continents.length >= 2) {
      // Distribute realms proportionally across continents so every continent receives states
      const totalLand = Math.max(1, continents.reduce((s, c) => s + c.cellCount, 0));
      const alloc = new Map<number, number>();
      let remaining = desiredRealms;

      // Pass 1: if desiredRealms >= continents.length, give 1 baseline state to each continent
      if (desiredRealms >= continents.length) {
        for (const cont of continents) {
          alloc.set(cont.id, 1);
          remaining--;
        }
      }
      // Pass 2: allocate remaining seats by continent area share
      const byShare = [...continents].sort((a, b) => b.cellCount - a.cellCount);
      while (remaining > 0) {
        let bestCont = byShare[0];
        let bestDeficit = -Infinity;
        for (const cont of byShare) {
          const ideal = (cont.cellCount / totalLand) * desiredRealms;
          const cur = alloc.get(cont.id) || 0;
          if (ideal - cur > bestDeficit) {
            bestDeficit = ideal - cur;
            bestCont = cont;
          }
        }
        alloc.set(bestCont.id, (alloc.get(bestCont.id) || 0) + 1);
        remaining--;
      }

      for (const cont of continents) {
        const targetR = alloc.get(cont.id) || 0;
        if (targetR <= 0) continue;
        const contPool = scoredCells.filter((sc) => sc.cell.continentId === cont.id);
        const picked = pickCapitalsFromPool(
          contPool,
          targetR,
          seedSpecs.map((s) => s.cell)
        );
        for (const cell of picked) {
          seedSpecs.push({
            cell,
            continentId: cont.id,
            duchies: defaultDuchies,
            counties: defaultCounties,
          });
        }
      }
    }

    // Top up from global pool if any continent lacked land cells
    if (seedSpecs.length < desiredRealms) {
      const extra = pickCapitalsFromPool(
        scoredCells,
        desiredRealms - seedSpecs.length,
        seedSpecs.map((s) => s.cell)
      );
      for (const cell of extra) {
        seedSpecs.push({
          cell,
          continentId: cell.continentId,
          duchies: defaultDuchies,
          counties: defaultCounties,
        });
      }
    }
  }

  const numRealms = seedSpecs.length;
  const REALM_COLORS = [
    '#991B1B', '#1E3A8A', '#166534', '#B45309', '#6B21A8',
    '#0E7490', '#9A3412', '#86198F', '#047857', '#4338CA',
    '#BE123C', '#0F766E',
  ];

  const realms: Realm[] = [];
  const realmSeeds: { realmId: string; cellIdx: number; continentId?: number }[] = [];
  const realmTargetHierarchy: Record<string, { duchies: number; counties: number }> = {};
  const nameRegistry = new WorldNameRegistry(prng);
  for (const c of cultures) {
    if (c.linguisticFamily) {
      nameRegistry.registerCultureFamily(c.name, c.linguisticFamily);
    }
  }

  const usedRareGovernments = new Set<string>();
  const usedSocieties = new Set<string>();
  let rareGovCount = 0;
  let unusualGovCount = 0;
  const maxRareGovs =
    numRealms >= 8
      ? Math.max(1, Math.floor(numRealms * 0.12))
      : numRealms >= 5
      ? (prng.next() < 0.45 ? 1 : 0)
      : 0;
  const maxUnusualGovs =
    numRealms >= 6
      ? Math.max(1, Math.floor(numRealms * 0.18))
      : numRealms >= 3
      ? (prng.next() < 0.4 ? 1 : 0)
      : 0;

  const chooseMedievalGovernmentAndSociety = (
    capitalCell: WorldCell,
    culture: Culture,
    religion: Religion,
    realmIndex: number
  ): { government: string; societyType: string } => {
    const affinity = inferCellAffinity(capitalCell);
    const fam = culture.linguisticFamily || 'valorian';
    const theo = (religion.theologyFamily || '').toLowerCase();

    // Base weights: Feudal Monarchies, High Duchies, and Sovereign Counties dominate (~85-92% of states).
    // Unusual state types (Tribes, City-States, Theocracies, Republics, Marches, etc.) are genuinely rare.
    const allowRare = rareGovCount < maxRareGovs && unusualGovCount < maxUnusualGovs;
    const allowUncommon = unusualGovCount < maxUnusualGovs;
    const weightedPool: Array<{ gov: (typeof MEDIEVAL_GOVERNMENT_TYPES)[number]; weight: number }> = [];

    for (const gov of MEDIEVAL_GOVERNMENT_TYPES) {
      let w = gov.weight;

      if (gov.rarity === 'uncommon') {
        if (!allowUncommon || usedRareGovernments.has(gov.name)) continue;
      } else if (gov.rarity === 'rare') {
        if (!allowRare || usedRareGovernments.has(gov.name)) continue;

        // Only give rare governments a real chance where terrain/culture/faith naturally favors them
        let matchesSetting = false;
        if (gov.id === 'city_state' || gov.id === 'merchant_republic' || gov.id === 'free_imperial_league') {
          if (affinity === 'coastal' || fam === 'maritime') {
            matchesSetting = true;
            w *= 1.1;
          }
        } else if (gov.id === 'tribal_chiefdom' || gov.id === 'clan_confederation') {
          if (affinity === 'forest' || affinity === 'mountain' || fam === 'sylvathi' || fam === 'kharaz' || fam === 'skaldic') {
            matchesSetting = true;
            w *= 1.1;
          }
        } else if (gov.id === 'steppe_khanate') {
          if (affinity === 'steppe' || fam === 'steppic') {
            matchesSetting = true;
            w *= 1.15;
          }
        } else if (gov.id === 'caliphal_emirate') {
          if (affinity === 'arid' || fam === 'qadiri') {
            matchesSetting = true;
            w *= 1.15;
          }
        } else if (gov.id === 'prince_bishopric' || gov.id === 'theocratic_order' || gov.id === 'monastic_commonwealth') {
          if ((religion.zealousness || 50) >= 65 || theo.includes('church') || theo.includes('cloister') || theo.includes('solar')) {
            matchesSetting = true;
            w *= 1.05;
          }
        } else if (gov.id === 'imperial_autocracy') {
          if (fam === 'byzantion' || fam === 'valorian') {
            matchesSetting = true;
          }
        }

        if (!matchesSetting) {
          w *= 0.08;
        }
      } else if (gov.rarity === 'common') {
        // Ensure a healthy blend of Feudal Monarchy, High Duchy, and Sovereign County across realms
        if (realmIndex === 0 && gov.id === 'feudal_monarchy') w *= 1.65;
        if (gov.id === 'high_duchy' && (affinity === 'forest' || affinity === 'mountain')) w *= 1.1;
        if (gov.id === 'sovereign_county' && (affinity === 'temperate' || affinity === 'coastal')) w *= 1.1;
      }

      if (w > 0) weightedPool.push({ gov, weight: w });
    }

    const totalWeight = weightedPool.reduce((acc, item) => acc + item.weight, 0);
    let roll = prng.next() * Math.max(0.001, totalWeight);
    let chosenGov = MEDIEVAL_GOVERNMENT_TYPES[0];
    for (const item of weightedPool) {
      roll -= item.weight;
      if (roll <= 0) {
        chosenGov = item.gov;
        break;
      }
    }

    if (chosenGov.rarity === 'rare') {
      rareGovCount++;
      unusualGovCount++;
      usedRareGovernments.add(chosenGov.name);
    } else if (chosenGov.rarity === 'uncommon') {
      unusualGovCount++;
      usedRareGovernments.add(chosenGov.name);
    }

    const socCandidates = [...chosenGov.preferredSocieties];
    if (affinity === 'coastal') socCandidates.push('Seafaring & Maritime Guilds');
    if (affinity === 'mountain') socCandidates.push('Terraced & Alpine Miners');
    if (affinity === 'arid') socCandidates.push('Oasis Caravan & Artisans');
    if (affinity === 'steppe') socCandidates.push('Nomadic Steppe Hordes');
    if (affinity === 'forest') socCandidates.push('Pastoral Clan & Kinship');
    const freshSocs = socCandidates.filter((s) => !usedSocieties.has(s));
    const chosenSociety = prng.pick(freshSocs.length > 0 ? freshSocs : socCandidates);
    usedSocieties.add(chosenSociety);

    return { government: chosenGov.name, societyType: chosenSociety };
  };

  for (let i = 0; i < numRealms; i++) {
    const spec = seedSpecs[i];
    const capitalCell = spec.cell;
    const realmId = `realm_${i + 1}`;
    const affinity = inferCellAffinity(capitalCell);

    // Match culture to geographic feel while preserving multi-cultural variety across realms
    const affinityCultureMatches = cultures.filter((cu) => {
      const f = cu.linguisticFamily;
      if (affinity === 'arid') return f === 'qadiri' || f === 'iberan' || f === 'steppic';
      if (affinity === 'steppe') return f === 'steppic' || f === 'ostlandic' || f === 'qadiri';
      if (affinity === 'coastal') return f === 'maritime' || f === 'skaldic' || f === 'byzantion';
      if (affinity === 'mountain') return f === 'kharaz' || f === 'iberan' || f === 'skaldic';
      if (affinity === 'forest') return f === 'sylvathi' || f === 'ostlandic' || f === 'skaldic';
      return f === 'valorian' || f === 'byzantion' || f === 'ostlandic' || f === 'iberan';
    });
    const culture =
      affinityCultureMatches.length > 0 && prng.next() < 0.72
        ? affinityCultureMatches[i % affinityCultureMatches.length]
        : cultures[i % cultures.length];
    const religion = religions[(i + (affinity === 'coastal' ? 1 : 0)) % religions.length];

    const { government, societyType } = chooseMedievalGovernmentAndSociety(capitalCell, culture, religion, i);
    const govProfile = getGovernmentProfile(government);

    const uniqueRealmStem = nameRegistry.nextRealmName(culture.name);
    const realmName = `${prng.pick(govProfile.realmPrefixes)} ${uniqueRealmStem}`;
    const legendHouse = nameRegistry.nextHouseName(culture.name);

    const initialRealmHeraldry = generateRealmHeraldry(`${realmId}_${realmName}_${settings.seed}`);

    realms.push({
      id: realmId,
      name: realmName,
      color: REALM_COLORS[i % REALM_COLORS.length],
      rulerId: '',
      capitalBurgId: '',
      culture: culture.name,
      religion: religion.name,
      government,
      societyType,
      foundingLegend: `Founded as a ${government.toLowerCase()} shaped by ${societyType.toLowerCase()} under the banners of House ${legendHouse}.`,
      countyIds: [],
      continentId: spec.continentId,
      heraldry: initialRealmHeraldry,
      coatOfArms: cloneCoatOfArmsData(initialRealmHeraldry),
    });

    realmSeeds.push({ realmId, cellIdx: capitalCell.index, continentId: spec.continentId });
    realmTargetHierarchy[realmId] = { duchies: spec.duchies, counties: spec.counties };
  }

  // Track which continents have sovereign states so continents with 0 states remain unclaimed in per-continent mode
  const populatedContinents = new Set<number>();
  for (const rs of realmSeeds) {
    if (rs.continentId !== undefined) populatedContinents.add(rs.continentId);
  }

  // Sovereign-tier territorial scaling: Empires & Kingdoms claim wide heartlands,
  // while Sovereign Duchies and especially Sovereign Counties / City-States remain compact.
  const realmById = new Map(realms.map((r) => [r.id, r]));
  const realmDragMap = new Map<string, number>();
  const realmCapMap = new Map<string, number | null>();
  const realmCellCounts = new Map<string, number>();

  const contLandCounts = new Map<number, number>();
  for (const c of cells) {
    if (c.elevation >= settings.terrainSim.seaLevel && c.continentId !== undefined) {
      contLandCounts.set(c.continentId, (contLandCounts.get(c.continentId) || 0) + 1);
    }
  }
  const totalLandCells = cells.filter((c) => c.elevation >= settings.terrainSim.seaLevel).length;
  const contRealmsMap = new Map<number, Realm[]>();
  for (const rs of realmSeeds) {
    if (rs.continentId === undefined) continue;
    const r = realmById.get(rs.realmId);
    if (!r) continue;
    const arr = contRealmsMap.get(rs.continentId) || [];
    arr.push(r);
    contRealmsMap.set(rs.continentId, arr);
  }

  for (const r of realms) {
    const rank = getRealmSovereignRank(r);
    const gov = getGovernmentProfile(r.government);
    const prof = getSovereignTerritoryProfile(rank.titleTier, gov.id);
    realmDragMap.set(r.id, prof.floodDrag);
    realmCellCounts.set(r.id, 0);

    let cap: number | null = null;
    if (prof.areaCapRatio !== null) {
      const contId = r.continentId;
      const contRealms = contId !== undefined ? (contRealmsMap.get(contId) || []) : realms;
      const hasUncappedOnCont = contRealms.some(
        (other) => other.id !== r.id && getRealmSovereignRank(other).isRoyalOrHigher
      );
      const hasHigherOnCont = contRealms.some(
        (other) =>
          other.id !== r.id &&
          (getRealmSovereignRank(other).isRoyalOrHigher ||
            (rank.titleTier === 'Count' && getRealmSovereignRank(other).titleTier === 'Duke'))
      );
      if (hasUncappedOnCont || (rank.titleTier === 'Count' && hasHigherOnCont)) {
        const contLand =
          contId !== undefined ? (contLandCounts.get(contId) || totalLandCells) : totalLandCells;
        const avgPerRealm = contLand / Math.max(1, contRealms.length);
        const minCells = rank.titleTier === 'Count' ? (gov.id === 'city_state' ? 5 : 7) : 13;
        cap = Math.max(minCells, Math.round(avgPerRealm * prof.areaCapRatio));
      }
    }
    realmCapMap.set(r.id, cap);
  }

  // Flood fill Voronoi cell boundaries using O(N log N) binary MinHeap
  const cellRealmMap: Map<number, string> = new Map();
  type RealmFloodNode = { cellIdx: number; realmId: string; cost: number; continentId?: number };
  const heap: RealmFloodNode[] = [];
  const pushHeap = (node: RealmFloodNode) => {
    heap.push(node);
    let idx = heap.length - 1;
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (heap[parent].cost <= heap[idx].cost) break;
      const tmp = heap[parent];
      heap[parent] = heap[idx];
      heap[idx] = tmp;
      idx = parent;
    }
  };
  const popHeap = (): RealmFloodNode | undefined => {
    if (heap.length === 0) return undefined;
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let idx = 0;
      const len = heap.length;
      while (true) {
        const left = idx * 2 + 1;
        const right = idx * 2 + 2;
        let smallest = idx;
        if (left < len && heap[left].cost < heap[smallest].cost) smallest = left;
        if (right < len && heap[right].cost < heap[smallest].cost) smallest = right;
        if (smallest === idx) break;
        const tmp = heap[idx];
        heap[idx] = heap[smallest];
        heap[smallest] = tmp;
        idx = smallest;
      }
    }
    return top;
  };

  for (const seed of realmSeeds) {
    cellRealmMap.set(seed.cellIdx, seed.realmId);
    realmCellCounts.set(seed.realmId, (realmCellCounts.get(seed.realmId) || 0) + 1);
    pushHeap({ cellIdx: seed.cellIdx, realmId: seed.realmId, cost: 0, continentId: seed.continentId });
  }

  while (heap.length > 0) {
    const { cellIdx, realmId, cost, continentId: seedContId } = popHeap()!;
    const realmCap = realmCapMap.get(realmId);
    const realmDrag = realmDragMap.get(realmId) ?? 1.0;

    if (realmCap !== null && realmCap !== undefined && (realmCellCounts.get(realmId) || 0) >= realmCap) {
      continue;
    }

    for (const nIdx of r_neighbors[cellIdx]) {
      if (realmCap !== null && realmCap !== undefined && (realmCellCounts.get(realmId) || 0) >= realmCap) {
        break;
      }
      const neighbor = cells[nIdx];
      if (!cellRealmMap.has(nIdx)) {
        // Keep continents sovereignly separated when the target continent has its own states or in per-continent mode
        if (
          neighbor.elevation >= settings.terrainSim.seaLevel &&
          neighbor.continentId !== undefined &&
          seedContId !== undefined &&
          neighbor.continentId !== seedContId &&
          (usePerContinent || populatedContinents.has(neighbor.continentId))
        ) {
          continue;
        }

        let terrainCost = 1.0;
        if (neighbor.elevation < settings.terrainSim.seaLevel) {
          terrainCost = 50.0;
        } else if (neighbor.reliefType === 'mountain') {
          terrainCost = 14.0;
        } else if (neighbor.reliefType === 'forest') {
          terrainCost = 2.4;
        } else if (neighbor.isRiver) {
          terrainCost = 3.2; // Rivers act as natural historical frontiers
        }

        // Deterministic multi-frequency spatial warp prevents straight-line Voronoi bisectors
        const warp1 = Math.sin(neighbor.x * 0.017 + neighbor.y * 0.013) * Math.cos(neighbor.x * 0.011 - neighbor.y * 0.019);
        const warp2 = Math.sin(neighbor.x * 0.043 - neighbor.y * 0.037 + 1.7);
        const organicMultiplier = Math.max(0.35, 1.0 + warp1 * 0.65 + warp2 * 0.35);

        const elevDiff = Math.abs(neighbor.elevation - cells[cellIdx].elevation);
        const totalCost = cost + (terrainCost + elevDiff * 18) * organicMultiplier * realmDrag;

        if (neighbor.elevation >= settings.terrainSim.seaLevel || totalCost < 100) {
          cellRealmMap.set(nIdx, realmId);
          if (neighbor.elevation >= settings.terrainSim.seaLevel) {
            realmCellCounts.set(realmId, (realmCellCounts.get(realmId) || 0) + 1);
          }
          pushHeap({ cellIdx: nIdx, realmId, cost: totalCost, continentId: seedContId });
        }
      }
    }
  }

  for (let i = 0; i < cells.length; i++) {
    if (cellRealmMap.has(i) && cells[i].elevation >= settings.terrainSim.seaLevel) {
      cells[i].realmId = cellRealmMap.get(i);
    }
  }

  // Assign any isolated offshore islet on a populated continent to the nearest eligible realm on that continent
  for (const cell of cells) {
    if (cell.elevation < settings.terrainSim.seaLevel || cell.realmId) continue;
    if (cell.continentId === undefined || !populatedContinents.has(cell.continentId)) continue;
    const contSeeds = realmSeeds.filter((rs) => rs.continentId === cell.continentId);
    const uncappedSeeds = contSeeds.filter((rs) => {
      const cap = realmCapMap.get(rs.realmId);
      return cap === null || cap === undefined || (realmCellCounts.get(rs.realmId) || 0) < cap;
    });
    const candidateSeeds = uncappedSeeds.length > 0 ? uncappedSeeds : contSeeds;
    let bestRealmId: string | undefined;
    let bestD = Infinity;
    for (const rs of candidateSeeds) {
      const sc = cells[rs.cellIdx];
      const d = Math.hypot(cell.x - sc.x, cell.y - sc.y);
      if (d < bestD) {
        bestD = d;
        bestRealmId = rs.realmId;
      }
    }
    if (bestRealmId) {
      cell.realmId = bestRealmId;
      realmCellCounts.set(bestRealmId, (realmCellCounts.get(bestRealmId) || 0) + 1);
    }
  }

  // 4. Burgs, Counties & Noble Generation
  const burgs: Burg[] = [];
  const counties: County[] = [];
  const characters: Character[] = [];
  let burgCounter = 1;
  let countyCounter = 1;
  let charCounter = 1;

  // World-wide heraldry uniqueness registry: guarantees no two distinct noble Houses share identical arms
  const houseHeraldryRegistry = new Map<string, CoatOfArmsData>();
  const usedHeraldrySignatures = new Set<string>();
  const resolveUniqueHouseArms = (
    houseName: string,
    seedKey: string,
    isSovereign = false
  ): CoatOfArmsData => {
    const norm = houseName.trim().toLowerCase();
    const existing = houseHeraldryRegistry.get(norm);
    if (existing) return cloneCoatOfArmsData(existing);
    const fresh = generateUniqueHouseHeraldry(seedKey, usedHeraldrySignatures, {
      isSovereign,
      isLanded: true,
    });
    houseHeraldryRegistry.set(norm, fresh);
    return cloneCoatOfArmsData(fresh);
  };

  for (const realm of realms) {
    const realmCells = cells.filter((c) => c.realmId === realm.id);
    if (realmCells.length === 0) continue;

    const hierarchy = realmTargetHierarchy[realm.id];
    const realmSovRankEarly = getRealmSovereignRank(realm);
    const realmGovEarly = getGovernmentProfile(realm.government);
    const territoryProf = getSovereignTerritoryProfile(realmSovRankEarly.titleTier, realmGovEarly.id);

    const baseTargetCounties = hierarchy ? hierarchy.counties : Math.max(6, settings.countiesPerRealm ?? 10);

    // Scale county counts by sovereign rank & landmass size so Sovereign Counties stay 1-2 counties,
    // Sovereign Duchies stay 2-5 counties, and Kingdoms/Empires hold wide multi-duchy domains.
    const sizeScale = Math.max(0.7, Math.min(1.55, realmCells.length / 68));
    const tierCountyScale =
      realmSovRankEarly.titleTier === 'Emperor'
        ? 1.25
        : realmSovRankEarly.titleTier === 'King'
        ? 1.0
        : realmSovRankEarly.titleTier === 'Duke'
        ? 0.36
        : 0.15;
    const randomizedCounties = Math.round(
      baseTargetCounties * tierCountyScale * sizeScale * (0.85 + prng.next() * 0.4)
    );
    const minCountiesForRealm = Math.min(territoryProf.minCounties, realmCells.length);
    const maxCountiesForRealm = Math.min(territoryProf.maxCounties, realmCells.length);
    const numCounties =
      realmGovEarly.id === 'city_state'
        ? 1
        : Math.max(
            minCountiesForRealm,
            Math.min(maxCountiesForRealm, randomizedCounties)
          );

    // Two vassal duchies (plus the Crown Duchy) is the MINIMUM for Kingdoms/Empires,
    // while Sovereign Duchies & Counties never create subordinate Grand Duchies.
    const maxFeasibleVassalDuchies = Math.min(
      6,
      Math.max(2, Math.floor((numCounties - 1) / 1.6))
    );
    const minVassalDuchies = Math.min(2, maxFeasibleVassalDuchies);
    const span = Math.max(0, maxFeasibleVassalDuchies - minVassalDuchies);
    const rolledVassalDuchies =
      minVassalDuchies + Math.floor(prng.next() * (span + 1));
    const numDuchies =
      !realmSovRankEarly.isRoyalOrHigher || numCounties <= 1
        ? 0
        : numCounties >= 4
        ? Math.max(2, rolledVassalDuchies)
        : 1;

    // Farthest-point spatial seeding starting from capital cell so counties divide territory cleanly
    const rSeed = realmSeeds.find((rs) => rs.realmId === realm.id);
    const capCell = (rSeed ? cells[rSeed.cellIdx] : realmCells[0]) || realmCells[0];
    const countySeeds: WorldCell[] = [capCell];
    const chosenSet = new Set<number>([capCell.index]);

    while (countySeeds.length < numCounties) {
      let bestCell = realmCells[0];
      let bestMinDist = -1;
      for (const candidate of realmCells) {
        if (chosenSet.has(candidate.index)) continue;
        let minDist = Infinity;
        for (const s of countySeeds) {
          const d = Math.hypot(candidate.x - s.x, candidate.y - s.y);
          if (d < minDist) minDist = d;
        }
        if (minDist > bestMinDist) {
          bestMinDist = minDist;
          bestCell = candidate;
        }
      }
      if (chosenSet.has(bestCell.index)) break;
      countySeeds.push(bestCell);
      chosenSet.add(bestCell.index);
    }

    const countyMap: Map<number, number> = new Map();
    for (const c of realmCells) {
      let closest = 0;
      let minD = Infinity;
      countySeeds.forEach((s, idx) => {
        const d = Math.hypot(c.x - s.x, c.y - s.y);
        if (d < minD) {
          minD = d;
          closest = idx;
        }
      });
      countyMap.set(c.index, closest);
    }

    const worldCultureObj = cultures.find((c) => c.name === realm.culture);
    const cultPreset =
      activeCulturePool.find((c) => c.name === realm.culture) ||
      activeCulturePool.find(
        (c) => (c as { linguisticFamily?: string }).linguisticFamily === worldCultureObj?.linguisticFamily
      ) ||
      activeCulturePool[0];
    const realmReligionObj = religions.find((rel) => rel.name === realm.religion);
    const realmGovProfile = getGovernmentProfile(realm.government);

    // ========================================================================
    // A. CORE ROYAL FAMILY (Monarch, Consort, Heir) — 82/18 Male/Female Ruler Ratio
    // ========================================================================
    const monarchMale = prng.next() < 0.82;
    const monarchHouse = nameRegistry.nextHouseName(realm.culture);
    const monarchName = nameRegistry.nextFirstName(
      realm.culture,
      monarchMale ? 'Male' : 'Female',
      monarchHouse
    );

    const realmCleanName = stripRealmPrefix(realm.name);
    const monarchRank = getRealmSovereignRank(realm, monarchMale ? 'male' : 'female');
    const monarchSovereignTitle = monarchRank.rankTitle;

    const monarch: Character = generateStoryCharacter({
      id: `char_${charCounter++}`,
      name: `${monarchName} of House ${monarchHouse}`,
      houseName: monarchHouse,
      houseMotto: prng.pick(cultPreset.mottos),
      title: `${monarchSovereignTitle} of ${realmCleanName}`,
      role: 'Monarch',
      gender: monarchMale ? 'male' : 'female',
      age: prng.range(32, 64),
      realmId: realm.id,
      prng,
    });
    monarch.titleTier = monarchRank.titleTier;
    const sovereignArms = resolveUniqueHouseArms(
      monarchHouse,
      `${realm.id}_House_${monarchHouse}_${settings.seed}`,
      true
    );
    monarch.coatOfArms = sovereignArms;
    realm.heraldry = cloneCoatOfArmsData(sovereignArms);
    realm.coatOfArms = cloneCoatOfArmsData(sovereignArms);
    realm.rulerId = monarch.id;

    // Seed 2 generations of deceased Royal Ancestors (Founder Grandparent -> Late Sovereign Parent -> Monarch)
    const founderName = nameRegistry.nextFirstName(realm.culture, 'Male', monarchHouse);
    const lateParentMale = prng.next() < 0.82;
    const lateParentName = nameRegistry.nextFirstName(
      realm.culture,
      lateParentMale ? 'Male' : 'Female',
      monarchHouse
    );
    const founderDeathYear = 1042 - monarch.age - prng.range(18, 34);
    const founderBirthYear = founderDeathYear - prng.range(54, 76);
    const lateParentDeathYear = 1042 - prng.range(6, Math.max(8, Math.min(20, monarch.age - 16)));
    const lateParentBirthYear = lateParentDeathYear - prng.range(48, 72);

    const founderRank = getRealmSovereignRank(realm, 'male');
    const royalFounder: Character = generateStoryCharacter({
      id: `char_anc_${charCounter++}`,
      name: `${founderName} the Founder of House ${monarchHouse}`,
      houseName: monarchHouse,
      houseMotto: monarch.houseMotto,
      title: `First ${founderRank.rankTitle} of ${realmCleanName}`,
      role: 'Monarch',
      gender: 'male',
      age: founderDeathYear - founderBirthYear,
      realmId: realm.id,
      prng,
    });
    royalFounder.isAlive = false;
    royalFounder.treasury = 0;
    royalFounder.titleTier = founderRank.titleTier;
    royalFounder.birthYear = founderBirthYear;
    royalFounder.deathYear = founderDeathYear;
    const founderDeath = pickContextualDeathCause(royalFounder, 'natural', () => prng.next());
    royalFounder.causeOfDeath = founderDeath.cause;
    royalFounder.deathCategory = founderDeath.category;
    royalFounder.prestige = prng.range(420, 760);
    royalFounder.coatOfArms = cloneCoatOfArmsData(sovereignArms);
    royalFounder.isNobleHouse = true;

    const lateParentRank = getRealmSovereignRank(realm, lateParentMale ? 'male' : 'female');
    const lateSovereign: Character = generateStoryCharacter({
      id: `char_anc_${charCounter++}`,
      name: `${lateParentName} of House ${monarchHouse}`,
      houseName: monarchHouse,
      houseMotto: monarch.houseMotto,
      title: `Late ${lateParentRank.rankTitle} of ${realmCleanName}`,
      role: 'Monarch',
      gender: lateParentMale ? 'male' : 'female',
      age: lateParentDeathYear - lateParentBirthYear,
      realmId: realm.id,
      prng,
    });
    lateSovereign.isAlive = false;
    lateSovereign.treasury = 0;
    lateSovereign.titleTier = lateParentRank.titleTier;
    lateSovereign.birthYear = lateParentBirthYear;
    lateSovereign.deathYear = lateParentDeathYear;
    const lateCtx = prng.pick(['natural', 'disease', 'war', 'accident'] as const);
    const lateDeath = pickContextualDeathCause(lateSovereign, lateCtx, () => prng.next());
    lateSovereign.causeOfDeath = lateDeath.cause;
    lateSovereign.deathCategory = lateDeath.category;
    lateSovereign.prestige = prng.range(340, 620);
    lateSovereign.coatOfArms = cloneCoatOfArmsData(sovereignArms);
    lateSovereign.isNobleHouse = true;
    lateSovereign.knownFatherId = royalFounder.id;
    royalFounder.children = [lateSovereign.id];

    if (lateParentMale) monarch.knownFatherId = lateSovereign.id;
    else monarch.motherId = lateSovereign.id;
    lateSovereign.children = [monarch.id];

    characters.push(royalFounder, lateSovereign, monarch);

    const consortMale = !monarchMale;
    const consortHouse = nameRegistry.nextHouseName(realm.culture, new Set([monarchHouse.toLowerCase()]));
    const consortName = nameRegistry.nextFirstName(
      realm.culture,
      consortMale ? 'Male' : 'Female',
      consortHouse
    );
    const consortStyle = monarchRank.titleTier === 'Emperor'
      ? (consortMale ? `Prince Consort of ${realmCleanName}` : `Empress Consort of ${realmCleanName}`)
      : monarchRank.titleTier === 'King'
      ? (consortMale ? `Prince Consort of ${realmCleanName}` : `Queen Consort of ${realmCleanName}`)
      : (consortMale ? `Lord Consort of ${realmCleanName}` : `Lady Consort of ${realmCleanName}`);
    const consort: Character = generateStoryCharacter({
      id: `char_${charCounter++}`,
      name: `${consortName} of House ${consortHouse}`,
      houseName: consortHouse,
      houseMotto: prng.pick(cultPreset.mottos),
      title: consortStyle,
      role: 'Consort',
      gender: consortMale ? 'male' : 'female',
      age: Math.max(20, monarch.age + prng.range(-6, 4)),
      realmId: realm.id,
      spouseId: monarch.id,
      prng,
    });
    consort.titleTier = getLowerTitleTier(
      monarchRank.titleTier,
      monarchRank.isRoyalOrHigher ? 'Duke' : 'Baron'
    );
    monarch.spouseId = consort.id;
    monarch.marriageYear = consort.marriageYear;
    characters.push(consort);

    const heirMale = prng.next() < 0.82;
    const heirName = nameRegistry.nextFirstName(
      realm.culture,
      heirMale ? 'Male' : 'Female',
      monarchHouse
    );
    const heirStyle = getHeirStyleForRealm(
      realm,
      monarchRank.titleTier,
      heirMale ? 'male' : 'female'
    );
    const heir: Character = generateStoryCharacter({
      id: `char_${charCounter++}`,
      name: `${heirName} of House ${monarchHouse}`,
      houseName: monarchHouse,
      houseMotto: monarch.houseMotto,
      title: heirStyle.title,
      role: monarchRank.isRoyalOrHigher ? 'Crown Heir' : 'Heir',
      gender: heirMale ? 'male' : 'female',
      age: prng.range(17, 28),
      realmId: realm.id,
      liegeId: monarch.id,
      statusTrait: monarchRank.isRoyalOrHigher ? 'Crown Heir' : undefined,
      prng,
    });
    heir.titleTier = heirStyle.titleTier;
    monarch.heirId = heir.id;
    heir.coatOfArms = monarch.coatOfArms ? cloneCoatOfArmsData(monarch.coatOfArms) : undefined;
    heir.isNobleHouse = true;
    heir.hasPersonalBanner = false;
    heir.knownFatherId = monarch.gender === 'male' ? monarch.id : consort.id;
    heir.motherId = monarch.gender === 'female' ? monarch.id : consort.id;
    monarch.children = [heir.id];
    consort.children = [heir.id];
    characters.push(heir);

    // ========================================================================
    // B. DECLARATIVE COURT ROSTER (High Council, Dignitaries & Retainers)
    // ========================================================================
    const COURT_BLUEPRINTS: CourtBlueprint[] = [
      // Ruling Family Members
      {
        role: 'Child',
        titleGen: () => `Child of House ${monarchHouse}`,
        domain: 'martial',
        ageRange: [16, Math.max(17, heir.age - 1)],
        tier: monarchRank.isRoyalOrHigher ? 'Count' : 'Baron',
        useRoyalHouse: true,
        maleChance: 1.0,
      },
      {
        role: 'Child',
        titleGen: () => `Child of House ${monarchHouse}`,
        domain: 'diplomacy',
        ageRange: [16, Math.max(17, heir.age - 2)],
        tier: monarchRank.isRoyalOrHigher ? 'Count' : 'Baron',
        useRoyalHouse: true,
        maleChance: 0.0,
        statusTrait: 'Favored Child',
      },
      {
        role: monarchRank.isRoyalOrHigher ? 'Royal Uncle' : 'Court Noble',
        titleGen: (male) =>
          male
            ? monarchRank.isRoyalOrHigher
              ? `Elder Kinsman & Arch-Regent of ${realmCleanName}`
              : `Elder Kinsman & Regent of ${realmCleanName}`
            : monarchRank.isRoyalOrHigher
            ? `Dowager Princess of ${realmCleanName}`
            : `Dowager Lady of ${realmCleanName}`,
        domain: 'stewardship',
        ageRange: [monarch.age + 6, monarch.age + 18],
        tier: monarchRank.isRoyalOrHigher ? 'Count' : 'Baron',
        useRoyalHouse: true,
        statusTrait: 'Regent',
      },

      // High Privy Council (Baronial Rank)
      {
        role: 'Chancellor',
        titleGen: () => `Grand Chancellor of ${realmCleanName}`,
        domain: 'diplomacy',
        ageRange: [38, 62],
        tier: 'Baron',
      },
      {
        role: 'Marshal',
        titleGen: () => `High Marshal of ${realmCleanName}`,
        domain: 'martial',
        ageRange: [35, 60],
        maleChance: 0.8,
        tier: 'Baron',
      },
      {
        role: 'Steward',
        titleGen: () => `High Steward of ${realmCleanName}`,
        domain: 'stewardship',
        ageRange: [34, 58],
        tier: 'Baron',
      },
      {
        role: 'Spymaster',
        titleGen: () => `Grand Spymaster of ${realmCleanName}`,
        domain: 'intrigue',
        ageRange: [30, 55],
        tier: 'Baron',
        setup: (courtier, { steward: s, prng: p }) => {
          if (s) {
            const reason = p.pick(HOOK_REASONS);
            courtier.hooksHeld.push({ targetId: s.id, targetName: s.name, type: 'Strong', reason });
            s.hooksOnMe.push({ targetId: s.id, targetName: s.name, holderId: courtier.id, holderName: courtier.name, type: 'Strong', reason });
          }
        },
      },
      {
        role: 'Court Chaplain',
        titleGen: () => `${realmReligionObj?.clergyTitle || 'High Hierophant'} of ${realm.religion}`,
        domain: 'learning',
        ageRange: [42, 68],
        tier: 'Baron',
      },

      // Dignitaries & Retainers
      {
        role: 'Court Champion',
        titleGen: () => `Knight Champion of ${realmCleanName}`,
        domain: 'martial',
        ageRange: [24, 45],
        maleChance: 0.7,
        tier: 'Baron',
        statusTrait: 'Court Champion',
      },
      {
        role: 'Court Physician',
        titleGen: () => `Chief Physician to the Crown`,
        domain: 'learning',
        ageRange: [38, 64],
        tier: 'Commoner',
        statusTrait: 'Court Physician',
      },
      {
        role: 'Court Antiquarian',
        titleGen: () => `Grand Antiquarian & Lorekeeper`,
        domain: 'learning',
        ageRange: [45, 72],
        tier: 'Commoner',
        statusTrait: 'Grand Antiquarian',
      },
      {
        role: 'Grand Equerry',
        titleGen: () => `Grand Equerry of the Royal Stables`,
        domain: 'martial',
        ageRange: [28, 52],
        maleChance: 0.75,
        tier: 'Commoner',
      },
      {
        role: 'Royal Cupbearer',
        titleGen: () => `Royal Cupbearer to the Monarch`,
        domain: 'diplomacy',
        ageRange: [19, 32],
        tier: 'Commoner',
        statusTrait: 'Royal Cupbearer',
        setup: (courtier, { consort: c, prng: p }) => {
          if (p.next() < 0.4 && c) {
            courtier.loverId = c.id;
            c.loverId = courtier.id;
            courtier.darkSecret = `Conducts a treasonous bedchamber romance with ${c.name}`;
            c.darkSecret = `Broke wedding vows in secret with ${courtier.name}`;
          }
        },
      },
      {
        role: 'High Inquisitor',
        titleGen: () => `Grand Inquisitor of the Holy Pyre`,
        domain: 'intrigue',
        ageRange: [40, 65],
        tier: 'Baron',
        statusTrait: 'High Inquisitor',
      },
      {
        role: 'Court Jester',
        titleGen: () => `Chief Jester of the Court`,
        domain: 'diplomacy',
        ageRange: [22, 50],
        tier: 'Commoner',
        statusTrait: 'Court Jester',
      },
      {
        role: 'Dungeon Prisoner',
        titleGen: () => `Hostage of the High Oubliette`,
        ageRange: [22, 48],
        customMotto: 'Chains Do Not Bind the Soul',
        setup: (courtier, { monarch: m, prng: p }) => {
          courtier.rivalId = m.id;
          courtier.activeScheme = {
            type: 'Escape & Retribution',
            targetId: m.id,
            targetName: m.name,
            motive: 'Bribing jailors to escape the dungeon and lead a border uprising',
            progress: p.range(15, 60),
          };
        },
      },
      {
        role: 'Exiled Claimant',
        titleGen: () => `Pretender Claimant in Exile`,
        domain: 'intrigue',
        ageRange: [25, 45],
        customMotto: 'By Right of Ancient Blood',
        setup: (courtier, { monarch: m, prng: p }) => {
          courtier.activeScheme = {
            type: 'Fabricate Claim',
            targetId: m.id,
            targetName: m.name,
            motive: 'Presenting genealogical parchment scrolls to usurp ducal titles',
            progress: p.range(30, 70),
          };
        },
      },

      // Essential Commoners & Guilds
      {
        role: 'Master Artisan',
        titleGen: () => `Grandmaster of the Royal Forge`,
        domain: 'stewardship',
        ageRange: [32, 60],
        tier: 'Commoner',
        customHouseName: 'Guild of Armorers',
        customMotto: 'Iron Tempered by Fire and Blood',
        statusTrait: 'Master Craftsman',
        setup: (courtier) => {
          courtier.name = `${courtier.name.split(' ')[0]} the Master Smith`;
          courtier.baseStewardship = 16;
          courtier.baseMartial = 13;
        },
      },
      {
        role: 'Peasant Folk Hero',
        titleGen: (male) => (male ? `Tribune of the Common Folk` : `Maiden Champion of the Commons`),
        domain: 'martial',
        ageRange: [22, 44],
        tier: 'Commoner',
        customHouseName: 'The Common Folk',
        customMotto: 'Bread, Justice & Liberty for All',
        statusTrait: 'Champion of the Commons',
        setup: (courtier, { inquisitor: inq }) => {
          courtier.name = `${courtier.name.split(' ')[0]} of the Greenwood`;
          courtier.baseProwess = 19;
          courtier.baseMartial = 15;
          courtier.baseDiplomacy = 14;
          if (inq) {
            courtier.rivalId = inq.id;
            inq.rivalId = courtier.id;
          }
        },
      },
      {
        role: 'Captain of the Guard',
        titleGen: () => `High Captain of the City Watch`,
        domain: 'martial',
        ageRange: [28, 54],
        tier: 'Commoner',
        maleChance: 0.75,
        customHouseName: 'Citadel Watch',
        customMotto: 'Vigilant in the Dark',
        statusTrait: 'Watch Captain',
        setup: (courtier, { marshal: m }) => {
          courtier.name = `${courtier.name.split(' ')[0]} the Stalwart`;
          courtier.baseMartial = 16;
          courtier.baseProwess = 17;
          if (m) courtier.liegeId = m.id;
        },
      },
      {
        role: 'Hedge Knight',
        titleGen: () => `Knight Errant of the Marches`,
        domain: 'martial',
        ageRange: [21, 46],
        tier: 'Commoner',
        maleChance: 0.8,
        customHouseName: 'Order of the Wandering Lance',
        customMotto: 'Honor Knows No Fief',
        statusTrait: 'Knight Errant',
        setup: (courtier) => {
          courtier.name = `Ser ${courtier.name.split(' ')[0]} of the Red Marches`;
          courtier.baseProwess = 18;
        },
      },
      {
        role: 'Smuggler King',
        titleGen: () => `Factor of the Shadow Wharves`,
        domain: 'intrigue',
        ageRange: [26, 52],
        tier: 'Commoner',
        customHouseName: 'The Night Syndicate',
        customMotto: 'Tides Flow, Coin Follows',
        statusTrait: 'Shadow Factor',
        setup: (courtier, { inquisitor: inq }) => {
          courtier.name = `${courtier.name.split(' ')[0]} the Shadow Broker`;
          courtier.baseIntrigue = 17;
          if (inq) courtier.rivalId = inq.id;
        },
      },
      {
        role: 'Village Bailiff',
        titleGen: () => `High Bailiff of the Crown Granaries`,
        domain: 'stewardship',
        ageRange: [34, 62],
        tier: 'Commoner',
        customHouseName: 'The Crown Yeomanry',
        customMotto: 'By Honest Sweat & Fertile Furrows',
        statusTrait: 'High Reeve',
        setup: (courtier, { steward: s }) => {
          courtier.name = `${courtier.name.split(' ')[0]} the Reeve`;
          courtier.baseStewardship = 15;
          if (s) courtier.liegeId = s.id;
        },
      },
    ];

    // Registry to cross-link courtiers (e.g., Spymaster hooks on Steward)
    const courtRegistry: Partial<Record<CourtRole, Character>> = {
      Monarch: monarch,
      Consort: consort,
      'Crown Heir': heir,
      Heir: heir,
    };

    for (const bp of COURT_BLUEPRINTS) {
      const isMale = prng.next() < (bp.maleChance ?? 0.75);
      const hName =
        bp.customHouseName ||
        (bp.useRoyalHouse
          ? monarchHouse
          : nameRegistry.nextHouseName(realm.culture, new Set([monarchHouse.toLowerCase()])));
      const fName = nameRegistry.nextFirstName(
        realm.culture,
        isMale ? 'Male' : 'Female',
        hName
      );
      const motto = bp.customMotto || (bp.useRoyalHouse ? monarch.houseMotto : prng.pick(cultPreset.mottos));

      const courtier = generateStoryCharacter({
        id: `char_${charCounter++}`,
        name: `${fName} of House ${hName}`,
        houseName: hName,
        houseMotto: motto,
        title: bp.titleGen(isMale, realm.name),
        role: bp.role,
        gender: isMale ? 'male' : 'female',
        age: prng.range(bp.ageRange[0], bp.ageRange[1]),
        realmId: realm.id,
        liegeId: monarch.id,
        educationDomain: bp.domain,
        statusTrait: bp.statusTrait,
        prng,
      });

      if (bp.tier) {
        courtier.titleTier = getLowerTitleTier(monarchRank.titleTier, bp.tier);
      } else {
        courtier.titleTier = getLowerTitleTier(monarchRank.titleTier, 'Baron');
      }

      if (bp.setup) {
        bp.setup(courtier, {
          monarch,
          heir,
          consort,
          marshal: courtRegistry['Marshal'],
          steward: courtRegistry['Steward'],
          inquisitor: courtRegistry['High Inquisitor'],
          prng,
        });
      }

      if (
        bp.role === 'Child' ||
        bp.role === 'Cadet Prince' ||
        bp.role === 'Cadet Princess' ||
        bp.role === 'Royal Uncle' ||
        bp.role === 'Noble Scion' ||
        (bp.role === 'Court Noble' && bp.useRoyalHouse)
      ) {
        // Ruling family members share the House banner unless they form a cadet branch
        courtier.coatOfArms = monarch.coatOfArms ? cloneCoatOfArmsData(monarch.coatOfArms) : undefined;
        courtier.isNobleHouse = true;
        courtier.hasPersonalBanner = false;
      }

      if (bp.role === 'Royal Uncle' || (bp.role === 'Court Noble' && bp.useRoyalHouse)) {
        courtier.knownFatherId = royalFounder.id;
        royalFounder.children = royalFounder.children || [];
        if (!royalFounder.children.includes(courtier.id)) royalFounder.children.push(courtier.id);
      }

      if (bp.role === 'Child' || bp.role === 'Cadet Prince' || bp.role === 'Cadet Princess' || bp.role === 'Noble Scion') {
        courtier.knownFatherId = monarch.gender === 'male' ? monarch.id : consort.id;
        courtier.motherId = monarch.gender === 'female' ? monarch.id : consort.id;
        monarch.children = monarch.children || [];
        if (!monarch.children.includes(courtier.id)) monarch.children.push(courtier.id);
        consort.children = consort.children || [];
        if (!consort.children.includes(courtier.id)) consort.children.push(courtier.id);
      }

      courtRegistry[bp.role] = courtier;
      characters.push(courtier);
    }

    // ========================================================================
    // C. FEUDAL PARTITIONING (Separate, Contiguous Royal Crown Duchy + Non-Enclosing Grand Duchies)
    // ========================================================================
    const royalDuchyId = `duchy_${realm.id}_crown`;
    const royalDuchyName = monarchRank.isRoyalOrHigher
      ? `Royal Duchy of ${realmCleanName}`
      : realm.name;

    // Build real county-to-county border adjacency from DualMesh cell neighbors
    const countyAdj = new Map<number, Set<number>>();
    const countyTouchesEdgeOrCoast = new Map<number, boolean>();
    for (let i = 0; i < numCounties; i++) {
      countyAdj.set(i, new Set());
      countyTouchesEdgeOrCoast.set(i, false);
    }
    for (const c of realmCells) {
      const cA = countyMap.get(c.index);
      if (cA === undefined) continue;
      if (c.isCoast) countyTouchesEdgeOrCoast.set(cA, true);
      for (const nIdx of r_neighbors[c.index] || []) {
        const cB = countyMap.get(nIdx);
        if (cB === undefined) {
          // Borders another realm or sea -> outer perimeter of realm
          countyTouchesEdgeOrCoast.set(cA, true);
        } else if (cB !== cA) {
          countyAdj.get(cA)!.add(cB);
          countyAdj.get(cB)!.add(cA);
        }
      }
    }

    const allNonCapitalCounties = Array.from({ length: numCounties - 1 }, (_, i) => i + 1);
    // Score non-capital counties by land quality (rivers, coast, fertile plains, size) + proximity to capital
    const countyQualityScore = (cIdx: number) => {
      const cCells = realmCells.filter((c) => countyMap.get(c.index) === cIdx);
      const riverCount = cCells.filter((c) => c.isRiver).length;
      const coastCount = cCells.filter((c) => c.isCoast).length;
      const fertileCount = cCells.filter((c) => c.reliefType === 'plain' || c.reliefType === 'hill').length;
      const perimeterBonus = countyTouchesEdgeOrCoast.get(cIdx) ? 14 : 0;
      const dist = Math.hypot(countySeeds[cIdx].x - countySeeds[0].x, countySeeds[cIdx].y - countySeeds[0].y);
      return cCells.length * 1.4 + riverCount * 3.2 + coastCount * 2.8 + fertileCount * 1.1 + perimeterBonus - dist * 0.14;
    };

    const countyRoles: Record<
      number,
      | { role: 'crown' }
      | { role: 'crown_demesne' }
      | { role: 'heir_county' }
      | { role: 'ducal_seat'; duchyIdx: number }
      | { role: 'vassal_county'; duchyIdx: number }
      | { role: 'direct_county' }
    > = {
      0: { role: 'crown' },
    };

    const reservedRoyalSet = new Set<number>([0]);

    // Pick Royal Duchy companion counties STRICTLY from counties bordering the Royal Duchy
    // so the Royal Duchy is always a single contiguous, separate heartland (never scattered or embedded).
    const pickBestAdjacentRoyalCounty = (): number | null => {
      const borderCandidates = new Set<number>();
      for (const rc of reservedRoyalSet) {
        for (const nb of countyAdj.get(rc) || []) {
          if (!reservedRoyalSet.has(nb)) borderCandidates.add(nb);
        }
      }
      const pool =
        borderCandidates.size > 0
          ? Array.from(borderCandidates)
          : allNonCapitalCounties.filter((c) => !reservedRoyalSet.has(c));
      if (pool.length === 0) return null;
      pool.sort((a, b) => countyQualityScore(b) - countyQualityScore(a));
      return pool[0];
    };

    if (allNonCapitalCounties.length >= 2) {
      const heirCountyIdx = pickBestAdjacentRoyalCounty();
      if (heirCountyIdx !== null) {
        countyRoles[heirCountyIdx] = { role: 'heir_county' };
        reservedRoyalSet.add(heirCountyIdx);
      }
    }
    if (allNonCapitalCounties.length >= 9) {
      const crownDemesneIdx = pickBestAdjacentRoyalCounty();
      if (crownDemesneIdx !== null) {
        countyRoles[crownDemesneIdx] = { role: 'crown_demesne' };
        reservedRoyalSet.add(crownDemesneIdx);
      }
    }

    const vassalNonCapitalCounties = allNonCapitalCounties.filter((cIdx) => !reservedRoyalSet.has(cIdx));

    // Compute Royal Duchy centroid so Grand Duchies are partitioned in separate sectors around it
    let royalCx = 0;
    let royalCy = 0;
    for (const rc of reservedRoyalSet) {
      royalCx += countySeeds[rc].x;
      royalCy += countySeeds[rc].y;
    }
    royalCx /= Math.max(1, reservedRoyalSet.size);
    royalCy /= Math.max(1, reservedRoyalSet.size);

    // Only Kingdoms/Empires create subordinate Grand Duchies; Sovereign Duchies, Counties, Tribes & City-States rule Counties directly
    const effectiveNumDuchies =
      !monarchRank.isRoyalOrHigher || vassalNonCapitalCounties.length === 0
        ? 0
        : vassalNonCapitalCounties.length === 1
        ? 1
        : Math.min(
            vassalNonCapitalCounties.length,
            Math.max(2, numDuchies)
          );

    const duchyBuckets: number[][] = Array.from({ length: effectiveNumDuchies }, () => []);

    if (effectiveNumDuchies > 0 && vassalNonCapitalCounties.length > 0) {
      // Partition vassal counties into strictly non-overlapping angular sectors around the Royal Duchy
      // starting from the largest angular gap (e.g., coast or outer frontier), so NO Grand Duchy can
      // wrap around or embed the Royal Duchy.
      const withAngles = vassalNonCapitalCounties
        .map((cIdx) => ({
          cIdx,
          angle: Math.atan2(countySeeds[cIdx].y - royalCy, countySeeds[cIdx].x - royalCx),
        }))
        .sort((a, b) => a.angle - b.angle);

      let startOffset = 0;
      let largestGap = -1;
      for (let i = 0; i < withAngles.length; i++) {
        const nextIdx = (i + 1) % withAngles.length;
        const gap =
          nextIdx === 0
            ? withAngles[0].angle + Math.PI * 2 - withAngles[withAngles.length - 1].angle
            : withAngles[nextIdx].angle - withAngles[i].angle;
        if (gap > largestGap) {
          largestGap = gap;
          startOffset = nextIdx;
        }
      }

      const orderedVassals = [
        ...withAngles.slice(startOffset),
        ...withAngles.slice(0, startOffset),
      ].map((entry) => entry.cIdx);

      // Divide the ordered angular ring into effectiveNumDuchies contiguous sectors
      const baseSize = Math.floor(orderedVassals.length / effectiveNumDuchies);
      const remainder = orderedVassals.length % effectiveNumDuchies;
      let cursor = 0;
      for (let d = 0; d < effectiveNumDuchies; d++) {
        const take = baseSize + (d < remainder ? 1 : 0);
        const slice = orderedVassals.slice(cursor, cursor + take);
        cursor += take;
        if (slice.length === 0) continue;

        // Pick the richest/largest county in this sector as the Grand Duchy seat (index 0)
        slice.sort((a, b) => countyQualityScore(b) - countyQualityScore(a));
        duchyBuckets[d].push(...slice);
      }
    }

    if (effectiveNumDuchies === 0) {
      for (const cIndex of vassalNonCapitalCounties) {
        countyRoles[cIndex] = { role: 'direct_county' };
      }
    } else {
      duchyBuckets.forEach((bucket, dIdx) => {
        bucket.forEach((cIndex, pos) => {
          if (pos === 0) {
            countyRoles[cIndex] = { role: 'ducal_seat', duchyIdx: dIdx };
          } else {
            countyRoles[cIndex] = { role: 'vassal_county', duchyIdx: dIdx };
          }
        });
      });
    }

    const createdDukes: (Character | undefined)[] = [];
    const duchyMeta: { id: string; name: string }[] = [];

    for (let dIdx = 0; dIdx < effectiveNumDuchies; dIdx++) {
      const dukeMale = prng.next() < 0.82;
      const dukeHouse = nameRegistry.nextHouseName(realm.culture, new Set([monarchHouse.toLowerCase()]));
      const dukeName = nameRegistry.nextFirstName(
        realm.culture,
        dukeMale ? 'Male' : 'Female',
        dukeHouse
      );

      const duke = generateStoryCharacter({
        id: `char_${charCounter++}`,
        name: `${dukeName} of House ${dukeHouse}`,
        houseName: dukeHouse,
        houseMotto: prng.pick(cultPreset.mottos),
        title: dukeMale ? `Duke of the Marches` : `Duchess of the Marches`,
        role: 'Vassal Duke',
        gender: dukeMale ? 'male' : 'female',
        age: prng.range(28, 62),
        realmId: realm.id,
        liegeId: monarch.id,
        educationDomain: 'martial',
        prng,
      });
      duke.titleTier = getLowerTitleTier(monarchRank.titleTier, 'Duke');
      duke.vassalIds = [];
      duke.coatOfArms = resolveUniqueHouseArms(dukeHouse, `duke_${realm.id}_${dukeHouse}_${settings.seed}`);
      createdDukes[dIdx] = duke;
      duchyMeta[dIdx] = { id: `duchy_${realm.id}_${dIdx + 1}`, name: `Duchy of ${dukeHouse}` };

      // Seed 3-generation pedigree for each beginning Ducal House (Grandparent -> Late Parent -> Duke)
      const ducalGpName = nameRegistry.nextFirstName(realm.culture, 'Male', dukeHouse);
      const ducalGpDeath = 1042 - duke.age - prng.range(16, 30);
      const ducalGpBirth = ducalGpDeath - prng.range(54, 74);
      const ducalGrandparent: Character = generateStoryCharacter({
        id: `char_anc_${charCounter++}`,
        name: `${ducalGpName} the Elder of House ${dukeHouse}`,
        houseName: dukeHouse,
        houseMotto: duke.houseMotto,
        title: `Elder Duke of ${dukeHouse}`,
        role: 'Vassal Duke',
        gender: 'male',
        age: ducalGpDeath - ducalGpBirth,
        realmId: realm.id,
        prng,
      });
      ducalGrandparent.isAlive = false;
      ducalGrandparent.treasury = 0;
      ducalGrandparent.titleTier = 'Duke';
      ducalGrandparent.birthYear = ducalGpBirth;
      ducalGrandparent.deathYear = ducalGpDeath;
      const gpDeath = pickContextualDeathCause(ducalGrandparent, 'natural', () => prng.next());
      ducalGrandparent.causeOfDeath = gpDeath.cause;
      ducalGrandparent.deathCategory = gpDeath.category;
      ducalGrandparent.prestige = prng.range(280, 520);
      ducalGrandparent.isNobleHouse = true;

      const ducalAncName = nameRegistry.nextFirstName(realm.culture, 'Male', dukeHouse);
      const ducalAncDeath = 1042 - prng.range(10, Math.max(12, Math.min(24, duke.age - 14)));
      const ducalAncBirth = ducalAncDeath - prng.range(52, 74);
      const ducalAncestor: Character = generateStoryCharacter({
        id: `char_anc_${charCounter++}`,
        name: `${ducalAncName} of House ${dukeHouse}`,
        houseName: dukeHouse,
        houseMotto: duke.houseMotto,
        title: `Late Duke of ${dukeHouse}`,
        role: 'Vassal Duke',
        gender: 'male',
        age: ducalAncDeath - ducalAncBirth,
        realmId: realm.id,
        prng,
      });
      ducalAncestor.isAlive = false;
      ducalAncestor.treasury = 0;
      ducalAncestor.titleTier = 'Duke';
      ducalAncestor.birthYear = ducalAncBirth;
      ducalAncestor.deathYear = ducalAncDeath;
      const ducalCtx = prng.pick(['natural', 'disease', 'war', 'accident'] as const);
      const ducalDeath = pickContextualDeathCause(ducalAncestor, ducalCtx, () => prng.next());
      ducalAncestor.causeOfDeath = ducalDeath.cause;
      ducalAncestor.deathCategory = ducalDeath.category;
      ducalAncestor.prestige = prng.range(240, 480);
      ducalAncestor.isNobleHouse = true;
      ducalAncestor.knownFatherId = ducalGrandparent.id;
      ducalGrandparent.children = [ducalAncestor.id];
      ducalAncestor.children = [duke.id];
      duke.knownFatherId = ducalAncestor.id;

      characters.push(ducalGrandparent, ducalAncestor, duke);
      monarch.vassalIds = monarch.vassalIds || [];
      monarch.vassalIds.push(duke.id);
    }

    for (let cIdx = 0; cIdx < numCounties; cIdx++) {
      const cCells = realmCells.filter((c) => countyMap.get(c.index) === cIdx);
      if (cCells.length === 0) continue;
      const countyId = `county_${countyCounter++}`;
      const isCapital = cIdx === 0;
      const roleInfo = countyRoles[cIdx] || { role: 'crown' };

      let bestCandidate = cCells[0];
      let bestSite = evaluateSettlementSite(bestCandidate.index, mesh, sim, settings.terrainSim.seaLevel);
      let bestAdjustedScore = -Infinity;

      // Enforce strong separation from all already-placed settlements (especially major cities)
      for (const cell of cCells) {
        const site = evaluateSettlementSite(cell.index, mesh, sim, settings.terrainSim.seaLevel);
        let minDist = Infinity;
        for (const existing of burgs) {
          const d = Math.hypot(cell.x - existing.x, cell.y - existing.y);
          if (d < minDist) minDist = d;
        }
        const spacingPenalty =
          minDist < 34 ? -5000 + minDist * 60 :
          minDist < 54 ? -450 + minDist * 6 :
          0;
        const adj = (site?.score ?? 0) + spacingPenalty;
        if (adj > bestAdjustedScore) {
          bestAdjustedScore = adj;
          bestCandidate = cell;
          bestSite = site;
        }
      }

      const burgCell = bestCandidate;
      let nearestMajorDist = Infinity;
      for (const existing of burgs) {
        if (existing.isCapital || existing.type === 'Royal Metropolis' || existing.type === 'Trade Port') {
          const d = Math.hypot(burgCell.x - existing.x, burgCell.y - existing.y);
          if (d < nearestMajorDist) nearestMajorDist = d;
        }
      }

      const burgId = `burg_${burgCounter++}`;
      const burgSiteHint = burgCell.isCoast
        ? 'coastal'
        : burgCell.reliefType === 'mountain' || burgCell.elevation > 0.55
        ? 'mountain'
        : burgCell.reliefType === 'forest'
        ? 'forest'
        : 'inland';
      const burgName = nameRegistry.nextBurgName(realm.culture, burgSiteHint);

      const settlementSite = bestSite?.siteType || (burgCell.isCoast ? 'Estuary Harbor' : 'Crossroads');
      let burgType: Burg['type'] = isCapital
        ? 'Capital Citadel'
        : roleInfo.role === 'ducal_seat'
        ? (burgCell.isCoast ? 'Trade Port' : burgCell.reliefType === 'mountain' ? 'Border Fortress' : 'Royal Metropolis')
        : bestSite?.suggestedType || (burgCell.isCoast ? 'Trade Port' : burgCell.reliefType === 'mountain' ? 'Border Fortress' : 'Market Town');

      // Prevent major hubs from clustering right beside Capitals / Metropolises
      if (!isCapital && nearestMajorDist < 56 && (burgType === 'Royal Metropolis' || burgType === 'Trade Port')) {
        burgType = burgCell.isCoast ? 'Fishing Port' : 'Market Town';
      }

      const siteMultiplier = settlementSite === 'Estuary Harbor' ? 1.35 : settlementSite === 'River Confluence' ? 1.25 : 1.0;
      const population = Math.round(
        (isCapital
          ? prng.range(38000, 68000)
          : burgType === 'Royal Metropolis'
          ? prng.range(18000, 34000)
          : burgType === 'Trade Port'
          ? prng.range(11000, 22000)
          : prng.range(5500, 12000)) * siteMultiplier
      );

      const exports = deriveBurgExports(burgType, settlementSite, burgCell, prng);
      const imports = deriveBurgImports(exports, burgCell, burgType);
      const garrisonCount = deriveBurgGarrison(burgType, population);
      const devLevel = isCapital
        ? prng.range(68, 92)
        : roleInfo.role === 'heir_county' || roleInfo.role === 'crown_demesne'
        ? prng.range(54, 78)
        : roleInfo.role === 'ducal_seat'
        ? prng.range(48, 72)
        : prng.range(30, 62);

      const burg: Burg = {
        id: burgId,
        name: burgName,
        x: burgCell.x,
        y: burgCell.y,
        population,
        stateId: realm.id,
        countyId,
        isCapital,
        type: burgType,
        tradeGood: canonicalizeTradeGood(exports[0] || bestSite?.tradeGoodSuggestion || prng.pick(TRADE_GOODS)),
        culture: realm.culture,
        settlementSite,
        lore: `Seat of ${isCapital ? 'imperial dominion' : roleInfo.role === 'ducal_seat' ? 'ducal governance' : 'feudal governance'} founded at a natural ${settlementSite.toLowerCase()} commanding regional trade roads and waterways.`,
        developmentLevel: devLevel,
        buildings: ['slot_keep_1', 'slot_walls_1', 'slot_guildhall_1', 'slot_mill_1'],
        exports,
        imports,
        importFulfillment: prng.range(75, 96),
        garrisonCount,
        garrisonMax: Math.round(garrisonCount * 1.35),
        garrisonUpkeepGold: Math.round(garrisonCount * 0.005 * 10) / 10,
        garrisonUpkeepFood: Math.round(garrisonCount * 0.006 * 10) / 10,
        levyPool: Math.round(
          population *
            (isCapital
              ? 0.058
              : roleInfo.role === 'crown_demesne'
              ? 0.048
              : roleInfo.role === 'heir_county'
              ? 0.045
              : 0.042)
        ),
        leviesRaised: false,
        cellIndex: burgCell.index,
      };
      burgs.push(burg);

      if (isCapital) realm.capitalBurgId = burgId;

      for (const c of cCells) {
        c.countyId = countyId;
      }

      let vassalId = monarch.id;
      let countyFiefName = `County of ${burgName}`;
      let countyTier: 'Duchy' | 'County' = 'County';
      let countyDuchyId: string | undefined;
      let countyDuchyName: string | undefined;
      let countyRulerChar: Character = monarch;

      if (roleInfo.role === 'crown') {
        monarch.countyId = countyId;
        monarch.titleTier = monarchRank.titleTier;
        const sovereignStyle = `${monarchRank.rankTitle} of ${realmCleanName}`;
        if (monarchRank.isRoyalOrHigher) {
          const ducalStyle = monarch.gender === 'female' ? `Duchess of ${burgName}` : `Duke of ${burgName}`;
          monarch.title = `${sovereignStyle} & ${ducalStyle}`;
        } else {
          monarch.title = sovereignStyle;
        }
        burg.ownerId = monarch.id;
        burg.rulerTitle = monarch.title;
        vassalId = monarch.id;
        countyRulerChar = monarch;
        countyTier = monarchRank.titleTier === 'Count' ? 'County' : 'Duchy';
        countyDuchyId = monarchRank.isRoyalOrHigher ? royalDuchyId : undefined;
        countyDuchyName = monarchRank.isRoyalOrHigher ? `Royal Duchy of ${burgName}` : realm.name;
        countyFiefName = monarchRank.isRoyalOrHigher
          ? `Royal Duchy of ${burgName}`
          : monarchRank.titleTier === 'Duke'
          ? `Ducal Seat of ${burgName}`
          : `Seat of ${burgName}`;
      } else if (roleInfo.role === 'crown_demesne') {
        burg.ownerId = monarch.id;
        burg.rulerTitle = monarch.title;
        vassalId = monarch.id;
        countyRulerChar = monarch;
        countyTier = 'County';
        countyDuchyId = royalDuchyId;
        countyDuchyName = royalDuchyName;
        countyFiefName = `Crown County of ${burgName}`;
      } else if (roleInfo.role === 'heir_county') {
        const heirFiefStyle = getHeirStyleForRealm(realm, monarchRank.titleTier, heir.gender, burgName);
        heir.countyId = countyId;
        heir.titleTier = heirFiefStyle.titleTier;
        heir.liegeId = monarch.id;
        heir.title = heirFiefStyle.title;
        heir.hasPersonalBanner = true;
        monarch.vassalIds = monarch.vassalIds || [];
        if (!monarch.vassalIds.includes(heir.id)) monarch.vassalIds.push(heir.id);
        burg.ownerId = heir.id;
        burg.rulerTitle = heir.title;
        vassalId = heir.id;
        countyRulerChar = heir;
        countyTier = 'County';
        countyDuchyId = monarchRank.isRoyalOrHigher ? royalDuchyId : undefined;
        countyDuchyName = monarchRank.isRoyalOrHigher ? royalDuchyName : realm.name;
        countyFiefName = heirFiefStyle.fiefName || `Appanage County of ${burgName}`;
      } else if (roleInfo.role === 'ducal_seat') {
        const duke = createdDukes[roleInfo.duchyIdx] || createdDukes[0]!;
        duke.countyId = countyId;
        duke.title = duke.gender === 'female' ? `Duchess of ${burgName}` : `Duke of ${burgName}`;
        burg.ownerId = duke.id;
        burg.rulerTitle = duke.title;
        vassalId = duke.id;
        countyRulerChar = duke;
        countyTier = 'Duchy';
        countyFiefName = `Duchy of ${burgName}`;
        if (duchyMeta[roleInfo.duchyIdx]) {
          duchyMeta[roleInfo.duchyIdx].name = countyFiefName;
          countyDuchyId = duchyMeta[roleInfo.duchyIdx].id;
          countyDuchyName = countyFiefName;
        }
      } else {
        const hasDuchy = roleInfo.role === 'vassal_county' && createdDukes[roleInfo.duchyIdx];
        const ducalLiege = hasDuchy ? createdDukes[roleInfo.duchyIdx]! : monarch;
        if (hasDuchy && duchyMeta[roleInfo.duchyIdx]) {
          countyDuchyId = duchyMeta[roleInfo.duchyIdx].id;
          countyDuchyName = duchyMeta[roleInfo.duchyIdx].name;
        }
        const countMale = prng.next() < 0.82;
        const countHouse = nameRegistry.nextHouseName(realm.culture, new Set([monarchHouse.toLowerCase()]));
        const countName = nameRegistry.nextFirstName(
          realm.culture,
          countMale ? 'Male' : 'Female',
          countHouse
        );
        const useEarlStyle = prng.next() < 0.48;
        const liegeTier: TitleTier = ducalLiege.titleTier || monarchRank.titleTier;
        const countyVassalStyle = getSubordinateVassalStyle(
          realm,
          liegeTier,
          countMale ? 'male' : 'female',
          burgName,
          'county_fief',
          useEarlStyle
        );

        const count = generateStoryCharacter({
          id: `char_${charCounter++}`,
          name: `${countName} of House ${countHouse}`,
          houseName: countHouse,
          houseMotto: prng.pick(cultPreset.mottos),
          title: countyVassalStyle.title,
          role: countyVassalStyle.role,
          gender: countMale ? 'male' : 'female',
          age: prng.range(26, 62),
          realmId: realm.id,
          countyId,
          liegeId: ducalLiege.id,
          educationDomain: prng.next() > 0.5 ? 'stewardship' : 'martial',
          prng,
        });
        count.titleTier = countyVassalStyle.titleTier;
        count.isNobleHouse = countyVassalStyle.isNobleHouse;
        count.vassalIds = [];

        // Seed 3-generation pedigree for each County Vassal (Grandparent -> Late Parent -> Vassal)
        const cntGpName = nameRegistry.nextFirstName(realm.culture, 'Male', countHouse);
        const cntGpDeath = 1042 - count.age - prng.range(15, 28);
        const cntGpBirth = cntGpDeath - prng.range(52, 72);
        const cntGpStyle = getSubordinateVassalStyle(realm, liegeTier, 'male', burgName, 'county_fief', useEarlStyle);
        const cntGrandparent = generateStoryCharacter({
          id: `char_anc_${charCounter++}`,
          name: `${cntGpName} the Elder of House ${countHouse}`,
          houseName: countHouse,
          houseMotto: count.houseMotto,
          title: `Elder ${cntGpStyle.rankLabel} of ${burgName}`,
          role: cntGpStyle.role,
          gender: 'male',
          age: cntGpDeath - cntGpBirth,
          realmId: realm.id,
          countyId,
          prng,
        });
        cntGrandparent.isAlive = false;
        cntGrandparent.treasury = 0;
        cntGrandparent.titleTier = cntGpStyle.titleTier;
        cntGrandparent.birthYear = cntGpBirth;
        cntGrandparent.deathYear = cntGpDeath;
        const cntGpCause = pickContextualDeathCause(cntGrandparent, 'natural', () => prng.next());
        cntGrandparent.causeOfDeath = cntGpCause.cause;
        cntGrandparent.deathCategory = cntGpCause.category;
        cntGrandparent.isNobleHouse = cntGpStyle.isNobleHouse;

        const cntParentName = nameRegistry.nextFirstName(realm.culture, 'Male', countHouse);
        const cntParentDeath = 1042 - prng.range(8, Math.max(10, Math.min(22, count.age - 14)));
        const cntParentBirth = cntParentDeath - prng.range(50, 70);
        const cntLateParent = generateStoryCharacter({
          id: `char_anc_${charCounter++}`,
          name: `${cntParentName} of House ${countHouse}`,
          houseName: countHouse,
          houseMotto: count.houseMotto,
          title: `Late ${cntGpStyle.rankLabel} of ${burgName}`,
          role: cntGpStyle.role,
          gender: 'male',
          age: cntParentDeath - cntParentBirth,
          realmId: realm.id,
          countyId,
          prng,
        });
        cntLateParent.isAlive = false;
        cntLateParent.treasury = 0;
        cntLateParent.titleTier = cntGpStyle.titleTier;
        cntLateParent.birthYear = cntParentBirth;
        cntLateParent.deathYear = cntParentDeath;
        const cntPCause = pickContextualDeathCause(cntLateParent, prng.pick(['natural', 'disease', 'war'] as const), () => prng.next());
        cntLateParent.causeOfDeath = cntPCause.cause;
        cntLateParent.deathCategory = cntPCause.category;
        cntLateParent.isNobleHouse = cntGpStyle.isNobleHouse;
        cntLateParent.knownFatherId = cntGrandparent.id;
        cntGrandparent.children = [cntLateParent.id];
        cntLateParent.children = [count.id];
        count.knownFatherId = cntLateParent.id;

        characters.push(cntGrandparent, cntLateParent, count);

        ducalLiege.vassalIds = ducalLiege.vassalIds || [];
        ducalLiege.vassalIds.push(count.id);

        burg.ownerId = count.id;
        burg.rulerTitle = count.title;
        vassalId = count.id;
        countyRulerChar = count;
        countyTier = 'County';
        countyFiefName = countyVassalStyle.fiefName;
      }

      // Subordinate Baronies, Rural Villages & Market Towns (spaced strictly to prevent overlap)
      const candidateSubCells = cCells.filter((c) => c.index !== burgCell.index);
      const numSubBaronies = Math.min(
        5,
        Math.max(
          1,
          candidateSubCells.length >= 16
            ? 5
            : candidateSubCells.length >= 11
            ? 4
            : candidateSubCells.length >= 7
            ? 3
            : candidateSubCells.length >= 4
            ? 2
            : 1
        )
      );

      const scoredCandidates = candidateSubCells.map((cell) => {
        const distToCap = Math.hypot(cell.x - burgCell.x, cell.y - burgCell.y);
        let geoScore = 1.0;
        if (cell.isRiver) geoScore += 3.0;
        if (cell.isCoast) geoScore += 3.2;
        if (cell.reliefType === 'mountain' || cell.elevation > 0.55) geoScore += 1.6;
        if (cell.reliefType === 'forest') geoScore += 1.5;
        return { cell, distToCap, score: geoScore + distToCap * 0.08 };
      });
      scoredCandidates.sort((a, b) => b.score - a.score);

      const chosenBaronyCells: WorldCell[] = [];
      for (const cand of scoredCandidates) {
        if (chosenBaronyCells.length >= numSubBaronies) break;
        const tooCloseToExisting = burgs.some(
          (eb) => Math.hypot(cand.cell.x - eb.x, cand.cell.y - eb.y) < 26
        );
        const tooCloseToSiblings = chosenBaronyCells.some(
          (sc) => Math.hypot(cand.cell.x - sc.x, cand.cell.y - sc.y) < 24
        );
        if (!tooCloseToExisting && !tooCloseToSiblings) {
          chosenBaronyCells.push(cand.cell);
        }
      }

      // Ensure non-tiny counties always have at least 1 Baron/Mayor/Portmaster/Guildmaster vassal
      if (chosenBaronyCells.length === 0 && scoredCandidates.length > 0 && cCells.length > 2) {
        chosenBaronyCells.push(scoredCandidates[0].cell);
      }

      const baronyBurgIds: string[] = [burgId];

      for (const subCell of chosenBaronyCells) {
        const subBurgId = `burg_${burgCounter++}`;
        const subSiteHint = subCell.isCoast
          ? 'coastal'
          : subCell.reliefType === 'mountain' || subCell.elevation > 0.55
          ? 'mountain'
          : subCell.reliefType === 'forest'
          ? 'forest'
          : 'inland';
        const subBurgName = nameRegistry.nextBurgName(realm.culture, subSiteHint);

        let subSiteType: Burg['settlementSite'] = 'Fertile Basin';
        let subBurgType: Burg['type'] = 'Farming Village';

        if (subCell.isCoast) {
          subSiteType = 'Estuary Harbor';
          subBurgType = prng.next() > 0.45 ? 'Fishing Port' : 'Trade Port';
        } else if (subCell.isRiver) {
          subSiteType = 'River Confluence';
          subBurgType = prng.next() > 0.42 ? 'Market Town' : 'Farming Village';
        } else if (subCell.reliefType === 'mountain' || subCell.elevation > 0.55) {
          subSiteType = 'Mountain Pass';
          subBurgType = prng.next() > 0.4 ? 'Border Fortress' : 'Farming Village';
        } else {
          subSiteType = 'Fertile Basin';
          const roll = prng.next();
          subBurgType = roll < 0.58 ? 'Farming Village' : roll < 0.86 ? 'Market Town' : 'Ancient Sanctuary';
        }

        const subPop = Math.round(
          subBurgType === 'Market Town' ? prng.range(2600, 6400) : prng.range(1100, 4200)
        );
        const subExports = deriveBurgExports(subBurgType, subSiteType, subCell, prng);
        const subImports = deriveBurgImports(subExports, subCell, subBurgType);
        const subGarrison = deriveBurgGarrison(subBurgType, subPop);
        const subDev = prng.range(22, 60);

        const isPort = subBurgType.includes('Port');
        const isMarket = subBurgType.includes('Market');
        const isCommercial = isPort || isMarket;
        const nobleMale = prng.next() < 0.82;
        const nobleHouse = nameRegistry.nextHouseName(realm.culture, new Set([monarchHouse.toLowerCase()]));
        const nobleName = nameRegistry.nextFirstName(
          realm.culture,
          nobleMale ? 'Male' : 'Female',
          nobleHouse
        );

        const countyLiegeTier: TitleTier = countyRulerChar.titleTier || monarchRank.titleTier;
        const subKind: 'port' | 'market' | 'barony' = isPort ? 'port' : isMarket ? 'market' : 'barony';
        const subStyle = getSubordinateVassalStyle(
          realm,
          countyLiegeTier,
          nobleMale ? 'male' : 'female',
          subBurgName,
          subKind,
          prng.next() < 0.62
        );
        const subTitle = subStyle.title;
        const subRole = subStyle.role;
        const subTier = subStyle.titleTier;

        const subBaron = generateStoryCharacter({
          id: `char_${charCounter++}`,
          name: `${nobleName} of House ${nobleHouse}`,
          houseName: nobleHouse,
          houseMotto: prng.pick(cultPreset.mottos),
          title: subTitle,
          role: subRole,
          gender: nobleMale ? 'male' : 'female',
          age: prng.range(22, 58),
          realmId: realm.id,
          countyId,
          liegeId: vassalId,
          educationDomain: isCommercial ? 'stewardship' : 'martial',
          prng,
        });

        subBaron.titleTier = subTier;
        subBaron.isNobleHouse = subTier === 'Baron' || (!isCommercial && subTier !== 'Commoner') || prng.next() < 0.55;
        if (!subBaron.isNobleHouse) {
          subBaron.name = `${nobleName} of Guildhouse ${nobleHouse}`;
          subBaron.houseName = `Guildhouse ${nobleHouse}`;
          subBaron.coatOfArms = undefined;
        }
        subBaron.hasPersonalBanner = subTier === 'Baron';
        subBaron.vassalIds = [];

        // Seed 3-generation pedigree for Barons & Mayors (Grandparent -> Late Parent -> Baron/Mayor)
        const subAncHouseDisplay = subBaron.isNobleHouse ? `of House ${nobleHouse}` : `of Guildhouse ${nobleHouse}`;
        const subGpName = nameRegistry.nextFirstName(realm.culture, 'Male', nobleHouse);
        const subGpDeath = 1042 - subBaron.age - prng.range(15, 28);
        const subGpBirth = subGpDeath - prng.range(52, 70);
        const subGrandparent = generateStoryCharacter({
          id: `char_anc_${charCounter++}`,
          name: `${subGpName} ${subAncHouseDisplay}`,
          houseName: subBaron.houseName,
          houseMotto: subBaron.houseMotto,
          title: `Elder ${subStyle.rankLabel} of ${subBurgName}`,
          role: subRole,
          gender: 'male',
          age: subGpDeath - subGpBirth,
          realmId: realm.id,
          countyId,
          prng,
        });
        subGrandparent.isAlive = false;
        subGrandparent.treasury = 0;
        subGrandparent.titleTier = subTier;
        subGrandparent.birthYear = subGpBirth;
        subGrandparent.deathYear = subGpDeath;
        const subGpCause = pickContextualDeathCause(subGrandparent, 'natural', () => prng.next());
        subGrandparent.causeOfDeath = subGpCause.cause;
        subGrandparent.deathCategory = subGpCause.category;
        subGrandparent.isNobleHouse = subBaron.isNobleHouse;
        if (!subGrandparent.isNobleHouse) subGrandparent.coatOfArms = undefined;

        const subParentName = nameRegistry.nextFirstName(realm.culture, 'Male', nobleHouse);
        const subParentDeath = 1042 - prng.range(8, Math.max(10, Math.min(20, subBaron.age - 14)));
        const subParentBirth = subParentDeath - prng.range(48, 68);
        const subLateParent = generateStoryCharacter({
          id: `char_anc_${charCounter++}`,
          name: `${subParentName} ${subAncHouseDisplay}`,
          houseName: subBaron.houseName,
          houseMotto: subBaron.houseMotto,
          title: `Late ${subStyle.rankLabel} of ${subBurgName}`,
          role: subRole,
          gender: 'male',
          age: subParentDeath - subParentBirth,
          realmId: realm.id,
          countyId,
          prng,
        });
        subLateParent.isAlive = false;
        subLateParent.treasury = 0;
        subLateParent.titleTier = subTier;
        subLateParent.birthYear = subParentBirth;
        subLateParent.deathYear = subParentDeath;
        const subPCause = pickContextualDeathCause(subLateParent, prng.pick(['natural', 'disease', 'accident'] as const), () => prng.next());
        subLateParent.causeOfDeath = subPCause.cause;
        subLateParent.deathCategory = subPCause.category;
        subLateParent.isNobleHouse = subBaron.isNobleHouse;
        if (!subLateParent.isNobleHouse) subLateParent.coatOfArms = undefined;
        subLateParent.knownFatherId = subGrandparent.id;
        subGrandparent.children = [subLateParent.id];
        subLateParent.children = [subBaron.id];
        subBaron.knownFatherId = subLateParent.id;

        characters.push(subGrandparent, subLateParent, subBaron);

        countyRulerChar.vassalIds = countyRulerChar.vassalIds || [];
        countyRulerChar.vassalIds.push(subBaron.id);

        const subBurg: Burg = {
          id: subBurgId,
          name: subBurgName,
          x: subCell.x,
          y: subCell.y,
          population: subPop,
          stateId: realm.id,
          countyId,
          isCapital: false,
          type: subBurgType,
          tradeGood: canonicalizeTradeGood(subExports[0] || prng.pick(TRADE_GOODS)),
          culture: realm.culture,
          settlementSite: subSiteType,
          lore: `Feudal barony and rural fief nestled in the ${subSiteType.toLowerCase()} of ${subBurgName}, sworn in fealty to ${countyRulerChar.name}.`,
          developmentLevel: subDev,
          buildings: ['slot_keep_1', 'slot_walls_1'],
          exports: subExports,
          imports: subImports,
          importFulfillment: prng.range(70, 92),
          garrisonCount: subGarrison,
          garrisonMax: Math.round(subGarrison * 1.3),
          garrisonUpkeepGold: Math.round(subGarrison * 0.005 * 10) / 10,
          garrisonUpkeepFood: Math.round(subGarrison * 0.006 * 10) / 10,
          levyPool: Math.round(subPop * 0.038),
          leviesRaised: false,
          cellIndex: subCell.index,
          ownerId: subBaron.id,
          rulerTitle: subBaron.title,
        };

        burgs.push(subBurg);
        baronyBurgIds.push(subBurgId);
      }

      counties.push({
        id: countyId,
        name: countyFiefName,
        realmId: realm.id,
        rulerId: vassalId,
        capitalBurgId: burgId,
        cellIndices: cCells.map((c) => c.index),
        development: devLevel,
        tradition: `Feudal fiefdom bound by ancient chivalric oaths to ${realm.name}`,
        tier: countyTier,
        duchyId: countyDuchyId,
        duchyName: countyDuchyName,
        baronyBurgIds,
        coatOfArms: countyRulerChar.coatOfArms ? cloneCoatOfArmsData(countyRulerChar.coatOfArms) : undefined,
      });
      realm.countyIds.push(countyId);
    }
  }

  // Final heraldry uniqueness & consistency pass across all noble houses and counties
  for (const ch of characters) {
    if (ch.isNobleHouse !== false && ch.houseName && !ch.houseName.startsWith('Guildhouse ')) {
      ch.coatOfArms = resolveUniqueHouseArms(
        ch.houseName,
        `house_${ch.realmId}_${ch.houseName}_${settings.seed}`,
        ch.role === 'Monarch'
      );
    }
  }
  for (const cty of counties) {
    const rulerChar = characters.find((ch) => ch.id === cty.rulerId);
    if (rulerChar?.coatOfArms) {
      cty.coatOfArms = cloneCoatOfArmsData(rulerChar.coatOfArms);
    }
  }

  // Set Holy Sites (prioritizing Ancient Sanctuaries or capitals belonging to faithful realms)
  const usedHolySiteIds = new Set<string>();
  religions.forEach((rel, i) => {
    const faithfulRealms = new Set(realms.filter((r) => r.religion === rel.name).map((r) => r.id));
    const candidates = burgs.filter((b) => !usedHolySiteIds.has(b.id));
    const preferred =
      candidates.find((b) => faithfulRealms.has(b.stateId) && b.type === 'Ancient Sanctuary') ||
      candidates.find((b) => b.type === 'Ancient Sanctuary') ||
      candidates.find((b) => faithfulRealms.has(b.stateId) && b.isCapital) ||
      candidates.find((b) => faithfulRealms.has(b.stateId)) ||
      candidates[i % Math.max(1, candidates.length)] ||
      burgs[i % Math.max(1, burgs.length)];
    if (preferred) {
      rel.holySiteBurgId = preferred.id;
      usedHolySiteIds.add(preferred.id);
    }
  });

  // 4b. Trade Network Generation
  const tradeNetwork = generateTradeNetwork(mesh, sim, burgs, realms, settings.terrainSim.seaLevel, prng);

  if (tradeNetwork.cellPopulationDensity && tradeNetwork.cellTrafficVolume) {
    for (let i = 0; i < cells.length; i++) {
      cells[i].populationDensity = tradeNetwork.cellPopulationDensity[i] || 0;
      cells[i].trafficVolume = tradeNetwork.cellTrafficVolume[i] || 0;
    }
  }

  for (const hub of tradeNetwork.tradeHubs) {
    const b = burgs.find((x) => x.id === hub.burgId);
    if (b) {
      b.connectedRouteCount = hub.connectedRoutesCount;
      b.tradeVolume = hub.totalTradeVolume;
    }
  }

  // 4c. Assign Local Lords to all trade-spawned settlements
  for (const b of burgs) {
    if (!b.ownerId) {
      const bCounty = counties.find((c) => c.id === b.countyId) || counties.find((c) => c.realmId === b.stateId) || counties[0];
      const bRealm = realms.find((r) => r.id === b.stateId) || realms[0];
      const countRuler = characters.find((c) => c.id === bCounty?.rulerId);
      const bCultureObj = cultures.find((c) => c.name === bRealm.culture);
      const cultPreset =
        getActiveCulturePresets().find((c) => c.name === bRealm.culture) ||
        getActiveCulturePresets().find(
          (c) => (c as { linguisticFamily?: string }).linguisticFamily === bCultureObj?.linguisticFamily
        ) ||
        getActiveCulturePresets()[0];
      const male = prng.next() < 0.82;
      const hName: string = nameRegistry.nextHouseName(bRealm.culture);
      const fName: string = nameRegistry.nextFirstName(
        bRealm.culture,
        male ? 'Male' : 'Female',
        hName
      );

      const liegeChar = countRuler || characters.find((c) => c.id === bRealm.rulerId);
      const liegeTier: TitleTier = liegeChar?.titleTier || getRealmSovereignRank(bRealm).titleTier;
      const localKind: 'port' | 'market' | 'barony' = b.type.includes('Port')
        ? 'port'
        : b.type.includes('Market')
        ? 'market'
        : 'barony';
      const subStyle = getSubordinateVassalStyle(
        bRealm,
        liegeTier,
        male ? 'male' : 'female',
        b.name,
        localKind,
        prng.next() >= 0.7
      );

      if (localKind === 'port' || localKind === 'market') {
        const isPort = localKind === 'port';
        const municipalLord = generateStoryCharacter({
          id: `char_${charCounter++}`,
          name: `${fName} of ${isPort ? 'Guildhouse' : 'Syndicate'} ${hName}`,
          houseName: `${isPort ? 'Guildhouse' : 'Syndicate'} ${hName}`,
          houseMotto: isPort ? 'Safe Harbor & Wealth by Water' : 'Fair Scales & Honest Ledger',
          title: subStyle.title,
          role: subStyle.role,
          gender: male ? 'male' : 'female',
          age: prng.range(30, 60),
          realmId: bRealm.id,
          countyId: bCounty.id,
          liegeId: countRuler?.id || bRealm.rulerId,
          educationDomain: 'stewardship',
          prng,
        });
        municipalLord.titleTier = subStyle.titleTier;
        municipalLord.isNobleHouse = false;
        municipalLord.hasPersonalBanner = false;
        municipalLord.coatOfArms = undefined;
        characters.push(municipalLord);
        b.ownerId = municipalLord.id;
        b.rulerTitle = municipalLord.title;
      } else if (b.type.includes('Hamlet') || b.type.includes('Fortress')) {
        const castellan = generateStoryCharacter({
          id: `char_${charCounter++}`,
          name: `${fName} of House ${hName}`,
          houseName: hName,
          houseMotto: (prng.pick(cultPreset.mottos) as string) || 'Honor Above All',
          title: subStyle.title,
          role: subStyle.role,
          gender: male ? 'male' : 'female',
          age: prng.range(26, 52),
          realmId: bRealm.id,
          countyId: bCounty.id,
          liegeId: countRuler?.id || bRealm.rulerId,
          educationDomain: 'martial',
          prng,
        });
        castellan.titleTier = subStyle.titleTier;
        castellan.isNobleHouse = subStyle.isNobleHouse;
        castellan.hasPersonalBanner = subStyle.isNobleHouse;
        characters.push(castellan);
        b.ownerId = castellan.id;
        b.rulerTitle = castellan.title;
      } else {
        const reeve = generateStoryCharacter({
          id: `char_${charCounter++}`,
          name: `${fName} the Bailiff`,
          houseName: `Yeomanry of ${b.name}`,
          houseMotto: 'Plow, Hearth & Sovereign Law',
          title: subStyle.titleTier === 'Commoner' ? `Village Bailiff of ${b.name}` : subStyle.title,
          role: subStyle.titleTier === 'Commoner' ? 'Village Bailiff' : subStyle.role,
          gender: male ? 'male' : 'female',
          age: prng.range(30, 60),
          realmId: bRealm.id,
          countyId: bCounty.id,
          liegeId: countRuler?.id || bRealm.rulerId,
          educationDomain: 'stewardship',
          prng,
        });
        reeve.titleTier = subStyle.titleTier === 'Commoner' ? 'Commoner' : getLowerTitleTier(liegeTier, 'Commoner');
        reeve.isNobleHouse = false;
        reeve.hasPersonalBanner = false;
        reeve.coatOfArms = undefined;
        characters.push(reeve);
        b.ownerId = reeve.id;
        b.rulerTitle = reeve.title;
      }
    }
  }

  // Ensure Monarch personal demesne holds strictly the capital citadel
  for (const r of realms) {
    const monarch = characters.find((c) => c.id === r.rulerId);
    if (monarch) {
      const capBurg = burgs.find((b) => b.id === r.capitalBurgId);
      if (capBurg) {
        capBurg.ownerId = monarch.id;
        capBurg.rulerTitle = monarch.title;
      }
    }
  }

  // 4d. Municipal Territory Assignment
  for (const b of burgs) {
    b.cellIndices = [];
    b.vassalIds = [];
  }

  for (const county of counties) {
    const countyBurgs = burgs.filter((b) => b.countyId === county.id);
    if (countyBurgs.length === 0) continue;

    for (const cIdx of county.cellIndices) {
      const cell = cells[cIdx];
      let closestBurg = countyBurgs[0];
      let minDistSq = Infinity;
      for (const b of countyBurgs) {
        const dx = cell.x - b.x;
        const dy = cell.y - b.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < minDistSq) {
          minDistSq = distSq;
          closestBurg = b;
        }
      }
      cell.burgId = closestBurg.id;
      if (!closestBurg.cellIndices) closestBurg.cellIndices = [];
      closestBurg.cellIndices.push(cIdx);
    }
  }

  for (const b of burgs) {
    if (b.cellIndex !== undefined && (!b.cellIndices || b.cellIndices.length === 0)) {
      b.cellIndices = [b.cellIndex];
      cells[b.cellIndex].burgId = b.id;
    }
    const cellCount = b.cellIndices?.length || 1;
    b.areaKm2 = Math.round(cellCount * 36);
  }

  // 4e. Finalize Feudal Web (Vassal Chains, Treasuries & Population-Based Armies)
  for (const ch of characters) {
    ch.vassalIds = characters.filter((sub) => sub.isAlive !== false && sub.liegeId === ch.id).map((sub) => sub.id);
    if (ch.isAlive === false) {
      ch.heldHoldingIds = [];
      ch.treasury = 0;
      continue;
    }
    ch.heldHoldingIds = burgs.filter((b) => b.ownerId === ch.id).map((b) => b.id);
    ch.demesneLimit = calculateDemesneLimit(ch);
    const excess = Math.max(0, ch.heldHoldingIds.length - ch.demesneLimit);
    ch.overextensionPenalty = excess * 0.20;

    const isCommoner = [
      'Yeoman Miller',
      'Village Herbalist',
      'Wandering Bard',
      'Peasant Folk Hero',
      'Village Bailiff',
    ].includes(ch.role);

    if (isCommoner) {
      ch.heldHoldingIds = [];
      ch.treasury = prng.range(5, 22);
    } else if (ch.titleTier === 'King' || ch.titleTier === 'Emperor') {
      // Monarch's Privy Purse is distinct from Crown Fisc (realm.treasury)
      ch.treasury = prng.range(160, 320);
    } else if (ch.titleTier === 'Duke') {
      ch.treasury = prng.range(140, 260);
    } else if (ch.titleTier === 'Count') {
      ch.treasury = prng.range(60, 130);
    } else if (ch.titleTier === 'Baron' || ch.titleTier === 'Mayor') {
      ch.treasury = prng.range(25, 65);
    } else {
      ch.treasury = prng.range(18, 45);
    }
  }

  // Derive every character's Men-at-Arms, Levies, and Military Autonomy strictly from population
  recalculateFeudalDemesne({
    settings,
    currentYear: 1042,
    cells,
    realms,
    counties,
    burgs,
    characters,
    cultures,
    religions,
    sagas: [],
    history: [],
    loreEntities: [],
  });

  // Calculate Interpersonal Opinions
  for (const charA of characters) {
    for (const charB of characters) {
      if (charA.id === charB.id) continue;
      const sameRealm = charA.realmId === charB.realmId;
      const realmA = realms.find((r) => r.id === charA.realmId);
      const realmB = realms.find((r) => r.id === charB.realmId);
      const sameFaith = realmA?.religion === realmB?.religion;
      const sameCulture = realmA?.culture === realmB?.culture;

      let opinion = calculateCharacterOpinion(charA, charB, sameRealm, sameFaith, sameCulture);

      if (charA.spouseId === charB.id || charB.spouseId === charA.id) opinion += 45;
      if (charA.heirId === charB.id || charB.heirId === charA.id) opinion += 35;
      if (charA.rivalId === charB.id || charB.rivalId === charA.id) opinion -= 65;
      if (charA.liegeId === charB.id) {
        if (charA.personalityTraits.includes('Content')) opinion += 20;
        if (charA.personalityTraits.includes('Ambitious')) opinion -= 25;
      }

      charA.opinions[charB.id] = Math.max(-100, Math.min(100, opinion));
    }
  }

  // 5. Initial History & Sagas
  const history: HistoricalEvent[] = [
    {
      id: 'hist_1',
      year: 998,
      title: 'The Great Convergence of the Five Banners',
      category: 'Coronation',
      description: 'The ancient high council gathered on the salt flats to establish the boundary markers between realms.',
    },
    {
      id: 'hist_2',
      year: 1014,
      title: 'The Siege of the Red Estuary',
      category: 'War & Conquest',
      description: 'A bitter territorial feud over river tolls escalated into open warfare along the windward valley.',
    },
  ];

  const sagas: SagaStory[] = [];
  const loreEntities: LoreEntity[] = [];

  const tempState: WorldState = {
    settings,
    currentYear: 1042,
    cells,
    realms,
    counties,
    burgs,
    characters,
    cultures,
    religions,
    sagas: [],
    history,
    loreEntities: [],
  };

  for (const b of burgs) {
    b.economicLedger = calculateBurgEconomicLedger(b, tempState);
  }

  const saga1 = generateSagaChapter(tempState, { genre: 'Betrayal' }, prng);
  const saga2 = generateSagaChapter(tempState, { genre: 'Forbidden Love' }, prng);
  sagas.push(saga1.story, saga2.story);
  loreEntities.push(saga1.loreEntity, saga2.loreEntity);

  // Compile Core Lore Entities
  for (const r of realms) {
    const ruler = characters.find((c) => c.id === r.rulerId);
    const capital = burgs.find((b) => b.id === r.capitalBurgId);
    const rCounties = counties.filter((c) => c.realmId === r.id);

    loreEntities.push({
      id: `lore_${r.id}`,
      category: 'Kingdoms & Empires',
      name: r.name,
      summary: `${r.government} (${r.societyType || 'Stratified Feudalism'}) ruled by ${ruler?.name || 'the Crown'} from ${capital?.name || 'the Capital'}.`,
      body_markdown: `
### Sovereignty & Royal Court
- **Sovereign Monarch**: ${ruler ? ruler.name : 'Unknown'}
- **Government**: ${r.government}
- **Society Type**: ${r.societyType || 'Stratified Feudalism'}
- **Seat of Governance**: Citadel of ${capital ? capital.name : 'the Capital'}
- **Cultural Heritage**: ${r.culture}
- **State Religion**: ${r.religion}

### Feudal Fiefdoms
Comprising ${rCounties.length} feudal counties:
${rCounties.map((c) => `- **${c.name}**: Development Index ${c.development}/100`).join('\n')}

### Founding Legend
${r.foundingLegend}
      `.trim(),
      stateId: r.id,
      tags: ['Kingdom', r.culture, r.government],
    });
  }

  for (const ch of characters) {
    const realm = realms.find((r) => r.id === ch.realmId);
    const stats = computeCharacterStats(ch);
    loreEntities.push({
      id: `lore_${ch.id}`,
      category: 'Dynasties & Dramatis Personae',
      name: `${ch.title}: ${ch.name}`,
      summary: `${ch.role} of House ${ch.houseName} (${ch.aiArchetype}). Driven by ${ch.ambition.toLowerCase()}.`,
      body_markdown: `
### Dramatis Persona
- **House**: **${ch.houseName}** (Age ${ch.age}, ${ch.gender})
- **House Motto**: *"${ch.houseMotto}"*
- **Court Station**: **${ch.role}** (${ch.title})
- **Sovereign Allegiance**: ${realm ? realm.name : 'Independent'}
- **AI Archetype**: **${ch.aiArchetype}**

### The Five Skills & Prowess
- 🕊️ **Diplomacy**: ${stats.diplomacy} · ⚔️ **Martial**: ${stats.martial} · 💰 **Stewardship**: ${stats.stewardship} · 🗡️ **Intrigue**: ${stats.intrigue} · 📜 **Learning**: ${stats.learning} · 🛡️ **Prowess**: ${stats.prowess}
- 👑 **Prestige**: ${ch.prestige} · ☀️ **Piety**: ${ch.piety} · 💀 **Dread**: ${stats.dread}/100 · ⚡ **Stress**: ${ch.stress}/300 ${ch.stressCopingMechanism ? `(Coping: ${ch.stressCopingMechanism})` : ''}

### Trait Profile
- **Personality**: ${ch.personalityTraits.join(' · ')}
- **Education**: ${ch.educationTrait || 'Skilled Tactician'}
${ch.congenitalTraits.length > 0 ? `- **Congenital**: ${ch.congenitalTraits.join(' · ')}` : ''}
${ch.physicalHealthTraits.length > 0 ? `- **Health & Conditions**: ${ch.physicalHealthTraits.join(' · ')}` : ''}
${ch.commanderTraits.length > 0 ? `- **Commander Specializations**: ${ch.commanderTraits.join(' · ')}` : ''}
${ch.lifestyleTraits.length > 0 ? `- **Lifestyle & Infamy**: ${ch.lifestyleTraits.join(' · ')}` : ''}
${ch.statusTrait ? `- **Status**: ${ch.statusTrait}` : ''}

### Inner Persona & Motivations
- **Core Ambition**: ${ch.ambition}
- **Tragic Flaw**: ${ch.tragicFlaw}
- **Dark Secret**: ${ch.darkSecret}
- **Sacred Oath**: ${ch.sacredOath}

${ch.hooksHeld.length > 0 ? `### Blackmail Hooks Held\n${ch.hooksHeld.map((h) => `- **${h.type} Hook** over *${h.targetName}*: ${h.reason}`).join('\n')}` : ''}
${ch.activeScheme ? `### Active Schemes\n- Conspires to execute: **${ch.activeScheme.type}** against *${ch.activeScheme.targetName}* (${ch.activeScheme.motive}). Progress: **${ch.activeScheme.progress}%**` : ''}
      `.trim(),
      characterId: ch.id,
      stateId: ch.realmId,
      tags: ['Character', ch.houseName, ch.role, ch.aiArchetype],
    });
  }

  for (const b of burgs) {
    loreEntities.push({
      id: `lore_${b.id}`,
      category: 'Settlements & Citadels',
      name: `${b.name} (${b.type})`,
      summary: `${b.type} of ${b.population.toLocaleString()} souls, renowned for ${b.tradeGood}.`,
      body_markdown: `
### Citadel Demographics & Commerce
- **Classification**: ${b.type}
- **Population**: ${b.population.toLocaleString()} souls
- **Primary Export**: ${b.tradeGood}
- **Cultural Identity**: ${b.culture}

### Lore & Architecture
${b.lore} The stone ramparts command the surrounding terrain with imposing majesty.
      `.trim(),
      burgId: b.id,
      stateId: b.stateId,
      tags: ['Citadel', b.type],
    });
  }

  for (const co of counties) {
    const realm = realms.find((r) => r.id === co.realmId);
    const ruler = characters.find((ch) => ch.id === co.rulerId);
    const seat = burgs.find((b) => b.id === co.capitalBurgId);
    const tierLabel = co.tier === 'Duchy' || co.name.includes('Duchy') ? 'Duchy' : 'County';
    loreEntities.push({
      id: `lore_${co.id}`,
      category: 'Kingdoms & Empires',
      name: co.name,
      summary: `${tierLabel} of ${realm?.name || 'the Crown'}, seated at ${seat?.name || 'its fortress'} (Dev ${co.development || 15}).`,
      body_markdown: `
### Feudal Charter & Governance
- **Rank**: ${tierLabel}
- **Overlord**: ${realm?.name || 'Independent March'}
- **Ruler**: ${ruler ? `${ruler.title} ${ruler.name}` : 'Vacant Seat'}
- **Capital Seat**: ${seat?.name || 'Stronghold'}
- **Development Index**: ${co.development || 15} (${co.cellIndices.length} provinces)
      `.trim(),
      stateId: co.realmId,
      tags: [tierLabel, realm?.name || 'Fief'],
    });
  }

  for (const rel of religions) {
    const holySiteName = burgs.find((b) => b.id === rel.holySiteBurgId)?.name || 'Uncharted Sanctuary';
    loreEntities.push({
      id: `lore_${rel.id}`,
      category: 'Religions & Pantheons',
      name: `${rel.name} ${rel.symbol}`,
      summary: `${rel.theologyFamily || 'Sacred Tradition'} devoted to ${rel.deity}. ${rel.doctrine}.`,
      body_markdown: [
        '### Sacred Dogma & Organization',
        `- **Theological Tradition**: ${rel.theologyFamily || 'Orthodox Liturgical Faith'}`,
        `- **Supreme Divinity**: ${rel.deity}`,
        `- **Principal Clergy**: ${rel.clergyTitle || 'High Hierophant'}`,
        `- **Sacred Text**: ${rel.sacredText || `Codex of ${rel.name}`}`,
        `- **Doctrinal Principles**: ${rel.doctrine}`,
        `- **Mother Holy Site**: ${holySiteName}`,
        `- **Pilgrimage Rite**: ${rel.pilgrimageRite || 'Seasonal Devotional Pilgrimage'}`,
        '',
        '### Sacred Mythos',
        rel.sacredMyth,
      ].join('\n'),
      tags: ['Religion', rel.theologyFamily || 'Theology'],
    });
  }

  for (const cult of cultures) {
    loreEntities.push({
      id: `lore_${cult.id}`,
      category: 'Cultures & Peoples',
      name: cult.name,
      summary: `${cult.ethos} civilization rooted in ${cult.heritage} (${cult.languageGroup}).`,
      body_markdown: [
        '### Cultural Traditions & Institutions',
        `- **Ethos**: ${cult.ethos}`,
        `- **Ancient Heritage**: ${cult.heritage}`,
        `- **Language & Chancery**: ${cult.languageGroup}`,
        ...(cult.martialTradition ? [`- **Martial Tradition**: ${cult.martialTradition}`] : []),
        ...(cult.architectureStyle ? [`- **Architecture**: ${cult.architectureStyle}`] : []),
        ...(cult.customs && cult.customs.length > 0 ? [`- **Living Customs**: ${cult.customs.join(' · ')}`] : []),
        `- **Folklore & Epics**: ${cult.folklore}`,
      ].join('\n'),
      tags: ['Culture', cult.languageGroup],
    });
  }

  for (const route of tradeNetwork.routes.filter((r) => r.type === 'Imperial Highway' || r.trafficVolume >= 2)) {
    loreEntities.push({
      id: `lore_${route.id}`,
      category: 'Geography & Landmarks',
      name: `${route.type}: ${route.fromBurgName} — ${route.toBurgName}`,
      summary: `${route.type} spanning ${route.distanceKm} km. Commercial artery for ${route.primaryGood}.`,
      body_markdown: `
### Trade Arteries of the Known World
- **Classification**: ${route.type}
- **Distance**: ${route.distanceKm} km
- **Termini**: ${route.fromBurgName} ↔ ${route.toBurgName}
- **Primary Export**: ${route.primaryGood}
- **Transit Mode**: ${route.isMaritime ? 'Maritime shipping across open sea lanes via merchant caravels' : 'Overland route with waystations and guard patrols'}
- **Traffic Intensity**: Tier ${route.trafficVolume} Flow Index
      `.trim(),
      tags: ['Trade Route', route.type],
    });
  }


  const worldState = ensureV17WorldInitialized({
    settings,
    currentYear: 1042,
    cells,
    mesh,
    sim,
    realms,
    counties,
    burgs,
    characters,
    cultures,
    religions,
    sagas,
    history,
    loreEntities,
    tradeNetwork,
    continents,
    rivers: [], // Handled by unified carved hydrology renderer
    appMode: 'game',
    playerRealmId: realms[0]?.id ?? null,
    customRivers: [],
    mapPins: [],
  });

  reconcileFeudalHierarchy(worldState);
  syncWorldBanners(worldState);
  recalculateFeudalDemesne(worldState);
  recalculateCharacterRelationships(worldState);
  recalculateAllGravitas(worldState);
  CarryingCapacityEngine.updateAllBurgs(worldState, false);
  return worldState;
}

function generateStoryCharacter(params: {
  id: string;
  name: string;
  houseName: string;
  houseMotto: string;
  title: string;
  role: CourtRole;
  gender: 'male' | 'female';
  age: number;
  realmId: string;
  countyId?: string;
  liegeId?: string;
  spouseId?: string;
  heirId?: string;
  rivalId?: string;
  loverId?: string;
  statusTrait?: string;
  educationDomain?: 'diplomacy' | 'martial' | 'stewardship' | 'intrigue' | 'learning';
  prng: PRNG;
}): Character {
  const {
    id,
    name,
    houseName,
    houseMotto,
    title,
    role,
    gender,
    age,
    realmId,
    countyId,
    liegeId,
    spouseId,
    heirId,
    rivalId,
    loverId,
    statusTrait,
    educationDomain,
    prng,
  } = params;

  // 1. Pick 3 distinct non-conflicting Personality Traits
  const allPersonalityTraits = CHARACTER_TRAITS.filter((t) => t.category === 'personality');
  const chosenPersonality: string[] = [];
  const excludedOpposites = new Set<string>();

  const shuffledPersonality = prngShuffle(allPersonalityTraits, prng);
  const prioritizedPersonality = shuffledPersonality.slice().sort((a, b) => {
    const isBattleA = a.id === 'brave' || a.id === 'wrathful';
    const isBattleB = b.id === 'brave' || b.id === 'wrathful';
    if (gender === 'male') {
      if (isBattleA && !isBattleB) return -1;
      if (!isBattleA && isBattleB) return 1;
    } else {
      if (isBattleA && !isBattleB) return 1;
      if (!isBattleA && isBattleB) return -1;
    }
    return 0;
  });

  for (const t of prioritizedPersonality) {
    if (chosenPersonality.length >= 3) break;
    if (excludedOpposites.has(t.id)) continue;

    chosenPersonality.push(t.name);
    excludedOpposites.add(t.id);
    if (t.oppositeId) excludedOpposites.add(t.oppositeId);
  }

  // 2. Assign Education Trait (Tiers 1-4)
  let domain = educationDomain;
  if (!domain) {
    if (role === 'Marshal' || role === 'Court Champion' || role === 'Captain of the Guard' || role === 'Hedge Knight') {
      domain = 'martial';
    } else if (role === 'Spymaster' || role === 'Disinherited Bastard' || role === 'Smuggler King') {
      domain = 'intrigue';
    } else if (role === 'Steward' || role === 'Lord Mayor' || role === 'Merchant Guildmaster' || role === 'Guildmaster' || role === 'Portmaster' || role === 'Village Bailiff') {
      domain = 'stewardship';
    } else if (role === 'Chancellor') {
      domain = 'diplomacy';
    } else if (role === 'Court Chaplain' || role === 'Court Physician' || role === 'Village Herbalist') {
      domain = 'learning';
    } else if (gender === 'male') {
      domain = prng.pick(['martial', 'martial', 'stewardship', 'stewardship', 'diplomacy', 'intrigue', 'learning']);
    } else {
      domain = prng.pick(['diplomacy', 'diplomacy', 'stewardship', 'stewardship', 'intrigue', 'learning', 'martial']);
    }
  }

  const domainEducation = CHARACTER_TRAITS.filter(
    (t) =>
      (t.category === 'education' && t.id.toLowerCase().includes(domain.slice(0, 4))) ||
      (domain === 'martial' && (t.id.includes('warrior') || t.id.includes('soldier') || t.id.includes('tactician') || t.id.includes('strategist'))) ||
      (domain === 'diplomacy' && (t.id.includes('plotter') || t.id.includes('trickster') || t.id.includes('negotiator') || t.id.includes('eminence'))) ||
      (domain === 'stewardship' && (t.id.includes('wastrel') || t.id.includes('clerk') || t.id.includes('builder') || t.id.includes('midas'))) ||
      (domain === 'intrigue' && (t.id.includes('shadow') || t.id.includes('flunkey') || t.id.includes('schemer'))) ||
      (domain === 'learning' && (t.id.includes('scribe') || t.id.includes('thinker') || t.id.includes('intellectual') || t.id.includes('philosopher')))
  );

  const eduTier =
    role === 'Monarch' || role === 'Marshal' || role === 'Spymaster'
      ? prng.next() > 0.4 ? 4 : 3
      : prng.range(2, 4);

  const matchedEdu = domainEducation.find((t) => t.tier === eduTier) || domainEducation[domainEducation.length - 1];
  const educationTrait = matchedEdu?.name || 'Skilled Tactician';

  // 3. Congenital Traits (35% chance)
  const congenitalTraits: string[] = [];
  if (prng.next() < 0.35) {
    const congenitalPool = CHARACTER_TRAITS.filter((t) => t.category === 'congenital');
    congenitalTraits.push(prng.pick(congenitalPool).name);
  }

  // 4. Physical & Health Trauma Traits
  const physicalHealthTraits: string[] = [];
  const healthChance = age > 45 || role === 'Marshal' || role === 'Court Champion' ? 0.55 : 0.28;
  if (prng.next() < healthChance) {
    const healthPool = CHARACTER_TRAITS.filter((t) => t.category === 'health' && t.id !== 'pregnant');
    if (healthPool.length > 0) {
      physicalHealthTraits.push(prng.pick(healthPool).name);
    }
  }

  // 5. Commander & Combat Traits — Strictly EARNED through battles, apprenticeship, or mentorship (never randomly born with them)
  const commanderTraits: string[] = [];

  // 6. Lifestyle & Infamy Traits
  const lifestyleTraits: string[] = [];
  if (prng.next() < 0.30) {
    const lifePool = CHARACTER_TRAITS.filter((t) => t.category === 'lifestyle' || t.category === 'fame');
    lifestyleTraits.push(prng.pick(lifePool).name);
  }

  // 7. Derive AI Archetype
  const aiArchetype = deriveAIArchetype(chosenPersonality, educationTrait, role);

  // 8. Base Attributes + Prowess
  const isWarrior = role === 'Court Champion' || role === 'Marshal' || role === 'Captain of the Guard' || role === 'Hedge Knight' || commanderTraits.length > 0;
  let baseDiplomacy: number;
  let baseMartial: number;
  let baseStewardship: number;
  let baseIntrigue: number;
  let baseLearning: number;
  let baseProwess: number;

  if (gender === 'male') {
    baseMartial = isWarrior ? prng.range(13, 21) : prng.range(8, 15);
    baseProwess = role === 'Court Champion' ? prng.range(17, 25) : isWarrior ? prng.range(14, 21) : prng.range(7, 16);
    baseDiplomacy = prng.range(7, 15);
    baseStewardship = prng.range(8, 15);
    baseIntrigue = prng.range(7, 15);
    baseLearning = prng.range(7, 14);
  } else {
    baseDiplomacy = prng.range(10, 18);
    baseStewardship = prng.range(9, 17);
    baseIntrigue = prng.range(9, 17);
    baseLearning = prng.range(9, 17);
    baseMartial = isWarrior ? prng.range(12, 19) : prng.range(5, 12);
    baseProwess = isWarrior ? prng.range(13, 21) : prng.range(5, 12);
  }

  // 9. Stress & Dread System
  const stress = prng.range(10, 150);
  const stressLevel: 0 | 1 | 2 | 3 = stress > 180 ? 2 : stress > 85 ? 1 : 0;
  const stressCopingMechanism = stress > 85 ? prng.pick(['Drunkard', 'Flagellant', 'Profligate', 'Melancholic', 'Violent Outbursts', 'Isolation']) : undefined;

  const dread = ['Monarch', 'Marshal', 'Spymaster'].includes(role) ? prng.range(20, 65) : prng.range(0, 25);
  const prestige = prng.range(150, 1800);
  const piety = prng.range(80, 850);

  // Realistic medieval initial wealth
  const treasury = ['Monarch', 'Vassal Duke', 'Steward', 'Lord Mayor'].includes(role)
    ? role === 'Monarch'
      ? prng.range(320, 580)
      : prng.range(140, 260)
    : ['Vassal Count', 'Vassal Baron', 'Merchant Guildmaster', 'Guildmaster', 'Portmaster'].includes(role)
    ? prng.range(50, 120)
    : role === 'Marshal' || role === 'Chancellor'
    ? prng.range(30, 75)
    : prng.range(12, 36);

  const menAtArms = isWarrior ? 25 : 10;

  // 10. Ambitions, Flaws, Secrets (Coherent with actual personality traits, education domain & archetype)
  const hasTrait = (...names: string[]) => names.some((n) => chosenPersonality.includes(n));

  const ambitionCandidates: string[] = [];
  if (hasTrait('Ambitious', 'Brave', 'Wrathful', 'Arrogant') || domain === 'martial' || aiArchetype === 'Warmonger Vanguard') {
    ambitionCandidates.push(
      'To unify the fractured border marches under a single royal banner',
      'To build an impregnable sea fortress that withstands all sieges'
    );
  }
  if (hasTrait('Vengeful', 'Wrathful', 'Sadistic') || statusTrait === 'Disinherited Bastard') {
    ambitionCandidates.push('To avenge the poisoned goblet of their ancestors and reclaim the ducal seat');
  }
  if (hasTrait('Zealous') || domain === 'learning' || aiArchetype === 'Religious Zealot' || aiArchetype === 'Scholarly Hermit') {
    ambitionCandidates.push('To uncover the sacred lost codices of the First Age and reform the high faith');
  }
  if (hasTrait('Ambitious', 'Deceitful', 'Gregarious') || domain === 'diplomacy' || aiArchetype === 'Ruthless Schemer') {
    ambitionCandidates.push(
      'To secure a royal marriage that elevates their house above all rivals',
      'To expose the corruption of the Crown Council and seat their dynasty upon the throne'
    );
  }
  if (hasTrait('Greedy', 'Diligent', 'Just') || domain === 'stewardship') {
    ambitionCandidates.push('To forge an empire of sovereign trade guilds spanning the inland ocean');
  }
  if (hasTrait('Content', 'Humble', 'Calm', 'Temperate') && ambitionCandidates.length === 0) {
    ambitionCandidates.push('To preserve peace across the ancestral estates and safeguard the harvest');
  }
  const ambitions =
    ambitionCandidates.length > 0
      ? ambitionCandidates
      : ['To defend the ancestral hearth and secure the continuity of their house'];

  const flawCandidates: string[] = [];
  if (hasTrait('Paranoid', 'Shy')) {
    flawCandidates.push('Consuming paranoia that mistrusts even true sworn allies');
  }
  if (hasTrait('Arrogant', 'Stubborn', 'Brave', 'Impatient') && !hasTrait('Humble')) {
    flawCandidates.push('Unyielding pride that scorns compromise and treaties');
  }
  if (hasTrait('Lustful') && !hasTrait('Chaste')) {
    flawCandidates.push('A reckless carnal passion that defies royal law and council decrees');
  }
  if (hasTrait('Vengeful', 'Wrathful', 'Sadistic') && !hasTrait('Forgiving', 'Compassionate')) {
    flawCandidates.push('Unchecked vengeance that burns bridges with neighboring realms');
  }
  if (hasTrait('Greedy', 'Gluttonous') && !hasTrait('Generous', 'Temperate')) {
    flawCandidates.push('Excessive avarice and lavish spending that drains feudal coffers');
  }
  if (hasTrait('Zealous') && !hasTrait('Cynical')) {
    flawCandidates.push('Religious fanaticism that drives peaceful vassals into open rebellion');
  }
  if (hasTrait('Craven', 'Lazy') && flawCandidates.length === 0) {
    flawCandidates.push('Hesitation at moments of peril that leaves loyal allies exposed');
  }
  if (hasTrait('Honest', 'Just', 'Compassionate') && flawCandidates.length === 0) {
    flawCandidates.push('Rigid adherence to scruples that leaves them blind to courtly deceit');
  }
  const tragicFlaws =
    flawCandidates.length > 0
      ? flawCandidates
      : ['Stubborn pride in ancestral custom that resists necessary reform'];

  // Match dark secrets to compatible moral/personality profiles
  const secretPool = CHARACTER_SECRETS.filter((sec) => {
    const s = sec.toLowerCase();
    if (s.includes('poisoned') && (hasTrait('Compassionate', 'Honest', 'Forgiving') || aiArchetype === 'Honorable Paragon')) {
      return false;
    }
    if (s.includes('illicit affair') && hasTrait('Chaste')) {
      return false;
    }
    if (s.includes('forged') && hasTrait('Honest', 'Just')) {
      return false;
    }
    if (s.includes('embezzled') && (hasTrait('Generous', 'Just', 'Honest') || !hasTrait('Greedy', 'Deceitful', 'Arbitrary'))) {
      return false;
    }
    if ((s.includes('witchcraft') || s.includes('heretical')) && hasTrait('Zealous')) {
      return false;
    }
    if (s.includes('bribed the grand inquisitor') && (hasTrait('Just', 'Compassionate') || aiArchetype === 'Honorable Paragon')) {
      return false;
    }
    return true;
  });

  // Prefer trait-specific secrets when applicable
  const weightedSecretPool: string[] = [];
  for (const sec of secretPool) {
    const s = sec.toLowerCase();
    if (hasTrait('Lustful') && s.includes('illicit affair')) weightedSecretPool.push(sec, sec, sec);
    else if (hasTrait('Greedy') && s.includes('embezzled')) weightedSecretPool.push(sec, sec, sec);
    else if (hasTrait('Deceitful', 'Arbitrary') && (s.includes('forged') || s.includes('poisoned'))) weightedSecretPool.push(sec, sec);
    else if (hasTrait('Cynical') && (s.includes('heretical') || s.includes('witchcraft'))) weightedSecretPool.push(sec, sec);
    else if (hasTrait('Zealous', 'Sadistic') && s.includes('bribed the grand inquisitor')) weightedSecretPool.push(sec, sec);
    else weightedSecretPool.push(sec);
  }
  const darkSecrets =
    weightedSecretPool.length > 0
      ? [prng.pick(weightedSecretPool)]
      : ['Quietly shields a disgraced kinsman in violation of a royal banishment writ.'];

  const oathCandidates: string[] = [];
  if (hasTrait('Brave', 'Wrathful', 'Vengeful') || domain === 'martial') {
    oathCandidates.push(
      'Never to sheath the ancestral blade while an enemy standard flies',
      'To hold the mountain pass against all barbarian hosts unto death'
    );
  }
  if (hasTrait('Compassionate', 'Generous', 'Just', 'Zealous')) {
    oathCandidates.push('To protect every pilgrim and refugee seeking sanctuary at the gates');
  }
  if (hasTrait('Stubborn', 'Just', 'Honest') || oathCandidates.length === 0) {
    oathCandidates.push('To reclaim the sacred burial cairns of their ancient forebears');
  }
  const sacredOaths = oathCandidates;

  const isLandedNoble =
    role === 'Monarch' ||
    role === 'Vassal Duke' ||
    role === 'Vassal Count' ||
    role === 'Vassal Baron' ||
    role === 'Lord Mayor' ||
    role === 'Crown Heir' ||
    role === 'Heir' ||
    role === 'Vassal Heir';

  const initialYear = 1042;
  const birthYear = initialYear - age;
  const investitureYear = age >= 16
    ? initialYear - Math.max(2, Math.min(age - 14, Math.floor(age * 0.45)))
    : initialYear;
  const marriageYear = spouseId
    ? initialYear - Math.max(1, Math.min(Math.max(1, age - 16), Math.floor(age / 3)))
    : undefined;

  const newChar: Character = {
    id,
    name,
    houseName,
    houseMotto,
    title,
    role,
    gender,
    age,
    birthYear,
    investitureYear,
    marriageYear,
    isAlive: true,
    realmId,
    countyId,
    liegeId,
    spouseId,
    heirId,
    rivalId,
    loverId,

    baseDiplomacy,
    baseMartial,
    baseStewardship,
    baseIntrigue,
    baseLearning,
    baseProwess,

    personalityTraits: chosenPersonality,
    educationTrait,
    congenitalTraits,
    physicalHealthTraits,
    commanderTraits,
    lifestyleTraits,
    statusTrait: statusTrait || (role === 'Crown Heir' ? 'Crown Heir' : role === 'Disinherited Bastard' ? 'Disinherited Bastard' : undefined),

    aiArchetype,
    stress,
    stressLevel,
    stressCopingMechanism,
    dread,
    prestige,
    piety,
    treasury,
    menAtArms,

    ambition: prng.pick(ambitions),
    tragicFlaw: prng.pick(tragicFlaws),
    darkSecret: darkSecrets[0],
    sacredOath: prng.pick(sacredOaths),

    knownSecrets: darkSecrets,
    hooksHeld: [],
    hooksOnMe: [],
    opinions: {},

    coatOfArms: generateNobleArms(`house_${realmId}_${houseName}`, {
      gender,
      isLanded: isLandedNoble,
    }),
  };

  // Synchronize traits with the V17 trait engine immediately
  syncCharacterTraits(newChar);

  return newChar;
}

function prngShuffle<T>(array: T[], prng: PRNG): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = prng.range(0, i);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ============================================================================
// WORLD BUILDER AUTHORING: BLANK OCEAN, HEIGHTMAP IMPORT, AUTO-POPULATE & PLACEMENT
// ============================================================================

function buildTerrainOnlySettings(
  seed?: string,
  baseSettings?: Partial<WorldSettings>
): WorldSettings {
  return {
    seed: seed || `author-${Date.now().toString(36)}`,
    year: baseSettings?.year ?? 1042,
    eraName: baseSettings?.eraName ?? 'The First Dawn',
    loreTheme: baseSettings?.loreTheme ?? 'gritty-medieval',
    template: baseSettings?.template ?? 'Continents',
    climateTemplate: baseSettings?.climateTemplate ?? 'Temperate Hearth',
    realmCount: baseSettings?.realmCount ?? 10,
    duchiesPerRealm: baseSettings?.duchiesPerRealm ?? 2,
    countiesPerRealm: baseSettings?.countiesPerRealm ?? 10,
    continentCount: baseSettings?.continentCount ?? 2,
    perContinentMode: baseSettings?.perContinentMode ?? false,
    cultureCount: baseSettings?.cultureCount ?? 4,
    seaLevel: baseSettings?.seaLevel ?? 0.28,
    terrainSim: {
      windAngleDeg: baseSettings?.terrainSim?.windAngleDeg ?? 45,
      raininess: baseSettings?.terrainSim?.raininess ?? 0.65,
      seaLevel: baseSettings?.terrainSim?.seaLevel ?? baseSettings?.seaLevel ?? 0.28,
      minRiverFlow: baseSettings?.terrainSim?.minRiverFlow ?? 7.5,
      brushMode: 'mountain',
      brushSize: baseSettings?.terrainSim?.brushSize ?? 45,
      brushStrength: baseSettings?.terrainSim?.brushStrength ?? 0.65,
      brushFalloff: baseSettings?.terrainSim?.brushFalloff ?? 'medium',
    },
  };
}

function buildEmptyWorldFromMeshAndSim(
  mesh: VoronoiDualMesh,
  sim: TerrainSimulationResult,
  settings: WorldSettings,
  prng: PRNG
): WorldState {
  const { numRegions, r_x, r_y, r_polygon } = mesh;
  const cells: WorldCell[] = [];
  for (let r = 0; r < numRegions; r++) {
    const reliefType =
      sim.reliefType && sim.reliefType[r]
        ? sim.reliefType[r]
        : sim.elevation[r] >= 0.65
        ? 'mountain'
        : sim.elevation[r] >= 0.48
        ? 'hill'
        : sim.biomes[r].includes('Forest') || sim.biomes[r].includes('Taiga')
        ? 'forest'
        : null;
    const continentId = sim.continentIds
      ? sim.continentIds[r]
      : sim.elevation[r] >= settings.terrainSim.seaLevel
      ? 0
      : -1;
    cells.push({
      index: r,
      x: r_x[r],
      y: r_y[r],
      polygon: r_polygon[r],
      elevation: sim.elevation[r],
      temperature: sim.temperature[r],
      moisture: sim.rainfall[r],
      biome: sim.biomes[r],
      continentId: continentId >= 0 ? continentId : undefined,
      isCoast: sim.isCoast[r],
      isRiver: sim.isRiver[r],
      isLake: sim.isLake?.[r],
      isOcean: sim.isOcean?.[r],
      isEndorheicSea: sim.isEndorheicSea?.[r],
      lakeElevation: sim.lakeElevation?.[r],
      lakeDepth: sim.lakeDepth?.[r],
      riverFlow: Math.sqrt(sim.waterFlux[r]),
      reliefType,
      shadedRelief: sim.shadedRelief[r],
    });
  }

  const continents = summarizeContinentsFromCells(cells, settings.terrainSim.seaLevel, settings);
  const blankAffinities = detectTerrainAffinities(cells, settings.terrainSim.seaLevel);
  const activeCultures = synthesizeProceduralCultures(
    Math.max(4, Math.min(6, settings.cultureCount || 4)),
    prng,
    blankAffinities,
    getModdedCustomCultures()
  );
  const activeReligions = synthesizeProceduralReligions(
    4,
    prng,
    blankAffinities,
    getModdedCustomReligions()
  );

  return {
    settings,
    currentYear: settings.year ?? 1042,
    cells,
    mesh,
    sim,
    realms: [],
    counties: [],
    burgs: [],
    characters: [],
    cultures: activeCultures,
    religions: activeReligions,
    sagas: [],
    history: [],
    loreEntities: [],
    continents,
    rivers: [],
    appMode: 'builder',
    playerRealmId: null,
    customRivers: [],
    mapPins: [],
    pendingDiplomaticProposals: [],
    paintRevision: 1,
    territoryRevision: 1,
    burgRevision: 1,
  };
}

export function createBlankOceanWorld(
  seed?: string,
  baseSettings?: Partial<WorldSettings>
): WorldState {
  const settings = buildTerrainOnlySettings(seed, {
    ...baseSettings,
    template: 'Archipelago',
  });
  const prng = new PRNG(settings.seed);
  cachedNoise = new Noise2D(prng);

  const WIDTH = 1000;
  const HEIGHT = 700;
  const COLS = 75;
  const ROWS = 52;

  cachedMesh = createVoronoiDualMesh(WIDTH, HEIGHT, COLS, ROWS, prng);
  initOverrideBuffers(cachedMesh.numRegions);
  cachedCustomBaseHeights = new Float32Array(cachedMesh.numRegions).fill(0.06);
  cachedPaintBuffer!.fill(0);

  const sim = runTerrainSimulation(
    cachedMesh,
    cachedNoise,
    settings.template,
    cachedPaintBuffer!,
    {
      windAngleDeg: settings.terrainSim.windAngleDeg,
      raininess: settings.terrainSim.raininess,
      seaLevel: settings.terrainSim.seaLevel,
      minRiverFlow: settings.terrainSim.minRiverFlow,
      continentCount: 0,
      climateTemplate: settings.climateTemplate || 'Temperate Hearth',
      seed: settings.seed,
      customBaseHeights: cachedCustomBaseHeights,
    },
    WIDTH,
    HEIGHT
  );
  cachedSim = sim;

  return buildEmptyWorldFromMeshAndSim(cachedMesh, sim, settings, prng);
}

export function createWorldFromHeightmap(
  heightsFloat32: Float32Array,
  imgWidth: number,
  imgHeight: number,
  seed?: string,
  baseSettings?: Partial<WorldSettings>
): WorldState {
  const settings = buildTerrainOnlySettings(seed, baseSettings);
  const prng = new PRNG(settings.seed);
  cachedNoise = new Noise2D(prng);

  const WIDTH = 1000;
  const HEIGHT = 700;
  const COLS = 75;
  const ROWS = 52;

  cachedMesh = createVoronoiDualMesh(WIDTH, HEIGHT, COLS, ROWS, prng);
  const n = cachedMesh.numRegions;
  initOverrideBuffers(n);

  const sampled = new Float32Array(n);
  const safeW = Math.max(1, imgWidth);
  const safeH = Math.max(1, imgHeight);
  for (let r = 0; r < n; r++) {
    const fx = Math.max(0, Math.min(safeW - 1, (cachedMesh.r_x[r] / WIDTH) * (safeW - 1)));
    const fy = Math.max(0, Math.min(safeH - 1, (cachedMesh.r_y[r] / HEIGHT) * (safeH - 1)));
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(safeW - 1, x0 + 1);
    const y1 = Math.min(safeH - 1, y0 + 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const h00 = heightsFloat32[y0 * safeW + x0] ?? 0;
    const h10 = heightsFloat32[y0 * safeW + x1] ?? h00;
    const h01 = heightsFloat32[y1 * safeW + x0] ?? h00;
    const h11 = heightsFloat32[y1 * safeW + x1] ?? h00;
    const top = h00 + (h10 - h00) * tx;
    const bot = h01 + (h11 - h01) * tx;
    sampled[r] = Math.max(0.02, Math.min(0.98, top + (bot - top) * ty));
  }
  cachedCustomBaseHeights = sampled;

  const sim = runTerrainSimulation(
    cachedMesh,
    cachedNoise,
    settings.template,
    cachedPaintBuffer!,
    {
      windAngleDeg: settings.terrainSim.windAngleDeg,
      raininess: settings.terrainSim.raininess,
      seaLevel: settings.terrainSim.seaLevel,
      minRiverFlow: settings.terrainSim.minRiverFlow,
      continentCount: settings.continentCount || 2,
      continentConfigs: settings.continentConfigs,
      climateTemplate: settings.climateTemplate || 'Temperate Hearth',
      seed: settings.seed,
      customBaseHeights: cachedCustomBaseHeights,
    },
    WIDTH,
    HEIGHT
  );
  cachedSim = sim;

  return buildEmptyWorldFromMeshAndSim(cachedMesh, sim, settings, prng);
}

export function autoPopulateCurrentTerrain(existingWorld: WorldState): WorldState {
  let working = existingWorld;
  if (!cachedMesh || !cachedSim) {
    working = rehydrateMeshAndSim(existingWorld);
  }
  const mesh = cachedMesh || (working.mesh as VoronoiDualMesh);
  const sim = cachedSim || (working.sim as TerrainSimulationResult);
  if (!mesh || !sim) return working;

  const seaLevel = working.settings.terrainSim?.seaLevel ?? 0.28;
  const hasLand = working.cells.some((c) => c.elevation >= seaLevel);
  if (!hasLand) return working;

  const prng = new PRNG(`${working.settings.seed}-pop-${Date.now().toString(36)}`);
  const generated = compileWorldState(mesh, sim, working.settings, prng);

  const lockedRealms = (working.realms || []).filter((r) => r.lockedFromAutoSim);
  const lockedCounties = (working.counties || []).filter((c) => c.lockedFromAutoSim);
  const lockedBurgs = (working.burgs || []).filter((b) => b.lockedFromAutoSim);
  const lockedChars = (working.characters || []).filter((c) => c.lockedFromAutoSim);

  const mergedRealms = [
    ...lockedRealms,
    ...generated.realms.filter((gr) => !lockedRealms.some((lr) => lr.id === gr.id)),
  ];
  const mergedCounties = [
    ...lockedCounties,
    ...generated.counties.filter((gc) => !lockedCounties.some((lc) => lc.id === gc.id)),
  ];
  const mergedBurgs = [
    ...lockedBurgs,
    ...generated.burgs.filter((gb) => {
      if (lockedBurgs.some((lb) => lb.id === gb.id)) return false;
      return !lockedBurgs.some((lb) => Math.hypot(lb.x - gb.x, lb.y - gb.y) < 16);
    }),
  ];
  const mergedChars = [
    ...lockedChars,
    ...generated.characters.filter((gc) => !lockedChars.some((lc) => lc.id === gc.id)),
  ];

  // Re-bind locked burgs onto valid cells & preserve custom authored borders
  for (const lb of mergedBurgs) {
    if (!lb.lockedFromAutoSim) continue;
    const cell = lb.cellIndex !== undefined ? generated.cells[lb.cellIndex] : undefined;
    if (cell) {
      if (!lb.stateId || lb.stateId === 'independent') {
        lb.stateId = cell.realmId || mergedRealms[0]?.id || 'independent';
      }
      if (!lb.countyId || lb.countyId === 'unassigned') {
        lb.countyId = cell.countyId || mergedCounties[0]?.id || 'unassigned';
      }
    }
  }

  const nextWorld: WorldState = {
    ...generated,
    realms: mergedRealms,
    counties: mergedCounties,
    burgs: mergedBurgs,
    characters: mergedChars,
    customRivers: working.customRivers || [],
    mapPins: working.mapPins || [],
    appMode: working.appMode || 'builder',
    playerRealmId:
      working.playerRealmId && mergedRealms.some((r) => r.id === working.playerRealmId)
        ? working.playerRealmId
        : mergedRealms[0]?.id ?? null,
    builderBaselineArchive: working.builderBaselineArchive,
    paintRevision: (working.paintRevision || 0) + 1,
    territoryRevision: (working.territoryRevision || 0) + 1,
    burgRevision: (working.burgRevision || 0) + 1,
  };

  reconcileFeudalHierarchy(nextWorld);
  syncWorldBanners(nextWorld);
  recalculateFeudalDemesne(nextWorld);
  recalculateCharacterRelationships(nextWorld);
  recalculateAllGravitas(nextWorld);
  CarryingCapacityEngine.updateAllBurgs(nextWorld, false);
  return nextWorld;
}

export function placeCustomBurg(
  world: WorldState,
  x: number,
  y: number,
  options?: {
    name?: string;
    type?: Burg['type'];
    realmId?: string;
    population?: number;
  }
): WorldState {
  const seaLevel = world.settings.terrainSim?.seaLevel ?? 0.28;
  let bestCell: WorldCell | null = null;
  let bestDist = Infinity;
  for (const c of world.cells) {
    if (c.elevation < seaLevel) continue;
    const d = Math.hypot(c.x - x, c.y - y);
    if (d < bestDist) {
      bestDist = d;
      bestCell = c;
    }
  }
  if (!bestCell || bestDist > 60) {
    return world;
  }

  const prng = new PRNG(`${world.settings.seed}-burg-${world.burgs.length}-${Math.round(x)}-${Math.round(y)}`);
  const nameRegistry = new WorldNameRegistry(prng);
  const chosenType: Burg['type'] =
    options?.type ||
    (bestCell.isCoast ? 'Trade Port' : bestCell.elevation >= 0.62 ? 'Mountain Hamlet' : 'Market Town');

  const resolvedRealmId =
    options?.realmId ||
    bestCell.realmId ||
    world.realms[0]?.id ||
    'independent';
  const realm = world.realms.find((r) => r.id === resolvedRealmId);
  const resolvedCountyId =
    bestCell.countyId ||
    world.counties.find((ct) => ct.realmId === resolvedRealmId)?.id ||
    'unassigned';
  const county = world.counties.find((ct) => ct.id === resolvedCountyId);

  const defaultPop =
    options?.population ??
    (chosenType === 'Capital Citadel'
      ? 22000
      : chosenType === 'Royal Metropolis'
      ? 16000
      : chosenType === 'Trade Port'
      ? 9500
      : chosenType === 'Border Fortress'
      ? 5400
      : chosenType === 'Market Town'
      ? 4800
      : chosenType === 'Fishing Port'
      ? 2400
      : 1400);

  const cultureName = realm?.culture || world.cultures[0]?.name || 'Vaelorian';
  const burgSiteHint = bestCell.isCoast
    ? 'coastal'
    : bestCell.reliefType === 'mountain' || bestCell.elevation > 0.55
    ? 'mountain'
    : bestCell.reliefType === 'forest'
    ? 'forest'
    : 'inland';
  const burgName = options?.name?.trim() || nameRegistry.nextBurgName(cultureName, burgSiteHint);
  const exportsList = deriveBurgExports(chosenType, bestCell.isCoast ? 'Estuary Harbor' : bestCell.isRiver ? 'River Confluence' : bestCell.reliefType === 'mountain' ? 'Mountain Pass' : 'Crossroads', bestCell, prng);
  const importsList = deriveBurgImports(exportsList, bestCell, chosenType);
  const tier: Burg['tier'] =
    chosenType === 'Capital Citadel'
      ? 'citadel'
      : chosenType === 'Royal Metropolis'
      ? 'metropolis'
      : chosenType === 'Trade Port' || chosenType === 'Fishing Port'
      ? 'port'
      : chosenType === 'Market Town' || chosenType === 'Border Fortress'
      ? 'town'
      : chosenType === 'Mountain Hamlet'
      ? 'hamlet'
      : 'village';
  const garrisonCount = deriveBurgGarrison(chosenType, defaultPop);

  const newBurg: Burg = {
    id: `burg_custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: burgName,
    x: bestDist < 18 ? x : bestCell.x,
    y: bestDist < 18 ? y : bestCell.y,
    cellIndex: bestCell.index,
    stateId: resolvedRealmId,
    countyId: resolvedCountyId,
    tier,
    type: chosenType,
    population: defaultPop,
    carryingCapacity: Math.round(defaultPop * 1.4),
    isCapital: chosenType === 'Capital Citadel',
    tradeGood: exportsList[0] || 'Grain',
    culture: cultureName,
    exports: exportsList,
    imports: importsList,
    lore: `${burgName} is a ${chosenType.toLowerCase()} founded during the cartographer's charter.`,
    developmentLevel: chosenType === 'Capital Citadel' || chosenType === 'Royal Metropolis' ? 72 : tier === 'town' || tier === 'port' ? 54 : 36,
    garrisonCount,
    garrisonMax: Math.round(garrisonCount * 1.35),
    treasury: Math.round(defaultPop * 0.04),
    lockedFromAutoSim: true,
    ownerId: county?.rulerId || realm?.rulerId,
  };

  return {
    ...world,
    burgs: [...world.burgs, newBurg],
    paintRevision: (world.paintRevision || 0) + 1,
    burgRevision: (world.burgRevision || 0) + 1,
  };
}

export function addCustomRiver(
  world: WorldState,
  name: string,
  points: Point2D[],
  widthScale = 1.15
): WorldState {
  if (points.length < 2) return world;
  const nextRiver: CustomRiver = {
    id: `river_custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim() || `River ${(world.customRivers?.length || 0) + 1}`,
    points: points.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 })),
    widthScale: Math.max(0.5, Math.min(2.6, widthScale)),
  };
  return {
    ...world,
    customRivers: [...(world.customRivers || []), nextRiver],
    paintRevision: (world.paintRevision || 0) + 1,
  };
}

export function renameCustomRiver(world: WorldState, riverId: string, name: string): WorldState {
  return {
    ...world,
    customRivers: (world.customRivers || []).map((r) =>
      r.id === riverId ? { ...r, name: name.trim() || r.name } : r
    ),
    paintRevision: (world.paintRevision || 0) + 1,
  };
}

export function deleteCustomRiver(world: WorldState, riverId: string): WorldState {
  return {
    ...world,
    customRivers: (world.customRivers || []).filter((r) => r.id !== riverId),
    paintRevision: (world.paintRevision || 0) + 1,
  };
}

export function upsertMapPin(
  world: WorldState,
  pin: Omit<MapPin, 'id'> & { id?: string }
): WorldState {
  const existing = world.mapPins || [];
  if (pin.id && existing.some((p) => p.id === pin.id)) {
    return {
      ...world,
      mapPins: existing.map((p) => (p.id === pin.id ? { ...p, ...pin, id: p.id } : p)),
    };
  }
  const created: MapPin = {
    id: pin.id || `pin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    x: pin.x,
    y: pin.y,
    label: pin.label.trim() || 'Notable Landmark',
    icon: pin.icon || 'pin',
    category: pin.category || 'Marker',
    notes: pin.notes || '',
    loreEntityId: pin.loreEntityId,
  };
  return {
    ...world,
    mapPins: [...existing, created],
  };
}

export function deleteMapPin(world: WorldState, pinId: string): WorldState {
  return {
    ...world,
    mapPins: (world.mapPins || []).filter((p) => p.id !== pinId),
  };
}