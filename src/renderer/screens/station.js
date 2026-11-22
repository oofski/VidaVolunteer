// Shared layout for the clinic stations: a queue on the left, the open
// patient on the right. The queue refreshes every few seconds; the open
// patient is never repainted under someone's hands.
import { h, add, mount, call, attempt, emptyState, pill, minutesSince, input } from '../lib.js';
import { icon } from '../icons.js';

export function queueItem(v, { selected, onclick, extra } = {}) {
  return h('button', { class: 'q-item' + (selected ? ' selected' : '') + (v.priority === 'urgent' ? ' urgent' : ''), onclick },
    h('span', { class: 'qnum' }, '#' + v.queue_number),
    h('span', { class: 'q-main' },
      h('span', { class: 'q-name' }, `${v.first_name} ${v.last_name}`),
      h('span', { class: 'q-meta' }, `${v.age ?? '?'} yrs · ${v.community || ''} · ${minutesSince(v.checked_in_at)}`),
      h('span', { class: 'q-pills' },
        v.flags.length ? pill([icon('warningFilled', 12), `${v.flags.length} warning${v.flags.length > 1 ? 's' : ''}`], 'danger') : null,
        !v.consent_signed ? pill('No consent', 'warn') : null,
        v.returning ? pill('Returning', 'info') : null,
        v.priority === 'urgent' ? pill('Urgent', 'danger') : null,
        extra ? extra(v) : null)));
}

function matches(v, words) {
  const hay = `${v.first_name} ${v.last_name} ${v.community || ''} ${v.queue_number} ${v.complaint || ''}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return words.every(w => hay.includes(w));
}

/**
 * opts: title, subtitle, sections(visits) -> [{ title, items, limit?, note? }],
 *       open(visit, panel, reload), empty
 */
export async function station(app, el, params, opts) {
  const ev = app.info.active_event;
  if (!ev) {
    mount(el, h('header', { class: 'page-head' }, h('h1', null, opts.title)),
      emptyState('No clinic is running', 'Start a clinic event first.'));
    return;
  }
  let selected = params[0] ? Number(params[0]) : null;
  let visits = [];
  let search = '';
  const list = h('div', { class: 'q-list' });
  const panel = h('section', { class: 'panel' });
  const find = input({ type: 'search', placeholder: 'Find a patient (name, number, community)', oninput: (e) => { search = e.target.value; drawList(); } });

  // The queue can fold away to give the open patient the whole width.
  const prefKey = 'vida.queue.' + opts.route;
  let folded = false;
  try { folded = localStorage.getItem(prefKey) === 'folded'; } catch { /* default */ }
  const stationEl = h('div', { class: 'station' + (folded ? ' queue-collapsed' : '') });
  const setFolded = (v) => { stationEl.classList.toggle('queue-collapsed', v); try { localStorage.setItem(prefKey, v ? 'folded' : 'open'); } catch { /* ignore */ } };
  // Folded sections stay open across the automatic refresh.
  const openSections = new Set();
  mount(el, add(stationEl,
    h('aside', { class: 'queue' },
      h('div', { class: 'queue-head' },
        h('div', { class: 'queue-title' }, h('h1', null, opts.title),
          h('button', { class: 'icon-btn', title: 'Hide the queue', 'aria-label': 'Hide the queue', onclick: () => setFolded(true) }, icon('panelClose', 20))),
        opts.subtitle ? h('p', { class: 'muted' }, opts.subtitle) : null, opts.tabs ? opts.tabs() : null, find),
      list),
    h('div', { class: 'queue-handle' },
      h('button', { class: 'icon-btn', title: 'Show the queue', 'aria-label': 'Show the queue', onclick: () => setFolded(false) }, icon('panelOpen', 20)),
      h('span', { class: 'queue-handle-label' }, opts.title + ' queue')),
    panel));

  function drawList() {
    const words = search.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/\s+/).filter(Boolean);
    const sections = opts.sections(visits);
    mount(list, sections.map(s => {
      const items = words.length ? s.items.filter(v => matches(v, words)) : s.items;
      const shown = s.limit && !words.length ? items.slice(0, s.limit) : items;
      const sec = h(s.folded ? 'details' : 'div', { class: 'q-section', open: s.folded && openSections.has(s.title) },
        h(s.folded ? 'summary' : 'div', { class: 'q-section-title' }, s.title, h('span', { class: 'count' }, String(items.length))),
        s.note ? h('p', { class: 'muted small' }, s.note) : null,
        shown.length ? shown.map(v => queueItem(v, { selected: v.id === selected, onclick: () => select(v.id), extra: opts.extra })) : h('p', { class: 'muted small q-none' }, words.length ? 'No match.' : 'Nobody here.'),
        s.limit && items.length > shown.length ? h('p', { class: 'muted small q-none' }, `+ ${items.length - shown.length} more in line`) : null);
      if (s.folded) sec.addEventListener('toggle', () => { if (sec.open) openSections.add(s.title); else openSections.delete(s.title); });
      return sec;
    }));
  }

  async function reload() {
    const q = await call('queue:get', {});
    visits = q.visits;
    drawList();
  }

  async function select(id) {
    selected = id;
    drawList();
    history.replaceState(null, '', `#/${opts.route}/${id}`);
    mount(panel, h('div', { class: 'loading' }, 'Opening…'));
    const v = await attempt(() => call('visits:get', { id }));
    if (!v) { mount(panel, emptyState('Could not open this patient', '')); return; }
    panel.replaceChildren();
    await opts.open(v, panel, async (next) => {
      await reload();
      if (next === 'close') { selected = null; history.replaceState(null, '', `#/${opts.route}`); mount(panel, opts.empty()); drawList(); }
      else if (typeof next === 'number') select(next);
    });
  }

  await reload();
  if (selected) await select(selected); else mount(panel, opts.empty());
  app.every(5000, () => reload().catch(() => {}));
  return { reload, select };
}

export function stationEmpty(text) {
  return emptyState('Choose a patient', text);
}
