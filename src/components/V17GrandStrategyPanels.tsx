import React, { useState } from 'react';
import {
  WorldState,
  Character,
  Holding,
  Province,
  Claim,
  Epidemic,
  CadetHouse,
  CrimeType,
} from '../types/world';
import { CouncilConsensusPanel } from './CouncilConsensusPanel';
import { HeraldryShield } from './HeraldryShield';
import {
  GeographyAndTravelEngine,
  PlagueEngine,
  ClaimAndWarEngine,
  DynasticFeudEngine,
  JusticeEngine,
  computeTotalGravitas,
  getTerrainTravelModifier,
  getHoldingYields,
} from '../engine/v17GrandStrategyEngine';
import { cloneWorldState } from '../utils/cloneWorldState';
import { canFoundCadetBranch } from '../utils/heraldryBridge';
import { formatCharacterRoleLabel } from '../engine/fantasyTables';
import {
  Navigation,
  Compass,
  Skull,
  Lock,
  Unlock,
  Swords,
  Crown,
  Shield,
  Coins,
  Flame,
  Scale,
  Sparkles,
  Heart,
  AlertTriangle,
} from 'lucide-react';

export interface V17PanelsProps {
  activeTab?: 'travel' | 'claims' | 'feuds' | 'plague' | 'laws';
  activeChar?: Character;
  activeCharacter?: Character;
  world: WorldState;
  onUpdateWorld?: (newWorld: WorldState) => void;
  onNotify?: (msg: string) => void;
  onSelectCharacter?: (char: Character) => void;
  onOpenHouse?: (houseName: string) => void;
}

export const V17GrandStrategyPanels: React.FC<V17PanelsProps> = ({
  activeTab: propActiveTab,
  activeChar: propActiveChar,
  activeCharacter: propActiveCharacter,
  world,
  onUpdateWorld = () => {},
  onNotify = () => {},
  onSelectCharacter = () => {},
  onOpenHouse,
}) => {
  const livingChars = (world.characters || []).filter((c) => c.isAlive !== false);
  const playerRealm = world.playerRealmId
    ? world.realms.find((r) => r.id === world.playerRealmId)
    : undefined;
  const propChar = propActiveChar || propActiveCharacter;
  const activeChar =
    (propChar && propChar.isAlive !== false ? propChar : undefined) ||
    (playerRealm?.rulerId ? livingChars.find((c) => c.id === playerRealm.rulerId) : undefined) ||
    livingChars.find((c) => c.id === world.monarchId) ||
    livingChars[0] ||
    world.characters[0];
  const [internalTab, setInternalTab] = useState<'travel' | 'claims' | 'feuds' | 'plague' | 'laws'>('travel');
  const [inlineNotice, setInlineNotice] = useState<string | null>(null);
  const activeTab = propActiveTab || internalTab;
  const emitNotify = (msg: string) => {
    setInlineNotice(msg);
    onNotify(msg);
  };
  // Travel Form State
  const [targetProvId, setTargetProvId] = useState<string>(
    world.provinces?.find((p) => p.id !== activeChar?.provinceId)?.id || ''
  );
  const [travelPurpose, setTravelPurpose] = useState<string>('Imperial Court Attendance');

  // Claim Fabrication State
  const [targetHoldingId, setTargetHoldingId] = useState<string>(
    world.holdings?.find((h) => h.ownerId !== activeChar?.id)?.id || ''
  );

  // Feud State
  const [feudTargetHouse, setFeudTargetHouse] = useState<string>('');
  const [feudReason, setFeudReason] = useState<string>('Disputed Feudal Partition');

  // Accusation State
  const [accusedId, setAccusedId] = useState<string>(
    livingChars.find((c) => c.id !== activeChar?.id)?.id || ''
  );
  const [accusedCrime, setAccusedCrime] = useState<CrimeType>('Treason');

  React.useEffect(() => {
    if (!activeChar) return;
    if (!targetProvId || targetProvId === activeChar.provinceId) {
      const nextProv = world.provinces?.find((p) => p.id !== activeChar.provinceId)?.id || '';
      if (nextProv) setTargetProvId(nextProv);
    }
    const curHolding = world.holdings?.find((h) => h.id === targetHoldingId);
    if (!targetHoldingId || !curHolding || curHolding.ownerId === activeChar.id) {
      const nextH = world.holdings?.find((h) => h.ownerId !== activeChar.id)?.id || '';
      if (nextH) setTargetHoldingId(nextH);
    }
    if (!accusedId || accusedId === activeChar.id) {
      const nextAcc = livingChars.find((c) => c.id !== activeChar.id)?.id || '';
      if (nextAcc) setAccusedId(nextAcc);
    }
  }, [activeChar?.id, world.provinces, world.holdings]);

  const charProv = world.provinces?.find((p) => p.id === activeChar?.provinceId);
  const capitalProv = world.provinces?.find((p) => p.id === world.capitalProvinceId);

  if (!activeChar || world.realms.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center text-stone-400 space-y-2 bg-stone-900/95">
        <Crown className="w-8 h-8 text-amber-500/60" />
        <div className="text-sm font-cinzel font-bold text-amber-200">No Sovereign Characters</div>
        <p className="text-xs text-stone-400 max-w-xs">
          Populate terrain with realms and dynasties in World Builder to unlock travel, claims, feuds, and council laws.
        </p>
      </div>
    );
  }

  const standaloneNav = !propActiveTab ? (
    <div className="space-y-2 pb-0 border-b border-white/[0.08]">
      <div className="flex items-center justify-between">
        <span className="font-serif text-sm font-bold text-amber-200">Council & Stratagems</span>
        <span className="text-[11px] font-mono text-stone-400 truncate max-w-[160px]">{activeChar?.name}</span>
      </div>
      <div className="flex items-center gap-4 overflow-x-auto no-scrollbar text-xs font-medium">
        {(
          [
            { id: 'travel', label: 'Travel' },
            { id: 'claims', label: 'Claims' },
            { id: 'feuds', label: 'Feuds' },
            { id: 'plague', label: 'Plague' },
            { id: 'laws', label: 'Laws' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setInternalTab(t.id)}
            className={`py-2 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === t.id ? 'border-amber-400 text-amber-200 font-semibold' : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {inlineNotice && (
        <div className="mb-2 p-2 rounded-md bg-amber-950/50 border border-amber-700/40 text-xs text-amber-200 flex items-center justify-between gap-2">
          <span>{inlineNotice}</span>
          <button type="button" onClick={() => setInlineNotice(null)} className="text-amber-400 hover:text-white cursor-pointer">
            ✕
          </button>
        </div>
      )}
    </div>
  ) : null;

  // ==========================================
  // 1. GEOGRAPHY & SPATIAL TRAVEL PANEL
  // ==========================================
  if (activeTab === 'travel') {
    const isAwayFromCapital =
      world.capitalProvinceId && activeChar.provinceId !== world.capitalProvinceId;
    const destProv = world.provinces?.find((p) => p.id === targetProvId);
    const hops = charProv && destProv && charProv.neighbors.includes(destProv.id) ? 1 : 2;
    const terrainMod = destProv ? getTerrainTravelModifier(destProv.terrain) : 1.0;
    const estimatedMonths = Math.max(1, Math.round(hops * terrainMod));

    const handleEmbark = () => {
      if (!targetProvId) return;
      const updated = cloneWorldState(world);
      const actor = updated.characters.find((c) => c.id === activeChar.id);
      if (!actor) return;

      const success = GeographyAndTravelEngine.initiateTravel(
        actor,
        targetProvId,
        travelPurpose,
        updated
      );
      if (success) {
        onUpdateWorld(updated);
        emitNotify(`JOURNEY: ${actor.name} set out for ${destProv?.name}!`);
      }
    };

    return (
      <div className={`space-y-3.5 text-stone-200 ${!propActiveTab ? 'h-full overflow-y-auto p-4' : 'pt-2 border-t border-stone-800'}`}>
        {standaloneNav}
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase font-bold text-amber-400 tracking-wider flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5" />
            <span>Spatial Location & Travel Dynamics</span>
          </div>
          <span className="text-[10px] text-stone-400 font-mono">
            ETA Speed: {destProv ? `${terrainMod}x` : '1.0x'}
          </span>
        </div>

        {/* Current Location */}
        <div className="p-3 bg-stone-900/45 border border-white/[0.08] rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-stone-300 font-medium flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Current Seat: <strong className="text-amber-300">{charProv?.name || 'Capital'}</strong></span>
            </span>
            <span className="text-[11px] font-mono text-stone-400">
              {charProv?.terrain || 'Plains'} Terrain
            </span>
          </div>

          {/* Spatial Friction Notice */}
          {isAwayFromCapital && (
            <div className="p-2 bg-amber-950/40 border border-amber-800/40 rounded-md text-[11px] text-amber-300/90 flex items-start gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                <strong>Spatial Friction Active:</strong> Located away from {capitalProv?.name || 'the Imperial Capital'}. Ministerial influence & court capital generation is reduced by 70% until returning to court.
              </span>
            </div>
          )}

          {/* Currently Traveling Status */}
          {activeChar.isTraveling ? (
            <div className="p-2.5 bg-amber-950/45 border border-amber-700/50 rounded-md space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                  <Navigation className="w-3.5 h-3.5 shrink-0" />
                  <span>In Transit: {world.provinces?.find((p) => p.id === activeChar.travelDestProvinceId)?.name}</span>
                </span>
                <span className="text-stone-300 font-mono tabular-nums text-[11px] font-semibold">
                  {activeChar.travelMonthsLeft || 1} Months Left
                </span>
              </div>
              <div className="w-full bg-stone-900 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-amber-400 h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(20, 100 - (activeChar.travelMonthsLeft || 1) * 45)}%` }}
                />
              </div>
              <div className="text-[11px] text-stone-400 flex items-center justify-between">
                <span>Mission: {activeChar.travelPurpose || 'Feudal Duty'}</span>
                <span className="text-amber-400/80">Bandit & Storm Hazard Active</span>
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-stone-400">
              Stationed in fortress chambers. Prepared to embark on royal progress or muster levies.
            </div>
          )}
        </div>

        {/* Dispatch Journey Form */}
        {!activeChar.isTraveling && (
          <div className="p-3 bg-stone-900/90 border border-stone-800 rounded-xl space-y-2.5">
            <div className="text-[11px] font-bold text-stone-200 flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-amber-400" />
              <span>Order Noble Progress / Journey</span>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-stone-400">Destination Province:</label>
              <select
                value={targetProvId}
                onChange={(e) => setTargetProvId(e.target.value)}
                className="w-full p-1.5 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-200 font-medium"
              >
                {world.provinces
                  ?.filter((p) => p.id !== activeChar.provinceId)
                  .map((prov) => (
                    <option key={prov.id} value={prov.id}>
                      {prov.name} ({prov.terrain} · {charProv?.neighbors.includes(prov.id) ? 'Direct Neighbor' : 'Distant March'})
                    </option>
                  ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-stone-400">Purpose of Travel:</label>
              <select
                value={travelPurpose}
                onChange={(e) => setTravelPurpose(e.target.value)}
                className="w-full p-1.5 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-200 font-medium"
              >
                <option value="Imperial Court Attendance">Imperial Court Attendance (Restore Ring)</option>
                <option value="Domain Inspection & Tax Audit">Domain Inspection & Tax Audit</option>
                <option value="Feudal Marriage Alliance">Feudal Marriage Alliance Negotiations</option>
                <option value="Pilgrimage to Holy Sanctuary">Pilgrimage to Holy Sanctuary (+Piety)</option>
                <option value="Levy Vanguard Mobilization">Levy Vanguard Mobilization</option>
              </select>
            </div>

            <div className="flex items-center justify-between text-[11px] text-stone-400 pt-1">
              <span>Expected Travel Duration:</span>
              <span className="font-mono font-bold text-amber-300">~{estimatedMonths} Months</span>
            </div>

            <button
              onClick={handleEmbark}
              className="w-full py-2 bg-amber-700 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>Depart with Royal Escort</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // 2. CLAIMS & CLAIMANT WARS PANEL
  // ==========================================
  if (activeTab === 'claims') {
    const claims = activeChar.claims || [];

    const handleDeclareWar = (claim: Claim) => {
      const updated = cloneWorldState(world);
      const actor = updated.characters.find((c) => c.id === activeChar.id);
      if (!actor) return;

      const res = ClaimAndWarEngine.declareClaimantWar(actor, claim, updated);
      onUpdateWorld(updated);
      emitNotify(res.summary);
    };

    const handleFabricate = () => {
      if (!targetHoldingId) return;
      const updated = cloneWorldState(world);
      const actor = updated.characters.find((c) => c.id === activeChar.id);
      const holding = updated.holdings?.find((h) => h.id === targetHoldingId);
      if (!actor || !holding) return;

      const success = ClaimAndWarEngine.fabricateClaim(actor, holding, updated);
      if (success) {
        onUpdateWorld(updated);
        emitNotify(`FABRICATED: Claim on ${holding.name} manufactured!`);
      } else {
        emitNotify(`FAILED: Insufficient gold treasury (requires 300g).`);
      }
    };

    return (
      <div className={`space-y-3.5 text-stone-200 ${!propActiveTab ? 'h-full overflow-y-auto p-4' : 'pt-2 border-t border-stone-800'}`}>
        {standaloneNav}
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase font-bold text-amber-400 tracking-wider flex items-center gap-1.5">
            <Swords className="w-3.5 h-3.5" />
            <span>Held Claims & Casus Belli ({claims.length})</span>
          </div>
          <span className="text-[10px] text-stone-400">Treasury: {Math.round(activeChar.treasury || 100)}g</span>
        </div>

        {/* Claims List */}
        {claims.length > 0 ? (
          <div className="space-y-2">
            {claims.map((cl, idx) => {
              const holding = world.holdings?.find((h) => h.id === cl.holdingId);
              const holdingOwner = world.characters.find((c) => c.id === holding?.ownerId);

              return (
                <div
                  key={idx}
                  className="p-3 bg-stone-900/45 border border-white/[0.08] rounded-lg space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-stone-200">{holding?.name || 'Ancient Holding'}</div>
                      <div className="text-[11px] text-stone-400">
                        Current Lord: <strong className="text-amber-300">{holdingOwner?.name || 'The Crown'}</strong>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-mono">
                      <span className={cl.isStrong ? 'text-amber-300 font-semibold' : 'text-stone-400'}>
                        {cl.isStrong ? 'Strong Claim' : 'Weak Claim'}
                      </span>
                      {cl.isPressed && (
                        <span className="text-red-400 font-semibold">
                          · Pressed
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeclareWar(cl)}
                    className="w-full py-1.5 bg-red-800 hover:bg-red-700 text-white rounded-md text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Swords className="w-3.5 h-3.5" />
                    <span>Press Claim in Claimant War</span>
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-3 bg-stone-950/60 border border-stone-800 rounded-xl text-center text-xs text-stone-400">
            No active hereditary claims held. Fabricate new legal claims using intrigue and gold below.
          </div>
        )}

        {/* Fabricate Claim Tool */}
        <div className="p-3 bg-stone-900/90 border border-stone-800 rounded-xl space-y-2.5">
          <div className="text-[11px] font-bold text-stone-200 flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5 text-amber-400" />
            <span>Fabricate New Claim (Cost: 300g)</span>
          </div>

          <select
            value={targetHoldingId}
            onChange={(e) => setTargetHoldingId(e.target.value)}
            className="w-full p-1.5 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-200"
          >
            {world.holdings
              ?.filter((h) => h.ownerId !== activeChar.id)
              .map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} ({h.estateType} · Dev {h.dev})
                </option>
              ))}
          </select>

          <button
            onClick={handleFabricate}
            disabled={(activeChar.treasury || 100) < 300}
            className="w-full py-1.5 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>Forge Genealogical Scrolls (300g)</span>
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // 3. CADET BRANCHES & BLOOD FEUDS PANEL
  // ==========================================
  if (activeTab === 'feuds') {
    const cadetHouses = Object.values(world.cadetHouses || {});

    const eligibleForCadet = canFoundCadetBranch(activeChar);

    const handleFoundCadet = () => {
      const updated = cloneWorldState(world);
      const actor = updated.characters.find((c) => c.id === activeChar.id);
      const firstHolding = updated.holdings?.find((h) => h.ownerId === activeChar.id) || updated.holdings?.[0];
      if (!actor || !firstHolding) return;

      const house = DynasticFeudEngine.createCadetBranch(actor, firstHolding, updated);
      if (!house) {
        emitNotify('Only noble-house members or bannered nobles (non-monarch) may form a cadet branch.');
        return;
      }
      onUpdateWorld(updated);
      emitNotify(`CADET BRANCH: ${house.name} founded with differenced House arms!`);
    };

    const handleDeclareFeud = () => {
      if (!feudTargetHouse) return;
      const updated = cloneWorldState(world);
      const myHouse = activeChar.houseName || 'Ironcrown';
      DynasticFeudEngine.declareFeud(myHouse, feudTargetHouse, feudReason, updated);
      onUpdateWorld(updated);
      emitNotify(`BLOOD FEUD: Sworn against House ${feudTargetHouse}!`);
    };

    return (
      <div className={`space-y-3.5 text-stone-200 ${!propActiveTab ? 'h-full overflow-y-auto p-4' : 'pt-2 border-t border-stone-800'}`}>
        {standaloneNav}
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase font-bold text-amber-400 tracking-wider flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-red-500" />
            <span>Cadet Houses & Blood Vendettas ({cadetHouses.length})</span>
          </div>
          <button
            type="button"
            onClick={() => activeChar.houseName && onOpenHouse?.(activeChar.houseName)}
            className="text-[10px] text-amber-300 hover:text-amber-200 underline decoration-amber-500/40 cursor-pointer"
          >
            House {activeChar.houseName}
          </button>
        </div>

        {/* Cadet Houses List */}
        {cadetHouses.length > 0 ? (
          <div className="space-y-2">
            {cadetHouses.map((house) => {
              const founder = world.characters.find((c) => c.id === house.founderId);
              const isFeuding = Boolean(house.feudTargetDynasty);

              return (
                <div
                  key={house.name}
                  className="p-3 bg-stone-900/45 border border-white/[0.08] rounded-lg space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <HeraldryShield
                        coatOfArms={house.coatOfArms || founder?.coatOfArms}
                        seed={`cadet_${house.parentDynasty}_${house.name}`}
                        size={32}
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-stone-100 flex items-center gap-1.5">
                          <Crown className="w-3 h-3 text-amber-400 shrink-0" />
                          <span className="truncate">House {house.name}</span>
                        </div>
                        <div className="text-[11px] text-stone-400 truncate">
                          Parent: {house.parentDynasty} · Founder: {founder?.name || 'Ancient Prince'}
                        </div>
                        {(house.coatOfArms?.blazon || founder?.coatOfArms?.blazon) && (
                          <div className="text-[10px] text-stone-500 italic truncate">
                            {house.coatOfArms?.blazon || founder?.coatOfArms?.blazon}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="text-[11px] font-mono tabular-nums text-amber-400 shrink-0">
                      {Math.round(house.prestige)} Prestige
                    </span>
                  </div>

                  {isFeuding && (
                    <div className="p-2 bg-red-950/60 border border-red-700/60 rounded-lg text-[10px] text-red-300 flex items-start gap-1.5">
                      <Flame className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <strong>Blood Feud vs {house.feudTargetDynasty}:</strong> {house.feudReason} (-60 Feudal Loyalty penalty).
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-3 bg-stone-950/60 border border-stone-800 rounded-xl text-center text-xs text-stone-400">
            No cadet branches have split from the royal lineage yet.
          </div>
        )}

        {/* Found Cadet Branch Action */}
        <div className="space-y-1">
          <button
            onClick={handleFoundCadet}
            disabled={!eligibleForCadet}
            className="w-full py-2 bg-amber-700 hover:bg-amber-600 disabled:opacity-45 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold transition-all shadow flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Crown className="w-3.5 h-3.5" />
            <span>Establish New Cadet Branch at Seat</span>
          </button>
          <p className="text-[10px] text-stone-400 text-center">
            {activeChar.role === 'Monarch'
              ? 'The Sovereign Monarch bears the Kingdom & Royal House banner directly.'
              : eligibleForCadet
                ? 'A cadet branch receives a slight cadency modification of the parent House banner.'
                : 'Requires noble house lineage or a personal banner bestowed by a Duke or King.'}
          </p>
        </div>

        {/* Swear Blood Feud Form */}
        <div className="p-3 bg-stone-900/90 border border-stone-800 rounded-xl space-y-2.5">
          <div className="text-[11px] font-bold text-red-400 flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5" />
            <span>Swear Dynastic Blood Feud</span>
          </div>

          <input
            type="text"
            placeholder="Target Dynasty / House Name..."
            value={feudTargetHouse}
            onChange={(e) => setFeudTargetHouse(e.target.value)}
            className="w-full p-1.5 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-200"
          />

          <input
            type="text"
            placeholder="Reason (e.g. Disputed Inheritance, Execution of Kin)..."
            value={feudReason}
            onChange={(e) => setFeudReason(e.target.value)}
            className="w-full p-1.5 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-200"
          />

          <button
            onClick={handleDeclareFeud}
            disabled={!feudTargetHouse.trim()}
            className="w-full py-1.5 bg-red-800 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>Swear Eternal Vendetta</span>
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // 4. PESTILENCE & PROVINCIAL QUARANTINE PANEL
  // ==========================================
  if (activeTab === 'plague') {
    const epidemics = world.epidemics || [];
    const lockedDown = world.lockedDownProvinces || [];

    const handleToggleLockdown = (provId: string) => {
      const updated = cloneWorldState(world);
      const isNowLocked = PlagueEngine.toggleQuarantine(provId, updated);
      onUpdateWorld(updated);
      emitNotify(isNowLocked ? 'QUARANTINE: Castle gates barred!' : 'QUARANTINE: Gates reopened.');
    };

    return (
      <div className={`space-y-3.5 text-stone-200 ${!propActiveTab ? 'h-full overflow-y-auto p-4' : 'pt-2 border-t border-stone-800'}`}>
        {standaloneNav}
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase font-bold text-red-400 tracking-wider flex items-center gap-1.5">
            <Skull className="w-3.5 h-3.5" />
            <span>Epidemics & Provincial Quarantine ({epidemics.length} Active)</span>
          </div>
          <span className="text-[10px] text-stone-400 font-mono">
            {lockedDown.length} Provinces Barred
          </span>
        </div>

        {/* Active Epidemics List */}
        {epidemics.length > 0 ? (
          <div className="space-y-2">
            {epidemics.map((ep) => (
              <div
                key={ep.id}
                className="p-3 bg-red-950/35 border border-red-800/50 rounded-lg space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-xs text-red-300 flex items-center gap-1.5">
                    <Skull className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    <span>{ep.name}</span>
                  </div>
                  <span className="text-[11px] font-mono tabular-nums text-red-400 font-semibold">
                    {Math.round(ep.lethality * 100)}% Lethality
                  </span>
                </div>
                <div className="text-[11px] text-stone-300">
                  Remaining Duration: <strong className="text-amber-300 font-mono tabular-nums">{ep.monthsRemaining} Months</strong>
                </div>
                <div className="text-[11px] text-stone-400 flex flex-wrap gap-1.5 mt-1">
                  <span>Infected Lands:</span>
                  {ep.infectedProvinceIds.map((pid) => (
                    <span key={pid} className="text-red-300">
                      {world.provinces?.find((p) => p.id === pid)?.name || pid}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-3 bg-stone-900/45 border border-white/[0.08] rounded-lg text-center text-xs text-stone-400">
            No active plagues spreading. The air across the realm is clean and fair.
          </div>
        )}

        {/* Provincial Quarantine Toggles */}
        <div className="space-y-2 pt-1">
          <div className="text-[11px] uppercase font-semibold text-stone-400 tracking-wider">
            Provincial Castle Quarantine Controls
          </div>
          <div className="divide-y divide-white/[0.06] border border-white/[0.08] rounded-lg bg-stone-900/40 max-h-56 overflow-y-auto">
            {world.provinces?.map((prov) => {
              const isLocked = lockedDown.includes(prov.id);
              const isInfected = epidemics.some((ep) => ep.infectedProvinceIds.includes(prov.id));

              return (
                <div
                  key={prov.id}
                  className="px-3 py-2.5 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-semibold text-stone-200 flex items-center gap-2">
                      <span>{prov.name}</span>
                      {isInfected && (
                        <span className="text-[11px] text-red-400 font-semibold">
                          Infected
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-stone-400">
                      {prov.terrain} · {isLocked ? 'Portcullis Barred' : 'Open Trade'}
                    </div>
                  </div>

                  <button
                    onClick={() => handleToggleLockdown(prov.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                      isLocked
                        ? 'bg-red-800 hover:bg-red-700 text-white shadow'
                        : 'bg-stone-800 hover:bg-stone-700 text-stone-300'
                    }`}
                  >
                    {isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                    <span>{isLocked ? 'Locked Down' : 'Open Gates'}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // 5. CONSTITUTIONAL LAWS & REALM HEGEMONY PANEL
  // ==========================================
  if (activeTab === 'laws') {
    const handleAccuse = () => {
      if (!accusedId) return;
      const updated = cloneWorldState(world);
      const accuser = updated.characters.find((c) => c.id === activeChar.id);
      const accused = updated.characters.find((c) => c.id === accusedId);
      if (!accuser || !accused) return;

      const res = JusticeEngine.accuse(accuser, accused, accusedCrime, updated);
      onUpdateWorld(updated);
      emitNotify(res.summary);
    };

    return (
      <div className={`space-y-3.5 text-stone-200 ${!propActiveTab ? 'h-full overflow-y-auto p-4' : 'pt-2 border-t border-stone-800'}`}>
        {standaloneNav}
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase font-bold text-amber-400 tracking-wider flex items-center gap-1.5">
            <Scale className="w-3.5 h-3.5" />
            <span>Realm Constitution & Hegemony</span>
          </div>
          <span className="text-[10px] text-amber-300 font-bold font-mono">
            {world.realmState || 'Balanced Feudalism'}
          </span>
        </div>

        {/* Hegemony Gauge */}
        <div className="p-3 bg-stone-950/80 border border-stone-800 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span>Sovereign Hegemony:</span>
            <span className="text-amber-400 font-mono">{(world.hegemony || 1.1).toFixed(2)}x Ratio</span>
          </div>
          <div className="w-full bg-stone-900 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                (world.hegemony || 1.1) >= 1.5 ? 'bg-amber-500' : (world.hegemony || 1.1) >= 0.75 ? 'bg-emerald-500' : 'bg-red-500'
              }`}
              style={{ width: `${Math.min(100, ((world.hegemony || 1.1) / 2.0) * 100)}%` }}
            />
          </div>
          <div className="text-[10px] text-stone-400">
            Ratio of Crown direct fortress levies to rebellious noble coalitions. Above 1.5 triggers Absolute Autocracy; below 0.75 triggers Feudal Fragmentation.
          </div>
        </div>

        {/* Council Consensus Legislative System & 7 Pillars of Reform */}
        <CouncilConsensusPanel
          world={world}
          proposerId={activeChar.id}
          onUpdateWorld={onUpdateWorld}
          onNotify={onNotify}
        />

        {/* Dynastic Marriage & Inter-State Inheritance Laws */}
        <div className="p-3 bg-stone-900/90 border border-stone-800 rounded-xl space-y-2.5">
          <div className="text-[11px] font-bold text-amber-400 flex items-center gap-1.5">
            <Heart className="w-3.5 h-3.5" />
            <span>Marriage Alliance & Cross-Border Inheritance Laws</span>
          </div>
          <div className="space-y-2 text-[10px]">
            <div>
              <div className="text-stone-400 mb-1">Consanguinity (Blood-Relative Marriage):</div>
              <div className="grid grid-cols-3 gap-1">
                {(['Unrestricted', 'Close-Kin Forbidden', 'Strict Exogamy'] as const).map((law) => {
                  const active = (world.realmLaws?.consanguinity || 'Unrestricted') === law;
                  return (
                    <button
                      key={law}
                      type="button"
                      onClick={() => {
                        const updated = cloneWorldState(world);
                        updated.realmLaws = {
                          succession: updated.realmLaws?.succession || 'Primogeniture',
                          gender: updated.realmLaws?.gender || 'Agnatic-Cognatic',
                          authority: updated.realmLaws?.authority || 'Limited',
                          justice: updated.realmLaws?.justice || 'Traditional',
                          ...updated.realmLaws,
                          consanguinity: law,
                        };
                        onUpdateWorld(updated);
                        emitNotify(`Consanguinity Marriage Law set to: ${law}`);
                      }}
                      className={`px-2 py-1.5 rounded-md border text-[10px] font-medium cursor-pointer ${
                        active
                          ? 'bg-amber-600/25 border-amber-500/60 text-amber-200'
                          : 'bg-stone-950 border-white/[0.08] text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      {law}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="text-stone-400 mb-1">Foreign & Royal Marriage Alliances:</div>
              <div className="grid grid-cols-3 gap-1">
                {(['Open Alliances', 'Royal Permission Only', 'Domestic Only'] as const).map((law) => {
                  const active = (world.realmLaws?.foreignMarriage || 'Open Alliances') === law;
                  return (
                    <button
                      key={law}
                      type="button"
                      onClick={() => {
                        const updated = cloneWorldState(world);
                        updated.realmLaws = {
                          succession: updated.realmLaws?.succession || 'Primogeniture',
                          gender: updated.realmLaws?.gender || 'Agnatic-Cognatic',
                          authority: updated.realmLaws?.authority || 'Limited',
                          justice: updated.realmLaws?.justice || 'Traditional',
                          ...updated.realmLaws,
                          foreignMarriage: law,
                        };
                        onUpdateWorld(updated);
                        emitNotify(`Foreign Marriage Law set to: ${law}`);
                      }}
                      className={`px-2 py-1.5 rounded-md border text-[10px] font-medium cursor-pointer ${
                        active
                          ? 'bg-amber-600/25 border-amber-500/60 text-amber-200'
                          : 'bg-stone-950 border-white/[0.08] text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      {law}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="text-stone-400 mb-1">Inter-State Succession & Foreign Heirs:</div>
              <div className="grid grid-cols-3 gap-1">
                {(['Permitted', 'Crown Approval', 'Salic Exclusion'] as const).map((law) => {
                  const active = (world.realmLaws?.foreignInheritance || 'Permitted') === law;
                  return (
                    <button
                      key={law}
                      type="button"
                      onClick={() => {
                        const updated = cloneWorldState(world);
                        updated.realmLaws = {
                          succession: updated.realmLaws?.succession || 'Primogeniture',
                          gender: updated.realmLaws?.gender || 'Agnatic-Cognatic',
                          authority: updated.realmLaws?.authority || 'Limited',
                          justice: updated.realmLaws?.justice || 'Traditional',
                          ...updated.realmLaws,
                          foreignInheritance: law,
                        };
                        onUpdateWorld(updated);
                        emitNotify(`Foreign Inheritance Law set to: ${law}`);
                      }}
                      className={`px-2 py-1.5 rounded-md border text-[10px] font-medium cursor-pointer ${
                        active
                          ? 'bg-amber-600/25 border-amber-500/60 text-amber-200'
                          : 'bg-stone-950 border-white/[0.08] text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      {law}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Accuse of Feudal Crime Tool */}
        <div className="p-3 bg-stone-900/45 border border-white/[0.08] rounded-lg space-y-2">
          <div className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
            <Scale className="w-3.5 h-3.5" />
            <span>Indict Noble in Royal Court Trial</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-stone-400 block mb-1">Accused Noble</label>
              <select
                value={accusedId}
                onChange={(e) => setAccusedId(e.target.value)}
                className="w-full p-1.5 bg-stone-950 border border-white/[0.08] rounded-md text-xs text-stone-200"
              >
                {livingChars
                  .filter((c) => c.id !== activeChar.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({formatCharacterRoleLabel(c, world)})
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] text-stone-400 block mb-1">Accused Crime</label>
              <select
                value={accusedCrime}
                onChange={(e) => setAccusedCrime(e.target.value as CrimeType)}
                className="w-full p-1.5 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-200"
              >
                <option value="Treason">High Treason (Execution)</option>
                <option value="Murder">Murder / Poisoning (Execution)</option>
                <option value="Adultery">Adultery (Monastery)</option>
                <option value="Embezzlement">Embezzlement (Fine)</option>
                <option value="Heresy">Heresy (Monastery / Fire)</option>
                <option value="Plot Against Liege">Plot Against Liege (Revocation)</option>
                <option value="Refuse Levy">Refuse Levy (Revocation)</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleAccuse}
            className="w-full py-1.5 bg-red-800 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-all shadow flex items-center justify-center gap-1.5 cursor-pointer mt-1"
          >
            <Scale className="w-3.5 h-3.5" />
            <span>Convene Royal Court & Sentence</span>
          </button>
        </div>
      </div>
    );
  }

  return null;
};
