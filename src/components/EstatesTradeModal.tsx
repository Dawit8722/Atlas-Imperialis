import React, { useState, useMemo } from 'react';
import { WorldState, Realm, EstateKind, TradeNodePolicy } from '../types/world';
import {
  TradeNodeEngine,
  EstatesEngine,
  ESTATE_PRIVILEGES,
  AggressiveExpansionEngine,
} from '../engine/grandStatecraftEngine';
import { cloneWorldState } from '../utils/cloneWorldState';
import { X, Scale, Anchor, Coins, Users, ShieldAlert } from 'lucide-react';

interface EstatesTradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  world: WorldState;
  realm: Realm;
  onUpdateWorld: (next: WorldState) => void;
}

export const EstatesTradeModal: React.FC<EstatesTradeModalProps> = ({
  isOpen,
  onClose,
  world,
  realm,
  onUpdateWorld,
}) => {
  const [tab, setTab] = useState<'estates' | 'trade' | 'coalitions'>('estates');
  const [feedback, setFeedback] = useState<string | null>(null);

  const tradeNodes = useMemo(
    () => TradeNodeEngine.ensureTradeNodesInitialized(cloneWorldState(world)),
    [world]
  );
  const estatesState = useMemo(() => {
    const map = EstatesEngine.ensureEstatesInitialized(cloneWorldState(world));
    return map[realm.id];
  }, [world, realm.id]);

  if (!isOpen) return null;

  const isForeignRealm =
    world.appMode !== 'builder' &&
    world.playerRealmId !== null &&
    Boolean(world.playerRealmId) &&
    realm.id !== world.playerRealmId;

  const notify = (msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), 4000);
  };

  const handleSeizeCrownLand = () => {
    if (isForeignRealm) return;
    const updated = cloneWorldState(world);
    const res = EstatesEngine.seizeCrownLand(realm.id, updated);
    onUpdateWorld(updated);
    notify(res.summary);
  };

  const handleCallDiet = (kind: EstateKind) => {
    if (isForeignRealm) return;
    const updated = cloneWorldState(world);
    const res = EstatesEngine.callDiet(realm.id, kind, updated);
    onUpdateWorld(updated);
    notify(res.summary);
  };

  const handleTogglePrivilege = (privilegeId: string, isGranted: boolean) => {
    if (isForeignRealm) return;
    const updated = cloneWorldState(world);
    const res = isGranted
      ? EstatesEngine.revokePrivilege(realm.id, privilegeId, updated)
      : EstatesEngine.grantPrivilege(realm.id, privilegeId, updated);
    onUpdateWorld(updated);
    notify(res.summary);
  };

  const handleTradePolicy = (nodeId: string, policy: TradeNodePolicy) => {
    if (isForeignRealm) return;
    const updated = cloneWorldState(world);
    const res = TradeNodeEngine.setRealmTradePolicy(nodeId, realm.id, policy, updated);
    onUpdateWorld(updated);
    notify(res.summary);
  };

  const aeAgainstUs = (world.realms || [])
    .filter((r) => r.id !== realm.id)
    .map((r) => ({
      other: r,
      ae: AggressiveExpansionEngine.getAEBetween(r.id, realm.id, world),
    }))
    .sort((a, b) => b.ae - a.ae);

  const activeCoalition = (world.coalitions || []).find((c) => c.targetRealmId === realm.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none">
      <div className="w-full max-w-3xl max-h-[86vh] flex flex-col bg-stone-950 border border-stone-800 rounded-xl shadow-2xl overflow-hidden text-stone-100">
        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-800 flex items-center justify-between bg-stone-900/60">
          <div>
            <h2 className="text-base font-serif font-bold text-amber-200">
              {realm.name} — Estates, Trade Basins & Expansion
            </h2>
            <p className="text-xs text-stone-400">
              Crown Land balance, regional Trade Node steering, and diplomatic Aggressive Expansion
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Subtabs */}
        <div className="px-5 py-2.5 border-b border-stone-800 flex items-center justify-between gap-3 bg-stone-950">
          <div className="flex items-center gap-1 p-1 bg-stone-900 rounded-lg">
            <button
              type="button"
              onClick={() => setTab('estates')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer flex items-center gap-1.5 ${
                tab === 'estates' ? 'bg-amber-600 text-white' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
              <span>Estates & Diet</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('trade')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer flex items-center gap-1.5 ${
                tab === 'trade' ? 'bg-amber-600 text-white' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <Anchor className="w-3.5 h-3.5" />
              <span>Trade Node DAG</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('coalitions')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer flex items-center gap-1.5 ${
                tab === 'coalitions' ? 'bg-amber-600 text-white' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Expansion & Coalitions</span>
            </button>
          </div>

          {feedback && (
            <span className="text-xs text-amber-300 font-medium truncate max-w-xs">{feedback}</span>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {isForeignRealm && (
            <div className="p-3 rounded-lg bg-stone-900 border border-amber-700/40 text-xs text-amber-200/90">
              Inspecting {realm.name}. Switch Playing As in the top bar (or use Observer mode) to decree estates and trade policies for this crown.
            </div>
          )}
          {tab === 'estates' && estatesState && (
            <>
              {/* Crown Land Bar & Global Actions */}
              <div className="p-4 rounded-lg bg-stone-900 border border-stone-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-stone-400">Crown Land Ownership</div>
                    <div className="text-2xl font-bold font-mono tabular-nums text-amber-300">
                      {estatesState.crownLand.toFixed(1)}%
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isForeignRealm}
                      onClick={handleSeizeCrownLand}
                      className="px-4 py-2 rounded-lg bg-rose-800 hover:bg-rose-700 disabled:opacity-45 disabled:cursor-not-allowed text-white text-xs font-semibold cursor-pointer"
                    >
                      Seize Crown Land (+5%)
                    </button>
                  </div>
                </div>
                <div className="w-full h-2.5 bg-stone-950 rounded-sm overflow-hidden flex">
                  <div
                    className="bg-amber-500 h-full"
                    style={{ width: `${estatesState.crownLand}%` }}
                    title={`Crown Land ${estatesState.crownLand}%`}
                  />
                  <div
                    className="bg-rose-500 h-full"
                    style={{ width: `${estatesState.estates.Nobility.landShare}%` }}
                    title={`Nobility ${estatesState.estates.Nobility.landShare}%`}
                  />
                  <div
                    className="bg-sky-500 h-full"
                    style={{ width: `${estatesState.estates.Clergy.landShare}%` }}
                    title={`Clergy ${estatesState.estates.Clergy.landShare}%`}
                  />
                  <div
                    className="bg-emerald-500 h-full"
                    style={{ width: `${estatesState.estates.Burghers.landShare}%` }}
                    title={`Burghers ${estatesState.estates.Burghers.landShare}%`}
                  />
                </div>
                <div className="text-[11px] text-stone-400 flex flex-wrap gap-3 tabular-nums">
                  <span>Crown {estatesState.crownLand.toFixed(1)}%</span>
                  <span aria-hidden="true">·</span>
                  <span>Nobility {estatesState.estates.Nobility.landShare.toFixed(1)}%</span>
                  <span aria-hidden="true">·</span>
                  <span>Clergy {estatesState.estates.Clergy.landShare.toFixed(1)}%</span>
                  <span aria-hidden="true">·</span>
                  <span>Burghers {estatesState.estates.Burghers.landShare.toFixed(1)}%</span>
                </div>
              </div>

              {/* Active Diet Agenda */}
              {estatesState.activeDiet && (
                <div className="p-3.5 rounded-lg bg-stone-900 border border-stone-800 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-amber-200">
                      {estatesState.activeDiet.estate} Diet Mandate: {estatesState.activeDiet.title}
                    </div>
                    <div className="text-xs text-stone-400 mt-0.5">
                      {estatesState.activeDiet.description}
                    </div>
                  </div>
                  <div className="text-xs font-mono tabular-nums text-stone-300 shrink-0 ml-4">
                    {estatesState.activeDiet.completed ? 'Fulfilled' : `Due Yr ${estatesState.activeDiet.expiresYear}`}
                  </div>
                </div>
              )}

              {/* Three Estate Columns */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(['Nobility', 'Clergy', 'Burghers'] as EstateKind[]).map((kind) => {
                  const est = estatesState.estates[kind];
                  const privileges = ESTATE_PRIVILEGES.filter((p) => p.estate === kind);
                  return (
                    <div
                      key={kind}
                      className="p-4 rounded-lg bg-stone-900 border border-stone-800 space-y-3 flex flex-col justify-between"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-sm text-stone-100 flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-amber-400" />
                            <span>{kind}</span>
                          </h3>
                          <button
                            type="button"
                            onClick={() => handleCallDiet(kind)}
                            className="px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-xs text-amber-300 cursor-pointer"
                          >
                            Call Diet
                          </button>
                        </div>

                        <div className="text-xs text-stone-400 flex items-center gap-2 font-mono tabular-nums">
                          <span className={est.loyalty < 30 ? 'text-rose-400 font-semibold' : 'text-emerald-300'}>
                            Loyalty {Math.round(est.loyalty)}%
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>Influence {Math.round(est.influence)}%</span>
                          <span aria-hidden="true">·</span>
                          <span>Land {est.landShare.toFixed(0)}%</span>
                        </div>
                        {est.loyalty < 30 && (
                          <p className="text-[11px] text-rose-400">
                            Loyalty critically low; seizing further land risks armed revolt.
                          </p>
                        )}
                      </div>

                      <div className="space-y-2 pt-2 border-t border-stone-800">
                        {privileges.map((priv) => {
                          const isGranted = est.grantedPrivilegeIds.includes(priv.id);
                          return (
                            <div key={priv.id} className="space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium text-stone-200">{priv.name}</span>
                                <button
                                  type="button"
                                  onClick={() => handleTogglePrivilege(priv.id, isGranted)}
                                  className={`px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer shrink-0 ${
                                    isGranted
                                      ? 'bg-emerald-800/70 hover:bg-emerald-700 text-emerald-100'
                                      : 'bg-stone-800 hover:bg-stone-700 text-stone-200'
                                  }`}
                                >
                                  {isGranted ? 'Revoke' : 'Grant'}
                                </button>
                              </div>
                              <p className="text-[11px] text-stone-400 leading-snug">{priv.description}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {tab === 'trade' && (
            <div className="space-y-3">
              <div className="text-xs text-stone-400">
                Merchants steer wealth downstream through topologically sorted trade basins or collect locally into the royal coffers.
              </div>
              {tradeNodes.map((node) => {
                const myShare = node.shares.find((s) => s.realmId === realm.id);
                const downstreamNames = node.downstreamNodeIds
                  .map((id) => tradeNodes.find((n) => n.id === id)?.name)
                  .filter(Boolean);

                return (
                  <div
                    key={node.id}
                    className="p-4 rounded-lg bg-stone-900 border border-stone-800 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-sm text-amber-200 flex items-center gap-1.5">
                          <Coins className="w-3.5 h-3.5 text-amber-400" />
                          <span>{node.name}</span>
                        </h3>
                        <div className="text-xs text-stone-400 font-mono tabular-nums mt-0.5">
                          Local {node.localValue.toFixed(1)}g · Incoming {node.incomingValue.toFixed(1)}g · Pool {node.totalValue.toFixed(1)}g
                          {downstreamNames.length > 0 && ` -> Feeds ${downstreamNames.join(', ')}`}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 bg-stone-950 p-1 rounded-lg">
                        <button
                          type="button"
                          onClick={() => handleTradePolicy(node.id, 'Collect')}
                          className={`px-3 py-1 rounded text-xs font-medium cursor-pointer ${
                            (myShare?.policy || 'Collect') === 'Collect'
                              ? 'bg-emerald-700 text-white'
                              : 'text-stone-400 hover:text-stone-200'
                          }`}
                        >
                          Collect
                        </button>
                        {node.downstreamNodeIds.length > 0 && (
                          <button
                            type="button"
                            onClick={() => handleTradePolicy(node.id, 'Steer')}
                            className={`px-3 py-1 rounded text-xs font-medium cursor-pointer ${
                              myShare?.policy === 'Steer'
                                ? 'bg-sky-700 text-white'
                                : 'text-stone-400 hover:text-stone-200'
                            }`}
                          >
                            Steer
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1 pt-2 border-t border-stone-800 text-xs">
                      {node.shares.slice(0, 4).map((sh) => (
                        <div key={sh.realmId} className="flex items-center justify-between font-mono tabular-nums">
                          <span className={sh.realmId === realm.id ? 'text-amber-300 font-semibold' : 'text-stone-300'}>
                            {sh.realmName} ({sh.policy})
                          </span>
                          <span className="text-stone-400">
                            {sh.sharePct.toFixed(1)}% share · {sh.policy === 'Collect' ? `+${sh.collectedGold.toFixed(1)}g` : `-> ${sh.steeredGold.toFixed(1)}g`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'coalitions' && (
            <div className="space-y-4">
              {activeCoalition ? (
                <div className="p-4 rounded-lg bg-rose-950/50 border border-rose-800 space-y-1">
                  <div className="text-sm font-semibold text-rose-200">
                    Active Defensive Coalition Formed (Year {activeCoalition.formedYear})
                  </div>
                  <p className="text-xs text-stone-300">
                    Coalition Members:{' '}
                    {activeCoalition.memberRealmIds
                      .map((id) => world.realms.find((r) => r.id === id)?.name || id)
                      .join(', ')}
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-stone-900 border border-stone-800 text-xs text-stone-300">
                  No active punitive Coalition currently targets {realm.name}. Keep Aggressive Expansion below 50 among neighboring crowns.
                </div>
              )}

              <div className="space-y-2">
                {aeAgainstUs.map(({ other, ae }) => (
                  <div
                    key={other.id}
                    className="p-3 rounded-lg bg-stone-900 border border-stone-800 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-sm font-medium text-stone-100">{other.name}</div>
                      <div className="text-xs text-stone-400">
                        {ae >= 50 ? 'Outraged — Coalition Candidate' : ae >= 25 ? 'Wary of Expansion' : 'Calm'}
                      </div>
                    </div>
                    <div className={`text-sm font-mono tabular-nums font-bold ${ae >= 50 ? 'text-rose-400' : 'text-stone-300'}`}>
                      {ae.toFixed(1)} AE
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
