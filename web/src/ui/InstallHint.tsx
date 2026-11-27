import { useEffect, useState } from 'preact/hooks';
import { detectPlatform } from '../lib/platform';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

let deferred: BeforeInstallPromptEvent | undefined;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as BeforeInstallPromptEvent;
});

/** "Add to home screen" help. Android gets a real button; iPhone gets the Share-menu steps. */
export function InstallHint() {
  const p = detectPlatform();
  const [canPrompt, setCanPrompt] = useState(!!deferred);
  useEffect(() => {
    const on = () => setCanPrompt(true);
    window.addEventListener('beforeinstallprompt', on);
    return () => window.removeEventListener('beforeinstallprompt', on);
  }, []);
  if (p.standalone) return null;
  if (canPrompt)
    return (
      <button class="secondary" onClick={() => deferred?.prompt()}>
        Install the app
      </button>
    );
  if (p.ios)
    return (
      <p class="hint">
        To install on iPhone: open this page in Safari, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
      </p>
    );
  return <p class="hint">To install: open your browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p>;
}
