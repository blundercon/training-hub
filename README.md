# Training Hub

A static, installable web app (PWA) for logging workouts and coaching. There is no server and no
database: each client's data lives in a Google Sheet in their own Drive, and the coach gets access
because the client shares that sheet with them.

- **Stack:** TypeScript, Vite, Preact, `vite-plugin-pwa`, Vitest. Hosted on GitHub Pages and deployed by GitHub Actions.
- **Google access:** Google Identity Services token model with **one scope, `drive.file`**. With it, the
  app can open only the files it created or the files a user picks in Google Picker. It cannot list
  or read anything else in anyone's Drive.

## Status

| Step | Scope | State |
|---|---|---|
| 1 | Repo, PWA shell, deploy, Google sign-in and token renewal, create the client sheet | **done, ready for review** |
| 2 | `@hub/core` rules, Logs read/write, Today, Log, History, PR wall, Content Security Policy | next |
| 3 | Importer from a copy or CSV, plus a verify report | |
| 4 | Coach: Clients, client detail, plan builder, notes, onboarding | |
| 5 | Remaining screens, then AI with the user's own API key | |

## Existing data is read-only

The original "Training Hub Data" sheet, the old hub and `Harikishen.xlsx` are never written to. The
app enforces this in two ways:

1. **`drive.file` scope.** The app can't see those files unless someone picks them in Google Picker.
2. **Write guard.** Every write first checks that the file has Training Hub's own Drive
   `appProperties` (`th_kind=client` or `coach-index`), and those are set only on sheets the app
   creates. Any other sheet, even one picked through Picker, is read-only
   (`NotTrainingHubSheetError`, covered by a test).

The step 3 importer reads **your copy** (File > Make a copy) or a CSV export, and writes only into
the new sheet.

## Security model (decided)

- Client ID, Picker API key and project number are public by design and ship in the page.
  Protection comes from the registered origins and redirect URIs, the key's website and API
  restrictions, and the `drive.file` scope.
- Full-page sign-in uses the OAuth implicit flow, which current guidance (RFC 9700) discourages.
  It is accepted here because there is no server. Mitigations: the `state` check, the token wiped
  from the URL, a narrow scope and a 1-hour lifetime.
- The token is kept in `localStorage` on the device. A Content Security Policy (step 2) limits
  scripts and data connections to the app itself and Google.
- Possible later upgrade: a small server (for example a Cloudflare Worker) for the code flow and
  refresh tokens. Revisit only if the number of users grows.

## Sheet layout (schema v1)

New sheet: `Training Hub – <name>`, in the client's Drive. Every tab has a bold, frozen header row.

| Tab | Columns |
|---|---|
| Profile | field, value |
| Plan | Key, day, order, exercise, sets, reps, target RPE, note, written by, updated at |
| Logs | Key, date, exercise, unit, sets, RPE, note, source, written by, logged at |
| Body | Key, date, weight, unit, body fat %, muscle mass, waist, source, note, written by, logged at |
| Meals | Key, date, meal, description, kcal, protein g, carbs g, fat g, source, written by, logged at |
| Checkins | Key, date, sleep h, energy, soreness, stress, steps, note, written by, logged at |
| Notes | Key, date, kind, text, written by, logged at |
| Exercises | name, aliases, muscle, equipment, unit |

The Logs `sets` column keeps the raw string (`40kg*12 40kg*12`), and units are never converted.
Schema changes only ever append: **Check sheet structure** adds missing tabs or columns at the end and
leaves hand-added columns alone. The Body, Meals and Checkins columns are a first draft, to be lined up
with the old hub's columns in step 3.

## Sign-in design (phones first)

- `signIn()` / `renew()` ask Google for the token **synchronously inside the tap**, with nothing
  awaited before the request, so iOS and pop-up blockers allow it.
- **Two methods:**
  - **Google pop-up** (GIS token client). Default in browsers and on Android.
  - **Full page** (OAuth implicit redirect to `accounts.google.com`, which returns to the app with the
    token in the URL fragment). Default for an **iPhone home-screen app**, where pop-ups often never
    report back. The `state` value is checked, and the token is cleared from the URL and history straight away.
  - Settings > Sign-in method can force either one. If a pop-up hangs for 8 seconds or fails, a
    **Full-page sign-in** button appears.
  - **Safari-tab fallback:** on an iPhone home-screen app the help card links to the app in Safari
    (`x-safari-https://…`). iOS keeps sign-in for Safari and for the home-screen app separately, so
    you sign in once in each.
- **Renewal:** tokens last about an hour.
  - Five minutes before the end, a banner says *Tap to stay signed in*. After expiry it says
    *Tap to continue*.
  - Any Sheets call made while the token is expired waits, then runs on its own once you renew,
    so nothing is lost.
  - On iPhone full-page mode, opening the app with an expired token makes one silent `prompt=none`
    pass through Google, at most once every 2 minutes.
- **Identity for "written by":** the app reads it from Drive `about.get`, which `drive.file` allows,
  so no extra scope is needed.
- **Quota:** calls are batched (a new sheet takes 2 calls, a structure check 2 to 4). The app backs
  off exponentially on 429/5xx and honours `Retry-After`. On a 401 it renews the token once.
- **Settings > Diagnostics** shows display mode, the method in use, time left on the token and the
  last error. **Copy diagnostics** puts all of it on the clipboard so you can paste it into a bug report.

## Google Cloud setup

Do this once, in your own Google Cloud project.

1. **Create a project** at <https://console.cloud.google.com/>, for example `training-hub`. Note
   the **project number** (Dashboard > Project info). Picker needs it as the app ID.
2. **Enable APIs** (APIs & Services > Library): **Google Sheets API**, **Google Drive API** and
   **Google Picker API**.
3. **Set up the OAuth consent screen** (Google Auth Platform):
   - Branding: app name *Training Hub*, your support email, and the app home page
     `https://<github-user>.github.io/<repo>/`. Authorized domain: `<github-user>.github.io`.
   - Audience: **External**.
   - Data access: add the single scope `https://www.googleapis.com/auth/drive.file`. It is a
     non-sensitive scope, so Google's sensitive-scope verification does not apply.
   - Audience > **Publish app** to move it from *Testing* to **In production**. While in Testing,
     only listed test users can sign in. Publishing lets your coach and clients sign in without
     being listed. If Google asks for brand verification for the name or logo, follow its prompts.
4. **Create an OAuth client** (Clients > Create client > *Web application*):
   - Authorized JavaScript origins:
     - `https://<github-user>.github.io`
     - `http://localhost:5173` (dev)
     - `http://localhost:4173` (preview)
   - Authorized redirect URIs (used by full-page sign-in, trailing slash included):
     - `https://<github-user>.github.io/<repo>/`
     - `http://localhost:5173/`
     - `http://localhost:4173/<repo>/` (only for testing a production build locally)
   - Copy the **Client ID**. There is no client secret to handle: this is a browser app.
5. **Create an API key for Picker** (Credentials > Create credentials > API key). Restrict it:
   - Application restrictions: *Websites*, `https://<github-user>.github.io/*` and `http://localhost:5173/*`.
   - API restrictions: **Google Picker API** only.

## GitHub setup

1. Create a **public** repo (for example `training-hub`) and push this folder as its root.
2. Settings > Pages > Source: **GitHub Actions**.
3. Settings > Secrets and variables > Actions > **Variables**. Add these as variables, not secrets;
   they are not secret, because they ship in the page:
   - `GOOGLE_CLIENT_ID`: the OAuth client ID
   - `GOOGLE_API_KEY`: the restricted Picker key (from step 4)
   - `GOOGLE_APP_ID`: the project **number**
4. Push to `main`. The workflow runs the tests, builds with `BASE_PATH=/<repo>/` and deploys to
   `https://<github-user>.github.io/<repo>/`.

## Local development

```sh
npm install
cp web/.env.example web/.env.local   # fill in VITE_GOOGLE_CLIENT_ID
npm run dev                          # http://localhost:5173
npm test                             # unit tests
npm run typecheck
```

## Step 1 test checklist (on real phones)

Test on an **installed** app, not only in a browser tab.

- [ ] iPhone: in Safari, open the site and Add to Home Screen. Open the installed app.
- [ ] Sign in with Google. Full-page mode is the default here; you should land back in the app, signed in.
- [ ] Create my sheet. A new `Training Hub – <name>` sheet appears in your Drive with 8 tabs.
- [ ] Check sheet structure reports "All 8 tabs and columns are in place."
- [ ] Close the app, wait more than an hour, and reopen it. It renews silently, or shows *Tap to
      continue*, and one tap fixes it.
- [ ] Settings > Sign-in method > Google pop-up, then Renew now. Note whether the pop-up works here.
- [ ] Android (Chrome): open the site, then Install app. Repeat the steps above. The pop-up is the
      default here.
- [ ] If anything fails: Settings > Copy diagnostics, and send me the text.
