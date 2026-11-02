'use strict';
/*
 * Smoke test: runs the real app in Electron with a throw-away data folder,
 * clicks through a whole patient visit like a volunteer would, and saves a
 * screenshot of every screen to .smoke/. Fails on any error in the screens.
 *
 *   npx electron scripts/smoke.js            (Linux: xvfb-run -a npx electron scripts/smoke.js)
 */
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const outDir = path.join(__dirname, '..', '.smoke');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
process.env.VIDA_USER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'vida-smoke-'));

const { app, BrowserWindow } = require('electron');
require('../src/main/main.js');

const errors = [];
const wait = (ms) => new Promise(r => setTimeout(r, ms));

app.on('browser-window-created', (_e, win) => {
  win.webContents.on('console-message', (event) => {
    const level = event.level ?? event;
    const message = event.message ?? arguments[2];
    if (level === 'error' || level === 3) errors.push(String(message));
  });
  win.webContents.on('render-process-gone', (_e2, d) => errors.push('renderer gone: ' + d.reason));
  win.webContents.once('did-finish-load', () => run(win).catch((e) => { console.error(e); errors.push(String(e.stack || e)); finish(1); }));
});

async function run(win) {
  const js = (code) => win.webContents.executeJavaScript(`(async () => { ${code} })()`);
  const shot = async (name) => {
    await wait(450);
    const stray = await win.webContents.executeJavaScript(`document.body.innerText.split('\\n').filter(l => /^(null|undefined|\\[object Object\\])$/.test(l.trim())).length`);
    if (stray) errors.push(`${name}: ${stray} stray "null/undefined" text on screen`);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, name + '.png'), img.toPNG());
    console.log('  screenshot', name);
  };
  // Helpers inside the page.
  await wait(800);
  await js(`
    window.$t = (sel, text) => [...document.querySelectorAll(sel)].find(e => e.textContent.trim().includes(text));
    window.$click = (sel, text) => { const e = text ? $t(sel, text) : document.querySelector(sel); if (!e) throw new Error('not found: ' + sel + ' ' + (text||'')); e.click(); return true; };
    window.$type = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    window.$field = (label) => { const l = [...document.querySelectorAll('label.field')].find(f => f.querySelector('.field-label') && f.querySelector('.field-label').textContent.trim().startsWith(label)); if (!l) throw new Error('field not found: ' + label); return l.querySelector('input, select, textarea'); };
    window.$sleep = (ms) => new Promise(r => setTimeout(r, ms));
  `);
  const go = async (route) => { await js(`location.hash = '#/${route}'`); await wait(700); await js(`
    window.$t = (sel, text) => [...document.querySelectorAll(sel)].find(e => e.textContent.trim().includes(text));
  `); };

  await shot('01-setup');
  await js(`$type($field('Your name'), 'Lucia Admin'); $type($field('Choose a PIN'), '2468'); $type($field('Type the PIN'), '2468'); $click('button', 'Create administrator');`);
  await wait(900);
  await shot('02-dashboard-no-clinic');

  await go('events');
  await js(`$click('button', '+ New clinic'); await $sleep(200);
    $type($field('Clinic name'), 'San Juan La Laguna — Dec 2026'); $type($field('Trip code'), 'GT-2612');
    $type($field('Community'), 'San Juan La Laguna'); $type($field('Country'), 'Guatemala'); $type($field('Target number'), '150');`);
  await shot('03-new-clinic');
  await js(`$click('.modal-actions button', 'Create clinic');`);
  await wait(700);
  await shot('04-events');

  // Add a dentist and a coordinator.
  await go('staff');
  for (const [name, role] of [['Dr. Carlos Méndez', 'dentist'], ['Ana Coordinadora', 'coordinator']]) {
    await js(`$click('button', '+ Add person'); await $sleep(200); $type($field('Full name'), ${JSON.stringify(name)}); $type($field('Role'), '${role}');
      $type($field('PIN (4'), '1357'); $type($field('Type the PIN'), '1357'); $click('.modal-actions button', 'Add');`);
    await wait(500);
  }
  await shot('05-staff');

  // ---- check-in ----
  await go('checkin');
  await shot('06-checkin-start');
  await js(`$click('button', '+ New patient');`);
  await wait(300);
  await js(`
    $type($field('Nombre'), 'María'); $type($field('Apellido'), 'Xocop Tzoc'); $type($field('Fecha de nacimiento'), '12/05/1984');
    $click('.seg-btn', 'Femenino'); $type($field('Teléfono'), '5512-3344'); $type($field('Dirección'), 'Cantón Pachichaj, casa 12');
    $type($field('Municipio'), 'San Juan La Laguna'); $type($field('Departamento'), 'Sololá');`);
  await shot('07-registration');
  await js(`$click('button', 'Next: medical history');`);
  await wait(500);
  await js(`
    for (const b of document.querySelectorAll('.yesno-btn[data-v="no"]')) b.click();
    const q = (text) => [...document.querySelectorAll('.q')].find(e => e.textContent.includes(text));
    q('presión arterial alta').querySelector('[data-v="yes"]').click();
    q('penicilina').querySelector('[data-v="yes"]').click();
    q('Toma algún medicamento').querySelector('[data-v="yes"]').click();
    q('dolor de muelas').querySelector('[data-v="yes"]').click();
    await $sleep(100);
    $click('.chip', 'Enalapril');
    document.querySelector('textarea').value = ''; $type(document.querySelectorAll('textarea')[0], 'Dolor de muela abajo a la izquierda');`);
  await shot('08-medical');
  await js(`$click('button', 'Next: consent');`);
  await wait(500);
  await js(`for (const c of document.querySelectorAll('.consent-checks input')) c.click(); $click('button', 'Crear firma');`);
  await shot('09-consent');
  await js(`$click('button', 'Sign and check in');`);
  await wait(900);
  await shot('10-checkin-done');

  // A second patient: a child, signed by a parent, drawn signature via API helpers
  await js(`$click('button', 'Check in the next patient'); await $sleep(300); $click('button', '+ New patient'); await $sleep(200);
    $type($field('Nombre'), 'José'); $type($field('Apellido'), 'Xocop'); $type($field('Fecha de nacimiento'), '03/02/2017');
    $click('.seg-btn', 'Masculino'); document.querySelector('.check input').click(); $type($field('Dirección'), 'Cantón Pachichaj, casa 12');
    $type($field('Municipio'), 'San Juan La Laguna'); $type($field('Departamento'), 'Sololá');
    $click('button', 'Next: medical history'); await $sleep(400);
    for (const b of document.querySelectorAll('.yesno-btn[data-v="no"]')) b.click();
    $click('button', 'Next: consent'); await $sleep(400);
    for (const c of document.querySelectorAll('.consent-checks input')) c.click();
    $type($field('Nombre de la madre'), 'María Xocop Tzoc'); $type($field('Relación'), 'mother');
    // draw a line on the pad
    const cv = document.querySelector('.sig-canvas'); const r = cv.getBoundingClientRect();
    const ev = (type, x, y) => cv.dispatchEvent(new PointerEvent(type, { clientX: r.left + x, clientY: r.top + y, pointerId: 1, bubbles: true }));
    ev('pointerdown', 30, 100); for (let i = 0; i < 30; i++) ev('pointermove', 30 + i * 8, 100 - Math.sin(i / 3) * 30); ev('pointerup', 270, 100);`);
  await shot('11-consent-minor');
  await js(`$click('button', 'Sign and check in');`);
  await wait(800);

  // ---- triage ----
  await go('triage');
  await js(`$click('.q-item', 'María');`);
  await wait(700);
  await js(`
    const vi = document.querySelectorAll('.vital-input'); $type(vi[0], '165'); $type(vi[1], '98'); $type(vi[2], '82');
    $click('.mark-btn', 'Needs extraction'); $click('.tooth', '36');
    $click('.mark-btn', 'Needs filling'); $click('.tooth', '46');
    $click('.mark-btn', 'Caries'); $click('.tooth', '46');
    $click('.check', 'Cleaning (prophy)'); $click('.check', 'Restorative');`);
  await shot('12-triage');
  await js(`$click('button', 'Save and send on');`);
  await wait(700);
  await js(`$click('.q-item', 'José'); await $sleep(600); $click('.check', 'Cleaning (prophy)'); $click('.check', 'Skip the education'); $click('button', 'Save and send on');`);
  await wait(700);

  // ---- education ----
  await go('education');
  await js(`$click('.q-item', 'María');`);
  await wait(600);
  await shot('13-education');
  await js(`$click('button', 'Done — send to treatment');`);
  await wait(600);

  // ---- treatment ----
  await go('treatment');
  await js(`$click('.q-item', 'María');`);
  await wait(700);
  await js(`$click('button', '+ Add anesthetic');`);
  await wait(200);
  await shot('14-treatment-restorative');
  await js(`$click('button', 'Mark treatment done');`);
  await wait(800);
  await js(`$click('.seg-btn', 'Cleaning'); await $sleep(700); $click('.q-item', 'María'); await $sleep(700);`);
  await shot('15-treatment-cleaning');
  await js(`$click('button', 'Mark cleaning done'); await $sleep(400); const ok = $t('.modal-actions button', 'Mark done'); if (ok) ok.click();`);
  await wait(800);

  // ---- checkout ----
  await go('checkout');
  await js(`$click('.q-item', 'María');`);
  await wait(700);
  await js(`const s = document.querySelector('.rx-name') ; const sel = [...document.querySelectorAll('select')].find(x => x.textContent.includes('Add from the pharmacy'));
    $type(sel, 'amox500'); await $sleep(500);`);
  await shot('16-checkout-allergy-block');
  await js(`document.querySelector('.rx .icon-btn').click(); await $sleep(200);
    const sel = [...document.querySelectorAll('select')].find(x => x.textContent.includes('Add from the pharmacy')); $type(sel, 'acet500'); await $sleep(300);
    $click('.check', 'Needs follow-up'); $type($field('Why'), 'Revisar relleno en 46 el próximo viaje');
    $click('.rate', 'Muy buena'); const ta = [...document.querySelectorAll('.card-patient textarea')][0]; $type(ta, 'La paciencia del dentista');`);
  await shot('17-checkout');
  await js(`$click('button', 'Check out');`);
  await wait(800);

  await go('dashboard');
  await shot('18-dashboard');
  await go('patients');
  await js(`$type(document.querySelector('input[type=search]'), 'xocop maria'); await $sleep(500); $click('.result-btn', 'María');`);
  await wait(800);
  await js(`document.querySelector('.visit-card').open = true;`);
  await shot('19-patient-record');
  await go('settings');
  await shot('20-settings');
  await go('audit');
  await shot('21-audit');
  await go('updates');
  await shot('22-updates');

  // sign out and see the PIN screen
  await js(`$click('.link-btn', 'Sign out');`);
  await wait(700);
  await js(`$click('.person', 'Carlos');`);
  await wait(300);
  await shot('23-pin');
  await js(`for (const k of '1357') $click('.pin-key', k); $click('.pin-key', 'Sign in');`);
  await wait(900);
  await shot('24-dentist-home');

  finish(errors.length ? 1 : 0);
}

function finish(code) {
  if (errors.length) { console.error('\nErrors in the screens:'); for (const e of errors) console.error(' -', e); }
  else console.log('\nSmoke test passed: no errors in the screens.');
  setTimeout(() => app.exit(code), 200);
}
