/**
 * Full-page (redirect) OAuth 2.0 implicit flow for browser apps.
 *
 * Used where the Google Identity Services popup is unreliable, mainly an iPhone
 * home-screen app: the page navigates to Google and Google navigates back to
 * the app with the token in the URL fragment. Pure functions only, so it is testable.
 */

export interface AuthUrlParams {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  /** '' (default) lets Google skip screens it can; 'none' never shows UI; 'consent' always asks. */
  prompt?: '' | 'none' | 'consent' | 'select_account';
  loginHint?: string;
}

export function buildAuthUrl(p: AuthUrlParams): string {
  const q = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: 'token',
    scope: p.scope,
    include_granted_scopes: 'true',
    state: p.state,
  });
  if (p.prompt) q.set('prompt', p.prompt);
  if (p.loginHint) q.set('login_hint', p.loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
}

export type RedirectResult =
  | { kind: 'none' }
  | { kind: 'token'; state: string; accessToken: string; expiresIn: number; scope: string }
  | { kind: 'error'; state: string; error: string };

/** Reads the fragment Google appends on return. Returns kind 'none' for ordinary app routes like "#/settings". */
export function parseRedirectHash(hash: string): RedirectResult {
  const h = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!/(^|&)(access_token|error)=/.test(h)) return { kind: 'none' };
  const q = new URLSearchParams(h);
  const state = q.get('state') ?? '';
  const error = q.get('error');
  if (error) return { kind: 'error', state, error };
  const accessToken = q.get('access_token') ?? '';
  const expiresIn = Number(q.get('expires_in') ?? '3600');
  return { kind: 'token', state, accessToken, expiresIn: Number.isFinite(expiresIn) ? expiresIn : 3600, scope: q.get('scope') ?? '' };
}

export function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** True when every space-separated scope in `wanted` was granted. */
export function hasScopes(granted: string, wanted: string): boolean {
  const g = new Set(granted.split(/\s+/).filter(Boolean));
  return wanted.split(/\s+/).filter(Boolean).every((s) => g.has(s));
}
