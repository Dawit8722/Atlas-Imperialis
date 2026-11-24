const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  isElectron: true,
  saves: {
    list: () => ipcRenderer.invoke('saves:list'),
    write: (slotId, json, meta) => ipcRenderer.invoke('saves:write', slotId, json, meta),
    read: (slotId) => ipcRenderer.invoke('saves:read', slotId),
    delete: (slotId) => ipcRenderer.invoke('saves:delete', slotId),
  },
  exportPdf: (defaultFilename) => ipcRenderer.invoke('export:pdf', defaultFilename),
  exportImage: (defaultFilename, data, format) =>
    ipcRenderer.invoke('export:image', defaultFilename, data, format),
  mods: {
    list: () => ipcRenderer.invoke('mods:list'),
    write: (modId, json) => ipcRenderer.invoke('mods:write', modId, json),
    stamps: () => ipcRenderer.invoke('mods:stamps'),
  },
});
