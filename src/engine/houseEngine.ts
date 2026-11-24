import type {
  Character,
  Claim,
  CoatOfArmsData,
  DiplomaticProposalKind,
  WorldState,
} from '../types/world';
import { isNobleOrigin } from '../utils/heraldryBridge';
import { checkMarriageLegality } from './deathAndJusticeEngine';

export type HousePowerTier =
  | 'Paramount Dynasty'
  | 'Great House'
  | 'Illustrious House'
  | 'Established House'
  | 'Minor House';

export interface HouseAncestralClaimEntry {
  claim: Claim;
  claimant: Character;
  holdingName: string;
  currentOwnerName: string;
  currentOwnerRealmName: string;
}

export interface HouseProfile {
  houseName: string;
  motto: string;
  coatOfArms?: CoatOfArmsData;
  primaryRealmId?: string;
  primaryRealmName?: string;
  head?: Character;
  livingMembers: Character[];
  ancestors: Character[];
  allMembers: Character[];
  cadetBranchNames: string[];
  parentDynasty?: string;
  heldRealmIds: string[];
  heldCountyIds: string[];
  heldBurgIds: string[];
  ancestralClaims: HouseAncestralClaimEntry[];
  revokedAncestralClaims: HouseAncestralClaimEntry[];
  maritalAllianceHouses: string[];
  alliedRealmNames: string[];
  totalPrestige: number;
  influenceScore: number; // 0 to 100
  powerTier: HousePowerTier;
  negotiatingPower: number; // -10 to +35 diplomatic & council leverage
  marriageAppeal: number; // 0 to 100
}

export interface DynastyGeneration {
  depth: number;
  label: string;
  members: Character[];
}

export interface HouseDynastyTree {
  houseName: string;
  generations: DynastyGeneration[];
  totalAncestors: number;
  totalLiving: number;
}

export interface MarriageProspectEvaluation {
  accepted: boolean;
  score: number;
  chanceLabel: 'Certain' | 'Favorable' | 'Reluctant' | 'Refused';
  reasons: string[];
  suitorHouse: HouseProfile;
  candidateHouse: HouseProfile;
}

export interface AllianceNegotiationEvaluation {
  accepted: boolean;
  score: number;
  chanceLabel: 'Certain' | 'Favorable' | 'Reluctant' | 'Refused';
  reasons: string[];
  houseA?: HouseProfile;
  houseB?: HouseProfile;
}

export interface BilateralConsentEvaluation {
  accepted: boolean;
  score: number;
  chanceLabel: 'Certain' | 'Favorable' | 'Reluctant' | 'Refused';
  reasons: string[];
  proposerConsent: boolean;
  recipientConsent: boolean;
}

function tierRank(c: Character): number {
  if (c.role === 'Monarch' || c.titleTier === 'Emperor') return 6;
  if (c.titleTier === 'King') return 5;
  if (c.titleTier === 'Duke' || c.role === 'Vassal Duke') return 4;
  if (c.titleTier === 'Count' || c.role === 'Vassal Count') return 3;
  if (c.titleTier === 'Baron' || c.role === 'Vassal Baron') return 2;
  if (c.titleTier === 'Mayor') return 1;
  return 0;
}

function classifyHouseTier(influenceScore: number, holdsRealm: boolean): HousePowerTier {
  if (influenceScore >= 82 || (holdsRealm && influenceScore >= 72)) return 'Paramount Dynasty';
  if (influenceScore >= 64) return 'Great House';
  if (influenceScore >= 46) return 'Illustrious House';
  if (influenceScore >= 28) return 'Established House';
  return 'Minor House';
}

export function computeHouseProfile(houseName: string, world: WorldState): HouseProfile {
  const normalized = (houseName || '').trim();
  const members = (world.characters || []).filter(
    (c) => (c.houseName || '').trim() === normalized
  );
  const livingMembers = members
    .filter((c) => c.isAlive !== false)
    .sort(
      (a, b) =>
        tierRank(b) - tierRank(a) ||
        (b.prestige || 0) - (a.prestige || 0) ||
        (b.age || 0) - (a.age || 0)
    );
  const ancestors = members
    .filter((c) => c.isAlive === false)
    .sort((a, b) => (a.birthYear ?? 900) - (b.birthYear ?? 900));

  const head = livingMembers[0] || ancestors[ancestors.length - 1];
  const memberIds = new Set(members.map((m) => m.id));

  const heldRealmIds = (world.realms || [])
    .filter((r) => r.rulerId && memberIds.has(r.rulerId))
    .map((r) => r.id);
  const heldCountyIds = (world.counties || [])
    .filter((ct) => ct.rulerId && memberIds.has(ct.rulerId))
    .map((ct) => ct.id);
  const heldBurgIds = (world.burgs || [])
    .filter((b) => b.ownerId && memberIds.has(b.ownerId))
    .map((b) => b.id);

  const primaryRealmId = heldRealmIds[0] || head?.realmId;
  const primaryRealm = (world.realms || []).find((r) => r.id === primaryRealmId);

  const cadetRec = world.cadetHouses?.[normalized];
  const cadetBranchNames = Object.values(world.cadetHouses || {})
    .filter((ch) => ch.parentDynasty === normalized)
    .map((ch) => ch.name);

  // Ancestral Claims (active vs revoked by royal decree)
  const ancestralClaims: HouseAncestralClaimEntry[] = [];
  const revokedAncestralClaims: HouseAncestralClaimEntry[] = [];
  const seenClaimKey = new Set<string>();

  for (const m of members) {
    for (const cl of m.claims || []) {
      if (!cl.isAncestral && cl.originHouse !== normalized) continue;
      const key = `${cl.holdingId}::${m.id}`;
      if (seenClaimKey.has(key)) continue;
      seenClaimKey.add(key);

      const holding = (world.holdings || []).find((h) => h.id === cl.holdingId);
      const owner = holding ? (world.characters || []).find((c) => c.id === holding.ownerId) : undefined;
      const ownerRealm = owner ? (world.realms || []).find((r) => r.id === owner.realmId) : undefined;

      const entry: HouseAncestralClaimEntry = {
        claim: cl,
        claimant: m,
        holdingName: holding?.name || cl.holdingId,
        currentOwnerName: owner?.name || 'Vacant Seat',
        currentOwnerRealmName: ownerRealm?.name || 'Independent',
      };
      if (cl.revokedByDecree) {
        revokedAncestralClaims.push(entry);
      } else if (m.isAlive !== false) {
        ancestralClaims.push(entry);
      }
    }
  }

  // Marital alliance houses & state allies
  const maritalHouseSet = new Set<string>();
  for (const m of livingMembers) {
    if (!m.spouseId) continue;
    const sp = (world.characters || []).find((c) => c.id === m.spouseId && c.isAlive !== false);
    if (sp && sp.houseName && sp.houseName !== normalized) {
      maritalHouseSet.add(sp.houseName);
    }
  }
  const alliedRealmNames = (primaryRealm?.alliedRealmIds || [])
    .map((id) => (world.realms || []).find((r) => r.id === id)?.name)
    .filter(Boolean) as string[];

  // Compute Canonical House Prestige
  const livingPrestige = livingMembers.reduce((sum, c) => sum + Math.max(0, c.prestige || 0), 0);
  const ancestorLegacy = ancestors.reduce((sum, c) => sum + Math.max(0, c.prestige || 120) * 0.35, 0);
  const titlePrestige =
    heldRealmIds.length * 650 +
    heldCountyIds.length * 140 +
    heldBurgIds.length * 55 +
    ancestralClaims.length * 45 +
    maritalHouseSet.size * 65;
  const cadetBonus = (cadetRec?.prestige || 0) * 0.4 + cadetBranchNames.length * 120;
  const totalPrestige = Math.round(livingPrestige + ancestorLegacy + titlePrestige + cadetBonus);

  // Logarithmic + capped Influence Score (0-100) so prestige scales meaningfully
  const rawInfluence = Math.round(
    Math.min(
      100,
      Math.max(
        8,
        Math.log10(1 + Math.max(0, totalPrestige)) * 24 +
          heldRealmIds.length * 14 +
          Math.min(18, heldCountyIds.length * 3.5) +
          Math.min(10, maritalHouseSet.size * 3)
      )
    )
  );

  const powerTier = classifyHouseTier(rawInfluence, heldRealmIds.length > 0);
  // Negotiating power directly derived from House Prestige & Influence (-8 to +35)
  const negotiatingPower = Math.max(-8, Math.min(35, Math.round((rawInfluence - 32) * 0.52)));
  const marriageAppeal = Math.max(10, Math.min(100, Math.round(rawInfluence * 0.85 + Math.min(15, heldRealmIds.length * 12 + heldCountyIds.length * 2))));

  const crestSource =
    head?.coatOfArms ||
    livingMembers.find((m) => m.coatOfArms?.config)?.coatOfArms ||
    ancestors.find((m) => m.coatOfArms?.config)?.coatOfArms ||
    cadetRec?.coatOfArms ||
    (heldRealmIds.length > 0 ? primaryRealm?.heraldry : undefined);

  return {
    houseName: normalized || 'Unknown House',
    motto: head?.houseMotto || members[0]?.houseMotto || 'Honor & Bloodline',
    coatOfArms: crestSource,
    primaryRealmId,
    primaryRealmName: primaryRealm?.name,
    head,
    livingMembers,
    ancestors,
    allMembers: members,
    cadetBranchNames,
    parentDynasty: cadetRec?.parentDynasty || head?.cadetParentHouse,
    heldRealmIds,
    heldCountyIds,
    heldBurgIds,
    ancestralClaims,
    revokedAncestralClaims,
    maritalAllianceHouses: Array.from(maritalHouseSet),
    alliedRealmNames,
    totalPrestige,
    influenceScore: rawInfluence,
    powerTier,
    negotiatingPower,
    marriageAppeal,
  };
}

export function getAllHouseProfiles(world: WorldState): HouseProfile[] {
  const houseNames = new Set<string>();
  for (const ch of world.characters || []) {
    const h = (ch.houseName || '').trim();
    if (!h) continue;
    if (isNobleOrigin(ch) || ch.isAlive === false || ch.coatOfArms?.config) {
      houseNames.add(h);
    }
  }
  const profiles = Array.from(houseNames).map((name) => computeHouseProfile(name, world));
  profiles.sort(
    (a, b) =>
      b.influenceScore - a.influenceScore ||
      b.totalPrestige - a.totalPrestige ||
      b.livingMembers.length - a.livingMembers.length
  );
  return profiles;
}

export function buildHouseDynastyTree(houseName: string, world: WorldState): HouseDynastyTree {
  const profile = computeHouseProfile(houseName, world);
  const members = profile.allMembers;
  if (members.length === 0) {
    return { houseName, generations: [], totalAncestors: 0, totalLiving: 0 };
  }

  const byId = new Map<string, Character>(members.map((m) => [m.id, m]));
  const depthMap = new Map<string, number>();

  const computeDepth = (char: Character, visiting = new Set<string>()): number => {
    if (depthMap.has(char.id)) return depthMap.get(char.id)!;
    if (visiting.has(char.id)) return 0;
    visiting.add(char.id);

    const parentIds = [char.knownFatherId, char.realFatherId, char.motherId].filter(
      (id): id is string => Boolean(id && byId.has(id))
    );
    let d = 0;
    for (const pid of parentIds) {
      const p = byId.get(pid);
      if (p) {
        d = Math.max(d, computeDepth(p, visiting) + 1);
      }
    }
    depthMap.set(char.id, d);
    return d;
  };

  for (const m of members) {
    computeDepth(m);
  }

  // Ensure disconnected deceased ancestors are grouped by age/birthYear above living members
  const deceased = members.filter((m) => m.isAlive === false);
  const living = members.filter((m) => m.isAlive !== false);
  const maxAncestorDepth = Math.max(
    0,
    ...deceased.map((m) => depthMap.get(m.id) || 0)
  );
  for (const m of living) {
    const hasParentInHouse = [m.knownFatherId, m.realFatherId, m.motherId].some(
      (id) => id && byId.has(id)
    );
    if (!hasParentInHouse && deceased.length > 0 && (depthMap.get(m.id) || 0) <= maxAncestorDepth) {
      depthMap.set(m.id, maxAncestorDepth + 1);
    }
  }

  const buckets = new Map<number, Character[]>();
  for (const m of members) {
    const d = depthMap.get(m.id) || 0;
    if (!buckets.has(d)) buckets.set(d, []);
    buckets.get(d)!.push(m);
  }

  const sortedDepths = Array.from(buckets.keys()).sort((a, b) => a - b);
  const generations: DynastyGeneration[] = sortedDepths.map((d, idx) => {
    const genMembers = buckets
      .get(d)!
      .slice()
      .sort((a, b) => tierRank(b) - tierRank(a) || (b.age || 0) - (a.age || 0));
    const allDeceased = genMembers.every((m) => m.isAlive === false);
    const label =
      idx === 0 && allDeceased
        ? 'Founding Ancestors'
        : allDeceased
        ? `Ancestral Generation ${idx + 1}`
        : idx === sortedDepths.length - 1 && sortedDepths.length > 1
        ? 'Heirs & Descendants'
        : `Generation ${idx + 1}`;
    return { depth: d, label, members: genMembers };
  });

  return {
    houseName: profile.houseName,
    generations,
    totalAncestors: profile.ancestors.length,
    totalLiving: profile.livingMembers.length,
  };
}

export function evaluateMarriageProspect(
  suitor: Character,
  candidate: Character,
  world: WorldState
): MarriageProspectEvaluation {
  const suitorHouse = computeHouseProfile(suitor.houseName || 'Unknown', world);
  const candidateHouse = computeHouseProfile(candidate.houseName || 'Unknown', world);
  const reasons: string[] = [];

  const legality = checkMarriageLegality(suitor, candidate, world);
  if (!legality.allowed) {
    return {
      accepted: false,
      score: -100,
      chanceLabel: 'Refused',
      reasons: [legality.reason || 'Forbidden by Crown Marriage Law (-100)'],
      suitorHouse,
      candidateHouse,
    };
  }

  let score = 16; // Base willingness for a suitable noble union

  // 1. Direct impact of House Prestige & Influence on marriage prospects
  const influenceDelta = suitorHouse.influenceScore - candidateHouse.influenceScore;
  const prestigeTerm = Math.round(influenceDelta * 0.7 + suitorHouse.negotiatingPower * 0.45);
  score += prestigeTerm;
  if (prestigeTerm >= 8) {
    reasons.push(`House ${suitorHouse.houseName} (${suitorHouse.powerTier}) commands high prestige (+${prestigeTerm})`);
  } else if (prestigeTerm <= -8) {
    reasons.push(`House ${candidateHouse.houseName} (${candidateHouse.powerTier}) outranks House ${suitorHouse.houseName} (${prestigeTerm})`);
  } else {
    reasons.push(`Comparable dynastic prestige (${prestigeTerm >= 0 ? '+' : ''}${prestigeTerm})`);
  }

  // 2. Personal rank & diplomacy
  const rankDelta = (tierRank(suitor) - tierRank(candidate)) * 6;
  if (rankDelta !== 0) {
    score += rankDelta;
    reasons.push(`Title standing (${rankDelta >= 0 ? '+' : ''}${rankDelta})`);
  }
  const dipBonus = Math.round(((suitor.baseDiplomacy || 10) - 10) * 1.4);
  if (dipBonus !== 0) {
    score += dipBonus;
    reasons.push(`Negotiator Diplomacy (${dipBonus >= 0 ? '+' : ''}${dipBonus})`);
  }

  // 3. Kinship & Bloodline considerations
  if (legality.isBloodRelative) {
    if (legality.kinship === 'First Cousin' || legality.kinship === 'Same-House Kin') {
      score += 6;
      reasons.push(`Dynastic consolidation (${legality.kinship}, +6)`);
    } else if (legality.isCloseKin) {
      score -= 8;
      reasons.push(`Close bloodline union (${legality.kinship}, -8 · permitted under law)`);
    }
  }

  // 4. Personal opinion & bilateral realm relations
  const opinion = candidate.opinions?.[suitor.id] ?? 0;
  const opTerm = Math.round(opinion * 0.35);
  if (opTerm !== 0) {
    score += opTerm;
    reasons.push(`Personal Opinion (${opTerm >= 0 ? '+' : ''}${opTerm})`);
  }

  if (suitor.realmId !== candidate.realmId) {
    const realmA = (world.realms || []).find((r) => r.id === suitor.realmId);
    const isAllied = Boolean(realmA?.alliedRealmIds?.includes(candidate.realmId));
    const isEnemy = Boolean(realmA?.enemyRealmIds?.includes(candidate.realmId));
    if (isEnemy) {
      score = -100;
      reasons.push('Proclaimed Enemy States (-100)');
    } else if (isAllied) {
      score += 24;
      reasons.push('Allied Realms (+24)');
    } else {
      score += 10;
      reasons.push('Cross-Border Dynastic Alliance Incentive (+10)');
    }
  } else {
    score += 8;
    reasons.push('Same Realm Court (+8)');
  }

  if (legality.isRoyalMatch) {
    score += 10;
    reasons.push('Royal House Prestige (+10)');
  }

  const accepted = score >= 0;
  const chanceLabel: MarriageProspectEvaluation['chanceLabel'] =
    score >= 30 ? 'Certain' : score >= 5 ? 'Favorable' : score >= 0 ? 'Reluctant' : 'Refused';

  return {
    accepted,
    score,
    chanceLabel,
    reasons,
    suitorHouse,
    candidateHouse,
  };
}

export function evaluateAllianceNegotiation(
  realmAId: string,
  realmBId: string,
  world: WorldState
): AllianceNegotiationEvaluation {
  const ra = (world.realms || []).find((r) => r.id === realmAId);
  const rb = (world.realms || []).find((r) => r.id === realmBId);
  const rulerA = (world.characters || []).find((c) => c.id === ra?.rulerId);
  const rulerB = (world.characters || []).find((c) => c.id === rb?.rulerId);
  const houseA = rulerA?.houseName ? computeHouseProfile(rulerA.houseName, world) : undefined;
  const houseB = rulerB?.houseName ? computeHouseProfile(rulerB.houseName, world) : undefined;

  const reasons: string[] = [];
  let score = 10;

  // House Prestige & Negotiating Power impact on Alliance acceptance
  if (houseA && houseB) {
    const prestigeDiff = Math.round((houseA.influenceScore - houseB.influenceScore) * 0.55);
    const negBonus = Math.round(houseA.negotiatingPower * 0.8);
    const houseTerm = prestigeDiff + negBonus;
    score += houseTerm;
    reasons.push(
      `House ${houseA.houseName} Prestige & Influence (${houseA.powerTier}): ${houseTerm >= 0 ? '+' : ''}${houseTerm}`
    );
  }

  const rel = ra?.diplomaticRelations?.[realmBId] ?? 0;
  const relTerm = Math.round(rel * 0.45);
  score += relTerm;
  reasons.push(`Bilateral Relations (${rel}): ${relTerm >= 0 ? '+' : ''}${relTerm}`);

  // Marital bond between ruling houses strongly boosts alliance acceptance
  const hasMaritalTie =
    houseA &&
    houseB &&
    (houseA.maritalAllianceHouses.includes(houseB.houseName) ||
      houseB.maritalAllianceHouses.includes(houseA.houseName));
  if (hasMaritalTie) {
    score += 28;
    reasons.push('Dynastic Marriage Tie (+28)');
  }

  // Shared enemy boosts alliance
  const sharedEnemy = (ra?.enemyRealmIds || []).some((id) => rb?.enemyRealmIds?.includes(id));
  if (sharedEnemy) {
    score += 20;
    reasons.push('Common Rival State (+20)');
  }

  if (ra?.enemyRealmIds?.includes(realmBId)) {
    score -= 60;
    reasons.push('Proclaimed Enmity (-60)');
  }

  const accepted = score >= 0;
  const chanceLabel: AllianceNegotiationEvaluation['chanceLabel'] =
    score >= 30 ? 'Certain' : score >= 5 ? 'Favorable' : score >= 0 ? 'Reluctant' : 'Refused';

  return {
    accepted,
    score,
    chanceLabel,
    reasons,
    houseA,
    houseB,
  };
}

function collectSimpleTraits(c?: Character): string[] {
  if (!c) return [];
  return Array.from(
    new Set([
      ...(c.personalityTraits || []),
      ...(c.lifestyleTraits || []),
      ...(c.statusTrait ? [c.statusTrait] : []),
    ])
  );
}

/**
 * Evaluates mutual (bilateral) sovereign consent for diplomatic treaties and normalizations.
 * Ensures diplomacy cannot succeed unilaterally when the counterparty has active enmity,
 * clashing claims, hostile traits, embargo, or negative diplomatic willingness.
 */
export function evaluateBilateralConsent(
  realmAId: string,
  realmBId: string,
  kind: DiplomaticProposalKind,
  world: WorldState
): BilateralConsentEvaluation {
  const ra = (world.realms || []).find((r) => r.id === realmAId);
  const rb = (world.realms || []).find((r) => r.id === realmBId);
  if (!ra || !rb || ra.id === rb.id) {
    return {
      accepted: false,
      score: -100,
      chanceLabel: 'Refused',
      reasons: ['Invalid counterparty realm (-100)'],
      proposerConsent: false,
      recipientConsent: false,
    };
  }

  const rulerA = (world.characters || []).find((c) => c.id === ra.rulerId && c.isAlive !== false);
  const rulerB = (world.characters || []).find((c) => c.id === rb.rulerId && c.isAlive !== false);
  const houseA = rulerA?.houseName ? computeHouseProfile(rulerA.houseName, world) : undefined;
  const houseB = rulerB?.houseName ? computeHouseProfile(rulerB.houseName, world) : undefined;

  const atWar = (world.activeWars || []).some(
    (war) =>
      (war.attackerRealmId === realmAId && war.defenderRealmId === realmBId) ||
      (war.attackerRealmId === realmBId && war.defenderRealmId === realmAId)
  );
  if (atWar && kind !== 'peace') {
    return {
      accepted: false,
      score: -100,
      chanceLabel: 'Refused',
      reasons: ['Realms are actively at war (-100)'],
      proposerConsent: false,
      recipientConsent: false,
    };
  }

  const reasons: string[] = [];
  const rel = ra.diplomaticRelations?.[realmBId] ?? 0;
  const isEnemies = Boolean(ra.enemyRealmIds?.includes(realmBId) || rb.enemyRealmIds?.includes(realmAId));
  const isAllied = Boolean(ra.alliedRealmIds?.includes(realmBId) || rb.alliedRealmIds?.includes(realmAId));
  const isEmbargoedByB = Boolean(rb.embargoedRealmIds?.includes(realmAId));
  const isEmbargoedByA = Boolean(ra.embargoedRealmIds?.includes(realmBId));

  let score = kind === 'trade_pact' ? 10 : kind === 'non_aggression' ? 14 : kind === 'end_rivalry' ? -4 : kind === 'lift_embargo' ? 4 : 4;

  const relTerm = Math.round(rel * 0.55);
  score += relTerm;
  reasons.push(`Bilateral Relations (${rel >= 0 ? '+' : ''}${rel}): ${relTerm >= 0 ? '+' : ''}${relTerm}`);

  if (rulerA && rulerB) {
    const opinionBtoA = rulerB.opinions?.[rulerA.id] ?? 0;
    const opinionAtoB = rulerA.opinions?.[rulerB.id] ?? 0;
    const opTerm = Math.round(opinionBtoA * 0.25 + opinionAtoB * 0.1);
    if (opTerm !== 0) {
      score += opTerm;
      reasons.push(`Sovereign Personal Rapport: ${opTerm >= 0 ? '+' : ''}${opTerm}`);
    }
  }

  const traitsB = collectSimpleTraits(rulerB);
  const friendlyB = traitsB.filter((t) => ['Gregarious', 'Honest', 'Forgiving', 'Just', 'Diplomat', 'Compassionate'].includes(t)).length;
  const hostileB = traitsB.filter((t) => ['Paranoid', 'Arrogant', 'Vengeful', 'Wrathful', 'Deceitful', 'Stubborn'].includes(t)).length;
  const traitTerm = friendlyB * 7 - hostileB * 8;
  if (traitTerm !== 0) {
    score += traitTerm;
    reasons.push(`${rulerB?.name || rb.name}'s Court Temperament: ${traitTerm >= 0 ? '+' : ''}${traitTerm}`);
  }

  if (ra.religion === rb.religion) {
    score += 8;
    reasons.push('Shared Sacred Faith (+8)');
  } else if (traitsB.includes('Zealous')) {
    score -= 16;
    reasons.push('Zealous Confessional Suspicion (-16)');
  }

  if (houseA && houseB) {
    const negTerm = Math.round(houseA.negotiatingPower * 0.45 + (houseA.influenceScore - houseB.influenceScore) * 0.2);
    score += negTerm;
    reasons.push(`House ${houseA.houseName} Standing (${houseA.powerTier}): ${negTerm >= 0 ? '+' : ''}${negTerm}`);
  }

  const hasMaritalTie =
    houseA &&
    houseB &&
    (houseA.maritalAllianceHouses.includes(houseB.houseName) ||
      houseB.maritalAllianceHouses.includes(houseA.houseName));
  if (hasMaritalTie) {
    score += 22;
    reasons.push('Dynastic Marriage Tie (+22)');
  }

  const sharedEnemy = (ra.enemyRealmIds || []).some((eid) => rb.enemyRealmIds?.includes(eid));
  if (sharedEnemy) {
    score += 15;
    reasons.push('Common Rival State (+15)');
  }

  // Conflicting sovereign territorial claims between the two rulers create friction
  const realmBCountyIds = new Set(rb.countyIds || []);
  const conflictingClaims = (rulerA?.claims || []).filter((cl) => {
    const h = (world.holdings || []).find((x) => x.id === cl.holdingId);
    return h && realmBCountyIds.has(h.provinceId);
  }).length;
  if (conflictingClaims > 0) {
    const penalty = Math.min(30, conflictingClaims * 12);
    score -= penalty;
    reasons.push(`Contested Territorial Claims (${conflictingClaims}): -${penalty}`);
  }

  if (isEnemies && kind !== 'end_rivalry') {
    score -= 45;
    reasons.push('Active State Enmity (-45)');
  }
  if ((isEmbargoedByB || isEmbargoedByA) && (kind === 'trade_pact' || kind === 'alliance')) {
    score -= 35;
    reasons.push('Active Trade Embargo (-35)');
  }
  if (isAllied) {
    score += 20;
    reasons.push('Existing Alliance (+20)');
  }

  // Aggressive expansion penalty if any
  const aeOnB = world.aggressiveExpansion?.[realmBId]?.[realmAId] ?? 0;
  if (aeOnB > 10) {
    const aePen = Math.min(40, Math.round(aeOnB * 0.55));
    score -= aePen;
    reasons.push(`Aggressive Expansion Distrust (-${aePen})`);
  }

  const threshold = kind === 'alliance' ? 12 : kind === 'end_rivalry' ? 4 : kind === 'lift_embargo' ? 0 : 0;
  const recipientConsent = score >= threshold && (!isEnemies || kind === 'end_rivalry');
  const proposerConsent = Boolean(rulerA) && (!isEmbargoedByB || kind === 'lift_embargo' || kind === 'end_rivalry');
  const accepted = recipientConsent && proposerConsent;
  const chanceLabel: BilateralConsentEvaluation['chanceLabel'] =
    score >= 30 ? 'Certain' : score >= threshold + 6 ? 'Favorable' : accepted ? 'Reluctant' : 'Refused';

  return {
    accepted,
    score,
    chanceLabel,
    reasons,
    proposerConsent,
    recipientConsent,
  };
}

export function revokeAncestralClaimByDecree(
  monarch: Character,
  claimantId: string,
  holdingId: string,
  world: WorldState
): { success: boolean; summary: string } {
  const isSovereign =
    monarch.role === 'Monarch' ||
    monarch.titleTier === 'King' ||
    monarch.titleTier === 'Emperor' ||
    world.realms.some((r) => r.rulerId === monarch.id);
  if (!isSovereign) {
    return {
      success: false,
      summary: 'Only a Sovereign Monarch may issue a Royal Decree revoking an ancestral claim.',
    };
  }

  const claimant = (world.characters || []).find((c) => c.id === claimantId);
  if (!claimant || !claimant.claims) {
    return { success: false, summary: 'Claimant or claim record not found.' };
  }

  const claim = claimant.claims.find(
    (cl) => cl.holdingId === holdingId && cl.isAncestral && !cl.revokedByDecree
  );
  if (!claim) {
    return { success: false, summary: 'No active ancestral claim found on that holding.' };
  }

  const holding = (world.holdings || []).find((h) => h.id === holdingId);
  const holdingName = holding?.name || holdingId;

  claim.revokedByDecree = true;
  claim.revokedYear = world.currentYear;
  claim.revokedByCharacterId = monarch.id;
  claim.isPressed = false;
  claim.isStrong = false;

  // Diplomatic & prestige fallout of a Royal Decree revoking hereditary rights
  monarch.prestige = Math.max(0, (monarch.prestige || 100) - 75);
  claimant.prestige = Math.max(0, (claimant.prestige || 100) - 90);
  for (const member of world.characters || []) {
    if (member.isAlive !== false && member.houseName === claimant.houseName) {
      if (!member.opinions) member.opinions = {};
      member.opinions[monarch.id] = Math.max(-100, (member.opinions[monarch.id] ?? 0) - 35);
    }
  }

  if (!world.history) world.history = [];
  world.history.unshift({
    id: `hist_decree_revoke_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
    year: world.currentYear,
    title: `Royal Decree: House ${claimant.houseName}'s Ancestral Claim Revoked`,
    category: 'Dynastic Drama',
    description: `By Royal Decree of ${monarch.name}, the ancestral claim of House ${claimant.houseName} upon ${holdingName} was formally extinguished (-35 House opinion).`,
    primaryActorId: monarch.id,
    secondaryActorId: claimant.id,
    realmId: monarch.realmId,
  });

  return {
    success: true,
    summary: `Royal Decree issued: House ${claimant.houseName}'s ancestral claim on ${holdingName} has been revoked (-75 Monarch Prestige, -35 House Opinion).`,
  };
}

export function seedBeginningHouseAncestralClaims(world: WorldState): void {
  const holdings = world.holdings || [];
  if (holdings.length === 0) return;

  const foundingYear = world.currentYear || 1042;
  const seenHouse = new Set<string>();

  // Prioritize Monarchs, Dukes, and Counts as heads of beginning noble houses
  const nobleHeads = (world.characters || [])
    .filter((c) => c.isAlive !== false && c.houseName && tierRank(c) >= 3)
    .sort((a, b) => tierRank(b) - tierRank(a) || (b.prestige || 0) - (a.prestige || 0));

  for (const head of nobleHeads) {
    if (seenHouse.has(head.houseName)) continue;
    seenHouse.add(head.houseName);

    if (!head.claims) head.claims = [];
    const alreadyHasAncestral = head.claims.some((cl) => cl.isAncestral);
    if (alreadyHasAncestral) continue;

    // Pick a historic/neighboring holding not currently owned by this house head
    const foreignTarget = holdings.find((h) => {
      if (h.ownerId === head.id) return false;
      const owner = world.characters.find((x) => x.id === h.ownerId);
      if (!owner || owner.houseName === head.houseName) return false;
      return head.role === 'Monarch'
        ? owner.realmId !== head.realmId
        : owner.realmId === head.realmId || owner.realmId !== head.realmId;
    });

    const fallbackTarget = holdings.find((h) => h.ownerId !== head.id);
    const target = foreignTarget || fallbackTarget;
    if (!target) continue;

    const existing = head.claims.find((cl) => cl.holdingId === target.id);
    if (existing) {
      existing.isAncestral = true;
      existing.originHouse = head.houseName;
      existing.grantedYear = foundingYear - 40;
      existing.isPressed = true;
      existing.isStrong = true;
    } else {
      head.claims.push({
        holdingId: target.id,
        claimantId: head.id,
        isPressed: true,
        isStrong: true,
        isAncestral: true,
        originHouse: head.houseName,
        grantedYear: foundingYear - 40,
      });
    }
  }
}
