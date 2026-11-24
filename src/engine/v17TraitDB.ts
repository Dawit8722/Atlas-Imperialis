/**
 * GRAND STRATEGY V17 LIVING ARCHITECTURE - COMPLETE 72-TRAIT DATABASE
 * Full port from Python V17 architecture with stats, system hooks, deeply merged
 * disposition multipliers, conflict/replacement rules, and full AI strategy weights.
 */
import { Character } from '../types/world';
export type V17Stat = 'MARTIAL' | 'DIPLOMACY' | 'STEWARDSHIP' | 'INTRIGUE' | 'LEARNING';
import { globalModRegistry } from './modSystem/registryManager';

export type V17TraitCategory = 'PHYSICAL' | 'MENTAL' | 'BEHAVIORAL' | 'LIFE_EXPERIENCE' | 'CONGENITAL' | 'COMMANDER' | 'LEGAL';
export type V17TraitRarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'LEGENDARY';
export type V17TraitSource = 'GENETIC' | 'BIRTH_CONDITION' | 'LIFE_EVENT' | 'AGE' | 'STRESS_BREAK';
export type V17SystemHook = 'ORBIT_DECAY' | 'SECRET_GEN' | 'ECONOMY' | 'POPULISM' | 'STRESS_RESIST' | 'FERTILITY' | 'HEALTH' | 'MORTALITY_RISK';
export type V17AIStrategy = 'COURT_PROXIMITY' | 'SOVEREIGN_GRAVITAS' | 'FACTION_REBELLION' | 'ROMANCE_AND_DYNASTY';

export interface V17DispositionMods {
  amb_mult?: number;
  loy_mult?: number;
  par_mult?: number;
  con_mult?: number;
}

export interface V17TraitDef {
  name: string;
  category: V17TraitCategory;
  rarity: V17TraitRarity;
  source: V17TraitSource;
  inheritable: boolean;
  reqEvent: boolean;
  minAge: number;
  maxAge: number;
  stats: Partial<Record<V17Stat, number>>;
  hooks: Partial<Record<V17SystemHook, number>>;
  disposition: Required<V17DispositionMods>;
  aiWeights: Partial<Record<V17AIStrategy, number>>;
  opposites?: readonly string[];
  replaces?: readonly string[];
  description?: string;
}

const TRAIT_REGISTRY: Record<string, V17TraitDef> = {};

function register(
  def: Omit<Partial<V17TraitDef>, 'disposition'> & {
    name: string;
    category: V17TraitCategory;
    disposition?: V17DispositionMods;
  }
): void {
  TRAIT_REGISTRY[def.name] = {
    name: def.name,
    category: def.category,
    rarity: def.rarity || 'COMMON',
    source: def.source || 'GENETIC',
    inheritable: def.inheritable ?? false,
    reqEvent: def.reqEvent ?? false,
    minAge: def.minAge ?? 0,
    maxAge: def.maxAge ?? 999,
    stats: def.stats || {},
    hooks: def.hooks || {},
    // Deep fallback merge prevents undefined/NaN multiplying downstream
    disposition: {
      amb_mult: def.disposition?.amb_mult ?? 1.0,
      loy_mult: def.disposition?.loy_mult ?? 1.0,
      par_mult: def.disposition?.par_mult ?? 1.0,
      con_mult: def.disposition?.con_mult ?? 1.0,
    },
    aiWeights: def.aiWeights || {},
    opposites: def.opposites || [],
    replaces: def.replaces || [],
    description: def.description || '',
  };
}

// ============================================================================
// 1. PHYSICAL (15)
// ============================================================================
register({
  name: 'Beautiful',
  category: 'PHYSICAL',
  rarity: 'UNCOMMON',
  source: 'GENETIC',
  inheritable: true,
  stats: { DIPLOMACY: 0.2 },
  hooks: { FERTILITY: 1.15, ORBIT_DECAY: 0.8 },
  aiWeights: { COURT_PROXIMITY: 1.35, ROMANCE_AND_DYNASTY: 1.5 },
  opposites: ['Ugly'],
  description: 'Striking symmetry and celestial poise that softens the hearts of monarchs.',
});

register({
  name: 'Ugly',
  category: 'PHYSICAL',
  rarity: 'UNCOMMON',
  source: 'GENETIC',
  inheritable: true,
  stats: { DIPLOMACY: -0.15 },
  hooks: { FERTILITY: 0.9, ORBIT_DECAY: 1.15 },
  aiWeights: { COURT_PROXIMITY: 0.75, ROMANCE_AND_DYNASTY: 0.5 },
  opposites: ['Beautiful'],
  description: 'Rough, asymmetrical visage that draws uneasy murmurs in court corridors.',
});

register({
  name: 'Herculean',
  category: 'PHYSICAL',
  rarity: 'RARE',
  source: 'GENETIC',
  inheritable: true,
  stats: { MARTIAL: 0.3 },
  hooks: { HEALTH: 0.85, MORTALITY_RISK: 0.85 },
  aiWeights: { SOVEREIGN_GRAVITAS: 1.4, FACTION_REBELLION: 1.2 },
  opposites: ['Feeble'],
  description: 'Towering sinew, unyielding stamina, and crushing vanguard power.',
});

register({
  name: 'Feeble',
  category: 'PHYSICAL',
  rarity: 'UNCOMMON',
  source: 'GENETIC',
  inheritable: true,
  stats: { MARTIAL: -0.3 },
  hooks: { HEALTH: 1.25, MORTALITY_RISK: 1.25 },
  aiWeights: { SOVEREIGN_GRAVITAS: 0.7, FACTION_REBELLION: 0.6 },
  opposites: ['Herculean', 'Robust'],
  description: 'Fragile constitution that falters beneath the weight of iron plate.',
});

register({
  name: 'Giant',
  category: 'PHYSICAL',
  rarity: 'LEGENDARY',
  source: 'GENETIC',
  inheritable: true,
  stats: { MARTIAL: 0.25, DIPLOMACY: -0.1 },
  hooks: { HEALTH: 0.95, MORTALITY_RISK: 0.95 },
  aiWeights: { SOVEREIGN_GRAVITAS: 1.5, COURT_PROXIMITY: 1.1 },
  opposites: ['Dwarf'],
  description: 'Colossal stature towering over common men, striking raw terror.',
});

register({
  name: 'Dwarf',
  category: 'PHYSICAL',
  rarity: 'LEGENDARY',
  source: 'GENETIC',
  inheritable: true,
  stats: { MARTIAL: -0.2, INTRIGUE: 0.15, STEWARDSHIP: 0.1 },
  aiWeights: { SOVEREIGN_GRAVITAS: 0.85, COURT_PROXIMITY: 1.2 },
  opposites: ['Giant'],
  description: 'Diminutive frame sharpening sharp wits, bookkeeping, and watchful eyes.',
});

register({
  name: 'Clubfooted',
  category: 'PHYSICAL',
  rarity: 'UNCOMMON',
  source: 'BIRTH_CONDITION',
  inheritable: true,
  stats: { MARTIAL: -0.15 },
  aiWeights: { SOVEREIGN_GRAVITAS: 0.9 },
  description: 'A twisted heel from birth, hindering swift charges upon the field.',
});

register({
  name: 'Hunchbacked',
  category: 'PHYSICAL',
  rarity: 'RARE',
  source: 'BIRTH_CONDITION',
  inheritable: true,
  stats: { DIPLOMACY: -0.1, INTRIGUE: 0.1 },
  aiWeights: { COURT_PROXIMITY: 0.8, FACTION_REBELLION: 1.1 },
  description: 'A curved spine that inspires superstitious awe and clandestine cunning.',
});

register({
  name: 'Wheezing',
  category: 'PHYSICAL',
  rarity: 'UNCOMMON',
  source: 'AGE',
  minAge: 50,
  stats: { MARTIAL: -0.2, LEARNING: 0.1 },
  hooks: { HEALTH: 1.25, MORTALITY_RISK: 1.25 },
  aiWeights: { SOVEREIGN_GRAVITAS: 0.85, COURT_PROXIMITY: 0.8 },
  description: 'Labored lungs with advancing years, yielding martial vigor to quiet scrolls.',
});

register({
  name: 'Robust',
  category: 'PHYSICAL',
  rarity: 'COMMON',
  source: 'GENETIC',
  inheritable: true,
  hooks: { HEALTH: 0.8, MORTALITY_RISK: 0.8, FERTILITY: 1.1 },
  aiWeights: { SOVEREIGN_GRAVITAS: 1.15 },
  opposites: ['Feeble'],
  description: 'Flourishing vital organs and stubborn resistance against pestilence.',
});

register({
  name: 'Ill',
  category: 'PHYSICAL',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  hooks: { HEALTH: 1.35, MORTALITY_RISK: 1.35, FERTILITY: 0.8 },
  aiWeights: { COURT_PROXIMITY: 0.5, FACTION_REBELLION: 0.7, ROMANCE_AND_DYNASTY: 0.6 },
  description: 'Stricken with burning humors, chills, and pestilential fever.',
});

register({
  name: 'Inbred',
  category: 'PHYSICAL',
  rarity: 'UNCOMMON',
  source: 'BIRTH_CONDITION',
  inheritable: true,
  hooks: { HEALTH: 1.4, MORTALITY_RISK: 1.4, FERTILITY: 0.5, STRESS_RESIST: 0.75 },
  aiWeights: { SOVEREIGN_GRAVITAS: 0.7, COURT_PROXIMITY: 0.8 },
  description: 'The perilous toll of pure-blood dynastic unions over generations.',
});

register({
  name: 'Incapable',
  category: 'PHYSICAL',
  rarity: 'RARE',
  source: 'AGE',
  minAge: 60,
  stats: { MARTIAL: -0.5, DIPLOMACY: -0.5, STEWARDSHIP: -0.5, INTRIGUE: -0.5, LEARNING: -0.5 },
  hooks: { STRESS_RESIST: 0.7, HEALTH: 1.5, MORTALITY_RISK: 1.5 },
  aiWeights: { COURT_PROXIMITY: 0.1, SOVEREIGN_GRAVITAS: 0.1, FACTION_REBELLION: 0.05, ROMANCE_AND_DYNASTY: 0.05 },
  description: 'Bedridden and infirm, unable to hold the royal scepter without a regent.',
});

register({
  name: 'Fertile',
  category: 'PHYSICAL',
  rarity: 'UNCOMMON',
  source: 'GENETIC',
  inheritable: true,
  hooks: { FERTILITY: 1.5 },
  aiWeights: { ROMANCE_AND_DYNASTY: 1.4 },
  opposites: ['Barren'],
  description: 'Blessed with fruitful lineage, securing an abundance of lawful heirs.',
});

register({
  name: 'Barren',
  category: 'PHYSICAL',
  rarity: 'RARE',
  source: 'GENETIC',
  inheritable: true,
  hooks: { FERTILITY: 0.1 },
  aiWeights: { ROMANCE_AND_DYNASTY: 0.3 },
  opposites: ['Fertile'],
  description: 'Unable to bring forth seed or cradle young successors to the cradle.',
});

register({
  name: 'Pregnant',
  category: 'PHYSICAL',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  inheritable: false,
  reqEvent: true,
  minAge: 16,
  maxAge: 50,
  stats: { MARTIAL: -0.1 },
  hooks: { FERTILITY: 0.0, HEALTH: 1.05, MORTALITY_RISK: 1.05 },
  aiWeights: { ROMANCE_AND_DYNASTY: 1.2, FACTION_REBELLION: 0.6 },
  opposites: ['Barren'],
  description: 'Carrying an unborn child; gestation takes 9 months until delivery.',
});

// ============================================
// 2. MENTAL (7)
// ============================================
register({
  name: 'Genius',
  category: 'MENTAL',
  rarity: 'LEGENDARY',
  source: 'GENETIC',
  inheritable: true,
  stats: { MARTIAL: 0.4, DIPLOMACY: 0.4, STEWARDSHIP: 0.4, INTRIGUE: 0.4, LEARNING: 0.4 },
  hooks: { SECRET_GEN: 1.3, STRESS_RESIST: 0.85 },
  disposition: { amb_mult: 1.2 },
  aiWeights: { COURT_PROXIMITY: 1.4, SOVEREIGN_GRAVITAS: 1.3, FACTION_REBELLION: 0.85, ROMANCE_AND_DYNASTY: 1.2 },
  opposites: ['Slow', 'Imbecile', 'Dull'],
  replaces: ['Quick'],
  description: 'A mind that grasps statecraft, philosophy, and siege mathematics with effortless brilliance.',
});

register({
  name: 'Quick',
  category: 'MENTAL',
  rarity: 'UNCOMMON',
  source: 'GENETIC',
  inheritable: true,
  stats: { LEARNING: 0.2, STEWARDSHIP: 0.1 },
  aiWeights: { COURT_PROXIMITY: 1.2, SOVEREIGN_GRAVITAS: 1.15 },
  opposites: ['Slow', 'Imbecile', 'Dull'],
  description: 'Keen perceptive intellect and agile comprehension of royal ledgers.',
});

register({
  name: 'Slow',
  category: 'MENTAL',
  rarity: 'UNCOMMON',
  source: 'GENETIC',
  inheritable: true,
  stats: { LEARNING: -0.2, STEWARDSHIP: -0.1 },
  aiWeights: { COURT_PROXIMITY: 0.7, FACTION_REBELLION: 1.2 },
  opposites: ['Genius', 'Quick', 'Shrewd'],
  description: 'Plodding comprehension requiring patient counselors to explain royal treaties.',
});

register({
  name: 'Imbecile',
  category: 'MENTAL',
  rarity: 'RARE',
  source: 'BIRTH_CONDITION',
  inheritable: true,
  stats: { MARTIAL: -0.5, DIPLOMACY: -0.5, STEWARDSHIP: -0.5, INTRIGUE: -0.5, LEARNING: -0.5 },
  disposition: { amb_mult: 0.5, con_mult: 0.8 },
  aiWeights: { COURT_PROXIMITY: 0.3, SOVEREIGN_GRAVITAS: 0.3, FACTION_REBELLION: 0.5, ROMANCE_AND_DYNASTY: 0.5 },
  opposites: ['Genius', 'Quick', 'Shrewd'],
  description: 'A cloud over the intellect, entirely reliant on dynastic regents and protectors.',
});

register({
  name: 'Shrewd',
  category: 'MENTAL',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  stats: { INTRIGUE: 0.25, STEWARDSHIP: 0.2 },
  aiWeights: { COURT_PROXIMITY: 1.3, FACTION_REBELLION: 0.8 },
  opposites: ['Dull', 'Slow', 'Imbecile'],
  description: 'Sharpened by palace intrigue and hard experience into a calculating judge of men.',
});

register({
  name: 'Dull',
  category: 'MENTAL',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  stats: { INTRIGUE: -0.2, STEWARDSHIP: -0.15 },
  aiWeights: { COURT_PROXIMITY: 0.8, FACTION_REBELLION: 1.15 },
  opposites: ['Shrewd', 'Quick', 'Genius'],
  description: 'Lacking curiosity for hidden motives or subtle financial sleights of hand.',
});

register({
  name: 'Lunatic',
  category: 'MENTAL',
  rarity: 'RARE',
  source: 'STRESS_BREAK',
  inheritable: true,
  stats: { INTRIGUE: 0.2, DIPLOMACY: -0.2 },
  hooks: { STRESS_RESIST: 0.7 },
  aiWeights: { COURT_PROXIMITY: 0.6, SOVEREIGN_GRAVITAS: 1.6, FACTION_REBELLION: 1.7 },
  description: 'Beset by visions and irrational royal decrees that confound foreign ambassadors.',
});

// ============================================
// 3. BEHAVIORAL (24)
// ============================================
register({
  name: 'Ambitious',
  category: 'BEHAVIORAL',
  rarity: 'COMMON',
  source: 'LIFE_EVENT',
  stats: { INTRIGUE: 0.2 },
  hooks: { STRESS_RESIST: 0.85 },
  disposition: { amb_mult: 2.0 },
  aiWeights: { COURT_PROXIMITY: 1.5, FACTION_REBELLION: 1.4, SOVEREIGN_GRAVITAS: 1.4, ROMANCE_AND_DYNASTY: 1.2 },
  opposites: ['Content'],
  description: 'Yearns for higher crowns and dominion; will never rest content as a minor lord.',
});

register({
  name: 'Content',
  category: 'BEHAVIORAL',
  rarity: 'COMMON',
  source: 'LIFE_EVENT',
  disposition: { amb_mult: 0.5, con_mult: 1.5 },
  aiWeights: { COURT_PROXIMITY: 0.7, FACTION_REBELLION: 0.3, SOVEREIGN_GRAVITAS: 0.6, ROMANCE_AND_DYNASTY: 0.9 },
  opposites: ['Ambitious'],
  description: 'Pleased with current estates and honors, posing little threat of mutiny to their liege.',
});

register({
  name: 'Lazy',
  category: 'BEHAVIORAL',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  disposition: { amb_mult: 0.6, con_mult: 1.2 },
  aiWeights: { COURT_PROXIMITY: 0.5, FACTION_REBELLION: 0.4, SOVEREIGN_GRAVITAS: 0.6 },
  opposites: ['Diligent'],
  description: 'Prefers long banquets and afternoon slumbers over inspecting border fortifications.',
});

register({
  name: 'Diligent',
  category: 'BEHAVIORAL',
  rarity: 'COMMON',
  source: 'LIFE_EVENT',
  stats: { STEWARDSHIP: 0.2 },
  disposition: { con_mult: 0.9 },
  aiWeights: { COURT_PROXIMITY: 1.3, SOVEREIGN_GRAVITAS: 1.3 },
  opposites: ['Lazy'],
  description: 'Examines every ledger and tax collector account down to the copper coin.',
});

register({
  name: 'Greedy',
  category: 'BEHAVIORAL',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  hooks: { ECONOMY: 1.4, POPULISM: 0.8 },
  disposition: { amb_mult: 1.3 },
  aiWeights: { SOVEREIGN_GRAVITAS: 1.5, FACTION_REBELLION: 1.1 },
  opposites: ['Generous'],
  description: 'Hoards golden bullion in subterranean vaults and squeezes tenant grain dues.',
});

register({
  name: 'Generous',
  category: 'BEHAVIORAL',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  hooks: { ECONOMY: 0.75, POPULISM: 1.25 },
  aiWeights: { SOVEREIGN_GRAVITAS: 0.85, COURT_PROXIMITY: 1.2 },
  opposites: ['Greedy'],
  description: 'Bestows gold on bards, builds almshouses, and wins the hearts of the peasant folk.',
});

register({
  name: 'Chaste',
  category: 'BEHAVIORAL',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  stats: { LEARNING: 0.2 },
  hooks: { FERTILITY: 0.65, STRESS_RESIST: 1.15 },
  aiWeights: { ROMANCE_AND_DYNASTY: 0.25 },
  opposites: ['Lustful'],
  description: 'Pious restraint guarding against the carnal temptations of courtly romance.',
});

register({
  name: 'Lustful',
  category: 'BEHAVIORAL',
  rarity: 'COMMON',
  source: 'LIFE_EVENT',
  hooks: { FERTILITY: 1.35, STRESS_RESIST: 0.85 },
  disposition: { amb_mult: 1.2 },
  aiWeights: { ROMANCE_AND_DYNASTY: 2.0, COURT_PROXIMITY: 1.2 },
  opposites: ['Chaste'],
  description: 'Driven by intense courtly passions, forbidden trysts, and scandalous chambers.',
});

register({
  name: 'Wrathful',
  category: 'BEHAVIORAL',
  rarity: 'COMMON',
  source: 'LIFE_EVENT',
  stats: { MARTIAL: 0.25 },
  hooks: { STRESS_RESIST: 0.75 },
  disposition: { amb_mult: 1.4 },
  aiWeights: { FACTION_REBELLION: 1.8, SOVEREIGN_GRAVITAS: 1.2 },
  opposites: ['Patient'],
  description: 'Quick to summon the executioner or declare blood vendettas upon the slightest slight.',
});

register({
  name: 'Patient',
  category: 'BEHAVIORAL',
  rarity: 'COMMON',
  source: 'LIFE_EVENT',
  stats: { STEWARDSHIP: 0.2 },
  hooks: { STRESS_RESIST: 1.2 },
  aiWeights: { FACTION_REBELLION: 0.65, COURT_PROXIMITY: 1.25 },
  opposites: ['Wrathful'],
  description: 'Waits for years for the optimal moment to strike, biding time like an old spider.',
});

register({
  name: 'Trusting',
  category: 'BEHAVIORAL',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  stats: { DIPLOMACY: 0.2 },
  disposition: { par_mult: 0.6 },
  aiWeights: { FACTION_REBELLION: 0.4, COURT_PROXIMITY: 1.2 },
  opposites: ['Paranoid'],
  description: 'Believes in the solemn word of sworn vassals, blind to daggers in the dark.',
});

register({
  name: 'Paranoid',
  category: 'BEHAVIORAL',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  stats: { INTRIGUE: 0.3 },
  hooks: { SECRET_GEN: 1.5, STRESS_RESIST: 0.75 },
  disposition: { par_mult: 1.8 },
  aiWeights: { COURT_PROXIMITY: 1.3, FACTION_REBELLION: 1.3 },
  opposites: ['Trusting'],
  description: 'Suspects cupbearers, spouses, and councilors alike of secret treason.',
});

register({
  name: 'Honest',
  category: 'BEHAVIORAL',
  rarity: 'COMMON',
  source: 'LIFE_EVENT',
  stats: { DIPLOMACY: 0.25 },
  hooks: { SECRET_GEN: 0.6 },
  aiWeights: { FACTION_REBELLION: 0.75, COURT_PROXIMITY: 1.1 },
  opposites: ['Deceitful'],
  description: 'Cannot bear falsehood; feudal agreements are sacred bonds unbroken by coin.',
});

register({
  name: 'Deceitful',
  category: 'BEHAVIORAL',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  stats: { INTRIGUE: 0.3 },
  hooks: { SECRET_GEN: 1.4 },
  aiWeights: { COURT_PROXIMITY: 1.4, FACTION_REBELLION: 1.35, ROMANCE_AND_DYNASTY: 1.2 },
  opposites: ['Honest'],
  description: 'Speaks with honeyed tongue while slipping poison into the rival chalice.',
});

register({
  name: 'Just',
  category: 'BEHAVIORAL',
  rarity: 'COMMON',
  source: 'LIFE_EVENT',
  stats: { STEWARDSHIP: 0.2, DIPLOMACY: 0.1 },
  hooks: { POPULISM: 1.25 },
  aiWeights: { SOVEREIGN_GRAVITAS: 1.35, FACTION_REBELLION: 0.7 },
  opposites: ['Arbitrary'],
  description: 'Upholds ancient kingdom charters impartially, venerated by nobles and serfs alike.',
});

register({
  name: 'Arbitrary',
  category: 'BEHAVIORAL',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  hooks: { POPULISM: 0.75 },
  aiWeights: { FACTION_REBELLION: 1.3, SOVEREIGN_GRAVITAS: 1.2 },
  opposites: ['Just'],
  description: 'Rules by whim and temper, dispensing land and dungeons without written trial.',
});

register({
  name: 'Compassionate',
  category: 'BEHAVIORAL',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  stats: { DIPLOMACY: 0.2 },
  hooks: { POPULISM: 1.2 },
  aiWeights: { FACTION_REBELLION: 0.6, ROMANCE_AND_DYNASTY: 1.2 },
  opposites: ['Callous'],
  description: 'Mourns the deaths of common levies and grants clemency to defeated rebels.',
});

register({
  name: 'Callous',
  category: 'BEHAVIORAL',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  hooks: { POPULISM: 0.8 },
  aiWeights: { FACTION_REBELLION: 1.35, SOVEREIGN_GRAVITAS: 1.25 },
  opposites: ['Compassionate'],
  description: 'Cold and indifferent to human suffering; sees vassals merely as chess pieces.',
});

register({
  name: 'Zealous',
  category: 'BEHAVIORAL',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  hooks: { POPULISM: 1.25 },
  aiWeights: { FACTION_REBELLION: 1.3, SOVEREIGN_GRAVITAS: 1.3 },
  opposites: ['Cynical'],
  description: 'Burns heretics at the stake and bows devoutly before holy pontiffs.',
});

register({
  name: 'Cynical',
  category: 'BEHAVIORAL',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  stats: { INTRIGUE: 0.25 },
  hooks: { STRESS_RESIST: 1.15 },
  aiWeights: { COURT_PROXIMITY: 1.25, ROMANCE_AND_DYNASTY: 0.8 },
  opposites: ['Zealous'],
  description: 'Views clerical rituals and divine prophecies as cynical tools of political mastery.',
});

register({
  name: 'Brave',
  category: 'BEHAVIORAL',
  rarity: 'COMMON',
  source: 'LIFE_EVENT',
  stats: { MARTIAL: 0.25 },
  hooks: { STRESS_RESIST: 1.25 },
  aiWeights: { FACTION_REBELLION: 1.6, SOVEREIGN_GRAVITAS: 1.3 },
  opposites: ['Craven'],
  description: 'First over the castle walls during a siege, rallying wavering infantry.',
});

register({
  name: 'Craven',
  category: 'BEHAVIORAL',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  stats: { MARTIAL: -0.25 },
  hooks: { STRESS_RESIST: 0.75 },
  aiWeights: { FACTION_REBELLION: 0.15, SOVEREIGN_GRAVITAS: 0.6, COURT_PROXIMITY: 0.7 },
  opposites: ['Brave'],
  description: 'Shivers in fear during claimant wars and seeks any excuse to avoid the frontlines.',
});

register({
  name: 'Gregarious',
  category: 'BEHAVIORAL',
  rarity: 'COMMON',
  source: 'LIFE_EVENT',
  stats: { DIPLOMACY: 0.25 },
  aiWeights: { COURT_PROXIMITY: 1.7, ROMANCE_AND_DYNASTY: 1.4 },
  opposites: ['Shy'],
  description: 'The life of every royal feast, forming alliances over flagons of spiced wine.',
});

register({
  name: 'Shy',
  category: 'BEHAVIORAL',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  stats: { LEARNING: 0.2, DIPLOMACY: -0.2 },
  aiWeights: { COURT_PROXIMITY: 0.35, ROMANCE_AND_DYNASTY: 0.6 },
  opposites: ['Gregarious'],
  description: 'Withdrawn and uncomfortable under the gaze of crowded court retinues.',
});

// ============================================
// 4. LIFE EXPERIENCE (12)
// ============================================
register({
  name: 'Wounded',
  category: 'LIFE_EXPERIENCE',
  rarity: 'COMMON',
  source: 'LIFE_EVENT',
  reqEvent: true,
  stats: { MARTIAL: -0.15 },
  hooks: { HEALTH: 1.2, MORTALITY_RISK: 1.2 },
  aiWeights: { FACTION_REBELLION: 0.85 },
  description: 'Nursing a bleeding saber cut or broken rib sustained in battle or travel.',
});

register({
  name: 'Maimed',
  category: 'LIFE_EXPERIENCE',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  reqEvent: true,
  stats: { MARTIAL: -0.25, DIPLOMACY: -0.15, INTRIGUE: 0.2 },
  aiWeights: { COURT_PROXIMITY: 0.8, FACTION_REBELLION: 0.8 },
  description: 'Permanently scarred by loss of a limb or deep disfiguring feudal trauma.',
});

register({
  name: 'Blinded',
  category: 'LIFE_EXPERIENCE',
  rarity: 'RARE',
  source: 'LIFE_EVENT',
  reqEvent: true,
  stats: { MARTIAL: -0.4, DIPLOMACY: -0.3, INTRIGUE: 0.4, LEARNING: 0.3 },
  aiWeights: { COURT_PROXIMITY: 0.4, FACTION_REBELLION: 0.5, SOVEREIGN_GRAVITAS: 0.7 },
  description: 'Deprived of sight by hot iron decree; now perceives the world through whispered shadows.',
});

register({
  name: 'Tortured',
  category: 'LIFE_EXPERIENCE',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  reqEvent: true,
  hooks: { HEALTH: 1.3, MORTALITY_RISK: 1.3, STRESS_RESIST: 0.7, SECRET_GEN: 1.3 },
  aiWeights: { FACTION_REBELLION: 1.75, COURT_PROXIMITY: 0.4 },
  description: 'Endured the rack and thumbscrew in deep royal dungeons; haunted by nightmares.',
});

register({
  name: 'Imprisoned',
  category: 'LIFE_EXPERIENCE',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  reqEvent: true,
  disposition: { par_mult: 1.4 },
  aiWeights: { COURT_PROXIMITY: 0.0, SOVEREIGN_GRAVITAS: 0.05, FACTION_REBELLION: 0.0, ROMANCE_AND_DYNASTY: 0.0 },
  description: 'Held in dark oubliettes awaiting royal ransom or judicial execution.',
});

register({
  name: 'Exiled',
  category: 'LIFE_EXPERIENCE',
  rarity: 'RARE',
  source: 'LIFE_EVENT',
  reqEvent: true,
  stats: { INTRIGUE: 0.2 },
  disposition: { amb_mult: 1.4 },
  aiWeights: { FACTION_REBELLION: 2.2, COURT_PROXIMITY: 0.1 },
  description: 'Cast beyond the realm borders; harbors bitter dreams of triumphant return.',
});

register({
  name: 'Betrayed',
  category: 'LIFE_EXPERIENCE',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  reqEvent: true,
  stats: { INTRIGUE: 0.25 },
  disposition: { par_mult: 1.5, loy_mult: 0.6 },
  aiWeights: { FACTION_REBELLION: 1.7, COURT_PROXIMITY: 0.5 },
  description: 'Stabbed in the back by a sworn friend or lover; trust is forever extinguished.',
});

register({
  name: 'Survived_Assassination',
  category: 'LIFE_EXPERIENCE',
  rarity: 'RARE',
  source: 'LIFE_EVENT',
  reqEvent: true,
  stats: { INTRIGUE: 0.2 },
  disposition: { par_mult: 1.4 },
  aiWeights: { COURT_PROXIMITY: 0.6, FACTION_REBELLION: 1.3 },
  description: 'Warded off an assassin’s poisoned blade in the dead of night; checks shadows obsessively.',
});

register({
  name: 'Paranoid_Break',
  category: 'LIFE_EXPERIENCE',
  rarity: 'RARE',
  source: 'STRESS_BREAK',
  reqEvent: true,
  stats: { INTRIGUE: 0.4 },
  hooks: { STRESS_RESIST: 0.5, SECRET_GEN: 1.5 },
  disposition: { par_mult: 2.0 },
  aiWeights: { COURT_PROXIMITY: 0.3, FACTION_REBELLION: 1.6 },
  description: 'Suffered a total psychotic break; convinced the entire court is in league to murder them.',
});

register({
  name: 'Tyrannical',
  category: 'LIFE_EXPERIENCE',
  rarity: 'RARE',
  source: 'LIFE_EVENT',
  reqEvent: true,
  stats: { MARTIAL: 0.2 },
  disposition: { amb_mult: 1.5 },
  aiWeights: { SOVEREIGN_GRAVITAS: 1.8, FACTION_REBELLION: 0.6 },
  description: 'Despised across the provinces for arbitrary executions, land seizures, and cruel taxation.',
});

register({
  name: 'Depressed',
  category: 'LIFE_EXPERIENCE',
  rarity: 'RARE',
  source: 'STRESS_BREAK',
  reqEvent: true,
  stats: { MARTIAL: -0.3, DIPLOMACY: -0.3, STEWARDSHIP: -0.3, INTRIGUE: -0.3, LEARNING: -0.3 },
  hooks: { STRESS_RESIST: 0.6, FERTILITY: 0.7, HEALTH: 1.2, MORTALITY_RISK: 1.2 },
  aiWeights: { COURT_PROXIMITY: 0.5, SOVEREIGN_GRAVITAS: 0.5, FACTION_REBELLION: 0.6, ROMANCE_AND_DYNASTY: 0.4 },
  description: 'Weighed down by grief and black melancholy, struggling to rise from royal bedchambers.',
});

register({
  name: 'Wroth',
  category: 'LIFE_EXPERIENCE',
  rarity: 'RARE',
  source: 'STRESS_BREAK',
  reqEvent: true,
  stats: { MARTIAL: 0.2 },
  disposition: { amb_mult: 1.3 },
  aiWeights: { FACTION_REBELLION: 1.75 },
  description: 'Consumed by sudden violent rages where councilors dare not speak.',
});

// ============================================
// 5. CONGENITAL (7)
// ============================================
register({
  name: 'Herculean_Blood',
  category: 'CONGENITAL',
  rarity: 'RARE',
  source: 'GENETIC',
  inheritable: true,
  stats: { MARTIAL: 0.15 },
  hooks: { HEALTH: 0.95, MORTALITY_RISK: 0.95 },
  aiWeights: { SOVEREIGN_GRAVITAS: 1.25 },
  description: 'The blood of legendary champions pulses through dynastic veins.',
});

register({
  name: 'Beautiful_Blood',
  category: 'CONGENITAL',
  rarity: 'RARE',
  source: 'GENETIC',
  inheritable: true,
  stats: { DIPLOMACY: 0.1 },
  hooks: { FERTILITY: 1.15 },
  aiWeights: { ROMANCE_AND_DYNASTY: 1.35, COURT_PROXIMITY: 1.15 },
  description: 'Generations of fair courtly beauty handed down the dynastic lineage.',
});

register({
  name: 'Genius_Blood',
  category: 'CONGENITAL',
  rarity: 'LEGENDARY',
  source: 'GENETIC',
  inheritable: true,
  stats: { LEARNING: 0.2, INTRIGUE: 0.1 },
  aiWeights: { COURT_PROXIMITY: 1.2, SOVEREIGN_GRAVITAS: 1.2 },
  description: 'A legacy of brilliant scholar-kings and peerless tacticians.',
});

register({
  name: 'Lunatic_Blood',
  category: 'CONGENITAL',
  rarity: 'RARE',
  source: 'GENETIC',
  inheritable: true,
  stats: { INTRIGUE: 0.15 },
  hooks: { STRESS_RESIST: 0.85 },
  aiWeights: { FACTION_REBELLION: 1.3 },
  description: 'A touch of divine madness that runs through the royal house.',
});

register({
  name: 'Fertile_Blood',
  category: 'CONGENITAL',
  rarity: 'UNCOMMON',
  source: 'GENETIC',
  inheritable: true,
  hooks: { FERTILITY: 1.25 },
  aiWeights: { ROMANCE_AND_DYNASTY: 1.4 },
  description: 'A lineage famed for flourishing cradles and prolific cadet branches.',
});

register({
  name: 'Cursed_Blood',
  category: 'CONGENITAL',
  rarity: 'LEGENDARY',
  source: 'GENETIC',
  inheritable: true,
  hooks: { HEALTH: 1.2, MORTALITY_RISK: 1.2, STRESS_RESIST: 0.8 },
  aiWeights: { COURT_PROXIMITY: 0.7, SOVEREIGN_GRAVITAS: 0.8 },
  description: 'An ancient dark hex said to doom the dynasty to sudden tragedies and plagues.',
});

register({
  name: 'Blessed_Blood',
  category: 'CONGENITAL',
  rarity: 'LEGENDARY',
  source: 'GENETIC',
  inheritable: true,
  stats: { MARTIAL: 0.1, DIPLOMACY: 0.1, STEWARDSHIP: 0.1, INTRIGUE: 0.1, LEARNING: 0.1 },
  aiWeights: { SOVEREIGN_GRAVITAS: 1.3, COURT_PROXIMITY: 1.2 },
  description: 'Anointed by the High Priests with holy favor and sacred dynastic luck.',
});

// ============================================
// 6. COMMANDER (5)
// ============================================
register({
  name: 'Aggressive',
  category: 'COMMANDER',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  stats: { MARTIAL: 0.2 },
  aiWeights: { FACTION_REBELLION: 1.45, SOVEREIGN_GRAVITAS: 1.2 },
  description: 'Fierce shock tactician who charges headlong into opposing defensive battlements.',
});

register({
  name: 'Defensive',
  category: 'COMMANDER',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  stats: { MARTIAL: 0.1, STEWARDSHIP: 0.1 },
  aiWeights: { FACTION_REBELLION: 0.75, SOVEREIGN_GRAVITAS: 1.2 },
  description: 'Master of shield walls, ramparts, and turning mountain passes into bloody choke points.',
});

register({
  name: 'Tactical',
  category: 'COMMANDER',
  rarity: 'RARE',
  source: 'LIFE_EVENT',
  stats: { MARTIAL: 0.2, LEARNING: 0.15 },
  aiWeights: { COURT_PROXIMITY: 1.2, FACTION_REBELLION: 0.9 },
  description: 'Reads the flow of armies like an open manuscript, executing brilliant flanking maneuvers.',
});

register({
  name: 'Strategic',
  category: 'COMMANDER',
  rarity: 'RARE',
  source: 'LIFE_EVENT',
  stats: { MARTIAL: 0.15, STEWARDSHIP: 0.2 },
  aiWeights: { COURT_PROXIMITY: 1.35, SOVEREIGN_GRAVITAS: 1.3 },
  description: 'Excels at supply trains, siege attrition, and maneuvering armies across hostile provinces.',
});

register({
  name: 'Charismatic',
  category: 'COMMANDER',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  stats: { DIPLOMACY: 0.25, MARTIAL: 0.1 },
  aiWeights: { COURT_PROXIMITY: 1.4, FACTION_REBELLION: 1.35, SOVEREIGN_GRAVITAS: 1.35 },
  description: 'Inspires ferocious loyalty; levies will follow this banner into the fires of doom.',
});

// ============================================
// 7. LEGAL (2)
// ============================================
register({
  name: 'Bastard',
  category: 'LEGAL',
  rarity: 'COMMON',
  source: 'BIRTH_CONDITION',
  stats: { DIPLOMACY: -0.2 },
  aiWeights: { SOVEREIGN_GRAVITAS: 0.75, FACTION_REBELLION: 1.4, ROMANCE_AND_DYNASTY: 0.8 },
  description: 'Born out of lawful wedlock, carrying the bar sinister on their coat of arms.',
});

register({
  name: 'Legitimized_Bastard',
  category: 'LEGAL',
  rarity: 'COMMON',
  source: 'LIFE_EVENT',
  stats: { DIPLOMACY: -0.05 },
  aiWeights: { COURT_PROXIMITY: 1.25, SOVEREIGN_GRAVITAS: 1.1, ROMANCE_AND_DYNASTY: 1.1 },
  replaces: ['Bastard'],
  description: 'Elevated by royal decree into the dynastic succession, though purists still grumble.',
});

// ============================================
// 8. EXTENDED PERSONALITY, EDUCATION, COMMANDER, CONGENITAL & LIFESTYLE TRAITS
// ============================================
// Additional Personality Traits
register({
  name: 'Calm',
  category: 'BEHAVIORAL',
  rarity: 'COMMON',
  source: 'LIFE_EVENT',
  stats: { DIPLOMACY: 0.15, STEWARDSHIP: 0.1, LEARNING: 0.1 },
  hooks: { STRESS_RESIST: 1.25 },
  disposition: { amb_mult: 0.85, par_mult: 0.8, con_mult: 1.2 },
  aiWeights: { COURT_PROXIMITY: 1.2, FACTION_REBELLION: 0.55, SOVEREIGN_GRAVITAS: 1.1 },
  opposites: ['Wrathful'],
  description: 'Serene and stoic even amid siege bombardment or venomous council debate.',
});

register({
  name: 'Sadistic',
  category: 'BEHAVIORAL',
  rarity: 'RARE',
  source: 'LIFE_EVENT',
  stats: { INTRIGUE: 0.3, MARTIAL: 0.1, DIPLOMACY: -0.25 },
  hooks: { SECRET_GEN: 1.45, POPULISM: 0.65, STRESS_RESIST: 1.1 },
  disposition: { amb_mult: 1.35, loy_mult: 0.7 },
  aiWeights: { SOVEREIGN_GRAVITAS: 1.35, FACTION_REBELLION: 1.55, COURT_PROXIMITY: 1.1, ROMANCE_AND_DYNASTY: 0.75 },
  opposites: ['Compassionate'],
  description: 'Delights in dungeon screams, cruel punishments, and merciless plots.',
});

register({
  name: 'Arrogant',
  category: 'BEHAVIORAL',
  rarity: 'COMMON',
  source: 'LIFE_EVENT',
  stats: { MARTIAL: 0.1, DIPLOMACY: -0.15 },
  disposition: { amb_mult: 1.35, loy_mult: 0.85 },
  aiWeights: { SOVEREIGN_GRAVITAS: 1.35, FACTION_REBELLION: 1.25, COURT_PROXIMITY: 0.85 },
  opposites: ['Humble'],
  description: 'Believes lesser lords exist solely to kneel before their house banner.',
});

register({
  name: 'Humble',
  category: 'BEHAVIORAL',
  rarity: 'COMMON',
  source: 'LIFE_EVENT',
  stats: { DIPLOMACY: 0.15, LEARNING: 0.1 },
  hooks: { POPULISM: 1.15 },
  disposition: { amb_mult: 0.75, loy_mult: 1.25, con_mult: 1.2 },
  aiWeights: { COURT_PROXIMITY: 1.15, FACTION_REBELLION: 0.65, SOVEREIGN_GRAVITAS: 0.9 },
  opposites: ['Arrogant'],
  description: 'Wears simple wool and listens to humble reeves and parish priests alike.',
});

register({
  name: 'Stubborn',
  category: 'BEHAVIORAL',
  rarity: 'COMMON',
  source: 'LIFE_EVENT',
  stats: { MARTIAL: 0.15, STEWARDSHIP: 0.1, DIPLOMACY: -0.1 },
  hooks: { STRESS_RESIST: 1.15 },
  disposition: { loy_mult: 1.2, con_mult: 1.15 },
  aiWeights: { SOVEREIGN_GRAVITAS: 1.25, FACTION_REBELLION: 1.1 },
  opposites: ['Fickle'],
  description: 'Once a royal decree is sealed, neither siege famine nor bribes sway them.',
});

register({
  name: 'Fickle',
  category: 'BEHAVIORAL',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  stats: { INTRIGUE: 0.15, STEWARDSHIP: -0.1, MARTIAL: -0.1 },
  disposition: { loy_mult: 0.7, par_mult: 1.1 },
  aiWeights: { FACTION_REBELLION: 1.3, COURT_PROXIMITY: 0.9, ROMANCE_AND_DYNASTY: 1.15 },
  opposites: ['Stubborn'],
  description: 'Shifts allegiances with the prevailing wind at court.',
});

register({
  name: 'Vengeful',
  category: 'BEHAVIORAL',
  rarity: 'COMMON',
  source: 'LIFE_EVENT',
  stats: { INTRIGUE: 0.25, MARTIAL: 0.15, DIPLOMACY: -0.15 },
  hooks: { SECRET_GEN: 1.25 },
  disposition: { amb_mult: 1.25, loy_mult: 0.75, par_mult: 1.25 },
  aiWeights: { FACTION_REBELLION: 1.6, SOVEREIGN_GRAVITAS: 1.2, COURT_PROXIMITY: 0.9 },
  opposites: ['Forgiving'],
  description: 'Etches every slight into iron memory, waiting decades to repay blood with blood.',
});

register({
  name: 'Forgiving',
  category: 'BEHAVIORAL',
  rarity: 'COMMON',
  source: 'LIFE_EVENT',
  stats: { DIPLOMACY: 0.25, INTRIGUE: -0.15 },
  hooks: { POPULISM: 1.15, STRESS_RESIST: 1.1 },
  disposition: { amb_mult: 0.85, loy_mult: 1.25, par_mult: 0.7 },
  aiWeights: { FACTION_REBELLION: 0.5, COURT_PROXIMITY: 1.3, ROMANCE_AND_DYNASTY: 1.2 },
  opposites: ['Vengeful'],
  description: 'Extends pardons to fallen rebels and heals ancient dynastic rifts.',
});

register({
  name: 'Gluttonous',
  category: 'BEHAVIORAL',
  rarity: 'COMMON',
  source: 'LIFE_EVENT',
  stats: { STEWARDSHIP: -0.2, MARTIAL: -0.1, DIPLOMACY: -0.05 },
  hooks: { ECONOMY: 0.85, HEALTH: 1.15, MORTALITY_RISK: 1.15 },
  disposition: { amb_mult: 0.9, con_mult: 1.15 },
  aiWeights: { COURT_PROXIMITY: 1.1, FACTION_REBELLION: 0.85, SOVEREIGN_GRAVITAS: 0.85 },
  opposites: ['Temperate'],
  description: 'Squanders grain tithes on endless banquets and spiced vintage casks.',
});

register({
  name: 'Temperate',
  category: 'BEHAVIORAL',
  rarity: 'COMMON',
  source: 'LIFE_EVENT',
  stats: { STEWARDSHIP: 0.25, LEARNING: 0.1, DIPLOMACY: 0.05 },
  hooks: { ECONOMY: 1.15, HEALTH: 0.9, MORTALITY_RISK: 0.9, STRESS_RESIST: 1.1 },
  disposition: { con_mult: 1.15 },
  aiWeights: { COURT_PROXIMITY: 1.2, SOVEREIGN_GRAVITAS: 1.2, FACTION_REBELLION: 0.8 },
  opposites: ['Gluttonous'],
  description: 'Lives modestly on bread and water, conserving bullion for realm fortresses.',
});

register({
  name: 'Impatient',
  category: 'BEHAVIORAL',
  rarity: 'COMMON',
  source: 'LIFE_EVENT',
  stats: { MARTIAL: 0.15, DIPLOMACY: -0.15, STEWARDSHIP: -0.1 },
  disposition: { amb_mult: 1.25, con_mult: 0.8 },
  aiWeights: { FACTION_REBELLION: 1.45, SOVEREIGN_GRAVITAS: 1.05 },
  opposites: ['Patient'],
  description: 'Orders hasty cavalry charges rather than enduring long diplomatic parleys.',
});

// Education Traits (24 Tiers 1-4)
// Diplomacy Education
register({
  name: 'Amateurish Plotter',
  category: 'LIFE_EXPERIENCE',
  rarity: 'COMMON',
  source: 'AGE',
  reqEvent: true,
  minAge: 16,
  stats: { DIPLOMACY: 0.08 },
  aiWeights: { COURT_PROXIMITY: 1.05 },
});
register({
  name: 'Flamboyant Trickster',
  category: 'LIFE_EXPERIENCE',
  rarity: 'COMMON',
  source: 'AGE',
  reqEvent: true,
  minAge: 16,
  stats: { DIPLOMACY: 0.16, INTRIGUE: 0.06 },
  aiWeights: { COURT_PROXIMITY: 1.15, ROMANCE_AND_DYNASTY: 1.1 },
});
register({
  name: 'Charismatic Negotiator',
  category: 'LIFE_EXPERIENCE',
  rarity: 'UNCOMMON',
  source: 'AGE',
  reqEvent: true,
  minAge: 16,
  stats: { DIPLOMACY: 0.28, STEWARDSHIP: 0.06 },
  hooks: { POPULISM: 1.15 },
  aiWeights: { COURT_PROXIMITY: 1.3, SOVEREIGN_GRAVITAS: 1.2, ROMANCE_AND_DYNASTY: 1.2 },
});
register({
  name: 'Grey Eminence',
  category: 'LIFE_EXPERIENCE',
  rarity: 'RARE',
  source: 'AGE',
  reqEvent: true,
  minAge: 16,
  stats: { DIPLOMACY: 0.42, STEWARDSHIP: 0.1, INTRIGUE: 0.1, LEARNING: 0.1 },
  hooks: { POPULISM: 1.25 },
  aiWeights: { COURT_PROXIMITY: 1.45, SOVEREIGN_GRAVITAS: 1.35, ROMANCE_AND_DYNASTY: 1.3 },
});

// Martial Education
register({
  name: 'Misguided Warrior',
  category: 'LIFE_EXPERIENCE',
  rarity: 'COMMON',
  source: 'AGE',
  reqEvent: true,
  minAge: 16,
  stats: { MARTIAL: 0.08 },
  aiWeights: { SOVEREIGN_GRAVITAS: 1.05 },
});
register({
  name: 'Tough Soldier',
  category: 'LIFE_EXPERIENCE',
  rarity: 'COMMON',
  source: 'AGE',
  reqEvent: true,
  minAge: 16,
  stats: { MARTIAL: 0.18 },
  aiWeights: { SOVEREIGN_GRAVITAS: 1.15, FACTION_REBELLION: 1.15 },
});
register({
  name: 'Skilled Tactician',
  category: 'LIFE_EXPERIENCE',
  rarity: 'UNCOMMON',
  source: 'AGE',
  reqEvent: true,
  minAge: 16,
  stats: { MARTIAL: 0.28, STEWARDSHIP: 0.06, LEARNING: 0.06 },
  aiWeights: { SOVEREIGN_GRAVITAS: 1.25, COURT_PROXIMITY: 1.15 },
});
register({
  name: 'Brilliant Strategist',
  category: 'LIFE_EXPERIENCE',
  rarity: 'RARE',
  source: 'AGE',
  reqEvent: true,
  minAge: 16,
  stats: { MARTIAL: 0.42, STEWARDSHIP: 0.1, LEARNING: 0.12 },
  aiWeights: { SOVEREIGN_GRAVITAS: 1.4, COURT_PROXIMITY: 1.25, FACTION_REBELLION: 1.15 },
});

// Stewardship Education
register({
  name: 'Indulgent Wastrel',
  category: 'LIFE_EXPERIENCE',
  rarity: 'COMMON',
  source: 'AGE',
  reqEvent: true,
  minAge: 16,
  stats: { STEWARDSHIP: 0.06 },
  hooks: { ECONOMY: 0.92 },
});
register({
  name: 'Thrifty Clerk',
  category: 'LIFE_EXPERIENCE',
  rarity: 'COMMON',
  source: 'AGE',
  reqEvent: true,
  minAge: 16,
  stats: { STEWARDSHIP: 0.18 },
  hooks: { ECONOMY: 1.1 },
  aiWeights: { COURT_PROXIMITY: 1.15 },
});
register({
  name: 'Fortune Builder',
  category: 'LIFE_EXPERIENCE',
  rarity: 'UNCOMMON',
  source: 'AGE',
  reqEvent: true,
  minAge: 16,
  stats: { STEWARDSHIP: 0.3, DIPLOMACY: 0.06 },
  hooks: { ECONOMY: 1.22 },
  aiWeights: { COURT_PROXIMITY: 1.25, SOVEREIGN_GRAVITAS: 1.2 },
});
register({
  name: 'Midas Touched',
  category: 'LIFE_EXPERIENCE',
  rarity: 'RARE',
  source: 'AGE',
  reqEvent: true,
  minAge: 16,
  stats: { STEWARDSHIP: 0.45, DIPLOMACY: 0.1, LEARNING: 0.1 },
  hooks: { ECONOMY: 1.38 },
  aiWeights: { COURT_PROXIMITY: 1.35, SOVEREIGN_GRAVITAS: 1.35 },
});

// Intrigue Education
register({
  name: 'Intrepid Shadow',
  category: 'LIFE_EXPERIENCE',
  rarity: 'COMMON',
  source: 'AGE',
  reqEvent: true,
  minAge: 16,
  stats: { INTRIGUE: 0.08 },
  hooks: { SECRET_GEN: 1.1 },
});
register({
  name: 'Suspicious Flunkey',
  category: 'LIFE_EXPERIENCE',
  rarity: 'COMMON',
  source: 'AGE',
  reqEvent: true,
  minAge: 16,
  stats: { INTRIGUE: 0.18, DIPLOMACY: -0.05 },
  hooks: { SECRET_GEN: 1.2 },
  aiWeights: { COURT_PROXIMITY: 1.1, FACTION_REBELLION: 1.1 },
});
register({
  name: 'Flamboyant Schemer',
  category: 'LIFE_EXPERIENCE',
  rarity: 'UNCOMMON',
  source: 'AGE',
  reqEvent: true,
  minAge: 16,
  stats: { INTRIGUE: 0.28, STEWARDSHIP: 0.05 },
  hooks: { SECRET_GEN: 1.35 },
  aiWeights: { COURT_PROXIMITY: 1.25, FACTION_REBELLION: 1.25 },
});
register({
  name: 'Elusive Shadow',
  category: 'LIFE_EXPERIENCE',
  rarity: 'RARE',
  source: 'AGE',
  reqEvent: true,
  minAge: 16,
  stats: { INTRIGUE: 0.44, STEWARDSHIP: 0.08, LEARNING: 0.08 },
  hooks: { SECRET_GEN: 1.5 },
  disposition: { amb_mult: 1.25, par_mult: 1.2 },
  aiWeights: { COURT_PROXIMITY: 1.35, FACTION_REBELLION: 1.35, SOVEREIGN_GRAVITAS: 1.2 },
});

// Learning Education
register({
  name: 'Conscientious Scribe',
  category: 'LIFE_EXPERIENCE',
  rarity: 'COMMON',
  source: 'AGE',
  reqEvent: true,
  minAge: 16,
  stats: { LEARNING: 0.1 },
});
register({
  name: 'Insightful Thinker',
  category: 'LIFE_EXPERIENCE',
  rarity: 'COMMON',
  source: 'AGE',
  reqEvent: true,
  minAge: 16,
  stats: { LEARNING: 0.2, STEWARDSHIP: 0.06 },
  hooks: { STRESS_RESIST: 1.1 },
});
register({
  name: 'Astute Intellectual',
  category: 'LIFE_EXPERIENCE',
  rarity: 'UNCOMMON',
  source: 'AGE',
  reqEvent: true,
  minAge: 16,
  stats: { LEARNING: 0.3, STEWARDSHIP: 0.08, DIPLOMACY: 0.06 },
  hooks: { STRESS_RESIST: 1.15 },
  aiWeights: { COURT_PROXIMITY: 1.2 },
});
register({
  name: 'Mastermind Philosopher',
  category: 'LIFE_EXPERIENCE',
  rarity: 'RARE',
  source: 'AGE',
  reqEvent: true,
  minAge: 16,
  stats: { LEARNING: 0.45, STEWARDSHIP: 0.12, DIPLOMACY: 0.1 },
  hooks: { STRESS_RESIST: 1.25 },
  aiWeights: { COURT_PROXIMITY: 1.3, SOVEREIGN_GRAVITAS: 1.25 },
});

// Prowess Education
register({
  name: 'Bumbling Squire',
  category: 'LIFE_EXPERIENCE',
  rarity: 'COMMON',
  source: 'AGE',
  reqEvent: true,
  minAge: 16,
  stats: { MARTIAL: 0.05 },
});
register({
  name: 'Confident Knight',
  category: 'LIFE_EXPERIENCE',
  rarity: 'COMMON',
  source: 'AGE',
  reqEvent: true,
  minAge: 16,
  stats: { MARTIAL: 0.12 },
  aiWeights: { SOVEREIGN_GRAVITAS: 1.15 },
});
register({
  name: 'Formidable Duelist',
  category: 'LIFE_EXPERIENCE',
  rarity: 'UNCOMMON',
  source: 'AGE',
  reqEvent: true,
  minAge: 16,
  stats: { MARTIAL: 0.2 },
  aiWeights: { SOVEREIGN_GRAVITAS: 1.25 },
});
register({
  name: 'Legendary Blademaster',
  category: 'LIFE_EXPERIENCE',
  rarity: 'RARE',
  source: 'AGE',
  reqEvent: true,
  minAge: 16,
  stats: { MARTIAL: 0.3, DIPLOMACY: 0.08 },
  aiWeights: { SOVEREIGN_GRAVITAS: 1.4 },
});

// Commander Traits (14)
register({
  name: 'Holy Warrior',
  category: 'COMMANDER',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  reqEvent: true,
  stats: { MARTIAL: 0.2, LEARNING: 0.08 },
  aiWeights: { SOVEREIGN_GRAVITAS: 1.25, FACTION_REBELLION: 1.15 },
});
register({
  name: 'Unyielding Defender',
  category: 'COMMANDER',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  reqEvent: true,
  stats: { MARTIAL: 0.22, STEWARDSHIP: 0.08 },
  aiWeights: { SOVEREIGN_GRAVITAS: 1.25, FACTION_REBELLION: 0.8 },
});
register({
  name: 'Aggressive Attacker',
  category: 'COMMANDER',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  reqEvent: true,
  stats: { MARTIAL: 0.25, STEWARDSHIP: -0.05 },
  aiWeights: { FACTION_REBELLION: 1.35, SOVEREIGN_GRAVITAS: 1.2 },
});
register({
  name: 'Flexible Leader',
  category: 'COMMANDER',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  reqEvent: true,
  stats: { MARTIAL: 0.2, DIPLOMACY: 0.06, INTRIGUE: 0.06 },
  aiWeights: { COURT_PROXIMITY: 1.15 },
});
register({
  name: 'Siege Engineer',
  category: 'COMMANDER',
  rarity: 'RARE',
  source: 'LIFE_EVENT',
  reqEvent: true,
  stats: { MARTIAL: 0.22, STEWARDSHIP: 0.15, LEARNING: 0.08 },
  hooks: { ECONOMY: 1.05 },
  aiWeights: { SOVEREIGN_GRAVITAS: 1.25 },
});
register({
  name: 'Desert Fox',
  category: 'COMMANDER',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  reqEvent: true,
  stats: { MARTIAL: 0.18, STEWARDSHIP: 0.06 },
});
register({
  name: 'Forest Stalker',
  category: 'COMMANDER',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  reqEvent: true,
  stats: { MARTIAL: 0.2, INTRIGUE: 0.12 },
});
register({
  name: 'Mountain Goatherd',
  category: 'COMMANDER',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  reqEvent: true,
  stats: { MARTIAL: 0.2, STEWARDSHIP: 0.08 },
});
register({
  name: 'Open Plains Master',
  category: 'COMMANDER',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  reqEvent: true,
  stats: { MARTIAL: 0.22 },
});
register({
  name: 'Ford Crosser',
  category: 'COMMANDER',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  reqEvent: true,
  stats: { MARTIAL: 0.16, STEWARDSHIP: 0.06 },
});
register({
  name: 'Reaver',
  category: 'COMMANDER',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  reqEvent: true,
  stats: { MARTIAL: 0.2, STEWARDSHIP: 0.12, DIPLOMACY: -0.1 },
  hooks: { ECONOMY: 1.1 },
  aiWeights: { FACTION_REBELLION: 1.3 },
});
register({
  name: 'Winter Soldier',
  category: 'COMMANDER',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  reqEvent: true,
  stats: { MARTIAL: 0.2, STEWARDSHIP: 0.08 },
});
register({
  name: 'Reckless',
  category: 'COMMANDER',
  rarity: 'COMMON',
  source: 'LIFE_EVENT',
  reqEvent: true,
  stats: { MARTIAL: 0.18, STEWARDSHIP: -0.08, INTRIGUE: -0.06 },
  aiWeights: { FACTION_REBELLION: 1.4 },
});
register({
  name: 'Organizer',
  category: 'COMMANDER',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  reqEvent: true,
  stats: { MARTIAL: 0.2, STEWARDSHIP: 0.15 },
  aiWeights: { COURT_PROXIMITY: 1.2 },
});

// Additional Congenital, Health, Lifestyle & Status Traits
register({
  name: 'Intelligent',
  category: 'MENTAL',
  rarity: 'RARE',
  source: 'GENETIC',
  inheritable: true,
  stats: { MARTIAL: 0.22, DIPLOMACY: 0.22, STEWARDSHIP: 0.22, INTRIGUE: 0.22, LEARNING: 0.22 },
  hooks: { STRESS_RESIST: 1.1 },
  aiWeights: { COURT_PROXIMITY: 1.3, SOVEREIGN_GRAVITAS: 1.2 },
  opposites: ['Slow', 'Imbecile', 'Stupid'],
});
register({
  name: 'Stupid',
  category: 'MENTAL',
  rarity: 'UNCOMMON',
  source: 'GENETIC',
  inheritable: true,
  stats: { MARTIAL: -0.25, DIPLOMACY: -0.25, STEWARDSHIP: -0.25, INTRIGUE: -0.25, LEARNING: -0.25 },
  opposites: ['Genius', 'Intelligent', 'Quick'],
});
register({
  name: 'Handsome',
  category: 'PHYSICAL',
  rarity: 'UNCOMMON',
  source: 'GENETIC',
  inheritable: true,
  stats: { DIPLOMACY: 0.18, INTRIGUE: 0.06 },
  hooks: { FERTILITY: 1.15 },
  aiWeights: { COURT_PROXIMITY: 1.25, ROMANCE_AND_DYNASTY: 1.4 },
});
register({
  name: 'Comely',
  category: 'PHYSICAL',
  rarity: 'COMMON',
  source: 'GENETIC',
  inheritable: true,
  stats: { DIPLOMACY: 0.12 },
  hooks: { FERTILITY: 1.1 },
  aiWeights: { ROMANCE_AND_DYNASTY: 1.25 },
});
register({
  name: 'Homely',
  category: 'PHYSICAL',
  rarity: 'COMMON',
  source: 'GENETIC',
  inheritable: true,
  stats: { DIPLOMACY: -0.08 },
  aiWeights: { ROMANCE_AND_DYNASTY: 0.75 },
});
register({
  name: 'Hideous',
  category: 'PHYSICAL',
  rarity: 'RARE',
  source: 'GENETIC',
  inheritable: true,
  stats: { DIPLOMACY: -0.25, INTRIGUE: 0.08 },
  aiWeights: { COURT_PROXIMITY: 0.6, ROMANCE_AND_DYNASTY: 0.35 },
});
register({
  name: 'Hale',
  category: 'PHYSICAL',
  rarity: 'COMMON',
  source: 'GENETIC',
  inheritable: true,
  stats: { MARTIAL: 0.08 },
  hooks: { HEALTH: 0.9, MORTALITY_RISK: 0.9, FERTILITY: 1.05 },
});
register({
  name: 'Delicate',
  category: 'PHYSICAL',
  rarity: 'COMMON',
  source: 'GENETIC',
  inheritable: true,
  stats: { MARTIAL: -0.08 },
  hooks: { HEALTH: 1.1, MORTALITY_RISK: 1.1 },
});
register({
  name: 'Frail',
  category: 'PHYSICAL',
  rarity: 'UNCOMMON',
  source: 'GENETIC',
  inheritable: true,
  stats: { MARTIAL: -0.18 },
  hooks: { HEALTH: 1.2, MORTALITY_RISK: 1.2 },
});
register({
  name: 'Fecund',
  category: 'PHYSICAL',
  rarity: 'UNCOMMON',
  source: 'GENETIC',
  inheritable: true,
  stats: { DIPLOMACY: 0.08 },
  hooks: { FERTILITY: 1.45 },
  aiWeights: { ROMANCE_AND_DYNASTY: 1.4 },
});
register({
  name: 'Infirm',
  category: 'LIFE_EXPERIENCE',
  rarity: 'UNCOMMON',
  source: 'AGE',
  reqEvent: true,
  minAge: 55,
  stats: { MARTIAL: -0.3, DIPLOMACY: -0.15, STEWARDSHIP: -0.15, INTRIGUE: -0.15 },
  hooks: { HEALTH: 1.4, MORTALITY_RISK: 1.4 },
  aiWeights: { FACTION_REBELLION: 0.3, COURT_PROXIMITY: 0.4 },
});
register({
  name: 'Bubonic Plague',
  category: 'LIFE_EXPERIENCE',
  rarity: 'RARE',
  source: 'LIFE_EVENT',
  reqEvent: true,
  stats: { MARTIAL: -0.4, DIPLOMACY: -0.35, STEWARDSHIP: -0.35, INTRIGUE: -0.3 },
  hooks: { HEALTH: 2.0, MORTALITY_RISK: 2.0, FERTILITY: 0.2 },
  aiWeights: { FACTION_REBELLION: 0.15, ROMANCE_AND_DYNASTY: 0.1 },
});
register({
  name: 'Avaricious',
  category: 'LIFE_EXPERIENCE',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  reqEvent: true,
  stats: { STEWARDSHIP: 0.28, DIPLOMACY: -0.1 },
  hooks: { ECONOMY: 1.25 },
  aiWeights: { SOVEREIGN_GRAVITAS: 1.25 },
});
register({
  name: 'Administrator',
  category: 'LIFE_EXPERIENCE',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  reqEvent: true,
  stats: { STEWARDSHIP: 0.25, DIPLOMACY: 0.08 },
  hooks: { ECONOMY: 1.2 },
  aiWeights: { COURT_PROXIMITY: 1.25 },
});
register({
  name: 'Architect',
  category: 'LIFE_EXPERIENCE',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  reqEvent: true,
  stats: { STEWARDSHIP: 0.25, LEARNING: 0.12 },
  hooks: { ECONOMY: 1.15 },
});
register({
  name: 'Master Schemer',
  category: 'LIFE_EXPERIENCE',
  rarity: 'RARE',
  source: 'LIFE_EVENT',
  reqEvent: true,
  stats: { INTRIGUE: 0.35, STEWARDSHIP: 0.06 },
  hooks: { SECRET_GEN: 1.4 },
  aiWeights: { COURT_PROXIMITY: 1.3, FACTION_REBELLION: 1.3 },
});
register({
  name: 'Diplomat',
  category: 'LIFE_EXPERIENCE',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  reqEvent: true,
  stats: { DIPLOMACY: 0.3, STEWARDSHIP: 0.06 },
  aiWeights: { COURT_PROXIMITY: 1.35 },
});
register({
  name: 'Scholar',
  category: 'LIFE_EXPERIENCE',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  reqEvent: true,
  stats: { LEARNING: 0.3, STEWARDSHIP: 0.08 },
});
register({
  name: 'Theologian',
  category: 'LIFE_EXPERIENCE',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  reqEvent: true,
  stats: { LEARNING: 0.3, DIPLOMACY: 0.08 },
});
register({
  name: 'Celibate',
  category: 'LIFE_EXPERIENCE',
  rarity: 'UNCOMMON',
  source: 'LIFE_EVENT',
  reqEvent: true,
  stats: { LEARNING: 0.15, STEWARDSHIP: 0.06 },
  hooks: { FERTILITY: 0.05 },
  aiWeights: { ROMANCE_AND_DYNASTY: 0.1 },
});
register({
  name: 'Paragon of Virtue',
  category: 'LEGAL',
  rarity: 'RARE',
  source: 'LIFE_EVENT',
  reqEvent: true,
  stats: { DIPLOMACY: 0.25, LEARNING: 0.15, INTRIGUE: -0.15 },
  hooks: { POPULISM: 1.3 },
  aiWeights: { SOVEREIGN_GRAVITAS: 1.4, FACTION_REBELLION: 0.45 },
});
register({
  name: 'Dreaded',
  category: 'LEGAL',
  rarity: 'RARE',
  source: 'LIFE_EVENT',
  reqEvent: true,
  stats: { MARTIAL: 0.15, INTRIGUE: 0.15, DIPLOMACY: -0.1 },
  aiWeights: { SOVEREIGN_GRAVITAS: 1.45, FACTION_REBELLION: 0.65 },
});
register({
  name: 'Kinslayer',
  category: 'LEGAL',
  rarity: 'RARE',
  source: 'LIFE_EVENT',
  reqEvent: true,
  stats: { DIPLOMACY: -0.25, INTRIGUE: 0.12 },
  hooks: { POPULISM: 0.7 },
  aiWeights: { COURT_PROXIMITY: 0.6, FACTION_REBELLION: 1.3 },
});

// Export plain Record to preserve direct indexing across existing UI components
export const V17_TRAIT_DB: Record<string, V17TraitDef> = TRAIT_REGISTRY;

export function getV17Trait(name: string): V17TraitDef | undefined {
  const reg = globalModRegistry.getRegistry<V17TraitDef & { id: string }>('traits');
  if (reg.size() > 0) {
    const modded = reg.get(name);
    if (modded) return modded;
  }
  return TRAIT_REGISTRY[name];
}

export function getAllV17Traits(): V17TraitDef[] {
  const reg = globalModRegistry.getRegistry<V17TraitDef & { id: string }>('traits');
  if (reg.size() > 0) {
    return reg.getAll();
  }
  return Object.values(TRAIT_REGISTRY);
}

export function getHookMultiplier(traits: string[], hook: V17SystemHook): number {
  let m = 1.0;
  for (const t of traits) {
    const def = getV17Trait(t);
    if (def && def.hooks) {
      // Cross-compatible: checks exact hook, or bridges HEALTH <-> MORTALITY_RISK
      const val = def.hooks[hook] ?? (
        hook === 'HEALTH' ? def.hooks.MORTALITY_RISK :
        hook === 'MORTALITY_RISK' ? def.hooks.HEALTH :
        undefined
      );
      if (val !== undefined) {
        m *= val;
      }
    }
  }
  return m;
}

export function computeV17StatModifier(traits: string[], stat: V17Stat): number {
  let mod = 0.0;
  for (const t of traits) {
    const def = getV17Trait(t);
    if (def && def.stats && def.stats[stat] !== undefined) {
      mod += def.stats[stat]!;
    }
  }
  return mod;
}

export function computeDispositionModifiers(traits: string[]): Required<V17DispositionMods> {
  let amb = 1.0;
  let loy = 1.0;
  let par = 1.0;
  let con = 1.0;

  for (const t of traits) {
    const def = getV17Trait(t);
    if (def) {
      amb *= def.disposition.amb_mult;
      loy *= def.disposition.loy_mult;
      par *= def.disposition.par_mult;
      con *= def.disposition.con_mult;
    }
  }

  return { amb_mult: amb, loy_mult: loy, par_mult: par, con_mult: con };
}

const AI_MIN_WEIGHT = 0.05;
const AI_MAX_WEIGHT = 5.00;

export function computeAIStrategyWeight(traits: string[], strategy: V17AIStrategy): number {
  let rawWeight = 1.0;
  for (const t of traits) {
    const def = TRAIT_REGISTRY[t];
    if (def?.aiWeights[strategy] !== undefined) {
      rawWeight *= def.aiWeights[strategy]!;
    }
  }
  return Math.min(AI_MAX_WEIGHT, Math.max(AI_MIN_WEIGHT, rawWeight));
}

export function getAIStrategyDistribution(traits: string[]): Record<V17AIStrategy, number> {
  const strategies: readonly V17AIStrategy[] = [
    'COURT_PROXIMITY',
    'SOVEREIGN_GRAVITAS',
    'FACTION_REBELLION',
    'ROMANCE_AND_DYNASTY'
  ];

  const weights = strategies.map(s => computeAIStrategyWeight(traits, s));
  const sum = weights.reduce((acc, val) => acc + val, 0);

  return {
    COURT_PROXIMITY: weights[0] / sum,
    SOVEREIGN_GRAVITAS: weights[1] / sum,
    FACTION_REBELLION: weights[2] / sum,
    ROMANCE_AND_DYNASTY: weights[3] / sum,
  };
}

export function canAddTrait(currentTraits: string[], newTraitName: string): { 
  valid: boolean; 
  conflict?: string; 
  toRemove: string[];
} {
  const newDef = getV17Trait(newTraitName);
  if (!newDef) {
    return { valid: false, conflict: `Trait "${newTraitName}" does not exist.`, toRemove: [] };
  }

  const currentSet = new Set(currentTraits);
  if (currentSet.has(newTraitName)) {
    return { valid: false, conflict: `Character already has trait "${newTraitName}".`, toRemove: [] };
  }

  for (const opp of newDef.opposites || []) {
    if (currentSet.has(opp)) {
      return { valid: false, conflict: `Incompatible with existing trait "${opp}".`, toRemove: [] };
    }
  }

  const toRemove = (newDef.replaces || []).filter(id => currentSet.has(id));
  return { valid: true, toRemove };
}

export function syncCharacterTraits(char: Character): void {
  const combined = new Set<string>();

  // 1. Ingest all separate trait sources
  (char.personalityTraits || []).forEach((t) => combined.add(t));
  (char.congenitalTraits || []).forEach((t) => combined.add(t));
  (char.physicalHealthTraits || []).forEach((t) => combined.add(t));
  (char.commanderTraits || []).forEach((t) => combined.add(t));
  (char.lifestyleTraits || []).forEach((t) => combined.add(t));
  if (char.educationTrait) combined.add(char.educationTrait);
  if (char.statusTrait) combined.add(char.statusTrait);
  (char.v17Traits || []).forEach((t) => combined.add(t));

  // 2. Sync pregnancy trait state cleanly
  if (char.monthsPregnant !== undefined && char.monthsPregnant >= 0) {
    combined.add('Pregnant');
    if (!char.physicalHealthTraits) char.physicalHealthTraits = [];
    if (!char.physicalHealthTraits.includes('Pregnant')) {
      char.physicalHealthTraits.push('Pregnant');
    }
  }

  // 3. Name-bridge differences between standard and grand strategy naming conventions
  if (combined.has('Pure-Blooded') || combined.has('Pure-Blood')) combined.add('Blessed_Blood');
  if (combined.has('Legitimated Bastard')) combined.add('Legitimized_Bastard');
  if (combined.has('Disinherited Bastard')) combined.add('Bastard');
  if (combined.has('Severely Injured')) combined.add('Wounded');
  if (combined.has('Brutally Maimed')) combined.add('Maimed');
  if (combined.has('Blind')) combined.add('Blinded');
  if (combined.has('Melancholic')) combined.add('Depressed');

  // 4. Assign the unified list back to v17Traits
  char.v17Traits = Array.from(combined);
}