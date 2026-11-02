// Education station: record what was taught and send the patient on.
import { h, add, call, attempt, field, checkbox, F } from '../lib.js';
import { station, stationEmpty } from './station.js';
import { patientHeader, takeConsentDialog } from '../components.js';

export async function education(app, el, params) {
  await station(app, el, params, {
    route: 'education', title: 'Education', subtitle: 'Oral-health teaching before treatment.',
    sections: (all) => [
      { title: 'Waiting for education', items: all.filter(v => v.status === 'waiting_education') },
      { title: 'Taught today', items: all.filter(v => v.status !== 'waiting_education' && v.status !== 'waiting_triage' && v.status !== 'left').reverse(), folded: true }
    ],
    empty: () => stationEmpty('Pick a patient waiting for education.'),
    open: (v, panel, reload) => {
      const prev = v.education || {};
      const topics = new Set(prev.topics || ['brushing', 'kit']);
      let notes = prev.notes || '';
      const btn = h('button', { class: 'btn btn-primary btn-lg' }, v.status === 'waiting_education' ? 'Done — send to treatment →' : 'Save');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const r = await attempt(() => call('visits:education', { id: v.id, education: { topics: [...topics], notes } }), 'Education saved.');
        btn.disabled = false;
        if (r) reload(v.status === 'waiting_education' ? 'close' : v.id);
      });
      add(panel,
        patientHeader(v, { onConsent: () => takeConsentDialog(v, app.user.name, () => reload(v.id)) }),
        h('div', { class: 'card' },
          h('h3', null, 'Topics covered'),
          h('div', { class: 'check-grid' }, F.EDUCATION_TOPICS.map(t => checkbox(t.label, topics.has(t.key), (x) => { x ? topics.add(t.key) : topics.delete(t.key); }))),
          field('Notes', h('textarea', { rows: 2, maxlength: 500, oninput: (e) => { notes = e.target.value; } }, notes), { wide: true }),
          prev.by ? h('p', { class: 'muted small' }, `Recorded by ${prev.by}.`) : null,
          h('div', { class: 'actions' }, h('span', { class: 'grow' }), btn)));
    }
  });
}
