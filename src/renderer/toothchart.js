// VIDA Dental — the tooth chart, built for fast charting.
//
//  • Pick a mark (or press its key: C F X S M R), then tap teeth.
//  • Drag across several teeth to mark them in one stroke; starting on a
//    tooth that already has the mark removes it along the stroke instead.
//  • Right-click (or press and hold on a tablet) a tooth to add a note.
//  • Undo (Ctrl+Z) steps back; the list on the right shows everything charted.
//
// Data stays the same shape as before: { dentition, teeth: { P19: { marks, note } } }.
import { h, mount, F, field, input, modal } from './lib.js';

const SVG = 'http://www.w3.org/2000/svg';
const KEYS = { caries: 'C', filling_needed: 'F', extraction_needed: 'X', sealant_needed: 'S', missing: 'M', existing_restoration: 'R' };
// The colour of a tooth follows its most important mark.
const PRIORITY = ['extraction_needed', 'filling_needed', 'caries', 'sealant_needed', 'existing_restoration', 'missing'];

// Tooth outlines drawn upper-tooth style (roots up, crown down) in a 40×64 box.
const SHAPES = {
  molar: 'M6 30C6 22 8 8 12 4C14 2 16 4 16 8L18 22C19 24 21 24 22 22L24 8C24 4 26 2 28 4C32 8 34 22 34 30C37 32 38 38 37 46C36 56 30 62 20 62C10 62 4 56 3 46C2 38 3 32 6 30Z',
  premolar: 'M9 30C10 20 13 6 18 3C20 2 22 2 23 4C27 8 30 20 31 30C34 33 35 40 34 48C33 56 27 62 20 62C13 62 7 56 6 48C5 40 6 33 9 30Z',
  canine: 'M11 32C12 20 15 4 20 2C25 4 28 20 29 32C32 36 33 42 31 50C29 56 24 62 20 63C16 62 11 56 9 50C7 42 8 36 11 32Z',
  incisor: 'M12 30C13 18 16 4 20 2C24 4 27 18 28 30C31 33 32 40 31 50C30 57 28 62 26 62L14 62C12 62 10 57 9 50C8 40 9 33 12 30Z'
};

function toothType(code) {
  const n = parseInt(code.slice(1), 10);
  if (code[0] === 'P') {
    const k = n <= 16 ? n : 33 - n;           // fold lower onto upper numbering
    if (k <= 3 || k >= 14) return 'molar';
    if (k <= 5 || k >= 12) return 'premolar';
    if (k === 6 || k === 11) return 'canine';
    return 'incisor';
  }
  const k = n <= 10 ? n : n - 10;             // primary: A–J upper, K–T lower
  if (k <= 2 || k >= 9) return 'molar';
  if (k === 3 || k === 8) return 'canine';
  return 'incisor';
}
const isLower = (code) => (code[0] === 'P' ? parseInt(code.slice(1), 10) > 16 : parseInt(code.slice(1), 10) > 10);

// One shared clip path that keeps only the crown of a tooth.
function ensureDefs() {
  if (document.getElementById('vd-tooth-defs')) return;
  const svg = document.createElementNS(SVG, 'svg');
  svg.id = 'vd-tooth-defs';
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  const defs = document.createElementNS(SVG, 'defs');
  const clip = document.createElementNS(SVG, 'clipPath');
  clip.id = 'vd-crown';
  const rect = document.createElementNS(SVG, 'rect');
  rect.setAttribute('x', '0'); rect.setAttribute('y', '31'); rect.setAttribute('width', '40'); rect.setAttribute('height', '40');
  clip.appendChild(rect); defs.appendChild(clip); svg.appendChild(defs);
  document.body.appendChild(svg);
}

function toothSvg(code, marks) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 40 64');
  svg.setAttribute('class', 'tc-svg');
  svg.setAttribute('aria-hidden', 'true');
  const g = document.createElementNS(SVG, 'g');
  if (isLower(code)) g.setAttribute('transform', 'translate(0 64) scale(1 -1)');
  const d = SHAPES[toothType(code)];
  const outline = document.createElementNS(SVG, 'path');
  outline.setAttribute('d', d);
  outline.setAttribute('class', 'tc-root');
  const crown = document.createElementNS(SVG, 'path');
  crown.setAttribute('d', d);
  crown.setAttribute('clip-path', 'url(#vd-crown)');
  crown.setAttribute('class', 'tc-crown');
  const edge = document.createElementNS(SVG, 'path');
  edge.setAttribute('d', d);
  edge.setAttribute('class', 'tc-edge');
  g.append(outline, crown, edge);
  if (marks.includes('extraction_needed')) {
    const x = document.createElementNS(SVG, 'path');
    x.setAttribute('d', 'M9 36L31 58M31 36L9 58');
    x.setAttribute('class', 'tc-x');
    g.appendChild(x);
  }
  svg.appendChild(g);
  return svg;
}

export function toothChart({ chart, numbering, editable = true, onchange }) {
  ensureDefs();
  const state = { dentition: chart?.dentition || 'permanent', teeth: JSON.parse(JSON.stringify(chart?.teeth || {})) };
  let mode = 'caries';
  const history = [];
  const wrap = h('div', { class: 'tc' + (editable ? '' : ' tc-readonly') });
  const label = (code) => F.toothLabel(code, numbering);
  const markInfo = (k) => F.TOOTH_MARKS.find(m => m.key === k);

  const snapshot = () => { history.push(JSON.stringify(state)); if (history.length > 40) history.shift(); };
  const changed = () => { render(); onchange && onchange(get()); };
  function undo() {
    if (!history.length) return;
    Object.assign(state, JSON.parse(history.pop()));
    changed();
  }

  function has(code, mark) { return !!state.teeth[code]?.marks.includes(mark); }
  function setMark(code, mark, on) {
    const t = state.teeth[code] || { marks: [], note: '' };
    const i = t.marks.indexOf(mark);
    if (on && i < 0) t.marks.push(mark);
    if (!on && i >= 0) t.marks.splice(i, 1);
    if (!t.marks.length && !t.note) delete state.teeth[code]; else state.teeth[code] = t;
  }

  function editNote(code) {
    const t = state.teeth[code] || { marks: [], note: '' };
    const inp = input({ value: t.note || '', maxlength: 80, placeholder: 'e.g. abscess, mobile, fractured cusp' });
    modal({
      title: `Tooth ${label(code)}`, body: field('Note for this tooth', inp),
      actions: [{ label: 'Cancel' }, { label: 'Save note', kind: 'primary', onclick: () => {
        snapshot();
        t.note = inp.value.trim().slice(0, 80);
        if (!t.marks.length && !t.note) delete state.teeth[code]; else state.teeth[code] = t;
        changed();
      } }]
    });
  }

  // ---- painting: tap a tooth, or drag across several --------------------------
  let stroke = null;          // { on, done: Set } while the pointer is down
  let painted = false;        // swallow the click that follows a pointer stroke
  let holdTimer = null;
  const toothAt = (x, y) => document.elementFromPoint(x, y)?.closest?.('.tooth');
  function paint(el) {
    if (!el || !stroke || stroke.done.has(el.dataset.code)) return;
    stroke.done.add(el.dataset.code);
    setMark(el.dataset.code, mode, stroke.on);
    paintTooth(el);
  }
  function paintTooth(el) {
    // Update just this tooth while dragging (a full redraw would lose the pointer).
    const fresh = tooth(el.dataset.code);
    el.replaceWith(fresh);
  }
  wrap.addEventListener('pointerdown', (e) => {
    if (!editable || e.button > 0) return;
    const el = e.target.closest('.tooth');
    if (!el) return;
    e.preventDefault();
    snapshot();
    stroke = { on: !has(el.dataset.code, mode), done: new Set() };
    paint(el);
    if (e.pointerType !== 'mouse') {
      const code = el.dataset.code;
      holdTimer = setTimeout(() => { if (stroke && stroke.done.size === 1) { setMark(code, mode, !stroke.on); stroke = null; history.pop(); changed(); editNote(code); } }, 550);
    }
  });
  const move = (e) => { if (stroke) { clearTimeout(holdTimer); paint(toothAt(e.clientX, e.clientY)); } };
  const up = () => {
    clearTimeout(holdTimer);
    if (!stroke) return;
    stroke = null;
    painted = true;
    setTimeout(() => { painted = false; }, 0);
    changed();
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
  // A plain click (keyboard, screen reader, or automation) toggles one tooth.
  wrap.addEventListener('click', (e) => {
    const el = e.target.closest('.tooth');
    if (!el || !editable || painted) return;
    snapshot();
    setMark(el.dataset.code, mode, !has(el.dataset.code, mode));
    changed();
  });
  wrap.addEventListener('contextmenu', (e) => {
    const el = e.target.closest('.tooth');
    if (!el || !editable) return;
    e.preventDefault();
    editNote(el.dataset.code);
  });
  // Keyboard: letters pick the mark, Ctrl+Z undoes. Ignored while typing.
  const onKey = (e) => {
    if (!wrap.isConnected) { cleanup(); return; }
    if (!editable || document.querySelector('.modal-backdrop')) return;
    const f = document.activeElement;
    const typing = f && (f.tagName === 'TEXTAREA' || f.tagName === 'SELECT' || f.isContentEditable ||
      (f.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit'].includes(f.type)));
    if (typing) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = Object.entries(KEYS).find(([, key]) => key === e.key.toUpperCase());
    if (k) { mode = k[0]; render(); }
  };
  document.addEventListener('keydown', onKey);
  function cleanup() {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
  }

  // ---- drawing --------------------------------------------------------------------
  function tooth(code) {
    const t = state.teeth[code];
    const marks = t ? t.marks : [];
    const main = PRIORITY.find(m => marks.includes(m));
    const lbl = label(code);
    const title = `${lbl}${marks.length ? ': ' + marks.map(m => markInfo(m).label).join(', ') : ''}${t && t.note ? ' — ' + t.note : ''}`;
    const num = h('span', { class: 'tooth-num' }, lbl);
    const dots = h('span', { class: 'tooth-marks' }, marks.map(m => markInfo(m).short).join(''));
    const lower = isLower(code);
    return h('button', {
      type: 'button', class: `tooth tc-tooth tc-${toothType(code)}${main ? ' m-' + main : ''}${marks.length > 1 ? ' tc-multi' : ''}${t && t.note ? ' has-note' : ''}${lower ? ' tc-lower' : ''}`,
      title, 'aria-label': 'Tooth ' + title, 'aria-pressed': String(marks.includes(mode)), disabled: !editable, dataset: { code }
    }, lower ? [num, dots, toothSvg(code, marks)] : [toothSvg(code, marks), num, dots]);
  }
  function row(codes, cls) {
    const half = codes.length / 2;
    return h('div', { class: 'tc-row ' + cls },
      h('div', { class: 'tc-half' }, codes.slice(0, half).map(tooth)),
      h('div', { class: 'tc-mid', 'aria-hidden': 'true' }),
      h('div', { class: 'tc-half' }, codes.slice(half).map(tooth)));
  }
  function counts() {
    const c = {};
    for (const t of Object.values(state.teeth)) for (const m of t.marks) c[m] = (c[m] || 0) + 1;
    return c;
  }

  function render() {
    const perm = F.chartRows('permanent');
    const prim = F.chartRows('primary');
    const showP = state.dentition !== 'primary';
    const showD = state.dentition !== 'permanent';
    const c = counts();
    const charted = Object.entries(state.teeth).sort(([a], [b]) => {
      // List in chart order: upper right → upper left → lower left → lower right.
      const order = [...perm.upper, ...prim.upper, ...[...prim.lower].reverse(), ...[...perm.lower].reverse()];
      return order.indexOf(a) - order.indexOf(b);
    });
    mount(wrap,
      editable ? h('div', { class: 'tc-tools' },
        h('div', { class: 'tc-marks', role: 'radiogroup', 'aria-label': 'Mark to apply' }, F.TOOTH_MARKS.map(m => h('button', {
          type: 'button', role: 'radio', 'aria-checked': String(mode === m.key),
          class: 'tc-chip mark-btn m-' + m.key + (mode === m.key ? ' on' : ''),
          title: `${m.label} — press ${KEYS[m.key]}`,
          onclick: () => { mode = m.key; render(); }
        }, h('span', { class: 'tc-dot' }), m.label, c[m.key] ? h('span', { class: 'tc-count' }, String(c[m.key])) : h('kbd', null, KEYS[m.key])))),
        h('div', { class: 'tc-actions' },
          h('div', { class: 'tc-dent', role: 'radiogroup', 'aria-label': 'Dentition' }, [['permanent', 'Adult'], ['mixed', 'Mixed'], ['primary', 'Child']].map(([k, l]) => h('button', {
            type: 'button', role: 'radio', 'aria-checked': String(state.dentition === k), class: 'tc-pill' + (state.dentition === k ? ' on' : ''),
            onclick: () => { snapshot(); state.dentition = k; changed(); }
          }, l))),
          h('button', { type: 'button', class: 'tc-pill', disabled: !history.length, title: 'Undo (Ctrl+Z)', onclick: undo }, '↶ Undo'),
          h('button', { type: 'button', class: 'tc-pill', disabled: !charted.length, onclick: () => { snapshot(); state.teeth = {}; changed(); } }, 'Clear all'))) : null,
      h('div', { class: 'tc-body' },
        h('div', { class: 'tc-mouth' },
          h('div', { class: 'tc-side' }, h('span', null, 'Patient’s right'), h('span', { class: 'tc-jaw' }, 'Upper'), h('span', null, 'Patient’s left')),
          showP ? row(perm.upper, 'tc-perm') : null,
          showD ? row(prim.upper, 'tc-prim') : null,
          h('div', { class: 'tc-occlusal', 'aria-hidden': 'true' }),
          showD ? row(prim.lower, 'tc-prim') : null,
          showP ? row(perm.lower, 'tc-perm') : null,
          h('div', { class: 'tc-side' }, h('span', null, ''), h('span', { class: 'tc-jaw' }, 'Lower'), h('span', null, numbering === 'fdi' ? 'FDI' : 'Universal'))),
        h('aside', { class: 'tc-list' },
          h('div', { class: 'tc-list-title' }, 'Charted', h('span', null, String(charted.length))),
          charted.length ? charted.map(([code, t]) => h('div', { class: 'tc-item' },
            h('span', { class: 'tc-item-num' }, label(code)),
            h('span', { class: 'tc-item-marks' }, t.marks.map(m => h('span', { class: 'tc-tag m-' + m }, markInfo(m).label)),
              t.note ? h('span', { class: 'tc-note' }, t.note) : null),
            editable ? h('button', { type: 'button', class: 'tc-remove', title: 'Clear this tooth', 'aria-label': `Clear tooth ${label(code)}`, onclick: () => { snapshot(); delete state.teeth[code]; changed(); } }, '×') : null))
            : h('p', { class: 'tc-empty' }, editable ? 'Nothing charted yet. Pick a mark, then tap or drag across teeth.' : 'No teeth marked.'))),
      editable ? h('p', { class: 'tc-hint' }, 'Tap or drag across teeth · keys C F X S M R pick the mark · right-click or hold a tooth to add a note · Ctrl+Z undoes') : null);
  }
  function get() { return { dentition: state.dentition, teeth: JSON.parse(JSON.stringify(state.teeth)) }; }
  render();
  return { el: wrap, get, destroy: cleanup };
}
