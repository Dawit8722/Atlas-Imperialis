import type {
  Burg,
  BurgBuildingSlotState,
  SettlementTier,
  SettlementType,
  WorldState,
} from '../types/world';
import type { CommodityType } from '../types/economy';

// ============================================================================
// 1. TYPES & DATA SCHEMAS
// ============================================================================

export interface BespokeBuildingLevel {
  level: number;
  name: string;
  minDev: number;
  goldCost: number;
  commodityCosts: Partial<Record<CommodityType, number>>;
  monthlyGoldUpkeep: number;
  monthlyCommodityUpkeep?: Partial<Record<CommodityType, number>>;
  taxBonus?: number;
  garrisonBonus?: number;
  carryingCapBonus?: number;
  devGrowthYr?: number;
  siegeDefensePct?: number;
  unrestDelta?: number;
  summary: string;
}

export interface BespokeBuildingSlot {
  id: string;
  slotIndex: number; // 1..8
  name: string;
  unlockDev: number;
  icon: string;
  category: 'economic' | 'military' | 'civic' | 'ecclesiastical' | 'maritime' | 'wonder';
  levels: BespokeBuildingLevel[];
}

export interface SettlementTypeBlueprint {
  type: SettlementType;
  tier: SettlementTier;
  tierNum: 1 | 2 | 3 | 4;
  role: string;
  maxSlots: number;
  devSoftCap: number;
  tierRebuildBaseGold: number;
  slots: BespokeBuildingSlot[];
}

export interface PromotionPathRule {
  fromType: SettlementType;
  toType: SettlementType;
  toTier: SettlementTier;
  minDev: number;
  minPop: number;
  requiredStreakYears: number;
  requiresCoastalOrRiver?: boolean;
  requiresCapital?: boolean;
  /** Minimum ratio of agrarian settlements (Farming Village / Mountain Hamlet / Fishing Port) per urban hub in realm/county */
  minAgrarianRatioInRealm?: number;
  minAgrarianInCounty?: number;
  keystoneSlots: Array<{ slotId: string; minLevel: number; label: string }>;
  hinterlandDescription: string;
}

export interface PromotionGateReport {
  hasNextStage: boolean;
  targetType?: SettlementType;
  minDev: number;
  currentDev: number;
  devMet: boolean;
  minPop: number;
  currentPop: number;
  popMet: boolean;
  keystoneMet: boolean;
  keystoneSummary: string;
  hinterlandMet: boolean;
  hinterlandSummary: string;
  peaceAndSurplusMet: boolean;
  streakYears: number;
  requiredStreakYears: number;
  progressPct: number;
  canPromoteNow: boolean;
}

export interface RebuildCostEstimate {
  devastation: number;
  dilapidatedSlots: number;
  fraction: number;
  devastationReduction: number;
  goldCost: number;
  commodities: Partial<Record<CommodityType, number>>;
  importSurchargeGold: number;
  totalGoldIfImportingMissing: number;
}

export type DevastationEventType =
  | 'raid'
  | 'siege_month'
  | 'siege_fall'
  | 'field_battle'
  | 'occupation_year';

// ============================================================================
// 2. CANONICAL BESPOKE SLOT BLUEPRINTS FOR ALL 9 SETTLEMENT TYPES
// ============================================================================

export const SETTLEMENT_BLUEPRINTS: Record<SettlementType, SettlementTypeBlueprint> = {
  'Farming Village': {
    type: 'Farming Village',
    tier: 'village',
    tierNum: 1,
    role: 'Agrarian backbone supplying grain, livestock, wool, and peasant levies.',
    maxSlots: 5,
    devSoftCap: 42,
    tierRebuildBaseGold: 150,
    slots: [
      {
        id: 'fv_tillage',
        slotIndex: 1,
        name: 'Tillage & Commons',
        unlockDev: 0,
        icon: '🌾',
        category: 'economic',
        levels: [
          {
            level: 1,
            name: 'Open-Field Strip Farms',
            minDev: 0,
            goldCost: 110,
            commodityCosts: { Timber: 4 },
            monthlyGoldUpkeep: 0.3,
            carryingCapBonus: 400,
            taxBonus: 0.5,
            summary: '+12% Grain output, +400 Carrying Cap',
          },
          {
            level: 2,
            name: 'Three-Field Rotation & Ox Ploughs',
            minDev: 14,
            goldCost: 220,
            commodityCosts: { Timber: 6, Iron: 3 },
            monthlyGoldUpkeep: 0.7,
            carryingCapBonus: 1100,
            taxBonus: 1.1,
            devGrowthYr: 0.04,
            summary: '+26% Grain output, +1,100 Cap, +0.04 Dev/yr',
          },
          {
            level: 3,
            name: 'Drained Furrows & Irrigation Channels',
            minDev: 28,
            goldCost: 390,
            commodityCosts: { Timber: 10, Stone: 6, Iron: 4 },
            monthlyGoldUpkeep: 1.3,
            carryingCapBonus: 2200,
            taxBonus: 1.8,
            devGrowthYr: 0.06,
            summary: '+45% Grain output, +2,200 Cap, Drought resilience',
          },
          {
            level: 4,
            name: 'Model Manorial Estate Farms',
            minDev: 42,
            goldCost: 620,
            commodityCosts: { Stone: 12, Iron: 8, Livestock: 6 },
            monthlyGoldUpkeep: 2.0,
            carryingCapBonus: 3600,
            taxBonus: 2.8,
            devGrowthYr: 0.08,
            summary: '+65% Grain & Flax, +3,600 Cap, +2.8g Tax',
          },
        ],
      },
      {
        id: 'fv_mill',
        slotIndex: 2,
        name: 'Mill & Granary',
        unlockDev: 8,
        icon: '⚙️',
        category: 'economic',
        levels: [
          {
            level: 1,
            name: 'Hand-Quern & Timber Barn',
            minDev: 8,
            goldCost: 125,
            commodityCosts: { Timber: 6 },
            monthlyGoldUpkeep: 0.4,
            taxBonus: 0.5,
            summary: '+2 mos Food Reserves, -10% Grain spoilage',
          },
          {
            level: 2,
            name: 'Undershot Watermill & Silo',
            minDev: 20,
            goldCost: 260,
            commodityCosts: { Timber: 8, Stone: 6 },
            monthlyGoldUpkeep: 0.9,
            taxBonus: 1.3,
            devGrowthYr: 0.06,
            summary: '+4 mos Food Reserves, +1.3g Mill Tolls, +0.06 Dev/yr',
          },
          {
            level: 3,
            name: 'Stone Windmill & Vaulted Granary',
            minDev: 34,
            goldCost: 450,
            commodityCosts: { Stone: 12, Timber: 6, Iron: 4 },
            monthlyGoldUpkeep: 1.6,
            taxBonus: 2.6,
            devGrowthYr: 0.08,
            summary: '+7 mos Food Reserves, +2.6g Tolls, Famine buffer',
          },
        ],
      },
      {
        id: 'fv_pasture',
        slotIndex: 3,
        name: 'Pasture & Croft',
        unlockDev: 18,
        icon: '🐑',
        category: 'economic',
        levels: [
          {
            level: 1,
            name: 'Common Sheepfold & Dairy',
            minDev: 18,
            goldCost: 165,
            commodityCosts: { Timber: 6, Livestock: 4 },
            monthlyGoldUpkeep: 0.5,
            taxBonus: 0.9,
            summary: '+18% Wool, Cheese & Livestock output',
          },
          {
            level: 2,
            name: 'Bridged Water-Meadows & Tannery',
            minDev: 30,
            goldCost: 310,
            commodityCosts: { Timber: 8, Salt: 6, 'Tanned Leather': 4 },
            monthlyGoldUpkeep: 1.1,
            taxBonus: 1.9,
            summary: '+35% Livestock & Leather, +15% Peasant SoL',
          },
          {
            level: 3,
            name: 'Select Breeding Paddocks & Apiaries',
            minDev: 44,
            goldCost: 520,
            commodityCosts: { Timber: 10, Stone: 6, Honey: 5 },
            monthlyGoldUpkeep: 1.9,
            taxBonus: 3.2,
            summary: '+55% Wool/Honey/Warhorse stock, +3.2g Tax',
          },
        ],
      },
      {
        id: 'fv_parish',
        slotIndex: 4,
        name: 'Parish & Bailiff Hall',
        unlockDev: 28,
        icon: '⛪',
        category: 'civic',
        levels: [
          {
            level: 1,
            name: 'Timber Tithe Barn & Bailiff House',
            minDev: 28,
            goldCost: 220,
            commodityCosts: { Timber: 8, Stone: 4 },
            monthlyGoldUpkeep: 0.8,
            taxBonus: 1.0,
            garrisonBonus: 60,
            unrestDelta: -8,
            summary: '-8% Unrest, +10% Tax efficiency, +60 Levy Pool',
          },
          {
            level: 2,
            name: 'Stone Parish Chapel & Village Green',
            minDev: 36,
            goldCost: 420,
            commodityCosts: { Stone: 12, 'Beeswax Candles': 4 },
            monthlyGoldUpkeep: 1.5,
            taxBonus: 1.8,
            garrisonBonus: 120,
            unrestDelta: -16,
            summary: '-16% Unrest, +15 Piety/yr, Market Town keystone',
          },
        ],
      },
      {
        id: 'fv_defense',
        slotIndex: 5,
        name: 'Manor Defense',
        unlockDev: 38,
        icon: '🛡️',
        category: 'military',
        levels: [
          {
            level: 1,
            name: 'Earthen Ditch & Timber Watch-Stockade',
            minDev: 38,
            goldCost: 280,
            commodityCosts: { Timber: 14 },
            monthlyGoldUpkeep: 1.1,
            garrisonBonus: 120,
            siegeDefensePct: 12,
            summary: '+120 Garrison, +12% Raid resistance',
          },
          {
            level: 2,
            name: 'Stone Pele Tower & Refuge Yard',
            minDev: 48,
            goldCost: 540,
            commodityCosts: { Stone: 16, Iron: 4 },
            monthlyGoldUpkeep: 2.2,
            garrisonBonus: 260,
            siegeDefensePct: 25,
            summary: '+260 Garrison, +25% Raid resistance',
          },
        ],
      },
    ],
  },

  'Mountain Hamlet': {
    type: 'Mountain Hamlet',
    tier: 'village',
    tierNum: 1,
    role: 'Highland extractive settlement mining ore, coal, bullion, and guarding passes.',
    maxSlots: 5,
    devSoftCap: 40,
    tierRebuildBaseGold: 160,
    slots: [
      {
        id: 'mh_mine',
        slotIndex: 1,
        name: 'Mine & Quarry',
        unlockDev: 0,
        icon: '⛏️',
        category: 'economic',
        levels: [
          {
            level: 1,
            name: 'Surface Vein Pits & Scree Quarry',
            minDev: 0,
            goldCost: 130,
            commodityCosts: { Timber: 6 },
            monthlyGoldUpkeep: 0.4,
            taxBonus: 1.0,
            summary: '+18% Ore/Stone output, +1.0g Royalty',
          },
          {
            level: 2,
            name: 'Timber-Braced Deep Adit Shaft',
            minDev: 16,
            goldCost: 270,
            commodityCosts: { Timber: 12, Iron: 4 },
            monthlyGoldUpkeep: 1.1,
            monthlyCommodityUpkeep: { Timber: 1 },
            taxBonus: 2.4,
            devGrowthYr: 0.04,
            summary: '+38% Iron/Coal/Silver output, +2.4g Royalty',
          },
          {
            level: 3,
            name: 'Water-Wheel Drainage & Ore Hoist',
            minDev: 32,
            goldCost: 480,
            commodityCosts: { Timber: 14, Iron: 10, 'Rope & Cordage': 6 },
            monthlyGoldUpkeep: 2.1,
            monthlyCommodityUpkeep: { Timber: 2 },
            taxBonus: 4.5,
            devGrowthYr: 0.06,
            summary: '+65% Bullion & Ore output, +4.5g Royalty',
          },
          {
            level: 4,
            name: 'Grand Subterranean Gallery',
            minDev: 46,
            goldCost: 780,
            commodityCosts: { Timber: 18, Iron: 14, Coal: 8 },
            monthlyGoldUpkeep: 3.4,
            monthlyCommodityUpkeep: { Iron: 2 },
            taxBonus: 7.5,
            devGrowthYr: 0.09,
            summary: '+95% Ore/Gold/Gems output, +7.5g Royalty',
          },
        ],
      },
      {
        id: 'mh_smelter',
        slotIndex: 2,
        name: 'Bloomery & Smelter',
        unlockDev: 10,
        icon: '🔥',
        category: 'economic',
        levels: [
          {
            level: 1,
            name: 'Charcoal Kilns & Clay Bloomery',
            minDev: 10,
            goldCost: 160,
            commodityCosts: { Timber: 6, Coal: 4 },
            monthlyGoldUpkeep: 0.6,
            taxBonus: 1.2,
            summary: 'Refines raw ore to Iron/Copper ingots',
          },
          {
            level: 2,
            name: 'Water-Powered Trip-Hammer Forge',
            minDev: 24,
            goldCost: 340,
            commodityCosts: { Stone: 8, Iron: 6, Coal: 6 },
            monthlyGoldUpkeep: 1.4,
            monthlyCommodityUpkeep: { Coal: 1 },
            taxBonus: 2.2,
            summary: '+30% Weapon/Tool supply, Fortress keystone',
          },
          {
            level: 3,
            name: 'High-Draft Blast Furnace',
            minDev: 38,
            goldCost: 600,
            commodityCosts: { Stone: 14, Iron: 10, Coal: 10 },
            monthlyGoldUpkeep: 2.6,
            monthlyCommodityUpkeep: { Coal: 2 },
            taxBonus: 3.8,
            summary: '+60% Metal output, +3.8g Crown Excise',
          },
        ],
      },
      {
        id: 'mh_pasture',
        slotIndex: 3,
        name: 'Terraced Pastures',
        unlockDev: 20,
        icon: '🏔️',
        category: 'economic',
        levels: [
          {
            level: 1,
            name: 'Alpine Goat & Barley Terraces',
            minDev: 20,
            goldCost: 180,
            commodityCosts: { Stone: 6, Livestock: 4 },
            monthlyGoldUpkeep: 0.5,
            carryingCapBonus: 600,
            summary: '+600 Carrying Cap, -25% winter food deficit',
          },
          {
            level: 2,
            name: 'Sheltered Winter Byres & Root Cellars',
            minDev: 34,
            goldCost: 350,
            commodityCosts: { Stone: 10, Timber: 8 },
            monthlyGoldUpkeep: 1.1,
            carryingCapBonus: 1400,
            summary: '+1,400 Cap, +3 mos Food Reserves',
          },
        ],
      },
      {
        id: 'mh_watchtower',
        slotIndex: 4,
        name: 'Pass Watchtower',
        unlockDev: 30,
        icon: '🗼',
        category: 'military',
        levels: [
          {
            level: 1,
            name: 'Crag Signal Beacon & Toll Gate',
            minDev: 30,
            goldCost: 240,
            commodityCosts: { Stone: 10, Timber: 4 },
            monthlyGoldUpkeep: 1.0,
            garrisonBonus: 160,
            taxBonus: 1.5,
            siegeDefensePct: 20,
            summary: '+160 Garrison, +1.5g Pass Tolls, +20% Def',
          },
          {
            level: 2,
            name: 'Stone Clifftop Barbican',
            minDev: 42,
            goldCost: 480,
            commodityCosts: { Stone: 16, Iron: 6 },
            monthlyGoldUpkeep: 2.0,
            garrisonBonus: 340,
            taxBonus: 2.5,
            siegeDefensePct: 38,
            summary: '+340 Garrison, +38% Def, Fortress keystone',
          },
        ],
      },
      {
        id: 'mh_waystation',
        slotIndex: 5,
        name: 'Mule-Train Waystation',
        unlockDev: 40,
        icon: '🛤️',
        category: 'civic',
        levels: [
          {
            level: 1,
            name: 'Mountain Pack-Train Caravanserai',
            minDev: 40,
            goldCost: 360,
            commodityCosts: { Timber: 10, Stone: 8 },
            monthlyGoldUpkeep: 1.5,
            taxBonus: 2.2,
            summary: '+25% Trade Connectivity, mitigates winter freeze',
          },
          {
            level: 2,
            name: 'Paved Switchback & Toll Hospice',
            minDev: 52,
            goldCost: 660,
            commodityCosts: { Stone: 16, 'Bricks & Mortar': 8 },
            monthlyGoldUpkeep: 2.7,
            taxBonus: 4.0,
            devGrowthYr: 0.1,
            summary: '+45% Connectivity, +4.0g Tolls, +0.10 Dev/yr',
          },
        ],
      },
    ],
  },

  'Fishing Port': {
    type: 'Fishing Port',
    tier: 'port',
    tierNum: 1,
    role: 'Coastal settlement harvesting dried fish, salt, pearls, and anchoring sea lanes.',
    maxSlots: 5,
    devSoftCap: 46,
    tierRebuildBaseGold: 175,
    slots: [
      {
        id: 'fp_jetty',
        slotIndex: 1,
        name: 'Jetty & Fishing Fleet',
        unlockDev: 0,
        icon: '⚓',
        category: 'maritime',
        levels: [
          {
            level: 1,
            name: 'Timber Slipway & Rowboats',
            minDev: 0,
            goldCost: 120,
            commodityCosts: { Timber: 8, 'Rope & Cordage': 2 },
            monthlyGoldUpkeep: 0.4,
            carryingCapBonus: 500,
            taxBonus: 0.8,
            summary: '+20% Dried Fish output, +500 Carrying Cap',
          },
          {
            level: 2,
            name: 'Stone Breakwater & Herring Cogs',
            minDev: 16,
            goldCost: 270,
            commodityCosts: { Stone: 10, Timber: 10, 'Tar & Pitch': 4 },
            monthlyGoldUpkeep: 1.0,
            monthlyCommodityUpkeep: { Timber: 1 },
            carryingCapBonus: 1200,
            taxBonus: 1.8,
            summary: '+42% Fish output, +1,200 Cap, +1.8g Wharf Fees',
          },
          {
            level: 3,
            name: 'Deep-Water Quay & Trawler Guild',
            minDev: 34,
            goldCost: 510,
            commodityCosts: { Stone: 14, Timber: 12, 'Tar & Pitch': 6 },
            monthlyGoldUpkeep: 2.0,
            monthlyCommodityUpkeep: { 'Tar & Pitch': 1 },
            carryingCapBonus: 2400,
            taxBonus: 3.4,
            summary: '+70% Fish/Pearls, Trade Port keystone',
          },
        ],
      },
      {
        id: 'fp_saltworks',
        slotIndex: 2,
        name: 'Saltworks & Smokehouse',
        unlockDev: 10,
        icon: '🧂',
        category: 'economic',
        levels: [
          {
            level: 1,
            name: 'Brine Boiling Pans & Drying Racks',
            minDev: 10,
            goldCost: 140,
            commodityCosts: { Timber: 6, Coal: 3 },
            monthlyGoldUpkeep: 0.5,
            taxBonus: 1.0,
            summary: '+25% Salt output, -25% Food spoilage',
          },
          {
            level: 2,
            name: 'Stone Salting Vaults & Cooperage',
            minDev: 24,
            goldCost: 310,
            commodityCosts: { Timber: 10, Stone: 6, Iron: 4 },
            monthlyGoldUpkeep: 1.2,
            taxBonus: 2.4,
            summary: '+55% Salt & Preserved Fish, Trade Port keystone',
          },
          {
            level: 3,
            name: 'Royal Salt-Monopoly Evaporation Works',
            minDev: 38,
            goldCost: 560,
            commodityCosts: { Stone: 12, 'Bricks & Mortar': 8, Coal: 6 },
            monthlyGoldUpkeep: 2.3,
            taxBonus: 4.5,
            summary: '+85% Salt output, +4.5g Salt Gabelle Tax',
          },
        ],
      },
      {
        id: 'fp_boatyard',
        slotIndex: 3,
        name: 'Rope & Boatyard',
        unlockDev: 20,
        icon: '⛵',
        category: 'maritime',
        levels: [
          {
            level: 1,
            name: 'Hemp Walk & Careening Beach',
            minDev: 20,
            goldCost: 200,
            commodityCosts: { Timber: 8, 'Linen & Flax': 6 },
            monthlyGoldUpkeep: 0.8,
            taxBonus: 1.4,
            summary: 'Produces Rope & Tar, -20% Ship Charter fee',
          },
          {
            level: 2,
            name: 'Covered Boatwright Sheds',
            minDev: 34,
            goldCost: 420,
            commodityCosts: { Timber: 12, 'Tar & Pitch': 6, Iron: 4 },
            monthlyGoldUpkeep: 1.7,
            taxBonus: 2.8,
            summary: '+30% Sea Reach, -35% Ship Charter fee',
          },
        ],
      },
      {
        id: 'fp_beacon',
        slotIndex: 4,
        name: 'Harbor Beacon & Chain',
        unlockDev: 32,
        icon: '🗼',
        category: 'military',
        levels: [
          {
            level: 1,
            name: 'Coal-Brazier Headland Lighthouse',
            minDev: 32,
            goldCost: 270,
            commodityCosts: { Stone: 10, Coal: 4 },
            monthlyGoldUpkeep: 1.0,
            monthlyCommodityUpkeep: { Coal: 1 },
            garrisonBonus: 120,
            siegeDefensePct: 12,
            summary: '-40% Storm losses, +120 Harbor Watch',
          },
          {
            level: 2,
            name: 'Stone Sea-Tower & Iron Harbor Chain',
            minDev: 44,
            goldCost: 560,
            commodityCosts: { Stone: 16, Iron: 8 },
            monthlyGoldUpkeep: 2.2,
            garrisonBonus: 300,
            siegeDefensePct: 30,
            summary: '+300 Garrison, +30% Coastal Defense',
          },
        ],
      },
      {
        id: 'fp_exchange',
        slotIndex: 5,
        name: 'Fishmongers Hall',
        unlockDev: 42,
        icon: '🏛️',
        category: 'civic',
        levels: [
          {
            level: 1,
            name: 'Chartered Coastal Exchange',
            minDev: 42,
            goldCost: 390,
            commodityCosts: { Timber: 10, 'Bricks & Mortar': 8 },
            monthlyGoldUpkeep: 1.5,
            taxBonus: 3.2,
            devGrowthYr: 0.08,
            summary: '+25% Market Volume, +3.2g Customs, +0.08 Dev/yr',
          },
        ],
      },
    ],
  },

  'Market Town': {
    type: 'Market Town',
    tier: 'town',
    tierNum: 2,
    role: 'Regional commercial & guild hub bridging rural parishes and urban markets.',
    maxSlots: 6,
    devSoftCap: 74,
    tierRebuildBaseGold: 320,
    slots: [
      {
        id: 'mt_bourse',
        slotIndex: 1,
        name: 'Market Square & Bourse',
        unlockDev: 0,
        icon: '⚖️',
        category: 'economic',
        levels: [
          {
            level: 1,
            name: 'Cobblestone Market Cross & Stalls',
            minDev: 0,
            goldCost: 185,
            commodityCosts: { Stone: 8, Timber: 6 },
            monthlyGoldUpkeep: 0.7,
            taxBonus: 2.0,
            summary: '+15% Trade Volume, +2.0g Market Tolls',
          },
          {
            level: 2,
            name: 'Timber Cloth Hall & Weighhouse',
            minDev: 20,
            goldCost: 360,
            commodityCosts: { Timber: 12, 'Bricks & Mortar': 8, Wool: 4 },
            monthlyGoldUpkeep: 1.5,
            taxBonus: 4.0,
            devGrowthYr: 0.08,
            summary: '+32% Trade Volume, +4.0g Tolls, +0.08 Dev/yr',
          },
          {
            level: 3,
            name: 'Stone Guildhall & Charter Vault',
            minDev: 40,
            goldCost: 620,
            commodityCosts: { Stone: 16, 'Bricks & Mortar': 10, Glassware: 4 },
            monthlyGoldUpkeep: 2.8,
            taxBonus: 7.2,
            devGrowthYr: 0.1,
            summary: '+55% Trade Volume, +7.2g Tolls',
          },
          {
            level: 4,
            name: 'Grand Regional Commercial Bourse',
            minDev: 62,
            goldCost: 980,
            commodityCosts: { Stone: 20, Marble: 10, Glassware: 6 },
            monthlyGoldUpkeep: 4.6,
            monthlyCommodityUpkeep: { 'Parchment & Vellum': 1 },
            taxBonus: 11.5,
            devGrowthYr: 0.14,
            summary: '+85% Trade Volume, Metropolis keystone',
          },
        ],
      },
      {
        id: 'mt_guilds',
        slotIndex: 2,
        name: 'Artisan Guild Quarter',
        unlockDev: 15,
        icon: '⚒️',
        category: 'economic',
        levels: [
          {
            level: 1,
            name: 'Cooper, Tanner & Weaver Lanes',
            minDev: 15,
            goldCost: 225,
            commodityCosts: { Timber: 8, 'Tanned Leather': 6, Wool: 6 },
            monthlyGoldUpkeep: 0.9,
            taxBonus: 1.8,
            summary: '+20% Manufactured Goods throughput',
          },
          {
            level: 2,
            name: 'Fulling Mills & Dye-Works',
            minDev: 32,
            goldCost: 460,
            commodityCosts: { 'Bricks & Mortar': 10, Dyes: 6, Iron: 6 },
            monthlyGoldUpkeep: 2.0,
            monthlyCommodityUpkeep: { Dyes: 1 },
            taxBonus: 3.8,
            summary: '+42% Cloth & Pottery output, +3.8g Excise',
          },
          {
            level: 3,
            name: 'Master Craftsmen Guildhouse',
            minDev: 52,
            goldCost: 780,
            commodityCosts: { Stone: 14, Iron: 10, Glassware: 6 },
            monthlyGoldUpkeep: 3.5,
            monthlyCommodityUpkeep: { Iron: 1 },
            taxBonus: 6.5,
            devGrowthYr: 0.1,
            summary: '+70% Manufactured output, +6.5g Excise',
          },
        ],
      },
      {
        id: 'mt_walls',
        slotIndex: 3,
        name: 'Town Walls & Gatehouse',
        unlockDev: 28,
        icon: '🏰',
        category: 'military',
        levels: [
          {
            level: 1,
            name: 'Timber Palisade & Toll Gate',
            minDev: 28,
            goldCost: 245,
            commodityCosts: { Timber: 14 },
            monthlyGoldUpkeep: 1.0,
            garrisonBonus: 200,
            taxBonus: 1.0,
            siegeDefensePct: 15,
            summary: '+200 Garrison, +15% Siege Def, +1.0g Tolls',
          },
          {
            level: 2,
            name: 'Ashlar Curtain Wall & Barbican',
            minDev: 46,
            goldCost: 540,
            commodityCosts: { Stone: 18, 'Bricks & Mortar': 8, Iron: 4 },
            monthlyGoldUpkeep: 2.4,
            garrisonBonus: 420,
            taxBonus: 2.2,
            siegeDefensePct: 32,
            summary: '+420 Garrison, +32% Siege Defense',
          },
          {
            level: 3,
            name: 'Double-Towered Fortified Circuit',
            minDev: 64,
            goldCost: 920,
            commodityCosts: { Stone: 24, Iron: 12, 'Bricks & Mortar': 10 },
            monthlyGoldUpkeep: 4.2,
            monthlyCommodityUpkeep: { Stone: 1 },
            garrisonBonus: 750,
            taxBonus: 3.4,
            siegeDefensePct: 48,
            summary: '+750 Garrison, +48% Def, Metropolis keystone',
          },
        ],
      },
      {
        id: 'mt_cisterns',
        slotIndex: 4,
        name: 'Granary & Cisterns',
        unlockDev: 40,
        icon: '🏺',
        category: 'civic',
        levels: [
          {
            level: 1,
            name: 'Municipal Grain Hall & Wells',
            minDev: 40,
            goldCost: 330,
            commodityCosts: { Stone: 12, Timber: 8 },
            monthlyGoldUpkeep: 1.3,
            carryingCapBonus: 1500,
            summary: '+5 mos Food Reserves, -15% Plague lethality',
          },
          {
            level: 2,
            name: 'Stone Aqueduct Conduit & Vaults',
            minDev: 56,
            goldCost: 660,
            commodityCosts: { Stone: 20, 'Bricks & Mortar': 10, Lead: 4 },
            monthlyGoldUpkeep: 2.8,
            carryingCapBonus: 3200,
            summary: '+8 mos Reserves, -30% Plague, +3,200 Cap',
          },
          {
            level: 3,
            name: 'Covered Cisterns & Public Bathhouse',
            minDev: 70,
            goldCost: 1020,
            commodityCosts: { Stone: 24, Marble: 8, Lead: 6 },
            monthlyGoldUpkeep: 4.4,
            carryingCapBonus: 5500,
            devGrowthYr: 0.12,
            summary: '+10 mos Reserves, -45% Plague, Metropolis keystone',
          },
        ],
      },
      {
        id: 'mt_charter',
        slotIndex: 5,
        name: 'Town Charter & Bailiwick',
        unlockDev: 52,
        icon: '📜',
        category: 'civic',
        levels: [
          {
            level: 1,
            name: 'Alderman Guildhall & Pillory',
            minDev: 52,
            goldCost: 480,
            commodityCosts: { Stone: 12, 'Parchment & Vellum': 4 },
            monthlyGoldUpkeep: 2.0,
            taxBonus: 2.8,
            unrestDelta: -14,
            summary: '-14% Unrest, +12% Tax efficiency',
          },
          {
            level: 2,
            name: 'Free Borough Charter & Civic Court',
            minDev: 68,
            goldCost: 860,
            commodityCosts: { Stone: 16, 'Parchment & Vellum': 8, 'Beeswax Candles': 4 },
            monthlyGoldUpkeep: 3.6,
            monthlyCommodityUpkeep: { 'Parchment & Vellum': 1 },
            taxBonus: 5.5,
            unrestDelta: -25,
            summary: '-25% Unrest, +22% Tax efficiency, +15 Prestige/yr',
          },
        ],
      },
      {
        id: 'mt_fairground',
        slotIndex: 6,
        name: 'Fairground & Caravanserai',
        unlockDev: 64,
        icon: '🎪',
        category: 'economic',
        levels: [
          {
            level: 1,
            name: 'Seasonal Champagne-Style Fairground',
            minDev: 64,
            goldCost: 680,
            commodityCosts: { Timber: 16, 'Bricks & Mortar': 10, Wine: 6 },
            monthlyGoldUpkeep: 3.0,
            taxBonus: 5.8,
            summary: '+35% Caravan traffic, +5.8g Fair Charters',
          },
          {
            level: 2,
            name: 'Paved Coaching Inns & Counting House',
            minDev: 76,
            goldCost: 1140,
            commodityCosts: { Stone: 18, Glassware: 8, Silk: 6 },
            monthlyGoldUpkeep: 5.0,
            taxBonus: 9.8,
            devGrowthYr: 0.14,
            summary: '+60% Caravan flow, +9.8g Exchange Fees',
          },
        ],
      },
    ],
  },

  'Border Fortress': {
    type: 'Border Fortress',
    tier: 'town',
    tierNum: 2,
    role: 'Marcher military bulwark anchoring frontiers and drilling elite garrisons.',
    maxSlots: 6,
    devSoftCap: 68,
    tierRebuildBaseGold: 350,
    slots: [
      {
        id: 'bf_keep',
        slotIndex: 1,
        name: 'Keep & Inner Ward',
        unlockDev: 0,
        icon: '🏯',
        category: 'military',
        levels: [
          {
            level: 1,
            name: 'Timber Motte & Bailey',
            minDev: 0,
            goldCost: 210,
            commodityCosts: { Timber: 12 },
            monthlyGoldUpkeep: 0.9,
            garrisonBonus: 300,
            siegeDefensePct: 18,
            summary: '+300 Garrison, Fort Lvl 1',
          },
          {
            level: 2,
            name: 'Square Ashlar Donjon',
            minDev: 20,
            goldCost: 420,
            commodityCosts: { Stone: 16, Timber: 6, Iron: 4 },
            monthlyGoldUpkeep: 2.0,
            garrisonBonus: 600,
            taxBonus: 2.0,
            siegeDefensePct: 32,
            summary: '+600 Garrison, Fort Lvl 2, +2.0g Marcher Tax',
          },
          {
            level: 3,
            name: 'Concentric Star-Bastion Keep',
            minDev: 42,
            goldCost: 780,
            commodityCosts: { Stone: 24, Iron: 10, 'Bricks & Mortar': 8 },
            monthlyGoldUpkeep: 3.8,
            monthlyCommodityUpkeep: { Stone: 1 },
            garrisonBonus: 1050,
            taxBonus: 3.5,
            siegeDefensePct: 48,
            summary: '+1,050 Garrison, Fort Lvl 3, -20% Siege speed',
          },
          {
            level: 4,
            name: 'Impregnable Marcher Citadel',
            minDev: 64,
            goldCost: 1280,
            commodityCosts: { Stone: 32, Iron: 16, Lead: 10 },
            monthlyGoldUpkeep: 6.2,
            monthlyCommodityUpkeep: { Stone: 2 },
            garrisonBonus: 1650,
            taxBonus: 5.5,
            siegeDefensePct: 68,
            summary: '+1,650 Garrison, Fort Lvl 4, Citadel keystone',
          },
        ],
      },
      {
        id: 'bf_walls',
        slotIndex: 2,
        name: 'Curtain Walls & Moat',
        unlockDev: 12,
        icon: '🧱',
        category: 'military',
        levels: [
          {
            level: 1,
            name: 'Earthen Rampart & Dry Ditch',
            minDev: 12,
            goldCost: 185,
            commodityCosts: { Timber: 10, Stone: 6 },
            monthlyGoldUpkeep: 0.8,
            garrisonBonus: 180,
            siegeDefensePct: 18,
            summary: '+18% Siege Defense, +180 Garrison',
          },
          {
            level: 2,
            name: 'Machicolated Curtain Wall & Wet Moat',
            minDev: 30,
            goldCost: 440,
            commodityCosts: { Stone: 18, Iron: 6 },
            monthlyGoldUpkeep: 2.0,
            garrisonBonus: 400,
            siegeDefensePct: 36,
            summary: '+36% Siege Defense, +400 Garrison',
          },
          {
            level: 3,
            name: 'Double Outer Bailey & Murder-Holes',
            minDev: 52,
            goldCost: 840,
            commodityCosts: { Stone: 26, Iron: 12, 'Tar & Pitch': 6 },
            monthlyGoldUpkeep: 4.0,
            monthlyCommodityUpkeep: { 'Tar & Pitch': 1 },
            garrisonBonus: 750,
            siegeDefensePct: 58,
            summary: '+58% Siege Defense, +25% Attacker attrition',
          },
        ],
      },
      {
        id: 'bf_barracks',
        slotIndex: 3,
        name: 'Barracks & Training Lists',
        unlockDev: 25,
        icon: '⚔️',
        category: 'military',
        levels: [
          {
            level: 1,
            name: 'Garrison Timber Barracks',
            minDev: 25,
            goldCost: 270,
            commodityCosts: { Timber: 12, Iron: 4 },
            monthlyGoldUpkeep: 1.4,
            garrisonBonus: 200,
            summary: '+200 Levy Pool, +10% Garrison morale',
          },
          {
            level: 2,
            name: 'Stone Drill-Yard & Tilt Lists',
            minDev: 44,
            goldCost: 580,
            commodityCosts: { Stone: 14, Iron: 8, Warhorses: 4 },
            monthlyGoldUpkeep: 3.0,
            monthlyCommodityUpkeep: { Grain: 1 },
            garrisonBonus: 450,
            summary: '+450 Levy Pool, -12% MaA upkeep locally',
          },
          {
            level: 3,
            name: 'Royal War College & Knightly Chapter',
            minDev: 62,
            goldCost: 980,
            commodityCosts: { Stone: 18, Iron: 12, Warhorses: 8 },
            monthlyGoldUpkeep: 5.0,
            monthlyCommodityUpkeep: { Grain: 2 },
            garrisonBonus: 800,
            summary: '+800 Levy Pool, -22% MaA upkeep, +15% Morale',
          },
        ],
      },
      {
        id: 'bf_arsenal',
        slotIndex: 4,
        name: 'Arsenal & Siege Foundry',
        unlockDev: 38,
        icon: '🏹',
        category: 'military',
        levels: [
          {
            level: 1,
            name: 'Fletcher Yard & Armory Forge',
            minDev: 38,
            goldCost: 370,
            commodityCosts: { Iron: 8, Timber: 8, 'Crossbow Bolts': 6 },
            monthlyGoldUpkeep: 1.9,
            monthlyCommodityUpkeep: { Iron: 1 },
            garrisonBonus: 150,
            summary: '+150 Heavy Foot, supplies Crossbow Bolts',
          },
          {
            level: 2,
            name: 'Master Armorer & Trebuchet Works',
            minDev: 54,
            goldCost: 720,
            commodityCosts: { Iron: 14, Timber: 12, Coal: 6 },
            monthlyGoldUpkeep: 3.6,
            monthlyCommodityUpkeep: { Iron: 2 },
            garrisonBonus: 320,
            summary: '+320 Heavy Troops, +20% Siege Engine power',
          },
          {
            level: 3,
            name: 'Black-Powder Bombards & Magazine',
            minDev: 68,
            goldCost: 1200,
            commodityCosts: { Iron: 18, Sulfur: 10, Coal: 10 },
            monthlyGoldUpkeep: 5.8,
            monthlyCommodityUpkeep: { Sulfur: 1 },
            garrisonBonus: 500,
            summary: '+500 Elite Troops, Citadel keystone',
          },
        ],
      },
      {
        id: 'bf_cistern',
        slotIndex: 5,
        name: 'Siege Cistern & Provisions',
        unlockDev: 50,
        icon: '💧',
        category: 'civic',
        levels: [
          {
            level: 1,
            name: 'Deep Bedrock Well & Salt-Meat Cellars',
            minDev: 50,
            goldCost: 420,
            commodityCosts: { Stone: 14, Salt: 8 },
            monthlyGoldUpkeep: 1.6,
            summary: '+6 mos Siege Endurance, halves camp dysentery',
          },
          {
            level: 2,
            name: 'Subterranean Vaulted Supply Depots',
            minDev: 64,
            goldCost: 780,
            commodityCosts: { Stone: 20, Salt: 10, Grain: 8 },
            monthlyGoldUpkeep: 3.2,
            summary: '+12 mos Siege Endurance, resists starvation',
          },
        ],
      },
      {
        id: 'bf_beacons',
        slotIndex: 6,
        name: 'Signal Towers & Outriders',
        unlockDev: 62,
        icon: '🔥',
        category: 'military',
        levels: [
          {
            level: 1,
            name: 'Border Watch-Beacon Chain',
            minDev: 62,
            goldCost: 520,
            commodityCosts: { Stone: 12, Warhorses: 6 },
            monthlyGoldUpkeep: 2.4,
            garrisonBonus: 180,
            summary: 'Early invasion warning, +15% Intercept speed',
          },
        ],
      },
    ],
  },

  'Ancient Sanctuary': {
    type: 'Ancient Sanctuary',
    tier: 'town',
    tierNum: 2,
    role: 'Ecclesiastical, pilgrimage & scholastic seat generating piety, relics, and learning.',
    maxSlots: 6,
    devSoftCap: 85,
    tierRebuildBaseGold: 340,
    slots: [
      {
        id: 'as_cathedral',
        slotIndex: 1,
        name: 'Shrine & Cathedral',
        unlockDev: 0,
        icon: '⛪',
        category: 'ecclesiastical',
        levels: [
          {
            level: 1,
            name: 'Ancient Stone Reliquary Chapel',
            minDev: 0,
            goldCost: 190,
            commodityCosts: { Stone: 8, 'Beeswax Candles': 4 },
            monthlyGoldUpkeep: 0.6,
            taxBonus: 1.8,
            summary: '+25 Piety/yr, +1.8g Pilgrim Offerings',
          },
          {
            level: 2,
            name: 'Romanesque Abbey Basilica',
            minDev: 22,
            goldCost: 420,
            commodityCosts: { Stone: 16, Incense: 6, 'Beeswax Candles': 6 },
            monthlyGoldUpkeep: 1.6,
            monthlyCommodityUpkeep: { Incense: 1 },
            taxBonus: 4.0,
            unrestDelta: -10,
            summary: '+55 Piety/yr, +4.0g Offerings, -10% Unrest',
          },
          {
            level: 3,
            name: 'Gothic Vaulted Cathedral',
            minDev: 46,
            goldCost: 840,
            commodityCosts: { Stone: 24, Marble: 10, Glassware: 8 },
            monthlyGoldUpkeep: 3.5,
            monthlyCommodityUpkeep: { 'Beeswax Candles': 1 },
            taxBonus: 7.8,
            unrestDelta: -18,
            summary: '+110 Piety/yr, +7.8g Offerings, +20 Prestige/yr',
          },
          {
            level: 4,
            name: 'Grand Patriarchal Sanctum',
            minDev: 70,
            goldCost: 1440,
            commodityCosts: { Stone: 30, Marble: 18, 'Holy Relics': 10 },
            monthlyGoldUpkeep: 6.2,
            monthlyCommodityUpkeep: { Incense: 2 },
            taxBonus: 13.5,
            unrestDelta: -28,
            summary: '+200 Piety/yr, +13.5g Offerings, Realm legitimacy',
          },
        ],
      },
      {
        id: 'as_scriptorium',
        slotIndex: 2,
        name: 'Scriptorium & Library',
        unlockDev: 14,
        icon: '📚',
        category: 'ecclesiastical',
        levels: [
          {
            level: 1,
            name: 'Monastic Copying Desk',
            minDev: 14,
            goldCost: 225,
            commodityCosts: { Timber: 6, 'Parchment & Vellum': 6 },
            monthlyGoldUpkeep: 0.9,
            monthlyCommodityUpkeep: { 'Parchment & Vellum': 1 },
            taxBonus: 1.2,
            devGrowthYr: 0.06,
            summary: '+1 Learning, produces Parchment & Vellum',
          },
          {
            level: 2,
            name: 'Illuminated Archive & Cloister',
            minDev: 34,
            goldCost: 500,
            commodityCosts: { Stone: 12, 'Parchment & Vellum': 10, Dyes: 4 },
            monthlyGoldUpkeep: 2.1,
            monthlyCommodityUpkeep: { 'Parchment & Vellum': 1 },
            taxBonus: 2.6,
            devGrowthYr: 0.12,
            summary: '+2 Learning, +0.12 Dev/yr, +15% Education',
          },
          {
            level: 3,
            name: 'Grand University & Theological Hall',
            minDev: 58,
            goldCost: 960,
            commodityCosts: { Stone: 18, 'Parchment & Vellum': 14, Glassware: 6 },
            monthlyGoldUpkeep: 4.1,
            monthlyCommodityUpkeep: { 'Parchment & Vellum': 2 },
            taxBonus: 4.8,
            devGrowthYr: 0.2,
            summary: '+4 Learning, +0.20 Dev/yr, elevates heirs',
          },
        ],
      },
      {
        id: 'as_infirmary',
        slotIndex: 3,
        name: 'Infirmary & Herbal Gardens',
        unlockDev: 26,
        icon: '🌿',
        category: 'civic',
        levels: [
          {
            level: 1,
            name: 'Cloistered Physic Garden & Hospice',
            minDev: 26,
            goldCost: 265,
            commodityCosts: { Timber: 8, Herbs: 6 },
            monthlyGoldUpkeep: 1.1,
            monthlyCommodityUpkeep: { Herbs: 1 },
            summary: '-20% Local Plague & Illness lethality',
          },
          {
            level: 2,
            name: 'Stone Lazar-House & Apothecary',
            minDev: 44,
            goldCost: 560,
            commodityCosts: { Stone: 14, Herbs: 8, 'Medicinal Leeches': 6 },
            monthlyGoldUpkeep: 2.4,
            monthlyCommodityUpkeep: { 'Medicinal Leeches': 1 },
            summary: '-40% Plague lethality, shields county nobles',
          },
          {
            level: 3,
            name: 'Order of Hospitallers Grand Infirmary',
            minDev: 64,
            goldCost: 980,
            commodityCosts: { Stone: 18, Herbs: 10, 'Myrrh & Resins': 8 },
            monthlyGoldUpkeep: 4.1,
            monthlyCommodityUpkeep: { 'Myrrh & Resins': 1 },
            summary: '-60% Plague lethality, rapid epidemic recovery',
          },
        ],
      },
      {
        id: 'as_hostel',
        slotIndex: 4,
        name: 'Pilgrim Hostel & Almonry',
        unlockDev: 40,
        icon: '🏕️',
        category: 'economic',
        levels: [
          {
            level: 1,
            name: 'Timber Pilgrim Dormitories',
            minDev: 40,
            goldCost: 330,
            commodityCosts: { Timber: 12, Grain: 6 },
            monthlyGoldUpkeep: 1.2,
            taxBonus: 3.0,
            summary: '+25% Pilgrim Traffic, +3.0g Relic Tolls',
          },
          {
            level: 2,
            name: 'Walled Pilgrim Quarter & Soup Kitchen',
            minDev: 56,
            goldCost: 660,
            commodityCosts: { Stone: 16, Grain: 8, Wine: 6 },
            monthlyGoldUpkeep: 2.7,
            taxBonus: 6.5,
            unrestDelta: -18,
            summary: '+55% Pilgrim Traffic, +6.5g Tolls, -18% Unrest',
          },
        ],
      },
      {
        id: 'as_vineyards',
        slotIndex: 5,
        name: 'Monastic Vineyards & Estates',
        unlockDev: 55,
        icon: '🍇',
        category: 'economic',
        levels: [
          {
            level: 1,
            name: 'Abbey Cellars & Beehives',
            minDev: 55,
            goldCost: 480,
            commodityCosts: { Timber: 10, Wine: 6, Honey: 6 },
            monthlyGoldUpkeep: 1.7,
            taxBonus: 4.5,
            summary: 'Produces Wine, Honey & Beeswax, +4.5g Tithes',
          },
          {
            level: 2,
            name: 'Grand Cloister Press & Scripted Tithes',
            minDev: 70,
            goldCost: 880,
            commodityCosts: { Stone: 14, Wine: 10, 'Olive Oil': 8 },
            monthlyGoldUpkeep: 3.3,
            taxBonus: 8.4,
            summary: '+8.4g Tithes, offsets Sanctuary upkeep',
          },
        ],
      },
      {
        id: 'as_walls',
        slotIndex: 6,
        name: 'Sanctuary Precinct Walls',
        unlockDev: 70,
        icon: '🛡️',
        category: 'military',
        levels: [
          {
            level: 1,
            name: 'Bell-Tower & Sacred Precinct Wall',
            minDev: 70,
            goldCost: 760,
            commodityCosts: { Stone: 20, Iron: 8 },
            monthlyGoldUpkeep: 3.0,
            garrisonBonus: 450,
            siegeDefensePct: 35,
            summary: '+450 Abbey Guard, +35% Siege Defense',
          },
        ],
      },
    ],
  },

  'Trade Port': {
    type: 'Trade Port',
    tier: 'port',
    tierNum: 3,
    role: 'Maritime entrepôt commanding sea lanes, exotic luxury imports, and naval charters.',
    maxSlots: 7,
    devSoftCap: 88,
    tierRebuildBaseGold: 520,
    slots: [
      {
        id: 'tp_harbor',
        slotIndex: 1,
        name: 'Grand Harbor & Quays',
        unlockDev: 0,
        icon: '⚓',
        category: 'maritime',
        levels: [
          {
            level: 1,
            name: 'Timber Merchant Wharves',
            minDev: 0,
            goldCost: 240,
            commodityCosts: { Timber: 12, 'Rope & Cordage': 4 },
            monthlyGoldUpkeep: 0.9,
            taxBonus: 2.8,
            summary: '+25% Maritime Volume, +2.8g Anchorage',
          },
          {
            level: 2,
            name: 'Ashlar Deep-Water Quays & Cranes',
            minDev: 22,
            goldCost: 520,
            commodityCosts: { Stone: 16, Timber: 14, Iron: 6 },
            monthlyGoldUpkeep: 2.2,
            monthlyCommodityUpkeep: { Timber: 1 },
            taxBonus: 6.0,
            devGrowthYr: 0.1,
            summary: '+50% Trade Volume, +6.0g Anchorage',
          },
          {
            level: 3,
            name: 'Twin-Basin Stone Mole & Drydocks',
            minDev: 46,
            goldCost: 960,
            commodityCosts: { Stone: 24, Timber: 18, 'Tar & Pitch': 10 },
            monthlyGoldUpkeep: 4.3,
            monthlyCommodityUpkeep: { 'Tar & Pitch': 2 },
            taxBonus: 10.5,
            devGrowthYr: 0.14,
            summary: '+85% Trade Volume, -35% Ship Charter fees',
          },
          {
            level: 4,
            name: 'Imperial Arsenal & Admiralty Basin',
            minDev: 70,
            goldCost: 1620,
            commodityCosts: { Stone: 32, Timber: 24, Iron: 14 },
            monthlyGoldUpkeep: 7.0,
            monthlyCommodityUpkeep: { Iron: 2 },
            taxBonus: 17.0,
            devGrowthYr: 0.18,
            summary: '+125% Volume, -50% Charter fees, Metropolis keystone',
          },
        ],
      },
      {
        id: 'tp_customs',
        slotIndex: 2,
        name: 'Customs House & Warehouses',
        unlockDev: 15,
        icon: '📦',
        category: 'economic',
        levels: [
          {
            level: 1,
            name: 'Waterfront Bonded Sheds',
            minDev: 15,
            goldCost: 270,
            commodityCosts: { Timber: 12, 'Bricks & Mortar': 6 },
            monthlyGoldUpkeep: 1.1,
            taxBonus: 2.4,
            summary: '+18% Tariff Yield, +25% Stockpile Cap',
          },
          {
            level: 2,
            name: 'Stone Customs Wharf & Ledgers',
            minDev: 34,
            goldCost: 580,
            commodityCosts: { Stone: 16, 'Bricks & Mortar': 8, 'Parchment & Vellum': 4 },
            monthlyGoldUpkeep: 2.5,
            taxBonus: 5.2,
            summary: '+38% Tariff Yield, curbs smuggling',
          },
          {
            level: 3,
            name: 'Grand Maritime Customs Exchange',
            minDev: 56,
            goldCost: 1040,
            commodityCosts: { Stone: 20, Marble: 10, Glassware: 6 },
            monthlyGoldUpkeep: 4.6,
            monthlyCommodityUpkeep: { 'Parchment & Vellum': 1 },
            taxBonus: 9.2,
            summary: '+65% Tariff Yield, +9.2g Tolls',
          },
          {
            level: 4,
            name: 'Free-Port Steelyard & Guild Vault',
            minDev: 76,
            goldCost: 1680,
            commodityCosts: { Stone: 24, Marble: 12, Silk: 8 },
            monthlyGoldUpkeep: 7.2,
            monthlyCommodityUpkeep: { 'Parchment & Vellum': 2 },
            taxBonus: 14.5,
            summary: '+100% Tariff Yield, Metropolis keystone',
          },
        ],
      },
      {
        id: 'tp_shipyard',
        slotIndex: 3,
        name: 'Shipyard & Rope-Walks',
        unlockDev: 28,
        icon: '⛵',
        category: 'maritime',
        levels: [
          {
            level: 1,
            name: 'Coastal Slipways & Pitch Cauldrons',
            minDev: 28,
            goldCost: 380,
            commodityCosts: { Timber: 14, 'Tar & Pitch': 8, 'Rope & Cordage': 6 },
            monthlyGoldUpkeep: 1.7,
            monthlyCommodityUpkeep: { 'Tar & Pitch': 1 },
            taxBonus: 3.0,
            summary: '-35% Ship Charter costs, +20% Sea Reach',
          },
          {
            level: 2,
            name: 'Covered Caravel & Cog Yards',
            minDev: 48,
            goldCost: 780,
            commodityCosts: { Timber: 20, 'Tar & Pitch': 12, Iron: 8 },
            monthlyGoldUpkeep: 3.5,
            monthlyCommodityUpkeep: { Timber: 2 },
            taxBonus: 6.2,
            summary: '-45% Ship Charter costs, +6.2g Shipwright Rev',
          },
          {
            level: 3,
            name: 'Grand Venetian-Style Arsenale',
            minDev: 68,
            goldCost: 1380,
            commodityCosts: { Timber: 28, 'Tar & Pitch': 16, Iron: 14 },
            monthlyGoldUpkeep: 6.0,
            monthlyCommodityUpkeep: { 'Tar & Pitch': 2 },
            taxBonus: 11.0,
            summary: '-50% Ship Charter costs, +80% Naval Power',
          },
        ],
      },
      {
        id: 'tp_seawall',
        slotIndex: 4,
        name: 'Sea-Wall & Harbor Chain',
        unlockDev: 42,
        icon: '🏰',
        category: 'military',
        levels: [
          {
            level: 1,
            name: 'Coastal Bastion & Chain Tower',
            minDev: 42,
            goldCost: 480,
            commodityCosts: { Stone: 18, Iron: 8 },
            monthlyGoldUpkeep: 2.2,
            garrisonBonus: 380,
            siegeDefensePct: 28,
            summary: '+380 Garrison, +28% Siege & Naval Defense',
          },
          {
            level: 2,
            name: 'Twin Sea-Fortresses & Great Chain',
            minDev: 60,
            goldCost: 980,
            commodityCosts: { Stone: 26, Iron: 14, Coal: 6 },
            monthlyGoldUpkeep: 4.4,
            monthlyCommodityUpkeep: { Stone: 1 },
            garrisonBonus: 780,
            siegeDefensePct: 50,
            summary: '+780 Garrison, +50% Defense, blocks blockade',
          },
          {
            level: 3,
            name: 'Star-Fortress Breakwater & Batteries',
            minDev: 78,
            goldCost: 1620,
            commodityCosts: { Stone: 34, Iron: 18, Sulfur: 10 },
            monthlyGoldUpkeep: 7.0,
            monthlyCommodityUpkeep: { Sulfur: 1 },
            garrisonBonus: 1250,
            siegeDefensePct: 70,
            summary: '+1,250 Garrison, +70% Defense, Metropolis keystone',
          },
        ],
      },
      {
        id: 'tp_fondaco',
        slotIndex: 5,
        name: 'Foreign Merchant Fondaco',
        unlockDev: 56,
        icon: '🧭',
        category: 'economic',
        levels: [
          {
            level: 1,
            name: 'Chartered Foreign Quarter',
            minDev: 56,
            goldCost: 660,
            commodityCosts: { 'Bricks & Mortar': 14, Spices: 6, Silk: 6 },
            monthlyGoldUpkeep: 2.8,
            taxBonus: 6.2,
            summary: 'Unlocks Exotic Luxury inflows, +6.2g Excise',
          },
          {
            level: 2,
            name: 'Grand Diplomatic Fondaco & Consulate',
            minDev: 72,
            goldCost: 1220,
            commodityCosts: { Stone: 18, Silk: 10, Spices: 8 },
            monthlyGoldUpkeep: 5.2,
            taxBonus: 11.8,
            summary: '+12 Foreign Relations, +11.8g Luxury Excise',
          },
        ],
      },
      {
        id: 'tp_bank',
        slotIndex: 6,
        name: 'Patrician Banking House',
        unlockDev: 68,
        icon: '🏦',
        category: 'civic',
        levels: [
          {
            level: 1,
            name: 'Maritime Insurance & Credit Exchange',
            minDev: 68,
            goldCost: 940,
            commodityCosts: { Stone: 16, Silver: 8, 'Parchment & Vellum': 6 },
            monthlyGoldUpkeep: 3.8,
            taxBonus: 8.2,
            summary: '-2% Loan Interest, +8.2g Financial Fees',
          },
          {
            level: 2,
            name: 'Grand Merchant-Prince Bank',
            minDev: 82,
            goldCost: 1580,
            commodityCosts: { Marble: 20, Gold: 12, Glassware: 8 },
            monthlyGoldUpkeep: 6.4,
            taxBonus: 15.2,
            summary: '-4% Loan Interest, +15.2g Bank Dividends',
          },
        ],
      },
      {
        id: 'tp_pharos',
        slotIndex: 7,
        name: 'Grand Pharos Lighthouse',
        unlockDev: 80,
        icon: '🗼',
        category: 'wonder',
        levels: [
          {
            level: 1,
            name: 'Monumental Stone Pharos Lighthouse',
            minDev: 80,
            goldCost: 1750,
            commodityCosts: { Stone: 30, Marble: 12, 'Olive Oil': 8 },
            monthlyGoldUpkeep: 5.8,
            monthlyCommodityUpkeep: { 'Olive Oil': 2 },
            taxBonus: 12.0,
            devGrowthYr: 0.16,
            summary: 'Eliminates storm losses, +40 Prestige/yr',
          },
        ],
      },
    ],
  },

  'Royal Metropolis': {
    type: 'Royal Metropolis',
    tier: 'metropolis',
    tierNum: 4,
    role: 'Rare pinnacle of medieval urban civilization—massive tax base, guilds, and monuments.',
    maxSlots: 8,
    devSoftCap: 100,
    tierRebuildBaseGold: 880,
    slots: [
      {
        id: 'rm_bourse',
        slotIndex: 1,
        name: 'Grand Commercial Bourse',
        unlockDev: 0,
        icon: '🏛️',
        category: 'economic',
        levels: [
          {
            level: 1,
            name: 'Metropolitan Market Hall',
            minDev: 0,
            goldCost: 290,
            commodityCosts: { Stone: 12, Timber: 10 },
            monthlyGoldUpkeep: 1.2,
            taxBonus: 3.5,
            summary: '+25% Trade Volume, +3.5g Tolls',
          },
          {
            level: 2,
            name: 'Grand Guild Exchange',
            minDev: 25,
            goldCost: 620,
            commodityCosts: { Stone: 16, 'Bricks & Mortar': 12, Glassware: 4 },
            monthlyGoldUpkeep: 2.6,
            taxBonus: 7.0,
            devGrowthYr: 0.08,
            summary: '+55% Trade Volume, +7.0g Tolls',
          },
          {
            level: 3,
            name: 'Royal Bourse & Assay',
            minDev: 50,
            goldCost: 1100,
            commodityCosts: { Stone: 22, Marble: 10, Glassware: 8 },
            monthlyGoldUpkeep: 4.8,
            monthlyCommodityUpkeep: { 'Parchment & Vellum': 1 },
            taxBonus: 12.0,
            devGrowthYr: 0.12,
            summary: '+90% Trade Volume, +12.0g Tolls',
          },
          {
            level: 4,
            name: 'Continental Clearinghouse',
            minDev: 72,
            goldCost: 1750,
            commodityCosts: { Marble: 18, Glassware: 12, Gold: 8 },
            monthlyGoldUpkeep: 7.4,
            monthlyCommodityUpkeep: { 'Parchment & Vellum': 2 },
            taxBonus: 17.5,
            devGrowthYr: 0.16,
            summary: '+125% Trade Volume, +17.5g Tolls',
          },
          {
            level: 5,
            name: 'Golden Imperial Emporium',
            minDev: 90,
            goldCost: 2550,
            commodityCosts: { Marble: 26, Gold: 16, Silk: 12, Glassware: 12 },
            monthlyGoldUpkeep: 9.8,
            monthlyCommodityUpkeep: { Gold: 1 },
            taxBonus: 24.0,
            devGrowthYr: 0.22,
            summary: '+160% Trade Volume, +24.0g Imperial Tolls',
          },
        ],
      },
      {
        id: 'rm_walls',
        slotIndex: 2,
        name: 'Metropolitan Walls',
        unlockDev: 15,
        icon: '🏰',
        category: 'military',
        levels: [
          {
            level: 1,
            name: 'Stone Circuit Wall',
            minDev: 15,
            goldCost: 360,
            commodityCosts: { Stone: 16, Timber: 8 },
            monthlyGoldUpkeep: 1.6,
            garrisonBonus: 400,
            siegeDefensePct: 25,
            summary: '+400 Garrison, +25% Siege Defense',
          },
          {
            level: 2,
            name: 'Double Curtain Ramparts',
            minDev: 38,
            goldCost: 820,
            commodityCosts: { Stone: 24, 'Bricks & Mortar': 12, Iron: 8 },
            monthlyGoldUpkeep: 3.6,
            garrisonBonus: 820,
            siegeDefensePct: 44,
            summary: '+820 Garrison, +44% Siege Defense',
          },
          {
            level: 3,
            name: 'Triple Theodosian Walls',
            minDev: 62,
            goldCost: 1420,
            commodityCosts: { Stone: 32, Iron: 16, 'Bricks & Mortar': 16 },
            monthlyGoldUpkeep: 6.2,
            monthlyCommodityUpkeep: { Stone: 2 },
            garrisonBonus: 1300,
            siegeDefensePct: 62,
            summary: '+1,300 Garrison, +62% Siege Defense',
          },
          {
            level: 4,
            name: 'Bastioned Imperial Ramparts',
            minDev: 84,
            goldCost: 2150,
            commodityCosts: { Stone: 40, Iron: 22, Lead: 12 },
            monthlyGoldUpkeep: 8.5,
            monthlyCommodityUpkeep: { Stone: 2 },
            garrisonBonus: 1850,
            siegeDefensePct: 76,
            summary: '+1,850 Garrison, +76% Siege Defense',
          },
        ],
      },
      {
        id: 'rm_aqueducts',
        slotIndex: 3,
        name: 'Aqueducts & Granary Vaults',
        unlockDev: 30,
        icon: '🌊',
        category: 'civic',
        levels: [
          {
            level: 1,
            name: 'Stone Water Conduits',
            minDev: 30,
            goldCost: 440,
            commodityCosts: { Stone: 16, 'Bricks & Mortar': 10 },
            monthlyGoldUpkeep: 1.8,
            carryingCapBonus: 4000,
            summary: '+4,000 Carrying Cap, -20% Plague lethality',
          },
          {
            level: 2,
            name: 'Arched Romanesque Aqueduct',
            minDev: 50,
            goldCost: 880,
            commodityCosts: { Stone: 24, Lead: 8, 'Bricks & Mortar': 14 },
            monthlyGoldUpkeep: 3.6,
            carryingCapBonus: 8500,
            summary: '+8,500 Cap, -35% Plague, +8 mos Food',
          },
          {
            level: 3,
            name: 'Imperial Subterranean Cisterns',
            minDev: 70,
            goldCost: 1380,
            commodityCosts: { Stone: 30, Marble: 10, Lead: 12 },
            monthlyGoldUpkeep: 5.6,
            carryingCapBonus: 13500,
            devGrowthYr: 0.12,
            summary: '+13,500 Cap, -48% Plague, +10 mos Food',
          },
          {
            level: 4,
            name: 'Grand Hydraulic & Granary Complex',
            minDev: 88,
            goldCost: 1960,
            commodityCosts: { Stone: 36, Marble: 16, Lead: 16 },
            monthlyGoldUpkeep: 7.2,
            carryingCapBonus: 19000,
            devGrowthYr: 0.18,
            summary: '+19,000 Cap, -58% Plague, +12 mos Food',
          },
        ],
      },
      {
        id: 'rm_manufactories',
        slotIndex: 4,
        name: 'Guild Manufactories',
        unlockDev: 45,
        icon: '🏭',
        category: 'economic',
        levels: [
          {
            level: 1,
            name: 'Metropolitan Artisan Wards',
            minDev: 45,
            goldCost: 560,
            commodityCosts: { Timber: 16, Iron: 10, Dyes: 6 },
            monthlyGoldUpkeep: 2.4,
            taxBonus: 5.5,
            summary: '+35% Manufactured output, +5.5g Excise',
          },
          {
            level: 2,
            name: 'Water-Powered Industrial Mills',
            minDev: 62,
            goldCost: 1020,
            commodityCosts: { Stone: 18, Iron: 14, Glassware: 8 },
            monthlyGoldUpkeep: 4.2,
            monthlyCommodityUpkeep: { Iron: 1 },
            taxBonus: 9.2,
            summary: '+65% Manufactured output, +9.2g Excise',
          },
          {
            level: 3,
            name: 'Chartered Silk & Tapestry Works',
            minDev: 78,
            goldCost: 1520,
            commodityCosts: { Marble: 12, Silk: 10, Dyes: 10 },
            monthlyGoldUpkeep: 6.2,
            monthlyCommodityUpkeep: { Dyes: 1 },
            taxBonus: 13.0,
            summary: '+95% Luxury output, +13.0g Excise',
          },
          {
            level: 4,
            name: 'Royal Luxury Manufactory',
            minDev: 92,
            goldCost: 2100,
            commodityCosts: { Marble: 18, Silk: 14, Glassware: 12, Gold: 6 },
            monthlyGoldUpkeep: 7.8,
            monthlyCommodityUpkeep: { Silk: 1 },
            taxBonus: 17.5,
            summary: 'Apex luxury production, +17.5g Excise',
          },
        ],
      },
      {
        id: 'rm_mint',
        slotIndex: 5,
        name: 'Royal Mint & Treasury Bank',
        unlockDev: 60,
        icon: '🪙',
        category: 'civic',
        levels: [
          {
            level: 1,
            name: 'Coinage Assay House',
            minDev: 60,
            goldCost: 840,
            commodityCosts: { Stone: 16, Silver: 10 },
            monthlyGoldUpkeep: 3.4,
            taxBonus: 8.5,
            summary: '+0.04 Coin Purity floor, +8.5g Seigniorage',
          },
          {
            level: 2,
            name: 'Sovereign Mint & Exchange',
            minDev: 76,
            goldCost: 1450,
            commodityCosts: { Stone: 20, Silver: 14, Gold: 10 },
            monthlyGoldUpkeep: 5.6,
            taxBonus: 13.5,
            summary: '+0.08 Purity floor, +15% Owner Vault Cap',
          },
          {
            level: 3,
            name: 'Imperial Reserve & Bullion Vault',
            minDev: 90,
            goldCost: 2200,
            commodityCosts: { Marble: 22, Gold: 18, Silver: 18 },
            monthlyGoldUpkeep: 8.0,
            taxBonus: 19.0,
            summary: '+25% Owner Vault Cap, +19.0g Seigniorage',
          },
        ],
      },
      {
        id: 'rm_university',
        slotIndex: 6,
        name: 'Grand Cathedral & University',
        unlockDev: 72,
        icon: '🎓',
        category: 'ecclesiastical',
        levels: [
          {
            level: 1,
            name: 'Collegiate Basilica',
            minDev: 72,
            goldCost: 1120,
            commodityCosts: { Stone: 22, Marble: 12, 'Parchment & Vellum': 8 },
            monthlyGoldUpkeep: 4.6,
            taxBonus: 6.0,
            devGrowthYr: 0.14,
            summary: '+3 Learning, +60 Piety/yr, +0.14 Dev/yr',
          },
          {
            level: 2,
            name: 'Royal University & Studium Generale',
            minDev: 84,
            goldCost: 1820,
            commodityCosts: { Marble: 18, 'Parchment & Vellum': 14, Glassware: 10 },
            monthlyGoldUpkeep: 7.0,
            monthlyCommodityUpkeep: { 'Parchment & Vellum': 2 },
            taxBonus: 9.5,
            devGrowthYr: 0.2,
            summary: '+5 Learning, +100 Piety/yr, +0.20 Dev/yr',
          },
          {
            level: 3,
            name: 'Imperial Academy & Grand Cathedral',
            minDev: 94,
            goldCost: 2600,
            commodityCosts: { Marble: 26, Glassware: 16, 'Parchment & Vellum': 18 },
            monthlyGoldUpkeep: 9.5,
            monthlyCommodityUpkeep: { 'Parchment & Vellum': 2 },
            taxBonus: 14.0,
            devGrowthYr: 0.28,
            summary: '+6 Learning, +140 Piety/yr, +0.28 Dev/yr',
          },
        ],
      },
      {
        id: 'rm_watch',
        slotIndex: 7,
        name: 'Civic Watch & Courts',
        unlockDev: 84,
        icon: '⚖️',
        category: 'civic',
        levels: [
          {
            level: 1,
            name: 'Metropolitan Magistracy',
            minDev: 84,
            goldCost: 1220,
            commodityCosts: { Stone: 20, 'Parchment & Vellum': 10 },
            monthlyGoldUpkeep: 4.8,
            taxBonus: 7.5,
            unrestDelta: -22,
            summary: '-22% Urban Unrest, curbs tax pilferage',
          },
          {
            level: 2,
            name: 'High Court of the Commons',
            minDev: 94,
            goldCost: 2100,
            commodityCosts: { Marble: 18, Stone: 22, 'Parchment & Vellum': 14 },
            monthlyGoldUpkeep: 7.5,
            taxBonus: 13.0,
            unrestDelta: -35,
            summary: '-35% Urban Unrest, +20% Tax efficiency',
          },
        ],
      },
      {
        id: 'rm_wonder',
        slotIndex: 8,
        name: 'Metropolis Great Wonder',
        unlockDev: 92,
        icon: '✨',
        category: 'wonder',
        levels: [
          {
            level: 1,
            name: 'Triumphal Forum & Hanging Gardens',
            minDev: 92,
            goldCost: 3400,
            commodityCosts: { Marble: 40, Gold: 20, Glassware: 15, Silk: 10 },
            monthlyGoldUpkeep: 11.5,
            monthlyCommodityUpkeep: { Marble: 2 },
            taxBonus: 20.0,
            devGrowthYr: 0.3,
            summary: '+120 Prestige/yr, +40% Realm Trade Attraction',
          },
        ],
      },
    ],
  },

  'Capital Citadel': {
    type: 'Capital Citadel',
    tier: 'citadel',
    tierNum: 4,
    role: 'Sovereign seat of power housing the Royal Court, Chancery, Treasury Vault, and Crown Guard.',
    maxSlots: 8,
    devSoftCap: 100,
    tierRebuildBaseGold: 940,
    slots: [
      {
        id: 'cc_palace',
        slotIndex: 1,
        name: 'Royal Palace & Citadel',
        unlockDev: 0,
        icon: '👑',
        category: 'military',
        levels: [
          {
            level: 1,
            name: 'Stone Royal Keep',
            minDev: 0,
            goldCost: 340,
            commodityCosts: { Stone: 16, Timber: 10 },
            monthlyGoldUpkeep: 1.6,
            garrisonBonus: 500,
            taxBonus: 3.0,
            siegeDefensePct: 22,
            summary: '+500 Garrison, Fort Lvl 1, +20 Prestige/yr',
          },
          {
            level: 2,
            name: 'Grand Hall & Sovereign Keep',
            minDev: 24,
            goldCost: 720,
            commodityCosts: { Stone: 22, Marble: 8, Iron: 8 },
            monthlyGoldUpkeep: 3.4,
            garrisonBonus: 900,
            taxBonus: 6.0,
            siegeDefensePct: 38,
            summary: '+900 Garrison, Fort Lvl 2, +45 Prestige/yr',
          },
          {
            level: 3,
            name: 'Concentric Sovereign Citadel',
            minDev: 48,
            goldCost: 1280,
            commodityCosts: { Stone: 30, Marble: 14, Iron: 14 },
            monthlyGoldUpkeep: 5.8,
            monthlyCommodityUpkeep: { Stone: 2 },
            garrisonBonus: 1350,
            taxBonus: 10.0,
            siegeDefensePct: 54,
            summary: '+1,350 Garrison, Fort Lvl 3, +70 Prestige/yr',
          },
          {
            level: 4,
            name: 'Marble Throne Palace',
            minDev: 70,
            goldCost: 1960,
            commodityCosts: { Marble: 24, Gold: 12, Tapestries: 10 },
            monthlyGoldUpkeep: 8.2,
            monthlyCommodityUpkeep: { Marble: 1 },
            garrisonBonus: 1800,
            taxBonus: 14.5,
            siegeDefensePct: 68,
            summary: '+1,800 Garrison, Fort Lvl 4, +95 Prestige/yr',
          },
          {
            level: 5,
            name: 'Imperial Acropolis & Seat of Kings',
            minDev: 90,
            goldCost: 2780,
            commodityCosts: { Marble: 34, Gold: 20, Tapestries: 16 },
            monthlyGoldUpkeep: 10.8,
            monthlyCommodityUpkeep: { Marble: 2 },
            garrisonBonus: 2300,
            taxBonus: 20.0,
            siegeDefensePct: 82,
            summary: '+2,300 Garrison, Fort Lvl 5, +120 Prestige/yr',
          },
        ],
      },
      {
        id: 'cc_chancery',
        slotIndex: 2,
        name: 'Chancery & Royal Exchequer',
        unlockDev: 14,
        icon: '📜',
        category: 'civic',
        levels: [
          {
            level: 1,
            name: 'Scribe Tower & Rolls Office',
            minDev: 14,
            goldCost: 300,
            commodityCosts: { Stone: 12, 'Parchment & Vellum': 6 },
            monthlyGoldUpkeep: 1.3,
            taxBonus: 3.2,
            summary: '+10% Vassal Tribute efficiency',
          },
          {
            level: 2,
            name: 'Royal Chancery & Seal Office',
            minDev: 36,
            goldCost: 680,
            commodityCosts: { Stone: 18, 'Parchment & Vellum': 10, 'Beeswax Candles': 6 },
            monthlyGoldUpkeep: 3.0,
            taxBonus: 6.8,
            summary: '+18% Tribute efficiency, +10% Vault Cap',
          },
          {
            level: 3,
            name: 'High Exchequer Vaults',
            minDev: 58,
            goldCost: 1240,
            commodityCosts: { Stone: 24, Marble: 10, 'Parchment & Vellum': 14 },
            monthlyGoldUpkeep: 5.2,
            monthlyCommodityUpkeep: { 'Parchment & Vellum': 1 },
            taxBonus: 11.5,
            summary: '+26% Tribute efficiency, +15% Vault Cap',
          },
          {
            level: 4,
            name: 'Imperial Bureaucracy & Census Hall',
            minDev: 80,
            goldCost: 1880,
            commodityCosts: { Marble: 18, 'Parchment & Vellum': 18, Glassware: 10 },
            monthlyGoldUpkeep: 7.2,
            monthlyCommodityUpkeep: { 'Parchment & Vellum': 2 },
            taxBonus: 17.0,
            devGrowthYr: 0.16,
            summary: '+35% Tribute efficiency, +20% Vault Cap',
          },
        ],
      },
      {
        id: 'cc_guard',
        slotIndex: 3,
        name: 'Crown Guard & Arsenal',
        unlockDev: 28,
        icon: '⚔️',
        category: 'military',
        levels: [
          {
            level: 1,
            name: 'Household Guard Barracks',
            minDev: 28,
            goldCost: 390,
            commodityCosts: { Timber: 12, Iron: 10 },
            monthlyGoldUpkeep: 1.9,
            garrisonBonus: 280,
            summary: '+280 Elite MaA ceiling, -10% MaA upkeep',
          },
          {
            level: 2,
            name: 'Royal Armory & Stables',
            minDev: 48,
            goldCost: 840,
            commodityCosts: { Stone: 16, Iron: 14, Warhorses: 6 },
            monthlyGoldUpkeep: 4.0,
            monthlyCommodityUpkeep: { Iron: 1 },
            garrisonBonus: 550,
            summary: '+550 Elite MaA ceiling, -18% MaA upkeep',
          },
          {
            level: 3,
            name: 'Knights Chapterhouse & Lists',
            minDev: 68,
            goldCost: 1420,
            commodityCosts: { Stone: 22, Iron: 18, Warhorses: 10, 'Crossbow Bolts': 8 },
            monthlyGoldUpkeep: 6.2,
            monthlyCommodityUpkeep: { Iron: 2 },
            garrisonBonus: 850,
            summary: '+850 Elite MaA ceiling, -24% MaA upkeep',
          },
          {
            level: 4,
            name: 'Imperial Praetorian Citadel',
            minDev: 86,
            goldCost: 2050,
            commodityCosts: { Marble: 16, Iron: 24, Warhorses: 14 },
            monthlyGoldUpkeep: 8.2,
            monthlyCommodityUpkeep: { Iron: 2 },
            garrisonBonus: 1200,
            summary: '+1,200 Elite MaA ceiling, -30% MaA upkeep',
          },
        ],
      },
      {
        id: 'cc_walls',
        slotIndex: 4,
        name: 'Citadel Walls & Outer City',
        unlockDev: 42,
        icon: '🛡️',
        category: 'military',
        levels: [
          {
            level: 1,
            name: 'Inner Curtain Circuit',
            minDev: 42,
            goldCost: 520,
            commodityCosts: { Stone: 20, Iron: 8 },
            monthlyGoldUpkeep: 2.2,
            garrisonBonus: 360,
            siegeDefensePct: 30,
            summary: '+30% Siege Defense, +360 Garrison',
          },
          {
            level: 2,
            name: 'Double Concentric Walls',
            minDev: 60,
            goldCost: 1040,
            commodityCosts: { Stone: 28, Iron: 14, Lead: 6 },
            monthlyGoldUpkeep: 4.4,
            garrisonBonus: 720,
            siegeDefensePct: 50,
            summary: '+50% Siege Defense, +720 Garrison',
          },
          {
            level: 3,
            name: 'Royal Bastions & Gate-Forts',
            minDev: 76,
            goldCost: 1620,
            commodityCosts: { Stone: 36, Iron: 18, Lead: 10 },
            monthlyGoldUpkeep: 6.6,
            monthlyCommodityUpkeep: { Stone: 2 },
            garrisonBonus: 1100,
            siegeDefensePct: 68,
            summary: '+68% Siege Defense, -30% Enemy siege speed',
          },
          {
            level: 4,
            name: 'Unbreakable Sovereign Ring-Wall',
            minDev: 90,
            goldCost: 2240,
            commodityCosts: { Stone: 44, Iron: 24, Lead: 14 },
            monthlyGoldUpkeep: 8.8,
            monthlyCommodityUpkeep: { Stone: 2 },
            garrisonBonus: 1550,
            siegeDefensePct: 82,
            summary: '+82% Siege Defense, -40% Enemy siege speed',
          },
        ],
      },
      {
        id: 'cc_mint',
        slotIndex: 5,
        name: 'Royal Mint & Crown Vault',
        unlockDev: 56,
        icon: '💰',
        category: 'civic',
        levels: [
          {
            level: 1,
            name: 'Bullion Assay & Vault',
            minDev: 56,
            goldCost: 780,
            commodityCosts: { Stone: 18, Silver: 12 },
            monthlyGoldUpkeep: 3.2,
            taxBonus: 7.5,
            summary: 'Stabilizes Coin Purity, +7.5g Seigniorage',
          },
          {
            level: 2,
            name: 'Sovereign Mint',
            minDev: 74,
            goldCost: 1420,
            commodityCosts: { Stone: 22, Gold: 12, Silver: 16 },
            monthlyGoldUpkeep: 5.4,
            taxBonus: 12.5,
            summary: '-20% Hoarding Drag, +12.5g Seigniorage',
          },
          {
            level: 3,
            name: 'Great Crown Reserve & Bullion Treasury',
            minDev: 88,
            goldCost: 2150,
            commodityCosts: { Marble: 20, Gold: 20, Silver: 20 },
            monthlyGoldUpkeep: 7.5,
            taxBonus: 18.0,
            summary: '-35% Hoarding Drag, +18.0g Seigniorage',
          },
        ],
      },
      {
        id: 'cc_courts',
        slotIndex: 6,
        name: 'High Court & Dungeons',
        unlockDev: 68,
        icon: '⚖️',
        category: 'civic',
        levels: [
          {
            level: 1,
            name: 'Royal Oubliette & Bailiffs',
            minDev: 68,
            goldCost: 820,
            commodityCosts: { Stone: 18, Iron: 10 },
            monthlyGoldUpkeep: 3.2,
            unrestDelta: -15,
            summary: '+10% Trial Conviction, +8 Dread',
          },
          {
            level: 2,
            name: 'High Court of Peers',
            minDev: 80,
            goldCost: 1280,
            commodityCosts: { Stone: 22, Iron: 12, 'Parchment & Vellum': 10 },
            monthlyGoldUpkeep: 4.8,
            unrestDelta: -24,
            summary: '+15% Appeal Authority, +12 Dread, -15% Factions',
          },
          {
            level: 3,
            name: 'Grand Hall of Sovereign Justice',
            minDev: 92,
            goldCost: 1780,
            commodityCosts: { Marble: 18, Iron: 14, 'Parchment & Vellum': 14 },
            monthlyGoldUpkeep: 6.4,
            unrestDelta: -32,
            summary: '+20% Sovereign Justice, +15 Dread, -25% Factions',
          },
        ],
      },
      {
        id: 'cc_markets',
        slotIndex: 7,
        name: 'Grand Royal Markets',
        unlockDev: 80,
        icon: '🏪',
        category: 'economic',
        levels: [
          {
            level: 1,
            name: 'Crown Charter Market',
            minDev: 80,
            goldCost: 1080,
            commodityCosts: { Marble: 12, Silk: 8, Glassware: 8 },
            monthlyGoldUpkeep: 4.3,
            taxBonus: 9.5,
            summary: '+45% Capital Trade Volume, +9.5g Customs',
          },
          {
            level: 2,
            name: 'Imperial Luxury Exchange',
            minDev: 92,
            goldCost: 1920,
            commodityCosts: { Marble: 20, Silk: 14, Glassware: 12 },
            monthlyGoldUpkeep: 7.0,
            taxBonus: 16.5,
            summary: '+75% Capital Trade Volume, +16.5g Luxury Customs',
          },
        ],
      },
      {
        id: 'cc_monument',
        slotIndex: 8,
        name: 'Sovereign Great Monument',
        unlockDev: 90,
        icon: '🏛️',
        category: 'wonder',
        levels: [
          {
            level: 1,
            name: 'Hall of Ancestors & Crown Mausoleum',
            minDev: 90,
            goldCost: 3600,
            commodityCosts: { Marble: 40, Gold: 25, 'Holy Relics': 15, Tapestries: 15 },
            monthlyGoldUpkeep: 12.0,
            monthlyCommodityUpkeep: { Gold: 1 },
            taxBonus: 18.0,
            devGrowthYr: 0.25,
            summary: '+150 Dynasty Prestige/yr, +15 All Vassal Loyalty',
          },
        ],
      },
    ],
  },
};

// ============================================================================
// 3. GLACIAL ORGANIC PROMOTION PATHS & AGRARIAN HINTERLAND GATES
// ============================================================================

export const ORGANIC_PROMOTION_PATHS: PromotionPathRule[] = [
  {
    fromType: 'Farming Village',
    toType: 'Market Town',
    toTier: 'town',
    minDev: 36,
    minPop: 5500,
    requiredStreakYears: 20,
    minAgrarianInCounty: 3,
    keystoneSlots: [
      { slotId: 'fv_mill', minLevel: 3, label: 'Mill & Granary L3' },
      { slotId: 'fv_parish', minLevel: 2, label: 'Parish & Bailiff Hall L2' },
    ],
    hinterlandDescription: 'County must sustain >= 3 agrarian villages per Market Town',
  },
  {
    fromType: 'Mountain Hamlet',
    toType: 'Border Fortress',
    toTier: 'town',
    minDev: 32,
    minPop: 2800,
    requiredStreakYears: 18,
    minAgrarianInCounty: 1,
    keystoneSlots: [
      { slotId: 'mh_watchtower', minLevel: 2, label: 'Pass Watchtower L2' },
      { slotId: 'mh_smelter', minLevel: 2, label: 'Bloomery & Smelter L2' },
    ],
    hinterlandDescription: 'County must have >= 1 agrarian supplier or net food surplus',
  },
  {
    fromType: 'Fishing Port',
    toType: 'Trade Port',
    toTier: 'port',
    minDev: 42,
    minPop: 6500,
    requiredStreakYears: 25,
    requiresCoastalOrRiver: true,
    minAgrarianInCounty: 2,
    keystoneSlots: [
      { slotId: 'fp_jetty', minLevel: 3, label: 'Jetty & Fishing Fleet L3' },
      { slotId: 'fp_saltworks', minLevel: 2, label: 'Saltworks & Smokehouse L2' },
    ],
    hinterlandDescription: 'Coastal port with >= 2 agrarian parishes supporting exports',
  },
  {
    fromType: 'Market Town',
    toType: 'Royal Metropolis',
    toTier: 'metropolis',
    minDev: 72,
    minPop: 28000,
    requiredStreakYears: 45,
    minAgrarianRatioInRealm: 14,
    keystoneSlots: [
      { slotId: 'mt_bourse', minLevel: 4, label: 'Market Square & Bourse L4' },
      { slotId: 'mt_walls', minLevel: 3, label: 'Town Walls & Gatehouse L3' },
      { slotId: 'mt_cisterns', minLevel: 3, label: 'Granary & Cisterns L3' },
    ],
    hinterlandDescription: 'Max 1 Royal Metropolis per 14 agrarian settlements in the Realm',
  },
  {
    fromType: 'Trade Port',
    toType: 'Royal Metropolis',
    toTier: 'metropolis',
    minDev: 75,
    minPop: 32000,
    requiredStreakYears: 45,
    minAgrarianRatioInRealm: 14,
    keystoneSlots: [
      { slotId: 'tp_harbor', minLevel: 4, label: 'Grand Harbor & Quays L4' },
      { slotId: 'tp_customs', minLevel: 4, label: 'Customs House & Warehouses L4' },
      { slotId: 'tp_seawall', minLevel: 3, label: 'Sea-Wall & Harbor Chain L3' },
    ],
    hinterlandDescription: 'Max 1 Royal Metropolis per 14 agrarian settlements in the Realm',
  },
  {
    fromType: 'Border Fortress',
    toType: 'Capital Citadel',
    toTier: 'citadel',
    minDev: 68,
    minPop: 18000,
    requiredStreakYears: 35,
    requiresCapital: true,
    keystoneSlots: [
      { slotId: 'bf_keep', minLevel: 4, label: 'Keep & Inner Ward L4' },
      { slotId: 'bf_arsenal', minLevel: 3, label: 'Arsenal & Siege Foundry L3' },
    ],
    hinterlandDescription: 'Must be the sovereign Realm Capital',
  },
];

const AGRARIAN_TYPES: Set<SettlementType> = new Set([
  'Farming Village',
  'Mountain Hamlet',
  'Fishing Port',
]);

// ============================================================================
// 4. INITIALIZATION & LEGACY MIGRATION
// ============================================================================

export function getSettlementBlueprint(type: SettlementType | undefined): SettlementTypeBlueprint {
  if (type && SETTLEMENT_BLUEPRINTS[type]) {
    return SETTLEMENT_BLUEPRINTS[type];
  }
  return SETTLEMENT_BLUEPRINTS['Market Town'];
}

export function ensureBurgBuildingSlots(burg: Burg): Record<string, BurgBuildingSlotState> {
  const bp = getSettlementBlueprint(burg.type);
  if (!burg.buildingSlots) {
    burg.buildingSlots = {};
  }
  const dev = burg.developmentLevel ?? 20;

  // Migrate any legacy flat buildings count into primary bespoke slots if empty
  const existingKeys = Object.keys(burg.buildingSlots);
  if (existingKeys.length === 0) {
    const legacyCount = (burg.buildings || []).length;
    // Always give Slot 1 Level 1 as baseline settlement core
    if (bp.slots[0]) {
      const startLvl = dev >= 45 ? 2 : 1;
      burg.buildingSlots[bp.slots[0].id] = { level: Math.min(startLvl, bp.slots[0].levels.length) };
    }
    // Seed unlocked slots proportionally to initial dev & legacy buildings
    const seedSlots = Math.min(bp.slots.length, Math.max(1, Math.floor(dev / 22) + Math.min(2, legacyCount)));
    for (let i = 1; i < seedSlots; i++) {
      const slot = bp.slots[i];
      if (slot && dev >= slot.unlockDev) {
        burg.buildingSlots[slot.id] = { level: 1 };
      }
    }
  }

  if (burg.devastation === undefined) burg.devastation = 0;
  if (burg.promotionStreakYears === undefined) burg.promotionStreakYears = 0;
  if (burg.decayStreakYears === undefined) burg.decayStreakYears = 0;

  return burg.buildingSlots;
}

// ============================================================================
// 5. MAINTENANCE, YIELDS & CONSTRUCTION
// ============================================================================

export interface BurgBuildingMaintenanceSummary {
  monthlyGoldUpkeep: number;
  monthlyCommodities: Partial<Record<CommodityType, number>>;
  totalBuiltLevels: number;
  dilapidatedCount: number;
  taxBonus: number;
  garrisonBonus: number;
  carryingCapBonus: number;
  devGrowthYr: number;
  siegeDefensePct: number;
  unrestDelta: number;
}

export function computeBurgBuildingMaintenance(burg: Burg): BurgBuildingMaintenanceSummary {
  const bp = getSettlementBlueprint(burg.type);
  const slots = ensureBurgBuildingSlots(burg);

  let monthlyGoldUpkeep = 0;
  const monthlyCommodities: Partial<Record<CommodityType, number>> = {};
  let totalBuiltLevels = 0;
  let dilapidatedCount = 0;
  let taxBonus = 0;
  let garrisonBonus = 0;
  let carryingCapBonus = 0;
  let devGrowthYr = 0;
  let siegeDefensePct = 0;
  let unrestDelta = 0;

  for (const slotDef of bp.slots) {
    const state = slots[slotDef.id];
    if (!state || state.level <= 0) continue;
    const lvlDef = slotDef.levels.find((l) => l.level === state.level) || slotDef.levels[0];
    if (!lvlDef) continue;

    totalBuiltLevels += state.level;
    const yieldMult = state.dilapidated ? 0.5 : 1.0;
    if (state.dilapidated) dilapidatedCount++;

    monthlyGoldUpkeep += lvlDef.monthlyGoldUpkeep;
    if (lvlDef.monthlyCommodityUpkeep) {
      for (const [k, v] of Object.entries(lvlDef.monthlyCommodityUpkeep)) {
        const key = k as CommodityType;
        monthlyCommodities[key] = (monthlyCommodities[key] || 0) + (v || 0);
      }
    }

    taxBonus += (lvlDef.taxBonus || 0) * yieldMult;
    garrisonBonus += Math.round((lvlDef.garrisonBonus || 0) * yieldMult);
    carryingCapBonus += Math.round((lvlDef.carryingCapBonus || 0) * yieldMult);
    devGrowthYr += (lvlDef.devGrowthYr || 0) * yieldMult;
    siegeDefensePct += Math.round((lvlDef.siegeDefensePct || 0) * yieldMult);
    unrestDelta += Math.round((lvlDef.unrestDelta || 0) * yieldMult);
  }

  return {
    monthlyGoldUpkeep: Math.round(monthlyGoldUpkeep * 10) / 10,
    monthlyCommodities,
    totalBuiltLevels,
    dilapidatedCount,
    taxBonus: Math.round(taxBonus * 10) / 10,
    garrisonBonus,
    carryingCapBonus,
    devGrowthYr: Math.round(devGrowthYr * 100) / 100,
    siegeDefensePct: Math.min(85, siegeDefensePct),
    unrestDelta,
  };
}

export function constructOrUpgradeBespokeSlot(
  burgId: string,
  slotId: string,
  world: WorldState,
  payerMode: 'sovereign' | 'personal' = 'sovereign'
): { success: boolean; message: string; goldSpent?: number } {
  const burg = world.burgs?.find((b) => b.id === burgId);
  if (!burg) return { success: false, message: 'Settlement not found.' };

  const bp = getSettlementBlueprint(burg.type);
  const slotDef = bp.slots.find((s) => s.id === slotId);
  if (!slotDef) return { success: false, message: 'Building slot not valid for this settlement type.' };

  const slots = ensureBurgBuildingSlots(burg);
  const dev = Math.floor(burg.developmentLevel ?? 10);
  if (dev < slotDef.unlockDev) {
    return {
      success: false,
      message: `${slotDef.name} unlocks at Development Level ${slotDef.unlockDev} (current: Dev ${dev}).`,
    };
  }

  const current = slots[slotId] || { level: 0 };
  const nextLevelNum = current.level + 1;
  const nextDef = slotDef.levels.find((l) => l.level === nextLevelNum);
  if (!nextDef) {
    return { success: false, message: `${slotDef.name} is already at maximum level.` };
  }
  if (dev < nextDef.minDev) {
    return {
      success: false,
      message: `${nextDef.name} requires Development Level ${nextDef.minDev} (current: Dev ${dev}).`,
    };
  }

  // Evaluate local market commodity availability + 1.45x import surcharge for missing goods
  const market = world.economy?.burgMarkets?.[burg.id];
  let importSurcharge = 0;
  const toConsume: Array<{ key: CommodityType; amt: number }> = [];

  for (const [k, reqAmt] of Object.entries(nextDef.commodityCosts || {})) {
    const key = k as CommodityType;
    const needed = reqAmt || 0;
    if (needed <= 0) continue;
    const cm = market?.markets?.[key];
    const avail = cm ? Math.max(0, cm.stockpile || 0) : 0;
    const usedLocal = Math.min(avail, needed);
    const missing = needed - usedLocal;
    if (usedLocal > 0) toConsume.push({ key, amt: usedLocal });
    if (missing > 0) {
      const unitPrice = cm?.currentPrice || 12;
      importSurcharge += Math.round(missing * unitPrice * 0.45 * 1.45);
    }
  }

  const totalGoldCost = Math.round(nextDef.goldCost + importSurcharge);
  const owner = world.characters?.find((c) => c.id === burg.ownerId && c.isAlive);
  const realm = world.realms?.find((r) => r.id === burg.stateId);
  const rawCoffer = Math.max(0, market?.treasury ?? burg.treasury ?? 0);
  const protectedFloat = Math.max(0, (market?.workingCapitalFloat ?? 0) * 0.4);
  const spendableCoffer = payerMode === 'sovereign' ? Math.max(0, rawCoffer - protectedFloat) : 0;

  if (payerMode === 'personal') {
    const ownerGold = Math.max(0, owner?.treasury || 0);
    if (!owner || ownerGold < totalGoldCost) {
      return {
        success: false,
        message: `Insufficient personal purse: requires ${totalGoldCost}g (Privy Purse ${Math.round(ownerGold)}g).`,
      };
    }
    owner.treasury = Math.round((ownerGold - totalGoldCost) * 10) / 10;
  } else {
    const crownGold = Math.max(0, realm?.treasury ?? owner?.treasury ?? 0);
    if (spendableCoffer + crownGold < totalGoldCost) {
      return {
        success: false,
        message: `Insufficient funds: requires ${totalGoldCost}g (Coffer ${Math.round(spendableCoffer)}g + Crown Fisc ${Math.round(crownGold)}g).`,
      };
    }
    const fromCoffer = Math.min(spendableCoffer, totalGoldCost);
    const fromCrown = totalGoldCost - fromCoffer;
    const nextBurgTreasury = Math.round((rawCoffer - fromCoffer) * 10) / 10;
    burg.treasury = nextBurgTreasury;
    if (market) market.treasury = nextBurgTreasury;

    if (fromCrown > 0) {
      if (realm) {
        realm.treasury = Math.round((crownGold - fromCrown) * 10) / 10;
        if (realm.budget?.lastReport) {
          realm.budget.lastReport.buildingSubsidies =
            Math.round(((realm.budget.lastReport.buildingSubsidies || 0) + fromCrown) * 10) / 10;
        }
      } else if (owner) {
        owner.treasury = Math.round((Math.max(0, owner.treasury || 0) - fromCrown) * 10) / 10;
      }
    }
  }

  // Consume local market goods
  if (market) {
    for (const item of toConsume) {
      const cm = market.markets[item.key];
      if (cm) cm.stockpile = Math.max(0, Math.round((cm.stockpile - item.amt) * 10) / 10);
    }
  }

  // Apply upgrade & recirculate into local artisan/smallfolk wages
  slots[slotId] = { level: nextLevelNum, dilapidated: false, monthsUnmaintained: 0 };
  burg.buildingSlots = slots;
  const legacyId = `${slotId}_l${nextLevelNum}`;
  burg.buildings = Array.from(new Set([...(burg.buildings || []), legacyId]));

  // Sync immediate capacity & unrest gains
  if (nextDef.carryingCapBonus) {
    burg.carryingCapacity = Math.round((burg.carryingCapacity || 8000) + nextDef.carryingCapBonus * 0.45);
  }
  if (nextDef.unrestDelta) {
    burg.unrest = Math.max(0, Math.min(100, (burg.unrest || 10) + Math.round(nextDef.unrestDelta * 0.4)));
  }

  // Recirculate 15% of build spend back to municipal market coffer (artisans/masons wage circulation)
  const localRecirc = Math.round(totalGoldCost * 0.15 * 10) / 10;
  const nextTreasuryAfterRecirc = Math.round(((burg.treasury || 0) + localRecirc) * 10) / 10;
  burg.treasury = nextTreasuryAfterRecirc;
  if (market) market.treasury = nextTreasuryAfterRecirc;
  if (burg.economicLedger) {
    burg.economicLedger.cofferBalance = Math.round(burg.treasury);
    burg.economicLedger.localWageInjection = Math.round(((burg.economicLedger.localWageInjection || 0) + totalGoldCost * 0.8) * 10) / 10;
  }

  // Log notable completions (Level 3+ or Wonder)
  if (nextLevelNum >= 3 || slotDef.category === 'wonder') {
    world.history?.unshift({
      id: `hist_build_${burg.id}_${slotId}_${Date.now()}`,
      year: world.currentYear || 1000,
      title: `${nextDef.name} Completed in ${burg.name}`,
      category: 'Diplomacy',
      description: `${owner?.name || 'The municipal council'} completed ${nextDef.name} (${slotDef.name} Lvl ${nextLevelNum}) in ${burg.name} at a cost of ${totalGoldCost}g.`,
      primaryActorId: owner?.id,
      realmId: burg.stateId,
    });
  }

  return {
    success: true,
    goldSpent: totalGoldCost,
    message: `Constructed ${nextDef.name} (Lvl ${nextLevelNum}) in ${burg.name} for ${totalGoldCost}g${importSurcharge > 0 ? ` (incl. ${importSurcharge}g import surcharge)` : ''}.`,
  };
}

// ============================================================================
// 6. WAR, SIEGE & RAID DEVASTATION & PROPORTIONAL REBUILDING
// ============================================================================

export function applyWarDevastationToBurg(
  burg: Burg,
  eventType: DevastationEventType,
  world?: WorldState
): { devastationAdded: number; devLost: number; dilapidatedSlotNames: string[] } {
  const slots = ensureBurgBuildingSlots(burg);
  const bp = getSettlementBlueprint(burg.type);

  let devAdd = 0;
  let devLoss = 0;
  let dilapidateCount = 0;
  let chanceDropLevel = 0;

  switch (eventType) {
    case 'raid':
      devAdd = 10 + Math.round(Math.random() * 12);
      devLoss = Number((1.5 + Math.random() * 2.0).toFixed(1));
      dilapidateCount = Math.random() < 0.25 ? 1 : 0;
      break;
    case 'siege_month':
      devAdd = 4 + Math.round(Math.random() * 4);
      devLoss = Number((0.4 + Math.random() * 0.5).toFixed(1));
      break;
    case 'siege_fall':
      devAdd = 25 + Math.round(Math.random() * 20);
      devLoss = Number((5.0 + Math.random() * 5.0).toFixed(1));
      dilapidateCount = 1 + Math.floor(Math.random() * 3); // 1 to 3 slots damaged
      chanceDropLevel = 0.15;
      break;
    case 'field_battle':
      devAdd = 8 + Math.round(Math.random() * 8);
      devLoss = Number((1.0 + Math.random() * 1.5).toFixed(1));
      break;
    case 'occupation_year':
      devAdd = 6;
      devLoss = 1.0;
      break;
  }

  burg.devastation = Math.min(100, Math.round(((burg.devastation || 0) + devAdd) * 10) / 10);
  burg.developmentLevel = Math.max(1, Math.round(((burg.developmentLevel || 15) - devLoss) * 10) / 10);
  burg.promotionStreakYears = 0; // War immediately breaks the multi-decade peace streak

  // Sync county development downwards slightly if county capital
  if (world?.counties && burg.countyId) {
    const ct = world.counties.find((c) => c.id === burg.countyId);
    if (ct && ct.capitalBurgId === burg.id) {
      ct.development = Math.max(1, Math.round((ct.development - devLoss * 0.65) * 10) / 10);
    }
  }

  const dilapidatedSlotNames: string[] = [];
  if (dilapidateCount > 0) {
    const builtIds = Object.keys(slots).filter((id) => (slots[id]?.level || 0) > 0 && !slots[id]?.dilapidated);
    for (let i = 0; i < Math.min(dilapidateCount, builtIds.length); i++) {
      const pickIdx = Math.floor(Math.random() * builtIds.length);
      const pickedId = builtIds.splice(pickIdx, 1)[0];
      if (!pickedId) continue;
      slots[pickedId].dilapidated = true;
      if (chanceDropLevel > 0 && slots[pickedId].level > 1 && Math.random() < chanceDropLevel) {
        slots[pickedId].level -= 1;
      }
      const def = bp.slots.find((s) => s.id === pickedId);
      if (def) dilapidatedSlotNames.push(def.name);
    }
  }

  return { devastationAdded: devAdd, devLost: devLoss, dilapidatedSlotNames };
}

export function calculateRebuildCost(
  burg: Burg,
  world: WorldState,
  fraction: number = 1.0
): RebuildCostEstimate {
  const bp = getSettlementBlueprint(burg.type);
  const slots = ensureBurgBuildingSlots(burg);
  const devastation = Math.max(0, Math.min(100, burg.devastation || 0));
  const dilapidatedSlots = Object.values(slots).filter((s) => s.level > 0 && s.dilapidated).length;
  const clampedFraction = Math.max(0.1, Math.min(1.0, fraction));

  if (devastation <= 0 && dilapidatedSlots === 0) {
    return {
      devastation: 0,
      dilapidatedSlots: 0,
      fraction: clampedFraction,
      devastationReduction: 0,
      goldCost: 0,
      commodities: {},
      importSurchargeGold: 0,
      totalGoldIfImportingMissing: 0,
    };
  }

  const effectiveDev = Math.max(10, devastation);
  const fullGold = Math.round(
    (effectiveDev / 100) * bp.tierRebuildBaseGold * (1 + 0.18 * dilapidatedSlots)
  );
  const goldCost = Math.max(8, Math.round(fullGold * clampedFraction));
  const devastationReduction = clampedFraction >= 0.99 ? devastation : Math.min(devastation, Math.round(25));

  const commodities: Partial<Record<CommodityType, number>> = {};
  const scale = (effectiveDev / 100) * clampedFraction * (0.65 + bp.tierNum * 0.25);

  commodities.Timber = Math.max(2, Math.round(14 * scale));
  if (effectiveDev > 25) {
    commodities.Stone = Math.max(2, Math.round(12 * scale));
    commodities['Bricks & Mortar'] = Math.max(1, Math.round(8 * scale));
  }
  if (effectiveDev > 60) {
    commodities.Iron = Math.max(2, Math.round(6 * scale));
  }

  const market = world.economy?.burgMarkets?.[burg.id];
  let importSurchargeGold = 0;
  for (const [k, req] of Object.entries(commodities)) {
    const key = k as CommodityType;
    const needed = req || 0;
    const cm = market?.markets?.[key];
    const avail = cm ? Math.max(0, cm.stockpile || 0) : 0;
    const missing = Math.max(0, needed - avail);
    if (missing > 0) {
      const unitPrice = cm?.currentPrice || 12;
      importSurchargeGold += Math.round(missing * unitPrice * 0.35 * 1.4);
    }
  }

  return {
    devastation,
    dilapidatedSlots,
    fraction: clampedFraction,
    devastationReduction,
    goldCost,
    commodities,
    importSurchargeGold,
    totalGoldIfImportingMissing: goldCost + importSurchargeGold,
  };
}

export function executeBurgRebuild(
  burgId: string,
  fraction: number,
  world: WorldState
): { success: boolean; message: string; goldSpent?: number } {
  const burg = world.burgs?.find((b) => b.id === burgId);
  if (!burg) return { success: false, message: 'Settlement not found.' };

  const est = calculateRebuildCost(burg, world, fraction);
  if (est.devastation <= 0 && est.dilapidatedSlots <= 0) {
    return { success: false, message: `${burg.name} has no devastation or damaged structures to rebuild.` };
  }

  const owner = world.characters?.find((c) => c.id === burg.ownerId && c.isAlive);
  const realm = world.realms?.find((r) => r.id === burg.stateId);
  const market = world.economy?.burgMarkets?.[burg.id];
  const rawCoffer = Math.max(0, market?.treasury ?? burg.treasury ?? 0);
  const spendableCoffer = Math.max(0, rawCoffer - (market?.workingCapitalFloat ?? 0) * 0.4);
  const crownGold = Math.max(0, realm?.treasury ?? owner?.treasury ?? 0);
  const totalCost = est.totalGoldIfImportingMissing;

  if (spendableCoffer + crownGold < totalCost) {
    return {
      success: false,
      message: `Need ${totalCost}g to rebuild ${burg.name} (Coffer ${Math.round(spendableCoffer)}g + Crown Fisc ${Math.round(crownGold)}g).`,
    };
  }

  const fromCoffer = Math.min(spendableCoffer, totalCost);
  const fromCrown = totalCost - fromCoffer;
  const nextTreasury = Math.round((rawCoffer - fromCoffer) * 10) / 10;
  burg.treasury = nextTreasury;
  if (market) market.treasury = nextTreasury;
  if (fromCrown > 0) {
    if (realm) {
      realm.treasury = Math.round((crownGold - fromCrown) * 10) / 10;
      if (realm.budget?.lastReport) {
        realm.budget.lastReport.buildingSubsidies =
          Math.round(((realm.budget.lastReport.buildingSubsidies || 0) + fromCrown) * 10) / 10;
      }
    } else if (owner) {
      owner.treasury = Math.round((Math.max(0, owner.treasury || 0) - fromCrown) * 10) / 10;
    }
  }

  // Consume local market commodities
  if (market) {
    for (const [k, req] of Object.entries(est.commodities)) {
      const key = k as CommodityType;
      const cm = market.markets[key];
      if (cm && req) {
        cm.stockpile = Math.max(0, Math.round((cm.stockpile - Math.min(cm.stockpile, req)) * 10) / 10);
      }
    }
  }

  // Reduce devastation & repair dilapidated slots
  const slots = ensureBurgBuildingSlots(burg);
  const isFull = fraction >= 0.99;
  burg.devastation = isFull ? 0 : Math.max(0, Math.round(((burg.devastation || 0) - est.devastationReduction) * 10) / 10);

  let repairedCount = 0;
  for (const s of Object.values(slots)) {
    if (s.dilapidated) {
      s.dilapidated = false;
      s.monthsUnmaintained = 0;
      repairedCount++;
      if (!isFull && repairedCount >= 1) break;
    }
  }

  if (isFull) {
    burg.postWarRecoveryYears = 3;
    burg.unrest = Math.max(0, (burg.unrest || 10) - 12);
  } else {
    burg.unrest = Math.max(0, (burg.unrest || 10) - 5);
  }

  // Recirculate 15% back to local artisan wages
  burg.treasury = Math.round(((burg.treasury || 0) + totalCost * 0.15) * 10) / 10;
  if (burg.economicLedger) {
    burg.economicLedger.cofferBalance = Math.round(burg.treasury);
  }

  return {
    success: true,
    goldSpent: totalCost,
    message: isFull
      ? `Full reconstruction completed in ${burg.name} (${totalCost}g). Devastation cleared and ${repairedCount} slot(s) restored.`
      : `Emergency patchwork in ${burg.name} (${totalCost}g) reduced devastation by ${est.devastationReduction}% and repaired ${repairedCount} slot.`,
  };
}

// ============================================================================
// 7. GLACIAL 5-GATE ORGANIC URBANIZATION & URBAN DECAY
// ============================================================================

export function evaluateBurgPromotionStatus(burg: Burg, world: WorldState): PromotionGateReport {
  const rule = ORGANIC_PROMOTION_PATHS.find((p) => {
    if (p.fromType !== burg.type) return false;
    if (p.requiresCapital && !burg.isCapital) return false;
    return true;
  });

  if (!rule) {
    return {
      hasNextStage: false,
      minDev: 0,
      currentDev: Math.floor(burg.developmentLevel || 0),
      devMet: false,
      minPop: 0,
      currentPop: burg.population || 0,
      popMet: false,
      keystoneMet: false,
      keystoneSummary: 'Apex settlement tier for this lineage',
      hinterlandMet: false,
      hinterlandSummary: 'Scales internally via bespoke slots',
      peaceAndSurplusMet: false,
      streakYears: 0,
      requiredStreakYears: 0,
      progressPct: 100,
      canPromoteNow: false,
    };
  }

  const slots = ensureBurgBuildingSlots(burg);
  const currentDev = Math.floor(burg.developmentLevel || 0);
  const currentPop = Math.round(burg.population || 0);
  const devMet = currentDev >= rule.minDev;
  const popMet = currentPop >= rule.minPop;

  const missingKeystones: string[] = [];
  for (const ks of rule.keystoneSlots) {
    const st = slots[ks.slotId];
    if (!st || st.level < ks.minLevel || st.dilapidated) {
      missingKeystones.push(ks.label);
    }
  }
  const keystoneMet = missingKeystones.length === 0;
  const keystoneSummary = keystoneMet
    ? 'All keystone structures operational'
    : `Needs: ${missingKeystones.join(', ')}`;

  // Agrarian hinterland ratio gate (prevents metropolis sprawl in an agrarian world!)
  let hinterlandMet = true;
  let hinterlandSummary = rule.hinterlandDescription;

  if (rule.minAgrarianRatioInRealm) {
    const realmBurgs = (world.burgs || []).filter((b) => b.stateId === burg.stateId);
    const agrarianCount = realmBurgs.filter((b) => AGRARIAN_TYPES.has(b.type)).length;
    const existingMetros = realmBurgs.filter((b) => b.type === 'Royal Metropolis').length;
    const requiredAgrarian = (existingMetros + 1) * rule.minAgrarianRatioInRealm;
    hinterlandMet = agrarianCount >= requiredAgrarian;
    hinterlandSummary = `Realm agrarian base: ${agrarianCount} / ${requiredAgrarian} parishes (${rule.minAgrarianRatioInRealm}:1 ratio)`;
  } else if (rule.minAgrarianInCounty) {
    const countyBurgs = (world.burgs || []).filter((b) => b.countyId === burg.countyId && b.id !== burg.id);
    const agrarianCount = countyBurgs.filter((b) => AGRARIAN_TYPES.has(b.type)).length;
    hinterlandMet = agrarianCount >= rule.minAgrarianInCounty;
    hinterlandSummary = `County hinterland: ${agrarianCount} / ${rule.minAgrarianInCounty} agrarian parishes`;
  }

  const isUnderSiege = (world.activeSieges || []).some(
    (s) => s.holdingId === burg.id || s.holdingId === `holding_${burg.id}`
  );
  const peaceAndSurplusMet =
    !isUnderSiege &&
    (burg.devastation || 0) < 10 &&
    !burg.isStarving &&
    burg.foodSecurity !== 'FAMINE' &&
    (burg.unrest || 0) < 25;

  const streakYears = Math.round(burg.promotionStreakYears || 0);
  const gatesPassed = [devMet, popMet, keystoneMet, hinterlandMet, peaceAndSurplusMet].filter(Boolean).length;
  const streakFrac = Math.min(1, streakYears / Math.max(1, rule.requiredStreakYears));
  const progressPct = Math.round(((gatesPassed / 5) * 0.4 + streakFrac * 0.6) * 100);
  const canPromoteNow =
    devMet && popMet && keystoneMet && hinterlandMet && peaceAndSurplusMet && streakYears >= rule.requiredStreakYears;

  return {
    hasNextStage: true,
    targetType: rule.toType,
    minDev: rule.minDev,
    currentDev,
    devMet,
    minPop: rule.minPop,
    currentPop,
    popMet,
    keystoneMet,
    keystoneSummary,
    hinterlandMet,
    hinterlandSummary,
    peaceAndSurplusMet,
    streakYears,
    requiredStreakYears: rule.requiredStreakYears,
    progressPct,
    canPromoteNow,
  };
}

/**
 * Runs annually to advance settlement development, natural devastation healing,
 * glacial multi-decade organic promotion, and urban decay demotion.
 */
export function advanceSettlementDevelopmentYear(world: WorldState, yearsDelta: number = 1): void {
  const dt = Math.max(0.25, yearsDelta);
  for (const burg of world.burgs || []) {
    const bp = getSettlementBlueprint(burg.type);
    ensureBurgBuildingSlots(burg);
    const maint = computeBurgBuildingMaintenance(burg);

    const isUnderSiege = (world.activeSieges || []).some(
      (s) => s.holdingId === burg.id || s.holdingId === `holding_${burg.id}`
    );

    // 1. Natural peacetime devastation fade (glacial: -1.5%/yr unless funded rebuild)
    if (!isUnderSiege && (burg.devastation || 0) > 0) {
      burg.devastation = Math.max(0, Math.round(((burg.devastation || 0) - 1.5 * dt) * 10) / 10);
    }

    // 2. Slow organic development growth (heavily throttled above soft cap & halted by devastation/siege)
    if (!isUnderSiege && !burg.isStarving && (burg.devastation || 0) < 35) {
      const baseGrowth = 0.08 + maint.devGrowthYr + ((burg.postWarRecoveryYears || 0) > 0 ? 0.25 : 0);
      const devastationPenalty = 1 - Math.min(0.85, (burg.devastation || 0) / 45);
      const softCapFactor = (burg.developmentLevel || 20) >= bp.devSoftCap ? 0.25 : 1.0;
      const deltaDev = baseGrowth * devastationPenalty * softCapFactor * dt;
      burg.developmentLevel = Math.min(100, Math.round(((burg.developmentLevel || 20) + deltaDev) * 100) / 100);
    }
    if ((burg.postWarRecoveryYears || 0) > 0) {
      burg.postWarRecoveryYears = Math.max(0, (burg.postWarRecoveryYears || 0) - dt);
    }

    // 3. Glacial Organic Promotion Evaluator (requires 18-45 consecutive qualifying years)
    const report = evaluateBurgPromotionStatus(burg, world);
    if (report.hasNextStage && report.targetType) {
      if (report.devMet && report.popMet && report.keystoneMet && report.hinterlandMet && report.peaceAndSurplusMet) {
        burg.promotionStreakYears = Math.round(((burg.promotionStreakYears || 0) + dt) * 10) / 10;
        if (burg.promotionStreakYears >= report.requiredStreakYears) {
          const oldType = burg.type;
          const rule = ORGANIC_PROMOTION_PATHS.find((p) => p.fromType === oldType && p.toType === report.targetType);
          burg.type = report.targetType;
          if (rule) burg.tier = rule.toTier;
          burg.promotionStreakYears = 0;
          // Migrate core slot to Level 1 of new settlement type while preserving momentum
          const nextBp = getSettlementBlueprint(burg.type);
          if (nextBp.slots[0]) {
            burg.buildingSlots = { [nextBp.slots[0].id]: { level: 1 } };
          }
          world.history?.unshift({
            id: `hist_promote_${burg.id}_${world.currentYear}`,
            year: world.currentYear || 1000,
            title: `${burg.name} Rises to ${burg.type}`,
            category: 'Diplomacy',
            description: `After ${report.requiredStreakYears} years of unbroken peace, agrarian surplus, and civic growth, ${burg.name} has organically evolved from a ${oldType} into a ${burg.type}!`,
            realmId: burg.stateId,
          });
        }
      } else if (!report.peaceAndSurplusMet) {
        // War, famine, or severe unrest breaks the generational streak
        burg.promotionStreakYears = 0;
      }
    }

    // 4. Urban Decay & Organic Demotion (10 consecutive years of severe ruin)
    if (
      (burg.type === 'Royal Metropolis' || burg.type === 'Trade Port' || burg.type === 'Market Town') &&
      ((burg.devastation || 0) >= 65 || (burg.isStarving && (burg.developmentLevel || 20) < 22))
    ) {
      burg.decayStreakYears = (burg.decayStreakYears || 0) + dt;
      if (burg.decayStreakYears >= 10) {
        const oldType = burg.type;
        if (burg.type === 'Royal Metropolis') {
          burg.type = 'Market Town';
          burg.tier = 'town';
        } else if (burg.type === 'Trade Port') {
          burg.type = 'Fishing Port';
          burg.tier = 'port';
        } else if (burg.type === 'Market Town') {
          burg.type = 'Farming Village';
          burg.tier = 'village';
        }
        burg.decayStreakYears = 0;
        world.history?.unshift({
          id: `hist_demote_${burg.id}_${world.currentYear}`,
          year: world.currentYear || 1000,
          title: `Decline of ${burg.name}`,
          category: 'War & Conquest',
          description: `After a decade of ruin and depopulation, the once-great ${oldType} of ${burg.name} has decayed into a ${burg.type}.`,
          realmId: burg.stateId,
        });
      }
    } else {
      burg.decayStreakYears = Math.max(0, (burg.decayStreakYears || 0) - dt);
    }
  }
}
