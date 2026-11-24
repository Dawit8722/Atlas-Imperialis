import React, { useState, useMemo } from 'react';
import {
  WorldState,
  SuccessionLaw,
  GenderLaw,
  CrownAuthority,
  JusticeLaw,
  PoliticalSystemState,
} from '../types/world';
import {
  POLITICAL_REFORM_CATALOG,
  ReformMetadata,
  computeGovernanceHealth,
  createDefaultPoliticalSystem,
  proposeCouncilBill,
  buildReformCoalition,
  launchLocalReformPilot,
  persuadeCouncilorOnBill,
  attemptRatifyBill,
  dismissBill,
} from '../engine/governanceEngine';
import { cloneWorldState } from '../utils/cloneWorldState';
import {
  Scale,
  CheckCircle2,
  XCircle,
  Users,
  Landmark,
  ShieldCheck,
  Flame,
  Handshake,
  MapPin,
  AlertTriangle,
  Gavel,
} from 'lucide-react';

interface CouncilConsensusPanelProps {
  world: WorldState;
  proposerId?: string;
  onUpdateWorld: (w: WorldState) => void;
  onNotify: (msg: string) => void;
}

const PILLARS: ReformMetadata['pillar'][] = [
  '1. Electoral & Representation',
  '2. Money & Lobbying',
  '3. Checks & Balances',
  '4. Citizen Participation',
  '5. Inclusivity & Minorities',
  '6. Info & Civic Education',
  '7. E-Governance',
];

export const CouncilConsensusPanel: React.FC<CouncilConsensusPanelProps> = ({
  world,
  proposerId,
  onUpdateWorld,
  onNotify,
}) => {
  const [selectedPillar, setSelectedPillar] = useState<'ALL' | ReformMetadata['pillar']>('ALL');
  const [pilotCountyId, setPilotCountyId] = useState<string>(world.counties?.[0]?.id || '');

  const health = useMemo(() => world.governanceHealth || computeGovernanceHealth(world), [world]);
  const ps = world.politicalSystem || createDefaultPoliticalSystem();
  const laws = world.realmLaws || {
    succession: 'Partition',
    gender: 'Agnatic-Cognatic',
    authority: 'Limited',
    justice: 'Traditional',
  };
  const pendingBills = world.pendingBills || [];
  const enactedHistory = world.legislativeHistory || [];

  const handlePropose = (
    title: string,
    summary: string,
    category: 'crown_law' | 'political_reform',
    targetDomain: 'realmLaws' | 'politicalSystem',
    targetKey: string,
    proposedValue: string
  ) => {
    const updated = cloneWorldState(world);
    const { bill, alreadyExisted } = proposeCouncilBill(updated, {
      title,
      summary,
      category,
      targetDomain,
      targetKey,
      proposedValue,
      proposerId: proposerId || updated.monarchId,
    });
    onUpdateWorld(updated);
    onNotify(
      alreadyExisted
        ? `COUNCIL DOCKET: "${bill.title}" is already under deliberation (${Math.round(bill.ayePct * 100)}% Aye).`
        : `SUBMITTED TO COUNCIL: "${bill.title}" requires ${Math.round(bill.requiredConsensusPct * 100)}% consensus (currently ${Math.round(bill.ayePct * 100)}% Aye).`
    );
  };

  const handleBuildCoalition = (billId: string) => {
    const updated = cloneWorldState(world);
    const res = buildReformCoalition(updated, billId);
    if (res.success) onUpdateWorld(updated);
    onNotify(res.message);
  };

  const handleLaunchPilot = (reformKey: keyof PoliticalSystemState, proposedValue: string) => {
    const cId = pilotCountyId || world.counties?.[0]?.id;
    if (!cId) return;
    const updated = cloneWorldState(world);
    const res = launchLocalReformPilot(updated, reformKey, proposedValue, cId);
    if (res.success) onUpdateWorld(updated);
    onNotify(res.message);
  };

  const handlePersuade = (billId: string, voterId: string, method: 'diplomacy' | 'favor') => {
    const updated = cloneWorldState(world);
    const res = persuadeCouncilorOnBill(updated, billId, voterId, method);
    if (res.success) onUpdateWorld(updated);
    onNotify(res.message);
  };

  const handleRatify = (billId: string) => {
    const updated = cloneWorldState(world);
    const res = attemptRatifyBill(updated, billId);
    if (res.enacted) onUpdateWorld(updated);
    onNotify(res.message);
  };

  const handleDismiss = (billId: string) => {
    const updated = cloneWorldState(world);
    dismissBill(updated, billId);
    onUpdateWorld(updated);
    onNotify('BILL TABLED: Proposal withdrawn from the High Privy Council.');
  };

  const filteredReforms =
    selectedPillar === 'ALL'
      ? POLITICAL_REFORM_CATALOG
      : POLITICAL_REFORM_CATALOG.filter((r) => r.pillar === selectedPillar);

  return (
    <div className="space-y-4 text-xs text-stone-200">
      {/* 1. Institutional Health & Regime Classification */}
      <div className="p-3.5 rounded-xl bg-stone-900/75 border border-white/10 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-amber-400">
            <Landmark className="w-3.5 h-3.5" />
            <span>Political Institutions & Regime Health</span>
          </div>
          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-amber-950/80 border border-amber-700/60 text-amber-200">
            {health.regimeType}
          </span>
        </div>

        <div className="grid grid-cols-5 divide-x divide-white/[0.07] text-center font-mono tabular-nums pt-2 border-t border-white/[0.07]">
          <div className="px-1">
            <div className="text-[10px] font-sans text-stone-400 uppercase">Dem Index</div>
            <div className="font-bold text-sky-300 text-xs mt-0.5">{health.democraticIndex}</div>
          </div>
          <div className="px-1">
            <div className="text-[10px] font-sans text-stone-400 uppercase">Corrupt Risk</div>
            <div className={`font-bold text-xs mt-0.5 ${health.corruptionRisk > 55 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {health.corruptionRisk}%
            </div>
          </div>
          <div className="px-1">
            <div className="text-[10px] font-sans text-stone-400 uppercase">Civic Trust</div>
            <div className="font-bold text-emerald-300 text-xs mt-0.5">{health.civicTrust}</div>
          </div>
          <div className="px-1">
            <div className="text-[10px] font-sans text-stone-400 uppercase">Inclusion</div>
            <div className="font-bold text-amber-300 text-xs mt-0.5">{health.minorityInclusion}</div>
          </div>
          <div className="px-1">
            <div className="text-[10px] font-sans text-stone-400 uppercase">Admin Eff</div>
            <div className="font-bold text-teal-300 text-xs mt-0.5">{health.administrativeEfficiency}</div>
          </div>
        </div>

        {health.crisisCatalystMonths > 0 && (
          <div className="p-2 rounded-lg bg-amber-950/60 border border-amber-600/50 text-[11px] text-amber-200 flex items-start gap-2">
            <Flame className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong>Reform Catalyst Window ({health.crisisCatalystMonths} mo):</strong>{' '}
              {health.crisisCatalystReason || 'Public crisis pressure'} reduces council resistance to structural reforms (+16% vote swing).
            </div>
          </div>
        )}
      </div>

      {/* 2. Active Council Legislative Docket (Consensus Required!) */}
      <div className="p-3.5 rounded-xl bg-stone-900/75 border border-amber-700/30 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-amber-400">
            <Gavel className="w-3.5 h-3.5" />
            <span>Council Legislative Docket ({pendingBills.length} Pending)</span>
          </div>
          <span className="text-[10px] text-stone-400">
            Laws require Council consensus
          </span>
        </div>

        {pendingBills.length === 0 ? (
          <div className="p-3 rounded-lg bg-black/40 border border-white/5 text-[11px] text-stone-400 text-center">
            No bills currently before the High Privy Council. Select any Crown Law or Institutional Reform below to table a proposal for debate & consensus vote.
          </div>
        ) : (
          <div className="space-y-3">
            {pendingBills.map((bill) => {
              const curPct = Math.round(bill.ayePct * 100);
              const reqPct = Math.round(bill.requiredConsensusPct * 100);
              const canRatify = curPct >= reqPct;
              const ayeCount = bill.votes.filter((v) => v.vote === 'Aye').length;
              const nayCount = bill.votes.filter((v) => v.vote === 'Nay').length;

              return (
                <div
                  key={bill.id}
                  className="p-3 rounded-xl bg-black/50 border border-stone-800 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-amber-100 text-xs">{bill.title}</div>
                      <div className="text-[10px] text-stone-400 mt-0.5">{bill.summary}</div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 border ${
                        canRatify
                          ? 'bg-emerald-950/80 border-emerald-600/60 text-emerald-300'
                          : 'bg-rose-950/70 border-rose-700/60 text-rose-300'
                      }`}
                    >
                      {curPct}% / {reqPct}% Needed
                    </span>
                  </div>

                  {/* Consensus Meter */}
                  <div className="space-y-1">
                    <div className="relative w-full h-2 bg-stone-900 rounded-full overflow-hidden border border-white/5">
                      <div
                        className={`h-full transition-all duration-300 ${
                          canRatify ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${Math.min(100, curPct)}%` }}
                      />
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-white/80"
                        style={{ left: `${reqPct}%` }}
                        title={`Required consensus threshold: ${reqPct}%`}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] font-mono text-stone-400">
                      <span>{ayeCount} Aye · {nayCount} Nay · {bill.votes.length - ayeCount - nayCount} Abstain</span>
                      <span className="flex items-center gap-2 text-stone-300">
                        {bill.coalitionBuilt ? <span>Coalition Pact</span> : null}
                        {bill.localPilotCountyId ? <span>Pilot Proven</span> : null}
                        {bill.crisisCatalystApplied ? <span className="text-amber-300">Crisis Pressure</span> : null}
                      </span>
                    </div>
                  </div>

                  {/* Individual Councilor Votes */}
                  <div className="divide-y divide-white/[0.06] rounded-lg bg-stone-950/60 border border-white/[0.07] max-h-40 overflow-y-auto">
                    {bill.votes.map((v) => (
                      <div
                        key={v.voterId}
                        className="px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px]"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`font-semibold uppercase text-[10px] font-mono ${
                                v.vote === 'Aye'
                                  ? 'text-emerald-300'
                                  : v.vote === 'Nay'
                                  ? 'text-rose-300'
                                  : 'text-stone-400'
                              }`}
                            >
                              {v.vote} (×{v.weight})
                            </span>
                            <span className="font-semibold text-stone-200 truncate">{v.voterName}</span>
                            <span className="text-stone-500 shrink-0 text-[10px]">· {v.role}</span>
                          </div>
                          <div className="text-[10px] text-stone-400 truncate mt-0.5">{v.reason}</div>
                        </div>

                        {v.vote !== 'Aye' && (v.canFlipWithDiplomacy || v.canFlipWithFavor) && (
                          <div className="flex items-center gap-1 shrink-0">
                            {v.canFlipWithFavor && (
                              <button
                                onClick={() => handlePersuade(bill.id, v.voterId, 'favor')}
                                className="px-2 py-0.5 rounded bg-purple-900/70 hover:bg-purple-800 text-purple-200 text-[10px] font-semibold cursor-pointer"
                                title="Call in owed Favor or Strong Hook"
                              >
                                Favor
                              </button>
                            )}
                            {v.canFlipWithDiplomacy && (
                              <button
                                onClick={() => handlePersuade(bill.id, v.voterId, 'diplomacy')}
                                className="px-2 py-0.5 rounded bg-amber-900/70 hover:bg-amber-800 text-amber-200 text-[10px] font-semibold cursor-pointer"
                                title="Negotiate concession (15g)"
                              >
                                Persuade (15g)
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Consensus-Building & Enactment Controls */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {!bill.coalitionBuilt && (
                      <button
                        onClick={() => handleBuildCoalition(bill.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-sky-900/70 hover:bg-sky-800 border border-sky-700/50 text-sky-100 text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Handshake className="w-3 h-3" />
                        <span>Build Coalition (20g)</span>
                      </button>
                    )}

                    {bill.targetDomain === 'politicalSystem' && !bill.localPilotCountyId && (
                      <button
                        onClick={() =>
                          handleLaunchPilot(
                            bill.targetKey as keyof PoliticalSystemState,
                            bill.proposedValue
                          )
                        }
                        className="px-2.5 py-1.5 rounded-lg bg-teal-900/70 hover:bg-teal-800 border border-teal-700/50 text-teal-100 text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <MapPin className="w-3 h-3" />
                        <span>Pilot Locally (25g)</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleRatify(bill.id)}
                      className={`ml-auto px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all ${
                        canRatify
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow'
                          : 'bg-stone-800 text-stone-400 border border-stone-700 hover:bg-stone-700'
                      }`}
                    >
                      {canRatify ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      )}
                      <span>{canRatify ? 'Ratify Law' : 'Needs Consensus'}</span>
                    </button>

                    <button
                      onClick={() => handleDismiss(bill.id)}
                      className="p-1.5 rounded-lg bg-stone-900 hover:bg-rose-950/60 text-stone-400 hover:text-rose-300 border border-stone-800 cursor-pointer"
                      title="Table / Withdraw Bill"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Crown Laws (Succession, Gender, Authority, Justice -> Drafts Bill for Council!) */}
      <div className="p-3.5 rounded-xl bg-stone-900/60 border border-white/10 space-y-3">
        <div className="text-[10px] uppercase font-bold tracking-wider text-amber-400 flex items-center gap-1.5">
          <Scale className="w-3.5 h-3.5" />
          <span>Crown Constitutional Charters (Propose to Council)</span>
        </div>

        <div className="space-y-2">
          <div className="text-[10px] text-stone-400 font-bold uppercase">Succession Paradigm</div>
          <div className="grid grid-cols-2 gap-1.5">
            {(['Primogeniture', 'Partition', 'Elective', 'Seniority'] as SuccessionLaw[]).map((law) => {
              const isActive = laws.succession === law;
              return (
                <button
                  key={law}
                  disabled={isActive}
                  onClick={() =>
                    handlePropose(
                      `Adopt ${law} Succession`,
                      `Shift royal inheritance charter from ${laws.succession} to ${law}.`,
                      'crown_law',
                      'realmLaws',
                      'succession',
                      law
                    )
                  }
                  className={`p-2 rounded-xl text-left border transition-all ${
                    isActive
                      ? 'bg-amber-950/70 border-amber-500 text-amber-100 cursor-default'
                      : 'bg-stone-950/60 border-white/5 text-stone-400 hover:text-stone-100 hover:border-amber-600/50 cursor-pointer'
                  }`}
                >
                  <div className="font-semibold text-[11px] flex items-center justify-between">
                    <span>{law}</span>
                    {isActive && <span className="text-[10px] text-amber-400 font-mono">ACTIVE</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="text-[10px] text-stone-400 font-bold uppercase">Gender Succession Rights</div>
          <div className="grid grid-cols-3 gap-1.5">
            {(['Agnatic', 'Agnatic-Cognatic', 'Cognatic'] as GenderLaw[]).map((glaw) => {
              const isActive = laws.gender === glaw;
              return (
                <button
                  key={glaw}
                  disabled={isActive}
                  onClick={() =>
                    handlePropose(
                      `Enact ${glaw} Inheritance`,
                      `Amend dynastic inheritance rights from ${laws.gender} to ${glaw}.`,
                      'crown_law',
                      'realmLaws',
                      'gender',
                      glaw
                    )
                  }
                  className={`py-1.5 px-2 rounded-lg text-center border text-[10px] font-semibold transition-all ${
                    isActive
                      ? 'bg-amber-950/70 border-amber-500 text-amber-100 cursor-default'
                      : 'bg-stone-950/60 border-white/5 text-stone-400 hover:text-stone-100 cursor-pointer'
                  }`}
                >
                  {glaw}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <div className="text-[10px] text-stone-400 font-bold uppercase">Crown Authority</div>
            <div className="grid grid-cols-2 gap-1">
              {(['Autonomous', 'Limited', 'High', 'Absolute'] as CrownAuthority[]).map((auth) => {
                const isActive = laws.authority === auth;
                return (
                  <button
                    key={auth}
                    disabled={isActive}
                    onClick={() =>
                      handlePropose(
                        `Crown Authority: ${auth}`,
                        `Rebalance sovereign prerogatives from ${laws.authority} to ${auth}.`,
                        'crown_law',
                        'realmLaws',
                        'authority',
                        auth
                      )
                    }
                    className={`py-1 rounded text-[10px] font-semibold border ${
                      isActive
                        ? 'bg-amber-800/80 border-amber-500 text-white cursor-default'
                        : 'bg-stone-950 border-white/5 text-stone-400 hover:text-white cursor-pointer'
                    }`}
                  >
                    {auth}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-[10px] text-stone-400 font-bold uppercase">Justice Charter</div>
            <div className="grid grid-cols-1 gap-1">
              {(['Traditional', 'Noble Immunity', 'Draconian'] as JusticeLaw[]).map((just) => {
                const isActive = laws.justice === just;
                return (
                  <button
                    key={just}
                    disabled={isActive}
                    onClick={() =>
                      handlePropose(
                        `Justice Charter: ${just}`,
                        `Reform realm criminal sentencing from ${laws.justice} to ${just}.`,
                        'crown_law',
                        'realmLaws',
                        'justice',
                        just
                      )
                    }
                    className={`py-1 px-2 rounded text-[10px] font-semibold border text-left flex justify-between ${
                      isActive
                        ? 'bg-amber-800/80 border-amber-500 text-white cursor-default'
                        : 'bg-stone-950 border-white/5 text-stone-400 hover:text-white cursor-pointer'
                    }`}
                  >
                    <span>{just}</span>
                    {isActive && <span className="text-[10px] font-mono text-amber-200">ACTIVE</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Seven Pillars of Political System Reform */}
      <div className="p-3.5 rounded-xl bg-stone-900/60 border border-white/10 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] uppercase font-bold tracking-wider text-sky-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>7 Pillars of Political Reform</span>
          </div>
          {world.counties?.length > 0 && (
            <select
              value={pilotCountyId}
              onChange={(e) => setPilotCountyId(e.target.value)}
              className="px-2 py-0.5 rounded bg-stone-950 border border-stone-800 text-[10px] text-stone-300 max-w-[140px]"
              title="Target County for Local-to-National Pilots"
            >
              {world.counties.slice(0, 12).map((c) => (
                <option key={c.id} value={c.id}>
                  Pilot: {c.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Pillar Filter Bar */}
        <div className="flex items-center gap-3 overflow-x-auto border-b border-white/[0.08] no-scrollbar">
          <button
            onClick={() => setSelectedPillar('ALL')}
            className={`pb-2 text-[11px] font-semibold whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
              selectedPillar === 'ALL'
                ? 'border-sky-400 text-sky-200'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            All 7 Pillars
          </button>
          {PILLARS.map((p) => (
            <button
              key={p}
              onClick={() => setSelectedPillar(p)}
              className={`pb-2 text-[11px] font-semibold whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
                selectedPillar === p
                  ? 'border-sky-400 text-sky-200'
                  : 'border-transparent text-stone-400 hover:text-stone-200'
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Reforms List */}
        <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
          {filteredReforms.map((reform) => {
            const currentVal = ps[reform.key];
            const hasPilot = (world.reformPilots || []).some(
              (rp) => rp.reformKey === reform.key && rp.isSuccessful
            );
            return (
              <div
                key={reform.key}
                className="p-2.5 rounded-xl bg-black/40 border border-white/[0.07] space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-mono uppercase text-sky-400/80">{reform.pillar}</div>
                    <div className="font-semibold text-stone-100 text-[11px]">{reform.label}</div>
                  </div>
                  {hasPilot && (
                    <span className="text-teal-300 text-[10px] font-mono">
                      Pilot Proven
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-1.5">
                  {reform.options.map((opt) => {
                    const isActive = currentVal === opt.value;
                    return (
                      <div
                        key={opt.value}
                        className={`p-2 rounded-lg border flex items-center justify-between gap-2 ${
                          isActive
                            ? 'bg-sky-950/50 border-sky-500/60 text-sky-100'
                            : 'bg-stone-950/60 border-white/[0.06] text-stone-300'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-[11px] flex items-center gap-2">
                            <span>{opt.shortLabel}</span>
                            {isActive && (
                              <span className="text-[10px] text-sky-300 font-mono">
                                ENACTED
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-stone-400">{opt.effect}</div>
                        </div>

                        {!isActive && (
                          <div className="flex items-center gap-1 shrink-0">
                            {opt.isProgressive && (
                              <button
                                onClick={() => handleLaunchPilot(reform.key, opt.value)}
                                className="px-2 py-1 rounded bg-teal-900/70 hover:bg-teal-800 text-teal-200 text-[10px] font-semibold cursor-pointer"
                                title="Test at municipal/county level first (25g)"
                              >
                                Pilot
                              </button>
                            )}
                            <button
                              onClick={() =>
                                handlePropose(
                                  `${reform.label}: ${opt.shortLabel}`,
                                  opt.effect,
                                  'political_reform',
                                  'politicalSystem',
                                  reform.key,
                                  opt.value
                                )
                              }
                              className="px-2.5 py-1 rounded bg-amber-700 hover:bg-amber-600 text-white text-[10px] font-bold cursor-pointer"
                            >
                              Propose
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. Enacted Legislative Record */}
      {enactedHistory.length > 0 && (
        <div className="p-3 rounded-xl bg-stone-900/40 border border-white/5 space-y-1.5">
          <div className="text-[10px] uppercase font-bold tracking-wider text-stone-400 flex items-center gap-1.5">
            <Users className="w-3 h-3" />
            <span>Recent Council Statutes ({enactedHistory.length})</span>
          </div>
          {enactedHistory.slice(0, 4).map((b) => (
            <div key={b.id} className="text-[10px] text-stone-400 flex justify-between">
              <span className="truncate text-stone-300">
                {b.status === 'Enacted' ? '✓' : '✕'} {b.title}
              </span>
              <span className="font-mono shrink-0 ml-2">Yr {b.proposedYear} · {Math.round(b.ayePct * 100)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
