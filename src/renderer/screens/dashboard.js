// Dashboard: today's counts, progress against the clinic's target, and a
// live board of where every patient is.
import { h, mount, call, emptyState, flagPills, minutesSince, pill } from '../lib.js';

const COLUMNS = [
  { key: 'waiting_triage', label: 'Waiting for triage', route: 'triage' },
  { key: 'waiting_education', label: 'Education', route: 'education' },
  { key: 'waiting_treatment', label: 'Waiting for treatment', route: 'treatment' },
  { key: 'in_treatment', label: 'In treatment', route: 'treatment' },
  { key: 'ready_checkout', label: 'Ready for checkout', route: 'checkout' },
  { key: 'checked_out', label: 'Checked out', route: 'checkout' }
];

export async function dashboard(app, el) {
  const body = h('div');
  mount(el, h('header', { class: 'page-head' }, h('div', null, h('h1', null, 'Dashboard'), h('p', { class: 'muted' }, 'Today at the clinic. Updates every few seconds.'))), body);
  async function load() {
    const d = await call('dashboard:get');
    if (!d.event) {
      mount(body, emptyState('No clinic is running',
        app.user.role === 'admin' ? 'Create or start a clinic event to begin checking patients in.' : 'Ask the administrator to start today’s clinic.',
        app.user.role === 'admin' ? h('a', { class: 'btn btn-primary', href: '#/events' }, 'Go to Clinic events') : null));
      return;
    }
    const t = d.today;
    const tiles = [
      { n: t.checked_in, label: 'Checked in today', route: 'checkin', kind: 'brand' },
      { n: t.waiting_triage, label: 'Waiting for triage', route: 'triage' },
      { n: t.waiting_education, label: 'At education', route: 'education' },
      { n: t.waiting_treatment, label: 'Treatment', route: 'treatment' },
      { n: t.ready_checkout, label: 'Ready for checkout', route: 'checkout' },
      { n: t.checked_out, label: 'Checked out', route: 'checkout', kind: 'ok' }
    ];
    const target = d.event_totals.target;
    const pct = target ? Math.min(100, Math.round((d.event_totals.seen / target) * 100)) : null;
    mount(body,
      h('div', { class: 'event-banner' },
        h('div', null, h('div', { class: 'eb-name' }, d.event.name),
          h('div', { class: 'eb-meta' }, [d.event.trip_code, d.event.community, d.event.country].filter(Boolean).join(' · '))),
        h('div', { class: 'eb-progress' },
          h('div', { class: 'eb-count' }, h('b', null, String(d.event_totals.seen)), target ? ` of ${target} patients (target)` : ' patients this clinic'),
          target ? h('div', { class: 'bar' }, h('div', { class: 'bar-fill', style: { width: pct + '%' } })) : null)),
      h('div', { class: 'tiles' }, tiles.map(x => h('a', { class: 'tile' + (x.kind ? ' tile-' + x.kind : ''), href: '#/' + x.route },
        h('div', { class: 'tile-n' }, String(x.n)), h('div', { class: 'tile-l' }, x.label)))),
      h('h2', { class: 'section-title' }, 'Patient flow ', pill('Live', 'ok')),
      h('div', { class: 'board' }, COLUMNS.map(c => {
        const list = d.board.filter(v => v.status === c.key);
        return h('div', { class: 'board-col' },
          h('div', { class: 'board-head' }, h('span', null, c.label), h('span', { class: 'count' }, String(list.length))),
          list.length ? list.map(v => h('a', { class: 'board-card' + (v.priority === 'urgent' ? ' urgent' : ''), href: '#/' + c.route + '/' + v.id },
            h('div', { class: 'bc-top' }, h('span', { class: 'qnum' }, '#' + v.queue_number), h('span', { class: 'bc-name' }, `${v.first_name} ${v.last_name}`)),
            h('div', { class: 'bc-meta' }, `${v.age ?? ''} yrs`, v.status !== 'checked_out' ? ' · ' + minutesSince(v.checked_in_at) : '',
              !v.consent_signed ? ' · consent missing' : ''),
            v.flags.length ? flagPills(v.flags.slice(0, 2).concat(v.flags.length > 2 ? [`+${v.flags.length - 2}`] : [])) : null))
            : h('div', { class: 'board-empty' }, '—'));
      })),
      t.left ? h('p', { class: 'muted' }, `${t.left} patient(s) left today without care.`) : null
    );
  }
  await load();
  app.every(5000, () => load().catch(() => {}));
}
