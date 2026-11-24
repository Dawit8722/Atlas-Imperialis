import { ModManifest, ModValidationReport } from './types';
import { globalModRegistry } from './registryManager';
import { seedVanillaModRegistries } from './vanillaBootstrap';

const BROWSER_MODS_KEY = 'realmsmith_installed_mods_v1';

export async function loadInstalledMods(): Promise<ModManifest[]> {
  // 1. Electron desktop: read %AppData%/RealmSmith/mods/*.json or */manifest.json
  if (typeof window !== 'undefined' && window.desktopAPI?.mods) {
    try {
      const rawPacks = await window.desktopAPI.mods.list();
      const parsed: ModManifest[] = [];
      for (const pack of rawPacks) {
        try {
          const manifest = JSON.parse(pack.json) as ModManifest;
          if (manifest?.id && manifest?.name) {
            parsed.push({ enabled: true, loadOrder: parsed.length + 1, ...manifest });
          }
        } catch {
          // Skip malformed mod files without crashing
        }
      }
      return parsed;
    } catch {
      return [];
    }
  }

  // 2. Browser / AI Studio preview: read localStorage
  try {
    const raw = localStorage.getItem(BROWSER_MODS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function persistInstalledMods(mods: ModManifest[]): Promise<void> {
  if (typeof window !== 'undefined' && window.desktopAPI?.mods) {
    for (const mod of mods) {
      await window.desktopAPI.mods.write(mod.id, JSON.stringify(mod, null, 2));
    }
    return;
  }
  try {
    localStorage.setItem(BROWSER_MODS_KEY, JSON.stringify(mods));
  } catch {
    // Ignore storage quota errors
  }
}

export function applyAndValidateMods(mods: ModManifest[]): ModValidationReport {
  seedVanillaModRegistries();
  return globalModRegistry.applyMods(mods);
}

export function createSampleModManifest(): ModManifest {
  return {
    id: `custom_pack_${Date.now().toString(36)}`,
    name: 'Chronicle Expansion Sample',
    version: '1.0.0',
    author: 'Worldsmith',
    description: 'Sample data-driven mod adding a custom noble trait and luxury trade good.',
    enabled: true,
    loadOrder: 10,
    entries: {
      traits: [
        {
          id: 'star_navigator',
          op: 'add',
          data: {
            name: 'Star Navigator',
            category: 'Lifestyle',
            stewardship: 2,
            learning: 2,
            description: 'Charts open-ocean passages by astrolabe and constellations.',
          },
        },
      ],
      commodities: [
        {
          id: 'sky_amber',
          op: 'add',
          data: {
            name: 'Sky Amber',
            basePrice: 18,
            category: 'Luxury',
          },
        },
      ],
    },
  };
}
