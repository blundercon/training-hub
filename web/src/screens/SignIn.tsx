import { auth, signIn } from '../lib/auth';
import { config } from '../lib/config';
import { useStore } from '../lib/store';
import { InstallHint } from '../ui/InstallHint';
import { SignInHelp } from '../ui/SignInHelp';

export function SignIn() {
  const a = useStore(auth);
  return (
    <section class="stack">
      <div class="card">
        <h1>Training Hub</h1>
        <p>Your workouts live in a Google Sheet in your own Drive. Your coach sees it because you share it with them.</p>
        <p class="hint">
          Training Hub can only open files it creates or that you pick. It cannot see the rest of your Drive.
        </p>
        {/* signIn runs synchronously inside this tap: required for iPhone and pop-up blockers. */}
        <button class="primary" disabled={a.status === 'signing-in'} onClick={() => signIn()}>
          {a.status === 'signing-in' ? 'Waiting for Google…' : 'Sign in with Google'}
        </button>
        {!config.clientId && <p class="error">Not configured: missing VITE_GOOGLE_CLIENT_ID.</p>}
      </div>
      <SignInHelp />
      <InstallHint />
    </section>
  );
}
