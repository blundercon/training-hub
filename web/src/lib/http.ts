/**
 * Authorised JSON requests to Google APIs, with retry and exponential back-off on
 * 429 (quota) and 5xx, and one token refresh on 401.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface HttpDeps {
  fetch: typeof fetch;
  getToken: () => Promise<string>;
  onUnauthorized: () => void;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const RETRY = new Set([429, 500, 502, 503, 504]);

/** Delay before retry number `attempt` (0-based): 1s, 2s, 4s, 8s, 16s, capped at 32s, plus up to 1s jitter. */
export function backoffMs(attempt: number, retryAfterHeader: string | null, random = Math.random): number {
  const ra = retryAfterHeader ? Number(retryAfterHeader) : NaN;
  if (Number.isFinite(ra) && ra >= 0) return Math.min(ra, 60) * 1000;
  return Math.min(1000 * 2 ** attempt, 32_000) + Math.floor(random() * 1000);
}

export function createHttp(deps: HttpDeps, maxRetries = 5) {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  return async function request<T>(url: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
    let retried401 = false;
    for (let attempt = 0; ; attempt++) {
      const token = await deps.getToken();
      let res: Response;
      try {
        res = await deps.fetch(url, {
          method: init.method ?? 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...init.headers,
          },
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
        });
      } catch (e) {
        // Network drop (tunnel, gym basement). Retry like a 503.
        if (attempt >= maxRetries) throw new ApiError(0, 'No connection to Google. Check your signal and try again.');
        await sleep(backoffMs(attempt, null, deps.random));
        continue;
      }
      if (res.ok) {
        const text = await res.text();
        return (text ? JSON.parse(text) : undefined) as T;
      }
      if (res.status === 401 && !retried401) {
        retried401 = true;
        deps.onUnauthorized();
        attempt--; // a renew is not a retry
        continue;
      }
      if (RETRY.has(res.status) && attempt < maxRetries) {
        await sleep(backoffMs(attempt, res.headers.get('Retry-After'), deps.random));
        continue;
      }
      throw new ApiError(res.status, await errorMessage(res));
    }
  };
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: { message?: string } };
    if (j.error?.message) return `${res.status}: ${j.error.message}`;
  } catch {
    /* not JSON */
  }
  return `Google returned ${res.status}`;
}

export type Http = ReturnType<typeof createHttp>;
