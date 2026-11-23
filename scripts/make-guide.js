'use strict';
/*
 * Builds the quick guide PDF (docs/VIDA-Dental-Quick-Guide.pdf) from
 * docs/guide/guide.html and the smoke-test screenshots.
 *
 *   npm run smoke            (makes fresh screenshots in .smoke/)
 *   npx electron scripts/make-guide.js
 */
const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, nativeImage } = require('electron');

const root = path.join(__dirname, '..');
const shots = path.join(root, '.smoke');
const imgDir = path.join(root, 'docs', 'guide', 'img');
const out = path.join(root, 'docs', 'VIDA-Dental-Quick-Guide.pdf');

app.whenReady().then(async () => {
  // Screenshots → compact JPEGs for the guide.
  if (fs.existsSync(shots)) {
    fs.mkdirSync(imgDir, { recursive: true });
    for (const f of fs.readdirSync(shots).filter(n => n.endsWith('.png'))) {
      const img = nativeImage.createFromPath(path.join(shots, f));
      fs.writeFileSync(path.join(imgDir, f.replace(/\.png$/, '.jpg')), img.toJPEG(82));
    }
  }
  const html = path.join(root, 'docs', 'guide', 'guide.html');
  const missing = [...fs.readFileSync(html, 'utf8').matchAll(/src="img\/([^"]+)"/g)].map(m => m[1]).filter(n => !fs.existsSync(path.join(imgDir, n)));
  if (missing.length) { console.error('Missing screenshots:', missing.join(', ')); app.exit(1); return; }

  const win = new BrowserWindow({ show: false, width: 816, height: 1056 });
  await win.loadFile(html);
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => Promise.all([...document.images].map(i => i.decode())))');
  const pdf = await win.webContents.printToPDF({ pageSize: 'Letter', printBackground: true, margins: { marginType: 'none' }, preferCSSPageSize: true });
  fs.writeFileSync(out, pdf);
  console.log(`wrote ${out} (${(pdf.length / 1e6).toFixed(1)} MB)`);
  app.exit(0);
});
