// VIDA Dental — reusable pieces: signature pad, tooth chart, patient header,
// consent form.
import { h, mount, F, toast, field, input, select, checkbox, readAloudButton, flagPills, pill, fullName, sexLabel, fmtDate, call, attempt, modal } from './lib.js';

// ---- signature pad --------------------------------------------------------
// Counts as signed only once a real line is drawn (a tap is not a signature),
// or when the signature button writes the typed name. Keeps the drawing when
// the window is resized or a tablet is rotated.
export function signaturePad({ lang = 'es', getName } = {}) {
  const canvas = h('canvas', { class: 'sig-canvas', 'aria-label': lang === 'es' ? 'Firme aquí' : 'Sign here' });
  let strokes = [];
  let current = null;
  let typed = null;
  let method = 'drawn';
  const status = h('span', { class: 'sig-status' });
  const ctx = canvas.getContext('2d');

  function size() {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }
  function redraw() {
    const r = canvas.getBoundingClientRect();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, r.width, r.height);
    ctx.strokeStyle = '#d8d2c8'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(16, r.height - 28); ctx.lineTo(r.width - 16, r.height - 28); ctx.stroke();
    ctx.strokeStyle = '#1b2a3a'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const s of strokes) {
      ctx.beginPath();
      s.forEach((p, i) => { const x = p[0] * r.width, y = p[1] * r.height; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    }
    if (typed) {
      ctx.fillStyle = '#1b2a3a';
      let px = Math.min(44, r.height * 0.42);
      ctx.font = `italic ${px}px "Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive`;
      while (ctx.measureText(typed).width > r.width - 48 && px > 14) { px -= 2; ctx.font = `italic ${px}px "Segoe Script", "Brush Script MT", cursive`; }
      ctx.fillText(typed, 24, r.height - 38);
    }
    update();
  }
  function inkLength() {
    const r = canvas.getBoundingClientRect();
    let len = 0;
    for (const s of strokes) for (let i = 1; i < s.length; i++) len += Math.hypot((s[i][0] - s[i - 1][0]) * r.width, (s[i][1] - s[i - 1][1]) * r.height);
    return len;
  }
  function signed() { return !!typed || inkLength() > 40; }
  function update() {
    status.textContent = signed() ? (lang === 'es' ? '✓ Firmado' : '✓ Signed') : (lang === 'es' ? 'Firme con el dedo o el mouse' : 'Sign with a finger or the mouse');
    status.classList.toggle('ok', signed());
  }
  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  }
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (typed) { typed = null; }
    method = 'drawn';
    canvas.setPointerCapture(e.pointerId);
    current = [pos(e)];
    strokes.push(current);
  });
  canvas.addEventListener('pointermove', (e) => { if (!current) return; current.push(pos(e)); redraw(); });
  const end = () => { current = null; update(); };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  const ro = new ResizeObserver(() => size());
  ro.observe(canvas);

  const clearBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { strokes = []; typed = null; method = 'drawn'; redraw(); } },
    lang === 'es' ? 'Borrar firma' : 'Clear signature');
  const typedBtn = h('button', {
    type: 'button', class: 'btn btn-ghost btn-sm',
    onclick: () => {
      const name = (getName && getName()) || '';
      if (!name.trim()) { toast(lang === 'es' ? 'Escriba primero el nombre de quien firma.' : 'Type the signer’s name first.', 'error'); return; }
      strokes = []; typed = name.trim(); method = 'typed'; redraw();
    }
  }, lang === 'es' ? 'Crear firma con el nombre' : 'Create signature from name');

  const el = h('div', { class: 'sig' }, canvas, h('div', { class: 'sig-tools' }, status, h('span', { class: 'grow' }), typedBtn, clearBtn));
  return {
    el,
    isSigned: signed,
    method: () => method,
    dataUrl: () => signed() ? canvas.toDataURL('image/png') : null,
    destroy: () => ro.disconnect()
  };
}

// ---- tooth chart ------------------------------------------------------------
// Tap a tooth to mark it. `mode` is the mark to toggle.
export function toothChart({ chart, numbering, editable = true, onchange }) {
  const state = { dentition: chart?.dentition || 'permanent', teeth: JSON.parse(JSON.stringify(chart?.teeth || {})) };
  let mode = 'caries';
  const wrap = h('div', { class: 'chart' });

  function toggle(code) {
    const t = state.teeth[code] || { marks: [], note: '' };
    const i = t.marks.indexOf(mode);
    if (i >= 0) t.marks.splice(i, 1); else t.marks.push(mode);
    if (!t.marks.length && !t.note) delete state.teeth[code]; else state.teeth[code] = t;
    render();
    onchange && onchange(get());
  }
  function editNote(code) {
    const t = state.teeth[code] || { marks: [], note: '' };
    const inp = input({ value: t.note || '', maxlength: 80, placeholder: 'Note for this tooth' });
    modal({
      title: `Tooth ${F.toothLabel(code, numbering)}`, body: field('Note', inp),
      actions: [{ label: 'Cancel' }, { label: 'Save note', kind: 'primary', onclick: () => {
        t.note = inp.value.trim().slice(0, 80);
        if (!t.marks.length && !t.note) delete state.teeth[code]; else state.teeth[code] = t;
        render(); onchange && onchange(get());
      } }]
    });
  }
  function tooth(code) {
    const t = state.teeth[code];
    const marks = t ? t.marks : [];
    const cls = ['tooth'].concat(marks.map(m => 'm-' + m));
    if (t && t.note) cls.push('has-note');
    const label = F.toothLabel(code, numbering);
    const title = `${label}${marks.length ? ': ' + marks.map(m => F.TOOTH_MARKS.find(x => x.key === m).label).join(', ') : ''}${t && t.note ? ' — ' + t.note : ''}`;
    return h('button', {
      type: 'button', class: cls.join(' '), title, 'aria-label': 'Tooth ' + title, disabled: !editable,
      onclick: () => toggle(code),
      oncontextmenu: (e) => { e.preventDefault(); if (editable) editNote(code); }
    }, h('span', { class: 'tooth-num' }, label),
       h('span', { class: 'tooth-marks' }, marks.map(m => F.TOOTH_MARKS.find(x => x.key === m).short).join('')));
  }
  function arch(dentition) {
    const rows = F.chartRows(dentition);
    return h('div', { class: 'arch arch-' + dentition },
      h('div', { class: 'arch-row' }, rows.upper.map(tooth)),
      h('div', { class: 'arch-row' }, rows.lower.map(tooth)));
  }
  function render() {
    mount(wrap,
      h('div', { class: 'chart-tools' },
        h('div', { class: 'seg' }, ['permanent', 'mixed', 'primary'].map(d => h('button', {
          type: 'button', class: 'seg-btn' + (state.dentition === d ? ' on' : ''), disabled: !editable,
          onclick: () => { state.dentition = d; render(); onchange && onchange(get()); }
        }, d === 'permanent' ? 'Adult' : d === 'mixed' ? 'Mixed' : 'Child'))),
        editable ? h('div', { class: 'seg seg-marks' }, F.TOOTH_MARKS.map(m => h('button', {
          type: 'button', class: 'seg-btn mark-btn m-' + m.key + (mode === m.key ? ' on' : ''),
          onclick: () => { mode = m.key; render(); }
        }, h('b', null, m.short), ' ', m.label))) : null
      ),
      h('div', { class: 'chart-label' }, h('span', null, 'Patient’s right'), h('span', null, numbering === 'fdi' ? 'FDI numbering' : 'Universal numbering'), h('span', null, 'Patient’s left')),
      state.dentition !== 'primary' ? arch('permanent') : null,
      state.dentition !== 'permanent' ? arch('primary') : null,
      editable ? h('p', { class: 'hint' }, 'Tap a tooth to add or remove the chosen mark. Right-click a tooth to add a note.') : null
    );
  }
  function get() { return { dentition: state.dentition, teeth: JSON.parse(JSON.stringify(state.teeth)) }; }
  render();
  return { el: wrap, get };
}

export function chartSummary(chart, numbering) {
  const items = Object.entries(chart?.teeth || {});
  if (!items.length) return h('p', { class: 'muted' }, 'No teeth marked.');
  return h('ul', { class: 'tooth-list' }, items.map(([code, t]) => h('li', null,
    h('b', null, F.toothLabel(code, numbering)), ' ',
    t.marks.map(m => F.TOOTH_MARKS.find(x => x.key === m)?.label).join(', '),
    t.note ? h('span', { class: 'muted' }, ' — ' + t.note) : null)));
}

// ---- patient header ---------------------------------------------------------
export function patientHeader(v, { onConsent } = {}) {
  const p = v.patient;
  return h('div', { class: 'patient-head' },
    h('div', { class: 'ph-number', title: 'Queue number' }, '#' + v.queue_number),
    h('div', { class: 'ph-main' },
      h('div', { class: 'ph-name' }, fullName(p)),
      h('div', { class: 'ph-meta' },
        `${v.age != null ? v.age + ' yrs' : ''} · ${sexLabel(p.sex)} · ${p.community || ''}${p.municipality ? ', ' + p.municipality : ''}`,
        ' · ', v.language === 'es' ? 'Spanish' : 'English'),
      h('div', { class: 'ph-pills' },
        pill(v.status_label, 'status'),
        v.previous_visits && v.previous_visits.length ? pill(`Returning · ${v.previous_visits.length} past visit${v.previous_visits.length > 1 ? 's' : ''}`, 'info') : pill('First visit', ''),
        v.consent_signed ? pill('✓ Consent signed', 'ok')
          : h('button', { class: 'pill pill-warn pill-btn', onclick: () => onConsent && onConsent() }, '✎ Consent missing — take it now'),
        v.triage && v.triage.priority === 'urgent' ? pill('Urgent', 'danger') : null)
    ),
    flagPills(v.flags)
  );
}

export function medicalSummary(v) {
  const m = v.medical || { answers: {} };
  const yes = F.MEDICAL_QUESTIONS.filter(q => m.answers[q.key] === 'yes' && !q.medications);
  const dental = F.DENTAL_QUESTIONS.filter(q => m.answers[q.key] === 'yes');
  return h('div', { class: 'med-summary' },
    h('div', null, h('b', null, 'Medical: '), yes.length ? yes.map(q => q.label).join(', ') : 'No conditions reported'),
    m.allergy_detail ? h('div', null, h('b', null, 'Allergies: '), m.allergy_detail) : null,
    h('div', null, h('b', null, 'Medications: '), m.medications && m.medications.length ? m.medications.join(', ') : 'None'),
    dental.length ? h('div', null, h('b', null, 'Dental: '), dental.map(q => q.en.replace(/^(Do|Have) (you|your) /i, '').replace(/\?$/, '')).join('; ')) : null,
    m.reason ? h('div', null, h('b', null, 'Reason for visit: '), m.reason) : null
  );
}

export function previousVisits(v, numbering) {
  if (!v.previous_visits || !v.previous_visits.length) return null;
  return h('details', { class: 'card card-soft', open: v.previous_visits.some(p => p.checkout?.follow_up?.needed) },
    h('summary', null, `Past visits (${v.previous_visits.length})`),
    v.previous_visits.map(p => h('div', { class: 'past' },
      h('div', null, h('b', null, fmtDate(p.visit_date)), ' · ', p.event_name, p.trip_code ? ` (${p.trip_code})` : '', ' · ', p.status_label),
      p.triage?.complaint ? h('div', { class: 'muted' }, 'Complaint: ' + p.triage.complaint) : null,
      treatmentLine(p.treatment, numbering),
      p.checkout?.follow_up?.needed ? h('div', { class: 'follow' }, '↻ Follow-up: ' + p.checkout.follow_up.reason) : null
    )));
}

export function treatmentLine(t, numbering) {
  if (!t) return null;
  const parts = [];
  const c = t.cleaning;
  if (c) {
    const done = F.CLEANING_PROCEDURES.filter(p => c.procedures?.[p.key]).map(p => p.label);
    if (done.length) parts.push(done.join(', '));
    if (c.sealants?.length) parts.push('Sealants ' + c.sealants.map(x => F.toothLabel(x, numbering)).join(', '));
  }
  const r = t.restorative;
  if (r) {
    if (r.fillings?.length) parts.push('Fillings ' + r.fillings.map(f => F.toothLabel(f.tooth, numbering) + (f.surfaces.length ? ' ' + f.surfaces.join('') : '')).join(', '));
    if (r.extractions?.length) parts.push('Extractions ' + r.extractions.map(x => F.toothLabel(x.tooth, numbering)).join(', '));
    if (r.xray_taken) parts.push('X-ray');
    if (r.other) parts.push(r.other);
  }
  return parts.length ? h('div', null, 'Treatment: ' + parts.join(' · ')) : null;
}

// ---- consent ---------------------------------------------------------------
export function consentText(lang) {
  const c = F.CONSENT[lang] || F.CONSENT.es;
  return c.title + '. ' + c.sections.map(s => s.heading + '. ' + s.body).join(' ') + ' ' + c.agree;
}

// Builds the consent form. `ctx` gives the patient, the age and the staff
// member's name. Returns { el, collect() } where collect() returns the consent
// payload or throws a readable message.
export function consentForm({ patientName, age, lang: startLang = 'es', staffName }) {
  let lang = startLang;
  const wrap = h('div', { class: 'consent' });
  const state = { agree: false, read_aloud: false, signer_name: age != null && age < 18 ? '' : patientName, relationship: '' };
  let pad = null;

  function render() {
    if (pad) pad.destroy();
    const c = F.CONSENT[lang];
    const minor = age != null && age < 18;
    const nameInput = input({ value: state.signer_name, maxlength: 80, oninput: (e) => { state.signer_name = e.target.value; } });
    pad = signaturePad({ lang, getName: () => state.signer_name });
    mount(wrap,
      h('div', { class: 'consent-head' },
        h('div', { class: 'seg' }, F.LANGUAGES.map(l => h('button', { type: 'button', class: 'seg-btn' + (lang === l.code ? ' on' : ''), onclick: () => { lang = l.code; render(); } }, l.name))),
        h('span', { class: 'grow' }),
        readAloudButton(() => consentText(lang), lang)),
      h('div', { class: 'draft-banner' }, c.draftNotice),
      h('h3', null, c.title),
      h('div', { class: 'consent-text' }, c.sections.map((s, i) => h('section', null, h('h4', null, `${i + 1}. ${s.heading}`), h('p', null, s.body)))),
      h('div', { class: 'consent-checks' },
        checkbox(`Staff: I read this consent aloud to the patient in ${lang === 'es' ? 'Spanish' : 'English'} (${staffName}).`, state.read_aloud, (v) => { state.read_aloud = v; }),
        checkbox(c.agree, state.agree, (v) => { state.agree = v; })),
      minor ? h('div', { class: 'notice notice-warn' }, c.minor) : null,
      h('div', { class: 'grid2' },
        field(lang === 'es' ? (minor ? 'Nombre de la madre, padre o tutor' : 'Nombre de quien firma') : (minor ? 'Parent or guardian name' : 'Name of the person signing'), nameInput),
        minor ? field(lang === 'es' ? 'Relación con el paciente' : 'Relationship to the patient',
          select([{ value: '', label: '—' }].concat(F.GUARDIAN_RELATIONSHIPS.map(g => ({ value: g.value, label: g[lang] }))), state.relationship,
            { onchange: (e) => { state.relationship = e.target.value; } })) : null),
      field(lang === 'es' ? 'Firma' : 'Signature', pad.el, { wide: true })
    );
  }
  render();

  function collect() {
    const c = F.CONSENT[lang];
    const minor = age != null && age < 18;
    if (!state.agree) throw new Error(lang === 'es' ? 'Marque que el paciente acepta el consentimiento.' : 'Tick that the patient agrees to the consent.');
    if (!state.signer_name.trim()) throw new Error('Enter the name of the person signing.');
    if (minor && !state.relationship) throw new Error(c.minor);
    if (!pad.isSigned()) throw new Error(lang === 'es' ? 'Falta la firma.' : 'The signature is missing.');
    return {
      agree: true, read_aloud: state.read_aloud, signer_name: state.signer_name.trim(), relationship: minor ? state.relationship : 'self',
      signature: pad.dataUrl(), signature_method: pad.method(), language: lang
    };
  }
  return { el: wrap, collect, destroy: () => pad && pad.destroy() };
}

// Opens the consent form in a dialog for a visit that is missing it.
export function takeConsentDialog(v, staffName, onDone) {
  const form = consentForm({ patientName: fullName(v.patient), age: v.age, lang: v.language || 'es', staffName });
  modal({
    title: `Consent — #${v.queue_number} ${fullName(v.patient)}`, body: form.el, wide: true,
    onClose: () => form.destroy(),
    actions: [
      { label: 'Cancel' },
      { label: 'Save signed consent', kind: 'primary', onclick: async () => {
        let payload;
        try { payload = form.collect(); } catch (e) { toast(e.message, 'error'); return true; }
        const r = await attempt(() => call('visits:signConsent', { id: v.id, consent: payload }), 'Consent saved.');
        if (!r) return true;
        onDone && onDone(r);
      } }
    ]
  });
}
