import {
  BaseShape,
  CadetBranchOptions,
  ChargeId,
  HeraldicFill,
  HeraldryConfig,
  HeraldryOptions,
  HeraldryResult,
  TinctureName,
  createCadetBranch,
  generateHeraldry,
  impaleArms,
  renderHeraldry,
  toDataUrl,
} from '../engine/heraldry';
import type {
  Character,
  CoatOfArmsData,
  CourtRole,
  Realm,
  TitleTier,
  WorldState,
} from '../types/world';

const FILL_COLORS: Record<HeraldicFill, { bg: string; fg: string }> = {
  Or: { bg: '#F6C844', fg: '#1E293B' },
  Argent: { bg: '#F8FAFC', fg: '#1E293B' },
  Gules: { bg: '#C82829', fg: '#FFFFFF' },
  Azure: { bg: '#1D4ED8', fg: '#FFFFFF' },
  Sable: { bg: '#1E293B', fg: '#F6C844' },
  Vert: { bg: '#15803D', fg: '#FFFFFF' },
  Purpure: { bg: '#6D28D9', fg: '#FFFFFF' },
  Ermine: { bg: '#F8FAFC', fg: '#1E293B' },
  Ermines: { bg: '#1E293B', fg: '#F8FAFC' },
  Erminois: { bg: '#F6C844', fg: '#1E293B' },
  Vair: { bg: '#1D4ED8', fg: '#F8FAFC' },
  Potent: { bg: '#1D4ED8', fg: '#F8FAFC' },
};

const CHARGE_GLYPH: Partial<Record<ChargeId, string>> = {
  lion: '🦁',
  eagle: '🦅',
  fleur: '⚜️',
  rose: '🌹',
  escallop: '🐚',
  martlet: '🕊️',
  'cross-pattee': '✠',
  'cross-moline': '✚',
  mullet: '★',
  sun: '☀️',
  crescent: '🌙',
  crown: '👑',
  tower: '🏰',
  sword: '⚔️',
  key: '🗝️',
  annulet: '◎',
  lozenge: '◆',
};

const SOVEREIGN_SHAPES: readonly BaseShape[] = ['heater', 'french', 'iberian'];
const NOBLE_SHAPES: readonly BaseShape[] = ['heater', 'kite', 'bouche', 'french', 'iberian'];

function pickDeterministicShape(seed: string, pool: readonly BaseShape[]): BaseShape {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return pool[(h >>> 0) % pool.length];
}

export function cloneHeraldryConfig(cfg: HeraldryConfig): HeraldryConfig {
  return {
    ...cfg,
    field: { ...cfg.field },
    ordinary: { ...cfg.ordinary },
    charge: cfg.charge ? { ...cfg.charge } : null,
    cadency: cfg.cadency.map((m) => ({ ...m })),
    lineage: { ...cfg.lineage },
    marshalling: cfg.marshalling
      ? {
          mode: cfg.marshalling.mode,
          arms: cfg.marshalling.arms.map(cloneHeraldryConfig),
          inescutcheon: cfg.marshalling.inescutcheon
            ? cloneHeraldryConfig(cfg.marshalling.inescutcheon)
            : undefined,
        }
      : undefined,
  };
}

export function cloneCoatOfArmsData(coa: CoatOfArmsData): CoatOfArmsData {
  return {
    ...coa,
    config: coa.config ? cloneHeraldryConfig(coa.config) : undefined,
  };
}

export function configToCoatOfArmsData(res: HeraldryResult): CoatOfArmsData {
  const { config, blazon } = res;
  const primaryPalette = FILL_COLORS[config.field.primary] || { bg: '#991B1B', fg: '#FFFFFF' };
  const chargeHex =
    config.charge?.tincture && FILL_COLORS[config.charge.tincture]
      ? FILL_COLORS[config.charge.tincture].bg
      : config.ordinary?.tincture && FILL_COLORS[config.ordinary.tincture]
        ? FILL_COLORS[config.ordinary.tincture].bg
        : primaryPalette.fg;
  const symbol = config.charge ? CHARGE_GLYPH[config.charge.type] || '🛡️' : '🛡️';
  return {
    symbol,
    bg: primaryPalette.bg,
    fg: chargeHex,
    config: cloneHeraldryConfig(config),
    blazon,
  };
}

export function generateRealmHeraldry(seed: string, shape?: BaseShape): CoatOfArmsData {
  const chosenShape = shape ?? pickDeterministicShape(seed, SOVEREIGN_SHAPES);
  const res = generateHeraldry(seed, {
    shape: chosenShape,
    allowFurs: false,
    allowComplexFields: false,
    simple: true,
  });
  return configToCoatOfArmsData(res);
}

export function generateNobleArms(
  seed: string,
  options: HeraldryOptions & { gender?: 'male' | 'female'; isLanded?: boolean } = {}
): CoatOfArmsData {
  const defaultShape =
    options.shape ??
    options.shield ??
    (options.gender === 'female' && !options.isLanded
      ? 'lozenge'
      : pickDeterministicShape(seed, NOBLE_SHAPES));
  const res = generateHeraldry(seed, {
    ...options,
    shape: defaultShape,
  });
  return configToCoatOfArmsData(res);
}

/**
 * Canonical visual signature for a Coat of Arms, used to guarantee no two distinct
 * noble houses receive identical heraldry during world generation or house founding.
 */
export function getCoatOfArmsSignature(coa?: CoatOfArmsData): string {
  if (!coa) return '';
  const cfg = coa.config;
  if (!cfg) {
    return `${coa.bg}|${coa.fg}|${coa.symbol}|${coa.blazon || ''}`;
  }
  return [
    cfg.field.division,
    cfg.field.primary,
    cfg.field.secondary || '',
    cfg.ordinary?.type || 'none',
    cfg.ordinary?.tincture || '',
    cfg.charge?.type || 'none',
    cfg.charge?.tincture || '',
    cfg.charge?.count ?? 0,
  ].join('|');
}

/**
 * Generates a deterministic Coat of Arms guaranteed not to collide with any signature
 * already in `usedSignatures`. Registers the chosen signature in `usedSignatures`.
 */
export function generateUniqueHouseHeraldry(
  baseSeed: string,
  usedSignatures: Set<string>,
  options: {
    isSovereign?: boolean;
    gender?: 'male' | 'female';
    isLanded?: boolean;
    shape?: BaseShape;
  } = {}
): CoatOfArmsData {
  for (let attempt = 0; attempt < 64; attempt++) {
    const saltedSeed = attempt === 0 ? baseSeed : `${baseSeed}_hvar_${attempt * 37 + 13}`;
    const candidate = options.isSovereign
      ? generateRealmHeraldry(saltedSeed, options.shape)
      : generateNobleArms(saltedSeed, {
          gender: options.gender,
          isLanded: options.isLanded ?? true,
          shape: options.shape,
        });
    const sig = getCoatOfArmsSignature(candidate);
    if (!usedSignatures.has(sig)) {
      usedSignatures.add(sig);
      return candidate;
    }
  }
  const fallback = options.isSovereign
    ? generateRealmHeraldry(`${baseSeed}_fallback_${usedSignatures.size}`)
    : generateNobleArms(`${baseSeed}_fallback_${usedSignatures.size}`, { isLanded: true });
  usedSignatures.add(getCoatOfArmsSignature(fallback));
  return fallback;
}

export function differenceChildArms(
  parentArms: CoatOfArmsData | undefined,
  parentFallbackSeed: string,
  childSeed: string,
  sonOrder: number,
  isBastard: boolean
): CoatOfArmsData {
  const baseConfig =
    parentArms?.config ?? generateNobleArms(parentFallbackSeed, { shape: 'heater', isLanded: true }).config!;

  if (isBastard) {
    const res = createCadetBranch(baseConfig, {
      method: 'baton-sinister',
      branchSeed: childSeed,
    });
    return configToCoatOfArmsData(res);
  }

  const clampedOrder = Math.max(1, Math.min(9, Math.round(sonOrder))) as CadetBranchOptions['sonOrder'];
  const res = createCadetBranch(baseConfig, {
    method: 'brisure',
    sonOrder: clampedOrder,
    branchSeed: childSeed,
  });
  return configToCoatOfArmsData(res);
}

export function differenceCadetHouseArms(
  parentArms: CoatOfArmsData | undefined,
  parentFallbackSeed: string,
  cadetHouseName: string
): CoatOfArmsData {
  const baseConfig =
    parentArms?.config ?? generateRealmHeraldry(parentFallbackSeed, 'heater').config!;
  const res = createCadetBranch(baseConfig, {
    method: 'auto',
    subtle: true,
    branchSeed: cadetHouseName,
  });
  return configToCoatOfArmsData(res);
}

export function promoteHeirArmsToHead(
  heirArms: CoatOfArmsData | undefined,
  predecessorArms?: CoatOfArmsData
): CoatOfArmsData | undefined {
  if (!heirArms?.config) return predecessorArms ? cloneCoatOfArmsData(predecessorArms) : undefined;
  const cfg = cloneHeraldryConfig(heirArms.config);
  const hadLabelOnly =
    cfg.cadency.length > 0 && cfg.cadency[cfg.cadency.length - 1].brisure === 'label';
  if (!hadLabelOnly) return heirArms;

  cfg.cadency = cfg.cadency.filter((m) => !(m.method === 'brisure' && m.brisure === 'label'));
  cfg.lineage = {
    ...cfg.lineage,
    generation: Math.max(0, cfg.lineage.generation - 1),
  };
  return configToCoatOfArmsData(renderHeraldry(cfg));
}

// Memoized SVG & Image caches for React UI and 2D Canvas rendering
const SVG_CACHE = new Map<string, HeraldryResult>();
const MAX_SVG_CACHE = 400;

export function resolveHeraldryResult(
  coatOfArms: CoatOfArmsData | undefined,
  fallbackSeed: string,
  options: { shape?: BaseShape; width?: number; height?: number; sheen?: boolean; outline?: boolean } = {}
): HeraldryResult {
  const width = options.width ?? 200;
  const height = options.height ?? 240;
  const sheen = options.sheen ?? true;
  const outline = options.outline ?? true;

  let cfg: HeraldryConfig;
  if (coatOfArms?.config) {
    cfg = options.shape && coatOfArms.config.shape !== options.shape
      ? { ...coatOfArms.config, shape: options.shape }
      : coatOfArms.config;
  } else {
    cfg = generateHeraldry(fallbackSeed, {
      shape: options.shape ?? pickDeterministicShape(fallbackSeed, NOBLE_SHAPES),
    }).config;
  }

  const key = `${JSON.stringify(cfg)}|${width}x${height}|${sheen ? 1 : 0}|${outline ? 1 : 0}`;
  const cached = SVG_CACHE.get(key);
  if (cached) return cached;

  const result = renderHeraldry(cfg, { width, height, sheen, outline });
  if (SVG_CACHE.size >= MAX_SVG_CACHE) {
    const firstKey = SVG_CACHE.keys().next().value;
    if (firstKey !== undefined) SVG_CACHE.delete(firstKey);
  }
  SVG_CACHE.set(key, result);
  return result;
}

const FLAG_DATAURL_CACHE = new Map<string, { dataUrl: string; blazon: string }>();

export function resolveCountryFlagDataUrl(
  coatOfArms: CoatOfArmsData | undefined,
  fallbackSeed: string
): { dataUrl: string; blazon: string } {
  const res = resolveHeraldryResult(coatOfArms, fallbackSeed, {
    shape: 'banner',
    width: 360,
    height: 260,
    sheen: true,
    outline: false,
  });

  const cacheKey = `${res.blazon}|${res.svg.length}|${fallbackSeed}`;
  const cached = FLAG_DATAURL_CACHE.get(cacheKey);
  if (cached) return cached;

  // Crop the 200x240 heraldic viewport tightly to the rectangular banner bounds (10,55 -> 190,185)
  // so the flag fills the Realm tab background edge-to-edge with zero empty margin.
  const croppedSvg = res.svg
    .replace('viewBox="0 0 200 240"', 'viewBox="10 55 180 130" preserveAspectRatio="xMidYMid slice"')
    .replace(/\swidth="[^"]*"/, '')
    .replace(/\sheight="[^"]*"/, '');

  const entry = {
    dataUrl: toDataUrl(croppedSvg),
    blazon: res.blazon,
  };
  if (FLAG_DATAURL_CACHE.size >= 120) {
    const firstKey = FLAG_DATAURL_CACHE.keys().next().value;
    if (firstKey !== undefined) FLAG_DATAURL_CACHE.delete(firstKey);
  }
  FLAG_DATAURL_CACHE.set(cacheKey, entry);
  return entry;
}

export function resolveImpaledMarriageResult(
  armsA: CoatOfArmsData | undefined,
  seedA: string,
  armsB: CoatOfArmsData | undefined,
  seedB: string,
  options: { shape?: BaseShape; width?: number; height?: number } = {}
): HeraldryResult {
  const cfgA = armsA?.config ?? generateHeraldry(seedA, { shape: 'heater' }).config;
  const cfgB = armsB?.config ?? generateHeraldry(seedB, { shape: 'heater' }).config;
  const key = `impale|${JSON.stringify(cfgA)}|${JSON.stringify(cfgB)}|${options.shape ?? cfgA.shape}|${options.width ?? 200}x${options.height ?? 240}`;
  const cached = SVG_CACHE.get(key);
  if (cached) return cached;

  const result = impaleArms(cfgA, cfgB, {
    shape: options.shape ?? cfgA.shape,
    width: options.width ?? 200,
    height: options.height ?? 240,
  });
  if (SVG_CACHE.size >= MAX_SVG_CACHE) {
    const firstKey = SVG_CACHE.keys().next().value;
    if (firstKey !== undefined) SVG_CACHE.delete(firstKey);
  }
  SVG_CACHE.set(key, result);
  return result;
}

interface CachedCanvasHeraldry {
  img: HTMLImageElement;
  loaded: boolean;
}

const CANVAS_IMG_CACHE = new Map<string, CachedCanvasHeraldry>();

export function getCachedHeraldryCanvasImage(
  coatOfArms: CoatOfArmsData | undefined,
  fallbackSeed: string
): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  const cfg = coatOfArms?.config;
  if (!cfg) return null;

  const key = `${JSON.stringify(cfg)}|canvas`;
  const existing = CANVAS_IMG_CACHE.get(key);
  if (existing) {
    return existing.loaded ? existing.img : null;
  }

  const res = renderHeraldry(
    { ...cfg, shape: 'heater' },
    { width: 64, height: 76, sheen: true, outline: false }
  );
  const img = new Image();
  const entry: CachedCanvasHeraldry = { img, loaded: false };
  img.onload = () => {
    entry.loaded = true;
  };
  img.src = toDataUrl(res.svg);

  if (CANVAS_IMG_CACHE.size >= 160) {
    const firstKey = CANVAS_IMG_CACHE.keys().next().value;
    if (firstKey !== undefined) CANVAS_IMG_CACHE.delete(firstKey);
  }
  CANVAS_IMG_CACHE.set(key, entry);
  return entry.loaded ? entry.img : null;
}

export function getContrastingTextColor(tincture?: TinctureName): string {
  return tincture === 'Or' || tincture === 'Argent' ? '#1E293B' : '#FFFFFF';
}

// ============================================================================
// Feudal Heraldry & Banner Hierarchy Rules
// ============================================================================

const COMMONER_OR_GUILD_PREFIXES = [
  'Guild of ',
  'Guildhouse ',
  'Syndicate ',
  'Yeomanry of ',
  'The Common Folk',
  'Citadel Watch',
  'Order of the Wandering Lance',
  'The Night Syndicate',
  'The Crown Yeomanry',
];

const LOWER_COURTIER_ROLES = new Set<CourtRole>([
  'Lord Mayor',
  'Merchant Guildmaster',
  'Guildmaster',
  'Portmaster',
  'Master Artisan',
  'Peasant Folk Hero',
  'Captain of the Guard',
  'Hedge Knight',
  'Smuggler King',
  'Village Bailiff',
  'Yeoman Miller',
  'Village Herbalist',
  'Wandering Bard',
  'Court Jester',
  'Court Physician',
  'Court Antiquarian',
  'Grand Equerry',
  'Royal Cupbearer',
]);

const ROYAL_FAMILY_ROLES = new Set<CourtRole>([
  'Monarch',
  'Crown Heir',
  'Heir',
  'Child',
  'Cadet Prince',
  'Cadet Princess',
  'Noble Scion',
  'Vassal Heir',
  'Royal Uncle',
  'Dowager Regent',
  'Legitimated Bastard',
  'Disinherited Bastard',
]);

export function resolveTitleTier(char?: Partial<Character> | null): TitleTier {
  if (!char) return 'Commoner';
  if (char.titleTier) return char.titleTier;
  switch (char.role) {
    case 'Monarch':
      return 'King';
    case 'Vassal Duke':
      return 'Duke';
    case 'Vassal Count':
      return 'Count';
    case 'Vassal Baron':
    case 'Chancellor':
    case 'Marshal':
    case 'Steward':
    case 'Spymaster':
    case 'Court Chaplain':
    case 'Court Champion':
    case 'High Inquisitor':
    case 'Exiled Claimant':
    case 'Consort':
      return 'Baron';
    case 'Lord Mayor':
    case 'Merchant Guildmaster':
    case 'Guildmaster':
    case 'Portmaster':
      return 'Mayor';
    default:
      return 'Commoner';
  }
}

export function isBaronOrAboveTier(tier?: TitleTier, role?: CourtRole): boolean {
  const effectiveTier = tier ?? resolveTitleTier({ role });
  return (
    effectiveTier === 'Emperor' ||
    effectiveTier === 'King' ||
    effectiveTier === 'Duke' ||
    effectiveTier === 'Count' ||
    effectiveTier === 'Baron'
  );
}

/**
 * Only ranks of Duke, King, or Emperor may bestow a personal heraldic banner.
 */
export function canBestowBanner(char?: Partial<Character> | null): boolean {
  if (!char || char.isAlive === false) return false;
  const tier = resolveTitleTier(char);
  return tier === 'Emperor' || tier === 'King' || tier === 'Duke';
}

export function isNobleOrigin(char?: Partial<Character> | null): boolean {
  if (!char) return false;
  if (typeof char.isNobleHouse === 'boolean') return char.isNobleHouse;
  if (isBaronOrAboveTier(char.titleTier, char.role)) return true;
  if (char.isCadetFounder) return true;
  if (char.role && ROYAL_FAMILY_ROLES.has(char.role)) return true;
  const hName = (char.houseName || '').trim();
  if (!hName) return false;
  if (COMMONER_OR_GUILD_PREFIXES.some((prefix) => hName.startsWith(prefix))) {
    return false;
  }
  if (
    char.role === 'Master Artisan' ||
    char.role === 'Peasant Folk Hero' ||
    char.role === 'Captain of the Guard' ||
    char.role === 'Hedge Knight' ||
    char.role === 'Smuggler King' ||
    char.role === 'Village Bailiff' ||
    char.role === 'Yeoman Miller' ||
    char.role === 'Village Herbalist' ||
    char.role === 'Wandering Bard' ||
    char.role === 'Court Jester'
  ) {
    return false;
  }
  return true;
}

export function isRoyalHouseMember(
  char: Partial<Character>,
  realm?: Realm,
  monarch?: Character
): boolean {
  if (char.isCadetFounder) return false;
  const effectiveMonarch = monarch;
  if (effectiveMonarch && char.id === effectiveMonarch.id) return true;
  const royalHouse = effectiveMonarch?.houseName;
  if (royalHouse && char.houseName === royalHouse) {
    return true;
  }
  if (char.role && ROYAL_FAMILY_ROLES.has(char.role)) {
    return true;
  }
  void realm;
  return false;
}

export function canFoundCadetBranch(char?: Partial<Character> | null): boolean {
  if (!char || char.isAlive === false) return false;
  if (char.role === 'Monarch') return false;
  return isNobleOrigin(char) || Boolean(char.hasPersonalBanner);
}

export type HeraldStatusMode =
  | 'sovereign'
  | 'personal'
  | 'cadet'
  | 'bestowed'
  | 'royal_house'
  | 'house'
  | 'none';

export interface HeraldStatusInfo {
  mode: HeraldStatusMode;
  hasOwnBanner: boolean;
  label: string;
  subtitle: string;
}

export function getCharacterHeraldStatus(
  char: Character,
  world?: WorldState
): HeraldStatusInfo {
  const tier = resolveTitleTier(char);
  const realm = world?.realms?.find((r) => r.id === char.realmId);
  const monarch = world?.characters?.find((c) => c.id === realm?.rulerId);
  const isMonarchHead = char.role === 'Monarch' || tier === 'King' || tier === 'Emperor' || monarch?.id === char.id;

  if (isMonarchHead) {
    const isKingdomOrEmpire = tier === 'King' || tier === 'Emperor';
    return {
      mode: 'sovereign',
      hasOwnBanner: true,
      label: isKingdomOrEmpire ? 'Royal House & Kingdom Banner' : 'Sovereign House & Realm Banner',
      subtitle: `Sovereign standard of House ${char.houseName}`,
    };
  }
  if (char.isCadetFounder) {
    return {
      mode: 'cadet',
      hasOwnBanner: true,
      label: 'Cadet Branch Banner',
      subtitle: char.cadetParentHouse
        ? `Differenced from House ${char.cadetParentHouse}`
        : `Cadet arms of House ${char.houseName}`,
    };
  }
  if (char.bannerBestowedById) {
    return {
      mode: 'bestowed',
      hasOwnBanner: true,
      label: 'Bestowed Personal Banner',
      subtitle: char.bannerBestowedByName
        ? `Granted by ${char.bannerBestowedByName}${char.bannerBestowedYear ? ` (${char.bannerBestowedYear})` : ''}`
        : 'Conferred by sovereign decree',
    };
  }
  if (isRoyalHouseMember(char, realm, monarch)) {
    return {
      mode: 'royal_house',
      hasOwnBanner: false,
      label: 'Royal House Banner',
      subtitle: `Shared dynastic arms of House ${monarch?.houseName || char.houseName} (Cadet branch required for difference)`,
    };
  }
  if (isBaronOrAboveTier(tier, char.role)) {
    return {
      mode: 'personal',
      hasOwnBanner: true,
      label: `${tier} Heraldic Banner`,
      subtitle: `Personal achievement of House ${char.houseName}`,
    };
  }
  if (isNobleOrigin(char)) {
    return {
      mode: 'house',
      hasOwnBanner: false,
      label: `House ${char.houseName} Heraldry`,
      subtitle: `${char.role} rank (${tier}) — uses House heraldry until cadet branch or grant`,
    };
  }
  return {
    mode: 'none',
    hasOwnBanner: false,
    label: 'Unheralded Commoner',
    subtitle: 'No banner held — honor bestowable only by a Duke or King',
  };
}

export function renderUnheraldedSealSvg(width = 200, height = 240): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" width="${width}" height="${height}" role="img" aria-label="Unheralded Commoner — No Personal Banner"><path d="M 15 15 L 185 15 L 185 110 C 185 170, 145 205, 100 225 C 55 205, 15 170, 15 110 Z" fill="#1c1917" stroke="#57534e" stroke-width="5" stroke-linejoin="round"/><path d="M 28 28 L 172 28 L 172 108 C 172 160, 138 191, 100 209 C 62 191, 28 160, 28 108 Z" fill="none" stroke="#44403c" stroke-width="2" stroke-dasharray="6 5"/><circle cx="100" cy="112" r="24" fill="#292524" stroke="#57534e" stroke-width="2"/><path d="M 88 112 H 112" stroke="#78716c" stroke-width="3" stroke-linecap="round"/></svg>`;
}

/**
 * Enforces all domain heraldry & banner rules across characters, realms, duchies, and counties:
 * 1. Kingdom flags strictly mirror the Royal House's simpler banner.
 * 2. Royal Family members share the Royal House banner unless they formed a cadet branch.
 * 3. Only Barons+ (or cadet founders / Duke-or-King-bestowed) hold personal banners.
 * 4. Lower-rank nobles use their House's heraldry; commoners hold none unless bestowed.
 * 5. Duchy & County flags strictly match the ruling Duke's or Count's banner.
 */
export function syncWorldBanners(world: WorldState): void {
  const realms = world.realms || [];
  const characters = world.characters || [];
  const counties = world.counties || [];

  const realmMap = new Map<string, Realm>(realms.map((r) => [r.id, r]));
  const monarchByRealm = new Map<string, Character>();
  const houseHeadArms = new Map<string, CoatOfArmsData>();

  const tierRank = (c: Character): number => {
    const t = resolveTitleTier(c);
    if (c.role === 'Monarch' || t === 'Emperor') return 6;
    if (t === 'King') return 5;
    if (t === 'Duke') return 4;
    if (t === 'Count') return 3;
    if (t === 'Baron') return 2;
    if (t === 'Mayor') return 1;
    return 0;
  };

  // 1. Sync Sovereigns & Kingdom Flags (simple Royal House banner)
  for (const realm of realms) {
    const monarch =
      characters.find((c) => c.id === realm.rulerId && c.isAlive !== false) ||
      characters.find((c) => c.id === realm.rulerId);

    if (monarch) {
      monarchByRealm.set(realm.id, monarch);
      monarch.isNobleHouse = true;
      monarch.hasPersonalBanner = true;

      if (realm.customHeraldry && realm.heraldry?.config) {
        realm.coatOfArms = cloneCoatOfArmsData(realm.heraldry);
        if (!monarch.customHeraldry) {
          monarch.coatOfArms = cloneCoatOfArmsData(realm.heraldry);
        }
      } else {
        if (!monarch.coatOfArms?.config) {
          monarch.coatOfArms = realm.heraldry?.config
            ? cloneCoatOfArmsData(realm.heraldry)
            : generateRealmHeraldry(`${realm.id}_House_${monarch.houseName || realm.name}`);
        }
        realm.heraldry = cloneCoatOfArmsData(monarch.coatOfArms);
        realm.coatOfArms = cloneCoatOfArmsData(monarch.coatOfArms);
      }
      if (monarch.houseName) {
        houseHeadArms.set(
          `${realm.id}::${monarch.houseName}`,
          cloneCoatOfArmsData(monarch.coatOfArms || realm.heraldry)
        );
      }
    } else if (realm.heraldry?.config) {
      realm.coatOfArms = cloneCoatOfArmsData(realm.heraldry);
    }
  }

  // 2. Register canonical house arms from highest-ranking living nobles / cadet houses
  if (world.cadetHouses) {
    for (const [hName, cadet] of Object.entries(world.cadetHouses)) {
      if (cadet.coatOfArms?.config) {
        const founder = characters.find((c) => c.id === cadet.founderId);
        const rId = founder?.realmId;
        if (rId) {
          houseHeadArms.set(`${rId}::${hName}`, cloneCoatOfArmsData(cadet.coatOfArms));
        }
      }
    }
  }

  const sortedChars = characters.slice().sort((a, b) => tierRank(b) - tierRank(a));
  for (const ch of sortedChars) {
    if (!ch.houseName || !isNobleOrigin(ch)) continue;
    const key = `${ch.realmId}::${ch.houseName}`;
    if (!houseHeadArms.has(key) && ch.coatOfArms?.config) {
      houseHeadArms.set(key, cloneCoatOfArmsData(ch.coatOfArms));
    }
  }

  // 3. Apply Rank, Royal Family, Cadet, and Commoner Rules to all characters
  for (const ch of characters) {
    const realm = realmMap.get(ch.realmId);
    const monarch = monarchByRealm.get(ch.realmId);
    const tier = resolveTitleTier(ch);
    if (!ch.titleTier) ch.titleTier = tier;

    const nobleOrigin = isNobleOrigin(ch);
    ch.isNobleHouse = nobleOrigin;

    const royal = isRoyalHouseMember(ch, realm, monarch);

    if (monarch && ch.id === monarch.id) {
      ch.hasPersonalBanner = true;
      continue;
    }

    if (ch.customHeraldry && ch.coatOfArms?.config) {
      ch.hasPersonalBanner = true;
      continue;
    }

    if (ch.isCadetFounder) {
      ch.hasPersonalBanner = true;
      ch.isNobleHouse = true;
      if (!ch.coatOfArms?.config) {
        const parentKey = `${ch.realmId}::${ch.cadetParentHouse || monarch?.houseName || ch.houseName}`;
        const parentArms = houseHeadArms.get(parentKey) || monarch?.coatOfArms;
        ch.coatOfArms = differenceCadetHouseArms(parentArms, parentKey, ch.houseName);
      }
      continue;
    }

    if (ch.bannerBestowedById) {
      ch.hasPersonalBanner = true;
      if (!ch.coatOfArms?.config) {
        const key = `${ch.realmId}::${ch.houseName}`;
        const baseArms = houseHeadArms.get(key);
        ch.coatOfArms =
          nobleOrigin && baseArms
            ? differenceCadetHouseArms(baseArms, key, `${ch.houseName}_${ch.id}`)
            : generateNobleArms(`bestowed_${ch.id}_${ch.name}`, { gender: ch.gender, isLanded: true, allowFurs: false });
      }
      continue;
    }

    // Royal Family (who did NOT form a cadet branch) always use the Royal House's banner
    if (royal && monarch?.coatOfArms?.config) {
      ch.coatOfArms = cloneCoatOfArmsData(monarch.coatOfArms);
      ch.hasPersonalBanner = false;
      continue;
    }

    // Barons and above get personal banners
    if (isBaronOrAboveTier(tier, ch.role) && !LOWER_COURTIER_ROLES.has(ch.role)) {
      ch.isNobleHouse = true;
      ch.hasPersonalBanner = true;
      if (!ch.coatOfArms?.config) {
        const key = `${ch.realmId}::${ch.houseName}`;
        if (!houseHeadArms.has(key)) {
          houseHeadArms.set(
            key,
            generateNobleArms(`house_${ch.realmId}_${ch.houseName}`, {
              gender: ch.gender,
              isLanded: true,
            })
          );
        }
        ch.coatOfArms = cloneCoatOfArmsData(houseHeadArms.get(key)!);
      }
      continue;
    }

    // Lower rank (< Baron):
    if (nobleOrigin) {
      // Noble house lower rank without cadet branch -> uses their house's heraldry
      const key = `${ch.realmId}::${ch.houseName}`;
      if (!houseHeadArms.has(key)) {
        houseHeadArms.set(
          key,
          generateNobleArms(`house_${ch.realmId}_${ch.houseName}`, {
            gender: ch.gender,
            isLanded: false,
          })
        );
      }
      ch.coatOfArms = cloneCoatOfArmsData(houseHeadArms.get(key)!);
      ch.hasPersonalBanner = false;
    } else {
      // Non-noble commoner without bestowed banner -> NO herald
      ch.coatOfArms = undefined;
      ch.hasPersonalBanner = false;
    }
  }

  // 4. Duchy & County flags strictly use the ruling Duke's or Count's banner unless customized
  for (const county of counties) {
    if (county.customHeraldry && county.coatOfArms?.config) {
      continue;
    }
    const countyRuler =
      characters.find((c) => c.id === county.rulerId && c.isAlive !== false) ||
      characters.find((c) => c.id === county.rulerId);
    const realm = realmMap.get(county.realmId);
    const bannerSource = countyRuler?.coatOfArms?.config
      ? countyRuler.coatOfArms
      : realm?.heraldry?.config
      ? realm.heraldry
      : undefined;
    county.coatOfArms = bannerSource ? cloneCoatOfArmsData(bannerSource) : undefined;
  }
}
