import { describe, expect, it } from 'vitest';
import { buildAuthUrl, hasScopes, parseRedirectHash } from '../src/lib/oauthRedirect';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';

describe('buildAuthUrl', () => {
  it('asks for a token with drive.file only', () => {
    const u = new URL(buildAuthUrl({ clientId: 'cid', redirectUri: 'https://x.github.io/training-hub/', scope: SCOPE, state: 's1', prompt: 'none', loginHint: 'a@b.c' }));
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(u.searchParams.get('response_type')).toBe('token');
    expect(u.searchParams.get('scope')).toBe(SCOPE);
    expect(u.searchParams.get('redirect_uri')).toBe('https://x.github.io/training-hub/');
    expect(u.searchParams.get('state')).toBe('s1');
    expect(u.searchParams.get('prompt')).toBe('none');
    expect(u.searchParams.get('login_hint')).toBe('a@b.c');
  });
  it('omits an empty prompt', () => {
    const u = new URL(buildAuthUrl({ clientId: 'c', redirectUri: 'r', scope: SCOPE, state: 's', prompt: '' }));
    expect(u.searchParams.has('prompt')).toBe(false);
  });
});

describe('parseRedirectHash', () => {
  it('ignores normal app routes', () => {
    expect(parseRedirectHash('#/settings')).toEqual({ kind: 'none' });
    expect(parseRedirectHash('')).toEqual({ kind: 'none' });
  });
  it('reads a token', () => {
    const r = parseRedirectHash(`#state=abc&access_token=ya29.x&token_type=Bearer&expires_in=3599&scope=${encodeURIComponent(SCOPE)}`);
    expect(r).toEqual({ kind: 'token', state: 'abc', accessToken: 'ya29.x', expiresIn: 3599, scope: SCOPE });
  });
  it('reads an error', () => {
    expect(parseRedirectHash('#error=interaction_required&state=abc')).toEqual({ kind: 'error', state: 'abc', error: 'interaction_required' });
  });
});

describe('hasScopes', () => {
  it('needs every wanted scope', () => {
    expect(hasScopes(`openid ${SCOPE}`, SCOPE)).toBe(true);
    expect(hasScopes('openid', SCOPE)).toBe(false);
  });
});
