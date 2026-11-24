import type { TerrainType, Claim } from './world';

// ============================================================================
// 1. UNIT TAXONOMY & REGIMENT SYSTEM
// ============================================================================

export type UnitCategory =
  | 'Levy'
  | 'Spear'
  | 'Infantry'
  | 'Ranged'
  | 'Cavalry'
  | 'Siege'
  | 'CulturalSpecial';

export interface RegimentDefinition {
  category: UnitCategory;
  baseAttack: number;
  baseDefense: number;
  isCavalry: boolean;
  isRanged: boolean;
  isSiege: boolean;
  strongAgainst: UnitCategory[];
  vulnerableTo: UnitCategory[];
  terrainAffinities: Partial<Record<TerrainType, number>>;
  defaultPlaceholder: string;
  description: string;
  // Economy & Military Logistics (explicit per-100-men schedule)
  recruitmentCost?: number;
  recruitCostPer100: number; // Explicit gold recruitment cost per 100 men
  upkeepGold?: number; // Monthly cost per 100 men
  upkeepGoldPer100: number; // Explicit monthly gold upkeep per 100 men
  equipmentInputsPer100?: Record<string, number>; // Local market equipment goods per 100 men
  siegeProgressPerMonth?: number;
}

export interface Regiment {
  id: string;
  category: UnitCategory;
  name?: string;
  placeholderName: string;
  originRealmId?: string;
  originRealmName?: string;
  originCulture?: string;
  count: number;
  maxCount: number;
  morale: number; // 0 to 100
  veterancy: number; // 0 to 100
}

export function getRegimentDisplayName(regiment: Regiment): string {
  return regiment.name || regiment.placeholderName;
}

// ============================================================================
// 2. MARCHING ARMIES & COMMAND
// ============================================================================

export type BattleTactic =
  | 'Standard Line'
  | 'Shieldwall'
  | 'Cavalry Envelopment'
  | 'Ambush & Skirmish'
  | 'Vanguard Shock'
  | 'Fabian Attrition';

export type ArmyConductPolicy =
  | 'Strict Quarter'
  | 'Forage & Requisition'
  | 'Free Plunder'
  | 'Scorched Earth';

export type WarConductOutcomeTier =
  | 'Orderly Occupation'
  | 'Foraging & Requisitions'
  | 'Unchecked Pillaging'
  | 'Brutal Sack & Atrocities';

export interface ArmyWaypoint {
  x: number;
  y: number;
  cumCost: number; // Cumulative terrain/road-weighted march cost from start
  isRoad?: boolean;
  isSea?: boolean;
  portBurgId?: string;
  portBurgName?: string;
  terrainLabel?: string;
}

/**
 * Single source of truth for Field Armies across world simulation and tactical battle.
 */
export interface Army {
  id: string;
  name?: string;
  commanderId?: string;
  commanderName?: string;
  attackerId: string;
  defenderId: string;
  targetHoldingId: string;
  regiments?: Regiment[];
  strength: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  progress: number; // 0.0 to 1.0 along march route
  color: string;
  claim?: Claim | any;
  isReturning?: boolean;
  
  // NEW WARFARE EXTENSIONS
  warId?: string;
  realmId?: string;
  isDefender?: boolean;
  isPlayerControlled?: boolean;
  orderType?: 'auto' | 'manual_march' | 'liberate';
  speed?: number; // Distance/terrain-based march speed
  prevProgress?: number; // Previous tick progress for smooth visual interpolation
  waypoints?: ArmyWaypoint[];
  totalMarchCost?: number;
  tactic?: BattleTactic;
  lastBattleReport?: TacticalBattleReport;

  // Naval Embarkation & Ship Charter Logistics
  isEmbarked?: boolean;
  embarkationPortId?: string;
  embarkationPortName?: string;
  destinationPortId?: string;
  destinationPortName?: string;
  shipCharterCost?: number;
  shipCharterPaid?: boolean;
  awaitingShipFunds?: boolean;
  shipsChartered?: number;
  seaDistanceKm?: number;

  // Army Discipline & Wartime Conduct
  discipline?: number; // 0 to 100
  conductPolicy?: ArmyConductPolicy;

  // Castle Zone-of-Control Interception & Strategic Split / Consolidation Tracking
  deferredTargetHoldingId?: string;
  deferredTargetX?: number;
  deferredTargetY?: number;
  interceptedByCastleName?: string;
  isSiegeDetachment?: boolean;
  parentArmyId?: string;
  isGarrison?: boolean;
  isStrategicSplit?: boolean;
  splitGroupId?: string;
  splitExpiresMonths?: number;
  splitReason?: string;
}

export interface WarPeaceTerms {
  winnerRealmId: string;
  loserRealmId: string;
  cededHoldingIds: string[];
  cededCountyIds?: string[];
  reparationsGold: number;
  vassalizeLoser: boolean;
  isWhitePeace?: boolean;
  totalDemandCost: number;
}

// ============================================================================
// 3. TACTICAL BATTLES & COMMANDER DUELS
// ============================================================================

export type DuelOutcome = 'Unharmed' | 'Wounded' | 'Maimed' | 'Slain' | 'Captured';

export interface BattleDuelResult {
  commanderWon: boolean;
  attackerProwess: number;
  defenderProwess: number;
  outcomeDescription: string;
  fatalityOrInjury?: DuelOutcome;
}

export interface TacticalBattleReport {
  id: string;
  year: number;
  attackerWon: boolean;
  terrain: TerrainType;
  attackerCasualties: number;
  defenderCasualties: number;
  attackerRemainingStrength: number;
  defenderRemainingStrength: number;
  duelResult?: BattleDuelResult;
  narrativeSummary: string;
  holdingCaptured?: boolean;
  attackerTactic?: BattleTactic;
  defenderTactic?: BattleTactic;
  weatherCondition?: string;
  tacticalSummary?: string;
  diceSwingPct?: number;
  civilianCasualties?: number;
  levyPopulationLoss?: number;
  conductOutcome?: WarConductOutcomeTier;
  plunderedGold?: number;
  conductSummary?: string;
}

// ============================================================================
// 4. PHYSICAL SIEGE ENGINES & PROVISIONS
// ============================================================================

export type SiegePhase = 'ACTIVE' | 'SUPPLIED' | 'STARVING' | 'BREACHED' | 'SURRENDERED';

export interface SiegeState {
  id: string;
  holdingId: string;
  holdingName: string;
  provinceId: string;
  besiegerArmyId: string;
  attackerCommanderId: string;
  defenderLeaderId: string;
  fortLevel: number;
  garrisonCount: number;
  maxGarrison: number;
  provisionsMonths: number;
  wallIntegrity: number; // 0 to 100
  monthsActive: number;
  diseaseOutbreak: boolean;
  placeholderName: string;
  phase?: SiegePhase;
}

// ============================================================================
// 5. STRATEGIC ACTIVE WARS & CASUS BELLI
// ============================================================================

export type CasusBelliType =
  | 'Claim Conquest'
  | 'De Jure County'
  | 'Subjugation'
  | 'Liberty Rebellion'
  | 'Holy War'
  | 'Border Raid';

export interface CasusBelliEntry {
  type: CasusBelliType | string;
  label: string;
  targetHoldingId?: string;
  claimantId?: string;
}

export interface WarBattleRecord {
  id: string;
  year: number;
  holdingName: string;
  terrain: string;
  weatherCondition?: string;
  attackerCommanderId?: string;
  attackerCommanderName: string;
  defenderCommanderId?: string;
  defenderCommanderName: string;
  attackerWon: boolean;
  attackerTactic: BattleTactic;
  defenderTactic: BattleTactic;
  attackerCasualties: number;
  defenderCasualties: number;
  tacticalSummary: string;
  duelSummary?: string;
  traitNotes?: string[];
}

export interface ActiveWar {
  id: string;
  attackerRealmId: string;
  defenderRealmId: string;
  attackerLeaderId: string;
  defenderLeaderId: string;
  casusBelli: CasusBelliType | string;
  casusBellis?: CasusBelliEntry[];
  warScore: number; // -100 to 100
  battleWarScore?: number; // Net field-battle contribution (-60 to 60) combined with dynamic holding/province occupations
  monthsActive: number;
  targetHoldingIds: string[];
  battlesFought: number;
  alliedRealmIds?: string[];
  wavesSpawned?: number;
  battleLog?: WarBattleRecord[];
}