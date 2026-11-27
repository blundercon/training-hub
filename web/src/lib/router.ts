import { useEffect, useState } from 'preact/hooks';

export type Route = 'home' | 'settings';

function parse(hash: string): Route {
  return hash.replace(/^#\/?/, '') === 'settings' ? 'settings' : 'home';
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parse(location.hash));
  useEffect(() => {
    const on = () => setRoute(parse(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const href = (r: Route) => (r === 'home' ? '#/' : `#/${r}`);
