export type DiceOutcomeTier =
  | 'critical_success'
  | 'success'
  | 'partial'
  | 'failure'
  | 'critical_failure';

export interface DiceRollResult {
  diceLabel: string; // e.g. "2d10"
  sides: number;
  rolls: number[];
  rawSum: number;
  modifier: number;
  statName: string;
  total: number;
  dc: number;
  tier: DiceOutcomeTier;
  tierLabel: string;
  summary: string;
}

export interface OpposedBattleDiceResult {
  attackerRolls: [number, number];
  defenderRolls: [number, number];
  attackerSum: number;
  defenderSum: number;
  attackerMultiplier: number;
  defenderMultiplier: number;
  diceSwingPct: number;
  attackerCrit: boolean;
  defenderCrit: boolean;
  summary: string;
}

function rollDie(sides: number, rng?: () => number): number {
  const r = rng ? rng() : Math.random();
  return Math.floor(r * sides) + 1;
}

export function getTierLabel(tier: DiceOutcomeTier): string {
  switch (tier) {
    case 'critical_success':
      return 'Critical Triumph';
    case 'success':
      return 'Success';
    case 'partial':
      return 'Mixed Fortune';
    case 'failure':
      return 'Setback';
    case 'critical_failure':
      return 'Critical Blunder';
  }
}

/**
 * Tabletop-style dice check for court decisions, schemes, duels, and realm events.
 * Uses 2d10 (bell curve 2..20) + stat modifier against a Difficulty Class (DC).
 */
export function rollDiceCheck(params: {
  sides?: number;
  count?: number;
  modifier: number;
  statName: string;
  dc: number;
  rng?: () => number;
}): DiceRollResult {
  const sides = params.sides ?? 10;
  const count = params.count ?? 2;
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) {
    rolls.push(rollDie(sides, params.rng));
  }
  const rawSum = rolls.reduce((a, b) => a + b, 0);
  const modifier = Math.round(params.modifier);
  const total = rawSum + modifier;
  const dc = Math.round(params.dc);
  const maxRaw = sides * count;
  const minRaw = count;

  let tier: DiceOutcomeTier;
  if (rawSum === maxRaw || total >= dc + 6) {
    tier = 'critical_success';
  } else if (rawSum === minRaw || total <= dc - 7) {
    tier = 'critical_failure';
  } else if (total >= dc) {
    tier = 'success';
  } else if (total >= dc - 3) {
    tier = 'partial';
  } else {
    tier = 'failure';
  }

  const diceLabel = `${count}d${sides}`;
  const modSign = modifier >= 0 ? `+${modifier}` : `${modifier}`;
  const tierLabel = getTierLabel(tier);
  const summary = `${diceLabel} [${rolls.join(', ')}] ${modSign} (${params.statName}) = ${total} vs DC ${dc} · ${tierLabel}`;

  return {
    diceLabel,
    sides,
    rolls,
    rawSum,
    modifier,
    statName: params.statName,
    total,
    dc,
    tier,
    tierLabel,
    summary,
  };
}

/**
 * Opposed 2d10 battlefield dice roll for engagements and sieges.
 * Translates natural rolls into combat power multipliers and a transparent log entry.
 */
export function rollOpposedBattleDice(rng?: () => number): OpposedBattleDiceResult {
  const a1 = rollDie(10, rng);
  const a2 = rollDie(10, rng);
  const d1 = rollDie(10, rng);
  const d2 = rollDie(10, rng);

  const attackerSum = a1 + a2; // 2..20, avg 11
  const defenderSum = d1 + d2; // 2..20, avg 11

  const attackerCrit = attackerSum >= 19 || (a1 === 10 && a2 === 10);
  const defenderCrit = defenderSum >= 19 || (d1 === 10 && d2 === 10);

  // Scale centered at 11 -> 1.00x; ranges ~0.82x..1.20x with critical bonus
  const attackerMultiplier = Math.max(
    0.78,
    Math.min(1.26, 1.0 + (attackerSum - 11) * 0.02 + (attackerCrit ? 0.06 : 0))
  );
  const defenderMultiplier = Math.max(
    0.78,
    Math.min(1.26, 1.0 + (defenderSum - 11) * 0.02 + (defenderCrit ? 0.06 : 0))
  );

  const diceSwingPct = Math.round((attackerMultiplier - defenderMultiplier) * 100);
  const atkTag = attackerCrit ? ' CRIT!' : '';
  const defTag = defenderCrit ? ' CRIT!' : '';
  const summary = `Dice 2d10: Atk [${a1}+${a2}=${attackerSum}${atkTag}] vs Def [${d1}+${d2}=${defenderSum}${defTag}]`;

  return {
    attackerRolls: [a1, a2],
    defenderRolls: [d1, d2],
    attackerSum,
    defenderSum,
    attackerMultiplier,
    defenderMultiplier,
    diceSwingPct,
    attackerCrit,
    defenderCrit,
    summary,
  };
}
