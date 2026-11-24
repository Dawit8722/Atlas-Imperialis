import type { EconomyState, FoodSecurityState } from './economy';
import type { SiegeState, ActiveWar, Regiment, Army, BattleTactic } from './warfare';
import type { HeraldryConfig } from '../engine/heraldry';

export interface CoatOfArmsData {
  symbol: string;
  bg: string;
  fg: string;
  config?: HeraldryConfig;
  blazon?: string;
}


export type MapMode =
  | 'political'
  | 'geographic'
  | 'economic'
  | 'cultural'
  | 'religious'
  | 'diplomatic'
  | 'population';

export type LoreCategory =
  | 'Kingdoms & Empires'
  | 'Dynasties & Dramatis Personae'
  | 'Settlements & Citadels'
  | 'The High Sagas & Epics'
  | 'Cultures & Peoples'
  | 'Religions & Pantheons'
  | 'Geography & Landmarks'
  | 'Chronicles & Historical Eras';

export interface LoreEntity {
  id: string;
  category: LoreCategory;
  name: string;
  summary: string;
  body_markdown: string;
  stateId?: string;
  burgId?: string;
  characterId?: string;
  tags?: string[];
}

export type TraitCategory =
  | 'personality'
  | 'education'
  | 'congenital'
  | 'physical'
  | 'health'
  | 'commander'
  | 'lifestyle'
  | 'fame'
  | 'status';

export interface CharacterTrait {
  id: string;
  name: string;
  description: string;
  category: TraitCategory;
  oppositeId?: string;
  tier?: number;
  diplomacyMod: number;
  martialMod: number;
  stewardshipMod: number;
  intrigueMod: number;
  learningMod: number;
  prowessMod?: number;
  dreadMod?: number;
  aiHonor?: number;
  aiGreed?: number;
  aiRationality?: number;
  aiZeal?: number;
  aiVengefulness?: number;
}

export type CourtRole =
  | 'Monarch'
  | 'Consort'
  | 'Crown Heir'
  | 'Heir'
  | 'Child'
  | 'Cadet Prince'
  | 'Cadet Princess'
  | 'Noble Scion'
  | 'Court Noble'
  | 'Legitimated Bastard'
  | 'Disinherited Bastard'
  | 'Dowager Regent'
  | 'Royal Uncle'
  | 'Chancellor'
  | 'Marshal'
  | 'Steward'
  | 'Spymaster'
  | 'Court Chaplain'
  | 'Court Champion'
  | 'Court Physician'
  | 'Court Antiquarian'
  | 'Grand Equerry'
  | 'Royal Cupbearer'
  | 'High Inquisitor'
  | 'Court Jester'
  | 'Vassal Duke'
  | 'Vassal Count'
  | 'Vassal Baron'
  | 'Lord Mayor'
  | 'Merchant Guildmaster'
  | 'Guildmaster'
  | 'Portmaster'
  | 'Vassal Consort'
  | 'Vassal Heir'
  | 'Dungeon Prisoner'
  | 'Exiled Claimant'
  | 'Master Artisan'
  | 'Peasant Folk Hero'
  | 'Captain of the Guard'
  | 'Hedge Knight'
  | 'Smuggler King'
  | 'Village Bailiff'
  | 'Yeoman Miller'
  | 'Village Herbalist'
  | 'Wandering Bard';

export type TitleTier = 'Emperor' | 'King' | 'Duke' | 'Count' | 'Baron' | 'Mayor' | 'Commoner';

export type AIArchetype =
  | 'Honorable Paragon'
  | 'Ruthless Schemer'
  | 'Craven Sycophant'
  | 'Religious Zealot'
  | 'Hedonistic Tyrant'
  | 'Scholarly Hermit'
  | 'Warmonger Vanguard'
  | 'Gluttonous Usurper'
  | 'Vengeful Bastard'
  | 'Benevolent Builder'
  | 'Tragic Romantic';

export interface CharacterHook {
  targetId: string;
  targetName: string;
  holderId?: string;
  holderName?: string;
  type: 'Strong' | 'Weak';
  reason: string;
}

export interface V17Secret {
  secretType: string;
  targetId: string;
  holderId: string;
  lethality: number;
}

export interface Character {
  id: string;
  name: string;
  houseName: string;
  houseMotto: string;
  title: string;
  role: CourtRole;
  gender: 'male' | 'female';
  age: number;
  birthYear?: number;
  deathYear?: number;
  causeOfDeath?: string;
  deathCategory?: DeathCategory;
  investitureYear?: number;
  marriageYear?: number;
  marriageType?: 'Patrilineal' | 'Matrilineal' | 'Royal Union' | 'Consanguineous';
  isAlive: boolean;
  realmId: string;
  countyId?: string;

  // The 5 Sovereign Skills + Prowess
  baseDiplomacy: number;
  baseMartial: number;
  baseStewardship: number;
  baseIntrigue: number;
  baseLearning: number;
  baseProwess: number;

  // Character Trait Arrays
  personalityTraits: string[];
  educationTrait?: string;
  congenitalTraits: string[];
  physicalHealthTraits: string[];
  commanderTraits: string[];
  lifestyleTraits: string[];
  statusTrait?: string;
  battlesFought?: number;
  battlesWon?: number;
  battleExperience?: number;
  warTraitEvents?: string[];
  // Childhood Growth, Evolution, Fosterage & Apprenticeship (traits lock at age 21)
  traitsLockedAt21?: boolean;
  childhoodFocus?: 'diplomacy' | 'martial' | 'stewardship' | 'intrigue' | 'learning';
  fosterRealmId?: string;
  apprenticeshipType?: 'Squire & Knighthood' | 'Stewardship Guild' | 'Chancery Clerk' | 'Scholastic Abbey' | 'Shadowcraft';
  apprenticeshipMasterId?: string;
  lockedFromAutoSim?: boolean;

  // Psychological & Political Drivers
  aiArchetype: AIArchetype;
  stress: number;
  stressLevel: 0 | 1 | 2 | 3;
  stressCopingMechanism?: string;
  dread: number;
  prestige: number;
  piety: number;

  // Story & Character Persona
  ambition: string;
  tragicFlaw: string;
  darkSecret: string;
  sacredOath: string;

  // Secrets & Blackmail Hooks
  knownSecrets: string[];
  hooksHeld: CharacterHook[];
  hooksOnMe: CharacterHook[];
  hooks?: CharacterHook[];

  // Narrative Relationships
  opinions: Record<string, number>;
  spouseId?: string;
  heirId?: string;
  liegeId?: string;
  rivalId?: string;
  friendId?: string;
  loverId?: string;
  bastardIds?: string[];

  // Active Narrative Scheme
  activeScheme?: {
    type: string;
    targetId: string;
    targetName: string;
    motive: string;
    progress: number;
  };

  coatOfArms?: CoatOfArmsData;
  isNobleHouse?: boolean;
  hasPersonalBanner?: boolean;
  customHeraldry?: boolean;
  isCadetFounder?: boolean;
  cadetParentHouse?: string;
  bannerBestowedById?: string;
  bannerBestowedByName?: string;
  bannerBestowedYear?: number;

  // ==========================================
  // GRAND STRATEGY V17 LIVING ARCHITECTURE
  // ==========================================
  provinceId?: string;
  isTraveling?: boolean;
  travelDestProvinceId?: string;
  travelMonthsLeft?: number;
  travelPurpose?: string;

  claims?: Claim[];
  organicGravitas?: OrganicGravitas;
  courtPosition?: CourtPosition;
  psychState?: PsychologicalState;
  
  loyalty?: number;
  ambitionScore?: number;
  fiscalStance?: 'Austerity' | 'Balanced' | 'Lavish';
  treasuryCap?: number;
  autoReinvestSurplus?: boolean;
  paranoia?: number;
  contentment?: number;
  menAtArms?: number;
  treasury?: number;

  isExcommunicated?: boolean;
  isImprisoned?: boolean;
  isBanished?: boolean;
  isMonk?: boolean;
  recentlyInherited?: boolean;
  monthsSinceInheritance?: number;

  vassalIds?: string[];
  regentId?: string;
  guardianId?: string;

  crimes?: CrimeRecord[];
  grudges?: OpinionMod[];
  v17Traits?: string[];

  // Genetics, Lust & Lineage
  monthsPregnant?: number;
  pregnantBy?: string;
  conceivedInWedlockWith?: string;
  trueLoveId?: string;
  netLibidoPressure?: number;
  motherId?: string;
  realFatherId?: string;
  knownFatherId?: string;
  children?: string[];
  v17SecretsHeld?: V17Secret[];

  // Feudal Demesne & Title Tier
  titleTier?: TitleTier;
  demesneLimit?: number;
  heldHoldingIds?: string[];
  overextensionPenalty?: number;

  // Sovereign Lifestyle Skill Trees & Ambitions
  lifestylePerks?: string[];
  lifestyleXp?: number;
  activeAmbition?: string;
  completedAmbitions?: string[];
}

export type SettlementType =
  | 'Capital Citadel'
  | 'Royal Metropolis'
  | 'Trade Port'
  | 'Market Town'
  | 'Farming Village'
  | 'Fishing Port'
  | 'Mountain Hamlet'
  | 'Border Fortress'
  | 'Ancient Sanctuary';

export type SettlementTier = 'citadel' | 'metropolis' | 'port' | 'town' | 'village' | 'hamlet';

export interface Burg {
  id: string;
  name: string;
  x: number;
  y: number;
  population: number;
  stateId: string;
  countyId: string;
  isCapital: boolean;
  type: SettlementType;
  tier?: SettlementTier;
  tradeGood: string;
  culture: string;
  lore: string;
  settlementSite?: 'Estuary Harbor' | 'River Confluence' | 'Mountain Pass' | 'Crossroads' | 'Fertile Basin';
  connectedRouteCount?: number;
  tradeVolume?: number;
  isHolySite?: boolean;

  // Systemic Feudal Fief, Economy & Military
  ownerId?: string;
  rulerTitle?: string;
  developmentLevel?: number;
  treasury?: number; // Physical cash in the municipal vault (closed circuit)
  buildings?: string[];
  exports?: string[];
  imports?: string[];
  importFulfillment?: number;
  garrisonCount?: number;
  garrisonMax?: number;
  garrisonUpkeepGold?: number;
  garrisonUpkeepFood?: number;
  levyPool?: number;
  leviesRaised?: boolean;
  cellIndex?: number;
  tradeConnectivity?: number;

  // Ecological Carrying Capacity & Flow Economy
  carryingCapacity?: number;
  foodSurplus?: number;
  overcrowdingRatio?: number;
  isStarving?: boolean;
  starvingMonths?: number;
  foodSecurity?: FoodSecurityState;
  monthsOfFoodReserves?: number;
  demographics?: BurgDemographics;

  // Defined Territorial Area & Municipal Vassals
  vassalIds?: string[];
  cellIndices?: number[];
  areaKm2?: number;
  economicLedger?: BurgEconomicLedger;

  // Socioeconomic Classes & Living Standards
  strata?: Record<string, any>;
  standardOfLiving?: number;
  unrest?: number;

  // Bespoke Settlement Development, Devastation & Glacial Urbanization
  buildingSlots?: Record<string, BurgBuildingSlotState>;
  devastation?: number; // 0 to 100
  postWarRecoveryYears?: number;
  promotionStreakYears?: number;
  decayStreakYears?: number;
  lockedFromAutoSim?: boolean;
  coatOfArms?: CoatOfArmsData;
  customHeraldry?: boolean;
}

export interface BurgBuildingSlotState {
  level: number;
  dilapidated?: boolean;
  monthsUnmaintained?: number;
}

export interface BurgDemographics {
  peasantry: number;
  artisans: number;
  clergy: number;
  soldiery: number;
  urbanSharePct: number;
  annualGrowthRatePct: number;
}

export interface BurgEconomicLedger {
  baseTax: number;
  tradeTolls: number;
  totalRevenue: number;
  titheToLiege: number;
  garrisonUpkeep: number;
  civicMaintenance: number;
  adminOverhead: number;
  totalExpenses: number;
  netMonthlyGold: number;
  levyContribution: number;
  foodSurplusMonthly: number;
  // Closed-Loop Money Circuit
  cofferBalance?: number;        // Physical liquid cash held in the municipal vault
  localWageInjection?: number;   // Gold received from garrison pay and court spending
}

export type RouteClassification =
  | 'Imperial Highway'
  | 'Merchant Road'
  | 'Mountain Pass'
  | 'River Barge Route'
  | 'Maritime Sea Lane';

export interface TradeRoute {
  id: string;
  fromBurgId: string;
  toBurgId: string;
  fromBurgName: string;
  toBurgName: string;
  type: RouteClassification;
  pathPoints: Point2D[];
  distanceKm: number;
  trafficVolume: number;
  primaryGood: string;
  isMaritime: boolean;
  isCustom?: boolean;
}

export type { SiegeState, ActiveWar, Regiment, Army, FoodSecurityState };
export interface TraderCaravan {
  id: string;
  routeId: string;
  fromBurgId?: string;
  toBurgId?: string;
  fromBurgName: string;
  toBurgName: string;
  commodity: string;
  progress: number;
  speed: number;
  isMaritime: boolean;
  heraldryColor: string;
  direction?: 1 | -1;
  antIndex?: number;
  // Dynamic Flow Economy & Cargo
  cargoUnits?: number;
  cargoValue?: number;
  isLooted?: boolean;
  currentX?: number;
  currentY?: number;
}

export interface TradeHub {
  burgId: string;
  name: string;
  connectedRoutesCount: number;
  totalTradeVolume: number;
  primaryExports: string[];
}

export interface TradeNetwork {
  routes: TradeRoute[];
  caravans: TraderCaravan[];
  tradeHubs: TradeHub[];
  cellTrafficVolume?: Float32Array;
  cellPopulationDensity?: Float32Array;
}

export interface County {
  id: string;
  name: string;
  realmId: string;
  rulerId: string;
  capitalBurgId: string;
  cellIndices: number[];
  development: number;
  tradition: string;
  tier?: 'Duchy' | 'County';
  duchyId?: string;
  duchyName?: string;
  color?: string;
  culture?: string;
  religion?: string;
  baronyBurgIds?: string[];
  coatOfArms?: CoatOfArmsData;
  customHeraldry?: boolean;
  lockedFromAutoSim?: boolean;
}

export type TaxPolicy = 'Low' | 'Normal' | 'High' | 'Extortionate';

export interface RealmBudgetReport {
  domainTax: number;
  vassalTax: number;
  scutageAndAidsIncome?: number;
  customsTariffs: number;
  mintingIncome: number;
  civilListStipend: number;
  armyMaintenance: number;
  castleAndGarrisonUpkeep?: number;
  armsAndSuppliesUpkeep?: number;
  ransomsPaid?: number;
  administrationAndJustice?: number;
  diplomacyAndPatronage?: number;
  religiousPatronage?: number;
  buildingSubsidies: number;
  loanInterest: number;
  netBalance: number;
}

export interface RealmBudgetState {
  taxPolicy: TaxPolicy;
  armyMaintenanceRate: number;   // 0.50 (peacetime mothball) to 1.00 (full war readiness)
  bankruptcyUntilYear: number;   // > currentYear applies bankruptcy debuffs
  domesticDebtOwed: number;      // Borrowed from internal Merchants/Nobility/BurgMarkets
  lastReport: RealmBudgetReport;
  pendingCycleTotals?: {
    scutageAndAidsIncome?: number;
    ransomsPaid?: number;
    administrationAndJustice?: number;
    diplomacyAndPatronage?: number;
    religiousPatronage?: number;
    buildingSubsidies?: number;
  };
}

export interface Realm {
  id: string;
  name: string;
  color: string;
  rulerId: string;
  capitalBurgId: string;
  culture: string;
  religion: string;
  government: string;
  societyType?: string;
  foundingLegend: string;
  countyIds: string[];
  continentId?: number;
  lore?: string;
  heraldry: CoatOfArmsData;
  coatOfArms?: CoatOfArmsData;
  customHeraldry?: boolean;
  alliedRealmIds?: string[];
  enemyRealmIds?: string[];
  tradePactRealmIds?: string[];
  embargoedRealmIds?: string[];
  diplomaticRelations?: Record<string, number>;
  truceUntilYearByRealm?: Record<string, number>;
  lastDebasementYear?: number;
  preferredBattleTactic?: BattleTactic;
  councilTasks?: Partial<Record<'Chancellor' | 'Marshal' | 'Steward' | 'Spymaster' | 'Court Chaplain', string>>;
  treasury?: number;             // Crown Fisc (EU4 State Purse)
  budget?: RealmBudgetState;
  lockedFromAutoSim?: boolean;
}

export interface Culture {
  id: string;
  name: string;
  ethos: string;
  heritage: string;
  folklore: string;
  languageGroup: string;
  linguisticFamily?: string;
  martialTradition?: string;
  architectureStyle?: string;
  customs?: string[];
  color: string;
  burgPrefixes?: string[];
  burgSuffixes?: string[];
}

export interface Religion {
  id: string;
  name: string;
  deity: string;
  doctrine: string;
  sacredMyth: string;
  holySiteBurgId: string;
  symbol: string;
  color: string;
  theologyFamily?: string;
  clergyTitle?: string;
  sacredText?: string;
  pilgrimageRite?: string;
  tenets?: string[];
  zealousness?: number;
}

export type BiomeType =
  | 'Deep Ocean'
  | 'Shallow Sea'
  | 'Glacial Tundra'
  | 'Boreal Taiga'
  | 'Temperate Forest'
  | 'Steppe Grassland'
  | 'Arid Savanna'
  | 'Scorched Desert'
  | 'Tropical Rainforest'
  | 'Misty Wetland';

export interface Point2D {
  x: number;
  y: number;
}

export interface River {
  id: string;
  name: string;
  points: [number, number][];
  width?: number;
}

export interface WorldCell {
  index: number;
  x: number;
  y: number;
  polygon: Point2D[];
  elevation: number;
  temperature: number;
  moisture: number;
  biome: BiomeType;
  realmId?: string;
  countyId?: string;
  provinceId?: string;
  burgId?: string;
  continentId?: number;
  isCoast: boolean;
  isRiver: boolean;
  isLake?: boolean;
  isOcean?: boolean;
  isEndorheicSea?: boolean;
  lakeElevation?: number;
  lakeDepth?: number;
  riverFlow?: number;
  reliefType?: 'mountain' | 'hill' | 'forest' | 'tree' | 'plain' | 'plateau' | 'swamp' | null;
  shadedRelief?: number;
  populationDensity?: number;
  trafficVolume?: number;
  isManualForest?: boolean;
}

export interface SagaStory {
  id: string;
  title: string;
  year: number;
  genre:
    | 'Tragedy'
    | 'Betrayal'
    | 'Succession Crisis'
    | 'Dynastic Feud'
    | 'Forbidden Love'
    | 'Religious Inquisitor'
    | 'Bastard\'s Revenge'
    | 'Heroic Defense'
    | 'Blackmail & Intrigue';
  protagonistId: string;
  antagonistId?: string;
  locationBurgId?: string;
  realmId?: string;
  premise: string;
  fullProse: string;
  dialogueSnippet: string;
  consequences: string;
}

export interface WarChronicleChapter {
  year: number;
  title: string;
  summary: string;
}

export interface WarChronicleData {
  warId: string;
  warTitle: string;
  casusBelli: string;
  attackerRealmId: string;
  attackerRealmName: string;
  defenderRealmId: string;
  defenderRealmName: string;
  attackerLeaderName: string;
  defenderLeaderName: string;
  startYear: number;
  endYear?: number;
  status: 'Ongoing' | 'Attacker Victory' | 'Defender Victory' | 'White Peace' | 'Negotiated Peace';
  battlesFought: number;
  totalCasualties: number;
  territoryChanged?: string;
  treatySummary?: string;
  alliesInvolved?: string[];
  chapters: WarChronicleChapter[];
}

export interface HistoricalEvent {
  id: string;
  year: number;
  title: string;
  category: 
    | 'War & Conquest' 
    | 'Dynastic Drama' 
    | 'Coronation' 
    | 'Assassination' 
    | 'Religious Schism' 
    | 'Great Cataclysm' 
    | 'Death' 
    | 'Battle'
    | 'Diplomacy';
  description: string;
  primaryActorId?: string;
  secondaryActorId?: string;
  realmId?: string;
  warRecord?: WarChronicleData;
  meta?: Record<string, any>;
}

export type BorderKind =
  | 'interstate'
  | 'inter_duchy'
  | 'county'
  | 'barony'
  | 'march'
  | 'disputed'
  | 'ecclesiastical';

export interface CustomBorderEdge {
  id: string;
  kind: BorderKind;
  points: Point2D[];
  label?: string;
}

export type PaintBrushMode =
  | 'inspect'
  | 'mountain'
  | 'hill'
  | 'valley'
  | 'plateau'
  | 'smooth'
  | 'ocean'
  | 'forest'
  | 'tree'
  | 'desert'
  | 'snow'
  | 'swamp'
  | 'clear_biome'
  | 'clear_relief'
  | 'realm'
  | 'duchy'
  | 'county'
  | 'draw_border'
  | 'clear_border'
  | 'draw_route'
  | 'place_burg'
  | 'draw_river'
  | 'place_pin';

export type BrushFalloff = 'soft' | 'medium' | 'hard';

export interface TerrainSimConfig {
  windAngleDeg: number;
  raininess: number;
  seaLevel: number;
  minRiverFlow: number;
  brushMode: PaintBrushMode;
  brushSize: number;
  brushStrength: number;
  brushFalloff?: BrushFalloff;
  targetRealmId?: string;
  targetDuchyId?: string;
  targetCountyId?: string;
  targetBorderKind?: BorderKind;
  routeCategory?: RouteClassification;
  routeUsePathfinding?: boolean;
  routeSnapToBurgs?: boolean;
}

export type WorldTemplate =
  | 'Continents'
  | 'Volcano'
  | 'High Island'
  | 'Low Island'
  | 'Archipelago'
  | 'Atoll'
  | 'Mediterranean'
  | 'Peninsula'
  | 'Isthmus'
  | 'Pangaea'
  | 'Inland Sea'
  | 'Shattered Realm';

export type ClimateTemplate =
  | 'Temperate Hearth'
  | 'Whole World'
  | 'Northern Hemisphere'
  | 'Southern Hemisphere'
  | 'Equatorial'
  | 'Nordic Boreal'
  | 'Arid Steppe'
  | 'Glacial Age';

export interface ContinentConfig {
  id: number;
  name?: string;
  realmCount: number;
  duchiesPerRealm: number;
  countiesPerRealm: number;
  sizeScale?: number;
  reliefBias?: number;
}

export interface ContinentSummary {
  id: number;
  name: string;
  cellCount: number;
  centerX: number;
  centerY: number;
}

export interface WorldSettings {
  name?: string;
  seed: string;
  year?: number;
  eraName?: string;
  loreTheme?: 'high-fantasy' | 'gritty-medieval' | 'renaissance' | 'ancient-imperial';
  cultures?: Record<string, { name: string; prefix: string; colors: string[]; names: string[] }>;
  template?: WorldTemplate;
  climateTemplate?: ClimateTemplate;
  realmCount?: number;
  duchiesPerRealm?: number;
  countiesPerRealm?: number;
  countiesPerDuchy?: number;
  cultureCount?: number;
  seaLevel?: number;
  continentCount?: number;
  perContinentMode?: boolean;
  continentConfigs?: ContinentConfig[];
  terrainSim: TerrainSimConfig;
}

export type Season = 'Spring' | 'Summer' | 'Autumn' | 'Winter';

export type WeatherType =
  | 'Clear & Fair'
  | 'Heavy Blizzard'
  | 'Spring Thaw & Deluge'
  | 'Scorching Heatwave'
  | 'Autumn Gale & Tempest'
  | 'Sea Pack Ice'
  | 'Alpine Whiteout';

export interface WeatherEvent {
  id: string;
  season: Season;
  type: WeatherType;
  title: string;
  description: string;
  effect: string;
  affectedBurgId?: string;
  affectedRealmId?: string;
  snowlineOffset: number;
  frozenSeaLanes: boolean;
}

export interface SeasonalState {
  phase: number;
  currentSeason: Season;
  nextSeason: Season;
  transitionProgress: number;
  snowline: number;
  packIceAlpha: number;
  riverSwelling: number;
  springWeight: number;
  summerWeight: number;
  autumnWeight: number;
  winterWeight: number;
}

// ============================================================================
// GRAND STRATEGY V17 LIVING ARCHITECTURE TYPES
// ============================================================================

export type TerrainType = 'Plains' | 'Forest' | 'Mountains' | 'Coastal';

export interface Province {
  id: string;
  name: string;
  realmId: string;
  terrain: TerrainType;
  neighbors: string[];
  holdingIds: string[];
  cellIndices: number[];
  capitalX: number;
  capitalY: number;
  isQuarantined?: boolean;
  isExclave?: boolean;
}

export type EstateType = 'Castle' | 'City' | 'Temple';

export interface Holding {
  id: string;
  name: string;
  estateType: EstateType;
  provinceId: string;
  baseTax: number;
  baseLevy: number;
  dev: number;
  adminOverhead: number;
  ownerId: string;
  occupiedByRealmId?: string;
  occupiedSinceYear?: number;
}

export interface Claim {
  holdingId: string;
  claimantId: string;
  isPressed: boolean;
  isStrong: boolean;
  isAncestral?: boolean;
  originHouse?: string;
  grantedYear?: number;
  revokedByDecree?: boolean;
  revokedYear?: number;
  revokedByCharacterId?: string;
}

export interface Epidemic {
  id: string;
  name: string;
  infectedProvinceIds: string[];
  lethality: number;
  monthsRemaining: number;
}

export interface CadetHouse {
  name: string;
  parentDynasty: string;
  founderId: string;
  prestige: number;
  coatOfArms?: CoatOfArmsData;
  feudTargetDynasty?: string | null;
  feudReason?: string;
}

export type AccessLevel = 'INNER_RING' | 'MIDDLE_RING' | 'OUTER_RING' | 'NONE';

export interface CourtPosition {
  orbit: AccessLevel;
  capitalSecrets: number;
  capitalBottlenecks: number;
  capitalFavors: number;
  decayPressure: number;
}

export interface OrganicGravitas {
  militaryAutonomy: number;
  economicExtraction: number;
  populistLoyalty: number;
  lineagePrestige: number;
  sovereignDebtHeld: number;
}

export type CartographyStyle = 'atlas' | 'parchment' | 'vintage' | 'ink' | 'hand_drawn' | 'relief';

export type CrimeType =
  | 'Treason'
  | 'Murder'
  | 'Adultery'
  | 'Embezzlement'
  | 'Kingsblood'
  | 'Heresy'
  | 'Plot Against Liege'
  | 'Refuse Levy'
  | 'Tax Evasion';

export type PunishmentType =
  | 'Execution'
  | 'Mutilation'
  | 'Revocation'
  | 'Banishment'
  | 'Dungeon'
  | 'Monastery'
  | 'Humiliation'
  | 'Fine';

export interface CrimeRecord {
  crimeType: CrimeType;
  perpetratorId: string;
  victimId?: string;
  evidenceStrength: number;
  monthRecorded: number;
  discoveredById?: string;
}

export interface OpinionMod {
  reason: string;
  value: number;
  months: number;
}

export interface Favor {
  id: string;
  debtorId: string;
  creditorId: string;
  value: number;
  origin: string;
  isDynastyLevel: boolean;
  ageInYears: number;
}

export interface Faction {
  id: string;
  leaderId: string;
  name: string;
  members: string[];
  ultimatumIssued: boolean;
}

export type DeathCategory =
  | 'Old Age & Natural Decline'
  | 'Disease & Illness'
  | 'War & Violence'
  | 'Execution'
  | 'Accident & Misfortune';

export type ExecutionMethod =
  | 'Beheading on the Block'
  | 'Hanged at the Gallows'
  | 'Broken on the Wheel'
  | 'Burned at the Stake'
  | 'Drawn & Quartered'
  | 'Cast from the Keep'
  | 'Strangled in the Dungeon'
  | 'Drowned in the River'
  | 'Starved in the Oubliette'
  | 'Impaled on the Ramparts';

export type JudicialSentenceType =
  | 'Execution'
  | 'Imprisonment'
  | 'Banishment'
  | 'Fine & Confiscation'
  | 'Title Revocation'
  | 'House Arrest'
  | 'Monastic Confinement';

export interface JudicialSentenceRecord {
  id: string;
  year: number;
  judgeId: string;
  judgeName: string;
  judgeTier: 'Monarch' | 'Duke';
  subjectId: string;
  subjectName: string;
  realmId: string;
  duchyId?: string;
  crime: string;
  sentence: JudicialSentenceType;
  executionMethod?: ExecutionMethod;
  canAppealToKing: boolean;
  status: 'Enforced' | 'Pending Appeal' | 'Overturned by King' | 'Commuted by King' | 'Upheld by King';
  appealResolutionNote?: string;
}

export type SuccessionLaw = 'Primogeniture' | 'Partition' | 'Seniority' | 'Elective';
export type GenderLaw = 'Agnatic' | 'Agnatic-Cognatic' | 'Cognatic';
export type CrownAuthority = 'Autonomous' | 'Limited' | 'High' | 'Absolute';
export type JusticeLaw = 'Traditional' | 'Noble Immunity' | 'Draconian';
export type ConsanguinityLaw = 'Unrestricted' | 'Close-Kin Forbidden' | 'Strict Exogamy';
export type ForeignMarriageLaw = 'Open Alliances' | 'Royal Permission Only' | 'Domestic Only';
export type ForeignInheritanceLaw = 'Permitted' | 'Crown Approval' | 'Salic Exclusion';

export interface RealmLaws {
  succession: SuccessionLaw;
  gender: GenderLaw;
  authority: CrownAuthority;
  justice: JusticeLaw;
  consanguinity?: ConsanguinityLaw;
  foreignMarriage?: ForeignMarriageLaw;
  foreignInheritance?: ForeignInheritanceLaw;
}

export type VotingSystemReform = 'Plurality (FPTP)' | 'Ranked-Choice (IRV)' | 'Proportional Representation';
export type RedistrictingReform = 'Partisan Boundaries' | 'Independent Commission';
export type SuffrageReform = 'Property Franchise' | 'Universal Accessible';
export type CampaignFinanceReform = 'Unrestricted Patronage' | 'Donation Caps & Vouchers';
export type DisclosureReform = 'Opaque Ledgers' | 'Real-Time Public Disclosure';
export type RevolvingDoorReform = 'Unregulated Lobbying' | 'Mandatory Cooling-Off';
export type JudiciaryReform = 'Crown-Controlled Courts' | 'Independent Judiciary & Oversight';
export type CivilServiceReform = 'Political Patronage' | 'Merit-Based Civil Service';
export type CodifiedNormsReform = 'Unwritten Customs' | 'Codified Norms & Term Limits';
export type CitizensAssemblyReform = 'None' | 'Sortition Citizens Assembly';
export type ParticipatoryBudgetReform = 'Centralized Allocation' | 'Participatory Budgeting';
export type DecentralizationReform = 'Centralized Crown' | 'Devolved Local Autonomy';
export type MinorityProtectionReform = 'Majoritarian Rule' | 'Consociational Power-Sharing';
export type ParityReform = 'Traditional Exclusion' | 'Gender & Youth Parity';
export type MediaReform = 'Factional Mouthpieces' | 'Independent & Local Media';
export type CivicEducationReform = 'Elite Scholarship' | 'Universal Civic & Media Literacy';
export type PlatformTransparencyReform = 'Opaque Rumors' | 'Heraldic & Algorithmic Transparency';
export type EGovernanceReform = 'Parchment Bottlenecks' | 'Open Data & E-Services';

export interface PoliticalSystemState {
  // 1. Electoral & Representation
  votingSystem: VotingSystemReform;
  redistricting: RedistrictingReform;
  suffrageAccess: SuffrageReform;
  // 2. Money & Lobbying
  campaignFinance: CampaignFinanceReform;
  financialDisclosure: DisclosureReform;
  revolvingDoor: RevolvingDoorReform;
  // 3. Institutional Checks & Balances
  judiciary: JudiciaryReform;
  civilService: CivilServiceReform;
  codifiedNorms: CodifiedNormsReform;
  // 4. Citizen Participation (Deliberative Democracy)
  citizensAssembly: CitizensAssemblyReform;
  participatoryBudgeting: ParticipatoryBudgetReform;
  decentralization: DecentralizationReform;
  // 5. Inclusivity & Minority Protection
  minorityProtection: MinorityProtectionReform;
  parity: ParityReform;
  // 6. Information Ecosystem & Civic Education
  mediaIndependence: MediaReform;
  civicEducation: CivicEducationReform;
  platformTransparency: PlatformTransparencyReform;
  // 7. Modernizing Public Administration
  eGovernance: EGovernanceReform;
}

export interface CouncilorVote {
  voterId: string;
  voterName: string;
  role: string;
  vote: 'Aye' | 'Nay' | 'Abstain';
  weight: number;
  reason: string;
  canFlipWithFavor?: boolean;
  canFlipWithDiplomacy?: boolean;
}

export interface CouncilBill {
  id: string;
  title: string;
  summary: string;
  category: 'crown_law' | 'political_reform';
  targetDomain: 'realmLaws' | 'politicalSystem';
  targetKey: string;
  proposedValue: string;
  previousValue: string;
  proposerId: string;
  proposedYear: number;
  requiredConsensusPct: number; // e.g., 0.60 means 60% weighted Aye required
  coalitionBuilt: boolean;
  citizenAssemblyEndorsed: boolean;
  localPilotCountyId?: string;
  crisisCatalystApplied: boolean;
  persuadedIds: string[];
  votes: CouncilorVote[];
  ayePct: number;
  status: 'Deliberating' | 'Consensus Reached' | 'Rejected' | 'Enacted';
}

export interface ReformPilot {
  id: string;
  reformKey: keyof PoliticalSystemState;
  proposedValue: string;
  countyId: string;
  countyName: string;
  startedYear: number;
  isSuccessful: boolean;
}

export interface GovernanceHealthMetrics {
  regimeType: 'Autocratic Patronage' | 'Transitional State' | 'Constitutional Commonwealth' | 'Deliberative Democracy';
  democraticIndex: number;
  corruptionRisk: number;
  civicTrust: number;
  minorityInclusion: number;
  administrativeEfficiency: number;
  crisisCatalystMonths: number;
  crisisCatalystReason?: string;
}

export type RealmState =
  | 'Absolute Autocracy'
  | 'Balanced Feudalism'
  | 'Fragmentation'
  | 'Civil War'
  | 'Foreign Invasion';

export interface ForeignNation {
  name: string;
  militaryStrength: number;
  threatLevel: number;
  truceMonths: number;
}

export type PsychologicalState = 'Normal' | 'Cornered' | 'Martyr' | 'Opportunist' | 'Lovesick' | 'Paranoid' | 'Depressed' | 'Lunatic' | 'Wroth';

// ============================================================================
// COMMODITY MARKETS, BANKING & FISCAL PROFILES (SINGLE SOURCE OF TRUTH)
// ============================================================================
export type {
  CommodityType,
  CommodityMarket,
  BurgMarket,
  BankLoan,
  FiscalProfile,
} from './economy';
import type { BurgMarket, BankLoan, FiscalProfile } from './economy';

export type TradeNodePolicy = 'Collect' | 'Steer';

export interface TradeNodeShare {
  realmId: string;
  realmName: string;
  power: number;
  sharePct: number;
  policy: TradeNodePolicy;
  collectedGold: number;
  steeredGold: number;
}

export interface TradeNode {
  id: string;
  name: string;
  hubBurgId: string;
  x: number;
  y: number;
  countyIds: string[];
  downstreamNodeIds: string[];
  localValue: number;
  incomingValue: number;
  totalValue: number;
  shares: TradeNodeShare[];
}

export type EstateKind = 'Nobility' | 'Clergy' | 'Burghers';

export interface EstatePrivilege {
  id: string;
  estate: EstateKind;
  name: string;
  description: string;
  loyaltyMod: number;
  influenceMod: number;
  crownLandCost: number;
}

export interface DietAgenda {
  id: string;
  estate: EstateKind;
  title: string;
  description: string;
  targetType: 'build' | 'treasury' | 'dev' | 'trade';
  targetValue: number;
  targetRealmId: string;
  rewardLoyalty: number;
  rewardGold: number;
  expiresYear: number;
  completed: boolean;
}

export interface EstateState {
  kind: EstateKind;
  loyalty: number; // 0 to 100
  influence: number; // 0 to 100
  landShare: number; // 0 to 100
  grantedPrivilegeIds: string[];
}

export interface RealmEstatesState {
  realmId: string;
  crownLand: number; // 0 to 100
  lastSeizeYear?: number;
  lastDietYear?: number;
  estates: Record<EstateKind, EstateState>;
  activeDiet?: DietAgenda;
}

export interface CoalitionState {
  id: string;
  targetRealmId: string;
  memberRealmIds: string[];
  formedYear: number;
  activeWarId?: string;
}

export interface WorldState {
  settings: WorldSettings;
  currentYear: number;
  currentSeason?: Season;
  activeWeather?: WeatherEvent;
  cells: WorldCell[];
  mesh?: any;
  sim?: any;
  realms: Realm[];
  counties: County[];
  burgs: Burg[];
  characters: Character[];
  cultures: Culture[];
  religions: Religion[];
  sagas: SagaStory[];
  history: HistoricalEvent[];
  loreEntities: LoreEntity[];
  tradeNetwork?: TradeNetwork;
  armies?: Army[];
  rivers?: River[];
  continents?: ContinentSummary[];
  paintRevision?: number;
  territoryRevision?: number;
  burgRevision?: number;

  // V17 Grand Strategy Extensions
  provinces?: Province[];
  holdings?: Holding[];
  factions?: Faction[];
  favors?: Favor[];
  epidemics?: Epidemic[];
  lastPlagueYear?: number;
  cadetHouses?: Record<string, CadetHouse>;
  judicialSentences?: JudicialSentenceRecord[];
  lockedDownProvinces?: string[];
  foreignNations?: ForeignNation[];
  realmLaws?: RealmLaws;
  politicalSystem?: PoliticalSystemState;
  pendingBills?: CouncilBill[];
  legislativeHistory?: CouncilBill[];
  reformPilots?: ReformPilot[];
  governanceHealth?: GovernanceHealthMetrics;
  realmState?: RealmState;
  hegemony?: number;
  capitalProvinceId?: string;
  religiousHeadId?: string;
  monarchId?: string;
  month?: number;
  economy?: EconomyState;

  // Commodity Markets & Fiscal State
  burgMarkets?: Record<string, BurgMarket>;
  bankLoans?: BankLoan[];
  fiscalProfiles?: Record<string, FiscalProfile>;

  // Tactical Warfare & Active Sieges
  activeSieges?: SiegeState[];
  activeWars?: ActiveWar[];

  // Macro-Statecraft Systems
  tradeNodes?: TradeNode[];
  estatesByRealm?: Record<string, RealmEstatesState>;
  aggressiveExpansion?: Record<string, Record<string, number>>;
  coalitions?: CoalitionState[];
  activeWeatherMod?: {
    tradeFlowMult: number;
    harvestMult: number;
    livestockMult: number;
    summary?: string;
  };

  // Dual-Mode World Builder & Grand Strategy State
  appMode?: AppMode;
  playerRealmId?: string | null; // null = Observer / God Mode
  builderBaselineArchive?: string; // Dehydrated Day 1 creation snapshot for Rewind
  customRivers?: CustomRiver[];
  customBorders?: CustomBorderEdge[];
  borderKindOverrides?: Record<string, BorderKind>;
  mapPins?: MapPin[];
  pendingDiplomaticProposals?: DiplomaticProposal[];
}

export type DiplomaticProposalKind =
  | 'alliance'
  | 'trade_pact'
  | 'non_aggression'
  | 'end_rivalry'
  | 'lift_embargo'
  | 'peace';

export interface DiplomaticProposal {
  id: string;
  fromRealmId: string;
  toRealmId: string;
  kind: DiplomaticProposalKind;
  year: number;
  summary: string;
  consentScore: number;
  reasons: string[];
}

export type AppMode = 'builder' | 'game';

export interface MapPin {
  id: string;
  x: number;
  y: number;
  icon: string;
  label: string;
  category: 'Dungeon' | 'Ruin' | 'Lair' | 'Lore' | 'Marker';
  notes: string;
  loreEntityId?: string;
}

export interface CustomRiver {
  id: string;
  name: string;
  points: Point2D[];
  widthScale: number;
}