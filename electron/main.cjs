const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

function getSavesDir() {
  const dir = path.join(app.getPath('userData'), 'saves');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getModsDir() {
  const dir = path.join(app.getPath('userData'), 'mods');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sanitizeSlotId(slotId) {
  if (typeof slotId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(slotId)) {
    throw new Error('Invalid save slot identifier.');
  }
  return slotId;
}

function createWindow() {
  const iconPath = path.join(__dirname, '..', 'build', 'icon.ico');
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0c0a09',
    autoHideMenuBar: true,
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devUrl =
    process.env.ELECTRON_START_URL ||
    (process.argv.includes('--dev') ? 'http://localhost:3000' : '');
  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

app.setAppUserModelId('com.realmsmith.studio');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    ipcMain.handle('saves:list', async () => {
      const dir = getSavesDir();
      const files = await fs.promises.readdir(dir);
      const metas = [];
      for (const file of files) {
        if (!file.endsWith('.meta.json')) continue;
        try {
          const raw = await fs.promises.readFile(path.join(dir, file), 'utf8');
          metas.push(JSON.parse(raw));
        } catch {}
      }
      return metas.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
    });

    ipcMain.handle('saves:write', async (_ev, slotId, json, meta) => {
      try {
        const safeId = sanitizeSlotId(slotId);
        const dir = getSavesDir();
        await fs.promises.writeFile(path.join(dir, `${safeId}.json`), json, 'utf8');
        await fs.promises.writeFile(path.join(dir, `${safeId}.meta.json`), JSON.stringify(meta), 'utf8');
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    });

    ipcMain.handle('saves:read', async (_ev, slotId) => {
      try {
        const safeId = sanitizeSlotId(slotId);
        const json = await fs.promises.readFile(path.join(getSavesDir(), `${safeId}.json`), 'utf8');
        return { ok: true, json };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    });

    ipcMain.handle('saves:delete', async (_ev, slotId) => {
      const safeId = sanitizeSlotId(slotId);
      const dir = getSavesDir();
      await fs.promises.rm(path.join(dir, `${safeId}.json`), { force: true });
      await fs.promises.rm(path.join(dir, `${safeId}.meta.json`), { force: true });
    });

    ipcMain.handle('export:pdf', async (event, defaultFilename) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return { ok: false, error: 'Window unavailable' };
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        defaultPath: defaultFilename || 'WorldLoreBook.pdf',
        filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
      });
      if (canceled || !filePath) return { ok: false, canceled: true };
      const pdfBuffer = await win.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
      });
      await fs.promises.writeFile(filePath, pdfBuffer);
      return { ok: true };
    });

    ipcMain.handle('export:image', async (event, defaultFilename, base64Data, format) => {
      try {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) return { ok: false, error: 'Window unavailable' };
        const ext = format === 'svg' ? 'svg' : 'png';
        const { canceled, filePath } = await dialog.showSaveDialog(win, {
          defaultPath: defaultFilename || `RealmSmith-Atlas.${ext}`,
          filters: [
            ext === 'svg'
              ? { name: 'Vector SVG Image', extensions: ['svg'] }
              : { name: 'PNG Image', extensions: ['png'] },
          ],
        });
        if (canceled || !filePath) return { ok: false, canceled: true };
        if (ext === 'svg') {
          await fs.promises.writeFile(filePath, base64Data, 'utf8');
        } else {
          const cleanB64 = String(base64Data).replace(/^data:image\/png;base64,/, '');
          await fs.promises.writeFile(filePath, Buffer.from(cleanB64, 'base64'));
        }
        return { ok: true, filePath };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    });

    ipcMain.handle('mods:list', async () => {
      const dir = getModsDir();
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      const packs = [];
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.json')) {
          try {
            const raw = await fs.promises.readFile(path.join(dir, entry.name), 'utf8');
            packs.push({ filename: entry.name, json: raw });
          } catch {}
        } else if (entry.isDirectory()) {
          const manifestPath = path.join(dir, entry.name, 'manifest.json');
          if (fs.existsSync(manifestPath)) {
            try {
              const raw = await fs.promises.readFile(manifestPath, 'utf8');
              packs.push({ filename: `${entry.name}/manifest.json`, json: raw });
            } catch {}
          }
        }
      }
      return packs;
    });

    ipcMain.handle('mods:write', async (_ev, modId, json) => {
      try {
        const safeId = sanitizeSlotId(modId);
        const dir = getModsDir();
        await fs.promises.writeFile(path.join(dir, `${safeId}.json`), json, 'utf8');
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    });

    ipcMain.handle('mods:stamps', async () => {
      const result = { mountains: [], hills: [], trees: [], castles: [], towns: [] };
      const categories = Object.keys(result);
      const dir = getModsDir();
      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const stampsRoot = path.join(dir, entry.name, 'stamps');
          if (!fs.existsSync(stampsRoot)) continue;
          for (const cat of categories) {
            const catDir = path.join(stampsRoot, cat);
            if (!fs.existsSync(catDir)) continue;
            const files = await fs.promises.readdir(catDir);
            for (const file of files) {
              if (!file.toLowerCase().endsWith('.png')) continue;
              try {
                const buf = await fs.promises.readFile(path.join(catDir, file));
                result[cat].push(`data:image/png;base64,${buf.toString('base64')}`);
              } catch {}
            }
          }
        }
      } catch {}
      return result;
    });

    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
