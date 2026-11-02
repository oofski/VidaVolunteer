# VIDA Dental

Offline dental clinic software for **VIDA (Vida Volunteer)** pop-up clinics and mission trips. It runs on a Windows laptop, keeps every record on that laptop, and works with no internet.

## For the clinic team

1. **Install.** Download `VIDA-Dental-Setup-x.y.z.exe` from the [latest release](https://github.com/oofski/VidaVolunteer/releases/latest) and run it.
   - If Windows says "Unknown publisher", choose **More info → Run anyway**. The installer is not code-signed yet.
   - Prefer not to install? Use `VIDA-Dental-Portable-x.y.z.exe` instead.
2. **First run.** Create the administrator, with a name and a 4–6 digit PIN.
3. **Before the clinic:**
   - Under **Staff**, add each volunteer and give them a PIN.
   - Under **Clinic events**, create the clinic and start it.
4. **On the day:** Check-in → Triage → Education → Treatment (Cleaning, or Restorative / extraction) → Checkout.
5. **After each day:** under **Settings & backup**, choose **Back up now** and copy the file to VIDA's Google Drive.

### Updates

- Open **Version … / Update available** at the bottom of the sidebar.
- **Check for updates → Download**, then an administrator presses **Restart & install**.
- With no internet, copy a newer `VIDA-Dental-Setup-x.y.z.exe` onto a USB drive. Then choose **From a USB drive or folder → Choose installer file**.

## How it works

| Part | Where |
|---|---|
| Screens (plain HTML, CSS and JavaScript, no build step) | `src/renderer/` |
| Forms, questions, consent text and validation, shared by the screens and the data layer | `src/shared/forms.js` |
| Every allowed action, with who may run it (public / staff / admin), checked in the main process | `src/main/api.js` |
| Local database (built-in `node:sqlite`, no native modules) and all clinic rules | `src/main/db.js` |
| Window, security settings, backups | `src/main/main.js` |
| Online and USB updates | `src/main/updater.js` |

Data lives in `%APPDATA%\VIDA Dental\vida-dental.db`. Automatic copies go to the `backups` folder beside it every hour and when the app starts or quits.

## Developing

```bash
npm install
```

```bash
npm test
```

```bash
npm start
```

To click through a whole visit and save screenshots to `.smoke/`:

```bash
npm run smoke
```

On Linux, run that inside `xvfb-run -a`.

Every push to the release branch runs the tests on Windows, then builds the installer and the portable app. It publishes them as a GitHub release, and installed copies pick that release up through **Software updates**.

- The version is `major.minor` from `package.json`, plus the build number.
- To start a new series, bump `major.minor` in `package.json`.

See [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) for the full specification and [docs/ROADMAP.md](docs/ROADMAP.md) for what comes next.
