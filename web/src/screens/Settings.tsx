import { useEffect, useState } from 'preact/hooks';
import { auth, effectiveMethod, renew, setMethodPref, signIn, signOut, type AuthMethodPref } from '../lib/auth';
import { config, redirectUri } from '../lib/config';
import { forgetMySheet, mySheet } from '../lib/mySheet';
import { detectPlatform } from '../lib/platform';
import { useStore } from '../lib/store';
import { InstallHint } from '../ui/InstallHint';
import { SignInHelp } from '../ui/SignInHelp';

function fmtLeft(ms: number): string {
  if (ms <= 0) return 'expired';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export function Settings() {
  const a = useStore(auth);
  const s = useStore(mySheet);
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const p = detectPlatform();

  const diag = {
    version: config.version,
    status: a.status,
    tokenLeft: a.expiresAt ? fmtLeft(a.expiresAt - now) : '-',
    methodSetting: a.method,
    methodInUse: effectiveMethod(),
    lastMethodUsed: a.lastMethodUsed ?? '-',
    gisLoaded: a.gisReady,
    displayMode: p.displayMode,
    standalone: p.standalone,
    platform: p.ios ? 'iOS' : p.android ? 'Android' : 'other',
    redirectUri: redirectUri(),
    sheet: s.sheet ? 'found' : s.status,
    lastError: a.lastError ?? '-',
    userAgent: navigator.userAgent,
  };

  return (
    <section class="stack">
      <div class="card">
        <h2>Account</h2>
        {a.user ? (
          <>
            <p>{a.user.name} · {a.user.email}</p>
            <div class="row">
              {a.status === 'signed-in' || a.status === 'expired' ? (
                <button class="secondary" onClick={() => renew()}>Renew now</button>
              ) : (
                <button class="secondary" onClick={() => signIn()}>Sign in</button>
              )}
              <button
                class="link"
                onClick={() => {
                  forgetMySheet(a.user!.email);
                  signOut();
                  location.hash = '#/';
                }}
              >
                Sign out on this device
              </button>
            </div>
          </>
        ) : (
          <button class="primary" onClick={() => signIn()}>Sign in with Google</button>
        )}
      </div>
      <SignInHelp />

      <div class="card">
        <h2>Sign-in method</h2>
        <p class="hint">Auto uses full-page sign-in on an iPhone home-screen app and the Google pop-up everywhere else.</p>
        {(['auto', 'popup', 'redirect'] as AuthMethodPref[]).map((m) => (
          <label class="radio" key={m}>
            <input type="radio" name="method" checked={a.method === m} onChange={() => setMethodPref(m)} />
            {m === 'auto' ? 'Auto' : m === 'popup' ? 'Google pop-up' : 'Full page'}
          </label>
        ))}
      </div>

      <div class="card">
        <h2>Diagnostics</h2>
        <dl class="diag">
          {Object.entries(diag).map(([k, v]) => (
            <>
              <dt>{k}</dt>
              <dd>{String(v)}</dd>
            </>
          ))}
        </dl>
        <button
          class="secondary"
          onClick={() => {
            void navigator.clipboard?.writeText(JSON.stringify(diag, null, 2)).then(() => setCopied(true));
          }}
        >
          {copied ? 'Copied' : 'Copy diagnostics'}
        </button>
      </div>
      <InstallHint />
    </section>
  );
}
