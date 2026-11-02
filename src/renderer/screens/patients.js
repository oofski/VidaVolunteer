// Patients: every record across every clinic and trip. Find a returning
// patient, see their history and follow-ups, start a new visit.
import { h, mount, call, attempt, field, input, F, emptyState, fullName, fmtDate, sexLabel, pill, modal, toast, flagPills } from '../lib.js';
import { treatmentLine, chartSummary } from '../components.js';

export async function patients(app, el, params) {
  const results = h('div', { class: 'results' });
  const detail = h('div');
  const q = input({ type: 'search', placeholder: 'Search by name, date of birth (DD/MM/YYYY), phone or community', autocomplete: 'off' });
  let timer;
  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 200); });
  async function search() {
    if (q.value.trim().length < 2) { mount(results, h('p', { class: 'muted' }, 'Type at least two letters.')); return; }
    const list = await call('patients:search', { text: q.value });
    mount(results, list.length ? list.map(p => h('button', { class: 'result result-btn', onclick: () => open(p.id) },
      h('div', null, h('div', { class: 'result-name' }, fullName(p)),
        h('div', { class: 'muted' }, `${p.age ?? '?'} yrs · ${sexLabel(p.sex)} · born ${F.formatDob(p.dob)} · ${p.community || ''}`)),
      h('div', { class: 'muted' }, `${p.visits} visit(s)`, h('br'), p.last_visit ? 'last ' + fmtDate(p.last_visit) : '')))
      : h('p', { class: 'muted' }, 'No patient matches.'));
  }
  async function open(id) {
    const d = await attempt(() => call('patients:get', { id }));
    if (!d) return;
    history.replaceState(null, '', '#/patients/' + id);
    const p = d.patient;
    const follow = d.visits.filter(v => v.checkout?.follow_up?.needed);
    mount(detail,
      h('div', { class: 'card' },
        h('div', { class: 'row' },
          h('div', { class: 'grow' }, h('h2', null, fullName(p)),
            h('div', { class: 'muted' }, `${p.age ?? '?'} yrs · ${sexLabel(p.sex)} · born ${F.formatDob(p.dob)}`)),
          app.info.active_event ? h('a', { class: 'btn btn-primary', href: '#/checkin/patient/' + p.id }, 'Start a new visit') : null,
          app.user.role === 'admin' ? h('button', { class: 'btn', onclick: () => editPatient(p, () => open(p.id)) }, 'Edit details') : null),
        h('dl', { class: 'facts' },
          fact('Phone', p.no_phone ? 'No phone' : p.phone), fact('Address', p.address), fact('Community', p.community),
          fact('Municipality', p.municipality), fact('Department / province', p.region), fact('Country', p.country),
          fact('Language', p.language === 'en' ? 'English' : 'Spanish'), fact('First registered', fmtDate(p.created_at.slice(0, 10))))),
      follow.length ? h('div', { class: 'notice notice-warn' }, '↻ Follow-up needed: ', follow.map(v => `${v.checkout.follow_up.reason} (${fmtDate(v.visit_date)})`).join('; ')) : null,
      h('h2', { class: 'section-title' }, `Visits (${d.visits.length})`),
      d.visits.length ? d.visits.map(v => visitCard(app, v)) : emptyState('No visits yet', ''));
    detail.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  mount(el, h('header', { class: 'page-head' }, h('div', null, h('h1', null, 'Patients'), h('p', { class: 'muted' }, 'Every patient from every VIDA clinic on this laptop.'))),
    h('div', { class: 'card' }, field('Find a patient', q, { wide: true }), results), detail);
  setTimeout(() => q.focus(), 50);
  if (params[0]) open(Number(params[0]));
}

function fact(label, value) { return [h('dt', null, label), h('dd', null, value || '—')]; }

function visitCard(app, v) {
  const numbering = app.settings.tooth_numbering;
  return h('details', { class: 'card visit-card' },
    h('summary', null,
      h('span', { class: 'qnum' }, '#' + v.queue_number), ' ',
      h('b', null, fmtDate(v.visit_date)), ' · ', v.event_name, v.trip_code ? ` (${v.trip_code})` : '', ' ',
      pill(v.status_label, v.status === 'checked_out' ? 'ok' : 'status'),
      v.flags.length ? flagPills(v.flags) : null),
    h('div', { class: 'stack-sm' },
      v.triage ? h('div', null, h('b', null, 'Complaint: '), v.triage.complaint || '—', v.triage.bp_sys ? ` · BP ${v.triage.bp_sys}/${v.triage.bp_dia || '?'}` : '') : null,
      v.triage?.notes ? h('div', null, h('b', null, 'Triage notes: '), v.triage.notes) : null,
      treatmentLine(v.treatment, numbering),
      v.checkout?.prescriptions?.length ? h('div', null, h('b', null, 'Prescriptions: '), v.checkout.prescriptions.map(r => r.name).join(', ')) : null,
      v.checkout?.follow_up?.needed ? h('div', { class: 'follow' }, '↻ Follow-up: ' + v.checkout.follow_up.reason) : null,
      v.checkout?.left_reason ? h('div', null, 'Left without care: ' + v.checkout.left_reason) : null,
      h('div', null, h('a', { href: `#/${v.status === 'checked_out' || v.status === 'left' ? 'checkout' : 'triage'}/${v.id}`, class: 'link-btn' }, 'Open this visit →'),
        app.user.role === 'admin' && (v.status === 'checked_out' || v.status === 'left')
          ? h('button', { class: 'link-btn', onclick: async () => { const r = await attempt(() => call('visits:reopen', { id: v.id }), 'Visit re-opened.'); if (r) location.hash = '#/checkout/' + v.id; } }, 'Re-open to correct') : null)));
}

function editPatient(p, done) {
  const reg = { ...p, dob: F.formatDob(p.dob) };
  const inputs = F.REGISTRATION_FIELDS.filter(f => f.key !== 'sex').map(f => field(f.en, input({ value: reg[f.key] || '', maxlength: f.max || 60, oninput: (e) => { reg[f.key] = e.target.value; } })));
  const sex = h('select', { onchange: (e) => { reg.sex = e.target.value; } }, F.SEX_OPTIONS.map(o => h('option', { value: o.value, selected: o.value === reg.sex }, o.en)));
  const noPhone = h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: reg.no_phone, onchange: (e) => { reg.no_phone = e.target.checked; } }), h('span', null, 'No phone'));
  modal({
    title: 'Edit patient details', wide: true,
    body: h('div', { class: 'grid2' }, inputs, field('Sex', sex), noPhone),
    actions: [{ label: 'Cancel' }, { label: 'Save', kind: 'primary', onclick: async () => {
      const v = F.validateRegistration(reg);
      if (!v.ok) { toast('Check: ' + Object.keys(v.errors).join(', '), 'error'); return true; }
      const r = await attempt(() => call('patients:update', { id: p.id, registration: reg }), 'Saved.');
      if (!r) return true;
      done();
    } }]
  });
}
