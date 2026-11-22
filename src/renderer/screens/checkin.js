// Registration: a volunteer enters the patient's details with them, takes
// the medical history and the signed consent, and gives them a queue number.
//
// #/register/practice runs the same screens with an example patient and the
// guided walkthrough. Nothing is saved in practice.
import { h, add, mount, call, attempt, toast, field, input, checkbox, yesNo, modal, F, emptyState, fullName, fmtDate, readAloudButton } from '../lib.js';
import { icon } from '../icons.js';
import { consentForm } from '../components.js';
import { runTour } from '../tour.js';

const STEPS = [
  { title: 'Language & search', tip: 'Choose the patient’s language, then search. Returning patients keep their history and follow-ups, so always search before registering someone new.' },
  { title: 'Patient details', tip: 'Fill in every field together with the patient. Date of birth is day/month/year. Tick “No phone” if they have none.' },
  { title: 'Medical history', tip: 'Read each question aloud and tap Sí or No. A red edge marks a warning the dentist must see. If they take medicines, pick them from the list.' },
  { title: 'Consent & signature', tip: 'Read the consent aloud in the patient’s language. The patient signs with a finger or the mouse. Under 18, a parent or guardian signs.' },
  { title: 'Queue number', tip: 'Give the patient their number. They wait to be called for triage.' }
];

const PRACTICE_PATIENT = {
  first_name: 'Rosa', last_name: 'Ejemplo Práctica', dob: '14/08/1979', sex: 'female', phone: '5500-0000', no_phone: false,
  address: 'Calle de práctica 1', community: 'Comunidad Ejemplo', municipality: 'Municipio Ejemplo', region: 'Departamento Ejemplo', country: 'Guatemala'
};

export async function checkin(app, el, params) {
  const practice = params[0] === 'practice';
  const ev = app.info.active_event;
  if (!ev && !practice) {
    mount(el, pageHead(false),
      emptyState('No clinic is running', 'Patients can be registered once an administrator starts a clinic event. You can still practise.',
        h('div', { class: 'actions' },
          app.user.role === 'admin' ? h('a', { class: 'btn btn-primary', href: '#/events' }, 'Go to Clinic events', icon('arrowRight', 16)) : null,
          h('button', { class: 'btn btn-tertiary', onclick: () => app.startRegistrationTraining() }, 'Practise registration', icon('play', 16)))));
    return;
  }

  const eventCommunity = ev ? ev.community : '';
  const eventCountry = ev ? ev.country : 'Guatemala';
  const blankReg = () => ({ first_name: '', last_name: '', dob: '', sex: '', phone: '', no_phone: false, address: '', community: eventCommunity || '', municipality: '', region: '', country: eventCountry || '' });
  const blankMed = () => ({ answers: {}, medications: [], allergy_detail: '', reason: '' });
  const s = { step: 0, lang: 'es', patientId: null, reg: blankReg(), medical: blankMed(), visit: null, errors: {} };

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

  function pageHead() {
    return h('header', { class: 'page-head' },
      h('div', null,
        h('div', { class: 'eyebrow' }, practice ? 'Training · practice mode' : (ev ? ev.name : 'Registration')),
        h('h1', null, practice ? 'Practise registering a patient' : 'Registration')),
      practice
        ? h('a', { class: 'btn btn-tertiary', href: '#/register' }, 'Leave practice', icon('close', 16))
        : h('button', { class: 'btn btn-ghost', onclick: () => app.startRegistrationTraining() }, 'Show me how', icon('help', 16)));
  }

  const main = h('div', { class: 'wizard' });
  const aside = h('aside', { class: 'wizard-aside' });
  mount(el, pageHead(), h('div', { class: 'wizard-layout' }, main, aside));

  const L = (en, es) => (s.lang === 'es' ? es : en);

  function drawAside() {
    mount(aside,
      practice ? h('div', { class: 'practice-badge' }, h('b', null, 'Practice'), 'Example patient. Nothing you enter here is saved.') : null,
      h('ol', { class: 'steps-v', 'aria-label': 'Registration steps' }, STEPS.map((st, i) => h('li', { class: i === s.step ? 'on' : i < s.step ? 'done' : '' },
        h('span', { class: 'n' }, i < s.step ? icon('check', 14) : String(i + 1)), st.title))),
      h('div', { class: 'tip' }, h('div', { class: 'eyebrow' }, icon('idea', 14), 'How to'), h('p', null, STEPS[s.step].tip)),
      s.patientId ? h('div', { class: 'notice notice-info' }, icon('info', 20), h('div', null, 'Returning patient — their last medical history is filled in. Check every answer again.')) : null);
  }

  function render() {
    const views = [startView, regView, medView, consentView, doneView];
    mount(main, views[s.step]());
    drawAside();
    el.closest('.content')?.scrollTo({ top: 0 });
  }

  // ---- step 1: language + returning patient ---------------------------------
  function startView() {
    const results = h('div', { class: 'results' });
    const q = input({ type: 'search', placeholder: 'Name, date of birth, phone or community', autocomplete: 'off' });
    let timer;
    q.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (q.value.trim().length < 2) { results.replaceChildren(); return; }
        if (practice) { mount(results, h('p', { class: 'muted', style: { padding: '12px 16px' } }, 'In practice, search finds nobody. Press New patient.')); return; }
        const list = await call('patients:search', { text: q.value });
        mount(results, list.length ? list.map(p => h('div', { class: 'result' },
          h('div', null, h('div', { class: 'result-name' }, fullName(p)),
            h('div', { class: 'muted' }, `Born ${F.formatDob(p.dob)} · ${p.community || ''} · ${p.visits} visit(s), last ${p.last_visit ? fmtDate(p.last_visit) : '—'}`)),
          h('button', { class: 'btn btn-primary btn-sm', onclick: async () => { const d = await attempt(() => call('patients:get', { id: p.id })); if (d) { useExisting(d); render(); } } }, 'Start visit', icon('arrowRight', 16))))
          : h('p', { class: 'muted', style: { padding: '12px 16px' } }, 'No match. Register them as a new patient.'));
      }, 200);
    });
    if (!practice) setTimeout(() => q.focus(), 50);
    return h('div', { class: 'card' },
      h('h2', null, 'Patient language'),
      h('div', { class: 'lang-pick', dataset: { tour: 'lang' } }, F.LANGUAGES.map(l => h('button', {
        class: 'lang-btn' + (s.lang === l.code ? ' on' : ''), onclick: () => { s.lang = l.code; render(); }
      }, l.name, h('span', null, l.code === 'es' ? 'Spanish' : 'Inglés')))),
      h('h2', null, 'Has this patient been to a VIDA clinic before?'),
      h('div', { dataset: { tour: 'search' } }, field('Search past patients', q), results),
      h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary btn-lg', dataset: { tour: 'new' }, onclick: () => {
        s.patientId = null; s.reg = practice ? { ...PRACTICE_PATIENT } : blankReg(); s.step = 1; render();
      } }, 'New patient', icon('add', 16))));
  }

  // ---- step 2: registration -------------------------------------------------
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
    const dob = f('dob', { placeholder: 'DD/MM/YYYY', inputmode: 'numeric' });
    dob.dataset.tour = 'dob';
    return h('div', { class: 'card' },
      h('h2', null, L('Patient details', 'Datos del paciente')),
      h('div', { class: 'grid2', dataset: { tour: 'reg-form' } },
        f('first_name', { autocomplete: 'off' }), f('last_name', { autocomplete: 'off' }),
        dob,
        field(L(sexDef.en, sexDef.es), sexBtns, { sub: s.lang === 'es' ? sexDef.en : null, error: e.sex }),
        field(L(phoneDef.en, phoneDef.es), h('div', { class: 'row' }, phone,
          checkbox(L('No phone', 'Sin teléfono'), r.no_phone, (v) => { r.no_phone = v; phone.disabled = v; if (v) { phone.value = ''; r.phone = ''; } })),
        { sub: s.lang === 'es' ? phoneDef.en : null, error: e.phone }),
        f('address'), f('community'), f('municipality'), f('region'), f('country')),
      h('div', { class: 'actions' },
        h('button', { class: 'btn btn-tertiary', onclick: () => { s.step = 0; s.errors = {}; render(); } }, icon('arrowLeft', 16), 'Back'),
        h('span', { class: 'grow' }),
        h('button', { class: 'btn btn-primary btn-lg', dataset: { tour: 'reg-next' }, onclick: nextFromReg }, 'Next: medical history', icon('arrowRight', 16))));
  }

  async function nextFromReg() {
    const v = F.validateRegistration(s.reg);
    s.errors = v.errors;
    if (!v.ok) { render(); toast('Please fill in every field.', 'error'); return; }
    if (!s.patientId && !practice) {
      const matches = await call('patients:matches', { registration: s.reg });
      if (matches.length) {
        const choice = await new Promise((resolve) => {
          let picked = false;
          const dlg = modal({
            title: 'This may be a returning patient',
            body: h('div', { class: 'stack' }, h('p', null, 'A patient with the same name is already on file:'),
              matches.map(m => h('div', { class: 'result' }, h('div', null, h('div', { class: 'result-name' }, fullName(m)),
                h('div', { class: 'muted' }, `Born ${F.formatDob(m.dob)} · ${m.community || ''} · phone ${m.phone || 'none'}`)),
                h('button', { class: 'btn btn-primary btn-sm', onclick: () => { picked = true; resolve(m.id); dlg.close(); } }, 'Same person')))),
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
    if (practice && !Object.keys(s.medical.answers).length) {
      // Practice: every answer but the first is filled in, so the trainee answers one.
      for (const q of F.medicalQuestionsFor(s.reg.sex).slice(1)) s.medical.answers[q.key] = 'no';
      for (const q of F.DENTAL_QUESTIONS) s.medical.answers[q.key] = 'no';
      s.medical.reason = 'Dolor de muela';
    }
    s.step = 2; s.errors = {}; render();
  }

  // ---- step 3: medical history ---------------------------------------------
  function medView() {
    const m = s.medical;
    const e = s.errors;
    const questions = F.medicalQuestionsFor(s.reg.sex);
    const allergyRow = h('div', { hidden: m.answers.other_allergies !== 'yes' },
      field(L('Which allergies?', '¿Cuáles alergias?'), input({ value: m.allergy_detail || '', maxlength: 200, oninput: (ev2) => { m.allergy_detail = ev2.target.value; } }), { error: e.allergy_detail }));
    const medsRow = h('div', { hidden: m.answers.takes_medications !== 'yes' }, medicationPicker());
    const q = (def, i) => h('div', { class: 'q' + (e[def.key] ? ' q-error' : '') + (def.flag ? ' q-flag' : ''), dataset: i === 0 ? { tour: 'q-first' } : undefined },
      h('div', { class: 'q-text' }, h('div', null, def[s.lang]), s.lang === 'es' ? h('div', { class: 'q-sub' }, def.en) : null),
      readAloudButton(() => def[s.lang], s.lang, true),
      yesNo(m.answers[def.key], (v) => {
        m.answers[def.key] = v;
        if (def.key === 'other_allergies') allergyRow.hidden = v !== 'yes';
        if (def.key === 'takes_medications') medsRow.hidden = v !== 'yes';
      }, { yes: L('Yes', 'Sí'), no: 'No' }));
    return h('div', { class: 'card' },
      h('h2', null, L('Medical history', 'Historia médica')),
      h('p', { class: 'muted' }, 'Ask every question. A red edge marks a warning condition for the dentist.'),
      h('div', { class: 'questions' }, questions.map(q)),
      allergyRow, medsRow,
      h('h2', null, L('Dental history', 'Historia dental')),
      h('div', { class: 'questions' }, F.DENTAL_QUESTIONS.map((d) => q(d, -1))),
      field(L('What brings you in today?', '¿Por qué viene hoy?'), h('textarea', { rows: 2, maxlength: 300, oninput: (ev2) => { m.reason = ev2.target.value; } }, m.reason || ''), { sub: s.lang === 'es' ? 'Reason for the visit' : null }),
      h('div', { class: 'actions' },
        h('button', { class: 'btn btn-tertiary', onclick: () => { s.step = 1; s.errors = {}; render(); } }, icon('arrowLeft', 16), 'Back'),
        h('span', { class: 'grow' }),
        h('button', { class: 'btn btn-primary btn-lg', dataset: { tour: 'med-next' }, onclick: () => {
          const v = F.validateMedical(m, s.reg.sex);
          s.errors = v.errors;
          if (!v.ok) { render(); toast('Every question needs an answer.', 'error'); return; }
          s.step = 3; render();
        } }, 'Next: consent', icon('arrowRight', 16))));
  }

  function medicationPicker() {
    const m = s.medical;
    const chosen = h('div', { class: 'chips' });
    const listEl = h('div', { class: 'chips chips-pick' });
    const search = input({ type: 'search', placeholder: L('Search medications', 'Buscar medicamento'), autocomplete: 'off' });
    const other = input({ placeholder: L('Not on the list? Type it and press Add', 'Otro medicamento'), maxlength: 80 });
    const draw = () => {
      mount(chosen, m.medications.length ? m.medications.map(x => h('button', { type: 'button', class: 'chip on', onclick: () => { m.medications = m.medications.filter(y => y !== x); draw(); } }, x, '  ×')) : h('span', { class: 'muted' }, 'None picked yet.'));
      const term = search.value.trim().toLowerCase();
      const all = app.settings.medications.filter(x => !m.medications.includes(x) && (!term || x.toLowerCase().includes(term)));
      mount(listEl, all.slice(0, 40).map(x => h('button', { type: 'button', class: 'chip', onclick: () => { m.medications.push(x); draw(); } }, '+ ' + x)));
    };
    search.addEventListener('input', draw);
    draw();
    return h('div', { class: 'card card-soft' + (s.errors.medications ? ' q-error' : '') },
      h('h3', null, L('Medications', 'Medicamentos')), chosen, search, listEl,
      h('div', { class: 'row' }, other, h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { const v = other.value.trim(); if (v && !m.medications.includes(v)) { m.medications.push(v); other.value = ''; draw(); } } }, 'Add', icon('add', 16))),
      s.errors.medications ? h('div', { class: 'field-msg' }, s.errors.medications) : null);
  }

  // ---- step 4: consent ------------------------------------------------------
  function consentView() {
    const age = F.ageOn(F.parseDob(s.reg.dob));
    const form = consentForm({ patientName: `${s.reg.first_name} ${s.reg.last_name}`.trim(), age, lang: s.lang, staffName: app.user.name });
    const saveBtn = h('button', { class: 'btn btn-primary btn-lg', dataset: { tour: 'submit' } }, 'Sign and register', icon('checkmark', 16));
    saveBtn.addEventListener('click', async () => {
      let consent;
      try { consent = form.collect(); } catch (e) { toast(e.message, 'error'); return; }
      saveBtn.disabled = true;
      try { await submit(consent); } finally { saveBtn.disabled = false; }
    });
    return h('div', { class: 'card' }, form.el,
      h('div', { class: 'actions' },
        h('button', { class: 'btn btn-tertiary', onclick: () => { form.destroy(); s.step = 2; render(); } }, icon('arrowLeft', 16), 'Back'),
        h('span', { class: 'grow' }),
        practice ? null : h('button', { class: 'btn btn-ghost', onclick: async () => {
          const ok = await new Promise(res => modal({ title: 'Register without consent?', body: h('p', null, 'The patient gets a number, but no dentist can see them until the consent is signed. Use this only if the consent will be taken at the next station.'),
            onClose: () => res(false), actions: [{ label: 'Cancel', onclick: () => res(false) }, { label: 'Register, sign later', kind: 'primary', onclick: () => res(true) }] }));
          if (ok) await submit(null);
        } }, 'Sign later'),
        saveBtn));
  }

  async function submit(consent) {
    if (practice) {
      s.visit = { queue_number: 'P1', patient: { first_name: s.reg.first_name, last_name: s.reg.last_name }, consent_signed: !!consent, flags: F.flagsFor(s.medical), practice: true };
      s.step = 4; render();
      return;
    }
    if (!s.visit) {
      try {
        s.visit = await call('visits:checkIn', { patient_id: s.patientId, registration: s.reg, medical: s.medical, language: s.lang });
      } catch (e) { toast(e.message, 'error'); return; }
    } else {
      // Already registered (an earlier consent save failed). Keep any
      // corrections made to the medical history since then.
      try { s.visit = await call('visits:updateMedical', { id: s.visit.id, medical: s.medical }); }
      catch (e) { toast(e.message, 'error'); return; }
    }
    if (consent) {
      try { s.visit = await call('visits:signConsent', { id: s.visit.id, consent }); }
      catch (e) { toast('Registered, but the consent was not saved: ' + e.message, 'error'); return; }
    }
    s.step = 4; render();
  }

  // ---- step 5: done -----------------------------------------------------------
  function doneView() {
    const v = s.visit;
    return h('div', null,
      v.practice ? h('div', { class: 'notice notice-ok' }, icon('checkFilled', 20), h('div', null, h('b', null, 'Practice complete. '), 'Nothing was saved. You are ready to register real patients.')) : null,
      h('div', { class: 'card done-card' },
        h('div', { class: 'done-ticket', dataset: { tour: 'number' } },
          h('div', { class: 'done-label' }, L('Your number', 'Su número')),
          h('div', { class: 'done-number' }, String(v.queue_number))),
        h('div', null,
          h('div', { class: 'done-name' }, fullName(v.patient)),
          v.consent_signed ? h('p', { class: 'ok-text' }, icon('checkFilled', 16), 'Consent signed') : h('p', { class: 'warn-text' }, 'Consent not signed yet — take it before the dentist sees them.'),
          v.flags.length ? h('div', { class: 'notice notice-danger' }, icon('warningFilled', 20), h('div', null, h('b', null, 'Warnings for the dentist: '), v.flags.join(', '))) : null,
          h('p', { class: 'muted' }, L('Please wait to be called for triage.', 'Por favor espere a que lo llamen para la evaluación.')),
          h('div', { class: 'actions' },
            v.practice
              ? h('a', { class: 'btn btn-primary btn-lg', href: '#/register' }, 'Register a real patient', icon('arrowRight', 16))
              : h('button', { class: 'btn btn-primary btn-lg', onclick: () => {
                const lang = s.lang;
                Object.assign(s, { step: 0, patientId: null, reg: blankReg(), medical: blankMed(), visit: null, errors: {}, lang });
                if (location.hash !== '#/register') location.hash = '#/register'; else render();
              } }, 'Register the next patient', icon('add', 16))))));
  }

  render();
  if (practice) startTour(app);
}

// ---- the guided walkthrough for registration ---------------------------------------
function startTour(app) {
  const q = (sel) => () => document.querySelector(sel);
  setTimeout(() => runTour([
    { target: '[data-tour=lang]', title: 'Pick the patient’s language',
      body: 'Spanish or English. The questions, consent and after-care all follow this choice. Staff screens stay in English.' },
    { target: '[data-tour=search]', title: 'Always search first',
      body: 'Returning patients keep their history and follow-ups. Type a name, birth date or phone. If they are found, press Start visit on their row.' },
    { target: '[data-tour=new]', do: 'click', title: 'New patient',
      body: 'Nobody found? Register them as new.' },
    { target: '[data-tour=reg-form]', title: 'Fill in every field with the patient',
      body: 'We filled in an example patient for this practice. Every field is required. Tick “Sin teléfono” if they have no phone.' },
    { target: '[data-tour=dob]', title: 'Date of birth',
      body: 'Day / month / year, for example 14/08/1979. The age is worked out for you, and patients under 18 need a guardian to sign.' },
    { target: '[data-tour=reg-next]', do: 'click', title: 'Next: medical history', body: 'When every field is filled in, move on.' },
    { target: '[data-tour=q-first]', until: () => document.querySelector('[data-tour=q-first] .yesno-btn.on'),
      doText: 'Tap Sí or No to answer this question.',
      title: 'Ask every question',
      body: 'Read it to the patient, or press the speaker to have the laptop read it. A red edge marks a warning the dentist must see. For practice, the other questions are already answered.' },
    { target: '[data-tour=med-next]', do: 'click', title: 'Next: consent', body: 'Every question must have an answer before you can continue.' },
    { target: '.consent-head', title: 'Read the consent aloud',
      body: 'Switch language here if needed. Press “Leer en voz alta” to have the laptop read it, or read it yourself.' },
    { target: '.consent-checks', until: () => [...document.querySelectorAll('.consent-checks input')].every(c => c.checked),
      doText: 'Tick both boxes.', title: 'Confirm it was read and agreed',
      body: 'The first box records that you read it aloud. The second is the patient agreeing.' },
    { target: '.sig', until: () => document.querySelector('.sig-status.ok'),
      doText: 'Draw a signature, or press “Crear firma con el nombre”.', title: 'Signature',
      body: 'The patient signs with a finger or the mouse. A tap is not enough. If they cannot sign, the button writes their typed name as the signature.' },
    { target: '[data-tour=submit]', do: 'click', title: 'Sign and register', body: 'This saves the patient and gives them a queue number. (In practice, nothing is saved.)' },
    { target: '[data-tour=number]', title: 'Give the patient their number',
      body: 'They wait to be called for triage with this number. Any warnings you recorded are shown to the dentist. That is the whole registration!' }
  ], {
    onFinish: () => { app.trainingDone('registration'); toast('Walkthrough complete. You can replay it any time from the ? button.', 'ok'); },
    onExit: () => { app.trainingDone('registration'); }
  }), 350);
}
