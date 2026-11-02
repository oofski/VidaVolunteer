'use strict';
/*
 * VIDA Dental — the one list of actions the screens may call.
 *
 * Each action names who may run it:
 *   public — nobody needs to be signed in (first-run setup, sign-in)
 *   staff  — anyone signed in (VIDA does not restrict clinic screens by role)
 *   admin  — administrators only
 * The check runs here, in the main process, before any data is touched.
 * Electron IPC wraps this today; a local tablet server can wrap the same list.
 */
const { UserError } = require('./db.js');

function createApi(store, services = {}) {
  const A = {
    // ---- public
    'app:info': ['public', () => ({
      version: services.version || '0.0.0',
      setup: store.isSetup(),
      organization: store.getSetting('organization'),
      active_event: store.activeEvent()
    })],
    'setup:firstAdmin': ['public', (s, a) => { const u = store.createFirstAdmin(a.name, a.pin); s.user = u; return u; }],
    'auth:list': ['public', () => store.loginList().map(u => ({ id: u.id, name: u.name, role_label: u.role_label }))],
    'auth:login': ['public', (s, a) => { const u = store.login(a.id, a.pin); s.user = u; return u; }],
    'auth:logout': ['public', (s) => { if (s.user) store.audit(s.user, 'auth.logout', 'staff', s.user.id, null); s.user = null; return true; }],
    'auth:me': ['public', (s) => s.user || null],

    // ---- staff (any signed-in person)
    'auth:changeOwnPin': ['staff', (s, a) => store.setStaffPin(s.user, s.user.id, a.pin)],
    'settings:get': ['staff', () => store.publicSettings()],
    'events:list': ['staff', () => store.listEvents()],
    'events:active': ['staff', () => store.activeEvent()],
    'dashboard:get': ['staff', () => store.dashboard()],
    'queue:get': ['staff', (s, a) => store.queue(a && a.event_id, { today: !(a && a.all_days) })],
    'patients:search': ['staff', (s, a) => store.searchPatients(a && a.text)],
    'patients:matches': ['staff', (s, a) => store.findMatches(a && a.registration)],
    'patients:get': ['staff', (s, a) => store.getPatient(s.user, a.id)],
    'visits:checkIn': ['staff', (s, a) => store.checkIn(s.user, a)],
    'visits:get': ['staff', (s, a) => store.getVisit(s.user, a.id, { silent: !!a.silent })],
    'visits:updateMedical': ['staff', (s, a) => store.updateMedical(s.user, a.id, a.medical)],
    'visits:signConsent': ['staff', (s, a) => store.signConsent(s.user, a.id, a.consent)],
    'visits:triage': ['staff', (s, a) => store.saveTriage(s.user, a.id, a.triage)],
    'visits:education': ['staff', (s, a) => store.saveEducation(s.user, a.id, a.education)],
    'visits:treatment': ['staff', (s, a) => store.saveTreatment(s.user, a.id, a.station, a.data, !!a.complete)],
    'visits:prescriptionCheck': ['staff', (s, a) => store.prescriptionCheck(a.id, a.items)],
    'visits:checkout': ['staff', (s, a) => store.checkout(s.user, a.id, a.checkout)],
    'visits:left': ['staff', (s, a) => store.markLeft(s.user, a.id, a.reason)],

    // ---- admin only
    'staff:list': ['admin', () => store.listStaff()],
    'staff:add': ['admin', (s, a) => store.addStaff(s.user, a)],
    'staff:update': ['admin', (s, a) => store.updateStaff(s.user, a)],
    'staff:setActive': ['admin', (s, a) => store.setStaffActive(s.user, a.id, !!a.active)],
    'staff:setPin': ['admin', (s, a) => store.setStaffPin(s.user, a.id, a.pin)],
    'events:create': ['admin', (s, a) => store.createEvent(s.user, a)],
    'events:update': ['admin', (s, a) => store.updateEvent(s.user, a)],
    'events:setActive': ['admin', (s, a) => store.setActiveEvent(s.user, a.id)],
    'events:finish': ['admin', (s, a) => store.finishEvent(s.user, a.id)],
    'events:reopen': ['admin', (s, a) => store.reopenEvent(s.user, a.id)],
    'events:delete': ['admin', (s, a) => store.deleteEvent(s.user, a.id)],
    'patients:update': ['admin', (s, a) => store.updatePatient(s.user, a.id, a.registration)],
    'visits:reopen': ['admin', (s, a) => store.reopenVisit(s.user, a.id)],
    'visits:move': ['admin', (s, a) => store.moveVisit(s.user, a.id, a.status)],
    'settings:update': ['admin', (s, a) => store.updateSettings(s.user, a)],
    'audit:list': ['admin', (s, a) => store.listAudit(a && a.limit)],

    // ---- desktop services (filled in by main.js)
    'backup:create': ['admin', (s, a) => services.backup(s, a)],
    'backup:restore': ['admin', (s, a) => services.restore(s, a)],
    'update:check': ['staff', (s) => services.updateCheck(s)],
    'update:download': ['staff', (s) => services.updateDownload(s)],
    'update:install': ['admin', (s) => services.updateInstall(s)],
    'update:installFromFile': ['admin', (s) => services.updateInstallFromFile(s)],
    'update:status': ['public', () => services.updateStatus()],
    'app:devtools': ['admin', (s) => services.devtools(s)]
  };

  async function call(session, channel, args) {
    const entry = Object.prototype.hasOwnProperty.call(A, channel) ? A[channel] : null;
    if (!entry) return { ok: false, error: 'Unknown action.' };
    const [level, fn] = entry;
    if (level !== 'public') {
      // Re-read the account so a disabled or demoted person loses access at once.
      const fresh = session.user ? store.getStaff(session.user.id) : null;
      if (!fresh) { session.user = null; return { ok: false, error: 'Please sign in again.', signedOut: true }; }
      session.user = fresh;
      if (level === 'admin' && fresh.role !== 'admin') {
        return { ok: false, error: 'Only an administrator can do this.' };
      }
    }
    try {
      const data = await fn(session, args || {});
      return { ok: true, data };
    } catch (e) {
      if (e && e.userError) return { ok: false, error: e.message };
      console.error('[api]', channel, e);
      return { ok: false, error: 'Something went wrong: ' + (e && e.message ? e.message : String(e)) };
    }
  }

  return { call, channels: Object.keys(A), levels: Object.fromEntries(Object.entries(A).map(([k, v]) => [k, v[0]])) };
}

module.exports = { createApi, UserError };
