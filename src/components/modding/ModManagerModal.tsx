import React, { useEffect, useRef, useState } from 'react';
import { ModManifest, ModValidationReport } from '../../engine/modSystem/types';
import {
  applyAndValidateMods,
  createSampleModManifest,
  loadInstalledMods,
  persistInstalledMods,
} from '../../engine/modSystem/modLoader';
import { isElectronDesktop } from '../../utils/runtimeEnv';
import { ModStudioModal } from './ModStudioModal';
import { ArrowDown, ArrowUp, CheckCircle2, Package, Plus, Sparkles, Trash2, Upload, X, AlertTriangle } from 'lucide-react';

interface ModManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNotify: (msg: string) => void;
  onModsApplied?: (report: ModValidationReport) => void;
}

export const ModManagerModal: React.FC<ModManagerModalProps> = ({
  isOpen,
  onClose,
  onNotify,
  onModsApplied,
}) => {
  const [mods, setMods] = useState<ModManifest[]>([]);
  const [report, setReport] = useState<ModValidationReport | null>(null);
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    if (isOpen) {
      void loadInstalledMods().then((loaded) => {
        if (!active) return;
        setMods(loaded);
        setReport(applyAndValidateMods(loaded));
      });
    }
    return () => {
      active = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const commitMods = async (next: ModManifest[]) => {
    const normalized = next.map((m, idx) => ({ ...m, loadOrder: idx + 1 }));
    setMods(normalized);
    await persistInstalledMods(normalized);
    const nextReport = applyAndValidateMods(normalized);
    setReport(nextReport);
    onModsApplied?.(nextReport);
  };

  const handleImportModJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as ModManifest;
      if (!parsed?.id || !parsed?.name) {
        onNotify('Invalid mod manifest: missing "id" or "name".');
        return;
      }
      const next = [...mods.filter((m) => m.id !== parsed.id), { enabled: true, ...parsed }];
      await commitMods(next);
      onNotify(`Installed mod "${parsed.name}" v${parsed.version || '1.0.0'}.`);
    } catch {
      onNotify('Failed to parse mod JSON file.');
    } finally {
      e.target.value = '';
    }
  };

  const handleAddSampleMod = async () => {
    const sample = createSampleModManifest();
    await commitMods([...mods, sample]);
    onNotify(`Created sample mod "${sample.name}".`);
  };

  const handleToggle = async (id: string) => {
    await commitMods(mods.map((m) => (m.id === id ? { ...m, enabled: m.enabled === false } : m)));
  };

  const handleMove = async (idx: number, delta: -1 | 1) => {
    const target = idx + delta;
    if (target < 0 || target >= mods.length) return;
    const copy = [...mods];
    const [item] = copy.splice(idx, 1);
    copy.splice(target, 0, item);
    await commitMods(copy);
  };

  const handleDelete = async (id: string) => {
    await commitMods(mods.filter((m) => m.id !== id));
    onNotify('Removed mod from load order.');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 no-print">
      <div className="w-full max-w-2xl bg-stone-950 border border-stone-800 rounded-xl shadow-2xl text-stone-100 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-800 bg-stone-900/60">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-amber-400" />
            <div>
              <h2 className="text-sm font-serif font-semibold tracking-wide text-amber-300">
                Universal Mod Manager &amp; Registries
              </h2>
              <p className="text-[11px] text-stone-400">
                {isElectronDesktop()
                  ? 'Reading from %AppData%\\RealmSmith\\mods\\'
                  : 'Browser Mod Sandbox (Import .json Mod Manifests)'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Import Mod (.json)
            </button>
            <button
              type="button"
              onClick={() => setIsStudioOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600/25 hover:bg-emerald-600/35 border border-emerald-500/40 text-emerald-200 font-semibold cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              Open Mod Studio
            </button>
            <button
              type="button"
              onClick={handleAddSampleMod}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-200 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-400" />
              Create Sample Mod Pack
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportModJson}
              className="hidden"
            />
          </div>

          {mods.length === 0 ? (
            <div className="p-6 text-center rounded-lg border border-dashed border-stone-800 text-stone-500">
              No mods installed. Import a JSON mod manifest supporting add / patch / replace entries for traits, commodities, recipes, cultures, religions, units, tactics, or reforms.
            </div>
          ) : (
            <div className="divide-y divide-stone-800 border border-stone-800 rounded-lg overflow-hidden bg-stone-900/40">
              {mods.map((mod, idx) => (
                <div key={mod.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={mod.enabled !== false}
                      onChange={() => handleToggle(mod.id)}
                      className="mt-1 accent-amber-500"
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-stone-100 truncate">
                        {mod.name}{' '}
                        <span className="text-[10px] font-mono text-stone-400">v{mod.version}</span>
                      </div>
                      {mod.description && (
                        <div className="text-[11px] text-stone-400 truncate">{mod.description}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleMove(idx, -1)}
                      disabled={idx === 0}
                      className="p-1 rounded text-stone-400 hover:text-white hover:bg-stone-800 disabled:opacity-30"
                      title="Move up in load order"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(idx, 1)}
                      disabled={idx === mods.length - 1}
                      className="p-1 rounded text-stone-400 hover:text-white hover:bg-stone-800 disabled:opacity-30"
                      title="Move down in load order"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(mod.id)}
                      className="p-1 rounded text-stone-400 hover:text-red-400 hover:bg-stone-800"
                      title="Remove mod"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {report && report.diagnostics.length > 0 && (
            <div className="p-3 rounded-lg bg-stone-900/70 border border-stone-800 space-y-1.5">
              <div className="text-[11px] uppercase tracking-wider text-stone-400 font-semibold">
                Mod Diagnostics ({report.appliedCount} patches applied)
              </div>
              {report.diagnostics.map((d, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[11px]">
                  {d.level === 'error' ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  )}
                  <span className={d.level === 'error' ? 'text-red-300' : 'text-stone-300'}>
                    [{d.modId}] {d.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ModStudioModal
        isOpen={isStudioOpen}
        onClose={() => setIsStudioOpen(false)}
        existingMods={mods}
        onSaveModPack={async (manifest) => {
          const next = [...mods.filter((m) => m.id !== manifest.id), manifest];
          await commitMods(next);
          onNotify(`Saved entry to mod pack "${manifest.name}" and refreshed live registries.`);
        }}
      />
    </div>
  );
};
