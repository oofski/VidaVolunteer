// Triage: the dentist sees the next five in line, records the complaint,
// vital signs and findings on the tooth chart, and routes the patient.
import { h, add, call, attempt, field, input, checkbox, F, toast } from '../lib.js';
import { station, stationEmpty } from './station.js';
import { patientHeader, medicalSummary, previousVisits, toothChart, takeConsentDialog } from '../components.js';

export async function triage(app, el, params) {
  await station(app, el, params, {
    route: 'triage', title: 'Triage', subtitle: 'The next five in line, in number order.',
    sections: (all) => [
      { title: 'Next in line', items: all.filter(v => v.status === 'waiting_triage'), limit: 5 },
      { title: 'Triaged today', items: all.filter(v => v.triaged_by && v.status !== 'waiting_triage').reverse(), folded: true }
    ],
    empty: () => stationEmpty('Pick the next patient in line to triage them.'),
    open: (v, panel, reload) => openTriage(app, v, panel, reload)
  });
}

function bpClass(sys, dia) {
  if ((sys && sys >= 180) || (dia && dia >= 110)) return 'vital-danger';
  if ((sys && sys >= 140) || (dia && dia >= 90)) return 'vital-warn';
  return '';
}

function openTriage(app, v, panel, reload) {
  const numbering = app.settings.tooth_numbering;
  const t = v.triage || {};
  const s = {
    complaint: t.complaint || v.medical?.reason || '', bp_sys: t.bp_sys ?? '', bp_dia: t.bp_dia ?? '', pulse: t.pulse ?? '',
    notes: t.notes || '', priority: t.priority || 'normal', exam_only: !!t.exam_only,
    route_cleaning: v.route_cleaning, route_restorative: v.route_restorative, skip_education: false
  };
  const chart = toothChart({ chart: v.chart, numbering });
  const vitalNote = h('div', { class: 'vital-note' });
  const vitals = ['bp_sys', 'bp_dia', 'pulse'].map(k => input({ value: s[k], inputmode: 'numeric', maxlength: 3, class: 'vital-input', oninput: (e) => { s[k] = e.target.value; checkVitals(); } }));
  function checkVitals() {
    const cls = bpClass(+s.bp_sys, +s.bp_dia);
    vitals[0].className = vitals[1].className = 'vital-input ' + cls;
    vitalNote.textContent = cls === 'vital-danger' ? 'Blood pressure is very high. Re-check before any treatment; consider referring.' : cls === 'vital-warn' ? 'Blood pressure is high. Re-check before anesthesia.' : '';
    vitalNote.className = 'vital-note ' + cls;
  }
  checkVitals();

  const cleanBox = checkbox('Cleaning (prophy) station', s.route_cleaning, (x) => { s.route_cleaning = x; }, { disabled: s.exam_only });
  const restBox = checkbox('Restorative / extraction station', s.route_restorative, (x) => { s.route_restorative = x; }, { disabled: s.exam_only });
  const examBox = checkbox('Exam only — no treatment today', s.exam_only, (x) => {
    s.exam_only = x;
    for (const b of [cleanBox, restBox]) b.querySelector('input').disabled = x;
  });
  const routeBoxes = h('div', { class: 'route-pick' }, cleanBox, restBox, examBox);

  const saveBtn = h('button', { class: 'btn btn-primary btn-lg' }, v.status === 'waiting_triage' ? 'Save and send on →' : 'Save triage');
  saveBtn.addEventListener('click', async () => {
    if (!v.consent_signed) { toast('Take the consent first.', 'error'); return takeConsentDialog(v, app.user.name, () => reload(v.id)); }
    saveBtn.disabled = true;
    const r = await attempt(() => call('visits:triage', { id: v.id, triage: { ...s, chart: chart.get() } }), 'Triage saved.');
    saveBtn.disabled = false;
    if (r) reload(v.status === 'waiting_triage' ? 'close' : v.id);
  });

  add(panel,
    patientHeader(v, { onConsent: () => takeConsentDialog(v, app.user.name, () => reload(v.id)) }),
    h('div', { class: 'card' }, h('h3', null, 'Health'), medicalSummary(v)),
    previousVisits(v, numbering),
    h('div', { class: 'card' },
      h('h3', null, 'Triage'),
      field('Chief complaint', input({ value: s.complaint, maxlength: 300, oninput: (e) => { s.complaint = e.target.value; } }), { wide: true }),
      h('div', { class: 'vitals' },
        field('Blood pressure', h('div', { class: 'row' }, vitals[0], h('span', null, '/'), vitals[1], h('span', { class: 'muted' }, 'mmHg'))),
        field('Pulse', h('div', { class: 'row' }, vitals[2], h('span', { class: 'muted' }, 'bpm'))),
        field('Priority', h('div', { class: 'seg' }, ['normal', 'urgent'].map(p => h('button', {
          type: 'button', class: 'seg-btn' + (s.priority === p ? ' on' : ''), onclick: (e) => { s.priority = p; for (const b of e.currentTarget.parentNode.children) b.classList.toggle('on', b === e.currentTarget); }
        }, p === 'urgent' ? 'Urgent (pain / infection)' : 'Normal'))))),
      vitalNote),
    h('div', { class: 'card' }, h('h3', null, 'Findings'), chart.el,
      field('Triage notes', h('textarea', { rows: 3, maxlength: 2000, oninput: (e) => { s.notes = e.target.value; } }, s.notes), { wide: true })),
    h('div', { class: 'card' }, h('h3', null, 'Send the patient to'), routeBoxes,
      v.status === 'waiting_triage' ? checkbox('Skip the education station', false, (x) => { s.skip_education = x; }) : null,
      v.triaged_by ? h('p', { class: 'muted small' }, `Triaged by ${v.triaged_by}.`) : null,
      h('div', { class: 'actions' }, h('span', { class: 'grow' }), saveBtn))
  );
}
