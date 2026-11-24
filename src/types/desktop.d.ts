import type { SaveSlotMeta } from '../engine/storageManager';

export interface CustomStampPackMap {
  mountains?: string[];
  hills?: string[];
  trees?: string[];
  castles?: string[];
  towns?: string[];
}

export interface DesktopAPI {
  isElectron: true;
  saves: {
    list: () => Promise<SaveSlotMeta[]>;
    write: (slotId: string, json: string, meta: SaveSlotMeta) => Promise<{ ok: boolean; error?: string }>;
    read: (slotId: string) => Promise<{ ok: boolean; json?: string; error?: string }>;
    delete: (slotId: string) => Promise<void>;
  };
  exportPdf: (defaultFilename: string) => Promise<{ ok: boolean; canceled?: boolean; error?: string }>;
  exportImage?: (
    defaultFilename: string,
    data: string,
    format: 'png' | 'svg'
  ) => Promise<{ ok: boolean; canceled?: boolean; filePath?: string; error?: string }>;
  mods?: {
    list: () => Promise<Array<{ filename: string; json: string }>>;
    write: (modId: string, json: string) => Promise<{ ok: boolean; error?: string }>;
    stamps?: () => Promise<CustomStampPackMap>;
  };
}

declare global {
  interface Window {
    desktopAPI?: DesktopAPI;
  }
}

export {};
