import { Character, TerrainType } from '../types/world';
import { Army, BattleTactic } from '../types/warfare';
import { rollOpposedBattleDice } from './diceEngine';
import { globalModRegistry } from './modSystem/registryManager';

export interface BattleTacticDefinition {
  id: BattleTactic;
  label: string;
  shortDesc: string;
  counters: BattleTactic[];
  counteredBy: BattleTactic[];
  terrainBonus: Partial<Record<TerrainType, number>>;
  casualtyTakenMod: number; // <1 reduces own casualties, >1 raises risk
}

export function getActiveBattleTactics(): Record<string, BattleTacticDefinition> {
  const reg = globalModRegistry.getRegistry<BattleTacticDefinition & { id: string }>('tactics');
  if (reg.size() === 0) return BATTLE_TACTICS;
  const out: Record<string, BattleTacticDefinition> = {};
  for (const item of reg.getAll()) {
    out[item.id] = item;
  }
  return out;
}

export function getActiveBattleTactic(tactic: BattleTactic): BattleTacticDefinition {
  const reg = globalModRegistry.getRegistry<BattleTacticDefinition & { id: string }>('tactics');
  const modded = reg.size() > 0 ? reg.get(tactic) : undefined;
  return modded || BATTLE_TACTICS[tactic] || BATTLE_TACTICS['Standard Line'];
}

export const BATTLE_TACTICS: Record<BattleTactic, BattleTacticDefinition> = {
  'Standard Line': {
    id: 'Standard Line',
    label: 'Combined Arms Line',
    shortDesc: 'Disciplined infantry center flanked by skirmishers; steady morale.',
    counters: [],
    counteredBy: ['Vanguard Shock', 'Ambush & Skirmish'],
    terrainBonus: { Plains: 1.04, Coastal: 1.02 },
    casualtyTakenMod: 1.0,
  },
  Shieldwall: {
    id: 'Shieldwall',
    label: 'Locked Shieldwall',
    shortDesc: 'Interlocking pikes & shields; excels in passes and breaks shock charges.',
    counters: ['Vanguard Shock'],
    counteredBy: ['Cavalry Envelopment'],
    terrainBonus: { Mountains: 1.24, Forest: 1.08, Coastal: 1.10 },
    casualtyTakenMod: 0.84,
  },
  'Cavalry Envelopment': {
    id: 'Cavalry Envelopment',
    label: 'Flanking Envelopment',
    shortDesc: 'Heavy horse sweeps around static shieldwalls on open plains.',
    counters: ['Shieldwall', 'Fabian Attrition'],
    counteredBy: ['Ambush & Skirmish'],
    terrainBonus: { Plains: 1.24, Mountains: 0.78, Forest: 0.84 },
    casualtyTakenMod: 1.06,
  },
  'Ambush & Skirmish': {
    id: 'Ambush & Skirmish',
    label: 'Woodland Ambush',
    shortDesc: 'Concealed archers & light raiders strike marching columns in cover.',
    counters: ['Cavalry Envelopment', 'Standard Line'],
    counteredBy: ['Vanguard Shock'],
    terrainBonus: { Forest: 1.26, Mountains: 1.12, Plains: 0.90 },
    casualtyTakenMod: 0.90,
  },
  'Vanguard Shock': {
    id: 'Vanguard Shock',
    label: 'Vanguard Shock Charge',
    shortDesc: 'All-out heavy assault shattering loose lines; high bloodshed on both sides.',
    counters: ['Standard Line', 'Ambush & Skirmish'],
    counteredBy: ['Shieldwall', 'Fabian Attrition'],
    terrainBonus: { Plains: 1.14, Coastal: 1.05, Mountains: 0.88 },
    casualtyTakenMod: 1.22,
  },
  'Fabian Attrition': {
    id: 'Fabian Attrition',
    label: 'Fabian Delay & Attrition',
    shortDesc: 'Avoids decisive encirclement, harrying supply wagons and bleeding aggression.',
    counters: ['Vanguard Shock'],
    counteredBy: ['Cavalry Envelopment'],
    terrainBonus: { Mountains: 1.18, Forest: 1.16, Coastal: 1.06 },
    casualtyTakenMod: 0.74,
  },
};

export const BATTLE_WEATHER_TABLE = [
  { name: 'Clear Dawn', atkMod: 1.0, defMod: 1.0 },
  { name: 'Heavy Downpour & Mud', atkMod: 0.92, defMod: 1.06 },
  { name: 'Morning Mist & Fog', atkMod: 0.96, defMod: 1.04 },
  { name: 'Crosswind & Dust', atkMod: 0.95, defMod: 0.98 },
  { name: 'Blinding Low Sun', atkMod: 1.05, defMod: 0.96 },
];

function collectCommanderTraits(cmd: Character | undefined): Set<string> {
  if (!cmd) return new Set();
  return new Set([
    ...(cmd.personalityTraits || []),
    ...(cmd.commanderTraits || []),
    ...(cmd.congenitalTraits || []),
    ...(cmd.physicalHealthTraits || []),
    ...(cmd.v17Traits || []),
    ...(cmd.educationTrait ? [cmd.educationTrait] : []),
  ]);
}

export function pickSmartBattleTactic(
  army: Army | undefined,
  terrain: TerrainType,
  isDefender: boolean,
  commander: Character | undefined
): BattleTactic {
  if (army?.tactic) return army.tactic;

  const regs = army?.regiments || [];
  const total = Math.max(1, regs.reduce((s, r) => s + r.count, 0));
  const cavRatio = regs.filter((r) => r.category === 'Cavalry').reduce((s, r) => s + r.count, 0) / total;
  const spearRatio = regs.filter((r) => r.category === 'Spear').reduce((s, r) => s + r.count, 0) / total;
  const traits = collectCommanderTraits(commander);

  const isAggressive =
    traits.has('Aggressive Attacker') ||
    traits.has('Aggressive') ||
    traits.has('Reckless') ||
    traits.has('Wrathful') ||
    traits.has('Wroth') ||
    traits.has('Brave') ||
    traits.has('Impatient');
  const isDefensive =
    traits.has('Unyielding Defender') ||
    traits.has('Defensive') ||
    traits.has('Patient') ||
    traits.has('Stubborn');
  const isCautious =
    traits.has('Craven') ||
    traits.has('Calm') ||
    traits.has('Patient');
  const isStrategist =
    traits.has('Brilliant Strategist') ||
    traits.has('Skilled Tactician') ||
    traits.has('Strategic') ||
    traits.has('Tactical') ||
    traits.has('Flexible Leader') ||
    traits.has('Genius');

  // 1. Terrain specialist commanders exploit terrain decisively
  if (terrain === 'Forest' && (traits.has('Forest Stalker') || isStrategist || traits.has('Deceitful') || !isAggressive)) {
    return 'Ambush & Skirmish';
  }
  if (terrain === 'Mountains') {
    if (isDefender || traits.has('Mountain Goatherd') || isDefensive) return 'Shieldwall';
    return isCautious ? 'Fabian Attrition' : 'Shieldwall';
  }

  // 2. Cavalry & Plains doctrines
  if (terrain === 'Plains' && (traits.has('Open Plains Master') || cavRatio >= 0.16)) {
    return isAggressive && cavRatio < 0.16 ? 'Vanguard Shock' : 'Cavalry Envelopment';
  }

  // 3. Personality & Commander trait doctrine
  if (isDefender && isCautious && !isAggressive) return 'Fabian Attrition';
  if (isDefensive || spearRatio >= 0.22) return 'Shieldwall';
  if (isAggressive && !isDefender) return 'Vanguard Shock';
  if (isStrategist) {
    if (terrain === 'Forest') return 'Ambush & Skirmish';
    if (terrain === 'Plains' && cavRatio >= 0.12) return 'Cavalry Envelopment';
    return isDefender ? 'Shieldwall' : 'Standard Line';
  }

  return isDefender ? 'Shieldwall' : 'Standard Line';
}

export function getCommanderBattleModifier(
  cmd: Character | undefined,
  isDefending: boolean,
  terrain?: TerrainType
): number {
  if (!cmd) return 1.0;
  const martial = cmd.baseMartial || 10;
  const intrigue = cmd.baseIntrigue || 10;
  let mod = 1.0 + (martial - 10) * 0.03 + (intrigue - 10) * 0.008;

  const traits = collectCommanderTraits(cmd);

  // Education & Strategic genius
  if (traits.has('Brilliant Strategist')) mod += 0.16;
  else if (traits.has('Skilled Tactician')) mod += 0.10;
  else if (traits.has('Tough Soldier')) mod += 0.05;
  else if (traits.has('Misguided Warrior')) mod -= 0.03;

  if (traits.has('Legendary Blademaster')) mod += 0.08;
  else if (traits.has('Formidable Duelist')) mod += 0.04;

  if (traits.has('Genius')) mod += 0.13;
  else if (traits.has('Intelligent')) mod += 0.08;
  else if (traits.has('Quick')) mod += 0.04;

  if (traits.has('Strategic') || traits.has('Tactical') || traits.has('Flexible Leader')) mod += 0.09;
  if (traits.has('Veteran Commander')) mod += 0.08;
  if (traits.has('Organizer')) mod += 0.05;
  if (cmd.battleExperience && cmd.battleExperience > 0) {
    mod += Math.min(0.12, cmd.battleExperience * 0.0012);
  }

  // Offense vs Defense Commander traits
  if ((traits.has('Aggressive Attacker') || traits.has('Aggressive') || traits.has('Reaver')) && !isDefending) {
    mod += 0.12;
  }
  if ((traits.has('Unyielding Defender') || traits.has('Defensive')) && isDefending) {
    mod += 0.13;
  }

  // Terrain specialization bonuses
  if (terrain === 'Forest' && traits.has('Forest Stalker')) mod += 0.12;
  if (terrain === 'Mountains' && traits.has('Mountain Goatherd')) mod += 0.12;
  if (terrain === 'Plains' && traits.has('Open Plains Master')) mod += 0.12;
  if (terrain === 'Coastal' && traits.has('Ford Crosser')) mod += 0.08;

  // Personality & Health impact
  if (traits.has('Brave')) mod += 0.06;
  if (traits.has('Wrathful') && !isDefending) mod += 0.04;
  if (traits.has('Patient') && isDefending) mod += 0.05;
  if (traits.has('Reckless')) mod += isDefending ? -0.05 : 0.07;
  if (traits.has('Craven')) mod -= 0.12;
  if (traits.has('Wounded') || traits.has('Severely Injured')) mod -= 0.07;
  if (traits.has('Maimed') || traits.has('Brutally Maimed')) mod -= 0.14;
  if (traits.has('Infirm') || traits.has('Incapable')) mod -= 0.18;

  return Math.max(0.68, Math.min(1.65, mod));
}

export function evaluateBattleStrategy(params: {
  attackerTactic: BattleTactic;
  defenderTactic: BattleTactic;
  terrain: TerrainType;
  attackerCommander?: Character;
  defenderCommander?: Character;
}): {
  atkMultiplier: number;
  defMultiplier: number;
  atkCasualtyMod: number;
  defCasualtyMod: number;
  weatherCondition: string;
  diceSwingPct: number;
  tacticalSummary: string;
} {
  const atkDef = BATTLE_TACTICS[params.attackerTactic] || BATTLE_TACTICS['Standard Line'];
  const defDef = BATTLE_TACTICS[params.defenderTactic] || BATTLE_TACTICS['Standard Line'];

  let atkTacticMod = atkDef.terrainBonus[params.terrain] || 1.0;
  let defTacticMod = defDef.terrainBonus[params.terrain] || 1.0;
  let counterNote = 'Balanced tactical engagement';

  if (atkDef.counters.includes(params.defenderTactic)) {
    atkTacticMod *= 1.18;
    counterNote = `${atkDef.label} countered ${defDef.label} (+18%)`;
  } else if (defDef.counters.includes(params.attackerTactic)) {
    defTacticMod *= 1.18;
    counterNote = `${defDef.label} countered ${atkDef.label} (+18%)`;
  }

  const weather = BATTLE_WEATHER_TABLE[Math.floor(Math.random() * BATTLE_WEATHER_TABLE.length)];
  const atkCmdMod = getCommanderBattleModifier(params.attackerCommander, false, params.terrain);
  const defCmdMod = getCommanderBattleModifier(params.defenderCommander, true, params.terrain);

  // Opposed 2d10 battlefield dice roll with critical breakthroughs and tactical fortune swings
  const battleDice = rollOpposedBattleDice();
  const diceSwingPct = battleDice.diceSwingPct;

  const atkMultiplier = atkTacticMod * atkCmdMod * weather.atkMod * battleDice.attackerMultiplier;
  const defMultiplier = defTacticMod * defCmdMod * weather.defMod * battleDice.defenderMultiplier;

  return {
    atkMultiplier,
    defMultiplier,
    atkCasualtyMod: atkDef.casualtyTakenMod,
    defCasualtyMod: defDef.casualtyTakenMod,
    weatherCondition: weather.name,
    diceSwingPct,
    tacticalSummary: `${counterNote} · Weather: ${weather.name} · ${battleDice.summary} (${diceSwingPct >= 0 ? '+' : ''}${diceSwingPct}%)`,
  };
}
