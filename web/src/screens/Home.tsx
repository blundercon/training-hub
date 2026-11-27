import { useState } from 'preact/hooks';
import { auth } from '../lib/auth';
import { sheets } from '../lib/api';
import { createMySheet, loadMySheet, mySheet } from '../lib/mySheet';
import { useStore } from '../lib/store';
import { InstallHint } from '../ui/InstallHint';
import { SignInHelp } from '../ui/SignInHelp';

export function Home() {
  const a = useStore(auth);
  const s = useStore(mySheet);
  const [name, setName] = useState(a.user?.name ?? '');
  const [check, setCheck] = useState<string>();
  const email = a.user!.email;

  async function verify() {
    if (!s.sheet) return;
    setCheck('Checking…');
    try {
      const fix = await sheets.ensureSchema(s.sheet.id);
      const n = fix.addTabs.length + fix.addColumns.length;
      setCheck(n ? `Fixed: added ${fix.addTabs.length} tab(s) and columns in ${fix.addColumns.length} tab(s).` : 'All 8 tabs and columns are in place.');
    } catch (e) {
      setCheck((e as Error).message);
    }
  }

  return (
    <section class="stack">
      <SignInHelp />
      {(s.status === 'unknown' || s.status === 'looking') && <div class="card">Looking for your Training Hub sheet…</div>}

      {s.status === 'error' && (
        <div class="card">
          <p class="error">{s.error}</p>
          <button class="secondary" onClick={() => loadMySheet(email)}>Try again</button>
        </div>
      )}

      {(s.status === 'none' || s.status === 'creating') && (
        <form
          class="card"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void createMySheet(name.trim(), email);
          }}
        >
          <h2>Create your Training Hub sheet</h2>
          <p>
            This makes a <strong>new</strong> Google Sheet in your Drive with the tabs Profile, Plan, Logs, Body, Meals,
            Checkins, Notes and Exercises. Nothing existing is opened or changed.
          </p>
          <label>
            Your name
            <input value={name} onInput={(e) => setName(e.currentTarget.value)} autocomplete="name" required />
          </label>
          <button class="primary" disabled={s.status === 'creating' || a.status !== 'signed-in'}>
            {s.status === 'creating' ? 'Creating…' : 'Create my sheet'}
          </button>
          {s.error && <p class="error">{s.error}</p>}
        </form>
      )}

      {s.status === 'ready' && s.sheet && (
        <div class="card">
          <h2>Your sheet</h2>
          <p>
            <a href={s.sheet.url} target="_blank" rel="noopener">{s.sheet.name}</a>
          </p>
          <p class="hint">
            To give your coach access, open the sheet in Google Sheets, tap Share and add them as an editor.
          </p>
          <div class="row">
            <button class="secondary" onClick={verify} disabled={a.status !== 'signed-in'}>Check sheet structure</button>
          </div>
          {check && <p class="hint">{check}</p>}
        </div>
      )}
      <InstallHint />
    </section>
  );
}
