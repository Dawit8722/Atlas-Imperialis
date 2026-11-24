import {
  WorldState,
  Character,
  PoliticalSystemState,
  CouncilBill,
  CouncilorVote,
  ReformPilot,
  GovernanceHealthMetrics,
  RealmLaws,
} from '../types/world';
import { computeHouseProfile } from './houseEngine';
import { getRealmChanceryEfficiency } from './economyEngine';

export interface ReformMetadata {
  pillar:
    | '1. Electoral & Representation'
    | '2. Money & Lobbying'
    | '3. Checks & Balances'
    | '4. Citizen Participation'
    | '5. Inclusivity & Minorities'
    | '6. Info & Civic Education'
    | '7. E-Governance';
  key: keyof PoliticalSystemState;
  label: string;
  options: {
    value: string;
    shortLabel: string;
    effect: string;
    isProgressive: boolean;
  }[];
}

export const POLITICAL_REFORM_CATALOG: ReformMetadata[] = [
  // 1. Electoral & Representation Reforms
  {
    pillar: '1. Electoral & Representation',
    key: 'votingSystem',
    label: 'Electoral & Voting System',
    options: [
      { value: 'Plurality (FPTP)', shortLabel: 'Plurality (FPTP)', effect: 'Two-bloc dominance; higher polarization', isProgressive: false },
      { value: 'Ranked-Choice (IRV)', shortLabel: 'Ranked-Choice (IRV)', effect: 'Consensus moderation; reduces wasted votes', isProgressive: true },
      { value: 'Proportional Representation', shortLabel: 'Proportional', effect: 'Broad coalition seats; curbs extremism', isProgressive: true },
    ],
  },
  {
    pillar: '1. Electoral & Representation',
    key: 'redistricting',
    label: 'Electoral Boundaries',
    options: [
      { value: 'Partisan Boundaries', shortLabel: 'Partisan Drawn', effect: 'Gerrymandered fief seats; fuels discontent', isProgressive: false },
      { value: 'Independent Commission', shortLabel: 'Independent Commission', effect: 'Non-partisan fair borders; +Legitimacy', isProgressive: true },
    ],
  },
  {
    pillar: '1. Electoral & Representation',
    key: 'suffrageAccess',
    label: 'Participation & Franchise',
    options: [
      { value: 'Property Franchise', shortLabel: 'Property Only', effect: 'Restricted to landowners & guild elites', isProgressive: false },
      { value: 'Universal Accessible', shortLabel: 'Universal Access', effect: 'Broad civic participation; -Unrest', isProgressive: true },
    ],
  },
  // 2. Controlling the Influence of Money and Lobbying
  {
    pillar: '2. Money & Lobbying',
    key: 'campaignFinance',
    label: 'Campaign & Patronage Finance',
    options: [
      { value: 'Unrestricted Patronage', shortLabel: 'Unrestricted Money', effect: 'Wealthy magnates dominate policy', isProgressive: false },
      { value: 'Donation Caps & Vouchers', shortLabel: 'Caps & Vouchers', effect: 'Levels field with public democracy vouchers', isProgressive: true },
    ],
  },
  {
    pillar: '2. Money & Lobbying',
    key: 'financialDisclosure',
    label: 'Financial & Treasury Disclosure',
    options: [
      { value: 'Opaque Ledgers', shortLabel: 'Opaque Ledgers', effect: 'High embezzlement & dark-money risk', isProgressive: false },
      { value: 'Real-Time Public Disclosure', shortLabel: 'Real-Time Disclosure', effect: 'Public contribution & vault audits; -50% theft', isProgressive: true },
    ],
  },
  {
    pillar: '2. Money & Lobbying',
    key: 'revolvingDoor',
    label: 'Revolving Door & Lobbying',
    options: [
      { value: 'Unregulated Lobbying', shortLabel: 'Unregulated', effect: 'Former officials capture regulators', isProgressive: false },
      { value: 'Mandatory Cooling-Off', shortLabel: 'Cooling-Off Law', effect: 'Blocks post-office lobbying capture', isProgressive: true },
    ],
  },
  // 3. Strengthening Institutional Checks & Balances
  {
    pillar: '3. Checks & Balances',
    key: 'judiciary',
    label: 'Judiciary & Oversight',
    options: [
      { value: 'Crown-Controlled Courts', shortLabel: 'Executive Courts', effect: 'Arbitrary rulings; weak anti-corruption', isProgressive: false },
      { value: 'Independent Judiciary & Oversight', shortLabel: 'Independent Courts', effect: 'Protected auditors & courts; catches corruption', isProgressive: true },
    ],
  },
  {
    pillar: '3. Checks & Balances',
    key: 'civilService',
    label: 'Public Civil Service',
    options: [
      { value: 'Political Patronage', shortLabel: 'Patronage Spoils', effect: 'High administrative overhead & waste', isProgressive: false },
      { value: 'Merit-Based Civil Service', shortLabel: 'Merit Civil Service', effect: '-35% admin waste; stable municipal services', isProgressive: true },
    ],
  },
  {
    pillar: '3. Checks & Balances',
    key: 'codifiedNorms',
    label: 'Constitutional Norms & Terms',
    options: [
      { value: 'Unwritten Customs', shortLabel: 'Unwritten Customs', effect: 'Vulnerable to autocratic backsliding', isProgressive: false },
      { value: 'Codified Norms & Term Limits', shortLabel: 'Codified & Term Limits', effect: 'Enforceable limits on executive overreach', isProgressive: true },
    ],
  },
  // 4. Deepening Citizen Participation (Deliberative Democracy)
  {
    pillar: '4. Citizen Participation',
    key: 'citizensAssembly',
    label: "Citizens' Assemblies & Juries",
    options: [
      { value: 'None', shortLabel: 'None', effect: 'Legislation debated solely by court elites', isProgressive: false },
      { value: 'Sortition Citizens Assembly', shortLabel: 'Citizens Assembly', effect: 'Representative citizen panel advises & backs bills', isProgressive: true },
    ],
  },
  {
    pillar: '4. Citizen Participation',
    key: 'participatoryBudgeting',
    label: 'Public Budget Allocation',
    options: [
      { value: 'Centralized Allocation', shortLabel: 'Centralized', effect: 'Ministry-directed spending only', isProgressive: false },
      { value: 'Participatory Budgeting', shortLabel: 'Participatory Budget', effect: 'Local towns vote on budgets; +SoL & Dev', isProgressive: true },
    ],
  },
  {
    pillar: '4. Citizen Participation',
    key: 'decentralization',
    label: 'Regional & Local Autonomy',
    options: [
      { value: 'Centralized Crown', shortLabel: 'Centralized', effect: 'Strict capital control over provinces', isProgressive: false },
      { value: 'Devolved Local Autonomy', shortLabel: 'Local Autonomy', effect: 'Empowers municipalities; fosters local policy', isProgressive: true },
    ],
  },
  // 5. Inclusivity & Minority Protection
  {
    pillar: '5. Inclusivity & Minorities',
    key: 'minorityProtection',
    label: 'Power-Sharing & Minority Rights',
    options: [
      { value: 'Majoritarian Rule', shortLabel: 'Majoritarian', effect: 'Minority cultures face exclusion unrest', isProgressive: false },
      { value: 'Consociational Power-Sharing', shortLabel: 'Power-Sharing', effect: 'Guaranteed cultural representation; -Rebellion', isProgressive: true },
    ],
  },
  {
    pillar: '5. Inclusivity & Minorities',
    key: 'parity',
    label: 'Gender & Youth Parity',
    options: [
      { value: 'Traditional Exclusion', shortLabel: 'Traditional', effect: 'Narrow aristocratic candidate pool', isProgressive: false },
      { value: 'Gender & Youth Parity', shortLabel: 'Parity Charter', effect: 'Broadens leadership & merit appointments', isProgressive: true },
    ],
  },
  // 6. Information Ecosystem & Civic Education
  {
    pillar: '6. Info & Civic Education',
    key: 'mediaIndependence',
    label: 'Independent & Local Media',
    options: [
      { value: 'Factional Mouthpieces', shortLabel: 'Factional Press', effect: 'Cover-ups & rumor polarization thrive', isProgressive: false },
      { value: 'Independent & Local Media', shortLabel: 'Public Press Trust', effect: 'Investigative journalism exposes scandals', isProgressive: true },
    ],
  },
  {
    pillar: '6. Info & Civic Education',
    key: 'civicEducation',
    label: 'Civic & Media Literacy',
    options: [
      { value: 'Elite Scholarship', shortLabel: 'Elite Only', effect: 'Public vulnerable to demagoguery', isProgressive: false },
      { value: 'Universal Civic & Media Literacy', shortLabel: 'Universal Literacy', effect: 'Raises long-term Civic Trust & resilience', isProgressive: true },
    ],
  },
  {
    pillar: '6. Info & Civic Education',
    key: 'platformTransparency',
    label: 'Information & Herald Transparency',
    options: [
      { value: 'Opaque Rumors', shortLabel: 'Opaque Channels', effect: 'Hidden foreign & factional influence', isProgressive: false },
      { value: 'Heraldic & Algorithmic Transparency', shortLabel: 'Transparent Info', effect: 'Exposes covert foreign influence campaigns', isProgressive: true },
    ],
  },
  // 7. Modernizing Public Administration
  {
    pillar: '7. E-Governance',
    key: 'eGovernance',
    label: 'Open Data & E-Services',
    options: [
      { value: 'Parchment Bottlenecks', shortLabel: 'Manual Parchment', effect: 'Petty bribery & slow procurement', isProgressive: false },
      { value: 'Open Data & E-Services', shortLabel: 'Open E-Governance', effect: 'Transparent procurement & -25% petty bribery', isProgressive: true },
    ],
  },
];

export function createDefaultPoliticalSystem(): PoliticalSystemState {
  return {
    votingSystem: 'Plurality (FPTP)',
    redistricting: 'Partisan Boundaries',
    suffrageAccess: 'Property Franchise',
    campaignFinance: 'Unrestricted Patronage',
    financialDisclosure: 'Opaque Ledgers',
    revolvingDoor: 'Unregulated Lobbying',
    judiciary: 'Crown-Controlled Courts',
    civilService: 'Political Patronage',
    codifiedNorms: 'Unwritten Customs',
    citizensAssembly: 'None',
    participatoryBudgeting: 'Centralized Allocation',
    decentralization: 'Centralized Crown',
    minorityProtection: 'Majoritarian Rule',
    parity: 'Traditional Exclusion',
    mediaIndependence: 'Factional Mouthpieces',
    civicEducation: 'Elite Scholarship',
    platformTransparency: 'Opaque Rumors',
    eGovernance: 'Parchment Bottlenecks',
  };
}

export function ensureGovernanceInitialized(world: WorldState): void {
  if (!world.realmLaws) {
    world.realmLaws = {
      succession: 'Partition',
      gender: 'Agnatic-Cognatic',
      authority: 'Limited',
      justice: 'Traditional',
    };
  }
  if (!world.politicalSystem) {
    world.politicalSystem = createDefaultPoliticalSystem();
  }
  if (!world.pendingBills) {
    world.pendingBills = [];
  }
  if (!world.legislativeHistory) {
    world.legislativeHistory = [];
  }
  if (!world.reformPilots) {
    world.reformPilots = [];
  }
  if (!world.governanceHealth) {
    world.governanceHealth = computeGovernanceHealth(world);
  }
}

export function computeGovernanceHealth(world: WorldState): GovernanceHealthMetrics {
  const ps = world.politicalSystem || createDefaultPoliticalSystem();
  const laws = world.realmLaws || {
    succession: 'Partition',
    gender: 'Agnatic-Cognatic',
    authority: 'Limited',
    justice: 'Traditional',
  };

  let dem = 14;
  if (ps.votingSystem === 'Ranked-Choice (IRV)') dem += 8;
  if (ps.votingSystem === 'Proportional Representation') dem += 11;
  if (ps.redistricting === 'Independent Commission') dem += 6;
  if (ps.suffrageAccess === 'Universal Accessible') dem += 7;
  if (ps.campaignFinance === 'Donation Caps & Vouchers') dem += 6;
  if (ps.judiciary === 'Independent Judiciary & Oversight') dem += 8;
  if (ps.codifiedNorms === 'Codified Norms & Term Limits') dem += 7;
  if (ps.citizensAssembly === 'Sortition Citizens Assembly') dem += 7;
  if (ps.participatoryBudgeting === 'Participatory Budgeting') dem += 5;
  if (ps.decentralization === 'Devolved Local Autonomy') dem += 5;
  if (ps.minorityProtection === 'Consociational Power-Sharing') dem += 6;
  if (ps.parity === 'Gender & Youth Parity') dem += 5;
  if (ps.mediaIndependence === 'Independent & Local Media') dem += 5;
  if (ps.civicEducation === 'Universal Civic & Media Literacy') dem += 4;
  if (laws.succession === 'Elective') dem += 5;
  if (laws.authority === 'Absolute') dem -= 10;
  if (laws.authority === 'High') dem -= 4;
  const democraticIndex = Math.max(0, Math.min(100, Math.round(dem)));

  let corr = 74;
  if (ps.campaignFinance === 'Donation Caps & Vouchers') corr -= 12;
  if (ps.financialDisclosure === 'Real-Time Public Disclosure') corr -= 13;
  if (ps.revolvingDoor === 'Mandatory Cooling-Off') corr -= 10;
  if (ps.judiciary === 'Independent Judiciary & Oversight') corr -= 12;
  if (ps.civilService === 'Merit-Based Civil Service') corr -= 9;
  if (ps.mediaIndependence === 'Independent & Local Media') corr -= 7;
  if (ps.eGovernance === 'Open Data & E-Services') corr -= 8;
  if (laws.justice === 'Noble Immunity') corr += 12;
  const corruptionRisk = Math.max(4, Math.min(98, Math.round(corr)));

  let trust = 34 + (100 - corruptionRisk) * 0.28;
  if (ps.suffrageAccess === 'Universal Accessible') trust += 6;
  if (ps.citizensAssembly === 'Sortition Citizens Assembly') trust += 8;
  if (ps.participatoryBudgeting === 'Participatory Budgeting') trust += 7;
  if (ps.civicEducation === 'Universal Civic & Media Literacy') trust += 8;
  if (ps.platformTransparency === 'Heraldic & Algorithmic Transparency') trust += 5;
  if (ps.codifiedNorms === 'Codified Norms & Term Limits') trust += 5;
  if (world.realmState === 'Civil War') trust -= 18;
  const civicTrust = Math.max(5, Math.min(100, Math.round(trust)));

  let minInc = 20;
  if (ps.minorityProtection === 'Consociational Power-Sharing') minInc += 30;
  if (ps.parity === 'Gender & Youth Parity') minInc += 20;
  if (ps.votingSystem === 'Proportional Representation') minInc += 15;
  if (ps.redistricting === 'Independent Commission') minInc += 10;
  if (laws.gender === 'Cognatic') minInc += 10;
  const minorityInclusion = Math.max(5, Math.min(100, Math.round(minInc)));

  let adminEff = 32;
  if (ps.civilService === 'Merit-Based Civil Service') adminEff += 25;
  if (ps.eGovernance === 'Open Data & E-Services') adminEff += 22;
  if (ps.financialDisclosure === 'Real-Time Public Disclosure') adminEff += 10;
  if (ps.decentralization === 'Devolved Local Autonomy') adminEff += 8;
  if (ps.participatoryBudgeting === 'Participatory Budgeting') adminEff += 6;
  const administrativeEfficiency = Math.max(10, Math.min(100, Math.round(adminEff)));

  const regimeType: GovernanceHealthMetrics['regimeType'] =
    democraticIndex >= 72
      ? 'Deliberative Democracy'
      : democraticIndex >= 48
      ? 'Constitutional Commonwealth'
      : democraticIndex >= 28
      ? 'Transitional State'
      : 'Autocratic Patronage';

  return {
    regimeType,
    democraticIndex,
    corruptionRisk,
    civicTrust,
    minorityInclusion,
    administrativeEfficiency,
    crisisCatalystMonths: world.governanceHealth?.crisisCatalystMonths || 0,
    crisisCatalystReason: world.governanceHealth?.crisisCatalystReason,
  };
}

function getCouncilVoters(world: WorldState, realmId?: string): Character[] {
  const living = (world.characters || []).filter((c) => c.isAlive && !c.isImprisoned && !c.isBanished);
  const realmChars = realmId ? living.filter((c) => c.realmId === realmId) : living;
  const pool = realmChars.length > 0 ? realmChars : living;

  const councilRoles = new Set(['Chancellor', 'Marshal', 'Steward', 'Spymaster', 'Court Chaplain']);
  const councilors = pool.filter((c) => councilRoles.has(c.role) && c.id !== world.monarchId);

  // Also include prominent regional vassals / guild leaders so legislative consensus requires coalition breadth
  const regionalMagnates = pool
    .filter((c) => !councilRoles.has(c.role) && c.id !== world.monarchId && (c.role === 'Vassal Duke' || c.role === 'Vassal Count' || c.role === 'Lord Mayor'))
    .sort((a, b) => (b.prestige || 0) - (a.prestige || 0))
    .slice(0, Math.max(2, 6 - councilors.length));

  const combined: Character[] = [];
  const seen = new Set<string>();
  for (const c of [...councilors, ...regionalMagnates]) {
    if (!seen.has(c.id)) {
      seen.add(c.id);
      combined.push(c);
    }
  }

  // Fallback if small court
  if (combined.length === 0) {
    return pool.filter((c) => c.id !== world.monarchId).slice(0, 5);
  }
  return combined.slice(0, 7);
}

function isAntiCorruptionOrChecksBill(key: string, val: string): boolean {
  return (
    key === 'campaignFinance' ||
    key === 'financialDisclosure' ||
    key === 'revolvingDoor' ||
    key === 'judiciary' ||
    key === 'civilService' ||
    key === 'codifiedNorms' ||
    key === 'eGovernance' ||
    key === 'mediaIndependence'
  ) && !val.includes('Unrestricted') && !val.includes('Opaque') && !val.includes('Unregulated') && !val.includes('Crown-Controlled') && !val.includes('Political Patronage') && !val.includes('Unwritten') && !val.includes('Parchment') && !val.includes('Factional');
}

function isParticipatoryOrInclusiveBill(key: string, val: string): boolean {
  return (
    key === 'votingSystem' ||
    key === 'redistricting' ||
    key === 'suffrageAccess' ||
    key === 'citizensAssembly' ||
    key === 'participatoryBudgeting' ||
    key === 'decentralization' ||
    key === 'minorityProtection' ||
    key === 'parity' ||
    key === 'civicEducation' ||
    key === 'platformTransparency' ||
    (key === 'gender' && val === 'Cognatic') ||
    (key === 'succession' && val === 'Elective')
  ) && !val.includes('Plurality') && !val.includes('Partisan') && !val.includes('Property') && val !== 'None' && !val.includes('Centralized') && !val.includes('Majoritarian') && !val.includes('Traditional') && !val.includes('Elite') && !val.includes('Opaque');
}

export function evaluateBillVotes(world: WorldState, bill: CouncilBill): void {
  ensureGovernanceInitialized(world);
  const monarch = world.characters.find((c) => c.id === bill.proposerId) || world.characters.find((c) => c.id === world.monarchId);
  const realmId = monarch?.realmId || world.realms?.[0]?.id;
  const voters = getCouncilVoters(world, realmId);
  const ps = world.politicalSystem!;
  const health = world.governanceHealth!;

  const isAntiCorr = isAntiCorruptionOrChecksBill(bill.targetKey, bill.proposedValue);
  const isDemReform = isParticipatoryOrInclusiveBill(bill.targetKey, bill.proposedValue);
  const hasPilot = Boolean(bill.localPilotCountyId) || (world.reformPilots || []).some((rp) => rp.reformKey === bill.targetKey && rp.proposedValue === bill.proposedValue && rp.isSuccessful);
  if (hasPilot && !bill.localPilotCountyId) {
    const pilot = (world.reformPilots || []).find((rp) => rp.reformKey === bill.targetKey && rp.proposedValue === bill.proposedValue && rp.isSuccessful);
    if (pilot) bill.localPilotCountyId = pilot.countyId;
  }

  const votes: CouncilorVote[] = [];
  const monarchDip = monarch?.baseDiplomacy || 10;
  const calcGravitas = (ch?: Character): number => {
    if (!ch?.organicGravitas) return 220;
    const g = ch.organicGravitas;
    const lin = g.lineagePrestige > 180 ? Math.log10(1 + g.lineagePrestige) * 52 : g.lineagePrestige;
    return Math.min(1000, Math.max(25, Math.round(g.militaryAutonomy + g.economicExtraction + g.populistLoyalty + lin + g.sovereignDebtHeld * 0.5)));
  };
  const monarchGravitas = calcGravitas(monarch);
  const monarchGravBonus = Math.max(-12, Math.min(20, Math.round((monarchGravitas - 350) * 0.035)));

  for (const v of voters) {
    const traits = new Set([...(v.personalityTraits || []), ...(v.v17Traits || [])]);
    const opinion = monarch ? (v.opinions?.[monarch.id] ?? 15) : 15;
    const loyalty = v.loyalty ?? 55;
    let score = (opinion - 10) * 0.65 + (loyalty - 50) * 0.45 + (monarchDip - 10) * 1.4 + monarchGravBonus;
    let reason = opinion >= 25 ? 'Respects sovereign leadership' : 'Wary of crown motives';

    if (monarch && v.friendId === monarch.id) {
      score += 22;
      reason = 'Sworn friend & trusted confidant of the Crown';
    } else if (monarch && v.rivalId === monarch.id) {
      score -= 34;
      reason = 'Bitter personal rivalry with the Crown blocks consensus';
    } else if (monarch && (v.grudges || []).some((gr) => gr.value <= -50)) {
      score -= 18;
      reason = 'Harbors unresolved court grudges';
    }

    // Trait & vested-interest alignments
    if (traits.has('Just') || traits.has('Compassionate') || traits.has('Honest') || v.aiArchetype === 'Honorable Paragon' || v.aiArchetype === 'Benevolent Builder') {
      if (isAntiCorr || isDemReform || bill.proposedValue === 'Traditional') {
        score += 24;
        reason = 'Supports institutional fairness & public accountability';
      }
      if (bill.targetKey === 'authority' && bill.proposedValue === 'Absolute') {
        score -= 28;
        reason = 'Opposes unchecked autocratic concentration';
      }
      if (bill.targetKey === 'justice' && (bill.proposedValue === 'Draconian' || bill.proposedValue === 'Noble Immunity')) {
        score -= 22;
        reason = 'Objects to unequal or draconian justice';
      }
    }

    if (traits.has('Greedy') || traits.has('Arbitrary') || traits.has('Deceitful') || v.aiArchetype === 'Ruthless Schemer' || v.aiArchetype === 'Hedonistic Tyrant') {
      if (isAntiCorr) {
        score -= 32;
        reason = 'Vested interest opposes transparency & anti-lobbying caps';
      }
      if (bill.targetKey === 'justice' && bill.proposedValue === 'Noble Immunity') {
        score += 28;
        reason = 'Favors aristocratic immunity from crown prosecution';
      }
      if (bill.targetKey === 'redistricting' && bill.proposedValue === 'Independent Commission') {
        score -= 24;
        reason = 'Resists losing partisan boundary control';
      }
    }

    if (traits.has('Ambitious') && (v.role === 'Vassal Duke' || v.role === 'Vassal Count')) {
      if (bill.targetKey === 'decentralization' && bill.proposedValue === 'Devolved Local Autonomy') {
        score += 26;
        reason = 'Welcomes devolved provincial autonomy';
      } else if (bill.targetKey === 'authority' && (bill.proposedValue === 'High' || bill.proposedValue === 'Absolute')) {
        score -= 30;
        reason = 'Refuses centralization of crown authority over fiefs';
      } else if (bill.targetKey === 'succession' && bill.proposedValue === 'Elective') {
        score += 25;
        reason = 'Favors an elective council voice in succession';
      }
    }

    if (traits.has('Zealous') || v.aiArchetype === 'Religious Zealot' || v.role === 'Court Chaplain') {
      if (bill.targetKey === 'gender' && bill.proposedValue === 'Cognatic') {
        score -= 16;
        reason = 'Traditional orthodoxy hesitates on full cognatic reform';
      } else if (bill.targetKey === 'minorityProtection' && bill.proposedValue === 'Consociational Power-Sharing') {
        score -= 10;
        reason = 'Cautious of sharing doctrinal primacy with minorities';
      } else if (bill.targetKey === 'civicEducation' || bill.targetKey === 'citizensAssembly') {
        score += 10;
      }
    }

    if (v.role === 'Steward' || v.role === 'Lord Mayor') {
      if (bill.targetKey === 'eGovernance' || bill.targetKey === 'civilService' || bill.targetKey === 'participatoryBudgeting') {
        score += 18;
        reason = 'Recognizes fiscal & administrative efficiency gains';
      }
    }

    // How Reform Actually Happens bonuses:
    if (bill.coalitionBuilt) {
      score += 18;
      if (score >= 0) reason = 'Aligned via cross-partisan coalition pact';
    }
    if (hasPilot) {
      score += 20;
      if (score >= 0) reason = 'Convinced by successful local municipal pilot';
    }
    if (health.crisisCatalystMonths > 0 || bill.crisisCatalystApplied) {
      bill.crisisCatalystApplied = true;
      score += 16;
      if (score >= 0 && isDemReform) reason = 'Pressured by public crisis catalyst window';
    }
    if (bill.citizenAssemblyEndorsed) {
      score += 12;
    }
    const chancery = realmId ? getRealmChanceryEfficiency(realmId, world) : null;
    if (chancery && chancery.reformSpeedMult > 1.0) {
      score += Math.round((chancery.reformSpeedMult - 1.0) * 32); // +25% Chancery reform speed -> +8 consensus momentum
    }

    const isPersuaded = bill.persuadedIds.includes(v.id);
    const hasHook = monarch?.hooksHeld?.some((h) => h.targetId === v.id) || (world.favors || []).some((f) => f.creditorId === monarch?.id && f.debtorId === v.id);

    let vote: 'Aye' | 'Nay' | 'Abstain' = isPersuaded ? 'Aye' : score >= 12 ? 'Aye' : score <= -6 ? 'Nay' : 'Abstain';
    if (isPersuaded) {
      reason = 'Sworn to support via coalition diplomacy or favor';
    }

    const vGravitas = calcGravitas(v);
    // Under Proportional Representation, regional lords carry balanced weight; under traditional councils high-Gravitas magnates carry 2x-3x seats
    const weight =
      ps.votingSystem === 'Proportional Representation'
        ? 1
        : vGravitas >= 550
        ? 3
        : vGravitas >= 360 || v.role === 'Vassal Duke' || v.role === 'Chancellor'
        ? 2
        : 1;

    votes.push({
      voterId: v.id,
      voterName: v.name,
      role: v.role,
      vote,
      weight,
      reason,
      canFlipWithFavor: vote !== 'Aye' && Boolean(hasHook),
      canFlipWithDiplomacy: vote !== 'Aye',
    });
  }

  // If Citizens' Assembly is active, it sits as an advisory deliberative jury voting on reforms!
  if (ps.citizensAssembly === 'Sortition Citizens Assembly') {
    const jurySupports = isAntiCorr || isDemReform || bill.targetKey === 'authority' && bill.proposedValue === 'Limited';
    const juryVote: 'Aye' | 'Nay' | 'Abstain' =
      bill.citizenAssemblyEndorsed || jurySupports ? 'Aye' : bill.targetKey === 'authority' && bill.proposedValue === 'Absolute' ? 'Nay' : 'Abstain';
    votes.push({
      voterId: 'citizens_assembly_panel',
      voterName: "Citizens' Sortition Jury",
      role: 'Deliberative Panel',
      vote: juryVote,
      weight: 2,
      reason:
        juryVote === 'Aye'
          ? 'Sortition citizens panel endorses broader accountability & public welfare'
          : juryVote === 'Nay'
          ? 'Citizens panel rejects autocratic rollback'
          : 'Citizens panel awaits broader empirical debate',
      canFlipWithFavor: false,
      canFlipWithDiplomacy: false,
    });
  }

  const totalWeight = votes.reduce((acc, vt) => acc + vt.weight, 0) || 1;
  const ayeWeight = votes.filter((vt) => vt.vote === 'Aye').reduce((acc, vt) => acc + vt.weight, 0);

  bill.votes = votes;
  bill.ayePct = Math.round((ayeWeight / totalWeight) * 100) / 100;

  if (bill.status !== 'Enacted' && bill.status !== 'Rejected') {
    bill.status = bill.ayePct >= bill.requiredConsensusPct ? 'Consensus Reached' : 'Deliberating';
  }
}

export function proposeCouncilBill(
  world: WorldState,
  params: {
    title: string;
    summary: string;
    category: 'crown_law' | 'political_reform';
    targetDomain: 'realmLaws' | 'politicalSystem';
    targetKey: string;
    proposedValue: string;
    proposerId?: string;
  }
): { bill: CouncilBill; alreadyExisted: boolean } {
  ensureGovernanceInitialized(world);
  const currentVal =
    params.targetDomain === 'realmLaws'
      ? String((world.realmLaws as any)?.[params.targetKey] || '')
      : String((world.politicalSystem as any)?.[params.targetKey] || '');

  const existing = (world.pendingBills || []).find(
    (b) => b.targetDomain === params.targetDomain && b.targetKey === params.targetKey && b.proposedValue === params.proposedValue
  );
  if (existing) {
    evaluateBillVotes(world, existing);
    return { bill: existing, alreadyExisted: true };
  }

  const requiredConsensusPct =
    params.category === 'political_reform' || (params.targetKey === 'authority' && params.proposedValue === 'Absolute')
      ? 0.60
      : 0.55;

  const bill: CouncilBill = {
    id: `bill_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: params.title,
    summary: params.summary,
    category: params.category,
    targetDomain: params.targetDomain,
    targetKey: params.targetKey,
    proposedValue: params.proposedValue,
    previousValue: currentVal,
    proposerId: params.proposerId || world.monarchId || world.characters?.[0]?.id || '',
    proposedYear: world.currentYear || 1042,
    requiredConsensusPct,
    coalitionBuilt: false,
    citizenAssemblyEndorsed: false,
    crisisCatalystApplied: (world.governanceHealth?.crisisCatalystMonths || 0) > 0,
    persuadedIds: [],
    votes: [],
    ayePct: 0,
    status: 'Deliberating',
  };

  evaluateBillVotes(world, bill);
  world.pendingBills!.unshift(bill);
  return { bill, alreadyExisted: false };
}

export function buildReformCoalition(world: WorldState, billId: string): { success: boolean; message: string } {
  ensureGovernanceInitialized(world);
  const bill = (world.pendingBills || []).find((b) => b.id === billId);
  if (!bill) return { success: false, message: 'Legislative bill not found on the Council docket.' };
  if (bill.coalitionBuilt) return { success: false, message: 'A cross-faction coalition pact has already been forged for this bill.' };

  const monarch = world.characters.find((c) => c.id === bill.proposerId) || world.characters.find((c) => c.id === world.monarchId);
  const realm = world.realms?.find((r) => r.id === (monarch?.realmId || '')) || world.realms?.[0];
  const crownGold = realm?.treasury ?? monarch?.treasury ?? 0;
  const cost = 20;
  if (crownGold < cost) {
    return { success: false, message: `Insufficient Crown Fisc (${cost}g needed to host cross-partisan coalition conference).` };
  }
  if (realm) {
    realm.treasury = Math.round((crownGold - cost) * 10) / 10;
  } else if (monarch) {
    monarch.treasury = Math.round(((monarch.treasury || 0) - cost) * 10) / 10;
  }

  bill.coalitionBuilt = true;
  evaluateBillVotes(world, bill);
  return {
    success: true,
    message: `Cross-partisan coalition convened (${cost}g from Crown Fisc)! Consensus support rose to ${Math.round(bill.ayePct * 100)}%.`,
  };
}

export function launchLocalReformPilot(
  world: WorldState,
  reformKey: keyof PoliticalSystemState,
  proposedValue: string,
  countyId: string
): { success: boolean; message: string } {
  ensureGovernanceInitialized(world);
  const county = world.counties.find((c) => c.id === countyId) || world.counties[0];
  if (!county) return { success: false, message: 'No county available for a local pilot.' };

  const existing = (world.reformPilots || []).find(
    (p) => p.reformKey === reformKey && p.proposedValue === proposedValue && p.countyId === county.id
  );
  if (existing) {
    return { success: false, message: `${county.name} already piloted ${proposedValue}.` };
  }

  const monarch = world.characters.find((c) => c.id === world.monarchId);
  const realm = world.realms?.find((r) => r.id === (county.realmId || monarch?.realmId || '')) || world.realms?.[0];
  const crownGold = realm?.treasury ?? monarch?.treasury ?? 0;
  const pilotCost = 25;
  if (crownGold < pilotCost) {
    return { success: false, message: `Need ${pilotCost}g in Crown Fisc to fund municipal pilot in ${county.name}.` };
  }
  if (realm) {
    realm.treasury = Math.round((crownGold - pilotCost) * 10) / 10;
    if (realm.budget?.lastReport) {
      realm.budget.lastReport.buildingSubsidies =
        Math.round(((realm.budget.lastReport.buildingSubsidies || 0) + pilotCost) * 10) / 10;
    }
  } else if (monarch) {
    monarch.treasury = Math.round(((monarch.treasury || 0) - pilotCost) * 10) / 10;
  }

  const pilot: ReformPilot = {
    id: `pilot_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    reformKey,
    proposedValue,
    countyId: county.id,
    countyName: county.name,
    startedYear: world.currentYear || 1042,
    isSuccessful: true,
  };
  world.reformPilots!.unshift(pilot);
  county.development = Math.min(100, (county.development || 30) + 2);

  // Re-evaluate any matching open bills
  for (const bill of world.pendingBills || []) {
    if (bill.targetKey === reformKey && bill.proposedValue === proposedValue) {
      bill.localPilotCountyId = county.id;
      evaluateBillVotes(world, bill);
    }
  }

  return {
    success: true,
    message: `Local-to-National Pilot launched in ${county.name} (${pilotCost}g)! Empirical proof boosts Council consensus by +20%.`,
  };
}

export function persuadeCouncilorOnBill(
  world: WorldState,
  billId: string,
  voterId: string,
  method: 'diplomacy' | 'favor'
): { success: boolean; message: string } {
  ensureGovernanceInitialized(world);
  const bill = (world.pendingBills || []).find((b) => b.id === billId);
  if (!bill) return { success: false, message: 'Bill not found.' };
  if (bill.persuadedIds.includes(voterId)) return { success: false, message: 'Councilor already pledged support.' };

  const monarch = world.characters.find((c) => c.id === bill.proposerId) || world.characters.find((c) => c.id === world.monarchId);
  const realm = world.realms?.find((r) => r.id === (monarch?.realmId || '')) || world.realms?.[0];
  const voter = world.characters.find((c) => c.id === voterId);
  if (!voter) return { success: false, message: 'Councilor not found.' };

  if (method === 'favor') {
    const favorIdx = (world.favors || []).findIndex((f) => f.creditorId === monarch?.id && f.debtorId === voter.id);
    const hookIdx = monarch?.hooksHeld?.findIndex((h) => h.targetId === voter.id) ?? -1;
    if (favorIdx === -1 && hookIdx === -1) {
      return { success: false, message: `You hold no owed favor or hook over ${voter.name}.` };
    }
    if (favorIdx >= 0) world.favors!.splice(favorIdx, 1);
    else if (hookIdx >= 0 && monarch?.hooksHeld) monarch.hooksHeld.splice(hookIdx, 1);
  } else {
    const monarchHouse = monarch?.houseName ? computeHouseProfile(monarch.houseName, world) : null;
    const voterHouse = voter.houseName ? computeHouseProfile(voter.houseName, world) : null;
    const leverageDelta = (monarchHouse?.negotiatingPower || 0) - (voterHouse?.negotiatingPower || 0);
    const concessionCost = Math.max(5, Math.min(35, Math.round(15 - leverageDelta * 0.45)));
    const crownGold = realm?.treasury ?? monarch?.treasury ?? 0;
    if (crownGold < concessionCost) {
      return {
        success: false,
        message: `Need ${concessionCost}g in Crown Fisc for diplomatic concession (House ${voter.houseName} negotiating leverage).`,
      };
    }
    if (realm) {
      realm.treasury = Math.round((crownGold - concessionCost) * 10) / 10;
    } else if (monarch) {
      monarch.treasury = Math.round(((monarch.treasury || 0) - concessionCost) * 10) / 10;
    }
    if (!voter.opinions) voter.opinions = {};
    if (monarch) voter.opinions[monarch.id] = (voter.opinions[monarch.id] || 0) + 10;
  }

  bill.persuadedIds.push(voterId);
  evaluateBillVotes(world, bill);
  return {
    success: true,
    message: `${voter.name} pledged Aye to "${bill.title}". Consensus is now ${Math.round(bill.ayePct * 100)}%.`,
  };
}

export function attemptRatifyBill(world: WorldState, billId: string): { enacted: boolean; message: string } {
  ensureGovernanceInitialized(world);
  const idx = (world.pendingBills || []).findIndex((b) => b.id === billId);
  if (idx === -1) return { enacted: false, message: 'Bill is no longer on the legislative docket.' };

  const bill = world.pendingBills![idx];
  evaluateBillVotes(world, bill);

  if (bill.ayePct < bill.requiredConsensusPct) {
    const curPct = Math.round(bill.ayePct * 100);
    const reqPct = Math.round(bill.requiredConsensusPct * 100);
    return {
      enacted: false,
      message: `CONSENSUS BLOCKED (${curPct}% Aye vs ${reqPct}% needed): ${bill.title} cannot pass automatically. Build a coalition, pilot locally, or persuade dissenting councilors.`,
    };
  }

  // Enact into law
  if (bill.targetDomain === 'realmLaws') {
    (world.realmLaws as any)[bill.targetKey] = bill.proposedValue;
  } else {
    (world.politicalSystem as any)[bill.targetKey] = bill.proposedValue;
  }

  bill.status = 'Enacted';
  world.pendingBills!.splice(idx, 1);
  world.legislativeHistory!.unshift(bill);

  const monarch = world.characters.find((c) => c.id === bill.proposerId) || world.characters.find((c) => c.id === world.monarchId);
  if (monarch) {
    monarch.prestige = (monarch.prestige || 200) + 25;
  }

  world.governanceHealth = computeGovernanceHealth(world);

  if (!world.history) world.history = [];
  world.history.unshift({
    id: `hist_law_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    year: world.currentYear || 1042,
    title: `Council Enacted: ${bill.title}`,
    category: 'Dynastic Drama',
    description: `By ${Math.round(bill.ayePct * 100)}% Council consensus${bill.localPilotCountyId ? ' (backed by local municipal pilot)' : ''}, the realm ratified ${bill.proposedValue}.`,
    primaryActorId: monarch?.id,
    realmId: monarch?.realmId,
  });

  return {
    enacted: true,
    message: `RATIFIED (${Math.round(bill.ayePct * 100)}% Consensus): ${bill.title} is now law!`,
  };
}

export function dismissBill(world: WorldState, billId: string): void {
  ensureGovernanceInitialized(world);
  const idx = (world.pendingBills || []).findIndex((b) => b.id === billId);
  if (idx >= 0) {
    const [removed] = world.pendingBills!.splice(idx, 1);
    removed.status = 'Rejected';
    world.legislativeHistory!.unshift(removed);
  }
}

/**
 * Monthly Governance Engine step:
 * Applies institutional reforms (anti-corruption, civil service efficiency, citizen participation,
 * minority power-sharing, crisis catalyst windows) to the living world.
 */
export function stepGovernanceSystem(world: WorldState): void {
  ensureGovernanceInitialized(world);
  const ps = world.politicalSystem!;
  const prevHealth = world.governanceHealth!;

  // 1. Check Crisis Catalysts ("Institutional Crises as Catalysts")
  let catalystMonths = Math.max(0, (prevHealth.crisisCatalystMonths || 0) - 1);
  let catalystReason = catalystMonths > 0 ? prevHealth.crisisCatalystReason : undefined;

  const hasUltimatum = (world.factions || []).some((f) => f.ultimatumIssued);
  const hasStarving = (world.burgs || []).some((b) => b.isStarving || (b.unrest || 0) >= 65);
  if (catalystMonths === 0 && (world.realmState === 'Civil War' || world.realmState === 'Foreign Invasion' || hasUltimatum || hasStarving)) {
    catalystMonths = 6;
    catalystReason =
      world.realmState === 'Civil War'
        ? 'Civil War Constitutional Crisis'
        : hasUltimatum
        ? 'Factional Ultimatum Pressure'
        : 'Food & Unrest Reform Pressure';
  }

  // 2. Apply monthly systemic governance effects on settlements & lords
  for (const b of world.burgs || []) {
    let unrestMod = 0;
    if (ps.citizensAssembly === 'Sortition Citizens Assembly') unrestMod -= 1.5;
    if (ps.participatoryBudgeting === 'Participatory Budgeting') {
      unrestMod -= 2.0;
      if (Math.random() < 0.08) b.developmentLevel = Math.min(100, (b.developmentLevel || 30) + 1);
    }
    if (ps.suffrageAccess === 'Universal Accessible') unrestMod -= 1.0;
    if (ps.civicEducation === 'Universal Civic & Media Literacy') unrestMod -= 1.0;
    if (ps.minorityProtection === 'Consociational Power-Sharing') unrestMod -= 1.5;

    if (unrestMod !== 0 && b.unrest !== undefined) {
      b.unrest = Math.max(0, Math.min(100, Math.round(b.unrest + unrestMod)));
    }

    // Merit-based civil service & open E-governance reduce municipal waste / boost coffer retention
    if (ps.civilService === 'Merit-Based Civil Service' || ps.eGovernance === 'Open Data & E-Services') {
      const efficiencyGain =
        (ps.civilService === 'Merit-Based Civil Service' ? 0.6 : 0) +
        (ps.eGovernance === 'Open Data & E-Services' ? 0.5 : 0);
      b.treasury = Math.round(((b.treasury ?? 30) + efficiencyGain) * 10) / 10;
    }
  }

  // 3. Minority power-sharing & fair redistricting stabilize vassal loyalty
  if (
    ps.minorityProtection === 'Consociational Power-Sharing' ||
    ps.redistricting === 'Independent Commission' ||
    ps.votingSystem === 'Proportional Representation'
  ) {
    const loyaltyBoost =
      (ps.minorityProtection === 'Consociational Power-Sharing' ? 1.0 : 0) +
      (ps.redistricting === 'Independent Commission' ? 0.5 : 0) +
      (ps.votingSystem === 'Proportional Representation' ? 0.5 : 0);
    for (const c of world.characters || []) {
      if (c.isAlive && c.id !== world.monarchId) {
        c.loyalty = Math.min(100, (c.loyalty ?? 55) + loyaltyBoost * 0.5);
      }
    }
  }

  // 4. Refresh pending bill tallies & health metrics
  for (const bill of world.pendingBills || []) {
    evaluateBillVotes(world, bill);
  }

  const nextHealth = computeGovernanceHealth(world);
  nextHealth.crisisCatalystMonths = catalystMonths;
  nextHealth.crisisCatalystReason = catalystReason;
  world.governanceHealth = nextHealth;
}
