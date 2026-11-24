import React, { useState } from 'react';
import { Swords, Coins, Shield } from 'lucide-react';
import type { Character, WorldState } from '../types/world';
import type { UnitCategory } from '../types/warfare';
import {
  REGIMENT_DEFINITIONS,
  MERCENARY_COMPANIES,
  getUnitRecruitmentCost,
  recruitNonLevyTroops,
  hireMercenaryCompany,
} from '../engine/warfareEngine';
import { cloneWorldState } from '../utils/cloneWorldState';

interface UnitRecruitmentPanelProps {
  ruler: Character;
  world: WorldState;
  onUpdateWorld?: (next: WorldState) => void;
}

const NON_LEVY_CATEGORIES: Array<Exclude<UnitCategory, 'Levy'>> = [
  'Spear',
  'Ranged',
  'Infantry',
  'Cavalry',
  'Siege',
  'CulturalSpecial',
];

export const UnitRecruitmentPanel: React.FC<UnitRecruitmentPanelProps> = ({
  ruler,
  world,
  onUpdateWorld,
}) => {
  const [batchSize, setBatchSize] = useState<number>(100);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const rulerRealm = world.realms?.find(
    (r) => r.id === ruler.realmId || r.rulerId === ruler.id
  );
  const treasury = Math.max(0, rulerRealm ? (rulerRealm.treasury ?? 0) : (ruler.treasury || 0));

  const handleRecruit = (cat: Exclude<UnitCategory, 'Levy'>) => {
    if (!onUpdateWorld) return;
    const next = cloneWorldState(world);
    const res = recruitNonLevyTroops(ruler.id, cat, batchSize, next);
    setNotice({ ok: res.success, text: res.message });
    if (res.success) {
      onUpdateWorld(next);
    }
  };

  const handleHireMercenary = (companyId: (typeof MERCENARY_COMPANIES)[number]['id']) => {
    if (!onUpdateWorld) return;
    const next = cloneWorldState(world);
    const res = hireMercenaryCompany(ruler.id, companyId, next);
    setNotice({ ok: res.success, text: res.message });
    if (res.success) {
      onUpdateWorld(next);
    }
  };

  return (
    <div className="rounded-xl bg-stone-900/65 border border-white/[0.08] p-3.5 space-y-3 mt-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Swords className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-xs font-bold text-stone-100 uppercase tracking-wide">
            Raise Professional Troops
          </span>
        </div>
        <div className="flex items-center gap-1 bg-stone-950 rounded-lg p-0.5 border border-white/[0.08] shrink-0">
          {[100, 200, 500].map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => setBatchSize(size)}
              className={`px-2 py-0.5 rounded-md text-[11px] font-mono tabular-nums cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                batchSize === size
                  ? 'bg-amber-600/25 text-amber-200'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              +{size}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-stone-400 font-mono tabular-nums">
        <span>Standing Men-at-Arms: {(ruler.menAtArms || 0).toLocaleString()}</span>
        <span className="text-amber-300">
          {rulerRealm ? 'Crown Fisc' : 'Privy Purse'}: {Math.round(treasury).toLocaleString()}g
        </span>
      </div>

      {notice && (
        <div
          className={`px-2.5 py-1.5 rounded-lg text-[11px] border ${
            notice.ok
              ? 'bg-emerald-950/60 border-emerald-700/50 text-emerald-200'
              : 'bg-rose-950/60 border-rose-700/50 text-rose-200'
          }`}
        >
          {notice.text}
        </div>
      )}

      <div className="divide-y divide-white/[0.06] border-t border-white/[0.07]">
        {NON_LEVY_CATEGORIES.map((cat) => {
          const def = REGIMENT_DEFINITIONS[cat];
          const cost = getUnitRecruitmentCost(cat, batchSize);
          const canAfford = treasury >= cost.goldCost;

          return (
            <div
              key={cat}
              className="py-2.5 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <Shield className="w-3 h-3 text-amber-400/80 shrink-0" />
                  <span className="text-xs font-semibold text-stone-100">{cat}</span>
                  <span className="text-[11px] font-mono tabular-nums text-stone-400">
                    ATK {def.baseAttack} · DEF {def.baseDefense}
                  </span>
                </div>
                <div className="text-[11px] text-stone-400 font-mono tabular-nums mt-0.5">
                  {cost.per100Gold}g / 100 men · Upkeep {cost.per100Upkeep}g/mo per 100
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleRecruit(cat)}
                disabled={!onUpdateWorld || !canAfford}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-mono tabular-nums font-semibold shrink-0 flex items-center gap-1 transition-colors whitespace-nowrap ${
                  canAfford
                    ? 'bg-amber-600/20 hover:bg-amber-600/35 text-amber-200 border border-amber-500/45 cursor-pointer'
                    : 'bg-stone-900 text-stone-500 border border-white/[0.06] cursor-not-allowed'
                }`}
              >
                <Coins className="w-3 h-3 shrink-0" />
                +{batchSize} ({cost.goldCost}g)
              </button>
            </div>
          );
        })}
      </div>

      {/* Hireable Free Mercenary Companies */}
      <div className="pt-2 border-t border-white/[0.08] space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-stone-300">
          Charter Mercenary Companies
        </div>
        <div className="divide-y divide-white/[0.06]">
          {MERCENARY_COMPANIES.map((merc) => {
            const canAfford = treasury >= merc.goldCost;
            return (
              <div key={merc.id} className="py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-stone-100 truncate">
                    {merc.name} (+{merc.troops} {merc.category})
                  </div>
                  <div className="text-[10px] text-stone-400 truncate">
                    {merc.monthlyUpkeepNote} · {merc.description}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleHireMercenary(merc.id)}
                  disabled={!onUpdateWorld || !canAfford}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-mono tabular-nums font-semibold shrink-0 flex items-center gap-1 whitespace-nowrap ${
                    canAfford
                      ? 'bg-rose-900/45 hover:bg-rose-800/60 text-rose-100 border border-rose-500/45 cursor-pointer'
                      : 'bg-stone-900 text-stone-500 border border-white/[0.06] cursor-not-allowed'
                  }`}
                >
                  <Coins className="w-3 h-3 shrink-0" />
                  Hire ({merc.goldCost}g)
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
