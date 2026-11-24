import { Character, Realm, WorldState, HistoricalEvent } from '../types/world';
import { PRNG } from '../utils/proceduralNoise';

// ============================================================================
// 1. DEFINED MEANING & GAMEPLAY IMPACT OF ALL SIX ATTRIBUTES
// ============================================================================

export type CoreAttributeKey =
  | 'diplomacy'
  | 'martial'
  | 'stewardship'
  | 'intrigue'
  | 'learning'
  | 'prowess';

export interface AttributeDefinition {
  key: CoreAttributeKey;
  label: string;
  short: string;
  meaning: string;
  gameplayImpact: string;
}

export const SIX_ATTRIBUTES_GUIDE: Record<CoreAttributeKey, AttributeDefinition> = {
  diplomacy: {
    key: 'diplomacy',
    label: 'Diplomacy',
    short: 'DIP',
    meaning: 'Persuasion, courtly grace, statecraft, and treaty negotiation.',
    gameplayImpact: 'Boosts vassal & foreign opinion, alliance/pact acceptance, envoy gains, and monthly prestige.',
  },
  martial: {
    key: 'martial',
    label: 'Martial',
    short: 'MAR',
    meaning: 'Strategic command, troop discipline, logistics, and battlefield leadership.',
    gameplayImpact: 'Increases levy capacity, army battle power, reinforcement speed, and Marshal efficiency.',
  },
  stewardship: {
    key: 'stewardship',
    label: 'Stewardship',
    short: 'STE',
    meaning: 'Estate management, taxation, civic engineering, and trade oversight.',
    gameplayImpact: 'Multiplies crown tax revenue, accelerates county development, and raises Steward yield.',
  },
  intrigue: {
    key: 'intrigue',
    label: 'Intrigue',
    short: 'INT',
    meaning: 'Espionage, counter-intelligence, court leverage, and covert schemes.',
    gameplayImpact: 'Improves scheme success, uncovers hostile plots, strengthens Spymaster counter-espionage.',
  },
  learning: {
    key: 'learning',
    label: 'Learning',
    short: 'LRN',
    meaning: 'Scholarship, theology, medicine, mentorship, and institutional wisdom.',
    gameplayImpact: 'Governs child education & trait evolution, piety gain, cultural development, and Chaplain work.',
  },
  prowess: {
    key: 'prowess',
    label: 'Prowess',
    short: 'PRW',
    meaning: 'Personal martial skill, swordsmanship, endurance, and battlefield valor.',
    gameplayImpact: 'Determines single-combat duels, survival in field battles, and Marshal/Champion shock impact.',
  },
};

// ============================================================================
// 2. ROYAL COUNCIL ROLES, SELECTABLE TASKS & ATTRIBUTE EFFECTIVENESS
// ============================================================================

export type CouncilOffice = 'Chancellor' | 'Marshal' | 'Steward' | 'Spymaster' | 'Court Chaplain';

export interface CouncilTaskDef {
  id: string;
  label: string;
  shortDesc: string;
}

export interface CouncilOfficeDef {
  office: CouncilOffice;
  primaryAttr: CoreAttributeKey;
  secondaryAttr: CoreAttributeKey;
  defaultTask: string;
  tasks: CouncilTaskDef[];
}

export const COUNCIL_OFFICE_DEFS: Record<CouncilOffice, CouncilOfficeDef> = {
  Chancellor: {
    office: 'Chancellor',
    primaryAttr: 'diplomacy',
    secondaryAttr: 'learning',
    defaultTask: 'domestic_harmony',
    tasks: [
      { id: 'domestic_harmony', label: 'Harmonize Vassals', shortDesc: 'Raises vassal opinion of the Crown and cools faction unrest.' },
      { id: 'foreign_affairs', label: 'Foreign Embassies', shortDesc: 'Steadily improves relations with neighboring realms.' },
      { id: 'crown_prestige', label: 'Heraldic Propaganda', shortDesc: 'Generates annual dynastic prestige and diplomatic clout.' },
    ],
  },
  Marshal: {
    office: 'Marshal',
    primaryAttr: 'martial',
    secondaryAttr: 'prowess',
    defaultTask: 'train_levies',
    tasks: [
      { id: 'train_levies', label: 'Drill Royal Hosts', shortDesc: 'Reinforces active armies, raises morale, and trains squires.' },
      { id: 'suppress_unrest', label: 'Secure Crown Roads', shortDesc: 'Reduces stress/banditry and strengthens county garrison readiness.' },
    ],
  },
  Steward: {
    office: 'Steward',
    primaryAttr: 'stewardship',
    secondaryAttr: 'learning',
    defaultTask: 'collect_taxes',
    tasks: [
      { id: 'collect_taxes', label: 'Collect Crown Taxes', shortDesc: 'Generates bonus royal gold scaled directly by Stewardship.' },
      { id: 'promote_development', label: 'Develop Crownlands', shortDesc: 'Accelerates county & capital development growth.' },
    ],
  },
  Spymaster: {
    office: 'Spymaster',
    primaryAttr: 'intrigue',
    secondaryAttr: 'diplomacy',
    defaultTask: 'disrupt_schemes',
    tasks: [
      { id: 'disrupt_schemes', label: 'Counter-Espionage', shortDesc: 'Slows & exposes hostile murder/coup plots targeting the court.' },
      { id: 'gather_secrets', label: 'Web of Whispers', shortDesc: 'Builds court leverage and dread against unruly vassals.' },
    ],
  },
  'Court Chaplain': {
    office: 'Court Chaplain',
    primaryAttr: 'learning',
    secondaryAttr: 'diplomacy',
    defaultTask: 'spiritual_guidance',
    tasks: [
      { id: 'spiritual_guidance', label: 'Spiritual Guidance', shortDesc: 'Generates piety and calms sovereign & court stress.' },
      { id: 'tutor_youths', label: 'Palace Academy', shortDesc: 'Boosts attribute growth and learning of all children under 21 in the realm.' },
    ],
  },
};

function getAttrValue(c: Character, key: CoreAttributeKey): number {
  switch (key) {
    case 'diplomacy': return c.baseDiplomacy || 8;
    case 'martial': return c.baseMartial || 8;
    case 'stewardship': return c.baseStewardship || 8;
    case 'intrigue': return c.baseIntrigue || 8;
    case 'learning': return c.baseLearning || 8;
    case 'prowess': return c.baseProwess || 6;
  }
}

export function evaluateCouncillorEffectiveness(c: Character | undefined, office: CouncilOffice): {
  score: number;
  tier: 'Masterful' | 'Competent' | 'Adequate' | 'Weak' | 'Vacant';
  bonusPct: number;
  primaryLabel: string;
} {
  const def = COUNCIL_OFFICE_DEFS[office];
  if (!c || c.isAlive === false) {
    return { score: 0, tier: 'Vacant', bonusPct: 0, primaryLabel: SIX_ATTRIBUTES_GUIDE[def.primaryAttr].short };
  }
  const pVal = getAttrValue(c, def.primaryAttr);
  const sVal = getAttrValue(c, def.secondaryAttr);
  const score = Math.round(pVal * 0.75 + sVal * 0.25);
  const bonusPct = Math.round(score * 3.5);
  const tier =
    score >= 16 ? 'Masterful' : score >= 12 ? 'Competent' : score >= 8 ? 'Adequate' : 'Weak';
  return {
    score,
    tier,
    bonusPct,
    primaryLabel: SIX_ATTRIBUTES_GUIDE[def.primaryAttr].short,
  };
}

/**
 * Runs annual Royal Council actions & Sovereign 6-attribute simulation effects for every realm.
 */
export function runAnnualCouncilAndAttributeEffects(
  world: WorldState,
  year: number,
  prng: PRNG,
  newEvents: HistoricalEvent[]
): void {
  const living = world.characters.filter((c) => c.isAlive !== false);

  for (const realm of world.realms) {
    const monarch = living.find((c) => c.id === realm.rulerId);
    if (!monarch) continue;

    // A. Sovereign 6-Attribute Direct Simulation Effects
    const dip = monarch.baseDiplomacy || 10;
    const ste = monarch.baseStewardship || 10;
    const lrn = monarch.baseLearning || 10;

    const crownTaxYield = Math.max(4, Math.round(ste * 1.4));
    monarch.prestige = (monarch.prestige || 0) + Math.max(4, Math.round(dip * 1.4));
    monarch.piety = (monarch.piety || 0) + Math.max(2, Math.round(lrn * 1.1));
    if (realm.treasury !== undefined) {
      const civilShare = Math.round(crownTaxYield * 0.1 * 10) / 10;
      realm.treasury = Math.round((realm.treasury + crownTaxYield - civilShare) * 10) / 10;
      monarch.treasury = Math.round(((monarch.treasury || 0) + civilShare) * 10) / 10;
    } else {
      monarch.treasury = Math.round(((monarch.treasury || 0) + crownTaxYield) * 10) / 10;
    }

    // B. Royal Council Active Role Effects
    const realmCourt = living.filter((c) => c.realmId === realm.id);
    const tasks = realm.councilTasks || {};

    // 1. CHANCELLOR (Diplomacy + Learning)
    const chancellor = realmCourt.find((c) => c.role === 'Chancellor');
    if (chancellor) {
      const eff = evaluateCouncillorEffectiveness(chancellor, 'Chancellor');
      const task = tasks.Chancellor || COUNCIL_OFFICE_DEFS.Chancellor.defaultTask;
      if (task === 'domestic_harmony') {
        const opGain = Math.max(1, Math.round(eff.score * 0.35));
        for (const v of realmCourt) {
          if (v.liegeId === monarch.id && v.id !== monarch.id) {
            if (!v.opinions) v.opinions = {};
            v.opinions[monarch.id] = Math.min(100, (v.opinions[monarch.id] ?? 0) + opGain);
          }
        }
      } else if (task === 'foreign_affairs') {
        const gain = Math.max(1, Math.round(eff.score * 0.25));
        if (!realm.diplomaticRelations) realm.diplomaticRelations = {};
        for (const other of world.realms) {
          if (other.id === realm.id) continue;
          if ((realm.enemyRealmIds || []).includes(other.id)) continue;
          realm.diplomaticRelations[other.id] = Math.min(100, (realm.diplomaticRelations[other.id] ?? 0) + gain);
        }
      } else {
        monarch.prestige = (monarch.prestige || 0) + eff.score * 4;
      }
    }

    // 2. MARSHAL (Martial + Prowess)
    const marshal = realmCourt.find((c) => c.role === 'Marshal');
    if (marshal) {
      const eff = evaluateCouncillorEffectiveness(marshal, 'Marshal');
      const task = tasks.Marshal || COUNCIL_OFFICE_DEFS.Marshal.defaultTask;
      if (task === 'train_levies') {
        for (const army of world.armies || []) {
          const cmd = living.find((c) => c.id === (army.commanderId || army.attackerId));
          if (cmd?.realmId !== realm.id) continue;
          for (const reg of army.regiments || []) {
            reg.morale = Math.min(100, reg.morale + Math.max(2, Math.round(eff.score * 0.4)));
            reg.count = Math.min(reg.maxCount, reg.count + Math.round(eff.score * 3));
          }
        }
      } else {
        monarch.stress = Math.max(0, (monarch.stress || 0) - Math.round(eff.score * 0.6));
      }
    }

    // 3. STEWARD (Stewardship + Learning)
    const steward = realmCourt.find((c) => c.role === 'Steward');
    if (steward) {
      const eff = evaluateCouncillorEffectiveness(steward, 'Steward');
      const task = tasks.Steward || COUNCIL_OFFICE_DEFS.Steward.defaultTask;
      if (task === 'collect_taxes') {
        const taxBonus = Math.max(8, Math.round(eff.score * 3.8));
        if (realm.treasury !== undefined) {
          realm.treasury = Math.round((realm.treasury + taxBonus) * 10) / 10;
          if (realm.budget?.lastReport) {
            realm.budget.lastReport.domainTax = Math.round(((realm.budget.lastReport.domainTax || 0) + taxBonus) * 10) / 10;
          }
        } else {
          monarch.treasury = Math.round(((monarch.treasury || 0) + taxBonus) * 10) / 10;
        }
      } else {
        const capBurg = world.burgs.find((b) => b.id === realm.capitalBurgId);
        if (capBurg) {
          capBurg.developmentLevel = Math.min(100, (capBurg.developmentLevel || 25) + Math.max(0.3, eff.score * 0.08));
        }
      }
    }

    // 4. SPYMASTER (Intrigue + Diplomacy)
    const spymaster = realmCourt.find((c) => c.role === 'Spymaster');
    if (spymaster) {
      const eff = evaluateCouncillorEffectiveness(spymaster, 'Spymaster');
      const task = tasks.Spymaster || COUNCIL_OFFICE_DEFS.Spymaster.defaultTask;
      if (task === 'disrupt_schemes') {
        for (const schemer of living) {
          if (!schemer.activeScheme) continue;
          const target = living.find((c) => c.id === schemer.activeScheme?.targetId);
          if (target?.realmId === realm.id && schemer.id !== spymaster.id) {
            schemer.activeScheme.progress = Math.max(0, schemer.activeScheme.progress - Math.round(eff.score * 0.8));
            if (prng.next() < eff.score * 0.015) {
              schemer.activeScheme = undefined;
              newEvents.push({
                id: `hist_spy_foil_${spymaster.id}_${year}`,
                year,
                title: `Plot Foiled by ${spymaster.name}`,
                category: 'Dynastic Drama',
                description: `Spymaster ${spymaster.name} (Intrigue ${spymaster.baseIntrigue}) uncovered and dismantled ${schemer.name}'s scheme against ${target.name}.`,
                primaryActorId: spymaster.id,
                secondaryActorId: schemer.id,
                realmId: realm.id,
              });
            }
          }
        }
      } else {
        monarch.dread = Math.min(100, (monarch.dread || 0) + Math.max(1, Math.round(eff.score * 0.3)));
      }
    }

    // 5. COURT CHAPLAIN (Learning + Diplomacy)
    const chaplain = realmCourt.find((c) => c.role === 'Court Chaplain');
    if (chaplain) {
      const eff = evaluateCouncillorEffectiveness(chaplain, 'Court Chaplain');
      const task = tasks['Court Chaplain'] || COUNCIL_OFFICE_DEFS['Court Chaplain'].defaultTask;
      if (task === 'spiritual_guidance') {
        monarch.piety = (monarch.piety || 0) + Math.max(5, Math.round(eff.score * 2.5));
        monarch.stress = Math.max(0, (monarch.stress || 0) - Math.round(eff.score * 0.8));
      }
    }
  }
}

// ============================================================================
// 3. CHILDHOOD GROWTH, EVOLUTION, LEARNING, AGE-21 TRAIT LOCK,
//    FOSTERAGE & APPRENTICESHIP ENGINE
// ============================================================================

const CHILDHOOD_EVOLVING_TRAITS: Record<
  'diplomacy' | 'martial' | 'stewardship' | 'intrigue' | 'learning',
  string[]
> = {
  diplomacy: ['Gregarious', 'Compassionate', 'Honest', 'Forgiving', 'Calm'],
  martial: ['Brave', 'Wrathful', 'Stubborn', 'Diligent', 'Ambitious'],
  stewardship: ['Diligent', 'Temperate', 'Just', 'Patient', 'Greedy'],
  intrigue: ['Deceitful', 'Paranoid', 'Ambitious', 'Cynical', 'Callous'],
  learning: ['Patient', 'Calm', 'Humble', 'Zealous', 'Cynical'],
};

const EDUCATION_TIERS: Record<
  'diplomacy' | 'martial' | 'stewardship' | 'intrigue' | 'learning',
  [string, string, string, string]
> = {
  diplomacy: ['Naive Appeaser', 'Underhanded Rogue', 'Charismatic Negotiator', 'Grey Eminence'],
  martial: ['Misguided Warrior', 'Tough Soldier', 'Skilled Tactician', 'Brilliant Strategist'],
  stewardship: ['Indulgent Wastrel', 'Thrifty Clerk', 'Fortune Builder', 'Midas Touched'],
  intrigue: ['Amateurish Plotter', 'Flamboyant Trickster', 'Intricate Webweaver', 'Elusive Shadow'],
  learning: ['Conscientious Scribe', 'Insightful Thinker', 'Astute Intellectual', 'Mastermind Philosopher'],
};

const APPRENTICESHIP_DOMAIN_MAP: Record<
  NonNullable<Character['apprenticeshipType']>,
  { focus: 'diplomacy' | 'martial' | 'stewardship' | 'intrigue' | 'learning'; earnedTrait: string }
> = {
  'Squire & Knighthood': { focus: 'martial', earnedTrait: 'Flexible Leader' },
  'Stewardship Guild': { focus: 'stewardship', earnedTrait: 'Architect' },
  'Chancery Clerk': { focus: 'diplomacy', earnedTrait: 'Diplomat' },
  'Scholastic Abbey': { focus: 'learning', earnedTrait: 'Scholar' },
  Shadowcraft: { focus: 'intrigue', earnedTrait: 'Schemer' },
};

export function assignFosterage(
  child: Character,
  guardian: Character,
  world: WorldState
): { success: boolean; summary: string } {
  if (child.age >= 21) {
    return { success: false, summary: `${child.name} has already come of age (21+) and cannot be fostered.` };
  }
  if (guardian.age < 21 || guardian.isAlive === false) {
    return { success: false, summary: 'Foster guardian must be a living adult (age 21+).' };
  }
  child.guardianId = guardian.id;
  child.fosterRealmId = guardian.realmId;

  // Fosterage builds diplomatic warmth between the child's house/realm and the guardian's court
  if (!guardian.opinions) guardian.opinions = {};
  if (!child.opinions) child.opinions = {};
  guardian.opinions[child.id] = Math.min(100, (guardian.opinions[child.id] ?? 0) + 20);
  child.opinions[guardian.id] = Math.min(100, (child.opinions[guardian.id] ?? 0) + 25);

  const parent = world.characters.find(
    (c) => (c.id === child.knownFatherId || c.id === child.motherId) && c.isAlive !== false
  );
  if (parent && parent.id !== guardian.id) {
    if (!parent.opinions) parent.opinions = {};
    parent.opinions[guardian.id] = Math.min(100, (parent.opinions[guardian.id] ?? 0) + 15);
    guardian.opinions[parent.id] = Math.min(100, (guardian.opinions[parent.id] ?? 0) + 15);
  }

  world.history.unshift({
    id: `hist_foster_${child.id}_${world.currentYear}`,
    year: world.currentYear,
    title: `Fosterage Arranged: ${child.name}`,
    category: 'Dynastic Drama',
    description: `${child.name} (age ${child.age}) was placed in fosterage under the tutelage of ${guardian.name} (Learning ${guardian.baseLearning}).`,
    primaryActorId: child.id,
    secondaryActorId: guardian.id,
    realmId: child.realmId,
  });

  return {
    success: true,
    summary: `${child.name} is now fostered under ${guardian.name} (Learning ${guardian.baseLearning}).`,
  };
}

export function assignApprenticeship(
  youth: Character,
  apprenticeshipType: NonNullable<Character['apprenticeshipType']>,
  master: Character | undefined,
  world: WorldState
): { success: boolean; summary: string } {
  if (youth.age < 10 || youth.age >= 21) {
    return { success: false, summary: 'Apprenticeships are open to youths aged 10 to 20.' };
  }
  youth.apprenticeshipType = apprenticeshipType;
  youth.childhoodFocus = APPRENTICESHIP_DOMAIN_MAP[apprenticeshipType].focus;
  if (master) {
    youth.apprenticeshipMasterId = master.id;
    youth.guardianId = youth.guardianId || master.id;
  }

  world.history.unshift({
    id: `hist_appr_${youth.id}_${world.currentYear}`,
    year: world.currentYear,
    title: `Apprenticeship Begun: ${youth.name}`,
    category: 'Dynastic Drama',
    description: `${youth.name} (age ${youth.age}) entered a ${apprenticeshipType} apprenticeship${master ? ` under ${master.name}` : ''}.`,
    primaryActorId: youth.id,
    secondaryActorId: master?.id,
    realmId: youth.realmId,
  });

  return {
    success: true,
    summary: `${youth.name} began ${apprenticeshipType} apprenticeship${master ? ` with ${master.name}` : ''}.`,
  };
}

/**
 * Runs annual natural child growth, attribute learning, evolving traits (ages 6-20),
 * and permanent trait locking + education graduation at age 21.
 */
export function runAnnualChildhoodGrowth(
  world: WorldState,
  year: number,
  prng: PRNG,
  newEvents: HistoricalEvent[]
): void {
  const living = world.characters.filter((c) => c.isAlive !== false);

  for (const ch of living) {
    // Adults 21+ have locked core personality traits
    if (ch.age >= 21) {
      if (!ch.traitsLockedAt21) {
        ch.traitsLockedAt21 = true;
      }
      continue;
    }

    // Ensure children under 21 do not prematurely hold unlocked combat commander traits
    if (ch.age < 16 && ch.commanderTraits && ch.commanderTraits.length > 0 && !(ch.battlesFought && ch.battlesFought > 0)) {
      ch.commanderTraits = [];
    }

    // Assign a default childhood focus by age 6 if none chosen
    if (ch.age >= 6 && !ch.childhoodFocus) {
      ch.childhoodFocus = prng.pick(['diplomacy', 'martial', 'stewardship', 'intrigue', 'learning']);
    }

    if (ch.age < 6) continue;

    // Resolve Guardian / Foster Mentor / Master
    const mentor =
      living.find((m) => m.id === ch.apprenticeshipMasterId) ||
      living.find((m) => m.id === ch.guardianId) ||
      living.find((m) => m.id === ch.knownFatherId) ||
      living.find((m) => m.id === ch.motherId);

    const realm = world.realms.find((r) => r.id === (ch.fosterRealmId || ch.realmId));
    const chaplain = living.find((c) => c.realmId === realm?.id && c.role === 'Court Chaplain');
    const academyBonus =
      realm?.councilTasks?.['Court Chaplain'] === 'tutor_youths' && chaplain
        ? Math.max(1, Math.floor((chaplain.baseLearning || 10) / 8))
        : 0;

    const mentorLearning = mentor ? mentor.baseLearning || 10 : 8;
    const growthChance = Math.min(0.85, 0.32 + mentorLearning * 0.022 + academyBonus * 0.08);
    const focus = ch.childhoodFocus || 'stewardship';

    // Natural annual attribute growth (ages 6..20)
    if (prng.next() < growthChance) {
      if (focus === 'diplomacy') ch.baseDiplomacy = Math.min(24, (ch.baseDiplomacy || 6) + 1);
      else if (focus === 'martial') {
        ch.baseMartial = Math.min(24, (ch.baseMartial || 6) + 1);
        if (ch.age >= 12 && prng.next() < 0.65) ch.baseProwess = Math.min(22, (ch.baseProwess || 5) + 1);
      } else if (focus === 'stewardship') ch.baseStewardship = Math.min(24, (ch.baseStewardship || 6) + 1);
      else if (focus === 'intrigue') ch.baseIntrigue = Math.min(24, (ch.baseIntrigue || 6) + 1);
      else if (focus === 'learning') ch.baseLearning = Math.min(24, (ch.baseLearning || 6) + 1);
    }
    // Secondary general maturation
    if (prng.next() < 0.35 + academyBonus * 0.05) {
      const secondary = prng.pick(['diplomacy', 'martial', 'stewardship', 'intrigue', 'learning'] as const);
      if (secondary === 'diplomacy') ch.baseDiplomacy = Math.min(20, (ch.baseDiplomacy || 6) + 1);
      else if (secondary === 'martial') ch.baseMartial = Math.min(20, (ch.baseMartial || 6) + 1);
      else if (secondary === 'stewardship') ch.baseStewardship = Math.min(20, (ch.baseStewardship || 6) + 1);
      else if (secondary === 'intrigue') ch.baseIntrigue = Math.min(20, (ch.baseIntrigue || 6) + 1);
      else ch.baseLearning = Math.min(20, (ch.baseLearning || 6) + 1);
    }

    // Evolving Personality Traits between ages 9 and 20 (max 3 core traits, still fluid until 21!)
    if (ch.age >= 9 && ch.age < 21 && !ch.traitsLockedAt21 && prng.next() < 0.22) {
      const pool = CHILDHOOD_EVOLVING_TRAITS[focus];
      const mentorTrait =
        mentor && mentor.personalityTraits.length > 0 && prng.next() < 0.45
          ? prng.pick(mentor.personalityTraits)
          : prng.pick(pool);
      if (!ch.personalityTraits) ch.personalityTraits = [];
      if (!ch.v17Traits) ch.v17Traits = [];
      if (!ch.personalityTraits.includes(mentorTrait)) {
        if (ch.personalityTraits.length < 3) {
          ch.personalityTraits.push(mentorTrait);
        } else {
          // Youthful trait evolution: one fluid trait can shift before age 21
          const replaced = ch.personalityTraits[ch.personalityTraits.length - 1];
          ch.personalityTraits[ch.personalityTraits.length - 1] = mentorTrait;
          ch.v17Traits = ch.v17Traits.filter((t) => t !== replaced);
        }
        if (!ch.v17Traits.includes(mentorTrait)) ch.v17Traits.push(mentorTrait);
      }
    }

    // COMING OF AGE AT 20->21: Education graduation, apprenticeship completion & permanent trait lock!
    if (ch.age === 20) {
      ch.traitsLockedAt21 = true;
      const focusStat = getAttrValue(ch, focus);
      const eduScore = focusStat + Math.floor(mentorLearning * 0.4) + academyBonus * 2;
      const tierIdx = eduScore >= 24 ? 3 : eduScore >= 18 ? 2 : eduScore >= 13 ? 1 : 0;
      const graduatedEdu = EDUCATION_TIERS[focus][tierIdx];
      ch.educationTrait = graduatedEdu;
      if (!ch.v17Traits) ch.v17Traits = [];
      if (!ch.v17Traits.includes(graduatedEdu)) ch.v17Traits.push(graduatedEdu);

      let apprenticeNote = '';
      if (ch.apprenticeshipType) {
        const spec = APPRENTICESHIP_DOMAIN_MAP[ch.apprenticeshipType];
        if (ch.apprenticeshipType === 'Squire & Knighthood') {
          if (!ch.commanderTraits) ch.commanderTraits = [];
          if (!ch.commanderTraits.includes(spec.earnedTrait)) ch.commanderTraits.push(spec.earnedTrait);
          ch.baseProwess = Math.min(24, (ch.baseProwess || 8) + 2);
          apprenticeNote = ` Completed ${ch.apprenticeshipType} and earned [${spec.earnedTrait}].`;
        } else {
          if (!ch.lifestyleTraits) ch.lifestyleTraits = [];
          if (!ch.lifestyleTraits.includes(spec.earnedTrait)) ch.lifestyleTraits.push(spec.earnedTrait);
          apprenticeNote = ` Completed ${ch.apprenticeshipType} and earned [${spec.earnedTrait}].`;
        }
      }

      newEvents.push({
        id: `hist_coming_of_age_${ch.id}_${year}`,
        year,
        title: `Coming of Age: ${ch.name}`,
        category: 'Dynastic Drama',
        description: `${ch.name} reached maturity (21), locking lifelong traits and graduating as a ${graduatedEdu}${mentor ? ` under ${mentor.name}'s mentorship` : ''}.${apprenticeNote}`,
        primaryActorId: ch.id,
        secondaryActorId: mentor?.id,
        realmId: ch.realmId,
      });
    }
  }
}
