import {
  Character,
  DeathCategory,
  ExecutionMethod,
  JudicialSentenceRecord,
  JudicialSentenceType,
  WorldState,
} from '../types/world';
import { rollDiceCheck } from './diceEngine';
import { recordRealmBudgetExtra } from './economyEngine';
import { isCharacterRoyalLineage } from './fantasyTables';

// ============================================================================
// 1. EXTENSIVE MEDIEVAL CAUSE-OF-DEATH REGISTRY
// ============================================================================

export const OLD_AGE_DEATHS: readonly string[] = [
  'Frailty of Years',
  'Peaceful Passing in Sleep',
  'Failing Heart',
  'Apoplexy (Sudden Stroke)',
  'Winter Chill of Old Age',
  'Wasting Decline',
  'Senile Infirmity',
  'Exhaustion of the Spirit',
  'Quiet Twilight of Years',
  'Dropsy of the Aged',
  'Catarrh of the Chest',
  'Natural Causes & Advanced Age',
];

export const DISEASE_DEATHS: readonly string[] = [
  'Red Flux (Bloody Dysentery)',
  'Sweating Sickness',
  'Black Pox',
  'Consumption (White Plague)',
  'Camp Fever (Typhus)',
  'Spotted Fever',
  'Lung Rot (Pneumonia)',
  'Marsh Ague (Malaria)',
  'Grey Shakes (Palsy)',
  'Gangrenous Sepsis',
  'Crimson Cough (Whooping Plague)',
  'Dropsy (Edema)',
  'Bone-Break Fever',
  'Putrid Throat (Diphtheria)',
  "St. Anthony's Fire (Ergotism)",
  'Malignant Quinsy',
  'Leprous Wasting',
  'Black Death (Bubonic Pestilence)',
  'Summer Cholera',
  'Yellow Jaundice',
  'Brain Fever (Meningitis)',
  "Scrofula (King's Evil)",
  'Putrid Wound Fever',
  'Tertian Fever',
];

export const CHILDBED_DEATHS: readonly string[] = [
  'Childbed Fever',
  'Complications of Childbirth',
  'Puerperal Sepsis',
];

export const WAR_DEATHS: readonly string[] = [
  'Slain in Pitched Battle',
  'Pierced by Heavy Lance',
  "Felled by Archer's Volley",
  'Crushed in a Siege Breach',
  'Slain in Judicial Duel',
  'Border Ambush',
  'Trampled by Charging Horse',
  'Trebuchet & Siege Shrapnel',
  'Mortally Wounded in Skirmish',
  'Struck Down in Peasant Uprising',
  'Fell Defending the Banner',
  'Cleaved in Vanguard Melee',
];

export const ASSASSINATION_DEATHS: readonly string[] = [
  'Poisoned Chalice at Banquet',
  "Assassin's Dagger in the Dark",
  'Nightshade in the Evening Wine',
  'Strangled in the Bedchamber',
  'Venomous Needle at Court',
  'Betrayed by Sworn Bodyguard',
];

export const EXECUTION_METHODS: readonly ExecutionMethod[] = [
  'Beheading on the Block',
  'Hanged at the Gallows',
  'Broken on the Wheel',
  'Burned at the Stake',
  'Drawn & Quartered',
  'Cast from the Keep',
  'Strangled in the Dungeon',
  'Drowned in the River',
  'Starved in the Oubliette',
  'Impaled on the Ramparts',
];

export const ACCIDENT_DEATHS: readonly string[] = [
  'Hunting Boar Goring',
  'Thrown from Warhorse',
  'Fall from Citadel Battlements',
  'Drowned Crossing Swollen Ford',
  'Hearth-Fire Collapse',
  'Choked at Royal Banquet',
  'Frozen in Mountain Pass',
  'Crushed in Timber Collapse',
];

export const ALL_DEATH_CAUSES_BY_CATEGORY: Record<DeathCategory, readonly string[]> = {
  'Old Age & Natural Decline': OLD_AGE_DEATHS,
  'Disease & Illness': [...DISEASE_DEATHS, ...CHILDBED_DEATHS],
  'War & Violence': [...WAR_DEATHS, ...ASSASSINATION_DEATHS],
  Execution: EXECUTION_METHODS,
  'Accident & Misfortune': ACCIDENT_DEATHS,
};

export function inferDeathCategory(cause?: string): DeathCategory {
  if (!cause) return 'Old Age & Natural Decline';
  const lower = cause.toLowerCase();
  if (
    EXECUTION_METHODS.some((m) => m.toLowerCase() === lower) ||
    lower.includes('execut') ||
    lower.includes('behead') ||
    lower.includes('gallows') ||
    lower.includes('hanged') ||
    lower.includes('stake') ||
    lower.includes('wheel') ||
    lower.includes('quartered') ||
    lower.includes('oubliette') ||
    lower.includes('impaled')
  ) {
    return 'Execution';
  }
  if (
    lower.includes('battle') ||
    lower.includes('duel') ||
    lower.includes('lance') ||
    lower.includes('archer') ||
    lower.includes('siege') ||
    lower.includes('ambush') ||
    lower.includes('skirmish') ||
    lower.includes('war') ||
    lower.includes('assassin') ||
    lower.includes('poison') ||
    lower.includes('dagger') ||
    lower.includes('murder') ||
    lower.includes('slain') ||
    lower.includes('campaign') ||
    lower.includes('melee') ||
    lower.includes('betrayed')
  ) {
    return 'War & Violence';
  }
  if (
    lower.includes('boar') ||
    lower.includes('horse') ||
    lower.includes('fall ') ||
    lower.includes('drowned crossing') ||
    lower.includes('choked') ||
    lower.includes('frozen') ||
    lower.includes('collapse') ||
    lower.includes('accident') ||
    lower.includes('hunting')
  ) {
    return 'Accident & Misfortune';
  }
  if (
    lower.includes('fever') ||
    lower.includes('plague') ||
    lower.includes('pox') ||
    lower.includes('flux') ||
    lower.includes('consumption') ||
    lower.includes('cough') ||
    lower.includes('ague') ||
    lower.includes('sepsis') ||
    lower.includes('lepro') ||
    lower.includes('cholera') ||
    lower.includes('jaundice') ||
    lower.includes('quinsy') ||
    lower.includes('scrofula') ||
    lower.includes('lung rot') ||
    lower.includes('putrid') ||
    lower.includes('childbed') ||
    lower.includes('childbirth') ||
    lower.includes('sweating') ||
    lower.includes('palsy') ||
    lower.includes('sickness') ||
    lower.includes('illness') ||
    lower.includes('pestilence') ||
    lower.includes('ergotism')
  ) {
    return 'Disease & Illness';
  }
  return 'Old Age & Natural Decline';
}

export function pickContextualDeathCause(
  char: Character,
  context: 'natural' | 'disease' | 'war' | 'assassination' | 'execution' | 'accident',
  rng: () => number = Math.random,
  executionMethod?: ExecutionMethod
): { cause: string; category: DeathCategory } {
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)] ?? arr[0];

  if (context === 'execution') {
    const method = executionMethod || pick(EXECUTION_METHODS);
    return { cause: `Royal Execution (${method})`, category: 'Execution' };
  }
  if (context === 'war') {
    return { cause: pick(WAR_DEATHS), category: 'War & Violence' };
  }
  if (context === 'assassination') {
    return { cause: pick(ASSASSINATION_DEATHS), category: 'War & Violence' };
  }
  if (context === 'accident') {
    return { cause: pick(ACCIDENT_DEATHS), category: 'Accident & Misfortune' };
  }
  if (context === 'disease') {
    const healthTraits = char.physicalHealthTraits || [];
    if (healthTraits.includes('Bubonic Plague')) {
      return { cause: 'Black Death (Bubonic Pestilence)', category: 'Disease & Illness' };
    }
    if (healthTraits.includes('Leprous')) {
      return { cause: 'Leprous Wasting', category: 'Disease & Illness' };
    }
    if (char.gender === 'female' && char.age >= 18 && char.age <= 42 && char.spouseId && rng() < 0.18) {
      return { cause: pick(CHILDBED_DEATHS), category: 'Disease & Illness' };
    }
    return { cause: pick(DISEASE_DEATHS), category: 'Disease & Illness' };
  }

  // Context === 'natural' — weight by age, traits, and medical conditions
  const healthTraits = char.physicalHealthTraits || [];
  if (healthTraits.includes('Bubonic Plague')) {
    return { cause: 'Black Death (Bubonic Pestilence)', category: 'Disease & Illness' };
  }
  if (healthTraits.includes('Leprous')) {
    return { cause: 'Leprous Wasting', category: 'Disease & Illness' };
  }
  if (healthTraits.includes('Severely Injured') && rng() < 0.55) {
    return { cause: 'Putrid Wound Fever', category: 'Disease & Illness' };
  }

  // Younger characters rarely die of "old age" — weight toward diseases, childbed, or accidents
  if (char.age < 52) {
    const roll = rng();
    if (char.gender === 'female' && char.age >= 18 && char.age <= 40 && char.spouseId && roll < 0.16) {
      return { cause: pick(CHILDBED_DEATHS), category: 'Disease & Illness' };
    }
    if (roll < 0.78) {
      return { cause: pick(DISEASE_DEATHS), category: 'Disease & Illness' };
    }
    return { cause: pick(ACCIDENT_DEATHS), category: 'Accident & Misfortune' };
  }

  if (char.age < 65) {
    return rng() < 0.52
      ? { cause: pick(DISEASE_DEATHS), category: 'Disease & Illness' }
      : { cause: pick(OLD_AGE_DEATHS), category: 'Old Age & Natural Decline' };
  }

  // Age 65+: primarily Old Age & Natural Decline, with occasional acute illness
  return rng() < 0.25
    ? { cause: pick(DISEASE_DEATHS), category: 'Disease & Illness' }
    : { cause: pick(OLD_AGE_DEATHS), category: 'Old Age & Natural Decline' };
}

// ============================================================================
// 2. FEUDAL JUDICIAL SENTENCING, DUCAL JURISDICTION & ROYAL APPEALS
// ============================================================================

export function getFeudalTierRank(char: Character, world: WorldState): number {
  const isMonarch =
    char.id === world.monarchId ||
    char.role === 'Monarch' ||
    (world.realms || []).some((r) => r.rulerId === char.id);
  if (isMonarch) return char.titleTier === 'Emperor' ? 6 : 5;
  if (char.titleTier === 'Emperor') return 6;
  if (char.titleTier === 'King') return 5;
  if (
    char.titleTier === 'Duke' ||
    char.role === 'Vassal Duke' ||
    (world.counties || []).some((ct) => ct.rulerId === char.id && (ct.tier === 'Duchy' || ct.name.includes('Duchy')))
  ) {
    return 4;
  }
  if (
    char.titleTier === 'Count' ||
    char.role === 'Vassal Count' ||
    (world.counties || []).some((ct) => ct.rulerId === char.id && ct.tier !== 'Duchy')
  ) {
    return 3;
  }
  if (char.titleTier === 'Baron' || char.role === 'Vassal Baron') return 2;
  if (char.titleTier === 'Mayor' || char.role === 'Lord Mayor' || char.role === 'Portmaster' || char.role === 'Merchant Guildmaster') return 1;
  return 0; // Commoner / Unlanded Courtier
}

/**
 * Checks if `subject` lies within `duke`'s ducal domain (vassalage, county/duchy residence, or holding).
 */
export function isSubjectWithinDucalDomain(duke: Character, subject: Character, world: WorldState): boolean {
  if (!duke.isAlive || !subject.isAlive || duke.id === subject.id) return false;
  if (duke.realmId !== subject.realmId) return false;

  // Direct vassal of the Duke
  if (subject.liegeId === duke.id || duke.vassalIds?.includes(subject.id)) return true;

  // Find all counties/duchies ruled by this Duke
  const ducalCounties = (world.counties || []).filter(
    (ct) => ct.rulerId === duke.id && ct.realmId === duke.realmId
  );
  const ducalCountyIds = new Set(ducalCounties.map((ct) => ct.id));

  // Include counties whose parent duchy is ruled by this Duke (or whose liege is the Duke)
  for (const ct of world.counties || []) {
    if (ct.realmId !== duke.realmId) continue;
    const ctLord = world.characters.find((c) => c.id === ct.rulerId);
    if (ctLord?.liegeId === duke.id) {
      ducalCountyIds.add(ct.id);
    }
  }

  if (subject.countyId && ducalCountyIds.has(subject.countyId)) return true;

  // Check if subject's liege is a vassal of this Duke (indirect vassal / courtier)
  if (subject.liegeId) {
    const liege = world.characters.find((c) => c.id === subject.liegeId);
    if (liege && (liege.liegeId === duke.id || (liege.countyId && ducalCountyIds.has(liege.countyId)))) {
      return true;
    }
  }

  // Check if subject owns a burg inside the Duke's counties
  const subjectBurg = (world.burgs || []).find((b) => b.ownerId === subject.id);
  if (subjectBurg && subjectBurg.countyId && ducalCountyIds.has(subjectBurg.countyId)) return true;

  return false;
}

export interface JudicialAuthorityEvaluation {
  canSentence: boolean;
  judgeTier: 'Monarch' | 'Duke' | 'None';
  allowedSentences: JudicialSentenceType[];
  canExecute: boolean;
  canBeAppealedToKing: boolean;
  reason: string;
}

/**
 * Evaluates feudal judicial authority:
 * - Monarchs can pass ANY sentence (including Execution) on ANY subject in their realm.
 * - Dukes can pass non-lethal sentences ONLY within their own domain AND ONLY on subjects ranked BELOW Count.
 * - Only Monarchs have the power to Execute.
 * - Any Ducal sentence can be appealed to the Sovereign Monarch.
 */
export function evaluateJudicialAuthority(
  judge: Character,
  subject: Character,
  world: WorldState
): JudicialAuthorityEvaluation {
  if (!judge.isAlive || !subject.isAlive || judge.id === subject.id) {
    return {
      canSentence: false,
      judgeTier: 'None',
      allowedSentences: [],
      canExecute: false,
      canBeAppealedToKing: false,
      reason: 'A noble cannot pass sentence upon themselves or the deceased.',
    };
  }
  if (judge.realmId !== subject.realmId) {
    return {
      canSentence: false,
      judgeTier: 'None',
      allowedSentences: [],
      canExecute: false,
      canBeAppealedToKing: false,
      reason: 'Subjects of a foreign realm lie outside domestic judicial jurisdiction.',
    };
  }

  const judgeRank = getFeudalTierRank(judge, world);
  const subjectRank = getFeudalTierRank(subject, world);

  // MONARCH AUTHORITY (Rank 5+: King / Emperor)
  if (judgeRank >= 5) {
    return {
      canSentence: true,
      judgeTier: 'Monarch',
      allowedSentences: [
        'Execution',
        'Imprisonment',
        'Title Revocation',
        'Banishment',
        'Fine & Confiscation',
        'House Arrest',
        'Monastic Confinement',
      ],
      canExecute: true,
      canBeAppealedToKing: false,
      reason: 'Sovereign Crown Justice: Supreme authority over all subjects, including capital execution.',
    };
  }

  // DUCAL AUTHORITY (Rank 4: Duke)
  if (judgeRank === 4) {
    if (subjectRank >= 3) {
      return {
        canSentence: false,
        judgeTier: 'Duke',
        allowedSentences: [],
        canExecute: false,
        canBeAppealedToKing: false,
        reason: 'Counts, Dukes, and Royalty are immune to Ducal courts; only the Monarch may try peers of Count rank or higher.',
      };
    }
    if (!isSubjectWithinDucalDomain(judge, subject, world)) {
      return {
        canSentence: false,
        judgeTier: 'Duke',
        allowedSentences: [],
        canExecute: false,
        canBeAppealedToKing: false,
        reason: 'This subject does not reside within the Duke’s feudal domain.',
      };
    }
    return {
      canSentence: true,
      judgeTier: 'Duke',
      allowedSentences: [
        'Imprisonment',
        'Fine & Confiscation',
        'Banishment',
        'House Arrest',
        'Monastic Confinement',
      ],
      canExecute: false,
      canBeAppealedToKing: true,
      reason: 'Ducal High Justice (Below Count): Non-lethal sentences only; subject retains Right of Appeal to the King.',
    };
  }

  return {
    canSentence: false,
    judgeTier: 'None',
    allowedSentences: [],
    canExecute: false,
    canBeAppealedToKing: false,
    reason: 'Only Sovereign Monarchs and territorial Dukes hold High Justice sentencing powers.',
  };
}

export function getJudicialAuthoritiesForSubject(
  subject: Character,
  world: WorldState
): Array<{ judge: Character; auth: JudicialAuthorityEvaluation }> {
  const results: Array<{ judge: Character; auth: JudicialAuthorityEvaluation }> = [];
  if (!subject.isAlive) return results;

  const realm = (world.realms || []).find((r) => r.id === subject.realmId);
  const monarch = world.characters.find((c) => c.id === realm?.rulerId && c.isAlive);
  if (monarch && monarch.id !== subject.id) {
    const auth = evaluateJudicialAuthority(monarch, subject, world);
    if (auth.canSentence) results.push({ judge: monarch, auth });
  }

  // Check territorial Dukes in the same realm
  const dukes = world.characters.filter(
    (c) =>
      c.isAlive &&
      c.id !== subject.id &&
      c.realmId === subject.realmId &&
      getFeudalTierRank(c, world) === 4
  );
  for (const duke of dukes) {
    const auth = evaluateJudicialAuthority(duke, subject, world);
    if (auth.canSentence) {
      results.push({ judge: duke, auth });
      break; // Primary territorial Duke
    }
  }

  return results;
}

export const SENTENCING_CRIMES: readonly string[] = [
  'High Treason',
  'Sedition & Conspiracy',
  'Tax Evasion & Embezzlement',
  'Murder & Bloodshed',
  'Refusal of Feudal Levy',
  'Heresy & Blasphemy',
  'Poaching & Forest Trespass',
  'Defamation of the Liege',
];

export function passFeudalSentence(params: {
  judge: Character;
  subject: Character;
  sentence: JudicialSentenceType;
  crime: string;
  world: WorldState;
  executionMethod?: ExecutionMethod;
  onKillCharacter: (victim: Character, cause: string, w: WorldState, category?: DeathCategory) => void;
}): { success: boolean; summary: string; record?: JudicialSentenceRecord } {
  const { judge, subject, sentence, crime, world, executionMethod, onKillCharacter } = params;
  const auth = evaluateJudicialAuthority(judge, subject, world);

  if (!auth.canSentence) {
    return { success: false, summary: auth.reason };
  }
  if (sentence === 'Execution' && !auth.canExecute) {
    return {
      success: false,
      summary: 'Execution forbidden: Only a Sovereign Monarch holds the power of capital execution!',
    };
  }
  if (!auth.allowedSentences.includes(sentence)) {
    return {
      success: false,
      summary: `${auth.judgeTier} courts cannot pass a sentence of ${sentence}.`,
    };
  }

  const record: JudicialSentenceRecord = {
    id: `sent_${world.currentYear}_${Math.random().toString(36).slice(2, 8)}`,
    year: world.currentYear,
    judgeId: judge.id,
    judgeName: judge.name,
    judgeTier: auth.judgeTier as 'Monarch' | 'Duke',
    subjectId: subject.id,
    subjectName: subject.name,
    realmId: subject.realmId,
    duchyId: auth.judgeTier === 'Duke' ? judge.countyId : undefined,
    crime,
    sentence,
    executionMethod: sentence === 'Execution' ? executionMethod || 'Beheading on the Block' : undefined,
    canAppealToKing: auth.canBeAppealedToKing,
    status: auth.canBeAppealedToKing ? 'Pending Appeal' : 'Enforced',
  };

  if (!world.judicialSentences) world.judicialSentences = [];
  world.judicialSentences.unshift(record);

  // Enforce sentence effects
  if (sentence === 'Execution') {
    const method = record.executionMethod || 'Beheading on the Block';
    onKillCharacter(subject, `Royal Execution (${method})`, world, 'Execution');
    judge.dread = Math.min(100, (judge.dread || 10) + 12);
  } else if (sentence === 'Imprisonment') {
    subject.isImprisoned = true;
    if (subject.courtPosition) subject.courtPosition.orbit = 'NONE';
    const traits = subject.v17Traits || [];
    if (!traits.includes('Imprisoned')) traits.push('Imprisoned');
    subject.v17Traits = traits;
  } else if (sentence === 'House Arrest') {
    subject.isImprisoned = true;
    subject.stress = Math.min(300, (subject.stress || 0) + 20);
  } else if (sentence === 'Banishment') {
    subject.isBanished = true;
    if (subject.courtPosition) subject.courtPosition.orbit = 'NONE';
    const traits = subject.v17Traits || [];
    if (!traits.includes('Exiled')) traits.push('Exiled');
    subject.v17Traits = traits;
  } else if (sentence === 'Fine & Confiscation') {
    const fine = Math.min(subject.treasury || 60, Math.max(30, Math.round((subject.treasury || 60) * 0.45)));
    subject.treasury = Math.max(0, (subject.treasury || 0) - fine);
    judge.treasury = (judge.treasury || 0) + fine;
  } else if (sentence === 'Monastic Confinement') {
    subject.isMonk = true;
    if (subject.courtPosition) subject.courtPosition.orbit = 'NONE';
  } else if (sentence === 'Title Revocation') {
    for (const h of world.holdings || []) {
      if (h.ownerId === subject.id) h.ownerId = judge.id;
    }
    for (const b of world.burgs || []) {
      if (b.ownerId === subject.id) b.ownerId = judge.id;
    }
    for (const ct of world.counties || []) {
      if (ct.rulerId === subject.id) ct.rulerId = judge.id;
    }
  }

  if (!subject.opinions) subject.opinions = {};
  subject.opinions[judge.id] = Math.max(-100, (subject.opinions[judge.id] ?? 0) - 45);
  subject.loyalty = Math.max(0, (subject.loyalty ?? 50) - 30);

  const methodText = record.executionMethod ? ` (${record.executionMethod})` : '';
  const appealText = record.canAppealToKing ? ' Subject may appeal this Ducal verdict to the King.' : '';
  const summary = `${auth.judgeTier} ${judge.name} sentenced ${subject.name} to ${sentence}${methodText} for ${crime}.${appealText}`;

  if (!world.history) world.history = [];
  world.history.unshift({
    id: `hist_sent_${world.currentYear}_${Math.random().toString(36).slice(2, 7)}`,
    year: world.currentYear,
    title: `${auth.judgeTier === 'Monarch' ? 'Royal' : 'Ducal'} Sentence: ${subject.name}`,
    category: 'Dynastic Drama',
    description: summary,
    primaryActorId: judge.id,
    secondaryActorId: subject.id,
    realmId: subject.realmId,
  });

  return { success: true, summary, record };
}

/**
 * Resolves a subject's Appeal to the Sovereign Monarch against a Ducal sentence via Dice Roll.
 */
export function appealSentenceToKing(
  sentenceId: string,
  world: WorldState
): { success: boolean; summary: string } {
  const record = (world.judicialSentences || []).find((s) => s.id === sentenceId);
  if (!record) return { success: false, summary: 'Judicial record not found.' };
  if (!record.canAppealToKing || record.status !== 'Pending Appeal') {
    return { success: false, summary: 'This sentence is no longer eligible for Royal Appeal.' };
  }

  const realm = (world.realms || []).find((r) => r.id === record.realmId);
  const monarch = world.characters.find((c) => c.id === realm?.rulerId && c.isAlive);
  const subject = world.characters.find((c) => c.id === record.subjectId);
  const duke = world.characters.find((c) => c.id === record.judgeId);

  if (!monarch || !subject) {
    return { success: false, summary: 'Sovereign court unavailable to hear the appeal.' };
  }

  // Dice roll: Subject Diplomacy + King's opinion of Subject vs Duke's Diplomacy + Justice Law DC
  const kingOpSubject = monarch.opinions?.[subject.id] ?? 0;
  const kingOpDuke = monarch.opinions?.[duke?.id || ''] ?? 0;
  const modifier = Math.round(
    ((subject.baseDiplomacy || 8) - 8) * 0.6 +
      (kingOpSubject - kingOpDuke) * 0.08 +
      (world.realmLaws?.justice === 'Noble Immunity' ? 3 : world.realmLaws?.justice === 'Draconian' ? -3 : 0)
  );

  const roll = rollDiceCheck({
    statName: 'Royal Appeal (Diplomacy & Favor)',
    modifier,
    dc: 12,
  });

  let outcomeSummary = '';
  if (roll.tier === 'critical_success' || roll.tier === 'success') {
    record.status = 'Overturned by King';
    record.canAppealToKing = false;
    subject.isImprisoned = false;
    subject.isBanished = false;
    subject.isMonk = false;
    if (subject.v17Traits) {
      subject.v17Traits = subject.v17Traits.filter((t) => t !== 'Imprisoned' && t !== 'Exiled');
    }
    if (duke) {
      duke.prestige = Math.max(0, (duke.prestige || 100) - 65);
      if (!duke.opinions) duke.opinions = {};
      duke.opinions[monarch.id] = Math.max(-100, (duke.opinions[monarch.id] ?? 0) - 18);
    }
    if (!subject.opinions) subject.opinions = {};
    subject.opinions[monarch.id] = Math.min(100, (subject.opinions[monarch.id] ?? 0) + 35);
    outcomeSummary = `ROYAL PARDON [${roll.diceLabel}: ${roll.total} vs DC ${roll.dc}]: ${monarch.name} overturned ${record.judgeName}'s sentence on ${subject.name}!`;
  } else if (roll.tier === 'partial') {
    record.status = 'Commuted by King';
    record.canAppealToKing = false;
    subject.isImprisoned = false;
    subject.isBanished = false;
    if (subject.v17Traits) {
      subject.v17Traits = subject.v17Traits.filter((t) => t !== 'Imprisoned' && t !== 'Exiled');
    }
    const reducedFine = Math.min(subject.treasury || 20, 20);
    subject.treasury = Math.max(0, (subject.treasury || 0) - reducedFine);
    monarch.treasury = (monarch.treasury || 0) + reducedFine;
    outcomeSummary = `SENTENCE COMMUTED [${roll.diceLabel}: ${roll.total} vs DC ${roll.dc}]: ${monarch.name} commuted ${record.judgeName}'s sentence on ${subject.name} to a ${reducedFine}g Crown fine.`;
  } else {
    record.status = 'Upheld by King';
    record.canAppealToKing = false;
    outcomeSummary = `APPEAL DENIED [${roll.diceLabel}: ${roll.total} vs DC ${roll.dc}]: ${monarch.name} upheld ${record.judgeName}'s sentence of ${record.sentence} upon ${subject.name}.`;
  }

  record.appealResolutionNote = outcomeSummary;
  if (!world.history) world.history = [];
  world.history.unshift({
    id: `hist_appeal_${world.currentYear}_${Math.random().toString(36).slice(2, 7)}`,
    year: world.currentYear,
    title: `Royal Appeal: ${subject.name}`,
    category: 'Dynastic Drama',
    description: outcomeSummary,
    primaryActorId: monarch.id,
    secondaryActorId: subject.id,
    realmId: record.realmId,
  });

  return { success: true, summary: outcomeSummary };
}

// ============================================================================
// 3. KINSHIP DETECTION & MARRIAGE LEGALITY (BLOOD RELATIVES, FOREIGN, ROYAL)
// ============================================================================

export type KinshipKind =
  | 'Parent/Child'
  | 'Sibling'
  | 'Avuncular'
  | 'First Cousin'
  | 'Same-House Kin'
  | 'Unrelated';

export interface MarriageLegalityCheck {
  allowed: boolean;
  kinship: KinshipKind;
  isBloodRelative: boolean;
  isCloseKin: boolean;
  isForeign: boolean;
  isRoyalMatch: boolean;
  reason?: string;
}

export function detectKinshipRelation(
  charA: Character,
  charB: Character,
  world: WorldState
): KinshipKind {
  if (charA.knownFatherId === charB.id || charA.motherId === charB.id || charB.knownFatherId === charA.id || charB.motherId === charA.id) {
    return 'Parent/Child';
  }
  const shareFather = Boolean(charA.knownFatherId && charA.knownFatherId === charB.knownFatherId);
  const shareMother = Boolean(charA.motherId && charA.motherId === charB.motherId);
  if (shareFather || shareMother) {
    return 'Sibling';
  }

  const byId = new Map(world.characters.map((c) => [c.id, c]));
  const parentsA = [charA.knownFatherId, charA.motherId].filter(Boolean) as string[];
  const parentsB = [charB.knownFatherId, charB.motherId].filter(Boolean) as string[];

  // Avuncular (Uncle/Aunt - Nephew/Niece): parent of A is sibling of B or vice versa
  for (const pId of parentsA) {
    const p = byId.get(pId);
    if (p && ((p.knownFatherId && p.knownFatherId === charB.knownFatherId) || (p.motherId && p.motherId === charB.motherId))) {
      return 'Avuncular';
    }
  }
  for (const pId of parentsB) {
    const p = byId.get(pId);
    if (p && ((p.knownFatherId && p.knownFatherId === charA.knownFatherId) || (p.motherId && p.motherId === charA.motherId))) {
      return 'Avuncular';
    }
  }

  // First Cousins: share a grandparent
  const gpA = new Set<string>();
  for (const pId of parentsA) {
    const p = byId.get(pId);
    if (p?.knownFatherId) gpA.add(p.knownFatherId);
    if (p?.motherId) gpA.add(p.motherId);
  }
  for (const pId of parentsB) {
    const p = byId.get(pId);
    if ((p?.knownFatherId && gpA.has(p.knownFatherId)) || (p?.motherId && gpA.has(p.motherId))) {
      return 'First Cousin';
    }
  }

  if (charA.houseName && charB.houseName && charA.houseName.toLowerCase() === charB.houseName.toLowerCase()) {
    return 'Same-House Kin';
  }

  return 'Unrelated';
}

export function checkMarriageLegality(
  charA: Character,
  charB: Character,
  world: WorldState
): MarriageLegalityCheck {
  const kinship = detectKinshipRelation(charA, charB, world);
  const isBloodRelative = kinship !== 'Unrelated';
  const isCloseKin = kinship === 'Parent/Child' || kinship === 'Sibling' || kinship === 'Avuncular';
  const isForeign = charA.realmId !== charB.realmId;
  const isRoyalMatch =
    isCharacterRoyalLineage(charA, world) ||
    isCharacterRoyalLineage(charB, world) ||
    charA.titleTier === 'King' ||
    charA.titleTier === 'Emperor' ||
    charB.titleTier === 'King' ||
    charB.titleTier === 'Emperor';

  if (!charA.isAlive || !charB.isAlive || charA.id === charB.id) {
    return { allowed: false, kinship, isBloodRelative, isCloseKin, isForeign, isRoyalMatch, reason: 'Both parties must be living distinct nobles.' };
  }
  if (charA.age < 18 || charB.age < 18) {
    return { allowed: false, kinship, isBloodRelative, isCloseKin, isForeign, isRoyalMatch, reason: 'Both nobles must be age 18 or older to wed.' };
  }
  const hasLivingSpouse = (c: Character) =>
    Boolean(c.spouseId && world.characters.some((x) => x.id === c.spouseId && x.isAlive !== false));
  if (hasLivingSpouse(charA) || hasLivingSpouse(charB)) {
    return { allowed: false, kinship, isBloodRelative, isCloseKin, isForeign, isRoyalMatch, reason: 'One of the nobles is already wed.' };
  }
  if (charA.isMonk || charB.isMonk) {
    return { allowed: false, kinship, isBloodRelative, isCloseKin, isForeign, isRoyalMatch, reason: 'Monastic vows forbid marriage.' };
  }

  const consanguinity = world.realmLaws?.consanguinity || 'Unrestricted';
  const foreignLaw = world.realmLaws?.foreignMarriage || 'Open Alliances';

  if (consanguinity === 'Strict Exogamy' && isBloodRelative) {
    return {
      allowed: false,
      kinship,
      isBloodRelative,
      isCloseKin,
      isForeign,
      isRoyalMatch,
      reason: `Forbidden by Strict Exogamy Law (${kinship} union barred).`,
    };
  }
  if (consanguinity === 'Close-Kin Forbidden' && isCloseKin) {
    return {
      allowed: false,
      kinship,
      isBloodRelative,
      isCloseKin,
      isForeign,
      isRoyalMatch,
      reason: `Forbidden by Close-Kin Law (${kinship} union barred).`,
    };
  }

  if (isForeign) {
    if (foreignLaw === 'Domestic Only') {
      return {
        allowed: false,
        kinship,
        isBloodRelative,
        isCloseKin,
        isForeign,
        isRoyalMatch,
        reason: 'Forbidden by Domestic-Only Marriage Law (foreign unions barred).',
      };
    }
    if (foreignLaw === 'Royal Permission Only' && !isRoyalMatch && charA.titleTier !== 'Duke' && charB.titleTier !== 'Duke') {
      return {
        allowed: false,
        kinship,
        isBloodRelative,
        isCloseKin,
        isForeign,
        isRoyalMatch,
        reason: 'Foreign marriages are restricted to Royal & Ducal houses under current Crown Law.',
      };
    }
  }

  return { allowed: true, kinship, isBloodRelative, isCloseKin, isForeign, isRoyalMatch };
}

// ============================================================================
// 4. DYNASTIC ESTATE PROBATE & EQUAL COLLATERAL INHERITANCE
// ============================================================================

/**
 * Conserves 100% of a deceased character's personal treasury on death:
 * 1) 15% Feudal Relief -> liege (or Crown Fisc if independent/monarch)
 * 2) 10% Funerary Alms -> home burg coffer & BurgMarket
 * 3) If living eligible children exist: 20% Dower to living spouse + 80% among children (2x to primary heir, 1x to siblings)
 * 4) Else 6-tier Equal Collateral Split: Grandchildren -> Siblings -> Nieces/Nephews -> Parents -> House Kin -> Escheat to Liege/Crown Fisc
 * Sets deceased.treasury = 0.
 */
export function distributeInheritanceTreasury(deceased: Character, world: WorldState): void {
  if (!deceased) return;
  const rawTreasury = Math.round((deceased.treasury || 0) * 10) / 10;
  if (rawTreasury <= 0) {
    deceased.treasury = 0;
    return;
  }

  const allChars = world.characters || [];
  const intGross = Math.floor(rawTreasury);
  const frac = Math.round((rawTreasury - intGross) * 10) / 10;

  const realm = world.realms?.find((r) => r.id === deceased.realmId);
  const liege = deceased.liegeId
    ? allChars.find((c) => c.id === deceased.liegeId && c.isAlive !== false && c.id !== deceased.id)
    : undefined;
  const fallbackMonarch =
    realm && realm.rulerId !== deceased.id
      ? allChars.find((c) => c.id === realm.rulerId && c.isAlive !== false)
      : undefined;

  const payReliefOrEscheat = (amt: number) => {
    if (amt <= 0) return;
    if (liege) {
      liege.treasury = Math.round(((liege.treasury || 0) + amt) * 10) / 10;
    } else if (realm) {
      realm.treasury = Math.round(((realm.treasury || 0) + amt) * 10) / 10;
      recordRealmBudgetExtra(realm, world, 'scutageAndAidsIncome', amt);
    } else if (fallbackMonarch) {
      fallbackMonarch.treasury = Math.round(((fallbackMonarch.treasury || 0) + amt) * 10) / 10;
    }
  };

  const homeBurg =
    world.burgs?.find((b) => b.id === deceased.heldHoldingIds?.[0]) ||
    world.burgs?.find((b) => b.ownerId === deceased.id) ||
    world.burgs?.find((b) => b.id === realm?.capitalBurgId) ||
    world.burgs?.find((b) => b.stateId === deceased.realmId);

  const payAlmsToHomeBurg = (amt: number) => {
    if (amt <= 0) return;
    if (homeBurg) {
      const nextBurgBal = Math.round(((homeBurg.treasury || 0) + amt) * 10) / 10;
      homeBurg.treasury = nextBurgBal;
      const bMarket = world.economy?.burgMarkets?.[homeBurg.id];
      if (bMarket) bMarket.treasury = nextBurgBal;
    } else {
      payReliefOrEscheat(amt);
    }
  };

  if (intGross === 0) {
    payAlmsToHomeBurg(frac);
    deceased.treasury = 0;
    return;
  }

  const relief = Math.floor(intGross * 0.15);
  const alms = Math.floor(intGross * 0.10);
  const netEstate = intGross - relief - alms;

  payReliefOrEscheat(relief);
  payAlmsToHomeBurg(Math.round((alms + frac) * 10) / 10);

  if (netEstate <= 0) {
    deceased.treasury = 0;
    return;
  }

  const isEligibleLiving = (c: Character) =>
    c.isAlive !== false && c.id !== deceased.id && !c.isMonk && !c.isBanished;

  const isDirectChild = (c: Character) =>
    c.knownFatherId === deceased.id ||
    c.motherId === deceased.id ||
    (deceased.children || []).includes(c.id);

  const allChildrenOfDeceased = allChars.filter((c) => c.id !== deceased.id && isDirectChild(c));
  const livingChildren = allChildrenOfDeceased.filter(isEligibleLiving);

  if (livingChildren.length > 0) {
    const spouse = deceased.spouseId
      ? allChars.find((c) => c.id === deceased.spouseId && c.isAlive !== false && c.id !== deceased.id)
      : undefined;
    const dower = spouse ? Math.floor(netEstate * 0.20) : 0;
    if (spouse && dower > 0) {
      spouse.treasury = Math.round(((spouse.treasury || 0) + dower) * 10) / 10;
    }

    const childrenPool = netEstate - dower;
    const primaryChild =
      livingChildren.find((c) => c.id === deceased.heirId) ||
      [...livingChildren].sort((a, b) => (b.age || 0) - (a.age || 0) || a.id.localeCompare(b.id))[0];
    const orderedChildren = [
      primaryChild,
      ...livingChildren.filter((c) => c.id !== primaryChild.id),
    ];

    const totalShares = orderedChildren.reduce((s, c) => s + (c.id === primaryChild.id ? 2 : 1), 0);
    const unit = Math.floor(childrenPool / totalShares);
    let distributed = 0;
    const payouts = orderedChildren.map((c) => {
      const share = unit * (c.id === primaryChild.id ? 2 : 1);
      distributed += share;
      return share;
    });
    let rem = childrenPool - distributed;
    for (let idx = 0; idx < orderedChildren.length && rem > 0; idx++) {
      payouts[idx] += 1;
      rem -= 1;
    }
    orderedChildren.forEach((c, idx) => {
      c.treasury = Math.round(((c.treasury || 0) + payouts[idx]) * 10) / 10;
    });

    deceased.treasury = 0;
    return;
  }

  // Childless 6-Tier Equal Collateral Split
  const childIds = new Set(allChildrenOfDeceased.map((c) => c.id));
  const tier1Grandchildren = allChars.filter(
    (c) =>
      isEligibleLiving(c) &&
      ((c.knownFatherId && childIds.has(c.knownFatherId)) || (c.motherId && childIds.has(c.motherId)))
  );

  const sharesParentWithDeceased = (c: Character) =>
    Boolean(
      (deceased.knownFatherId && c.knownFatherId === deceased.knownFatherId) ||
        (deceased.motherId && c.motherId === deceased.motherId)
    );
  const allSiblings = allChars.filter((c) => c.id !== deceased.id && sharesParentWithDeceased(c));
  const tier2Siblings = allSiblings.filter(isEligibleLiving);

  const siblingIds = new Set(allSiblings.map((s) => s.id));
  const tier3NiecesNephews = allChars.filter(
    (c) =>
      isEligibleLiving(c) &&
      ((c.knownFatherId && siblingIds.has(c.knownFatherId)) || (c.motherId && siblingIds.has(c.motherId)))
  );

  const tier4Parents = allChars.filter(
    (c) => isEligibleLiving(c) && (c.id === deceased.knownFatherId || c.id === deceased.motherId)
  );

  const houseNorm = (deceased.houseName || '').trim().toLowerCase();
  const tier5HouseKin =
    houseNorm && houseNorm !== 'commoner'
      ? allChars.filter(
          (c) =>
            isEligibleLiving(c) &&
            c.realmId === deceased.realmId &&
            (c.houseName || '').trim().toLowerCase() === houseNorm
        )
      : [];

  const chosenTier =
    tier1Grandchildren.length > 0
      ? tier1Grandchildren
      : tier2Siblings.length > 0
      ? tier2Siblings
      : tier3NiecesNephews.length > 0
      ? tier3NiecesNephews
      : tier4Parents.length > 0
      ? tier4Parents
      : tier5HouseKin;

  if (chosenTier.length > 0) {
    const uniqueRecipients = Array.from(new Map(chosenTier.map((c) => [c.id, c])).values()).sort(
      (a, b) => (b.age || 0) - (a.age || 0) || a.id.localeCompare(b.id)
    );
    const each = Math.floor(netEstate / uniqueRecipients.length);
    const rem = netEstate % uniqueRecipients.length;
    uniqueRecipients.forEach((recipient, idx) => {
      const share = each + (idx < rem ? 1 : 0);
      if (share > 0) {
        recipient.treasury = Math.round(((recipient.treasury || 0) + share) * 10) / 10;
      }
    });
  } else {
    // Tier 6: Escheat to Liege / Crown Fisc
    payReliefOrEscheat(netEstate);
  }

  deceased.treasury = 0;
}

