import { describe, expect, it, vi } from 'vitest';
import { ApiError, backoffMs, createHttp } from '../src/lib/http';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

function setup(responses: (Response | Error)[]) {
  const calls: { url: string; auth: string | null }[] = [];
  const sleeps: number[] = [];
  let token = 't1';
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, auth: (init.headers as Record<string, string>).Authorization ?? null });
    const r = responses.shift()!;
    if (r instanceof Error) throw r;
    return r;
  });
  const onUnauthorized = vi.fn(() => {
    token = 't2';
  });
  const http = createHttp({
    fetch: fetchMock as unknown as typeof fetch,
    getToken: async () => token,
    onUnauthorized,
    sleep: async (ms) => void sleeps.push(ms),
    random: () => 0,
  });
  return { http, calls, sleeps, onUnauthorized };
}

describe('backoffMs', () => {
  it('doubles from 1s and caps at 32s', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map((a) => backoffMs(a, null, () => 0))).toEqual([1000, 2000, 4000, 8000, 16000, 32000, 32000]);
  });
  it('honours Retry-After seconds', () => {
    expect(backoffMs(0, '7')).toBe(7000);
  });
});

describe('createHttp', () => {
  it('sends the bearer token and parses JSON', async () => {
    const { http, calls } = setup([json(200, { ok: 1 })]);
    expect(await http('https://x')).toEqual({ ok: 1 });
    expect(calls[0]!.auth).toBe('Bearer t1');
  });

  it('backs off on 429 and 503, then succeeds', async () => {
    const { http, sleeps } = setup([json(429, {}), json(503, {}), json(200, { done: true })]);
    expect(await http('https://x')).toEqual({ done: true });
    expect(sleeps).toEqual([1000, 2000]);
  });

  it('gives up after max retries with the Google message', async () => {
    const r = Array.from({ length: 6 }, () => json(429, { error: { message: 'Quota exceeded' } }));
    const { http } = setup(r);
    await expect(http('https://x')).rejects.toMatchObject({ status: 429, message: '429: Quota exceeded' });
  });

  it('on 401 renews once and retries with the new token', async () => {
    const { http, calls, onUnauthorized } = setup([json(401, {}), json(200, { ok: 1 })]);
    expect(await http('https://x')).toEqual({ ok: 1 });
    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(calls.map((c) => c.auth)).toEqual(['Bearer t1', 'Bearer t2']);
  });

  it('does not loop on repeated 401', async () => {
    const { http } = setup([json(401, {}), json(401, {})]);
    await expect(http('https://x')).rejects.toBeInstanceOf(ApiError);
  });

  it('retries network failures', async () => {
    const { http } = setup([new TypeError('Failed to fetch'), json(200, { ok: 1 })]);
    expect(await http('https://x')).toEqual({ ok: 1 });
  });

  it('does not retry 400 or 403', async () => {
    const { http, calls } = setup([json(403, { error: { message: 'nope' } })]);
    await expect(http('https://x')).rejects.toMatchObject({ status: 403 });
    expect(calls).toHaveLength(1);
  });
});
