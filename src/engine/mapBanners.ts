import type { Burg, CoatOfArmsData, County, Realm } from '../types/world';
import { toDataUrl } from './heraldry';
import { resolveHeraldryResult } from '../utils/heraldryBridge';

const shieldImageCache = new Map<string, HTMLImageElement | null>();

function getOrLoadHeraldryImage(
  key: string,
  coa: CoatOfArmsData | undefined,
  seed: string
): HTMLImageElement | null {
  if (shieldImageCache.has(key)) {
    return shieldImageCache.get(key) || null;
  }
  if (typeof window === 'undefined' || typeof Image === 'undefined') return null;

  try {
    const res = resolveHeraldryResult(coa, seed);
    if (!res?.svg) {
      shieldImageCache.set(key, null);
      return null;
    }
    const img = new Image();
    img.src = toDataUrl(res.svg);
    shieldImageCache.set(key, img);
    return img;
  } catch {
    shieldImageCache.set(key, null);
    return null;
  }
}

function drawPoleAndBanner(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  isState: boolean,
  primaryColor: string,
  accentColor: string,
  img: HTMLImageElement | null,
  label: string,
  showLabel: boolean
) {
  ctx.save();
  ctx.translate(x, y);

  const poleHeight = (isState ? 28 : 20) * scale;
  const bannerW = (isState ? 18 : 13) * scale;
  const bannerH = (isState ? 21 : 15) * scale;
  const topY = -poleHeight;

  // Ground shadow
  ctx.beginPath();
  ctx.ellipse(0, 1 * scale, (isState ? 5.5 : 4) * scale, (isState ? 2.2 : 1.6) * scale, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fill();

  // Pole shaft
  ctx.strokeStyle = isState ? '#f5d073' : '#cbd5e1';
  ctx.lineWidth = Math.max(1.2, (isState ? 2.1 : 1.5) * scale);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, topY);
  ctx.stroke();

  // Finial (spearhead / crown orb)
  ctx.fillStyle = isState ? '#fbbf24' : '#e2e8f0';
  ctx.beginPath();
  ctx.arc(0, topY - 1.5 * scale, (isState ? 2.4 : 1.7) * scale, 0, Math.PI * 2);
  ctx.fill();

  // Crossbar for State gonfalon
  if (isState) {
    ctx.strokeStyle = '#f5d073';
    ctx.lineWidth = Math.max(1, 1.5 * scale);
    ctx.beginPath();
    ctx.moveTo(0, topY + 2 * scale);
    ctx.lineTo(bannerW + 2 * scale, topY + 2 * scale);
    ctx.stroke();
  }

  // Banner cloth silhouette (swallowtail for State, pointed pennon for Duchy)
  const bx = 1.2 * scale;
  const by = topY + (isState ? 2.5 : 1.5) * scale;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 4 * scale;
  ctx.shadowOffsetY = 1.5 * scale;

  ctx.beginPath();
  if (isState) {
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + bannerW, by);
    ctx.lineTo(bx + bannerW, by + bannerH);
    ctx.lineTo(bx + bannerW * 0.5, by + bannerH * 0.78);
    ctx.lineTo(bx, by + bannerH);
    ctx.closePath();
  } else {
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + bannerW, by + bannerH * 0.28);
    ctx.lineTo(bx + bannerW * 0.85, by + bannerH * 0.86);
    ctx.lineTo(bx, by + bannerH);
    ctx.closePath();
  }
  ctx.fillStyle = primaryColor || '#7f1d1d';
  ctx.fill();
  ctx.restore();

  // Metallic border trim
  ctx.strokeStyle = isState ? '#fbbf24' : accentColor || '#e2e8f0';
  ctx.lineWidth = Math.max(0.8, (isState ? 1.3 : 1.0) * scale);
  ctx.stroke();

  // Heraldic Coat of Arms shield inside banner
  if (img && img.complete && img.naturalWidth > 0) {
    const shieldW = bannerW * (isState ? 0.76 : 0.72);
    const shieldH = shieldW * 1.15;
    const sx = bx + (bannerW - shieldW) * 0.5;
    const sy = by + (bannerH * 0.72 - shieldH) * 0.5;
    ctx.drawImage(img, sx, sy, shieldW, shieldH);
  } else {
    // Clean geometric crest fallback while image loads
    ctx.fillStyle = accentColor || '#fef08a';
    ctx.beginPath();
    ctx.arc(bx + bannerW * 0.5, by + bannerH * 0.42, bannerW * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }

  // Optional crisp micro-label under pole
  if (showLabel && label) {
    ctx.font = `600 ${Math.max(8, Math.round((isState ? 9.5 : 8) * scale))}px Cinzel, Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    const metrics = ctx.measureText(label);
    const padX = 4 * scale;
    const boxW = metrics.width + padX * 2;
    const boxH = (isState ? 12 : 10) * scale;
    ctx.fillRect(-boxW / 2, 3 * scale, boxW, boxH);
    ctx.strokeStyle = isState ? 'rgba(251, 191, 36, 0.55)' : 'rgba(148, 163, 184, 0.45)';
    ctx.lineWidth = 0.75;
    ctx.strokeRect(-boxW / 2, 3 * scale, boxW, boxH);
    ctx.fillStyle = isState ? '#fef3c7' : '#e2e8f0';
    ctx.fillText(label, 0, 4.5 * scale);
  }

  ctx.restore();
}

/**
 * Renders heraldic banners for States (at each Realm's capital) and Duchies (at each Duchy seat).
 * Designed to be toggleable via `activeLayers.banners`.
 */
export function drawStateAndDuchyBanners(
  ctx: CanvasRenderingContext2D,
  realms: Realm[],
  counties: County[],
  burgs: Burg[],
  zoom: number,
  projectY: (x: number, y: number) => number = (_x, y) => y
): void {
  if (!realms || realms.length === 0 || !burgs || burgs.length === 0) return;

  const invScale = Math.max(0.55, Math.min(1.25, 1.0 / Math.pow(Math.max(0.45, zoom), 0.55)));
  const placedPoints: { x: number; y: number }[] = [];

  // 1. State (Realm) Royal Banners at each capital
  for (const realm of realms) {
    const capBurg =
      burgs.find((b) => b.id === realm.capitalBurgId) ||
      burgs.find((b) => b.stateId === realm.id && b.isCapital) ||
      burgs.find((b) => b.stateId === realm.id);
    if (!capBurg) continue;

    const px = capBurg.x + 8 * invScale;
    const py = projectY(capBurg.x, capBurg.y) - 6 * invScale;
    const coa = realm.coatOfArms || realm.heraldry;
    const coaSig = coa?.config ? JSON.stringify(coa.config) : `${coa?.blazon || ''}_${coa?.bg || ''}`;
    const img = getOrLoadHeraldryImage(`state_${realm.id}_${coaSig}`, coa, `realm_${realm.id}`);
    drawPoleAndBanner(
      ctx,
      px,
      py,
      invScale,
      true,
      coa?.bg || realm.color || '#7f1d1d',
      coa?.fg || '#fbbf24',
      img,
      realm.name,
      zoom >= 0.75
    );
    placedPoints.push({ x: px, y: py });
  }

  // 2. Duchy Heraldic Banners at each Grand Duchy seat (excluding Royal Duchies that overlap the capital)
  const seenDuchyIds = new Set<string>();
  const minSeparation = 22 * invScale;

  for (const county of counties || []) {
    if (county.tier !== 'Duchy') continue;
    const duchyKey = county.duchyId || county.id;
    if (seenDuchyIds.has(duchyKey)) continue;
    seenDuchyIds.add(duchyKey);

    const seatBurg =
      burgs.find((b) => b.id === county.capitalBurgId) ||
      burgs.find((b) => b.countyId === county.id);
    if (!seatBurg || seatBurg.isCapital) continue;

    const px = seatBurg.x + 6 * invScale;
    const py = projectY(seatBurg.x, seatBurg.y) - 5 * invScale;

    // Avoid visual clutter right on top of a State banner
    const collides = placedPoints.some((pt) => Math.hypot(pt.x - px, pt.y - py) < minSeparation);
    if (collides) continue;

    const parentRealm = realms.find((r) => r.id === county.realmId);
    const coa = county.coatOfArms || parentRealm?.coatOfArms || parentRealm?.heraldry;
    const coaSig = coa?.config ? JSON.stringify(coa.config) : `${coa?.blazon || ''}_${coa?.bg || ''}`;
    const img = getOrLoadHeraldryImage(`duchy_${county.id}_${coaSig}`, coa, `duchy_${county.id}`);
    const shortName = (county.duchyName || county.name).replace(/^Grand Duchy of\s+/i, '').replace(/^Duchy of\s+/i, '');

    drawPoleAndBanner(
      ctx,
      px,
      py,
      invScale * 0.92,
      false,
      coa?.bg || parentRealm?.color || '#1e3a5f',
      coa?.fg || '#e2e8f0',
      img,
      shortName,
      zoom >= 1.25
    );
    placedPoints.push({ x: px, y: py });
  }
}
