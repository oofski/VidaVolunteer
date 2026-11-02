'use strict';
/*
 * VIDA Dental — software updates.
 *
 * Online: checks GitHub Releases for a newer version (4 seconds after launch
 * and whenever someone presses "Check for updates"). Nothing downloads on its
 * own; anyone can press Download, and an administrator presses
 * "Restart & install". A downloaded update also installs when the app quits.
 *
 * Offline: an administrator can pick an installer file from a USB drive or
 * folder (VIDA-Dental-Setup-x.y.z.exe or VIDA-Dental-Portable-x.y.z.exe).
 */
const path = require('node:path');
const { spawn } = require('node:child_process');
const { dialog } = require('electron');

function newer(a, b) {
  const pa = String(a).split(/[.-]/).map(n => parseInt(n, 10) || 0);
  const pb = String(b).split(/[.-]/).map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
}

function createUpdater({ app, getWindow, isPackaged }) {
  const current = isPackaged ? app.getVersion() : require('../../package.json').version;
  let state = { state: 'idle', current, version: null, percent: 0, message: '' };
  let au = null;

  function set(patch) {
    state = { ...state, ...patch, current };
    const w = getWindow();
    if (w && !w.isDestroyed()) w.webContents.send('update-status', state);
  }

  function updater() {
    if (au) return au;
    if (!isPackaged) return null;
    au = require('electron-updater').autoUpdater;
    au.autoDownload = false;
    au.autoInstallOnAppQuit = true;
    au.allowPrerelease = false;
    au.on('checking-for-update', () => set({ state: 'checking', message: 'Checking for updates…' }));
    au.on('update-available', (info) => set({ state: 'available', version: info.version, message: `Version ${info.version} is available.` }));
    au.on('update-not-available', () => set({ state: 'none', message: 'You have the newest version.' }));
    au.on('download-progress', (p) => set({ state: 'downloading', percent: Math.round(p.percent || 0), message: `Downloading… ${Math.round(p.percent || 0)}%` }));
    au.on('update-downloaded', (info) => set({ state: 'downloaded', version: info.version, percent: 100, message: `Version ${info.version} is ready to install.` }));
    au.on('error', (err) => set({ state: 'error', message: friendlyError(err) }));
    return au;
  }

  function friendlyError(err) {
    const m = String((err && err.message) || err || '');
    if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|net::|network/i.test(m)) return 'No internet connection. Try again later, or install from a USB drive.';
    if (/404|Not Found|Unable to find latest/i.test(m)) return 'The update server has no release yet, or the release page is private.';
    return 'Could not check for updates: ' + m.slice(0, 200);
  }

  async function check() {
    const u = updater();
    if (!u) { set({ state: 'dev', message: 'Online updates work in the installed app.' }); return state; }
    try { await u.checkForUpdates(); } catch (e) { set({ state: 'error', message: friendlyError(e) }); }
    return state;
  }

  function checkSilently(delayMs) {
    if (!isPackaged) return;
    let tries = 0;
    const attempt = async () => {
      tries++;
      try { await updater().checkForUpdates(); }
      catch (e) {
        if (tries < 5 && /ENOTFOUND|ETIMEDOUT|EAI_AGAIN|ECONNRESET|net::/i.test(String(e && e.message))) setTimeout(attempt, 4000 * 2 ** (tries - 1));
      }
    };
    setTimeout(attempt, delayMs).unref?.();
  }

  async function download() {
    const u = updater();
    if (!u) return state;
    if (state.state !== 'available') await check();
    if (state.state === 'available') {
      set({ state: 'downloading', percent: 0, message: 'Downloading…' });
      try { await u.downloadUpdate(); } catch (e) { set({ state: 'error', message: friendlyError(e) }); }
    }
    return state;
  }

  function install() {
    const u = updater();
    if (!u || state.state !== 'downloaded') return { error: 'No update has been downloaded yet.' };
    setImmediate(() => u.quitAndInstall(false, true));
    return { restarting: true };
  }

  async function installFromFile(win, onPicked) {
    const res = await dialog.showOpenDialog(win, {
      title: 'Choose the VIDA Dental installer (from a USB drive or folder)',
      properties: ['openFile'],
      filters: [{ name: 'VIDA Dental installer', extensions: ['exe'] }]
    });
    if (res.canceled || !res.filePaths[0]) return { canceled: true };
    const file = res.filePaths[0];
    const m = /VIDA-Dental-(Setup|Portable)-(\d+\.\d+\.\d+)\.exe$/i.exec(path.basename(file));
    if (!m) return { error: 'That is not a VIDA Dental installer. Its name should look like VIDA-Dental-Setup-1.2.3.exe.' };
    if (!newer(m[2], current)) return { error: `That installer is version ${m[2]}, which is not newer than this one (${current}).` };
    const confirm = await dialog.showMessageBox(win, {
      type: 'question', buttons: ['Cancel', 'Install and close'], defaultId: 1, cancelId: 0,
      message: `Install VIDA Dental ${m[2]}?`,
      detail: 'The app closes and the installer starts. Your patient data stays on this laptop.'
    });
    if (confirm.response !== 1) return { canceled: true };
    onPicked && onPicked(file);
    spawn(file, [], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => app.quit(), 300);
    return { restarting: true, version: m[2] };
  }

  return { check, checkSilently, download, install, installFromFile, status: () => state };
}

module.exports = { createUpdater, newer };
