import { useEffect, useState } from 'preact/hooks';
import { registerSW } from 'virtual:pwa-register';

let update: ((reload?: boolean) => Promise<void>) | undefined;

export function UpdateToast() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    update = registerSW({ onNeedRefresh: () => setReady(true) });
  }, []);
  if (!ready) return null;
  return (
    <div class="toast">
      A new version is ready.
      <button onClick={() => update?.(true)}>Update</button>
    </div>
  );
}
