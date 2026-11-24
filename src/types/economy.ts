// ============================================================================
// 1. COMMODITY TAXONOMY & CLASSIFICATION
// ============================================================================

export type CommodityType =
  // Original 22 Commodities
  | 'Grain'
  | 'Timber'
  | 'Iron'
  | 'Salt'
  | 'Wine'
  | 'Silk'
  | 'Spices'
  | 'Silver'
  | 'Gold'
  | 'Livestock'
  | 'Stone'
  | 'Wool'
  | 'Copper'
  | 'Coal'
  | 'Glassware'
  | 'Dyes'
  | 'Incense'
  | 'Furs'
  | 'Honey'
  | 'Fine Porcelain'
  | 'Herbs'
  | 'Gems'
  // 30 Additional Commodities Categorized by Geography, Purpose, Accessibility & Durability
  | 'Dried Fish'
  | 'Olive Oil'
  | 'Ale & Beer'
  | 'Cheese'
  | 'Orchard Fruit'
  | 'Tin'
  | 'Lead'
  | 'Sulfur'
  | 'Tar & Pitch'
  | 'Warhorses'
  | 'Crossbow Bolts'
  | 'Linen & Flax'
  | 'Tanned Leather'
  | 'Fine Woolen Cloth'
  | 'Parchment & Vellum'
  | 'Rope & Cordage'
  | 'Clay & Pottery'
  | 'Bricks & Mortar'
  | 'Marble'
  | 'Quarried Slate'
  | 'Amber'
  | 'Pearls'
  | 'Ivory'
  | 'Tapestries'
  | 'Fine Saffron'
  | 'Medicinal Leeches'
  | 'Alchemical Mercury'
  | 'Myrrh & Resins'
  | 'Holy Relics'
  | 'Beeswax Candles'
  // 10 Essential Commodities
  | 'Tools & Ironware'
  | 'Steel Arms & Armor'
  | 'Bronze & Brassware'
  | 'Saltpeter'
  | 'Blackpowder'
  | 'Paper & Codices'
  | 'Apothecary Remedies'
  | 'Jewelry & Regalia'
  | 'Cane Sugar'
  | 'Distilled Spirits';

export type CommodityCategory =
  | 'ESSENTIAL_FOOD'
  | 'RAW_MATERIAL'
  | 'MANUFACTURED'
  | 'LUXURY'
  | 'BULLION';

export type CommodityGeography =
  | 'Coastal/Maritime'
  | 'Fertile Lowlands'
  | 'Highlands/Mountains'
  | 'Arid Steppe/Desert'
  | 'Boreal Forest/Taiga'
  | 'River Basin';

export type CommodityPurpose =
  | 'Staple Food'
  | 'Military & Strategic'
  | 'Civic & Construction'
  | 'Manufactured & Textile'
  | 'Luxury & Prestige'
  | 'Medicinal & Sacred';

export type CommodityAccessibility =
  | 'Abundant'
  | 'Regional'
  | 'Scarce'
  | 'Exotic';

export type CommodityDurability =
  | 'Perishable'
  | 'Semi-durable'
  | 'Imperishable';

export interface CommodityMetadata {
  commodity: CommodityType;
  category: CommodityCategory;
  geography: CommodityGeography;
  purpose: CommodityPurpose;
  accessibility: CommodityAccessibility;
  durability: CommodityDurability;
  basePrice: number;
  defaultElasticity: number;
  spoilageRate: number;        // Monthly percentage decay (e.g. 0.08 for perishable foods, 0.0 for metals)
  transportWeight: number;     // Logistics burden per unit
  essentialTier: number;       // 0 = survival essential, 1 = civic, 2 = comfort, 3 = luxury, 4 = bullion
}

// ============================================================================
// 2. MARKET EQUILIBRIUM & COMMODITIES
// ============================================================================

export interface CommodityMarket {
  commodity: CommodityType;
  basePrice: number;
  currentPrice: number;
  stockpile: number;
  monthlyProduction: number;
  monthlyConsumption: number;
  elasticity: number; // Gamma price-sensitivity factor

  // Advanced Flow Controls
  lastMonthPrice?: number;
  maxStockpileCapacity?: number;
  priceFloor?: number;
  priceCeiling?: number;

  // Real Production Chain Tracking
  bottleneckInput?: CommodityType; // Which raw input is missing/starving production
  throughputRate?: number;         // 0.0 (halted) to 1.0 (100% capacity)
}

export type FoodSecurityState = 'SECURE' | 'STRAINED' | 'RATIONED' | 'FAMINE';

export interface BurgMarket {
  burgId: string;
  burgName?: string;
  markets: Record<CommodityType, CommodityMarket>;
  tariffRate: number; // 0.0 to 0.15
  isStarving: boolean; // Backwards-compatible flag for legacy UI & capacity checks
  totalMarketVolume: number;

  // Living Economy Extensions
  foodSecurity?: FoodSecurityState;
  monthsOfFoodReserves?: number;
  tradeConnectivity?: number; // Infrastructure transport multiplier (0.1 to 2.0)
  connectedBurgIds?: string[]; // Neighboring trade nodes for price arbitrage
  treasury?: number; // Victoria Municipal Pool synced with burg.treasury
  workingCapitalFloat?: number; // Initial protected working-capital float never taxed
}

// ============================================================================
// 3. PATRICIAN BANKING & SOVEREIGN LEVERAGE
// ============================================================================

export interface BankInstitution {
  id: string;
  name: string;
  headquartersBurgId: string;
  treasury: number;
  baseInterestRate: number; // e.g. 0.08 = 8% per annum
  activeLoans: BankLoan[];

  // Patrician Families & Institutional Personality
  patricianCharacterId?: string;
  patricianName?: string;
  houseName?: string;
  patricianTitle?: string;
  reputationDescription?: string;
  isSolvent?: boolean;
  opinionOfCrown?: number; // -100 to +100
}

export interface BankLoan {
  id: string;
  bankName: string;
  bankId?: string;
  borrowerId: string;
  principal: number;
  remainingBalance: number;
  annualInterestRate: number;
  monthsRemaining: number;
  collateralHoldingId?: string;
  isDefaulted: boolean;

  // Political Leverage
  patricianHookGranted?: boolean; // Granted to patrician family on loan default
}

// ============================================================================
// 4. FISCAL PROFILES & MONETARY POLICY
// ============================================================================

export type FiscalStance = 'Austerity' | 'Balanced' | 'Lavish';

export interface FiscalProfile {
  demesneIncome: number;
  vassalTribute: number;
  tariffIncome: number;
  totalRevenue: number;
  armyUpkeep: number;
  courtSplendorCost: number;
  estateMaintenance?: number;
  estateAdministration?: number;
  householdUpkeep?: number;
  scutageAndAidsExpense?: number;
  youngerSonsAndDowries?: number;
  religiousPatronage?: number;
  tournamentAndPageantry?: number;
  seasonalShockExpense?: number;
  seasonalExpenseLabel?: string;
  vaultHoardingDrag?: number;
  surplusReinvested?: number;
  debtServicing: number;
  totalExpenses: number;
  netMonthlyCashflow: number;
  coinPurity: number; // 1.0 = Pure coinage, 0.4 = Severely debased

  // Advanced Crown Monetary Mechanics
  entityId?: string;
  treasuryReserves?: number;
  vaultCap?: number;
  fiscalStance?: FiscalStance;
  inflationFactor?: number; // Proportional inverse of coinPurity
  monthsSinceDebasement?: number;

  // Closed Monetary Circuit Tracking
  retainedFiefReserves?: number; // Actual cash left in fief coffers
  wagesInjectedLocally?: number; // Upkeep/splendor paid back to local smallfolk
  fiefSolvencyRatio?: number;   // 0.0 to 1.0 (How solvent the realm's towns are)
  tributeOwedToLiege?: number;   // Monthly feudal tithe owed to overlord
  navalTransportUpkeep?: number; // Ongoing monthly ship hire & naval transport cost
  austerityTier?: 'none' | 'tightening' | 'retrenchment'; // Automatic anti-bankruptcy fiscal safeguard
}

// ============================================================================
// 5. DEFINED REALM CURRENCY & FINITE MONEY SUPPLY
// ============================================================================

export interface RealmCurrency {
  realmId: string;
  currencyName: string;         // e.g. "Imperial Golden Crown", "Sterling Florin", "Lion Ducat"
  symbol: string;               // e.g. "👑", "⚜️", "🪙", "✦"
  standard: 'Gold' | 'Silver' | 'Bimetallic';
  totalMintedSupply: number;    // Finite money supply minted from bullion reserves (e.g. 180,000)
  circulatingSupply: number;    // Actively circulating in commerce & marketplaces (e.g. 135,000)
  vaultReserves: number;        // In sovereign vaults & patrician bank vaults (e.g. 45,000)
  coinPurity: number;           // 1.0 = Pure fineness, down to 0.35 = heavily debased
  velocity: number;             // M2 Money velocity (turnover rate per year, e.g. 1.8x)
  inflationRate: number;        // Real goods purchasing power inflation % based on circulating supply & debasement
  seigniorageMonthly: number;   // Monthly revenue earned from the mint
}

// ============================================================================
// 6. HISTORICAL BARTER SYSTEM (NON-COIN COMMODITY COMMERCE)
// ============================================================================

export interface BarterTransaction {
  id: string;
  burgId: string;
  offeredGood: CommodityType;
  offeredAmount: number;
  demandedGood: CommodityType;
  demandedAmount: number;
  exchangeRatio: number;        // How many units of offeredGood equal 1 unit of demandedGood
  estimatedGoldValue: number;
  reason: string;               // e.g. "Rural grain barter for blacksmith tools", "Coin shortage in frontier parish"
}

export interface BarterRatio {
  fromGood: CommodityType;
  toGood: CommodityType;
  ratio: number;
  durabilityDiscount: number;
}

// ============================================================================
// 7. GLOBAL ECONOMIC STATE
// ============================================================================

export interface EconomyState {
  burgMarkets: Record<string, BurgMarket>;
  bankInstitutions: BankInstitution[];
  fiscalProfiles: Record<string, FiscalProfile>;
  realmCoinPurity: Record<string, number>;
  realmCurrencies?: Record<string, RealmCurrency>;
  barterTransactions?: BarterTransaction[];
  totalTradeFlowVolume?: number;
  lootedCaravansCount?: number;
  globalBullionMinedSilver?: number;
  globalBullionMinedGold?: number;
}

// ============================================================================
// 8. INPUT-OUTPUT PRODUCTION RECIPES
// ============================================================================

export interface ProductionRecipe {
  outputGood: CommodityType;
  inputs: Array<{ commodity: CommodityType; amount: number }>;
  baseYield: number;
  requiredBuilding?: string;
  description: string;
}

// ============================================================================
// 9. SOCIOECONOMIC STRATA & STANDARD OF LIVING
// ============================================================================

export type SocialStratum = 'Peasants' | 'Artisans' | 'Merchants' | 'Clergy' | 'Nobility';

export type StratumSentiment = 'Thriving' | 'Content' | 'Struggling' | 'Rebellious';

export interface PopulationStratumData {
  stratum: SocialStratum;
  count: number;             // Actual population headcount
  averageIncome: number;     // Monthly income earned from labor/profit
  livingCost: number;        // Cost of their required goods basket
  standardOfLiving: number;  // Ratio: averageIncome / livingCost
  unrest: number;            // 0 to 100
  sentiment: StratumSentiment;
}