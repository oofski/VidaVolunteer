'use strict';
/*
 * VIDA Dental — local database and clinic rules.
 *
 * One SQLite file per laptop (node:sqlite, built into Electron — no native
 * modules to compile). Every rule that matters (consent before care, guardian
 * signatures for minors, allergy blocks on prescriptions, admin-only actions)
 * is enforced here, not only on screen.
 */
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const F = require('../shared/forms.js');

class UserError extends Error {
  constructor(message) { super(message); this.userError = true; }
}

const ROLES = {
  admin: 'Administrator',
  dentist: 'Dentist',
  assistant: 'Dental assistant',
  coordinator: 'Community coordinator'
};

const STATUSES = {
  waiting_triage: 'Waiting for triage',
  waiting_education: 'Education',
  waiting_treatment: 'Waiting for treatment',
  in_treatment: 'In treatment',
  ready_checkout: 'Ready for checkout',
  checked_out: 'Checked out',
  left: 'Left without care'
};
const OPEN_STATUSES = ['waiting_triage', 'waiting_education', 'waiting_treatment', 'in_treatment', 'ready_checkout'];

const SCHEMA_VERSION = 1;

function nowIso() { return new Date().toISOString(); }
function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function uid() { return crypto.randomUUID(); }
function j(v) { return JSON.stringify(v == null ? null : v); }
function pj(v, fallback) {
  if (v == null || v === '') return fallback;
  try { const x = JSON.parse(v); return x == null ? fallback : x; } catch { return fallback; }
}
const clean = F.clean;

function hashPin(pin, salt) {
  return crypto.scryptSync(String(pin), Buffer.from(salt, 'hex'), 64).toString('hex');
}
function checkPinFormat(pin) {
  if (!/^\d{4,6}$/.test(String(pin || ''))) throw new UserError('A PIN is 4 to 6 digits.');
}

function openStore(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  migrate(db);
  return createStore(db, file);
}

function migrate(db) {
  const v = db.prepare('PRAGMA user_version').get().user_version;
  if (v >= SCHEMA_VERSION) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY, uid TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL,
      pin_salt TEXT NOT NULL, pin_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY, uid TEXT UNIQUE NOT NULL, name TEXT NOT NULL, trip_code TEXT,
      country TEXT, community TEXT, start_date TEXT, end_date TEXT, season TEXT, year INTEGER,
      target_patients INTEGER, status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY, uid TEXT UNIQUE NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
      dob TEXT, sex TEXT, phone TEXT, no_phone INTEGER DEFAULT 0, address TEXT, community TEXT,
      municipality TEXT, region TEXT, country TEXT, language TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS patients_name ON patients(last_name, first_name);
    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY, uid TEXT UNIQUE NOT NULL,
      patient_id INTEGER NOT NULL REFERENCES patients(id),
      event_id INTEGER NOT NULL REFERENCES events(id),
      queue_number INTEGER NOT NULL, visit_date TEXT NOT NULL, status TEXT NOT NULL,
      language TEXT, medical TEXT, flags TEXT, triage TEXT, chart TEXT,
      route_cleaning INTEGER DEFAULT 0, route_restorative INTEGER DEFAULT 0,
      cleaning_done INTEGER DEFAULT 0, restorative_done INTEGER DEFAULT 0,
      education TEXT, treatment TEXT, checkout TEXT, survey TEXT,
      checked_in_by TEXT, triaged_by TEXT, educated_by TEXT, checked_out_by TEXT,
      checked_in_at TEXT, triaged_at TEXT, educated_at TEXT, treatment_started_at TEXT,
      treatment_done_at TEXT, checked_out_at TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS visits_event ON visits(event_id, status);
    CREATE INDEX IF NOT EXISTS visits_patient ON visits(patient_id);
    CREATE TABLE IF NOT EXISTS consents (
      id INTEGER PRIMARY KEY, uid TEXT UNIQUE NOT NULL,
      visit_id INTEGER NOT NULL REFERENCES visits(id),
      type TEXT NOT NULL, includes_surgery INTEGER NOT NULL DEFAULT 1,
      signer_name TEXT NOT NULL, relationship TEXT, signature TEXT NOT NULL, signature_method TEXT,
      language TEXT, version TEXT, read_aloud INTEGER DEFAULT 0, read_aloud_by TEXT,
      signed_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS consents_visit ON consents(visit_id);
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY, at TEXT NOT NULL, user_id INTEGER, user_name TEXT,
      action TEXT NOT NULL, entity TEXT, entity_id INTEGER, detail TEXT);
  `);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

function createStore(db, file) {
  const q = (sql) => db.prepare(sql);

  function tx(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const r = fn(); db.exec('COMMIT'); return r; }
    catch (e) { try { db.exec('ROLLBACK'); } catch { /* already rolled back */ } throw e; }
  }

  // ---- settings ---------------------------------------------------------
  const DEFAULT_SETTINGS = {
    tooth_numbering: 'fdi',
    medications: F.DEFAULT_MEDICATIONS,
    pharmacy: F.DEFAULT_PHARMACY,
    active_event_id: null,
    organization: 'VIDA (Vida Volunteer)'
  };
  function getSetting(key) {
    const row = q('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? pj(row.value, DEFAULT_SETTINGS[key]) : DEFAULT_SETTINGS[key];
  }
  function setSetting(key, value) {
    q('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, j(value));
  }
  function publicSettings() {
    return {
      tooth_numbering: getSetting('tooth_numbering'),
      medications: getSetting('medications'),
      pharmacy: getSetting('pharmacy'),
      organization: getSetting('organization')
    };
  }
  function updateSettings(actor, input) {
    const s = input || {};
    if (s.tooth_numbering !== undefined) {
      if (!['fdi', 'universal'].includes(s.tooth_numbering)) throw new UserError('Unknown tooth numbering.');
      setSetting('tooth_numbering', s.tooth_numbering);
    }
    if (s.medications !== undefined) {
      if (!Array.isArray(s.medications)) throw new UserError('Medication list is not valid.');
      const list = [...new Set(s.medications.map(m => clean(m, 80)).filter(Boolean))].slice(0, 300);
      setSetting('medications', list);
    }
    if (s.pharmacy !== undefined) {
      if (!Array.isArray(s.pharmacy)) throw new UserError('Pharmacy list is not valid.');
      const list = s.pharmacy.map((p, i) => ({
        id: clean(p.id, 40) || ('item' + Date.now() + i),
        name: clean(p.name, 100),
        en: clean(p.en, 300),
        es: clean(p.es, 300),
        allergy: F.MEDICAL_QUESTIONS.some(m => m.key === p.allergy) ? p.allergy : undefined,
        block: !!p.block
      })).filter(p => p.name).slice(0, 200);
      setSetting('pharmacy', list);
    }
    audit(actor, 'settings.update', 'settings', null, Object.keys(s).join(', '));
    return publicSettings();
  }

  // ---- audit ------------------------------------------------------------
  function audit(actor, action, entity, entityId, detail) {
    q('INSERT INTO audit(at, user_id, user_name, action, entity, entity_id, detail) VALUES(?,?,?,?,?,?,?)')
      .run(nowIso(), actor ? actor.id : null, actor ? actor.name : null, action, entity || null,
        entityId == null ? null : Number(entityId), detail == null ? null : String(detail).slice(0, 500));
  }
  function listAudit(limit = 300) {
    return q('SELECT * FROM audit ORDER BY id DESC LIMIT ?').all(Math.min(Math.max(1, limit | 0), 2000));
  }

  // ---- staff and PIN sign-in --------------------------------------------
  const lockouts = new Map();
  function staffPublic(r) {
    return r && { id: r.id, name: r.name, role: r.role, role_label: ROLES[r.role] || r.role, active: !!r.active, created_at: r.created_at };
  }
  function isSetup() { return !!q("SELECT 1 FROM staff WHERE role = 'admin' AND active = 1 LIMIT 1").get(); }

  function insertStaff(name, role, pin) {
    const n = clean(name, 80);
    if (!n) throw new UserError('Enter a name.');
    if (!ROLES[role]) throw new UserError('Choose a role.');
    checkPinFormat(pin);
    if (q('SELECT 1 FROM staff WHERE lower(name) = lower(?) AND active = 1').get(n)) {
      throw new UserError('Someone with that name already has an account. Add a last initial to tell them apart.');
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const t = nowIso();
    const r = q('INSERT INTO staff(uid, name, role, pin_salt, pin_hash, active, created_at, updated_at) VALUES(?,?,?,?,?,1,?,?)')
      .run(uid(), n, role, salt, hashPin(pin, salt), t, t);
    return Number(r.lastInsertRowid);
  }

  function createFirstAdmin(name, pin) {
    if (isSetup()) throw new UserError('This laptop is already set up.');
    const id = insertStaff(name, 'admin', pin);
    const s = staffPublic(q('SELECT * FROM staff WHERE id = ?').get(id));
    audit(s, 'setup.first_admin', 'staff', id, s.name);
    return s;
  }

  function loginList() {
    return q('SELECT * FROM staff WHERE active = 1 ORDER BY name COLLATE NOCASE').all().map(staffPublic);
  }

  function login(staffId, pin) {
    const r = q('SELECT * FROM staff WHERE id = ? AND active = 1').get(Number(staffId));
    if (!r) throw new UserError('Choose your name.');
    const lock = lockouts.get(r.id);
    if (lock && lock.until > Date.now()) {
      const secs = Math.ceil((lock.until - Date.now()) / 1000);
      throw new UserError(`Too many wrong PINs. Try again in ${secs} seconds.`);
    }
    const ok = /^\d{4,6}$/.test(String(pin || '')) &&
      crypto.timingSafeEqual(Buffer.from(hashPin(pin, r.pin_salt), 'hex'), Buffer.from(r.pin_hash, 'hex'));
    if (!ok) {
      const fails = (lock && lock.until <= Date.now() && lock.fails >= 5 ? 0 : (lock ? lock.fails : 0)) + 1;
      lockouts.set(r.id, { fails, until: fails >= 5 ? Date.now() + 60000 : 0 });
      audit({ id: r.id, name: r.name }, 'auth.login_failed', 'staff', r.id, null);
      throw new UserError(fails >= 5 ? 'Too many wrong PINs. Wait one minute.' : 'That PIN is not right.');
    }
    lockouts.delete(r.id);
    const s = staffPublic(r);
    audit(s, 'auth.login', 'staff', r.id, null);
    return s;
  }

  function listStaff() {
    return q('SELECT * FROM staff ORDER BY active DESC, name COLLATE NOCASE').all().map(staffPublic);
  }
  function addStaff(actor, input) {
    const id = insertStaff(input && input.name, input && input.role, input && input.pin);
    audit(actor, 'staff.add', 'staff', id, `${clean(input.name, 80)} (${input.role})`);
    return staffPublic(q('SELECT * FROM staff WHERE id = ?').get(id));
  }
  function activeAdminCount(exceptId) {
    return q("SELECT COUNT(*) n FROM staff WHERE role = 'admin' AND active = 1 AND id != ?").get(Number(exceptId || 0)).n;
  }
  function updateStaff(actor, input) {
    const r = q('SELECT * FROM staff WHERE id = ?').get(Number(input && input.id));
    if (!r) throw new UserError('That account no longer exists.');
    const name = input.name !== undefined ? clean(input.name, 80) : r.name;
    const role = input.role !== undefined ? input.role : r.role;
    if (!name) throw new UserError('Enter a name.');
    if (!ROLES[role]) throw new UserError('Choose a role.');
    if (r.role === 'admin' && role !== 'admin' && r.active && activeAdminCount(r.id) === 0) {
      throw new UserError('This is the last administrator. Make someone else an administrator first.');
    }
    if (r.id === actor.id && role !== 'admin') throw new UserError('You cannot remove your own administrator role.');
    q('UPDATE staff SET name = ?, role = ?, updated_at = ? WHERE id = ?').run(name, role, nowIso(), r.id);
    audit(actor, 'staff.update', 'staff', r.id, `${name} (${role})`);
    return staffPublic(q('SELECT * FROM staff WHERE id = ?').get(r.id));
  }
  function setStaffActive(actor, id, active) {
    const r = q('SELECT * FROM staff WHERE id = ?').get(Number(id));
    if (!r) throw new UserError('That account no longer exists.');
    if (!active) {
      if (r.id === actor.id) throw new UserError('You cannot turn off your own account.');
      if (r.role === 'admin' && activeAdminCount(r.id) === 0) throw new UserError('This is the last administrator.');
    }
    q('UPDATE staff SET active = ?, updated_at = ? WHERE id = ?').run(active ? 1 : 0, nowIso(), r.id);
    audit(actor, active ? 'staff.enable' : 'staff.disable', 'staff', r.id, r.name);
    return staffPublic(q('SELECT * FROM staff WHERE id = ?').get(r.id));
  }
  function setStaffPin(actor, id, pin) {
    const r = q('SELECT * FROM staff WHERE id = ?').get(Number(id));
    if (!r) throw new UserError('That account no longer exists.');
    if (actor.role !== 'admin' && actor.id !== r.id) throw new UserError('Only an administrator can change someone else’s PIN.');
    checkPinFormat(pin);
    const salt = crypto.randomBytes(16).toString('hex');
    q('UPDATE staff SET pin_salt = ?, pin_hash = ?, updated_at = ? WHERE id = ?').run(salt, hashPin(pin, salt), nowIso(), r.id);
    lockouts.delete(r.id);
    audit(actor, 'staff.pin_change', 'staff', r.id, r.name);
    return true;
  }
  function getStaff(id) { return staffPublic(q('SELECT * FROM staff WHERE id = ? AND active = 1').get(Number(id))); }

  // ---- clinic events ----------------------------------------------------
  function eventRow(r) {
    if (!r) return null;
    const counts = q(`SELECT COUNT(*) total,
        SUM(CASE WHEN status = 'checked_out' THEN 1 ELSE 0 END) done
        FROM visits WHERE event_id = ? AND status != 'left'`).get(r.id);
    return { ...r, active: Number(getSetting('active_event_id')) === r.id, patients: counts.total || 0, checked_out: counts.done || 0 };
  }
  function listEvents() {
    return q('SELECT * FROM events ORDER BY COALESCE(start_date, created_at) DESC, id DESC').all().map(eventRow);
  }
  function getEvent(id) { return eventRow(q('SELECT * FROM events WHERE id = ?').get(Number(id))); }
  function activeEvent() {
    const id = getSetting('active_event_id');
    if (!id) return null;
    const e = getEvent(id);
    return e && e.status === 'open' ? e : null;
  }
  function eventFields(input) {
    const e = input || {};
    const name = clean(e.name, 100);
    if (!name) throw new UserError('Give the clinic a name.');
    const start = /^\d{4}-\d{2}-\d{2}$/.test(e.start_date || '') ? e.start_date : localDate();
    const end = /^\d{4}-\d{2}-\d{2}$/.test(e.end_date || '') ? e.end_date : start;
    if (end < start) throw new UserError('The end date is before the start date.');
    const target = e.target_patients === '' || e.target_patients == null ? null : parseInt(e.target_patients, 10);
    if (target != null && (!Number.isFinite(target) || target < 0 || target > 100000)) throw new UserError('The target must be a number of patients.');
    return {
      name, trip_code: clean(e.trip_code, 40), country: clean(e.country, 60), community: clean(e.community, 80),
      start_date: start, end_date: end, season: clean(e.season, 30) || F.seasonFor(start),
      year: parseInt(start.slice(0, 4), 10), target_patients: target
    };
  }
  function createEvent(actor, input) {
    const f = eventFields(input);
    const t = nowIso();
    const r = q(`INSERT INTO events(uid, name, trip_code, country, community, start_date, end_date, season, year,
        target_patients, status, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?, 'open', ?, ?)`)
      .run(uid(), f.name, f.trip_code, f.country, f.community, f.start_date, f.end_date, f.season, f.year, f.target_patients, t, t);
    const id = Number(r.lastInsertRowid);
    audit(actor, 'event.create', 'event', id, f.name);
    if (input && input.make_active !== false) setSetting('active_event_id', id);
    return getEvent(id);
  }
  function updateEvent(actor, input) {
    const r = q('SELECT * FROM events WHERE id = ?').get(Number(input && input.id));
    if (!r) throw new UserError('That clinic no longer exists.');
    const f = eventFields({ ...r, ...input });
    q(`UPDATE events SET name=?, trip_code=?, country=?, community=?, start_date=?, end_date=?, season=?, year=?,
        target_patients=?, updated_at=? WHERE id=?`)
      .run(f.name, f.trip_code, f.country, f.community, f.start_date, f.end_date, f.season, f.year, f.target_patients, nowIso(), r.id);
    audit(actor, 'event.update', 'event', r.id, f.name);
    return getEvent(r.id);
  }
  function setActiveEvent(actor, id) {
    const e = getEvent(id);
    if (!e) throw new UserError('That clinic no longer exists.');
    if (e.status !== 'open') throw new UserError('That clinic is finished. Re-open it first.');
    setSetting('active_event_id', e.id);
    audit(actor, 'event.set_active', 'event', e.id, e.name);
    return getEvent(e.id);
  }
  function finishEvent(actor, id) {
    const e = getEvent(id);
    if (!e) throw new UserError('That clinic no longer exists.');
    tx(() => {
      q("UPDATE events SET status = 'finished', updated_at = ? WHERE id = ?").run(nowIso(), e.id);
      if (Number(getSetting('active_event_id')) === e.id) setSetting('active_event_id', null);
    });
    audit(actor, 'event.finish', 'event', e.id, e.name);
    return getEvent(e.id);
  }
  function reopenEvent(actor, id) {
    const e = getEvent(id);
    if (!e) throw new UserError('That clinic no longer exists.');
    q("UPDATE events SET status = 'open', updated_at = ? WHERE id = ?").run(nowIso(), e.id);
    audit(actor, 'event.reopen', 'event', e.id, e.name);
    return getEvent(e.id);
  }
  function deleteEvent(actor, id) {
    const e = getEvent(id);
    if (!e) throw new UserError('That clinic no longer exists.');
    if (e.patients > 0 || q('SELECT 1 FROM visits WHERE event_id = ? LIMIT 1').get(e.id)) {
      throw new UserError('This clinic has patient visits, so it cannot be deleted. Finish it instead — records are kept.');
    }
    q('DELETE FROM events WHERE id = ?').run(e.id);
    if (Number(getSetting('active_event_id')) === e.id) setSetting('active_event_id', null);
    audit(actor, 'event.delete', 'event', e.id, e.name);
    return true;
  }

  // ---- patients ---------------------------------------------------------
  function patientRow(r) {
    if (!r) return null;
    return { ...r, no_phone: !!r.no_phone, age: F.ageOn(r.dob) };
  }
  function searchPatients(text, limit = 50) {
    const fold = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const words = fold(clean(text, 100)).split(' ').filter(Boolean);
    if (!words.length) return [];
    const rows = q(`SELECT p.*, (SELECT MAX(v.visit_date) FROM visits v WHERE v.patient_id = p.id) last_visit,
        (SELECT COUNT(*) FROM visits v WHERE v.patient_id = p.id AND v.status != 'left') visits
        FROM patients p ORDER BY p.last_name COLLATE NOCASE, p.first_name COLLATE NOCASE`).all();
    const out = [];
    for (const r of rows) {
      const hay = fold([r.first_name, r.last_name, r.community, r.municipality, r.dob, F.formatDob(r.dob),
        String(r.phone || '').replace(/\D/g, '')].join(' '));
      const ok = words.every(w => hay.includes(w) || (/\d/.test(w) && w.replace(/\D/g, '').length >= 3 && hay.includes(w.replace(/\D/g, ''))));
      if (ok) { out.push(patientRow(r)); if (out.length >= limit) break; }
    }
    return out;
  }
  function findMatches(reg) {
    const v = F.validateRegistration(reg).value;
    if (!v.first_name || !v.last_name) return [];
    const rows = q(`SELECT * FROM patients WHERE lower(first_name) = lower(?) AND lower(last_name) = lower(?)`).all(v.first_name, v.last_name);
    return rows.filter(r => !v.dob || !r.dob || r.dob === v.dob).map(patientRow);
  }
  function getPatient(actor, id) {
    const p = patientRow(q('SELECT * FROM patients WHERE id = ?').get(Number(id)));
    if (!p) throw new UserError('That patient record no longer exists.');
    const visits = q(`SELECT v.*, e.name event_name, e.community event_community, e.country event_country, e.trip_code
        FROM visits v JOIN events e ON e.id = v.event_id WHERE v.patient_id = ? ORDER BY v.visit_date DESC, v.id DESC`).all(p.id)
      .map(visitSummary);
    const last = q('SELECT medical FROM visits WHERE patient_id = ? AND medical IS NOT NULL ORDER BY id DESC LIMIT 1').get(p.id);
    audit(actor, 'patient.view', 'patient', p.id, `${p.first_name} ${p.last_name}`);
    return { patient: p, visits, last_medical: last ? pj(last.medical, null) : null };
  }
  function updatePatient(actor, id, reg) {
    const r = q('SELECT * FROM patients WHERE id = ?').get(Number(id));
    if (!r) throw new UserError('That patient record no longer exists.');
    const v = F.validateRegistration(reg);
    if (!v.ok) throw new UserError('Some details are missing: ' + Object.keys(v.errors).join(', '));
    writePatient(r.id, v.value, reg.language || r.language);
    audit(actor, 'patient.update', 'patient', r.id, `${v.value.first_name} ${v.value.last_name}`);
    return patientRow(q('SELECT * FROM patients WHERE id = ?').get(r.id));
  }
  function writePatient(id, p, language) {
    q(`UPDATE patients SET first_name=?, last_name=?, dob=?, sex=?, phone=?, no_phone=?, address=?, community=?,
        municipality=?, region=?, country=?, language=?, updated_at=? WHERE id=?`)
      .run(p.first_name, p.last_name, p.dob, p.sex, p.phone, p.no_phone, p.address, p.community, p.municipality,
        p.region, p.country, language || null, nowIso(), id);
  }

  // ---- visits -----------------------------------------------------------
  function visitSummary(r) {
    return {
      id: r.id, patient_id: r.patient_id, event_id: r.event_id, event_name: r.event_name, trip_code: r.trip_code,
      event_community: r.event_community, event_country: r.event_country,
      queue_number: r.queue_number, visit_date: r.visit_date, status: r.status, status_label: STATUSES[r.status],
      flags: pj(r.flags, []), triage: pj(r.triage, null), treatment: pj(r.treatment, {}), checkout: pj(r.checkout, null)
    };
  }
  function fullVisit(r) {
    if (!r) return null;
    const p = patientRow(q('SELECT * FROM patients WHERE id = ?').get(r.patient_id));
    const e = q('SELECT id, name, trip_code, community, country FROM events WHERE id = ?').get(r.event_id);
    const consent = q('SELECT * FROM consents WHERE visit_id = ? ORDER BY id DESC LIMIT 1').get(r.id) || null;
    const previous = q(`SELECT v.*, e.name event_name, e.trip_code FROM visits v JOIN events e ON e.id = v.event_id
        WHERE v.patient_id = ? AND v.id != ? ORDER BY v.visit_date DESC, v.id DESC LIMIT 10`).all(r.patient_id, r.id).map(visitSummary);
    return {
      id: r.id, uid: r.uid, queue_number: r.queue_number, visit_date: r.visit_date, status: r.status,
      status_label: STATUSES[r.status], language: r.language || 'es',
      patient: p, event: e, age: F.ageOn(p.dob, r.visit_date),
      medical: pj(r.medical, null), flags: pj(r.flags, []),
      triage: pj(r.triage, null), chart: pj(r.chart, { dentition: 'permanent', teeth: {} }),
      route_cleaning: !!r.route_cleaning, route_restorative: !!r.route_restorative,
      cleaning_done: !!r.cleaning_done, restorative_done: !!r.restorative_done,
      education: pj(r.education, null), treatment: pj(r.treatment, {}), checkout: pj(r.checkout, null),
      survey: pj(r.survey, null),
      consent: consent && { ...consent, read_aloud: !!consent.read_aloud },
      consent_signed: !!consent,
      checked_in_by: r.checked_in_by, triaged_by: r.triaged_by, educated_by: r.educated_by, checked_out_by: r.checked_out_by,
      checked_in_at: r.checked_in_at, triaged_at: r.triaged_at, educated_at: r.educated_at,
      treatment_started_at: r.treatment_started_at, treatment_done_at: r.treatment_done_at, checked_out_at: r.checked_out_at,
      locked: r.status === 'checked_out' || r.status === 'left',
      previous_visits: previous
    };
  }
  function visitRowOrThrow(id) {
    const r = q('SELECT * FROM visits WHERE id = ?').get(Number(id));
    if (!r) throw new UserError('That visit no longer exists.');
    return r;
  }
  function getVisit(actor, id, opts = {}) {
    const v = fullVisit(visitRowOrThrow(id));
    if (!opts.silent) audit(actor, 'visit.view', 'visit', v.id, `#${v.queue_number} ${v.patient.first_name} ${v.patient.last_name}`);
    return v;
  }
  function assertOpen(r) {
    if (r.status === 'checked_out') throw new UserError('This visit is checked out. An administrator can re-open it.');
    if (r.status === 'left') throw new UserError('This patient left without care. An administrator can re-open the visit.');
  }
  function assertConsent(r) {
    if (!q('SELECT 1 FROM consents WHERE visit_id = ? LIMIT 1').get(r.id)) {
      throw new UserError('The consent is not signed yet. Take the consent before care.');
    }
  }

  function checkIn(actor, input) {
    const ev = activeEvent();
    if (!ev) throw new UserError('No clinic is running. An administrator must start one under Clinic events.');
    const reg = F.validateRegistration(input && input.registration);
    if (!reg.ok) throw new UserError('Some registration details are missing or not valid.');
    const med = F.validateMedical(input && input.medical, reg.value.sex);
    if (!med.ok) throw new UserError('Every medical history question needs an answer.');
    const language = F.LANGUAGES.some(l => l.code === input.language) ? input.language : 'es';
    const today = localDate();
    return tx(() => {
      let patientId = input.patient_id ? Number(input.patient_id) : null;
      const t = nowIso();
      if (patientId) {
        if (!q('SELECT 1 FROM patients WHERE id = ?').get(patientId)) throw new UserError('That patient record no longer exists.');
        const open = q(`SELECT queue_number FROM visits WHERE patient_id = ? AND event_id = ? AND visit_date = ?
            AND status IN (${OPEN_STATUSES.map(() => '?').join(',')})`).get(patientId, ev.id, today, ...OPEN_STATUSES);
        if (open) throw new UserError(`This patient is already checked in today as number ${open.queue_number}.`);
        writePatient(patientId, reg.value, language);
      } else {
        const r = q(`INSERT INTO patients(uid, first_name, last_name, dob, sex, phone, no_phone, address, community,
            municipality, region, country, language, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(uid(), reg.value.first_name, reg.value.last_name, reg.value.dob, reg.value.sex, reg.value.phone,
            reg.value.no_phone, reg.value.address, reg.value.community, reg.value.municipality, reg.value.region,
            reg.value.country, language, t, t);
        patientId = Number(r.lastInsertRowid);
      }
      const n = q('SELECT COALESCE(MAX(queue_number), 0) + 1 n FROM visits WHERE event_id = ? AND visit_date = ?').get(ev.id, today).n;
      const r = q(`INSERT INTO visits(uid, patient_id, event_id, queue_number, visit_date, status, language, medical, flags,
          checked_in_by, checked_in_at, created_at, updated_at) VALUES(?,?,?,?,?, 'waiting_triage', ?,?,?,?,?,?,?)`)
        .run(uid(), patientId, ev.id, n, today, language, j(med.value), j(F.flagsFor(med.value)), actor.name, t, t, t);
      const visitId = Number(r.lastInsertRowid);
      audit(actor, 'visit.check_in', 'visit', visitId, `#${n} ${reg.value.first_name} ${reg.value.last_name}${input.patient_id ? ' (returning)' : ''}`);
      return getVisit(actor, visitId, { silent: true });
    });
  }

  function updateMedical(actor, visitId, medical) {
    const r = visitRowOrThrow(visitId);
    assertOpen(r);
    const p = q('SELECT sex FROM patients WHERE id = ?').get(r.patient_id);
    const med = F.validateMedical(medical, p.sex);
    if (!med.ok) throw new UserError('Every medical history question needs an answer.');
    q('UPDATE visits SET medical = ?, flags = ?, updated_at = ? WHERE id = ?').run(j(med.value), j(F.flagsFor(med.value)), nowIso(), r.id);
    audit(actor, 'visit.medical_update', 'visit', r.id, null);
    return getVisit(actor, r.id, { silent: true });
  }

  function validSignature(sig) {
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(sig || ''));
    if (!m || sig.length > 700000) return false;
    const buf = Buffer.from(m[1], 'base64');
    const png = buf.length >= 200 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    return png;
  }

  function signConsent(actor, visitId, input) {
    const r = visitRowOrThrow(visitId);
    assertOpen(r);
    const c = input || {};
    const p = q('SELECT * FROM patients WHERE id = ?').get(r.patient_id);
    const age = F.ageOn(p.dob, r.visit_date);
    if (!c.agree) throw new UserError('The patient must agree to the consent.');
    const signer = clean(c.signer_name, 80);
    if (!signer) throw new UserError('Enter the name of the person signing.');
    let relationship = null;
    if (age != null && age < 18) {
      if (!F.GUARDIAN_RELATIONSHIPS.some(g => g.value === c.relationship)) {
        throw new UserError('The patient is under 18. A parent or guardian must sign — choose how they are related.');
      }
      relationship = c.relationship;
    } else relationship = 'self';
    if (!validSignature(c.signature)) throw new UserError('A signature is needed. Draw it, or use the signature button.');
    const method = c.signature_method === 'typed' ? 'typed' : 'drawn';
    const language = F.CONSENT[c.language] ? c.language : (r.language || 'es');
    const t = nowIso();
    q(`INSERT INTO consents(uid, visit_id, type, includes_surgery, signer_name, relationship, signature, signature_method,
        language, version, read_aloud, read_aloud_by, signed_at) VALUES(?,?, 'general', 1, ?,?,?,?,?,?,?,?,?)`)
      .run(uid(), r.id, signer, relationship, c.signature, method, language, `${F.CONSENT_VERSION}-${language}`,
        c.read_aloud ? 1 : 0, c.read_aloud ? actor.name : null, t);
    q('UPDATE visits SET updated_at = ? WHERE id = ?').run(t, r.id);
    audit(actor, 'consent.sign', 'visit', r.id, `${signer} (${relationship}, ${language}${c.read_aloud ? ', read aloud' : ''})`);
    return getVisit(actor, r.id, { silent: true });
  }

  function cleanChart(chart) {
    const c = chart || {};
    const dentition = ['permanent', 'primary', 'mixed'].includes(c.dentition) ? c.dentition : 'permanent';
    const teeth = {};
    const markKeys = F.TOOTH_MARKS.map(m => m.key);
    for (const [code, t] of Object.entries(c.teeth || {})) {
      if (!F.isValidTooth(code)) continue;
      const marks = (Array.isArray(t.marks) ? t.marks : []).filter(m => markKeys.includes(m));
      const note = clean(t.note, 80);
      if (marks.length || note) teeth[code] = { marks: [...new Set(marks)], note };
    }
    return { dentition, teeth };
  }

  function saveTriage(actor, visitId, input) {
    const r = visitRowOrThrow(visitId);
    assertOpen(r);
    assertConsent(r);
    const t = input || {};
    const num = (v, lo, hi) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
    const triage = {
      complaint: clean(t.complaint, 300),
      bp_sys: num(t.bp_sys, 50, 300), bp_dia: num(t.bp_dia, 20, 200), pulse: num(t.pulse, 20, 250),
      notes: clean(t.notes, 2000),
      priority: t.priority === 'urgent' ? 'urgent' : 'normal',
      exam_only: !!t.exam_only,
      dentist: actor.name,
      at: nowIso()
    };
    const cleaning = !triage.exam_only && !!t.route_cleaning;
    const restorative = !triage.exam_only && !!t.route_restorative;
    if (!triage.exam_only && !cleaning && !restorative) {
      throw new UserError('Choose where the patient goes next: cleaning, restorative / extraction, or exam only.');
    }
    const needTreatment = (cleaning && !r.cleaning_done) || (restorative && !r.restorative_done);
    let next;
    if (r.status === 'waiting_triage') {
      next = t.skip_education ? (needTreatment ? 'waiting_treatment' : 'ready_checkout') : 'waiting_education';
    } else if (r.status === 'waiting_education') {
      next = 'waiting_education';
    } else {
      next = needTreatment ? (r.status === 'in_treatment' ? 'in_treatment' : 'waiting_treatment') : 'ready_checkout';
    }
    const ts = nowIso();
    q(`UPDATE visits SET triage = ?, chart = ?, route_cleaning = ?, route_restorative = ?, status = ?,
        triaged_by = COALESCE(triaged_by, ?), triaged_at = COALESCE(triaged_at, ?), updated_at = ? WHERE id = ?`)
      .run(j(triage), j(cleanChart(t.chart)), cleaning ? 1 : 0, restorative ? 1 : 0, next, actor.name, ts, ts, r.id);
    audit(actor, 'visit.triage', 'visit', r.id, `${cleaning ? 'cleaning ' : ''}${restorative ? 'restorative ' : ''}${triage.exam_only ? 'exam only' : ''}`.trim());
    return getVisit(actor, r.id, { silent: true });
  }

  function saveEducation(actor, visitId, input) {
    const r = visitRowOrThrow(visitId);
    assertOpen(r);
    if (r.status === 'waiting_triage') throw new UserError('The patient has not been triaged yet.');
    const topics = (input && Array.isArray(input.topics) ? input.topics : []).filter(k => F.EDUCATION_TOPICS.some(t => t.key === k));
    const education = { topics, notes: clean(input && input.notes, 500), by: actor.name, at: nowIso() };
    const needTreatment = (r.route_cleaning && !r.cleaning_done) || (r.route_restorative && !r.restorative_done);
    let next = r.status;
    if (r.status === 'waiting_education') next = needTreatment ? 'waiting_treatment' : 'ready_checkout';
    const ts = nowIso();
    q('UPDATE visits SET education = ?, status = ?, educated_by = ?, educated_at = ?, updated_at = ? WHERE id = ?')
      .run(j(education), next, actor.name, ts, ts, r.id);
    audit(actor, 'visit.education', 'visit', r.id, topics.join(', '));
    return getVisit(actor, r.id, { silent: true });
  }

  function cleanTreatment(station, input) {
    const t = input || {};
    if (station === 'cleaning') {
      const procedures = {};
      for (const p of F.CLEANING_PROCEDURES) procedures[p.key] = !!(t.procedures && t.procedures[p.key]);
      const sealants = (Array.isArray(t.sealants) ? t.sealants : []).filter(F.isValidTooth);
      return { procedures, sealants: [...new Set(sealants)], notes: clean(t.notes, 2000) };
    }
    const fillings = (Array.isArray(t.fillings) ? t.fillings : []).map(f => ({
      tooth: F.isValidTooth(f.tooth) ? f.tooth : null,
      surfaces: (Array.isArray(f.surfaces) ? f.surfaces : []).filter(s => F.SURFACES.includes(s)),
      material: F.FILLING_MATERIALS.includes(f.material) ? f.material : F.FILLING_MATERIALS[0]
    })).filter(f => f.tooth).slice(0, 32);
    const extractions = (Array.isArray(t.extractions) ? t.extractions : []).map(x => ({
      tooth: F.isValidTooth(x.tooth) ? x.tooth : null,
      type: F.EXTRACTION_TYPES.includes(x.type) ? x.type : 'Simple'
    })).filter(x => x.tooth).slice(0, 32);
    const anesthetic = (Array.isArray(t.anesthetic) ? t.anesthetic : []).map(a => ({
      agent: F.ANESTHETICS.includes(a.agent) ? a.agent : 'Other',
      carpules: Math.min(Math.max(parseFloat(a.carpules) || 0, 0), 20)
    })).filter(a => a.carpules > 0 || a.agent === 'Topical only').slice(0, 10);
    return { fillings, extractions, anesthetic, xray_taken: !!t.xray_taken, other: clean(t.other, 300), notes: clean(t.notes, 2000) };
  }

  function saveTreatment(actor, visitId, station, input, complete) {
    if (station !== 'cleaning' && station !== 'restorative') throw new UserError('Unknown station.');
    const r = visitRowOrThrow(visitId);
    assertOpen(r);
    assertConsent(r);
    if (r.status === 'waiting_triage') throw new UserError('The patient has not been triaged yet.');
    if (station === 'cleaning' ? !r.route_cleaning : !r.route_restorative) {
      throw new UserError(`The patient is not routed to ${station === 'cleaning' ? 'cleaning' : 'restorative / extraction'}. Change the route in triage first.`);
    }
    const all = pj(r.treatment, {});
    const prev = all[station] || {};
    const data = cleanTreatment(station, input);
    data.provider = clean(input && input.provider, 80) || prev.provider || actor.name;
    data.saved_by = actor.name;
    data.saved_at = nowIso();
    if (complete) data.done_at = nowIso(); else if (prev.done_at) data.done_at = prev.done_at;
    all[station] = data;
    const cleaningDone = station === 'cleaning' ? (complete ? 1 : r.cleaning_done) : r.cleaning_done;
    const restorativeDone = station === 'restorative' ? (complete ? 1 : r.restorative_done) : r.restorative_done;
    const needC = r.route_cleaning && !cleaningDone;
    const needR = r.route_restorative && !restorativeDone;
    const next = needC || needR ? (complete ? 'waiting_treatment' : 'in_treatment') : 'ready_checkout';
    // If there is another station still to do, the patient goes back to wait for it.
    const ts = nowIso();
    q(`UPDATE visits SET treatment = ?, cleaning_done = ?, restorative_done = ?, status = ?,
        treatment_started_at = COALESCE(treatment_started_at, ?),
        treatment_done_at = CASE WHEN ? = 'ready_checkout' THEN ? ELSE treatment_done_at END, updated_at = ? WHERE id = ?`)
      .run(j(all), cleaningDone, restorativeDone, next, ts, next, ts, ts, r.id);
    if (input && input.chart) q('UPDATE visits SET chart = ? WHERE id = ?').run(j(cleanChart(input.chart)), r.id);
    audit(actor, complete ? 'treatment.complete' : 'treatment.save', 'visit', r.id, station);
    return getVisit(actor, r.id, { silent: true });
  }

  function prescriptionCheck(r, items) {
    const med = pj(r.medical, {});
    const answers = med.answers || {};
    const pharmacy = getSetting('pharmacy');
    const warnings = [];
    const blocks = [];
    for (const it of items) {
      const p = pharmacy.find(x => x.id === it.id);
      if (p && p.allergy && answers[p.allergy] === 'yes') {
        const label = (F.MEDICAL_QUESTIONS.find(m => m.key === p.allergy) || {}).label;
        (p.block ? blocks : warnings).push(`${p.name}: the patient reported ${String(label).toLowerCase()}.`);
      }
    }
    return { warnings, blocks };
  }

  function checkout(actor, visitId, input) {
    const r = visitRowOrThrow(visitId);
    assertOpen(r);
    if (r.status === 'waiting_triage') throw new UserError('The patient has not been seen by a dentist yet.');
    const c = input || {};
    const pharmacy = getSetting('pharmacy');
    const prescriptions = (Array.isArray(c.prescriptions) ? c.prescriptions : []).map(p => {
      const item = pharmacy.find(x => x.id === p.id);
      if (!item) return null;
      return { id: item.id, name: item.name, quantity: clean(p.quantity, 30), instructions: clean(p.instructions, 300) || item[r.language || 'es'] || item.en };
    }).filter(Boolean).slice(0, 20);
    const check = prescriptionCheck(r, prescriptions);
    if (check.blocks.length) throw new UserError('Not allowed — allergy: ' + check.blocks.join(' '));
    if (check.warnings.length && !c.acknowledge_warnings) {
      throw new UserError('Allergy warning: ' + check.warnings.join(' ') + ' Confirm with the dentist, then tick "Dentist confirmed".');
    }
    const aftercare = (Array.isArray(c.aftercare) ? c.aftercare : []).filter(k => F.AFTERCARE[k]);
    const followUp = { needed: !!(c.follow_up && c.follow_up.needed), reason: clean(c.follow_up && c.follow_up.reason, 300) };
    if (followUp.needed && !followUp.reason) throw new UserError('Say why the patient needs a follow-up.');
    const checkoutData = {
      aftercare, prescriptions, follow_up: followUp, notes: clean(c.notes, 1000),
      warnings_acknowledged: check.warnings.length ? actor.name : null, by: actor.name, at: nowIso()
    };
    let survey = null;
    if (c.survey && (c.survey.rating || c.survey.helped)) {
      const rating = parseInt(c.survey.rating, 10);
      survey = { rating: rating >= 1 && rating <= 5 ? rating : null, helped: clean(c.survey.helped, 1000), language: r.language || 'es', at: nowIso() };
    }
    const ts = nowIso();
    q(`UPDATE visits SET checkout = ?, survey = ?, status = 'checked_out', checked_out_by = ?, checked_out_at = ?, updated_at = ? WHERE id = ?`)
      .run(j(checkoutData), j(survey), actor.name, ts, ts, r.id);
    audit(actor, 'visit.check_out', 'visit', r.id, `${prescriptions.length} prescription(s)${followUp.needed ? ', follow-up' : ''}`);
    return getVisit(actor, r.id, { silent: true });
  }

  function markLeft(actor, visitId, reason) {
    const r = visitRowOrThrow(visitId);
    assertOpen(r);
    const ts = nowIso();
    const co = { left_reason: clean(reason, 300), by: actor.name, at: ts };
    q(`UPDATE visits SET status = 'left', checkout = ?, checked_out_by = ?, checked_out_at = ?, updated_at = ? WHERE id = ?`).run(j(co), actor.name, ts, ts, r.id);
    audit(actor, 'visit.left', 'visit', r.id, co.left_reason);
    return getVisit(actor, r.id, { silent: true });
  }

  function reopenVisit(actor, visitId) {
    const r = visitRowOrThrow(visitId);
    if (r.status !== 'checked_out' && r.status !== 'left') throw new UserError('This visit is not closed.');
    const triage = pj(r.triage, null);
    const next = !triage ? 'waiting_triage'
      : (r.route_cleaning && !r.cleaning_done) || (r.route_restorative && !r.restorative_done) ? 'waiting_treatment' : 'ready_checkout';
    q('UPDATE visits SET status = ?, updated_at = ? WHERE id = ?').run(next, nowIso(), r.id);
    audit(actor, 'visit.reopen', 'visit', r.id, `${r.status} -> ${next}`);
    return getVisit(actor, r.id, { silent: true });
  }

  function moveVisit(actor, visitId, status) {
    const r = visitRowOrThrow(visitId);
    if (!OPEN_STATUSES.includes(status)) throw new UserError('Choose a stage.');
    if (status !== 'waiting_triage') assertConsent(r);
    if (['waiting_treatment', 'in_treatment', 'ready_checkout', 'waiting_education'].includes(status) && !r.triaged_at) {
      throw new UserError('The patient must be triaged first.');
    }
    q('UPDATE visits SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), r.id);
    audit(actor, 'visit.move', 'visit', r.id, `${r.status} -> ${status}`);
    return getVisit(actor, r.id, { silent: true });
  }

  function queue(eventId, filter = {}) {
    const ev = eventId ? getEvent(eventId) : activeEvent();
    if (!ev) return { event: null, visits: [] };
    const rows = q(`SELECT v.*, p.first_name, p.last_name, p.dob, p.sex, p.community, p.phone,
        (SELECT COUNT(*) FROM consents c WHERE c.visit_id = v.id) consent_count,
        (SELECT COUNT(*) FROM visits pv WHERE pv.patient_id = v.patient_id AND pv.id != v.id AND pv.status != 'left') previous_visits
        FROM visits v JOIN patients p ON p.id = v.patient_id
        WHERE v.event_id = ? ${filter.today ? 'AND v.visit_date = ?' : ''}
        ORDER BY v.visit_date, v.queue_number`).all(...[ev.id].concat(filter.today ? [localDate()] : []));
    const visits = rows.map(r => {
      const triage = pj(r.triage, null);
      return {
        id: r.id, queue_number: r.queue_number, visit_date: r.visit_date, status: r.status, status_label: STATUSES[r.status],
        first_name: r.first_name, last_name: r.last_name, age: F.ageOn(r.dob, r.visit_date), sex: r.sex,
        community: r.community, flags: pj(r.flags, []), consent_signed: r.consent_count > 0,
        returning: r.previous_visits > 0, priority: triage ? triage.priority : 'normal',
        complaint: triage ? triage.complaint : (pj(r.medical, {}).reason || ''),
        route_cleaning: !!r.route_cleaning, route_restorative: !!r.route_restorative,
        cleaning_done: !!r.cleaning_done, restorative_done: !!r.restorative_done,
        checked_in_at: r.checked_in_at, checked_out_at: r.checked_out_at, triaged_by: r.triaged_by,
        updated_at: r.updated_at
      };
    });
    return { event: ev, visits };
  }

  function dashboard() {
    const ev = activeEvent();
    if (!ev) return { event: null };
    const { visits } = queue(ev.id);
    const today = localDate();
    const todays = visits.filter(v => v.visit_date === today);
    const count = (list, s) => list.filter(v => v.status === s).length;
    const seen = visits.filter(v => v.status !== 'left').length;
    return {
      event: ev,
      today: {
        checked_in: todays.filter(v => v.status !== 'left').length,
        waiting_triage: count(todays, 'waiting_triage'),
        waiting_education: count(todays, 'waiting_education'),
        waiting_treatment: count(todays, 'waiting_treatment') + count(todays, 'in_treatment'),
        ready_checkout: count(todays, 'ready_checkout'),
        checked_out: count(todays, 'checked_out'),
        left: count(todays, 'left')
      },
      event_totals: { seen, checked_out: count(visits, 'checked_out'), target: ev.target_patients },
      board: todays
    };
  }

  // ---- backup -----------------------------------------------------------
  function backupTo(actor, dest) {
    if (!dest) throw new UserError('Choose where to save the backup.');
    const fs = require('node:fs');
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    db.exec(`VACUUM INTO '${String(dest).replace(/'/g, "''")}'`);
    audit(actor, 'backup.create', 'database', null, dest);
    return { path: dest, bytes: fs.statSync(dest).size };
  }

  function close() { try { db.close(); } catch { /* ignore */ } }

  return {
    db, file, tx, close, ROLES, STATUSES,
    getSetting, setSetting, publicSettings, updateSettings,
    audit, listAudit,
    isSetup, createFirstAdmin, loginList, login, listStaff, addStaff, updateStaff, setStaffActive, setStaffPin, getStaff,
    listEvents, getEvent, activeEvent, createEvent, updateEvent, setActiveEvent, finishEvent, reopenEvent, deleteEvent,
    searchPatients, findMatches, getPatient, updatePatient,
    checkIn, getVisit, updateMedical, signConsent, saveTriage, saveEducation, saveTreatment, checkout, markLeft,
    reopenVisit, moveVisit, queue, dashboard, prescriptionCheck: (id, items) => prescriptionCheck(visitRowOrThrow(id), items || []),
    backupTo
  };
}

module.exports = { openStore, UserError, ROLES, STATUSES, localDate };
