import React, { useState } from 'react';
import { CartographyStyle, WorldState } from '../../types/world';
import {
  renderAtlasMap,
  AtlasRenderOptions,
  buildSmoothCoastlines,
  traceMergedGroupLoops,
} from '../../engine/atlasMapRenderer';
import { buildHydraulicRiverNetwork, customRiverToChain } from '../../engine/hydraulicRiverEngine';
import { getCachedTerrainSim } from '../../engine/worldGenerator';
import { Download, Grid, Image as ImageIcon, Layers, X } from 'lucide-react';

interface MapExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  world: WorldState;
  mapStyle?: CartographyStyle;
  onNotify: (msg: string) => void;
}

type ExportScale = 2 | 4 | 6;
type VttGridMode = 'none' | 'square' | 'hex';

export const MapExportModal: React.FC<MapExportModalProps> = ({
  isOpen,
  onClose,
  world,
  mapStyle = 'atlas',
  onNotify,
}) => {
  const [scale, setScale] = useState<ExportScale>(4);
  const [vttGrid, setVttGrid] = useState<VttGridMode>('none');
  const [gridCellPx, setGridCellPx] = useState(40);
  const [showPolitical, setShowPolitical] = useState(true);
  const [showRelief, setShowRelief] = useState(false);
  const [showReliefMountains, setShowReliefMountains] = useState(false);
  const [showReliefHills, setShowReliefHills] = useState(false);
  const [showReliefForests, setShowReliefForests] = useState(false);
  const [showReliefTrees, setShowReliefTrees] = useState(false);
  const [showReliefSwamps, setShowReliefSwamps] = useState(false);
  const [showRivers, setShowRivers] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);
  const [showBurgs, setShowBurgs] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  if (!isOpen) return null;

  const baseW = 1000;
  const baseH = 700;
  const worldName = (world.settings.name || world.realms[0]?.name || 'RealmSmith-Atlas')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');

  const drawVttGrid = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    if (vttGrid === 'none') return;
    ctx.save();
    ctx.strokeStyle = 'rgba(20, 18, 15, 0.28)';
    ctx.lineWidth = 0.8;
    const step = Math.max(16, Math.min(120, gridCellPx));

    if (vttGrid === 'square') {
      ctx.beginPath();
      for (let x = 0; x <= w; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = 0; y <= h; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
    } else if (vttGrid === 'hex') {
      const r = step * 0.55;
      const dx = r * 1.5;
      const dy = r * Math.sqrt(3);
      ctx.beginPath();
      for (let col = -1; col * dx < w + r * 2; col++) {
        for (let row = -1; row * dy < h + r * 2; row++) {
          const cx = col * dx;
          const cy = row * dy + (col % 2 === 0 ? 0 : dy / 2);
          for (let i = 0; i < 6; i++) {
            const ang = (Math.PI / 3) * i;
            const px = cx + r * Math.cos(ang);
            const py = cy + r * Math.sin(ang);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  };

  const handleExportPng = async () => {
    setIsExporting(true);
    try {
      const { mesh, sim } =
        world.mesh && world.sim ? { mesh: world.mesh, sim: world.sim } : getCachedTerrainSim();
      if (!mesh || !sim) {
        onNotify('Map geometry is not ready for export.');
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = baseW * scale;
      canvas.height = baseH * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.scale(scale, scale);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const opts: AtlasRenderOptions = {
        renderMode: 'all',
        activeLayers: {
          political: showPolitical,
          feudal: false,
          heightmap: false,
          biomes: !showPolitical,
          rainfall: false,
          wind: false,
          burgs: showBurgs,
          rivers: showRivers,
          relief: showRelief,
          reliefMountains: showRelief && showReliefMountains,
          reliefHills: showRelief && showReliefHills,
          reliefForests: showRelief && showReliefForests,
          reliefTrees: showRelief && showReliefTrees,
          reliefSwamps: showRelief && showReliefSwamps,
          routes: showRoutes,
          caravans: false,
          density: false,
          contours: false,
          weather: false,
          provinces: false,
          epidemics: false,
        },
        seaLevel: world.settings.terrainSim?.seaLevel || 0.28,
        worldName: world.settings.name || world.realms[0]?.name || 'RealmSmith Atlas',
        currentYear: world.currentYear,
        tradeNetwork: world.tradeNetwork,
        holdings: world.holdings,
        characters: world.characters,
        cultures: world.cultures,
        religions: world.religions,
        customRivers: world.customRivers,
        customBorders: world.customBorders,
        borderKindOverrides: world.borderKindOverrides,
        mapPins: world.mapPins,
        mapStyle,
        mapMode: showPolitical ? 'political' : 'geographic',
        zoomLevel: Math.max(1.25, scale * 0.45),
      };

      renderAtlasMap(
        ctx,
        mesh,
        sim,
        world.burgs,
        world.realms,
        world.counties,
        world.cells,
        opts,
        baseW,
        baseH
      );

      drawVttGrid(ctx, baseW, baseH);
      ctx.restore();

      const filename = `${worldName}-${baseW * scale}x${baseH * scale}.png`;
      const dataUrl = canvas.toDataURL('image/png');

      if (window.desktopAPI?.exportImage) {
        const res = await window.desktopAPI.exportImage(filename, dataUrl, 'png');
        if (res.ok) onNotify(`Exported high-res PNG (${baseW * scale}×${baseH * scale}).`);
      } else {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = filename;
        a.click();
        onNotify(`Exported high-res PNG (${baseW * scale}×${baseH * scale}).`);
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportSvg = async () => {
    const filename = `${worldName}-vector.svg`;
    const seaLevel = world.settings.terrainSim?.seaLevel || 0.28;
    const realmById = new Map(world.realms.map((r) => [r.id, r]));
    const { mesh, sim } =
      world.mesh && world.sim ? { mesh: world.mesh, sim: world.sim } : getCachedTerrainSim();

    const landCells = world.cells.filter((c) => !c.isOcean && c.elevation >= seaLevel);

    const polyEls = landCells
      .map((c) => {
        if (!c.polygon || c.polygon.length < 3) return '';
        const pts = c.polygon.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
        const fill =
          showPolitical && c.realmId
            ? realmById.get(c.realmId)?.color || '#c8b896'
            : '#d6c8a8';
        return `<polygon points="${pts}" fill="${fill}" fill-opacity="${showPolitical ? '0.68' : '0.94'}" stroke="none" />`;
      })
      .join('');

    // Smoothed Coastlines
    let coastEls = '';
    if (mesh && sim) {
      const coastlines = buildSmoothCoastlines(mesh, sim.elevation, seaLevel, sim.isOcean);
      coastEls = coastlines
        .filter((line) => line.length >= 2)
        .map((line) => {
          const d = line
            .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
            .join(' ');
          return `<path d="${d}" fill="none" stroke="#181822" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />`;
        })
        .join('');
    }

    // Freshwater Lakes (sim.isLake)
    let lakeEls = '';
    if (showRivers && mesh && sim?.isLake) {
      const { loops: lakeLoops } = traceMergedGroupLoops(
        mesh,
        (r) => Boolean(sim.isLake && sim.isLake[r]),
        baseW,
        baseH,
        2
      );
      lakeEls = lakeLoops
        .filter((loop) => loop.length >= 3)
        .map((loop) => {
          const d =
            loop
              .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
              .join(' ') + ' Z';
          return `<path d="${d}" fill="#5ca8ba" stroke="#182028" stroke-width="1.2" stroke-linejoin="round" />`;
        })
        .join('');
    }

    // Rivers (procedural & custom authored rivers)
    let riverEls = '';
    if (showRivers && mesh && sim) {
      const riverData = buildHydraulicRiverNetwork(mesh, sim, seaLevel, 1.0);
      const customChains = (world.customRivers || []).map((cr) => customRiverToChain(cr, 1.0));
      riverEls = [...riverData.chains, ...customChains]
        .filter((chain) => chain.nodes.length >= 2)
        .map((chain) => {
          const d = chain.nodes
            .map((n, i) => `${i === 0 ? 'M' : 'L'}${n.x.toFixed(1)},${n.y.toFixed(1)}`)
            .join(' ');
          const avgW =
            chain.nodes.reduce((sum, n) => sum + n.width, 0) / Math.max(1, chain.nodes.length);
          const strokeW = Math.max(0.8, Math.min(4.2, avgW)).toFixed(2);
          return `<path d="${d}" fill="none" stroke="#182028" stroke-width="${(Number(strokeW) + 1.1).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" /><path d="${d}" fill="none" stroke="#5ca8ba" stroke-width="${strokeW}" stroke-linecap="round" stroke-linejoin="round" />`;
        })
        .join('');
    }

    // Political Borders
    let borderEls = '';
    if (showPolitical && mesh && sim) {
      const segments: string[] = [];
      const { halfedges, s_start_r, s_end_r, s_left_t, t_x, t_y, numSides } = mesh;
      for (let s = 0; s < numSides; s++) {
        const opp = halfedges[s];
        if (opp === -1 || opp < s) continue;
        const rA = s_start_r[s];
        const rB = s_end_r[s];
        if (sim.elevation[rA] < seaLevel || sim.elevation[rB] < seaLevel) continue;
        const cA = world.cells[rA];
        const cB = world.cells[rB];
        if (cA?.realmId && cB?.realmId && cA.realmId !== cB.realmId) {
          const tA = s_left_t[s];
          const tB = s_left_t[opp];
          segments.push(
            `M${t_x[tA].toFixed(1)},${t_y[tA].toFixed(1)}L${t_x[tB].toFixed(1)},${t_y[tB].toFixed(1)}`
          );
        }
      }
      if (segments.length > 0) {
        borderEls = `<path d="${segments.join(' ')}" fill="none" stroke="#1c1917" stroke-opacity="0.78" stroke-width="1.6" stroke-linecap="round" />`;
      }
    }

    // Trade Routes
    let routeEls = '';
    if (showRoutes && world.tradeNetwork?.routes?.length) {
      routeEls = world.tradeNetwork.routes
        .filter((rt) => rt.pathPoints && rt.pathPoints.length >= 2)
        .map((rt) => {
          const d = rt.pathPoints
            .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
            .join(' ');
          const isSea = rt.type === 'Maritime Sea Lane';
          const isImperial = rt.type === 'Imperial Highway';
          return `<path d="${d}" fill="none" stroke="${isSea ? '#2c5870' : isImperial ? '#443528' : '#574636'}" stroke-width="${isImperial ? '1.6' : '1.0'}" stroke-opacity="${isSea ? '0.65' : '0.72'}" ${isSea ? 'stroke-dasharray="4 3"' : ''} stroke-linecap="round" stroke-linejoin="round" />`;
        })
        .join('');
    }

    // Settlements & Labels
    const burgEls = showBurgs
      ? world.burgs
          .map(
            (b) =>
              `<g><circle cx="${b.x.toFixed(1)}" cy="${b.y.toFixed(1)}" r="${b.isCapital ? 4.2 : 2.6}" fill="#1c1917" stroke="#fef3c7" stroke-width="1" /><text x="${(b.x + 6).toFixed(1)}" y="${(b.y + 3).toFixed(1)}" font-family="Cinzel, Georgia, serif" font-size="${b.isCapital ? 10 : 7.5}" fill="#1c1917">${b.name.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></g>`
          )
          .join('')
      : '';

    // Optional VTT Grid
    let gridEls = '';
    if (vttGrid !== 'none') {
      const step = Math.max(16, Math.min(120, gridCellPx));
      const segs: string[] = [];
      if (vttGrid === 'square') {
        for (let x = 0; x <= baseW; x += step) segs.push(`M${x},0L${x},${baseH}`);
        for (let y = 0; y <= baseH; y += step) segs.push(`M0,${y}L${baseW},${y}`);
      } else if (vttGrid === 'hex') {
        const r = step * 0.55;
        const dx = r * 1.5;
        const dy = r * Math.sqrt(3);
        for (let col = -1; col * dx < baseW + r * 2; col++) {
          for (let row = -1; row * dy < baseH + r * 2; row++) {
            const cx = col * dx;
            const cy = row * dy + (col % 2 === 0 ? 0 : dy / 2);
            const pts: string[] = [];
            for (let i = 0; i < 6; i++) {
              const ang = (Math.PI / 3) * i;
              pts.push(`${i === 0 ? 'M' : 'L'}${(cx + r * Math.cos(ang)).toFixed(1)},${(cy + r * Math.sin(ang)).toFixed(1)}`);
            }
            segs.push(`${pts.join('')}Z`);
          }
        }
      }
      gridEls = `<path d="${segs.join(' ')}" fill="none" stroke="#14120f" stroke-opacity="0.28" stroke-width="0.8" />`;
    }

    // Map Pins
    const pinEls = showBurgs
      ? (world.mapPins || [])
          .map(
            (p) =>
              `<g><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.4" fill="#d97706" stroke="#fef3c7" stroke-width="1" /><text x="${(p.x + 5).toFixed(1)}" y="${(p.y + 3).toFixed(1)}" font-family="Lora, Georgia, serif" font-size="7.5" fill="#78350f">${p.label.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></g>`
          )
          .join('')
      : '';

    const svg = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${baseW} ${baseH}" width="${baseW * 2}" height="${baseH * 2}">`,
      `  <rect id="ocean" width="${baseW}" height="${baseH}" fill="#7fa5b5" />`,
      `  <g id="landmass">${polyEls}</g>`,
      `  <g id="coastlines">${coastEls}</g>`,
      `  <g id="political-borders">${borderEls}</g>`,
      `  <g id="rivers">${riverEls}</g>`,
      `  <g id="lakes">${lakeEls}</g>`,
      `  <g id="trade-routes">${routeEls}</g>`,
      `  <g id="settlements">${burgEls}</g>`,
      pinEls ? `  <g id="map-pins">${pinEls}</g>` : '',
      gridEls ? `  <g id="vtt-grid">${gridEls}</g>` : '',
      `</svg>`,
    ]
      .filter(Boolean)
      .join('\n');

    if (window.desktopAPI?.exportImage) {
      const res = await window.desktopAPI.exportImage(filename, svg, 'svg');
      if (res.ok) onNotify('Exported multi-layer Vector SVG atlas.');
    } else {
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      onNotify('Exported multi-layer Vector SVG atlas.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 no-print">
      <div className="w-full max-w-lg bg-stone-950 border border-stone-800 rounded-xl shadow-2xl text-stone-100 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-800 bg-stone-900/60">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-serif font-semibold tracking-wide text-amber-300">
              High-Resolution Atlas &amp; VTT Export
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {/* Resolution */}
          <div>
            <div className="text-[11px] uppercase tracking-wider text-stone-400 font-semibold mb-2">
              Output Resolution
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([2, 4, 6] as ExportScale[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScale(s)}
                  className={`px-3 py-2 rounded-lg border text-center font-medium transition-colors cursor-pointer ${
                    scale === s
                      ? 'bg-amber-600/20 border-amber-500 text-amber-300'
                      : 'bg-stone-900 border-stone-800 text-stone-300 hover:border-stone-700'
                  }`}
                >
                  <div>{s}× Scale</div>
                  <div className="text-[10px] text-stone-400 tabular-nums">
                    {baseW * s} × {baseH * s}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Layer Toggles */}
          <div>
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-stone-400 font-semibold mb-2">
              <Layers className="w-3.5 h-3.5" />
              Export Layers
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Political Borders & Wash', val: showPolitical, set: setShowPolitical },
                {
                  label: 'Cartographic Relief Art (All)',
                  val: showRelief,
                  set: (checked: boolean) => {
                    setShowRelief(checked);
                    setShowReliefMountains(checked);
                    setShowReliefHills(checked);
                    setShowReliefForests(checked);
                    setShowReliefTrees(checked);
                    setShowReliefSwamps(checked);
                  },
                },
                { label: 'Rivers & Lakes', val: showRivers, set: setShowRivers },
                { label: 'Trade Roads & Sea Lanes', val: showRoutes, set: setShowRoutes },
                { label: 'Settlements & Labels', val: showBurgs, set: setShowBurgs },
              ].map((item) => (
                <label
                  key={item.label}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-stone-900/70 border border-stone-800 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={item.val}
                    onChange={(e) => item.set(e.target.checked)}
                    className="accent-amber-500"
                  />
                  <span className="text-stone-200">{item.label}</span>
                </label>
              ))}
            </div>
            {showRelief && (
              <div className="grid grid-cols-3 gap-1.5 mt-2">
                {[
                  { label: 'Mountains', val: showReliefMountains, set: setShowReliefMountains },
                  { label: 'Hills', val: showReliefHills, set: setShowReliefHills },
                  { label: 'Forests', val: showReliefForests, set: setShowReliefForests },
                  { label: 'Solitary Trees', val: showReliefTrees, set: setShowReliefTrees },
                  { label: 'Wetlands', val: showReliefSwamps, set: setShowReliefSwamps },
                ].map((sub) => (
                  <label
                    key={sub.label}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-stone-900/50 border border-stone-800/80 cursor-pointer text-[11px]"
                  >
                    <input
                      type="checkbox"
                      checked={sub.val}
                      onChange={(e) => sub.set(e.target.checked)}
                      className="accent-amber-500"
                    />
                    <span className="text-stone-300 truncate">{sub.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* VTT Grid */}
          <div>
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-stone-400 font-semibold mb-2">
              <Grid className="w-3.5 h-3.5" />
              VTT Tabletop Grid Overlay
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['none', 'square', 'hex'] as VttGridMode[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setVttGrid(g)}
                  className={`px-3 py-1.5 rounded-lg border capitalize transition-colors cursor-pointer ${
                    vttGrid === g
                      ? 'bg-amber-600/20 border-amber-500 text-amber-300'
                      : 'bg-stone-900 border-stone-800 text-stone-300 hover:border-stone-700'
                  }`}
                >
                  {g === 'none' ? 'No Grid' : `${g} Grid`}
                </button>
              ))}
            </div>
            {vttGrid !== 'none' && (
              <div className="mt-2 flex items-center gap-3">
                <span className="text-stone-400">Cell Size:</span>
                <input
                  type="range"
                  min={20}
                  max={80}
                  value={gridCellPx}
                  onChange={(e) => setGridCellPx(Number(e.target.value))}
                  className="flex-1 accent-amber-500"
                />
                <span className="tabular-nums text-amber-300 w-10 text-right">{gridCellPx}px</span>
              </div>
            )}
          </div>

          {/* Export Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-800">
            <button
              type="button"
              onClick={handleExportSvg}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-200 font-medium cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              Export Vector SVG
            </button>
            <button
              type="button"
              disabled={isExporting}
              onClick={handleExportPng}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-stone-950 font-semibold cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              {isExporting ? 'Rendering Atlas…' : `Export ${scale}× PNG`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
