// VIDA Dental — app shell: first-run setup, PIN sign-in, sidebar and router.
import { h, mount, call, attempt, toast, setSignedOutHandler, modal, field, input } from './lib.js';
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
  async refreshInfo() { this.info = await call('app:info'); renderSidebarStatus(); return this.info; },
  async refreshSettings() { this.settings = await call('settings:get'); return this.settings; }
};
window.__vida = app; // handy for the automated smoke test

const NAV = [
  { group: 'Clinic' },
  { route: 'dashboard', label: 'Dashboard', icon: '▦' },
  { route: 'checkin', label: 'Check-in', icon: '＋' },
  { route: 'triage', label: 'Triage', icon: '⚕' },
  { route: 'education', label: 'Education', icon: '★' },
  { route: 'treatment', label: 'Treatment', icon: '✦' },
  { route: 'checkout', label: 'Checkout', icon: '✓' },
  { route: 'patients', label: 'Patients', icon: '☰' },
  { group: 'Admin', admin: true },
  { route: 'events', label: 'Clinic events', icon: '⚑', admin: true },
  { route: 'staff', label: 'Staff', icon: '☺', admin: true },
  { route: 'settings', label: 'Settings & backup', icon: '⚙', admin: true },
  { route: 'audit', label: 'Audit log', icon: '≡', admin: true }
];
const HOME = { admin: 'dashboard', dentist: 'triage', assistant: 'treatment', coordinator: 'checkin' };

setSignedOutHandler(() => { app.user = null; toast('Please sign in again.', 'error'); boot(); });

window.api.onUpdateStatus((s) => { app.update = s; renderSidebarStatus(); document.dispatchEvent(new CustomEvent('vida:update', { detail: s })); });

async function boot() {
  stopTimers();
  app.info = await call('app:info');
  app.update = await call('update:status').catch(() => null);
  if (!app.info.setup) return mount(root, screens.setup(app, boot));
  app.user = await call('auth:me');
  if (!app.user) return mount(root, screens.login(app, boot));
  await app.refreshSettings();
  renderShell();
  if (!location.hash || location.hash === '#/' || location.hash === '#/login') app.go(HOME[app.user.role] || 'dashboard');
  else route();
}

function stopTimers() { for (const t of app.timers) clearInterval(t); app.timers.clear(); }

let sidebarStatus = null;
let contentEl = null;
function renderShell() {
  const isAdmin = app.user.role === 'admin';
  sidebarStatus = h('div', { class: 'side-status' });
  contentEl = h('main', { class: 'content', id: 'content', tabindex: '-1' });
  const nav = h('nav', { class: 'nav' }, NAV.filter(n => !n.admin || isAdmin).map(n => n.group
    ? h('div', { class: 'nav-group' }, n.group)
    : h('a', { href: '#/' + n.route, class: 'nav-link', dataset: { route: n.route } }, h('span', { class: 'nav-icon', 'aria-hidden': 'true' }, n.icon), n.label)));
  mount(root, h('div', { class: 'shell' },
    h('aside', { class: 'sidebar' },
      h('div', { class: 'brand' }, h('div', { class: 'brand-mark' }, 'VIDA'), h('div', { class: 'brand-sub' }, 'Dental')),
      nav,
      h('div', { class: 'grow' }),
      sidebarStatus,
      h('div', { class: 'side-user' },
        h('div', { class: 'side-user-name' }, app.user.name),
        h('div', { class: 'side-user-role' }, app.user.role_label),
        h('div', { class: 'side-user-actions' },
          h('button', { class: 'link-btn', onclick: changeOwnPin }, 'Change my PIN'),
          h('button', { class: 'link-btn', onclick: signOut }, 'Sign out')))
    ),
    contentEl));
  renderSidebarStatus();
}

function renderSidebarStatus() {
  if (!sidebarStatus || !app.info) return;
  const ev = app.info.active_event;
  const u = app.update;
  const updateLabel = u && (u.state === 'available' || u.state === 'downloaded') ? `⬆ Update available (${u.version})` : `Version ${app.info.version}`;
  mount(sidebarStatus,
    h('div', { class: 'side-event' + (ev ? '' : ' none') },
      h('div', { class: 'side-event-label' }, ev ? 'Clinic running' : 'No clinic running'),
      ev ? h('div', { class: 'side-event-name' }, ev.name) : null),
    h('div', { class: 'side-offline' }, h('span', { class: 'dot' }), 'Works offline · data on this laptop'),
    h('a', { href: '#/updates', class: 'side-version' + (u && (u.state === 'available' || u.state === 'downloaded') ? ' has-update' : '') }, updateLabel));
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

const ROUTES = {
  dashboard: screens.dashboard, checkin: screens.checkin, triage: screens.triage, education: screens.education,
  treatment: screens.treatment, checkout: screens.checkout, patients: screens.patients,
  events: screens.events, staff: screens.staff, settings: screens.settings, audit: screens.audit, updates: screens.updates
};
const ADMIN_ROUTES = new Set(['events', 'staff', 'settings', 'audit']);

async function route() {
  if (!app.user || !contentEl) return;
  stopTimers();
  const [name, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  const r = ROUTES[name] ? name : 'dashboard';
  if (ADMIN_ROUTES.has(r) && app.user.role !== 'admin') {
    toast('Only an administrator can open that screen.', 'error');
    return app.go('dashboard');
  }
  for (const a of document.querySelectorAll('.nav-link')) a.classList.toggle('active', a.dataset.route === r);
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
