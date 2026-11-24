import {
  WorldState,
  Character,
  Holding,
  Province,
  HistoricalEvent,
  Burg,
} from '../types/world';
import { pickContextualDeathCause } from './deathAndJusticeEngine';
import { applyWarDevastationToBurg } from './settlementDevelopmentEngine';
import type { CommodityType } from '../types/economy';
import {
  UnitCategory,
  RegimentDefinition,
  Regiment,
  Army,
  BattleDuelResult,
  TacticalBattleReport,
  SiegeState,
  ActiveWar,
  SiegePhase,
  WarBattleRecord,
  ArmyConductPolicy,
  WarConductOutcomeTier,
} from '../types/warfare';
import {
  getCharacterV17Stat,
  killCharacter,
  generateUniqueId,
} from './v17GrandStrategyEngine';
import {
  recalculateFeudalDemesne,
  reconcileFeudalHierarchy,
  transferHoldingSovereignty,
  setRealmTruce,
} from './feudalEngine';
import { computeArmyMarchPath, reverseArmyWaypoints } from './armyPathfinding';
import { pickSmartBattleTactic, evaluateBattleStrategy } from './battleStrategy';
import { globalModRegistry } from './modSystem/registryManager';

export function getActiveRegimentDefinitions(): Record<string, RegimentDefinition> {
  const reg = globalModRegistry.getRegistry<RegimentDefinition & { id: string }>('units');
  if (reg.size() === 0) return REGIMENT_DEFINITIONS;
  const out: Record<string, RegimentDefinition> = {};
  for (const item of reg.getAll()) {
    out[item.id] = item;
  }
  return out;
}

export function getActiveRegimentDefinition(category: string): RegimentDefinition {
  const reg = globalModRegistry.getRegistry<RegimentDefinition & { id: string }>('units');
  const modded = reg.size() > 0 ? reg.get(category) : undefined;
  return modded || REGIMENT_DEFINITIONS[category as UnitCategory] || REGIMENT_DEFINITIONS.Levy;
}

// ============================================================================
// 1. REGIMENT DEFINITIONS & UNIT COUNTERS
// ============================================================================

export const REGIMENT_DEFINITIONS: Record<UnitCategory, RegimentDefinition> = {
  Levy: {
    category: 'Levy',
    baseAttack: 4,
    baseDefense: 6,
    isCavalry: false,
    isRanged: false,
    isSiege: false,
    strongAgainst: [],
    vulnerableTo: ['Cavalry', 'Spear'],
    terrainAffinities: { Plains: 1.0, Mountains: 0.8 },
    defaultPlaceholder: '{realm} County Levy',
    description: 'Impressed serfs and levies armed with poleaxes, hunting bows, and wooden bucklers.',
    recruitmentCost: 0,
    recruitCostPer100: 0,
    upkeepGold: 0.5,
    upkeepGoldPer100: 0.5,
    siegeProgressPerMonth: 1,
  },
  Spear: {
    category: 'Spear',
    baseAttack: 8,
    baseDefense: 16,
    isCavalry: false,
    isRanged: false,
    isSiege: false,
    strongAgainst: ['Cavalry'],
    vulnerableTo: ['Ranged', 'Infantry'],
    terrainAffinities: { Mountains: 1.25, Plains: 0.95 },
    defaultPlaceholder: '{realm} Pike Phalanx',
    description: 'Disciplined formations of 12-foot ashen pikes designed to break armored cavalry charges.',
    recruitmentCost: 25,
    recruitCostPer100: 25,
    upkeepGold: 2.5,
    upkeepGoldPer100: 2.5,
    equipmentInputsPer100: { Timber: 2, Iron: 1 },
    siegeProgressPerMonth: 2,
  },
  Infantry: {
    category: 'Infantry',
    baseAttack: 14,
    baseDefense: 12,
    isCavalry: false,
    isRanged: false,
    isSiege: false,
    strongAgainst: ['Spear'],
    vulnerableTo: ['Cavalry', 'Ranged'],
    terrainAffinities: { Forest: 1.2, Mountains: 1.1 },
    defaultPlaceholder: '{realm} Men-at-Arms',
    description: 'Hardened veteran swordsmen and billmen equipped with chainmail hauberks and kite shields.',
    recruitmentCost: 40,
    recruitCostPer100: 40,
    upkeepGold: 3.5,
    upkeepGoldPer100: 3.5,
    equipmentInputsPer100: { Iron: 3, Leather: 2 },
    siegeProgressPerMonth: 3,
  },
  Ranged: {
    category: 'Ranged',
    baseAttack: 16,
    baseDefense: 5,
    isCavalry: false,
    isRanged: true,
    isSiege: false,
    strongAgainst: ['Infantry', 'Levy'],
    vulnerableTo: ['Cavalry'],
    terrainAffinities: { Forest: 1.15, Mountains: 1.25, Plains: 1.0 },
    defaultPlaceholder: '{realm} Marksmen',
    description: 'Deadeye archers providing lethal ranged volleys before melee lines clash.',
    recruitmentCost: 30,
    recruitCostPer100: 30,
    upkeepGold: 3.0,
    upkeepGoldPer100: 3.0,
    equipmentInputsPer100: { Timber: 2, 'Crossbow Bolts': 1 },
    siegeProgressPerMonth: 2,
  },
  Cavalry: {
    category: 'Cavalry',
    baseAttack: 22,
    baseDefense: 14,
    isCavalry: true,
    isRanged: false,
    isSiege: false,
    strongAgainst: ['Ranged', 'Infantry', 'Levy'],
    vulnerableTo: ['Spear'],
    terrainAffinities: { Plains: 1.4, Mountains: 0.6, Forest: 0.75 },
    defaultPlaceholder: '{realm} Heavy Lancers',
    description: 'Devastating shock lancers riding armored warhorses capable of shattering frontlines.',
    recruitmentCost: 75,
    recruitCostPer100: 75,
    upkeepGold: 7.5,
    upkeepGoldPer100: 7.5,
    equipmentInputsPer100: { Warhorses: 4, Iron: 4 },
    siegeProgressPerMonth: 1,
  },
  Siege: {
    category: 'Siege',
    baseAttack: 25,
    baseDefense: 2,
    isCavalry: false,
    isRanged: true,
    isSiege: true,
    strongAgainst: [],
    vulnerableTo: ['Cavalry', 'Infantry'],
    terrainAffinities: { Plains: 1.0 },
    defaultPlaceholder: '{realm} Siege Train',
    description: 'Colossal siege artillery hurling ashlar boulders to smash curtain ramparts and keeps.',
    recruitmentCost: 90,
    recruitCostPer100: 90,
    upkeepGold: 10.0,
    upkeepGoldPer100: 10.0,
    equipmentInputsPer100: { Timber: 6, Iron: 4, 'Rope & Cordage': 2 },
    siegeProgressPerMonth: 12,
  },
  CulturalSpecial: {
    category: 'CulturalSpecial',
    baseAttack: 20,
    baseDefense: 18,
    isCavalry: false,
    isRanged: false,
    isSiege: false,
    strongAgainst: ['Infantry', 'Cavalry'],
    vulnerableTo: ['Ranged'],
    terrainAffinities: { Forest: 1.25, Mountains: 1.25, Plains: 1.25 },
    defaultPlaceholder: '{realm} {culture} Vanguard',
    description: 'Elite household retainers sworn to defend the realm standard unto death.',
    recruitmentCost: 85,
    recruitCostPer100: 85,
    upkeepGold: 8.5,
    upkeepGoldPer100: 8.5,
    equipmentInputsPer100: { Iron: 4, Warhorses: 2 },
    siegeProgressPerMonth: 4,
  },
};

export function getUnitRecruitmentCost(category: UnitCategory, menCount: number): {
  goldCost: number;
  monthlyUpkeep: number;
  per100Gold: number;
  per100Upkeep: number;
} {
  const def = REGIMENT_DEFINITIONS[category] || REGIMENT_DEFINITIONS.Infantry;
  const units = Math.max(1, menCount) / 100;
  return {
    goldCost: Math.round(def.recruitCostPer100 * units),
    monthlyUpkeep: Math.round(def.upkeepGoldPer100 * units * 10) / 10,
    per100Gold: def.recruitCostPer100,
    per100Upkeep: def.upkeepGoldPer100,
  };
}

export function recruitNonLevyTroops(
  rulerId: string,
  category: Exclude<UnitCategory, 'Levy'>,
  menCount: number,
  world: WorldState
): { success: boolean; message: string; goldSpent?: number } {
  const ruler = world.characters?.find((c) => c.id === rulerId && c.isAlive);
  if (!ruler) return { success: false, message: 'Ruler not found.' };

  const count = Math.max(100, Math.round(menCount / 100) * 100);
  const cost = getUnitRecruitmentCost(category, count);
  const realm = world.realms?.find((r) => r.rulerId === ruler.id || (ruler.role === 'Monarch' && r.id === ruler.realmId));
  const useCrownFisc = Boolean(realm);
  const treasury = Math.max(0, useCrownFisc ? (realm!.treasury ?? 0) : (ruler.treasury || 0));

  if (treasury < cost.goldCost) {
    return {
      success: false,
      message: `Insufficient ${useCrownFisc ? 'Crown Fisc' : 'treasury'}: raising ${count} ${category} costs ${cost.goldCost}g (${cost.per100Gold}g / 100 men), but ${useCrownFisc ? realm!.name : ruler.name} holds ${Math.round(treasury)}g.`,
    };
  }

  if (useCrownFisc && realm) {
    realm.treasury = Math.round((treasury - cost.goldCost) * 10) / 10;
  } else {
    ruler.treasury = Math.round((treasury - cost.goldCost) * 10) / 10;
  }
  ruler.menAtArms = (ruler.menAtArms || 0) + count;

  // Also reinforce any active non-returning field army commanded/owned by this ruler (never garrisons)
  const activeArmy = (world.armies || []).find(
    (a) => !a.isReturning && !a.isGarrison && (a.attackerId === ruler.id || a.commanderId === ruler.id)
  );
  if (activeArmy) {
    activeArmy.strength += count;
    if (!activeArmy.regiments) activeArmy.regiments = [];
    const existingReg = activeArmy.regiments.find((r) => r.category === category);
    if (existingReg) {
      existingReg.count += count;
      existingReg.maxCount += count;
    } else {
      const def = REGIMENT_DEFINITIONS[category];
      activeArmy.regiments.push({
        id: generateUniqueId('reg'),
        category,
        placeholderName: def.defaultPlaceholder.replace('{realm}', ruler.houseName || 'Royal').replace('{culture}', 'Elite'),
        count,
        maxCount: count,
        morale: 100,
        veterancy: 25,
      });
    }
  }

  return {
    success: true,
    goldSpent: cost.goldCost,
    message: `Raised ${count} ${category} for ${cost.goldCost}g (${cost.per100Gold}g per 100 men; +${cost.monthlyUpkeep}g/mo upkeep).`,
  };
}

export interface MercenaryCompanyDef {
  id: 'crossbow_company' | 'condottieri' | 'siege_engineers';
  name: string;
  description: string;
  goldCost: number;
  troops: number;
  category: Exclude<UnitCategory, 'Levy'>;
  monthlyUpkeepNote: string;
}

export const MERCENARY_COMPANIES: readonly MercenaryCompanyDef[] = [
  {
    id: 'crossbow_company',
    name: 'Free Crossbow Guild',
    description: 'Professional Genoese-style crossbowmen for extended campaigns beyond the 40-day levy.',
    goldCost: 110,
    troops: 150,
    category: 'Ranged',
    monthlyUpkeepNote: '~4.5g/mo pay',
  },
  {
    id: 'condottieri',
    name: 'Armored Condottieri Banner',
    description: 'Contracted heavy men-at-arms and lancers paid in hard coin.',
    goldCost: 195,
    troops: 200,
    category: 'Cavalry',
    monthlyUpkeepNote: '~15g/mo pay',
  },
  {
    id: 'siege_engineers',
    name: 'Master Siege Engineers',
    description: 'Hired trebuchet wrights, sappers, and bombardiers to crack stone fortresses.',
    goldCost: 160,
    troops: 100,
    category: 'Siege',
    monthlyUpkeepNote: '~10g/mo pay',
  },
];

export function hireMercenaryCompany(
  rulerId: string,
  companyId: MercenaryCompanyDef['id'],
  world: WorldState
): { success: boolean; message: string; goldSpent?: number } {
  const ruler = world.characters?.find((c) => c.id === rulerId && c.isAlive);
  if (!ruler) return { success: false, message: 'Ruler not found.' };

  const company = MERCENARY_COMPANIES.find((m) => m.id === companyId);
  if (!company) return { success: false, message: 'Mercenary company not found.' };

  const realm = world.realms?.find((r) => r.rulerId === ruler.id || (ruler.role === 'Monarch' && r.id === ruler.realmId));
  const useCrownFisc = Boolean(realm);
  const treasury = Math.max(0, useCrownFisc ? (realm!.treasury ?? 0) : (ruler.treasury || 0));

  if (treasury < company.goldCost) {
    return {
      success: false,
      message: `Insufficient ${useCrownFisc ? 'Crown Fisc' : 'treasury'}: chartering ${company.name} costs ${company.goldCost}g (Available: ${Math.round(treasury)}g).`,
    };
  }

  if (useCrownFisc && realm) {
    realm.treasury = Math.round((treasury - company.goldCost) * 10) / 10;
  } else {
    ruler.treasury = Math.round((treasury - company.goldCost) * 10) / 10;
  }
  ruler.menAtArms = (ruler.menAtArms || 0) + company.troops;

  const activeArmy = (world.armies || []).find(
    (a) => !a.isReturning && !a.isGarrison && (a.attackerId === ruler.id || a.commanderId === ruler.id)
  );
  if (activeArmy) {
    activeArmy.strength += company.troops;
    if (!activeArmy.regiments) activeArmy.regiments = [];
    activeArmy.regiments.push({
      id: generateUniqueId('merc'),
      category: company.category,
      placeholderName: company.name,
      count: company.troops,
      maxCount: company.troops,
      morale: 100,
      veterancy: 45,
    });
  }

  if (!world.history) world.history = [];
  world.history.unshift({
    id: generateUniqueId('hist_merc'),
    year: world.currentYear,
    title: `Mercenaries Hired: ${company.name}`,
    category: 'War & Conquest',
    description: `${ruler.name} contracted the ${company.name} (+${company.troops} ${company.category}) for ${company.goldCost}g.`,
    primaryActorId: ruler.id,
    realmId: ruler.realmId,
  });

  return {
    success: true,
    goldSpent: company.goldCost,
    message: `Chartered ${company.name} (+${company.troops} ${company.category}) for ${company.goldCost}g!`,
  };
}

const CULTURE_UNIT_TITLES: Record<string, Partial<Record<UnitCategory, string>>> = {
  Nordic: {
    Levy: '{realm} Bondi Muster',
    Spear: '{realm} Shieldwall',
    Infantry: '{realm} Hirdmen',
    Ranged: '{realm} Fjord Hunters',
    Cavalry: '{realm} Jarl Riders',
    Siege: '{realm} Battering Engines',
    CulturalSpecial: '{realm} Huskarl Guard',
  },
  Imperial: {
    Levy: '{realm} Provincial Militia',
    Spear: '{realm} Imperial Pikemen',
    Infantry: '{realm} Legionaries',
    Ranged: '{realm} Arbalestiers',
    Cavalry: '{realm} Cataphracts',
    Siege: '{realm} Bombard Train',
    CulturalSpecial: '{realm} Palatine Guard',
  },
  Highland: {
    Levy: '{realm} Clan Levy',
    Spear: '{realm} Schiltron Pikemen',
    Infantry: '{realm} Claymore Footmen',
    Ranged: '{realm} Crag Longbowmen',
    Cavalry: '{realm} Border Reivers',
    Siege: '{realm} Sapper Corps',
    CulturalSpecial: '{realm} Galloglass Guard',
  },
  Eastern: {
    Levy: '{realm} Steppe Conscripts',
    Spear: '{realm} Bardiche Spearmen',
    Infantry: '{realm} Druzhina Footmen',
    Ranged: '{realm} Horse Archers',
    Cavalry: '{realm} Boyar Lancers',
    Siege: '{realm} Siege Engineers',
    CulturalSpecial: '{realm} Bogatyr Retinue',
  },
  Steppe: {
    Levy: '{realm} Herder Auxiliaries',
    Spear: '{realm} Camp Spearmen',
    Infantry: '{realm} Foot Raiders',
    Ranged: '{realm} Composite Bowmen',
    Cavalry: '{realm} Steppe Lancers',
    Siege: '{realm} Traction Trebuchets',
    CulturalSpecial: '{realm} Keshig Guard',
  },
  Maritime: {
    Levy: '{realm} Harbor Militia',
    Spear: '{realm} Dockside Pikemen',
    Infantry: '{realm} Marine Halberdiers',
    Ranged: '{realm} Pavise Crossbowmen',
    Cavalry: '{realm} Condottieri Horse',
    Siege: '{realm} Naval Bombards',
    CulturalSpecial: '{realm} Corsairs & Wardens',
  },
  Desert: {
    Levy: '{realm} Oasis Levy',
    Spear: '{realm} Garrison Spearmen',
    Infantry: '{realm} Ghazi Swordsmen',
    Ranged: '{realm} Skirmisher Archers',
    Cavalry: '{realm} Mamluk Lancers',
    Siege: '{realm} Manjaniq Battery',
    CulturalSpecial: '{realm} Royal Faris Guard',
  },
  Arcane: {
    Levy: '{realm} Covenant Levy',
    Spear: '{realm} Runic Halberdiers',
    Infantry: '{realm} Wardens-at-Arms',
    Ranged: '{realm} Silverbow Cohort',
    Cavalry: '{realm} Dawnblade Knights',
    Siege: '{realm} Stonebreaker Engines',
    CulturalSpecial: '{realm} Order Templar',
  },
};

export function resolveRegimentNameTemplate(
  template: string,
  originRealmName?: string,
  originCulture?: string,
  houseName?: string
): string {
  const cleanRealm = (originRealmName || 'Crownland')
    .replace(/^(Kingdom|Grand Duchy|Duchy|Principality|Republic|Empire|Crownlands) of\s+/i, '')
    .trim();
  const cleanCulture = (originCulture || 'Feudal').trim();
  const cleanHouse = (houseName || 'Royal').trim();

  return template
    .replace(/\{realm\}/g, cleanRealm)
    .replace(/\{culture\}/g, cleanCulture)
    .replace(/\{house\}/g, cleanHouse)
    .replace(/\s+/g, ' ')
    .trim();
}

export function getOriginRegimentName(
  category: UnitCategory,
  realmName?: string,
  culture?: string,
  houseName?: string
): string {
  const cultMap = culture ? CULTURE_UNIT_TITLES[culture] : undefined;
  const template =
    cultMap?.[category] ||
    REGIMENT_DEFINITIONS[category]?.defaultPlaceholder ||
    '{realm} Regiment';
  return resolveRegimentNameTemplate(template, realmName, culture, houseName);
}

// ============================================================================
// 2. RECRUITMENT & CORPS COMPOSITION
// ============================================================================

export function buildArmyRegiments(
  commander: Character,
  totalManpower: number,
  world: WorldState,
  originRealmId?: string
): Regiment[] {
  const regiments: Regiment[] = [];
  const mStat = commander.baseMartial || 10;
  const traits = new Set([
    ...(commander.v17Traits || []),
    ...(commander.personalityTraits || []),
    ...(commander.commanderTraits || []),
    ...(commander.educationTrait ? [commander.educationTrait] : []),
  ]);
  const isCommanderAggressive = traits.has('Aggressive') || traits.has('Aggressive Attacker') || traits.has('Brave');
  const isCommanderDefensive = traits.has('Defensive') || traits.has('Unyielding Defender') || traits.has('Patient');

  const resolvedRealmId = originRealmId || commander.realmId;
  const originRealm =
    world.realms?.find((r) => r.id === resolvedRealmId) ||
    world.realms?.find((r) => r.id === commander.realmId);
  const originRealmName = originRealm?.name || `${commander.houseName || 'Crown'} Realm`;
  const originCulture = originRealm?.culture || 'Imperial';

  const safeManpower = Math.max(40, Math.round(totalManpower));
  let levyCount = Math.round(safeManpower * 0.44);
  const infantryCount = Math.round(safeManpower * 0.24);
  const spearCount = Math.round(safeManpower * 0.14);
  const rangedCount = Math.round(safeManpower * 0.10);
  const cavCount = Math.round(safeManpower * 0.05);
  const used = levyCount + infantryCount + spearCount + rangedCount + cavCount;
  const remainder = safeManpower - used;
  let specialCount = 0;
  if (safeManpower >= 200) {
    specialCount = Math.max(10, remainder);
  } else if (remainder !== 0) {
    levyCount = Math.max(10, levyCount + remainder);
  }

  const makeRegiment = (cat: UnitCategory, count: number): Regiment => ({
    id: generateUniqueId(`reg_${cat.toLowerCase()}`),
    category: cat,
    placeholderName: getOriginRegimentName(cat, originRealmName, originCulture, commander.houseName),
    originRealmId: originRealm?.id || resolvedRealmId,
    originRealmName,
    originCulture,
    count,
    maxCount: count,
    morale: 85 + (isCommanderDefensive ? 15 : 0),
    veterancy: Math.min(100, mStat * 4 + (isCommanderAggressive ? 10 : 0)),
  });

  if (levyCount > 0) regiments.push(makeRegiment('Levy', levyCount));
  if (infantryCount > 0) regiments.push(makeRegiment('Infantry', infantryCount));
  if (spearCount > 0) regiments.push(makeRegiment('Spear', spearCount));
  if (rangedCount > 0) regiments.push(makeRegiment('Ranged', rangedCount));
  if (cavCount > 0) regiments.push(makeRegiment('Cavalry', cavCount));
  if (specialCount > 0) regiments.push(makeRegiment('CulturalSpecial', specialCount));

  return regiments;
}

export function evaluateArmySupplyStatus(
  army: Army,
  world: WorldState,
  consumeTick: boolean = false
): { supplied: boolean; missingGoods: CommodityType[]; combatPowerMult: number; siegeProgressMult: number } {
  if (!world.economy?.burgMarkets) {
    return { supplied: true, missingGoods: [], combatPowerMult: 1.0, siegeProgressMult: 1.0 };
  }

  const commander = world.characters?.find((c) => c.id === army.attackerId || c.id === army.commanderId);
  const realmId = army.realmId || commander?.realmId;
  const supplyBurgs = (world.burgs || []).filter(
    (b) => (realmId && b.stateId === realmId) || (commander && b.ownerId === commander.id)
  );
  if (supplyBurgs.length === 0) {
    return { supplied: true, missingGoods: [], combatPowerMult: 1.0, siegeProgressMult: 1.0 };
  }

  const neededGoods = new Set<CommodityType>(['Grain']);
  const regs = army.regiments || [];
  if (regs.length === 0) {
    neededGoods.add('Steel Arms & Armor');
  } else {
    for (const reg of regs) {
      if ((reg.count || 0) <= 0) continue;
      if (reg.category === 'Infantry' || reg.category === 'Spear' || reg.category === 'CulturalSpecial') {
        neededGoods.add('Steel Arms & Armor');
        neededGoods.add('Tanned Leather');
      } else if (reg.category === 'Ranged') {
        neededGoods.add('Crossbow Bolts');
      } else if (reg.category === 'Cavalry') {
        neededGoods.add('Warhorses');
        neededGoods.add('Steel Arms & Armor');
      } else if (reg.category === 'Siege') {
        neededGoods.add('Blackpowder');
        neededGoods.add('Bronze & Brassware');
      }
    }
  }

  const missingGoods: CommodityType[] = [];
  for (const good of neededGoods) {
    let totalStock = 0;
    for (const b of supplyBurgs) {
      const m = world.economy.burgMarkets[b.id]?.markets?.[good];
      if (m) totalStock += m.stockpile || 0;
    }
    const minRequired = Math.max(0.8, supplyBurgs.length * 0.8);
    if (totalStock < minRequired) {
      missingGoods.push(good);
    } else if (consumeTick) {
      const donor = supplyBurgs.find((b) => (world.economy?.burgMarkets?.[b.id]?.markets?.[good]?.stockpile || 0) >= 0.2);
      const m = donor ? world.economy.burgMarkets[donor.id]?.markets?.[good] : undefined;
      if (m) m.stockpile = Math.max(0, Math.round((m.stockpile - 0.15) * 10) / 10);
    }
  }

  const supplied = missingGoods.length === 0;
  return {
    supplied,
    missingGoods,
    combatPowerMult: supplied ? 1.0 : 0.80,
    siegeProgressMult: supplied ? 1.0 : 0.65,
  };
}

// ============================================================================
// 3. TACTICAL FIELD BATTLES & COMMANDER DUELS
// ============================================================================

export function resolveTacticalFieldBattle(
  army: Army,
  targetHolding: Holding,
  defenderLeader: Character,
  world: WorldState
): TacticalBattleReport {
  const attackerCommander = world.characters.find((c) => c.id === army.commanderId) || world.characters.find((c) => c.id === army.attackerId);
  const defProv = world.provinces?.find((p) => p.id === targetHolding.provinceId);
  const terrain = defProv?.terrain || 'Plains';

  let attackerPower = 0;
  for (const reg of army.regiments || []) {
    const def = REGIMENT_DEFINITIONS[reg.category];
    const terrainMod = def.terrainAffinities[terrain] || 1.0;
    const veterancyBonus = 1.0 + (reg.veterancy / 200.0);
    const effectiveCount = reg.count * (reg.morale / 100.0);
    attackerPower += effectiveCount * def.baseAttack * terrainMod * veterancyBonus;
  }

  if (attackerPower === 0) {
    attackerPower = army.strength * 10;
  }

  // Real Military Supply Check (-20% Combat Power when arms/horses/powder depleted)
  const supplyStatus = evaluateArmySupplyStatus(army, world, true);
  attackerPower *= supplyStatus.combatPowerMult;

  const matchingBurg = world.burgs?.find(
    (b) => b.id === targetHolding.id || `holding_${b.id}` === targetHolding.id || targetHolding.id.endsWith(b.id)
  );
  const defLevy = Math.max(
    40,
    targetHolding.baseLevy || matchingBurg?.garrisonCount || Math.round((matchingBurg?.population || 2500) * 0.015)
  );
  let defenderPower = defLevy * 12;
  if (targetHolding.estateType === 'Castle') defenderPower *= 1.45;
  else if (targetHolding.estateType === 'City') defenderPower *= 1.15;

  const atkRealm = world.realms.find((r) => r.id === (army.realmId || attackerCommander?.realmId));
  const defRealm = world.realms.find((r) => r.id === defenderLeader?.realmId);
  if (atkRealm?.budget && atkRealm.budget.bankruptcyUntilYear > world.currentYear) {
    attackerPower *= 0.75;
  }
  if (defRealm?.budget && defRealm.budget.bankruptcyUntilYear > world.currentYear) {
    defenderPower *= 0.75;
  }
  const attackerTactic =
    army.tactic ||
    atkRealm?.preferredBattleTactic ||
    pickSmartBattleTactic(army, terrain, false, attackerCommander);
  const defenderTactic =
    defRealm?.preferredBattleTactic ||
    pickSmartBattleTactic(undefined, terrain, true, defenderLeader);
  const strat = evaluateBattleStrategy({
    attackerTactic,
    defenderTactic,
    terrain,
    attackerCommander,
    defenderCommander: defenderLeader,
  });

  const finalAtk = attackerPower * strat.atkMultiplier;
  const finalDef = defenderPower * strat.defMultiplier;

  const attackerWon = finalAtk >= finalDef;

  // Commander Duels
  let duel: BattleDuelResult | undefined = undefined;
  if (attackerCommander && defenderLeader && Math.random() < 0.35) {
    const atkProwess = attackerCommander.baseProwess || 10;
    const defProwess = defenderLeader.baseProwess || 10;
    const rollA = atkProwess + Math.floor(Math.random() * 12);
    const rollD = defProwess + Math.floor(Math.random() * 12);
    const commanderWon = rollA >= rollD;

    const diff = Math.abs(rollA - rollD);
    let fatality: BattleDuelResult['fatalityOrInjury'] = 'Unharmed';
    if (diff > 8) fatality = 'Slain';
    else if (diff > 5) fatality = 'Maimed';
    else if (diff > 2) fatality = 'Wounded';
    else if (diff > 0) fatality = 'Captured';

    const winner = commanderWon ? attackerCommander : defenderLeader;
    const loser = commanderWon ? defenderLeader : attackerCommander;

    duel = {
      commanderWon,
      attackerProwess: atkProwess,
      defenderProwess: defProwess,
      outcomeDescription: `Heroic duel beneath battle standards! ${winner.name} overwhelmed ${loser.name} in single combat (${fatality})!`,
      fatalityOrInjury: fatality,
    };

    if (duel.fatalityOrInjury === 'Slain') {
      // Centralized killCharacter triggers proper succession & title redistribution
      const warDeath = pickContextualDeathCause(loser, 'war');
      killCharacter(loser, warDeath.cause, world, warDeath.category);
    } else if (duel.fatalityOrInjury === 'Maimed') {
      const pTraits = loser.personalityTraits || [];
      const vTraits = loser.v17Traits || [];
      if (!pTraits.includes('Maimed')) pTraits.push('Maimed');
      if (!vTraits.includes('Maimed')) vTraits.push('Maimed');
      loser.personalityTraits = pTraits;
      loser.v17Traits = vTraits;
      loser.stress = Math.min(300, (loser.stress || 0) + 40);
    } else if (duel.fatalityOrInjury === 'Wounded') {
      const pTraits = loser.personalityTraits || [];
      const vTraits = loser.v17Traits || [];
      if (!pTraits.includes('Wounded')) pTraits.push('Wounded');
      if (!vTraits.includes('Wounded')) vTraits.push('Wounded');
      loser.personalityTraits = pTraits;
      loser.v17Traits = vTraits;
      loser.stress = Math.min(300, (loser.stress || 0) + 20);
    } else if (duel.fatalityOrInjury === 'Captured') {
      loser.isImprisoned = true;
      const vTraits = loser.v17Traits || [];
      if (!vTraits.includes('Imprisoned')) vTraits.push('Imprisoned');
      loser.v17Traits = vTraits;
    }
  }

  const totalAtkCount = (army.regiments || []).reduce((acc, r) => acc + r.count, 0) || Math.round(army.strength);
  const totalDefCount = defLevy;

  const atkLossRatio = (attackerWon ? (0.08 + Math.random() * 0.11) : (0.24 + Math.random() * 0.22)) * strat.atkCasualtyMod;
  const defLossRatio = (attackerWon ? (0.34 + Math.random() * 0.32) : (0.09 + Math.random() * 0.14)) * strat.defCasualtyMod;

  const attackerCasualties = Math.min(totalAtkCount, Math.round(totalAtkCount * atkLossRatio));
  const defenderCasualties = Math.min(totalDefCount, Math.round(totalDefCount * defLossRatio));

  for (const reg of army.regiments || []) {
    reg.count = Math.max(0, Math.round(reg.count * Math.max(0.15, 1.0 - atkLossRatio)));
    reg.morale = Math.max(10, Math.round(reg.morale * (attackerWon ? 0.95 : 0.65)));
  }

  // BATTLE EXPERIENCE & DYNAMIC COMBAT TRAIT SYSTEM
  const traitNotes: string[] = [];
  const applyCommanderBattleExperience = (
    cmd: Character | undefined,
    won: boolean,
    isDefending: boolean,
    ownLossRatio: number,
    enemyCasualties: number
  ) => {
    if (!cmd || cmd.isAlive === false) return;
    cmd.battlesFought = (cmd.battlesFought || 0) + 1;
    if (won) cmd.battlesWon = (cmd.battlesWon || 0) + 1;

    const prevXp = cmd.battleExperience || 0;
    const xpGain = won ? 28 + Math.min(18, Math.floor(enemyCasualties / 80)) : 12;
    cmd.battleExperience = prevXp + xpGain;
    cmd.prestige = (cmd.prestige || 0) + (won ? 55 : 12);

    // Promote Martial & Prowess as commander seasons through warfare
    const prevTier = Math.floor(prevXp / 55);
    const nextTier = Math.floor(cmd.battleExperience / 55);
    if (nextTier > prevTier) {
      cmd.baseMartial = Math.min(28, (cmd.baseMartial || 10) + 1);
      if (won) {
        cmd.baseProwess = Math.min(26, (cmd.baseProwess || 10) + 1);
      }
      const note = `${cmd.name} grew seasoned in war (+1 Martial${won ? ', +1 Prowess' : ''})`;
      traitNotes.push(note);
      cmd.warTraitEvents = [
        `[${world.currentYear}] ${note}`,
        ...(cmd.warTraitEvents || []),
      ].slice(0, 10);
    }

    const addTrait = (
      trait: string,
      bucket: 'commanderTraits' | 'personalityTraits' | 'physicalHealthTraits',
      reason: string
    ) => {
      if (!cmd[bucket]) cmd[bucket] = [];
      if (!cmd.v17Traits) cmd.v17Traits = [];
      if (!cmd[bucket].includes(trait)) {
        cmd[bucket].push(trait);
        if (!cmd.v17Traits.includes(trait)) cmd.v17Traits.push(trait);
        const note = `${cmd.name} gained [${trait}] (${reason})`;
        traitNotes.push(note);
        cmd.warTraitEvents = [
          `[${world.currentYear}] ${note}`,
          ...(cmd.warTraitEvents || []),
        ].slice(0, 10);
      }
    };

    // 1. Veteran Commander after 2+ battles
    if (cmd.battlesFought >= 2 && !(cmd.commanderTraits || []).includes('Veteran Commander')) {
      addTrait('Veteran Commander', 'commanderTraits', `${cmd.battlesFought} field battles`);
    }

    // 2. Terrain specialization on victory
    if (won && Math.random() < 0.35) {
      const terrainTraitMap: Record<string, string> = {
        Forest: 'Forest Stalker',
        Mountains: 'Mountain Goatherd',
        Plains: 'Open Plains Master',
        Coastal: 'Ford Crosser',
      };
      const tTrait = terrainTraitMap[terrain];
      if (tTrait) addTrait(tTrait, 'commanderTraits', `victory in ${terrain}`);
    }

    // 3. Tactical / Personality shifts from winning or losing
    if (won) {
      if (isDefending && Math.random() < 0.30) {
        addTrait('Unyielding Defender', 'commanderTraits', `held ${targetHolding.name}`);
      } else if (!isDefending && ownLossRatio < 0.16 && Math.random() < 0.30) {
        addTrait('Aggressive Attacker', 'commanderTraits', `decisive assault at ${targetHolding.name}`);
      }

      if (Math.random() < 0.22) {
        // Courage forged in victory removes Craven if present
        if ((cmd.personalityTraits || []).includes('Craven')) {
          cmd.personalityTraits = cmd.personalityTraits.filter((t) => t !== 'Craven');
          cmd.v17Traits = (cmd.v17Traits || []).filter((t) => t !== 'Craven');
          const note = `${cmd.name} overcame [Craven] through battlefield victory`;
          traitNotes.push(note);
          cmd.warTraitEvents = [`[${world.currentYear}] ${note}`, ...(cmd.warTraitEvents || [])].slice(0, 10);
        } else {
          addTrait('Brave', 'personalityTraits', `led the charge at ${targetHolding.name}`);
        }
      }

      if (enemyCasualties >= 250 && Math.random() < 0.18) {
        addTrait('Ruthless', 'personalityTraits', `heavy slaughter at ${targetHolding.name}`);
      }
    } else {
      // Hard defeat can shake morale or leave scars
      if (ownLossRatio >= 0.32 && Math.random() < 0.24 && !(cmd.personalityTraits || []).includes('Brave')) {
        addTrait('Craven', 'personalityTraits', `shattered at ${targetHolding.name}`);
      }
      cmd.stress = Math.min(300, (cmd.stress || 0) + 18);
    }

    // 4. Physical battle scars on bloody engagements
    if (ownLossRatio >= 0.22 && Math.random() < 0.20) {
      addTrait('Scarred', 'physicalHealthTraits', `wounded at ${targetHolding.name}`);
    }
  };

  applyCommanderBattleExperience(attackerCommander, attackerWon, false, atkLossRatio, defenderCasualties);
  applyCommanderBattleExperience(defenderLeader, !attackerWon, true, defLossRatio, attackerCasualties);

  const report: TacticalBattleReport = {
    id: generateUniqueId('report'),
    year: world.currentYear,
    attackerWon,
    terrain,
    attackerCasualties,
    defenderCasualties,
    attackerRemainingStrength: Math.max(0, totalAtkCount - attackerCasualties),
    defenderRemainingStrength: Math.max(0, totalDefCount - defenderCasualties),
    duelResult: duel,
    attackerTactic,
    defenderTactic,
    weatherCondition: strat.weatherCondition,
    tacticalSummary: strat.tacticalSummary,
    diceSwingPct: strat.diceSwingPct,
    narrativeSummary: attackerWon
      ? `VICTORY AT ${targetHolding.name.toUpperCase()}: ${attackerCommander?.name || 'The Host'} (${attackerTactic}) broke ${defenderLeader?.name || 'the garrison'} (${defenderTactic}) across ${terrain}. ${strat.tacticalSummary}. Enemy lost ${defenderCasualties} men.${traitNotes.length > 0 ? ` ${traitNotes[0]}.` : ''}`
      : `DEFEAT AT ${targetHolding.name.toUpperCase()}: ${defenderLeader?.name || 'The defenders'} (${defenderTactic}) repulsed ${attackerCommander?.name || 'the host'} (${attackerTactic}) across ${terrain}. ${strat.tacticalSummary}. Attackers lost ${attackerCasualties} men.${traitNotes.length > 0 ? ` ${traitNotes[0]}.` : ''}`,
  };
  army.lastBattleReport = report;

  if (!world.history) world.history = [];
  world.history.unshift({
    id: generateUniqueId('hist_battle'),
    year: world.currentYear,
    title: `Battle of ${targetHolding.name}: ${attackerWon ? 'Attacker Victory' : 'Defender Repulse'}`,
    category: 'War & Conquest',
    description: report.narrativeSummary,
    primaryActorId: attackerCommander?.id,
    secondaryActorId: defenderLeader?.id,
    realmId: attackerCommander?.realmId,
  });
  // UPDATE STRATEGIC WAR SCORE & BATTLE LOG
  const activeWar = (world.activeWars || []).find(
    (war) =>
      war.id === army.warId ||
      (war.attackerLeaderId === army.attackerId && war.defenderLeaderId === army.defenderId) ||
      (war.attackerLeaderId === army.defenderId && war.defenderLeaderId === army.attackerId)
  );

  if (activeWar) {
    activeWar.battlesFought += 1;
    const battleRec: WarBattleRecord = {
      id: report.id,
      year: world.currentYear,
      holdingName: targetHolding.name,
      terrain,
      weatherCondition: strat.weatherCondition,
      attackerCommanderId: attackerCommander?.id,
      attackerCommanderName: attackerCommander?.name || 'Royal Vanguard',
      defenderCommanderId: defenderLeader?.id,
      defenderCommanderName: defenderLeader?.name || 'Garrison Commander',
      attackerWon,
      attackerTactic,
      defenderTactic,
      attackerCasualties,
      defenderCasualties,
      tacticalSummary: strat.tacticalSummary,
      duelSummary: duel?.outcomeDescription,
      traitNotes: traitNotes.length > 0 ? traitNotes : undefined,
    };
    activeWar.battleLog = [battleRec, ...(activeWar.battleLog || [])].slice(0, 24);

    const isDefenderArmy =
      army.isDefender === true || activeWar.defenderLeaderId === army.attackerId;
    const warAttackerWon = isDefenderArmy ? !attackerWon : attackerWon;
    const sideSign = warAttackerWon ? 1 : -1;

    // Capturing monarch in a duel triggers decisive 100% battle war score; otherwise accumulate battleWarScore (-60..60)
    if (duel?.fatalityOrInjury === 'Captured') {
      const loser = attackerWon ? defenderLeader : attackerCommander;
      const loserIsMonarch = loser?.role === 'Monarch';
      if (loserIsMonarch) {
        activeWar.battleWarScore = sideSign * 100;
      } else {
        activeWar.battleWarScore = Math.max(
          -60,
          Math.min(60, (activeWar.battleWarScore ?? 0) + sideSign * 30)
        );
      }
    } else {
      activeWar.battleWarScore = Math.max(
        -60,
        Math.min(60, (activeWar.battleWarScore ?? 0) + sideSign * 14)
      );
    }
    recomputeWarScores(world);
  }
  return report;
}

// ============================================
// 4. SIEGE ARTILLERY & PROVISIONS ENGINE
// ============================================

const FORTIFICATION_SLOT_IDS = [
  'bf_keep',
  'bf_walls',
  'cc_walls',
  'cc_palace',
  'rm_walls',
  'mt_walls',
  'tp_seawall',
  'as_walls',
  'fv_defense',
  'mh_watchtower',
] as const;

/**
 * Computes the effective castle/fortification tier (0 to 5) of a holding and its matching burg.
 * Uses actual built defensive building slots when available (accounting for dilapidation),
 * falling back to settlement type and holding development for uninitialized holdings.
 */
export function getCastleFortificationTier(holding?: Holding, burg?: Burg): number {
  let slotTier = 0;
  if (burg?.buildingSlots) {
    for (const slotId of FORTIFICATION_SLOT_IDS) {
      const st = burg.buildingSlots[slotId];
      if (!st || st.level <= 0) continue;
      const effectiveLevel = st.dilapidated ? Math.max(0, st.level - 1) : st.level;
      if (effectiveLevel > slotTier) {
        slotTier = effectiveLevel;
      }
    }
  }

  if (slotTier > 0) {
    return slotTier;
  }

  // Fallback when buildingSlots haven't been initialized yet
  if (burg?.type === 'Capital Citadel') {
    return (burg.developmentLevel || 0) >= 28 ? 4 : 3;
  }
  if (burg?.type === 'Border Fortress') {
    return (burg.developmentLevel || 0) >= 22 ? 3 : 2;
  }
  if (holding?.estateType === 'Castle') {
    const dev = holding.dev || burg?.developmentLevel || 15;
    if (dev >= 35) return 3;
    if (dev >= 18) return 2;
    return 1;
  }
  return 0;
}

/**
 * Returns true if the holding/burg is a Tier 2+ castle or fortified stronghold
 * capable of projecting a Zone of Control that forces invading armies to lay siege before passing.
 */
export function isBlockingTier2Castle(holding?: Holding, burg?: Burg): boolean {
  return isBlockingFortifiedSettlement(holding, burg).blocks;
}

/**
 * Evaluates whether a holding/burg blocks an invading army's advance:
 * - Any Tier 2+ Castle / Border Fortress / Capital Citadel
 * - Any walled settlement that is well defended and garrisoned (garrison >= 120)
 */
export function isBlockingFortifiedSettlement(
  holding?: Holding,
  burg?: Burg
): { blocks: boolean; tier: number; garrison: number; reason: string } {
  if (!holding) {
    return { blocks: false, tier: 0, garrison: 0, reason: '' };
  }

  const tier = getCastleFortificationTier(holding, burg);
  const garrison = Math.max(
    40,
    holding.baseLevy || 0,
    burg?.garrisonCount || 0,
    Math.round((burg?.population || 0) * 0.015)
  );

  const isCastleOrFortress =
    holding.estateType === 'Castle' ||
    burg?.type === 'Border Fortress' ||
    burg?.type === 'Capital Citadel';

  // 1. Any Tier 2+ Castle / Fortress / Citadel always blocks passage
  if (isCastleOrFortress && tier >= 2) {
    return {
      blocks: true,
      tier,
      garrison,
      reason: `Tier ${tier} Castle`,
    };
  }

  // 2. Check for intact walls / defensive works on any settlement
  const majorWallSlots = [
    'bf_keep',
    'bf_walls',
    'cc_walls',
    'cc_palace',
    'rm_walls',
    'mt_walls',
    'tp_seawall',
    'as_walls',
    'fv_defense',
    'mh_watchtower',
  ];
  let maxWallLevel = 0;
  if (burg?.buildingSlots) {
    for (const id of majorWallSlots) {
      const st = burg.buildingSlots[id];
      if (!st || st.level <= 0) continue;
      const eff = st.dilapidated ? Math.max(0, st.level - 1) : st.level;
      if (eff > maxWallLevel) maxWallLevel = eff;
    }
  }

  // Fallback for uninitialized walled cities/towns/sanctuaries
  const isInherentWalledCity =
    burg?.type === 'Royal Metropolis' ||
    burg?.type === 'Capital Citadel' ||
    burg?.type === 'Border Fortress' ||
    holding.estateType === 'City';
  const hasWalls = maxWallLevel >= 1 || isInherentWalledCity;

  // Tier 2+ walls always block; Tier 1 walls block if well defended & garrisoned (>= 120 men)
  if (hasWalls && (maxWallLevel >= 2 || garrison >= 120)) {
    const effTier = Math.max(1, tier, maxWallLevel);
    return {
      blocks: true,
      tier: effTier,
      garrison,
      reason: maxWallLevel >= 2 ? `Tier ${effTier} Walled Stronghold` : `Garrisoned Walled Settlement`,
    };
  }

  return { blocks: false, tier, garrison, reason: '' };
}

/**
 * Computes the proportional or greater besieging force required to invest and pin
 * a fortified castle or walled garrisoned settlement.
 */
export function computeRequiredSiegeForce(garrison: number, fortTier: number): number {
  const safeGarrison = Math.max(80, garrison);
  const mult = 1.25 + Math.max(0, fortTier - 1) * 0.25; // Tier 1: 1.25x, Tier 2: 1.5x, Tier 3: 1.75x, Tier 4: 2.0x
  return Math.max(160, Math.ceil(safeGarrison * mult));
}

export class SiegeAndPeaceEngine {
  static startSiege(army: Army, holding: Holding, defenderLeader: Character, w: WorldState): SiegeState {
    if (!w.activeSieges) w.activeSieges = [];
    const existingSiege = w.activeSieges.find(
      (s) => s.holdingId === holding.id && s.besiegerArmyId === army.id
    );
    if (existingSiege) return existingSiege;

    const matchingBurg = w.burgs?.find(
      (b) => b.id === holding.id || `holding_${b.id}` === holding.id || holding.id.endsWith(b.id)
    );
    const castleTier = getCastleFortificationTier(holding, matchingBurg);
    const fortLevel = Math.max(
      castleTier,
      holding.estateType === 'Castle' ? 2 : holding.estateType === 'City' ? 2 : 1
    );
    const garrisonSize = Math.max(
      40,
      holding.baseLevy || matchingBurg?.garrisonCount || Math.round((matchingBurg?.population || 2500) * 0.015)
    );
    const siege: SiegeState = {
      id: generateUniqueId('siege'),
      holdingId: holding.id,
      holdingName: holding.name,
      provinceId: holding.provinceId,
      besiegerArmyId: army.id,
      attackerCommanderId: army.commanderId || army.attackerId || '',
      defenderLeaderId: defenderLeader.id,
      fortLevel,
      garrisonCount: garrisonSize,
      maxGarrison: garrisonSize,
      provisionsMonths: holding.estateType === 'Castle' || fortLevel >= 2 ? 8 + fortLevel * 2 : 6,
      wallIntegrity: 100,
      monthsActive: 0,
      diseaseOutbreak: false,
      placeholderName: `Siege of ${holding.name}`,
      phase: 'ACTIVE',
    };

    w.activeSieges.push(siege);

    // Synchronize burg food status
    const burg = w.burgs?.find((b) => b.id === holding.id || `holding_${b.id}` === holding.id);
    if (burg) {
      burg.foodSecurity = 'RATIONED';
      burg.monthsOfFoodReserves = siege.provisionsMonths;
    }

    w.history.unshift({
      id: generateUniqueId('hist_siege_start'),
      year: w.currentYear,
      title: `Siege Laid: ${holding.name}`,
      category: 'War & Conquest',
      description: `The host has encircled ${holding.name}. Trenches and palisades erected as the investment begins.`,
      primaryActorId: siege.attackerCommanderId,
      secondaryActorId: defenderLeader.id,
      realmId: holding.provinceId,
    });

    return siege;
  }

  static step(w: WorldState, monthsDelta: number = 1): void {
    if (!w.activeSieges) return;
    const delta = Math.max(1, monthsDelta);

    for (let i = w.activeSieges.length - 1; i >= 0; i--) {
      const siege = w.activeSieges[i];
      siege.monthsActive += delta;
      siege.provisionsMonths = Math.max(0, siege.provisionsMonths - delta);

      const besiegerArmy = (w.armies || []).find((a) => a.id === siege.besiegerArmyId);
      const holding = (w.holdings || []).find((h) => h.id === siege.holdingId);
      const burg = w.burgs?.find((b) => b.id === siege.holdingId || `holding_${b.id}` === siege.holdingId);

      if (!holding || !besiegerArmy) {
        if (burg) {
          burg.foodSecurity = 'SECURE';
          burg.isStarving = false;
        }
        w.activeSieges.splice(i, 1);
        continue;
      }

      // Proportional besieging force check: an under-strength force cannot tighten the siege
      const hasProportionalForce = besiegerArmy.strength >= Math.max(80, Math.round(siege.garrisonCount * 0.95));
      const siegeEfficiency = hasProportionalForce ? 1.0 : 0.2;

      // Wall bombardment & direct siege devastation on settlement development
      // Real Military Supply Check (-35% Siege Progress if Blackpowder/Bronze/Arms missing)
      const besiegerSupply = evaluateArmySupplyStatus(besiegerArmy, w, true);
      const siegeEngines = (besiegerArmy.regiments || []).filter((r) => r.category === 'Siege');
      const wallDmg = (4 + siegeEngines.length * 8) * delta * siegeEfficiency * besiegerSupply.siegeProgressMult;
      siege.wallIntegrity = Math.max(0, siege.wallIntegrity - wallDmg);
      const besiegerCmd = w.characters.find((c) => c.id === siege.attackerCommanderId || c.id === besiegerArmy.commanderId);
      const defenderCmd = w.characters.find((c) => c.id === siege.defenderLeaderId);
      if (burg) {
        applyWarDevastationToBurg(burg, 'siege_month', w);
        // Monthly foraging, countryside raiding & siege attrition cause civilian + garrison population losses
        applyWarConductAndPopulationCasualties({
          army: besiegerArmy,
          commander: besiegerCmd,
          defenderLeader: defenderCmd,
          burg,
          context: 'siege_month',
          militaryCasualties: Math.round(wallDmg * 1.4),
          w,
        });
      }

      // Starvation & Food Security
      if (siege.provisionsMonths <= 0) {
        const prevGarrison = siege.garrisonCount;
        siege.garrisonCount = Math.max(0, Math.round(siege.garrisonCount * 0.85));
        siege.phase = 'STARVING';
        if (burg) {
          burg.isStarving = true;
          burg.foodSecurity = 'FAMINE';
          burg.monthsOfFoodReserves = 0;
          // Starvation kills civilians inside the besieged walls in addition to the garrison
          const famineCivilianDeaths = Math.max(8, Math.round((burg.population || 500) * 0.018 * delta));
          deductSettlementPopulation(burg, famineCivilianDeaths, Math.max(0, prevGarrison - siege.garrisonCount));
        }
      } else {
        if (burg) {
          burg.monthsOfFoodReserves = siege.provisionsMonths;
        }
      }

      if (siege.wallIntegrity <= 15) {
        siege.phase = 'BREACHED';
      }

      // Disease outbreak in camp lines
      if (siege.monthsActive >= 4 && Math.random() < 0.08) {
        siege.diseaseOutbreak = true;
        besiegerArmy.strength = Math.max(50, Math.round(besiegerArmy.strength * 0.90));
      }

      // Capitulation condition
      if ((siege.wallIntegrity <= 15 && siege.garrisonCount < siege.maxGarrison * 0.3) || siege.garrisonCount <= 25) {
        siege.phase = 'SURRENDERED';
        SiegeAndPeaceEngine.resolveSiegeFall(siege, holding, besiegerArmy, w);
        // Do not splice here: signPeaceTreaty inside resolveSiegeFall already cleanly removed the siege!
      }
    }
  }

static resolveSiegeFall(siege: SiegeState, holding: Holding, army: Army, w: WorldState): void {
    const attacker = w.characters.find((c) => c.id === siege.attackerCommanderId);
    const defender = w.characters.find((c) => c.id === siege.defenderLeaderId);
    const occupierRealmId = attacker?.realmId || w.realms.find((r) => r.rulerId === army.attackerId)?.id;

    holding.dev = Math.max(5, (holding.dev || 25) - 4); // Sacking reduction
    holding.occupiedByRealmId = occupierRealmId;
    holding.occupiedSinceYear = w.currentYear;

    // Synchronize burg devastation, slot damage, army discipline conduct & civilian casualties on siege fall
    const matchingBurg = w.burgs?.find(
      (b) => b.id === holding.id || `holding_${b.id}` === holding.id || holding.id.endsWith(b.id)
    );
    let conductReport: WarConductResult | null = null;
    if (matchingBurg) {
      applyWarDevastationToBurg(matchingBurg, 'siege_fall', w);
      conductReport = applyWarConductAndPopulationCasualties({
        army,
        commander: attacker,
        defenderLeader: defender,
        burg: matchingBurg,
        context: 'siege_fall',
        militaryCasualties: Math.max(25, Math.round((siege.maxGarrison || 150) * 0.45)),
        w,
      });
      matchingBurg.isStarving = false;
      matchingBurg.foodSecurity = 'SECURE';
    }

    // Recalculate feudal demesne so occupied holdings lose tax & levy output for their owner
    recalculateFeudalDemesne(w);

    if (attacker) attacker.prestige = (attacker.prestige || 100) + 120;
    if (defender) {
      defender.stress = Math.min(300, (defender.stress || 0) + 60);
      if (attacker) {
        if (!defender.opinions) defender.opinions = {};
        const extraAnger =
          conductReport?.conductTier === 'Brutal Sack & Atrocities'
            ? 35
            : conductReport?.conductTier === 'Unchecked Pillaging'
            ? 18
            : 0;
        defender.opinions[attacker.id] = Math.max(-100, (defender.opinions[attacker.id] ?? 0) - (30 + extraAnger));
      }
    }

    const conductText = conductReport
      ? ` ${conductReport.summary}`
      : '';
    w.history.unshift({
      id: generateUniqueId('hist_siege_fall'),
      year: w.currentYear,
      title:
        conductReport?.conductTier === 'Brutal Sack & Atrocities'
          ? `Sacked & Ravaged: ${holding.name}`
          : conductReport?.conductTier === 'Unchecked Pillaging'
          ? `Pillaged: ${holding.name}`
          : `Occupied: ${holding.name}`,
      category: 'War & Conquest',
      description: `The ramparts of ${holding.name} fell after ${siege.monthsActive} months of siege to ${attacker?.name || 'the besieger'}.${conductText}`,
      primaryActorId: attacker?.id,
      secondaryActorId: defender?.id,
      realmId: holding.provinceId,
    });

    // RECOMPUTE WAR SCORE DYNAMICALLY FROM ALL OCCUPIED HOLDINGS, PROVINCES & BATTLES
    const activeWar = (w.activeWars || []).find(
      (war) =>
        war.id === army.warId ||
        (war.attackerLeaderId === attacker?.id && war.defenderLeaderId === defender?.id) ||
        (war.attackerLeaderId === defender?.id && war.defenderLeaderId === attacker?.id)
    );

    let warEnded = false;
    if (activeWar) {
      recomputeWarScores(w);

      // Decisive victory threshold (Peace treaty auto-enforced when combined War Score hits ±100%)
      if (activeWar.warScore >= 100 || activeWar.warScore <= -100) {
        const trueVictor = activeWar.warScore >= 100 ? attacker : defender;
        const trueLoser = activeWar.warScore >= 100 ? defender : attacker;
        SiegeAndPeaceEngine.signPeaceTreaty(trueVictor, trueLoser, holding, w, activeWar);
        w.activeWars = w.activeWars?.filter((war) => war.id !== activeWar.id);
        warEnded = true;
      }
    } else {
      SiegeAndPeaceEngine.signPeaceTreaty(attacker, defender, holding, w);
      warEnded = true;
    }

    if (!warEnded) {
      // Clear this completed siege so the victorious army can press onward or return
      if (w.activeSieges) {
        w.activeSieges = w.activeSieges.filter((s) => s.id !== siege.id);
      }
      // Resume original deferred destination if this army was halted by a blocking Tier 2+ castle
      const deferredHolding = army.deferredTargetHoldingId
        ? w.holdings?.find(
            (h) =>
              h.id === army.deferredTargetHoldingId &&
              h.id !== holding.id &&
              h.ownerId !== attacker?.id &&
              h.occupiedByRealmId !== occupierRealmId
          )
        : undefined;

      const nextTarget =
        deferredHolding ||
        (activeWar?.targetHoldingIds || [])
          .map((hid) =>
            w.holdings?.find(
              (h) =>
                h.id === hid &&
                h.ownerId !== attacker?.id &&
                h.occupiedByRealmId !== occupierRealmId
            )
          )
          .find(Boolean) ||
        (defender
          ? (w.holdings || []).find(
              (h) =>
                h.ownerId === defender.id &&
                h.id !== holding.id &&
                h.occupiedByRealmId !== occupierRealmId
            )
          : undefined);
      const nextProv = nextTarget
        ? w.provinces?.find((p) => p.id === nextTarget.provinceId)
        : undefined;
      const nextBurg = nextTarget
        ? w.burgs?.find((b) => `holding_${b.id}` === nextTarget.id || b.id === nextTarget.id)
        : undefined;

      // Clear deferred target state now that the blocking castle has fallen
      army.deferredTargetHoldingId = undefined;
      army.deferredTargetX = undefined;
      army.deferredTargetY = undefined;
      army.interceptedByCastleName = undefined;

      if (nextTarget && (nextBurg || nextProv)) {
        const nextX = nextBurg?.x ?? nextProv!.capitalX;
        const nextY = nextBurg?.y ?? nextProv!.capitalY;
        const path = computeArmyMarchPath(army.targetX, army.targetY, nextX, nextY, w);
        army.startX = army.targetX;
        army.startY = army.targetY;
        army.targetX = nextX;
        army.targetY = nextY;
        army.waypoints = path.waypoints;
        army.totalMarchCost = path.totalMarchCost;
        army.speed = path.speed;
        army.targetHoldingId = nextTarget.id;
        army.progress = 0;
      } else {
        reverseArmyWaypoints(army);
        army.isReturning = true;
        army.progress = 0;
      }
    }
  }

  static signPeaceTreaty(
    victor: Character | undefined,
    loser: Character | undefined,
    contestedHolding: Holding,
    w: WorldState,
    activeWar?: ActiveWar
  ): void {
    const fallbackVictorId =
      victor?.id ||
      activeWar?.attackerLeaderId ||
      w.realms?.find((r) => r.id === activeWar?.attackerRealmId)?.rulerId ||
      w.monarchId;
    const resolvedVictor =
      victor || (fallbackVictorId ? w.characters.find((c) => c.id === fallbackVictorId) : undefined);

    if (!resolvedVictor) {
      // Even if victor record was somehow purged, never leave wars/sieges wedged
      if (w.activeWars && activeWar) {
        w.activeWars = w.activeWars.filter((war) => war.id !== activeWar.id);
      }
      if (w.activeSieges) {
        w.activeSieges = w.activeSieges.filter((s) => s.holdingId !== contestedHolding.id);
      }
      return;
    }

    let resolvedLoser = loser;
    if (!resolvedLoser) {
      const loserRealmId =
        activeWar && resolvedVictor.realmId === activeWar.attackerRealmId
          ? activeWar.defenderRealmId
          : activeWar?.attackerRealmId;
      const loserRealm = loserRealmId ? w.realms?.find((r) => r.id === loserRealmId) : undefined;
      const fallbackLoserId =
        loserRealm?.rulerId ||
        (activeWar && resolvedVictor.id === activeWar.attackerLeaderId
          ? activeWar.defenderLeaderId
          : activeWar?.attackerLeaderId) ||
        contestedHolding.ownerId;
      if (fallbackLoserId && fallbackLoserId !== resolvedVictor.id) {
        resolvedLoser = w.characters.find((c) => c.id === fallbackLoserId);
      }
    }

    // 1. Transfer ALL contested holdings / casus bellis bundled in this single war
    const allTargetIds = new Set<string>([
      contestedHolding.id,
      ...(activeWar?.targetHoldingIds || []),
    ]);

    for (const hid of allTargetIds) {
      transferHoldingSovereignty(hid, resolvedVictor, w);
    }

    // Clear occupation markers across holdings belonging to this war
    for (const h of w.holdings || []) {
      if (allTargetIds.has(h.id) || (resolvedVictor.realmId && h.occupiedByRealmId === resolvedVictor.realmId)) {
        h.occupiedByRealmId = undefined;
        h.occupiedSinceYear = undefined;
      }
    }

    // Renounce loser's claims across all settled casus bellis
    if (resolvedLoser?.claims) {
      resolvedLoser.claims = resolvedLoser.claims.filter((cl) => !allTargetIds.has(cl.holdingId));
    }

    const cbMultiplier = Math.max(1, activeWar?.casusBellis?.length || 1);
    const victorRealm = w.realms?.find((r) => r.rulerId === resolvedVictor.id || r.id === resolvedVictor.realmId);
    const loserRealm = resolvedLoser ? w.realms?.find((r) => r.rulerId === resolvedLoser.id || r.id === resolvedLoser.realmId) : undefined;
    const loserPurse = loserRealm?.treasury !== undefined ? loserRealm.treasury : (resolvedLoser?.treasury || 0);
    const indemnity = resolvedLoser
      ? Math.round(Math.min(Math.max(0, loserPurse), 80 * cbMultiplier) * 10) / 10
      : 0;
    if (indemnity > 0 && resolvedLoser) {
      if (victorRealm?.treasury !== undefined) {
        victorRealm.treasury = Math.round((victorRealm.treasury + indemnity) * 10) / 10;
      } else {
        resolvedVictor.treasury = Math.round(((resolvedVictor.treasury || 0) + indemnity) * 10) / 10;
      }
      if (loserRealm?.treasury !== undefined) {
        loserRealm.treasury = Math.max(0, Math.round((loserRealm.treasury - indemnity) * 10) / 10);
      } else {
        resolvedLoser.treasury = Math.max(0, Math.round(((resolvedLoser.treasury || 0) - indemnity) * 10) / 10);
      }
    }

    // 2. Enforce 5-year Peace Truce & +18 relation stabilization between belligerent realms
    const realmA = activeWar?.attackerRealmId || resolvedVictor.realmId;
    const realmB = activeWar?.defenderRealmId || resolvedLoser?.realmId;
    if (realmA && realmB && realmA !== realmB) {
      setRealmTruce(realmA, realmB, 5, w);
      const ra = w.realms?.find((r) => r.id === realmA);
      const rb = w.realms?.find((r) => r.id === realmB);
      if (ra && rb) {
        ra.diplomaticRelations = ra.diplomaticRelations || {};
        rb.diplomaticRelations = rb.diplomaticRelations || {};
        ra.diplomaticRelations[realmB] = Math.min(100, (ra.diplomaticRelations[realmB] ?? 0) + 18);
        rb.diplomaticRelations[realmA] = Math.min(100, (rb.diplomaticRelations[realmA] ?? 0) + 18);
      }
    }

    // 3. Conclude and purge the settled active war BEFORE clearing occupation stripes
    if (w.activeWars) {
      w.activeWars = w.activeWars.filter((war) => {
        if (activeWar) return war.id !== activeWar.id;
        const matchesHolding = war.targetHoldingIds?.some((id) => allTargetIds.has(id));
        const matchesBilateral =
          resolvedLoser &&
          ((war.attackerLeaderId === resolvedVictor.id && war.defenderLeaderId === resolvedLoser.id) ||
            (war.attackerLeaderId === resolvedLoser.id && war.defenderLeaderId === resolvedVictor.id));
        return !(matchesHolding && (matchesBilateral || !resolvedLoser));
      });
    }

    // Clear ALL occupation stripes involving belligerents & allies (unless another active war links occupier & owner)
    const belligerents = new Set<string>(
      [
        activeWar?.attackerRealmId,
        activeWar?.defenderRealmId,
        ...(activeWar?.alliedRealmIds || []),
        resolvedVictor.realmId,
        resolvedLoser?.realmId,
      ].filter((id): id is string => Boolean(id))
    );
    clearOccupationForBelligerents(w, belligerents);
    for (const h of w.holdings || []) {
      if (allTargetIds.has(h.id)) {
        h.occupiedByRealmId = undefined;
        h.occupiedSinceYear = undefined;
      }
    }

    // 4. Disband only armies belonging to this settled conflict & remove ghost/orphaned forces
    if (w.armies) {
      w.armies = w.armies.filter((a) => {
        if (activeWar && a.warId === activeWar.id) {
          return false;
        }
        const sameCombatants =
          resolvedLoser &&
          (a.attackerId === resolvedVictor.id || a.defenderId === resolvedVictor.id) &&
          (a.attackerId === resolvedLoser.id || a.defenderId === resolvedLoser.id);
        if (!a.warId && allTargetIds.has(a.targetHoldingId) && (sameCombatants || !resolvedLoser)) {
          return false;
        }
        return true;
      });
    }

    // 5. Remove active sieges across all settled holdings & sanitize residual state
    if (w.activeSieges) {
      w.activeSieges = w.activeSieges.filter((s) => !allTargetIds.has(s.holdingId));
    }
    sanitizeWarsArmiesAndOccupations(w);
    recomputeWarScores(w);

    reconcileFeudalHierarchy(w);
    recalculateFeudalDemesne(w);

    if (!w.history) w.history = [];
    const cbDesc =
      activeWar?.casusBellis && activeWar.casusBellis.length > 1
        ? `(${activeWar.casusBellis.map((c) => c.label).join('; ')})`
        : '';
    const loserLabel = resolvedLoser?.name || 'the fallen garrison';
    w.history.unshift({
      id: generateUniqueId('hist_peace'),
      year: w.currentYear,
      title: `Peace Accord: The Treaty of ${contestedHolding.name}`,
      category: 'War & Conquest',
      description: `Formal treaty sealed! ${loserLabel} conceded sovereignty over ${allTargetIds.size} contested holding(s) ${cbDesc} and paid ${indemnity}g war indemnities to ${resolvedVictor.name}.`,
      primaryActorId: resolvedVictor.id,
      secondaryActorId: resolvedLoser?.id,
      realmId: resolvedVictor.realmId,
    });
  }
}

// ============================================================================
// 5. ARMY DISCIPLINE, WARTIME CONDUCT & CIVILIAN / LEVY POPULATION CASUALTIES
// ============================================================================

export interface WarConductResult {
  discipline: number;
  conductTier: WarConductOutcomeTier;
  civilianCasualties: number;
  levyPopulationLoss: number;
  plunderedGold: number;
  extraDevastation: number;
  summary: string;
}

/**
 * Computes an army's wartime discipline (0..100) from commander traits,
 * unit professionalism (standing regiments vs levies), treasury solvency,
 * and active conduct policy.
 */
export function computeArmyDiscipline(
  army: Army,
  commander: Character | undefined,
  w: WorldState
): number {
  let score = 62;

  // Commander martial prowess & personality traits
  if (commander) {
    const martial = getCharacterV17Stat(commander, 'MARTIAL');
    const stewardship = getCharacterV17Stat(commander, 'STEWARDSHIP');
    score += Math.round((martial - 10) * 1.1 + (stewardship - 10) * 0.6);

    const traits = (commander.personalityTraits || []).map((t: string) => String(t).toLowerCase());
    if (traits.some((t: string) => t.includes('just') || t.includes('honest') || t.includes('chival') || t.includes('temperate') || t.includes('diligent'))) {
      score += 14;
    }
    if (traits.some((t: string) => t.includes('cruel') || t.includes('sadist') || t.includes('wrath') || t.includes('arbitrary'))) {
      score -= 22;
    }
    if (traits.some((t: string) => t.includes('greedy') || t.includes('callous') || t.includes('zealous'))) {
      score -= 10;
    }
    if ((commander.treasury ?? 0) < 0) {
      // Unpaid soldiers break discipline and loot to feed themselves
      score -= 18;
    }
  }

  // Army composition: professional men-at-arms are far more disciplined than conscript levies
  const regs = army.regiments || [];
  if (regs.length > 0) {
    const totalMen = Math.max(1, regs.reduce((s, r) => s + r.count, 0));
    const levyMen = regs.filter((r) => r.category === 'Levy').reduce((s, r) => s + r.count, 0);
    const proRatio = 1 - levyMen / totalMen;
    score += Math.round(proRatio * 14 - (levyMen / totalMen) * 12);

    const avgMorale = regs.reduce((s, r) => s + (r.morale ?? 80), 0) / regs.length;
    if (avgMorale < 55) score -= 10;
  }

  // Conduct policy override
  const policy: ArmyConductPolicy = army.conductPolicy || 'Forage & Requisition';
  if (policy === 'Strict Quarter') score += 16;
  else if (policy === 'Free Plunder') score -= 22;
  else if (policy === 'Scorched Earth') score -= 36;

  // Check if realm Crown Fisc or ruler treasury is in crisis / bankruptcy
  const realm = w.realms.find((r) => r.id === (army.realmId || commander?.realmId));
  const realmRuler = realm ? w.characters.find((c) => c.id === realm.rulerId) : undefined;
  const crownTreasury = realm?.treasury ?? realmRuler?.treasury ?? 0;
  if (crownTreasury < 0 || (realm?.budget && realm.budget.bankruptcyUntilYear > w.currentYear)) {
    score -= 15;
  }

  const finalDiscipline = Math.max(0, Math.min(100, Math.round(score)));
  army.discipline = finalDiscipline;
  return finalDiscipline;
}

/**
 * Directly deducts both civilian and levy/garrison war casualties from a settlement's
 * population and demographic strata so wars leave lasting demographic scars.
 */
export function deductSettlementPopulation(
  burg: Burg,
  civilianDeaths: number,
  levyDeaths: number
): { actualCivilianLoss: number; actualLevyLoss: number } {
  const currentPop = Math.max(40, Math.round(burg.population || 200));
  const maxRemovable = Math.max(0, currentPop - 40);
  const requestedTotal = Math.max(0, Math.round(civilianDeaths)) + Math.max(0, Math.round(levyDeaths));
  const actualTotal = Math.min(maxRemovable, requestedTotal);
  if (actualTotal <= 0) return { actualCivilianLoss: 0, actualLevyLoss: 0 };

  const ratio = requestedTotal > 0 ? actualTotal / requestedTotal : 0;
  const actualCivilianLoss = Math.round(Math.max(0, civilianDeaths) * ratio);
  const actualLevyLoss = Math.max(0, actualTotal - actualCivilianLoss);

  burg.population = Math.max(40, currentPop - actualTotal);

  if (burg.demographics) {
    const prevSum = Math.max(
      1,
      (burg.demographics.peasantry || 0) +
        (burg.demographics.artisans || 0) +
        (burg.demographics.clergy || 0) +
        (burg.demographics.soldiery || 0)
    );
    const keepFactor = Math.max(0.15, (prevSum - actualTotal) / prevSum);
    burg.demographics.peasantry = Math.max(10, Math.round((burg.demographics.peasantry || 0) * keepFactor));
    burg.demographics.artisans = Math.max(2, Math.round((burg.demographics.artisans || 0) * keepFactor));
    burg.demographics.clergy = Math.max(1, Math.round((burg.demographics.clergy || 0) * keepFactor));
    burg.demographics.soldiery = Math.max(0, Math.round((burg.demographics.soldiery || 0) * keepFactor - actualLevyLoss * 0.3));
  }

  return { actualCivilianLoss, actualLevyLoss };
}

/**
 * Resolves post-battle, raiding, and post-siege army conduct based on army discipline.
 * Models historically grounded conduct tiers (Orderly Occupation, Foraging & Requisitions,
 * Unchecked Pillaging, Brutal Sack & Atrocities) and applies civilian + levy casualties,
 * plunder, devastation, and diplomatic fallout.
 */
export function applyWarConductAndPopulationCasualties(params: {
  army: Army;
  commander?: Character;
  defenderLeader?: Character;
  burg: Burg;
  context: 'raid' | 'field_battle' | 'siege_month' | 'siege_fall';
  militaryCasualties?: number;
  w: WorldState;
}): WarConductResult {
  const { army, commander, defenderLeader, burg, context, militaryCasualties = 0, w } = params;
  const discipline = computeArmyDiscipline(army, commander, w);

  const conductTier: WarConductOutcomeTier =
    discipline >= 75
      ? 'Orderly Occupation'
      : discipline >= 45
      ? 'Foraging & Requisitions'
      : discipline >= 20
      ? 'Unchecked Pillaging'
      : 'Brutal Sack & Atrocities';

  const pop = Math.max(50, burg.population || 300);
  const contextScale =
    context === 'siege_fall'
      ? 1.0
      : context === 'field_battle'
      ? 0.55
      : context === 'raid'
      ? 0.45
      : 0.16; // siege_month

  let civPct = 0.005;
  let extraDev = 0;
  let plunderRate = 0.04;

  if (conductTier === 'Orderly Occupation') {
    civPct = 0.004 * contextScale;
    extraDev = context === 'siege_fall' ? 2 : 0;
    plunderRate = 0.03 * contextScale;
  } else if (conductTier === 'Foraging & Requisitions') {
    civPct = 0.022 * contextScale;
    extraDev = Math.round(6 * contextScale);
    plunderRate = 0.09 * contextScale;
  } else if (conductTier === 'Unchecked Pillaging') {
    civPct = 0.058 * contextScale;
    extraDev = Math.round(14 * contextScale);
    plunderRate = 0.18 * contextScale;
  } else {
    // Brutal Sack & Atrocities — complete breakdown of army discipline
    civPct = 0.115 * contextScale;
    extraDev = Math.round(24 * contextScale);
    plunderRate = 0.28 * contextScale;
  }

  const rawCivDeaths = Math.round(pop * civPct);
  const rawLevyDeaths = Math.round(militaryCasualties * 0.65);
  const { actualCivilianLoss, actualLevyLoss } = deductSettlementPopulation(
    burg,
    rawCivDeaths,
    rawLevyDeaths
  );

  if (extraDev > 0) {
    burg.devastation = Math.min(100, Math.round((burg.devastation || 0) + extraDev));
    if (extraDev >= 10) {
      burg.developmentLevel = Math.max(1, (burg.developmentLevel ?? 10) - Math.ceil(extraDev / 6));
    }
  }

  const settlementWealth = Math.max(20, (burg.developmentLevel ?? 10) * 14 + Math.round(pop / 80));
  const plunderedGold = Math.round(settlementWealth * plunderRate);
  if (plunderedGold > 0 && commander) {
    commander.treasury = Math.round((commander.treasury || 0) + plunderedGold);
  }

  // Commander reputation & infamy consequences
  if (commander && context !== 'siege_month') {
    if (conductTier === 'Orderly Occupation') {
      commander.prestige = (commander.prestige || 100) + 25;
    } else if (conductTier === 'Unchecked Pillaging') {
      commander.prestige = Math.max(0, (commander.prestige || 100) - 15);
    } else if (conductTier === 'Brutal Sack & Atrocities') {
      commander.prestige = Math.max(0, (commander.prestige || 100) - 45);
      if (defenderLeader) {
        if (!defenderLeader.opinions) defenderLeader.opinions = {};
        defenderLeader.opinions[commander.id] = Math.max(
          -100,
          (defenderLeader.opinions[commander.id] ?? 0) - 35
        );
      }
    }
  }

  let summary = '';
  if (conductTier === 'Orderly Occupation') {
    summary = `Under strict discipline (${discipline}/100), troops maintained order in ${burg.name} (${actualCivilianLoss.toLocaleString()} civilian & ${actualLevyLoss.toLocaleString()} levy losses; ${plunderedGold}g requisitioned).`;
  } else if (conductTier === 'Foraging & Requisitions') {
    summary = `Foraging parties and quartermasters stripped granaries around ${burg.name} (discipline ${discipline}/100; ${actualCivilianLoss.toLocaleString()} civilians & ${actualLevyLoss.toLocaleString()} levies lost; ${plunderedGold}g seized).`;
  } else if (conductTier === 'Unchecked Pillaging') {
    summary = `Ill-disciplined soldiers (${discipline}/100) broke ranks to loot, raid, and burn quarters of ${burg.name}, seizing ${plunderedGold}g and leaving ${actualCivilianLoss.toLocaleString()} civilians and ${actualLevyLoss.toLocaleString()} levies dead.`;
  } else {
    summary = `Discipline collapsed completely (${discipline}/100): ${burg.name} suffered a brutal sack marked by arson, rampant pillage, and atrocities against non-combatants (${actualCivilianLoss.toLocaleString()} civilians & ${actualLevyLoss.toLocaleString()} levies slain; ${plunderedGold}g plundered; +${extraDev}% devastation).`;
  }

  return {
    discipline,
    conductTier,
    civilianCasualties: actualCivilianLoss,
    levyPopulationLoss: actualLevyLoss,
    plunderedGold,
    extraDevastation: extraDev,
    summary,
  };
}

// ============================================================================
// 6. DYNAMIC WARSCORE, OCCUPATION CLEANUP & GHOST-ARMY SANITIZATION
// ============================================================================

function getHoldingOwnerRealmId(holding: Holding, w: WorldState): string | undefined {
  const owner = w.characters?.find((c) => c.id === holding.ownerId);
  if (owner?.realmId) return owner.realmId;
  const county = w.counties?.find((ct) => ct.id === holding.provinceId);
  return county?.realmId;
}

function getWarSideRealms(war: ActiveWar, w: WorldState): { attackerSide: Set<string>; defenderSide: Set<string> } {
  const attackerSide = new Set<string>([war.attackerRealmId]);
  const defenderSide = new Set<string>([war.defenderRealmId]);
  const atkRealm = w.realms?.find((r) => r.id === war.attackerRealmId);
  const defRealm = w.realms?.find((r) => r.id === war.defenderRealmId);
  for (const allyId of war.alliedRealmIds || []) {
    if (atkRealm?.alliedRealmIds?.includes(allyId)) attackerSide.add(allyId);
    else if (defRealm?.alliedRealmIds?.includes(allyId)) defenderSide.add(allyId);
  }
  return { attackerSide, defenderSide };
}

function areRealmsAtWarTogether(realmAId: string | undefined, realmBId: string | undefined, w: WorldState): boolean {
  if (!realmAId || !realmBId || realmAId === realmBId) return false;
  for (const war of w.activeWars || []) {
    const { attackerSide, defenderSide } = getWarSideRealms(war, w);
    if (
      (attackerSide.has(realmAId) && defenderSide.has(realmBId)) ||
      (defenderSide.has(realmAId) && attackerSide.has(realmBId))
    ) {
      return true;
    }
  }
  return false;
}

function computeHoldingSettlementWeight(holding: Holding, war: ActiveWar, w: WorldState): number {
  const burg = w.burgs?.find((b) => b.id === holding.id || `holding_${b.id}` === holding.id || holding.id.endsWith(b.id));
  let base = 8;
  if (burg?.type === 'Capital Citadel' || burg?.isCapital) base = 28;
  else if (burg?.type === 'Royal Metropolis' || burg?.type === 'Trade Port' || burg?.type === 'Border Fortress') base = 18;
  else if (burg?.type === 'Market Town' || holding.estateType === 'Castle' || holding.estateType === 'City') base = 12;
  const isGoal = (war.targetHoldingIds || []).includes(holding.id);
  return isGoal ? base + 6 : base;
}

/**
 * Recomputes warScore dynamically from each war's battleWarScore plus EVERY
 * occupied holding (scaled by settlement tier & war-goal status) and occupied province.
 * Reversing occupation via liberation automatically subtracts the exact occupation score.
 */
export function recomputeWarScores(w: WorldState): void {
  if (!w.activeWars || w.activeWars.length === 0) return;

  for (const war of w.activeWars) {
    const { attackerSide, defenderSide } = getWarSideRealms(war, w);
    const battlePart =
      war.battleWarScore !== undefined
        ? Math.max(-100, Math.min(100, war.battleWarScore))
        : Math.max(-60, Math.min(60, war.warScore || 0));

    let occupationDelta = 0;
    const provHoldingsById = new Map<string, { totalDef: number; occByAtk: number; totalAtk: number; occByDef: number }>();

    for (const h of w.holdings || []) {
      const ownerRealmId = getHoldingOwnerRealmId(h, w);
      if (!ownerRealmId) continue;

      const belongsToDef = defenderSide.has(ownerRealmId);
      const belongsToAtk = attackerSide.has(ownerRealmId);
      if (!belongsToDef && !belongsToAtk) continue;

      let bucket = provHoldingsById.get(h.provinceId);
      if (!bucket) {
        bucket = { totalDef: 0, occByAtk: 0, totalAtk: 0, occByDef: 0 };
        provHoldingsById.set(h.provinceId, bucket);
      }

      if (belongsToDef) {
        bucket.totalDef++;
        if (h.occupiedByRealmId && attackerSide.has(h.occupiedByRealmId)) {
          bucket.occByAtk++;
          occupationDelta += computeHoldingSettlementWeight(h, war, w);
        }
      } else if (belongsToAtk) {
        bucket.totalAtk++;
        if (h.occupiedByRealmId && defenderSide.has(h.occupiedByRealmId)) {
          bucket.occByDef++;
          occupationDelta -= computeHoldingSettlementWeight(h, war, w);
        }
      }
    }

    // Province-wide control bonus: occupying majority/all settlements in a province grants +5 per province
    for (const counts of provHoldingsById.values()) {
      if (counts.totalDef > 0 && counts.occByAtk > 0 && counts.occByAtk >= Math.ceil(counts.totalDef * 0.5)) {
        occupationDelta += 5;
      }
      if (counts.totalAtk > 0 && counts.occByDef > 0 && counts.occByDef >= Math.ceil(counts.totalAtk * 0.5)) {
        occupationDelta -= 5;
      }
    }

    war.warScore = Math.max(-100, Math.min(100, Math.round(battlePart + occupationDelta)));
  }
}

/**
 * Clears all occupation stripes involving settled belligerents & allies unless
 * another still-active war links the occupier and holding owner realm.
 */
export function clearOccupationForBelligerents(w: WorldState, realmIds: Set<string>): void {
  if (!w.holdings || realmIds.size === 0) return;
  let clearedAny = false;
  for (const h of w.holdings) {
    if (!h.occupiedByRealmId) continue;
    const ownerRealmId = getHoldingOwnerRealmId(h, w);
    const involvesBelligerent =
      realmIds.has(h.occupiedByRealmId) || (ownerRealmId ? realmIds.has(ownerRealmId) : false);
    if (!involvesBelligerent) continue;

    if (!areRealmsAtWarTogether(h.occupiedByRealmId, ownerRealmId, w)) {
      h.occupiedByRealmId = undefined;
      h.occupiedSinceYear = undefined;
      clearedAny = true;
    }
  }
  if (clearedAny) {
    recalculateFeudalDemesne(w);
  }
}

/**
 * Removes lingering ghost armies, orphaned sieges, and occupation stripes that have
 * no active war connecting occupier and owner realm.
 */
export function sanitizeWarsArmiesAndOccupations(w: WorldState): void {
  const activeWarIds = new Set((w.activeWars || []).map((war) => war.id));

  // 1. Scrub orphaned occupation stripes when no active war connects occupier and owner
  let clearedOccupation = false;
  for (const h of w.holdings || []) {
    if (!h.occupiedByRealmId) continue;
    const ownerRealmId = getHoldingOwnerRealmId(h, w);
    if (h.occupiedByRealmId === ownerRealmId || !areRealmsAtWarTogether(h.occupiedByRealmId, ownerRealmId, w)) {
      h.occupiedByRealmId = undefined;
      h.occupiedSinceYear = undefined;
      clearedOccupation = true;
    }
  }
  if (clearedOccupation) {
    recalculateFeudalDemesne(w);
  }

  // 2. Purge ghost, NaN-coordinate, depleted, or post-war armies
  if (w.armies) {
    w.armies = w.armies.filter((army) => {
      if (!army || !Number.isFinite(army.strength) || army.strength <= 0) return false;
      if (
        !Number.isFinite(army.startX) ||
        !Number.isFinite(army.startY) ||
        !Number.isFinite(army.targetX) ||
        !Number.isFinite(army.targetY)
      ) {
        return false;
      }
      if (army.isReturning && army.progress >= 1.0) return false;
      if (army.warId && !activeWarIds.has(army.warId)) return false;
      if (!army.warId && activeWarIds.size === 0) return false;
      return true;
    });
  }

  // 3. Purge orphaned sieges where holding, besieger army, or active war no longer exists
  const activeArmyIds = new Set((w.armies || []).map((a) => a.id));
  if (w.activeSieges) {
    w.activeSieges = w.activeSieges.filter((s) => {
      const holding = w.holdings?.find((h) => h.id === s.holdingId);
      const besieger = (w.armies || []).find((a) => a.id === s.besiegerArmyId);
      const validWar = !besieger?.warId || activeWarIds.has(besieger.warId);
      const valid = Boolean(holding && besieger && activeArmyIds.has(s.besiegerArmyId) && validWar && !besieger.isReturning);
      if (!valid) {
        const burg = w.burgs?.find((b) => b.id === s.holdingId || `holding_${b.id}` === s.holdingId);
        if (burg) {
          burg.foodSecurity = 'SECURE';
          burg.isStarving = false;
        }
      }
      return valid;
    });
  }
}