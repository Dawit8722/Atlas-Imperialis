import React, { useMemo, useState } from 'react';
import { WorldState, HistoricalEvent } from '../types/world';
import { isNotableForDeathChronicle } from '../engine/v17GrandStrategyEngine';
import { isElectronDesktop } from '../utils/runtimeEnv';
import {
  Clock,
  Shield,
  Skull,
  Crown,
  Flame,
  Search,
  Sparkles,
  Swords,
  BookOpen,
  X,
  ScrollText,
  Users,
  Flag,
  Handshake,
  AlertTriangle,
  Dices,
} from 'lucide-react';

interface ChroniclesViewProps {
  world: WorldState;
  onSelectRealmById: (realmId: string) => void;
  onOpenCompendiumForEntity?: (entityId: string) => void;
  onSelectCharacterById?: (characterId: string) => void;
  onTriggerCourtEvent?: () => void;
}

interface EpochSummary {
  epochTitle: string;
  summary: string;
  turningPoint: string;
  source: 'ai' | 'local';
}

export const ChroniclesView: React.FC<ChroniclesViewProps> = ({
  world,
  onSelectRealmById,
  onSelectCharacterById,
  onTriggerCourtEvent,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [epochSummary, setEpochSummary] = useState<EpochSummary | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [openWarEvent, setOpenWarEvent] = useState<HistoricalEvent | null>(null);

  const foundingYear = world.settings.year ?? 1042;
  const recordedSpan = Math.max(1, world.currentYear - foundingYear + 1);

  const categories = [
    'All',
    'War & Conquest',
    'Battle',
    'Diplomacy',
    'Dynastic Drama',
    'Coronation',
    'Death',
    'Assassination',
    'Religious Schism',
    'Great Cataclysm',
  ];

  const charById = useMemo(() => {
    const map = new Map<string, WorldState['characters'][number]>();
    for (const c of world.characters || []) map.set(c.id, c);
    return map;
  }, [world.characters]);

  const notableHistory = useMemo(() => {
    return (world.history || []).filter((ev) => {
      // Only document deaths of Counts, Dukes, Kings, Emperors (and landed County/Realm rulers)
      if (ev.category === 'Death' && ev.primaryActorId) {
        const deceased = charById.get(ev.primaryActorId);
        if (deceased && !isNotableForDeathChronicle(deceased, world)) {
          return false;
        }
      }
      return true;
    });
  }, [world, charById]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: notableHistory.length };
    for (const ev of notableHistory) {
      counts[ev.category] = (counts[ev.category] || 0) + 1;
    }
    return counts;
  }, [notableHistory]);

  const filteredHistory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return notableHistory.filter((ev) => {
      const matchesCat = selectedCategory === 'All' || ev.category === selectedCategory;
      const matchesQuery =
        !q ||
        ev.title.toLowerCase().includes(q) ||
        ev.description.toLowerCase().includes(q) ||
        ev.year.toString().includes(q) ||
        (ev.warRecord?.attackerRealmName || '').toLowerCase().includes(q) ||
        (ev.warRecord?.defenderRealmName || '').toLowerCase().includes(q);
      return matchesCat && matchesQuery;
    });
  }, [notableHistory, selectedCategory, searchQuery]);

  const handleSynthesizeEpoch = async () => {
    setIsSummarizing(true);
    const worldDisplayName = world.settings.name || world.realms[0]?.name || 'The Known Realm';
    const recentEvents = filteredHistory.slice(0, 16);
    try {
      if (!isElectronDesktop()) {
        const resp = await fetch('/api/ai/chronicle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            worldName: worldDisplayName,
            foundingYear,
            currentYear: world.currentYear,
            realms: world.realms.map((r) => `${r.name} (${r.government})`),
            events: recentEvents.map((e) => `Year ${e.year} [${e.category}] ${e.title}: ${e.description}`),
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data?.ok && data?.chronicle?.summary) {
            setEpochSummary({
              epochTitle: data.chronicle.epochTitle,
              summary: data.chronicle.summary,
              turningPoint: data.chronicle.turningPoint,
              source: 'ai',
            });
            return;
          }
        }
      }
    } catch {
      // Fall back to deterministic epoch compilation
    } finally {
      setIsSummarizing(false);
    }

    const wars = recentEvents.filter((e) => e.category === 'War & Conquest' || e.category === 'Battle').length;
    const coronations = recentEvents.filter((e) => e.category === 'Coronation').length;
    const intrigues = recentEvents.filter((e) => e.category === 'Assassination' || e.category === 'Dynastic Drama').length;
    const topEvent = recentEvents[0];
    setEpochSummary({
      epochTitle: `Annals of ${worldDisplayName} (${foundingYear}–${world.currentYear} AC)`,
      summary: `Across ${recordedSpan} recorded years, ${world.realms.length} sovereign realms contested the continent through ${wars} recorded campaigns, ${coronations} crown investitures, and ${intrigues} courtly upheavals.`,
      turningPoint: topEvent
        ? `Year ${topEvent.year}: ${topEvent.title} — ${topEvent.description}`
        : 'Consolidation of regional marches and trade corridors.',
      source: 'local',
    });
  };

  const getEventIcon = (category: HistoricalEvent['category']) => {
    switch (category) {
      case 'War & Conquest':
        return <Shield className="w-4 h-4 text-red-400" />;
      case 'Battle':
        return <Swords className="w-4 h-4 text-rose-400" />;
      case 'Death':
        return <Skull className="w-4 h-4 text-stone-400" />;
      case 'Assassination':
        return <Skull className="w-4 h-4 text-purple-400" />;
      case 'Coronation':
        return <Crown className="w-4 h-4 text-amber-400" />;
      case 'Religious Schism':
        return <Flame className="w-4 h-4 text-orange-400" />;
      case 'Diplomacy':
        return <Handshake className="w-4 h-4 text-emerald-400" />;
      case 'Great Cataclysm':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      default:
        return <Clock className="w-4 h-4 text-sky-400" />;
    }
  };

  const isReadableWarEvent = (ev: HistoricalEvent) =>
    ev.category === 'War & Conquest' || ev.category === 'Battle' || Boolean(ev.warRecord);

  const statusBadgeClass = (status: string) => {
    switch (status) {
      case 'Ongoing':
        return 'bg-red-950/70 text-red-300 border-red-700/60';
      case 'Attacker Victory':
      case 'Defender Victory':
        return 'bg-amber-950/70 text-amber-300 border-amber-700/60';
      case 'Negotiated Peace':
      case 'White Peace':
        return 'bg-emerald-950/70 text-emerald-300 border-emerald-700/60';
      default:
        return 'bg-stone-800 text-stone-300 border-stone-700';
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-stone-950 text-stone-200 overflow-hidden relative">
      {/* View Header */}
      <div className="px-6 py-5 border-b border-white/[0.08] bg-stone-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-cinzel text-lg sm:text-xl font-bold text-amber-100 flex items-center gap-2.5">
            <Clock className="w-5 h-5 text-amber-400 shrink-0" />
            <span>High Annals &amp; Dynastic Chronicles</span>
          </h2>
          <p className="text-xs text-stone-400 mt-1 tabular-nums">
            Wars, passing of Counts, Dukes &amp; Sovereigns, and courtly turning points across {recordedSpan}{' '}
            {recordedSpan === 1 ? 'year' : 'years'} ({foundingYear}–{world.currentYear} AC).
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {onTriggerCourtEvent && (
            <button
              type="button"
              onClick={onTriggerCourtEvent}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 border border-amber-500/40 text-amber-200 text-xs font-medium transition-colors shrink-0 cursor-pointer whitespace-nowrap"
            >
              <Dices className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Court Event</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleSynthesizeEpoch}
            disabled={isSummarizing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white text-xs font-medium transition-colors shrink-0 cursor-pointer whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span>{isSummarizing ? 'Compiling...' : 'Epoch Summary'}</span>
          </button>

          {/* Search */}
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2 text-stone-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chronicles..."
              className="w-full pl-8 pr-3 py-1.5 bg-stone-900 border border-white/[0.08] rounded-lg text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>
      </div>

      {/* Underline Filter Tabs */}
      <div className="px-6 border-b border-white/[0.08] bg-stone-950/60 flex items-center gap-5 overflow-x-auto no-scrollbar shrink-0">
        {categories.map((cat) => {
          const count = categoryCounts[cat] || 0;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`py-2.5 border-b-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                selectedCategory === cat
                  ? 'border-amber-400 text-amber-200'
                  : 'border-transparent text-stone-400 hover:text-stone-200'
              }`}
            >
              <span>{cat}</span>
              <span className="font-mono text-[10px] text-stone-500 tabular-nums">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Timeline Scroll */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {epochSummary && (
          <div className="p-5 bg-stone-900 border border-amber-700/50 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-serif text-base font-bold text-amber-200">
                {epochSummary.epochTitle}
              </h3>
              <span className="text-[10px] font-mono text-stone-400 uppercase">
                {epochSummary.source === 'ai' ? 'Royal Historian AI' : 'Archival Synthesis'}
              </span>
            </div>
            <p className="text-xs text-stone-200 font-serif leading-relaxed whitespace-pre-line">
              {epochSummary.summary}
            </p>
            <div className="pt-2 border-t border-stone-800 text-xs text-amber-300/90 font-serif italic">
              Turning Point: {epochSummary.turningPoint}
            </div>
          </div>
        )}

        {filteredHistory.length === 0 ? (
          <div className="p-12 text-center text-stone-500 text-xs">
            No chronicle entries match your filter.
          </div>
        ) : (
          filteredHistory.map((ev) => {
            const actor = ev.primaryActorId ? charById.get(ev.primaryActorId) : undefined;
            const realm = world.realms.find((r) => r.id === ev.realmId);
            const canReadWar = isReadableWarEvent(ev);
            const wr = ev.warRecord;

            return (
              <div
                key={ev.id}
                onClick={() => setOpenWarEvent(ev)}
                className={`p-4 bg-stone-900/50 border border-white/[0.08] rounded-xl transition-colors flex items-start gap-4 cursor-pointer ${
                  canReadWar
                    ? 'hover:border-red-500/45 hover:bg-stone-900/80'
                    : 'hover:border-amber-500/45 hover:bg-stone-900/80'
                }`}
              >
                <div className="p-2.5 bg-stone-950 rounded-lg border border-white/[0.07] shrink-0 mt-0.5">
                  {getEventIcon(ev.category)}
                </div>

                <div className="flex-1 space-y-1.5 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-amber-400 tabular-nums">
                        {wr?.endYear && wr.endYear !== wr.startYear
                          ? `Years ${wr.startYear}–${wr.endYear} AC`
                          : `Year ${ev.year} AC`}
                      </span>
                      <span className="text-stone-600">·</span>
                      <span className="text-[11px] uppercase tracking-wider font-semibold text-stone-400">
                        {ev.category}
                      </span>
                      {wr && (
                        <>
                          <span className="text-stone-600">·</span>
                          <span
                            className={`text-[11px] font-semibold ${
                              wr.status === 'Ongoing'
                                ? 'text-rose-400'
                                : wr.status.includes('Victory')
                                ? 'text-amber-300'
                                : 'text-emerald-400'
                            }`}
                          >
                            {wr.status}
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {realm && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectRealmById(realm.id);
                          }}
                          className="text-[11px] text-amber-400 hover:underline flex items-center gap-1 font-medium cursor-pointer"
                        >
                          <span>{realm.name}</span>
                        </button>
                      )}
                      {canReadWar && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenWarEvent(ev);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-red-950/60 hover:bg-red-900/70 border border-red-700/50 text-[11px] font-semibold text-red-200 transition-colors cursor-pointer"
                        >
                          <BookOpen className="w-3 h-3" />
                          <span>Read Chronicle</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <h3 className="font-serif font-bold text-sm text-stone-100">{ev.title}</h3>

                  <p className="text-xs text-stone-300 leading-relaxed font-serif">
                    {ev.description}
                  </p>

                  {wr && (
                    <div className="pt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-stone-400 tabular-nums">
                      <span>
                        <strong className="text-stone-200">{wr.attackerRealmName}</strong> vs.{' '}
                        <strong className="text-stone-200">{wr.defenderRealmName}</strong>
                      </span>
                      <span>· {wr.battlesFought} {wr.battlesFought === 1 ? 'Battle' : 'Battles'}</span>
                      {wr.totalCasualties > 0 && (
                        <span>· {wr.totalCasualties.toLocaleString()} Casualties</span>
                      )}
                      <span>· {wr.chapters.length} Campaign {wr.chapters.length === 1 ? 'Dispatch' : 'Dispatches'}</span>
                    </div>
                  )}

                  {actor && !wr && (
                    <div className="text-[11px] text-stone-400 pt-1 flex items-center gap-2">
                      <span>Primary Figure:</span>
                      <span className="font-medium text-stone-200">{actor.name}</span>
                      <span className="text-stone-600">·</span>
                      <span>House {actor.houseName}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* War Chronicle Reader Modal */}
      {openWarEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setOpenWarEvent(null)}
        >
          <div
            className="w-full max-w-3xl max-h-[85vh] bg-stone-950 border border-amber-700/40 rounded-xl shadow-2xl flex flex-col overflow-hidden text-stone-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-stone-800 bg-stone-900/90 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-amber-400 font-semibold">
                  <ScrollText className="w-3.5 h-3.5" />
                  <span>{openWarEvent.warRecord ? 'Imperial War Chronicle' : `Royal Annals · ${openWarEvent.category}`}</span>
                  {openWarEvent.warRecord && (
                    <>
                      <span className="text-stone-600">·</span>
                      <span
                        className={`px-1.5 py-0.5 text-[10px] border rounded ${statusBadgeClass(
                          openWarEvent.warRecord.status
                        )}`}
                      >
                        {openWarEvent.warRecord.status}
                      </span>
                    </>
                  )}
                </div>
                <h3 className="font-cinzel text-lg font-bold text-amber-100 mt-1">
                  {openWarEvent.warRecord?.warTitle || openWarEvent.title}
                </h3>
                <p className="text-xs text-stone-400 mt-0.5 tabular-nums">
                  {openWarEvent.warRecord
                    ? `${openWarEvent.warRecord.startYear}–${openWarEvent.warRecord.endYear ?? world.currentYear} AC · Casus Belli: ${openWarEvent.warRecord.casusBelli}`
                    : `Year ${openWarEvent.year} AC · ${openWarEvent.category}`}
                </p>
              </div>
              <button
                onClick={() => setOpenWarEvent(null)}
                className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
                title="Close War Chronicle"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {openWarEvent.warRecord ? (
                <>
                  {/* Belligerents Split */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-lg bg-red-950/20 border border-red-800/40">
                      <div className="text-[10px] uppercase tracking-wider text-red-300 font-bold flex items-center gap-1.5">
                        <Swords className="w-3 h-3" />
                        Aggressor Host
                      </div>
                      <button
                        onClick={() => {
                          onSelectRealmById(openWarEvent.warRecord!.attackerRealmId);
                          setOpenWarEvent(null);
                        }}
                        className="text-sm font-bold text-amber-100 hover:underline mt-1 text-left cursor-pointer"
                      >
                        {openWarEvent.warRecord.attackerRealmName}
                      </button>
                      <div className="text-xs text-stone-400 mt-0.5">
                        Led by {openWarEvent.warRecord.attackerLeaderName}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-lg bg-sky-950/20 border border-sky-800/40">
                      <div className="text-[10px] uppercase tracking-wider text-sky-300 font-bold flex items-center gap-1.5">
                        <Shield className="w-3 h-3" />
                        Defending Coalition
                      </div>
                      <button
                        onClick={() => {
                          onSelectRealmById(openWarEvent.warRecord!.defenderRealmId);
                          setOpenWarEvent(null);
                        }}
                        className="text-sm font-bold text-amber-100 hover:underline mt-1 text-left cursor-pointer"
                      >
                        {openWarEvent.warRecord.defenderRealmName}
                      </button>
                      <div className="text-xs text-stone-400 mt-0.5">
                        Led by {openWarEvent.warRecord.defenderLeaderName}
                      </div>
                    </div>
                  </div>

                  {/* Campaign Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-white/[0.07] rounded-xl bg-stone-900/70 border border-white/[0.08] tabular-nums">
                    <div className="p-3">
                      <div className="text-[11px] uppercase tracking-wider text-stone-400">Battles Fought</div>
                      <div className="text-base font-mono font-bold text-amber-200 mt-0.5">
                        {openWarEvent.warRecord.battlesFought}
                      </div>
                    </div>
                    <div className="p-3">
                      <div className="text-[11px] uppercase tracking-wider text-stone-400">Casualties</div>
                      <div className="text-base font-mono font-bold text-rose-300 mt-0.5">
                        {openWarEvent.warRecord.totalCasualties.toLocaleString()}
                      </div>
                    </div>
                    <div className="p-3">
                      <div className="text-[11px] uppercase tracking-wider text-stone-400">Duration</div>
                      <div className="text-base font-mono font-bold text-stone-100 mt-0.5">
                        {Math.max(
                          1,
                          (openWarEvent.warRecord.endYear ?? world.currentYear) - openWarEvent.warRecord.startYear + 1
                        )}{' '}
                        yr
                      </div>
                    </div>
                    <div className="p-3">
                      <div className="text-[11px] uppercase tracking-wider text-stone-400">Outcome</div>
                      <div className="text-xs font-semibold text-emerald-300 mt-1 truncate">
                        {openWarEvent.warRecord.territoryChanged || openWarEvent.warRecord.status}
                      </div>
                    </div>
                  </div>

                  {openWarEvent.warRecord.alliesInvolved && openWarEvent.warRecord.alliesInvolved.length > 0 && (
                    <div className="p-3 rounded-lg bg-stone-900/70 border border-stone-800 flex items-center gap-2 text-xs text-stone-300">
                      <Users className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="text-stone-400">Allied Realms Summoned:</span>
                      <span className="font-semibold text-stone-100">
                        {openWarEvent.warRecord.alliesInvolved.join(', ')}
                      </span>
                    </div>
                  )}

                  {openWarEvent.warRecord.treatySummary && (
                    <div className="p-3.5 rounded-lg bg-amber-950/20 border border-amber-700/40 text-xs text-amber-100 font-serif leading-relaxed">
                      <div className="text-[10px] font-sans uppercase tracking-wider font-bold text-amber-400 mb-1 flex items-center gap-1.5">
                        <Flag className="w-3 h-3" />
                        Treaty Terms &amp; Settlement
                      </div>
                      {openWarEvent.warRecord.treatySummary}
                    </div>
                  )}

                  {/* Chronological Campaign Chapters */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-stone-400">
                      Campaign Dispatches &amp; Chapters ({openWarEvent.warRecord.chapters.length})
                    </h4>
                    <div className="space-y-2.5">
                      {openWarEvent.warRecord.chapters.map((ch, idx) => (
                        <div
                          key={`${ch.year}_${idx}`}
                          className="p-3.5 rounded-lg bg-stone-900/80 border border-stone-800 space-y-1"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] font-bold text-amber-400 tabular-nums">
                              Year {ch.year} AC
                            </span>
                            <span className="text-stone-600">·</span>
                            <span className="text-xs font-bold text-stone-100">{ch.title}</span>
                          </div>
                          <p className="text-xs text-stone-300 font-serif leading-relaxed">
                            {ch.summary}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-stone-900 border border-stone-800 font-serif text-sm text-stone-200 leading-relaxed">
                    {openWarEvent.description}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    {openWarEvent.primaryActorId && charById.get(openWarEvent.primaryActorId) && (() => {
                      const p = charById.get(openWarEvent.primaryActorId!)!;
                      return (
                        <div className="p-3 rounded-lg bg-stone-900/70 border border-stone-800">
                          <div className="text-[10px] uppercase tracking-wider text-stone-400">Primary Figure</div>
                          {onSelectCharacterById ? (
                            <button
                              type="button"
                              onClick={() => {
                                onSelectCharacterById(p.id);
                                setOpenWarEvent(null);
                              }}
                              className="font-semibold text-amber-200 hover:underline mt-0.5 text-left cursor-pointer"
                            >
                              {p.name} ({p.title})
                            </button>
                          ) : (
                            <div className="font-semibold text-amber-200 mt-0.5">{p.name}</div>
                          )}
                        </div>
                      );
                    })()}
                    {openWarEvent.secondaryActorId && charById.get(openWarEvent.secondaryActorId) && (() => {
                      const s = charById.get(openWarEvent.secondaryActorId!)!;
                      return (
                        <div className="p-3 rounded-lg bg-stone-900/70 border border-stone-800">
                          <div className="text-[10px] uppercase tracking-wider text-stone-400">Counterpart</div>
                          {onSelectCharacterById ? (
                            <button
                              type="button"
                              onClick={() => {
                                onSelectCharacterById(s.id);
                                setOpenWarEvent(null);
                              }}
                              className="font-semibold text-stone-200 hover:text-amber-200 hover:underline mt-0.5 text-left cursor-pointer"
                            >
                              {s.name} ({s.title})
                            </button>
                          ) : (
                            <div className="font-semibold text-stone-200 mt-0.5">{s.name}</div>
                          )}
                        </div>
                      );
                    })()}
                    {openWarEvent.realmId && (() => {
                      const relRealm = world.realms.find((r) => r.id === openWarEvent.realmId);
                      if (!relRealm) return null;
                      return (
                        <div className="p-3 rounded-lg bg-stone-900/70 border border-stone-800 sm:col-span-2 flex items-center justify-between gap-2">
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-stone-400">Realm Involved</div>
                            <div className="font-semibold text-stone-100 mt-0.5">{relRealm.name}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              onSelectRealmById(relRealm.id);
                              setOpenWarEvent(null);
                            }}
                            className="px-2.5 py-1 rounded bg-amber-950/60 hover:bg-amber-900/70 border border-amber-700/50 text-amber-200 font-medium cursor-pointer"
                          >
                            Inspect Realm
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
