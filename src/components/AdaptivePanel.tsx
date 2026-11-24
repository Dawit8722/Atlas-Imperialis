import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  WorldState,
  Realm,
  Burg,
  County,
  Character,
  Holding,
  HistoricalEvent,
  CadetHouse,
  ExecutionMethod,
  JudicialSentenceType,
} from '../types/world';
import { CouncilConsensusPanel } from './CouncilConsensusPanel';
import { HeraldryShield, ImpaledMarriageShield } from './HeraldryShield';
import {
  Crown,
  Castle,
  User,
  Shield,
  Coins,
  Swords,
  BookOpen,
  Sparkles,
  Heart,
  Skull,
  Eye,
  Flame,
  X,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Building2,
  Scale,
  Award,
  Zap,
  Clock,
  Compass,
  Layers,
  ArrowRight,
  Lock,
  Hammer,
  Users,
  Flag,
  AlertTriangle,
  Scroll,
  Wheat,
  Landmark,
  Anchor,
  Navigation,
  MapPin,
  Map as MapIcon,
  Pencil,
  Palette,
  Plus,
  Check,
  Trash2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CHARACTER_TRAITS,
  MEDIEVAL_GOVERNMENT_TYPES,
  MEDIEVAL_SOCIETY_TYPES,
  computeCharacterStats,
  getCharacterRankTitle,
  getGovernmentProfile,
  getSocietyProfile,
  formatCharacterRoleLabel,
} from '../engine/fantasyTables';
import {
  resolvePlayerRealm,
  updateRealm,
  updateCounty,
  updateBurg,
  updateCharacter,
  updateCulture,
  updateReligion,
  updateArmy,
} from '../engine/worldEditor';
import { getAllV17Traits } from '../engine/v17TraitDB';
import { ChronicleEventModal } from './ChronicleEventModal';
import {
  ensureEconomy,
  debaseCurrency,
  COMMODITIES,
  takeBankLoan,
  getRealmCurrency,
  calculateBarterRatio,
  calculateBurgBarterShare,
  getBurgBarterTransactions,
  calculateFiscalProfile,
  getDefaultVaultCap,
  disburseTreasuryAction,
} from '../engine/economyEngine';
import { CarryingCapacityEngine } from '../engine/carryingCapacityEngine';
import {
  PlayerActionEngine,
  ClaimAndWarEngine,
  RealmDiplomacyEngine,
  ArmyCommandEngine,
  computeTotalGravitas,
  getGravitasBreakdown,
  killCharacter,
  evaluateBilateralConsent,
} from '../engine/v17GrandStrategyEngine';
import {
  EXECUTION_METHODS,
  SENTENCING_CRIMES,
  appealSentenceToKing,
  checkMarriageLegality,
  getJudicialAuthoritiesForSubject,
  inferDeathCategory,
  passFeudalSentence,
} from '../engine/deathAndJusticeEngine';
import { getOriginRegimentName } from '../engine/warfareEngine';
import { BattleTactic, getRegimentDisplayName } from '../types/warfare';
import { canBestowBanner, getCharacterHeraldStatus } from '../utils/heraldryBridge';
import { BATTLE_TACTICS } from '../engine/battleStrategy';
import { getArmyPositionAtProgress } from '../engine/armyPathfinding';
import { CommodityType } from '../types/economy';
import {
  getChainOfFealty,
  getDirectVassals,
  calculateDemesneLimit,
  recalculateFeudalDemesne,
  calculateCharacterFeudalStanding,
  computeRealmMilitaryBreakdown,
  getBurgGarrisonStatus,
  toggleLeviesRaised,
  getBurgTradeLedger,
  upgradeSettlementBuilding,
  developFiefInfrastructure,
  findHabitableCellsForRealm,
  issueSettlementCharter,
  calculateBurgEconomicLedger,
  getBurgDevelopmentSlots,
  getBurgMunicipalVassals,
  upgradeBurgSlot,
  BUILDING_CATALOG,
  BuildingDefinition,
  HabitableCellOption,
} from '../engine/feudalEngine';
import { CourtRole, ActiveWar } from '../types/world';
import {
  SIX_ATTRIBUTES_GUIDE,
  COUNCIL_OFFICE_DEFS,
  CouncilOffice,
  evaluateCouncillorEffectiveness,
  assignFosterage,
  assignApprenticeship,
} from '../engine/childhoodAndCouncilEngine';
import { cloneWorldState } from '../utils/cloneWorldState';
import { SettlementBlueprintPanel } from './SettlementBlueprintPanel';
import { UnitRecruitmentPanel } from './UnitRecruitmentPanel';
import {
  getSettlementBlueprint,
  ensureBurgBuildingSlots,
} from '../engine/settlementDevelopmentEngine';
import { computeArmyDiscipline } from '../engine/warfareEngine';
import type { ArmyConductPolicy } from '../types/warfare';
import { RoyalCouncilAdvisor } from './RoyalCouncilAdvisor';
import { WarRoomModal } from './WarRoomModal';
import { EstatesTradeModal } from './EstatesTradeModal';
import { LifestylePerksModal } from './LifestylePerksModal';
import { CityMapModal } from './CityMapModal';
import { resolveCountryFlagDataUrl } from '../utils/heraldryBridge';
import type { SelectionFocus } from '../engine/territorySelection';
import {
  computeHouseProfile,
  evaluateAllianceNegotiation,
  evaluateMarriageProspect,
} from '../engine/houseEngine';

export type AdaptivePanelMode = 'character' | 'realm' | 'burg' | 'county' | 'war';

export interface AdaptivePanelProps {
  isOpen?: boolean;
  onClose?: () => void;
  world: WorldState;
  selectedRealm?: Realm;
  selectedBurg?: Burg;
  selectedCounty?: County;
  selectedCharacter?: Character;
  onSelectCharacter?: (char: Character) => void;
  onSelectRealm?: (realm: Realm) => void;
  onSelectBurg?: (burg: Burg) => void;
  onSelectCounty?: (county: County) => void;
  onOpenHouse?: (houseName: string) => void;
  onOpenCompendiumForEntity?: (entityId: string) => void;
  onWeaveStoryForCharacter?: (char: Character) => void;
  onUpdateWorld?: (newWorld: WorldState) => void;
  onOpenWorkspaceTab?: (tab: 'court' | 'feudal' | 'economy' | 'v17') => void;
  defaultMode?: AdaptivePanelMode;
  selectionFocus?: SelectionFocus;
  onSelectionFocusChange?: (focus: SelectionFocus) => void;
  onOpenHeraldryStudio?: (target: { kind: 'realm' | 'county' | 'burg' | 'character' | 'house'; id: string; label: string }) => void;
}

// ==========================================
// BESPOKE COMMODITY ICONS & FORMATTING (52 COMMODITIES)
// ==========================================
const COMMODITY_ICONS: Record<CommodityType, string> = {
  Grain: '🌾',
  Timber: '🪵',
  Iron: '⚔️',
  Salt: '🧂',
  Wine: '🍷',
  Silk: '🪡',
  Spices: '🏺',
  Silver: '🪙',
  Gold: '👑',
  Livestock: '🐂',
  Stone: '🪨',
  Wool: '🧶',
  Copper: '🪓',
  Coal: '⛏️',
  Glassware: '🧪',
  Dyes: '🎨',
  Incense: '🕯️',
  Furs: '🦊',
  Honey: '🍯',
  'Fine Porcelain': '🫖',
  Herbs: '🌿',
  Gems: '💎',
  // 30 Additional Commodities Categorized by Geography, Purpose, Accessibility & Durability
  'Dried Fish': '🐟',
  'Olive Oil': '🫒',
  'Ale & Beer': '🍺',
  'Cheese': '🧀',
  'Orchard Fruit': '🍎',
  'Tin': '🥫',
  'Lead': '⛓️',
  'Sulfur': '🌋',
  'Tar & Pitch': '🛢️',
  'Warhorses': '🐎',
  'Crossbow Bolts': '🏹',
  'Linen & Flax': '🧵',
  'Tanned Leather': '👞',
  'Fine Woolen Cloth': '👘',
  'Parchment & Vellum': '📜',
  'Rope & Cordage': '🪢',
  'Clay & Pottery': '🏺',
  'Bricks & Mortar': '🧱',
  'Marble': '🏛️',
  'Quarried Slate': '🪨',
  'Amber': '🪨',
  'Pearls': '🦪',
  'Ivory': '🐘',
  'Tapestries': '🖼️',
  'Fine Saffron': '🌸',
  'Medicinal Leeches': '🧪',
  'Alchemical Mercury': '⚗️',
  'Myrrh & Resins': '🪵',
  'Holy Relics': '✝️',
  'Beeswax Candles': '🕯️',
  // 10 Essential Commodities
  'Tools & Ironware': '🔨',
  'Steel Arms & Armor': '🛡️',
  'Bronze & Brassware': '🔔',
  'Saltpeter': '🧂',
  'Blackpowder': '💣',
  'Paper & Codices': '📖',
  'Apothecary Remedies': '⚕️',
  'Jewelry & Regalia': '💍',
  'Cane Sugar': '🎋',
  'Distilled Spirits': '🥃',
};

// ==========================================
// BESPOKE TRAIT ICONS & VISUAL HERALDRY
// ==========================================
interface TraitVisual {
  icon: string;
  badgeBg: string;
  borderColor: string;
  textColor: string;
}

function getTraitVisual(traitId: string, category: string): TraitVisual {
  const tid = traitId.toLowerCase();

  // Personality traits
  if (tid.includes('brave')) return { icon: '⚔️', badgeBg: 'bg-amber-950/70', borderColor: 'border-amber-500/70', textColor: 'text-amber-200' };
  if (tid.includes('craven')) return { icon: '🐁', badgeBg: 'bg-stone-900/80', borderColor: 'border-stone-700/60', textColor: 'text-stone-300' };
  if (tid.includes('ambitious')) return { icon: '🦅', badgeBg: 'bg-purple-950/70', borderColor: 'border-purple-500/70', textColor: 'text-purple-200' };
  if (tid.includes('content')) return { icon: '🌿', badgeBg: 'bg-emerald-950/70', borderColor: 'border-emerald-500/70', textColor: 'text-emerald-200' };
  if (tid.includes('deceitful')) return { icon: '🎭', badgeBg: 'bg-violet-950/70', borderColor: 'border-violet-600/70', textColor: 'text-violet-200' };
  if (tid.includes('honest')) return { icon: '⚖️', badgeBg: 'bg-sky-950/70', borderColor: 'border-sky-500/70', textColor: 'text-sky-200' };
  if (tid.includes('wrathful')) return { icon: '⚡', badgeBg: 'bg-red-950/70', borderColor: 'border-red-500/70', textColor: 'text-red-200' };
  if (tid.includes('calm')) return { icon: '🌊', badgeBg: 'bg-blue-950/70', borderColor: 'border-blue-500/70', textColor: 'text-blue-200' };
  if (tid.includes('lustful')) return { icon: '💋', badgeBg: 'bg-rose-950/70', borderColor: 'border-rose-500/70', textColor: 'text-rose-200' };
  if (tid.includes('chaste')) return { icon: '🕊️', badgeBg: 'bg-slate-900/80', borderColor: 'border-slate-400/60', textColor: 'text-slate-200' };
  if (tid.includes('diligent')) return { icon: '📜', badgeBg: 'bg-amber-950/60', borderColor: 'border-amber-600/60', textColor: 'text-amber-200' };
  if (tid.includes('lazy')) return { icon: '🪨', badgeBg: 'bg-stone-900/70', borderColor: 'border-stone-600/50', textColor: 'text-stone-300' };
  if (tid.includes('generous')) return { icon: '🤲', badgeBg: 'bg-amber-950/60', borderColor: 'border-amber-500/60', textColor: 'text-amber-100' };
  if (tid.includes('greedy')) return { icon: '🪙', badgeBg: 'bg-emerald-950/70', borderColor: 'border-emerald-600/70', textColor: 'text-emerald-200' };
  if (tid.includes('just')) return { icon: '🏛️', badgeBg: 'bg-blue-950/70', borderColor: 'border-blue-400/70', textColor: 'text-blue-100' };
  if (tid.includes('arbitrary')) return { icon: '🎲', badgeBg: 'bg-red-950/60', borderColor: 'border-red-600/50', textColor: 'text-red-300' };
  if (tid.includes('cynical')) return { icon: '👁️', badgeBg: 'bg-zinc-900/80', borderColor: 'border-zinc-500/60', textColor: 'text-zinc-200' };
  if (tid.includes('zealot')) return { icon: '🔥', badgeBg: 'bg-orange-950/70', borderColor: 'border-orange-500/70', textColor: 'text-orange-200' };
  if (tid.includes('gregarious')) return { icon: '🥂', badgeBg: 'bg-amber-950/70', borderColor: 'border-amber-400/70', textColor: 'text-amber-100' };
  if (tid.includes('shy')) return { icon: '🕯️', badgeBg: 'bg-stone-900/80', borderColor: 'border-stone-600/60', textColor: 'text-stone-300' };
  if (tid.includes('paranoid')) return { icon: '🗡️', badgeBg: 'bg-purple-950/70', borderColor: 'border-purple-600/70', textColor: 'text-purple-200' };
  if (tid.includes('trusting')) return { icon: '🤝', badgeBg: 'bg-teal-950/70', borderColor: 'border-teal-500/60', textColor: 'text-teal-200' };
  if (tid.includes('compassionate')) return { icon: '❤️', badgeBg: 'bg-rose-950/70', borderColor: 'border-rose-400/60', textColor: 'text-rose-100' };
  if (tid.includes('sadistic')) return { icon: '🩸', badgeBg: 'bg-red-950/80', borderColor: 'border-red-600/80', textColor: 'text-red-300' };
  if (tid.includes('forgiving')) return { icon: '🌱', badgeBg: 'bg-green-950/70', borderColor: 'border-green-500/60', textColor: 'text-green-200' };
  if (tid.includes('vengeful')) return { icon: '💀', badgeBg: 'bg-red-950/80', borderColor: 'border-red-500/70', textColor: 'text-red-200' };

  // Congenital traits
  if (category === 'congenital' || tid.includes('genius') || tid.includes('quick')) {
    return { icon: '🧠', badgeBg: 'bg-cyan-950/80', borderColor: 'border-cyan-400/80', textColor: 'text-cyan-100' };
  }
  if (tid.includes('beautiful') || tid.includes('comely')) {
    return { icon: '✨', badgeBg: 'bg-pink-950/80', borderColor: 'border-pink-400/80', textColor: 'text-pink-100' };
  }
  if (tid.includes('herculean') || tid.includes('robust')) {
    return { icon: '🛡️', badgeBg: 'bg-amber-950/80', borderColor: 'border-amber-400/80', textColor: 'text-amber-100' };
  }
  if (tid.includes('pure-blood') || tid.includes('pureblooded')) {
    return { icon: '👑', badgeBg: 'bg-red-950/80', borderColor: 'border-amber-400', textColor: 'text-amber-200' };
  }
  if (tid.includes('inbred')) {
    return { icon: '☠️', badgeBg: 'bg-stone-950/90', borderColor: 'border-red-800/80', textColor: 'text-red-400' };
  }

  // Education traits
  if (category === 'education') {
    if (tid.includes('martial') || tid.includes('strategist')) return { icon: '⚔️⭐⭐', badgeBg: 'bg-red-950/80', borderColor: 'border-red-400', textColor: 'text-red-100' };
    if (tid.includes('steward') || tid.includes('midas')) return { icon: '🪙⭐⭐', badgeBg: 'bg-amber-950/80', borderColor: 'border-amber-400', textColor: 'text-amber-100' };
    if (tid.includes('diplomacy') || tid.includes('eminence')) return { icon: '📜⭐⭐', badgeBg: 'bg-sky-950/80', borderColor: 'border-sky-400', textColor: 'text-sky-100' };
    if (tid.includes('intrigue') || tid.includes('shadow')) return { icon: '🗡️⭐⭐', badgeBg: 'bg-purple-950/80', borderColor: 'border-purple-400', textColor: 'text-purple-100' };
    return { icon: '📖⭐⭐', badgeBg: 'bg-emerald-950/80', borderColor: 'border-emerald-400', textColor: 'text-emerald-100' };
  }

  // Pregnancy & Health conditions
  if (tid.includes('pregnant')) {
    return { icon: '🤰', badgeBg: 'bg-pink-950/80', borderColor: 'border-pink-400/80', textColor: 'text-pink-100' };
  }
  if (category === 'health') {
    return { icon: '🩹', badgeBg: 'bg-rose-950/70', borderColor: 'border-rose-600/60', textColor: 'text-rose-200' };
  }
  if (category === 'status') {
    return { icon: '⚜️', badgeBg: 'bg-amber-950/70', borderColor: 'border-amber-500/60', textColor: 'text-amber-100' };
  }

  // Commander & Lifestyle
  if (category === 'commander') {
    return { icon: '🚩', badgeBg: 'bg-red-950/70', borderColor: 'border-red-600/60', textColor: 'text-red-200' };
  }
  if (category === 'lifestyle') {
    return { icon: '🌟', badgeBg: 'bg-amber-950/70', borderColor: 'border-amber-500/60', textColor: 'text-amber-200' };
  }

  // Default fallback
  return { icon: '💠', badgeBg: 'bg-stone-900/80', borderColor: 'border-stone-700/60', textColor: 'text-stone-200' };
}

export const AdaptivePanel: React.FC<AdaptivePanelProps> = ({
  isOpen = true,
  onClose = () => {},
  world,
  selectedRealm,
  selectedBurg,
  selectedCounty,
  selectedCharacter,
  onSelectCharacter = () => {},
  onSelectRealm = () => {},
  onSelectBurg = () => {},
  onSelectCounty = () => {},
  onOpenHouse,
  onOpenCompendiumForEntity = () => {},
  onWeaveStoryForCharacter = () => {},
  onUpdateWorld = () => {},
  onOpenWorkspaceTab,
  defaultMode,
  selectionFocus,
  onSelectionFocusChange,
  onOpenHeraldryStudio,
}) => {
  // Mode selection state
  const [panelMode, setPanelMode] = useState<AdaptivePanelMode>(() => {
    if (selectionFocus === 'character' && selectedCharacter) return 'character';
    if ((selectionFocus === 'county' || selectionFocus === 'duchy') && selectedCounty) return 'county';
    if (selectionFocus === 'realm' && selectedRealm) return 'realm';
    if (selectionFocus === 'burg' && selectedBurg) return 'burg';
    if (defaultMode) return defaultMode;
    if (selectedBurg) return 'burg';
    if (selectedCounty) return 'county';
    if (selectedRealm) return 'realm';
    return 'character';
  });

  // Track previous external selection IDs to only switch mode on explicit external selection change
  const prevBurgIdRef = useRef(selectedBurg?.id);
  const prevCountyIdRef = useRef(selectedCounty?.id);
  const prevRealmIdRef = useRef(selectedRealm?.id);
  const prevCharIdRef = useRef(selectedCharacter?.id);
  const prevFocusRef = useRef(selectionFocus);

  const handleSwitchTab = (newMode: AdaptivePanelMode) => {
    prevBurgIdRef.current = selectedBurg?.id;
    prevCountyIdRef.current = selectedCounty?.id;
    prevRealmIdRef.current = selectedRealm?.id;
    prevCharIdRef.current = selectedCharacter?.id;
    if (newMode === 'realm' || newMode === 'county' || newMode === 'burg' || newMode === 'character') {
      prevFocusRef.current = newMode;
      onSelectionFocusChange?.(newMode);
    }
    setPanelMode(newMode);
  };

  useEffect(() => {
    const burgChanged = selectedBurg?.id !== prevBurgIdRef.current;
    const countyChanged = selectedCounty?.id !== prevCountyIdRef.current;
    const realmChanged = selectedRealm?.id !== prevRealmIdRef.current;
    const charChanged = selectedCharacter?.id !== prevCharIdRef.current;
    const focusChanged = selectionFocus !== prevFocusRef.current;

    prevBurgIdRef.current = selectedBurg?.id;
    prevCountyIdRef.current = selectedCounty?.id;
    prevRealmIdRef.current = selectedRealm?.id;
    prevCharIdRef.current = selectedCharacter?.id;
    prevFocusRef.current = selectionFocus;

    if (selectionFocus === 'character' && selectedCharacter && (charChanged || focusChanged)) {
      setPanelMode('character');
    } else if ((selectionFocus === 'county' || selectionFocus === 'duchy') && selectedCounty && (countyChanged || focusChanged)) {
      setPanelMode('county');
    } else if (selectionFocus === 'realm' && selectedRealm && (realmChanged || focusChanged)) {
      setPanelMode('realm');
    } else if (selectionFocus === 'burg' && selectedBurg && (burgChanged || focusChanged)) {
      setPanelMode('burg');
    } else if (selectedBurg && burgChanged) {
      setPanelMode('burg');
    } else if (selectedCounty && !selectedBurg && (countyChanged || burgChanged)) {
      setPanelMode('county');
    } else if (selectedRealm && !selectedCounty && !selectedBurg && (realmChanged || countyChanged || burgChanged)) {
      setPanelMode('realm');
    } else if (selectedCharacter && charChanged) {
      setPanelMode('character');
    }
  }, [selectedBurg?.id, selectedCounty?.id, selectedRealm?.id, selectedCharacter?.id, selectionFocus]);

  // Subtabs for Realm
  const [realmSubtab, setRealmSubtab] = useState<'governance' | 'vassals' | 'diplomacy' | 'wars' | 'story' | 'military' | 'economy' | 'laws'>('governance');
  const [selectedDipAction, setSelectedDipAction] = useState<
    null | 'alliance' | 'war' | 'embargo' | 'trade_pact' | 'envoy' | 'non_aggression' | 'insult' | 'tribute'
  >(null);
  const [warViewTab, setWarViewTab] = useState<'campaigns' | 'battles' | 'generals' | 'strategies'>('campaigns');
  const [fosterGuardianId, setFosterGuardianId] = useState<string>('');
  const [apprenticeTypeSel, setApprenticeTypeSel] = useState<NonNullable<Character['apprenticeshipType']>>('Squire & Knighthood');
  const [apprenticeMasterId, setApprenticeMasterId] = useState<string>('');
  const [warTargetRealmId, setWarTargetRealmId] = useState<string>('');
  const [marriageCandidateId, setMarriageCandidateId] = useState<string>('');
  const [selectedJudgeId, setSelectedJudgeId] = useState<string>('');
  const [selectedSentence, setSelectedSentence] = useState<JudicialSentenceType>('Imprisonment');
  const [selectedExecutionMethod, setSelectedExecutionMethod] = useState<ExecutionMethod>('Beheading on the Block');
  const [selectedCrime, setSelectedCrime] = useState<string>(SENTENCING_CRIMES[0]);
  const [councilAssignRole, setCouncilAssignRole] = useState<'Chancellor' | 'Marshal' | 'Steward' | 'Spymaster' | 'Court Chaplain'>('Marshal');
  const [isDilemmaModalOpen, setIsDilemmaModalOpen] = useState(false);
  const [isCharterModalOpen, setIsCharterModalOpen] = useState(false);
  const [charterCellIndex, setCharterCellIndex] = useState<number | null>(null);
  const [charterName, setCharterName] = useState('');
  const [charterType, setCharterType] = useState<Burg['type']>('Market Town');
  const [charterDelegateToVassal, setCharterDelegateToVassal] = useState(true);
  const [charterVassalRole, setCharterVassalRole] = useState<CourtRole>('Lord Mayor');
  const [notificationMsg, setNotificationMsg] = useState<string | null>(null);
  const [negotiatingWar, setNegotiatingWar] = useState<ActiveWar | null>(null);
  const [isEstatesModalOpen, setIsEstatesModalOpen] = useState(false);
  const [isLifestyleModalOpen, setIsLifestyleModalOpen] = useState(false);
  const [isCityMapOpen, setIsCityMapOpen] = useState(false);

  // Builder Mode inline edit drawer state
  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [traitToAdd, setTraitToAdd] = useState('');
  const [draftRealm, setDraftRealm] = useState({ name: '', color: '#c2410c', culture: '', religion: '', government: '', societyType: '', foundingLegend: '' });
  const [draftCounty, setDraftCounty] = useState({ name: '', tier: 'County' as 'Duchy' | 'County', development: 25, tradition: '', color: '#78716c' });
  const [draftBurg, setDraftBurg] = useState({ name: '', type: 'Market Town' as Burg['type'], population: 1500, tradeGood: 'Grain', developmentLevel: 25, lore: '' });
  const [draftChar, setDraftChar] = useState({
    name: '',
    age: 28,
    gender: 'male' as 'male' | 'female',
    isAlive: true,
    role: 'Court Noble' as CourtRole,
    title: '',
    houseName: '',
    baseDiplomacy: 8,
    baseMartial: 8,
    baseStewardship: 8,
    baseIntrigue: 8,
    baseLearning: 8,
    baseProwess: 8,
    knownFatherId: '',
    motherId: '',
    spouseId: '',
    liegeId: '',
  });
  const [editingPolityCard, setEditingPolityCard] = useState<'culture' | 'religion' | null>(null);
  const [draftCulture, setDraftCulture] = useState({ name: '', ethos: '', heritage: '', languageGroup: '', color: '#10b981' });
  const [draftReligion, setDraftReligion] = useState({ name: '', deity: '', clergyTitle: '', symbol: '', color: '#f59e0b' });
  const [editingArmyId, setEditingArmyId] = useState<string | null>(null);
  const [draftArmyName, setDraftArmyName] = useState('');

  // Economy state
  const economy = useMemo(() => ensureEconomy(world), [world]);

  // Selected or fallback entities (strictly living nobles)
  const livingCharacters = useMemo(() => world.characters.filter((c) => c.isAlive !== false), [world.characters]);
  const realm = selectedRealm || resolvePlayerRealm(world) || world.realms[0];
  const ruler = livingCharacters.find((c) => c.id === realm?.rulerId) || livingCharacters[0] || world.characters[0];
  const burg = selectedBurg || world.burgs.find((b) => b.id === realm?.capitalBurgId) || world.burgs[0];
  const county = selectedCounty || world.counties.find((c) => c.realmId === realm?.id) || world.counties[0];

  // Contextual Noble resolution:
  // When noble tab is selected, direct user to the lord/owner of the selected settlement or county count!
  const activeChar = useMemo(() => {
    if (panelMode === 'character' && selectedCharacter && selectedCharacter.isAlive !== false) return selectedCharacter;
    if (panelMode === 'county' && county?.rulerId) {
      const ctyLord = livingCharacters.find((c) => c.id === county.rulerId);
      if (ctyLord) return ctyLord;
    }
    if (panelMode === 'burg' && burg?.ownerId) {
      const burgLord = livingCharacters.find((c) => c.id === burg.ownerId);
      if (burgLord) return burgLord;
    }
    if (selectedCharacter && selectedCharacter.isAlive !== false) return selectedCharacter;
    if (selectedBurg?.ownerId) {
      const burgLord = livingCharacters.find((c) => c.id === selectedBurg.ownerId);
      if (burgLord) return burgLord;
    }
    if (selectedCounty?.rulerId) {
      const ctyLord = livingCharacters.find((c) => c.id === selectedCounty.rulerId);
      if (ctyLord) return ctyLord;
    }
    return ruler;
  }, [panelMode, selectedCharacter, county, burg, selectedBurg, selectedCounty, livingCharacters, ruler]);

  // Chain of Fealty Breadcrumb traversal
  const fealtyChain = useMemo(() => {
    if (!activeChar) return [];
    return getChainOfFealty(activeChar, world);
  }, [activeChar, world]);

  // Feudal Demesne & Overextension Calculations
  const demesneLimit = useMemo(() => (activeChar ? calculateDemesneLimit(activeChar) : 3), [activeChar]);
  const heldBurgs = useMemo(() => world.burgs.filter((b) => b.ownerId === activeChar?.id), [world.burgs, activeChar]);
  const isOverextended = heldBurgs.length > demesneLimit;
  const overextensionExcess = Math.max(0, heldBurgs.length - demesneLimit);

  // Burg Garrison & Levies status
  const burgGarrison = useMemo(() => (burg ? getBurgGarrisonStatus(burg, world) : null), [burg, world]);

  // Burg Trade Ledger
  const burgTradeLedger = useMemo(() => (burg ? getBurgTradeLedger(burg, world) : null), [burg, world]);

  // Burg Systemic Economic Ledger
  const burgEconomicLedger = useMemo(() => (burg ? (burg.economicLedger || calculateBurgEconomicLedger(burg, world)) : null), [burg, world]);

  // Burg Municipal Vassals & Mayors
  const burgMunicipalVassals = useMemo(() => (burg ? getBurgMunicipalVassals(burg, world) : []), [burg, world]);

  // Burg Development Slots
  const burgDevSlots = useMemo(() => (burg ? getBurgDevelopmentSlots(burg, world) : []), [burg, world]);

  // Habitable open spaces for Royal Charter
  const habitableCells = useMemo(() => (realm ? findHabitableCellsForRealm(realm.id, world) : []), [realm, world]);

  // Relational lookups for active character (living only)
  const spouse = activeChar?.spouseId ? livingCharacters.find((c) => c.id === activeChar.spouseId) : undefined;
  const heir = activeChar?.heirId ? livingCharacters.find((c) => c.id === activeChar.heirId) : undefined;
  const rival = activeChar?.rivalId ? livingCharacters.find((c) => c.id === activeChar.rivalId) : undefined;
  const friend = activeChar?.friendId ? livingCharacters.find((c) => c.id === activeChar.friendId) : undefined;
  const liege = activeChar?.realmId ? world.realms.find((r) => r.id === activeChar.realmId) : undefined;
  const liegeRuler = liege?.rulerId ? livingCharacters.find((c) => c.id === liege.rulerId) : undefined;

  // Stats & Gravitas calculation
  const stats = useMemo(
    () =>
      activeChar
        ? computeCharacterStats(activeChar)
        : { diplomacy: 0, martial: 0, stewardship: 0, intrigue: 0, learning: 0, prowess: 0 },
    [activeChar]
  );
  const gravitasBreakdown = useMemo(() => (activeChar ? getGravitasBreakdown(activeChar) : null), [activeChar]);
  const gravitas = useMemo(() => {
    if (gravitasBreakdown) return gravitasBreakdown.total;
    if (activeChar?.organicGravitas) {
      return computeTotalGravitas(activeChar.organicGravitas);
    }
    return 120;
  }, [activeChar, gravitasBreakdown]);

  // Feudal Standing & Demesne Metrics: dynamically computed from holdings and demesne
  const feudalStanding = useMemo(
    () => (activeChar ? calculateCharacterFeudalStanding(activeChar, world) : null),
    [activeChar, world]
  );

  // Realm vassals & council (living nobles only)
  const realmChars = useMemo(
    () => livingCharacters.filter((c) => c.realmId === realm?.id),
    [livingCharacters, realm]
  );

  const councilMembers = useMemo(
    () =>
      realmChars.filter((c) =>
        ['Chancellor', 'Marshal', 'Steward', 'Spymaster', 'Court Chaplain'].includes(c.role)
      ),
    [realmChars]
  );

  // Comprehensive Vassal Hierarchy (sworn county counts & dukes)
  const realmCounties = useMemo(
    () => world.counties.filter((c) => c.realmId === realm?.id),
    [world.counties, realm]
  );

  const vassalLords = useMemo(() => {
    const list: { character: Character; county?: County; holdingCount: number }[] = [];
    const seenIds = new Set<string>();

    for (const cty of realmCounties) {
      const lord = world.characters.find((c) => c.id === cty.rulerId);
      if (lord && lord.id !== ruler?.id && !seenIds.has(lord.id)) {
        seenIds.add(lord.id);
        const holdings = (world.holdings || []).filter((h) => h.ownerId === lord.id).length;
        list.push({ character: lord, county: cty, holdingCount: Math.max(1, holdings) });
      }
    }

    // Also include any other sworn fiefholder in the realm
    for (const ch of realmChars) {
      if (
        [
          'Vassal Duke',
          'Vassal Count',
          'Vassal Baron',
          'Lord Mayor',
          'Merchant Guildmaster',
          'Guildmaster',
          'Portmaster',
          'Village Bailiff',
        ].includes(ch.role) &&
        !seenIds.has(ch.id) &&
        ch.id !== ruler?.id
      ) {
        seenIds.add(ch.id);
        const cty = realmCounties.find((c) => c.id === ch.countyId);
        list.push({ character: ch, county: cty, holdingCount: Math.max(1, (ch.heldHoldingIds || []).length) });
      }
    }

    const tierOrder: Record<string, number> = {
      Emperor: 6,
      King: 5,
      Duke: 4,
      Count: 3,
      Baron: 2,
      Mayor: 1,
      Commoner: 0,
    };
    list.sort((a, b) => (tierOrder[b.character.titleTier || 'Commoner'] || 0) - (tierOrder[a.character.titleTier || 'Commoner'] || 0));

    return list;
  }, [realmCounties, world.characters, ruler, realmChars, world.holdings]);

  // Demographics aggregation (natural rural countryside + estate composition)
  const realmDemographics = useMemo(() => {
    let totalUrbanPop = 0;
    let totalRuralPop = 0;
    let citizenryPeasantry = 0;
    let artisans = 0;
    let clergy = 0;
    let soldiery = 0;
    let weightedGrowth = 0;

    const realmBurgs = world.burgs.filter((b) => b.stateId === realm?.id);
    for (const b of realmBurgs) {
      const pop = b.population < 50 ? Math.round(b.population * 1000) : (b.population || 1200);
      const demo = b.demographics || CarryingCapacityEngine.computeBurgDemographics(b, 0);

      const urbanPart = Math.round(pop * (demo.urbanSharePct / 100));
      const ruralBurgPart = Math.max(0, pop - urbanPart);
      totalUrbanPop += urbanPart;
      totalRuralPop += ruralBurgPart;

      citizenryPeasantry += demo.peasantry;
      artisans += demo.artisans;
      clergy += demo.clergy;
      soldiery += demo.soldiery;
      weightedGrowth += demo.annualGrowthRatePct * pop;
    }

    let avgDev = 0;
    for (const cty of realmCounties) {
      const dev = cty.development || 25;
      avgDev += dev;
      let countyRuralCellsPop = 0;
      for (const cIdx of cty.cellIndices || []) {
        const cell = world.cells?.[cIdx];
        if (!cell) continue;
        const dens = Math.max(12, cell.populationDensity || 54);
        // Each map cell models ~68 km2 of settled medieval hinterland
        countyRuralCellsPop += Math.round(dens * 68);
      }
      if (countyRuralCellsPop === 0) {
        countyRuralCellsPop = Math.round((cty.cellIndices?.length || 10) * 680 * (1 + dev / 100));
      }
      totalRuralPop += countyRuralCellsPop;
      citizenryPeasantry += Math.round(countyRuralCellsPop * 0.93);
      clergy += Math.round(countyRuralCellsPop * 0.02);
      artisans += Math.round(countyRuralCellsPop * 0.05);
    }
    avgDev = realmCounties.length > 0 ? Math.round(avgDev / realmCounties.length) : 35;

    const totalPop = Math.max(1, totalUrbanPop + totalRuralPop);
    const totalBurgPop = realmBurgs.reduce((acc, b) => acc + (b.population < 50 ? b.population * 1000 : (b.population || 2400)), 0);
    const avgAnnualGrowthPct = totalBurgPop > 0 ? Math.round((weightedGrowth / totalBurgPop) * 100) / 100 : 0.65;

    const urbanSharePct = Math.round((totalUrbanPop / totalPop) * 1000) / 10;
    const ruralSharePct = Math.round((100 - urbanSharePct) * 10) / 10;

    const milBreakdown = realm
      ? computeRealmMilitaryBreakdown(realm.id, world)
      : {
          urbanPop: totalUrbanPop,
          ruralPop: totalRuralPop,
          totalPop,
          avgDev,
          levyCount: Math.round(totalPop * 0.015),
          menAtArmsTotal: Math.round(totalPop * 0.0024),
          heavyInfantry: Math.round(totalPop * 0.00072),
          knights: Math.round(totalPop * 0.00038),
          crossbowmen: Math.round(totalPop * 0.00048),
          pikemen: Math.round(totalPop * 0.00058),
          culturalGuard: Math.round(totalPop * 0.00024),
          siegeEngines: 2,
          totalMobilizedForce: Math.round(totalPop * 0.0174),
        };

    return {
      totalPop,
      totalUrbanPop,
      totalRuralPop,
      urbanSharePct,
      ruralSharePct,
      peasantry: citizenryPeasantry,
      artisans,
      clergy,
      soldiery,
      avgAnnualGrowthPct,
      avgDev,
      levyCount: milBreakdown.levyCount,
      menAtArmsTotal: milBreakdown.menAtArmsTotal,
      heavyInfantry: milBreakdown.heavyInfantry,
      knights: milBreakdown.knights,
      crossbowmen: milBreakdown.crossbowmen,
      pikemen: milBreakdown.pikemen,
      culturalGuard: milBreakdown.culturalGuard,
      siegeEngines: milBreakdown.siegeEngines,
      totalMobilizedForce: milBreakdown.totalMobilizedForce,
      holdingCount: realmBurgs.length + realmCounties.length * 2,
    };
  }, [realm, realmCounties, world]);

  // County & Burg Development and Slots
  const currentDev = panelMode === 'burg'
    ? (burg?.developmentLevel || 30)
    : (county?.development || 32);
  const devClamped = Math.max(1, Math.min(100, currentDev));

  const devTier = useMemo(() => {
    if (devClamped < 18) return { label: 'Wilderness Frontier', color: 'text-stone-400', bg: 'bg-stone-900' };
    if (devClamped < 38) return { label: 'Settled Agrarian Fief', color: 'text-emerald-400', bg: 'bg-emerald-950/60' };
    if (devClamped < 62) return { label: 'Flourishing Commercial Domain', color: 'text-amber-400', bg: 'bg-amber-950/60' };
    if (devClamped < 82) return { label: 'High Medieval Regional Center', color: 'text-sky-400', bg: 'bg-sky-950/60' };
    return { label: 'Grand Imperial Hearth', color: 'text-purple-400', bg: 'bg-purple-950/60' };
  }, [devClamped]);

  // Story Dynamics & Feuds
  const cadetFeuds: CadetHouse[] = useMemo(() => {
    const houses = world.cadetHouses ? (Array.isArray(world.cadetHouses) ? world.cadetHouses : Object.values(world.cadetHouses)) : [];
    return houses.filter((h: CadetHouse) => Boolean(h.feudTargetDynasty));
  }, [world.cadetHouses]);

  const carryingCapacityReport = useMemo(() => {
    if (!burg) return null;
    const cell = world.cells?.find((c) => c.index === burg.cellIndex);
    const totalCapacity = CarryingCapacityEngine.calculateBurgCapacity(burg, world);
    const currentPopulation = burg.population || 2500;
    const overcrowdingRatio = Math.round((currentPopulation / Math.max(1, totalCapacity)) * 100) / 100;
    const isOvercrowded = overcrowdingRatio > 1.0;
    const foodBalance = burg.foodSurplus || 0;
    const epidemicRiskMultiplier = Math.max(1.0, overcrowdingRatio);
    const infrastructureBonus = Math.round(((burg.developmentLevel || 30) / 10) * 450);
    const statusLabel = burg.isStarving
      ? '🚨 Starving & Blockaded'
      : isOvercrowded
      ? '⚠️ Slum Overcrowding'
      : '🌿 Biosphere Equilibrium';

    return {
      biome: cell?.biome || 'Temperate',
      isOvercrowded,
      statusLabel,
      currentPopulation,
      totalCapacity,
      overcrowdingRatio,
      foodBalance,
      epidemicRiskMultiplier,
      infrastructureBonus,
    };
  }, [burg, world]);

  const activeFlowCaravans = useMemo(() => {
    if (!world.tradeNetwork?.caravans) return [];
    return world.tradeNetwork.caravans.filter((c) => !c.isLooted);
  }, [world.tradeNetwork]);

  const activeSieges = world.activeSieges || [];
  const realmSieges = activeSieges.filter((s) => {
    const targetProv = world.provinces?.find((p) => p.id === s.provinceId);
    return targetProv?.realmId === realm?.id || (realm?.name ? s.holdingName.includes(realm.name) : false);
  });

  const allActiveWars = world.activeWars || [];
  const realmActiveWars = allActiveWars.filter(
    (w) => w.attackerRealmId === realm?.id || w.defenderRealmId === realm?.id
  );
  const realmFactions = (world.factions || []).filter((f) => {
    const leader = world.characters.find((c) => c.id === f.leaderId);
    return leader?.realmId === realm?.id;
  });
  const realmActiveSchemes = realmChars.filter((c) => c.isAlive && Boolean(c.activeScheme));

  // Local Burg / Holding details
  const burgMarket = burg && economy ? economy.burgMarkets[burg.id] : undefined;
  const burgHolding = burg ? world.holdings?.find((h) => h.id === burg.id || h.name === burg.name) : undefined;
  const burgOwner = burgHolding?.ownerId
    ? world.characters.find((c) => c.id === burgHolding.ownerId)
    : undefined;

  // Fiscal profile for active character & realm ruler (live calculation fallback before first tick)
  const fiscal = useMemo(
    () =>
      activeChar && economy
        ? economy.fiscalProfiles[activeChar.id] || calculateFiscalProfile(activeChar, world, economy)
        : undefined,
    [activeChar, economy, world]
  );
  const realmFiscal = useMemo(
    () =>
      ruler && economy
        ? economy.fiscalProfiles[ruler.id] || calculateFiscalProfile(ruler, world, economy)
        : undefined,
    [ruler, economy, world]
  );
  const realmPurity = realm && economy ? economy.realmCoinPurity[realm.id] || 1.0 : 1.0;

  // Imperial Realm Currency & Finite Specie Supply
  const realmCurrency = useMemo(
    () => (realm ? getRealmCurrency(realm.id, world) : null),
    [realm, world]
  );

  // Settlement Physical Barter Exchange & Direct Ratios
  const burgBarterShare = useMemo(
    () => (burg ? calculateBurgBarterShare(burg, world) : 0.35),
    [burg, world]
  );

  const burgBarterTransactions = useMemo(
    () => (burg ? getBurgBarterTransactions(burg, world) : []),
    [burg, world]
  );

  // Actions
  const handleDebase = () => {
    if (!realm) return;
    const updated = cloneWorldState(world);
    const res = debaseCurrency(updated, realm.id, 0.1);
    onUpdateWorld(updated);
    setNotificationMsg(
      res.lumpSumGained > 0
        ? `ROYAL MINT DEBASED: +${Math.round(res.lumpSumGained).toLocaleString()}g extracted. Merchant trust and coin purity shaken!`
        : `ROYAL MINT DEBASED: Specie clipped. Merchant trust shaken!`
    );
    setTimeout(() => setNotificationMsg(null), 4000);
  };

  const handleTakeLoan = (bankId: string, amount: number) => {
    if (!activeChar) return;
    const updated = cloneWorldState(world);
    const res = takeBankLoan(updated, bankId, activeChar.id, amount);
    if (res.success && res.loan) {
      onUpdateWorld(updated);
      setNotificationMsg(`SOVEREIGN BOND ISSUED: Borrowed ${amount.toLocaleString()}g from ${res.loan.bankName}. Beware debt foreclosure!`);
      setTimeout(() => setNotificationMsg(null), 4000);
    }
  };

  const handleSendGift = () => {
    if (!activeChar) return;
    const target = spouse || rival || ruler;
    if (!target) return;
    const updated = cloneWorldState(world);
    const success = PlayerActionEngine.sendGift(activeChar, target, 150, updated);
    if (success) {
      onUpdateWorld(updated);
      setNotificationMsg(`DIPLOMATIC GIFT: 150g presented to ${target.name}. Warmth and allegiance elevated!`);
      setTimeout(() => setNotificationMsg(null), 3500);
    } else {
      setNotificationMsg(`⚠️ Insufficient coin in treasury (150g required).`);
      setTimeout(() => setNotificationMsg(null), 3000);
    }
  };

  const handleToggleLevies = () => {
    if (!burg) return;
    const updated = cloneWorldState(world);
    const res = toggleLeviesRaised(burg.id, updated);
    if (res.success) {
      onUpdateWorld(updated);
      setNotificationMsg(res.message);
      setTimeout(() => setNotificationMsg(null), 4000);
    }
  };

  const handleUpgradeBuilding = (slotBaseId: string) => {
    if (!burg) return;
    const updated = cloneWorldState(world);
    const res = upgradeSettlementBuilding(burg.id, slotBaseId, updated);
    if (res.success) {
      onUpdateWorld(updated);
      setNotificationMsg(res.message);
      setTimeout(() => setNotificationMsg(null), 3500);
    } else {
      setNotificationMsg(`⚠️ ${res.message}`);
      setTimeout(() => setNotificationMsg(null), 3500);
    }
  };

  const handleDevelopFief = () => {
    if (!burg) return;
    const updated = cloneWorldState(world);
    const res = developFiefInfrastructure(burg.id, updated);
    if (res.success) {
      onUpdateWorld(updated);
      setNotificationMsg(res.message);
      setTimeout(() => setNotificationMsg(null), 3500);
    } else {
      setNotificationMsg(`⚠️ ${res.message}`);
      setTimeout(() => setNotificationMsg(null), 3500);
    }
  };

  const handleUpgradeDevSlot = (slotId: string) => {
    if (!burg) return;
    const updated = cloneWorldState(world);
    const targetBurg = updated.burgs.find((b) => b.id === burg.id);
    if (!targetBurg) return;
    const res = upgradeBurgSlot(targetBurg, slotId, updated);
    if (res.success) {
      onUpdateWorld?.(updated);
      setNotificationMsg(res.message);
      setTimeout(() => setNotificationMsg(null), 3500);
    } else {
      setNotificationMsg(`⚠️ ${res.message}`);
      setTimeout(() => setNotificationMsg(null), 3500);
    }
  };

  const handleIssueCharter = () => {
    if (!realm || charterCellIndex === null || !charterName.trim()) return;
    const updated = cloneWorldState(world);
    const res = issueSettlementCharter({
      founderId: ruler.id,
      realmId: realm.id,
      cellIndex: charterCellIndex,
      name: charterName.trim(),
      settlementType: charterType,
      delegateToVassal: charterDelegateToVassal,
      vassalRole: charterVassalRole,
      world: updated,
    });
    if (res.success) {
      onUpdateWorld(updated);
      setIsCharterModalOpen(false);
      setCharterName('');
      setCharterCellIndex(null);
      setNotificationMsg(res.message);
      if (res.newBurg) {
        onSelectBurg(res.newBurg);
        setPanelMode('burg');
      }
      setTimeout(() => setNotificationMsg(null), 5000);
    } else {
      setNotificationMsg(`⚠️ ${res.message}`);
      setTimeout(() => setNotificationMsg(null), 4000);
    }
  };

  useEffect(() => {
    if (realm) {
      setDraftRealm({
        name: realm.name || '',
        color: realm.color || '#c2410c',
        culture: realm.culture || '',
        religion: realm.religion || '',
        government: realm.government || '',
        societyType: realm.societyType || 'Stratified Feudalism',
        foundingLegend: realm.foundingLegend || realm.lore || '',
      });
    }
  }, [realm?.id, isEditDrawerOpen]);

  useEffect(() => {
    if (county) {
      setDraftCounty({
        name: county.name || '',
        tier: county.tier || (county.name.includes('Duchy') ? 'Duchy' : 'County'),
        development: county.development || 25,
        tradition: county.tradition || 'Feudal Law',
        color: county.color || '#78716c',
      });
    }
  }, [county?.id, isEditDrawerOpen]);

  useEffect(() => {
    if (burg) {
      setDraftBurg({
        name: burg.name || '',
        type: burg.type || 'Market Town',
        population: burg.population || 1500,
        tradeGood: burg.tradeGood || 'Grain',
        developmentLevel: burg.developmentLevel || 25,
        lore: burg.lore || '',
      });
    }
  }, [burg?.id, isEditDrawerOpen]);

  useEffect(() => {
    if (activeChar) {
      setDraftChar({
        name: activeChar.name || '',
        age: activeChar.age ?? 28,
        gender: activeChar.gender || 'male',
        isAlive: activeChar.isAlive !== false,
        role: activeChar.role || 'Court Noble',
        title: activeChar.title || '',
        houseName: activeChar.houseName || '',
        baseDiplomacy: activeChar.baseDiplomacy ?? 8,
        baseMartial: activeChar.baseMartial ?? 8,
        baseStewardship: activeChar.baseStewardship ?? 8,
        baseIntrigue: activeChar.baseIntrigue ?? 8,
        baseLearning: activeChar.baseLearning ?? 8,
        baseProwess: activeChar.baseProwess ?? 8,
        knownFatherId: activeChar.knownFatherId || '',
        motherId: activeChar.motherId || '',
        spouseId: activeChar.spouseId || '',
        liegeId: activeChar.liegeId || '',
      });
      setEditError(null);
    }
  }, [activeChar?.id, isEditDrawerOpen]);

  const allTraitNames = useMemo(() => getAllV17Traits().map((t) => t.name).sort(), [world.paintRevision]);

  const realmFlag = useMemo(() => {
    if (!realm) return null;
    return resolveCountryFlagDataUrl(realm.heraldry, `${realm.id}_${realm.name}`);
  }, [realm?.heraldry, realm?.id, realm?.name]);

  const showRealmFlagBackdrop = panelMode === 'realm' && Boolean(selectedRealm || realm) && Boolean(realmFlag);

  if (!isOpen) return null;

  if (world.realms.length === 0 || !realm || !ruler) {
    return (
      <div className="w-full h-full flex flex-col bg-stone-950 text-stone-200 border-l border-stone-800 p-6 justify-between">
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-stone-800 pb-3">
            <div className="flex items-center gap-2.5">
              <Crown className="w-5 h-5 text-amber-400" />
              <h2 className="font-cinzel font-bold text-base text-amber-100">
                Uncharted Canvas
              </h2>
            </div>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 cursor-pointer"
                title="Close Inspector"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="rounded-2xl bg-stone-900/60 border border-stone-800 p-5 space-y-3">
            <div className="text-xs font-semibold text-amber-300 uppercase tracking-wider">
              Blank World Builder Workspace
            </div>
            <p className="text-xs text-stone-300 leading-relaxed">
              No sovereign realms, counties, settlements, or noble houses exist on this canvas yet.
            </p>
            <p className="text-xs text-stone-400 leading-relaxed">
              Use the World Builder Palette on the left to sculpt continents and islands, draw navigable rivers, stamp settlements, or click <strong className="text-amber-300">Auto-Populate Terrain</strong> once your landmass is ready.
            </p>
          </div>
        </div>
        <div className="text-[11px] text-stone-500 border-t border-stone-800 pt-3">
          Switch back to Simulator Mode after populating at least one realm.
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="w-full h-full flex flex-col bg-stone-950 text-stone-200 overflow-hidden font-sans select-text border-l border-stone-800 shadow-2xl relative"
      >
        {/* Full-bleed Country Flag Background when a State is selected in the Realm Tab */}
        {showRealmFlagBackdrop && realmFlag && (
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
            <img
              src={realmFlag.dataUrl}
              alt=""
              className="w-full h-full object-cover object-center opacity-35 saturate-110 scale-[1.02]"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-stone-950/55 via-stone-950/78 to-stone-950/92" />
          </div>
        )}

        {/* Double-padded Top Header (20-24px padding) */}
        <div
          className={`relative z-10 p-5 pb-4 border-b border-white/10 ${
            showRealmFlagBackdrop ? 'bg-stone-950/40 backdrop-blur-[2px]' : 'bg-black/50'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            {/* Crest & Title depending on mode */}
            {panelMode === 'character' ? (
              <div className="flex items-center gap-3.5 min-w-0">
                <button
                  type="button"
                  onClick={() => onOpenHeraldryStudio?.({ kind: 'character', id: activeChar.id, label: activeChar.name })}
                  disabled={!onOpenHeraldryStudio}
                  title={onOpenHeraldryStudio ? 'Edit Personal Arms' : undefined}
                  className={`relative shrink-0 rounded-md ${onOpenHeraldryStudio ? 'cursor-pointer hover:ring-2 hover:ring-amber-400/60 transition-all' : ''}`}
                >
                  <HeraldryShield
                    coatOfArms={activeChar.coatOfArms}
                    unheralded={!activeChar.coatOfArms}
                    seed={`${activeChar.realmId}_${activeChar.houseName}_${activeChar.id}`}
                    size={44}
                  />
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-cinzel font-bold text-base text-amber-100 truncate">
                      {activeChar.name}
                    </h2>
                    <span className="text-[11px] font-mono tabular-nums text-stone-400 shrink-0">
                      {activeChar.gender === 'female' ? 'Female' : 'Male'} · Age {activeChar.age}
                    </span>
                    {!activeChar.isAlive && (
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-red-400 shrink-0">
                        · Deceased{activeChar.deathYear ? ` (${activeChar.deathYear})` : ''}
                      </span>
                    )}
                  </div>
                  {!activeChar.isAlive && activeChar.causeOfDeath && (
                    <div className="mt-1 px-2 py-1 rounded-md bg-red-950/45 border border-red-900/50 text-[11px] text-red-200 flex flex-wrap items-center gap-1.5">
                      <Skull className="w-3 h-3 text-red-400 shrink-0" />
                      <span className="font-semibold text-red-300">
                        {activeChar.deathCategory || inferDeathCategory(activeChar.causeOfDeath)}:
                      </span>
                      <span>{activeChar.causeOfDeath}</span>
                    </div>
                  )}
                  <p className="text-xs text-stone-400 truncate mt-0.5 flex items-center gap-1.5">
                    <span className="font-medium text-amber-200/90">{activeChar.title}</span>
                    {activeChar.houseName && (
                      <>
                        <span className="text-stone-600">·</span>
                        <button
                          type="button"
                          onClick={() => onOpenHouse?.(activeChar.houseName)}
                          className="text-amber-300 hover:text-amber-200 underline decoration-amber-500/40 underline-offset-2 cursor-pointer"
                          title="Open House Dynasty Tree & Ancestors"
                        >
                          House {activeChar.houseName}
                        </button>
                      </>
                    )}
                    <span className="text-stone-600">·</span>
                    <span className="font-mono text-stone-400">
                      {getCharacterRankTitle(activeChar, world)}
                    </span>
                  </p>
                  {activeChar.houseName && (() => {
                    const hp = computeHouseProfile(activeChar.houseName, world);
                    return (
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-stone-400 tabular-nums">
                        <span className="text-amber-300/90 font-semibold">{hp.powerTier}</span>
                        <span>· Inf {hp.influenceScore}/100</span>
                        <span>
                          · Leverage {hp.negotiatingPower >= 0 ? '+' : ''}
                          {hp.negotiatingPower}
                        </span>
                        {hp.ancestralClaims.length > 0 && (
                          <span>· {hp.ancestralClaims.length} Ancestral Claim{hp.ancestralClaims.length > 1 ? 's' : ''}</span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            ) : panelMode === 'burg' ? (
              <div className="flex items-center gap-3.5 min-w-0">
                <button
                  type="button"
                  onClick={() => onOpenHeraldryStudio?.({ kind: 'burg', id: burg.id, label: burg.name })}
                  disabled={!onOpenHeraldryStudio}
                  title={onOpenHeraldryStudio ? 'Edit Settlement Civic Arms' : undefined}
                  className={`shrink-0 rounded-md ${onOpenHeraldryStudio ? 'cursor-pointer hover:ring-2 hover:ring-amber-400/60 transition-all' : ''}`}
                >
                  <HeraldryShield
                    coatOfArms={burg.coatOfArms || county?.coatOfArms || realm.heraldry}
                    seed={`burg_${burg.id}_${burg.name}`}
                    size={44}
                  />
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-cinzel font-bold text-base text-amber-100 truncate">
                      {burg.name}
                    </h2>
                    <span className="text-[11px] font-mono text-sky-300/90 shrink-0">
                      · {burg.type || 'Citadel'}
                    </span>
                  </div>
                  <p className="text-xs text-stone-400 truncate mt-0.5 font-mono tabular-nums">
                    Pop {(burg.population || 2500).toLocaleString()} · <span className="font-sans">{realm.name}</span>
                  </p>
                </div>
              </div>
            ) : panelMode === 'county' ? (
              <div className="flex items-center gap-3.5 min-w-0">
                <button
                  type="button"
                  onClick={() => onOpenHeraldryStudio?.({ kind: 'county', id: county.id, label: county.name })}
                  disabled={!onOpenHeraldryStudio}
                  title={onOpenHeraldryStudio ? 'Edit County / Duchy Arms' : undefined}
                  className={`shrink-0 rounded-md ${onOpenHeraldryStudio ? 'cursor-pointer hover:ring-2 hover:ring-amber-400/60 transition-all' : ''}`}
                >
                  <HeraldryShield
                    coatOfArms={
                      county.coatOfArms ||
                      world.characters.find((c) => c.id === county.rulerId)?.coatOfArms ||
                      realm.heraldry
                    }
                    seed={`county_${county.id}_${county.name}`}
                    size={44}
                  />
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-cinzel font-bold text-base text-amber-100 truncate">
                      {county.name.startsWith('Grand Duchy') ||
                      county.name.startsWith('Duchy') ||
                      county.name.startsWith('Royal Duchy') ||
                      county.name.startsWith('Crown Demesne') ||
                      county.name.startsWith('Earldom') ||
                      county.name.startsWith('County')
                        ? county.name
                        : `${county.tier === 'Duchy' ? 'Duchy of' : 'County of'} ${county.name}`}
                    </h2>
                  </div>
                  <p className="text-xs text-stone-400 truncate mt-0.5">
                    Tradition: {county.tradition || 'Feudal Law'} · {realm.name}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3.5 min-w-0">
                <button
                  type="button"
                  onClick={() => onOpenHeraldryStudio?.({ kind: 'realm', id: realm.id, label: realm.name })}
                  disabled={!onOpenHeraldryStudio}
                  title={onOpenHeraldryStudio ? 'Edit Realm Coat of Arms' : undefined}
                  className={`shrink-0 rounded-md ${onOpenHeraldryStudio ? 'cursor-pointer hover:ring-2 hover:ring-amber-400/60 transition-all' : ''}`}
                >
                  <HeraldryShield
                    coatOfArms={realm.heraldry}
                    seed={`${realm.id}_${realm.name}`}
                    size={44}
                  />
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-cinzel font-bold text-base text-amber-100 truncate">
                      {realm.name}
                    </h2>
                  </div>
                  <p className="text-xs text-stone-400 truncate mt-0.5 flex items-center gap-1.5">
                    <span>{realm.culture}</span>
                    <span className="text-stone-600">·</span>
                    <span className="text-amber-400 font-medium">{realm.religion}</span>
                    <span className="text-stone-600">·</span>
                    <span className="font-mono">{realmCounties.length} Fiefs</span>
                  </p>
                  <p className="text-[11px] text-stone-400/90 truncate mt-0.5">
                    {realm.government}{realm.societyType ? ` · ${realm.societyType}` : ''}
                  </p>
                </div>
              </div>
            )}

            {/* Header Action Icons */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setEditError(null);
                  setIsEditDrawerOpen((v) => !v);
                }}
                title="Edit Name & Details"
                className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                  isEditDrawerOpen
                    ? 'bg-amber-600 text-white border-amber-500'
                    : 'bg-stone-900/80 text-amber-300 border-amber-500/40 hover:bg-amber-600/20'
                }`}
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
              {onOpenHeraldryStudio && (
                <button
                  type="button"
                  onClick={() => {
                    if (panelMode === 'realm' && realm) {
                      onOpenHeraldryStudio({ kind: 'realm', id: realm.id, label: realm.name });
                    } else if (panelMode === 'county' && county) {
                      onOpenHeraldryStudio({ kind: 'county', id: county.id, label: county.name });
                    } else if (panelMode === 'burg' && burg) {
                      onOpenHeraldryStudio({ kind: 'burg', id: burg.id, label: burg.name });
                    } else if (panelMode === 'character' && activeChar) {
                      onOpenHeraldryStudio({ kind: 'character', id: activeChar.id, label: activeChar.name });
                    }
                  }}
                  title="Edit Heraldry in Studio"
                  className="p-1.5 rounded-lg bg-stone-900/80 border border-stone-700 hover:border-amber-500/50 text-amber-300 transition-colors cursor-pointer"
                >
                  <Palette className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() =>
                  onOpenCompendiumForEntity(
                    panelMode === 'character'
                      ? `lore_${activeChar?.id || ''}`
                      : panelMode === 'burg'
                      ? `lore_${burg?.id || ''}`
                      : panelMode === 'county'
                      ? `lore_${county?.id || ''}`
                      : `lore_${realm?.id || ''}`
                  )
                }
                title="Open Compendium"
                className="p-2 rounded-xl hover:bg-stone-800/80 text-stone-400 hover:text-amber-300 transition-colors cursor-pointer"
              >
                <BookOpen className="w-4 h-4" />
              </button>
              <button
                onClick={onClose}
                title="Close Panel"
                className="p-2 rounded-xl hover:bg-stone-800/80 text-stone-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mode Switcher Tabs: Instant one-click pivoting */}
          <div className="grid grid-cols-4 gap-1 mt-4 p-1 bg-stone-950/70 border border-white/[0.08] rounded-lg text-xs font-medium">
            <button
              onClick={() => handleSwitchTab('realm')}
              className={`py-1.5 rounded-md text-center transition-colors cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
                panelMode === 'realm'
                  ? 'bg-amber-600 text-white font-semibold'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <Crown className="w-3.5 h-3.5 shrink-0" />
              <span>Realm</span>
            </button>
            <button
              onClick={() => handleSwitchTab('burg')}
              className={`py-1.5 rounded-md text-center transition-colors cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
                panelMode === 'burg'
                  ? 'bg-amber-600 text-white font-semibold'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <Castle className="w-3.5 h-3.5 shrink-0" />
              <span>Settlement</span>
            </button>
            <button
              onClick={() => handleSwitchTab('county')}
              className={`py-1.5 rounded-md text-center transition-colors cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
                panelMode === 'county'
                  ? 'bg-amber-600 text-white font-semibold'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span>County</span>
            </button>
            <button
              onClick={() => handleSwitchTab('character')}
              className={`py-1.5 rounded-md text-center transition-colors cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
                panelMode === 'character'
                  ? 'bg-amber-600 text-white font-semibold'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <User className="w-3.5 h-3.5 shrink-0" />
              <span>Noble</span>
            </button>
          </div>
        </div>

        {/* Inline Entity Editor Drawer (Available in Game & Builder modes) */}
        {isEditDrawerOpen && (
          <div className="relative z-10 border-b border-amber-500/35 bg-stone-900/95 px-5 py-3.5 space-y-3 text-xs max-h-[46vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                <Pencil className="w-3.5 h-3.5" />
                Edit {panelMode === 'realm' ? 'Realm' : panelMode === 'burg' ? 'Settlement' : panelMode === 'county' ? 'County / Duchy' : 'Noble Character'}
              </span>
              <button
                type="button"
                onClick={() => setIsEditDrawerOpen(false)}
                className="text-stone-400 hover:text-white text-[11px] cursor-pointer"
              >
                Done
              </button>
            </div>

            {editError && (
              <div className="px-2.5 py-1.5 rounded bg-red-950/70 border border-red-500/40 text-red-200 text-[11px]">
                {editError}
              </div>
            )}

            {panelMode === 'realm' && realm && (
              <div className="space-y-2.5">
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <div>
                    <label className="block text-[10px] text-stone-400 mb-1">Realm Name</label>
                    <input
                      type="text"
                      value={draftRealm.name}
                      onChange={(e) => setDraftRealm((d) => ({ ...d, name: e.target.value }))}
                      className="w-full px-2.5 py-1.5 rounded bg-stone-950 border border-stone-700 text-stone-100 text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-stone-400 mb-1">Map Color</label>
                    <input
                      type="color"
                      value={draftRealm.color}
                      onChange={(e) => setDraftRealm((d) => ({ ...d, color: e.target.value }))}
                      className="h-8 w-11 rounded bg-stone-950 border border-stone-700 cursor-pointer"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-stone-400 mb-1">Culture</label>
                    <input
                      type="text"
                      list="world-cultures-list"
                      value={draftRealm.culture}
                      onChange={(e) => setDraftRealm((d) => ({ ...d, culture: e.target.value }))}
                      className="w-full px-2 py-1.5 rounded bg-stone-950 border border-stone-700 text-stone-100 text-xs"
                    />
                    <datalist id="world-cultures-list">
                      {(world.cultures || []).map((c) => (
                        <option key={c.id} value={c.name} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-[10px] text-stone-400 mb-1">Religion</label>
                    <input
                      type="text"
                      list="world-religions-list"
                      value={draftRealm.religion}
                      onChange={(e) => setDraftRealm((d) => ({ ...d, religion: e.target.value }))}
                      className="w-full px-2 py-1.5 rounded bg-stone-950 border border-stone-700 text-stone-100 text-xs"
                    />
                    <datalist id="world-religions-list">
                      {(world.religions || []).map((rel) => (
                        <option key={rel.id} value={rel.name} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-[10px] text-stone-400 mb-1">Medieval Government</label>
                    <input
                      type="text"
                      list="medieval-gov-list"
                      value={draftRealm.government}
                      onChange={(e) => setDraftRealm((d) => ({ ...d, government: e.target.value }))}
                      className="w-full px-2 py-1.5 rounded bg-stone-950 border border-stone-700 text-stone-100 text-xs"
                    />
                    <datalist id="medieval-gov-list">
                      {MEDIEVAL_GOVERNMENT_TYPES.map((g) => (
                        <option key={g.id} value={g.name} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-[10px] text-stone-400 mb-1">Society Type</label>
                    <input
                      type="text"
                      list="medieval-society-list"
                      value={draftRealm.societyType}
                      onChange={(e) => setDraftRealm((d) => ({ ...d, societyType: e.target.value }))}
                      className="w-full px-2 py-1.5 rounded bg-stone-950 border border-stone-700 text-stone-100 text-xs"
                    />
                    <datalist id="medieval-society-list">
                      {MEDIEVAL_SOCIETY_TYPES.map((s) => (
                        <option key={s.id} value={s.name} />
                      ))}
                    </datalist>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] text-stone-400 mb-1">Founding Legend</label>
                  <textarea
                    rows={2}
                    value={draftRealm.foundingLegend}
                    onChange={(e) => setDraftRealm((d) => ({ ...d, foundingLegend: e.target.value }))}
                    className="w-full px-2.5 py-1.5 rounded bg-stone-950 border border-stone-700 text-stone-100 text-xs resize-none"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  {onOpenHeraldryStudio && (
                    <button
                      type="button"
                      onClick={() => onOpenHeraldryStudio({ kind: 'realm', id: realm.id, label: realm.name })}
                      className="px-2.5 py-1.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-amber-300 text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <Palette className="w-3 h-3" />
                      Edit Coat of Arms
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const next = updateRealm(world, realm.id, draftRealm);
                      onUpdateWorld(next);
                      setNotificationMsg(`Updated Kingdom of ${draftRealm.name}.`);
                    }}
                    className="ml-auto px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Apply Realm
                  </button>
                </div>
              </div>
            )}

            {panelMode === 'county' && county && (
              <div className="space-y-2.5">
                <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                  <div>
                    <label className="block text-[10px] text-stone-400 mb-1">Fief Name</label>
                    <input
                      type="text"
                      value={draftCounty.name}
                      onChange={(e) => setDraftCounty((d) => ({ ...d, name: e.target.value }))}
                      className="w-full px-2.5 py-1.5 rounded bg-stone-950 border border-stone-700 text-stone-100 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-stone-400 mb-1">Rank</label>
                    <select
                      value={draftCounty.tier}
                      onChange={(e) => setDraftCounty((d) => ({ ...d, tier: e.target.value as 'County' | 'Duchy' }))}
                      className="px-2 py-1.5 rounded bg-stone-950 border border-stone-700 text-stone-100 text-xs"
                    >
                      <option value="County">County</option>
                      <option value="Duchy">Duchy</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-stone-400 mb-1">Color</label>
                    <input
                      type="color"
                      value={draftCounty.color}
                      onChange={(e) => setDraftCounty((d) => ({ ...d, color: e.target.value }))}
                      className="h-8 w-10 rounded bg-stone-950 border border-stone-700 cursor-pointer"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-stone-400 mb-1">
                      Development ({draftCounty.development}/100)
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={100}
                      value={draftCounty.development}
                      onChange={(e) => setDraftCounty((d) => ({ ...d, development: Number(e.target.value) }))}
                      className="w-full accent-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-stone-400 mb-1">Law Tradition</label>
                    <input
                      type="text"
                      value={draftCounty.tradition}
                      onChange={(e) => setDraftCounty((d) => ({ ...d, tradition: e.target.value }))}
                      className="w-full px-2 py-1.5 rounded bg-stone-950 border border-stone-700 text-stone-100 text-xs"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  {onOpenHeraldryStudio && (
                    <button
                      type="button"
                      onClick={() => onOpenHeraldryStudio({ kind: 'county', id: county.id, label: county.name })}
                      className="px-2.5 py-1.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-amber-300 text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <Palette className="w-3 h-3" />
                      Edit County Arms
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const next = updateCounty(world, county.id, draftCounty);
                      onUpdateWorld(next);
                      setNotificationMsg(`Updated ${draftCounty.name}.`);
                    }}
                    className="ml-auto px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Apply County
                  </button>
                </div>
              </div>
            )}

            {panelMode === 'burg' && burg && (
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-stone-400 mb-1">Settlement Name</label>
                    <input
                      type="text"
                      value={draftBurg.name}
                      onChange={(e) => setDraftBurg((d) => ({ ...d, name: e.target.value }))}
                      className="w-full px-2.5 py-1.5 rounded bg-stone-950 border border-stone-700 text-stone-100 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-stone-400 mb-1">Classification</label>
                    <select
                      value={draftBurg.type}
                      onChange={(e) => setDraftBurg((d) => ({ ...d, type: e.target.value as Burg['type'] }))}
                      className="w-full px-2 py-1.5 rounded bg-stone-950 border border-stone-700 text-stone-100 text-xs"
                    >
                      {[
                        'Capital Citadel',
                        'Royal Metropolis',
                        'Trade Port',
                        'Market Town',
                        'Farming Village',
                        'Fishing Port',
                        'Mountain Hamlet',
                        'Border Fortress',
                        'Ancient Sanctuary',
                      ].map((bt) => (
                        <option key={bt} value={bt}>{bt}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] text-stone-400 mb-1">Population</label>
                    <input
                      type="number"
                      min={50}
                      step={100}
                      value={draftBurg.population}
                      onChange={(e) => setDraftBurg((d) => ({ ...d, population: Number(e.target.value) }))}
                      className="w-full px-2 py-1.5 rounded bg-stone-950 border border-stone-700 text-stone-100 text-xs tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-stone-400 mb-1">Trade Good</label>
                    <select
                      value={draftBurg.tradeGood}
                      onChange={(e) => setDraftBurg((d) => ({ ...d, tradeGood: e.target.value }))}
                      className="w-full px-2 py-1.5 rounded bg-stone-950 border border-stone-700 text-stone-100 text-xs"
                    >
                      {Object.keys(COMMODITIES).map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-stone-400 mb-1">Dev ({draftBurg.developmentLevel})</label>
                    <input
                      type="range"
                      min={1}
                      max={100}
                      value={draftBurg.developmentLevel}
                      onChange={(e) => setDraftBurg((d) => ({ ...d, developmentLevel: Number(e.target.value) }))}
                      className="w-full accent-amber-500 mt-1"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] text-stone-400 mb-1">Architecture &amp; Lore</label>
                  <textarea
                    rows={2}
                    value={draftBurg.lore}
                    onChange={(e) => setDraftBurg((d) => ({ ...d, lore: e.target.value }))}
                    className="w-full px-2.5 py-1.5 rounded bg-stone-950 border border-stone-700 text-stone-100 text-xs resize-none"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  {onOpenHeraldryStudio && (
                    <button
                      type="button"
                      onClick={() => onOpenHeraldryStudio({ kind: 'burg', id: burg.id, label: burg.name })}
                      className="px-2.5 py-1.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-amber-300 text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <Palette className="w-3 h-3" />
                      Edit Civic Arms
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const next = updateBurg(world, burg.id, draftBurg);
                      onUpdateWorld(next);
                      setNotificationMsg(`Updated settlement ${draftBurg.name}.`);
                    }}
                    className="ml-auto px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Apply Settlement
                  </button>
                </div>
              </div>
            )}

            {panelMode === 'character' && activeChar && (
              <div className="space-y-2.5">
                <div className="grid grid-cols-[1fr_70px_80px] gap-2">
                  <div>
                    <label className="block text-[10px] text-stone-400 mb-1">Name</label>
                    <input
                      type="text"
                      value={draftChar.name}
                      onChange={(e) => setDraftChar((d) => ({ ...d, name: e.target.value }))}
                      className="w-full px-2 py-1.5 rounded bg-stone-950 border border-stone-700 text-stone-100 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-stone-400 mb-1">Age</label>
                    <input
                      type="number"
                      min={0}
                      max={120}
                      value={draftChar.age}
                      onChange={(e) => setDraftChar((d) => ({ ...d, age: Number(e.target.value) }))}
                      className="w-full px-2 py-1.5 rounded bg-stone-950 border border-stone-700 text-stone-100 text-xs tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-stone-400 mb-1">Gender</label>
                    <select
                      value={draftChar.gender}
                      onChange={(e) => setDraftChar((d) => ({ ...d, gender: e.target.value as 'male' | 'female' }))}
                      className="w-full px-1.5 py-1.5 rounded bg-stone-950 border border-stone-700 text-stone-100 text-xs"
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 items-end">
                  <div>
                    <label className="block text-[10px] text-stone-400 mb-1">Title</label>
                    <input
                      type="text"
                      value={draftChar.title}
                      onChange={(e) => setDraftChar((d) => ({ ...d, title: e.target.value }))}
                      className="w-full px-2 py-1.5 rounded bg-stone-950 border border-stone-700 text-stone-100 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-stone-400 mb-1">House Name</label>
                    <input
                      type="text"
                      value={draftChar.houseName}
                      onChange={(e) => setDraftChar((d) => ({ ...d, houseName: e.target.value }))}
                      className="w-full px-2 py-1.5 rounded bg-stone-950 border border-stone-700 text-stone-100 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-stone-400 mb-1">Role</label>
                    <select
                      value={draftChar.role}
                      onChange={(e) => setDraftChar((d) => ({ ...d, role: e.target.value as CourtRole }))}
                      className="w-full px-1.5 py-1.5 rounded bg-stone-950 border border-stone-700 text-stone-100 text-xs"
                    >
                      {['Monarch', 'Vassal Duke', 'Vassal Count', 'Vassal Baron', 'Lord Mayor', 'Chancellor', 'Marshal', 'Steward', 'Spymaster', 'Court Chaplain', 'Heir', 'Vassal Heir', 'Child', 'Court Noble'].map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <label className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-stone-950 border border-stone-700 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draftChar.isAlive}
                      onChange={(e) => setDraftChar((d) => ({ ...d, isAlive: e.target.checked }))}
                    />
                    <span>Living</span>
                  </label>
                </div>
                {/* 6 Base Stats */}
                <div className="grid grid-cols-6 gap-1.5">
                  {(
                    [
                      ['DIP', 'baseDiplomacy'],
                      ['MAR', 'baseMartial'],
                      ['STE', 'baseStewardship'],
                      ['INT', 'baseIntrigue'],
                      ['LRN', 'baseLearning'],
                      ['PRW', 'baseProwess'],
                    ] as const
                  ).map(([lbl, key]) => (
                    <div key={key}>
                      <label className="block text-[9px] text-stone-400 uppercase">{lbl}</label>
                      <input
                        type="number"
                        min={0}
                        max={30}
                        value={draftChar[key]}
                        onChange={(e) => setDraftChar((d) => ({ ...d, [key]: Number(e.target.value) }))}
                        className="w-full px-1.5 py-1 rounded bg-stone-950 border border-stone-700 text-stone-100 text-[11px] tabular-nums"
                      />
                    </div>
                  ))}
                </div>
                {/* Lineage & Family Selectors */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-stone-400 mb-1">Father</label>
                    <select
                      value={draftChar.knownFatherId}
                      onChange={(e) => setDraftChar((d) => ({ ...d, knownFatherId: e.target.value }))}
                      className="w-full px-2 py-1 rounded bg-stone-950 border border-stone-700 text-stone-100 text-[11px]"
                    >
                      <option value="">None</option>
                      {world.characters.filter((c) => c.id !== activeChar.id && c.gender === 'male').slice(0, 80).map((c) => (
                        <option key={c.id} value={c.id}>{c.name} ({c.houseName})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-stone-400 mb-1">Mother</label>
                    <select
                      value={draftChar.motherId}
                      onChange={(e) => setDraftChar((d) => ({ ...d, motherId: e.target.value }))}
                      className="w-full px-2 py-1 rounded bg-stone-950 border border-stone-700 text-stone-100 text-[11px]"
                    >
                      <option value="">None</option>
                      {world.characters.filter((c) => c.id !== activeChar.id && c.gender === 'female').slice(0, 80).map((c) => (
                        <option key={c.id} value={c.id}>{c.name} ({c.houseName})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-stone-400 mb-1">Spouse</label>
                    <select
                      value={draftChar.spouseId}
                      onChange={(e) => setDraftChar((d) => ({ ...d, spouseId: e.target.value }))}
                      className="w-full px-2 py-1 rounded bg-stone-950 border border-stone-700 text-stone-100 text-[11px]"
                    >
                      <option value="">Unmarried</option>
                      {world.characters.filter((c) => c.id !== activeChar.id).slice(0, 80).map((c) => (
                        <option key={c.id} value={c.id}>{c.name} ({c.houseName})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-stone-400 mb-1">Liege</label>
                    <select
                      value={draftChar.liegeId}
                      onChange={(e) => setDraftChar((d) => ({ ...d, liegeId: e.target.value }))}
                      className="w-full px-2 py-1 rounded bg-stone-950 border border-stone-700 text-stone-100 text-[11px]"
                    >
                      <option value="">Independent</option>
                      {livingCharacters.filter((c) => c.id !== activeChar.id).slice(0, 60).map((c) => (
                        <option key={c.id} value={c.id}>{c.name} ({c.role})</option>
                      ))}
                    </select>
                  </div>
                </div>
                {/* Trait Editor */}
                <div className="space-y-1.5">
                  <div className="flex flex-wrap gap-1">
                    {Array.from(
                      new Set([
                        ...(activeChar.v17Traits || []),
                        ...(activeChar.personalityTraits || []),
                        ...(activeChar.physicalHealthTraits || []),
                      ])
                    ).map((tr) => (
                      <button
                        key={tr}
                        type="button"
                        onClick={() => {
                          const res = updateCharacter(world, activeChar.id, { removeTrait: tr });
                          onUpdateWorld(res.world);
                        }}
                        className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-red-950/70 border border-stone-700 hover:border-red-500/50 text-[10px] text-stone-200 cursor-pointer"
                        title={`Remove ${tr}`}
                      >
                        {tr} ×
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={traitToAdd}
                      onChange={(e) => setTraitToAdd(e.target.value)}
                      className="flex-1 px-2 py-1 rounded bg-stone-950 border border-stone-700 text-stone-100 text-[11px]"
                    >
                      <option value="">Select trait to add...</option>
                      {allTraitNames.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!traitToAdd}
                      onClick={() => {
                        if (!traitToAdd) return;
                        const res = updateCharacter(world, activeChar.id, { addTrait: traitToAdd });
                        if (res.error) {
                          setEditError(res.error);
                        } else {
                          setEditError(null);
                          setTraitToAdd('');
                          onUpdateWorld(res.world);
                        }
                      }}
                      className="px-2 py-1 rounded bg-stone-800 hover:bg-amber-600/30 border border-stone-700 text-amber-300 text-[11px] font-medium disabled:opacity-40 cursor-pointer flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      Add
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 pt-1">
                  {onOpenHeraldryStudio && (
                    <button
                      type="button"
                      onClick={() => onOpenHeraldryStudio({ kind: 'character', id: activeChar.id, label: activeChar.name })}
                      className="px-2.5 py-1.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-amber-300 text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <Palette className="w-3 h-3" />
                      Edit Personal Arms
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const res = updateCharacter(world, activeChar.id, {
                        name: draftChar.name,
                        age: draftChar.age,
                        gender: draftChar.gender,
                        isAlive: draftChar.isAlive,
                        role: draftChar.role,
                        title: draftChar.title,
                        houseName: draftChar.houseName,
                        baseDiplomacy: draftChar.baseDiplomacy,
                        baseMartial: draftChar.baseMartial,
                        baseStewardship: draftChar.baseStewardship,
                        baseIntrigue: draftChar.baseIntrigue,
                        baseLearning: draftChar.baseLearning,
                        baseProwess: draftChar.baseProwess,
                        knownFatherId: draftChar.knownFatherId || null,
                        motherId: draftChar.motherId || null,
                        spouseId: draftChar.spouseId || null,
                        liegeId: draftChar.liegeId || null,
                      });
                      if (res.error) {
                        setEditError(res.error);
                      } else {
                        setEditError(null);
                        onUpdateWorld(res.world);
                        setNotificationMsg(`Updated noble ${draftChar.name}.`);
                      }
                    }}
                    className="ml-auto px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Apply Noble
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Notification Toast */}
        {notificationMsg && (
          <div className="px-5 py-2.5 bg-amber-950/80 border-b border-amber-600/40 text-amber-200 text-xs font-serif italic flex items-center justify-between">
            <span>{notificationMsg}</span>
            <button
              onClick={() => setNotificationMsg(null)}
              className="text-amber-400 hover:text-white cursor-pointer ml-2"
            >
              ✕
            </button>
          </div>
        )}

        {/* Scrollable Body Content */}
        <div className="relative z-10 flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {/* ==================================================== */}
          {/* 1. REALM MODE                                        */}
          {/* ==================================================== */}
          {panelMode === 'realm' && (
            <div className="space-y-4">
              {/* Realm Subtab Selector */}
              <div className="flex items-center gap-4 border-b border-white/[0.08] overflow-x-auto no-scrollbar text-xs">
                <button
                  onClick={() => setRealmSubtab('governance')}
                  className={`pb-2 border-b-2 font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    realmSubtab === 'governance' ? 'border-amber-400 text-amber-200 font-semibold' : 'border-transparent text-stone-400 hover:text-white'
                  }`}
                >
                  Governance
                </button>
                <button
                  onClick={() => setRealmSubtab('vassals')}
                  className={`pb-2 border-b-2 font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    realmSubtab === 'vassals' ? 'border-amber-400 text-amber-200 font-semibold' : 'border-transparent text-stone-400 hover:text-white'
                  }`}
                >
                  Vassals ({vassalLords.length})
                </button>
                <button
                  onClick={() => setRealmSubtab('diplomacy')}
                  className={`pb-2 border-b-2 font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    realmSubtab === 'diplomacy' ? 'border-sky-400 text-sky-200 font-semibold' : 'border-transparent text-stone-400 hover:text-white'
                  }`}
                >
                  Diplomacy
                </button>
                <button
                  onClick={() => setRealmSubtab('wars')}
                  className={`pb-2 border-b-2 font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer flex items-center gap-1.5 ${
                    realmSubtab === 'wars'
                      ? 'border-rose-400 text-rose-200 font-semibold'
                      : realmActiveWars.length > 0
                      ? 'border-transparent text-rose-300 hover:text-rose-200'
                      : 'border-transparent text-stone-400 hover:text-white'
                  }`}
                >
                  <span>Active Wars</span>
                  <span className={`font-mono tabular-nums text-[11px] ${realmActiveWars.length > 0 ? 'text-rose-400 font-semibold' : 'text-stone-500'}`}>
                    {realmActiveWars.length}
                  </span>
                </button>
                <button
                  onClick={() => setRealmSubtab('story')}
                  className={`pb-2 border-b-2 font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    realmSubtab === 'story' ? 'border-amber-400 text-amber-200 font-semibold' : 'border-transparent text-stone-400 hover:text-white'
                  }`}
                >
                  Story & Feuds
                </button>
                <button
                  onClick={() => setRealmSubtab('military')}
                  className={`pb-2 border-b-2 font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    realmSubtab === 'military' ? 'border-amber-400 text-amber-200 font-semibold' : 'border-transparent text-stone-400 hover:text-white'
                  }`}
                >
                  Men-at-Arms
                </button>
                <button
                  onClick={() => setRealmSubtab('economy')}
                  className={`pb-2 border-b-2 font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    realmSubtab === 'economy' ? 'border-amber-400 text-amber-200 font-semibold' : 'border-transparent text-stone-400 hover:text-white'
                  }`}
                >
                  Treasury
                </button>
                <button
                  onClick={() => setRealmSubtab('laws')}
                  className={`pb-2 border-b-2 font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    realmSubtab === 'laws' ? 'border-amber-400 text-amber-200 font-semibold' : 'border-transparent text-stone-400 hover:text-white'
                  }`}
                >
                  Crown Laws
                </button>
              </div>

              {/* Subtab 1: Governance & High Privy Council */}
              {realmSubtab === 'governance' && (
                <div className="space-y-4">
                  {/* Sovereign Monarch Overview Card */}
                  <div className="p-3.5 rounded-lg bg-stone-900/50 border border-white/[0.08] space-y-3">
                    <span className="text-[11px] uppercase font-semibold tracking-wider text-amber-400/90 block">
                      Sovereign Monarch & House
                    </span>
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <span className="w-10 h-10 shrink-0 rounded-lg bg-amber-950/60 border border-amber-700/40 flex items-center justify-center text-amber-300">
                          <Crown className="w-5 h-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-stone-100 text-sm truncate">{ruler.name}</div>
                          <div className="text-[11px] text-stone-400 flex items-center gap-1.5 flex-wrap">
                            <span className="tabular-nums">Age {ruler.age} ·</span>
                            <button
                              type="button"
                              onClick={() => onOpenHouse?.(ruler.houseName || 'Royal')}
                              className="text-amber-300 hover:text-amber-200 underline decoration-amber-500/40 underline-offset-2 cursor-pointer"
                              title="Inspect House Dynasty Tree & Ancestors"
                            >
                              House {ruler.houseName || 'Royal'}
                            </button>
                          </div>
                          {ruler.houseMotto && (
                            <div className="text-[11px] text-amber-300/80 italic mt-0.5">
                              "{ruler.houseMotto}"
                            </div>
                          )}
                          {ruler.houseName && (() => {
                            const rhp = computeHouseProfile(ruler.houseName, world);
                            return (
                              <div className="text-[11px] text-stone-400 mt-1 tabular-nums">
                                <span className="text-amber-300 font-semibold">{rhp.powerTier}</span> · Prestige{' '}
                                {rhp.totalPrestige.toLocaleString()} · Negotiation{' '}
                                {rhp.negotiatingPower >= 0 ? '+' : ''}
                                {rhp.negotiatingPower}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {ruler.houseName && (
                          <button
                            type="button"
                            onClick={() => onOpenHouse?.(ruler.houseName)}
                            className="px-2.5 py-1.5 rounded-md bg-stone-800 hover:bg-stone-700 text-amber-200 font-medium text-xs cursor-pointer whitespace-nowrap shrink-0"
                          >
                            Dynasty Tree
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setIsLifestyleModalOpen(true)}
                          className="px-2.5 py-1.5 rounded-md bg-stone-800 hover:bg-stone-700 text-amber-200 font-medium text-xs cursor-pointer whitespace-nowrap shrink-0"
                        >
                          Sovereign Perks
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsEstatesModalOpen(true)}
                          className="px-2.5 py-1.5 rounded-md bg-stone-800 hover:bg-stone-700 text-amber-200 font-medium text-xs cursor-pointer whitespace-nowrap shrink-0"
                        >
                          Estates & Trade
                        </button>
                        <button
                          onClick={() => {
                            onSelectCharacter(ruler);
                            setPanelMode('character');
                          }}
                          className="px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs cursor-pointer whitespace-nowrap shrink-0"
                        >
                          Noble Profile
                        </button>
                      </div>
                    </div>

                    {/* Monarch Grand Strategy Indicators */}
                    <div className="grid grid-cols-4 divide-x divide-white/[0.07] border border-white/[0.07] rounded-md bg-stone-950/50 text-center font-mono tabular-nums">
                      <div className="py-2 px-1">
                        <div className="text-[10px] text-stone-400">GRAVITAS</div>
                        <div className="font-bold text-amber-300 text-xs mt-0.5">{gravitas}</div>
                      </div>
                      <div className="py-2 px-1">
                        <div className="text-[10px] text-stone-400">PRESTIGE</div>
                        <div className="font-bold text-sky-400 text-xs mt-0.5">{ruler.prestige || 450}</div>
                      </div>
                      <div className="py-2 px-1">
                        <div className="text-[10px] text-stone-400">PIETY</div>
                        <div className="font-bold text-emerald-400 text-xs mt-0.5">{ruler.piety || 280}</div>
                      </div>
                      <div className="py-2 px-1">
                        <div className="text-[10px] text-stone-400">DREAD</div>
                        <div className="font-bold text-red-400 text-xs mt-0.5">{ruler.dread || 15}</div>
                      </div>
                    </div>
                  </div>

                  {/* Polity, Society, Culture & Faith Charter */}
                  {(() => {
                    const govProf = getGovernmentProfile(realm.government);
                    const socProf = getSocietyProfile(realm.societyType);
                    const cultObj = (world.cultures || []).find((c) => c.name === realm.culture);
                    const relObj = (world.religions || []).find((r) => r.name === realm.religion);
                    return (
                      <div className="p-3.5 rounded-lg bg-stone-900/50 border border-white/[0.08] space-y-2.5">
                        <span className="text-[11px] uppercase font-semibold tracking-wider text-amber-400/90 block">
                          Polity, Society, Culture &amp; Faith
                        </span>
                        <div className="grid grid-cols-2 border border-white/[0.07] rounded-md bg-stone-950/45 divide-x divide-y divide-white/[0.07] text-[11px]">
                          <div className="p-2.5 space-y-0.5">
                            <div className="text-[10px] uppercase text-stone-400">Government · {govProf.category}</div>
                            <div className="font-semibold text-amber-200">{realm.government}</div>
                            <div className="text-[11px] text-stone-400 leading-snug">{govProf.shortDesc}</div>
                          </div>
                          <div className="p-2.5 space-y-0.5">
                            <div className="text-[10px] uppercase text-stone-400">Society · {socProf.dominantEstate}</div>
                            <div className="font-semibold text-sky-200">{realm.societyType || socProf.name}</div>
                            <div className="text-[11px] text-stone-400 leading-snug">{socProf.shortDesc}</div>
                          </div>
                          <div className="p-2.5 space-y-1">
                            <div className="flex items-center justify-between gap-1">
                              <div className="text-[10px] uppercase text-stone-400">Culture · {cultObj?.languageGroup || 'Vernacular'}</div>
                              <button
                                type="button"
                                onClick={() => {
                                  if (editingPolityCard === 'culture') {
                                    setEditingPolityCard(null);
                                  } else {
                                    setDraftCulture({
                                      name: cultObj?.name || realm.culture,
                                      ethos: cultObj?.ethos || '',
                                      heritage: cultObj?.heritage || '',
                                      languageGroup: cultObj?.languageGroup || '',
                                      color: cultObj?.color || '#10b981',
                                    });
                                    setEditingPolityCard('culture');
                                  }
                                }}
                                title="Edit Culture Name & Traits"
                                className="p-0.5 text-stone-400 hover:text-amber-300 cursor-pointer"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            </div>
                            {editingPolityCard === 'culture' ? (
                              <div className="space-y-1.5 pt-0.5">
                                <input
                                  type="text"
                                  value={draftCulture.name}
                                  onChange={(e) => setDraftCulture((d) => ({ ...d, name: e.target.value }))}
                                  placeholder="Culture name"
                                  className="w-full px-1.5 py-1 rounded bg-stone-900 border border-stone-700 text-[11px] text-emerald-200"
                                />
                                <input
                                  type="text"
                                  value={draftCulture.languageGroup}
                                  onChange={(e) => setDraftCulture((d) => ({ ...d, languageGroup: e.target.value }))}
                                  placeholder="Language group"
                                  className="w-full px-1.5 py-1 rounded bg-stone-900 border border-stone-700 text-[10px] text-stone-200"
                                />
                                <div className="flex items-center gap-1">
                                  <input
                                    type="color"
                                    value={draftCulture.color}
                                    onChange={(e) => setDraftCulture((d) => ({ ...d, color: e.target.value }))}
                                    className="w-7 h-6 rounded bg-stone-900 border border-stone-700 cursor-pointer"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = updateCulture(world, realm.culture, draftCulture);
                                      onUpdateWorld(next);
                                      setEditingPolityCard(null);
                                      setNotificationMsg(`Updated culture ${draftCulture.name}.`);
                                    }}
                                    className="ml-auto px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-semibold cursor-pointer"
                                  >
                                    Save
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="font-semibold text-emerald-300">{realm.culture}</div>
                                <div className="text-[11px] text-stone-400 leading-snug">
                                  {cultObj ? `${cultObj.ethos} · ${cultObj.heritage}` : 'Medieval realm heritage'}
                                </div>
                              </>
                            )}
                          </div>
                          <div className="p-2.5 space-y-1">
                            <div className="flex items-center justify-between gap-1">
                              <div className="text-[10px] uppercase text-stone-400">
                                Faith · {relObj?.clergyTitle || 'High Clergy'} {relObj?.symbol || ''}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  if (editingPolityCard === 'religion') {
                                    setEditingPolityCard(null);
                                  } else {
                                    setDraftReligion({
                                      name: relObj?.name || realm.religion,
                                      deity: relObj?.deity || '',
                                      clergyTitle: relObj?.clergyTitle || '',
                                      symbol: relObj?.symbol || '',
                                      color: relObj?.color || '#f59e0b',
                                    });
                                    setEditingPolityCard('religion');
                                  }
                                }}
                                title="Edit Religion Name & Clergy"
                                className="p-0.5 text-stone-400 hover:text-amber-300 cursor-pointer"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            </div>
                            {editingPolityCard === 'religion' ? (
                              <div className="space-y-1.5 pt-0.5">
                                <input
                                  type="text"
                                  value={draftReligion.name}
                                  onChange={(e) => setDraftReligion((d) => ({ ...d, name: e.target.value }))}
                                  placeholder="Faith name"
                                  className="w-full px-1.5 py-1 rounded bg-stone-900 border border-stone-700 text-[11px] text-amber-200"
                                />
                                <input
                                  type="text"
                                  value={draftReligion.deity}
                                  onChange={(e) => setDraftReligion((d) => ({ ...d, deity: e.target.value }))}
                                  placeholder="Deity / Creed"
                                  className="w-full px-1.5 py-1 rounded bg-stone-900 border border-stone-700 text-[10px] text-stone-200"
                                />
                                <div className="flex items-center gap-1">
                                  <input
                                    type="color"
                                    value={draftReligion.color}
                                    onChange={(e) => setDraftReligion((d) => ({ ...d, color: e.target.value }))}
                                    className="w-7 h-6 rounded bg-stone-900 border border-stone-700 cursor-pointer"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = updateReligion(world, realm.religion, draftReligion);
                                      onUpdateWorld(next);
                                      setEditingPolityCard(null);
                                      setNotificationMsg(`Updated faith ${draftReligion.name}.`);
                                    }}
                                    className="ml-auto px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-semibold cursor-pointer"
                                  >
                                    Save
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="font-semibold text-amber-300">{realm.religion}</div>
                                <div className="text-[11px] text-stone-400 leading-snug">
                                  {relObj ? `${relObj.theologyFamily || 'Orthodoxy'} · ${relObj.deity}` : 'Ancestral devotion'}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Realm Demographics Card */}
                  <div className="p-3.5 rounded-lg bg-stone-900/50 border border-white/[0.08] space-y-2.5">
                    <span className="text-[11px] uppercase font-semibold tracking-wider text-amber-400/90 flex items-center justify-between">
                      <span>Demographics & Social Composition</span>
                      <span className="text-[11px] font-mono tabular-nums text-stone-400">
                        Year {world.currentYear} · {realmDemographics.avgAnnualGrowthPct >= 0 ? '+' : ''}{realmDemographics.avgAnnualGrowthPct}%/yr
                      </span>
                    </span>
                    <div className="grid grid-cols-3 divide-x divide-white/[0.07] border border-white/[0.07] rounded-md bg-stone-950/50 text-center font-mono tabular-nums">
                      <div className="p-2">
                        <div className="text-[10px] text-stone-400 uppercase">Total Souls</div>
                        <div className="font-bold text-amber-200 text-xs mt-0.5">
                          {realmDemographics.totalPop.toLocaleString()}
                        </div>
                      </div>
                      <div className="p-2">
                        <div className="text-[10px] text-stone-400 uppercase">Urban / Rural</div>
                        <div className="font-bold text-emerald-300 text-xs mt-0.5">
                          {realmDemographics.urbanSharePct}% / {realmDemographics.ruralSharePct}%
                        </div>
                      </div>
                      <div className="p-2">
                        <div className="text-[10px] text-stone-400 uppercase">Mobilized Force</div>
                        <div className="font-bold text-rose-300 text-xs mt-0.5">
                          {realmDemographics.totalMobilizedForce.toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 divide-x divide-white/[0.07] border border-white/[0.07] rounded-md bg-stone-950/40 text-center font-mono tabular-nums text-[11px]">
                      <div className="py-1.5 px-1">
                        <div className="text-[10px] text-stone-400 uppercase">Peasantry</div>
                        <div className="text-stone-200 font-semibold">{realmDemographics.peasantry.toLocaleString()}</div>
                      </div>
                      <div className="py-1.5 px-1">
                        <div className="text-[10px] text-stone-400 uppercase">Artisans</div>
                        <div className="text-amber-300 font-semibold">{realmDemographics.artisans.toLocaleString()}</div>
                      </div>
                      <div className="py-1.5 px-1">
                        <div className="text-[10px] text-stone-400 uppercase">Clergy</div>
                        <div className="text-sky-300 font-semibold">{realmDemographics.clergy.toLocaleString()}</div>
                      </div>
                      <div className="py-1.5 px-1">
                        <div className="text-[10px] text-stone-400 uppercase">Soldiery</div>
                        <div className="text-rose-300 font-semibold">{realmDemographics.soldiery.toLocaleString()}</div>
                      </div>
                    </div>
                  </div>

                  {/* High Privy Council Seats — Defined Offices, Attribute Effectiveness & Active Tasks */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] uppercase font-semibold tracking-wider text-amber-400/90">
                        Royal Council (5 Defined Offices)
                      </span>
                      <span className="text-[10px] font-mono text-stone-400">
                        Scaled by 6 Attributes
                      </span>
                    </div>
                    <div className="divide-y divide-white/[0.07] border border-white/[0.08] rounded-lg bg-stone-900/45">
                      {(['Chancellor', 'Marshal', 'Steward', 'Spymaster', 'Court Chaplain'] as CouncilOffice[]).map((office) => {
                        const def = COUNCIL_OFFICE_DEFS[office];
                        const seat = councilMembers.find((c) => c.role === office);
                        const eff = evaluateCouncillorEffectiveness(seat, office);
                        const currentTaskId = realm.councilTasks?.[office] || def.defaultTask;
                        const currentTask = def.tasks.find((t) => t.id === currentTaskId) || def.tasks[0];

                        return (
                          <div
                            key={office}
                            className="p-3 space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div
                                onClick={() => {
                                  if (seat) {
                                    onSelectCharacter(seat);
                                    setPanelMode('character');
                                  }
                                }}
                                className={`flex items-center gap-2 min-w-0 ${seat ? 'cursor-pointer hover:opacity-90' : ''}`}
                              >
                                <span className="font-mono text-[10px] text-amber-300 font-semibold shrink-0">
                                  {office}
                                </span>
                                <div className="min-w-0">
                                  <div className="font-medium text-stone-100 text-xs truncate">
                                    {seat ? seat.name : 'Office Vacant'}
                                  </div>
                                  {seat && (
                                    <div className="text-[10px] text-stone-400 font-mono tabular-nums">
                                      DIP {seat.baseDiplomacy} · MAR {seat.baseMartial} · STE {seat.baseStewardship} · INT {seat.baseIntrigue} · LRN {seat.baseLearning} · PRW {seat.baseProwess}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="text-right shrink-0 font-mono tabular-nums">
                                <div
                                  className={`text-[11px] font-semibold ${
                                    eff.tier === 'Masterful'
                                      ? 'text-emerald-400'
                                      : eff.tier === 'Competent'
                                      ? 'text-amber-300'
                                      : eff.tier === 'Vacant'
                                      ? 'text-rose-400'
                                      : 'text-stone-300'
                                  }`}
                                >
                                  {eff.tier} ({eff.primaryLabel} {eff.score})
                                </div>
                                {seat && (
                                  <div className="text-[10px] text-stone-400">+{eff.bonusPct}% yield</div>
                                )}
                              </div>
                            </div>

                            {seat && (
                              <div className="space-y-1 pt-1 border-t border-white/[0.06]">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] uppercase font-semibold text-stone-400 shrink-0">Task:</span>
                                  <select
                                    value={currentTaskId}
                                    onChange={(e) => {
                                      const updated = cloneWorldState(world);
                                      const targetRealm = updated.realms.find((r) => r.id === realm.id);
                                      if (targetRealm) {
                                        if (!targetRealm.councilTasks) targetRealm.councilTasks = {};
                                        targetRealm.councilTasks[office] = e.target.value;
                                      }
                                      onUpdateWorld(updated);
                                      const chosen = def.tasks.find((t) => t.id === e.target.value);
                                      setNotificationMsg(`${office} ${seat.name} assigned to: ${chosen?.label || e.target.value}.`);
                                      setTimeout(() => setNotificationMsg(null), 3000);
                                    }}
                                    className="flex-1 px-2 py-1 rounded bg-stone-950 border border-white/[0.08] text-[11px] text-stone-100"
                                  >
                                    {def.tasks.map((t) => (
                                      <option key={t.id} value={t.id}>
                                        {t.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="text-[11px] text-stone-400 leading-snug">
                                  {currentTask.shortDesc}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Interactive Royal Council / AI Envoy Q&A */}
                  <RoyalCouncilAdvisor world={world} realm={realm} />

                  {/* Incoming Bilateral Diplomatic Proposals */}
                  {((world.pendingDiplomaticProposals || []).filter((p) => p.toRealmId === realm.id).length > 0) && (
                    <div className="space-y-2 pt-2 border-t border-white/10">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-sky-400">
                          Incoming Envoys &amp; Treaty Proposals
                        </span>
                        <span className="text-[9px] font-mono text-stone-400">
                          Requires Mutual Consent
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {(world.pendingDiplomaticProposals || [])
                          .filter((p) => p.toRealmId === realm.id)
                          .map((prop) => {
                            const sender = world.realms.find((r) => r.id === prop.fromRealmId);
                            return (
                              <div
                                key={prop.id}
                                className="p-2.5 rounded-xl bg-sky-950/35 border border-sky-700/50 space-y-2"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="text-xs font-semibold text-sky-100">
                                      {prop.summary}
                                    </div>
                                    <div className="text-[10px] text-stone-400 mt-0.5">
                                      From {sender?.name || 'Foreign Court'} · Year {prop.year} ·{' '}
                                      <span className="font-mono text-sky-300">
                                        Affinity {prop.consentScore >= 0 ? `+${prop.consentScore}` : prop.consentScore}
                                      </span>
                                    </div>
                                    {prop.reasons?.length > 0 && (
                                      <div className="text-[10px] text-stone-400 mt-0.5">
                                        {prop.reasons.slice(0, 2).join(' · ')}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = cloneWorldState(world);
                                      const res = RealmDiplomacyEngine.respondToProposal(prop.id, true, updated);
                                      onUpdateWorld(updated);
                                      setNotificationMsg(res.summary);
                                      setTimeout(() => setNotificationMsg(null), 4000);
                                    }}
                                    className="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-semibold cursor-pointer"
                                  >
                                    Ratify Treaty
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = cloneWorldState(world);
                                      const res = RealmDiplomacyEngine.respondToProposal(prop.id, false, updated);
                                      onUpdateWorld(updated);
                                      setNotificationMsg(res.summary);
                                      setTimeout(() => setNotificationMsg(null), 3500);
                                    }}
                                    className="px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 text-[10px] font-medium border border-stone-700 cursor-pointer"
                                  >
                                    Decline Envoy
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* State Diplomacy: Inter-Realm Alliances & Enmities */}
                  {world.realms.filter((r) => r.id !== realm.id).length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-white/10">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400/90">
                          Foreign Diplomacy (Allies &amp; Enemies)
                        </span>
                        <span className="text-[9px] font-mono text-stone-400">
                          Bilateral Consent Required
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {world.realms
                          .filter((r) => r.id !== realm.id)
                          .map((other) => {
                            const isAllied = RealmDiplomacyEngine.areRealmsAllied(realm.id, other.id, world);
                            const isEnemy = RealmDiplomacyEngine.areRealmsEnemies(realm.id, other.id, world);
                            const atWar = (world.activeWars || []).some(
                              (w) =>
                                (w.attackerRealmId === realm.id && w.defenderRealmId === other.id) ||
                                (w.attackerRealmId === other.id && w.defenderRealmId === realm.id)
                            );
                            const rel = RealmDiplomacyEngine.getRealmRelation(realm.id, other.id, world);
                            const otherMonarch = world.characters.find((c) => c.id === other.rulerId);
                            const tradeConsent = evaluateBilateralConsent(realm.id, other.id, 'trade_pact', world);
                            const napConsent = evaluateBilateralConsent(realm.id, other.id, 'non_aggression', world);
                            const detenteConsent = evaluateBilateralConsent(realm.id, other.id, 'end_rivalry', world);

                            return (
                              <div
                                key={other.id}
                                className={`p-2.5 rounded-xl border space-y-2 ${
                                  atWar
                                    ? 'bg-rose-950/35 border-rose-700/50'
                                    : isAllied
                                    ? 'bg-emerald-950/25 border-emerald-700/40'
                                    : isEnemy
                                    ? 'bg-amber-950/30 border-rose-800/40'
                                    : 'bg-stone-900/45 border-white/5'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div
                                    onClick={() => onSelectRealm(other)}
                                    className="flex items-center gap-2 min-w-0 cursor-pointer"
                                  >
                                    <span
                                      className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/25"
                                      style={{ backgroundColor: other.color }}
                                    />
                                    <div className="min-w-0">
                                      <div className="font-semibold text-stone-100 hover:text-amber-300 truncate">
                                        {other.name}
                                      </div>
                                      <div className="text-[10px] text-stone-400 truncate">
                                        {otherMonarch ? otherMonarch.name : 'Crown Council'} ·{' '}
                                        <span
                                          className={`font-mono font-semibold ${
                                            rel >= 20 ? 'text-emerald-300' : rel <= -20 ? 'text-rose-300' : 'text-stone-300'
                                          }`}
                                        >
                                          Relation {rel >= 0 ? `+${rel}` : rel}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-mono shrink-0 border ${
                                      atWar
                                        ? 'bg-rose-900/80 border-rose-500/60 text-rose-100'
                                        : isAllied
                                        ? 'bg-emerald-900/70 border-emerald-600/60 text-emerald-200'
                                        : isEnemy
                                        ? 'bg-red-950/80 border-red-700/60 text-red-200'
                                        : 'bg-stone-800 border-stone-700 text-stone-300'
                                    }`}
                                  >
                                    {atWar ? 'At War' : isAllied ? 'Allied' : isEnemy ? 'Enemy' : 'Neutral'}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between gap-2 text-[10px] pt-1 border-t border-white/5">
                                  <span className="text-stone-400 truncate">
                                    {isAllied
                                      ? 'Free Trade (+25% cargo) · Mutual Defense · Royal Marriage Pact'
                                      : isEnemy || atWar
                                      ? 'Trade Embargo (-45% trade) · Marriages Blocked · Rival Claims'
                                      : 'Standard Tariffs · Open Diplomacy'}
                                  </span>
                                  {!atWar && (
                                    <div className="flex items-center gap-1 shrink-0">
                                      {isAllied ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const updated = cloneWorldState(world);
                                            const res = RealmDiplomacyEngine.breakAlliance(realm.id, other.id, updated);
                                            onUpdateWorld(updated);
                                            setNotificationMsg(res.summary);
                                            setTimeout(() => setNotificationMsg(null), 3500);
                                          }}
                                          className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 font-medium cursor-pointer border border-stone-600"
                                        >
                                          Break Pact
                                        </button>
                                      ) : isEnemy ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const updated = cloneWorldState(world);
                                            const res = RealmDiplomacyEngine.endRivalry(realm.id, other.id, updated);
                                            onUpdateWorld(updated);
                                            setNotificationMsg(res.summary);
                                            setTimeout(() => setNotificationMsg(null), 3500);
                                          }}
                                          title={detenteConsent.reasons.join(' · ')}
                                          className={`px-2 py-0.5 rounded font-medium cursor-pointer border tabular-nums ${
                                            detenteConsent.accepted
                                              ? 'bg-amber-900/70 hover:bg-amber-800 text-amber-100 border-amber-600/60'
                                              : 'bg-stone-800 hover:bg-stone-700 text-stone-300 border-stone-700'
                                          }`}
                                        >
                                          Propose Détente ({detenteConsent.score >= 0 ? '+' : ''}
                                          {detenteConsent.score})
                                        </button>
                                      ) : (
                                        <>
                                          {(() => {
                                            const allyEval = evaluateAllianceNegotiation(realm.id, other.id, world);
                                            return (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const updated = cloneWorldState(world);
                                                  const res = RealmDiplomacyEngine.forgeAlliance(realm.id, other.id, updated);
                                                  onUpdateWorld(updated);
                                                  setNotificationMsg(res.summary);
                                                  setTimeout(() => setNotificationMsg(null), 3500);
                                                }}
                                                title={allyEval.reasons.join(' · ')}
                                                className={`px-2 py-0.5 rounded font-medium cursor-pointer tabular-nums ${
                                                  allyEval.accepted
                                                    ? 'bg-emerald-800/80 hover:bg-emerald-700 text-emerald-100'
                                                    : 'bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700'
                                                }`}
                                              >
                                                Forge Ally ({allyEval.score >= 0 ? '+' : ''}
                                                {allyEval.score})
                                              </button>
                                            );
                                          })()}
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const updated = cloneWorldState(world);
                                              const res = RealmDiplomacyEngine.declareRivalry(realm.id, other.id, updated);
                                              onUpdateWorld(updated);
                                              setNotificationMsg(res.summary);
                                              setTimeout(() => setNotificationMsg(null), 3500);
                                            }}
                                            className="px-2 py-0.5 rounded bg-rose-900/80 hover:bg-rose-800 text-rose-100 font-medium cursor-pointer"
                                          >
                                            Declare Enemy
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* Expanded Interstate Diplomacy Actions */}
                                {!atWar && (
                                  <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-white/5 text-[10px]">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = cloneWorldState(world);
                                        const res = RealmDiplomacyEngine.sendDiplomaticEnvoy(realm.id, other.id, updated);
                                        onUpdateWorld(updated);
                                        setNotificationMsg(res.summary);
                                        setTimeout(() => setNotificationMsg(null), 3500);
                                      }}
                                      className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-amber-200 border border-stone-700 font-medium cursor-pointer"
                                      title="Dispatch Royal Embassy (-40g) to improve bilateral relations"
                                    >
                                      Send Envoy (40g)
                                    </button>
                                    {!isEnemy && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updated = cloneWorldState(world);
                                          const res = RealmDiplomacyEngine.sendForeignSubsidy(realm.id, other.id, 75, updated);
                                          onUpdateWorld(updated);
                                          setNotificationMsg(res.summary);
                                          setTimeout(() => setNotificationMsg(null), 3500);
                                        }}
                                        className="px-2 py-0.5 rounded bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-200 border border-emerald-700/50 font-medium cursor-pointer"
                                        title="Dispatch 75g foreign subsidy from Crown Fisc to bolster ally/partner treasury"
                                      >
                                        Subsidy (75g)
                                      </button>
                                    )}
                                    {!(realm.tradePactRealmIds || []).includes(other.id) ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updated = cloneWorldState(world);
                                          const res = RealmDiplomacyEngine.signTradePact(realm.id, other.id, updated);
                                          onUpdateWorld(updated);
                                          setNotificationMsg(res.summary);
                                          setTimeout(() => setNotificationMsg(null), 3500);
                                        }}
                                        title={tradeConsent.reasons.join(' · ')}
                                        className={`px-2 py-0.5 rounded font-medium cursor-pointer border tabular-nums ${
                                          tradeConsent.accepted
                                            ? 'bg-sky-950/70 hover:bg-sky-900/80 text-sky-200 border-sky-700/50'
                                            : 'bg-stone-800 hover:bg-stone-700 text-stone-300 border-stone-700'
                                        }`}
                                      >
                                        Trade Pact ({tradeConsent.score >= 0 ? '+' : ''}
                                        {tradeConsent.score})
                                      </button>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded bg-sky-950/50 border border-sky-700/40 text-sky-300 font-mono">
                                        Trade Pact Active
                                      </span>
                                    )}
                                    {!RealmDiplomacyEngine.isUnderTruce(realm.id, other.id, world) ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updated = cloneWorldState(world);
                                          const res = RealmDiplomacyEngine.signNonAggressionPact(realm.id, other.id, updated);
                                          onUpdateWorld(updated);
                                          setNotificationMsg(res.summary);
                                          setTimeout(() => setNotificationMsg(null), 3500);
                                        }}
                                        title={napConsent.reasons.join(' · ')}
                                        className={`px-2 py-0.5 rounded font-medium cursor-pointer border tabular-nums ${
                                          napConsent.accepted
                                            ? 'bg-stone-800 hover:bg-stone-700 text-emerald-200 border-emerald-700/50'
                                            : 'bg-stone-800 hover:bg-stone-700 text-stone-300 border-stone-700'
                                        }`}
                                      >
                                        Non-Aggression ({napConsent.score >= 0 ? '+' : ''}
                                        {napConsent.score})
                                      </button>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded bg-emerald-950/50 border border-emerald-700/40 text-emerald-300 font-mono">
                                        Truce Active
                                      </span>
                                    )}
                                    {!isAllied && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updated = cloneWorldState(world);
                                          const res = RealmDiplomacyEngine.demandTribute(realm.id, other.id, updated);
                                          onUpdateWorld(updated);
                                          setNotificationMsg(res.summary);
                                          setTimeout(() => setNotificationMsg(null), 3500);
                                        }}
                                        className="px-2 py-0.5 rounded bg-amber-950/60 hover:bg-amber-900/70 text-amber-300 border border-amber-700/50 font-medium cursor-pointer"
                                        title="Leverage House Prestige & realm size to demand border tribute"
                                      >
                                        Demand Tribute
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Subtab 2: Vassal Hierarchy Tree & Crown Fief Distribution */}
              {realmSubtab === 'vassals' && (
                <div className="space-y-3">
                  {/* Direct Crown Counties (including Escheated Fiefs) — Keep, Grant to Lord, or Ennoble New House */}
                  {(() => {
                    const directCrownCounties = (world.counties || []).filter(
                      (c) => c.rulerId === ruler.id && c.capitalBurgId !== realm.capitalBurgId
                    );
                    if (directCrownCounties.length === 0) return null;
                    const eligibleRecipients = (world.characters || []).filter(
                      (c) => c.isAlive !== false && c.realmId === realm.id && c.id !== ruler.id
                    );
                    return (
                      <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-700/40 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-amber-300">
                            Additional Crown &amp; Escheated Fiefs ({directCrownCounties.length})
                          </span>
                          <span className="text-[10px] text-stone-400">
                            Keep directly or invest a lord
                          </span>
                        </div>
                        <div className="space-y-2">
                          {directCrownCounties.map((cty) => (
                            <div
                              key={cty.id}
                              className="p-2.5 rounded-lg bg-stone-950/70 border border-stone-800 space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-amber-100">{cty.name}</span>
                                <span className="text-[10px] font-mono text-stone-400 tabular-nums">
                                  Dev {cty.development || 30}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = cloneWorldState(world);
                                    const mon = updated.characters.find((c) => c.id === ruler.id);
                                    if (!mon) return;
                                    const res = PlayerActionEngine.ennobleNewLordForCounty(mon, cty.id, updated);
                                    onUpdateWorld(updated);
                                    setNotificationMsg(res.summary);
                                    setTimeout(() => setNotificationMsg(null), 4000);
                                  }}
                                  className="px-2 py-1 rounded bg-amber-700 hover:bg-amber-600 text-white font-semibold cursor-pointer"
                                >
                                  Ennoble New House
                                </button>
                                {eligibleRecipients.length > 0 && (
                                  <select
                                    defaultValue=""
                                    onChange={(e) => {
                                      const targetId = e.target.value;
                                      if (!targetId) return;
                                      const updated = cloneWorldState(world);
                                      const mon = updated.characters.find((c) => c.id === ruler.id);
                                      if (!mon) return;
                                      const res = PlayerActionEngine.grantCountyToLord(mon, cty.id, targetId, updated);
                                      onUpdateWorld(updated);
                                      setNotificationMsg(res.summary);
                                      setTimeout(() => setNotificationMsg(null), 4000);
                                      e.target.value = '';
                                    }}
                                    className="px-2 py-1 rounded bg-stone-900 border border-stone-700 text-stone-200 text-[10px] cursor-pointer"
                                  >
                                    <option value="">Grant to Existing Lord...</option>
                                    {eligibleRecipients.slice(0, 15).map((rec) => (
                                      <option key={rec.id} value={rec.id}>
                                        {rec.name} ({getCharacterRankTitle(rec, world)})
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400/90">
                    Vassal Hierarchy Tree (Liege → Sworn Fiefdom Lords)
                  </span>
                  <div className="space-y-2">
                    {vassalLords.length === 0 ? (
                      <div className="p-4 rounded-xl bg-stone-900/40 text-stone-400 text-center text-xs">
                        Direct crown autocracy; all holdings currently under sovereign demesne.
                      </div>
                    ) : (
                      vassalLords.map(({ character: vassal, county: vCounty }) => {
                        const opinionVal = vassal.opinions[ruler.id] ?? 20;
                        const loyaltyVal = Math.round(vassal.loyalty ?? 60);
                        const isLoyal = loyaltyVal >= 60;
                        const isDiscontent = loyaltyVal < 40;
                        return (
                          <div
                            key={vassal.id}
                            className="p-3 rounded-xl bg-stone-900/50 hover:bg-stone-800/60 border border-white/5 space-y-2 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div
                                onClick={() => {
                                  onSelectCharacter(vassal);
                                  setPanelMode('character');
                                }}
                                className="flex items-center gap-2.5 cursor-pointer min-w-0"
                              >
                                <span className="p-2 rounded-lg bg-black/40 text-stone-300 shrink-0">🛡️</span>
                                <div className="min-w-0">
                                  <div className="font-semibold text-stone-200 truncate">{vassal.name}</div>
                                  <div className="text-[11px] text-stone-400 truncate">
                                    {vassal.title || (vCounty ? vCounty.name : vassal.role)} ·{' '}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (vassal.houseName) onOpenHouse?.(vassal.houseName);
                                      }}
                                      className="text-amber-300 hover:text-amber-200 underline decoration-amber-500/40 cursor-pointer"
                                    >
                                      House {vassal.houseName || 'Noble'}
                                    </button>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0 tabular-nums">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                                    isLoyal
                                      ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                                      : isDiscontent
                                      ? 'bg-red-950/60 border-red-700/60 text-red-300'
                                      : 'bg-amber-950/60 border-amber-700/60 text-amber-300'
                                  }`}
                                >
                                  {loyaltyVal}% Loyal · {opinionVal >= 0 ? `+${opinionVal}` : opinionVal} Op
                                </span>
                              </div>
                            </div>

                            {/* Feudal Obligations & Fief Stats */}
                            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5 text-[10px] font-mono text-stone-400 tabular-nums">
                              <div>
                                <span>Dev: </span>
                                <strong className="text-amber-300">{vCounty?.development || 30}</strong>
                              </div>
                              <div>
                                <span>Tribute: </span>
                                <strong className="text-emerald-400">+{(vCounty ? vCounty.development * 0.12 + 1.2 : 3.5).toFixed(1)}g</strong>
                              </div>
                              <div>
                                <span>Levy: </span>
                                <strong className="text-rose-300">
                                  {calculateCharacterFeudalStanding(vassal, world).totalLevies.toLocaleString()}
                                </strong>
                              </div>
                            </div>

                            {/* Within-Realm Vassal Management Actions */}
                            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-white/5 text-[10px]">
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = cloneWorldState(world);
                                  const mon = updated.characters.find((c) => c.id === ruler.id);
                                  const vas = updated.characters.find((c) => c.id === vassal.id);
                                  if (!mon || !vas) return;
                                  const ok = PlayerActionEngine.sendGift(mon, vas, 50, updated);
                                  onUpdateWorld(updated);
                                  setNotificationMsg(
                                    ok
                                      ? `Bestowed a personal gift of 50g upon ${vas.name}, improving loyalty and opinion.`
                                      : 'Insufficient Privy Purse (50g) to send gift.'
                                  );
                                  setTimeout(() => setNotificationMsg(null), 3500);
                                }}
                                className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-amber-200 border border-stone-700 font-medium cursor-pointer"
                              >
                                Royal Gift (50g)
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = cloneWorldState(world);
                                  const mon = updated.characters.find((c) => c.id === ruler.id);
                                  const vas = updated.characters.find((c) => c.id === vassal.id);
                                  if (!mon || !vas) return;
                                  const res = PlayerActionEngine.confirmVassalCharter(mon, vas, updated);
                                  onUpdateWorld(updated);
                                  setNotificationMsg(res.summary);
                                  setTimeout(() => setNotificationMsg(null), 3500);
                                }}
                                className="px-2 py-0.5 rounded bg-emerald-950/60 hover:bg-emerald-900/70 text-emerald-200 border border-emerald-700/50 font-medium cursor-pointer"
                                title="Confirm feudal charters (-25 prestige, +20 opinion, +16 loyalty, clears grudges)"
                              >
                                Confirm Charters
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = cloneWorldState(world);
                                  const mon = updated.characters.find((c) => c.id === ruler.id);
                                  const vas = updated.characters.find((c) => c.id === vassal.id);
                                  if (!mon || !vas) return;
                                  const res = PlayerActionEngine.demandOathOfFealty(mon, vas, updated);
                                  onUpdateWorld(updated);
                                  setNotificationMsg(res.summary);
                                  setTimeout(() => setNotificationMsg(null), 3500);
                                }}
                                className="px-2 py-0.5 rounded bg-amber-950/60 hover:bg-amber-900/70 text-amber-200 border border-amber-700/50 font-medium cursor-pointer"
                                title="Test royal authority and House leverage to compel a renewed Oath of Fealty"
                              >
                                Demand Fealty
                              </button>
                              {vassal.houseName && (
                                <button
                                  type="button"
                                  onClick={() => onOpenHouse?.(vassal.houseName)}
                                  className="px-2 py-0.5 rounded bg-stone-900 hover:bg-stone-800 text-stone-300 border border-stone-700 font-medium cursor-pointer"
                                >
                                  House Tree
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Subtab 2.2: Dedicated Realm Diplomacy (Action-First -> Choose Target State) */}
              {realmSubtab === 'diplomacy' && (() => {
                const foreignRealms = world.realms.filter((r) => r.id !== realm.id);
                const chancellor = councilMembers.find((c) => c.role === 'Chancellor');
                const chanEff = evaluateCouncillorEffectiveness(chancellor, 'Chancellor');
                const runDipAction = (fn: (w: WorldState) => { summary: string }) => {
                  const updated = cloneWorldState(world);
                  const res = fn(updated);
                  onUpdateWorld(updated);
                  setNotificationMsg(res.summary);
                  setSelectedDipAction(null);
                  setTimeout(() => setNotificationMsg(null), 4000);
                };

                const DIP_ACTIONS: {
                  id: NonNullable<typeof selectedDipAction>;
                  label: string;
                  desc: string;
                  tone: string;
                }[] = [
                  {
                    id: 'alliance',
                    label: 'Form / Break Alliance',
                    desc: 'Bind mutual defense oaths or dissolve an existing alliance.',
                    tone: 'bg-emerald-950/60 hover:bg-emerald-900/75 text-emerald-200 border-emerald-700/50',
                  },
                  {
                    id: 'war',
                    label: 'Declare War',
                    desc: 'Press a border claim and mobilize armies against a foreign state.',
                    tone: 'bg-rose-950/70 hover:bg-rose-900/80 text-rose-100 border-rose-700/60',
                  },
                  {
                    id: 'embargo',
                    label: 'Trade Embargo',
                    desc: 'Ban merchant caravans or lift an active commercial blockade.',
                    tone: 'bg-orange-950/65 hover:bg-orange-900/80 text-orange-200 border-orange-700/50',
                  },
                  {
                    id: 'trade_pact',
                    label: 'Sign Trade Pact',
                    desc: 'Grant reciprocal tariff charters to boost cross-border commerce.',
                    tone: 'bg-amber-950/60 hover:bg-amber-900/75 text-amber-200 border-amber-700/45',
                  },
                  {
                    id: 'envoy',
                    label: 'Send Royal Envoy (-40g)',
                    desc: 'Dispatch gifts and heralds to improve bilateral relations.',
                    tone: 'bg-sky-950/65 hover:bg-sky-900/80 text-sky-200 border-sky-700/50',
                  },
                  {
                    id: 'non_aggression',
                    label: 'Non-Aggression Pact',
                    desc: 'Swear a binding peace truce preventing border hostilities.',
                    tone: 'bg-stone-800/80 hover:bg-stone-700 text-stone-200 border-stone-600/60',
                  },
                  {
                    id: 'insult',
                    label: 'Denounce Rival',
                    desc: 'Proclaim diplomatic enmity and undermine a rival court.',
                    tone: 'bg-stone-900 hover:bg-rose-950/70 text-rose-300 border-rose-800/45',
                  },
                  {
                    id: 'tribute',
                    label: 'Demand Tribute',
                    desc: 'Leverage martial dominance to extract gold from weaker realms.',
                    tone: 'bg-stone-900 hover:bg-amber-950/70 text-amber-300 border-amber-800/45',
                  },
                ];

                const activeActionDef = DIP_ACTIONS.find((a) => a.id === selectedDipAction) || null;

                return (
                  <div className="space-y-3.5">
                    {((world.pendingDiplomaticProposals || []).filter((p) => p.toRealmId === realm.id).length > 0) && (
                      <div className="p-3 rounded-xl bg-sky-950/40 border border-sky-600/50 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-sky-300">
                            Incoming Foreign Proposals
                          </span>
                          <span className="text-[9px] font-mono text-sky-200/80">
                            Mutual Consent
                          </span>
                        </div>
                        <div className="space-y-2">
                          {(world.pendingDiplomaticProposals || [])
                            .filter((p) => p.toRealmId === realm.id)
                            .map((prop) => {
                              const sender = world.realms.find((r) => r.id === prop.fromRealmId);
                              return (
                                <div
                                  key={prop.id}
                                  className="p-2.5 rounded-lg bg-stone-950/80 border border-sky-800/50 space-y-1.5"
                                >
                                  <div className="text-[11px] font-semibold text-amber-100">
                                    {prop.summary}
                                  </div>
                                  <div className="text-[10px] text-stone-400">
                                    {sender?.name || 'Foreign Envoy'} · Affinity{' '}
                                    <span className="font-mono text-sky-300">
                                      {prop.consentScore >= 0 ? `+${prop.consentScore}` : prop.consentScore}
                                    </span>
                                    {prop.reasons?.length ? ` · ${prop.reasons[0]}` : ''}
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = cloneWorldState(world);
                                        const res = RealmDiplomacyEngine.respondToProposal(prop.id, true, updated);
                                        onUpdateWorld(updated);
                                        setNotificationMsg(res.summary);
                                        setTimeout(() => setNotificationMsg(null), 4000);
                                      }}
                                      className="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-semibold cursor-pointer"
                                    >
                                      Accept
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = cloneWorldState(world);
                                        const res = RealmDiplomacyEngine.respondToProposal(prop.id, false, updated);
                                        onUpdateWorld(updated);
                                        setNotificationMsg(res.summary);
                                        setTimeout(() => setNotificationMsg(null), 3500);
                                      }}
                                      className="px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 text-[10px] font-medium border border-stone-700 cursor-pointer"
                                    >
                                      Decline
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}

                    <div className="p-3 rounded-xl bg-stone-900/75 border border-sky-700/35 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-sky-400">
                          Chancery &amp; Diplomatic Actions
                        </span>
                        <span className="text-[10px] font-mono tabular-nums text-amber-300">
                          DIP {ruler?.baseDiplomacy || 10} · Chancellor {chanEff.score}
                        </span>
                      </div>
                      <p className="text-[11px] text-stone-400">
                        Select a diplomatic action below, then choose the target state. Treaties require consent from both courts.
                      </p>
                    </div>

                    {/* Step 1: Diplomatic Action Options */}
                    <div className="grid grid-cols-2 gap-2">
                      {DIP_ACTIONS.map((act) => {
                        const isPicked = selectedDipAction === act.id;
                        return (
                          <button
                            key={act.id}
                            type="button"
                            onClick={() => setSelectedDipAction(isPicked ? null : act.id)}
                            className={`p-2.5 rounded-lg text-left border transition-all cursor-pointer ${
                              isPicked
                                ? 'bg-amber-900/50 border-amber-400 text-amber-100 ring-1 ring-amber-400/50'
                                : act.tone
                            }`}
                          >
                            <div className="text-[11px] font-bold leading-tight">{act.label}</div>
                            <div className="text-[9px] opacity-75 mt-0.5 leading-snug">{act.desc}</div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Step 2: Target State Picker (Shown ONLY when an action is selected) */}
                    {activeActionDef && (
                      <div className="p-3 rounded-xl bg-stone-950/90 border border-amber-500/50 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-[10px] uppercase font-bold tracking-wider text-amber-400">
                              Choose Target State
                            </div>
                            <div className="text-xs font-semibold text-stone-200">
                              {activeActionDef.label}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedDipAction(null)}
                            className="px-2 py-1 rounded text-[10px] bg-stone-800 hover:bg-stone-700 text-stone-300 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>

                        {foreignRealms.length === 0 ? (
                          <div className="text-xs text-stone-400 py-2 text-center">
                            No foreign states exist on this map.
                          </div>
                        ) : (
                          <div className="space-y-1.5 max-h-60 overflow-y-auto pr-0.5">
                            {foreignRealms.map((other) => {
                              const rel = RealmDiplomacyEngine.getRealmRelation(realm.id, other.id, world);
                              const isAllied = RealmDiplomacyEngine.areRealmsAllied(realm.id, other.id, world);
                              const isAtWar = Boolean(ClaimAndWarEngine.findActiveWarBetweenRealms(realm.id, other.id, world));
                              const hasTradePact = (realm.tradePactRealmIds || []).includes(other.id);
                              const isEmbargoed = (realm.embargoedRealmIds || []).includes(other.id);
                              const hasTruce = RealmDiplomacyEngine.isUnderTruce(realm.id, other.id, world);

                              const consentEval =
                                selectedDipAction === 'alliance' && !isAllied
                                  ? evaluateBilateralConsent(realm.id, other.id, 'alliance', world)
                                  : selectedDipAction === 'trade_pact' && !hasTradePact
                                  ? evaluateBilateralConsent(realm.id, other.id, 'trade_pact', world)
                                  : selectedDipAction === 'non_aggression' && !hasTruce
                                  ? evaluateBilateralConsent(realm.id, other.id, 'non_aggression', world)
                                  : selectedDipAction === 'embargo' && isEmbargoed
                                  ? evaluateBilateralConsent(realm.id, other.id, 'lift_embargo', world)
                                  : null;

                              let actionVerb = activeActionDef.label;
                              let disabled = false;
                              if (selectedDipAction === 'alliance') {
                                actionVerb = isAllied
                                  ? 'Break Alliance'
                                  : `Propose (${consentEval && consentEval.score >= 0 ? '+' : ''}${consentEval?.score ?? 0})`;
                              } else if (selectedDipAction === 'war') {
                                actionVerb = isAtWar ? 'Press War Goal' : 'Declare War';
                              } else if (selectedDipAction === 'embargo') {
                                actionVerb = isEmbargoed
                                  ? `Lift (${consentEval && consentEval.score >= 0 ? '+' : ''}${consentEval?.score ?? 0})`
                                  : 'Impose Embargo';
                              } else if (selectedDipAction === 'trade_pact') {
                                disabled = hasTradePact || isEmbargoed;
                                actionVerb = hasTradePact
                                  ? 'Active'
                                  : isEmbargoed
                                  ? 'Embargoed'
                                  : `Sign (${consentEval && consentEval.score >= 0 ? '+' : ''}${consentEval?.score ?? 0})`;
                              } else if (selectedDipAction === 'non_aggression') {
                                disabled = hasTruce || isAtWar;
                                actionVerb = hasTruce
                                  ? 'Truce Active'
                                  : isAtWar
                                  ? 'At War'
                                  : `Truce (${consentEval && consentEval.score >= 0 ? '+' : ''}${consentEval?.score ?? 0})`;
                              }

                              const executeForTarget = () => {
                                if (selectedDipAction === 'alliance') {
                                  runDipAction((w) =>
                                    isAllied
                                      ? RealmDiplomacyEngine.breakAlliance(realm.id, other.id, w)
                                      : RealmDiplomacyEngine.forgeAlliance(realm.id, other.id, w)
                                  );
                                } else if (selectedDipAction === 'war') {
                                  runDipAction((w) => ClaimAndWarEngine.declareBorderWar(realm.id, other.id, w));
                                } else if (selectedDipAction === 'embargo') {
                                  runDipAction((w) =>
                                    isEmbargoed
                                      ? RealmDiplomacyEngine.liftTradeEmbargo(realm.id, other.id, w)
                                      : RealmDiplomacyEngine.imposeTradeEmbargo(realm.id, other.id, w)
                                  );
                                } else if (selectedDipAction === 'trade_pact') {
                                  runDipAction((w) => RealmDiplomacyEngine.signTradePact(realm.id, other.id, w));
                                } else if (selectedDipAction === 'envoy') {
                                  runDipAction((w) => RealmDiplomacyEngine.sendDiplomaticEnvoy(realm.id, other.id, w));
                                } else if (selectedDipAction === 'non_aggression') {
                                  runDipAction((w) => RealmDiplomacyEngine.signNonAggressionPact(realm.id, other.id, w));
                                } else if (selectedDipAction === 'insult') {
                                  runDipAction((w) => RealmDiplomacyEngine.sendDiplomaticInsult(realm.id, other.id, w));
                                } else if (selectedDipAction === 'tribute') {
                                  runDipAction((w) => RealmDiplomacyEngine.demandTribute(realm.id, other.id, w));
                                }
                              };

                              return (
                                <button
                                  key={other.id}
                                  type="button"
                                  disabled={disabled}
                                  onClick={executeForTarget}
                                  title={consentEval ? consentEval.reasons.join(' · ') : undefined}
                                  className="w-full p-2 rounded-lg bg-stone-900/90 hover:bg-stone-800 disabled:opacity-45 disabled:cursor-not-allowed border border-white/10 hover:border-amber-500/50 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span
                                      className="w-2.5 h-2.5 rounded-sm shrink-0 border border-white/20"
                                      style={{ backgroundColor: other.color }}
                                    />
                                    <div className="min-w-0">
                                      <div className="text-xs font-cinzel font-bold text-amber-100 truncate">
                                        {other.name}
                                      </div>
                                      <div className="text-[9px] text-stone-400 font-mono tabular-nums">
                                        Relations {rel > 0 ? `+${rel}` : rel}
                                        {isAllied ? ' · Allied' : ''}
                                        {isAtWar ? ' · At War' : ''}
                                        {isEmbargoed ? ' · Embargoed' : ''}
                                        {consentEval ? ` · ${consentEval.accepted ? 'Willing' : 'Reluctant'}` : ''}
                                      </div>
                                    </div>
                                  </div>
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-semibold shrink-0 border ${
                                      consentEval && !consentEval.accepted
                                        ? 'bg-stone-800 border-stone-700 text-stone-300'
                                        : 'bg-amber-900/50 border-amber-600/40 text-amber-200'
                                    }`}
                                  >
                                    {actionVerb}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Compact Read-Only Foreign Relations Ledger */}
                    {foreignRealms.length > 0 && (
                      <div className="p-2.5 rounded-xl bg-stone-900/55 border border-white/10 space-y-1.5">
                        <div className="text-[10px] uppercase font-bold tracking-wider text-stone-400">
                          Active Treaties &amp; Relations
                        </div>
                        <div className="space-y-1">
                          {foreignRealms.map((other) => {
                            const rel = RealmDiplomacyEngine.getRealmRelation(realm.id, other.id, world);
                            const isAllied = RealmDiplomacyEngine.areRealmsAllied(realm.id, other.id, world);
                            const isAtWar = Boolean(ClaimAndWarEngine.findActiveWarBetweenRealms(realm.id, other.id, world));
                            const hasTradePact = (realm.tradePactRealmIds || []).includes(other.id);
                            const isEmbargoed = (realm.embargoedRealmIds || []).includes(other.id);
                            const hasTruce = RealmDiplomacyEngine.isUnderTruce(realm.id, other.id, world);
                            const isEnemy = RealmDiplomacyEngine.areRealmsEnemies(realm.id, other.id, world);
                            const statuses: string[] = [];
                            if (isAtWar) statuses.push('War');
                            if (isAllied) statuses.push('Allied');
                            if (hasTradePact) statuses.push('Trade');
                            if (isEmbargoed) statuses.push('Embargo');
                            if (hasTruce) statuses.push('Truce');
                            if (isEnemy) statuses.push('Rival');

                            return (
                              <div
                                key={other.id}
                                className="flex items-center justify-between gap-2 py-1 px-1.5 rounded hover:bg-white/5 text-[11px]"
                              >
                                <button
                                  type="button"
                                  onClick={() => onSelectRealm(other)}
                                  className="flex items-center gap-1.5 min-w-0 text-left cursor-pointer"
                                >
                                  <span
                                    className="w-2 h-2 rounded-sm shrink-0"
                                    style={{ backgroundColor: other.color }}
                                  />
                                  <span className="font-cinzel text-stone-200 hover:text-amber-300 truncate">
                                    {other.name}
                                  </span>
                                </button>
                                <div className="flex items-center gap-2 shrink-0 font-mono tabular-nums text-[10px]">
                                  <span className="text-stone-400">
                                    {statuses.length > 0 ? statuses.join(' · ') : 'Neutral'}
                                  </span>
                                  <span
                                    className={`font-bold ${
                                      rel >= 20 ? 'text-emerald-400' : rel <= -20 ? 'text-rose-400' : 'text-stone-300'
                                    }`}
                                  >
                                    {rel > 0 ? `+${rel}` : rel}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Subtab 2.5: Active Wars, Battles, Generals & Strategies */}
              {realmSubtab === 'wars' && (() => {
                const realmBattleLogs = realmActiveWars.flatMap((w) =>
                  (w.battleLog || []).map((b) => ({
                    ...b,
                    warId: w.id,
                    casusBelli: w.casusBelli,
                  }))
                );
                const historicalRealmBattles = (world.history || [])
                  .filter(
                    (h) =>
                      h.category === 'War & Conquest' &&
                      h.title.startsWith('Battle of ') &&
                      (h.realmId === realm.id ||
                        world.characters.find((c) => c.id === h.primaryActorId)?.realmId === realm.id ||
                        world.characters.find((c) => c.id === h.secondaryActorId)?.realmId === realm.id)
                  )
                  .slice(0, 12);
                const activeCmdIds = new Set(
                  (world.armies || [])
                    .filter((a) => {
                      const cmd = world.characters.find((c) => c.id === (a.commanderId || a.attackerId));
                      return cmd?.realmId === realm.id;
                    })
                    .map((a) => a.commanderId || a.attackerId)
                );
                const realmGenerals = livingCharacters
                  .filter(
                    (c) =>
                      c.realmId === realm.id &&
                      (activeCmdIds.has(c.id) ||
                        c.role === 'Marshal' ||
                        c.role === 'Court Champion' ||
                        c.role === 'Captain of the Guard' ||
                        c.role === 'Monarch' ||
                        (c.battlesFought || 0) > 0 ||
                        (c.commanderTraits && c.commanderTraits.length > 0) ||
                        (c.baseMartial || 0) >= 13)
                  )
                  .sort(
                    (a, b) =>
                      (activeCmdIds.has(b.id) ? 1 : 0) - (activeCmdIds.has(a.id) ? 1 : 0) ||
                      (b.battlesFought || 0) - (a.battlesFought || 0) ||
                      (b.baseMartial || 0) - (a.baseMartial || 0)
                  )
                  .slice(0, 14);

                return (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-rose-400 flex items-center gap-1.5">
                      <Swords className="w-3.5 h-3.5 text-rose-400" />
                      <span>War Room · {realm.name}</span>
                    </span>
                    <span className="text-[10px] font-mono tabular-nums text-stone-400">
                      Active: {realmActiveWars.length} · Global: {allActiveWars.length}
                    </span>
                  </div>

                  {/* Dedicated War Sub-Navigation: Campaigns | Battles | Generals | Strategies */}
                  <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-stone-950/80 border border-white/10">
                    {(
                      [
                        { id: 'campaigns', label: `Wars (${realmActiveWars.length})` },
                        { id: 'battles', label: `Battles (${realmBattleLogs.length || historicalRealmBattles.length})` },
                        { id: 'generals', label: `Generals (${realmGenerals.length})` },
                        { id: 'strategies', label: 'Strategies' },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setWarViewTab(tab.id)}
                        className={`px-2 py-1.5 rounded-md text-[10px] font-semibold transition-colors cursor-pointer truncate ${
                          warViewTab === tab.id
                            ? 'bg-rose-700 text-white shadow-sm'
                            : 'text-stone-400 hover:text-stone-100 hover:bg-white/5'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* TAB B: BATTLES LOG */}
                  {warViewTab === 'battles' && (
                    <div className="space-y-2.5">
                      {realmBattleLogs.length === 0 && historicalRealmBattles.length === 0 ? (
                        <div className="p-4 rounded-xl bg-stone-900/50 border border-white/5 text-center space-y-1">
                          <div className="text-stone-200 font-semibold text-xs">No Field Battles Recorded Yet</div>
                          <p className="text-[11px] text-stone-400">
                            When armies clash in the field, tactical matchups, casualties, commander duels, and combat trait shifts appear here.
                          </p>
                        </div>
                      ) : (
                        <>
                          {realmBattleLogs.map((b) => (
                            <div
                              key={b.id}
                              className="p-3 rounded-xl bg-stone-900/75 border border-white/10 space-y-2"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="text-xs font-cinzel font-bold text-amber-100">
                                    Battle of {b.holdingName}
                                  </div>
                                  <div className="text-[10px] text-stone-400">
                                    A.D. {b.year} · {b.terrain}
                                    {b.weatherCondition ? ` · ${b.weatherCondition}` : ''}
                                  </div>
                                </div>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-semibold shrink-0 ${
                                    b.attackerWon
                                      ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/50'
                                      : 'bg-rose-950/80 text-rose-300 border border-rose-700/50'
                                  }`}
                                >
                                  {b.attackerWon ? 'Attacker Victory' : 'Defender Victory'}
                                </span>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-[10px] bg-stone-950/60 p-2 rounded-lg border border-white/5">
                                <div>
                                  <div className="text-stone-500 uppercase text-[9px]">Attacker</div>
                                  <div className="font-semibold text-stone-200 truncate">{b.attackerCommanderName}</div>
                                  <div className="text-amber-300/90">{b.attackerTactic}</div>
                                  <div className="text-rose-400 font-mono tabular-nums">-{b.attackerCasualties} men</div>
                                </div>
                                <div>
                                  <div className="text-stone-500 uppercase text-[9px]">Defender</div>
                                  <div className="font-semibold text-stone-200 truncate">{b.defenderCommanderName}</div>
                                  <div className="text-sky-300/90">{b.defenderTactic}</div>
                                  <div className="text-rose-400 font-mono tabular-nums">-{b.defenderCasualties} men</div>
                                </div>
                              </div>

                              <div className="text-[10px] text-stone-300">{b.tacticalSummary}</div>

                              {b.duelSummary && (
                                <div className="text-[10px] text-amber-300 bg-amber-950/30 border border-amber-700/30 px-2 py-1 rounded">
                                  {b.duelSummary}
                                </div>
                              )}

                              {b.traitNotes && b.traitNotes.length > 0 && (
                                <div className="space-y-1 pt-1 border-t border-white/5">
                                  <div className="text-[9px] uppercase font-bold tracking-wider text-emerald-400">
                                    Battlefield Experience & Trait Shifts
                                  </div>
                                  {b.traitNotes.map((note, idx) => (
                                    <div key={idx} className="text-[10px] text-emerald-200/90">
                                      • {note}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}

                          {realmBattleLogs.length === 0 &&
                            historicalRealmBattles.map((hb) => (
                              <div
                                key={hb.id}
                                className="p-3 rounded-xl bg-stone-900/65 border border-white/10 space-y-1"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold text-amber-100">{hb.title}</span>
                                  <span className="text-[10px] font-mono tabular-nums text-stone-400">
                                    A.D. {hb.year}
                                  </span>
                                </div>
                                <p className="text-[11px] text-stone-300 leading-relaxed">{hb.description}</p>
                              </div>
                            ))}
                        </>
                      )}
                    </div>
                  )}

                  {/* TAB C: GENERALS & BATTLEFIELD EXPERIENCE */}
                  {warViewTab === 'generals' && (
                    <div className="space-y-2.5">
                      <div className="text-[10px] text-stone-400">
                        Commanders who lead armies in battle gain combat experience, improve Martial &amp; Prowess, and forge new commander or personality traits.
                      </div>
                      {realmGenerals.length === 0 ? (
                        <div className="p-4 rounded-xl bg-stone-900/50 border border-white/5 text-center text-stone-400 text-xs">
                          No marshals or commanders currently available in {realm.name}.
                        </div>
                      ) : (
                        realmGenerals.map((gen) => {
                          const isFielding = activeCmdIds.has(gen.id);
                          const fought = gen.battlesFought || 0;
                          const won = gen.battlesWon || 0;
                          const xp = gen.battleExperience || 0;
                          const tierProgress = Math.min(100, Math.round(((xp % 55) / 55) * 100));
                          const cmdTraits = gen.commanderTraits || [];
                          const warPersonality = (gen.personalityTraits || []).filter((t) =>
                            ['Brave', 'Craven', 'Ruthless', 'Wrathful', 'Patient', 'Stubborn', 'Wounded', 'Maimed'].includes(t)
                          );
                          const scars = (gen.physicalHealthTraits || []).filter((t) =>
                            ['Scarred', 'Wounded', 'Maimed', 'Brutally Maimed'].includes(t)
                          );
                          return (
                            <div
                              key={gen.id}
                              onClick={() => onSelectCharacter(gen)}
                              className="p-3 rounded-xl bg-stone-900/75 hover:bg-stone-800/75 border border-white/10 space-y-2 cursor-pointer transition-colors"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-semibold text-amber-100 truncate">
                                      {gen.name}
                                    </span>
                                    {isFielding && (
                                      <span className="px-1.5 py-0.5 rounded bg-rose-900/80 border border-rose-600/50 text-rose-200 text-[9px] font-bold uppercase shrink-0">
                                        In Field
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-stone-400 truncate">
                                    {formatCharacterRoleLabel(gen, world)} · {gen.title}
                                  </div>
                                </div>
                                <div className="text-right font-mono tabular-nums shrink-0">
                                  <div className="text-[11px] text-amber-300 font-semibold">
                                    MAR {gen.baseMartial || 10} · PRW {gen.baseProwess || 10}
                                  </div>
                                  <div className="text-[10px] text-stone-400">
                                    {won}W / {Math.max(0, fought - won)}L ({fought} battles)
                                  </div>
                                </div>
                              </div>

                              {/* Battle Experience Bar */}
                              <div className="space-y-0.5">
                                <div className="flex justify-between text-[9px] text-stone-400 font-mono tabular-nums">
                                  <span>War Experience</span>
                                  <span>{xp} XP (Tier {Math.floor(xp / 55)})</span>
                                </div>
                                <div className="w-full h-1.5 bg-stone-950 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-amber-500 rounded-full transition-all"
                                    style={{ width: `${xp > 0 ? Math.max(8, tierProgress) : 0}%` }}
                                  />
                                </div>
                              </div>

                              {/* Commander & War-Forged Traits */}
                              {(cmdTraits.length > 0 || warPersonality.length > 0 || scars.length > 0) && (
                                <div className="flex flex-wrap gap-1 pt-0.5">
                                  {cmdTraits.map((t) => (
                                    <span
                                      key={t}
                                      className="px-1.5 py-0.5 rounded bg-amber-950/70 border border-amber-700/40 text-amber-200 text-[9px] font-medium"
                                    >
                                      {t}
                                    </span>
                                  ))}
                                  {warPersonality.map((t) => (
                                    <span
                                      key={t}
                                      className={`px-1.5 py-0.5 rounded border text-[9px] font-medium ${
                                        t === 'Craven'
                                          ? 'bg-rose-950/70 border-rose-700/40 text-rose-300'
                                          : 'bg-stone-800/90 border-stone-600/40 text-stone-200'
                                      }`}
                                    >
                                      {t}
                                    </span>
                                  ))}
                                  {scars.map((t) => (
                                    <span
                                      key={t}
                                      className="px-1.5 py-0.5 rounded bg-red-950/70 border border-red-700/40 text-red-300 text-[9px] font-medium"
                                    >
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {gen.warTraitEvents && gen.warTraitEvents.length > 0 && (
                                <div className="text-[10px] text-emerald-300/90 bg-emerald-950/25 border border-emerald-800/30 px-2 py-1 rounded">
                                  Latest: {gen.warTraitEvents[0]}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  {/* TAB D: REALM WAR STRATEGIES & DOCTRINES */}
                  {warViewTab === 'strategies' && (
                    <div className="space-y-3">
                      <div className="p-3 rounded-xl bg-stone-900/70 border border-amber-700/30 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400">
                            Active Realm War Doctrine
                          </span>
                          <span className="text-[10px] font-mono text-amber-200">
                            {realm.preferredBattleTactic
                              ? BATTLE_TACTICS[realm.preferredBattleTactic]?.label
                              : 'Commander Discretion (Auto)'}
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-400">
                          Select a realm-wide tactical doctrine below. All raised armies of {realm.name} immediately adopt this formation in field engagements.
                        </p>
                      </div>

                      <div className="space-y-2">
                        {Object.values(BATTLE_TACTICS).map((tac) => {
                          const isSelected = realm.preferredBattleTactic === tac.id;
                          return (
                            <div
                              key={tac.id}
                              onClick={() => {
                                const updated = cloneWorldState(world);
                                const targetRealm = updated.realms.find((r) => r.id === realm.id);
                                if (targetRealm) {
                                  targetRealm.preferredBattleTactic = tac.id;
                                }
                                // Apply doctrine to all currently raised armies of this realm
                                for (const a of updated.armies || []) {
                                  const cmd = updated.characters.find(
                                    (c) => c.id === (a.commanderId || a.attackerId)
                                  );
                                  if (cmd?.realmId === realm.id) {
                                    a.tactic = tac.id;
                                  }
                                }
                                onUpdateWorld(updated);
                                setNotificationMsg(
                                  `${realm.name} adopted ${tac.label} war doctrine across all hosts.`
                                );
                                setTimeout(() => setNotificationMsg(null), 3500);
                              }}
                              className={`p-3 rounded-xl border transition-colors cursor-pointer space-y-1.5 ${
                                isSelected
                                  ? 'bg-rose-950/45 border-rose-500/70 shadow-sm'
                                  : 'bg-stone-900/65 hover:bg-stone-800/75 border-white/10'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-amber-100">{tac.label}</span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                    isSelected
                                      ? 'bg-rose-600 text-white'
                                      : 'bg-stone-800 text-stone-400'
                                  }`}
                                >
                                  {isSelected ? 'Active Doctrine' : 'Adopt'}
                                </span>
                              </div>
                              <p className="text-[10px] text-stone-300 leading-relaxed">{tac.shortDesc}</p>
                              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[9px] font-mono tabular-nums pt-0.5">
                                {tac.counters.length > 0 && (
                                  <span className="text-emerald-400">
                                    Counters: {tac.counters.join(', ')}
                                  </span>
                                )}
                                {tac.counteredBy.length > 0 && (
                                  <span className="text-rose-400">
                                    Weak vs: {tac.counteredBy.join(', ')}
                                  </span>
                                )}
                                <span className="text-stone-400">
                                  Casualty Risk: {Math.round(tac.casualtyTakenMod * 100)}%
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* TAB A: ACTIVE CAMPAIGNS & WAR SCORE */}
                  {warViewTab === 'campaigns' && (
                  <>
                  {/* Interactive Border War Declaration */}
                  {world.realms.filter((r) => r.id !== realm.id).length > 0 && (
                    <div className="p-3 rounded-xl bg-stone-900/70 border border-white/10 space-y-2">
                      <div className="text-[10px] uppercase font-bold tracking-wider text-amber-400 flex items-center justify-between">
                        <span>Marshal Royal Campaign</span>
                        <span className="font-mono text-stone-400">Border Conquest CB</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={
                            warTargetRealmId && warTargetRealmId !== realm.id
                              ? warTargetRealmId
                              : world.realms.find((r) => r.id !== realm.id)?.id || ''
                          }
                          onChange={(e) => setWarTargetRealmId(e.target.value)}
                          className="flex-1 px-2.5 py-1.5 rounded-lg bg-stone-950 border border-stone-800 text-xs text-stone-200 focus:outline-none focus:border-rose-500"
                        >
                          {world.realms
                            .filter((r) => r.id !== realm.id)
                            .map((r) => {
                              const isAllied = RealmDiplomacyEngine.areRealmsAllied(realm.id, r.id, world);
                              const isEnemy = RealmDiplomacyEngine.areRealmsEnemies(realm.id, r.id, world);
                              const atWar = Boolean(ClaimAndWarEngine.findActiveWarBetweenRealms(realm.id, r.id, world));
                              return (
                                <option key={r.id} value={r.id}>
                                  {r.name}
                                  {atWar ? ' [At War — Add War Goal]' : isAllied ? ' [Allied]' : isEnemy ? ' [Enemy]' : ''}
                                </option>
                              );
                            })}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            const targetId =
                              warTargetRealmId && warTargetRealmId !== realm.id
                                ? warTargetRealmId
                                : world.realms.find((r) => r.id !== realm.id)?.id;
                            if (!targetId) return;
                            const updated = cloneWorldState(world);
                            const res = ClaimAndWarEngine.declareBorderWar(realm.id, targetId, updated);
                            onUpdateWorld(updated);
                            setNotificationMsg(res.summary);
                            setTimeout(() => setNotificationMsg(null), 4000);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-white font-semibold text-xs flex items-center gap-1 cursor-pointer shrink-0 shadow-sm"
                        >
                          <Swords className="w-3.5 h-3.5" />
                          <span>Declare War</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {realmActiveWars.length === 0 ? (
                    <div className="p-4 rounded-xl bg-stone-900/50 border border-white/5 text-center space-y-1.5">
                      <div className="text-stone-200 font-semibold text-xs">
                        {realm.name} Is Currently at Peace
                      </div>
                      <p className="text-[11px] text-stone-400">
                        No open banners are raised against or by the crown. Use Marshal Royal Campaign above or pursue rival claims in Council & Wars.
                      </p>
                    </div>
                  ) : (
                    realmActiveWars.map((war) => {
                      const attRealm = world.realms.find((r) => r.id === war.attackerRealmId);
                      const defRealm = world.realms.find((r) => r.id === war.defenderRealmId);
                      const attLeader = world.characters.find((c) => c.id === war.attackerLeaderId);
                      const defLeader = world.characters.find((c) => c.id === war.defenderLeaderId);
                      const warArmies = (world.armies || []).filter(
                        (a) =>
                          a.warId === war.id ||
                          war.targetHoldingIds.includes(a.targetHoldingId)
                      );
                      const warSieges = (world.activeSieges || []).filter((s) =>
                        war.targetHoldingIds.includes(s.holdingId)
                      );
                      const targetHoldings = (world.holdings || []).filter((h) =>
                        war.targetHoldingIds.includes(h.id)
                      );
                      const participantIds = new Set<string>([
                        war.attackerLeaderId,
                        war.defenderLeaderId,
                        ...warArmies.map((a) => a.commanderId || a.attackerId),
                      ]);
                      const involvedNobles = Array.from(participantIds)
                        .map((id) => world.characters.find((c) => c.id === id))
                        .filter((c): c is Character => Boolean(c));

                      const isRealmAttacker = war.attackerRealmId === realm.id;
                      const score = Math.max(-100, Math.min(100, Math.round(war.warScore)));
                      const fillWidthPct = Math.min(50, Math.abs(score) / 2);

                      return (
                        <div
                          key={war.id}
                          className="p-3.5 rounded-xl bg-stone-900/70 border border-rose-700/40 space-y-3 shadow-md"
                        >
                          {/* Header: Consolidated Casus Bellis & Status */}
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {war.casusBellis && war.casusBellis.length > 0 ? (
                                  war.casusBellis.map((cb, cbIdx) => (
                                    <span
                                      key={`${war.id}_cb_${cbIdx}`}
                                      className="px-2 py-0.5 rounded bg-rose-950/90 border border-rose-600/60 text-rose-200 text-[10px] font-bold uppercase tracking-wide"
                                    >
                                      {cb.label}
                                    </span>
                                  ))
                                ) : (
                                  <span className="px-2 py-0.5 rounded bg-rose-950/90 border border-rose-600/60 text-rose-200 text-[10px] font-bold uppercase tracking-wide">
                                    {war.casusBelli}
                                  </span>
                                )}
                                <span className="px-2 py-0.5 rounded bg-black/50 text-amber-300 text-[10px] font-mono">
                                  {isRealmAttacker ? 'Offensive War' : 'Defensive War'}
                                </span>
                              </div>
                              <div className="text-xs font-cinzel font-bold text-amber-100 mt-1">
                                {attRealm?.name || 'Aggressor'} vs. {defRealm?.name || 'Defender'}
                              </div>
                              {war.casusBellis && war.casusBellis.length > 1 && (
                                <div className="text-[10px] text-amber-300/85 mt-0.5">
                                  Unified conflict settling {war.casusBellis.length} Casus Bellis upon treaty
                                </div>
                              )}
                            </div>
                            <div className="text-right font-mono text-[10px] text-stone-400 shrink-0">
                              <div>{war.monthsActive} mo active</div>
                              <div>{war.battlesFought} {war.battlesFought === 1 ? 'battle' : 'battles'}</div>
                            </div>
                          </div>

                          {/* War Score Progress Bar (-100 Defender to +100 Attacker) */}
                          <div className="p-2.5 rounded-lg bg-black/45 border border-white/5 space-y-1.5">
                            <div className="flex justify-between items-center text-[10px] font-mono">
                              <span className="text-sky-300">Defender Advantage</span>
                              <span
                                className={`font-bold ${
                                  score > 0
                                    ? 'text-rose-300'
                                    : score < 0
                                    ? 'text-sky-300'
                                    : 'text-amber-300'
                                }`}
                              >
                                War Score: {score > 0 ? `+${score}%` : `${score}%`}
                              </span>
                              <span className="text-rose-300">Attacker Advantage</span>
                            </div>
                            <div className="relative w-full h-2.5 bg-stone-950 rounded-full overflow-hidden border border-stone-800">
                              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-stone-500/70 z-10" />
                              {score >= 0 ? (
                                <div
                                  className="absolute top-0 bottom-0 left-1/2 bg-rose-500 transition-all"
                                  style={{ width: `${fillWidthPct}%` }}
                                />
                              ) : (
                                <div
                                  className="absolute top-0 bottom-0 bg-sky-500 transition-all"
                                  style={{
                                    left: `${50 - fillWidthPct}%`,
                                    width: `${fillWidthPct}%`,
                                  }}
                                />
                              )}
                            </div>
                          </div>

                          {/* Belligerent Parties */}
                          <div className="grid grid-cols-2 gap-2">
                            <div className="p-2 rounded-lg bg-rose-950/25 border border-rose-800/40 space-y-1">
                              <div className="text-[9px] uppercase font-bold text-rose-300">Attacker</div>
                              {attRealm && (
                                <button
                                  onClick={() => onSelectRealm(attRealm)}
                                  className="text-xs font-semibold text-amber-100 hover:text-amber-300 text-left flex items-center gap-1.5 w-full truncate cursor-pointer"
                                >
                                  <HeraldryShield coatOfArms={attRealm.heraldry} seed={attRealm.id} size={16} />
                                  <span className="truncate">{attRealm.name}</span>
                                </button>
                              )}
                              {attLeader && (
                                <button
                                  onClick={() => {
                                    onSelectCharacter(attLeader);
                                    setPanelMode('character');
                                  }}
                                  className="text-[10px] text-stone-300 hover:text-amber-300 text-left block truncate cursor-pointer"
                                >
                                  Led by {attLeader.name}
                                </button>
                              )}
                            </div>

                            <div className="p-2 rounded-lg bg-sky-950/25 border border-sky-800/40 space-y-1">
                              <div className="text-[9px] uppercase font-bold text-sky-300">Defender</div>
                              {defRealm && (
                                <button
                                  onClick={() => onSelectRealm(defRealm)}
                                  className="text-xs font-semibold text-amber-100 hover:text-amber-300 text-left flex items-center gap-1.5 w-full truncate cursor-pointer"
                                >
                                  <HeraldryShield coatOfArms={defRealm.heraldry} seed={defRealm.id} size={16} />
                                  <span className="truncate">{defRealm.name}</span>
                                </button>
                              )}
                              {defLeader && (
                                <button
                                  onClick={() => {
                                    onSelectCharacter(defLeader);
                                    setPanelMode('character');
                                  }}
                                  className="text-[10px] text-stone-300 hover:text-amber-300 text-left block truncate cursor-pointer"
                                >
                                  Led by {defLeader.name}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Target Holdings */}
                          {targetHoldings.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                              <span className="text-stone-400 uppercase font-semibold text-[10px]">War Objective:</span>
                              {targetHoldings.map((h) => (
                                <span
                                  key={h.id}
                                  className="inline-flex items-center gap-1 text-amber-200 font-medium"
                                >
                                  <Castle className="w-3 h-3 text-amber-400 shrink-0" />
                                  <span>{h.name}</span>
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Nobles & Commanders Involved */}
                          <div className="space-y-1">
                            <span className="text-[10px] uppercase font-semibold tracking-wider text-stone-400">
                              Nobles & Field Commanders Involved ({involvedNobles.length})
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {involvedNobles.map((n) => {
                                const nRealm = world.realms.find((r) => r.id === n.realmId);
                                return (
                                  <button
                                    key={n.id}
                                    onClick={() => {
                                      onSelectCharacter(n);
                                      setPanelMode('character');
                                    }}
                                    className="px-2 py-1 rounded-md bg-stone-900/70 hover:bg-stone-800 border border-white/[0.08] text-[11px] text-stone-200 flex items-center gap-1.5 cursor-pointer transition-colors"
                                  >
                                    {n.titleTier === 'King' || n.titleTier === 'Emperor' ? (
                                      <Crown className="w-3 h-3 text-amber-400 shrink-0" />
                                    ) : (
                                      <Swords className="w-3 h-3 text-rose-400 shrink-0" />
                                    )}
                                    <span className="font-medium">{n.name}</span>
                                    {nRealm && (
                                      <span className="text-stone-400 font-mono">({nRealm.name.split(' ').pop()})</span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Field Armies & Army Unit Types */}
                          <div className="space-y-1.5">
                            <span className="text-[9px] uppercase font-bold tracking-wider text-amber-400/90">
                              Field Armies & Regiment Types ({warArmies.length})
                            </span>
                            {warArmies.length === 0 ? (
                              <div className="p-2 rounded-lg bg-black/30 text-[10px] text-stone-400">
                                Forces rallying at muster points or entrenched in siege lines.
                              </div>
                            ) : (
                              warArmies.map((army) => {
                                const cmd = world.characters.find(
                                  (c) => c.id === (army.commanderId || army.attackerId)
                                );
                                const cmdRealm = cmd ? world.realms.find((r) => r.id === cmd.realmId) : undefined;
                                const armyRealmId = cmdRealm?.id || (army.isDefender ? war.defenderRealmId : war.attackerRealmId);
                                const canCommand = armyRealmId === realm.id && !army.isReturning;
                                const eligibleCommanders = canCommand
                                  ? ArmyCommandEngine.getEligibleCommanders(realm.id, world)
                                  : [];
                                const armyPos = getArmyPositionAtProgress(army);
                                const currentTactic: BattleTactic = army.tactic || 'Standard Line';

                                return (
                                  <div
                                    key={army.id}
                                    className="p-2.5 rounded-lg bg-black/40 border border-white/10 space-y-2"
                                  >
                                    <div className="flex items-center justify-between text-[11px] gap-2">
                                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                        <span
                                          className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/30"
                                          style={{ backgroundColor: army.color }}
                                        />
                                        {editingArmyId === army.id ? (
                                          <div className="flex items-center gap-1 flex-1 min-w-0">
                                            <input
                                              type="text"
                                              value={draftArmyName}
                                              onChange={(e) => setDraftArmyName(e.target.value)}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                  onUpdateWorld(updateArmy(world, army.id, { name: draftArmyName }));
                                                  setEditingArmyId(null);
                                                } else if (e.key === 'Escape') {
                                                  setEditingArmyId(null);
                                                }
                                              }}
                                              className="flex-1 min-w-0 px-1.5 py-0.5 rounded bg-stone-950 border border-amber-500/50 text-[11px] text-stone-100 focus:outline-none"
                                              autoFocus
                                            />
                                            <button
                                              type="button"
                                              onClick={() => {
                                                onUpdateWorld(updateArmy(world, army.id, { name: draftArmyName }));
                                                setEditingArmyId(null);
                                              }}
                                              className="p-0.5 text-emerald-400 hover:text-emerald-300 cursor-pointer"
                                            >
                                              <Check className="w-3 h-3" />
                                            </button>
                                          </div>
                                        ) : (
                                          <>
                                            <span className="font-semibold text-stone-100 truncate">
                                              {army.name || army.commanderName || cmd?.name || 'Royal Host'}
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setEditingArmyId(army.id);
                                                setDraftArmyName(army.name || (cmd?.name ? `${cmd.name}'s Host` : 'Royal Host'));
                                              }}
                                              title="Rename Field Army"
                                              className="p-0.5 text-stone-400 hover:text-amber-300 cursor-pointer shrink-0"
                                            >
                                              <Pencil className="w-3 h-3" />
                                            </button>
                                          </>
                                        )}
                                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-stone-800 text-stone-300 font-mono shrink-0">
                                          {army.isDefender ? 'Defender' : 'Attacker'} · {cmdRealm?.name || 'Host'}
                                        </span>
                                      </div>
                                      <span className="font-mono font-bold text-amber-300 shrink-0">
                                        {Math.round(army.strength).toLocaleString()} men ({Math.round(army.progress * 100)}%)
                                      </span>
                                    </div>

                                    {/* March Route & Terrain Status */}
                                    <div className="flex items-center justify-between text-[10px] text-stone-400 font-mono">
                                      <span>
                                        Marching via{' '}
                                        <strong className={armyPos.isRoad ? 'text-amber-300' : 'text-sky-300'}>
                                          {armyPos.isRoad ? 'Imperial Road' : `${armyPos.terrainLabel} Terrain`}
                                        </strong>
                                      </span>
                                      <span>Doctrine: {BATTLE_TACTICS[currentTactic]?.label || currentTactic}</span>
                                    </div>

                                    {/* King's Commander Assignment & Tactical Doctrine */}
                                    {canCommand && (
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 border-t border-white/5">
                                        <label className="space-y-0.5 text-[9px] text-stone-400 uppercase font-bold">
                                          <span>Assign Noble Commander</span>
                                          <select
                                            value={army.commanderId || ''}
                                            onChange={(e) => {
                                              if (!e.target.value) return;
                                              const updated = cloneWorldState(world);
                                              const res = ArmyCommandEngine.assignArmyCommander(army.id, e.target.value, updated);
                                              onUpdateWorld(updated);
                                              setNotificationMsg(res.summary);
                                              setTimeout(() => setNotificationMsg(null), 3500);
                                            }}
                                            className="w-full px-2 py-1 rounded bg-stone-950 border border-stone-700 text-[10px] font-sans font-normal text-stone-100 normal-case"
                                          >
                                            {eligibleCommanders.map((ec) => (
                                              <option key={ec.id} value={ec.id}>
                                                {getCharacterRankTitle(ec, world)} {ec.name} (MAR {ec.baseMartial})
                                              </option>
                                            ))}
                                          </select>
                                        </label>

                                        <label className="space-y-0.5 text-[9px] text-stone-400 uppercase font-bold">
                                          <span>Battle Strategy</span>
                                          <select
                                            value={currentTactic}
                                            onChange={(e) => {
                                              const updated = cloneWorldState(world);
                                              const res = ArmyCommandEngine.setArmyTactic(
                                                army.id,
                                                e.target.value as BattleTactic,
                                                updated
                                              );
                                              onUpdateWorld(updated);
                                              setNotificationMsg(res.summary);
                                              setTimeout(() => setNotificationMsg(null), 3000);
                                            }}
                                            className="w-full px-2 py-1 rounded bg-stone-950 border border-stone-700 text-[10px] font-sans font-normal text-stone-100 normal-case"
                                          >
                                            {Object.values(BATTLE_TACTICS).map((t) => (
                                              <option key={t.id} value={t.id} title={t.shortDesc}>
                                                {t.label}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                      </div>
                                    )}

                                    {/* Army Discipline & Wartime Conduct Policy */}
                                    {(() => {
                                      const cmd = world.characters.find((c) => c.id === army.commanderId);
                                      const disc = army.discipline ?? computeArmyDiscipline(army, cmd, world);
                                      const policy: ArmyConductPolicy = army.conductPolicy || 'Forage & Requisition';
                                      const discColor =
                                        disc >= 75
                                          ? 'text-emerald-300'
                                          : disc >= 45
                                          ? 'text-amber-300'
                                          : disc >= 20
                                          ? 'text-orange-400'
                                          : 'text-rose-400';
                                      const conductLabel =
                                        disc >= 75
                                          ? 'Orderly Occupation'
                                          : disc >= 45
                                          ? 'Foraging & Requisitions'
                                          : disc >= 20
                                          ? 'Unchecked Pillaging'
                                          : 'Brutal Sack & Atrocities';
                                      return (
                                        <div className="p-2 rounded bg-stone-950/70 border border-white/5 space-y-1.5">
                                          <div className="flex items-center justify-between text-[10px]">
                                            <span className="text-stone-400 uppercase font-bold tracking-wider">
                                              Discipline:{' '}
                                              <span className={`font-mono ${discColor}`}>{disc}/100</span>
                                            </span>
                                            <span className={`text-[9px] font-mono ${discColor}`}>
                                              {conductLabel}
                                            </span>
                                          </div>
                                          <div className="w-full h-1 bg-stone-900 rounded-full overflow-hidden">
                                            <div
                                              className={`h-full transition-all ${
                                                disc >= 75
                                                  ? 'bg-emerald-500'
                                                  : disc >= 45
                                                  ? 'bg-amber-500'
                                                  : disc >= 20
                                                  ? 'bg-orange-500'
                                                  : 'bg-rose-600'
                                              }`}
                                              style={{ width: `${Math.min(100, Math.max(0, disc))}%` }}
                                            />
                                          </div>
                                          {onUpdateWorld && (
                                            <div className="flex items-center justify-between gap-2 pt-0.5">
                                              <span className="text-[9px] text-stone-400 uppercase font-bold">
                                                Conduct Orders
                                              </span>
                                              <select
                                                value={policy}
                                                onChange={(e) => {
                                                  const updated = cloneWorldState(world);
                                                  const targetArmy = (updated.armies || []).find((a) => a.id === army.id);
                                                  if (targetArmy) {
                                                    targetArmy.conductPolicy = e.target.value as ArmyConductPolicy;
                                                    const nextCmd = updated.characters.find((c) => c.id === targetArmy.commanderId);
                                                    computeArmyDiscipline(targetArmy, nextCmd, updated);
                                                    onUpdateWorld(updated);
                                                  }
                                                }}
                                                className="px-2 py-0.5 rounded bg-stone-900 border border-stone-700 text-[10px] text-stone-100"
                                              >
                                                <option value="Strict Quarter">Strict Quarter (+Discipline)</option>
                                                <option value="Forage & Requisition">Forage & Requisition</option>
                                                <option value="Free Plunder">Free Plunder (Loot & Raid)</option>
                                                <option value="Scorched Earth">Scorched Earth (Raze & Sack)</option>
                                              </select>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })()}

                                    {/* Last Battle Report (Tactics, Weather, Dice Swing, Civilian & Conduct Outcomes) */}
                                    {army.lastBattleReport && (
                                      <div className="p-2 rounded bg-stone-950/75 border border-amber-700/30 text-[10px] space-y-1">
                                        <div className="flex items-center justify-between text-amber-300 font-semibold">
                                          <span>
                                            Last Engagement ({army.lastBattleReport.terrain} ·{' '}
                                            {army.lastBattleReport.weatherCondition || 'Clear Dawn'})
                                          </span>
                                          <span className="font-mono text-[9px] text-stone-300">
                                            Fortune:{' '}
                                            {(army.lastBattleReport.diceSwingPct || 0) >= 0
                                              ? `+${army.lastBattleReport.diceSwingPct || 0}%`
                                              : `${army.lastBattleReport.diceSwingPct}%`}
                                          </span>
                                        </div>
                                        <div className="text-stone-300">
                                          {army.lastBattleReport.attackerTactic || 'Standard Line'} vs{' '}
                                          {army.lastBattleReport.defenderTactic || 'Standard Line'} ·{' '}
                                          {army.lastBattleReport.tacticalSummary}
                                        </div>
                                        {army.lastBattleReport.conductOutcome && (
                                          <div className="pt-1 border-t border-white/5 text-[9px] text-rose-200/90 space-y-0.5">
                                            <div className="flex items-center justify-between font-mono">
                                              <span className="font-semibold text-amber-200">
                                                Conduct: {army.lastBattleReport.conductOutcome}
                                              </span>
                                              <span>
                                                Civilians: -{(army.lastBattleReport.civilianCasualties || 0).toLocaleString()} ·
                                                Levies: -{(army.lastBattleReport.levyPopulationLoss || 0).toLocaleString()}
                                                {(army.lastBattleReport.plunderedGold || 0) > 0
                                                  ? ` · Plunder: ${army.lastBattleReport.plunderedGold}g`
                                                  : ''}
                                              </span>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {army.regiments && army.regiments.length > 0 && (
                                      <div className="grid grid-cols-1 gap-1 pt-1 border-t border-white/5">
                                        {army.regiments.map((reg) => (
                                          <div
                                            key={reg.id}
                                            className="flex items-center justify-between text-[10px] bg-stone-950/60 px-2 py-1 rounded border border-white/5"
                                          >
                                            <div className="truncate">
                                              <span className="font-medium text-amber-100">
                                                {getRegimentDisplayName(reg)}
                                              </span>
                                              <span className="text-stone-500 ml-1.5 font-mono">
                                                [{reg.category}]
                                              </span>
                                            </div>
                                            <span className="font-mono text-stone-300 shrink-0 ml-2">
                                              {reg.count}/{reg.maxCount} · {Math.round(reg.morale)}% Morale
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>

                          {/* Active Sieges in this War */}
                          {warSieges.length > 0 && (
                            <div className="space-y-1.5 pt-1 border-t border-white/[0.06]">
                              <span className="text-[10px] uppercase font-semibold tracking-wider text-rose-300">
                                Active Sieges ({warSieges.length})
                              </span>
                              {warSieges.map((s) => (
                                <div
                                  key={s.id}
                                  className="p-2 rounded-md bg-red-950/35 border border-red-700/40 space-y-1 text-[11px]"
                                >
                                  <div className="flex justify-between">
                                    <span className="font-semibold text-amber-100 flex items-center gap-1.5">
                                      <Castle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                      <span>{s.holdingName}</span>
                                    </span>
                                    <span className="font-mono tabular-nums text-stone-300">
                                      Walls {Math.round(s.wallIntegrity)}% · Garrison {s.garrisonCount}
                                    </span>
                                  </div>
                                  <div className="w-full h-1.5 bg-stone-950 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-rose-500 rounded-full"
                                      style={{ width: `${Math.max(0, Math.min(100, s.wallIntegrity))}%` }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Dynamic Peace Negotiation & Campaign Resolution */}
                          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/10">
                            <button
                              type="button"
                              onClick={() => setNegotiatingWar(war)}
                              className="py-1.5 px-3 rounded-lg bg-amber-700 hover:bg-amber-600 text-white text-[11px] font-semibold cursor-pointer shadow-sm"
                            >
                              Negotiate Treaty
                            </button>
                            {((isRealmAttacker && score >= 45) || (!isRealmAttacker && score <= -45)) && (
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = cloneWorldState(world);
                                  const res = ClaimAndWarEngine.resolveWarPeace(
                                    war.id,
                                    isRealmAttacker ? 'attacker_win' : 'defender_win',
                                    updated
                                  );
                                  onUpdateWorld(updated);
                                  setNotificationMsg(res.summary);
                                  setTimeout(() => setNotificationMsg(null), 4500);
                                }}
                                className="flex-1 py-1.5 px-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] font-semibold cursor-pointer shadow-sm"
                              >
                                Enforce Demands
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                const updated = cloneWorldState(world);
                                const res = ClaimAndWarEngine.resolveWarPeace(war.id, 'white_peace', updated);
                                onUpdateWorld(updated);
                                setNotificationMsg(res.summary);
                                setTimeout(() => setNotificationMsg(null), 4000);
                              }}
                              className="py-1.5 px-3 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-[11px] font-medium cursor-pointer border border-stone-700"
                            >
                              Sue for White Peace
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}

                  {/* Other Ongoing Continental Wars for Awareness */}
                  {allActiveWars.filter((w) => w.attackerRealmId !== realm.id && w.defenderRealmId !== realm.id).length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-white/10">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-stone-400">
                        Foreign Wars Across the Realm Map
                      </span>
                      {allActiveWars
                        .filter((w) => w.attackerRealmId !== realm.id && w.defenderRealmId !== realm.id)
                        .map((w) => {
                          const ar = world.realms.find((r) => r.id === w.attackerRealmId);
                          const dr = world.realms.find((r) => r.id === w.defenderRealmId);
                          return (
                            <div
                              key={w.id}
                              onClick={() => ar && onSelectRealm(ar)}
                              className="p-2.5 rounded-xl bg-stone-900/40 hover:bg-stone-800/60 border border-white/5 flex items-center justify-between cursor-pointer transition-colors"
                            >
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-stone-200 truncate">
                                  {ar?.name || 'Attacker'} vs. {dr?.name || 'Defender'}
                                </div>
                                <div className="text-[10px] text-stone-400">
                                  {w.casusBelli} · {w.monthsActive} mo · Score {w.warScore > 0 ? `+${Math.round(w.warScore)}` : Math.round(w.warScore)}%
                                </div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-stone-500 shrink-0" />
                            </div>
                          );
                        })}
                    </div>
                  )}
                  </>
                  )}
                </div>
                );
              })()}

              {/* Subtab 3: Story Dynamics & Feuds */}
              {realmSubtab === 'story' && (
                <div className="space-y-4">
                  {/* Cadet Branch Rivalries & Blood Feuds */}
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400/90 flex items-center gap-1.5">
                      <Skull className="w-3.5 h-3.5 text-red-400" />
                      <span>Cadet Dynasties & Blood Feuds</span>
                    </span>

                    {cadetFeuds.length === 0 ? (
                      <div className="p-3.5 rounded-xl bg-stone-900/40 text-stone-400 text-xs">
                        No active cadet blood feuds declared. Dynasty unity holds steady.
                      </div>
                    ) : (
                      cadetFeuds.map((feud, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-xl bg-red-950/30 border border-red-800/40 space-y-1.5"
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-rose-200">
                              House {feud.name} vs House {feud.feudTargetDynasty}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-red-900/80 text-red-200">
                              Vengeance Active
                            </span>
                          </div>
                          <p className="text-[11px] text-stone-300 italic">
                            "{feud.feudReason || 'Bitter contested succession claim over hereditary castle bailey.'}"
                          </p>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Feudal Factions */}
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400/90 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-amber-400" />
                      <span>Political Court Factions ({realmFactions.length})</span>
                    </span>
                    {realmFactions.length === 0 ? (
                      <div className="p-3 rounded-xl bg-stone-900/40 text-stone-400 text-xs">
                        No organized vassal factions currently threaten {realm.name}.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {realmFactions.map((fac) => {
                          const leader = world.characters.find((c) => c.id === fac.leaderId);
                          return (
                            <div
                              key={fac.id}
                              className="p-3 rounded-xl bg-stone-900/60 border border-amber-700/30 space-y-1.5"
                            >
                              <div className="flex justify-between items-center">
                                <span className="font-semibold text-amber-200">{fac.name}</span>
                                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-black/40 text-rose-300">
                                  {fac.members.length} {fac.members.length === 1 ? 'Noble' : 'Nobles'}
                                  {fac.ultimatumIssued ? ' · Ultimatum Sent' : ''}
                                </span>
                              </div>
                              <p className="text-[11px] text-stone-400">
                                Led by{' '}
                                <button
                                  onClick={() => {
                                    if (leader) {
                                      onSelectCharacter(leader);
                                      setPanelMode('character');
                                    }
                                  }}
                                  className="text-amber-300 hover:underline cursor-pointer"
                                >
                                  {leader?.name || 'Discontent Vassal'}
                                </button>{' '}
                                pressing crown concessions against {ruler.name}.
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Active Court Schemes */}
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400/90 flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-purple-400" />
                      <span>Active Whispers & Intrigue Schemes ({realmActiveSchemes.length})</span>
                    </span>
                    {realmActiveSchemes.length === 0 ? (
                      <div className="p-3 rounded-xl bg-stone-900/40 text-stone-400 text-xs">
                        No overt conspiracies or plots uncovered within {realm.name}'s court.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {realmActiveSchemes.map((plotter) => (
                          <div
                            key={plotter.id}
                            onClick={() => {
                              onSelectCharacter(plotter);
                              setPanelMode('character');
                            }}
                            className="p-3 rounded-xl bg-purple-950/30 hover:bg-purple-950/50 border border-purple-800/40 space-y-1.5 cursor-pointer transition-colors"
                          >
                            <div className="flex justify-between items-center">
                              <span className="font-semibold text-purple-200">
                                {plotter.activeScheme!.type}: {plotter.name}
                              </span>
                              <span className="text-[10px] font-mono text-purple-300">
                                {Math.round(plotter.activeScheme!.progress)}%
                              </span>
                            </div>
                            <p className="text-[11px] text-stone-300">
                              Targeting {plotter.activeScheme!.targetName} ({plotter.activeScheme!.motive}).
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Subtab 4: Men-at-Arms & Warfare */}
              {realmSubtab === 'military' && (
                <div className="space-y-4">
                  {/* Total Military Roster */}
                  <div className="p-3.5 rounded-lg bg-stone-900/50 border border-white/[0.08] space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] uppercase font-semibold tracking-wider text-amber-400/90">
                        Professional Men-at-Arms Roster
                      </span>
                      <span className="text-[11px] font-mono tabular-nums text-rose-300 font-semibold">
                        Cap: {Math.min(8, Math.round(realmDemographics.avgDev / 12) + 2)} Regiments
                      </span>
                    </div>

                    <div className="divide-y divide-white/[0.06] border border-white/[0.07] rounded-md bg-stone-950/45">
                      <div className="px-3 py-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Crown className="w-4 h-4 text-amber-400 shrink-0" />
                          <div className="min-w-0">
                            <div className="font-semibold text-amber-200 text-xs truncate">
                              {getOriginRegimentName('CulturalSpecial', realm.name, realm.culture, ruler?.houseName)}
                            </div>
                            <div className="text-[11px] text-stone-400 truncate">
                              {realm.culture} Elite Guard · Sworn Retainers
                            </div>
                          </div>
                        </div>
                        <span className="font-mono tabular-nums font-semibold text-amber-300 shrink-0">
                          {realmDemographics.culturalGuard.toLocaleString()} Men
                        </span>
                      </div>

                      <div className="px-3 py-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Navigation className="w-4 h-4 text-sky-400 shrink-0" />
                          <div className="min-w-0">
                            <div className="font-semibold text-stone-200 text-xs truncate">
                              {getOriginRegimentName('Cavalry', realm.name, realm.culture, ruler?.houseName)}
                            </div>
                            <div className="text-[11px] text-stone-400 truncate">Shock Cavalry · Counters Light Foot</div>
                          </div>
                        </div>
                        <span className="font-mono tabular-nums font-semibold text-amber-300 shrink-0">{realmDemographics.knights} Men</span>
                      </div>

                      <div className="px-3 py-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Swords className="w-4 h-4 text-stone-300 shrink-0" />
                          <div className="min-w-0">
                            <div className="font-semibold text-stone-200 text-xs truncate">
                              {getOriginRegimentName('Infantry', realm.name, realm.culture, ruler?.houseName)}
                            </div>
                            <div className="text-[11px] text-stone-400 truncate">Armored Footmen · Shield Wall</div>
                          </div>
                        </div>
                        <span className="font-mono tabular-nums font-semibold text-stone-200 shrink-0">{realmDemographics.heavyInfantry} Men</span>
                      </div>

                      <div className="px-3 py-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
                          <div className="min-w-0">
                            <div className="font-semibold text-stone-200 text-xs truncate">
                              {getOriginRegimentName('Ranged', realm.name, realm.culture, ruler?.houseName)}
                            </div>
                            <div className="text-[11px] text-stone-400 truncate">Armor Piercing · High Ground Bonus</div>
                          </div>
                        </div>
                        <span className="font-mono tabular-nums font-semibold text-stone-200 shrink-0">{realmDemographics.crossbowmen} Men</span>
                      </div>

                      <div className="px-3 py-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Shield className="w-4 h-4 text-amber-300 shrink-0" />
                          <div className="min-w-0">
                            <div className="font-semibold text-stone-200 text-xs truncate">
                              {getOriginRegimentName('Spear', realm.name, realm.culture, ruler?.houseName)}
                            </div>
                            <div className="text-[11px] text-stone-400 truncate">Cavalry Counter · Mountain Superiority</div>
                          </div>
                        </div>
                        <span className="font-mono tabular-nums font-semibold text-stone-200 shrink-0">{realmDemographics.pikemen} Men</span>
                      </div>

                      <div className="px-3 py-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Flame className="w-4 h-4 text-rose-400 shrink-0" />
                          <div className="min-w-0">
                            <div className="font-semibold text-stone-200 text-xs truncate">
                              {getOriginRegimentName('Siege', realm.name, realm.culture, ruler?.houseName)}
                            </div>
                            <div className="text-[11px] text-stone-400 truncate">Wall Bombardment · Castle Breaker</div>
                          </div>
                        </div>
                        <span className="font-mono tabular-nums font-semibold text-stone-200 shrink-0">{realmDemographics.siegeEngines} Batteries</span>
                      </div>

                      <div className="px-3 py-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Wheat className="w-4 h-4 text-emerald-400 shrink-0" />
                          <div className="min-w-0">
                            <div className="font-semibold text-stone-200 text-xs truncate">
                              {getOriginRegimentName('Levy', realm.name, realm.culture, ruler?.houseName)}
                            </div>
                            <div className="text-[11px] text-stone-400 truncate">Mass Infantry · Screen Formation</div>
                          </div>
                        </div>
                        <span className="font-mono tabular-nums font-semibold text-emerald-400 shrink-0">{realmDemographics.levyCount.toLocaleString()} Levies</span>
                      </div>
                    </div>
                  </div>

                  {/* Active Siege Camps */}
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400/90 flex items-center gap-1.5">
                      <Swords className="w-3.5 h-3.5 text-rose-500" />
                      <span>Active Sieges ({realmSieges.length})</span>
                    </span>

                    {realmSieges.length === 0 ? (
                      <div className="p-4 rounded-xl bg-stone-900/40 text-stone-400 text-center text-xs">
                        Peace holds over the imperial borders. No fortress walls under siege.
                      </div>
                    ) : (
                      realmSieges.map((siege) => (
                        <div key={siege.id} className="p-3 rounded-xl bg-red-950/30 border border-red-800/40 space-y-1.5">
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-amber-100">{siege.holdingName}</span>
                            <span className="text-[10px] font-mono text-stone-300">Fort Level {siege.fortLevel}</span>
                          </div>
                          <div className="w-full h-1.5 bg-stone-900 rounded-full overflow-hidden">
                            <div className="h-full bg-rose-500 rounded-full" style={{ width: `${siege.wallIntegrity}%` }} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Subtab 5: Economy, Treasury & Commodities */}
              {realmSubtab === 'economy' && (
                <div className="space-y-4">
                  {/* Fiscal Cashflow Matrix */}
                  <div className="p-3.5 rounded-xl bg-stone-900/60 border border-white/5 space-y-2.5">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400/90">
                      Imperial Fiscal Cashflow
                    </span>
                    <div className="space-y-1.5 font-mono text-xs">
                      <div className="flex justify-between text-stone-300">
                        <span>Demesne Domain Tolls:</span>
                        <span className="text-emerald-400">+{(realm.budget?.lastReport?.domainTax ?? realmFiscal?.demesneIncome ?? 0).toFixed(1)}g/mo</span>
                      </div>
                      <div className="flex justify-between text-stone-300">
                        <span>Feudal Vassal Tribute:</span>
                        <span className="text-emerald-400">+{(realm.budget?.lastReport?.vassalTax ?? realmFiscal?.vassalTribute ?? 0).toFixed(1)}g/mo</span>
                      </div>
                      {(realm.budget?.lastReport?.scutageAndAidsIncome || 0) > 0 && (
                        <div className="flex justify-between text-stone-300">
                          <span>Scutage, Aids &amp; Reliefs:</span>
                          <span className="text-emerald-400">+{(realm.budget?.lastReport?.scutageAndAidsIncome || 0).toFixed(1)}g/mo</span>
                        </div>
                      )}
                      <div className="flex justify-between text-stone-300">
                        <span>Royal Customs &amp; Minting:</span>
                        <span className="text-emerald-400">+{((realm.budget?.lastReport?.customsTariffs ?? realmFiscal?.tariffIncome ?? 0) + (realm.budget?.lastReport?.mintingIncome ?? 0)).toFixed(1)}g/mo</span>
                      </div>
                      <div className="flex justify-between text-stone-300">
                        <span>Army, Castles &amp; Arms:</span>
                        <span className="text-rose-400">-{((realm.budget?.lastReport?.armyMaintenance ?? realmFiscal?.armyUpkeep ?? 0) + (realm.budget?.lastReport?.castleAndGarrisonUpkeep || 0) + (realm.budget?.lastReport?.armsAndSuppliesUpkeep || 0)).toFixed(1)}g/mo</span>
                      </div>
                      <div className="flex justify-between text-stone-300">
                        <span>Admin, Diplomacy &amp; Abbeys:</span>
                        <span className="text-rose-400">-{((realm.budget?.lastReport?.administrationAndJustice || 0) + (realm.budget?.lastReport?.diplomacyAndPatronage || 0) + (realm.budget?.lastReport?.religiousPatronage || 0) + (realm.budget?.lastReport ? 0 : realmFiscal?.courtSplendorCost ?? 0)).toFixed(1)}g/mo</span>
                      </div>
                      {(realm.budget?.lastReport?.civilListStipend || 0) > 0 && (
                        <div className="flex justify-between text-stone-300">
                          <span>Royal Household Stipend (10%):</span>
                          <span className="text-rose-400">-{(realm.budget?.lastReport?.civilListStipend || 0).toFixed(1)}g/mo</span>
                        </div>
                      )}
                      {((realm.budget?.lastReport?.loanInterest || 0) > 0 || (realmFiscal && realmFiscal.debtServicing > 0)) && (
                        <div className="flex justify-between text-stone-300">
                          <span>Debt Servicing:</span>
                          <span className="text-rose-400">-{((realm.budget?.lastReport?.loanInterest || 0) || (realmFiscal?.debtServicing || 0)).toFixed(1)}g/mo</span>
                        </div>
                      )}
                      <div className="pt-2 border-t border-stone-800 flex justify-between font-bold text-amber-300">
                        <span>Net Monthly Balance:</span>
                        <span>{(() => {
                          const net = realm.budget?.lastReport ? realm.budget.lastReport.netBalance : (realmFiscal?.netMonthlyCashflow ?? 0);
                          return `${net >= 0 ? '+' : ''}${net.toFixed(1)}g`;
                        })()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Finite Realm Currency & Money Supply */}
                  {realmCurrency && (
                    <div className="p-3.5 rounded-xl bg-stone-900/70 border border-amber-500/40 space-y-3 shadow-md">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400 flex items-center gap-1.5">
                          <Coins className="w-3.5 h-3.5 text-amber-400" />
                          <span>Imperial Currency & Finite Specie Supply</span>
                        </span>
                        <span className="font-mono text-amber-300 font-bold text-xs px-2 py-0.5 rounded bg-amber-950/60 border border-amber-500/30">
                          {realmCurrency.standard} Standard
                        </span>
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-md bg-stone-950/50 border border-white/[0.07]">
                        <div>
                          <div className="text-sm font-cinzel font-bold text-amber-100 flex items-center gap-1.5">
                            <span>{realmCurrency.currencyName}</span>
                          </div>
                          <div className="text-[11px] text-stone-400">
                            Specie Standard ({realmCurrency.standard})
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-stone-400">COIN PURITY</div>
                          <div className={`font-mono tabular-nums font-semibold text-xs ${realmCurrency.coinPurity >= 0.8 ? 'text-emerald-400' : realmCurrency.coinPurity >= 0.6 ? 'text-amber-400' : 'text-rose-400'}`}>
                            {Math.round(realmCurrency.coinPurity * 100)}% Pure Bullion
                          </div>
                        </div>
                      </div>

                      {/* Finite Supply Matrix */}
                      <div className="grid grid-cols-2 divide-x divide-y divide-white/[0.07] border border-white/[0.07] rounded-md bg-stone-950/45 text-xs font-mono tabular-nums">
                        <div className="p-2.5">
                          <div className="text-[10px] text-stone-400">CIRCULATING COINS</div>
                          <div className="font-bold text-emerald-300 text-sm mt-0.5">
                            {Math.round(realmCurrency.circulatingSupply).toLocaleString()} {realmCurrency.symbol}
                          </div>
                          <div className="text-[10px] text-stone-500 font-sans">M1 in circulation</div>
                        </div>
                        <div className="p-2.5">
                          <div className="text-[10px] text-stone-400">VAULT RESERVES</div>
                          <div className="font-bold text-amber-300 text-sm mt-0.5">
                            {Math.round(realmCurrency.vaultReserves).toLocaleString()} {realmCurrency.symbol}
                          </div>
                          <div className="text-[10px] text-stone-500 font-sans">Physical bullion reserves</div>
                        </div>
                        <div className="p-2.5">
                          <div className="text-[10px] text-stone-400">VELOCITY (M2)</div>
                          <div className="font-bold text-sky-300 text-xs mt-0.5">
                            {realmCurrency.velocity.toFixed(2)}x / yr
                          </div>
                          <div className="text-[10px] text-stone-500 font-sans">Market exchange rate</div>
                        </div>
                        <div className="p-2.5">
                          <div className="text-[10px] text-stone-400">SEIGNIORAGE</div>
                          <div className="font-bold text-purple-300 text-xs mt-0.5">
                            +{realmCurrency.seigniorageMonthly.toFixed(1)}g / mo
                          </div>
                          <div className="text-[10px] text-stone-500 font-sans">Minting tariff (4%)</div>
                        </div>
                      </div>

                      {/* Debasement Warning & Inflation */}
                      <div className="p-2.5 rounded-lg bg-black/50 border border-white/5 text-[10px] space-y-1.5 font-mono">
                        <div className="flex justify-between text-stone-300">
                          <span>Total Sovereign Minted Stock:</span>
                          <span className="font-bold text-amber-200">{Math.round(realmCurrency.totalMintedSupply).toLocaleString()} {realmCurrency.symbol}</span>
                        </div>
                        <div className="flex justify-between text-stone-400">
                          <span>Specie Inflation Index:</span>
                          <span className={`${realmCurrency.inflationRate > 0.05 ? 'text-rose-400 font-bold' : 'text-emerald-400'}`}>
                            {(realmCurrency.inflationRate * 100).toFixed(1)}% Annualized
                          </span>
                        </div>
                      </div>

                      <div className="pt-1">
                        <button
                          onClick={handleDebase}
                          className="w-full py-2 bg-stone-800 hover:bg-stone-700 text-amber-300 rounded-xl font-medium text-xs transition-colors cursor-pointer border border-amber-600/30 flex items-center justify-center gap-1.5"
                        >
                          <Coins className="w-3.5 h-3.5 text-amber-400" />
                          <span>Debase Sovereign Specie (+85–280 Gold, -10% Purity)</span>
                        </button>
                        <div className="text-[9px] text-stone-500 text-center mt-1">
                          Debasing injects token coin but causes merchant flight and elevates rural direct bartering.
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Deep Financial Institutions: Patrician Banking Consortia */}
                  <div className="space-y-2.5">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400/90 flex items-center gap-1.5">
                      <Coins className="w-3.5 h-3.5 text-amber-400" />
                      <span>Merchant Patrician Banking Houses & Debt Traps</span>
                    </span>

                    <div className="space-y-2">
                      {(economy?.bankInstitutions || []).map((bank) => {
                        const activeLoan = bank.activeLoans.find((l) => l.borrowerId === activeChar?.id);
                        return (
                          <div
                            key={bank.id}
                            className={`p-3 rounded-xl border space-y-2 ${
                              activeLoan?.isDefaulted
                                ? 'bg-red-950/40 border-red-600/50'
                                : 'bg-stone-900/60 border-white/5'
                            }`}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="font-semibold text-xs text-amber-100">{bank.name}</div>
                                <div className="text-[10px] text-amber-400/90 font-mono mt-0.5">
                                  {bank.patricianName} · {bank.houseName}
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="text-[10px] font-mono text-emerald-400 block">
                                  Vault: {bank.treasury.toLocaleString()}g
                                </span>
                                <span className="text-[9px] font-mono text-stone-400">
                                  {Math.round(bank.baseInterestRate * 100)}% Annual Rate
                                </span>
                              </div>
                            </div>

                            <p className="text-[10px] text-stone-400 italic">
                              "{bank.reputationDescription || 'Merchant financiers collecting upon sovereign debts.'}"
                            </p>

                            {activeLoan ? (
                              <div className="p-2 rounded-lg bg-black/50 border border-white/5 text-[11px] font-mono flex items-center justify-between">
                                <div>
                                  <span className="text-stone-400">Debt: </span>
                                  <strong className="text-rose-400">{activeLoan.remainingBalance}g</strong>
                                  <span className="text-stone-500 text-[10px]"> ({activeLoan.monthsRemaining} mo)</span>
                                </div>
                                {activeLoan.isDefaulted && (
                                  <span className="px-1.5 py-0.5 rounded bg-red-900/80 text-red-200 text-[9px] font-bold">
                                    ⚠️ DEFAULTED: Hook Held
                                  </span>
                                )}
                              </div>
                            ) : (
                              <button
                                onClick={() => handleTakeLoan(bank.id, 250)}
                                disabled={!bank.isSolvent || bank.treasury < 250}
                                className="w-full py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 disabled:opacity-50 text-amber-300 border border-amber-600/30 text-[11px] font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                              >
                                <Coins className="w-3.5 h-3.5 text-amber-400" />
                                <span>{bank.isSolvent && bank.treasury >= 250 ? 'Float Sovereign Bond (+250g Loan)' : 'Bank Vault Exhausted'}</span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Dynamic Flow Economy & Active Supply Caravans */}
                  <div className="space-y-2.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400/90 flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-sky-400" />
                        <span>Supply Chain Flow & Active Caravans ({activeFlowCaravans.length})</span>
                      </span>
                      <span className="text-[9px] font-mono text-stone-400">
                        Node-to-Node Price Equilibrium
                      </span>
                    </div>

                    {activeFlowCaravans.length === 0 ? (
                      <div className="p-3 rounded-xl bg-stone-900/40 text-stone-400 text-xs">
                        No active long-distance supply convoys on the roads.
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {activeFlowCaravans.slice(0, 5).map((c) => (
                          <div
                            key={c.id}
                            className="p-2.5 rounded-xl bg-stone-900/60 border border-white/5 space-y-1 text-xs"
                          >
                            <div className="flex justify-between items-center">
                              <span className="font-semibold text-stone-200">
                                {COMMODITY_ICONS[c.commodity as CommodityType] || '📦'} {c.commodity} Convoy
                              </span>
                              <span className="text-[10px] font-mono text-emerald-400">
                                {c.cargoUnits || 30} units · {c.cargoValue || 120}g
                              </span>
                            </div>
                            <div className="text-[10px] text-stone-400 flex items-center gap-1">
                              <span>{c.fromBurgName}</span>
                              <span>→</span>
                              <span className="text-amber-200">{c.toBurgName}</span>
                            </div>
                            <div className="w-full h-1 bg-black/60 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-sky-400 rounded-full"
                                style={{ width: `${Math.round(c.progress * 100)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* High-Value Commodities Grid */}
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400/90">
                      Realm Commodity Market Indices (Including Gold & Raw Wealth)
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {(Object.keys(COMMODITIES) as CommodityType[]).map((cType) => {
                        const market = burgMarket?.markets[cType];
                        const price = market?.currentPrice || (cType === 'Gold' ? 180 : cType === 'Silver' ? 90 : 20);
                        return (
                          <div
                            key={cType}
                            className={`p-2.5 rounded-xl border flex items-center justify-between ${
                              cType === 'Gold'
                                ? 'bg-amber-950/40 border-amber-500/60'
                                : 'bg-stone-900/60 border-white/5'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-base">{COMMODITY_ICONS[cType] || '📦'}</span>
                              <div>
                                <div className="font-semibold text-stone-200 text-xs">{cType}</div>
                                <div className="text-[10px] text-stone-400 font-mono">
                                  {market ? `Stock: ${Math.round(market.stockpile)}` : 'Stable Reserve'}
                                </div>
                              </div>
                            </div>
                            <span className="font-mono font-bold text-amber-300 text-xs">
                              {price.toFixed(1)}g
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Subtab 6: Crown Succession, Governance Pillars & Council Consensus */}
              {realmSubtab === 'laws' && (
                <CouncilConsensusPanel
                  world={world}
                  proposerId={ruler?.id || activeChar?.id}
                  onUpdateWorld={onUpdateWorld}
                  onNotify={(msg) => {
                    setNotificationMsg(msg);
                    setTimeout(() => setNotificationMsg(null), 4500);
                  }}
                />
              )}
            </div>
          )}

          {/* ==================================================== */}
          {/* 2. SETTLEMENT MODE (DEVELOPMENT & INFRASTRUCTURE)    */}
          {/* ==================================================== */}
          {panelMode === 'burg' && (
            <div className="space-y-5">
              {/* Development Level & Infrastructure Header Card */}
              <div className="p-4 rounded-xl bg-stone-900/70 border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400/90">
                      Development Level & Infrastructure
                    </span>
                    <h3 className="text-sm font-cinzel font-bold text-amber-100 mt-0.5">
                      {burg.name}
                    </h3>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-mono font-bold text-amber-300">
                      {devClamped}
                    </span>
                    <span className="text-[10px] text-stone-500 font-mono"> / 100</span>
                  </div>
                </div>

                {/* Styled Development Progress Bar */}
                <div className="space-y-1">
                  <div className="w-full h-2.5 bg-black/60 rounded-full overflow-hidden p-0.5 border border-white/5">
                    <div
                      className="h-full bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-300 rounded-full transition-all shadow-sm"
                      style={{ width: `${devClamped}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-mono text-stone-400">
                    <span className={devTier.color}>{devTier.label}</span>
                    <span className="text-emerald-400">
                      {burgTradeLedger ? `+${burgTradeLedger.monthlyDevGrowth.toFixed(2)} Dev / Mo` : '+0.25 Dev / Mo'}
                    </span>
                  </div>
                </div>

                {/* Development Economic Multipliers */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5 text-center font-mono">
                  <div className="p-1.5 rounded-lg bg-black/40">
                    <div className="text-[9px] text-stone-400">TAX BONUS</div>
                    <div className="font-bold text-emerald-300 text-xs">+{Math.round(devClamped * 0.8)}%</div>
                  </div>
                  <div className="p-1.5 rounded-lg bg-black/40">
                    <div className="text-[9px] text-stone-400">LEVY SIZE</div>
                    <div className="font-bold text-rose-300 text-xs">+{Math.round(devClamped * 1.2)}%</div>
                  </div>
                  <div className="p-1.5 rounded-lg bg-black/40">
                    <div className="text-[9px] text-stone-400">BUILD SLOTS</div>
                    <div className="font-bold text-sky-300 text-xs">
                      {(() => {
                        const bp = getSettlementBlueprint(burg.type);
                        const st = ensureBurgBuildingSlots(burg);
                        const built = bp.slots.filter((s) => (st[s.id]?.level || 0) > 0).length;
                        return `${built} / ${bp.maxSlots}`;
                      })()}
                    </div>
                  </div>
                </div>

                {/* Action: Develop Fief Infrastructure & City Plan */}
                {panelMode === 'burg' && (
                  <div className="pt-2 border-t border-white/5 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[11px] text-stone-400">
                      Clear land, build roads &amp; inspect the town layout.
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsCityMapOpen(true)}
                        className="px-2.5 py-1.5 rounded-lg border border-amber-500/50 bg-stone-950 hover:bg-stone-800 text-amber-200 font-medium text-xs whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
                      >
                        <MapIcon className="w-3.5 h-3.5 shrink-0" />
                        <span>View City Plan</span>
                      </button>
                      <button
                        onClick={handleDevelopFief}
                        className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm shrink-0"
                      >
                        <Hammer className="w-3.5 h-3.5 shrink-0" />
                        <span>Develop Fief (+4 Dev · 55g)</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Bespoke 9-Type Settlement Slot Tree, Devastation Rebuilding & Glacial Promotion */}
              <SettlementBlueprintPanel
                burg={burg}
                world={world}
                onUpdateWorld={onUpdateWorld}
                onOpenCityMap={() => setIsCityMapOpen(true)}
              />

              {/* Defined Municipal Area & Parish Territory Card */}
              {panelMode === 'burg' && (
                <div className="p-3.5 rounded-xl bg-sky-950/30 border border-sky-600/40 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-sky-400 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-sky-400" />
                      <span>Defined Municipal Area & Parish Fief</span>
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-sky-900/60 text-sky-200 border border-sky-500/40">
                      {burg.type}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center font-mono text-[10px]">
                    <div className="p-2 rounded-lg bg-black/40 border border-white/5">
                      <div className="text-stone-400">DEFINED AREA</div>
                      <div className="font-bold text-sky-300 text-xs mt-0.5">
                        {burg.areaKm2 ? `${burg.areaKm2.toLocaleString()} km²` : `${Math.round((burg.cellIndices?.length || 1) * 36)} km²`}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-black/40 border border-white/5">
                      <div className="text-stone-400">LAND CELLS</div>
                      <div className="font-bold text-amber-300 text-xs mt-0.5">
                        {burg.cellIndices?.length || 1} Parcels
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-black/40 border border-white/5">
                      <div className="text-stone-400">JURISDICTION</div>
                      <div className="font-bold text-emerald-300 text-xs mt-0.5 truncate">
                        {burg.isCapital ? 'Metropolitan' : 'Baronial / Civic'}
                      </div>
                    </div>
                  </div>

                  <p className="text-[10px] text-stone-300 italic">
                    The highlighted azure territory on the atlas delineates the municipal borders, tithe parishes, and agrarian commons legally chartered to {burg.name}.
                  </p>
                </div>
              )}

              {/* Systemic Economic Significance & Municipal Ledger Card */}
              {panelMode === 'burg' && burgEconomicLedger && (
                <div className="p-3.5 rounded-xl bg-stone-900/70 border border-amber-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400 flex items-center gap-1.5">
                      <Coins className="w-3.5 h-3.5 text-amber-400" />
                      <span>Economic Significance & Contributions</span>
                    </span>
                    <span className="font-mono text-emerald-400 text-xs font-bold">
                      +{burgEconomicLedger.netMonthlyGold}g / mo Net
                    </span>
                  </div>

                  <div className="grid grid-cols-2 divide-x divide-white/[0.07] border border-white/[0.07] rounded-md bg-stone-950/50 text-xs font-mono tabular-nums">
                    <div className="p-2.5">
                      <div className="text-[10px] text-stone-400">BASE LAND TAX</div>
                      <div className="font-bold text-emerald-300 text-sm mt-0.5">
                        +{burgEconomicLedger.baseTax.toFixed(1)}g
                      </div>
                      <div className="text-[10px] text-stone-500 font-sans">Demesne rents &amp; dues</div>
                    </div>
                    <div className="p-2.5">
                      <div className="text-[10px] text-stone-400">COMMERCIAL TOLLS</div>
                      <div className="font-bold text-sky-300 text-sm mt-0.5">
                        +{burgEconomicLedger.tradeTolls.toFixed(1)}g
                      </div>
                      <div className="text-[10px] text-stone-500 font-sans">Gates, docks &amp; duties</div>
                    </div>
                  </div>

                  {/* Feudal Tithe & Upkeep Breakdown */}
                  <div className="p-3 rounded-md bg-stone-950/45 border border-white/[0.07] space-y-1.5 font-mono tabular-nums text-[11px]">
                    <div className="flex items-center justify-between text-stone-300">
                      <span>Gross Municipal Revenue</span>
                      <span className="font-semibold text-amber-300">+{burgEconomicLedger.totalRevenue.toFixed(1)}g</span>
                    </div>
                    <div className="flex items-center justify-between text-rose-300/90">
                      <span>Feudal Tithe Owed to Liege</span>
                      <span className="font-semibold">-{burgEconomicLedger.titheToLiege.toFixed(1)}g</span>
                    </div>
                    <div className="flex items-center justify-between text-stone-400">
                      <span>Civic Works &amp; Maintenance</span>
                      <span>-{(burgEconomicLedger.civicMaintenance || 0.6).toFixed(1)}g</span>
                    </div>
                    <div className="flex items-center justify-between text-stone-400">
                      <span>Bailiff &amp; Chancery Overhead</span>
                      <span>-{(burgEconomicLedger.adminOverhead || 0.4).toFixed(1)}g</span>
                    </div>
                    <div className="flex items-center justify-between text-rose-300/80">
                      <span>Total Operating Expenses</span>
                      <span className="font-semibold">-{(burgEconomicLedger.totalExpenses || (burgEconomicLedger.titheToLiege + burgEconomicLedger.garrisonUpkeep + 1.0)).toFixed(1)}g</span>
                    </div>
                    <div className="pt-1.5 border-t border-white/[0.08] flex items-center justify-between text-emerald-300 font-semibold">
                      <span title="Peacetime net budget surplus">
                        Net Treasury Surplus
                      </span>
                      <span>+{burgEconomicLedger.netMonthlyGold.toFixed(1)}g</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 divide-x divide-white/[0.07] border border-white/[0.07] rounded-md bg-stone-950/50 text-[11px] font-mono tabular-nums">
                    <div className="p-2.5">
                      <div className="text-[10px] text-stone-400">LEVY CONTRIBUTION</div>
                      <div className="font-bold text-rose-300 text-xs mt-0.5">
                        {burgEconomicLedger.levyContribution.toLocaleString()} Swords
                      </div>
                    </div>
                    <div className="p-2.5">
                      <div className="text-[10px] text-stone-400">HARVEST SURPLUS</div>
                      <div className="font-bold text-emerald-300 text-xs mt-0.5">
                        +{burgEconomicLedger.foodSurplusMonthly} bu
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Municipal Council & Local Sworn Vassals Card */}
              {panelMode === 'burg' && (
                <div className="p-3.5 rounded-lg bg-stone-900/50 border border-white/[0.08] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase font-semibold tracking-wider text-amber-400/90 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-amber-400" />
                      <span>Municipal Council & Sworn Vassals</span>
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-stone-400">
                      {burgMunicipalVassals.length} Dignitaries
                    </span>
                  </div>

                  {burgMunicipalVassals.length > 0 ? (
                    <div className="divide-y divide-white/[0.06] border border-white/[0.07] rounded-md bg-stone-950/45">
                      {burgMunicipalVassals.map((vassal) => (
                        <div
                          key={vassal.id}
                          className="px-3 py-2 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-7 h-7 rounded-md bg-amber-950/50 border border-amber-600/30 flex items-center justify-center shrink-0">
                              {vassal.role === 'Lord Mayor' ? (
                                <Landmark className="w-3.5 h-3.5 text-amber-300" />
                              ) : vassal.role === 'Captain of the Guard' ? (
                                <Swords className="w-3.5 h-3.5 text-rose-300" />
                              ) : vassal.role === 'Master Artisan' ? (
                                <Scale className="w-3.5 h-3.5 text-emerald-300" />
                              ) : (
                                <Scroll className="w-3.5 h-3.5 text-sky-300" />
                              )}
                            </span>
                            <div className="min-w-0">
                              <div className="font-semibold text-stone-200 text-xs truncate">
                                {vassal.name}
                              </div>
                              <div className="text-[11px] text-amber-400/80 font-mono truncate">
                                {vassal.title || formatCharacterRoleLabel(vassal, world)}
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              onSelectCharacter?.(vassal);
                              setPanelMode('character');
                            }}
                            className="px-2.5 py-1 rounded-md bg-stone-800 hover:bg-stone-700 text-amber-300 border border-white/[0.08] text-[11px] font-medium transition-colors cursor-pointer shrink-0"
                          >
                            Dossier →
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-stone-400 text-xs italic">
                      Administered by the local bailiff under direct feudal oversight.
                    </p>
                  )}
                </div>
              )}

              {/* Ecological Carrying Capacity & Food Deficit Card */}
              {panelMode === 'burg' && carryingCapacityReport && (
                <div className={`p-4 rounded-lg border space-y-3 ${
                  burg.isStarving
                    ? 'bg-red-950/35 border-red-600/50'
                    : carryingCapacityReport.isOvercrowded
                    ? 'bg-amber-950/25 border-amber-600/40'
                    : 'bg-stone-900/50 border-white/[0.08]'
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[11px] uppercase font-semibold tracking-wider text-emerald-400 flex items-center gap-1.5">
                        <Scale className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Ecological Carrying Capacity</span>
                      </span>
                      <h4 className="text-xs font-semibold text-stone-200 mt-0.5">
                        {carryingCapacityReport.biome} Biosphere
                      </h4>
                    </div>
                    <div className="text-right">
                      <span className={`text-[11px] font-semibold font-mono ${
                        burg.isStarving
                          ? 'text-red-400'
                          : carryingCapacityReport.isOvercrowded
                          ? 'text-amber-300'
                          : 'text-emerald-400'
                      }`}>
                        {burg.isStarving ? 'Starving & Blockaded' : carryingCapacityReport.statusLabel}
                      </span>
                    </div>
                  </div>

                  {/* Population vs Capacity Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-mono tabular-nums">
                      <span className="text-stone-300">
                        {carryingCapacityReport.currentPopulation.toLocaleString()} souls
                      </span>
                      <span className="text-stone-400">
                        Limit: {carryingCapacityReport.totalCapacity.toLocaleString()}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-stone-950 rounded-full overflow-hidden border border-white/[0.06]">
                      <div
                        className={`h-full rounded-full transition-all ${
                          carryingCapacityReport.overcrowdingRatio > 1.2
                            ? 'bg-red-500'
                            : carryingCapacityReport.overcrowdingRatio > 1.0
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, carryingCapacityReport.overcrowdingRatio * 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Stats Grid: Food Balance, Overcrowding & Plague Risk */}
                  <div className="grid grid-cols-3 divide-x divide-white/[0.07] border border-white/[0.07] rounded-md bg-stone-950/50 text-center font-mono tabular-nums text-[10px]">
                    <div className="p-2">
                      <div className="text-stone-400">FOOD BALANCE</div>
                      <div className={`font-bold text-xs mt-0.5 ${carryingCapacityReport.foodBalance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {carryingCapacityReport.foodBalance >= 0 ? `+${carryingCapacityReport.foodBalance}` : carryingCapacityReport.foodBalance} bu/mo
                      </div>
                    </div>
                    <div className="p-2">
                      <div className="text-stone-400">PLAGUE RISK</div>
                      <div className={`font-bold text-xs mt-0.5 ${carryingCapacityReport.epidemicRiskMultiplier > 1.2 ? 'text-rose-400' : 'text-stone-300'}`}>
                        x{carryingCapacityReport.epidemicRiskMultiplier.toFixed(2)}
                      </div>
                    </div>
                    <div className="p-2">
                      <div className="text-stone-400">INFRA BONUS</div>
                      <div className="font-bold text-sky-300 text-xs mt-0.5">
                        +{carryingCapacityReport.infrastructureBonus.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {burg.demographics && (
                    <div className="pt-2 border-t border-white/[0.07] space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                        <span className="text-stone-400 uppercase">Social Estates ({burg.demographics.urbanSharePct}% Urban)</span>
                        <span className={burg.demographics.annualGrowthRatePct >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                          {burg.demographics.annualGrowthRatePct >= 0 ? '+' : ''}{burg.demographics.annualGrowthRatePct}% / yr
                        </span>
                      </div>
                      <div className="grid grid-cols-4 divide-x divide-white/[0.07] border border-white/[0.07] rounded-md bg-stone-950/45 text-center font-mono tabular-nums text-[11px]">
                        <div className="py-1.5 px-1">
                          <div className="text-[10px] text-stone-400">PEASANTS</div>
                          <div className="text-stone-200 font-semibold">{burg.demographics.peasantry.toLocaleString()}</div>
                        </div>
                        <div className="py-1.5 px-1">
                          <div className="text-[10px] text-stone-400">ARTISANS</div>
                          <div className="text-amber-300 font-semibold">{burg.demographics.artisans.toLocaleString()}</div>
                        </div>
                        <div className="py-1.5 px-1">
                          <div className="text-[10px] text-stone-400">CLERGY</div>
                          <div className="text-sky-300 font-semibold">{burg.demographics.clergy.toLocaleString()}</div>
                        </div>
                        <div className="py-1.5 px-1">
                          <div className="text-[10px] text-stone-400">SOLDIERY</div>
                          <div className="text-rose-300 font-semibold">{burg.demographics.soldiery.toLocaleString()}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {burg.isStarving && (
                    <div className="p-2 rounded-lg bg-red-950/60 border border-red-700/60 text-[11px] text-red-200 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                      <span>Supply lines severed! Garrison morale decaying -15%/mo until Grain arrives.</span>
                    </div>
                  )}
                </div>
              )}

              {/* Feudal Lordship & Demesne Holder Card */}
              {panelMode === 'burg' && (
                <div className="p-3.5 rounded-xl bg-stone-900/60 border border-white/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400/90 flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-amber-400" />
                      <span>Feudal Lord & Fiefholder</span>
                    </span>
                    {burg.rulerTitle && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-black/40 text-amber-300 border border-amber-800/40">
                        {burg.rulerTitle}
                      </span>
                    )}
                  </div>

                  {(() => {
                    const burgLord = world.characters.find((c) => c.id === burg.ownerId);
                    if (!burgLord) {
                      return (
                        <div className="text-stone-400 text-xs italic">
                          Crown Demesne fief held directly by the sovereign monarch.
                        </div>
                      );
                    }
                    return (
                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-9 h-9 rounded-lg bg-purple-950/60 border border-purple-700/40 flex items-center justify-center shrink-0">
                            <User className="w-4 h-4 text-purple-300" />
                          </span>
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => {
                                onSelectCharacter(burgLord);
                                handleSwitchTab('character');
                              }}
                              className="font-semibold text-amber-200 hover:text-amber-100 hover:underline text-xs truncate text-left cursor-pointer"
                            >
                              {burgLord.name}
                            </button>
                            <div className="text-[11px] text-stone-400 font-mono truncate">
                              {getCharacterRankTitle(burgLord, world)} ·{' '}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (burgLord.houseName) onOpenHouse?.(burgLord.houseName);
                                }}
                                className="text-amber-300 hover:text-amber-200 underline decoration-amber-500/40 cursor-pointer"
                              >
                                House {burgLord.houseName || 'Noble'}
                              </button>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            onSelectCharacter(burgLord);
                            handleSwitchTab('character');
                          }}
                          className="px-2.5 py-1 rounded-md bg-stone-800 hover:bg-stone-700 text-amber-300 border border-white/[0.08] text-[11px] font-medium transition-colors cursor-pointer shrink-0"
                        >
                          Lord Dossier →
                        </button>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Garrisons vs Levies Systemic Military Ledger */}
              {panelMode === 'burg' && burgGarrison && (
                <div className="p-3.5 rounded-lg bg-stone-900/50 border border-white/[0.08] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase font-semibold tracking-wider text-amber-400/90 flex items-center gap-1.5">
                      <Swords className="w-3.5 h-3.5 text-rose-400" />
                      <span>Standing Garrison &amp; Levies</span>
                    </span>
                    <span
                      className={`text-[11px] font-mono font-semibold ${
                        burgGarrison.leviesRaised ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {burgGarrison.leviesRaised ? 'Levies Mobilized' : 'Levies at Rest'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 divide-x divide-white/[0.07] border border-white/[0.07] rounded-md bg-stone-950/50 text-xs font-mono tabular-nums">
                    <div className="p-2.5">
                      <div className="text-[10px] text-stone-400">CITADEL GARRISON</div>
                      <div className="font-bold text-sky-300 text-sm mt-0.5">
                        {burgGarrison.garrisonCount} / {burgGarrison.garrisonMax}
                      </div>
                      <div className="text-[10px] text-stone-500 mt-1 font-sans">
                        Upkeep: {burgGarrison.upkeepGold}g · {burgGarrison.upkeepFood} food/mo
                      </div>
                    </div>
                    <div className="p-2.5">
                      <div className="text-[10px] text-stone-400">CONSCRIPT LEVY POOL</div>
                      <div className="font-bold text-rose-300 text-sm mt-0.5">
                        {burgGarrison.levyPool.toLocaleString()} Men
                      </div>
                      <div className="text-[10px] text-stone-500 mt-1 font-sans">
                        {burgGarrison.leviesRaised ? 'Fighting in field' : 'Working farmlands'}
                      </div>
                    </div>
                  </div>

                  {burgGarrison.leviesRaised && (
                    <div className="p-2 rounded-lg bg-rose-950/60 border border-rose-800/80 text-[11px] text-rose-200 flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <strong>Economic Campaign Penalty Active!</strong>
                        <div className="text-[10px] text-rose-300">
                          -35% Seasonal Harvest (farmers in field) · -20% Market Taxes. Disband when war concludes.
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleToggleLevies}
                    className={`w-full py-2 rounded-xl font-medium text-xs transition-colors cursor-pointer border flex items-center justify-center gap-2 ${
                      burgGarrison.leviesRaised
                        ? 'bg-stone-800 hover:bg-stone-700 text-emerald-300 border-emerald-600/40'
                        : 'bg-rose-950/70 hover:bg-rose-900/80 text-rose-200 border-rose-700/60'
                    }`}
                  >
                    <Flag className="w-3.5 h-3.5" />
                    <span>
                      {burgGarrison.leviesRaised
                        ? `Disband Conscript Levies (Restore Harvest & Trade)`
                        : `Muster ${burgGarrison.levyPool.toLocaleString()} Levies (Inflicts Harvest Penalty)`}
                    </span>
                  </button>
                </div>
              )}

              {/* Trade Economy, Commodities & Import Fulfillment */}
              {panelMode === 'burg' && burgTradeLedger && (
                <div className="p-3.5 rounded-xl bg-stone-900/60 border border-white/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400/90 flex items-center gap-1.5">
                      <Coins className="w-3.5 h-3.5 text-amber-400" />
                      <span>Trade Economy Ledger & Import Demands</span>
                    </span>
                    <span className="font-mono text-emerald-400 text-xs font-bold">
                      {burgTradeLedger.fulfillmentRate}% Fulfilled
                    </span>
                  </div>

                  <div className="space-y-2">
                    {/* Exports */}
                    <div>
                      <div className="text-[10px] text-stone-400 uppercase font-mono mb-1">
                        Export Goods Produced:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {burgTradeLedger.exports.map((item) => (
                          <span
                            key={item}
                            className="px-2 py-0.5 rounded-lg bg-black/40 border border-emerald-700/50 text-emerald-200 text-xs flex items-center gap-1"
                          >
                            <span>{COMMODITY_ICONS[item as CommodityType] || '📦'}</span>
                            <span>{item}</span>
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Imports */}
                    <div>
                      <div className="text-[10px] text-stone-400 uppercase font-mono mb-1">
                        Import Goods Demanded by Citizens:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {burgTradeLedger.imports.map((item) => (
                          <span
                            key={item}
                            className="px-2 py-0.5 rounded-lg bg-black/40 border border-amber-700/50 text-amber-200 text-xs flex items-center gap-1"
                          >
                            <span>{COMMODITY_ICONS[item as CommodityType] || '📦'}</span>
                            <span>{item}</span>
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Fulfillment Progress */}
                    <div className="space-y-1 pt-1">
                      <div className="w-full h-1.5 bg-black/60 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all"
                          style={{ width: `${burgTradeLedger.fulfillmentRate}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-stone-400 italic">
                        {burgTradeLedger.growthDescription}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Royal Settlement Charter Founding Button */}
              <div className="p-4 rounded-xl bg-stone-900/80 border border-amber-600/30 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-cinzel font-bold text-amber-100 text-xs">
                      Royal Settlement Charter
                    </h4>
                    <p className="text-[11px] text-stone-400 mt-0.5">
                      Establish new castles, ports, or cities in uninhabited frontier lands.
                    </p>
                  </div>
                  <button
                    onClick={() => setIsCharterModalOpen(true)}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm shrink-0"
                  >
                    <Crown className="w-3.5 h-3.5" />
                    <span>Issue Charter (150g)</span>
                  </button>
                </div>
              </div>

              {/* Local Commodity Market Prices */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400/90 flex items-center gap-1.5">
                    <Coins className="w-3.5 h-3.5 text-amber-500" />
                    <span>Local Commodity Exchange (Coinage Prices)</span>
                  </span>
                  <span className="text-[10px] font-mono text-stone-400">
                    Tariff: {Math.round((burgMarket?.tariffRate || 0.05) * 100)}%
                  </span>
                </div>

                {burgMarket ? (
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(burgMarket.markets).map(([commKey, market]) => {
                      const isHigh = market.currentPrice > market.basePrice * 1.1;
                      const isLow = market.currentPrice < market.basePrice * 0.9;
                      return (
                        <div
                          key={commKey}
                          className={`p-2.5 rounded-xl border flex items-center justify-between ${
                            commKey === 'Gold'
                              ? 'bg-amber-950/30 border-amber-600/40'
                              : 'bg-stone-900/60 border-white/5'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-base">{COMMODITY_ICONS[commKey as CommodityType] || '📦'}</span>
                            <div>
                              <div className="font-semibold text-stone-200 text-[11px]">{commKey}</div>
                              <div className="text-[10px] text-stone-400 font-mono">
                                Stock: {Math.round(market.stockpile)}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono font-bold text-stone-200 text-xs flex items-center gap-1 justify-end">
                              <span>{market.currentPrice.toFixed(1)}g</span>
                              {isHigh ? (
                                <TrendingUp className="w-3 h-3 text-rose-400" />
                              ) : isLow ? (
                                <TrendingDown className="w-3 h-3 text-emerald-400" />
                              ) : null}
                            </div>
                            <div className="text-[9px] font-mono text-stone-500">
                              +{market.monthlyProduction}/mo
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-stone-900/40 text-stone-400 text-center text-xs">
                    Local market ledger compiling.
                  </div>
                )}
              </div>

              {/* Physical Commodity Barter Exchange Board */}
              <div className="p-3.5 rounded-xl bg-stone-900/70 border border-emerald-500/30 space-y-3 shadow-md">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <Wheat className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Direct Physical Barter Board</span>
                  </span>
                  <div className="flex items-center gap-2 font-mono text-[10px]">
                    <span className="text-stone-400">Barter Share:</span>
                    <span className="font-bold text-amber-300">
                      {Math.round(burgBarterShare * 100)}%
                    </span>
                    <span className="text-stone-500">|</span>
                    <span className="text-stone-400">Coin:</span>
                    <span className="font-bold text-sky-300">
                      {Math.round((1 - burgBarterShare) * 100)}%
                    </span>
                  </div>
                </div>

                {/* Barter vs Coin Ratio Progress Bar */}
                <div className="space-y-1">
                  <div className="h-2 w-full bg-stone-950 rounded-full overflow-hidden flex border border-white/5">
                    <div
                      className="bg-emerald-500 transition-all duration-300"
                      style={{ width: `${Math.round(burgBarterShare * 100)}%` }}
                      title={`Direct Barter: ${Math.round(burgBarterShare * 100)}%`}
                    />
                    <div
                      className="bg-sky-500 transition-all duration-300"
                      style={{ width: `${Math.round((1 - burgBarterShare) * 100)}%` }}
                      title={`Minted Specie: ${Math.round((1 - burgBarterShare) * 100)}%`}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-stone-400">
                    <span>Direct Goods Barter (Rural Self-Sufficiency)</span>
                    <span>Minted Coinage (Commercial Guilds)</span>
                  </div>
                </div>

                {/* Active Direct Barter Swaps */}
                <div className="space-y-2 pt-1">
                  <div className="text-[10px] uppercase font-semibold tracking-wider text-stone-400">
                    Prevailing Physical Exchange Ratios & Swaps
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {burgBarterTransactions.map((tx) => (
                      <div
                        key={tx.id}
                        className="p-2.5 rounded-md bg-stone-950/50 border border-white/[0.07] flex items-center justify-between"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-200">
                            <span>{COMMODITY_ICONS[tx.offeredGood] || '·'} {tx.offeredAmount} {tx.offeredGood}</span>
                            <span className="text-stone-500">⇄</span>
                            <span>{COMMODITY_ICONS[tx.demandedGood] || '·'} {tx.demandedAmount} {tx.demandedGood}</span>
                          </div>
                          <div className="text-[10px] font-mono tabular-nums text-stone-400">
                            Ratio: 1 {tx.offeredGood} = {(tx.demandedAmount / Math.max(1, tx.offeredAmount)).toFixed(2)} {tx.demandedGood}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-mono uppercase text-emerald-300">
                            {tx.reason.includes('Perishable') ? 'Perishable Disc.' : 'Direct Swap'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* 3. COUNTY / DUCHY MODE                               */}
          {/* ==================================================== */}
          {panelMode === 'county' && (() => {
            const isDuchyView = county.tier === 'Duchy' || county.name.includes('Duchy');
            const parentDuchy =
              !isDuchyView && county.duchyId
                ? world.counties.find(
                    (c) => (c.tier === 'Duchy' || c.name.includes('Duchy')) && c.duchyId === county.duchyId
                  )
                : undefined;
            const constituentCounties = isDuchyView && county.duchyId
              ? world.counties.filter((c) => c.duchyId === county.duchyId && c.id !== county.id)
              : [];
            const countyLord = world.characters.find((c) => c.id === county.rulerId);
            const lordVassals = countyLord
              ? world.characters.filter((v) => v.isAlive !== false && v.liegeId === countyLord.id)
              : [];

            return (
              <div className="space-y-4">
                {/* County / Duchy Strategic Jurisdiction Card */}
                <div className="p-4 rounded-lg bg-stone-900/50 border border-white/[0.08] space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <HeraldryShield
                        coatOfArms={county.coatOfArms || countyLord?.coatOfArms || realm.heraldry}
                        seed={`county_${county.id}_${county.name}`}
                        size={40}
                      />
                      <div className="min-w-0">
                        <span className="text-[10px] uppercase font-semibold tracking-wider text-emerald-400 flex items-center gap-1.5">
                          <Shield className={`w-3.5 h-3.5 ${isDuchyView ? 'text-amber-400' : 'text-emerald-400'}`} />
                          <span>{isDuchyView ? 'Ducal Jurisdiction (Duke-Ruled)' : 'County / Earldom Fiefdom'}</span>
                        </span>
                        <h3 className="text-base font-cinzel font-bold text-amber-100 mt-0.5 truncate">
                          {county.name.startsWith('Grand Duchy') || county.name.startsWith('Duchy') || county.name.startsWith('Royal Duchy') || county.name.startsWith('Crown Demesne') || county.name.startsWith('Earldom') || county.name.startsWith('County')
                            ? county.name
                            : `${isDuchyView ? 'Duchy of' : 'County of'} ${county.name}`}
                        </h3>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-[11px] font-mono font-semibold ${isDuchyView ? 'text-amber-300' : 'text-emerald-300'}`}>
                        {isDuchyView ? 'Duchy' : county.tier || 'County'}
                      </span>
                      <div className="text-[11px] text-stone-400 font-mono mt-0.5">
                        {realm.name}
                      </div>
                    </div>
                  </div>

                  {parentDuchy && parentDuchy.id !== county.id && (
                    <button
                      type="button"
                      onClick={() => onSelectCounty(parentDuchy)}
                      className="w-full p-2 rounded-md bg-amber-950/35 hover:bg-amber-950/55 border border-amber-700/40 flex items-center justify-between text-xs cursor-pointer transition-colors"
                    >
                      <span className="text-amber-200 font-medium">
                        Sworn under {parentDuchy.name}
                      </span>
                      <span className="text-[11px] text-amber-400 font-mono">Inspect Duchy →</span>
                    </button>
                  )}

                  {/* County Demographics & Strategic Resources */}
                  <div className="grid grid-cols-3 divide-x divide-white/[0.07] border border-white/[0.07] rounded-md bg-stone-950/50 font-mono tabular-nums text-[11px] text-center">
                    <div className="p-2">
                      <div className="text-stone-400 uppercase text-[10px]">
                        {isDuchyView ? 'Vassal Counties' : 'Tradition'}
                      </div>
                      <div className="text-amber-200 font-bold truncate mt-0.5">
                        {isDuchyView
                          ? `${constituentCounties.length + 1} Counties`
                          : county.tradition || 'Feudal Law'}
                      </div>
                    </div>
                    <div className="p-2">
                      <div className="text-stone-400 uppercase text-[10px]">Fief Holdings</div>
                      <div className="text-emerald-300 font-bold mt-0.5">
                        {world.burgs.filter((b) => b.countyId === county.id).length} Baronies
                      </div>
                    </div>
                    <div className="p-2">
                      <div className="text-stone-400 uppercase text-[10px]">Urban Souls</div>
                      <div className="text-sky-300 font-bold mt-0.5">
                        {world.burgs
                          .filter((b) =>
                            isDuchyView && county.duchyId
                              ? constituentCounties.some((cc) => cc.id === b.countyId) || b.countyId === county.id
                              : b.countyId === county.id
                          )
                          .reduce((sum, b) => sum + (b.population < 50 ? Math.round(b.population * 1000) : b.population), 0)
                          .toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Duchy's Subordinate Vassal Counties (Earls & Counts under the Duke) */}
                {isDuchyView && constituentCounties.length > 0 && (
                  <div className="p-4 rounded-lg bg-stone-900/50 border border-white/[0.08] space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] uppercase font-semibold tracking-wider text-amber-400">
                        Sworn Vassal Counties & Earldoms ({constituentCounties.length})
                      </span>
                    </div>
                    <div className="divide-y divide-white/[0.06] border border-white/[0.07] rounded-md bg-stone-950/45">
                      {constituentCounties.map((vc) => {
                        const vcLord = world.characters.find((c) => c.id === vc.rulerId);
                        return (
                          <div
                            key={vc.id}
                            onClick={() => onSelectCounty(vc)}
                            className="p-2.5 hover:bg-stone-800/50 flex items-center justify-between gap-2 cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <HeraldryShield
                                coatOfArms={vc.coatOfArms || vcLord?.coatOfArms || realm.heraldry}
                                seed={`county_${vc.id}_${vc.name}`}
                                size={26}
                              />
                              <div className="min-w-0">
                                <div className="font-semibold text-amber-100 text-xs truncate">
                                  {vc.name}
                                </div>
                                <div className="text-[11px] text-stone-400 truncate mt-0.5">
                                  {vcLord ? `${vcLord.title} · ${vcLord.name}` : 'Vacant County'} · Dev {vc.development}
                                </div>
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-stone-500 shrink-0" />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Ruling Duke / Count / Monarch Card */}
                {countyLord && (() => {
                  const cLordStanding = calculateCharacterFeudalStanding(countyLord, world);
                  const opinionOfRuler = countyLord.opinions[ruler.id] ?? 25;
                  const isMonarch = countyLord.titleTier === 'King' || countyLord.titleTier === 'Emperor';
                  const isDuke = countyLord.titleTier === 'Duke' || isDuchyView;

                  return (
                    <div className="p-4 rounded-lg bg-stone-900/50 border border-white/[0.08] space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] uppercase font-semibold tracking-wider text-amber-400 flex items-center gap-1.5">
                          <Crown className="w-3.5 h-3.5 text-amber-400" />
                          <span>
                            {isMonarch
                              ? 'Crown Demesne Ruler'
                              : isDuke
                              ? 'Ruling Duke & Liege Lord'
                              : 'Ruling Earl / Count & Liege'}
                          </span>
                        </span>
                        <button
                          onClick={() => {
                            onSelectCharacter(countyLord);
                            handleSwitchTab('character');
                          }}
                          className="px-2.5 py-1 rounded-md bg-emerald-700 hover:bg-emerald-600 text-white font-medium text-xs transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <span>Inspect {isMonarch ? 'Monarch' : isDuke ? 'Duke' : 'Count'}</span>
                          <span>→</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-3">
                        <HeraldryShield
                          coatOfArms={countyLord.coatOfArms}
                          unheralded={!countyLord.coatOfArms}
                          seed={`${countyLord.realmId}_${countyLord.houseName}_${countyLord.id}`}
                          size={40}
                        />
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => {
                              onSelectCharacter(countyLord);
                              handleSwitchTab('character');
                            }}
                            className="font-cinzel font-bold text-amber-200 hover:text-amber-100 hover:underline text-sm truncate text-left cursor-pointer"
                          >
                            {countyLord.name}
                          </button>
                          <div className="text-[11px] text-stone-300 font-mono truncate flex items-center gap-1.5 mt-0.5">
                            <span className="text-emerald-400 font-semibold">{countyLord.title || `Count of ${county.name}`}</span>
                            <span className="text-stone-600">·</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (countyLord.houseName) onOpenHouse?.(countyLord.houseName);
                              }}
                              className="text-amber-300 hover:text-amber-200 underline decoration-amber-500/40 cursor-pointer"
                            >
                              House {countyLord.houseName}
                            </button>
                          </div>
                          {countyLord.houseMotto && (
                            <div className="text-[11px] text-amber-300/80 italic truncate mt-0.5">
                              "{countyLord.houseMotto}"
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Feudal Standing Ribbon */}
                      <div className="grid grid-cols-3 divide-x divide-white/[0.07] border border-white/[0.07] rounded-md bg-stone-950/50 font-mono tabular-nums text-[11px]">
                        <div className="p-2">
                          <div className="text-stone-400 uppercase text-[10px]">Domain Levies</div>
                          <div className="text-emerald-300 font-bold mt-0.5">
                            {cLordStanding.totalLevies.toLocaleString()} Host
                          </div>
                        </div>
                        <div className="p-2">
                          <div className="text-stone-400 uppercase text-[10px]">Vault Treasury</div>
                          <div className="text-amber-300 font-bold mt-0.5">
                            {countyLord.treasury ?? 350}g
                          </div>
                        </div>
                        <div className="p-2">
                          <div className="text-stone-400 uppercase text-[10px]">Crown Opinion</div>
                          <div className={`font-bold mt-0.5 ${opinionOfRuler >= 20 ? 'text-emerald-400' : opinionOfRuler < 0 ? 'text-rose-400' : 'text-amber-300'}`}>
                            {opinionOfRuler >= 0 ? `+${opinionOfRuler}` : opinionOfRuler} Loyal
                          </div>
                        </div>
                      </div>

                      {/* Direct Subordinate Vassals (Barons, Mayors, Guildmasters, Portmasters) */}
                      {lordVassals.length > 0 && (
                        <div className="pt-2 border-t border-white/[0.07] space-y-1.5">
                          <div className="text-[10px] uppercase font-semibold text-stone-400">
                            Sworn Direct Vassals ({lordVassals.length})
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {lordVassals.slice(0, 8).map((v) => (
                              <button
                                key={v.id}
                                type="button"
                                onClick={() => {
                                  onSelectCharacter(v);
                                  handleSwitchTab('character');
                                }}
                                className="px-2 py-0.5 rounded bg-stone-950/70 hover:bg-stone-800 border border-white/[0.08] text-[11px] text-stone-200 cursor-pointer"
                              >
                                <span className="text-amber-300 font-mono">{formatCharacterRoleLabel(v, world)}:</span> {v.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* County Baronies & Fiefs List */}
                <div className="p-4 rounded-lg bg-stone-900/50 border border-white/[0.08] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase font-semibold tracking-wider text-amber-400/90 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>Baronies & Municipal Fiefs</span>
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-stone-400">
                      {world.burgs.filter((b) => b.countyId === county.id).length} Holdings
                    </span>
                  </div>

                  <div className="divide-y divide-white/[0.06] border border-white/[0.07] rounded-md bg-stone-950/45">
                    {world.burgs.filter((b) => b.countyId === county.id).length === 0 ? (
                      <div className="text-stone-400 text-xs italic p-3 text-center">
                        Rural countryside with agrarian hamlets and manors.
                      </div>
                    ) : (
                      world.burgs.filter((b) => b.countyId === county.id).map((b) => {
                        const bLord = world.characters.find((c) => c.id === b.ownerId);
                        return (
                          <div
                            key={b.id}
                            onClick={() => {
                              onSelectBurg(b);
                              handleSwitchTab('burg');
                            }}
                            className="p-2.5 hover:bg-stone-800/50 flex items-center justify-between cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="shrink-0 text-stone-400">
                                {b.type.includes('Port') ? (
                                  <Anchor className="w-4 h-4 text-sky-400" />
                                ) : b.type.includes('Citadel') || b.type.includes('Fortress') ? (
                                  <Castle className="w-4 h-4 text-amber-400" />
                                ) : (
                                  <Building2 className="w-4 h-4 text-emerald-400" />
                                )}
                              </span>
                              <div className="min-w-0">
                                <div className="font-semibold text-stone-200 text-xs truncate flex items-center gap-2">
                                  <span>{b.name}</span>
                                  <span className="text-[10px] text-amber-300 font-mono">
                                    · {b.type}
                                  </span>
                                </div>
                                <div className="text-[11px] text-stone-400 truncate mt-0.5">
                                  Pop {(b.population < 50 ? Math.round(b.population * 1000) : b.population).toLocaleString()} · {b.tradeGood} · {bLord ? `${formatCharacterRoleLabel(bLord, world)} ${bLord.name}` : 'Crown Bailiff'}
                                </div>
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-stone-500 shrink-0" />
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ==================================================== */}
          {/* 4. CHARACTER / NOBLE MODE                            */}
          {/* ==================================================== */}
          {panelMode === 'character' && (
            <div className="space-y-4">
              {/* Feudal Standing & Power Metrics Ribbon */}
              <div className="grid grid-cols-3 divide-x divide-y divide-white/[0.07] border border-white/[0.08] rounded-lg bg-stone-900/45 font-mono tabular-nums">
                {/* 1. Treasury & Monthly Income */}
                <div className="p-2.5 flex flex-col items-center justify-center text-center">
                  <span className="text-[10px] text-amber-400 font-semibold flex items-center gap-1 font-sans">
                    <Coins className="w-3 h-3 text-amber-400" />
                    <span>Privy Purse</span>
                  </span>
                  <span className="text-sm font-bold text-amber-300 mt-0.5">
                    {Math.round((activeChar.treasury ?? 0) * 10) / 10}g
                  </span>
                  <span className={`text-[10px] ${(fiscal ? fiscal.netMonthlyCashflow : (feudalStanding?.monthlyNetIncome || 0)) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {fiscal
                      ? `${fiscal.netMonthlyCashflow >= 0 ? '+' : ''}${fiscal.netMonthlyCashflow.toFixed(1)}/mo`
                      : feudalStanding
                      ? `${feudalStanding.monthlyNetIncome >= 0 ? '+' : ''}${feudalStanding.monthlyNetIncome.toFixed(1)}/mo`
                      : '+0.0/mo'}
                  </span>
                </div>

                {/* 2. Feudal Power Score */}
                <div className="p-2.5 flex flex-col items-center justify-center text-center">
                  <span className="text-[10px] text-yellow-300 font-semibold flex items-center gap-1 font-sans">
                    <Crown className="w-3 h-3 text-yellow-300" />
                    <span>Power</span>
                  </span>
                  <span className="text-sm font-bold text-yellow-100 mt-0.5">
                    {feudalStanding ? feudalStanding.feudalPowerScore.toLocaleString() : (gravitas || 120)}
                  </span>
                  <span className="text-[10px] text-stone-400">
                    {feudalStanding?.demesneHoldingsCount ? `${feudalStanding.demesneHoldingsCount} Fiefs` : 'Landless'}
                  </span>
                </div>

                {/* 3. Total Feudal Levies */}
                <div className="p-2.5 flex flex-col items-center justify-center text-center">
                  <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1 font-sans">
                    <Users className="w-3 h-3 text-emerald-400" />
                    <span>Total Levy</span>
                  </span>
                  <span className="text-sm font-bold text-emerald-300 mt-0.5">
                    {feudalStanding ? feudalStanding.totalLevies.toLocaleString() : (activeChar.menAtArms ?? 150).toLocaleString()}
                  </span>
                  <span className="text-[10px] text-stone-400">
                    {feudalStanding ? `${feudalStanding.menAtArms} MaA` : 'Host'}
                  </span>
                </div>

                {/* 4. Prestige */}
                <div className="p-2.5 flex flex-col items-center justify-center text-center">
                  <span className="text-[10px] text-sky-300 font-semibold flex items-center gap-1 font-sans">
                    <Award className="w-3 h-3 text-sky-300" />
                    <span>Prestige</span>
                  </span>
                  <span className="text-sm font-bold text-sky-100 mt-0.5">
                    {activeChar.prestige ?? 450}
                  </span>
                  <span className="text-[10px] text-stone-400">Dynasty</span>
                </div>

                {/* 5. Piety */}
                <div className="p-2.5 flex flex-col items-center justify-center text-center">
                  <span className="text-[10px] text-purple-400 font-semibold flex items-center gap-1 font-sans">
                    <Sparkles className="w-3 h-3 text-purple-400" />
                    <span>Piety</span>
                  </span>
                  <span className="text-sm font-bold text-purple-100 mt-0.5">
                    {activeChar.piety ?? 220}
                  </span>
                  <span className="text-[10px] text-stone-400">Devotion</span>
                </div>

                {/* 6. Dread / Stress */}
                <div className="p-2.5 flex flex-col items-center justify-center text-center">
                  <span className="text-[10px] text-rose-400 font-semibold flex items-center gap-1 font-sans">
                    <Skull className="w-3 h-3 text-rose-400" />
                    <span>Dread</span>
                  </span>
                  <span className="text-sm font-bold text-rose-300 mt-0.5">
                    {activeChar.dread ?? 15}
                  </span>
                  <span className="text-[10px] text-stone-400">Stress L{activeChar.stressLevel ?? 0}</span>
                </div>
              </div>

              {/* Feudal Chain of Fealty Breadcrumb */}
              <div className="p-3.5 rounded-lg bg-stone-900/50 border border-white/[0.08] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase font-semibold tracking-wider text-amber-400/90 flex items-center gap-1.5">
                    <Crown className="w-3.5 h-3.5 text-amber-400" />
                    <span>Feudal Chain of Fealty</span>
                  </span>
                  <span className="text-[11px] font-mono tabular-nums text-stone-400">
                    {fealtyChain.length} Ranks
                  </span>
                </div>
                <div className="flex items-center flex-wrap gap-1.5 text-xs">
                  {fealtyChain.slice().reverse().map((node, idx, arr) => {
                    const isSelected = node.id === activeChar.id;
                    const TierIcon =
                      node.titleTier === 'King' || node.titleTier === 'Emperor' ? Crown :
                      node.titleTier === 'Duke' ? Castle :
                      node.titleTier === 'Count' ? Shield : Scroll;

                    return (
                      <React.Fragment key={node.id}>
                        <button
                          onClick={() => onSelectCharacter(node)}
                          className={`px-2 py-1 rounded-md border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-amber-600/80 border-amber-400 text-white'
                              : 'bg-stone-950/70 border-white/[0.08] text-stone-300 hover:text-amber-200 hover:border-amber-500/40'
                          }`}
                        >
                          <TierIcon className="w-3 h-3 shrink-0" />
                          <span className="truncate max-w-[110px]">{node.name.split(' ')[0]}</span>
                          <span className="text-[10px] opacity-75 font-mono">({getCharacterRankTitle(node, world)})</span>
                        </button>
                        {idx < arr.length - 1 && (
                          <ChevronRight className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>

              {/* Held Fiefs & Domains (Clickable Hyperlinks to Realms, Duchies, Counties & Settlements) */}
              {(() => {
                const ruledRealms = (world.realms || []).filter((r) => r.rulerId === activeChar.id);
                const ruledCounties = (world.counties || []).filter((c) => c.rulerId === activeChar.id);
                const ownedBurgs = (world.burgs || []).filter((b) => b.ownerId === activeChar.id);
                const homeRealm = world.realms.find((r) => r.id === activeChar.realmId);
                const homeCounty = activeChar.countyId
                  ? world.counties.find((c) => c.id === activeChar.countyId)
                  : undefined;
                const totalHeld = ruledRealms.length + ruledCounties.length + ownedBurgs.length;

                return (
                  <div className="p-3.5 rounded-xl bg-stone-900/70 border border-white/5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400/90 flex items-center gap-1.5">
                        <Castle className="w-3.5 h-3.5 text-amber-400" />
                        <span>Held Fiefs &amp; Domains</span>
                      </span>
                      <span className="text-[10px] font-mono text-stone-400">
                        {totalHeld > 0 ? `${totalHeld} Fief${totalHeld === 1 ? '' : 's'}` : 'Unlanded Courtier'}
                      </span>
                    </div>

                    {totalHeld > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {ruledRealms.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => {
                              onSelectRealm?.(r);
                              handleSwitchTab('realm');
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-950/60 hover:bg-amber-900/70 border border-amber-500/45 text-xs text-amber-200 hover:text-amber-100 hover:underline transition-colors cursor-pointer"
                            title={`Inspect Realm: ${r.name}`}
                          >
                            <Crown className="w-3 h-3 text-amber-400 shrink-0" />
                            <span>{r.name}</span>
                          </button>
                        ))}
                        {ruledCounties.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              onSelectCounty?.(c);
                              handleSwitchTab('county');
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-stone-950/80 hover:bg-stone-800 border border-emerald-600/40 text-xs text-emerald-300 hover:text-emerald-200 hover:underline transition-colors cursor-pointer"
                            title={`Inspect ${c.tier || 'County'}: ${c.name}`}
                          >
                            <Shield className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span>{c.name}</span>
                          </button>
                        ))}
                        {ownedBurgs.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => {
                              onSelectBurg?.(b);
                              handleSwitchTab('burg');
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-stone-950/80 hover:bg-stone-800 border border-sky-600/40 text-xs text-sky-300 hover:text-sky-200 hover:underline transition-colors cursor-pointer"
                            title={`Inspect Settlement: ${b.name} (${b.type})`}
                          >
                            <MapPin className="w-3 h-3 text-sky-400 shrink-0" />
                            <span>{b.name}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 text-xs text-stone-400">
                        <span>Resides in:</span>
                        {homeCounty && (
                          <button
                            type="button"
                            onClick={() => {
                              onSelectCounty?.(homeCounty);
                              handleSwitchTab('county');
                            }}
                            className="text-emerald-300 hover:text-emerald-200 hover:underline font-medium cursor-pointer"
                          >
                            {homeCounty.name}
                          </button>
                        )}
                        {homeRealm && (
                          <button
                            type="button"
                            onClick={() => {
                              onSelectRealm?.(homeRealm);
                              handleSwitchTab('realm');
                            }}
                            className="text-amber-300 hover:text-amber-200 hover:underline font-medium cursor-pointer"
                          >
                            {homeRealm.name}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Personal Demesne Limit & Overextension Warning */}
              <div
                className={`p-3.5 rounded-xl border space-y-2.5 ${
                  isOverextended ? 'bg-red-950/40 border-red-700/60' : 'bg-stone-900/60 border-white/5'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400/90 flex items-center gap-1.5">
                    <Castle className="w-3.5 h-3.5 text-amber-400" />
                    <span>Feudal Demesne & Personally Held Fiefs</span>
                  </span>
                  <span className="font-mono text-xs font-bold">
                    <span className={isOverextended ? 'text-red-400' : 'text-amber-300'}>
                      {heldBurgs.length}
                    </span>
                    <span className="text-stone-500"> / {demesneLimit} Max Fiefs</span>
                  </span>
                </div>

                <div className="text-[11px] text-stone-300">
                  {heldBurgs.length === 0 ? (
                    <span className="text-stone-400 italic">No direct fiefs held (rules entirely through vassals).</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {heldBurgs.map((hb) => (
                        <button
                          key={hb.id}
                          onClick={() => {
                            onSelectBurg(hb);
                            setPanelMode('burg');
                          }}
                          className="px-2 py-0.5 rounded bg-black/40 border border-white/10 hover:border-amber-400/50 text-stone-300 hover:text-amber-200 text-[11px] cursor-pointer flex items-center gap-1 transition-colors"
                        >
                          <span>🏰</span>
                          <span>{hb.name}</span>
                          <span className="text-[9px] font-mono text-stone-500">({hb.type})</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Feudal Military & Fiscal Yield per Holdings */}
                {feudalStanding && (
                  <div className="pt-2 border-t border-white/5 space-y-2 text-[10px]">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <div className="flex justify-between text-stone-400">
                          <span>Demesne Levies:</span>
                          <span className="font-mono text-emerald-300 font-semibold">{feudalStanding.demesneLevies.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-stone-400">
                          <span>Vassal Levies:</span>
                          <span className="font-mono text-emerald-400 font-semibold">{feudalStanding.vassalLevies.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-stone-400">
                          <span>Men-at-Arms:</span>
                          <span className="font-mono text-amber-300 font-semibold">{feudalStanding.menAtArms.toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-stone-400">
                          <span>Demesne Taxes:</span>
                          <span className="font-mono text-emerald-400 font-semibold">+{(fiscal ? fiscal.demesneIncome : feudalStanding.demesneIncome).toFixed(1)}g</span>
                        </div>
                        <div className="flex justify-between text-stone-400">
                          <span>Vassal Tithes:</span>
                          <span className="font-mono text-emerald-400 font-semibold">+{(fiscal ? fiscal.vassalTribute : feudalStanding.vassalTaxes).toFixed(1)}g</span>
                        </div>
                        {fiscal && fiscal.tariffIncome > 0 && (
                          <div className="flex justify-between text-stone-400">
                            <span>Tariffs & Customs:</span>
                            <span className="font-mono text-emerald-400 font-semibold">+{fiscal.tariffIncome.toFixed(1)}g</span>
                          </div>
                        )}
                        <div className="flex justify-between text-stone-300 font-medium">
                          <span>Total Revenue:</span>
                          <span className="font-mono text-amber-300 font-semibold">+{(fiscal ? fiscal.totalRevenue : feudalStanding.totalRevenue).toFixed(1)}g</span>
                        </div>
                      </div>
                    </div>

                    {/* Closed-Circuit Fiscal Expenses Matrix (fluctuating noble expenses & vault cap) */}
                    <div className="p-2.5 rounded-lg bg-black/35 border border-white/[0.07] space-y-1 font-mono tabular-nums text-[10px]">
                      {fiscal?.austerityTier && fiscal.austerityTier !== 'none' && (
                        <div className="mb-1 px-2 py-0.5 rounded bg-amber-950/60 border border-amber-600/40 text-amber-200 text-[10px] flex justify-between">
                          <span>Auto-Austerity Safeguard:</span>
                          <span className="uppercase font-bold">{fiscal.austerityTier}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-stone-400">
                        <span>Retinue &amp; Knights Upkeep:</span>
                        <span className="text-rose-400 font-semibold">-{(fiscal ? fiscal.armyUpkeep : feudalStanding.maaUpkeep).toFixed(1)}g</span>
                      </div>
                      {fiscal && (fiscal.navalTransportUpkeep || 0) > 0 && (
                        <div className="flex justify-between text-sky-300">
                          <span>Naval Transport &amp; Ship Charter:</span>
                          <span className="text-rose-400 font-semibold">-{(fiscal.navalTransportUpkeep || 0).toFixed(1)}g</span>
                        </div>
                      )}
                      <div className="flex justify-between text-stone-400" title="Great Hall food & wine, silks/furs/wool liveries, hospitality & court staff">
                        <span>Great Hall, Liveries &amp; Staff:</span>
                        <span className="text-rose-400 font-semibold">-{(fiscal ? fiscal.courtSplendorCost : feudalStanding.courtSplendorCost).toFixed(1)}g</span>
                      </div>
                      {fiscal && (fiscal.estateMaintenance || 0) > 0 && (
                        <div className="flex justify-between text-stone-400">
                          <span>Castles &amp; Manor Repairs:</span>
                          <span className="text-rose-400 font-semibold">-{(fiscal.estateMaintenance || 0).toFixed(1)}g</span>
                        </div>
                      )}
                      {fiscal && (fiscal.estateAdministration || 0) > 0 && (
                        <div className="flex justify-between text-stone-400" title="Stewards, bailiffs, reeves & legal disputes">
                          <span>Stewards, Bailiffs &amp; Legal:</span>
                          <span className="text-rose-400 font-semibold">-{(fiscal.estateAdministration || 0).toFixed(1)}g</span>
                        </div>
                      )}
                      {fiscal && (fiscal.householdUpkeep || 0) > 0 && (
                        <div className="flex justify-between text-stone-400">
                          <span>Household, Family &amp; Kin:</span>
                          <span className="text-rose-400 font-semibold">-{(fiscal.householdUpkeep || 0).toFixed(1)}g</span>
                        </div>
                      )}
                      {fiscal && (fiscal.youngerSonsAndDowries || 0) > 0 && (
                        <div className="flex justify-between text-stone-400">
                          <span>Younger Sons &amp; Dowry Reserves:</span>
                          <span className="text-rose-400 font-semibold">-{(fiscal.youngerSonsAndDowries || 0).toFixed(1)}g</span>
                        </div>
                      )}
                      {fiscal && (fiscal.religiousPatronage || 0) > 0 && (
                        <div className="flex justify-between text-stone-400">
                          <span>Chantries, Monasteries &amp; Alms:</span>
                          <span className="text-rose-400 font-semibold">-{(fiscal.religiousPatronage || 0).toFixed(1)}g</span>
                        </div>
                      )}
                      {fiscal && (fiscal.tournamentAndPageantry || 0) > 0 && (
                        <div className="flex justify-between text-stone-400">
                          <span>Tournaments &amp; Chivalric Arms:</span>
                          <span className="text-rose-400 font-semibold">-{(fiscal.tournamentAndPageantry || 0).toFixed(1)}g</span>
                        </div>
                      )}
                      {fiscal && (fiscal.seasonalShockExpense || 0) > 0 && (
                        <div className="flex justify-between text-amber-300/90" title={fiscal.seasonalExpenseLabel}>
                          <span className="truncate pr-2">{fiscal.seasonalExpenseLabel || 'Seasonal Outlay'}:</span>
                          <span className="text-rose-400 font-semibold shrink-0">-{(fiscal.seasonalShockExpense || 0).toFixed(1)}g</span>
                        </div>
                      )}
                      {fiscal && (fiscal.vaultHoardingDrag || 0) > 0 && (
                        <div className="flex justify-between text-orange-300">
                          <span>Vault Hoarding &amp; Bullion Drag:</span>
                          <span className="text-orange-400 font-semibold">-{(fiscal.vaultHoardingDrag || 0).toFixed(1)}g</span>
                        </div>
                      )}
                      {fiscal && (fiscal.tributeOwedToLiege || 0) > 0 && (
                        <div className="flex justify-between text-stone-400">
                          <span>Feudal Dues Owed to Liege:</span>
                          <span className="text-rose-400 font-semibold">-{(fiscal.tributeOwedToLiege || 0).toFixed(1)}g</span>
                        </div>
                      )}
                      {fiscal && (fiscal.scutageAndAidsExpense || 0) > 0 && (
                        <div className="flex justify-between text-stone-400" title="Wartime Scutage (shield money) & attending liege court">
                          <span>Scutage &amp; Royal Court Dues:</span>
                          <span className="text-rose-400 font-semibold">-{(fiscal.scutageAndAidsExpense || 0).toFixed(1)}g</span>
                        </div>
                      )}
                      {fiscal && fiscal.debtServicing > 0 && (
                        <div className="flex justify-between text-stone-400">
                          <span>Bank Debt Servicing:</span>
                          <span className="text-rose-400 font-semibold">-{fiscal.debtServicing.toFixed(1)}g</span>
                        </div>
                      )}
                      <div className="pt-1 border-t border-white/10 flex justify-between font-bold">
                        <span className="text-stone-300">Net Monthly Treasury Yield:</span>
                        <span className={(fiscal ? fiscal.netMonthlyCashflow : feudalStanding.monthlyNetIncome) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          {(fiscal ? fiscal.netMonthlyCashflow : feudalStanding.monthlyNetIncome) >= 0 ? '+' : ''}
                          {(fiscal ? fiscal.netMonthlyCashflow : feudalStanding.monthlyNetIncome).toFixed(1)}g / mo
                        </span>
                      </div>

                      {/* Vault Cap & Fiscal Stance Controls */}
                      {activeChar.isAlive && (() => {
                        const cap = activeChar.treasuryCap ?? fiscal?.vaultCap ?? getDefaultVaultCap(activeChar);
                        const cur = Math.max(0, activeChar.treasury || 0);
                        const pct = Math.min(100, Math.round((cur / Math.max(1, cap)) * 100));
                        const stance = activeChar.fiscalStance || 'Balanced';
                        const autoReinvest = activeChar.autoReinvestSurplus !== false;
                        return (
                          <div className="pt-1.5 mt-1 border-t border-white/10 space-y-1.5 font-sans">
                            <div className="flex items-center justify-between text-[10px] text-stone-400">
                              <span>Vault Limit ({pct}%):</span>
                              <span className="font-mono text-amber-300 tabular-nums">
                                {Math.round(cur)}g / {cap}g
                              </span>
                            </div>
                            <div className="w-full h-1 rounded-full bg-stone-900 overflow-hidden">
                              <div
                                className={`h-full ${pct >= 95 ? 'bg-orange-500' : pct >= 65 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="grid grid-cols-3 gap-1">
                              {(['Austerity', 'Balanced', 'Lavish'] as const).map((st) => (
                                <button
                                  key={st}
                                  type="button"
                                  onClick={() => {
                                    const updated = cloneWorldState(world);
                                    const ch = updated.characters.find((c) => c.id === activeChar.id);
                                    if (!ch) return;
                                    ch.fiscalStance = st;
                                    if (updated.economy?.fiscalProfiles) {
                                      updated.economy.fiscalProfiles[ch.id] = calculateFiscalProfile(ch, updated, updated.economy);
                                    }
                                    onUpdateWorld(updated);
                                  }}
                                  className={`py-1 rounded border text-[10px] font-semibold cursor-pointer ${
                                    stance === st
                                      ? 'bg-amber-600/30 border-amber-500 text-amber-200'
                                      : 'bg-stone-950 border-white/[0.08] text-stone-400 hover:text-stone-200'
                                  }`}
                                >
                                  {st}
                                </button>
                              ))}
                            </div>
                            <div className="flex items-center justify-between gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = cloneWorldState(world);
                                  const ch = updated.characters.find((c) => c.id === activeChar.id);
                                  if (!ch) return;
                                  ch.autoReinvestSurplus = !autoReinvest;
                                  onUpdateWorld(updated);
                                }}
                                className={`px-2 py-0.5 rounded border text-[10px] font-semibold cursor-pointer ${
                                  autoReinvest
                                    ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                                    : 'bg-stone-900 border-stone-700 text-stone-400'
                                }`}
                              >
                                {autoReinvest ? 'Auto-Reinvest Cap' : 'Cap Overflow Drag'}
                              </button>
                              <div className="flex flex-wrap items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = cloneWorldState(world);
                                    const ch = updated.characters.find((c) => c.id === activeChar.id);
                                    if (!ch) return;
                                    const res = disburseTreasuryAction(ch, 'feast', updated);
                                    onUpdateWorld(updated);
                                    setNotificationMsg(res.summary);
                                    setTimeout(() => setNotificationMsg(null), 4000);
                                  }}
                                  className="px-2 py-0.5 rounded bg-rose-950/70 hover:bg-rose-900/70 border border-rose-800/60 text-rose-200 text-[10px] font-semibold cursor-pointer"
                                >
                                  Feast
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = cloneWorldState(world);
                                    const ch = updated.characters.find((c) => c.id === activeChar.id);
                                    if (!ch) return;
                                    const res = disburseTreasuryAction(ch, 'tournament', updated);
                                    onUpdateWorld(updated);
                                    setNotificationMsg(res.summary);
                                    setTimeout(() => setNotificationMsg(null), 4000);
                                  }}
                                  className="px-2 py-0.5 rounded bg-purple-950/70 hover:bg-purple-900/70 border border-purple-800/60 text-purple-200 text-[10px] font-semibold cursor-pointer"
                                >
                                  Tourney
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = cloneWorldState(world);
                                    const ch = updated.characters.find((c) => c.id === activeChar.id);
                                    if (!ch) return;
                                    const res = disburseTreasuryAction(ch, 'monastery', updated);
                                    onUpdateWorld(updated);
                                    setNotificationMsg(res.summary);
                                    setTimeout(() => setNotificationMsg(null), 4000);
                                  }}
                                  className="px-2 py-0.5 rounded bg-emerald-950/70 hover:bg-emerald-900/70 border border-emerald-800/60 text-emerald-200 text-[10px] font-semibold cursor-pointer"
                                >
                                  Abbey
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = cloneWorldState(world);
                                    const ch = updated.characters.find((c) => c.id === activeChar.id);
                                    if (!ch) return;
                                    const res = disburseTreasuryAction(ch, 'public_works', updated);
                                    onUpdateWorld(updated);
                                    setNotificationMsg(res.summary);
                                    setTimeout(() => setNotificationMsg(null), 4000);
                                  }}
                                  className="px-2 py-0.5 rounded bg-amber-950/70 hover:bg-amber-900/70 border border-amber-800/60 text-amber-200 text-[10px] font-semibold cursor-pointer"
                                >
                                  Works
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = cloneWorldState(world);
                                    const ch = updated.characters.find((c) => c.id === activeChar.id);
                                    if (!ch) return;
                                    const res = disburseTreasuryAction(ch, 'alms', updated);
                                    onUpdateWorld(updated);
                                    setNotificationMsg(res.summary);
                                    setTimeout(() => setNotificationMsg(null), 4000);
                                  }}
                                  className="px-2 py-0.5 rounded bg-sky-950/70 hover:bg-sky-900/70 border border-sky-800/60 text-sky-200 text-[10px] font-semibold cursor-pointer"
                                >
                                  Alms
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    {activeChar.isAlive && (
                      <UnitRecruitmentPanel
                        ruler={activeChar}
                        world={world}
                        onUpdateWorld={onUpdateWorld}
                      />
                    )}
                    <div className="hidden">
                    </div>
                  </div>
                )}

                {isOverextended && (
                  <div className="p-2.5 rounded-lg bg-red-900/40 border border-red-700/80 text-[11px] text-red-200 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-red-200">Overextension Penalty Active (+{overextensionExcess} over limit)!</strong>
                      <p className="text-[10px] text-red-300 mt-0.5">
                        Holding more fiefs than personal stewardship allows degrades tax collection by -{Math.round(overextensionExcess * 20)}% and triggers severe vassal displeasure. Enfeoff new barons or mayors!
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Sworn Feudal Vassals & Hierarchy Card */}
              {(() => {
                const directVassals = getDirectVassals(activeChar, world);
                const isLowestLanded = activeChar.titleTier === 'Baron' || activeChar.titleTier === 'Mayor';

                return (
                  <div className="p-3.5 rounded-xl bg-stone-900/70 border border-white/5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400/90 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-amber-400" />
                        <span>
                          {activeChar.role === 'Monarch' || activeChar.titleTier === 'King' || activeChar.titleTier === 'Emperor'
                            ? `Sworn Vassals (${getCharacterRankTitle(activeChar, world)})`
                            : activeChar.titleTier === 'Duke'
                            ? 'Sworn Ducal Vassals (Counts & Barons)'
                            : activeChar.titleTier === 'Count'
                            ? 'Sworn County Vassals (Barons & Mayors)'
                            : isLowestLanded
                            ? 'Feudal Standing'
                            : 'Sworn Vassals'}
                        </span>
                      </span>
                      <span className="text-[10px] font-mono text-stone-400">
                        {isLowestLanded ? 'Lowest Landed Nobility' : `${directVassals.length} Vassals`}
                      </span>
                    </div>

                    {isLowestLanded ? (
                      <div className="p-2.5 rounded-lg bg-black/40 border border-white/5 text-[11px] text-stone-300 flex items-center gap-2">
                        <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
                        <div>
                          <span className="text-emerald-300 font-semibold">Lowest-Ranked Landed Nobility:</span>
                          <span className="text-stone-400 ml-1">
                            Holds direct sway over their single fief holding without intermediate vassals beneath them.
                          </span>
                        </div>
                      </div>
                    ) : directVassals.length === 0 ? (
                      <div className="text-stone-400 text-xs italic p-2 text-center">
                        No direct landed vassals currently sworn.
                      </div>
                    ) : (
                    <div className="divide-y divide-white/[0.06] border border-white/[0.07] rounded-md bg-stone-950/45 max-h-48 overflow-y-auto">
                        {directVassals.map((vassal) => {
                          const VassalTierIcon =
                            vassal.titleTier === 'Duke'
                              ? Castle
                              : vassal.titleTier === 'Count'
                              ? Shield
                              : vassal.titleTier === 'Mayor'
                              ? Coins
                              : Scroll;

                          return (
                            <button
                              key={vassal.id}
                              onClick={() => onSelectCharacter(vassal)}
                              className="w-full p-2.5 hover:bg-stone-800/50 text-left transition-colors cursor-pointer flex items-center justify-between group"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <VassalTierIcon className="w-4 h-4 text-amber-400 shrink-0" />
                                <div className="min-w-0">
                                  <div className="font-semibold text-stone-200 group-hover:text-amber-200 text-xs truncate flex items-center gap-1.5">
                                    <span>{vassal.name}</span>
                                    <span className="text-[10px] text-emerald-300 font-mono">
                                      · {getCharacterRankTitle(vassal, world)}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-stone-400 truncate mt-0.5">
                                    {vassal.title} ·{' '}
                                    <span
                                      role="button"
                                      tabIndex={0}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (vassal.houseName) onOpenHouse?.(vassal.houseName);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && vassal.houseName) {
                                          e.stopPropagation();
                                          onOpenHouse?.(vassal.houseName);
                                        }
                                      }}
                                      className="text-amber-300 hover:text-amber-200 underline decoration-amber-500/40 cursor-pointer"
                                    >
                                      House {vassal.houseName}
                                    </span>{' '}
                                    · <span className="font-mono tabular-nums">{vassal.treasury ?? 100}g</span>
                                  </div>
                                </div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-stone-500 group-hover:text-amber-400 shrink-0" />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Relational Micro-Tags: Clicking pivots immediately! */}
              <div className="space-y-2.5 p-3.5 rounded-lg bg-stone-900/50 border border-white/[0.08]">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase font-semibold tracking-wider text-amber-400/90">
                    Dynastic Relations & Diplomacy
                  </span>
                  {ruler && ruler.id !== activeChar.id && (
                    <span
                      className={`text-[11px] font-mono tabular-nums font-semibold ${
                        (activeChar.opinions?.[ruler.id] ?? 0) >= 35
                          ? 'text-emerald-400'
                          : (activeChar.opinions?.[ruler.id] ?? 0) < 0
                          ? 'text-rose-400'
                          : 'text-stone-300'
                      }`}
                    >
                      Crown Opinion {(activeChar.opinions?.[ruler.id] ?? 0) >= 0 ? '+' : ''}
                      {activeChar.opinions?.[ruler.id] ?? 0}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {liege && (
                    <button
                      onClick={() => {
                        onSelectRealm(liege);
                        setPanelMode('realm');
                      }}
                      className="px-2.5 py-1 rounded-md bg-stone-950/70 border border-white/[0.08] hover:border-amber-500/50 text-stone-300 hover:text-amber-300 transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Crown className="w-3 h-3 text-amber-400" />
                      <span>Realm:</span>
                      <strong className="text-amber-200">{liege.name}</strong>
                    </button>
                  )}
                  {spouse && (
                    <button
                      onClick={() => onSelectCharacter(spouse)}
                      className="px-2.5 py-1 rounded-md bg-stone-950/70 border border-white/[0.08] hover:border-amber-500/50 text-stone-300 hover:text-amber-300 transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Heart className="w-3 h-3 text-rose-400" />
                      <span>Spouse:</span>
                      <strong className="text-rose-200">{spouse.name}</strong>
                    </button>
                  )}
                  {friend && (
                    <button
                      onClick={() => onSelectCharacter(friend)}
                      className="px-2.5 py-1 rounded-md bg-stone-950/70 border border-emerald-800/40 hover:border-emerald-500/60 text-stone-300 hover:text-emerald-200 transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Users className="w-3 h-3 text-emerald-400" />
                      <span>Sworn Friend:</span>
                      <strong className="text-emerald-300">{friend.name}</strong>
                    </button>
                  )}
                  {heir && (
                    <button
                      onClick={() => onSelectCharacter(heir)}
                      className="px-2.5 py-1 rounded-md bg-stone-950/70 border border-white/[0.08] hover:border-amber-500/50 text-stone-300 hover:text-amber-300 transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      <span>Heir:</span>
                      <strong className="text-amber-200">{heir.name}</strong>
                    </button>
                  )}
                  {rival && (
                    <button
                      onClick={() => onSelectCharacter(rival)}
                      className="px-2.5 py-1 rounded-md bg-stone-950/70 border border-rose-800/40 hover:border-rose-500/60 text-stone-300 hover:text-rose-200 transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Skull className="w-3 h-3 text-red-400" />
                      <span>Rival:</span>
                      <strong className="text-red-300">{rival.name}</strong>
                    </button>
                  )}
                    {liegeRuler && liegeRuler.id !== activeChar.id && (
                    <button
                      onClick={() => onSelectCharacter(liegeRuler)}
                      className="px-2.5 py-1 rounded-md bg-stone-950/70 border border-white/[0.08] hover:border-amber-500/50 text-stone-300 hover:text-amber-300 transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Shield className="w-3 h-3 text-amber-500" />
                      <span>Liege:</span>
                      <strong className="text-amber-300">{liegeRuler.name}</strong>
                    </button>
                  )}
                </div>

                {/* Armorial Blazon & Feudal Herald Status */}
                {(() => {
                  const heraldStatus = getCharacterHeraldStatus(activeChar, world);
                  const canImpaleBoth = Boolean(spouse && activeChar.coatOfArms && spouse.coatOfArms);
                  return (
                    <div className="mt-2 p-2.5 rounded-md bg-stone-950/50 border border-white/[0.08] flex items-center gap-3">
                      {canImpaleBoth ? (
                        <ImpaledMarriageShield
                          dexterArms={activeChar.coatOfArms}
                          dexterSeed={`${activeChar.realmId}_${activeChar.houseName}_${activeChar.id}`}
                          sinisterArms={spouse!.coatOfArms}
                          sinisterSeed={`${spouse!.realmId}_${spouse!.houseName}_${spouse!.id}`}
                          size={38}
                        />
                      ) : (
                        <HeraldryShield
                          coatOfArms={activeChar.coatOfArms}
                          unheralded={!activeChar.coatOfArms}
                          seed={`${activeChar.realmId}_${activeChar.houseName}_${activeChar.id}`}
                          size={38}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[10px] uppercase font-semibold tracking-wider text-amber-400 truncate">
                            {canImpaleBoth ? 'Impaled Marital Achievement' : heraldStatus.label}
                          </div>
                          {activeChar.hasPersonalBanner && (
                            <span className="text-[10px] font-mono uppercase text-amber-300 shrink-0">
                              Personal Banner
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-stone-300 italic leading-snug">
                          {activeChar.coatOfArms?.blazon || heraldStatus.subtitle}
                        </div>
                        {activeChar.coatOfArms?.blazon && (
                          <div className="text-[10px] text-stone-500 mt-0.5 truncate">
                            {heraldStatus.subtitle}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Interactive Relationship Actions when inspecting another noble */}
                {ruler && ruler.id !== activeChar.id && (
                  <div className="pt-2 border-t border-white/[0.07] space-y-2">
                    <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => {
                          const updated = cloneWorldState(world);
                          const actor = updated.characters.find((c) => c.id === ruler.id);
                          const target = updated.characters.find((c) => c.id === activeChar.id);
                          if (!actor || !target) return;
                          const res = PlayerActionEngine.befriendCharacter(actor, target, updated);
                          onUpdateWorld(updated);
                          setNotificationMsg(res.summary);
                          setTimeout(() => setNotificationMsg(null), 3500);
                        }}
                        className="py-1.5 px-2 rounded-md bg-emerald-950/50 hover:bg-emerald-900/60 border border-emerald-700/40 text-emerald-200 font-medium cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Users className="w-3.5 h-3.5 shrink-0" />
                        <span>Befriend Noble</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = cloneWorldState(world);
                          const actor = updated.characters.find((c) => c.id === ruler.id);
                          const target = updated.characters.find((c) => c.id === activeChar.id);
                          if (!actor || !target) return;
                          const res = PlayerActionEngine.denounceCharacter(actor, target, updated);
                          onUpdateWorld(updated);
                          setNotificationMsg(res.summary);
                          setTimeout(() => setNotificationMsg(null), 3500);
                        }}
                        className="py-1.5 px-2 rounded-md bg-rose-950/50 hover:bg-rose-900/60 border border-rose-700/40 text-rose-200 font-medium cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Swords className="w-3.5 h-3.5 shrink-0" />
                        <span>Denounce Rival</span>
                      </button>
                      {activeChar.isImprisoned && (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = cloneWorldState(world);
                            const actor = updated.characters.find((c) => c.id === ruler.id);
                            const target = updated.characters.find((c) => c.id === activeChar.id);
                            if (!actor || !target) return;
                            const res = PlayerActionEngine.ransomPrisoner(actor, target, updated);
                            onUpdateWorld(updated);
                            setNotificationMsg(res.summary);
                            setTimeout(() => setNotificationMsg(null), 3500);
                          }}
                          className="col-span-2 py-1.5 px-2 rounded-md bg-amber-950/60 hover:bg-amber-900/70 border border-amber-700/50 text-amber-200 font-medium cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <Coins className="w-3.5 h-3.5 shrink-0" />
                          <span>Pay Royal Ransom</span>
                        </button>
                      )}
                      {!activeChar.hasPersonalBanner && (
                        <button
                          type="button"
                          disabled={!canBestowBanner(ruler)}
                          title={
                            canBestowBanner(ruler)
                              ? 'Bestow a personal heraldic banner (great honor granted only by a Duke or King)'
                              : 'Only ranks of Duke or King may bestow a personal banner'
                          }
                          onClick={() => {
                            const updated = cloneWorldState(world);
                            const actor = updated.characters.find((c) => c.id === ruler.id);
                            const target = updated.characters.find((c) => c.id === activeChar.id);
                            if (!actor || !target) return;
                            const res = PlayerActionEngine.bestowPersonalBanner(actor, target, updated);
                            onUpdateWorld(updated);
                            setNotificationMsg(res.summary);
                            setTimeout(() => setNotificationMsg(null), 4000);
                          }}
                          className="col-span-2 py-1.5 px-2 rounded-md bg-amber-950/50 hover:bg-amber-900/60 disabled:opacity-45 disabled:cursor-not-allowed border border-amber-700/40 text-amber-200 font-medium cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          {canBestowBanner(ruler) ? (
                            <>
                              <Award className="w-3.5 h-3.5 shrink-0" />
                              <span>Bestow Personal Banner</span>
                            </>
                          ) : (
                            <>
                              <Lock className="w-3.5 h-3.5 shrink-0" />
                              <span>Bestow Banner (Requires Duke or King Rank)</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {activeChar.realmId === ruler.realmId && (
                      <div className="flex items-center gap-1.5">
                        <select
                          value={councilAssignRole}
                          onChange={(e) => setCouncilAssignRole(e.target.value as any)}
                          className="flex-1 px-2 py-1 rounded-lg bg-stone-950 border border-stone-800 text-[11px] text-stone-200"
                        >
                          <option value="Chancellor">Chancellor</option>
                          <option value="Marshal">Marshal</option>
                          <option value="Steward">Steward</option>
                          <option value="Spymaster">Spymaster</option>
                          <option value="Court Chaplain">Court Chaplain</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = cloneWorldState(world);
                            const monarch = updated.characters.find((c) => c.id === ruler.id);
                            const appointee = updated.characters.find((c) => c.id === activeChar.id);
                            if (!monarch || !appointee) return;
                            const res = PlayerActionEngine.appointCouncilSeat(monarch, appointee, councilAssignRole, updated);
                            onUpdateWorld(updated);
                            setNotificationMsg(res.summary);
                            setTimeout(() => setNotificationMsg(null), 3500);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-amber-700 hover:bg-amber-600 text-white text-[11px] font-semibold cursor-pointer shrink-0"
                        >
                          Appoint Seat
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {!spouse && activeChar.isAlive && activeChar.age >= 18 && (() => {
                  const hasLivingSpouse = (ch: Character) =>
                    Boolean(ch.spouseId && livingCharacters.some((x) => x.id === ch.spouseId));
                  const eligibleCandidates = livingCharacters.filter((c) => {
                    if (c.id === activeChar.id || hasLivingSpouse(c) || c.age < 18 || c.gender === activeChar.gender) return false;
                    return checkMarriageLegality(activeChar, c, world).allowed;
                  });
                  if (eligibleCandidates.length === 0) return null;
                  const resolvedCandId =
                    marriageCandidateId && eligibleCandidates.some((c) => c.id === marriageCandidateId)
                      ? marriageCandidateId
                      : eligibleCandidates[0].id;

                  return (
                    <div className="pt-2 border-t border-white/5 space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] text-stone-400">
                        <span>Dynastic Marriage Alliance (Age 18+)</span>
                        <span className="font-mono text-[10px] text-amber-300/80">
                          {world.realmLaws?.consanguinity || 'Unrestricted'} · {world.realmLaws?.foreignMarriage || 'Open Alliances'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <select
                          value={resolvedCandId}
                          onChange={(e) => setMarriageCandidateId(e.target.value)}
                          className="flex-1 px-2 py-1 rounded-lg bg-stone-950 border border-stone-800 text-[11px] text-stone-200"
                        >
                          {eligibleCandidates.slice(0, 35).map((cand) => {
                            const prospect = evaluateMarriageProspect(activeChar, cand, world);
                            const leg = checkMarriageLegality(activeChar, cand, world);
                            const tag = leg.isBloodRelative
                              ? leg.kinship
                              : leg.isForeign
                              ? leg.isRoyalMatch
                                ? 'Foreign Royal'
                                : 'Foreign Noble'
                              : leg.isRoyalMatch
                              ? 'Royal House'
                              : 'Domestic';
                            return (
                              <option key={cand.id} value={cand.id}>
                                {cand.name} (House {cand.houseName} · {tag}) [{prospect.chanceLabel} {prospect.score >= 0 ? '+' : ''}{prospect.score}]
                              </option>
                            );
                          })}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = cloneWorldState(world);
                            const charA = updated.characters.find((c) => c.id === activeChar.id);
                            const charB = updated.characters.find((c) => c.id === resolvedCandId);
                            if (!charA || !charB) return;
                            const res = PlayerActionEngine.arrangeMarriage(charA, charB, updated);
                            onUpdateWorld(updated);
                            setNotificationMsg(res.summary);
                            setTimeout(() => setNotificationMsg(null), 4500);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-rose-700 hover:bg-rose-600 text-white text-[11px] font-semibold cursor-pointer shrink-0"
                        >
                          Wed Pact
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* Feudal High Justice, Ducal Courts, Royal Appeals & Monarch-Only Execution */}
                {(() => {
                  const authorities = getJudicialAuthoritiesForSubject(activeChar, world);
                  const subjectSentences = (world.judicialSentences || []).filter(
                    (s) => s.subjectId === activeChar.id
                  );
                  if (authorities.length === 0 && subjectSentences.length === 0) return null;

                  const activeAuthority =
                    authorities.find((a) => a.judge.id === selectedJudgeId) || authorities[0];
                  const allowedSentences = activeAuthority?.auth.allowedSentences || [];
                  const effectiveSentence = allowedSentences.includes(selectedSentence)
                    ? selectedSentence
                    : allowedSentences[0] || 'Imprisonment';

                  return (
                    <div className="pt-2.5 border-t border-white/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] uppercase font-semibold tracking-wider text-amber-400/90 flex items-center gap-1.5">
                          <Scale className="w-3.5 h-3.5 text-amber-400" />
                          <span>Feudal Court &amp; Sentencing</span>
                        </span>
                        <span className="text-[10px] text-stone-400 font-mono">
                          Execution: Monarch Only
                        </span>
                      </div>

                      {activeChar.isAlive && activeAuthority && (
                        <div className="p-2.5 rounded-lg bg-black/35 border border-white/[0.07] space-y-2">
                          <div className="grid grid-cols-2 gap-1.5">
                            <div>
                              <label className="text-[10px] text-stone-400 block mb-0.5">Presiding Court</label>
                              <select
                                value={activeAuthority.judge.id}
                                onChange={(e) => setSelectedJudgeId(e.target.value)}
                                className="w-full px-2 py-1 rounded bg-stone-950 border border-stone-800 text-[11px] text-stone-200"
                              >
                                {authorities.map((a) => (
                                  <option key={a.judge.id} value={a.judge.id}>
                                    {a.auth.judgeTier}: {a.judge.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] text-stone-400 block mb-0.5">Charge / Crime</label>
                              <select
                                value={selectedCrime}
                                onChange={(e) => setSelectedCrime(e.target.value)}
                                className="w-full px-2 py-1 rounded bg-stone-950 border border-stone-800 text-[11px] text-stone-200"
                              >
                                {SENTENCING_CRIMES.map((cr) => (
                                  <option key={cr} value={cr}>{cr}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-1.5">
                            <div>
                              <label className="text-[10px] text-stone-400 block mb-0.5">Sentence</label>
                              <select
                                value={effectiveSentence}
                                onChange={(e) => setSelectedSentence(e.target.value as JudicialSentenceType)}
                                className="w-full px-2 py-1 rounded bg-stone-950 border border-stone-800 text-[11px] text-stone-200"
                              >
                                {allowedSentences.map((st) => (
                                  <option key={st} value={st}>{st}</option>
                                ))}
                              </select>
                            </div>

                            {effectiveSentence === 'Execution' && activeAuthority.auth.canExecute ? (
                              <div>
                                <label className="text-[10px] text-red-300 block mb-0.5">Execution Method</label>
                                <select
                                  value={selectedExecutionMethod}
                                  onChange={(e) => setSelectedExecutionMethod(e.target.value as ExecutionMethod)}
                                  className="w-full px-2 py-1 rounded bg-red-950/60 border border-red-800/70 text-[10px] text-red-100"
                                >
                                  {EXECUTION_METHODS.map((m) => (
                                    <option key={m} value={m}>{m}</option>
                                  ))}
                                </select>
                              </div>
                            ) : (
                              <div className="flex items-end">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = cloneWorldState(world);
                                    const judgeObj = updated.characters.find((c) => c.id === activeAuthority.judge.id);
                                    const subjObj = updated.characters.find((c) => c.id === activeChar.id);
                                    if (!judgeObj || !subjObj) return;
                                    const res = passFeudalSentence({
                                      judge: judgeObj,
                                      subject: subjObj,
                                      sentence: effectiveSentence,
                                      crime: selectedCrime,
                                      world: updated,
                                      executionMethod: selectedExecutionMethod,
                                      onKillCharacter: killCharacter,
                                    });
                                    onUpdateWorld(updated);
                                    setNotificationMsg(res.summary);
                                    setTimeout(() => setNotificationMsg(null), 5000);
                                  }}
                                  className="w-full px-2.5 py-1 rounded bg-amber-700 hover:bg-amber-600 text-white text-[10px] font-semibold cursor-pointer"
                                >
                                  Pass {activeAuthority.auth.judgeTier} Sentence
                                </button>
                              </div>
                            )}
                          </div>

                          {effectiveSentence === 'Execution' && activeAuthority.auth.canExecute && (
                            <button
                              type="button"
                              onClick={() => {
                                const updated = cloneWorldState(world);
                                const judgeObj = updated.characters.find((c) => c.id === activeAuthority.judge.id);
                                const subjObj = updated.characters.find((c) => c.id === activeChar.id);
                                if (!judgeObj || !subjObj) return;
                                const res = passFeudalSentence({
                                  judge: judgeObj,
                                  subject: subjObj,
                                  sentence: 'Execution',
                                  crime: selectedCrime,
                                  world: updated,
                                  executionMethod: selectedExecutionMethod,
                                  onKillCharacter: killCharacter,
                                });
                                onUpdateWorld(updated);
                                setNotificationMsg(res.summary);
                                setTimeout(() => setNotificationMsg(null), 5000);
                              }}
                              className="w-full py-1.5 rounded bg-red-800 hover:bg-red-700 border border-red-500/60 text-white text-[11px] font-semibold uppercase tracking-wider cursor-pointer"
                            >
                              Order Royal Execution ({selectedExecutionMethod})
                            </button>
                          )}

                          <div className="text-[10px] text-stone-400 italic">
                            {activeAuthority.auth.reason}
                          </div>
                        </div>
                      )}

                      {subjectSentences.length > 0 && (
                        <div className="divide-y divide-white/[0.06] rounded-lg bg-stone-950/60 border border-white/[0.07]">
                          {subjectSentences.slice(0, 4).map((rec) => (
                            <div
                              key={rec.id}
                              className="p-2.5 text-[11px] space-y-1"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-stone-200">
                                  {rec.sentence}
                                  {rec.executionMethod ? ` (${rec.executionMethod})` : ''}
                                </span>
                                <span
                                  className={`text-[10px] font-mono ${
                                    rec.status === 'Pending Appeal'
                                      ? 'text-amber-300'
                                      : rec.status === 'Overturned by King'
                                      ? 'text-emerald-300'
                                      : 'text-stone-400'
                                  }`}
                                >
                                  {rec.status}
                                </span>
                              </div>
                              <div className="text-[10px] text-stone-400">
                                Year {rec.year} · {rec.judgeTier} {rec.judgeName} · Charge: {rec.crime}
                              </div>
                              {rec.appealResolutionNote && (
                                <div className="text-[10px] text-amber-200/90 italic">{rec.appealResolutionNote}</div>
                              )}
                              {rec.canAppealToKing && rec.status === 'Pending Appeal' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = cloneWorldState(world);
                                    const res = appealSentenceToKing(rec.id, updated);
                                    onUpdateWorld(updated);
                                    setNotificationMsg(res.summary);
                                    setTimeout(() => setNotificationMsg(null), 5000);
                                  }}
                                  className="mt-1 w-full py-1 rounded bg-sky-800 hover:bg-sky-700 text-white text-[10px] font-semibold cursor-pointer"
                                >
                                  Appeal Ducal Verdict to the King (Dice Roll)
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Core Attributes & Gravitas Authority Breakdown */}
              <div className="p-3.5 rounded-lg bg-stone-900/50 border border-white/[0.08] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase font-semibold tracking-wider text-amber-400/90">
                    Grand Strategy Attributes & Gravitas
                  </span>
                  <span className="text-[11px] font-mono text-amber-300 font-semibold tabular-nums">
                    {gravitas} / 1,000 Gravitas
                  </span>
                </div>
                {gravitasBreakdown && (
                  <div className="rounded-md bg-stone-950/50 border border-white/[0.07] divide-y divide-white/[0.06]">
                    <div className="grid grid-cols-5 divide-x divide-white/[0.06] text-center font-mono text-[10px] tabular-nums py-1.5">
                      <div>
                        <div className="text-stone-400">MIL</div>
                        <div className="text-rose-300 font-bold">{gravitasBreakdown.military}</div>
                      </div>
                      <div>
                        <div className="text-stone-400">ECO</div>
                        <div className="text-emerald-300 font-bold">{gravitasBreakdown.economic}</div>
                      </div>
                      <div>
                        <div className="text-stone-400">POP</div>
                        <div className="text-amber-300 font-bold">{gravitasBreakdown.populist}</div>
                      </div>
                      <div>
                        <div className="text-stone-400">PRE</div>
                        <div className="text-sky-300 font-bold">{gravitasBreakdown.lineage}</div>
                      </div>
                      <div>
                        <div className="text-stone-400">CRD</div>
                        <div className="text-purple-300 font-bold">{gravitasBreakdown.debtLeverage}</div>
                      </div>
                    </div>
                    <div className="flex justify-between text-[10px] font-mono tabular-nums text-stone-400 px-2.5 py-1.5">
                      <span>Council Vote Weight: <strong className="text-amber-200">{gravitasBreakdown.councilWeight}x</strong></span>
                      <span>Trial Immunity: <strong className="text-sky-300">{gravitasBreakdown.trialShieldPct}%</strong></span>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-6 divide-x divide-white/[0.07] border border-white/[0.07] rounded-md bg-stone-950/50 text-center font-mono tabular-nums">
                  <div className="py-2">
                    <div className="text-[10px] text-stone-400">DIP</div>
                    <div className="text-sm font-bold text-sky-400">{stats.diplomacy}</div>
                  </div>
                  <div className="py-2">
                    <div className="text-[10px] text-stone-400">MAR</div>
                    <div className="text-sm font-bold text-red-400">{stats.martial}</div>
                  </div>
                  <div className="py-2">
                    <div className="text-[10px] text-stone-400">STE</div>
                    <div className="text-sm font-bold text-amber-400">{stats.stewardship}</div>
                  </div>
                  <div className="py-2">
                    <div className="text-[10px] text-stone-400">INT</div>
                    <div className="text-sm font-bold text-purple-400">{stats.intrigue}</div>
                  </div>
                  <div className="py-2">
                    <div className="text-[10px] text-stone-400">LRN</div>
                    <div className="text-sm font-bold text-emerald-400">{stats.learning}</div>
                  </div>
                  <div className="py-2">
                    <div className="text-[10px] text-stone-400">PRW</div>
                    <div className="text-sm font-bold text-orange-400">{stats.prowess}</div>
                  </div>
                </div>
              </div>

              {/* Psychological Drivers & Strategic Persona */}
              <div className="p-3.5 rounded-lg bg-stone-900/50 border border-white/[0.08] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase font-semibold tracking-wider text-amber-400/90 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                    <span>Psychological Drivers & Persona</span>
                  </span>
                  <span className="text-[11px] font-semibold text-amber-300">
                    {activeChar.aiArchetype || 'Honorable Paragon'}
                  </span>
                </div>

                <div className="divide-y divide-white/[0.06] border border-white/[0.07] rounded-md bg-stone-950/45 text-xs">
                  {activeChar.ambition && (
                    <div className="p-2.5 flex items-start gap-2">
                      <Flag className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[10px] text-stone-400 font-semibold uppercase block">Ambition</span>
                        <span className="text-stone-200">{activeChar.ambition}</span>
                      </div>
                    </div>
                  )}

                  {activeChar.tragicFlaw && (
                    <div className="p-2.5 flex items-start gap-2">
                      <Zap className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[10px] text-stone-400 font-semibold uppercase block">Tragic Flaw</span>
                        <span className="text-stone-200">{activeChar.tragicFlaw}</span>
                      </div>
                    </div>
                  )}

                  {activeChar.sacredOath && (
                    <div className="p-2.5 flex items-start gap-2">
                      <Scroll className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[10px] text-stone-400 font-semibold uppercase block">Sacred Oath</span>
                        <span className="text-stone-200">{activeChar.sacredOath}</span>
                      </div>
                    </div>
                  )}

                  {activeChar.darkSecret && (
                    <div className="p-2.5 bg-red-950/25 flex items-start gap-2">
                      <Eye className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[10px] text-red-400 font-semibold uppercase block">Dark Secret</span>
                        <span className="text-red-200 italic">{activeChar.darkSecret}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Six Attributes Meaning & Gameplay Impact Matrix */}
              <div className="p-3.5 rounded-lg bg-stone-900/50 border border-white/[0.08] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase font-semibold tracking-wider text-amber-400/90">
                    Six Attributes &amp; Gameplay Impact
                  </span>
                  <span className="text-[10px] font-mono text-stone-400">
                    Hover for role
                  </span>
                </div>
                <div className="grid grid-cols-3 border border-white/[0.07] rounded-md bg-stone-950/45 divide-x divide-y divide-white/[0.07]">
                  {(
                    [
                      { key: 'diplomacy', val: activeChar.baseDiplomacy || 8 },
                      { key: 'martial', val: activeChar.baseMartial || 8 },
                      { key: 'stewardship', val: activeChar.baseStewardship || 8 },
                      { key: 'intrigue', val: activeChar.baseIntrigue || 8 },
                      { key: 'learning', val: activeChar.baseLearning || 8 },
                      { key: 'prowess', val: activeChar.baseProwess || 6 },
                    ] as const
                  ).map(({ key, val }) => {
                    const def = SIX_ATTRIBUTES_GUIDE[key];
                    return (
                      <div
                        key={key}
                        title={`${def.label}: ${def.meaning} — ${def.gameplayImpact}`}
                        className="p-2 hover:bg-stone-800/40 transition-colors cursor-help"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase font-semibold text-stone-400">{def.short}</span>
                          <span className="text-xs font-mono font-bold tabular-nums text-amber-300">{val}</span>
                        </div>
                        <div className="text-[10px] text-stone-400 truncate mt-0.5">{def.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Upbringing, Fosterage & Apprenticeship (Natural Growth until Age 21) */}
              {activeChar.age < 21 && activeChar.isAlive !== false && (() => {
                const guardian = livingCharacters.find((c) => c.id === activeChar.guardianId);
                const appMaster = livingCharacters.find((c) => c.id === activeChar.apprenticeshipMasterId);
                const adultMentors = livingCharacters
                  .filter((c) => c.age >= 21 && c.id !== activeChar.id)
                  .sort((a, b) => (b.baseLearning || 8) - (a.baseLearning || 8))
                  .slice(0, 24);

                return (
                  <div className="p-3.5 rounded-xl bg-amber-950/25 border border-amber-600/35 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] uppercase font-semibold tracking-wider text-amber-300">
                        Youth Growth, Fosterage &amp; Apprenticeship
                      </span>
                      <span className="text-[10px] font-mono tabular-nums text-amber-200/80">
                        Traits Lock at Age 21 ({Math.max(1, 21 - activeChar.age)}y left)
                      </span>
                    </div>

                    <div className="text-[11px] text-stone-300 leading-snug">
                      Attributes and personality traits evolve naturally each year based on mentorship and Learning, becoming permanent at age 21.
                    </div>

                    {/* Childhood Focus */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase font-semibold text-stone-400 shrink-0">Study Focus:</span>
                      <select
                        value={activeChar.childhoodFocus || 'stewardship'}
                        onChange={(e) => {
                          const updated = cloneWorldState(world);
                          const target = updated.characters.find((c) => c.id === activeChar.id);
                          if (target) {
                            target.childhoodFocus = e.target.value as Character['childhoodFocus'];
                          }
                          onUpdateWorld(updated);
                          setNotificationMsg(`${activeChar.name}'s upbringing focus set to ${e.target.value}.`);
                          setTimeout(() => setNotificationMsg(null), 3000);
                        }}
                        className="flex-1 px-2 py-1 rounded bg-stone-950 border border-stone-700 text-[10px] text-stone-100"
                      >
                        <option value="diplomacy">Diplomacy &amp; Courtly Etiquette</option>
                        <option value="martial">Martial &amp; Arms Training</option>
                        <option value="stewardship">Stewardship &amp; Estate Ledger</option>
                        <option value="intrigue">Intrigue &amp; Court Whispercraft</option>
                        <option value="learning">Learning &amp; Abbey Scholarship</option>
                      </select>
                    </div>

                    {/* Fosterage Assignment */}
                    <div className="space-y-1 pt-1 border-t border-white/10">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-stone-400">Foster Guardian:</span>
                        <span className="text-amber-200 font-medium truncate max-w-[180px]">
                          {guardian ? `${guardian.name} (LRN ${guardian.baseLearning})` : 'Unassigned (Parents)'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <select
                          value={fosterGuardianId || adultMentors[0]?.id || ''}
                          onChange={(e) => setFosterGuardianId(e.target.value)}
                          className="flex-1 px-2 py-1 rounded bg-stone-950 border border-stone-700 text-[10px] text-stone-100 min-w-0"
                        >
                          {adultMentors.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({formatCharacterRoleLabel(m, world)} · LRN {m.baseLearning})
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            const gid = fosterGuardianId || adultMentors[0]?.id;
                            if (!gid) return;
                            const updated = cloneWorldState(world);
                            const ch = updated.characters.find((c) => c.id === activeChar.id);
                            const g = updated.characters.find((c) => c.id === gid);
                            if (ch && g) {
                              const res = assignFosterage(ch, g, updated);
                              onUpdateWorld(updated);
                              setNotificationMsg(res.summary);
                              setTimeout(() => setNotificationMsg(null), 3500);
                            }
                          }}
                          className="px-2.5 py-1 rounded bg-amber-700 hover:bg-amber-600 text-white text-[10px] font-semibold cursor-pointer shrink-0"
                        >
                          Foster
                        </button>
                      </div>
                    </div>

                    {/* Apprenticeship Assignment (Ages 10-20) */}
                    {activeChar.age >= 10 && (
                      <div className="space-y-1 pt-1 border-t border-white/10">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-stone-400">Apprenticeship:</span>
                          <span className="text-emerald-300 font-medium truncate max-w-[180px]">
                            {activeChar.apprenticeshipType
                              ? `${activeChar.apprenticeshipType}${appMaster ? ` (${appMaster.name.split(' ')[0]})` : ''}`
                              : 'None'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <select
                            value={apprenticeTypeSel}
                            onChange={(e) => setApprenticeTypeSel(e.target.value as NonNullable<Character['apprenticeshipType']>)}
                            className="flex-1 px-2 py-1 rounded bg-stone-950 border border-stone-700 text-[10px] text-stone-100 min-w-0"
                          >
                            <option value="Squire & Knighthood">Squire &amp; Knighthood</option>
                            <option value="Stewardship Guild">Stewardship Guild</option>
                            <option value="Chancery Clerk">Chancery Clerk</option>
                            <option value="Scholastic Abbey">Scholastic Abbey</option>
                            <option value="Shadowcraft">Shadowcraft</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = cloneWorldState(world);
                              const ch = updated.characters.find((c) => c.id === activeChar.id);
                              const master = updated.characters.find(
                                (c) => c.id === (apprenticeMasterId || activeChar.guardianId || adultMentors[0]?.id)
                              );
                              if (ch) {
                                const res = assignApprenticeship(ch, apprenticeTypeSel, master, updated);
                                onUpdateWorld(updated);
                                setNotificationMsg(res.summary);
                                setTimeout(() => setNotificationMsg(null), 3500);
                              }
                            }}
                            className="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-semibold cursor-pointer shrink-0"
                          >
                            Apprentice
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Redesigned Bespoke Trait Badges & Congenital Modifiers */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase font-semibold tracking-wider text-amber-400/90">
                    Traits &amp; Earned Heritage
                  </span>
                  <span className="text-[10px] font-mono text-stone-400">
                    {activeChar.age >= 21 ? 'Core Traits Permanent (21+)' : 'Forming Until Age 21'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {Array.from(
                    new Set([
                      ...(activeChar.personalityTraits || []),
                      ...(activeChar.congenitalTraits || []),
                      ...(activeChar.physicalHealthTraits || []),
                      ...(activeChar.monthsPregnant !== undefined && activeChar.monthsPregnant >= 0 ? ['Pregnant'] : []),
                      ...(activeChar.educationTrait ? [activeChar.educationTrait] : []),
                      ...(activeChar.lifestyleTraits || []),
                      ...(activeChar.commanderTraits || []),
                      ...(activeChar.statusTrait ? [activeChar.statusTrait] : []),
                    ])
                  ).map((traitId: string, idx) => {
                    const traitDef = CHARACTER_TRAITS.find(
                      (t) => t.id === traitId || t.name.toLowerCase() === traitId.toLowerCase()
                    );
                    const visual = getTraitVisual(traitId, traitDef?.category || 'personality');
                    const isPregnantTrait = traitId.toLowerCase() === 'pregnant';
                    const pregMonths = activeChar.monthsPregnant;
                    const displayName =
                      isPregnantTrait && pregMonths !== undefined && pregMonths >= 0
                        ? `Pregnant (${Math.min(9, pregMonths)}/9 mo)`
                        : traitDef?.name || traitId;

                    return (
                      <div
                        key={`${traitId}_${idx}`}
                        title={`${displayName}: ${traitDef?.description || 'Feudal trait modifier'}`}
                        className={`px-3 py-1.5 rounded-lg border flex items-center gap-2 cursor-help ${visual.badgeBg} ${visual.borderColor}`}
                      >
                        <span className="text-sm shrink-0">{visual.icon}</span>
                        <div className="min-w-0">
                          <div className={`font-semibold text-xs leading-none ${visual.textColor}`}>
                            {displayName}
                          </div>
                          {isPregnantTrait && pregMonths !== undefined && pregMonths >= 0 ? (
                            <div className="text-[10px] font-mono tabular-nums text-pink-200/80 mt-0.5 leading-none">
                              Delivery in {Math.max(1, 9 - pregMonths)} mo
                            </div>
                          ) : traitDef ? (
                            <div className="text-[10px] font-mono tabular-nums text-stone-400 mt-0.5 leading-none">
                              {traitDef.martialMod ? `MAR ${traitDef.martialMod > 0 ? `+${traitDef.martialMod}` : traitDef.martialMod} ` : ''}
                              {traitDef.stewardshipMod ? `STE ${traitDef.stewardshipMod > 0 ? `+${traitDef.stewardshipMod}` : traitDef.stewardshipMod} ` : ''}
                              {traitDef.intrigueMod ? `INT ${traitDef.intrigueMod > 0 ? `+${traitDef.intrigueMod}` : traitDef.intrigueMod} ` : ''}
                              {traitDef.diplomacyMod ? `DIP ${traitDef.diplomacyMod > 0 ? `+${traitDef.diplomacyMod}` : traitDef.diplomacyMod} ` : ''}
                              {traitDef.learningMod ? `LRN ${traitDef.learningMod > 0 ? `+${traitDef.learningMod}` : traitDef.learningMod} ` : ''}
                              {traitDef.prowessMod ? `PRW ${traitDef.prowessMod > 0 ? `+${traitDef.prowessMod}` : traitDef.prowessMod}` : ''}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Vertical Life Chronicle */}
              <div className="space-y-3 pt-2 border-t border-white/10">
                <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400/90 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  <span>Vertical Life Chronicle</span>
                </span>
                {(() => {
                  const refYear = activeChar.deathYear ?? world.currentYear;
                  const fixedBirthYear = activeChar.birthYear ?? (refYear - activeChar.age);
                  const fixedInvestitureYear = activeChar.investitureYear
                    ?? (activeChar.age >= 18 &&
                      activeChar.role !== 'Child' &&
                      activeChar.role !== 'Cadet Prince' &&
                      activeChar.role !== 'Cadet Princess' &&
                      activeChar.role !== 'Noble Scion' &&
                      activeChar.role !== 'Disinherited Bastard'
                      ? fixedBirthYear + 18
                      : undefined);
                  const fixedMarriageYear = activeChar.marriageYear
                    ?? spouse?.marriageYear
                    ?? (spouse && activeChar.age >= 21 ? fixedBirthYear + 21 : undefined);

                  return (
                    <div className="relative pl-4 space-y-3 border-l border-stone-800 font-sans">
                      <div className="relative">
                        <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-amber-500 ring-4 ring-stone-950" />
                        <div className="font-mono text-[10px] text-amber-400">Anno {fixedBirthYear}</div>
                        <div className="text-stone-300 font-medium mt-0.5">
                          Born into{' '}
                          <button
                            type="button"
                            onClick={() => activeChar.houseName && onOpenHouse?.(activeChar.houseName)}
                            className="text-amber-300 hover:text-amber-200 underline decoration-amber-500/40 cursor-pointer"
                          >
                            House {activeChar.houseName || 'Sovereign'}
                          </button>
                        </div>
                      </div>

                      {fixedInvestitureYear !== undefined && (
                        <div className="relative">
                          <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-sky-500 ring-4 ring-stone-950" />
                          <div className="font-mono text-[10px] text-sky-400">Anno {fixedInvestitureYear}</div>
                          <div className="text-stone-300 font-medium mt-0.5">Invested as {formatCharacterRoleLabel(activeChar, world)} of {realm.name}</div>
                        </div>
                      )}

                      {spouse && fixedMarriageYear !== undefined && (
                        <div className="relative">
                          <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-rose-500 ring-4 ring-stone-950" />
                          <div className="font-mono text-[10px] text-rose-400">Anno {fixedMarriageYear}</div>
                          <div className="text-stone-300 font-medium mt-0.5">Wedded {spouse.name} in dynastic pact</div>
                        </div>
                      )}

                      <div className="relative">
                        <div className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full ${activeChar.isAlive ? 'bg-emerald-500' : 'bg-stone-500'} ring-4 ring-stone-950`} />
                        <div className={`font-mono text-[10px] ${activeChar.isAlive ? 'text-emerald-400' : 'text-stone-400'}`}>
                          {activeChar.isAlive
                            ? `Anno ${world.currentYear} (Present)`
                            : `Anno ${activeChar.deathYear ?? world.currentYear} (Deceased)`}
                        </div>
                        <div className="text-stone-300 font-medium mt-0.5">
                          {activeChar.isAlive
                            ? `Reigning at court. Dread: ${activeChar.dread || 10} / 100`
                            : `Passed into eternity at age ${activeChar.age}. Dread: ${activeChar.dread || 10} / 100`}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Feudal Interactive Directives */}
              <div className="pt-2 border-t border-white/10 space-y-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400/90">
                  Feudal Directives
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setIsDilemmaModalOpen(true)}
                    className="py-2.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-medium flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Provoke Dilemma</span>
                  </button>
                  <button
                    onClick={handleSendGift}
                    className="py-2.5 px-3 rounded-xl bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-200 hover:text-white font-medium flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <Coins className="w-4 h-4 text-amber-400" />
                    <span>Send Gift (150g)</span>
                  </button>
                  {onWeaveStoryForCharacter && (
                    <button
                      onClick={() => onWeaveStoryForCharacter(activeChar)}
                      className="col-span-2 py-2 px-3 rounded-xl bg-stone-900/80 hover:bg-stone-800 border border-stone-800 text-amber-300 hover:text-amber-200 font-medium flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <BookOpen className="w-4 h-4" />
                      <span>Weave Saga Epic for {activeChar.name}</span>
                    </button>
                  )}
                  {onOpenWorkspaceTab && (
                    <div className="col-span-2 grid grid-cols-2 gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => onOpenWorkspaceTab('court')}
                        className="py-1.5 px-2.5 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 hover:text-amber-200 text-[11px] font-medium cursor-pointer"
                      >
                        Open Court Dossier →
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenWorkspaceTab('feudal')}
                        className="py-1.5 px-2.5 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 hover:text-amber-200 text-[11px] font-medium cursor-pointer"
                      >
                        Open Feudal Domain →
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Chronicle Event Dilemma Modal */}
      {isDilemmaModalOpen && (
        <ChronicleEventModal
          isOpen={isDilemmaModalOpen}
          onClose={() => setIsDilemmaModalOpen(false)}
          character={activeChar}
          world={world}
            onApplyEventOutcome={(outcome, updated) => {
              onUpdateWorld(updated);
              setNotificationMsg(outcome);
              setIsDilemmaModalOpen(false);
            }}
          />
        )}

      {/* Royal Settlement Charter Founding Modal */}
      {isCharterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full max-w-lg rounded-2xl bg-stone-950/95 border border-amber-500/40 shadow-2xl p-6 text-stone-200 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-lg bg-amber-950/60 border border-amber-600/40 text-amber-300">
                  <Scroll className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-cinzel font-bold text-base text-amber-100">
                    Royal Settlement Charter
                  </h3>
                  <p className="text-xs text-stone-400">
                    Found a new fiefdom by decree of {ruler.name} ({realm.name})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCharterModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step 1: Select Open Habitable Space */}
            <div className="space-y-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400/90 flex items-center justify-between">
                <span>1. Select Uninhabited Frontier Cell ({habitableCells.length} Available)</span>
                <span className="text-[10px] font-mono text-stone-400">Habitable Land</span>
              </span>

              {habitableCells.length === 0 ? (
                <div className="p-4 rounded-xl bg-stone-900/40 text-stone-400 text-center text-xs">
                  No open habitable space found in the realm. All regions are already settled or too close to existing settlements.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto p-1">
                  {habitableCells.map((cand) => {
                    const isSelected = charterCellIndex === cand.cellIndex;
                    return (
                      <button
                        key={cand.cellIndex}
                        type="button"
                        onClick={() => {
                          setCharterCellIndex(cand.cellIndex);
                          if (!charterName) {
                            const prefix = cand.siteType === 'Estuary Harbor' ? 'Port ' : cand.siteType === 'Mountain Pass' ? 'Fort ' : '';
                            setCharterName(`${prefix}New ${realm.name.split(' ')[0]}`);
                          }
                          setCharterType(cand.suggestedType);
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-950/80 border-amber-500 shadow-sm ring-1 ring-amber-500/50'
                            : 'bg-stone-900/60 border-white/5 hover:border-amber-500/40'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-xs text-amber-200">
                            {cand.siteType}
                          </span>
                          <span className="text-[10px] font-mono text-emerald-400">
                            Cap: {cand.carryingCapacity}
                          </span>
                        </div>
                        <p className="text-[10px] text-stone-400 mt-1 line-clamp-2">
                          {cand.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Step 2: Name & Settlement Type */}
            <div className="space-y-3 pt-1">
              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider text-amber-400/90 block mb-1">
                  2. Settlement Designation & Name
                </label>
                <input
                  type="text"
                  value={charterName}
                  onChange={(e) => setCharterName(e.target.value)}
                  placeholder="e.g. Kingsford, Highwatch, Amberport..."
                  className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/10 text-stone-100 placeholder-stone-500 text-xs focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider text-amber-400/90 block mb-1">
                  Settlement Classification
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      'Market Town',
                      'Border Fortress',
                      'Chartered City',
                      'Trade Port',
                      'Farming Village',
                    ] as Burg['type'][]
                  ).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setCharterType(st)}
                      className={`py-1.5 px-2 rounded-lg text-center text-xs font-medium border transition-all cursor-pointer ${
                        charterType === st
                          ? 'bg-amber-600 border-amber-400 text-white'
                          : 'bg-stone-900 border-white/5 text-stone-400 hover:text-white'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Step 3: Feudal Enfeoffment (Vassal vs Demesne) */}
            <div className="p-3 rounded-xl bg-stone-900/60 border border-white/5 space-y-2.5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400/90 block">
                3. Feudal Demesne & Vassal Enfeoffment
              </span>

              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs">
                  <input
                    type="radio"
                    name="charterVassal"
                    checked={charterDelegateToVassal}
                    onChange={() => setCharterDelegateToVassal(true)}
                    className="accent-amber-500"
                  />
                  <span>Enfeoff a New Local Vassal (Recommended · Prevents Overextension)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs">
                  <input
                    type="radio"
                    name="charterVassal"
                    checked={!charterDelegateToVassal}
                    onChange={() => setCharterDelegateToVassal(false)}
                    className="accent-amber-500"
                  />
                  <span>Retain in Sovereign Personal Demesne ({heldBurgs.length}/{demesneLimit} held)</span>
                </label>
              </div>

              {charterDelegateToVassal ? (
                <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs">
                  <span className="text-stone-400">Elevate to Office:</span>
                  <select
                    value={charterVassalRole}
                    onChange={(e) => setCharterVassalRole(e.target.value as CourtRole)}
                    className="bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs text-amber-200 focus:outline-none"
                  >
                    <option value="Lord Mayor">Lord Mayor (City/Town)</option>
                    <option value="Vassal Baron">Vassal Baron (Castle/Keep)</option>
                    <option value="Merchant Guildmaster">Merchant Guildmaster (Port)</option>
                    <option value="Vassal Count">Vassal Count (Regional)</option>
                  </select>
                </div>
              ) : (
                heldBurgs.length >= demesneLimit && (
                  <div className="p-2 rounded-md bg-red-950/50 border border-red-800/50 text-[11px] text-red-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Warning: Personal demesne limit ({demesneLimit}) will be exceeded! Overextension penalties will apply.</span>
                  </div>
                )
              )}
            </div>

            {/* Cost & Submit Action */}
            <div className="pt-3 border-t border-white/10 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-stone-400 uppercase font-mono block">
                  Crown Cost
                </span>
                <span className="text-sm font-bold font-mono tabular-nums text-amber-300">
                  150 Gold
                </span>
                <span className="text-[11px] text-stone-400 font-mono tabular-nums ml-1.5">
                  (Crown Fisc: {Math.round(realm?.treasury ?? ruler.treasury ?? 0)}g)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsCharterModalOpen(false)}
                  className="px-3 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-stone-300 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleIssueCharter}
                  disabled={charterCellIndex === null || !charterName.trim() || (realm?.treasury ?? ruler.treasury ?? 0) < 150}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    charterCellIndex !== null && charterName.trim() && (realm?.treasury ?? ruler.treasury ?? 0) >= 150
                      ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg'
                      : 'bg-stone-800 text-stone-500 cursor-not-allowed opacity-60'
                  }`}
                >
                  <Crown className="w-3.5 h-3.5" />
                  <span>Sign Charter & Found</span>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {negotiatingWar && (
        <WarRoomModal
          isOpen={true}
          onClose={() => setNegotiatingWar(null)}
          world={world}
          war={negotiatingWar}
          playerRealmId={world.playerRealmId === null ? '' : world.playerRealmId || realm?.id || ''}
          onApplyWorld={(nextWorld: WorldState) => {
            onUpdateWorld(nextWorld);
            setNegotiatingWar(null);
          }}
          onNotify={(msg: string) => setNotificationMsg(msg)}
        />
      )}

      {realm && (
        <EstatesTradeModal
          isOpen={isEstatesModalOpen}
          onClose={() => setIsEstatesModalOpen(false)}
          world={world}
          realm={realm}
          onUpdateWorld={onUpdateWorld}
        />
      )}

      {ruler && (
        <LifestylePerksModal
          isOpen={isLifestyleModalOpen}
          onClose={() => setIsLifestyleModalOpen(false)}
          world={world}
          monarch={ruler}
          onUpdateWorld={onUpdateWorld}
        />
      )}

      {burg && (
        <CityMapModal
          isOpen={isCityMapOpen}
          onClose={() => setIsCityMapOpen(false)}
          world={world}
          burg={burg}
          onUpdateWorld={onUpdateWorld}
          onNotify={(msg: string) => {
            setNotificationMsg(msg);
            setTimeout(() => setNotificationMsg(null), 4000);
          }}
        />
      )}
    </>
  );
};
