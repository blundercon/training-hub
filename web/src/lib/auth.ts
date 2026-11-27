/**
 * Google sign-in with the Google Identity Services token model, scope drive.file only.
 *
 * Rules this file follows:
 *  - signIn() and renew() never await anything before asking Google for a token, so the
 *    request runs inside the user's tap. iOS and popup blockers only allow a popup there.
 *  - Two ways to get a token: the GIS popup (default) and a full-page redirect (default on an
 *    iPhone home-screen app, where popups often never report back). Either can be forced in Settings.
 *  - Tokens last about an hour. Five minutes before the end a banner asks for a tap to renew.
 *    Any API call made after expiry waits until the user renews, then carries on by itself.
 */
import { config, redirectUri } from './config';
import { createStore, local } from './store';
import { detectPlatform } from './platform';
import { buildAuthUrl, hasScopes, parseRedirectHash, randomState } from './oauthRedirect';

export type AuthMethodPref = 'auto' | 'popup' | 'redirect';
export type AuthMethod = 'popup' | 'redirect';
export type AuthStatus = 'signed-out' | 'signing-in' | 'signed-in' | 'expired';

export interface User {
  email: string;
  name: string;
  photo?: string;
}

export interface AuthState {
  status: AuthStatus;
  user?: User;
  expiresAt?: number;
  method: AuthMethodPref;
  gisReady: boolean;
  /** Token ends within RENEW_EARLY_MS: show the renew banner. */
  renewSoon: boolean;
  waitingSince?: number;
  lastError?: string;
  lastMethodUsed?: AuthMethod;
}

interface Token {
  accessToken: string;
  expiresAt: number;
}

interface PendingRedirect {
  state: string;
  returnHash: string;
  silent: boolean;
  at: number;
}

const K = {
  token: 'th.token',
  user: 'th.user',
  method: 'th.authMethod',
  pending: 'th.oauthPending',
  lastSilent: 'th.lastSilentRedirect',
};

export const RENEW_EARLY_MS = 5 * 60_000;
const MIN_VALID_MS = 60_000;

let token: Token | undefined = local.get<Token>(K.token);
let tokenClient: GisTokenClient | undefined;
let timers: ReturnType<typeof setTimeout>[] = [];
let waiters: { resolve: (t: string) => void; reject: (e: Error) => void }[] = [];

export const auth = createStore<AuthState>({
  status: 'signed-out',
  user: local.get<User>(K.user),
  method: local.get<AuthMethodPref>(K.method) ?? 'auto',
  gisReady: false,
  renewSoon: false,
});

export class SignedOutError extends Error {
  constructor() {
    super('Signed out');
  }
}

export function effectiveMethod(pref: AuthMethodPref = auth.get().method): AuthMethod {
  if (pref !== 'auto') return pref;
  const p = detectPlatform();
  return p.ios && p.standalone ? 'redirect' : 'popup';
}

export function setMethodPref(method: AuthMethodPref): void {
  local.set(K.method, method);
  auth.set({ method });
}

// ---------------------------------------------------------------- start-up

export function initAuth(): void {
  const returned = consumeRedirect();
  loadGis();
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && checkExpiry());
  window.addEventListener('focus', checkExpiry);
  if (returned) return;

  const user = auth.get().user;
  if (tokenValid()) {
    auth.set({ status: 'signed-in', expiresAt: token!.expiresAt });
    schedule();
  } else if (user) {
    auth.set({ status: 'expired' });
    // On the full-page flow we may bounce through Google without any UI ("prompt=none").
    // Never more than once every two minutes, so a failure cannot loop.
    const last = local.get<number>(K.lastSilent) ?? 0;
    if (effectiveMethod() === 'redirect' && navigator.onLine && Date.now() - last > 120_000 && config.clientId) {
      local.set(K.lastSilent, Date.now());
      startRedirect('none', user.email, true);
    }
  }
}

function loadGis(): void {
  if (!config.clientId || document.getElementById('gis-script')) return;
  const s = document.createElement('script');
  s.id = 'gis-script';
  s.src = 'https://accounts.google.com/gsi/client';
  s.async = true;
  s.onload = () => {
    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) return;
    tokenClient = oauth2.initTokenClient({
      client_id: config.clientId!,
      scope: config.scope,
      callback: (r) => {
        if (r.error) return fail(describeGoogleError(r.error, r.error_description));
        void acceptToken(r.access_token, Number(r.expires_in), r.scope, 'popup');
      },
      error_callback: (e) => {
        const why =
          e.type === 'popup_failed_to_open'
            ? 'The Google window could not open.'
            : e.type === 'popup_closed'
              ? 'The Google window was closed before sign-in finished.'
              : 'Google sign-in did not finish.';
        fail(`${why} Try "Full-page sign-in".`);
      },
    });
    auth.set({ gisReady: true });
  };
  s.onerror = () => auth.set({ lastError: 'Could not load Google sign-in. Check your connection.' });
  document.head.append(s);
}

// ---------------------------------------------------------------- user actions (call straight from a tap)

/** Starts sign-in. Call directly from a click handler: nothing here awaits before Google is asked. */
export function signIn(opts: { method?: AuthMethod; forceConsent?: boolean } = {}): void {
  if (!config.clientId) return fail('This build has no Google client ID. See README, "Google Cloud setup".');
  const method = opts.method ?? effectiveMethod();
  const hint = auth.get().user?.email;
  const prompt = opts.forceConsent ? 'consent' : '';
  auth.set({ status: 'signing-in', lastError: undefined, waitingSince: Date.now(), lastMethodUsed: method });
  if (method === 'popup' && tokenClient) {
    tokenClient.requestAccessToken({ prompt, login_hint: hint });
  } else {
    startRedirect(prompt, hint, false);
  }
}

/** Gets a fresh token before the current one ends. Same tap rule as signIn(). */
export function renew(method?: AuthMethod): void {
  signIn({ method });
}

export function cancelSignIn(): void {
  if (auth.get().status === 'signing-in') auth.set({ status: auth.get().user ? 'expired' : 'signed-out', waitingSince: undefined });
}

export function signOut(): void {
  clearToken();
  local.remove(K.user);
  auth.set({ status: 'signed-out', user: undefined, expiresAt: undefined, renewSoon: false, lastError: undefined });
  waiters.forEach((w) => w.reject(new SignedOutError()));
  waiters = [];
}

// ---------------------------------------------------------------- tokens for API calls

/** Resolves with a usable token. After expiry it waits until the user taps renew. */
export function getAccessToken(): Promise<string> {
  if (tokenValid()) return Promise.resolve(token!.accessToken);
  markExpired();
  return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
}

/** Called when Google answers 401: the token is no good, so drop it and wait for a renew. */
export function invalidateToken(): void {
  clearToken();
  markExpired();
}

// ---------------------------------------------------------------- internals

function tokenValid(): boolean {
  return !!token && token.expiresAt - Date.now() > MIN_VALID_MS;
}

function clearToken(): void {
  token = undefined;
  local.remove(K.token);
  timers.forEach(clearTimeout);
  timers = [];
}

function markExpired(): void {
  const s = auth.get();
  if (s.status === 'signed-in') auth.set({ status: s.user ? 'expired' : 'signed-out', renewSoon: false });
}

function checkExpiry(): void {
  if (!token) return;
  if (!tokenValid()) return markExpired();
  auth.set({ renewSoon: token.expiresAt - Date.now() < RENEW_EARLY_MS });
}

function schedule(): void {
  timers.forEach(clearTimeout);
  timers = [];
  if (!token) return;
  const left = token.expiresAt - Date.now();
  timers.push(setTimeout(() => auth.set({ renewSoon: true }), Math.max(0, left - RENEW_EARLY_MS)));
  timers.push(setTimeout(markExpired, Math.max(0, left - MIN_VALID_MS)));
}

function fail(message: string): void {
  const s = auth.get();
  auth.set({
    status: s.status === 'signing-in' ? (s.user ? 'expired' : 'signed-out') : s.status,
    lastError: message,
    waitingSince: undefined,
  });
}

function describeGoogleError(code: string, description?: string): string {
  if (code === 'access_denied') return 'Google sign-in was cancelled or access was not allowed.';
  return `Google sign-in failed (${code}${description ? `: ${description}` : ''}).`;
}

async function acceptToken(accessToken: string, expiresIn: number, scope: string, via: AuthMethod): Promise<void> {
  if (!hasScopes(scope, config.scope)) {
    return fail('Training Hub needs permission to see the files it creates. Sign in again and tick the Google Drive box.');
  }
  token = { accessToken, expiresAt: Date.now() + expiresIn * 1000 };
  local.set(K.token, token);
  local.remove(K.lastSilent);
  try {
    const user = await fetchUser(accessToken);
    local.set(K.user, user);
    auth.set({ user });
  } catch {
    // Keep the token; the account chip falls back to the last known user.
  }
  auth.set({ status: 'signed-in', expiresAt: token.expiresAt, renewSoon: false, lastError: undefined, waitingSince: undefined, lastMethodUsed: via });
  schedule();
  const ready = waiters;
  waiters = [];
  ready.forEach((w) => w.resolve(accessToken));
}

/** drive.file still allows about.get, which gives the email used for "written by". */
async function fetchUser(accessToken: string): Promise<User> {
  const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress,photoLink)', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`about.get ${res.status}`);
  const { user } = (await res.json()) as { user: { displayName: string; emailAddress: string; photoLink?: string } };
  return { email: user.emailAddress, name: user.displayName, photo: user.photoLink };
}

function startRedirect(prompt: '' | 'none' | 'consent', loginHint: string | undefined, silent: boolean): void {
  const state = randomState();
  const pending: PendingRedirect = { state, returnHash: location.hash.includes('access_token') ? '' : location.hash, silent, at: Date.now() };
  local.set(K.pending, pending);
  location.assign(buildAuthUrl({ clientId: config.clientId!, redirectUri: redirectUri(), scope: config.scope, state, prompt, loginHint }));
}

/** Picks up the token Google put in the URL after a full-page sign-in. Returns true if there was one. */
function consumeRedirect(): boolean {
  const r = parseRedirectHash(location.hash);
  if (r.kind === 'none') return false;
  const pending = local.get<PendingRedirect>(K.pending);
  local.remove(K.pending);
  // Remove the token from the address bar and history straight away.
  history.replaceState(null, '', location.pathname + location.search + (pending?.returnHash ?? ''));
  if (!pending || pending.state !== r.state) {
    fail('That sign-in response did not come from this device. Please sign in again.');
    if (auth.get().user) auth.set({ status: 'expired' });
    return true;
  }
  if (r.kind === 'error') {
    auth.set({ status: auth.get().user ? 'expired' : 'signed-out' });
    // A silent attempt that needs the user to click something is normal: just show the banner.
    if (!(pending.silent && ['interaction_required', 'login_required', 'consent_required'].includes(r.error))) {
      fail(describeGoogleError(r.error));
    }
    return true;
  }
  auth.set({ status: 'signing-in' });
  void acceptToken(r.accessToken, r.expiresIn, r.scope, 'redirect');
  return true;
}

// ---------------------------------------------------------------- minimal GIS typings

interface GisTokenResponse {
  access_token: string;
  expires_in: string;
  scope: string;
  error?: string;
  error_description?: string;
}
interface GisTokenClient {
  requestAccessToken(o?: { prompt?: string; login_hint?: string }): void;
}
declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient(c: {
            client_id: string;
            scope: string;
            callback: (r: GisTokenResponse) => void;
            error_callback?: (e: { type: string; message?: string }) => void;
          }): GisTokenClient;
        };
      };
    };
  }
}
