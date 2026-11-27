import { auth, renew } from '../lib/auth';
import { useStore } from '../lib/store';

/** Shown when the hour-long Google token is about to end or has ended. One tap renews it. */
export function RenewBanner() {
  const a = useStore(auth);
  if (a.status === 'signing-in') return <div class="banner">Waiting for Google…</div>;
  if (a.status === 'expired')
    return (
      <button class="banner warn" onClick={() => renew()}>
        Google session ended. <strong>Tap to continue</strong>
      </button>
    );
  if (a.status === 'signed-in' && a.renewSoon)
    return (
      <button class="banner" onClick={() => renew()}>
        Session ends in a few minutes. <strong>Tap to stay signed in</strong>
      </button>
    );
  return null;
}
