// Treatment: the cleaning (prophy) station and the restorative / extraction
// station, each with its own queue and treatment checklist.
import { h, add, mount, call, attempt, field, input, select, checkbox, F, toast, pill, toothOptions, confirmBox } from '../lib.js';
import { station, stationEmpty } from './station.js';
import { patientHeader, medicalSummary, previousVisits, toothChart, takeConsentDialog, chartSummary } from '../components.js';

let current = null;

export async function treatment(app, el, params) {
  if (!current) current = app.user.role === 'assistant' ? 'cleaning' : 'restorative';
  const isC = () => current === 'cleaning';
  await station(app, el, params, {
    route: 'treatment',
    title: 'Treatment',
    tabs: () => h('div', { class: 'seg seg-full' }, [['cleaning', 'Cleaning'], ['restorative', 'Restorative / extraction']].map(([k, l]) => h('button', {
      class: 'seg-btn' + (current === k ? ' on' : ''),
      onclick: () => { if (current === k) return; current = k; for (const t of app.timers) clearInterval(t); app.timers.clear(); history.replaceState(null, '', '#/treatment'); treatment(app, el, []); }
    }, l))),
    sections: (all) => {
      const routed = all.filter(v => (isC() ? v.route_cleaning : v.route_restorative));
      const done = (v) => (isC() ? v.cleaning_done : v.restorative_done);
      return [
        { title: 'In the chair', items: routed.filter(v => v.status === 'in_treatment' && !done(v)) },
        { title: 'Waiting', items: routed.filter(v => v.status === 'waiting_treatment' && !done(v)).sort((a, b) => (b.priority === 'urgent') - (a.priority === 'urgent') || a.queue_number - b.queue_number) },
        { title: 'Still at triage or education', items: routed.filter(v => v.status === 'waiting_education'), folded: true },
        { title: 'Finished here today', items: routed.filter(v => done(v)).reverse(), folded: true }
      ];
    },
    extra: (v) => (isC() ? (v.route_restorative && !v.restorative_done ? pill('Also restorative', '') : null) : (v.route_cleaning && !v.cleaning_done ? pill('Also cleaning', '') : null)),
    empty: () => stationEmpty(isC() ? 'Pick a patient waiting for a cleaning.' : 'Pick a patient waiting for restorative work or an extraction.'),
    open: (v, panel, reload) => openTreatment(app, v, panel, reload, current)
  });
}

function openTreatment(app, v, panel, reload, stationKey) {
  const numbering = app.settings.tooth_numbering;
  const routed = stationKey === 'cleaning' ? v.route_cleaning : v.route_restorative;
  const prev = (v.treatment && v.treatment[stationKey]) || {};
  let chartState = v.chart;
  const chart = toothChart({ chart: v.chart, numbering, editable: !v.locked, onchange: (c) => { chartState = c; } });
  const done = stationKey === 'cleaning' ? v.cleaning_done : v.restorative_done;

  const data = stationKey === 'cleaning'
    ? { procedures: { prophy: true, ohi: true, ...(prev.procedures || {}) }, sealants: prev.sealants ? [...prev.sealants] : [], notes: prev.notes || '' }
    : {
      fillings: prev.fillings ? prev.fillings.map(f => ({ ...f, surfaces: [...f.surfaces] })) : fromChart(v.chart, 'filling_needed').map(t => ({ tooth: t, surfaces: [], material: F.FILLING_MATERIALS[0] })),
      extractions: prev.extractions ? prev.extractions.map(x => ({ ...x })) : fromChart(v.chart, 'extraction_needed').map(t => ({ tooth: t, type: 'Simple' })),
      anesthetic: prev.anesthetic ? prev.anesthetic.map(a => ({ ...a })) : [],
      xray_taken: !!prev.xray_taken, other: prev.other || '', notes: prev.notes || ''
    };
  if (stationKey === 'cleaning' && !prev.sealants) data.sealants = fromChart(v.chart, 'sealant_needed');
  let provider = prev.provider || app.user.name;

  const form = h('div');
  const teeth = () => toothOptions(numbering, (chartState && chartState.dentition) || 'mixed');
  function rows(list, make, add, label) {
    return h('div', { class: 'rows' },
      list.map((item, i) => h('div', { class: 'tx-row' }, make(item), h('button', { class: 'icon-btn', 'aria-label': 'Remove', onclick: () => { list.splice(i, 1); drawForm(); } }, '✕'))),
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { list.push(add()); drawForm(); } }, '+ ' + label));
  }
  function toothSelect(item) {
    return select([{ value: '', label: 'Tooth…' }].concat(teeth()), item.tooth || '', { onchange: (e) => { item.tooth = e.target.value; } });
  }
  function drawForm() {
    if (stationKey === 'cleaning') {
      mount(form,
        h('h3', null, 'Cleaning performed'),
        h('div', { class: 'check-grid' }, F.CLEANING_PROCEDURES.map(p => checkbox(p.label, data.procedures[p.key], (x) => { data.procedures[p.key] = x; }))),
        h('h4', null, 'Sealants'),
        h('div', { class: 'rows' },
          data.sealants.map((tooth, i) => h('div', { class: 'tx-row' },
            select([{ value: '', label: 'Tooth…' }].concat(teeth()), tooth, { onchange: (e) => { data.sealants[i] = e.target.value; } }),
            h('button', { class: 'icon-btn', 'aria-label': 'Remove', onclick: () => { data.sealants.splice(i, 1); drawForm(); } }, '✕'))),
          h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { data.sealants.push(''); drawForm(); } }, '+ Add sealant')),
        field('Notes', h('textarea', { rows: 2, maxlength: 2000, oninput: (e) => { data.notes = e.target.value; } }, data.notes), { wide: true }));
    } else {
      mount(form,
        h('h3', null, 'Fillings'),
        rows(data.fillings, (f) => h('div', { class: 'row' }, toothSelect(f),
          h('div', { class: 'seg seg-sm' }, F.SURFACES.map(su => h('button', {
            type: 'button', class: 'seg-btn' + (f.surfaces.includes(su) ? ' on' : ''),
            onclick: (e) => { const i = f.surfaces.indexOf(su); i >= 0 ? f.surfaces.splice(i, 1) : f.surfaces.push(su); e.currentTarget.classList.toggle('on'); }
          }, su))),
          select(F.FILLING_MATERIALS, f.material, { onchange: (e) => { f.material = e.target.value; } })),
        () => ({ tooth: '', surfaces: [], material: F.FILLING_MATERIALS[0] }), 'Add filling'),
        h('h3', null, 'Extractions'),
        rows(data.extractions, (x) => h('div', { class: 'row' }, toothSelect(x), select(F.EXTRACTION_TYPES, x.type, { onchange: (e) => { x.type = e.target.value; } })),
          () => ({ tooth: '', type: 'Simple' }), 'Add extraction'),
        h('h3', null, 'Anesthetic'),
        v.flags.includes('Anesthesia reaction') ? h('div', { class: 'notice notice-danger' }, '⚠ The patient reported a past reaction to anesthesia.') : null,
        rows(data.anesthetic, (a) => h('div', { class: 'row' }, select(F.ANESTHETICS, a.agent, { onchange: (e) => { a.agent = e.target.value; } }),
          input({ value: a.carpules, inputmode: 'decimal', class: 'num-input', maxlength: 4, oninput: (e) => { a.carpules = e.target.value; } }), h('span', { class: 'muted' }, 'carpules')),
        () => ({ agent: F.ANESTHETICS[0], carpules: 1 }), 'Add anesthetic'),
        checkbox('X-ray taken', data.xray_taken, (x) => { data.xray_taken = x; }),
        field('Other procedure', input({ value: data.other, maxlength: 300, oninput: (e) => { data.other = e.target.value; } }), { wide: true }),
        field('Clinical notes', h('textarea', { rows: 3, maxlength: 2000, oninput: (e) => { data.notes = e.target.value; } }, data.notes), { wide: true }));
    }
  }
  drawForm();

  async function save(complete) {
    if (!v.consent_signed) { toast('Take the consent first.', 'error'); return takeConsentDialog(v, app.user.name, () => reload(v.id)); }
    if (stationKey === 'restorative') {
      const missing = [...data.fillings, ...data.extractions].some(x => !x.tooth);
      if (missing) { toast('Choose a tooth for every filling and extraction, or remove the empty row.', 'error'); return; }
    }
    const payload = stationKey === 'cleaning' ? { ...data, sealants: data.sealants.filter(Boolean) } : data;
    const r = await attempt(() => call('visits:treatment', { id: v.id, station: stationKey, data: { ...payload, provider, chart: chartState }, complete }),
      complete ? 'Station complete.' : 'Saved.');
    if (r) reload(complete ? 'close' : v.id);
  }

  const banner = v.flags.length ? h('div', { class: 'notice notice-danger big' }, '⚠ ' + v.flags.join(' · ')) : null;
  add(panel,
    patientHeader(v, { onConsent: () => takeConsentDialog(v, app.user.name, () => reload(v.id)) }),
    banner,
    !routed ? h('div', { class: 'notice notice-warn' }, `This patient is not routed to ${stationKey === 'cleaning' ? 'cleaning' : 'restorative / extraction'}. Change the route in Triage.`) : null,
    h('div', { class: 'grid2 top' },
      h('div', { class: 'card' }, h('h3', null, 'From triage'),
        v.triage ? h('div', { class: 'stack-sm' },
          h('div', null, h('b', null, 'Complaint: '), v.triage.complaint || '—'),
          h('div', null, h('b', null, 'BP / pulse: '), v.triage.bp_sys ? `${v.triage.bp_sys}/${v.triage.bp_dia || '?'}` : '—', v.triage.pulse ? ` · ${v.triage.pulse} bpm` : ''),
          v.triage.notes ? h('div', null, h('b', null, 'Notes: '), v.triage.notes) : null,
          h('div', { class: 'muted small' }, `Triaged by ${v.triaged_by || '—'}`)) : h('p', { class: 'muted' }, 'Not triaged yet.'),
        h('h4', null, 'Teeth marked'), chartSummary(v.chart, numbering)),
      h('div', { class: 'card' }, h('h3', null, 'Health'), medicalSummary(v))),
    previousVisits(v, numbering),
    h('div', { class: 'card' }, h('h3', null, 'Tooth chart'), chart.el),
    h('div', { class: 'card' }, form,
      field('Provider', input({ value: provider, maxlength: 80, oninput: (e) => { provider = e.target.value; } })),
      done ? h('p', { class: 'ok-text' }, `✓ This station was completed${prev.done_at ? '' : ''}.`) : null,
      v.locked ? h('p', { class: 'muted' }, 'This visit is checked out and read-only.') : h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: () => save(false) }, 'Save progress'),
        h('span', { class: 'grow' }),
        h('button', { class: 'btn btn-primary btn-lg', onclick: async () => {
          const other = stationKey === 'cleaning' ? v.route_restorative && !v.restorative_done : v.route_cleaning && !v.cleaning_done;
          if (other || await confirmBox('Finish this station?', 'The patient goes to checkout.', 'Mark done')) save(true);
        } }, `Mark ${stationKey === 'cleaning' ? 'cleaning' : 'treatment'} done ✓`)))
  );
}

function fromChart(chart, mark) {
  return Object.entries((chart && chart.teeth) || {}).filter(([, t]) => t.marks.includes(mark)).map(([code]) => code);
}
