import { useEffect, useState } from 'preact/hooks';
import { auth, cancelSignIn, effectiveMethod, signIn } from '../lib/auth';
import { redirectUri } from '../lib/config';
import { detectPlatform } from '../lib/platform';
import { useStore } from '../lib/store';

/** Fallbacks while waiting for, or after a failed, Google sign-in. */
export function SignInHelp() {
  const a = useStore(auth);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (a.status !== 'signing-in') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [a.status]);

  const stuck = a.status === 'signing-in' && a.waitingSince && now - a.waitingSince > 8000;
  const usedPopup = (a.lastMethodUsed ?? effectiveMethod()) === 'popup';
  const p = detectPlatform();
  const showHelp = stuck || !!a.lastError;
  if (!showHelp) return null;

  return (
    <div class="card help">
      {a.lastError && <p class="error">{a.lastError}</p>}
      {stuck && <p>Still waiting for Google?</p>}
      <div class="row">
        {usedPopup && (
          <button class="secondary" onClick={() => signIn({ method: 'redirect' })}>
            Full-page sign-in
          </button>
        )}
        {!usedPopup && (
          <button class="secondary" onClick={() => signIn({ method: 'popup' })}>
            Pop-up sign-in
          </button>
        )}
        {stuck && (
          <button class="link" onClick={cancelSignIn}>
            Cancel
          </button>
        )}
      </div>
      {p.ios && p.standalone && (
        <p class="hint">
          Last resort: <a href={`x-safari-${redirectUri()}`}>open Training Hub in Safari</a> and use it there. Note that
          iPhone keeps the home-screen app and Safari signed in separately.
        </p>
      )}
    </div>
  );
}
