import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Flame,
  Compass,
  ScrollText,
  Layers,
} from 'lucide-react';
import type { Burg, Point2D, WorldState } from '../types/world';
import {
  CityBlueprint,
  CitySlotFeature,
  generateCityBlueprint,
} from '../engine/cityMapGenerator';
import { SettlementBlueprintPanel } from './SettlementBlueprintPanel';

interface CityMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  world: WorldState;
  burg: Burg | undefined;
  onUpdateWorld?: (next: WorldState) => void;
  onNotify?: (msg: string) => void;
}

interface RenderOptions {
  showLabels: boolean;
  showGrid: boolean;
  showEmptyPlots: boolean;
  hoveredSlotId: string | null;
  selectedSlotId: string | null;
  isExport?: boolean;
}

function drawPolygonPath(ctx: CanvasRenderingContext2D, pts: Point2D[]) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.closePath();
}

function drawCompassRose(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = '#4e3f2d';
  ctx.fillStyle = '#4e3f2d';
  ctx.lineWidth = 1.4;

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
  ctx.stroke();

  // Four cardinal points
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI) / 2);
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.96);
    ctx.lineTo(r * 0.18, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fillStyle = i === 0 ? '#7c2d12' : '#4e3f2d';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, -r * 0.96);
    ctx.lineTo(-r * 0.18, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fillStyle = '#e8dcc3';
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  ctx.font = 'bold 12px Cinzel, Georgia, serif';
  ctx.fillStyle = '#3b2e20';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', 0, -r - 10);
  ctx.restore();
}

function renderCityBlueprint(
  ctx: CanvasRenderingContext2D,
  city: CityBlueprint,
  opts: RenderOptions
) {
  const { width, height } = city;

  // 1. Parchment Meadow Base
  const grad = ctx.createRadialGradient(
    city.center.x,
    city.center.y,
    60,
    city.center.x,
    city.center.y,
    Math.max(width, height) * 0.72
  );
  grad.addColorStop(0, '#ebe0c6');
  grad.addColorStop(0.55, '#dfd2b3');
  grad.addColorStop(1, '#cfbe9a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Subtle parchment survey grid if enabled
  if (opts.showGrid) {
    ctx.save();
    ctx.strokeStyle = 'rgba(92, 74, 52, 0.11)';
    ctx.lineWidth = 0.75;
    for (let x = 0; x <= width; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 2. Quilted Farmland Strips & Hedgerows
  for (const f of city.fields) {
    if (f.polygon.length < 3) continue;
    drawPolygonPath(ctx, f.polygon);
    ctx.fillStyle = f.fillColor;
    ctx.globalAlpha = 0.62;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(98, 108, 69, 0.35)';
    ctx.lineWidth = 0.9;
    ctx.stroke();

    // Subtle crop furrow lines inside crop fields
    if (f.kind === 'crop') {
      const cx = f.polygon.reduce((s, p) => s + p.x, 0) / f.polygon.length;
      const cy = f.polygon.reduce((s, p) => s + p.y, 0) / f.polygon.length;
      ctx.save();
      ctx.beginPath();
      drawPolygonPath(ctx, f.polygon);
      ctx.clip();
      ctx.strokeStyle = 'rgba(110, 100, 62, 0.22)';
      ctx.lineWidth = 0.7;
      const cos = Math.cos(f.furrowAngle);
      const sin = Math.sin(f.furrowAngle);
      for (let off = -42; off <= 42; off += 6) {
        const ox = -sin * off;
        const oy = cos * off;
        ctx.beginPath();
        ctx.moveTo(cx + ox - cos * 60, cy + oy - sin * 60);
        ctx.lineTo(cx + ox + cos * 60, cy + oy + sin * 60);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // Woodland tree canopies outside the core
  for (const t of city.treeClusters) {
    ctx.beginPath();
    ctx.arc(t.x + 1.5, t.y + 1.5, t.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(42, 46, 28, 0.22)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.fillStyle = '#7b8d56';
    ctx.fill();
    ctx.strokeStyle = '#536238';
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }

  // 3. Level 3 Moat Ring (drawn under walls & bridges)
  if (city.moatLoop.length >= 3) {
    drawPolygonPath(ctx, city.moatLoop);
    ctx.strokeStyle = '#7fa6b3';
    ctx.lineWidth = 11;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.strokeStyle = '#587885';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  // 4. Coastal Water & Rivers
  if (city.hasCoastalWater && city.waterPolygon.length >= 3) {
    drawPolygonPath(ctx, city.waterPolygon);
    ctx.fillStyle = '#8eb3bf';
    ctx.fill();
    ctx.strokeStyle = '#5c7c88';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Waterline hatching near shore
    ctx.save();
    drawPolygonPath(ctx, city.waterPolygon);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1;
    for (let y = 0; y < height; y += 14) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  for (const rPoly of city.riverPolygons) {
    if (rPoly.length < 3) continue;
    drawPolygonPath(ctx, rPoly);
    ctx.fillStyle = '#8cb1be';
    ctx.fill();
    ctx.strokeStyle = '#5a7985';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  // 5. Arterial Highways, Secondary Streets & Market Plaza
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const road of city.roads) {
    if (road.points.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(road.points[0].x, road.points[0].y);
    for (let i = 1; i < road.points.length; i++) {
      ctx.lineTo(road.points[i].x, road.points[i].y);
    }
    ctx.strokeStyle = road.kind === 'artery' ? '#7b6850' : '#948268';
    ctx.lineWidth = road.width + 2;
    ctx.stroke();

    ctx.strokeStyle = road.kind === 'artery' ? '#f1e7d0' : '#e7dcc2';
    ctx.lineWidth = road.width;
    ctx.stroke();
  }

  // Central Market Plaza
  if (city.marketPlaza.length >= 3) {
    drawPolygonPath(ctx, city.marketPlaza);
    ctx.fillStyle = '#efe3ca';
    ctx.fill();
    ctx.strokeStyle = '#8b775d';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Market cross at plaza center when Market built
    if (city.marketLevel > 0) {
      ctx.beginPath();
      ctx.arc(city.center.x, city.center.y, 4.2, 0, Math.PI * 2);
      ctx.fillStyle = '#8a6b48';
      ctx.fill();
      ctx.strokeStyle = '#3e3022';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // Bridges over rivers
  for (const br of city.bridges) {
    ctx.save();
    ctx.translate(br.center.x, br.center.y);
    ctx.rotate(br.angle);
    ctx.fillStyle = '#b9ad97';
    ctx.strokeStyle = '#4f4335';
    ctx.lineWidth = 1.4;
    ctx.fillRect(-br.length * 0.5, -br.width * 0.5, br.length, br.width);
    ctx.strokeRect(-br.length * 0.5, -br.width * 0.5, br.length, br.width);
    ctx.restore();
  }

  // 6. Citadel Inner Ward Perimeter
  if (city.citadelWardLoop.length >= 3) {
    drawPolygonPath(ctx, city.citadelWardLoop);
    ctx.fillStyle = 'rgba(218, 206, 182, 0.85)';
    ctx.fill();
    ctx.strokeStyle = '#47433e';
    ctx.lineWidth = 3.2;
    ctx.stroke();
  }

  // 7. Piers & Harbor Quays (Slot-Driven)
  for (const sf of city.slotFeatures) {
    if (!sf.piers) continue;
    for (const pier of sf.piers) {
      drawPolygonPath(ctx, pier);
      ctx.fillStyle = sf.level >= 2 ? '#b7ad9a' : '#8e6b4a';
      ctx.fill();
      ctx.strokeStyle = '#4a3d2e';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
    if (sf.courtyards) {
      for (const cy of sf.courtyards) {
        drawPolygonPath(ctx, cy);
        ctx.fillStyle = 'rgba(224, 214, 190, 0.72)';
        ctx.fill();
        ctx.strokeStyle = '#6b5c49';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }
  }

  // 8. Twisted-Bisection Houses
  for (const h of city.houses) {
    if (h.polygon.length < 3) continue;
    // Drop shadow
    ctx.save();
    ctx.translate(1.8, 1.8);
    drawPolygonPath(ctx, h.polygon);
    ctx.fillStyle = 'rgba(42, 34, 24, 0.24)';
    ctx.fill();
    ctx.restore();

    drawPolygonPath(ctx, h.polygon);
    ctx.fillStyle = h.roofColor;
    ctx.fill();
    ctx.strokeStyle = h.isRuined ? '#241e19' : '#3a2f25';
    ctx.lineWidth = h.isRuined ? 1.1 : 0.85;
    if (h.isRuined) {
      ctx.setLineDash([3, 2]);
    }
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    // Roof ridge line
    if (!h.isRuined && h.ridgeStart && h.ridgeEnd) {
      ctx.beginPath();
      ctx.moveTo(h.ridgeStart.x, h.ridgeStart.y);
      ctx.lineTo(h.ridgeEnd.x, h.ridgeEnd.y);
      ctx.strokeStyle = 'rgba(255, 248, 232, 0.28)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }

  // 9. Slot Landmarks & Buildable Empty Ward Plots
  for (const sf of city.slotFeatures) {
    const isHovered = opts.hoveredSlotId === sf.slotId;
    const isSelected = opts.selectedSlotId === sf.slotId;

    // Empty unlocked buildable plot
    if (sf.level === 0) {
      if (opts.showEmptyPlots || isHovered || isSelected) {
        drawPolygonPath(ctx, sf.plotPolygon);
        ctx.fillStyle =
          isHovered || isSelected
            ? 'rgba(217, 119, 6, 0.22)'
            : sf.isUnlocked
            ? 'rgba(180, 148, 92, 0.14)'
            : 'rgba(120, 113, 108, 0.08)';
        ctx.fill();
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle =
          isHovered || isSelected
            ? '#b45309'
            : sf.isUnlocked
            ? 'rgba(146, 102, 42, 0.72)'
            : 'rgba(120, 113, 108, 0.4)';
        ctx.lineWidth = isHovered || isSelected ? 2 : 1.1;
        ctx.stroke();
        ctx.restore();
      }
    } else {
      // Built Architectural Footprints
      for (const st of sf.structures) {
        if (st.polygon.length < 3) continue;
        ctx.save();
        ctx.translate(2.5, 2.5);
        drawPolygonPath(ctx, st.polygon);
        ctx.fillStyle = 'rgba(30, 24, 18, 0.32)';
        ctx.fill();
        ctx.restore();

        drawPolygonPath(ctx, st.polygon);
        ctx.fillStyle = st.isRuined ? '#443b34' : st.roofColor;
        ctx.fill();
        ctx.strokeStyle = st.isRuined ? '#7f1d1d' : '#2a221b';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    }

    // Highlight Halo on Hover / Select
    if (isHovered || isSelected) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(sf.center.x, sf.center.y, sf.boundsRadius + 6, 0, Math.PI * 2);
      ctx.strokeStyle = isSelected ? '#d97706' : '#f59e0b';
      ctx.lineWidth = isSelected ? 2.8 : 2;
      if (!isSelected) ctx.setLineDash([5, 3]);
      ctx.stroke();
      ctx.fillStyle = 'rgba(245, 158, 11, 0.13)';
      ctx.fill();
      ctx.restore();
    }
  }

  // 10. War Devastation Rubble Patches
  for (const rb of city.rubblePatches) {
    ctx.save();
    ctx.translate(rb.x, rb.y);
    ctx.rotate(rb.angle);
    ctx.fillStyle = 'rgba(54, 46, 40, 0.55)';
    ctx.beginPath();
    ctx.arc(0, 0, rb.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(92, 82, 74, 0.8)';
    ctx.fillRect(-rb.radius * 0.5, -2, 3, 3);
    ctx.fillRect(rb.radius * 0.2, 1, 2.5, 2.5);
    ctx.restore();
  }

  // 11. City Curtain Walls, Bastions & Gatehouses
  for (const ws of city.wallSegments) {
    if (ws.isBreached) {
      // Jagged breached wall stumps
      const mx = (ws.a.x + ws.b.x) * 0.5;
      const my = (ws.a.y + ws.b.y) * 0.5;
      ctx.beginPath();
      ctx.moveTo(ws.a.x, ws.a.y);
      ctx.lineTo(ws.a.x + (mx - ws.a.x) * 0.45, ws.a.y + (my - ws.a.y) * 0.45);
      ctx.moveTo(ws.b.x, ws.b.y);
      ctx.lineTo(ws.b.x + (mx - ws.b.x) * 0.45, ws.b.y + (my - ws.b.y) * 0.45);
      ctx.strokeStyle = ws.tier === 1 ? '#6b4c30' : '#4a453f';
      ctx.lineWidth = ws.tier === 1 ? 3.2 : ws.isOuter ? 3.6 : 5;
      ctx.stroke();
      continue;
    }

    ctx.beginPath();
    ctx.moveTo(ws.a.x, ws.a.y);
    ctx.lineTo(ws.b.x, ws.b.y);
    ctx.strokeStyle = '#2d2620';
    ctx.lineWidth = ws.tier === 1 ? 4.4 : ws.isOuter ? 4.5 : 6.4;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(ws.a.x, ws.a.y);
    ctx.lineTo(ws.b.x, ws.b.y);
    ctx.strokeStyle = ws.tier === 1 ? '#8b623c' : '#c7bba5';
    ctx.lineWidth = ws.tier === 1 ? 2.4 : ws.isOuter ? 2.5 : 3.8;
    ctx.stroke();
  }

  for (const bt of city.bastions) {
    if (bt.isBreached) continue;
    ctx.save();
    ctx.translate(bt.x, bt.y);
    ctx.rotate(bt.angle);
    if (bt.kind === 'star') {
      // Angled polygonal bastion pointing outward
      drawPolygonPath(ctx, [
        { x: bt.radius * 1.35, y: 0 },
        { x: 0, y: bt.radius * 0.85 },
        { x: -bt.radius * 0.6, y: bt.radius * 0.5 },
        { x: -bt.radius * 0.6, y: -bt.radius * 0.5 },
        { x: 0, y: -bt.radius * 0.85 },
      ]);
      ctx.fillStyle = '#c4b7a0';
      ctx.fill();
      ctx.strokeStyle = '#2f2822';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, bt.radius, 0, Math.PI * 2);
      ctx.fillStyle = bt.kind === 'timber' ? '#855c37' : '#c6baa4';
      ctx.fill();
      ctx.strokeStyle = '#2e2720';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.restore();
  }

  for (const gh of city.gatehouses) {
    ctx.save();
    ctx.translate(gh.x, gh.y);
    ctx.rotate(gh.angle);
    const w = gh.tier >= 2 ? 12 : 8;
    const d = gh.tier >= 2 ? 14 : 10;
    ctx.fillStyle = gh.isBreached ? '#574a40' : gh.tier === 1 ? '#805734' : '#b7aa94';
    ctx.strokeStyle = '#26201a';
    ctx.lineWidth = 1.4;
    // Flanking gatehouse towers
    ctx.fillRect(-d * 0.5, -w * 0.85, d, w * 0.5);
    ctx.strokeRect(-d * 0.5, -w * 0.85, d, w * 0.5);
    ctx.fillRect(-d * 0.5, w * 0.35, d, w * 0.5);
    ctx.strokeRect(-d * 0.5, w * 0.35, d, w * 0.5);
    ctx.restore();
  }

  // 12. Road Destination Labels & Numbered Key Markers (1..10)
  if (opts.showLabels) {
    ctx.font = 'italic 10px Lora, Georgia, serif';
    ctx.fillStyle = 'rgba(56, 44, 32, 0.85)';
    ctx.textAlign = 'center';
    for (const r of city.roads) {
      if (r.kind !== 'artery' || !r.destinationLabel || r.points.length < 2) continue;
      const tip = r.points[Math.max(1, r.points.length - 2)];
      const tx = Math.max(58, Math.min(width - 58, tip.x));
      const ty = Math.max(24, Math.min(height - 24, tip.y));
      ctx.fillText(r.destinationLabel, tx, ty - 6);
    }

    // Draw numbered gold-ringed landmark medallions (1..10)
    for (const item of city.legend) {
      const isHighlighted =
        item.kind === 'slot' &&
        (opts.hoveredSlotId === item.id || opts.selectedSlotId === item.id);
      const r = isHighlighted ? 11.5 : 9.5;
      ctx.beginPath();
      ctx.arc(item.center.x, item.center.y - 12, r, 0, Math.PI * 2);
      ctx.fillStyle =
        item.kind === 'pin'
          ? '#7c2d12'
          : isHighlighted
          ? '#d97706'
          : '#29221a';
      ctx.fill();
      ctx.strokeStyle = item.dilapidated ? '#ef4444' : '#f3d38b';
      ctx.lineWidth = isHighlighted ? 2.2 : 1.5;
      ctx.stroke();

      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = '#fef3c7';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(item.number), item.center.x, item.center.y - 11.5);
    }
  }

  // Export-only Compass Rose inside parchment map
  if (opts.isExport) {
    drawCompassRose(ctx, 68, 78, 28);
  }
}

export const CityMapModal: React.FC<CityMapModalProps> = ({
  isOpen,
  onClose,
  world,
  burg,
  onUpdateWorld,
  onNotify,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rightTab, setRightTab] = useState<'blueprint' | 'legend'>('blueprint');
  const [hoveredSlotId, setHoveredSlotId] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [showEmptyPlots, setShowEmptyPlots] = useState<boolean>(true);

  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<Point2D>({ x: 0, y: 0 });
  const dragRef = useRef<{ active: boolean; moved: boolean; lastX: number; lastY: number }>({
    active: false,
    moved: false,
    lastX: 0,
    lastY: 0,
  });

  const liveBurg = useMemo(
    () => (burg ? world.burgs.find((b) => b.id === burg.id) || burg : undefined),
    [world.burgs, burg]
  );

  const city = useMemo(() => {
    if (!isOpen || !liveBurg) return null;
    return generateCityBlueprint(world, liveBurg);
  }, [isOpen, world, liveBurg]);

  // Reset camera & selection when switching settlements
  useEffect(() => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
    setSelectedSlotId(null);
    setHoveredSlotId(null);
  }, [liveBurg?.id]);

  // Convert client mouse event to logical [1000 x 800] map coordinates
  const clientToLogical = useCallback(
    (clientX: number, clientY: number): Point2D | null => {
      const canvas = canvasRef.current;
      if (!canvas || !city) return null;
      const rect = canvas.getBoundingClientRect();
      const sx = ((clientX - rect.left) / Math.max(1, rect.width)) * canvas.width;
      const sy = ((clientY - rect.top) / Math.max(1, rect.height)) * canvas.height;
      const baseScale = Math.min(canvas.width / city.width, canvas.height / city.height);
      const effScale = baseScale * zoom;
      const ox = (canvas.width - city.width * effScale) * 0.5 + pan.x;
      const oy = (canvas.height - city.height * effScale) * 0.5 + pan.y;
      return {
        x: (sx - ox) / effScale,
        y: (sy - oy) / effScale,
      };
    },
    [city, zoom, pan]
  );

  const findSlotAtPoint = useCallback(
    (pt: Point2D): CitySlotFeature | null => {
      if (!city) return null;
      let best: CitySlotFeature | null = null;
      let bestDist = Infinity;
      for (const sf of city.slotFeatures) {
        const d = Math.hypot(pt.x - sf.center.x, pt.y - sf.center.y);
        const hitR = Math.max(24, sf.boundsRadius + 4);
        if (d <= hitR && d < bestDist) {
          best = sf;
          bestDist = d;
        }
      }
      return best;
    },
    [city]
  );

  // Redraw Interactive Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !city || !isOpen) return;
    const parent = canvas.parentElement;
    if (parent) {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(400, Math.floor(parent.clientWidth * dpr));
      const h = Math.max(320, Math.floor(parent.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0c0a09';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const baseScale = Math.min(canvas.width / city.width, canvas.height / city.height);
    const effScale = baseScale * zoom;
    const ox = (canvas.width - city.width * effScale) * 0.5 + pan.x;
    const oy = (canvas.height - city.height * effScale) * 0.5 + pan.y;

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(effScale, effScale);
    renderCityBlueprint(ctx, city, {
      showLabels,
      showGrid,
      showEmptyPlots,
      hoveredSlotId,
      selectedSlotId,
      isExport: false,
    });
    ctx.restore();
  }, [city, isOpen, zoom, pan, showLabels, showGrid, showEmptyPlots, hoveredSlotId, selectedSlotId]);

  const handleExportPng = () => {
    if (!city) return;
    const outW = 2400;
    const outH = 1540;
    const mapAreaW = 1780;
    const off = document.createElement('canvas');
    off.width = outW;
    off.height = outH;
    const ctx = off.getContext('2d');
    if (!ctx) return;

    // 1. Full Parchment Sheet Background
    ctx.fillStyle = '#e5d8b8';
    ctx.fillRect(0, 0, outW, outH);

    // 2. Render Town Map into Left-Center Frame
    const pad = 42;
    const availW = mapAreaW - pad * 2;
    const availH = outH - pad * 2;
    const s = Math.min(availW / city.width, availH / city.height);
    const mx = pad + (availW - city.width * s) * 0.5;
    const my = pad + (availH - city.height * s) * 0.5;

    ctx.save();
    ctx.translate(mx, my);
    ctx.scale(s, s);
    renderCityBlueprint(ctx, city, {
      showLabels: true,
      showGrid,
      showEmptyPlots: false,
      hoveredSlotId: null,
      selectedSlotId: null,
      isExport: true,
    });
    ctx.restore();

    // Map Frame Border
    ctx.strokeStyle = '#3b2e21';
    ctx.lineWidth = 4;
    ctx.strokeRect(pad - 6, pad - 6, mapAreaW - pad * 2 + 12, outH - pad * 2 + 12);
    ctx.strokeStyle = '#6f5a42';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(pad, pad, mapAreaW - pad * 2, outH - pad * 2);

    // 3. Scale Bar at Bottom-Left of Map Frame
    const sbX = pad + 36;
    const sbY = outH - pad - 34;
    const barPx = Math.round(100 * s);
    ctx.fillStyle = 'rgba(235, 224, 198, 0.88)';
    ctx.fillRect(sbX - 12, sbY - 26, barPx * 2 + 34, 42);
    ctx.strokeStyle = '#4e3f2d';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(sbX - 12, sbY - 26, barPx * 2 + 34, 42);

    ctx.fillStyle = '#3b2e20';
    ctx.fillRect(sbX, sbY, barPx, 6);
    ctx.strokeRect(sbX, sbY, barPx * 2, 6);
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('0', sbX - 2, sbY - 8);
    ctx.fillText(`${city.scaleFeetPer100Units} ft`, sbX + barPx - 20, sbY - 8);
    ctx.fillText(`${city.scaleFeetPer100Units * 2} ft`, sbX + barPx * 2 - 24, sbY - 8);

    // 4. Right-Side Keyed Gazetteer & Legend Column
    const legX = mapAreaW + 18;
    const legW = outW - legX - 42;
    ctx.fillStyle = '#ede2c9';
    ctx.fillRect(legX, pad - 6, legW, outH - pad * 2 + 12);
    ctx.strokeStyle = '#3b2e21';
    ctx.lineWidth = 3;
    ctx.strokeRect(legX, pad - 6, legW, outH - pad * 2 + 12);

    let cursorY = pad + 42;
    ctx.fillStyle = '#2d2217';
    ctx.font = 'bold 34px Cinzel, Georgia, serif';
    ctx.textAlign = 'left';
    ctx.fillText(city.burgName, legX + 26, cursorY);
    cursorY += 28;

    ctx.fillStyle = '#5f4b34';
    ctx.font = 'italic 18px Lora, Georgia, serif';
    ctx.fillText(
      `${city.settlementType} · Pop. ${city.population.toLocaleString()} · Year ${world.currentYear}`,
      legX + 26,
      cursorY
    );
    cursorY += 22;

    ctx.beginPath();
    ctx.moveTo(legX + 26, cursorY);
    ctx.lineTo(legX + legW - 26, cursorY);
    ctx.strokeStyle = '#8b7355';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    cursorY += 32;

    ctx.fillStyle = '#3b2e20';
    ctx.font = 'bold 20px Cinzel, Georgia, serif';
    ctx.fillText('Keyed Landmarks & Wards', legX + 26, cursorY);
    cursorY += 34;

    if (city.legend.length === 0) {
      ctx.fillStyle = '#6f5c45';
      ctx.font = 'italic 16px Lora, Georgia, serif';
      ctx.fillText('Unfortified open frontier settlement.', legX + 26, cursorY);
    } else {
      for (const entry of city.legend) {
        ctx.beginPath();
        ctx.arc(legX + 42, cursorY - 5, 14, 0, Math.PI * 2);
        ctx.fillStyle = entry.kind === 'pin' ? '#7c2d12' : '#29221a';
        ctx.fill();
        ctx.strokeStyle = '#d4af37';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#fef3c7';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(entry.number), legX + 42, cursorY - 4.5);

        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#261d14';
        ctx.font = 'bold 17px Cinzel, Georgia, serif';
        ctx.fillText(entry.title, legX + 68, cursorY - 2);

        ctx.fillStyle = '#5c4b37';
        ctx.font = '14px Lora, Georgia, serif';
        ctx.fillText(entry.subtitle, legX + 68, cursorY + 18);
        cursorY += 66;
      }
    }

    // Outer Sheet Frame
    ctx.strokeStyle = '#2d2217';
    ctx.lineWidth = 5;
    ctx.strokeRect(18, 18, outW - 36, outH - 36);

    const url = off.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${city.burgName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_city_plan.png`;
    a.click();
    onNotify?.(`Exported keyed city plan for ${city.burgName}.`);
  };

  if (!isOpen || !liveBurg || !city) return null;

  const hoveredFeature = hoveredSlotId
    ? city.slotFeatures.find((sf) => sf.slotId === hoveredSlotId) || null
    : null;
  const wallLabel =
    city.fortLevel === 0
      ? 'Open Town'
      : city.fortLevel === 1
      ? 'Timber Palisade'
      : city.fortLevel === 2
      ? 'Stone Curtain Wall'
      : 'Concentric Star Bastions';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex flex-col w-full max-w-7xl h-[92vh] rounded-lg border border-stone-800 bg-stone-950 text-stone-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-800 px-4 py-2.5 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Compass className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-cinzel text-sm sm:text-base font-bold text-stone-100 truncate">
                  {city.burgName} — City Plan
                </h2>
                <span className="text-xs font-mono tabular-nums text-stone-400">
                  {city.settlementType} · Pop. {city.population.toLocaleString()} · {wallLabel}
                </span>
                {city.devastation > 0 && (
                  <span className="flex items-center gap-1 text-xs font-mono tabular-nums text-rose-400">
                    <Flame className="w-3.5 h-3.5 shrink-0" />
                    {city.devastation}% Devastation
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowLabels((v) => !v)}
              className={`rounded border px-2.5 py-1 text-xs cursor-pointer whitespace-nowrap shrink-0 ${
                showLabels
                  ? 'border-amber-500/60 bg-amber-600/20 text-amber-200'
                  : 'border-stone-800 bg-stone-900 text-stone-400'
              }`}
            >
              Labels
            </button>
            <button
              type="button"
              onClick={() => setShowEmptyPlots((v) => !v)}
              className={`rounded border px-2.5 py-1 text-xs cursor-pointer whitespace-nowrap shrink-0 ${
                showEmptyPlots
                  ? 'border-amber-500/60 bg-amber-600/20 text-amber-200'
                  : 'border-stone-800 bg-stone-900 text-stone-400'
              }`}
            >
              Plots
            </button>
            <button
              type="button"
              onClick={() => setShowGrid((v) => !v)}
              className={`rounded border px-2.5 py-1 text-xs cursor-pointer whitespace-nowrap shrink-0 ${
                showGrid
                  ? 'border-amber-500/60 bg-amber-600/20 text-amber-200'
                  : 'border-stone-800 bg-stone-900 text-stone-400'
              }`}
            >
              Grid
            </button>

            <div className="h-4 w-px bg-stone-800 mx-0.5" />

            <button
              type="button"
              onClick={handleExportPng}
              className="flex items-center gap-1.5 rounded border border-amber-500/60 bg-amber-600/25 px-3 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-600/40 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>Export Keyed Map (PNG)</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1 rounded border border-stone-800 bg-stone-900 px-2.5 py-1 text-xs text-stone-300 hover:bg-stone-800 hover:text-white cursor-pointer whitespace-nowrap shrink-0"
            >
              <X className="w-3.5 h-3.5 shrink-0" />
              <span>Close</span>
            </button>
          </div>
        </div>

        {/* Workspace Split */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_400px]">
          {/* Left: Interactive City Plan Canvas */}
          <div className="relative bg-stone-950 overflow-hidden min-h-[340px]">
            <canvas
              ref={canvasRef}
              className="w-full h-full block cursor-grab active:cursor-grabbing"
              onWheel={(e) => {
                e.preventDefault();
                const factor = e.deltaY < 0 ? 1.12 : 0.89;
                setZoom((prev) => Math.max(0.55, Math.min(4.0, Math.round(prev * factor * 100) / 100)));
              }}
              onMouseDown={(e) => {
                dragRef.current = {
                  active: true,
                  moved: false,
                  lastX: e.clientX,
                  lastY: e.clientY,
                };
              }}
              onMouseMove={(e) => {
                if (dragRef.current.active) {
                  const dx = e.clientX - dragRef.current.lastX;
                  const dy = e.clientY - dragRef.current.lastY;
                  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
                    dragRef.current.moved = true;
                  }
                  dragRef.current.lastX = e.clientX;
                  dragRef.current.lastY = e.clientY;
                  const dpr = window.devicePixelRatio || 1;
                  setPan((prev) => ({ x: prev.x + dx * dpr, y: prev.y + dy * dpr }));
                  return;
                }
                const pt = clientToLogical(e.clientX, e.clientY);
                if (!pt) return;
                const hit = findSlotAtPoint(pt);
                setHoveredSlotId(hit ? hit.slotId : null);
              }}
              onMouseUp={(e) => {
                const wasMoved = dragRef.current.moved;
                dragRef.current.active = false;
                if (!wasMoved) {
                  const pt = clientToLogical(e.clientX, e.clientY);
                  if (!pt) return;
                  const hit = findSlotAtPoint(pt);
                  if (hit) {
                    setSelectedSlotId(hit.slotId);
                    setRightTab('blueprint');
                  } else {
                    setSelectedSlotId(null);
                  }
                }
              }}
              onMouseLeave={() => {
                dragRef.current.active = false;
                setHoveredSlotId(null);
              }}
            />

            {/* Canvas Zoom Controls */}
            <div className="absolute top-3 right-3 flex items-center gap-1 rounded border border-stone-800 bg-stone-950/90 p-1">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(4.0, Math.round(z * 1.2 * 100) / 100))}
                className="p-1.5 rounded text-stone-300 hover:bg-stone-800 cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.55, Math.round(z * 0.82 * 100) / 100))}
                className="p-1.5 rounded text-stone-300 hover:bg-stone-800 cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoom(1.0);
                  setPan({ x: 0, y: 0 });
                }}
                className="p-1.5 rounded text-stone-300 hover:bg-stone-800 cursor-pointer"
                title="Reset View"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Hover Inspection Readout */}
            <div className="pointer-events-none absolute bottom-3 left-3 max-w-sm rounded border border-stone-800 bg-stone-950/90 px-3 py-2 text-xs">
              {hoveredFeature ? (
                <div className="space-y-0.5">
                  <div className="font-semibold text-amber-200">
                    {hoveredFeature.level > 0 ? hoveredFeature.builtName : `Empty Plot: ${hoveredFeature.name}`}
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-stone-400">
                    {hoveredFeature.level > 0
                      ? `Level ${hoveredFeature.level}/${hoveredFeature.maxLevel} · Click to inspect or upgrade`
                      : hoveredFeature.isUnlocked
                      ? 'Unlocked ward plot · Click to construct'
                      : 'Locked ward plot'}
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-stone-400">
                  Drag to pan · Scroll to zoom · Click any ward or landmark to focus its blueprint slot
                </div>
              )}
            </div>
          </div>

          {/* Right: Side-by-Side Blueprint Builder & Keyed Legend */}
          <div className="flex flex-col border-t lg:border-t-0 lg:border-l border-stone-800 bg-stone-950 min-h-0">
            <div className="grid grid-cols-2 border-b border-stone-800 shrink-0">
              <button
                type="button"
                onClick={() => setRightTab('blueprint')}
                className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold border-b-2 cursor-pointer whitespace-nowrap ${
                  rightTab === 'blueprint'
                    ? 'border-amber-500 text-amber-300 bg-stone-900/50'
                    : 'border-transparent text-stone-400 hover:text-stone-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5 shrink-0" />
                <span>Blueprint Slots</span>
              </button>
              <button
                type="button"
                onClick={() => setRightTab('legend')}
                className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold border-b-2 cursor-pointer whitespace-nowrap ${
                  rightTab === 'legend'
                    ? 'border-amber-500 text-amber-300 bg-stone-900/50'
                    : 'border-transparent text-stone-400 hover:text-stone-200'
                }`}
              >
                <ScrollText className="w-3.5 h-3.5 shrink-0" />
                <span>Keyed Legend ({city.legend.length})</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3.5">
              {rightTab === 'blueprint' ? (
                <SettlementBlueprintPanel
                  burg={liveBurg}
                  world={world}
                  onUpdateWorld={onUpdateWorld}
                  hoveredSlotId={hoveredSlotId}
                  onHoverSlot={setHoveredSlotId}
                  selectedSlotId={selectedSlotId}
                  onSelectSlot={setSelectedSlotId}
                />
              ) : (
                <div className="space-y-2.5">
                  <div className="text-xs text-stone-400 leading-snug">
                    Built settlement slots (1–8) and nearby chronicle pins (up to 10) are keyed directly onto the parchment export.
                  </div>

                  {city.legend.length === 0 ? (
                    <div className="rounded border border-stone-800 bg-stone-900/40 p-4 text-center text-xs text-stone-500">
                      No built landmarks or map pins yet. Construct a ward slot to populate the keyed legend.
                    </div>
                  ) : (
                    <div className="border border-stone-800 rounded divide-y divide-stone-800 bg-stone-900/35">
                      {city.legend.map((item) => (
                        <button
                          key={`${item.kind}_${item.id}`}
                          type="button"
                          onMouseEnter={() => {
                            if (item.kind === 'slot') setHoveredSlotId(item.id);
                          }}
                          onMouseLeave={() => setHoveredSlotId(null)}
                          onClick={() => {
                            if (item.kind === 'slot') {
                              setSelectedSlotId(item.id);
                            }
                          }}
                          className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-stone-900 transition-colors cursor-pointer"
                        >
                          <span className="w-5 h-5 rounded-full bg-stone-950 border border-amber-500/60 text-amber-200 font-mono tabular-nums text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                            {item.number}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold text-stone-100 truncate">
                              {item.title}
                            </div>
                            <div className="text-[11px] text-stone-400 truncate">
                              {item.subtitle}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
