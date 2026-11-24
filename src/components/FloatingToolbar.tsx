import React, { useEffect, useMemo, useState } from 'react';
import {
  Layers,
  Map as MapIcon,
  Sparkles,
  Sliders,
  Wind,
  CloudRain,
  RefreshCw,
  Crown,
  X,
  Globe,
  Mountain,
  Maximize2,
  Copy,
  Paintbrush,
  Undo2,
  Redo2,
  RotateCcw,
  MousePointer,
  ArrowUp,
  ArrowDown,
  Minus,
  Waves,
  Trees,
  Sun,
  Snowflake,
  Droplets,
  Eraser,
  Shield,
  PenTool,
  Navigation,
  Anchor,
  Lock,
  Unlock,
  Check,
} from 'lucide-react';
import {
  BorderKind,
  BrushFalloff,
  ClimateTemplate,
  ContinentConfig,
  ContinentSummary,
  County,
  TerrainSimConfig,
  PaintBrushMode,
  Realm,
  WorldSettings,
  WorldTemplate,
  CartographyStyle,
} from '../types/world';
import { getForestBrushPreviewUrl } from '../engine/reliefAtlas';
import { MapLayer } from './MapCanvas';

interface FloatingToolbarProps {
  activeLayers: Record<MapLayer, boolean>;
  onToggleLayer: (layer: MapLayer) => void;
  mapStyle: CartographyStyle;
  onChangeMapStyle: (style: CartographyStyle) => void;
  settings: WorldSettings;
  continents?: ContinentSummary[];
  realms?: Realm[];
  counties?: County[];
  onUpdateSettings: (newSettings: WorldSettings) => void;
  onRegenerate: () => void;
  onRegenerateFromSeed?: (seed: string) => void;
  isGenerating?: boolean;
  onToggleCourt?: () => void;
  isCourtOpen?: boolean;
  brushConfig?: TerrainSimConfig;
  onUpdateBrushConfig?: (patch: Partial<TerrainSimConfig>) => void;
  onUndoBrush?: () => void;
  onRedoBrush?: () => void;
  canUndoBrush?: boolean;
  canRedoBrush?: boolean;
  onResetBrushEdits?: () => void;
  onReseedFromTerrain?: () => void;
  appMode?: 'builder' | 'game';
  sandboxBrushUnlocked?: boolean;
  onToggleSandboxBrush?: () => void;
  onRegenerateRoutes?: (scope: 'all' | 'overland' | 'maritime') => void;
}

const clamp = (val: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(val)));

function defaultContinentLabel(idx: number, total: number): string {
  if (total <= 1) return 'Mainland Continent';
  if (total === 2) return idx === 0 ? 'Western Continent' : 'Eastern Continent';
  if (total === 3) {
    return idx === 0 ? 'Western Continent' : idx === 1 ? 'Central Continent' : 'Eastern Continent';
  }
  return `Continent ${idx + 1}`;
}

function buildSyncedContinentConfigs(
  count: number,
  base: WorldSettings,
  existing?: ContinentConfig[],
  detected?: ContinentSummary[]
): ContinentConfig[] {
  const safeCount = Math.max(1, Math.min(6, count));
  const baseRealms = base.realmCount ?? 10;
  const baseDuchies = base.duchiesPerRealm ?? 2;
  const baseCounties = base.countiesPerRealm ?? 10;

  const list: ContinentConfig[] = [];
  for (let i = 0; i < safeCount; i++) {
    const prev = existing?.[i];
    const det = detected?.[i];
    const autoRealms =
      i === 0
        ? Math.max(1, Math.ceil(baseRealms / safeCount))
        : Math.max(1, Math.floor(baseRealms / safeCount));
    list.push({
      id: i,
      name: prev?.name || det?.name || defaultContinentLabel(i, safeCount),
      realmCount: prev?.realmCount ?? clamp(autoRealms, 0, 12),
      duchiesPerRealm: prev?.duchiesPerRealm ?? clamp(baseDuchies, 0, 8),
      countiesPerRealm: prev?.countiesPerRealm ?? clamp(baseCounties, 1, 32),
      sizeScale: prev?.sizeScale ?? 1.0,
      reliefBias: prev?.reliefBias ?? 1.0,
    });
  }
  return list;
}

interface StepperNumberProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (val: number) => void;
  hint?: string;
}

const StepperNumber: React.FC<StepperNumberProps> = ({
  label,
  value,
  min,
  max,
  onChange,
  hint,
}) => {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-stone-300 gap-2">
        <span className="truncate">{label}</span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onChange(clamp(value - 1, min, max))}
            disabled={value <= min}
            className="w-5 h-5 flex items-center justify-center rounded bg-stone-800 hover:bg-stone-700 disabled:opacity-35 text-stone-200 font-mono text-xs cursor-pointer"
          >
            -
          </button>
          <input
            type="number"
            min={min}
            max={max}
            value={value}
            onChange={(e) => {
              const parsed = parseInt(e.target.value, 10);
              if (!Number.isNaN(parsed)) onChange(clamp(parsed, min, max));
            }}
            className="w-11 px-1 py-0.5 text-center bg-stone-900 border border-stone-700 rounded font-mono text-[11px] text-amber-300 font-bold focus:outline-none focus:border-amber-500"
          />
          <button
            type="button"
            onClick={() => onChange(clamp(value + 1, min, max))}
            disabled={value >= max}
            className="w-5 h-5 flex items-center justify-center rounded bg-stone-800 hover:bg-stone-700 disabled:opacity-35 text-stone-200 font-mono text-xs cursor-pointer"
          >
            +
          </button>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(clamp(parseInt(e.target.value, 10), min, max))}
        className="w-full accent-amber-500 cursor-pointer h-1.5 bg-stone-800 rounded"
      />
      {hint && <div className="text-[10px] text-stone-500 font-mono">{hint}</div>}
    </div>
  );
};

export const FloatingToolbar: React.FC<FloatingToolbarProps> = ({
  activeLayers,
  onToggleLayer,
  mapStyle,
  onChangeMapStyle,
  settings,
  continents,
  realms = [],
  counties = [],
  onUpdateSettings,
  onRegenerate,
  onRegenerateFromSeed,
  isGenerating,
  onToggleCourt,
  isCourtOpen,
  brushConfig,
  onUpdateBrushConfig,
  onUndoBrush,
  onRedoBrush,
  canUndoBrush,
  canRedoBrush,
  onResetBrushEdits,
  onReseedFromTerrain,
  appMode = 'game',
  sandboxBrushUnlocked = false,
  onToggleSandboxBrush,
  onRegenerateRoutes,
}) => {
  const [activeFlyout, setActiveFlyout] = useState<'layers' | 'settings' | 'brush' | null>(null);
  const [confirmReseed, setConfirmReseed] = useState(false);
  const [draft, setDraft] = useState<WorldSettings>(settings);
  const brushesEnabled = appMode === 'builder' || sandboxBrushUnlocked;

  useEffect(() => {
    if (!brushesEnabled && activeFlyout === 'brush') {
      setActiveFlyout(null);
    }
  }, [brushesEnabled, activeFlyout]);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const activeBrush = brushConfig || settings.terrainSim;
  const brushMode: PaintBrushMode = activeBrush?.brushMode || 'inspect';
  const brushSize = activeBrush?.brushSize ?? 40;
  const brushStrength = activeBrush?.brushStrength ?? 0.5;
  const brushFalloff: BrushFalloff = activeBrush?.brushFalloff || 'medium';
  const targetRealmId =
    activeBrush?.targetRealmId === '__unclaimed__' ||
    realms.some((r) => r.id === activeBrush?.targetRealmId)
      ? activeBrush.targetRealmId!
      : realms[0]?.id || '__unclaimed__';
  const duchyCounties = counties.filter((c) => c.tier === 'Duchy' || c.name.includes('Duchy'));
  const targetDuchyId =
    activeBrush?.targetDuchyId &&
    duchyCounties.some((d) => (d.duchyId || d.id) === activeBrush.targetDuchyId)
      ? activeBrush.targetDuchyId
      : duchyCounties[0]?.duchyId || duchyCounties[0]?.id || counties[0]?.id || '';
  const targetCountyId = counties.some((c) => c.id === activeBrush?.targetCountyId)
    ? activeBrush!.targetCountyId!
    : counties[0]?.id || '';
  const targetBorderKind: BorderKind = activeBrush?.targetBorderKind || 'inter_duchy';

  const templates: WorldTemplate[] = [
    'Continents',
    'Volcano',
    'High Island',
    'Low Island',
    'Archipelago',
    'Atoll',
    'Mediterranean',
    'Peninsula',
    'Isthmus',
    'Pangaea',
    'Inland Sea',
    'Shattered Realm',
  ];

  const climateTemplates: { id: ClimateTemplate; label: string }[] = [
    { id: 'Temperate Hearth', label: 'Temperate Hearth (European)' },
    { id: 'Whole World', label: 'Whole World (Equator & Poles)' },
    { id: 'Northern Hemisphere', label: 'Northern Hemisphere' },
    { id: 'Southern Hemisphere', label: 'Southern Hemisphere' },
    { id: 'Equatorial', label: 'Equatorial (Tropical)' },
    { id: 'Nordic Boreal', label: 'Nordic Boreal (Subarctic)' },
    { id: 'Arid Steppe', label: 'Arid Steppe (Deserts)' },
    { id: 'Glacial Age', label: 'Glacial Age (Icebound)' },
  ];

  const layerGroups: Array<{ title: string; items: Array<[MapLayer, string, boolean?]> }> = [
    {
      title: 'Political & Territory',
      items: [
        ['political', 'Realms & Sovereign Borders'],
        ['feudal', 'Counties & Fiefdoms'],
        ['banners', 'State & Duchy Banners'],
        ['provinces', 'Provinces & Topography'],
        ['burgs', 'Settlements & Ports'],
      ],
    },
    {
      title: 'Trade, War & Crises',
      items: [
        ['routes', 'Trade & Sea Routes'],
        ['caravans', 'Merchant Convoys'],
        ['epidemics', 'Epidemics & Plagues'],
        ['devastation', 'War Devastation Heatmap'],
        ['density', 'Population Density'],
      ],
    },
    {
      title: 'Terrain, Relief & Climate',
      items: [
        ['relief', 'Relief Art (All)'],
        ['reliefMountains', 'Mountains', true],
        ['reliefHills', 'Hills', true],
        ['reliefForests', 'Forests', true],
        ['reliefTrees', 'Solitary Trees', true],
        ['reliefSwamps', 'Wetlands', true],
        ['biomes', 'Seasonal Biomes'],
        ['weather', 'Weather & Seasons'],
        ['rivers', 'Rivers & Basins'],
        ['contours', 'Contour Lines'],
      ],
    },
  ];

  const activeContinentCount =
    draft.template === 'Continents'
      ? Math.max(2, Math.min(6, draft.continentCount || 2))
      : Math.max(1, Math.min(6, continents?.length || 1));

  const syncedContinentConfigs = useMemo(
    () =>
      buildSyncedContinentConfigs(
        activeContinentCount,
        draft,
        draft.continentConfigs,
        continents
      ),
    [activeContinentCount, draft, continents]
  );

  const commitDraft = (next: WorldSettings) => {
    setDraft(next);
    onUpdateSettings(next);
  };

  const totalDetectedCells = useMemo(
    () => Math.max(1, (continents || []).reduce((s, c) => s + c.cellCount, 0)),
    [continents]
  );

  const plannedSummary = useMemo(() => {
    if (draft.perContinentMode) {
      const states = syncedContinentConfigs.reduce((s, c) => s + (c.realmCount ?? 0), 0);
      const counties = syncedContinentConfigs.reduce(
        (s, c) => s + (c.realmCount ?? 0) * (c.countiesPerRealm ?? 8),
        0
      );
      const duchies = syncedContinentConfigs.reduce(
        (s, c) =>
          s +
          (c.realmCount ?? 0) *
            Math.min(c.duchiesPerRealm ?? 2, Math.max(0, (c.countiesPerRealm ?? 8) - 1)),
        0
      );
      return { states, duchies, counties };
    }
    const states = draft.realmCount ?? 10;
    const countiesPer = draft.countiesPerRealm ?? 10;
    const duchiesPer = Math.min(draft.duchiesPerRealm ?? 2, Math.max(0, countiesPer - 1));
    return {
      states,
      duchies: states * duchiesPer,
      counties: states * countiesPer,
    };
  }, [draft, syncedContinentConfigs]);

  const updateContinentConfig = (
    idx: number,
    patch: Partial<ContinentConfig>,
    shouldCommit = false
  ) => {
    const nextList = syncedContinentConfigs.map((cfg, i) =>
      i === idx ? { ...cfg, ...patch } : cfg
    );
    const nextDraft: WorldSettings = {
      ...draft,
      perContinentMode: true,
      continentConfigs: nextList,
    };
    if (shouldCommit) commitDraft(nextDraft);
    else setDraft(nextDraft);
  };

  return (
    <div className="relative z-30 select-none">
      {/* Floating Vertical Strip */}
      <div className="flex flex-col items-center gap-1.5 p-1.5 rounded-2xl bg-stone-950/80 backdrop-blur-xl border border-white/10 shadow-2xl text-stone-300">
        {/* 1. Layers Toggle Popover */}
        <button
          onClick={() => {
            if (activeFlyout === 'brush' && onUpdateBrushConfig) onUpdateBrushConfig({ brushMode: 'inspect' });
            setActiveFlyout(activeFlyout === 'layers' ? null : 'layers');
          }}
          title="Map Overlays & Strategic Views"
          className={`p-2.5 rounded-xl transition-all cursor-pointer relative ${
            activeFlyout === 'layers'
              ? 'bg-amber-600 text-white shadow-md'
              : 'hover:bg-stone-800/80 hover:text-white'
          }`}
        >
          <Layers className="w-4 h-4" />
        </button>

        {/* 2. Map Brush Studio (Builder Mode or optional Simulator Sandbox unlock) */}
        {onUpdateBrushConfig && brushesEnabled && (
          <button
            onClick={() => {
              setConfirmReseed(false);
              if (activeFlyout === 'brush') {
                onUpdateBrushConfig({ brushMode: 'inspect' });
                setActiveFlyout(null);
              } else {
                setActiveFlyout('brush');
              }
            }}
            title="Map Brush Studio (Sculpt Terrain, Biomes & Borders)"
            className={`p-2.5 rounded-xl transition-all cursor-pointer ${
              activeFlyout === 'brush'
                ? 'bg-amber-600 text-white shadow-md'
                : brushMode !== 'inspect'
                ? 'bg-amber-950/90 text-amber-300 ring-1 ring-amber-500/70'
                : 'hover:bg-stone-800/80 hover:text-white'
            }`}
          >
            <Paintbrush className="w-4 h-4" />
          </button>
        )}

        {onUpdateBrushConfig && appMode !== 'builder' && onToggleSandboxBrush && (
          <button
            type="button"
            onClick={() => {
              if (sandboxBrushUnlocked) {
                onUpdateBrushConfig({ brushMode: 'inspect' });
                if (activeFlyout === 'brush') setActiveFlyout(null);
              }
              onToggleSandboxBrush();
            }}
            title={
              sandboxBrushUnlocked
                ? 'Lock Simulator Brushes'
                : 'Unlock Sandbox Brushes'
            }
            className={`p-2.5 rounded-xl transition-colors cursor-pointer ${
              sandboxBrushUnlocked
                ? 'bg-amber-950/80 text-amber-300 border border-amber-600/50'
                : 'text-stone-400 hover:bg-stone-800/80 hover:text-stone-200'
            }`}
          >
            {sandboxBrushUnlocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
          </button>
        )}

        {/* 4. World Generation & Procedural Sliders */}
        <button
          type="button"
          onClick={() => {
            if (activeFlyout === 'brush' && onUpdateBrushConfig) onUpdateBrushConfig({ brushMode: 'inspect' });
            setActiveFlyout(activeFlyout === 'settings' ? null : 'settings');
          }}
          title="World Generation & Landmass Settings"
          className={`p-2.5 rounded-xl transition-all cursor-pointer ${
            activeFlyout === 'settings'
              ? 'bg-amber-600 text-white shadow-md'
              : 'hover:bg-stone-800/80 hover:text-white'
          }`}
        >
          <Sliders className="w-4 h-4" />
        </button>

        {/* 5. Quick New Seed Button */}
        <button
          type="button"
          onClick={onRegenerate}
          disabled={isGenerating}
          title="Generate New Random World"
          className="p-2.5 rounded-xl hover:bg-stone-800/80 hover:text-amber-400 transition-all cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin text-amber-400' : ''}`} />
        </button>

        <div className="w-5 h-px bg-white/10 my-0.5" />

        {/* 5. Court & Ruler Inspector Toggle */}
        {onToggleCourt && (
          <button
            type="button"
            onClick={onToggleCourt}
            title={isCourtOpen ? 'Close Inspector' : 'Open Inspector'}
            className={`p-2.5 rounded-xl transition-all cursor-pointer ${
              isCourtOpen
                ? 'bg-amber-600/90 text-white shadow-md'
                : 'hover:bg-stone-800/80 hover:text-amber-300'
            }`}
          >
            <Crown className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Flyout 1: Map Layers Panel */}
      {activeFlyout === 'layers' && (
        <div className="absolute right-14 top-0 w-72 p-4 glass-panel rounded-xl shadow-2xl text-xs space-y-3 z-40">
          <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.08]">
            <span className="font-cinzel text-amber-100 font-semibold tracking-wide text-sm">
              Map Layers
            </span>
            <button
              type="button"
              onClick={() => setActiveFlyout(null)}
              className="text-stone-400 hover:text-white p-1 rounded-md hover:bg-stone-800/70 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3 max-h-[calc(100vh-19rem)] overflow-y-auto pr-1">
            {layerGroups.map((group, gIdx) => (
              <div
                key={group.title}
                className={gIdx > 0 ? 'pt-2.5 border-t border-white/[0.07] space-y-1' : 'space-y-1'}
              >
                <div className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                  {group.title}
                </div>
                {group.items.map(([key, label, isSub]) => {
                  const active = activeLayers[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onToggleLayer(key)}
                      className={`w-full flex items-center justify-between gap-2 ${
                        isSub ? 'pl-5 pr-2 py-1' : 'px-2 py-1.5'
                      } rounded-lg text-left transition-colors cursor-pointer ${
                        active
                          ? 'bg-amber-500/12 text-amber-100 font-medium'
                          : 'text-stone-400 hover:bg-stone-900/70 hover:text-stone-200'
                      }`}
                    >
                      <span className={`truncate ${isSub ? 'text-[11px]' : 'text-xs'}`}>{label}</span>
                      <span
                        className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${
                          active
                            ? 'bg-amber-600 border-amber-500 text-white'
                            : 'bg-stone-900 border-stone-700 text-transparent'
                        }`}
                      >
                        <Check className="w-2.5 h-2.5" />
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="pt-2.5 border-t border-white/[0.08] space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
              Map Style
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  ['atlas', 'Atlas'],
                  ['parchment', 'Parchment'],
                  ['vintage', 'Vintage'],
                  ['ink', 'Ink'],
                  ['hand_drawn', 'Hand-Drawn'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onChangeMapStyle(id)}
                  className={`px-2 py-1.5 rounded-md border text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    mapStyle === id || (id === 'atlas' && mapStyle === 'relief')
                      ? 'bg-amber-600/25 border-amber-500/70 text-amber-100 font-semibold'
                      : 'bg-stone-900/80 border-stone-800 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Flyout 2: World Generation, Continents & Feudal Hierarchy */}
      {activeFlyout === 'settings' && (
        <div className="absolute right-14 top-0 w-80 sm:w-96 p-4 bg-stone-950/95 backdrop-blur-2xl border border-stone-800 rounded-2xl shadow-2xl text-xs space-y-3 z-40 max-h-[calc(100vh-11.5rem)] overflow-y-auto">
          <div className="flex items-center justify-between pb-2 border-b border-stone-800/80">
            <span className="font-cinzel text-amber-200 font-semibold tracking-wide">
              Landmass, Continents & States
            </span>
            <button
              onClick={() => setActiveFlyout(null)}
              className="text-stone-400 hover:text-white p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Template Select */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-stone-400 mb-1 text-[11px] font-medium">
                Landmass Template
              </label>
              <select
                value={draft.template}
                onChange={(e) => {
                  const nextTemplate = e.target.value as WorldTemplate;
                  const nextCount = nextTemplate === 'Continents' ? (draft.continentCount || 2) : 1;
                  const nextConfigs = buildSyncedContinentConfigs(
                    nextCount,
                    draft,
                    draft.continentConfigs,
                    continents
                  );
                  commitDraft({
                    ...draft,
                    template: nextTemplate,
                    continentCount: nextTemplate === 'Continents' ? nextCount : draft.continentCount,
                    continentConfigs: nextConfigs,
                  });
                }}
                className="w-full px-2 py-1.5 bg-stone-900 border border-stone-800 rounded-lg text-stone-200 text-xs focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                {templates.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-stone-400 mb-1 text-[11px] font-medium">
                Climate Template
              </label>
              <select
                value={draft.climateTemplate || 'Temperate Hearth'}
                onChange={(e) =>
                  commitDraft({
                    ...draft,
                    climateTemplate: e.target.value as ClimateTemplate,
                  })
                }
                className="w-full px-2 py-1.5 bg-stone-900 border border-stone-800 rounded-lg text-stone-200 text-xs focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                {climateTemplates.map((ct) => (
                  <option key={ct.id} value={ct.id}>
                    {ct.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Continent Count Slider (Visible when Continents template is selected) */}
          {draft.template === 'Continents' && (
            <div className="p-2.5 rounded-xl bg-stone-900/60 border border-stone-800/80 space-y-1.5">
              <div className="flex justify-between text-stone-300 text-[11px]">
                <span className="flex items-center gap-1.5 font-medium">
                  <Globe className="w-3.5 h-3.5 text-amber-400" />
                  <span>Number of Continents</span>
                </span>
                <span className="font-mono text-amber-300 font-bold">
                  {draft.continentCount || 2} Continents
                </span>
              </div>
              <input
                type="range"
                min={2}
                max={6}
                step={1}
                value={draft.continentCount || 2}
                onChange={(e) => {
                  const nextCount = clamp(parseInt(e.target.value, 10), 2, 6);
                  const nextConfigs = buildSyncedContinentConfigs(
                    nextCount,
                    draft,
                    draft.continentConfigs,
                    continents
                  );
                  setDraft({
                    ...draft,
                    continentCount: nextCount,
                    continentConfigs: nextConfigs,
                  });
                }}
                onMouseUp={() => commitDraft({ ...draft, continentConfigs: syncedContinentConfigs })}
                onTouchEnd={() => commitDraft({ ...draft, continentConfigs: syncedContinentConfigs })}
                className="w-full accent-amber-500 cursor-pointer h-1.5 bg-stone-800 rounded"
              />
              <div className="flex justify-between text-[10px] font-mono text-stone-400">
                {[2, 3, 4, 5, 6].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      const nextConfigs = buildSyncedContinentConfigs(
                        n,
                        draft,
                        draft.continentConfigs,
                        continents
                      );
                      commitDraft({
                        ...draft,
                        continentCount: n,
                        continentConfigs: nextConfigs,
                      });
                    }}
                    className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                      (draft.continentCount || 2) === n
                        ? 'bg-amber-600/30 text-amber-300 font-bold'
                        : 'hover:text-stone-300'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Climate & Sea Level Sliders */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="flex justify-between text-stone-400 mb-1 text-[10px]">
                <span className="flex items-center gap-1">
                  <Wind className="w-3 h-3 text-amber-400" />
                  <span>Wind</span>
                </span>
                <span className="font-mono text-stone-200">{draft.terrainSim.windAngleDeg}°</span>
              </div>
              <input
                type="range"
                min={0}
                max={360}
                step={15}
                value={draft.terrainSim.windAngleDeg}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    terrainSim: { ...draft.terrainSim, windAngleDeg: parseInt(e.target.value, 10) },
                  })
                }
                onMouseUp={() => commitDraft(draft)}
                onTouchEnd={() => commitDraft(draft)}
                className="w-full accent-amber-500 cursor-pointer h-1.5 bg-stone-800 rounded"
              />
            </div>

            <div>
              <div className="flex justify-between text-stone-400 mb-1 text-[10px]">
                <span className="flex items-center gap-1">
                  <CloudRain className="w-3 h-3 text-sky-400" />
                  <span>Rain</span>
                </span>
                <span className="font-mono text-stone-200">
                  {draft.terrainSim.raininess.toFixed(1)}x
                </span>
              </div>
              <input
                type="range"
                min={0.4}
                max={2.5}
                step={0.1}
                value={draft.terrainSim.raininess}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    terrainSim: { ...draft.terrainSim, raininess: parseFloat(e.target.value) },
                  })
                }
                onMouseUp={() => commitDraft(draft)}
                onTouchEnd={() => commitDraft(draft)}
                className="w-full accent-amber-500 cursor-pointer h-1.5 bg-stone-800 rounded"
              />
            </div>

            <div>
              <div className="flex justify-between text-stone-400 mb-1 text-[10px]">
                <span>Sea Level</span>
                <span className="font-mono text-stone-200">
                  {Math.round(draft.terrainSim.seaLevel * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.18}
                max={0.45}
                step={0.02}
                value={draft.terrainSim.seaLevel}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setDraft({
                    ...draft,
                    seaLevel: val,
                    terrainSim: { ...draft.terrainSim, seaLevel: val },
                  });
                }}
                onMouseUp={() => commitDraft(draft)}
                onTouchEnd={() => commitDraft(draft)}
                className="w-full accent-amber-500 cursor-pointer h-1.5 bg-stone-800 rounded"
              />
            </div>
          </div>

          {/* Feudal Hierarchy Controls (Global vs Continent-by-Continent) */}
          <div className="pt-2.5 border-t border-stone-800/80 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                <Crown className="w-3 h-3 text-amber-400" />
                <span>States, Duchies & Counties</span>
              </span>
              <span className="text-[10px] font-mono text-stone-400">
                {plannedSummary.states}S · {plannedSummary.duchies}D · {plannedSummary.counties}C
              </span>
            </div>

            {/* Mode Toggle: Global Uniform vs Continent-by-Continent */}
            <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-stone-900 border border-stone-800">
              <button
                type="button"
                onClick={() => commitDraft({ ...draft, perContinentMode: false })}
                className={`py-1 px-2 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                  !draft.perContinentMode
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                Global Uniform
              </button>
              <button
                type="button"
                onClick={() =>
                  commitDraft({
                    ...draft,
                    perContinentMode: true,
                    continentConfigs: syncedContinentConfigs,
                  })
                }
                className={`py-1 px-2 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                  draft.perContinentMode
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                By Continent ({activeContinentCount})
              </button>
            </div>

            {!draft.perContinentMode ? (
              <div className="space-y-2.5 p-2.5 rounded-xl bg-stone-900/50 border border-stone-800/80">
                <StepperNumber
                  label="Sovereign States / Realms"
                  value={draft.realmCount ?? 10}
                  min={1}
                  max={24}
                  onChange={(val) => setDraft({ ...draft, realmCount: val })}
                />
                <StepperNumber
                  label="Duchies per State"
                  value={draft.duchiesPerRealm ?? 2}
                  min={0}
                  max={8}
                  onChange={(val) => setDraft({ ...draft, duchiesPerRealm: val })}
                />
                <StepperNumber
                  label="Counties per State"
                  value={draft.countiesPerRealm ?? 10}
                  min={1}
                  max={32}
                  onChange={(val) => setDraft({ ...draft, countiesPerRealm: val })}
                  hint={`~${(draft.countiesPerRealm ?? 10) * 3} Landed Baronies & Fiefs per state`}
                />
                <button
                  type="button"
                  onClick={() => commitDraft(draft)}
                  className="w-full py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-amber-300 font-medium text-[11px] transition-colors cursor-pointer"
                >
                  Apply State & Feudal Counts
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] text-stone-400">
                  <span>Configure each continent independently (0 states = unclaimed)</span>
                  <button
                    type="button"
                    onClick={() => {
                      const synced = syncedContinentConfigs.map((cfg) => ({
                        ...cfg,
                        realmCount: clamp(
                          Math.max(1, Math.round((draft.realmCount ?? 10) / activeContinentCount)),
                          0,
                          12
                        ),
                        duchiesPerRealm: clamp(draft.duchiesPerRealm ?? 2, 0, 8),
                        countiesPerRealm: clamp(draft.countiesPerRealm ?? 10, 1, 32),
                      }));
                      commitDraft({
                        ...draft,
                        perContinentMode: true,
                        continentConfigs: synced,
                      });
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-amber-300 cursor-pointer shrink-0"
                    title="Sync all continents from Global defaults"
                  >
                    <Copy className="w-2.5 h-2.5" />
                    <span>Sync Global</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {syncedContinentConfigs.map((cfg, idx) => {
                    const detected = continents?.[idx];
                    const sharePct = detected
                      ? Math.round((detected.cellCount / totalDetectedCells) * 100)
                      : null;
                    return (
                      <div
                        key={cfg.id}
                        className="p-2.5 rounded-xl bg-stone-900/70 border border-stone-800 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-amber-200 text-[11px] truncate">
                            {idx + 1}. {detected?.name || cfg.name || defaultContinentLabel(idx, activeContinentCount)}
                          </span>
                          <span className="text-[10px] font-mono text-stone-400 shrink-0">
                            {sharePct !== null ? `${sharePct}% land` : `${cfg.realmCount} states`}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-white/[0.06]">
                          <div className="space-y-1">
                            <div className="text-[11px] text-stone-400">States</div>
                            <div className="flex items-center justify-between gap-0.5 bg-stone-950/60 rounded border border-stone-800 px-1 py-0.5">
                              <button
                                type="button"
                                onClick={() =>
                                  updateContinentConfig(idx, {
                                    realmCount: clamp(cfg.realmCount - 1, 0, 12),
                                  })
                                }
                                className="w-5 h-5 rounded hover:bg-stone-800 text-stone-300 font-mono text-xs cursor-pointer"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min={0}
                                max={12}
                                value={cfg.realmCount}
                                onChange={(e) => {
                                  const v = parseInt(e.target.value, 10);
                                  if (!Number.isNaN(v))
                                    updateContinentConfig(idx, { realmCount: clamp(v, 0, 12) });
                                }}
                                className="w-8 text-center bg-transparent font-mono text-amber-300 font-bold text-xs focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  updateContinentConfig(idx, {
                                    realmCount: clamp(cfg.realmCount + 1, 0, 12),
                                  })
                                }
                                className="w-5 h-5 rounded hover:bg-stone-800 text-stone-300 font-mono text-xs cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <div className="text-[11px] text-stone-400">Duchies</div>
                            <div className="flex items-center justify-between gap-0.5 bg-stone-950/60 rounded border border-stone-800 px-1 py-0.5">
                              <button
                                type="button"
                                onClick={() =>
                                  updateContinentConfig(idx, {
                                    duchiesPerRealm: clamp(cfg.duchiesPerRealm - 1, 0, 8),
                                  })
                                }
                                className="w-5 h-5 rounded hover:bg-stone-800 text-stone-300 font-mono text-xs cursor-pointer"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min={0}
                                max={8}
                                value={cfg.duchiesPerRealm}
                                onChange={(e) => {
                                  const v = parseInt(e.target.value, 10);
                                  if (!Number.isNaN(v))
                                    updateContinentConfig(idx, {
                                      duchiesPerRealm: clamp(v, 0, 8),
                                    });
                                }}
                                className="w-8 text-center bg-transparent font-mono text-amber-300 font-bold text-xs focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  updateContinentConfig(idx, {
                                    duchiesPerRealm: clamp(cfg.duchiesPerRealm + 1, 0, 8),
                                  })
                                }
                                className="w-5 h-5 rounded hover:bg-stone-800 text-stone-300 font-mono text-xs cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <div className="text-[11px] text-stone-400">Counties</div>
                            <div className="flex items-center justify-between gap-0.5 bg-stone-950/60 rounded border border-stone-800 px-1 py-0.5">
                              <button
                                type="button"
                                onClick={() =>
                                  updateContinentConfig(idx, {
                                    countiesPerRealm: clamp(cfg.countiesPerRealm - 1, 1, 32),
                                  })
                                }
                                className="w-5 h-5 rounded hover:bg-stone-800 text-stone-300 font-mono text-xs cursor-pointer"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min={1}
                                max={32}
                                value={cfg.countiesPerRealm}
                                onChange={(e) => {
                                  const v = parseInt(e.target.value, 10);
                                  if (!Number.isNaN(v))
                                    updateContinentConfig(idx, {
                                      countiesPerRealm: clamp(v, 1, 32),
                                    });
                                }}
                                className="w-8 text-center bg-transparent font-mono text-amber-300 font-bold text-xs focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  updateContinentConfig(idx, {
                                    countiesPerRealm: clamp(cfg.countiesPerRealm + 1, 1, 32),
                                  })
                                }
                                className="w-5 h-5 rounded hover:bg-stone-800 text-stone-300 font-mono text-xs cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>

                        {draft.template === 'Continents' && (
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <div>
                              <div className="flex justify-between text-[10px] text-stone-400 mb-0.5">
                                <span className="flex items-center gap-0.5">
                                  <Maximize2 className="w-2.5 h-2.5" />
                                  <span>Size</span>
                                </span>
                                <span className="font-mono tabular-nums text-stone-200">
                                  {Math.round((cfg.sizeScale ?? 1) * 100)}%
                                </span>
                              </div>
                              <input
                                type="range"
                                min={0.65}
                                max={1.45}
                                step={0.05}
                                value={cfg.sizeScale ?? 1}
                                onChange={(e) =>
                                  updateContinentConfig(idx, {
                                    sizeScale: parseFloat(e.target.value),
                                  })
                                }
                                className="w-full accent-amber-500 cursor-pointer h-1 bg-stone-800 rounded"
                              />
                            </div>
                            <div>
                              <div className="flex justify-between text-[10px] text-stone-400 mb-0.5">
                                <span className="flex items-center gap-0.5">
                                  <Mountain className="w-2.5 h-2.5" />
                                  <span>Relief</span>
                                </span>
                                <span className="font-mono text-stone-200">
                                  {Math.round((cfg.reliefBias ?? 1) * 100)}%
                                </span>
                              </div>
                              <input
                                type="range"
                                min={0.6}
                                max={1.5}
                                step={0.05}
                                value={cfg.reliefBias ?? 1}
                                onChange={(e) =>
                                  updateContinentConfig(idx, {
                                    reliefBias: parseFloat(e.target.value),
                                  })
                                }
                                className="w-full accent-amber-500 cursor-pointer h-1 bg-stone-800 rounded"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Seed Input & Regeneration Controls */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-stone-400 text-[11px] font-medium">World Seed</label>
              <button
                type="button"
                onClick={() => {
                  try {
                    navigator.clipboard.writeText(String(draft.seed || ''));
                  } catch {
                    // ignore clipboard fallback
                  }
                }}
                className="text-[10px] font-mono text-emerald-400 hover:text-emerald-300 cursor-pointer"
                title="Copy current seed to clipboard"
              >
                Copy Seed
              </button>
            </div>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={draft.seed}
                onChange={(e) => setDraft({ ...draft, seed: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && onRegenerateFromSeed) {
                    onRegenerateFromSeed(String(draft.seed || ''));
                    setActiveFlyout(null);
                  }
                }}
                placeholder="Enter or paste a world seed..."
                className="flex-1 px-2.5 py-1.5 bg-stone-900 border border-stone-800 rounded-lg font-mono text-stone-200 text-xs focus:outline-none focus:border-amber-500"
              />
              <button
                type="button"
                onClick={() => {
                  if (onRegenerateFromSeed) {
                    onRegenerateFromSeed(String(draft.seed || ''));
                    setActiveFlyout(null);
                  } else {
                    commitDraft({ ...draft });
                    setActiveFlyout(null);
                  }
                }}
                title="Regenerate World From This Exact Seed"
                className="px-2.5 py-1.5 bg-amber-600/80 hover:bg-amber-500 text-white rounded-lg text-[11px] font-semibold transition-colors cursor-pointer shrink-0"
              >
                Use Seed
              </button>
              <button
                type="button"
                onClick={onRegenerate}
                title="Generate New Random Seed"
                className="px-2.5 py-1.5 bg-stone-800 hover:bg-stone-700 text-amber-300 rounded-lg transition-colors cursor-pointer shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              commitDraft({
                ...draft,
                continentConfigs: draft.perContinentMode
                  ? syncedContinentConfigs
                  : draft.continentConfigs,
              });
              setActiveFlyout(null);
            }}
            className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg transition-colors text-center text-xs cursor-pointer mt-1"
          >
            Generate World
          </button>
        </div>
      )}

      {/* Flyout 3: Map Brush Studio */}
      {activeFlyout === 'brush' && onUpdateBrushConfig && (
        <div className="absolute right-14 top-0 w-80 sm:w-96 p-4 bg-stone-950/95 backdrop-blur-2xl border border-stone-800 rounded-2xl shadow-2xl text-xs space-y-3.5 z-40 max-h-[calc(100vh-11.5rem)] overflow-y-auto">
          <div className="flex items-center justify-between pb-2 border-b border-stone-800/80">
            <span className="font-cinzel text-amber-200 font-semibold tracking-wide flex items-center gap-1.5">
              <Paintbrush className="w-3.5 h-3.5 text-amber-400" />
              <span>Map Brush Studio</span>
            </span>
            <button
              type="button"
              onClick={() => {
                onUpdateBrushConfig({ brushMode: 'inspect' });
                setActiveFlyout(null);
              }}
              title="Close Brush Studio & Return to Normal Pointer"
              className="text-stone-400 hover:text-white p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Mode / History Action Bar */}
          <div className="grid grid-cols-4 gap-1.5">
            <button
              type="button"
              onClick={() => onUpdateBrushConfig({ brushMode: 'inspect' })}
              className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-[11px] font-medium transition-colors cursor-pointer border ${
                brushMode === 'inspect'
                  ? 'bg-amber-600 border-amber-500 text-white shadow-sm'
                  : 'bg-stone-900 border-stone-800 text-stone-300 hover:bg-stone-800'
              }`}
              title="Navigate & Select Map Entities (Esc)"
            >
              <MousePointer className="w-3 h-3" />
              <span>Navigate</span>
            </button>
            <button
              type="button"
              onClick={onUndoBrush}
              disabled={!canUndoBrush}
              className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-stone-900 border border-stone-800 text-stone-300 hover:bg-stone-800 hover:text-white disabled:opacity-35 text-[11px] font-medium cursor-pointer transition-colors"
              title="Undo Last Stroke (Ctrl+Z)"
            >
              <Undo2 className="w-3 h-3" />
              <span>Undo</span>
            </button>
            <button
              type="button"
              onClick={onRedoBrush}
              disabled={!canRedoBrush}
              className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-stone-900 border border-stone-800 text-stone-300 hover:bg-stone-800 hover:text-white disabled:opacity-35 text-[11px] font-medium cursor-pointer transition-colors"
              title="Redo Stroke (Ctrl+Y)"
            >
              <Redo2 className="w-3 h-3" />
              <span>Redo</span>
            </button>
            <button
              type="button"
              onClick={onResetBrushEdits}
              className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-stone-900 border border-stone-800 text-stone-300 hover:bg-stone-800 hover:text-amber-300 text-[11px] font-medium cursor-pointer transition-colors"
              title="Clear Manual Terrain & Climate Brush Edits"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>

          {/* 1. Terrain Sculpting */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
              Terrain Sculpting
            </div>
            <div className="grid grid-cols-5 gap-1">
              {(
                [
                  { id: 'mountain' as PaintBrushMode, label: 'Raise', icon: ArrowUp },
                  { id: 'valley' as PaintBrushMode, label: 'Lower', icon: ArrowDown },
                  { id: 'plateau' as PaintBrushMode, label: 'Plateau', icon: Minus },
                  { id: 'smooth' as PaintBrushMode, label: 'Smooth', icon: Mountain },
                  { id: 'ocean' as PaintBrushMode, label: 'Ocean', icon: Waves },
                ] as const
              ).map((tool) => {
                const Icon = tool.icon;
                const active = brushMode === tool.id;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => onUpdateBrushConfig({ brushMode: active ? 'inspect' : tool.id })}
                    className={`flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg border text-[10px] font-medium transition-colors cursor-pointer ${
                      active
                        ? 'bg-amber-600/25 border-amber-500 text-amber-200'
                        : 'bg-stone-900/70 border-stone-800 text-stone-400 hover:text-stone-100 hover:bg-stone-800'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tool.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Reliefs & Biomes */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
              Reliefs, Trees &amp; Biomes
            </div>
            <div className="grid grid-cols-4 gap-1">
              {(
                [
                  { id: 'hill' as PaintBrushMode, label: 'Hill', icon: Mountain },
                  { id: 'forest' as PaintBrushMode, label: 'Forest', icon: Trees },
                  { id: 'tree' as PaintBrushMode, label: 'Tree', icon: Trees },
                  { id: 'swamp' as PaintBrushMode, label: 'Wetland', icon: Droplets },
                  { id: 'desert' as PaintBrushMode, label: 'Desert', icon: Sun },
                  { id: 'snow' as PaintBrushMode, label: 'Snow', icon: Snowflake },
                  { id: 'clear_relief' as PaintBrushMode, label: 'Clear Art', icon: Eraser },
                  { id: 'clear_biome' as PaintBrushMode, label: 'Natural', icon: RotateCcw },
                ] as const
              ).map((tool) => {
                const Icon = tool.icon;
                const active = brushMode === tool.id;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => onUpdateBrushConfig({ brushMode: active ? 'inspect' : tool.id })}
                    className={`flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg border text-[10px] font-medium transition-colors cursor-pointer ${
                      active
                        ? 'bg-amber-600/25 border-amber-500 text-amber-200'
                        : 'bg-stone-900/70 border-stone-800 text-stone-400 hover:text-stone-100 hover:bg-stone-800'
                    }`}
                  >
                    {tool.id === 'forest' ? (
                      <img
                        src={getForestBrushPreviewUrl()}
                        alt="Forest"
                        className="w-4 h-4 object-contain"
                      />
                    ) : (
                      <Icon className="w-3.5 h-3.5" />
                    )}
                    <span className="truncate">{tool.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Borders & Territories */}
          <div className="space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
              Borders &amp; Territories
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() =>
                  onUpdateBrushConfig({
                    brushMode: brushMode === 'realm' ? 'inspect' : 'realm',
                    targetRealmId,
                  })
                }
                className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg border text-[10px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  brushMode === 'realm'
                    ? 'bg-amber-600/25 border-amber-500 text-amber-200'
                    : 'bg-stone-900/70 border-stone-800 text-stone-300 hover:bg-stone-800'
                }`}
              >
                <Crown className="w-3 h-3 text-amber-400 shrink-0" />
                <span>Interstate</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  onUpdateBrushConfig({
                    brushMode: brushMode === 'duchy' ? 'inspect' : 'duchy',
                    targetDuchyId,
                  })
                }
                className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg border text-[10px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  brushMode === 'duchy'
                    ? 'bg-amber-600/25 border-amber-500 text-amber-200'
                    : 'bg-stone-900/70 border-stone-800 text-stone-300 hover:bg-stone-800'
                }`}
              >
                <Shield className="w-3 h-3 text-amber-300 shrink-0" />
                <span>Inter-Duchy</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  onUpdateBrushConfig({
                    brushMode: brushMode === 'county' ? 'inspect' : 'county',
                    targetCountyId,
                  })
                }
                className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg border text-[10px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  brushMode === 'county'
                    ? 'bg-amber-600/25 border-amber-500 text-amber-200'
                    : 'bg-stone-900/70 border-stone-800 text-stone-300 hover:bg-stone-800'
                }`}
              >
                <Shield className="w-3 h-3 text-purple-400 shrink-0" />
                <span>County</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() =>
                  onUpdateBrushConfig({
                    brushMode: brushMode === 'draw_border' ? 'inspect' : 'draw_border',
                    targetBorderKind,
                  })
                }
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border text-[10px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  brushMode === 'draw_border'
                    ? 'bg-rose-600/25 border-rose-500 text-rose-200'
                    : 'bg-stone-900/70 border-stone-800 text-stone-300 hover:bg-stone-800'
                }`}
              >
                <PenTool className="w-3 h-3 text-rose-400 shrink-0" />
                <span>Border Style Pen</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  onUpdateBrushConfig({
                    brushMode: brushMode === 'clear_border' ? 'inspect' : 'clear_border',
                  })
                }
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border text-[10px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  brushMode === 'clear_border'
                    ? 'bg-rose-600/25 border-rose-500 text-rose-200'
                    : 'bg-stone-900/70 border-stone-800 text-stone-300 hover:bg-stone-800'
                }`}
              >
                <Eraser className="w-3 h-3 text-rose-300 shrink-0" />
                <span>Erase Border</span>
              </button>
            </div>

            {brushMode === 'realm' && (
              <div>
                <label className="block text-stone-400 mb-1 text-[10px] font-medium">
                  Active Kingdom Target
                </label>
                <select
                  value={targetRealmId}
                  onChange={(e) =>
                    onUpdateBrushConfig({ brushMode: 'realm', targetRealmId: e.target.value })
                  }
                  className="w-full px-2.5 py-1.5 bg-stone-900 border border-stone-800 rounded-lg text-stone-200 text-xs focus:outline-none focus:border-amber-500 cursor-pointer"
                >
                  {realms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                  <option value="__unclaimed__">Unclaimed Wilderness</option>
                </select>
              </div>
            )}

            {brushMode === 'duchy' && duchyCounties.length > 0 && (
              <div>
                <label className="block text-stone-400 mb-1 text-[10px] font-medium">
                  Active Duchy Target
                </label>
                <select
                  value={targetDuchyId}
                  onChange={(e) =>
                    onUpdateBrushConfig({ brushMode: 'duchy', targetDuchyId: e.target.value })
                  }
                  className="w-full px-2.5 py-1.5 bg-stone-900 border border-stone-800 rounded-lg text-stone-200 text-xs focus:outline-none focus:border-amber-500 cursor-pointer"
                >
                  {duchyCounties.map((d) => {
                    const r = realms.find((rm) => rm.id === d.realmId);
                    return (
                      <option key={d.id} value={d.duchyId || d.id}>
                        {d.duchyName || d.name} {r ? `(${r.name})` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {brushMode === 'county' && (
              <div>
                <label className="block text-stone-400 mb-1 text-[10px] font-medium">
                  Active County Target
                </label>
                <select
                  value={targetCountyId}
                  onChange={(e) =>
                    onUpdateBrushConfig({ brushMode: 'county', targetCountyId: e.target.value })
                  }
                  className="w-full px-2.5 py-1.5 bg-stone-900 border border-stone-800 rounded-lg text-stone-200 text-xs focus:outline-none focus:border-amber-500 cursor-pointer"
                >
                  {counties.map((c) => {
                    const r = realms.find((rm) => rm.id === c.realmId);
                    return (
                      <option key={c.id} value={c.id}>
                        {c.name} {r ? `(${r.name})` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {brushMode === 'draw_border' && (
              <div>
                <label className="block text-stone-400 mb-1 text-[10px] font-medium">
                  Border Classification
                </label>
                <select
                  value={targetBorderKind}
                  onChange={(e) =>
                    onUpdateBrushConfig({
                      brushMode: 'draw_border',
                      targetBorderKind: e.target.value as BorderKind,
                    })
                  }
                  className="w-full px-2.5 py-1.5 bg-stone-900 border border-stone-800 rounded-lg text-rose-200 text-xs focus:outline-none focus:border-rose-500 cursor-pointer"
                >
                  <option value="interstate">Interstate Frontier (Sovereign)</option>
                  <option value="inter_duchy">Inter-Duchy Boundary</option>
                  <option value="county">County Line</option>
                  <option value="barony">Barony / Estate Divide</option>
                  <option value="march">Fortified March Border</option>
                  <option value="disputed">Disputed Claim Frontier</option>
                  <option value="ecclesiastical">Ecclesiastical See Boundary</option>
                </select>
              </div>
            )}
          </div>

          {onRegenerateRoutes && (
            <div className="pt-2 border-t border-stone-800/80 space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                Trade &amp; Sea Route Generator
              </div>
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() => onRegenerateRoutes('all')}
                  className="flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-800 text-[10px] text-amber-200 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Navigation className="w-3 h-3 shrink-0" />
                  <span>Gen All</span>
                </button>
                <button
                  type="button"
                  onClick={() => onRegenerateRoutes('overland')}
                  className="flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-800 text-[10px] text-stone-200 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Navigation className="w-3 h-3 shrink-0" />
                  <span>Overland</span>
                </button>
                <button
                  type="button"
                  onClick={() => onRegenerateRoutes('maritime')}
                  className="flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-800 text-[10px] text-sky-300 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Anchor className="w-3 h-3 shrink-0" />
                  <span>Maritime</span>
                </button>
              </div>
            </div>
          )}

          {/* 4. Brush Geometry */}
          <div className="pt-2 border-t border-stone-800/80 space-y-2.5">
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-stone-300">
                <span>Brush Size</span>
                <span className="font-mono text-amber-300 font-bold tabular-nums">
                  {brushSize}px
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={120}
                step={2}
                value={brushSize}
                onChange={(e) =>
                  onUpdateBrushConfig({ brushSize: parseInt(e.target.value, 10) })
                }
                className="w-full accent-amber-500 cursor-pointer h-1.5 bg-stone-800 rounded"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-stone-300">
                <span>Strength</span>
                <span className="font-mono text-amber-300 font-bold tabular-nums">
                  {Math.round(brushStrength * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1.0}
                step={0.05}
                value={brushStrength}
                onChange={(e) =>
                  onUpdateBrushConfig({ brushStrength: parseFloat(e.target.value) })
                }
                className="w-full accent-amber-500 cursor-pointer h-1.5 bg-stone-800 rounded"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] text-stone-300 mb-1">
                <span>Falloff Profile</span>
              </div>
              <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-stone-900 border border-stone-800">
                {(['soft', 'medium', 'hard'] as BrushFalloff[]).map((shape) => (
                  <button
                    key={shape}
                    type="button"
                    onClick={() => onUpdateBrushConfig({ brushFalloff: shape })}
                    className={`py-1 rounded-md text-[11px] font-medium capitalize transition-colors cursor-pointer ${
                      brushFalloff === shape
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    {shape}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 5. Rebuild World on Sculpted Terrain */}
          {onReseedFromTerrain && (
            <div className="pt-2.5 border-t border-stone-800/80 space-y-2">
              {!confirmReseed ? (
                <button
                  type="button"
                  onClick={() => setConfirmReseed(true)}
                  className="w-full py-2 px-3 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-700 hover:border-amber-500/60 text-amber-300 font-medium text-[11px] transition-colors cursor-pointer"
                >
                  Rebuild Kingdoms & Cities on Terrain
                </button>
              ) : (
                <div className="p-2.5 rounded-xl bg-stone-900 border border-amber-500/50 space-y-2">
                  <p className="text-[11px] text-stone-300 leading-snug">
                    Keep your sculpted terrain and climate while generating fresh realms, cities, and trade routes onto the new geography?
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmReseed(false);
                        onReseedFromTerrain();
                      }}
                      className="py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium text-[11px] cursor-pointer"
                    >
                      Confirm Rebuild
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmReseed(false)}
                      className="py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 font-medium text-[11px] cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              <p className="text-[10px] text-stone-500 leading-snug">
                Hold Space or Right-drag to pan while painting. Press [ or ] to resize, Ctrl+Z to undo.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

