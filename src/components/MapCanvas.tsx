import React, { useRef, useEffect, useState, useCallback, useMemo, useImperativeHandle } from 'react';
import { WorldState, WorldCell, Burg, Realm, County, Army, Point2D, TradeRoute, Season, WeatherEvent, SeasonalState, TerrainSimConfig, PaintBrushMode, MapMode, RouteClassification } from '../types/world';
import { renderAtlasMap, AtlasRenderOptions } from '../engine/atlasMapRenderer';
import { getArmyPositionAtProgress } from '../engine/armyPathfinding';
import { getCachedTerrainSim } from '../engine/worldGenerator';
import { FlowEconomyEngine } from '../engine/flowEconomyEngine';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Crown,
  Shield,
  Castle,
  ChevronRight,
  Undo2,
  Redo2,
  Paintbrush,
  Mountain,
  Coins,
  Palette,
  Sparkles,
  Handshake,
  Users,
} from 'lucide-react';
import { onAtlasLoaded, preloadAllAtlasBrushes, ReliefAtlasStyle, getForestBrushPreviewUrl } from '../engine/reliefAtlas';
import { computeSeasonalState } from '../engine/weatherSimulation';
import { CartographyStyle } from '../types/world';
import { SelectionFocus, SelectedTerritoryMask, resolveHoveredTerritoryMask, resolveSelectedTerritoryMask } from '../engine/territorySelection';

export type MapLayer =
  | 'political'
  | 'feudal'
  | 'heightmap'
  | 'biomes'
  | 'rainfall'
  | 'wind'
  | 'burgs'
  | 'rivers'
  | 'relief'
  | 'reliefMountains'
  | 'reliefHills'
  | 'reliefForests'
  | 'reliefTrees'
  | 'reliefSwamps'
  | 'contours'
  | 'textures'
  | 'routes'
  | 'caravans'
  | 'density'
  | 'weather'
  | 'provinces'
  | 'epidemics'
  | 'banners'
  | 'devastation';

export interface MapCanvasHandle {
  centerOnBurg: (burg: Burg) => void;
  centerOnCounty: (county: County) => void;
  centerOnRealm: (realm: Realm) => void;
  centerOnPoint: (worldX: number, worldY: number, zoom?: number) => void;
  resetView: () => void;
}

interface MapCanvasProps {
  world: WorldState;
  isPlaying?: boolean;
  activeLayers: Record<MapLayer, boolean>;
  onToggleLayer: (layer: MapLayer) => void;
  selectedRealmId?: string;
  selectedBurgId?: string;
  circledBurgId?: string;
  selectedCountyId?: string;
  selectedCharacterId?: string;
  selectionFocus?: SelectionFocus;
  selectedArmyId?: string;
  onSelectBurg: (burg: Burg, opts?: { preserveTerritory?: boolean; circleBurg?: boolean }) => void;
  onSelectRealm: (realm: Realm) => void;
  onSelectCounty: (county: County, focusOverride?: 'duchy' | 'county') => void;
  onSelectArmy?: (army: Army | null) => void;
  onOrderArmyMarch?: (armyId: string, worldX: number, worldY: number, targetBurgId?: string) => void;
  onWeaveStoryForTarget?: (realm?: Realm, burg?: Burg) => void;
  currentSeason?: Season;
  activeWeather?: WeatherEvent;
  seasonalState?: SeasonalState;
  mapStyle?: CartographyStyle;
  onChangeMapStyle?: (style: CartographyStyle) => void;
  onSelectBlank?: () => void;
  brushConfig?: TerrainSimConfig;
  onUpdateBrushConfig?: (patch: Partial<TerrainSimConfig>) => void;
  onBrushStrokeStart?: () => void;
  onPaintAtWorld?: (worldX: number, worldY: number) => void;
  onBrushStrokeEnd?: () => void;
  onUndoBrush?: () => void;
  onRedoBrush?: () => void;
  canUndoBrush?: boolean;
  canRedoBrush?: boolean;
  sandboxBrushUnlocked?: boolean;
  onPlaceCustomBurg?: (worldX: number, worldY: number) => void;
  draftRiverPoints?: Point2D[];
  onAddDraftRiverPoint?: (pt: Point2D) => void;
  onFinishDraftRiver?: () => void;
  draftRoutePoints?: Point2D[];
  routeCategory?: RouteClassification;
  onAddDraftRoutePoint?: (pt: Point2D) => void;
  onFinishDraftRoute?: () => void;
  draftBorderPoints?: Point2D[];
  borderDrawMode?: 'brush' | 'polyline';
  onAddDraftBorderPoint?: (pt: Point2D) => void;
  onFinishDraftBorder?: () => void;
  onPlaceMapPin?: (worldX: number, worldY: number) => void;
  onOpenNewWorldModal?: () => void;
}

const BRUSH_MODE_LABELS: Record<PaintBrushMode, string> = {
  inspect: 'Navigate',
  mountain: 'Raise Mountains',
  hill: 'Stamp Hills',
  valley: 'Lower Terrain',
  plateau: 'Plateau Level',
  smooth: 'Smooth Slope',
  ocean: 'Carve Ocean',
  forest: 'Paint Forest',
  tree: 'Stamp Solitary Trees',
  desert: 'Paint Desert',
  snow: 'Paint Tundra & Snow',
  swamp: 'Paint Wetland',
  clear_biome: 'Restore Natural Climate',
  clear_relief: 'Erase Relief Art',
  realm: 'Paint Interstate Border',
  duchy: 'Paint Inter-Duchy Border',
  county: 'Paint County Border',
  draw_border: 'Border Pen & Classifier',
  clear_border: 'Erase Border Override',
  draw_route: 'Draw Route (Overland / Sea)',
  place_burg: 'Stamp Settlement',
  draw_river: 'Draw Custom River',
  place_pin: 'Place Atlas Pin',
};

const SPATIAL_GRID_COLS = 25;
const SPATIAL_GRID_ROWS = 18;

export const MapCanvas = React.forwardRef<MapCanvasHandle, MapCanvasProps>(({
  world,
  isPlaying = false,
  activeLayers,
  onToggleLayer,
  selectedRealmId,
  selectedBurgId,
  circledBurgId,
  selectedCountyId,
  selectedCharacterId,
  selectionFocus: activeSelectionFocus,
  selectedArmyId,
  onSelectBurg,
  onSelectRealm,
  onSelectCounty,
  onSelectArmy,
  onOrderArmyMarch,
  currentSeason = 'Summer',
  activeWeather,
  seasonalState,
  mapStyle: propMapStyle,
  onChangeMapStyle,
  onSelectBlank,
  brushConfig,
  onUpdateBrushConfig,
  onBrushStrokeStart,
  onPaintAtWorld,
  onBrushStrokeEnd,
  onUndoBrush,
  onRedoBrush,
  canUndoBrush,
  canRedoBrush,
  sandboxBrushUnlocked = false,
  onPlaceCustomBurg,
  draftRiverPoints = [],
  onAddDraftRiverPoint,
  onFinishDraftRiver,
  draftRoutePoints = [],
  routeCategory = 'Merchant Road',
  onAddDraftRoutePoint,
  onFinishDraftRoute,
  draftBorderPoints = [],
  borderDrawMode = 'brush',
  onAddDraftBorderPoint,
  onFinishDraftBorder,
  onPlaceMapPin,
  onOpenNewWorldModal,
}, ref) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const staticCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dynamicCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const activeMapStyle: CartographyStyle = propMapStyle || 'atlas';
  const [reliefStyle, setReliefStyle] = useState<ReliefAtlasStyle>('watercolor');
  const [mapMode, setMapMode] = useState<MapMode>('political');
  const [selectionFocus, setSelectionFocus] = useState<'auto' | 'burg' | 'county' | 'duchy' | 'realm'>('auto');
  const [atlasLoadedTick, setAtlasLoadedTick] = useState(0);

  useEffect(() => {
    preloadAllAtlasBrushes();
    const unsub = onAtlasLoaded(() => {
      setAtlasLoadedTick((t) => t + 1);
    });
    return unsub;
  }, []);

  // Camera Pan and Zoom state
  const [zoom, setZoom] = useState(1);
  const [settledZoom, setSettledZoom] = useState(1);
  const zoomRef = useRef(1);
  zoomRef.current = zoom;

  const [fontsLoadedTick, setFontsLoadedTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (typeof document !== 'undefined' && document.fonts) {
      Promise.allSettled([
        document.fonts.load('700 16px "Cinzel"'),
        document.fonts.load('600 14px "Cinzel"'),
        document.fonts.load('600 14px "Lora"'),
        document.fonts.load('500 14px "Lora"'),
        document.fonts.load('italic 500 14px "Lora"'),
        document.fonts.ready,
      ]).then(() => {
        if (!cancelled) setFontsLoadedTick((t) => t + 1);
      });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSettledZoom((prev) => (Math.abs(prev - zoom) > 0.04 ? zoom : prev));
    }, 100);
    return () => window.clearTimeout(timer);
  }, [zoom]);

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [isBrushing, setIsBrushing] = useState(false);
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [hoverContainerPos, setHoverContainerPos] = useState<{ x: number; y: number } | null>(null);
  const isBrushingRef = useRef(false);
  const justPaintedRef = useRef(false);
  const dragStartClientRef = useRef<{ x: number; y: number } | null>(null);
  const paintRafRef = useRef<number | null>(null);
  const latestPaintClientRef = useRef<{ x: number; y: number } | null>(null);

  const brushMode: PaintBrushMode = brushConfig?.brushMode || 'inspect';
  const brushSize = brushConfig?.brushSize ?? 40;
  const brushFalloff = brushConfig?.brushFalloff || 'medium';
  const canUseBrushes = world.appMode === 'builder' || sandboxBrushUnlocked;
  const isBrushToolActive = canUseBrushes && brushMode !== 'inspect';
  const isPlacementTool =
    brushMode === 'place_burg' ||
    brushMode === 'draw_river' ||
    brushMode === 'place_pin' ||
    brushMode === 'draw_route' ||
    (brushMode === 'draw_border' && borderDrawMode === 'polyline');

  // Hover detection
  const [hoveredArmy, setHoveredArmy] = useState<Army | null>(null);
  const [hoveredBurg, setHoveredBurg] = useState<Burg | null>(null);
  const [hoveredRoute, setHoveredRoute] = useState<TradeRoute | null>(null);
  const [hoveredCell, setHoveredCell] = useState<WorldCell | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const visibleEntitiesRef = useRef<{
    realmIds: Set<string>;
    countyIds: Set<string>;
    burgIds: Set<string>;
  }>({
    realmIds: new Set(),
    countyIds: new Set(),
    burgIds: new Set(),
  });

  const BASE_WIDTH = 1000;
  const BASE_HEIGHT = 700;
  const hasFittedInitialRef = useRef(false);

  const computeFitView = useCallback(() => {
    const container = containerRef.current;
    if (!container) return { zoom: 1, pan: { x: 0, y: 0 } };
    const rect = container.getBoundingClientRect();
    const w = rect.width || BASE_WIDTH;
    const h = rect.height || BASE_HEIGHT;
    const fitZoom = Math.max(
      0.5,
      Math.min(2.0, Math.min((w - 28) / BASE_WIDTH, (h - 28) / BASE_HEIGHT))
    );
    return {
      zoom: fitZoom,
      pan: {
        x: (w - BASE_WIDTH * fitZoom) / 2,
        y: (h - BASE_HEIGHT * fitZoom) / 2,
      },
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const applyInitialFit = () => {
      if (hasFittedInitialRef.current) return;
      const rect = container.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 40) return;
      const fit = computeFitView();
      setZoom(fit.zoom);
      setSettledZoom(fit.zoom);
      setPan(fit.pan);
      hasFittedInitialRef.current = true;
    };

    applyInitialFit();
    const ro = new ResizeObserver(() => applyInitialFit());
    ro.observe(container);
    return () => ro.disconnect();
  }, [computeFitView]);

  const screenToWorld = useCallback(
    (clientX: number, clientY: number): Point2D => {
      const container = containerRef.current;
      if (!container) return { x: 0, y: 0 };
      const rect = container.getBoundingClientRect();
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;

      const wx = (sx - pan.x) / zoom;
      const wy = (sy - pan.y) / zoom;
      return { x: wx, y: wy };
    },
    [pan, zoom]
  );

  const cellBucketGrid = useMemo(() => {
    const colW = BASE_WIDTH / SPATIAL_GRID_COLS;
    const rowH = BASE_HEIGHT / SPATIAL_GRID_ROWS;
    const grid: WorldCell[][] = Array.from(
      { length: SPATIAL_GRID_COLS * SPATIAL_GRID_ROWS },
      () => []
    );

    for (const cell of world.cells) {
      const poly = cell.polygon;
      if (!poly || poly.length < 3) continue;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const pt of poly) {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      }
      const c0 = Math.max(0, Math.min(SPATIAL_GRID_COLS - 1, Math.floor(minX / colW)));
      const c1 = Math.max(0, Math.min(SPATIAL_GRID_COLS - 1, Math.floor(maxX / colW)));
      const r0 = Math.max(0, Math.min(SPATIAL_GRID_ROWS - 1, Math.floor(minY / rowH)));
      const r1 = Math.max(0, Math.min(SPATIAL_GRID_ROWS - 1, Math.floor(maxY / rowH)));
      for (let rr = r0; rr <= r1; rr++) {
        for (let cc = c0; cc <= c1; cc++) {
          grid[rr * SPATIAL_GRID_COLS + cc].push(cell);
        }
      }
    }
    return { grid, colW, rowH };
  }, [world.cells]);

  const findCellAtPoint = useCallback(
    (p: Point2D): WorldCell | undefined => {
      if (world.cells.length === 0) return undefined;
      const cc = Math.max(0, Math.min(SPATIAL_GRID_COLS - 1, Math.floor(p.x / cellBucketGrid.colW)));
      const rr = Math.max(0, Math.min(SPATIAL_GRID_ROWS - 1, Math.floor(p.y / cellBucketGrid.rowH)));
      const bucket = cellBucketGrid.grid[rr * SPATIAL_GRID_COLS + cc];
      if (bucket) {
        for (const cell of bucket) {
          if (isPointInPolygon(p, cell.polygon)) return cell;
        }
      }
      return world.cells.find((c) => isPointInPolygon(p, c.polygon));
    },
    [world.cells, cellBucketGrid]
  );

  const zoomTier = zoom < 1.25 ? 1 : zoom < 2.2 ? 2 : 3;

  // Brush keyboard shortcuts: Space to pan, [ / ] to resize, Escape to exit brush
  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.code === 'Space' && isBrushToolActive) {
        e.preventDefault();
        setIsSpaceDown(true);
      } else if (e.key === '[' && isBrushToolActive && onUpdateBrushConfig) {
        e.preventDefault();
        onUpdateBrushConfig({ brushSize: Math.max(10, Math.min(120, brushSize - 6)) });
      } else if (e.key === ']' && isBrushToolActive && onUpdateBrushConfig) {
        e.preventDefault();
        onUpdateBrushConfig({ brushSize: Math.max(10, Math.min(120, brushSize + 6)) });
      } else if (e.key === 'Escape' && isBrushToolActive && onUpdateBrushConfig) {
        onUpdateBrushConfig({ brushMode: 'inspect' });
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpaceDown(false);
    };

    const onBlur = () => setIsSpaceDown(false);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [isBrushToolActive, brushSize, onUpdateBrushConfig]);

  useEffect(() => {
    if (isBrushToolActive) {
      setHoveredArmy(null);
      setHoveredBurg(null);
      setHoveredRoute(null);
      setHoveredCell(null);
    } else {
      isBrushingRef.current = false;
      justPaintedRef.current = false;
      latestPaintClientRef.current = null;
      if (paintRafRef.current !== null) {
        cancelAnimationFrame(paintRafRef.current);
        paintRafRef.current = null;
      }
      setIsBrushing(false);
      setIsSpaceDown(false);
    }
  }, [isBrushToolActive]);

  const staticSeasonalState = useMemo(() => {
    const curSeason = seasonalState?.currentSeason || currentSeason || 'Summer';
    const phase =
      curSeason === 'Spring' ? 0.5 :
      curSeason === 'Summer' ? 1.5 :
      curSeason === 'Autumn' ? 2.5 : 3.5;
    return computeSeasonalState(phase, activeWeather);
  }, [seasonalState?.currentSeason, currentSeason, activeWeather]);

  // =========================================================================
  // 1. STATIC CANVAS (Re-rasterizes sharply at settled zoom levels; zero lag during gesture)
  // =========================================================================
  useEffect(() => {
    const canvas = staticCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.max(1.5, window.devicePixelRatio || 1);
    const staticScale = Math.min(4.5, Math.max(2.0, dpr * Math.max(1, settledZoom)));
    const targetW = Math.round(BASE_WIDTH * staticScale);
    const targetH = Math.round(BASE_HEIGHT * staticScale);

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.save();
    ctx.scale(staticScale, staticScale);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

    const { mesh, sim } =
      world.mesh && world.sim ? { mesh: world.mesh, sim: world.sim } : getCachedTerrainSim();

    if (mesh && sim) {
      const atlasOptions: AtlasRenderOptions = {
        renderMode: 'static',
        mapMode,
        mapStyle: activeMapStyle,
        cultures: world.cultures,
        religions: world.religions,
        activeLayers: {
          political: activeLayers.political,
          feudal: activeLayers.feudal,
          heightmap: activeLayers.heightmap,
          biomes: activeLayers.biomes,
          rainfall: activeLayers.rainfall,
          wind: activeLayers.wind,
          burgs: activeLayers.burgs,
          rivers: activeLayers.rivers,
          relief: activeLayers.relief,
          reliefMountains: activeLayers.reliefMountains,
          reliefHills: activeLayers.reliefHills,
          reliefForests: activeLayers.reliefForests,
          reliefTrees: activeLayers.reliefTrees,
          reliefSwamps: activeLayers.reliefSwamps,
          routes: activeLayers.routes !== false,
          caravans: activeLayers.caravans !== false,
          contours: !!activeLayers.contours,
          textures: !!activeLayers.textures,
          density: mapMode === 'population' || !!activeLayers.density,
          weather: activeLayers.weather !== false,
          provinces: !!activeLayers.provinces,
          epidemics: activeLayers.epidemics !== false,
          banners: activeLayers.banners !== false,
          devastation: !!activeLayers.devastation,
        },
        seaLevel: world.settings.terrainSim?.seaLevel || 0.28,
        reliefStyle,
        selectedRealmId,
        selectedBurgId,
        circledBurgId,
        selectedCountyId,
        selectedCharacterId,
        selectionFocus: activeSelectionFocus,
        worldName: world.realms[0]?.name.replace(/^(Kingdom of|High Realm of|Archduchy of)\s*/i, '') || 'Uncharted Atlas',
        currentYear: world.currentYear,
        tradeNetwork: world.tradeNetwork,
        caravanTick: 0,
        season: staticSeasonalState.currentSeason,
        seasonal: staticSeasonalState,
        weatherEvent: activeWeather,
        windAngleDeg: world.settings.terrainSim?.windAngleDeg || 30,
        provinces: world.provinces,
        epidemics: world.epidemics,
        lockedDownProvinces: world.lockedDownProvinces,
        characters: world.characters,
        customRivers: world.customRivers,
        customBorders: world.customBorders,
        borderKindOverrides: world.borderKindOverrides,
        zoomLevel:
          zoomTier === 3
            ? Math.max(2.2, settledZoom)
            : zoomTier === 2
            ? Math.min(2.19, Math.max(1.25, settledZoom))
            : Math.min(1.24, settledZoom),
        visibleEntities: visibleEntitiesRef.current,
        paintRevision: world.paintRevision || 0,
      };

      renderAtlasMap(
        ctx,
        mesh,
        sim,
        world.burgs,
        world.realms,
        world.counties,
        world.cells,
        atlasOptions,
        BASE_WIDTH,
        BASE_HEIGHT
      );
    }

    ctx.restore();
  }, [
    world.settings.seed,
    world.currentYear,
    world.paintRevision,
    world.territoryRevision,
    world.burgRevision,
    world.customRivers,
    world.customBorders,
    world.borderKindOverrides,
    world.tradeNetwork?.routes?.length,
    world.epidemics?.length,
    Object.keys(world.lockedDownProvinces || {}).length,
    settledZoom,
    selectedRealmId,
    selectedBurgId,
    circledBurgId,
    selectedCountyId,
    selectedCharacterId,
    activeSelectionFocus,
    mapMode,
    activeMapStyle,
    reliefStyle,
    atlasLoadedTick,
    fontsLoadedTick,
    zoomTier,
    activeLayers.political,
    activeLayers.feudal,
    activeLayers.heightmap,
    activeLayers.biomes,
    activeLayers.rainfall,
    activeLayers.wind,
    activeLayers.burgs,
    activeLayers.rivers,
    activeLayers.relief,
    activeLayers.reliefMountains,
    activeLayers.reliefHills,
    activeLayers.reliefForests,
    activeLayers.reliefTrees,
    activeLayers.reliefSwamps,
    activeLayers.routes,
    activeLayers.contours,
    activeLayers.textures,
    activeLayers.density,
    activeLayers.weather,
    activeLayers.banners,
    activeLayers.devastation,
    staticSeasonalState.currentSeason,
  ]);

  const activeSelectionMask = useMemo<SelectedTerritoryMask | null>(() => {
    return resolveSelectedTerritoryMask({
      selectionFocus: activeSelectionFocus,
      selectedCountyId,
      selectedBurgId,
      selectedCharacterId,
      counties: world.counties,
      burgs: world.burgs,
      characters: world.characters,
      cells: world.cells,
    });
  }, [
    activeSelectionFocus,
    selectedCountyId,
    selectedBurgId,
    selectedCharacterId,
    world.counties,
    world.burgs,
    world.characters,
    world.cells,
  ]);

  const hoveredTerritoryMask = useMemo<SelectedTerritoryMask | null>(() => {
    if (isBrushToolActive || isPanning) return null;
    const seaLevel = world.settings.terrainSim?.seaLevel || 0.28;
    return resolveHoveredTerritoryMask({
      hoveredCell,
      hoveredBurg,
      zoom,
      seaLevel,
      counties: world.counties,
      burgs: world.burgs,
      realms: world.realms,
      characters: world.characters,
      cells: world.cells,
      activeSelectionMask,
    });
  }, [
    hoveredCell,
    hoveredBurg,
    zoom,
    isBrushToolActive,
    isPanning,
    world.settings.terrainSim?.seaLevel,
    world.counties,
    world.burgs,
    world.characters,
    world.cells,
    activeSelectionMask,
  ]);

  // Continuous Dynamic Canvas State Ref (ensures RAF loop never cancels or resets time on seasonal updates)
  const dynamicStateRef = useRef({
    world,
    isPlaying,
    activeLayers,
    seasonalState,
    currentSeason,
    activeWeather,
    selectedArmyId,
    hoveredTerritoryMask,
    draftRiverPoints,
    draftRoutePoints,
    draftBorderPoints,
    routeCategory,
    activeMapStyle,
  });

  useEffect(() => {
    dynamicStateRef.current = {
      world,
      isPlaying,
      activeLayers,
      seasonalState,
      currentSeason,
      activeWeather,
      selectedArmyId,
      hoveredTerritoryMask,
      draftRiverPoints,
      draftRoutePoints,
      draftBorderPoints,
      routeCategory,
      activeMapStyle,
    };
  });

  // =========================================================================
  // 2. DYNAMIC CANVAS (Caravans, Armies, Weather Particles - Continuous 60fps RAF)
  // =========================================================================
  useEffect(() => {
    const canvas = dynamicCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId: number;
    let animTime = 0;
    let lastTime = performance.now();
    let lastDynamicSig = '';

    const renderDynamicFrame = (now: number) => {
      const state = dynamicStateRef.current;
      const rawDt = Math.min(0.1, Math.max(0, (now - lastTime) * 0.001));
      lastTime = now;
      // Halt caravans, weather, and map motion completely when paused or on the starting screen
      const dt = state.isPlaying ? rawDt : 0;
      animTime += dt;

      const dpr = Math.max(1.5, window.devicePixelRatio || 1);
      const dynScale = Math.min(3.5, Math.max(2.0, dpr * Math.min(2.0, Math.max(1, zoomRef.current))));
      const targetW = Math.round(BASE_WIDTH * dynScale);
      const targetH = Math.round(BASE_HEIGHT * dynScale);

      // Idle GPU gate: when paused and nothing dynamic changed, skip redundant canvas redraws
      if (!state.isPlaying) {
        const hoverKey = state.hoveredTerritoryMask
          ? `${state.hoveredTerritoryMask.kind}:${state.hoveredTerritoryMask.label}`
          : '';
        const occupiedCount = (state.world.holdings || []).filter((h) => Boolean(h.occupiedByRealmId)).length;
        const sig = [
          targetW,
          targetH,
          state.world.currentYear,
          state.world.paintRevision || 0,
          state.world.territoryRevision || 0,
          state.world.burgRevision || 0,
          state.world.appMode || 'game',
          state.activeMapStyle,
          state.world.mapPins?.length || 0,
          state.world.customRivers?.length || 0,
          state.world.customBorders?.length || 0,
          state.draftRiverPoints?.length || 0,
          state.draftRoutePoints?.length || 0,
          state.draftBorderPoints?.length || 0,
          state.routeCategory,
          state.world.armies?.length || 0,
          occupiedCount,
          state.selectedArmyId || '',
          hoverKey,
          state.activeLayers.devastation ? 1 : 0,
          state.activeLayers.weather !== false ? 1 : 0,
          state.activeLayers.wind ? 1 : 0,
          state.activeLayers.provinces !== false ? 1 : 0,
          state.activeLayers.epidemics !== false ? 1 : 0,
          state.activeLayers.caravans ? 1 : 0,
          state.currentSeason || '',
          state.activeWeather || '',
          Math.round(zoomRef.current * 20),
        ].join('|');
        if (sig === lastDynamicSig && canvas.width === targetW && canvas.height === targetH) {
          rafId = requestAnimationFrame(renderDynamicFrame);
          return;
        }
        lastDynamicSig = sig;
      } else {
        lastDynamicSig = '';
      }

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      ctx.save();
      ctx.clearRect(0, 0, targetW, targetH);
      ctx.scale(dynScale, dynScale);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const visualCaravans = FlowEconomyEngine.stepVisualCaravans(state.world, dt);

      const { mesh, sim } =
        state.world.mesh && state.world.sim
          ? { mesh: state.world.mesh, sim: state.world.sim }
          : getCachedTerrainSim();

      if (mesh && sim) {
        const dynamicTradeNetwork = state.world.tradeNetwork
          ? { ...state.world.tradeNetwork, caravans: visualCaravans }
          : undefined;
        const dynamicOpts: AtlasRenderOptions = {
          renderMode: 'dynamic',
          mapStyle: state.activeMapStyle,
          activeLayers: state.activeLayers,
          seaLevel: state.world.settings.terrainSim?.seaLevel || 0.28,
          worldName: '',
          currentYear: state.world.currentYear || 0,
          tradeNetwork: dynamicTradeNetwork,
          caravanTick: animTime,
          season: state.seasonalState?.currentSeason || state.currentSeason,
          seasonal: state.seasonalState,
          weatherEvent: state.activeWeather,
          provinces: state.world.provinces,
          holdings: state.world.holdings,
          epidemics: state.world.epidemics,
          lockedDownProvinces: state.world.lockedDownProvinces,
          characters: state.world.characters,
          armies: state.world.armies,
          selectedArmyId: state.selectedArmyId,
          hoveredTerritoryMask: state.hoveredTerritoryMask,
          zoomLevel: zoomRef.current,
          isBuilderMode: state.world.appMode === 'builder',
          mapPins: state.world.mapPins,
          customRivers: state.world.customRivers,
          customBorders: state.world.customBorders,
          borderKindOverrides: state.world.borderKindOverrides,
        };
        renderAtlasMap(
          ctx,
          mesh,
          sim,
          state.world.burgs,
          state.world.realms,
          state.world.counties,
          state.world.cells,
          dynamicOpts,
          BASE_WIDTH,
          BASE_HEIGHT
        );
      }

      // Live dashed preview for River Pen draft points
      if (state.draftRiverPoints && state.draftRiverPoints.length > 0) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (state.draftRiverPoints.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(state.draftRiverPoints[0].x, state.draftRiverPoints[0].y);
          for (let i = 1; i < state.draftRiverPoints.length; i++) {
            ctx.lineTo(state.draftRiverPoints[i].x, state.draftRiverPoints[i].y);
          }
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
          ctx.lineWidth = 2.6;
          ctx.setLineDash([5, 4]);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        for (const pt of state.draftRiverPoints) {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 3.2, 0, Math.PI * 2);
          ctx.fillStyle = '#bae6fd';
          ctx.fill();
          ctx.strokeStyle = '#0369a1';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.restore();
      }

      // Live dashed preview for Overland & Maritime Route Drafting
      if (state.draftRoutePoints && state.draftRoutePoints.length > 0) {
        const isSeaDraft = state.routeCategory === 'Maritime Sea Lane';
        const isRiverDraft = state.routeCategory === 'River Barge Route';
        const strokeColor = isSeaDraft
          ? 'rgba(56, 189, 248, 0.92)'
          : isRiverDraft
          ? 'rgba(45, 212, 191, 0.92)'
          : 'rgba(245, 158, 11, 0.92)';
        const dotFill = isSeaDraft ? '#bae6fd' : isRiverDraft ? '#99f6e4' : '#fde68a';
        const dotStroke = isSeaDraft ? '#0284c7' : isRiverDraft ? '#0f766e' : '#92400e';
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (state.draftRoutePoints.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(state.draftRoutePoints[0].x, state.draftRoutePoints[0].y);
          for (let i = 1; i < state.draftRoutePoints.length; i++) {
            ctx.lineTo(state.draftRoutePoints[i].x, state.draftRoutePoints[i].y);
          }
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = 2.4;
          ctx.setLineDash([5, 4]);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        for (const pt of state.draftRoutePoints) {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 3.4, 0, Math.PI * 2);
          ctx.fillStyle = dotFill;
          ctx.fill();
          ctx.strokeStyle = dotStroke;
          ctx.lineWidth = 1.1;
          ctx.stroke();
        }
        ctx.restore();
      }

      // Live dashed preview for Custom Border Polyline Drafting
      if (state.draftBorderPoints && state.draftBorderPoints.length > 0) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (state.draftBorderPoints.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(state.draftBorderPoints[0].x, state.draftBorderPoints[0].y);
          for (let i = 1; i < state.draftBorderPoints.length; i++) {
            ctx.lineTo(state.draftBorderPoints[i].x, state.draftBorderPoints[i].y);
          }
          ctx.strokeStyle = 'rgba(244, 63, 94, 0.9)';
          ctx.lineWidth = 2.2;
          ctx.setLineDash([6, 4]);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        for (const pt of state.draftBorderPoints) {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 3.2, 0, Math.PI * 2);
          ctx.fillStyle = '#fecdd3';
          ctx.fill();
          ctx.strokeStyle = '#9f1239';
          ctx.lineWidth = 1.1;
          ctx.stroke();
        }
        ctx.restore();
      }

      ctx.restore();
      rafId = requestAnimationFrame(renderDynamicFrame);
    };

    rafId = requestAnimationFrame(renderDynamicFrame);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, []); // Mounts once and runs continuously without interruptions!

  // Mouse & Navigation Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    const shouldPan = e.button === 1 || e.button === 2 || !isBrushToolActive || isSpaceDown;
    if (shouldPan) {
      dragStartClientRef.current = { x: e.clientX, y: e.clientY };
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    if (e.button === 0 && isBrushToolActive) {
      e.preventDefault();
      const wm = screenToWorld(e.clientX, e.clientY);
      if (isPlacementTool) {
        justPaintedRef.current = true;
        if (brushMode === 'place_burg') {
          onPlaceCustomBurg?.(wm.x, wm.y);
        } else if (brushMode === 'place_pin') {
          onPlaceMapPin?.(wm.x, wm.y);
        } else if (brushMode === 'draw_river') {
          onAddDraftRiverPoint?.(wm);
        } else if (brushMode === 'draw_route') {
          onAddDraftRoutePoint?.(wm);
        } else if (brushMode === 'draw_border' && borderDrawMode === 'polyline') {
          onAddDraftBorderPoint?.(wm);
        }
        return;
      }
      isBrushingRef.current = true;
      justPaintedRef.current = true;
      setIsBrushing(true);
      onBrushStrokeStart?.();
      onPaintAtWorld?.(wm.x, wm.y);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
    const container = containerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      setHoverContainerPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }

    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
      return;
    }

    if (isBrushingRef.current) {
      latestPaintClientRef.current = { x: e.clientX, y: e.clientY };
      if (paintRafRef.current === null) {
        paintRafRef.current = requestAnimationFrame(() => {
          paintRafRef.current = null;
          if (!isBrushingRef.current || !latestPaintClientRef.current) return;
          const wm = screenToWorld(
            latestPaintClientRef.current.x,
            latestPaintClientRef.current.y
          );
          onPaintAtWorld?.(wm.x, wm.y);
        });
      }
      return;
    }

    if (isBrushToolActive) {
      return;
    }

    const wm = screenToWorld(e.clientX, e.clientY);
    const vis = visibleEntitiesRef.current;
    const { mesh, sim } =
      world.mesh && world.sim ? { mesh: world.mesh, sim: world.sim } : getCachedTerrainSim();
    const seaLevel = world.settings.terrainSim?.seaLevel || 0.28;

    let foundArmy: Army | null = null;
    let bestArmyHoverDist = 18 / Math.pow(Math.max(1, zoom), 0.45);
    for (const army of world.armies || []) {
      const pos = getArmyPositionAtProgress(army);
      const d = Math.hypot(pos.x - wm.x, pos.y - wm.y);
      if (d < bestArmyHoverDist) {
        bestArmyHoverDist = d;
        foundArmy = army;
      }
    }
    setHoveredArmy(foundArmy);

    const effectiveHoverTier: 'realm' | 'duchy' | 'county' | 'burg' =
      selectionFocus === 'realm'
        ? 'realm'
        : selectionFocus === 'duchy'
        ? 'duchy'
        : selectionFocus === 'county'
        ? 'county'
        : selectionFocus === 'burg'
        ? 'burg'
        : zoom < 1.25
        ? 'duchy'
        : zoom < 2.2
        ? 'county'
        : 'burg';

    let foundBurg: Burg | null = null;
    const canInteractWithBurgs =
      activeLayers.burgs !== false &&
      (selectionFocus === 'burg' || (selectionFocus === 'auto' && zoom >= 2.2));
    if (!foundArmy && canInteractWithBurgs) {
      // Consistent screen-space hover radius when zoomed in to settlement level
      const baseScreenRadius = 18;
      let bestHoverScore = baseScreenRadius / Math.max(0.6, zoom);
      for (const burg of world.burgs) {
        const by = burg.y;
        const iconDist = Math.hypot(burg.x - wm.x, by - wm.y);
        // Also allow hovering the village/city name directly below the icon at close zoom
        let effectiveDist = iconDist;
        if (zoom >= 1.9) {
          const labelY = by + (burg.isCapital ? 19 : 13);
          const dxLabel = Math.abs(wm.x - burg.x);
          const dyLabel = Math.abs(wm.y - labelY);
          const labelHalfW = Math.max(14, (burg.name.length * 3.2) / Math.max(0.85, zoom));
          const labelHalfH = 7.5 / Math.max(0.85, zoom);
          if (dxLabel <= labelHalfW && dyLabel <= labelHalfH) {
            effectiveDist = Math.min(effectiveDist, Math.hypot(dxLabel * 0.35, dyLabel));
          }
        }
        if (effectiveDist < bestHoverScore) {
          bestHoverScore = effectiveDist;
          foundBurg = burg;
        }
      }
    }
    setHoveredBurg(foundBurg);

    let foundRoute: TradeRoute | null = null;
    if (!foundArmy && !foundBurg && world.tradeNetwork && activeLayers.routes !== false) {
      for (const route of world.tradeNetwork.routes) {
        if (zoomTier === 1 && route.type !== 'Imperial Highway' && !(route.type === 'Maritime Sea Lane' && route.distanceKm >= 220)) {
          continue;
        }
        for (let i = 0; i < route.pathPoints.length; i += 2) {
          const pt = route.pathPoints[i];
          if (Math.hypot(pt.x - wm.x, pt.y - wm.y) < 9 / Math.pow(Math.max(1, zoom), 0.35)) {
            foundRoute = route;
            break;
          }
        }
        if (foundRoute) break;
      }
    }
    setHoveredRoute(foundRoute);

    if (!foundArmy && !foundBurg && !foundRoute && world.cells.length > 0) {
      const cell = findCellAtPoint(wm);
      setHoveredCell(cell || null);
    } else {
      setHoveredCell(null);
    }
  };

  const handleMouseUp = (e?: React.MouseEvent) => {
    if (isBrushingRef.current) {
      isBrushingRef.current = false;
      setIsBrushing(false);
      if (paintRafRef.current !== null) {
        cancelAnimationFrame(paintRafRef.current);
        paintRafRef.current = null;
      }
      onBrushStrokeEnd?.();
      window.setTimeout(() => {
        justPaintedRef.current = false;
      }, 60);
    }

    if (
      e &&
      e.button === 2 &&
      !isBrushToolActive &&
      selectedArmyId &&
      onOrderArmyMarch &&
      dragStartClientRef.current
    ) {
      const moved = Math.hypot(
        e.clientX - dragStartClientRef.current.x,
        e.clientY - dragStartClientRef.current.y
      );
      if (moved <= 5) {
        dragStartClientRef.current = null;
        const wm = screenToWorld(e.clientX, e.clientY);
        const { mesh, sim } =
          world.mesh && world.sim ? { mesh: world.mesh, sim: world.sim } : getCachedTerrainSim();
        const seaLevel = world.settings.terrainSim?.seaLevel || 0.28;
        let nearestBurg: Burg | undefined;
        let bestDist = 26 / Math.sqrt(Math.max(0.6, zoom));
        for (const burg of world.burgs) {
          const d = Math.hypot(burg.x - wm.x, burg.y - wm.y);
          if (d < bestDist) {
            bestDist = d;
            nearestBurg = burg;
          }
        }
        onOrderArmyMarch(
          selectedArmyId,
          nearestBurg ? nearestBurg.x : wm.x,
          nearestBurg ? nearestBurg.y : wm.y,
          nearestBurg?.id
        );
      }
    }

    setIsPanning(false);
  };

  const handleMouseLeave = () => {
    setHoverContainerPos(null);
    setHoveredArmy(null);
    setHoveredBurg(null);
    setHoveredRoute(null);
    setHoveredCell(null);
    handleMouseUp();
  };

  const resolveDuchyForCell = useCallback(
    (cell: WorldCell | undefined): County | undefined => {
      if (!cell?.countyId) return undefined;
      const cellCounty = world.counties.find((c) => c.id === cell.countyId);
      if (!cellCounty) return undefined;
      if (cellCounty.tier === 'Duchy' || cellCounty.name.includes('Duchy')) return cellCounty;
      if (cellCounty.duchyId) {
        return world.counties.find(
          (c) => (c.tier === 'Duchy' || c.name.includes('Duchy')) && c.duchyId === cellCounty.duchyId
        );
      }
      return undefined;
    },
    [world.counties]
  );

  const handleClick = (e: React.MouseEvent) => {
    if (isBrushToolActive || justPaintedRef.current) {
      justPaintedRef.current = false;
      return;
    }

    if (dragStartClientRef.current) {
      const moved = Math.hypot(
        e.clientX - dragStartClientRef.current.x,
        e.clientY - dragStartClientRef.current.y
      );
      dragStartClientRef.current = null;
      if (moved > 10) return;
    }

    const wm = screenToWorld(e.clientX, e.clientY);
    const vis = visibleEntitiesRef.current;
    const { mesh, sim } =
      world.mesh && world.sim ? { mesh: world.mesh, sim: world.sim } : getCachedTerrainSim();
    const seaLevel = world.settings.terrainSim?.seaLevel || 0.28;

    // 0. Interactive Army hit-testing (checked first)
    if (onSelectArmy && world.armies && world.armies.length > 0) {
      const armyTolerance = 18 / Math.pow(Math.max(0.8, zoom), 0.55);
      let closestArmy: Army | null = null;
      let closestArmyDist = armyTolerance;
      for (const army of world.armies) {
        const pos = getArmyPositionAtProgress(army);
        const d = Math.hypot(pos.x - wm.x, pos.y - wm.y);
        if (d < closestArmyDist) {
          closestArmyDist = d;
          closestArmy = army;
        }
      }
      if (closestArmy) {
        onSelectArmy(closestArmy);
        return;
      }
    }

    const cell = findCellAtPoint(wm);

    // 1. Direct Settlement / Village hit-testing BEFORE water check so coastal villages & ports always select on 1 click
    const activeTerritoryMask = resolveSelectedTerritoryMask({
      selectionFocus: activeSelectionFocus,
      selectedCountyId,
      selectedBurgId,
      selectedCharacterId,
      counties: world.counties,
      burgs: world.burgs,
      characters: world.characters,
      cells: world.cells,
    });

    let closestBurg: Burg | null = null;
    const canSelectBurgs =
      activeLayers.burgs !== false &&
      (selectionFocus === 'burg' || (selectionFocus === 'auto' && zoom >= 2.2));
    if (canSelectBurgs) {
      // Generous screen-space hit radius when zoomed in to settlement level so any village selects cleanly on 1 click
      const clickScreenRadius = selectionFocus === 'burg' ? 26 : 22;
      let closestDist = Math.max(clickScreenRadius / Math.max(0.65, zoom), 9);
      for (const burg of world.burgs) {
        const by = burg.y;
        let effectiveDist = Math.hypot(burg.x - wm.x, by - wm.y);

        // Also match clicks on the settlement's label right below the icon
        if (zoom >= 1.9) {
          const labelY = by + (burg.isCapital ? 19 : 13);
          const dxLabel = Math.abs(wm.x - burg.x);
          const dyLabel = Math.abs(wm.y - labelY);
          const labelHalfW = Math.max(16, (burg.name.length * 3.5) / Math.max(0.85, zoom));
          const labelHalfH = 8.5 / Math.max(0.85, zoom);
          if (dxLabel <= labelHalfW && dyLabel <= labelHalfH) {
            effectiveDist = Math.min(effectiveDist, Math.hypot(dxLabel * 0.3, dyLabel));
          }
        }

        if (effectiveDist < closestDist) {
          closestDist = effectiveDist;
          closestBurg = burg;
        }
      }
    }

    if (closestBurg) {
      const burgInsideActiveSelection = Boolean(
        activeTerritoryMask &&
          ((cell && activeTerritoryMask.cellSet.has(cell.index)) ||
            (closestBurg.cellIndex !== undefined && activeTerritoryMask.cellSet.has(closestBurg.cellIndex)) ||
            closestBurg.cellIndices?.some((idx) => activeTerritoryMask.cellSet.has(idx)))
      );
      onSelectArmy?.(null);
      onSelectBurg(closestBurg, {
        preserveTerritory: burgInsideActiveSelection,
        circleBurg: true,
      });
      return;
    }

    // 2. Spatial-indexed Voronoi cell lookup (clicking open water deselects)
    if (!cell || cell.elevation < seaLevel) {
      onSelectArmy?.(null);
      if (onSelectBlank) onSelectBlank();
      return;
    }

    // 3. Clicking empty land selects ONLY the highlighted Duchy (Macro) or County (Meso/Micro), without circling any settlement
    const cellCounty = cell.countyId
      ? world.counties.find((c) => c.id === cell.countyId)
      : undefined;
    const cellDuchy = resolveDuchyForCell(cell);
    const cellRealm = cell.realmId
      ? world.realms.find((r) => r.id === cell.realmId)
      : undefined;

    // Clicking a County INSIDE an already-selected Duchy drills down and selects ONLY that County!
    const clickingInsideSelectedDuchy = Boolean(
      activeTerritoryMask &&
        activeTerritoryMask.kind === 'duchy' &&
        activeTerritoryMask.cellSet.has(cell.index)
    );
    if (clickingInsideSelectedDuchy && cellCounty && selectionFocus !== 'realm') {
      onSelectArmy?.(null);
      onSelectCounty(cellCounty, 'county');
      return;
    }

    if (selectionFocus === 'duchy') {
      if (cellDuchy) {
        onSelectArmy?.(null);
        onSelectCounty(cellDuchy, 'duchy');
        return;
      }
      if (cellCounty) {
        onSelectArmy?.(null);
        onSelectCounty(cellCounty, 'county');
        return;
      }
    } else if (selectionFocus === 'county') {
      if (cellCounty) {
        onSelectArmy?.(null);
        onSelectCounty(cellCounty, 'county');
        return;
      }
    } else if (selectionFocus === 'realm') {
      if (cellRealm) {
        onSelectArmy?.(null);
        onSelectRealm(cellRealm);
        return;
      }
    } else {
      // 'auto' focus matches hover highlight 1-to-1:
      //   Zoomed-Out Macro (<1.25x): State / Realm (click anywhere in a realm to select the State!)
      //   Meso (1.25x–1.9x): Duchy
      //   Micro (>=1.9x): County (strictly single county)
      if (zoom < 1.25 && cellRealm) {
        onSelectArmy?.(null);
        onSelectRealm(cellRealm);
        return;
      }
      if (activeLayers.feudal && cellCounty) {
        if (zoom < 1.9) {
          if (cellDuchy) {
            onSelectArmy?.(null);
            onSelectCounty(cellDuchy, 'duchy');
            return;
          }
        }
        onSelectArmy?.(null);
        onSelectCounty(cellCounty, 'county');
        return;
      }
    }

    if (cellRealm && (vis.realmIds.has(cellRealm.id) || vis.realmIds.size === 0 || selectionFocus === 'auto')) {
      onSelectArmy?.(null);
      onSelectRealm(cellRealm);
      return;
    }

    onSelectArmy?.(null);
    if (onSelectBlank) onSelectBlank();
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.88;
    const newZoom = Math.max(0.5, Math.min(4.5, zoom * zoomFactor));

    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    setPan({
      x: mouseX - (mouseX - pan.x) * (newZoom / zoom),
      y: mouseY - (mouseY - pan.y) * (newZoom / zoom),
    });
    setZoom(newZoom);
  };

  const resetView = useCallback(() => {
    const fit = computeFitView();
    setZoom(fit.zoom);
    setSettledZoom(fit.zoom);
    setPan(fit.pan);
  }, [computeFitView]);

  const centerOnPoint = useCallback((worldX: number, worldY: number, targetZoom = 1.45) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const clampedZoom = Math.max(0.5, Math.min(4.5, targetZoom));
    setPan({
      x: rect.width / 2 - worldX * clampedZoom,
      y: rect.height / 2 - worldY * clampedZoom,
    });
    setZoom(clampedZoom);
  }, []);

  const centerOnBurg = useCallback((burg: Burg) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const targetZoom = 1.6;
    setPan({
      x: rect.width / 2 - burg.x * targetZoom,
      y: rect.height / 2 - burg.y * targetZoom,
    });
    setZoom(targetZoom);
  }, []);

  const centerOnCounty = useCallback((county: County) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const caput = world.burgs.find((b) => b.id === county.capitalBurgId || b.name === county.capitalBurgId);
    let targetX = 500;
    let targetY = 350;
    if (caput) {
      targetX = caput.x;
      targetY = caput.y;
    } else {
      const countyCells = world.cells.filter((c) => county.cellIndices.includes(c.index));
      if (countyCells.length > 0) {
        targetX = countyCells.reduce((acc, c) => acc + c.x, 0) / countyCells.length;
        targetY = countyCells.reduce((acc, c) => acc + c.y, 0) / countyCells.length;
      }
    }
    const targetZoom = 1.35;
    setPan({
      x: rect.width / 2 - targetX * targetZoom,
      y: rect.height / 2 - targetY * targetZoom,
    });
    setZoom(targetZoom);
  }, [world.burgs, world.cells]);

  const centerOnRealm = useCallback((realm: Realm) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const caput = world.burgs.find((b) => b.id === realm.capitalBurgId);
    let targetX = 500;
    let targetY = 350;
    if (caput) {
      targetX = caput.x;
      targetY = caput.y;
    } else {
      const realmCells = world.cells.filter((c) => c.realmId === realm.id);
      if (realmCells.length > 0) {
        targetX = realmCells.reduce((acc, c) => acc + c.x, 0) / realmCells.length;
        targetY = realmCells.reduce((acc, c) => acc + c.y, 0) / realmCells.length;
      }
    }
    const targetZoom = 1.05;
    setPan({
      x: rect.width / 2 - targetX * targetZoom,
      y: rect.height / 2 - targetY * targetZoom,
    });
    setZoom(targetZoom);
  }, [world.burgs, world.cells]);

  useImperativeHandle(
    ref,
    () => ({
      centerOnBurg,
      centerOnCounty,
      centerOnRealm,
      centerOnPoint,
      resetView,
    }),
    [centerOnBurg, centerOnCounty, centerOnRealm, centerOnPoint, resetView]
  );

  const selectedRealm = world.realms.find((r) => r.id === selectedRealmId);
  const selectedCounty = world.counties.find((c) => c.id === selectedCountyId);
  const selectedBurg = world.burgs.find((b) => b.id === selectedBurgId);

  const reticleColor = useMemo(() => {
    if (brushMode === 'realm') {
      const r = world.realms.find((rm) => rm.id === brushConfig?.targetRealmId);
      return r?.color || '#f59e0b';
    }
    if (brushMode === 'duchy') return '#f59e0b';
    if (brushMode === 'county') return '#c084fc';
    if (brushMode === 'draw_border') return '#fb7185';
    if (brushMode === 'clear_border' || brushMode === 'clear_relief') return '#f87171';
    if (brushMode === 'draw_route') return routeCategory === 'Maritime Sea Lane' ? '#38bdf8' : '#f59e0b';
    if (brushMode === 'valley' || brushMode === 'ocean' || brushMode === 'draw_river') return '#38bdf8';
    if (brushMode === 'forest' || brushMode === 'tree') return '#4ade80';
    if (brushMode === 'hill') return '#d97706';
    if (brushMode === 'desert') return '#fbbf24';
    if (brushMode === 'snow') return '#f8fafc';
    if (brushMode === 'swamp') return '#2dd4bf';
    if (brushMode === 'smooth' || brushMode === 'clear_biome') return '#d6d3d1';
    return '#f59e0b';
  }, [brushMode, brushConfig?.targetRealmId, world.realms, routeCategory]);

  const screenBrushRadius = isPlacementTool ? 10 : brushSize * zoom;
  const falloffRatio = brushFalloff === 'soft' ? 0.35 : brushFalloff === 'hard' ? 0.76 : 0.55;

  const containerCursorClass = isPanning
    ? 'cursor-grabbing'
    : isBrushToolActive
    ? isSpaceDown
      ? 'cursor-grab'
      : isPlacementTool
      ? 'cursor-crosshair'
      : 'cursor-none'
    : hoveredBurg || hoveredArmy
    ? 'cursor-pointer'
    : 'cursor-grab active:cursor-grabbing';

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full bg-[#121c24] overflow-hidden select-none ${containerCursorClass}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onDoubleClick={(e) => {
        if (!isBrushToolActive) return;
        if (brushMode === 'draw_river') {
          e.preventDefault();
          onFinishDraftRiver?.();
        } else if (brushMode === 'draw_route') {
          e.preventDefault();
          onFinishDraftRoute?.();
        } else if (brushMode === 'draw_border' && borderDrawMode === 'polyline') {
          e.preventDefault();
          onFinishDraftBorder?.();
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
      }}
      onClick={handleClick}
      onWheel={handleWheel}
    >
      {/* Blank Ocean Canvas Helper Banner */}
      {/* Top HUD Track: Cartographic Style, Selection Focus & Active Mode Banner (never overlaps FloatingToolbar) */}
      <div className="absolute top-3 left-3 right-16 z-20 flex flex-col items-start gap-2 pointer-events-none">
        <div
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="flex flex-wrap items-center gap-2 max-w-full pointer-events-auto"
        >
          {onChangeMapStyle && (
            <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-stone-950/90 backdrop-blur-md border border-stone-800/80 text-xs shadow-lg cursor-pointer">
              <span className="text-[11px] text-stone-400">Style</span>
              <select
                aria-label="Cartographic Map Type"
                value={activeMapStyle === 'relief' ? 'atlas' : activeMapStyle}
                onChange={(e) => onChangeMapStyle(e.target.value as CartographyStyle)}
                className="bg-transparent text-amber-200 font-medium focus:outline-none cursor-pointer"
              >
                <option value="atlas" className="bg-stone-950 text-stone-100">Atlas</option>
                <option value="parchment" className="bg-stone-950 text-stone-100">Parchment</option>
                <option value="vintage" className="bg-stone-950 text-stone-100">Vintage</option>
                <option value="ink" className="bg-stone-950 text-stone-100">Ink</option>
                <option value="hand_drawn" className="bg-stone-950 text-stone-100">Hand-Drawn</option>
              </select>
            </label>
          )}

          {activeLayers.relief && (
            <button
              type="button"
              onClick={() => setReliefStyle(reliefStyle === 'watercolor' ? 'engraved' : 'watercolor')}
              title="Toggle Painted vs Ink Relief Style"
              className="px-2.5 py-1 rounded-lg bg-stone-950/90 backdrop-blur-md border border-stone-800/80 text-xs font-medium text-amber-200 hover:border-amber-500/50 shadow-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              {reliefStyle === 'watercolor' ? 'Relief: Painted' : 'Relief: Ink'}
            </button>
          )}

          <label
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-stone-950/90 backdrop-blur-md border border-stone-800/80 text-xs shadow-lg cursor-pointer"
            title="Choose what territory tier a map click selects"
          >
            <span className="text-[11px] text-stone-400">Select</span>
            <select
              aria-label="Selection Focus"
              value={selectionFocus}
              onChange={(e) => setSelectionFocus(e.target.value as 'auto' | 'burg' | 'county' | 'duchy' | 'realm')}
              className="bg-transparent text-stone-100 font-medium focus:outline-none cursor-pointer"
            >
              <option value="auto" className="bg-stone-950 text-stone-100">Auto</option>
              <option value="burg" className="bg-stone-950 text-stone-100">Town</option>
              <option value="county" className="bg-stone-950 text-stone-100">County</option>
              <option value="duchy" className="bg-stone-950 text-stone-100">Duchy</option>
              <option value="realm" className="bg-stone-950 text-stone-100">Realm</option>
            </select>
          </label>
        </div>

        {/* Blank Canvas Banner (only when empty & pointer mode) */}
        {world.realms.length === 0 && !isBrushToolActive && (
          <div
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="pointer-events-auto flex flex-wrap items-center gap-3 px-3.5 py-2 bg-stone-950/90 backdrop-blur-md border border-sky-500/45 rounded-xl shadow-xl text-xs cursor-default"
          >
            <span className="text-sky-200 font-medium">
              Blank Canvas — sculpt land from the Builder Palette on the left
            </span>
            {onOpenNewWorldModal && (
              <button
                type="button"
                onClick={onOpenNewWorldModal}
                className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-semibold cursor-pointer whitespace-nowrap shrink-0"
              >
                New / Heightmap
              </button>
            )}
          </div>
        )}

        {/* Active Brush HUD */}
        {isBrushToolActive && (
          <div
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="pointer-events-auto flex flex-wrap items-center gap-2 px-3 py-1.5 bg-stone-950/90 backdrop-blur-md border border-stone-800 rounded-xl shadow-xl text-xs cursor-default"
          >
            <Paintbrush className="w-3.5 h-3.5 shrink-0" style={{ color: reticleColor }} />
            <span className="font-medium text-stone-100 whitespace-nowrap">
              {BRUSH_MODE_LABELS[brushMode]}
            </span>
            <span className="text-stone-600">·</span>
            <span className="font-mono text-[11px] text-stone-300 tabular-nums whitespace-nowrap">
              {brushSize}px
            </span>
            <span className="hidden lg:inline text-[10px] text-stone-400 whitespace-nowrap">
              Drag to paint · Space/Right-drag pan · [ ] size
            </span>
            <div className="w-[1px] h-4 bg-stone-800 mx-0.5" />
            {onUndoBrush && (
              <button
                type="button"
                onClick={onUndoBrush}
                disabled={!canUndoBrush}
                title="Undo Stroke (Ctrl+Z)"
                className="p-1 rounded-md text-stone-300 hover:text-white hover:bg-stone-800 disabled:opacity-35 cursor-pointer"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
            )}
            {onRedoBrush && (
              <button
                type="button"
                onClick={onRedoBrush}
                disabled={!canRedoBrush}
                title="Redo Stroke (Ctrl+Y)"
                className="p-1 rounded-md text-stone-300 hover:text-white hover:bg-stone-800 disabled:opacity-35 cursor-pointer"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
            )}
            {onUpdateBrushConfig && (
              <button
                type="button"
                onClick={() => onUpdateBrushConfig({ brushMode: 'inspect' })}
                className="px-2 py-0.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white font-medium text-[11px] cursor-pointer transition-colors whitespace-nowrap shrink-0"
              >
                Done
              </button>
            )}
          </div>
        )}
      </div>

      {/* GPU Hardware-Accelerated Camera Transform Layer */}
      <div
        className="absolute top-0 left-0 pointer-events-none will-change-transform"
        style={{
          width: BASE_WIDTH,
          height: BASE_HEIGHT,
          transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
        <canvas
          ref={staticCanvasRef}
          style={{ width: BASE_WIDTH, height: BASE_HEIGHT }}
          className="absolute top-0 left-0"
        />
        <canvas
          ref={dynamicCanvasRef}
          style={{ width: BASE_WIDTH, height: BASE_HEIGHT }}
          className="absolute top-0 left-0"
        />
      </div>

      {/* Live Brush Cursor Reticle */}
      {isBrushToolActive && hoverContainerPos && !isSpaceDown && !isPanning && (
        <div
          className="pointer-events-none absolute z-30"
          style={{
            left: hoverContainerPos.x,
            top: hoverContainerPos.y,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {brushMode === 'forest' && (
            <img
              src={getForestBrushPreviewUrl()}
              alt="Forest Brush"
              draggable={false}
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 object-contain opacity-75 drop-shadow-[0_2px_4px_rgba(0,0,0,0.65)]"
              style={{
                width: Math.max(24, screenBrushRadius * 1.45),
                height: Math.max(24, screenBrushRadius * 1.45),
              }}
            />
          )}
          <svg
            width={Math.max(12, screenBrushRadius * 2 + 8)}
            height={Math.max(12, screenBrushRadius * 2 + 8)}
            viewBox={`${-screenBrushRadius - 4} ${-screenBrushRadius - 4} ${screenBrushRadius * 2 + 8} ${screenBrushRadius * 2 + 8}`}
            className="overflow-visible"
          >
            <circle
              cx={0}
              cy={0}
              r={screenBrushRadius}
              fill={reticleColor}
              fillOpacity={isBrushing ? 0.14 : 0.06}
              stroke={reticleColor}
              strokeWidth={isBrushing ? 2 : 1.5}
              strokeOpacity={0.92}
            />
            <circle
              cx={0}
              cy={0}
              r={Math.max(2, screenBrushRadius * falloffRatio)}
              fill="none"
              stroke={reticleColor}
              strokeWidth={1}
              strokeDasharray="3 3"
              strokeOpacity={0.65}
            />
            <line x1={-4} y1={0} x2={4} y2={0} stroke="#ffffff" strokeWidth={1.2} strokeOpacity={0.85} />
            <line x1={0} y1={-4} x2={0} y2={4} stroke="#ffffff" strokeWidth={1.2} strokeOpacity={0.85} />
          </svg>
        </div>
      )}

      {/* Hover Tooltip */}
      {!isBrushToolActive && (hoveredArmy || hoveredBurg || hoveredRoute || hoveredCell) && (() => {
        const focusRealm =
          world.realms.find((r) => r.id === selectedRealmId) || world.realms[0];

        const resolveDiplomaticSummary = (targetRealm?: Realm) => {
          if (!targetRealm || !focusRealm) {
            return { label: 'Unclaimed Frontier', color: '#64748b', relation: null as number | null };
          }
          if (targetRealm.id === focusRealm.id) {
            return { label: 'Selected Sovereign Realm', color: '#2563eb', relation: null as number | null };
          }
          const relation = focusRealm.diplomaticRelations?.[targetRealm.id] ?? 0;
          if (
            focusRealm.enemyRealmIds?.includes(targetRealm.id) ||
            targetRealm.enemyRealmIds?.includes(focusRealm.id)
          ) {
            return { label: 'At War / Hostile', color: '#dc2626', relation };
          }
          if (
            focusRealm.alliedRealmIds?.includes(targetRealm.id) ||
            targetRealm.alliedRealmIds?.includes(focusRealm.id)
          ) {
            return { label: 'Sworn Allied Realm', color: '#16a34a', relation };
          }
          if (
            focusRealm.tradePactRealmIds?.includes(targetRealm.id) ||
            targetRealm.tradePactRealmIds?.includes(focusRealm.id)
          ) {
            return { label: 'Active Trade Pact', color: '#0d9488', relation };
          }
          if (
            focusRealm.embargoedRealmIds?.includes(targetRealm.id) ||
            relation <= -25
          ) {
            return { label: 'Embargoed / Rival', color: '#d97706', relation };
          }
          if (relation >= 25) {
            return { label: 'Cordial Relations', color: '#65a30d', relation };
          }
          return { label: 'Neutral Stance', color: '#64748b', relation };
        };

        const resolveEconomicSummary = (county?: County, burgsList: Burg[] = []) => {
          const popSum = burgsList.reduce((acc, b) => acc + (b.population || 0), 0);
          const hasPort = burgsList.some((b) => b.type === 'Trade Port' || b.isCapital);
          const devVal =
            county?.development ??
            (burgsList[0]?.developmentLevel || 25);
          const wealthScore = Math.round(devVal * 1.35 + Math.min(85, popSum / 420) + (hasPort ? 28 : 0));
          const tier =
            wealthScore >= 165
              ? { label: 'Grand Trade Metropolis', color: '#eab308' }
              : wealthScore >= 125
              ? { label: 'Thriving Commercial Hub', color: '#10b981' }
              : wealthScore >= 90
              ? { label: 'Prosperous Market County', color: '#d97706' }
              : wealthScore >= 60
              ? { label: 'Agrarian Heartland', color: '#92400e' }
              : { label: 'Frontier Economy', color: '#475569' };
          return { wealthScore, devVal, hasPort, ...tier };
        };

        const resolveDensitySummary = (density: number) => {
          if (density >= 150) return { label: 'Densely Populated Metropolis', color: '#a8241e' };
          if (density >= 110) return { label: 'High Urban Density', color: '#d25b2a' };
          if (density >= 75) return { label: 'Flourishing Heartland', color: '#de8e44' };
          if (density >= 50) return { label: 'Settled Arable Countryside', color: '#eab562' };
          if (density >= 30) return { label: 'Moderate Rural District', color: '#e8d898' };
          if (density >= 16) return { label: 'Lightly Settled Grazing Land', color: '#c8d6aa' };
          return { label: 'Sparse Wilderness', color: '#94a3b8' };
        };

        return (
          <div
            className="pointer-events-none fixed z-30 transform -translate-x-1/2 -translate-y-full mb-3 px-3.5 py-2.5 bg-stone-900/95 backdrop-blur-md border border-amber-600/60 rounded-xl shadow-2xl text-xs text-stone-200"
            style={{ left: mousePos.x, top: mousePos.y - 12 }}
          >
            {hoveredArmy ? (
              <div>
                <div className="flex items-center gap-1.5 font-bold text-amber-400">
                  <span>⚔️</span>
                  <span>
                    {hoveredArmy.name ||
                      (hoveredArmy.commanderName ? `${hoveredArmy.commanderName}'s Host` : 'Field Army')}
                  </span>
                </div>
                <div className="text-stone-300 mt-1 text-[11px] tabular-nums">
                  <span className="font-semibold text-amber-300">{hoveredArmy.strength.toLocaleString()} Troops</span>
                  {hoveredArmy.tactic && (
                    <>
                      <span className="mx-1 text-stone-500">·</span>
                      <span>{hoveredArmy.tactic}</span>
                    </>
                  )}
                  <span className="mx-1 text-stone-500">·</span>
                  <span>
                    {hoveredArmy.isReturning
                      ? 'Returning'
                      : hoveredArmy.orderType === 'manual_march'
                      ? 'Manual March'
                      : hoveredArmy.orderType === 'liberate'
                      ? 'Liberating'
                      : 'Campaigning'}
                  </span>
                </div>
                <div className="text-[10px] text-amber-300/80 mt-1">
                  {selectedArmyId === hoveredArmy.id
                    ? 'Commanding · Right-click anywhere to order march'
                    : 'Click to take command · Right-click to march'}
                </div>
              </div>
            ) : hoveredBurg ? (() => {
              const bRealm = world.realms.find((r) => r.id === hoveredBurg.stateId);
              const bCounty = hoveredBurg.countyId
                ? world.counties.find((c) => c.id === hoveredBurg.countyId)
                : undefined;
              const bCell =
                hoveredBurg.cellIndex !== undefined ? world.cells[hoveredBurg.cellIndex] : hoveredCell;
              const bDuchy = bCell ? resolveDuchyForCell(bCell) : undefined;
              const bLord = hoveredBurg.ownerId
                ? world.characters.find((c) => c.id === hoveredBurg.ownerId && c.isAlive !== false)
                : bCounty?.rulerId
                ? world.characters.find((c) => c.id === bCounty.rulerId && c.isAlive !== false)
                : undefined;
              const bExports = Array.from(
                new Set([hoveredBurg.tradeGood, ...(hoveredBurg.exports || [])].filter(Boolean))
              ).slice(0, 3);
              const bMarket = world.economy?.burgMarkets?.[hoveredBurg.id];
              const bCultureName = hoveredBurg.culture || bCounty?.culture || bRealm?.culture;
              const bCulture = (world.cultures || []).find((c) => c.name === bCultureName);
              const bReligionName = bCounty?.religion || bRealm?.religion;
              const bReligion = (world.religions || []).find((r) => r.name === bReligionName);
              const bCountyBurgs = bCounty
                ? world.burgs.filter((bg) => bg.countyId === bCounty.id)
                : [hoveredBurg];
              const econ = resolveEconomicSummary(bCounty, bCountyBurgs);
              const dip = resolveDiplomaticSummary(bRealm);
              const densVal = Math.round(bCell?.populationDensity ?? (hoveredBurg.population / 80));
              const densInfo = resolveDensitySummary(densVal);

              return (
                <div className="space-y-1 max-w-[270px]">
                  <div className="border-b border-amber-500/25 pb-1">
                    <div className="font-cinzel font-bold text-amber-200 text-xs leading-tight flex items-center gap-1.5">
                      <span>{hoveredBurg.name}</span>
                      {mapMode !== 'political' && (
                        <span className="ml-auto text-[9px] font-sans uppercase tracking-wider px-1.5 py-0.5 rounded bg-stone-800 text-amber-300">
                          {mapMode}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-amber-400/85 mt-0.5">
                      {hoveredBurg.type}
                      {bCounty ? ` · ${bCounty.name}` : ''}
                      {bDuchy && bDuchy.id !== bCounty?.id ? ` · ${bDuchy.name}` : ''}
                      {bRealm ? ` · ${bRealm.name}` : ''}
                    </div>
                  </div>

                  {mapMode === 'economic' ? (
                    <>
                      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: econ.color }} />
                        <span className="text-amber-200">{econ.label}</span>
                        <span className="ml-auto font-mono tabular-nums text-stone-400">Idx {econ.wealthScore}</span>
                      </div>
                      <div className="text-[10.5px] text-stone-200 font-mono tabular-nums">
                        <span className="text-amber-300 font-semibold">
                          Vault {Math.round(hoveredBurg.treasury ?? bMarket?.treasury ?? 0).toLocaleString()}g
                        </span>
                        {bMarket && (
                          <>
                            <span className="mx-1 text-stone-500">·</span>
                            <span>Vol {Math.round(bMarket.totalMarketVolume).toLocaleString()}g</span>
                          </>
                        )}
                      </div>
                      {bExports.length > 0 && (
                        <div className="text-[10.5px] text-emerald-300">
                          <span className="text-stone-400">Exports: </span>
                          <span className="font-medium">{bExports.join(', ')}</span>
                        </div>
                      )}
                      <div className="text-[10px] text-stone-400 font-mono tabular-nums">
                        Dev {hoveredBurg.developmentLevel ?? econ.devVal}/100
                        {hoveredBurg.connectedRouteCount !== undefined && ` · ${hoveredBurg.connectedRouteCount} Trade Routes`}
                        {(hoveredBurg.isStarving || bMarket?.isStarving) && ' · Famine'}
                      </div>
                    </>
                  ) : mapMode === 'cultural' ? (
                    <>
                      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: bCulture?.color || '#10b981' }}
                        />
                        <span className="text-emerald-300">{bCultureName || 'Indigenous Tradition'}</span>
                      </div>
                      {bCulture && (
                        <div className="text-[10.5px] text-stone-300 leading-snug">
                          {bCulture.languageGroup} · {bCulture.ethos} · {bCulture.heritage}
                        </div>
                      )}
                      <div className="text-[10px] text-stone-400 font-mono tabular-nums">
                        {hoveredBurg.population.toLocaleString()} souls · {bRealm?.name || 'Independent'}
                      </div>
                    </>
                  ) : mapMode === 'religious' ? (
                    <>
                      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: bReligion?.color || '#f59e0b' }}
                        />
                        <span className="text-amber-300">
                          {bReligion?.symbol ? `${bReligion.symbol} ` : ''}
                          {bReligionName || 'Ancestral Creed'}
                        </span>
                      </div>
                      {bReligion && (
                        <div className="text-[10.5px] text-stone-300 leading-snug">
                          {bReligion.theologyFamily || 'Orthodoxy'} · {bReligion.deity} ({bReligion.clergyTitle})
                        </div>
                      )}
                      <div className="text-[10px] text-stone-400">
                        {hoveredBurg.type === 'Ancient Sanctuary' ? 'Sacred Pilgrimage Sanctuary' : 'Parish & Shrines Active'}
                      </div>
                    </>
                  ) : mapMode === 'diplomatic' ? (
                    <>
                      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: dip.color }} />
                        <span className="text-stone-100">{dip.label}</span>
                        {dip.relation !== null && (
                          <span className="ml-auto font-mono tabular-nums text-amber-300">
                            {dip.relation >= 0 ? `+${dip.relation}` : dip.relation}
                          </span>
                        )}
                      </div>
                      {bRealm && focusRealm && bRealm.id !== focusRealm.id && (
                        <div className="text-[10.5px] text-stone-300">
                          Relative to {focusRealm.name}
                        </div>
                      )}
                      {bLord && (
                        <div className="text-[10px] text-stone-400">
                          Lord: <span className="text-amber-200">{bLord.name}</span>
                        </div>
                      )}
                    </>
                  ) : mapMode === 'population' ? (
                    <>
                      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: densInfo.color }} />
                        <span className="text-amber-200">{densInfo.label}</span>
                      </div>
                      <div className="text-[10.5px] text-stone-200 font-mono tabular-nums">
                        <span className="text-amber-300 font-semibold">{hoveredBurg.population.toLocaleString()} souls</span>
                        <span> · Density {densVal}/sq.l</span>
                      </div>
                      {(hoveredBurg.devastation ?? 0) > 5 && (
                        <div className="text-[10px] text-rose-300 font-mono">
                          War Devastation: {Math.round(hoveredBurg.devastation || 0)}%
                        </div>
                      )}
                    </>
                  ) : mapMode === 'geographic' ? (
                    <>
                      <div className="text-[10.5px] text-stone-200 font-mono tabular-nums">
                        <span>{bCell ? `${Math.round(bCell.elevation * 3200)}m` : 'Lowland'}</span>
                        <span> · {hoveredBurg.settlementSite || 'Inland Basin'}</span>
                      </div>
                      {bCell && (
                        <div className="text-[10px] text-stone-400 font-mono tabular-nums">
                          <span>Biome: {bCell.biome}</span>
                          <span> · {Math.round(bCell.moisture * 100)}% Moist</span>
                          {bCell.isRiver ? ' · River' : bCell.isCoast ? ' · Coastal' : ''}
                        </div>
                      )}
                      {bExports.length > 0 && (
                        <div className="text-[10px] text-emerald-300">
                          Resources: {bExports.join(', ')}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {hoveredBurg.lore && (
                        <p className="text-[10.5px] text-stone-300 leading-snug line-clamp-2">
                          {hoveredBurg.lore}
                        </p>
                      )}
                      <div className="text-[10.5px] text-stone-200 font-mono tabular-nums">
                        <span className="text-amber-300 font-semibold">
                          {hoveredBurg.population.toLocaleString()} souls
                        </span>
                        <span className="mx-1 text-stone-500">·</span>
                        <span>{hoveredBurg.settlementSite || 'Inland Basin'}</span>
                      </div>
                      {bExports.length > 0 && (
                        <div className="text-[10.5px] text-amber-300/95">
                          <span className="text-stone-400">Exports: </span>
                          <span className="font-medium">{bExports.join(', ')}</span>
                        </div>
                      )}
                      {bCell && (
                        <div className="text-[10px] text-stone-400 font-mono tabular-nums">
                          <span>Biome: {bCell.biome}</span>
                          <span> · {Math.round(bCell.elevation * 3200)}m</span>
                          {hoveredBurg.connectedRouteCount !== undefined && (
                            <span> · {hoveredBurg.connectedRouteCount} Routes</span>
                          )}
                        </div>
                      )}
                      {bLord && (
                        <div className="text-[10px] text-stone-300 pt-0.5 border-t border-white/10">
                          <span className="text-stone-400">Fief Lord: </span>
                          <span className="text-amber-200 font-semibold">{bLord.name}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })() : hoveredRoute ? (
              <div>
                <div className="flex items-center gap-1.5 font-bold text-amber-400">
                  <span>{hoveredRoute.isMaritime ? '⛵' : '🛣️'}</span>
                  <span>{hoveredRoute.fromBurgName} ↔ {hoveredRoute.toBurgName}</span>
                </div>
                <div className="text-stone-300 mt-1 text-[11px]">
                  <span className="font-semibold text-amber-300">{hoveredRoute.type}</span>
                  <span className="mx-1 text-stone-500">·</span>
                  <span>{hoveredRoute.distanceKm} km</span>
                </div>
                <div className="text-stone-400 mt-0.5 text-[11px]">
                  <span>Goods: {hoveredRoute.primaryGood}</span>
                  <span className="mx-1 text-stone-500">·</span>
                  <span>Traffic: Tier {hoveredRoute.trafficVolume} Flow Index</span>
                </div>
              </div>
            ) : hoveredCell ? (() => {
              const seaLevel = world.settings.terrainSim?.seaLevel || 0.28;
              const isWater = hoveredCell.elevation < seaLevel;
              const hoverRealm = hoveredCell.realmId
                ? world.realms.find((r) => r.id === hoveredCell.realmId)
                : undefined;
              const hoverCounty = hoveredCell.countyId
                ? world.counties.find((c) => c.id === hoveredCell.countyId)
                : undefined;
              const hoverDuchy = resolveDuchyForCell(hoveredCell);
              const cellBurg = hoveredCell.burgId
                ? world.burgs.find((b) => b.id === hoveredCell.burgId)
                : undefined;

              const hoverTier: 'realm' | 'duchy' | 'county' | 'barony' =
                selectionFocus === 'realm'
                  ? 'realm'
                  : selectionFocus === 'duchy'
                  ? 'duchy'
                  : selectionFocus === 'county'
                  ? 'county'
                  : selectionFocus === 'burg'
                  ? 'barony'
                  : zoom < 1.25
                  ? 'realm'
                  : zoom < 1.9
                  ? 'duchy'
                  : zoom < 2.2
                  ? 'county'
                  : 'barony';

              const countyBurgs = hoverCounty
                ? world.burgs.filter((b) => b.countyId === hoverCounty.id)
                : [];
              let nearestBaronyBurg: Burg | undefined = cellBurg;
              if (!nearestBaronyBurg && hoverTier === 'barony' && countyBurgs.length > 0) {
                let minBD = Infinity;
                for (const b of countyBurgs) {
                  const d = Math.hypot(b.x - hoveredCell.x, b.y - hoveredCell.y);
                  if (d < minBD) {
                    minBD = d;
                    nearestBaronyBurg = b;
                  }
                }
              }

              const duchyMemberCounties = hoverDuchy
                ? world.counties.filter(
                    (c) =>
                      c.id === hoverDuchy.id ||
                      (hoverDuchy.duchyId && c.duchyId === hoverDuchy.duchyId)
                  )
                : [];
              const duchyCountyIds = new Set(duchyMemberCounties.map((c) => c.id));
              const duchyBurgs = hoverDuchy
                ? world.burgs.filter((b) => b.countyId && duchyCountyIds.has(b.countyId))
                : [];
              const realmBurgs = hoverRealm
                ? world.burgs.filter((b) => b.stateId === hoverRealm.id)
                : [];

              const primaryTitle = isWater
                ? hoveredCell.elevation < seaLevel * 0.65
                  ? 'Deep Open Sea'
                  : 'Coastal Waters'
                : hoverTier === 'realm' && hoverRealm
                ? hoverRealm.name
                : hoverTier === 'duchy' && hoverDuchy
                ? hoverDuchy.duchyName || hoverDuchy.name
                : hoverTier === 'county' && hoverCounty
                ? hoverCounty.name
                : hoverTier === 'barony' && nearestBaronyBurg
                ? `Barony of ${nearestBaronyBurg.name}`
                : hoverCounty
                ? hoverCounty.name
                : hoverDuchy
                ? hoverDuchy.duchyName || hoverDuchy.name
                : hoverRealm
                ? hoverRealm.name
                : 'Unclaimed Wilds';

              const tierLabel = isWater
                ? 'Maritime Zone'
                : hoverTier === 'realm' && hoverRealm
                ? `${hoverRealm.government || 'Realm'}${hoverRealm.societyType ? ` · ${hoverRealm.societyType}` : ''}`
                : hoverTier === 'duchy' && hoverDuchy
                ? hoverDuchy.rulerId === hoverRealm?.rulerId
                  ? 'Crown Duchy'
                  : 'Duchy'
                : hoverTier === 'county' && hoverCounty
                ? hoverCounty.tier || 'County'
                : hoverTier === 'barony' && nearestBaronyBurg
                ? `Barony (${nearestBaronyBurg.type})`
                : hoverCounty
                ? hoverCounty.tier || 'County'
                : hoverRealm
                ? `${hoverRealm.government}${hoverRealm.societyType ? ` · ${hoverRealm.societyType}` : ''}`
                : 'Frontier';

              const scopedBurgs =
                hoverTier === 'realm'
                  ? realmBurgs
                  : hoverTier === 'duchy'
                  ? duchyBurgs
                  : hoverTier === 'county'
                  ? countyBurgs
                  : nearestBaronyBurg
                  ? [nearestBaronyBurg]
                  : countyBurgs;

              const exportSet = new Set<string>();
              for (const b of scopedBurgs) {
                if (b.tradeGood) exportSet.add(b.tradeGood);
                for (const ex of b.exports || []) exportSet.add(ex);
              }
              const exportList = Array.from(exportSet).slice(0, 3);
              const scopedPop = scopedBurgs.reduce((acc, b) => acc + (b.population || 0), 0);

              const titleRulerId =
                hoverTier === 'realm'
                  ? hoverRealm?.rulerId
                  : hoverTier === 'duchy'
                  ? hoverDuchy?.rulerId || hoverRealm?.rulerId
                  : hoverTier === 'county'
                  ? hoverCounty?.rulerId || hoverDuchy?.rulerId || hoverRealm?.rulerId
                  : nearestBaronyBurg?.ownerId || hoverCounty?.rulerId || hoverDuchy?.rulerId || hoverRealm?.rulerId;
              const titleRuler = titleRulerId
                ? world.characters.find((c) => c.id === titleRulerId && c.isAlive !== false)
                : undefined;

              const rulerRoleLabel =
                hoverTier === 'realm'
                  ? 'Sovereign'
                  : hoverTier === 'duchy'
                  ? 'Duke'
                  : hoverTier === 'county'
                  ? 'Count'
                  : 'Baron';

              const elevM = Math.round(hoveredCell.elevation * 3200);
              const moistPct = Math.round(hoveredCell.moisture * 100);
              const tempC = hoveredCell.temperature !== undefined ? Math.round(hoveredCell.temperature * 35 - 5) : undefined;
              const landDesc = isWater
                ? 'Navigable sea waters supporting coastal fishing and maritime commerce.'
                : hoveredCell.elevation >= 0.62
                ? 'Rugged highland peaks and mountain passes rich in stone and ore.'
                : hoveredCell.isRiver
                ? 'Fertile river valley well suited for agriculture, mills, and trade.'
                : hoveredCell.isCoast
                ? 'Coastal territory bordering open sea lanes and fishing grounds.'
                : hoveredCell.moisture > 0.72
                ? 'Lush, moisture-rich lowlands supporting dense timber and pasture.'
                : hoveredCell.moisture < 0.35
                ? 'Dry frontier expanses traversed by long-distance merchant caravans.'
                : 'Rolling settled countryside dotted with estates and arable fields.';

              const econInfo = resolveEconomicSummary(hoverCounty, countyBurgs.length > 0 ? countyBurgs : scopedBurgs);
              const realmTreasury = hoverRealm ? Math.round(hoverRealm.treasury ?? 0) : 0;
              const cultureName =
                (hoverTier === 'county' || hoverTier === 'barony' ? hoverCounty?.culture : undefined) ||
                hoverRealm?.culture;
              const cultureObj = (world.cultures || []).find((c) => c.name === cultureName);
              const religionName =
                (hoverTier === 'county' || hoverTier === 'barony' ? hoverCounty?.religion : undefined) ||
                hoverRealm?.religion;
              const religionObj = (world.religions || []).find((r) => r.name === religionName);
              const dipInfo = resolveDiplomaticSummary(hoverRealm);
              const cellDensity = Math.round(hoveredCell.populationDensity ?? 0);
              const densityInfo = resolveDensitySummary(cellDensity);
              const realmWarsCount = hoverRealm
                ? (world.activeWars || []).filter(
                    (w) => w.attackerRealmId === hoverRealm.id || w.defenderRealmId === hoverRealm.id
                  ).length
                : 0;

              return (
                <div className="space-y-1 max-w-[275px]">
                  <div className="border-b border-amber-500/25 pb-1">
                    <div className="font-cinzel font-bold text-amber-200 text-xs leading-tight flex items-center gap-1.5">
                      <span>{primaryTitle}</span>
                      {mapMode !== 'political' && (
                        <span className="ml-auto text-[9px] font-sans uppercase tracking-wider px-1.5 py-0.5 rounded bg-stone-800 text-amber-300">
                          {mapMode}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-amber-400/85 mt-0.5">
                      {tierLabel}
                      {!isWater && hoverTier === 'barony' && hoverCounty && primaryTitle !== hoverCounty.name
                        ? ` · ${hoverCounty.name}`
                        : ''}
                      {!isWater &&
                      (hoverTier === 'barony' || hoverTier === 'county') &&
                      hoverDuchy &&
                      primaryTitle !== (hoverDuchy.duchyName || hoverDuchy.name) &&
                      hoverDuchy.id !== hoverCounty?.id
                        ? ` · ${hoverDuchy.duchyName || hoverDuchy.name}`
                        : ''}
                      {!isWater && hoverRealm && primaryTitle !== hoverRealm.name ? ` · ${hoverRealm.name}` : ''}
                    </div>
                  </div>

                  {isWater ? (
                    <>
                      <p className="text-[10.5px] text-stone-300 leading-snug">{landDesc}</p>
                      <div className="text-[10px] text-stone-400 font-mono tabular-nums">
                        Depth: {Math.max(5, Math.round((seaLevel - hoveredCell.elevation) * 2400))}m · Maritime Sea Lane Ready
                      </div>
                    </>
                  ) : mapMode === 'geographic' ? (
                    <>
                      <p className="text-[10.5px] text-stone-300 leading-snug">{landDesc}</p>
                      <div className="text-[10.5px] text-emerald-300 font-mono tabular-nums">
                        Biome: {hoveredCell.biome} · {elevM}m Elevation
                      </div>
                      <div className="text-[10px] text-stone-300 font-mono tabular-nums">
                        Rainfall/Moist: {moistPct}%
                        {tempC !== undefined ? ` · Temp ${tempC}°C` : ''}
                        {hoveredCell.isRiver ? ' · River Channel' : hoveredCell.isCoast ? ' · Coastal' : ''}
                      </div>
                    </>
                  ) : mapMode === 'economic' ? (
                    <>
                      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: econInfo.color }} />
                        <span className="text-amber-200">{econInfo.label}</span>
                        <span className="ml-auto font-mono tabular-nums text-stone-400">Idx {econInfo.wealthScore}</span>
                      </div>
                      <div className="text-[10.5px] text-stone-200 font-mono tabular-nums">
                        Dev {econInfo.devVal}/100
                        {hoverRealm ? ` · Crown Fisc ${realmTreasury.toLocaleString()}g` : ''}
                      </div>
                      {exportList.length > 0 && (
                        <div className="text-[10.5px] text-emerald-300">
                          <span className="text-stone-400">Exports: </span>
                          <span className="font-medium">{exportList.join(', ')}</span>
                        </div>
                      )}
                      {scopedPop > 0 && (
                        <div className="text-[10px] text-stone-400 font-mono tabular-nums">
                          Market Base: {scopedPop.toLocaleString()} souls · {scopedBurgs.length} Holdings
                        </div>
                      )}
                    </>
                  ) : mapMode === 'cultural' ? (
                    <>
                      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: cultureObj?.color || '#10b981' }}
                        />
                        <span className="text-emerald-300">{cultureName || 'Uncharted Folk'}</span>
                      </div>
                      {cultureObj && (
                        <div className="text-[10.5px] text-stone-300 leading-snug">
                          {cultureObj.languageGroup} · {cultureObj.ethos} · {cultureObj.heritage}
                        </div>
                      )}
                      <div className="text-[10px] text-stone-400 font-mono tabular-nums">
                        {scopedPop > 0 ? `${scopedPop.toLocaleString()} souls · ` : ''}
                        Tradition: {hoverCounty?.tradition || hoverRealm?.societyType || 'Customary Law'}
                      </div>
                    </>
                  ) : mapMode === 'religious' ? (
                    <>
                      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: religionObj?.color || '#f59e0b' }}
                        />
                        <span className="text-amber-300">
                          {religionObj?.symbol ? `${religionObj.symbol} ` : ''}
                          {religionName || 'Pagan Hearth'}
                        </span>
                      </div>
                      {religionObj && (
                        <div className="text-[10.5px] text-stone-300 leading-snug">
                          {religionObj.theologyFamily || 'Orthodoxy'} · {religionObj.deity}
                        </div>
                      )}
                      <div className="text-[10px] text-stone-400">
                        Clergy: {religionObj?.clergyTitle || 'Local Priests'}
                      </div>
                    </>
                  ) : mapMode === 'diplomatic' ? (
                    <>
                      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: dipInfo.color }} />
                        <span className="text-stone-100">{dipInfo.label}</span>
                        {dipInfo.relation !== null && (
                          <span className="ml-auto font-mono tabular-nums text-amber-300">
                            {dipInfo.relation >= 0 ? `+${dipInfo.relation}` : dipInfo.relation}
                          </span>
                        )}
                      </div>
                      {hoverRealm && focusRealm && hoverRealm.id !== focusRealm.id && (
                        <div className="text-[10.5px] text-stone-300">
                          Stance toward {focusRealm.name}
                        </div>
                      )}
                      <div className="text-[10px] text-stone-400 font-mono tabular-nums">
                        {titleRuler ? `${rulerRoleLabel}: ${titleRuler.name}` : 'No Sovereign'}
                        {realmWarsCount > 0 ? ` · ${realmWarsCount} Active War${realmWarsCount > 1 ? 's' : ''}` : ' · At Peace'}
                      </div>
                    </>
                  ) : mapMode === 'population' ? (
                    <>
                      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: densityInfo.color }} />
                        <span className="text-amber-200">{densityInfo.label}</span>
                      </div>
                      <div className="text-[10.5px] text-stone-200 font-mono tabular-nums">
                        <span>Density {cellDensity}/sq.l</span>
                        {scopedPop > 0 && (
                          <span className="text-amber-300 font-semibold"> · {scopedPop.toLocaleString()} souls</span>
                        )}
                      </div>
                      <div className="text-[10px] text-stone-400 font-mono tabular-nums">
                        {scopedBurgs.length} Holdings · Biome {hoveredCell.biome}
                        {hoverCounty && (world.epidemics || []).some((ep) => ep.infectedProvinceIds?.includes(hoverCounty.id))
                          ? ' · Plague Outbreak'
                          : ''}
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-[10.5px] text-stone-300 leading-snug">{landDesc}</p>

                      {(scopedPop > 0 || hoverTier === 'duchy' || hoverTier === 'county') && (
                        <div className="text-[10.5px] text-stone-200 font-mono tabular-nums">
                          {scopedPop > 0 && (
                            <span className="text-amber-300 font-semibold">
                              {scopedPop.toLocaleString()} souls
                            </span>
                          )}
                          {hoverTier === 'duchy' && duchyMemberCounties.length > 0 && (
                            <span> · {duchyMemberCounties.length} {duchyMemberCounties.length === 1 ? 'County' : 'Counties'}</span>
                          )}
                          {(hoverTier === 'duchy' || hoverTier === 'county') && scopedBurgs.length > 0 && (
                            <span> · {scopedBurgs.length} {scopedBurgs.length === 1 ? 'Holding' : 'Holdings'}</span>
                          )}
                        </div>
                      )}

                      {exportList.length > 0 && (
                        <div className="text-[10.5px] text-amber-300/95">
                          <span className="text-stone-400">Exports: </span>
                          <span className="font-medium">{exportList.join(', ')}</span>
                        </div>
                      )}

                      <div className="text-[10px] text-stone-400 font-mono tabular-nums">
                        <span>Biome: {hoveredCell.biome}</span>
                        <span> · {elevM}m</span>
                        <span> · {moistPct}% Moist</span>
                      </div>

                      {titleRuler && (
                        <div className="text-[10px] text-stone-300 pt-0.5 border-t border-white/10">
                          <span className="text-stone-400">{rulerRoleLabel}: </span>
                          <span className="text-amber-200 font-semibold">{titleRuler.name}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })() : null}
          </div>
        );
      })()}

      {/* Bottom HUD Track: Non-overlapping Breadcrumb, Map Modes & Camera Zoom */}
      <div
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-3 inset-x-3 z-20 flex flex-col gap-2 pointer-events-none"
      >
        {mapMode !== 'political' && mapMode !== 'geographic' && (
          <div className="self-end pointer-events-auto flex flex-wrap items-center gap-2.5 px-3 py-1 rounded-lg bg-stone-950/90 backdrop-blur-md border border-stone-800/80 text-[10px] text-stone-300 shadow-lg max-w-full">
            {mapMode === 'economic' && (
              <>
                <span className="font-semibold text-amber-400 uppercase tracking-wider">Wealth:</span>
                <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />Metropolis</span>
                <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Hub</span>
                <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-amber-600 inline-block" />Prosperous</span>
                <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-amber-900 inline-block" />Agrarian</span>
                <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-slate-600 inline-block" />Frontier</span>
              </>
            )}
            {mapMode === 'diplomatic' && (
              <>
                <span className="font-semibold text-amber-400 uppercase tracking-wider">Stance:</span>
                <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-blue-600 inline-block" />Selected</span>
                <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-green-600 inline-block" />Ally</span>
                <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-teal-600 inline-block" />Trade Pact</span>
                <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-amber-600 inline-block" />Embargo/Rival</span>
                <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-red-600 inline-block" />At War</span>
              </>
            )}
            {mapMode === 'cultural' && (
              <span className="text-stone-300">
                <strong className="text-amber-400 uppercase tracking-wider mr-1.5">Cultural Map:</strong>
                Territories colored by dominant realm heritage &amp; language group
              </span>
            )}
            {mapMode === 'religious' && (
              <span className="text-stone-300">
                <strong className="text-amber-400 uppercase tracking-wider mr-1.5">Religious Map:</strong>
                Territories colored by state faith &amp; sacred holy sites
              </span>
            )}
            {mapMode === 'population' && (
              <>
                <span className="font-semibold text-amber-400 uppercase tracking-wider">Density:</span>
                <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-red-600 inline-block" />Dense</span>
                <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Settled</span>
                <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />Rural</span>
                <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-slate-600 inline-block" />Sparse</span>
              </>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-end justify-between gap-2 w-full">
          {/* Compact Feudal Breadcrumb (only rendered when something is selected) */}
          {(selectedRealm || selectedCounty || selectedBurg) ? (
            <div className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 bg-stone-950/90 backdrop-blur-md border border-stone-800/85 rounded-xl shadow-xl text-xs max-w-full overflow-x-auto no-scrollbar">
              {selectedRealm ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectRealm(selectedRealm);
                    centerOnRealm(selectedRealm);
                  }}
                  title="Focus Kingdom on Map"
                  className="flex items-center gap-1.5 text-stone-100 hover:text-amber-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="font-serif font-semibold">{selectedRealm.name}</span>
                </button>
              ) : (
                <span className="text-stone-500 italic whitespace-nowrap">Unclaimed</span>
              )}

              {selectedCounty && (() => {
                const isSelectedDuchy = selectedCounty.tier === 'Duchy' || selectedCounty.name.includes('Duchy');
                const parentDuchy =
                  !isSelectedDuchy && selectedCounty.duchyId
                    ? world.counties.find(
                        (c) => (c.tier === 'Duchy' || c.name.includes('Duchy')) && c.duchyId === selectedCounty.duchyId
                      )
                    : undefined;
                return (
                  <>
                    {parentDuchy && parentDuchy.id !== selectedCounty.id && (
                      <>
                        <ChevronRight className="w-3 h-3 text-stone-600 shrink-0" />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectCounty(parentDuchy);
                            centerOnCounty(parentDuchy);
                          }}
                          title="Focus Parent Duchy on Map"
                          className="flex items-center gap-1 text-amber-200 hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
                        >
                          <Shield className="w-3 h-3 text-amber-400 shrink-0" />
                          <span>{parentDuchy.name}</span>
                        </button>
                      </>
                    )}
                    <ChevronRight className="w-3 h-3 text-stone-600 shrink-0" />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectCounty(selectedCounty);
                        centerOnCounty(selectedCounty);
                      }}
                      title={isSelectedDuchy ? 'Focus Duchy on Map' : 'Focus County on Map'}
                      className="flex items-center gap-1 text-amber-200 hover:text-white font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Shield className={`w-3 h-3 shrink-0 ${isSelectedDuchy ? 'text-amber-400' : 'text-emerald-400'}`} />
                      <span>{selectedCounty.name}</span>
                    </button>
                  </>
                );
              })()}

              {selectedBurg && (
                <>
                  <ChevronRight className="w-3 h-3 text-stone-600 shrink-0" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectBurg(selectedBurg);
                      centerOnBurg(selectedBurg);
                    }}
                    title="Focus Settlement on Map"
                    className="flex items-center gap-1 text-stone-200 hover:text-amber-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Castle className="w-3 h-3 text-amber-400 shrink-0" />
                    <span>{selectedBurg.name}</span>
                  </button>
                </>
              )}
            </div>
          ) : (
            <div />
          )}

          {/* Map Modes Bar + Zoom Controls */}
          <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2 ml-auto max-w-full">
            <div className="flex items-center gap-0.5 p-1 bg-stone-950/90 backdrop-blur-md border border-stone-800/85 rounded-xl shadow-2xl overflow-x-auto no-scrollbar">
              {(
                [
                  { id: 'political' as MapMode, label: 'Political', icon: Crown, title: 'Political Map — Realms, Duchies & Counties' },
                  { id: 'geographic' as MapMode, label: 'Geographic', icon: Mountain, title: 'Geographic Map — Engraved Mountain Ranges, Biomes & Terrain' },
                  { id: 'economic' as MapMode, label: 'Economic', icon: Coins, title: 'Economic Map — County Prosperity, Trade Hubs & Wealth' },
                  { id: 'cultural' as MapMode, label: 'Cultural', icon: Palette, title: 'Cultural Map — Heritage & Peoples' },
                  { id: 'religious' as MapMode, label: 'Religious', icon: Sparkles, title: 'Religious Map — State Faiths & Holy Sites' },
                  { id: 'diplomatic' as MapMode, label: 'Diplomatic', icon: Handshake, title: 'Diplomatic Map — Allies, Trade Pacts, Embargoes & Wars' },
                  { id: 'population' as MapMode, label: 'Population', icon: Users, title: 'Population Map — Demographic Density Heatmap' },
                ]
              ).map(({ id, label, icon: Icon, title }) => {
                const active = mapMode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setMapMode(id)}
                    title={title}
                    className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                      active
                        ? 'bg-amber-600 text-white font-semibold shadow-sm'
                        : 'text-stone-400 hover:text-stone-100 hover:bg-stone-800/70'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden xl:inline">{label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1 p-1 bg-stone-950/90 backdrop-blur-md border border-stone-800/80 rounded-xl shadow-xl shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.min(4.5, z * 1.25)); }}
                title="Zoom In"
                className="p-1.5 text-stone-300 hover:text-white hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.max(0.5, z * 0.8)); }}
                title="Zoom Out"
                className="p-1.5 text-stone-300 hover:text-white hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); resetView(); }}
                title="Reset View"
                className="p-1.5 text-stone-300 hover:text-white hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] font-mono text-stone-400 px-1.5 tabular-nums whitespace-nowrap">
                {Math.round(zoom * 100)}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

MapCanvas.displayName = 'MapCanvas';

function isPointInPolygon(p: Point2D, poly: Point2D[]): boolean {
  if (!poly || poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}