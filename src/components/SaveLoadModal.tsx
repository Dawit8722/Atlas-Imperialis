import React, { useEffect, useRef, useState } from 'react';
import { WorldState } from '../types/world';
import {
  deleteSaveSlotAsync,
  listSaveSlotsAsync,
  loadFromSlotAsync,
  parseWorldArchive,
  SaveSlotMeta,
  saveToSlotAsync,
  serializeWorldArchive,
} from '../engine/storageManager';
import { isElectronDesktop } from '../utils/runtimeEnv';
import { Download, FolderOpen, Link2, Plus, Save, Trash2, Upload, X } from 'lucide-react';

interface SaveLoadModalProps {
  isOpen: boolean;
  onClose: () => void;
  world: WorldState;
  onLoadWorld: (loaded: WorldState) => void;
  onNotify: (message: string) => void;
}

export const SaveLoadModal: React.FC<SaveLoadModalProps> = ({
  isOpen,
  onClose,
  world,
  onLoadWorld,
  onNotify,
}) => {
  const [slots, setSlots] = useState<SaveSlotMeta[]>([]);
  const [newSlotName, setNewSlotName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const worldTitle = world.settings.name || world.realms[0]?.name || 'RealmSmith Campaign';
  const worldTemplate = world.settings.template || 'Continents';

  useEffect(() => {
    let active = true;
    if (isOpen) {
      void listSaveSlotsAsync().then((loaded) => {
        if (active) setSlots(loaded);
      });
      setErrorMsg(null);
      setConfirmDeleteId(null);
      setNewSlotName(`${worldTitle} (${world.currentYear} AC)`);
    }
    return () => {
      active = false;
    };
  }, [isOpen, worldTitle, world.currentYear]);

  if (!isOpen) return null;

  const handleCreateSave = async () => {
    setErrorMsg(null);
    const slotId = `slot_${Date.now()}`;
    const res = await saveToSlotAsync(slotId, {
      ...world,
      settings: {
        ...world.settings,
        name: newSlotName.trim() || worldTitle,
      },
    });
    if (!res.ok) {
      setErrorMsg(res.error || 'Failed to save campaign.');
      return;
    }
    setSlots(await listSaveSlotsAsync());
    onNotify(`Campaign saved (${Math.round((res.meta?.byteSize || 0) / 1024)} KB dehydrated).`);
  };

  const handleOverwriteSlot = async (slotId: string) => {
    setErrorMsg(null);
    const res = await saveToSlotAsync(slotId, world);
    if (!res.ok) {
      setErrorMsg(res.error || 'Failed to overwrite save.');
      return;
    }
    setSlots(await listSaveSlotsAsync());
    onNotify(`Updated save slot (${world.currentYear} AC).`);
  };

  const handleLoadSlot = async (slotId: string) => {
    setErrorMsg(null);
    const res = await loadFromSlotAsync(slotId);
    if (!res.ok || !res.world) {
      setErrorMsg(res.error || 'Could not load slot.');
      return;
    }
    onLoadWorld(res.world);
    onNotify(`Restored campaign at Year ${res.world.currentYear} AC.`);
    onClose();
  };

  const handleExportJson = () => {
    const json = serializeWorldArchive(world);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = worldTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    a.download = `${safeName}-${world.currentYear}ac.json`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify('Exported dehydrated .json chronicle archive.');
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseWorldArchive(text);
      if (!parsed.ok || !parsed.world) {
        setErrorMsg(parsed.error || 'Failed to read archive.');
        return;
      }
      onLoadWorld(parsed.world);
      const importedName = parsed.world.settings.name || parsed.world.realms[0]?.name || 'Imported World';
      onNotify(`Imported "${importedName}" (${parsed.world.currentYear} AC).`);
      onClose();
    } catch {
      setErrorMsg('Unable to read selected JSON file.');
    } finally {
      e.target.value = '';
    }
  };

  const handleCopyPermalink = async () => {
    const seedVal = String(world.settings.seed);
    if (isElectronDesktop()) {
      const token = `seed:${seedVal}|template:${worldTemplate}`;
      try {
        await navigator.clipboard.writeText(token);
        onNotify(`Copied world seed token (${token}) to clipboard.`);
      } catch {
        onNotify(`World Seed Token: ${token}`);
      }
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set('seed', seedVal);
    url.searchParams.set('template', worldTemplate);
    try {
      await navigator.clipboard.writeText(url.toString());
      onNotify('Copied shareable world seed link to clipboard.');
    } catch {
      onNotify(`Seed URL: ?seed=${seedVal}&template=${encodeURIComponent(worldTemplate)}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-stone-950 border border-stone-800 rounded-xl shadow-2xl text-stone-100 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-800 bg-stone-900/60">
          <div>
            <h2 className="text-base font-serif font-semibold tracking-wide text-amber-300">
              Chronicle Vault &amp; Campaign Saves
            </h2>
            <p className="text-xs text-stone-400 mt-0.5 tabular-nums">
              Seed #{world.settings.seed} · {world.settings.template} · Year {world.currentYear} AC
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-stone-800 transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-950/60 border border-red-800/70 text-xs text-red-200">
              {errorMsg}
            </div>
          )}

          {/* Create Save & Archive Actions */}
          <div className="p-4 rounded-lg bg-stone-900/70 border border-stone-800 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={newSlotName}
                onChange={(e) => setNewSlotName(e.target.value)}
                placeholder="Campaign label..."
                className="flex-1 bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-100 focus:outline-none focus:border-amber-500"
              />
              <button
                onClick={handleCreateSave}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Save New Slot
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={handleExportJson}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 text-xs text-stone-200 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-amber-400" />
                Export .json
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 text-xs text-stone-200 transition-colors"
              >
                <Upload className="w-3.5 h-3.5 text-sky-400" />
                Import .json
              </button>
              <button
                onClick={handleCopyPermalink}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 text-xs text-stone-200 transition-colors ml-auto"
              >
                <Link2 className="w-3.5 h-3.5 text-emerald-400" />
                Copy Seed Link
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleImportJson}
                className="hidden"
              />
            </div>
          </div>

          {/* Saved Slots Table */}
          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-wider text-stone-400 font-semibold">
              Browser Chronicle Slots ({slots.length})
            </div>

            {slots.length === 0 ? (
              <div className="p-6 text-center rounded-lg border border-dashed border-stone-800 text-xs text-stone-500">
                No saved campaigns yet. Save a slot to preserve sculpted terrain brushes, enacted council bills, and dynastic annals.
              </div>
            ) : (
              <div className="divide-y divide-stone-800/80 border border-stone-800 rounded-lg overflow-hidden bg-stone-900/40">
                {slots.map((slot) => (
                  <div
                    key={slot.slotId}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 hover:bg-stone-900/80 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-stone-100 truncate">
                        {slot.worldName}
                      </div>
                      <div className="text-[11px] text-stone-400 tabular-nums mt-0.5">
                        Year {slot.currentYear} AC · Seed #{slot.seed} · {slot.template} ·{' '}
                        {Math.round(slot.byteSize / 1024)} KB ·{' '}
                        {new Date(slot.savedAt).toLocaleString()}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleLoadSlot(slot.slotId)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-emerald-700/80 hover:bg-emerald-600 text-white text-xs font-medium transition-colors"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        Load
                      </button>
                      <button
                        onClick={() => handleOverwriteSlot(slot.slotId)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-200 text-xs transition-colors"
                        title="Overwrite with current world"
                      >
                        <Save className="w-3.5 h-3.5" />
                        Update
                      </button>
                      {confirmDeleteId === slot.slotId ? (
                        <button
                          onClick={async () => {
                            await deleteSaveSlotAsync(slot.slotId);
                            setSlots(await listSaveSlotsAsync());
                            setConfirmDeleteId(null);
                          }}
                          className="px-2.5 py-1.5 rounded bg-red-700 hover:bg-red-600 text-white text-xs font-medium"
                        >
                          Confirm
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(slot.slotId)}
                          className="p-1.5 rounded text-stone-400 hover:text-red-400 hover:bg-stone-800 transition-colors"
                          title="Delete save"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
