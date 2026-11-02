'use strict';
/*
 * VIDA Dental — Electron main process.
 */
const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const { openStore } = require('./db.js');
const { createApi } = require('./api.js');
const { createUpdater } = require('./updater.js');

if (process.env.VIDA_USER_DATA) app.setPath('userData', process.env.VIDA_USER_DATA);

let win = null;
let store = null;
let api = null;
const session = { user: null };

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
  });
  app.whenReady().then(start);
}

function dbPath() { return path.join(app.getPath('userData'), 'vida-dental.db'); }
function backupDir() {
  const d = path.join(app.getPath('userData'), 'backups');
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

// Keeps the newest automatic copies in the app's own folder, so a bad day can
// always be rolled back even if nobody pressed "Back up now".
function autoBackup(reason) {
  try {
    if (!store) return;
    const dir = backupDir();
    const dest = path.join(dir, `auto-${stamp()}-${reason}.db`);
    if (fs.existsSync(dest)) return;
    store.backupTo(null, dest);
    const files = fs.readdirSync(dir).filter(f => f.startsWith('auto-')).sort();
    while (files.length > 14) fs.unlinkSync(path.join(dir, files.shift()));
  } catch (e) { console.error('[backup] automatic backup failed', e); }
}

function start() {
  store = openStore(dbPath());
  autoBackup('start');
  setInterval(() => autoBackup('hourly'), 60 * 60 * 1000).unref();

  const updater = createUpdater({ app, getWindow: () => win, isPackaged: app.isPackaged });

  api = createApi(store, {
    version: app.isPackaged ? app.getVersion() : require('../../package.json').version,
    backup: async (s) => {
      const res = await dialog.showSaveDialog(win, {
        title: 'Save a backup of this laptop',
        defaultPath: path.join(app.getPath('documents'), `VIDA-Dental-Backup-${stamp()}.db`),
        filters: [{ name: 'VIDA Dental backup', extensions: ['db'] }]
      });
      if (res.canceled || !res.filePath) return { canceled: true };
      return store.backupTo(s.user, res.filePath);
    },
    restore: async (s) => {
      const res = await dialog.showOpenDialog(win, {
        title: 'Restore from a backup', properties: ['openFile'],
        filters: [{ name: 'VIDA Dental backup', extensions: ['db'] }]
      });
      if (res.canceled || !res.filePaths[0]) return { canceled: true };
      const src = res.filePaths[0];
      // Check it really is a VIDA Dental database before replacing anything.
      const { DatabaseSync } = require('node:sqlite');
      try {
        const test = new DatabaseSync(src, { readOnly: true });
        const names = test.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name);
        test.close();
        for (const t of ['staff', 'events', 'patients', 'visits', 'consents']) {
          if (!names.includes(t)) throw new Error('missing ' + t);
        }
      } catch {
        return { error: 'That file is not a VIDA Dental backup.' };
      }
      const confirm = await dialog.showMessageBox(win, {
        type: 'warning', buttons: ['Cancel', 'Replace and restart'], defaultId: 0, cancelId: 0,
        message: 'Replace everything on this laptop with the backup?',
        detail: 'A copy of the current data is saved first in the app’s backups folder. The app restarts afterwards.'
      });
      if (confirm.response !== 1) return { canceled: true };
      store.backupTo(s.user, path.join(backupDir(), `before-restore-${stamp()}.db`));
      store.audit(s.user, 'backup.restore', 'database', null, src);
      store.close();
      for (const ext of ['', '-wal', '-shm']) { try { fs.unlinkSync(dbPath() + ext); } catch { /* none */ } }
      fs.copyFileSync(src, dbPath());
      app.relaunch();
      app.exit(0);
      return { restarting: true };
    },
    updateCheck: () => updater.check(),
    updateDownload: () => updater.download(),
    updateInstall: (s) => { store.audit(s.user, 'update.install', 'app', null, updater.status().version); return updater.install(); },
    updateInstallFromFile: (s) => updater.installFromFile(win, (file) => store.audit(s.user, 'update.install_file', 'app', null, file)),
    updateStatus: () => updater.status(),
    devtools: () => { if (win) win.webContents.openDevTools({ mode: 'detach' }); return true; }
  });

  ipcMain.handle('api', async (event, channel, args) => {
    if (!win || event.sender !== win.webContents) return { ok: false, error: 'Not allowed.' };
    return api.call(session, channel, args);
  });

  buildMenu();
  createWindow();
  updater.checkSilently(4000);

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { autoBackup('quit'); });
}

function buildMenu() {
  const template = [
    { label: 'File', submenu: [{ role: 'quit', label: 'Quit VIDA Dental' }] },
    { label: 'View', submenu: [
      { role: 'zoomIn', label: 'Larger text' }, { role: 'zoomOut', label: 'Smaller text' },
      { role: 'resetZoom', label: 'Normal size' }, { type: 'separator' }, { role: 'togglefullscreen' }
    ] },
    { label: 'Help', submenu: [{
      label: 'About VIDA Dental',
      click: () => dialog.showMessageBox(win, { message: `VIDA Dental ${app.getVersion()}`, detail: 'Dental clinic software for VIDA (Vida Volunteer). Works fully offline.' })
    }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1320, height: 880, minWidth: 1024, minHeight: 700,
    title: 'VIDA Dental', backgroundColor: '#fffaf3', show: false,
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false
    }
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) e.preventDefault(); });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.on('closed', () => { win = null; });
}

module.exports = { getWindow: () => win, getStore: () => store };
