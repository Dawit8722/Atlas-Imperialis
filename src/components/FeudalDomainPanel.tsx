import React from 'react';
import { 
  Castle, 
  Wheat, 
  Shield, 
  Hammer, 
  AlertTriangle, 
  ArrowUpCircle, 
  Users,
  MapPin,
  TrendingUp,
  Skull
} from 'lucide-react';
import { WorldState, Character, Burg } from '../types/world';
import { 
  getBurgGarrisonStatus, 
  BUILDING_CATALOG, 
  developFiefInfrastructure,
  upgradeSettlementBuilding,
  toggleLeviesRaised
} from '../engine/feudalEngine';

import { cloneWorldState } from '../utils/cloneWorldState';

interface FeudalDomainPanelProps {
  world: WorldState;
  character?: Character;
  onSelectBurg: (burgId: string) => void;
  // Optional callback if you want the action buttons to actually update the game state
  onUpdateWorld?: (newWorld: WorldState) => void; 
}

export function FeudalDomainPanel({ world, character, onSelectBurg, onUpdateWorld }: FeudalDomainPanelProps) {
  const [notice, setNotice] = React.useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  if (!character) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-stone-500">
        No character selected.
      </div>
    );
  }

  const heldBurgs = (world.burgs || []).filter(b => b.ownerId === character.id);
  const demesneLimit = character.demesneLimit || 1;
  const isOverextended = heldBurgs.length > demesneLimit;

  // Local handler to execute engine actions and update React state
  const executeAction = (actionFn: (w: WorldState) => { success: boolean; message: string }) => {
    if (!onUpdateWorld) {
      return;
    }
    const newWorld = cloneWorldState(world);
    const result = actionFn(newWorld);
    if (result.success) {
      setNotice({ type: 'ok', text: result.message });
      onUpdateWorld(newWorld);
    } else {
      setNotice({ type: 'err', text: result.message });
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-stone-950 text-stone-200">
      
      {/* ================= HEADER: DEMESNE LIMITS ================= */}
      <div className="border-b border-white/[0.08] bg-stone-950 p-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-cinzel text-base font-bold text-amber-200">
            <Castle className="h-4 w-4 text-amber-400 shrink-0" /> Feudal Demesne
          </h2>
          <div className={`text-xs font-mono font-semibold tabular-nums ${
            isOverextended ? 'text-rose-400' : 'text-stone-300'
          }`}>
            {heldBurgs.length} / {demesneLimit} Holdings
          </div>
        </div>
        <div className="text-xs text-stone-400 flex items-center justify-between">
          <span>Holder: <strong className="text-stone-200">{character.name}</strong></span>
          <span className="font-mono text-amber-300 tabular-nums">{Math.round(character.treasury || 0).toLocaleString()}g Vault</span>
        </div>

        {notice && (
          <div
            className={`mt-2.5 flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-xs ${
              notice.type === 'ok'
                ? 'border-emerald-800/60 bg-emerald-950/40 text-emerald-200'
                : 'border-red-800/60 bg-red-950/40 text-red-200'
            }`}
          >
            <span>{notice.text}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-[11px] font-semibold opacity-75 hover:opacity-100 cursor-pointer shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}
        
        {isOverextended && (
          <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-rose-800/50 bg-rose-950/35 p-2.5 text-xs text-rose-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            <p>
              <strong>Overextension Penalty:</strong> Domain exceeds stewardship capacity. Taxes and levies are reduced by{' '}
              <span className="font-mono font-bold text-rose-300 tabular-nums">-{Math.round((character.overextensionPenalty || 0) * 100)}%</span>.
            </p>
          </div>
        )}
      </div>

      {/* ================= FIEFDOM LIST ================= */}
      <div className="p-4 space-y-4">
        {heldBurgs.length === 0 ? (
          <div className="rounded-xl border border-white/[0.08] border-dashed p-6 text-center text-sm text-stone-500">
            This character holds no personal fiefs or estates.
          </div>
        ) : (
          heldBurgs.map(burg => (
            <BurgCard 
              key={burg.id} 
              burg={burg} 
              world={world} 
              onSelect={() => onSelectBurg(burg.id)}
              onDevelop={() => executeAction((w) => developFiefInfrastructure(burg.id, w))}
              onToggleLevy={() => executeAction((w) => toggleLeviesRaised(burg.id, w))}
              onBuild={(slotId) => executeAction((w) => upgradeSettlementBuilding(burg.id, slotId, w))}
            />
          ))
        )}
      </div>

    </div>
  );
}

// ============================================================================
// INDIVIDUAL BURG CARD SUBCOMPONENT
// ============================================================================

interface BurgCardProps {
  burg: Burg;
  world: WorldState;
  onSelect: () => void;
  onDevelop: () => void;
  onToggleLevy: () => void;
  onBuild: (slotId: string) => void;
}

function BurgCard({ burg, world, onSelect, onDevelop, onToggleLevy, onBuild }: BurgCardProps) {
  const garrisonStatus = getBurgGarrisonStatus(burg, world);
  
  // Determine Food Security styling
  let foodColor = 'text-emerald-400';
  let foodBg = 'border-white/[0.08] bg-stone-900/40';
  if (burg.foodSecurity === 'STRAINED') {
    foodColor = 'text-amber-400';
    foodBg = 'bg-amber-950/30 border-amber-900/50';
  } else if (burg.foodSecurity === 'RATIONED') {
    foodColor = 'text-orange-400';
    foodBg = 'bg-orange-950/30 border-orange-900/50';
  } else if (burg.foodSecurity === 'FAMINE') {
    foodColor = 'text-rose-400 font-bold';
    foodBg = 'bg-rose-950/45 border-rose-800/70';
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-stone-900/50 transition-colors hover:border-white/[0.15]">
      
      {/* Burg Header */}
      <div 
        className="flex cursor-pointer items-center justify-between border-b border-white/[0.07] bg-stone-900/70 p-3.5 hover:bg-stone-800/70 transition-colors"
        onClick={onSelect}
      >
        <div>
          <h3 className="font-cinzel text-sm font-bold text-stone-100 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            {burg.name}
          </h3>
          <p className="text-[11px] font-medium text-stone-400 mt-0.5 tabular-nums">
            {burg.type} · Dev {burg.developmentLevel || 30}
          </p>
        </div>
        <div className="text-right text-xs font-medium text-stone-300 tabular-nums">
          <div className="flex items-center justify-end gap-1 font-mono">
            <Users className="h-3 w-3 text-stone-400" />
            {(burg.population < 50 ? Math.round(burg.population * 1000) : burg.population).toLocaleString()}
          </div>
          <div className="mt-0.5 text-[11px] text-amber-400/90">
            {burg.tradeGood}
          </div>
        </div>
      </div>

      {/* Burg Stats & Food Security */}
      <div className="p-3.5 space-y-3">
        <div className="grid grid-cols-2 divide-x divide-white/[0.07] rounded-lg border border-white/[0.08] bg-stone-950/50">
          {/* Garrison Status */}
          <div className="p-2.5">
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-stone-400">
              <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> Garrison</span>
              <span className={`font-mono tabular-nums ${garrisonStatus.isSupplied ? 'text-stone-200' : 'text-rose-400'}`}>
                {garrisonStatus.garrisonCount}/{garrisonStatus.garrisonMax}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-800">
              <div 
                className={`h-full ${garrisonStatus.isSupplied ? 'bg-sky-500' : 'bg-rose-500'}`} 
                style={{ width: `${Math.min(100, (garrisonStatus.garrisonCount / garrisonStatus.garrisonMax) * 100)}%` }} 
              />
            </div>
          </div>

          {/* Food Security */}
          <div className={`flex flex-col justify-center p-2.5 ${burg.foodSecurity === 'FAMINE' ? foodBg : ''}`}>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-stone-400">
              {burg.foodSecurity === 'FAMINE' ? <Skull className={`h-3 w-3 ${foodColor}`} /> : <Wheat className={`h-3 w-3 ${foodColor}`} />}
              Food Security
            </div>
            <div className={`text-xs font-semibold mt-0.5 tabular-nums ${foodColor}`}>
              {burg.foodSecurity || 'SECURE'}
              <span className="ml-1 text-[11px] font-mono font-normal opacity-80">
                ({burg.monthsOfFoodReserves} mo)
              </span>
            </div>
          </div>
        </div>

        {/* Existing Buildings List */}
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
            Constructed Infrastructure
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(burg.buildings || []).map(bId => {
              const def = BUILDING_CATALOG[bId];
              if (!def) return null;
              return (
                <span
                  key={bId}
                  className="inline-flex cursor-help items-center gap-1 rounded-md border border-white/[0.08] bg-stone-950/60 px-2 py-0.5 text-[11px] text-stone-300"
                  title={`${def.name}\n${def.bonusText}`}
                >
                  <span className="truncate max-w-[110px]">{def.name}</span>
                </span>
              );
            })}
            {(!burg.buildings || burg.buildings.length === 0) && (
              <span className="text-xs text-stone-500 italic">No buildings constructed.</span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 border-t border-white/[0.07] pt-3">
          <button
            type="button"
            onClick={onDevelop}
            className="flex w-full items-center justify-between rounded-lg bg-stone-800/90 px-3 py-2 text-xs font-semibold text-stone-200 transition-colors hover:bg-amber-600/20 hover:text-amber-200 cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-amber-400" /> Develop Infrastructure (+4 Dev)
            </span>
            <span className="font-mono text-amber-300 tabular-nums">55g</span>
          </button>

          <button
            type="button"
            onClick={onToggleLevy}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
              burg.leviesRaised 
                ? 'bg-rose-950/60 text-rose-200 hover:bg-rose-900/60 border border-rose-800/50' 
                : 'bg-stone-800/90 text-stone-200 hover:bg-sky-950/50 hover:text-sky-200'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" /> 
              {burg.leviesRaised ? 'Disband Levies' : 'Muster Levies'}
            </span>
            <span className="font-mono tabular-nums opacity-85">
              {garrisonStatus.levyPool.toLocaleString()} Men
            </span>
          </button>

          {/* Quick Build Row */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => onBuild('slot_keep')}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] bg-stone-950/60 py-1.5 text-[11px] font-medium text-stone-300 hover:bg-stone-800 hover:text-amber-200 cursor-pointer transition-colors"
            >
              <Hammer className="h-3 w-3" /> Upgrade Keep
            </button>
            <button
              type="button"
              onClick={() => onBuild('slot_mill')}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] bg-stone-950/60 py-1.5 text-[11px] font-medium text-stone-300 hover:bg-stone-800 hover:text-amber-200 cursor-pointer transition-colors"
            >
              <Wheat className="h-3 w-3" /> Upgrade Mill
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}