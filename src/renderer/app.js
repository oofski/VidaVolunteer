// VIDA Dental — app shell: first-run setup, PIN sign-in, header, icon rail,
// router, and the first-login registration walkthrough.
import { h, mount, call, attempt, toast, setSignedOutHandler, modal, field, input } from './lib.js';
import { icon } from './icons.js';
import * as screens from './screens/index.js';

const root = document.getElementById('app');
export const app = {
  info: null,
  user: null,
  settings: null,
  update: null,
  timers: new Set(),
  go(route) { location.hash = '#/' + route; },
  // Screens register their refresh timers here so they stop when you leave.
  every(ms, fn) { const t = setInterval(fn, ms); this.timers.add(t); return t; },
  stopTimers() { for (const t of this.timers) clearInterval(t); this.timers.clear(); },
  async refreshInfo() { this.info = await call('app:info'); renderStatus(); return this.info; },
  async refreshSettings() { this.settings = await call('settings:get'); return this.settings; },
  async trainingDone(name) { const tours = await attempt(() => call('training:done', { name })); if (tours) this.user.tours = tours; },
  startRegistrationTraining() { if (location.hash === '#/register/practice') route(); else location.hash = '#/register/practice'; }
};
window.__vida = app; // handy for the automated smoke test

const NAV = [
  { group: 'Clinic' },
  { route: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { route: 'register', label: 'Registration', icon: 'register' },
  { route: 'triage', label: 'Triage', icon: 'triage' },
  { route: 'education', label: 'Education', icon: 'education' },
  { route: 'treatment', label: 'Treatment', icon: 'treatment' },
  { route: 'checkout', label: 'Checkout', icon: 'checkout' },
  { route: 'patients', label: 'Patients', icon: 'patients' },
  { group: 'Admin', admin: true },
  { route: 'events', label: 'Clinic events', icon: 'events', admin: true },
  { route: 'staff', label: 'Staff', icon: 'staff', admin: true },
  { route: 'settings', label: 'Settings & backup', icon: 'settings', admin: true },
  { route: 'audit', label: 'Audit log', icon: 'audit', admin: true }
];
const HOME = { admin: 'dashboard', dentist: 'triage', assistant: 'treatment', coordinator: 'register' };

setSignedOutHandler(() => { app.user = null; toast('Please sign in again.', 'error'); boot(); });
window.api.onUpdateStatus((s) => { app.update = s; renderStatus(); document.dispatchEvent(new CustomEvent('vida:update', { detail: s })); });

function prefs(key, value) {
  try {
    if (value === undefined) return localStorage.getItem('vida.' + key);
    localStorage.setItem('vida.' + key, value);
  } catch { /* storage unavailable: use defaults */ }
  return null;
}

async function boot() {
  app.stopTimers();
  app.info = await call('app:info');
  app.update = await call('update:status').catch(() => null);
  if (!app.info.setup) return mount(root, screens.setup(app, boot));
  app.user = await call('auth:me');
  if (!app.user) return mount(root, screens.login(app, boot));
  await app.refreshSettings();
  renderShell();
  if (!location.hash || location.hash === '#/' || location.hash === '#/login') app.go(HOME[app.user.role] || 'dashboard');
  else route();
  if (!(app.user.tours || []).includes('registration')) setTimeout(welcome, 400);
}

// ---- shell -------------------------------------------------------------------
let statusEl = null;
let contentEl = null;
let shellEl = null;

function renderShell() {
  const isAdmin = app.user.role === 'admin';
  statusEl = h('div', { class: 'tb-right', style: { display: 'flex', marginLeft: 'auto' } });
  contentEl = h('main', { class: 'content', id: 'content', tabindex: '-1' });
  const railOpen = prefs('rail') === 'open';
  const toggle = h('button', { class: 'tb-btn tb-icon', 'aria-label': 'Show or hide menu labels', title: 'Menu', onclick: () => {
    const open = !shellEl.classList.contains('rail-open');
    shellEl.classList.toggle('rail-open', open);
    prefs('rail', open ? 'open' : 'closed');
  } }, icon('menu', 20));
  const rail = h('nav', { class: 'rail', 'aria-label': 'Main' }, NAV.filter(n => !n.admin || isAdmin).map(n => n.group
    ? h('div', { class: 'rail-group' }, n.group)
    : h('a', { href: '#/' + n.route, class: 'rail-link', dataset: { route: n.route }, 'aria-label': n.label },
      icon(n.icon, 18), h('span', { class: 'rail-label' }, n.label))));
  shellEl = h('div', { class: 'shell' + (railOpen ? ' rail-open' : '') },
    h('header', { class: 'topbar' },
      toggle,
      h('a', { class: 'tb-brand', href: '#/dashboard', style: { textDecoration: 'none', color: 'inherit' } }, h('b', null, 'VIDA'), h('span', null, 'Dental')),
      h('div', { class: 'tb-divider' }),
      statusEl),
    rail,
    contentEl);
  // Positions the hover labels next to their icon when the rail is closed.
  rail.addEventListener('mouseover', (e) => {
    const link = e.target.closest('.rail-link');
    if (!link || shellEl.classList.contains('rail-open')) return;
    const label = link.querySelector('.rail-label');
    label.style.top = (link.getBoundingClientRect().top + 10) + 'px';
  });
  mount(root, shellEl);
  renderStatus();
}

function renderStatus() {
  if (!statusEl || !app.info || !app.user) return;
  const ev = app.info.active_event;
  const u = app.update;
  const hasUpdate = u && (u.state === 'available' || u.state === 'downloaded');
  const userBtn = h('button', { class: 'tb-btn tb-user', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: (e) => userMenu(e.currentTarget) },
    h('span', { class: 'tb-avatar' }, initials(app.user.name)), h('span', { class: 'tb-user-name' }, app.user.name), icon('chevronDown', 12));
  mount(statusEl,
    h('a', { class: 'tb-clinic', href: app.user.role === 'admin' ? '#/events' : '#/dashboard', style: { textDecoration: 'none', marginRight: 'auto' }, title: ev ? 'Clinic running' : 'No clinic running' },
      h('span', { class: 'dot' + (ev ? '' : ' off') }), ev ? h('b', null, ev.name) : h('span', null, 'No clinic running')),
    h('div', { class: 'tb-status', title: 'Everything is saved on this laptop. No internet needed.' }, icon('offline', 16), h('span', null, 'OFFLINE · LOCAL DATA')),
    h('button', { class: 'tb-btn tb-icon', title: 'Registration walkthrough', 'aria-label': 'Registration walkthrough', onclick: () => app.startRegistrationTraining() }, icon('help', 20)),
    h('a', { class: 'tb-btn tb-version' + (hasUpdate ? ' has-update' : ''), href: '#/updates', title: 'Software updates' },
      hasUpdate ? [icon('update', 16), `Update ${u.version}`] : `v${app.info.version}`),
    userBtn);
}

function userMenu(btn) {
  const existing = document.querySelector('.menu');
  if (existing) { existing.remove(); btn.setAttribute('aria-expanded', 'false'); return; }
  btn.setAttribute('aria-expanded', 'true');
  const close = () => { menu.remove(); btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('mousedown', outside); };
  const outside = (e) => { if (!menu.contains(e.target) && !btn.contains(e.target)) close(); };
  const item = (ic, label, fn) => h('button', { role: 'menuitem', onclick: () => { close(); fn(); } }, icon(ic, 16), label);
  const menu = h('div', { class: 'menu', role: 'menu' },
    h('div', { class: 'menu-head' }, h('div', null, app.user.name), h('div', { class: 'small' }, app.user.role_label)),
    item('help', 'Registration walkthrough', () => app.startRegistrationTraining()),
    item('locked', 'Change my PIN', changeOwnPin),
    item('logout', 'Sign out', signOut));
  btn.closest('.topbar').appendChild(menu);
  setTimeout(() => document.addEventListener('mousedown', outside), 0);
}

function initials(name) {
  return String(name).split(/\s+/).filter(w => /[A-Za-zÀ-ÿ]/.test(w[0] || '')).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

// ---- first sign-in: offer the registration walkthrough --------------------------
function welcome() {
  if (!app.user || document.querySelector('.modal-backdrop') || location.hash.startsWith('#/register/practice')) return;
  modal({
    title: `Welcome, ${app.user.name.split(' ')[0]}`,
    body: h('div', { class: 'stack' },
      h('p', null, 'Before your first clinic, take the registration walkthrough. It shows you, step by step, where to click to register a patient: language, search for returning patients, details, medical history, consent and signature.'),
      h('div', { class: 'notice notice-info' }, icon('info', 20), h('div', null, h('b', null, 'Practice only. '), 'You fill in an example patient. Nothing is saved, and you can replay it any time from the ', h('b', null, '?'), ' button at the top.')),
      h('p', { class: 'muted small' }, 'About 2 minutes.')),
    actions: [
      { label: 'Not now', onclick: () => app.trainingDone('registration') },
      { label: 'Start walkthrough', kind: 'primary', onclick: () => app.startRegistrationTraining() }
    ]
  });
}

async function signOut() {
  await call('auth:logout');
  app.user = null;
  location.hash = '';
  boot();
}

function changeOwnPin() {
  const a = input({ type: 'password', inputmode: 'numeric', maxlength: 6, autocomplete: 'off' });
  const b = input({ type: 'password', inputmode: 'numeric', maxlength: 6, autocomplete: 'off' });
  modal({
    title: 'Change my PIN',
    body: h('div', { class: 'stack' }, field('New PIN (4–6 digits)', a), field('Type it again', b)),
    actions: [{ label: 'Cancel' }, { label: 'Save PIN', kind: 'primary', onclick: async () => {
      if (a.value !== b.value) { toast('The two PINs do not match.', 'error'); return true; }
      const r = await attempt(() => call('auth:changeOwnPin', { pin: a.value }), 'Your PIN was changed.');
      return r ? undefined : true;
    } }]
  });
}

// ---- router -----------------------------------------------------------------------
const ROUTES = {
  dashboard: screens.dashboard, register: screens.checkin, checkin: screens.checkin, triage: screens.triage,
  education: screens.education, treatment: screens.treatment, checkout: screens.checkout, patients: screens.patients,
  events: screens.events, staff: screens.staff, settings: screens.settings, audit: screens.audit, updates: screens.updates
};
const ADMIN_ROUTES = new Set(['events', 'staff', 'settings', 'audit']);

async function route() {
  if (!app.user || !contentEl) return;
  app.stopTimers();
  document.dispatchEvent(new CustomEvent('vida:route'));
  let [name, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  if (name === 'checkin') name = 'register';
  const r = ROUTES[name] ? name : 'dashboard';
  if (ADMIN_ROUTES.has(r) && app.user.role !== 'admin') {
    toast('Only an administrator can open that screen.', 'error');
    return app.go('dashboard');
  }
  for (const a of document.querySelectorAll('.rail-link')) a.classList.toggle('active', a.dataset.route === r);
  try { await app.refreshInfo(); } catch { /* keep going */ }
  contentEl.replaceChildren();
  contentEl.scrollTop = 0;
  try {
    await ROUTES[r](app, contentEl, rest);
  } catch (e) {
    console.error(e);
    mount(contentEl, h('div', { class: 'card' }, h('h2', null, 'This screen could not open'), h('p', null, e.message || String(e))));
  }
}

window.addEventListener('hashchange', route);
boot().catch((e) => { mount(root, h('div', { class: 'boot-error' }, h('h1', null, 'VIDA Dental could not start'), h('p', null, e.message || String(e)))); });
