'use strict';
// Draws the app icon (build/icon.png, 512×512) with Electron. Run:
//   xvfb-run -a npx electron scripts/make-icon.js
const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow } = require('electron');
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F7941D"/><stop offset="1" stop-color="#C96A0A"/></linearGradient></defs>
  <rect x="16" y="16" width="480" height="480" rx="108" fill="url(#g)"/>
  <path d="M256 118c-28-22-62-30-94-20-44 13-66 58-60 108 5 40 22 70 30 108 8 40 12 92 44 92 30 0 30-58 46-86 10-18 24-26 34-26s24 8 34 26c16 28 16 86 46 86 32 0 36-52 44-92 8-38 25-68 30-108 6-50-16-95-60-108-32-10-66-2-94 20z" fill="#fff"/>
  <path d="M206 190 L256 300 L306 190" fill="none" stroke="#F7941D" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 512, height: 512, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html,' + encodeURIComponent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`));
  await new Promise(r => setTimeout(r, 500));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  const out = path.join(__dirname, '..', 'build', 'icon.png');
  fs.writeFileSync(out, img.resize({ width: 512, height: 512 }).toPNG());
  console.log('wrote', out);
  app.exit(0);
});
