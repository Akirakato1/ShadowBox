const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const potrace = require('potrace');

let mainWindow = null;

function designsDir() {
  return path.join(app.getPath('userData'), 'designs');
}

function bundledSamplesDir() {
  return path.join(__dirname, 'samples');
}

async function ensureDesignsDir() {
  await fs.mkdir(designsDir(), { recursive: true });
}

// Copy any bundled samples into the user's designs folder, but only on a
// truly-fresh install (designs folder empty). Avoids re-creating files the
// user deleted on purpose.
async function seedSamplesIfEmpty() {
  await ensureDesignsDir();
  let existing = [];
  try { existing = await fs.readdir(designsDir()); } catch (_) {}
  if (existing.some((n) => n.toLowerCase().endsWith('.json'))) return;

  let samples = [];
  try { samples = await fs.readdir(bundledSamplesDir()); } catch (_) { return; }
  for (const name of samples) {
    if (!name.toLowerCase().endsWith('.json')) continue;
    try {
      const src = path.join(bundledSamplesDir(), name);
      const dst = path.join(designsDir(), name);
      await fs.copyFile(src, dst);
    } catch (_) { /* skip on copy error */ }
  }
}

function safeName(name) {
  const cleaned = String(name).replace(/[^a-zA-Z0-9._ -]/g, '_').trim();
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    throw new Error('invalid filename');
  }
  return cleaned.endsWith('.json') ? cleaned : cleaned + '.json';
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    backgroundColor: '#1a1a18',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Electron persists the per-origin zoom factor across launches; reset on each load
  // so the app always starts at 100%.
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.setZoomLevel(0);
  });

  // Hidden-menu builds lose Chromium's default zoom keybindings. Wire them
  // explicitly so Ctrl+= / Ctrl++ / Ctrl+- / Ctrl+0 all work, regardless of
  // keyboard layout.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (!input.control && !input.meta) return;
    const wc = mainWindow.webContents;
    const step = 0.5;
    if (input.key === '=' || input.key === '+') {
      event.preventDefault();
      wc.setZoomLevel(wc.getZoomLevel() + step);
    } else if (input.key === '-' || input.key === '_') {
      event.preventDefault();
      wc.setZoomLevel(wc.getZoomLevel() - step);
    } else if (input.key === '0') {
      event.preventDefault();
      wc.setZoomLevel(0);
    }
  });
}

app.whenReady().then(async () => {
  await ensureDesignsDir();
  await seedSamplesIfEmpty();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('designs:list', async () => {
  await ensureDesignsDir();
  const entries = await fs.readdir(designsDir());
  const out = [];
  for (const name of entries) {
    if (!name.toLowerCase().endsWith('.json')) continue;
    try {
      const stat = await fs.stat(path.join(designsDir(), name));
      out.push({ name, size: stat.size, mtimeMs: stat.mtimeMs });
    } catch (_) { /* skip unreadable */ }
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out;
});

ipcMain.handle('designs:read', async (_e, name) => {
  const file = path.join(designsDir(), safeName(name));
  return await fs.readFile(file, 'utf8');
});

ipcMain.handle('designs:write', async (_e, name, content) => {
  await ensureDesignsDir();
  const safe = safeName(name);
  await fs.writeFile(path.join(designsDir(), safe), content, 'utf8');
  return { name: safe };
});

ipcMain.handle('designs:delete', async (_e, name) => {
  const file = path.join(designsDir(), safeName(name));
  await fs.unlink(file);
});

ipcMain.handle('designs:exists', async (_e, name) => {
  try {
    await fs.access(path.join(designsDir(), safeName(name)));
    return true;
  } catch (_) {
    return false;
  }
});

ipcMain.handle('designs:dir', () => designsDir());

ipcMain.handle('designs:reveal', async () => {
  await ensureDesignsDir();
  shell.openPath(designsDir());
});

ipcMain.handle('trace:bitmap', async (_e, dataUrl, options) => {
  const m = /^data:image\/png;base64,(.+)$/.exec(dataUrl || '');
  if (!m) throw new Error('expected PNG data URL');
  const buffer = Buffer.from(m[1], 'base64');
  return await new Promise((resolve, reject) => {
    potrace.trace(buffer, options || {}, (err, svg) => {
      if (err) reject(err);
      else resolve(svg);
    });
  });
});
