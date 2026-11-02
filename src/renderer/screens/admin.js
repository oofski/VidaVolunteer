// Admin screens: clinic events, staff, settings & backup, audit log, and the
// software updates screen (open to everyone; installing is admin-only).
import { h, mount, call, attempt, field, input, select, checkbox, F, emptyState, fmtDate, fmtDateTime, pill, modal, toast, confirmBox } from '../lib.js';

// ---- clinic events -----------------------------------------------------------
export async function events(app, el) {
  const body = h('div');
  mount(el, h('header', { class: 'page-head' },
    h('div', null, h('h1', null, 'Clinic events'), h('p', { class: 'muted' }, 'Group patients by clinic. One clinic runs at a time; finished clinics keep every record.')),
    h('button', { class: 'btn btn-primary', onclick: () => editEvent(null) }, '+ New clinic')), body);

  async function load() {
    const list = await call('events:list');
    if (!list.length) return mount(body, emptyState('No clinics yet', 'Create the first clinic event to start checking patients in.'));
    mount(body, h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', null, h('tr', null, ['Clinic', 'Trip code', 'Where', 'Dates', 'Season', 'Patients', 'Status', ''].map(t => h('th', null, t)))),
      h('tbody', null, list.map(e => h('tr', { class: e.active ? 'row-active' : '' },
        h('td', null, h('b', null, e.name)),
        h('td', null, e.trip_code || '—'),
        h('td', null, [e.community, e.country].filter(Boolean).join(', ') || '—'),
        h('td', null, fmtDate(e.start_date) + (e.end_date && e.end_date !== e.start_date ? ' – ' + fmtDate(e.end_date) : '')),
        h('td', null, `${e.season || ''} ${e.year || ''}`),
        h('td', null, `${e.patients}${e.target_patients ? ' / ' + e.target_patients : ''}`),
        h('td', null, e.active ? pill('Running', 'ok') : e.status === 'finished' ? pill('Finished', '') : pill('Open', 'info')),
        h('td', { class: 'row-actions' },
          h('button', { class: 'btn btn-sm', onclick: () => editEvent(e) }, 'Edit'),
          e.status === 'open' && !e.active ? h('button', { class: 'btn btn-sm btn-primary', onclick: async () => { if (await attempt(() => call('events:setActive', { id: e.id }), 'Clinic started.')) { await app.refreshInfo(); load(); } } }, 'Start') : null,
          e.status === 'open' ? h('button', { class: 'btn btn-sm', onclick: async () => {
            if (!(await confirmBox('Finish this clinic?', `"${e.name}" stops taking check-ins. Every patient record is kept and stays searchable.`, 'Finish clinic'))) return;
            if (await attempt(() => call('events:finish', { id: e.id }), 'Clinic finished.')) { await app.refreshInfo(); load(); }
          } }, 'Finish') : h('button', { class: 'btn btn-sm', onclick: async () => { if (await attempt(() => call('events:reopen', { id: e.id }), 'Re-opened.')) load(); } }, 'Re-open'),
          e.patients === 0 ? h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => {
            if (!(await confirmBox('Delete this clinic?', `"${e.name}" has no patients and will be removed.`, 'Delete', 'danger'))) return;
            if (await attempt(() => call('events:delete', { id: e.id }), 'Deleted.')) { await app.refreshInfo(); load(); }
          } }, 'Delete') : null)))))));
  }

  function editEvent(e) {
    const s = e ? { ...e } : { name: '', trip_code: '', country: '', community: '', start_date: new Date().toISOString().slice(0, 10), end_date: '', season: '', target_patients: '', make_active: true };
    const f = (key, label, attrs = {}) => field(label, input({ value: s[key] ?? '', oninput: (ev) => { s[key] = ev.target.value; }, ...attrs }));
    modal({
      title: e ? 'Edit clinic' : 'New clinic', wide: true,
      body: h('div', { class: 'grid2' },
        f('name', 'Clinic name', { maxlength: 100, placeholder: 'e.g. San Juan La Laguna — Dec 2026' }),
        f('trip_code', 'Trip code', { maxlength: 40, placeholder: 'e.g. GT-2612' }),
        f('community', 'Community', { maxlength: 80 }),
        f('country', 'Country', { maxlength: 60, list: 'country-list' }),
        h('datalist', { id: 'country-list' }, ['Guatemala', 'Costa Rica', 'Nicaragua', 'Honduras', 'Panama', 'Dominican Republic'].map(c => h('option', { value: c }))),
        f('start_date', 'Start date', { type: 'date' }),
        f('end_date', 'End date', { type: 'date' }),
        f('season', 'Season (blank = from the start date)', { maxlength: 30, placeholder: 'Winter, Spring, Summer, Fall' }),
        f('target_patients', 'Target number of patients', { inputmode: 'numeric', maxlength: 6 }),
        e ? null : checkbox('Start this clinic now (new check-ins go here)', s.make_active, (x) => { s.make_active = x; })),
      actions: [{ label: 'Cancel' }, { label: e ? 'Save' : 'Create clinic', kind: 'primary', onclick: async () => {
        const r = await attempt(() => call(e ? 'events:update' : 'events:create', s), e ? 'Saved.' : 'Clinic created.');
        if (!r) return true;
        await app.refreshInfo(); load();
      } }]
    });
  }
  await load();
}

// ---- staff ----------------------------------------------------------------------
const ROLE_OPTIONS = [
  { value: 'coordinator', label: 'Community coordinator (check-in)' },
  { value: 'assistant', label: 'Dental assistant' },
  { value: 'dentist', label: 'Dentist' },
  { value: 'admin', label: 'Administrator' }
];

export async function staff(app, el) {
  const body = h('div');
  mount(el, h('header', { class: 'page-head' },
    h('div', null, h('h1', null, 'Staff'), h('p', { class: 'muted' }, 'Each person signs in with their name and a short PIN. Everyone can use the clinic screens; only administrators can manage clinics, staff and settings.')),
    h('button', { class: 'btn btn-primary', onclick: () => add() }, '+ Add person')), body);

  async function load() {
    const list = await call('staff:list');
    mount(body, h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', null, h('tr', null, ['Name', 'Role', 'Status', 'Added', ''].map(t => h('th', null, t)))),
      h('tbody', null, list.map(s => h('tr', { class: s.active ? '' : 'row-off' },
        h('td', null, h('b', null, s.name), s.id === app.user.id ? ' (you)' : ''),
        h('td', null, s.role_label),
        h('td', null, s.active ? pill('Active', 'ok') : pill('Turned off', '')),
        h('td', null, fmtDate(s.created_at.slice(0, 10))),
        h('td', { class: 'row-actions' },
          h('button', { class: 'btn btn-sm', onclick: () => edit(s) }, 'Edit'),
          h('button', { class: 'btn btn-sm', onclick: () => resetPin(s) }, 'Set PIN'),
          s.id !== app.user.id ? h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => {
            if (s.active && !(await confirmBox('Turn off this account?', `${s.name} will no longer be able to sign in. Their past work stays on record.`, 'Turn off'))) return;
            if (await attempt(() => call('staff:setActive', { id: s.id, active: !s.active }), s.active ? 'Turned off.' : 'Turned on.')) load();
          } }, s.active ? 'Turn off' : 'Turn on') : null)))))));
  }
  function pinInputs() {
    const a = input({ type: 'password', inputmode: 'numeric', maxlength: 6, autocomplete: 'off' });
    const b = input({ type: 'password', inputmode: 'numeric', maxlength: 6, autocomplete: 'off' });
    return { a, b, ok: () => { if (a.value !== b.value) { toast('The two PINs do not match.', 'error'); return false; } return true; } };
  }
  function add() {
    const s = { name: '', role: 'coordinator' };
    const p = pinInputs();
    modal({
      title: 'Add a person',
      body: h('div', { class: 'stack' },
        field('Full name', input({ maxlength: 80, oninput: (e) => { s.name = e.target.value; } })),
        field('Role', select(ROLE_OPTIONS, s.role, { onchange: (e) => { s.role = e.target.value; } })),
        field('PIN (4–6 digits)', p.a), field('Type the PIN again', p.b)),
      actions: [{ label: 'Cancel' }, { label: 'Add', kind: 'primary', onclick: async () => {
        if (!p.ok()) return true;
        const r = await attempt(() => call('staff:add', { ...s, pin: p.a.value }), 'Added.');
        if (!r) return true;
        load();
      } }]
    });
  }
  function edit(st) {
    const s = { id: st.id, name: st.name, role: st.role };
    modal({
      title: 'Edit ' + st.name,
      body: h('div', { class: 'stack' },
        field('Full name', input({ value: s.name, maxlength: 80, oninput: (e) => { s.name = e.target.value; } })),
        field('Role', select(ROLE_OPTIONS, s.role, { onchange: (e) => { s.role = e.target.value; } }))),
      actions: [{ label: 'Cancel' }, { label: 'Save', kind: 'primary', onclick: async () => {
        const r = await attempt(() => call('staff:update', s), 'Saved.');
        if (!r) return true;
        load();
      } }]
    });
  }
  function resetPin(st) {
    const p = pinInputs();
    modal({
      title: 'Set a new PIN for ' + st.name,
      body: h('div', { class: 'stack' }, field('New PIN (4–6 digits)', p.a), field('Type it again', p.b)),
      actions: [{ label: 'Cancel' }, { label: 'Save PIN', kind: 'primary', onclick: async () => {
        if (!p.ok()) return true;
        const r = await attempt(() => call('staff:setPin', { id: st.id, pin: p.a.value }), 'PIN changed.');
        if (!r) return true;
      } }]
    });
  }
  await load();
}

// ---- settings & backup -------------------------------------------------------------
export async function settings(app, el) {
  const s = await call('settings:get');
  const meds = h('textarea', { rows: 10 }, s.medications.join('\n'));
  const pharmacy = s.pharmacy.map(p => ({ ...p }));
  const pharmBox = h('div');
  let numbering = s.tooth_numbering;
  const allergyOptions = [{ value: '', label: 'No allergy check' }].concat(F.MEDICAL_QUESTIONS.filter(q => /allerg/.test(q.key)).map(q => ({ value: q.key, label: 'Check: ' + q.label })));
  function drawPharm() {
    mount(pharmBox, pharmacy.map((p, i) => h('div', { class: 'card card-soft rx-edit' },
      h('div', { class: 'grid2' },
        field('Item', input({ value: p.name, maxlength: 100, oninput: (e) => { p.name = e.target.value; } })),
        h('div', { class: 'row' },
          field('Allergy', select(allergyOptions, p.allergy || '', { onchange: (e) => { p.allergy = e.target.value || undefined; } })),
          checkbox('Block (not just warn)', p.block, (x) => { p.block = x; }),
          h('button', { class: 'icon-btn', 'aria-label': 'Remove', onclick: () => { pharmacy.splice(i, 1); drawPharm(); } }, '✕')),
        field('Instructions in English', input({ value: p.en, maxlength: 300, oninput: (e) => { p.en = e.target.value; } })),
        field('Instrucciones en español', input({ value: p.es, maxlength: 300, oninput: (e) => { p.es = e.target.value; } }))))),
    h('button', { class: 'btn btn-ghost', onclick: () => { pharmacy.push({ id: '', name: '', en: '', es: '' }); drawPharm(); } }, '+ Add pharmacy item'));
  }
  drawPharm();

  mount(el,
    h('header', { class: 'page-head' }, h('div', null, h('h1', null, 'Settings & backup'))),
    h('div', { class: 'card' }, h('h2', null, 'Backup'),
      h('p', null, 'Patient records live on this laptop. Back up at the end of every clinic day and copy the file to VIDA’s Google Drive. The app also keeps its own automatic copies each hour.'),
      h('div', { class: 'actions' },
        h('button', { class: 'btn btn-primary', onclick: async () => { const r = await attempt(() => call('backup:create')); if (r && r.path) toast(`Backup saved: ${r.path}`, 'ok'); } }, 'Back up now…'),
        h('button', { class: 'btn', onclick: async () => { const r = await attempt(() => call('backup:restore')); if (r && r.error) toast(r.error, 'error'); } }, 'Restore from a backup…'))),
    h('div', { class: 'card' }, h('h2', null, 'Tooth numbering'),
      h('div', { class: 'seg' }, [['fdi', 'FDI (11–48)'], ['universal', 'Universal (1–32)']].map(([k, l]) => h('button', {
        class: 'seg-btn' + (numbering === k ? ' on' : ''), onclick: (e) => { numbering = k; for (const b of e.currentTarget.parentNode.children) b.classList.toggle('on', b === e.currentTarget); }
      }, l)))),
    h('div', { class: 'card' }, h('h2', null, 'Medication picker'), h('p', { class: 'muted' }, 'One medication per line. These appear when a patient says they take medications.'), meds),
    h('div', { class: 'card' }, h('h2', null, 'On-site pharmacy'), h('p', { class: 'muted' }, 'What checkout can prescribe. An allergy check warns or blocks when the patient reported that allergy.'), pharmBox),
    h('div', { class: 'actions sticky-actions' },
      h('button', { class: 'btn btn-ghost', onclick: () => call('app:devtools') }, 'Developer tools'),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn btn-primary btn-lg', onclick: async () => {
        const r = await attempt(() => call('settings:update', {
          tooth_numbering: numbering, medications: meds.value.split('\n'),
          pharmacy: pharmacy.filter(p => p.name.trim())
        }), 'Settings saved.');
        if (r) { app.settings = r; }
      } }, 'Save settings')));
}

// ---- audit log -----------------------------------------------------------------------
export async function audit(app, el) {
  const rows = await call('audit:list', { limit: 500 });
  mount(el, h('header', { class: 'page-head' }, h('div', null, h('h1', null, 'Audit log'), h('p', { class: 'muted' }, 'Who viewed or changed records on this laptop. Latest 500.'))),
    h('div', { class: 'table-wrap' }, h('table', { class: 'table table-compact' },
      h('thead', null, h('tr', null, ['When', 'Who', 'Action', 'Record', 'Detail'].map(t => h('th', null, t)))),
      h('tbody', null, rows.map(r => h('tr', null,
        h('td', null, fmtDateTime(r.at)), h('td', null, r.user_name || '—'), h('td', null, r.action),
        h('td', null, r.entity ? `${r.entity}${r.entity_id ? ' ' + r.entity_id : ''}` : ''), h('td', null, r.detail || '')))))));
}

// ---- software updates (everyone) ---------------------------------------------------------
export async function updates(app, el) {
  const box = h('div');
  const isAdmin = app.user.role === 'admin';
  function draw(s) {
    s = s || { state: 'idle', current: app.info.version };
    const busy = s.state === 'checking' || s.state === 'downloading';
    mount(box,
      h('div', { class: 'update-version' }, 'This laptop has VIDA Dental ', h('b', null, s.current || app.info.version)),
      s.message ? h('div', { class: 'notice ' + (s.state === 'error' ? 'notice-danger' : s.state === 'available' || s.state === 'downloaded' ? 'notice-ok' : 'notice-info') }, s.message) : null,
      s.state === 'downloading' ? h('div', { class: 'bar' }, h('div', { class: 'bar-fill', style: { width: (s.percent || 0) + '%' } })) : null,
      h('div', { class: 'actions' },
        h('button', { class: 'btn', disabled: busy, onclick: () => call('update:check').then(draw).catch(e => toast(e.message, 'error')) }, busy && s.state === 'checking' ? 'Checking…' : 'Check for updates'),
        s.state === 'available' ? h('button', { class: 'btn btn-primary', onclick: () => call('update:download').then(draw).catch(e => toast(e.message, 'error')) }, `Download version ${s.version}`) : null,
        s.state === 'downloaded' ? (isAdmin
          ? h('button', { class: 'btn btn-primary btn-lg', onclick: async () => {
            if (await confirmBox('Restart and install?', 'VIDA Dental closes, installs the update and opens again. Patient data stays on this laptop.', 'Restart & install')) call('update:install').catch(e => toast(e.message, 'error'));
          } }, 'Restart & install')
          : h('span', { class: 'muted' }, 'Ask an administrator to install. It also installs the next time the app is closed.')) : null));
  }
  mount(el, h('header', { class: 'page-head' }, h('div', null, h('h1', null, 'Software updates'))),
    h('div', { class: 'card' }, h('h2', null, 'Online'), h('p', { class: 'muted' }, 'Checks for a newer version on the internet. The app also checks a few seconds after it opens.'), box),
    h('div', { class: 'card' }, h('h2', null, 'From a USB drive or folder'),
      h('p', { class: 'muted' }, 'No internet? Copy VIDA-Dental-Setup-x.y.z.exe to a USB drive on another computer, then choose it here.'),
      isAdmin ? h('button', { class: 'btn', onclick: async () => { const r = await attempt(() => call('update:installFromFile')); if (r && r.error) toast(r.error, 'error'); } }, 'Choose installer file…')
        : h('p', { class: 'muted' }, 'Only an administrator can install from a file.')));
  draw(app.update || await call('update:status'));
  const onUpdate = (e) => { if (box.isConnected) draw(e.detail); else document.removeEventListener('vida:update', onUpdate); };
  document.addEventListener('vida:update', onUpdate);
}
