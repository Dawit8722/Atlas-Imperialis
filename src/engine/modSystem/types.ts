export type ModMergeOperation = 'add' | 'patch' | 'replace';

export type ModRegistryDomain =
  | 'traits'
  | 'commodities'
  | 'recipes'
  | 'cultures'
  | 'religions'
  | 'units'
  | 'tactics'
  | 'reforms';

export interface RegistryPatchEntry<T = Record<string, unknown>> {
  id: string;
  op: ModMergeOperation;
  data: T;
}

export interface ModManifest {
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  enabled?: boolean;
  loadOrder?: number;
  entries?: Partial<Record<ModRegistryDomain, RegistryPatchEntry[]>>;
}

export interface ModDiagnostic {
  modId: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface ModValidationReport {
  loadedModIds: string[];
  skippedModIds: string[];
  appliedCount: number;
  diagnostics: ModDiagnostic[];
}
