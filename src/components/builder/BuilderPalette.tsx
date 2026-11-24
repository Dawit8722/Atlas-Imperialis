import React, { useMemo, useState } from 'react';
import {
  Mountain,
  ArrowDownToLine,
  Minus,
  Wind,
  Waves,
  Trees,
  Sun,
  Snowflake,
  Droplets,
  Eraser,
  Crown,
  Shield,
  Castle,
  MapPin as MapPinIcon,
  MousePointer,
  Undo2,
  Redo2,
  RotateCcw,
  Sparkles,
  FilePlus2,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Check,
  X,
  PenTool,
  Navigation,
  Anchor,
} from 'lucide-react';
import {
  WorldState,
  TerrainSimConfig,
  PaintBrushMode,
  BrushFalloff,
  Burg,
  MapPin,
  Point2D,
  BorderKind,
  RouteClassification,
} from '../../types/world';

export interface BuilderPaletteProps {
  world: WorldState;
  brushConfig: TerrainSimConfig;
  onUpdateBrushConfig: (patch: Partial<TerrainSimConfig>) => void;
  onUndoBrush: () => void;
  onRedoBrush: () => void;
  canUndoBrush: boolean;
  canRedoBrush: boolean;
  onResetBrushEdits: () => void;
  onAutoPopulateTerrain: () => void;
  onOpenNewWorldModal: () => void;
  draftRiverPoints: Point2D[];
  riverNameDraft: string;
  onChangeRiverNameDraft: (name: string) => void;
  riverWidthScale: number;
  onChangeRiverWidthScale: (scale: number) => void;
  onFinishDraftRiver: () => void;
  onCancelDraftRiver: () => void;
  onRenameCustomRiver: (riverId: string, name: string) => void;
  onDeleteCustomRiver: (riverId: string) => void;
  stampBurgType: Burg['type'];
  onChangeStampBurgType: (type: Burg['type']) => void;
  stampBurgName: string;
  onChangeStampBurgName: (name: string) => void;
  stampBurgRealmId: string;
  onChangeStampBurgRealmId: (realmId: string) => void;
  pinLabelDraft: string;
  onChangePinLabelDraft: (label: string) => void;
  pinCategoryDraft: MapPin['category'];
  onChangePinCategoryDraft: (cat: MapPin['category']) => void;
  pinNotesDraft: string;
  onChangePinNotesDraft: (notes: string) => void;
  onDeleteMapPin: (pinId: string) => void;
  onRenameMapPin?: (pinId: string, label: string) => void;
  onFocusPin?: (pin: MapPin) => void;
  borderDrawMode: 'brush' | 'polyline';
  onChangeBorderDrawMode: (mode: 'brush' | 'polyline') => void;
  draftBorderPoints: Point2D[];
  onFinishDraftBorder: () => void;
  onCancelDraftBorder: () => void;
  onDeleteCustomBorder: (borderId: string) => void;
  onClearAllCustomBorders: () => void;
  routeCategory: RouteClassification;
  onChangeRouteCategory: (category: RouteClassification) => void;
  routeUsePathfinding: boolean;
  onChangeRouteUsePathfinding: (val: boolean) => void;
  routeSnapToBurgs: boolean;
  onChangeRouteSnapToBurgs: (val: boolean) => void;
  draftRoutePoints: Point2D[];
  onPopDraftRoutePoint: () => void;
  onFinishDraftRoute: () => void;
  onCancelDraftRoute: () => void;
  onDeleteTradeRoute: (routeId: string) => void;
  onRegenerateRoutes: (scope: 'all' | 'overland' | 'maritime') => void;
}

const BURG_TYPES: Burg['type'][] = [
  'Capital Citadel',
  'Royal Metropolis',
  'Ancient Sanctuary',
  'Trade Port',
  'Border Fortress',
  'Market Town',
  'Fishing Port',
  'Farming Village',
  'Mountain Hamlet',
];

const PIN_CATEGORIES: MapPin['category'][] = ['Marker', 'Lore', 'Ruin', 'Dungeon', 'Lair'];

const BORDER_KINDS: Array<{ id: BorderKind; label: string }> = [
  { id: 'interstate', label: 'Interstate Frontier' },
  { id: 'inter_duchy', label: 'Inter-Duchy March' },
  { id: 'county', label: 'County Line' },
  { id: 'barony', label: 'Barony Partition' },
  { id: 'march', label: 'Border March' },
  { id: 'disputed', label: 'Disputed Frontier' },
  { id: 'ecclesiastical', label: 'Ecclesiastical See' },
];

const ROUTE_CATEGORIES: Array<{ id: RouteClassification; label: string }> = [
  { id: 'Imperial Highway', label: 'Imperial Highway (Overland)' },
  { id: 'Merchant Road', label: 'Merchant Road (Overland)' },
  { id: 'Mountain Pass', label: 'Mountain Pass (Overland)' },
  { id: 'River Barge Route', label: 'River Barge Route (Overland)' },
  { id: 'Maritime Sea Lane', label: 'Maritime Sea Lane (Sea)' },
];

export const BuilderPalette: React.FC<BuilderPaletteProps> = ({
  world,
  brushConfig,
  onUpdateBrushConfig,
  onUndoBrush,
  onRedoBrush,
  canUndoBrush,
  canRedoBrush,
  onResetBrushEdits,
  onAutoPopulateTerrain,
  onOpenNewWorldModal,
  draftRiverPoints,
  riverNameDraft,
  onChangeRiverNameDraft,
  riverWidthScale,
  onChangeRiverWidthScale,
  onFinishDraftRiver,
  onCancelDraftRiver,
  onRenameCustomRiver,
  onDeleteCustomRiver,
  stampBurgType,
  onChangeStampBurgType,
  stampBurgName,
  onChangeStampBurgName,
  stampBurgRealmId,
  onChangeStampBurgRealmId,
  pinLabelDraft,
  onChangePinLabelDraft,
  pinCategoryDraft,
  onChangePinCategoryDraft,
  pinNotesDraft,
  onChangePinNotesDraft,
  onDeleteMapPin,
  onRenameMapPin,
  onFocusPin,
  borderDrawMode,
  onChangeBorderDrawMode,
  draftBorderPoints,
  onFinishDraftBorder,
  onCancelDraftBorder,
  onDeleteCustomBorder,
  onClearAllCustomBorders,
  routeCategory,
  onChangeRouteCategory,
  routeUsePathfinding,
  onChangeRouteUsePathfinding,
  routeSnapToBurgs,
  onChangeRouteSnapToBurgs,
  draftRoutePoints,
  onPopDraftRoutePoint,
  onFinishDraftRoute,
  onCancelDraftRoute,
  onDeleteTradeRoute,
  onRegenerateRoutes,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [editingPinId, setEditingPinId] = useState<string | null>(null);
  const [editingPinLabel, setEditingPinLabel] = useState('');

  const seaLevel = world.settings.terrainSim?.seaLevel ?? 0.28;
  const hasLand = world.cells.some((c) => c.elevation >= seaLevel);
  const brushMode = brushConfig.brushMode || 'inspect';
  const isSculptOrPaintBrush =
    !['inspect', 'draw_river', 'draw_route', 'place_burg', 'place_pin'].includes(brushMode) &&
    !(brushMode === 'draw_border' && borderDrawMode === 'polyline');

  const duchyOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ value: string; label: string }> = [];
    const realmNames = new Map(world.realms.map((r) => [r.id, r.name]));
    for (const c of world.counties) {
      if (c.tier === 'Duchy' || c.name.includes('Duchy') || c.duchyId) {
        const value = c.duchyId || c.id;
        if (seen.has(value)) continue;
        seen.add(value);
        const rName = realmNames.get(c.realmId) || 'Wilds';
        const dName = c.duchyName || c.name;
        list.push({ value, label: `${dName} (${rName})` });
      }
    }
    return list;
  }, [world.counties, world.realms]);

  const allRoutes = world.tradeNetwork?.routes || [];
  const overlandCount = allRoutes.filter((r) => r.type !== 'Maritime Sea Lane').length;
  const maritimeCount = allRoutes.filter((r) => r.type === 'Maritime Sea Lane').length;
  const customBorderCount = (world.customBorders || []).length;
  const borderOverrideCount = Object.keys(world.borderKindOverrides || {}).length;

  if (isCollapsed) {
    return (
      <div className="z-10 w-10 shrink-0 border-r border-stone-800 bg-stone-950 flex flex-col items-center py-3 gap-2">
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          title="Expand World Builder Palette"
          className="p-1.5 rounded-lg bg-stone-900 border border-stone-700 text-amber-300 hover:bg-stone-800 cursor-pointer"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onOpenNewWorldModal}
          title="New World / Blank / Heightmap"
          className="p-1.5 rounded-lg text-stone-300 hover:text-amber-300 hover:bg-stone-900 cursor-pointer"
        >
          <FilePlus2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onUpdateBrushConfig({ brushMode: 'mountain' })}
          title="Raise Mountains"
          className={`p-1.5 rounded-lg cursor-pointer ${
            brushMode === 'mountain' ? 'bg-amber-600/30 text-amber-300' : 'text-stone-400 hover:bg-stone-900'
          }`}
        >
          <Mountain className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onUpdateBrushConfig({ brushMode: 'forest' })}
          title="Paint Forest Relief"
          className={`p-1.5 rounded-lg cursor-pointer ${
            brushMode === 'forest' ? 'bg-emerald-600/30 text-emerald-300' : 'text-stone-400 hover:bg-stone-900'
          }`}
        >
          <Trees className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onUpdateBrushConfig({ brushMode: 'draw_border' })}
          title="Border Pen"
          className={`p-1.5 rounded-lg cursor-pointer ${
            brushMode === 'draw_border' ? 'bg-rose-600/30 text-rose-300' : 'text-stone-400 hover:bg-stone-900'
          }`}
        >
          <PenTool className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onUpdateBrushConfig({ brushMode: 'draw_route' })}
          title="Draw Trade Route"
          className={`p-1.5 rounded-lg cursor-pointer ${
            brushMode === 'draw_route' ? 'bg-amber-600/30 text-amber-300' : 'text-stone-400 hover:bg-stone-900'
          }`}
        >
          <Navigation className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onUpdateBrushConfig({ brushMode: 'draw_river' })}
          title="River Pen"
          className={`p-1.5 rounded-lg cursor-pointer ${
            brushMode === 'draw_river' ? 'bg-sky-600/30 text-sky-300' : 'text-stone-400 hover:bg-stone-900'
          }`}
        >
          <Droplets className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onUpdateBrushConfig({ brushMode: 'place_burg' })}
          title="Settlement Stamp"
          className={`p-1.5 rounded-lg cursor-pointer ${
            brushMode === 'place_burg' ? 'bg-amber-600/30 text-amber-300' : 'text-stone-400 hover:bg-stone-900'
          }`}
        >
          <Castle className="w-4 h-4" />
        </button>
      </div>
    );
  }

  const toolBtn = (
    id: PaintBrushMode,
    label: string,
    Icon: React.ComponentType<{ className?: string }>,
    tone: 'amber' | 'sky' | 'emerald' | 'rose' = 'amber',
    keySuffix = ''
  ) => {
    const active = brushMode === id;
    const activeCls =
      tone === 'sky'
        ? 'bg-sky-600/25 border-sky-500 text-sky-200'
        : tone === 'emerald'
        ? 'bg-emerald-600/25 border-emerald-500 text-emerald-200'
        : tone === 'rose'
        ? 'bg-rose-600/25 border-rose-500 text-rose-200'
        : 'bg-amber-600/25 border-amber-500 text-amber-200';
    return (
      <button
        key={`${id}${keySuffix}`}
        type="button"
        onClick={() => onUpdateBrushConfig({ brushMode: id })}
        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
          active
            ? activeCls
            : 'bg-stone-900/70 border-stone-800 text-stone-300 hover:border-stone-700 hover:text-white'
        }`}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </button>
    );
  };

  return (
    <aside className="z-10 w-64 shrink-0 border-r border-stone-800 bg-stone-950/95 flex flex-col h-full overflow-hidden text-stone-200">
      {/* Header */}
      <div className="px-3.5 py-2.5 border-b border-stone-800 flex items-center justify-between bg-stone-900/70">
        <div>
          <div className="font-cinzel text-xs font-bold text-amber-200">World Builder</div>
          <div className="text-[10px] text-stone-400">Cartography &amp; Placement</div>
        </div>
        <button
          type="button"
          onClick={() => setIsCollapsed(true)}
          title="Collapse Builder Palette"
          className="p-1 rounded-md text-stone-400 hover:text-white hover:bg-stone-800 cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Quick Actions */}
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={onOpenNewWorldModal}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 border border-stone-700 text-xs font-semibold text-amber-200 cursor-pointer whitespace-nowrap"
          >
            <FilePlus2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>New / Blank / Heightmap</span>
          </button>

          <button
            type="button"
            onClick={onAutoPopulateTerrain}
            disabled={!hasLand}
            title={
              hasLand
                ? 'Synthesize kingdoms, counties, settlements & trade routes onto sculpted terrain'
                : 'Sculpt some land above sea level first'
            }
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600/20 hover:bg-amber-600/35 disabled:opacity-40 disabled:cursor-not-allowed border border-amber-500/45 text-xs font-semibold text-amber-200 cursor-pointer whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Auto-Populate Terrain</span>
          </button>

          <div className="grid grid-cols-3 gap-1 pt-0.5">
            <button
              type="button"
              onClick={onUndoBrush}
              disabled={!canUndoBrush}
              className="flex items-center justify-center gap-1 py-1.5 rounded-lg bg-stone-900 border border-stone-800 text-[10px] text-stone-300 hover:text-white disabled:opacity-35 cursor-pointer whitespace-nowrap"
              title="Undo Stroke (Ctrl+Z)"
            >
              <Undo2 className="w-3 h-3 shrink-0" />
              Undo
            </button>
            <button
              type="button"
              onClick={onRedoBrush}
              disabled={!canRedoBrush}
              className="flex items-center justify-center gap-1 py-1.5 rounded-lg bg-stone-900 border border-stone-800 text-[10px] text-stone-300 hover:text-white disabled:opacity-35 cursor-pointer whitespace-nowrap"
              title="Redo Stroke (Ctrl+Y)"
            >
              <Redo2 className="w-3 h-3 shrink-0" />
              Redo
            </button>
            <button
              type="button"
              onClick={onResetBrushEdits}
              className="flex items-center justify-center gap-1 py-1.5 rounded-lg bg-stone-900 border border-stone-800 text-[10px] text-stone-400 hover:text-rose-300 cursor-pointer whitespace-nowrap"
              title="Reset Sculpted Terrain Overrides"
            >
              <RotateCcw className="w-3 h-3 shrink-0" />
              Reset
            </button>
          </div>
        </div>

        {/* Navigation / Select */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Cursor Mode</div>
          {toolBtn('inspect', 'Select & Inspect', MousePointer)}
        </div>

        {/* Terrain Sculpting */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Terrain Sculpting</div>
          <div className="grid grid-cols-2 gap-1.5">
            {toolBtn('mountain', 'Raise Peaks', Mountain)}
            {toolBtn('valley', 'Lower Basin', ArrowDownToLine, 'sky')}
            {toolBtn('plateau', 'Plateau', Minus)}
            {toolBtn('smooth', 'Smooth', Wind)}
            {toolBtn('ocean', 'Carve Sea', Waves, 'sky')}
          </div>
        </div>

        {/* Cartographic Relief Stamps & Paint */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Cartographic Reliefs</div>
          <div className="grid grid-cols-2 gap-1.5">
            {toolBtn('hill', 'Hills', Mountain)}
            {toolBtn('forest', 'Forest', Trees, 'emerald')}
            {toolBtn('tree', 'Solitary Tree', Trees, 'emerald')}
            {toolBtn('swamp', 'Wetland', Droplets, 'emerald')}
            {toolBtn('clear_relief', 'Erase Relief', Eraser, 'rose')}
          </div>
        </div>

        {/* Climate & Biomes */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Climate &amp; Biomes</div>
          <div className="grid grid-cols-2 gap-1.5">
            {toolBtn('desert', 'Desert', Sun)}
            {toolBtn('snow', 'Tundra / Snow', Snowflake, 'sky')}
            {toolBtn('clear_biome', 'Natural Climate', Eraser)}
          </div>
        </div>

        {/* Cartography & Placement */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Cartography &amp; Stamps</div>
          <div className="grid grid-cols-1 gap-1.5">
            {toolBtn('draw_river', 'Hydrological River Pen', Droplets, 'sky')}
            {toolBtn('place_burg', 'Settlement Stamp', Castle)}
            {toolBtn('place_pin', 'Atlas Pin Marker', MapPinIcon)}
          </div>
        </div>

        {/* Borders & Territories */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
            Borders &amp; Territories
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {toolBtn('realm', 'Interstate', Crown)}
            {toolBtn('duchy', 'Inter-Duchy', Shield)}
            {toolBtn('county', 'County', Shield)}
            {toolBtn('draw_border', 'Border Pen', PenTool, 'rose')}
            {toolBtn('clear_border', 'Erase Edge', Eraser, 'sky')}
          </div>

          {(brushMode === 'realm' || brushMode === 'duchy' || brushMode === 'county') &&
            world.realms.length === 0 && (
              <div className="p-2 rounded-lg bg-stone-900/60 border border-stone-800 text-[10px] text-stone-400">
                Auto-populate terrain first to paint kingdom, duchy, or county territories.
              </div>
            )}

          {brushMode === 'realm' && world.realms.length > 0 && (
            <select
              value={brushConfig.targetRealmId || world.realms[0]?.id || '__unclaimed__'}
              onChange={(e) => onUpdateBrushConfig({ targetRealmId: e.target.value })}
              className="w-full px-2 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-[11px] text-amber-200"
            >
              <option value="__unclaimed__">Unclaimed Wilds</option>
              {world.realms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          )}

          {brushMode === 'duchy' && duchyOptions.length > 0 && (
            <select
              value={brushConfig.targetDuchyId || duchyOptions[0]?.value || ''}
              onChange={(e) => onUpdateBrushConfig({ targetDuchyId: e.target.value })}
              className="w-full px-2 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-[11px] text-amber-200"
            >
              {duchyOptions.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          )}

          {brushMode === 'county' && world.counties.length > 0 && (
            <select
              value={brushConfig.targetCountyId || world.counties[0]?.id || ''}
              onChange={(e) => onUpdateBrushConfig({ targetCountyId: e.target.value })}
              className="w-full px-2 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-[11px] text-purple-200"
            >
              {world.counties.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          {brushMode === 'draw_border' && (
            <div className="p-2.5 rounded-xl bg-rose-950/20 border border-rose-800/45 space-y-2">
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => onChangeBorderDrawMode('brush')}
                  className={`py-1 rounded text-[10px] font-medium border cursor-pointer whitespace-nowrap ${
                    borderDrawMode === 'brush'
                      ? 'bg-rose-600/30 border-rose-500 text-rose-200'
                      : 'bg-stone-950 border-stone-800 text-stone-400'
                  }`}
                >
                  Brush Edges
                </button>
                <button
                  type="button"
                  onClick={() => onChangeBorderDrawMode('polyline')}
                  className={`py-1 rounded text-[10px] font-medium border cursor-pointer whitespace-nowrap ${
                    borderDrawMode === 'polyline'
                      ? 'bg-rose-600/30 border-rose-500 text-rose-200'
                      : 'bg-stone-950 border-stone-800 text-stone-400'
                  }`}
                >
                  Trace Line
                </button>
              </div>

              <select
                value={brushConfig.targetBorderKind || 'inter_duchy'}
                onChange={(e) => onUpdateBrushConfig({ targetBorderKind: e.target.value as BorderKind })}
                className="w-full px-2 py-1.5 rounded bg-stone-950 border border-stone-700 text-[11px] text-rose-100"
              >
                {BORDER_KINDS.map((bk) => (
                  <option key={bk.id} value={bk.id}>
                    {bk.label}
                  </option>
                ))}
              </select>

              {borderDrawMode === 'brush' ? (
                <p className="text-[10px] text-stone-400 leading-snug">
                  Paint over frontier edges to reclassify borders into the selected style.
                </p>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] text-stone-400">
                    <span>Click vertices on map. Double-click to finish.</span>
                    <span className="font-mono text-rose-200 tabular-nums">{draftBorderPoints.length} pts</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      disabled={draftBorderPoints.length < 2}
                      onClick={onFinishDraftBorder}
                      className="flex items-center justify-center gap-1 py-1 rounded bg-rose-700 hover:bg-rose-600 disabled:opacity-40 text-white text-[10px] font-semibold cursor-pointer"
                    >
                      <Check className="w-3 h-3" />
                      Finish
                    </button>
                    <button
                      type="button"
                      disabled={draftBorderPoints.length === 0}
                      onClick={onCancelDraftBorder}
                      className="flex items-center justify-center gap-1 py-1 rounded bg-stone-800 hover:bg-stone-700 disabled:opacity-40 text-stone-300 text-[10px] cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                      Clear
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {(customBorderCount > 0 || borderOverrideCount > 0) && (
            <div className="p-2 rounded-xl bg-stone-900/70 border border-stone-800 space-y-1.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-stone-400 font-semibold">
                  Custom Frontiers ({customBorderCount})
                </span>
                <span className="font-mono text-stone-500 tabular-nums">
                  {borderOverrideCount} edge{borderOverrideCount === 1 ? '' : 's'}
                </span>
              </div>
              {customBorderCount > 0 && (
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {(world.customBorders || []).map((cb) => (
                    <div
                      key={cb.id}
                      className="flex items-center justify-between gap-1 px-1.5 py-1 rounded bg-stone-950/70 border border-stone-800 text-[10px]"
                    >
                      <span className="truncate text-rose-200">
                        {BORDER_KINDS.find((b) => b.id === cb.kind)?.label || cb.kind} ({cb.points.length}p)
                      </span>
                      <button
                        type="button"
                        onClick={() => onDeleteCustomBorder(cb.id)}
                        className="p-0.5 text-stone-400 hover:text-rose-400 cursor-pointer shrink-0"
                        title="Delete Custom Border"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={onClearAllCustomBorders}
                className="w-full py-1 rounded bg-stone-800 hover:bg-rose-950/60 border border-stone-700 text-[10px] text-stone-300 hover:text-rose-200 cursor-pointer"
              >
                Clear All Border Edits
              </button>
            </div>
          )}
        </div>

        {/* Overland & Maritime Routes */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
              Trade Routes
            </span>
            <span className="text-[10px] font-mono text-stone-500 tabular-nums">
              {overlandCount}L · {maritimeCount}S
            </span>
          </div>

          {toolBtn('draw_route', 'Manual Route Pen', Navigation, 'amber')}

          <div className="grid grid-cols-3 gap-1">
            <button
              type="button"
              onClick={() => onRegenerateRoutes('all')}
              className="py-1 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-700 text-[10px] font-medium text-amber-200 cursor-pointer whitespace-nowrap"
              title="Auto-generate both overland highways and maritime sea lanes"
            >
              Gen All
            </button>
            <button
              type="button"
              onClick={() => onRegenerateRoutes('overland')}
              className="py-1 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-700 text-[10px] font-medium text-stone-200 cursor-pointer whitespace-nowrap"
              title="Auto-generate overland highways and roads"
            >
              Overland
            </button>
            <button
              type="button"
              onClick={() => onRegenerateRoutes('maritime')}
              className="flex items-center justify-center gap-0.5 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-700 text-[10px] font-medium text-sky-200 cursor-pointer whitespace-nowrap"
              title="Auto-generate maritime sea lanes"
            >
              <Anchor className="w-2.5 h-2.5 shrink-0" />
              Maritime
            </button>
          </div>

          {brushMode === 'draw_route' && (
            <div className="p-2.5 rounded-xl bg-amber-950/25 border border-amber-800/45 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                  Route Pen
                </span>
                <span className="text-[10px] font-mono text-amber-200 tabular-nums">
                  {draftRoutePoints.length} pts
                </span>
              </div>
              <p className="text-[10px] text-stone-400 leading-snug">
                Click waypoints across land or sea. Double-click or press Finish.
              </p>
              <select
                value={routeCategory}
                onChange={(e) => onChangeRouteCategory(e.target.value as RouteClassification)}
                className="w-full px-2 py-1.5 rounded bg-stone-950 border border-stone-700 text-[11px] text-amber-100"
              >
                {ROUTE_CATEGORIES.map((rc) => (
                  <option key={rc.id} value={rc.id}>
                    {rc.label}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-[10px] text-stone-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={routeUsePathfinding}
                  onChange={(e) => onChangeRouteUsePathfinding(e.target.checked)}
                  className="accent-amber-500 rounded"
                />
                <span>A* Terrain / Sea Pathfinding</span>
              </label>
              <label className="flex items-center gap-2 text-[10px] text-stone-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={routeSnapToBurgs}
                  onChange={(e) => onChangeRouteSnapToBurgs(e.target.checked)}
                  className="accent-amber-500 rounded"
                />
                <span>Snap to Settlements &amp; Ports</span>
              </label>
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  disabled={draftRoutePoints.length < 2}
                  onClick={onFinishDraftRoute}
                  className="flex items-center justify-center gap-0.5 py-1 rounded bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white text-[10px] font-semibold cursor-pointer"
                >
                  <Check className="w-3 h-3" />
                  Finish
                </button>
                <button
                  type="button"
                  disabled={draftRoutePoints.length === 0}
                  onClick={onPopDraftRoutePoint}
                  className="flex items-center justify-center gap-0.5 py-1 rounded bg-stone-800 hover:bg-stone-700 disabled:opacity-40 text-stone-300 text-[10px] cursor-pointer"
                >
                  <Undo2 className="w-3 h-3" />
                  Undo
                </button>
                <button
                  type="button"
                  disabled={draftRoutePoints.length === 0}
                  onClick={onCancelDraftRoute}
                  className="flex items-center justify-center gap-0.5 py-1 rounded bg-stone-800 hover:bg-stone-700 disabled:opacity-40 text-stone-300 text-[10px] cursor-pointer"
                >
                  <X className="w-3 h-3" />
                  Clear
                </button>
              </div>
            </div>
          )}

          {allRoutes.length > 0 && (
            <div className="divide-y divide-white/[0.06] rounded-lg bg-stone-900/45 border border-white/[0.08] max-h-36 overflow-y-auto">
              {allRoutes.slice(0, 24).map((rt) => (
                <div
                  key={rt.id}
                  className="flex items-center justify-between gap-1 px-2.5 py-1.5 text-[11px]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate">
                      <span
                        className={
                          rt.type === 'Maritime Sea Lane' ? 'text-sky-300 font-medium' : 'text-amber-200 font-medium'
                        }
                      >
                        {rt.type}
                      </span>
                      {rt.isCustom && (
                        <span className="text-amber-400 text-[10px] font-mono">· Custom</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteTradeRoute(rt.id)}
                    className="p-0.5 text-stone-400 hover:text-rose-400 cursor-pointer shrink-0"
                    title="Delete Route"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {allRoutes.length > 24 && (
                <div className="text-[10px] text-stone-400 text-center py-1">
                  +{allRoutes.length - 24} more routes on map
                </div>
              )}
            </div>
          )}
        </div>

        {/* Brush Size / Strength / Falloff */}
        {isSculptOrPaintBrush && (
          <div className="p-2.5 rounded-xl bg-stone-900/70 border border-stone-800 space-y-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Brush Settings</div>
            <div className="space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-stone-400">Radius</span>
                <span className="font-mono text-stone-200 tabular-nums">{brushConfig.brushSize}px</span>
              </div>
              <input
                type="range"
                min={10}
                max={120}
                step={2}
                value={brushConfig.brushSize}
                onChange={(e) => onUpdateBrushConfig({ brushSize: Number(e.target.value) })}
                className="w-full accent-amber-500"
              />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-stone-400">Strength</span>
                <span className="font-mono text-stone-200 tabular-nums">
                  {Math.round(brushConfig.brushStrength * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1.0}
                step={0.05}
                value={brushConfig.brushStrength}
                onChange={(e) => onUpdateBrushConfig({ brushStrength: Number(e.target.value) })}
                className="w-full accent-amber-500"
              />
            </div>
            <div className="grid grid-cols-3 gap-1">
              {(['soft', 'medium', 'hard'] as BrushFalloff[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => onUpdateBrushConfig({ brushFalloff: f })}
                  className={`py-1 rounded text-[10px] capitalize border cursor-pointer ${
                    (brushConfig.brushFalloff || 'medium') === f
                      ? 'bg-amber-600/30 border-amber-500 text-amber-200'
                      : 'bg-stone-950 border-stone-800 text-stone-400'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* River Pen Panel */}
        {(brushMode === 'draw_river' || (world.customRivers?.length || 0) > 0) && (
          <div className="p-2.5 rounded-xl bg-sky-950/25 border border-sky-800/45 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-300">
                Custom Rivers ({world.customRivers?.length || 0})
              </span>
              {brushMode === 'draw_river' && (
                <span className="text-[10px] font-mono text-sky-200 tabular-nums">
                  {draftRiverPoints.length} pts
                </span>
              )}
            </div>
            {brushMode === 'draw_river' && (
              <div className="space-y-2">
                <p className="text-[10px] text-stone-400 leading-snug">
                  Click points on the map from source to sea. Double-click or press Finish River.
                </p>
                <input
                  type="text"
                  value={riverNameDraft}
                  onChange={(e) => onChangeRiverNameDraft(e.target.value)}
                  placeholder="River name (optional)"
                  className="w-full px-2 py-1 rounded bg-stone-950 border border-stone-700 text-[11px] text-stone-100"
                />
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-stone-400">Channel Width</span>
                    <span className="font-mono text-sky-300 tabular-nums">{riverWidthScale.toFixed(1)}×</span>
                  </div>
                  <input
                    type="range"
                    min={0.6}
                    max={2.4}
                    step={0.1}
                    value={riverWidthScale}
                    onChange={(e) => onChangeRiverWidthScale(Number(e.target.value))}
                    className="w-full accent-sky-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    disabled={draftRiverPoints.length < 2}
                    onClick={onFinishDraftRiver}
                    className="flex items-center justify-center gap-1 py-1 rounded bg-sky-700 hover:bg-sky-600 disabled:opacity-40 text-white text-[10px] font-semibold cursor-pointer"
                  >
                    <Check className="w-3 h-3" />
                    Finish
                  </button>
                  <button
                    type="button"
                    disabled={draftRiverPoints.length === 0}
                    onClick={onCancelDraftRiver}
                    className="flex items-center justify-center gap-1 py-1 rounded bg-stone-800 hover:bg-stone-700 disabled:opacity-40 text-stone-300 text-[10px] cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                    Clear
                  </button>
                </div>
              </div>
            )}

            {(world.customRivers?.length || 0) > 0 && (
              <div className="space-y-1 pt-1 border-t border-sky-800/30 max-h-36 overflow-y-auto">
                {(world.customRivers || []).map((riv) => (
                  <div key={riv.id} className="flex items-center gap-1">
                    <input
                      type="text"
                      value={riv.name}
                      onChange={(e) => onRenameCustomRiver(riv.id, e.target.value)}
                      className="flex-1 min-w-0 px-1.5 py-0.5 rounded bg-stone-900 border border-stone-800 text-[10px] text-sky-100"
                    />
                    <button
                      type="button"
                      onClick={() => onDeleteCustomRiver(riv.id)}
                      className="p-1 text-stone-400 hover:text-rose-400 cursor-pointer"
                      title="Delete River"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Settlement Stamp Panel */}
        {brushMode === 'place_burg' && (
          <div className="p-2.5 rounded-xl bg-amber-950/20 border border-amber-800/45 space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
              Settlement Stamp
            </div>
            <p className="text-[10px] text-stone-400 leading-snug">
              Click any land cell on the map to found a locked settlement.
            </p>
            <select
              value={stampBurgType}
              onChange={(e) => onChangeStampBurgType(e.target.value as Burg['type'])}
              className="w-full px-2 py-1 rounded bg-stone-950 border border-stone-700 text-[11px] text-stone-100"
            >
              {BURG_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={stampBurgName}
              onChange={(e) => onChangeStampBurgName(e.target.value)}
              placeholder="Custom name (or auto)"
              className="w-full px-2 py-1 rounded bg-stone-950 border border-stone-700 text-[11px] text-stone-100"
            />
            <select
              value={stampBurgRealmId}
              onChange={(e) => onChangeStampBurgRealmId(e.target.value)}
              className="w-full px-2 py-1 rounded bg-stone-950 border border-stone-700 text-[11px] text-amber-200"
            >
              <option value="">Auto-assign by territory</option>
              <option value="independent">Independent City-State</option>
              {world.realms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Map Pins Panel */}
        {(brushMode === 'place_pin' || (world.mapPins?.length || 0) > 0) && (
          <div className="p-2.5 rounded-lg bg-stone-900/50 border border-white/[0.08] space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
              Map Pins ({world.mapPins?.length || 0})
            </div>
            {brushMode === 'place_pin' && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-stone-400 leading-snug">
                  Click anywhere on the atlas to drop a cartographic pin.
                </p>
                <input
                  type="text"
                  value={pinLabelDraft}
                  onChange={(e) => onChangePinLabelDraft(e.target.value)}
                  placeholder="Pin label"
                  className="w-full px-2 py-1 rounded-md bg-stone-950 border border-white/[0.08] text-[11px] text-stone-100"
                />
                <select
                  value={pinCategoryDraft}
                  onChange={(e) => onChangePinCategoryDraft(e.target.value as MapPin['category'])}
                  className="w-full px-2 py-1 rounded-md bg-stone-950 border border-white/[0.08] text-[11px] text-stone-100"
                >
                  {PIN_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <textarea
                  rows={2}
                  value={pinNotesDraft}
                  onChange={(e) => onChangePinNotesDraft(e.target.value)}
                  placeholder="Optional lore or GM notes..."
                  className="w-full px-2 py-1 rounded-md bg-stone-950 border border-white/[0.08] text-[11px] text-stone-200 resize-none"
                />
              </div>
            )}
            {(world.mapPins?.length || 0) > 0 && (
              <div className="divide-y divide-white/[0.06] border border-white/[0.07] rounded-md bg-stone-950/45 max-h-36 overflow-y-auto">
                {(world.mapPins || []).map((pin) => (
                  <div
                    key={pin.id}
                    className="flex items-center justify-between gap-1 px-2 py-1.5"
                  >
                    {editingPinId === pin.id ? (
                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        <input
                          type="text"
                          value={editingPinLabel}
                          onChange={(e) => setEditingPinLabel(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && editingPinLabel.trim()) {
                              onRenameMapPin?.(pin.id, editingPinLabel.trim());
                              setEditingPinId(null);
                            } else if (e.key === 'Escape') {
                              setEditingPinId(null);
                            }
                          }}
                          className="flex-1 min-w-0 px-1.5 py-0.5 rounded bg-stone-900 border border-amber-500/50 text-[11px] text-amber-100 focus:outline-none"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (editingPinLabel.trim()) {
                              onRenameMapPin?.(pin.id, editingPinLabel.trim());
                            }
                            setEditingPinId(null);
                          }}
                          className="p-1 text-emerald-400 hover:text-emerald-300 cursor-pointer"
                          title="Save Pin Name"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onFocusPin?.(pin)}
                        className="text-left min-w-0 flex-1 cursor-pointer"
                      >
                        <div className="text-[11px] font-semibold text-amber-200 truncate">{pin.label}</div>
                        <div className="text-[10px] text-stone-400">{pin.category}</div>
                      </button>
                    )}
                    {onRenameMapPin && editingPinId !== pin.id && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPinId(pin.id);
                          setEditingPinLabel(pin.label);
                        }}
                        className="p-1 text-stone-400 hover:text-amber-300 cursor-pointer"
                        title="Rename Pin"
                      >
                        <PenTool className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDeleteMapPin(pin.id)}
                      className="p-1 text-stone-400 hover:text-rose-400 cursor-pointer"
                      title="Delete Pin"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
