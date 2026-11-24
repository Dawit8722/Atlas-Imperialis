import React, { useMemo, useState } from 'react';
import {
  Coins,
  TrendingDown,
  TrendingUp,
  Landmark,
  Scale,
  Wheat,
  Pickaxe,
  Gem,
  AlertTriangle,
  Users,
  ShieldAlert,
} from 'lucide-react';
import { WorldState, Burg, Realm, Character } from '../types/world';
import { SocialStratum } from '../types/economy';
import {
  debaseCurrency,
  takeBankLoan,
  ensureEconomy,
  calculateFiscalProfile,
  getDefaultVaultCap,
  disburseTreasuryAction,
} from '../engine/economyEngine';
import { cloneWorldState } from '../utils/cloneWorldState';

interface FlowEconomyPanelsProps {
  world: WorldState;
  selectedBurg?: Burg;
  selectedRealm?: Realm;
  selectedCharacter?: Character;
  onSelectBurg?: (burg: Burg) => void;
  onUpdateWorld?: (newWorld: WorldState) => void;
}

export function FlowEconomyPanels({
  world,
  selectedBurg,
  selectedRealm,
  selectedCharacter,
  onSelectBurg,
  onUpdateWorld,
}: FlowEconomyPanelsProps) {
  const [activeSubTab, setActiveSubTab] = useState<'treasury' | 'market' | 'strata'>('treasury');
  const [realmOverrideId, setRealmOverrideId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  React.useEffect(() => {
    if (selectedRealm?.id) {
      setRealmOverrideId(null);
    }
  }, [selectedRealm?.id]);

  const economy = useMemo(() => ensureEconomy(world), [world]);

  const playerRealm = world.playerRealmId
    ? world.realms.find((r) => r.id === world.playerRealmId)
    : undefined;
  const activeRealm =
    (realmOverrideId ? world.realms.find((r) => r.id === realmOverrideId) : undefined) ||
    selectedRealm ||
    (selectedBurg ? world.realms.find((r) => r.id === selectedBurg.stateId) : undefined) ||
    playerRealm ||
    world.realms[0];
  const livingChars = useMemo(() => (world.characters || []).filter((c) => c.isAlive !== false), [world.characters]);
  const activeChar =
    (!realmOverrideId && selectedCharacter && selectedCharacter.isAlive !== false && (!activeRealm || selectedCharacter.realmId === activeRealm.id)
      ? selectedCharacter
      : undefined) ||
    livingChars.find((c) => c.id === activeRealm?.rulerId) ||
    livingChars.find((c) => c.realmId === activeRealm?.id) ||
    livingChars.find((c) => c.id === world.monarchId) ||
    livingChars[0];
  const fiscalProfile = useMemo(() => {
    if (!activeChar) return undefined;
    return economy.fiscalProfiles?.[activeChar.id] || calculateFiscalProfile(activeChar, world, economy);
  }, [activeChar, economy, world]);

  const executeAction = (actionFn: (w: WorldState) => { success: boolean; message: string }) => {
    if (!onUpdateWorld) return;
    const newWorld = cloneWorldState(world);
    const result = actionFn(newWorld);
    if (result.success) {
      setNotice({ type: 'ok', text: result.message });
      onUpdateWorld(newWorld);
    } else {
      setNotice({ type: 'err', text: result.message });
    }
  };

  if (world.realms.length === 0 || (!activeRealm && !activeChar)) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-stone-900/95 p-6 text-center text-stone-400 space-y-2">
        <Scale className="w-8 h-8 text-amber-500/60" />
        <div className="text-sm font-cinzel font-bold text-amber-200">No Markets Founded</div>
        <p className="text-xs text-stone-400 max-w-xs">
          Auto-populate terrain or found settlements in World Builder to establish commodity markets, guilds, and royal mints.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-stone-950 text-stone-200">
      {/* ================= HEADER & SUB-TABS ================= */}
      <div className="border-b border-white/[0.08] bg-stone-950/80 p-4 pb-0">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-serif text-base font-bold text-amber-200">
            <Scale className="h-4 w-4 text-amber-400" /> Bourse & Living Economy
          </h2>
          {world.realms.length > 1 && activeRealm && (
            <select
              aria-label="Inspect Realm Economy"
              value={activeRealm.id}
              onChange={(e) => {
                setRealmOverrideId(e.target.value);
                const rBurg = world.burgs?.find((b) => b.stateId === e.target.value && b.isCapital) || world.burgs?.find((b) => b.stateId === e.target.value);
                if (rBurg && onSelectBurg) onSelectBurg(rBurg);
              }}
              className="rounded-md border border-white/[0.08] bg-stone-900 px-2 py-1 text-xs text-amber-200 max-w-[150px] truncate cursor-pointer focus:outline-none focus:border-amber-500"
            >
              {world.realms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex gap-5 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveSubTab('treasury')}
            className={`pb-2.5 text-xs font-semibold uppercase tracking-wider transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
              activeSubTab === 'treasury' ? 'border-amber-400 text-amber-200' : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            Crown Ledger
          </button>
          <button
            onClick={() => setActiveSubTab('market')}
            className={`pb-2.5 text-xs font-semibold uppercase tracking-wider transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
              activeSubTab === 'market' ? 'border-amber-400 text-amber-200' : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            Local Market
          </button>
          <button
            onClick={() => setActiveSubTab('strata')}
            className={`pb-2.5 text-xs font-semibold uppercase tracking-wider transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
              activeSubTab === 'strata' ? 'border-amber-400 text-amber-200' : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            Social Classes & Wages
          </button>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {notice && (
          <div
            className={`rounded-md border p-2.5 text-xs flex items-start justify-between gap-2 ${
              notice.type === 'ok'
                ? 'border-emerald-800/50 bg-emerald-950/35 text-emerald-200'
                : 'border-red-800/50 bg-red-950/35 text-red-200'
            }`}
          >
            <span>{notice.text}</span>
            <button
              onClick={() => setNotice(null)}
              className="text-[11px] uppercase font-semibold opacity-70 hover:opacity-100 cursor-pointer shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ================= TAB 1: CROWN LEDGER & BANKING ================= */}
        {activeSubTab === 'treasury' && fiscalProfile && activeChar && (
          <>
            <div className="rounded-lg border border-white/[0.08] bg-stone-900/45 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 block">Crown Fisc (State Purse)</span>
                  <span className="text-[11px] font-mono tabular-nums text-stone-400">
                    Monarch Privy Purse: {Math.floor(activeChar.treasury || 0).toLocaleString()}g
                  </span>
                </div>
                <span className="font-mono tabular-nums text-2xl font-bold text-amber-300">
                  {Math.floor(activeRealm?.treasury ?? activeChar.treasury ?? 0).toLocaleString()} <span className="text-sm text-stone-400">g</span>
                </span>
              </div>
              {activeRealm?.budget?.lastReport && (
                <div className="mb-3 grid grid-cols-2 sm:grid-cols-4 gap-1.5 border-t border-stone-800 pt-2.5 text-[10px] font-mono tabular-nums">
                  <div className="text-stone-400">
                    Domain: <span className="text-emerald-400">+{activeRealm.budget.lastReport.domainTax.toFixed(1)}g</span>
                  </div>
                  <div className="text-stone-400">
                    Tariffs: <span className="text-emerald-400">+{activeRealm.budget.lastReport.customsTariffs.toFixed(1)}g</span>
                  </div>
                  <div className="text-stone-400">
                    Minting: <span className="text-emerald-400">+{activeRealm.budget.lastReport.mintingIncome.toFixed(1)}g</span>
                  </div>
                  <div className="text-stone-400">
                    Net: <span className={activeRealm.budget.lastReport.netBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {activeRealm.budget.lastReport.netBalance >= 0 ? '+' : ''}{activeRealm.budget.lastReport.netBalance.toFixed(1)}g
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 border-t border-stone-800 pt-4">
                <div>
                  <div className="mb-2 text-[10px] font-bold uppercase text-emerald-500/80">
                    Monthly Revenue (+{fiscalProfile.totalRevenue})
                  </div>
                  <div className="space-y-1 text-xs text-stone-400">
                    <div className="flex justify-between">
                      <span>Demesne</span>
                      <span className="font-mono text-emerald-400">+{fiscalProfile.demesneIncome}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Vassals</span>
                      <span className="font-mono text-emerald-400">+{fiscalProfile.vassalTribute}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Tariffs</span>
                      <span className="font-mono text-emerald-400">+{fiscalProfile.tariffIncome}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-[10px] font-bold uppercase text-red-500/80">
                    Monthly Expenses (-{fiscalProfile.totalExpenses})
                  </div>
                  <div className="space-y-1 text-xs text-stone-400">
                    <div className="flex justify-between">
                      <span>Retinue &amp; Knights</span>
                      <span className="font-mono text-red-400">-{fiscalProfile.armyUpkeep}</span>
                    </div>
                    {(fiscalProfile.navalTransportUpkeep ?? 0) > 0 && (
                      <div className="flex justify-between text-sky-300">
                        <span>Naval Transport</span>
                        <span className="font-mono text-red-400">-{fiscalProfile.navalTransportUpkeep}</span>
                      </div>
                    )}
                    <div className="flex justify-between" title="Great Hall meals, silks, furs, wool liveries, hospitality & staff wages">
                      <span>Great Hall &amp; Liveries</span>
                      <span className="font-mono text-red-400">-{fiscalProfile.courtSplendorCost}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Castles &amp; Manor Repairs</span>
                      <span className="font-mono text-red-400">-{fiscalProfile.estateMaintenance ?? 0}</span>
                    </div>
                    {(fiscalProfile.estateAdministration ?? 0) > 0 && (
                      <div className="flex justify-between" title="Stewards, bailiffs, reeves & legal disputes">
                        <span>Stewards &amp; Bailiffs</span>
                        <span className="font-mono text-red-400">-{fiscalProfile.estateAdministration}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Household &amp; Kin</span>
                      <span className="font-mono text-red-400">-{fiscalProfile.householdUpkeep ?? 0}</span>
                    </div>
                    {(fiscalProfile.youngerSonsAndDowries ?? 0) > 0 && (
                      <div className="flex justify-between">
                        <span>Younger Sons &amp; Dowries</span>
                        <span className="font-mono text-red-400">-{fiscalProfile.youngerSonsAndDowries}</span>
                      </div>
                    )}
                    {(fiscalProfile.religiousPatronage ?? 0) > 0 && (
                      <div className="flex justify-between">
                        <span>Chantries &amp; Abbeys</span>
                        <span className="font-mono text-red-400">-{fiscalProfile.religiousPatronage}</span>
                      </div>
                    )}
                    {(fiscalProfile.tournamentAndPageantry ?? 0) > 0 && (
                      <div className="flex justify-between">
                        <span>Tournaments &amp; Arms</span>
                        <span className="font-mono text-red-400">-{fiscalProfile.tournamentAndPageantry}</span>
                      </div>
                    )}
                    {fiscalProfile.austerityTier && fiscalProfile.austerityTier !== 'none' && (
                      <div className="flex justify-between text-amber-300">
                        <span>Auto-Austerity</span>
                        <span className="font-mono uppercase">{fiscalProfile.austerityTier}</span>
                      </div>
                    )}
                    {(fiscalProfile.seasonalShockExpense ?? 0) > 0 && (
                      <div className="flex justify-between" title={fiscalProfile.seasonalExpenseLabel}>
                        <span className="truncate pr-1 text-amber-300/90">
                          {fiscalProfile.seasonalExpenseLabel || 'Seasonal Outlay'}
                        </span>
                        <span className="font-mono text-red-400 shrink-0">-{fiscalProfile.seasonalShockExpense}</span>
                      </div>
                    )}
                    {(fiscalProfile.vaultHoardingDrag ?? 0) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-orange-300">Vault Hoarding Drag</span>
                        <span className="font-mono text-orange-400">-{fiscalProfile.vaultHoardingDrag}</span>
                      </div>
                    )}
                    {fiscalProfile.debtServicing > 0 && (
                      <div className="flex justify-between">
                        <span>Debt Service</span>
                        <span className="font-mono text-red-400">-{fiscalProfile.debtServicing}</span>
                      </div>
                    )}
                    {(fiscalProfile.tributeOwedToLiege ?? 0) > 0 && (
                      <div className="flex justify-between">
                        <span>Liege Feudal Dues</span>
                        <span className="font-mono text-red-400">-{fiscalProfile.tributeOwedToLiege}</span>
                      </div>
                    )}
                    {(fiscalProfile.scutageAndAidsExpense ?? 0) > 0 && (
                      <div className="flex justify-between" title="Wartime Scutage (shield money) & attending liege court">
                        <span>Scutage &amp; Court Dues</span>
                        <span className="font-mono text-red-400">-{fiscalProfile.scutageAndAidsExpense}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div
                className={`mt-4 rounded-lg p-2 text-center text-sm font-bold ${
                  fiscalProfile.netMonthlyCashflow >= 0
                    ? 'bg-emerald-950/30 text-emerald-400'
                    : 'bg-red-950/30 text-red-400'
                }`}
              >
                Net Cashflow: {fiscalProfile.netMonthlyCashflow > 0 ? '+' : ''}
                {fiscalProfile.netMonthlyCashflow}g / mo
                {fiscalProfile.netMonthlyCashflow < 0 ? ' (Treasury Declining)' : ''}
              </div>

              {/* VAULT CAP, FISCAL STANCE & TREASURY MANAGEMENT CONTROLS */}
              {(() => {
                const cap = activeChar.treasuryCap ?? fiscalProfile.vaultCap ?? getDefaultVaultCap(activeChar);
                const reserves = Math.max(0, activeChar.treasury || 0);
                const fillPct = Math.min(100, Math.round((reserves / Math.max(1, cap)) * 100));
                const currentStance = activeChar.fiscalStance || 'Balanced';
                const autoReinvest = activeChar.autoReinvestSurplus !== false;

                return (
                  <div className="mt-4 pt-3 border-t border-white/[0.08] space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] uppercase font-semibold tracking-wider text-amber-400">
                        Vault Cap &amp; Spending Policy
                      </span>
                      <span className="font-mono tabular-nums text-[11px] text-stone-300">
                        {Math.round(reserves).toLocaleString()}g / {cap.toLocaleString()}g ({fillPct}%)
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-stone-900 overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          fillPct >= 95 ? 'bg-orange-500' : fillPct >= 65 ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${fillPct}%` }}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      {(['Austerity', 'Balanced', 'Lavish'] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => {
                            const updated = cloneWorldState(world);
                            const ch = updated.characters.find((c) => c.id === activeChar.id);
                            if (!ch) return;
                            ch.fiscalStance = st;
                            if (updated.economy?.fiscalProfiles) {
                              updated.economy.fiscalProfiles[ch.id] = calculateFiscalProfile(ch, updated, updated.economy);
                            }
                            onUpdateWorld?.(updated);
                          }}
                          className={`py-1.5 rounded-md border text-[11px] font-semibold cursor-pointer ${
                            currentStance === st
                              ? 'bg-amber-600/25 border-amber-500/60 text-amber-200'
                              : 'bg-stone-900 border-white/[0.08] text-stone-400 hover:text-stone-200'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <label className="text-stone-400 shrink-0">Reserve Ceiling:</label>
                      <select
                        value={cap}
                        onChange={(e) => {
                          const newCap = Number(e.target.value);
                          const updated = cloneWorldState(world);
                          const ch = updated.characters.find((c) => c.id === activeChar.id);
                          if (!ch) return;
                          ch.treasuryCap = newCap;
                          if (updated.economy?.fiscalProfiles) {
                            updated.economy.fiscalProfiles[ch.id] = calculateFiscalProfile(ch, updated, updated.economy);
                          }
                          onUpdateWorld?.(updated);
                        }}
                        className="px-2 py-1 rounded-md bg-stone-900 border border-white/[0.08] text-stone-200 font-mono tabular-nums text-[11px]"
                      >
                        {[450, 850, 1200, 1600, 2400, 3200, 5000].map((v) => (
                          <option key={v} value={v}>{v.toLocaleString()}g</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = cloneWorldState(world);
                          const ch = updated.characters.find((c) => c.id === activeChar.id);
                          if (!ch) return;
                          ch.autoReinvestSurplus = !autoReinvest;
                          onUpdateWorld?.(updated);
                        }}
                        className={`px-2.5 py-1 rounded-md border text-[11px] font-medium cursor-pointer ${
                          autoReinvest
                            ? 'bg-emerald-950/50 border-emerald-700/50 text-emerald-300'
                            : 'bg-stone-900 border-white/[0.08] text-stone-400'
                        }`}
                      >
                        {autoReinvest ? 'Auto-Reinvest' : 'Hoard Surplus'}
                      </button>
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 pt-2 border-t border-white/[0.07]">
                      <button
                        type="button"
                        onClick={() => {
                          const updated = cloneWorldState(world);
                          const ch = updated.characters.find((c) => c.id === activeChar.id);
                          if (!ch) return;
                          const res = disburseTreasuryAction(ch, 'feast', updated);
                          setNotice({ type: res.success ? 'ok' : 'err', text: res.summary });
                          onUpdateWorld?.(updated);
                        }}
                        className="py-1.5 rounded-md bg-rose-950/50 hover:bg-rose-900/60 border border-rose-800/50 text-rose-200 text-[11px] font-medium cursor-pointer"
                      >
                        Grand Feast
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = cloneWorldState(world);
                          const ch = updated.characters.find((c) => c.id === activeChar.id);
                          if (!ch) return;
                          const res = disburseTreasuryAction(ch, 'tournament', updated);
                          setNotice({ type: res.success ? 'ok' : 'err', text: res.summary });
                          onUpdateWorld?.(updated);
                        }}
                        className="py-1.5 rounded-md bg-purple-950/50 hover:bg-purple-900/60 border border-purple-800/50 text-purple-200 text-[11px] font-medium cursor-pointer"
                      >
                        Tournament
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = cloneWorldState(world);
                          const ch = updated.characters.find((c) => c.id === activeChar.id);
                          if (!ch) return;
                          const res = disburseTreasuryAction(ch, 'monastery', updated);
                          setNotice({ type: res.success ? 'ok' : 'err', text: res.summary });
                          onUpdateWorld?.(updated);
                        }}
                        className="py-1.5 rounded-md bg-emerald-950/50 hover:bg-emerald-900/60 border border-emerald-800/50 text-emerald-200 text-[11px] font-medium cursor-pointer"
                      >
                        Endow Abbey
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = cloneWorldState(world);
                          const ch = updated.characters.find((c) => c.id === activeChar.id);
                          if (!ch) return;
                          const res = disburseTreasuryAction(ch, 'public_works', updated);
                          setNotice({ type: res.success ? 'ok' : 'err', text: res.summary });
                          onUpdateWorld?.(updated);
                        }}
                        className="py-1.5 rounded-md bg-amber-950/50 hover:bg-amber-900/60 border border-amber-800/50 text-amber-200 text-[11px] font-medium cursor-pointer"
                      >
                        Public Works
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = cloneWorldState(world);
                          const ch = updated.characters.find((c) => c.id === activeChar.id);
                          if (!ch) return;
                          const res = disburseTreasuryAction(ch, 'alms', updated);
                          setNotice({ type: res.success ? 'ok' : 'err', text: res.summary });
                          onUpdateWorld?.(updated);
                        }}
                        className="py-1.5 rounded-md bg-sky-950/50 hover:bg-sky-900/60 border border-sky-800/50 text-sky-200 text-[11px] font-medium cursor-pointer"
                      >
                        Parish Alms
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* CLOSED MONETARY CIRCUIT CARD */}
              <div className="mt-4 pt-3 border-t border-white/[0.08] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase font-semibold tracking-wider text-amber-400 flex items-center gap-1.5">
                    <Coins className="w-3.5 h-3.5 text-amber-400" />
                    <span>Closed Money Circuit</span>
                  </span>
                  <span
                    className={`text-[11px] font-mono tabular-nums font-semibold ${
                      (fiscalProfile.fiefSolvencyRatio ?? 1.0) >= 0.8 ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {(fiscalProfile.fiefSolvencyRatio ?? 1.0) >= 0.8 ? 'Solvent Circuit' : 'Cash Shortage'}
                  </span>
                </div>

                <div className="grid grid-cols-2 divide-x divide-white/[0.07] border border-white/[0.08] rounded-md bg-stone-950/50 text-[11px] font-mono tabular-nums">
                  <div className="p-2.5">
                    <div className="text-[10px] text-stone-400">TOWN COFFER RESERVES</div>
                    <div className="font-bold text-amber-300 text-xs mt-0.5">
                      {fiscalProfile.retainedFiefReserves || 0}g
                    </div>
                    <div className="text-[10px] text-stone-500 font-sans">Held in municipal vaults</div>
                  </div>
                  <div className="p-2.5">
                    <div className="text-[10px] text-stone-400">WAGES INJECTED LOCALLY</div>
                    <div className="font-bold text-emerald-300 text-xs mt-0.5">
                      +{fiscalProfile.wagesInjectedLocally || 0}g / mo
                    </div>
                    <div className="text-[10px] text-stone-500 font-sans">Troop &amp; court pay circulating</div>
                  </div>
                </div>

                <p className="text-[11px] text-stone-400 italic leading-relaxed">
                  Taxes are drawn from town coffers; army and court pay circulates back into local workshops to fund smallfolk wages.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-white/[0.08] bg-stone-900/45 p-4">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                <Coins className="h-4 w-4" /> Monetary Policy & Purity
              </h3>

              <div className="mb-4 flex items-center justify-between text-sm">
                <span>
                  Coin Purity:{' '}
                  <span className="font-mono text-amber-200">{((fiscalProfile.coinPurity ?? 1.0) * 100).toFixed(0)}%</span>
                </span>
                <span>
                  Inflation:{' '}
                  <span className="font-mono text-red-400">
                    {(((fiscalProfile.inflationFactor || 1.0) - 1) * 100).toFixed(0)}%
                  </span>
                </span>
              </div>

              {fiscalProfile.coinPurity < 1.0 && (
                <div className="mb-3 rounded border border-red-900/30 bg-red-950/20 p-2 text-[10px] text-red-300">
                  <AlertTriangle className="mb-0.5 mr-1 h-3 w-3 inline" />
                  Debased currency increases market prices and drives smallfolk back toward barter.
                </div>
              )}

              <button
                onClick={() => executeAction((w) => debaseCurrency(w, activeChar.realmId || '', 0.10))}
                className="w-full rounded-md bg-stone-800 py-2 text-xs font-bold text-stone-300 transition-colors hover:bg-red-900/80 hover:text-red-100 cursor-pointer disabled:opacity-50"
                disabled={fiscalProfile.coinPurity <= 0.35}
              >
                Melt & Debase Coinage (Get Emergency Gold)
              </button>
            </div>

            <div className="rounded-lg border border-white/[0.08] bg-stone-900/45 p-4">
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
                <Landmark className="h-3.5 w-3.5 text-amber-400" /> Patrician Creditors
              </h3>

              <div className="divide-y divide-white/[0.07] border border-white/[0.08] rounded-md bg-stone-950/40">
                {economy.bankInstitutions.map((bank) => (
                  <div key={bank.id} className="p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-serif text-sm font-bold text-stone-200">{bank.name}</span>
                      <span className="text-xs font-mono tabular-nums text-amber-400">
                        {(bank.baseInterestRate * 100).toFixed(0)}% APR
                      </span>
                    </div>
                    <div className="mb-2.5 text-[11px] text-stone-400">Managed by {bank.patricianName}</div>

                    <button
                      onClick={() => executeAction((w) => takeBankLoan(w, bank.id, activeChar.id, 250))}
                      disabled={!bank.isSolvent || bank.treasury < 250}
                      className="w-full rounded-md bg-stone-800 py-1.5 text-xs font-semibold text-amber-300 transition-colors hover:bg-stone-700 disabled:opacity-50 cursor-pointer"
                    >
                      {bank.isSolvent && bank.treasury >= 250 ? 'Borrow 250g (36 Months)' : 'Bank Insolvent'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ================= TAB 2: LOCAL COMMODITY MARKET ================= */}
        {activeSubTab === 'market' &&
          (selectedBurg ? (
            <div className="space-y-4">
              {onSelectBurg && world.burgs.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] uppercase font-semibold text-stone-400 shrink-0">Settlement:</span>
                  <select
                    value={selectedBurg.id}
                    onChange={(e) => {
                      const b = world.burgs.find((bg) => bg.id === e.target.value);
                      if (b) onSelectBurg(b);
                    }}
                    className="flex-1 px-2.5 py-1.5 rounded-md bg-stone-900 border border-white/[0.08] text-xs text-stone-200"
                  >
                    {world.burgs.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.type})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="rounded-lg border border-white/[0.08] bg-stone-900/45 p-4 text-center space-y-1">
                <h3 className="font-serif text-base font-bold text-amber-200">{selectedBurg.name} Bourse</h3>
                <p className="text-xs text-stone-400 font-mono tabular-nums">
                  Volume:{' '}
                  <span className="text-amber-400">
                    {economy.burgMarkets?.[selectedBurg.id]?.totalMarketVolume || 0}g
                  </span>
                  {' · '}Municipal Coffer:{' '}
                  <span className="text-emerald-400">
                    {Math.round(economy.burgMarkets?.[selectedBurg.id]?.treasury ?? selectedBurg.treasury ?? 0)}g
                  </span>
                  {' · '}Protected Float:{' '}
                  <span className="text-stone-300">
                    {Math.round(economy.burgMarkets?.[selectedBurg.id]?.workingCapitalFloat ?? 120)}g
                  </span>
                </p>
              </div>

              <div className="divide-y divide-white/[0.07] border border-white/[0.08] rounded-lg bg-stone-900/40">
                {Object.values(economy.burgMarkets?.[selectedBurg.id]?.markets || {}).map((market) => {
                  const isFood = market.commodity === 'Grain' || market.commodity === 'Livestock';
                  const isBullion = market.commodity === 'Silver' || market.commodity === 'Gold';
                  const isBottlenecked = market.throughputRate !== undefined && market.throughputRate < 0.8;

                  return (
                    <div
                      key={market.commodity}
                      className="flex items-center justify-between px-3 py-2.5 hover:bg-stone-800/40 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {isFood ? (
                          <Wheat className="h-4 w-4 text-emerald-500 shrink-0" />
                        ) : isBullion ? (
                          <Gem className="h-4 w-4 text-amber-300 shrink-0" />
                        ) : (
                          <Pickaxe className="h-4 w-4 text-stone-400 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-stone-200 flex items-center flex-wrap gap-2">
                            <span>{market.commodity}</span>
                            {isBottlenecked && (
                              <span className="text-[11px] text-amber-400 font-mono tabular-nums flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3 shrink-0" />
                                {(market.throughputRate! * 100).toFixed(0)}% Cap (
                                {market.bottleneckInput ? `Needs ${market.bottleneckInput}` : 'Bottleneck'})
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-stone-400 font-mono tabular-nums">
                            Stock: {Math.floor(market.stockpile)} · Prod: {Math.round(market.monthlyProduction * 10) / 10}/mo
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0 ml-2">
                        <div className="font-mono tabular-nums text-sm font-bold text-amber-100 flex items-center gap-1 justify-end">
                          {market.currentPrice.toFixed(1)}g
                          {market.currentPrice > (market.lastMonthPrice || market.basePrice) ? (
                            <TrendingUp className="h-3 w-3 text-red-400" />
                          ) : (
                            <TrendingDown className="h-3 w-3 text-emerald-400" />
                          )}
                        </div>
                        <div className="text-[10px] text-stone-400 font-mono tabular-nums">Base: {market.basePrice.toFixed(1)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex h-32 items-center justify-center rounded-lg border border-white/[0.08] border-dashed bg-stone-950/30 p-6 text-center text-sm text-stone-500">
              Select a settlement on the map to view its commodity marketplace.
            </div>
          ))}

        {/* ================= TAB 3: SOCIAL CLASSES, REAL WAGES & UNREST ================= */}
        {activeSubTab === 'strata' &&
          (selectedBurg ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-white/[0.08] bg-stone-900/45 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-serif text-base font-bold text-amber-200 flex items-center gap-2">
                    <Users className="h-4 w-4 text-amber-400" />
                    <span>{selectedBurg.name} Demographics</span>
                  </h3>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-semibold text-stone-400 block">Overall SoL</span>
                    <span
                      className={`font-mono tabular-nums text-sm font-bold ${
                        (selectedBurg.standardOfLiving || 1.0) >= 1.25
                          ? 'text-emerald-400'
                          : (selectedBurg.standardOfLiving || 1.0) >= 0.90
                          ? 'text-amber-300'
                          : 'text-red-400'
                      }`}
                    >
                      {(selectedBurg.standardOfLiving || 1.0).toFixed(2)}x
                    </span>
                  </div>
                </div>

                <div className="w-full bg-stone-950 h-2 rounded-full overflow-hidden border border-white/[0.06]">
                  <div
                    className={`h-full transition-all ${
                      (selectedBurg.unrest || 0) > 60
                        ? 'bg-red-500'
                        : (selectedBurg.unrest || 0) > 30
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, selectedBurg.unrest ?? 10)}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-[11px] font-mono tabular-nums text-stone-400 mt-1.5">
                  <span>Municipal Unrest: {selectedBurg.unrest ?? 10} / 100</span>
                  <span>{(selectedBurg.population || 2500).toLocaleString()} Citizens</span>
                </div>
              </div>

              {/* Individual Social Classes Cards */}
              <div className="space-y-2.5">
                {Object.entries((selectedBurg.strata || {}) as Record<SocialStratum, any>).map(([className, data]) => {
                  const sentimentColor =
                    data.sentiment === 'Thriving'
                      ? 'text-emerald-400'
                      : data.sentiment === 'Content'
                      ? 'text-amber-300'
                      : data.sentiment === 'Struggling'
                      ? 'text-orange-400'
                      : 'text-red-400 font-semibold';

                  return (
                    <div key={className} className="p-3 rounded-lg border border-white/[0.08] bg-stone-900/45 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-xs text-stone-200 flex items-center gap-2">
                          <span>{className}</span>
                          <span className="text-[11px] text-stone-400 font-mono tabular-nums font-normal">
                            ({data.count.toLocaleString()} souls)
                          </span>
                        </div>
                        <span className={`text-[11px] font-mono tabular-nums ${sentimentColor}`}>
                          {data.sentiment}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 divide-x divide-white/[0.07] border border-white/[0.07] rounded-md bg-stone-950/50 text-[11px] font-mono tabular-nums">
                        <div className="p-2">
                          <div className="text-[10px] text-stone-400">MONTHLY WAGE</div>
                          <div className="font-bold text-emerald-400 text-xs mt-0.5">+{data.averageIncome}g</div>
                        </div>
                        <div className="p-2">
                          <div className="text-[10px] text-stone-400">LIVING BASKET</div>
                          <div className="font-bold text-rose-400 text-xs mt-0.5">-{data.livingCost}g</div>
                        </div>
                        <div className="p-2">
                          <div className="text-[10px] text-stone-400">REAL SOL</div>
                          <div
                            className={`font-bold text-xs mt-0.5 ${
                              data.standardOfLiving >= 1.0 ? 'text-amber-300' : 'text-red-400'
                            }`}
                          >
                            {data.standardOfLiving.toFixed(2)}x
                          </div>
                        </div>
                      </div>

                      {data.unrest > 50 && (
                        <div className="px-2.5 py-1.5 rounded-md bg-red-950/40 border border-red-900/50 text-[11px] text-red-300 flex items-center gap-1.5">
                          <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0" />
                          <span>High Unrest ({data.unrest}%): Risk of strikes or rioting.</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex h-32 items-center justify-center rounded-lg border border-white/[0.08] border-dashed bg-stone-950/30 p-6 text-center text-sm text-stone-500">
              Select a settlement on the map to inspect its social classes, wages, and living standards.
            </div>
          ))}
      </div>
    </div>
  );
}