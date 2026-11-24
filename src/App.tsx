import React, { useState, useEffect, useMemo, useCallback, useRef, Component, ErrorInfo, ReactNode } from 'react';
import {
  Crown,
  Shield,
  Castle,
  MapPin,
  Users,
  History,
  Play,
  Coins,
  Swords,
  AlertTriangle,
  RefreshCw,
  Compass,
  Crosshair,
  BookOpen,
  Search,
  Mountain,
  Feather,
  Save,
  X,
  Image as ImageIcon,
  Package,
  Hammer,
  RotateCcw,
  ChevronDown,
} from 'lucide-react';
import { isElectronDesktop } from './utils/runtimeEnv';
import {
  WorldState,
  Burg,
  Character,
  Realm,
  County,
  HistoricalEvent,
  TradeRoute,
  TraderCaravan,
  Army,
  Season,
  WeatherEvent,
  TerrainSimConfig,
  CartographyStyle,
  WorldTemplate,
  Point2D,
  MapPin as WorldMapPin,
  BorderKind,
  RouteClassification,
} from './types/world';
import {
  computeSeasonalState,
  generateSeasonalWeather,
  generateSpontaneousAnomaly,
  recordWeatherAndTriggerDrift,
} from './engine/weatherSimulation';
import {
  generateWorld,
  paintOnWorld,
  captureBrushSnapshot,
  restoreBrushSnapshot,
  resetAllBrushEdits,
  resynthesizeWorldFromSculptedTerrain,
  autoPopulateCurrentTerrain,
  placeCustomBurg,
  addCustomRiver,
  renameCustomRiver,
  deleteCustomRiver,
  upsertMapPin,
  deleteMapPin,
  BrushSnapshot,
} from './engine/worldGenerator';
import { advanceTimeline, advanceTimelineMonths } from './engine/timelineSimulation';
import { ArmyCommandEngine } from './engine/v17GrandStrategyEngine';
import { getArmyPositionAtProgress } from './engine/armyPathfinding';
import type { SelectionFocus } from './engine/territorySelection';
import { cloneWorldState } from './utils/cloneWorldState';
import { MapCanvas, MapCanvasHandle, MapLayer } from './components/MapCanvas';
import { FloatingToolbar } from './components/FloatingToolbar';
import { CourtDossier } from './components/CourtDossier';
import { AdaptivePanel } from './components/AdaptivePanel';
import { FeudalDomainPanel } from './components/FeudalDomainPanel';
import { FlowEconomyPanels } from './components/FlowEconomyPanels';
import { V17GrandStrategyPanels } from './components/V17GrandStrategyPanels';
import { TimelineBar } from './components/TimelineBar';
import { CommandPalette } from './components/CommandPalette';
import { CompendiumModal } from './components/CompendiumModal';
import { SaveLoadModal } from './components/SaveLoadModal';
import { HouseDynastyModal } from './components/HouseDynastyModal';
import { ChroniclesView } from './components/ChroniclesView';
import { SagaWeaver, GeneratedSagaPayload } from './components/SagaWeaver';
import { MapExportModal } from './components/builder/MapExportModal';
import { ModManagerModal } from './components/modding/ModManagerModal';
import { serializeWorldArchive, parseWorldArchive } from './engine/storageManager';
import { reconcileFeudalHierarchy, recalculateFeudalDemesne } from './engine/feudalEngine';
import { ensureEconomy } from './engine/economyEngine';
import { seedVanillaModRegistries } from './engine/modSystem/vanillaBootstrap';
import { loadInstalledMods, applyAndValidateMods } from './engine/modSystem/modLoader';
import { registerCustomStampBrushes, preloadAllAtlasBrushes } from './engine/reliefAtlas';
import {
  resolvePlayerRealm,
  upsertLoreEntity,
  deleteLoreEntity,
  updateRealm,
  updateCounty,
  updateBurg,
  updateHouse,
  updateCharacter,
  renameMapPin,
  addCustomBorderEdge,
  deleteCustomBorderEdge,
  clearAllCustomBorders,
  addCustomTradeRoute,
  deleteTradeRoute,
  regenerateWorldTradeRoutes,
} from './engine/worldEditor';
import { HeraldryStudioModal, HeraldryEditTarget } from './components/builder/HeraldryStudioModal';
import { NewWorldModal } from './components/builder/NewWorldModal';
import { BuilderPalette } from './components/builder/BuilderPalette';
import { RoyalBudgetModal } from './components/RoyalBudgetModal';
import { ChronicleEventModal } from './components/ChronicleEventModal';

// Seed Vanilla Core registries before initial world generation runs
seedVanillaModRegistries();

const ALLOWED_TEMPLATES: WorldTemplate[] = [
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

function computeWeatherEconomyMod(weather: WeatherEvent): NonNullable<WorldState['activeWeatherMod']> {
  switch (weather.type) {
    case 'Sea Pack Ice':
      return {
        harvestMult: 0.72,
        livestockMult: 0.78,
        tradeFlowMult: 0.65,
        summary: 'Pack ice seals harbors and curbs coastal supply.',
      };
    case 'Alpine Whiteout':
      return {
        harvestMult: 0.65,
        livestockMult: 0.72,
        tradeFlowMult: 0.58,
        summary: 'Sub-zero tempests freeze fields and stall mountain passes.',
      };
    case 'Heavy Blizzard':
      return {
        harvestMult: 0.75,
        livestockMult: 0.80,
        tradeFlowMult: 0.68,
        summary: 'Deep snowdrifts block high roads and strain winter stores.',
      };
    case 'Scorching Heatwave':
      return {
        harvestMult: 0.68,
        livestockMult: 0.74,
        tradeFlowMult: 0.86,
        summary: 'Solstice drought parches grainfields and pastures.',
      };
    case 'Spring Thaw & Deluge':
      return {
        harvestMult: 1.08,
        livestockMult: 1.02,
        tradeFlowMult: 1.12,
        summary: 'Alluvial snowmelt enriches plains and speeds river barges.',
      };
    case 'Autumn Gale & Tempest':
      return {
        harvestMult: 0.92,
        livestockMult: 0.95,
        tradeFlowMult: 0.82,
        summary: 'Equinoctial gales buffet sea lanes and slow coastal convoys.',
      };
    default:
      return {
        harvestMult: 1.12,
        livestockMult: 1.08,
        tradeFlowMult: 1.14,
        summary: 'Clear seasonal skies sustain bountiful harvests and brisk trade.',
      };
  }
}

// ============================================================================
// 1. REACT ERROR BOUNDARY COMPONENT
// ============================================================================

interface ErrorBoundaryProps {
  children: ReactNode;
  onResume?: () => void;
  onReloadSameSeed?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('RealmSmith Uncaught Exception:', error, errorInfo);
  }

  handleResume = () => {
    this.setState({ hasError: false, error: undefined });
    if (this.props.onResume) this.props.onResume();
  };

  handleReloadSameSeed = () => {
    this.setState({ hasError: false, error: undefined });
    if (this.props.onReloadSameSeed) this.props.onReloadSameSeed();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center bg-stone-950 p-6 text-stone-100">
          <div className="max-w-md rounded-2xl border border-red-900/60 bg-stone-900/95 p-8 text-center shadow-2xl backdrop-blur-xl">
            <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-amber-500" />
            <h2 className="mb-2 font-serif text-2xl font-bold tracking-wide text-amber-400">
              Simulation Paused
            </h2>
            <p className="mb-6 text-sm leading-relaxed text-stone-400">
              A temporal anomaly interrupted the simulation. Your current map and seed are preserved:
            </p>
            <div className="mb-6 max-h-32 overflow-y-auto rounded-lg bg-black/60 p-3 text-left font-mono text-xs text-red-400 border border-red-950">
              {this.state.error?.message || 'Unknown runtime exception'}
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
              <button
                onClick={this.handleResume}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 font-medium text-white shadow-lg transition-all hover:bg-amber-500 active:scale-95 cursor-pointer"
              >
                <Play className="h-4 w-4" />
                Resume Current Map
              </button>
              <button
                onClick={this.handleReloadSameSeed}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-stone-800 border border-stone-700 px-5 py-2.5 font-medium text-stone-200 transition-all hover:bg-stone-700 cursor-pointer"
              >
                <RefreshCw className="h-4 w-4" />
                Reload Same Seed
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const DEFAULT_SETTINGS = {
  seed: 'realmsmith-v17-genesis',
  year: 1042,
  eraName: 'The Era of Partitioned Crowns',
  loreTheme: 'gritty-medieval' as const,
  template: 'Continents' as const,
  climateTemplate: 'Temperate Hearth' as const,
  realmCount: 10,
  duchiesPerRealm: 2,
  countiesPerRealm: 10,
  continentCount: 2,
  perContinentMode: false,
  cultureCount: 4,
  seaLevel: 0.28,
  terrainSim: {
    windAngleDeg: 45,
    raininess: 0.65,
    seaLevel: 0.28,
    minRiverFlow: 7.5,
    brushMode: 'inspect' as const,
    brushSize: 40,
    brushStrength: 0.5,
    brushFalloff: 'medium' as const,
  },
};

// ============================================================================
// 2. MAIN APPLICATION COMPONENT
// ============================================================================

function createFreshWorldSeed(): string {
  const prefixes = ['aethel', 'valen', 'korv', 'solis', 'drak', 'myr', 'calen', 'ost', 'vorn', 'thal'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const randPart = Math.random().toString(36).slice(2, 6);
  const timePart = Date.now().toString(36).slice(-4);
  return `${prefix}-${timePart}-${randPart}`;
}

export default function App() {
  const [world, setWorld] = useState<WorldState>(() => {
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const urlSeed = params?.get('seed')?.trim();
    const urlTemplateRaw = params?.get('template')?.trim();
    const urlTemplate = ALLOWED_TEMPLATES.includes(urlTemplateRaw as WorldTemplate)
      ? (urlTemplateRaw as WorldTemplate)
      : undefined;
    return generateWorld({
      ...DEFAULT_SETTINGS,
      seed: urlSeed || createFreshWorldSeed(),
      ...(urlTemplate ? { template: urlTemplate } : {}),
    } as any);
  });
  const worldRef = useRef(world);
  worldRef.current = world;
  const mapCanvasRef = useRef<MapCanvasHandle | null>(null);

  const [brushUndoStack, setBrushUndoStack] = useState<BrushSnapshot[]>([]);
  const [brushRedoStack, setBrushRedoStack] = useState<BrushSnapshot[]>([]);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  
  // Navigation tabs updated with 'houses' and 'sagas'
  const [activeTab, setActiveTab] = useState<
    'overview' | 'houses' | 'court' | 'feudal' | 'economy' | 'v17' | 'sagas' | 'chronicles'
  >('overview');

  const [selectedBurgId, setSelectedBurgId] = useState<string | null>(null);
  const [circledBurgId, setCircledBurgId] = useState<string | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [selectedRealmId, setSelectedRealmId] = useState<string | null>(null);
  const [selectedArmyId, setSelectedArmyId] = useState<string | null>(null);

  const [seasonPhase, setSeasonPhase] = useState<number>(0);
  const [selectedCountyId, setSelectedCountyId] = useState<string | null>(null);
  const [selectionFocus, setSelectionFocus] = useState<SelectionFocus>('realm');
  const [mapStyle, setMapStyle] = useState<CartographyStyle>('atlas');
  const [isInspectorOpen, setIsInspectorOpen] = useState<boolean>(true);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const statusBannerTimerRef = useRef<number | null>(null);

  const showStatusBanner = useCallback((msg: string) => {
    setStatusBanner(msg);
    if (statusBannerTimerRef.current !== null) {
      window.clearTimeout(statusBannerTimerRef.current);
    }
    statusBannerTimerRef.current = window.setTimeout(() => {
      setStatusBanner(null);
    }, 3600);
  }, []);

  // Global Modals State
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [isCompendiumOpen, setIsCompendiumOpen] = useState<boolean>(false);
  const [isSaveLoadOpen, setIsSaveLoadOpen] = useState<boolean>(false);
  const [isMapExportOpen, setIsMapExportOpen] = useState<boolean>(false);
  const [isModManagerOpen, setIsModManagerOpen] = useState<boolean>(false);
  const [isNewWorldModalOpen, setIsNewWorldModalOpen] = useState<boolean>(false);
  const [isRoyalBudgetOpen, setIsRoyalBudgetOpen] = useState<boolean>(false);
  const [isCourtEventModalOpen, setIsCourtEventModalOpen] = useState<boolean>(false);
  const [acknowledgedBankruptcyKey, setAcknowledgedBankruptcyKey] = useState<string | null>(null);
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState<boolean>(false);
  const [sandboxBrushUnlocked, setSandboxBrushUnlocked] = useState<boolean>(false);
  const [heraldryTarget, setHeraldryTarget] = useState<HeraldryEditTarget | null>(null);

  // World Builder Placement Drafts (River Pen, Route Pen, Border Pen, Settlement Stamp, Map Pins)
  const [draftRiverPoints, setDraftRiverPoints] = useState<Point2D[]>([]);
  const [riverNameDraft, setRiverNameDraft] = useState<string>('');
  const [riverWidthScale, setRiverWidthScale] = useState<number>(1.2);
  const [draftRoutePoints, setDraftRoutePoints] = useState<Point2D[]>([]);
  const [routeCategory, setRouteCategory] = useState<RouteClassification>('Merchant Road');
  const [routeUsePathfinding, setRouteUsePathfinding] = useState<boolean>(true);
  const [routeSnapToBurgs, setRouteSnapToBurgs] = useState<boolean>(true);
  const [draftBorderPoints, setDraftBorderPoints] = useState<Point2D[]>([]);
  const [borderDrawMode, setBorderDrawMode] = useState<'brush' | 'polyline'>('brush');
  const [stampBurgType, setStampBurgType] = useState<Burg['type']>('Market Town');
  const [stampBurgName, setStampBurgName] = useState<string>('');
  const [stampBurgRealmId, setStampBurgRealmId] = useState<string>('');
  const [pinLabelDraft, setPinLabelDraft] = useState<string>('Ancient Landmark');
  const [pinCategoryDraft, setPinCategoryDraft] = useState<WorldMapPin['category']>('Marker');
  const [pinNotesDraft, setPinNotesDraft] = useState<string>('');

  // Startup Mod & Custom PNG Stamp Pack Loader
  useEffect(() => {
    let active = true;
    void loadInstalledMods().then((loadedMods) => {
      if (!active) return;
      const report = applyAndValidateMods(loadedMods);
      if (report.loadedModIds.length > 0) {
        showStatusBanner(
          `Loaded ${report.loadedModIds.length} mod pack${report.loadedModIds.length > 1 ? 's' : ''} (${report.appliedCount} patches).`
        );
      }
    });
    if (typeof window !== 'undefined' && window.desktopAPI?.mods?.stamps) {
      void window.desktopAPI.mods.stamps().then((stampsByCategory) => {
        if (!active || !stampsByCategory) return;
        const added = registerCustomStampBrushes(stampsByCategory);
        if (added > 0) {
          preloadAllAtlasBrushes();
          setWorld((prev) => ({ ...prev, paintRevision: (prev.paintRevision || 0) + 1 }));
        }
      });
    }
    return () => {
      active = false;
    };
  }, [showStatusBanner]);
  const [isHouseModalOpen, setIsHouseModalOpen] = useState<boolean>(false);
  const [selectedHouseModalName, setSelectedHouseModalName] = useState<string | null>(null);

  const handleOpenHouse = useCallback((houseName: string) => {
    const clean = houseName.replace(/^House\s+/i, '').trim();
    if (!clean) return;
    setSelectedHouseModalName(clean);
    setIsHouseModalOpen(false);
    setActiveTab('houses');
  }, []);
  const [compendiumEntityId, setCompendiumEntityId] = useState<string | null>(null);

  const [activeLayers, setActiveLayers] = useState<Record<MapLayer, boolean>>({
    political: true,
    feudal: true,
    heightmap: false,
    biomes: true,
    rainfall: false,
    wind: false,
    burgs: true,
    rivers: true,
    relief: false,
    reliefMountains: false,
    reliefHills: false,
    reliefForests: false,
    reliefTrees: false,
    reliefSwamps: false,
    contours: false,
    textures: true,
    routes: true,
    caravans: true,
    density: false,
    weather: true,
    provinces: false,
    epidemics: true,
    banners: false,
    devastation: false,
  });

  const handleUpdateBrushConfig = useCallback((patch: Partial<TerrainSimConfig>) => {
    const brushToReliefLayer: Partial<Record<string, MapLayer>> = {
      mountain: 'reliefMountains',
      hill: 'reliefHills',
      forest: 'reliefForests',
      tree: 'reliefTrees',
      swamp: 'reliefSwamps',
    };
    const matchedReliefLayer = patch.brushMode ? brushToReliefLayer[patch.brushMode] : undefined;
    if (matchedReliefLayer) {
      setActiveLayers((prev) => ({
        ...prev,
        relief: true,
        [matchedReliefLayer]: true,
      }));
    }
    setWorld((prev) => {
      const nextTerrainSim: TerrainSimConfig = {
        ...prev.settings.terrainSim,
        ...patch,
      };
      if (nextTerrainSim.brushMode === 'realm' && !nextTerrainSim.targetRealmId) {
        nextTerrainSim.targetRealmId = prev.realms[0]?.id || '__unclaimed__';
      }
      if (nextTerrainSim.brushMode === 'duchy' && !nextTerrainSim.targetDuchyId) {
        const firstDuchy =
          prev.counties.find((c) => c.tier === 'Duchy' || c.name.includes('Duchy') || c.duchyId) ||
          prev.counties[0];
        nextTerrainSim.targetDuchyId = firstDuchy ? firstDuchy.duchyId || firstDuchy.id : '';
      }
      if (nextTerrainSim.brushMode === 'county' && !nextTerrainSim.targetCountyId) {
        nextTerrainSim.targetCountyId = prev.counties[0]?.id || '';
      }
      if (nextTerrainSim.brushMode === 'draw_border' && !nextTerrainSim.targetBorderKind) {
        nextTerrainSim.targetBorderKind = 'inter_duchy';
      }
      return {
        ...prev,
        settings: {
          ...prev.settings,
          terrainSim: nextTerrainSim,
        },
      };
    });
  }, []);

  const handleBrushStrokeStart = useCallback(() => {
    const snap = captureBrushSnapshot(worldRef.current);
    if (snap) {
      setBrushUndoStack((prev) => [...prev.slice(-24), snap]);
      setBrushRedoStack([]);
    }
  }, []);

  const handlePaintAtWorld = useCallback((worldX: number, worldY: number) => {
    setWorld((prev) => {
      const cfg = prev.settings.terrainSim;
      const targetRealmId =
        cfg.targetRealmId === '__unclaimed__' ||
        prev.realms.some((r) => r.id === cfg.targetRealmId)
          ? cfg.targetRealmId
          : prev.realms[0]?.id || '__unclaimed__';
      const firstDuchy =
        prev.counties.find((c) => c.tier === 'Duchy' || c.name.includes('Duchy') || c.duchyId) ||
        prev.counties[0];
      const targetDuchyId = prev.counties.some(
        (c) => c.duchyId === cfg.targetDuchyId || c.id === cfg.targetDuchyId
      )
        ? cfg.targetDuchyId
        : firstDuchy
        ? firstDuchy.duchyId || firstDuchy.id
        : '';
      const targetCountyId = prev.counties.some((c) => c.id === cfg.targetCountyId)
        ? cfg.targetCountyId
        : prev.counties[0]?.id || '';
      const targetBorderKind = cfg.targetBorderKind || 'inter_duchy';
      return paintOnWorld(
        prev,
        worldX,
        worldY,
        cfg.brushSize,
        cfg.brushStrength,
        cfg.brushMode,
        {
          falloff: cfg.brushFalloff || 'medium',
          targetRealmId,
          targetDuchyId,
          targetCountyId,
          targetBorderKind,
        }
      );
    });
  }, []);

  const handleRegenerateRoutes = useCallback(
    (scope: 'all' | 'overland' | 'maritime') => {
      setWorld((prev) => regenerateWorldTradeRoutes(prev, scope, true));
      const label =
        scope === 'maritime'
          ? 'maritime sea lanes'
          : scope === 'overland'
          ? 'overland roads & highways'
          : 'overland & maritime trade routes';
      showStatusBanner(`Generated ${label} (custom routes preserved).`);
    },
    [showStatusBanner]
  );

  const handleFinishDraftRoute = useCallback(() => {
    if (draftRoutePoints.length < 2) return;
    setWorld((prev) =>
      addCustomTradeRoute(prev, draftRoutePoints, routeCategory, {
        snapToBurgs: routeSnapToBurgs,
        usePathfinding: routeUsePathfinding,
      })
    );
    setDraftRoutePoints([]);
    showStatusBanner(`Created ${routeCategory} on atlas.`);
  }, [draftRoutePoints, routeCategory, routeSnapToBurgs, routeUsePathfinding, showStatusBanner]);

  const handleFinishDraftBorder = useCallback(() => {
    if (draftBorderPoints.length < 2) return;
    const kind = worldRef.current.settings.terrainSim?.targetBorderKind || 'inter_duchy';
    setWorld((prev) => addCustomBorderEdge(prev, kind, draftBorderPoints));
    setDraftBorderPoints([]);
    showStatusBanner(`Added custom ${kind.replace('_', '-')} frontier line.`);
  }, [draftBorderPoints, showStatusBanner]);

  const handleUndoBrush = useCallback(() => {
    setBrushUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const snap = prev[prev.length - 1];
      const currentSnap = captureBrushSnapshot(worldRef.current);
      if (currentSnap) {
        setBrushRedoStack((redoPrev) => [...redoPrev.slice(-24), currentSnap]);
      }
      setWorld((w) => restoreBrushSnapshot(w, snap));
      return prev.slice(0, -1);
    });
  }, []);

  const handleRedoBrush = useCallback(() => {
    setBrushRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const snap = prev[prev.length - 1];
      const currentSnap = captureBrushSnapshot(worldRef.current);
      if (currentSnap) {
        setBrushUndoStack((undoPrev) => [...undoPrev.slice(-24), currentSnap]);
      }
      setWorld((w) => restoreBrushSnapshot(w, snap));
      return prev.slice(0, -1);
    });
  }, []);

  const handleResetBrushEdits = useCallback(() => {
    const currentSnap = captureBrushSnapshot(worldRef.current);
    if (currentSnap) {
      setBrushUndoStack((prev) => [...prev.slice(-24), currentSnap]);
      setBrushRedoStack([]);
    }
    setWorld((w) => resetAllBrushEdits(w));
  }, []);

  const handleReseedFromTerrain = useCallback(() => {
    setWorld((w) => resynthesizeWorldFromSculptedTerrain(w));
    setSelectedBurgId(null);
    setSelectedCharacterId(null);
    setSelectedRealmId(null);
    setSelectedCountyId(null);
    setBrushUndoStack([]);
    setBrushRedoStack([]);
  }, []);

  // Global Keyboard Shortcuts: Cmd+K / Ctrl+K Spotlight Search, Ctrl+Z / Ctrl+Y Brush Undo/Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (['input', 'textarea', 'select'].includes(target.tagName.toLowerCase()) ||
          target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
        return;
      }

      if (isTyping) return;

      if (e.key === 'Escape' && selectedArmyId && worldRef.current.settings.terrainSim?.brushMode === 'inspect') {
        setSelectedArmyId(null);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          if (brushRedoStack.length > 0) {
            e.preventDefault();
            handleRedoBrush();
          }
        } else if (brushUndoStack.length > 0) {
          e.preventDefault();
          handleUndoBrush();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        if (brushRedoStack.length > 0) {
          e.preventDefault();
          handleRedoBrush();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [brushUndoStack.length, brushRedoStack.length, handleUndoBrush, handleRedoBrush, selectedArmyId]);

  const handleToggleLayer = (layer: MapLayer) => {
    const reliefSublayers: MapLayer[] = [
      'reliefMountains',
      'reliefHills',
      'reliefForests',
      'reliefTrees',
      'reliefSwamps',
    ];
    setActiveLayers((prev) => {
      if (layer === 'relief') {
        const nextVal = !prev.relief;
        return {
          ...prev,
          relief: nextVal,
          reliefMountains: nextVal,
          reliefHills: nextVal,
          reliefForests: nextVal,
          reliefTrees: nextVal,
          reliefSwamps: nextVal,
        };
      }
      const next = { ...prev, [layer]: !prev[layer] };
      if (reliefSublayers.includes(layer)) {
        next.relief = reliefSublayers.some((sub) => next[sub]);
      }
      return next;
    });
  };

  // Reset brush mode back to normal pointer if user leaves Atlas Map tab
  useEffect(() => {
    if (activeTab !== 'overview' && world.settings.terrainSim?.brushMode !== 'inspect') {
      handleUpdateBrushConfig({ brushMode: 'inspect' });
    }
  }, [activeTab, world.settings.terrainSim?.brushMode, handleUpdateBrushConfig]);

  // Ensure selectedCharacterId always tracks a living noble (auto-rebind on death/purge)
  useEffect(() => {
    if (selectedCharacterId && world.characters) {
      const existsLiving = world.characters.some((c) => c.id === selectedCharacterId && c.isAlive !== false);
      if (!existsLiving) {
        const successor =
          world.characters.find((c) => c.id === world.monarchId && c.isAlive !== false) ||
          world.characters.find((c) => c.isAlive !== false);
        setSelectedCharacterId(successor ? successor.id : null);
      }
    }
  }, [selectedCharacterId, world.characters, world.monarchId]);

  const handleSelectBurg = (
    burg: Burg,
    opts?: { preserveTerritory?: boolean; circleBurg?: boolean }
  ) => {
    const shouldCircle = opts?.circleBurg !== false;
    setSelectedBurgId(burg.id);
    setCircledBurgId(shouldCircle ? burg.id : null);
    setSelectedRealmId(burg.stateId);
    if (!opts?.preserveTerritory) {
      if (burg.countyId) setSelectedCountyId(burg.countyId);
      setSelectionFocus('burg');
    }
    const burgCounty = burg.countyId ? world.counties?.find((c) => c.id === burg.countyId) : undefined;
    const burgRealm = world.realms?.find((r) => r.id === burg.stateId);
    const ruler =
      world.characters?.find((c) => c.id === burg.ownerId && c.isAlive !== false) ||
      (burgCounty?.rulerId
        ? world.characters?.find((c) => c.id === burgCounty.rulerId && c.isAlive !== false)
        : undefined) ||
      (burgRealm?.rulerId
        ? world.characters?.find((c) => c.id === burgRealm.rulerId && c.isAlive !== false)
        : undefined);
    setSelectedCharacterId(ruler ? ruler.id : null);
    if (activeTab === 'sagas' || activeTab === 'chronicles' || activeTab === 'houses') setActiveTab('overview');
    setIsInspectorOpen(true);
  };

  const handleSelectRealm = (realm: Realm) => {
    setSelectedRealmId(realm.id);
    const crownDuchy =
      world.counties?.find(
        (c) => c.realmId === realm.id && (c.tier === 'Duchy' || c.name.includes('Duchy'))
      ) || world.counties?.find((c) => c.realmId === realm.id);
    const capitalBurg =
      world.burgs?.find((b) => b.stateId === realm.id && b.isCapital) ||
      world.burgs?.find((b) => b.stateId === realm.id);
    setSelectedCountyId(crownDuchy ? crownDuchy.id : null);
    setSelectedBurgId(capitalBurg ? capitalBurg.id : null);
    setCircledBurgId(null);
    const monarch = world.characters?.find((c) => c.id === realm.rulerId && c.isAlive !== false);
    setSelectedCharacterId(monarch ? monarch.id : null);
    setSelectionFocus('realm');
    if (activeTab === 'sagas' || activeTab === 'chronicles' || activeTab === 'houses') setActiveTab('overview');
    setIsInspectorOpen(true);
  };

  const handleSelectCounty = (county: County, focusOverride?: 'duchy' | 'county') => {
    setSelectedCountyId(county.id);
    setSelectedRealmId(county.realmId);
    setSelectedBurgId(null);
    setCircledBurgId(null);
    const realm = world.realms?.find((r) => r.id === county.realmId);
    const lord =
      world.characters?.find((c) => c.id === county.rulerId && c.isAlive !== false) ||
      (realm?.rulerId
        ? world.characters?.find((c) => c.id === realm.rulerId && c.isAlive !== false)
        : undefined);
    setSelectedCharacterId(lord ? lord.id : null);
    const resolvedFocus: SelectionFocus =
      focusOverride ||
      (county.tier === 'Duchy' || county.name.includes('Duchy') ? 'duchy' : 'county');
    setSelectionFocus(resolvedFocus);
    if (activeTab === 'sagas' || activeTab === 'chronicles' || activeTab === 'houses') setActiveTab('overview');
    setIsInspectorOpen(true);
  };

  const handleSelectCharacter = (char: Character) => {
    setSelectedCharacterId(char.id);
    setSelectedRealmId(char.realmId);
    const charCounty =
      (char.countyId ? world.counties?.find((c) => c.id === char.countyId) : undefined) ||
      world.counties?.find((c) => c.rulerId === char.id);
    const charBurg =
      world.burgs?.find((b) => b.ownerId === char.id) ||
      (charCounty ? world.burgs?.find((b) => b.countyId === charCounty.id) : undefined);
    setSelectedCountyId(charCounty ? charCounty.id : null);
    setSelectedBurgId(charBurg ? charBurg.id : null);
    setCircledBurgId(null);
    setSelectionFocus('character');
    if (activeTab === 'sagas' || activeTab === 'chronicles' || activeTab === 'houses') setActiveTab('overview');
    setIsInspectorOpen(true);
  };

  const handleSelectBlank = () => {
    setSelectedRealmId(null);
    setSelectedCountyId(null);
    setSelectedBurgId(null);
    setCircledBurgId(null);
    setSelectedCharacterId(null);
    setSelectedArmyId(null);
    setIsInspectorOpen(false);
  };

  // Clear selectedArmyId if army disbands or ends
  useEffect(() => {
    if (selectedArmyId && !(world.armies || []).some((a) => a.id === selectedArmyId)) {
      setSelectedArmyId(null);
    }
  }, [selectedArmyId, world.armies]);

  const handleSelectArmy = useCallback(
    (army: Army | null) => {
      if (!army) {
        setSelectedArmyId(null);
        return;
      }
      setSelectedArmyId(army.id);
      const ownerRealmId =
        army.realmId ||
        world.characters?.find((c) => c.id === army.attackerId)?.realmId;
      if (ownerRealmId) setSelectedRealmId(ownerRealmId);
      setActiveTab('overview');
      setIsInspectorOpen(true);
      showStatusBanner(
        `${army.commanderName || 'Field Host'} selected (${Math.round(army.strength).toLocaleString()} men). Right-click map to issue march orders.`
      );
    },
    [showStatusBanner]
  );

  const handleOrderArmyMarch = useCallback(
    (armyId: string, worldX: number, worldY: number, targetBurgId?: string) => {
      const next = cloneWorldState(worldRef.current);
      const res = ArmyCommandEngine.orderArmyMarch(armyId, worldX, worldY, targetBurgId, next);
      if (res.success) {
        setWorld(next);
        showStatusBanner(res.summary);
      }
    },
    [showStatusBanner]
  );

  // Track seasonPhase in a ref so the interval advances state cleanly without nested setState calls
  const seasonPhaseRef = useRef(seasonPhase);
  const prevSeasonRef = useRef<Season>(computeSeasonalState(0).currentSeason);
  useEffect(() => {
    seasonPhaseRef.current = seasonPhase;
  }, [seasonPhase]);

  const isSteppingRef = useRef(false);
  const [seedInputDraft, setSeedInputDraft] = useState<string>(() => String(world.settings.seed || ''));

  useEffect(() => {
    setSeedInputDraft(String(world.settings.seed || ''));
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('seed') !== String(world.settings.seed)) {
        url.searchParams.set('seed', String(world.settings.seed));
        window.history.replaceState({}, '', url.toString());
      }
    } catch {
      // Ignore history restrictions in sandboxed iframes
    }
  }, [world.settings.seed]);

  // Simulation Clock: strictly advances only when playing, guarded against overlapping ticks & exceptions
  useEffect(() => {
    if (!isPlaying) return;
    const TICK_MS = 250;
    const timer = setInterval(() => {
      if (isSteppingRef.current) return;
      isSteppingRef.current = true;
      try {
        const cycleDurationSec = 12.0;
        const dPhase = (TICK_MS / 1000 / cycleDurationSec) * 4.0;
        const prev = seasonPhaseRef.current;
        const rawNext = prev + dPhase;
        const prevMonthIdx = Math.floor(prev * 3);
        const nextMonthIdx = Math.floor(rawNext * 3);
        const wrapped = rawNext >= 4.0 ? rawNext - 4.0 : rawNext;
        seasonPhaseRef.current = wrapped;
        setSeasonPhase(wrapped);

        const nextSeason = computeSeasonalState(wrapped).currentSeason;
        const seasonChanged = nextSeason !== prevSeasonRef.current;
        if (seasonChanged) {
          prevSeasonRef.current = nextSeason;
        }

        if (nextMonthIdx > prevMonthIdx || seasonChanged) {
          const monthsElapsed = Math.max(0, nextMonthIdx - prevMonthIdx);
          setWorld((prevWorld) => {
            try {
              const updated =
                monthsElapsed > 0 ? advanceTimelineMonths(prevWorld, monthsElapsed) : { ...prevWorld };
              updated.currentSeason = nextSeason;
              if (seasonChanged) {
                const nextWeather =
                  Math.random() < 0.2
                    ? generateSpontaneousAnomaly(nextSeason, updated)
                    : generateSeasonalWeather(nextSeason, updated);
                recordWeatherAndTriggerDrift(nextWeather, updated);
                updated.activeWeather = nextWeather;
                updated.activeWeatherMod = computeWeatherEconomyMod(nextWeather);
              }
              return updated;
            } catch (err) {
              console.error('Simulation tick recovered without losing world:', err);
              setIsPlaying(false);
              return prevWorld;
            }
          });
        } else {
          setWorld((prevWorld) =>
            prevWorld.currentSeason === nextSeason
              ? prevWorld
              : { ...prevWorld, currentSeason: nextSeason }
          );
        }
      } finally {
        isSteppingRef.current = false;
      }
    }, TICK_MS);

    return () => {
      clearInterval(timer);
      isSteppingRef.current = false;
    };
  }, [isPlaying]);

  const seasonalState = useMemo(
    () => computeSeasonalState(seasonPhase, world.activeWeather),
    [seasonPhase, world.activeWeather]
  );
  const currentSeason = seasonalState.currentSeason;

  const activeRealm = useMemo(() => {
    const directRealm = world.realms?.find((r) => r.id === selectedRealmId);
    if (directRealm) return directRealm;
    const selCounty = world.counties?.find((c) => c.id === selectedCountyId);
    if (selCounty) {
      const fromCounty = world.realms?.find((r) => r.id === selCounty.realmId);
      if (fromCounty) return fromCounty;
    }
    const selBurg = world.burgs?.find((b) => b.id === selectedBurgId);
    if (selBurg) {
      const fromBurg = world.realms?.find((r) => r.id === selBurg.stateId);
      if (fromBurg) return fromBurg;
    }
    const selChar = world.characters?.find((c) => c.id === selectedCharacterId && c.isAlive !== false);
    if (selChar) {
      const fromChar = world.realms?.find((r) => r.id === selChar.realmId);
      if (fromChar) return fromChar;
    }
    return resolvePlayerRealm(world) || world.realms?.[0];
  }, [world, selectedRealmId, selectedCountyId, selectedBurgId, selectedCharacterId]);

  const activeCounty = useMemo(() => {
    const direct = world.counties?.find((c) => c.id === selectedCountyId);
    if (direct) return direct;
    const selBurg = world.burgs?.find((b) => b.id === selectedBurgId);
    if (selBurg?.countyId) {
      const fromBurg = world.counties?.find((c) => c.id === selBurg.countyId);
      if (fromBurg) return fromBurg;
    }
    const selChar = world.characters?.find((c) => c.id === selectedCharacterId && c.isAlive !== false);
    if (selChar?.countyId) {
      const fromChar = world.counties?.find((c) => c.id === selChar.countyId);
      if (fromChar) return fromChar;
    }
    if (activeRealm) {
      const realmCounty =
        world.counties?.find(
          (c) => c.realmId === activeRealm.id && (c.tier === 'Duchy' || c.name.includes('Duchy'))
        ) || world.counties?.find((c) => c.realmId === activeRealm.id);
      if (realmCounty) return realmCounty;
    }
    return world.counties?.[0];
  }, [world.counties, world.burgs, world.characters, selectedCountyId, selectedBurgId, selectedCharacterId, activeRealm]);

  const activeBurg = useMemo(() => {
    const direct = world.burgs?.find((b) => b.id === selectedBurgId);
    if (direct) return direct;

    // Resolve the primary/largest settlement inside the selected County or Duchy
    if (activeCounty && world.burgs?.length) {
      const isDuchy = activeCounty.tier === 'Duchy' || activeCounty.name.includes('Duchy');
      const memberCountyIds = new Set<string>([activeCounty.id]);
      if (isDuchy && activeCounty.duchyId) {
        for (const c of world.counties || []) {
          if (c.duchyId === activeCounty.duchyId) memberCountyIds.add(c.id);
        }
      }
      const inTerritory = world.burgs
        .filter(
          (b) =>
            (b.countyId && memberCountyIds.has(b.countyId)) ||
            (activeCounty.baronyBurgIds && activeCounty.baronyBurgIds.includes(b.id)) ||
            b.id === activeCounty.capitalBurgId
        )
        .sort(
          (a, b) =>
            (b.isCapital ? 100000 : 0) +
            (b.id === activeCounty.capitalBurgId ? 50000 : 0) +
            (b.population || 0) -
            ((a.isCapital ? 100000 : 0) +
              (a.id === activeCounty.capitalBurgId ? 50000 : 0) +
              (a.population || 0))
        );
      if (inTerritory[0]) return inTerritory[0];
    }

    // Fallback to the capital or largest settlement of the active Realm
    if (activeRealm && world.burgs?.length) {
      const realmBurgs = world.burgs
        .filter((b) => b.stateId === activeRealm.id)
        .sort(
          (a, b) =>
            (b.isCapital ? 100000 : 0) + (b.population || 0) - ((a.isCapital ? 100000 : 0) + (a.population || 0))
        );
      if (realmBurgs[0]) return realmBurgs[0];
    }

    return world.burgs?.[0];
  }, [world.burgs, world.counties, selectedBurgId, activeCounty, activeRealm]);

  const activeChar = useMemo(() => {
    const direct = world.characters?.find((c) => c.id === selectedCharacterId && c.isAlive !== false);
    if (direct) return direct;
    if (activeBurg?.ownerId) {
      const burgOwner = world.characters?.find((c) => c.id === activeBurg.ownerId && c.isAlive !== false);
      if (burgOwner) return burgOwner;
    }
    if (activeCounty?.rulerId) {
      const countyLord = world.characters?.find((c) => c.id === activeCounty.rulerId && c.isAlive !== false);
      if (countyLord) return countyLord;
    }
    if (activeRealm?.rulerId) {
      const realmMonarch = world.characters?.find((c) => c.id === activeRealm.rulerId && c.isAlive !== false);
      if (realmMonarch) return realmMonarch;
    }
    return (
      world.characters?.find((c) => c.id === world.monarchId && c.isAlive !== false) ||
      world.characters?.find((c) => c.isAlive !== false) ||
      world.characters?.[0]
    );
  }, [world.characters, world.monarchId, selectedCharacterId, activeBurg, activeCounty, activeRealm]);

  const handleRegenerateFromSeed = (seedOverride?: string) => {
    const cleanSeed = (seedOverride ?? String(world.settings.seed || '')).trim() || `seed_${Date.now()}`;
    setIsPlaying(false);
    const newWorld = generateWorld({ ...world.settings, seed: cleanSeed });
    setWorld(newWorld);
    setSelectedBurgId(null);
    setSelectedCharacterId(null);
    setSelectedRealmId(null);
    setSelectedCountyId(null);
    setSelectedArmyId(null);
    setBrushUndoStack([]);
    setBrushRedoStack([]);
    setDraftRiverPoints([]);
    setDraftRoutePoints([]);
    setDraftBorderPoints([]);
    setIsToolsMenuOpen(false);
    showStatusBanner(`World generated from seed: ${cleanSeed}`);
  };

  const handleRegenerateWorld = () => {
    handleRegenerateFromSeed(`seed_${Date.now()}`);
  };

  const handleCopySeedRaw = async () => {
    const seedVal = String(world.settings.seed);
    try {
      await navigator.clipboard.writeText(seedVal);
      showStatusBanner(`Copied seed "${seedVal}" to clipboard.`);
    } catch {
      showStatusBanner(`Current World Seed: ${seedVal}`);
    }
  };

  const handleCopySeedLink = async () => {
    const seedVal = String(world.settings.seed);
    const tplVal = world.settings.template || 'Continents';
    if (isElectronDesktop()) {
      const token = `seed:${seedVal}|template:${tplVal}`;
      try {
        await navigator.clipboard.writeText(token);
        showStatusBanner(`Copied world seed token (${token}) to clipboard.`);
      } catch {
        showStatusBanner(`World Seed Token: ${token}`);
      }
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set('seed', seedVal);
    url.searchParams.set('template', tplVal);
    try {
      await navigator.clipboard.writeText(url.toString());
      showStatusBanner('Copied shareable world seed link to clipboard.');
    } catch {
      showStatusBanner(`Seed URL: ?seed=${seedVal}&template=${encodeURIComponent(tplVal)}`);
    }
  };

  const handleSwitchAppMode = (nextMode: 'builder' | 'game') => {
    if (nextMode === 'builder') {
      setIsPlaying(false);
      setIsInspectorOpen(true);
      setWorld((prev) => ({ ...prev, appMode: 'builder' }));
      showStatusBanner('World Builder Mode active — simulation paused for sculpting & editing.');
      return;
    }
    setWorld((prev) => {
      const next = cloneWorldState(prev);
      if (!next.builderBaselineArchive) {
        next.builderBaselineArchive = serializeWorldArchive(next);
      }
      next.appMode = 'game';
      try {
        reconcileFeudalHierarchy(next);
        recalculateFeudalDemesne(next);
        ensureEconomy(next);
      } catch {
        // Non-fatal sync safeguard
      }
      return next;
    });
    showStatusBanner('Grand Strategy Mode active — baseline snapshot saved for Day 1 rewind.');
  };

  const handleRewindToBaseline = () => {
    if (!world.builderBaselineArchive) {
      showStatusBanner('No Day 1 creation baseline saved yet.');
      return;
    }
    const parsed = parseWorldArchive(world.builderBaselineArchive);
    if (!parsed.ok || !parsed.world) {
      showStatusBanner('Could not restore creation baseline.');
      return;
    }
    setIsPlaying(false);
    setWorld({
      ...parsed.world,
      appMode: 'builder',
      builderBaselineArchive: world.builderBaselineArchive,
    });
    showStatusBanner(`Rewound world to Day 1 Creation Baseline (Year ${parsed.world.currentYear} AC).`);
  };

  const handleSaveCreationBaseline = () => {
    setWorld((prev) => {
      const next = cloneWorldState(prev);
      next.builderBaselineArchive = serializeWorldArchive(next);
      return next;
    });
    showStatusBanner(`Saved current world state as Day 1 Creation Baseline (Year ${world.currentYear} AC).`);
  };

  const handleSagaCreated = (payload: GeneratedSagaPayload) => {
    setWorld((prev) => ({
      ...prev,
      sagas: [payload.story, ...prev.sagas.filter((s) => s.id !== payload.story.id)],
      loreEntities: [
        payload.loreEntity,
        ...prev.loreEntities.filter((e) => e.id !== payload.loreEntity.id),
      ],
      characters: payload.updatedCharacters,
    }));
  };

  return (
    <ErrorBoundary
      onResume={() => setIsPlaying(false)}
      onReloadSameSeed={() => handleRegenerateFromSeed(String(world.settings.seed))}
    >
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-stone-950 font-sans text-stone-100 select-none">
        
        {/* ==================================================================== */}
        {/* SINGLE CALM HEADER BAR: BRAND · 5 WORKSPACE TABS · UTILITIES & CTA  */}
        {/* ==================================================================== */}
        <header className="z-30 flex h-13 shrink-0 items-center justify-between gap-4 border-b border-white/[0.08] bg-stone-950/95 px-4 backdrop-blur-md">
          {/* Left: Brand Wordmark */}
          <div className="flex items-center gap-2 shrink-0">
            <Crown className="h-4 w-4 text-amber-400 shrink-0" />
            <span className="font-cinzel text-sm sm:text-base font-bold tracking-wide text-amber-200 whitespace-nowrap shrink-0">
              RealmSmith
            </span>
          </div>

          {/* Center: 5 Primary Workspace Links */}
          <nav className="flex items-center gap-5 overflow-x-auto no-scrollbar h-full">
            {[
              {
                id: 'overview' as const,
                label: 'Atlas',
                icon: Compass,
                isActive: activeTab === 'overview',
                onClick: () => setActiveTab('overview'),
              },
              {
                id: 'governance' as const,
                label: 'Governance',
                icon: Castle,
                isActive: activeTab === 'court' || activeTab === 'feudal' || activeTab === 'v17',
                onClick: () => {
                  if (activeTab !== 'court' && activeTab !== 'feudal' && activeTab !== 'v17') {
                    setActiveTab('court');
                  }
                },
              },
              {
                id: 'houses' as const,
                label: 'Dynasties',
                icon: Crown,
                isActive: activeTab === 'houses',
                onClick: () => setActiveTab('houses'),
              },
              {
                id: 'economy' as const,
                label: 'Economy',
                icon: Coins,
                isActive: activeTab === 'economy',
                onClick: () => setActiveTab('economy'),
              },
              {
                id: 'chronicles' as const,
                label: 'Chronicles',
                icon: History,
                isActive: activeTab === 'chronicles' || activeTab === 'sagas',
                onClick: () => {
                  if (activeTab !== 'chronicles' && activeTab !== 'sagas') {
                    setActiveTab('chronicles');
                  }
                },
              },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={tab.onClick}
                  className={`flex items-center gap-1.5 h-full px-1 border-b-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    tab.isActive
                      ? 'border-amber-400 text-amber-200'
                      : 'border-transparent text-stone-400 hover:text-stone-200'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right: Quiet Utilities + Primary Compendium CTA */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsCommandPaletteOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-stone-300 hover:text-white hover:bg-white/[0.04] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Search world (Cmd+K or Ctrl+K)"
            >
              <Search className="w-3.5 h-3.5 text-stone-400 shrink-0" />
              <span className="hidden md:inline">Search</span>
              <kbd className="hidden lg:inline text-[10px] font-mono text-stone-500 ml-0.5">⌘K</kbd>
            </button>

            <button
              type="button"
              onClick={() => setIsSaveLoadOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-stone-300 hover:text-white hover:bg-white/[0.04] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Save or Load World"
            >
              <Save className="w-3.5 h-3.5 text-stone-400 shrink-0" />
              <span className="hidden sm:inline">Save / Load</span>
            </button>

            {/* Seed & Utility Menu */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setIsToolsMenuOpen((v) => !v)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/[0.08] bg-stone-900/90 hover:bg-stone-800 text-xs text-stone-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title="Seed, Map Export, Mod Manager & Creation Baseline"
              >
                <span>Tools</span>
                <ChevronDown className="w-3.5 h-3.5 text-stone-400 shrink-0" />
              </button>

              {isToolsMenuOpen && (
                <div className="fixed sm:absolute right-3 sm:right-0 mt-2 w-72 rounded-xl border border-white/[0.08] bg-stone-950/95 p-3.5 shadow-2xl backdrop-blur-xl z-50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-amber-200">World Seed</span>
                    <button
                      type="button"
                      onClick={() => setIsToolsMenuOpen(false)}
                      className="text-stone-400 hover:text-white text-xs cursor-pointer p-0.5"
                      aria-label="Close tools menu"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      value={seedInputDraft}
                      onChange={(e) => setSeedInputDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleRegenerateFromSeed(seedInputDraft);
                          setIsToolsMenuOpen(false);
                        }
                      }}
                      placeholder="Enter world seed..."
                      className="w-full px-2.5 py-1.5 rounded-lg bg-stone-900 border border-white/[0.1] font-mono text-xs text-stone-100 focus:outline-none focus:border-amber-500"
                    />
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          handleRegenerateFromSeed(seedInputDraft);
                          setIsToolsMenuOpen(false);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-semibold transition-colors cursor-pointer"
                      >
                        Load Seed
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleRegenerateWorld();
                          setIsToolsMenuOpen(false);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-[11px] font-medium transition-colors cursor-pointer"
                      >
                        Random Seed
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={handleCopySeedRaw}
                        className="px-2 py-1 rounded bg-stone-900 hover:bg-stone-800 text-stone-300 text-[11px] font-mono transition-colors cursor-pointer"
                      >
                        Copy Seed
                      </button>
                      <button
                        type="button"
                        onClick={handleCopySeedLink}
                        className="px-2 py-1 rounded bg-stone-900 hover:bg-stone-800 text-stone-300 text-[11px] font-mono transition-colors cursor-pointer"
                      >
                        Copy URL
                      </button>
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-white/[0.08] space-y-1">
                    {world.appMode !== 'builder' && activeRealm && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsToolsMenuOpen(false);
                          setIsRoyalBudgetOpen(true);
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-stone-900 text-amber-200 text-xs text-left transition-colors cursor-pointer"
                      >
                        <Coins className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>Royal Budget &amp; Crown Fisc</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setIsToolsMenuOpen(false);
                        setIsMapExportOpen(true);
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-stone-900 text-stone-200 text-xs text-left transition-colors cursor-pointer"
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span>Export Map (PNG / SVG)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsToolsMenuOpen(false);
                        setIsModManagerOpen(true);
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-stone-900 text-stone-200 text-xs text-left transition-colors cursor-pointer"
                    >
                      <Package className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Mod Manager</span>
                    </button>
                    {world.appMode === 'builder' && (
                      <button
                        type="button"
                        onClick={() => {
                          handleSaveCreationBaseline();
                          setIsToolsMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-stone-900 text-amber-200 text-xs text-left transition-colors cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>Save Day-1 Baseline</span>
                      </button>
                    )}
                    {world.builderBaselineArchive && (
                      <button
                        type="button"
                        onClick={() => {
                          handleRewindToBaseline();
                          setIsToolsMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-stone-900 text-stone-300 text-xs text-left transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>Rewind to Baseline</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setCompendiumEntityId(null);
                setIsCompendiumOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Open Compendium"
            >
              <BookOpen className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Compendium</span>
            </button>
          </div>
        </header>

        {/* ==================================================================== */}
        {/* MAIN VIEWPORT CANVAS                                                 */}
        {/* ==================================================================== */}
        <div className="relative flex flex-1 overflow-hidden no-print">
          
          {/* CONSOLIDATED CHRONICLES & SAGA STUDIO WORKSPACE */}
          {(activeTab === 'chronicles' || activeTab === 'sagas') && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/[0.08] bg-stone-950 px-6">
                <div className="flex items-center gap-5 h-full">
                  <button
                    type="button"
                    onClick={() => setActiveTab('chronicles')}
                    className={`flex items-center gap-1.5 h-full border-b-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      activeTab === 'chronicles'
                        ? 'border-amber-400 text-amber-200'
                        : 'border-transparent text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    <History className="w-3.5 h-3.5 shrink-0" />
                    <span>Historical Annals</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('sagas')}
                    className={`flex items-center gap-1.5 h-full border-b-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      activeTab === 'sagas'
                        ? 'border-amber-400 text-amber-200'
                        : 'border-transparent text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    <Feather className="w-3.5 h-3.5 shrink-0" />
                    <span>Saga Studio</span>
                  </button>
                </div>
                <span className="text-[11px] font-mono tabular-nums text-stone-500 hidden sm:inline">
                  Year {world.currentYear} AC
                </span>
              </div>

              {activeTab === 'chronicles' ? (
                <ChroniclesView
                  world={world}
                  onSelectRealmById={(realmId) => {
                    const r = world.realms.find((realm) => realm.id === realmId);
                    if (r) handleSelectRealm(r);
                    setActiveTab('overview');
                  }}
                  onSelectCharacterById={(charId) => {
                    const c = world.characters.find((ch) => ch.id === charId);
                    if (c) {
                      handleSelectCharacter(c);
                      setIsInspectorOpen(true);
                    }
                    setActiveTab('overview');
                  }}
                  onTriggerCourtEvent={() => setIsCourtEventModalOpen(true)}
                  onOpenCompendiumForEntity={(entityId) => {
                    setCompendiumEntityId(entityId);
                    setIsCompendiumOpen(true);
                  }}
                />
              ) : (
                <SagaWeaver
                  world={world}
                  onSagaCreated={handleSagaCreated}
                  onOpenCompendiumForEntity={(entityId) => {
                    setCompendiumEntityId(entityId);
                    setIsCompendiumOpen(true);
                  }}
                />
              )}
            </div>
          )}

          {/* TAB: NOBLE HOUSES & DYNASTY TREES (Full Canvas Directory & Lineage Explorer) */}
          {activeTab === 'houses' && (
            <HouseDynastyModal
              embedded
              isOpen={true}
              onClose={() => setActiveTab('overview')}
              initialHouseName={selectedHouseModalName}
              world={world}
              activeRealmId={activeRealm?.id}
              onSelectCharacter={(char) => {
                handleSelectCharacter(char);
                setIsInspectorOpen(true);
              }}
              onUpdateWorld={setWorld}
              onNotify={showStatusBanner}
              onOpenHeraldryStudio={setHeraldryTarget}
            />
          )}

          {/* MAP CANVAS VIEWPORT (Active for Map, Court, Feudal, Economy, and Stratagems) */}
          {activeTab !== 'sagas' && activeTab !== 'chronicles' && activeTab !== 'houses' && (
            <>
              {world.appMode === 'builder' && (
                <BuilderPalette
                  world={world}
                  brushConfig={world.settings.terrainSim}
                  onUpdateBrushConfig={handleUpdateBrushConfig}
                  onUndoBrush={handleUndoBrush}
                  onRedoBrush={handleRedoBrush}
                  canUndoBrush={brushUndoStack.length > 0}
                  canRedoBrush={brushRedoStack.length > 0}
                  onResetBrushEdits={handleResetBrushEdits}
                  onAutoPopulateTerrain={() => {
                    const populated = autoPopulateCurrentTerrain(world);
                    setWorld(populated);
                    setSelectedBurgId(null);
                    setSelectedCharacterId(null);
                    setSelectedRealmId(populated.realms[0]?.id || null);
                    setSelectedCountyId(null);
                    showStatusBanner(
                      `Auto-populated ${populated.realms.length} realms and ${populated.burgs.length} settlements onto sculpted terrain.`
                    );
                  }}
                  onOpenNewWorldModal={() => setIsNewWorldModalOpen(true)}
                  draftRiverPoints={draftRiverPoints}
                  riverNameDraft={riverNameDraft}
                  onChangeRiverNameDraft={setRiverNameDraft}
                  riverWidthScale={riverWidthScale}
                  onChangeRiverWidthScale={setRiverWidthScale}
                  onFinishDraftRiver={() => {
                    if (draftRiverPoints.length < 2) return;
                    const updated = addCustomRiver(world, riverNameDraft, draftRiverPoints, riverWidthScale);
                    setWorld(updated);
                    setDraftRiverPoints([]);
                    setRiverNameDraft('');
                    showStatusBanner('Added custom river channel to atlas.');
                  }}
                  onCancelDraftRiver={() => setDraftRiverPoints([])}
                  onRenameCustomRiver={(riverId, name) => setWorld((prev) => renameCustomRiver(prev, riverId, name))}
                  onDeleteCustomRiver={(riverId) => setWorld((prev) => deleteCustomRiver(prev, riverId))}
                  stampBurgType={stampBurgType}
                  onChangeStampBurgType={setStampBurgType}
                  stampBurgName={stampBurgName}
                  onChangeStampBurgName={setStampBurgName}
                  stampBurgRealmId={stampBurgRealmId}
                  onChangeStampBurgRealmId={setStampBurgRealmId}
                  pinLabelDraft={pinLabelDraft}
                  onChangePinLabelDraft={setPinLabelDraft}
                  pinCategoryDraft={pinCategoryDraft}
                  onChangePinCategoryDraft={setPinCategoryDraft}
                  pinNotesDraft={pinNotesDraft}
                  onChangePinNotesDraft={setPinNotesDraft}
                  onDeleteMapPin={(pinId) => setWorld((prev) => deleteMapPin(prev, pinId))}
                  onRenameMapPin={(pinId, label) => setWorld((prev) => renameMapPin(prev, pinId, label))}
                  onFocusPin={(pin) => mapCanvasRef.current?.centerOnPoint(pin.x, pin.y, 1.8)}
                  borderDrawMode={borderDrawMode}
                  onChangeBorderDrawMode={setBorderDrawMode}
                  draftBorderPoints={draftBorderPoints}
                  onFinishDraftBorder={handleFinishDraftBorder}
                  onCancelDraftBorder={() => setDraftBorderPoints([])}
                  onDeleteCustomBorder={(borderId) =>
                    setWorld((prev) => deleteCustomBorderEdge(prev, borderId))
                  }
                  onClearAllCustomBorders={() => {
                    setWorld((prev) => clearAllCustomBorders(prev));
                    showStatusBanner('Cleared all custom borders and edge overrides.');
                  }}
                  routeCategory={routeCategory}
                  onChangeRouteCategory={setRouteCategory}
                  routeUsePathfinding={routeUsePathfinding}
                  onChangeRouteUsePathfinding={setRouteUsePathfinding}
                  routeSnapToBurgs={routeSnapToBurgs}
                  onChangeRouteSnapToBurgs={setRouteSnapToBurgs}
                  draftRoutePoints={draftRoutePoints}
                  onPopDraftRoutePoint={() => setDraftRoutePoints((prev) => prev.slice(0, -1))}
                  onFinishDraftRoute={handleFinishDraftRoute}
                  onCancelDraftRoute={() => setDraftRoutePoints([])}
                  onDeleteTradeRoute={(routeId) =>
                    setWorld((prev) => deleteTradeRoute(prev, routeId))
                  }
                  onRegenerateRoutes={handleRegenerateRoutes}
                />
              )}

              <div className="relative flex-1 bg-stone-950 overflow-hidden">
                <MapCanvas
                  ref={mapCanvasRef}
                  world={world}
                  isPlaying={isPlaying}
                  activeLayers={activeLayers}
                  onToggleLayer={handleToggleLayer}
                  selectedRealmId={selectedRealmId || undefined}
                  selectedBurgId={selectedBurgId || undefined}
                  circledBurgId={circledBurgId || undefined}
                  selectedCountyId={selectedCountyId || undefined}
                  selectedCharacterId={selectedCharacterId || undefined}
                  selectionFocus={selectionFocus}
                  selectedArmyId={selectedArmyId || undefined}
                  onSelectBurg={handleSelectBurg}
                  onSelectRealm={handleSelectRealm}
                  onSelectCounty={handleSelectCounty}
                  onSelectArmy={handleSelectArmy}
                  onOrderArmyMarch={handleOrderArmyMarch}
                  onSelectBlank={handleSelectBlank}
                  currentSeason={currentSeason}
                  seasonalState={seasonalState}
                  activeWeather={world.activeWeather}
                  mapStyle={mapStyle}
                  onChangeMapStyle={setMapStyle}
                  brushConfig={world.settings.terrainSim}
                  onUpdateBrushConfig={handleUpdateBrushConfig}
                  onBrushStrokeStart={handleBrushStrokeStart}
                  onPaintAtWorld={handlePaintAtWorld}
                  onUndoBrush={handleUndoBrush}
                  onRedoBrush={handleRedoBrush}
                  canUndoBrush={brushUndoStack.length > 0}
                  canRedoBrush={brushRedoStack.length > 0}
                  sandboxBrushUnlocked={sandboxBrushUnlocked}
                  onPlaceCustomBurg={(wx, wy) => {
                    const beforeCount = world.burgs.length;
                    const updated = placeCustomBurg(world, wx, wy, {
                      type: stampBurgType,
                      name: stampBurgName,
                      realmId: stampBurgRealmId || undefined,
                    });
                    if (updated.burgs.length > beforeCount) {
                      const created = updated.burgs[updated.burgs.length - 1];
                      setWorld(updated);
                      setStampBurgName('');
                      showStatusBanner(`Founded ${created.name} (${created.type}).`);
                    } else {
                      showStatusBanner('Click closer to land above sea level to place a settlement.');
                    }
                  }}
                  draftRiverPoints={draftRiverPoints}
                  onAddDraftRiverPoint={(pt) => setDraftRiverPoints((prev) => [...prev, pt])}
                  onFinishDraftRiver={() => {
                    if (draftRiverPoints.length < 2) return;
                    const updated = addCustomRiver(world, riverNameDraft, draftRiverPoints, riverWidthScale);
                    setWorld(updated);
                    setDraftRiverPoints([]);
                    setRiverNameDraft('');
                    showStatusBanner('Added custom river channel to atlas.');
                  }}
                  draftRoutePoints={draftRoutePoints}
                  routeCategory={routeCategory}
                  onAddDraftRoutePoint={(pt) => setDraftRoutePoints((prev) => [...prev, pt])}
                  onFinishDraftRoute={handleFinishDraftRoute}
                  draftBorderPoints={draftBorderPoints}
                  borderDrawMode={borderDrawMode}
                  onAddDraftBorderPoint={(pt) => setDraftBorderPoints((prev) => [...prev, pt])}
                  onFinishDraftBorder={handleFinishDraftBorder}
                  onPlaceMapPin={(wx, wy) => {
                    const updated = upsertMapPin(world, {
                      x: wx,
                      y: wy,
                      label: pinLabelDraft || 'Notable Landmark',
                      category: pinCategoryDraft,
                      icon: 'pin',
                      notes: pinNotesDraft,
                    });
                    setWorld(updated);
                    showStatusBanner(`Placed atlas pin "${pinLabelDraft || 'Notable Landmark'}".`);
                  }}
                  onOpenNewWorldModal={() => setIsNewWorldModalOpen(true)}
                />

                {selectedArmyId && (() => {
                  const selArmy = (world.armies || []).find((a) => a.id === selectedArmyId);
                  if (!selArmy) return null;
                  return (
                    <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2.5 px-3.5 py-2 bg-stone-950/95 backdrop-blur-md border border-amber-500/60 rounded-lg shadow-2xl text-xs text-stone-100 whitespace-nowrap">
                      <Swords className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="font-semibold text-amber-300">
                        {selArmy.commanderName || 'Field Host'}
                      </span>
                      <span className="text-stone-400 tabular-nums">
                        ({Math.round(selArmy.strength).toLocaleString()} men)
                      </span>
                      <span className="hidden sm:inline text-stone-300">
                        · Right-click anywhere to march · Esc to deselect
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedArmyId(null)}
                        className="p-0.5 rounded text-stone-400 hover:text-white hover:bg-stone-800 cursor-pointer"
                        title="Deselect army"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })()}

                {/* Top-Left Floating Map HUD: Mode Toggle, Active Sovereign & Crown Treasury */}
                <div className="absolute top-3 left-3 z-20 flex flex-wrap items-center gap-2 max-w-[calc(100%-64px)]">
                  <div className="flex items-center bg-stone-950/90 backdrop-blur-md border border-white/[0.08] rounded-xl p-0.5 shadow-xl shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSwitchAppMode('builder')}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        world.appMode === 'builder'
                          ? 'bg-amber-600/25 text-amber-200'
                          : 'text-stone-400 hover:text-stone-200'
                      }`}
                      title="World Builder Mode"
                    >
                      <Hammer className="w-3.5 h-3.5 shrink-0" />
                      <span className="hidden sm:inline">Builder</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchAppMode('game')}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        world.appMode !== 'builder'
                          ? 'bg-emerald-600/25 text-emerald-200'
                          : 'text-stone-400 hover:text-stone-200'
                      }`}
                      title="Simulator Mode"
                    >
                      <Swords className="w-3.5 h-3.5 shrink-0" />
                      <span className="hidden sm:inline">Simulator</span>
                    </button>
                  </div>

                  {world.appMode !== 'builder' && (
                    <select
                      aria-label="Playing As Sovereign or Observer"
                      value={
                        world.playerRealmId === null
                          ? '__observer__'
                          : world.playerRealmId || world.realms?.[0]?.id || '__observer__'
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__observer__') {
                          setWorld((prev) => ({ ...prev, playerRealmId: null }));
                          showStatusBanner('Observer mode active — all realms act autonomously.');
                        } else {
                          const targetRealm = world.realms?.find((r) => r.id === val);
                          setWorld((prev) => ({
                            ...prev,
                            playerRealmId: val,
                            monarchId: targetRealm?.rulerId || prev.monarchId,
                          }));
                          if (targetRealm) {
                            handleSelectRealm(targetRealm);
                            mapCanvasRef.current?.centerOnRealm(targetRealm);
                            showStatusBanner(`Now ruling ${targetRealm.name}.`);
                          }
                        }
                      }}
                      className="px-3 py-1.5 bg-stone-950/90 backdrop-blur-md border border-white/[0.08] rounded-xl shadow-xl text-xs font-medium text-amber-200 focus:outline-none focus:border-amber-500/60 cursor-pointer max-w-[180px] truncate"
                      title="Choose which realm to rule or observe autonomously"
                    >
                      <option value="__observer__" className="bg-stone-950 text-stone-200">
                        Observer Mode
                      </option>
                      {(world.realms || []).map((r) => (
                        <option key={r.id} value={r.id} className="bg-stone-950 text-amber-200">
                          {r.name}
                        </option>
                      ))}
                    </select>
                  )}

                  {world.appMode !== 'builder' && activeRealm && (() => {
                    const hudRealm = resolvePlayerRealm(world) || activeRealm;
                    const hudBankrupt = (hudRealm.budget?.bankruptcyUntilYear || 0) > world.currentYear;
                    const hudNet = hudRealm.budget?.lastReport?.netBalance;
                    return (
                      <button
                        type="button"
                        onClick={() => setIsRoyalBudgetOpen(true)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border backdrop-blur-md shadow-xl text-xs font-mono tabular-nums transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          hudBankrupt
                            ? 'border-rose-700/80 bg-rose-950/90 text-rose-200 hover:bg-rose-900/90'
                            : 'border-white/[0.08] bg-stone-950/90 hover:bg-stone-900 text-amber-300'
                        }`}
                        title={`Open Royal Budget & Crown Fisc for ${hudRealm.name}`}
                      >
                        <Coins className="w-3.5 h-3.5 shrink-0" />
                        <span>{Math.round(hudRealm.treasury ?? 0).toLocaleString()}g</span>
                        {typeof hudNet === 'number' && (
                          <span className={`hidden md:inline text-[11px] ${hudNet >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            ({hudNet >= 0 ? '+' : ''}{hudNet.toFixed(0)})
                          </span>
                        )}
                        {hudBankrupt && <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                      </button>
                    );
                  })()}
                </div>

                {/* Floating Toolbar & Inspector Toggle (stacked cleanly in top-right column) */}
                <div className="absolute top-3 right-3 z-20 flex flex-col items-end gap-2">
                  <FloatingToolbar
                    activeLayers={activeLayers}
                    onToggleLayer={handleToggleLayer}
                    mapStyle={mapStyle}
                    onChangeMapStyle={setMapStyle}
                    settings={world.settings}
                    continents={world.continents}
                    realms={world.realms}
                    counties={world.counties}
                    onUpdateSettings={(newSettings) => {
                      const newWorld = generateWorld({ ...world.settings, ...newSettings });
                      setWorld(newWorld);
                      setSelectedBurgId(null);
                      setSelectedCharacterId(null);
                      setSelectedRealmId(null);
                      setSelectedCountyId(null);
                      setBrushUndoStack([]);
                      setBrushRedoStack([]);
                    }}
                    onRegenerate={handleRegenerateWorld}
                    onRegenerateFromSeed={handleRegenerateFromSeed}
                    brushConfig={world.settings.terrainSim}
                    onUpdateBrushConfig={handleUpdateBrushConfig}
                    onUndoBrush={handleUndoBrush}
                    onRedoBrush={handleRedoBrush}
                    canUndoBrush={brushUndoStack.length > 0}
                    canRedoBrush={brushRedoStack.length > 0}
                    onResetBrushEdits={handleResetBrushEdits}
                    onReseedFromTerrain={handleReseedFromTerrain}
                    appMode={world.appMode || 'game'}
                    sandboxBrushUnlocked={sandboxBrushUnlocked}
                    onToggleSandboxBrush={() => setSandboxBrushUnlocked((v) => !v)}
                    onRegenerateRoutes={handleRegenerateRoutes}
                  />

                  {activeTab === 'overview' && !isInspectorOpen && (
                    <button
                      type="button"
                      onClick={() => setIsInspectorOpen(true)}
                      className="flex items-center justify-center p-2.5 rounded-xl border border-amber-500/40 bg-stone-950/90 text-amber-300 shadow-2xl backdrop-blur-xl hover:bg-stone-800 hover:text-amber-200 cursor-pointer"
                      title="Open Inspector"
                    >
                      <Castle className="h-4 w-4 text-amber-400" />
                    </button>
                  )}
                </div>
              </div>

              {/* RIGHT-HAND CONTEXTUAL PANELS */}
              {activeTab === 'overview' && isInspectorOpen && (
                <div className="z-10 w-[430px] xl:w-[470px] shrink-0 border-l border-white/[0.08] bg-stone-950 flex flex-col h-full shadow-2xl overflow-hidden transition-all duration-300">
                  <AdaptivePanel
                    world={world}
                    selectedBurg={activeBurg}
                    selectedCounty={activeCounty}
                    selectedCharacter={activeChar}
                    selectedRealm={activeRealm}
                    selectionFocus={selectionFocus}
                    onSelectionFocusChange={setSelectionFocus}
                    onSelectCharacter={handleSelectCharacter}
                    onSelectBurg={handleSelectBurg}
                    onSelectCounty={handleSelectCounty}
                    onSelectRealm={handleSelectRealm}
                    onOpenHouse={handleOpenHouse}
                    onUpdateWorld={setWorld}
                    onClose={() => setIsInspectorOpen(false)}
                    onOpenWorkspaceTab={(tab) => setActiveTab(tab)}
                    onOpenCompendiumForEntity={(entityId) => {
                      setCompendiumEntityId(entityId);
                      setIsCompendiumOpen(true);
                    }}
                    onWeaveStoryForCharacter={(char) => {
                      setSelectedCharacterId(char.id);
                      setActiveTab('sagas');
                    }}
                    onOpenHeraldryStudio={setHeraldryTarget}
                  />
                </div>
              )}

              {(activeTab === 'court' || activeTab === 'feudal' || activeTab === 'v17') && (
                <div className="z-10 w-[420px] xl:w-[460px] shrink-0 border-l border-white/[0.08] bg-stone-950 flex flex-col h-full shadow-2xl overflow-hidden">
                  <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/[0.08] bg-stone-950 px-4">
                    <div className="flex items-center gap-4 h-full overflow-x-auto no-scrollbar">
                      {[
                        { id: 'court' as const, label: 'Court', icon: Users },
                        { id: 'feudal' as const, label: 'Holdings', icon: Castle },
                        { id: 'v17' as const, label: 'Council & Wars', icon: Swords },
                      ].map((sub) => {
                        const Icon = sub.icon;
                        const isActive = activeTab === sub.id;
                        return (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => setActiveTab(sub.id)}
                            className={`flex items-center gap-1.5 h-full border-b-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              isActive
                                ? 'border-amber-400 text-amber-200'
                                : 'border-transparent text-stone-400 hover:text-stone-200'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5 shrink-0" />
                            <span>{sub.label}</span>
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('overview')}
                      className="p-1 rounded-lg text-stone-400 hover:text-white hover:bg-white/[0.05] cursor-pointer shrink-0"
                      title="Return to Atlas Inspector"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-hidden">
                    {activeTab === 'court' && (
                      <CourtDossier
                        character={activeChar}
                        selectedCharacter={activeChar}
                        selectedRealm={activeRealm}
                        selectedBurg={activeBurg}
                        selectedCounty={activeCounty}
                        world={world}
                        onSelectCharacter={handleSelectCharacter}
                        onSelectRealm={handleSelectRealm}
                        onSelectBurg={handleSelectBurg}
                        onSelectCounty={handleSelectCounty}
                        onOpenHouse={handleOpenHouse}
                        onOpenCompendiumForEntity={(entityId) => {
                          setCompendiumEntityId(entityId);
                          setIsCompendiumOpen(true);
                        }}
                        onUpdateWorld={setWorld}
                        onOpenHeraldryStudio={setHeraldryTarget}
                        onWeaveStoryForCharacter={(char) => {
                          setSelectedCharacterId(char.id);
                          setActiveTab('sagas');
                        }}
                        onClose={() => setActiveTab('overview')}
                      />
                    )}

                    {activeTab === 'feudal' && (
                      <FeudalDomainPanel
                        world={world}
                        character={activeChar}
                        onSelectBurg={(burgId) => {
                          const b = world.burgs?.find((bg) => bg.id === burgId);
                          if (b) handleSelectBurg(b);
                        }}
                        onUpdateWorld={setWorld}
                      />
                    )}

                    {activeTab === 'v17' && (
                      <V17GrandStrategyPanels
                        world={world}
                        activeCharacter={activeChar}
                        onUpdateWorld={setWorld}
                        onSelectCharacter={handleSelectCharacter}
                        onOpenHouse={handleOpenHouse}
                      />
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'economy' && (
                <div className="z-10 w-[420px] xl:w-[460px] shrink-0 border-l border-white/[0.08] bg-stone-950 flex flex-col h-full shadow-2xl overflow-hidden">
                  <FlowEconomyPanels
                    world={world}
                    selectedBurg={activeBurg}
                    selectedRealm={activeRealm}
                    selectedCharacter={activeChar}
                    onSelectBurg={handleSelectBurg}
                    onUpdateWorld={setWorld}
                  />
                </div>
              )}
            </>
          )}

        </div>

        {/* ==================================================================== */}
        {/* FOOTER BAR: TIMELINE CONTROLS                                       */}
        {/* ==================================================================== */}
        <div className="z-30 shrink-0 no-print">
          <TimelineBar
            currentYear={world.currentYear}
            currentSeason={seasonalState.currentSeason}
            onCycleSeason={() => {
              const seasons: Array<{ name: Season; phase: number }> = [
                { name: 'Spring', phase: 0.5 },
                { name: 'Summer', phase: 1.5 },
                { name: 'Autumn', phase: 2.5 },
                { name: 'Winter', phase: 3.5 },
              ];
              const idx = seasons.findIndex((s) => s.name === seasonalState.currentSeason);
              const next = seasons[(idx + 1) % seasons.length];
              seasonPhaseRef.current = next.phase;
              prevSeasonRef.current = next.name;
              setSeasonPhase(next.phase);
              setWorld((prev) => {
                const updated = { ...prev, currentSeason: next.name };
                const nextWeather = generateSeasonalWeather(next.name, updated);
                recordWeatherAndTriggerDrift(nextWeather, updated);
                updated.activeWeather = nextWeather;
                updated.activeWeatherMod = computeWeatherEconomyMod(nextWeather);
                return updated;
              });
            }}
            recentEvents={world.history || []}
            onOpenChronicles={() => setActiveTab('chronicles')}
            onTriggerCourtEvent={() => setIsCourtEventModalOpen(true)}
            isPlaying={isPlaying}
            isBuilderMode={world.appMode === 'builder'}
            onTogglePlay={() => setIsPlaying(!isPlaying)}
            onAdvanceMonths={(months) => setWorld((prev) => advanceTimelineMonths(prev, months || 1))}
            onAdvanceYears={(years) => setWorld((prev) => advanceTimeline(prev, years || 1))}
          />
        </div>

        {/* ==================================================================== */}
        {/* GLOBAL MODALS: SPOTLIGHT SEARCH, VAULT & COMPENDIUM EXPORTER         */}
        {/* ==================================================================== */}
        <CommandPalette
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          world={world}
          onSelectRealm={(realm) => {
            handleSelectRealm(realm);
            mapCanvasRef.current?.centerOnRealm(realm);
          }}
          onSelectCounty={(county) => {
            handleSelectCounty(county);
            mapCanvasRef.current?.centerOnCounty(county);
          }}
          onSelectBurg={(burg) => {
            handleSelectBurg(burg);
            mapCanvasRef.current?.centerOnBurg(burg);
          }}
          onSelectCharacter={(char) => {
            handleSelectCharacter(char);
            const charBurg = world.burgs?.find((b) => b.ownerId === char.id);
            const charCounty = world.counties?.find((c) => c.rulerId === char.id || c.id === char.countyId);
            if (charCounty) {
              mapCanvasRef.current?.centerOnCounty(charCounty);
            } else if (charBurg) {
              mapCanvasRef.current?.centerOnBurg(charBurg);
            } else {
              const realm = world.realms?.find((r) => r.id === char.realmId);
              if (realm) mapCanvasRef.current?.centerOnRealm(realm);
            }
          }}
          onSelectHouse={handleOpenHouse}
          onSelectArmy={(army) => {
            handleSelectArmy(army);
            const pos = getArmyPositionAtProgress(army);
            mapCanvasRef.current?.centerOnPoint(pos.x, pos.y, 1.5);
          }}
          onSelectCommodity={(commodity, producerBurg) => {
            if (producerBurg) {
              handleSelectBurg(producerBurg);
              mapCanvasRef.current?.centerOnBurg(producerBurg);
            }
            setActiveTab('economy');
            showStatusBanner(`Inspecting market ledger for ${commodity}${producerBurg ? ` · Hub: ${producerBurg.name}` : ''}`);
          }}
          onOpenCompendiumForEntity={(entityId) => {
            setCompendiumEntityId(entityId);
            setIsCompendiumOpen(true);
          }}
          onSelectWarOrSiege={(holdingId) => {
            const targetBurg = world.burgs?.find(
              (b) => b.id === holdingId || `holding_${b.id}` === holdingId
            );
            if (targetBurg) {
              handleSelectBurg(targetBurg);
              mapCanvasRef.current?.centerOnBurg(targetBurg);
            }
          }}
        />

        <HouseDynastyModal
          isOpen={isHouseModalOpen}
          onClose={() => setIsHouseModalOpen(false)}
          initialHouseName={selectedHouseModalName}
          world={world}
          activeRealmId={activeRealm?.id}
          onSelectCharacter={(char) => {
            handleSelectCharacter(char);
            setIsInspectorOpen(true);
          }}
          onUpdateWorld={setWorld}
          onNotify={showStatusBanner}
          onOpenHeraldryStudio={setHeraldryTarget}
        />

        <SaveLoadModal
          isOpen={isSaveLoadOpen}
          onClose={() => setIsSaveLoadOpen(false)}
          world={world}
          onLoadWorld={(loadedWorld) => {
            setWorld(loadedWorld);
            setSelectedBurgId(null);
            setSelectedCharacterId(null);
            setSelectedRealmId(null);
            setSelectedCountyId(null);
            setSelectedArmyId(null);
            setBrushUndoStack([]);
            setBrushRedoStack([]);
            const loadedSeason = loadedWorld.currentSeason || 'Spring';
            prevSeasonRef.current = loadedSeason;
            const phase =
              loadedSeason === 'Spring' ? 0.5 :
              loadedSeason === 'Summer' ? 1.5 :
              loadedSeason === 'Autumn' ? 2.5 : 3.5;
            seasonPhaseRef.current = phase;
            setSeasonPhase(phase);
            mapCanvasRef.current?.resetView();
          }}
          onNotify={showStatusBanner}
        />

        <CompendiumModal
          isOpen={isCompendiumOpen}
          onClose={() => {
            setIsCompendiumOpen(false);
            setCompendiumEntityId(null);
          }}
          entities={world.loreEntities || []}
          currentYear={world.currentYear}
          selectedEntityId={compendiumEntityId || undefined}
          isBuilderMode={world.appMode === 'builder'}
          onUpsertLore={(entity) => {
            setWorld((prev) => upsertLoreEntity(prev, entity));
            showStatusBanner(`Saved lore chapter "${entity.name}".`);
          }}
          onDeleteLore={(entityId) => {
            setWorld((prev) => deleteLoreEntity(prev, entityId));
            showStatusBanner('Deleted lore chapter from Compendium.');
          }}
        />

        <MapExportModal
          isOpen={isMapExportOpen}
          onClose={() => setIsMapExportOpen(false)}
          world={world}
          mapStyle={mapStyle}
          onNotify={showStatusBanner}
        />

        <ModManagerModal
          isOpen={isModManagerOpen}
          onClose={() => setIsModManagerOpen(false)}
          onNotify={showStatusBanner}
          onModsApplied={(report) => {
            setWorld((prev) => ({ ...prev, paintRevision: (prev.paintRevision || 0) + 1 }));
            if (report.loadedModIds.length > 0) {
              showStatusBanner(
                `Active registries updated: ${report.loadedModIds.length} mod(s), ${report.appliedCount} patch(es).`
              );
            }
          }}
        />

        <HeraldryStudioModal
          isOpen={Boolean(heraldryTarget)}
          onClose={() => setHeraldryTarget(null)}
          world={world}
          target={heraldryTarget}
          onSaveCoatOfArms={(target, nextArms) => {
            setWorld((prev) => {
              if (target.kind === 'realm') {
                return updateRealm(prev, target.id, { heraldry: nextArms });
              }
              if (target.kind === 'county') {
                return updateCounty(prev, target.id, { coatOfArms: nextArms });
              }
              if (target.kind === 'burg') {
                return updateBurg(prev, target.id, { coatOfArms: nextArms });
              }
              if (target.kind === 'house') {
                return updateHouse(prev, target.id, undefined, { coatOfArms: nextArms });
              }
              return updateCharacter(prev, target.id, { coatOfArms: nextArms }).world;
            });
            showStatusBanner(`Saved Heraldry for ${target.label}: ${nextArms.blazon || 'Custom Escutcheon'}`);
          }}
        />

        <NewWorldModal
          isOpen={isNewWorldModalOpen}
          onClose={() => setIsNewWorldModalOpen(false)}
          currentSettings={world.settings}
          onCreateWorld={(nextWorld) => {
            setIsPlaying(false);
            setWorld(nextWorld);
            setSelectedBurgId(null);
            setSelectedCharacterId(null);
            setSelectedRealmId(nextWorld.realms[0]?.id || null);
            setSelectedCountyId(null);
            setSelectedArmyId(null);
            setBrushUndoStack([]);
            setBrushRedoStack([]);
            setDraftRiverPoints([]);
            setDraftRoutePoints([]);
            setDraftBorderPoints([]);
            mapCanvasRef.current?.resetView();
          }}
          onNotify={showStatusBanner}
        />

        <RoyalBudgetModal
          isOpen={isRoyalBudgetOpen}
          onClose={() => setIsRoyalBudgetOpen(false)}
          world={world}
          realm={resolvePlayerRealm(world) || activeRealm}
          onUpdateWorld={setWorld}
          onNotify={showStatusBanner}
        />

        {activeChar && (
          <ChronicleEventModal
            isOpen={isCourtEventModalOpen}
            onClose={() => setIsCourtEventModalOpen(false)}
            character={activeChar}
            world={world}
            onApplyEventOutcome={(outcomeText, updatedWorld) => {
              setWorld(updatedWorld);
              showStatusBanner(outcomeText);
            }}
          />
        )}

        {(() => {
          const subjectRealm = resolvePlayerRealm(world);
          if (!subjectRealm || world.appMode === 'builder') return null;
          const untilYear = subjectRealm.budget?.bankruptcyUntilYear || 0;
          if (untilYear <= world.currentYear) return null;
          const bKey = `${subjectRealm.id}:${untilYear}`;
          if (acknowledgedBankruptcyKey === bKey) return null;
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
              <div className="w-full max-w-md rounded-lg border border-rose-800/80 bg-stone-950 p-5 text-stone-100 space-y-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <h3 className="font-cinzel text-base font-bold text-rose-200">
                      Crown Bankruptcy Declared
                    </h3>
                    <p className="text-xs text-stone-300 mt-1 leading-relaxed">
                      The Crown Fisc of <strong>{subjectRealm.name}</strong> has defaulted on its domestic obligations. Sovereign credit is suspended, army morale ceilings are halved, and troop combat discipline is penalized until Year{' '}
                      <span className="font-mono tabular-nums font-bold text-rose-300">{untilYear}</span>.
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-800">
                  <button
                    type="button"
                    onClick={() => {
                      setAcknowledgedBankruptcyKey(bKey);
                      setIsRoyalBudgetOpen(true);
                    }}
                    className="rounded border border-amber-600/60 bg-amber-600/20 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-600/35 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Open Royal Budget
                  </button>
                  <button
                    type="button"
                    onClick={() => setAcknowledgedBankruptcyKey(bKey)}
                    className="rounded border border-stone-800 bg-stone-900 px-3 py-1.5 text-xs text-stone-300 hover:bg-stone-800 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Acknowledge
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {statusBanner && (
          <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3.5 py-2 rounded-lg bg-stone-950/95 border border-amber-500/50 text-xs text-stone-100 shadow-2xl max-w-[90vw]">
            <span className="text-amber-300 font-medium truncate">{statusBanner}</span>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="p-0.5 text-stone-400 hover:text-white cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

      </div>
    </ErrorBoundary>
  );
}