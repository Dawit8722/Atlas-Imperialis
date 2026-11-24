import { VoronoiDualMesh } from './voronoiDualMesh';
import { BiomeType, ClimateTemplate, ContinentConfig, WorldSettings } from '../types/world';
import { Noise2D, PRNG } from '../utils/proceduralNoise';

export type ReliefType = 'mountain' | 'hill' | 'forest' | 'tree' | 'swamp' | null;

export interface TerrainSimulationResult {
  elevation: Float32Array;
  rainfall: Float32Array;
  temperature: Float32Array;
  waterFlux: Float32Array;
  isRiver: boolean[];
  isCoast: boolean[];
  isLake: boolean[];
  isOcean: boolean[];
  isEndorheicSea: boolean[];
  lakeElevation: Float32Array;
  lakeDepth: Float32Array;
  biomes: BiomeType[];
  shadedRelief: Float32Array;
  downhill: Int32Array;
  reliefType: ReliefType[]; // Directly references relief asset categories
  continentIds: Int16Array; // 0-based continent index for land cells, -1 for ocean
}

export interface SimulationParams {
  windAngleDeg: number;
  raininess: number;
  seaLevel: number;
  minRiverFlow: number;
  continentCount?: number;
  continentConfigs?: ContinentConfig[];
  climateTemplate?: ClimateTemplate;
  seed?: string;
  biomeOverrides?: (BiomeType | null)[];
  reliefOverrides?: (ReliefType | 'clear' | 'clear_all' | null)[];
  tempOverrides?: Float32Array;
  customBaseHeights?: Float32Array;
}

interface ClimateProfile {
  tempNorth: number;
  tempEquator: number;
  tempSouth: number;
  equatorNy: number;
  subtropicalDryBand: number;
  moistureBias: number;
  planetaryWinds: boolean;
  snowlineOffset: number;
}

function getClimateProfile(template: ClimateTemplate = 'Temperate Hearth'): ClimateProfile {
  switch (template) {
    case 'Whole World':
      return {
        tempNorth: -0.12,
        tempEquator: 0.98,
        tempSouth: -0.12,
        equatorNy: 0.50,
        subtropicalDryBand: 0.88,
        moistureBias: 1.08,
        planetaryWinds: true,
        snowlineOffset: 0.0,
      };
    case 'Northern Hemisphere':
      return {
        tempNorth: -0.10,
        tempEquator: 0.96,
        tempSouth: 0.94,
        equatorNy: 0.96,
        subtropicalDryBand: 0.78,
        moistureBias: 1.06,
        planetaryWinds: true,
        snowlineOffset: 0.0,
      };
    case 'Southern Hemisphere':
      return {
        tempNorth: 0.94,
        tempEquator: 0.96,
        tempSouth: -0.10,
        equatorNy: 0.04,
        subtropicalDryBand: 0.78,
        moistureBias: 1.06,
        planetaryWinds: true,
        snowlineOffset: 0.0,
      };
    case 'Equatorial':
      return {
        tempNorth: 0.68,
        tempEquator: 0.94,
        tempSouth: 0.68,
        equatorNy: 0.50,
        subtropicalDryBand: 0.05,
        moistureBias: 1.42,
        planetaryWinds: false,
        snowlineOffset: 0.16,
      };
    case 'Nordic Boreal':
      return {
        tempNorth: 0.12,
        tempEquator: 0.46,
        tempSouth: 0.46,
        equatorNy: 1.15,
        subtropicalDryBand: 0.0,
        moistureBias: 1.14,
        planetaryWinds: false,
        snowlineOffset: -0.14,
      };
    case 'Arid Steppe':
      return {
        tempNorth: 0.36,
        tempEquator: 0.94,
        tempSouth: 0.76,
        equatorNy: 0.85,
        subtropicalDryBand: 0.85,
        moistureBias: 0.46,
        planetaryWinds: false,
        snowlineOffset: 0.08,
      };
    case 'Glacial Age':
      return {
        tempNorth: 0.0,
        tempEquator: 0.36,
        tempSouth: 0.03,
        equatorNy: 0.62,
        subtropicalDryBand: 0.0,
        moistureBias: 0.92,
        planetaryWinds: false,
        snowlineOffset: -0.22,
      };
    case 'Temperate Hearth':
    default:
      return {
        tempNorth: 0.24,
        tempEquator: 0.76,
        tempSouth: 0.76,
        equatorNy: 1.14,
        subtropicalDryBand: 0.22,
        moistureBias: 1.14,
        planetaryWinds: false,
        snowlineOffset: 0.04,
      };
  }
}

export function runTerrainSimulation(
  mesh: VoronoiDualMesh,
  noise: Noise2D,
  template: WorldSettings['template'],
  paintBuffer: Float32Array,
  params: SimulationParams,
  width = 1000,
  height = 700
): TerrainSimulationResult {
  const { numRegions, r_x, r_y, r_neighbors, r_is_boundary } = mesh;

  const elevation = new Float32Array(numRegions);
  const rainfall = new Float32Array(numRegions);
  const temperature = new Float32Array(numRegions);
  const waterFlux = new Float32Array(numRegions);
  const isRiver = new Array<boolean>(numRegions).fill(false);
  const isCoast = new Array<boolean>(numRegions).fill(false);
  const biomes = new Array<BiomeType>(numRegions).fill('Deep Ocean');
  const shadedRelief = new Float32Array(numRegions).fill(0.5);
  const downhill = new Int32Array(numRegions).fill(-1);
  const reliefType = new Array<ReliefType>(numRegions).fill(null);

  const continentCount = params.continentCount || 2;
  const climateTemplate = params.climateTemplate || 'Temperate Hearth';
  const climate = getClimateProfile(climateTemplate);

  // Deterministic PRNG for landmass template synthesis (independent of climateTemplate)
  const fallbackSeed = `${Math.round(noise.noise(1.13, 2.71) * 1e7)}_${Math.round(noise.noise(5.77, 3.19) * 1e7)}`;
  const landPrng = new PRNG(`${params.seed || fallbackSeed}|${template || 'Continents'}|${continentCount}`);

  // 1. Geomorphic Heightmap Synthesis (or custom imported/blank heightfield when provided)
  let baseHeights: Float32Array;
  let continentCenters: { x: number; y: number }[] = [];
  if (params.customBaseHeights && params.customBaseHeights.length === numRegions) {
    baseHeights = params.customBaseHeights;
  } else {
    const cached = getCachedTerrainHeightfield(
      mesh,
      noise,
      template || 'Continents',
      params.seaLevel,
      continentCount,
      params.continentConfigs,
      landPrng,
      width,
      height,
      params.seed || fallbackSeed,
      params.climateTemplate
    );
    baseHeights = cached.heights;
    continentCenters = cached.continentCenters;
  }

  for (let r = 0; r < numRegions; r++) {
    elevation[r] = Math.max(0, Math.min(1, baseHeights[r] + (paintBuffer[r] || 0)));
  }

  // Detect Coasts
  for (let r = 0; r < numRegions; r++) {
    if (elevation[r] >= params.seaLevel) {
      for (const n of r_neighbors[r]) {
        if (elevation[n] < params.seaLevel) {
          isCoast[r] = true;
          break;
        }
      }
    }
  }

  // Label land continents via connected components (aligned to continentCenters when present)
  const continentIds = assignContinentIds(
    mesh,
    elevation,
    params.seaLevel,
    continentCenters,
    width,
    height
  );

  // 2. Temperature Field (Latitude Belt + Maritime Moderation + Lapse Rate)
  for (let r = 0; r < numRegions; r++) {
    const ny = r_y[r] / height;
    const nx = r_x[r] / width;
    let baseTemp: number;

    const poleCurve = climate.planetaryWinds ? 1.15 : 0.95;
    if (ny <= climate.equatorNy) {
      const span = Math.max(0.05, climate.equatorNy);
      const t = Math.max(0, Math.min(1, ny / span));
      baseTemp = climate.tempNorth + (climate.tempEquator - climate.tempNorth) * Math.pow(t, poleCurve);
    } else {
      const span = Math.max(0.05, 1 - climate.equatorNy);
      const t = Math.max(0, Math.min(1, (ny - climate.equatorNy) / span));
      baseTemp = climate.tempEquator + (climate.tempSouth - climate.tempEquator) * (1 - Math.pow(1 - t, poleCurve));
    }

    // Subtle continental thermal noise
    const thermalNoise = (noise.fBm(nx * 3.4 + 2.1, ny * 3.4 + 6.7, 3) - 0.5) * 0.06;
    // Coastal maritime buffering moderates extreme temperatures slightly
    const maritimeMod = isCoast[r] ? (0.44 - baseTemp) * 0.08 : 0;
    // Altitude lapse rate (~6.5°C per km above sea level)
    const lapse = Math.max(0, elevation[r] - params.seaLevel) * 0.68;

    const tempVal = Math.max(0, Math.min(1, baseTemp + thermalNoise + maritimeMod - lapse));
    const tOverride = params.tempOverrides ? params.tempOverrides[r] : NaN;
    temperature[r] = !Number.isNaN(tOverride) && elevation[r] >= params.seaLevel ? tOverride : tempVal;
  }

  // 3. Planetary Wind Belts + Multi-Pass Orographic Precipitation & Rain Shadows
  const baseWindRad = (params.windAngleDeg * Math.PI) / 180;
  const userOffsetRad = ((params.windAngleDeg - 45) * Math.PI) / 180;
  const cellWindX = new Float32Array(numRegions);
  const cellWindY = new Float32Array(numRegions);
  const cellLatWetness = new Float32Array(numRegions);

  for (let r = 0; r < numRegions; r++) {
    const ny = r_y[r] / height;
    const distFromEq = Math.abs(ny - climate.equatorNy);
    // Approximate planetary latitude fraction in [0..1] (0 = equator, 1 = pole)
    const latFrac = Math.min(1, distFromEq / 0.52);

    let localAngle = baseWindRad;
    if (climate.planetaryWinds) {
      if (latFrac < 0.30) {
        // Trade winds blowing westward (toward ~165-195 deg)
        const sign = ny >= climate.equatorNy ? 1 : -1;
        localAngle = Math.PI - sign * 0.32 + userOffsetRad * 0.35;
      } else if (latFrac < 0.72) {
        // Mid-latitude westerlies blowing eastward (toward ~0 deg)
        const sign = ny >= climate.equatorNy ? -1 : 1;
        localAngle = sign * 0.28 + userOffsetRad * 0.45;
      } else {
        // Polar easterlies
        localAngle = Math.PI * 0.92 + userOffsetRad * 0.35;
      }
    }

    cellWindX[r] = Math.cos(localAngle);
    cellWindY[r] = Math.sin(localAngle);

    if (climateTemplate === 'Equatorial') {
      // Entire map sits inside the humid tropical convergence zone
      cellLatWetness[r] = 1.28 - latFrac * 0.12;
    } else if (climateTemplate === 'Arid Steppe') {
      cellLatWetness[r] = 0.68 - climate.subtropicalDryBand * Math.exp(-Math.pow((latFrac - 0.32) / 0.22, 2)) * 0.28;
    } else if (climateTemplate === 'Nordic Boreal' || climateTemplate === 'Glacial Age') {
      cellLatWetness[r] = 1.06 + Math.exp(-Math.pow((latFrac - 0.55) / 0.30, 2)) * 0.14;
    } else {
      // Latitude atmospheric moisture convergence (ITCZ rainforest -> Hadley desert belt -> Temperate storm track)
      const itczPeak = Math.exp(-Math.pow(latFrac / 0.20, 2)) * 0.62;
      const hadleyTrough =
        climate.subtropicalDryBand *
        Math.exp(-Math.pow((latFrac - 0.27) / 0.11, 2)) *
        0.72;
      const stormTrack = Math.exp(-Math.pow((latFrac - 0.54) / 0.18, 2)) * 0.30;
      cellLatWetness[r] = Math.max(0.24, Math.min(1.65, 0.98 + itczPeak - hadleyTrough + stormTrack));
    }
  }

  const moisture = new Float32Array(numRegions);
  for (let r = 0; r < numRegions; r++) {
    moisture[r] = elevation[r] < params.seaLevel ? 0.94 : 0.46 * climate.moistureBias;
  }

  // Normalize params.raininess around 0.65 default so 0.65 == 1.0x standard continental precipitation
  const effectiveRaininess = (Math.max(0.25, params.raininess || 0.65) / 0.65) * climate.moistureBias;
  const order = new Array<number>(numRegions);
  for (let r = 0; r < numRegions; r++) order[r] = r;
  const gwx = Math.cos(baseWindRad);
  const gwy = Math.sin(baseWindRad);
  order.sort((a, b) => r_x[a] * gwx + r_y[a] * gwy - (r_x[b] * gwx + r_y[b] * gwy));

  const orderEast = climate.planetaryWinds
    ? [...order].sort((a, b) => r_x[a] - r_x[b])
    : order;
  const orderWest = climate.planetaryWinds ? [...orderEast].reverse() : order;

  for (let pass = 0; pass < 4; pass++) {
    const iterOrder = climate.planetaryWinds
      ? pass % 2 === 0
        ? orderEast
        : orderWest
      : order;

    for (const r of iterOrder) {
      const e = elevation[r];
      const wx = cellWindX[r];
      const wy = cellWindY[r];

      let upwindWeightSum = 0;
      let upwindMoistSum = 0;
      let maxUpwindElev = params.seaLevel;

      for (const n of r_neighbors[r]) {
        const dx = r_x[r] - r_x[n];
        const dy = r_y[r] - r_y[n];
        const len = Math.hypot(dx, dy) || 1;
        const dot = (dx * wx + dy * wy) / len;
        if (dot > -0.15) {
          const w = Math.max(0.08, dot + 0.25);
          upwindWeightSum += w;
          upwindMoistSum += moisture[n] * w;
          if (dot > 0.1 && elevation[n] > maxUpwindElev) {
            maxUpwindElev = elevation[n];
          }
        }
      }

      const incoming = upwindWeightSum > 0 ? upwindMoistSum / upwindWeightSum : 0.56;

      if (e < params.seaLevel) {
        // Ocean evaporates and recharges atmospheric humidity
        const recharged = Math.min(1.0, incoming * 0.45 + 0.55 * cellLatWetness[r]);
        moisture[r] = recharged;
        rainfall[r] = Math.min(1.0, 0.34 * effectiveRaininess * cellLatWetness[r]);
      } else {
        const elevGain = Math.max(0, e - maxUpwindElev);
        const altitudeFactor = Math.max(0, e - params.seaLevel - 0.12);
        const orographicCondense = elevGain * 4.2 + altitudeFactor * 0.44;
        const baseCondense = 0.62 + Math.min(0.36, orographicCondense);

        // Local storm/rainfall variation so plains & forests form organic patches
        const nx = r_x[r] / width;
        const ny = r_y[r] / height;
        const mesoscaleNoise = 0.85 + noise.fBm(nx * 5.2 + 8.3, ny * 5.2 + 1.9, 3) * 0.32;

        const rain = Math.max(
          0.03,
          Math.min(1.0, incoming * baseCondense * effectiveRaininess * cellLatWetness[r] * mesoscaleNoise)
        );
        rainfall[r] = rain;

        // Lowlands recycle most moisture; mountain ranges trigger heavy rain & moderate leeward rain shadows
        const depletion =
          elevGain > 0.025 || e > params.seaLevel + 0.26
            ? 0.032 + rain * 0.18
            : 0.008 + rain * 0.038;
        const moistureFloor =
          climateTemplate === 'Equatorial'
            ? 0.44
            : climateTemplate === 'Temperate Hearth' || climateTemplate === 'Nordic Boreal'
            ? 0.28
            : 0.12;
        moisture[r] = Math.max(moistureFloor, Math.min(0.98, incoming * 0.988 - depletion));
      }
    }
  }

  // 4. Assign Rivers via Priority-Flood Min-Heap Drainage (Strict Acyclic DAG from peaks to sea)
  const visited = new Uint8Array(numRegions);
  const heapIdx = new Int32Array(numRegions);
  const heapElev = new Float64Array(numRegions);
  let heapLen = 0;

  const heapPush = (r: number, e: number) => {
    let i = heapLen++;
    heapIdx[i] = r;
    heapElev[i] = e;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapElev[p] <= heapElev[i]) break;
      const tmpR = heapIdx[p];
      const tmpE = heapElev[p];
      heapIdx[p] = heapIdx[i];
      heapElev[p] = heapElev[i];
      heapIdx[i] = tmpR;
      heapElev[i] = tmpE;
      i = p;
    }
  };

  const heapPop = (): { r: number; e: number } => {
    const outR = heapIdx[0];
    const outE = heapElev[0];
    heapLen--;
    if (heapLen > 0) {
      heapIdx[0] = heapIdx[heapLen];
      heapElev[0] = heapElev[heapLen];
      let i = 0;
      while (true) {
        const l = i * 2 + 1;
        const rgt = l + 1;
        let smallest = i;
        if (l < heapLen && heapElev[l] < heapElev[smallest]) smallest = l;
        if (rgt < heapLen && heapElev[rgt] < heapElev[smallest]) smallest = rgt;
        if (smallest === i) break;
        const tmpR = heapIdx[i];
        const tmpE = heapElev[i];
        heapIdx[i] = heapIdx[smallest];
        heapElev[i] = heapElev[smallest];
        heapIdx[smallest] = tmpR;
        heapElev[smallest] = tmpE;
        i = smallest;
      }
    }
    return { r: outR, e: outE };
  };

  // Step 1: Flood-fill from map boundaries FIRST to identify true global Ocean (before Priority-Flood)
  const isLake = new Array<boolean>(numRegions).fill(false);
  const isOcean = new Array<boolean>(numRegions).fill(false);
  const isEndorheicSea = new Array<boolean>(numRegions).fill(false);
  const lakeElevation = new Float32Array(numRegions);
  const lakeDepth = new Float32Array(numRegions);

  const oceanQueue: number[] = [];
  for (let r = 0; r < numRegions; r++) {
    if (mesh.r_is_boundary[r] && elevation[r] < params.seaLevel) {
      isOcean[r] = true;
      oceanQueue.push(r);
    }
  }
  let oHead = 0;
  while (oHead < oceanQueue.length) {
    const curr = oceanQueue[oHead++];
    for (const n of r_neighbors[curr] || []) {
      if (!isOcean[n] && elevation[n] < params.seaLevel) {
        isOcean[n] = true;
        oceanQueue.push(n);
      }
    }
  }

  let seededOcean = 0;
  const filledElev = new Float32Array(numRegions);
  for (let r = 0; r < numRegions; r++) {
    filledElev[r] = elevation[r];
    // Seed Priority-Flood ONLY from true open ocean (not landlocked pits), so inland basins find real spillways to the sea
    if (isOcean[r]) {
      visited[r] = 1;
      heapPush(r, elevation[r]);
      seededOcean++;
    }
  }
  if (seededOcean === 0) {
    for (let r = 0; r < numRegions; r++) {
      if (mesh.r_is_boundary[r]) {
        visited[r] = 1;
        heapPush(r, elevation[r]);
      }
    }
  }

  // Priority-Flood: compute a strictly depression-free filled elevation surface draining to true ocean
  const landOrder: number[] = [];
  let epsStep = 0;
  while (heapLen > 0) {
    const { r: curr, e: currFilled } = heapPop();
    filledElev[curr] = currFilled;
    if (!isOcean[curr]) {
      landOrder.push(curr);
    }
    const nbrs = r_neighbors[curr] || [];
    for (let j = 0; j < nbrs.length; j++) {
      const n = nbrs[j];
      if (visited[n]) continue;
      visited[n] = 1;
      epsStep++;
      // Tiny strictly increasing epsilon guarantees every inland depression drains monotonically to the sea
      const nextFilled =
        elevation[n] > currFilled + 1e-5
          ? elevation[n]
          : currFilled + 1e-5 + epsStep * 1e-9;
      filledElev[n] = nextFilled;
      heapPush(n, nextFilled);
    }
  }

  // Steepest-descent downhill routing on the depression-free filledElev surface (100% acyclic DAG)
  for (let i = 0; i < landOrder.length; i++) {
    const r = landOrder[i];
    const nbrs = r_neighbors[r] || [];
    let bestTarget = -1;
    let bestDropSlope = -Infinity;
    let lowestFilled = filledElev[r];

    for (let j = 0; j < nbrs.length; j++) {
      const n = nbrs[j];
      if (filledElev[n] < filledElev[r]) {
        const dist = Math.hypot(r_x[n] - r_x[r], r_y[n] - r_y[r]) || 1;
        // Prefer steepest real gradient; in filled flats, drain directly toward lowest filled neighbor
        const drop = filledElev[r] - filledElev[n];
        const slope = drop / dist;
        if (
          bestTarget === -1 ||
          slope > bestDropSlope + 1e-7 ||
          (Math.abs(slope - bestDropSlope) <= 1e-7 && filledElev[n] < lowestFilled)
        ) {
          bestDropSlope = slope;
          lowestFilled = filledElev[n];
          bestTarget = n;
        }
      }
    }
    downhill[r] = bestTarget;
  }

  // Sort non-ocean cells strictly descending by filledElev so every upstream cell is processed before its target
  landOrder.sort((a, b) => filledElev[b] - filledElev[a]);

  for (let i = 0; i < landOrder.length; i++) {
    const r = landOrder[i];
    waterFlux[r] += rainfall[r] * 1.6 + 0.12;
    const target = downhill[r];
    if (target !== -1) {
      waterFlux[target] += waterFlux[r];
    }
  }

  // Step 2: Identify Freshwater Lakes (Priority-Flood basins) & Endorheic Inland Seas
  for (let r = 0; r < numRegions; r++) {
    if (isOcean[r]) continue;
    if (elevation[r] < params.seaLevel) {
      // Inland depression below sea level NOT connected to open ocean (Caspian / Dead Sea style endorheic basin)
      isLake[r] = true;
      isEndorheicSea[r] = true;
      lakeElevation[r] = params.seaLevel;
      lakeDepth[r] = params.seaLevel - elevation[r];
    } else {
      const depth = filledElev[r] - elevation[r];
      // Calibrated depth threshold (~30m+) preserves scenic valley/alpine lakes without swallowing river valleys
      if (depth >= 0.042 && (waterFlux[r] >= 1.4 || depth >= 0.068)) {
        isLake[r] = true;
        lakeElevation[r] = filledElev[r];
        lakeDepth[r] = depth;
      }
    }
  }

  // Step 2B: Group connected lake cells into distinct lake bodies so we can distinguish
  // isolated/endorheic/closed lakes from high-catchment draining lakes (not every lake has a river!)
  const lakeBodyId = new Int32Array(numRegions).fill(-1);
  const lakeBodyCells: number[][] = [];
  for (let r = 0; r < numRegions; r++) {
    if (!isLake[r] || lakeBodyId[r] !== -1) continue;
    const bId = lakeBodyCells.length;
    const cellsInBody: number[] = [];
    const bfs: number[] = [r];
    lakeBodyId[r] = bId;
    let head = 0;
    while (head < bfs.length) {
      const curr = bfs[head++];
      cellsInBody.push(curr);
      const nbs = r_neighbors[curr] || [];
      for (let i = 0; i < nbs.length; i++) {
        const nb = nbs[i];
        if (isLake[nb] && lakeBodyId[nb] === -1) {
          lakeBodyId[nb] = bId;
          bfs.push(nb);
        }
      }
    }
    lakeBodyCells.push(cellsInBody);
  }

  // Step 3: Classify rivers across land cells with calibrated threshold for rich drainage networks
  const effectiveMinRiverFlow = Math.max(3.4, (params.minRiverFlow || 7.2) * 0.68);
  for (let r = 0; r < numRegions; r++) {
    if (!isOcean[r] && !isLake[r] && waterFlux[r] >= effectiveMinRiverFlow) {
      isRiver[r] = true;
    }
  }

  // Determine which lake bodies are closed/isolated basins vs. high-catchment draining lakes.
  // Only wet, high-catchment lakes open a single spillway outflow river; smaller/drier/kettle lakes
  // stay naturally isolated (no rivers) or act as terminal sink lakes.
  const isClosedLakeBody = new Uint8Array(lakeBodyCells.length);
  for (let bId = 0; bId < lakeBodyCells.length; bId++) {
    const body = lakeBodyCells[bId];
    let hasEndorheic = false;
    let maxFlux = 0;
    let rainSum = 0;
    let bestSpillwayTarget = -1;
    let bestSpillwayFlux = -1;

    for (let i = 0; i < body.length; i++) {
      const r = body[i];
      if (isEndorheicSea[r]) hasEndorheic = true;
      if (waterFlux[r] > maxFlux) maxFlux = waterFlux[r];
      rainSum += rainfall[r];
      const d = downhill[r];
      if (d !== -1 && !isLake[d] && !isOcean[d] && waterFlux[r] > bestSpillwayFlux) {
        bestSpillwayFlux = waterFlux[r];
        bestSpillwayTarget = d;
      }
    }

    const avgRain = rainSum / Math.max(1, body.length);
    // Deterministic pseudo-random selector per lake body so ~45% of moderate lakes stay closed/isolated
    const h = Math.imul(body[0] * 2654435761 + body.length * 1013904223, 1597334677) >>> 0;
    const bodyRoll = (h % 1000) / 1000;

    const shouldDrain =
      !hasEndorheic &&
      bestSpillwayTarget !== -1 &&
      (
        maxFlux >= effectiveMinRiverFlow * 2.8 ||
        (maxFlux >= effectiveMinRiverFlow * 1.45 && avgRain >= 0.44 && bodyRoll < 0.55)
      );

    if (!shouldDrain) {
      isClosedLakeBody[bId] = 1;
    } else {
      // Open ONE single spillway outflow river from this draining lake
      isRiver[bestSpillwayTarget] = true;
    }
  }

  // Trace every river continuously downstream (terminating at oceans OR closed/endorheic lakes,
  // and only continuing past draining lakes through their single spillway)
  for (let r = 0; r < numRegions; r++) {
    if (isRiver[r]) {
      let curr = downhill[r];
      let depth = 0;
      while (curr !== -1 && depth < 260) {
        if (isOcean[curr]) break;
        if (isLake[curr]) {
          const bId = lakeBodyId[curr];
          if (isEndorheicSea[curr] || (bId !== -1 && isClosedLakeBody[bId])) {
            // River terminates cleanly inside this closed/endorheic lake without forcing an outflow
            break;
          }
        } else {
          isRiver[curr] = true;
        }
        curr = downhill[curr];
        depth++;
      }
    }
  }

  // Prune isolated 1-cell coastal puddles (unless they connect a lake spillway directly to the sea)
  const incomingRiverCount = new Uint16Array(numRegions);
  const isLakeOutlet = new Uint8Array(numRegions);
  for (let r = 0; r < numRegions; r++) {
    const t = downhill[r];
    if (t === -1) continue;
    if (isRiver[r] && isRiver[t]) incomingRiverCount[t]++;
    if (isLake[r] && !isLake[t] && !isOcean[t]) isLakeOutlet[t] = 1;
  }
  for (let r = 0; r < numRegions; r++) {
    if (!isRiver[r] || isLakeOutlet[r]) continue;
    const t = downhill[r];
    if (incomingRiverCount[r] === 0 && (t === -1 || isOcean[t])) {
      isRiver[r] = false;
    }
  }

  // Recompute true oceanic coastlines (exclude landlocked lake rims from oceanic wave rings & ocean ports)
  isCoast.fill(false);
  for (let r = 0; r < numRegions; r++) {
    if (!isOcean[r] && !isLake[r] && elevation[r] >= params.seaLevel) {
      for (const n of r_neighbors[r] || []) {
        if (isOcean[n]) {
          isCoast[r] = true;
          break;
        }
      }
    }
  }

  // Post-river & lakeside riparian moisture boost (riverbanks, lakeshores & estuaries support lush vegetation)
  for (let r = 0; r < numRegions; r++) {
    if (elevation[r] < params.seaLevel || isLake[r]) continue;
    const bordersLake = (r_neighbors[r] || []).some((n) => isLake[n]);
    if (isRiver[r]) {
      const fluxBoost = Math.min(0.24, 0.08 + Math.sqrt(waterFlux[r]) * 0.018);
      rainfall[r] = Math.min(1.0, rainfall[r] + fluxBoost);
    } else if (bordersLake) {
      rainfall[r] = Math.min(1.0, rainfall[r] + 0.11 * climate.moistureBias);
    } else if (isCoast[r]) {
      rainfall[r] = Math.min(1.0, rainfall[r] + 0.04 * climate.moistureBias);
    }
  }

  // 5. Assign Whittaker Biomes & Direct Relief Asset Categories
  for (let r = 0; r < numRegions; r++) {
    const manualBiome = params.biomeOverrides?.[r];
    const manualRelief = params.reliefOverrides?.[r];
    let biome = classifyWhittakerBiome(
      elevation[r],
      temperature[r],
      rainfall[r],
      params.seaLevel,
      isRiver[r]
    );
    if (elevation[r] >= params.seaLevel && manualBiome) {
      biome = manualBiome;
    }
    biomes[r] = biome;

    if (elevation[r] >= params.seaLevel && manualRelief) {
      if (manualRelief === 'clear_all') {
        reliefType[r] = null;
      } else if (manualRelief === 'clear') {
        reliefType[r] = elevation[r] >= 0.52 && !isCoast[r] ? 'mountain' : elevation[r] >= 0.42 && !isCoast[r] ? 'hill' : null;
      } else {
        reliefType[r] = manualRelief;
      }
    } else if (elevation[r] >= 0.60 || (elevation[r] >= 0.52 && !isCoast[r])) {
      reliefType[r] = 'mountain';
    } else if (elevation[r] >= 0.45 || (elevation[r] >= 0.42 && !isCoast[r])) {
      reliefType[r] = 'hill';
    } else if (biome.includes('Forest') || biome.includes('Taiga') || biome.includes('Rainforest')) {
      reliefType[r] = 'forest';
    } else if (biome.includes('Wetland')) {
      reliefType[r] = 'swamp';
    }
  }

  // 6. Assign Hillshading
  const lightX = -0.707;
  const lightY = -0.707;

  for (let r = 0; r < numRegions; r++) {
    let dzdx = 0;
    let dzdy = 0;
    const nList = r_neighbors[r];

    for (const n of nList) {
      const dx = r_x[n] - r_x[r];
      const dy = r_y[n] - r_y[r];
      const dE = elevation[n] - elevation[r];
      if (Math.abs(dx) > 1) dzdx += dE / dx;
      if (Math.abs(dy) > 1) dzdy += dE / dy;
    }

    const slope = dzdx * lightX + dzdy * lightY;
    shadedRelief[r] = Math.max(0.2, Math.min(0.85, 0.5 + slope * 28));
  }

  return {
    elevation,
    rainfall,
    temperature,
    waterFlux,
    isRiver,
    isCoast,
    isLake,
    isOcean,
    isEndorheicSea,
    lakeElevation,
    lakeDepth,
    biomes,
    shadedRelief,
    downhill,
    reliefType,
    continentIds,
  };
}

function assignContinentIds(
  mesh: VoronoiDualMesh,
  elevation: Float32Array,
  seaLevel: number,
  continentCenters: { x: number; y: number }[],
  width: number,
  height: number
): Int16Array {
  const { numRegions, r_x, r_y, r_neighbors } = mesh;
  const continentIds = new Int16Array(numRegions).fill(-1);
  const visited = new Uint8Array(numRegions);
  const components: { cells: number[]; cx: number; cy: number }[] = [];

  for (let r = 0; r < numRegions; r++) {
    if (visited[r] || elevation[r] < seaLevel) continue;
    const comp: number[] = [];
    const queue: number[] = [r];
    visited[r] = 1;
    let sumX = 0;
    let sumY = 0;
    let head = 0;
    while (head < queue.length) {
      const curr = queue[head++];
      comp.push(curr);
      sumX += r_x[curr];
      sumY += r_y[curr];
      for (const n of r_neighbors[curr]) {
        if (!visited[n] && elevation[n] >= seaLevel) {
          visited[n] = 1;
          queue.push(n);
        }
      }
    }
    components.push({
      cells: comp,
      cx: sumX / comp.length / width,
      cy: sumY / comp.length / height,
    });
  }

  if (components.length === 0) return continentIds;

  if (continentCenters.length >= 2) {
    // Map each connected landmass component to its nearest continent center
    for (const comp of components) {
      let bestK = 0;
      let bestD = Infinity;
      for (let k = 0; k < continentCenters.length; k++) {
        const d = Math.hypot(comp.cx - continentCenters[k].x, comp.cy - continentCenters[k].y);
        if (d < bestD) {
          bestD = d;
          bestK = k;
        }
      }
      for (const r of comp.cells) {
        continentIds[r] = bestK;
      }
    }
    return continentIds;
  }

  // Non-Continents templates: identify major landmasses (>= 18 cells) sorted West-to-East
  const major = components
    .filter((c) => c.cells.length >= 18)
    .sort((a, b) => (a.cx * 1.2 + a.cy * 0.25) - (b.cx * 1.2 + b.cy * 0.25))
    .slice(0, 6);

  if (major.length <= 1) {
    for (let r = 0; r < numRegions; r++) {
      if (elevation[r] >= seaLevel) continentIds[r] = 0;
    }
    return continentIds;
  }

  const majorSets = major.map((m) => new Set(m.cells));
  for (const comp of components) {
    let assigned = majorSets.findIndex((s) => s.has(comp.cells[0]));
    if (assigned === -1) {
      let bestD = Infinity;
      assigned = 0;
      for (let k = 0; k < major.length; k++) {
        const d = Math.hypot(comp.cx - major[k].cx, comp.cy - major[k].cy);
        if (d < bestD) {
          bestD = d;
          assigned = k;
        }
      }
    }
    for (const r of comp.cells) {
      continentIds[r] = assigned;
    }
  }
  return continentIds;
}

function classifyWhittakerBiome(
  elev: number,
  temp: number,
  rain: number,
  seaLevel: number,
  isRiverCell = false
): BiomeType {
  if (elev < seaLevel - 0.08) return 'Deep Ocean';
  if (elev < seaLevel) return 'Shallow Sea';

  // High alpine peaks in cold air or extreme altitude -> Glacial Tundra
  if (temp < 0.19 || elev > 0.82 || (elev > 0.70 && temp < 0.28)) {
    return 'Glacial Tundra';
  }
  // Subarctic / Boreal zone
  if (temp < 0.36) {
    if (rain >= 0.23) return 'Boreal Taiga';
    if (temp < 0.25) return 'Glacial Tundra';
    return 'Steppe Grassland';
  }
  // Temperate zone
  if (temp < 0.64) {
    if (rain >= 0.72 && elev < seaLevel + 0.13) return 'Misty Wetland';
    if (isRiverCell && rain >= 0.62 && elev < seaLevel + 0.09) return 'Misty Wetland';
    if (rain >= 0.34) return 'Temperate Forest';
    if (rain >= 0.17) return 'Steppe Grassland';
    return temp > 0.52 ? 'Arid Savanna' : 'Steppe Grassland';
  }
  // Subtropical / Tropical zone
  if (rain >= 0.68 && elev < seaLevel + 0.10) return 'Misty Wetland';
  if (rain >= 0.50) return 'Tropical Rainforest';
  if (rain >= 0.36 && temp < 0.74) return 'Temperate Forest';
  if (rain >= 0.19) return 'Arid Savanna';
  return 'Scorched Desert';
}

// ============================================================================
// GEOMORPHIC HEIGHTMAP TEMPLATE ENGINE
// Uses seeded BFS Hills, Pits, Meandering Ranges, Troughs, Straits & Smoothing
// ============================================================================

let cachedHeightfieldKey = '';
let cachedHeightfieldResult: { heights: Float32Array; continentCenters: { x: number; y: number }[] } | null = null;

function getCachedTerrainHeightfield(
  mesh: VoronoiDualMesh,
  noise: Noise2D,
  template: WorldSettings['template'],
  seaLevel: number,
  continentCount: number,
  continentConfigs: ContinentConfig[] | undefined,
  prng: PRNG,
  width: number,
  height: number,
  seed: string,
  climateTemplate?: WorldSettings['climateTemplate']
): { heights: Float32Array; continentCenters: { x: number; y: number }[] } {
  const cfgSig = continentConfigs
    ? continentConfigs.map((c) => `${c.id}:${c.sizeScale ?? 1}:${c.reliefBias ?? 1}`).join(',')
    : '';
  const key = `${seed}|${template}|${climateTemplate || ''}|${continentCount}|${seaLevel.toFixed(3)}|${cfgSig}|${width}x${height}|${mesh.numRegions}`;
  if (cachedHeightfieldResult && cachedHeightfieldKey === key) {
    return cachedHeightfieldResult;
  }
  const built = buildTerrainHeightfield(
    mesh,
    noise,
    template,
    seaLevel,
    continentCount,
    continentConfigs,
    prng,
    width,
    height,
    climateTemplate
  );
  cachedHeightfieldKey = key;
  cachedHeightfieldResult = built;
  return built;
}

function buildTerrainHeightfield(
  mesh: VoronoiDualMesh,
  noise: Noise2D,
  template: WorldSettings['template'],
  seaLevel: number,
  continentCount: number,
  continentConfigs: ContinentConfig[] | undefined,
  prng: PRNG,
  width: number,
  height: number,
  climateTemplate?: WorldSettings['climateTemplate']
): { heights: Float32Array; continentCenters: { x: number; y: number }[] } {
  const { numRegions, r_x, r_y, r_neighbors, r_is_boundary } = mesh;
  const h = new Float32Array(numRegions).fill(0.06);

  const randRange = (min: number, max: number) => min + prng.next() * (max - min);
  const randInt = (min: number, max: number) => Math.floor(randRange(min, max + 0.999));

  const findCellNearest = (nx: number, ny: number): number => {
    const tx = Math.max(0.02, Math.min(0.98, nx)) * width;
    const ty = Math.max(0.02, Math.min(0.98, ny)) * height;
    let bestR = 0;
    let bestD2 = Infinity;
    for (let r = 0; r < numRegions; r++) {
      const dx = r_x[r] - tx;
      const dy = r_y[r] - ty;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestR = r;
      }
    }
    return bestR;
  };

  // BFS Hill / Island Blob with harmonic coastal lobes & saturating blend
  const addHill = (
    count: number,
    heightDelta: number,
    rangeX: [number, number],
    rangeY: [number, number],
    blobDecay = 0.84,
    maxCap = 0.72,
    onlyOceanStart = false
  ) => {
    for (let c = 0; c < count; c++) {
      let sx = randRange(rangeX[0], rangeX[1]);
      let sy = randRange(rangeY[0], rangeY[1]);
      let start = findCellNearest(sx, sy);

      if (onlyOceanStart) {
        for (let attempt = 0; attempt < 16; attempt++) {
          if (h[start] < seaLevel - 0.04) break;
          sx = randRange(rangeX[0], rangeX[1]);
          sy = randRange(rangeY[0], rangeY[1]);
          start = findCellNearest(sx, sy);
        }
        if (h[start] >= seaLevel - 0.02) continue;
      }

      const peakH = heightDelta * randRange(0.86, 1.16);

      const change = new Float32Array(numRegions);
      const visited = new Uint8Array(numRegions);
      const queue: number[] = [start];
      visited[start] = 1;
      change[start] = peakH;

      // Multi-lobe angular harmonics produce asymmetric peninsulas, capes & coves instead of circles
      const startX = r_x[start];
      const startY = r_y[start];
      const phase2 = prng.next() * Math.PI * 2;
      const phase3 = prng.next() * Math.PI * 2;
      const amp2 = randRange(0.014, 0.036);
      const amp3 = randRange(0.008, 0.024);

      let head = 0;
      while (head < queue.length) {
        const curr = queue[head++];
        const currVal = change[curr];
        if (currVal < 0.02) continue;

        for (const n of r_neighbors[curr]) {
          if (visited[n]) continue;
          visited[n] = 1;

          const ang = Math.atan2(r_y[n] - startY, r_x[n] - startX);
          const harmonic = amp2 * Math.cos(2 * ang + phase2) + amp3 * Math.sin(3 * ang + phase3);
          const localDecay = Math.max(0.68, Math.min(0.935, blobDecay + harmonic));
          const nextVal = currVal * localDecay * randRange(0.86, 1.05);

          if (nextVal >= 0.02) {
            change[n] = nextVal;
            queue.push(n);
          }
        }
      }

      for (let r = 0; r < numRegions; r++) {
        if (change[r] > 0) {
          const headroom = Math.max(0.24, 1 - h[r] / Math.max(0.35, maxCap));
          h[r] = Math.min(maxCap, h[r] + change[r] * headroom);
        }
      }
    }
  };

  // BFS Pit / Gulf / Lagoon Carver
  const addPit = (
    count: number,
    depthDelta: number,
    rangeX: [number, number],
    rangeY: [number, number],
    blobDecay = 0.85
  ) => {
    for (let c = 0; c < count; c++) {
      const sx = randRange(rangeX[0], rangeX[1]);
      const sy = randRange(rangeY[0], rangeY[1]);
      const start = findCellNearest(sx, sy);
      const depth = depthDelta * randRange(0.85, 1.15);

      const change = new Float32Array(numRegions);
      const visited = new Uint8Array(numRegions);
      const queue: number[] = [start];
      visited[start] = 1;
      change[start] = depth;

      let head = 0;
      while (head < queue.length) {
        const curr = queue[head++];
        const currVal = change[curr];
        if (currVal < 0.018) continue;

        for (const n of r_neighbors[curr]) {
          if (visited[n]) continue;
          visited[n] = 1;
          const nextVal = currVal * blobDecay * randRange(0.88, 1.04);
          if (nextVal >= 0.018) {
            change[n] = nextVal;
            queue.push(n);
          }
        }
      }

      for (let r = 0; r < numRegions; r++) {
        if (change[r] > 0) {
          h[r] = Math.max(0.02, h[r] - change[r]);
        }
      }
    }
  };

  // Meandering path walk between two mesh cells
  const walkMeanderingPath = (start: number, end: number, wander = 0.45): number[] => {
    const path: number[] = [start];
    const used = new Uint8Array(numRegions);
    used[start] = 1;
    let curr = start;
    const endX = r_x[end];
    const endY = r_y[end];

    for (let step = 0; step < 180 && curr !== end; step++) {
      let bestN = -1;
      let bestScore = Infinity;

      for (const n of r_neighbors[curr]) {
        if (used[n]) continue;
        const d = Math.hypot(r_x[n] - endX, r_y[n] - endY);
        const jitter = d * randRange(1 - wander, 1 + wander);
        if (jitter < bestScore) {
          bestScore = jitter;
          bestN = n;
        }
      }

      if (bestN === -1) break;
      used[bestN] = 1;
      path.push(bestN);
      curr = bestN;
      if (Math.hypot(r_x[curr] - endX, r_y[curr] - endY) < 18) break;
    }
    return path;
  };

  // Mountain Range / Volcanic Spine Builder
  const addRange = (
    count: number,
    ridgeHeight: number,
    rangeX: [number, number],
    rangeY: [number, number],
    minSpan = 0.16,
    maxSpan = 0.42,
    widthDecay = 0.60,
    spreadRings = 2
  ) => {
    for (let c = 0; c < count; c++) {
      const x1 = randRange(rangeX[0], rangeX[1]);
      const y1 = randRange(rangeY[0], rangeY[1]);
      let x2 = x1;
      let y2 = y1;
      for (let attempt = 0; attempt < 22; attempt++) {
        const tx = randRange(rangeX[0], rangeX[1]);
        const ty = randRange(rangeY[0], rangeY[1]);
        const dist = Math.hypot(tx - x1, ty - y1);
        if (dist >= minSpan && dist <= maxSpan) {
          x2 = tx;
          y2 = ty;
          break;
        }
        x2 = tx;
        y2 = ty;
      }

      const start = findCellNearest(x1, y1);
      const end = findCellNearest(x2, y2);
      const spine = walkMeanderingPath(start, end, 0.48);
      if (spine.length < 2) continue;

      const delta = new Float32Array(numRegions);
      const visited = new Uint8Array(numRegions);
      let frontier: number[] = [];

      for (let i = 0; i < spine.length; i++) {
        const r = spine[i];
        const endTaper = Math.sin(((i + 0.5) / spine.length) * Math.PI);
        const bump = ridgeHeight * (0.48 + 0.52 * endTaper) * randRange(0.84, 1.18);
        delta[r] = Math.max(delta[r], bump);
        visited[r] = 1;
        frontier.push(r);
      }

      let ringDecay = widthDecay;
      for (let ring = 0; ring < spreadRings && frontier.length > 0; ring++) {
        const nextFrontier: number[] = [];
        for (const curr of frontier) {
          const baseV = delta[curr] * ringDecay;
          for (const n of r_neighbors[curr]) {
            if (visited[n]) continue;
            visited[n] = 1;
            delta[n] = baseV * randRange(0.74, 1.12);
            nextFrontier.push(n);
          }
        }
        frontier = nextFrontier;
        ringDecay *= 0.80;
      }

      for (let r = 0; r < numRegions; r++) {
        if (delta[r] > 0.01) {
          const scale = Math.max(0.42, 1 - h[r] * 0.25);
          h[r] = Math.min(0.94, h[r] + delta[r] * scale);
        }
      }
    }
  };

  // Valley / Fjord / Sea Trough Carver
  const addTrough = (
    count: number,
    depth: number,
    rangeX: [number, number],
    rangeY: [number, number],
    minSpan = 0.14,
    maxSpan = 0.40,
    widthDecay = 0.62,
    spreadRings = 2
  ) => {
    for (let c = 0; c < count; c++) {
      const x1 = randRange(rangeX[0], rangeX[1]);
      const y1 = randRange(rangeY[0], rangeY[1]);
      let x2 = randRange(rangeX[0], rangeX[1]);
      let y2 = randRange(rangeY[0], rangeY[1]);
      for (let attempt = 0; attempt < 15; attempt++) {
        const tx = randRange(rangeX[0], rangeX[1]);
        const ty = randRange(rangeY[0], rangeY[1]);
        const dist = Math.hypot(tx - x1, ty - y1);
        if (dist >= minSpan && dist <= maxSpan) {
          x2 = tx;
          y2 = ty;
          break;
        }
      }

      const start = findCellNearest(x1, y1);
      const end = findCellNearest(x2, y2);
      const path = walkMeanderingPath(start, end, 0.52);
      if (path.length < 2) continue;

      const delta = new Float32Array(numRegions);
      const visited = new Uint8Array(numRegions);
      let frontier: number[] = [];

      for (const r of path) {
        delta[r] = depth * randRange(0.85, 1.15);
        visited[r] = 1;
        frontier.push(r);
      }

      let ringDecay = widthDecay;
      for (let ring = 0; ring < spreadRings && frontier.length > 0; ring++) {
        const nextFrontier: number[] = [];
        for (const curr of frontier) {
          const baseV = delta[curr] * ringDecay;
          for (const n of r_neighbors[curr]) {
            if (visited[n]) continue;
            visited[n] = 1;
            delta[n] = baseV * randRange(0.75, 1.12);
            nextFrontier.push(n);
          }
        }
        frontier = nextFrontier;
        ringDecay *= 0.80;
      }

      for (let r = 0; r < numRegions; r++) {
        if (delta[r] > 0.01) {
          h[r] = Math.max(0.02, h[r] - delta[r]);
        }
      }
    }
  };

  // Winding Ocean Strait / Rift Builder
  const addStrait = (
    widthHops: number,
    direction: 'vertical' | 'horizontal' | 'diagonal' = 'vertical',
    posRange: [number, number] = [0.28, 0.72]
  ) => {
    const p1 = randRange(posRange[0], posRange[1]);
    const p2 = randRange(posRange[0], posRange[1]);
    let start: number;
    let end: number;

    if (direction === 'vertical') {
      start = findCellNearest(p1, 0.04);
      end = findCellNearest(p2, 0.96);
    } else if (direction === 'horizontal') {
      start = findCellNearest(0.04, p1);
      end = findCellNearest(0.96, p2);
    } else {
      const flip = prng.next() < 0.5;
      start = findCellNearest(flip ? 0.06 : 0.94, p1 * 0.75);
      end = findCellNearest(flip ? 0.94 : 0.06, 0.25 + p2 * 0.70);
    }

    const path = walkMeanderingPath(start, end, 0.58);
    const visited = new Uint8Array(numRegions);
    const dist = new Int16Array(numRegions).fill(99);
    let frontier: number[] = [];

    for (const r of path) {
      visited[r] = 1;
      dist[r] = 0;
      frontier.push(r);
    }

    for (let hop = 1; hop <= widthHops + 1 && frontier.length > 0; hop++) {
      const nextFrontier: number[] = [];
      for (const curr of frontier) {
        for (const n of r_neighbors[curr]) {
          if (visited[n]) continue;
          visited[n] = 1;
          dist[n] = hop;
          nextFrontier.push(n);
        }
      }
      frontier = nextFrontier;
    }

    for (let r = 0; r < numRegions; r++) {
      if (dist[r] <= widthHops + 1) {
        const t = Math.max(0, 1 - dist[r] / (widthHops + 1.5));
        const floorCap = 0.04 + (1 - t) * Math.max(0.04, seaLevel - 0.14);
        h[r] = Math.min(h[r], floorCap);
      }
    }
  };

  // Laplacian Height Smoothing
  const smoothHeights = (passes = 2, weight = 0.22) => {
    const tmp = new Float32Array(numRegions);
    for (let p = 0; p < passes; p++) {
      for (let r = 0; r < numRegions; r++) {
        const nbrs = r_neighbors[r];
        if (nbrs.length === 0) {
          tmp[r] = h[r];
          continue;
        }
        let sum = 0;
        for (const n of nbrs) sum += h[n];
        const avg = sum / nbrs.length;
        tmp[r] = h[r] * (1 - weight) + avg * weight;
      }
      h.set(tmp);
    }
  };

  // Track continent centers for clean post-smooth ocean-channel separation
  const continentCenters: { x: number; y: number }[] = [];
  let isEdgeAnchoredTemplate = false;

  // --------------------------------------------------------------------------
  // BUILD LANDMASS TEMPLATES (75x52 Dual Mesh)
  // --------------------------------------------------------------------------
  switch (template) {
    case 'Volcano': {
      // Dramatic central volcanic massif rising out of open sea + radiating basalt ridges + outer islets
      const vx = randRange(0.42, 0.58);
      const vy = randRange(0.42, 0.58);
      addHill(1, 0.72, [vx - 0.02, vx + 0.02], [vy - 0.02, vy + 0.02], 0.878, 0.90);
      addHill(4, 0.36, [vx - 0.11, vx + 0.11], [vy - 0.11, vy + 0.11], 0.835, 0.72);
      addRange(4, 0.32, [vx - 0.20, vx + 0.20], [vy - 0.20, vy + 0.20], 0.14, 0.28, 0.56, 2);
      // Caldera depression at summit + coastal bays
      addPit(1, 0.22, [vx - 0.02, vx + 0.02], [vy - 0.02, vy + 0.02], 0.70);
      addPit(2, 0.20, [vx - 0.16, vx + 0.16], [vy - 0.16, vy + 0.16], 0.80);
      // Curved chain of small outer volcanic islets
      addHill(10, 0.35, [0.16, 0.84], [0.18, 0.82], 0.775, 0.62, true);
      break;
    }

    case 'High Island': {
      // Rugged solitary island (Iceland / Great Britain / Madagascar) with fjords & satellite isle
      const cx = randRange(0.40, 0.60);
      const cy = randRange(0.40, 0.60);
      addHill(7, 0.38, [cx - 0.15, cx + 0.15], [cy - 0.15, cy + 0.15], 0.884, 0.70);
      addRange(2, 0.30, [cx - 0.18, cx + 0.18], [cy - 0.18, cy + 0.18], 0.18, 0.38, 0.56, 2);
      addTrough(3, 0.21, [cx - 0.20, cx + 0.20], [cy - 0.20, cy + 0.20], 0.12, 0.28, 0.55, 2);
      addPit(2, 0.20, [cx - 0.18, cx + 0.18], [cy - 0.18, cy + 0.18], 0.82);
      // Companion island + coastal skerries
      const sibX = cx < 0.5 ? randRange(0.64, 0.76) : randRange(0.24, 0.36);
      const sibY = randRange(0.32, 0.68);
      addHill(2, 0.37, [sibX - 0.04, sibX + 0.04], [sibY - 0.04, sibY + 0.04], 0.835, 0.64, true);
      addHill(8, 0.35, [0.16, 0.84], [0.18, 0.82], 0.790, 0.58, true);
      break;
    }

    case 'Low Island': {
      // Gentle fertile lowland island with sheltered bays, wetlands & coastal spits
      const cx = randRange(0.40, 0.60);
      const cy = randRange(0.40, 0.60);
      addHill(7, 0.35, [cx - 0.16, cx + 0.16], [cy - 0.15, cy + 0.15], 0.874, 0.58);
      addRange(1, 0.20, [cx - 0.16, cx + 0.16], [cy - 0.14, cy + 0.14], 0.14, 0.30, 0.55, 2);
      addPit(3, 0.22, [cx - 0.18, cx + 0.18], [cy - 0.18, cy + 0.18], 0.83);
      addTrough(2, 0.18, [cx - 0.20, cx + 0.20], [cy - 0.18, cy + 0.18], 0.12, 0.26, 0.54, 2);
      addHill(9, 0.34, [0.16, 0.84], [0.18, 0.82], 0.785, 0.56, true);
      break;
    }

    case 'Archipelago': {
      // Archipelago: shattered volcanic arcs + dozens of small & medium islands separated by open sea
      addRange(4, 0.40, [0.17, 0.83], [0.19, 0.81], 0.24, 0.52, 0.58, 2);
      addTrough(8, 0.28, [0.15, 0.85], [0.16, 0.84], 0.16, 0.38, 0.58, 2);
      // 4 medium hub islands + 26 small islands/islets across the sea
      addHill(4, 0.39, [0.20, 0.80], [0.22, 0.78], 0.835, 0.74);
      addHill(26, 0.37, [0.14, 0.86], [0.16, 0.84], 0.790, 0.66, true);
      addPit(4, 0.24, [0.18, 0.82], [0.18, 0.82], 0.82);
      break;
    }

    case 'Atoll': {
      // Delicate broken ring of coral islands enclosing a turquoise central lagoon in deep open sea
      const cx = randRange(0.45, 0.55);
      const cy = randRange(0.45, 0.55);
      const radiusX = randRange(0.21, 0.27);
      const radiusY = randRange(0.22, 0.28);
      const numNodes = 18;
      const rot = prng.next() * Math.PI * 2;
      for (let i = 0; i < numNodes; i++) {
        const ang = rot + (i / numNodes) * Math.PI * 2 + randRange(-0.10, 0.10);
        const rx = cx + Math.cos(ang) * radiusX * randRange(0.86, 1.12);
        const ry = cy + Math.sin(ang) * radiusY * randRange(0.86, 1.12);
        const isMainNode = i % 4 === 0;
        addHill(
          1,
          isMainNode ? 0.42 : 0.36,
          [Math.max(0.16, rx - 0.02), Math.min(0.84, rx + 0.02)],
          [Math.max(0.18, ry - 0.02), Math.min(0.82, ry + 0.02)],
          isMainNode ? 0.835 : 0.800,
          0.72
        );
      }
      addRange(1, 0.28, [cx - radiusX, cx + radiusX], [cy - radiusY, cy + radiusY], 0.16, 0.32, 0.56, 2);
      // Deep central lagoon + navigable channels
      addPit(1, 0.46, [cx - 0.02, cx + 0.02], [cy - 0.02, cy + 0.02], 0.865);
      addTrough(2, 0.28, [0.18, 0.82], [0.18, 0.82], 0.20, 0.38, 0.58, 2);
      addHill(2, 0.35, [cx - 0.06, cx + 0.06], [cy - 0.06, cy + 0.06], 0.77, 0.56, true);
      break;
    }

    case 'Mediterranean':
    case 'Inland Sea': {
      isEdgeAnchoredTemplate = true;
      // Continental rim framing a broad irregular central sea (land naturally anchors toward map edges)
      const rimPositions: [number, number][] = [
        [0.18, 0.16], [0.50, 0.14], [0.82, 0.16],
        [0.14, 0.50], [0.86, 0.50],
        [0.18, 0.84], [0.50, 0.86], [0.82, 0.84],
      ];
      for (const [rx, ry] of rimPositions) {
        addHill(
          2,
          0.39,
          [Math.max(0.08, rx - 0.06), Math.min(0.92, rx + 0.06)],
          [Math.max(0.08, ry - 0.05), Math.min(0.92, ry + 0.05)],
          0.875,
          0.76
        );
      }
      addRange(2, 0.35, [0.14, 0.86], [0.10, 0.28], 0.22, 0.48, 0.60, 2);
      addRange(2, 0.33, [0.14, 0.86], [0.72, 0.90], 0.22, 0.48, 0.60, 2);

      // Upgrade C: Naturalized Tectonic Rift Basin & Drowned River Valley (Ria) instead of circular craters
      const riftStart = findCellNearest(randRange(0.24, 0.34), randRange(0.38, 0.62));
      const riftEnd = findCellNearest(randRange(0.66, 0.76), randRange(0.38, 0.62));
      const riftAxis = walkMeanderingPath(riftStart, riftEnd, 0.38);
      for (const r of riftAxis) {
        h[r] = Math.max(0.04, h[r] - 0.38);
        for (const n of r_neighbors[r] || []) {
          h[n] = Math.max(0.06, h[n] - 0.27);
          for (const nn of r_neighbors[n] || []) {
            h[nn] = Math.max(0.08, h[nn] - 0.13);
          }
        }
      }
      // Secondary dendritic ria arms branching off the central rift
      addTrough(3, 0.32, [0.26, 0.74], [0.28, 0.72], 0.18, 0.36, 0.60, 2);

      if (template === 'Mediterranean') {
        // Natural drowned strait connecting the central basin to the outer ocean
        const coastExit = findCellNearest(prng.next() < 0.5 ? 0.04 : 0.96, randRange(0.38, 0.62));
        const straitPath = walkMeanderingPath(riftStart, coastExit, 0.30);
        for (const r of straitPath) {
          h[r] = Math.max(0.05, h[r] - 0.34);
          for (const n of r_neighbors[r] || []) {
            h[n] = Math.max(0.08, h[n] - 0.20);
          }
        }
      } else {
        // Inland Sea: keep basin landlocked with subtle tectonic fault-scarp arms
        addTrough(2, 0.26, [0.24, 0.48], [0.34, 0.66], 0.14, 0.28, 0.58, 2);
      }
      // Sicily / Crete / Cyprus style interior sea islands
      addHill(6, 0.36, [0.32, 0.68], [0.34, 0.66], 0.785, 0.62, true);
      break;
    }

    case 'Peninsula': {
      isEdgeAnchoredTemplate = true;
      // Continental mainland anchored organically along one edge stretching into jagged peninsulas
      const side = randInt(0, 3); // 0: West, 1: North, 2: East, 3: South
      if (side === 0) {
        addHill(6, 0.39, [0.08, 0.26], [0.18, 0.82], 0.882, 0.74);
        addHill(5, 0.35, [0.28, 0.68], [0.22, 0.78], 0.848, 0.66);
        addRange(3, 0.33, [0.12, 0.62], [0.20, 0.80], 0.20, 0.44, 0.58, 2);
      } else if (side === 1) {
        addHill(6, 0.39, [0.18, 0.82], [0.08, 0.26], 0.882, 0.74);
        addHill(5, 0.35, [0.22, 0.78], [0.28, 0.68], 0.848, 0.66);
        addRange(3, 0.33, [0.20, 0.80], [0.12, 0.62], 0.20, 0.44, 0.58, 2);
      } else if (side === 2) {
        addHill(6, 0.39, [0.74, 0.92], [0.18, 0.82], 0.882, 0.74);
        addHill(5, 0.35, [0.32, 0.72], [0.22, 0.78], 0.848, 0.66);
        addRange(3, 0.33, [0.38, 0.88], [0.20, 0.80], 0.20, 0.44, 0.58, 2);
      } else {
        addHill(6, 0.39, [0.18, 0.82], [0.74, 0.92], 0.882, 0.74);
        addHill(5, 0.35, [0.22, 0.78], [0.32, 0.72], 0.848, 0.66);
        addRange(3, 0.33, [0.20, 0.80], [0.38, 0.88], 0.20, 0.44, 0.58, 2);
      }
      addPit(3, 0.25, [0.22, 0.78], [0.22, 0.78], 0.835);
      addTrough(3, 0.23, [0.20, 0.80], [0.20, 0.80], 0.16, 0.36, 0.58, 2);
      addHill(8, 0.34, [0.16, 0.84], [0.18, 0.82], 0.785, 0.58, true);
      break;
    }

    case 'Isthmus': {
      isEdgeAnchoredTemplate = true;
      // Two opposing continental masses linked by a narrow winding mountainous land-bridge
      const flipDiag = prng.next() < 0.5;
      const lobeA: [number, number] = flipDiag ? [0.20, 0.22] : [0.20, 0.78];
      const lobeB: [number, number] = flipDiag ? [0.80, 0.78] : [0.80, 0.22];

      addHill(5, 0.38, [lobeA[0] - 0.10, lobeA[0] + 0.10], [lobeA[1] - 0.10, lobeA[1] + 0.10], 0.878, 0.74);
      addHill(5, 0.38, [lobeB[0] - 0.10, lobeB[0] + 0.10], [lobeB[1] - 0.10, lobeB[1] + 0.10], 0.878, 0.74);
      const bridgeStart = findCellNearest(lobeA[0], lobeA[1]);
      const bridgeEnd = findCellNearest(lobeB[0], lobeB[1]);
      const bridgeSpine = walkMeanderingPath(bridgeStart, bridgeEnd, 0.36);
      for (const r of bridgeSpine) {
        h[r] = Math.max(h[r], 0.54);
        for (const n of r_neighbors[r]) {
          h[n] = Math.max(h[n], 0.39);
        }
      }
      addRange(2, 0.34, [0.20, 0.80], [0.20, 0.80], 0.20, 0.44, 0.58, 2);
      // Flanking open seas on both sides of the bridge
      addPit(3, 0.34, flipDiag ? [0.64, 0.84] : [0.16, 0.36], flipDiag ? [0.16, 0.36] : [0.16, 0.36], 0.855);
      addPit(3, 0.34, flipDiag ? [0.16, 0.36] : [0.64, 0.84], flipDiag ? [0.64, 0.84] : [0.64, 0.84], 0.855);
      addHill(8, 0.34, [0.15, 0.85], [0.16, 0.84], 0.785, 0.58, true);
      break;
    }

    case 'Pangaea': {
      // Sweeping asymmetric supercontinent (curved crescent / Gondwana shape, never a squared slab)
      const cx = randRange(0.44, 0.56);
      const cy = randRange(0.45, 0.55);
      const baseAngle = prng.next() * Math.PI * 2;
      const armAngles = [baseAngle, baseAngle + randRange(1.6, 2.3), baseAngle - randRange(1.6, 2.3)];
      addHill(4, 0.39, [cx - 0.09, cx + 0.09], [cy - 0.09, cy + 0.09], 0.888, 0.76);
      for (const ang of armAngles) {
        const ax = Math.max(0.20, Math.min(0.80, cx + Math.cos(ang) * randRange(0.15, 0.23)));
        const ay = Math.max(0.22, Math.min(0.78, cy + Math.sin(ang) * randRange(0.13, 0.21)));
        addHill(3, 0.37, [ax - 0.08, ax + 0.08], [ay - 0.08, ay + 0.08], 0.878, 0.72);
      }
      addRange(3, 0.36, [0.22, 0.78], [0.22, 0.78], 0.20, 0.46, 0.60, 2);
      // Deep Tethys sea gulf biting into one flank + coastal fjords
      const gulfAng = baseAngle + Math.PI;
      const gx = Math.max(0.20, Math.min(0.80, cx + Math.cos(gulfAng) * 0.20));
      const gy = Math.max(0.20, Math.min(0.80, cy + Math.sin(gulfAng) * 0.18));
      addPit(2, 0.28, [gx - 0.07, gx + 0.07], [gy - 0.07, gy + 0.07], 0.840);
      addTrough(3, 0.21, [0.20, 0.80], [0.20, 0.80], 0.14, 0.32, 0.58, 2);
      addHill(9, 0.35, [0.14, 0.86], [0.16, 0.84], 0.790, 0.58, true);
      break;
    }

    case 'Shattered Realm': {
      // Continental landmass fractured by wide tectonic ocean rifts into jagged subcontinents
      addHill(9, 0.39, [0.21, 0.79], [0.21, 0.79], 0.882, 0.74);
      addStrait(2, 'vertical', [0.30, 0.70]);
      addStrait(2, 'horizontal', [0.30, 0.70]);
      addStrait(1, 'diagonal', [0.28, 0.72]);
      addTrough(3, 0.24, [0.18, 0.82], [0.18, 0.82], 0.16, 0.36, 0.56, 2);
      // Mountain ridges rise along the fractured subcontinent blocks
      addRange(4, 0.42, [0.18, 0.82], [0.18, 0.82], 0.18, 0.42, 0.62, 2);
      addHill(10, 0.36, [0.14, 0.86], [0.16, 0.84], 0.795, 0.58, true);
      break;
    }

    case 'Continents':
    default: {
      // Continents: truly distinct, asymmetric landmasses separated by deep navigable oceans
      const count = Math.max(2, Math.min(6, continentCount));

      if (count === 2) {
        // Place two asymmetric continents with natural oceanic separation along a randomized axis
        const mode = randInt(0, 3);
        let c1: { x: number; y: number };
        let c2: { x: number; y: number };
        if (mode === 0) {
          c1 = { x: randRange(0.22, 0.29), y: randRange(0.32, 0.68) };
          c2 = { x: randRange(0.71, 0.78), y: randRange(0.32, 0.68) };
        } else if (mode === 1) {
          c1 = { x: randRange(0.23, 0.31), y: randRange(0.26, 0.40) };
          c2 = { x: randRange(0.69, 0.77), y: randRange(0.60, 0.74) };
        } else if (mode === 2) {
          c1 = { x: randRange(0.23, 0.31), y: randRange(0.60, 0.74) };
          c2 = { x: randRange(0.69, 0.77), y: randRange(0.26, 0.40) };
        } else {
          c1 = { x: randRange(0.28, 0.72), y: randRange(0.24, 0.32) };
          c2 = { x: randRange(0.28, 0.72), y: randRange(0.68, 0.76) };
        }
        continentCenters.push(c1, c2);
      } else {
        const minSep = count === 3 ? 0.38 : count === 4 ? 0.31 : count === 5 ? 0.27 : 0.24;
        for (let i = 0; i < count; i++) {
          let bestX = 0.5;
          let bestY = 0.5;
          let bestDist = -1;
          for (let attempt = 0; attempt < 50; attempt++) {
            const cx = randRange(0.20, 0.80);
            const cy = randRange(0.23, 0.77);
            let nearest = 99;
            for (const prev of continentCenters) {
              const d = Math.hypot(cx - prev.x, (cy - prev.y) * 1.15);
              if (d < nearest) nearest = d;
            }
            if (nearest >= minSep) {
              bestX = cx;
              bestY = cy;
              bestDist = nearest;
              break;
            }
            if (nearest > bestDist) {
              bestDist = nearest;
              bestX = cx;
              bestY = cy;
            }
          }
          continentCenters.push({ x: bestX, y: bestY });
        }
      }

      // Sort continent centers West-to-East so Continent 1, 2, ... align spatially with UI controls
      continentCenters.sort((a, b) => (a.x * 1.2 + a.y * 0.25) - (b.x * 1.2 + b.y * 0.25));

      const baseSpan = count === 2 ? 0.165 : count <= 4 ? 0.128 : 0.102;
      const baseDecay = count === 2 ? 0.832 : count <= 4 ? 0.818 : 0.802;

      continentCenters.forEach((c, cIdx) => {
        const cfg = continentConfigs?.[cIdx];
        const naturalAsym =
          count === 2
            ? cIdx === 0
              ? randRange(0.98, 1.15)
              : randRange(0.84, 1.04)
            : randRange(0.86, 1.14);
        const sizeScale = Math.max(0.65, Math.min(1.45, (cfg?.sizeScale ?? 1.0) * naturalAsym));
        const reliefBias = Math.max(0.6, Math.min(1.5, cfg?.reliefBias ?? 1.0));

        const span = baseSpan * (0.72 + sizeScale * 0.28);
        const spineDecay = Math.max(0.72, Math.min(0.895, baseDecay + (sizeScale - 1.0) * 0.055));

        // 1. Asymmetric Curved Tectonic Plate Backbone (broad northern/central mass -> tapering southern/eastern horn)
        const mainAng = prng.next() * Math.PI * 2;
        const bendAng = mainAng + randRange(-0.85, 0.85);
        const startPt = {
          x: Math.max(0.11, Math.min(0.89, c.x - Math.cos(mainAng) * span * 0.92)),
          y: Math.max(0.12, Math.min(0.88, c.y - Math.sin(mainAng) * span * 0.92)),
        };
        const midPt = {
          x: Math.max(0.12, Math.min(0.88, c.x + randRange(-0.03, 0.03))),
          y: Math.max(0.13, Math.min(0.87, c.y + randRange(-0.03, 0.03))),
        };
        const endPt = {
          x: Math.max(0.10, Math.min(0.90, c.x + Math.cos(bendAng) * span * 1.12)),
          y: Math.max(0.11, Math.min(0.89, c.y + Math.sin(bendAng) * span * 1.12)),
        };

        // Stamp a connected, tapering plate chain along the curved spine
        const spineNodes: { x: number; y: number; h: number; d: number }[] = [
          { x: startPt.x, y: startPt.y, h: 0.37, d: spineDecay },
          { x: (startPt.x + midPt.x) * 0.5, y: (startPt.y + midPt.y) * 0.5, h: 0.40, d: spineDecay + 0.012 },
          { x: midPt.x, y: midPt.y, h: 0.39, d: spineDecay + 0.008 },
          { x: (midPt.x + endPt.x) * 0.5, y: (midPt.y + endPt.y) * 0.5, h: 0.35, d: spineDecay - 0.015 },
          { x: endPt.x, y: endPt.y, h: 0.31, d: spineDecay - 0.042 }, // Tapering continental cape/horn
        ];

        for (const node of spineNodes) {
          addHill(
            1,
            node.h + (sizeScale - 1.0) * 0.03,
            [node.x - 0.015, node.x + 0.015],
            [node.y - 0.015, node.y + 0.015],
            node.d,
            0.70
          );
        }

        // 2. Projecting Peninsulas & Subcontinental Arms (like Iberia, Italy, Scandinavia, Korea)
        const penCount = count <= 2 ? 3 : 2;
        for (let p = 0; p < penCount; p++) {
          const anchor = spineNodes[randInt(0, 3)];
          const sideSign = p % 2 === 0 ? 1 : -1;
          const penAng = mainAng + sideSign * randRange(0.95, 1.85);
          const penLen = span * randRange(0.58, 1.05);
          const px1 = Math.max(0.09, Math.min(0.91, anchor.x + Math.cos(penAng) * penLen * 0.52));
          const py1 = Math.max(0.10, Math.min(0.90, anchor.y + Math.sin(penAng) * penLen * 0.52));
          const px2 = Math.max(0.08, Math.min(0.92, anchor.x + Math.cos(penAng + randRange(-0.35, 0.35)) * penLen));
          const py2 = Math.max(0.09, Math.min(0.91, anchor.y + Math.sin(penAng + randRange(-0.35, 0.35)) * penLen));

          addHill(1, 0.33, [px1 - 0.01, px1 + 0.01], [py1 - 0.01, py1 + 0.01], spineDecay - 0.032, 0.62);
          addHill(1, 0.30, [px2 - 0.01, px2 + 0.01], [py2 - 0.01, py2 + 0.01], spineDecay - 0.058, 0.56);
        }

        // 3. Tectonic Mountain Cordillera running along the continent (Andes / Rockies / Alps style)
        addRange(
          count <= 2 ? 3 : 2,
          0.46 * reliefBias,
          [Math.max(0.10, c.x - span * 0.95), Math.min(0.90, c.x + span * 0.95)],
          [Math.max(0.11, c.y - span * 0.95), Math.min(0.89, c.y + span * 0.95)],
          0.18,
          0.40,
          0.66,
          2
        );

        // 4. Deep Biting Coastal Gulfs, Inland Bays & Sea Inlets carving dramatic concave shorelines
        const gulfCount = count <= 2 ? 3 : 2;
        for (let g = 0; g < gulfCount; g++) {
          const gAng = mainAng + (g % 2 === 0 ? 1 : -1) * randRange(0.75, 2.25);
          const gx = Math.max(0.08, Math.min(0.92, c.x + Math.cos(gAng) * span * randRange(0.55, 0.95)));
          const gy = Math.max(0.09, Math.min(0.91, c.y + Math.sin(gAng) * span * randRange(0.55, 0.95)));
          addPit(1, 0.31, [gx - 0.02, gx + 0.02], [gy - 0.02, gy + 0.02], 0.805);
        }
        addTrough(
          count <= 2 ? 2 : 1,
          0.25,
          [Math.max(0.10, c.x - span * 1.05), Math.min(0.90, c.x + span * 1.05)],
          [Math.max(0.11, c.y - span * 1.05), Math.min(0.89, c.y + span * 1.05)],
          0.10,
          0.24,
          0.56,
          2
        );
      });

      // Offshore archipelagos & trailing island chains
      addHill(10 + count * 2, 0.34, [0.10, 0.90], [0.11, 0.89], 0.755, 0.56, true);
      break;
    }
  }

  // Light smoothing so tectonic capes, peninsulas, and bays retain crisp continental silhouettes
  smoothHeights(1, 0.15);

  // Carve an organic, irregular open sea between Continents (heavily domain-warped with variable basin width)
  if (continentCenters.length >= 2) {
    for (let r = 0; r < numRegions; r++) {
      const nx = r_x[r] / width;
      const ny = r_y[r] / height;
      const warpX =
        (noise.fBm(nx * 2.4 + 1.3, ny * 2.4 + 4.9, 3) - 0.5) * 0.24 +
        (noise.fBm(nx * 6.0 + 8.2, ny * 6.0 + 1.7, 2) - 0.5) * 0.09;
      const warpY =
        (noise.fBm(nx * 2.4 + 7.1, ny * 2.4 + 2.4, 3) - 0.5) * 0.24 +
        (noise.fBm(nx * 6.0 + 3.5, ny * 6.0 + 9.1, 2) - 0.5) * 0.09;
      const wx = nx + warpX;
      const wy = ny + warpY;

      let d1 = Infinity;
      let d2 = Infinity;
      for (let cIdx = 0; cIdx < continentCenters.length; cIdx++) {
        const c = continentCenters[cIdx];
        const sizeScale = Math.max(0.65, Math.min(1.45, continentConfigs?.[cIdx]?.sizeScale ?? 1.0));
        const d = Math.hypot(wx - c.x, wy - c.y) / (0.65 + sizeScale * 0.35);
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) {
          d2 = d;
        }
      }

      const gap = d2 - d1;
      const widthMod = 0.45 + noise.fBm(nx * 3.1 + 5.7, ny * 3.1 + 2.8, 3) * 1.35;
      const basinHalfWidth = (continentCenters.length === 2 ? 0.078 : 0.056) * widthMod;
      if (gap < basinHalfWidth) {
        const t = gap / basinHalfWidth;
        const smoothFalloff = (1 - t) * (1 - t);
        h[r] = Math.max(0.02, h[r] - smoothFalloff * 0.34);
      }
    }
  }

  // Multi-scale fractal coastline serration, headlands, fjords & ridge relief
  for (let r = 0; r < numRegions; r++) {
    const nx = r_x[r] / width;
    const ny = r_y[r] / height;

    // Strong multi-octave domain-warped coastal fractal so shorelines look jagged & continental, never puffy blobs
    const macroCoast = (noise.domainWarp(nx * 3.4 + 1.1, ny * 3.4 + 2.7, 0.45, 4) - 0.5) * 0.22;
    const midBays = (noise.domainWarp(nx * 7.8 + 5.3, ny * 7.8 + 1.9, 0.32, 3) - 0.5) * 0.14;
    const fineFjords = (noise.fBm(nx * 16.5 + 3.4, ny * 16.5 + 7.2, 4) - 0.5) * 0.11;

    // Amplify coastal fractal modulation strongest right around seaLevel for dramatic headlands & coves
    const coastProximity = Math.exp(-Math.pow((h[r] - seaLevel) / 0.16, 2));
    let val = h[r] + (macroCoast + midBays + fineFjords) * (0.72 + coastProximity * 0.62);

    // Sharp alpine ridge detail on elevated terrain
    if (val > seaLevel + 0.05) {
      const ridge1 = noise.ridgeNoise(nx * 4.2 + 3.1, ny * 4.2 + 1.9, 4);
      const ridge2 = noise.ridgeNoise(nx * 8.4 + 6.4, ny * 8.4 + 4.3, 3);
      const highlandFactor = Math.min(1, (val - (seaLevel + 0.05)) / 0.30);
      val += (ridge1 * 0.65 + ridge2 * 0.35 - 0.32) * 0.22 * highlandFactor;
    }

    if (isEdgeAnchoredTemplate) {
      const marginNoise = (noise.fBm(nx * 7.0, ny * 7.0, 3) - 0.5) * 0.02;
      const edgeDist = Math.min(nx, 1 - nx, ny, 1 - ny) + marginNoise;
      if (edgeDist < 0.05) {
        val *= Math.pow(Math.max(0, edgeDist / 0.05), 1.6);
      }
      if (r_is_boundary[r] || edgeDist < 0.018) {
        val = 0.02;
      }
    } else {
      // Generous noise-warped ocean framing so continents stretch naturally without being squashed into round beans
      const ex = (nx - 0.5) * 1.92;
      const ey = (ny - 0.5) * 1.94;
      const radialWarp = (noise.fBm(nx * 4.5 + 2.9, ny * 4.5 + 5.7, 3) - 0.5) * 0.20;
      const rDist = Math.hypot(ex, ey) + radialWarp;
      if (rDist > 0.84) {
        const t = Math.max(0, Math.min(1, (1.04 - rDist) / 0.20));
        val *= t * t * (3 - 2 * t);
      }
      if (r_is_boundary[r] || rDist >= 1.01) {
        val = 0.02;
      }
    }

    h[r] = Math.max(0, Math.min(1, val));
  }

  // Upgrade D3: Glacial Cirques & Steep U-Shaped Fjords in High-Latitude Nordic / Glacial Templates
  if (climateTemplate === 'Nordic Boreal' || climateTemplate === 'Glacial Age') {
    const northernCoastCandidates: number[] = [];
    for (let r = 0; r < numRegions; r++) {
      const ny = r_y[r] / height;
      if (ny > 0.38 || h[r] < seaLevel) continue;
      // Must border ocean/low water to be a coastal mountain edge
      if (r_neighbors[r].some((n) => h[n] < seaLevel)) {
        northernCoastCandidates.push(r);
      }
    }
    const fjordCount = Math.min(5, Math.max(2, Math.floor(northernCoastCandidates.length / 18)));
    for (let f = 0; f < fjordCount && northernCoastCandidates.length > 0; f++) {
      const startIdx = Math.floor(prng.next() * northernCoastCandidates.length);
      const mouthR = northernCoastCandidates[startIdx];
      const mx = r_x[mouthR] / width;
      const my = r_y[mouthR] / height;
      // Carve a narrow steep-walled U-shaped fjord cutting inland (southward / slightly angled)
      const inlandX = Math.max(0.08, Math.min(0.92, mx + randRange(-0.07, 0.07)));
      const inlandY = Math.min(0.48, my + randRange(0.07, 0.14));
      const headR = findCellNearest(inlandX, inlandY);
      const fjordPath = walkMeanderingPath(mouthR, headR, 0.44);
      for (let i = 0; i < fjordPath.length; i++) {
        const cellR = fjordPath[i];
        const t = i / Math.max(1, fjordPath.length - 1);
        // Steep drowned floor near the coast rising into a glacial cirque headwall
        const floorTarget = t < 0.72 ? Math.max(0.04, seaLevel - 0.11 * (1 - t * 0.55)) : seaLevel + 0.03;
        h[cellR] = Math.min(h[cellR], floorTarget);
        // Steep glaciated valley walls flanking the fjord trough
        for (const n of r_neighbors[cellR]) {
          if (!fjordPath.includes(n) && h[n] >= seaLevel - 0.02) {
            h[n] = Math.min(0.92, h[n] + 0.065 * (1 - t * 0.3));
          }
        }
      }
    }
  }

  return { heights: h, continentCenters };
}