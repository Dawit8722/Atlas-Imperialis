import { BiomeType, Burg, WorldCell } from '../types/world';
import type { CommodityType } from '../types/economy';
import { PRNG } from '../utils/proceduralNoise';

export interface GeoResourceContext {
  biome?: BiomeType | string;
  elevation: number;
  temperature?: number;
  moisture?: number;
  isCoast?: boolean;
  isRiver?: boolean;
  reliefType?: WorldCell['reliefType'];
}

export function classifyClimateFlags(ctx: GeoResourceContext) {
  const b = (ctx.biome || '').toLowerCase();
  const temp = ctx.temperature ?? 0.5;
  const elev = ctx.elevation ?? 0.35;
  const moist = ctx.moisture ?? 0.5;

  const isTundra = b.includes('tundra') || temp < 0.22;
  const isTaiga = b.includes('taiga') || (!isTundra && temp < 0.36 && moist >= 0.22);
  const isCold = isTundra || isTaiga || temp < 0.37;
  const isRainforest = b.includes('rainforest') || b.includes('jungle');
  const isDesert = b.includes('desert');
  const isSavanna = b.includes('savanna');
  const isSteppe = b.includes('steppe');
  const isWetland = b.includes('wetland') || b.includes('swamp') || b.includes('marsh') || ctx.reliefType === 'swamp';
  const isTemperateForest = b.includes('temperate forest') || (!isTaiga && !isRainforest && ctx.reliefType === 'forest');
  const isForest = isTaiga || isTemperateForest || isRainforest || ctx.reliefType === 'forest';
  const isWarm = isRainforest || isDesert || isSavanna || temp >= 0.60;
  const isMildTemperate = !isCold && !isDesert && !isRainforest && temp >= 0.40 && temp <= 0.72;
  const isMountain = ctx.reliefType === 'mountain' || elev >= 0.56;
  const isHighland = isMountain || ctx.reliefType === 'hill' || elev >= 0.44;
  const isCoastal = Boolean(ctx.isCoast);
  const isRiver = Boolean(ctx.isRiver);

  return {
    temp,
    elev,
    moist,
    isTundra,
    isTaiga,
    isCold,
    isRainforest,
    isDesert,
    isSavanna,
    isSteppe,
    isWetland,
    isTemperateForest,
    isForest,
    isWarm,
    isMildTemperate,
    isMountain,
    isHighland,
    isCoastal,
    isRiver,
  };
}

/**
 * Picks a single biome- and geography-accurate primary trade commodity for a settlement site.
 */
export function evaluateGeographicSiteCommodity(
  siteType: Burg['settlementSite'] | string,
  ctx: GeoResourceContext,
  prng?: PRNG
): CommodityType {
  const f = classifyClimateFlags(ctx);
  const pick = (opts: CommodityType[]): CommodityType =>
    prng ? opts[Math.floor(prng.next() * opts.length)] : opts[0];

  // 1. Coastal & Estuary Harbors
  if (siteType === 'Estuary Harbor' || f.isCoastal) {
    if (f.isTundra) return pick(['Dried Fish', 'Furs', 'Amber']);
    if (f.isTaiga) return pick(['Dried Fish', 'Amber', 'Tar & Pitch', 'Timber']);
    if (f.isRainforest) return pick(['Spices', 'Pearls', 'Cane Sugar', 'Dyes']);
    if (f.isDesert || f.isSavanna) return pick(['Salt', 'Pearls', 'Myrrh & Resins', 'Spices']);
    return pick(['Dried Fish', 'Salt', 'Rope & Cordage', 'Wine']);
  }

  // 2. Mountain Passes & Highland Mines
  if (siteType === 'Mountain Pass' || f.isMountain) {
    if (f.isCold) return pick(['Iron', 'Silver', 'Furs', 'Coal']);
    if (f.isDesert || f.isSavanna) return pick(['Copper', 'Gems', 'Gold', 'Sulfur']);
    return pick(['Iron', 'Stone', 'Coal', 'Silver']);
  }

  // 3. River Confluences & Fertile Valleys
  if (siteType === 'River Confluence' || siteType === 'Fertile Basin') {
    if (f.isTundra) return pick(['Dried Fish', 'Furs', 'Livestock']);
    if (f.isTaiga) return pick(['Timber', 'Furs', 'Honey', 'Dried Fish']);
    if (f.isWetland) return pick(['Herbs', 'Medicinal Leeches', 'Clay & Pottery', 'Linen & Flax']);
    if (f.isRainforest) return pick(['Spices', 'Cane Sugar', 'Dyes', 'Herbs']);
    if (f.isDesert) return pick(['Cane Sugar', 'Myrrh & Resins', 'Grain', 'Clay & Pottery']);
    if (f.isSavanna) return pick(['Olive Oil', 'Livestock', 'Fine Saffron', 'Grain']);
    if (f.isSteppe) return pick(['Grain', 'Warhorses', 'Livestock', 'Wool']);
    return f.isMildTemperate && f.elev >= 0.32 ? pick(['Wine', 'Grain', 'Orchard Fruit']) : pick(['Grain', 'Linen & Flax', 'Cheese']);
  }

  // 4. General Crossroads / Inland
  if (f.isTundra) return pick(['Furs', 'Livestock', 'Iron']);
  if (f.isTaiga) return pick(['Timber', 'Furs', 'Tar & Pitch']);
  if (f.isWetland) return pick(['Herbs', 'Clay & Pottery', 'Medicinal Leeches']);
  if (f.isRainforest) return pick(['Timber', 'Spices', 'Dyes']);
  if (f.isDesert) return pick(['Salt', 'Incense', 'Myrrh & Resins']);
  if (f.isSavanna) return pick(['Livestock', 'Ivory', 'Myrrh & Resins']);
  if (f.isSteppe) return pick(['Warhorses', 'Wool', 'Livestock']);
  if (f.isTemperateForest) return pick(['Timber', 'Honey', 'Herbs', 'Furs']);
  if (f.isHighland) return pick(['Iron', 'Wool', 'Quarried Slate', 'Coal']);
  return pick(['Grain', 'Wool', 'Ale & Beer', 'Orchard Fruit']);
}

/**
 * Derives 3 realistic export goods strictly aligned with the cell's biome,
 * geography (coast, river, mountain, forest, latitude temperature), and settlement role.
 */
export function deriveRealisticBurgExports(
  burgType: Burg['type'],
  site: string,
  ctx: GeoResourceContext,
  prng: PRNG
): CommodityType[] {
  const f = classifyClimateFlags(ctx);
  const exports = new Set<CommodityType>();

  const maybeAdd = (cond: boolean, item: CommodityType, prob = 1) => {
    if (cond && (prob >= 1 || prng.next() < prob)) {
      exports.add(item);
    }
  };

  // --- STEP 1: Primary Geographic & Biome Extraction ---
  if (f.isMountain || f.isHighland) {
    exports.add(f.isDesert || f.isSavanna ? (prng.next() < 0.55 ? 'Copper' : 'Iron') : 'Iron');
    if (f.isMountain) {
      maybeAdd(true, prng.next() < 0.45 ? 'Silver' : prng.next() < 0.7 ? 'Coal' : 'Stone');
      maybeAdd(f.isDesert || f.isSavanna, prng.next() < 0.5 ? 'Gems' : 'Gold', 0.65);
      maybeAdd(f.isMildTemperate, 'Marble', 0.35);
      maybeAdd(f.isCold, 'Furs', 0.65);
      maybeAdd(true, 'Sulfur', 0.25);
    } else {
      maybeAdd(true, prng.next() < 0.5 ? 'Coal' : 'Quarried Slate');
      maybeAdd(f.isForest, 'Timber', 0.75);
      maybeAdd(!f.isDesert && !f.isRainforest, 'Wool', 0.6);
      maybeAdd(true, 'Tin', 0.35);
    }
  } else if (f.isCoastal || site === 'Estuary Harbor' || burgType.includes('Port')) {
    if (f.isTundra) {
      exports.add('Dried Fish');
      exports.add('Furs');
      maybeAdd(true, 'Amber', 0.65);
    } else if (f.isTaiga) {
      exports.add('Dried Fish');
      exports.add(prng.next() < 0.5 ? 'Timber' : 'Tar & Pitch');
      maybeAdd(true, 'Amber', 0.55);
      maybeAdd(true, 'Furs', 0.45);
    } else if (f.isRainforest) {
      exports.add('Spices');
      exports.add(prng.next() < 0.55 ? 'Pearls' : 'Dyes');
      maybeAdd(true, 'Cane Sugar', 0.6);
    } else if (f.isDesert || f.isSavanna) {
      exports.add('Salt');
      exports.add(prng.next() < 0.5 ? 'Pearls' : 'Myrrh & Resins');
      maybeAdd(f.isSavanna || f.isRiver, 'Spices', 0.55);
      maybeAdd(true, 'Dried Fish', 0.45);
    } else {
      exports.add('Dried Fish');
      exports.add('Salt');
      maybeAdd(f.temp < 0.48, 'Amber', 0.5);
      maybeAdd(f.temp >= 0.48, 'Dyes', 0.45);
      maybeAdd(true, 'Rope & Cordage', 0.4);
      maybeAdd(f.isMildTemperate && !f.isWetland, 'Wine', 0.35);
    }
  } else if (f.isTundra) {
    exports.add('Furs');
    exports.add(f.isRiver ? 'Dried Fish' : 'Livestock');
    maybeAdd(true, 'Coal', 0.4);
    maybeAdd(true, 'Stone', 0.4);
  } else if (f.isTaiga) {
    exports.add('Timber');
    exports.add('Furs');
    maybeAdd(true, prng.next() < 0.5 ? 'Tar & Pitch' : 'Beeswax Candles');
    maybeAdd(f.isRiver, 'Dried Fish', 0.6);
    maybeAdd(true, 'Honey', 0.35);
  } else if (f.isWetland) {
    exports.add(f.isRiver ? 'Medicinal Leeches' : 'Herbs');
    exports.add('Clay & Pottery');
    maybeAdd(true, 'Linen & Flax', 0.55);
    maybeAdd(true, 'Dyes', 0.45);
    maybeAdd(f.isRiver, 'Dried Fish', 0.45);
  } else if (f.isRainforest) {
    exports.add('Spices');
    exports.add(prng.next() < 0.55 ? 'Timber' : 'Dyes');
    maybeAdd(true, 'Cane Sugar', 0.6);
    maybeAdd(true, 'Herbs', 0.55);
    maybeAdd(true, 'Ivory', 0.3);
  } else if (f.isDesert) {
    exports.add('Salt');
    exports.add(prng.next() < 0.55 ? 'Myrrh & Resins' : 'Incense');
    maybeAdd(true, 'Saltpeter', 0.45);
    maybeAdd(f.isRiver, 'Cane Sugar', 0.65);
    maybeAdd(f.isRiver, 'Grain', 0.55);
  } else if (f.isSavanna) {
    exports.add('Livestock');
    exports.add(prng.next() < 0.5 ? 'Myrrh & Resins' : 'Ivory');
    maybeAdd(true, 'Olive Oil', 0.5);
    maybeAdd(true, 'Fine Saffron', 0.45);
    maybeAdd(f.isRiver, 'Cane Sugar', 0.5);
  } else if (f.isSteppe) {
    exports.add(prng.next() < 0.55 ? 'Warhorses' : 'Livestock');
    exports.add('Wool');
    maybeAdd(true, 'Tanned Leather', 0.55);
    maybeAdd(f.isRiver || f.moist >= 0.22, 'Grain', 0.7);
  } else if (f.isTemperateForest) {
    exports.add('Timber');
    exports.add(prng.next() < 0.5 ? 'Furs' : 'Honey');
    maybeAdd(true, 'Herbs', 0.55);
    maybeAdd(true, 'Tar & Pitch', 0.35);
    maybeAdd(f.isRiver, 'Grain', 0.5);
  } else {
    // Temperate Fertile Plains / River Valleys
    exports.add('Grain');
    exports.add(prng.next() < 0.5 ? 'Wool' : 'Livestock');
    maybeAdd(f.isMildTemperate, 'Wine', 0.55);
    maybeAdd(true, 'Orchard Fruit', 0.45);
    maybeAdd(true, 'Cheese', 0.4);
    maybeAdd(f.isRiver, 'Linen & Flax', 0.5);
  }

  // --- STEP 2: Urban & Institutional Craft Specialization (Strictly Climate-Valid) ---
  if (burgType === 'Capital Citadel' || burgType === 'Royal Metropolis') {
    const urbanPick: CommodityType =
      f.isRiver
        ? prng.next() < 0.5
          ? 'Fine Porcelain'
          : 'Paper & Codices'
        : f.isDesert || f.isCoastal
        ? 'Glassware'
        : 'Fine Woolen Cloth';
    exports.add(urbanPick);
    maybeAdd(true, prng.next() < 0.5 ? 'Jewelry & Regalia' : 'Parchment & Vellum', 0.5);
    maybeAdd(f.isMildTemperate && !f.isWetland, 'Wine', 0.35);
  } else if (burgType === 'Border Fortress') {
    exports.add('Steel Arms & Armor');
    maybeAdd(true, prng.next() < 0.5 ? 'Tools & Ironware' : 'Crossbow Bolts', 0.7);
  } else if (burgType === 'Ancient Sanctuary') {
    exports.add('Holy Relics');
    maybeAdd(f.isForest || f.isMildTemperate, 'Beeswax Candles', 0.7);
    maybeAdd(f.isWarm, 'Incense', 0.6);
  } else if (burgType === 'Trade Port') {
    maybeAdd(f.isWarm, 'Spices', 0.75);
    maybeAdd(!f.isTundra, 'Glassware', 0.45);
    maybeAdd(f.isCold, 'Dried Fish', 0.8);
  } else if (burgType === 'Market Town') {
    maybeAdd(!f.isTundra && !f.isDesert, 'Ale & Beer', 0.55);
    maybeAdd(true, 'Tanned Leather', 0.45);
    maybeAdd(f.isRiver || f.isCoastal, 'Glassware', 0.4);
  }

  const list = Array.from(exports).slice(0, 3);
  if (list.length === 0) list.push('Grain');
  return list;
}

/**
 * Derives realistic import demands based on what the local biome & geography lacks.
 */
export function deriveRealisticBurgImports(
  exports: CommodityType[] | string[],
  ctx: GeoResourceContext,
  burgType: Burg['type']
): CommodityType[] {
  const f = classifyClimateFlags(ctx);
  const expSet = new Set(exports);
  const needs: CommodityType[] = [];

  if (f.isTundra || f.isTaiga) {
    needs.push('Grain', 'Salt', 'Wine', 'Olive Oil', 'Iron', 'Linen & Flax', 'Tools & Ironware');
  } else if (f.isDesert || f.isSavanna) {
    needs.push('Timber', 'Grain', 'Iron', 'Tools & Ironware', 'Herbs', 'Wool', 'Wine');
  } else if (f.isRainforest || f.isWetland) {
    needs.push('Iron', 'Tools & Ironware', 'Salt', 'Grain', 'Stone', 'Wool', 'Steel Arms & Armor');
  } else if (f.isMountain || f.isHighland) {
    needs.push('Grain', 'Salt', 'Wine', 'Timber', 'Linen & Flax', 'Dried Fish', 'Livestock');
  } else if (f.isCoastal) {
    needs.push('Timber', 'Grain', 'Iron', 'Tools & Ironware', 'Wool', 'Wine', 'Steel Arms & Armor');
  } else {
    needs.push('Iron', 'Salt', 'Tools & Ironware', 'Timber', 'Dried Fish', 'Wine', 'Spices');
  }

  if (burgType === 'Capital Citadel' || burgType === 'Royal Metropolis') {
    needs.push('Silk', 'Spices', 'Fine Porcelain', 'Gold');
  } else if (burgType === 'Border Fortress') {
    needs.push('Grain', 'Blackpowder', 'Warhorses');
  }

  return Array.from(new Set(needs))
    .filter((item) => !expSet.has(item))
    .slice(0, 4);
}
