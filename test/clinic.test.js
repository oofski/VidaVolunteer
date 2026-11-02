'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openStore } = require('../src/main/db.js');
const { createApi } = require('../src/main/api.js');

// A tiny valid PNG (> 200 bytes) standing in for a drawn signature.
function fakeSignature() {
  const zlib = require('node:zlib');
  const w = 60, h = 20;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 7919) % 251;
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(td) : 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 0 })), chunk('IEND', Buffer.alloc(0))]);
  return 'data:image/png;base64,' + png.toString('base64');
}

function fresh() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vida-test-'));
  const store = openStore(path.join(dir, 't.db'));
  const api = createApi(store, { version: '0.0.1-test' });
  return { store, api, dir };
}

const REG = {
  first_name: 'Ana', last_name: 'López', dob: '04/03/1990', sex: 'female', phone: '5555-1234',
  address: 'Casa 4, calle principal', community: 'San Juan', municipality: 'Sololá', region: 'Sololá', country: 'Guatemala'
};
function answers(overrides = {}) {
  const F = require('../src/shared/forms.js');
  const a = {};
  for (const q of F.MEDICAL_QUESTIONS) a[q.key] = 'no';
  for (const q of F.DENTAL_QUESTIONS) a[q.key] = 'no';
  return { answers: { ...a, ...overrides }, medications: [], reason: 'Dolor de muela' };
}

async function setupAdmin(api) {
  const s = { user: null };
  const r = await api.call(s, 'setup:firstAdmin', { name: 'Lucia', pin: '1234' });
  assert.equal(r.ok, true, r.error);
  return s;
}

test('first run: one admin is created with a PIN, and only once', async () => {
  const { api } = fresh();
  const info = await api.call({}, 'app:info');
  assert.equal(info.data.setup, false);
  const bad = await api.call({}, 'setup:firstAdmin', { name: 'X', pin: '12' });
  assert.equal(bad.ok, false);
  await setupAdmin(api);
  const again = await api.call({}, 'setup:firstAdmin', { name: 'Y', pin: '9999' });
  assert.equal(again.ok, false);
});

test('PIN sign-in, wrong PIN lockout after 5 tries', async () => {
  const { api } = fresh();
  const admin = await setupAdmin(api);
  const list = await api.call({}, 'auth:list');
  assert.equal(list.data.length, 1);
  assert.equal(list.data[0].pin_hash, undefined, 'never send PIN hashes to the screen');
  const s = {};
  for (let i = 0; i < 5; i++) assert.equal((await api.call(s, 'auth:login', { id: admin.user.id, pin: '0000' })).ok, false);
  const locked = await api.call(s, 'auth:login', { id: admin.user.id, pin: '1234' });
  assert.equal(locked.ok, false);
  assert.match(locked.error, /Too many/);
});

test('admin-only actions are refused for other roles and when signed out', async () => {
  const { api } = fresh();
  const admin = await setupAdmin(api);
  const add = await api.call(admin, 'staff:add', { name: 'Dr. Pérez', role: 'dentist', pin: '4321' });
  assert.equal(add.ok, true, add.error);
  const s = {};
  assert.equal((await api.call(s, 'events:create', { name: 'x' })).ok, false);
  assert.equal((await api.call(s, 'auth:login', { id: add.data.id, pin: '4321' })).ok, true);
  const r = await api.call(s, 'events:create', { name: 'x' });
  assert.equal(r.ok, false);
  assert.match(r.error, /administrator/);
  // Clinic screens are open to every role.
  assert.equal((await api.call(s, 'dashboard:get')).ok, true);
  // A disabled account loses access immediately.
  await api.call(admin, 'staff:setActive', { id: add.data.id, active: false });
  const after = await api.call(s, 'dashboard:get');
  assert.equal(after.ok, false);
  assert.equal(after.signedOut, true);
});

test('cannot disable yourself or demote the last administrator', async () => {
  const { api } = fresh();
  const admin = await setupAdmin(api);
  assert.equal((await api.call(admin, 'staff:setActive', { id: admin.user.id, active: false })).ok, false);
  assert.equal((await api.call(admin, 'staff:update', { id: admin.user.id, role: 'dentist' })).ok, false);
});

test('check-in needs a running clinic, all registration fields and all medical answers', async () => {
  const { api } = fresh();
  const admin = await setupAdmin(api);
  let r = await api.call(admin, 'visits:checkIn', { registration: REG, medical: answers(), language: 'es' });
  assert.equal(r.ok, false);
  assert.match(r.error, /No clinic is running/);
  await api.call(admin, 'events:create', { name: 'Sololá Dec 2026', trip_code: 'GT-2612', country: 'Guatemala', community: 'San Juan', start_date: '2026-12-14', target_patients: 150 });
  r = await api.call(admin, 'visits:checkIn', { registration: { ...REG, address: '' }, medical: answers(), language: 'es' });
  assert.equal(r.ok, false);
  const med = answers(); delete med.answers.diabetes;
  r = await api.call(admin, 'visits:checkIn', { registration: REG, medical: med, language: 'es' });
  assert.equal(r.ok, false);
  r = await api.call(admin, 'visits:checkIn', { registration: REG, medical: answers({ penicillin_allergy: 'yes', diabetes: 'yes' }), language: 'es' });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.data.queue_number, 1);
  assert.deepEqual(r.data.flags, ['Diabetes', 'Penicillin allergy']);
  assert.equal(r.data.patient.dob, '1990-03-04');
  const r2 = await api.call(admin, 'visits:checkIn', { registration: { ...REG, first_name: 'Luis', sex: 'male' }, medical: (() => { const m = answers(); delete m.answers.pregnant; return m; })(), language: 'es' });
  assert.equal(r2.ok, true, r2.error);
  assert.equal(r2.data.queue_number, 2);
  assert.equal(r2.data.medical.answers.pregnant, 'no');
});

test('full flow: consent gate, guardian for minors, triage, education, two stations, checkout with allergy block', async () => {
  const { api } = fresh();
  const admin = await setupAdmin(api);
  await api.call(admin, 'events:create', { name: 'Clinic A', target_patients: 30 });
  const child = await api.call(admin, 'visits:checkIn', {
    registration: { ...REG, first_name: 'Sofía', dob: '01/01/2016' }, medical: answers({ penicillin_allergy: 'yes', aspirin_allergy: 'yes' }), language: 'es'
  });
  assert.equal(child.ok, true, child.error);
  const id = child.data.id;

  // No care before consent.
  let r = await api.call(admin, 'visits:triage', { id, triage: { route_cleaning: true } });
  assert.equal(r.ok, false);
  assert.match(r.error, /consent/);

  // Minor: guardian relationship required; a tap is not a signature.
  r = await api.call(admin, 'visits:signConsent', { id, consent: { agree: true, signer_name: 'María López', signature: fakeSignature() } });
  assert.equal(r.ok, false);
  assert.match(r.error, /under 18/);
  r = await api.call(admin, 'visits:signConsent', { id, consent: { agree: true, signer_name: 'María López', relationship: 'mother', signature: 'data:image/png;base64,AAAA' } });
  assert.equal(r.ok, false);
  r = await api.call(admin, 'visits:signConsent', { id, consent: { agree: true, signer_name: 'María López', relationship: 'mother', signature: fakeSignature(), read_aloud: true, language: 'es' } });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.data.consent.relationship, 'mother');
  assert.equal(r.data.consent.read_aloud, true);

  // Triage must choose a route.
  r = await api.call(admin, 'visits:triage', { id, triage: {} });
  assert.equal(r.ok, false);
  r = await api.call(admin, 'visits:triage', { id, triage: {
    complaint: 'Pain lower left', bp_sys: 120, bp_dia: 80, route_cleaning: true, route_restorative: true,
    chart: { dentition: 'mixed', teeth: { P19: { marks: ['extraction_needed'], note: 'abscess' }, BAD: { marks: ['caries'] } } }
  } });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.data.status, 'waiting_education');
  assert.deepEqual(Object.keys(r.data.chart.teeth), ['P19']);

  r = await api.call(admin, 'visits:education', { id, education: { topics: ['brushing', 'kit', 'nope'] } });
  assert.equal(r.data.status, 'waiting_treatment');
  assert.deepEqual(r.data.education.topics, ['brushing', 'kit']);

  r = await api.call(admin, 'visits:treatment', { id, station: 'cleaning', data: { procedures: { prophy: true, fluoride: true } }, complete: true });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.data.status, 'waiting_treatment', 'still needs the restorative station');
  r = await api.call(admin, 'visits:treatment', { id, station: 'restorative', data: { extractions: [{ tooth: 'P19', type: 'Simple' }], anesthetic: [{ agent: 'Lidocaine 2% with epinephrine', carpules: 1.5 }] } });
  assert.equal(r.data.status, 'in_treatment');
  r = await api.call(admin, 'visits:treatment', { id, station: 'restorative', data: { extractions: [{ tooth: 'P19', type: 'Simple' }] }, complete: true });
  assert.equal(r.data.status, 'ready_checkout');

  // Amoxicillin is blocked for a penicillin allergy; ibuprofen needs the dentist's confirmation (aspirin allergy).
  r = await api.call(admin, 'visits:checkout', { id, checkout: { prescriptions: [{ id: 'amox500' }] } });
  assert.equal(r.ok, false);
  assert.match(r.error, /Not allowed/);
  r = await api.call(admin, 'visits:checkout', { id, checkout: { prescriptions: [{ id: 'ibu400' }] } });
  assert.equal(r.ok, false);
  assert.match(r.error, /Allergy warning/);
  r = await api.call(admin, 'visits:checkout', { id, checkout: {
    prescriptions: [{ id: 'ibu400' }, { id: 'clinda300', quantity: '28' }], acknowledge_warnings: true,
    aftercare: ['extraction', 'cleaning'], follow_up: { needed: true, reason: 'Check tooth 36 next trip' },
    survey: { rating: 5, helped: 'La amabilidad' }
  } });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.data.status, 'checked_out');
  assert.equal(r.data.checkout.prescriptions[1].instructions.startsWith('Tome'), true, 'Spanish instructions');
  assert.equal(r.data.survey.rating, 5);

  // Checked out = read-only until an admin re-opens it.
  r = await api.call(admin, 'visits:treatment', { id, station: 'cleaning', data: {} });
  assert.equal(r.ok, false);
  r = await api.call(admin, 'visits:reopen', { id });
  assert.equal(r.data.status, 'ready_checkout');
});

test('returning patient: found across clinics, same record, fresh consent; double check-in refused', async () => {
  const { api } = fresh();
  const admin = await setupAdmin(api);
  await api.call(admin, 'events:create', { name: 'Trip 1', start_date: '2025-06-01' });
  const first = await api.call(admin, 'visits:checkIn', { registration: REG, medical: answers(), language: 'es' });
  await api.call(admin, 'events:create', { name: 'Trip 2' });
  const found = await api.call(admin, 'patients:search', { text: 'lopez ana' });
  assert.equal(found.data.length, 1, 'search ignores accents and word order');
  const found2 = await api.call(admin, 'patients:search', { text: 'lópez 04/03/1990' });
  assert.equal(found2.data.length, 1);
  const byPhone = await api.call(admin, 'patients:search', { text: '55551234' });
  assert.equal(byPhone.data.length, 1);
  const pid = found2.data[0].id;
  const again = await api.call(admin, 'visits:checkIn', { patient_id: pid, registration: REG, medical: answers(), language: 'es' });
  assert.equal(again.ok, true, again.error);
  assert.equal(again.data.patient.id, first.data.patient.id);
  assert.equal(again.data.consent_signed, false, 'consent is fresh every visit');
  assert.equal(again.data.previous_visits.length, 1);
  const dup = await api.call(admin, 'visits:checkIn', { patient_id: pid, registration: REG, medical: answers(), language: 'es' });
  assert.equal(dup.ok, false);
  assert.match(dup.error, /already checked in/);
  const matches = await api.call(admin, 'patients:matches', { registration: REG });
  assert.equal(matches.data.length, 1);
});

test('finishing a clinic keeps the records; a clinic with visits cannot be deleted', async () => {
  const { api } = fresh();
  const admin = await setupAdmin(api);
  const ev = await api.call(admin, 'events:create', { name: 'Trip 1' });
  await api.call(admin, 'visits:checkIn', { registration: REG, medical: answers(), language: 'es' });
  assert.equal((await api.call(admin, 'events:delete', { id: ev.data.id })).ok, false);
  const fin = await api.call(admin, 'events:finish', { id: ev.data.id });
  assert.equal(fin.data.status, 'finished');
  assert.equal((await api.call(admin, 'events:active')).data, null);
  assert.equal((await api.call(admin, 'patients:search', { text: 'Ana' })).data.length, 1);
});

test('views and changes are written to the audit log', async () => {
  const { api } = fresh();
  const admin = await setupAdmin(api);
  await api.call(admin, 'events:create', { name: 'Trip 1' });
  const v = await api.call(admin, 'visits:checkIn', { registration: REG, medical: answers(), language: 'es' });
  await api.call(admin, 'visits:get', { id: v.data.id });
  const log = await api.call(admin, 'audit:list', {});
  const actions = log.data.map(r => r.action);
  for (const a of ['setup.first_admin', 'event.create', 'visit.check_in', 'visit.view']) assert.ok(actions.includes(a), a);
});

test('backup writes a complete copy of the database', async () => {
  const { store, api, dir } = fresh();
  const admin = await setupAdmin(api);
  await api.call(admin, 'events:create', { name: 'Trip 1' });
  const dest = path.join(dir, 'copy.db');
  store.backupTo(admin.user, dest);
  const copy = openStore(dest);
  assert.equal(copy.listEvents().length, 1);
  copy.close();
});

test('tooth numbering: FDI and Universal labels', () => {
  const F = require('../src/shared/forms.js');
  assert.equal(F.toothLabel('P1', 'fdi'), '18');
  assert.equal(F.toothLabel('P8', 'fdi'), '11');
  assert.equal(F.toothLabel('P9', 'fdi'), '21');
  assert.equal(F.toothLabel('P19', 'fdi'), '36');
  assert.equal(F.toothLabel('P32', 'fdi'), '48');
  assert.equal(F.toothLabel('P30', 'universal'), '30');
  assert.equal(F.toothLabel('D1', 'fdi'), '55');
  assert.equal(F.toothLabel('D10', 'fdi'), '65');
  assert.equal(F.toothLabel('D11', 'fdi'), '75');
  assert.equal(F.toothLabel('D20', 'fdi'), '85');
  assert.equal(F.toothLabel('D1', 'universal'), 'A');
  assert.equal(F.parseDob('31/02/2000'), null);
  assert.equal(F.parseDob('29/02/2000'), '2000-02-29');
});
