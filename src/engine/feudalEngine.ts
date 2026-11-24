import {
  WorldState,
  Burg,
  County,
  Realm,
  Character,
  Holding,
  WorldCell,
  CourtRole,
  TitleTier,
  HistoricalEvent,
  BurgEconomicLedger,
} from '../types/world';
import { computeV17StatModifier, V17Stat } from './v17TraitDB';
import {
  getGovernmentProfile,
  getRealmSovereignRank,
  stripRealmPrefix,
  getTitleTierRank,
  getLowerTitleTier,
  getHeirStyleForRealm,
  getSubordinateVassalStyle,
  isCharacterRoyalLineage,
  sanitizeNonRoyalTitle,
} from './fantasyTables';
import { generateNobleArms, syncWorldBanners } from '../utils/heraldryBridge';

let _idCounter = 0;
function generateFeudalId(prefix: string): string {
  _idCounter = (_idCounter + 1) % 1000000;
  return `${prefix}_${Date.now()}_${_idCounter}_${Math.random().toString(36).substring(2, 6)}`;
}

// ============================================================================
// 1. FEUDAL DEMESNE & TITLE TIER CALCULATIONS
// ============================================================================

export function calculateDemesneLimit(character: Character): number {
  const traits = Array.from(
    new Set([
      ...(character.v17Traits || []),
      ...(character.personalityTraits || []),
      ...(character.congenitalTraits || []),
      ...(character.physicalHealthTraits || []),
      ...(character.commanderTraits || []),
      ...(character.lifestyleTraits || []),
      ...(character.educationTrait ? [character.educationTrait] : []),
      ...(character.statusTrait ? [character.statusTrait] : []),
    ])
  );
  const traitBonus = computeV17StatModifier(traits, 'STEWARDSHIP');
  const rawStew = character.baseStewardship || 10;
  const effectiveStew = Math.max(0, Math.round(rawStew * (1 + traitBonus)));

  const tier = character.titleTier || (
    character.role === 'Monarch' ? 'King' :
    character.role === 'Vassal Duke' ? 'Duke' :
    character.role === 'Vassal Count' ? 'Count' :
    character.role === 'Lord Mayor' ? 'Mayor' :
    character.role === 'Master Artisan' || character.role === 'Peasant Folk Hero' || character.role === 'Village Bailiff' ? 'Commoner' : 'Baron'
  );

  const rankBonus =
    tier === 'Emperor' ? 5 :
    tier === 'King' ? 4 :
    tier === 'Duke' ? 3 :
    tier === 'Count' ? 2 :
    tier === 'Mayor' ? 1 :
    tier === 'Baron' ? 1 : 0;

  return Math.max(1, 3 + Math.floor(effectiveStew / 4) + rankBonus);
}

export interface PopulationBreakdown {
  urbanPop: number;
  ruralPop: number;
  totalPop: number;
}

export interface RealmMilitaryBreakdown extends PopulationBreakdown {
  avgDev: number;
  levyCount: number;
  menAtArmsTotal: number;
  heavyInfantry: number;
  knights: number;
  crossbowmen: number;
  pikemen: number;
  culturalGuard: number;
  siegeEngines: number;
  totalMobilizedForce: number;
}

export function computeBurgTerritoryPopulation(burg: Burg, world: WorldState): PopulationBreakdown {
  const urbanPop = burg.population < 50 ? Math.round(burg.population * 1000) : Math.round(burg.population || 2500);
  let ruralPop = 0;

  if (burg.cellIndices && burg.cellIndices.length > 0 && world.cells && world.cells.length > 0) {
    for (const idx of burg.cellIndices) {
      const cell = world.cells[idx];
      if (!cell) continue;
      const dens = Math.max(12, cell.populationDensity || 48);
      ruralPop += Math.round(dens * 68);
    }
  } else {
    ruralPop = Math.round(urbanPop * 1.45);
  }

  return { urbanPop, ruralPop, totalPop: urbanPop + ruralPop };
}

export function computeCountyPopulation(county: County, world: WorldState): PopulationBreakdown {
  const countyBurgs = (world.burgs || []).filter((b) => b.countyId === county.id);
  let urbanPop = 0;
  for (const b of countyBurgs) {
    urbanPop += b.population < 50 ? Math.round(b.population * 1000) : Math.round(b.population || 1500);
  }

  let ruralPop = 0;
  for (const cIdx of county.cellIndices || []) {
    const cell = world.cells?.[cIdx];
    if (!cell) continue;
    const dens = Math.max(12, cell.populationDensity || 48);
    ruralPop += Math.round(dens * 68);
  }
  if (ruralPop === 0) {
    const dev = county.development || 30;
    ruralPop = Math.round((county.cellIndices?.length || 10) * 680 * (1 + dev / 100));
  }

  return { urbanPop, ruralPop, totalPop: urbanPop + ruralPop };
}

export function computeRealmMilitaryBreakdown(realmId: string, world: WorldState): RealmMilitaryBreakdown {
  const realmBurgs = (world.burgs || []).filter((b) => b.stateId === realmId);
  const realmCounties = (world.counties || []).filter((c) => c.realmId === realmId);

  let urbanPop = 0;
  let ruralPop = 0;
  for (const b of realmBurgs) {
    urbanPop += b.population < 50 ? Math.round(b.population * 1000) : Math.round(b.population || 1500);
  }

  let devSum = 0;
  for (const cty of realmCounties) {
    devSum += cty.development || 30;
    let cRural = 0;
    for (const cIdx of cty.cellIndices || []) {
      const cell = world.cells?.[cIdx];
      if (!cell) continue;
      const dens = Math.max(12, cell.populationDensity || 48);
      cRural += Math.round(dens * 68);
    }
    if (cRural === 0) {
      cRural = Math.round((cty.cellIndices?.length || 10) * 680 * (1 + (cty.development || 30) / 100));
    }
    ruralPop += cRural;
  }

  const avgDev = realmCounties.length > 0 ? Math.round(devSum / realmCounties.length) : 35;
  const totalPop = Math.max(1, urbanPop + ruralPop);

  // Population-driven mobilization (~1.3%-1.8% levies, ~0.22%-0.34% professional Men-at-Arms)
  const devFactor = 0.72 + avgDev / 145;
  const levyCount = Math.round((urbanPop * 0.022 + ruralPop * 0.0115) * (0.80 + avgDev / 180));
  const menAtArmsTotal = Math.max(80, Math.round(totalPop * 0.0024 * devFactor));

  const heavyInfantry = Math.round(menAtArmsTotal * 0.30);
  const pikemen = Math.round(menAtArmsTotal * 0.24);
  const crossbowmen = Math.round(menAtArmsTotal * 0.20);
  const knights = Math.round(menAtArmsTotal * 0.16);
  const culturalGuard = Math.max(20, menAtArmsTotal - heavyInfantry - pikemen - crossbowmen - knights);
  const siegeEngines = Math.max(2, Math.round(menAtArmsTotal / 180));

  return {
    urbanPop,
    ruralPop,
    totalPop,
    avgDev,
    levyCount,
    menAtArmsTotal,
    heavyInfantry,
    knights,
    crossbowmen,
    pikemen,
    culturalGuard,
    siegeEngines,
    totalMobilizedForce: levyCount + menAtArmsTotal,
  };
}

export interface FeudalStandingMetrics {
  demesneHoldingsCount: number;
  demesneLevies: number;
  vassalLevies: number;
  menAtArms: number;
  totalLevies: number;
  demesneIncome: number;
  vassalTaxes: number;
  totalRevenue: number;
  maaUpkeep: number;
  courtSplendorCost: number;
  estateMaintenance: number;
  totalExpenses: number;
  monthlyNetIncome: number;
  feudalPowerScore: number;
  demesneLimit: number;
  overextensionPenalty: number;
}

function computeDirectDemesneMilitary(
  character: Character,
  world: WorldState,
  heldBurgs: Burg[],
  overextensionPenalty: number
): { demesneLevies: number; demesneIncome: number; heldTotalPop: number; avgHeldDev: number } {
  const isCommoner = [
    'Yeoman Miller',
    'Village Herbalist',
    'Wandering Bard',
    'Peasant Folk Hero',
    'Village Bailiff',
  ].includes(character.role);

  if (isCommoner) {
    return {
      demesneLevies: character.role === 'Peasant Folk Hero' ? 35 : character.role === 'Village Bailiff' ? 20 : 0,
      demesneIncome: character.role === 'Yeoman Miller' ? 1.8 : character.role === 'Village Bailiff' ? 2.2 : 0.9,
      heldTotalPop: 0,
      avgHeldDev: 25,
    };
  }

  let rawDemesneLevies = 0;
  let rawDemesneIncome = 0;
  let heldTotalPop = 0;
  let devSum = 0;

  for (const b of heldBurgs) {
    const isOccupied = (world.holdings || []).some(
      (h) =>
        (h.id === `holding_${b.id}` || h.id === b.id) &&
        h.occupiedByRealmId &&
        h.occupiedByRealmId !== b.stateId
    );
    const popStats = computeBurgTerritoryPopulation(b, world);
    heldTotalPop += isOccupied ? 0 : popStats.totalPop;
    const dev = b.developmentLevel || 30;
    devSum += dev;

    if (isOccupied) continue;

    const fortMultiplier =
      b.type === 'Capital Citadel' ? 1.15 :
      b.type === 'Border Fortress' ? 1.18 :
      b.type === 'Royal Metropolis' ? 1.05 : 1.0;

    const burgLevies = Math.round(
      (popStats.urbanPop * 0.022 + popStats.ruralPop * 0.0115) * (0.75 + dev / 160) * fortMultiplier
    );
    rawDemesneLevies += burgLevies;

    const baseTax =
      b.type === 'Royal Metropolis' ? 14.5 :
      b.type === 'Capital Citadel' ? 11.0 :
      b.type === 'Trade Port' ? 9.0 :
      b.type === 'Market Town' ? 5.2 :
      b.type === 'Border Fortress' ? 3.5 :
      b.type === 'Fishing Port' ? 2.8 : 1.6;

    rawDemesneIncome += baseTax * (1 + dev / 80);
  }

  const avgHeldDev = heldBurgs.length > 0 ? devSum / heldBurgs.length : 30;
  return {
    demesneLevies: Math.round(rawDemesneLevies * (1 - overextensionPenalty)),
    demesneIncome: Math.round(rawDemesneIncome * (1 - overextensionPenalty) * 10) / 10,
    heldTotalPop,
    avgHeldDev,
  };
}

export function calculateCharacterFeudalStanding(
  character: Character,
  world: WorldState
): FeudalStandingMetrics {
  const heldBurgs = world.burgs.filter((b) => b.ownerId === character.id);
  const demesneLimit = calculateDemesneLimit(character);
  const excess = Math.max(0, heldBurgs.length - demesneLimit);
  const overextensionPenalty = Math.min(0.9, excess * 0.2);

  const isCommoner = [
    'Yeoman Miller',
    'Village Herbalist',
    'Wandering Bard',
    'Peasant Folk Hero',
    'Village Bailiff',
  ].includes(character.role);

  const { demesneLevies, demesneIncome, heldTotalPop, avgHeldDev } = computeDirectDemesneMilitary(
    character,
    world,
    heldBurgs,
    overextensionPenalty
  );

  // 2. Hierarchical Vassal Population & Feudal Levy Obligations
  const burgsByOwner = new Map<string, Burg[]>();
  for (const b of world.burgs) {
    if (!b.ownerId) continue;
    const arr = burgsByOwner.get(b.ownerId) || [];
    arr.push(b);
    burgsByOwner.set(b.ownerId, arr);
  }

  const childrenByLiege = new Map<string, Character[]>();
  for (const c of world.characters) {
    if (!c.isAlive || !c.liegeId) continue;
    const arr = childrenByLiege.get(c.liegeId) || [];
    arr.push(c);
    childrenByLiege.set(c.liegeId, arr);
  }

  const computeVassalContribution = (
    vassal: Character,
    visited: Set<string>,
    depth: number
  ): { totalVassalForce: number; domainPop: number; taxes: number } => {
    if (visited.has(vassal.id) || depth > 4) {
      return { totalVassalForce: 0, domainPop: 0, taxes: 0 };
    }
    visited.add(vassal.id);

    const vHeld = burgsByOwner.get(vassal.id) || [];
    const vDirect = computeDirectDemesneMilitary(vassal, world, vHeld, Math.min(0.9, vassal.overextensionPenalty || 0));

    let subLevies = 0;
    let subPop = 0;
    const subVassals = childrenByLiege.get(vassal.id) || [];
    for (const sv of subVassals) {
      const sub = computeVassalContribution(sv, visited, depth + 1);
      subLevies += Math.round(sub.totalVassalForce * 0.30);
      subPop += sub.domainPop;
    }

    const totalDomainPop = vDirect.heldTotalPop + subPop;
    const vMartial = 1 + Math.max(-0.15, ((vassal.baseMartial || 10) - 10) * 0.025);
    const vMaA = totalDomainPop > 0
      ? Math.round(totalDomainPop * 0.0021 * (0.72 + vDirect.avgHeldDev / 145) * vMartial)
      : 0;

    let vTaxes = vHeld.length > 0 ? vDirect.demesneIncome : 2.5;
    return {
      totalVassalForce: vDirect.demesneLevies + subLevies + vMaA,
      domainPop: totalDomainPop,
      taxes: vTaxes,
    };
  };

  const directVassals = childrenByLiege.get(character.id) || [];
  let vassalLevies = 0;
  let vassalTaxes = 0;
  let vassalDomainPop = 0;

  const vassalLevyRate =
    character.titleTier === 'King' || character.titleTier === 'Emperor' ? 0.30 :
    character.titleTier === 'Duke' ? 0.34 :
    character.titleTier === 'Count' ? 0.36 : 0.22;
  const vassalTaxRate = 0.11;

  const visitedVassals = new Set<string>([character.id]);
  for (const vassal of directVassals) {
    const contrib = computeVassalContribution(vassal, visitedVassals, 0);
    const opinion = vassal.opinions?.[character.id] ?? 15;
    const levyFactor = opinion >= 40 ? 1.15 : opinion <= -30 ? 0.65 : opinion < 0 ? 0.88 : 1.0;
    const taxFactor = opinion >= 40 ? 1.12 : opinion <= -30 ? 0.60 : opinion < 0 ? 0.85 : 1.0;

    vassalLevies += Math.round(contrib.totalVassalForce * vassalLevyRate * levyFactor);
    vassalTaxes += Math.round(contrib.taxes * vassalTaxRate * taxFactor * 10) / 10;
    vassalDomainPop += contrib.domainPop;
  }

  // 3. Professional Men-at-Arms strictly derived from controlled + vassal population & development
  const domainPop = heldTotalPop + vassalDomainPop * 0.32;
  const martialBonus = Math.max(-0.15, ((character.baseMartial || 10) - 10) * 0.03);
  const devMult = 0.72 + (avgHeldDev || 35) / 145;

  let menAtArms = 0;
  if (isCommoner) {
    menAtArms = character.role === 'Peasant Folk Hero' ? 30 : character.role === 'Village Bailiff' ? 15 : 0;
  } else if (domainPop > 0) {
    const popBasedMaA = Math.round(domainPop * 0.0024 * devMult * (1 + martialBonus) * (1 - overextensionPenalty));
    const rankFloor =
      character.titleTier === 'King' || character.titleTier === 'Emperor' ? 180 :
      character.titleTier === 'Duke' ? 80 :
      character.titleTier === 'Count' ? 35 : 15;
    menAtArms = Math.max(rankFloor, popBasedMaA);
  } else {
    // Unlanded courtier / champion / marshal personal retinue
    const isMil = character.role === 'Marshal' || character.role === 'Court Champion' || character.role === 'Captain of the Guard';
    menAtArms = isMil ? 25 : 8;
  }

  const totalRevenue = Math.round((demesneIncome + vassalTaxes) * 10) / 10;

  // Realistic Feudal Expenses scaled with population-sized Men-at-Arms
  const maaUpkeep = Math.round(menAtArms * 0.022 * 10) / 10;
  const courtBase =
    character.titleTier === 'King' || character.titleTier === 'Emperor' ? 14.0 :
    character.titleTier === 'Duke' ? 7.2 :
    character.titleTier === 'Count' ? 3.4 :
    character.titleTier === 'Baron' || character.titleTier === 'Mayor' ? 1.4 : 0.3;
  const courtSplendorCost = isCommoner ? 0.2 : Math.round((courtBase + totalRevenue * 0.28) * 10) / 10;
  const estateBase = heldBurgs.length * 2.2;
  const estateMaintenance = isCommoner ? 0.2 : Math.round((estateBase + totalRevenue * 0.16) * 10) / 10;

  const totalExpenses = Math.round((maaUpkeep + courtSplendorCost + estateMaintenance) * 10) / 10;
  const monthlyNetIncome = Math.round((totalRevenue - totalExpenses) * 10) / 10;
  const totalLevies = demesneLevies + vassalLevies + menAtArms;

  const rankBasePower =
    character.titleTier === 'King' || character.titleTier === 'Emperor' ? 2400 :
    character.titleTier === 'Duke' ? 1000 :
    character.titleTier === 'Count' ? 400 :
    character.titleTier === 'Baron' || character.titleTier === 'Mayor' ? 150 :
    isCommoner ? 20 : 60;

  const prestigeBonus = Math.round((character.prestige || 100) * 0.20);
  const charMartialBonus = (character.baseMartial || 10) * 15;
  const feudalPowerScore = Math.max(
    10,
    Math.round(totalLevies * 0.42 + monthlyNetIncome * 8 + rankBasePower + prestigeBonus + charMartialBonus)
  );

  return {
    demesneHoldingsCount: heldBurgs.length,
    demesneLevies,
    vassalLevies,
    menAtArms,
    totalLevies,
    demesneIncome,
    vassalTaxes,
    totalRevenue,
    maaUpkeep,
    courtSplendorCost,
    estateMaintenance,
    totalExpenses,
    monthlyNetIncome,
    feudalPowerScore,
    demesneLimit,
    overextensionPenalty,
  };
}

export function recalculateFeudalDemesne(world: WorldState): void {
  // O(M) index pass prevents O(N * M) performance lag
  const holdingsByOwner = new Map<string, string[]>();
  for (const burg of world.burgs) {
    if (!burg.ownerId) continue;
    const list = holdingsByOwner.get(burg.ownerId) || [];
    list.push(burg.id);
    holdingsByOwner.set(burg.ownerId, list);
  }

  for (const char of world.characters) {
    const personallyHeld = holdingsByOwner.get(char.id) || [];
    char.heldHoldingIds = personallyHeld;
    char.demesneLimit = calculateDemesneLimit(char);

    const excess = Math.max(0, personallyHeld.length - char.demesneLimit);
    // Hard clamp penalty at 90% to prevent negative taxes/levies
    char.overextensionPenalty = Math.min(0.90, excess * 0.20);

    const metrics = calculateCharacterFeudalStanding(char, world);
    if (char.menAtArms === undefined) {
      char.menAtArms = metrics.menAtArms;
    } else {
      char.menAtArms = Math.min(metrics.menAtArms, Math.max(0, char.menAtArms));
    }

    // Harmonize treasury reserves with holdings, title tier, and cashflow
    const baseRankTreasury =
      char.titleTier === 'King' || char.titleTier === 'Emperor' ? 320 :
      char.titleTier === 'Duke' ? 180 :
      char.titleTier === 'Count' ? 85 :
      char.titleTier === 'Mayor' ? 65 :
      char.titleTier === 'Baron' ? 40 :
      ['Yeoman Miller', 'Village Herbalist', 'Wandering Bard', 'Peasant Folk Hero', 'Village Bailiff'].includes(char.role) ? 12 : 30;

    const demesneGoldBonus = char.heldHoldingIds.length * 15;
    const stewBonus = (char.baseStewardship || 10) * 4;
    
    // BUG FIX: Only initialize the treasury if it doesn't exist. 
    // Do NOT overwrite the player's bank account during gameplay!
    if (char.treasury === undefined) {
      char.treasury = Math.max(10, Math.round(baseRankTreasury + demesneGoldBonus + stewBonus + Math.max(0, metrics.monthlyNetIncome) * 4));
    }

    const rankMilBonus =
      char.titleTier === 'King' || char.titleTier === 'Emperor' ? 75 :
      char.titleTier === 'Duke' ? 40 :
      char.titleTier === 'Count' ? 20 : 8;
    const rankEconBonus =
      char.titleTier === 'King' || char.titleTier === 'Emperor' ? 45 :
      char.titleTier === 'Duke' ? 24 :
      char.titleTier === 'Count' ? 12 : 4;

    char.organicGravitas = {
      militaryAutonomy: Math.min(350, Math.max(15, Math.round(metrics.totalLevies * 0.08 + (char.baseMartial || 10) * 5 + rankMilBonus))),
      economicExtraction: Math.min(250, Math.max(10, Math.round(Math.max(0, metrics.totalRevenue) * 1.15 + (char.baseStewardship || 10) * 3.5 + rankEconBonus))),
      populistLoyalty: Math.min(200, Math.max(15, Math.round((char.baseDiplomacy || 10) * 5 + (char.loyalty ?? 55) * 0.75 + (metrics.overextensionPenalty > 0 ? -20 : 20)))),
      lineagePrestige: Math.min(180, Math.max(15, Math.round(Math.log10(1 + Math.max(0, char.prestige || 100)) * 52))),
      sovereignDebtHeld: Math.min(150, char.organicGravitas?.sovereignDebtHeld || 0),
    };
  }

  // Populate burg.vassalIds from municipal/county subordinate vassals & civic stewards
  const civicRoles = new Set([
    'Vassal Baron',
    'Lord Mayor',
    'Guildmaster',
    'Merchant Guildmaster',
    'Portmaster',
    'Master Artisan',
    'Captain of the Guard',
    'Village Bailiff',
    'Yeoman Miller',
    'Smuggler King',
  ]);
  for (const burg of world.burgs) {
    const vassalSet = new Set<string>(burg.vassalIds || []);
    for (const ch of world.characters) {
      if (!ch.isAlive || ch.id === burg.ownerId) continue;
      const inSameCounty = ch.countyId && burg.countyId && ch.countyId === burg.countyId;
      const servesOwner = burg.ownerId && ch.liegeId === burg.ownerId && inSameCounty;
      const isCountyCivic = inSameCounty && civicRoles.has(ch.role);
      if (servesOwner || isCountyCivic) {
        vassalSet.add(ch.id);
      }
    }
    burg.vassalIds = Array.from(vassalSet);
  }
}

// ============================================================================
// 2. CHAIN OF FEALTY HIERARCHY TRAVERSAL
// ============================================================================

export function getChainOfFealty(character: Character, world: WorldState): Character[] {
  const chain: Character[] = [character];
  const visited = new Set<string>([character.id]);
  const charMap = new Map<string, Character>(world.characters.map((c) => [c.id, c]));

  let current = character;
  while (current.liegeId && !visited.has(current.liegeId)) {
    visited.add(current.liegeId);
    const liege = charMap.get(current.liegeId);
    if (!liege) break;
    chain.push(liege);
    current = liege;
  }

  return chain;
}

export function getDirectVassals(ruler: Character, world: WorldState): Character[] {
  return world.characters.filter((c) => c.liegeId === ruler.id && c.isAlive);
}

// ============================================================================
// 3. GARRISONS & LEVIES
// ============================================================================

export interface GarrisonStatus {
  garrisonCount: number;
  garrisonMax: number;
  upkeepGold: number;
  upkeepFood: number;
  isSupplied: boolean;
  levyPool: number;
  leviesRaised: boolean;
  foodProductionPenalty: number;
  taxPenalty: number;
}

export function getBurgGarrisonStatus(burg: Burg, world: WorldState): GarrisonStatus {
  const popBase = burg.population < 50 ? burg.population * 1000 : (burg.population || 2500);
  const garrisonRate =
    burg.type === 'Border Fortress' ? 0.026 :
    burg.type === 'Capital Citadel' ? 0.020 :
    burg.type === 'Royal Metropolis' ? 0.015 :
    burg.type === 'Trade Port' ? 0.014 : 0.012;
  const garrisonCount = burg.garrisonCount || Math.max(40, Math.round(popBase * garrisonRate));

  const garrisonMax = burg.garrisonMax || Math.round(garrisonCount * 1.35);
  const upkeepGold = burg.garrisonUpkeepGold || Math.round(garrisonCount * 0.005 * 10) / 10;
  const upkeepFood = burg.garrisonUpkeepFood || Math.round(garrisonCount * 0.006 * 10) / 10;

  const leviesRaised = Boolean(burg.leviesRaised);
  const levyPool = burg.levyPool || Math.round(popBase * 0.042);

  // Dynamic supply based on food security
  const isSupplied = burg.foodSecurity !== 'FAMINE' && (burg.monthsOfFoodReserves === undefined || burg.monthsOfFoodReserves >= 0.5);

  return {
    garrisonCount,
    garrisonMax,
    upkeepGold,
    upkeepFood,
    isSupplied,
    levyPool,
    leviesRaised,
    foodProductionPenalty: leviesRaised ? 0.35 : 0,
    taxPenalty: leviesRaised ? 0.20 : 0,
  };
}

export function toggleLeviesRaised(burgId: string, world: WorldState): { success: boolean; message: string; raised: boolean } {
  const burg = world.burgs.find((b) => b.id === burgId);
  if (!burg) return { success: false, message: 'Settlement not found', raised: false };

  burg.leviesRaised = !burg.leviesRaised;
  const raised = burg.leviesRaised;
  const popBase = burg.population < 50 ? burg.population * 1000 : burg.population;
  const pool = burg.levyPool || Math.round(popBase * 0.042);

  const msg = raised
    ? `LEVIES MUSTERED: ${pool} militia mobilized from ${burg.name} (-35% food harvest, -20% commerce).`
    : `LEVIES DISBANDED: Conscripts returned to fields and workshops in ${burg.name}.`;

  return { success: true, message: msg, raised };
}

// ============================================================================
// 4. EXPORTS, IMPORTS & DEVELOPMENT IMPACT
// ============================================================================

export interface TradeEconomyLedger {
  exports: string[];
  imports: string[];
  fulfillmentRate: number;
  monthlyDevGrowth: number;
  growthDescription: string;
}

export function getBurgTradeLedger(burg: Burg, world: WorldState): TradeEconomyLedger {
  const exports = burg.exports && burg.exports.length > 0 ? burg.exports : [burg.tradeGood || 'Grain', 'Timber'];
  const imports = burg.imports && burg.imports.length > 0 ? burg.imports : ['Salt', 'Iron', 'Wine'];

  const connectedRoutes = (world.tradeNetwork?.routes || []).filter(
    (r) => r.fromBurgId === burg.id || r.toBurgId === burg.id
  );
  const routeBonus = Math.min(25, connectedRoutes.length * 8);

  const baseFulfillment = burg.importFulfillment || 75;
  const fulfillmentRate = Math.min(100, baseFulfillment + routeBonus);

  let monthlyDevGrowth = 0.15;
  let growthDescription = 'Modest growth driven by local agrarian yields.';

  if (fulfillmentRate >= 85) {
    monthlyDevGrowth = 0.45;
    growthDescription = 'Booming commerce! Imported goods fully satisfy regional demand and spur rapid urban growth.';
  } else if (fulfillmentRate >= 65) {
    monthlyDevGrowth = 0.28;
    growthDescription = 'Healthy trade flow. Steady development supported by merchant caravans.';
  } else {
    monthlyDevGrowth = 0.05;
    growthDescription = 'Trade bottlenecks! Shortages of vital imports stall development.';
  }

  return {
    exports,
    imports,
    fulfillmentRate,
    monthlyDevGrowth,
    growthDescription,
  };
}

// ============================================================================
// 5. BUILDING UPGRADES & INFRASTRUCTURE DEVELOPMENT
// ============================================================================

export interface BuildingDefinition {
  id: string;
  name: string;
  type: string;
  tier: number;
  cost: number;
  minDev: number;
  bonusText: string;
  icon: string;
}

export const BUILDING_CATALOG: Record<string, BuildingDefinition> = {
  slot_keep_1: { id: 'slot_keep_1', name: 'Timber Motte & Bailey', type: 'Fortress', tier: 1, cost: 160, minDev: 10, bonusText: '+250 Garrison · Fort Level 1', icon: '🏰' },
  slot_keep_2: { id: 'slot_keep_2', name: 'Ashlar Stone Keep', type: 'Fortress', tier: 2, cost: 340, minDev: 35, bonusText: '+500 Garrison · Fort Level 2 · +2.5g Tax', icon: '🏰' },
  slot_keep_3: { id: 'slot_keep_3', name: 'Concentric Royal Citadel', type: 'Fortress', tier: 3, cost: 680, minDev: 65, bonusText: '+950 Garrison · Fort Level 3 · +5.5g Tax', icon: '👑' },

  slot_walls_1: { id: 'slot_walls_1', name: 'Timber Palisade & Ditch', type: 'Walls', tier: 1, cost: 145, minDev: 10, bonusText: '+15% Defense · Garrison +150', icon: '🛡️' },
  slot_walls_2: { id: 'slot_walls_2', name: 'Curtain Ashlar Walls & Moat', type: 'Walls', tier: 2, cost: 320, minDev: 40, bonusText: '+30% Defense · Garrison +350 · +1.5g Tax', icon: '🛡️' },

  slot_guildhall_1: { id: 'slot_guildhall_1', name: 'Merchant Guild Weighhouse', type: 'Commerce', tier: 1, cost: 210, minDev: 20, bonusText: '+25% Trade Volume · +2.2g Tolls', icon: '⚖️' },
  slot_guildhall_2: { id: 'slot_guildhall_2', name: 'Chartered Commercial Bourse', type: 'Commerce', tier: 2, cost: 440, minDev: 55, bonusText: '+50% Trade Volume · +5.0g Tolls · +Gold Demand', icon: '🪙' },

  slot_mill_1: { id: 'slot_mill_1', name: 'Watermill & Grain Silo', type: 'Agriculture', tier: 1, cost: 175, minDev: 15, bonusText: '+0.15 Dev Growth/mo · 4 Mos Food Reserves', icon: '🌾' },
  slot_mill_2: { id: 'slot_mill_2', name: 'Stone Granary Vaults & Windmill', type: 'Agriculture', tier: 2, cost: 360, minDev: 45, bonusText: '+0.30 Dev Growth/mo · 8 Mos Food Reserves', icon: '🌾' },

  slot_foundry_1: { id: 'slot_foundry_1', name: 'Armory Smelter & Forge', type: 'Military', tier: 1, cost: 350, minDev: 35, bonusText: '+180 Heavy Footmen · -15% MaA Cost', icon: '⚔️' },
  slot_foundry_2: { id: 'slot_foundry_2', name: 'Master Weaponsmith Manufactory', type: 'Military', tier: 2, cost: 640, minDev: 65, bonusText: '+320 Heavy Knights & Foot · -25% MaA Cost', icon: '⚔️' },

  slot_wonder_1: { id: 'slot_wonder_1', name: 'Cathedral Archive & Scriptorium', type: 'Wonder', tier: 1, cost: 820, minDev: 60, bonusText: '+2 Learning · +60 Piety/yr · Imperial Splendor', icon: '🏛️' },
};

export function upgradeSettlementBuilding(
  burgId: string,
  slotBaseId: string,
  world: WorldState
): { success: boolean; message: string; cost: number } {
  const burg = world.burgs.find((b) => b.id === burgId);
  if (!burg) return { success: false, message: 'Settlement not found', cost: 0 };

  const owner = world.characters.find((c) => c.id === burg.ownerId);
  const dev = burg.developmentLevel || 30;

  burg.buildings = burg.buildings || [];

  // Correctly handles empty plot construction
  const existingBuilding = burg.buildings.find((b) => b.startsWith(slotBaseId));
  let nextBuildingId: string | null = null;

  if (!existingBuilding) {
    nextBuildingId = `${slotBaseId}_1`; // Construct Tier 1 from scratch
  } else if (existingBuilding.endsWith('_1')) {
    nextBuildingId = `${slotBaseId}_2`;
  } else if (existingBuilding.endsWith('_2')) {
    nextBuildingId = `${slotBaseId}_3`;
  }

  if (!nextBuildingId || !BUILDING_CATALOG[nextBuildingId]) {
    return { success: false, message: 'Building already at maximum architectural splendor!', cost: 0 };
  }

  const targetDef = BUILDING_CATALOG[nextBuildingId];
  if (dev < targetDef.minDev) {
    return { success: false, message: `Requires Development Level ${targetDef.minDev} to construct ${targetDef.name} (Current: ${dev}).`, cost: 0 };
  }

  const cost = targetDef.cost;
  const realm = world.realms?.find((r) => r.id === burg.stateId);
  const useCrownFisc = (!owner || owner.id === realm?.rulerId || owner.role === 'Monarch') && Boolean(realm);
  const availGold = useCrownFisc ? (realm?.treasury ?? 0) : (owner?.treasury ?? 0);
  if (availGold < cost) {
    return {
      success: false,
      message: `Insufficient ${useCrownFisc ? 'Crown Fisc' : 'gold'}! Requires ${cost}g (Current: ${Math.round(availGold)}g).`,
      cost: 0,
    };
  }

  // Deduct cost from Crown Fisc or vassal privy purse
  if (useCrownFisc && realm) {
    realm.treasury = Math.round((availGold - cost) * 10) / 10;
    if (realm.budget?.lastReport) {
      realm.budget.lastReport.buildingSubsidies =
        Math.round(((realm.budget.lastReport.buildingSubsidies || 0) + cost) * 10) / 10;
    }
  } else if (owner) {
    owner.treasury = Math.round((availGold - cost) * 10) / 10;
  }

  // Swap building entry
  burg.buildings = burg.buildings.filter((b) => !b.startsWith(slotBaseId));
  burg.buildings.push(nextBuildingId);

  // Apply systemic bonuses
  if (slotBaseId === 'slot_keep') {
    burg.garrisonCount = (burg.garrisonCount || 500) + 250;
    burg.garrisonMax = (burg.garrisonMax || 700) + 350;
  } else if (slotBaseId === 'slot_walls') {
    burg.garrisonCount = (burg.garrisonCount || 500) + 180;
  } else if (slotBaseId === 'slot_mill') {
    const pop = burg.population < 50 ? burg.population * 1000 : (burg.population || 2500);
    burg.population = Math.round(pop * 1.006);
    burg.carryingCapacity = (burg.carryingCapacity || Math.round(pop * 1.3)) + 1500;
  } else if (slotBaseId === 'slot_guildhall') {
    burg.tradeConnectivity = (burg.tradeConnectivity || 1.0) + 0.25;
  } else if (slotBaseId === 'slot_foundry') {
    burg.garrisonCount = (burg.garrisonCount || 500) + 180;
  } else if (slotBaseId === 'slot_wonder') {
    if (owner) {
      owner.baseLearning = (owner.baseLearning || 10) + 2;
      owner.piety = (owner.piety || 0) + 60;
    }
  }

  return {
    success: true,
    message: `INFRASTRUCTURE COMPLETE: Erected ${targetDef.name} in ${burg.name} for ${cost} gold!`,
    cost,
  };
}

export function developFiefInfrastructure(
  burgId: string,
  world: WorldState
): { success: boolean; message: string; cost: number; newDev: number } {
  const burg = world.burgs.find((b) => b.id === burgId);
  if (!burg) return { success: false, message: 'Settlement not found', cost: 0, newDev: 0 };

  const owner = world.characters.find((c) => c.id === burg.ownerId);
  const realm = world.realms?.find((r) => r.id === burg.stateId);
  const costDev = Math.max(1, Math.round(burg.developmentLevel || 20));
  const cost = Math.round(140 + costDev * 5.5);
  const useCrownFisc = (!owner || owner.id === realm?.rulerId || owner.role === 'Monarch') && Boolean(realm);
  const availGold = useCrownFisc ? (realm?.treasury ?? 0) : (owner?.treasury ?? 0);

  if (availGold < cost) {
    return {
      success: false,
      message: `Insufficient ${useCrownFisc ? 'Crown Fisc' : 'gold'}! Requires ${cost}g (Current: ${Math.round(availGold)}g).`,
      cost: 0,
      newDev: burg.developmentLevel || 30,
    };
  }

  if (useCrownFisc && realm) {
    realm.treasury = Math.round((availGold - cost) * 10) / 10;
    if (realm.budget?.lastReport) {
      realm.budget.lastReport.buildingSubsidies =
        Math.round(((realm.budget.lastReport.buildingSubsidies || 0) + cost) * 10) / 10;
    }
  } else if (owner) {
    owner.treasury = Math.round((availGold - cost) * 10) / 10;
  }

  const curDev = burg.developmentLevel || 30;
  const newDev = Math.min(100, curDev + 4);
  burg.developmentLevel = newDev;
  const pop = burg.population < 50 ? burg.population * 1000 : (burg.population || 2500);
  burg.population = Math.round(pop * 1.008);
  burg.carryingCapacity = (burg.carryingCapacity || Math.round(pop * 1.3)) + 800;

  // Accurately calculate true arithmetic mean development across all burgs in county
  const county = world.counties.find((c) => c.id === burg.countyId);
  if (county) {
    const countyBurgs = world.burgs.filter((b) => b.countyId === county.id);
    if (countyBurgs.length > 0) {
      const totalDev = countyBurgs.reduce((acc, b) => acc + (b.developmentLevel || 30), 0);
      county.development = Math.round(totalDev / countyBurgs.length);
    } else {
      county.development = newDev;
    }
  }

  return {
    success: true,
    message: `CIVIC EXPANSION: Roads paved and irrigation dug in ${burg.name}! Development elevated to ${newDev} (+4).`,
    cost,
    newDev,
  };
}

// ============================================================================
// 6. FOUNDING NEW SETTLEMENTS (THE ROYAL CHARTER)
// ============================================================================

export interface HabitableCellOption {
  cellIndex: number;
  x: number;
  y: number;
  carryingCapacity: number;
  siteType: 'Estuary Harbor' | 'River Confluence' | 'Mountain Pass' | 'Crossroads' | 'Fertile Basin';
  suggestedType: Burg['type'];
  description: string;
}

export function findHabitableCellsForRealm(realmId: string, world: WorldState): HabitableCellOption[] {
  const realm = world.realms.find((r) => r.id === realmId);
  if (!realm) return [];

  const seaLevel = world.settings?.terrainSim?.seaLevel || 0.28;
  const realmCounties = world.counties.filter((c) => c.realmId === realmId);
  const realmCellIndices = new Set<number>();
  for (const c of realmCounties) {
    for (const idx of c.cellIndices || []) realmCellIndices.add(idx);
  }

  const candidates: HabitableCellOption[] = [];

  for (const cellIdx of realmCellIndices) {
    const cell = world.cells?.[cellIdx];
    if (!cell || cell.elevation < seaLevel) continue;

    const tooClose = world.burgs.some((b) => Math.hypot(b.x - cell.x, b.y - cell.y) < 36);
    if (tooClose) continue;

    let carryingCapacity = 60;
    let siteType: HabitableCellOption['siteType'] = 'Crossroads';
    let suggestedType: Burg['type'] = 'Market Town';

    if (cell.isCoast) {
      carryingCapacity += 25;
      siteType = 'Estuary Harbor';
      suggestedType = 'Trade Port';
    } else if (cell.isRiver || (cell.riverFlow && cell.riverFlow > 0.4)) {
      carryingCapacity += 20;
      siteType = 'River Confluence';
      suggestedType = 'Farming Village';
    } else if (cell.elevation > 0.62 || cell.reliefType === 'mountain') {
      carryingCapacity += 10;
      siteType = 'Mountain Pass';
      suggestedType = 'Border Fortress';
    } else {
      carryingCapacity += 15;
      siteType = 'Fertile Basin';
      suggestedType = 'Farming Village';
    }

    const desc = `${siteType} with elevation ${(cell.elevation * 100).toFixed(0)}m, rich local soils, and open trade access.`;

    candidates.push({
      cellIndex: cellIdx,
      x: cell.x,
      y: cell.y,
      carryingCapacity,
      siteType,
      suggestedType,
      description: desc,
    });

    if (candidates.length >= 8) break;
  }

  return candidates;
}

export interface SettlementCharterParams {
  founderId: string;
  realmId: string;
  cellIndex: number;
  name: string;
  settlementType: Burg['type'];
  delegateToVassal: boolean;
  vassalRole?: CourtRole;
  world: WorldState;
}

export function issueSettlementCharter(params: SettlementCharterParams): {
  success: boolean;
  message: string;
  newBurg?: Burg;
  newVassal?: Character;
} {
  const { founderId, realmId, cellIndex, name, settlementType, delegateToVassal, vassalRole, world } = params;
  const founder = world.characters.find((c) => c.id === founderId);
  const realm = world.realms.find((r) => r.id === realmId);
  const cell = world.cells?.[cellIndex];

  if (!founder || !realm || !cell) {
    return { success: false, message: 'Invalid charter parameters.' };
  }

  const isEligible = (founder.titleTier && ['King', 'Emperor', 'Duke'].includes(founder.titleTier)) || founder.role === 'Monarch';
  if (!isEligible) {
    return { success: false, message: 'Only Kings, Emperors, and powerful Dukes hold the legal authority to issue a Royal Charter.' };
  }

  const charterCost = 150;
  const crownGold = realm.treasury ?? founder.treasury ?? 0;
  if (crownGold < charterCost) {
    return { success: false, message: `Insufficient Crown Fisc! A Royal Charter requires ${charterCost} gold (Current: ${Math.round(crownGold)}g).` };
  }

  if (realm.treasury !== undefined) {
    realm.treasury = Math.round((crownGold - charterCost) * 10) / 10;
    if (realm.budget?.lastReport) {
      realm.budget.lastReport.buildingSubsidies =
        Math.round(((realm.budget.lastReport.buildingSubsidies || 0) + charterCost) * 10) / 10;
    }
  } else {
    founder.treasury = Math.round(((founder.treasury || 0) - charterCost) * 10) / 10;
  }

  const county = world.counties.find((c) => c.cellIndices?.includes(cellIndex)) || world.counties.find((c) => c.realmId === realmId) || world.counties[0];

  const uniqueSuffix = generateFeudalId('charter');
  const burgId = `burg_${uniqueSuffix}`;
  let ownerId = founder.id;
  let newVassal: Character | undefined;

  if (delegateToVassal) {
    const desiredKind: 'port' | 'market' | 'county_fief' | 'barony' =
      settlementType === 'Border Fortress'
        ? 'barony'
        : settlementType === 'Trade Port' || settlementType === 'Royal Metropolis'
        ? 'market'
        : 'county_fief';
    const founderTier: TitleTier =
      founder.titleTier || getRealmSovereignRank(realm, founder.gender).titleTier;
    const subStyle = getSubordinateVassalStyle(realm, founderTier, 'male', name, desiredKind);
    const role: CourtRole =
      vassalRole && getTitleTierRank(
        vassalRole === 'Vassal Count' ? 'Count' : vassalRole === 'Lord Mayor' ? 'Mayor' : 'Baron'
      ) < getTitleTierRank(founderTier)
        ? vassalRole
        : subStyle.role;
    const tier: TitleTier = getLowerTitleTier(
      founderTier,
      role === 'Vassal Count' ? 'Count' : role === 'Lord Mayor' ? 'Mayor' : subStyle.titleTier
    );

    newVassal = {
      id: `char_${uniqueSuffix}`,
      name: `Lord ${name.split(' ')[0]} of House Valerius`,
      houseName: 'Valerius',
      houseMotto: 'By Charter & Blade',
      title:
        role === subStyle.role
          ? subStyle.title
          : `${tier === 'Mayor' ? 'Lord Mayor' : tier === 'Baron' ? 'Baron' : tier === 'Count' ? 'Count' : 'Reeve'} of ${name}`,
      role,
      titleTier: tier,
      gender: 'male',
      age: 32,
      birthYear: world.currentYear - 32,
      investitureYear: world.currentYear,
      isAlive: true,
      realmId: realm.id,
      countyId: county.id,
      liegeId: founder.id,
      baseDiplomacy: 12,
      baseMartial: 14,
      baseStewardship: 16,
      baseIntrigue: 10,
      baseLearning: 12,
      baseProwess: 13,
      // Fully synchronized V17 traits (no lowercase, no mutually exclusive opposites)
      personalityTraits: ['Diligent', 'Patient', 'Just'],
      v17Traits: ['Diligent', 'Patient', 'Just'],
      congenitalTraits: [],
      physicalHealthTraits: [],
      commanderTraits: ['Tactical'],
      lifestyleTraits: [],
      aiArchetype: 'Benevolent Builder',
      stress: 10,
      stressLevel: 0,
      dread: 10,
      prestige: 150,
      piety: 80,
      ambition: 'Expand the settlement into a thriving provincial trade center.',
      tragicFlaw: 'Overcautious patience',
      darkSecret: 'Forged ancient heraldic crest',
      sacredOath: 'To safeguard the chartered realm',
      knownSecrets: [],
      hooksHeld: [],
      hooksOnMe: [],
      opinions: { [founder.id]: 65 },
      coatOfArms: generateNobleArms(`house_${realm.id}_Valerius_${uniqueSuffix}`, { isLanded: tier !== 'Mayor' }),
      isNobleHouse: true,
      hasPersonalBanner: tier !== 'Mayor',
      heldHoldingIds: [burgId],
      demesneLimit: 3,
      treasury: 95,
    };

    world.characters.push(newVassal);
    ownerId = newVassal.id;
  }

  const exports = cell.isCoast ? ['Salt', 'Silk', 'Fish'] : cell.elevation > 0.6 ? ['Iron', 'Stone', 'Silver'] : ['Grain', 'Livestock', 'Wool'];
  const imports = ['Salt', 'Iron', 'Wine', 'Timber'].filter((x) => !exports.includes(x)).slice(0, 3);

// Standardized to full integer citizen counts
  const initialPop = settlementType === 'Farming Village' ? 4800 : settlementType === 'Border Fortress' ? 3800 : 10500;
  const initialGarrison = settlementType === 'Border Fortress' ? 750 : settlementType === 'Capital Citadel' ? 1000 : 350;

  const newBurg: Burg = {
    id: burgId,
    name,
    x: cell.x,
    y: cell.y,
    population: initialPop,
    stateId: realm.id,
    countyId: county.id,
    isCapital: false,
    type: settlementType,
    tier: settlementType === 'Farming Village' ? 'village' : settlementType === 'Border Fortress' ? 'citadel' : 'town',
    tradeGood: exports[0] || 'Grain',
    culture: realm.culture,
    lore: `Chartered in Anno ${world.currentYear} by ${founder.name} to cultivate regional dominion.`,
    settlementSite: cell.isCoast ? 'Estuary Harbor' : cell.elevation > 0.6 ? 'Mountain Pass' : 'Fertile Basin',
    ownerId,
    rulerTitle: delegateToVassal && newVassal ? newVassal.title : founder.title,
    cellIndex,
    developmentLevel: 28,
    buildings: ['slot_keep_1', 'slot_walls_1'],
    exports,
    imports,
    importFulfillment: 85,
    garrisonCount: initialGarrison,
    garrisonMax: Math.round(initialGarrison * 1.35),
    garrisonUpkeepGold: Math.round(initialGarrison * 0.005 * 10) / 10,
    garrisonUpkeepFood: Math.round(initialGarrison * 0.006 * 10) / 10,
    levyPool: Math.round(initialPop * 0.042),
    leviesRaised: false,
    tradeConnectivity: cell.isCoast ? 1.4 : 1.0,
    foodSecurity: 'SECURE',
    monthsOfFoodReserves: 8,
  };

  world.burgs.push(newBurg);

  const newHolding: Holding = {
    id: `holding_${burgId}`,
    name: `${name} ${settlementType === 'Border Fortress' ? 'Castle' : 'City'}`,
    estateType: settlementType === 'Border Fortress' ? 'Castle' : 'City',
    provinceId: county.id,
    baseTax: 25,
    baseLevy: initialGarrison,
    dev: 28,
    adminOverhead: 8,
    ownerId,
  };
  world.holdings = world.holdings || [];
  world.holdings.push(newHolding);

  const chronicle: HistoricalEvent = {
    id: generateFeudalId('hist_charter'),
    year: world.currentYear,
    title: `Royal Charter Proclaimed: Foundation of ${name}`,
    category: 'Coronation',
    description: `${founder.name} affixed the royal seal to the Imperial Charter of ${name}.`,
    realmId: realm.id,
    primaryActorId: founder.id,
    secondaryActorId: delegateToVassal && newVassal ? newVassal.id : undefined,
  };
  world.history.unshift(chronicle);
  world.burgRevision = (world.burgRevision || 0) + 1;
  world.paintRevision = (world.paintRevision || 0) + 1;

  recalculateFeudalDemesne(world);

  return {
    success: true,
    message: `ROYAL CHARTER SEALED: Founded ${settlementType} "${name}"! Dispatched settlers, stonemasons, and banner guard.`,
    newBurg,
    newVassal,
  };
}

// ============================================================================
// 10. BURG ECONOMIC LEDGER & DEVELOPMENT SLOTS
// ============================================================================

export interface DevelopmentSlotState {
  id: string;
  name: string;
  category: 'Military' | 'Economic' | 'Civic' | 'Ecclesiastical' | 'Infrastructure';
  tier: number;
  maxTier: number;
  cost: number;
  effectDescription: string;
  isBuilt: boolean;
  canUpgrade: boolean;
  iconName: string;
}

export function calculateBurgEconomicLedger(burg: Burg, world: WorldState): BurgEconomicLedger {
  const dev = burg.developmentLevel || 15;
  
  // FIX: Normalize population so 20,000 becomes 20.0k
  const popK = (burg.population || 2500) / 1000;

  const buildingsCount = burg.buildings?.length || 2;
  const area = burg.areaKm2 || 120;

  // Base tax: land revenue, poll taxes, agrarian yields
  const landModifier = Math.min(2.5, Math.max(0.6, area / 150));
  const baseTax = Math.round((popK * 2.2 + dev * 0.75 + buildingsCount * 1.8) * landModifier * 10) / 10;

  // Trade tolls: road/sea commerce, customs gates, harbor dues
  const connectivity = burg.tradeConnectivity || (burg.tier === 'port' || burg.type.includes('Port') ? 1.4 : 1.0);
  const routeCount = burg.connectedRouteCount || 1;
  const tradeTolls = Math.round((routeCount * 4.2 + dev * 0.65) * connectivity * 10) / 10;

  const isOccupied = (world.holdings || []).some(
    (h) =>
      (h.id === `holding_${burg.id}` || h.id === burg.id) &&
      h.occupiedByRealmId &&
      h.occupiedByRealmId !== burg.stateId
  );

  // Total municipal gross revenue (occupied burgs lose 75% civic output & owe 0 tithe/levies to liege)
  const rawRevenue = Math.round((baseTax + tradeTolls) * 10) / 10;
  const totalRevenue = isOccupied ? Math.round(rawRevenue * 0.25 * 10) / 10 : rawRevenue;

  // Feudal tithe owed to lord/liege (typically 24% to 30% depending on autonomy; 0 when occupied)
  const titheRate = isOccupied ? 0 : 0.28;
  const titheToLiege = Math.round(totalRevenue * titheRate * 10) / 10;

  // Garrison & town watch upkeep (salaries, rations, gate armaments)
  const garrisonCount = burg.garrisonCount || Math.round(burg.population || 2500) * 0.035;
  const garrisonUpkeep = burg.garrisonUpkeepGold ?? (Math.round(garrisonCount * 0.005 * 10) / 10);

  // Civic & infrastructure maintenance (walls, paving, docks dredging, granary roofs, aqueducts)
  const civicMaintenance = Math.round((totalRevenue * 0.24 + buildingsCount * 1.2) * 10) / 10;

  // Municipal administrative overhead (bailiff court records, guild regulation, night watch, weighmasters)
  const adminOverhead = Math.round((totalRevenue * 0.20 + (dev / 20) * 1.5) * 10) / 10;

  // Total municipal expenses
  const totalExpenses = Math.round((titheToLiege + garrisonUpkeep + civicMaintenance + adminOverhead) * 10) / 10;

  // Net monthly gold surplus remaining in municipal treasury (tight 4% to 8% margin, non-inflationary)
  const netMonthlyGold = Math.round((totalRevenue - totalExpenses) * 10) / 10;

  // Levy contribution to liege's banner (0 while enemy occupies holding)
  const levyContribution = isOccupied ? 0 : Math.round((burg.levyPool || (burg.population || 2500) * 0.04));

  // Food surplus monthly (carrying capacity vs population)
  const capacity = burg.carryingCapacity || Math.round((burg.population || 2500) * 1.35);
  const foodSurplusMonthly = Math.round(((capacity - (burg.population || 2500)) / 1000) * 45);

  return {
    baseTax,
    tradeTolls,
    totalRevenue,
    titheToLiege,
    garrisonUpkeep,
    civicMaintenance,
    adminOverhead,
    totalExpenses,
    netMonthlyGold,
    levyContribution,
    foodSurplusMonthly,
  };
}

export function getBurgDevelopmentSlots(burg: Burg, world: WorldState): DevelopmentSlotState[] {
  const buildings = burg.buildings || [];
  const hasBuilding = (namePrefix: string) => buildings.some((b) => b.toLowerCase().includes(namePrefix.toLowerCase()));
  const getCanonicalTier = (prefixes: string[]): number => {
    let maxFound = 0;
    for (const b of buildings) {
      for (const prefix of prefixes) {
        if (b.startsWith(`${prefix}_`)) {
          const tail = parseInt(b.slice(prefix.length + 1), 10);
          if (!Number.isNaN(tail)) maxFound = Math.max(maxFound, tail);
        }
      }
    }
    return maxFound;
  };
  const isCoastalOrPort =
    burg.type.includes('Port') ||
    burg.tier === 'port' ||
    (burg.cellIndex !== undefined && Boolean(world.cells?.[burg.cellIndex]?.isCoast));

  const keepTier = Math.max(
    getCanonicalTier(['slot_keep']),
    hasBuilding('citadel') || hasBuilding('bastion') ? 3 : hasBuilding('wall') || hasBuilding('castle') ? 2 : 1
  );
  const marketTier = Math.max(
    getCanonicalTier(['slot_guildhall']),
    hasBuilding('exchange') || hasBuilding('bank') || hasBuilding('bourse')
      ? 3
      : hasBuilding('guild') || hasBuilding('market')
      ? 2
      : 1
  );
  const millTier = Math.max(
    getCanonicalTier(['slot_mill']),
    hasBuilding('silo') || hasBuilding('grand granary') ? 3 : hasBuilding('mill') || hasBuilding('granary') ? 2 : 1
  );
  const millBuilt =
    getCanonicalTier(['slot_mill']) > 0 || hasBuilding('mill') || hasBuilding('granary') || (burg.population || 0) > 6000;
  const forgeTier = Math.max(
    getCanonicalTier(['slot_foundry']),
    hasBuilding('foundry') || hasBuilding('armory') ? 3 : hasBuilding('smithy') || hasBuilding('forge') ? 2 : 1
  );
  const forgeBuilt =
    getCanonicalTier(['slot_foundry']) > 0 ||
    hasBuilding('smithy') ||
    hasBuilding('forge') ||
    hasBuilding('foundry') ||
    (burg.developmentLevel || 10) > 18;
  const transitPrefix = isCoastalOrPort ? 'slot_harbor' : 'slot_caravanserai';
  const transitTier = Math.max(
    getCanonicalTier([transitPrefix]),
    hasBuilding('drydock') || hasBuilding('caravanserai') ? 3 : hasBuilding('wharv') || hasBuilding('waystation') ? 2 : 1
  );
  const transitBuilt =
    getCanonicalTier([transitPrefix]) > 0 || (isCoastalOrPort ? true : (burg.connectedRouteCount || 0) >= 2);
  const shrineTier = Math.max(
    getCanonicalTier(['slot_wonder']),
    burg.isHolySite || hasBuilding('cathedral') ? 3 : hasBuilding('monastery') || hasBuilding('church') ? 2 : 1
  );

  const slots: DevelopmentSlotState[] = [
    {
      id: 'keep_walls',
      name:
        keepTier >= 3
          ? 'High Stone Citadel'
          : keepTier === 2
          ? 'Curtain Walls & Gatehouse'
          : 'Palisade & Moat',
      category: 'Military',
      tier: Math.min(3, keepTier),
      maxTier: 3,
      cost: keepTier >= 2 ? 780 : 380,
      effectDescription: '+180 Garrison defense, +12% siege resistance, +45 monthly levies',
      isBuilt: true,
      canUpgrade: keepTier < 3,
      iconName: 'Shield',
    },
    {
      id: 'market_guildhall',
      name:
        marketTier >= 3
          ? 'Merchant Bourse & Exchange'
          : marketTier === 2
          ? 'Chartered Guildhall'
          : 'Open Fairground & Stalls',
      category: 'Economic',
      tier: Math.min(3, marketTier),
      maxTier: 3,
      cost: marketTier >= 2 ? 640 : 320,
      effectDescription: '+35% Trade toll income, +4 Commercial attraction, attracts artisan masters',
      isBuilt: true,
      canUpgrade: marketTier < 3,
      iconName: 'Coins',
    },
    {
      id: 'mill_granary',
      name:
        millTier >= 3
          ? 'Imperial Silos & Mill Complex'
          : millTier === 2
          ? 'Tide Watermill & Granary'
          : 'Village Gristmill',
      category: 'Infrastructure',
      tier: Math.min(3, millTier),
      maxTier: 3,
      cost: millTier >= 2 ? 480 : 240,
      effectDescription: '+240 Monthly food reserves, prevents famine during seasonal blights',
      isBuilt: millBuilt,
      canUpgrade: millTier < 3,
      iconName: 'Wheat',
    },
    {
      id: 'artisan_forge',
      name:
        forgeTier >= 3
          ? 'Royal Armory & Blast Furnace'
          : forgeTier === 2
          ? 'Town Blacksmith & Foundry'
          : 'Village Smelter',
      category: 'Economic',
      tier: Math.min(3, forgeTier),
      maxTier: 3,
      cost: forgeTier >= 2 ? 680 : 340,
      effectDescription: '+15 Base tax gold, provides tempered mail and weapons for municipal guard',
      isBuilt: forgeBuilt,
      canUpgrade: forgeTier < 3,
      iconName: 'Hammer',
    },
    {
      id: isCoastalOrPort ? 'harbor_docks' : 'caravanserai_toll',
      name: isCoastalOrPort
        ? transitTier >= 3
          ? 'Grand Naval Drydock & Quays'
          : transitTier === 2
          ? 'Timber Wharves & Crane'
          : 'Coastal Jetty'
        : transitTier >= 3
        ? 'Fortified Caravanserai'
        : transitTier === 2
        ? 'Paved Waystation & Tollgate'
        : 'Packhorse Trail Post',
      category: 'Infrastructure',
      tier: Math.min(3, transitTier),
      maxTier: 3,
      cost: transitTier >= 2 ? 760 : 380,
      effectDescription: isCoastalOrPort
        ? '+50% Maritime trade throughput, naval patrol safety against corsairs'
        : '+40% Inland caravan traffic, provides resting quarters for foreign merchants',
      isBuilt: transitBuilt,
      canUpgrade: transitTier < 3,
      iconName: isCoastalOrPort ? 'Anchor' : 'Navigation',
    },
    {
      id: 'shrine_cathedral',
      name:
        shrineTier >= 3
          ? 'Grand Cathedral & Cloisters'
          : shrineTier === 2
          ? 'Monastic Abbey & Sanctuary'
          : 'Wayside Shrine & Parish Church',
      category: 'Ecclesiastical',
      tier: Math.min(3, shrineTier),
      maxTier: 3,
      cost: shrineTier >= 2 ? 700 : 350,
      effectDescription: '+8 Local contentment, clerical stability, grants indulgence tithes',
      isBuilt: true,
      canUpgrade: shrineTier < 3,
      iconName: 'Landmark',
    },
  ];

  return slots;
}

export function getBurgMunicipalVassals(burg: Burg, world: WorldState): Character[] {
  const result: Character[] = [];
  const seenIds = new Set<string>();

  // 1. Direct assigned vassal IDs
  if (burg.vassalIds && burg.vassalIds.length > 0) {
    for (const vid of burg.vassalIds) {
      const c = world.characters.find(char => char.id === vid && char.isAlive !== false);
      if (c && !seenIds.has(c.id)) {
        seenIds.add(c.id);
        result.push(c);
      }
    }
  }

  // 2. Settlement ruler/owner if found
  if (burg.ownerId) {
    const owner = world.characters.find(c => c.id === burg.ownerId && c.isAlive !== false);
    if (owner && !seenIds.has(owner.id)) {
      seenIds.add(owner.id);
      result.unshift(owner);
    }
  }

  // 3. Characters in the county with municipal or municipal-adjacent roles
  if (result.length < 3) {
    const countyCivics = world.characters.filter(
      c => c.isAlive !== false && c.countyId === burg.countyId && !seenIds.has(c.id) &&
      (c.role === 'Lord Mayor' || c.role === 'Master Artisan' || c.role === 'Captain of the Guard' || c.role === 'Village Bailiff' || c.role === 'Yeoman Miller' || c.role === 'Smuggler King' || c.role === 'Guildmaster' || c.role === 'Portmaster')
    );
    for (const civic of countyCivics) {
      if (result.length >= 4) break;
      seenIds.add(civic.id);
      result.push(civic);
    }
  }

  return result;
}

export function upgradeBurgSlot(
  burg: Burg,
  slotId: string,
  world: WorldState
): { success: boolean; message: string; updatedSlot?: DevelopmentSlotState } {
  burg.buildings = burg.buildings || [];
  const currentSlots = getBurgDevelopmentSlots(burg, world);
  const targetSlot = currentSlots.find((s) => s.id === slotId);

  if (!targetSlot) {
    return { success: false, message: 'Specified development slot not found in municipal archives.' };
  }
  if (!targetSlot.canUpgrade || targetSlot.tier >= targetSlot.maxTier) {
    return { success: false, message: `${targetSlot.name} has already reached maximum imperial tier.` };
  }

  const realm = world.realms?.find((r) => r.id === burg.stateId);
  const owner = world.characters.find((c) => c.id === burg.ownerId && c.isAlive !== false);
  const isSovereignHold = !owner || owner.id === realm?.rulerId || owner.role === 'Monarch';
  const bMarket = world.economy?.burgMarkets?.[burg.id];
  const rawCoffer = Math.max(0, bMarket?.treasury ?? burg.treasury ?? 0);
  const spendableCoffer = isSovereignHold ? Math.max(0, rawCoffer - (bMarket?.workingCapitalFloat ?? 0) * 0.4) : 0;

  if (isSovereignHold && realm) {
    const crownGold = realm.treasury ?? 0;
    if (spendableCoffer + crownGold < targetSlot.cost) {
      return {
        success: false,
        message: `Insufficient funds! Requires ${targetSlot.cost}g to expand ${targetSlot.name} (Available: ${Math.round(spendableCoffer + crownGold)}g).`,
      };
    }
    const fromCoffer = Math.min(spendableCoffer, targetSlot.cost);
    const fromCrown = targetSlot.cost - fromCoffer;
    const nextBurgTreasury = Math.round((rawCoffer - fromCoffer) * 10) / 10;
    burg.treasury = nextBurgTreasury;
    if (bMarket) bMarket.treasury = nextBurgTreasury;
    if (fromCrown > 0) {
      realm.treasury = Math.round((crownGold - fromCrown) * 10) / 10;
      if (realm.budget?.lastReport) {
        realm.budget.lastReport.buildingSubsidies =
          Math.round(((realm.budget.lastReport.buildingSubsidies || 0) + fromCrown) * 10) / 10;
      }
    }
  } else {
    const payer = owner || world.characters.find((c) => c.id === realm?.rulerId && c.isAlive !== false);
    const availableGold = payer ? (payer.treasury ?? 0) : rawCoffer;
    if (availableGold < targetSlot.cost) {
      return {
        success: false,
        message: `Insufficient gold! Requires ${targetSlot.cost}g to expand ${targetSlot.name} (Available: ${Math.round(availableGold)}g).`,
      };
    }
    if (payer) {
      payer.treasury = Math.round(((payer.treasury ?? 0) - targetSlot.cost) * 10) / 10;
    } else {
      const nextBurgTreasury = Math.round((rawCoffer - targetSlot.cost) * 10) / 10;
      burg.treasury = nextBurgTreasury;
      if (bMarket) bMarket.treasury = nextBurgTreasury;
    }
  }

  // Apply upgrade effects using canonical slot_*_<tier> IDs aligned with BUILDING_CATALOG
  const newTier = Math.min(targetSlot.maxTier, targetSlot.tier + 1);
  burg.developmentLevel = Math.min(100, (burg.developmentLevel || 15) + 6);

  const curPop = burg.population < 50 ? Math.round(burg.population * 1000) : (burg.population || 2500);
  burg.population = curPop + 250;

  const setCanonicalSlot = (prefix: string) => {
    burg.buildings = (burg.buildings || []).filter((b) => !b.startsWith(`${prefix}_`));
    burg.buildings.push(`${prefix}_${newTier}`);
  };

  if (slotId === 'keep_walls') {
    setCanonicalSlot('slot_keep');
    burg.garrisonCount = (burg.garrisonCount || 200) + 120;
    burg.garrisonMax = (burg.garrisonMax || 300) + 160;
  } else if (slotId === 'market_guildhall') {
    setCanonicalSlot('slot_guildhall');
    burg.tradeConnectivity = Math.round(((burg.tradeConnectivity || 1.0) + 0.25) * 100) / 100;
  } else if (slotId === 'mill_granary') {
    setCanonicalSlot('slot_mill');
    burg.carryingCapacity = (burg.carryingCapacity || Math.round(curPop * 1.3)) + 2500;
  } else if (slotId === 'artisan_forge') {
    setCanonicalSlot('slot_foundry');
  } else if (slotId.includes('harbor') || slotId.includes('caravanserai')) {
    setCanonicalSlot(slotId.includes('harbor') ? 'slot_harbor' : 'slot_caravanserai');
    burg.tradeConnectivity = Math.round(((burg.tradeConnectivity || 1.0) + 0.3) * 100) / 100;
  } else if (slotId === 'shrine_cathedral') {
    setCanonicalSlot('slot_wonder');
  }

  // Update county mean dev & recalculate economic ledger + feudal standing
  const county = world.counties?.find((c) => c.id === burg.countyId);
  if (county) {
    const countyBurgs = world.burgs.filter((b) => b.countyId === county.id);
    if (countyBurgs.length > 0) {
      county.development = Math.round(
        countyBurgs.reduce((acc, b) => acc + (b.developmentLevel || 30), 0) / countyBurgs.length
      );
    }
  }
  burg.economicLedger = calculateBurgEconomicLedger(burg, world);
  world.burgRevision = (world.burgRevision || 0) + 1;
  recalculateFeudalDemesne(world);

  // Add chronicle
  const event: HistoricalEvent = {
    id: generateFeudalId('hist_upgrade'),
    year: world.currentYear,
    title: `Civic Expansion: ${targetSlot.name} in ${burg.name}`,
    category: 'Coronation',
    description: `The town council of ${burg.name} spent ${targetSlot.cost}g to expand ${targetSlot.name} to Tier ${newTier}, boosting municipal commerce and garrison defenses.`,
    realmId: burg.stateId,
    primaryActorId: burg.ownerId,
    meta: { burgId: burg.id },
  };
  world.history.unshift(event);

  const refreshedSlots = getBurgDevelopmentSlots(burg, world);
  return {
    success: true,
    message: `CONSTRUCTION COMPLETE (-${targetSlot.cost}g): ${targetSlot.name} elevated to Tier ${newTier}! Municipal development expanded to ${burg.developmentLevel}.`,
    updatedSlot: refreshedSlots.find((s) => s.id === slotId),
  };
}

// ============================================================================
// 8. HIERARCHY RECONCILIATION, AUTO-ENFEOFFMENT & SOVEREIGNTY TRANSFER
// ============================================================================

export function reconcileFeudalHierarchy(world: WorldState): void {
  const realms = world.realms || [];
  const counties = world.counties || [];
  const characters = world.characters || [];
  const burgs = world.burgs || [];

  for (const realm of realms) {
    const monarch = characters.find((c) => c.id === realm.rulerId && c.isAlive !== false);
    const sovRank = getRealmSovereignRank(realm, monarch?.gender);
    const realmCleanName = stripRealmPrefix(realm.name);
    if (monarch) {
      monarch.titleTier = sovRank.titleTier;
      monarch.role = 'Monarch';
    }

    const rCounties = counties.filter((c) => c.realmId === realm.id);
    if (rCounties.length >= 2 && sovRank.isRoyalOrHigher && !rCounties.some((c) => c.tier === 'Duchy')) {
      const candidate =
        rCounties.find((c) => c.capitalBurgId !== realm.capitalBurgId) || rCounties[rCounties.length - 1];
      if (candidate) {
        candidate.tier = 'Duchy';
        candidate.duchyId = candidate.duchyId || `duchy_${realm.id}_1`;
        if (!candidate.name.includes('Duchy')) {
          const baseName = candidate.name.replace(/^(Earldom of|County of|Crown Demesne of)\s*/i, '');
          candidate.name = `Duchy of ${baseName}`;
        }
        candidate.duchyName = candidate.name;
      }
    }

    // Non-royal realms (Sovereign Duchies, Counties, Tribes, City-States) CANNOT hold subordinate Grand Duchies
    if (!sovRank.isRoyalOrHigher) {
      for (const ct of rCounties) {
        if (ct.capitalBurgId === realm.capitalBurgId) continue;
        if (ct.tier === 'Duchy' || ct.name.includes('Duchy')) {
          ct.tier = 'County';
          ct.duchyId = undefined;
          ct.duchyName = undefined;
          const capBurg = burgs.find((b) => b.id === ct.capitalBurgId);
          const baseName = capBurg?.name || ct.name.replace(/^(Grand Duchy of|Royal Duchy of|Duchy of)\s*/i, '').trim();
          const fiefStyle = getSubordinateVassalStyle(realm, sovRank.titleTier, 'male', baseName, 'county_fief');
          ct.name = fiefStyle.fiefName;
        }
      }
    }

    const duchies = sovRank.isRoyalOrHigher
      ? rCounties.filter((c) => c.tier === 'Duchy' || c.name.includes('Duchy'))
      : [];
    for (const duchy of duchies) {
      duchy.tier = 'Duchy';
      duchy.duchyId = duchy.duchyId || `duchy_${duchy.id}`;
      duchy.duchyName = duchy.duchyName || duchy.name;
      const capBurg = burgs.find((b) => b.id === duchy.capitalBurgId);
      const seatName = capBurg?.name || duchy.name.replace(/^(Grand Duchy of|Royal Duchy of|Duchy of)\s*/i, '');
      const isCrownDuchy = Boolean(
        duchy.duchyId?.endsWith('_crown') ||
        duchy.capitalBurgId === realm.capitalBurgId ||
        duchy.name.startsWith('Royal Duchy')
      );

      // The Monarch is ALWAYS the holder of the Crown Duchy — never reassign it to a Vassal Duke
      if (isCrownDuchy && monarch) {
        duchy.rulerId = monarch.id;
        monarch.countyId = duchy.id;
        const sovereignStyle = `${sovRank.rankTitle} of ${realmCleanName}`;
        if (!monarch.title || !monarch.title.toLowerCase().includes(sovRank.rankTitle.toLowerCase())) {
          monarch.title = sovereignStyle;
        }
        if (capBurg) {
          capBurg.ownerId = monarch.id;
          capBurg.rulerTitle = monarch.title;
        }
        continue;
      }

      let duke = characters.find((c) => c.id === duchy.rulerId && c.isAlive !== false);
      if (!duke || duke.id === realm.rulerId) {
        const promoCandidate = characters.find(
          (c) =>
            c.isAlive !== false &&
            c.realmId === realm.id &&
            c.id !== realm.rulerId &&
            (c.countyId === duchy.id || c.role === 'Vassal Count') &&
            !duchies.some((other) => other.id !== duchy.id && other.rulerId === c.id)
        );
        if (promoCandidate) {
          duke = promoCandidate;
        }
      }

      if (duke && duke.id !== realm.rulerId) {
        duke.titleTier = getLowerTitleTier(sovRank.titleTier, 'Duke');
        duke.role = duke.titleTier === 'Duke' ? 'Vassal Duke' : 'Vassal Count';
        duke.countyId = duchy.id;
        if (monarch) duke.liegeId = monarch.id;
        duke.title = duke.gender === 'female' ? `Duchess of ${seatName}` : `Duke of ${seatName}`;
        duchy.rulerId = duke.id;
        if (capBurg) {
          capBurg.ownerId = duke.id;
          capBurg.rulerTitle = duke.title;
        }
      }
    }

    const duchyById = new Map<string, County>();
    for (const d of duchies) {
      if (d.duchyId) duchyById.set(d.duchyId, d);
    }

    for (const county of rCounties) {
      if (county.tier === 'Duchy') continue;
      const isCrownSeat = county.capitalBurgId === realm.capitalBurgId;
      const parentDuchy = county.duchyId ? duchyById.get(county.duchyId) : undefined;
      if (county.duchyId && !parentDuchy) {
        county.duchyId = undefined;
        county.duchyName = undefined;
      }
      const expectedLiege = isCrownSeat
        ? monarch
        : (parentDuchy ? characters.find((c) => c.id === parentDuchy.rulerId && c.isAlive !== false) : undefined) || monarch;
      const expectedLiegeId = expectedLiege?.id;
      const liegeTier: TitleTier = expectedLiege?.titleTier || sovRank.titleTier;

      const countyRuler = characters.find((c) => c.id === county.rulerId && c.isAlive !== false);
      if (countyRuler && !isCrownSeat && countyRuler.id !== realm.rulerId) {
        const capBurg = burgs.find((b) => b.id === county.capitalBurgId);
        const seatName =
          capBurg?.name ||
          county.name.replace(/^(Barony of|Earldom of|County of|Crown County of|Appanage County of|Chartered Ward of|Tribal Stead of)\s*/i, '').trim();
        const isHeirRuler = Boolean(
          monarch?.heirId === countyRuler.id ||
            countyRuler.role === 'Crown Heir' ||
            countyRuler.role === 'Heir'
        );
        const sovMaxRank = getTitleTierRank(sovRank.titleTier);
        const liegeMaxRank = getTitleTierRank(liegeTier);
        const strictCeilingRank = Math.min(sovMaxRank, liegeMaxRank);

        if (isHeirRuler) {
          const hasDisallowedPrince =
            !sovRank.isRoyalOrHigher &&
            /\b(?:crown\s+prince(?:ss)?|cadet\s+prince(?:ss)?|prince|princess)\b/i.test(countyRuler.title || '') &&
            !/prince-bishop|prince-abbess|principality/i.test(countyRuler.title || '');
          if (!sovRank.isRoyalOrHigher && countyRuler.role === 'Crown Heir') {
            countyRuler.role = 'Heir';
          }
          if (getTitleTierRank(countyRuler.titleTier) >= strictCeilingRank || hasDisallowedPrince) {
            const heirStyle = getHeirStyleForRealm(realm, sovRank.titleTier, countyRuler.gender || 'male', seatName);
            countyRuler.titleTier = heirStyle.titleTier;
            countyRuler.title = heirStyle.title;
            if (capBurg) capBurg.rulerTitle = heirStyle.title;
          }
        } else {
          const currentRank = getTitleTierRank(countyRuler.titleTier);
          const subStyle = getSubordinateVassalStyle(
            realm,
            liegeTier,
            countyRuler.gender || 'male',
            seatName,
            'county_fief',
            county.name.toLowerCase().startsWith('earldom')
          );
          const targetRank = getTitleTierRank(subStyle.titleTier);
          if (currentRank >= strictCeilingRank || currentRank !== targetRank || !countyRuler.titleTier) {
            countyRuler.titleTier = subStyle.titleTier;
            countyRuler.role = subStyle.role;
            countyRuler.title = subStyle.title;
            if (capBurg) capBurg.rulerTitle = subStyle.title;
          }
        }
        if (expectedLiegeId && countyRuler.id !== expectedLiegeId) {
          countyRuler.liegeId = expectedLiegeId;
        }
      }
    }

    // Strict Realm-Wide Ceiling (3-pass transitive enforcement): No heir, vassal, or courtier may equal or outrank the sovereign or their direct liege
    const sovRankNum = getTitleTierRank(sovRank.titleTier);
    const realmChars = characters.filter((c) => c.isAlive !== false && c.realmId === realm.id);
    const realmCharById = new Map(realmChars.map((c) => [c.id, c]));
    for (let pass = 0; pass < 3; pass++) {
      let changed = false;
      for (const ch of realmChars) {
        if (ch.id === realm.rulerId) continue;
        const isHeir = Boolean(
          monarch?.heirId === ch.id || ch.role === 'Crown Heir' || ch.role === 'Heir'
        );
        const directLiege = ch.liegeId && ch.liegeId !== ch.id ? realmCharById.get(ch.liegeId) : monarch;
        const liegeRankNum =
          directLiege && directLiege.id !== ch.id
            ? getTitleTierRank(directLiege.titleTier || sovRank.titleTier)
            : sovRankNum;
        const effectiveCeilingTier: TitleTier =
          liegeRankNum < sovRankNum && directLiege?.titleTier ? directLiege.titleTier : sovRank.titleTier;
        const effectiveCeilingRank = Math.min(sovRankNum, liegeRankNum);

        if (getTitleTierRank(ch.titleTier) >= effectiveCeilingRank) {
          changed = true;
          if (isHeir) {
            const heirCounty = counties.find((ct) => ct.rulerId === ch.id && ct.capitalBurgId !== realm.capitalBurgId);
            const heirBurg = heirCounty ? burgs.find((b) => b.id === heirCounty.capitalBurgId) : undefined;
            const heirStyle = getHeirStyleForRealm(realm, sovRank.titleTier, ch.gender || 'male', heirBurg?.name);
            ch.titleTier = heirStyle.titleTier;
            ch.title = heirStyle.title;
            if (heirBurg) heirBurg.rulerTitle = heirStyle.title;
          } else {
            const heldBurg = burgs.find((b) => b.ownerId === ch.id);
            if (heldBurg) {
              const isCountySeat = counties.some(
                (ct) => ct.capitalBurgId === heldBurg.id && ct.tier !== 'Duchy'
              );
              const kind = isCountySeat
                ? 'county_fief'
                : heldBurg.type.includes('Port')
                ? 'port'
                : heldBurg.type.includes('Market')
                ? 'market'
                : 'barony';
              const style = getSubordinateVassalStyle(
                realm,
                effectiveCeilingTier,
                ch.gender || 'male',
                heldBurg.name,
                kind
              );
              ch.titleTier = style.titleTier;
              ch.role = style.role;
              ch.title = style.title;
              heldBurg.rulerTitle = style.title;
            } else {
              const clampedTier = getLowerTitleTier(effectiveCeilingTier);
              ch.titleTier = clampedTier;
              if (ch.role === 'Vassal Duke' || ch.role === 'Vassal Count' || ch.role === 'Vassal Baron' || ch.role === 'Monarch') {
                ch.role =
                  clampedTier === 'Duke'
                    ? 'Vassal Duke'
                    : clampedTier === 'Count'
                    ? 'Vassal Count'
                    : clampedTier === 'Baron'
                    ? 'Vassal Baron'
                    : clampedTier === 'Mayor'
                    ? 'Lord Mayor'
                    : 'Hedge Knight';
              }
              const rankLabel =
                clampedTier === 'Duke'
                  ? (ch.gender === 'female' ? 'Duchess' : 'Duke')
                  : clampedTier === 'Count'
                  ? (ch.gender === 'female' ? 'Countess' : 'Count')
                  : clampedTier === 'Baron'
                  ? (ch.gender === 'female' ? 'Baroness' : 'Baron')
                  : clampedTier === 'Mayor'
                  ? 'Bailiff'
                  : 'Courtier';
              ch.title = `${rankLabel} of ${realmCleanName}`;
            }
          }
        }
      }
      if (!changed) break;
    }

    // Normalize all non-heir children across all realms to 'Child', and strip Prince/Princess titles in non-royal realms
    for (const ch of realmChars) {
      if (ch.id === realm.rulerId) continue;
      if (ch.role === 'Cadet Prince' || ch.role === 'Cadet Princess' || ch.role === 'Noble Scion') {
        ch.role = 'Child';
        if (
          !ch.title ||
          /\b(?:prince|princess|scion|noble daughter)\b/i.test(ch.title)
        ) {
          ch.title = `Child of House ${ch.houseName || realmCleanName}`;
        }
      }
      if (!isCharacterRoyalLineage(ch, world)) {
        const isSovHeir = Boolean(monarch?.heirId === ch.id || ch.role === 'Crown Heir' || ch.role === 'Heir');
        if (ch.role === 'Royal Uncle') {
          ch.role = 'Court Noble';
        } else if (ch.role === 'Crown Heir') {
          ch.role = isSovHeir ? 'Heir' : 'Vassal Heir';
        }
        if (
          ch.title &&
          /\b(?:crown\s+prince(?:ss)?|cadet\s+prince(?:ss)?|dowager\s+princess|prince|princess)\b/i.test(ch.title) &&
          !/prince-bishop|prince-abbess|principality/i.test(ch.title)
        ) {
          if (isSovHeir) {
            const heirCounty = counties.find((ct) => ct.rulerId === ch.id && ct.capitalBurgId !== realm.capitalBurgId);
            const heirBurg = heirCounty ? burgs.find((b) => b.id === heirCounty.capitalBurgId) : undefined;
            const heirStyle = getHeirStyleForRealm(realm, sovRank.titleTier, ch.gender || 'male', heirBurg?.name);
            ch.title = heirStyle.title;
            if (heirBurg) heirBurg.rulerTitle = heirStyle.title;
          } else {
            ch.title = sanitizeNonRoyalTitle(ch.title, ch.gender);
          }
        }
      }
    }

    for (const duchy of duchies) {
      const isCrownDuchy = Boolean(
        duchy.duchyId?.endsWith('_crown') ||
        duchy.capitalBurgId === realm.capitalBurgId ||
        duchy.name.startsWith('Royal Duchy')
      );
      if (isCrownDuchy) continue;

      const hasSubCounty = rCounties.some(
        (c) => c.tier !== 'Duchy' && c.duchyId === duchy.duchyId && c.capitalBurgId !== realm.capitalBurgId
      );
      if (hasSubCounty) continue;
      const donorDuchy = duchies
        .filter(
          (other) =>
            other.id !== duchy.id &&
            !other.duchyId?.endsWith('_crown') &&
            other.capitalBurgId !== realm.capitalBurgId &&
            !other.name.startsWith('Royal Duchy')
        )
        .map((other) => ({
          other,
          subs: rCounties.filter(
            (c) => c.tier !== 'Duchy' && c.duchyId === other.duchyId && c.capitalBurgId !== realm.capitalBurgId
          ),
        }))
        .filter((x) => x.subs.length >= 2)
        .sort((a, b) => b.subs.length - a.subs.length)[0];
      const transferable =
        donorDuchy?.subs[donorDuchy.subs.length - 1] ||
        rCounties.find((c) => c.tier !== 'Duchy' && !c.duchyId && c.capitalBurgId !== realm.capitalBurgId);
      if (transferable) {
        transferable.duchyId = duchy.duchyId;
        transferable.duchyName = duchy.duchyName || duchy.name;
        const subRuler = characters.find((c) => c.id === transferable.rulerId && c.isAlive !== false);
        if (subRuler && duchy.rulerId && subRuler.id !== duchy.rulerId) {
          subRuler.liegeId = duchy.rulerId;
        }
      }
    }
  }

  for (const ch of characters) {
    ch.vassalIds = characters
      .filter((sub) => sub.isAlive !== false && sub.liegeId === ch.id && sub.id !== ch.id)
      .map((sub) => sub.id);
  }
  syncWorldBanners(world);
}

export function autoEnfeoffExcessHoldings(owner: Character, world: WorldState): void {
  if (!owner || owner.isAlive === false) return;
  const limit = calculateDemesneLimit(owner);
  const ownedBurgs = (world.burgs || []).filter((b) => b.ownerId === owner.id);
  if (ownedBurgs.length <= limit) return;

  const realm = world.realms?.find((r) => r.id === owner.realmId);
  const nonCapitals = ownedBurgs.filter((b) => !b.isCapital && b.id !== realm?.capitalBurgId);
  const candidates = [...nonCapitals, ...ownedBurgs.filter((b) => b.isCapital || b.id === realm?.capitalBurgId)];

  let heldCount = ownedBurgs.length;
  for (const targetBurg of candidates) {
    if (heldCount <= limit) break;
    if (targetBurg.id === realm?.capitalBurgId && candidates.length > 1) continue;

    // Pick a landless living noble or courtier in the same realm first
    const holdingCountByChar = new Map<string, number>();
    for (const b of world.burgs || []) {
      if (b.ownerId) holdingCountByChar.set(b.ownerId, (holdingCountByChar.get(b.ownerId) || 0) + 1);
    }

    let grantee = (world.characters || []).find(
      (c) =>
        c.isAlive !== false &&
        c.id !== owner.id &&
        c.realmId === owner.realmId &&
        !c.isImprisoned &&
        !c.isBanished &&
        !c.isMonk &&
        c.role !== 'Monarch' &&
        c.role !== 'Dungeon Prisoner' &&
        (holdingCountByChar.get(c.id) || 0) === 0
    );

    if (!grantee) {
      // Promote a sworn vassal under demesne limit
      grantee = (world.characters || []).find(
        (c) =>
          c.isAlive !== false &&
          c.id !== owner.id &&
          c.realmId === owner.realmId &&
          !c.isImprisoned &&
          !c.isBanished &&
          !c.isMonk &&
          c.role !== 'Monarch' &&
          (holdingCountByChar.get(c.id) || 0) < calculateDemesneLimit(c)
      );
    }

    if (!grantee) break;

    const ownerTier: TitleTier =
      owner.titleTier || getRealmSovereignRank(realm, owner.gender).titleTier;
    const isPortOrMarket = targetBurg.type.includes('Port') || targetBurg.type.includes('Market');
    const enfeoffStyle = getSubordinateVassalStyle(
      realm,
      ownerTier,
      grantee.gender || 'male',
      targetBurg.name,
      targetBurg.type.includes('Port') ? 'port' : isPortOrMarket ? 'market' : 'barony'
    );

    if (
      grantee.titleTier === 'Commoner' ||
      !grantee.titleTier ||
      grantee.titleTier === 'Mayor' ||
      getTitleTierRank(grantee.titleTier) >= getTitleTierRank(ownerTier)
    ) {
      grantee.titleTier = enfeoffStyle.titleTier;
      grantee.role = enfeoffStyle.role;
      grantee.title = enfeoffStyle.title;
      grantee.isNobleHouse = enfeoffStyle.isNobleHouse;
      grantee.hasPersonalBanner = enfeoffStyle.titleTier === 'Baron';
      if (enfeoffStyle.isNobleHouse && !grantee.coatOfArms?.config) {
        grantee.coatOfArms = generateNobleArms(`house_${grantee.realmId}_${grantee.houseName}_${grantee.id}`, {
          gender: grantee.gender,
          isLanded: true,
        });
      }
    }
    grantee.liegeId = owner.id;
    grantee.countyId = targetBurg.countyId;
    grantee.provinceId = targetBurg.countyId;
    targetBurg.ownerId = grantee.id;
    targetBurg.rulerTitle = grantee.title;

    for (const h of world.holdings || []) {
      if (h.id === targetBurg.id || h.id === `holding_${targetBurg.id}` || h.id.endsWith(targetBurg.id)) {
        h.ownerId = grantee.id;
      }
    }

    const county = world.counties?.find((ct) => ct.id === targetBurg.countyId);
    if (county && county.capitalBurgId === targetBurg.id) {
      county.rulerId = grantee.id;
    }

    owner.vassalIds = owner.vassalIds || [];
    if (!owner.vassalIds.includes(grantee.id)) owner.vassalIds.push(grantee.id);

    if (!grantee.opinions) grantee.opinions = {};
    grantee.opinions[owner.id] = Math.min(100, (grantee.opinions[owner.id] ?? 0) + 35);
    grantee.loyalty = Math.min(100, (grantee.loyalty ?? 58) + 22);

    heldCount -= 1;
  }
}

export function transferCountySovereignty(
  countyId: string,
  newOwner: Character,
  w: WorldState
): void {
  const county = w.counties?.find((c) => c.id === countyId);
  if (!county || !newOwner) return;

  const oldRealmId = county.realmId;
  const newRealmId = newOwner.realmId;
  county.rulerId = newOwner.id;

  if (newRealmId && oldRealmId !== newRealmId) {
    const oldRealm = w.realms?.find((r) => r.id === oldRealmId);
    const newRealm = w.realms?.find((r) => r.id === newRealmId);
    if (oldRealm) {
      oldRealm.countyIds = (oldRealm.countyIds || []).filter((id) => id !== county.id);
    }
    if (newRealm) {
      newRealm.countyIds = newRealm.countyIds || [];
      if (!newRealm.countyIds.includes(county.id)) newRealm.countyIds.push(county.id);
    }
    county.realmId = newRealmId;

    // Clear or reassign conquered county's duchy link so it no longer points to the enemy realm's Grand Duchy
    if (county.tier !== 'Duchy') {
      const newRealmDuchies = (w.counties || []).filter(
        (d) => d.realmId === newRealmId && d.id !== county.id && (d.tier === 'Duchy' || d.name.includes('Duchy'))
      );
      if (newRealmDuchies.length > 0) {
        const countySeat = w.burgs?.find((b) => b.id === county.capitalBurgId);
        const nearestDuchy = newRealmDuchies.slice().sort((a, b) => {
          const sa = w.burgs?.find((bg) => bg.id === a.capitalBurgId);
          const sb = w.burgs?.find((bg) => bg.id === b.capitalBurgId);
          const da = Math.hypot((sa?.x || 0) - (countySeat?.x || 0), (sa?.y || 0) - (countySeat?.y || 0));
          const db = Math.hypot((sb?.x || 0) - (countySeat?.x || 0), (sb?.y || 0) - (countySeat?.y || 0));
          return da - db;
        })[0];
        nearestDuchy.duchyId = nearestDuchy.duchyId || `duchy_${nearestDuchy.id}`;
        county.duchyId = nearestDuchy.duchyId;
        county.duchyName = nearestDuchy.duchyName || nearestDuchy.name;
      } else {
        county.duchyId = undefined;
        county.duchyName = undefined;
      }
    }

    const prov = w.provinces?.find((p) => p.id === county.id);
    if (prov) {
      prov.realmId = newRealmId;
    }
    for (const cell of w.cells || []) {
      if (cell.countyId === county.id) {
        cell.realmId = newRealmId;
      }
    }

    // Migrate old realm capital if it belonged to this conquered county
    if (oldRealm) {
      const capBurg = w.burgs?.find((b) => b.id === oldRealm.capitalBurgId);
      if (capBurg && capBurg.countyId === county.id) {
        capBurg.isCapital = false;
        const remainingBurgs = (w.burgs || [])
          .filter((b) => b.countyId !== county.id && b.stateId === oldRealm.id)
          .sort((a, b) => (b.population || 0) - (a.population || 0));
        if (remainingBurgs.length > 0) {
          remainingBurgs[0].isCapital = true;
          oldRealm.capitalBurgId = remainingBurgs[0].id;
        }
      }
    }
  }

  // Transfer all sibling burgs and holdings in this county
  const siblingBurgIds = new Set<string>();
  for (const b of w.burgs || []) {
    if (b.countyId === county.id) {
      siblingBurgIds.add(b.id);
      b.ownerId = newOwner.id;
      b.rulerTitle = newOwner.title;
      if (newRealmId) b.stateId = newRealmId;
      b.isStarving = false;
      b.foodSecurity = 'SECURE';
    }
  }

  for (const h of w.holdings || []) {
    if (
      h.provinceId === county.id ||
      siblingBurgIds.has(h.id) ||
      Array.from(siblingBurgIds).some((bid) => h.id === `holding_${bid}` || h.id.endsWith(bid))
    ) {
      h.ownerId = newOwner.id;
    }
  }

  w.paintRevision = (w.paintRevision || 0) + 1;
  w.territoryRevision = (w.territoryRevision || 0) + 1;
  w.burgRevision = (w.burgRevision || 0) + 1;

  autoEnfeoffExcessHoldings(newOwner, w);
  syncWorldBanners(w);
}

export function transferHoldingSovereignty(
  holdingId: string,
  newOwner: Character,
  w: WorldState
): void {
  const holding = w.holdings?.find((h) => h.id === holdingId);
  const matchingBurg = w.burgs?.find(
    (b) => b.id === holdingId || `holding_${b.id}` === holdingId || holdingId.endsWith(b.id)
  );
  const targetCountyId = matchingBurg?.countyId || holding?.provinceId;
  if (targetCountyId && w.counties?.some((c) => c.id === targetCountyId)) {
    transferCountySovereignty(targetCountyId, newOwner, w);
  }
  if (holding) {
    holding.ownerId = newOwner.id;
  }
  if (matchingBurg) {
    matchingBurg.ownerId = newOwner.id;
    matchingBurg.rulerTitle = newOwner.title;
    if (newOwner.realmId) matchingBurg.stateId = newOwner.realmId;
    matchingBurg.isStarving = false;
    matchingBurg.foodSecurity = 'SECURE';
    w.burgRevision = (w.burgRevision || 0) + 1;
  }
}

export function setRealmTruce(
  realmAId: string,
  realmBId: string,
  years: number,
  w: WorldState
): void {
  if (!realmAId || !realmBId || realmAId === realmBId) return;
  const untilYear = (w.currentYear || 1042) + Math.max(1, years);
  const ra = w.realms?.find((r) => r.id === realmAId);
  const rb = w.realms?.find((r) => r.id === realmBId);
  if (ra) {
    ra.truceUntilYearByRealm = ra.truceUntilYearByRealm || {};
    ra.truceUntilYearByRealm[realmBId] = Math.max(ra.truceUntilYearByRealm[realmBId] || 0, untilYear);
  }
  if (rb) {
    rb.truceUntilYearByRealm = rb.truceUntilYearByRealm || {};
    rb.truceUntilYearByRealm[realmAId] = Math.max(rb.truceUntilYearByRealm[realmAId] || 0, untilYear);
  }
}