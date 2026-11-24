import React, { useMemo, useState } from 'react';
import {
  X,
  Coins,
  Scale,
  AlertTriangle,
  Landmark,
  Shield,
  ArrowRight,
  ScrollText,
} from 'lucide-react';
import type { Character, Realm, TaxPolicy, WorldState } from '../types/world';
import {
  contributePersonalGoldToCrown,
  ensureRealmBudget,
  executeCrownBudgetAction,
  getRealmChanceryEfficiency,
  getRealmGDP,
  getTaxPolicyMultipliers,
  repayDomesticRealmLoan,
  takeDomesticRealmLoan,
} from '../engine/economyEngine';
import { cloneWorldState } from '../utils/cloneWorldState';

interface RoyalBudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  world: WorldState;
  realm: Realm | undefined;
  onUpdateWorld: (next: WorldState) => void;
  onNotify?: (msg: string) => void;
}

const TAX_POLICIES: Array<{
  policy: TaxPolicy;
  label: string;
  rateText: string;
  effectText: string;
}> = [
  { policy: 'Low', label: 'Low', rateText: '72%', effectText: '-1.2 Unrest/mo' },
  { policy: 'Normal', label: 'Normal', rateText: '100%', effectText: 'Balanced' },
  { policy: 'High', label: 'High', rateText: '128%', effectText: '+1.2 Unrest/mo' },
  { policy: 'Extortionate', label: 'Extortionate', rateText: '155%', effectText: '+2.8 Unrest/mo' },
];

export const RoyalBudgetModal: React.FC<RoyalBudgetModalProps> = ({
  isOpen,
  onClose,
  world,
  realm,
  onUpdateWorld,
  onNotify,
}) => {
  const [contributionInput, setContributionInput] = useState<string>('100');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const liveRealm = useMemo(
    () => (realm ? world.realms?.find((r) => r.id === realm.id) || realm : undefined),
    [world.realms, realm]
  );

  const monarch: Character | undefined = useMemo(
    () => (liveRealm ? world.characters?.find((c) => c.id === liveRealm.rulerId) : undefined),
    [world.characters, liveRealm]
  );

  const metrics = useMemo(() => {
    if (!liveRealm) return null;
    const budget = liveRealm.budget || ensureRealmBudget(liveRealm, cloneWorldState(world));
    const report = budget.lastReport || {
      domainTax: 0,
      vassalTax: 0,
      scutageAndAidsIncome: 0,
      customsTariffs: 0,
      mintingIncome: 0,
      civilListStipend: 0,
      armyMaintenance: 0,
      castleAndGarrisonUpkeep: 0,
      armsAndSuppliesUpkeep: 0,
      ransomsPaid: 0,
      administrationAndJustice: 0,
      diplomacyAndPatronage: 0,
      religiousPatronage: 0,
      buildingSubsidies: 0,
      loanInterest: 0,
      netBalance: 0,
    };
    const gdp = getRealmGDP(liveRealm.id, world);
    const chancery = getRealmChanceryEfficiency(liveRealm.id, world);
    const loanUnit = Math.max(60, Math.round(gdp * 0.45));
    const maxLoans = Math.max(3, Math.floor(gdp / 40));
    const creditLimit = loanUnit * maxLoans;
    const isBankrupt = budget.bankruptcyUntilYear > world.currentYear;
    const maintRate = budget.armyMaintenanceRate ?? 1.0;
    const moraleCap = Math.round((50 + 50 * maintRate) * (isBankrupt ? 0.5 : 1.0));
    const totalIncome =
      (report.domainTax || 0) +
      (report.vassalTax || 0) +
      (report.scutageAndAidsIncome || 0) +
      (report.customsTariffs || 0) +
      (report.mintingIncome || 0);
    const totalOutlay =
      (report.civilListStipend || 0) +
      (report.armyMaintenance || 0) +
      (report.castleAndGarrisonUpkeep || 0) +
      (report.armsAndSuppliesUpkeep || 0) +
      (report.ransomsPaid || 0) +
      (report.administrationAndJustice || 0) +
      (report.diplomacyAndPatronage || 0) +
      (report.religiousPatronage || 0) +
      (report.buildingSubsidies || 0) +
      (report.loanInterest || 0);
    return {
      budget,
      report,
      gdp,
      chancery,
      loanUnit,
      creditLimit,
      isBankrupt,
      maintRate,
      moraleCap,
      totalIncome,
      totalOutlay,
    };
  }, [liveRealm, world]);

  if (!isOpen || !liveRealm || !metrics) return null;

  const {
    budget,
    report,
    gdp,
    chancery,
    loanUnit,
    creditLimit,
    isBankrupt,
    maintRate,
    moraleCap,
    totalIncome,
    totalOutlay,
  } = metrics;

  const crownGold = Math.round((liveRealm.treasury ?? 0) * 10) / 10;
  const privyGold = Math.round((monarch?.treasury ?? 0) * 10) / 10;
  const availableCredit = Math.max(0, Math.round(creditLimit - (budget.domesticDebtOwed || 0)));

  const handleSetTaxPolicy = (policy: TaxPolicy) => {
    const next = cloneWorldState(world);
    const target = next.realms.find((r) => r.id === liveRealm.id);
    if (!target) return;
    const b = ensureRealmBudget(target, next);
    b.taxPolicy = policy;
    onUpdateWorld(next);
    const info = getTaxPolicyMultipliers(policy);
    const msg = `Crown taxation set to ${policy} (${Math.round(info.taxMult * 100)}% assessment).`;
    setNotice({ ok: true, text: msg });
    onNotify?.(msg);
  };

  const handleSetArmyMaintenance = (rate: number) => {
    const clamped = Math.max(0.5, Math.min(1.0, Math.round(rate * 20) / 20));
    const next = cloneWorldState(world);
    const target = next.realms.find((r) => r.id === liveRealm.id);
    if (!target) return;
    const b = ensureRealmBudget(target, next);
    b.armyMaintenanceRate = clamped;
    onUpdateWorld(next);
  };

  const handleContributeGold = (amountOverride?: number) => {
    const amount = amountOverride ?? Math.max(0, Math.round(Number(contributionInput) || 0));
    if (amount <= 0) {
      setNotice({ ok: false, text: 'Enter a positive amount to transfer.' });
      return;
    }
    const next = cloneWorldState(world);
    const res = contributePersonalGoldToCrown(liveRealm.id, next, amount);
    setNotice({ ok: res.success, text: res.message });
    if (res.success) {
      onUpdateWorld(next);
      onNotify?.(res.message);
    }
  };

  const handleBorrowDomestic = () => {
    const next = cloneWorldState(world);
    const res = takeDomesticRealmLoan(liveRealm.id, next);
    setNotice({ ok: res.success, text: res.message });
    if (res.success) {
      onUpdateWorld(next);
      onNotify?.(res.message);
    }
  };

  const handleRepayDomestic = (amountOverride?: number) => {
    const next = cloneWorldState(world);
    const res = repayDomesticRealmLoan(liveRealm.id, next, amountOverride);
    setNotice({ ok: res.success, text: res.message });
    if (res.success) {
      onUpdateWorld(next);
      onNotify?.(res.message);
    }
  };

  const handleCrownAction = (action: 'royal_assizes' | 'endow_abbey' | 'patronize_nobles') => {
    const next = cloneWorldState(world);
    const res = executeCrownBudgetAction(liveRealm.id, action, next);
    setNotice({ ok: res.success, text: res.message });
    if (res.success) {
      onUpdateWorld(next);
      onNotify?.(res.message);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-lg border border-stone-800 bg-stone-950 text-stone-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Bar */}
        <div className="flex items-center justify-between gap-4 border-b border-stone-800 px-5 py-3.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-amber-400 shrink-0" />
              <h2 className="font-cinzel text-base font-bold text-stone-100 truncate">
                {liveRealm.name} — Royal Budget &amp; Crown Fisc
              </h2>
            </div>
            <p className="text-xs text-stone-400 mt-0.5">
              State treasury allocation, domestic bond credit, and monarch civil list transfers
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 rounded border border-stone-800 bg-stone-900 px-2.5 py-1.5 text-xs text-stone-300 hover:bg-stone-800 hover:text-white cursor-pointer whitespace-nowrap shrink-0"
          >
            <X className="w-3.5 h-3.5 shrink-0" />
            <span>Close</span>
          </button>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-stone-800 divide-y sm:divide-y-0 sm:divide-x divide-stone-800">
          <div className="px-4 py-3">
            <div className="text-[11px] uppercase tracking-wider text-stone-400">Crown Fisc</div>
            <div className="mt-1 font-mono tabular-nums text-lg font-bold text-amber-300">
              {crownGold.toLocaleString()}g
            </div>
            <div className="text-[11px] text-stone-500">State public purse</div>
          </div>
          <div className="px-4 py-3">
            <div className="text-[11px] uppercase tracking-wider text-stone-400">Monthly Net</div>
            <div
              className={`mt-1 font-mono tabular-nums text-lg font-bold ${
                report.netBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {report.netBalance >= 0 ? '+' : ''}
              {report.netBalance.toFixed(1)}g
            </div>
            <div className="text-[11px] text-stone-500">Last closed month</div>
          </div>
          <div className="px-4 py-3">
            <div className="text-[11px] uppercase tracking-wider text-stone-400">Realm GDP</div>
            <div className="mt-1 font-mono tabular-nums text-lg font-bold text-stone-100">
              {Math.round(gdp).toLocaleString()}g
            </div>
            <div className="text-[11px] text-stone-500 font-mono tabular-nums">
              Credit Cap: {creditLimit.toLocaleString()}g
            </div>
          </div>
          <div className="px-4 py-3">
            <div className="text-[11px] uppercase tracking-wider text-stone-400">Chancery Paper</div>
            <div
              className={`mt-1 font-mono tabular-nums text-lg font-bold ${
                chancery.taxEfficiency >= 1.0 ? 'text-emerald-400' : 'text-amber-300'
              }`}
            >
              {Math.round(chancery.taxEfficiency * 100)}%
            </div>
            <div className="text-[11px] text-stone-500 font-mono tabular-nums">
              Reform Pace {(chancery.reformSpeedMult * 100).toFixed(0)}%
            </div>
          </div>
        </div>

        {/* Bankruptcy Warning Row */}
        {isBankrupt && (
          <div className="flex items-center justify-between gap-3 border-b border-rose-800/70 bg-rose-950/50 px-5 py-2.5 text-xs text-rose-200">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                Crown Bankruptcy declared — Sovereign credit suspended, army morale ceiling halved, and levy efficiency degraded through Year{' '}
                <strong className="font-mono tabular-nums">{budget.bankruptcyUntilYear}</strong>.
              </span>
            </div>
          </div>
        )}

        {/* Action Feedback Row */}
        {notice && (
          <div
            className={`flex items-center justify-between gap-3 border-b px-5 py-2 text-xs ${
              notice.ok
                ? 'border-emerald-800/60 bg-emerald-950/35 text-emerald-200'
                : 'border-rose-800/60 bg-rose-950/35 text-rose-200'
            }`}
          >
            <span>{notice.text}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-stone-400 hover:text-white cursor-pointer shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Main 2-Column Ledger & Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-stone-800">
          {/* LEFT: Crown Balance Sheet */}
          <div className="p-5 space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
                  <ScrollText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Monthly Crown Revenue</span>
                </h3>
                <span className="font-mono tabular-nums text-xs font-bold text-emerald-400">
                  +{totalIncome.toFixed(1)}g
                </span>
              </div>
              <div className="border border-stone-800 rounded bg-stone-900/40 divide-y divide-stone-800/80 text-xs">
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-stone-300">Crown Domain Taxes</span>
                  <span className="font-mono tabular-nums text-emerald-400">
                    +{report.domainTax.toFixed(1)}g
                  </span>
                </div>
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-stone-300">Vassal Feudal Obligations</span>
                  <span className="font-mono tabular-nums text-emerald-400">
                    +{report.vassalTax.toFixed(1)}g
                  </span>
                </div>
                {(report.scutageAndAidsIncome || 0) > 0 && (
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-stone-300">Scutage, Feudal Aids &amp; Reliefs</span>
                    <span className="font-mono tabular-nums text-emerald-400">
                      +{(report.scutageAndAidsIncome || 0).toFixed(1)}g
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-stone-300">Trade Node Customs Tariffs</span>
                  <span className="font-mono tabular-nums text-emerald-400">
                    +{report.customsTariffs.toFixed(1)}g
                  </span>
                </div>
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-stone-300">Sovereign Minting &amp; Bullion</span>
                  <span className="font-mono tabular-nums text-emerald-400">
                    +{report.mintingIncome.toFixed(1)}g
                  </span>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
                  <Coins className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span>Monthly Crown Expenditure</span>
                </h3>
                <span className="font-mono tabular-nums text-xs font-bold text-rose-400">
                  -{totalOutlay.toFixed(1)}g
                </span>
              </div>
              <div className="border border-stone-800 rounded bg-stone-900/40 divide-y divide-stone-800/80 text-xs">
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-stone-300">Army &amp; Mercenary Pay ({Math.round(maintRate * 100)}%)</span>
                  <span className="font-mono tabular-nums text-rose-400">
                    -{report.armyMaintenance.toFixed(1)}g
                  </span>
                </div>
                {(report.castleAndGarrisonUpkeep || 0) > 0 && (
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-stone-300">Castles &amp; Permanent Garrisons</span>
                    <span className="font-mono tabular-nums text-rose-400">
                      -{(report.castleAndGarrisonUpkeep || 0).toFixed(1)}g
                    </span>
                  </div>
                )}
                {(report.armsAndSuppliesUpkeep || 0) > 0 && (
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-stone-300">Weapons, Siege Engines &amp; Rations</span>
                    <span className="font-mono tabular-nums text-rose-400">
                      -{(report.armsAndSuppliesUpkeep || 0).toFixed(1)}g
                    </span>
                  </div>
                )}
                {(report.ransomsPaid || 0) > 0 && (
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-stone-300">Royal Ransoms Disbursed</span>
                    <span className="font-mono tabular-nums text-rose-400">
                      -{(report.ransomsPaid || 0).toFixed(1)}g
                    </span>
                  </div>
                )}
                <div
                  className="flex items-center justify-between px-3 py-2"
                  title="Funds Royal Household food & wine, silk/fur liveries, court staff wages, and daily alms"
                >
                  <span className="text-stone-300">Royal Household &amp; Court (10% Stipend)</span>
                  <span className="font-mono tabular-nums text-rose-400">
                    -{report.civilListStipend.toFixed(1)}g
                  </span>
                </div>
                {(report.diplomacyAndPatronage || 0) > 0 && (
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-stone-300">Diplomacy, Subsidies &amp; Baron Gifts</span>
                    <span className="font-mono tabular-nums text-rose-400">
                      -{(report.diplomacyAndPatronage || 0).toFixed(1)}g
                    </span>
                  </div>
                )}
                {(report.administrationAndJustice || 0) > 0 && (
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-stone-300">Sheriffs, Judges, Writs &amp; Royal Travel</span>
                    <span className="font-mono tabular-nums text-rose-400">
                      -{(report.administrationAndJustice || 0).toFixed(1)}g
                    </span>
                  </div>
                )}
                {(report.religiousPatronage || 0) > 0 && (
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-stone-300">Abbeys, Monasteries &amp; Holy Tithes</span>
                    <span className="font-mono tabular-nums text-rose-400">
                      -{(report.religiousPatronage || 0).toFixed(1)}g
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-stone-300">Sovereign Slot Subsidies</span>
                  <span className="font-mono tabular-nums text-rose-400">
                    -{report.buildingSubsidies.toFixed(1)}g
                  </span>
                </div>
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-stone-300">Domestic Debt Service</span>
                  <span className="font-mono tabular-nums text-rose-400">
                    -{report.loanInterest.toFixed(1)}g
                  </span>
                </div>
              </div>
            </div>

            {/* Balance Footer */}
            <div className="flex items-center justify-between rounded border border-stone-800 bg-stone-900/60 px-3.5 py-2.5 text-xs">
              <span className="font-semibold text-stone-200">Net Crown Fiscal Balance</span>
              <span
                className={`font-mono tabular-nums text-sm font-bold ${
                  report.netBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {report.netBalance >= 0 ? '+' : ''}
                {report.netBalance.toFixed(1)}g / mo
              </span>
            </div>
          </div>

          {/* RIGHT: Policy Sliders, Personal Contribution & Domestic Credit */}
          <div className="p-5 space-y-5">
            {/* Tax Policy */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-300">
                  Taxation Policy
                </span>
                <span className="text-[11px] font-mono tabular-nums text-amber-300">
                  Current: {budget.taxPolicy}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {TAX_POLICIES.map((opt) => {
                  const active = budget.taxPolicy === opt.policy;
                  return (
                    <button
                      key={opt.policy}
                      type="button"
                      onClick={() => handleSetTaxPolicy(opt.policy)}
                      className={`rounded border px-2 py-2 text-left transition-colors cursor-pointer ${
                        active
                          ? 'border-amber-500/70 bg-amber-600/20 text-amber-200'
                          : 'border-stone-800 bg-stone-900/60 text-stone-300 hover:bg-stone-900'
                      }`}
                    >
                      <div className="text-xs font-semibold whitespace-nowrap">{opt.label}</div>
                      <div className="text-[10px] font-mono tabular-nums text-stone-400 mt-0.5">
                        {opt.rateText} · {opt.effectText}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Military Maintenance Slider */}
            <div className="space-y-2 border-t border-stone-800 pt-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Army Maintenance Rate</span>
                </span>
                <span className="font-mono tabular-nums text-xs font-bold text-amber-300">
                  {Math.round(maintRate * 100)}% (Morale Cap {moraleCap}%)
                </span>
              </div>
              <input
                type="range"
                min={0.5}
                max={1.0}
                step={0.05}
                value={maintRate}
                onChange={(e) => handleSetArmyMaintenance(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
                aria-label="Army Maintenance Rate"
              />
              <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-stone-500">
                <span>50% Peacetime Mothball</span>
                <span>100% Full War Readiness</span>
              </div>
            </div>

            {/* Monarch Privy Purse -> Crown Fisc Transfer */}
            <div className="space-y-2 border-t border-stone-800 pt-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-300">
                  Privy Purse Contribution
                </span>
                <span className="font-mono tabular-nums text-xs text-stone-300">
                  {monarch ? `${monarch.name}: ${privyGold.toLocaleString()}g` : 'No ruling monarch'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, Math.floor(privyGold))}
                  value={contributionInput}
                  onChange={(e) => setContributionInput(e.target.value)}
                  className="w-24 rounded border border-stone-800 bg-stone-900 px-2.5 py-1.5 font-mono tabular-nums text-xs text-stone-100 focus:outline-none focus:border-amber-500"
                  aria-label="Personal gold amount to contribute"
                />
                <button
                  type="button"
                  onClick={() => handleContributeGold()}
                  disabled={!monarch || privyGold < 1}
                  className="flex items-center gap-1.5 rounded border border-amber-600/50 bg-amber-600/20 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-600/35 disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <span>Contribute</span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                  <span>Crown</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleContributeGold(50)}
                  disabled={!monarch || privyGold < 50}
                  className="rounded border border-stone-800 bg-stone-900 px-2.5 py-1.5 font-mono tabular-nums text-xs text-stone-300 hover:bg-stone-800 disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
                >
                  +50g
                </button>
                <button
                  type="button"
                  onClick={() => handleContributeGold(150)}
                  disabled={!monarch || privyGold < 150}
                  className="rounded border border-stone-800 bg-stone-900 px-2.5 py-1.5 font-mono tabular-nums text-xs text-stone-300 hover:bg-stone-800 disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
                >
                  +150g
                </button>
              </div>
            </div>

            {/* Royal Statecraft & Patronage Disbursements */}
            <div className="space-y-2 border-t border-stone-800 pt-4">
              <div className="text-xs font-bold uppercase tracking-wider text-stone-300">
                Royal Statecraft &amp; Patronage
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleCrownAction('royal_assizes')}
                  className="rounded border border-stone-800 bg-stone-900/70 px-2.5 py-2 text-left hover:bg-stone-800 cursor-pointer"
                >
                  <div className="text-[11px] font-semibold text-amber-200">Royal Assizes</div>
                  <div className="text-[10px] text-stone-400">Circuit judges · -10 Unrest</div>
                </button>
                <button
                  type="button"
                  onClick={() => handleCrownAction('patronize_nobles')}
                  className="rounded border border-stone-800 bg-stone-900/70 px-2.5 py-2 text-left hover:bg-stone-800 cursor-pointer"
                >
                  <div className="text-[11px] font-semibold text-emerald-200">Patronize Barons</div>
                  <div className="text-[10px] text-stone-400">Gifts &amp; steeds · +10 Loyalty</div>
                </button>
                <button
                  type="button"
                  onClick={() => handleCrownAction('endow_abbey')}
                  className="rounded border border-stone-800 bg-stone-900/70 px-2.5 py-2 text-left hover:bg-stone-800 cursor-pointer"
                >
                  <div className="text-[11px] font-semibold text-sky-200">Endow Abbey</div>
                  <div className="text-[10px] text-stone-400">Religious patronage · +65 Piety</div>
                </button>
              </div>
            </div>

            {/* Domestic Credit Pool */}
            <div className="space-y-2.5 border-t border-stone-800 pt-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
                  <Landmark className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Domestic Credit Pool</span>
                </span>
                <span className="font-mono tabular-nums text-xs text-stone-300">
                  Owed: <strong className={budget.domesticDebtOwed > 0 ? 'text-rose-400' : 'text-emerald-400'}>{Math.round(budget.domesticDebtOwed).toLocaleString()}g</strong> / {creditLimit.toLocaleString()}g
                </span>
              </div>
              <p className="text-[11px] text-stone-400 leading-snug">
                Draws liquid coin from domestic town markets and burgher guilds (~{loanUnit}g per bond at 5% annual interest).
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleBorrowDomestic}
                  disabled={isBankrupt || availableCredit < 10}
                  className="rounded border border-amber-600/50 bg-stone-900 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-stone-800 disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
                >
                  Issue Crown Bond (+{Math.min(loanUnit, availableCredit)}g)
                </button>
                <button
                  type="button"
                  onClick={() => handleRepayDomestic(Math.min(loanUnit, budget.domesticDebtOwed))}
                  disabled={budget.domesticDebtOwed <= 0 || crownGold < 1}
                  className="rounded border border-stone-800 bg-stone-900 px-3 py-1.5 text-xs font-medium text-stone-200 hover:bg-stone-800 disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
                >
                  Repay {Math.min(loanUnit, Math.round(budget.domesticDebtOwed))}g
                </button>
                <button
                  type="button"
                  onClick={() => handleRepayDomestic()}
                  disabled={budget.domesticDebtOwed <= 0 || crownGold < 1}
                  className="rounded border border-emerald-700/50 bg-emerald-950/30 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-950/60 disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
                >
                  Clear All Debt
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
