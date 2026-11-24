import React, { useEffect, useMemo, useState } from 'react';
import { ActiveWar, WarPeaceTerms } from '../types/warfare';
import { Holding, WorldState } from '../types/world';
import { HeraldryShield } from './HeraldryShield';
import { ClaimAndWarEngine } from '../engine/v17GrandStrategyEngine';
import { cloneWorldState } from '../utils/cloneWorldState';
import { Check, Scale, Shield, Swords, X } from 'lucide-react';

interface WarRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  war: ActiveWar | null;
  playerRealmId: string;
  world: WorldState;
  onApplyWorld: (next: WorldState) => void;
  onNotify: (msg: string) => void;
}

export const WarRoomModal: React.FC<WarRoomModalProps> = ({
  isOpen,
  onClose,
  war,
  playerRealmId,
  world,
  onApplyWorld,
  onNotify,
}) => {
  const [selectedHoldingIds, setSelectedHoldingIds] = useState<string[]>([]);
  const [wantReparations, setWantReparations] = useState(false);
  const [wantVassalize, setWantVassalize] = useState(false);

  useEffect(() => {
    if (isOpen && war) {
      setSelectedHoldingIds([]);
      setWantReparations(false);
      setWantVassalize(false);
    }
  }, [isOpen, war?.id]);

  const isBelligerent =
    Boolean(war) &&
    Boolean(playerRealmId) &&
    (war!.attackerRealmId === playerRealmId || war!.defenderRealmId === playerRealmId);
  const [observerSide, setObserverSide] = useState<'attacker' | 'defender'>('attacker');
  const isPlayerAttacker = war
    ? isBelligerent
      ? war.attackerRealmId === playerRealmId
      : observerSide === 'attacker'
    : true;
  const attackerRealm = war ? world.realms.find((r) => r.id === war.attackerRealmId) : undefined;
  const defenderRealm = war ? world.realms.find((r) => r.id === war.defenderRealmId) : undefined;
  const winnerRealm = isPlayerAttacker ? attackerRealm : defenderRealm;
  const loserRealm = isPlayerAttacker ? defenderRealm : attackerRealm;

  const rawScore = war?.warScore || 0;
  // Positive score relative to player's side means player has negotiating leverage
  const playerLeverage = isPlayerAttacker ? Math.round(rawScore) : Math.round(-rawScore);
  const budget = Math.max(0, playerLeverage);

  const claimableHoldings = useMemo(() => {
    if (!war || !loserRealm || !winnerRealm) return [];
    const results: Array<{
      holding: Holding;
      cost: number;
      isOccupiedByUs: boolean;
      isWarGoal: boolean;
    }> = [];

    for (const h of world.holdings || []) {
      const owner = world.characters.find((c) => c.id === h.ownerId);
      if (owner?.realmId !== loserRealm.id) continue;
      const isOccupiedByUs = h.occupiedByRealmId === winnerRealm.id;
      const isWarGoal = (war.targetHoldingIds || []).includes(h.id);
      const baseCost = isWarGoal ? 28 : 34;
      const cost = isOccupiedByUs ? Math.max(15, baseCost - 10) : baseCost;
      results.push({ holding: h, cost, isOccupiedByUs, isWarGoal });
    }

    return results
      .sort((a, b) => Number(b.isOccupiedByUs) - Number(a.isOccupiedByUs) || Number(b.isWarGoal) - Number(a.isWarGoal))
      .slice(0, 14);
  }, [war, world.holdings, world.characters, loserRealm, winnerRealm]);

  if (!isOpen || !war || !attackerRealm || !defenderRealm || !winnerRealm || !loserRealm) return null;

  const holdingCostSum = selectedHoldingIds.reduce((sum, hid) => {
    const item = claimableHoldings.find((c) => c.holding.id === hid);
    return sum + (item?.cost || 30);
  }, 0);
  const repCost = wantReparations ? 15 : 0;
  const vassalCost = wantVassalize ? 75 : 0;
  const totalDemandCost = holdingCostSum + repCost + vassalCost;
  const withinBudget = totalDemandCost <= budget;

  const toggleHolding = (hid: string) => {
    setSelectedHoldingIds((prev) =>
      prev.includes(hid) ? prev.filter((id) => id !== hid) : [...prev, hid]
    );
  };

  const handleSealTreaty = () => {
    if (!withinBudget && totalDemandCost > 0) return;

    const updated = cloneWorldState(world);
    const reparationsGold = wantReparations
      ? Math.min(350, Math.max(80, Math.round((budget * 4))))
      : 0;

    const terms: WarPeaceTerms = {
      winnerRealmId: winnerRealm.id,
      loserRealmId: loserRealm.id,
      cededHoldingIds: selectedHoldingIds,
      cededCountyIds: [],
      reparationsGold,
      vassalizeLoser: wantVassalize,
      totalDemandCost,
    };

    const res = ClaimAndWarEngine.negotiateCustomPeace(war.id, terms, updated);
    onApplyWorld(updated);
    onNotify(res.summary);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-stone-950 border border-stone-800 rounded-xl shadow-2xl text-stone-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-800 bg-stone-900/70">
          <div className="flex items-center gap-2.5">
            <Scale className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="font-serif text-base font-bold text-amber-200">
                Peace Conference · {war.casusBelli}
              </h2>
              <p className="text-[11px] text-stone-400 tabular-nums">
                {war.monthsActive} months fought · {war.battlesFought} pitched battles
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-stone-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Belligerents & Warscore Leverage */}
          <div className="p-4 rounded-lg bg-stone-900/60 border border-stone-800 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <HeraldryShield coatOfArms={attackerRealm.heraldry} seed={attackerRealm.id} size={32} />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-stone-100 truncate">
                    {attackerRealm.name}
                  </div>
                  <div className="text-[10px] text-stone-400">Aggressor</div>
                </div>
              </div>

              <div className="text-center shrink-0">
                <div className="text-xs font-mono font-bold tabular-nums text-amber-300">
                  {playerLeverage >= 0 ? `+${playerLeverage}% Leverage` : `${playerLeverage}% Disadvantage`}
                </div>
                <div className="text-[10px] text-stone-400 tabular-nums">
                  Budget: {budget} pts
                </div>
              </div>

              <div className="flex items-center gap-2.5 min-w-0 text-right">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-stone-100 truncate">
                    {defenderRealm.name}
                  </div>
                  <div className="text-[10px] text-stone-400">Defender</div>
                </div>
                <HeraldryShield coatOfArms={defenderRealm.heraldry} seed={defenderRealm.id} size={32} />
              </div>
            </div>
            {!isBelligerent && (
              <div className="pt-2 border-t border-stone-800/80 flex items-center justify-between gap-2 text-[11px]">
                <span className="text-stone-400">
                  Observer / Foreign Mediation — Choose victor side to broker terms:
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setObserverSide('attacker');
                      setSelectedHoldingIds([]);
                    }}
                    className={`px-2 py-0.5 rounded text-[11px] cursor-pointer ${
                      observerSide === 'attacker' ? 'bg-amber-600 text-stone-950 font-semibold' : 'bg-stone-800 text-stone-300'
                    }`}
                  >
                    {attackerRealm.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setObserverSide('defender');
                      setSelectedHoldingIds([]);
                    }}
                    className={`px-2 py-0.5 rounded text-[11px] cursor-pointer ${
                      observerSide === 'defender' ? 'bg-amber-600 text-stone-950 font-semibold' : 'bg-stone-800 text-stone-300'
                    }`}
                  >
                    {defenderRealm.name}
                  </button>
                </div>
              </div>
            )}
          </div>

          {budget <= 0 && (
            <div className="p-3 rounded-lg bg-stone-900 border border-stone-700 text-xs text-stone-300">
              Your realm lacks positive warscore leverage. Occupy enemy fortresses or win field battles before demanding concessions, or conclude a 0-cost White Peace.
            </div>
          )}

          {/* Territorial Cessions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wider font-semibold text-stone-400">
              <span>Territorial Cessions ({loserRealm.name})</span>
              <span className="tabular-nums text-amber-300">
                {selectedHoldingIds.length} Selected ({holdingCostSum} pts)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
              {claimableHoldings.map(({ holding, cost, isOccupiedByUs, isWarGoal }) => {
                const checked = selectedHoldingIds.includes(holding.id);
                return (
                  <button
                    key={holding.id}
                    type="button"
                    onClick={() => toggleHolding(holding.id)}
                    className={`p-2.5 rounded-lg border text-left transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                      checked
                        ? 'bg-amber-950/60 border-amber-500/70 text-amber-100'
                        : 'bg-stone-900/50 border-stone-800 hover:border-stone-700 text-stone-200'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{holding.name}</div>
                      <div className="text-[10px] text-stone-400 truncate">
                        {isOccupiedByUs ? 'Occupied' : holding.estateType}
                        {isWarGoal ? ' · War Goal' : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 font-mono text-[11px] tabular-nums">
                      <span className={checked ? 'text-amber-300' : 'text-stone-400'}>{cost} pts</span>
                      <span
                        className={`w-4 h-4 rounded flex items-center justify-center border ${
                          checked ? 'bg-amber-500 border-amber-400 text-stone-950' : 'border-stone-600'
                        }`}
                      >
                        {checked && <Check className="w-3 h-3" />}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sovereign Clauses */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setWantReparations((v) => !v)}
              className={`p-3 rounded-lg border text-left transition-colors flex items-center justify-between cursor-pointer ${
                wantReparations
                  ? 'bg-amber-950/60 border-amber-500/70'
                  : 'bg-stone-900/50 border-stone-800 hover:border-stone-700'
              }`}
            >
              <div>
                <div className="text-xs font-semibold text-stone-100">War Reparations</div>
                <div className="text-[10px] text-stone-400">Gold indemnity from loser treasury</div>
              </div>
              <span className="font-mono text-xs text-amber-300 tabular-nums">15 pts</span>
            </button>

            <button
              type="button"
              onClick={() => setWantVassalize((v) => !v)}
              className={`p-3 rounded-lg border text-left transition-colors flex items-center justify-between cursor-pointer ${
                wantVassalize
                  ? 'bg-amber-950/60 border-amber-500/70'
                  : 'bg-stone-900/50 border-stone-800 hover:border-stone-700'
              }`}
            >
              <div>
                <div className="text-xs font-semibold text-stone-100">Subjugate Rival Crown</div>
                <div className="text-[10px] text-stone-400">Swear fealty as tributary vassal</div>
              </div>
              <span className="font-mono text-xs text-amber-300 tabular-nums">75 pts</span>
            </button>
          </div>

          {/* Budget Summary & Seal Button */}
          <div className="p-4 rounded-lg bg-stone-900 border border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs tabular-nums">
              <span className="text-stone-400">Demand Cost: </span>
              <span className={`font-mono font-bold ${withinBudget ? 'text-emerald-400' : 'text-rose-400'}`}>
                {totalDemandCost} / {budget} pts
              </span>
              {!withinBudget && (
                <div className="text-[10px] text-rose-400 mt-0.5">
                  Demands exceed warscore leverage. Deselect clauses to proceed.
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSealTreaty}
                disabled={!withinBudget && totalDemandCost > 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-45 disabled:cursor-not-allowed text-stone-950 font-semibold text-xs transition-colors cursor-pointer"
              >
                {totalDemandCost === 0 ? <Shield className="w-3.5 h-3.5" /> : <Swords className="w-3.5 h-3.5" />}
                <span>{totalDemandCost === 0 ? 'Conclude White Peace' : 'Seal Peace Treaty'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
