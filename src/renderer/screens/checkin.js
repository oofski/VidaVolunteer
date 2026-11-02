// Check-in: a volunteer enters the patient's details with them, takes the
// medical history and the signed consent, and gives them a queue number.
import { h, mount, call, attempt, toast, field, input, select, checkbox, yesNo, modal, F, emptyState, fullName, fmtDate, readAloudButton } from '../lib.js';
import { consentForm } from '../components.js';

export async function checkin(app, el, params) {
  const ev = app.info.active_event;
  if (!ev) {
    mount(el, h('header', { class: 'page-head' }, h('h1', null, 'Check-in')),
      emptyState('No clinic is running', 'Patients can be checked in once an administrator starts a clinic event.',
        app.user.role === 'admin' ? h('a', { class: 'btn btn-primary', href: '#/events' }, 'Go to Clinic events') : null));
    return;
  }

  const blankReg = () => ({ first_name: '', last_name: '', dob: '', sex: '', phone: '', no_phone: false, address: '', community: ev.community || '', municipality: '', region: '', country: ev.country || '' });
  const s = { step: 0, lang: 'es', patientId: null, reg: blankReg(), medical: { answers: {}, medications: [], allergy_detail: '', reason: '' }, visit: null, errors: {} };

  if (params[0] === 'patient' && params[1]) {
    const data = await attempt(() => call('patients:get', { id: Number(params[1]) }));
    if (data) useExisting(data);
  }

  function useExisting(data) {
    const p = data.patient;
    s.patientId = p.id;
    s.lang = p.language || 'es';
    s.reg = { first_name: p.first_name, last_name: p.last_name, dob: F.formatDob(p.dob), sex: p.sex, phone: p.phone || '', no_phone: !!p.no_phone,
      address: p.address || '', community: p.community || '', municipality: p.municipality || '', region: p.region || '', country: p.country || '' };
    if (data.last_medical) s.medical = { ...data.last_medical, reason: '', answers: { ...data.last_medical.answers } };
    s.step = 1;
  }

  const body = h('div', { class: 'wizard' });
  const steps = ['Start', 'Registration', 'Medical history', 'Consent', 'Done'];
  mount(el, h('header', { class: 'page-head' },
    h('div', null, h('h1', null, 'Check-in'), h('p', { class: 'muted' }, ev.name))), body);

  const L = (en, es) => (s.lang === 'es' ? es : en);

  function stepper() {
    return h('ol', { class: 'stepper' }, steps.map((t, i) => h('li', { class: i === s.step ? 'on' : i < s.step ? 'done' : '' }, h('span', null, String(i + 1)), t)));
  }

  function render() {
    const views = [startView, regView, medView, consentView, doneView];
    mount(body, stepper(), views[s.step]());
    body.scrollIntoView({ block: 'start' });
  }

  // ---- step 0: language + returning patient --------------------------------
  function startView() {
    const results = h('div', { class: 'results' });
    const q = input({ placeholder: 'Name, date of birth, phone or community', autocomplete: 'off' });
    let timer;
    q.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (q.value.trim().length < 2) { results.replaceChildren(); return; }
        const list = await call('patients:search', { text: q.value });
        mount(results, list.length ? list.map(p => h('div', { class: 'result' },
          h('div', null, h('div', { class: 'result-name' }, fullName(p)),
            h('div', { class: 'muted' }, `Born ${F.formatDob(p.dob)} · ${p.community || ''} · ${p.visits} visit(s), last ${p.last_visit ? fmtDate(p.last_visit) : '—'}`)),
          h('button', { class: 'btn btn-primary', onclick: async () => { const d = await attempt(() => call('patients:get', { id: p.id })); if (d) { useExisting(d); render(); } } }, 'Start visit')))
          : h('p', { class: 'muted' }, 'No match. Register them as a new patient.'));
      }, 200);
    });
    setTimeout(() => q.focus(), 50);
    return h('div', { class: 'card' },
      h('h2', null, 'Patient language'),
      h('div', { class: 'lang-pick' }, F.LANGUAGES.map(l => h('button', {
        class: 'lang-btn' + (s.lang === l.code ? ' on' : ''), onclick: () => { s.lang = l.code; render(); }
      }, l.name))),
      h('h2', null, 'Has this patient been to a VIDA clinic before?'),
      field('Search past patients', q), results,
      h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary btn-lg', onclick: () => { s.patientId = null; s.reg = blankReg(); s.step = 1; render(); } }, '+ New patient')));
  }

  // ---- step 1: registration ------------------------------------------------
  function regView() {
    const r = s.reg;
    const e = s.errors;
    const f = (key, attrs = {}) => {
      const def = F.REGISTRATION_FIELDS.find(x => x.key === key);
      const inp = input({ value: r[key] || '', maxlength: def.max || 60, oninput: (ev2) => { r[key] = ev2.target.value; }, ...attrs });
      return field(L(def.en, def.es), inp, { sub: s.lang === 'es' ? def.en : null, error: e[key] });
    };
    const sexDef = F.REGISTRATION_FIELDS.find(x => x.key === 'sex');
    const sexBtns = h('div', { class: 'seg' }, F.SEX_OPTIONS.map(o => h('button', {
      type: 'button', class: 'seg-btn' + (r.sex === o.value ? ' on' : ''), onclick: (ev2) => { r.sex = o.value; for (const b of ev2.currentTarget.parentNode.children) b.classList.toggle('on', b === ev2.currentTarget); }
    }, o[s.lang])));
    const phoneDef = F.REGISTRATION_FIELDS.find(x => x.key === 'phone');
    const phone = input({ value: r.phone, inputmode: 'tel', maxlength: 20, disabled: r.no_phone, oninput: (ev2) => { r.phone = ev2.target.value; } });
    return h('div', { class: 'card' },
      s.patientId ? h('div', { class: 'notice notice-info' }, 'Returning patient — check that these details are still right.') : null,
      h('div', { class: 'grid2' },
        f('first_name', { autocomplete: 'off' }), f('last_name', { autocomplete: 'off' }),
        f('dob', { placeholder: 'DD/MM/YYYY', inputmode: 'numeric' }),
        field(L(sexDef.en, sexDef.es), sexBtns, { sub: s.lang === 'es' ? sexDef.en : null, error: e.sex }),
        field(L(phoneDef.en, phoneDef.es), h('div', { class: 'row' }, phone,
          checkbox(L('No phone', 'Sin teléfono'), r.no_phone, (v) => { r.no_phone = v; phone.disabled = v; if (v) { phone.value = ''; r.phone = ''; } })),
        { sub: s.lang === 'es' ? phoneDef.en : null, error: e.phone }),
        f('address'), f('community'), f('municipality'), f('region'), f('country')),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: () => { s.step = 0; s.errors = {}; render(); } }, 'Back'),
        h('span', { class: 'grow' }),
        h('button', { class: 'btn btn-primary btn-lg', onclick: nextFromReg }, 'Next: medical history →')));
  }

  async function nextFromReg() {
    const v = F.validateRegistration(s.reg);
    s.errors = v.errors;
    if (!v.ok) { render(); toast('Please fill in every field.', 'error'); return; }
    if (!s.patientId) {
      const matches = await call('patients:matches', { registration: s.reg });
      if (matches.length) {
        const choice = await new Promise((resolve) => {
          let picked = false;
          modal({
            title: 'This may be a returning patient',
            body: h('div', { class: 'stack' }, h('p', null, 'A patient with the same name is already on file:'),
              matches.map(m => h('div', { class: 'result' }, h('div', null, h('div', { class: 'result-name' }, fullName(m)),
                h('div', { class: 'muted' }, `Born ${F.formatDob(m.dob)} · ${m.community || ''} · phone ${m.phone || 'none'}`)),
                h('button', { class: 'btn btn-primary', onclick: (e) => { picked = true; resolve(m.id); e.target.closest('.modal-backdrop').remove(); } }, 'Same person')))),
            onClose: () => { if (!picked) resolve(null); },
            actions: [{ label: 'No, a different person', onclick: () => { picked = true; resolve(null); } }]
          });
        });
        if (choice) {
          const d = await attempt(() => call('patients:get', { id: choice }));
          if (d) { const keepReg = s.reg; useExisting(d); s.reg = keepReg; }
        }
      }
    }
    s.step = 2; s.errors = {}; render();
  }

  // ---- step 2: medical history --------------------------------------------
  function medView() {
    const m = s.medical;
    const e = s.errors;
    const questions = F.medicalQuestionsFor(s.reg.sex);
    const allergyRow = h('div', { hidden: m.answers.other_allergies !== 'yes' },
      field(L('Which allergies?', '¿Cuáles alergias?'), input({ value: m.allergy_detail || '', maxlength: 200, oninput: (ev2) => { m.allergy_detail = ev2.target.value; } }), { error: e.allergy_detail }));
    const medsRow = h('div', { hidden: m.answers.takes_medications !== 'yes' }, medicationPicker());
    const q = (def) => h('div', { class: 'q' + (e[def.key] ? ' q-error' : '') + (def.flag ? ' q-flag' : '') },
      h('div', { class: 'q-text' }, h('div', null, def[s.lang]), s.lang === 'es' ? h('div', { class: 'q-sub' }, def.en) : null),
      h('div', { class: 'q-tools' }, readAloudButton(() => def[s.lang], s.lang)),
      yesNo(m.answers[def.key], (v) => {
        m.answers[def.key] = v;
        if (def.key === 'other_allergies') allergyRow.hidden = v !== 'yes';
        if (def.key === 'takes_medications') medsRow.hidden = v !== 'yes';
      }, { yes: L('Yes', 'Sí'), no: 'No' }));
    return h('div', { class: 'card' },
      h('h2', null, L('Medical history', 'Historia médica')),
      h('p', { class: 'muted' }, 'Ask every question. Questions marked with a red edge are warning conditions for the dentist.'),
      h('div', { class: 'questions' }, questions.map(q)),
      allergyRow, medsRow,
      h('h2', null, L('Dental history', 'Historia dental')),
      h('div', { class: 'questions' }, F.DENTAL_QUESTIONS.map(q)),
      field(L('What brings you in today?', '¿Por qué viene hoy?'), h('textarea', { rows: 2, maxlength: 300, oninput: (ev2) => { m.reason = ev2.target.value; } }, m.reason || ''), { sub: s.lang === 'es' ? 'Reason for the visit' : null }),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: () => { s.step = 1; s.errors = {}; render(); } }, 'Back'),
        h('span', { class: 'grow' }),
        h('button', { class: 'btn btn-primary btn-lg', onclick: () => {
          const v = F.validateMedical(m, s.reg.sex);
          s.errors = v.errors;
          if (!v.ok) { render(); toast('Every question needs an answer.', 'error'); return; }
          s.step = 3; render();
        } }, 'Next: consent →')));
  }

  function medicationPicker() {
    const m = s.medical;
    const chosen = h('div', { class: 'chips' });
    const listEl = h('div', { class: 'chips chips-pick' });
    const search = input({ placeholder: L('Search medications', 'Buscar medicamento'), autocomplete: 'off' });
    const other = input({ placeholder: L('Not on the list? Type it and press Add', 'Otro medicamento'), maxlength: 80 });
    const draw = () => {
      mount(chosen, m.medications.length ? m.medications.map(x => h('button', { type: 'button', class: 'chip on', onclick: () => { m.medications = m.medications.filter(y => y !== x); draw(); } }, x, ' ✕')) : h('span', { class: 'muted' }, 'None picked yet.'));
      const term = search.value.trim().toLowerCase();
      const all = app.settings.medications.filter(x => !m.medications.includes(x) && (!term || x.toLowerCase().includes(term)));
      mount(listEl, all.slice(0, 40).map(x => h('button', { type: 'button', class: 'chip', onclick: () => { m.medications.push(x); draw(); } }, '+ ' + x)));
    };
    search.addEventListener('input', draw);
    draw();
    return h('div', { class: 'card card-soft' + (s.errors.medications ? ' q-error' : '') },
      h('h3', null, L('Medications', 'Medicamentos')), chosen, field('', search), listEl,
      h('div', { class: 'row' }, other, h('button', { type: 'button', class: 'btn', onclick: () => { const v = other.value.trim(); if (v && !m.medications.includes(v)) { m.medications.push(v); other.value = ''; draw(); } } }, 'Add')),
      s.errors.medications ? h('div', { class: 'field-msg' }, s.errors.medications) : null);
  }

  // ---- step 3: consent ------------------------------------------------------
  function consentView() {
    const age = F.ageOn(F.parseDob(s.reg.dob));
    const form = consentForm({ patientName: `${s.reg.first_name} ${s.reg.last_name}`.trim(), age, lang: s.lang, staffName: app.user.name });
    const saveBtn = h('button', { class: 'btn btn-primary btn-lg' }, 'Sign and check in');
    saveBtn.addEventListener('click', async () => {
      let consent;
      try { consent = form.collect(); } catch (e) { toast(e.message, 'error'); return; }
      saveBtn.disabled = true;
      try { await submit(consent); } finally { saveBtn.disabled = false; }
    });
    return h('div', { class: 'card' }, form.el,
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: () => { form.destroy(); s.step = 2; render(); } }, 'Back'),
        h('span', { class: 'grow' }),
        h('button', { class: 'btn btn-ghost', onclick: async () => {
          const ok = await new Promise(res => modal({ title: 'Check in without consent?', body: h('p', null, 'The patient gets a number, but no dentist can see them until the consent is signed. Use this only if the consent will be taken at the next station.'),
            onClose: () => res(false), actions: [{ label: 'Cancel', onclick: () => res(false) }, { label: 'Check in, sign later', kind: 'primary', onclick: () => res(true) }] }));
          if (ok) await submit(null);
        } }, 'Sign later'),
        saveBtn));
  }

  async function submit(consent) {
    if (!s.visit) {
      try {
        s.visit = await call('visits:checkIn', { patient_id: s.patientId, registration: s.reg, medical: s.medical, language: s.lang });
      } catch (e) { toast(e.message, 'error'); return; }
    }
    if (consent) {
      try { s.visit = await call('visits:signConsent', { id: s.visit.id, consent }); }
      catch (e) { toast('Checked in, but the consent was not saved: ' + e.message, 'error'); return; }
    }
    s.step = 4; render();
  }

  // ---- step 4: done ---------------------------------------------------------
  function doneView() {
    const v = s.visit;
    return h('div', { class: 'card done-card' },
      h('div', { class: 'done-label' }, L('Your number', 'Su número')),
      h('div', { class: 'done-number' }, String(v.queue_number)),
      h('div', { class: 'done-name' }, fullName(v.patient)),
      v.consent_signed ? h('p', { class: 'ok-text' }, '✓ Consent signed') : h('p', { class: 'warn-text' }, 'Consent not signed yet — take it before the dentist sees them.'),
      v.flags.length ? h('div', { class: 'notice notice-danger' }, 'Warnings for the dentist: ' + v.flags.join(', ')) : null,
      h('p', { class: 'muted' }, L('Please wait to be called for triage.', 'Por favor espere a que lo llamen para la evaluación.')),
      h('div', { class: 'actions center' },
        h('button', { class: 'btn btn-primary btn-lg', onclick: () => {
          const lang = s.lang;
          Object.assign(s, { step: 0, patientId: null, reg: blankReg(), medical: { answers: {}, medications: [], allergy_detail: '', reason: '' }, visit: null, errors: {}, lang });
          if (location.hash !== '#/checkin') location.hash = '#/checkin'; else render();
        } }, 'Check in the next patient')));
  }

  render();
}
