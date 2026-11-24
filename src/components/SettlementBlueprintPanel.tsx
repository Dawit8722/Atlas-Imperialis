import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Lock,
  Hammer,
  Flame,
  ShieldAlert,
  TrendingUp,
  CheckCircle2,
  Clock,
  Wrench,
  Coins,
  ShieldCheck,
  Map as MapIcon,
} from 'lucide-react';
import type { Burg, WorldState } from '../types/world';
import {
  getSettlementBlueprint,
  ensureBurgBuildingSlots,
  computeBurgBuildingMaintenance,
  evaluateBurgPromotionStatus,
  calculateRebuildCost,
  constructOrUpgradeBespokeSlot,
  executeBurgRebuild,
} from '../engine/settlementDevelopmentEngine';
import { cloneWorldState } from '../utils/cloneWorldState';

interface SettlementBlueprintPanelProps {
  burg: Burg;
  world: WorldState;
  onUpdateWorld?: (next: WorldState) => void;
  hoveredSlotId?: string | null;
  onHoverSlot?: (slotId: string | null) => void;
  selectedSlotId?: string | null;
  onSelectSlot?: (slotId: string | null) => void;
  onOpenCityMap?: () => void;
}

type SlotFilter = 'all' | 'built' | 'open' | 'locked';

export const SettlementBlueprintPanel: React.FC<SettlementBlueprintPanelProps> = ({
  burg,
  world,
  onUpdateWorld,
  hoveredSlotId = null,
  onHoverSlot,
  selectedSlotId = null,
  onSelectSlot,
  onOpenCityMap,
}) => {
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState<SlotFilter>('all');
  const slotRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!selectedSlotId) return;
    setFilter('all');
    const raf = window.requestAnimationFrame(() => {
      const el = slotRefs.current[selectedSlotId];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [selectedSlotId]);

  const blueprint = useMemo(() => getSettlementBlueprint(burg.type), [burg.type]);
  const slotStates = useMemo(() => ensureBurgBuildingSlots(burg), [burg]);
  const maint = useMemo(() => computeBurgBuildingMaintenance(burg), [burg]);
  const promo = useMemo(() => evaluateBurgPromotionStatus(burg, world), [burg, world]);
  const patchRebuild = useMemo(() => calculateRebuildCost(burg, world, 0.25), [burg, world]);
  const fullRebuild = useMemo(() => calculateRebuildCost(burg, world, 1.0), [burg, world]);

  const dev = Math.floor(burg.developmentLevel ?? 10);
  const devastation = Math.max(0, Math.min(100, Math.round(burg.devastation || 0)));

  const realm = useMemo(
    () => world.realms.find((r) => r.id === burg.stateId),
    [world.realms, burg.stateId]
  );
  const owner = useMemo(() => {
    const lord = world.characters.find((c) => c.id === burg.ownerId);
    if (lord) return lord;
    return realm ? world.characters.find((c) => c.id === realm.rulerId) : undefined;
  }, [world.characters, realm, burg.ownerId]);
  const burgMarket = world.economy?.burgMarkets?.[burg.id];
  const municipalCoffer = Math.round(burgMarket?.treasury ?? burg.treasury ?? 0);
  const availableTreasury = Math.round(realm ? (realm.treasury ?? 0) : (owner?.treasury ?? 0));

  const slotCounts = useMemo(() => {
    let built = 0;
    let open = 0;
    let locked = 0;
    for (const slot of blueprint.slots) {
      const isUnlocked = dev >= slot.unlockDev;
      const lvl = slotStates[slot.id]?.level || 0;
      if (!isUnlocked) locked += 1;
      else if (lvl > 0) built += 1;
      else open += 1;
    }
    return { all: blueprint.slots.length, built, open, locked };
  }, [blueprint.slots, slotStates, dev]);

  const filteredSlots = useMemo(() => {
    return blueprint.slots.filter((slot) => {
      const isUnlocked = dev >= slot.unlockDev;
      const lvl = slotStates[slot.id]?.level || 0;
      if (filter === 'built') return isUnlocked && lvl > 0;
      if (filter === 'open') return isUnlocked && lvl === 0;
      if (filter === 'locked') return !isUnlocked;
      return true;
    });
  }, [blueprint.slots, slotStates, dev, filter]);

  const runSlotUpgrade = (slotId: string) => {
    if (!onUpdateWorld) return;
    const next = cloneWorldState(world);
    const res = constructOrUpgradeBespokeSlot(burg.id, slotId, next);
    setNotice({ ok: res.success, text: res.message });
    if (res.success) {
      onUpdateWorld(next);
    }
  };

  const runRebuild = (fraction: number) => {
    if (!onUpdateWorld) return;
    const next = cloneWorldState(world);
    const res = executeBurgRebuild(burg.id, fraction, next);
    setNotice({ ok: res.success, text: res.message });
    if (res.success) {
      onUpdateWorld(next);
    }
  };

  const devCapPct = Math.min(100, Math.round((dev / Math.max(1, blueprint.devSoftCap)) * 100));

  return (
    <div className="space-y-3">
      {/* Feedback Banner */}
      {notice && (
        <div
          className={`px-3 py-2 rounded-lg text-[11px] border flex items-center justify-between gap-2 ${
            notice.ok
              ? 'bg-emerald-950/60 border-emerald-700/50 text-emerald-200'
              : 'bg-rose-950/60 border-rose-700/50 text-rose-200'
          }`}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-[10px] opacity-70 hover:opacity-100 cursor-pointer shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* Settlement Blueprint Summary Header */}
      <div className="rounded-xl bg-stone-900/65 border border-white/[0.08] p-3.5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-amber-400/90 font-semibold">
              Settlement Blueprint · Tier {blueprint.tierNum}
            </div>
            <div className="text-sm font-bold text-stone-100 flex flex-wrap items-baseline gap-x-2 mt-0.5">
              <span>{blueprint.type}</span>
              <span className="text-[11px] font-mono tabular-nums font-normal text-stone-400">
                Dev {dev} / {blueprint.devSoftCap}
              </span>
            </div>
          </div>
          <div className="text-right text-[11px] font-mono tabular-nums shrink-0 flex flex-col items-end gap-1">
            <div className="text-amber-300 font-semibold">
              {slotCounts.built} Built · {slotCounts.open} Open
            </div>
            <div className="text-stone-400">
              {realm ? 'Crown Fisc' : 'Privy Purse'}:{' '}
              <span className={availableTreasury >= 0 ? 'text-emerald-300' : 'text-rose-400'}>
                {availableTreasury.toLocaleString()}g
              </span>
            </div>
            <div className="text-stone-500">
              Town Coffer: <span className="text-stone-300">{municipalCoffer.toLocaleString()}g</span>
            </div>
            {onOpenCityMap && (
              <button
                type="button"
                onClick={onOpenCityMap}
                className="mt-0.5 flex items-center gap-1 rounded-lg border border-amber-500/45 bg-amber-600/15 px-2.5 py-1 text-[11px] font-sans font-semibold text-amber-200 hover:bg-amber-600/30 cursor-pointer whitespace-nowrap shrink-0 transition-colors"
              >
                <MapIcon className="w-3 h-3 shrink-0" />
                <span>View City Plan</span>
              </button>
            )}
          </div>
        </div>

        {/* Development Progress Bar */}
        <div className="space-y-1">
          <div className="w-full h-1.5 bg-stone-950 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-400 transition-all"
              style={{ width: `${devCapPct}%` }}
            />
          </div>
          <p className="text-[11px] text-stone-400 leading-snug">{blueprint.role}</p>
        </div>

        {/* Hairline Output Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-white/[0.07] text-[11px] font-mono tabular-nums pt-2 border-t border-white/[0.07]">
          <div className="px-2 first:pl-0">
            <div className="text-[10px] text-stone-400 uppercase font-sans">Upkeep</div>
            <div className="text-rose-300 font-semibold mt-0.5">-{maint.monthlyGoldUpkeep.toFixed(1)}g/mo</div>
          </div>
          <div className="px-2">
            <div className="text-[10px] text-stone-400 uppercase font-sans">Slot Tax</div>
            <div className="text-emerald-300 font-semibold mt-0.5">+{maint.taxBonus.toFixed(1)}g/mo</div>
          </div>
          <div className="px-2">
            <div className="text-[10px] text-stone-400 uppercase font-sans">Garrison</div>
            <div className="text-sky-300 font-semibold mt-0.5">+{maint.garrisonBonus.toLocaleString()}</div>
          </div>
          <div className="px-2 last:pr-0">
            <div className="text-[10px] text-stone-400 uppercase font-sans">Status</div>
            <div className={`font-semibold mt-0.5 ${devastation > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {devastation > 0 ? `${devastation}% Damaged` : 'Intact'}
            </div>
          </div>
        </div>
      </div>

      {/* War Devastation & Proportional Rebuilding Panel */}
      {(devastation > 0 || maint.dilapidatedCount > 0) && (
        <div className="rounded-xl bg-rose-950/35 border border-rose-700/50 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-rose-200">
              <Flame className="w-3.5 h-3.5 text-rose-400" />
              War & Siege Devastation ({devastation}%)
            </div>
            {maint.dilapidatedCount > 0 && (
              <span className="text-[10px] font-mono text-amber-300 flex items-center gap-1">
                <ShieldAlert className="w-3 h-3" />
                {maint.dilapidatedCount} Dilapidated
              </span>
            )}
          </div>

          <div className="w-full h-1.5 bg-stone-900 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-rose-600 transition-all"
              style={{ width: `${devastation}%` }}
            />
          </div>

          <div className="text-[10px] text-rose-200/80 leading-snug">
            Devastation suppresses tax output, halts organic promotion, and scales reconstruction costs proportionally.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => runRebuild(0.25)}
              disabled={!onUpdateWorld}
              className="px-2.5 py-2 rounded-lg bg-stone-900/90 hover:bg-stone-800 border border-amber-600/40 text-left transition-colors cursor-pointer disabled:opacity-50"
            >
              <div className="flex items-center justify-between text-[11px] font-semibold text-amber-200">
                <span className="flex items-center gap-1">
                  <Wrench className="w-3 h-3" /> Relief (-25%)
                </span>
                <span className="font-mono text-amber-300">{patchRebuild.totalGoldIfImportingMissing}g</span>
              </div>
              <div className="text-[9px] text-stone-400 mt-0.5 leading-tight">
                {Object.entries(patchRebuild.commodities)
                  .map(([k, v]) => `${v} ${k}`)
                  .join(' · ')}
              </div>
            </button>

            <button
              type="button"
              onClick={() => runRebuild(1.0)}
              disabled={!onUpdateWorld}
              className="px-2.5 py-2 rounded-lg bg-amber-950/60 hover:bg-amber-900/60 border border-amber-500/50 text-left transition-colors cursor-pointer disabled:opacity-50"
            >
              <div className="flex items-center justify-between text-[11px] font-semibold text-amber-100">
                <span className="flex items-center gap-1">
                  <Hammer className="w-3 h-3" /> Full Rebuild
                </span>
                <span className="font-mono text-amber-300">{fullRebuild.totalGoldIfImportingMissing}g</span>
              </div>
              <div className="text-[9px] text-stone-300 mt-0.5 leading-tight">
                {Object.entries(fullRebuild.commodities)
                  .map(([k, v]) => `${v} ${k}`)
                  .join(' · ')}
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Glacial 5-Gate Organic Urbanization Tracker */}
      {promo.hasNextStage && promo.targetType && (
        <div className="rounded-xl bg-stone-900/75 border border-stone-700/70 p-3 space-y-2">
          <div className="flex items-center justify-between text-xs gap-2">
            <span className="font-semibold text-stone-200 flex items-center gap-1.5 min-w-0 truncate">
              <TrendingUp className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">
                Promotion → <span className="text-amber-300">{promo.targetType}</span>
              </span>
            </span>
            <span className="text-[10px] font-mono text-stone-400 flex items-center gap-1 shrink-0">
              <Clock className="w-3 h-3 text-amber-400/80" />
              {promo.streakYears}/{promo.requiredStreakYears}y Peace
            </span>
          </div>

          <div className="w-full h-1.5 bg-stone-950 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500/80 transition-all"
              style={{ width: `${promo.progressPct}%` }}
            />
          </div>

          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
            <div className={promo.devMet ? 'text-emerald-300' : 'text-stone-400'}>
              {promo.devMet ? '✓' : '○'} Dev {promo.currentDev} / {promo.minDev}
            </div>
            <div className={promo.popMet ? 'text-emerald-300' : 'text-stone-400'}>
              {promo.popMet ? '✓' : '○'} Pop {promo.currentPop.toLocaleString()} / {promo.minPop.toLocaleString()}
            </div>
            <div className={`col-span-2 ${promo.keystoneMet ? 'text-emerald-300' : 'text-stone-400'}`}>
              {promo.keystoneMet ? '✓' : '○'} {promo.keystoneSummary}
            </div>
            <div className={`col-span-2 ${promo.hinterlandMet ? 'text-emerald-300' : 'text-amber-300/85'}`}>
              {promo.hinterlandMet ? '✓' : '○'} {promo.hinterlandSummary}
            </div>
          </div>
        </div>
      )}

      {/* Filter Bar for Building Slots */}
      <div className="flex items-center justify-between gap-1 bg-stone-950/70 p-1 rounded-lg border border-stone-800">
        {(
          [
            ['all', `All (${slotCounts.all})`],
            ['built', `Built (${slotCounts.built})`],
            ['open', `Open (${slotCounts.open})`],
            ['locked', `Locked (${slotCounts.locked})`],
          ] as [SlotFilter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`flex-1 py-1 px-1.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
              filter === key
                ? 'bg-amber-600/30 text-amber-200 border border-amber-500/40'
                : 'text-stone-400 hover:text-stone-200 border border-transparent'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Bespoke Building Slots List */}
      <div className="space-y-2">
        {filteredSlots.length === 0 && (
          <div className="rounded-lg border border-stone-800 bg-stone-950/50 p-3 text-center text-[11px] text-stone-500">
            No building slots in this filter.
          </div>
        )}

        {filteredSlots.map((slot) => {
          const isUnlocked = dev >= slot.unlockDev;
          const st = slotStates[slot.id] || { level: 0 };
          const currentLvl = st.level || 0;
          const curDef = currentLvl > 0 ? slot.levels.find((l) => l.level === currentLvl) : undefined;
          const nextDef = slot.levels.find((l) => l.level === currentLvl + 1);
          const maxLevel = slot.levels.length;
          const canMeetDevForNext = nextDef ? dev >= nextDef.minDev : false;
          const canAffordGold = nextDef ? availableTreasury >= nextDef.goldCost : true;

          const isHighlighted = hoveredSlotId === slot.id || selectedSlotId === slot.id;

          if (!isUnlocked) {
            return (
              <div
                key={slot.id}
                ref={(el) => {
                  slotRefs.current[slot.id] = el;
                }}
                onMouseEnter={() => onHoverSlot?.(slot.id)}
                onMouseLeave={() => onHoverSlot?.(null)}
                onClick={() => onSelectSlot?.(slot.id)}
                className={`rounded-lg border border-dashed px-3 py-2 flex items-center justify-between gap-2 transition-colors ${
                  isHighlighted
                    ? 'border-amber-400/90 bg-amber-950/25 opacity-100'
                    : 'border-stone-800 bg-stone-950/50 opacity-80'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Lock className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-stone-400 truncate">
                      Slot {slot.slotIndex}: {slot.name}
                    </div>
                    <div className="text-[10px] text-stone-500 truncate">
                      {slot.levels[0]?.name} · {maxLevel} Tiers
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-900 border border-stone-700 text-amber-400/90 shrink-0">
                  Dev {slot.unlockDev}
                </span>
              </div>
            );
          }

          return (
            <div
              key={slot.id}
              ref={(el) => {
                slotRefs.current[slot.id] = el;
              }}
              onMouseEnter={() => onHoverSlot?.(slot.id)}
              onMouseLeave={() => onHoverSlot?.(null)}
              onClick={() => onSelectSlot?.(slot.id)}
              className={`rounded-lg border px-3 py-2.5 transition-colors ${
                isHighlighted
                  ? 'bg-amber-950/25 border-amber-400'
                  : st.dilapidated
                  ? 'bg-rose-950/25 border-rose-700/50'
                  : currentLvl > 0
                  ? 'bg-stone-900/85 border-stone-700/80'
                  : 'bg-stone-900/45 border-stone-800'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-stone-100">
                      {curDef ? curDef.name : slot.name}
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-stone-400">
                      Lv.{currentLvl}/{maxLevel}
                    </span>
                    {st.dilapidated && (
                      <span className="text-[11px] text-rose-400 font-semibold">
                        · Dilapidated
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-stone-400 mt-0.5 leading-snug">
                    {curDef ? curDef.summary : `Empty ${slot.name} plot — ready for construction`}
                  </div>
                </div>

                {/* Level Pips */}
                <div className="flex flex-col items-end shrink-0">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: maxLevel }).map((_, i) => (
                      <span
                        key={i}
                        className={`w-2 h-2 rounded-full ${
                          i < currentLvl ? 'bg-amber-400' : 'bg-stone-700'
                        }`}
                      />
                    ))}
                  </div>
                  {curDef && (
                    <span className="text-[11px] font-mono tabular-nums text-stone-400 mt-1 text-right">
                      -{curDef.monthlyGoldUpkeep}g/mo
                    </span>
                  )}
                </div>
              </div>

              {/* Next Level Upgrade Bar */}
              {nextDef ? (
                <div className="mt-2.5 pt-2.5 border-t border-white/[0.07] flex items-center justify-between gap-2">
                  <div className="min-w-0 text-[11px] text-stone-300 space-y-0.5">
                    <div className="font-semibold text-amber-200/90 truncate">
                      Lv.{nextDef.level}: {nextDef.name}
                    </div>
                    <div className="text-[11px] text-stone-400 flex flex-wrap gap-x-1.5 gap-y-0.5 tabular-nums">
                      <span className={canAffordGold ? 'text-amber-300 font-mono' : 'text-rose-400 font-mono'}>
                        {nextDef.goldCost}g
                      </span>
                      {Object.entries(nextDef.commodityCosts).map(([k, v]) => (
                        <span key={k}>· {v} {k}</span>
                      ))}
                      <span>· -{nextDef.monthlyGoldUpkeep}g/mo</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => runSlotUpgrade(slot.id)}
                    disabled={!onUpdateWorld || !canMeetDevForNext}
                    className={`px-2.5 py-1.5 rounded-md text-[10px] font-semibold shrink-0 flex items-center gap-1 transition-colors ${
                      canMeetDevForNext
                        ? 'bg-amber-600/25 hover:bg-amber-600/40 text-amber-200 border border-amber-500/50 cursor-pointer'
                        : 'bg-stone-900 text-stone-500 border border-stone-800 cursor-not-allowed'
                    }`}
                  >
                    {canMeetDevForNext ? (
                      <>
                        <Coins className="w-3 h-3" />
                        {currentLvl === 0 ? 'Build' : 'Upgrade'}
                      </>
                    ) : (
                      <>
                        <Lock className="w-3 h-3" />
                        Dev {nextDef.minDev}
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="mt-1.5 pt-1.5 border-t border-stone-800/60 flex items-center gap-1 text-[10px] text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" /> Maximum Tier Constructed
                </div>
              )}
            </div>
          );
        })}
      </div>

      {maint.siegeDefensePct > 0 && (
        <div className="text-[10px] text-indigo-300/90 font-mono flex items-center gap-1.5 px-1">
          <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
          <span>Combined Fortification Siege Defense: +{maint.siegeDefensePct}%</span>
        </div>
      )}
    </div>
  );
};
