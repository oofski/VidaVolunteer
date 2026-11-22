// VIDA Dental — guided walkthrough.
//
// Dims the screen except one control, explains it, and waits until the
// person really uses it: clicks it (`do: 'click'`), completes it
// (`until()` returns true), or presses Next. The dimmed area blocks clicks,
// so a trainee cannot wander off mid-step; Esc or "Exit" leaves.
import { h, mount } from './lib.js';
import { icon } from './icons.js';

/**
 * steps: [{ target: css selector | () => Element, title, body,
 *           do?: 'click', until?: () => boolean, doText?: string }]
 */
export function runTour(steps, { onFinish, onExit } = {}) {
  let i = 0;
  let stepStarted = 0;
  // After a click on the highlighted control: wait for the next screen.
  let clicked = null;
  let ended = false;
  const dims = [0, 1, 2, 3].map(() => h('div', { class: 'tour-dim' }));
  const ring = h('div', { class: 'tour-ring' });
  const card = h('div', { class: 'tour-card', role: 'dialog', 'aria-live': 'polite' });
  document.body.append(...dims, ring, card);
  // The dimmed area blocks clicks but must still let the page scroll.
  const onWheel = (e) => {
    const box = document.querySelector('.panel') || document.getElementById('content');
    if (box) box.scrollBy({ top: e.deltaY, left: e.deltaX });
    e.preventDefault();
  };
  for (const d of dims) d.addEventListener('wheel', onWheel, { passive: false });

  const find = (s) => (typeof s.target === 'function' ? s.target() : document.querySelector(s.target));

  function drawCard() {
    const s = steps[i];
    const last = i === steps.length - 1;
    const waiting = s.do === 'click' || s.until;
    mount(card,
      h('div', { class: 'tour-progress' }, h('div', { style: { width: `${((i + 1) / steps.length) * 100}%` } })),
      h('div', { class: 'tour-step' }, `Step ${i + 1} of ${steps.length}`),
      h('div', { class: 'tour-title' }, s.title),
      h('div', { class: 'tour-body' }, s.body),
      waiting ? h('div', { class: 'tour-do' }, icon('arrowRight', 16), s.doText || (s.do === 'click' ? 'Click the highlighted button to continue.' : 'Do this on the highlighted part to continue.')) : null,
      h('div', { class: 'tour-foot' },
        h('button', { type: 'button', onclick: () => end(false) }, 'Exit walkthrough'),
        waiting ? null : h('button', { type: 'button', class: 'tour-next', onclick: () => next() }, last ? 'Finish' : 'Next')));
    ring.classList.toggle('click', s.do === 'click');
  }

  function start(n) {
    i = n;
    clicked = null;
    stepStarted = performance.now();
    drawCard();
    const el = find(steps[i]);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function next() {
    if (i >= steps.length - 1) return end(true);
    start(i + 1);
  }

  // A click on the highlighted control only counts once the screen has really
  // moved on (the next step's control appears). If the click was refused
  // (a missing field, no signature), the step stays put.
  function onClick(e) {
    const s = steps[i];
    if (!s || s.do !== 'click') return;
    const el = find(s);
    if (el && el.contains(e.target)) clicked = { step: i, at: performance.now() };
  }
  function onKey(e) { if (e.key === 'Escape') end(false); }
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey);
  const stopOnRoute = () => end(false);
  document.addEventListener('vida:route', stopOnRoute);

  function frame() {
    if (ended) return;
    const s = steps[i];
    const el = find(s);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let r = null;
    if (el) {
      const b = el.getBoundingClientRect();
      if (b.width && b.height) r = { x: Math.max(0, b.left - 6), y: Math.max(0, b.top - 6), w: b.width + 12, h: b.height + 12 };
    }
    if (r) {
      // Four dark panels around the highlighted control.
      place(dims[0], 0, 0, vw, r.y);
      place(dims[1], 0, r.y + r.h, vw, vh - r.y - r.h);
      place(dims[2], 0, r.y, r.x, r.h);
      place(dims[3], r.x + r.w, r.y, vw - r.x - r.w, r.h);
      place(ring, r.x, r.y, r.w, r.h);
      ring.style.display = 'block';
    } else {
      place(dims[0], 0, 0, vw, vh);
      for (const d of dims.slice(1)) place(d, 0, 0, 0, 0);
      ring.style.display = 'none';
    }
    positionCard(r, vw, vh);
    if (clicked && clicked.step === i) {
      const after = steps[i + 1];
      const waited = performance.now() - clicked.at;
      if (waited > 150 && (!after || find(after))) next();
      else if (waited > 4000) clicked = null;
    }
    if (s.until && performance.now() - stepStarted > 300) {
      let done = false;
      try { done = !!s.until(); } catch { done = false; }
      if (done) next();
    }
    requestAnimationFrame(frame);
  }

  function positionCard(r, vw, vh) {
    const cw = card.offsetWidth || 340;
    const ch = card.offsetHeight || 200;
    const gap = 16;
    let x, y;
    if (!r) { x = (vw - cw) / 2; y = (vh - ch) / 2; }
    else if (r.x + r.w + gap + cw < vw) { x = r.x + r.w + gap; y = r.y; }
    else if (r.y + r.h + gap + ch < vh) { x = r.x; y = r.y + r.h + gap; }
    else if (r.x - gap - cw > 0) { x = r.x - gap - cw; y = r.y; }
    else { x = r.x; y = r.y - gap - ch; }
    x = Math.min(Math.max(12, x), vw - cw - 12);
    y = Math.min(Math.max(60, y), vh - ch - 12);
    card.style.left = x + 'px';
    card.style.top = y + 'px';
  }

  function end(finished) {
    if (ended) return;
    ended = true;
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('vida:route', stopOnRoute);
    for (const n of [...dims, ring, card]) n.remove();
    if (finished) onFinish && onFinish(); else onExit && onExit();
  }

  start(0);
  requestAnimationFrame(frame);
  return { end: () => end(false) };
}

function place(el, x, y, w, hgt) {
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.width = Math.max(0, w) + 'px';
  el.style.height = Math.max(0, hgt) + 'px';
}
