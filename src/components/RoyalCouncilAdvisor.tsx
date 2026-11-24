import React, { useState } from 'react';
import { Realm, WorldState } from '../types/world';
import { MessageSquareText, Send } from 'lucide-react';
import { isElectronDesktop } from '../utils/runtimeEnv';

interface RoyalCouncilAdvisorProps {
  world: WorldState;
  realm: Realm;
}

interface CouncilAdvice {
  advisorTitle: string;
  verdictHeadline: string;
  counsel: string;
  actionItems: string[];
  source: 'ai' | 'local';
}

export const RoyalCouncilAdvisor: React.FC<RoyalCouncilAdvisorProps> = ({ world, realm }) => {
  const [question, setQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [advice, setAdvice] = useState<CouncilAdvice | null>(null);

  const monarch =
    world.characters.find((c) => c.id === realm.rulerId && c.isAlive) ||
    world.characters.find((c) => c.id === world.monarchId) ||
    world.characters[0];

  const gatherContext = () => {
    const realmBurgs = world.burgs.filter((b) => b.stateId === realm.id);
    const pendingBills = (world.pendingBills || []).slice(0, 6).map(
      (b) => `${b.title} (${Math.round(b.ayePct * 100)}% Aye, ${b.status})`
    );

    const burgMarkets = world.economy?.burgMarkets || world.burgMarkets || {};
    const shortages: string[] = [];
    for (const burg of realmBurgs) {
      const bm = burgMarkets[burg.id];
      if (!bm?.markets) continue;
      for (const [good, cm] of Object.entries(bm.markets)) {
        const targetStock = Math.max(12, (cm?.monthlyConsumption || 0) * 2.5);
        if (cm && cm.stockpile < targetStock * 0.45) {
          shortages.push(`${burg.name}: ${good} shortage (${Math.round(cm.stockpile)}/${Math.round(targetStock)}, ${cm.currentPrice.toFixed(1)}g)`);
        }
      }
    }

    const unrestList: string[] = [];
    for (const burg of realmBurgs) {
      if ((burg.unrest || 0) > 0.22) {
        unrestList.push(`${burg.name} unrest ${Math.round((burg.unrest || 0) * 100)}%`);
      }
      if (burg.strata) {
        for (const [cls, st] of Object.entries(burg.strata)) {
          if (st && typeof st.unrest === 'number' && st.unrest > 0.3) {
            unrestList.push(`${burg.name} ${cls} disquiet (${Math.round(st.unrest * 100)}%)`);
          }
        }
      }
    }

    const realmWars = (world.activeWars || []).filter(
      (w) => w.attackerRealmId === realm.id || w.defenderRealmId === realm.id
    );
    const warSummaries = realmWars.map((w) => {
      const otherId = w.attackerRealmId === realm.id ? w.defenderRealmId : w.attackerRealmId;
      const other = world.realms.find((r) => r.id === otherId)?.name || 'Enemy Crown';
      const armies = (world.armies || []).filter((a) => a.warId === w.id && a.lastBattleReport);
      const lastRep = armies[0]?.lastBattleReport?.tacticalSummary || '';
      return `vs ${other} (${w.casusBelli}, Score ${Math.round(w.warScore)}%${lastRep ? `; ${lastRep}` : ''})`;
    });

    const treasuryGold = monarch?.treasury ?? 0;
    return {
      pendingBills,
      shortages: shortages.slice(0, 8),
      unrestList: unrestList.slice(0, 6),
      warSummaries,
      treasuryGold,
    };
  };

  const handleAsk = async (presetQ?: string) => {
    const query = (presetQ ?? question).trim();
    if (!query || isAsking) return;
    if (presetQ) setQuestion(presetQ);
    setIsAsking(true);

    const ctxData = gatherContext();
    try {
      if (!isElectronDesktop()) {
        const resp = await fetch('/api/ai/council', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: query,
            realmName: realm.name,
            monarchName: monarch?.name || 'Your Grace',
            year: world.currentYear,
            treasuryGold: ctxData.treasuryGold,
            pendingBills: ctxData.pendingBills,
            marketShortages: ctxData.shortages,
            stratumUnrest: ctxData.unrestList,
            activeWars: ctxData.warSummaries,
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data?.ok && data?.advice?.counsel) {
            setAdvice({
              advisorTitle: data.advice.advisorTitle,
              verdictHeadline: data.advice.verdictHeadline,
              counsel: data.advice.counsel,
              actionItems: Array.isArray(data.advice.actionItems) ? data.advice.actionItems : [],
              source: 'ai',
            });
            return;
          }
        }
      }
    } catch {
      // Deterministic steward heuristic fallback
    } finally {
      setIsAsking(false);
    }

    const actionItems: string[] = [];
    if (ctxData.shortages.length > 0) {
      actionItems.push(`Relieve ${ctxData.shortages[0]} by expanding caravans or production guilds.`);
    }
    if (ctxData.pendingBills.length > 0) {
      actionItems.push(`Whip votes on "${ctxData.pendingBills[0]}" in Privy Council chambers.`);
    }
    if (ctxData.warSummaries.length > 0) {
      actionItems.push(`Focus field armies on ${ctxData.warSummaries[0]}.`);
    }
    if (ctxData.unrestList.length > 0) {
      actionItems.push(`Stabilize ${ctxData.unrestList[0]} through Estate concessions or grain relief.`);
    }
    if (actionItems.length === 0) {
      actionItems.push('Maintain Crown Land above 40% and steer regional trade downstream.');
    }

    setAdvice({
      advisorTitle: 'Lord Chancellor of the Realm',
      verdictHeadline: `Council Brief for ${realm.name} (${world.currentYear} AC)`,
      counsel: `Treasury stands at ${Math.round(ctxData.treasuryGold)}g with ${ctxData.pendingBills.length} pending council bills, ${ctxData.shortages.length} acute market shortages, and ${ctxData.warSummaries.length} active war fronts.`,
      actionItems,
      source: 'local',
    });
  };

  return (
    <div className="p-3 rounded-xl bg-stone-900/65 border border-white/[0.08] space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase font-semibold tracking-wider text-amber-400 flex items-center gap-1.5">
          <MessageSquareText className="w-3.5 h-3.5" />
          <span>Ask Royal Council Envoy</span>
        </span>
        {advice && (
          <span className="text-[10px] text-stone-400 font-mono">
            {advice.source === 'ai' ? 'AI Envoy' : 'Privy Heuristic'}
          </span>
        )}
      </div>

      <div className="flex gap-1.5">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
          placeholder="Ask about shortages, bills, unrest, or wars..."
          className="flex-1 bg-stone-950 border border-stone-800 rounded-lg px-2.5 py-1.5 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
        />
        <button
          type="button"
          onClick={() => handleAsk()}
          disabled={isAsking || !question.trim()}
          className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-stone-950 font-semibold text-xs flex items-center gap-1 transition-colors cursor-pointer"
        >
          <Send className="w-3 h-3" />
          <span>{isAsking ? '...' : 'Ask'}</span>
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        {['Trade bottlenecks?', 'Pending council votes?', 'Military outlook?'].map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => handleAsk(preset)}
            className="px-2 py-0.5 rounded bg-stone-950 hover:bg-stone-800 border border-stone-800 text-[10px] text-stone-300 transition-colors cursor-pointer"
          >
            {preset}
          </button>
        ))}
      </div>

      {advice && (
        <div className="p-2.5 rounded-lg bg-stone-950/80 border border-stone-800 space-y-1.5 text-[11px]">
          <div className="font-semibold text-amber-300">{advice.verdictHeadline}</div>
          <div className="text-[10px] text-stone-400">{advice.advisorTitle}</div>
          <p className="text-stone-200 leading-relaxed">{advice.counsel}</p>
          {advice.actionItems.length > 0 && (
            <ul className="space-y-0.5 pt-1 border-t border-stone-800 text-[10px] text-stone-300 list-disc pl-4">
              {advice.actionItems.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
