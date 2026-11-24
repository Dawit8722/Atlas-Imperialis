import React, { useState, useMemo, useEffect } from 'react';
import { Character, WorldState } from '../types/world';
import { HeraldryShield } from './HeraldryShield';
import { computeCharacterStats } from '../engine/fantasyTables';
import { rollDiceCheck, DiceRollResult } from '../engine/diceEngine';
import {
  ChronicleEvent,
  EventOption,
  EventDiceCheck,
  generateChronicleEvent,
  countMatchingTraits,
} from '../engine/chronicleEventsEngine';
import {
  Crown,
  X,
  Dices,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export type { ChronicleEvent, EventOption, EventDiceCheck };

interface ChronicleEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  character: Character;
  world: WorldState;
  onApplyEventOutcome: (outcomeText: string, updatedWorld: WorldState) => void;
}

export const ChronicleEventModal: React.FC<ChronicleEventModalProps> = ({
  isOpen,
  onClose,
  character,
  world,
  onApplyEventOutcome,
}) => {
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(null);
  const [seedOffset, setSeedOffset] = useState<number>(0);
  const [seenIds, setSeenIds] = useState<string[]>([]);
  const [resolvedOutcome, setResolvedOutcome] = useState<{
    roll: DiceRollResult;
    outcomeText: string;
    updatedWorld: WorldState;
    optionLabel: string;
    matchedTraits: string[];
    traitBonus: number;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedOptionIndex(null);
      setResolvedOutcome(null);
      setSeedOffset(0);
      setSeenIds([]);
    }
  }, [isOpen, character.id]);

  const stats = useMemo(() => computeCharacterStats(character), [character]);

  const event: ChronicleEvent = useMemo(
    () =>
      generateChronicleEvent(character, world, {
        seedOffset,
        excludeIds: seenIds,
      }),
    [character, world, seedOffset, seenIds]
  );

  if (!isOpen) return null;

  const handleDrawAnother = () => {
    setSelectedOptionIndex(null);
    setResolvedOutcome(null);
    setSeenIds((prev) => (prev.includes(event.id) ? prev : [...prev, event.id]));
    setSeedOffset((prev) => prev + 1);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-2xl bg-stone-950 border-2 border-amber-600/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col font-serif text-stone-200"
        >
          <div className="h-2 bg-gradient-to-r from-amber-700 via-amber-400 to-amber-700 shadow-sm" />

          <div className="p-5 border-b border-stone-800 bg-stone-900/90 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="w-12 h-12 rounded-xl bg-amber-950/80 border border-amber-500/70 flex items-center justify-center text-2xl shadow-inner shrink-0">
                {event.illustration}
              </span>
              <div>
                <div className="text-[10px] uppercase font-bold tracking-widest text-amber-500 font-sans">
                  Court Chronicle · {event.category} · Year {world.currentYear} AC
                </div>
                <h2 className="text-xl font-bold font-cinzel text-amber-100 leading-tight">
                  {event.title}
                </h2>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-stone-400 hover:text-stone-100 hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
              title="Close Court Chronicle"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4 overflow-y-auto max-h-[62vh]">
            <div className="flex items-center gap-3 p-3 bg-stone-900/80 border border-stone-800 rounded-xl font-sans text-xs">
              <HeraldryShield
                coatOfArms={character.coatOfArms}
                unheralded={!character.coatOfArms}
                seed={`${character.realmId}_${character.houseName}_${character.id}`}
                size={38}
              />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-amber-200 truncate">{character.name}</div>
                <div className="text-[11px] text-stone-400 truncate">
                  {character.title} · <span className="text-amber-400">{character.aiArchetype}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px] shrink-0">
                <span className="px-2 py-0.5 bg-stone-950 border border-stone-800 rounded text-amber-400">
                  Prowess: {stats.prowess}
                </span>
                <span className="px-2 py-0.5 bg-stone-950 border border-stone-800 rounded text-red-400">
                  Stress: {character.stress}/300
                </span>
              </div>
            </div>

            <div className="p-4 bg-stone-900/40 border border-stone-800/80 rounded-xl text-stone-300 text-sm leading-relaxed whitespace-pre-line italic">
              "{event.body}"
            </div>

            {resolvedOutcome ? (
              <div className="p-5 bg-stone-900/90 border border-amber-500/50 rounded-xl space-y-4 font-sans">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Dices className="w-5 h-5 text-amber-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
                      Fate Roll · {resolvedOutcome.roll.diceLabel} + {resolvedOutcome.roll.statName}
                    </span>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wide border ${
                      resolvedOutcome.roll.tier === 'critical_success'
                        ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300'
                        : resolvedOutcome.roll.tier === 'success'
                        ? 'bg-sky-950/80 border-sky-500/60 text-sky-300'
                        : resolvedOutcome.roll.tier === 'partial'
                        ? 'bg-amber-950/80 border-amber-500/60 text-amber-300'
                        : 'bg-rose-950/80 border-rose-500/60 text-rose-300'
                    }`}
                  >
                    {resolvedOutcome.roll.tierLabel}
                  </span>
                </div>

                {resolvedOutcome.traitBonus > 0 && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-950/40 border border-emerald-600/40 text-xs text-emerald-300">
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Trait Synergy Applied (+{resolvedOutcome.traitBonus} to Fate Roll from{' '}
                      <strong>{resolvedOutcome.matchedTraits.join(', ')}</strong>)
                    </span>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3 p-3.5 bg-stone-950/90 border border-stone-800 rounded-lg">
                  <div className="flex items-center gap-2">
                    {resolvedOutcome.roll.rolls.map((face, i) => (
                      <div
                        key={i}
                        className="w-10 h-10 rounded-lg bg-stone-900 border-2 border-amber-500/70 flex items-center justify-center text-lg font-bold font-mono text-amber-200 shadow-inner"
                      >
                        {face}
                      </div>
                    ))}
                  </div>
                  <div className="text-sm font-mono text-stone-300">
                    <span className="text-stone-400">
                      ({resolvedOutcome.roll.rawSum}) {resolvedOutcome.roll.modifier >= 0 ? '+' : ''}
                      {resolvedOutcome.roll.modifier} {resolvedOutcome.roll.statName}
                    </span>
                    <span className="mx-2 text-stone-600">=</span>
                    <span className="text-lg font-bold text-amber-300">{resolvedOutcome.roll.total}</span>
                    <span className="ml-2 text-xs text-stone-400">vs DC {resolvedOutcome.roll.dc}</span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-3.5 bg-stone-950/60 border border-stone-800 rounded-lg text-sm text-stone-200 font-serif leading-relaxed">
                  {resolvedOutcome.roll.tier === 'failure' || resolvedOutcome.roll.tier === 'critical_failure' ? (
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  )}
                  <span>{resolvedOutcome.outcomeText}</span>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5 pt-2">
                <div className="text-[11px] uppercase tracking-wider font-bold text-amber-500 font-sans">
                  Choose an Action (2d10 Fate Check):
                </div>

                {event.options.map((option, idx) => {
                  const isSelected = selectedOptionIndex === idx;
                  const synergy = countMatchingTraits(character, option.traitRequirements);
                  const totalModifier = option.diceCheck.modifier + synergy.bonus;
                  const modSign = totalModifier >= 0 ? `+${totalModifier}` : `${totalModifier}`;

                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedOptionIndex(idx)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer space-y-1.5 ${
                        isSelected
                          ? 'bg-amber-950/70 border-amber-500 shadow-lg ring-1 ring-amber-500'
                          : 'bg-stone-900/80 border-stone-800 hover:border-amber-600/60 hover:bg-stone-900'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="font-bold text-stone-100 text-sm leading-snug">
                          {option.label}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 font-sans flex-wrap">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-950/80 border border-amber-600/60 rounded text-[10px] font-mono text-amber-300">
                            <Dices className="w-3 h-3" />
                            2d10 {modSign} {option.diceCheck.statName} · DC {option.diceCheck.dc}
                          </span>
                          {option.traitRequirements && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                                synergy.bonus > 0
                                  ? 'bg-emerald-950/80 border-emerald-600/70 text-emerald-300'
                                  : 'bg-indigo-950/80 border-indigo-700/60 text-indigo-300'
                              }`}
                              title={
                                synergy.bonus > 0
                                  ? `Matched trait(s): ${synergy.matched.join(', ')} (+${synergy.bonus} bonus)`
                                  : `Matching traits grant +2 to Fate Check`
                              }
                            >
                              {synergy.bonus > 0
                                ? `✓ ${synergy.matched.join(', ')} (+${synergy.bonus})`
                                : option.traitRequirements.join(' / ')}
                            </span>
                          )}
                        </div>
                      </div>

                      <p className="text-stone-400 text-xs italic">{option.flavor}</p>

                      <div className="flex flex-wrap gap-1.5 pt-1 font-sans text-[10px]">
                        {option.consequencesSummary.map((c, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 bg-stone-950/80 border border-stone-700/70 rounded text-amber-200"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="p-4 border-t border-stone-800 bg-stone-900/90 flex items-center justify-between gap-2 font-sans">
            {resolvedOutcome ? (
              <>
                <span className="text-xs text-stone-400 font-mono truncate">
                  {resolvedOutcome.roll.summary}
                </span>
                <button
                  onClick={() => {
                    onApplyEventOutcome(
                      `[${resolvedOutcome.roll.summary}] ${resolvedOutcome.outcomeText}`,
                      resolvedOutcome.updatedWorld
                    );
                    setResolvedOutcome(null);
                    setSelectedOptionIndex(null);
                    onClose();
                  }}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg transition-all flex items-center gap-2 cursor-pointer shrink-0"
                >
                  <Crown className="w-4 h-4" />
                  <span>Seal &amp; Accept Outcome</span>
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 py-2 text-stone-400 hover:text-stone-200 text-xs font-medium cursor-pointer"
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={handleDrawAnother}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-stone-800/80 hover:bg-stone-800 border border-stone-700/70 text-stone-300 hover:text-amber-200 text-xs font-medium transition-colors cursor-pointer"
                    title="Draw another court event"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Draw Another</span>
                  </button>
                </div>

                <button
                  disabled={selectedOptionIndex === null}
                  onClick={() => {
                    if (selectedOptionIndex !== null) {
                      const opt = event.options[selectedOptionIndex];
                      const synergy = countMatchingTraits(character, opt.traitRequirements);
                      const statLabel =
                        synergy.bonus > 0
                          ? `${opt.diceCheck.statName} + Trait`
                          : opt.diceCheck.statName;
                      const roll = rollDiceCheck({
                        sides: 10,
                        count: 2,
                        modifier: opt.diceCheck.modifier + synergy.bonus,
                        statName: statLabel,
                        dc: opt.diceCheck.dc,
                      });
                      const res = opt.execute(character, world, roll);
                      setResolvedOutcome({
                        roll,
                        outcomeText: res.outcomeText,
                        updatedWorld: res.updatedWorld,
                        optionLabel: opt.label,
                        matchedTraits: synergy.matched,
                        traitBonus: synergy.bonus,
                      });
                    }
                  }}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
                    selectedOptionIndex !== null
                      ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-900/30'
                      : 'bg-stone-800 text-stone-500 cursor-not-allowed'
                  }`}
                >
                  <Dices className="w-4 h-4" />
                  <span>Roll Fate &amp; Enact Decree</span>
                </button>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
