import React, { useState } from 'react';
import { WorldState, Character } from '../types/world';
import {
  LifestylePerksEngine,
  LIFESTYLE_PERKS,
  LIFESTYLE_AMBITIONS,
  LifestyleBranch,
} from '../engine/grandStatecraftEngine';
import { cloneWorldState } from '../utils/cloneWorldState';
import { X, Award, Compass, Swords, Coins, Eye, HeartHandshake } from 'lucide-react';

interface LifestylePerksModalProps {
  isOpen: boolean;
  onClose: () => void;
  world: WorldState;
  monarch: Character;
  onUpdateWorld: (next: WorldState) => void;
}

const BRANCH_META: Record<LifestyleBranch, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  Martial: { label: 'Martial Command', icon: Swords },
  Stewardship: { label: 'Royal Stewardship', icon: Coins },
  Intrigue: { label: 'Court Intrigue', icon: Eye },
  Diplomacy: { label: 'State Diplomacy', icon: HeartHandshake },
};

export const LifestylePerksModal: React.FC<LifestylePerksModalProps> = ({
  isOpen,
  onClose,
  world,
  monarch,
  onUpdateWorld,
}) => {
  const [branch, setBranch] = useState<LifestyleBranch>('Martial');
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!isOpen) return null;

  const liveMonarch =
    world.characters.find((c) => c.id === monarch.id && c.isAlive !== false) || monarch;
  const isForeignMonarch =
    world.appMode !== 'builder' &&
    world.playerRealmId !== null &&
    Boolean(world.playerRealmId) &&
    liveMonarch.realmId !== world.playerRealmId;
  const xp = Math.round(liveMonarch.lifestyleXp ?? 110);
  const unlocked = liveMonarch.lifestylePerks || [];
  const completedAmbitions = liveMonarch.completedAmbitions || [];

  const notify = (msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), 4000);
  };

  const handleUnlockPerk = (perkId: string) => {
    if (isForeignMonarch) return;
    const updated = cloneWorldState(world);
    const targetChar = updated.characters.find((c) => c.id === liveMonarch.id && c.isAlive !== false);
    if (!targetChar) return;
    const res = LifestylePerksEngine.unlockPerkForMonarch(targetChar, perkId, updated);
    onUpdateWorld(updated);
    notify(res.summary);
  };

  const handleSelectAmbition = (ambitionId: string) => {
    if (isForeignMonarch) return;
    const updated = cloneWorldState(world);
    const targetChar = updated.characters.find((c) => c.id === liveMonarch.id && c.isAlive !== false);
    if (!targetChar) return;
    const res = LifestylePerksEngine.setMonarchAmbition(targetChar, ambitionId);
    onUpdateWorld(updated);
    notify(res.summary);
  };

  const branchPerks = LIFESTYLE_PERKS.filter((p) => p.branch === branch);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none">
      <div className="w-full max-w-2xl max-h-[86vh] flex flex-col bg-stone-950 border border-stone-800 rounded-xl shadow-2xl overflow-hidden text-stone-100">
        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-800 flex items-center justify-between bg-stone-900/60">
          <div>
            <h2 className="text-base font-serif font-bold text-amber-200">
              {liveMonarch.name} — Sovereign Lifestyles & Ambitions
            </h2>
            <div className="text-xs text-stone-400 font-mono tabular-nums mt-0.5">
              Lifestyle XP: {xp} · Perks Unlocked: {unlocked.length}/12 · Age {liveMonarch.age}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Branch Selector */}
        <div className="px-5 py-2.5 border-b border-stone-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 p-1 bg-stone-900 rounded-lg">
            {(['Martial', 'Stewardship', 'Intrigue', 'Diplomacy'] as LifestyleBranch[]).map((b) => {
              const Icon = BRANCH_META[b].icon;
              return (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBranch(b)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer flex items-center gap-1.5 ${
                    branch === b ? 'bg-amber-600 text-white' : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{b}</span>
                </button>
              );
            })}
          </div>
          {feedback && <span className="text-xs text-amber-300 font-medium">{feedback}</span>}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {isForeignMonarch && (
            <div className="p-3 rounded-lg bg-stone-900 border border-amber-700/40 text-xs text-amber-200/90">
              Inspecting foreign ruler {liveMonarch.name}. Switch Playing As in the top bar (or use Observer mode) to direct their lifestyle perks.
            </div>
          )}
          {/* Perk Tree Progression */}
          <div className="space-y-2.5">
            <h3 className="text-xs uppercase font-bold tracking-wider text-amber-400">
              {BRANCH_META[branch].label} Tree
            </h3>
            <div className="space-y-2.5">
              {branchPerks.map((perk, idx) => {
                const isUnlocked = unlocked.includes(perk.id);
                const reqMet = !perk.requiresId || unlocked.includes(perk.requiresId);
                const canAfford = xp >= perk.xpCost;
                const reqPerk = perk.requiresId
                  ? LIFESTYLE_PERKS.find((p) => p.id === perk.requiresId)
                  : undefined;

                return (
                  <div
                    key={perk.id}
                    className={`p-3.5 rounded-lg border flex items-center justify-between gap-3 ${
                      isUnlocked
                        ? 'bg-emerald-950/30 border-emerald-800/60'
                        : 'bg-stone-900 border-stone-800'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm font-semibold text-stone-100">
                        <span className="font-mono text-xs text-stone-400">0{idx + 1}.</span>
                        <span>{perk.name}</span>
                      </div>
                      <p className="text-xs text-stone-400">{perk.description}</p>
                      {reqPerk && !isUnlocked && (
                        <p className="text-[11px] text-stone-500">
                          Requires: {reqPerk.name}
                        </p>
                      )}
                    </div>

                    {isUnlocked ? (
                      <span className="text-xs font-medium text-emerald-300 shrink-0">Unlocked</span>
                    ) : (
                      <button
                        type="button"
                        disabled={isForeignMonarch || !reqMet || !canAfford}
                        onClick={() => handleUnlockPerk(perk.id)}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold shrink-0 cursor-pointer tabular-nums ${
                          !isForeignMonarch && reqMet && canAfford
                            ? 'bg-amber-600 hover:bg-amber-500 text-white'
                            : 'bg-stone-800 text-stone-500 cursor-not-allowed'
                        }`}
                      >
                        Unlock ({perk.xpCost} XP)
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sovereign Ambitions */}
          <div className="space-y-2.5 pt-3 border-t border-stone-800">
            <h3 className="text-xs uppercase font-bold tracking-wider text-amber-400 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5" />
              <span>Sovereign Ambition Objective</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {LIFESTYLE_AMBITIONS.map((amb) => {
                const isActive = liveMonarch.activeAmbition === amb.id;
                const isCompleted = completedAmbitions.includes(amb.id);
                return (
                  <div
                    key={amb.id}
                    className={`p-3 rounded-lg border space-y-2 ${
                      isCompleted
                        ? 'bg-emerald-950/25 border-emerald-800/50'
                        : isActive
                        ? 'bg-amber-950/30 border-amber-700/60'
                        : 'bg-stone-900 border-stone-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-stone-100">{amb.name}</span>
                      <span className="text-[11px] text-stone-400 font-mono">{amb.branch}</span>
                    </div>
                    <p className="text-[11px] text-stone-400">{amb.description}</p>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-amber-300 font-mono tabular-nums">
                        +{amb.rewardPrestige} Prestige · +{amb.rewardXp} XP
                      </span>
                      {isCompleted ? (
                        <span className="text-[11px] font-medium text-emerald-300 flex items-center gap-1">
                          <Award className="w-3 h-3" /> Completed
                        </span>
                      ) : isActive ? (
                        <span className="text-[11px] font-medium text-amber-300">Active</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSelectAmbition(amb.id)}
                          className="px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-[11px] font-medium text-stone-200 cursor-pointer"
                        >
                          Select Ambition
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-stone-800 bg-stone-900/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-xs font-medium text-stone-200 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
