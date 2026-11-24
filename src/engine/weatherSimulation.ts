import { Season, WeatherEvent, WeatherType, WorldState, SeasonalState } from '../types/world';
import { PRNG } from '../utils/proceduralNoise';

export const SEASONS: Season[] = ['Spring', 'Summer', 'Autumn', 'Winter'];

export function getNextSeason(current: Season): Season {
  const idx = SEASONS.indexOf(current);
  return SEASONS[(idx + 1) % SEASONS.length];
}

export function getPreviousSeason(current: Season): Season {
  const idx = SEASONS.indexOf(current);
  return SEASONS[(idx - 1 + SEASONS.length) % SEASONS.length];
}

export function computeSeasonalState(
  phase: number,
  weatherEvent?: WeatherEvent
): SeasonalState {
  // Normalize continuous phase to [0, 4)
  const normalizedPhase = ((phase % 4) + 4) % 4;

  // Raised-cosine bell weighting centered at season integers:
  // 0: Spring, 1: Summer, 2: Autumn, 3: Winter
  // C1 continuous with 0 derivative at centers and boundaries (no visual popping)
  const weights = [0, 1, 2, 3].map((center) => {
    let dist = Math.abs(normalizedPhase - center);
    if (dist > 2) dist = 4 - dist;
    if (dist >= 1.0) return 0;
    return 0.5 * (1 + Math.cos(Math.PI * dist));
  });

  const weightSum = weights[0] + weights[1] + weights[2] + weights[3] || 1;
  const springWeight = weights[0] / weightSum;
  const summerWeight = weights[1] / weightSum;
  const autumnWeight = weights[2] / weightSum;
  const winterWeight = weights[3] / weightSum;

  // Determine current season by dominant weight for scannability
  let seasonIndex = 0;
  let maxW = springWeight;
  if (summerWeight > maxW) { maxW = summerWeight; seasonIndex = 1; }
  if (autumnWeight > maxW) { maxW = autumnWeight; seasonIndex = 2; }
  if (winterWeight > maxW) { maxW = winterWeight; seasonIndex = 3; }

  const currentSeason = SEASONS[seasonIndex];
  const nextSeason = SEASONS[(seasonIndex + 1) % 4];
  const transitionProgress = normalizedPhase - Math.floor(normalizedPhase);

  // Smooth snowline elevation (Spring thaw ~0.72, Summer alpine peak ~0.84, Autumn descent ~0.66, Winter midland blanket ~0.44)
  let baseSnowline =
    springWeight * 0.72 +
    summerWeight * 0.84 +
    autumnWeight * 0.66 +
    winterWeight * 0.44;

  if (weatherEvent?.snowlineOffset) {
    baseSnowline = Math.max(0.38, Math.min(0.88, baseSnowline + weatherEvent.snowlineOffset * 0.65));
  }

  // Pack ice alpha (peaks in deep winter, gracefully melts away)
  let packIceAlpha = Math.max(0, Math.min(1, winterWeight * 1.25 - 0.1));
  if (weatherEvent?.frozenSeaLanes) {
    packIceAlpha = Math.max(packIceAlpha, 0.85);
  }

  // River swelling multiplier (spring melt deluge vs summer steady vs winter ice-locked)
  const riverSwelling =
    springWeight * 1.45 +
    summerWeight * 1.0 +
    autumnWeight * 1.05 +
    winterWeight * 0.78;

  return {
    phase: normalizedPhase,
    currentSeason,
    nextSeason,
    transitionProgress,
    snowline: baseSnowline,
    packIceAlpha,
    riverSwelling,
    springWeight,
    summerWeight,
    autumnWeight,
    winterWeight,
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const trimmed = hex.trim();
  const rgbMatch = trimmed.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/i);
  if (rgbMatch) {
    return [
      Math.round(Number(rgbMatch[1])),
      Math.round(Number(rgbMatch[2])),
      Math.round(Number(rgbMatch[3])),
    ];
  }
  hex = trimmed.replace('#', '');
  if (hex.length === 3) {
    return [
      parseInt(hex[0] + hex[0], 16),
      parseInt(hex[1] + hex[1], 16),
      parseInt(hex[2] + hex[2], 16),
    ];
  }
  return [
    parseInt(hex.slice(0, 2), 16) || 0,
    parseInt(hex.slice(2, 4), 16) || 0,
    parseInt(hex.slice(4, 6), 16) || 0,
  ];
}

export function blend4Colors(
  c0: string,
  c1: string,
  c2: string,
  c3: string,
  w0: number,
  w1: number,
  w2: number,
  w3: number
): string {
  const [r0, g0, b0] = hexToRgb(c0);
  const [r1, g1, b1] = hexToRgb(c1);
  const [r2, g2, b2] = hexToRgb(c2);
  const [r3, g3, b3] = hexToRgb(c3);
  const r = Math.round(r0 * w0 + r1 * w1 + r2 * w2 + r3 * w3);
  const g = Math.round(g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3);
  const b = Math.round(b0 * w0 + b1 * w1 + b2 * w2 + b3 * w3);
  return `rgb(${r},${g},${b})`;
}

export function lerpColorHex(hexA: string, hexB: string, t: number): string {
  const [rA, gA, bA] = hexToRgb(hexA);
  const [rB, gB, bB] = hexToRgb(hexB);
  const r = Math.round(rA + (rB - rA) * t);
  const g = Math.round(gA + (gB - gA) * t);
  const b = Math.round(bA + (bB - bA) * t);
  return `rgb(${r},${g},${b})`;
}

export function getRandomNextSeason(current: Season): Season {
  // 70% natural progression to next season, 30% unseasonal jump or anomaly shift
  if (Math.random() < 0.7) {
    return getNextSeason(current);
  }
  const remaining = SEASONS.filter((s) => s !== current);
  return remaining[Math.floor(Math.random() * remaining.length)];
}

interface SeasonalEventTemplate {
  type: WeatherType;
  title: string;
  description: string;
  effect: string;
  snowlineOffset: number;
  frozenSeaLanes: boolean;
}

const SEASONAL_TEMPLATES: Record<Season, SeasonalEventTemplate[]> = {
  Winter: [
    {
      type: 'Sea Pack Ice',
      title: 'The Great Northern Freeze',
      description: 'A prolonged polar front seals northern coastal bays into crystalline pack ice. Caravel hulls freeze in harbor.',
      effect: 'Northern sea lanes locked in pack ice · Maritime trade delayed · Overland convoys doubled',
      snowlineOffset: -0.26,
      frozenSeaLanes: true,
    },
    {
      type: 'Heavy Blizzard',
      title: 'The Whiteout of the High Passes',
      description: 'Fierce alpine gales sweep across the mountain cordillera, burying road cairns under drifts of powder.',
      effect: 'Mountain passes impassable for heavy carts · Alpine hamlets rely on winter stores',
      snowlineOffset: -0.22,
      frozenSeaLanes: false,
    },
    {
      type: 'Alpine Whiteout',
      title: 'Boreal Glacial Squall',
      description: 'Blinding sub-zero tempests descend from the arctic ice caps, coating inland plains in frost and rimed ice.',
      effect: 'Widespread frosted terrain · Sea routes halted · Sleigh travel active',
      snowlineOffset: -0.28,
      frozenSeaLanes: true,
    },
    {
      type: 'Clear & Fair',
      title: 'Crisp Midwinter Frost',
      description: 'Clear azure skies and biting cold air settle over frosted pine forests and glittering snowfields.',
      effect: 'Dormant winter countryside · Ice sleighs glide across frozen lake basins',
      snowlineOffset: -0.18,
      frozenSeaLanes: false,
    },
  ],
  Spring: [
    {
      type: 'Spring Thaw & Deluge',
      title: 'Snowmelt Inundation of the Great Valleys',
      description: 'Torrents of alpine meltwater surge down river gorges, bursting seasonal dykes and enriching floodplains.',
      effect: 'Rivers swell with white water rapids (+40% flux) · River barge trade accelerated downstream',
      snowlineOffset: 0.04,
      frozenSeaLanes: false,
    },
    {
      type: 'Spring Thaw & Deluge',
      title: 'Torrential Vernal Rains & Flash Freshets',
      description: 'Equinoctial warm storms melt highland ice fields, filling estuary deltas with rich fertile silt.',
      effect: 'High river flux and blooming wetlands · Mountain roads muddy but open',
      snowlineOffset: 0.06,
      frozenSeaLanes: false,
    },
    {
      type: 'Clear & Fair',
      title: 'The Vernal Awakening',
      description: 'Gentle warm rains sweep over budding orchards and vivid green meadows as pack ice thaws completely.',
      effect: 'Vibrant spring bloom · Trade caravans resume full pace across all corridors',
      snowlineOffset: 0.08,
      frozenSeaLanes: false,
    },
  ],
  Summer: [
    {
      type: 'Scorching Heatwave',
      title: 'The Golden Solstice Drought',
      description: 'The midsummer sun bakes southern plains into cracked clay. Granary guards inspect dry flour stores.',
      effect: 'High heat shimmer over arid savannas · Pastures parched · Increased court stress',
      snowlineOffset: 0.16,
      frozenSeaLanes: false,
    },
    {
      type: 'Scorching Heatwave',
      title: 'Sirocco Dust Gale & Solstice Heat',
      description: 'Dry winds roll across arid plateaus and interior basins, whipping fine dust across merchant caravan roads.',
      effect: 'Dry heat haze · Desert wells heavily guarded · Nighttime travel preferred',
      snowlineOffset: 0.14,
      frozenSeaLanes: false,
    },
    {
      type: 'Clear & Fair',
      title: 'Midsummer Trade Winds',
      description: 'Steady trade breezes ripple across calm turquoise waters under warm golden daylight.',
      effect: 'Peak commercial shipping season · Maximum traffic volume along all imperial highways',
      snowlineOffset: 0.12,
      frozenSeaLanes: false,
    },
  ],
  Autumn: [
    {
      type: 'Autumn Gale & Tempest',
      title: 'The Equinoctial Sea Tempests',
      description: 'Fierce autumn squalls whip across coastal shelf waters, testing the rigging of laden merchant caravels.',
      effect: 'Rough coastal swells · Deciduous forest canopies shift into golden amber and fiery russet',
      snowlineOffset: -0.06,
      frozenSeaLanes: false,
    },
    {
      type: 'Autumn Gale & Tempest',
      title: 'Great Squall of the Amber Forests',
      description: 'Gale force autumnal winds strip leaves from great deciduous oaks and send roaring swells through river mouths.',
      effect: 'Fiery foliage displays · Caravans batten down sails and canvas carts',
      snowlineOffset: -0.08,
      frozenSeaLanes: false,
    },
    {
      type: 'Clear & Fair',
      title: 'The Golden Harvest Sun',
      description: 'Crisp morning mists give way to amber afternoon sunlight over golden rye fields and ripe vineyards.',
      effect: 'Bumper wine and harvest export shipments flowing to market towns',
      snowlineOffset: 0.0,
      frozenSeaLanes: false,
    },
  ],
};

export function generateSeasonalWeather(
  season: Season,
  world?: WorldState,
  prng?: PRNG
): WeatherEvent {
  const templates = SEASONAL_TEMPLATES[season];
  const rand = prng ? prng.next() : Math.random();
  const templateIdx = Math.floor(rand * templates.length);
  const tmpl = templates[templateIdx];

  const affectedRealm = world?.realms && world.realms.length > 0
    ? world.realms[Math.floor(rand * world.realms.length)]
    : undefined;

  return {
    id: `weather_${season.toLowerCase()}_${Date.now()}`,
    season,
    type: tmpl.type,
    title: tmpl.title,
    description: tmpl.description,
    effect: tmpl.effect,
    affectedRealmId: affectedRealm?.id,
    snowlineOffset: tmpl.snowlineOffset,
    frozenSeaLanes: tmpl.frozenSeaLanes,
  };
}

export function generateSpontaneousAnomaly(
  season: Season,
  world?: WorldState
): WeatherEvent {
  // Specifically pick an intense or disruptive weather anomaly (non Clear & Fair)
  const templates = SEASONAL_TEMPLATES[season].filter((t) => t.type !== 'Clear & Fair');
  const pool = templates.length > 0 ? templates : SEASONAL_TEMPLATES[season];
  const tmpl = pool[Math.floor(Math.random() * pool.length)];

  const affectedRealm = world?.realms && world.realms.length > 0
    ? world.realms[Math.floor(Math.random() * world.realms.length)]
    : undefined;

  return {
    id: `anomaly_${season.toLowerCase()}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    season,
    type: tmpl.type,
    title: `⚡ Climatic Anomaly: ${tmpl.title}`,
    description: tmpl.description,
    effect: tmpl.effect,
    snowlineOffset: tmpl.snowlineOffset,
    frozenSeaLanes: tmpl.frozenSeaLanes,
  };
}

import { OceanCurrentsEngine } from './oceanCurrentsEngine';

let globalHeatwaveStreak = 0;

export function recordWeatherAndTriggerDrift(
  weather: WeatherEvent,
  world: WorldState
): { driftedCells: number; summary: string } {
  if (weather.type === 'Scorching Heatwave') {
    globalHeatwaveStreak += 1;
  } else if (weather.type === 'Clear & Fair') {
    globalHeatwaveStreak = Math.max(0, globalHeatwaveStreak - 0.5);
  } else {
    globalHeatwaveStreak = 0;
  }

  if (globalHeatwaveStreak >= 2) {
    return OceanCurrentsEngine.applyClimaticDrift(world, Math.floor(globalHeatwaveStreak));
  }
  return { driftedCells: 0, summary: 'Climate Stable' };
}

