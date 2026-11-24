import { Character, HistoricalEvent, Realm, WorldState } from '../types/world';
import { cloneWorldState } from '../utils/cloneWorldState';
import { computeCharacterStats } from './fantasyTables';
import { DiceRollResult } from './diceEngine';
import { syncCharacterTraits } from './v17TraitDB';
import { RealmDiplomacyEngine } from './v17GrandStrategyEngine';
import { recordRealmBudgetExtra } from './economyEngine';

export type ChronicleEventCategory =
  | 'Intrigue'
  | 'Warfare'
  | 'Romance'
  | 'Faith'
  | 'Mental Break'
  | 'Dynasty'
  | 'Stewardship'
  | 'Diplomacy';

export interface EventDiceCheck {
  statName: string;
  modifier: number;
  dc: number;
}

export interface EventOption {
  label: string;
  flavor: string;
  traitRequirements?: string[];
  diceCheck: EventDiceCheck;
  consequencesSummary: string[];
  execute: (
    char: Character,
    world: WorldState,
    roll: DiceRollResult
  ) => { outcomeText: string; updatedWorld: WorldState };
}

export interface ChronicleEvent {
  id: string;
  title: string;
  category: ChronicleEventCategory;
  illustration: string;
  body: string;
  options: EventOption[];
}

export function collectAllTraitNamesLower(char: Character): Set<string> {
  const buckets = [
    ...(char.personalityTraits || []),
    ...(char.congenitalTraits || []),
    ...(char.lifestyleTraits || []),
    ...(char.commanderTraits || []),
    ...(char.physicalHealthTraits || []),
    ...(char.v17Traits || []),
    char.educationTrait || '',
    char.statusTrait || '',
  ];
  const out = new Set<string>();
  for (const t of buckets) {
    const clean = (t || '').trim().toLowerCase();
    if (clean) out.add(clean);
  }
  return out;
}

export function countMatchingTraits(
  char: Character,
  reqs?: string[]
): { matched: string[]; bonus: number } {
  if (!reqs || reqs.length === 0) return { matched: [], bonus: 0 };
  const owned = collectAllTraitNamesLower(char);
  const matched = reqs.filter((r) => owned.has(r.trim().toLowerCase()));
  const bonus = matched.length >= 2 ? 3 : matched.length === 1 ? 2 : 0;
  return { matched, bonus };
}

function addTraitUnique(arr: string[] | undefined, trait: string): string[] {
  const list = Array.isArray(arr) ? [...arr] : [];
  if (!list.includes(trait)) list.push(trait);
  return list;
}

function removeTrait(arr: string[] | undefined, trait: string): string[] {
  return Array.isArray(arr) ? arr.filter((t) => t !== trait) : [];
}

function pushHistoryEntry(world: WorldState, entry: HistoricalEvent): void {
  if (!world.history) world.history = [];
  world.history.unshift(entry);
  if (world.history.length > 650) {
    world.history = world.history.slice(0, 650);
  }
}

function spendOrEarnRealmOrPersonalGold(
  char: Character,
  realm: Realm | undefined,
  world: WorldState,
  delta: number,
  budgetKey?: 'diplomacyAndPatronage' | 'religiousPatronage' | 'administrationAndJustice' | 'scutageAndAidsIncome'
): void {
  if (realm && realm.rulerId === char.id) {
    realm.treasury = Math.max(0, Math.round(((realm.treasury || 0) + delta) * 10) / 10);
    if (budgetKey) {
      recordRealmBudgetExtra(realm, world, budgetKey, Math.abs(delta));
    }
  } else {
    char.treasury = Math.max(0, Math.round(((char.treasury || 0) + delta) * 10) / 10);
  }
}

function statMod(val: number): number {
  return Math.round((val - 10) * 0.5);
}

function findOtherRealm(world: WorldState, currentRealmId: string): Realm | undefined {
  return world.realms.find((r) => r.id !== currentRealmId);
}

function findCourtierFallback(
  world: WorldState,
  char: Character,
  realmId: string,
  preferred?: Character
): Character {
  if (preferred && preferred.id !== char.id && preferred.isAlive !== false) return preferred;
  const sameRealm = world.characters.find(
    (c) => c.isAlive !== false && c.realmId === realmId && c.id !== char.id
  );
  if (sameRealm) return sameRealm;
  const anyLiving = world.characters.find((c) => c.isAlive !== false && c.id !== char.id);
  return anyLiving || char;
}

export function generateChronicleEvent(
  character: Character,
  world: WorldState,
  options?: { seedOffset?: number; excludeIds?: string[] }
): ChronicleEvent {
  const stats = computeCharacterStats(character);
  const realm = world.realms.find((r) => r.id === character.realmId) || world.realms[0];
  const realmId = realm?.id || character.realmId;
  const realmName = realm?.name || 'the Realm';
  const capitalBurg =
    world.burgs.find((b) => b.id === realm?.capitalBurgId) ||
    world.burgs.find((b) => b.stateId === realmId) ||
    world.burgs[0];

  const rival = world.characters.find((c) => c.id === character.rivalId && c.isAlive !== false);
  const spouse = world.characters.find((c) => c.id === character.spouseId && c.isAlive !== false);
  const lover = world.characters.find((c) => c.id === character.loverId && c.isAlive !== false);
  const friend = world.characters.find((c) => c.id === character.friendId && c.isAlive !== false);
  const heir =
    world.characters.find((c) => c.id === character.heirId && c.isAlive !== false) ||
    world.characters.find(
      (c) =>
        c.isAlive !== false &&
        c.id !== character.id &&
        (c.knownFatherId === character.id || c.motherId === character.id)
    );
  const spymaster = world.characters.find(
    (c) => c.realmId === realmId && c.role === 'Spymaster' && c.isAlive !== false && c.id !== character.id
  );
  const champion = world.characters.find(
    (c) => c.realmId === realmId && c.role === 'Court Champion' && c.isAlive !== false && c.id !== character.id
  );
  const courtier = findCourtierFallback(world, character, realmId, rival || spymaster);
  const duelRival =
    rival ||
    world.characters.find((c) => c.realmId !== realmId && c.isAlive !== false) ||
    courtier;
  const foreignRealm = findOtherRealm(world, realmId);
  const foreignRuler = foreignRealm
    ? world.characters.find((c) => c.id === foreignRealm.rulerId && c.isAlive !== false)
    : undefined;

  const isExpectant =
    character.physicalHealthTraits?.includes('Pregnant') ||
    typeof character.monthsPregnant === 'number' ||
    Boolean(spouse?.physicalHealthTraits?.includes('Pregnant')) ||
    typeof spouse?.monthsPregnant === 'number';

  const ownedTraits = collectAllTraitNamesLower(character);
  const uid = `${world.currentYear}_${Date.now().toString(36)}`;

  const candidates: Array<{ weight: number; build: () => ChronicleEvent }> = [
    // 1. Mental Break (critical priority when stress > 85)
    {
      weight: character.stress > 85 ? 25 : 2,
      build: () => ({
        id: 'mental_break_event',
        title: 'Mental Break: The Burden of Feudal Rule',
        category: 'Mental Break',
        illustration: '⚡',
        body: `The relentless demands of governance, whispered conspiracies behind velvet hangings, and the dread of betrayal have frayed ${character.name}'s composure. Tension throbs behind the temples like a siege battering ram against oak gates. A coping outlet must be chosen before judgment collapses.`,
        options: [
          {
            label: 'Drown the turmoil in spiced vintage and sweet cellar barrels',
            flavor: '"Just one more goblet before the dawn councils begin..."',
            traitRequirements: ['Gregarious', 'Gluttonous'],
            diceCheck: { statName: 'Stewardship', modifier: statMod(stats.stewardship), dc: 11 },
            consequencesSummary: [
              'Success: -90 Stress, gain Drunkard',
              'Critical: -110 Stress without scandal',
              'Failure: -55 Stress & -80 Prestige',
            ],
            execute: (char, w, roll) => {
              const updated = cloneWorldState(w);
              const targetChar = updated.characters.find((c) => c.id === char.id)!;
              const stressDrop =
                roll.tier === 'critical_success' ? 110 : roll.tier === 'success' ? 90 : roll.tier === 'partial' ? 75 : 55;
              targetChar.stress = Math.max(0, targetChar.stress - stressDrop);
              if (roll.tier !== 'critical_success') {
                targetChar.lifestyleTraits = addTraitUnique(targetChar.lifestyleTraits, 'Drunkard');
                targetChar.stressCopingMechanism = 'Drunkard';
                syncCharacterTraits(targetChar);
              }
              if (roll.tier === 'failure' || roll.tier === 'critical_failure') {
                targetChar.prestige = Math.max(0, targetChar.prestige - 80);
              }
              pushHistoryEntry(updated, {
                id: `hist_coping_${uid}`,
                year: updated.currentYear,
                title: `${char.name} Embraced the Cask`,
                category: 'Dynastic Drama',
                description: `${char.name} sought solace in the wine vaults (${roll.summary}).`,
                primaryActorId: char.id,
                realmId: char.realmId,
              });
              const outcomeText =
                roll.tier === 'critical_success'
                  ? `Quiet respite in the vaults! ${char.name} relieved ${stressDrop} Stress without losing court composure.`
                  : roll.tier === 'failure' || roll.tier === 'critical_failure'
                  ? `A drunken scene echoed through the hall! Relieved ${stressDrop} Stress, gained Drunkard, and lost 80 Prestige.`
                  : `${char.name} sought solace in wine. Relieved ${stressDrop} Stress and gained the Drunkard trait.`;
              return { outcomeText, updatedWorld: updated };
            },
          },
          {
            label: 'Bar the oak chamber doors and refuse all audiences',
            flavor: '"Leave me in peace! Grant me silence and candlelight."',
            traitRequirements: ['Shy', 'Calm', 'Scholar'],
            diceCheck: { statName: 'Learning', modifier: statMod(stats.learning), dc: 12 },
            consequencesSummary: [
              'Success: -75 Stress, gain Reclusive',
              'Critical: -95 Stress & +60 Piety',
              'Failure: -45 Stress & rumors spread',
            ],
            execute: (char, w, roll) => {
              const updated = cloneWorldState(w);
              const targetChar = updated.characters.find((c) => c.id === char.id)!;
              const stressDrop =
                roll.tier === 'critical_success' ? 95 : roll.tier === 'success' ? 75 : roll.tier === 'partial' ? 60 : 45;
              targetChar.stress = Math.max(0, targetChar.stress - stressDrop);
              targetChar.lifestyleTraits = addTraitUnique(targetChar.lifestyleTraits, 'Reclusive');
              targetChar.stressCopingMechanism = 'Reclusive';
              if (roll.tier === 'critical_success') targetChar.piety += 60;
              syncCharacterTraits(targetChar);
              pushHistoryEntry(updated, {
                id: `hist_recluse_${uid}`,
                year: updated.currentYear,
                title: `${char.name} Withdrew Into Solitude`,
                category: 'Dynastic Drama',
                description: `${char.name} sealed the inner chambers to weather courtly strain (${roll.summary}).`,
                primaryActorId: char.id,
                realmId: char.realmId,
              });
              return {
                outcomeText:
                  roll.tier === 'critical_success'
                    ? `${char.name} turned solitude into serene contemplation. Relieved ${stressDrop} Stress and gained +60 Piety.`
                    : `${char.name} retreated behind barred doors. Relieved ${stressDrop} Stress and gained Reclusive.`,
                updatedWorld: updated,
              };
            },
          },
          {
            label: 'Channel manic anxiety into dawn blade drills',
            flavor: '"Iron does not lie. Sweat and steel will purge this weakness."',
            traitRequirements: ['Brave', 'Diligent', 'Skilled Tactician'],
            diceCheck: { statName: 'Martial', modifier: statMod(stats.martial), dc: 13 },
            consequencesSummary: [
              'Success: Gain Athletic, -80 Stress, +3 Prowess',
              'Critical: -100 Stress, +4 Prowess & +80 Prestige',
              'Failure: -35 Stress & bruised sword-arm',
            ],
            execute: (char, w, roll) => {
              const updated = cloneWorldState(w);
              const targetChar = updated.characters.find((c) => c.id === char.id)!;
              if (roll.tier === 'failure' || roll.tier === 'critical_failure') {
                targetChar.stress = Math.max(0, targetChar.stress - 35);
                pushHistoryEntry(updated, {
                  id: `hist_drillfail_${uid}`,
                  year: updated.currentYear,
                  title: `Grueling Yard Drills for ${char.name}`,
                  category: 'Dynastic Drama',
                  description: `${char.name} pushed hard in the training yard to shake off courtly dread (${roll.summary}).`,
                  primaryActorId: char.id,
                  realmId: char.realmId,
                });
                return {
                  outcomeText: `Exhausting drills left ${char.name} bruised and winded. Relieved 35 Stress, though discipline faltered.`,
                  updatedWorld: updated,
                };
              }
              const stressDrop = roll.tier === 'critical_success' ? 100 : roll.tier === 'success' ? 80 : 60;
              const prowessGain = roll.tier === 'critical_success' ? 4 : 3;
              targetChar.stress = Math.max(0, targetChar.stress - stressDrop);
              targetChar.lifestyleTraits = addTraitUnique(targetChar.lifestyleTraits, 'Athletic');
              targetChar.stressCopingMechanism = 'Athletic';
              targetChar.baseProwess = (targetChar.baseProwess || 8) + prowessGain;
              if (roll.tier === 'critical_success') targetChar.prestige += 80;
              syncCharacterTraits(targetChar);
              pushHistoryEntry(updated, {
                id: `hist_athletic_${uid}`,
                year: updated.currentYear,
                title: `${char.name} Forged Iron Discipline`,
                category: 'Dynastic Drama',
                description: `${char.name} mastered inner turmoil through relentless martial training (${roll.summary}).`,
                primaryActorId: char.id,
                realmId: char.realmId,
              });
              return {
                outcomeText: `${char.name} mastered inner panic through martial discipline! Relieved ${stressDrop} Stress, gained Athletic and +${prowessGain} Prowess.`,
                updatedWorld: updated,
              };
            },
          },
        ],
      }),
    },

    // 2. Expectant Cradle & Midwife's Omen (Dynasty, boosted if pregnant)
    {
      weight: isExpectant ? 14 : 0,
      build: () => {
        const expectantName =
          character.physicalHealthTraits?.includes('Pregnant') || typeof character.monthsPregnant === 'number'
            ? character.name
            : spouse?.name || 'the expectant lady';
        return {
          id: 'expectant_cradle_omen',
          title: 'Vigil of the Expected Cradle',
          category: 'Dynasty',
          illustration: '🕯️',
          body: `As the ninth-month reckoning approaches for ${expectantName}, midwives gather dried yarrow and silver basins in the solar. An elderly abbess claims the alignment of winter stars portends great destiny—or peril—for House ${character.houseName}'s coming child.`,
          options: [
            {
              label: 'Commission the finest court physicians and herbalists (-30g)',
              flavor: '"No coin shall be spared for mother and child."',
              traitRequirements: ['Compassionate', 'Generous', 'Scholar'],
              diceCheck: { statName: 'Learning', modifier: statMod(stats.learning), dc: 11 },
              consequencesSummary: [
                'Success: -35 Stress, +70 Prestige, vigor bolstered',
                'Critical: +120 Prestige & +1 Learning',
                'Failure: Remedies soothe nerves (-15 Stress)',
              ],
              execute: (char, w, roll) => {
                const updated = cloneWorldState(w);
                const cur = updated.characters.find((c) => c.id === char.id)!;
                const rlm = updated.realms.find((r) => r.id === cur.realmId);
                spendOrEarnRealmOrPersonalGold(cur, rlm, updated, -30, 'administrationAndJustice');
                const stressDrop = roll.tier === 'failure' || roll.tier === 'critical_failure' ? 15 : 35;
                cur.stress = Math.max(0, cur.stress - stressDrop);
                if (roll.tier === 'critical_success') {
                  cur.prestige += 120;
                  cur.baseLearning = (cur.baseLearning || 8) + 1;
                } else if (roll.tier === 'success' || roll.tier === 'partial') {
                  cur.prestige += 70;
                }
                pushHistoryEntry(updated, {
                  id: `hist_cradle_${uid}`,
                  year: updated.currentYear,
                  title: `Royal Physicians Summoned for House ${cur.houseName}`,
                  category: 'Dynastic Drama',
                  description: `${cur.name} retained master apothecaries during the vigil of ${expectantName} (${roll.summary}).`,
                  primaryActorId: cur.id,
                  realmId: cur.realmId,
                });
                return {
                  outcomeText: `Physicians attended the solar round the clock (-30g, -${stressDrop} Stress${
                    roll.tier === 'critical_success' ? ', +120 Prestige, +1 Learning' : ', +70 Prestige'
                  }).`,
                  updatedWorld: updated,
                };
              },
            },
            {
              label: 'Lead a candlelit vigil and endowment for safe deliverance',
              flavor: '"May the heavens smile upon this branch of our line."',
              traitRequirements: ['Zealous', 'Chaste', 'Theologian'],
              diceCheck: { statName: 'Diplomacy', modifier: statMod(stats.diplomacy), dc: 11 },
              consequencesSummary: [
                'Success: +120 Piety & -25 Stress',
                'Critical: +200 Piety & +90 Prestige',
                'Failure: Modest solace (+45 Piety)',
              ],
              execute: (char, w, roll) => {
                const updated = cloneWorldState(w);
                const cur = updated.characters.find((c) => c.id === char.id)!;
                const pietyGain =
                  roll.tier === 'critical_success' ? 200 : roll.tier === 'success' ? 120 : roll.tier === 'partial' ? 80 : 45;
                cur.piety += pietyGain;
                cur.stress = Math.max(0, cur.stress - 25);
                if (roll.tier === 'critical_success') cur.prestige += 90;
                pushHistoryEntry(updated, {
                  id: `hist_vigil_${uid}`,
                  year: updated.currentYear,
                  title: `Chapel Vigil of House ${cur.houseName}`,
                  category: 'Religious Schism',
                  description: `${cur.name} led prayers for the House's lineage (${roll.summary}).`,
                  primaryActorId: cur.id,
                  realmId: cur.realmId,
                });
                return {
                  outcomeText: `Hymns echoed through the abbey until dawn (+${pietyGain} Piety, -25 Stress).`,
                  updatedWorld: updated,
                };
              },
            },
          ],
        };
      },
    },

    // 3. Whispers in the Stone Gallery (Intrigue)
    {
      weight:
        character.knownSecrets.length > 0 || ownedTraits.has('deceitful') || ownedTraits.has('paranoid') || character.role === 'Spymaster'
          ? 12
          : 5,
      build: () => {
        const victim = courtier;
        return {
          id: 'whispers_in_the_gallery',
          title: 'Whispers in the Stone Gallery',
          category: 'Intrigue',
          illustration: '🗡️',
          body: `Late in the evening, a hooded courier delivers a cracked wax seal bearing the insignia of House ${victim.houseName}. Inside lies parchment detailing an illicit secret: ${victim.name} is entangled in "${victim.darkSecret || 'clandestine correspondence with border agents'}". In the courts of ${realmName}, knowledge cuts deeper than steel.`,
          options: [
            {
              label: `Blackmail ${victim.name} for a binding Court Hook`,
              flavor: '"They shall dance to my tune upon the council, or face ruin."',
              traitRequirements: ['Ambitious', 'Deceitful', 'Elusive Shadow'],
              diceCheck: { statName: 'Intrigue', modifier: statMod(stats.intrigue), dc: 14 },
              consequencesSummary: [
                `Success: Strong Hook on ${victim.name}, +15 Dread`,
                'Critical: Strong Hook + +25 Dread & +75 Prestige',
                'Failure: Plot leaks! -100 Prestige & +30 Stress',
              ],
              execute: (char, w, roll) => {
                const updated = cloneWorldState(w);
                const cur = updated.characters.find((c) => c.id === char.id)!;
                const vic = updated.characters.find((c) => c.id === victim.id) || cur;
                if (roll.tier === 'failure' || roll.tier === 'critical_failure') {
                  cur.prestige = Math.max(0, cur.prestige - 100);
                  cur.stress = Math.min(300, cur.stress + 30);
                  if (vic.id !== cur.id) vic.opinions[cur.id] = (vic.opinions[cur.id] || 0) - 55;
                  pushHistoryEntry(updated, {
                    id: `hist_blackmail_fail_${uid}`,
                    year: updated.currentYear,
                    title: `Foiled Intrigue at ${realmName}`,
                    category: 'Dynastic Drama',
                    description: `${cur.name}'s covert attempt to leverage ${vic.name} misfired in court (${roll.summary}).`,
                    primaryActorId: cur.id,
                    secondaryActorId: vic.id,
                    realmId: cur.realmId,
                  });
                  return {
                    outcomeText: `The blackmail courier was intercepted! ${vic.name} burned the proof and denounced ${cur.name} (-100 Prestige, +30 Stress).`,
                    updatedWorld: updated,
                  };
                }
                const hookType = roll.tier === 'partial' ? 'Weak' : 'Strong';
                const reason = `Possesses proof of: ${vic.darkSecret || 'court conspiracy'}`;
                if (vic.id !== cur.id) {
                  cur.hooksHeld.push({ targetId: vic.id, targetName: vic.name, type: hookType, reason });
                  vic.hooksOnMe.push({
                    targetId: vic.id,
                    targetName: vic.name,
                    holderId: cur.id,
                    holderName: cur.name,
                    type: hookType,
                    reason,
                  });
                  vic.opinions[cur.id] = (vic.opinions[cur.id] || 0) - 40;
                }
                cur.dread = Math.min(100, cur.dread + (roll.tier === 'critical_success' ? 25 : 15));
                if (roll.tier === 'critical_success') cur.prestige += 75;
                pushHistoryEntry(updated, {
                  id: `hist_blackmail_${uid}`,
                  year: updated.currentYear,
                  title: `Silent Leverage Over ${vic.name}`,
                  category: 'Dynastic Drama',
                  description: `${cur.name} secured quiet mastery over ${vic.name} behind closed doors (${roll.summary}).`,
                  primaryActorId: cur.id,
                  secondaryActorId: vic.id,
                  realmId: cur.realmId,
                });
                return {
                  outcomeText: `Extorted a ${hookType} Hook over ${vic.name}! (${roll.tierLabel}).`,
                  updatedWorld: updated,
                };
              },
            },
            {
              label: 'Expose the scandal to the High Priests and Crown Council',
              flavor: '"The light of truth must scorch this festering corruption!"',
              traitRequirements: ['Just', 'Honest', 'Zealous'],
              diceCheck: { statName: 'Diplomacy', modifier: statMod(stats.diplomacy), dc: 12 },
              consequencesSummary: [
                'Success: +150 Piety, +100 Prestige, rival disgraced',
                'Critical: +240 Piety, +180 Prestige',
                'Failure: Accusation dismissed (-60 Prestige)',
              ],
              execute: (char, w, roll) => {
                const updated = cloneWorldState(w);
                const cur = updated.characters.find((c) => c.id === char.id)!;
                const vic = updated.characters.find((c) => c.id === victim.id) || cur;
                if (vic.id !== cur.id) {
                  cur.rivalId = vic.id;
                  vic.rivalId = cur.id;
                  vic.opinions[cur.id] = -100;
                }
                if (roll.tier === 'failure' || roll.tier === 'critical_failure') {
                  cur.prestige = Math.max(0, cur.prestige - 60);
                  return {
                    outcomeText: `The council doubted the parchment's seal! ${vic.name} escaped censure and swore vengeance (-60 Prestige).`,
                    updatedWorld: updated,
                  };
                }
                const pietyGain = roll.tier === 'critical_success' ? 240 : roll.tier === 'partial' ? 90 : 150;
                const prestigeGain = roll.tier === 'critical_success' ? 180 : roll.tier === 'partial' ? 60 : 100;
                cur.piety += pietyGain;
                cur.prestige += prestigeGain;
                pushHistoryEntry(updated, {
                  id: `hist_scandal_${uid}`,
                  year: updated.currentYear,
                  title: `The Great Scandal of ${vic.name}`,
                  category: 'Dynastic Drama',
                  description: `${cur.name} publicly unmasked ${vic.name}'s secret before the court (${roll.summary}).`,
                  primaryActorId: cur.id,
                  secondaryActorId: vic.id,
                  realmId: cur.realmId,
                });
                return {
                  outcomeText: `Exposed ${vic.name} before the High Priests! Gained +${pietyGain} Piety and +${prestigeGain} Prestige.`,
                  updatedWorld: updated,
                };
              },
            },
            {
              label: 'Burn the parchment and let sleeping dragons lie',
              flavor: '"A sovereign’s honor does not feed on court scavenging."',
              traitRequirements: ['Honest', 'Compassionate', 'Forgiving'],
              diceCheck: { statName: 'Learning', modifier: statMod(stats.learning), dc: 10 },
              consequencesSummary: [
                'Success: -30 Stress, +30 Opinion, +50 Piety',
                'Critical: -45 Stress, +45 Opinion, +100 Piety',
                'Failure: -15 Stress (whispers linger)',
              ],
              execute: (char, w, roll) => {
                const updated = cloneWorldState(w);
                const cur = updated.characters.find((c) => c.id === char.id)!;
                const vic = updated.characters.find((c) => c.id === victim.id) || cur;
                const stressDrop =
                  roll.tier === 'critical_success' ? 45 : roll.tier === 'failure' || roll.tier === 'critical_failure' ? 15 : 30;
                const pietyGain =
                  roll.tier === 'critical_success' ? 100 : roll.tier === 'failure' || roll.tier === 'critical_failure' ? 20 : 50;
                cur.stress = Math.max(0, cur.stress - stressDrop);
                cur.piety += pietyGain;
                if (vic.id !== cur.id) {
                  vic.opinions[cur.id] = (vic.opinions[cur.id] || 0) + (roll.tier === 'critical_success' ? 45 : 30);
                }
                pushHistoryEntry(updated, {
                  id: `hist_forgave_${uid}`,
                  year: updated.currentYear,
                  title: `Mercy in ${realmName}`,
                  category: 'Dynastic Drama',
                  description: `${cur.name} burned compromising letters rather than ruin ${vic.name} (${roll.summary}).`,
                  primaryActorId: cur.id,
                  secondaryActorId: vic.id,
                  realmId: cur.realmId,
                });
                return {
                  outcomeText: `Consigned the parchment to ashes. Upheld feudal honor (-${stressDrop} Stress, +${pietyGain} Piety).`,
                  updatedWorld: updated,
                };
              },
            },
          ],
        };
      },
    },

    // 4. Challenge at the Grand Melee (Warfare)
    {
      weight: 6,
      build: () => ({
        id: 'tourney_trial_by_combat',
        title: 'Challenge at the Grand Melee',
        category: 'Warfare',
        illustration: '⚔️',
        body: `During the grand feast, heralds sound bronze trumpets across the tilting yard. ${duelRival.name} steps into the chalk circle, casting an iron gauntlet before ${character.name}! They accuse House ${character.houseName} of boundary encroachments and demand judicial trial by combat.`,
        options: [
          {
            label: 'Accept the duel in person and enter the list with bare steel!',
            flavor: '"My ancestors look down upon this ring. I answer with cold iron."',
            traitRequirements: ['Brave', 'Wrathful', 'Legendary Blademaster'],
            diceCheck: {
              statName: 'Prowess',
              modifier: statMod(stats.prowess),
              dc: Math.max(10, Math.min(18, 11 + statMod(duelRival.baseProwess || 12))),
            },
            consequencesSummary: [
              'Success: +300 Prestige, +25 Dread, gain Brave',
              'Critical: +450 Prestige, +35 Dread',
              'Failure: +40 Stress & risk Scarred wound',
            ],
            execute: (char, w, roll) => {
              const updated = cloneWorldState(w);
              const cur = updated.characters.find((c) => c.id === char.id)!;
              const opp = updated.characters.find((c) => c.id === duelRival.id) || cur;
              if (roll.tier === 'critical_success' || roll.tier === 'success') {
                const prestigeGain = roll.tier === 'critical_success' ? 450 : 300;
                const dreadGain = roll.tier === 'critical_success' ? 35 : 25;
                cur.prestige += prestigeGain;
                cur.dread = Math.min(100, cur.dread + dreadGain);
                cur.personalityTraits = addTraitUnique(cur.personalityTraits, 'Brave');
                syncCharacterTraits(cur);
                pushHistoryEntry(updated, {
                  id: `hist_duel_${uid}`,
                  year: updated.currentYear,
                  title: `${cur.name} Triumphs in Trial by Combat`,
                  category: 'War & Conquest',
                  description: `${cur.name} defeated ${opp.name} in a ferocious melee duel (${roll.summary}).`,
                  primaryActorId: cur.id,
                  secondaryActorId: opp.id,
                  realmId: cur.realmId,
                });
                return {
                  outcomeText: `VICTORY! ${char.name} shattered the challenger's blade and triumphed! +${prestigeGain} Prestige, +${dreadGain} Dread!`,
                  updatedWorld: updated,
                };
              } else if (roll.tier === 'partial') {
                cur.prestige += 110;
                cur.stress = Math.min(300, cur.stress + 15);
                return {
                  outcomeText: `A bloody draw! Both combatants staggered from the chalk circle with honor intact (+110 Prestige, +15 Stress).`,
                  updatedWorld: updated,
                };
              } else {
                cur.stress = Math.min(300, cur.stress + 40);
                cur.physicalHealthTraits = addTraitUnique(cur.physicalHealthTraits, 'Scarred');
                syncCharacterTraits(cur);
                pushHistoryEntry(updated, {
                  id: `hist_duelloss_${uid}`,
                  year: updated.currentYear,
                  title: `${cur.name} Wounded in the Lists`,
                  category: 'Battle',
                  description: `${opp.name} scarred ${cur.name} in a heated trial by combat (${roll.summary}).`,
                  primaryActorId: cur.id,
                  secondaryActorId: opp.id,
                  realmId: cur.realmId,
                });
                return {
                  outcomeText: `A fierce setback! ${char.name} took a hard wound across the brow (+40 Stress, gained Scarred trait).`,
                  updatedWorld: updated,
                };
              }
            },
          },
          {
            label: `Command Champion ${champion?.name || 'the Sworn Knight'} to fight for the Crown`,
            flavor: '"A sovereign does not bicker with every barking hound in the field."',
            traitRequirements: ['Arrogant', 'Calm'],
            diceCheck: {
              statName: 'Champion Prowess',
              modifier: statMod(champion?.baseProwess || 16),
              dc: Math.max(10, Math.min(18, 11 + statMod(duelRival.baseProwess || 12))),
            },
            consequencesSummary: [
              'Success: +120 Prestige, ruler unharmed',
              'Critical: +200 Prestige & champion acclaimed',
              'Failure: -60 Prestige as champion yields',
            ],
            execute: (char, w, roll) => {
              const updated = cloneWorldState(w);
              const cur = updated.characters.find((c) => c.id === char.id)!;
              if (roll.tier === 'failure' || roll.tier === 'critical_failure') {
                cur.prestige = Math.max(0, cur.prestige - 60);
                return {
                  outcomeText: `The challenger bested the Court Champion in the ring! House honor suffered (-60 Prestige).`,
                  updatedWorld: updated,
                };
              }
              const gain = roll.tier === 'critical_success' ? 200 : roll.tier === 'partial' ? 75 : 120;
              cur.prestige += gain;
              pushHistoryEntry(updated, {
                id: `hist_champ_${uid}`,
                year: updated.currentYear,
                title: `Crown Champion Prevailed at ${realmName}`,
                category: 'War & Conquest',
                description: `${cur.name}'s sworn champion defeated ${duelRival.name} before the court (${roll.summary}).`,
                primaryActorId: cur.id,
                secondaryActorId: duelRival.id,
                realmId: cur.realmId,
              });
              return {
                outcomeText: `The Court Champion drove the challenger into the dust! Realm honor upheld (+${gain} Prestige).`,
                updatedWorld: updated,
              };
            },
          },
          {
            label: 'Offer bloodless mediation and boundary restitution',
            flavor: '"Blood spilled over pride is silver wasted that could feed the realm."',
            traitRequirements: ['Craven', 'Calm', 'Content'],
            diceCheck: { statName: 'Diplomacy', modifier: statMod(stats.diplomacy), dc: 11 },
            consequencesSummary: [
              'Success: -100 Prestige, -30 Stress, peace kept',
              'Critical: -40 Prestige, -40 Stress, graceful accord',
              'Failure: -180 Prestige, courtiers murmur',
            ],
            execute: (char, w, roll) => {
              const updated = cloneWorldState(w);
              const cur = updated.characters.find((c) => c.id === char.id)!;
              const loss =
                roll.tier === 'critical_success' ? 40 : roll.tier === 'failure' || roll.tier === 'critical_failure' ? 180 : 100;
              cur.prestige = Math.max(0, cur.prestige - loss);
              cur.stress = Math.max(0, cur.stress - (roll.tier === 'critical_success' ? 40 : 30));
              return {
                outcomeText: `${char.name} negotiated a bloodless settlement (-${loss} Prestige, relieved Stress).`,
                updatedWorld: updated,
              };
            },
          },
        ],
      }),
    },

    // 5. Cloister Midnight Rendezvous (Romance)
    {
      weight: 5,
      build: () => {
        const romanticTarget =
          lover ||
          spouse ||
          world.characters.find(
            (c) =>
              c.isAlive !== false &&
              c.id !== character.id &&
              c.age >= 18 &&
              c.age <= 55 &&
              c.realmId === realmId
          ) ||
          courtier;
        return {
          id: 'cloister_midnight_rendezvous',
          title: 'Moonlight in the Herb Cloister',
          category: 'Romance',
          illustration: '🌹',
          body: `Past vespers, moonbeams silver the rosemary hedges of the keep garden. ${romanticTarget.name} lingers beside the stone fountain, holding a sprig of white hawthorn and speaking softly of longing, poetry, and stolen hours away from the council's prying eyes.`,
          options: [
            {
              label: `Keep the clandestine rendezvous with ${romanticTarget.name}`,
              flavor: '"Let the court keep its ledgers; tonight belongs to us."',
              traitRequirements: ['Lustful', 'Gregarious', 'Poet'],
              diceCheck: { statName: 'Diplomacy', modifier: statMod(stats.diplomacy), dc: 11 },
              consequencesSummary: [
                'Success: -45 Stress, +35 Opinion, romantic bond',
                'Critical: -65 Stress, +50 Opinion & +1 Diplomacy',
                'Failure: Rumors ripple (-50 Prestige, +15 Stress)',
              ],
              execute: (char, w, roll) => {
                const updated = cloneWorldState(w);
                const cur = updated.characters.find((c) => c.id === char.id)!;
                const tgt = updated.characters.find((c) => c.id === romanticTarget.id);
                if (roll.tier === 'failure' || roll.tier === 'critical_failure') {
                  cur.prestige = Math.max(0, cur.prestige - 50);
                  cur.stress = Math.min(300, cur.stress + 15);
                  return {
                    outcomeText: `Watchmen spotted shadows beneath the arches! Whispers spread through the hall (-50 Prestige, +15 Stress).`,
                    updatedWorld: updated,
                  };
                }
                const stressDrop = roll.tier === 'critical_success' ? 65 : 45;
                cur.stress = Math.max(0, cur.stress - stressDrop);
                if (tgt && tgt.id !== cur.id) {
                  tgt.opinions[cur.id] = Math.min(100, (tgt.opinions[cur.id] || 0) + (roll.tier === 'critical_success' ? 50 : 35));
                  if (!cur.loverId && tgt.id !== cur.spouseId) {
                    cur.loverId = tgt.id;
                    tgt.loverId = cur.id;
                  }
                }
                if (roll.tier === 'critical_success') {
                  cur.baseDiplomacy = (cur.baseDiplomacy || 8) + 1;
                }
                pushHistoryEntry(updated, {
                  id: `hist_romance_${uid}`,
                  year: updated.currentYear,
                  title: `Sonnets in the Cloister of ${realmName}`,
                  category: 'Dynastic Drama',
                  description: `Warm affection blossomed between ${cur.name} and ${romanticTarget.name} (${roll.summary}).`,
                  primaryActorId: cur.id,
                  secondaryActorId: romanticTarget.id,
                  realmId: cur.realmId,
                });
                return {
                  outcomeText: `A tender night beneath the cloister vines! Relieved ${stressDrop} Stress and deepened the bond with ${romanticTarget.name}.`,
                  updatedWorld: updated,
                };
              },
            },
            {
              label: 'Exchange courteous verses and uphold strict vows of propriety',
              flavor: '"Duty is the highest ornament of our House."',
              traitRequirements: ['Chaste', 'Honest', 'Temperate'],
              diceCheck: { statName: 'Learning', modifier: statMod(stats.learning), dc: 11 },
              consequencesSummary: [
                'Success: +110 Piety & +65 Prestige',
                'Critical: +170 Piety, +100 Prestige & gain Chaste',
                'Failure: Awkward parting (-10 Opinion)',
              ],
              execute: (char, w, roll) => {
                const updated = cloneWorldState(w);
                const cur = updated.characters.find((c) => c.id === char.id)!;
                const tgt = updated.characters.find((c) => c.id === romanticTarget.id);
                if (roll.tier === 'failure' || roll.tier === 'critical_failure') {
                  if (tgt && tgt.id !== cur.id) tgt.opinions[cur.id] = (tgt.opinions[cur.id] || 0) - 10;
                  return {
                    outcomeText: `Cold formality wounded pride beneath the lanternlight (-10 Opinion).`,
                    updatedWorld: updated,
                  };
                }
                const pietyGain = roll.tier === 'critical_success' ? 170 : 110;
                const presGain = roll.tier === 'critical_success' ? 100 : 65;
                cur.piety += pietyGain;
                cur.prestige += presGain;
                if (roll.tier === 'critical_success') {
                  cur.personalityTraits = addTraitUnique(cur.personalityTraits, 'Chaste');
                  syncCharacterTraits(cur);
                }
                return {
                  outcomeText: `Chivalric restraint earned admiration across the chapel (+${pietyGain} Piety, +${presGain} Prestige).`,
                  updatedWorld: updated,
                };
              },
            },
          ],
        };
      },
    },

    // 6. Abbot's Sacred Relic (Faith)
    {
      weight: 5,
      build: () => ({
        id: 'abbots_sacred_relic',
        title: "The Traveling Abbot's Reliquary",
        category: 'Faith',
        illustration: '⛪',
        body: `A dust-stained abbot arrives at ${capitalBurg?.name || 'the royal gates'} cradling a gilded cedar box. He swears it holds the preserved bone of a pre-conquest saint, claiming pilgrims already flock to touch its clasp and cure winter fevers.`,
        options: [
          {
            label: 'Endow a stone shrine in the cathedral (-45g)',
            flavor: '"If faith binds the realm together, gold is well spent."',
            traitRequirements: ['Zealous', 'Generous', 'Theologian'],
            diceCheck: { statName: 'Learning', modifier: statMod(stats.learning), dc: 11 },
            consequencesSummary: [
              'Success: +180 Piety, +75 Prestige, pilgrims flock',
              'Critical: +280 Piety & heals minor illness',
              'Failure: Crowds disperse quickly (+60 Piety)',
            ],
            execute: (char, w, roll) => {
              const updated = cloneWorldState(w);
              const cur = updated.characters.find((c) => c.id === char.id)!;
              const rlm = updated.realms.find((r) => r.id === cur.realmId);
              spendOrEarnRealmOrPersonalGold(cur, rlm, updated, -45, 'religiousPatronage');
              const pietyGain = roll.tier === 'critical_success' ? 280 : roll.tier === 'failure' || roll.tier === 'critical_failure' ? 60 : 180;
              cur.piety += pietyGain;
              if (roll.tier === 'success' || roll.tier === 'critical_success') cur.prestige += 75;
              if (roll.tier === 'critical_success') {
                cur.physicalHealthTraits = removeTrait(cur.physicalHealthTraits, 'Ill');
                cur.stress = Math.max(0, cur.stress - 30);
                syncCharacterTraits(cur);
              }
              pushHistoryEntry(updated, {
                id: `hist_relic_${uid}`,
                year: updated.currentYear,
                title: `Shrine of the Saint Dedicated in ${realmName}`,
                category: 'Religious Schism',
                description: `${cur.name} endowed a new reliquary shrine in ${capitalBurg?.name || realmName} (${roll.summary}).`,
                primaryActorId: cur.id,
                realmId: cur.realmId,
              });
              return {
                outcomeText: `Dedicated a gilded shrine! Gained +${pietyGain} Piety${
                  roll.tier === 'critical_success' ? ' and serene renewal (-30 Stress)' : ''
                }.`,
                updatedWorld: updated,
              };
            },
          },
          {
            label: 'Inspect the Latin seals and expose any monkish forgery',
            flavor: '"Truth needs no counterfeited bones."',
            traitRequirements: ['Cynical', 'Scholar', 'Diligent'],
            diceCheck: { statName: 'Intrigue', modifier: statMod(stats.intrigue), dc: 12 },
            consequencesSummary: [
              'Success: Unmask fraud! +130 Prestige & +1 Learning',
              'Critical: +190 Prestige & seize 65g illicit alms',
              'Failure: Clergy offended (-90 Piety)',
            ],
            execute: (char, w, roll) => {
              const updated = cloneWorldState(w);
              const cur = updated.characters.find((c) => c.id === char.id)!;
              const rlm = updated.realms.find((r) => r.id === cur.realmId);
              if (roll.tier === 'failure' || roll.tier === 'critical_failure') {
                cur.piety = Math.max(0, cur.piety - 90);
                return {
                  outcomeText: `The bishops condemned the skeptical inquiry as impious (-90 Piety).`,
                  updatedWorld: updated,
                };
              }
              const pres = roll.tier === 'critical_success' ? 190 : 130;
              cur.prestige += pres;
              cur.baseLearning = (cur.baseLearning || 8) + 1;
              if (roll.tier === 'critical_success') {
                spendOrEarnRealmOrPersonalGold(cur, rlm, updated, 65, 'administrationAndJustice');
              }
              pushHistoryEntry(updated, {
                id: `hist_fraud_${uid}`,
                year: updated.currentYear,
                title: `Counterfeit Relic Exposed in ${realmName}`,
                category: 'Religious Schism',
                description: `${cur.name} uncovered forged monastic seals before the chapter (${roll.summary}).`,
                primaryActorId: cur.id,
                realmId: cur.realmId,
              });
              return {
                outcomeText: `Exposed the false seals! Gained +${pres} Prestige and +1 Learning${
                  roll.tier === 'critical_success' ? ' plus 65g in confiscated alms' : ''
                }.`,
                updatedWorld: updated,
              };
            },
          },
          {
            label: 'Tax the pilgrim booths for the royal treasury',
            flavor: '"Every miracle crossing a Crown bridge pays toll."',
            traitRequirements: ['Greedy', 'Arbitrary', 'Avaricious'],
            diceCheck: { statName: 'Stewardship', modifier: statMod(stats.stewardship), dc: 11 },
            consequencesSummary: [
              'Success: +85g Treasury, +10 Dread, -60 Piety',
              'Critical: +130g Treasury without riot',
              'Failure: Pilgrims boo (-80 Piety, -50 Prestige)',
            ],
            execute: (char, w, roll) => {
              const updated = cloneWorldState(w);
              const cur = updated.characters.find((c) => c.id === char.id)!;
              const rlm = updated.realms.find((r) => r.id === cur.realmId);
              if (roll.tier === 'failure' || roll.tier === 'critical_failure') {
                cur.piety = Math.max(0, cur.piety - 80);
                cur.prestige = Math.max(0, cur.prestige - 50);
                return {
                  outcomeText: `Pilgrims overturned the toll tables! (-80 Piety, -50 Prestige).`,
                  updatedWorld: updated,
                };
              }
              const goldGain = roll.tier === 'critical_success' ? 130 : 85;
              spendOrEarnRealmOrPersonalGold(cur, rlm, updated, goldGain, 'scutageAndAidsIncome');
              cur.dread = Math.min(100, cur.dread + 10);
              cur.piety = Math.max(0, cur.piety - 60);
              return {
                outcomeText: `Collected ${goldGain}g in shrine gate tolls (+10 Dread, -60 Piety).`,
                updatedWorld: updated,
              };
            },
          },
        ],
      }),
    },

    // 7. Merchant Guild Monopoly Charter (Stewardship)
    {
      weight: 5,
      build: () => ({
        id: 'merchant_guild_monopoly',
        title: `Guild Charter of ${capitalBurg?.name || 'the Capital'}`,
        category: 'Stewardship',
        illustration: '⚖️',
        body: `Aldermen of the Cloth & Salt Guild kneel before the dais with heavy coffer-keys. They offer a handsome charter fee for exclusive weighing rights in ${capitalBurg?.name || realmName}—though smaller yeomen warn prices for bread and wool will climb.`,
        options: [
          {
            label: 'Seal the Guild Monopoly in exchange for immediate coin',
            flavor: '"Orderly guilds yield predictable tolls."',
            traitRequirements: ['Greedy', 'Administrator', 'Avaricious'],
            diceCheck: { statName: 'Stewardship', modifier: statMod(stats.stewardship), dc: 12 },
            consequencesSummary: [
              'Success: +120g Treasury, +1 Burg Dev',
              'Critical: +180g Treasury & +60 Prestige',
              'Failure: Bakers strike (+20 Stress, +8 Unrest)',
            ],
            execute: (char, w, roll) => {
              const updated = cloneWorldState(w);
              const cur = updated.characters.find((c) => c.id === char.id)!;
              const rlm = updated.realms.find((r) => r.id === cur.realmId);
              const burg = capitalBurg ? updated.burgs.find((b) => b.id === capitalBurg.id) : undefined;
              if (roll.tier === 'failure' || roll.tier === 'critical_failure') {
                cur.stress = Math.min(300, cur.stress + 20);
                if (burg) burg.unrest = Math.min(100, (burg.unrest || 0) + 8);
                return {
                  outcomeText: `Market apprentices barred their shutters in protest! (+20 Stress, +8 Unrest).`,
                  updatedWorld: updated,
                };
              }
              const gold = roll.tier === 'critical_success' ? 180 : 120;
              spendOrEarnRealmOrPersonalGold(cur, rlm, updated, gold, 'scutageAndAidsIncome');
              if (burg) burg.developmentLevel = Math.min(20, (burg.developmentLevel || 1) + 1);
              if (roll.tier === 'critical_success') cur.prestige += 60;
              pushHistoryEntry(updated, {
                id: `hist_guild_${uid}`,
                year: updated.currentYear,
                title: `Merchant Charter Sealed at ${burg?.name || realmName}`,
                category: 'Diplomacy',
                description: `${cur.name} granted royal weighing privileges for ${gold}g (${roll.summary}).`,
                primaryActorId: cur.id,
                realmId: cur.realmId,
              });
              return {
                outcomeText: `Charter sealed! Treasury gained +${gold}g and ${burg?.name || 'the capital'} grew in commerce.`,
                updatedWorld: updated,
              };
            },
          },
          {
            label: 'Audit their ledgers and keep markets open to free craftsmen',
            flavor: '"Competition fattens the town far better than cartel locks."',
            traitRequirements: ['Just', 'Diligent', 'Architect'],
            diceCheck: { statName: 'Stewardship', modifier: statMod(stats.stewardship), dc: 13 },
            consequencesSummary: [
              'Success: +1 Stewardship, -5 Burg Unrest, +90 Prestige',
              'Critical: +150 Prestige, +65g fines recovered',
              'Failure: Aldermen stall tax assessments (-25 Stress)',
            ],
            execute: (char, w, roll) => {
              const updated = cloneWorldState(w);
              const cur = updated.characters.find((c) => c.id === char.id)!;
              const rlm = updated.realms.find((r) => r.id === cur.realmId);
              const burg = capitalBurg ? updated.burgs.find((b) => b.id === capitalBurg.id) : undefined;
              if (roll.tier === 'failure' || roll.tier === 'critical_failure') {
                cur.stress = Math.min(300, cur.stress + 15);
                return {
                  outcomeText: `Guild scribes buried the auditors in endless parchment rolls (+15 Stress).`,
                  updatedWorld: updated,
                };
              }
              cur.baseStewardship = (cur.baseStewardship || 8) + 1;
              cur.prestige += roll.tier === 'critical_success' ? 150 : 90;
              if (burg) {
                burg.unrest = Math.max(0, (burg.unrest || 0) - 5);
                burg.population = Math.round((burg.population || 500) * 1.03);
              }
              if (roll.tier === 'critical_success') {
                spendOrEarnRealmOrPersonalGold(cur, rlm, updated, 65, 'administrationAndJustice');
              }
              pushHistoryEntry(updated, {
                id: `hist_freemarket_${uid}`,
                year: updated.currentYear,
                title: `Open Markets Proclaimed in ${burg?.name || realmName}`,
                category: 'Diplomacy',
                description: `${cur.name} struck down guild price-fixing and fostered free town trade (${roll.summary}).`,
                primaryActorId: cur.id,
                realmId: cur.realmId,
              });
              return {
                outcomeText: `Free markets flourished! +1 Stewardship, +${
                  roll.tier === 'critical_success' ? 150 : 90
                } Prestige, and calmer streets.`,
                updatedWorld: updated,
              };
            },
          },
        ],
      }),
    },

    // 8. Foreign Envoy's Secret Pact (Diplomacy)
    {
      weight: foreignRealm ? 5 : 0,
      build: () => ({
        id: 'foreign_envoy_secret_pact',
        title: `Envoy from ${foreignRealm?.name || 'Beyond the Frontier'}`,
        category: 'Diplomacy',
        illustration: '🕊️',
        body: `An unmarked barge moors beneath the postern tower carrying a chancellor from ${foreignRealm?.name || 'a neighboring state'}. Speaking for ${foreignRuler?.name || 'their sovereign'}, the envoy proposes quiet border guarantees—or discreet intelligence against mutual rivals.`,
        options: [
          {
            label: 'Sign a Frontier Accord & border tariff reduction',
            flavor: '"Peaceful borders let caravans double our customs."',
            traitRequirements: ['Gregarious', 'Diplomat', 'Calm'],
            diceCheck: { statName: 'Diplomacy', modifier: statMod(stats.diplomacy), dc: 11 },
            consequencesSummary: [
              `Success: +22 Relations with ${foreignRealm?.name || 'neighbor'}, +90 Prestige`,
              'Critical: +35 Relations, 4-yr Truce & +1 Diplomacy',
              'Failure: Envoy departs unconvinced (+10 Stress)',
            ],
            execute: (char, w, roll) => {
              const updated = cloneWorldState(w);
              const cur = updated.characters.find((c) => c.id === char.id)!;
              if (roll.tier === 'failure' || roll.tier === 'critical_failure') {
                cur.stress = Math.min(300, cur.stress + 10);
                return {
                  outcomeText: `Hard bargaining over river tolls stalled the accord (+10 Stress).`,
                  updatedWorld: updated,
                };
              }
              if (foreignRealm) {
                const delta = roll.tier === 'critical_success' ? 35 : 22;
                RealmDiplomacyEngine.adjustRealmRelation(cur.realmId, foreignRealm.id, delta, updated);
                if (roll.tier === 'critical_success') {
                  RealmDiplomacyEngine.setRealmTruce(cur.realmId, foreignRealm.id, 4, updated);
                  cur.baseDiplomacy = (cur.baseDiplomacy || 8) + 1;
                }
              }
              cur.prestige += 90;
              pushHistoryEntry(updated, {
                id: `hist_accord_${uid}`,
                year: updated.currentYear,
                title: `Frontier Accord: ${realmName} & ${foreignRealm?.name || 'Neighbors'}`,
                category: 'Diplomacy',
                description: `${cur.name} concluded quiet border assurances with ${foreignRealm?.name || 'foreign envoys'} (${roll.summary}).`,
                primaryActorId: cur.id,
                secondaryActorId: foreignRuler?.id,
                realmId: cur.realmId,
              });
              return {
                outcomeText: `Accord sealed! Relations with ${foreignRealm?.name || 'the neighbor'} warmed sharply (+90 Prestige).`,
                updatedWorld: updated,
              };
            },
          },
          {
            label: 'Ply the envoy with wine to extract foreign cipher keys',
            flavor: '"Diplomacy is merely espionage wearing velvet gloves."',
            traitRequirements: ['Deceitful', 'Schemer', 'Elusive Shadow'],
            diceCheck: { statName: 'Intrigue', modifier: statMod(stats.intrigue), dc: 13 },
            consequencesSummary: [
              'Success: +1 Intrigue & Weak Hook abroad',
              'Critical: Strong Hook on foreign ruler + +100 Prestige',
              'Failure: Diplomatic insult! -25 Relations',
            ],
            execute: (char, w, roll) => {
              const updated = cloneWorldState(w);
              const cur = updated.characters.find((c) => c.id === char.id)!;
              if (roll.tier === 'failure' || roll.tier === 'critical_failure') {
                if (foreignRealm) RealmDiplomacyEngine.adjustRealmRelation(cur.realmId, foreignRealm.id, -25, updated);
                return {
                  outcomeText: `The envoy realized his satchel was searched! Relations plunged (-25 Relations).`,
                  updatedWorld: updated,
                };
              }
              cur.baseIntrigue = (cur.baseIntrigue || 8) + 1;
              if (foreignRuler) {
                const fr = updated.characters.find((c) => c.id === foreignRuler.id);
                if (fr) {
                  cur.hooksHeld.push({
                    targetId: fr.id,
                    targetName: fr.name,
                    type: roll.tier === 'critical_success' ? 'Strong' : 'Weak',
                    reason: 'Copied diplomatic ciphers during secret parley',
                  });
                }
              }
              if (roll.tier === 'critical_success') cur.prestige += 100;
              pushHistoryEntry(updated, {
                id: `hist_ciphers_${uid}`,
                year: updated.currentYear,
                title: `Stolen Ciphers from ${foreignRealm?.name || 'Abroad'}`,
                category: 'Diplomacy',
                description: `${cur.name}'s agents copied secret dispatches during an incognito parley (${roll.summary}).`,
                primaryActorId: cur.id,
                secondaryActorId: foreignRuler?.id,
                realmId: cur.realmId,
              });
              return {
                outcomeText: `Copied the foreign cipher book without a trace! (+1 Intrigue & foreign Hook).`,
                updatedWorld: updated,
              };
            },
          },
        ],
      }),
    },

    // 9. Heir's Audacious Petition (Dynasty)
    {
      weight: heir ? 5 : 0,
      build: () => {
        const targetHeir = heir || courtier;
        return {
          id: 'heirs_audacious_petition',
          title: `Petition of ${targetHeir.name}`,
          category: 'Dynasty',
          illustration: '👑',
          body: `${targetHeir.name} kneels before the council table, eyes alight with youthful resolve, requesting an independent retinue and household stipend to patrol the frontier marches and prove worthy of House ${character.houseName}.`,
          options: [
            {
              label: `Outfit ${targetHeir.name}'s retinue with silver and lances (-40g)`,
              flavor: '"A blade only learns its edge in the field."',
              traitRequirements: ['Generous', 'Proud', 'Brave'],
              diceCheck: { statName: 'Martial', modifier: statMod(stats.martial), dc: 11 },
              consequencesSummary: [
                `Success: ${targetHeir.name} +2 Prowess & +1 Martial, +35 Opinion`,
                'Critical: +140 House Prestige & +3 Prowess',
                'Failure: Youthful misadventure (-20 Prestige)',
              ],
              execute: (char, w, roll) => {
                const updated = cloneWorldState(w);
                const cur = updated.characters.find((c) => c.id === char.id)!;
                const h = updated.characters.find((c) => c.id === targetHeir.id);
                const rlm = updated.realms.find((r) => r.id === cur.realmId);
                spendOrEarnRealmOrPersonalGold(cur, rlm, updated, -40, 'diplomacyAndPatronage');
                if (roll.tier === 'failure' || roll.tier === 'critical_failure') {
                  cur.prestige = Math.max(0, cur.prestige - 20);
                  return {
                    outcomeText: `The young retinue squandered coin at border taverns (-40g, -20 Prestige).`,
                    updatedWorld: updated,
                  };
                }
                if (h) {
                  h.baseProwess = (h.baseProwess || 8) + (roll.tier === 'critical_success' ? 3 : 2);
                  h.baseMartial = (h.baseMartial || 8) + 1;
                  h.opinions[cur.id] = Math.min(100, (h.opinions[cur.id] || 0) + 35);
                }
                if (roll.tier === 'critical_success') cur.prestige += 140;
                pushHistoryEntry(updated, {
                  id: `hist_heir_${uid}`,
                  year: updated.currentYear,
                  title: `${targetHeir.name} Takes the Frontier Banners`,
                  category: 'Dynastic Drama',
                  description: `${cur.name} outfitted ${targetHeir.name} with a household lance (-40g, ${roll.summary}).`,
                  primaryActorId: cur.id,
                  secondaryActorId: targetHeir.id,
                  realmId: cur.realmId,
                });
                return {
                  outcomeText: `${targetHeir.name} rode out to acclaim! Gained martial skill and deep loyalty.`,
                  updatedWorld: updated,
                };
              },
            },
            {
              label: 'Keep them beside the throne to study royal statecraft',
              flavor: '"Rule is won at the ledger and council bench first."',
              traitRequirements: ['Diligent', 'Patient', 'Administrator'],
              diceCheck: { statName: 'Stewardship', modifier: statMod(stats.stewardship), dc: 11 },
              consequencesSummary: [
                `Success: ${targetHeir.name} +1 Stewardship & +1 Diplomacy`,
                'Critical: +2 Stewardship, +15 Opinion & -20 Stress',
                'Failure: Heir chafes under restraint (-20 Opinion)',
              ],
              execute: (char, w, roll) => {
                const updated = cloneWorldState(w);
                const cur = updated.characters.find((c) => c.id === char.id)!;
                const h = updated.characters.find((c) => c.id === targetHeir.id);
                if (roll.tier === 'failure' || roll.tier === 'critical_failure') {
                  if (h) h.opinions[cur.id] = (h.opinions[cur.id] || 0) - 20;
                  return {
                    outcomeText: `${targetHeir.name} resented being kept inside the chancery (-20 Opinion).`,
                    updatedWorld: updated,
                  };
                }
                if (h) {
                  h.baseStewardship = (h.baseStewardship || 8) + (roll.tier === 'critical_success' ? 2 : 1);
                  h.baseDiplomacy = (h.baseDiplomacy || 8) + 1;
                  h.opinions[cur.id] = Math.min(100, (h.opinions[cur.id] || 0) + 15);
                }
                if (roll.tier === 'critical_success') cur.stress = Math.max(0, cur.stress - 20);
                return {
                  outcomeText: `Patient tutelage shaped ${targetHeir.name} into an able administrator.`,
                  updatedWorld: updated,
                };
              },
            },
          ],
        };
      },
    },

    // 10. Border Bandit Ambush (Warfare)
    {
      weight: 4,
      build: () => ({
        id: 'border_bandit_ambush',
        title: 'Wolves Along the King’s Road',
        category: 'Warfare',
        illustration: '🏹',
        body: `Battered carters limp into ${capitalBurg?.name || realmName} reporting that an organized band of disgraced sellswords has seized a forested ravine, plundering spice wagons and demanding silver passes from travelers.`,
        options: [
          {
            label: 'Lead a dawn cavalry sortie to scatter the brigands',
            flavor: '"Sound the horn—hang their captain from his own watch-oak."',
            traitRequirements: ['Brave', 'Rough Terrain Expert', 'Aggressive Attacker'],
            diceCheck: { statName: 'Martial', modifier: statMod(stats.martial), dc: 12 },
            consequencesSummary: [
              'Success: +95g Loot, +110 Prestige, safer roads',
              'Critical: +140g Loot, +1 Martial & +15 Dread',
              'Failure: Skirmish bloodied (+25 Stress)',
            ],
            execute: (char, w, roll) => {
              const updated = cloneWorldState(w);
              const cur = updated.characters.find((c) => c.id === char.id)!;
              const rlm = updated.realms.find((r) => r.id === cur.realmId);
              const burg = capitalBurg ? updated.burgs.find((b) => b.id === capitalBurg.id) : undefined;
              if (roll.tier === 'failure' || roll.tier === 'critical_failure') {
                cur.stress = Math.min(300, cur.stress + 25);
                return {
                  outcomeText: `Brigand archers vanished into the mist after wounding two outriders (+25 Stress).`,
                  updatedWorld: updated,
                };
              }
              const loot = roll.tier === 'critical_success' ? 140 : 95;
              spendOrEarnRealmOrPersonalGold(cur, rlm, updated, loot, 'scutageAndAidsIncome');
              cur.prestige += 110;
              if (burg) burg.devastation = Math.max(0, (burg.devastation || 0) - 5);
              if (roll.tier === 'critical_success') {
                cur.baseMartial = (cur.baseMartial || 8) + 1;
                cur.dread = Math.min(100, cur.dread + 15);
              }
              pushHistoryEntry(updated, {
                id: `hist_bandits_${uid}`,
                year: updated.currentYear,
                title: `Highways Cleared Around ${burg?.name || realmName}`,
                category: 'Battle',
                description: `${cur.name} routed ravine brigands and recovered ${loot}g of plundered coin (${roll.summary}).`,
                primaryActorId: cur.id,
                realmId: cur.realmId,
              });
              return {
                outcomeText: `Brigands routed! Recovered ${loot}g in stolen bullion and won +110 Prestige.`,
                updatedWorld: updated,
              };
            },
          },
          {
            label: 'Pay quiet silver to redirect them across a rival’s border',
            flavor: '"Why slaughter hungry wolves when a neighbor leaves sheep unguarded?"',
            traitRequirements: ['Deceitful', 'Arbitrary', 'Schemer'],
            diceCheck: { statName: 'Intrigue', modifier: statMod(stats.intrigue), dc: 12 },
            consequencesSummary: [
              'Success: -25g Cost, +20 Dread, rivals harassed',
              'Critical: +1 Intrigue & foreign roads disrupted',
              'Failure: Brigands pocket coin & raid anyway (-60 Prestige)',
            ],
            execute: (char, w, roll) => {
              const updated = cloneWorldState(w);
              const cur = updated.characters.find((c) => c.id === char.id)!;
              const rlm = updated.realms.find((r) => r.id === cur.realmId);
              spendOrEarnRealmOrPersonalGold(cur, rlm, updated, -25, 'diplomacyAndPatronage');
              if (roll.tier === 'failure' || roll.tier === 'critical_failure') {
                cur.prestige = Math.max(0, cur.prestige - 60);
                return {
                  outcomeText: `The mercenaries took the coin and still burned two granaries (-25g, -60 Prestige).`,
                  updatedWorld: updated,
                };
              }
              cur.dread = Math.min(100, cur.dread + 20);
              if (roll.tier === 'critical_success') cur.baseIntrigue = (cur.baseIntrigue || 8) + 1;
              return {
                outcomeText: `The sellswords slipped across the border to trouble neighboring taxmen (+20 Dread).`,
                updatedWorld: updated,
              };
            },
          },
        ],
      }),
    },

    // 11. Alchemist Elixir Consultation (Faith / Learning)
    {
      weight: 4,
      build: () => ({
        id: 'alchemist_elixir_consultation',
        title: 'The Alchemist’s Sapphire Phial',
        category: 'Faith',
        illustration: '⚗️',
        body: `An exiled physician from the eastern universities presents a shimmering phial distilled from saffron, quicksilver, and spring dew. He claims a single draught restores youthful vigor—though court chaplains mutter darkly of forbidden arts.`,
        options: [
          {
            label: 'Drink the sapphire elixir personally',
            flavor: '"Let scholars tremble—fortune favors those who test the unknown."',
            traitRequirements: ['Brave', 'Whole of Body', 'Eccentric'],
            diceCheck: { statName: 'Learning', modifier: statMod(stats.learning), dc: 12 },
            consequencesSummary: [
              'Success: -40 Stress, +2 Prowess, purges Ill/Wounded',
              'Critical: +1 Learning, +3 Prowess, Whole of Body',
              'Failure: Violent fever (+35 Stress, gain Ill)',
            ],
            execute: (char, w, roll) => {
              const updated = cloneWorldState(w);
              const cur = updated.characters.find((c) => c.id === char.id)!;
              if (roll.tier === 'failure' || roll.tier === 'critical_failure') {
                cur.stress = Math.min(300, cur.stress + 35);
                cur.physicalHealthTraits = addTraitUnique(cur.physicalHealthTraits, 'Ill');
                syncCharacterTraits(cur);
                return {
                  outcomeText: `Bitter quicksilver churned like fire! ${cur.name} fell Ill (+35 Stress).`,
                  updatedWorld: updated,
                };
              }
              cur.stress = Math.max(0, cur.stress - 40);
              cur.baseProwess = (cur.baseProwess || 8) + (roll.tier === 'critical_success' ? 3 : 2);
              cur.physicalHealthTraits = removeTrait(cur.physicalHealthTraits, 'Ill');
              cur.physicalHealthTraits = removeTrait(cur.physicalHealthTraits, 'Wounded');
              if (roll.tier === 'critical_success') {
                cur.baseLearning = (cur.baseLearning || 8) + 1;
                cur.lifestyleTraits = addTraitUnique(cur.lifestyleTraits, 'Whole of Body');
              }
              syncCharacterTraits(cur);
              pushHistoryEntry(updated, {
                id: `hist_elixir_${uid}`,
                year: updated.currentYear,
                title: `Wondrous Draught at ${realmName}`,
                category: 'Dynastic Drama',
                description: `${cur.name} drank a rare botanical elixir and emerged invigorated (${roll.summary}).`,
                primaryActorId: cur.id,
                realmId: cur.realmId,
              });
              return {
                outcomeText: `Warm vitality coursed through ${cur.name}'s veins! (-40 Stress, +Prowess, cleansed ailments).`,
                updatedWorld: updated,
              };
            },
          },
          {
            label: 'Shatter the phial and expel the dabbler for heresy',
            flavor: '"God alone grants breath and years."',
            traitRequirements: ['Zealous', 'Chaste', 'Temperate'],
            diceCheck: { statName: 'Piety/Diplomacy', modifier: statMod(stats.diplomacy), dc: 10 },
            consequencesSummary: [
              'Success: +140 Piety & +60 Prestige',
              'Critical: +210 Piety & clergy acclaim',
              'Failure: +50 Piety',
            ],
            execute: (char, w, roll) => {
              const updated = cloneWorldState(w);
              const cur = updated.characters.find((c) => c.id === char.id)!;
              const piety = roll.tier === 'critical_success' ? 210 : roll.tier === 'failure' ? 50 : 140;
              cur.piety += piety;
              if (roll.tier !== 'failure') cur.prestige += 60;
              return {
                outcomeText: `The cathedral chapter lauded ${cur.name}'s orthodoxy (+${piety} Piety).`,
                updatedWorld: updated,
              };
            },
          },
        ],
      }),
    },

    // 12. Solstice Feast Precedence Feud (Dynasty)
    {
      weight: 4,
      build: () => {
        const vassalA = world.characters.find((c) => c.isAlive !== false && c.realmId === realmId && c.id !== character.id) || courtier;
        const vassalB =
          world.characters.find(
            (c) => c.isAlive !== false && c.realmId === realmId && c.id !== character.id && c.id !== vassalA.id
          ) || friend || duelRival;
        return {
          id: 'solstice_feast_feud',
          title: 'Brawl at the High Table',
          category: 'Dynasty',
          illustration: '🍷',
          body: `Midway through the roast swan course, ${vassalA.name} and ${vassalB.name} rise with hands on sword-hilts, each insisting their lineage merits the seat nearest the salt cellar. The hall freezes as spilled claret darkens the rush floor.`,
          options: [
            {
              label: 'Invoke royal precedent and toast both Houses equally',
              flavor: '"Both shields guard this hearth; neither shall sit in shadow."',
              traitRequirements: ['Gregarious', 'Diplomat', 'Just'],
              diceCheck: { statName: 'Diplomacy', modifier: statMod(stats.diplomacy), dc: 12 },
              consequencesSummary: [
                'Success: +25 Opinion both nobles, +100 Prestige',
                'Critical: +35 Opinion both, -30 Stress & +150 Prestige',
                'Failure: Mocked behind cups (-40 Prestige)',
              ],
              execute: (char, w, roll) => {
                const updated = cloneWorldState(w);
                const cur = updated.characters.find((c) => c.id === char.id)!;
                const a = updated.characters.find((c) => c.id === vassalA.id);
                const b = updated.characters.find((c) => c.id === vassalB.id);
                if (roll.tier === 'failure' || roll.tier === 'critical_failure') {
                  cur.prestige = Math.max(0, cur.prestige - 40);
                  return {
                    outcomeText: `Halfhearted platitudes satisfied neither banner (-40 Prestige).`,
                    updatedWorld: updated,
                  };
                }
                const op = roll.tier === 'critical_success' ? 35 : 25;
                if (a && a.id !== cur.id) a.opinions[cur.id] = Math.min(100, (a.opinions[cur.id] || 0) + op);
                if (b && b.id !== cur.id) b.opinions[cur.id] = Math.min(100, (b.opinions[cur.id] || 0) + op);
                cur.prestige += roll.tier === 'critical_success' ? 150 : 100;
                if (roll.tier === 'critical_success') cur.stress = Math.max(0, cur.stress - 30);
                return {
                  outcomeText: `Graceful statecraft turned daggers into raised goblets! (+${op} Opinion, +Prestige).`,
                  updatedWorld: updated,
                };
              },
            },
            {
              label: 'Slam the iron goblet down and demand silent submission',
              flavor: '"Sit where I bid you, or feast inside the undercroft."',
              traitRequirements: ['Wrathful', 'Intimidating', 'Callous'],
              diceCheck: { statName: 'Prowess/Dread', modifier: statMod(stats.prowess), dc: 12 },
              consequencesSummary: [
                'Success: +20 Dread & +75 Prestige',
                'Critical: +30 Dread & immediate obedience',
                'Failure: Vassals nurse resentment (-25 Opinion)',
              ],
              execute: (char, w, roll) => {
                const updated = cloneWorldState(w);
                const cur = updated.characters.find((c) => c.id === char.id)!;
                const a = updated.characters.find((c) => c.id === vassalA.id);
                if (roll.tier === 'failure' || roll.tier === 'critical_failure') {
                  if (a && a.id !== cur.id) a.opinions[cur.id] = (a.opinions[cur.id] || 0) - 25;
                  return {
                    outcomeText: `Sullen silence fell, and half the guests departed early (-25 Opinion).`,
                    updatedWorld: updated,
                  };
                }
                const dreadGain = roll.tier === 'critical_success' ? 30 : 20;
                cur.dread = Math.min(100, cur.dread + dreadGain);
                cur.prestige += 75;
                return {
                  outcomeText: `Stone silence obeyed the iron voice of the Crown (+${dreadGain} Dread, +75 Prestige).`,
                  updatedWorld: updated,
                };
              },
            },
          ],
        };
      },
    },

    // 13. Winter Granary Hoarding (Stewardship)
    {
      weight: world.currentSeason === 'Winter' || world.currentSeason === 'Autumn' ? 7 : 3,
      build: () => ({
        id: 'winter_granary_hoarding',
        title: 'Hoarded Granaries of the Frost',
        category: 'Stewardship',
        illustration: '🌾',
        body: `Frostbite locks the mill-streams around ${capitalBurg?.name || realmName}. Bailiffs uncover locked storehouses bulging with salted barley held back by speculators hoping to triple flour prices before spring thaw.`,
        options: [
          {
            label: 'Confiscate the hoarded grain and distribute bread to the commons',
            flavor: '"None shall starve beneath my banner for a merchant’s ledger."',
            traitRequirements: ['Just', 'Compassionate', 'Generous'],
            diceCheck: { statName: 'Stewardship', modifier: statMod(stats.stewardship), dc: 11 },
            consequencesSummary: [
              'Success: -10 Burg Unrest, +90 Piety, +80 Prestige',
              'Critical: +140 Prestige, +60g fine from hoarders',
              'Failure: Granary scuffles (-30 Prestige)',
            ],
            execute: (char, w, roll) => {
              const updated = cloneWorldState(w);
              const cur = updated.characters.find((c) => c.id === char.id)!;
              const rlm = updated.realms.find((r) => r.id === cur.realmId);
              const burg = capitalBurg ? updated.burgs.find((b) => b.id === capitalBurg.id) : undefined;
              if (roll.tier === 'failure' || roll.tier === 'critical_failure') {
                cur.prestige = Math.max(0, cur.prestige - 30);
                return {
                  outcomeText: `Crowds mobbed the doors before bailiffs could organize rations (-30 Prestige).`,
                  updatedWorld: updated,
                };
              }
              if (burg) burg.unrest = Math.max(0, (burg.unrest || 0) - 10);
              cur.piety += 90;
              cur.prestige += roll.tier === 'critical_success' ? 140 : 80;
              if (roll.tier === 'critical_success') {
                spendOrEarnRealmOrPersonalGold(cur, rlm, updated, 60, 'administrationAndJustice');
              }
              pushHistoryEntry(updated, {
                id: `hist_granary_${uid}`,
                year: updated.currentYear,
                title: `Winter Relief in ${burg?.name || realmName}`,
                category: 'Diplomacy',
                description: `${cur.name} broke grain speculators and fed the commons (${roll.summary}).`,
                primaryActorId: cur.id,
                realmId: cur.realmId,
              });
              return {
                outcomeText: `Ovens blazed through the night! Unrest fell and the populace blessed ${cur.name}.`,
                updatedWorld: updated,
              };
            },
          },
          {
            label: 'Levy an emergency royal grain excise instead',
            flavor: '"If silver changes hands, the Crown claims its tenth."',
            traitRequirements: ['Greedy', 'Callous', 'Avaricious'],
            diceCheck: { statName: 'Stewardship', modifier: statMod(stats.stewardship), dc: 12 },
            consequencesSummary: [
              'Success: +95g Treasury, +8 Burg Unrest',
              'Critical: +145g Treasury, +10 Dread',
              'Failure: Bread riots! (+14 Unrest, +25 Stress)',
            ],
            execute: (char, w, roll) => {
              const updated = cloneWorldState(w);
              const cur = updated.characters.find((c) => c.id === char.id)!;
              const rlm = updated.realms.find((r) => r.id === cur.realmId);
              const burg = capitalBurg ? updated.burgs.find((b) => b.id === capitalBurg.id) : undefined;
              if (roll.tier === 'failure' || roll.tier === 'critical_failure') {
                cur.stress = Math.min(300, cur.stress + 25);
                if (burg) burg.unrest = Math.min(100, (burg.unrest || 0) + 14);
                return {
                  outcomeText: `Angry bakers pelted tax-collectors with frozen loaves! (+14 Unrest, +25 Stress).`,
                  updatedWorld: updated,
                };
              }
              const gold = roll.tier === 'critical_success' ? 145 : 95;
              spendOrEarnRealmOrPersonalGold(cur, rlm, updated, gold, 'scutageAndAidsIncome');
              if (burg) burg.unrest = Math.min(100, (burg.unrest || 0) + 8);
              if (roll.tier === 'critical_success') cur.dread = Math.min(100, cur.dread + 10);
              return {
                outcomeText: `Collected ${gold}g in winter grain excises, though grumbling echoed in the wards.`,
                updatedWorld: updated,
              };
            },
          },
        ],
      }),
    },

    // 14. Frontier Heresy Synod (Faith)
    {
      weight: 4,
      build: () => ({
        id: 'frontier_heresy_synod',
        title: 'The Charcoal Preacher of the Marches',
        category: 'Faith',
        illustration: '🔥',
        body: `A charismatic mendicant draws hundreds to open hillside sermons across ${realmName}, condemning gilded cathedrals and preaching austerity. Local bishops clamor for iron chains, while town artisans applaud the call for fair tithes.`,
        options: [
          {
            label: 'Convene a public theological disputation at the cathedral',
            flavor: '"Sharp Scripture refutes error better than cold iron."',
            traitRequirements: ['Theologian', 'Scholar', 'Patient'],
            diceCheck: { statName: 'Learning', modifier: statMod(stats.learning), dc: 12 },
            consequencesSummary: [
              'Success: +160 Piety, +1 Learning, preacher reconciles',
              'Critical: +240 Piety & +120 Prestige',
              'Failure: Crowd swells in defiance (-50 Piety)',
            ],
            execute: (char, w, roll) => {
              const updated = cloneWorldState(w);
              const cur = updated.characters.find((c) => c.id === char.id)!;
              if (roll.tier === 'failure' || roll.tier === 'critical_failure') {
                cur.piety = Math.max(0, cur.piety - 50);
                return {
                  outcomeText: `The mendicant out-quoted the cathedral dean before cheering crowds (-50 Piety).`,
                  updatedWorld: updated,
                };
              }
              const piety = roll.tier === 'critical_success' ? 240 : 160;
              cur.piety += piety;
              cur.baseLearning = (cur.baseLearning || 8) + 1;
              if (roll.tier === 'critical_success') cur.prestige += 120;
              pushHistoryEntry(updated, {
                id: `hist_synod_${uid}`,
                year: updated.currentYear,
                title: `Great Synod of ${realmName}`,
                category: 'Religious Schism',
                description: `${cur.name} chaired a learned synod reconciling frontier dissenters (${roll.summary}).`,
                primaryActorId: cur.id,
                realmId: cur.realmId,
              });
              return {
                outcomeText: `Eloquence carried the synod! Gained +${piety} Piety and +1 Learning.`,
                updatedWorld: updated,
              };
            },
          },
          {
            label: 'Grant quiet toleration in exchange for artisan hearth-tax',
            flavor: '"Hardworking weavers matter more than sermon wording."',
            traitRequirements: ['Cynical', 'Temperate', 'Administrator'],
            diceCheck: { statName: 'Diplomacy', modifier: statMod(stats.diplomacy), dc: 11 },
            consequencesSummary: [
              'Success: +80g Treasury, calmer towns, -75 Piety',
              'Critical: +115g Treasury & +1 Burg Dev',
              'Failure: Bishops furious (-120 Piety)',
            ],
            execute: (char, w, roll) => {
              const updated = cloneWorldState(w);
              const cur = updated.characters.find((c) => c.id === char.id)!;
              const rlm = updated.realms.find((r) => r.id === cur.realmId);
              const burg = capitalBurg ? updated.burgs.find((b) => b.id === capitalBurg.id) : undefined;
              cur.piety = Math.max(0, cur.piety - (roll.tier === 'failure' ? 120 : 75));
              if (roll.tier === 'failure' || roll.tier === 'critical_failure') {
                return {
                  outcomeText: `Abbots thundered from every pulpit against royal laxity (-120 Piety).`,
                  updatedWorld: updated,
                };
              }
              const gold = roll.tier === 'critical_success' ? 115 : 80;
              spendOrEarnRealmOrPersonalGold(cur, rlm, updated, gold, 'scutageAndAidsIncome');
              if (roll.tier === 'critical_success' && burg) {
                burg.developmentLevel = Math.min(20, (burg.developmentLevel || 1) + 1);
              }
              return {
                outcomeText: `Quiet toleration swelled guild rolls (+${gold}g Treasury, -75 Piety).`,
                updatedWorld: updated,
              };
            },
          },
        ],
      }),
    },

    // 15. Ancient Vault Excavation (Dynasty / Heritage)
    {
      weight: 4,
      build: () => ({
        id: 'ancient_vault_excavation',
        title: 'Sunken Vaults Beneath the Keep',
        category: 'Dynasty',
        illustration: '🏛️',
        body: `Masons repairing cellar foundations strike a bronze-bound lintel carved with archaic runes. Lanternlight reveals tarnished silver chalices, stone tablets, and an ancient royal grant older than ${realmName} itself.`,
        options: [
          {
            label: 'Proclaim the charter as proof of ancestral sovereignty',
            flavor: '"By stone and seal, our House held these hills before memory!"',
            traitRequirements: ['Ambitious', 'Proud', 'August'],
            diceCheck: { statName: 'Diplomacy', modifier: statMod(stats.diplomacy), dc: 12 },
            consequencesSummary: [
              'Success: +210 Prestige & +15 House Renown',
              'Critical: +320 Prestige & +1 Diplomacy',
              'Failure: Antiquarians scoff (-30 Prestige)',
            ],
            execute: (char, w, roll) => {
              const updated = cloneWorldState(w);
              const cur = updated.characters.find((c) => c.id === char.id)!;
              if (roll.tier === 'failure' || roll.tier === 'critical_failure') {
                cur.prestige = Math.max(0, cur.prestige - 30);
                return {
                  outcomeText: `Rival scribes dismissed the tablets as crude frontier stonework (-30 Prestige).`,
                  updatedWorld: updated,
                };
              }
              const pres = roll.tier === 'critical_success' ? 320 : 210;
              cur.prestige += pres;
              if (roll.tier === 'critical_success') cur.baseDiplomacy = (cur.baseDiplomacy || 8) + 1;
              pushHistoryEntry(updated, {
                id: `hist_vault_${uid}`,
                year: updated.currentYear,
                title: `Ancient Charter Unearthed by ${cur.name}`,
                category: 'Coronation',
                description: `Subterranean vaults yielded antique royal seals affirming House ${cur.houseName}'s lineage (${roll.summary}).`,
                primaryActorId: cur.id,
                realmId: cur.realmId,
              });
              return {
                outcomeText: `Bards sang of the sunken tablets! Gained +${pres} Prestige.`,
                updatedWorld: updated,
              };
            },
          },
          {
            label: 'Mint the tarnished silver plate into realm coinage',
            flavor: '"Dead kings have no further use for bullion; living garrisons do."',
            traitRequirements: ['Greedy', 'Cynical', 'Avaricious'],
            diceCheck: { statName: 'Stewardship', modifier: statMod(stats.stewardship), dc: 10 },
            consequencesSummary: [
              'Success: +115g Treasury',
              'Critical: +170g Treasury & clean minting',
              'Failure: Plate mostly lead (+40g, -20 Prestige)',
            ],
            execute: (char, w, roll) => {
              const updated = cloneWorldState(w);
              const cur = updated.characters.find((c) => c.id === char.id)!;
              const rlm = updated.realms.find((r) => r.id === cur.realmId);
              const gold = roll.tier === 'critical_success' ? 170 : roll.tier === 'failure' ? 40 : 115;
              spendOrEarnRealmOrPersonalGold(cur, rlm, updated, gold, 'scutageAndAidsIncome');
              if (roll.tier === 'failure') cur.prestige = Math.max(0, cur.prestige - 20);
              return {
                outcomeText: `Melted the vault silver into bright coin (+${gold}g Treasury).`,
                updatedWorld: updated,
              };
            },
          },
        ],
      }),
    },
  ];

  // Filter out empty-weight scenarios and already-seen IDs if possible
  const excluded = new Set(options?.excludeIds || []);
  let eligible = candidates.filter((c) => c.weight > 0);
  if (eligible.length === 0) eligible = candidates;

  // Build once and filter excluded unless everything is excluded
  const builtPool = eligible.map((entry) => ({
    weight: entry.weight,
    ev: entry.build(),
  }));
  const freshPool = builtPool.filter((item) => !excluded.has(item.ev.id));
  const pool = freshPool.length > 0 ? freshPool : builtPool;

  // Deterministic yet varied selection using character id, currentYear, history length, and seedOffset
  const offset = options?.seedOffset ?? 0;
  let hash = (world.currentYear * 31 + (world.history?.length || 0) * 17 + offset * 97) >>> 0;
  for (let i = 0; i < character.id.length; i++) {
    hash = (hash * 33 + character.id.charCodeAt(i)) >>> 0;
  }

  // If stress > 85 and initial draw (offset === 0), prioritize Mental Break immediately
  if (character.stress > 85 && offset === 0 && !excluded.has('mental_break_event')) {
    const mb = pool.find((p) => p.ev.id === 'mental_break_event');
    if (mb) return mb.ev;
  }

  const totalWeight = pool.reduce((sum, p) => sum + p.weight, 0);
  let cursor = hash % Math.max(1, totalWeight);
  for (const item of pool) {
    cursor -= item.weight;
    if (cursor < 0) return item.ev;
  }
  return pool[0].ev;
}
