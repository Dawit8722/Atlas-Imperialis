import { WorldState } from '../types/world';
import { exportBrushDiffs, rehydrateMeshAndSim, SparseBrushDiffs } from './worldGenerator';
import { ensureEconomy } from './economyEngine';

const STORAGE_INDEX_KEY = 'realmsmith_save_slots_v1';
const STORAGE_PREFIX = 'realmsmith_save_payload_v1_';

export interface SaveSlotMeta {
  slotId: string;
  worldName: string;
  seed: string;
  template: string;
  currentYear: number;
  savedAt: string;
  byteSize: number;
}

export interface DehydratedWorldPayload {
  version: 2;
  savedAt: string;
  world: Omit<WorldState, 'mesh' | 'sim'>;
  brushDiffs: SparseBrushDiffs;
}

/**
 * Strips heavy reconstructible DualMesh, Simulation Float32Arrays, cell Voronoi polygons,
 * and typed grid density buffers while preserving all world history, dynasties, and sparse brush diffs.
 */
export function dehydrateWorldForStorage(world: WorldState): DehydratedWorldPayload {
  const { mesh: _mesh, sim: _sim, ...restWorld } = world;
  const brushDiffs = exportBrushDiffs();

  const strippedCells = world.cells.map((c) => ({
    ...c,
    polygon: [],
  }));

  const strippedTrade = world.tradeNetwork
    ? {
        routes: world.tradeNetwork.routes,
        caravans: world.tradeNetwork.caravans,
        tradeHubs: world.tradeNetwork.tradeHubs,
      }
    : undefined;

  return {
    version: 2,
    savedAt: new Date().toISOString(),
    world: {
      ...restWorld,
      cells: strippedCells,
      tradeNetwork: strippedTrade,
    },
    brushDiffs,
  };
}

/**
 * Deterministically reconstructs DualMesh polygons, Noise2D heightfields, hydrological DAG,
 * and sculpted brush diffs from a dehydrated campaign payload.
 */
export function rehydrateWorldFromStorage(payload: DehydratedWorldPayload): WorldState {
  const normalizedSettings = {
    ...payload.world.settings,
    terrainSim: payload.world.settings?.terrainSim || {
      windAngleDeg: 35,
      raininess: 0.65,
      seaLevel: 0.28,
      minRiverFlow: 14,
      brushMode: 'inspect' as const,
      brushSize: 32,
      brushStrength: 0.08,
      brushFalloff: 'soft' as const,
    },
  };
  const baseWorld: WorldState = {
    ...payload.world,
    settings: normalizedSettings,
    cells: payload.world.cells || [],
  };
  const rehydrated = rehydrateMeshAndSim(baseWorld, payload.brushDiffs);
  ensureEconomy(rehydrated);
  return rehydrated;
}

export function listSaveSlots(): SaveSlotMeta[] {
  try {
    const raw = localStorage.getItem(STORAGE_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
  } catch {
    return [];
  }
}

export function saveToSlot(slotId: string, world: WorldState): { ok: boolean; error?: string; meta?: SaveSlotMeta } {
  try {
    const payload = dehydrateWorldForStorage(world);
    const json = JSON.stringify(payload);
    localStorage.setItem(`${STORAGE_PREFIX}${slotId}`, json);

    const meta: SaveSlotMeta = {
      slotId,
      worldName: world.settings.name || world.realms[0]?.name || 'Unnamed Realm',
      seed: String(world.settings.seed),
      template: world.settings.template || 'Continents',
      currentYear: world.currentYear,
      savedAt: payload.savedAt,
      byteSize: json.length,
    };

    const existing = listSaveSlots().filter((s) => s.slotId !== slotId);
    existing.unshift(meta);
    localStorage.setItem(STORAGE_INDEX_KEY, JSON.stringify(existing.slice(0, 12)));
    return { ok: true, meta };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Storage quota exceeded';
    return { ok: false, error: `Save failed: ${msg}. Try deleting an older slot or exporting .json.` };
  }
}

export function loadFromSlot(slotId: string): { ok: boolean; world?: WorldState; error?: string } {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${slotId}`);
    if (!raw) return { ok: false, error: 'Save slot not found.' };
    const parsed = JSON.parse(raw) as DehydratedWorldPayload;
    if (!parsed || !parsed.world || !parsed.world.settings) {
      return { ok: false, error: 'Corrupted save data.' };
    }
    return { ok: true, world: rehydrateWorldFromStorage(parsed) };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to parse save slot.' };
  }
}

export function deleteSaveSlot(slotId: string) {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${slotId}`);
    const next = listSaveSlots().filter((s) => s.slotId !== slotId);
    localStorage.setItem(STORAGE_INDEX_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage cleanup errors
  }
}

export function serializeWorldArchive(world: WorldState): string {
  return JSON.stringify(dehydrateWorldForStorage(world));
}

export function parseWorldArchive(jsonText: string): { ok: boolean; world?: WorldState; error?: string } {
  try {
    const parsed = JSON.parse(jsonText) as DehydratedWorldPayload;
    if (!parsed || !parsed.world || !parsed.world.settings) {
      return { ok: false, error: 'Invalid RealmSmith chronicle archive file.' };
    }
    return { ok: true, world: rehydrateWorldFromStorage(parsed) };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid JSON archive.' };
  }
}

export async function listSaveSlotsAsync(): Promise<SaveSlotMeta[]> {
  if (typeof window !== 'undefined' && window.desktopAPI?.saves) {
    return window.desktopAPI.saves.list();
  }
  return listSaveSlots();
}

export async function saveToSlotAsync(
  slotId: string,
  world: WorldState
): Promise<{ ok: boolean; error?: string; meta?: SaveSlotMeta }> {
  if (typeof window !== 'undefined' && window.desktopAPI?.saves) {
    try {
      const payload = dehydrateWorldForStorage(world);
      const json = JSON.stringify(payload);
      const meta: SaveSlotMeta = {
        slotId,
        worldName: world.settings.name || world.realms[0]?.name || 'Unnamed Realm',
        seed: String(world.settings.seed),
        template: world.settings.template || 'Continents',
        currentYear: world.currentYear,
        savedAt: payload.savedAt,
        byteSize: json.length,
      };
      const res = await window.desktopAPI.saves.write(slotId, json, meta);
      return res.ok ? { ok: true, meta } : { ok: false, error: res.error };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : 'Desktop save failed.' };
    }
  }
  return saveToSlot(slotId, world);
}

export async function loadFromSlotAsync(
  slotId: string
): Promise<{ ok: boolean; world?: WorldState; error?: string }> {
  if (typeof window !== 'undefined' && window.desktopAPI?.saves) {
    try {
      const res = await window.desktopAPI.saves.read(slotId);
      if (!res.ok || !res.json) return { ok: false, error: res.error || 'Save not found.' };
      const parsed = JSON.parse(res.json) as DehydratedWorldPayload;
      if (!parsed?.world?.settings) return { ok: false, error: 'Corrupted save data.' };
      return { ok: true, world: rehydrateWorldFromStorage(parsed) };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to parse save.' };
    }
  }
  return loadFromSlot(slotId);
}

export async function deleteSaveSlotAsync(slotId: string): Promise<void> {
  if (typeof window !== 'undefined' && window.desktopAPI?.saves) {
    await window.desktopAPI.saves.delete(slotId);
    return;
  }
  deleteSaveSlot(slotId);
}

