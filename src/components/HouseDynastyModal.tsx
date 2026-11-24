import React, { useMemo, useState, useEffect } from 'react';
import {
  X,
  Search,
  Crown,
  ScrollText,
  Shield,
  Users,
  HeartHandshake,
  Scale,
  Sparkles,
  GitBranch,
  Ban,
  ChevronRight,
  Skull,
  Pencil,
  Palette,
  Plus,
  Check,
} from 'lucide-react';
import type { Character, CourtRole, WorldState } from '../types/world';
import {
  buildHouseDynastyTree,
  computeHouseProfile,
  getAllHouseProfiles,
  revokeAncestralClaimByDecree,
  type HousePowerTier,
  type HouseProfile,
} from '../engine/houseEngine';
import { HeraldryShield } from './HeraldryShield';
import { updateHouse, createCustomCharacter } from '../engine/worldEditor';
import { formatCharacterRoleLabel } from '../engine/fantasyTables';

interface HouseDynastyModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialHouseName?: string | null;
  world: WorldState;
  activeRealmId?: string | null;
  onSelectCharacter: (char: Character) => void;
  onUpdateWorld: (next: WorldState) => void;
  onNotify?: (msg: string) => void;
  embedded?: boolean;
  onOpenHeraldryStudio?: (target: { kind: 'realm' | 'county' | 'burg' | 'character' | 'house'; id: string; label: string }) => void;
}

type ModalTab = 'tree' | 'claims' | 'leverage';

function tierAccentClass(tier: HousePowerTier): string {
  switch (tier) {
    case 'Paramount Dynasty':
      return 'text-amber-300 border-amber-500/50 bg-amber-500/12';
    case 'Great House':
      return 'text-yellow-300 border-yellow-500/40 bg-yellow-500/10';
    case 'Illustrious House':
      return 'text-sky-300 border-sky-500/40 bg-sky-500/10';
    case 'Established House':
      return 'text-emerald-300 border-emerald-500/35 bg-emerald-500/10';
    default:
      return 'text-slate-300 border-slate-600/50 bg-slate-800/60';
  }
}

export const HouseDynastyModal: React.FC<HouseDynastyModalProps> = ({
  isOpen,
  onClose,
  initialHouseName,
  world,
  activeRealmId,
  onSelectCharacter,
  onUpdateWorld,
  onNotify,
  embedded = false,
  onOpenHeraldryStudio,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [realmFilterId, setRealmFilterId] = useState<string>('all');
  const [selectedHouse, setSelectedHouse] = useState<string>('');
  const [activeTab, setActiveTab] = useState<ModalTab>('tree');
  const [treeViewMode, setTreeViewMode] = useState<'dynastic' | 'ancestral'>('dynastic');
  const [pedigreeSubjectId, setPedigreeSubjectId] = useState<string>('');
  const [selectedTreeCharId, setSelectedTreeCharId] = useState<string>('');
  const [decreeNotice, setDecreeNotice] = useState<string | null>(null);

  // Builder Mode editing states
  const [isEditingHouse, setIsEditingHouse] = useState(false);
  const [houseNameDraft, setHouseNameDraft] = useState('');
  const [houseMottoDraft, setHouseMottoDraft] = useState('');
  const [isAddingNoble, setIsAddingNoble] = useState(false);
  const [newNobleDraft, setNewNobleDraft] = useState({
    name: '',
    gender: 'male' as 'male' | 'female',
    age: 26,
    isAlive: true,
    role: 'Hedge Knight' as CourtRole,
    title: '',
    knownFatherId: '',
    motherId: '',
    spouseId: '',
    causeOfDeath: '',
  });

  const allHouses = useMemo(() => getAllHouseProfiles(world), [world]);

  // Sync only when opened or initialHouseName explicitly changes — never override user's manual house selection
  useEffect(() => {
    if (!isOpen && !embedded) return;
    setDecreeNotice(null);
    if (initialHouseName) {
      const normalized = initialHouseName.replace(/^House\s+/i, '').trim().toLowerCase();
      const matched = allHouses.find((h) => h.houseName.toLowerCase() === normalized);
      if (matched) {
        setSelectedHouse(matched.houseName);
        setSearchQuery('');
        setRealmFilterId('all');
      }
    }
  }, [isOpen, embedded, initialHouseName, allHouses]);

  // Ensure a valid default house is selected on initial load or if the world changes
  useEffect(() => {
    if (!isOpen && !embedded) return;
    if (selectedHouse && allHouses.some((h) => h.houseName === selectedHouse)) return;
    const monarch = world.characters.find((c) => c.id === world.monarchId);
    if (monarch?.houseName && allHouses.some((h) => h.houseName === monarch.houseName)) {
      setSelectedHouse(monarch.houseName);
    } else if (allHouses[0]) {
      setSelectedHouse(allHouses[0].houseName);
    }
  }, [isOpen, embedded, allHouses, selectedHouse, world.characters, world.monarchId]);

  const filteredHouses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allHouses.filter((h) => {
      if (realmFilterId !== 'all') {
        const realmObj = world.realms.find((r) => r.id === realmFilterId);
        if (realmObj && h.primaryRealmName !== realmObj.name) {
          return false;
        }
      }
      if (!q) return true;
      return (
        h.houseName.toLowerCase().includes(q) ||
        h.motto.toLowerCase().includes(q) ||
        h.powerTier.toLowerCase().includes(q) ||
        (h.primaryRealmName || '').toLowerCase().includes(q)
      );
    });
  }, [allHouses, searchQuery, realmFilterId, world.realms]);

  const profile: HouseProfile | null = useMemo(() => {
    if (!selectedHouse) return null;
    return computeHouseProfile(selectedHouse, world);
  }, [selectedHouse, world]);

  const dynastyTree = useMemo(() => {
    if (!selectedHouse) return null;
    return buildHouseDynastyTree(selectedHouse, world);
  }, [selectedHouse, world]);

  const activeMonarch = useMemo(() => {
    const realm =
      world.realms.find((r) => r.id === activeRealmId) ||
      world.realms.find((r) => r.rulerId === world.monarchId) ||
      world.realms[0];
    if (realm?.rulerId) {
      const ruler = world.characters.find((c) => c.id === realm.rulerId && c.isAlive !== false);
      if (ruler) return ruler;
    }
    return world.characters.find((c) => c.id === world.monarchId && c.isAlive !== false) || null;
  }, [world, activeRealmId]);

  const charById = useMemo(() => {
    const map = new Map<string, Character>();
    for (const c of world.characters || []) {
      map.set(c.id, c);
    }
    return map;
  }, [world.characters]);

  const houseMembers = useMemo(() => {
    if (!dynastyTree) return [];
    return dynastyTree.generations.flatMap((g) => g.members);
  }, [dynastyTree]);

  const pedigreeSubject = useMemo(() => {
    if (pedigreeSubjectId && charById.has(pedigreeSubjectId)) {
      const candidate = charById.get(pedigreeSubjectId)!;
      if (candidate.houseName === selectedHouse) return candidate;
    }
    return profile?.head || houseMembers.find((m) => m.isAlive !== false) || houseMembers[0] || null;
  }, [pedigreeSubjectId, charById, selectedHouse, profile, houseMembers]);

  const houseMemberSet = useMemo(() => new Set(houseMembers.map((m) => m.id)), [houseMembers]);

  const dynasticChildrenMap = useMemo(() => {
    const map = new Map<string, Character[]>();
    const includedIds = new Set<string>();
    const candidates = [...houseMembers];
    for (const c of world.characters || []) {
      if (houseMemberSet.has(c.id)) continue;
      const hasHouseParent =
        (c.knownFatherId && houseMemberSet.has(c.knownFatherId)) ||
        (c.realFatherId && houseMemberSet.has(c.realFatherId)) ||
        (c.motherId && houseMemberSet.has(c.motherId));
      if (hasHouseParent) {
        candidates.push(c);
      }
    }
    const candidateIdSet = new Set(candidates.map((c) => c.id));
    for (const hm of houseMembers) {
      for (const childId of hm.children || []) {
        if (!candidateIdSet.has(childId)) {
          const ch = charById.get(childId);
          if (ch) {
            candidates.push(ch);
            candidateIdSet.add(childId);
          }
        }
      }
    }
    const fallbackParentByChild = new Map<string, string>();
    for (const hm of houseMembers) {
      for (const childId of hm.children || []) {
        if (!fallbackParentByChild.has(childId)) {
          fallbackParentByChild.set(childId, hm.id);
        }
      }
    }
    for (const m of candidates) {
      if (includedIds.has(m.id)) continue;
      const parentId =
        (m.knownFatherId && houseMemberSet.has(m.knownFatherId) ? m.knownFatherId : null) ||
        (m.motherId && houseMemberSet.has(m.motherId) ? m.motherId : null) ||
        (m.realFatherId && houseMemberSet.has(m.realFatherId) ? m.realFatherId : null) ||
        fallbackParentByChild.get(m.id) ||
        null;
      if (parentId && parentId !== m.id) {
        includedIds.add(m.id);
        const list = map.get(parentId) || [];
        list.push(m);
        map.set(parentId, list);
      }
    }
    for (const [, list] of map.entries()) {
      list.sort((a, b) => (a.birthYear ?? 0) - (b.birthYear ?? 0));
    }
    return map;
  }, [houseMembers, houseMemberSet, world.characters, charById]);

  const dynasticRoots = useMemo(() => {
    const childIdSet = new Set<string>();
    for (const list of dynasticChildrenMap.values()) {
      for (const ch of list) childIdSet.add(ch.id);
    }
    return houseMembers
      .filter((m) => !childIdSet.has(m.id))
      .sort((a, b) => (a.birthYear ?? 0) - (b.birthYear ?? 0));
  }, [houseMembers, dynasticChildrenMap]);

  if (!isOpen && !embedded) return null;

  const handleRevokeClaim = (claimantId: string, holdingId: string) => {
    if (!activeMonarch) return;
    const nextWorld: WorldState = {
      ...world,
      characters: world.characters.map((c) => ({
        ...c,
        claims: c.claims ? c.claims.map((cl) => ({ ...cl })) : [],
        opinions: c.opinions ? { ...c.opinions } : {},
      })),
      history: [...(world.history || [])],
    };
    const nextMonarch = nextWorld.characters.find((c) => c.id === activeMonarch.id);
    if (!nextMonarch) return;

    const result = revokeAncestralClaimByDecree(nextMonarch, claimantId, holdingId, nextWorld);
    setDecreeNotice(result.summary);
    if (result.success) {
      onUpdateWorld(nextWorld);
      onNotify?.(result.summary);
    }
  };

  const content = (
    <div
      className={
        embedded
          ? 'w-full h-full bg-slate-950 flex flex-col overflow-hidden text-slate-100'
          : 'w-full max-w-6xl h-[86vh] bg-slate-950 border border-amber-500/30 rounded-xl shadow-2xl flex flex-col overflow-hidden text-slate-100'
      }
      onClick={(e) => e.stopPropagation()}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-900/90">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-300">
            <Crown className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-wide uppercase text-amber-200">
              Noble Houses &amp; Dynasty Trees
            </h2>
            <p className="text-[11px] text-slate-400">
              Select any noble house across the realms to inspect its lineage, ancestral claims, and dynastic prestige
            </p>
          </div>
        </div>
        {!embedded && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Close Dynasty Browser"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Main Split Body */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Sidebar: House Directory */}
        <aside className="w-76 shrink-0 border-r border-slate-800 bg-slate-900/50 flex flex-col min-h-0">
          <div className="p-3 border-b border-slate-800 space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search houses, mottos, realms..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-700/80 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/60"
              />
            </div>
            <select
              value={realmFilterId}
              onChange={(e) => setRealmFilterId(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-700/80 rounded-lg text-slate-200 focus:outline-none focus:border-amber-500/60 cursor-pointer"
            >
              <option value="all">All Realms ({allHouses.length} Houses)</option>
              {world.realms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <div className="flex items-center justify-between text-[10px] text-slate-500 uppercase tracking-wider">
              <span className="tabular-nums">{filteredHouses.length} Noble Houses</span>
              <span>Ranked by Influence</span>
            </div>
          </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
              {filteredHouses.length === 0 ? (
                <div className="p-4 text-xs text-slate-400 leading-relaxed">
                  {allHouses.length === 0
                    ? 'No noble houses exist yet on this blank canvas. Paint landmasses and use Auto-Populate Terrain or create kingdoms in World Builder.'
                    : 'No noble houses match the current search filter.'}
                </div>
              ) : filteredHouses.map((h) => {
                const isSelected = h.houseName === selectedHouse;
                return (
                  <button
                    key={h.houseName}
                    onClick={() => {
                      setSelectedHouse(h.houseName);
                      setDecreeNotice(null);
                    }}
                    className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition-colors ${
                      isSelected
                        ? 'bg-amber-500/12 border-r-2 border-amber-400'
                        : 'hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="shrink-0">
                      {h.coatOfArms ? (
                        <HeraldryShield coatOfArms={h.coatOfArms} seed={`house_${h.houseName}`} size={32} />
                      ) : (
                        <div className="w-8 h-8 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-amber-300">
                          {h.houseName.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold text-slate-100 truncate">
                          House {h.houseName}
                        </span>
                        <span className="text-[11px] font-bold text-amber-300 tabular-nums shrink-0">
                          {h.influenceScore}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <span className="text-[10px] text-slate-400 truncate">
                          {h.powerTier}
                        </span>
                        <span className="text-[10px] text-slate-500 tabular-nums shrink-0">
                          {h.livingMembers.length}L · {h.ancestors.length}A
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
              {filteredHouses.length === 0 && (
                <div className="p-6 text-center text-xs text-slate-500">
                  No noble houses match &ldquo;{searchQuery}&rdquo;.
                </div>
              )}
            </div>
          </aside>

          {/* Right Workspace: Selected House Details */}
          <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-slate-950">
            {profile && dynastyTree ? (
              <>
                {/* House Banner & Core Metrics */}
                <div className="p-5 border-b border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900/80 to-slate-950">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      {profile.coatOfArms ? (
                        <HeraldryShield coatOfArms={profile.coatOfArms} seed={`house_${profile.houseName}`} size={58} />
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-slate-800 border border-amber-500/40 flex items-center justify-center text-xl font-bold text-amber-300">
                          {profile.houseName.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-xl font-bold text-amber-100 tracking-tight">
                            House {profile.houseName}
                          </h3>
                          <span
                            className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border rounded ${tierAccentClass(
                              profile.powerTier
                            )}`}
                          >
                            {profile.powerTier}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setHouseNameDraft(profile.houseName);
                              setHouseMottoDraft(profile.motto || '');
                              setIsEditingHouse((v) => !v);
                            }}
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-amber-600/25 border border-amber-500/40 text-amber-300 text-[10px] font-medium flex items-center gap-1 cursor-pointer"
                          >
                            <Pencil className="w-3 h-3" />
                            Edit House
                          </button>
                          {onOpenHeraldryStudio && (
                            <button
                              type="button"
                              onClick={() =>
                                onOpenHeraldryStudio({
                                  kind: 'house',
                                  id: profile.houseName,
                                  label: `House ${profile.houseName}`,
                                })
                              }
                              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-amber-600/25 border border-slate-700 text-amber-300 text-[10px] font-medium flex items-center gap-1 cursor-pointer"
                            >
                              <Palette className="w-3 h-3" />
                              Edit Arms
                            </button>
                          )}
                        </div>
                        <p className="text-xs italic text-slate-400 mt-0.5">
                          &ldquo;{profile.motto}&rdquo;
                        </p>
                        {isEditingHouse && (
                          <div className="mt-2.5 p-2.5 rounded-lg bg-slate-950/90 border border-amber-500/35 flex flex-wrap items-end gap-2">
                            <div>
                              <label className="block text-[10px] text-slate-400 uppercase mb-0.5">House Name</label>
                              <input
                                type="text"
                                value={houseNameDraft}
                                onChange={(e) => setHouseNameDraft(e.target.value)}
                                className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-slate-100"
                              />
                            </div>
                            <div className="flex-1 min-w-[180px]">
                              <label className="block text-[10px] text-slate-400 uppercase mb-0.5">House Motto</label>
                              <input
                                type="text"
                                value={houseMottoDraft}
                                onChange={(e) => setHouseMottoDraft(e.target.value)}
                                className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-slate-100"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const trimmed = houseNameDraft.trim() || profile.houseName;
                                const next = updateHouse(world, profile.houseName, activeRealmId || undefined, {
                                  houseName: trimmed,
                                  motto: houseMottoDraft,
                                });
                                onUpdateWorld(next);
                                setSelectedHouse(trimmed);
                                setIsEditingHouse(false);
                                onNotify?.(`Updated House ${trimmed}.`);
                              }}
                              className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <Check className="w-3 h-3" />
                              Save
                            </button>
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-[11px] text-slate-300">
                          {profile.primaryRealmName && (
                            <span className="flex items-center gap-1">
                              <Shield className="w-3 h-3 text-amber-400" />
                              Realm: <strong className="text-slate-100">{profile.primaryRealmName}</strong>
                            </span>
                          )}
                          {profile.head && (
                            <button
                              onClick={() => {
                                onSelectCharacter(profile.head!);
                                onClose();
                              }}
                              className="flex items-center gap-1 text-amber-300 hover:text-amber-200 underline decoration-amber-500/40 underline-offset-2"
                            >
                              <Crown className="w-3 h-3" />
                              Head: {profile.head.name}
                            </button>
                          )}
                          {profile.parentDynasty && (
                            <button
                              onClick={() => setSelectedHouse(profile.parentDynasty!)}
                              className="flex items-center gap-1 text-sky-300 hover:text-sky-200"
                            >
                              <GitBranch className="w-3 h-3" />
                              Cadet of House {profile.parentDynasty}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 4-Metric Power Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
                      <div className="px-3 py-2 rounded-lg bg-slate-900/90 border border-slate-800">
                        <div className="text-[10px] uppercase tracking-wider text-slate-400">
                          House Prestige
                        </div>
                        <div className="text-base font-bold text-amber-300 tabular-nums">
                          {profile.totalPrestige.toLocaleString()}
                        </div>
                      </div>
                      <div className="px-3 py-2 rounded-lg bg-slate-900/90 border border-slate-800">
                        <div className="text-[10px] uppercase tracking-wider text-slate-400">
                          Influence
                        </div>
                        <div className="text-base font-bold text-sky-300 tabular-nums">
                          {profile.influenceScore}
                          <span className="text-[10px] text-slate-500 font-normal">/100</span>
                        </div>
                      </div>
                      <div className="px-3 py-2 rounded-lg bg-slate-900/90 border border-slate-800">
                        <div className="text-[10px] uppercase tracking-wider text-slate-400">
                          Negotiation
                        </div>
                        <div
                          className={`text-base font-bold tabular-nums ${
                            profile.negotiatingPower >= 0 ? 'text-emerald-300' : 'text-rose-300'
                          }`}
                        >
                          {profile.negotiatingPower >= 0 ? '+' : ''}
                          {profile.negotiatingPower}
                        </div>
                      </div>
                      <div className="px-3 py-2 rounded-lg bg-slate-900/90 border border-slate-800">
                        <div className="text-[10px] uppercase tracking-wider text-slate-400">
                          Marriage Appeal
                        </div>
                        <div className="text-base font-bold text-pink-300 tabular-nums">
                          {profile.marriageAppeal}
                          <span className="text-[10px] text-slate-500 font-normal">/100</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sub-Navigation Tabs */}
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-800/80">
                    <button
                      onClick={() => setActiveTab('tree')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                        activeTab === 'tree'
                          ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      Dynasty Tree &amp; Ancestors ({dynastyTree.totalLiving} Living · {dynastyTree.totalAncestors} Ancestors)
                    </button>
                    <button
                      onClick={() => setActiveTab('claims')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                        activeTab === 'claims'
                          ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                      }`}
                    >
                      <ScrollText className="w-3.5 h-3.5" />
                      Ancestral Claims ({profile.ancestralClaims.length})
                    </button>
                    <button
                      onClick={() => setActiveTab('leverage')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                        activeTab === 'leverage'
                          ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                      }`}
                    >
                      <Scale className="w-3.5 h-3.5" />
                      Alliances &amp; Prestige Leverage
                    </button>
                  </div>
                </div>

                {/* Scrollable Tab Content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                  {decreeNotice && (
                    <div className="px-4 py-2.5 rounded-lg bg-amber-500/12 border border-amber-500/40 text-xs text-amber-100 flex items-center justify-between gap-2">
                      <span>{decreeNotice}</span>
                      <button
                        onClick={() => setDecreeNotice(null)}
                        className="text-amber-300 hover:text-white"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* TAB 1: VISUAL DYNASTIC & ANCESTRAL TREES */}
                  {activeTab === 'tree' && (
                    <div className="space-y-5">
                      {/* View Mode Switcher: Dynastic Tree vs Ancestral Pedigree Tree */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                        <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 rounded-lg p-1">
                          <button
                            onClick={() => setTreeViewMode('dynastic')}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                              treeViewMode === 'dynastic'
                                ? 'bg-amber-600/25 text-amber-200 border border-amber-500/45'
                                : 'text-slate-400 hover:text-slate-200 border border-transparent'
                            }`}
                          >
                            <GitBranch className="w-3.5 h-3.5" />
                            Dynastic Tree (Lineage)
                          </button>
                          <button
                            onClick={() => setTreeViewMode('ancestral')}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                              treeViewMode === 'ancestral'
                                ? 'bg-amber-600/25 text-amber-200 border border-amber-500/45'
                                : 'text-slate-400 hover:text-slate-200 border border-transparent'
                            }`}
                          >
                            <Users className="w-3.5 h-3.5" />
                            Ancestral Tree (Pedigree)
                          </button>
                        </div>

                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-700/40 text-emerald-300 tabular-nums">
                            Living: {profile.livingMembers.length}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-stone-900/90 border border-stone-700/70 text-stone-300 tabular-nums flex items-center gap-1">
                            <Skull className="w-3 h-3 text-stone-400" />
                            Deceased Ancestors: {profile.ancestors.length}
                          </span>
                          {world.appMode === 'builder' && (
                            <button
                              type="button"
                              onClick={() => setIsAddingNoble((v) => !v)}
                              className="px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              Add Noble / Ancestor
                            </button>
                          )}
                        </div>

                        {treeViewMode === 'ancestral' && houseMembers.length > 0 && (
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-slate-400">Trace Ancestors of:</span>
                            <select
                              value={pedigreeSubject?.id || ''}
                              onChange={(e) => setPedigreeSubjectId(e.target.value)}
                              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-amber-200 focus:outline-none focus:border-amber-500"
                            >
                              {houseMembers.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name} {m.isAlive === false ? '(† Deceased)' : ''} · {formatCharacterRoleLabel(m, world)}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>

                      {/* World Builder: Add Custom Noble / Ancestor Inline Form */}
                      {world.appMode === 'builder' && isAddingNoble && (
                        <div className="p-3.5 rounded-lg bg-slate-900/90 border border-amber-500/40 space-y-2.5 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold uppercase tracking-wider text-[11px] text-amber-300">
                              Create Member of House {profile.houseName}
                            </span>
                            <button
                              type="button"
                              onClick={() => setIsAddingNoble(false)}
                              className="text-slate-400 hover:text-white text-[11px] cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                            <div>
                              <label className="block text-[10px] text-slate-400 mb-0.5">Full Name</label>
                              <input
                                type="text"
                                value={newNobleDraft.name}
                                onChange={(e) => setNewNobleDraft((d) => ({ ...d, name: e.target.value }))}
                                placeholder="e.g. Ser Aldous"
                                className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 text-slate-100 text-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-400 mb-0.5">Title</label>
                              <input
                                type="text"
                                value={newNobleDraft.title}
                                onChange={(e) => setNewNobleDraft((d) => ({ ...d, title: e.target.value }))}
                                placeholder="Lord / Founder"
                                className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 text-slate-100 text-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-400 mb-0.5">Role</label>
                              <select
                                value={newNobleDraft.role}
                                onChange={(e) => setNewNobleDraft((d) => ({ ...d, role: e.target.value as CourtRole }))}
                                className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 text-slate-100 text-xs"
                              >
                                {['Hedge Knight', 'Child', 'Heir', 'Vassal Heir', 'Vassal Duke', 'Vassal Count', 'Vassal Baron', 'Marshal', 'Chancellor', 'Steward'].map((r) => (
                                  <option key={r} value={r}>{r}</option>
                                ))}
                              </select>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                              <div>
                                <label className="block text-[10px] text-slate-400 mb-0.5">Gender</label>
                                <select
                                  value={newNobleDraft.gender}
                                  onChange={(e) => setNewNobleDraft((d) => ({ ...d, gender: e.target.value as 'male' | 'female' }))}
                                  className="w-full px-1.5 py-1 rounded bg-slate-950 border border-slate-700 text-slate-100 text-xs"
                                >
                                  <option value="male">Male</option>
                                  <option value="female">Female</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] text-slate-400 mb-0.5">Age</label>
                                <input
                                  type="number"
                                  min={0}
                                  max={110}
                                  value={newNobleDraft.age}
                                  onChange={(e) => setNewNobleDraft((d) => ({ ...d, age: Number(e.target.value) }))}
                                  className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 text-slate-100 text-xs tabular-nums"
                                />
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                            <div>
                              <label className="block text-[10px] text-slate-400 mb-0.5">Father</label>
                              <select
                                value={newNobleDraft.knownFatherId}
                                onChange={(e) => setNewNobleDraft((d) => ({ ...d, knownFatherId: e.target.value }))}
                                className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 text-slate-100 text-xs"
                              >
                                <option value="">None (Root Forebear)</option>
                                {houseMembers.filter((m) => m.gender === 'male').map((m) => (
                                  <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-400 mb-0.5">Mother</label>
                              <select
                                value={newNobleDraft.motherId}
                                onChange={(e) => setNewNobleDraft((d) => ({ ...d, motherId: e.target.value }))}
                                className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 text-slate-100 text-xs"
                              >
                                <option value="">None</option>
                                {houseMembers.filter((m) => m.gender === 'female').map((m) => (
                                  <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                              </select>
                            </div>
                            <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={newNobleDraft.isAlive}
                                onChange={(e) => setNewNobleDraft((d) => ({ ...d, isAlive: e.target.checked }))}
                              />
                              <span>Living Character</span>
                            </label>
                            <button
                              type="button"
                              disabled={!newNobleDraft.name.trim()}
                              onClick={() => {
                                const realmObj =
                                  world.realms.find((r) => r.name === profile.primaryRealmName) ||
                                  world.realms.find((r) => r.id === activeRealmId) ||
                                  world.realms[0];
                                const next = createCustomCharacter(world, {
                                  name: newNobleDraft.name.trim(),
                                  houseName: profile.houseName,
                                  houseMotto: profile.motto,
                                  realmId: realmObj?.id || '',
                                  role: newNobleDraft.role,
                                  title: newNobleDraft.title || undefined,
                                  gender: newNobleDraft.gender,
                                  age: newNobleDraft.age,
                                  isAlive: newNobleDraft.isAlive,
                                  knownFatherId: newNobleDraft.knownFatherId || undefined,
                                  motherId: newNobleDraft.motherId || undefined,
                                });
                                onUpdateWorld(next);
                                setNewNobleDraft({
                                  name: '',
                                  gender: 'male',
                                  age: 26,
                                  isAlive: true,
                                  role: 'Hedge Knight',
                                  title: '',
                                  knownFatherId: '',
                                  motherId: '',
                                  spouseId: '',
                                  causeOfDeath: '',
                                });
                                setIsAddingNoble(false);
                                onNotify?.(`Added ${newNobleDraft.name.trim()} to House ${profile.houseName}.`);
                              }}
                              className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-semibold cursor-pointer"
                            >
                              Create Member
                            </button>
                          </div>
                        </div>
                      )}

                      {/* SUB-VIEW A: TOP-DOWN BRANCHING DYNASTIC TREE */}
                      {treeViewMode === 'dynastic' && (
                        <div className="overflow-x-auto pb-4">
                          <div className="inline-flex flex-col gap-8 min-w-full">
                            {(() => {
                              const visited = new Set<string>();
                              const renderNodeCard = (member: Character, isSpouseNode = false) => {
                                const isDeceased = member.isAlive === false;
                                const isHead = profile.head?.id === member.id;
                                const isOtherHouse = Boolean(member.houseName && member.houseName !== selectedHouse);
                                const isTreeSelected =
                                  selectedTreeCharId === member.id || (!selectedTreeCharId && isHead);
                                return (
                                  <div
                                    key={member.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setSelectedTreeCharId(member.id)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setSelectedTreeCharId(member.id);
                                      }
                                    }}
                                    className={`text-left px-3 py-2 rounded-lg border transition-all group w-52 shrink-0 cursor-pointer ${
                                      isTreeSelected
                                        ? 'ring-2 ring-amber-400/80 border-amber-400 bg-amber-950/35 shadow-md shadow-amber-950/30'
                                        : isDeceased
                                        ? 'bg-stone-900/75 border-stone-600/80 hover:border-amber-500/60 opacity-90'
                                        : isSpouseNode
                                        ? 'bg-slate-900/55 border-pink-500/30 hover:border-pink-400/60'
                                        : isHead
                                        ? 'bg-amber-950/35 border-amber-500/60 hover:border-amber-400 shadow-md shadow-amber-950/30'
                                        : 'bg-slate-900/85 border-slate-700/90 hover:border-amber-500/50'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <div className={`shrink-0 ${isDeceased ? 'grayscale opacity-80' : ''}`}>
                                        {member.coatOfArms ? (
                                          <HeraldryShield coatOfArms={member.coatOfArms} seed={`tree_${member.id}`} size={24} />
                                        ) : (
                                          <div className="w-6 h-6 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300">
                                            {member.name.slice(0, 2).toUpperCase()}
                                          </div>
                                        )}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1">
                                          <span
                                            className={`text-[11px] font-bold truncate ${
                                              isDeceased ? 'text-stone-300' : 'text-slate-100 group-hover:text-amber-200'
                                            }`}
                                          >
                                            {isDeceased ? `† ${member.name}` : member.name}
                                          </span>
                                          {isHead && !isDeceased && (
                                            <Crown className="w-3 h-3 text-amber-400 shrink-0" />
                                          )}
                                          {isDeceased && (
                                            <Skull className="w-2.5 h-2.5 text-stone-400 shrink-0" />
                                          )}
                                        </div>
                                        {isOtherHouse ? (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setSelectedHouse(member.houseName);
                                              setSelectedTreeCharId('');
                                            }}
                                            className="text-[10px] text-amber-300 hover:text-amber-200 underline decoration-amber-500/50 truncate block text-left cursor-pointer"
                                            title={`Go to House ${member.houseName}`}
                                          >
                                            House {member.houseName} →
                                          </button>
                                        ) : (
                                          <div className="text-[10px] text-slate-400 truncate">
                                            {formatCharacterRoleLabel(member, world)}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    <div className="mt-1.5 pt-1 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 tabular-nums">
                                      <span>
                                        {isDeceased
                                          ? `${member.birthYear ?? '?'}–${member.deathYear ?? '?'} AC`
                                          : `Age ${member.age}`}
                                      </span>
                                      <span className="text-amber-300/85 font-semibold">
                                        {(member.prestige || 0).toLocaleString()} P
                                      </span>
                                    </div>
                                    {isDeceased && (
                                      <div
                                        className="mt-1 text-[10px] text-rose-300/80 truncate italic"
                                        title={member.causeOfDeath || 'Passed into history'}
                                      >
                                        † {member.causeOfDeath || 'Deceased Ancestor'}
                                      </div>
                                    )}
                                  </div>
                                );
                              };

                              const renderBranch = (member: Character, depth: number): React.ReactNode => {
                                if (visited.has(member.id) || depth > 7) return null;
                                visited.add(member.id);
                                const rawSpouse = member.spouseId ? charById.get(member.spouseId) : undefined;
                                const spouse = rawSpouse && !visited.has(rawSpouse.id) ? rawSpouse : undefined;
                                if (spouse) visited.add(spouse.id);
                                const combinedKids = [
                                  ...(dynasticChildrenMap.get(member.id) || []),
                                  ...(spouse ? dynasticChildrenMap.get(spouse.id) || [] : []),
                                ];
                                const seenKids = new Set<string>();
                                const kids = combinedKids
                                  .filter((k) => {
                                    if (visited.has(k.id) || seenKids.has(k.id)) return false;
                                    seenKids.add(k.id);
                                    return true;
                                  })
                                  .sort((a, b) => (a.birthYear ?? 0) - (b.birthYear ?? 0));

                                return (
                                  <div key={member.id} className="flex flex-col items-center">
                                    {/* Couple / Individual Row */}
                                    <div className="flex items-center">
                                      {renderNodeCard(member, false)}
                                      {spouse && (
                                        <>
                                          <div className="w-5 h-px bg-pink-500/50 relative flex items-center justify-center">
                                            <span className="w-1.5 h-1.5 rounded-full bg-pink-400/80" />
                                          </div>
                                          {renderNodeCard(spouse, true)}
                                        </>
                                      )}
                                    </div>

                                    {/* Descending Orthogonal Branch Connectors */}
                                    {kids.length > 0 && (
                                      <div className="flex flex-col items-center">
                                        <div className="w-px h-5 bg-amber-500/45" />
                                        <div className="flex items-start gap-5 relative">
                                          {kids.length > 1 && (
                                            <div className="absolute top-0 left-24 right-24 h-px bg-amber-500/45" />
                                          )}
                                          {kids.map((child) => (
                                            <div key={child.id} className="flex flex-col items-center">
                                              <div className="w-px h-5 bg-amber-500/45" />
                                              {renderBranch(child, depth + 1)}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              };

                              return (
                                <div className="flex flex-wrap items-start justify-center gap-10 py-2">
                                  {dynasticRoots.map((root) => renderBranch(root, 0))}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      )}

                      {/* SUB-VIEW B: UPWARD ANCESTRAL PEDIGREE TREE */}
                      {treeViewMode === 'ancestral' && pedigreeSubject && (
                        <div className="overflow-x-auto pb-4">
                          {(() => {
                            const father = pedigreeSubject.knownFatherId
                              ? charById.get(pedigreeSubject.knownFatherId)
                              : undefined;
                            const mother = pedigreeSubject.motherId
                              ? charById.get(pedigreeSubject.motherId)
                              : undefined;
                            const patGF = father?.knownFatherId ? charById.get(father.knownFatherId) : undefined;
                            const patGM = father?.motherId ? charById.get(father.motherId) : undefined;
                            const matGF = mother?.knownFatherId ? charById.get(mother.knownFatherId) : undefined;
                            const matGM = mother?.motherId ? charById.get(mother.motherId) : undefined;

                            const renderPedigreeSlot = (
                              person: Character | undefined,
                              relationLabel: string,
                              accent: 'subject' | 'paternal' | 'maternal'
                            ) => {
                              if (!person) {
                                return (
                                  <div className="w-44 px-3 py-2.5 rounded-lg border border-dashed border-slate-800 bg-slate-950/40 text-center">
                                    <div className="text-[10px] uppercase tracking-wider text-slate-500">
                                      {relationLabel}
                                    </div>
                                    <div className="text-[11px] text-slate-600 italic mt-0.5">
                                      Unrecorded Ancestor
                                    </div>
                                  </div>
                                );
                              }
                              const isDeceased = person.isAlive === false;
                              const borderCls =
                                accent === 'subject'
                                  ? 'border-amber-500/70 bg-amber-950/35'
                                  : accent === 'paternal'
                                  ? 'border-sky-500/40 bg-slate-900/80 hover:border-sky-400'
                                  : 'border-pink-500/40 bg-slate-900/80 hover:border-pink-400';

                              const isPedigreeOtherHouse = Boolean(person.houseName && person.houseName !== selectedHouse);
                              return (
                                <div
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => {
                                    setSelectedTreeCharId(person.id);
                                    if (person.houseName === selectedHouse) {
                                      setPedigreeSubjectId(person.id);
                                    } else {
                                      setSelectedHouse(person.houseName);
                                      setPedigreeSubjectId(person.id);
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      setSelectedTreeCharId(person.id);
                                      setSelectedHouse(person.houseName);
                                      setPedigreeSubjectId(person.id);
                                    }
                                  }}
                                  className={`w-44 text-left px-3 py-2 rounded-lg border transition-all cursor-pointer ${borderCls}`}
                                  title={`Click to trace ancestry of ${person.name} (House ${person.houseName})`}
                                >
                                  <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1 flex items-center justify-between">
                                    <span>{relationLabel}</span>
                                    {isDeceased && <Skull className="w-2.5 h-2.5 text-slate-500" />}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className={isDeceased ? 'grayscale opacity-80 shrink-0' : 'shrink-0'}>
                                      {person.coatOfArms ? (
                                        <HeraldryShield coatOfArms={person.coatOfArms} seed={`ped_${person.id}`} size={22} />
                                      ) : (
                                        <div className="w-5 h-5 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300">
                                          {person.name.slice(0, 2).toUpperCase()}
                                        </div>
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <div className={`text-[11px] font-bold truncate ${isDeceased ? 'text-stone-300' : 'text-slate-100'}`}>
                                        {isDeceased ? `† ${person.name}` : person.name}
                                      </div>
                                      {isPedigreeOtherHouse ? (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedHouse(person.houseName);
                                            setPedigreeSubjectId(person.id);
                                            setSelectedTreeCharId(person.id);
                                          }}
                                          className="text-[10px] text-amber-300 hover:text-amber-200 underline decoration-amber-500/50 truncate block text-left cursor-pointer"
                                        >
                                          House {person.houseName} →
                                        </button>
                                      ) : (
                                        <div className="text-[10px] text-amber-300/80 truncate">
                                          House {person.houseName}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="mt-1 text-[10px] text-slate-400 tabular-nums">
                                    {isDeceased
                                      ? `${person.birthYear ?? '?'}–${person.deathYear ?? '?'} AC · ${person.causeOfDeath || 'Deceased'}`
                                      : `Age ${person.age} · ${formatCharacterRoleLabel(person, world)}`}
                                  </div>
                                </div>
                              );
                            };

                            return (
                              <div className="flex flex-col items-center gap-0 py-2 min-w-[760px]">
                                {/* Row 1: Grandparents (Ancestral Forebears) */}
                                <div className="text-[10px] uppercase tracking-widest text-amber-400/80 font-bold mb-2">
                                  Grandparents &amp; Founding Forebears
                                </div>
                                <div className="flex items-center justify-center gap-6">
                                  <div className="flex items-center gap-3">
                                    {renderPedigreeSlot(patGF, 'Paternal Grandfather', 'paternal')}
                                    {renderPedigreeSlot(patGM, 'Paternal Grandmother', 'paternal')}
                                  </div>
                                  <div className="flex items-center gap-3">
                                    {renderPedigreeSlot(matGF, 'Maternal Grandfather', 'maternal')}
                                    {renderPedigreeSlot(matGM, 'Maternal Grandmother', 'maternal')}
                                  </div>
                                </div>

                                {/* Connectors Grandparents -> Parents */}
                                <div className="grid grid-cols-2 w-[740px]">
                                  <div className="flex flex-col items-center">
                                    <div className="w-44 h-4 border-l border-r border-b border-sky-500/40" />
                                    <div className="w-px h-4 bg-sky-500/40" />
                                  </div>
                                  <div className="flex flex-col items-center">
                                    <div className="w-44 h-4 border-l border-r border-b border-pink-500/40" />
                                    <div className="w-px h-4 bg-pink-500/40" />
                                  </div>
                                </div>

                                {/* Row 2: Parents */}
                                <div className="grid grid-cols-2 w-[740px] place-items-center">
                                  {renderPedigreeSlot(father, 'Father (Paternal Line)', 'paternal')}
                                  {renderPedigreeSlot(mother, 'Mother (Maternal Line)', 'maternal')}
                                </div>

                                {/* Connectors Parents -> Subject */}
                                <div className="flex flex-col items-center">
                                  <div className="w-[370px] h-5 border-l border-r border-b border-amber-500/50" />
                                  <div className="w-px h-5 bg-amber-500/60" />
                                </div>

                                {/* Row 3: Subject */}
                                {renderPedigreeSlot(pedigreeSubject, 'Selected Noble', 'subject')}

                                {/* Row 4: Children & Descendants (Living & Deceased) */}
                                {(() => {
                                  const subjectChildIds = new Set(pedigreeSubject.children || []);
                                  const subjectChildren = (world.characters || [])
                                    .filter(
                                      (c) =>
                                        c.id !== pedigreeSubject.id &&
                                        (subjectChildIds.has(c.id) ||
                                          c.knownFatherId === pedigreeSubject.id ||
                                          c.motherId === pedigreeSubject.id ||
                                          c.realFatherId === pedigreeSubject.id)
                                    )
                                    .sort((a, b) => (a.birthYear ?? 0) - (b.birthYear ?? 0));
                                  if (subjectChildren.length === 0) return null;
                                  return (
                                    <div className="flex flex-col items-center">
                                      <div className="w-px h-5 bg-amber-500/45" />
                                      <div className="text-[10px] uppercase tracking-widest text-amber-400/80 font-bold mb-2">
                                        Descendants ({subjectChildren.length})
                                      </div>
                                      <div className="flex flex-wrap justify-center gap-3">
                                        {subjectChildren.map((ch) => (
                                          <React.Fragment key={ch.id}>
                                            {renderPedigreeSlot(ch, ch.isAlive === false ? 'Deceased Child' : formatCharacterRoleLabel(ch, world), 'subject')}
                                          </React.Fragment>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {/* Selected Noble Inspector Card (with cross-house link below name) */}
                      {(() => {
                        const inspected =
                          (selectedTreeCharId ? charById.get(selectedTreeCharId) : undefined) ||
                          profile.head ||
                          houseMembers[0];
                        if (!inspected) return null;
                        const isInspectedDeceased = inspected.isAlive === false;
                        const differsFromSelectedHouse = Boolean(
                          inspected.houseName && inspected.houseName !== selectedHouse
                        );
                        return (
                          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-amber-500/35 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={isInspectedDeceased ? 'grayscale opacity-85 shrink-0' : 'shrink-0'}>
                                {inspected.coatOfArms ? (
                                  <HeraldryShield
                                    coatOfArms={inspected.coatOfArms}
                                    seed={`sel_${inspected.id}`}
                                    size={38}
                                  />
                                ) : (
                                  <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-amber-200">
                                    {inspected.name.slice(0, 2).toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-bold text-amber-100 truncate">
                                  {isInspectedDeceased ? `† ${inspected.name}` : inspected.name}
                                </div>
                                {differsFromSelectedHouse ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedHouse(inspected.houseName);
                                      setSelectedTreeCharId('');
                                    }}
                                    className="text-xs text-amber-300 hover:text-amber-200 underline decoration-amber-500/60 underline-offset-2 font-medium cursor-pointer block mt-0.5"
                                    title={`Navigate to House ${inspected.houseName}`}
                                  >
                                    House {inspected.houseName} →
                                  </button>
                                ) : (
                                  <div className="text-xs text-slate-400">
                                    House {inspected.houseName} · {formatCharacterRoleLabel(inspected, world)}
                                  </div>
                                )}
                                <div className="text-[11px] text-slate-400 mt-1 tabular-nums">
                                  {inspected.title || formatCharacterRoleLabel(inspected, world)} ·{' '}
                                  {isInspectedDeceased
                                    ? `${inspected.birthYear ?? '?'}–${inspected.deathYear ?? '?'} AC · ${inspected.causeOfDeath || 'Deceased'}`
                                    : `Age ${inspected.age}`} · {(inspected.prestige || 0).toLocaleString()} Prestige
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {inspected.houseName === selectedHouse && treeViewMode === 'dynastic' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPedigreeSubjectId(inspected.id);
                                    setTreeViewMode('ancestral');
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 cursor-pointer"
                                >
                                  Trace Ancestors
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  onSelectCharacter(inspected);
                                  if (!embedded) onClose();
                                }}
                                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold cursor-pointer"
                              >
                                Open Dossier →
                              </button>
                            </div>
                          </div>
                        );
                      })()}

                      {profile.cadetBranchNames.length > 0 && (
                        <div className="pt-3 border-t border-slate-800">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                            <GitBranch className="w-3.5 h-3.5 text-sky-400" />
                            Cadet Branches
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {profile.cadetBranchNames.map((cadet) => (
                              <button
                                key={cadet}
                                onClick={() => setSelectedHouse(cadet)}
                                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-sky-400/60 text-xs text-sky-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                              >
                                House {cadet}
                                <ChevronRight className="w-3 h-3 text-slate-500" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 2: ANCESTRAL CLAIMS */}
                  {activeTab === 'claims' && (
                    <div className="space-y-5">
                      <div className="p-3.5 rounded-lg bg-slate-900/70 border border-slate-800 text-xs text-slate-300 leading-relaxed">
                        Beginning noble houses carry <strong className="text-amber-200">Ancestral Claims</strong> over
                        their hereditary seats and historical territories. These claims pass down through legitimate
                        succession and remain valid indefinitely unless explicitly extinguished by a{' '}
                        <strong className="text-rose-300">Royal Decree</strong>.
                      </div>

                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300 mb-2.5">
                          Active Ancestral Claims ({profile.ancestralClaims.length})
                        </h4>
                        {profile.ancestralClaims.length === 0 ? (
                          <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-800 text-xs text-slate-500">
                            House {profile.houseName} holds no active ancestral claims.
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            {profile.ancestralClaims.map((entry) => (
                              <div
                                key={`${entry.claimant.id}_${entry.claim.holdingId}`}
                                className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800 flex flex-wrap items-center justify-between gap-3"
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-slate-100">
                                      {entry.holdingName}
                                    </span>
                                    <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase bg-amber-500/15 border border-amber-500/40 text-amber-300 rounded">
                                      Ancestral
                                    </span>
                                    {entry.claim.grantedYear && (
                                      <span className="text-[10px] text-slate-500 tabular-nums">
                                        Since {entry.claim.grantedYear} AC
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-slate-400 mt-1">
                                    Claimant:{' '}
                                    <button
                                      onClick={() => {
                                        onSelectCharacter(entry.claimant);
                                        onClose();
                                      }}
                                      className="text-amber-200 hover:underline font-medium"
                                    >
                                      {entry.claimant.name}
                                    </button>{' '}
                                    · Current Holder:{' '}
                                    <span className="text-slate-200">{entry.currentOwnerName}</span> (
                                    {entry.currentOwnerRealmName})
                                  </div>
                                </div>

                                {activeMonarch && (
                                  <button
                                    onClick={() =>
                                      handleRevokeClaim(entry.claimant.id, entry.claim.holdingId)
                                    }
                                    className="px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/70 border border-rose-500/40 text-rose-200 text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
                                    title={`Issue Royal Decree as ${activeMonarch.name} (-75 Monarch Prestige, -35 House Opinion)`}
                                  >
                                    <Ban className="w-3.5 h-3.5" />
                                    Revoke by Royal Decree
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {profile.revokedAncestralClaims.length > 0 && (
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">
                            Extinguished by Royal Decree ({profile.revokedAncestralClaims.length})
                          </h4>
                          <div className="space-y-2">
                            {profile.revokedAncestralClaims.map((entry) => (
                              <div
                                key={`rev_${entry.claimant.id}_${entry.claim.holdingId}`}
                                className="p-3 rounded-lg bg-slate-900/40 border border-slate-800/80 flex items-center justify-between gap-2 opacity-75"
                              >
                                <div>
                                  <div className="text-xs font-semibold text-slate-300 line-through">
                                    {entry.holdingName}
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    Former Claimant: {entry.claimant.name} · Revoked in{' '}
                                    {entry.claim.revokedYear ?? world.currentYear} AC
                                  </div>
                                </div>
                                <span className="px-2 py-0.5 text-[10px] font-bold uppercase bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded">
                                  Revoked
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: ALLIANCES & PRESTIGE LEVERAGE */}
                  {activeTab === 'leverage' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Prestige Impact Card */}
                      <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800 space-y-3">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
                          <Sparkles className="w-4 h-4" />
                          Prestige &amp; Negotiating Power
                        </div>
                        <div className="space-y-2 text-xs text-slate-300">
                          <div className="flex items-center justify-between py-1.5 border-b border-slate-800/80">
                            <span className="text-slate-400">House Power Tier</span>
                            <span className="font-semibold text-amber-200">{profile.powerTier}</span>
                          </div>
                          <div className="flex items-center justify-between py-1.5 border-b border-slate-800/80">
                            <span className="text-slate-400">Council &amp; Diplomatic Leverage</span>
                            <span
                              className={`font-bold tabular-nums ${
                                profile.negotiatingPower >= 0 ? 'text-emerald-300' : 'text-rose-300'
                              }`}
                            >
                              {profile.negotiatingPower >= 0 ? '+' : ''}
                              {profile.negotiatingPower} pts
                            </span>
                          </div>
                          <div className="flex items-center justify-between py-1.5 border-b border-slate-800/80">
                            <span className="text-slate-400">Marriage Prospect Appeal</span>
                            <span className="font-bold text-pink-300 tabular-nums">
                              {profile.marriageAppeal} / 100
                            </span>
                          </div>
                          <div className="flex items-center justify-between py-1.5">
                            <span className="text-slate-400">Held Domains</span>
                            <span className="text-slate-200 tabular-nums">
                              {profile.heldRealmIds.length} Realms · {profile.heldCountyIds.length} Counties ·{' '}
                              {profile.heldBurgIds.length} Holdings
                            </span>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
                          Higher House Prestige lowers council bill persuasion costs against lesser houses, strengthens
                          state alliance proposals, and makes foreign sovereigns far more receptive to dynastic
                          marriage pacts.
                        </p>
                      </div>

                      {/* Alliances & Marital Ties Card */}
                      <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800 space-y-4">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-300">
                          <HeartHandshake className="w-4 h-4" />
                          Dynastic Alliances &amp; Marital Ties
                        </div>

                        <div>
                          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                            Bound by Marriage ({profile.maritalAllianceHouses.length})
                          </div>
                          {profile.maritalAllianceHouses.length === 0 ? (
                            <p className="text-xs text-slate-500">
                              No external noble houses currently linked by marriage.
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {profile.maritalAllianceHouses.map((allyHouse) => (
                                <button
                                  key={allyHouse}
                                  onClick={() => setSelectedHouse(allyHouse)}
                                  className="px-2.5 py-1 rounded bg-pink-500/10 border border-pink-500/35 hover:border-pink-400 text-xs text-pink-200 transition-colors"
                                >
                                  House {allyHouse}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                            Allied Realms ({profile.alliedRealmNames.length})
                          </div>
                          {profile.alliedRealmNames.length === 0 ? (
                            <p className="text-xs text-slate-500">
                              No formal realm-level military alliances active.
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {profile.alliedRealmNames.map((rName) => (
                                <span
                                  key={rName}
                                  className="px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/35 text-xs text-emerald-200"
                                >
                                  {rName}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
                Select a Noble House from the directory to inspect its lineage.
              </div>
            )}
          </main>
        </div>
      </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-6"
      onClick={onClose}
    >
      {content}
    </div>
  );
};
