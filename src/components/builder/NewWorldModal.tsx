import React, { useState, useRef } from 'react';
import {
  X,
  Sparkles,
  Waves,
  ImageUp,
  Dices,
  Hammer,
  Swords,
  Check,
  AlertCircle,
} from 'lucide-react';
import {
  WorldState,
  WorldSettings,
  WorldTemplate,
  ClimateTemplate,
  AppMode,
} from '../../types/world';
import {
  generateWorld,
  createBlankOceanWorld,
  createWorldFromHeightmap,
} from '../../engine/worldGenerator';
import { serializeWorldArchive } from '../../engine/storageManager';

export interface NewWorldModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSettings: WorldSettings;
  onCreateWorld: (nextWorld: WorldState) => void;
  onNotify?: (msg: string) => void;
}

type CreationMode = 'procedural' | 'blank' | 'heightmap';

const TEMPLATES: WorldTemplate[] = [
  'Continents',
  'Archipelago',
  'High Island',
  'Low Island',
  'Volcano',
  'Atoll',
  'Mediterranean',
  'Peninsula',
  'Isthmus',
  'Pangaea',
  'Inland Sea',
  'Shattered Realm',
];

const CLIMATES: ClimateTemplate[] = [
  'Temperate Hearth',
  'Whole World',
  'Northern Hemisphere',
  'Southern Hemisphere',
  'Equatorial',
  'Nordic Boreal',
  'Arid Steppe',
  'Glacial Age',
];

function makeFreshSeed(): string {
  const prefixes = ['aethel', 'valen', 'korv', 'solis', 'drak', 'myr', 'calen', 'ost', 'vorn', 'thal'];
  const p = prefixes[Math.floor(Math.random() * prefixes.length)];
  return `${p}-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(2, 5)}`;
}

export const NewWorldModal: React.FC<NewWorldModalProps> = ({
  isOpen,
  onClose,
  currentSettings,
  onCreateWorld,
  onNotify,
}) => {
  const [mode, setMode] = useState<CreationMode>('procedural');
  const [seed, setSeed] = useState<string>(() => makeFreshSeed());
  const [template, setTemplate] = useState<WorldTemplate>(currentSettings.template || 'Continents');
  const [climate, setClimate] = useState<ClimateTemplate>(
    currentSettings.climateTemplate || 'Temperate Hearth'
  );
  const [continentCount, setContinentCount] = useState<number>(currentSettings.continentCount ?? 2);
  const [realmCount, setRealmCount] = useState<number>(currentSettings.realmCount ?? 10);
  const [cultureCount, setCultureCount] = useState<number>(currentSettings.cultureCount ?? 5);
  const [startMode, setStartMode] = useState<AppMode>('builder');
  const [seaLevel, setSeaLevel] = useState<number>(currentSettings.terrainSim?.seaLevel ?? 0.28);

  // Heightmap upload state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [heightmapPreviewUrl, setHeightmapPreviewUrl] = useState<string | null>(null);
  const [heightmapName, setHeightmapName] = useState<string>('');
  const [heightmapBuffer, setHeightmapBuffer] = useState<{
    data: Float32Array;
    width: number;
    height: number;
  } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleHeightmapFile = (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) {
        setUploadError('Unable to read image file.');
        return;
      }
      const img = new Image();
      img.onload = () => {
        const w = Math.max(32, Math.min(500, img.width));
        const h = Math.max(24, Math.min(350, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setUploadError('Offscreen 2D canvas unavailable.');
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const rgba = ctx.getImageData(0, 0, w, h).data;
        const floats = new Float32Array(w * h);
        for (let i = 0; i < w * h; i++) {
          const r = rgba[i * 4];
          const g = rgba[i * 4 + 1];
          const b = rgba[i * 4 + 2];
          floats[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        }
        setHeightmapBuffer({ data: floats, width: w, height: h });
        setHeightmapPreviewUrl(dataUrl);
        setHeightmapName(file.name);
      };
      img.onerror = () => {
        setUploadError('Invalid PNG, JPG, or WebP image file.');
      };
      img.src = dataUrl;
    };
    reader.onerror = () => setUploadError('Failed reading selected file.');
    reader.readAsDataURL(file);
  };

  const handleCreate = () => {
    const cleanSeed = seed.trim() || makeFreshSeed();

    if (mode === 'procedural') {
      const nextWorld = generateWorld({
        ...currentSettings,
        seed: cleanSeed,
        template,
        climateTemplate: climate,
        continentCount,
        realmCount,
        cultureCount,
        seaLevel,
        terrainSim: {
          ...currentSettings.terrainSim,
          seaLevel,
          brushMode: 'inspect',
        },
      });
      nextWorld.appMode = startMode;
      nextWorld.builderBaselineArchive = serializeWorldArchive(nextWorld);
      onCreateWorld(nextWorld);
      onNotify?.(`Generated ${template} world (${cleanSeed}) in ${startMode === 'builder' ? 'Builder' : 'Simulator'} mode.`);
      onClose();
      return;
    }

    if (mode === 'blank') {
      const blank = createBlankOceanWorld(cleanSeed, {
        ...currentSettings,
        terrainSim: {
          ...currentSettings.terrainSim,
          seaLevel,
          brushMode: 'mountain',
        },
      });
      blank.appMode = 'builder';
      blank.builderBaselineArchive = serializeWorldArchive(blank);
      onCreateWorld(blank);
      onNotify?.(`Created Blank Ocean Canvas (${cleanSeed}). Sculpt continents, then Auto-Populate Terrain.`);
      onClose();
      return;
    }

    if (mode === 'heightmap') {
      if (!heightmapBuffer) {
        setUploadError('Select a grayscale heightmap PNG/JPG before creating.');
        return;
      }
      const imported = createWorldFromHeightmap(
        heightmapBuffer.data,
        heightmapBuffer.width,
        heightmapBuffer.height,
        cleanSeed,
        {
          ...currentSettings,
          climateTemplate: climate,
          seaLevel,
          terrainSim: {
            ...currentSettings.terrainSim,
            seaLevel,
            brushMode: 'inspect',
          },
        }
      );
      imported.appMode = 'builder';
      imported.builderBaselineArchive = serializeWorldArchive(imported);
      onCreateWorld(imported);
      onNotify?.(`Imported heightmap "${heightmapName}" into World Builder.`);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl rounded-2xl border border-stone-700/80 bg-stone-950 text-stone-100 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-800 bg-stone-900/70">
          <div>
            <h2 className="font-cinzel text-lg font-bold text-amber-200">
              Create New World
            </h2>
            <p className="text-xs text-stone-400">
              Start from a procedural atlas, a blank ocean canvas, or your own grayscale heightmap.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3 Mode Cards */}
        <div className="p-5 space-y-5 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setMode('procedural')}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                mode === 'procedural'
                  ? 'bg-amber-950/50 border-amber-500 ring-1 ring-amber-500/40'
                  : 'bg-stone-900/60 border-stone-800 hover:border-stone-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <Sparkles className="w-4 h-4 text-amber-400" />
                {mode === 'procedural' && <Check className="w-4 h-4 text-amber-400" />}
              </div>
              <div className="text-xs font-bold text-stone-100">Procedural Generator</div>
              <div className="text-[11px] text-stone-400 mt-0.5 leading-snug">
                Full continents, rivers, kingdoms, feudal houses, and trade routes.
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMode('blank')}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                mode === 'blank'
                  ? 'bg-sky-950/50 border-sky-500 ring-1 ring-sky-500/40'
                  : 'bg-stone-900/60 border-stone-800 hover:border-stone-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <Waves className="w-4 h-4 text-sky-400" />
                {mode === 'blank' && <Check className="w-4 h-4 text-sky-400" />}
              </div>
              <div className="text-xs font-bold text-stone-100">Blank Ocean Canvas</div>
              <div className="text-[11px] text-stone-400 mt-0.5 leading-snug">
                Empty sea mesh ready for hand-sculpted islands, custom rivers &amp; cities.
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMode('heightmap')}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                mode === 'heightmap'
                  ? 'bg-emerald-950/50 border-emerald-500 ring-1 ring-emerald-500/40'
                  : 'bg-stone-900/60 border-stone-800 hover:border-stone-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <ImageUp className="w-4 h-4 text-emerald-400" />
                {mode === 'heightmap' && <Check className="w-4 h-4 text-emerald-400" />}
              </div>
              <div className="text-xs font-bold text-stone-100">Import Heightmap PNG</div>
              <div className="text-[11px] text-stone-400 mt-0.5 leading-snug">
                Convert any grayscale elevation image into playable terrain &amp; hydrology.
              </div>
            </button>
          </div>

          {/* Seed Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                World Seed
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-700 font-mono text-xs text-stone-100 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={() => setSeed(makeFreshSeed())}
                  className="px-2.5 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 text-amber-300 cursor-pointer"
                  title="Random Seed"
                >
                  <Dices className="w-4 h-4" />
                </button>
              </div>
            </div>

            {mode === 'procedural' && (
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                  Initial Mode
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setStartMode('builder')}
                    className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                      startMode === 'builder'
                        ? 'bg-amber-600/25 border-amber-500 text-amber-200'
                        : 'bg-stone-900 border-stone-800 text-stone-400'
                    }`}
                  >
                    <Hammer className="w-3.5 h-3.5" />
                    Builder Mode
                  </button>
                  <button
                    type="button"
                    onClick={() => setStartMode('game')}
                    className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                      startMode === 'game'
                        ? 'bg-emerald-600/25 border-emerald-500 text-emerald-200'
                        : 'bg-stone-900 border-stone-800 text-stone-400'
                    }`}
                  >
                    <Swords className="w-3.5 h-3.5" />
                    Simulator Mode
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Mode-Specific Controls */}
          {mode === 'procedural' && (
            <div className="p-4 rounded-xl bg-stone-900/55 border border-stone-800 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-stone-400 font-semibold">Landmass Template</label>
                  <select
                    value={template}
                    onChange={(e) => setTemplate(e.target.value as WorldTemplate)}
                    className="w-full px-3 py-1.5 rounded-lg bg-stone-950 border border-stone-700 text-xs text-stone-100"
                  >
                    {TEMPLATES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-stone-400 font-semibold">Climate Preset</label>
                  <select
                    value={climate}
                    onChange={(e) => setClimate(e.target.value as ClimateTemplate)}
                    className="w-full px-3 py-1.5 rounded-lg bg-stone-950 border border-stone-700 text-xs text-stone-100"
                  >
                    {CLIMATES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-stone-400">Continents</span>
                    <span className="font-mono text-amber-300">{continentCount}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={4}
                    step={1}
                    value={continentCount}
                    onChange={(e) => setContinentCount(Number(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-stone-400">Kingdoms</span>
                    <span className="font-mono text-amber-300">{realmCount}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={24}
                    step={1}
                    value={realmCount}
                    onChange={(e) => setRealmCount(Number(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-stone-400">Cultures</span>
                    <span className="font-mono text-emerald-300">{cultureCount}</span>
                  </div>
                  <input
                    type="range"
                    min={3}
                    max={8}
                    step={1}
                    value={cultureCount}
                    onChange={(e) => setCultureCount(Number(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-stone-400">Sea Level</span>
                    <span className="font-mono text-sky-300">{seaLevel.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={0.15}
                    max={0.48}
                    step={0.01}
                    value={seaLevel}
                    onChange={(e) => setSeaLevel(Number(e.target.value))}
                    className="w-full accent-sky-500"
                  />
                </div>
              </div>
            </div>
          )}

          {mode === 'blank' && (
            <div className="p-4 rounded-xl bg-sky-950/20 border border-sky-800/40 space-y-3">
              <div className="text-xs font-semibold text-sky-200">Blank Ocean Canvas Setup</div>
              <p className="text-xs text-stone-300 leading-relaxed">
                Starts with a submerged Voronoi mesh and zero kingdoms, counties, or settlements. Use <strong className="text-amber-300">Raise Terrain</strong> to sculpt landmasses, draw custom rivers, stamp cities, or run <strong className="text-amber-300">Auto-Populate Terrain</strong> whenever your coastline is finished.
              </p>
              <div className="max-w-xs space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-stone-400">Ocean Sea Level</span>
                  <span className="font-mono text-sky-300">{seaLevel.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0.18}
                  max={0.45}
                  step={0.01}
                  value={seaLevel}
                  onChange={(e) => setSeaLevel(Number(e.target.value))}
                  className="w-full accent-sky-500"
                />
              </div>
            </div>
          )}

          {mode === 'heightmap' && (
            <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-800/40 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-emerald-200">Grayscale Heightmap Image</div>
                  <div className="text-[11px] text-stone-400">
                    Dark pixels form ocean trenches; bright pixels rise into highlands and alpine peaks.
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => handleHeightmapFile(e.target.files?.[0])}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold cursor-pointer flex items-center gap-1.5"
                >
                  <ImageUp className="w-3.5 h-3.5" />
                  Choose PNG / JPG
                </button>
              </div>

              {uploadError && (
                <div className="flex items-center gap-2 text-xs text-rose-300 bg-rose-950/50 border border-rose-800/60 rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              {heightmapPreviewUrl && heightmapBuffer && (
                <div className="flex flex-col sm:flex-row gap-4 items-center bg-stone-900/70 border border-stone-800 rounded-xl p-3">
                  <img
                    src={heightmapPreviewUrl}
                    alt="Heightmap preview"
                    className="w-44 h-28 object-contain rounded-lg bg-black border border-stone-700"
                  />
                  <div className="flex-1 space-y-2 w-full">
                    <div className="text-xs font-mono text-emerald-300 truncate">
                      {heightmapName} ({heightmapBuffer.width} × {heightmapBuffer.height})
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-stone-400">Sea Level Cutoff</span>
                          <span className="font-mono text-sky-300">{seaLevel.toFixed(2)}</span>
                        </div>
                        <input
                          type="range"
                          min={0.12}
                          max={0.62}
                          step={0.01}
                          value={seaLevel}
                          onChange={(e) => setSeaLevel(Number(e.target.value))}
                          className="w-full accent-sky-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] text-stone-400 block">Climate Preset</label>
                        <select
                          value={climate}
                          onChange={(e) => setClimate(e.target.value as ClimateTemplate)}
                          className="w-full px-2 py-1 rounded bg-stone-950 border border-stone-700 text-xs text-stone-100"
                        >
                          {CLIMATES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-stone-800 bg-stone-900/70 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-xs font-medium text-stone-300 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={mode === 'heightmap' && !heightmapBuffer}
            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-45 disabled:cursor-not-allowed text-xs font-semibold text-white shadow-lg cursor-pointer"
          >
            {mode === 'procedural'
              ? 'Generate Procedural World'
              : mode === 'blank'
              ? 'Open Blank Ocean Canvas'
              : 'Import Heightmap into Builder'}
          </button>
        </div>
      </div>
    </div>
  );
};
