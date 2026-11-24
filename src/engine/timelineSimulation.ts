import { WorldState, HistoricalEvent } from '../types/world';
import { PRNG } from '../utils/proceduralNoise';
import { computeCharacterStats } from './fantasyTables';
import {
  advanceV17GrandStrategyStep,
  ClaimAndWarEngine,
  cleanupDeceasedAndEnsureSuccessors,
  ensureV17WorldInitialized,
  killCharacter,
  RealmDiplomacyEngine,
  recalculateAllGravitas,
  recalculateCharacterRelationships,
} from './v17GrandStrategyEngine';
import { cloneWorldState } from '../utils/cloneWorldState';
import {
  runAnnualCouncilAndAttributeEffects,
  runAnnualChildhoodGrowth,
} from './childhoodAndCouncilEngine';
import { pickContextualDeathCause } from './deathAndJusticeEngine';
import { recordRealmBudgetExtra } from './economyEngine';
import { syncCharacterTraits } from './v17TraitDB';

function runAnnualWorldEvents(
  newState: WorldState,
  y: number,
  prng: PRNG,
  newEvents: HistoricalEvent[]
): void {
  const realms = (newState.realms || []).filter((r) => r.id);
  if (realms.length === 0) return;
  const living = (newState.characters || []).filter((c) => c.isAlive !== false);
  if (living.length === 0) return;

  // ~58% chance of a notable realm/world event each year so chronicles stay lively without flooding +25y skips
  if (prng.next() > 0.58) return;

  const roll = prng.next();
  const hostRealm = prng.pick(realms);
  const hostRuler =
    living.find((c) => c.id === hostRealm.rulerId) ||
    living.find((c) => c.realmId === hostRealm.id) ||
    living[0];
  const hostBurg =
    newState.burgs.find((b) => b.id === hostRealm.capitalBurgId) ||
    newState.burgs.find((b) => b.stateId === hostRealm.id) ||
    newState.burgs[0];

  if (roll < 0.20) {
    // 1. Grand Royal Tournament
    const entrants = living
      .filter((c) => c.age >= 16 && c.age <= 55)
      .sort((a, b) => (b.baseProwess || 8) - (a.baseProwess || 8))
      .slice(0, 8);
    if (entrants.length >= 2) {
      const winner = entrants[Math.floor(prng.next() * Math.min(4, entrants.length))];
      const runnerUp = entrants.find((e) => e.id !== winner.id) || entrants[1];
      winner.prestige += 140;
      if (!winner.lifestyleTraits.includes('Hastiluder')) {
        winner.lifestyleTraits.push('Hastiluder');
        syncCharacterTraits(winner);
      }
      const hostFee = Math.min(24, Math.round((hostRealm.treasury || 0) * 0.04));
      if (hostFee >= 3) {
        hostRealm.treasury = Math.round(((hostRealm.treasury || 0) - hostFee) * 10) / 10;
        recordRealmBudgetExtra(hostRealm, newState, 'diplomacyAndPatronage', hostFee);
      }
      newEvents.push({
        id: `hist_tourney_${hostRealm.id}_${y}`,
        year: y,
        title: `Grand Tournament of ${hostBurg?.name || hostRealm.name}`,
        category: 'War & Conquest',
        description: `${hostRuler.name} hosted an illustrious tourney at ${hostBurg?.name || hostRealm.name}. ${winner.name} unseated ${runnerUp.name} in the final tilt to claim the laurel wreath (+140 Prestige).`,
        primaryActorId: winner.id,
        secondaryActorId: runnerUp.id,
        realmId: hostRealm.id,
      });
    }
  } else if (roll < 0.38) {
    // 2. Continental Trade Fair & Guild Charter
    if (hostBurg) {
      const tollBonus = Math.min(40, Math.max(10, Math.round((hostBurg.population || 600) * 0.012)));
      hostRealm.treasury = Math.round(((hostRealm.treasury || 0) + tollBonus) * 10) / 10;
      recordRealmBudgetExtra(hostRealm, newState, 'scutageAndAidsIncome', tollBonus);
      hostBurg.unrest = Math.max(0, (hostBurg.unrest || 0) - 3);
      hostRuler.prestige += 45;
      newEvents.push({
        id: `hist_tradefair_${hostBurg.id}_${y}`,
        year: y,
        title: `Great Charter Fair of ${hostBurg.name}`,
        category: 'Diplomacy',
        description: `Caravans and river barges thronged ${hostBurg.name}'s autumn fair, yielding ${tollBonus}g in crown customs and easing civic unrest.`,
        primaryActorId: hostRuler.id,
        realmId: hostRealm.id,
      });
    }
  } else if (roll < 0.54 && realms.length >= 2) {
    // 3. Bilateral Diplomatic Concordat
    const otherRealms = realms.filter(
      (r) =>
        r.id !== hostRealm.id &&
        !RealmDiplomacyEngine.areRealmsEnemies(hostRealm.id, r.id, newState)
    );
    if (otherRealms.length > 0) {
      const partner = prng.pick(otherRealms);
      const partnerRuler = living.find((c) => c.id === partner.rulerId);
      RealmDiplomacyEngine.adjustRealmRelation(hostRealm.id, partner.id, 14, newState);
      hostRuler.prestige += 40;
      if (partnerRuler) partnerRuler.prestige += 40;
      newEvents.push({
        id: `hist_concordat_${hostRealm.id}_${partner.id}_${y}`,
        year: y,
        title: `Envoy Summit: ${hostRealm.name} & ${partner.name}`,
        category: 'Diplomacy',
        description: `Chancellors from ${hostRealm.name} and ${partner.name} met under white truce banners to reaffirm river navigation and frontier peace (+14 Relations).`,
        primaryActorId: hostRuler.id,
        secondaryActorId: partnerRuler?.id,
        realmId: hostRealm.id,
      });
    }
  } else if (roll < 0.70) {
    // 4. Ecclesiastical Synod or Relic Pilgrimage
    hostRuler.piety += 85;
    if (hostBurg) hostBurg.unrest = Math.max(0, (hostBurg.unrest || 0) - 2);
    newEvents.push({
      id: `hist_synod_${hostRealm.id}_${y}`,
      year: y,
      title: `High Synod of ${hostBurg?.name || hostRealm.name}`,
      category: 'Religious Schism',
      description: `Prelates and abbots gathered beneath ${hostRealm.name}'s patronage to codify parish alms and pilgrimage safe-conducts (+85 Piety).`,
      primaryActorId: hostRuler.id,
      realmId: hostRealm.id,
    });
  } else if (roll < 0.86) {
    // 5. Bumper Harvest or Royal Autumn Hunt
    const realmChars = living.filter((c) => c.realmId === hostRealm.id);
    for (const c of realmChars.slice(0, 6)) {
      c.stress = Math.max(0, c.stress - 18);
    }
    if (hostBurg) {
      hostBurg.monthsOfFoodReserves = Math.min(24, (hostBurg.monthsOfFoodReserves || 4) + 3);
      hostBurg.unrest = Math.max(0, (hostBurg.unrest || 0) - 4);
    }
    newEvents.push({
      id: `hist_harvest_${hostRealm.id}_${y}`,
      year: y,
      title: `Abundant Harvest & Crown Hunt in ${hostRealm.name}`,
      category: 'Dynastic Drama',
      description: `Golden weather filled the granaries of ${hostBurg?.name || hostRealm.name}, easing courtly tensions and fortifying winter food stores.`,
      primaryActorId: hostRuler.id,
      realmId: hostRealm.id,
    });
  } else {
    // 6. Celestial Omen, Gale, or Frost Calamity
    const omenTypes = [
      {
        title: `Blood Comet Over ${hostRealm.name}`,
        desc: `A crimson-tailed comet blazed above ${hostBurg?.name || hostRealm.name} for seven nights, sparking anxious prayers and apocalyptic sermons.`,
        devastation: 0,
      },
      {
        title: `Great Gale & Floods at ${hostBurg?.name || hostRealm.name}`,
        desc: `Fierce tempests battered bridges and storehouses around ${hostBurg?.name || hostRealm.name}, prompting emergency repair levies.`,
        devastation: 6,
      },
      {
        title: `Hard Black Frost Across ${hostRealm.name}`,
        desc: `Unseasonal killing frost gripped ${hostRealm.name}'s river valleys, straining winter stores and testing local bailiffs.`,
        devastation: 4,
      },
    ];
    const picked = prng.pick(omenTypes);
    if (hostBurg && picked.devastation > 0) {
      hostBurg.devastation = Math.min(100, (hostBurg.devastation || 0) + picked.devastation);
      hostBurg.unrest = Math.min(100, (hostBurg.unrest || 0) + 4);
    }
    hostRuler.piety += 35;
    newEvents.push({
      id: `hist_omen_${hostRealm.id}_${y}`,
      year: y,
      title: picked.title,
      category: 'Great Cataclysm',
      description: picked.desc,
      primaryActorId: hostRuler.id,
      realmId: hostRealm.id,
    });
  }
}

function runAnnualLifeAndPolitics(
  newState: WorldState,
  y: number,
  prng: PRNG,
  newEvents: HistoricalEvent[]
): void {
  // 1. Age characters and check mortality
  const livingSnapshot = newState.characters.filter((c) => c.isAlive);
  for (const char of livingSnapshot) {
    if (!char.isAlive) continue;
    const prevAge = char.age;
    if (char.birthYear !== undefined) {
      char.age = Math.max(0, y - char.birthYear);
    } else {
      char.birthYear = y - char.age - 1;
      char.age += 1;
    }

    // Feudal Aid: Knighting of the Monarch's Eldest Son / Crown Heir at age 16
    if (prevAge < 16 && char.age >= 16 && char.gender !== 'female') {
      const parentRealm = newState.realms?.find(
        (r) =>
          r.id === char.realmId &&
          (r.rulerId === char.knownFatherId || r.rulerId === char.motherId)
      );
      const monarch = parentRealm
        ? newState.characters.find((m) => m.id === parentRealm.rulerId && m.isAlive)
        : undefined;
      if (parentRealm && monarch && (char.role === 'Crown Heir' || char.role === 'Heir' || monarch.heirId === char.id)) {
        let knightingAid = 0;
        for (const v of newState.characters) {
          if (v.isAlive && v.realmId === parentRealm.id && v.id !== monarch.id && (v.treasury || 0) >= 35) {
            const share = Math.min(10, Math.round((v.treasury || 0) * 0.025));
            if (share >= 2) {
              v.treasury = Math.round(((v.treasury || 0) - share) * 10) / 10;
              knightingAid += share;
            }
          }
        }
        if (knightingAid > 0) {
          parentRealm.treasury = Math.round(((parentRealm.treasury || 0) + knightingAid) * 10) / 10;
          recordRealmBudgetExtra(parentRealm, newState, 'scutageAndAidsIncome', knightingAid);
        }
        const ceremonyCost = Math.min(Math.round(knightingAid * 0.45), Math.round((parentRealm.treasury || 0) * 0.1));
        if (ceremonyCost >= 4) {
          parentRealm.treasury = Math.round(((parentRealm.treasury || 0) - ceremonyCost) * 10) / 10;
          recordRealmBudgetExtra(parentRealm, newState, 'diplomacyAndPatronage', ceremonyCost);
        }
        newEvents.push({
          id: `knighting_${char.id}_${y}`,
          year: y,
          title: `Knighting & Feudal Aid: ${char.name}`,
          category: 'Dynastic Drama',
          description: `Upon ${char.name} coming of age at 16, vassals of ${parentRealm.name} rendered ${knightingAid}g in customary Feudal Aid for his knighting ceremony (${ceremonyCost}g feast & armor).`,
          primaryActorId: char.id,
          realmId: parentRealm.id,
        });
      }
    }

    let mortalityMod = 1.0;
    if (char.congenitalTraits?.includes('Herculean') || char.congenitalTraits?.includes('Robust')) {
      mortalityMod *= 0.6;
    }
    if (char.physicalHealthTraits?.includes('Infirm')) {
      mortalityMod *= 2.5;
    }
    if (
      char.physicalHealthTraits?.includes('Bubonic Plague') ||
      char.physicalHealthTraits?.includes('Leprous')
    ) {
      mortalityMod *= 3.5;
    }
    if (char.physicalHealthTraits?.includes('Severely Injured')) {
      mortalityMod *= 1.8;
    }

    const baseMortality =
      (char.age < 45
        ? 0.008
        : char.age < 60
        ? 0.035
        : char.age < 70
        ? 0.09
        : char.age < 80
        ? 0.22
        : char.age < 90
        ? 0.45
        : 0.80) * mortalityMod;

    if (prng.next() < baseMortality) {
      const picked = pickContextualDeathCause(char, 'natural', () => prng.next());
      killCharacter(char, picked.cause, newState, picked.category);
    }
  }

  // 1B. Natural Child Growth, Evolution, Mentorship & Age-21 Permanent Trait Locking
  runAnnualChildhoodGrowth(newState, y, prng, newEvents);

  // 1C. Royal Council Active Functions & Sovereign 6-Attribute Gameplay Yields
  runAnnualCouncilAndAttributeEffects(newState, y, prng, newEvents);

  // 2. Trait-Driven Stress & Mental Break
  for (const char of newState.characters) {
    if (!char.isAlive) continue;

    if (char.rivalId && prng.next() < 0.3) char.stress += prng.range(10, 25);
    if (char.personalityTraits.includes('Paranoid')) char.stress += prng.range(5, 15);
    if (char.personalityTraits.includes('Calm')) {
      char.stress = Math.max(0, char.stress - prng.range(10, 25));
    }

    if (char.stress > 85 && !char.stressCopingMechanism && prng.next() < 0.35) {
      const copingList = [
        'Drunkard',
        'Flagellant',
        'Hashishiyah',
        'Profligate',
        'Comfort Eater',
        'Journaller',
        'Confider',
        'Athletic',
        'Rakish',
        'Reclusive',
        'Irritable',
        'Contrite',
      ];
      const chosen = prng.pick(copingList);
      char.stressCopingMechanism = chosen;
      if (!char.lifestyleTraits.includes(chosen)) char.lifestyleTraits.push(chosen);
      char.stress = Math.max(0, char.stress - 60);

      newEvents.push({
        id: `hist_stress_${char.id}_${y}`,
        year: y,
        title: `${char.name} Suffers Court Mental Strain`,
        category: 'Dynastic Drama',
        description: `Overwhelmed by court intrigue, ${char.name} developed a coping mechanism (${chosen}) to endure the weight of rule.`,
        primaryActorId: char.id,
        realmId: char.realmId,
      });
    }
  }

  // 3. Trait-Driven Judicial Duels
  for (const char of newState.characters) {
    if (!char.isAlive || !char.rivalId) continue;
    const rival = newState.characters.find((c) => c.id === char.rivalId && c.isAlive);
    if (!rival) continue;

    if (
      (char.personalityTraits.includes('Brave') || char.personalityTraits.includes('Wrathful')) &&
      prng.next() < 0.12
    ) {
      const statsA = computeCharacterStats(char);
      const statsB = computeCharacterStats(rival);
      const winA = statsA.prowess + prng.range(1, 10) >= statsB.prowess + prng.range(1, 10);
      const victor = winA ? char : rival;
      const loser = winA ? rival : char;

      victor.prestige += 150;
      victor.dread = Math.min(100, victor.dread + 15);
      loser.stress += 40;
      if (!loser.physicalHealthTraits.includes('Scarred') && prng.next() < 0.6) {
        loser.physicalHealthTraits.push('Scarred');
      }

      newEvents.push({
        id: `hist_duel_${victor.id}_${y}`,
        year: y,
        title: `Judicial Duel: ${victor.name} Defeats ${loser.name}`,
        category: 'War & Conquest',
        description: `A bitter feud culminated in a formal trial by combat. ${victor.name} disarmed ${loser.name} in the list, winning great renown.`,
        primaryActorId: victor.id,
        secondaryActorId: loser.id,
        realmId: victor.realmId,
      });
    }
  }

  // 4. Active Schemes now advance and resolve every month inside advanceV17GrandStrategyStep (stepActivePlotsAndSchemes)

  // 5. Dynamic Inter-Realm Rivalry & Border Wars (skip allies & truced states, genuine hostility only)
  const maxConcurrentWars = Math.max(2, Math.floor((newState.realms?.length || 2) / 2));
  if (newState.realms.length >= 2 && (newState.activeWars?.length || 0) < maxConcurrentWars) {
    const rivalPairs: Array<{ atkRealmId: string; defRealmId: string }> = [];
    for (const r1 of newState.realms) {
      const ruler1 = newState.characters.find((c) => c.id === r1.rulerId && c.isAlive);
      if (!ruler1) continue;
      for (const r2 of newState.realms) {
        if (r2.id === r1.id) continue;
        const ruler2 = newState.characters.find((c) => c.id === r2.rulerId && c.isAlive);
        if (!ruler2 || ruler1.spouseId === ruler2.id || ruler1.friendId === ruler2.id) continue;
        if (RealmDiplomacyEngine.areRealmsAllied(r1.id, r2.id, newState)) continue;
        if (RealmDiplomacyEngine.isUnderTruce(r1.id, r2.id, newState)) continue;
        const alreadyAtWar = (newState.activeWars || []).some(
          (w) =>
            (w.attackerRealmId === r1.id && w.defenderRealmId === r2.id) ||
            (w.attackerRealmId === r2.id && w.defenderRealmId === r1.id)
        );
        if (alreadyAtWar) continue;
        const op = ruler1.opinions?.[ruler2.id] ?? 0;
        const diplomaticRel = RealmDiplomacyEngine.getRealmRelation(r1.id, r2.id, newState);
        const areEnemies = RealmDiplomacyEngine.areRealmsEnemies(r1.id, r2.id, newState);
        if (ruler1.rivalId === ruler2.id || areEnemies || op <= -30 || diplomaticRel <= -30) {
          rivalPairs.push({ atkRealmId: r1.id, defRealmId: r2.id });
        }
      }
    }
    if (rivalPairs.length > 0 && prng.next() < 0.25) {
      const chosen = prng.pick(rivalPairs);
      ClaimAndWarEngine.declareBorderWar(chosen.atkRealmId, chosen.defRealmId, newState);
    }
  }

  // 6. Rich World & Realm Historical Events (Tournaments, Trade Fairs, Summits, Synods, Omens)
  runAnnualWorldEvents(newState, y, prng, newEvents);

  cleanupDeceasedAndEnsureSuccessors(newState);
  recalculateCharacterRelationships(newState);
  recalculateAllGravitas(newState);
}

export function advanceTimelineMonths(currentState: WorldState, monthsToAdvance: number): WorldState {
  const newState: WorldState = ensureV17WorldInitialized(cloneWorldState(currentState));
  const prng = new PRNG(`${newState.settings.seed}_m_${newState.currentYear}_${newState.month || 1}`);
  const newEvents: HistoricalEvent[] = [];

  const safeMonths = Math.max(1, Math.min(24, Math.round(monthsToAdvance || 1)));
  for (let i = 0; i < safeMonths; i++) {
    try {
      const prevMonth = ((newState.month || 1) - 1) % 12;
      advanceV17GrandStrategyStep(newState, { skipCaravanProgress: false });
      const nextMonth = ((newState.month || 1) - 1) % 12;

      // Year rollover every 12 months
      if (nextMonth < prevMonth || (newState.month || 1) % 12 === 1) {
        newState.currentYear += 1;
        runAnnualLifeAndPolitics(newState, newState.currentYear, prng, newEvents);
      }
    } catch (err) {
      console.error('Non-fatal monthly simulation step error:', err);
      break;
    }
  }

  try {
    cleanupDeceasedAndEnsureSuccessors(newState);
    recalculateCharacterRelationships(newState);
    recalculateAllGravitas(newState);
  } catch (err) {
    console.error('Non-fatal post-month cleanup error:', err);
  }
  if (newEvents.length > 0) {
    newState.history = [...newEvents, ...(newState.history || [])].slice(0, 650);
  }
  newState.loreEntities = refreshLoreEntities(newState);
  return newState;
}

export function advanceTimeline(currentState: WorldState, yearsToAdvance: number): WorldState {
  const newState: WorldState = ensureV17WorldInitialized(cloneWorldState(currentState));
  const safeYears = Math.max(1, Math.min(50, Math.round(yearsToAdvance || 1)));
  const prng = new PRNG(`${newState.settings.seed}_year_${newState.currentYear + safeYears}`);

  const targetYear = newState.currentYear + safeYears;
  const newEvents: HistoricalEvent[] = [];

  const stepsPerYear = safeYears >= 25 ? 1 : safeYears >= 5 ? 2 : 12;
  const monthsPerStep = Math.max(1, Math.round(12 / stepsPerYear));

  for (let y = newState.currentYear + 1; y <= targetYear; y++) {
    newState.currentYear = y;

    for (let m = 0; m < stepsPerYear; m++) {
      try {
        advanceV17GrandStrategyStep(newState, {
          skipCaravanProgress: safeYears === 1,
          monthsDelta: monthsPerStep,
        });
      } catch (err) {
        console.error(`Non-fatal simulation error in year ${y}:`, err);
        break;
      }
    }

    try {
      runAnnualLifeAndPolitics(newState, y, prng, newEvents);
    } catch (err) {
      console.error(`Non-fatal annual politics error in year ${y}:`, err);
    }
  }

  try {
    cleanupDeceasedAndEnsureSuccessors(newState);
    recalculateCharacterRelationships(newState);
    recalculateAllGravitas(newState);
  } catch (err) {
    console.error('Non-fatal post-year cleanup error:', err);
  }

  newState.history = [...newEvents, ...(newState.history || [])].slice(0, 650);
  newState.currentYear = targetYear;
  newState.loreEntities = refreshLoreEntities(newState);

  return newState;
}

function refreshLoreEntities(state: WorldState) {
  const entities = [...state.loreEntities];
  const charById = new Map(state.characters.map((c) => [c.id, c]));

  for (const existing of entities) {
    if (!existing.characterId) continue;
    const char = charById.get(existing.characterId);
    if (char) {
      existing.summary = `${char.isAlive ? 'Reigning' : 'Late'} noble of House ${char.houseName} (Age ${char.age}) · ${char.houseMotto}.`;
    } else if (!existing.summary.startsWith('Late')) {
      existing.summary = `Late ${existing.summary.replace(/^(Reigning|Living)\s+/i, '')}`;
    }
  }

  for (const ev of state.history) {
    if (ev.category === 'Death' && ev.primaryActorId) {
      const existing = entities.find(
        (e) => e.characterId === ev.primaryActorId || e.id === `lore_${ev.primaryActorId}`
      );
      if (existing && !existing.summary.startsWith('Late')) {
        existing.summary = `Late ${existing.summary.replace(/^(Reigning|Living)\s+/i, '')} (d. ${ev.year})`;
      }
    }
  }

  for (const h of state.history.slice(0, 15)) {
    if (!entities.some((e) => e.name.includes(`Year ${h.year}: ${h.title}`))) {
      entities.push({
        id: `lore_dyn_${h.id}`,
        category: 'Chronicles & Historical Eras',
        name: `Year ${h.year}: ${h.title}`,
        summary: `[${h.category}] ${h.title} — Recorded in the royal annals of Year ${h.year}.`,
        body_markdown: `### Chronicle of Year ${h.year}\n- **Category**: ${h.category}\n\n### Recorded Account\n${h.description}`,
        tags: ['Chronicle', h.category],
      });
    }
  }

  return entities;
}