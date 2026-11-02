// VIDA Dental — small UI toolkit shared by every screen.
// Everything is built with DOM nodes and text nodes (never innerHTML with
// data), so names typed by anyone always show as plain text.

export const F = window.VidaForms;

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (['value', 'checked', 'disabled', 'selected', 'readOnly', 'hidden'].includes(k)) el[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else if (k instanceof Node) el.appendChild(k);
    else el.appendChild(document.createTextNode(String(k)));
  }
}
// Appends children, skipping null / false (the DOM's own append would print "null").
export function add(el, ...kids) { append(el, kids); return el; }
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
export function mount(el, ...kids) { clear(el); append(el, kids); return el; }

// ---- calling the main process -------------------------------------------
let onSignedOut = () => {};
export function setSignedOutHandler(fn) { onSignedOut = fn; }
export async function call(channel, args) {
  const res = await window.api.invoke(channel, args);
  if (!res || !res.ok) {
    if (res && res.signedOut) onSignedOut();
    const err = new Error((res && res.error) || 'Something went wrong.');
    err.userError = true;
    throw err;
  }
  return res.data;
}
// Runs an action, shows its error as a toast, and returns null on failure.
export async function attempt(fn, okMessage) {
  try {
    const r = await fn();
    if (okMessage) toast(okMessage, 'ok');
    return r;
  } catch (e) {
    toast(e.message || String(e), 'error');
    return null;
  }
}

// ---- toasts and dialogs -----------------------------------------------------
export function toast(message, kind = 'info') {
  let host = document.getElementById('toasts');
  if (!host) { host = h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.appendChild(host); }
  const t = h('div', { class: `toast toast-${kind}`, role: kind === 'error' ? 'alert' : 'status' }, message);
  host.appendChild(t);
  setTimeout(() => t.classList.add('toast-out'), kind === 'error' ? 6500 : 3200);
  setTimeout(() => t.remove(), kind === 'error' ? 7000 : 3700);
}

export function modal({ title, body, actions = [], wide = false, onClose }) {
  const backdrop = h('div', { class: 'modal-backdrop' });
  const close = () => { backdrop.remove(); document.removeEventListener('keydown', esc); onClose && onClose(); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', esc);
  const box = h('div', { class: 'modal' + (wide ? ' modal-wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'modal-head' }, h('h2', null, title), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, '✕')),
    h('div', { class: 'modal-body' }, body),
    actions.length ? h('div', { class: 'modal-actions' }, actions.map(a => h('button', {
      class: 'btn ' + (a.kind ? 'btn-' + a.kind : ''),
      onclick: async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try { const keep = await a.onclick?.(close); if (keep !== true) close(); }
        finally { btn.disabled = false; }
      }
    }, a.label))) : null
  );
  backdrop.appendChild(box);
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
  document.body.appendChild(backdrop);
  const first = box.querySelector('input, select, textarea, .modal-actions .btn-primary');
  if (first) setTimeout(() => first.focus(), 30);
  return { close, box };
}

export function confirmBox(title, message, okLabel = 'OK', kind = 'primary') {
  return new Promise((resolve) => {
    let answered = false;
    modal({
      title, body: h('p', null, message),
      onClose: () => { if (!answered) resolve(false); },
      actions: [
        { label: 'Cancel', onclick: () => { answered = true; resolve(false); } },
        { label: okLabel, kind, onclick: () => { answered = true; resolve(true); } }
      ]
    });
  });
}

// ---- form helpers -----------------------------------------------------------
export function field(label, input, opts = {}) {
  return h('label', { class: 'field' + (opts.wide ? ' field-wide' : '') + (opts.error ? ' field-error' : '') },
    h('span', { class: 'field-label' }, label, opts.sub ? h('span', { class: 'field-sub' }, opts.sub) : null),
    input,
    opts.error ? h('span', { class: 'field-msg' }, opts.error) : null,
    opts.hint ? h('span', { class: 'field-hint' }, opts.hint) : null);
}
export function input(attrs) { return h('input', { type: 'text', ...attrs }); }
export function select(options, value, attrs = {}) {
  return h('select', attrs, options.map(o => {
    const v = typeof o === 'string' ? o : o.value;
    const l = typeof o === 'string' ? o : o.label;
    return h('option', { value: v, selected: String(v) === String(value) }, l);
  }));
}
export function checkbox(label, checked, onchange, attrs = {}) {
  const box = h('input', { type: 'checkbox', checked: !!checked, onchange: (e) => onchange && onchange(e.target.checked), ...attrs });
  return h('label', { class: 'check' }, box, h('span', null, label));
}
// A big two-button Yes / No control.
export function yesNo(value, onchange, labels = { yes: 'Yes', no: 'No' }) {
  const wrap = h('div', { class: 'yesno', role: 'radiogroup' });
  const make = (v) => h('button', {
    type: 'button', role: 'radio', 'aria-checked': String(value === v),
    class: 'yesno-btn' + (value === v ? ' on on-' + v : ''),
    onclick: () => { value = v; for (const b of wrap.children) { const on = b.dataset.v === v; b.classList.toggle('on', on); b.classList.toggle('on-yes', on && v === 'yes'); b.classList.toggle('on-no', on && v === 'no'); b.setAttribute('aria-checked', String(on)); } onchange(v); },
    dataset: { v }
  }, labels[v]);
  wrap.append(make('yes'), make('no'));
  return wrap;
}

// ---- formatting ---------------------------------------------------------------
export function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
export function fmtDate(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}
export function minutesSince(iso) {
  if (!iso) return '';
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}
export function sexLabel(v, lang = 'en') {
  const o = F.SEX_OPTIONS.find(s => s.value === v);
  return o ? o[lang] : '';
}
export function fullName(p) { return `${p.first_name || ''} ${p.last_name || ''}`.trim(); }

export function pill(text, kind = '') { return h('span', { class: 'pill ' + (kind ? 'pill-' + kind : '') }, text); }

export function flagPills(flags) {
  if (!flags || !flags.length) return null;
  return h('div', { class: 'flags' }, flags.map(f => pill('⚠ ' + f, 'danger')));
}

export function emptyState(title, text, action) {
  return h('div', { class: 'empty' }, h('div', { class: 'empty-title' }, title), text ? h('p', null, text) : null, action || null);
}

// ---- read aloud ---------------------------------------------------------------
let voicesReady = null;
function voices() {
  if (!('speechSynthesis' in window)) return Promise.resolve([]);
  if (voicesReady) return voicesReady;
  voicesReady = new Promise((resolve) => {
    const v = speechSynthesis.getVoices();
    if (v.length) return resolve(v);
    const done = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1500);
  });
  return voicesReady;
}
export async function speak(text, lang, onEnd) {
  if (!('speechSynthesis' in window)) { toast('Read aloud is not available on this computer. Please read it to the patient.', 'error'); return false; }
  speechSynthesis.cancel();
  const list = await voices();
  const voice = list.find(v => v.lang && v.lang.toLowerCase().startsWith(lang)) || null;
  if (!voice) {
    const name = lang === 'es' ? 'Spanish' : 'English';
    toast(`This laptop has no ${name} voice. Read it to the patient yourself, or add one in Windows Settings → Time & language → Speech.`, 'error');
    return false;
  }
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice; u.lang = voice.lang; u.rate = 0.92;
  if (onEnd) { u.onend = onEnd; u.onerror = onEnd; }
  speechSynthesis.speak(u);
  return true;
}
export function stopSpeaking() { if ('speechSynthesis' in window) speechSynthesis.cancel(); }

export function readAloudButton(getText, lang) {
  let speaking = false;
  const btn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, '\u{1F50A} ' + (lang === 'es' ? 'Leer en voz alta' : 'Read aloud'));
  btn.addEventListener('click', async () => {
    if (speaking) { stopSpeaking(); speaking = false; btn.textContent = '\u{1F50A} ' + (lang === 'es' ? 'Leer en voz alta' : 'Read aloud'); return; }
    const ok = await speak(getText(), lang, () => { speaking = false; btn.textContent = '\u{1F50A} ' + (lang === 'es' ? 'Leer en voz alta' : 'Read aloud'); });
    if (ok) { speaking = true; btn.textContent = '■ ' + (lang === 'es' ? 'Detener' : 'Stop'); }
  });
  return btn;
}

// Tooth options for pickers.
export function toothOptions(numbering, dentition = 'mixed') {
  const out = [];
  if (dentition !== 'primary') for (let i = 1; i <= 32; i++) out.push({ value: 'P' + i, label: F.toothLabel('P' + i, numbering) });
  if (dentition !== 'permanent') for (let i = 1; i <= 20; i++) out.push({ value: 'D' + i, label: F.toothLabel('D' + i, numbering) + ' (primary)' });
  return out;
}
