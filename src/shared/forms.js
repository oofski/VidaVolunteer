/*
 * VIDA Dental — shared form definitions.
 *
 * Loaded by the main process (require) for validation and by the screens
 * (classic <script>) for rendering, so both sides always agree on the same
 * questions, options and rules.
 *
 * Patient-facing text is in English (en) and Spanish (es). Staff screens are
 * English only.
 */
(function (root, factory) {
  const forms = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = forms;
  else root.VidaForms = forms;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LANGUAGES = [
    { code: 'es', name: 'Español' },
    { code: 'en', name: 'English' }
  ];

  const SEX_OPTIONS = [
    { value: 'female', en: 'Female', es: 'Femenino' },
    { value: 'male', en: 'Male', es: 'Masculino' },
    { value: 'other', en: 'Other', es: 'Otro' }
  ];

  // Registration fields. Every one is required (VIDA intake: "All fields
  // required"). A patient with no phone ticks "No phone" instead.
  const REGISTRATION_FIELDS = [
    { key: 'first_name', en: 'First name', es: 'Nombre', max: 60 },
    { key: 'last_name', en: 'Last name', es: 'Apellido', max: 60 },
    { key: 'dob', en: 'Date of birth (DD/MM/YYYY)', es: 'Fecha de nacimiento (DD/MM/AAAA)', type: 'dob' },
    { key: 'sex', en: 'Sex', es: 'Sexo', type: 'sex' },
    { key: 'phone', en: 'Phone', es: 'Teléfono', type: 'phone', max: 20 },
    { key: 'address', en: 'Address', es: 'Dirección', max: 160 },
    { key: 'community', en: 'Community / village', es: 'Comunidad / aldea', max: 80 },
    { key: 'municipality', en: 'Municipality', es: 'Municipio', max: 80 },
    { key: 'region', en: 'Department / province', es: 'Departamento / provincia', max: 80 },
    { key: 'country', en: 'Country', es: 'País', max: 60 }
  ];

  // Medical history. Every question is a required Yes / No.
  // `flag: true` marks the warning conditions from the VIDA intake; a "yes"
  // shows a red warning on every station.
  const MEDICAL_QUESTIONS = [
    { key: 'diabetes', flag: true, en: 'Do you have diabetes?', es: '¿Tiene diabetes?', label: 'Diabetes' },
    { key: 'high_bp', flag: true, en: 'Do you have high blood pressure?', es: '¿Tiene presión arterial alta?', label: 'High blood pressure' },
    { key: 'heart_attack', flag: true, en: 'Have you ever had a heart attack?', es: '¿Ha tenido alguna vez un ataque al corazón?', label: 'Heart attack history' },
    { key: 'aspirin_allergy', flag: true, en: 'Are you allergic to aspirin?', es: '¿Es alérgico/a a la aspirina?', label: 'Aspirin allergy' },
    { key: 'penicillin_allergy', flag: true, en: 'Are you allergic to penicillin or amoxicillin?', es: '¿Es alérgico/a a la penicilina o amoxicilina?', label: 'Penicillin allergy' },
    { key: 'anesthesia_reaction', flag: true, en: 'Have you ever had a bad reaction to anesthesia (numbing)?', es: '¿Ha tenido alguna vez una mala reacción a la anestesia?', label: 'Anesthesia reaction' },
    { key: 'fainting', flag: true, en: 'Do you faint or get dizzy easily?', es: '¿Se desmaya o se marea con facilidad?', label: 'Fainting' },
    { key: 'seizures', flag: true, en: 'Do you have seizures or epilepsy?', es: '¿Tiene convulsiones o epilepsia?', label: 'Seizures' },
    { key: 'pregnant', flag: true, en: 'Are you pregnant, or could you be pregnant?', es: '¿Está embarazada o podría estarlo?', label: 'Pregnancy', femaleOnly: true },
    { key: 'bleeding', flag: true, en: 'Do you bleed a lot after a cut, or take blood thinners?', es: '¿Sangra mucho al cortarse o toma anticoagulantes?', label: 'Bleeding / blood thinners' },
    { key: 'heart_other', en: 'Do you have any other heart problem?', es: '¿Tiene algún otro problema del corazón?', label: 'Other heart problem' },
    { key: 'asthma', en: 'Do you have asthma or trouble breathing?', es: '¿Tiene asma o dificultad para respirar?', label: 'Asthma' },
    { key: 'infectious', en: 'Do you have hepatitis, HIV or another infectious disease?', es: '¿Tiene hepatitis, VIH u otra enfermedad infecciosa?', label: 'Infectious disease' },
    { key: 'other_allergies', en: 'Do you have any other allergies?', es: '¿Tiene alguna otra alergia?', label: 'Other allergies', detail: true },
    { key: 'tobacco', en: 'Do you smoke or chew tobacco?', es: '¿Fuma o mastica tabaco?', label: 'Tobacco' },
    { key: 'takes_medications', en: 'Do you take any medications?', es: '¿Toma algún medicamento?', label: 'Takes medications', medications: true }
  ];

  const DENTAL_QUESTIONS = [
    { key: 'pain_now', en: 'Do you have tooth pain today?', es: '¿Tiene dolor de muelas hoy?' },
    { key: 'bleeding_gums', en: 'Do your gums bleed when you brush?', es: '¿Le sangran las encías al cepillarse?' },
    { key: 'seen_dentist', en: 'Have you seen a dentist in the last 2 years?', es: '¿Ha visitado a un dentista en los últimos 2 años?' }
  ];

  // Starting list for the medication picker. Administrators can edit it.
  const DEFAULT_MEDICATIONS = [
    'Acetaminophen / Paracetamol', 'Ibuprofen', 'Aspirin', 'Amoxicillin',
    'Metformin', 'Glibenclamide', 'Insulin', 'Enalapril', 'Losartan',
    'Amlodipine', 'Hydrochlorothiazide', 'Atenolol', 'Atorvastatin',
    'Clopidogrel', 'Warfarin', 'Levothyroxine', 'Omeprazole',
    'Salbutamol inhaler', 'Prednisone', 'Carbamazepine', 'Phenytoin',
    'Birth control pills', 'Prenatal vitamins'
  ];

  // Starting list for the on-site pharmacy. `allergy` names the medical
  // question that blocks or warns about the item.
  const DEFAULT_PHARMACY = [
    { id: 'amox500', name: 'Amoxicillin 500 mg capsule', allergy: 'penicillin_allergy', block: true,
      en: 'Take 1 capsule every 8 hours for 7 days. Finish all of it.',
      es: 'Tome 1 cápsula cada 8 horas por 7 días. Termine todo el tratamiento.' },
    { id: 'clinda300', name: 'Clindamycin 300 mg capsule',
      en: 'Take 1 capsule every 6 hours for 7 days.',
      es: 'Tome 1 cápsula cada 6 horas por 7 días.' },
    { id: 'azith500', name: 'Azithromycin 500 mg tablet',
      en: 'Take 1 tablet a day for 3 days.',
      es: 'Tome 1 tableta al día por 3 días.' },
    { id: 'ibu400', name: 'Ibuprofen 400 mg tablet', allergy: 'aspirin_allergy',
      en: 'Take 1 tablet every 8 hours with food, only if needed for pain.',
      es: 'Tome 1 tableta cada 8 horas con comida, solo si tiene dolor.' },
    { id: 'acet500', name: 'Acetaminophen 500 mg tablet',
      en: 'Take 1–2 tablets every 6 hours if needed for pain. No more than 8 in a day.',
      es: 'Tome 1 o 2 tabletas cada 6 horas si tiene dolor. No más de 8 al día.' },
    { id: 'chx', name: 'Chlorhexidine 0.12% mouth rinse',
      en: 'Rinse with 15 ml for 30 seconds twice a day. Do not swallow.',
      es: 'Enjuáguese con 15 ml por 30 segundos dos veces al día. No lo trague.' },
    { id: 'fluoride_paste', name: 'Fluoride toothpaste',
      en: 'Brush twice a day for 2 minutes.',
      es: 'Cepíllese dos veces al día por 2 minutos.' }
  ];

  const EDUCATION_TOPICS = [
    { key: 'brushing', label: 'Brushing technique' },
    { key: 'flossing', label: 'Flossing' },
    { key: 'diet', label: 'Sugar and diet' },
    { key: 'fluoride', label: 'Fluoride' },
    { key: 'children', label: "Children's teeth" },
    { key: 'tobacco', label: 'Tobacco and oral health' },
    { key: 'kit', label: 'Toothbrush kit given' }
  ];

  const AFTERCARE = {
    extraction: {
      title: { en: 'After an extraction', es: 'Después de una extracción' },
      en: [
        'Bite on the gauze for 30–45 minutes.',
        'Do not spit, rinse or use a straw today.',
        'Do not smoke or drink alcohol for 3 days.',
        'Eat soft, cool food today. Chew on the other side.',
        'From tomorrow, rinse gently with warm salt water after meals.',
        'Come back or find help if bleeding does not stop, or if you have fever or swelling that gets worse.'
      ],
      es: [
        'Muerda la gasa por 30 a 45 minutos.',
        'No escupa, no se enjuague ni use pajilla hoy.',
        'No fume ni tome alcohol por 3 días.',
        'Coma alimentos blandos y fríos hoy. Mastique del otro lado.',
        'Desde mañana, enjuáguese suavemente con agua tibia con sal después de comer.',
        'Regrese o busque ayuda si el sangrado no para, o si tiene fiebre o hinchazón que empeora.'
      ]
    },
    filling: {
      title: { en: 'After a filling', es: 'Después de un relleno (calza)' },
      en: [
        'Wait until the numbness is gone before eating.',
        'The tooth may be sensitive to cold for a few days.',
        'Come back if the bite feels high or the pain gets worse.'
      ],
      es: [
        'Espere a que pase el adormecimiento antes de comer.',
        'El diente puede estar sensible al frío por unos días.',
        'Regrese si siente la mordida alta o si el dolor empeora.'
      ]
    },
    cleaning: {
      title: { en: 'After a cleaning or fluoride', es: 'Después de una limpieza o flúor' },
      en: [
        'Do not eat or drink for 30 minutes after fluoride.',
        'Gums may be a little sore or bleed for a day.',
        'Brush twice a day and clean between your teeth.'
      ],
      es: [
        'No coma ni beba por 30 minutos después del flúor.',
        'Las encías pueden doler o sangrar un poco por un día.',
        'Cepíllese dos veces al día y limpie entre los dientes.'
      ]
    },
    sealant: {
      title: { en: 'After sealants', es: 'Después de los selladores' },
      en: ['Avoid very sticky or hard food today.', 'Keep brushing the sealed teeth as normal.'],
      es: ['Evite alimentos muy pegajosos o duros hoy.', 'Siga cepillando los dientes sellados como siempre.']
    }
  };

  // Consent text. PLACEHOLDER wording written for VIDA; it must be replaced
  // with VIDA's approved forms (pending from the Executive Director) before
  // live use. The oral-surgery section is part of the main consent.
  const CONSENT_VERSION = 'vida-dental-consent-draft-1';
  const CONSENT = {
    en: {
      title: 'Consent for dental care',
      draftNotice: 'DRAFT WORDING — replace with VIDA’s approved consent before live clinics.',
      sections: [
        { heading: 'Care offered today', body: 'I agree to a dental exam and to the care the dentist recommends today, which may include cleaning, fluoride, sealants, fillings, x-rays and taking out teeth. The dentist will explain the care before it starts, and I may say no to any part of it.' },
        { heading: 'Volunteers and students', body: 'I understand that VIDA clinics are run by licensed dentists with the help of volunteers and students, who work under the dentist’s supervision.' },
        { heading: 'Risks', body: 'All dental care has some risk, such as pain, swelling, bleeding, sensitivity or infection. Numbing medicine (anesthesia) can rarely cause a reaction. I have told the staff about my health and medicines truthfully.' },
        { heading: 'Oral surgery (taking out teeth)', body: 'If a tooth must be taken out, I understand there may be bleeding, swelling, bruising, pain, infection, dry socket, damage to nearby teeth or fillings, numbness of the lip, chin or tongue that is usually temporary, or a small piece of root left in place. I will follow the after-care instructions I am given.' },
        { heading: 'Records', body: 'I agree that VIDA keeps a record of my visit, including x-ray images, so that dentists can see my history if I come back. My information is kept confidential.' }
      ],
      agree: 'I have heard and understand this consent, my questions were answered, and I agree to the care.',
      minor: 'The patient is under 18, so a parent or guardian must sign.'
    },
    es: {
      title: 'Consentimiento para atención dental',
      draftNotice: 'TEXTO BORRADOR — reemplazar con el consentimiento aprobado por VIDA antes de las clínicas.',
      sections: [
        { heading: 'Atención que se ofrece hoy', body: 'Acepto un examen dental y la atención que el dentista recomiende hoy, que puede incluir limpieza, flúor, selladores, rellenos, radiografías y extracción de dientes. El dentista me explicará la atención antes de empezar y puedo decir que no a cualquier parte.' },
        { heading: 'Voluntarios y estudiantes', body: 'Entiendo que las clínicas de VIDA las dirigen dentistas con licencia, con la ayuda de voluntarios y estudiantes que trabajan bajo la supervisión del dentista.' },
        { heading: 'Riesgos', body: 'Toda atención dental tiene algunos riesgos, como dolor, hinchazón, sangrado, sensibilidad o infección. La anestesia puede causar una reacción en casos raros. He informado al personal sobre mi salud y mis medicinas con la verdad.' },
        { heading: 'Cirugía oral (extracción de dientes)', body: 'Si es necesario sacar un diente, entiendo que puede haber sangrado, hinchazón, moretones, dolor, infección, alveolo seco, daño a dientes o rellenos cercanos, adormecimiento del labio, mentón o lengua que normalmente es temporal, o que quede un pequeño pedazo de raíz. Seguiré las instrucciones de cuidado que me den.' },
        { heading: 'Expediente', body: 'Acepto que VIDA guarde un registro de mi visita, incluidas las radiografías, para que los dentistas puedan ver mi historial si regreso. Mi información se mantiene confidencial.' }
      ],
      agree: 'He escuchado y entiendo este consentimiento, se respondieron mis preguntas y acepto la atención.',
      minor: 'El paciente es menor de 18 años; debe firmar su madre, padre o tutor.'
    }
  };

  const GUARDIAN_RELATIONSHIPS = [
    { value: 'mother', en: 'Mother', es: 'Madre' },
    { value: 'father', en: 'Father', es: 'Padre' },
    { value: 'grandparent', en: 'Grandparent', es: 'Abuelo/a' },
    { value: 'legal_guardian', en: 'Legal guardian', es: 'Tutor legal' },
    { value: 'other_relative', en: 'Other relative', es: 'Otro familiar' }
  ];

  const SURVEY = {
    rating: { en: 'How would you rate your care today?', es: '¿Cómo calificaría la atención que recibió hoy?' },
    ratingLabels: {
      en: ['Very bad', 'Bad', 'OK', 'Good', 'Very good'],
      es: ['Muy mala', 'Mala', 'Regular', 'Buena', 'Muy buena']
    },
    helped: { en: 'What helped you most about the care you received today?', es: '¿Qué fue lo que más le ayudó de la atención que recibió hoy?' }
  };

  const EXTRACTION_TYPES = ['Simple', 'Surgical', 'Root tip', 'Other'];
  const ANESTHETICS = ['Lidocaine 2% with epinephrine', 'Articaine 4%', 'Mepivacaine 3% (no epinephrine)', 'Topical only', 'Other'];
  const SURFACES = ['M', 'O', 'D', 'B', 'L', 'I'];
  const FILLING_MATERIALS = ['Composite', 'Glass ionomer', 'Amalgam', 'Temporary'];

  const CLEANING_PROCEDURES = [
    { key: 'prophy', label: 'Prophylaxis (cleaning)' },
    { key: 'fluoride', label: 'Fluoride varnish' },
    { key: 'scaling', label: 'Scaling / deep cleaning' },
    { key: 'ohi', label: 'Oral hygiene instruction' }
  ];

  // Tooth chart conditions a dentist can mark.
  const TOOTH_MARKS = [
    { key: 'caries', label: 'Caries', short: 'C' },
    { key: 'filling_needed', label: 'Needs filling', short: 'F' },
    { key: 'extraction_needed', label: 'Needs extraction', short: 'X' },
    { key: 'sealant_needed', label: 'Needs sealant', short: 'S' },
    { key: 'missing', label: 'Missing', short: '–' },
    { key: 'existing_restoration', label: 'Existing restoration', short: 'R' }
  ];

  // Tooth numbering. Internally each tooth is a position code:
  //   permanent: P1..P32 in Universal order (upper right 3rd molar = P1)
  //   primary:   D1..D20 in Universal order (A..T)
  // and is shown with the clinic's numbering setting (FDI by default,
  // because the staff dentists in Central America use FDI).
  function fdiPermanent(u) {
    if (u <= 8) return 10 + (9 - u);        // 1..8   -> 18..11
    if (u <= 16) return 20 + (u - 8);       // 9..16  -> 21..28
    if (u <= 24) return 30 + (25 - u);      // 17..24 -> 38..31
    return 40 + (u - 24);                   // 25..32 -> 41..48
  }
  function fdiPrimary(u) {
    if (u <= 5) return 50 + (6 - u);        // A..E -> 55..51
    if (u <= 10) return 60 + (u - 5);       // F..J -> 61..65
    if (u <= 15) return 70 + (16 - u);      // K..O -> 75..71
    return 80 + (u - 15);                   // P..T -> 81..85
  }
  function toothLabel(code, numbering) {
    const n = parseInt(String(code).slice(1), 10);
    const primary = String(code)[0] === 'D';
    if (numbering === 'universal') return primary ? String.fromCharCode(64 + n) : String(n);
    return String(primary ? fdiPrimary(n) : fdiPermanent(n));
  }
  function isValidTooth(code) {
    const m = /^([PD])(\d{1,2})$/.exec(String(code || ''));
    if (!m) return false;
    const n = parseInt(m[2], 10);
    return m[1] === 'P' ? n >= 1 && n <= 32 : n >= 1 && n <= 20;
  }
  // Rows for drawing the chart: upper row left-to-right is the patient's
  // right to left, as dentists read it.
  function chartRows(dentition) {
    const range = (a, b, p) => { const r = []; for (let i = a; i <= b; i++) r.push(p + i); return r; };
    if (dentition === 'primary') return { upper: range(1, 10, 'D'), lower: range(11, 20, 'D').reverse() };
    return { upper: range(1, 16, 'P'), lower: range(17, 32, 'P').reverse() };
  }

  // ---- Dates and ages -----------------------------------------------------

  // Dates are typed DD/MM/YYYY (Central American order) and stored ISO.
  function parseDob(text) {
    const s = String(text || '').trim();
    let d, m, y;
    let match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
    if (match) { d = +match[1]; m = +match[2]; y = +match[3]; }
    else if ((match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) { y = +match[1]; m = +match[2]; d = +match[3]; }
    else return null;
    if (y < 1900 || m < 1 || m > 12 || d < 1) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const today = new Date().toISOString().slice(0, 10);
    if (iso > today) return null;
    return iso;
  }
  function formatDob(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
  }
  function ageOn(dobIso, onIso) {
    if (!dobIso) return null;
    const on = onIso || new Date().toISOString().slice(0, 10);
    const [y, m, d] = dobIso.split('-').map(Number);
    const [oy, om, od] = on.split('-').map(Number);
    let age = oy - y;
    if (om < m || (om === m && od < d)) age--;
    return age;
  }

  // ---- Validation (used by the screens and enforced again by the main
  // process) --------------------------------------------------------------

  function clean(v, max) {
    return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 200);
  }

  function validateRegistration(input) {
    const errors = {};
    const out = {};
    for (const f of REGISTRATION_FIELDS) {
      const raw = input ? input[f.key] : '';
      if (f.type === 'dob') {
        const iso = parseDob(raw);
        if (!iso) errors[f.key] = 'Enter a real date of birth as DD/MM/YYYY.';
        out.dob = iso;
      } else if (f.type === 'sex') {
        const ok = SEX_OPTIONS.some(o => o.value === raw);
        if (!ok) errors.sex = 'Choose one.';
        out.sex = ok ? raw : null;
      } else if (f.type === 'phone') {
        const noPhone = !!(input && input.no_phone);
        out.no_phone = noPhone ? 1 : 0;
        const digits = String(raw || '').replace(/[^\d+]/g, '');
        if (noPhone) out.phone = '';
        else if (digits.replace(/\D/g, '').length < 7) errors.phone = 'Enter a phone number, or tick "No phone".';
        else out.phone = clean(raw, f.max);
      } else {
        const v = clean(raw, f.max);
        if (!v) errors[f.key] = 'Required.';
        out[f.key] = v;
      }
    }
    return { ok: Object.keys(errors).length === 0, errors, value: out };
  }

  function medicalQuestionsFor(sex) {
    return MEDICAL_QUESTIONS.filter(q => !(q.femaleOnly && sex === 'male'));
  }

  function validateMedical(input, sex) {
    const errors = {};
    const answers = {};
    const src = (input && input.answers) || {};
    for (const q of MEDICAL_QUESTIONS) {
      if (q.femaleOnly && sex === 'male') { answers[q.key] = 'no'; continue; }
      const a = src[q.key];
      if (a !== 'yes' && a !== 'no') errors[q.key] = 'Answer yes or no.';
      answers[q.key] = a === 'yes' || a === 'no' ? a : null;
    }
    for (const q of DENTAL_QUESTIONS) {
      const a = src[q.key];
      if (a !== 'yes' && a !== 'no') errors[q.key] = 'Answer yes or no.';
      answers[q.key] = a === 'yes' || a === 'no' ? a : null;
    }
    const allergyDetail = clean(input && input.allergy_detail, 200);
    if (answers.other_allergies === 'yes' && !allergyDetail) errors.allergy_detail = 'Say which allergies.';
    let medications = Array.isArray(input && input.medications) ? input.medications : [];
    medications = medications.map(m => clean(m, 80)).filter(Boolean).slice(0, 30);
    if (answers.takes_medications === 'yes' && medications.length === 0) errors.medications = 'Pick at least one medication.';
    if (answers.takes_medications === 'no') medications = [];
    const reason = clean(input && input.reason, 300);
    return {
      ok: Object.keys(errors).length === 0,
      errors,
      value: { answers, allergy_detail: answers.other_allergies === 'yes' ? allergyDetail : '', medications, reason }
    };
  }

  // The warning flags shown on every station.
  function flagsFor(medical) {
    const a = (medical && medical.answers) || {};
    const flags = MEDICAL_QUESTIONS.filter(q => q.flag && a[q.key] === 'yes').map(q => q.label);
    if (a.other_allergies === 'yes' && medical.allergy_detail) flags.push('Allergy: ' + medical.allergy_detail);
    return flags;
  }

  function seasonFor(isoDate) {
    const m = parseInt(String(isoDate || '').slice(5, 7), 10);
    if (!m) return '';
    if (m === 12 || m <= 2) return 'Winter';
    if (m <= 5) return 'Spring';
    if (m <= 8) return 'Summer';
    return 'Fall';
  }

  return {
    LANGUAGES, SEX_OPTIONS, REGISTRATION_FIELDS, MEDICAL_QUESTIONS, DENTAL_QUESTIONS,
    DEFAULT_MEDICATIONS, DEFAULT_PHARMACY, EDUCATION_TOPICS, AFTERCARE,
    CONSENT, CONSENT_VERSION, GUARDIAN_RELATIONSHIPS, SURVEY,
    EXTRACTION_TYPES, ANESTHETICS, SURFACES, FILLING_MATERIALS, CLEANING_PROCEDURES, TOOTH_MARKS,
    toothLabel, isValidTooth, chartRows, parseDob, formatDob, ageOn, clean,
    validateRegistration, validateMedical, medicalQuestionsFor, flagsFor, seasonFor
  };
});
