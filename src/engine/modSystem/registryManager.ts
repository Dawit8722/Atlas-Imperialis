import { ModDiagnostic, ModManifest, ModRegistryDomain, ModValidationReport, RegistryPatchEntry } from './types';

export class Registry<T extends { id: string }> {
  private baseItems = new Map<string, T>();
  private activeItems = new Map<string, T>();

  constructor(initialItems: T[] = []) {
    if (initialItems.length > 0) {
      this.seedVanilla(initialItems);
    }
  }

  seedVanilla(items: T[]): void {
    this.baseItems.clear();
    this.activeItems.clear();
    for (const item of items) {
      const cloned = typeof structuredClone === 'function' ? structuredClone(item) : JSON.parse(JSON.stringify(item));
      this.baseItems.set(item.id, cloned);
      this.activeItems.set(
        item.id,
        typeof structuredClone === 'function' ? structuredClone(item) : JSON.parse(JSON.stringify(item))
      );
    }
  }

  hasVanilla(): boolean {
    return this.baseItems.size > 0;
  }

  resetToVanilla(): void {
    this.activeItems.clear();
    for (const [id, item] of this.baseItems.entries()) {
      this.activeItems.set(
        id,
        typeof structuredClone === 'function' ? structuredClone(item) : JSON.parse(JSON.stringify(item))
      );
    }
  }

  applyEntry(entry: RegistryPatchEntry<Partial<T>>): { ok: boolean; warning?: string; error?: string } {
    if (!entry || typeof entry.id !== 'string' || !entry.id.trim()) {
      return { ok: false, error: 'Entry missing valid string id.' };
    }
    const existing = this.activeItems.get(entry.id);

    if (entry.op === 'add') {
      if (existing) {
        return {
          ok: true,
          warning: `Entry "${entry.id}" already exists; skipped duplicate add (use "patch" or "replace").`,
        };
      }
      this.activeItems.set(entry.id, { ...(entry.data as T), id: entry.id });
      return { ok: true };
    }

    if (entry.op === 'patch') {
      if (!existing) {
        return { ok: false, error: `Cannot patch missing entry "${entry.id}".` };
      }
      this.activeItems.set(entry.id, { ...existing, ...(entry.data as Partial<T>), id: entry.id });
      return { ok: true };
    }

    if (entry.op === 'replace') {
      this.activeItems.set(entry.id, { ...(entry.data as T), id: entry.id });
      return { ok: true };
    }

    return { ok: false, error: `Unknown op "${String(entry.op)}" on "${entry.id}".` };
  }

  get(id: string): T | undefined {
    return this.activeItems.get(id);
  }

  getAll(): T[] {
    return Array.from(this.activeItems.values());
  }

  size(): number {
    return this.activeItems.size;
  }
}

export class ModRegistryManager {
  private registries: Record<ModRegistryDomain, Registry<any>> = {
    traits: new Registry(),
    commodities: new Registry(),
    recipes: new Registry(),
    cultures: new Registry(),
    religions: new Registry(),
    units: new Registry(),
    tactics: new Registry(),
    reforms: new Registry(),
  };

  getRegistry<T extends { id: string }>(domain: ModRegistryDomain): Registry<T> {
    return this.registries[domain];
  }

  applyMods(mods: ModManifest[]): ModValidationReport {
    const diagnostics: ModDiagnostic[] = [];
    const loadedModIds: string[] = [];
    const skippedModIds: string[] = [];
    let appliedCount = 0;

    for (const domain of Object.keys(this.registries) as ModRegistryDomain[]) {
      this.registries[domain].resetToVanilla();
    }

    const sorted = [...mods]
      .filter((m) => m.enabled !== false)
      .sort((a, b) => (a.loadOrder ?? 100) - (b.loadOrder ?? 100));

    for (const mod of sorted) {
      if (!mod || !mod.id || !mod.name) {
        skippedModIds.push(mod?.id || 'unknown');
        diagnostics.push({
          modId: mod?.id || 'unknown',
          level: 'error',
          message: 'Skipped malformed mod manifest (missing id or name).',
        });
        continue;
      }

      try {
        const entriesByDomain = mod.entries || {};
        for (const domain of Object.keys(entriesByDomain) as ModRegistryDomain[]) {
          const registry = this.registries[domain];
          if (!registry) {
            diagnostics.push({
              modId: mod.id,
              level: 'warn',
              message: `Unknown registry domain "${domain}" ignored.`,
            });
            continue;
          }
          const list = entriesByDomain[domain] || [];
          for (const entry of list) {
            const res = registry.applyEntry(entry);
            if (!res.ok) {
              diagnostics.push({
                modId: mod.id,
                level: 'error',
                message: `[${domain}] ${res.error}`,
              });
            } else {
              appliedCount++;
              if (res.warning) {
                diagnostics.push({
                  modId: mod.id,
                  level: 'warn',
                  message: `[${domain}] ${res.warning}`,
                });
              }
            }
          }
        }
        loadedModIds.push(mod.id);
        diagnostics.push({
          modId: mod.id,
          level: 'info',
          message: `Loaded "${mod.name}" v${mod.version || '1.0.0'}.`,
        });
      } catch (err: unknown) {
        skippedModIds.push(mod.id);
        diagnostics.push({
          modId: mod.id,
          level: 'error',
          message: err instanceof Error ? err.message : 'Unexpected mod load failure.',
        });
      }
    }

    return { loadedModIds, skippedModIds, appliedCount, diagnostics };
  }
}

export const globalModRegistry = new ModRegistryManager();
