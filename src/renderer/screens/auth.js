// First-run setup and PIN sign-in.
import { h, mount, call, toast, field, input } from '../lib.js';

function brandPanel() {
  return h('div', { class: 'auth-brand' },
    h('div', { class: 'auth-logo' }, 'VIDA'),
    h('div', { class: 'auth-title' }, 'Dental clinic'),
    h('p', { class: 'auth-tag' }, 'Patient intake, consent, triage, treatment and checkout — all on this laptop, with or without internet.'));
}

export function setup(app, done) {
  const name = input({ maxlength: 80, placeholder: 'e.g. Lucia', autocomplete: 'off' });
  const pin = input({ type: 'password', inputmode: 'numeric', maxlength: 6, autocomplete: 'off' });
  const pin2 = input({ type: 'password', inputmode: 'numeric', maxlength: 6, autocomplete: 'off' });
  const btn = h('button', { class: 'btn btn-primary btn-lg', type: 'submit' }, 'Create administrator');
  const form = h('form', { class: 'auth-form', onsubmit: async (e) => {
    e.preventDefault();
    if (pin.value !== pin2.value) return toast('The two PINs do not match.', 'error');
    btn.disabled = true;
    try { await call('setup:firstAdmin', { name: name.value, pin: pin.value }); toast('Welcome! This laptop is ready.', 'ok'); done(); }
    catch (err) { toast(err.message, 'error'); btn.disabled = false; }
  } },
    h('h1', null, 'Set up this laptop'),
    h('p', { class: 'muted' }, 'Create the first administrator. They can then add the clinic team, each with their own short PIN.'),
    field('Your name', name), field('Choose a PIN (4–6 digits)', pin), field('Type the PIN again', pin2), btn);
  return h('div', { class: 'auth' }, brandPanel(), h('div', { class: 'auth-card' }, form));
}

export function login(app, done) {
  const host = h('div', { class: 'auth-card' });
  let chosen = null;
  async function render() {
    const people = await call('auth:list');
    if (!chosen) {
      mount(host,
        h('h1', null, 'Who is signing in?'),
        h('div', { class: 'people' }, people.map(p => h('button', { class: 'person', onclick: () => { chosen = p; render(); } },
          h('span', { class: 'avatar' }, initials(p.name)), h('span', { class: 'person-name' }, p.name), h('span', { class: 'person-role' }, p.role_label)))),
        h('p', { class: 'muted small' }, 'Not on the list? Ask the clinic administrator to add you.'));
      return;
    }
    let pin = '';
    const dots = h('div', { class: 'pin-dots', 'aria-live': 'polite' });
    const err = h('div', { class: 'pin-error', role: 'alert' });
    const draw = () => mount(dots, Array.from({ length: 6 }, (_, i) => h('span', { class: 'pin-dot' + (i < pin.length ? ' on' : '') })));
    const submit = async () => {
      if (pin.length < 4) { err.textContent = 'A PIN is 4 to 6 digits.'; return; }
      try { await call('auth:login', { id: chosen.id, pin }); done(); }
      catch (e) { err.textContent = e.message; pin = ''; draw(); }
    };
    const press = (k) => {
      err.textContent = '';
      if (k === 'back') pin = pin.slice(0, -1);
      else if (k === 'ok') return submit();
      else if (pin.length < 6) pin += k;
      draw();
    };
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok'];
    const pad = h('div', { class: 'pinpad' }, keys.map(k => h('button', {
      class: 'pin-key' + (k === 'ok' ? ' pin-ok' : '') + (k === 'back' ? ' pin-back' : ''), type: 'button',
      'aria-label': k === 'back' ? 'Delete' : k === 'ok' ? 'Sign in' : k, onclick: () => press(k)
    }, k === 'back' ? '⌫' : k === 'ok' ? 'Sign in' : k)));
    const onKey = (e) => {
      if (!host.isConnected) return document.removeEventListener('keydown', onKey);
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('back');
      else if (e.key === 'Enter') press('ok');
      else if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); chosen = null; render(); }
    };
    document.addEventListener('keydown', onKey);
    draw();
    mount(host,
      h('button', { class: 'link-btn back', onclick: () => { document.removeEventListener('keydown', onKey); chosen = null; render(); } }, '← Not you?'),
      h('div', { class: 'pin-who' }, h('span', { class: 'avatar avatar-lg' }, initials(chosen.name)), h('div', null, h('div', { class: 'person-name' }, chosen.name), h('div', { class: 'person-role' }, chosen.role_label))),
      h('h1', null, 'Enter your PIN'), dots, err, pad);
  }
  render().catch(e => toast(e.message, 'error'));
  return h('div', { class: 'auth' }, brandPanel(), host);
}

function initials(name) {
  return String(name).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}
