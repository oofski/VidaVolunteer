# VIDA Dental — Product specification (v0.1)

## Overview
VIDA Dental runs a VIDA dental clinic day on a Windows laptop, with or without internet. It covers check-in, medical history, consent, triage, education, treatment, checkout and patient records.

- **Organization:** VIDA (Vida Volunteer), a 501(c)(3). VIDA owns the software, for nonprofit use only.
- **Where it runs:** pop-up / event clinics and mission trips in Guatemala and Costa Rica, with about 30 patients a day, 3 chairs and 1–3 devices.
- **Who uses it:** paid staff dentists, dental assistants, community coordinators and front-desk volunteers. Volunteers change every trip.
- **Biggest problem it solves:** paper forms. Returning patients, their history and their follow-ups are now found in seconds.

## Platform
| Item | Value |
|---|---|
| App | Electron desktop app for 64-bit Windows |
| Files | `VIDA-Dental-Setup-x.y.z.exe` (installs; updates online) and `VIDA-Dental-Portable-x.y.z.exe` |
| Data | One SQLite file per laptop, `%APPDATA%\VIDA Dental\vida-dental.db`, through Electron's built-in `node:sqlite` |
| Internet | Not needed for anything except checking for updates |
| Window | 1320 × 880, minimum 1024 × 700; one copy per laptop |

## Sign-in and roles
- **First run** creates the first administrator, with a name and a 4–6 digit PIN. There is no default account or password.
- **Signing in:** tap your name, then enter your PIN. After 5 wrong PINs the account waits one minute.
- **PIN storage:** PINs are stored as scrypt hashes with a random salt per person.
- **Roles:** Administrator, Dentist, Dental assistant and Community coordinator.
  - VIDA does not need role restrictions on clinic screens, because everyone signs a confidentiality agreement. So every role can use every clinic screen.
  - The role only decides the home screen: coordinator → Check-in, dentist → Triage, assistant → Treatment, administrator → Dashboard.
- **Administrator only:** Clinic events, Staff, Settings & backup, Audit log, editing patient details, re-opening a closed visit, and installing updates.
  - These are checked in the main process for every action, not only hidden on screen.
- **Guards:** nobody can turn off their own account, remove their own administrator role, or remove the last administrator.
- **Turned-off accounts:** a turned-off account loses access at its next action.

## Clinic events
- **Fields:** name, trip code, country, community, start and end dates, season, year and target patient count.
  - The season is filled in from the start date unless typed.
  - The year comes from the start date.
- **One clinic runs at a time.** New check-ins go into the running clinic. With none running, check-in is refused.
- **Finish** stops check-ins and **keeps every record**. VIDA keeps records for 5–10 years. Re-open undoes Finish.
- **Delete** works only for a clinic with no patient visits.

## Patient flow
| Stage | Status | Moves on when |
|---|---|---|
| Check-in | Waiting for triage | Registered, medical history answered, consent signed (or "sign later") |
| Triage | → Education | The dentist saves triage with a route: cleaning, restorative / extraction, both, or exam only. "Skip education" goes straight to treatment. |
| Education | → Waiting for treatment | Topics recorded. Exam-only patients go to checkout. |
| Treatment | Waiting → In treatment → … | Each routed station is marked done. A patient routed to both stations waits for the second one. |
| Checkout | Ready for checkout → Checked out | Checked out with after-care, prescriptions, follow-up and survey |
| — | Left without care | Recorded at checkout, with a reason |

### Rules enforced in the data layer
- No triage or treatment until the consent is signed.
- Under 18, the consent is signed by a parent or guardian, and their relationship is required.
- A signature is a real PNG image of at least 200 bytes, so a tap does not count. It is drawn, or created from the typed name with the signature button.
- Every registration field is required. A patient with no phone ticks "No phone".
- Dates of birth are typed DD/MM/YYYY and must be a real date, not in the future.
- Every medical and dental yes/no question needs an answer. The pregnancy question is skipped for male patients.
- A patient cannot be checked in twice on the same day of the same clinic.
- A checked-out visit is read-only until an administrator re-opens it.
- **Prescriptions:**
  - Items marked "block" are refused for a reported allergy (amoxicillin with a penicillin allergy).
  - Items marked "warn" need "Dentist confirmed" ticked (ibuprofen with an aspirin allergy).

## Check-in
1. **Language:** Español or English for the patient. Staff screens stay in English.
2. **Returning patient?** Search past clinics by name, date of birth, phone or community. The search ignores accents and word order.
   - "Start visit" reuses the same patient record and pre-fills the last medical history.
3. **Registration:** first and last name, date of birth, sex, phone (or "No phone"), address, community, municipality, department / province and country.
   - The community and country default to the running clinic's.
   - A new patient whose name and date of birth match an existing record is offered "Same person".
4. **Medical history:** each question shows in the patient's language with the English below, and has a read-aloud button.
   - Warning conditions are marked red: diabetes, high blood pressure, heart attack history, aspirin allergy, penicillin allergy, anesthesia reaction, fainting, seizures, pregnancy, and bleeding / blood thinners.
   - Also asked: other allergies (which), medications (picker from an editable list, plus "other"), and three dental questions.
   - Reason for the visit.
5. **Consent:**
   - One consent, with the oral-surgery section inside it.
   - Shown in Spanish or English, with **Read aloud** using the laptop's voices.
   - Staff tick "I read this consent aloud", and the patient agrees.
   - Signer's name, plus the relationship for minors.
   - Signature pad, or "Create signature from name".
   - "Sign later" checks the patient in without consent, but no dentist can see them until it is signed.
6. **Done:** a big queue number (from 1 each day) and the warnings for the dentist.

## Stations
All stations share these features:
- The queue on the left refreshes every 5 seconds without disturbing the open patient.
- "Find a patient" covers name, number and community.
- The patient header shows the queue number, name, age, sex, community, language, status, returning / first visit, consent status (with "take it now") and red warning pills.

**Triage**
- Shows the next five in line, in number order.
- Complaint, blood pressure and pulse (amber from 140/90, red from 180/110), and priority (normal / urgent).
- Tooth chart: adult, mixed or child; FDI by default, or Universal. Marks: caries, needs filling, needs extraction, needs sealant, missing, existing restoration. Notes per tooth.
- Triage notes, route and "skip education".
- Past visits and follow-ups are shown, opened by default when a follow-up is pending.

**Education**
- Topics: brushing, flossing, sugar and diet, fluoride, children's teeth, tobacco, and toothbrush kit given.
- Notes.

**Treatment**
- Two tabs: Cleaning, and Restorative / extraction.
- **Cleaning:** prophylaxis, fluoride varnish, scaling, oral hygiene instruction, sealants by tooth, and notes.
- **Restorative:**
  - Fillings: tooth, surfaces M O D B L I, and material.
  - Extractions: tooth and type.
  - Anesthetic: agent and carpules. There is a red notice if the patient reported an anesthesia reaction.
  - X-ray taken, other procedure, and clinical notes.
- Rows are pre-filled from the teeth marked at triage.
- Provider name; "Save progress" and "Mark done".

**Checkout**
- Recap of the visit.
- After-care in the patient's language for extraction, filling, cleaning / fluoride and sealants. Pre-ticked from the treatment, with read aloud.
- Prescriptions from the on-site pharmacy list, with instructions in the patient's language and the allergy checks above.
- Follow-up for the next trip, with a reason. It shows on the patient's record and at their next triage.
- Checkout notes.
- Patient survey: a 1–5 rating and "¿Qué fue lo que más le ayudó de la atención que recibió hoy?".
- "Left without care" records why a patient left.

## Patients
- Every patient from every clinic on the laptop, with contact details, every visit (complaint, BP, treatment, prescriptions and follow-up), and pending follow-ups at the top.
- "Start a new visit" opens check-in for that patient.
- Administrators can edit details and re-open a closed visit.

## Dashboard
- The running clinic's name, trip code and place, and progress against its target.
- Tiles for checked in today, waiting for triage, education, treatment, ready for checkout and checked out.
- A live six-column patient-flow board, refreshing every 5 seconds.

## Settings & backup (administrator)
- **Back up now:** a complete copy of the database to a chosen file, to copy to Google Drive.
- **Restore from a backup:** checks the file is a VIDA Dental database, saves the current data first, then restarts.
- **Automatic copies** each hour and at start and quit, keeping the newest 14 in the app's `backups` folder.
- Tooth numbering: FDI or Universal.
- The medication picker list.
- The on-site pharmacy list: name, English and Spanish instructions, the allergy to check, and block or warn.
- Developer tools.

## Audit log (administrator)
Records who signed in (and failed PINs), viewed a patient or visit, checked in, signed a consent, triaged, taught, treated, checked out, changed settings, staff or clinics, backed up, restored and installed updates. The screen shows the latest 500.

## Software updates
- **Online:**
  - The app checks GitHub Releases 4 seconds after launch, retrying on network errors. **Check for updates** checks again.
  - Anyone can download an update. An administrator presses **Restart & install**, or it installs when the app next quits.
- **From a USB drive or folder** (administrator): choose `VIDA-Dental-Setup-x.y.z.exe` or `VIDA-Dental-Portable-x.y.z.exe`.
  - It must be newer than the installed version.
  - The app closes and the installer runs.
- **Releases:** every push to the release branch runs the tests on Windows, then builds and publishes both files and `latest.yml` as a GitHub release `v<major.minor>.<build number>`.

## Security and privacy
- **Electron hardening:**
  - `contextIsolation`, no Node in the screens, and a sandboxed renderer.
  - A single `window.api.invoke` bridge; every action is checked in the main process.
  - Content-Security-Policy `script-src 'self'`; new windows are denied and web links open in the browser.
  - No developer-tools menu (administrators can open them from Settings).
- **Screens:** everything is built from text nodes, never HTML strings with data, so names and notes always show as plain text.
- **Data at rest:** the database, backups and exports are unencrypted files on the laptop. Protect the Windows account with a password.
- **Clinic laptops:** there is no auto-lock, because VIDA does not need one. Sign out when leaving a laptop.

## Testing
| Suite | Command | Covers |
|---|---|---|
| Clinic rules | `npm test` | Setup, PIN lockout, admin-only actions, last-admin guards, required fields, warning flags, consent gate, guardian rule, signature check, triage routes, both-station flow, allergy block / warn, read-only after checkout, re-open, returning patients across clinics, duplicate check-in, finish keeps records, audit entries, backup copy, FDI / Universal numbering |
| No borrowed branding | `npm test` (`test/branding.test.js`) | Fails if another product's name or wording appears in the repository |
| Smoke | `npm run smoke` | Drives the real app through two full visits (an adult and a minor), every screen and sign-in. Fails on any error or stray "null" on screen, and saves screenshots |

## Known limitations (v0.1)
- Windows laptops only; tablets and iPads come in 0.4.
- Each laptop has its own records. To combine laptops, copy backups; device-to-device sharing is planned.
- Consent and form wording is draft until VIDA sends its approved forms.
- No reports yet (0.2) and no x-ray images (0.3).
- The installer is not code-signed, so Windows warns "Unknown publisher".
