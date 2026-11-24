import {
  TitleTier,
  WorldState,
  Character,
  Holding,
  Province,
  Claim,
  Epidemic,
  CadetHouse,
  CourtPosition,
  OrganicGravitas,
  CrimeRecord,
  CrimeType,
  PunishmentType,
  OpinionMod,
  Favor,
  Faction,
  RealmLaws,
  RealmState,
  ForeignNation,
  PsychologicalState,
  TerrainType,
  AccessLevel,
  EstateType,
  HistoricalEvent,
  WarChronicleData,
  V17Secret,
  DeathCategory,
  DiplomaticProposal,
  DiplomaticProposalKind,
} from '../types/world';
import {
  checkMarriageLegality,
  distributeInheritanceTreasury,
  inferDeathCategory,
  pickContextualDeathCause,
} from './deathAndJusticeEngine';
import {
  V17_TRAIT_DB,
  getHookMultiplier,
  computeV17StatModifier,
  computeAIStrategyWeight,
  computeDispositionModifiers,
  syncCharacterTraits,
  V17Stat,
} from './v17TraitDB';
import {
  deriveAIArchetype,
  getGovernmentProfile,
  getRealmSovereignRank,
  stripRealmPrefix,
  getCharacterRankTitle,
  getTitleTierRank,
  getLowerTitleTier,
  getHeirStyleForRealm,
  getSubordinateVassalStyle,
  getChildRoleForParents,
} from './fantasyTables';
import { FlowEconomyEngine } from './flowEconomyEngine';
import { CarryingCapacityEngine } from './carryingCapacityEngine';
import {
  computeHouseProfile,
  evaluateAllianceNegotiation,
  evaluateBilateralConsent,
  evaluateMarriageProspect,
  seedBeginningHouseAncestralClaims,
} from './houseEngine';
import {
  generateRealmHeraldry,
  generateNobleArms,
  generateUniqueHouseHeraldry,
  getCoatOfArmsSignature,
  differenceCadetHouseArms,
  promoteHeirArmsToHead,
  cloneCoatOfArmsData,
  canBestowBanner,
  canFoundCadetBranch,
  isNobleOrigin,
  syncWorldBanners,
} from '../utils/heraldryBridge';
import {
  buildArmyRegiments,
  resolveTacticalFieldBattle,
  SiegeAndPeaceEngine,
  computeArmyDiscipline,
  applyWarConductAndPopulationCasualties,
  getCastleFortificationTier,
  isBlockingFortifiedSettlement,
  computeRequiredSiegeForce,
  recomputeWarScores,
  clearOccupationForBelligerents,
  sanitizeWarsArmiesAndOccupations,
} from './warfareEngine';
import {
  ensureEconomy,
  processDebtLeverageAndDefaults,
  takeBankLoan,
  takeDomesticRealmLoan,
  debaseCurrency,
  recordRealmBudgetExtra,
} from './economyEngine';
import { ensureGovernanceInitialized, stepGovernanceSystem } from './governanceEngine';
import {
  autoEnfeoffExcessHoldings,
  calculateCharacterFeudalStanding,
  computeCountyPopulation,
  recalculateFeudalDemesne,
  reconcileFeudalHierarchy,
  setRealmTruce,
  transferCountySovereignty,
  transferHoldingSovereignty,
} from './feudalEngine';
import { cloneWorldState } from '../utils/cloneWorldState';
import {
  computeArmyMarchPath,
  getArmyPositionAtProgress,
  reverseArmyWaypoints,
  calculateNavalCharterCost,
} from './armyPathfinding';
import { applyWarDevastationToBurg } from './settlementDevelopmentEngine';
import { pickSmartBattleTactic, evaluateBattleStrategy } from './battleStrategy';
import type { BattleTactic, CasusBelliEntry, WarPeaceTerms } from '../types/warfare';
import {
  TradeNodeEngine,
  EstatesEngine,
  AggressiveExpansionEngine,
  LifestylePerksEngine,
} from './grandStatecraftEngine';

export { evaluateBilateralConsent };
// ============================================================================
// 1. STATS, MATH & SAFE ID HELPERS
// ============================================================================

let _idCounter = 0;
export function generateUniqueId(prefix: string): string {
  _idCounter = (_idCounter + 1) % 1000000;
  return `${prefix}_${Date.now()}_${_idCounter}_${Math.random().toString(36).substring(2, 6)}`;
}

export function getTerrainTravelModifier(terrain: TerrainType): number {
  switch (terrain) {
    case 'Plains': return 1.0;
    case 'Forest': return 1.3;
    case 'Mountains': return 1.8;
    case 'Coastal': return 1.1;
  }
}

export function collectAllCharacterTraits(char: Character): string[] {
  return Array.from(
    new Set([
      ...(char.v17Traits || []),
      ...(char.personalityTraits || []),
      ...(char.congenitalTraits || []),
      ...(char.physicalHealthTraits || []),
      ...(char.commanderTraits || []),
      ...(char.lifestyleTraits || []),
      ...(char.educationTrait ? [char.educationTrait] : []),
      ...(char.statusTrait ? [char.statusTrait] : []),
    ])
  );
}

export function getCharacterV17Stat(char: Character, stat: V17Stat, world?: WorldState): number {
  let base = 10;
  switch (stat) {
    case 'MARTIAL': base = char.baseMartial || 10; break;
    case 'DIPLOMACY': base = char.baseDiplomacy || 10; break;
    case 'STEWARDSHIP': base = char.baseStewardship || 10; break;
    case 'INTRIGUE': base = char.baseIntrigue || 10; break;
    case 'LEARNING': base = char.baseLearning || 10; break;
  }

  const traits = collectAllCharacterTraits(char);
  const mod = computeV17StatModifier(traits, stat);

  if (world && world.holdings) {
    for (const h of world.holdings) {
      if (h.ownerId === char.id) {
        if (stat === 'LEARNING' && h.estateType === 'Temple') base += 2.0;
        else if (stat === 'MARTIAL' && h.estateType === 'Castle') base += 0.5;
        else if (stat === 'STEWARDSHIP' && h.estateType === 'City') base += 0.5;
      }
    }
  }

  return Math.max(0, base * (1.0 + mod));
}

export function computeTotalGravitas(g: OrganicGravitas): number {
  const mil = Math.min(350, Math.round(Math.max(0, g.militaryAutonomy)));
  const econ = Math.min(250, Math.round(Math.max(0, g.economicExtraction)));
  const pop = Math.min(200, Math.round(Math.max(0, g.populistLoyalty)));
  const linRaw = Math.max(0, g.lineagePrestige);
  const lin = Math.min(180, Math.round(linRaw > 180 ? Math.log10(1 + linRaw) * 52 : linRaw));
  const debt = Math.min(120, Math.round(Math.max(0, g.sovereignDebtHeld * 0.5)));
  return Math.max(25, Math.min(1000, mil + econ + pop + lin + debt));
}

export interface GravitasBreakdown {
  total: number;
  military: number;
  economic: number;
  populist: number;
  lineage: number;
  debtLeverage: number;
  tierLabel: 'Paramount Hegemon' | 'Grand Magnate' | 'Notable Lord' | 'Minor Noble';
  councilWeight: number;
  trialShieldPct: number;
}

export function getGravitasBreakdown(char: Character): GravitasBreakdown {
  const g: OrganicGravitas = char.organicGravitas || {
    militaryAutonomy: 60,
    economicExtraction: 35,
    populistLoyalty: 65,
    lineagePrestige: 90,
    sovereignDebtHeld: 0,
  };
  const military = Math.min(350, Math.round(Math.max(0, g.militaryAutonomy)));
  const economic = Math.min(250, Math.round(Math.max(0, g.economicExtraction)));
  const populist = Math.min(200, Math.round(Math.max(0, g.populistLoyalty)));
  const linRaw = Math.max(0, g.lineagePrestige);
  const lineage = Math.min(180, Math.round(linRaw > 180 ? Math.log10(1 + linRaw) * 52 : linRaw));
  const debtLeverage = Math.min(120, Math.round(Math.max(0, g.sovereignDebtHeld * 0.5)));
  const total = Math.max(25, Math.min(1000, military + economic + populist + lineage + debtLeverage));

  const tierLabel: GravitasBreakdown['tierLabel'] =
    total >= 650 ? 'Paramount Hegemon' : total >= 450 ? 'Grand Magnate' : total >= 280 ? 'Notable Lord' : 'Minor Noble';
  const councilWeight = total >= 550 ? 3 : total >= 360 || char.role === 'Vassal Duke' || char.role === 'Chancellor' ? 2 : 1;
  const trialShieldPct = Math.round(Math.min(42, (total / 1000) * 42));

  return {
    total,
    military,
    economic,
    populist,
    lineage,
    debtLeverage,
    tierLabel,
    councilWeight,
    trialShieldPct,
  };
}

export function recalculateAllGravitas(w: WorldState): void {
  recalculateFeudalDemesne(w);
  const houseCache = new Map<string, ReturnType<typeof computeHouseProfile>>();
  for (const c of w.characters || []) {
    if (c.isAlive === false || !c.organicGravitas) continue;
    let hp = houseCache.get(c.houseName);
    if (!hp) {
      hp = computeHouseProfile(c.houseName, w);
      houseCache.set(c.houseName, hp);
    }
    c.organicGravitas.lineagePrestige = Math.max(
      20,
      Math.round((c.prestige || 100) + hp.influenceScore * 4 + hp.negotiatingPower * 3)
    );
  }
}

const OPPOSITE_TRAIT_PAIRS: [string, string][] = [
  ['Just', 'Arbitrary'],
  ['Honest', 'Deceitful'],
  ['Compassionate', 'Cruel'],
  ['Compassionate', 'Callous'],
  ['Brave', 'Craven'],
  ['Generous', 'Greedy'],
  ['Forgiving', 'Vengeful'],
  ['Humble', 'Arrogant'],
  ['Zealous', 'Cynical'],
  ['Patient', 'Impatient'],
  ['Temperate', 'Gluttonous'],
  ['Chaste', 'Lustful'],
  ['Content', 'Ambitious'],
  ['Trusting', 'Paranoid'],
];

function computeTraitAffinity(a: Character, b: Character): number {
  const tA = new Set([...(a.personalityTraits || []), ...(a.v17Traits || [])]);
  const tB = new Set([...(b.personalityTraits || []), ...(b.v17Traits || [])]);
  let score = 0;

  for (const t of tA) {
    if (tB.has(t)) {
      score += t === 'Ambitious' ? -14 : 10;
    }
  }
  for (const [x, y] of OPPOSITE_TRAIT_PAIRS) {
    if ((tA.has(x) && tB.has(y)) || (tA.has(y) && tB.has(x))) {
      score -= 16;
    }
  }
  return score;
}

export function recalculateCharacterRelationships(w: WorldState): void {
  const living = (w.characters || []).filter((c) => c.isAlive);
  if (living.length === 0) return;

  const activeWars = w.activeWars || [];
  const isAtWar = (r1?: string, r2?: string) =>
    Boolean(
      r1 &&
        r2 &&
        r1 !== r2 &&
        activeWars.some(
          (war) =>
            (war.attackerRealmId === r1 && war.defenderRealmId === r2) ||
            (war.attackerRealmId === r2 && war.defenderRealmId === r1)
        )
    );

  // Determine notable rulers & same-realm circles
  const monarchIds = new Set((w.realms || []).map((r) => r.rulerId).filter(Boolean));

  for (const a of living) {
    if (!a.opinions) a.opinions = {};

    const peers = living.filter(
      (b) =>
        b.id !== a.id &&
        (b.realmId === a.realmId ||
          monarchIds.has(b.id) ||
          a.spouseId === b.id ||
          a.friendId === b.id ||
          a.rivalId === b.id ||
          a.loverId === b.id ||
          a.liegeId === b.id ||
          b.liegeId === a.id)
    );

    for (const b of peers) {
      const existing = a.opinions[b.id];
      let target = existing;

      if (target === undefined) {
        let base = 8 + computeTraitAffinity(a, b);
        if (a.houseName && a.houseName === b.houseName) base += 16;
        if (a.spouseId === b.id) base += 32;
        if (a.loverId === b.id) base += 50;
        if (a.friendId === b.id) base += 48;
        if (a.rivalId === b.id) base -= 60;
        if (a.liegeId === b.id) {
          base += ((b.baseDiplomacy || 10) - 10) * 2;
          if ((b.dread || 0) > 65) base -= 12;
        }
        if (a.realmId !== b.realmId && monarchIds.has(a.id) && monarchIds.has(b.id)) {
          base -= 10; // Geopolitical crown friction
        }
        if (isAtWar(a.realmId, b.realmId)) {
          base -= 50;
        }
        target = Math.max(-100, Math.min(100, Math.round(base)));
        a.opinions[b.id] = target;
      } else {
        // Gentle war/bond alignment without wiping player diplomatic shifts
        if (isAtWar(a.realmId, b.realmId) && target > -25) {
          a.opinions[b.id] = Math.max(-100, target - 25);
        }
      }
    }
  }

  // Ensure prominent characters have coherent mutual Friend & Rival links if missing
  for (const a of living) {
    const isNotable =
      monarchIds.has(a.id) ||
      a.id === w.monarchId ||
      a.titleTier === 'King' ||
      a.titleTier === 'Duke' ||
      ['Chancellor', 'Marshal', 'Steward', 'Spymaster', 'Court Chaplain'].includes(a.role);
    if (!isNotable) continue;

    if (!a.friendId) {
      const candidate = living
        .filter(
          (b) =>
            b.id !== a.id &&
            b.realmId === a.realmId &&
            b.id !== a.rivalId &&
            (a.opinions[b.id] ?? 0) >= 24
        )
        .sort((x, y) => (a.opinions[y.id] ?? 0) - (a.opinions[x.id] ?? 0))[0];
      if (candidate) {
        a.friendId = candidate.id;
        if (!candidate.friendId) candidate.friendId = a.id;
        a.opinions[candidate.id] = Math.min(100, Math.max(a.opinions[candidate.id] ?? 30, 45));
        candidate.opinions[a.id] = Math.min(100, Math.max(candidate.opinions[a.id] ?? 30, 45));
      }
    }

    if (!a.rivalId) {
      const candidate = living
        .filter(
          (b) =>
            b.id !== a.id &&
            b.id !== a.friendId &&
            b.id !== a.spouseId &&
            (a.opinions[b.id] ?? 0) <= -20
        )
        .sort((x, y) => (a.opinions[x.id] ?? 0) - (a.opinions[y.id] ?? 0))[0];
      if (candidate) {
        a.rivalId = candidate.id;
        if (!candidate.rivalId) candidate.rivalId = a.id;
        a.opinions[candidate.id] = Math.max(-100, Math.min(a.opinions[candidate.id] ?? -30, -45));
        candidate.opinions[a.id] = Math.max(-100, Math.min(candidate.opinions[a.id] ?? -30, -45));
      }
    }
  }

  recalculateDynamicLoyalty(w, false);
}

/**
 * Computes a vassal's dynamic loyalty target (5–100) from:
 * - Bilateral opinion & recent character interactions (gifts, rivalries, grudges, council seat, imprisonment)
 * - Personality & V17 traits (Content, Trusting, Honest vs Ambitious, Deceitful, Paranoid, Vengeful)
 * - Trait affinity with their liege
 * - Kinship / marriage / Crown Heir bonds
 * - Liege's House Prestige / Negotiating Power advantage, Dread, and Realm Hegemony
 */
export function computeDynamicLoyaltyTarget(
  c: Character,
  w: WorldState,
  options?: { isInExclave?: boolean }
): number {
  const primaryRealm = w.realms?.find((r) => r.id === c.realmId);
  const isRealmMonarch = c.id === primaryRealm?.rulerId || c.role === 'Monarch';
  if (isRealmMonarch) return 100;

  const effectiveLiegeId = c.liegeId || primaryRealm?.rulerId;
  if (!effectiveLiegeId) return c.loyalty ?? 60;

  const liege = w.characters.find((x) => x.id === effectiveLiegeId);
  if (!liege) return c.loyalty ?? 60;

  const op = c.opinions?.[liege.id] ?? 0;
  const disp = computeDispositionModifiers(c.v17Traits || []);
  const traits = new Set([...(c.personalityTraits || []), ...(c.v17Traits || [])]);

  let target = 56 + op * 0.45;

  // Disposition & trait drivers
  target += (disp.loy_mult - 1.0) * 24 + (disp.con_mult - 1.0) * 14 - (disp.amb_mult - 1.0) * 20;
  if (traits.has('Content')) target += 15;
  if (traits.has('Trusting')) target += 11;
  if (traits.has('Honest') || traits.has('Just')) target += 7;
  if (traits.has('Forgiving') || traits.has('Humble')) target += 8;
  if (traits.has('Ambitious')) target -= 16;
  if (traits.has('Deceitful')) target -= 12;
  if (traits.has('Paranoid')) target -= 10;
  if (traits.has('Vengeful') || traits.has('Arbitrary') || traits.has('Wrathful')) target -= 8;
  if (traits.has('Greedy') || traits.has('Arrogant') || traits.has('Sadistic')) target -= 6;

  // Personality affinity between vassal and liege
  target += computeTraitAffinity(c, liege) * 0.35;

  // Direct character interactions & social bonds
  if (c.friendId === liege.id || liege.friendId === c.id) target += 16;
  if (c.loverId === liege.id || liege.loverId === c.id) target += 14;
  if (c.spouseId === liege.id) target += 14;
  if (c.rivalId === liege.id || liege.rivalId === c.id) target -= 28;
  const grudgePenalty = (c.grudges || []).reduce((acc, g) => acc + (g.value < 0 ? g.value : -10), 0);
  if (grudgePenalty < 0) target += Math.max(-24, Math.round(grudgePenalty * 0.45));
  if (c.isImprisoned) target -= 30;

  // Council seat & kinship bonuses
  if (['Chancellor', 'Marshal', 'Steward', 'Spymaster', 'Court Chaplain'].includes(c.role)) {
    target += 10;
  }
  const isSameHouse = Boolean(c.houseName && liege.houseName && c.houseName === liege.houseName);
  const isChildOfLiege = c.knownFatherId === liege.id || c.motherId === liege.id;
  if ((c.role === 'Crown Heir' || c.role === 'Heir') && isChildOfLiege) {
    target += 14;
  } else if (isChildOfLiege || isSameHouse) {
    target += 8;
  }

  // House Prestige negotiating leverage
  if (c.houseName && liege.houseName && c.houseName !== liege.houseName) {
    const liegeHouse = computeHouseProfile(liege.houseName, w);
    const vassalHouse = computeHouseProfile(c.houseName, w);
    target += Math.max(-10, Math.min(12, Math.round((liegeHouse.negotiatingPower - vassalHouse.negotiatingPower) * 0.35)));
  }

  const realm = w.realms?.find((r) => r.id === c.realmId);
  if (realm?.government) {
    target += getGovernmentProfile(realm.government).vassalLoyaltyMod;
  }

  if ((w.hegemony || 1) < 0.75) target -= 8;
  if ((liege.dread || 0) > 65) target += 8;
  if (options?.isInExclave) target -= 24;

  return Math.max(5, Math.min(100, Math.round(target)));
}

export function recalculateDynamicLoyalty(w: WorldState, immediate = false): void {
  for (const c of w.characters || []) {
    if (c.isAlive === false) continue;
    const primaryRealm = w.realms?.find((r) => r.id === c.realmId);
    if (c.id === primaryRealm?.rulerId || c.role === 'Monarch') {
      c.loyalty = 100;
      continue;
    }
    const target = computeDynamicLoyaltyTarget(c, w);
    if (immediate || c.loyalty === undefined) {
      c.loyalty = target;
    } else {
      c.loyalty = Math.max(5, Math.min(100, Math.round(c.loyalty * 0.65 + target * 0.35)));
    }
  }
}

export function getHoldingYields(h: Holding): { tax: number; levy: number } {
  const rawTax = h.baseTax * (h.dev / 10.0);
  const rawLevy = Math.floor(h.baseLevy * (h.dev / 10.0));
  if (h.estateType === 'Castle') return { tax: rawTax * 0.7, levy: Math.floor(rawLevy * 1.3) };
  if (h.estateType === 'City') return { tax: rawTax * 1.6, levy: Math.floor(rawLevy * 0.5) };
  if (h.estateType === 'Temple') return { tax: rawTax * 1.1, levy: Math.floor(rawLevy * 0.8) };
  return { tax: rawTax, levy: rawLevy };
}

/**
 * Only Counts, Dukes, Kings, Emperors (and landed County/Realm rulers) have their deaths
 * recorded in the High Annals & Chronicles, keeping the historical ledger focused on major nobility.
 */
export function isNotableForDeathChronicle(c: Character, w: WorldState): boolean {
  if (c.id === w.monarchId || (w.realms || []).some((r) => r.rulerId === c.id)) return true;
  if (c.titleTier === 'Emperor' || c.titleTier === 'King' || c.titleTier === 'Duke' || c.titleTier === 'Count') {
    return true;
  }
  if (c.role === 'Monarch' || c.role === 'Vassal Duke' || c.role === 'Vassal Count') {
    return true;
  }
  if ((w.counties || []).some((ct) => ct.rulerId === c.id)) {
    return true;
  }
  return false;
}

function upsertWarChronicle(
  w: WorldState,
  warId: string,
  updater: (record: WarChronicleData, ev: HistoricalEvent) => void
): void {
  if (!w.history) w.history = [];
  const existing = w.history.find((ev) => ev.warRecord?.warId === warId);
  if (existing && existing.warRecord) {
    updater(existing.warRecord, existing);
  }
}

/**
 * Centralized character death handler.
 * Triggers full succession transitions and cleans deceased references from active rosters.
 */
export function killCharacter(
  victim: Character,
  cause: string,
  w: WorldState,
  category?: DeathCategory
): void {
  if (!victim.isAlive) return;
  victim.isAlive = false;
  if (victim.deathYear === undefined) victim.deathYear = w.currentYear;
  victim.causeOfDeath = cause;
  victim.deathCategory = category || inferDeathCategory(cause);

  if (isNotableForDeathChronicle(victim, w)) {
    if (!w.history) w.history = [];
    const rankLabel = victim.title || victim.titleTier || victim.role;
    w.history.unshift({
      id: generateUniqueId('hist_death'),
      year: w.currentYear,
      title: `Passing of ${rankLabel} ${victim.name}`,
      category: 'Death',
      description: `${rankLabel} ${victim.name} of House ${victim.houseName || 'Noble'} died of ${cause} at the age of ${victim.age}.`,
      primaryActorId: victim.id,
      realmId: victim.realmId,
    });
  }

  if (w.loreEntities) {
    const loreEntry = w.loreEntities.find(
      (e) => e.characterId === victim.id || e.id === `lore_${victim.id}`
    );
    if (loreEntry) {
      loreEntry.summary = `Late noble of House ${victim.houseName} (Age ${victim.age}, d. ${w.currentYear}) · ${victim.houseMotto || cause}.`;
    }
  }

  const holdsTitles =
    (w.holdings || []).some((h) => h.ownerId === victim.id) ||
    (w.burgs || []).some((b) => b.ownerId === victim.id) ||
    (w.counties || []).some((ct) => ct.rulerId === victim.id);
  const isMonarch = w.monarchId === victim.id || (w.realms && w.realms.some((r) => r.rulerId === victim.id));
  const hasOffice = ['Chancellor', 'Marshal', 'Steward', 'Spymaster', 'Court Chaplain', 'Court Physician'].includes(victim.role);

  if (holdsTitles || isMonarch || hasOffice || (victim.vassalIds && victim.vassalIds.length > 0)) {
    const res = SuccessionEngine.resolveSuccession(victim, w);
    if (res.events.length > 0) {
      w.history.unshift(...res.events);
    }
  }
  distributeInheritanceTreasury(victim, w);
}

const COUNCIL_OFFICES: Array<{
  role: Character['role'];
  titlePrefix: string;
}> = [
  { role: 'Chancellor', titlePrefix: 'High Chancellor' },
  { role: 'Marshal', titlePrefix: 'Grand Marshal' },
  { role: 'Steward', titlePrefix: 'Lord High Steward' },
  { role: 'Spymaster', titlePrefix: 'Master of Whispers' },
  { role: 'Court Chaplain', titlePrefix: 'Arch-Prelate' },
];

export function cleanupDeceasedAndEnsureSuccessors(w: WorldState): void {
  if (!w.characters) return;

  // 1. Trigger succession for any dead noble still referenced as owner/ruler before purging
  const deadIds = new Set<string>(w.characters.filter((c) => !c.isAlive).map((c) => c.id));
  for (const dead of w.characters) {
    if (!dead.isAlive) {
      const stillReferenced =
        w.monarchId === dead.id ||
        w.realms?.some((r) => r.rulerId === dead.id) ||
        w.counties?.some((ct) => ct.rulerId === dead.id) ||
        w.burgs?.some((b) => b.ownerId === dead.id) ||
        w.holdings?.some((h) => h.ownerId === dead.id);
      if (stillReferenced) {
        const res = SuccessionEngine.resolveSuccession(dead, w);
        if (res.events.length > 0) {
          if (!w.history) w.history = [];
          w.history.unshift(...res.events);
        }
      }
    }
  }

  // 2. Retain ALL deceased noble/dynastic ancestors AND their spouses (transitive walk) so Dynasty Trees preserve multi-generation lineage,
  //    while purging only unlinked deceased commoners with no house or parent/child/spouse links.
  const referencedAncestorIds = new Set<string>();
  const preCharById = new Map(w.characters.map((ch) => [ch.id, ch]));
  const refQueue: string[] = [];
  const enqueueRef = (id?: string) => {
    if (id && !referencedAncestorIds.has(id) && preCharById.has(id)) {
      referencedAncestorIds.add(id);
      refQueue.push(id);
    }
  };
  for (const ch of w.characters) {
    if (ch.isAlive !== false || Boolean((ch.houseName || '').trim()) || Boolean(ch.isNobleHouse)) {
      enqueueRef(ch.knownFatherId);
      enqueueRef(ch.realFatherId);
      enqueueRef(ch.motherId);
      enqueueRef(ch.spouseId);
    }
  }
  while (refQueue.length > 0) {
    const cur = preCharById.get(refQueue.shift()!);
    if (!cur) continue;
    enqueueRef(cur.knownFatherId);
    enqueueRef(cur.realFatherId);
    enqueueRef(cur.motherId);
    enqueueRef(cur.spouseId);
  }
  w.characters = w.characters.filter(
    (c) =>
      c.isAlive !== false ||
      Boolean((c.houseName || '').trim()) ||
      Boolean(c.isNobleHouse) ||
      referencedAncestorIds.has(c.id)
  );
  const aliveSet = new Set(w.characters.filter((c) => c.isAlive !== false).map((c) => c.id));

  // Helper to ensure every realm has at least a living ruler and living nobles
  for (const realm of w.realms || []) {
    let realmAlive = w.characters.filter((c) => c.realmId === realm.id && c.isAlive !== false);
    const realmCleanName = stripRealmPrefix(realm.name);
    if (realmAlive.length === 0) {
      const houseBase = realmCleanName.split(' ')[0] || 'Valen';
      const capBurg = w.burgs?.find((b) => b.stateId === realm.id && b.isCapital) || w.burgs?.find((b) => b.stateId === realm.id);
      const restoredRank = getRealmSovereignRank(realm, 'male');
      const freshMonarch: Character = {
        id: generateUniqueId('char_succ'),
        name: `Aldric of House ${houseBase}`,
        houseName: houseBase,
        houseMotto: 'Endure and Ascend',
        title: `${restoredRank.rankTitle} of ${realmCleanName}`,
        role: 'Monarch',
        titleTier: restoredRank.titleTier,
        gender: 'male',
        age: 29,
        birthYear: (w.currentYear || 1042) - 29,
        investitureYear: w.currentYear || 1042,
        isAlive: true,
        realmId: realm.id,
        countyId: capBurg?.countyId,
        provinceId: capBurg?.countyId,
        baseDiplomacy: 12,
        baseMartial: 13,
        baseStewardship: 12,
        baseIntrigue: 10,
        baseLearning: 11,
        baseProwess: 13,
        personalityTraits: ['Just', 'Brave', 'Diligent'],
        v17Traits: ['Just', 'Brave', 'Diligent'],
        congenitalTraits: [],
        physicalHealthTraits: [],
        commanderTraits: [],
        lifestyleTraits: [],
        aiArchetype: 'Honorable Paragon',
        stress: 10,
        stressLevel: 0,
        dread: 15,
        prestige: 250,
        piety: 120,
        treasury: 420,
        menAtArms: 180,
        ambition: 'Restore dynastic order across the realm',
        tragicFlaw: 'Pride in restored lineage',
        darkSecret: 'Ascended during an interregnum council crisis',
        sacredOath: 'Uphold the ancient charters',
        knownSecrets: [],
        hooksHeld: [],
        hooksOnMe: [],
        opinions: {},
        coatOfArms: realm.heraldry?.config
          ? cloneCoatOfArmsData(realm.heraldry)
          : generateRealmHeraldry(`${realm.id}_restore_${w.currentYear}`),
        isNobleHouse: true,
        hasPersonalBanner: true,
      };
      w.characters.push(freshMonarch);
      aliveSet.add(freshMonarch.id);
      realmAlive = [freshMonarch];
    }

    // Ensure realm.rulerId points to a living character
    let ruler = w.characters.find((c) => c.id === realm.rulerId && c.isAlive);
    if (!ruler) {
      ruler =
        realmAlive.find((c) => c.role === 'Crown Heir' || c.role === 'Heir' || c.role === 'Monarch') ||
        realmAlive.slice().sort((a, b) => computeTotalGravitas(b.organicGravitas || { militaryAutonomy: 80, economicExtraction: 30, populistLoyalty: 60, lineagePrestige: 80, sovereignDebtHeld: 0 }) - computeTotalGravitas(a.organicGravitas || { militaryAutonomy: 80, economicExtraction: 30, populistLoyalty: 60, lineagePrestige: 80, sovereignDebtHeld: 0 }))[0];
      if (ruler) {
        const rulerRank = getRealmSovereignRank(realm, ruler.gender);
        ruler.role = 'Monarch';
        ruler.title = `${rulerRank.rankTitle} of ${realmCleanName}`;
        ruler.titleTier = rulerRank.titleTier;
        ruler.liegeId = undefined;
        realm.rulerId = ruler.id;
        LifestylePerksEngine.bindMonarchDefaults(ruler);
      }
    }
    if (ruler) {
      LifestylePerksEngine.bindMonarchDefaults(ruler);
    }

    // Replenish a living Heir & basic court if court shrunk below 4 nobles
    const hasHeir = realmAlive.some(
      (c) =>
        c.id !== ruler?.id &&
        (c.role === 'Crown Heir' ||
          c.role === 'Heir' ||
          c.role === 'Child' ||
          c.role === 'Cadet Prince' ||
          c.role === 'Cadet Princess' ||
          c.role === 'Noble Scion')
    );
    if (!hasHeir && ruler) {
      const heirMale = Math.random() < 0.82;
      const heirFirst = heirMale ? ['Cassian', 'Alaric', 'Godfrey', 'Valen', 'Roland'][Math.floor(Math.random() * 5)] : ['Aurelia', 'Elysia', 'Isolde', 'Beatrix', 'Seraphina'][Math.floor(Math.random() * 5)];
      const rulerRankForHeir = getRealmSovereignRank(realm, ruler.gender);
      const heirStyle = getHeirStyleForRealm(
        realm,
        rulerRankForHeir.titleTier,
        heirMale ? 'male' : 'female'
      );
      const heirChar: Character = {
        id: generateUniqueId('char_heir'),
        name: `${heirFirst} of House ${ruler.houseName}`,
        houseName: ruler.houseName,
        houseMotto: ruler.houseMotto || 'Honor Above All',
        title: heirStyle.title,
        role: rulerRankForHeir.isRoyalOrHigher ? 'Crown Heir' : 'Heir',
        titleTier: heirStyle.titleTier,
        gender: heirMale ? 'male' : 'female',
        age: 18 + Math.floor(Math.random() * 10),
        birthYear: (w.currentYear || 1042) - 22,
        investitureYear: w.currentYear || 1042,
        isAlive: true,
        realmId: realm.id,
        countyId: ruler.countyId,
        provinceId: ruler.provinceId,
        liegeId: ruler.id,
        knownFatherId: ruler.gender === 'male' ? ruler.id : undefined,
        motherId: ruler.gender === 'female' ? ruler.id : undefined,
        baseDiplomacy: 10 + Math.floor(Math.random() * 5),
        baseMartial: 10 + Math.floor(Math.random() * 5),
        baseStewardship: 10 + Math.floor(Math.random() * 4),
        baseIntrigue: 8 + Math.floor(Math.random() * 5),
        baseLearning: 9 + Math.floor(Math.random() * 4),
        baseProwess: 10 + Math.floor(Math.random() * 5),
        personalityTraits: ['Brave', 'Honest', 'Diligent'],
        v17Traits: ['Brave', 'Honest', 'Diligent'],
        congenitalTraits: [],
        physicalHealthTraits: [],
        commanderTraits: [],
        lifestyleTraits: [],
        aiArchetype: 'Honorable Paragon',
        stress: 5,
        stressLevel: 0,
        dread: 5,
        prestige: 160,
        piety: 80,
        treasury: 115,
        menAtArms: 75,
        ambition: 'Prepare for lawful succession',
        tragicFlaw: 'Youthful impatience',
        darkSecret: 'Unproven on the field of battle',
        sacredOath: 'Serve the Crown faithfully',
        knownSecrets: [],
        hooksHeld: [],
        hooksOnMe: [],
        opinions: { [ruler.id]: 45 },
        isNobleHouse: true,
        hasPersonalBanner: false,
        coatOfArms: ruler.coatOfArms
          ? cloneCoatOfArmsData(ruler.coatOfArms)
          : generateRealmHeraldry(`${realm.id}_House_${ruler.houseName}`),
      };
      ruler.heirId = heirChar.id;
      if (!ruler.children) ruler.children = [];
      ruler.children.push(heirChar.id);
      w.characters.push(heirChar);
      aliveSet.add(heirChar.id);
      realmAlive.push(heirChar);
    }

    // Fill vacant Council seats by promoting living non-monarch realm nobles
    for (const office of COUNCIL_OFFICES) {
      const holder = realmAlive.find((c) => c.role === office.role && c.isAlive);
      if (!holder && ruler) {
        const candidate = realmAlive.find(
          (c) =>
            c.id !== ruler!.id &&
            c.role !== 'Crown Heir' &&
            c.role !== 'Heir' &&
            !COUNCIL_OFFICES.some((o) => o.role === c.role) &&
            !c.isImprisoned &&
            !c.isMonk
        );
        if (candidate) {
          candidate.role = office.role;
          candidate.title = `${office.titlePrefix} of ${realm.name}`;
          candidate.courtPosition = {
            orbit: 'INNER_RING',
            capitalSecrets: candidate.courtPosition?.capitalSecrets ?? 15,
            capitalBottlenecks: candidate.courtPosition?.capitalBottlenecks ?? 20,
            capitalFavors: candidate.courtPosition?.capitalFavors ?? 15,
            decayPressure: 0,
          };
        }
      }
    }
  }

  // 3. Guarantee w.monarchId, counties, burgs, holdings, armies, activeWars, factions only point to alive IDs
  const primaryRealmRuler = w.realms?.[0]?.rulerId;
  const firstLivingChar = w.characters.find((c) => c.isAlive !== false);
  if (!w.monarchId || !aliveSet.has(w.monarchId)) {
    w.monarchId = primaryRealmRuler && aliveSet.has(primaryRealmRuler) ? primaryRealmRuler : firstLivingChar?.id;
  }

  for (const county of w.counties || []) {
    if (!county.rulerId || !aliveSet.has(county.rulerId)) {
      const realm = w.realms?.find((r) => r.id === county.realmId);
      const fallbackOwner =
        w.characters.find((c) => c.isAlive !== false && c.countyId === county.id) ||
        w.characters.find((c) => c.isAlive !== false && c.id === realm?.rulerId) ||
        w.characters.find((c) => c.isAlive !== false && c.realmId === county.realmId) ||
        firstLivingChar;
      if (fallbackOwner) county.rulerId = fallbackOwner.id;
    }
  }

  for (const burg of w.burgs || []) {
    if (!burg.ownerId || !aliveSet.has(burg.ownerId)) {
      const county = w.counties?.find((ct) => ct.id === burg.countyId);
      const realm = w.realms?.find((r) => r.id === burg.stateId);
      const successor =
        w.characters.find((c) => c.id === county?.rulerId && c.isAlive !== false) ||
        w.characters.find((c) => c.id === realm?.rulerId && c.isAlive !== false) ||
        firstLivingChar;
      if (successor) {
        burg.ownerId = successor.id;
        burg.rulerTitle = successor.title;
      }
    }
  }

  for (const holding of w.holdings || []) {
    if (!holding.ownerId || !aliveSet.has(holding.ownerId)) {
      const matchingBurg = w.burgs?.find((b) => `holding_${b.id}` === holding.id || b.id === holding.id);
      const county = w.counties?.find((ct) => ct.id === holding.provinceId);
      const successor =
        w.characters.find((c) => c.id === matchingBurg?.ownerId && c.isAlive !== false) ||
        w.characters.find((c) => c.id === county?.rulerId && c.isAlive !== false) ||
        w.characters.find((c) => c.id === w.monarchId && c.isAlive !== false) ||
        firstLivingChar;
      if (successor) holding.ownerId = successor.id;
    }
  }

  for (const war of w.activeWars || []) {
    if (!aliveSet.has(war.attackerLeaderId)) {
      const realm = w.realms?.find((r) => r.id === war.attackerRealmId);
      if (realm?.rulerId && aliveSet.has(realm.rulerId)) war.attackerLeaderId = realm.rulerId;
    }
    if (!aliveSet.has(war.defenderLeaderId)) {
      const realm = w.realms?.find((r) => r.id === war.defenderRealmId);
      if (realm?.rulerId && aliveSet.has(realm.rulerId)) war.defenderLeaderId = realm.rulerId;
    }
  }

  for (const army of w.armies || []) {
    if (army.commanderId && !aliveSet.has(army.commanderId)) {
      const leaderId = aliveSet.has(army.attackerId)
        ? army.attackerId
        : w.realms?.find((r) => r.rulerId && aliveSet.has(r.rulerId))?.rulerId;
      if (leaderId) {
        const leader = w.characters.find((c) => c.id === leaderId);
        army.commanderId = leaderId;
        army.commanderName = leader ? `${getCharacterRankTitle(leader, w)} ${leader.name}` : army.commanderName;
      }
    }
    if (!aliveSet.has(army.attackerId)) {
      const war = (w.activeWars || []).find((wr) => wr.id === army.warId);
      if (war) army.attackerId = army.isDefender ? war.defenderLeaderId : war.attackerLeaderId;
    }
    if (!aliveSet.has(army.defenderId)) {
      const war = (w.activeWars || []).find((wr) => wr.id === army.warId);
      if (war) army.defenderId = army.isDefender ? war.attackerLeaderId : war.defenderLeaderId;
    }
  }

  for (const siege of w.activeSieges || []) {
    if (!aliveSet.has(siege.attackerCommanderId)) {
      const besieger = (w.armies || []).find((a) => a.id === siege.besiegerArmyId);
      const fallbackAtk =
        (besieger?.commanderId && aliveSet.has(besieger.commanderId) ? besieger.commanderId : undefined) ||
        (besieger?.attackerId && aliveSet.has(besieger.attackerId) ? besieger.attackerId : undefined) ||
        w.monarchId;
      if (fallbackAtk) siege.attackerCommanderId = fallbackAtk;
    }
    if (!aliveSet.has(siege.defenderLeaderId)) {
      const h = w.holdings?.find((hh) => hh.id === siege.holdingId);
      const b = w.burgs?.find((bg) => `holding_${bg.id}` === siege.holdingId || bg.id === siege.holdingId);
      const r = b ? w.realms?.find((rl) => rl.id === b.stateId) : undefined;
      const fallbackDef =
        (h?.ownerId && aliveSet.has(h.ownerId) ? h.ownerId : undefined) ||
        (r?.rulerId && aliveSet.has(r.rulerId) ? r.rulerId : undefined) ||
        w.monarchId;
      if (fallbackDef) siege.defenderLeaderId = fallbackDef;
    }
  }

  if (w.factions) {
    w.factions = w.factions
      .map((f) => ({
        ...f,
        members: f.members.filter((id) => aliveSet.has(id)),
      }))
      .filter((f) => f.members.length > 0)
      .map((f) => ({
        ...f,
        leaderId: aliveSet.has(f.leaderId) ? f.leaderId : f.members[0],
      }));
  }

  reconcileFeudalHierarchy(w);

  // 4. Scrub transient active links from living character objects while preserving genealogical spouse/parent lineage
  for (const char of w.characters) {
    if (char.isAlive === false) continue;
    if (char.rivalId && !aliveSet.has(char.rivalId)) char.rivalId = undefined;
    if (char.friendId && !aliveSet.has(char.friendId)) char.friendId = undefined;
    if (char.loverId && !aliveSet.has(char.loverId)) char.loverId = undefined;
    if (char.trueLoveId && !aliveSet.has(char.trueLoveId)) char.trueLoveId = undefined;
    if (char.guardianId && !aliveSet.has(char.guardianId)) char.guardianId = undefined;
    if (char.regentId && !aliveSet.has(char.regentId)) char.regentId = undefined;
    if (char.liegeId && !aliveSet.has(char.liegeId)) {
      const realm = w.realms?.find((r) => r.id === char.realmId);
      char.liegeId = realm && realm.rulerId !== char.id ? realm.rulerId : undefined;
    }
    if (char.heirId && !aliveSet.has(char.heirId)) {
      const nextLine = SuccessionEngine.getSuccessionLine(char, w);
      const nextHeir = nextLine[0];
      char.heirId = nextHeir?.id;
      if (nextHeir) {
        const realm = w.realms?.find((r) => r.id === char.realmId);
        if (realm && realm.rulerId === char.id) {
          const sovTier = char.titleTier || getRealmSovereignRank(realm, char.gender).titleTier;
          if (!nextHeir.titleTier || getTitleTierRank(nextHeir.titleTier) >= getTitleTierRank(sovTier)) {
            const heirStyle = getHeirStyleForRealm(realm, sovTier, nextHeir.gender || 'male');
            nextHeir.titleTier = heirStyle.titleTier;
          }
        }
      }
    }
    if (char.vassalIds) {
      char.vassalIds = char.vassalIds.filter((id) => aliveSet.has(id));
    }
    if (char.activeScheme && !aliveSet.has(char.activeScheme.targetId)) {
      char.activeScheme = undefined;
    }
    if (char.opinions) {
      for (const key of Object.keys(char.opinions)) {
        if (deadIds.has(key) || !aliveSet.has(key)) {
          delete char.opinions[key];
        }
      }
    }
  }
}

// ============================================================================
// 2. GENETICS & REPRODUCTION ENGINE
// ============================================================================

export class GeneticsEngine {
  static areSiblings(a: Character, b: Character): boolean {
    if (a.id === b.id) return false;
    return (
      (Boolean(a.motherId) && a.motherId === b.motherId) ||
      (Boolean(a.realFatherId) && a.realFatherId === b.realFatherId)
    );
  }

  static areCousins(a: Character, b: Character, w: WorldState): boolean {
    const aParents = [a.motherId, a.realFatherId].filter(Boolean).map(id => w.characters.find(c => c.id === id)).filter(Boolean) as Character[];
    const bParents = [b.motherId, b.realFatherId].filter(Boolean).map(id => w.characters.find(c => c.id === id)).filter(Boolean) as Character[];

    for (const ap of aParents) {
      for (const bp of bParents) {
        if (ap.id !== bp.id && GeneticsEngine.areSiblings(ap, bp)) {
          return true;
        }
      }
    }
    return false;
  }

  static generate(mother: Character | undefined, father: Character | undefined, w: WorldState): string[] {
    const traits = new Set<string>();
    const parents = [mother, father].filter(Boolean) as Character[];

    // 1. Inherit Physical & Mental traits from parents (40% chance)
    for (const p of parents) {
      const pTraits = p.v17Traits || p.personalityTraits || [];
      for (const tName of pTraits) {
        const def = V17_TRAIT_DB[tName];
        if (def && def.inheritable && (def.category === 'PHYSICAL' || def.category === 'MENTAL')) {
          if (Math.random() < 0.40) traits.add(tName);
        }
      }
    }

    // 2. Behavioral personality traits (pick 1-3 randomly, excluding direct opposites)
    const behavioralDefs = Object.values(V17_TRAIT_DB).filter(
      (t) => t.category === 'BEHAVIORAL' && t.minAge === 0 && !t.reqEvent
    );
    const blockedOpposites = new Set<string>();
    const count = 1 + Math.floor(Math.random() * 3);
    let attempts = 0;
    while (traits.size < count && attempts < 15 && behavioralDefs.length > 0) {
      attempts++;
      const chosen = behavioralDefs[Math.floor(Math.random() * behavioralDefs.length)];
      if (blockedOpposites.has(chosen.name) || traits.has(chosen.name)) continue;
      traits.add(chosen.name);
      blockedOpposites.add(chosen.name);
      for (const opp of chosen.opposites || []) blockedOpposites.add(opp);
    }

    // 3. Inbreeding checks
    if (mother && father) {
      if (GeneticsEngine.areSiblings(mother, father)) {
        if (Math.random() < 0.40) traits.add('Inbred');
      } else if (GeneticsEngine.areCousins(mother, father, w)) {
        if (Math.random() < 0.08) traits.add('Inbred');
      }

      // Congenital bloodlines pass-through (40% if parent has it)
      for (const t of Object.values(V17_TRAIT_DB)) {
        if (t.category === 'CONGENITAL' && parents.some(p => (p.v17Traits || []).includes(t.name))) {
          if (Math.random() < 0.40) traits.add(t.name);
        }
      }
    }

    return Array.from(traits);
  }
}

// ============================================
// 3. LUST, PREGNANCY & DYNASTY ENGINE
// ============================================

export class LustAndDynastyEngine {
  static getAgeLibido(age: number): number {
    if (age < 20) return 30.0;
    if (age < 35) return 50.0;
    if (age < 50) return 40.0;
    if (age < 65) return 25.0;
    return 15.0;
  }

  static process(c: Character, w: WorldState, monthsDelta: number = 1): void {
    const baseLibido = LustAndDynastyEngine.getAgeLibido(c.age);
    const suppression = c.loverId ? 0.5 : 0.0;
    const fertilityMod = getHookMultiplier(c.v17Traits || c.personalityTraits || [], 'FERTILITY');
    c.netLibidoPressure = Math.max(0.0, baseLibido * fertilityMod * (1.0 - suppression));

    if (c.gender !== 'female' || !c.isAlive) return;

    const hasPregnantTrait =
      Boolean(c.physicalHealthTraits?.includes('Pregnant')) ||
      Boolean(c.v17Traits?.includes('Pregnant'));
    if (hasPregnantTrait && (c.monthsPregnant === undefined || c.monthsPregnant < 0)) {
      c.monthsPregnant = 0;
      if (!c.pregnantBy) c.pregnantBy = c.loverId || c.spouseId;
      if (c.conceivedInWedlockWith === undefined && c.spouseId && c.pregnantBy === c.spouseId) {
        c.conceivedInWedlockWith = c.spouseId;
      }
    }

    // Advance Pregnancy (9-month gestation trait)
    if (c.monthsPregnant !== undefined && c.monthsPregnant >= 0) {
      if (!c.physicalHealthTraits) c.physicalHealthTraits = [];
      if (!c.physicalHealthTraits.includes('Pregnant')) c.physicalHealthTraits.push('Pregnant');
      syncCharacterTraits(c);

      c.monthsPregnant += Math.max(1, monthsDelta);
      if (c.monthsPregnant >= 9) {
        c.monthsPregnant = undefined;
        c.physicalHealthTraits = (c.physicalHealthTraits || []).filter((t) => t !== 'Pregnant');
        c.v17Traits = (c.v17Traits || []).filter((t) => t !== 'Pregnant');
        syncCharacterTraits(c);
        LustAndDynastyEngine.giveBirth(c, w);
      }
      return;
    }

    // Check Conception (female 16-48 with partner)
    const partnerId = c.loverId || c.spouseId;
    if (c.age >= 16 && c.age <= 48 && partnerId) {
      let chance = 0.035 * fertilityMod;
      if (c.trueLoveId === partnerId) chance *= 2.5;

      if (Math.random() < chance) {
        c.monthsPregnant = 0;
        c.pregnantBy = partnerId;
        c.conceivedInWedlockWith = partnerId === c.spouseId ? c.spouseId : undefined;
        if (!c.physicalHealthTraits) c.physicalHealthTraits = [];
        if (!c.physicalHealthTraits.includes('Pregnant')) c.physicalHealthTraits.push('Pregnant');
        syncCharacterTraits(c);
      }
    }

    // Adultery Discovery Roll
    if (c.loverId && c.spouseId && Math.random() < 0.03) {
      const spouse = w.characters.find(x => x.id === c.spouseId);
      const lover = w.characters.find(x => x.id === c.loverId);
      if (spouse && lover) {
        c.loverId = undefined;
        lover.loverId = undefined;
        c.stress = Math.min(300, c.stress + 50);

        if (!spouse.grudges) spouse.grudges = [];
        spouse.grudges.push({ reason: 'Cuckolded Me', value: -100, months: 240 });

        const spouseTraits = spouse.v17Traits || spouse.personalityTraits || [];
        if (!spouseTraits.includes('Betrayed')) {
          spouseTraits.push('Betrayed');
          spouse.v17Traits = spouseTraits;
        }

        w.history.unshift({
          id: generateUniqueId('hist_adultery_disc'),
          year: w.currentYear,
          title: `Scandal: Adultery Discovered!`,
          category: 'Dynastic Drama',
          description: `${spouse.name} discovered ${c.name}'s illicit affair with ${lover.name}! A furious rift has torn the marriage.`,
          primaryActorId: spouse.id,
          secondaryActorId: c.id,
          realmId: c.realmId,
        });

        if (spouseTraits.includes('Wrathful') || spouseTraits.includes('Just')) {
          JusticeEngine.accuse(spouse, c, 'Adultery', w);
        } else {
          if (!spouse.v17SecretsHeld) spouse.v17SecretsHeld = [];
          spouse.v17SecretsHeld.push({
            secretType: 'Adultery',
            targetId: c.id,
            holderId: spouse.id,
            lethality: 80.0,
          });
        }
      }
    }
  }

  static giveBirth(mother: Character, w: WorldState): void {
    const realFather = w.characters.find(c => c.id === mother.pregnantBy);
    let isKnownBastard = false;
    let knownFatherId = mother.spouseId;

    const adulteryExposed = (mother.crimes || []).some(
      cr => cr.crimeType === 'Adultery' && cr.monthRecorded >= ((w.month || 0) - 9)
    );

    if (mother.conceivedInWedlockWith) {
      knownFatherId = mother.conceivedInWedlockWith;
      isKnownBastard = false;
      mother.conceivedInWedlockWith = undefined;
    } else if (!mother.spouseId) {
      knownFatherId = realFather?.id;
      isKnownBastard = true;
    } else if (mother.spouseId !== mother.pregnantBy) {
      if (adulteryExposed) {
        knownFatherId = realFather?.id;
        isKnownBastard = true;
      } else {
        knownFatherId = mother.spouseId;
        if (realFather) {
          if (!realFather.v17SecretsHeld) realFather.v17SecretsHeld = [];
          realFather.v17SecretsHeld.push({
            secretType: 'Illegitimate_Child',
            targetId: mother.id,
            holderId: realFather.id,
            lethality: 90.0,
          });
        }
      }
    }
    mother.monthsPregnant = undefined;
    mother.pregnantBy = undefined;
    mother.conceivedInWedlockWith = undefined;
    mother.physicalHealthTraits = (mother.physicalHealthTraits || []).filter((t) => t !== 'Pregnant');
    mother.v17Traits = (mother.v17Traits || []).filter((t) => t !== 'Pregnant');
    syncCharacterTraits(mother);

    const cid = generateUniqueId('char_birth');
    const kFather = w.characters.find(c => c.id === knownFatherId);
    const dynName = isKnownBastard ? mother.houseName : (kFather?.houseName || mother.houseName);
    const dynPrestige = isKnownBastard ? (mother.prestige || 100) : (kFather?.prestige || mother.prestige || 100);

    const isBoy = Math.random() < 0.5;
    const names = isBoy
      ? ['Aethelgard', 'Baelor', 'Cassian', 'Godfrey', 'Theodoric', 'Valerius', 'Almeric', 'Gareth']
      : ['Aurelia', 'Elysia', 'Gwendolyn', 'Isolde', 'Seraphina', 'Vespera', 'Vivienne', 'Beatrix'];
    const chosenName = `${names[Math.floor(Math.random() * names.length)]} of House ${dynName}`;

    const childTraits = GeneticsEngine.generate(mother, realFather, w);
    if (isKnownBastard && !childTraits.includes('Bastard')) {
      childTraits.push('Bastard');
    }

    const childPersonality = childTraits
      .filter((t) => V17_TRAIT_DB[t]?.category === 'BEHAVIORAL')
      .slice(0, 3);
    const childCongenital = childTraits.filter(
      (t) =>
        V17_TRAIT_DB[t]?.category === 'CONGENITAL' ||
        t.includes('Blood') ||
        t === 'Inbred' ||
        t === 'Genius'
    );
    const birthRealm = w.realms?.find((r) => r.id === mother.realmId);
    const birthMonarch = birthRealm?.rulerId ? w.characters.find((c) => c.id === birthRealm.rulerId) : undefined;
    const childIdentity = getChildRoleForParents(
      mother,
      isKnownBastard ? undefined : kFather,
      birthRealm,
      isBoy,
      isKnownBastard,
      birthMonarch
    );
    const parentRef = (mother.houseName === dynName ? mother : kFather) || mother;
    const childIsNoble = isNobleOrigin(parentRef);
    const parentHouseArms =
      (mother.houseName === dynName ? mother.coatOfArms : kFather?.coatOfArms) || mother.coatOfArms;

    const child: Character = {
      id: cid,
      name: chosenName,
      houseName: dynName,
      houseMotto: mother.houseMotto || 'Unbroken by Time',
      title: childIdentity.title,
      role: childIdentity.role,
      titleTier: 'Commoner',
      isNobleHouse: childIsNoble,
      hasPersonalBanner: false,
      gender: isBoy ? 'male' : 'female',
      age: 0,
      birthYear: w.currentYear,
      isAlive: true,
      realmId: mother.realmId,
      provinceId: mother.provinceId,
      baseDiplomacy: 4,
      baseMartial: 4,
      baseStewardship: 4,
      baseIntrigue: 4,
      baseLearning: 4,
      baseProwess: 2,
      traitsLockedAt21: false,
      personalityTraits: childPersonality.slice(0, 1),
      v17Traits: childTraits,
      congenitalTraits: childCongenital,
      physicalHealthTraits: [],
      commanderTraits: [],
      lifestyleTraits: [],
      aiArchetype: deriveAIArchetype(childPersonality, undefined, childIdentity.role),
      stress: 0,
      stressLevel: 0,
      dread: 0,
      prestige: Math.round(dynPrestige * 0.5),
      piety: 50,
      ambition: 'To survive court plots and uphold dynastic honors',
      tragicFlaw: 'Youthful inexperience in statecraft',
      darkSecret: isKnownBastard ? 'Born of forbidden passion outside royal wedlock' : 'None',
      sacredOath: 'To defend family and realm unto death',
      knownSecrets: [],
      hooksHeld: [],
      hooksOnMe: [],
      opinions: {},
      coatOfArms: childIsNoble && parentHouseArms ? cloneCoatOfArmsData(parentHouseArms) : undefined,
      motherId: mother.id,
      realFatherId: realFather?.id,
      knownFatherId: knownFatherId,
    };
    syncCharacterTraits(child);

    w.characters.push(child);
    if (!mother.children) mother.children = [];
    mother.children.push(cid);
    if (knownFatherId && kFather) {
      if (!kFather.children) kFather.children = [];
      kFather.children.push(cid);
    }

    w.history.unshift({
      id: generateUniqueId('hist_birth'),
      year: w.currentYear,
      title: `Birth in House ${dynName}: ${chosenName}`,
      category: 'Dynastic Drama',
      description: `${mother.name} safely gave birth to ${chosenName}${isKnownBastard ? ' (Born out of wedlock as a Bastard)' : ''}!`,
      primaryActorId: mother.id,
      secondaryActorId: kFather?.id,
      realmId: mother.realmId,
    });
  }
}

// ============================================
// 4. GEOGRAPHY & TRAVEL ENGINE
// ============================================

export class GeographyAndTravelEngine {
  static initiateTravel(
    c: Character,
    destProvId: string,
    purpose: string,
    w: WorldState
  ): boolean {
    if (c.isImprisoned || c.provinceId === destProvId) return false;
    const prov = w.provinces?.find((p) => p.id === c.provinceId);
    const dest = w.provinces?.find((p) => p.id === destProvId);
    if (!prov || !dest) return false;

    const hops = prov.neighbors.includes(destProvId) ? 1 : 2;
    const terrainMod = getTerrainTravelModifier(dest.terrain);
    const travelTime = Math.max(1, Math.round(hops * terrainMod));

    c.isTraveling = true;
    c.travelDestProvinceId = destProvId;
    c.travelMonthsLeft = travelTime;
    c.travelPurpose = purpose;

    w.history.unshift({
      id: generateUniqueId('hist_travel'),
      year: w.currentYear,
      title: `Noble Journey: ${c.name}`,
      category: 'Dynastic Drama',
      description: `${c.name} departed ${prov.name} traveling to ${dest.name} for ${purpose} (Expected Journey: ${travelTime} months across ${dest.terrain} lands).`,
      primaryActorId: c.id,
      realmId: c.realmId,
    });

    return true;
  }

  static step(w: WorldState, monthsDelta: number = 1): void {
    if (!w.provinces) return;
    const stepMonths = Math.max(1, monthsDelta);

    for (const c of w.characters) {
      if (!c.isAlive) continue;

      if (!c.isTraveling) {
        if (
          c.courtPosition &&
          (c.courtPosition.orbit === 'INNER_RING' || c.courtPosition.orbit === 'MIDDLE_RING')
        ) {
          if (w.capitalProvinceId && c.provinceId !== w.capitalProvinceId && c.id !== w.monarchId) {
            GeographyAndTravelEngine.initiateTravel(c, w.capitalProvinceId, 'Court Duty', w);
          }
        }
        continue;
      }

      c.travelMonthsLeft = Math.max(0, (c.travelMonthsLeft || 1) - stepMonths);

      const currentProv = w.provinces.find((p) => p.id === c.provinceId);
      let hazardChance = 0.04;
      if (currentProv && currentProv.terrain === 'Mountains') hazardChance = 0.08;

      if (Math.random() < hazardChance) {
        const hazards = ['Bandit Ambush', 'Treacherous Mountain Storm', 'Alpine Rockslide'];
        const chosenHazard = hazards[Math.floor(Math.random() * hazards.length)];
        c.stress = Math.min(300, c.stress + 25);

        let injured = false;
        const traits = c.v17Traits || c.personalityTraits || [];
        if (Math.random() < 0.4 && !traits.includes('Wounded')) {
          traits.push('Wounded');
          c.v17Traits = traits;
          injured = true;
        }

        w.history.unshift({
          id: generateUniqueId('hist_hazard'),
          year: w.currentYear,
          title: `Travel Peril: ${c.name}`,
          category: 'Dynastic Drama',
          description: `${c.name} encountered a ${chosenHazard} while journeying along the high road!${
            injured ? ' The noble suffered severe wounds.' : ''
          }`,
          primaryActorId: c.id,
          realmId: c.realmId,
        });
      }

      if ((c.travelMonthsLeft || 0) <= 0) {
        c.isTraveling = false;
        c.provinceId = c.travelDestProvinceId || c.provinceId;
        const dest = w.provinces.find((p) => p.id === c.provinceId);
        c.travelDestProvinceId = undefined;
        c.travelPurpose = '';

        w.history.unshift({
          id: generateUniqueId('hist_arrival'),
          year: w.currentYear,
          title: `Arrival at ${dest?.name || 'Destination'}`,
          category: 'Dynastic Drama',
          description: `${c.name} has arrived safely in ${dest?.name || 'the province'} to take up residence.`,
          primaryActorId: c.id,
          realmId: c.realmId,
        });
      }
    }
  }
}

// ============================================
// 5. PLAGUE & PROVINCIAL QUARANTINE ENGINE
// ============================================
// 4B. LAND-ADJACENT PROVINCE TOPOLOGY & EXCLAVES
// ============================================

/**
 * Rebuilds `prov.neighbors` strictly from land-to-land adjacency so straits/oceans
 * do not falsely bridge provinces into fake overland contiguity.
 */
export function rebuildProvinceLandNeighbors(w: WorldState): void {
  const provinces = w.provinces || [];
  if (provinces.length === 0) return;

  const seaLevel = w.settings?.seaLevel ?? 0.28;
  const adj = new Map<string, Set<string>>();
  const cellProvMap = new Map<number, string>();

  for (const p of provinces) {
    adj.set(p.id, new Set<string>());
    for (const ci of p.cellIndices || []) {
      cellProvMap.set(ci, p.id);
    }
  }

  let builtFromMesh = false;
  if (w.cells && w.cells.length > 0) {
    // Ensure cell -> province lookup covers countyId too
    for (const c of w.cells) {
      if (c.countyId && adj.has(c.countyId) && !cellProvMap.has(c.index)) {
        cellProvMap.set(c.index, c.countyId);
      }
    }

    if (w.mesh?.r_neighbors) {
      for (const c of w.cells) {
        if (c.elevation < seaLevel) continue;
        const pId = cellProvMap.get(c.index);
        if (!pId) continue;
        const nList: number[] =
          typeof w.mesh.r_neighbors === 'function'
            ? w.mesh.r_neighbors(c.index) || []
            : Array.isArray(w.mesh.r_neighbors[c.index])
            ? w.mesh.r_neighbors[c.index]
            : [];
        for (const ni of nList) {
          const nc = w.cells[ni];
          if (!nc || nc.elevation < seaLevel) continue;
          const npId = cellProvMap.get(nc.index);
          if (npId && npId !== pId) {
            adj.get(pId)!.add(npId);
            adj.get(npId)!.add(pId);
            builtFromMesh = true;
          }
        }
      }
    }

    // Fallback when mesh is absent: compare land cell proximity between provinces
    if (!builtFromMesh) {
      const landCellsByProv = new Map<string, { x: number; y: number }[]>();
      for (const p of provinces) landCellsByProv.set(p.id, []);
      for (const c of w.cells) {
        if (c.elevation < seaLevel) continue;
        const pId = cellProvMap.get(c.index);
        if (pId) landCellsByProv.get(pId)!.push({ x: c.x, y: c.y });
      }
      const contactThreshold = 26;
      for (let i = 0; i < provinces.length; i++) {
        const p1 = provinces[i];
        const lc1 = landCellsByProv.get(p1.id) || [];
        if (lc1.length === 0) continue;
        for (let j = i + 1; j < provinces.length; j++) {
          const p2 = provinces[j];
          const lc2 = landCellsByProv.get(p2.id) || [];
          if (lc2.length === 0) continue;
          let touches = false;
          for (const a of lc1) {
            for (const b of lc2) {
              if (Math.hypot(a.x - b.x, a.y - b.y) <= contactThreshold) {
                touches = true;
                break;
              }
            }
            if (touches) break;
          }
          if (touches) {
            adj.get(p1.id)!.add(p2.id);
            adj.get(p2.id)!.add(p1.id);
            builtFromMesh = true;
          }
        }
      }
    }
  }

  // Last-resort synthetic test fallback (when world has provinces without cells)
  if (!builtFromMesh && (!w.cells || w.cells.length === 0)) {
    for (let i = 0; i < provinces.length; i++) {
      for (let j = i + 1; j < provinces.length; j++) {
        const p1 = provinces[i];
        const p2 = provinces[j];
        if (Math.hypot(p1.capitalX - p2.capitalX, p1.capitalY - p2.capitalY) < 160) {
          adj.get(p1.id)!.add(p2.id);
          adj.get(p2.id)!.add(p1.id);
        }
      }
    }
  }

  for (const p of provinces) {
    p.neighbors = Array.from(adj.get(p.id) || []);
  }
}

/**
 * Identifies all provinces that are physically separated/cut off overland from their
 * realm's main territory / capital (for instance after losing connecting borderlands in a war).
 * Marks `prov.isExclave = true | false` and returns the set of exclave province IDs.
 */
export function computeExclaveProvinceIds(w: WorldState): Set<string> {
  const exclaveIds = new Set<string>();
  const provinces = w.provinces || [];
  if (provinces.length === 0) return exclaveIds;

  const provById = new Map<string, Province>(provinces.map((p) => [p.id, p]));

  // Group provinces by current realmId (syncing from county if needed)
  for (const p of provinces) {
    const county = w.counties?.find((c) => c.id === p.id);
    if (county && county.realmId && county.realmId !== p.realmId) {
      p.realmId = county.realmId;
    }
    p.isExclave = false;
  }

  const provsByRealm = new Map<string, Province[]>();
  for (const p of provinces) {
    if (!p.realmId) continue;
    const list = provsByRealm.get(p.realmId) || [];
    list.push(p);
    provsByRealm.set(p.realmId, list);
  }

  for (const [realmId, realmProvs] of provsByRealm.entries()) {
    if (realmProvs.length <= 1) continue;
    const realm = w.realms?.find((r) => r.id === realmId);
    const capBurg = realm ? w.burgs?.find((b) => b.id === realm.capitalBurgId) : undefined;
    const ruler = realm ? w.characters?.find((c) => c.id === realm.rulerId && c.isAlive) : undefined;

    const anchorProv =
      (capBurg?.countyId ? realmProvs.find((p) => p.id === capBurg.countyId) : undefined) ||
      (realmId === w.realms?.[0]?.id && w.capitalProvinceId
        ? realmProvs.find((p) => p.id === w.capitalProvinceId)
        : undefined) ||
      (ruler?.provinceId ? realmProvs.find((p) => p.id === ruler.provinceId) : undefined) ||
      realmProvs[0];

    if (!anchorProv) continue;

    // BFS across same-realm overland neighbors
    const reachable = new Set<string>([anchorProv.id]);
    const queue: string[] = [anchorProv.id];
    while (queue.length > 0) {
      const curId = queue.shift()!;
      const cur = provById.get(curId);
      if (!cur) continue;
      for (const nid of cur.neighbors || []) {
        if (reachable.has(nid)) continue;
        const np = provById.get(nid);
        if (np && np.realmId === realmId) {
          reachable.add(nid);
          queue.push(nid);
        }
      }
    }

    for (const p of realmProvs) {
      if (!reachable.has(p.id)) {
        p.isExclave = true;
        exclaveIds.add(p.id);
      }
    }
  }

  return exclaveIds;
}

/**
 * Triggers an independence / secession rebellion in a cut-off exclave province
 * separated from its kingdom's mainland.
 */
function triggerExclaveRebellion(rebelLeader: Character, exclaveProv: Province, w: WorldState): void {
  const oldRealm = w.realms?.find((r) => r.id === exclaveProv.realmId);
  if (!oldRealm || !exclaveProv.isExclave) return;
  const oldMonarch = w.characters.find((c) => c.id === oldRealm.rulerId && c.isAlive);

  // Gather the contiguous cut-off component around exclaveProv
  const provById = new Map<string, Province>((w.provinces || []).map((p) => [p.id, p]));
  const componentIds = new Set<string>([exclaveProv.id]);
  const q: string[] = [exclaveProv.id];
  while (q.length > 0) {
    const cid = q.shift()!;
    const cp = provById.get(cid);
    if (!cp) continue;
    for (const nid of cp.neighbors || []) {
      const np = provById.get(nid);
      if (np && np.realmId === oldRealm.id && np.isExclave && !componentIds.has(nid)) {
        componentIds.add(nid);
        q.push(nid);
      }
    }
  }

  const newRealmId = generateUniqueId('realm_sec');
  const seatBurg =
    w.burgs?.find((b) => componentIds.has(b.countyId) && b.ownerId === rebelLeader.id) ||
    w.burgs?.find((b) => componentIds.has(b.countyId)) ||
    w.burgs?.[0];
  const cleanProvName = exclaveProv.name
    .replace(/^(Free State of|Free Duchy of|Free County of|Grand Duchy of|Royal Duchy of|Duchy of|Crown County of|Appanage County of|County of|Earldom of)\s*/i, '')
    .trim();
  const seatName = seatBurg?.name || cleanProvName || rebelLeader.houseName;
  const existingRealmNames = new Set((w.realms || []).map((r) => r.name.toLowerCase()));
  const isMercantileHub = Boolean(seatBurg?.type.includes('Port') || seatBurg?.type.includes('Market'));
  const candidateTitles = isMercantileHub
    ? [`Republic of ${seatName}`, `City-State of ${seatName}`, `League of ${cleanProvName}`]
    : componentIds.size >= 2
    ? [`Duchy of ${cleanProvName}`, `Duchy of ${seatName}`, `Margraviate of ${cleanProvName}`, `Duchy of ${rebelLeader.houseName}`]
    : [`County of ${cleanProvName}`, `Earldom of ${seatName}`, `County of ${rebelLeader.houseName}`];
  const realmTitle =
    candidateTitles.find((t) => !existingRealmNames.has(t.toLowerCase())) ||
    `${candidateTitles[0]} (${rebelLeader.houseName})`;
  if (!rebelLeader.coatOfArms?.config) {
    rebelLeader.coatOfArms = generateRealmHeraldry(`${newRealmId}_${realmTitle}_${w.currentYear}`);
  }
  rebelLeader.isNobleHouse = true;
  rebelLeader.hasPersonalBanner = true;
  const heraldry = cloneCoatOfArmsData(rebelLeader.coatOfArms);
  const palette = ['#b45309', '#0f766e', '#7c2d12', '#1d4ed8', '#6d28d9', '#be123c'];

  const breakawayGov = isMercantileHub
    ? 'City-State'
    : componentIds.size >= 2
    ? 'High Duchy'
    : 'Sovereign County';

  const newRealm = {
    id: newRealmId,
    name: realmTitle,
    color: palette[(w.realms?.length || 0) % palette.length],
    rulerId: rebelLeader.id,
    capitalBurgId: seatBurg?.id || '',
    culture: oldRealm.culture,
    religion: oldRealm.religion,
    government: breakawayGov,
    societyType: oldRealm.societyType || 'Borderland March-Folk',
    foundingLegend: `Proclaimed independence as a ${breakawayGov.toLowerCase()} from ${oldRealm.name} in ${w.currentYear} after royal authority failed across severed marches.`,
    countyIds: Array.from(componentIds),
    heraldry,
    coatOfArms: cloneCoatOfArmsData(heraldry),
    diplomaticRelations: { [oldRealm.id]: -65 },
    enemyRealmIds: [oldRealm.id],
    alliedRealmIds: [],
    truceUntilYearByRealm: {},
  };

  w.realms = w.realms || [];
  w.realms.push(newRealm as any);

  // Promote rebel leader to sovereign ruler of the seceding exclave
  const rebRank = getRealmSovereignRank(newRealm, rebelLeader.gender);
  rebelLeader.realmId = newRealmId;
  rebelLeader.liegeId = undefined;
  rebelLeader.role = 'Monarch';
  rebelLeader.titleTier = rebRank.titleTier;
  rebelLeader.title = `${rebRank.rankTitle} of ${stripRealmPrefix(realmTitle)}`;
  rebelLeader.loyalty = 85;
  rebelLeader.prestige = (rebelLeader.prestige || 100) + 180;
  if (seatBurg) seatBurg.isCapital = true;

  // Transfer all contiguous cut-off counties/provinces & their burgs/holdings to the breakaway state
  for (const pid of componentIds) {
    transferCountySovereignty(pid, rebelLeader, w);
    const pr = provById.get(pid);
    if (pr) {
      pr.realmId = newRealmId;
      pr.isExclave = false;
    }
  }

  // Transfer any other characters living inside those seceding provinces
  for (const ch of w.characters || []) {
    if (ch.id !== rebelLeader.id && ch.provinceId && componentIds.has(ch.provinceId) && ch.realmId === oldRealm.id) {
      ch.realmId = newRealmId;
      ch.liegeId = rebelLeader.id;
    }
  }

  // Record hostility on former overlord and clear old faction membership
  if (!oldRealm.enemyRealmIds) oldRealm.enemyRealmIds = [];
  if (!oldRealm.enemyRealmIds.includes(newRealmId)) oldRealm.enemyRealmIds.push(newRealmId);
  if (!oldRealm.diplomaticRelations) oldRealm.diplomaticRelations = {};
  oldRealm.diplomaticRelations[newRealmId] = -65;

  if (oldMonarch) {
    if (!oldMonarch.opinions) oldMonarch.opinions = {};
    oldMonarch.opinions[rebelLeader.id] = -85;
    if (!rebelLeader.opinions) rebelLeader.opinions = {};
    rebelLeader.opinions[oldMonarch.id] = -70;
  }
  if (w.factions) {
    w.factions = w.factions
      .map((f) => ({ ...f, members: f.members.filter((m) => m !== rebelLeader.id) }))
      .filter((f) => f.members.length > 0 && !componentIds.has(w.characters.find((x) => x.id === f.leaderId)?.provinceId || ''));
  }

  computeExclaveProvinceIds(w);
  reconcileFeudalHierarchy(w);

  if (!w.history) w.history = [];
  w.history.unshift({
    id: generateUniqueId('hist_exclave_rebel'),
    year: w.currentYear,
    title: `Exclave Secession: ${realmTitle}`,
    category: 'War & Conquest',
    description: `Cut off from the heartland of ${oldRealm.name}, ${rebelLeader.name} rallied the isolated garrison of ${exclaveProv.name} and proclaimed the independent ${realmTitle}!`,
    primaryActorId: rebelLeader.id,
    secondaryActorId: oldMonarch?.id,
    realmId: newRealmId,
  });
}

// ============================================
// 5. PLAGUE & QUARANTINE ENGINE (RARE EVENTS)
// ============================================

export class PlagueEngine {
  static step(w: WorldState, monthsDelta: number = 1): void {
    if (!w.epidemics) w.epidemics = [];
    if (!w.lockedDownProvinces) w.lockedDownProvinces = [];
    if (!w.provinces) return;

    let overcrowdingMultiplier = 1.0;
    if (w.burgs) {
      for (const b of w.burgs) {
        if (b.overcrowdingRatio && b.overcrowdingRatio > 1.0) {
          const ratioBonus = Math.min(4.0, Math.pow(b.overcrowdingRatio, 1.8));
          if (ratioBonus > overcrowdingMultiplier) overcrowdingMultiplier = ratioBonus;
        }
      }
    }

    // Limit epidemics and plagues to rare generational events with a strict multi-year cooldown
    const yearsSinceLastPlague = w.lastPlagueYear !== undefined ? w.currentYear - w.lastPlagueYear : 999;
    const cooldownReady = yearsSinceLastPlague >= 16;
    const outbreakChance = cooldownReady ? Math.min(0.006, 0.0018 * overcrowdingMultiplier) : 0;

    if (w.epidemics.length === 0 && outbreakChance > 0 && Math.random() < outbreakChance) {
      const cityHoldings = w.holdings?.filter((h) => h.estateType === 'City') || [];
      if (cityHoldings.length > 0) {
        const epicenter = cityHoldings[Math.floor(Math.random() * cityHoldings.length)];
        const names = ['The Grey Pox', 'The Red Death', 'Sweating Sickness', 'Bubonic Plague'];
        const chosenName = names[Math.floor(Math.random() * names.length)];
        const plague: Epidemic = {
          id: generateUniqueId('epidemic'),
          name: chosenName,
          infectedProvinceIds: [epicenter.provinceId],
          lethality: 0.25 + Math.random() * 0.25,
          monthsRemaining: 10 + Math.floor(Math.random() * 4),
        };
        w.epidemics.push(plague);
        w.lastPlagueYear = w.currentYear;

        const prov = w.provinces.find((p) => p.id === epicenter.provinceId);
        w.history.unshift({
          id: generateUniqueId('hist_plague'),
          year: w.currentYear,
          title: `Pestilence Erupts: ${chosenName}`,
          category: 'Great Cataclysm',
          description: `An outbreak of ${chosenName} has erupted in the trading streets of ${
            prov?.name || 'the realm'
          }!`,
          realmId: prov?.realmId,
        });
      }
    }

    for (let i = w.epidemics.length - 1; i >= 0; i--) {
      const ep = w.epidemics[i];
      ep.monthsRemaining -= Math.max(1, monthsDelta);
      if (ep.monthsRemaining <= 0) {
        w.lastPlagueYear = w.currentYear;
        w.history.unshift({
          id: generateUniqueId('hist_remission'),
          year: w.currentYear,
          title: `Remission: ${ep.name}`,
          category: 'Great Cataclysm',
          description: `${ep.name} has finally burned itself out across the provinces. Purifying bonfires celebrate the return of health.`,
        });
        w.epidemics.splice(i, 1);
        continue;
      }

      // Spread with Set-based deduplication across land-adjacent frontiers
      const newlyInfected = new Set<string>();
      for (const pid of ep.infectedProvinceIds) {
        const prov = w.provinces.find((p) => p.id === pid);
        if (!prov) continue;

        for (const neighborId of prov.neighbors) {
          if (
            !ep.infectedProvinceIds.includes(neighborId) &&
            !w.lockedDownProvinces.includes(neighborId)
          ) {
            if (Math.random() < 0.14) {
              newlyInfected.add(neighborId);
              const nProv = w.provinces.find((p) => p.id === neighborId);
              w.history.unshift({
                id: generateUniqueId('hist_plague_spread'),
                year: w.currentYear,
                title: `Plague Frontier: ${ep.name}`,
                category: 'Great Cataclysm',
                description: `${ep.name} has crossed the borderlands into ${nProv?.name || 'neighboring province'}!`,
                realmId: nProv?.realmId,
              });
            }
          }
        }
      }

      ep.infectedProvinceIds.push(...Array.from(newlyInfected));

      for (const c of w.characters) {
        if (!c.isAlive || !c.provinceId) continue;
        if (ep.infectedProvinceIds.includes(c.provinceId)) {
          if (w.lockedDownProvinces.includes(c.provinceId)) continue;

          const traits = collectAllCharacterTraits(c);
          if (Math.random() < 0.08 && !traits.includes('Ill')) {
            if (!c.v17Traits) c.v17Traits = [...traits];
            if (!c.v17Traits.includes('Ill')) c.v17Traits.push('Ill');
            c.stress = Math.min(300, c.stress + 40);

            const healthMod = getHookMultiplier(traits, 'HEALTH');
            if (Math.random() < ep.lethality * healthMod) {
              killCharacter(c, ep.name, w, 'Disease & Illness');
            }
          }
        }
      }
    }
  }

  static toggleQuarantine(provId: string, w: WorldState): boolean {
    if (!w.lockedDownProvinces) w.lockedDownProvinces = [];
    const prov = w.provinces?.find((p) => p.id === provId);
    if (!prov) return false;

    const idx = w.lockedDownProvinces.indexOf(provId);
    if (idx >= 0) {
      w.lockedDownProvinces.splice(idx, 1);
      prov.isQuarantined = false;
      w.history.unshift({
        id: generateUniqueId('hist_quarantine_lifted'),
        year: w.currentYear,
        title: `Quarantine Lifted: ${prov.name}`,
        category: 'Dynastic Drama',
        description: `Gates in ${prov.name} were unbarred; commercial caravans and trade flow resume.`,
        realmId: prov.realmId,
      });
      return false;
    } else {
      w.lockedDownProvinces.push(provId);
      prov.isQuarantined = true;
      w.history.unshift({
        id: generateUniqueId('hist_quarantine_enforced'),
        year: w.currentYear,
        title: `Quarantine Enforced: ${prov.name}`,
        category: 'Dynastic Drama',
        description: `By royal decree, ${prov.name} is placed under strict lockdown to ward off pestilence.`,
        realmId: prov.realmId,
      });
      return true;
    }
  }
}

// ============================================
// 5B. INTER-STATE DIPLOMACY (ALLIES & ENEMIES)
// ============================================

export class RealmDiplomacyEngine {
  static ensureRealmDiplomacy(w: WorldState): void {
    for (const r of w.realms || []) {
      if (!r.alliedRealmIds) r.alliedRealmIds = [];
      if (!r.enemyRealmIds) r.enemyRealmIds = [];
      if (!r.diplomaticRelations) r.diplomaticRelations = {};
      if (!r.truceUntilYearByRealm) r.truceUntilYearByRealm = {};
    }
  }

  static isUnderTruce(realmAId: string, realmBId: string, w: WorldState): boolean {
    if (!realmAId || !realmBId || realmAId === realmBId) return false;
    const ra = w.realms?.find((r) => r.id === realmAId);
    const rb = w.realms?.find((r) => r.id === realmBId);
    const nowYear = w.currentYear || 0;
    const untilA = ra?.truceUntilYearByRealm?.[realmBId] || 0;
    const untilB = rb?.truceUntilYearByRealm?.[realmAId] || 0;
    return Math.max(untilA, untilB) > nowYear;
  }

  static setRealmTruce(realmAId: string, realmBId: string, years: number, w: WorldState): void {
    setRealmTruce(realmAId, realmBId, years, w);
  }

  static areRealmsAllied(realmAId: string, realmBId: string, w: WorldState): boolean {
    if (!realmAId || !realmBId || realmAId === realmBId) return false;
    const ra = w.realms?.find((r) => r.id === realmAId);
    const rb = w.realms?.find((r) => r.id === realmBId);
    return Boolean(ra?.alliedRealmIds?.includes(realmBId) || rb?.alliedRealmIds?.includes(realmAId));
  }

  static areRealmsEnemies(realmAId: string, realmBId: string, w: WorldState): boolean {
    if (!realmAId || !realmBId || realmAId === realmBId) return false;
    const ra = w.realms?.find((r) => r.id === realmAId);
    const rb = w.realms?.find((r) => r.id === realmBId);
    const atWar = (w.activeWars || []).some(
      (war) =>
        (war.attackerRealmId === realmAId && war.defenderRealmId === realmBId) ||
        (war.attackerRealmId === realmBId && war.defenderRealmId === realmAId)
    );
    return (
      atWar ||
      Boolean(ra?.enemyRealmIds?.includes(realmBId) || rb?.enemyRealmIds?.includes(realmAId))
    );
  }

  static getRealmRelation(realmAId: string, realmBId: string, w: WorldState): number {
    const ra = w.realms?.find((r) => r.id === realmAId);
    return ra?.diplomaticRelations?.[realmBId] ?? 0;
  }

  static adjustRealmRelation(realmAId: string, realmBId: string, delta: number, w: WorldState): void {
    if (!realmAId || !realmBId || realmAId === realmBId) return;
    RealmDiplomacyEngine.ensureRealmDiplomacy(w);
    const ra = w.realms?.find((r) => r.id === realmAId);
    const rb = w.realms?.find((r) => r.id === realmBId);
    if (!ra || !rb) return;
    ra.diplomaticRelations![realmBId] = Math.max(-100, Math.min(100, (ra.diplomaticRelations![realmBId] ?? 0) + delta));
    rb.diplomaticRelations![realmAId] = Math.max(-100, Math.min(100, (rb.diplomaticRelations![realmAId] ?? 0) + delta));
  }

  static seedInitialRealmDiplomacy(w: WorldState): void {
    RealmDiplomacyEngine.ensureRealmDiplomacy(w);
    const realms = w.realms || [];
    if (realms.length < 2) return;

    const alreadySeeded = realms.some(
      (r) =>
        (r.alliedRealmIds && r.alliedRealmIds.length > 0) ||
        (r.enemyRealmIds && r.enemyRealmIds.length > 0) ||
        (r.diplomaticRelations && Object.keys(r.diplomaticRelations).length > 0)
    );
    if (alreadySeeded) return;

    for (let i = 0; i < realms.length; i++) {
      for (let j = i + 1; j < realms.length; j++) {
        const ra = realms[i];
        const rb = realms[j];
        const ka = w.characters.find((c) => c.id === ra.rulerId);
        const kb = w.characters.find((c) => c.id === rb.rulerId);
        let rel = 0;
        if (ra.religion === rb.religion) rel += 15;
        if (ra.culture === rb.culture) rel += 12;
        if (ka && kb) {
          rel += Math.round(((ka.opinions?.[kb.id] ?? 0) + (kb.opinions?.[ka.id] ?? 0)) * 0.2);
          if (ka.spouseId === kb.id || kb.spouseId === ka.id) rel += 45;
        }
        const capA = w.burgs?.find((b) => b.id === ra.capitalBurgId);
        const capB = w.burgs?.find((b) => b.id === rb.capitalBurgId);
        const dist = capA && capB ? Math.hypot(capA.x - capB.x, capA.y - capB.y) : 300;
        // Close neighbors tend to have moderate border friction unless bound by marriage/kin
        if (dist < 230 && (!ka || !kb || ka.spouseId !== kb.id)) rel -= 12;

        rel = Math.max(-100, Math.min(100, rel));
        ra.diplomaticRelations![rb.id] = rel;
        rb.diplomaticRelations![ra.id] = rel;

        if (rel >= 28 || (ka && kb && ka.spouseId === kb.id)) {
          ra.alliedRealmIds!.push(rb.id);
          rb.alliedRealmIds!.push(ra.id);
        } else if (rel <= -35) {
          ra.enemyRealmIds!.push(rb.id);
          rb.enemyRealmIds!.push(ra.id);
        }
      }
    }
  }

  static forgeAlliance(
    realmAId: string,
    realmBId: string,
    w: WorldState,
    bypassNegotiation = false
  ): { success: boolean; summary: string } {
    if (realmAId === realmBId) return { success: false, summary: 'A realm cannot ally with itself.' };
    RealmDiplomacyEngine.ensureRealmDiplomacy(w);
    const ra = w.realms?.find((r) => r.id === realmAId);
    const rb = w.realms?.find((r) => r.id === realmBId);
    if (!ra || !rb) return { success: false, summary: 'Realm not found.' };

    const atWar = (w.activeWars || []).some(
      (war) =>
        (war.attackerRealmId === realmAId && war.defenderRealmId === realmBId) ||
        (war.attackerRealmId === realmBId && war.defenderRealmId === realmAId)
    );
    if (atWar) return { success: false, summary: 'Cannot forge an alliance while actively at war!' };

    if (RealmDiplomacyEngine.areRealmsAllied(realmAId, realmBId, w)) {
      return { success: false, summary: `${ra.name} and ${rb.name} are already bound by alliance.` };
    }

    if (!bypassNegotiation) {
      const consent = evaluateBilateralConsent(realmAId, realmBId, 'alliance', w);
      const evalRes = evaluateAllianceNegotiation(realmAId, realmBId, w);
      if (!consent.accepted || !evalRes.accepted) {
        return {
          success: false,
          summary: `${rb.name} declined Alliance (Mutual Consent ${consent.score >= 0 ? '+' : ''}${consent.score}): ${consent.reasons[0] || evalRes.reasons[0] || 'Requires stronger bilateral trust & House Prestige.'}`,
        };
      }
    }

    ra.enemyRealmIds = (ra.enemyRealmIds || []).filter((id) => id !== realmBId);
    rb.enemyRealmIds = (rb.enemyRealmIds || []).filter((id) => id !== realmAId);
    if (!ra.alliedRealmIds!.includes(realmBId)) ra.alliedRealmIds!.push(realmBId);
    if (!rb.alliedRealmIds!.includes(realmAId)) rb.alliedRealmIds!.push(realmAId);
    RealmDiplomacyEngine.adjustRealmRelation(realmAId, realmBId, 38, w);

    const ka = w.characters.find((c) => c.id === ra.rulerId);
    const kb = w.characters.find((c) => c.id === rb.rulerId);
    if (ka && kb) {
      if (!ka.opinions) ka.opinions = {};
      if (!kb.opinions) kb.opinions = {};
      ka.opinions[kb.id] = Math.min(100, (ka.opinions[kb.id] ?? 0) + 25);
      kb.opinions[ka.id] = Math.min(100, (kb.opinions[ka.id] ?? 0) + 25);
    }

    if (!w.history) w.history = [];
    w.history.unshift({
      id: generateUniqueId('hist_ally'),
      year: w.currentYear,
      title: `Grand Alliance: ${ra.name} & ${rb.name}`,
      category: 'Diplomacy',
      description: `${ra.name} and ${rb.name} sealed a solemn Pact of Mutual Defense, Free Trade, and Dynastic Friendship.`,
      primaryActorId: ka?.id,
      secondaryActorId: kb?.id,
      realmId: ra.id,
    });
    return { success: true, summary: `Alliance sealed between ${ra.name} and ${rb.name}! Trade & marriage pacts unlocked.` };
  }

  static breakAlliance(realmAId: string, realmBId: string, w: WorldState): { success: boolean; summary: string } {
    RealmDiplomacyEngine.ensureRealmDiplomacy(w);
    const ra = w.realms?.find((r) => r.id === realmAId);
    const rb = w.realms?.find((r) => r.id === realmBId);
    if (!ra || !rb) return { success: false, summary: 'Realm not found.' };
    ra.alliedRealmIds = (ra.alliedRealmIds || []).filter((id) => id !== realmBId);
    rb.alliedRealmIds = (rb.alliedRealmIds || []).filter((id) => id !== realmAId);
    RealmDiplomacyEngine.adjustRealmRelation(realmAId, realmBId, -35, w);

    const ka = w.characters.find((c) => c.id === ra.rulerId);
    const kb = w.characters.find((c) => c.id === rb.rulerId);
    if (ka && kb) {
      if (!ka.opinions) ka.opinions = {};
      if (!kb.opinions) kb.opinions = {};
      ka.opinions[kb.id] = Math.max(-100, (ka.opinions[kb.id] ?? 0) - 25);
      kb.opinions[ka.id] = Math.max(-100, (kb.opinions[ka.id] ?? 0) - 30);
    }
    return { success: true, summary: `Treaty of Alliance dissolved between ${ra.name} and ${rb.name}.` };
  }

  static declareRivalry(realmAId: string, realmBId: string, w: WorldState): { success: boolean; summary: string } {
    if (realmAId === realmBId) return { success: false, summary: 'Cannot rival oneself.' };
    RealmDiplomacyEngine.ensureRealmDiplomacy(w);
    const ra = w.realms?.find((r) => r.id === realmAId);
    const rb = w.realms?.find((r) => r.id === realmBId);
    if (!ra || !rb) return { success: false, summary: 'Realm not found.' };

    ra.alliedRealmIds = (ra.alliedRealmIds || []).filter((id) => id !== realmBId);
    rb.alliedRealmIds = (rb.alliedRealmIds || []).filter((id) => id !== realmAId);
    if (!ra.enemyRealmIds!.includes(realmBId)) ra.enemyRealmIds!.push(realmBId);
    if (!rb.enemyRealmIds!.includes(realmAId)) rb.enemyRealmIds!.push(realmAId);
    RealmDiplomacyEngine.adjustRealmRelation(realmAId, realmBId, -50, w);

    const ka = w.characters.find((c) => c.id === ra.rulerId);
    const kb = w.characters.find((c) => c.id === rb.rulerId);
    if (ka && kb) {
      if (!ka.opinions) ka.opinions = {};
      if (!kb.opinions) kb.opinions = {};
      ka.opinions[kb.id] = Math.max(-100, (ka.opinions[kb.id] ?? 0) - 40);
      kb.opinions[ka.id] = Math.max(-100, (kb.opinions[ka.id] ?? 0) - 45);
    }

    if (!w.history) w.history = [];
    w.history.unshift({
      id: generateUniqueId('hist_enemy'),
      year: w.currentYear,
      title: `State Enmity Proclaimed: ${ra.name} vs ${rb.name}`,
      category: 'Diplomacy',
      description: `${ra.name} proclaimed ${rb.name} a mortal Enemy of the Realm. Royal trade embargoes and dynastic bans take immediate effect.`,
      primaryActorId: ka?.id,
      secondaryActorId: kb?.id,
      realmId: ra.id,
    });
    return { success: true, summary: `${rb.name} proclaimed an Enemy State! Trade embargo & marriage ban active.` };
  }

  static endRivalry(
    realmAId: string,
    realmBId: string,
    w: WorldState,
    bypassConsent = false
  ): { success: boolean; summary: string } {
    RealmDiplomacyEngine.ensureRealmDiplomacy(w);
    const ra = w.realms?.find((r) => r.id === realmAId);
    const rb = w.realms?.find((r) => r.id === realmBId);
    if (!ra || !rb) return { success: false, summary: 'Realm not found.' };
    if (!bypassConsent) {
      const consent = evaluateBilateralConsent(realmAId, realmBId, 'end_rivalry', w);
      if (!consent.accepted) {
        return {
          success: false,
          summary: `${rb.name} refused to normalize relations (Consent ${consent.score >= 0 ? '+' : ''}${consent.score}): ${consent.reasons[0] || 'Dispatch envoys to thaw hostility before reconciling.'}`,
        };
      }
    }
    ra.enemyRealmIds = (ra.enemyRealmIds || []).filter((id) => id !== realmBId);
    rb.enemyRealmIds = (rb.enemyRealmIds || []).filter((id) => id !== realmAId);
    RealmDiplomacyEngine.adjustRealmRelation(realmAId, realmBId, 25, w);
    if (!w.history) w.history = [];
    w.history.unshift({
      id: generateUniqueId('hist_detente'),
      year: w.currentYear,
      title: `Détente Accord: ${ra.name} & ${rb.name}`,
      category: 'Diplomacy',
      description: `${ra.name} and ${rb.name} mutually ended their proclaimed state enmity and restored normal diplomatic standing.`,
      realmId: ra.id,
    });
    return { success: true, summary: `Mutual normalization ratified between ${ra.name} and ${rb.name}; enmity lifted.` };
  }

  static sendDiplomaticEnvoy(realmAId: string, realmBId: string, w: WorldState): { success: boolean; summary: string } {
    if (realmAId === realmBId) return { success: false, summary: 'Cannot dispatch envoy to your own court.' };
    RealmDiplomacyEngine.ensureRealmDiplomacy(w);
    const ra = w.realms?.find((r) => r.id === realmAId);
    const rb = w.realms?.find((r) => r.id === realmBId);
    if (!ra || !rb) return { success: false, summary: 'Realm not found.' };
    const atWar = (w.activeWars || []).some(
      (war) =>
        (war.attackerRealmId === realmAId && war.defenderRealmId === realmBId) ||
        (war.attackerRealmId === realmBId && war.defenderRealmId === realmAId)
    );
    if (atWar) {
      return { success: false, summary: `Envoys cannot pass while ${ra.name} and ${rb.name} are at open war.` };
    }
    const ka = w.characters.find((c) => c.id === ra.rulerId);
    const kb = w.characters.find((c) => c.id === rb.rulerId);
    if (!ka) return { success: false, summary: 'No sovereign ruler to dispatch envoy.' };
    const crownCash = ra.treasury ?? 0;
    const useCrown = crownCash >= 40;
    if (!useCrown && (ka.treasury ?? 0) < 40) {
      return { success: false, summary: 'Requires 40g in Crown Fisc or Privy Purse to dispatch an embassy.' };
    }

    if (useCrown) {
      ra.treasury = Math.round((crownCash - 40) * 10) / 10;
      recordRealmBudgetExtra(ra, w, 'diplomacyAndPatronage', 40);
    } else {
      ka.treasury = Math.max(0, (ka.treasury ?? 0) - 40);
    }
    const houseA = ka.houseName ? computeHouseProfile(ka.houseName, w) : null;
    const dipGain = Math.max(12, Math.min(30, Math.round(14 + (ka.baseDiplomacy || 10) * 0.5 + (houseA?.negotiatingPower ?? 0) * 0.35)));
    RealmDiplomacyEngine.adjustRealmRelation(realmAId, realmBId, dipGain, w);

    if (kb) {
      if (!kb.opinions) kb.opinions = {};
      if (!ka.opinions) ka.opinions = {};
      kb.opinions[ka.id] = Math.min(100, (kb.opinions[ka.id] ?? 0) + 15);
      ka.opinions[kb.id] = Math.min(100, (ka.opinions[kb.id] ?? 0) + 10);
    }

    return {
      success: true,
      summary: `Royal Embassy received in ${rb.name}: Bilateral relations improved by +${dipGain} (-40g).`,
    };
  }

  static sendForeignSubsidy(
    fromRealmId: string,
    toRealmId: string,
    amount: number,
    w: WorldState
  ): { success: boolean; summary: string } {
    if (fromRealmId === toRealmId) return { success: false, summary: 'Cannot subsidize your own realm.' };
    RealmDiplomacyEngine.ensureRealmDiplomacy(w);
    const ra = w.realms?.find((r) => r.id === fromRealmId);
    const rb = w.realms?.find((r) => r.id === toRealmId);
    if (!ra || !rb) return { success: false, summary: 'Realm not found.' };
    if (RealmDiplomacyEngine.areRealmsEnemies(fromRealmId, toRealmId, w)) {
      return { success: false, summary: `Cannot send war subsidies to proclaimed enemy ${rb.name}.` };
    }
    const subsidy = Math.max(25, Math.round(amount));
    const crownGold = ra.treasury ?? 0;
    if (crownGold < subsidy) {
      return { success: false, summary: `Insufficient Crown Fisc: sending ${subsidy}g subsidy requires ${subsidy}g (Available: ${Math.round(crownGold)}g).` };
    }

    ra.treasury = Math.round((crownGold - subsidy) * 10) / 10;
    rb.treasury = Math.round(((rb.treasury ?? 0) + subsidy) * 10) / 10;
    recordRealmBudgetExtra(ra, w, 'diplomacyAndPatronage', subsidy);

    const relGain = Math.min(28, Math.max(10, Math.round(subsidy / 8)));
    RealmDiplomacyEngine.adjustRealmRelation(fromRealmId, toRealmId, relGain, w);

    const ka = w.characters.find((c) => c.id === ra.rulerId);
    const kb = w.characters.find((c) => c.id === rb.rulerId);
    if (ka && kb) {
      kb.opinions = kb.opinions || {};
      kb.opinions[ka.id] = Math.min(100, (kb.opinions[ka.id] ?? 0) + Math.round(relGain * 0.8));
      ka.prestige = (ka.prestige || 100) + Math.min(25, Math.round(subsidy / 10));
    }

    if (!w.history) w.history = [];
    w.history.unshift({
      id: generateUniqueId('hist_subsidy'),
      year: w.currentYear,
      title: `Foreign Subsidy: ${ra.name} → ${rb.name}`,
      category: 'Diplomacy',
      description: `${ra.name} dispatched ${subsidy}g from the Crown Fisc to bolster ${rb.name}'s treasury (+${relGain} relations).`,
      primaryActorId: ka?.id,
      secondaryActorId: kb?.id,
      realmId: ra.id,
    });

    return {
      success: true,
      summary: `Sent ${subsidy}g Crown subsidy to ${rb.name} (+${relGain} relations).`,
    };
  }

  static signTradePact(
    realmAId: string,
    realmBId: string,
    w: WorldState,
    bypassConsent = false
  ): { success: boolean; summary: string } {
    if (realmAId === realmBId) return { success: false, summary: 'Cannot sign a trade pact with yourself.' };
    RealmDiplomacyEngine.ensureRealmDiplomacy(w);
    const ra = w.realms?.find((r) => r.id === realmAId);
    const rb = w.realms?.find((r) => r.id === realmBId);
    if (!ra || !rb) return { success: false, summary: 'Realm not found.' };
    if (RealmDiplomacyEngine.areRealmsEnemies(realmAId, realmBId, w)) {
      return { success: false, summary: `Trade Pact refused: ${ra.name} and ${rb.name} are proclaimed Enemies.` };
    }
    if ((ra.tradePactRealmIds || []).includes(realmBId)) {
      return { success: false, summary: `A Commercial Trade Pact is already active with ${rb.name}.` };
    }

    if (!bypassConsent) {
      const consent = evaluateBilateralConsent(realmAId, realmBId, 'trade_pact', w);
      if (!consent.accepted) {
        return {
          success: false,
          summary: `${rb.name} declined the Trade Pact (Consent ${consent.score >= 0 ? '+' : ''}${consent.score}): ${consent.reasons[0] || 'Insufficient bilateral goodwill or active embargo.'}`,
        };
      }
    }

    const ka = w.characters.find((c) => c.id === ra.rulerId);
    const kb = w.characters.find((c) => c.id === rb.rulerId);
    ra.tradePactRealmIds = Array.from(new Set([...(ra.tradePactRealmIds || []), realmBId]));
    rb.tradePactRealmIds = Array.from(new Set([...(rb.tradePactRealmIds || []), realmAId]));
    RealmDiplomacyEngine.adjustRealmRelation(realmAId, realmBId, 18, w);
    if (ka) ka.treasury = (ka.treasury ?? 0) + 15;
    if (kb) kb.treasury = (kb.treasury ?? 0) + 15;

    if (!w.history) w.history = [];
    w.history.unshift({
      id: generateUniqueId('hist_trade_pact'),
      year: w.currentYear,
      title: `Commercial Charter: ${ra.name} & ${rb.name}`,
      category: 'Diplomacy',
      description: `${ra.name} and ${rb.name} signed a reciprocal Trade & Tariff Charter, enriching merchant guilds across both realms (+18 relations).`,
      primaryActorId: ka?.id,
      secondaryActorId: kb?.id,
      realmId: ra.id,
    });

    return {
      success: true,
      summary: `Commercial Trade Pact ratified by both ${ra.name} and ${rb.name}! (+18 relations, +15g customs windfall).`,
    };
  }

  static signNonAggressionPact(
    realmAId: string,
    realmBId: string,
    w: WorldState,
    bypassConsent = false
  ): { success: boolean; summary: string } {
    if (realmAId === realmBId) return { success: false, summary: 'Invalid target realm.' };
    RealmDiplomacyEngine.ensureRealmDiplomacy(w);
    const ra = w.realms?.find((r) => r.id === realmAId);
    const rb = w.realms?.find((r) => r.id === realmBId);
    if (!ra || !rb) return { success: false, summary: 'Realm not found.' };
    if (RealmDiplomacyEngine.isUnderTruce(realmAId, realmBId, w)) {
      return { success: false, summary: `A truce or non-aggression pact is already active with ${rb.name}.` };
    }
    if (!bypassConsent) {
      const consent = evaluateBilateralConsent(realmAId, realmBId, 'non_aggression', w);
      if (!consent.accepted) {
        return {
          success: false,
          summary: `${rb.name} declined the Non-Aggression Pact (Consent ${consent.score >= 0 ? '+' : ''}${consent.score}): ${consent.reasons[0] || 'Hostility is too deep.'}`,
        };
      }
    }
    const ka = w.characters.find((c) => c.id === ra.rulerId);
    const kb = w.characters.find((c) => c.id === rb.rulerId);

    RealmDiplomacyEngine.setRealmTruce(realmAId, realmBId, 10, w);
    RealmDiplomacyEngine.adjustRealmRelation(realmAId, realmBId, 14, w);
    if (!w.history) w.history = [];
    w.history.unshift({
      id: generateUniqueId('hist_nap'),
      year: w.currentYear,
      title: `Non-Aggression Pact: ${ra.name} & ${rb.name}`,
      category: 'Diplomacy',
      description: `${ra.name} and ${rb.name} swore a 10-year Pact of Mutual Non-Aggression securing their shared marches.`,
      primaryActorId: ka?.id,
      secondaryActorId: kb?.id,
      realmId: ra.id,
    });

    return {
      success: true,
      summary: `10-year Non-Aggression Pact ratified with ${rb.name} (+14 relations).`,
    };
  }

  static imposeTradeEmbargo(realmAId: string, realmBId: string, w: WorldState): { success: boolean; summary: string } {
    if (realmAId === realmBId) return { success: false, summary: 'Cannot embargo your own realm.' };
    RealmDiplomacyEngine.ensureRealmDiplomacy(w);
    const ra = w.realms?.find((r) => r.id === realmAId);
    const rb = w.realms?.find((r) => r.id === realmBId);
    if (!ra || !rb) return { success: false, summary: 'Realm not found.' };
    if (!ra.embargoedRealmIds) ra.embargoedRealmIds = [];
    if (ra.embargoedRealmIds.includes(realmBId)) {
      return { success: false, summary: `A Trade Embargo is already enforced against ${rb.name}.` };
    }
    ra.embargoedRealmIds.push(realmBId);
    ra.tradePactRealmIds = (ra.tradePactRealmIds || []).filter((id) => id !== realmBId);
    rb.tradePactRealmIds = (rb.tradePactRealmIds || []).filter((id) => id !== realmAId);
    RealmDiplomacyEngine.adjustRealmRelation(realmAId, realmBId, -28, w);

    const ka = w.characters.find((c) => c.id === ra.rulerId);
    const kb = w.characters.find((c) => c.id === rb.rulerId);
    if (!w.history) w.history = [];
    w.history.unshift({
      id: generateUniqueId('hist_embargo'),
      year: w.currentYear,
      title: `Trade Embargo: ${ra.name} Closes Ports to ${rb.name}`,
      category: 'Diplomacy',
      description: `${ra.name} imposed a royal trade embargo against ${rb.name}, severing commercial pacts and halting cross-border merchant caravans.`,
      primaryActorId: ka?.id,
      secondaryActorId: kb?.id,
      realmId: ra.id,
    });
    return {
      success: true,
      summary: `Trade Embargo imposed on ${rb.name}! Merchant caravans halted & trade pacts voided (-28 relations).`,
    };
  }

  static liftTradeEmbargo(
    realmAId: string,
    realmBId: string,
    w: WorldState,
    bypassConsent = false
  ): { success: boolean; summary: string } {
    RealmDiplomacyEngine.ensureRealmDiplomacy(w);
    const ra = w.realms?.find((r) => r.id === realmAId);
    const rb = w.realms?.find((r) => r.id === realmBId);
    if (!ra || !rb) return { success: false, summary: 'Realm not found.' };
    if (!bypassConsent) {
      const consent = evaluateBilateralConsent(realmAId, realmBId, 'lift_embargo', w);
      if (!consent.accepted) {
        return {
          success: false,
          summary: `${rb.name} rejected the commercial thaw (Consent ${consent.score >= 0 ? '+' : ''}${consent.score}): ${consent.reasons[0] || 'Normalize state enmity first.'}`,
        };
      }
    }
    ra.embargoedRealmIds = (ra.embargoedRealmIds || []).filter((id) => id !== realmBId);
    rb.embargoedRealmIds = (rb.embargoedRealmIds || []).filter((id) => id !== realmAId);
    RealmDiplomacyEngine.adjustRealmRelation(realmAId, realmBId, 14, w);
    return {
      success: true,
      summary: `Mutual Trade Embargo between ${ra.name} and ${rb.name} lifted (+14 relations). Cross-border commerce may resume.`,
    };
  }

  static sendDiplomaticInsult(realmAId: string, realmBId: string, w: WorldState): { success: boolean; summary: string } {
    if (realmAId === realmBId) return { success: false, summary: 'Invalid target realm.' };
    RealmDiplomacyEngine.ensureRealmDiplomacy(w);
    const ra = w.realms?.find((r) => r.id === realmAId);
    const rb = w.realms?.find((r) => r.id === realmBId);
    if (!ra || !rb) return { success: false, summary: 'Realm not found.' };
    const ka = w.characters.find((c) => c.id === ra.rulerId);
    const kb = w.characters.find((c) => c.id === rb.rulerId);
    RealmDiplomacyEngine.adjustRealmRelation(realmAId, realmBId, -32, w);
    if (ka) {
      ka.dread = Math.min(100, (ka.dread || 0) + 8);
      ka.prestige = (ka.prestige || 0) + 35;
    }
    if (kb && ka) {
      if (!kb.opinions) kb.opinions = {};
      kb.opinions[ka.id] = Math.max(-100, (kb.opinions[ka.id] ?? 0) - 35);
    }
    if (!w.history) w.history = [];
    w.history.unshift({
      id: generateUniqueId('hist_insult'),
      year: w.currentYear,
      title: `Diplomatic Scorn: ${ra.name} Denounces ${rb.name}`,
      category: 'Diplomacy',
      description: `${ra.name} dispatched a scathing heraldic denunciation to the court of ${rb.name}, provoking severe tension (-32 relations).`,
      primaryActorId: ka?.id,
      secondaryActorId: kb?.id,
      realmId: ra.id,
    });
    return {
      success: true,
      summary: `Scathing denunciation sent to ${rb.name}! (+8 Dread, +35 Prestige, -32 relations).`,
    };
  }

  static demandTribute(realmAId: string, realmBId: string, w: WorldState): { success: boolean; summary: string } {
    if (realmAId === realmBId) return { success: false, summary: 'Invalid target realm.' };
    RealmDiplomacyEngine.ensureRealmDiplomacy(w);
    const ra = w.realms?.find((r) => r.id === realmAId);
    const rb = w.realms?.find((r) => r.id === realmBId);
    if (!ra || !rb) return { success: false, summary: 'Realm not found.' };
    const ka = w.characters.find((c) => c.id === ra.rulerId);
    const kb = w.characters.find((c) => c.id === rb.rulerId);
    if (!ka || !kb) return { success: false, summary: 'Both realms require active rulers.' };

    const houseA = computeHouseProfile(ka.houseName, w);
    const houseB = computeHouseProfile(kb.houseName, w);
    const powerGap = (houseA.influenceScore - houseB.influenceScore) + ((ra.countyIds?.length || 1) - (rb.countyIds?.length || 1)) * 6;
    if (powerGap >= 14 && (kb.treasury ?? 0) >= 40) {
      const tribute = Math.min(65, Math.round(kb.treasury ?? 40));
      kb.treasury = Math.max(0, (kb.treasury ?? 0) - tribute);
      ka.treasury = (ka.treasury ?? 0) + tribute;
      ka.prestige = (ka.prestige || 100) + 25;
      RealmDiplomacyEngine.adjustRealmRelation(realmAId, realmBId, -15, w);
      return {
        success: true,
        summary: `${rb.name} yielded to House ${ka.houseName}'s dominance and paid ${tribute}g in border tribute!`,
      };
    }

    RealmDiplomacyEngine.adjustRealmRelation(realmAId, realmBId, -25, w);
    if (!kb.opinions) kb.opinions = {};
    kb.opinions[ka.id] = Math.max(-100, (kb.opinions[ka.id] ?? 0) - 20);
    return {
      success: false,
      summary: `${rb.name} defiantly rejected the tribute demand! (-25 relations).`,
    };
  }

  static respondToProposal(
    proposalId: string,
    accept: boolean,
    w: WorldState
  ): { success: boolean; summary: string } {
    const proposals = w.pendingDiplomaticProposals || [];
    const idx = proposals.findIndex((p) => p.id === proposalId);
    if (idx === -1) return { success: false, summary: 'Diplomatic proposal not found or already answered.' };
    const proposal = proposals[idx];
    w.pendingDiplomaticProposals = proposals.filter((p) => p.id !== proposalId);

    const ra = w.realms?.find((r) => r.id === proposal.fromRealmId);
    const rb = w.realms?.find((r) => r.id === proposal.toRealmId);
    if (!ra || !rb) return { success: false, summary: 'Signatory realm no longer exists.' };

    if (!accept) {
      RealmDiplomacyEngine.adjustRealmRelation(proposal.fromRealmId, proposal.toRealmId, -6, w);
      return {
        success: true,
        summary: `Envoy from ${ra.name} dismissed; ${proposal.kind.replace('_', ' ')} proposal declined (-6 relations).`,
      };
    }

    switch (proposal.kind) {
      case 'alliance':
        return RealmDiplomacyEngine.forgeAlliance(proposal.fromRealmId, proposal.toRealmId, w, true);
      case 'trade_pact':
        return RealmDiplomacyEngine.signTradePact(proposal.fromRealmId, proposal.toRealmId, w, true);
      case 'non_aggression':
        return RealmDiplomacyEngine.signNonAggressionPact(proposal.fromRealmId, proposal.toRealmId, w, true);
      case 'end_rivalry':
        return RealmDiplomacyEngine.endRivalry(proposal.fromRealmId, proposal.toRealmId, w, true);
      case 'lift_embargo':
        return RealmDiplomacyEngine.liftTradeEmbargo(proposal.fromRealmId, proposal.toRealmId, w, true);
      default:
        return { success: false, summary: 'Unsupported diplomatic proposal kind.' };
    }
  }

  static queueProposalForPlayer(
    fromRealmId: string,
    toRealmId: string,
    kind: DiplomaticProposalKind,
    w: WorldState
  ): void {
    if (!w.pendingDiplomaticProposals) w.pendingDiplomaticProposals = [];
    if (w.pendingDiplomaticProposals.length >= 4) return;
    if (w.pendingDiplomaticProposals.some((p) => p.fromRealmId === fromRealmId && p.toRealmId === toRealmId && p.kind === kind)) {
      return;
    }
    const ra = w.realms?.find((r) => r.id === fromRealmId);
    const consent = evaluateBilateralConsent(fromRealmId, toRealmId, kind, w);
    const kindLabel: Record<DiplomaticProposalKind, string> = {
      alliance: 'Mutual Defensive Alliance',
      trade_pact: 'Commercial Trade Charter',
      non_aggression: '10-Year Non-Aggression Pact',
      end_rivalry: 'Mutual Normalization & Détente',
      lift_embargo: 'Mutual Embargo Repeal',
      peace: 'Negotiated Peace Settlement',
    };
    const prop: DiplomaticProposal = {
      id: generateUniqueId('prop'),
      fromRealmId,
      toRealmId,
      kind,
      year: w.currentYear,
      summary: `${ra?.name || 'Foreign Court'} proposes a ${kindLabel[kind]}.`,
      consentScore: consent.score,
      reasons: consent.reasons,
    };
    w.pendingDiplomaticProposals.push(prop);
  }

  static stepAI(w: WorldState): void {
    RealmDiplomacyEngine.ensureRealmDiplomacy(w);
    const realms = w.realms || [];
    if (realms.length < 2 || Math.random() > 0.12) return;

    const ra = realms[Math.floor(Math.random() * realms.length)];
    const others = realms.filter((r) => r.id !== ra.id);
    if (others.length === 0) return;
    const rb = others[Math.floor(Math.random() * others.length)];
    // Never autonomously initiate treaties *as* the player realm; if targeting the player realm, queue a proposal for player consent
    if (w.playerRealmId && ra.id === w.playerRealmId) {
      return;
    }
    const targetIsPlayer = Boolean(w.playerRealmId && rb.id === w.playerRealmId);
    const rel = RealmDiplomacyEngine.getRealmRelation(ra.id, rb.id, w);

    const ka = w.characters.find((c) => c.id === ra.rulerId && c.isAlive !== false);
    const kb = w.characters.find((c) => c.id === rb.rulerId && c.isAlive !== false);
    const tA = ka ? collectAllCharacterTraits(ka) : [];
    const tB = kb ? collectAllCharacterTraits(kb) : [];
    const courtA = computeAIStrategyWeight(tA, 'COURT_PROXIMITY');
    const courtB = computeAIStrategyWeight(tB, 'COURT_PROXIMITY');
    const dispA = computeDispositionModifiers(tA);
    const dispB = computeDispositionModifiers(tB);

    const friendlyTraitsA = tA.filter((t) => ['Gregarious', 'Forgiving', 'Compassionate', 'Just', 'Honest', 'Diplomat', 'Grey Eminence'].includes(t)).length;
    const friendlyTraitsB = tB.filter((t) => ['Gregarious', 'Forgiving', 'Compassionate', 'Just', 'Honest', 'Diplomat', 'Grey Eminence'].includes(t)).length;
    const hostileTraitsA = tA.filter((t) => ['Wrathful', 'Paranoid', 'Vengeful', 'Deceitful', 'Arrogant', 'Aggressive Attacker', 'Aggressive'].includes(t)).length;
    const hostileTraitsB = tB.filter((t) => ['Wrathful', 'Paranoid', 'Vengeful', 'Deceitful', 'Arrogant', 'Aggressive Attacker', 'Aggressive'].includes(t)).length;

    const sameReligion = ra.religion === rb.religion;
    const relObjA = (w.religions || []).find((r) => r.name === ra.religion);
    const relObjB = (w.religions || []).find((r) => r.name === rb.religion);
    const isSyncretic =
      Boolean(relObjA?.doctrine.toLowerCase().includes('syncretic')) ||
      Boolean(relObjB?.doctrine.toLowerCase().includes('syncretic'));
    const highZealFaith =
      (relObjA?.zealousness || 50) >= 72 || (relObjB?.zealousness || 50) >= 72;
    const zealousClash = !sameReligion && !isSyncretic && (tA.includes('Zealous') || tB.includes('Zealous') || highZealFaith);
    const sameSociety = Boolean(ra.societyType && rb.societyType && ra.societyType === rb.societyType);
    const sameGovCat = getGovernmentProfile(ra.government).category === getGovernmentProfile(rb.government).category;

    const traitAffinityBonus =
      (friendlyTraitsA + friendlyTraitsB) * 6 -
      (hostileTraitsA + hostileTraitsB) * 7 +
      (sameReligion ? 8 : zealousClash ? -22 : isSyncretic ? 0 : -4) +
      (sameSociety ? 4 : 0) +
      (sameGovCat ? 3 : 0);
    const effectiveRel = rel + traitAffinityBonus;

    const hasSharedEnemy = (ra.enemyRealmIds || []).some((eid) => (rb.enemyRealmIds || []).includes(eid));
    const atWar = (w.activeWars || []).some(
      (war) =>
        (war.attackerRealmId === ra.id && war.defenderRealmId === rb.id) ||
        (war.attackerRealmId === rb.id && war.defenderRealmId === ra.id)
    );
    if (atWar) return;

    if (!RealmDiplomacyEngine.areRealmsAllied(ra.id, rb.id, w) && !RealmDiplomacyEngine.areRealmsEnemies(ra.id, rb.id, w)) {
      const allyLikelihood = Math.min(
        0.75,
        Math.max(
          0.02,
          0.22 * ((courtA + courtB) * 0.5) * (1 + (friendlyTraitsA + friendlyTraitsB) * 0.25) -
            (hostileTraitsA + hostileTraitsB) * 0.08 -
            (zealousClash ? 0.20 : 0)
        )
      );
      const rivalryLikelihood = Math.min(
        0.65,
        Math.max(
          0.02,
          0.16 * ((dispA.par_mult + dispB.par_mult) * 0.5) * (1 + (hostileTraitsA + hostileTraitsB) * 0.35 + (zealousClash ? 0.5 : 0)) -
            (friendlyTraitsA + friendlyTraitsB) * 0.05
        )
      );

      if ((effectiveRel >= 22 || hasSharedEnemy) && !zealousClash && (ra.alliedRealmIds?.length || 0) < 2 && Math.random() < allyLikelihood) {
        if (targetIsPlayer) {
          RealmDiplomacyEngine.queueProposalForPlayer(ra.id, rb.id, 'alliance', w);
        } else {
          RealmDiplomacyEngine.forgeAlliance(ra.id, rb.id, w);
        }
      } else if (
        !(ra.tradePactRealmIds || []).includes(rb.id) &&
        effectiveRel >= 10 &&
        Math.random() < 0.24
      ) {
        if (targetIsPlayer) {
          RealmDiplomacyEngine.queueProposalForPlayer(ra.id, rb.id, 'trade_pact', w);
        } else {
          RealmDiplomacyEngine.signTradePact(ra.id, rb.id, w);
        }
      } else if (
        !targetIsPlayer &&
        (effectiveRel <= -28 || (zealousClash && effectiveRel <= -10)) &&
        !RealmDiplomacyEngine.isUnderTruce(ra.id, rb.id, w) &&
        (ra.enemyRealmIds?.length || 0) < 2 &&
        Math.random() < rivalryLikelihood
      ) {
        RealmDiplomacyEngine.declareRivalry(ra.id, rb.id, w);
      }
    } else if (targetIsPlayer && RealmDiplomacyEngine.areRealmsEnemies(ra.id, rb.id, w) && rel >= -15 && Math.random() < 0.15) {
      RealmDiplomacyEngine.queueProposalForPlayer(ra.id, rb.id, 'end_rivalry', w);
    }
  }
}

// ============================================
// 5C. ARMY COMMAND & BATTLE STRATEGY ENGINE
// ============================================

export class ArmyCommandEngine {
  static getEligibleCommanders(realmId: string, w: WorldState): Character[] {
    const tierRank: Record<string, number> = {
      Emperor: 6,
      King: 5,
      Duke: 4,
      Count: 3,
      Baron: 2,
      Mayor: 1,
      Commoner: 0,
    };
    return (w.characters || [])
      .filter(
        (c) =>
          c.isAlive !== false &&
          !c.isImprisoned &&
          !c.isMonk &&
          c.realmId === realmId &&
          (c.titleTier !== 'Commoner' || ['Marshal', 'Court Champion', 'Captain of the Guard', 'Hedge Knight'].includes(c.role))
      )
      .sort((a, b) => {
        const ra = (a.role === 'Marshal' ? 1 : 0) + (tierRank[a.titleTier || 'Commoner'] || 0);
        const rb = (b.role === 'Marshal' ? 1 : 0) + (tierRank[b.titleTier || 'Commoner'] || 0);
        if (rb !== ra) return rb - ra;
        return (b.baseMartial || 10) - (a.baseMartial || 10);
      });
  }

  static pickDefaultCommander(leader: Character, realmId: string, w: WorldState): Character {
    const eligible = ArmyCommandEngine.getEligibleCommanders(realmId, w);
    const marshal = eligible.find((c) => c.role === 'Marshal');
    if (marshal && (marshal.baseMartial || 10) >= (leader.baseMartial || 10)) return marshal;
    const bestNoble = eligible.find(
      (c) => (c.titleTier === 'Duke' || c.titleTier === 'Count') && (c.baseMartial || 10) >= 12
    );
    return bestNoble || leader;
  }

  static assignArmyCommander(
    armyId: string,
    commanderId: string,
    w: WorldState
  ): { success: boolean; summary: string } {
    const army = (w.armies || []).find((a) => a.id === armyId);
    const commander = (w.characters || []).find((c) => c.id === commanderId && c.isAlive !== false);
    if (!army || !commander) return { success: false, summary: 'Army or living noble commander not found.' };

    const prevCmd = army.commanderId ? w.characters.find((c) => c.id === army.commanderId) : undefined;
    const realm = w.realms?.find((r) => r.id === commander.realmId);
    const monarch = realm ? w.characters.find((c) => c.id === realm.rulerId) : undefined;

    if (prevCmd && prevCmd.id !== commander.id && monarch && prevCmd.id !== monarch.id) {
      if (!prevCmd.opinions) prevCmd.opinions = {};
      prevCmd.opinions[monarch.id] = Math.max(-100, (prevCmd.opinions[monarch.id] ?? 0) - 8);
    }

    const titleBadge = getCharacterRankTitle(commander, w);

    army.commanderId = commander.id;
    army.commanderName = `${titleBadge} ${commander.name}`;

    if (monarch && commander.id !== monarch.id) {
      if (!commander.opinions) commander.opinions = {};
      commander.opinions[monarch.id] = Math.min(100, (commander.opinions[monarch.id] ?? 0) + 10);
      commander.prestige = (commander.prestige || 100) + 15;
    }
    return { success: true, summary: `Assigned ${army.commanderName} (Martial ${commander.baseMartial}) to command field host.` };
  }

  static setArmyTactic(armyId: string, tactic: BattleTactic, w: WorldState): { success: boolean; summary: string } {
    const army = (w.armies || []).find((a) => a.id === armyId);
    if (!army) return { success: false, summary: 'Army not found.' };
    army.tactic = tactic;
    return { success: true, summary: `Battle doctrine set to ${tactic}.` };
  }

  static orderArmyMarch(
    armyId: string,
    targetX: number,
    targetY: string | number,
    holdingOrBurgId: string | undefined,
    w: WorldState
  ): { success: boolean; summary: string } {
    const destY = typeof targetY === 'number' ? targetY : Number(targetY);
    const army = (w.armies || []).find((a) => a.id === armyId);
    if (!army) return { success: false, summary: 'Field host not found.' };

    const curPos = getArmyPositionAtProgress(army);
    const march = computeArmyMarchPath(curPos.x, curPos.y, targetX, destY, w);

    army.startX = curPos.x;
    army.startY = curPos.y;
    army.targetX = targetX;
    army.targetY = destY;
    army.waypoints = march.waypoints;
    army.totalMarchCost = march.totalMarchCost;
    army.speed = march.speed;
    army.progress = 0;
    army.isReturning = false;
    army.isPlayerControlled = true;
    army.orderType = 'manual_march';

    if (holdingOrBurgId) {
      const resolvedHolding =
        w.holdings?.find(
          (h) => h.id === holdingOrBurgId || h.id === `holding_${holdingOrBurgId}`
        ) ||
        w.holdings?.find((h) => h.provinceId === holdingOrBurgId);
      if (resolvedHolding) {
        army.targetHoldingId = resolvedHolding.id;
      }
    }

    // Lift any active siege tied solely to this marching army
    if (w.activeSieges) {
      w.activeSieges = w.activeSieges.filter((s) => s.besiegerArmyId !== army.id);
    }

    const destBurg = w.burgs?.find(
      (b) => b.id === holdingOrBurgId || `holding_${b.id}` === army.targetHoldingId
    );
    return {
      success: true,
      summary: `${army.commanderName || 'Host'} ordered to march on ${destBurg?.name || 'selected coordinates'}.`,
    };
  }
}

// ============================================
// 6. CLAIMS, MARCHING ARMIES & WARFARE
// ============================================

export class ClaimAndWarEngine {
  static findActiveWarBetweenRealms(realmAId: string, realmBId: string, w: WorldState) {
    return (w.activeWars || []).find(
      (war) =>
        (war.attackerRealmId === realmAId && war.defenderRealmId === realmBId) ||
        (war.attackerRealmId === realmBId && war.defenderRealmId === realmAId)
    );
  }

  static fabricateClaim(c: Character, targetHolding: Holding, w: WorldState): boolean {
    const cost = 300;
    if ((c.treasury || 0) < cost) return false;
    c.treasury = (c.treasury || 0) - cost;

    if (!c.claims) c.claims = [];
    if (c.claims.some((cl) => cl.holdingId === targetHolding.id)) return false;
    c.claims.push({
      holdingId: targetHolding.id,
      claimantId: c.id,
      isPressed: false,
      isStrong: false,
    });

    if (!w.history) w.history = [];
    w.history.unshift({
      id: generateUniqueId('hist_fab_claim'),
      year: w.currentYear,
      title: `Claim Fabricated: ${targetHolding.name}`,
      category: 'Dynastic Drama',
      description: `Through forged genealogical scrolls and secret bribes, ${c.name} manufactured a legal claim on ${targetHolding.name}!`,
      primaryActorId: c.id,
      realmId: c.realmId,
    });

    return true;
  }

  static declareClaimantWar(
    attacker: Character,
    claim: Claim,
    w: WorldState
  ): { won: boolean; summary: string } {
    if (claim.revokedByDecree) {
      return { won: false, summary: 'This ancestral claim was revoked by Royal Decree and cannot be pressed.' };
    }
    const holding = w.holdings?.find((h) => h.id === claim.holdingId);
    if (!holding || !holding.ownerId) return { won: false, summary: 'Holding has no ruler.' };
    const defender = w.characters.find((c) => c.id === holding.ownerId);
    if (!defender || defender.id === attacker.id) return { won: false, summary: 'Invalid defender.' };

    if (
      attacker.realmId !== defender.realmId &&
      RealmDiplomacyEngine.areRealmsAllied(attacker.realmId, defender.realmId, w)
    ) {
      return {
        won: false,
        summary: 'Cannot declare war against an Allied state! Dissolve the alliance first.',
      };
    }

    const activeBetween =
      attacker.realmId !== defender.realmId
        ? ClaimAndWarEngine.findActiveWarBetweenRealms(attacker.realmId, defender.realmId, w)
        : undefined;
    if (
      attacker.realmId !== defender.realmId &&
      !activeBetween &&
      RealmDiplomacyEngine.isUnderTruce(attacker.realmId, defender.realmId, w)
    ) {
      return {
        won: false,
        summary: 'Cannot declare war while bound by a Peace Truce.',
      };
    }

    if (!w.armies) w.armies = [];
    if (!w.activeWars) w.activeWars = [];

    const attackerBurg = w.burgs?.find((b) => b.ownerId === attacker.id || (b.isCapital && b.stateId === attacker.realmId));
    const defBurg = w.burgs?.find((b) => `holding_${b.id}` === holding.id || b.id === holding.id);

    const attackerProv =
      w.provinces?.find((p) => p.id === attacker.provinceId) ||
      w.provinces?.find((p) => p.id === attackerBurg?.countyId) ||
      w.provinces?.find((p) => p.realmId === attacker.realmId) ||
      w.provinces?.[0];
    const defProv =
      w.provinces?.find((p) => p.id === holding.provinceId) ||
      w.provinces?.find((p) => p.id === defBurg?.countyId) ||
      w.provinces?.find((p) => p.realmId === defender.realmId) ||
      w.provinces?.[0];
    if (!attackerProv || !defProv) return { won: false, summary: 'Location unknown.' };

    const startX = attackerBurg?.x ?? attackerProv.capitalX;
    const startY = attackerBurg?.y ?? attackerProv.capitalY;
    const targetX = defBurg?.x ?? defProv.capitalX;
    const targetY = defBurg?.y ?? defProv.capitalY;

    const attackerRealm = w.realms.find((r) => r.id === attacker.realmId);
    const defenderRealm = w.realms.find((r) => r.id === defender.realmId);

    const newCbLabel = `Claim on ${holding.name}`;
    const newCbEntry: CasusBelliEntry = {
      type: 'Claim Conquest',
      label: newCbLabel,
      targetHoldingId: holding.id,
      claimantId: attacker.id,
    };

    // ENFORCE SINGLE CONSOLIDATED WAR PER PAIR OF COUNTRIES
    const existingWar =
      attacker.realmId !== defender.realmId
        ? ClaimAndWarEngine.findActiveWarBetweenRealms(attacker.realmId, defender.realmId, w)
        : w.activeWars.find(
            (war) =>
              (war.attackerLeaderId === attacker.id && war.defenderLeaderId === defender.id) ||
              (war.attackerLeaderId === defender.id && war.defenderLeaderId === attacker.id)
          );

    if (existingWar) {
      if (existingWar.targetHoldingIds.includes(holding.id)) {
        return { won: false, summary: 'This Casus Belli is already contested in the ongoing war.' };
      }

      if (!existingWar.casusBellis || existingWar.casusBellis.length === 0) {
        existingWar.casusBellis = existingWar.targetHoldingIds.map((hid) => ({
          type: 'Claim Conquest',
          label: existingWar.casusBelli,
          targetHoldingId: hid,
          claimantId: existingWar.attackerLeaderId,
        }));
      }
      existingWar.casusBellis.push(newCbEntry);
      existingWar.targetHoldingIds.push(holding.id);
      existingWar.casusBelli =
        existingWar.casusBellis.length > 1
          ? `${existingWar.casusBellis.length} Casus Bellis: ${existingWar.casusBellis
              .slice(0, 2)
              .map((c) => c.label)
              .join(' + ')}${existingWar.casusBellis.length > 2 ? '…' : ''}`
          : newCbLabel;

      const isOriginalAttackerSide = existingWar.attackerRealmId === attacker.realmId;
      const marchPath = computeArmyMarchPath(startX, startY, targetX, targetY, w);
      const atkCmd = ArmyCommandEngine.pickDefaultCommander(attacker, attacker.realmId, w);
      const standing = calculateCharacterFeudalStanding(attacker, w);
      const mil = Math.max(70, Math.round((standing.menAtArms + standing.demesneLevies * 0.55) * 0.75));
      w.armies.push({
        id: generateUniqueId('army_cb'),
        warId: existingWar.id,
        realmId: attacker.realmId,
        commanderId: atkCmd.id,
        commanderName: `${getCharacterRankTitle(atkCmd, w)} ${atkCmd.name}`,
        attackerId: attacker.id,
        defenderId: defender.id,
        targetHoldingId: holding.id,
        regiments: buildArmyRegiments(atkCmd, mil, w, attacker.realmId),
        startX,
        startY,
        targetX,
        targetY,
        waypoints: marchPath.waypoints,
        totalMarchCost: marchPath.totalMarchCost,
        progress: 0,
        strength: mil,
        speed: marchPath.speed,
        color: attackerRealm?.color || '#dc2626',
        claim,
        isDefender: !isOriginalAttackerSide,
        tactic: pickSmartBattleTactic(undefined, defProv.terrain || 'Plains', !isOriginalAttackerSide, atkCmd),
      });

      if (!w.history) w.history = [];
      w.history.unshift({
        id: generateUniqueId('hist_war_cb'),
        year: w.currentYear,
        title: `War Escalated: ${newCbLabel}`,
        category: 'War & Conquest',
        description: `${attacker.name} pressed an additional Casus Belli (${newCbLabel}) into the single ongoing war between ${attackerRealm?.name || 'Aggressor'} and ${defenderRealm?.name || 'Defender'}.`,
        primaryActorId: attacker.id,
        secondaryActorId: defender.id,
        realmId: attacker.realmId,
      });

      return {
        won: true,
        summary: `Added Casus Belli (${newCbLabel}) to the active war! Both claims will be settled by its outcome.`,
      };
    }

    const warId = generateUniqueId('war');

    // 1. REGISTER THE SINGLE STRATEGIC WAR
    w.activeWars.push({
      id: warId,
      attackerRealmId: attacker.realmId,
      defenderRealmId: defender.realmId,
      attackerLeaderId: attacker.id,
      defenderLeaderId: defender.id,
      casusBelli: newCbLabel,
      casusBellis: [newCbEntry],
      warScore: 0,
      monthsActive: 0,
      targetHoldingIds: [holding.id],
      battlesFought: 0,
      alliedRealmIds: [],
    });

    // 2. SPAWN ATTACKER ARMY (Road & Terrain Weighted Pathfinding + Noble Commander)
    const atkCmd = ArmyCommandEngine.pickDefaultCommander(attacker, attacker.realmId, w);
    const atkPath = computeArmyMarchPath(startX, startY, targetX, targetY, w);

    const attackerStanding = calculateCharacterFeudalStanding(attacker, w);
    const attackerMil = Math.max(
      80,
      Math.round(
        attackerStanding.menAtArms +
          attackerStanding.demesneLevies * 0.75 +
          attackerStanding.vassalLevies * 0.65
      )
    );
    const regiments = buildArmyRegiments(atkCmd, attackerMil, w, attacker.realmId);

    w.armies.push({
      id: generateUniqueId('army_atk'),
      warId,
      realmId: attacker.realmId,
      commanderId: atkCmd.id,
      commanderName: `${getCharacterRankTitle(atkCmd, w)} ${atkCmd.name}`,
      attackerId: attacker.id,
      defenderId: defender.id,
      targetHoldingId: holding.id,
      regiments,
      startX,
      startY,
      targetX,
      targetY,
      waypoints: atkPath.waypoints,
      totalMarchCost: atkPath.totalMarchCost,
      progress: 0,
      strength: attackerMil,
      speed: atkPath.speed,
      color: attackerRealm?.color || '#dc2626',
      claim: claim,
      isDefender: false,
      tactic: pickSmartBattleTactic(undefined, defProv.terrain || 'Plains', false, atkCmd),
    });

    // 3. DEFENDER MUSTERS RELIEF COUNTER-HOST (From defender's realm capital along roads)
    const defenderStanding = calculateCharacterFeudalStanding(defender, w);
    const defenderMil = Math.max(
      60,
      Math.round(
        defenderStanding.menAtArms +
          defenderStanding.demesneLevies * 0.80 +
          defenderStanding.vassalLevies * 0.70
      )
    );
    if (defenderMil > 50) {
      const defCmd = ArmyCommandEngine.pickDefaultCommander(defender, defender.realmId, w);
      const defCapitalBurg = w.burgs?.find((b) => b.id === defenderRealm?.capitalBurgId || b.ownerId === defender.id);
      const defStartX = defCapitalBurg?.x ?? targetX;
      const defStartY = defCapitalBurg?.y ?? targetY;
      const defPath = computeArmyMarchPath(defStartX, defStartY, targetX, targetY, w);
      const defRegiments = buildArmyRegiments(defCmd, defenderMil, w, defender.realmId);
      w.armies.push({
        id: generateUniqueId('army_def'),
        warId,
        realmId: defender.realmId,
        commanderId: defCmd.id,
        commanderName: `${getCharacterRankTitle(defCmd, w)} ${defCmd.name}`,
        attackerId: defender.id,
        defenderId: attacker.id,
        targetHoldingId: holding.id,
        regiments: defRegiments,
        startX: defStartX,
        startY: defStartY,
        targetX,
        targetY,
        waypoints: defPath.waypoints,
        totalMarchCost: defPath.totalMarchCost,
        progress: Math.hypot(defStartX - targetX, defStartY - targetY) < 25 ? 0.5 : 0.08,
        strength: defenderMil,
        speed: defPath.speed,
        color: defenderRealm?.color || '#2563eb',
        isDefender: true,
        tactic: pickSmartBattleTactic(undefined, defProv.terrain || 'Plains', true, defCmd),
      });
    }

    // 4. CALL STATE ALLIES & MARITAL ALLIES TO ARMS
    const warRec = w.activeWars[w.activeWars.length - 1];
    const calledRealmSet = new Set<string>([attacker.realmId, defender.realmId]);

    const summonAllyRealm = (allyRealmId: string, isDefendingSide: boolean, allyReason: string) => {
      if (calledRealmSet.has(allyRealmId)) return;
      const allyRealm = w.realms.find((r) => r.id === allyRealmId);
      const allyKing = w.characters.find((c) => c.id === allyRealm?.rulerId && c.isAlive);
      if (!allyRealm || !allyKing) return;
      calledRealmSet.add(allyRealmId);
      warRec.alliedRealmIds?.push(allyRealmId);

      const allyCmd = ArmyCommandEngine.pickDefaultCommander(allyKing, allyRealm.id, w);
      const allyCapBurg = w.burgs?.find((b) => b.id === allyRealm.capitalBurgId);
      const allyProv = w.provinces?.find((p) => p.id === allyKing.provinceId || p.realmId === allyRealm.id) || attackerProv;
      const ax = allyCapBurg?.x ?? allyProv.capitalX;
      const ay = allyCapBurg?.y ?? allyProv.capitalY;
      const allyPath = computeArmyMarchPath(ax, ay, targetX, targetY, w);
      const allyStanding = calculateCharacterFeudalStanding(allyKing, w);
      const allyMil = Math.max(60, Math.round((allyStanding.menAtArms + allyStanding.demesneLevies * 0.55) * 0.72));

      w.armies!.push({
        id: generateUniqueId('army_ally'),
        warId,
        realmId: allyRealm.id,
        commanderId: allyCmd.id,
        commanderName: `${allyReason} ${allyCmd.name}`,
        attackerId: isDefendingSide ? defender.id : attacker.id,
        defenderId: isDefendingSide ? attacker.id : defender.id,
        targetHoldingId: holding.id,
        regiments: buildArmyRegiments(allyCmd, allyMil, w, allyKing.realmId),
        startX: ax,
        startY: ay,
        targetX,
        targetY,
        waypoints: allyPath.waypoints,
        totalMarchCost: allyPath.totalMarchCost,
        progress: 0,
        strength: allyMil,
        speed: allyPath.speed,
        color: allyRealm.color || '#f59e0b',
        isDefender: isDefendingSide,
        tactic: pickSmartBattleTactic(undefined, defProv.terrain || 'Plains', isDefendingSide, allyCmd),
      });
    };

    for (const allyId of attackerRealm?.alliedRealmIds || []) {
      if (!RealmDiplomacyEngine.areRealmsAllied(allyId, defender.realmId, w)) {
        summonAllyRealm(allyId, false, 'Allied');
      }
    }
    for (const allyId of defenderRealm?.alliedRealmIds || []) {
      if (!RealmDiplomacyEngine.areRealmsAllied(allyId, attacker.realmId, w)) {
        summonAllyRealm(allyId, true, 'Allied');
      }
    }

    if (attacker.spouseId) {
      const spouse = w.characters.find((c) => c.id === attacker.spouseId && c.isAlive);
      if (spouse && spouse.realmId !== attacker.realmId && !RealmDiplomacyEngine.areRealmsEnemies(spouse.realmId, attacker.realmId, w)) {
        const allyRealm = w.realms.find((r) => r.id === spouse.realmId);
        const allyKing = w.characters.find((c) => c.id === allyRealm?.rulerId && c.isAlive);
        const allyOpinion = allyKing ? (allyKing.opinions?.[attacker.id] ?? 15) : -100;
        if (allyRealm && allyKing && allyKing.id !== attacker.id && allyOpinion >= -10 && Math.random() < 0.72) {
          summonAllyRealm(allyRealm.id, false, 'Marital Ally');
        }
      }
    }
    if (defender.spouseId) {
      const defSpouse = w.characters.find((c) => c.id === defender.spouseId && c.isAlive);
      if (
        defSpouse &&
        defSpouse.realmId !== defender.realmId &&
        defSpouse.realmId !== attacker.realmId &&
        !RealmDiplomacyEngine.areRealmsEnemies(defSpouse.realmId, defender.realmId, w) &&
        !RealmDiplomacyEngine.areRealmsAllied(defSpouse.realmId, attacker.realmId, w)
      ) {
        const allyRealm = w.realms.find((r) => r.id === defSpouse.realmId);
        const allyKing = w.characters.find((c) => c.id === allyRealm?.rulerId && c.isAlive);
        const allyOpinion = allyKing ? (allyKing.opinions?.[defender.id] ?? 15) : -100;
        if (allyRealm && allyKing && allyKing.id !== defender.id && allyOpinion >= -10 && Math.random() < 0.72) {
          summonAllyRealm(allyRealm.id, true, 'Marital Ally');
        }
      }
    }

    // Immediate diplomatic fallout
    RealmDiplomacyEngine.adjustRealmRelation(attacker.realmId, defender.realmId, -45, w);
    if (!defender.opinions) defender.opinions = {};
    defender.opinions[attacker.id] = Math.max(-100, (defender.opinions[attacker.id] ?? 0) - 45);
    if (!attacker.opinions) attacker.opinions = {};
    attacker.opinions[defender.id] = Math.max(-100, (attacker.opinions[defender.id] ?? 0) - 35);

    if (!w.history) w.history = [];
    const warTitle = `War for ${holding.name}: ${attackerRealm?.name || attacker.name} vs. ${defenderRealm?.name || defender.name}`;
    const activeWarObj = w.activeWars.find((wr) => wr.id === warId);
    const allyNames = (activeWarObj?.alliedRealmIds || [])
      .map((rid) => w.realms.find((r) => r.id === rid)?.name)
      .filter((n): n is string => Boolean(n));
    w.history.unshift({
      id: generateUniqueId('hist_war_decl'),
      year: w.currentYear,
      title: warTitle,
      category: 'War & Conquest',
      description: `${attacker.name} (${attackerRealm?.name || 'Crown'}) pressed a claim on ${holding.name} held by ${defender.name} (${defenderRealm?.name || 'Rival Crown'}). Armies mobilized across the marches.`,
      primaryActorId: attacker.id,
      secondaryActorId: defender.id,
      realmId: attacker.realmId,
      warRecord: {
        warId,
        warTitle,
        casusBelli: newCbLabel,
        attackerRealmId: attacker.realmId,
        attackerRealmName: attackerRealm?.name || 'Aggressor Realm',
        defenderRealmId: defender.realmId,
        defenderRealmName: defenderRealm?.name || 'Defender Realm',
        attackerLeaderName: attacker.name,
        defenderLeaderName: defender.name,
        startYear: w.currentYear,
        status: 'Ongoing',
        battlesFought: 0,
        totalCasualties: 0,
        alliesInvolved: allyNames,
        chapters: [
          {
            year: w.currentYear,
            title: `Outbreak of War: ${newCbLabel}`,
            summary: `${attacker.name} of ${attackerRealm?.name || 'the Crown'} formally declared war upon ${defender.name} of ${defenderRealm?.name || 'the Rival Crown'} to enforce ${newCbLabel}.${allyNames.length > 0 ? ` Allied banners summoned: ${allyNames.join(', ')}.` : ''}`,
          },
        ],
      },
    });

    const summary = `WAR DECLARED: ${atkCmd.name} leads ${attackerRealm?.name || 'the Crown'}'s host along the roads toward ${holding.name}! ${defender.name} has rallied a counter-host!`;
    return { won: true, summary };
  }

  static declareBorderWar(
    attackerRealmId: string,
    defenderRealmId: string,
    w: WorldState
  ): { won: boolean; summary: string } {
    if (attackerRealmId === defenderRealmId) {
      return { won: false, summary: 'A realm cannot declare border war upon itself.' };
    }
    if (RealmDiplomacyEngine.areRealmsAllied(attackerRealmId, defenderRealmId, w)) {
      return { won: false, summary: 'Cannot declare border war against an Allied state! Break the alliance first.' };
    }
    const existingWar = ClaimAndWarEngine.findActiveWarBetweenRealms(attackerRealmId, defenderRealmId, w);
    if (!existingWar && RealmDiplomacyEngine.isUnderTruce(attackerRealmId, defenderRealmId, w)) {
      return { won: false, summary: 'Cannot declare border war while bound by a Peace Truce.' };
    }
    const attackerRealm = w.realms.find((r) => r.id === attackerRealmId);
    const defenderRealm = w.realms.find((r) => r.id === defenderRealmId);
    const attacker = w.characters.find((c) => c.id === attackerRealm?.rulerId && c.isAlive);
    if (!attacker || !defenderRealm) return { won: false, summary: 'Sovereign leader unavailable.' };

    const alreadyTargeted = new Set(existingWar?.targetHoldingIds || []);

    const targetBurg =
      w.burgs.find((b) => b.stateId === defenderRealmId && !b.isCapital && !alreadyTargeted.has(`holding_${b.id}`)) ||
      w.burgs.find((b) => b.stateId === defenderRealmId && !alreadyTargeted.has(`holding_${b.id}`)) ||
      w.burgs.find((b) => b.stateId === defenderRealmId);
    const targetHolding = targetBurg
      ? w.holdings?.find((h) => h.id === `holding_${targetBurg.id}` || h.id === targetBurg.id || h.name.startsWith(targetBurg.name))
      : w.holdings?.find((h) => {
          const owner = w.characters.find((c) => c.id === h.ownerId);
          return owner?.realmId === defenderRealmId && !alreadyTargeted.has(h.id);
        });

    if (!targetHolding) return { won: false, summary: 'No further contested holding found in target realm.' };

    const claim: Claim = {
      holdingId: targetHolding.id,
      claimantId: attacker.id,
      isPressed: true,
      isStrong: true,
    };
    if (!attacker.claims) attacker.claims = [];
    if (!attacker.claims.some((cl) => cl.holdingId === targetHolding.id)) {
      attacker.claims.push(claim);
    }
    return ClaimAndWarEngine.declareClaimantWar(attacker, claim, w);
  }

  static resolveWarPeace(
    warId: string,
    outcome: 'attacker_win' | 'defender_win' | 'white_peace',
    w: WorldState
  ): { resolved: boolean; summary: string } {
    const warIdx = (w.activeWars || []).findIndex((wr) => wr.id === warId);
    if (warIdx === -1) return { resolved: false, summary: 'Active war not found.' };
    const war = w.activeWars![warIdx];
    const attacker = w.characters.find((c) => c.id === war.attackerLeaderId);
    const defender = w.characters.find((c) => c.id === war.defenderLeaderId);

    const allHoldingsToSettle = new Set<string>(war.targetHoldingIds || []);
    for (const cb of war.casusBellis || []) {
      if (cb.targetHoldingId) allHoldingsToSettle.add(cb.targetHoldingId);
    }

    const transferHoldingToVictor = (hid: string, victor: Character) => {
      transferHoldingSovereignty(hid, victor, w);
    };

    const cbCount = Math.max(1, war.casusBellis?.length || allHoldingsToSettle.size || 1);

    // 1. Apply territorial & treasury terms across ALL Casus Bellis in this single war
    if (outcome === 'attacker_win' && attacker) {
      for (const hid of allHoldingsToSettle) {
        const cbEntry = (war.casusBellis || []).find((cb) => cb.targetHoldingId === hid);
        // Only transfer holdings claimed by attacker side (not defender counter-claims)
        if (!cbEntry?.claimantId || cbEntry.claimantId !== defender?.id) {
          transferHoldingToVictor(hid, attacker);
        }
      }
      if (defender?.claims) {
        defender.claims = defender.claims.filter((cl) => !allHoldingsToSettle.has(cl.holdingId));
      }
      const indemnity = Math.min(Math.max(0, defender?.treasury || 0), 220 * cbCount);
      if (defender) defender.treasury = Math.max(0, (defender.treasury || 0) - indemnity);
      attacker.treasury = (attacker.treasury || 0) + indemnity;
      attacker.prestige = (attacker.prestige || 100) + 150 * cbCount;
    } else if (outcome === 'defender_win' && defender) {
      // Strip all attacker claims & fulfill any defender counter-claims bundled in this war
      if (attacker?.claims) {
        attacker.claims = attacker.claims.filter((cl) => !allHoldingsToSettle.has(cl.holdingId));
      }
      for (const cb of war.casusBellis || []) {
        if (cb.claimantId === defender.id && cb.targetHoldingId) {
          transferHoldingToVictor(cb.targetHoldingId, defender);
        }
      }
      const indemnity = Math.min(Math.max(0, attacker?.treasury || 0), 200 * cbCount);
      if (attacker) attacker.treasury = Math.max(0, (attacker.treasury || 0) - indemnity);
      defender.treasury = (defender.treasury || 0) + indemnity;
      defender.prestige = (defender.prestige || 100) + 140 * cbCount;
    }

    // 2. Remove settled war FIRST, then clear ALL occupation stripes involving belligerents & allies
    w.activeWars!.splice(warIdx, 1);

    const belligerentIds = new Set<string>(
      [war.attackerRealmId, war.defenderRealmId, ...(war.alliedRealmIds || [])].filter(Boolean)
    );
    clearOccupationForBelligerents(w, belligerentIds);
    for (const h of w.holdings || []) {
      if (allHoldingsToSettle.has(h.id)) {
        h.occupiedByRealmId = undefined;
        h.occupiedSinceYear = undefined;
      }
    }
    if (w.activeSieges) {
      w.activeSieges = w.activeSieges.filter((s) => !allHoldingsToSettle.has(s.holdingId));
    }
    for (const b of w.burgs || []) {
      const hId = `holding_${b.id}`;
      if (allHoldingsToSettle.has(hId) || allHoldingsToSettle.has(b.id)) {
        b.isStarving = false;
        b.foodSecurity = 'SECURE';
      }
    }
    if (w.armies) {
      w.armies = w.armies.filter((a) => a.warId !== war.id && !allHoldingsToSettle.has(a.targetHoldingId));
    }
    sanitizeWarsArmiesAndOccupations(w);
    recomputeWarScores(w);

    // 3. Enforce 5-year Peace Truce, +18 relation stabilization & Aggressive Expansion
    if (war.attackerRealmId && war.defenderRealmId && war.attackerRealmId !== war.defenderRealmId) {
      RealmDiplomacyEngine.setRealmTruce(war.attackerRealmId, war.defenderRealmId, 5, w);
      RealmDiplomacyEngine.adjustRealmRelation(war.attackerRealmId, war.defenderRealmId, 18, w);
      if (outcome === 'attacker_win') {
        AggressiveExpansionEngine.recordConquestAE(war.attackerRealmId, war.defenderRealmId, 16 * cbCount, w);
      } else if (outcome === 'defender_win') {
        AggressiveExpansionEngine.recordConquestAE(war.defenderRealmId, war.attackerRealmId, 12 * cbCount, w);
      }
    }

    // 4. Reconcile hierarchy, detect any cut-off exclaves & record chronicle
    reconcileFeudalHierarchy(w);

    const prevExclaveIds = new Set((w.provinces || []).filter((p) => p.isExclave).map((p) => p.id));
    const currentExclaveIds = computeExclaveProvinceIds(w);
    const newlySeveredExclaves = Array.from(currentExclaveIds).filter((pid) => !prevExclaveIds.has(pid));
    if (newlySeveredExclaves.length > 0) {
      const severedSet = new Set(newlySeveredExclaves);
      for (const ch of w.characters || []) {
        if (!ch.isAlive) continue;
        const holdsSevered =
          (ch.provinceId && severedSet.has(ch.provinceId)) ||
          (w.holdings || []).some((h) => h.ownerId === ch.id && severedSet.has(h.provinceId));
        if (holdsSevered && ch.liegeId) {
          ch.loyalty = Math.max(8, (ch.loyalty ?? 55) - 18);
          if (!ch.opinions) ch.opinions = {};
          ch.opinions[ch.liegeId] = Math.max(-100, (ch.opinions[ch.liegeId] ?? 0) - 15);
        }
      }
      for (const b of w.burgs || []) {
        if (severedSet.has(b.countyId)) {
          b.unrest = Math.min(100, (b.unrest || 10) + 22);
        }
      }
    }

    const outcomeLabel =
      outcome === 'attacker_win'
        ? `Victory for ${attacker?.name || 'Attacker'} — ${cbCount} Casus Belli Enforced`
        : outcome === 'defender_win'
        ? `Triumph for ${defender?.name || 'Defender'} — ${cbCount} Claim(s) Repulsed`
        : `White Peace Agreed across ${cbCount} Casus Belli (Status Quo)`;

    if (!w.history) w.history = [];
    const warStatus: WarChronicleData['status'] =
      outcome === 'attacker_win'
        ? 'Attacker Victory'
        : outcome === 'defender_win'
        ? 'Defender Victory'
        : 'White Peace';
    const existingChronicle = w.history.find((ev) => ev.warRecord?.warId === war.id);
    if (existingChronicle?.warRecord) {
      upsertWarChronicle(w, war.id, (rec, ev) => {
        rec.endYear = w.currentYear;
        rec.status = warStatus;
        rec.battlesFought = Math.max(rec.battlesFought, war.battlesFought || 0);
        rec.treatySummary = outcomeLabel;
        rec.chapters.push({
          year: w.currentYear,
          title: `Treaty of Peace (${warStatus})`,
          summary: `${outcomeLabel}. The conflict concluded after ${war.monthsActive} months and ${rec.battlesFought} pitched battle(s).`,
        });
        ev.year = w.currentYear;
        ev.description = `${outcomeLabel}. ${rec.battlesFought} pitched battle(s) fought over ${war.monthsActive} months (${rec.startYear}–${w.currentYear} AC).`;
      });
    } else {
      const atkRealm = w.realms.find((r) => r.id === war.attackerRealmId);
      const defRealm = w.realms.find((r) => r.id === war.defenderRealmId);
      w.history.unshift({
        id: generateUniqueId('hist_war_end'),
        year: w.currentYear,
        title: `War Concluded: ${war.casusBelli}`,
        category: 'War & Conquest',
        description: `${outcomeLabel}. ${war.battlesFought} pitched battle(s) fought over ${war.monthsActive} months.`,
        primaryActorId: outcome === 'defender_win' ? defender?.id : attacker?.id,
        secondaryActorId: outcome === 'defender_win' ? attacker?.id : defender?.id,
        realmId: attacker?.realmId || war.attackerRealmId,
        warRecord: {
          warId: war.id,
          warTitle: `War of ${war.casusBelli}`,
          casusBelli: war.casusBelli,
          attackerRealmId: war.attackerRealmId,
          attackerRealmName: atkRealm?.name || 'Attacker',
          defenderRealmId: war.defenderRealmId,
          defenderRealmName: defRealm?.name || 'Defender',
          attackerLeaderName: attacker?.name || 'Attacker Commander',
          defenderLeaderName: defender?.name || 'Defender Commander',
          startYear: Math.max(1000, w.currentYear - Math.max(1, Math.round((war.monthsActive || 12) / 12))),
          endYear: w.currentYear,
          status: warStatus,
          battlesFought: war.battlesFought || 0,
          totalCasualties: (war.battlesFought || 1) * 420,
          treatySummary: outcomeLabel,
          chapters: [
            {
              year: w.currentYear,
              title: `Treaty of Peace (${warStatus})`,
              summary: `${outcomeLabel}. Concluded after ${war.monthsActive} months of campaigning.`,
            },
          ],
        },
      });
    }

    recalculateAllGravitas(w);
    recalculateCharacterRelationships(w);
    return { resolved: true, summary: outcomeLabel };
  }

  static negotiateCustomPeace(
    warId: string,
    terms: WarPeaceTerms,
    w: WorldState
  ): { resolved: boolean; summary: string } {
    recomputeWarScores(w);
    const warIdx = (w.activeWars || []).findIndex((wr) => wr.id === warId);
    if (warIdx === -1) return { resolved: false, summary: 'Active war not found.' };
    const war = w.activeWars![warIdx];

    const uniqueDemands: string[] = Array.from(new Set(terms.cededHoldingIds || []));
    const isImplicitWhitePeace =
      terms.isWhitePeace ||
      (uniqueDemands.length === 0 && (terms.reparationsGold || 0) <= 0 && !terms.vassalizeLoser);
    if (isImplicitWhitePeace) {
      if ((war.monthsActive || 0) < 6 && Math.abs(war.warScore || 0) < 12) {
        const consent = evaluateBilateralConsent(war.attackerRealmId, war.defenderRealmId, 'peace', w);
        if (!consent.accepted) {
          return {
            resolved: false,
            summary: `White Peace refused: Neither side has exhausted operations yet (${war.monthsActive || 0}m) and counterparty withholds consent (${consent.score >= 0 ? '+' : ''}${consent.score}).`,
          };
        }
      }
      return ClaimAndWarEngine.resolveWarPeace(warId, 'white_peace', w);
    }

    const attackerSideWinning = war.warScore >= 0;
    const victorRealmId = attackerSideWinning ? war.attackerRealmId : war.defenderRealmId;
    const loserRealmId = attackerSideWinning ? war.defenderRealmId : war.attackerRealmId;
    if (terms.winnerRealmId && terms.winnerRealmId !== victorRealmId) {
      return {
        resolved: false,
        summary: 'Your realm lacks positive warscore leverage to enforce unilateral concessions.',
      };
    }
    const victor = w.characters.find(
      (c) => c.id === (attackerSideWinning ? war.attackerLeaderId : war.defenderLeaderId)
    );
    const loser = w.characters.find(
      (c) => c.id === (attackerSideWinning ? war.defenderLeaderId : war.attackerLeaderId)
    );
    const availableScore = Math.abs(Math.round(war.warScore || 0));

    let totalCost = 0;
    for (const hid of uniqueDemands) {
      const h = (w.holdings || []).find((x) => x.id === hid);
      if (!h) continue;
      const isWarGoal = (war.targetHoldingIds || []).includes(hid);
      const baseCost = isWarGoal ? 28 : 34;
      const isOccupied = h.occupiedByRealmId === victorRealmId;
      totalCost += isOccupied ? Math.max(15, baseCost - 10) : baseCost;
    }
    if ((terms.reparationsGold || 0) > 0) totalCost += 15;
    if (terms.vassalizeLoser) totalCost += 75;

    if (totalCost > availableScore) {
      return {
        resolved: false,
        summary: `Peace treaty exceeds warscore budget (${totalCost} demanded vs ${availableScore} available).`,
      };
    }

    if (!victor || !loser) {
      return ClaimAndWarEngine.resolveWarPeace(warId, 'white_peace', w);
    }

    let transferredCount = 0;
    for (const hid of uniqueDemands) {
      transferHoldingSovereignty(hid, victor, w);
      transferredCount++;
    }

    let paidGold = 0;
    if ((terms.reparationsGold || 0) > 0) {
      paidGold = Math.min(Math.max(0, loser.treasury || 0), Math.round(terms.reparationsGold));
      loser.treasury = Math.max(0, (loser.treasury || 0) - paidGold);
      victor.treasury = (victor.treasury || 0) + paidGold;
    }

    if (terms.vassalizeLoser && victorRealmId !== loserRealmId) {
      const victorRealm = w.realms?.find((r) => r.id === victorRealmId);
      const loserRealm = w.realms?.find((r) => r.id === loserRealmId);
      const victorTier: TitleTier =
        victor.titleTier || getRealmSovereignRank(victorRealm, victor.gender).titleTier;
      const vassalTier = getLowerTitleTier(victorTier, 'Duke');
      const seatBurg =
        w.burgs?.find((b) => b.id === loserRealm?.capitalBurgId) ||
        w.burgs?.find((b) => b.ownerId === loser.id);
      const seatName = seatBurg?.name || loser.houseName || 'the Marches';
      loser.liegeId = victor.id;
      loser.titleTier = vassalTier;
      loser.realmId = victorRealmId;
      if (vassalTier === 'Duke') {
        loser.role = 'Vassal Duke';
        loser.title = loser.gender === 'female' ? `Duchess of ${seatName}` : `Duke of ${seatName}`;
      } else {
        const subStyle = getSubordinateVassalStyle(
          victorRealm,
          victorTier,
          loser.gender || 'male',
          seatName,
          'county_fief'
        );
        loser.role = subStyle.role;
        loser.titleTier = subStyle.titleTier;
        loser.title = subStyle.title;
      }
      if (seatBurg) seatBurg.rulerTitle = loser.title;
      for (const ch of w.characters || []) {
        if (ch.id !== loser.id && ch.realmId === loserRealmId) {
          ch.realmId = victorRealmId;
          if (!ch.liegeId || ch.liegeId === victor.id) {
            ch.liegeId = loser.id;
          }
        }
      }
      for (const ct of w.counties || []) {
        if (ct.realmId === loserRealmId) {
          ct.realmId = victorRealmId;
          if (victorRealm && !victorRealm.countyIds.includes(ct.id)) {
            victorRealm.countyIds.push(ct.id);
          }
        }
      }
      for (const bg of w.burgs || []) {
        if (bg.stateId === loserRealmId) {
          bg.stateId = victorRealmId;
          bg.isCapital = false;
        }
      }
      RealmDiplomacyEngine.adjustRealmRelation(victorRealmId, loserRealmId, -25, w);
    }

    // Conclude settled war FIRST, then clear all occupation stripes & war forces cleanly
    w.activeWars!.splice(warIdx, 1);

    const belligerents = new Set<string>(
      [war.attackerRealmId, war.defenderRealmId, ...(war.alliedRealmIds || [])].filter(Boolean)
    );
    clearOccupationForBelligerents(w, belligerents);
    if (w.activeSieges) {
      const targetSet = new Set(war.targetHoldingIds || []);
      w.activeSieges = w.activeSieges.filter((s) => !targetSet.has(s.holdingId) && !uniqueDemands.includes(s.holdingId));
    }
    if (w.armies) {
      w.armies = w.armies.filter((a) => a.warId !== war.id);
    }
    sanitizeWarsArmiesAndOccupations(w);
    recomputeWarScores(w);

    RealmDiplomacyEngine.setRealmTruce(war.attackerRealmId, war.defenderRealmId, 5, w);
    victor.prestige = (victor.prestige || 100) + 110 + transferredCount * 45;
    if (victorRealmId !== loserRealmId && (transferredCount > 0 || terms.vassalizeLoser)) {
      AggressiveExpansionEngine.recordConquestAE(
        victorRealmId,
        loserRealmId,
        transferredCount * 14 + (terms.vassalizeLoser ? 26 : 0),
        w
      );
    }
    if (terms.vassalizeLoser && victorRealmId !== loserRealmId && w.realms) {
      w.realms = w.realms.filter((r) => r.id !== loserRealmId);
    }

    reconcileFeudalHierarchy(w);
    computeExclaveProvinceIds(w);
    recalculateAllGravitas(w);
    recalculateCharacterRelationships(w);

    const summary = `Treaty Signed (${victor.name}): ${transferredCount} holding(s) ceded${paidGold > 0 ? `, ${paidGold}g reparations` : ''}${terms.vassalizeLoser ? ', Subjugation enforced' : ''}.`;
    if (!w.history) w.history = [];
    const existingCustomWar = w.history.find((ev) => ev.warRecord?.warId === war.id);
    if (existingCustomWar?.warRecord) {
      upsertWarChronicle(w, war.id, (rec, ev) => {
        rec.endYear = w.currentYear;
        rec.status = 'Negotiated Peace';
        rec.battlesFought = Math.max(rec.battlesFought, war.battlesFought || 0);
        rec.territoryChanged = transferredCount > 0 ? `${transferredCount} holding(s) transferred` : 'No territory changed hands';
        rec.treatySummary = summary;
        rec.chapters.push({
          year: w.currentYear,
          title: `Peace Conference Concluded`,
          summary,
        });
        ev.year = w.currentYear;
        ev.description = `${summary} (${rec.startYear}–${w.currentYear} AC · ${rec.battlesFought} battles).`;
      });
    } else {
      const atkRealm = w.realms.find((r) => r.id === war.attackerRealmId);
      const defRealm = w.realms.find((r) => r.id === war.defenderRealmId);
      w.history.unshift({
        id: generateUniqueId('hist_custom_peace'),
        year: w.currentYear,
        title: `Peace Conference Concluded: ${war.casusBelli}`,
        category: 'War & Conquest',
        description: summary,
        primaryActorId: victor.id,
        secondaryActorId: loser.id,
        realmId: victor.realmId,
        warRecord: {
          warId: war.id,
          warTitle: `War of ${war.casusBelli}`,
          casusBelli: war.casusBelli,
          attackerRealmId: war.attackerRealmId,
          attackerRealmName: atkRealm?.name || 'Attacker',
          defenderRealmId: war.defenderRealmId,
          defenderRealmName: defRealm?.name || 'Defender',
          attackerLeaderName: w.characters.find((c) => c.id === war.attackerLeaderId)?.name || victor.name,
          defenderLeaderName: w.characters.find((c) => c.id === war.defenderLeaderId)?.name || loser.name,
          startYear: Math.max(1000, w.currentYear - Math.max(1, Math.round((war.monthsActive || 12) / 12))),
          endYear: w.currentYear,
          status: 'Negotiated Peace',
          battlesFought: war.battlesFought || 0,
          totalCasualties: (war.battlesFought || 1) * 450,
          territoryChanged: transferredCount > 0 ? `${transferredCount} holding(s) transferred` : 'No territory changed hands',
          treatySummary: summary,
          chapters: [
            {
              year: w.currentYear,
              title: 'Peace Conference Concluded',
              summary,
            },
          ],
        },
      });
    }

    return { resolved: true, summary };
  }

  static advanceWarsMonthly(w: WorldState, monthsDelta: number = 1): void {
    sanitizeWarsArmiesAndOccupations(w);
    if (!w.activeWars || w.activeWars.length === 0) return;
    recomputeWarScores(w);

    const getCoordsForHolding = (h: Holding): { x: number; y: number } => {
      const b = w.burgs?.find((bg) => `holding_${bg.id}` === h.id || bg.id === h.id || h.id.endsWith(bg.id));
      const p = w.provinces?.find((pr) => pr.id === h.provinceId);
      return { x: b?.x ?? p?.capitalX ?? 450, y: b?.y ?? p?.capitalY ?? 320 };
    };

    const dispatchOrRetaskLiberation = (
      war: NonNullable<WorldState['activeWars']>[number],
      friendlyRealmId: string,
      friendlyLeaderId: string,
      enemyLeaderId: string,
      isDefSide: boolean,
      occupiedHoldings: Holding[]
    ) => {
      if (occupiedHoldings.length === 0) return;
      const leader = w.characters.find((c) => c.id === friendlyLeaderId && c.isAlive !== false);
      if (!leader) return;
      const realm = w.realms.find((r) => r.id === friendlyRealmId);
      const occupiedIds = new Set(occupiedHoldings.map((h) => h.id));

      // Check if any active friendly army is already marching toward an occupied holding
      const friendlyArmies = (w.armies || []).filter(
        (a) =>
          a.warId === war.id &&
          !a.isReturning &&
          Boolean(a.isDefender) === isDefSide &&
          !(w.activeSieges || []).some((s) => s.besiegerArmyId === a.id)
      );
      const alreadyEnRoute = friendlyArmies.some(
        (a) => a.orderType === 'liberate' || occupiedIds.has(a.targetHoldingId)
      );
      if (alreadyEnRoute) return;

      // Retask an idle/parked friendly army first rather than leaving it parked
      const idleArmy = friendlyArmies.find((a) => {
        const tgt = w.holdings?.find((h) => h.id === a.targetHoldingId);
        return a.progress >= 0.98 || !tgt || !tgt.occupiedByRealmId;
      });
      const targetH = occupiedHoldings[0];
      const targetPos = getCoordsForHolding(targetH);

      if (idleArmy) {
        const cur = getArmyPositionAtProgress(idleArmy);
        const path = computeArmyMarchPath(cur.x, cur.y, targetPos.x, targetPos.y, w);
        idleArmy.startX = cur.x;
        idleArmy.startY = cur.y;
        idleArmy.targetX = targetPos.x;
        idleArmy.targetY = targetPos.y;
        idleArmy.waypoints = path.waypoints;
        idleArmy.totalMarchCost = path.totalMarchCost;
        idleArmy.speed = path.speed;
        idleArmy.targetHoldingId = targetH.id;
        idleArmy.orderType = 'liberate';
        idleArmy.progress = 0;
        return;
      }

      // Otherwise muster a relief force to free the occupied province if no friendly army is fielded
      if (friendlyArmies.length === 0) {
        const capBurg = w.burgs?.find((b) => b.id === realm?.capitalBurgId || (b.stateId === friendlyRealmId && b.isCapital));
        const capHolding = capBurg
          ? w.holdings?.find((h) => h.id === `holding_${capBurg.id}` || h.id === capBurg.id)
          : undefined;
        // Prefer rallying from an unoccupied friendly holding/province
        const safeProv =
          (capHolding && !capHolding.occupiedByRealmId ? w.provinces?.find((p) => p.id === capHolding.provinceId) : undefined) ||
          w.provinces?.find((p) => p.realmId === friendlyRealmId);
        const startX = capBurg && !capHolding?.occupiedByRealmId ? capBurg.x : safeProv?.capitalX ?? targetPos.x;
        const startY = capBurg && !capHolding?.occupiedByRealmId ? capBurg.y : safeProv?.capitalY ?? targetPos.y;
        const reliefPath = computeArmyMarchPath(startX, startY, targetPos.x, targetPos.y, w);
        const cmd = ArmyCommandEngine.pickDefaultCommander(leader, friendlyRealmId, w);
        const standing = calculateCharacterFeudalStanding(leader, w);
        const strength = Math.max(70, Math.round((standing.menAtArms + standing.demesneLevies * 0.55) * 0.78));
        w.armies = w.armies || [];
        w.armies.push({
          id: generateUniqueId('army_relief'),
          warId: war.id,
          realmId: friendlyRealmId,
          commanderId: cmd.id,
          commanderName: `${getCharacterRankTitle(cmd, w)} ${cmd.name} (Relief Host)`,
          attackerId: friendlyLeaderId,
          defenderId: enemyLeaderId,
          targetHoldingId: targetH.id,
          regiments: buildArmyRegiments(cmd, strength, w, friendlyRealmId),
          startX,
          startY,
          targetX: targetPos.x,
          targetY: targetPos.y,
          waypoints: reliefPath.waypoints,
          totalMarchCost: reliefPath.totalMarchCost,
          progress: 0,
          strength,
          speed: reliefPath.speed,
          color: realm?.color || (isDefSide ? '#2563eb' : '#dc2626'),
          isDefender: isDefSide,
          orderType: 'liberate',
          tactic: pickSmartBattleTactic(undefined, safeProv?.terrain || 'Plains', isDefSide, cmd),
        });
      }
    };

    const warsSnapshot = [...w.activeWars];
    for (const war of warsSnapshot) {
      war.monthsActive = (war.monthsActive || 0) + Math.max(1, monthsDelta);

      // Actively dispatch liberation forces for any occupied defender/attacker holdings
      const defOccupied = (w.holdings || []).filter((h) => {
        if (!h.occupiedByRealmId) return false;
        const owner = w.characters.find((c) => c.id === h.ownerId);
        const oRealm = owner?.realmId || w.counties?.find((ct) => ct.id === h.provinceId)?.realmId;
        return oRealm === war.defenderRealmId && h.occupiedByRealmId !== war.defenderRealmId;
      });
      const atkOccupied = (w.holdings || []).filter((h) => {
        if (!h.occupiedByRealmId) return false;
        const owner = w.characters.find((c) => c.id === h.ownerId);
        const oRealm = owner?.realmId || w.counties?.find((ct) => ct.id === h.provinceId)?.realmId;
        return oRealm === war.attackerRealmId && h.occupiedByRealmId !== war.attackerRealmId;
      });

      if (defOccupied.length > 0) {
        dispatchOrRetaskLiberation(war, war.defenderRealmId, war.defenderLeaderId, war.attackerLeaderId, true, defOccupied);
      }
      if (atkOccupied.length > 0) {
        dispatchOrRetaskLiberation(war, war.attackerRealmId, war.attackerLeaderId, war.defenderLeaderId, false, atkOccupied);
      }

      const warArmies = (w.armies || []).filter((a) => a.warId === war.id && !a.isReturning);
      const warSieges = (w.activeSieges || []).filter((s) =>
        (war.targetHoldingIds || []).includes(s.holdingId) ||
        warArmies.some((a) => s.besiegerArmyId === a.id)
      );

      if (war.warScore >= 100) {
        ClaimAndWarEngine.resolveWarPeace(war.id, 'attacker_win', w);
        continue;
      }
      if (war.warScore <= -100) {
        ClaimAndWarEngine.resolveWarPeace(war.id, 'defender_win', w);
        continue;
      }

      if (war.monthsActive >= 32) {
        const outcome =
          war.warScore >= 20 ? 'attacker_win' : war.warScore <= -20 ? 'defender_win' : 'white_peace';
        ClaimAndWarEngine.resolveWarPeace(war.id, outcome, w);
        continue;
      }

      if (warArmies.length === 0 && warSieges.length === 0) {
        if (war.warScore >= 55) {
          ClaimAndWarEngine.resolveWarPeace(war.id, 'attacker_win', w);
        } else if (war.warScore <= -55) {
          ClaimAndWarEngine.resolveWarPeace(war.id, 'defender_win', w);
        } else if (war.monthsActive >= 12 || (war.wavesSpawned || 0) >= 1) {
          const outcome =
            war.warScore >= 25 ? 'attacker_win' : war.warScore <= -25 ? 'defender_win' : 'white_peace';
          ClaimAndWarEngine.resolveWarPeace(war.id, outcome, w);
        } else {
          const atkLeader = w.characters.find((c) => c.id === war.attackerLeaderId && c.isAlive !== false);
          const defLeader = w.characters.find((c) => c.id === war.defenderLeaderId && c.isAlive !== false);
          const targetHId = war.targetHoldingIds?.[0];
          const targetH = w.holdings?.find((h) => h.id === targetHId);
          const waveRealm = w.realms.find((r) => r.rulerId === atkLeader?.id || r.id === atkLeader?.realmId);
          const waveTreasury = waveRealm?.treasury ?? atkLeader?.treasury ?? 0;
          if (atkLeader && defLeader && targetH && waveTreasury >= 250) {
            if (waveRealm?.treasury !== undefined) {
              waveRealm.treasury = Math.max(0, Math.round((waveRealm.treasury - 200) * 10) / 10);
            } else {
              atkLeader.treasury = Math.max(0, (atkLeader.treasury || 0) - 200);
            }
            war.wavesSpawned = (war.wavesSpawned || 0) + 1;
            const atkRealm = w.realms.find((r) => r.id === atkLeader.realmId);
            const atkProv = w.provinces?.find((p) => p.id === atkLeader.provinceId || p.realmId === atkLeader.realmId);
            const atkBurg = w.burgs?.find((b) => b.id === atkRealm?.capitalBurgId || b.ownerId === atkLeader.id);
            const defBurg = w.burgs?.find((b) => `holding_${b.id}` === targetH.id || b.id === targetH.id);
            const defProv = w.provinces?.find((p) => p.id === targetH.provinceId);
            const startX = atkBurg?.x ?? atkProv?.capitalX ?? 400;
            const startY = atkBurg?.y ?? atkProv?.capitalY ?? 300;
            const targetX = defBurg?.x ?? defProv?.capitalX ?? 500;
            const targetY = defBurg?.y ?? defProv?.capitalY ?? 350;
            const marchPath = computeArmyMarchPath(startX, startY, targetX, targetY, w);
            const waveCmd = ArmyCommandEngine.pickDefaultCommander(atkLeader, atkLeader.realmId, w);
            const standing = calculateCharacterFeudalStanding(atkLeader, w);
            const strength = Math.max(80, Math.round((standing.menAtArms + standing.demesneLevies * 0.65) * 0.85));
            w.armies = w.armies || [];
            w.armies.push({
              id: generateUniqueId('army_wave'),
              warId: war.id,
              realmId: atkLeader.realmId,
              commanderId: waveCmd.id,
              commanderName: `${getCharacterRankTitle(waveCmd, w)} ${waveCmd.name}`,
              attackerId: atkLeader.id,
              defenderId: defLeader.id,
              targetHoldingId: targetH.id,
              regiments: buildArmyRegiments(waveCmd, strength, w, atkLeader.realmId),
              startX,
              startY,
              targetX,
              targetY,
              waypoints: marchPath.waypoints,
              totalMarchCost: marchPath.totalMarchCost,
              progress: 0,
              strength,
              speed: marchPath.speed,
              color: atkRealm?.color || '#dc2626',
              isDefender: false,
              tactic: pickSmartBattleTactic(undefined, defProv?.terrain || 'Plains', false, waveCmd),
            });
          } else {
            const outcome =
              war.warScore >= 25 ? 'attacker_win' : war.warScore <= -25 ? 'defender_win' : 'white_peace';
            ClaimAndWarEngine.resolveWarPeace(war.id, outcome, w);
          }
        }
      }
    }
  }

  static stepArmies(w: WorldState, monthsDelta: number = 1) {
    sanitizeWarsArmiesAndOccupations(w);
    if (!w.armies || w.armies.length === 0) return;
    const stepMult = Math.max(1, monthsDelta);

    const routeArmyHome = (a: (typeof w.armies)[number], remainRatio: number) => {
      a.strength = Math.max(25, Math.round(a.strength * remainRatio));
      if (a.regiments) {
        for (const reg of a.regiments) {
          reg.count = Math.max(1, Math.round(reg.count * remainRatio));
          reg.morale = Math.max(15, Math.round(reg.morale * 0.65));
        }
      }
      reverseArmyWaypoints(a);
      a.isReturning = true;
      a.progress = 0;
    };

    for (let i = w.armies.length - 1; i >= 0; i--) {
      const army = w.armies[i];
      if (!army) continue;

      // Lazily populate road/terrain/port waypoints if missing on legacy army
      if (!army.waypoints || army.waypoints.length < 2) {
        const path = computeArmyMarchPath(army.startX, army.startY, army.targetX, army.targetY, w);
        army.waypoints = path.waypoints;
        army.totalMarchCost = path.totalMarchCost;
        army.speed = path.speed;
        army.embarkationPortId = path.embarkationPortId;
        army.embarkationPortName = path.embarkationPortName;
        army.destinationPortId = path.destinationPortId;
        army.destinationPortName = path.destinationPortName;
        army.seaDistanceKm = path.seaDistanceKm;
      }

      army.prevProgress = army.progress;
      // Cap single-tick progress step so armies visibly march/sail rather than teleporting
      const maxTickAdvance = 0.22;

      // 1. Returning armies march home along reversed land/road/sea route and disband
      if (army.isReturning) {
        const retStep = Math.min(maxTickAdvance, (army.speed || 0.045) * stepMult);
        army.progress = Math.min(1.0, army.progress + retStep);
        const retPos = getArmyPositionAtProgress(army);
        army.isEmbarked = retPos.isSea;
        if (army.progress >= 1.0) {
          w.armies.splice(i, 1);
        }
        continue;
      }

      const activeSiegeIdx = (w.activeSieges || []).findIndex(
        (s) => s.besiegerArmyId === army.id
      );
      const isBesieging = activeSiegeIdx !== -1;

      if (!isBesieging) {
        const desiredStep = Math.min(maxTickAdvance, (army.speed || 0.04) * stepMult);
        const candidateProgress = Math.min(1.0, army.progress + desiredStep);
        const candidatePos = getArmyPositionAtProgress(army, candidateProgress);

        // Army Maintenance & Bankruptcy Morale Cap
        const armyRealm = w.realms?.find((r) => r.id === army.realmId);
        if (armyRealm?.budget) {
          const maintRate = armyRealm.budget.armyMaintenanceRate ?? 1.0;
          const isBankrupt = armyRealm.budget.bankruptcyUntilYear > w.currentYear;
          const moraleCap = (50 + 50 * maintRate) * (isBankrupt ? 0.5 : 1.0);
          if (army.regiments) {
            for (const reg of army.regiments) {
              reg.morale = Math.min(moraleCap, reg.morale);
            }
          }
        }

        // Port Embarkation & Ship Charter Gate: entering sea waypoints requires paying ship charter fee
        if (candidatePos.isSea && !army.shipCharterPaid) {
          const embarkBurg = army.embarkationPortId
            ? w.burgs?.find((b) => b.id === army.embarkationPortId)
            : undefined;
          const charter = calculateNavalCharterCost(
            army.strength,
            army.seaDistanceKm || 220,
            embarkBurg,
            w
          );
          army.shipCharterCost = charter.charterGold;
          army.shipsChartered = charter.shipsRequired;

          const sponsor = w.characters?.find(
            (c) => c.id === army.attackerId || c.id === army.commanderId
          );
          const sponsorRealm = w.realms?.find(
            (r) => r.id === (army.realmId || sponsor?.realmId)
          );
          const useCrownFisc = Boolean(sponsorRealm && sponsorRealm.treasury !== undefined);
          const sponsorGold = Math.max(0, useCrownFisc ? (sponsorRealm!.treasury || 0) : (sponsor?.treasury || 0));
          if ((useCrownFisc ? sponsorRealm : sponsor) && sponsorGold >= charter.charterGold) {
            if (useCrownFisc && sponsorRealm) {
              sponsorRealm.treasury = Math.round((sponsorGold - charter.charterGold) * 10) / 10;
            } else if (sponsor) {
              sponsor.treasury = Math.round((sponsorGold - charter.charterGold) * 10) / 10;
            }
            army.shipCharterPaid = true;
            army.awaitingShipFunds = false;
            army.progress = candidateProgress;
            army.isEmbarked = true;
          } else if ((useCrownFisc ? sponsorRealm : sponsor) && !army.isPlayerControlled && sponsorGold >= charter.charterGold * 0.35) {
            // AI lords pay what they can scrape together at port so AI wars don't permanently stall
            if (useCrownFisc && sponsorRealm) {
              sponsorRealm.treasury = Math.max(0, Math.round((sponsorGold - charter.charterGold * 0.5) * 10) / 10);
            } else if (sponsor) {
              sponsor.treasury = Math.max(0, Math.round((sponsorGold - charter.charterGold * 0.5) * 10) / 10);
            }
            army.shipCharterPaid = true;
            army.awaitingShipFunds = false;
            army.progress = candidateProgress;
            army.isEmbarked = true;
          } else {
            // Halt visibly at the embarkation port awaiting ship charter funds
            army.awaitingShipFunds = true;
            army.isEmbarked = false;
          }
        } else {
          army.awaitingShipFunds = false;
          army.progress = candidateProgress;
          army.isEmbarked = candidatePos.isSea;
        }
      } else {
        army.progress = 1.0;
        army.isEmbarked = false;
      }

      const pos = getArmyPositionAtProgress(army);
      const currentX = pos.x;
      const currentY = pos.y;

      // 2. Terrain & Supply-limit attrition (lighter on roads, harsher off-road in mountains/wetlands/winter)
      let nearestProv = w.provinces?.[0];
      let minD = Infinity;
      for (const prov of w.provinces || []) {
        const d = Math.hypot(prov.capitalX - currentX, prov.capitalY - currentY);
        if (d < minD) {
          minD = d;
          nearestProv = prov;
        }
      }

      const nearestCounty = nearestProv ? w.counties?.find((ct) => ct.id === nearestProv!.id) : undefined;
      const provPop = nearestCounty ? computeCountyPopulation(nearestCounty, w).totalPop : 12000;
      let supplyLimit = Math.max(2500, Math.round(3500 + provPop * 0.06));
      if (pos.isRoad) supplyLimit *= 1.25;
      if (w.currentSeason === 'Winter') supplyLimit *= 0.45;
      if (pos.terrainLabel === 'Mountains' || nearestProv?.terrain === 'Mountains') supplyLimit *= 0.6;
      else if (pos.terrainLabel === 'Wetland') supplyLimit *= 0.72;

      if (army.strength > supplyLimit) {
        const excess = army.strength - supplyLimit;
        const casualties = Math.round(excess * 0.06);
        const prevStrength = Math.max(1, army.strength);
        army.strength = Math.max(20, army.strength - casualties);
        const ratio = army.strength / prevStrength;

        if (army.regiments) {
          for (const reg of army.regiments) {
            reg.count = Math.max(1, Math.round(reg.count * ratio));
            reg.morale = Math.max(10, reg.morale - 6);
          }
        }
      }

      // 2B. Dynamic Army-vs-Army Pitched Interception Clash with Strategy & Randomness
      const opposing = w.armies.find((other) => {
        if (!other || other.id === army.id || other.isReturning) return false;
        const sameWar =
          (army.warId && other.warId === army.warId) ||
          (army.targetHoldingId && army.targetHoldingId === other.targetHoldingId);
        if (!sameWar) return false;
        if (Boolean(army.isDefender) === Boolean(other.isDefender)) return false;
        const oPos = getArmyPositionAtProgress(other);
        const dist = Math.hypot(oPos.x - currentX, oPos.y - currentY);
        return dist < 40 || (army.progress >= 0.92 && other.progress >= 0.92);
      });

      if (opposing) {
        const atkSide = army.isDefender ? opposing : army;
        const defSide = army.isDefender ? army : opposing;
        const atkCmd = w.characters.find((c) => c.id === atkSide.commanderId && c.isAlive);
        const defCmd = w.characters.find((c) => c.id === defSide.commanderId && c.isAlive);

        const battleTerrain: TerrainType =
          pos.terrainLabel === 'Mountains'
            ? 'Mountains'
            : pos.terrainLabel === 'Forest' || pos.terrainLabel === 'Wetland'
            ? 'Forest'
            : nearestProv?.terrain || 'Plains';

        const atkTactic = pickSmartBattleTactic(atkSide, battleTerrain, false, atkCmd);
        const defTactic = pickSmartBattleTactic(defSide, battleTerrain, true, defCmd);
        const strat = evaluateBattleStrategy({
          attackerTactic: atkTactic,
          defenderTactic: defTactic,
          terrain: battleTerrain,
          attackerCommander: atkCmd,
          defenderCommander: defCmd,
        });

        const atkPower = atkSide.strength * strat.atkMultiplier;
        const defPower = defSide.strength * strat.defMultiplier * (battleTerrain === 'Mountains' ? 1.12 : 1.03);
        const atkWonClash = atkPower >= defPower;

        // Pitched field battle directly devastates the nearest settlement
        const battleBurg = (w.burgs || []).reduce<{ b: (typeof w.burgs)[number] | null; d: number }>(
          (best, b) => {
            const dist = Math.hypot(b.x - currentX, b.y - currentY);
            return dist < best.d ? { b, d: dist } : best;
          },
          { b: null, d: 120 }
        ).b;
        if (battleBurg) {
          applyWarDevastationToBurg(battleBurg, 'field_battle', w);
        }

        const winner = atkWonClash ? atkSide : defSide;
        const loser = atkWonClash ? defSide : atkSide;
        const winnerCmd = atkWonClash ? atkCmd : defCmd;
        const loserCmd = atkWonClash ? defCmd : atkCmd;
        const winnerCasMod = atkWonClash ? strat.atkCasualtyMod : strat.defCasualtyMod;
        const loserCasMod = atkWonClash ? strat.defCasualtyMod : strat.atkCasualtyMod;
        const winnerKeep = Math.max(0.55, 1.0 - (0.10 + Math.random() * 0.10) * winnerCasMod);
        const loserKeep = Math.max(0.35, 1.0 - (0.30 + Math.random() * 0.18) * loserCasMod);

        const atkCas = Math.round(atkSide.strength * (1 - (atkWonClash ? winnerKeep : loserKeep)));
        const defCas = Math.round(defSide.strength * (1 - (atkWonClash ? loserKeep : winnerKeep)));

        winner.strength = Math.max(35, Math.round(winner.strength * winnerKeep));
        if (winner.regiments) {
          for (const reg of winner.regiments) {
            reg.count = Math.max(1, Math.round(reg.count * winnerKeep));
          }
        }

        // Compute discipline for both armies and apply battle conduct + civilian & levy population losses
        computeArmyDiscipline(atkSide, atkCmd, w);
        computeArmyDiscipline(defSide, defCmd, w);
        const battleConduct = battleBurg
          ? applyWarConductAndPopulationCasualties({
              army: winner,
              commander: winnerCmd,
              defenderLeader: loserCmd,
              burg: battleBurg,
              context: 'field_battle',
              militaryCasualties: atkCas + defCas,
              w,
            })
          : null;

        const clashReport = {
          id: generateUniqueId('report_clash'),
          year: w.currentYear,
          attackerWon: atkWonClash,
          terrain: battleTerrain,
          attackerCasualties: atkCas,
          defenderCasualties: defCas,
          attackerRemainingStrength: Math.max(0, atkSide.strength - (atkWonClash ? 0 : atkCas)),
          defenderRemainingStrength: Math.max(0, defSide.strength - (atkWonClash ? defCas : 0)),
          attackerTactic: atkTactic,
          defenderTactic: defTactic,
          weatherCondition: strat.weatherCondition,
          tacticalSummary: strat.tacticalSummary,
          diceSwingPct: strat.diceSwingPct,
          civilianCasualties: battleConduct?.civilianCasualties || 0,
          levyPopulationLoss: battleConduct?.levyPopulationLoss || 0,
          conductOutcome: battleConduct?.conductTier,
          plunderedGold: battleConduct?.plunderedGold || 0,
          conductSummary: battleConduct?.summary,
          narrativeSummary: `${winner.commanderName || 'Victor'} (${atkWonClash ? atkTactic : defTactic}) defeated ${loser.commanderName || 'Opposing Force'} (${atkWonClash ? defTactic : atkTactic}) on ${battleTerrain} terrain. ${strat.tacticalSummary}.${battleConduct ? ` ${battleConduct.summary}` : ''}`,
        };
        winner.lastBattleReport = clashReport;
        loser.lastBattleReport = clashReport;

        if (!atkWonClash && w.activeSieges) {
          w.activeSieges = w.activeSieges.filter((s) => s.besiegerArmyId !== atkSide.id);
        }

        const activeWar = (w.activeWars || []).find(
          (war) =>
            war.id === atkSide.warId ||
            (war.attackerLeaderId === atkSide.attackerId && war.defenderLeaderId === atkSide.defenderId)
        );
        if (activeWar) {
          activeWar.battlesFought += 1;
          activeWar.battleWarScore = Math.max(
            -60,
            Math.min(60, (activeWar.battleWarScore ?? 0) + (atkWonClash ? 14 : -14))
          );
          recomputeWarScores(w);
        }

        if (atkCmd && defCmd && Math.random() < 0.22) {
          const slainLoser = atkWonClash ? defCmd : atkCmd;
          const clashVictor = atkWonClash ? atkCmd : defCmd;
          if ((clashVictor.baseProwess || 10) + Math.random() * 8 > (slainLoser.baseProwess || 10) + Math.random() * 10) {
            const battleDeath = pickContextualDeathCause(slainLoser, 'war');
            killCharacter(slainLoser, battleDeath.cause, w, battleDeath.category);
          }
        }

        if (!w.history) w.history = [];
        const battleCasualties = Math.round((clashReport.attackerCasualties || 0) + (clashReport.defenderCasualties || 0));
        if (army.warId) {
          upsertWarChronicle(w, army.warId, (rec) => {
            rec.battlesFought += 1;
            rec.totalCasualties += battleCasualties;
            rec.chapters.push({
              year: w.currentYear,
              title: `Field Battle near ${nearestProv?.name || 'the Frontier'}`,
              summary: `${clashReport.narrativeSummary} (${battleCasualties.toLocaleString()} casualties).`,
            });
          });
        }
        w.history.unshift({
          id: generateUniqueId('hist_clash'),
          year: w.currentYear,
          title: `Field Battle near ${nearestProv?.name || 'the Frontier'}`,
          category: 'Battle',
          description: clashReport.narrativeSummary,
          primaryActorId: winner.commanderId,
          secondaryActorId: loser.commanderId,
          realmId: atkCmd?.realmId,
        });

        routeArmyHome(loser, loserKeep);
        if (army.id === loser.id) {
          continue;
        }
      }

      if (isBesieging) {
        if (army.strength <= 25) {
          w.activeSieges?.splice(activeSiegeIdx, 1);
          w.armies.splice(i, 1);
        }
        continue;
      }

      // 2C. Fortified Stronghold Zone-of-Control Interception:
      // Invading armies cannot roam freely past hostile, unoccupied Tier 2+ castles or
      // well-garrisoned walled settlements. They must either leave a proportional-or-greater
      // siege detachment to pin & besiege the stronghold, or halt the entire army to besiege it.
      if (!army.isDefender && !army.isEmbarked && army.progress < 1.0 && w.holdings && w.holdings.length > 0) {
        const prevPos = getArmyPositionAtProgress(army, army.prevProgress ?? Math.max(0, army.progress - 0.05));
        const segDx = currentX - prevPos.x;
        const segDy = currentY - prevPos.y;
        const segLenSq = segDx * segDx + segDy * segDy;

        const atkChar = w.characters.find((c) => c.id === army.attackerId || c.id === army.commanderId);
        const defChar = w.characters.find((c) => c.id === army.defenderId);
        const activeWar = (w.activeWars || []).find((war) => war.id === army.warId);
        const invadingRealmId = army.realmId || atkChar?.realmId || activeWar?.attackerRealmId;
        const enemyRealmId = activeWar
          ? (invadingRealmId === activeWar.attackerRealmId ? activeWar.defenderRealmId : activeWar.attackerRealmId)
          : defChar?.realmId;

        let bestBlocking: {
          holding: (typeof w.holdings)[number];
          x: number;
          y: number;
          tier: number;
          garrison: number;
          reason: string;
          requiredForce: number;
          alongT: number;
        } | null = null;

        for (const h of w.holdings) {
          if (h.id === army.targetHoldingId) continue;
          // Once occupied by the invading realm, armies may pass freely
          if (invadingRealmId && h.occupiedByRealmId === invadingRealmId) continue;

          // Only hostile enemy strongholds block this invasion
          const hOwner = w.characters.find((c) => c.id === h.ownerId);
          const hRealmId = h.occupiedByRealmId || hOwner?.realmId;
          const isHostile =
            (enemyRealmId && hRealmId === enemyRealmId) ||
            (army.defenderId && h.ownerId === army.defenderId) ||
            (activeWar &&
              (h.ownerId === activeWar.defenderLeaderId ||
                activeWar.targetHoldingIds.includes(h.id)));
          if (!isHostile) continue;
          if (invadingRealmId && hRealmId === invadingRealmId) continue;

          const hBurg = w.burgs?.find(
            (b) => b.id === h.id || `holding_${b.id}` === h.id || h.id.endsWith(b.id)
          );
          const fortCheck = isBlockingFortifiedSettlement(h, hBurg);
          if (!fortCheck.blocks) continue;

          const requiredForce = computeRequiredSiegeForce(fortCheck.garrison, fortCheck.tier);

          // If another allied/same-realm force is already besieging this stronghold with a
          // proportional-or-greater force, the garrison is already pinned and this host may pass
          const existingBesiegingStrength = (w.activeSieges || [])
            .filter((s) => s.holdingId === h.id)
            .reduce((sum, s) => {
              const bArmy = (w.armies || []).find((a) => a.id === s.besiegerArmyId);
              if (!bArmy || bArmy.isDefender || bArmy.isReturning) return sum;
              const bRealm =
                bArmy.realmId ||
                w.characters.find((c) => c.id === bArmy.attackerId || c.id === bArmy.commanderId)?.realmId;
              if (invadingRealmId && bRealm && bRealm !== invadingRealmId) return sum;
              return sum + (bArmy.strength || 0);
            }, 0);
          if (existingBesiegingStrength >= requiredForce) continue;

          const hProv = w.provinces?.find((p) => p.id === h.provinceId);
          const cx = hBurg?.x ?? hProv?.capitalX;
          const cy = hBurg?.y ?? hProv?.capitalY;
          if (cx === undefined || cy === undefined) continue;

          // Closest point on the march segment [prevPos -> pos] so sped-up ticks cannot skip strongholds
          let t = 1.0;
          if (segLenSq > 0.001) {
            t = Math.max(0, Math.min(1, ((cx - prevPos.x) * segDx + (cy - prevPos.y) * segDy) / segLenSq));
          }
          const closestX = prevPos.x + segDx * t;
          const closestY = prevPos.y + segDy * t;
          const distToStronghold = Math.hypot(cx - closestX, cy - closestY);

          const zocRadius = 40 + Math.min(3, Math.max(0, fortCheck.tier - 1)) * 7;

          if (distToStronghold <= zocRadius) {
            if (!bestBlocking || t < bestBlocking.alongT) {
              bestBlocking = {
                holding: h,
                x: cx,
                y: cy,
                tier: fortCheck.tier,
                garrison: fortCheck.garrison,
                reason: fortCheck.reason,
                requiredForce,
                alongT: t,
              };
            }
          }
        }

        if (bestBlocking) {
          const minMainHostAfterSplit = Math.max(260, Math.round(bestBlocking.requiredForce * 0.65));
          const canDetachProportionalForce =
            !army.isSiegeDetachment &&
            army.strength >= bestBlocking.requiredForce + minMainHostAfterSplit;

          if (canDetachProportionalForce) {
            // Split off a proportional-or-greater Siege Corps to pin & besiege the stronghold
            // while the main field army presses on toward its objective
            const detachStrength = Math.min(
              Math.round(army.strength * 0.48),
              Math.max(bestBlocking.requiredForce, Math.round(bestBlocking.garrison * 1.55))
            );
            const detachRatio = Math.max(0.15, Math.min(0.48, detachStrength / Math.max(1, army.strength)));
            const keepRatio = 1 - detachRatio;

            const detachedRegs = army.regiments
              ? army.regiments.map((reg) => {
                  const splitCount = Math.max(1, Math.round(reg.count * detachRatio));
                  reg.count = Math.max(1, reg.count - splitCount);
                  return {
                    ...reg,
                    id: generateUniqueId('reg_det'),
                    count: splitCount,
                  };
                })
              : undefined;

            army.strength = Math.max(100, Math.round(army.strength * keepRatio));

            const holdingDefender =
              w.characters.find((c) => c.id === bestBlocking!.holding.ownerId) ||
              defChar ||
              w.characters.find((c) => c.id === army.defenderId);

            const siegeDetachment: (typeof w.armies)[number] = {
              id: generateUniqueId('army_siege_corps'),
              warId: army.warId,
              realmId: invadingRealmId,
              attackerId: army.attackerId,
              defenderId: holdingDefender?.id || army.defenderId,
              commanderId: army.commanderId,
              commanderName: `${army.commanderName || 'Vanguard'} (Siege Corps)`,
              targetHoldingId: bestBlocking.holding.id,
              startX: bestBlocking.x,
              startY: bestBlocking.y,
              targetX: bestBlocking.x,
              targetY: bestBlocking.y,
              waypoints: [
                { x: currentX, y: currentY, cumCost: 0 },
                { x: bestBlocking.x, y: bestBlocking.y, cumCost: 1 },
              ],
              totalMarchCost: 1,
              progress: 1.0,
              strength: detachStrength,
              regiments: detachedRegs,
              speed: army.speed || 0.04,
              color: army.color,
              isDefender: false,
              isPlayerControlled: army.isPlayerControlled,
              isSiegeDetachment: true,
              parentArmyId: army.id,
              discipline: army.discipline,
              conductPolicy: army.conductPolicy,
              interceptedByCastleName: bestBlocking.holding.name,
            };

            w.armies.push(siegeDetachment);
            if (holdingDefender) {
              SiegeAndPeaceEngine.startSiege(siegeDetachment as any, bestBlocking.holding, holdingDefender, w);
            }

            if (army.warId) {
              upsertWarChronicle(w, army.warId, (rec) => {
                rec.chapters.push({
                  year: w.currentYear,
                  title: `Siege Corps Detached at ${bestBlocking!.holding.name}`,
                  summary: `${army.commanderName || 'The invading host'} detached ${detachStrength.toLocaleString()} troops to invest the ${bestBlocking!.reason} of ${bestBlocking!.holding.name} (garrison ~${bestBlocking!.garrison.toLocaleString()}) while the main army continued its advance.`,
                });
              });
            }
          } else {
            // Whole army must halt and lay siege to the blocking stronghold before passing
            if (!army.deferredTargetHoldingId) {
              army.deferredTargetHoldingId = army.targetHoldingId;
              army.deferredTargetX = army.targetX;
              army.deferredTargetY = army.targetY;
            }
            army.targetHoldingId = bestBlocking.holding.id;
            army.targetX = bestBlocking.x;
            army.targetY = bestBlocking.y;
            army.startX = currentX;
            army.startY = currentY;
            army.waypoints = [
              { x: currentX, y: currentY, cumCost: 0 },
              { x: bestBlocking.x, y: bestBlocking.y, cumCost: 1 },
            ];
            army.totalMarchCost = 1;
            army.progress = 1.0;
            army.interceptedByCastleName = bestBlocking.holding.name;

            if (army.warId) {
              upsertWarChronicle(w, army.warId, (rec) => {
                rec.chapters.push({
                  year: w.currentYear,
                  title: `Advance Halted at ${bestBlocking!.holding.name}`,
                  summary: `${army.commanderName || 'The invading host'} was blocked by the ${bestBlocking!.reason} of ${bestBlocking!.holding.name} (garrison ~${bestBlocking!.garrison.toLocaleString()}) and forced to lay siege with its full strength before passing.`,
                });
              });
            }
          }
        }
      }

      // 3. Arrival at target holding: Liberation (for defender) or Garrison Assault & Siege Investment
      if (army.progress >= 1.0) {
        const holding = w.holdings?.find((h) => h.id === army.targetHoldingId);
        const attacker = w.characters.find((c) => c.id === army.attackerId);
        const defender = w.characters.find((c) => c.id === army.defenderId);

        if (!holding || !attacker || !defender) {
          w.armies.splice(i, 1);
          continue;
        }

        const ownerChar = w.characters.find((c) => c.id === holding.ownerId);
        const ownerRealmId = ownerChar?.realmId || w.counties?.find((ct) => ct.id === holding.provinceId)?.realmId;
        const armyOwner = w.characters.find((c) => c.id === army.commanderId) || attacker;
        const armyRealmId = army.realmId || armyOwner?.realmId;
        const activeWar = (w.activeWars || []).find(
          (war) => war.id === army.warId || war.targetHoldingIds.includes(holding.id)
        );

        // If the war already ended, cleanly dismiss the army (zero post-war ghost armies)
        if (army.warId && !activeWar) {
          w.armies.splice(i, 1);
          continue;
        }

        const isFriendlyToHolding =
          army.isDefender ||
          army.orderType === 'liberate' ||
          Boolean(armyRealmId && ownerRealmId && armyRealmId === ownerRealmId);

        if (isFriendlyToHolding) {
          // Liberate own/allied holding if enemy-occupied & recalculate dynamic warscore
          if (
            holding.occupiedByRealmId &&
            holding.occupiedByRealmId !== ownerRealmId &&
            (!armyRealmId || holding.occupiedByRealmId !== armyRealmId)
          ) {
            holding.occupiedByRealmId = undefined;
            holding.occupiedSinceYear = undefined;
            if (w.activeSieges) {
              w.activeSieges = w.activeSieges.filter((s) => {
                if (s.holdingId !== holding.id) return true;
                const b = w.burgs?.find((bg) => bg.id === holding.id || `holding_${bg.id}` === holding.id);
                if (b) {
                  b.foodSecurity = 'SECURE';
                  b.isStarving = false;
                }
                return false;
              });
            }
            recalculateFeudalDemesne(w);
            recomputeWarScores(w);
            if (activeWar) {
              upsertWarChronicle(w, activeWar.id, (rec) => {
                rec.chapters.push({
                  year: w.currentYear,
                  title: `Liberation of ${holding.name}`,
                  summary: `${army.commanderName || defender.name} drove out the occupying garrison and liberated ${holding.name}.`,
                });
              });
            }
            if (!w.history) w.history = [];
            w.history.unshift({
              id: generateUniqueId('hist_liberate'),
              year: w.currentYear,
              title: `Holding Liberated: ${holding.name}`,
              category: 'War & Conquest',
              description: `${army.commanderName || defender.name} liberated ${holding.name} from enemy occupation.`,
              primaryActorId: army.commanderId || defender.id,
              realmId: ownerRealmId || armyRealmId,
            });
          }

          if (!activeWar) {
            w.armies.splice(i, 1);
            continue;
          }

          // Retask to another occupied holding belonging to our side, or march home (never linger as a ghost army)
          const sideRealmId = armyRealmId || ownerRealmId;
          const nextOccupied = (w.holdings || []).find(
            (h) =>
              h.id !== holding.id &&
              h.occupiedByRealmId &&
              h.occupiedByRealmId !== sideRealmId &&
              (w.characters.find((c) => c.id === h.ownerId)?.realmId === sideRealmId ||
                w.counties?.find((ct) => ct.id === h.provinceId)?.realmId === sideRealmId)
          );
          if (nextOccupied) {
            const nb = w.burgs?.find((b) => `holding_${b.id}` === nextOccupied.id || b.id === nextOccupied.id);
            const np = w.provinces?.find((p) => p.id === nextOccupied.provinceId);
            const nx = nb?.x ?? np?.capitalX;
            const ny = nb?.y ?? np?.capitalY;
            if (nx !== undefined && ny !== undefined) {
              const path = computeArmyMarchPath(army.targetX, army.targetY, nx, ny, w);
              army.startX = army.targetX;
              army.startY = army.targetY;
              army.targetX = nx;
              army.targetY = ny;
              army.waypoints = path.waypoints;
              army.totalMarchCost = path.totalMarchCost;
              army.speed = path.speed;
              army.targetHoldingId = nextOccupied.id;
              army.orderType = 'liberate';
              army.progress = 0;
              continue;
            }
          }

          routeArmyHome(army, 1.0);
          continue;
        }

        // If target is already occupied by our own side, advance to next enemy holding or march home
        if (armyRealmId && holding.occupiedByRealmId === armyRealmId) {
          const nextEnemyH = (activeWar?.targetHoldingIds || [])
            .map((hid) => w.holdings?.find((h) => h.id === hid && h.occupiedByRealmId !== armyRealmId))
            .find(Boolean);
          if (nextEnemyH) {
            const nb = w.burgs?.find((b) => `holding_${b.id}` === nextEnemyH.id || b.id === nextEnemyH.id);
            const np = w.provinces?.find((p) => p.id === nextEnemyH.provinceId);
            const nx = nb?.x ?? np?.capitalX;
            const ny = nb?.y ?? np?.capitalY;
            if (nx !== undefined && ny !== undefined) {
              const path = computeArmyMarchPath(army.targetX, army.targetY, nx, ny, w);
              army.startX = army.targetX;
              army.startY = army.targetY;
              army.targetX = nx;
              army.targetY = ny;
              army.waypoints = path.waypoints;
              army.totalMarchCost = path.totalMarchCost;
              army.speed = path.speed;
              army.targetHoldingId = nextEnemyH.id;
              army.progress = 0;
              continue;
            }
          }
          routeArmyHome(army, 1.0);
          continue;
        }

        if (!army.regiments || army.regiments.length === 0) {
          army.regiments = buildArmyRegiments(attacker, army.strength, w, attacker.realmId);
        }

        const report = resolveTacticalFieldBattle(army as any, holding, defender, w);

        if (report.attackerWon) {
          army.strength = Math.max(40, report.attackerRemainingStrength);
          SiegeAndPeaceEngine.startSiege(army as any, holding, defender, w);
          army.progress = 1.0;
        } else {
          const atkRealmR = w.realms.find((r) => r.rulerId === attacker.id || r.id === army.realmId);
          const defRealmR = w.realms.find((r) => r.rulerId === defender.id || r.id === defender.realmId);
          const atkAvail = atkRealmR?.treasury ?? attacker.treasury ?? 0;
          const repGold = Math.round(Math.min(Math.max(0, atkAvail), 280) * 10) / 10;
          if (repGold > 0) {
            if (atkRealmR?.treasury !== undefined) atkRealmR.treasury = Math.max(0, Math.round((atkRealmR.treasury - repGold) * 10) / 10);
            else attacker.treasury = Math.max(0, Math.round(((attacker.treasury || 0) - repGold) * 10) / 10);
            if (defRealmR?.treasury !== undefined) defRealmR.treasury = Math.round((defRealmR.treasury + repGold) * 10) / 10;
            else defender.treasury = Math.round(((defender.treasury || 0) + repGold) * 10) / 10;
          }
          attacker.stress = Math.min(300, (attacker.stress || 0) + 45);
          routeArmyHome(army, Math.max(0.35, report.attackerRemainingStrength / Math.max(1, army.strength)));
        }
      }
    }

    ClaimAndWarEngine.consolidateSameRealmWarArmies(w, stepMult);
    ClaimAndWarEngine.maybeApplyStrategicArmySplit(w);
  }

  /**
   * Unifies active field armies of the same kingdom/realm in a war under one senior commander.
   * Strictly excludes garrisons (`isGarrison`) and active temporary strategic split columns.
   */
  static consolidateSameRealmWarArmies(w: WorldState, monthsDelta: number = 1): void {
    if (!w.armies || w.armies.length === 0) return;

    const siegeArmyIds = new Set((w.activeSieges || []).map((s) => s.besiegerArmyId));
    const stepMult = Math.max(1, monthsDelta);

    // 1. Tick down strategic split timers & clear expired siege-detachment flags once siege ends
    for (const army of w.armies) {
      if (army.isGarrison || army.id.includes('garrison')) {
        army.isGarrison = true;
        continue;
      }
      if (army.isSiegeDetachment && !siegeArmyIds.has(army.id)) {
        army.isSiegeDetachment = false;
      }
      if (army.isStrategicSplit) {
        const targetH = w.holdings?.find((h) => h.id === army.targetHoldingId);
        const armyRealmId = army.realmId || w.characters.find((c) => c.id === army.attackerId)?.realmId;
        const targetResolved =
          !targetH ||
          (army.isDefender
            ? !targetH.occupiedByRealmId
            : Boolean(armyRealmId && targetH.occupiedByRealmId === armyRealmId));

        if (army.splitExpiresMonths !== undefined) {
          army.splitExpiresMonths -= stepMult;
        }
        if (
          army.isReturning ||
          army.strength < 220 ||
          (army.splitExpiresMonths !== undefined && army.splitExpiresMonths <= 0) ||
          (targetResolved && army.progress >= 0.95)
        ) {
          army.isStrategicSplit = false;
          army.splitGroupId = undefined;
          army.splitExpiresMonths = undefined;
          army.splitReason = undefined;
        }
      }
    }

    // 2. Group active field armies of the same realm in the same war (excluding garrisons & temporary split wings)
    const groups = new Map<string, (typeof w.armies)[number][]>();
    for (const army of w.armies) {
      if (
        !army ||
        army.isReturning ||
        army.isGarrison ||
        army.id.includes('garrison') ||
        army.isStrategicSplit ||
        army.isSiegeDetachment
      ) {
        continue;
      }
      const ownerRealmId =
        army.realmId || w.characters.find((c) => c.id === army.attackerId || c.id === army.commanderId)?.realmId;
      if (!ownerRealmId) continue;
      const key = `${army.warId || 'skirmish'}::${ownerRealmId}::${Boolean(army.isDefender)}`;
      const list = groups.get(key) || [];
      list.push(army);
      groups.set(key, list);
    }

    const tierScore: Record<string, number> = {
      Emperor: 60,
      King: 50,
      Duke: 40,
      Count: 30,
      Baron: 20,
      Mayor: 15,
      Commoner: 5,
    };

    const pickSeniorCommander = (cands: Character[]): Character | undefined => {
      const living = cands.filter((c) => c && c.isAlive !== false);
      if (living.length === 0) return undefined;
      living.sort((a, b) => {
        const sa =
          (a.role === 'Monarch' ? 100 : a.role === 'Marshal' ? 25 : 0) +
          (tierScore[a.titleTier || 'Commoner'] || 5) +
          (a.baseMartial || 10);
        const sb =
          (b.role === 'Monarch' ? 100 : b.role === 'Marshal' ? 25 : 0) +
          (tierScore[b.titleTier || 'Commoner'] || 5) +
          (b.baseMartial || 10);
        return sb - sa;
      });
      return living[0];
    };

    const absorbedIds = new Set<string>();
    for (const [, list] of groups.entries()) {
      if (list.length < 2) continue;

      // Choose anchor: active besieger first, otherwise strongest host
      const sorted = list.slice().sort((a, b) => {
        const aBesiege = siegeArmyIds.has(a.id) ? 1 : 0;
        const bBesiege = siegeArmyIds.has(b.id) ? 1 : 0;
        if (bBesiege !== aBesiege) return bBesiege - aBesiege;
        return (b.strength || 0) - (a.strength || 0);
      });

      const anchor = sorted[0];
      const anchorPos = getArmyPositionAtProgress(anchor);
      const ownerRealmId =
        anchor.realmId || w.characters.find((c) => c.id === anchor.attackerId || c.id === anchor.commanderId)?.realmId || '';

      for (let idx = 1; idx < sorted.length; idx++) {
        const sec = sorted[idx];
        if (absorbedIds.has(sec.id)) continue;
        const secPos = getArmyPositionAtProgress(sec);
        const dist = Math.hypot(secPos.x - anchorPos.x, secPos.y - anchorPos.y);
        const sameHoldingTarget =
          Boolean(anchor.targetHoldingId && sec.targetHoldingId === anchor.targetHoldingId) &&
          anchor.progress >= 0.94 &&
          sec.progress >= 0.94;

        if (dist <= 65 || sameHoldingTarget) {
          // Unite regiments & strength under the senior commander
          anchor.strength = (anchor.strength || 0) + (sec.strength || 0);
          if (!anchor.regiments) anchor.regiments = [];
          for (const reg of sec.regiments || []) {
            const match = anchor.regiments.find((r) => r.category === reg.category);
            if (match) {
              const totalMen = match.count + reg.count;
              if (totalMen > 0) {
                match.morale = Math.round((match.morale * match.count + reg.morale * reg.count) / totalMen);
                match.veterancy = Math.round((match.veterancy * match.count + reg.veterancy * reg.count) / totalMen);
              }
              match.count += reg.count;
              match.maxCount += reg.maxCount;
            } else {
              anchor.regiments.push({ ...reg });
            }
          }

          const cmdA = w.characters.find((c) => c.id === anchor.commanderId);
          const cmdB = w.characters.find((c) => c.id === sec.commanderId);
          const bestCmd =
            pickSeniorCommander([cmdA, cmdB].filter(Boolean) as Character[]) ||
            (ownerRealmId ? ArmyCommandEngine.getEligibleCommanders(ownerRealmId, w)[0] : undefined);
          if (bestCmd) {
            anchor.commanderId = bestCmd.id;
            anchor.commanderName = `${getCharacterRankTitle(bestCmd, w)} ${bestCmd.name}`;
            const anchorSiege = (w.activeSieges || []).find((s) => s.besiegerArmyId === anchor.id);
            if (anchorSiege) anchorSiege.attackerCommanderId = bestCmd.id;
          }

          if (w.activeSieges) {
            w.activeSieges = w.activeSieges.filter((s) => s.besiegerArmyId !== sec.id);
          }
          absorbedIds.add(sec.id);
        } else if (!siegeArmyIds.has(sec.id) && !sec.isPlayerControlled && !sec.isEmbarked && !anchor.isEmbarked) {
          // March toward anchor army to rally together under one commander
          const march = computeArmyMarchPath(secPos.x, secPos.y, anchorPos.x, anchorPos.y, w);
          sec.startX = secPos.x;
          sec.startY = secPos.y;
          sec.targetX = anchorPos.x;
          sec.targetY = anchorPos.y;
          sec.waypoints = march.waypoints;
          sec.totalMarchCost = march.totalMarchCost;
          sec.speed = march.speed;
          sec.progress = 0;
          sec.targetHoldingId = anchor.targetHoldingId;
          sec.orderType = 'auto';
        }
      }
    }

    if (absorbedIds.size > 0) {
      w.armies = w.armies.filter((a) => !absorbedIds.has(a.id));
    }
  }

  /**
   * Rarely divides a large field army into 2 (or very rarely 3) strategic columns
   * under subordinate commanders based on multi-front objectives, harsh attrition, or flanking doctrine.
   * Never splits garrisons (`isGarrison`).
   */
  static maybeApplyStrategicArmySplit(w: WorldState): void {
    if (!w.armies || w.armies.length === 0 || !w.activeWars || w.activeWars.length === 0) return;
    const siegeArmyIds = new Set((w.activeSieges || []).map((s) => s.besiegerArmyId));

    for (const war of w.activeWars) {
      const warArmies = w.armies.filter(
        (a) =>
          a.warId === war.id &&
          !a.isReturning &&
          !a.isGarrison &&
          !a.id.includes('garrison') &&
          !a.isSiegeDetachment
      );

      for (const side of [false, true] as const) {
        const sideRealmId = side ? war.defenderRealmId : war.attackerRealmId;
        const sideArmies = warArmies.filter(
          (a) => Boolean(a.isDefender) === side && (a.realmId || sideRealmId) === sideRealmId
        );
        if (sideArmies.length === 0) continue;
        // Max 1 strategic split active per kingdom per war so armies generally fight unified
        if (sideArmies.some((a) => a.isStrategicSplit)) continue;

        const lead = sideArmies
          .filter((a) => !a.isEmbarked && !a.awaitingShipFunds && !siegeArmyIds.has(a.id) && a.strength >= 950)
          .sort((a, b) => (b.strength || 0) - (a.strength || 0))[0];
        if (!lead) continue;

        const leadCmd = w.characters.find((c) => c.id === lead.commanderId && c.isAlive !== false);
        const martialSkill = leadCmd?.baseMartial || 10;
        const cmdTraits = collectAllCharacterTraits(leadCmd || ({} as Character));
        const hasStrategicDoctrine =
          martialSkill >= 13 ||
          cmdTraits.some((t) => ['Organizer', 'Flexible Leader', 'Maneuver', 'Cavalry Leader', 'Aggressive Attacker'].includes(t));

        const leadPos = getArmyPositionAtProgress(lead);
        const enemyRealmId = side ? war.attackerRealmId : war.defenderRealmId;

        // Identify genuinely distinct strategic targets for multi-front division
        const candidateTargetHoldings = (w.holdings || []).filter((h) => {
          if (h.id === lead.targetHoldingId) return false;
          if (side) {
            const hRealm =
              w.characters.find((c) => c.id === h.ownerId)?.realmId ||
              w.counties?.find((ct) => ct.id === h.provinceId)?.realmId;
            return hRealm === sideRealmId && h.occupiedByRealmId && h.occupiedByRealmId !== sideRealmId;
          }
          const hRealm =
            w.characters.find((c) => c.id === h.ownerId)?.realmId ||
            w.counties?.find((ct) => ct.id === h.provinceId)?.realmId;
          return (
            (hRealm === enemyRealmId || war.targetHoldingIds.includes(h.id)) &&
            h.occupiedByRealmId !== sideRealmId
          );
        });

        const enemyFieldStrength = warArmies
          .filter((a) => Boolean(a.isDefender) !== side)
          .reduce((sum, a) => sum + (a.strength || 0), 0);

        const isWinterOrMountain =
          w.currentSeason === 'Winter' ||
          leadPos.terrainLabel === 'Mountains' ||
          leadPos.terrainLabel === 'Wetland' ||
          Boolean(lead.waypoints?.some((wp) => wp.terrainLabel === 'Mountains' || wp.terrainLabel === 'Wetland'));
        const severeAttritionCircumstance = Boolean(isWinterOrMountain && lead.strength >= 1800);
        const multiFrontCircumstance = candidateTargetHoldings.length >= 1 && lead.strength >= 1000;
        const flankingCircumstance =
          hasStrategicDoctrine && enemyFieldStrength >= Math.round(lead.strength * 0.72) && lead.strength >= 1150;

        if (!multiFrontCircumstance && !severeAttritionCircumstance && !flankingCircumstance) continue;

        // Keep strategic splits genuinely rare (~5% per step when circumstances justify it)
        if (Math.random() > 0.055) continue;

        const splitCount: 2 | 3 =
          lead.strength >= 2200 && candidateTargetHoldings.length >= 2 && Math.random() < 0.2
            ? 3
            : 2;

        const eligibleCmds = ArmyCommandEngine.getEligibleCommanders(sideRealmId, w).filter(
          (c) => c.id !== lead.commanderId
        );
        if (eligibleCmds.length < splitCount - 1) continue;

        const reason = multiFrontCircumstance
          ? 'Multi-Front Offensive'
          : severeAttritionCircumstance
          ? 'Forage & Supply Dispersion'
          : 'Pincer Envelopment';

        const splitGroupId = generateUniqueId('split');
        const baseShare = splitCount === 3 ? 0.3 : 0.45;
        const splitSpecs: Array<{ ratio: number; targetH?: Holding; offset: { dx: number; dy: number } }> = [];
        for (let k = 0; k < splitCount - 1; k++) {
          splitSpecs.push({
            ratio: baseShare,
            targetH: candidateTargetHoldings[k],
            offset: k === 0 ? { dx: 26, dy: -22 } : { dx: -24, dy: 26 },
          });
        }

        lead.isStrategicSplit = true;
        lead.splitGroupId = splitGroupId;
        lead.splitExpiresMonths = 5;
        lead.splitReason = reason;

        const totalStrengthBefore = lead.strength;
        for (let k = 0; k < splitSpecs.length; k++) {
          const spec = splitSpecs[k];
          const subCmd = eligibleCmds[k];
          if (!subCmd) continue;

          const subStrength = Math.max(180, Math.round(totalStrengthBefore * spec.ratio));
          if (lead.strength - subStrength < 320) break;

          const ratioOfCurrent = Math.max(0.15, Math.min(0.48, subStrength / Math.max(1, lead.strength)));
          const subRegiments = (lead.regiments || []).map((reg) => {
            const takeCount = Math.max(1, Math.round(reg.count * ratioOfCurrent));
            reg.count = Math.max(1, reg.count - takeCount);
            reg.maxCount = Math.max(reg.count, reg.maxCount - takeCount);
            return {
              ...reg,
              id: generateUniqueId('reg_split'),
              count: takeCount,
              maxCount: takeCount,
            };
          });

          lead.strength = Math.max(250, lead.strength - subStrength);

          const destH = spec.targetH || w.holdings?.find((h) => h.id === lead.targetHoldingId);
          const destBurg = destH
            ? w.burgs?.find((b) => `holding_${b.id}` === destH.id || b.id === destH.id)
            : undefined;
          const destProv = destH ? w.provinces?.find((p) => p.id === destH.provinceId) : undefined;
          const destX = destH && spec.targetH ? (destBurg?.x ?? destProv?.capitalX ?? lead.targetX) : lead.targetX + spec.offset.dx;
          const destY = destH && spec.targetH ? (destBurg?.y ?? destProv?.capitalY ?? lead.targetY) : lead.targetY + spec.offset.dy;
          const marchPath = computeArmyMarchPath(leadPos.x, leadPos.y, destX, destY, w);

          w.armies.push({
            id: generateUniqueId('army_wing'),
            warId: lead.warId,
            realmId: sideRealmId,
            commanderId: subCmd.id,
            commanderName: `${getCharacterRankTitle(subCmd, w)} ${subCmd.name}`,
            attackerId: lead.attackerId,
            defenderId: lead.defenderId,
            targetHoldingId: destH?.id || lead.targetHoldingId,
            regiments: subRegiments,
            startX: leadPos.x,
            startY: leadPos.y,
            targetX: destX,
            targetY: destY,
            waypoints: marchPath.waypoints,
            totalMarchCost: marchPath.totalMarchCost,
            progress: 0,
            strength: subStrength,
            speed: marchPath.speed,
            color: lead.color,
            isDefender: lead.isDefender,
            tactic: pickSmartBattleTactic(undefined, destProv?.terrain || 'Plains', Boolean(lead.isDefender), subCmd),
            isStrategicSplit: true,
            splitGroupId,
            splitExpiresMonths: 5,
            splitReason: reason,
            parentArmyId: lead.id,
          });
        }

        upsertWarChronicle(w, war.id, (rec) => {
          rec.chapters.push({
            year: w.currentYear,
            title: `Strategic Division (${reason})`,
            summary: `${lead.commanderName || 'The war host'} temporarily divided into ${splitCount} maneuvering wings for a ${reason.toLowerCase()}.`,
          });
        });
      }
    }
  }
}

// ============================================
// 7. CADET HOUSES & DYNASTIC FEUDS
// ============================================

export class DynasticFeudEngine {
  static createCadetBranch(founder: Character, estate: Holding, w: WorldState): CadetHouse | null {
    if (!canFoundCadetBranch(founder)) {
      return null;
    }
    if (!w.cadetHouses) w.cadetHouses = {};
    const parentHouse = founder.houseName || 'Ironcrown';
    const cadetName = `${parentHouse}-${estate.name.split(' ')[0]}`;
    const parentRealm = w.realms?.find((r) => r.id === founder.realmId);
    const parentArms =
      founder.coatOfArms?.config
        ? founder.coatOfArms
        : parentRealm?.heraldry?.config
        ? parentRealm.heraldry
        : undefined;
    const cadetArms = differenceCadetHouseArms(
      parentArms,
      `${founder.realmId}_${parentHouse}`,
      cadetName
    );
    const cadet: CadetHouse = {
      name: cadetName,
      parentDynasty: parentHouse,
      founderId: founder.id,
      prestige: (founder.prestige || 100) * 0.8,
      coatOfArms: cadetArms,
    };

    w.cadetHouses[cadetName] = cadet;
    founder.cadetParentHouse = parentHouse;
    founder.houseName = cadetName;
    founder.isCadetFounder = true;
    founder.isNobleHouse = true;
    founder.hasPersonalBanner = true;
    founder.coatOfArms = cloneCoatOfArmsData(cadetArms);
    syncWorldBanners(w);

    w.history.unshift({
      id: generateUniqueId('hist_cadet'),
      year: w.currentYear,
      title: `Cadet Branch Founded: ${cadetName}`,
      category: 'Dynastic Drama',
      description: `${founder.name} has split from House ${parentHouse} to establish cadet House ${cadetName} at ${estate.name}, bearing slightly differenced arms (${cadetArms.blazon || 'differenced arms'})!`,
      primaryActorId: founder.id,
      realmId: founder.realmId,
    });

    return cadet;
  }

  static declareFeud(houseAName: string, houseBName: string, reason: string, w: WorldState): void {
    if (!w.cadetHouses) w.cadetHouses = {};
    const houseA = w.cadetHouses[houseAName];
    if (houseA) {
      houseA.feudTargetDynasty = houseBName;
      houseA.feudReason = reason;
    }

    w.history.unshift({
      id: generateUniqueId('hist_feud'),
      year: w.currentYear,
      title: `Blood Feud Sworn: ${houseAName} vs ${houseBName}`,
      category: 'Dynastic Drama',
      description: `House ${houseAName} has sworn a Dynastic Vendetta against ${houseBName} over ${reason}!`,
    });
  }
}

// ============================================
// 8. JUSTICE & COURT TRIALS
// ============================================

export class JusticeEngine {
  static accuse(
    accuser: Character,
    accused: Character,
    crime: CrimeType,
    w: WorldState
  ): { convicted: boolean; punishment?: PunishmentType; summary: string } {
    if (!accused.crimes) accused.crimes = [];
    accused.crimes.push({
      crimeType: crime,
      perpetratorId: accused.id,
      victimId: accuser.id,
      evidenceStrength: 0.85,
      monthRecorded: w.month || 0,
      discoveredById: accuser.id,
    });

    const judgeId = w.monarchId || w.characters[0]?.id;
    if (w.favors) {
      const debtIdx = w.favors.findIndex(
        (f) => f.creditorId === accused.id && f.debtorId === judgeId
      );
      if (debtIdx >= 0) {
        w.favors.splice(debtIdx, 1);
        accused.isImprisoned = false;
        if (accused.v17Traits) accused.v17Traits = accused.v17Traits.filter((t) => t !== 'Imprisoned');
        accused.loyalty = Math.max(accused.loyalty ?? 58, 58);
        if (w.factions) {
          w.factions = w.factions
            .map((f) => ({ ...f, members: f.members.filter((m) => m !== accused.id) }))
            .filter((f) => f.members.length > 0);
        }
        const summary = `PARDON: ${accused.name} cashed in an ancient debt over the Crown, forcing all charges of ${crime} to be dismissed!`;
        w.history.unshift({
          id: generateUniqueId('hist_pardon'),
          year: w.currentYear,
          title: `Royal Pardon: ${accused.name}`,
          category: 'Dynastic Drama',
          description: summary,
          primaryActorId: accused.id,
          realmId: accused.realmId,
        });
        return { convicted: false, summary };
      }
    }

    const accusedGravitas = computeTotalGravitas(
      accused.organicGravitas || {
        militaryAutonomy: 90,
        economicExtraction: 45,
        populistLoyalty: 70,
        lineagePrestige: 90,
        sovereignDebtHeld: 0,
      }
    );
    let gravitasShield = Math.min(0.42, (accusedGravitas / 1000.0) * 0.42);
    if (w.realmLaws?.justice === 'Noble Immunity') gravitasShield = Math.min(0.58, gravitasShield * 1.35);

    let odds = 0.72 - gravitasShield;
    if (w.realmLaws?.justice === 'Draconian') odds += 0.20;
    odds = Math.max(0.18, Math.min(0.95, odds));

    if (Math.random() < odds) {
      let punishment: PunishmentType = 'Dungeon';
      if (crime === 'Treason' || crime === 'Kingsblood' || crime === 'Murder') {
        punishment = 'Execution';
      } else if (crime === 'Heresy' || crime === 'Adultery') {
        punishment = 'Monastery';
      } else if (crime === 'Embezzlement' || crime === 'Tax Evasion') {
        punishment = 'Fine';
      } else if (crime === 'Refuse Levy' || crime === 'Plot Against Liege') {
        punishment = 'Revocation';
      }

      JusticeEngine.applySentence(accused, punishment, w);
      const summary = `CONVICTED: ${accused.name} was found guilty of ${crime} and sentenced to ${punishment}!`;

      w.history.unshift({
        id: generateUniqueId('hist_conviction'),
        year: w.currentYear,
        title: `Royal Judgement: ${accused.name}`,
        category: 'Dynastic Drama',
        description: summary,
        primaryActorId: accused.id,
        realmId: accused.realmId,
      });

      return { convicted: true, punishment, summary };
    } else {
      const summary = `ACQUITTAL: ${accused.name} leveraged noble immunity and court influence to escape all charges of ${crime}.`;
      accused.paranoia = Math.min(100, (accused.paranoia || 10) + 20);

      w.history.unshift({
        id: generateUniqueId('hist_acquit'),
        year: w.currentYear,
        title: `Trial Acquittal: ${accused.name}`,
        category: 'Dynastic Drama',
        description: summary,
        primaryActorId: accused.id,
        realmId: accused.realmId,
      });

      return { convicted: false, summary };
    }
  }

  static applySentence(accused: Character, p: PunishmentType, w: WorldState): void {
    if (p === 'Execution') {
      const execDeath = pickContextualDeathCause(accused, 'execution');
      killCharacter(accused, execDeath.cause, w, 'Execution');
    } else if (p === 'Mutilation') {
      const traits = accused.v17Traits || accused.personalityTraits || [];
      const injury = Math.random() < 0.5 ? 'Maimed' : 'Blinded';
      if (!traits.includes(injury)) traits.push(injury);
      accused.v17Traits = traits;
      accused.stress = Math.min(300, accused.stress + 60);
    } else if (p === 'Revocation') {
      const newOwner = w.monarchId || accused.liegeId || '';
      if (w.holdings) {
        for (const h of w.holdings) {
          if (h.ownerId === accused.id) {
            h.ownerId = newOwner;
            const matchingBurg = w.burgs?.find(b => b.id === h.id || `holding_${b.id}` === h.id);
            if (matchingBurg) matchingBurg.ownerId = newOwner;
          }
        }
      }
    } else if (p === 'Banishment') {
      accused.isBanished = true;
      if (accused.courtPosition) accused.courtPosition.orbit = 'NONE';
      const traits = accused.v17Traits || accused.personalityTraits || [];
      if (!traits.includes('Exiled')) traits.push('Exiled');
      accused.v17Traits = traits;
    } else if (p === 'Dungeon') {
      accused.isImprisoned = true;
      if (accused.courtPosition) accused.courtPosition.orbit = 'NONE';
      const traits = accused.v17Traits || accused.personalityTraits || [];
      if (!traits.includes('Imprisoned')) traits.push('Imprisoned');
      accused.v17Traits = traits;
    } else if (p === 'Monastery') {
      accused.isMonk = true;
      if (accused.courtPosition) accused.courtPosition.orbit = 'NONE';
    } else if (p === 'Fine') {
      const fine = Math.min(accused.treasury || 40, 35);
      accused.treasury = Math.max(0, (accused.treasury || 0) - fine);
    }
  }
}

// ============================================
// 9. AUTONOMOUS AI BRAIN & FACTIONS
// ============================================

export class AutonomousAIBrain {
  static act(c: Character, w: WorldState): void {
    const isObserverMode = w.playerRealmId === null;
    const playerRealm = isObserverMode
      ? undefined
      : w.playerRealmId
      ? w.realms?.find((r) => r.id === w.playerRealmId)
      : w.realms?.[0];
    const playerMonarchId = isObserverMode ? undefined : playerRealm?.rulerId || w.monarchId;

    if (!c.isAlive || c.isMonk || (playerMonarchId && c.id === playerMonarchId)) return;

    const cTraits = collectAllCharacterTraits(c);
    const disp = computeDispositionModifiers(cTraits);
    const gravitasWeight = computeAIStrategyWeight(cTraits, 'SOVEREIGN_GRAVITAS');
    const rebellionWeight = computeAIStrategyWeight(cTraits, 'FACTION_REBELLION');

    const primaryRealm = w.realms?.find((r) => r.id === c.realmId);
    const isRealmMonarch = Boolean(primaryRealm && primaryRealm.rulerId === c.id);
    const isPlayerRealmVassal = Boolean(playerRealm && c.realmId === playerRealm.id && !isRealmMonarch);

    const heldExclaveProvs = (w.provinces || []).filter(
      (p) =>
        p.isExclave &&
        (p.id === c.provinceId || (w.holdings || []).some((h) => h.ownerId === c.id && h.provinceId === p.id))
    );
    const isInExclave = !isRealmMonarch && heldExclaveProvs.length > 0;

    // 1. Self-Ransom from Dungeons (blocked during Civil War or active rebel war)
    if (c.isImprisoned) {
      const inRebelWar = (w.activeWars || []).some(
        (war) => war.attackerLeaderId === c.id || war.defenderLeaderId === c.id
      );
      if (w.realmState !== 'Civil War' && !inRebelWar) {
        const ransomCost = c.titleTier === 'King' || c.titleTier === 'Emperor' ? 420 : c.titleTier === 'Duke' ? 240 : 120;
        const cRealm = w.realms?.find((r) => r.rulerId === c.id);
        const canUseCrown = Boolean(cRealm && (cRealm.treasury ?? 0) >= ransomCost);
        if (canUseCrown || (c.treasury || 0) >= ransomCost) {
          const captorId = c.liegeId || w.monarchId;
          const captor = w.characters.find((x) => x.id === captorId);
          if (captor && captor.id !== c.id) {
            if (canUseCrown && cRealm) {
              cRealm.treasury = Math.round(((cRealm.treasury ?? 0) - ransomCost) * 10) / 10;
              recordRealmBudgetExtra(cRealm, w, 'ransomsPaid', ransomCost);
              // Collect emergency Feudal Ransom Aid from solvent vassals for a captive monarch
              let aidCollected = 0;
              for (const v of w.characters) {
                if (v.isAlive && v.realmId === cRealm.id && v.id !== c.id && (v.treasury || 0) >= 40) {
                  const vShare = Math.min(18, Math.round((v.treasury || 0) * 0.05));
                  if (vShare >= 2) {
                    v.treasury = Math.round(((v.treasury || 0) - vShare) * 10) / 10;
                    aidCollected += vShare;
                  }
                }
              }
              if (aidCollected > 0) {
                cRealm.treasury = Math.round(((cRealm.treasury ?? 0) + aidCollected) * 10) / 10;
                recordRealmBudgetExtra(cRealm, w, 'scutageAndAidsIncome', aidCollected);
              }
            } else {
              c.treasury = Math.round(((c.treasury || 0) - ransomCost) * 10) / 10;
            }
            captor.treasury = Math.round(((captor.treasury || 0) + ransomCost) * 10) / 10;
            c.isImprisoned = false;
            c.loyalty = 58;
            if (c.v17Traits) c.v17Traits = c.v17Traits.filter((t) => t !== 'Imprisoned');
            if (w.factions) {
              w.factions = w.factions
                .map((f) => ({ ...f, members: f.members.filter((m) => m !== c.id) }))
                .filter((f) => f.members.length > 0);
            }
            w.history.unshift({
              id: generateUniqueId('hist_ransom'),
              year: w.currentYear,
              title: `Ransom Paid: ${c.name}`,
              category: 'Dynastic Drama',
              description: `${c.name} paid a ${ransomCost}g ransom to ${captor.name} for freedom!`,
              primaryActorId: c.id,
              realmId: c.realmId,
            });
          }
        }
      }
      return;
    }

    // Dynamic loyalty drift for vassals (responds to character interactions, traits, affinity, house prestige & exclave separation)
    const effectiveLiegeId = c.liegeId || (!isRealmMonarch ? primaryRealm?.rulerId : undefined);
    if (effectiveLiegeId && !isRealmMonarch) {
      const liege = w.characters.find((x) => x.id === effectiveLiegeId);
      const targetLoyalty = computeDynamicLoyaltyTarget(c, w, { isInExclave });
      if (isInExclave && liege) {
        if (!c.opinions) c.opinions = {};
        if ((c.opinions[liege.id] ?? 0) > -45) {
          c.opinions[liege.id] = Math.max(-45, (c.opinions[liege.id] ?? 0) - 2);
        }
      }
      c.loyalty = Math.max(5, Math.min(100, Math.round((c.loyalty ?? targetLoyalty) * 0.72 + targetLoyalty * 0.28)));
    }

    // 2. Emergency Bastard Legitimization
    const kids = (c.children || []).map((id) => w.characters.find((k) => k.id === id)).filter(Boolean) as Character[];
    const legitKids = kids.filter((k) => !(k.v17Traits || []).includes('Bastard') && !k.isMonk && k.isAlive);
    if (legitKids.length === 0 && c.age > 45) {
      const bastards = kids.filter((k) => (k.v17Traits || []).includes('Bastard') && k.isAlive);
      if (bastards.length > 0) {
        const chosen = bastards[0];
        chosen.v17Traits = (chosen.v17Traits || []).filter((t) => t !== 'Bastard');
        chosen.v17Traits.push('Legitimized_Bastard');
        const legitRealm = w.realms?.find((r) => r.id === c.realmId);
        if (legitRealm && legitRealm.rulerId === c.id) {
          const sovRank = getRealmSovereignRank(legitRealm, c.gender);
          const sovTier = c.titleTier || sovRank.titleTier;
          chosen.role = sovRank.isRoyalOrHigher ? 'Crown Heir' : 'Heir';
          const hStyle = getHeirStyleForRealm(legitRealm, sovTier, chosen.gender || 'male');
          chosen.titleTier = hStyle.titleTier;
          chosen.title = hStyle.title;
        } else {
          chosen.role = 'Vassal Heir';
        }
        c.stress = Math.min(300, c.stress + 15);
        w.history.unshift({
          id: generateUniqueId('hist_legit'),
          year: w.currentYear,
          title: `Dynastic Legitimization: ${chosen.name}`,
          category: 'Dynastic Drama',
          description: `Facing dynastic extinction, ${c.name} issued a decree legitimizing ${chosen.name} as heir!`,
          primaryActorId: c.id,
          secondaryActorId: chosen.id,
          realmId: c.realmId,
        });
      }
    }

    // 3. Proactive Guardianship & Fostering (Kids 6-16)
    for (const kidId of c.children || []) {
      const kid = w.characters.find((k) => k.id === kidId);
      if (kid && kid.age >= 6 && kid.age < 16 && !kid.guardianId) {
        const potentialGuardians = w.characters.filter(
          (x) => x.age >= 25 && !x.isImprisoned && !x.isMonk && x.id !== kid.id
        );
        if (potentialGuardians.length > 0) {
          const mentor = potentialGuardians[Math.floor(Math.random() * potentialGuardians.length)];
          kid.guardianId = mentor.id;
        }
      }
    }

    // 4. Intrigue Schemes (Gated by moral personality & trait weights instead of raw flat rolls)
    const intrigueStat = getCharacterV17Stat(c, 'INTRIGUE', w);
    const hasMurderScruples =
      (cTraits.includes('Compassionate') || cTraits.includes('Honest') || cTraits.includes('Forgiving') || cTraits.includes('Just')) &&
      !(cTraits.includes('Vengeful') || cTraits.includes('Sadistic') || cTraits.includes('Deceitful') || cTraits.includes('Callous'));
    const hasSchemerNature =
      c.aiArchetype === 'Ruthless Schemer' ||
      cTraits.includes('Deceitful') ||
      cTraits.includes('Sadistic') ||
      cTraits.includes('Callous') ||
      cTraits.includes('Vengeful') ||
      cTraits.includes('Master Schemer') ||
      cTraits.includes('Elusive Shadow');

    const murderChance = hasMurderScruples
      ? 0
      : Math.min(0.08, 0.015 * gravitasWeight * disp.amb_mult * (hasSchemerNature ? 2.1 : 0.45));

    if (!c.activeScheme && (intrigueStat >= 11 || (c.ambitionScore || 0) > 60 || hasSchemerNature)) {
      const rivalTarget = w.characters.find(
        (x) => x.isAlive && x.id !== c.id && (x.id === c.rivalId || (c.opinions?.[x.id] ?? 0) < -35)
      );
      if (rivalTarget && !hasMurderScruples && Math.random() < murderChance) {
        c.activeScheme = {
          type: 'Murder',
          targetId: rivalTarget.id,
          targetName: rivalTarget.name,
          motive: 'Blood Feud & Court Ambition',
          progress: 12,
        };
      } else if (
        isRealmMonarch &&
        w.holdings &&
        w.holdings.length > 0 &&
        !cTraits.includes('Content') &&
        !cTraits.includes('Honest') &&
        Math.random() < 0.018 * gravitasWeight * disp.amb_mult
      ) {
        const targetH = w.holdings.find((h) => h.ownerId && h.ownerId !== c.id);
        const ownerChar = targetH?.ownerId ? w.characters.find((x) => x.id === targetH.ownerId) : undefined;
        if (targetH?.ownerId) {
          c.activeScheme = {
            type: 'Fabricate Claim',
            targetId: targetH.ownerId,
            targetName: ownerChar?.name || targetH.name,
            motive: `Rightful Title over ${targetH.name}`,
            progress: 15,
          };
        }
      }
    }

    // 5. Embezzlement by Greedy Councilors (Curbed by Disclosure, Judiciary, Media & E-Governance)
    const ps = w.politicalSystem;
    const antiCorruptionShield =
      (ps?.financialDisclosure === 'Real-Time Public Disclosure' ? 0.35 : 0) +
      (ps?.judiciary === 'Independent Judiciary & Oversight' ? 0.25 : 0) +
      (ps?.revolvingDoor === 'Mandatory Cooling-Off' ? 0.15 : 0) +
      (ps?.eGovernance === 'Open Data & E-Services' ? 0.15 : 0);
    const embezzlementChance = Math.max(0.008, 0.06 * (1 - antiCorruptionShield));

    if (cTraits.includes('Greedy') && c.courtPosition?.orbit !== 'NONE' && Math.random() < embezzlementChance) {
      const monarch = w.characters.find((x) => x.id === w.monarchId);
      const embezzledRealm = monarch ? w.realms.find((r) => r.rulerId === monarch.id || r.id === monarch.realmId) : undefined;
      const crownVault = embezzledRealm?.treasury ?? monarch?.treasury ?? 0;
      if (monarch && crownVault > 400) {
        const stolen = Math.min(Math.round(crownVault * 0.05), 320);
        if (embezzledRealm?.treasury !== undefined) {
          embezzledRealm.treasury = Math.max(0, Math.round((embezzledRealm.treasury - stolen) * 10) / 10);
        } else {
          monarch.treasury = Math.max(0, Math.round(((monarch.treasury || 1000) - stolen) * 10) / 10);
        }
        c.treasury = Math.round(((c.treasury || 0) + stolen) * 10) / 10;
        const detectChance =
          0.50 +
          (ps?.financialDisclosure === 'Real-Time Public Disclosure' ? 0.25 : 0) +
          (ps?.mediaIndependence === 'Independent & Local Media' ? 0.20 : 0);
        if (Math.random() < Math.min(0.95, detectChance)) {
          JusticeEngine.accuse(monarch, c, 'Embezzlement', w);
          if (w.governanceHealth) {
            w.governanceHealth.crisisCatalystMonths = Math.max(w.governanceHealth.crisisCatalystMonths || 0, 6);
            w.governanceHealth.crisisCatalystReason = `Embezzlement Scandal (${c.name})`;
          }
        }
      }
    }

    // ==========================================
    // ECONOMIC CRISIS MANAGEMENT (GRAND STRATEGY AI)
    // ==========================================
    const fiscal = w.economy?.fiscalProfiles?.[c.id];
    const effectiveTreasury = isRealmMonarch && primaryRealm?.treasury !== undefined ? primaryRealm.treasury : (c.treasury || 0);

    // If Crown Fisc / personal treasury is dangerously low or bleeding money
    if (fiscal && effectiveTreasury < 65) {
      const isMonarch = c.id === w.monarchId;
      const isLandedRuler = isRealmMonarch || c.titleTier === 'Duke' || c.titleTier === 'Count';
      let crisisResolved = false;

      // 0. SOVEREIGN DOMESTIC CREDIT POOL FIRST (for Monarchs facing Crown Fisc deficit)
      if (isRealmMonarch && primaryRealm && effectiveTreasury < 45) {
        const domRes = takeDomesticRealmLoan(primaryRealm.id, w);
        if (domRes.success) {
          crisisResolved = true;
        }
      }

      // 1. ATTEMPT TO SECURE A BANK LOAN (Only landed rulers in actual deficit crisis)
      if (
        !crisisResolved &&
        isLandedRuler &&
        effectiveTreasury < 45 &&
        fiscal.netMonthlyCashflow < 0 &&
        w.economy &&
        w.economy.bankInstitutions
      ) {
        if (fiscal.debtServicing < fiscal.totalRevenue * 0.4) {
          const desiredLoan = Math.min(300, Math.max(120, Math.round((fiscal.totalRevenue || 20) * 6)));
          for (const bank of w.economy.bankInstitutions) {
            if (bank.isSolvent && bank.treasury >= desiredLoan) {
              const loanAmount = desiredLoan;
              const res = takeBankLoan(w, bank.id, c.id, loanAmount);
              if (res.success) {
                crisisResolved = true;
                w.history.unshift({
                  id: generateUniqueId('hist_ai_loan'),
                  year: w.currentYear,
                  title: `Emergency Loan: ${c.name}`,
                  category: 'Dynastic Drama',
                  description: `${c.name} secured a ${loanAmount}g sovereign bond from ${bank.name} to avert bankruptcy.`,
                  primaryActorId: c.id,
                  realmId: c.realmId,
                });
                break;
              }
            }
          }
        }
      }

      // 2. MONETARY DEBASEMENT (only in severe treasury crisis & minimum 3-year cooldown)
      if (!crisisResolved && isMonarch && w.economy && effectiveTreasury < 65) {
        const currentPurity = w.economy.realmCoinPurity[c.realmId] ?? 1.0;
        const lastDebaseYear = primaryRealm?.lastDebasementYear;
        const cooldownElapsed = lastDebaseYear === undefined || (w.currentYear - lastDebaseYear) >= 3;
        const willDebase =
          cooldownElapsed &&
          currentPurity > 0.45 &&
          (cTraits.includes('Greedy') ||
            cTraits.includes('Arbitrary') ||
            cTraits.includes('Callous') ||
            effectiveTreasury < 35);

        if (willDebase) {
          const { success, lumpSumGained, newPurity } = debaseCurrency(w, c.realmId, 0.1);
          if (success) {
            if (primaryRealm) primaryRealm.lastDebasementYear = w.currentYear;
            crisisResolved = true;
            w.history.unshift({
              id: generateUniqueId('hist_ai_debase'),
              year: w.currentYear,
              title: `Crown Debases Currency!`,
              category: 'Great Cataclysm',
              description: `Facing severe sovereign debt, ${c.name} ordered the royal mints to debase the currency to ${(newPurity * 100).toFixed(0)}% purity, seizing ${lumpSumGained}g bullion!`,
              primaryActorId: c.id,
              realmId: c.realmId,
            });
          }
        }
      }

      // 3. AUSTERITY MEASURES (Disband Men-at-Arms)
      if (!crisisResolved && fiscal.netMonthlyCashflow < 0 && (c.menAtArms || 0) > 40) {
        const deficit = Math.abs(fiscal.netMonthlyCashflow);
        const troopsToFire = Math.min(c.menAtArms || 0, Math.ceil(deficit * 6));

        c.menAtArms = Math.max(0, (c.menAtArms || 0) - troopsToFire);
        c.prestige = Math.max(0, (c.prestige || 100) - 20);
        c.stress = Math.min(300, (c.stress || 0) + 15);

        w.history.unshift({
          id: generateUniqueId('hist_ai_austerity'),
          year: w.currentYear,
          title: `Austerity in House ${c.houseName}`,
          category: 'Dynastic Drama',
          description: `Unable to pay wages, ${c.name} disbanded ${troopsToFire} men-at-arms to balance the ledger.`,
          primaryActorId: c.id,
          realmId: c.realmId,
        });
      }
    }

    // 6. Domestic Factions & Exclave Rebellion Coalitions (Weighted by FACTION_REBELLION, par_mult, and Exclave isolation)
    const monarch = w.characters.find((x) => x.id === w.monarchId);
    const myOpinionOfMonarch = monarch ? (c.opinions?.[monarch.id] ?? 15) : 15;
    const isFriendOfMonarch = Boolean(monarch && (c.friendId === monarch.id || myOpinionOfMonarch >= 35));
    const isRivalOrHostile = Boolean(monarch && (c.rivalId === monarch.id || myOpinionOfMonarch <= -15));
    const monarchGrav = monarch ? computeTotalGravitas(monarch.organicGravitas || { militaryAutonomy: 120, economicExtraction: 80, populistLoyalty: 100, lineagePrestige: 120, sovereignDebtHeld: 0 }) : 350;
    const cGrav = computeTotalGravitas(c.organicGravitas || { militaryAutonomy: 60, economicExtraction: 35, populistLoyalty: 65, lineagePrestige: 80, sovereignDebtHeld: 0 });
    const gravitasDeterrence = monarchGrav > cGrav * 1.85 ? 0.5 : 1.0;

    const passivePeaceful = (cTraits.includes('Craven') || cTraits.includes('Content') || cTraits.includes('Trusting')) && !isInExclave;
    const loyaltyGate = isInExclave ? 50 : 34;
    const factionProb = Math.min(
      0.32,
      (passivePeaceful ? 0.008 : 0.055) * rebellionWeight * disp.par_mult * gravitasDeterrence * (isInExclave ? 2.5 : 1.0)
    );

    if (
      isPlayerRealmVassal &&
      monarch &&
      (!isFriendOfMonarch || isInExclave) &&
      ((c.loyalty ?? 58) < loyaltyGate || isRivalOrHostile || isInExclave) &&
      ((c.ambitionScore || 50) > 45 || cTraits.includes('Ambitious') || isRivalOrHostile || isInExclave) &&
      Math.random() < factionProb
    ) {
      if (!w.factions) w.factions = [];
      let faction = w.factions.find((f) => f.members.includes(c.id) || f.leaderId === c.id);
      if (!faction) {
        const factionNames = isInExclave
          ? [
              `The ${heldExclaveProvs[0].name} Separatist League`,
              `House ${c.houseName}'s Frontier Compact`,
              'The Severed Marches Coalition',
            ]
          : [
              'The Liberty League',
              'The Baronial Fronde',
              'The Sovereign Compact',
              `House ${c.houseName}'s Pact`,
            ];
        const chosenName = factionNames[w.factions.length % factionNames.length];
        faction = {
          id: generateUniqueId('fact'),
          leaderId: c.id,
          name: chosenName,
          members: [c.id],
          ultimatumIssued: false,
        };
        w.factions.push(faction);
        w.history.unshift({
          id: generateUniqueId('hist_faction'),
          year: w.currentYear,
          title: `Faction Formed: ${chosenName}`,
          category: 'Dynastic Drama',
          description: isInExclave
            ? `Isolated from royal protection in ${heldExclaveProvs[0].name}, ${c.name} rallied discontented locals into ${chosenName}.`
            : `Discontented nobles led by ${c.name} founded ${chosenName} to check royal overreach.`,
          primaryActorId: c.id,
          realmId: c.realmId,
        });
      } else if (faction.leaderId === c.id) {
        const potentialMembers = w.characters.filter(
          (x) =>
            x.isAlive &&
            x.realmId === c.realmId &&
            !faction!.members.includes(x.id) &&
            x.id !== w.monarchId &&
            x.friendId !== w.monarchId &&
            (x.opinions?.[w.monarchId || ''] ?? 15) < 15 &&
            ((x.loyalty ?? 58) < 42 || (x.opinions?.[w.monarchId || ''] ?? 0) <= -20)
        );
        if (potentialMembers.length > 0) {
          faction.members.push(potentialMembers[0].id);
        }
      }

      const factionLevies = faction.members.reduce((acc, mid) => {
        const noble = w.characters.find((x) => x.id === mid);
        return acc + (noble ? calculateCharacterFeudalStanding(noble, w).totalLevies : 0);
      }, 0);

      const crownLevies = monarch ? calculateCharacterFeudalStanding(monarch, w).totalLevies : 500;
      const ultimatumThreshold = isInExclave ? 0.55 : monarchGrav >= 650 ? 0.95 : 0.80;

      if (factionLevies > crownLevies * ultimatumThreshold && !faction.ultimatumIssued) {
        faction.ultimatumIssued = true;
        w.history.unshift({
          id: generateUniqueId('hist_ultimatum'),
          year: w.currentYear,
          title: `Ultimatum: ${faction.name}`,
          category: 'Dynastic Drama',
          description: `The ${faction.name} coalition has massed its armies and issued an ultimatum to the Crown demanding autonomous liberties!`,
          realmId: c.realmId,
        });

        if (monarch && (collectAllCharacterTraits(monarch).includes('Craven') || (w.hegemony || 1) < 0.75)) {
          if (w.realmLaws) {
            w.realmLaws.authority = 'Autonomous';
          }
          w.factions = w.factions.filter((f) => f.id !== faction!.id);
        } else {
          w.realmState = 'Civil War';
        }
      }
    }

    // 6B. Exclave Secession Revolt (Cut-off provinces in ANY realm separated from capital declare independence when loyalty breaks)
    if (
      isInExclave &&
      !isRealmMonarch &&
      (c.loyalty ?? 55) < 30 &&
      c.age >= 16 &&
      heldExclaveProvs[0] &&
      Math.random() < Math.min(0.28, 0.08 * Math.max(0.5, rebellionWeight))
    ) {
      triggerExclaveRebellion(c, heldExclaveProvs[0], w);
      return;
    }

    // 7. Sovereign External Claims & Trait-Gated Diplomacy-Aware Wars
    const activeWarCount = (w.activeWars || []).length;
    const maxConcurrentWars = Math.max(2, Math.floor((w.realms?.length || 2) / 2));

    if (isRealmMonarch && w.holdings && w.holdings.length > 0) {
      const ownProvNeighbors = new Set<string>();
      for (const p of w.provinces || []) {
        if (p.realmId === c.realmId) {
          for (const nid of p.neighbors || []) ownProvNeighbors.add(nid);
        }
      }

      const canFabricateClaims =
        !cTraits.includes('Content') &&
        !(cTraits.includes('Honest') && !cTraits.includes('Ambitious') && !cTraits.includes('Wrathful'));
      const claimMotivation =
        (cTraits.includes('Ambitious') || cTraits.includes('Wrathful') || cTraits.includes('Greedy') || c.aiArchetype === 'Warmonger Vanguard' ? 1.5 : 0.45) *
        disp.amb_mult;

      if (
        canFabricateClaims &&
        (!c.claims || c.claims.length < 3) &&
        (c.treasury || 0) >= 350 &&
        Math.random() < Math.min(0.12, 0.032 * claimMotivation)
      ) {
        const foreignHoldings = w.holdings.filter((h) => {
          const owner = w.characters.find((x) => x.id === h.ownerId && x.isAlive);
          return (
            owner &&
            owner.realmId !== c.realmId &&
            !RealmDiplomacyEngine.areRealmsAllied(c.realmId, owner.realmId, w) &&
            !RealmDiplomacyEngine.isUnderTruce(c.realmId, owner.realmId, w) &&
            owner.id !== c.spouseId &&
            owner.id !== c.friendId &&
            !c.claims?.some((cl) => cl.holdingId === h.id)
          );
        });
        if (foreignHoldings.length > 0) {
          const borderHoldings = foreignHoldings.filter((h) => ownProvNeighbors.has(h.provinceId));
          const candidatePool = borderHoldings.length > 0 ? borderHoldings : foreignHoldings;
          const enemyHoldings = candidatePool.filter((h) => {
            const owner = w.characters.find((x) => x.id === h.ownerId);
            return owner ? RealmDiplomacyEngine.areRealmsEnemies(c.realmId, owner.realmId, w) : false;
          });
          const pool = enemyHoldings.length > 0 && Math.random() < 0.75 ? enemyHoldings : candidatePool;
          const targetH = pool[Math.floor(Math.random() * pool.length)];
          ClaimAndWarEngine.fabricateClaim(c, targetH, w);
        }
      }

      if (
        activeWarCount < maxConcurrentWars &&
        c.claims &&
        c.claims.length > 0 &&
        (c.treasury || 0) >= 240 &&
        (c.menAtArms || 0) >= 40
      ) {
        const claimToPress = c.claims.find((cl) => {
          const h = w.holdings?.find((hh) => hh.id === cl.holdingId);
          const owner = h ? w.characters.find((x) => x.id === h.ownerId && x.isAlive) : undefined;
          if (!h || !owner || owner.id === c.id) return false;
          if (owner.realmId === c.realmId) return false;
          if (owner.id === c.spouseId || owner.id === c.friendId) return false;
          if (RealmDiplomacyEngine.areRealmsAllied(c.realmId, owner.realmId, w)) return false;
          if (RealmDiplomacyEngine.isUnderTruce(c.realmId, owner.realmId, w)) return false;
          const existingWar = ClaimAndWarEngine.findActiveWarBetweenRealms(c.realmId, owner.realmId, w);
          if (existingWar && existingWar.targetHoldingIds.includes(h.id)) return false;
          return true;
        });
        if (claimToPress) {
          const h = w.holdings?.find((hh) => hh.id === claimToPress.holdingId);
          const targetOwner = h ? w.characters.find((x) => x.id === h.ownerId) : undefined;
          const isEnemyState = targetOwner ? RealmDiplomacyEngine.areRealmsEnemies(c.realmId, targetOwner.realmId, w) : false;
          const targetOp = targetOwner ? (c.opinions?.[targetOwner.id] ?? 0) : 0;
          const tensionBoost = (isEnemyState ? 0.08 : 0) + (targetOwner?.id === c.rivalId ? 0.06 : targetOp <= -25 ? 0.04 : 0);

          const isPacifist = cTraits.includes('Content') || cTraits.includes('Craven') || cTraits.includes('Calm');
          const isWarmonger =
            cTraits.includes('Ambitious') ||
            cTraits.includes('Wrathful') ||
            cTraits.includes('Brave') ||
            cTraits.includes('Aggressive Attacker') ||
            c.aiArchetype === 'Warmonger Vanguard';
          const warDesireBase = isPacifist ? 0.008 : isWarmonger ? 0.075 : 0.032;
          const warDesire = Math.min(0.28, (warDesireBase + tensionBoost) * disp.amb_mult * Math.max(0.35, rebellionWeight * 0.7));
          if (Math.random() < warDesire) {
            ClaimAndWarEngine.declareClaimantWar(c, claimToPress, w);
          }
        }
      }
    }
  }
}

// ============================================
// 10. CIVIL WAR & FOREIGN INVASIONS
// ============================================

export class CivilWarEngine {
  static resolve(w: WorldState): void {
    const monarch = w.characters.find((c) => c.id === w.monarchId);
    const activeFaction = (w.factions || []).find((f) => f.ultimatumIssued);
    if (!monarch || !activeFaction) {
      w.realmState = 'Balanced Feudalism';
      return;
    }

    const rebelMembers = activeFaction.members
      .map((mid) => w.characters.find((c) => c.id === mid))
      .filter(Boolean) as Character[];
    if (rebelMembers.length === 0) {
      w.factions = (w.factions || []).filter((f) => f.id !== activeFaction.id);
      w.realmState = 'Balanced Feudalism';
      return;
    }

    const rebelLevies = rebelMembers.reduce(
      (acc, m) => acc + calculateCharacterFeudalStanding(m, w).totalLevies,
      0
    );
    const monarchLevies = calculateCharacterFeudalStanding(monarch, w).totalLevies;

    const rebelPower = rebelLevies * (0.8 + Math.random() * 0.4);
    const crownPower = monarchLevies * (0.8 + Math.random() * 0.4);

    if (rebelPower > crownPower) {
      const rebelLeader = w.characters.find((c) => c.id === activeFaction.leaderId);
      const capitalHolding = w.holdings?.find((h) => h.ownerId === monarch.id);

      if (rebelLeader && capitalHolding) {
        const rebellionClaim = {
          holdingId: capitalHolding.id,
          claimantId: rebelLeader.id,
          isPressed: true,
          isStrong: true,
        };

        ClaimAndWarEngine.declareClaimantWar(rebelLeader, rebellionClaim, w);

        w.history.unshift({
          id: generateUniqueId('hist_cw_start'),
          year: w.currentYear,
          title: `Civil War Erupts!`,
          category: 'War & Conquest',
          description: `The ${activeFaction.name} has raised their banners in open rebellion against the Crown! Armies are on the march.`,
          realmId: monarch.realmId,
        });
      }
      w.factions = (w.factions || []).filter((f) => f.id !== activeFaction.id);
    } else {
      w.realmState = 'Absolute Autocracy';
      for (const rebel of rebelMembers) {
        rebel.isImprisoned = true;
        if (!rebel.v17Traits) rebel.v17Traits = [];
        if (!rebel.v17Traits.includes('Imprisoned')) rebel.v17Traits.push('Imprisoned');
      }
      w.history.unshift({
        id: generateUniqueId('hist_cw_crushed'),
        year: w.currentYear,
        title: `Civil War: Rebellion Crushed!`,
        category: 'War & Conquest',
        description: `The royal host smashed the rebel coalition! All traitorous lords cast into dungeons.`,
        realmId: monarch.realmId,
      });
    }

    w.factions = (w.factions || []).filter((f) => f.id !== activeFaction.id);
  }
}

export class ForeignInvasionEngine {
  static step(w: WorldState): void {
    const monarch = w.characters.find((c) => c.id === w.monarchId);
    if (!monarch || !w.foreignNations) return;

    for (const nation of w.foreignNations) {
      if (nation.truceMonths > 0) {
        nation.truceMonths -= 1;
        continue;
      }

      if (Math.random() < (nation.threatLevel / 100.0) * 0.08) {
        w.realmState = 'Foreign Invasion';
        const realmLevies = w.characters
          .filter((c) => c.isAlive && c.realmId === monarch.realmId)
          .reduce((acc, c) => {
            const st = calculateCharacterFeudalStanding(c, w);
            return acc + st.demesneLevies + st.menAtArms;
          }, 0);
        const invaderPower = nation.militaryStrength * (0.85 + Math.random() * 0.3);

        const invRealm = w.realms.find((r) => r.rulerId === monarch.id || r.id === monarch.realmId);
        if (realmLevies >= invaderPower) {
          if (invRealm?.treasury !== undefined) invRealm.treasury = Math.round((invRealm.treasury + 450) * 10) / 10;
          else monarch.treasury = (monarch.treasury || 1000) + 450;
          monarch.prestige = (monarch.prestige || 100) + 80;
          nation.truceMonths = 36;
          w.realmState = 'Balanced Feudalism';
          w.history.unshift({
            id: generateUniqueId('hist_inv_win'),
            year: w.currentYear,
            title: `Invasion Repelled: ${nation.name}`,
            category: 'War & Conquest',
            description: `The united realm drove the ${nation.name} host into the sea! Plunder and glory were won.`,
            realmId: monarch.realmId,
          });
        } else {
          if (invRealm?.treasury !== undefined) invRealm.treasury = Math.max(0, Math.round((invRealm.treasury - 450) * 10) / 10);
          else monarch.treasury = Math.max(0, (monarch.treasury || 1000) - 450);
          monarch.stress = Math.min(300, monarch.stress + 45);
          nation.truceMonths = 36;
          w.realmState = 'Fragmentation';
          w.history.unshift({
            id: generateUniqueId('hist_inv_defeat'),
            year: w.currentYear,
            title: `Devastation: ${nation.name} Invades!`,
            category: 'War & Conquest',
            description: `The ${nation.name} host shattered border defenses, sacking towns and demanding tribute.`,
            realmId: monarch.realmId,
          });
        }
      }
    }
  }
}

// ============================================
// 11. DEEP SUCCESSION LAW ENGINE
// ============================================

export class SuccessionEngine {
  static getSuccessionLine(ruler: Character, world: WorldState): Character[] {
    const laws = world.realmLaws || {
      succession: 'Partition',
      gender: 'Agnatic-Cognatic',
      authority: 'Limited',
      justice: 'Traditional',
    };

    let candidates: Character[] = [];

    const isDisqualified = (c: Character) => {
      if (!c.isAlive || c.isMonk || c.isBanished) return true;
      const traits = c.v17Traits || c.personalityTraits || [];
      return traits.includes('Bastard') && !traits.includes('Legitimized_Bastard');
    };

    // 1. SENIORITY (scoped to same realm so dynasty names never leak across kingdoms)
    if (laws.succession === 'Seniority') {
      candidates = world.characters.filter(
        (x) =>
          x.houseName === ruler.houseName &&
          x.realmId === ruler.realmId &&
          x.id !== ruler.id &&
          !isDisqualified(x)
      );
      candidates.sort((a, b) => b.age - a.age);

      if (laws.gender === 'Agnatic') {
        candidates = candidates.filter((c) => c.gender === 'male');
      }
      return candidates;
    }

    // 2. ELECTIVE
    if (laws.succession === 'Elective') {
      const potentialCandidates = world.characters.filter(
        (x) =>
          !isDisqualified(x) &&
          x.realmId === ruler.realmId &&
          ((x.houseName === ruler.houseName) || (ruler.vassalIds || []).includes(x.id))
      );

      let eligibleCandidates = potentialCandidates;
      if (laws.gender === 'Agnatic') {
        eligibleCandidates = potentialCandidates.filter((c) => c.gender === 'male');
      }

      if (eligibleCandidates.length === 0) return [];

      const electors = [
        ruler,
        ...world.characters.filter((c) => c.isAlive && (ruler.vassalIds || []).includes(c.id)),
      ];

      const votes: Record<string, number> = {};
      for (const cand of eligibleCandidates) votes[cand.id] = 0;

      for (const elector of electors) {
        if (!elector.isAlive || elector.isImprisoned) continue;
        const electorDiplomacy = elector.baseDiplomacy || 10;
        const electorWeight = Math.max(10, computeTotalGravitas(elector.organicGravitas || {
          militaryAutonomy: 100, economicExtraction: 30, populistLoyalty: 50, lineagePrestige: 50, sovereignDebtHeld: 0
        }));

        let bestCandidate = eligibleCandidates[0];
        let bestScore = -Infinity;

        for (const cand of eligibleCandidates) {
          const candGravitas = computeTotalGravitas(cand.organicGravitas || {
            militaryAutonomy: 100, economicExtraction: 30, populistLoyalty: 50, lineagePrestige: 50, sovereignDebtHeld: 0
          });
          const opinionMod = (elector.opinions?.[cand.id] ?? 0) * 1.2;
          const bondMod = (elector.friendId === cand.id ? 45 : 0) - (elector.rivalId === cand.id ? 80 : 0);
          const designatedMod = ruler.heirId === cand.id ? 30 : 0;
          const score =
            candGravitas +
            electorDiplomacy * 6 +
            (cand.houseName === elector.houseName ? 40 : 0) +
            opinionMod +
            bondMod +
            designatedMod;
          if (score > bestScore) {
            bestScore = score;
            bestCandidate = cand;
          }
        }

        if (bestCandidate) {
          votes[bestCandidate.id] = (votes[bestCandidate.id] || 0) + electorWeight;
        }
      }

      eligibleCandidates.sort((a, b) => (votes[b.id] || 0) - (votes[a.id] || 0));
      return eligibleCandidates;
    }

    // 3. PRIMOGENITURE & PARTITION (Respect designated heirId first)
    const designatedHeir = ruler.heirId
      ? world.characters.find((c) => c.id === ruler.heirId && !isDisqualified(c) && (laws.gender !== 'Agnatic' || c.gender === 'male'))
      : undefined;

    const childIds = ruler.children || [];
    const directChildren = world.characters.filter(
      (c) => childIds.includes(c.id) || c.knownFatherId === ruler.id || c.motherId === ruler.id
    );
    candidates = directChildren.filter((c) => !isDisqualified(c));

    if (candidates.length === 0) {
      const parents = [ruler.motherId, ruler.knownFatherId, ruler.realFatherId].filter(Boolean);
      candidates = world.characters.filter(
        (c) =>
          c.id !== ruler.id &&
          !isDisqualified(c) &&
          parents.some((p) => p === c.motherId || p === c.knownFatherId || p === c.realFatherId)
      );
    }

    if (candidates.length === 0) {
      candidates = world.characters.filter(
        (c) =>
          c.houseName === ruler.houseName &&
          c.realmId === ruler.realmId &&
          c.id !== ruler.id &&
          !isDisqualified(c)
      );
    }

    if (laws.gender === 'Agnatic') {
      candidates = candidates.filter((c) => c.gender === 'male');
      candidates.sort((a, b) => b.age - a.age);
    } else if (laws.gender === 'Agnatic-Cognatic') {
      const sons = candidates.filter((c) => c.gender === 'male').sort((a, b) => b.age - a.age);
      const daughters = candidates.filter((c) => c.gender === 'female').sort((a, b) => b.age - a.age);
      candidates = [...sons, ...daughters];
    } else {
      candidates.sort((a, b) => b.age - a.age);
    }

    if (designatedHeir) {
      candidates = [designatedHeir, ...candidates.filter((c) => c.id !== designatedHeir.id)];
    }

    return candidates;
  }

  static resolveSuccession(
    ruler: Character,
    world: WorldState
  ): { newRuler?: Character; events: HistoricalEvent[] } {
    const events: HistoricalEvent[] = [];
    const realm = world.realms.find((r) => r.id === ruler.realmId || r.rulerId === ruler.id);
    const isMonarch = Boolean(realm && (realm.rulerId === ruler.id || world.monarchId === ruler.id)) || ruler.role === 'Monarch';
    const laws = world.realmLaws || {
      succession: 'Partition',
      gender: 'Agnatic-Cognatic',
      authority: 'Limited',
      justice: 'Traditional',
    };

    const heirs = SuccessionEngine.getSuccessionLine(ruler, world);
    const holdings = (world.holdings || []).filter((h) => h.ownerId === ruler.id);

    // ==========================================
    // CASE A: NO HEIRS (ESCHEAT OR EXTINCTION)
    // ==========================================
    if (!heirs || heirs.length === 0) {
      if (isMonarch && realm) {
        // Interregnum Crisis: House extinct, highest gravitas noble seizes crown
        const realmNobles = world.characters.filter(
          (c) => c.realmId === realm.id && c.isAlive && !c.isMonk && !c.isImprisoned && c.id !== ruler.id
        );

        let usurper: Character | undefined = undefined;

        if (realmNobles.length > 0) {
          realmNobles.sort((a, b) => {
            const gravA = computeTotalGravitas(a.organicGravitas || { militaryAutonomy: 100, economicExtraction: 30, populistLoyalty: 50, lineagePrestige: 50, sovereignDebtHeld: 0 });
            const gravB = computeTotalGravitas(b.organicGravitas || { militaryAutonomy: 100, economicExtraction: 30, populistLoyalty: 50, lineagePrestige: 50, sovereignDebtHeld: 0 });
            return gravB - gravA;
          });
          usurper = realmNobles[0];
        } else {
          // Fallback 1: Any living eligible noble across the entire world
          const worldNobles = world.characters.filter(
            (c) => c.isAlive && !c.isMonk && !c.isImprisoned && c.id !== ruler.id
          );
          if (worldNobles.length > 0) {
            worldNobles.sort((a, b) => (b.prestige || 0) - (a.prestige || 0));
            usurper = worldNobles[0];
          } else {
            // Fallback 2: Emergency Regent Council creation (prevents game deadlock)
            const fallbackRank = getRealmSovereignRank(realm, 'male');
            const realmClean = stripRealmPrefix(realm.name);
            const regentChar: Character = {
              id: generateUniqueId('char_regent'),
              name: `Alden of House Valerius`,
              houseName: 'Valerius',
              houseMotto: 'In Absence of the Crown',
              title: `${fallbackRank.rankTitle} of ${realmClean}`,
              role: 'Monarch',
              titleTier: fallbackRank.titleTier,
              gender: 'male',
              age: 34,
              birthYear: world.currentYear - 34,
              investitureYear: world.currentYear,
              isAlive: true,
              realmId: realm.id,
              baseDiplomacy: 12,
              baseMartial: 12,
              baseStewardship: 14,
              baseIntrigue: 10,
              baseLearning: 12,
              baseProwess: 12,
              personalityTraits: ['Diligent', 'Just'],
              v17Traits: ['Diligent', 'Just'],
              congenitalTraits: [],
              physicalHealthTraits: [],
              commanderTraits: [],
              lifestyleTraits: [],
              aiArchetype: 'Benevolent Builder',
              stress: 0,
              stressLevel: 0,
              dread: 0,
              prestige: 100,
              piety: 50,
              treasury: 100,
              ambition: 'Preserve the Realm',
              tragicFlaw: 'Overcautious',
              darkSecret: 'None',
              sacredOath: 'Protect the High Crown',
              knownSecrets: [],
              hooksHeld: [],
              hooksOnMe: [],
              opinions: {},
              isNobleHouse: true,
              hasPersonalBanner: true,
              coatOfArms: generateRealmHeraldry(`${realm.id}_Valerius_${world.currentYear}`),
            };
            usurper = regentChar;
            world.characters.push(regentChar);
          }
        }

        if (usurper) {
          const usurperRank = getRealmSovereignRank(realm, usurper.gender);
          const realmClean = stripRealmPrefix(realm.name);
          usurper.role = 'Monarch';
          usurper.title = `${usurperRank.rankTitle} of ${realmClean}`;
          usurper.titleTier = usurperRank.titleTier;
          usurper.liegeId = undefined;
          usurper.recentlyInherited = true;
          usurper.monthsSinceInheritance = 0;
          usurper.investitureYear = world.currentYear;
          realm.rulerId = usurper.id;
          if (world.monarchId === ruler.id) world.monarchId = usurper.id;

          for (const ct of world.counties || []) {
            if (ct.rulerId === ruler.id) ct.rulerId = usurper.id;
          }
          for (const h of holdings) {
            h.ownerId = usurper.id;
          }
          for (const b of world.burgs || []) {
            if (b.ownerId === ruler.id) {
              b.ownerId = usurper.id;
              b.rulerTitle = usurper.title;
            }
          }
          for (const a of world.armies || []) {
            if (a.commanderId === ruler.id) {
              a.commanderId = usurper.id;
              a.commanderName = `${getCharacterRankTitle(usurper, world)} ${usurper.name}`;
            }
          }
          distributeInheritanceTreasury(ruler, world);

          events.push({
            id: generateUniqueId('hist_extinct_usurp'),
            year: world.currentYear,
            title: `Interregnum Crisis: House ${ruler.houseName} Extinct!`,
            category: 'Dynastic Drama',
            description: `House ${ruler.houseName} died out with no lawful heirs! ${usurper.name} seized the crown by right of gravitas.`,
            primaryActorId: usurper.id,
            secondaryActorId: ruler.id,
            realmId: realm.id,
          });

          return { newRuler: usurper, events };
        }
      } else {
        // Escheat: Vassal lands & counties revert to liege
        const liegeId = ruler.liegeId || realm?.rulerId || world.monarchId;
        const liege = world.characters.find((c) => c.id === liegeId && c.isAlive);
        const resolvedOwner = liege?.id || realm?.rulerId || '';
        for (const ct of world.counties || []) {
          if (ct.rulerId === ruler.id) ct.rulerId = resolvedOwner;
        }
        for (const h of holdings) {
          h.ownerId = resolvedOwner;
        }
        for (const b of world.burgs || []) {
          if (b.ownerId === ruler.id) {
            b.ownerId = resolvedOwner;
            if (liege) b.rulerTitle = liege.title;
          }
        }
        distributeInheritanceTreasury(ruler, world);
        if (liege) {
          autoEnfeoffExcessHoldings(liege, world);
        }
        reconcileFeudalHierarchy(world);

        events.push({
          id: generateUniqueId('hist_escheat'),
          year: world.currentYear,
          title: `Fief Escheat: House ${ruler.houseName}`,
          category: 'Dynastic Drama',
          description: `With no heirs, ${ruler.name}'s fiefs escheated back to Liege ${liege?.name || 'the Crown'}.`,
          primaryActorId: liege?.id,
          secondaryActorId: ruler.id,
          realmId: ruler.realmId,
        });
        return { newRuler: liege, events };
      }

      return { events };
    }

    // ==========================================
    // CASE B: SUCCESSION OCCURS (WITH INTER-STATE SUCCESSION CRISIS HANDLING)
    // ==========================================
    let primary = heirs[0];
    if (!primary) {
      return { events };
    }

    const isCrossBorderHeir =
      Boolean(ruler.realmId && primary.realmId && primary.realmId !== ruler.realmId);
    const isForeignSovereign = (world.realms || []).some(
      (r) => r.rulerId === primary.id && r.id !== ruler.realmId
    );
    const foreignInheritanceLaw = laws.foreignInheritance || 'Permitted';

    if (isCrossBorderHeir || isForeignSovereign) {
      const originRealm = (world.realms || []).find((r) => r.id === ruler.realmId);
      const heirRealm = (world.realms || []).find((r) => r.id === primary.realmId);

      if (foreignInheritanceLaw === 'Salic Exclusion') {
        // Bar foreign heir by law, grant them a Strong Pressed Claim, and promote a domestic heir if available
        const excludedHeir = primary;
        if (!excludedHeir.claims) excludedHeir.claims = [];
        for (const h of holdings.slice(0, 2)) {
          if (!excludedHeir.claims.some((cl) => cl.holdingId === h.id)) {
            excludedHeir.claims.push({
              holdingId: h.id,
              claimantId: excludedHeir.id,
              isPressed: true,
              isStrong: true,
              isAncestral: true,
              originHouse: excludedHeir.houseName,
            });
          }
        }
        if (originRealm && heirRealm) {
          RealmDiplomacyEngine.adjustRealmRelation(originRealm.id, heirRealm.id, -35, world);
        }
        const domesticAlternative =
          heirs.find((h) => h.id !== excludedHeir.id && h.realmId === ruler.realmId) ||
          world.characters.find(
            (c) =>
              c.isAlive &&
              c.id !== ruler.id &&
              c.id !== excludedHeir.id &&
              c.realmId === ruler.realmId &&
              c.houseName === ruler.houseName
          );
        if (domesticAlternative) {
          primary = domesticAlternative;
          events.push({
            id: generateUniqueId('hist_salic_crisis'),
            year: world.currentYear,
            title: `Inter-State Succession Crisis: ${excludedHeir.name} Barred by Law`,
            category: 'Dynastic Drama',
            description: `Under Salic Exclusion law, foreign heir ${excludedHeir.name} of ${heirRealm?.name || 'abroad'} was barred from inheriting ${ruler.name}'s titles in ${originRealm?.name || 'the realm'}. ${primary.name} assumed the seat while ${excludedHeir.name} pressed a Strong Claim!`,
            primaryActorId: excludedHeir.id,
            secondaryActorId: primary.id,
            realmId: ruler.realmId,
          });
        }
      } else {
        // Permitted / Crown Approval: Cross-border dynastic inheritance triggers a Personal Union or Succession Dispute!
        const domesticClaimant = world.characters.find(
          (c) =>
            c.isAlive &&
            c.id !== ruler.id &&
            c.id !== primary.id &&
            c.realmId === ruler.realmId &&
            (c.titleTier === 'Duke' || c.titleTier === 'Count' || c.houseName === ruler.houseName)
        );
        if (domesticClaimant && holdings.length > 0) {
          if (!domesticClaimant.claims) domesticClaimant.claims = [];
          if (!domesticClaimant.claims.some((cl) => cl.holdingId === holdings[0].id)) {
            domesticClaimant.claims.push({
              holdingId: holdings[0].id,
              claimantId: domesticClaimant.id,
              isPressed: true,
              isStrong: true,
            });
          }
          domesticClaimant.loyalty = Math.max(10, (domesticClaimant.loyalty ?? 55) - 25);
        }
        // Domestic vassals react to foreign dynastic inheritance
        for (const vassal of world.characters) {
          if (vassal.isAlive && vassal.realmId === ruler.realmId && vassal.id !== primary.id) {
            vassal.loyalty = Math.max(15, (vassal.loyalty ?? 55) - (isMonarch ? 18 : 10));
          }
        }
        events.push({
          id: generateUniqueId('hist_interstate_succ'),
          year: world.currentYear,
          title: isMonarch
            ? `Crown Union Crisis: ${primary.name} Claims ${originRealm?.name || 'the Throne'}`
            : `Cross-Border Inheritance: House ${primary.houseName} Inherits in ${originRealm?.name || 'the Realm'}`,
          category: 'Dynastic Drama',
          description: `Through inter-state royal & noble marriage, ${primary.name} of ${heirRealm?.name || 'a foreign court'} inherited ${ruler.name}'s titles in ${originRealm?.name || 'the realm'}${domesticClaimant ? `, provoking fierce opposition from ${domesticClaimant.name} (Strong Claim)` : ''}.`,
          primaryActorId: primary.id,
          secondaryActorId: domesticClaimant?.id || ruler.id,
          realmId: ruler.realmId,
        });
      }
    }

    primary.recentlyInherited = true;
    primary.monthsSinceInheritance = 0;
    primary.investitureYear = world.currentYear;
    if (!primary.titleTier || primary.titleTier === 'Commoner' || primary.titleTier === 'Baron') {
      primary.titleTier = ruler.titleTier || (isMonarch ? 'King' : 'Count');
    }
    if (primary.houseName === ruler.houseName) {
      const promoted = promoteHeirArmsToHead(primary.coatOfArms, ruler.coatOfArms);
      if (promoted) primary.coatOfArms = promoted;
    }
    primary.isNobleHouse = true;
    primary.hasPersonalBanner = true;

    // Renew vassal oaths
    if (ruler.vassalIds) {
      if (!primary.vassalIds) primary.vassalIds = [];
      for (const vid of ruler.vassalIds) {
        if (vid !== primary.id && !primary.vassalIds.includes(vid)) {
          primary.vassalIds.push(vid);
          const vassal = world.characters.find((c) => c.id === vid);
          if (vassal) vassal.liegeId = primary.id;
        }
      }
    }
    for (const c of world.characters) {
      if (c.isAlive && c.liegeId === ruler.id && c.id !== primary.id) {
        c.liegeId = primary.id;
      }
    }

    // Transfer dynasty favors & armies
    if (world.favors) {
      for (const f of world.favors) {
        if (f.isDynastyLevel) {
          if (f.creditorId === ruler.id) f.creditorId = primary.id;
          if (f.debtorId === ruler.id) f.debtorId = primary.id;
        }
      }
    }
    for (const a of world.armies || []) {
      if (a.commanderId === ruler.id) {
        a.commanderId = primary.id;
        a.commanderName = primary.name;
      }
    }

    // Pass enduring ancestral claims to primary heir (unless revoked by Royal Decree)
    if (ruler.claims && ruler.claims.length > 0) {
      if (!primary.claims) primary.claims = [];
      for (const cl of ruler.claims) {
        if (cl.isAncestral && !cl.revokedByDecree) {
          if (!primary.claims.some((existing) => existing.holdingId === cl.holdingId && !existing.revokedByDecree)) {
            primary.claims.push({
              ...cl,
              claimantId: primary.id,
            });
          }
        }
      }
    }

    // Hereditary claims for cadet siblings
    for (const cadet of heirs.slice(1)) {
      if (!cadet.claims) cadet.claims = [];
      for (const h of holdings) {
        if (!cadet.claims.some((cl) => cl.holdingId === h.id)) {
          cadet.claims.push({
            holdingId: h.id,
            claimantId: cadet.id,
            isPressed: false,
            isStrong: true,
          });
        }
      }
    }

    // Assign royal, ducal & county titles (Duchies are only held under Royal/Imperial crowns,
    // and every vassal/heir always remains strictly below their liege and sovereign)
    const inheritedDuchy = (world.counties || []).find(
      (ct) => ct.rulerId === ruler.id && (ct.tier === 'Duchy' || ct.name.includes('Duchy'))
    );
    if (isMonarch && realm) {
      const primaryRank = getRealmSovereignRank(realm, primary.gender);
      primary.role = 'Monarch';
      primary.titleTier = primaryRank.titleTier;
      primary.title = `${primaryRank.rankTitle} of ${stripRealmPrefix(realm.name)}`;
      primary.liegeId = undefined;
      primary.realmId = realm.id;
      realm.rulerId = primary.id;
      if (world.monarchId === ruler.id) world.monarchId = primary.id;
    } else {
      const isSovereignElsewhere = (world.realms || []).some(
        (r) => r.rulerId === primary.id && r.id !== ruler.realmId
      );
      if (ruler.realmId && primary.realmId !== ruler.realmId && !isSovereignElsewhere) {
        primary.realmId = ruler.realmId;
        primary.liegeId =
          ruler.liegeId || world.realms?.find((r) => r.id === ruler.realmId)?.rulerId;
      }
      const targetRealm = world.realms?.find((r) => r.id === (primary.realmId || ruler.realmId));
      const sovRank = targetRealm ? getRealmSovereignRank(targetRealm) : undefined;
      const liegeChar = primary.liegeId
        ? world.characters.find((c) => c.id === primary.liegeId && c.isAlive !== false)
        : undefined;
      const ceilingTier: TitleTier =
        liegeChar?.titleTier && sovRank && getTitleTierRank(liegeChar.titleTier) < getTitleTierRank(sovRank.titleTier)
          ? liegeChar.titleTier
          : (sovRank?.titleTier || liegeChar?.titleTier || 'King');

      if (inheritedDuchy && sovRank?.isRoyalOrHigher !== false && getTitleTierRank(ceilingTier) > getTitleTierRank('Duke')) {
        primary.role = 'Vassal Duke';
        primary.titleTier = 'Duke';
        const duchySeatName = inheritedDuchy.name.replace(/^(Grand )?Duchy of\s*/i, '');
        primary.title = primary.gender === 'female' ? `Duchess of ${duchySeatName}` : `Duke of ${duchySeatName}`;
      } else if (ruler.role && !['Monarch', 'Child', 'Cadet Prince', 'Cadet Princess', 'Noble Scion'].includes(ruler.role)) {
        if (['Vassal Duke', 'Vassal Count', 'Lord Mayor', 'Merchant Guildmaster', 'Guildmaster', 'Portmaster', 'Vassal Baron'].includes(ruler.role)) {
          const preferredTier: TitleTier =
            ruler.titleTier ||
            (ruler.role === 'Vassal Duke'
              ? 'Duke'
              : ruler.role === 'Vassal Count'
              ? 'Count'
              : ruler.role === 'Vassal Baron'
              ? 'Baron'
              : 'Mayor');
          const clampedTier = getLowerTitleTier(ceilingTier, preferredTier);
          primary.titleTier = clampedTier;
          if (clampedTier !== preferredTier) {
            const inheritedCounty = (world.counties || []).find((ct) => ct.rulerId === ruler.id);
            const seatName =
              inheritedCounty?.name.replace(/^(Grand Duchy of|Royal Duchy of|Duchy of|Barony of|Earldom of|County of)\s*/i, '').trim() ||
              ruler.houseName;
            const subStyle = getSubordinateVassalStyle(
              targetRealm,
              ceilingTier,
              primary.gender || 'male',
              seatName,
              'county_fief'
            );
            primary.role = subStyle.role;
            primary.title = subStyle.title;
          } else {
            primary.role = ruler.role;
            primary.title = ruler.title;
          }
        }
      }
    }

    for (const ct of world.counties || []) {
      if (ct.rulerId === ruler.id) ct.rulerId = primary.id;
    }

    // Partition vs Single-Heir Succession
    if (laws.succession === 'Partition' && heirs.length > 1 && holdings.length > 1) {
      const numShares = Math.min(heirs.length, holdings.length);
      const chunkSize = Math.floor(holdings.length / numShares);

      let holdingIdx = 0;
      for (let i = 0; i < numShares; i++) {
        const heir = heirs[i];
        if (!heir) continue;

        const count = chunkSize + (i === 0 ? holdings.length % numShares : 0);
        const givenHoldings = holdings.slice(holdingIdx, holdingIdx + count);
        holdingIdx += count;

        for (const gh of givenHoldings) {
          gh.ownerId = heir.id;
          const b = world.burgs?.find(
            (bg) => bg.id === gh.id || `holding_${bg.id}` === gh.id || gh.id.endsWith(bg.id)
          );
          if (b) {
            b.ownerId = heir.id;
            b.rulerTitle = heir.title;
          }
        }

        if (i > 0) {
          heir.liegeId = primary.id;
          if (givenHoldings.length > 0 && heir.investitureYear === undefined) {
            heir.investitureYear = world.currentYear;
          }
          if (!primary.vassalIds) primary.vassalIds = [];
          if (!primary.vassalIds.includes(heir.id)) primary.vassalIds.push(heir.id);

          const heirAmbition = heir.ambitionScore || ((heir.v17Traits || []).includes('Ambitious') ? 80 : 30);
          if (heirAmbition >= 50 && givenHoldings.length > 0 && canFoundCadetBranch(heir)) {
            const cadetHouse = DynasticFeudEngine.createCadetBranch(heir, givenHoldings[0], world);
            const heirTraits = heir.v17Traits || heir.personalityTraits || [];
            if (cadetHouse && (heirTraits.includes('Wrathful') || heirTraits.includes('Paranoid'))) {
              DynasticFeudEngine.declareFeud(cadetHouse.name, primary.houseName, 'Disputed Partition Inheritance', world);
            }
          }
        }
      }

      // Ensure any remaining burgs owned by ruler transfer cleanly
      for (const b of world.burgs || []) {
        if (b.ownerId === ruler.id) {
          b.ownerId = primary.id;
          b.rulerTitle = primary.title;
        }
      }

      distributeInheritanceTreasury(ruler, world);

      events.push({
        id: generateUniqueId('hist_succ_partition'),
        year: world.currentYear,
        title: `Partition Succession: ${primary.name} Ascends`,
        category: 'Coronation',
        description: `Following ${ruler.name}'s death, titles were partitioned under ${laws.gender} Partition law. Junior heirs received cadet fiefs.`,
        primaryActorId: primary.id,
        secondaryActorId: ruler.id,
        realmId: ruler.realmId,
      });
    } else {
      for (const h of holdings) {
        h.ownerId = primary.id;
      }
      for (const b of world.burgs || []) {
        if (b.ownerId === ruler.id) {
          b.ownerId = primary.id;
          b.rulerTitle = primary.title;
        }
      }
      distributeInheritanceTreasury(ruler, world);

      const lawDescription =
        laws.succession === 'Seniority'
          ? `Agnatic Seniority (Eldest living dynast, Age ${primary.age})`
          : laws.succession === 'Elective'
          ? 'Elective Moot by the High Council of Vassals'
          : `${laws.gender} Primogeniture`;

      events.push({
        id: generateUniqueId('hist_succ_full'),
        year: world.currentYear,
        title: `Ascension of ${primary.name}`,
        category: 'Coronation',
        description: `${primary.name} inherited the realm under ${lawDescription}, taking full possession of holdings and treasury.`,
        primaryActorId: primary.id,
        secondaryActorId: ruler.id,
        realmId: ruler.realmId,
      });
    }

    autoEnfeoffExcessHoldings(primary, world);
    reconcileFeudalHierarchy(world);
    syncWorldBanners(world);
    return { newRuler: primary, events };
  }
}

// ============================================
// 12. PLAYER FEUDAL ACTION ENGINE
// ============================================

export class PlayerActionEngine {
  static sendGift(donor: Character, target: Character, amount: number, world: WorldState): boolean {
    if ((donor.treasury || 0) < amount || amount <= 0) {
      return false; // Prevent infinite gold exploit
    }
    donor.treasury = Math.round(((donor.treasury || 0) - amount) * 10) / 10;
    target.treasury = Math.round(((target.treasury || 0) + amount) * 10) / 10;

    if (!target.opinions) target.opinions = {};
    target.opinions[donor.id] = Math.min(100, (target.opinions[donor.id] || 0) + 25);

    donor.prestige = (donor.prestige || 0) + 15;

    world.history.unshift({
      id: generateUniqueId('hist_gift'),
      year: world.currentYear,
      title: `Imperial Gift to ${target.name}`,
      category: 'Dynastic Drama',
      description: `${donor.name} bestowed ${amount} gold sovereigns upon ${target.name}.`,
      primaryActorId: donor.id,
      secondaryActorId: target.id,
      realmId: donor.realmId,
    });
    return true;
  }

  static ransomPrisoner(
    payer: Character,
    prisoner: Character,
    world: WorldState
  ): { success: boolean; summary: string } {
    if (!prisoner.isAlive || !prisoner.isImprisoned) {
      return { success: false, summary: `${prisoner.name} is not currently imprisoned.` };
    }
    const ransomCost =
      prisoner.titleTier === 'Emperor' || prisoner.titleTier === 'King'
        ? 400
        : prisoner.titleTier === 'Duke'
        ? 220
        : prisoner.titleTier === 'Count'
        ? 120
        : 65;

    const payerRealm = world.realms?.find((r) => r.rulerId === payer.id);
    const useCrown = Boolean(payerRealm && (payerRealm.treasury ?? 0) >= ransomCost);
    const avail = useCrown ? (payerRealm?.treasury ?? 0) : (payer.treasury || 0);
    if (avail < ransomCost) {
      return {
        success: false,
        summary: `Ransoming ${prisoner.name} requires ${ransomCost}g (Available: ${Math.round(avail)}g).`,
      };
    }

    if (useCrown && payerRealm) {
      payerRealm.treasury = Math.round(((payerRealm.treasury ?? 0) - ransomCost) * 10) / 10;
      recordRealmBudgetExtra(payerRealm, world, 'ransomsPaid', ransomCost);
    } else {
      payer.treasury = Math.round(((payer.treasury || 0) - ransomCost) * 10) / 10;
    }

    const captorRealm = world.realms?.find((r) => r.id === prisoner.realmId);
    const captor =
      world.characters.find((c) => c.id === prisoner.liegeId && c.isAlive) ||
      world.characters.find((c) => c.id === captorRealm?.rulerId && c.isAlive);
    if (captor && captor.id !== prisoner.id && captor.id !== payer.id) {
      captor.treasury = Math.round(((captor.treasury || 0) + ransomCost) * 10) / 10;
    }

    prisoner.isImprisoned = false;
    if (prisoner.v17Traits) prisoner.v17Traits = prisoner.v17Traits.filter((t) => t !== 'Imprisoned');
    prisoner.opinions = prisoner.opinions || {};
    prisoner.opinions[payer.id] = Math.min(100, (prisoner.opinions[payer.id] ?? 15) + 35);
    payer.prestige = (payer.prestige || 100) + 20;

    if (!world.history) world.history = [];
    world.history.unshift({
      id: generateUniqueId('hist_ransom_paid'),
      year: world.currentYear,
      title: `Royal Ransom Paid for ${prisoner.name}`,
      category: 'Dynastic Drama',
      description: `${payer.name} paid ${ransomCost}g to ransom ${prisoner.name} from captivity.`,
      primaryActorId: payer.id,
      secondaryActorId: prisoner.id,
      realmId: payer.realmId,
    });
    return {
      success: true,
      summary: `Paid ${ransomCost}g ransom to free ${prisoner.name}!`,
    };
  }

  static bestowHonorificTitle(monarch: Character, target: Character, titleName: string, world: WorldState): void {
    target.title = `${titleName} of ${world.realms.find((r) => r.id === monarch.realmId)?.name || 'the Realm'}`;
    target.prestige = (target.prestige || 0) + 50;
    if (!target.opinions) target.opinions = {};
    target.opinions[monarch.id] = Math.min(100, (target.opinions[monarch.id] || 0) + 30);
    recalculateAllGravitas(world);
  }

  /**
   * Grants the high honor of a personal heraldic banner to a lower-rank subject.
   * Strictly restricted to bestowers of Duke, King, or Emperor rank.
   */
  static bestowPersonalBanner(
    bestower: Character,
    target: Character,
    world: WorldState
  ): { success: boolean; summary: string } {
    if (!bestower || !target || !target.isAlive) {
      return { success: false, summary: 'Both granter and recipient must be living members of the realm.' };
    }
    if (bestower.id === target.id) {
      return { success: false, summary: 'A ruler cannot bestow an honorific banner upon themselves.' };
    }
    if (!canBestowBanner(bestower)) {
      return {
        success: false,
        summary: `Denied: ${bestower.name} (${bestower.titleTier || bestower.role}) lacks ducal or royal authority. Only a Duke or King may bestow a personal banner.`,
      };
    }
    if (target.hasPersonalBanner) {
      return {
        success: false,
        summary: `${target.name} already holds a personal heraldic banner.`,
      };
    }

    const fromNobleHouse = isNobleOrigin(target) && Boolean(target.coatOfArms?.config);
    const grantedArms = fromNobleHouse
      ? differenceCadetHouseArms(
          target.coatOfArms,
          `${target.realmId}_${target.houseName}`,
          `${target.houseName}_${target.id}_${world.currentYear}`
        )
      : generateNobleArms(`bestowed_${bestower.id}_${target.id}_${world.currentYear}`, {
          gender: target.gender,
          isLanded: true,
          allowFurs: false,
        });

    target.coatOfArms = cloneCoatOfArmsData(grantedArms);
    target.hasPersonalBanner = true;
    target.bannerBestowedById = bestower.id;
    target.bannerBestowedByName = bestower.title || bestower.name;
    target.bannerBestowedYear = world.currentYear;
    target.prestige = (target.prestige || 100) + 85;
    target.loyalty = Math.min(100, (target.loyalty ?? 60) + 25);
    if (!target.opinions) target.opinions = {};
    target.opinions[bestower.id] = Math.min(100, (target.opinions[bestower.id] ?? 10) + 45);

    if (!world.history) world.history = [];
    world.history.unshift({
      id: generateUniqueId('hist_banner'),
      year: world.currentYear,
      title: `Great Honor: Banner Bestowed on ${target.name}`,
      category: 'Coronation',
      description: `By decree of ${bestower.title || bestower.name}, ${target.name} was granted the rare honor of bearing a personal heraldic banner (${grantedArms.blazon || 'newly blazoned arms'}).`,
      primaryActorId: bestower.id,
      secondaryActorId: target.id,
      realmId: bestower.realmId,
    });

    syncWorldBanners(world);
    recalculateAllGravitas(world);
    return {
      success: true,
      summary: `Bestowed personal banner upon ${target.name} (+85 Prestige, +45 Opinion)!`,
    };
  }

  static befriendCharacter(actor: Character, target: Character, world: WorldState): { success: boolean; summary: string } {
    if (!actor.isAlive || !target.isAlive || actor.id === target.id) {
      return { success: false, summary: 'Invalid diplomatic target.' };
    }
    if (!actor.opinions) actor.opinions = {};
    if (!target.opinions) target.opinions = {};
    actor.opinions[target.id] = Math.min(100, (actor.opinions[target.id] ?? 0) + 35);
    target.opinions[actor.id] = Math.min(100, (target.opinions[actor.id] ?? 0) + 35);

    if (actor.rivalId === target.id) actor.rivalId = undefined;
    if (target.rivalId === actor.id) target.rivalId = undefined;

    if ((target.opinions[actor.id] ?? 0) >= 35) {
      actor.friendId = target.id;
      target.friendId = actor.id;
    }
    actor.stress = Math.max(0, (actor.stress || 0) - 18);
    target.loyalty = Math.min(100, (target.loyalty ?? 55) + 18);

    world.history.unshift({
      id: generateUniqueId('hist_befriend'),
      year: world.currentYear,
      title: `Bond of Friendship: ${actor.name} & ${target.name}`,
      category: 'Dynastic Drama',
      description: `${actor.name} and ${target.name} swore mutual fellowship in council, strengthening realm harmony.`,
      primaryActorId: actor.id,
      secondaryActorId: target.id,
      realmId: actor.realmId,
    });
    recalculateAllGravitas(world);
    return { success: true, summary: `Befriended ${target.name} (+35 opinion, loyal bond forged).` };
  }

  static denounceCharacter(actor: Character, target: Character, world: WorldState): { success: boolean; summary: string } {
    if (!actor.isAlive || !target.isAlive || actor.id === target.id) {
      return { success: false, summary: 'Invalid rivalry target.' };
    }
    if (!actor.opinions) actor.opinions = {};
    if (!target.opinions) target.opinions = {};
    actor.opinions[target.id] = Math.max(-100, (actor.opinions[target.id] ?? 0) - 45);
    target.opinions[actor.id] = Math.max(-100, (target.opinions[actor.id] ?? 0) - 45);

    if (actor.friendId === target.id) actor.friendId = undefined;
    if (target.friendId === actor.id) target.friendId = undefined;
    actor.rivalId = target.id;
    target.rivalId = actor.id;
    actor.dread = Math.min(100, (actor.dread || 10) + 8);
    target.loyalty = Math.max(5, (target.loyalty ?? 55) - 22);

    world.history.unshift({
      id: generateUniqueId('hist_denounce'),
      year: world.currentYear,
      title: `Court Rivalry: ${actor.name} Denounces ${target.name}`,
      category: 'Dynastic Drama',
      description: `${actor.name} publicly denounced ${target.name} before the peers of the realm, igniting an open rivalry.`,
      primaryActorId: actor.id,
      secondaryActorId: target.id,
      realmId: actor.realmId,
    });
    recalculateAllGravitas(world);
    return { success: true, summary: `Declared rivalry with ${target.name} (-45 opinion).` };
  }

  static arrangeMarriage(charA: Character, charB: Character, world: WorldState): { success: boolean; summary: string } {
    const legality = checkMarriageLegality(charA, charB, world);
    if (!legality.allowed) {
      return { success: false, summary: legality.reason || 'Marriage prohibited by Crown Law.' };
    }
    if (charA.realmId !== charB.realmId && RealmDiplomacyEngine.areRealmsEnemies(charA.realmId, charB.realmId, world)) {
      return {
        success: false,
        summary: 'Marriage refused: the two realms are proclaimed Enemies! End enmity or sign peace first.',
      };
    }

    const prospect = evaluateMarriageProspect(charA, charB, world);
    if (!prospect.accepted) {
      return {
        success: false,
        summary: `Marriage refused (Score ${prospect.score >= 0 ? '+' : ''}${prospect.score}): ${prospect.reasons[0] || 'House prestige disparity.'}`,
      };
    }

    const isAlliedMatch =
      charA.realmId !== charB.realmId && RealmDiplomacyEngine.areRealmsAllied(charA.realmId, charB.realmId, world);

    charA.spouseId = charB.id;
    charB.spouseId = charA.id;
    charA.marriageYear = world.currentYear;
    charB.marriageYear = world.currentYear;
    const mType: Character['marriageType'] = legality.isBloodRelative
      ? 'Consanguineous'
      : legality.isRoyalMatch
      ? 'Royal Union'
      : prospect.candidateHouse.influenceScore > prospect.suitorHouse.influenceScore + 18 && charB.gender === 'female'
      ? 'Matrilineal'
      : 'Patrilineal';
    charA.marriageType = mType;
    charB.marriageType = mType;

    if (!charA.opinions) charA.opinions = {};
    if (!charB.opinions) charB.opinions = {};
    const opGain = isAlliedMatch ? 45 : 35;
    charA.opinions[charB.id] = Math.min(100, (charA.opinions[charB.id] ?? 15) + opGain);
    charB.opinions[charA.id] = Math.min(100, (charB.opinions[charA.id] ?? 15) + opGain);
    const prestigeGainA = Math.round((isAlliedMatch ? 80 : 50) + prospect.candidateHouse.influenceScore * 0.65);
    const prestigeGainB = Math.round((isAlliedMatch ? 80 : 50) + prospect.suitorHouse.influenceScore * 0.65);
    charA.prestige = (charA.prestige || 100) + prestigeGainA;
    charB.prestige = (charB.prestige || 100) + prestigeGainB;

    // --- MARRIAGE DOWRY, WEDDING PAGEANTRY & ROYAL FEUDAL AID ---
    const bride = charB.gender === 'female' ? charB : charA;
    const groom = bride.id === charA.id ? charB : charA;
    const brideRealm = world.realms?.find((r) => r.id === bride.realmId);
    const brideFather = bride.knownFatherId
      ? world.characters.find((c) => c.id === bride.knownFatherId && c.isAlive)
      : undefined;
    const isBridePrincess = Boolean(
      brideRealm &&
        getRealmSovereignRank(brideRealm).isRoyalOrHigher &&
        (brideRealm.rulerId === bride.id ||
          brideRealm.rulerId === bride.knownFatherId ||
          brideRealm.rulerId === bride.motherId)
    );
    const brideTierBase =
      isBridePrincess || bride.titleTier === 'King' || bride.titleTier === 'Emperor'
        ? 75
        : bride.titleTier === 'Duke'
        ? 45
        : bride.titleTier === 'Count'
        ? 22
        : 10;

    let dowryNote = '';
    if (isBridePrincess && brideRealm && (brideRealm.treasury ?? 0) >= brideTierBase * 0.6) {
      const dowryPaid = Math.round(Math.min(brideTierBase, (brideRealm.treasury ?? 0) * 0.16));
      if (dowryPaid >= 5) {
        brideRealm.treasury = Math.round(((brideRealm.treasury ?? 0) - dowryPaid) * 10) / 10;
        recordRealmBudgetExtra(brideRealm, world, 'diplomacyAndPatronage', dowryPaid);
        groom.treasury = Math.round(((groom.treasury || 0) + dowryPaid * 0.75) * 10) / 10;
        const capBurg = world.burgs?.find((b) => b.id === brideRealm.capitalBurgId);
        if (capBurg) {
          const nextT = Math.round(((capBurg.treasury || 0) + dowryPaid * 0.25) * 10) / 10;
          capBurg.treasury = nextT;
          const mkt = world.economy?.burgMarkets?.[capBurg.id];
          if (mkt) mkt.treasury = nextT;
        }
        // Feudal Aid levied on landed vassals for the marriage of the Monarch's daughter/son
        let weddingAid = 0;
        for (const v of world.characters) {
          if (v.isAlive && v.realmId === brideRealm.id && v.id !== brideRealm.rulerId && (v.treasury || 0) >= 35) {
            const aid = Math.min(10, Math.round((v.treasury || 0) * 0.025));
            if (aid >= 2) {
              v.treasury = Math.round(((v.treasury || 0) - aid) * 10) / 10;
              weddingAid += aid;
            }
          }
        }
        if (weddingAid > 0) {
          brideRealm.treasury = Math.round(((brideRealm.treasury ?? 0) + weddingAid) * 10) / 10;
          recordRealmBudgetExtra(brideRealm, world, 'scutageAndAidsIncome', weddingAid);
        }
        dowryNote = ` (${dowryPaid}g Royal Dowry${weddingAid > 0 ? ` · ${weddingAid}g Vassal Aid` : ''})`;
      }
    } else {
      const sponsor = brideFather && (brideFather.treasury || 0) >= 15 ? brideFather : bride;
      const dowryPaid = Math.round(Math.min(brideTierBase, (sponsor.treasury || 0) * 0.2));
      if (dowryPaid >= 3) {
        sponsor.treasury = Math.round(((sponsor.treasury || 0) - dowryPaid) * 10) / 10;
        groom.treasury = Math.round(((groom.treasury || 0) + dowryPaid * 0.75) * 10) / 10;
        const hostBurg =
          world.burgs?.find((b) => b.ownerId === groom.id || b.ownerId === sponsor.id) ||
          world.burgs?.find((b) => b.stateId === groom.realmId && b.isCapital);
        if (hostBurg) {
          const nextT = Math.round(((hostBurg.treasury || 0) + dowryPaid * 0.25) * 10) / 10;
          hostBurg.treasury = nextT;
          const mkt = world.economy?.burgMarkets?.[hostBurg.id];
          if (mkt) mkt.treasury = nextT;
        }
        dowryNote = ` (${dowryPaid}g Dowry & Wedding Feast)`;
      }
    }

    let allianceNote = dowryNote;
    if (legality.isBloodRelative) {
      allianceNote += ` (${legality.kinship} Union)`;
    }

    // Cross-border intermarriage creates hereditary dynastic claims & succession entanglements
    if (charA.realmId !== charB.realmId) {
      const relBoost = Math.round(22 + Math.max(prospect.suitorHouse.negotiatingPower, prospect.candidateHouse.negotiatingPower) * 0.5);
      RealmDiplomacyEngine.adjustRealmRelation(charA.realmId, charB.realmId, relBoost, world);

      const grantMaritalClaim = (claimant: Character, spouse: Character) => {
        const spouseHolding = (world.holdings || []).find((h) => h.ownerId === spouse.id);
        if (!spouseHolding) return;
        if (!claimant.claims) claimant.claims = [];
        if (!claimant.claims.some((cl) => cl.holdingId === spouseHolding.id)) {
          claimant.claims.push({
            holdingId: spouseHolding.id,
            claimantId: claimant.id,
            isPressed: false,
            isStrong: false,
            isAncestral: true,
            originHouse: spouse.houseName,
          });
        }
      };
      grantMaritalClaim(charA, charB);
      grantMaritalClaim(charB, charA);

      const isHighNobleMatch =
        ['Emperor', 'King', 'Duke'].includes(charA.titleTier || '') ||
        ['Emperor', 'King', 'Duke'].includes(charB.titleTier || '') ||
        charA.role === 'Crown Heir' ||
        charA.role === 'Heir' ||
        charB.role === 'Crown Heir' ||
        charB.role === 'Heir' ||
        prospect.suitorHouse.influenceScore >= 55 ||
        prospect.candidateHouse.influenceScore >= 55;
      const allianceRelThreshold =
        prospect.suitorHouse.influenceScore >= 60 || prospect.candidateHouse.influenceScore >= 60 ? 15 : 26;
      if (
        isHighNobleMatch &&
        !isAlliedMatch &&
        RealmDiplomacyEngine.getRealmRelation(charA.realmId, charB.realmId, world) >= allianceRelThreshold
      ) {
        RealmDiplomacyEngine.forgeAlliance(charA.realmId, charB.realmId, world, true);
        allianceNote += ' & Inter-State Dynastic Alliance forged!';
      } else if (isAlliedMatch) {
        allianceNote += ' (Allied Pact & Succession Ties reinforced!)';
      } else {
        allianceNote += ' (Cross-Border Dynastic Claims seeded!)';
      }
    }

    // Marriage-driven Cadet Branch formation for junior/landed nobles marrying into prominent houses
    const cadetCandidate = [charA, charB].find(
      (c) =>
        canFoundCadetBranch(c) &&
        !c.isCadetFounder &&
        c.role !== 'Monarch' &&
        c.role !== 'Crown Heir' &&
        c.role !== 'Heir' &&
        (c.role === 'Child' ||
          c.role === 'Cadet Prince' ||
          c.role === 'Cadet Princess' ||
          c.role === 'Noble Scion' ||
          c.titleTier === 'Duke' ||
          c.titleTier === 'Count')
    );
    if (cadetCandidate && Math.random() < (legality.isForeign ? 0.28 : 0.16)) {
      const seatHolding =
        (world.holdings || []).find((h) => h.ownerId === cadetCandidate.id) ||
        (world.holdings || []).find((h) => h.ownerId === (cadetCandidate.id === charA.id ? charB.id : charA.id));
      if (seatHolding) {
        const created = DynasticFeudEngine.createCadetBranch(cadetCandidate, seatHolding, world);
        if (created) {
          allianceNote += ` · Cadet House ${created.name} founded!`;
        }
      }
    }

    if (!world.history) world.history = [];
    world.history.unshift({
      id: generateUniqueId('hist_marriage'),
      year: world.currentYear,
      title: `Dynastic Marriage: ${charA.name} & ${charB.name}`,
      category: 'Dynastic Drama',
      description: `House ${charA.houseName} (${prospect.suitorHouse.powerTier}) and House ${charB.houseName} (${prospect.candidateHouse.powerTier}) sealed a ${mType} marital pact in Year ${world.currentYear}.${allianceNote}`,
      primaryActorId: charA.id,
      secondaryActorId: charB.id,
      realmId: charA.realmId,
    });
    recalculateAllGravitas(world);
    return { success: true, summary: `Marriage pact sealed between ${charA.name} and ${charB.name}${allianceNote}` };
  }

  static appointCouncilSeat(
    monarch: Character,
    target: Character,
    role: 'Chancellor' | 'Marshal' | 'Steward' | 'Spymaster' | 'Court Chaplain',
    world: WorldState
  ): { success: boolean; summary: string } {
    if (!target.isAlive || target.id === monarch.id) {
      return { success: false, summary: 'Cannot appoint target to council seat.' };
    }
    const prevHolder = world.characters.find(
      (c) => c.isAlive && c.realmId === monarch.realmId && c.role === role && c.id !== target.id
    );
    if (prevHolder) {
      const monarchTier = monarch.titleTier || 'King';
      const cappedPrevTier =
        prevHolder.titleTier && getTitleTierRank(prevHolder.titleTier) < getTitleTierRank(monarchTier)
          ? prevHolder.titleTier
          : getLowerTitleTier(monarchTier);
      prevHolder.titleTier = cappedPrevTier;
      prevHolder.role =
        cappedPrevTier === 'Duke'
          ? 'Vassal Duke'
          : cappedPrevTier === 'Count'
          ? 'Vassal Count'
          : cappedPrevTier === 'Baron'
          ? 'Vassal Baron'
          : 'Hedge Knight';
      if (!prevHolder.opinions) prevHolder.opinions = {};
      prevHolder.opinions[monarch.id] = Math.max(-100, (prevHolder.opinions[monarch.id] ?? 0) - 20);
    }

    const realmName = world.realms.find((r) => r.id === monarch.realmId)?.name || 'the Realm';
    const monarchTier = monarch.titleTier || 'King';
    if (getTitleTierRank(target.titleTier) >= getTitleTierRank(monarchTier)) {
      target.titleTier = getLowerTitleTier(monarchTier);
    }
    target.role = role;
    target.title = `${role} of ${realmName}`;
    target.courtPosition = {
      orbit: 'INNER_RING',
      capitalSecrets: target.courtPosition?.capitalSecrets ?? 20,
      capitalBottlenecks: target.courtPosition?.capitalBottlenecks ?? 20,
      capitalFavors: target.courtPosition?.capitalFavors ?? 20,
      decayPressure: 0,
    };
    if (!target.opinions) target.opinions = {};
    target.opinions[monarch.id] = Math.min(100, (target.opinions[monarch.id] ?? 0) + 25);
    target.loyalty = Math.min(100, (target.loyalty ?? 55) + 20);
    recalculateAllGravitas(world);
    recalculateDynamicLoyalty(world, false);
    return { success: true, summary: `${target.name} appointed ${role} of ${realmName}!` };
  }

  static confirmVassalCharter(
    monarch: Character,
    vassal: Character,
    world: WorldState
  ): { success: boolean; summary: string } {
    if (!vassal.isAlive || vassal.id === monarch.id) {
      return { success: false, summary: 'Invalid vassal target.' };
    }
    monarch.prestige = Math.max(0, (monarch.prestige || 100) - 25);
    if (!vassal.opinions) vassal.opinions = {};
    vassal.opinions[monarch.id] = Math.min(100, (vassal.opinions[monarch.id] ?? 0) + 20);
    vassal.grudges = [];
    vassal.loyalty = Math.min(100, (vassal.loyalty ?? 55) + 16);
    recalculateDynamicLoyalty(world, false);
    return {
      success: true,
      summary: `Feudal Charters confirmed for ${vassal.name} (+20 opinion, +16 loyalty, grudges cleared; -25 prestige).`,
    };
  }

  static demandOathOfFealty(
    monarch: Character,
    vassal: Character,
    world: WorldState
  ): { success: boolean; summary: string } {
    if (!vassal.isAlive || vassal.id === monarch.id) {
      return { success: false, summary: 'Invalid vassal target.' };
    }
    const mHouse = computeHouseProfile(monarch.houseName, world);
    const vHouse = computeHouseProfile(vassal.houseName, world);
    const op = vassal.opinions?.[monarch.id] ?? 0;
    const isAmbitious = (vassal.personalityTraits || []).includes('Ambitious') || (vassal.v17Traits || []).includes('Ambitious');
    const leverage = op + (mHouse.negotiatingPower - vHouse.negotiatingPower) * 1.4 + ((monarch.dread || 0) > 50 ? 15 : 0) - (isAmbitious ? 18 : 0);

    if (!vassal.opinions) vassal.opinions = {};
    if (leverage >= 5) {
      vassal.opinions[monarch.id] = Math.min(100, op + 10);
      vassal.loyalty = Math.min(100, (vassal.loyalty ?? 55) + 15);
      monarch.prestige = (monarch.prestige || 100) + 15;
      recalculateDynamicLoyalty(world, false);
      return {
        success: true,
        summary: `${vassal.name} knelt and renewed their Oath of Fealty (+15 loyalty, +10 opinion, +15 prestige).`,
      };
    }

    vassal.opinions[monarch.id] = Math.max(-100, op - 15);
    vassal.loyalty = Math.max(5, (vassal.loyalty ?? 55) - 10);
    recalculateDynamicLoyalty(world, false);
    return {
      success: false,
      summary: `${vassal.name} balked at renewing fealty! (-15 opinion, -10 loyalty).`,
    };
  }

  static grantCountyToLord(
    monarch: Character,
    countyId: string,
    recipientId: string,
    world: WorldState
  ): { success: boolean; summary: string } {
    const county = (world.counties || []).find((c) => c.id === countyId);
    const recipient = (world.characters || []).find((c) => c.id === recipientId && c.isAlive !== false);
    if (!county || !recipient) return { success: false, summary: 'County or recipient lord not found.' };
    if (county.rulerId !== monarch.id) return { success: false, summary: 'You do not directly hold this county.' };
    const realm = world.realms.find((r) => r.id === county.realmId);
    if (realm?.capitalBurgId && county.capitalBurgId === realm.capitalBurgId) {
      return { success: false, summary: 'Cannot give away the Royal Capital seat.' };
    }

    county.rulerId = recipient.id;
    if (recipient.coatOfArms) county.coatOfArms = cloneCoatOfArmsData(recipient.coatOfArms);
    const capBurg = (world.burgs || []).find((b) => b.id === county.capitalBurgId);
    if (capBurg) {
      capBurg.ownerId = recipient.id;
      capBurg.rulerTitle = recipient.title;
    }
    for (const h of world.holdings || []) {
      if (h.provinceId === county.id && h.ownerId === monarch.id) {
        h.ownerId = recipient.id;
      }
    }

    recipient.countyId = recipient.countyId || county.id;
    recipient.liegeId = monarch.id;
    const grantorTier: TitleTier =
      monarch.titleTier || getRealmSovereignRank(realm, monarch.gender).titleTier;
    const fiefClean = (capBurg?.name || county.name.replace(/^(Barony of|Earldom of|County of|Crown County of|Appanage County of)\s*/i, '')).trim();
    const useEarl = county.name.toLowerCase().startsWith('earldom');
    const grantStyle = getSubordinateVassalStyle(
      realm,
      grantorTier,
      recipient.gender || 'male',
      fiefClean,
      'county_fief',
      useEarl
    );
    if (
      !recipient.titleTier ||
      ['Commoner', 'Mayor', 'Baron'].includes(recipient.titleTier) ||
      getTitleTierRank(recipient.titleTier) >= getTitleTierRank(grantorTier)
    ) {
      recipient.titleTier = grantStyle.titleTier;
      recipient.role = grantStyle.role;
      recipient.title = grantStyle.title;
      if (capBurg) capBurg.rulerTitle = grantStyle.title;
    }
    monarch.vassalIds = monarch.vassalIds || [];
    if (!monarch.vassalIds.includes(recipient.id)) monarch.vassalIds.push(recipient.id);

    if (!recipient.opinions) recipient.opinions = {};
    recipient.opinions[monarch.id] = Math.min(100, (recipient.opinions[monarch.id] ?? 0) + 35);
    recipient.loyalty = Math.min(100, (recipient.loyalty ?? 55) + 28);
    monarch.prestige = (monarch.prestige || 100) + 20;

    if (!world.history) world.history = [];
    world.history.unshift({
      id: generateUniqueId('hist_grant'),
      year: world.currentYear,
      title: `Fief Granted: ${county.name} to ${recipient.name}`,
      category: 'Dynastic Drama',
      description: `${monarch.name} invested ${recipient.name} of House ${recipient.houseName} with the hereditary fief of ${county.name}.`,
      primaryActorId: monarch.id,
      secondaryActorId: recipient.id,
      realmId: monarch.realmId,
    });

    recalculateAllGravitas(world);
    recalculateDynamicLoyalty(world, false);
    return {
      success: true,
      summary: `Granted ${county.name} to ${recipient.name} (+35 opinion, +28 loyalty).`,
    };
  }

  static ennobleNewLordForCounty(
    monarch: Character,
    countyId: string,
    world: WorldState
  ): { success: boolean; summary: string } {
    const county = (world.counties || []).find((c) => c.id === countyId);
    if (!county) return { success: false, summary: 'County not found.' };
    if (county.rulerId !== monarch.id) return { success: false, summary: 'You do not directly hold this county.' };
    const realm = world.realms.find((r) => r.id === county.realmId);
    if (realm?.capitalBurgId && county.capitalBurgId === realm.capitalBurgId) {
      return { success: false, summary: 'Cannot ennoble a new lord over the Royal Capital seat.' };
    }

    const capBurg = (world.burgs || []).find((b) => b.id === county.capitalBurgId);
    const fiefBase = (capBurg?.name || county.name.replace(/^(Barony of|Crown |County of |Appanage County of )/i, '')).trim();
    const isMale = Math.random() < 0.82;
    const maleNames = ['Aldric', 'Beren', 'Cedric', 'Dorian', 'Edric', 'Gareth', 'Hadrian', 'Lothar', 'Marcus', 'Roland', 'Tristan', 'Valen'];
    const femaleNames = ['Aelina', 'Beatrice', 'Clarissa', 'Eleanor', 'Giselle', 'Helena', 'Isolde', 'Margaery', 'Rowena', 'Seraphina'];
    const firstName = isMale
      ? maleNames[Math.floor(Math.random() * maleNames.length)]
      : femaleNames[Math.floor(Math.random() * femaleNames.length)];

    const existingHouses = new Set((world.characters || []).map((c) => (c.houseName || '').toLowerCase()));
    let newHouseName = fiefBase.replace(/\s+/g, '');
    if (existingHouses.has(newHouseName.toLowerCase())) {
      newHouseName = `${newHouseName}mont`;
    }

    const usedSigs = new Set<string>();
    for (const ch of world.characters || []) {
      if (ch.coatOfArms) usedSigs.add(getCoatOfArmsSignature(ch.coatOfArms));
    }
    const newArms = generateUniqueHouseHeraldry(
      `ennobled_${realm?.id || 'r'}_${newHouseName}_${world.currentYear}`,
      usedSigs,
      { isLanded: true, gender: isMale ? 'male' : 'female' }
    );

    const newLordId = generateUniqueId('char_noble');
    const lordUseEarl = county.name.toLowerCase().startsWith('earldom');
    const monarchTier: TitleTier =
      monarch.titleTier || getRealmSovereignRank(realm, monarch.gender).titleTier;
    const lordStyle = getSubordinateVassalStyle(
      realm,
      monarchTier,
      isMale ? 'male' : 'female',
      fiefBase,
      'county_fief',
      lordUseEarl
    );
    const newLord: Character = {
      id: newLordId,
      name: `${firstName} of House ${newHouseName}`,
      houseName: newHouseName,
      houseMotto: `By Crown & Sword of ${fiefBase}`,
      title: lordStyle.title,
      role: lordStyle.role,
      titleTier: lordStyle.titleTier,
      gender: isMale ? 'male' : 'female',
      age: 26 + Math.floor(Math.random() * 14),
      birthYear: world.currentYear - 30,
      realmId: monarch.realmId,
      countyId: county.id,
      provinceId: county.id,
      liegeId: monarch.id,
      isAlive: true,
      isNobleHouse: true,
      hasPersonalBanner: true,
      coatOfArms: newArms,
      baseDiplomacy: 9 + Math.floor(Math.random() * 7),
      baseMartial: 9 + Math.floor(Math.random() * 7),
      baseStewardship: 9 + Math.floor(Math.random() * 7),
      baseIntrigue: 7 + Math.floor(Math.random() * 7),
      baseLearning: 7 + Math.floor(Math.random() * 7),
      baseProwess: 8 + Math.floor(Math.random() * 8),
      personalityTraits: ['Content', 'Honest'],
      v17Traits: ['Content', 'Honest'],
      congenitalTraits: [],
      physicalHealthTraits: [],
      commanderTraits: [],
      lifestyleTraits: [],
      aiArchetype: 'Honorable Paragon',
      treasury: 95,
      menAtArms: 75,
      prestige: 140,
      piety: 80,
      stress: 0,
      stressLevel: 0,
      dread: 8,
      loyalty: 86,
      ambition: `Establish House ${newHouseName} as a steadfast pillar of the realm`,
      tragicFlaw: 'Eagerness to prove noble worth',
      darkSecret: 'Humble origins before royal ennoblement',
      sacredOath: `Serve the Crown of ${realm?.name || 'the Realm'} faithfully`,
      knownSecrets: [],
      hooksHeld: [],
      hooksOnMe: [],
      opinions: { [monarch.id]: 45 },
      vassalIds: [],
      claims: [],
      grudges: [],
      crimes: [],
    };

    world.characters.push(newLord);
    county.rulerId = newLord.id;
    county.coatOfArms = cloneCoatOfArmsData(newArms);
    if (capBurg) {
      capBurg.ownerId = newLord.id;
      capBurg.rulerTitle = newLord.title;
    }
    for (const h of world.holdings || []) {
      if (h.provinceId === county.id && h.ownerId === monarch.id) {
        h.ownerId = newLord.id;
      }
    }
    monarch.vassalIds = monarch.vassalIds || [];
    monarch.vassalIds.push(newLord.id);
    monarch.prestige = (monarch.prestige || 100) + 30;

    if (!world.history) world.history = [];
    world.history.unshift({
      id: generateUniqueId('hist_ennoble'),
      year: world.currentYear,
      title: `New Noble House Raised: House ${newHouseName}`,
      category: 'Dynastic Drama',
      description: `${monarch.name} elevated ${newLord.name} to the peerage as ${newLord.title}, founding House ${newHouseName} with unique heraldry.`,
      primaryActorId: monarch.id,
      secondaryActorId: newLord.id,
      realmId: monarch.realmId,
    });

    recalculateAllGravitas(world);
    recalculateDynamicLoyalty(world, false);
    return {
      success: true,
      summary: `Ennobled ${newLord.name} as ${newLord.title}! House ${newHouseName} swore loyal fealty.`,
    };
  }
}

// ============================================
// 13. WORLD INITIALIZATION & MONTHLY STEP
// ============================================

export function ensureV17WorldInitialized(world: WorldState): WorldState {
  if (world.provinces && world.holdings && world.realmLaws) {
    ensureGovernanceInitialized(world);
    cleanupDeceasedAndEnsureSuccessors(world);
    recalculateAllGravitas(world);
    recalculateCharacterRelationships(world);
    const cy = world.currentYear || 1042;
    for (const c of world.characters || []) {
      const refYear = c.deathYear ?? cy;
      if (c.birthYear === undefined) {
        c.birthYear = refYear - c.age;
      }
      if (
        c.investitureYear === undefined &&
        c.age >= 16 &&
        c.role !== 'Child' &&
        c.role !== 'Cadet Prince' &&
        c.role !== 'Cadet Princess' &&
        c.role !== 'Noble Scion' &&
        c.role !== 'Disinherited Bastard'
      ) {
        c.investitureYear = Math.min(refYear, c.birthYear + Math.max(16, Math.floor(c.age * 0.55)));
      }
      if (c.spouseId && c.marriageYear === undefined) {
        c.marriageYear = Math.min(refYear, c.birthYear + Math.max(16, Math.floor(c.age * 0.67)));
      }
    }
    TradeNodeEngine.ensureTradeNodesInitialized(world);
    EstatesEngine.ensureEstatesInitialized(world);
    AggressiveExpansionEngine.ensureAE(world);
    const hasAncestralClaims = (world.characters || []).some((c) => (c.claims || []).some((cl) => cl.isAncestral));
    if (!hasAncestralClaims && world.holdings && world.holdings.length > 0) {
      seedBeginningHouseAncestralClaims(world);
    }
    return world;
  }
  const w = cloneWorldState(world);
  w.mesh = world.mesh;
  w.sim = world.sim;
  w.rivers = world.rivers;
  w.month = w.month || 1;
  w.currentYear = w.currentYear || 1042;
  w.hegemony = w.hegemony || 1.15;
  w.realmState = w.realmState || 'Balanced Feudalism';
  w.lockedDownProvinces = w.lockedDownProvinces || [];
  w.epidemics = w.epidemics || [];
  w.cadetHouses = w.cadetHouses || {};
  w.factions = w.factions || [];
  w.favors = w.favors || [];
  w.armies = w.armies || [];

  w.foreignNations = w.foreignNations || [
    { name: 'Valyrian Empire', militaryStrength: 1500, threatLevel: 25, truceMonths: 0 },
    { name: 'Iron Steppe Nomads', militaryStrength: 1000, threatLevel: 40, truceMonths: 0 },
  ];

  w.realmLaws = w.realmLaws || {
    succession: 'Partition',
    gender: 'Agnatic-Cognatic',
    authority: 'Limited',
    justice: 'Traditional',
  };

  const provinces: Province[] = [];
  const holdings: Holding[] = [];

  let provCounter = 1;
  for (const c of (w.counties || [])) {
    const countyCells = (w.cells || []).filter((cell) => cell.countyId === c.id || (c.cellIndices && c.cellIndices.includes(cell.index)));
    const avgElev = countyCells.reduce((acc, cell) => acc + cell.elevation, 0) / (countyCells.length || 1);
    const hasCoast = countyCells.some((cell) => cell.isCoast);
    const hasForest = countyCells.some((cell) => cell.reliefType === 'forest');

    let terrain: TerrainType = 'Plains';
    if (avgElev > 0.65) terrain = 'Mountains';
    else if (hasCoast) terrain = 'Coastal';
    else if (hasForest) terrain = 'Forest';

    const capitalBurg = w.burgs.find((b) => b.id === c.capitalBurgId) || w.burgs[0];

    const prov: Province = {
      id: c.id || `prov_${provCounter++}`,
      name: c.name,
      realmId: c.realmId,
      terrain,
      neighbors: [],
      holdingIds: [],
      cellIndices: c.cellIndices || [],
      capitalX: capitalBurg ? capitalBurg.x : 500,
      capitalY: capitalBurg ? capitalBurg.y : 350,
      isQuarantined: false,
    };
    provinces.push(prov);
  }

  for (const burg of (w.burgs || [])) {
    const estateType: EstateType =
      burg.type === 'Border Fortress' || burg.type === 'Capital Citadel'
        ? 'Castle'
        : burg.type === 'Ancient Sanctuary'
        ? 'Temple'
        : 'City';

    const h: Holding = {
      id: `holding_${burg.id}`,
      name: `${burg.name} ${estateType}`,
      estateType,
      provinceId: burg.countyId,
      baseTax: estateType === 'City' ? 35 : estateType === 'Temple' ? 18 : 12,
      baseLevy: burg.garrisonCount || Math.max(40, Math.round((burg.population || 2500) * 0.015)),
      dev: burg.developmentLevel || 30,
      adminOverhead: 10,
      ownerId: burg.ownerId || w.monarchId || w.characters[0]?.id || 'char_1',
    };
    holdings.push(h);

    const prov = provinces.find((p) => p.id === burg.countyId);
    if (prov) {
      prov.holdingIds.push(h.id);
    }
  }

  w.provinces = provinces;
  w.holdings = holdings;
  rebuildProvinceLandNeighbors(w);
  computeExclaveProvinceIds(w);

  const realm1 =
    (w.playerRealmId ? w.realms.find((r) => r.id === w.playerRealmId) : undefined) ||
    w.realms[0];
  const capBurg = w.burgs.find((b) => b.id === realm1?.capitalBurgId);
  const capProv = provinces.find((p) => p.id === capBurg?.countyId || p.capitalX === capBurg?.x) || provinces[0];
  w.capitalProvinceId = capProv?.id || provinces[0]?.id;
  w.monarchId = realm1?.rulerId || w.characters[0]?.id;

  for (let idx = 0; idx < w.characters.length; idx++) {
    const char = w.characters[idx];
    const ownedBurg = w.burgs.find((b) => b.ownerId === char.id);
    const prov = provinces.find((p) => p.id === ownedBurg?.countyId) || provinces[idx % provinces.length];
    const refYear = char.deathYear ?? w.currentYear;
    if (char.birthYear === undefined) {
      char.birthYear = refYear - char.age;
    }
    if (
      char.investitureYear === undefined &&
      char.age >= 16 &&
      char.role !== 'Child' &&
      char.role !== 'Cadet Prince' &&
      char.role !== 'Cadet Princess' &&
      char.role !== 'Noble Scion' &&
      char.role !== 'Disinherited Bastard'
    ) {
      char.investitureYear = Math.min(refYear, char.birthYear + Math.max(16, Math.floor(char.age * 0.55)));
    }
    if (char.spouseId && char.marriageYear === undefined) {
      char.marriageYear = Math.min(refYear, char.birthYear + Math.max(16, Math.floor(char.age * 0.67)));
    }
    char.provinceId = prov?.id;
    char.isTraveling = false;
    char.travelMonthsLeft = 0;
    char.travelPurpose = '';
    if (char.menAtArms === undefined || char.organicGravitas === undefined) {
      const standing = calculateCharacterFeudalStanding(char, w);
      if (char.menAtArms === undefined) {
        char.menAtArms = standing.menAtArms;
      }
      if (!char.organicGravitas) {
        char.organicGravitas = {
          militaryAutonomy: standing.demesneLevies + standing.vassalLevies,
          economicExtraction: 40 + (idx % 4) * 15,
          populistLoyalty: 120 + (idx % 3) * 50,
          lineagePrestige: char.prestige || 100,
          sovereignDebtHeld: idx === 2 ? 100 : 0,
        };
      }
    }
    if (char.isAlive === false) {
      char.treasury = 0;
    } else if (char.treasury === undefined) {
      char.treasury =
        char.titleTier === 'King' || char.titleTier === 'Emperor'
          ? 240
          : char.titleTier === 'Duke'
          ? 160
          : char.titleTier === 'Count'
          ? 90
          : 40;
    }

    syncCharacterTraits(char);
    const syncedTraits = char.v17Traits || [];

    // Realistic varied loyalty so ambitious or alienated nobles can form factions organically
    if (char.loyalty === undefined) {
      const liegeOp = char.liegeId ? (char.opinions?.[char.liegeId] ?? 0) : 0;
      let baseLoyalty = 58 + Math.round(liegeOp * 0.4) + ((idx % 5) - 2) * 6;
      if (syncedTraits.includes('Ambitious') || syncedTraits.includes('Deceitful')) baseLoyalty -= 12;
      if (syncedTraits.includes('Content') || syncedTraits.includes('Trusting')) baseLoyalty += 16;
      char.loyalty = Math.max(18, Math.min(95, baseLoyalty));
    }
    char.ambitionScore = char.ambitionScore ?? 35 + (idx % 6) * 12;
    char.paranoia = char.paranoia ?? 15 + (idx % 3) * 15;
    char.contentment = char.contentment ?? 60;
    char.psychState = char.psychState || 'Normal';
    char.vassalIds = char.vassalIds || [];
    char.crimes = char.crimes || [];
    char.grudges = char.grudges || [];

    const orbitRing: AccessLevel =
      char.id === w.monarchId
        ? 'INNER_RING'
        : idx < 4
        ? 'INNER_RING'
        : idx < 8
        ? 'MIDDLE_RING'
        : 'OUTER_RING';
    char.courtPosition = char.courtPosition || {
      orbit: orbitRing,
      capitalSecrets: 10 + (idx % 5) * 5,
      capitalBottlenecks: 15,
      capitalFavors: 10,
      decayPressure: 0,
    };

    if (!char.claims) char.claims = [];
    // Seed initial hereditary claims for ambitious dukes & rival monarchs so AI diplomacy/wars are alive
    const isMonarchOrDuke = char.titleTier === 'King' || char.titleTier === 'Emperor' || char.titleTier === 'Duke';
    if (char.claims.length === 0 && (idx === 1 || (isMonarchOrDuke && char.id !== w.monarchId && idx % 3 === 1))) {
      const targetH = holdings.find((h) => {
        const owner = w.characters.find((x) => x.id === h.ownerId);
        return owner && owner.realmId !== char.realmId;
      }) || holdings[0];
      if (targetH) {
        char.claims.push({
          holdingId: targetH.id,
          claimantId: char.id,
          isPressed: true,
          isStrong: true,
        });
      }
    }
  }

  // Populate vassalIds from liegeId relationships
  for (const char of w.characters) {
    if (char.liegeId) {
      const liege = w.characters.find(c => c.id === char.liegeId);
      if (liege) {
        if (!liege.vassalIds) liege.vassalIds = [];
        if (!liege.vassalIds.includes(char.id)) liege.vassalIds.push(char.id);
      }
    }
  }

  if (w.characters.length >= 2) {
    w.favors.push({
      id: generateUniqueId('favor_init'),
      debtorId: w.monarchId || w.characters[0].id,
      creditorId: w.characters[1].id,
      value: 100,
      origin: 'Ancient Dynastic Blood Debt',
      isDynastyLevel: true,
      ageInYears: 12,
    });
  }

  ensureEconomy(w);
  ensureGovernanceInitialized(w);
  TradeNodeEngine.ensureTradeNodesInitialized(w);
  EstatesEngine.ensureEstatesInitialized(w);
  AggressiveExpansionEngine.ensureAE(w);
  RealmDiplomacyEngine.seedInitialRealmDiplomacy(w);
  seedBeginningHouseAncestralClaims(w);
  cleanupDeceasedAndEnsureSuccessors(w);
  recalculateCharacterRelationships(w);
  recalculateAllGravitas(w);
  return w;
}

export function advanceV17GrandStrategyStep(
  world: WorldState,
  options?: { skipCaravanProgress?: boolean; monthsDelta?: number }
): WorldState {
  const w = ensureV17WorldInitialized(world);
  const monthsDelta = Math.max(1, options?.monthsDelta || 1);
  w.month = (w.month || 0) + monthsDelta;

  // 1. Geography & Spatial Travel
  GeographyAndTravelEngine.step(w, monthsDelta);

  // 2. Ecological Carrying Capacity & Food Deficit Check
  CarryingCapacityEngine.updateAllBurgs(w);

  // 3. Dynamic Flow Economy & Caravans (settle/remove arrivals first, then spawn if conditions met)
  FlowEconomyEngine.stepFlowCaravans(w, !!options?.skipCaravanProgress);
  FlowEconomyEngine.spawnFlowCaravans(w, 6, false);

  // 4. Debt Leverage, Overdue Loans & Defaults
  processDebtLeverageAndDefaults(w, monthsDelta);

  // 5. Plague & Quarantines
  PlagueEngine.step(w, monthsDelta);

  // 6. Marching Armies, Pitched Clashes, Sieges & Active War Resolution
  ClaimAndWarEngine.stepArmies(w, monthsDelta);
  SiegeAndPeaceEngine.step(w, monthsDelta);
  ClaimAndWarEngine.advanceWarsMonthly(w, monthsDelta);
  RealmDiplomacyEngine.stepAI(w);

  // 7. Lust, Dynasty, Pregnancies, AI Marriages & Solvent Peacetime Reinforcement
  for (const c of w.characters) {
    if (c.isAlive) {
      LustAndDynastyEngine.process(c, w, monthsDelta);
    }
  }

  // Proactive Noble House Marriage Alliances: Houses strive to wed eligible offspring aged 18+
  // Permitted with blood relatives, domestic nobles, foreign nobles, and royal houses unless restricted by law
  const hasLivingSpouseChar = (ch: Character) =>
    Boolean(ch.spouseId && w.characters.some((x) => x.id === ch.spouseId && x.isAlive !== false));
  const eligibleSingles = w.characters.filter(
    (c) =>
      c.isAlive &&
      !hasLivingSpouseChar(c) &&
      !c.isMonk &&
      !c.isImprisoned &&
      c.age >= 18 &&
      c.age <= 48 &&
      c.titleTier !== 'Commoner' &&
      !collectAllCharacterTraits(c).includes('Celibate')
  );
  if (eligibleSingles.length >= 2) {
    const tierScore: Record<string, number> = {
      Emperor: 65,
      King: 55,
      Duke: 38,
      Count: 25,
      Baron: 14,
      Mayor: 10,
    };
    const wedThisStep = new Set<string>();
    const maxAttempts = Math.min(4, Math.floor(eligibleSingles.length / 2));

    // Prioritize unmarried house offspring (18-32), heirs, and high nobles seeking alliances
    const prioritizedSuitors = [...eligibleSingles].sort((a, b) => {
      const aOffspringBoost = (a.knownFatherId || a.motherId) && a.age <= 32 ? 25 : 0;
      const bOffspringBoost = (b.knownFatherId || b.motherId) && b.age <= 32 ? 25 : 0;
      const aScore = (tierScore[a.titleTier || 'Baron'] || 10) + aOffspringBoost + Math.random() * 18;
      const bScore = (tierScore[b.titleTier || 'Baron'] || 10) + bOffspringBoost + Math.random() * 18;
      return bScore - aScore;
    });

    let marriagesForged = 0;
    for (const suitor of prioritizedSuitors) {
      if (marriagesForged >= maxAttempts) break;
      if (wedThisStep.has(suitor.id) || hasLivingSpouseChar(suitor)) continue;

      const suitorTraits = collectAllCharacterTraits(suitor);
      const suitorDynastyWeight = computeAIStrategyWeight(suitorTraits, 'ROMANCE_AND_DYNASTY');
      const marriageEagerness = Math.min(0.85, 0.48 * suitorDynastyWeight);
      if (Math.random() > marriageEagerness) continue;

      const isAmbitiousSuitor = suitorTraits.includes('Ambitious') || suitorTraits.includes('Greedy');
      const candidates = eligibleSingles.filter((b) => {
        if (b.id === suitor.id || wedThisStep.has(b.id) || hasLivingSpouseChar(b)) return false;
        if (b.gender === suitor.gender) return false;
        if (b.realmId !== suitor.realmId && RealmDiplomacyEngine.areRealmsEnemies(suitor.realmId, b.realmId, w)) {
          return false;
        }
        return checkMarriageLegality(suitor, b, w).allowed;
      });

      if (candidates.length > 0) {
        candidates.sort((a, b) => {
          const legA = checkMarriageLegality(suitor, a, w);
          const legB = checkMarriageLegality(suitor, b, w);
          const rankScoreA =
            (tierScore[a.titleTier || 'Baron'] || 10) * (isAmbitiousSuitor ? 1.8 : 1.0) +
            (a.prestige || 0) * 0.015 +
            (legA.isRoyalMatch ? 22 : 0) +
            (legA.isForeign ? 14 : 8) -
            (legA.isCloseKin ? 16 : 0);
          const rankScoreB =
            (tierScore[b.titleTier || 'Baron'] || 10) * (isAmbitiousSuitor ? 1.8 : 1.0) +
            (b.prestige || 0) * 0.015 +
            (legB.isRoyalMatch ? 22 : 0) +
            (legB.isForeign ? 14 : 8) -
            (legB.isCloseKin ? 16 : 0);
          return rankScoreB - rankScoreA;
        });
        const topPool = candidates.slice(0, Math.min(4, candidates.length));
        const partner = topPool[Math.floor(Math.random() * topPool.length)];
        if (partner) {
          const res = PlayerActionEngine.arrangeMarriage(suitor, partner, w);
          if (res.success) {
            wedThisStep.add(suitor.id);
            wedThisStep.add(partner.id);
            marriagesForged++;
          }
        }
      }
    }
  }

  // Solvent peacetime Men-at-Arms reinforcement toward feudal standing ceiling
  const atWarLeaderIds = new Set<string>();
  for (const war of w.activeWars || []) {
    atWarLeaderIds.add(war.attackerLeaderId);
    atWarLeaderIds.add(war.defenderLeaderId);
  }
  for (const c of w.characters) {
    if (!c.isAlive) continue;
    const cRealm = w.realms.find((r) => r.rulerId === c.id);
    const availGold = cRealm?.treasury !== undefined ? cRealm.treasury : (c.treasury || 0);
    if (!c.isImprisoned && availGold >= 80 && !atWarLeaderIds.has(c.id)) {
      const cap = calculateCharacterFeudalStanding(c, w).menAtArms;
      const cur = c.menAtArms ?? cap;
      if (cur < cap) {
        const gain = Math.max(1, Math.ceil(cap * 0.1 * Math.min(3, monthsDelta)));
        c.menAtArms = Math.min(cap, cur + gain);
      }
    }
  }

  // 8. Autonomous AI Brain (Embezzlement, Factions, Ransoms, Wars)
  for (const c of w.characters) {
    if (c.isAlive) {
      AutonomousAIBrain.act(c, w);
    }
  }

  // 8b. Advance & Resolve ALL Active Plots & Intrigue Schemes Monthly
  stepActivePlotsAndSchemes(w, monthsDelta);

  // 9. Civil War Resolution (ensure realmState doesn't remain stuck if no active war/faction exists)
  const hasRebelFaction = (w.factions || []).some((f) => f.ultimatumIssued);
  const hasActiveArmies = (w.armies || []).length > 0;
  if (w.realmState === 'Civil War') {
    if (hasRebelFaction) {
      CivilWarEngine.resolve(w);
    } else if (!hasActiveArmies && (w.activeWars || []).length === 0) {
      w.realmState = 'Balanced Feudalism';
    }
  }

  // 10. Foreign Invasions
  ForeignInvasionEngine.step(w);

  // 11. Sovereign Hegemony Check (strictly scoped to disloyal domestic vassals in primary/player realm)
  const primaryRealm =
    (w.playerRealmId ? w.realms?.find((r) => r.id === w.playerRealmId) : undefined) ||
    w.realms?.[0];
  const primaryMonarchId = primaryRealm?.rulerId || w.monarchId;
  const primaryRealmId = primaryRealm?.id;
  const charLookup = new Map<string, Character>((w.characters || []).map((c) => [c.id, c]));
  const factionMemberIds = new Set<string>((w.factions || []).flatMap((f) => f.members));

  const crownHoldings = (w.holdings || []).filter((h) => h.ownerId === primaryMonarchId);
  const crownLevies = crownHoldings.reduce((acc, h) => acc + getHoldingYields(h).levy, 260);

  let disloyalVassalLevies = 0;
  let allDomesticVassalLevies = 0;
  for (const h of w.holdings || []) {
    if (h.ownerId === primaryMonarchId) continue;
    const owner = charLookup.get(h.ownerId);
    if (!owner || (primaryRealmId && owner.realmId !== primaryRealmId)) continue;
    const levy = getHoldingYields(h).levy;
    allDomesticVassalLevies += levy;
    const lowLoyalty = (owner.loyalty ?? 58) < 48;
    const hostileOpinion = (owner.opinions?.[primaryMonarchId || ''] ?? 0) < -10;
    if (lowLoyalty || hostileOpinion || factionMemberIds.has(owner.id)) {
      disloyalVassalLevies += levy;
    }
  }

  const effectiveDomesticOpposition = Math.max(200, disloyalVassalLevies + allDomesticVassalLevies * 0.25);
  w.hegemony = Math.min(3.0, Math.max(0.05, Math.round((crownLevies / effectiveDomesticOpposition) * 100) / 100));
  if (w.realmState !== 'Civil War' && w.realmState !== 'Foreign Invasion') {
    if (w.hegemony >= 1.5) w.realmState = 'Absolute Autocracy';
    else if (w.hegemony >= 0.75) w.realmState = 'Balanced Feudalism';
    else w.realmState = 'Fragmentation';
  }

  // 12. Exclave Topology Refresh, Deceased Cleanup, Successor Continuity, Relationships & Gravitas Recalibration
  computeExclaveProvinceIds(w);
  cleanupDeceasedAndEnsureSuccessors(w);
  recalculateCharacterRelationships(w);
  recalculateAllGravitas(w);

  // 13. Political System Reforms, Anti-Corruption & Crisis Catalyst Windows
  stepGovernanceSystem(w);

  // 14. Macro-Statecraft: Topologically Sorted Trade Nodes, Estates, AE Coalitions & Monarch Lifestyles
  TradeNodeEngine.stepTradeNodes(w, monthsDelta);
  EstatesEngine.stepEstatesMonthly(w, monthsDelta);
  AggressiveExpansionEngine.stepAEAndCoalitions(w, monthsDelta);
  LifestylePerksEngine.stepMonarchLifestyleMonthly(w, monthsDelta);

  return w;
}

/**
 * Advances and resolves ALL active intrigue plots/schemes every month so plots
 * visibly progress during both live Play and multi-year fast-forward.
 */
export function stepActivePlotsAndSchemes(w: WorldState, monthsDelta: number = 1): void {
  if (!w.characters || w.characters.length === 0) return;
  if (!w.history) w.history = [];
  const stepMonths = Math.max(1, Math.min(12, monthsDelta));

  for (const char of [...w.characters]) {
    if (!char.isAlive || !char.activeScheme) continue;
    const scheme = char.activeScheme;
    const target = w.characters.find((c) => c.id === scheme.targetId);

    // Abort cleanly if target no longer exists or is already dead
    if (!target || !target.isAlive) {
      char.activeScheme = undefined;
      continue;
    }

    const actorIntrigue = getCharacterV17Stat(char, 'INTRIGUE', w);
    const targetIntrigue = getCharacterV17Stat(target, 'INTRIGUE', w);

    // Monthly progress: ~9-18% per month depending on intrigue advantage
    const baseGain = 8 + Math.floor(actorIntrigue * 0.45) - Math.floor(targetIntrigue * 0.15) + Math.floor(Math.random() * 5);
    const gain = Math.max(4, Math.min(28, baseGain)) * stepMonths;
    scheme.progress = Math.min(100, Math.round((scheme.progress || 0) + gain));

    if (scheme.progress < 100) continue;

    const schemeKind = String(scheme.type || 'Murder').toLowerCase();
    const successChance = Math.max(0.25, Math.min(0.88, 0.52 + (actorIntrigue - targetIntrigue) * 0.025));
    const succeeded = Math.random() < successChance;

    if (schemeKind.includes('murder') || schemeKind.includes('assassin') || schemeKind.includes('poison')) {
      if (succeeded) {
        char.prestige = (char.prestige || 100) + 90;
        char.dread = Math.min(100, (char.dread || 0) + 22);
        const picked = pickContextualDeathCause(target, 'assassination', () => Math.random());
        killCharacter(target, picked.cause, w, picked.category);
        w.history.unshift({
          id: generateUniqueId('hist_plot_murder'),
          year: w.currentYear,
          title: `Assassination Plot Succeeds: ${target.name} Slain`,
          category: 'Assassination',
          description: `${char.name}'s covert plot reached fruition: ${target.name} died under dark circumstances (${picked.cause}).`,
          primaryActorId: char.id,
          secondaryActorId: target.id,
          realmId: target.realmId || char.realmId,
        });
      } else {
        if (!char.opinions) char.opinions = {};
        if (!target.opinions) target.opinions = {};
        char.opinions[target.id] = -90;
        target.opinions[char.id] = -100;
        char.rivalId = target.id;
        target.rivalId = char.id;
        w.history.unshift({
          id: generateUniqueId('hist_plot_foiled'),
          year: w.currentYear,
          title: `Assassination Plot Exposed Against ${target.name}`,
          category: 'Dynastic Drama',
          description: `Court agents foiled a lethal conspiracy orchestrated by ${char.name} targeting ${target.name}, igniting a bitter blood feud.`,
          primaryActorId: char.id,
          secondaryActorId: target.id,
          realmId: target.realmId || char.realmId,
        });
      }
    } else if (schemeKind.includes('claim') || schemeKind.includes('fabricat')) {
      const targetHolding = w.holdings?.find((h) => h.ownerId === target.id);
      if (succeeded && targetHolding) {
        if (!char.claims) char.claims = [];
        if (!char.claims.some((cl) => cl.holdingId === targetHolding.id)) {
          char.claims.push({
            holdingId: targetHolding.id,
            claimantId: char.id,
            isPressed: true,
            isStrong: true,
          });
        }
        w.history.unshift({
          id: generateUniqueId('hist_plot_claim'),
          year: w.currentYear,
          title: `Claim Fabricated on ${targetHolding.name}`,
          category: 'Dynastic Drama',
          description: `${char.name} forged ancient charters asserting hereditary rights to ${targetHolding.name}, held by ${target.name}.`,
          primaryActorId: char.id,
          secondaryActorId: target.id,
          realmId: char.realmId,
        });
      } else {
        w.history.unshift({
          id: generateUniqueId('hist_plot_claim_fail'),
          year: w.currentYear,
          title: `Forged Claim Discredited`,
          category: 'Dynastic Drama',
          description: `Heralds exposed ${char.name}'s fabricated claim against ${target.name} as a clumsy forgery.`,
          primaryActorId: char.id,
          secondaryActorId: target.id,
          realmId: char.realmId,
        });
      }
    } else if (schemeKind.includes('abduct') || schemeKind.includes('kidnap')) {
      if (succeeded) {
        target.isImprisoned = true;
        w.history.unshift({
          id: generateUniqueId('hist_plot_abduct'),
          year: w.currentYear,
          title: `Abduction Plot: ${target.name} Seized`,
          category: 'Dynastic Drama',
          description: `Agents of ${char.name} ambushed and spirited away ${target.name} into secret captivity.`,
          primaryActorId: char.id,
          secondaryActorId: target.id,
          realmId: target.realmId || char.realmId,
        });
      } else {
        if (!target.opinions) target.opinions = {};
        target.opinions[char.id] = Math.max(-100, (target.opinions[char.id] ?? 0) - 55);
        w.history.unshift({
          id: generateUniqueId('hist_plot_abduct_fail'),
          year: w.currentYear,
          title: `Abduction Attempt Foiled`,
          category: 'Dynastic Drama',
          description: `Bodyguards thwarted ${char.name}'s plot to abduct ${target.name}.`,
          primaryActorId: char.id,
          secondaryActorId: target.id,
          realmId: target.realmId || char.realmId,
        });
      }
    } else if (schemeKind.includes('seduc') || schemeKind.includes('romanc')) {
      if (succeeded) {
        char.loverId = target.id;
        target.loverId = char.id;
        if (!target.opinions) target.opinions = {};
        target.opinions[char.id] = Math.min(100, (target.opinions[char.id] ?? 0) + 45);
        w.history.unshift({
          id: generateUniqueId('hist_plot_seduce'),
          year: w.currentYear,
          title: `Courtly Liaison: ${char.name} & ${target.name}`,
          category: 'Dynastic Drama',
          description: `${char.name}'s quiet courtship won the affection of ${target.name}, stirring whispers in the royal court.`,
          primaryActorId: char.id,
          secondaryActorId: target.id,
          realmId: char.realmId,
        });
      }
    } else if (schemeKind.includes('sway') || schemeKind.includes('befriend')) {
      if (!target.opinions) target.opinions = {};
      target.opinions[char.id] = Math.min(100, (target.opinions[char.id] ?? 0) + (succeeded ? 35 : 10));
      if (succeeded) {
        char.friendId = target.id;
        target.friendId = char.id;
      }
      w.history.unshift({
        id: generateUniqueId('hist_plot_sway'),
        year: w.currentYear,
        title: `Diplomatic Sway: ${char.name} Courts ${target.name}`,
        category: 'Diplomacy',
        description: `${char.name} cultivated goodwill with ${target.name}${succeeded ? ', forging a warm courtly friendship' : ''}.`,
        primaryActorId: char.id,
        secondaryActorId: target.id,
        realmId: char.realmId,
      });
    } else {
      // Blackmail, Coup, Usurp, or any custom plot type
      if (succeeded) {
        const extracted = Math.min(180, Math.max(25, Math.round((target.treasury || 100) * 0.15)));
        target.treasury = Math.max(0, (target.treasury || 0) - extracted);
        char.treasury = Math.round((char.treasury || 0) + extracted);
        char.prestige = (char.prestige || 100) + 45;
        w.history.unshift({
          id: generateUniqueId('hist_plot_scheme'),
          year: w.currentYear,
          title: `Scheme Concluded: ${scheme.type}`,
          category: 'Dynastic Drama',
          description: `${char.name} successfully executed a ${scheme.type} plot against ${target.name} (${scheme.motive}), gaining ${extracted}g and leverage.`,
          primaryActorId: char.id,
          secondaryActorId: target.id,
          realmId: char.realmId,
        });
      } else {
        if (!target.opinions) target.opinions = {};
        target.opinions[char.id] = Math.max(-100, (target.opinions[char.id] ?? 0) - 35);
        w.history.unshift({
          id: generateUniqueId('hist_plot_scheme_fail'),
          year: w.currentYear,
          title: `Scheme Uncovered: ${scheme.type}`,
          category: 'Dynastic Drama',
          description: `${char.name}'s ${scheme.type} conspiracy against ${target.name} was uncovered before bearing fruit.`,
          primaryActorId: char.id,
          secondaryActorId: target.id,
          realmId: char.realmId,
        });
      }
    }

    char.activeScheme = undefined;
  }
}