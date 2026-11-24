import React, { useState, useMemo, useEffect } from 'react';
import { Realm, Character, Burg, County, WorldState, HistoricalEvent } from '../types/world';
import { cloneWorldState } from '../utils/cloneWorldState';
import { HeraldryShield } from './HeraldryShield';
import { RoyalCouncilAdvisor } from './RoyalCouncilAdvisor';
import {
  BookOpen,
  Feather,
  Skull,
  Eye,
  Heart,
  Shield,
  Crown,
  Flame,
  Key,
  Award,
  Sparkles,
  Zap,
  Swords,
  Search,
  Users,
  Compass,
  Lock,
  ChevronDown,
  ChevronUp,
  Coins,
  Navigation,
  Anchor,
  Scale,
  TrendingUp,
  TrendingDown,
  Landmark,
  Percent,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Building2,
  ChevronRight as ChevronRightIcon,
  X,
  Pencil,
  Palette,
  Check,
} from 'lucide-react';
import { CHARACTER_TRAITS, computeCharacterStats, formatCharacterRoleLabel } from '../engine/fantasyTables';
import { ChronicleEventModal } from './ChronicleEventModal';
import { V17GrandStrategyPanels } from './V17GrandStrategyPanels';
import { computeTotalGravitas, PlayerActionEngine } from '../engine/v17GrandStrategyEngine';
import { canBestowBanner, getCharacterHeraldStatus } from '../utils/heraldryBridge';
import { updateRealm, updateCharacter, updateArmy } from '../engine/worldEditor';
import { motion } from 'motion/react';
import { CommodityType } from '../types/economy';
import { takeBankLoan, debaseCurrency, ensureEconomy } from '../engine/economyEngine';

export type MasterDomain = 'court' | 'war' | 'economy' | 'fief' | 'laws';

export interface CourtDossierProps {
  world: WorldState;
  character?: Character;
  selectedCharacter?: Character;
  selectedRealm?: Realm;
  selectedBurg?: Burg;
  selectedCounty?: County;
  onSelectCharacter?: (char: Character) => void;
  onSelectRealm?: (realm: Realm) => void;
  onSelectBurg?: (burg: Burg) => void;
  onSelectCounty?: (county: County) => void;
  onOpenHouse?: (houseName: string) => void;
  onOpenCompendiumForEntity?: (entityId: string) => void;
  onWeaveStoryForCharacter?: (char: Character) => void;
  onUpdateWorld?: (newWorld: WorldState) => void;
  onOpenHeraldryStudio?: (target: { kind: 'realm' | 'county' | 'burg' | 'character' | 'house'; id: string; label: string }) => void;
  onClose?: () => void;
}

export const CourtDossier: React.FC<CourtDossierProps> = ({
  world,
  character,
  selectedCharacter,
  selectedRealm,
  selectedBurg,
  selectedCounty,
  onSelectCharacter = () => {},
  onSelectRealm = () => {},
  onSelectBurg = () => {},
  onSelectCounty = () => {},
  onOpenHouse,
  onOpenCompendiumForEntity = () => {},
  onWeaveStoryForCharacter = () => {},
  onUpdateWorld = () => {},
  onOpenHeraldryStudio,
  onClose = () => {},
}) => {
  // Master Domain Pillars (5 Clean Strategic Domains)
  const [masterDomain, setMasterDomain] = useState<MasterDomain>('court');
  const [subTab, setSubTab] = useState<string>('tree');

  const [inspectedCharId, setInspectedCharId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [notificationMsg, setNotificationMsg] = useState<string | null>(null);
  const [isEditingRealmName, setIsEditingRealmName] = useState(false);
  const [realmNameDraft, setRealmNameDraft] = useState('');
  const [editingArmyId, setEditingArmyId] = useState<string | null>(null);
  const [armyNameDraft, setArmyNameDraft] = useState('');

  const realm = selectedRealm || world.realms[0];
  const livingChars = useMemo(() => world.characters.filter((c) => c.isAlive !== false), [world.characters]);
  const ruler = livingChars.find((c) => c.id === realm?.rulerId) || livingChars[0] || world.characters[0];
  const capital = world.burgs.find((b) => b.id === realm?.capitalBurgId);
  const burg = selectedBurg || capital;
  const county = selectedCounty || (burg ? world.counties.find((c) => c.id === burg.countyId) : undefined);
  const countyRuler = county ? livingChars.find((c) => c.id === county.rulerId) : undefined;

  useEffect(() => {
    const incomingId = character?.id || selectedCharacter?.id;
    if (incomingId) {
      const target = livingChars.find((c) => c.id === incomingId);
      if (target && (!realm || target.realmId === realm.id)) {
        setInspectedCharId(incomingId);
        return;
      }
    }
    if (realm) {
      setInspectedCharId((prevId) => {
        const prevChar = prevId ? livingChars.find((c) => c.id === prevId) : undefined;
        if (prevChar && prevChar.realmId === realm.id) return prevId;
        return ruler?.id || null;
      });
    }
  }, [character?.id, selectedCharacter?.id, realm?.id, ruler?.id, livingChars]);

  const realmChars = useMemo(() => livingChars.filter((c) => c.realmId === realm?.id), [livingChars, realm]);
  const activeChar = useMemo(() => {
    if (inspectedCharId) {
      const found = world.characters.find((c) => c.id === inspectedCharId);
      if (found) return found;
    }
    const propChar = character || selectedCharacter;
    if (propChar) return propChar;
    return ruler;
  }, [inspectedCharId, world.characters, ruler, character, selectedCharacter]);

  const spouse = activeChar?.spouseId ? livingChars.find((c) => c.id === activeChar.spouseId) : undefined;
  const heir = activeChar?.heirId ? livingChars.find((c) => c.id === activeChar.heirId) : undefined;
  const rival = activeChar?.rivalId ? livingChars.find((c) => c.id === activeChar.rivalId) : undefined;
  const lover = activeChar?.loverId ? livingChars.find((c) => c.id === activeChar.loverId) : undefined;

  const economy = useMemo(() => ensureEconomy(world), [world]);
  const currentBurgMarket = burg && economy ? economy.burgMarkets[burg.id] : undefined;
  const activeFiscalProfile = activeChar && economy ? economy.fiscalProfiles[activeChar.id] : undefined;
  const realmPurity = realm && economy ? (economy.realmCoinPurity[realm.id] || 1.0) : 1.0;

  const realmRoutes = useMemo(() => {
    if (!world.tradeNetwork || !realm) return [];
    const realmBurgIds = new Set(world.burgs.filter((b) => b.stateId === realm.id).map((b) => b.id));
    return world.tradeNetwork.routes.filter(
      (r) => realmBurgIds.has(r.fromBurgId) || realmBurgIds.has(r.toBurgId)
    );
  }, [world.tradeNetwork, realm, world.burgs]);

  const realmCaravans = useMemo(() => {
    if (!world.tradeNetwork || !realm) return [];
    const routeIds = new Set(realmRoutes.map((r) => r.id));
    return world.tradeNetwork.caravans.filter((c) => routeIds.has(c.routeId));
  }, [world.tradeNetwork, realmRoutes]);

  const dynastyMembers = useMemo(() => {
    if (!ruler) return [];
    const rulerChildSet = new Set(ruler.children || []);
    const rulerParents = new Set(
      [ruler.knownFatherId, ruler.realFatherId, ruler.motherId].filter(Boolean) as string[]
    );
    const directAndDynasty = world.characters.filter((c) => {
      const isDirectChild =
        rulerChildSet.has(c.id) || c.knownFatherId === ruler.id || c.motherId === ruler.id;
      const isSibling =
        c.id !== ruler.id &&
        ((c.knownFatherId && rulerParents.has(c.knownFatherId)) ||
          (c.realFatherId && rulerParents.has(c.realFatherId)) ||
          (c.motherId && rulerParents.has(c.motherId)));
      const sameHouseInRealm =
        c.realmId === realm?.id &&
        ((ruler.houseName && c.houseName === ruler.houseName) ||
          ['Monarch', 'Consort', 'Crown Heir', 'Heir', 'Child', 'Cadet Prince', 'Cadet Princess', 'Noble Scion', 'Court Noble', 'Legitimated Bastard', 'Disinherited Bastard', 'Dowager Regent', 'Royal Uncle'].includes(c.role));
      return isDirectChild || isSibling || sameHouseInRealm;
    });
    return directAndDynasty;
  }, [world.characters, ruler, realm?.id]);

  const councilMembers = useMemo(() => realmChars.filter((c) =>
    ['Chancellor', 'Marshal', 'Steward', 'Spymaster', 'Court Chaplain'].includes(c.role)
  ), [realmChars]);

  const dignitaries = useMemo(() => realmChars.filter((c) =>
    ['Court Champion', 'Court Physician', 'Court Antiquarian', 'Grand Equerry', 'Royal Cupbearer', 'High Inquisitor', 'Court Jester'].includes(c.role)
  ), [realmChars]);

  const vassals = useMemo(() => realmChars.filter((c) =>
    [
      'Vassal Duke',
      'Vassal Count',
      'Vassal Baron',
      'Lord Mayor',
      'Guildmaster',
      'Merchant Guildmaster',
      'Portmaster',
      'Vassal Consort',
      'Vassal Heir',
    ].includes(c.role)
  ), [realmChars]);

  const filteredRoster = useMemo(() => {
    if (!searchQuery.trim()) return realmChars;
    const q = searchQuery.toLowerCase();
    return realmChars.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.role.toLowerCase().includes(q)
    );
  }, [realmChars, searchQuery]);

  if (!realm || !ruler) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-stone-950 text-stone-300 space-y-2">
        <Crown className="w-8 h-8 text-amber-500/60" />
        <div className="font-cinzel font-bold text-sm text-amber-200">No Royal Courts Founded</div>
        <p className="text-xs text-stone-400 max-w-xs leading-relaxed">
          This canvas has no kingdoms or nobles yet. Sculpt land in World Builder and use Auto-Populate Terrain or stamp settlements to found a realm.
        </p>
      </div>
    );
  }

  return (
    <>
      <motion.aside
        initial={{ opacity: 0.9 }}
        animate={{ opacity: 1 }}
        className="w-full h-full flex flex-col bg-stone-950 text-xs text-stone-200 select-text overflow-hidden relative"
      >
            {/* Header: Heraldic Crest & Sovereign Realm */}
            <div className="px-4 py-3 border-b border-white/[0.08] bg-stone-950/60 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onOpenHeraldryStudio?.({ kind: 'realm', id: realm.id, label: realm.name })}
                  disabled={!onOpenHeraldryStudio}
                  title={onOpenHeraldryStudio ? 'Edit Realm Coat of Arms' : undefined}
                  className={onOpenHeraldryStudio ? 'cursor-pointer rounded-md hover:ring-2 hover:ring-amber-400/60 transition-all shrink-0' : 'shrink-0'}
                >
                  <HeraldryShield coatOfArms={realm.heraldry} seed={`${realm.id}_${realm.name}`} size={38} />
                </button>
                <div className="min-w-0 flex-1">
                  {isEditingRealmName ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={realmNameDraft}
                        onChange={(e) => setRealmNameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && realmNameDraft.trim()) {
                            onUpdateWorld(updateRealm(world, realm.id, { name: realmNameDraft.trim() }));
                            setIsEditingRealmName(false);
                          } else if (e.key === 'Escape') {
                            setIsEditingRealmName(false);
                          }
                        }}
                        className="font-cinzel font-bold text-xs text-amber-100 bg-stone-900 border border-amber-500/60 rounded px-1.5 py-0.5 w-full min-w-0 focus:outline-none"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (realmNameDraft.trim()) {
                            onUpdateWorld(updateRealm(world, realm.id, { name: realmNameDraft.trim() }));
                          }
                          setIsEditingRealmName(false);
                        }}
                        className="p-1 text-emerald-400 hover:text-emerald-300 cursor-pointer shrink-0"
                        title="Save Realm Name"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : world.realms.length > 1 ? (
                    <select
                      aria-label="Select Realm"
                      value={realm.id}
                      onChange={(e) => {
                        const target = world.realms.find((r) => r.id === e.target.value);
                        if (target) onSelectRealm(target);
                      }}
                      className="font-cinzel font-bold text-sm text-amber-100 bg-transparent border border-white/[0.08] rounded-md px-1.5 py-0.5 max-w-[190px] truncate cursor-pointer focus:outline-none focus:border-amber-500"
                    >
                      {world.realms.map((r) => (
                        <option key={r.id} value={r.id} className="bg-stone-950 text-stone-100">
                          {r.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <h2 className="font-cinzel font-bold text-sm text-amber-100 truncate">
                      {realm.name}
                    </h2>
                  )}
                  <div className="text-[11px] text-stone-400 truncate flex items-center gap-1.5 mt-0.5">
                    <span>{realm.culture}</span>
                    <span className="text-stone-600">·</span>
                    <span className="text-amber-400/90 font-medium">{realm.religion}</span>
                    <span className="text-stone-600">·</span>
                    <span className="text-stone-400 font-mono tabular-nums">{realmChars.length} Nobles</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setRealmNameDraft(realm.name);
                    setIsEditingRealmName((v) => !v);
                  }}
                  className="p-1.5 hover:bg-stone-800/60 rounded-md text-stone-400 hover:text-amber-300 transition-colors cursor-pointer"
                  title="Rename Realm"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                {onOpenHeraldryStudio && (
                  <button
                    type="button"
                    onClick={() => onOpenHeraldryStudio({ kind: 'realm', id: realm.id, label: realm.name })}
                    className="p-1.5 hover:bg-stone-800/60 rounded-md text-stone-400 hover:text-amber-300 transition-colors cursor-pointer"
                    title="Edit Realm Coat of Arms"
                  >
                    <Palette className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => onOpenCompendiumForEntity(`lore_${realm.id}`)}
                  className="p-1.5 hover:bg-stone-800/60 rounded-md text-stone-400 hover:text-amber-300 transition-colors cursor-pointer"
                  title="Open in Compendium"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onClose?.()}
                  className="p-1.5 hover:bg-stone-800/60 rounded-md text-stone-400 hover:text-white transition-colors cursor-pointer"
                  title="Close Feudal Dossier"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Notification Toast */}
            {notificationMsg && (
              <div className="px-3 py-2 bg-amber-950/80 border-b border-amber-500/40 text-amber-200 text-[11px] font-serif italic flex justify-between items-center">
                <span>{notificationMsg}</span>
                <button onClick={() => setNotificationMsg(null)} className="text-amber-400 hover:text-white ml-2 cursor-pointer">✕</button>
              </div>
            )}

            {/* 5 Master Domain Pillars */}
            <div className="grid grid-cols-5 px-2 border-b border-white/[0.08] text-[11px] font-medium text-center select-none">
              <button
                onClick={() => { setMasterDomain('court'); setSubTab('tree'); }}
                className={`py-2 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  masterDomain === 'court' ? 'border-amber-400 text-amber-200 font-semibold' : 'border-transparent text-stone-400 hover:text-stone-200'
                }`}
              >
                Court
              </button>
              <button
                onClick={() => { setMasterDomain('economy'); setSubTab('markets'); }}
                className={`py-2 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  masterDomain === 'economy' ? 'border-amber-400 text-amber-200 font-semibold' : 'border-transparent text-stone-400 hover:text-stone-200'
                }`}
              >
                Economy
              </button>
              <button
                onClick={() => { setMasterDomain('war'); setSubTab('factions'); }}
                className={`py-2 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  masterDomain === 'war' ? 'border-amber-400 text-amber-200 font-semibold' : 'border-transparent text-stone-400 hover:text-stone-200'
                }`}
              >
                War
              </button>
              <button
                onClick={() => { setMasterDomain('fief'); setSubTab('citadel'); }}
                className={`py-2 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  masterDomain === 'fief' ? 'border-amber-400 text-amber-200 font-semibold' : 'border-transparent text-stone-400 hover:text-stone-200'
                }`}
              >
                Fief
              </button>
              <button
                onClick={() => { setMasterDomain('laws'); setSubTab('laws'); }}
                className={`py-2 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  masterDomain === 'laws' ? 'border-amber-400 text-amber-200 font-semibold' : 'border-transparent text-stone-400 hover:text-stone-200'
                }`}
              >
                Laws
              </button>
            </div>

            {/* Sub-Pillar Navigation Tabs */}
            <div className="flex items-center gap-3 px-4 border-b border-white/[0.06] bg-stone-950/30 overflow-x-auto text-[11px] no-scrollbar">
              {masterDomain === 'court' && (
                <>
                  {['tree', 'council', 'dignitaries', 'vassals', 'roster'].map((st) => (
                    <button
                      key={st}
                      onClick={() => setSubTab(st)}
                      className={`py-1.5 border-b-2 capitalize transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        subTab === st ? 'border-amber-400 text-amber-200 font-semibold' : 'border-transparent text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      {st === 'tree' ? 'Dynasty' : st}
                    </button>
                  ))}
                </>
              )}

              {masterDomain === 'economy' && (
                <>
                  {['markets', 'ledger', 'banks', 'routes'].map((st) => (
                    <button
                      key={st}
                      onClick={() => setSubTab(st)}
                      className={`py-1.5 border-b-2 capitalize transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        subTab === st ? 'border-amber-400 text-amber-200 font-semibold' : 'border-transparent text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </>
              )}

              {masterDomain === 'war' && (
                <>
                  {['factions', 'claims', 'feuds', 'sieges', 'prisoners'].map((st) => (
                    <button
                      key={st}
                      onClick={() => setSubTab(st)}
                      className={`py-1.5 border-b-2 capitalize transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        subTab === st ? 'border-amber-400 text-amber-200 font-semibold' : 'border-transparent text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      {st === 'sieges' ? 'Sieges & Armies' : st}
                    </button>
                  ))}
                </>
              )}

              {masterDomain === 'fief' && (
                <>
                  {['citadel', 'county', 'travel'].map((st) => (
                    <button
                      key={st}
                      onClick={() => setSubTab(st)}
                      className={`py-1.5 border-b-2 capitalize transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        subTab === st ? 'border-amber-400 text-amber-200 font-semibold' : 'border-transparent text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </>
              )}

              {masterDomain === 'laws' && (
                <>
                  {['laws', 'plague'].map((st) => (
                    <button
                      key={st}
                      onClick={() => setSubTab(st)}
                      className={`py-1.5 border-b-2 capitalize transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        subTab === st ? 'border-amber-400 text-amber-200 font-semibold' : 'border-transparent text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </>
              )}
            </div>

            {/* Scrollable Stage Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* PILLAR 1: COURT (Dynasty Tree / Council / Roster) */}
              {masterDomain === 'court' && (
                <>
                  {subTab === 'tree' && (() => {
                    const charLookup = new Map((world.characters || []).map((c) => [c.id, c]));
                    const ancestorMap = new Map<string, Character>();
                    const ancQueue: string[] = [
                      ...(ruler.knownFatherId ? [ruler.knownFatherId] : []),
                      ...(ruler.realFatherId ? [ruler.realFatherId] : []),
                      ...(ruler.motherId ? [ruler.motherId] : []),
                    ];
                    const seenAnc = new Set<string>();
                    while (ancQueue.length > 0) {
                      const aid = ancQueue.shift()!;
                      if (seenAnc.has(aid)) continue;
                      seenAnc.add(aid);
                      const anc = charLookup.get(aid);
                      if (!anc) continue;
                      if (anc.isAlive === false) ancestorMap.set(anc.id, anc);
                      if (anc.knownFatherId) ancQueue.push(anc.knownFatherId);
                      if (anc.realFatherId) ancQueue.push(anc.realFatherId);
                      if (anc.motherId) ancQueue.push(anc.motherId);
                      if (anc.spouseId) {
                        const sp = charLookup.get(anc.spouseId);
                        if (sp && sp.isAlive === false) ancestorMap.set(sp.id, sp);
                      }
                    }
                    for (const c of world.characters || []) {
                      if (
                        c.isAlive === false &&
                        ruler.houseName &&
                        c.houseName === ruler.houseName &&
                        ((c.children || []).includes(ruler.id) ||
                          (c.birthYear ?? 0) < (ruler.birthYear ?? world.currentYear - ruler.age))
                      ) {
                        ancestorMap.set(c.id, c);
                      }
                    }
                    const sortedAncestors = Array.from(ancestorMap.values())
                      .sort((a, b) => (a.birthYear ?? 0) - (b.birthYear ?? 0));
                    const ancestorIdSet = new Set(sortedAncestors.map((a) => a.id));
                    const rulerChildIdSet = new Set(ruler.children || []);
                    const isDirectChildOfRuler = (c: Character) =>
                      rulerChildIdSet.has(c.id) || c.knownFatherId === ruler.id || c.motherId === ruler.id;
                    const lowerKin = dynastyMembers
                      .filter((c) => c.id !== ruler.id && c.id !== ruler.spouseId && !ancestorIdSet.has(c.id))
                      .sort((a, b) => {
                        const aChild = isDirectChildOfRuler(a) ? 0 : 1;
                        const bChild = isDirectChildOfRuler(b) ? 0 : 1;
                        if (aChild !== bChild) return aChild - bChild;
                        return (a.birthYear ?? 0) - (b.birthYear ?? 0);
                      });
                    return (
                      <div className="flex flex-col items-center py-2 space-y-3">
                        {sortedAncestors.length > 0 && (
                          <>
                            <div className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">
                              Ancestral Forebears ({sortedAncestors.length})
                            </div>
                            <div className="flex flex-wrap justify-center gap-3 pb-2 border-b border-white/[0.08] w-full">
                              {sortedAncestors.map((anc) => (
                                <CharacterPortraitNode
                                  key={anc.id}
                                  char={anc}
                                  world={world}
                                  onClick={() => {
                                    setInspectedCharId(anc.id);
                                    onSelectCharacter(anc);
                                  }}
                                />
                              ))}
                            </div>
                            <div className="w-0.5 h-3 bg-stone-700" />
                          </>
                        )}
                        <div className="flex items-center gap-3">
                          <CharacterPortraitNode
                            char={ruler}
                            world={world}
                            isPrimary
                            onClick={() => { setInspectedCharId(ruler.id); onSelectCharacter(ruler); }}
                          />
                          {ruler.spouseId && (() => {
                            const sp = world.characters.find((c) => c.id === ruler.spouseId);
                            if (!sp) return null;
                            return (
                              <>
                                <div className="w-4 h-0.5 bg-amber-600/60" />
                                <CharacterPortraitNode
                                  char={sp}
                                  world={world}
                                  onClick={() => { setInspectedCharId(sp.id); onSelectCharacter(sp); }}
                                />
                              </>
                            );
                          })()}
                        </div>

                        <div className="w-0.5 h-4 bg-amber-600/60" />

                        <div className="flex flex-col items-center gap-2 border-t border-amber-600/40 pt-3 w-full">
                          <div className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">
                            Children, Siblings &amp; Kin ({lowerKin.length})
                          </div>
                          <div className="flex flex-wrap justify-center gap-3 w-full">
                            {lowerKin.map((child) => (
                              <CharacterPortraitNode
                                key={child.id}
                                char={child}
                                world={world}
                                onClick={() => { setInspectedCharId(child.id); onSelectCharacter(child); }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {subTab === 'council' && (
                    <div className="space-y-3">
                      <RoyalCouncilAdvisor world={world} realm={realm} />
                      <div className="text-[10px] font-bold uppercase text-stone-400 tracking-wider">Small Privy Council</div>
                      {councilMembers.map((m) => (
                        <CharacterListItem
                          key={m.id}
                          char={m}
                          world={world}
                          isSelected={m.id === activeChar?.id}
                          onSelect={() => { setInspectedCharId(m.id); onSelectCharacter(m); }}
                        />
                      ))}
                    </div>
                  )}

                  {subTab === 'dignitaries' && (
                    <div className="space-y-2">
                      <div className="text-[10px] font-bold uppercase text-stone-400 tracking-wider">Court Dignitaries</div>
                      {dignitaries.map((m) => (
                        <CharacterListItem
                          key={m.id}
                          char={m}
                          world={world}
                          isSelected={m.id === activeChar?.id}
                          onSelect={() => { setInspectedCharId(m.id); onSelectCharacter(m); }}
                        />
                      ))}
                    </div>
                  )}

                  {subTab === 'vassals' && (
                    <div className="space-y-2">
                      <div className="text-[10px] font-bold uppercase text-stone-400 tracking-wider">Sworn Vassal Lords</div>
                      {vassals.map((m) => (
                        <CharacterListItem
                          key={m.id}
                          char={m}
                          world={world}
                          isSelected={m.id === activeChar?.id}
                          onSelect={() => { setInspectedCharId(m.id); onSelectCharacter(m); }}
                        />
                      ))}
                    </div>
                  )}

                  {subTab === 'roster' && (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-stone-500 absolute left-2.5 top-2.5" />
                        <input
                          type="text"
                          placeholder="Search court nobles..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full pl-8 pr-3 py-1 bg-stone-950/80 border border-stone-800 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-600"
                        />
                      </div>
                      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                        {filteredRoster.map((m) => (
                          <CharacterListItem
                            key={m.id}
                            char={m}
                            world={world}
                            isSelected={m.id === activeChar?.id}
                            onSelect={() => { setInspectedCharId(m.id); onSelectCharacter(m); }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* PILLAR 2: WAR & STATE (Factions / Claims / Feuds / Sieges / Captives) */}
              {masterDomain === 'war' && (
                subTab === 'sieges' ? (
                  <div className="space-y-4">
                    {/* Active Sieges Section */}
                    <div className="space-y-2.5">
                      <div className="text-[11px] uppercase font-semibold text-stone-400 tracking-wider flex items-center justify-between">
                        <span>Active Encampments & Sieges ({world.activeSieges?.length || 0})</span>
                        <span className="text-amber-400 font-mono text-[10px]">Wall Breach & Attrition</span>
                      </div>

                      {(!world.activeSieges || world.activeSieges.length === 0) ? (
                        <div className="p-3 rounded-lg border border-white/[0.08] bg-stone-900/40 text-center text-stone-400 italic text-xs">
                          No citadels are currently under active siege lines. Marching hosts encircle holdings upon arrival.
                        </div>
                      ) : (
                        world.activeSieges.map((siege) => (
                          <div key={siege.id} className="p-3 rounded-lg border border-white/[0.08] bg-stone-900/50 space-y-2.5">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-stone-100 text-xs flex items-center gap-1.5">
                                <Shield className="w-3.5 h-3.5 text-amber-400" />
                                <span>{siege.holdingName}</span>
                              </span>
                              <span className="font-mono text-[11px] text-amber-300 tabular-nums">
                                Fort Lv.{siege.fortLevel}
                              </span>
                            </div>

                            {/* Wall Integrity Bar */}
                            <div className="space-y-1">
                              <div className="flex justify-between text-[11px] text-stone-300">
                                <span>Wall Integrity</span>
                                <span className="font-mono tabular-nums font-semibold text-amber-300">{siege.wallIntegrity}%</span>
                              </div>
                              <div className="w-full bg-stone-900 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-full transition-all ${
                                    siege.wallIntegrity < 30 ? 'bg-red-500' : 'bg-amber-500'
                                  }`}
                                  style={{ width: `${siege.wallIntegrity}%` }}
                                />
                              </div>
                            </div>

                            {/* Provisions & Garrison stats */}
                            <div className="grid grid-cols-2 divide-x divide-white/[0.07] border border-white/[0.07] rounded-md text-[11px] bg-stone-950/50">
                              <div className="px-2.5 py-1.5 flex justify-between items-center">
                                <span className="text-stone-400">Garrison</span>
                                <span className="font-mono tabular-nums font-semibold text-stone-200">{siege.garrisonCount}</span>
                              </div>
                              <div className="px-2.5 py-1.5 flex justify-between items-center">
                                <span className="text-stone-400">Provisions</span>
                                <span className={`font-mono tabular-nums font-semibold ${siege.provisionsMonths <= 1 ? 'text-red-400' : 'text-stone-200'}`}>
                                  {siege.provisionsMonths}mo left
                                </span>
                              </div>
                            </div>

                            {siege.diseaseOutbreak && (
                              <div className="px-2.5 py-1.5 rounded-md bg-red-950/60 border border-red-700/50 text-red-200 text-[11px] flex items-center gap-1.5 font-medium">
                                <Skull className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                <span>Camp Dysentery & Typhus has broken out in the siege trenches.</span>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>

                    {/* Marching Armies Section */}
                    <div className="space-y-2.5 pt-2 border-t border-white/[0.08]">
                      <div className="text-[11px] uppercase font-semibold text-stone-400 tracking-wider flex items-center justify-between">
                        <span>Campaigning Armies ({world.armies?.length || 0})</span>
                        <span className="text-stone-500 text-[10px]">On Field Transit</span>
                      </div>

                      {(!world.armies || world.armies.length === 0) ? (
                        <div className="p-3 rounded-lg border border-white/[0.08] bg-stone-900/40 text-center text-stone-400 italic text-xs">
                          No sovereign hosts are currently on the march. Declare claim wars in the Claims tab to mobilize regiments.
                        </div>
                      ) : (
                        world.armies.map((army) => {
                          const commander = world.characters.find((c) => c.id === (army.commanderId || army.attackerId));
                          const holding = world.holdings?.find((h) => h.id === army.targetHoldingId);
                          const displayArmyName = army.name || (commander?.name ? `${commander.name}'s Host` : 'Vanguard Army');
                          return (
                            <div key={army.id} className="p-3 rounded-lg border border-white/[0.08] bg-stone-900/50 space-y-1.5 text-[11px]">
                              <div className="flex items-center justify-between gap-2">
                                {editingArmyId === army.id ? (
                                  <div className="flex items-center gap-1 flex-1 min-w-0">
                                    <input
                                      type="text"
                                      value={armyNameDraft}
                                      onChange={(e) => setArmyNameDraft(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          onUpdateWorld(updateArmy(world, army.id, { name: armyNameDraft }));
                                          setEditingArmyId(null);
                                        } else if (e.key === 'Escape') {
                                          setEditingArmyId(null);
                                        }
                                      }}
                                      placeholder="Army name..."
                                      className="flex-1 min-w-0 px-1.5 py-0.5 rounded bg-stone-950 border border-amber-500/50 text-xs text-stone-100 focus:outline-none"
                                      autoFocus
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        onUpdateWorld(updateArmy(world, army.id, { name: armyNameDraft }));
                                        setEditingArmyId(null);
                                      }}
                                      className="p-0.5 text-emerald-400 hover:text-emerald-300 cursor-pointer"
                                      title="Save Army Name"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="font-semibold text-stone-200 text-xs flex items-center gap-1.5 min-w-0">
                                    <Swords className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                    <span className="truncate">{displayArmyName}</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingArmyId(army.id);
                                        setArmyNameDraft(army.name || displayArmyName);
                                      }}
                                      className="p-0.5 text-stone-400 hover:text-amber-300 cursor-pointer shrink-0"
                                      title="Rename Army"
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                  </span>
                                )}
                                <span className="font-mono tabular-nums text-amber-300 font-semibold shrink-0">{Math.round(army.strength)} men</span>
                              </div>
                              <div className="text-stone-400">
                                Marching on: <strong className="text-stone-200">{holding?.name || 'Enemy Fief'}</strong>
                              </div>
                              <div className="w-full bg-stone-900 rounded-full h-1.5 overflow-hidden mt-1">
                                <div
                                  className="bg-amber-500 h-full transition-all"
                                  style={{ width: `${Math.round((army.progress || 0) * 100)}%` }}
                                />
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : (
                  <V17GrandStrategyPanels
                    activeTab={subTab as any}
                    activeChar={activeChar}
                    world={world}
                    onUpdateWorld={(w) => onUpdateWorld?.(w)}
                    onNotify={(msg) => { setNotificationMsg(msg); setTimeout(() => setNotificationMsg(null), 5000); }}
                    onSelectCharacter={(c) => { setInspectedCharId(c.id); onSelectCharacter(c); }}
                    onOpenHouse={onOpenHouse}
                  />
                )
              )}

              {/* PILLAR 3: ECONOMY (Markets, Ledger, Banks, Routes) */}
              {masterDomain === 'economy' && (
                <div className="space-y-3">
                  {subTab === 'markets' && currentBurgMarket && (
                    <div className="space-y-2.5">
                      <div className="p-3 rounded-lg border border-white/[0.08] bg-stone-900/50 flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-stone-200 text-xs">{currentBurgMarket.burgName} Market</div>
                          <div className="text-[11px] text-stone-400">Trade Volume: <strong className="text-amber-300 font-mono tabular-nums">{currentBurgMarket.totalMarketVolume}g</strong></div>
                        </div>
                        {currentBurgMarket.isStarving && (
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-red-400">
                            Famine
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        {(Object.entries(currentBurgMarket.markets) as [CommodityType, any][]).map(([cType, m]) => (
                          <div key={cType} className="px-2.5 py-2 rounded-md border border-white/[0.07] bg-stone-900/40 flex justify-between items-center text-[11px]">
                            <span className="font-medium text-stone-300">{cType}</span>
                            <span className="font-mono tabular-nums font-semibold text-amber-300">{m.currentPrice}g</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {subTab === 'ledger' && activeFiscalProfile && (
                    <div className="p-3 rounded-lg border border-white/[0.08] bg-stone-900/50 space-y-2.5">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-stone-200">Net Monthly Cashflow</span>
                        <span className={`font-mono tabular-nums font-semibold ${activeFiscalProfile.netMonthlyCashflow >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {activeFiscalProfile.netMonthlyCashflow > 0 ? `+${activeFiscalProfile.netMonthlyCashflow}` : activeFiscalProfile.netMonthlyCashflow}g
                        </span>
                      </div>
                      <div className="text-[11px] text-stone-400 flex justify-between font-mono tabular-nums">
                        <span>Revenue: +{activeFiscalProfile.totalRevenue}g</span>
                        <span>Expenses: -{activeFiscalProfile.totalExpenses}g</span>
                      </div>

                      <div className="pt-2.5 border-t border-white/[0.07] flex items-center justify-between text-[11px]">
                        <span>Coin Purity: <strong className="text-amber-300 font-mono tabular-nums">{Math.round(realmPurity * 100)}%</strong></span>
                        <button
                          onClick={() => {
                            const updated = cloneWorldState(world);
                            debaseCurrency(updated, realm.id, 0.1);
                            onUpdateWorld?.(updated);
                            setNotificationMsg(`Royal Decree: Currency debased by 10% to mint emergency treasury coinage.`);
                          }}
                          className="px-2.5 py-1 bg-red-950/70 hover:bg-red-900 border border-red-700/50 rounded-md text-[11px] font-semibold text-red-200 cursor-pointer"
                        >
                          Debase Coinage (-10%)
                        </button>
                      </div>
                    </div>
                  )}

                  {subTab === 'banks' && economy && (
                    <div className="space-y-2">
                      {economy.bankInstitutions.map((bank) => (
                        <div key={bank.id} className="p-3 rounded-lg border border-white/[0.08] bg-stone-900/50 space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-stone-200">{bank.name}</span>
                            <span className="text-amber-300 font-mono tabular-nums text-[11px]">{Math.round(bank.baseInterestRate * 100)}% rate</span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                const updated = cloneWorldState(world);
                                const res = takeBankLoan(updated, bank.id, activeChar.id, 150);
                                if (res.success && res.loan) {
                                  onUpdateWorld?.(updated);
                                  setNotificationMsg(`Secured 150g loan from ${bank.name} at ${Math.round(bank.baseInterestRate * 100)}% annual interest.`);
                                }
                              }}
                              className="flex-1 py-1.5 bg-amber-600 hover:bg-amber-500 rounded-md text-[11px] font-semibold text-white cursor-pointer"
                            >
                              Borrow 150g
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {subTab === 'routes' && (
                    <div className="space-y-2">
                      <div className="text-[11px] uppercase font-semibold text-stone-400 tracking-wider flex items-center justify-between">
                        <span>Trade Corridors ({realmRoutes.length})</span>
                        <span className="text-amber-400 font-mono tabular-nums">{realmCaravans.length} Convoys</span>
                      </div>
                      <div className="divide-y divide-white/[0.06] border border-white/[0.08] rounded-lg bg-stone-900/40 max-h-60 overflow-y-auto">
                        {realmRoutes.map((route) => (
                          <div
                            key={route.id}
                            className="px-3 py-2 text-[11px] flex items-center justify-between"
                          >
                            <div className="min-w-0 pr-2">
                              <div className="font-medium text-stone-200 flex items-center gap-1.5 truncate">
                                {route.isMaritime ? (
                                  <Anchor className="w-3 h-3 text-sky-400 shrink-0" />
                                ) : (
                                  <Navigation className="w-3 h-3 text-amber-400 shrink-0" />
                                )}
                                <span className="truncate">{route.fromBurgName} - {route.toBurgName}</span>
                              </div>
                              <div className="text-[10px] text-stone-400">
                                Cargo: <span className="text-amber-300">{route.primaryGood}</span> · <span className="font-mono tabular-nums">{route.distanceKm} km</span>
                              </div>
                            </div>
                            <span className="font-mono tabular-nums text-stone-400 font-semibold shrink-0">Tier {route.trafficVolume}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* PILLAR 4: FIEF & MARCH (Citadel, County, Travel) */}
              {masterDomain === 'fief' && (
                <div className="space-y-3">
                  {subTab === 'citadel' && burg && (
                    <div className="p-3.5 glass-card rounded-xl space-y-2">
                      <div className="font-bold font-serif text-sm text-stone-100">{burg.name} ({burg.type})</div>
                      <div className="text-stone-300 font-serif italic text-[11px] leading-relaxed">{burg.lore}</div>
                      <div className="text-amber-300 font-mono pt-1">Population: {burg.population.toLocaleString()} souls</div>
                    </div>
                  )}

                  {subTab === 'county' && county && (
                    <div className="p-3.5 glass-card rounded-xl space-y-2">
                      <div className="font-bold font-serif text-sm text-stone-100">{county.name}</div>
                      <div className="text-stone-400 text-[11px]">Development Index: <strong className="text-amber-300 font-mono">{county.development}/100</strong></div>
                      {countyRuler && <div className="text-stone-300 text-[10px]">Ruler: <strong>{countyRuler.name}</strong></div>}
                    </div>
                  )}

                  {subTab === 'travel' && (
                    <V17GrandStrategyPanels
                      activeTab="travel"
                      activeChar={activeChar}
                      world={world}
                      onUpdateWorld={(w) => onUpdateWorld?.(w)}
                      onNotify={(msg) => setNotificationMsg(msg)}
                      onSelectCharacter={(c) => { setInspectedCharId(c.id); onSelectCharacter(c); }}
                      onOpenHouse={onOpenHouse}
                    />
                  )}
                </div>
              )}

              {/* PILLAR 5: LAWS & PESTILENCE */}
              {masterDomain === 'laws' && (
                <V17GrandStrategyPanels
                  activeTab={subTab as any}
                  activeChar={activeChar}
                  world={world}
                  onUpdateWorld={(w) => onUpdateWorld?.(w)}
                  onNotify={(msg) => setNotificationMsg(msg)}
                  onSelectCharacter={(c) => { setInspectedCharId(c.id); onSelectCharacter(c); }}
                  onOpenHouse={onOpenHouse}
                />
              )}

              {/* Inspected Character Dossier & Feudal Actions */}
              {activeChar && masterDomain === 'court' && (
                <CharacterDetailCard
                  char={activeChar}
                  world={world}
                  spouse={spouse}
                  heir={heir}
                  rival={rival}
                  lover={lover}
                  onSelectCharacter={(c) => { setInspectedCharId(c.id); onSelectCharacter(c); }}
                  onOpenHouse={onOpenHouse}
                  onTriggerEvent={() => setIsEventModalOpen(true)}
                  onExecuteScheme={() => {}}
                  onWeaveStoryForCharacter={onWeaveStoryForCharacter}
                  isMonarch={activeChar.id === ruler.id}
                  onUpdateWorld={onUpdateWorld}
                  onOpenHeraldryStudio={onOpenHeraldryStudio}
                />
              )}
            </div>
          </motion.aside>

      {/* Chronicle Event Dilemma Modal */}
      {isEventModalOpen && activeChar && (
        <ChronicleEventModal
          isOpen={isEventModalOpen}
          onClose={() => setIsEventModalOpen(false)}
          character={activeChar}
          world={world}
          onApplyEventOutcome={(txt, w) => { onUpdateWorld?.(w); setNotificationMsg(txt); }}
        />
      )}
    </>
  );
};

// ==========================================
// CHARACTER DETAIL CARD & FEUDAL ACTIONS
// ==========================================

const CharacterDetailCard: React.FC<{
  char: Character;
  world: WorldState;
  spouse?: Character;
  heir?: Character;
  rival?: Character;
  lover?: Character;
  onSelectCharacter: (char: Character) => void;
  onOpenHouse?: (houseName: string) => void;
  onTriggerEvent: () => void;
  onExecuteScheme: () => void;
  onWeaveStoryForCharacter?: (char: Character) => void;
  isMonarch: boolean;
  onUpdateWorld?: (w: WorldState) => void;
  onOpenHeraldryStudio?: (target: { kind: 'realm' | 'county' | 'burg' | 'character' | 'house'; id: string; label: string }) => void;
}> = ({
  char,
  world,
  spouse,
  heir,
  rival,
  lover,
  onSelectCharacter,
  onOpenHouse,
  onTriggerEvent,
  onWeaveStoryForCharacter,
  isMonarch,
  onUpdateWorld,
  onOpenHeraldryStudio,
}) => {
  const [isEditingIdentity, setIsEditingIdentity] = useState(false);
  const [charNameDraft, setCharNameDraft] = useState(char.name);
  const [charTitleDraft, setCharTitleDraft] = useState(char.title);
  const [charHouseDraft, setCharHouseDraft] = useState(char.houseName || '');
  const stats = computeCharacterStats(char);

  const monarch = world.characters.find((c) => c.id === world.monarchId && c.isAlive !== false) || world.characters[0];
  const gravitas = char.organicGravitas ? computeTotalGravitas(char.organicGravitas) : 120;
  const opinionOfMonarch = monarch && monarch.id !== char.id ? (char.opinions?.[monarch.id] ?? 0) : null;
  const heraldStatus = getCharacterHeraldStatus(char, world);
  const donorCanBestow = Boolean(monarch && monarch.id !== char.id && canBestowBanner(monarch));

  const handleSendGift = () => {
    const updated = cloneWorldState(world);
    const donor = updated.characters.find((c) => c.id === world.monarchId && c.isAlive !== false) || updated.characters[0];
    const target = updated.characters.find((c) => c.id === char.id);
    if (!donor || !target) return;
    PlayerActionEngine.sendGift(donor, target, 50, updated);
    onUpdateWorld?.(updated);
  };

  const handleBefriend = () => {
    const updated = cloneWorldState(world);
    const donor = updated.characters.find((c) => c.id === world.monarchId && c.isAlive !== false) || updated.characters[0];
    const target = updated.characters.find((c) => c.id === char.id);
    if (!donor || !target) return;
    PlayerActionEngine.befriendCharacter(donor, target, updated);
    onUpdateWorld?.(updated);
  };

  const handleDenounce = () => {
    const updated = cloneWorldState(world);
    const donor = updated.characters.find((c) => c.id === world.monarchId && c.isAlive !== false) || updated.characters[0];
    const target = updated.characters.find((c) => c.id === char.id);
    if (!donor || !target) return;
    PlayerActionEngine.denounceCharacter(donor, target, updated);
    onUpdateWorld?.(updated);
  };

  const handleBestowBanner = () => {
    const updated = cloneWorldState(world);
    const donor = updated.characters.find((c) => c.id === world.monarchId && c.isAlive !== false) || updated.characters[0];
    const target = updated.characters.find((c) => c.id === char.id);
    if (!donor || !target) return;
    PlayerActionEngine.bestowPersonalBanner(donor, target, updated);
    onUpdateWorld?.(updated);
  };

  return (
    <div className="p-3.5 rounded-lg border border-white/[0.08] bg-stone-900/45 space-y-3">
      {/* Identity Banner */}
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => onOpenHeraldryStudio?.({ kind: 'character', id: char.id, label: char.name })}
          disabled={!onOpenHeraldryStudio}
          title={onOpenHeraldryStudio ? 'Edit Personal Arms' : undefined}
          className={onOpenHeraldryStudio ? 'cursor-pointer rounded-md hover:ring-2 hover:ring-amber-400/60 transition-all shrink-0' : 'shrink-0'}
        >
          <HeraldryShield
            coatOfArms={char.coatOfArms}
            unheralded={!char.coatOfArms}
            seed={`${char.realmId}_${char.houseName}_${char.id}`}
            size={44}
          />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <div className="font-serif font-bold text-stone-100 truncate text-xs">{char.name}</div>
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setCharNameDraft(char.name);
                  setCharTitleDraft(char.title);
                  setCharHouseDraft(char.houseName || '');
                  setIsEditingIdentity((v) => !v);
                }}
                className="p-1 text-stone-400 hover:text-amber-300 cursor-pointer"
                title="Edit Name & Title"
              >
                <Pencil className="w-3 h-3" />
              </button>
              {onOpenHeraldryStudio && (
                <button
                  type="button"
                  onClick={() => onOpenHeraldryStudio({ kind: 'character', id: char.id, label: char.name })}
                  className="p-1 text-stone-400 hover:text-amber-300 cursor-pointer"
                  title="Edit Personal Arms"
                >
                  <Palette className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
          {isEditingIdentity ? (
            <div className="mt-1.5 p-2 rounded bg-stone-950/90 border border-amber-500/40 space-y-1.5">
              <input
                type="text"
                value={charNameDraft}
                onChange={(e) => setCharNameDraft(e.target.value)}
                placeholder="Character name"
                className="w-full px-2 py-1 rounded bg-stone-900 border border-stone-700 text-[11px] text-stone-100 focus:outline-none focus:border-amber-500"
              />
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  value={charTitleDraft}
                  onChange={(e) => setCharTitleDraft(e.target.value)}
                  placeholder="Title"
                  className="w-full px-2 py-1 rounded bg-stone-900 border border-stone-700 text-[11px] text-stone-100 focus:outline-none focus:border-amber-500"
                />
                <input
                  type="text"
                  value={charHouseDraft}
                  onChange={(e) => setCharHouseDraft(e.target.value)}
                  placeholder="House"
                  className="w-full px-2 py-1 rounded bg-stone-900 border border-stone-700 text-[11px] text-stone-100 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="flex justify-end gap-1">
                <button
                  type="button"
                  onClick={() => setIsEditingIdentity(false)}
                  className="px-2 py-0.5 rounded text-[10px] text-stone-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const res = updateCharacter(world, char.id, {
                      name: charNameDraft,
                      title: charTitleDraft,
                      houseName: charHouseDraft,
                    });
                    onUpdateWorld?.(res.world);
                    setIsEditingIdentity(false);
                  }}
                  className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-semibold cursor-pointer"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="text-[11px] text-amber-300 font-medium truncate">{char.title}</div>
              <div className="text-[10px] text-stone-400">
                <button
                  type="button"
                  onClick={() => char.houseName && onOpenHouse?.(char.houseName)}
                  className="text-amber-300 hover:text-amber-200 underline decoration-amber-500/40 cursor-pointer"
                >
                  House {char.houseName}
                </button>{' '}
                · Age <span className="font-mono tabular-nums">{char.age}</span> · Gravitas <strong className="text-amber-200 font-mono tabular-nums">{gravitas}</strong>
                {opinionOfMonarch !== null && (
                  <span className="font-mono tabular-nums"> · Opinion {opinionOfMonarch >= 0 ? `+${opinionOfMonarch}` : opinionOfMonarch}</span>
                )}
              </div>
              <div className="text-[10px] text-amber-400/80 truncate mt-0.5" title={heraldStatus.subtitle}>
                {heraldStatus.label}
              </div>
              {char.coatOfArms?.blazon && (
                <div className="text-[10px] text-stone-500 italic truncate" title={char.coatOfArms.blazon}>
                  {char.coatOfArms.blazon}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 5 Core Attributes */}
      <div className="grid grid-cols-5 divide-x divide-white/[0.07] border border-white/[0.07] rounded-md bg-stone-950/50 text-center font-mono tabular-nums text-[10px]">
        <div className="py-1.5">
          <div className="text-stone-400">DIP</div>
          <div className="font-bold text-stone-200 text-xs">{stats.diplomacy}</div>
        </div>
        <div className="py-1.5">
          <div className="text-stone-400">MAR</div>
          <div className="font-bold text-stone-200 text-xs">{stats.martial}</div>
        </div>
        <div className="py-1.5">
          <div className="text-stone-400">STE</div>
          <div className="font-bold text-stone-200 text-xs">{stats.stewardship}</div>
        </div>
        <div className="py-1.5">
          <div className="text-stone-400">INT</div>
          <div className="font-bold text-stone-200 text-xs">{stats.intrigue}</div>
        </div>
        <div className="py-1.5">
          <div className="text-stone-400">LRN</div>
          <div className="font-bold text-stone-200 text-xs">{stats.learning}</div>
        </div>
      </div>

      {/* Feudal Decrees Tray */}
      <div className="pt-2.5 border-t border-white/[0.08] space-y-2">
        <div className="flex items-center justify-between text-[11px] uppercase font-semibold text-amber-400 tracking-wider">
          <span>Feudal Decrees</span>
        </div>

        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
          <button
            onClick={handleSendGift}
            className="py-1.5 px-2 rounded-md bg-stone-900 hover:bg-stone-800 border border-white/[0.08] text-stone-200 text-center font-medium cursor-pointer transition-colors"
          >
            Send 50g Gift
          </button>
          <button
            onClick={onTriggerEvent}
            className="py-1.5 px-2 rounded-md bg-amber-600 hover:bg-amber-500 text-white font-semibold text-center cursor-pointer transition-colors"
          >
            Court Dilemma
          </button>
          {!isMonarch && (
            <>
              <button
                onClick={handleBefriend}
                className="py-1.5 px-2 rounded-md bg-emerald-950/50 hover:bg-emerald-900/60 border border-emerald-700/40 text-emerald-200 text-center font-medium cursor-pointer transition-colors"
              >
                Befriend
              </button>
              <button
                onClick={handleDenounce}
                className="py-1.5 px-2 rounded-md bg-rose-950/50 hover:bg-rose-900/60 border border-rose-700/40 text-rose-200 text-center font-medium cursor-pointer transition-colors"
              >
                Denounce
              </button>
              {!char.hasPersonalBanner && (
                <button
                  onClick={handleBestowBanner}
                  disabled={!donorCanBestow}
                  title={
                    donorCanBestow
                      ? 'Confer a personal heraldic banner (great honor bestowable only by a Duke or King)'
                      : 'Only ranks of Duke or King may bestow a personal banner'
                  }
                  className="col-span-2 py-1.5 px-2 rounded-md bg-amber-950/50 hover:bg-amber-900/60 disabled:opacity-45 disabled:cursor-not-allowed border border-amber-700/40 text-amber-200 text-center font-medium cursor-pointer transition-colors"
                >
                  {donorCanBestow ? 'Bestow Personal Banner' : 'Bestow Banner (Duke or King Required)'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {onWeaveStoryForCharacter && (
        <button
          onClick={() => onWeaveStoryForCharacter(char)}
          className="w-full py-1.5 bg-stone-900 hover:bg-stone-800 text-stone-300 border border-white/[0.08] rounded-md text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
        >
          <Feather className="w-3.5 h-3.5 text-amber-400" />
          <span>Weave Saga with {char.name.split(' ')[0]}</span>
        </button>
      )}
    </div>
  );
};

const CharacterListItem: React.FC<{ char: Character; world: WorldState; isSelected: boolean; onSelect: () => void }> = ({ char, world, isSelected, onSelect }) => (
  <div
    onClick={onSelect}
    className={`p-2 rounded-lg transition-all cursor-pointer flex items-center justify-between gap-2 ${
      isSelected ? 'bg-amber-600/25 border border-amber-500/40' : 'hover:bg-stone-800/50 border border-transparent'
    }`}
  >
    <div className="flex items-center gap-2 min-w-0">
      <HeraldryShield
        coatOfArms={char.coatOfArms}
        unheralded={!char.coatOfArms}
        seed={`${char.realmId}_${char.houseName}_${char.id}`}
        size={26}
      />
      <div className="min-w-0">
        <div className="font-serif font-semibold text-stone-200 text-xs truncate">{char.name}</div>
        <div className="text-[10px] text-amber-400/80 truncate">{formatCharacterRoleLabel(char, world)}</div>
      </div>
    </div>
    <span className="text-[11px] text-stone-400 font-mono tabular-nums">Age {char.age}</span>
  </div>
);

const CharacterPortraitNode = ({ char, world, isPrimary, onClick }: { char: Character; world: WorldState; isPrimary?: boolean; onClick: () => void }) => {
  const isDeceased = char.isAlive === false;
  return (
    <div onClick={onClick} className="flex flex-col items-center gap-1 cursor-pointer group">
      <div
        className={`p-1 rounded-lg flex items-center justify-center transition-all border ${
          isDeceased
            ? 'border-white/[0.08] bg-stone-900/60 opacity-75 grayscale'
            : isPrimary
            ? 'border-amber-400 bg-amber-950/30 ring-1 ring-amber-500/40'
            : 'border-white/[0.08] bg-stone-900/50 group-hover:border-amber-400'
        }`}
      >
        <HeraldryShield
          coatOfArms={char.coatOfArms}
          unheralded={!char.coatOfArms}
          seed={`${char.realmId}_${char.houseName}_${char.id}`}
          size={38}
        />
      </div>
      <div className="text-[11px] font-semibold text-stone-200 group-hover:text-amber-300 text-center max-w-[78px] leading-tight truncate">
        {isDeceased ? `† ${char.name.split(' ')[0]}` : char.name.split(' ')[0]}
      </div>
      <div className="text-[10px] text-stone-400 text-center truncate max-w-[78px]">
        {isDeceased ? `${char.birthYear ?? '?'}–${char.deathYear ?? '?'}` : formatCharacterRoleLabel(char, world)}
      </div>
    </div>
  );
};