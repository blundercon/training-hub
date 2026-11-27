import { useEffect } from 'preact/hooks';
import { auth } from './lib/auth';
import { loadMySheet } from './lib/mySheet';
import { href, useRoute } from './lib/router';
import { useStore } from './lib/store';
import { SignIn } from './screens/SignIn';
import { Home } from './screens/Home';
import { Settings } from './screens/Settings';
import { RenewBanner } from './ui/RenewBanner';
import { UpdateToast } from './ui/UpdateToast';

export function App() {
  const a = useStore(auth);
  const route = useRoute();
  const email = a.user?.email;

  // Uses the sheet remembered on this device first; only searches Drive (and so waits for a valid token) if there is none.
  useEffect(() => {
    if (email) void loadMySheet(email);
  }, [email]);

  // Never been signed in on this device (or signed out): only the sign-in screen and settings.
  const known = !!a.user;

  return (
    <div class="shell">
      <header class="top">
        <a class="brand" href={href('home')}>Training Hub</a>
        {known && <span class="chip" title={a.user!.email}>{a.user!.name || a.user!.email}</span>}
      </header>
      {known && <RenewBanner />}
      <main>
        {route === 'settings' ? <Settings /> : known ? <Home /> : <SignIn />}
      </main>
      <nav class="tabs">
        <a href={href('home')} aria-current={route === 'home' ? 'page' : undefined}>Home</a>
        <a href={href('settings')} aria-current={route === 'settings' ? 'page' : undefined}>Settings</a>
      </nav>
      <UpdateToast />
    </div>
  );
}
