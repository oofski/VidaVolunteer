// Checkout: recap of the visit, after-care instructions in the patient's
// language, prescriptions from the on-site pharmacy (with allergy checks),
// follow-up for the next trip, and the end-of-visit survey.
import { h, add, mount, call, attempt, field, input, select, checkbox, F, toast, readAloudButton, confirmBox, modal } from '../lib.js';
import { station, stationEmpty } from './station.js';
import { patientHeader, treatmentLine, chartSummary, takeConsentDialog } from '../components.js';

export async function checkout(app, el, params) {
  await station(app, el, params, {
    route: 'checkout', title: 'Checkout', subtitle: 'Recap, after-care, prescriptions and survey.',
    sections: (all) => [
      { title: 'Ready for checkout', items: all.filter(v => v.status === 'ready_checkout') },
      { title: 'Still in the clinic', items: all.filter(v => ['waiting_triage', 'waiting_education', 'waiting_treatment', 'in_treatment'].includes(v.status)), folded: true, note: 'Open one only if the patient is leaving early.' },
      { title: 'Checked out today', items: all.filter(v => v.status === 'checked_out' || v.status === 'left').reverse(), folded: true }
    ],
    empty: () => stationEmpty('Pick a patient who is ready to go home.'),
    open: (v, panel, reload) => openCheckout(app, v, panel, reload)
  });
}

function suggestedAftercare(v) {
  const keys = new Set();
  const t = v.treatment || {};
  if (t.restorative?.extractions?.length) keys.add('extraction');
  if (t.restorative?.fillings?.length) keys.add('filling');
  if (t.cleaning && (t.cleaning.procedures?.prophy || t.cleaning.procedures?.fluoride || t.cleaning.procedures?.scaling)) keys.add('cleaning');
  if (t.cleaning?.sealants?.length) keys.add('sealant');
  return keys;
}

function openCheckout(app, v, panel, reload) {
  const numbering = app.settings.tooth_numbering;
  const lang = v.language || 'es';
  const L = (en, es) => (lang === 'es' ? es : en);
  const prev = v.checkout || {};
  const aftercare = new Set(prev.aftercare || suggestedAftercare(v));
  const rx = (prev.prescriptions || []).map(p => ({ ...p }));
  const follow = { needed: !!prev.follow_up?.needed, reason: prev.follow_up?.reason || '' };
  const survey = { rating: v.survey?.rating || null, helped: v.survey?.helped || '' };
  let notes = prev.notes || '';
  let acknowledged = false;

  // ---- after-care
  const careBox = h('div');
  function drawCare() {
    const keys = [...aftercare];
    const text = keys.map(k => F.AFTERCARE[k].title[lang] + '. ' + F.AFTERCARE[k][lang].join(' ')).join(' ');
    mount(careBox,
      h('div', { class: 'check-grid' }, Object.keys(F.AFTERCARE).map(k => checkbox(F.AFTERCARE[k].title.en, aftercare.has(k), (x) => { x ? aftercare.add(k) : aftercare.delete(k); drawCare(); }))),
      keys.length ? h('div', { class: 'patient-text' },
        h('div', { class: 'row' }, h('span', { class: 'grow' }), readAloudButton(() => text, lang)),
        keys.map(k => h('div', null, h('h4', null, F.AFTERCARE[k].title[lang]), h('ul', null, F.AFTERCARE[k][lang].map(li => h('li', null, li)))))) : null);
  }
  drawCare();

  // ---- prescriptions
  const rxBox = h('div');
  const warnBox = h('div');
  async function checkRx() {
    const res = await call('visits:prescriptionCheck', { id: v.id, items: rx.map(r => ({ id: r.id })) }).catch(() => ({ warnings: [], blocks: [] }));
    mount(warnBox,
      res.blocks.map(b => h('div', { class: 'notice notice-danger' }, '⛔ Not allowed — ' + b)),
      res.warnings.length ? h('div', { class: 'notice notice-warn' }, '⚠ ' + res.warnings.join(' '),
        h('div', null, checkbox('Dentist confirmed this is safe', acknowledged, (x) => { acknowledged = x; }))) : null);
  }
  function drawRx() {
    const pharmacy = app.settings.pharmacy;
    mount(rxBox,
      rx.map((r, i) => h('div', { class: 'rx' },
        h('div', { class: 'rx-name' }, r.name),
        h('div', { class: 'row' },
          field('Quantity', input({ value: r.quantity || '', maxlength: 30, class: 'num-input', oninput: (e) => { r.quantity = e.target.value; } })),
          field(L('Instructions (English)', 'Instrucciones (español)'), input({ value: r.instructions, maxlength: 300, oninput: (e) => { r.instructions = e.target.value; } }), { wide: true }),
          h('button', { class: 'icon-btn', 'aria-label': 'Remove', onclick: () => { rx.splice(i, 1); drawRx(); } }, '✕')))),
      h('div', { class: 'row' },
        select([{ value: '', label: '+ Add from the pharmacy…' }].concat(pharmacy.map(p => ({ value: p.id, label: p.name }))), '', {
          onchange: (e) => {
            const p = pharmacy.find(x => x.id === e.target.value);
            if (p) { rx.push({ id: p.id, name: p.name, quantity: '', instructions: p[lang] || p.en }); drawRx(); }
          }
        })));
    checkRx();
  }
  drawRx();

  // ---- survey (patient-facing)
  const surveyBox = h('div');
  function drawSurvey() {
    mount(surveyBox,
      h('div', { class: 'row' }, h('div', { class: 'survey-q grow' }, F.SURVEY.rating[lang]), readAloudButton(() => F.SURVEY.rating[lang] + ' ' + F.SURVEY.helped[lang], lang)),
      h('div', { class: 'rating' }, [1, 2, 3, 4, 5].map(n => h('button', {
        type: 'button', class: 'rate' + (survey.rating === n ? ' on' : ''), onclick: () => { survey.rating = survey.rating === n ? null : n; drawSurvey(); }
      }, h('span', { class: 'rate-face' }, ['☹', '\u{1F641}', '\u{1F610}', '\u{1F642}', '\u{1F600}'][n - 1]), h('span', null, F.SURVEY.ratingLabels[lang][n - 1])))),
      h('div', { class: 'survey-q' }, F.SURVEY.helped[lang]),
      h('textarea', { rows: 2, maxlength: 1000, oninput: (e) => { survey.helped = e.target.value; } }, survey.helped));
  }
  drawSurvey();

  const t = v.treatment || {};
  const recap = h('div', { class: 'stack-sm' },
    v.triage?.complaint ? h('div', null, h('b', null, 'Came in for: '), v.triage.complaint) : null,
    treatmentLine(t, numbering) || h('div', { class: 'muted' }, v.triage?.exam_only ? 'Exam only.' : 'No treatment recorded.'),
    t.restorative?.anesthetic?.length ? h('div', null, h('b', null, 'Anesthetic: '), t.restorative.anesthetic.map(a => `${a.agent} × ${a.carpules}`).join(', ')) : null,
    v.education?.topics?.length ? h('div', null, h('b', null, 'Education: '), v.education.topics.map(k => F.EDUCATION_TOPICS.find(x => x.key === k)?.label).join(', ')) : null,
    h('h4', null, 'Teeth marked'), chartSummary(v.chart, numbering),
    [t.cleaning?.provider, t.restorative?.provider].filter(Boolean).length ? h('div', { class: 'muted small' }, 'Seen by: ' + [...new Set([v.triaged_by, t.cleaning?.provider, t.restorative?.provider].filter(Boolean))].join(', ')) : null);

  const ready = v.status === 'ready_checkout';
  const doneBtn = h('button', { class: 'btn btn-primary btn-lg' }, 'Check out ✓');
  doneBtn.addEventListener('click', async () => {
    if (!ready && !(await confirmBox('Check out early?', 'This patient has not finished every station. Check them out anyway?', 'Check out'))) return;
    doneBtn.disabled = true;
    const r = await attempt(() => call('visits:checkout', { id: v.id, checkout: {
      aftercare: [...aftercare], prescriptions: rx, follow_up: follow, notes, acknowledge_warnings: acknowledged, survey
    } }), 'Checked out. Thank you!');
    doneBtn.disabled = false;
    if (r) reload('close');
  });

  const followReason = input({ value: follow.reason, maxlength: 300, disabled: !follow.needed, placeholder: 'e.g. Finish filling on 36 next trip', oninput: (e) => { follow.reason = e.target.value; } });

  add(panel,
    patientHeader(v, { onConsent: () => takeConsentDialog(v, app.user.name, () => reload(v.id)) }),
    v.flags.length ? h('div', { class: 'notice notice-danger' }, '⚠ ' + v.flags.join(' · ')) : null,
    v.locked ? h('div', { class: 'notice notice-info' }, v.status === 'left' ? 'This patient left without care.' : `Checked out by ${v.checked_out_by}.`) : null,
    h('div', { class: 'card' }, h('h3', null, 'Recap'), recap),
    h('div', { class: 'card' }, h('h3', null, 'After-care instructions'), careBox),
    h('div', { class: 'card' }, h('h3', null, 'Prescriptions'), rxBox, warnBox),
    h('div', { class: 'card' }, h('h3', null, 'Follow-up'),
      checkbox('Needs follow-up on the next trip', follow.needed, (x) => { follow.needed = x; followReason.disabled = !x; }), field('Why', followReason, { wide: true }),
      field('Checkout notes', h('textarea', { rows: 2, maxlength: 1000, oninput: (e) => { notes = e.target.value; } }, notes), { wide: true })),
    h('div', { class: 'card card-patient' }, h('h3', null, L('Survey — hand the screen to the patient', 'Encuesta — pase la pantalla al paciente')), surveyBox),
    v.locked ? null : h('div', { class: 'actions sticky-actions' },
      h('button', { class: 'btn btn-ghost', onclick: () => leftWithoutCare(v, reload) }, 'Left without care'),
      h('span', { class: 'grow' }), doneBtn)
  );
}

function leftWithoutCare(v, reload) {
  const reason = input({ maxlength: 300, placeholder: 'e.g. Could not wait, felt unwell' });
  modal({
    title: 'Patient left without care', body: field('Reason (optional)', reason),
    actions: [{ label: 'Cancel' }, { label: 'Record and close', kind: 'danger', onclick: async () => {
      const r = await attempt(() => call('visits:left', { id: v.id, reason: reason.value }), 'Recorded.');
      if (r) reload('close');
    } }]
  });
}
