import {
  CommodityType,
  CommodityCategory,
  CommodityGeography,
  CommodityPurpose,
  CommodityAccessibility,
  CommodityDurability,
  CommodityMetadata,
  CommodityMarket,
  BurgMarket,
  BankInstitution,
  BankLoan,
  FiscalProfile,
  EconomyState,
  FoodSecurityState,
  RealmCurrency,
  BarterTransaction,
  BarterRatio,
  ProductionRecipe,
  SocialStratum,
  PopulationStratumData,
  StratumSentiment,
} from '../types/economy';
export type { CommodityType };
import {
  WorldState,
  Character,
  Burg,
  Realm,
  TaxPolicy,
  RealmBudgetState,
  RealmBudgetReport,
} from '../types/world';
import { computeV17StatModifier, getHookMultiplier } from './v17TraitDB';
import { generateUniqueId } from './v17GrandStrategyEngine';
import { classifyClimateFlags } from './geographyExportsEngine';
import { calculateBurgEconomicLedger } from './feudalEngine';
import {
  computeBurgBuildingMaintenance,
  ensureBurgBuildingSlots,
  advanceSettlementDevelopmentYear,
  constructOrUpgradeBespokeSlot,
  getSettlementBlueprint,
} from './settlementDevelopmentEngine';
import { globalModRegistry } from './modSystem/registryManager';

// ============================================================================
// 1. MASTER 52-COMMODITY CATALOG & METADATA (BY GEOGRAPHY, PURPOSE, ACCESSIBILITY, DURABILITY)
// ============================================================================

export interface ExtendedCommodityMeta extends CommodityMetadata {
  priceFloor: number;
  priceCeiling: number;
}

export const COMMODITIES: Record<CommodityType, ExtendedCommodityMeta> = {
  // --- ESSENTIAL FOODS ---
  Grain: {
    commodity: 'Grain',
    category: 'ESSENTIAL_FOOD',
    geography: 'Fertile Lowlands',
    purpose: 'Staple Food',
    accessibility: 'Abundant',
    durability: 'Semi-durable',
    basePrice: 10,
    defaultElasticity: 1.4,
    spoilageRate: 0.04,
    transportWeight: 1.0,
    essentialTier: 0,
    priceFloor: 2,
    priceCeiling: 80,
  },
  Livestock: {
    commodity: 'Livestock',
    category: 'ESSENTIAL_FOOD',
    geography: 'Fertile Lowlands',
    purpose: 'Staple Food',
    accessibility: 'Abundant',
    durability: 'Perishable',
    basePrice: 18,
    defaultElasticity: 1.2,
    spoilageRate: 0.02,
    transportWeight: 2.0,
    essentialTier: 0,
    priceFloor: 4,
    priceCeiling: 120,
  },
  'Dried Fish': {
    commodity: 'Dried Fish',
    category: 'ESSENTIAL_FOOD',
    geography: 'Coastal/Maritime',
    purpose: 'Staple Food',
    accessibility: 'Abundant',
    durability: 'Semi-durable',
    basePrice: 12,
    defaultElasticity: 1.3,
    spoilageRate: 0.015,
    transportWeight: 0.9,
    essentialTier: 0,
    priceFloor: 3,
    priceCeiling: 75,
  },
  Salt: {
    commodity: 'Salt',
    category: 'ESSENTIAL_FOOD',
    geography: 'Coastal/Maritime',
    purpose: 'Staple Food',
    accessibility: 'Regional',
    durability: 'Imperishable',
    basePrice: 22,
    defaultElasticity: 0.9,
    spoilageRate: 0.001,
    transportWeight: 0.8,
    essentialTier: 0,
    priceFloor: 5,
    priceCeiling: 150,
  },
  'Olive Oil': {
    commodity: 'Olive Oil',
    category: 'ESSENTIAL_FOOD',
    geography: 'Fertile Lowlands',
    purpose: 'Staple Food',
    accessibility: 'Regional',
    durability: 'Semi-durable',
    basePrice: 26,
    defaultElasticity: 0.8,
    spoilageRate: 0.003,
    transportWeight: 1.2,
    essentialTier: 1,
    priceFloor: 7,
    priceCeiling: 160,
  },
  'Ale & Beer': {
    commodity: 'Ale & Beer',
    category: 'ESSENTIAL_FOOD',
    geography: 'Fertile Lowlands',
    purpose: 'Staple Food',
    accessibility: 'Abundant',
    durability: 'Perishable',
    basePrice: 14,
    defaultElasticity: 1.1,
    spoilageRate: 0.05,
    transportWeight: 1.4,
    essentialTier: 1,
    priceFloor: 3,
    priceCeiling: 85,
  },
  Cheese: {
    commodity: 'Cheese',
    category: 'ESSENTIAL_FOOD',
    geography: 'Highlands/Mountains',
    purpose: 'Staple Food',
    accessibility: 'Regional',
    durability: 'Perishable',
    basePrice: 19,
    defaultElasticity: 0.9,
    spoilageRate: 0.04,
    transportWeight: 0.8,
    essentialTier: 1,
    priceFloor: 5,
    priceCeiling: 110,
  },
  'Orchard Fruit': {
    commodity: 'Orchard Fruit',
    category: 'ESSENTIAL_FOOD',
    geography: 'Fertile Lowlands',
    purpose: 'Staple Food',
    accessibility: 'Regional',
    durability: 'Perishable',
    basePrice: 16,
    defaultElasticity: 1.2,
    spoilageRate: 0.08,
    transportWeight: 1.0,
    essentialTier: 1,
    priceFloor: 3,
    priceCeiling: 95,
  },
  Honey: {
    commodity: 'Honey',
    category: 'ESSENTIAL_FOOD',
    geography: 'Fertile Lowlands',
    purpose: 'Staple Food',
    accessibility: 'Regional',
    durability: 'Imperishable',
    basePrice: 24,
    defaultElasticity: 0.7,
    spoilageRate: 0.001,
    transportWeight: 0.5,
    essentialTier: 1,
    priceFloor: 5,
    priceCeiling: 140,
  },
  Herbs: {
    commodity: 'Herbs',
    category: 'ESSENTIAL_FOOD',
    geography: 'River Basin',
    purpose: 'Medicinal & Sacred',
    accessibility: 'Abundant',
    durability: 'Perishable',
    basePrice: 20,
    defaultElasticity: 0.8,
    spoilageRate: 0.06,
    transportWeight: 0.3,
    essentialTier: 1,
    priceFloor: 4,
    priceCeiling: 120,
  },

  // --- RAW MATERIALS & MINERALS ---
  Timber: {
    commodity: 'Timber',
    category: 'RAW_MATERIAL',
    geography: 'Boreal Forest/Taiga',
    purpose: 'Civic & Construction',
    accessibility: 'Abundant',
    durability: 'Semi-durable',
    basePrice: 14,
    defaultElasticity: 0.8,
    spoilageRate: 0.005,
    transportWeight: 2.5,
    essentialTier: 1,
    priceFloor: 3,
    priceCeiling: 90,
  },
  Iron: {
    commodity: 'Iron',
    category: 'RAW_MATERIAL',
    geography: 'Highlands/Mountains',
    purpose: 'Military & Strategic',
    accessibility: 'Regional',
    durability: 'Imperishable',
    basePrice: 30,
    defaultElasticity: 1.0,
    spoilageRate: 0.001,
    transportWeight: 3.0,
    essentialTier: 1,
    priceFloor: 8,
    priceCeiling: 200,
  },
  Copper: {
    commodity: 'Copper',
    category: 'RAW_MATERIAL',
    geography: 'Highlands/Mountains',
    purpose: 'Manufactured & Textile',
    accessibility: 'Regional',
    durability: 'Imperishable',
    basePrice: 28,
    defaultElasticity: 0.85,
    spoilageRate: 0.001,
    transportWeight: 2.8,
    essentialTier: 1,
    priceFloor: 7,
    priceCeiling: 180,
  },
  Tin: {
    commodity: 'Tin',
    category: 'RAW_MATERIAL',
    geography: 'Highlands/Mountains',
    purpose: 'Military & Strategic',
    accessibility: 'Scarce',
    durability: 'Imperishable',
    basePrice: 34,
    defaultElasticity: 0.8,
    spoilageRate: 0.0,
    transportWeight: 2.6,
    essentialTier: 1,
    priceFloor: 9,
    priceCeiling: 210,
  },
  Lead: {
    commodity: 'Lead',
    category: 'RAW_MATERIAL',
    geography: 'Highlands/Mountains',
    purpose: 'Military & Strategic',
    accessibility: 'Regional',
    durability: 'Imperishable',
    basePrice: 22,
    defaultElasticity: 0.7,
    spoilageRate: 0.0,
    transportWeight: 3.5,
    essentialTier: 1,
    priceFloor: 6,
    priceCeiling: 140,
  },
  Coal: {
    commodity: 'Coal',
    category: 'RAW_MATERIAL',
    geography: 'Highlands/Mountains',
    purpose: 'Civic & Construction',
    accessibility: 'Regional',
    durability: 'Imperishable',
    basePrice: 16,
    defaultElasticity: 0.75,
    spoilageRate: 0.002,
    transportWeight: 2.2,
    essentialTier: 1,
    priceFloor: 4,
    priceCeiling: 100,
  },
  Sulfur: {
    commodity: 'Sulfur',
    category: 'RAW_MATERIAL',
    geography: 'Highlands/Mountains',
    purpose: 'Military & Strategic',
    accessibility: 'Scarce',
    durability: 'Imperishable',
    basePrice: 48,
    defaultElasticity: 0.6,
    spoilageRate: 0.0,
    transportWeight: 1.8,
    essentialTier: 2,
    priceFloor: 12,
    priceCeiling: 290,
  },
  'Tar & Pitch': {
    commodity: 'Tar & Pitch',
    category: 'RAW_MATERIAL',
    geography: 'Boreal Forest/Taiga',
    purpose: 'Military & Strategic',
    accessibility: 'Regional',
    durability: 'Semi-durable',
    basePrice: 25,
    defaultElasticity: 0.75,
    spoilageRate: 0.005,
    transportWeight: 2.2,
    essentialTier: 1,
    priceFloor: 6,
    priceCeiling: 155,
  },
  Stone: {
    commodity: 'Stone',
    category: 'RAW_MATERIAL',
    geography: 'Highlands/Mountains',
    purpose: 'Civic & Construction',
    accessibility: 'Abundant',
    durability: 'Imperishable',
    basePrice: 12,
    defaultElasticity: 0.6,
    spoilageRate: 0.0,
    transportWeight: 4.0,
    essentialTier: 1,
    priceFloor: 3,
    priceCeiling: 80,
  },
  Marble: {
    commodity: 'Marble',
    category: 'RAW_MATERIAL',
    geography: 'Highlands/Mountains',
    purpose: 'Civic & Construction',
    accessibility: 'Scarce',
    durability: 'Imperishable',
    basePrice: 75,
    defaultElasticity: 0.5,
    spoilageRate: 0.0,
    transportWeight: 4.5,
    essentialTier: 2,
    priceFloor: 20,
    priceCeiling: 480,
  },
  'Quarried Slate': {
    commodity: 'Quarried Slate',
    category: 'RAW_MATERIAL',
    geography: 'Highlands/Mountains',
    purpose: 'Civic & Construction',
    accessibility: 'Regional',
    durability: 'Imperishable',
    basePrice: 20,
    defaultElasticity: 0.65,
    spoilageRate: 0.0,
    transportWeight: 3.0,
    essentialTier: 1,
    priceFloor: 5,
    priceCeiling: 125,
  },
  'Bricks & Mortar': {
    commodity: 'Bricks & Mortar',
    category: 'RAW_MATERIAL',
    geography: 'River Basin',
    purpose: 'Civic & Construction',
    accessibility: 'Abundant',
    durability: 'Imperishable',
    basePrice: 13,
    defaultElasticity: 0.7,
    spoilageRate: 0.0,
    transportWeight: 3.5,
    essentialTier: 1,
    priceFloor: 3,
    priceCeiling: 80,
  },
  'Linen & Flax': {
    commodity: 'Linen & Flax',
    category: 'RAW_MATERIAL',
    geography: 'River Basin',
    purpose: 'Manufactured & Textile',
    accessibility: 'Abundant',
    durability: 'Semi-durable',
    basePrice: 17,
    defaultElasticity: 0.85,
    spoilageRate: 0.01,
    transportWeight: 0.9,
    essentialTier: 1,
    priceFloor: 4,
    priceCeiling: 105,
  },
  'Alchemical Mercury': {
    commodity: 'Alchemical Mercury',
    category: 'RAW_MATERIAL',
    geography: 'Highlands/Mountains',
    purpose: 'Medicinal & Sacred',
    accessibility: 'Scarce',
    durability: 'Imperishable',
    basePrice: 72,
    defaultElasticity: 0.45,
    spoilageRate: 0.0,
    transportWeight: 1.8,
    essentialTier: 3,
    priceFloor: 20,
    priceCeiling: 450,
  },

  // --- MANUFACTURED GOODS & TEXTILES ---
  Wool: {
    commodity: 'Wool',
    category: 'MANUFACTURED',
    geography: 'Fertile Lowlands',
    purpose: 'Manufactured & Textile',
    accessibility: 'Abundant',
    durability: 'Semi-durable',
    basePrice: 20,
    defaultElasticity: 0.8,
    spoilageRate: 0.01,
    transportWeight: 1.0,
    essentialTier: 1,
    priceFloor: 5,
    priceCeiling: 120,
  },
  'Fine Woolen Cloth': {
    commodity: 'Fine Woolen Cloth',
    category: 'MANUFACTURED',
    geography: 'Fertile Lowlands',
    purpose: 'Manufactured & Textile',
    accessibility: 'Regional',
    durability: 'Semi-durable',
    basePrice: 44,
    defaultElasticity: 0.65,
    spoilageRate: 0.005,
    transportWeight: 0.7,
    essentialTier: 2,
    priceFloor: 12,
    priceCeiling: 270,
  },
  'Tanned Leather': {
    commodity: 'Tanned Leather',
    category: 'MANUFACTURED',
    geography: 'Fertile Lowlands',
    purpose: 'Manufactured & Textile',
    accessibility: 'Abundant',
    durability: 'Semi-durable',
    basePrice: 24,
    defaultElasticity: 0.8,
    spoilageRate: 0.005,
    transportWeight: 1.3,
    essentialTier: 1,
    priceFloor: 6,
    priceCeiling: 145,
  },
  'Parchment & Vellum': {
    commodity: 'Parchment & Vellum',
    category: 'MANUFACTURED',
    geography: 'Fertile Lowlands',
    purpose: 'Manufactured & Textile',
    accessibility: 'Regional',
    durability: 'Semi-durable',
    basePrice: 40,
    defaultElasticity: 0.6,
    spoilageRate: 0.002,
    transportWeight: 0.4,
    essentialTier: 2,
    priceFloor: 10,
    priceCeiling: 250,
  },
  'Rope & Cordage': {
    commodity: 'Rope & Cordage',
    category: 'MANUFACTURED',
    geography: 'Coastal/Maritime',
    purpose: 'Civic & Construction',
    accessibility: 'Abundant',
    durability: 'Semi-durable',
    basePrice: 15,
    defaultElasticity: 0.9,
    spoilageRate: 0.005,
    transportWeight: 1.1,
    essentialTier: 1,
    priceFloor: 3,
    priceCeiling: 90,
  },
  'Clay & Pottery': {
    commodity: 'Clay & Pottery',
    category: 'MANUFACTURED',
    geography: 'River Basin',
    purpose: 'Civic & Construction',
    accessibility: 'Abundant',
    durability: 'Imperishable',
    basePrice: 18,
    defaultElasticity: 0.75,
    spoilageRate: 0.0,
    transportWeight: 2.0,
    essentialTier: 1,
    priceFloor: 4,
    priceCeiling: 110,
  },
  Glassware: {
    commodity: 'Glassware',
    category: 'MANUFACTURED',
    geography: 'Coastal/Maritime',
    purpose: 'Luxury & Prestige',
    accessibility: 'Scarce',
    durability: 'Imperishable',
    basePrice: 45,
    defaultElasticity: 0.55,
    spoilageRate: 0.005,
    transportWeight: 1.2,
    essentialTier: 2,
    priceFloor: 12,
    priceCeiling: 280,
  },
  Dyes: {
    commodity: 'Dyes',
    category: 'MANUFACTURED',
    geography: 'Coastal/Maritime',
    purpose: 'Manufactured & Textile',
    accessibility: 'Scarce',
    durability: 'Semi-durable',
    basePrice: 50,
    defaultElasticity: 0.7,
    spoilageRate: 0.01,
    transportWeight: 0.6,
    essentialTier: 2,
    priceFloor: 15,
    priceCeiling: 300,
  },
  Wine: {
    commodity: 'Wine',
    category: 'MANUFACTURED',
    geography: 'Fertile Lowlands',
    purpose: 'Luxury & Prestige',
    accessibility: 'Regional',
    durability: 'Semi-durable',
    basePrice: 32,
    defaultElasticity: 0.6,
    spoilageRate: 0.005,
    transportWeight: 1.5,
    essentialTier: 2,
    priceFloor: 8,
    priceCeiling: 220,
  },
  Furs: {
    commodity: 'Furs',
    category: 'MANUFACTURED',
    geography: 'Boreal Forest/Taiga',
    purpose: 'Luxury & Prestige',
    accessibility: 'Regional',
    durability: 'Semi-durable',
    basePrice: 42,
    defaultElasticity: 0.65,
    spoilageRate: 0.02,
    transportWeight: 0.8,
    essentialTier: 2,
    priceFloor: 10,
    priceCeiling: 260,
  },
  Warhorses: {
    commodity: 'Warhorses',
    category: 'MANUFACTURED',
    geography: 'Arid Steppe/Desert',
    purpose: 'Military & Strategic',
    accessibility: 'Scarce',
    durability: 'Perishable',
    basePrice: 120,
    defaultElasticity: 0.45,
    spoilageRate: 0.01,
    transportWeight: 5.0,
    essentialTier: 2,
    priceFloor: 35,
    priceCeiling: 720,
  },
  'Crossbow Bolts': {
    commodity: 'Crossbow Bolts',
    category: 'MANUFACTURED',
    geography: 'Boreal Forest/Taiga',
    purpose: 'Military & Strategic',
    accessibility: 'Regional',
    durability: 'Semi-durable',
    basePrice: 38,
    defaultElasticity: 0.7,
    spoilageRate: 0.002,
    transportWeight: 1.1,
    essentialTier: 1,
    priceFloor: 10,
    priceCeiling: 230,
  },
  'Medicinal Leeches': {
    commodity: 'Medicinal Leeches',
    category: 'MANUFACTURED',
    geography: 'River Basin',
    purpose: 'Medicinal & Sacred',
    accessibility: 'Regional',
    durability: 'Perishable',
    basePrice: 28,
    defaultElasticity: 0.65,
    spoilageRate: 0.10,
    transportWeight: 0.4,
    essentialTier: 2,
    priceFloor: 7,
    priceCeiling: 170,
  },
  'Beeswax Candles': {
    commodity: 'Beeswax Candles',
    category: 'MANUFACTURED',
    geography: 'Fertile Lowlands',
    purpose: 'Civic & Construction',
    accessibility: 'Regional',
    durability: 'Semi-durable',
    basePrice: 21,
    defaultElasticity: 0.85,
    spoilageRate: 0.002,
    transportWeight: 0.6,
    essentialTier: 1,
    priceFloor: 5,
    priceCeiling: 130,
  },

  // --- LUXURIES & PRESTIGE GOODS ---
  Silk: {
    commodity: 'Silk',
    category: 'LUXURY',
    geography: 'Fertile Lowlands',
    purpose: 'Luxury & Prestige',
    accessibility: 'Exotic',
    durability: 'Semi-durable',
    basePrice: 90,
    defaultElasticity: 0.5,
    spoilageRate: 0.005,
    transportWeight: 0.4,
    essentialTier: 3,
    priceFloor: 25,
    priceCeiling: 550,
  },
  Spices: {
    commodity: 'Spices',
    category: 'LUXURY',
    geography: 'Arid Steppe/Desert',
    purpose: 'Luxury & Prestige',
    accessibility: 'Exotic',
    durability: 'Semi-durable',
    basePrice: 85,
    defaultElasticity: 0.5,
    spoilageRate: 0.01,
    transportWeight: 0.3,
    essentialTier: 3,
    priceFloor: 25,
    priceCeiling: 500,
  },
  Incense: {
    commodity: 'Incense',
    category: 'LUXURY',
    geography: 'Arid Steppe/Desert',
    purpose: 'Medicinal & Sacred',
    accessibility: 'Exotic',
    durability: 'Semi-durable',
    basePrice: 60,
    defaultElasticity: 0.5,
    spoilageRate: 0.002,
    transportWeight: 0.3,
    essentialTier: 3,
    priceFloor: 18,
    priceCeiling: 380,
  },
  'Fine Porcelain': {
    commodity: 'Fine Porcelain',
    category: 'LUXURY',
    geography: 'River Basin',
    purpose: 'Luxury & Prestige',
    accessibility: 'Exotic',
    durability: 'Imperishable',
    basePrice: 110,
    defaultElasticity: 0.45,
    spoilageRate: 0.005,
    transportWeight: 1.0,
    essentialTier: 3,
    priceFloor: 30,
    priceCeiling: 700,
  },
  Gems: {
    commodity: 'Gems',
    category: 'LUXURY',
    geography: 'Highlands/Mountains',
    purpose: 'Luxury & Prestige',
    accessibility: 'Scarce',
    durability: 'Imperishable',
    basePrice: 150,
    defaultElasticity: 0.4,
    spoilageRate: 0.0,
    transportWeight: 0.1,
    essentialTier: 3,
    priceFloor: 45,
    priceCeiling: 900,
  },
  Amber: {
    commodity: 'Amber',
    category: 'LUXURY',
    geography: 'Coastal/Maritime',
    purpose: 'Luxury & Prestige',
    accessibility: 'Scarce',
    durability: 'Imperishable',
    basePrice: 95,
    defaultElasticity: 0.45,
    spoilageRate: 0.0,
    transportWeight: 0.3,
    essentialTier: 3,
    priceFloor: 25,
    priceCeiling: 600,
  },
  Pearls: {
    commodity: 'Pearls',
    category: 'LUXURY',
    geography: 'Coastal/Maritime',
    purpose: 'Luxury & Prestige',
    accessibility: 'Exotic',
    durability: 'Imperishable',
    basePrice: 135,
    defaultElasticity: 0.35,
    spoilageRate: 0.0,
    transportWeight: 0.1,
    essentialTier: 3,
    priceFloor: 40,
    priceCeiling: 850,
  },
  Ivory: {
    commodity: 'Ivory',
    category: 'LUXURY',
    geography: 'Arid Steppe/Desert',
    purpose: 'Luxury & Prestige',
    accessibility: 'Exotic',
    durability: 'Imperishable',
    basePrice: 140,
    defaultElasticity: 0.35,
    spoilageRate: 0.0,
    transportWeight: 1.2,
    essentialTier: 3,
    priceFloor: 40,
    priceCeiling: 880,
  },
  Tapestries: {
    commodity: 'Tapestries',
    category: 'LUXURY',
    geography: 'Fertile Lowlands',
    purpose: 'Luxury & Prestige',
    accessibility: 'Scarce',
    durability: 'Semi-durable',
    basePrice: 88,
    defaultElasticity: 0.5,
    spoilageRate: 0.005,
    transportWeight: 1.5,
    essentialTier: 3,
    priceFloor: 24,
    priceCeiling: 540,
  },
  'Fine Saffron': {
    commodity: 'Fine Saffron',
    category: 'LUXURY',
    geography: 'Arid Steppe/Desert',
    purpose: 'Luxury & Prestige',
    accessibility: 'Exotic',
    durability: 'Semi-durable',
    basePrice: 165,
    defaultElasticity: 0.3,
    spoilageRate: 0.008,
    transportWeight: 0.1,
    essentialTier: 3,
    priceFloor: 50,
    priceCeiling: 1050,
  },
  'Myrrh & Resins': {
    commodity: 'Myrrh & Resins',
    category: 'LUXURY',
    geography: 'Arid Steppe/Desert',
    purpose: 'Medicinal & Sacred',
    accessibility: 'Exotic',
    durability: 'Semi-durable',
    basePrice: 65,
    defaultElasticity: 0.5,
    spoilageRate: 0.003,
    transportWeight: 0.5,
    essentialTier: 3,
    priceFloor: 18,
    priceCeiling: 410,
  },
  'Holy Relics': {
    commodity: 'Holy Relics',
    category: 'LUXURY',
    geography: 'River Basin',
    purpose: 'Medicinal & Sacred',
    accessibility: 'Scarce',
    durability: 'Imperishable',
    basePrice: 180,
    defaultElasticity: 0.25,
    spoilageRate: 0.0,
    transportWeight: 0.8,
    essentialTier: 3,
    priceFloor: 55,
    priceCeiling: 1100,
  },

  // --- BULLION ---
  Silver: {
    commodity: 'Silver',
    category: 'BULLION',
    geography: 'Highlands/Mountains',
    purpose: 'Luxury & Prestige',
    accessibility: 'Scarce',
    durability: 'Imperishable',
    basePrice: 70,
    defaultElasticity: 0.5,
    spoilageRate: 0.0,
    transportWeight: 1.5,
    essentialTier: 4,
    priceFloor: 20,
    priceCeiling: 450,
  },
  Gold: {
    commodity: 'Gold',
    category: 'BULLION',
    geography: 'Highlands/Mountains',
    purpose: 'Luxury & Prestige',
    accessibility: 'Exotic',
    durability: 'Imperishable',
    basePrice: 200,
    defaultElasticity: 0.3,
    spoilageRate: 0.0,
    transportWeight: 1.5,
    essentialTier: 4,
    priceFloor: 60,
    priceCeiling: 1200,
  },

  // --- 10 ESSENTIAL STRATEGIC, CIVIC, MEDICINAL & PLANTATION COMMODITIES ---
  'Tools & Ironware': {
    commodity: 'Tools & Ironware',
    category: 'MANUFACTURED',
    geography: 'Highlands/Mountains',
    purpose: 'Civic & Construction',
    accessibility: 'Regional',
    durability: 'Imperishable',
    basePrice: 26,
    defaultElasticity: 0.8,
    spoilageRate: 0.001,
    transportWeight: 1.8,
    essentialTier: 1,
    priceFloor: 7,
    priceCeiling: 160,
  },
  'Steel Arms & Armor': {
    commodity: 'Steel Arms & Armor',
    category: 'MANUFACTURED',
    geography: 'Highlands/Mountains',
    purpose: 'Military & Strategic',
    accessibility: 'Regional',
    durability: 'Imperishable',
    basePrice: 48,
    defaultElasticity: 0.65,
    spoilageRate: 0.001,
    transportWeight: 2.2,
    essentialTier: 1,
    priceFloor: 14,
    priceCeiling: 290,
  },
  'Bronze & Brassware': {
    commodity: 'Bronze & Brassware',
    category: 'MANUFACTURED',
    geography: 'Highlands/Mountains',
    purpose: 'Civic & Construction',
    accessibility: 'Regional',
    durability: 'Imperishable',
    basePrice: 34,
    defaultElasticity: 0.7,
    spoilageRate: 0.001,
    transportWeight: 2.0,
    essentialTier: 1,
    priceFloor: 10,
    priceCeiling: 210,
  },
  Saltpeter: {
    commodity: 'Saltpeter',
    category: 'RAW_MATERIAL',
    geography: 'Arid Steppe/Desert',
    purpose: 'Military & Strategic',
    accessibility: 'Regional',
    durability: 'Semi-durable',
    basePrice: 22,
    defaultElasticity: 0.7,
    spoilageRate: 0.004,
    transportWeight: 1.2,
    essentialTier: 2,
    priceFloor: 6,
    priceCeiling: 140,
  },
  Blackpowder: {
    commodity: 'Blackpowder',
    category: 'MANUFACTURED',
    geography: 'Highlands/Mountains',
    purpose: 'Military & Strategic',
    accessibility: 'Scarce',
    durability: 'Semi-durable',
    basePrice: 55,
    defaultElasticity: 0.55,
    spoilageRate: 0.006,
    transportWeight: 1.4,
    essentialTier: 2,
    priceFloor: 16,
    priceCeiling: 340,
  },
  'Paper & Codices': {
    commodity: 'Paper & Codices',
    category: 'MANUFACTURED',
    geography: 'River Basin',
    purpose: 'Civic & Construction',
    accessibility: 'Regional',
    durability: 'Semi-durable',
    basePrice: 30,
    defaultElasticity: 0.65,
    spoilageRate: 0.003,
    transportWeight: 0.5,
    essentialTier: 1,
    priceFloor: 8,
    priceCeiling: 185,
  },
  'Apothecary Remedies': {
    commodity: 'Apothecary Remedies',
    category: 'MANUFACTURED',
    geography: 'River Basin',
    purpose: 'Medicinal & Sacred',
    accessibility: 'Regional',
    durability: 'Semi-durable',
    basePrice: 38,
    defaultElasticity: 0.6,
    spoilageRate: 0.02,
    transportWeight: 0.4,
    essentialTier: 1,
    priceFloor: 10,
    priceCeiling: 240,
  },
  'Jewelry & Regalia': {
    commodity: 'Jewelry & Regalia',
    category: 'LUXURY',
    geography: 'Highlands/Mountains',
    purpose: 'Luxury & Prestige',
    accessibility: 'Exotic',
    durability: 'Imperishable',
    basePrice: 145,
    defaultElasticity: 0.4,
    spoilageRate: 0.0,
    transportWeight: 0.2,
    essentialTier: 3,
    priceFloor: 42,
    priceCeiling: 880,
  },
  'Cane Sugar': {
    commodity: 'Cane Sugar',
    category: 'ESSENTIAL_FOOD',
    geography: 'Arid Steppe/Desert',
    purpose: 'Staple Food',
    accessibility: 'Regional',
    durability: 'Semi-durable',
    basePrice: 28,
    defaultElasticity: 0.85,
    spoilageRate: 0.01,
    transportWeight: 0.9,
    essentialTier: 2,
    priceFloor: 7,
    priceCeiling: 175,
  },
  'Distilled Spirits': {
    commodity: 'Distilled Spirits',
    category: 'MANUFACTURED',
    geography: 'Coastal/Maritime',
    purpose: 'Staple Food',
    accessibility: 'Regional',
    durability: 'Imperishable',
    basePrice: 32,
    defaultElasticity: 0.75,
    spoilageRate: 0.001,
    transportWeight: 1.3,
    essentialTier: 1,
    priceFloor: 8,
    priceCeiling: 200,
  },
};

export const BASE_PRICES: Record<CommodityType, number> = Object.fromEntries(
  Object.entries(COMMODITIES).map(([k, v]) => [k, v.basePrice])
) as Record<CommodityType, number>;

const LEGACY_TRADE_GOOD_MAP: Record<string, CommodityType> = {
  'Salted Fish & Oil': 'Dried Fish',
  'Grain & Flour': 'Grain',
  'Fine Steel & Swords': 'Steel Arms & Armor',
  'Aged Cask Wine': 'Wine',
  'Timber & Resin': 'Timber',
  'Spices & Saffron': 'Spices',
  'Royal Purple Silk': 'Silk',
  'Silver Bullion': 'Silver',
  Weapons: 'Steel Arms & Armor',
  Armor: 'Steel Arms & Armor',
};

export function canonicalizeTradeGood(raw?: string): CommodityType {
  if (!raw) return 'Grain';
  const trimmed = raw.trim();
  if (LEGACY_TRADE_GOOD_MAP[trimmed]) return LEGACY_TRADE_GOOD_MAP[trimmed];
  if ((COMMODITIES as Record<string, unknown>)[trimmed]) return trimmed as CommodityType;
  return 'Grain';
}

// ============================================================================
// 2. EQUILIBRIUM & PRICE RESOLUTION
// ============================================================================

export function calculateMarketPrice(
  market: CommodityMarket,
  inflationFactor: number = 1.0,
  damping: number = 0.20
): number {
  const meta = COMMODITIES[market.commodity];
  const effectiveSupply = market.monthlyProduction + Math.max(0, market.stockpile * 0.22) + 0.001;
  const effectiveDemand = market.monthlyConsumption + 0.001;

  const pressureRatio = effectiveDemand / effectiveSupply;
  const targetPrice = meta.basePrice * Math.pow(pressureRatio, meta.defaultElasticity) * inflationFactor;

  const rawAdjusted = market.currentPrice + (targetPrice - market.currentPrice) * damping;
  const floor = market.priceFloor || meta.priceFloor;
  const ceiling = market.priceCeiling || meta.priceCeiling;

  return Math.min(ceiling, Math.max(floor, Math.round(rawAdjusted * 10) / 10));
}

export function updateBurgFoodSecurity(burgMarket: BurgMarket, worldBurg?: Burg): void {
  const grain = burgMarket.markets['Grain'];
  const livestock = burgMarket.markets['Livestock'];

  const totalFoodStock = (grain?.stockpile || 0) + (livestock?.stockpile || 0);
  const monthlyDemand = (grain?.monthlyConsumption || 0) + (livestock?.monthlyConsumption || 0) || 12;

  const monthsRemaining = Math.round((totalFoodStock / monthlyDemand) * 10) / 10;
  burgMarket.monthsOfFoodReserves = monthsRemaining;

  let state: FoodSecurityState = 'SECURE';
  if (monthsRemaining >= 6.0) state = 'SECURE';
  else if (monthsRemaining >= 3.0) state = 'STRAINED';
  else if (monthsRemaining >= 1.0) state = 'RATIONED';
  else state = 'FAMINE';

  burgMarket.foodSecurity = state;
  burgMarket.isStarving = state === 'FAMINE';

  if (worldBurg) {
    worldBurg.foodSecurity = state;
    worldBurg.monthsOfFoodReserves = monthsRemaining;
    worldBurg.isStarving = burgMarket.isStarving;
  }
}

// ============================================================================
// 3. FACTORY INITIALIZATION
// ============================================================================

export function createDefaultBurgMarket(
  burgId: string,
  burgName: string,
  initialWorkingCapital: number = 180
): BurgMarket {
  const markets = {} as Record<CommodityType, CommodityMarket>;
  const activeCommodities = getActiveCommodities();

  for (const [key, meta] of Object.entries(activeCommodities)) {
    const comm = key as CommodityType;
    markets[comm] = {
      commodity: comm,
      basePrice: meta.basePrice,
      currentPrice: meta.basePrice,
      lastMonthPrice: meta.basePrice,
      stockpile: 40 + Math.floor(Math.random() * 25),
      maxStockpileCapacity: 1200,
      monthlyProduction: 8 + Math.floor(Math.random() * 6),
      monthlyConsumption: 8 + Math.floor(Math.random() * 5),
      elasticity: meta.defaultElasticity,
      priceFloor: meta.priceFloor,
      priceCeiling: meta.priceCeiling,
    };
  }

  // Ensure food stockpiles start healthy
  markets['Grain'].stockpile = 80 + Math.floor(Math.random() * 40);
  markets['Livestock'].stockpile = 50 + Math.floor(Math.random() * 30);

  const floatVal = Math.max(120, Math.round(initialWorkingCapital));

  const burgMarket: BurgMarket = {
    burgId,
    burgName,
    markets,
    tariffRate: 0.05,
    isStarving: false,
    foodSecurity: 'SECURE',
    monthsOfFoodReserves: 9,
    tradeConnectivity: 1.0,
    totalMarketVolume: 0,
    connectedBurgIds: [],
    treasury: floatVal,
    workingCapitalFloat: floatVal,
  };

  updateBurgFoodSecurity(burgMarket);
  return burgMarket;
}

export function createDefaultBanks(): BankInstitution[] {
  return [
    {
      id: 'bank_vane',
      name: 'House of Vane Bank & Bourse',
      headquartersBurgId: 'burg_1',
      treasury: 2500,
      baseInterestRate: 0.08,
      activeLoans: [],
      isSolvent: true,
      opinionOfCrown: 25,
      patricianCharacterId: 'patrician_1',
      patricianName: 'Lord Lorenzo Vane',
      houseName: 'House of Vane',
      patricianTitle: 'Grand Prior of Coin',
      reputationDescription: 'Calculating and merciless with delinquent sovereigns; generous to loyal crowns.',
    },
    {
      id: 'bank_ironweavers',
      name: 'The Iron Guild Creditors',
      headquartersBurgId: 'burg_2',
      treasury: 2000,
      baseInterestRate: 0.12,
      activeLoans: [],
      isSolvent: true,
      opinionOfCrown: 10,
      patricianCharacterId: 'patrician_2',
      patricianName: 'Master Jakob Ironweaver',
      houseName: 'The Ironweavers',
      patricianTitle: 'High Syndic',
      reputationDescription: 'Backed by mining conglomerates; holds vast mortgage rights across the western marches.',
    },
  ];
}

// ============================================================================
// 4. FISCAL PROFILES & MONETARY POLICY
// ============================================================================

export function calculateFiscalProfile(
  ruler: Character,
  world: WorldState,
  economy: EconomyState
): FiscalProfile {
  const traits = Array.from(
    new Set([
      ...(ruler.v17Traits || []),
      ...(ruler.personalityTraits || []),
      ...(ruler.congenitalTraits || []),
      ...(ruler.physicalHealthTraits || []),
      ...(ruler.commanderTraits || []),
      ...(ruler.lifestyleTraits || []),
      ...(ruler.educationTrait ? [ruler.educationTrait] : []),
      ...(ruler.statusTrait ? [ruler.statusTrait] : []),
    ])
  );
  const stewBonus = computeV17StatModifier(traits, 'STEWARDSHIP');
  const econMultiplier = getHookMultiplier(traits, 'ECONOMY');

  // 1. REAL DEMESNE EXTRACTION (Tied to real town revenues & coffer solvency)
  const personallyHeld = (world.burgs || []).filter((b) => b.ownerId === ruler.id);

  let demesne = 0;
  let totalFiefCoffers = 0;

  for (const b of personallyHeld) {
    // Sync town municipal treasury & protect working capital float
    const bMkt = economy.burgMarkets?.[b.id];
    const defaultFloat = Math.max(120, Math.round((b.developmentLevel || 30) * 8 + (b.population || 3000) * 0.018));
    if (b.treasury === undefined) {
      b.treasury = bMkt?.treasury ?? Math.max(180, Math.round((b.developmentLevel || 30) * 14 + (b.population || 5000) * 0.032));
    }
    const workingFloat = bMkt?.workingCapitalFloat ?? defaultFloat;
    totalFiefCoffers += b.treasury;

    const isUnderSiege = (world.activeSieges || []).some(
      (s) => s.holdingId === b.id || s.holdingName.includes(b.name)
    );
    const siegeFactor = isUnderSiege ? 0.35 : 1.0;
    const famineFactor = b.isStarving || b.foodSecurity === 'FAMINE' ? 0.60 : 1.0;
    const strikeFactor = (b.unrest || 0) >= 75 ? 0.35 : 1.0;
    const devastationFactor = Math.max(0.25, 1 - (b.devastation || 0) * 0.0065);

    // Real tax extracted from actual economic output + bespoke economic slot bonuses, never taxing workingCapitalFloat!
    const ledger = b.economicLedger || calculateBurgEconomicLedger(b, world);
    const bMaint = computeBurgBuildingMaintenance(b);
    const baseRev = ledger.totalRevenue + bMaint.taxBonus * 1.15;
    const townRev = baseRev * siegeFactor * famineFactor * strikeFactor * devastationFactor;
    const targetTax = townRev * 0.085 * (1.0 + stewBonus) * econMultiplier;

    const taxableSurplus = Math.max(0, b.treasury - workingFloat);
    const extractedTax = Math.min(taxableSurplus, targetTax);
    demesne += extractedTax;
  }

  // Helper for single-vassal feudal tribute obligation (strictly landed fief holders; courtiers owe 0)
  const computeSingleVassalTribute = (v: Character, liegeId: string): number => {
    const vBurgs = (world.burgs || []).filter((b) => b.ownerId === v.id);
    if (vBurgs.length === 0) return 0;
    let vFiefYield = 0;
    for (const vb of vBurgs) {
      const vl = vb.economicLedger || calculateBurgEconomicLedger(vb, world);
      vFiefYield += vl.totalRevenue * 0.075;
    }
    const vTierFloor =
      v.titleTier === 'Duke'
        ? 1.6
        : v.titleTier === 'Count'
        ? 0.85
        : v.titleTier === 'Mayor'
        ? 0.45
        : v.titleTier === 'Baron'
        ? 0.4
        : 0;
    const vOp = v.opinions?.[liegeId] ?? 15;
    const compliance = vOp >= 40 ? 1.15 : vOp <= -30 ? 0.60 : vOp < 0 ? 0.85 : 1.0;
    const targetTribute = (vFiefYield * 0.14 + vTierFloor) * compliance;
    return Math.min(Math.max(0, (v.treasury || 0) * 0.24), targetTribute);
  };

  // 2. VASSAL TITHES (Transmitted from vassal coffers, not thin air)
  const vassals = (world.characters || []).filter((c) => c.liegeId === ruler.id && c.isAlive);
  let tribute = 0;
  for (const v of vassals) {
    tribute += computeSingleVassalTribute(v, ruler.id);
  }

  // Tithe owed BY this ruler to their own liege (ensures closed cashflow on vassal ledgers)
  const liegeChar = ruler.liegeId
    ? (world.characters || []).find((c) => c.id === ruler.liegeId && c.isAlive)
    : undefined;
  const tributeOwedToLiege = liegeChar ? computeSingleVassalTribute(ruler, liegeChar.id) : 0;

  // 3. MUNICIPAL TARIFFS & CUSTOMS (Strictly scoped to held fiefs / monarch customs; zero for prisoners/landless)
  let tariffs = 0;
  if (!ruler.isImprisoned && !ruler.isBanished && economy.burgMarkets) {
    for (const b of personallyHeld) {
      const m = economy.burgMarkets[b.id];
      if (!m) continue;
      const localTariff = Math.min(14, m.totalMarketVolume * (m.tariffRate || 0.05) * 0.012);
      tariffs += Math.min(Math.max(0, (b.treasury || 0) * 0.18), localTariff);
    }
    if (ruler.role === 'Monarch' && ruler.realmId) {
      const heldIds = new Set(personallyHeld.map((b) => b.id));
      const nonHeldCustoms = Object.values(economy.burgMarkets)
        .filter((m) => {
          if (heldIds.has(m.burgId)) return false;
          const b = world.burgs?.find((x) => x.id === m.burgId);
          return Boolean(b && b.stateId === ruler.realmId);
        })
        .reduce((acc, m) => acc + m.totalMarketVolume * (m.tariffRate || 0.05) * 0.005, 0);
      tariffs += Math.min(20, nonHeldCustoms);
    }
  }

  // Modest royal council stipend for unlanded active courtiers so they stay solvent at court
  const isCouncilOrGuard =
    [
      'Chancellor',
      'Marshal',
      'Steward',
      'Spymaster',
      'Court Chaplain',
      'Hand of the King',
      'Master of Coin',
      'Court Champion',
      'Captain of the Guard',
    ].includes(ruler.role) || ruler.courtPosition?.orbit === 'INNER_RING';
  const courtStipend =
    personallyHeld.length === 0 &&
    vassals.length === 0 &&
    !ruler.isImprisoned &&
    !ruler.isBanished &&
    isCouncilOrGuard
      ? 2.5
      : 0;

  // Coin purity & monetary inflation index (computed before expenses so real costs inflate)
  const coinPurity = economy.realmCoinPurity?.[ruler.realmId || ''] ?? 1.0;
  const inflationFactor = Math.round((1.0 / Math.max(0.2, coinPurity)) * 100) / 100;
  const expenseInflationMult = Math.min(2.2, Math.sqrt(inflationFactor));

  // Fiscal Stance & Trait-Based Lifestyle Spending Multiplier
  const fiscalStance = ruler.fiscalStance || 'Balanced';
  const stanceMult = fiscalStance === 'Austerity' ? 0.72 : fiscalStance === 'Lavish' ? 1.45 : 1.0;
  const allTraits = [
    ...(ruler.personalityTraits || []),
    ...(ruler.lifestyleTraits || []),
    ...(ruler.v17Traits || []),
  ];
  let traitSpendMult = 1.0;
  for (const t of allTraits) {
    if (['Generous', 'Gluttonous', 'Profligate', 'Lustful', 'Gregarious', 'Ambitious', 'Comfort Eater', 'Rakish'].includes(t)) {
      traitSpendMult += 0.14;
    } else if (['Greedy', 'Temperate', 'Content', 'Diligent', 'Shy', 'Reclusive'].includes(t)) {
      traitSpendMult -= 0.1;
    }
  }
  traitSpendMult = Math.max(0.65, Math.min(1.85, traitSpendMult));

  // 4. MILITARY, NAVAL TRANSPORT & COURT EXPENSES (Rebalanced to eliminate peacetime bankruptcy spiral)
  const hasRaisedLevies = personallyHeld.some((b) => b.leviesRaised);
  const baseMaAUpkeep = (ruler.menAtArms ?? 0) * 0.018;
  const ownActiveArmies = (world.armies || []).filter(
    (a) =>
      !a.isReturning &&
      (a.attackerId === ruler.id || (!a.attackerId && a.commanderId === ruler.id))
  );
  const fieldedSoldiers = ownActiveArmies.reduce((acc, a) => acc + Math.max(0, a.strength || 0), 0);
  const activeFieldUpkeep = fieldedSoldiers * 0.012;
  const armyUpkeep =
    ((hasRaisedLevies ? baseMaAUpkeep * 1.35 : baseMaAUpkeep) + activeFieldUpkeep) *
    expenseInflationMult;

  // Naval transport upkeep: +3.5g per 100 men per month while embarked on chartered ships
  const navalTransportUpkeep =
    ownActiveArmies
      .filter((a) => a.isEmbarked)
      .reduce((acc, a) => acc + (Math.max(0, a.strength || 0) / 100) * 3.5, 0) *
    expenseInflationMult;

  // Automatic Fiscal Austerity & Retrenchment Safeguards (prevents rapid noble bankruptcy)
  const vaultCap = ruler.treasuryCap ?? getDefaultVaultCap(ruler);
  const currentReserves = Math.max(0, ruler.treasury || 0);
  const reserveRatio = currentReserves / Math.max(1, vaultCap);
  const austerityTier: 'none' | 'tightening' | 'retrenchment' =
    reserveRatio < 0.1 ? 'retrenchment' : reserveRatio < 0.25 ? 'tightening' : 'none';
  const austerityCourtMult =
    austerityTier === 'retrenchment' ? 0.45 : austerityTier === 'tightening' ? 0.72 : 1.0;
  const austerityHouseholdMult =
    austerityTier === 'retrenchment' ? 0.55 : austerityTier === 'tightening' ? 0.8 : 1.0;
  const austerityShockMult =
    austerityTier === 'retrenchment' ? 0.25 : austerityTier === 'tightening' ? 0.55 : 1.0;

  const baseTierCourt =
    ruler.titleTier === 'King' || ruler.titleTier === 'Emperor'
      ? 9.8
      : ruler.titleTier === 'Duke'
      ? 4.4
      : ruler.titleTier === 'Count'
      ? 1.95
      : ruler.titleTier === 'Baron' || ruler.titleTier === 'Mayor'
      ? 0.9
      : 0.3;
  const effectiveCourtBase =
    personallyHeld.length === 0 && vassals.length === 0 && ruler.role !== 'Monarch'
      ? Math.min(baseTierCourt, 0.8)
      : baseTierCourt;
  // Royal/Noble Household Court: Great Hall food & drink, silks/furs/wool liveries, court staff wages & hospitality
  const courtSplendorCost =
    ruler.isImprisoned || ruler.isBanished
      ? 0.3
      : Math.max(
          0.3,
          (effectiveCourtBase + Math.min(18, (ruler.prestige || 40) * 0.008)) *
            stanceMult *
            traitSpendMult *
            austerityCourtMult *
            expenseInflationMult
        );

  // 4B. ESTATE, CASTLE & MANORIAL INFRASTRUCTURE MAINTENANCE (Walls, roofs, watchmen, mills, barns, bridges)
  const season = world.currentSeason || 'Spring';
  const weatherWearMult =
    season === 'Winter'
      ? 1.22
      : world.activeWeather && ['Storm', 'Blizzard', 'Flood', 'Drought'].includes(String(world.activeWeather.type || ''))
      ? 1.15
      : 1.0;
  let estateMaintenance = 0;
  for (const b of personallyHeld) {
    const dev = b.developmentLevel || 25;
    const bMaint = computeBurgBuildingMaintenance(b);
    const baseManor = 0.4 + dev * 0.016;
    const burgMaint = (baseManor + bMaint.monthlyGoldUpkeep * 0.5) * weatherWearMult;
    estateMaintenance += burgMaint;
  }
  estateMaintenance =
    estateMaintenance *
    (fiscalStance === 'Austerity' ? 0.82 : fiscalStance === 'Lavish' ? 1.2 : 1.0) *
    expenseInflationMult;

  // 4B-ii. ESTATE MANAGEMENT (Stewards, Bailiffs, Reeves & Manorial Legal Disputes)
  const estateAdministration =
    ruler.isImprisoned || ruler.isBanished || personallyHeld.length === 0
      ? 0
      : (0.2 + personallyHeld.length * 0.25 + Math.min(1.4, demesne * 0.035)) * expenseInflationMult;

  // 4C. HOUSEHOLD, FAMILY & RETINUE UPKEEP
  const allLivingChildren = (world.characters || []).filter(
    (c) => c.isAlive && (c.knownFatherId === ruler.id || c.motherId === ruler.id)
  );
  const livingChildrenCount = allLivingChildren.length;
  const hasLivingSpouse = Boolean(
    ruler.spouseId && (world.characters || []).some((c) => c.id === ruler.spouseId && c.isAlive)
  );
  const tierFamilyUnit =
    ruler.titleTier === 'King' || ruler.titleTier === 'Emperor'
      ? 2.1
      : ruler.titleTier === 'Duke'
      ? 1.15
      : ruler.titleTier === 'Count'
      ? 0.6
      : ruler.titleTier === 'Baron' || ruler.titleTier === 'Mayor'
      ? 0.3
      : 0.15;
  const householdUpkeep =
    ruler.isImprisoned || ruler.isBanished
      ? 0.15
      : (tierFamilyUnit * (1 + (hasLivingSpouse ? 0.5 : 0) + Math.min(6, livingChildrenCount) * 0.22) +
          Math.min(12, vassals.length) * 0.3) *
        stanceMult *
        traitSpendMult *
        austerityHouseholdMult *
        expenseInflationMult;

  // 4C-ii. FEUDAL DUES UPWARD: SCUTAGE ("SHIELD MONEY") & ATTENDING LIEGE'S ROYAL COURT
  const isVassalOfRealm =
    Boolean(liegeChar) && ruler.role !== 'Monarch' && !(world.realms || []).some((r) => r.rulerId === ruler.id);
  const rulerRealmAtWar = Boolean(
    ruler.realmId &&
      (world.activeWars || []).some(
        (w) =>
          w.attackerRealmId === ruler.realmId ||
          w.defenderRealmId === ruler.realmId ||
          (w.alliedRealmIds || []).includes(ruler.realmId!)
      )
  );
  const attendingCourtCost =
    isVassalOfRealm && !ruler.isImprisoned && !ruler.isBanished
      ? (ruler.titleTier === 'Duke'
          ? 0.6
          : ruler.titleTier === 'Count'
          ? 0.32
          : ruler.titleTier === 'Baron' || ruler.titleTier === 'Mayor'
          ? 0.15
          : 0.05) *
        stanceMult *
        austerityCourtMult
      : 0;
  // Scutage applies when the realm is at war and the landed vassal is not personally leading a field army
  const scutageDue =
    isVassalOfRealm &&
    rulerRealmAtWar &&
    personallyHeld.length > 0 &&
    ownActiveArmies.length === 0 &&
    !ruler.isImprisoned &&
    !ruler.isBanished
      ? ruler.titleTier === 'Duke'
        ? 1.75
        : ruler.titleTier === 'Count'
        ? 0.9
        : ruler.titleTier === 'Baron' || ruler.titleTier === 'Mayor'
        ? 0.42
        : 0
      : 0;
  const scutageAndAidsExpense = (attendingCourtCost + scutageDue) * expenseInflationMult;

  // 4C-iii. YOUNGER SONS PROVISION, MARRIAGE DOWRY RESERVES, CHANTRIES/MONASTERIES & TOURNAMENTS
  const unlandedYoungerSons = allLivingChildren.filter(
    (c) =>
      c.gender !== 'female' &&
      c.age >= 16 &&
      c.id !== ruler.heirId &&
      !(world.burgs || []).some((b) => b.ownerId === c.id)
  ).length;
  const unmarriedDaughters = allLivingChildren.filter(
    (c) => c.gender === 'female' && c.age >= 14 && !c.spouseId
  ).length;
  const youngerSonsAndDowries =
    ruler.isImprisoned || ruler.isBanished
      ? 0
      : Math.min(2.2, unlandedYoungerSons * 0.25 + unmarriedDaughters * 0.15) *
        austerityHouseholdMult *
        expenseInflationMult;

  const isZealousChar = allTraits.some((t) => ['Zealous', 'Pious', 'Compassionate', 'Theologian'].includes(t));
  const isCynicalChar = allTraits.some((t) => ['Cynical', 'Greedy', 'Arbitrary'].includes(t));
  const religiousPatronage =
    ruler.isImprisoned || ruler.isBanished
      ? 0
      : (ruler.titleTier === 'King' || ruler.titleTier === 'Emperor'
          ? 0.75
          : ruler.titleTier === 'Duke'
          ? 0.48
          : ruler.titleTier === 'Count'
          ? 0.25
          : personallyHeld.length > 0
          ? 0.12
          : 0.04) *
        (isZealousChar ? 1.35 : isCynicalChar ? 0.55 : 1.0) *
        austerityCourtMult *
        expenseInflationMult;

  const isClergyChar = ['Court Chaplain', 'Bishop', 'Archbishop', 'Priest'].includes(ruler.role) || ruler.isMonk;
  const isChivalricChar = allTraits.some((t) => ['Brave', 'Gregarious', 'Gallant', 'Tourney Knight', 'Prideful'].includes(t));
  const tournamentAndPageantry =
    ruler.isImprisoned || ruler.isBanished || isClergyChar || personallyHeld.length === 0
      ? 0
      : (ruler.titleTier === 'King' || ruler.titleTier === 'Emperor'
          ? 0.45
          : ruler.titleTier === 'Duke'
          ? 0.35
          : ruler.titleTier === 'Count'
          ? 0.18
          : 0.08) *
        (isChivalricChar ? 1.3 : 1.0) *
        austerityCourtMult *
        expenseInflationMult;

  // 4D. MONTHLY FLUCTUATING OUTLAYS & STOCHASTIC SHOCKS (Realistic swings without instant bankruptcy)
  const yearNum = world.currentYear || 1000;
  const monthNum = world.month || 1;
  let hash = 2166136261;
  const hashKey = `${ruler.id}_${yearNum}_${monthNum}`;
  for (let i = 0; i < hashKey.length; i++) {
    hash ^= hashKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const unitRoll = ((hash >>> 0) % 1000) / 1000;
  const grossInflow = demesne + tribute + tariffs;
  const scaleRef = Math.max(1.5, grossInflow * 0.18 + effectiveCourtBase * 0.25);

  let seasonalShockExpense = 0;
  let seasonalExpenseLabel = 'Routine Household Accounts';
  if (
    !ruler.isImprisoned &&
    !ruler.isBanished &&
    (personallyHeld.length > 0 || ruler.role === 'Monarch' || ruler.titleTier === 'Duke' || ruler.titleTier === 'Count')
  ) {
    if (unitRoll < 0.12) {
      const spikeLabels = [
        'Emergency Keep & Curtain-Wall Repairs',
        'Grand Court Banquet & Minstrel Patronage',
        'Famine Relief & Parish Grain Alms',
        'Tax Collector Pilferage & Audit Loss',
        'Tournament Prizes & Heraldic Pageantry',
        'Manorial Legal Fees & Bailiff Disputes',
      ];
      seasonalExpenseLabel = spikeLabels[Math.floor(unitRoll * 100) % spikeLabels.length];
      seasonalShockExpense = scaleRef * (0.6 + (unitRoll / 0.12) * 0.4) * traitSpendMult * stanceMult;
    } else if (season === 'Winter') {
      seasonalExpenseLabel = 'Winter Provisions, Fuel & Garrison Furs';
      seasonalShockExpense = scaleRef * (0.25 + unitRoll * 0.2) * stanceMult;
    } else if (season === 'Spring') {
      seasonalExpenseLabel = unitRoll > 0.55 ? 'Spring Road, Bridge & Mill Repairs' : 'Vernal Hunt, Hounds & Falcons';
      seasonalShockExpense = scaleRef * (0.11 + unitRoll * 0.16) * stanceMult;
    } else if (season === 'Summer') {
      seasonalExpenseLabel = unitRoll > 0.5 ? 'Hospitality for Bishops & Envoys' : 'Royal Progress & Retinue Provisions';
      seasonalShockExpense = scaleRef * (0.12 + unitRoll * 0.18) * stanceMult;
    } else {
      seasonalExpenseLabel = unitRoll > 0.5 ? 'Harvest Festival & Wine Cellar Stocking' : 'Autumn Granary & Wool Liveries';
      seasonalShockExpense = scaleRef * (0.13 + unitRoll * 0.16) * stanceMult;
    }
    seasonalShockExpense *= austerityShockMult * expenseInflationMult;
  }

  // 4E. PROGRESSIVE VAULT HOARDING DRAG & RESERVE CAP (Prevents unbounded linear treasury growth)
  let vaultHoardingDrag = 0;
  if (currentReserves > vaultCap * 0.72) {
    const overSoft = currentReserves - vaultCap * 0.72;
    vaultHoardingDrag = overSoft * 0.015;
  }
  if (currentReserves > vaultCap) {
    const overHard = currentReserves - vaultCap;
    vaultHoardingDrag += overHard * 0.05;
  }

  // 5. DEBT SERVICING
  const myLoans = economy.bankInstitutions
    .flatMap((b) => b.activeLoans)
    .filter((l) => l.borrowerId === ruler.id && !l.isDefaulted);

  const debtServicing = myLoans.reduce((acc, l) => {
    const monthlyInterest = (l.remainingBalance * l.annualInterestRate) / 12;
    const monthlyPrincipal = l.remainingBalance / Math.max(1, l.monthsRemaining);
    return acc + monthlyInterest + monthlyPrincipal;
  }, 0);

  const totalDemesne = demesne + courtStipend;
  const totalRevenue = Math.round((totalDemesne + tribute + tariffs) * 10) / 10;
  const totalExpenses =
    Math.round(
      (armyUpkeep +
        navalTransportUpkeep +
        courtSplendorCost +
        estateMaintenance +
        estateAdministration +
        householdUpkeep +
        scutageAndAidsExpense +
        youngerSonsAndDowries +
        religiousPatronage +
        tournamentAndPageantry +
        seasonalShockExpense +
        vaultHoardingDrag +
        debtServicing +
        tributeOwedToLiege) *
        10
    ) / 10;
  const netMonthlyCashflow = Math.round((totalRevenue - totalExpenses) * 10) / 10;

  return {
    entityId: ruler.id,
    demesneIncome: Math.round(totalDemesne * 10) / 10,
    vassalTribute: Math.round(tribute * 10) / 10,
    tariffIncome: Math.round(tariffs * 10) / 10,
    totalRevenue,
    armyUpkeep: Math.round(armyUpkeep * 10) / 10,
    navalTransportUpkeep: Math.round(navalTransportUpkeep * 10) / 10,
    courtSplendorCost: Math.round(courtSplendorCost * 10) / 10,
    estateMaintenance: Math.round(estateMaintenance * 10) / 10,
    estateAdministration: Math.round(estateAdministration * 10) / 10,
    householdUpkeep: Math.round(householdUpkeep * 10) / 10,
    scutageAndAidsExpense: Math.round(scutageAndAidsExpense * 10) / 10,
    youngerSonsAndDowries: Math.round(youngerSonsAndDowries * 10) / 10,
    religiousPatronage: Math.round(religiousPatronage * 10) / 10,
    tournamentAndPageantry: Math.round(tournamentAndPageantry * 10) / 10,
    seasonalShockExpense: Math.round(seasonalShockExpense * 10) / 10,
    seasonalExpenseLabel,
    vaultHoardingDrag: Math.round(vaultHoardingDrag * 10) / 10,
    surplusReinvested: 0,
    debtServicing: Math.round(debtServicing * 10) / 10,
    totalExpenses,
    netMonthlyCashflow,
    treasuryReserves: ruler.treasury || 0,
    vaultCap,
    fiscalStance,
    austerityTier,
    coinPurity,
    inflationFactor,
    // Closed circuit tracking
    retainedFiefReserves: Math.round(totalFiefCoffers),
    wagesInjectedLocally:
      Math.round(
        (armyUpkeep * 0.85 +
          courtSplendorCost * 0.65 +
          estateMaintenance * 0.8 +
          estateAdministration * 0.85 +
          householdUpkeep * 0.7 +
          religiousPatronage * 0.7 +
          tournamentAndPageantry * 0.75 +
          seasonalShockExpense * 0.6) *
          10
      ) / 10,
    fiefSolvencyRatio:
      totalFiefCoffers > 300
        ? 1.0
        : Math.max(0.15, Math.round((totalFiefCoffers / 300) * 100) / 100),
    tributeOwedToLiege: Math.round(tributeOwedToLiege * 10) / 10,
  };
}

export function getDefaultVaultCap(char: Character): number {
  if (char.titleTier === 'Emperor') return 5000;
  if (char.titleTier === 'King' || char.role === 'Monarch') return 3200;
  if (char.titleTier === 'Duke' || char.role === 'Vassal Duke') return 1600;
  if (char.titleTier === 'Count' || char.role === 'Vassal Count') return 850;
  if (char.titleTier === 'Baron' || char.titleTier === 'Mayor') return 450;
  return 220;
}

export function disburseTreasuryAction(
  char: Character,
  action: 'feast' | 'public_works' | 'alms' | 'tournament' | 'monastery',
  world: WorldState
): { success: boolean; summary: string } {
  const reserves = Math.max(0, char.treasury || 0);
  const heldBurgs = (world.burgs || []).filter((b) => b.ownerId === char.id);

  if (action === 'feast') {
    const cost = Math.round(Math.min(220, Math.max(45, reserves * 0.22)));
    if (reserves < cost) return { success: false, summary: `Requires at least ${cost}g in treasury to host a Grand Feast.` };
    char.treasury = Math.round((reserves - cost) * 10) / 10;
    char.prestige = (char.prestige || 100) + 38;
    char.stress = Math.max(0, (char.stress || 0) - 25);
    for (const v of world.characters || []) {
      if (v.isAlive && v.liegeId === char.id) {
        v.loyalty = Math.min(100, (v.loyalty ?? 55) + 8);
      }
    }
    return {
      success: true,
      summary: `${char.name} hosted a Grand Feast for ${cost}g (+38 Prestige, -25 Stress, +8 Vassal Loyalty).`,
    };
  }

  if (action === 'public_works') {
    const cost = Math.round(Math.max(1, heldBurgs.length) * 220 + Math.min(450, reserves * 0.20));
    if (reserves < cost) return { success: false, summary: `Requires at least ${cost}g to fund Civic Public Works.` };
    char.treasury = Math.round((reserves - cost) * 10) / 10;
    if (heldBurgs.length > 0) {
      const share = cost / heldBurgs.length;
      for (const b of heldBurgs) {
        b.treasury = Math.round(((b.treasury || 0) + share * 0.35) * 10) / 10;
        b.developmentLevel = Math.min(100, (b.developmentLevel || 25) + 1);
        b.unrest = Math.max(0, (b.unrest || 0) - 8);
      }
    }
    char.prestige = (char.prestige || 100) + 22;
    return {
      success: true,
      summary: `${char.name} invested ${cost}g in Civic Public Works across ${heldBurgs.length || 1} fief(s) (+1 Dev, -8 Unrest).`,
    };
  }

  if (action === 'tournament') {
    const tierFloor = char.titleTier === 'King' || char.titleTier === 'Emperor' ? 95 : char.titleTier === 'Duke' ? 65 : 40;
    const cost = Math.round(Math.min(260, Math.max(tierFloor, reserves * 0.24)));
    if (reserves < cost) {
      return { success: false, summary: `Requires at least ${cost}g to host a Chivalric Tournament.` };
    }
    char.treasury = Math.round((reserves - cost) * 10) / 10;
    char.prestige = (char.prestige || 100) + 45;
    char.stress = Math.max(0, (char.stress || 0) - 18);
    for (const v of world.characters || []) {
      if (v.isAlive && (v.liegeId === char.id || (char.realmId && v.realmId === char.realmId && v.id !== char.id))) {
        v.opinions = v.opinions || {};
        v.opinions[char.id] = Math.min(100, (v.opinions[char.id] ?? 15) + 6);
      }
    }
    if (heldBurgs.length > 0) {
      const host = heldBurgs[0];
      const nextT = Math.round(((host.treasury || 0) + cost * 0.4) * 10) / 10;
      host.treasury = nextT;
      const mkt = world.economy?.burgMarkets?.[host.id];
      if (mkt) mkt.treasury = nextT;
    }
    return {
      success: true,
      summary: `${char.name} hosted a Grand Tournament for ${cost}g (+45 Prestige, -18 Stress, +6 Realm Opinion).`,
    };
  }

  if (action === 'monastery') {
    const cost = Math.round(Math.min(210, Math.max(50, reserves * 0.2)));
    if (reserves < cost) {
      return { success: false, summary: `Requires at least ${cost}g to endow a Chantry & Monastery.` };
    }
    char.treasury = Math.round((reserves - cost) * 10) / 10;
    char.piety = (char.piety || 50) + 55;
    char.prestige = (char.prestige || 100) + 15;
    for (const v of world.characters || []) {
      if (v.isAlive && v.realmId === char.realmId && (v.role === 'Court Chaplain' || v.isMonk || (v.v17Traits || []).includes('Zealous'))) {
        v.opinions = v.opinions || {};
        v.opinions[char.id] = Math.min(100, (v.opinions[char.id] ?? 15) + 15);
      }
    }
    if (heldBurgs.length > 0) {
      const host = heldBurgs[0];
      host.unrest = Math.max(0, (host.unrest || 0) - 6);
      const nextT = Math.round(((host.treasury || 0) + cost * 0.35) * 10) / 10;
      host.treasury = nextT;
      const mkt = world.economy?.burgMarkets?.[host.id];
      if (mkt) mkt.treasury = nextT;
    }
    return {
      success: true,
      summary: `${char.name} endowed a Monastery & Chantry for ${cost}g (+55 Piety, +15 Clergy Opinion).`,
    };
  }

  // action === 'alms'
  const cost = Math.round(Math.min(160, Math.max(35, reserves * 0.18)));
  if (reserves < cost) return { success: false, summary: `Requires at least ${cost}g to distribute Royal Alms.` };
  char.treasury = Math.round((reserves - cost) * 10) / 10;
  char.piety = (char.piety || 50) + 30;
  for (const b of heldBurgs) {
    b.unrest = Math.max(0, (b.unrest || 0) - 14);
    b.treasury = Math.round(((b.treasury || 0) + (cost * 0.75) / Math.max(1, heldBurgs.length)) * 10) / 10;
  }
  return {
    success: true,
    summary: `${char.name} distributed ${cost}g in Parish Alms & Grain Relief (+30 Piety, -14 Unrest).`,
  };
}

export function getRealmGDP(realmId: string, world: WorldState): number {
  const realmBurgs = (world.burgs || []).filter((b) => b.stateId === realmId);
  if (realmBurgs.length === 0) return 120;
  return realmBurgs.reduce((acc, b) => {
    const rev = b.economicLedger?.totalRevenue ?? Math.max(20, (b.developmentLevel || 25) * 1.35);
    return acc + rev;
  }, 0);
}

export function getRealmChanceryEfficiency(
  realmId: string,
  world: WorldState
): { taxEfficiency: number; reformSpeedMult: number; paperCoverage: number } {
  const economy = world.economy;
  if (!economy?.burgMarkets) {
    return { taxEfficiency: 1.0, reformSpeedMult: 1.0, paperCoverage: 0.6 };
  }
  const realmBurgs = (world.burgs || []).filter((b) => b.stateId === realmId);
  if (realmBurgs.length === 0) {
    return { taxEfficiency: 1.0, reformSpeedMult: 1.0, paperCoverage: 0.6 };
  }

  let totalWeight = 0;
  let weightedCov = 0;
  for (const b of realmBurgs) {
    const mkt = economy.burgMarkets[b.id];
    if (!mkt) continue;
    const paperM = mkt.markets['Paper & Codices'];
    const vellumM = mkt.markets['Parchment & Vellum'];
    const paperNeed = Math.max(1, (paperM?.monthlyConsumption || 2) * 2);
    const vellumNeed = Math.max(1, (vellumM?.monthlyConsumption || 2) * 2);
    const pRatio = paperM ? Math.min(1.0, paperM.stockpile / paperNeed) : 0.5;
    const vRatio = vellumM ? Math.min(1.0, vellumM.stockpile / vellumNeed) : 0.5;
    const cov = pRatio * 0.6 + vRatio * 0.4;
    const w = b.isCapital ? 2.5 : 1.0;
    weightedCov += cov * w;
    totalWeight += w;
  }

  const paperCoverage = totalWeight > 0 ? Math.max(0, Math.min(1.0, weightedCov / totalWeight)) : 0.6;
  const taxEfficiency = Math.round((0.78 + (1.15 - 0.78) * paperCoverage) * 1000) / 1000;
  const reformSpeedMult =
    paperCoverage >= 0.65
      ? 1.25
      : Math.round((0.90 + 0.35 * (paperCoverage / 0.65)) * 1000) / 1000;

  return { taxEfficiency, reformSpeedMult, paperCoverage };
}

export function ensureRealmBudget(realm: Realm, world: WorldState): RealmBudgetState {
  if (realm.treasury === undefined || Number.isNaN(realm.treasury)) {
    const realmBurgs = (world.burgs || []).filter((b) => b.stateId === realm.id);
    const ruler = world.characters?.find((c) => c.id === realm.rulerId);
    realm.treasury = Math.max(
      120,
      Math.round(realmBurgs.reduce((acc, b) => acc + (b.developmentLevel || 20) * 1.4, 80) + (ruler?.treasury || 120) * 0.25)
    );
  }
  if (!realm.budget) {
    realm.budget = {
      taxPolicy: 'Normal',
      armyMaintenanceRate: 1.0,
      bankruptcyUntilYear: 0,
      domesticDebtOwed: 0,
      lastReport: {
        domainTax: 0,
        vassalTax: 0,
        scutageAndAidsIncome: 0,
        customsTariffs: 0,
        mintingIncome: 0,
        civilListStipend: 0,
        armyMaintenance: 0,
        castleAndGarrisonUpkeep: 0,
        armsAndSuppliesUpkeep: 0,
        ransomsPaid: 0,
        administrationAndJustice: 0,
        diplomacyAndPatronage: 0,
        religiousPatronage: 0,
        buildingSubsidies: 0,
        loanInterest: 0,
        netBalance: 0,
      },
      pendingCycleTotals: {},
    };
  }
  if (!realm.budget.lastReport) {
    realm.budget.lastReport = {
      domainTax: 0,
      vassalTax: 0,
      scutageAndAidsIncome: 0,
      customsTariffs: 0,
      mintingIncome: 0,
      civilListStipend: 0,
      armyMaintenance: 0,
      castleAndGarrisonUpkeep: 0,
      armsAndSuppliesUpkeep: 0,
      ransomsPaid: 0,
      administrationAndJustice: 0,
      diplomacyAndPatronage: 0,
      religiousPatronage: 0,
      buildingSubsidies: 0,
      loanInterest: 0,
      netBalance: 0,
    };
  }
  if (!realm.budget.pendingCycleTotals) {
    realm.budget.pendingCycleTotals = {};
  }
  return realm.budget;
}

export function recordRealmBudgetExtra(
  realm: Realm | undefined,
  world: WorldState,
  field:
    | 'scutageAndAidsIncome'
    | 'ransomsPaid'
    | 'administrationAndJustice'
    | 'diplomacyAndPatronage'
    | 'religiousPatronage'
    | 'buildingSubsidies',
  amount: number
): void {
  if (!realm || amount <= 0) return;
  const budget = ensureRealmBudget(realm, world);
  budget.pendingCycleTotals = budget.pendingCycleTotals || {};
  budget.pendingCycleTotals[field] = Math.round(((budget.pendingCycleTotals[field] || 0) + amount) * 10) / 10;
  budget.lastReport[field] = Math.round(((budget.lastReport[field] || 0) + amount) * 10) / 10;
}

export function executeCrownBudgetAction(
  realmId: string,
  action: 'royal_assizes' | 'endow_abbey' | 'patronize_nobles',
  world: WorldState
): { success: boolean; message: string } {
  const realm = world.realms?.find((r) => r.id === realmId);
  if (!realm) return { success: false, message: 'Realm not found.' };
  ensureRealmBudget(realm, world);
  const crownGold = Math.max(0, realm.treasury || 0);
  const monarch = world.characters?.find((c) => c.id === realm.rulerId && c.isAlive);
  const realmBurgs = (world.burgs || []).filter((b) => b.stateId === realm.id);

  if (action === 'royal_assizes') {
    const cost = Math.round(Math.max(70, realmBurgs.length * 14));
    if (crownGold < cost) {
      return { success: false, message: `Insufficient Crown Fisc: Itinerant Royal Assizes require ${cost}g.` };
    }
    realm.treasury = Math.round((crownGold - cost) * 10) / 10;
    for (const b of realmBurgs) {
      b.unrest = Math.max(0, (b.unrest || 0) - 10);
    }
    if (monarch) monarch.prestige = (monarch.prestige || 100) + 20;
    recordRealmBudgetExtra(realm, world, 'administrationAndJustice', cost);
    return {
      success: true,
      message: `Dispatched Royal Judges & Circuit Assizes across ${realm.name} for ${cost}g (-10 Unrest across fiefs, +20 Prestige).`,
    };
  }

  if (action === 'endow_abbey') {
    const cost = Math.round(Math.min(260, Math.max(85, crownGold * 0.16)));
    if (crownGold < cost) {
      return { success: false, message: `Insufficient Crown Fisc: Endowing a Royal Abbey requires ${cost}g.` };
    }
    realm.treasury = Math.round((crownGold - cost) * 10) / 10;
    if (monarch) {
      monarch.piety = (monarch.piety || 50) + 65;
      monarch.prestige = (monarch.prestige || 100) + 20;
    }
    for (const c of world.characters || []) {
      if (c.isAlive && c.realmId === realm.id && (c.role === 'Court Chaplain' || c.isMonk || (c.v17Traits || []).includes('Zealous'))) {
        c.opinions = c.opinions || {};
        if (monarch) c.opinions[monarch.id] = Math.min(100, (c.opinions[monarch.id] ?? 15) + 18);
      }
    }
    recordRealmBudgetExtra(realm, world, 'religiousPatronage', cost);
    return {
      success: true,
      message: `Endowed a Royal Abbey & Chantry in ${realm.name} for ${cost}g (+65 Piety, +18 Clergy Opinion).`,
    };
  }

  // patronize_nobles
  const vassals = (world.characters || []).filter(
    (c) => c.isAlive && c.realmId === realm.id && c.id !== realm.rulerId && (c.titleTier === 'Duke' || c.titleTier === 'Count')
  );
  const cost = Math.round(Math.max(80, Math.min(240, vassals.length * 35 || 80)));
  if (crownGold < cost) {
    return { success: false, message: `Insufficient Crown Fisc: Patronizing Barons requires ${cost}g.` };
  }
  realm.treasury = Math.round((crownGold - cost) * 10) / 10;
  if (vassals.length > 0) {
    const giftShare = Math.round((cost * 0.7 / vassals.length) * 10) / 10;
    for (const v of vassals) {
      v.treasury = Math.round(((v.treasury || 0) + giftShare) * 10) / 10;
      v.loyalty = Math.min(100, (v.loyalty ?? 55) + 10);
      if (monarch) {
        v.opinions = v.opinions || {};
        v.opinions[monarch.id] = Math.min(100, (v.opinions[monarch.id] ?? 15) + 14);
      }
    }
  }
  if (monarch) monarch.prestige = (monarch.prestige || 100) + 25;
  recordRealmBudgetExtra(realm, world, 'diplomacyAndPatronage', cost);
  return {
    success: true,
    message: `Bestowed ${cost}g in Royal Patronage, Warhorses & Favors upon ${vassals.length || 'court'} noble(s) (+10 Loyalty, +14 Opinion).`,
  };
}

export function getTaxPolicyMultipliers(policy: TaxPolicy): { taxMult: number; unrestDelta: number; opinionDelta: number } {
  switch (policy) {
    case 'Low':
      return { taxMult: 0.72, unrestDelta: -1.2, opinionDelta: 0.4 };
    case 'High':
      return { taxMult: 1.28, unrestDelta: 1.2, opinionDelta: -0.5 };
    case 'Extortionate':
      return { taxMult: 1.55, unrestDelta: 2.8, opinionDelta: -1.4 };
    case 'Normal':
    default:
      return { taxMult: 1.0, unrestDelta: 0, opinionDelta: 0 };
  }
}

export function takeDomesticRealmLoan(
  realmId: string,
  world: WorldState,
  requestedAmount?: number
): { success: boolean; message: string; amountBorrowed: number } {
  const realm = world.realms?.find((r) => r.id === realmId);
  if (!realm) return { success: false, message: 'Realm not found.', amountBorrowed: 0 };
  const budget = ensureRealmBudget(realm, world);
  if (budget.bankruptcyUntilYear > world.currentYear) {
    return {
      success: false,
      message: `Crown Credit Suspended: ${realm.name} is in Crown Bankruptcy until ${budget.bankruptcyUntilYear}.`,
      amountBorrowed: 0,
    };
  }

  const gdp = getRealmGDP(realmId, world);
  const loanUnit = Math.max(60, Math.round(gdp * 0.45));
  const maxLoans = Math.max(3, Math.floor(gdp / 40));
  const creditLimit = loanUnit * maxLoans;
  const availableHeadroom = Math.max(0, creditLimit - budget.domesticDebtOwed);
  const amount = Math.min(availableHeadroom, requestedAmount ? Math.max(10, Math.round(requestedAmount)) : loanUnit);

  if (amount <= 0) {
    return {
      success: false,
      message: `Domestic Credit Exhausted (${Math.round(budget.domesticDebtOwed)}g / ${Math.round(creditLimit)}g limit across ${maxLoans} bonds).`,
      amountBorrowed: 0,
    };
  }

  // Draw real bullion from liquid municipal/merchant pools inside the realm
  const economy = ensureEconomy(world);
  const realmBurgs = (world.burgs || []).filter((b) => b.stateId === realmId);
  let mobilized = 0;
  for (const b of realmBurgs) {
    if (mobilized >= amount) break;
    const bMkt = economy.burgMarkets?.[b.id];
    const mktTreasury = bMkt?.treasury ?? b.treasury ?? 0;
    const reserveFloor = (bMkt?.workingCapitalFloat ?? 120) * 0.45;
    const lendable = Math.max(0, mktTreasury - reserveFloor);
    const take = Math.min(amount - mobilized, lendable);
    if (take > 0) {
      const nextT = Math.round((mktTreasury - take) * 10) / 10;
      b.treasury = nextT;
      if (bMkt) bMkt.treasury = nextT;
      mobilized += take;
    }
  }

  // If towns lack enough excess bullion, domestic merchant guilds underwrite up to remaining credit capacity
  const granted = Math.max(mobilized, Math.round(amount * 0.85));
  budget.domesticDebtOwed = Math.round((budget.domesticDebtOwed + granted) * 10) / 10;
  realm.treasury = Math.round(((realm.treasury || 0) + granted) * 10) / 10;

  return {
    success: true,
    message: `Issued ${granted}g Domestic Crown Bond (Total Debt: ${budget.domesticDebtOwed}g / ${creditLimit}g).`,
    amountBorrowed: granted,
  };
}

export function repayDomesticRealmLoan(
  realmId: string,
  world: WorldState,
  requestedAmount?: number
): { success: boolean; message: string; amountRepaid: number } {
  const realm = world.realms?.find((r) => r.id === realmId);
  if (!realm) return { success: false, message: 'Realm not found.', amountRepaid: 0 };
  const budget = ensureRealmBudget(realm, world);
  if (budget.domesticDebtOwed <= 0) {
    return { success: false, message: 'No domestic Crown debt is currently owed.', amountRepaid: 0 };
  }

  const crownGold = Math.max(0, realm.treasury || 0);
  const target = requestedAmount ? Math.min(budget.domesticDebtOwed, requestedAmount) : budget.domesticDebtOwed;
  const pay = Math.min(crownGold, target);
  if (pay < 1) {
    return { success: false, message: 'Insufficient gold in Crown Fisc to repay principal.', amountRepaid: 0 };
  }

  realm.treasury = Math.round((crownGold - pay) * 10) / 10;
  budget.domesticDebtOwed = Math.round(Math.max(0, budget.domesticDebtOwed - pay) * 10) / 10;

  // Return repaid liquidity proportionally to realm municipal markets
  const economy = ensureEconomy(world);
  const realmBurgs = (world.burgs || []).filter((b) => b.stateId === realmId);
  if (realmBurgs.length > 0) {
    const share = pay / realmBurgs.length;
    for (const b of realmBurgs) {
      const bMkt = economy.burgMarkets?.[b.id];
      const nextT = Math.round(((bMkt?.treasury ?? b.treasury ?? 0) + share) * 10) / 10;
      b.treasury = nextT;
      if (bMkt) bMkt.treasury = nextT;
    }
  }

  return {
    success: true,
    message: `Repaid ${Math.round(pay)}g of domestic Crown debt (Remaining: ${Math.round(budget.domesticDebtOwed)}g).`,
    amountRepaid: pay,
  };
}

export function contributePersonalGoldToCrown(
  realmId: string,
  world: WorldState,
  amount: number
): { success: boolean; message: string } {
  const realm = world.realms?.find((r) => r.id === realmId);
  const monarch = world.characters?.find((c) => c.id === realm?.rulerId);
  if (!realm || !monarch) return { success: false, message: 'Sovereign or realm not found.' };
  const transfer = Math.max(0, Math.round(amount));
  if (transfer <= 0) return { success: false, message: 'Enter a positive gold amount.' };
  if ((monarch.treasury || 0) < transfer) {
    return { success: false, message: `Personal Privy Purse only holds ${Math.round(monarch.treasury || 0)}g.` };
  }
  ensureRealmBudget(realm, world);
  monarch.treasury = Math.round(((monarch.treasury || 0) - transfer) * 10) / 10;
  realm.treasury = Math.round(((realm.treasury || 0) + transfer) * 10) / 10;
  monarch.prestige = (monarch.prestige || 100) + Math.min(25, Math.round(transfer / 20));
  return {
    success: true,
    message: `${monarch.name} contributed ${transfer}g from Privy Purse to the Crown Fisc of ${realm.name}.`,
  };
}

export function initEconomyState(world: WorldState): EconomyState {
  const burgMarkets: Record<string, BurgMarket> = {};
  const realmCoinPurity: Record<string, number> = {};
  for (const realm of world.realms || []) {
    realmCoinPurity[realm.id] = 1.0;
    ensureRealmBudget(realm, world);
  }

  for (const burg of world.burgs || []) {
    const defaultFloat = Math.max(120, Math.round((burg.developmentLevel || 30) * 8 + (burg.population || 3000) * 0.018));
    if (burg.treasury === undefined) {
      burg.treasury = Math.max(180, Math.round((burg.developmentLevel || 30) * 14 + (burg.population || 5000) * 0.032));
    }
    if (burg.tradeGood) {
      burg.tradeGood = canonicalizeTradeGood(burg.tradeGood);
    }
    const bMarket = createDefaultBurgMarket(burg.id, burg.name, defaultFloat);
    bMarket.treasury = burg.treasury;
    bMarket.workingCapitalFloat = defaultFloat;
    const coinPurity = realmCoinPurity[burg.stateId] ?? 1.0;
    syncBurgStructuralMarkets(burg, bMarket, world, true, 1.0 / Math.max(0.2, coinPurity));
    burgMarkets[burg.id] = bMarket;
    updateSocioeconomicStrata(burg, bMarket, world);
  }

  const bankInstitutions = createDefaultBanks();
  const fiscalProfiles: Record<string, FiscalProfile> = {};

  const tempEconomy: EconomyState = {
    burgMarkets,
    bankInstitutions,
    fiscalProfiles,
    realmCoinPurity,
    totalTradeFlowVolume: 350,
    lootedCaravansCount: 0,
  };

  for (const realm of world.realms || []) {
    const ruler = world.characters?.find((c) => c.id === realm.rulerId);
    if (ruler) {
      fiscalProfiles[ruler.id] = calculateFiscalProfile(ruler, world, tempEconomy);
    }
  }

  const totalVolume = Object.values(burgMarkets).reduce((acc, m) => acc + (m.totalMarketVolume || 0), 0);
  tempEconomy.totalTradeFlowVolume = Math.max(320, Math.round(totalVolume * 0.02));

  world.economy = tempEconomy;
  world.burgMarkets = burgMarkets;
  world.fiscalProfiles = fiscalProfiles;

  tempEconomy.realmCurrencies = createDefaultRealmCurrencies(world);

  return tempEconomy;
}

export function ensureEconomy(world: WorldState): EconomyState {
  if (!world.economy) {
    return initEconomyState(world);
  }
  if (!world.economy.realmCurrencies) {
    world.economy.realmCurrencies = createDefaultRealmCurrencies(world);
  }
  const activeCommodities = getActiveCommodities();

  // Save-backfill Realm Crown Fisc & Budget State
  for (const realm of world.realms || []) {
    ensureRealmBudget(realm, world);
  }

  // Save-backfill BurgMarket treasury, workingCapitalFloat, and the 10 new commodities
  for (const burg of world.burgs || []) {
    if (burg.tradeGood) {
      burg.tradeGood = canonicalizeTradeGood(burg.tradeGood);
    }
    const defaultFloat = Math.max(120, Math.round((burg.developmentLevel || 30) * 8 + (burg.population || 3000) * 0.018));
    if (burg.treasury === undefined) {
      burg.treasury = Math.max(180, Math.round((burg.developmentLevel || 30) * 14 + (burg.population || 5000) * 0.032));
    }
    let bMarket = world.economy.burgMarkets[burg.id];
    if (!bMarket) {
      bMarket = createDefaultBurgMarket(burg.id, burg.name, defaultFloat);
      bMarket.treasury = burg.treasury;
      world.economy.burgMarkets[burg.id] = bMarket;
    }
    if (bMarket.workingCapitalFloat === undefined) {
      bMarket.workingCapitalFloat = defaultFloat;
    }
    if (bMarket.treasury === undefined) {
      bMarket.treasury = burg.treasury;
    }
    for (const [key, meta] of Object.entries(activeCommodities)) {
      const comm = key as CommodityType;
      if (!bMarket.markets[comm]) {
        bMarket.markets[comm] = {
          commodity: comm,
          basePrice: meta.basePrice,
          currentPrice: meta.basePrice,
          lastMonthPrice: meta.basePrice,
          stockpile: 24 + Math.floor(Math.random() * 14),
          maxStockpileCapacity: 1200,
          monthlyProduction: 4,
          monthlyConsumption: 4,
          elasticity: meta.defaultElasticity,
          priceFloor: meta.priceFloor,
          priceCeiling: meta.priceCeiling,
        };
      }
    }
  }

  return world.economy;
}

// ============================================================================
// 5. BANK LOANS, DEFAULTS & PATRICIAN LEVERAGE
// ============================================================================

export function takeBankLoan(
  world: WorldState,
  bankId: string,
  borrowerId: string,
  principal: number
): { success: boolean; message: string; loan?: BankLoan } {
  const economy = ensureEconomy(world);
  const bank = economy.bankInstitutions.find((b) => b.id === bankId);
  const borrower = world.characters?.find((c) => c.id === borrowerId);

  if (!bank || !borrower) {
    return { success: false, message: 'Invalid bank or borrower entity.' };
  }

  if (bank.treasury < principal || !bank.isSolvent) {
    return { success: false, message: `${bank.name} does not hold sufficient vault bullion to underwrite this indenture.` };
  }

  bank.treasury -= principal;
  borrower.treasury = (borrower.treasury || 0) + principal;

  const loan: BankLoan = {
    id: generateUniqueId('loan'),
    bankName: bank.name,
    bankId: bank.id,
    borrowerId,
    principal,
    remainingBalance: principal,
    annualInterestRate: bank.baseInterestRate,
    monthsRemaining: 36,
    isDefaulted: false,
    patricianHookGranted: false,
  };

  bank.activeLoans.push(loan);

  return {
    success: true,
    message: `DEBT INDENTURE SEALED: Borrowed ${principal} gold from ${bank.name} at ${(bank.baseInterestRate * 100).toFixed(0)}% annual interest.`,
    loan,
  };
}
// ============================================================================
// STRUCTURAL SUPPLY & DEMAND ENGINE (62 COMMODITIES, CLIMATE-LOCKED EXTRACTION)
// ============================================================================

export interface SupplyDemandResult {
  production: number;
  consumption: number;
}

export function calculateStructuralSupplyAndDemand(
  burg: Burg,
  world: WorldState
): Record<CommodityType, SupplyDemandResult> {
  const result = {} as Record<CommodityType, SupplyDemandResult>;

  // 1. Gather Municipal & Climate Context
  const cell = world.cells?.find((c) => c.index === burg.cellIndex) || world.cells?.[0];
  const dev = burg.developmentLevel || 30;
  const pop = burg.population < 50 ? Math.round(burg.population * 1000) : (burg.population || 2500);
  const popK = Math.max(0.25, pop / 1000);
  const buildings = burg.buildings || [];
  const hasBuildingFamily = (keywords: string[]) =>
    buildings.some((b) => keywords.some((kw) => b.toLowerCase().includes(kw)));

  const hasGuild = hasBuildingFamily(['guild', 'bourse', 'exchange', 'bank']);
  const hasMill = hasBuildingFamily(['mill', 'granary', 'silo']);
  const hasFoundry = hasBuildingFamily(['foundry', 'armory', 'smithy', 'forge']);
  const hasKeep = hasBuildingFamily(['keep', 'citadel', 'bastion', 'wall']);
  const hasWonder = hasBuildingFamily(['wonder', 'cathedral', 'monastery']);

  const season = world.currentSeason || 'Summer';
  const leviesRaised = Boolean(burg.leviesRaised);
  const biomeStr = cell?.biome || '';
  const cli = classifyClimateFlags({
    biome: biomeStr,
    elevation: cell?.elevation ?? 0.35,
    temperature: cell?.temperature,
    moisture: cell?.moisture,
    isCoast: Boolean(cell?.isCoast || burg.type.includes('Port')),
    isRiver: cell?.isRiver,
    reliefType: cell?.reliefType,
  });
  const isCoastal = Boolean(cli.isCoastal || burg.type.includes('Port'));
  const isMountain = Boolean(
    cli.isMountain ||
      burg.type === 'Mountain Hamlet' ||
      burg.type === 'Border Fortress'
  );
  const isHillsOrHighland = Boolean(cli.isHighland || isMountain);
  const isForest = cli.isForest;
  const isArid = cli.isDesert || cli.isSavanna || cli.isSteppe;
  const isWarm = cli.isWarm;
  const isWetland = cli.isWetland;
  const isRiver = cli.isRiver;
  const isAgrarian = burg.type === 'Farming Village' || burg.type === 'Market Town';
  const isUrbanHub =
    burg.type === 'Capital Citadel' || burg.type === 'Royal Metropolis' || burg.type === 'Trade Port';

  // 2. Warfare & Siege Modifiers
  const isUnderSiege = (world.activeSieges || []).some(
    (s) => s.holdingId === burg.id || s.holdingName.includes(burg.name)
  );
  const realmColor = world.realms.find((r) => r.id === burg.stateId)?.color;
  const realmArmies = (world.armies || []).filter((a) => a.color === realmColor);
  const atWar = realmArmies.length > 0 || isUnderSiege;

  // 3. Health & Plague Context
  const hasPlague = (world.epidemics || []).some((e) => e.infectedProvinceIds.includes(burg.countyId));

  // 4. Noble Court Splendor & Prestige
  const ruler = world.characters?.find((c) => c.id === burg.ownerId);
  const prestige = ruler?.prestige || 100;
  const isCapital = burg.isCapital;
  const weatherTradeMult = world.activeWeatherMod?.tradeFlowMult ?? 1.0;
  const tradePull = Math.min(
    1.8,
    Math.max(
      0.7,
      ((burg.tradeConnectivity || 1.0) * 0.8 + (burg.connectedRouteCount || 1) * 0.08) * weatherTradeMult
    )
  );

  // Winter Fuel Surge (+65% on heating & spirits)
  const winterHeatMult = season === 'Winter' ? 1.65 : 1.0;

  // Helper setter supporting climate-locked zero extraction
  const setFlow = (comm: CommodityType, prod: number, cons: number, minProd: number = 0.2) => {
    result[comm] = {
      production: Math.max(minProd, Math.round(prod * 10) / 10),
      consumption: Math.max(0.2, Math.round(cons * 10) / 10),
    };
  };

  // ==========================================================================
  // A. STAPLE SUSTENANCE, CASH CROPS & REFINED FOOD/DRINK (12 Commodities)
  // ==========================================================================
  const seasonHarvest =
    season === 'Winter' ? 0.35 : season === 'Autumn' ? 1.45 : season === 'Spring' ? 0.95 : 1.15;
  const laborMult = (leviesRaised ? 0.65 : 1.0) * (isUnderSiege ? 0.30 : 1.0);
  const millBoost = hasMill ? 1.22 : 1.0;
  const agrarianAreaBoost = isAgrarian ? 1.55 : isUrbanHub ? 0.72 : 1.1;
  const weatherHarvest = world.activeWeatherMod?.harvestMult ?? 1.0;
  const weatherLivestock = world.activeWeatherMod?.livestockMult ?? 1.0;
  const harvestMult = seasonHarvest * laborMult * millBoost * weatherHarvest;

  const hinterlandBoost = 1 + Math.min(3.2, popK * 0.042);
  const biomeGrainMult = cli.isTundra
    ? 0.18
    : cli.isDesert
    ? (isRiver ? 0.80 : 0.22)
    : cli.isTaiga
    ? 0.48
    : cli.isRainforest
    ? 0.62
    : isRiver
    ? 1.38
    : cli.isSteppe
    ? 1.05
    : 1.0;
  const baseFoodProd =
    (isMountain ? 5.2 : 9.8) *
    biomeGrainMult *
    harvestMult *
    agrarianAreaBoost *
    (0.65 + dev / 45) *
    hinterlandBoost;
  const effectivePopLoad = popK <= 24 ? popK : 24 + (popK - 24) * 0.36;
  const foodCons = Math.max(1.2, effectivePopLoad * (isUrbanHub ? 0.92 : 0.72) + (leviesRaised ? 1.5 : 0));

  setFlow('Grain', baseFoodProd * 1.35, foodCons * 1.15);
  setFlow('Livestock', (cli.isSteppe || cli.isSavanna ? 12.0 : isAgrarian ? 9.5 : cli.isTundra ? 4.5 : 6.0) * harvestMult * weatherLivestock, foodCons * 0.48);
  const fishSeaIcePenalty = world.activeWeather?.frozenSeaLanes ? 0.45 : 1.0;
  setFlow(
    'Dried Fish',
    isCoastal || isRiver ? (cli.isCold ? 18.0 : 14.5) * (season === 'Winter' ? 0.65 : 1.2) * fishSeaIcePenalty : 0,
    isCoastal ? foodCons * 0.38 : foodCons * 0.16,
    0
  );
  setFlow('Salt', isCoastal ? 14 : cli.isDesert ? 11.5 : isMountain ? 7 : 0.4, foodCons * 0.32 + (season === 'Autumn' ? 5.5 : 1.8));
  setFlow('Olive Oil', !isMountain && !cli.isCold && !cli.isDesert && !cli.isRainforest && !isWetland && isWarm ? 9.5 * harvestMult : 0, Math.min(12, popK * 0.16), 0);
  setFlow('Ale & Beer', (isCapital ? 26.0 : hasGuild || isUrbanHub ? 17.5 : 7.5) * Math.max(0.55, harvestMult), Math.min(18, popK * 0.24));
  setFlow('Cheese', (isMountain || isArid || isAgrarian ? 10.5 : 5.5) * Math.max(0.45, harvestMult * weatherLivestock), foodCons * 0.24);
  setFlow('Orchard Fruit', !isMountain && !cli.isTundra && !cli.isDesert ? 9.5 * (season === 'Autumn' ? 1.9 : season === 'Winter' ? 0.08 : 0.85) : 0, Math.min(12, popK * 0.18), 0);
  setFlow('Honey', isForest || (!isMountain && !cli.isTundra && !cli.isDesert) ? 8.0 * (season === 'Winter' ? 0.15 : 1.15) : 0.3, Math.min(9, popK * 0.12));
  setFlow('Herbs', isForest || isRiver || isWetland ? 9.5 : 1.8, hasPlague ? Math.min(28, popK * 0.9) + 4 : Math.min(11, popK * 0.18));
  // Climate-locked warm-latitude plantation & tavern spirit chain
  setFlow(
    'Cane Sugar',
    isWarm && !cli.isTundra && !cli.isTaiga && !isMountain && (!cli.isDesert || isRiver) && (cli.isRainforest || isCoastal || isRiver)
      ? (isCoastal || isRiver ? 12.5 : 8.5) * Math.max(0.45, harvestMult)
      : 0,
    Math.min(10, popK * 0.14) + (isCapital || isUrbanHub ? 2.8 : 0.6),
    0
  );
  setFlow(
    'Distilled Spirits',
    isUrbanHub || isCoastal || isCapital ? 10.5 : 3.5,
    (Math.min(10, popK * 0.14) + (isCoastal ? 3.0 : 0.8) + (hasPlague ? 2.5 : 0)) * winterHeatMult
  );

  // ==========================================================================
  // B. STRATEGIC METALLURGY, TOOLS, ARMS & GUNPOWDER (14 Commodities)
  // ==========================================================================
  const mineMult = isMountain ? 2.4 : isHillsOrHighland ? 1.25 : isUrbanHub ? 0.45 : 0.25;
  const warDemandMult = atWar || isUnderSiege || leviesRaised ? 2.4 : 1.0;

  setFlow(
    'Iron',
    12.5 * mineMult * (hasFoundry ? 1.25 : 1.0),
    (Math.min(16, popK * 0.28) + dev * 0.18 + (atWar ? 14 : 3)) * warDemandMult
  );
  setFlow('Copper', 9.0 * mineMult, Math.min(10, popK * 0.16) + dev * 0.15 + (hasGuild ? 4.5 : 1.5));
  setFlow('Tin', isHillsOrHighland ? 6.0 * mineMult : 0.4, 3.0 + (hasFoundry ? 4.5 : 1.0));
  setFlow(
    'Lead',
    isHillsOrHighland ? 7.5 * mineMult : 0.3,
    (isCapital || hasKeep ? 7 : 2) + (isUnderSiege ? 13 : 0) + (dev > 40 ? 3.5 : 1)
  );
  setFlow(
    'Coal',
    isHillsOrHighland ? 12.5 * mineMult : isForest ? 3.5 : 0.5,
    (4.5 + (hasFoundry ? 7 : 1.5) + dev * 0.08) * winterHeatMult
  );
  setFlow('Sulfur', isMountain ? 7.5 : 0, isUnderSiege ? 11 : atWar ? 5.5 : 1.4, 0);
  setFlow(
    'Saltpeter',
    isArid || (isWarm && isCoastal) ? 8.5 : isUrbanHub && dev > 45 ? 2.5 : 0,
    (atWar ? 7.0 : 1.5) + (isUnderSiege ? 6.0 : 0),
    0
  );
  setFlow(
    'Blackpowder',
    isCapital || hasFoundry || isUrbanHub ? 9.0 : 1.5,
    (isUnderSiege ? 12.0 : atWar ? 6.5 : 1.2) + (hasKeep ? 2.0 : 0)
  );
  setFlow(
    'Tools & Ironware',
    hasFoundry || isUrbanHub || isCapital ? 14.0 : 4.5,
    Math.max(2.0, Math.min(16, popK * 0.28) + dev * 0.14 + (isMountain ? 3.5 : 1.2))
  );
  setFlow(
    'Steel Arms & Armor',
    hasFoundry || isCapital ? 11.5 : isUrbanHub ? 6.0 : 1.2,
    (2.0 + (atWar ? 11.0 : 2.2) + (isUnderSiege ? 6.0 : 0)) * (leviesRaised ? 1.4 : 1.0)
  );
  setFlow(
    'Bronze & Brassware',
    hasFoundry || isUrbanHub || isCapital ? 10.0 : 2.5,
    2.2 + (isCoastal ? 2.5 : 0.6) + (hasWonder ? 3.0 : 0) + (atWar ? 3.5 : 0)
  );
  setFlow('Tar & Pitch', isForest ? 13 : 0.6, (isCoastal ? 8.5 : 1.8) + (isUnderSiege ? 14 : atWar ? 5.5 : 1.0));
  setFlow('Warhorses', isArid || (!isForest && !isMountain) ? 7.5 : 0.5, (atWar ? 7.5 : 1.8) + (isCapital ? 3.5 : 0.8));
  setFlow('Crossbow Bolts', isCapital || isForest || hasFoundry ? 17.5 : 3.5, isUnderSiege ? 18 : leviesRaised ? 9 : 3.5);
  setFlow('Tanned Leather', (isUrbanHub ? 14.5 : 9.0) * Math.max(0.55, harvestMult), 3.5 + Math.min(10, popK * 0.16) + (atWar ? 7 : 2));

  // ==========================================================================
  // C. CIVIC CONSTRUCTION, MASONRY & ROPE (8 Commodities)
  // ==========================================================================
  setFlow(
    'Timber',
    isForest ? 22 : isRiver ? 5.0 : 1.5,
    (Math.min(14, popK * 0.25) + dev * 0.22 + (isUnderSiege ? 10 : 0)) * winterHeatMult
  );
  setFlow('Stone', isMountain ? 20 : isHillsOrHighland ? 9 : 2.5, dev * 0.32 + buildings.length * 2.2);
  setFlow('Marble', isMountain && dev > 35 ? 6.5 : 0, (isCapital ? 5.5 : 0.8) + (hasWonder ? 7.5 : 0), 0);
  setFlow('Quarried Slate', isHillsOrHighland ? 12.5 : 0, dev * 0.22 + (hasKeep ? 4.5 : 1), 0);
  setFlow('Bricks & Mortar', isRiver || isUrbanHub ? 15 : 4.5, dev * 0.26 + Math.min(8, popK * 0.14));
  setFlow('Clay & Pottery', isRiver ? 15 : 5.5, Math.min(12, popK * 0.22));
  setFlow('Rope & Cordage', isCoastal ? 13.5 : 4.5, (isCoastal ? 9.5 : 2.5) + (atWar ? 4.5 : 0.8));
  setFlow(
    'Beeswax Candles',
    isForest ? 8.5 : 3.0,
    (Math.min(9, popK * 0.16) + (isCapital || hasWonder ? 4.5 : 0.8)) * winterHeatMult
  );

  // ==========================================================================
  // D. TEXTILES, CHANCERY & CODICES (7 Commodities)
  // ==========================================================================
  setFlow('Wool', !isForest ? 14 * Math.max(0.5, harvestMult) : 3.5, Math.min(14, popK * 0.25) + (season === 'Winter' ? 7 : 1.8));
  setFlow('Linen & Flax', isRiver ? 12.5 * Math.max(0.5, harvestMult) : 3.0, Math.min(11, popK * 0.20));
  setFlow('Fine Woolen Cloth', isCapital ? 24.0 : hasGuild || isUrbanHub ? 16.5 : 2.8, Math.min(12, popK * 0.15) + (prestige > 450 ? 3.5 : 1.0));
  setFlow(
    'Parchment & Vellum',
    (isCapital ? 21.0 : isUrbanHub ? 13.0 : 5.5) * Math.max(0.65, harvestMult),
    (isCapital ? 7.5 : 3.2) + (dev > 45 ? 3.0 : 0.8) + (hasWonder ? 2.5 : 0)
  );
  setFlow(
    'Paper & Codices',
    isCapital ? 18.0 : isUrbanHub || hasWonder ? 11.0 : 3.0,
    (isCapital ? 8.5 : 3.0) + (dev > 40 ? 3.5 : 0.8) + (hasGuild ? 2.0 : 0)
  );
  setFlow('Dyes', isCoastal || isCapital ? 10.5 : 1.4, 2.2 + (hasGuild ? 4.5 : 1.0));
  setFlow('Glassware', (isCapital || isCoastal || hasGuild) && dev > 30 ? 15.0 : 1.0, 2.0 + (dev > 45 ? 3.5 : 0.8) + (hasWonder ? 2.0 : 0));

  // ==========================================================================
  // E. MEDICINE, APOTHECARY & PLAGUE DEFENSE (4 Commodities)
  // ==========================================================================
  const plagueMult = hasPlague ? 4.5 : 1.0;
  setFlow(
    'Medicinal Leeches',
    isRiver || isWetland || isForest ? 9.0 : 0,
    (1.8 + Math.min(6, popK * 0.10)) * plagueMult,
    0
  );
  setFlow(
    'Alchemical Mercury',
    isMountain ? 6.5 : 0,
    (1.2 + (dev > 45 ? 2.8 : 0.8)) * plagueMult,
    0
  );
  setFlow(
    'Myrrh & Resins',
    isWarm && isArid ? 7.5 : 0,
    (1.6 + (isCapital || hasWonder ? 2.8 : 0.8)) * (hasPlague ? 2.4 : 1.0),
    0
  );
  setFlow(
    'Apothecary Remedies',
    isCapital || isUrbanHub || hasWonder ? 10.5 : 2.5,
    (2.0 + Math.min(7, popK * 0.12)) * plagueMult
  );

  // ==========================================================================
  // F. NOBLE LUXURIES, REGALIA, PRESTIGE & RELIGION (14 Commodities)
  // ==========================================================================
  const nobleDemand = Math.max(0.4, prestige / 320 + (isCapital ? 2.4 : isUrbanHub ? 1.3 : 0.4));

  setFlow(
    'Wine',
    cli.isMildTemperate && !cli.isWetland && (!isMountain || dev > 36) ? 16.5 * Math.max(0.6, harvestMult) : 0,
    Math.min(12, popK * 0.18) + nobleDemand * 1.4,
    0
  );
  setFlow('Silk', isWarm && !cli.isDesert ? 10.5 * tradePull * 0.72 : 0, nobleDemand * 1.8, 0);
  setFlow('Spices', isWarm && !cli.isTundra && !cli.isTaiga ? 11.5 * tradePull * 0.72 : 0, Math.min(8, popK * 0.10) + nobleDemand * 1.6, 0);
  setFlow('Incense', cli.isDesert || cli.isSavanna || cli.isRainforest ? 8.5 : 0, 1.6 + (burg.isHolySite || hasWonder ? 7.5 : 1.5), 0);
  setFlow('Fine Porcelain', dev > 50 && (isRiver || isCapital) ? 8.5 : 0.5, nobleDemand * 1.6);
  setFlow('Gems', isMountain || (cli.isDesert && isHillsOrHighland) ? 5.2 : 0, nobleDemand * 1.4, 0);
  setFlow('Amber', isCoastal && !isWarm ? 7.2 : 0, nobleDemand * 1.1, 0);
  setFlow('Pearls', isCoastal && isWarm ? 6.8 : 0, nobleDemand * 1.3, 0);
  setFlow('Ivory', cli.isSavanna || cli.isRainforest ? 6.2 : 0, nobleDemand * 1.1, 0);
  setFlow('Tapestries', isCapital || dev > 36 ? 14.5 : 1.0, (isCapital ? 4.2 : 1.0) + nobleDemand);
  setFlow('Fine Saffron', isWarm && !cli.isDesert && !cli.isRainforest ? 6.2 : 0, nobleDemand * 1.4, 0);
  setFlow(
    'Furs',
    cli.isTundra || cli.isTaiga
      ? (season === 'Winter' || season === 'Autumn' ? 15.0 : 9.5)
      : isForest && !cli.isRainforest
      ? (season === 'Winter' || season === 'Autumn' ? 10.5 : 5.0)
      : 0,
    (1.8 + nobleDemand) * winterHeatMult,
    0
  );
  setFlow('Holy Relics', burg.isHolySite ? 3.8 : 0.1, burg.isHolySite ? 1.0 : 2.5);
  setFlow(
    'Jewelry & Regalia',
    isCapital || (hasGuild && dev > 45) ? 5.5 : 0.8,
    nobleDemand * 1.35 + (isCapital ? 1.8 : 0.2)
  );

  // ==========================================================================
  // G. BULLION (2 Commodities - Climate/Geology Locked)
  // ==========================================================================
  setFlow('Silver', isMountain ? 2.0 : isHillsOrHighland ? 0.6 : 0, 2.5 + Math.min(8, popK * 0.12) + (dev > 45 ? 3.5 : 1.0), 0);
  setFlow('Gold', isMountain && (dev > 38 || isCapital) ? 0.85 : isMountain ? 0.4 : isHillsOrHighland && dev > 48 ? 0.2 : 0, 1.5 + (isCapital ? 3.8 : 0.8), 0);

  // Reinforce declared local export specialties when physically viable in this biome/geography
  const specialtyGoods = new Set<CommodityType>(
    [burg.tradeGood, ...(burg.exports || [])].filter((g): g is CommodityType => Boolean(g && (result as any)[g]))
  );
  for (const spec of specialtyGoods) {
    const flow = result[spec];
    if (flow && flow.production > 0) {
      flow.production = Math.round(flow.production * 1.35 * 10) / 10;
    }
  }

  return result;
}

export function syncBurgStructuralMarkets(
  burg: Burg,
  bMarket: BurgMarket,
  world: WorldState,
  isInit: boolean = false,
  inflationFactor: number = 1.0
): void {
  const flows = calculateStructuralSupplyAndDemand(burg, world);
  let monthlyTurnover = 0;

  for (const commKey in bMarket.markets) {
    const comm = commKey as CommodityType;
    const market = bMarket.markets[comm];
    const flow = flows[comm];
    if (flow) {
      market.monthlyProduction = flow.production;
      market.monthlyConsumption = flow.consumption;
    }

    if (isInit) {
      const isStaple = comm === 'Grain' || comm === 'Livestock' || comm === 'Dried Fish';
      const targetMonths = isStaple ? 7.5 : 4.5;
      const seededStock = Math.max(
        isStaple ? 28 : 14,
        Math.round(market.monthlyConsumption * targetMonths + market.monthlyProduction * 1.5)
      );
      market.stockpile = Math.min(market.maxStockpileCapacity || 1200, seededStock);
      market.currentPrice = calculateMarketPrice(market, inflationFactor, 0.85);
      market.lastMonthPrice = market.currentPrice;
    }

    monthlyTurnover += Math.min(market.monthlyProduction, market.monthlyConsumption) * market.currentPrice;
  }

  bMarket.tradeConnectivity = burg.tradeConnectivity || bMarket.tradeConnectivity;
  bMarket.totalMarketVolume = Math.round(monthlyTurnover);
  updateBurgFoodSecurity(bMarket, burg);
}

// ============================================================================
// MASTER 27 ACYCLIC RECIPE CATALOG (STRICT TOPOLOGICAL ORDER: DEPTH 1 -> 2 -> 3)
// ============================================================================

export const PRODUCTION_RECIPES: Record<string, ProductionRecipe> = {
  // --- DEPTH 1: RAW-ONLY RECIPES (19) ---
  'Tools & Ironware': {
    outputGood: 'Tools & Ironware',
    inputs: [{ commodity: 'Iron', amount: 1.0 }, { commodity: 'Coal', amount: 0.5 }, { commodity: 'Timber', amount: 0.4 }],
    baseYield: 1.2,
    description: 'Blacksmiths forge iron bars with coal and ash handles into plows, axes, and mining picks.',
  },
  'Bronze & Brassware': {
    outputGood: 'Bronze & Brassware',
    inputs: [{ commodity: 'Copper', amount: 1.0 }, { commodity: 'Tin', amount: 0.35 }, { commodity: 'Coal', amount: 0.5 }],
    baseYield: 1.1,
    description: 'Foundries alloy copper and tin into durable brass fittings, bells, and bronze ordnance.',
  },
  'Crossbow Bolts': {
    outputGood: 'Crossbow Bolts',
    inputs: [{ commodity: 'Iron', amount: 0.7 }, { commodity: 'Timber', amount: 0.8 }, { commodity: 'Furs', amount: 0.15 }],
    baseYield: 1.5,
    description: 'Fletchers and armorers shape seasoned wood shafts and forge hardened iron bolt points.',
  },
  'Blackpowder': {
    outputGood: 'Blackpowder',
    inputs: [{ commodity: 'Saltpeter', amount: 1.1 }, { commodity: 'Sulfur', amount: 0.45 }, { commodity: 'Coal', amount: 0.5 }],
    baseYield: 1.0,
    description: 'Powder mills grind purified saltpeter, brimstone sulfur, and charcoal into ordnance powder.',
  },
  'Ale & Beer': {
    outputGood: 'Ale & Beer',
    inputs: [{ commodity: 'Grain', amount: 1.2 }, { commodity: 'Timber', amount: 0.25 }],
    baseYield: 1.15,
    description: 'Breweries consume malted grain and timber casks to brew ale.',
  },
  'Wine': {
    outputGood: 'Wine',
    inputs: [{ commodity: 'Orchard Fruit', amount: 1.4 }, { commodity: 'Timber', amount: 0.25 }, { commodity: 'Clay & Pottery', amount: 0.2 }],
    baseYield: 1.0,
    description: 'Presses and vintners age orchard grapes inside seasoned oak casks and amphorae.',
  },
  'Cheese': {
    outputGood: 'Cheese',
    inputs: [{ commodity: 'Livestock', amount: 0.8 }, { commodity: 'Salt', amount: 0.2 }],
    baseYield: 1.1,
    description: 'Dairies consume livestock milk and salt to preserve hard wheels of cheese.',
  },
  'Dried Fish': {
    outputGood: 'Dried Fish',
    inputs: [{ commodity: 'Salt', amount: 0.45 }, { commodity: 'Timber', amount: 0.25 }],
    baseYield: 1.4,
    description: 'Coastal smokehouses cure and dry maritime catches over hardwood embers and sea salt.',
  },
  'Olive Oil': {
    outputGood: 'Olive Oil',
    inputs: [{ commodity: 'Orchard Fruit', amount: 1.5 }, { commodity: 'Clay & Pottery', amount: 0.25 }],
    baseYield: 1.0,
    description: 'Stone presses crush orchard olives into clay amphorae for lamp oil and cuisine.',
  },
  'Bricks & Mortar': {
    outputGood: 'Bricks & Mortar',
    inputs: [{ commodity: 'Clay & Pottery', amount: 1.2 }, { commodity: 'Coal', amount: 0.45 }],
    baseYield: 1.1,
    description: 'Kilns bake river clay using coal into durable ashlar bricks and lime mortar.',
  },
  'Glassware': {
    outputGood: 'Glassware',
    inputs: [{ commodity: 'Stone', amount: 0.8 }, { commodity: 'Coal', amount: 0.6 }, { commodity: 'Lead', amount: 0.3 }],
    baseYield: 0.9,
    description: 'Glassworks melt quartz sandstone and lead fluxes under high coal heat.',
  },
  'Fine Porcelain': {
    outputGood: 'Fine Porcelain',
    inputs: [{ commodity: 'Clay & Pottery', amount: 1.1 }, { commodity: 'Coal', amount: 0.7 }, { commodity: 'Tin', amount: 0.3 }],
    baseYield: 0.7,
    description: 'Artisan potters fire fine kaolin clay with tin-white glazes in ultra-high kilns.',
  },
  'Fine Woolen Cloth': {
    outputGood: 'Fine Woolen Cloth',
    inputs: [{ commodity: 'Wool', amount: 1.4 }, { commodity: 'Dyes', amount: 0.25 }],
    baseYield: 1.0,
    description: 'Weaving looms consume raw wool fleeces and dyes to produce fine cloth.',
  },
  'Parchment & Vellum': {
    outputGood: 'Parchment & Vellum',
    inputs: [{ commodity: 'Livestock', amount: 0.7 }, { commodity: 'Salt', amount: 0.2 }, { commodity: 'Herbs', amount: 0.15 }],
    baseYield: 0.95,
    description: 'Scriptoriums scrape and treat sheepskins for legal rolls and illuminated codices.',
  },
  'Paper & Codices': {
    outputGood: 'Paper & Codices',
    inputs: [{ commodity: 'Linen & Flax', amount: 1.1 }, { commodity: 'Timber', amount: 0.5 }, { commodity: 'Dyes', amount: 0.15 }],
    baseYield: 1.15,
    description: 'Water-powered rag mills pulp flax linen into bound chancery ledgers and codices.',
  },
  'Beeswax Candles': {
    outputGood: 'Beeswax Candles',
    inputs: [{ commodity: 'Honey', amount: 0.8 }, { commodity: 'Linen & Flax', amount: 0.2 }],
    baseYield: 1.05,
    description: 'Chandlers separate beeswax from honeycomb and insert spun flax wicks.',
  },
  'Tar & Pitch': {
    outputGood: 'Tar & Pitch',
    inputs: [{ commodity: 'Timber', amount: 1.1 }, { commodity: 'Coal', amount: 0.3 }],
    baseYield: 1.05,
    description: 'Forest kilns distill resinous pine heartwood into waterproof naval pitch.',
  },
  'Incense': {
    outputGood: 'Incense',
    inputs: [{ commodity: 'Myrrh & Resins', amount: 0.8 }, { commodity: 'Herbs', amount: 0.4 }, { commodity: 'Spices', amount: 0.3 }],
    baseYield: 0.9,
    description: 'Temple perfumers blend myrrh resins, aromatic herbs, and eastern spices into sacred incense.',
  },
  'Jewelry & Regalia': {
    outputGood: 'Jewelry & Regalia',
    inputs: [{ commodity: 'Gold', amount: 0.45 }, { commodity: 'Silver', amount: 0.6 }, { commodity: 'Gems', amount: 0.35 }, { commodity: 'Pearls', amount: 0.15 }],
    baseYield: 0.6,
    description: 'Royal goldsmiths craft crowns, signet rings, and filigree regalia from bullion and jewels.',
  },

  // --- DEPTH 2: USES DEPTH-1 GOODS (5) ---
  'Distilled Spirits': {
    outputGood: 'Distilled Spirits',
    inputs: [{ commodity: 'Cane Sugar', amount: 1.0 }, { commodity: 'Bronze & Brassware', amount: 0.15 }, { commodity: 'Timber', amount: 0.3 }],
    baseYield: 0.9,
    description: 'Alembic brass stills ferment cane molasses into high-proof naval spirits.',
  },
  'Tanned Leather': {
    outputGood: 'Tanned Leather',
    inputs: [{ commodity: 'Livestock', amount: 0.9 }, { commodity: 'Salt', amount: 0.25 }, { commodity: 'Tar & Pitch', amount: 0.2 }],
    baseYield: 1.0,
    description: 'Tanyards cure raw hides with salt brine and pitch tannins.',
  },
  'Rope & Cordage': {
    outputGood: 'Rope & Cordage',
    inputs: [{ commodity: 'Linen & Flax', amount: 1.2 }, { commodity: 'Tar & Pitch', amount: 0.3 }],
    baseYield: 1.2,
    description: 'Ropewalks twist raw flax and seal cordage with pine pitch for maritime rigging.',
  },
  'Tapestries': {
    outputGood: 'Tapestries',
    inputs: [{ commodity: 'Fine Woolen Cloth', amount: 1.0 }, { commodity: 'Silk', amount: 0.4 }, { commodity: 'Dyes', amount: 0.3 }],
    baseYield: 0.55,
    description: 'Master artisans weave dyed silk threads and fine wool into palace tapestries.',
  },
  'Holy Relics': {
    outputGood: 'Holy Relics',
    inputs: [
      { commodity: 'Gold', amount: 0.3 },
      { commodity: 'Incense', amount: 0.4 },
      { commodity: 'Gems', amount: 0.2 },
      { commodity: 'Ivory', amount: 0.25 },
    ],
    baseYield: 0.25,
    description: 'Cathedral goldsmiths encase sacred relics inside carved ivory and jeweled gold reliquaries.',
  },

  // --- DEPTH 3: USES DEPTH-2 GOODS (3) ---
  'Steel Arms & Armor': {
    outputGood: 'Steel Arms & Armor',
    inputs: [{ commodity: 'Iron', amount: 1.3 }, { commodity: 'Coal', amount: 0.9 }, { commodity: 'Tanned Leather', amount: 0.35 }],
    baseYield: 0.85,
    description: 'Master armorers carburize iron with coal and fit leather straps into plate and blades.',
  },
  'Warhorses': {
    outputGood: 'Warhorses',
    inputs: [{ commodity: 'Livestock', amount: 1.0 }, { commodity: 'Grain', amount: 1.8 }, { commodity: 'Tanned Leather', amount: 0.4 }],
    baseYield: 0.45,
    description: 'Royal studs consume grain fodder and leather barding to train armored destriers.',
  },
  'Apothecary Remedies': {
    outputGood: 'Apothecary Remedies',
    inputs: [{ commodity: 'Herbs', amount: 1.1 }, { commodity: 'Medicinal Leeches', amount: 0.5 }, { commodity: 'Distilled Spirits', amount: 0.25 }],
    baseYield: 0.95,
    description: 'Physicians compound herbal tinctures, distilled spirits, and leech kits to halt epidemics.',
  },
};

export function getActiveCommodities(): Record<string, ExtendedCommodityMeta> {
  const reg = globalModRegistry.getRegistry<ExtendedCommodityMeta & { id: string }>('commodities');
  if (reg.size() === 0) return COMMODITIES;
  const out: Record<string, ExtendedCommodityMeta> = {};
  for (const item of reg.getAll()) {
    out[item.id] = item;
  }
  return out;
}

export function getActiveProductionRecipes(): Record<string, ProductionRecipe> {
  const reg = globalModRegistry.getRegistry<ProductionRecipe & { id: string }>('recipes');
  if (reg.size() === 0) return PRODUCTION_RECIPES;
  const out: Record<string, ProductionRecipe> = {};
  for (const item of reg.getAll()) {
    out[item.id] = item;
  }
  return out;
}

export function processDebtLeverageAndDefaults(world: WorldState, monthsDelta: number = 1): void {
  const economy = ensureEconomy(world);
  const activeRecipes = getActiveProductionRecipes();
  const activeCommodities = getActiveCommodities();

  // Track monthly Gold & Silver raw extraction per realm for Sovereign Minting
  const realmGoldExtracted: Record<string, number> = {};
  const realmSilverExtracted: Record<string, number> = {};

  // ========================================================================
  // 1. INPUT-OUTPUT TRANSFORMATION, TOOLS MULTIPLIER & MUNICIPAL CLEARING
  // ========================================================================
  for (const burgId in economy.burgMarkets) {
    const bMarket = economy.burgMarkets[burgId];
    const worldBurg = world.burgs?.find((b) => b.id === burgId);
    const realmId = worldBurg?.stateId || '';
    const coinPurity = economy.realmCoinPurity?.[realmId] ?? 1.0;
    const inflationFactor = 1.0 / Math.max(0.2, coinPurity);
    const dev = worldBurg?.developmentLevel || 30;
    const defaultFloat = Math.max(120, Math.round(dev * 8 + (worldBurg?.population || 3000) * 0.018));
    if (bMarket.workingCapitalFloat === undefined) bMarket.workingCapitalFloat = defaultFloat;
    if (bMarket.treasury === undefined) bMarket.treasury = worldBurg?.treasury ?? defaultFloat;
    if (worldBurg) {
      if (worldBurg.treasury === undefined) worldBurg.treasury = bMarket.treasury;
      // Keep municipal market treasury synchronized with burg coffer
      bMarket.treasury = worldBurg.treasury;

      const flows = calculateStructuralSupplyAndDemand(worldBurg, world);
      for (const commKey in flows) {
        const comm = commKey as CommodityType;
        if (bMarket.markets[comm]) {
          bMarket.markets[comm].monthlyProduction = flows[comm].production;
          bMarket.markets[comm].monthlyConsumption = flows[comm].consumption;
        }
      }
      bMarket.tradeConnectivity = worldBurg.tradeConnectivity || bMarket.tradeConnectivity;
    }

    // --- DRIVER 1: TOOLS MULTIPLIER ON RAW EXTRACTION ---
    const toolsMarket = bMarket.markets['Tools & Ironware'];
    const toolsStock = toolsMarket?.stockpile || 0;
    const toolsNeed = Math.max(1, toolsMarket?.monthlyConsumption || 6);
    const toolsRatio = Math.max(0.25, Math.min(1.25, toolsStock / toolsNeed));
    const toolsMultiplier = 0.80 + 0.45 * toolsRatio;

    // --- STEP A: REAL RAW EXTRACTION (LAND -> SILO, CLIMATE-LOCKED) ---
    for (const commKey in bMarket.markets) {
      const comm = commKey as CommodityType;
      const market = bMarket.markets[comm];
      const meta = activeCommodities[comm] || COMMODITIES[comm];

      if (meta && meta.spoilageRate > 0 && market.stockpile > 0) {
        market.stockpile = Math.max(0, market.stockpile - market.stockpile * meta.spoilageRate);
      }

      if (!activeRecipes[comm]) {
        const extracted = market.monthlyProduction * toolsMultiplier;
        market.stockpile = Math.min(
          market.maxStockpileCapacity || 1200,
          market.stockpile + extracted
        );
        if (comm === 'Gold') realmGoldExtracted[realmId] = (realmGoldExtracted[realmId] || 0) + extracted;
        if (comm === 'Silver') realmSilverExtracted[realmId] = (realmSilverExtracted[realmId] || 0) + extracted;
      }
    }

    // --- STEP B: ACYCLIC WORKSHOP TRANSFORMATION (TOPOLOGICAL ORDER: DEPTH 1 -> 2 -> 3) ---
    for (const recipe of Object.values(activeRecipes)) {
      const outputMarket = bMarket.markets[recipe.outputGood];
      if (!outputMarket) continue;

      const baseOutProd = outputMarket.monthlyProduction || 0;
      if (baseOutProd <= 0) {
        outputMarket.throughputRate = 0;
        continue;
      }

      const targetProduction = baseOutProd * (dev / 30);

      let limitingRatio = 1.0;
      let worstBottleneck: CommodityType | undefined = undefined;

      for (const ingredient of recipe.inputs) {
        const inputMarket = bMarket.markets[ingredient.commodity];
        const neededAmount = ingredient.amount * targetProduction;
        const availableStock = inputMarket?.stockpile || 0;

        if (neededAmount > 0) {
          const ratio = Math.max(0, Math.min(1.0, availableStock / neededAmount));
          if (ratio < limitingRatio) {
            limitingRatio = ratio;
            worstBottleneck = ingredient.commodity;
          }
        }
      }

      outputMarket.throughputRate = Math.round(limitingRatio * 100) / 100;
      outputMarket.bottleneckInput = limitingRatio < 0.75 ? worstBottleneck : undefined;

      const actualProduced = targetProduction * limitingRatio * recipe.baseYield;

      for (const ingredient of recipe.inputs) {
        const inputMarket = bMarket.markets[ingredient.commodity];
        if (inputMarket) {
          const consumedAmount = ingredient.amount * actualProduced;
          inputMarket.stockpile = Math.max(0, inputMarket.stockpile - consumedAmount);
          inputMarket.monthlyConsumption = (inputMarket.monthlyConsumption || 5) * 0.8 + consumedAmount * 0.2;
        }
      }

      outputMarket.stockpile = Math.min(
        outputMarket.maxStockpileCapacity || 1200,
        outputMarket.stockpile + actualProduced
      );
    }

    // --- STEP C: CONSUMER SUBSISTENCE & MARKET PRICE EQUILIBRIUM ---
    let monthlyTurnover = 0;

    for (const commKey in bMarket.markets) {
      const comm = commKey as CommodityType;
      const market = bMarket.markets[comm];

      market.stockpile = Math.max(0, market.stockpile - market.monthlyConsumption);
      market.lastMonthPrice = market.currentPrice;

      market.currentPrice = calculateMarketPrice(market, inflationFactor, 0.22);
      monthlyTurnover += Math.min(market.monthlyProduction, market.monthlyConsumption) * market.currentPrice;
    }

    bMarket.totalMarketVolume = Math.round(monthlyTurnover);
    updateBurgFoodSecurity(bMarket, worldBurg);

    if (worldBurg) {
      updateSocioeconomicStrata(worldBurg, bMarket, world);

      const isUnderSiege = (world.activeSieges || []).some(
        (s) => s.holdingId === worldBurg.id || s.holdingName.includes(worldBurg.name)
      );
      const isTaxStrike = (worldBurg.unrest || 0) >= 75;
      const faminePenalty = worldBurg.isStarving || worldBurg.foodSecurity === 'FAMINE' ? 0.55 : 1.0;
      const stepMonths = Math.max(1, monthsDelta);
      const ledger = worldBurg.economicLedger || calculateBurgEconomicLedger(worldBurg, world);
      const baseCommerce = Math.min(34, ledger.totalRevenue * 0.22 + bMarket.totalMarketVolume * 0.00022);
      const municipalUpkeep = Math.min(
        28,
        (ledger.garrisonUpkeep + ledger.civicMaintenance + ledger.adminOverhead) * 0.36
      );
      const grossInflow =
        baseCommerce *
        (isUnderSiege ? 0.12 : 1.0) *
        (isTaxStrike ? 0.15 : 1.0) *
        faminePenalty;
      const netMunicipalDelta = (grossInflow - municipalUpkeep) * stepMonths;
      const nextBurgTreasury = Math.max(
        0,
        Math.min(2000, Math.round(((bMarket.treasury || 0) + netMunicipalDelta) * 10) / 10)
      );
      bMarket.treasury = nextBurgTreasury;
      worldBurg.treasury = nextBurgTreasury;
    }
  }

  economy.totalTradeFlowVolume = Math.max(
    100,
    Math.round(Object.values(economy.burgMarkets).reduce((acc, m) => acc + (m.totalMarketVolume || 0), 0) * 0.02)
  );

  // ========================================================================
  // 2. BANK LOANS SERVICING & DEFAULT CONTAGION
  // ========================================================================
  const loanTicks = Math.max(1, monthsDelta);
  for (const bank of economy.bankInstitutions) {
    let unrecoveredDebt = 0;

    for (const loan of bank.activeLoans) {
      if (loan.isDefaulted || loan.monthsRemaining <= 0) continue;

      const borrower = world.characters?.find((c) => c.id === loan.borrowerId);
      const stepsToRun = Math.min(loanTicks, loan.monthsRemaining);

      for (let lt = 0; lt < stepsToRun; lt++) {
        if (loan.isDefaulted || loan.monthsRemaining <= 0) break;

        loan.monthsRemaining -= 1;
        const monthlyInterest = (loan.remainingBalance * loan.annualInterestRate) / 12;
        const monthlyPrincipal = loan.remainingBalance / Math.max(1, loan.monthsRemaining);
        const totalDue = monthlyInterest + monthlyPrincipal;

        if (borrower && (borrower.treasury || 0) >= totalDue) {
          borrower.treasury = Math.max(0, (borrower.treasury || 0) - totalDue);
          loan.remainingBalance = Math.max(0, loan.remainingBalance - monthlyPrincipal);
          bank.treasury += totalDue;
        } else {
          if (loan.monthsRemaining > 0) {
            loan.remainingBalance += monthlyInterest;
            bank.opinionOfCrown = Math.max(-100, (bank.opinionOfCrown || 0) - 3);
            if (borrower) {
              borrower.prestige = Math.max(0, (borrower.prestige || 100) - 5);
            }
          } else if (loan.monthsRemaining === 0 && loan.remainingBalance > 10) {
            loan.isDefaulted = true;
            loan.patricianHookGranted = true;
            unrecoveredDebt += loan.remainingBalance;

            if (borrower) {
              borrower.dread = Math.min(100, (borrower.dread || 0) + 20);
              borrower.stress = Math.min(300, (borrower.stress || 0) + 40);

              if (bank.patricianCharacterId) {
                borrower.hooksOnMe = borrower.hooksOnMe || [];
                borrower.hooksOnMe.push({
                  targetId: borrower.id,
                  targetName: borrower.name,
                  holderId: bank.patricianCharacterId,
                  holderName: bank.patricianName,
                  type: 'Strong',
                  reason: `Defaulted on sovereign debt of ${loan.principal}g with ${bank.name}`,
                });
              }
            }
            bank.opinionOfCrown = Math.max(-100, (bank.opinionOfCrown || 0) - 45);
          }
        }
      }
    }

    bank.treasury = Math.round(bank.treasury * 10) / 10;
    if (bank.treasury < 200 && unrecoveredDebt > 450) {
      bank.isSolvent = false;
    } else if (!bank.isSolvent && bank.treasury >= 900) {
      bank.isSolvent = true;
    }
  }

  // ========================================================================
  // 3. NOBLE PERSONAL / VASSAL PRIVY PURSES & AUTO-BUY BUILDING UPKEEP
  // ========================================================================
  const circuitMonths = Math.max(1, monthsDelta);
  const realmCollectedVassalTax: Record<string, number> = {};
  const realmCollectedScutage: Record<string, number> = {};
  const realmCollectedDomainTax: Record<string, number> = {};
  const liegeReceivedVassalTribute: Record<string, number> = {};

  interface PendingCharFiscalStep {
    char: Character;
    profile: FiscalProfile;
    charRealm?: Realm;
    isMonarchOfRealm: boolean;
    heldBurgs: Burg[];
    realDomainCollected: number;
    paidTribute: number;
  }
  const pendingFiscalSteps: PendingCharFiscalStep[] = [];

  for (const char of world.characters || []) {
    if (!char.isAlive) continue;
    const profile = calculateFiscalProfile(char, world, economy);
    economy.fiscalProfiles[char.id] = profile;

    const charRealm = char.realmId ? world.realms?.find((r) => r.id === char.realmId) : undefined;
    const isMonarchOfRealm = Boolean(charRealm && charRealm.rulerId === char.id);
    const charBudget = charRealm ? ensureRealmBudget(charRealm, world) : undefined;
    const policyMods = charBudget
      ? getTaxPolicyMultipliers(charBudget.taxPolicy)
      : { taxMult: 1.0, unrestDelta: 0, opinionDelta: 0 };
    const chanceryEff = charRealm ? getRealmChanceryEfficiency(charRealm.id, world).taxEfficiency : 1.0;
    const isRealmBankrupt = Boolean(charBudget && charBudget.bankruptcyUntilYear > world.currentYear);
    const bankruptcyTaxMult = isRealmBankrupt ? 0.5 : 1.0;

    // --- STEP A: BURG TURNOVER TAX (PROTECTING workingCapitalFloat) & AUTO-BUY UPKEEP ---
    const heldBurgs = (world.burgs || []).filter((b) => b.ownerId === char.id);
    const townTaxPerBurg =
      (profile.demesneIncome * policyMods.taxMult * chanceryEff * bankruptcyTaxMult * circuitMonths) /
      Math.max(1, heldBurgs.length);
    const localTariffShare =
      char.role === 'Monarch' ? Math.min(profile.tariffIncome * 0.5, profile.tariffIncome) : profile.tariffIncome;
    const townTariffPerBurg = (localTariffShare * circuitMonths) / Math.max(1, heldBurgs.length);

    let realDomainCollected = 0;

    for (const b of heldBurgs) {
      const mkt = economy.burgMarkets?.[b.id];
      const workingFloat = mkt?.workingCapitalFloat ?? 120;
      const currentCoffer = mkt?.treasury ?? b.treasury ?? 0;

      // Net turnover tax NEVER taxes workingCapitalFloat!
      const taxableSurplus = Math.max(0, currentCoffer - workingFloat);
      const townOutflow = Math.min(taxableSurplus, townTaxPerBurg + townTariffPerBurg);
      const postTaxCoffer = Math.round(Math.max(0, currentCoffer - townOutflow) * 10) / 10;
      b.treasury = postTaxCoffer;
      if (mkt) mkt.treasury = postTaxCoffer;

      realDomainCollected += townOutflow;

      if (policyMods.unrestDelta !== 0) {
        b.unrest = Math.max(0, Math.min(100, Math.round(((b.unrest || 0) + policyMods.unrestDelta) * 10) / 10));
      }

      if (b.economicLedger) {
        b.economicLedger.cofferBalance = Math.round(b.treasury);
      }

      // --- DRIVER 4: MARKET-CLEARING AUTO-BUY BUILDING UPKEEP BEFORE DILAPIDATION ---
      const bSlots = ensureBurgBuildingSlots(b);
      const bMaint = computeBurgBuildingMaintenance(b);
      let commodityShortage = false;
      if (mkt) {
        for (const [k, req] of Object.entries(bMaint.monthlyCommodities)) {
          const cm = mkt.markets[k as CommodityType];
          const needed = (req || 0) * circuitMonths;
          if (cm && needed > 0) {
            if (cm.stockpile >= needed) {
              cm.stockpile = Math.round((cm.stockpile - needed) * 10) / 10;
            } else {
              const shortfall = needed - cm.stockpile;
              const buyCost = Math.round(shortfall * cm.currentPrice * 1.15 * 10) / 10;
              const spendableTownCash = Math.max(0, (mkt.treasury ?? b.treasury ?? 0) - workingFloat * 0.35);
              if (spendableTownCash >= buyCost) {
                // Municipal coffer clears the upkeep shortage via traveling factors
                const currentTownCash: number = mkt.treasury ?? b.treasury ?? 0;
                const updatedTownCash: number = Math.round((currentTownCash - buyCost) * 10) / 10;
                mkt.treasury = updatedTownCash;
                b.treasury = updatedTownCash;
                cm.stockpile = 0;
                mkt.totalMarketVolume = Math.round((mkt.totalMarketVolume || 0) + buyCost);
              } else {
                cm.stockpile = 0;
                commodityShortage = true;
              }
            }
          }
        }
      }

      const lordBankrupt = (char.treasury || 0) <= 0 && profile.netMonthlyCashflow < 0;
      for (const st of Object.values(bSlots)) {
        if (st.level >= 3 && (lordBankrupt || commodityShortage)) {
          st.monthsUnmaintained = (st.monthsUnmaintained || 0) + circuitMonths;
          if (st.monthsUnmaintained >= 6) st.dilapidated = true;
        } else if (st.level > 0 && !lordBankrupt && !commodityShortage) {
          st.monthsUnmaintained = Math.max(0, (st.monthsUnmaintained || 0) - circuitMonths);
        }
      }
    }

    if (isMonarchOfRealm && charRealm) {
      realmCollectedDomainTax[charRealm.id] = (realmCollectedDomainTax[charRealm.id] || 0) + realDomainCollected;
    }

    // Conservation of Feudal Tribute & Scutage: direct Crown vassals remit to Crown Fisc; sub-vassals remit strictly to their direct liege
    let paidTribute = 0;
    if (!isMonarchOfRealm && charRealm && char.realmId === charRealm.id) {
      const feudalTaxRate = policyMods.taxMult * chanceryEff * bankruptcyTaxMult;
      const baseTribute = Math.max(0, (profile.tributeOwedToLiege || 0) * feudalTaxRate * circuitMonths);
      const scutageOut = Math.max(0, (profile.scutageAndAidsExpense || 0) * circuitMonths);
      const rawTribute = baseTribute + scutageOut;
      const maxPayable = Math.max(0, ((char.treasury || 0) + realDomainCollected) * 0.30);
      paidTribute = Math.round(Math.min(maxPayable, rawTribute) * 10) / 10;

      if (paidTribute > 0) {
        const scutageShare = rawTribute > 0 ? Math.round((paidTribute * (scutageOut / rawTribute)) * 10) / 10 : 0;
        const regularShare = Math.round((paidTribute - scutageShare) * 10) / 10;
        const directLiege =
          char.liegeId && char.liegeId !== charRealm.rulerId
            ? world.characters?.find((c) => c.id === char.liegeId && c.isAlive && c.realmId === charRealm.id)
            : undefined;
        if (directLiege) {
          liegeReceivedVassalTribute[directLiege.id] =
            (liegeReceivedVassalTribute[directLiege.id] || 0) + paidTribute;
        } else {
          realmCollectedVassalTax[charRealm.id] =
            (realmCollectedVassalTax[charRealm.id] || 0) + regularShare;
          if (scutageShare > 0) {
            realmCollectedScutage[charRealm.id] =
              (realmCollectedScutage[charRealm.id] || 0) + scutageShare;
          }
        }

        if (policyMods.opinionDelta !== 0) {
          char.opinions = char.opinions || {};
          char.opinions[charRealm.rulerId] = Math.max(
            -100,
            Math.min(100, Math.round((char.opinions[charRealm.rulerId] ?? 15) + policyMods.opinionDelta))
          );
        }
      }
    }

    pendingFiscalSteps.push({
      char,
      profile,
      charRealm,
      isMonarchOfRealm,
      heldBurgs,
      realDomainCollected,
      paidTribute,
    });
  }

  for (const step of pendingFiscalSteps) {
    const { char, profile, charRealm, isMonarchOfRealm, heldBurgs, realDomainCollected, paidTribute } = step;

    // --- STEP B: DEPOSIT PERSONAL PRIVY PURSE CASHFLOW ---
    // Note: Monarch's Domain Tax, Army Upkeep & 10% Civil List are settled in stepRealmBudgets (Step 3B).
    // Vassals settle holding revenues + sub-vassal tribute minus Feudal Tax remitted to Crown Fisc / Liege.
    const homeBurg =
      heldBurgs[0] ||
      (char.countyId ? world.burgs?.find((b) => b.countyId === char.countyId) : undefined) ||
      (charRealm ? world.burgs?.find((b) => b.stateId === charRealm.id && b.isCapital) : undefined) ||
      world.burgs?.[0];
    const homeMarket = homeBurg ? economy.burgMarkets?.[homeBurg.id] : undefined;

    const householdCost =
      (profile.courtSplendorCost + (profile.householdUpkeep || 0) + (profile.seasonalShockExpense || 0)) *
      circuitMonths;

    // Deposit Noble Court & Household Upkeep into home BurgMarket.strata (55% Artisans, 30% Merchants, 15% Peasants)
    if (homeBurg && householdCost > 0) {
      if (homeBurg.strata) {
        if (homeBurg.strata.Artisans) {
          homeBurg.strata.Artisans.averageIncome =
            Math.round((homeBurg.strata.Artisans.averageIncome + (householdCost * 0.55) / circuitMonths * 0.08) * 10) / 10;
        }
        if (homeBurg.strata.Merchants) {
          homeBurg.strata.Merchants.averageIncome =
            Math.round((homeBurg.strata.Merchants.averageIncome + (householdCost * 0.30) / circuitMonths * 0.06) * 10) / 10;
        }
        if (homeBurg.strata.Peasants) {
          homeBurg.strata.Peasants.averageIncome =
            Math.round((homeBurg.strata.Peasants.averageIncome + (householdCost * 0.15) / circuitMonths * 0.04) * 10) / 10;
        }
      }
      if (homeMarket) {
        const liquidityBoost = Math.round(householdCost * 0.45 * 10) / 10;
        const nextHomeTreasury = Math.round(((homeMarket.treasury ?? homeBurg.treasury ?? 0) + liquidityBoost) * 10) / 10;
        homeMarket.treasury = nextHomeTreasury;
        homeBurg.treasury = nextHomeTreasury;
      }
    }

    const vaultCap = char.treasuryCap ?? getDefaultVaultCap(char);
    const autoReinvest = char.autoReinvestSurplus !== false;
    let surplusReinvested = 0;

    if (isMonarchOfRealm) {
      // Monarch Privy Purse pays Royal Household & Court (Food, Luxury Goods, Staff Wages, Daily Alms, Kin), funded by 10% Civil List Stipend
      const personalNet =
        -(
          profile.courtSplendorCost +
          (profile.householdUpkeep || 0) +
          (profile.youngerSonsAndDowries || 0) +
          (profile.seasonalShockExpense || 0) +
          (profile.vaultHoardingDrag || 0)
        ) * circuitMonths;
      let nextPrivy = (char.treasury || 0) + personalNet;
      if (nextPrivy > vaultCap) {
        const overflow = nextPrivy - vaultCap;
        if (autoReinvest) {
          surplusReinvested = Math.round(overflow * 0.85 * 10) / 10;
          nextPrivy = vaultCap + overflow * 0.15;
        } else {
          nextPrivy = vaultCap + overflow * 0.45;
        }
      }
      char.treasury = Math.max(0, Math.round(nextPrivy * 10) / 10);
    } else {
      const receivedFromSubVassals = liegeReceivedVassalTribute[char.id] || 0;
      const personalCashflow =
        realDomainCollected +
        receivedFromSubVassals -
        (profile.courtSplendorCost +
          (profile.estateMaintenance || 0) +
          (profile.estateAdministration || 0) +
          (profile.householdUpkeep || 0) +
          (profile.youngerSonsAndDowries || 0) +
          (profile.religiousPatronage || 0) +
          (profile.tournamentAndPageantry || 0) +
          (profile.seasonalShockExpense || 0) +
          (profile.vaultHoardingDrag || 0)) *
          circuitMonths -
        paidTribute;

      let newTreasury = (char.treasury || 0) + personalCashflow;
      if (newTreasury > vaultCap) {
        const overflow = newTreasury - vaultCap;
        if (autoReinvest) {
          surplusReinvested = Math.round(overflow * 0.85 * 10) / 10;
          newTreasury = vaultCap + overflow * 0.15;
        } else {
          newTreasury = vaultCap + overflow * 0.45;
        }
      }

      // AI noble fiscal stance adjustment
      const stance = char.fiscalStance || 'Balanced';
      if (stance === 'Lavish') {
        char.prestige = (char.prestige || 100) + 3 * circuitMonths;
        char.stress = Math.max(0, (char.stress || 0) - 2 * circuitMonths);
      } else if (stance === 'Austerity') {
        char.prestige = Math.max(0, (char.prestige || 100) - 2 * circuitMonths);
      }
      if (char.id !== world.monarchId) {
        if (newTreasury > vaultCap * 0.88 && stance !== 'Lavish') {
          char.fiscalStance = 'Lavish';
        } else if (newTreasury < vaultCap * 0.18 && profile.netMonthlyCashflow < 0 && stance !== 'Austerity') {
          char.fiscalStance = 'Austerity';
        } else if (newTreasury > vaultCap * 0.35 && newTreasury < vaultCap * 0.72 && stance !== 'Balanced') {
          char.fiscalStance = 'Balanced';
        }
      }

      if (newTreasury < 0) {
        char.treasury = 0;
        if (char.menAtArms && char.menAtArms > 0) {
          const desertion = Math.floor(char.menAtArms * 0.08);
          char.menAtArms = Math.max(0, char.menAtArms - desertion);
        }
        char.prestige = Math.max(0, (char.prestige || 100) - 10);
        char.stress = Math.min(300, (char.stress || 0) + 8);
      } else {
        char.treasury = Math.round(newTreasury * 10) / 10;

        // --- AI NOBLE BUILDING REINVESTMENT (>220g) ---
        if (char.id !== world.monarchId && char.treasury > 220 && heldBurgs.length > 0) {
          const targetBurg = [...heldBurgs].sort((a, b) => (a.developmentLevel || 25) - (b.developmentLevel || 25))[0];
          const slots = ensureBurgBuildingSlots(targetBurg);
          const bp = getSettlementBlueprint(targetBurg.type);
          const dev = Math.floor(targetBurg.developmentLevel ?? 10);
          const candidateEntry = Object.entries(slots).find(([slotId, s]) => {
            if (s.dilapidated) return false;
            const slotDef = bp.slots.find((sd) => sd.id === slotId);
            if (!slotDef || dev < slotDef.unlockDev) return false;
            const nextDef = slotDef.levels.find((l) => l.level === s.level + 1);
            return Boolean(nextDef && dev >= nextDef.minDev && (char.treasury || 0) >= nextDef.goldCost);
          });
          if (candidateEntry) {
            constructOrUpgradeBespokeSlot(targetBurg.id, candidateEntry[0], world, 'personal');
          }
        }
      }
    }

    // Inject surplus reinvestment & estate upkeep into held burgs
    const wageStimulus =
      ((profile.estateMaintenance || 0) * 0.8 + (profile.seasonalShockExpense || 0) * 0.4) * circuitMonths +
      surplusReinvested;
    if (heldBurgs.length > 0 && wageStimulus > 0) {
      const stimulusPerBurg = wageStimulus / heldBurgs.length;
      for (const b of heldBurgs) {
        const mkt = economy.burgMarkets?.[b.id];
        const nextB = Math.round(((mkt?.treasury ?? b.treasury ?? 0) + stimulusPerBurg) * 10) / 10;
        b.treasury = nextB;
        if (mkt) mkt.treasury = nextB;
        if (surplusReinvested >= 60 && (b.developmentLevel || 25) < 95) {
          b.developmentLevel = Math.min(95, Math.round(((b.developmentLevel || 25) + 0.4) * 10) / 10);
        }
        if (!b.economicLedger) b.economicLedger = calculateBurgEconomicLedger(b, world);
        b.economicLedger.localWageInjection = Math.round((stimulusPerBurg / circuitMonths) * 10) / 10;
        b.economicLedger.cofferBalance = Math.round(b.treasury);
      }
    }

    profile.surplusReinvested = surplusReinvested;
    profile.treasuryReserves = char.treasury || 0;
  }

  // ========================================================================
  // 3B. SOVEREIGN CROWN FISC SETTLEMENT (MINTING, CIVIL LIST, ARMY, CREDIT, BANKRUPTCY)
  // ========================================================================
  for (const realm of world.realms || []) {
    const budget = ensureRealmBudget(realm, world);
    const monarch = world.characters?.find((c) => c.id === realm.rulerId && c.isAlive);
    const realmBurgs = (world.burgs || []).filter((b) => b.stateId === realm.id);
    const gdp = getRealmGDP(realm.id, world);
    const isBankrupt = budget.bankruptcyUntilYear > world.currentYear;

    // AI Maintenance & TaxPolicy Autonomy
    const realmAtWar =
      (world.activeWars || []).some(
        (w) =>
          w.attackerRealmId === realm.id ||
          w.defenderRealmId === realm.id ||
          (w.alliedRealmIds || []).includes(realm.id)
      ) ||
      (world.armies || []).some((a) => a.color === realm.color && !a.isReturning);
    if (realm.rulerId !== world.monarchId) {
      budget.armyMaintenanceRate = realmAtWar ? 1.0 : 0.55;
      if ((realm.treasury || 0) < 60 && budget.taxPolicy === 'Normal') {
        budget.taxPolicy = 'High';
      } else if ((realm.treasury || 0) > 650 && budget.taxPolicy !== 'Low') {
        budget.taxPolicy = 'Normal';
      }
    }

    // 1. Crown Revenues (including Scutage & Feudal Aids collected from vassals)
    const pendingExtras = budget.pendingCycleTotals || {};
    const domainTax = Math.round((realmCollectedDomainTax[realm.id] || 0) * 10) / 10;
    const vassalTax = Math.round((realmCollectedVassalTax[realm.id] || 0) * 10) / 10;
    const scutageAndAidsIncome =
      Math.round(((realmCollectedScutage[realm.id] || 0) + (pendingExtras.scutageAndAidsIncome || 0)) * 10) / 10;
    const customsTariffs = Math.round((budget.lastReport?.customsTariffs || 0) * 10) / 10;
    // Sovereign Minting: capped bullion seigniorage + GDP coinage fee
    const goldOut = realmGoldExtracted[realm.id] || 0;
    const silverOut = realmSilverExtracted[realm.id] || 0;
    const rawSeigniorage = goldOut * 1.35 + silverOut * 0.55 + 0.0009 * gdp;
    const mintingIncome = Math.round(Math.min(14 + gdp * 0.004, rawSeigniorage) * circuitMonths * 10) / 10;

    const grossCrownInflow = domainTax + vassalTax + (realmCollectedScutage[realm.id] || 0) + mintingIncome;

    // 2. 10% Monarch Civil List Stipend (Royal Household: Food, Luxury Goods, Staff Wages, Alms)
    const totalGrossForCivilList = grossCrownInflow + customsTariffs * circuitMonths;
    const civilListStipend = Math.round(totalGrossForCivilList * 0.10 * 10) / 10;

    // 3. Military & Defense: Army/Mercenary Maintenance + Castles & Permanent Garrisons + Weapons/Siege Supplies
    const realmArmies = (world.armies || []).filter((a) => a.color === realm.color && !a.isReturning);
    const fieldedMen = realmArmies.reduce((acc, a) => acc + Math.max(0, a.strength || 0), 0);
    const embarkedMen = realmArmies.filter((a) => a.isEmbarked).reduce((acc, a) => acc + Math.max(0, a.strength || 0), 0);
    const monarchMaA = monarch?.menAtArms ?? 0;
    const rawArmyCost =
      (monarchMaA * 0.015 + fieldedMen * (realmAtWar ? 0.014 : 0.011) + (embarkedMen / 100) * 2.5) * circuitMonths;
    const armyMaintenance = Math.round(rawArmyCost * budget.armyMaintenanceRate * 10) / 10;

    let fortLevels = 0;
    let fortCastles = 0;
    let holySitesCount = 0;
    for (const b of realmBurgs) {
      if (b.type === 'Capital Citadel' || b.type === 'Border Fortress' || b.type === 'Royal Metropolis') {
        fortCastles += 1;
      }
      const slots = b.buildingSlots || {};
      for (const [sid, sl] of Object.entries(slots)) {
        if ((sl?.level || 0) <= 0) continue;
        if (sid.includes('wall') || sid.includes('keep') || sid.includes('citadel') || sid.includes('fort') || sid.includes('watch')) {
          fortLevels += sl.level;
        }
        if (sid.includes('abbey') || sid.includes('cathedral') || sid.includes('monastery') || sid.includes('church') || sid.includes('shrine') || sid.includes('parish')) {
          holySitesCount += 1;
        }
      }
    }
    const castleAndGarrisonUpkeep =
      Math.round((fortCastles * 0.4 + fortLevels * 0.12) * (0.7 + 0.3 * budget.armyMaintenanceRate) * circuitMonths * 10) / 10;
    const armsAndSuppliesUpkeep =
      Math.round((monarchMaA * 0.003 + fieldedMen * 0.0045 * (realmAtWar ? 1.3 : 0.65)) * circuitMonths * 10) / 10;

    // 4. Administration & Justice (Sheriffs, Bailiffs, Judges, Chancery Parchment/Wax, Itinerant Royal Travel)
    const chanceryInfo = getRealmChanceryEfficiency(realm.id, world);
    const realmCountiesCount = (realm.countyIds || []).length || Math.max(1, Math.ceil(realmBurgs.length / 2));
    const administrationAndJustice =
      Math.round(
        (0.75 + realmBurgs.length * 0.22 + realmCountiesCount * 0.18) *
          (1.1 - chanceryInfo.paperCoverage * 0.18) *
          circuitMonths *
          10
      ) / 10;

    // 5. Diplomacy & Patronage (Baron Gifts, Alliance Envoys, Hosting Foreign Dignitaries)
    const alliesCount = (realm.alliedRealmIds || []).length;
    const directVassalsCount = (world.characters || []).filter(
      (c) => c.isAlive && c.realmId === realm.id && c.id !== realm.rulerId && (c.titleTier === 'Duke' || c.titleTier === 'Count')
    ).length;
    const diplomacyAndPatronage =
      Math.round((0.55 + alliesCount * 0.35 + directVassalsCount * 0.16) * circuitMonths * 10) / 10;

    // 6. Religious Patronage (Monasteries, Abbeys, Crusades/Holy War Tithes)
    const atReligiousWar = (world.activeWars || []).some((w) => {
      if (w.attackerRealmId !== realm.id && w.defenderRealmId !== realm.id) return false;
      const foeId = w.attackerRealmId === realm.id ? w.defenderRealmId : w.attackerRealmId;
      const foe = world.realms?.find((r) => r.id === foeId);
      return Boolean(foe && foe.religion !== realm.religion);
    });
    const monarchZealous = Boolean(monarch && (monarch.v17Traits || []).includes('Zealous'));
    const religiousPatronage =
      Math.round(
        (0.45 + holySitesCount * 0.14) * (atReligiousWar ? 1.6 : 1.0) * (monarchZealous ? 1.25 : 1.0) * circuitMonths * 10
      ) / 10;

    // 7. Infrastructure Building Subsidies (Vault Cap overflow)
    const crownCap = Math.max(1200, Math.round(gdp * 8));
    let buildingSubsidies = 0;
    if ((realm.treasury || 0) > crownCap && realmBurgs.length > 0) {
      buildingSubsidies = Math.round(((realm.treasury || 0) - crownCap) * 0.12 * 10) / 10;
      const subShare = buildingSubsidies / realmBurgs.length;
      for (const b of realmBurgs) {
        const mkt = economy.burgMarkets?.[b.id];
        const nextB = Math.round(((mkt?.treasury ?? b.treasury ?? 0) + subShare) * 10) / 10;
        b.treasury = nextB;
        if (mkt) mkt.treasury = nextB;
      }
    }

    // Recirculate 55% of Castle Garrison, Arms/Supplies & Admin outlays into realm towns so closed-circuit liquidity stays healthy
    if (realmBurgs.length > 0) {
      const crownLocalStimulus = (castleAndGarrisonUpkeep + armsAndSuppliesUpkeep + administrationAndJustice) * 0.55;
      const sharePerBurg = crownLocalStimulus / realmBurgs.length;
      for (const b of realmBurgs) {
        const mkt = economy.burgMarkets?.[b.id];
        const nextB = Math.round(((mkt?.treasury ?? b.treasury ?? 0) + sharePerBurg) * 10) / 10;
        b.treasury = nextB;
        if (mkt) mkt.treasury = nextB;
      }
    }

    // 8. Domestic Debt Interest (~0.6% per month = 7.2% APR)
    const loanInterest = Math.round(budget.domesticDebtOwed * 0.006 * circuitMonths * 10) / 10;

    // Settle Crown Fisc (note customsTariffs & one-off cycle extras already adjusted realm.treasury when enacted)
    const recurringStateExpenses =
      civilListStipend +
      armyMaintenance +
      castleAndGarrisonUpkeep +
      armsAndSuppliesUpkeep +
      administrationAndJustice +
      diplomacyAndPatronage +
      religiousPatronage +
      buildingSubsidies +
      loanInterest;
    let nextCrown = (realm.treasury || 0) + grossCrownInflow - recurringStateExpenses;

    // Transfer 10% Civil List Stipend to Monarch Privy Purse
    if (monarch && civilListStipend > 0) {
      const actualPaidStipend = nextCrown >= 0 ? civilListStipend : Math.max(0, civilListStipend + nextCrown);
      monarch.treasury = Math.round(((monarch.treasury || 0) + actualPaidStipend) * 10) / 10;
    }

    // 9. Domestic Credit Pool Auto-Loan & Crown Bankruptcy
    if (nextCrown < 0) {
      const deficit = Math.abs(nextCrown);
      const loanUnit = Math.max(60, Math.round(gdp * 0.45));
      const maxLoans = Math.max(3, Math.floor(gdp / 40));
      const creditLimit = loanUnit * maxLoans;

      if (!isBankrupt && budget.domesticDebtOwed + deficit <= creditLimit) {
        const borrowAmt = Math.max(deficit, Math.min(loanUnit, creditLimit - budget.domesticDebtOwed));
        budget.domesticDebtOwed = Math.round((budget.domesticDebtOwed + borrowAmt) * 10) / 10;
        nextCrown = Math.round((nextCrown + borrowAmt) * 10) / 10;
      } else {
        // CROWN BANKRUPTCY! (5-year / 60-month insolvency debuff, clears debt, halves morale & tax efficiency)
        nextCrown = 0;
        budget.domesticDebtOwed = 0;
        budget.bankruptcyUntilYear = world.currentYear + 5;
        if (monarch) {
          monarch.prestige = Math.max(0, (monarch.prestige || 100) - 80);
          monarch.stress = Math.min(300, (monarch.stress || 0) + 45);
        }
        for (const army of realmArmies) {
          army.strength = Math.max(10, Math.round(army.strength * 0.85));
          if (army.regiments) {
            for (const reg of army.regiments) {
              reg.morale = Math.max(5, Math.round(reg.morale * 0.5));
            }
          }
        }
        if (!world.history) world.history = [];
        world.history.unshift({
          id: generateUniqueId('hist_bankruptcy'),
          year: world.currentYear,
          title: `Crown Bankruptcy Declared in ${realm.name}`,
          category: 'Great Cataclysm',
          description: `Exhausting all domestic credit lines, the Crown Fisc of ${realm.name} defaulted on sovereign obligations. Creditors liquidated royal bonds, halving army morale and tax collection efficiency until ${world.currentYear + 5}.`,
          realmId: realm.id,
          primaryActorId: monarch?.id,
        });
      }
    }

    realm.treasury = Math.max(0, Math.round(nextCrown * 10) / 10);
    const totalAdminReported =
      Math.round((administrationAndJustice + (pendingExtras.administrationAndJustice || 0)) * 10) / 10;
    const totalDiplomacyReported =
      Math.round((diplomacyAndPatronage + (pendingExtras.diplomacyAndPatronage || 0)) * 10) / 10;
    const totalReligionReported =
      Math.round((religiousPatronage + (pendingExtras.religiousPatronage || 0)) * 10) / 10;
    const totalSubsidiesReported =
      Math.round((buildingSubsidies + (pendingExtras.buildingSubsidies || 0)) * 10) / 10;
    const totalRansomsReported = Math.round((pendingExtras.ransomsPaid || 0) * 10) / 10;
    budget.lastReport = {
      domainTax: Math.round((domainTax / circuitMonths) * 10) / 10,
      vassalTax: Math.round((vassalTax / circuitMonths) * 10) / 10,
      scutageAndAidsIncome: Math.round((scutageAndAidsIncome / circuitMonths) * 10) / 10,
      customsTariffs: Math.round(customsTariffs * 10) / 10,
      mintingIncome: Math.round((mintingIncome / circuitMonths) * 10) / 10,
      civilListStipend: Math.round((civilListStipend / circuitMonths) * 10) / 10,
      armyMaintenance: Math.round((armyMaintenance / circuitMonths) * 10) / 10,
      castleAndGarrisonUpkeep: Math.round((castleAndGarrisonUpkeep / circuitMonths) * 10) / 10,
      armsAndSuppliesUpkeep: Math.round((armsAndSuppliesUpkeep / circuitMonths) * 10) / 10,
      ransomsPaid: Math.round((totalRansomsReported / circuitMonths) * 10) / 10,
      administrationAndJustice: Math.round((totalAdminReported / circuitMonths) * 10) / 10,
      diplomacyAndPatronage: Math.round((totalDiplomacyReported / circuitMonths) * 10) / 10,
      religiousPatronage: Math.round((totalReligionReported / circuitMonths) * 10) / 10,
      buildingSubsidies: Math.round((totalSubsidiesReported / circuitMonths) * 10) / 10,
      loanInterest: Math.round((loanInterest / circuitMonths) * 10) / 10,
      netBalance:
        Math.round(
          ((grossCrownInflow - recurringStateExpenses) / circuitMonths + customsTariffs) * 10
        ) / 10,
    };
    budget.pendingCycleTotals = {};

    // Update Monarch FiscalProfile treasury mirror cleanly
    if (monarch && economy.fiscalProfiles[monarch.id]) {
      economy.fiscalProfiles[monarch.id].treasuryReserves = monarch.treasury || 0;
    }
  }

  // 3C. Advance bespoke settlement development, peacetime devastation recovery & glacial organic urbanization
  advanceSettlementDevelopmentYear(world, circuitMonths / 12);

  // 4. Synchronize Realm Currencies, Money Velocity & Monetary Inflation
  if (economy.realmCurrencies) {
    for (const realm of world.realms || []) {
      const currency = economy.realmCurrencies[realm.id];
      if (!currency) continue;
      const vault = Math.max(0, Math.round(realm.treasury || 0));
      const realmBurgs = (world.burgs || []).filter((b) => b.stateId === realm.id);
      const realmUrbanPop = realmBurgs.reduce((acc, b) => acc + (b.population < 50 ? b.population * 1000 : b.population), 0);
      const totalCoffers = realmBurgs.reduce((acc, b) => acc + (b.treasury || 0), 0);
      const realmTurnover = realmBurgs.reduce((acc, b) => acc + (economy.burgMarkets[b.id]?.totalMarketVolume || 0), 0);
      const purity = economy.realmCoinPurity?.[realm.id] ?? 1.0;

      const hoardingDrag = Math.max(0, vault - 7500) * 0.65;
      const circulating = Math.max(3500, Math.round(realmUrbanPop * 0.055 + totalCoffers * 3.0 - hoardingDrag));
      currency.vaultReserves = vault;
      currency.circulatingSupply = circulating;
      currency.totalMintedSupply = vault + circulating;
      currency.coinPurity = purity;
      currency.velocity = Math.min(3.5, Math.max(0.75, Math.round((1.2 + realmTurnover / Math.max(15000, circulating)) * 100) / 100));
      currency.inflationRate = Math.round((((1.0 / Math.max(0.2, purity)) - 1.0) * 100 + (currency.velocity - 1.5) * 1.4) * 10) / 10;
    }
  }
}

// ============================================
// 6. GRESHAM'S LAW DEBASEMENT & INFLATION
// ============================================

export function debaseCurrency(
  world: WorldState,
  realmId: string,
  debasePurityDelta: number
): { success: boolean; message: string; newPurity: number; lumpSumGained: number } {
  const economy = ensureEconomy(world);
  const curPurity = economy.realmCoinPurity?.[realmId] ?? 1.0;
  const newPurity = Math.max(0.35, Math.round((curPurity - debasePurityDelta) * 100) / 100);

  if (economy.realmCoinPurity) {
    economy.realmCoinPurity[realmId] = newPurity;
  }

  const realm = world.realms?.find((r) => r.id === realmId);
  const lumpSumGained = Math.max(85, Math.min(280, Math.round(280 * (1.0 - newPurity + debasePurityDelta) * 2.5)));
  if (realm) {
    ensureRealmBudget(realm, world);
    realm.lastDebasementYear = world.currentYear;
    realm.treasury = Math.round(((realm.treasury || 0) + lumpSumGained) * 10) / 10;
  }
  const monarch = world.characters?.find((c) => c.id === realm?.rulerId);
  if (monarch) {
    monarch.prestige = Math.max(0, (monarch.prestige || 100) - 50);
    monarch.stress = Math.min(300, (monarch.stress || 0) + 25);
  }

  for (const burg of world.burgs || []) {
    if (burg.stateId === realmId && economy.burgMarkets[burg.id]) {
      const bMarket = economy.burgMarkets[burg.id];
      const inflation = 1.0 / newPurity;
      for (const commKey in bMarket.markets) {
        const m = bMarket.markets[commKey as CommodityType];
        m.currentPrice = calculateMarketPrice(m, inflation, 0.40);
      }
    }
  }

  return {
    success: true,
    message: `CURRENCY DEBASED: Coin purity reduced to ${(newPurity * 100).toFixed(0)}%. Royal mint yielded an emergency liquidity windfall of ${lumpSumGained}g into the Crown Fisc, spurring realm-wide market inflation.`,
    newPurity,
    lumpSumGained,
  };
}

// ============================================
// 7. DEFINED CURRENCIES & FINITE MONEY SUPPLY
// ============================================

export function createDefaultRealmCurrencies(world: WorldState): Record<string, RealmCurrency> {
  const result: Record<string, RealmCurrency> = {};
  const currencyTemplates = [
    { name: 'Imperial Golden Crown', symbol: '👑', standard: 'Gold' as const },
    { name: 'Royal Silver Florin', symbol: '⚜️', standard: 'Silver' as const },
    { name: 'Lion Ducat', symbol: '🦁', standard: 'Gold' as const },
    { name: 'Sterling Groat', symbol: '🪙', standard: 'Silver' as const },
    { name: 'Dragon Guilder', symbol: '🐉', standard: 'Bimetallic' as const },
    { name: 'Gilded Thaler', symbol: '✦', standard: 'Gold' as const },
  ];

  const realms = world.realms || [];
  for (let i = 0; i < realms.length; i++) {
    const realm = realms[i];
    const tmpl = currencyTemplates[i % currencyTemplates.length];
    const ruler = world.characters?.find((c) => c.id === realm.rulerId);
    
    // DYNAMIC LINK: The Vault Reserves are the ruler's actual treasury bullion!
    const vault = Math.max(250, Math.round(ruler?.treasury || 4800));
    
    // Circulating supply in peasant/merchant hands scales with county count and dev
    const numCounties = realm.countyIds?.length || 4;
    const circulating = Math.round(numCounties * 1800 + vault * 2.5);
    const totalMinted = vault + circulating;
    
    const purity = world.economy?.realmCoinPurity?.[realm.id] ?? 1.0;

    result[realm.id] = {
      realmId: realm.id,
      currencyName: `${realm.name} ${tmpl.name.split(' ').slice(1).join(' ')}`,
      symbol: tmpl.symbol,
      standard: tmpl.standard,
      totalMintedSupply: totalMinted,
      circulatingSupply: circulating,
      vaultReserves: vault,
      coinPurity: purity,
      velocity: 1.85,
      inflationRate: Math.round(((1.0 / purity) - 1.0) * 100 * 10) / 10 + 2.1,
      seigniorageMonthly: Math.round(numCounties * 0.45 * 10) / 10,
    };
  }
  return result;
}
export function getRealmCurrency(realmId: string, world: WorldState): RealmCurrency {
  const economy = ensureEconomy(world);
  if (!economy.realmCurrencies) {
    economy.realmCurrencies = createDefaultRealmCurrencies(world);
  }
  if (!economy.realmCurrencies[realmId]) {
    const realm = world.realms?.find(r => r.id === realmId);
    const realmName = realm?.name || 'Sovereign Realm';
    const ruler = realm?.rulerId ? world.characters?.find((c) => c.id === realm.rulerId) : undefined;
    const vault = Math.max(20, Math.round(ruler?.treasury || 350));
    const circulating = Math.round(vault * 3.5 + 1200);

    economy.realmCurrencies[realmId] = {
      realmId,
      currencyName: `${realmName} Royal Crown`,
      symbol: '👑',
      standard: 'Gold',
      totalMintedSupply: vault + circulating,
      circulatingSupply: circulating,
      vaultReserves: vault,
      coinPurity: economy.realmCoinPurity?.[realmId] ?? 1.0,
      velocity: 1.8,
      inflationRate: 2.2,
      seigniorageMonthly: 2.5,
    };
  }
  return economy.realmCurrencies[realmId];
}

// ============================================
// 8. HISTORICAL BARTERING & PHYSICAL COMMODITY EXCHANGE
// ============================================

export function calculateBarterRatio(
  goodA: CommodityType,
  goodB: CommodityType,
  market?: BurgMarket
): { ratio: number; explanation: string } {
  const metaA = COMMODITIES[goodA];
  const metaB = COMMODITIES[goodB];
  const priceA = market?.markets[goodA]?.currentPrice || metaA?.basePrice || 10;
  const priceB = market?.markets[goodB]?.currentPrice || metaB?.basePrice || 10;

  // Durability premium: Imperishable goods command a slight barter premium over perishable goods
  const durabilityScoreA = metaA?.durability === 'Imperishable' ? 1.0 : metaA?.durability === 'Semi-durable' ? 0.92 : 0.82;
  const durabilityScoreB = metaB?.durability === 'Imperishable' ? 1.0 : metaB?.durability === 'Semi-durable' ? 0.92 : 0.82;
  const durabilityFactor = durabilityScoreB / durabilityScoreA;

  // How many units of Good A are needed to trade for 1 unit of Good B
  const rawRatio = (priceB / priceA) * durabilityFactor;
  const ratio = Math.round(rawRatio * 100) / 100;

  return {
    ratio,
    explanation: `${ratio} ${goodA} (${metaA?.durability || 'Semi-durable'}) for 1 ${goodB} (${metaB?.durability || 'Semi-durable'})`,
  };
}

export function calculateBurgBarterShare(burg: Burg, world: WorldState): number {
  const baseShare =
    burg.type === 'Farming Village' || burg.type === 'Mountain Hamlet' ? 0.72 :
    burg.type === 'Border Fortress' || burg.type === 'Ancient Sanctuary' ? 0.58 :
    burg.type === 'Market Town' || burg.type === 'Fishing Port' ? 0.44 :
    burg.type === 'Trade Port' ? 0.24 :
    burg.type === 'Capital Citadel' ? 0.18 : 0.12;

  // Currency debasement & hoarding coin shortage effect: when coins are debased or scarce, citizens revert to barter!
  const economy = ensureEconomy(world);
  const coinPurity = economy.realmCoinPurity?.[burg.stateId] ?? 1.0;
  const debasementBarterSurge = Math.max(0, (1.0 - coinPurity) * 0.60);
  const cofferCash = burg.treasury ?? 30;
  const coinShortageBarterSurge = cofferCash < 20 ? ((20 - cofferCash) / 20) * 0.25 : 0;

  return Math.min(0.95, Math.round((baseShare + debasementBarterSurge + coinShortageBarterSurge) * 100) / 100);
}

export function getBurgBarterTransactions(burg: Burg, world: WorldState): BarterTransaction[] {
  const market = world.economy?.burgMarkets?.[burg.id];

  const barterPairs: [CommodityType, CommodityType, string][] = [
    ['Grain', 'Iron', 'Agrarian smallfolk barter grain for smithing plows & sickle blades'],
    ['Timber', 'Dried Fish', 'Foresters trade seasoned timbers for salt-cured maritime protein'],
    ['Wool', 'Salt', 'Shepherds exchange raw fleeces for brine to cure and preserve meats'],
    ['Clay & Pottery', 'Olive Oil', 'Potters trade amphora storage vessels for pressed winter lamp oil'],
    ['Linen & Flax', 'Crossbow Bolts', 'Weavers trade spun flax cloth to citadel garrison for fletched bolts'],
    ['Tanned Leather', 'Ale & Beer', 'Cobblers barter cowhide boot leather at the town tavern fair'],
    ['Coal', 'Cheese', 'Highland colliers trade fuel lump coal for highland cheese wheels'],
    ['Herbs', 'Honey', 'Village herbalists trade mountain remedies for winter comb honey'],
  ];

  return barterPairs.slice(0, 4).map(([goodA, goodB, reason], idx) => {
    const { ratio } = calculateBarterRatio(goodA, goodB, market);
    const amountB = idx % 2 === 0 ? 2 : 1;
    const amountA = Math.max(1, Math.round(ratio * amountB * 10) / 10);
    const metaB = COMMODITIES[goodB];
    const estGold = Math.round((metaB?.basePrice || 15) * amountB);

    return {
      id: `barter_${burg.id}_${idx}`,
      burgId: burg.id,
      offeredGood: goodA,
      offeredAmount: amountA,
      demandedGood: goodB,
      demandedAmount: amountB,
      exchangeRatio: ratio,
      estimatedGoldValue: estGold,
      reason,
    };
  });
}

// ============================================================================
// 9. POPULATION STRATA, REAL WAGES & LIVING STANDARDS SIMULATION
// ============================================================================

export function updateSocioeconomicStrata(
  burg: Burg,
  bMarket: BurgMarket,
  world: WorldState
): void {
  const totalPop = burg.population || 2500;
  const dev = burg.developmentLevel || 30;

  // 1. Demographics breakdown based on settlement classification
  const ratios: Record<SocialStratum, number> =
    burg.type === 'Farming Village'
      ? { Peasants: 0.85, Artisans: 0.08, Merchants: 0.03, Clergy: 0.03, Nobility: 0.01 }
      : burg.type === 'Trade Port' || burg.type === 'Fishing Port'
      ? { Peasants: 0.48, Artisans: 0.22, Merchants: 0.20, Clergy: 0.06, Nobility: 0.04 }
      : burg.type === 'Capital Citadel'
      ? { Peasants: 0.36, Artisans: 0.28, Merchants: 0.16, Clergy: 0.10, Nobility: 0.10 }
      : burg.type === 'Border Fortress' || burg.type === 'Mountain Hamlet'
      ? { Peasants: 0.52, Artisans: 0.24, Merchants: 0.06, Clergy: 0.06, Nobility: 0.12 }
      : /* Market Town / Royal Metropolis */
        { Peasants: 0.55, Artisans: 0.25, Merchants: 0.12, Clergy: 0.05, Nobility: 0.03 };

  // 2. Pricing lookups for living baskets
  const getPrice = (comm: CommodityType, fallback: number) =>
    bMarket.markets[comm]?.currentPrice || fallback;

  const grainPrice = getPrice('Grain', 10);
  const saltPrice = getPrice('Salt', 22);
  const alePrice = getPrice('Ale & Beer', 14);
  const timberPrice = getPrice('Timber', 14);
  const coalPrice = getPrice('Coal', 15);
  const woolPrice = getPrice('Wool', 20);
  const leatherPrice = getPrice('Tanned Leather', 24);
  const clothPrice = getPrice('Fine Woolen Cloth', 44);
  const winePrice = getPrice('Wine', 32);
  const silkPrice = getPrice('Silk', 90);
  const toolsPrice = getPrice('Tools & Ironware', 26);
  const medPrice = getPrice('Apothecary Remedies', 38);

  const isWinter = world.currentSeason === 'Winter';
  const hasPlague = (world.epidemics || []).some((e) => e.infectedProvinceIds.includes(burg.countyId));
  const winterFuelCost = isWinter ? timberPrice * 0.14 + coalPrice * 0.12 : 0;
  const plagueMedCost = hasPlague ? medPrice * 0.18 : 0;

  // 3. Basket costs per class (with Winter Fuel & Plague Meds)
  const peasantBasketCost =
    grainPrice * 0.4 +
    saltPrice * 0.05 +
    alePrice * 0.15 +
    timberPrice * 0.15 +
    woolPrice * 0.1 +
    winterFuelCost +
    plagueMedCost * 0.7;
  const artisanBasketCost =
    grainPrice * 0.3 +
    alePrice * 0.2 +
    leatherPrice * 0.15 +
    timberPrice * 0.15 +
    clothPrice * 0.1 +
    toolsPrice * 0.08 +
    winterFuelCost +
    plagueMedCost;
  const merchantBasketCost =
    grainPrice * 0.2 +
    winePrice * 0.25 +
    clothPrice * 0.2 +
    silkPrice * 0.1 +
    timberPrice * 0.15 +
    winterFuelCost * 0.8 +
    plagueMedCost;
  const clergyBasketCost =
    grainPrice * 0.25 +
    winePrice * 0.25 +
    saltPrice * 0.1 +
    timberPrice * 0.2 +
    winterFuelCost * 0.6 +
    plagueMedCost;
  const nobilityBasketCost =
    winePrice * 0.4 +
    silkPrice * 0.3 +
    clothPrice * 0.2 +
    getPrice('Crossbow Bolts', 38) * 0.1 +
    plagueMedCost;

  // Coin shortage / hoarding dampens real local wages when town coffers run dry
  const cofferLiquidity = Math.min(1.15, Math.max(0.65, (bMarket.treasury ?? burg.treasury ?? 40) / 30));
  const localStimulus = burg.economicLedger?.localWageInjection || 0;

  // 4. Incomes earned from real productivity + closed-circuit local wage stimulus
  const baseAgriWage = Math.max(4.0, (grainPrice * 0.55 + alePrice * 0.22 + timberPrice * 0.12) * (dev / 25) * cofferLiquidity) + localStimulus * 0.04;
  const baseArtisanWage = Math.max(5.5, (clothPrice * 0.16 + leatherPrice * 0.15 + timberPrice * 0.12) * (dev / 22) * cofferLiquidity) + localStimulus * 0.08;
  const baseMerchantIncome = Math.max(8.0, (bMarket.totalMarketVolume / Math.max(1, totalPop * 0.001)) * 0.25 * cofferLiquidity);
  const baseClergyIncome = Math.max(4.5, baseAgriWage * 0.3 + baseMerchantIncome * 0.2);
  const baseNobilityIncome = Math.max(14.0, (burg.economicLedger?.totalRevenue || 40) / Math.max(1, totalPop * 0.0005));

  const strataData: Record<SocialStratum, PopulationStratumData> = {
    Peasants: createStratum('Peasants', Math.round(totalPop * ratios.Peasants), baseAgriWage, peasantBasketCost, burg),
    Artisans: createStratum('Artisans', Math.round(totalPop * ratios.Artisans), baseArtisanWage, artisanBasketCost, burg),
    Merchants: createStratum('Merchants', Math.round(totalPop * ratios.Merchants), baseMerchantIncome, merchantBasketCost, burg),
    Clergy: createStratum('Clergy', Math.round(totalPop * ratios.Clergy), baseClergyIncome, clergyBasketCost, burg),
    Nobility: createStratum('Nobility', Math.round(totalPop * ratios.Nobility), baseNobilityIncome, nobilityBasketCost, burg),
  };

  burg.strata = strataData;

  const weightedSoL =
    (strataData.Peasants.standardOfLiving * strataData.Peasants.count +
      strataData.Artisans.standardOfLiving * strataData.Artisans.count +
      strataData.Merchants.standardOfLiving * strataData.Merchants.count +
      strataData.Clergy.standardOfLiving * strataData.Clergy.count +
      strataData.Nobility.standardOfLiving * strataData.Nobility.count) /
    totalPop;

  burg.standardOfLiving = Math.round(weightedSoL * 100) / 100;

  const smallfolkTotal = Math.max(1, strataData.Peasants.count + strataData.Artisans.count + strataData.Merchants.count);
  const weightedUnrest =
    (strataData.Peasants.unrest * strataData.Peasants.count +
      strataData.Artisans.unrest * strataData.Artisans.count +
      strataData.Merchants.unrest * strataData.Merchants.count) /
    smallfolkTotal;

  burg.unrest = Math.round(weightedUnrest);

  // ORGANIC BREAD RIOT TRIGGER:
  if (strataData.Peasants.unrest >= 75 && Math.random() < 0.25) {
    burg.developmentLevel = Math.max(5, (burg.developmentLevel || 30) - 2);
    if (!world.history) world.history = [];
    world.history.unshift({
      id: generateUniqueId('hist_unrest_riot'),
      year: world.currentYear,
      title: `Bread Riot: Smallfolk Uprising in ${burg.name}`,
      category: 'Great Cataclysm',
      description: `Spurred by soaring grain costs (${grainPrice.toFixed(1)}g) and a collapsing standard of living (SoL: ${strataData.Peasants.standardOfLiving.toFixed(2)}), ${strataData.Peasants.count.toLocaleString()} smallfolk took up scythes and ransacked municipal granaries!`,
      realmId: burg.stateId,
      primaryActorId: burg.ownerId,
    });
  }
}

function createStratum(
  stratum: SocialStratum,
  count: number,
  income: number,
  livingCost: number,
  burg: Burg
): PopulationStratumData {
  const sol = Math.round((income / Math.max(0.5, livingCost)) * 100) / 100;

  let sentiment: StratumSentiment = 'Content';
  let unrestDelta = 0;

  if (sol >= 1.35) {
    sentiment = 'Thriving';
    unrestDelta = -8;
  } else if (sol >= 0.95) {
    sentiment = 'Content';
    unrestDelta = -3;
  } else if (sol >= 0.70) {
    sentiment = 'Struggling';
    unrestDelta = +6;
  } else {
    sentiment = 'Rebellious';
    unrestDelta = +14;
  }

  const existingUnrest = burg.strata?.[stratum]?.unrest ?? 10;
  const unrest = Math.max(0, Math.min(100, existingUnrest + unrestDelta));

  return {
    stratum,
    count,
    averageIncome: Math.round(income * 10) / 10,
    livingCost: Math.round(livingCost * 10) / 10,
    standardOfLiving: sol,
    unrest,
    sentiment,
  };
}