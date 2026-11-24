/**
 * Harrewyn Cartography Brushes 2.0 Relief & Settlement Engine
 *
 * Grounded in authentic 17th-century European copperplate engravings by cartographer Harrewyn:
 * - Hand-engraved Alpine mountain ridges, massifs, jagged crests & peaks
 * - Rolling cuesta foothills, knolls, and contoured mounds
 * - Dense woodland forest canopies and individual copse trees
 * - Wetland bogs, cattail swamps, and marshland reeds
 * - Concentric stone keeps, feudal castles, fortresses, bastions & redoubts
 * - Walled cities, metropolises, market towns, ports & rural hamlets
 * - Ancient stone abbeys, chapels, and monasteries
 * - Historic battlefields with crossed pikes and banners
 * - Ornate masterwork cartographic compass rose and engraved distance scales
 *
 * 100% transparent PNG brush assets with antique ink rendering.
 */

export type ReliefAtlasStyle = 'watercolor' | 'engraved';

// ==========================================
// 1. ASSET BRUSH REGISTRIES
// ==========================================

const BASE_URL = (import.meta.env?.BASE_URL || '/').replace(/\/$/, '');

function resolveBrushUrl(filename: string): string {
  if (/^(data:|blob:|https?:|file:)/i.test(filename)) {
    return filename;
  }
  const clean = filename.startsWith('/') ? filename : `/assets/brushes/${filename}`;
  return `${BASE_URL}${clean}`;
}

export function registerCustomStampBrushes(stampsByCategory: {
  mountains?: string[];
  hills?: string[];
  trees?: string[];
  castles?: string[];
  towns?: string[];
}): number {
  let added = 0;
  const appendUnique = (target: string[], incoming?: string[]) => {
    if (!incoming || incoming.length === 0) return;
    for (const src of incoming) {
      if (src && !target.includes(src)) {
        target.push(src);
        added++;
      }
    }
  };
  appendUnique(MOUNTAIN_BRUSHES, stampsByCategory.mountains);
  appendUnique(MOUNTAIN_CHAIN_BRUSHES, stampsByCategory.mountains);
  appendUnique(HILL_BRUSHES, stampsByCategory.hills);
  appendUnique(TREE_BRUSHES, stampsByCategory.trees);
  appendUnique(CASTLE_BRUSHES, stampsByCategory.castles);
  appendUnique(CITY_BRUSHES, stampsByCategory.towns);
  return added;
}

export const MOUNTAIN_CHAIN_BRUSHES = [
  '/assets/aistudio/Hills_002_b6096986.png',
  '/assets/aistudio/Hills_004_a5db803d.png',
  '/assets/aistudio/Hills_007_e6e3ee82.png',
  '/assets/aistudio/Hills_008_cca81df0.png',
  '/assets/aistudio/Hills_009_2e40c426.png',
  '/assets/aistudio/Hills_010_cb8903bf.png',
  '/assets/aistudio/Hills_011_bfe99934.png',
  '/assets/aistudio/Hills_012_3f94d09c.png',
  '/assets/aistudio/Hills_015_e625d3e8.png',
  '/assets/aistudio/Hills_016_50f2dba9.png',
  '/assets/aistudio/Hills_017_a97c41a9.png',
  '/assets/aistudio/Hills_018_8c45eefe.png',
  '/assets/aistudio/Hills_019_62225a3e.png',
  '/assets/aistudio/Hills_020_2ad09ef0.png',
  '/assets/aistudio/Hills_021_9dcee617.png',
];

export const MOUNTAIN_BRUSHES = [
  '/assets/aistudio/Hills_001_93016bc4.png',
  '/assets/aistudio/Hills_002_b6096986.png',
  '/assets/aistudio/Hills_003_ae1a718d.png',
  '/assets/aistudio/Hills_004_a5db803d.png',
  '/assets/aistudio/Hills_005_751b6878.png',
  '/assets/aistudio/Hills_006_b44247cc.png',
  '/assets/aistudio/Hills_007_e6e3ee82.png',
  '/assets/aistudio/Hills_008_cca81df0.png',
  '/assets/aistudio/Hills_009_2e40c426.png',
  '/assets/aistudio/Hills_010_cb8903bf.png',
  '/assets/aistudio/Hills_011_bfe99934.png',
  '/assets/aistudio/Hills_012_3f94d09c.png',
  '/assets/aistudio/Hills_013_b754b10a.png',
  '/assets/aistudio/Hills_014_34ecaa48.png',
  '/assets/aistudio/Hills_015_e625d3e8.png',
  '/assets/aistudio/Hills_016_50f2dba9.png',
  '/assets/aistudio/Hills_017_a97c41a9.png',
  '/assets/aistudio/Hills_018_8c45eefe.png',
  '/assets/aistudio/Hills_019_62225a3e.png',
  '/assets/aistudio/Hills_020_2ad09ef0.png',
  '/assets/aistudio/Hills_021_9dcee617.png',
];

export const HILL_BRUSHES = [
  '/assets/aistudio/Hill_003_13b5aa83.png',
  '/assets/aistudio/Hill_004_c3b15144.png',
  '/assets/aistudio/Hill_006_5ff41c17.png',
  '/assets/aistudio/Hill_007_7d1c2335.png',
  '/assets/aistudio/Hill_015_015ea984.png',
  '/assets/aistudio/Hill_016_f3146700.png',
  '/assets/aistudio/Hill_017_88432ba7.png',
  '/assets/aistudio/Hill_018_59f75862.png',
  '/assets/aistudio/Hill_019_6b4bb997.png',
];

export const FOREST_BRUSHES = [
  'Forest 007.png', // Large deep forest canopy (276x158)
  'Forest 008.png', // Dense ancient woodland (225x147)
  'Forest 009.png', // Broad forest expanse (205x116)
  'Forest 004.png', // Clustered grove (123x125)
  'Forest 005.png', // Dense oak canopy (118x126)
  'Forest 006.png', // Woodland grove (99x84)
  'Forest 001.png', // Pine and oak grove (88x52)
  'Forest 002.png', // Woodland grove (92x86)
  'Forest 003.png', // Small forest copse (73x55)
  'Forest 010.png',
  'Forest 011.png',
  'Forest 012.png',
  'Forest 013.png',
  'Forest 014.png',
  'Forest 015.png',
  'Forest 016.png',
  'Forest 017.png',
  'Forest 018.png',
  'Forest 019.png',
  'Forest 020.png',
  'Forest 021.png',
  'Forest 022.png',
  'Forest 023.png',
  'Forest 024.png',
  'Forest 025.png',
  'Forest 026.png',
  'Forest 027.png',
  'Forest 028.png',
  'Forest 029.png',
  'Forest 030.png',
];

export const TREE_BRUSHES = [
  'Tree 001.png', // Mature solitary oak (63x60)
  'Tree 002.png', // Tall slender tree (34x64)
  'Tree 003.png', // Broadleaf copse (42x55)
  'Tree 004.png', // Copse cluster (29x33)
  'Tree 005.png', // Small tree (26x27)
  'Tree 006.png', // Conifer / pine (26x33)
  'Tree 007.png', // Mountain pine (26x34)
  'Tree 008.png',
  'Tree 009.png',
  'Tree 010.png',
  'Tree 011.png',
  'Tree 012.png',
  'Tree 013.png',
  'Tree 014.png',
  'Tree 015.png',
  'Tree 016.png',
  'Tree 017.png',
  'Tree 018.png',
  'Tree 019.png',
  'Tree 020.png',
];

export const SWAMP_BRUSHES = [
  'Swamp 001.png', // Expansive marshland reed bed (244x137)
  'Swamp 002.png', // Deep fen wetland (200x154)
  'Swamp 003.png', // Peat bog marsh (181x142)
  'Swamp 005.png', // Marsh reeds (154x87)
  'Swamp 008.png', // Bog pool (141x71)
  'Swamp 009.png', // Mire copse (87x114)
  'Swamp 010.png',
  'Swamp 011.png',
  'Swamp 012.png',
  'Swamp 013.png',
  'Swamp 014.png',
  'Swamp 015.png',
  'Swamp 016.png',
  'Swamp 017.png',
  'Swamp 018.png',
  'Swamp 019.png',
  'Swamp 020.png',
];

export const CASTLE_BRUSHES = [
  'Castle 001.png', // High concentric feudal keep (120x138)
  'Castle 002.png', // Fortified stone castle with spires
  'Castle 003.png', // Citadel curtain fortress
  'Castle 004.png', // Grand baronial castle
  'Castle 005.png', // Stronghold with moat and gate
  'Castle 006.png', // Medieval fortress
  'Castle 007.png', // Hilltop citadel
  'Castle 008.png', // Royal castle
  'Castle 009.png',
  'Castle 010.png',
  'Castle 011.png',
  'Castle 012.png',
  'Castle 013.png',
  'Castle 014.png',
  'Castle 015.png',
  'Castle 016.png',
  'Castle 017.png',
  'Castle 018.png',
  'Castle 019.png',
  'Castle 020.png',
  'Castles 026.png', // Twin fortress cluster
  'Castles 027.png',
  'Fort 001.png',    // Border stone fort (160x164)
  'Fort 002.png',
  'Fort 003.png',
  'Fort 004.png',
  'Fort 005.png',
];

export const CITY_BRUSHES = [
  'City w_ Wall 001.png', // Walled metropolis with bastions
  'City 001.png',         // Sprawling capital city with cathedral (105x140)
  'City 002.png',         // Imperial chartered city
  'City 003.png',         // Walled merchant city
  'City 004.png',         // Riverine port city
  'City 005.png',         // Flourishing metropolis
  'City 006.png',
  'City 007.png',
  'City 008.png',
  'City 009.png',
  'City 010.png',
  'City 011.png',
  'City 012.png',
  'City 013.png',
  'City 014.png',
  'City 015.png',
  'City 016.png',
  'City 017.png',
  'City 019.png',
  'City w_ Abbey 001.png',// Cathedral city
  'City w_ Chapel 001.png',
];

export const VILLAGE_BRUSHES = [
  'Village 001.png', // Medieval timber village (134x130)
  'Village 002.png', // Market village
  'Village 003.png', // Crossroads village
  'Village 004.png', // Farming settlement
  'Village 005.png', // River village
  'Village 006.png',
  'Village 007.png',
  'Village 008.png',
  'Village 009.png',
  'Village 010.png',
  'Village 011.png',
  'Village 012.png',
  'Village 013.png',
  'Village 014.png',
  'Village 015.png',
  'Village w_ Cross 001.png',
  'Forested Settlement 001.png',
  'Forested Settlement 002.png',
  'Elevated Village 001.png',
  'Elevated Village 002.png',
  'Elevated Village 003.png',
];

export const HAMLET_BRUSHES = [
  'Hamlet 001.png', // Small rural hamlet (76x48)
  'Hamlet 002.png',
  'Hamlet 003.png',
  'Hamlet 004.png',
  'Hamlet 005.png',
  'Hamlet 006.png',
  'Hamlet 007.png',
  'Hamlet 008.png',
  'Hamlet 009.png',
  'Hamlet 010.png',
  'Farm 001.png', // Feudal peasant farmstead
  'Farm 002.png',
  'Farm 003.png',
  'Farm 004.png',
  'Farm 005.png',
  'Farm 006.png',
  'Farm 007.png',
  'Farm 008.png',
  'Farm 009.png',
  'Farm 010.png',
];

export const ABBEY_TEMPLE_BRUSHES = [
  'Abbey 001.png',        // Ancient stone monastic abbey (112x123)
  'Abbey 002.png',
  'Abbey 003.png',
  'Abbey 004.png',
  'Abbey 005.png',
  'Abbey w_ Wall 001.png',// Walled cloistered monastery
  'Abbey w_ Wall 002.png',
  'Chapel 001.png',       // Gothic holy chapel
  'Chapel 002.png',
  'Chapel 003.png',
  'Chapel 004.png',
  'Chapel 005.png',
  'Mission 001.png',      // Sanctuary mission
  'Mission 002.png',
  'Mission 003.png',
];

export const MILL_MANOR_BRUSHES = [
  'Village w_ Mansion 001.png', // High-res harbor/estate town (129x120)
  'Village w_ Mansion 002.png', // High-res walled estate village (174x134)
  'Village w_ Mansion 003.png', // High-res coastal manor town (114x134)
  'Hamlet and Mansion 001.png', // High-res manor & hamlet (97x124)
  'Hamlet and Mansion 003.png', // High-res riverfront manor (134x91)
  'City 004.png',               // Riverine port city (245x179)
  'City 009.png',               // Harbor merchant town (195x129)
  'City 011.png',               // Coastal town (157x129)
];

export const BATTLEFIELD_BRUSHES = [
  'Battlefield 003.png',
  'Battlefield 004.png',
];

export const GALLOWS_CROSS_BRUSHES = [
  'Elevated Cross 001.png',
  'Elevated Cross 002.png',
  'Cross 001.png',
  'Cross 002.png',
  'Gallows 001.png',
  'Gallows 002.png',
];

export const COMPASS_ROSE_BRUSHES = [
  'Compass Rose 001.png',
  'Compass Rose 002.png',
];

export const SCALE_BRUSH = 'Scale.png';

// ==========================================
// 2. IMAGE PRELOADER & FAST CACHE
// ==========================================

const imageCache = new Map<string, HTMLImageElement>();
const failedImages = new Set<string>(); // Tracks 404s so we don't spam requests
let isAtlasReady = false;
let loadedBrushesCount = 0;
const loadListeners: (() => void)[] = [];

let loadTriggerTimeout: ReturnType<typeof setTimeout> | null = null;
function notifyLoaded() {
  if (loadTriggerTimeout) return;
  loadTriggerTimeout = setTimeout(() => {
    loadTriggerTimeout = null;
    isAtlasReady = true;
    for (const cb of loadListeners) {
      try {
        cb();
      } catch (err) {
        console.error('Atlas listener error:', err);
      }
    }
  }, 25);
}

export function isReliefAtlasReady(): boolean {
  return isAtlasReady;
}

export function getBrushImage(filename: string): HTMLImageElement | null {
  const fullPath = resolveBrushUrl(filename);

  // If this PNG doesn't exist, immediately return null to use the vector fallback
  if (failedImages.has(fullPath)) {
    return null;
  }

  const existing = imageCache.get(fullPath);
  if (existing) {
    if (existing.complete && existing.naturalWidth > 0) {
      return existing;
    }
    return null;
  }

  // Initiate async fetch with clean relative path (no crossOrigin to avoid CORS blocks on runner domain)
  if (typeof Image !== 'undefined') {
    const img = new Image();
    img.onload = () => {
      loadedBrushesCount++;
      notifyLoaded();
    };
    img.onerror = () => {
      console.warn('Failed to load brush image:', fullPath);
      failedImages.add(fullPath);
      imageCache.delete(fullPath);
    };
    img.src = encodeURI(fullPath);
    imageCache.set(fullPath, img);
  }
  return null;
}

/**
 * Register callback to be notified when brush assets finish loading.
 */
export function onAtlasLoaded(callback: () => void): () => void {
  loadListeners.push(callback);
  if (isAtlasReady || loadedBrushesCount > 15) {
    callback();
  }
  return () => {
    const idx = loadListeners.indexOf(callback);
    if (idx !== -1) {
      loadListeners.splice(idx, 1);
    }
  };
}

// Preload the complete brush catalog immediately on startup
export function preloadAllAtlasBrushes(): void {
  if (typeof Image === 'undefined') return;

  const allBrushes = Array.from(
    new Set([
      ...MOUNTAIN_CHAIN_BRUSHES,
      ...MOUNTAIN_BRUSHES,
      ...HILL_BRUSHES,
      ...FOREST_BRUSHES,
      ...TREE_BRUSHES,
      ...SWAMP_BRUSHES,
      ...CASTLE_BRUSHES,
      ...CITY_BRUSHES,
      ...VILLAGE_BRUSHES,
      ...HAMLET_BRUSHES,
      ...ABBEY_TEMPLE_BRUSHES,
      ...MILL_MANOR_BRUSHES,
      ...BATTLEFIELD_BRUSHES,
      ...GALLOWS_CROSS_BRUSHES,
      ...COMPASS_ROSE_BRUSHES,
      SCALE_BRUSH,
    ])
  );

  for (const brush of allBrushes) {
    getBrushImage(brush);
  }
}

// Brushes load lazily on demand via getBrushImage() (or explicit preloadAllAtlasBrushes())

// ==========================================
// 3. SEED PICKER UTILITIES
// ==========================================

function pickBrush<T>(array: T[], seed: number): T {
  const idx = Math.abs(Math.floor(seed)) % array.length;
  return array[idx];
}

// ==========================================
// 4. MASTERWORK HARREWYN RELIEF RENDERERS
// ==========================================

/**
 * Draws an authentic hand-engraved Harrewyn mountain range / cordillera.
 */
export function drawAtlasMountain(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  seed: number,
  elevation: number,
  isWinter: boolean,
  style: ReliefAtlasStyle = 'watercolor',
  preferChain: boolean = false
): boolean {
  // Pick wide cordillera/chain brushes when zoomed out, or full alpine variety when zoomed in
  const pool = preferChain ? MOUNTAIN_CHAIN_BRUSHES : MOUNTAIN_BRUSHES;
  const brushFile = pickBrush(pool, seed * 17 + Math.floor(elevation * 100));
  const img = getBrushImage(brushFile);

  if (!img || !img.complete || img.naturalWidth === 0) {
    return false; // Fallback to vector if not yet cached
  }

  const aspect = img.naturalWidth / img.naturalHeight;
  // Refined, well-proportioned engraved mountain range sizing for Geographic mode
  const h = size * (preferChain ? 0.72 : 0.60);
  const w = Math.min(h * aspect, size * 2.15);

  ctx.save();

  // Subtle ambient earthen shadow underlay along the southeast base for sculpted relief depth
  if (style === 'watercolor') {
    ctx.beginPath();
    ctx.ellipse(x + w * 0.04, y + 1.5, w * 0.44, h * 0.16, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(38, 26, 14, 0.18)';
    ctx.fill();
  }

  // Draw the copperplate engraved mountain ridge with full-strength multiply blend so ink lines pop cleanly
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 1.0;
  ctx.drawImage(img, x - w / 2, y - h, w, h);
  ctx.restore();

  // Winter snowcrest highlight along peak
  if (isWinter && elevation > 0.65) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.18, y - h * 0.75);
    ctx.lineTo(x, y - h * 0.95);
    ctx.lineTo(x + w * 0.14, y - h * 0.78);
    ctx.stroke();
  }

  ctx.restore();
  return true;
}

/**
 * Draws an authentic hand-engraved Harrewyn rolling hill / cuesta.
 */
export function drawAtlasHill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size = 22,
  seed = 1,
  style: ReliefAtlasStyle = 'watercolor'
): boolean {
  const brushFile = pickBrush(HILL_BRUSHES, seed * 23);
  const img = getBrushImage(brushFile);

  if (!img || !img.complete || img.naturalWidth === 0) {
    return false;
  }

  const aspect = img.naturalWidth / img.naturalHeight;
  const h = size * 0.50;
  const w = Math.min(h * aspect, size * 1.70);

  ctx.save();

  if (style === 'watercolor') {
    ctx.beginPath();
    ctx.ellipse(x + w * 0.03, y + 1, w * 0.42, h * 0.16, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(42, 30, 18, 0.12)';
    ctx.fill();
  }

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.92;
  ctx.drawImage(img, x - w / 2, y - h, w, h);
  ctx.restore();
  ctx.restore();
  return true;
}

/**
 * Draws an authentic hand-engraved Harrewyn forest canopy or woodland copse.
 */
export function drawAtlasTree(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size = 28,
  biome = 'Temperate Forest',
  seed = 1,
  style: ReliefAtlasStyle = 'watercolor',
  isWinter = false,
  isAutumn = false,
  treeMode: 'auto' | 'forest' | 'tree' = 'auto'
): boolean {
  const isTaiga = biome === 'Boreal Taiga' || biome === 'Glacial Tundra';
  const isIndividual =
    treeMode === 'tree' ? true : treeMode === 'forest' ? false : seed % 4 === 0;

  const brushFile = isIndividual
    ? pickBrush(TREE_BRUSHES, seed * 31)
    : pickBrush(FOREST_BRUSHES, seed * 19);

  const img = getBrushImage(brushFile);
  if (!img || !img.complete || img.naturalWidth === 0) {
    return false;
  }

  const aspect = img.naturalWidth / img.naturalHeight;
  const h = isIndividual ? size * 0.72 : size * 0.96;
  const w = h * aspect;

  ctx.save();

  if (style === 'watercolor') {
    // Subtle watercolor seasonal wash under-wash
    ctx.beginPath();
    ctx.ellipse(x, y - h * 0.45, w * 0.42, h * 0.38, 0, 0, Math.PI * 2);
    if (isWinter) {
      ctx.fillStyle = 'rgba(215, 230, 245, 0.30)';
    } else if (isAutumn && !isTaiga) {
      ctx.fillStyle = 'rgba(195, 120, 40, 0.24)';
    } else {
      ctx.fillStyle = isTaiga
        ? 'rgba(40, 75, 55, 0.16)'
        : biome === 'Temperate Forest'
        ? 'rgba(65, 95, 45, 0.18)'
        : 'rgba(95, 80, 40, 0.14)';
    }
    ctx.fill();
  }

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = style === 'engraved' ? 0.94 : 0.90;
  ctx.drawImage(img, x - w / 2, y - h, w, h);
  ctx.restore();
  ctx.restore();
  return true;
}

/**
 * Draws authentic Harrewyn marshland, wetland reeds & swamp engravings.
 */
export function drawAtlasSwampOrDesert(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size = 28,
  biome = 'Misty Wetland',
  seed = 1,
  style: ReliefAtlasStyle = 'watercolor'
): boolean {
  if (biome === 'Scorched Desert' || biome === 'Arid Savanna') {
    // Subtle sand dune stippling
    ctx.save();
    ctx.strokeStyle = style === 'watercolor' ? 'rgba(150, 115, 65, 0.55)' : 'rgba(50, 40, 25, 0.6)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(x - 14, y);
    ctx.quadraticCurveTo(x, y - 6, x + 14, y);
    ctx.stroke();
    ctx.restore();
    return true;
  }

  // Wetland / Swamp: Draw Harrewyn swamp brush
  const brushFile = pickBrush(SWAMP_BRUSHES, seed * 13);
  const img = getBrushImage(brushFile);
  if (!img || !img.complete || img.naturalWidth === 0) {
    return false;
  }

  const aspect = img.naturalWidth / img.naturalHeight;
  const h = size * 0.75;
  const w = h * aspect;

  ctx.save();
  if (style === 'watercolor') {
    ctx.beginPath();
    ctx.ellipse(x, y - h * 0.35, w * 0.45, h * 0.32, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(60, 85, 75, 0.15)';
    ctx.fill();
  }

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.92;
  ctx.drawImage(img, x - w / 2, y - h, w, h);
  ctx.restore();
  ctx.restore();
  return true;
}

/**
 * Draws authentic Harrewyn settlement citadels, walled cities, castles, abbeys & villages.
 */
export function drawAtlasBurgSettlement(
  ctx: CanvasRenderingContext2D,
  type: string,
  tier: string,
  isCapital: boolean,
  x: number,
  y: number,
  scale = 1.0,
  style: ReliefAtlasStyle = 'watercolor'
): boolean {
  // Deterministic seed based on coordinates
  const seed = Math.abs(Math.floor(x * 13.1 + y * 7.7));

  let brushFile: string;
  let targetHeight: number;

  if (isCapital) {
    // Imperial Capital Metropolis / Walled City
    brushFile = pickBrush(CITY_BRUSHES, seed);
    targetHeight = scale * 34;
  } else if (type === 'Border Fortress' || type.includes('Castle') || type.includes('Citadel')) {
    // Medieval Feudal Stone Castle / Keep
    brushFile = pickBrush(CASTLE_BRUSHES, seed);
    targetHeight = scale * 30;
  } else if (tier === 'metropolis' || type === 'Royal Metropolis') {
    // Large Walled City
    brushFile = pickBrush(CITY_BRUSHES, seed + 3);
    targetHeight = scale * 28;
  } else if (type.includes('Port') || type.includes('Watermill')) {
    // Port or River Settlement with Mill
    brushFile = seed % 2 === 0
      ? pickBrush(MILL_MANOR_BRUSHES, seed)
      : pickBrush(CITY_BRUSHES, seed);
    targetHeight = scale * 26;
  } else if (type === 'Ancient Sanctuary' || type.includes('Temple') || type.includes('Holy')) {
    // Monastic Stone Abbey or Gothic Chapel
    brushFile = pickBrush(ABBEY_TEMPLE_BRUSHES, seed);
    targetHeight = scale * 26;
  } else if (tier === 'village' || type === 'Farming Village') {
    // Medieval Village
    brushFile = pickBrush(VILLAGE_BRUSHES, seed);
    targetHeight = scale * 22;
  } else if (tier === 'hamlet' || type === 'Mountain Hamlet') {
    // Quaint Rural Hamlet / Farm
    brushFile = pickBrush(HAMLET_BRUSHES, seed);
    targetHeight = scale * 18;
  } else {
    // Market Town / Default
    brushFile = pickBrush(VILLAGE_BRUSHES, seed + 5);
    targetHeight = scale * 24;
  }

  const img = getBrushImage(brushFile);
  if (!img || !img.complete || img.naturalWidth === 0) {
    return false;
  }

  const aspect = img.naturalWidth / img.naturalHeight;
  const h = targetHeight;
  const w = h * aspect;

  ctx.save();

  // Subtle cast shadow under settlement
  ctx.beginPath();
  ctx.ellipse(x, y + 1, w * 0.42, h * 0.16, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(25, 20, 15, 0.18)';
  ctx.fill();

  // Draw authentic Harrewyn settlement engraving
  ctx.drawImage(img, x - w / 2, y - h, w, h);

  // If capital, add an imperial golden banner crest above the spire
  if (isCapital) {
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.moveTo(x + 2, y - h - 1);
    ctx.lineTo(x + 10, y - h + 3);
    ctx.lineTo(x + 2, y - h + 7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  ctx.restore();
  return true;
}

/**
 * Draws landmark ruins, battlefields, or monoliths.
 */
export function drawAtlasLandmark(
  ctx: CanvasRenderingContext2D,
  type: 'ruins' | 'monolith' | 'cave' | 'dragon_lair' | 'standing_stones',
  x: number,
  y: number,
  scale = 1.0,
  style: ReliefAtlasStyle = 'watercolor'
): boolean {
  const seed = Math.abs(Math.floor(x * 9.3 + y * 5.1));
  let brushFile: string;

  if (type === 'ruins' || type === 'dragon_lair') {
    brushFile = pickBrush(BATTLEFIELD_BRUSHES, seed);
  } else {
    brushFile = pickBrush(GALLOWS_CROSS_BRUSHES, seed);
  }

  const img = getBrushImage(brushFile);
  if (!img || !img.complete || img.naturalWidth === 0) {
    return false;
  }

  const aspect = img.naturalWidth / img.naturalHeight;
  const h = scale * 24;
  const w = h * aspect;

  ctx.save();
  ctx.drawImage(img, x - w / 2, y - h, w, h);
  ctx.restore();
  return true;
}

/**
 * Draws the ornate Harrewyn cartographic Compass Rose.
 */
export function drawAtlasCompassRose(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size = 90
): boolean {
  const img = getBrushImage(COMPASS_ROSE_BRUSHES[0]);
  if (!img || !img.complete || img.naturalWidth === 0) {
    return false;
  }

  const aspect = img.naturalWidth / img.naturalHeight;
  const h = size;
  const w = h * aspect;

  ctx.save();
  ctx.globalAlpha = 0.82;
  ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
  ctx.restore();
  return true;
}

/**
 * Draws the Harrewyn cartographic distance scale bar.
 */
export function drawAtlasScale(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size = 120
): boolean {
  const img = getBrushImage(SCALE_BRUSH);
  if (!img || !img.complete || img.naturalWidth === 0) {
    return false;
  }

  const aspect = img.naturalWidth / img.naturalHeight;
  const w = size;
  const h = w / aspect;

  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.drawImage(img, x, y - h, w, h);
  ctx.restore();
  return true;
}

export function getForestBrushPreviewUrl(): string {
  return encodeURI(resolveBrushUrl(FOREST_BRUSHES[4]));
}

export function getTreeBrushPreviewUrl(): string {
  return encodeURI(resolveBrushUrl(TREE_BRUSHES[0]));
}

