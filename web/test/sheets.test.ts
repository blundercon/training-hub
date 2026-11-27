import { describe, expect, it } from 'vitest';
import { NotTrainingHubSheetError, createSheetsApi } from '../src/lib/sheets';
import type { Http } from '../src/lib/http';

type Call = { url: string; method: string; body?: unknown };

function fakeHttp(routes: (c: Call) => unknown) {
  const calls: Call[] = [];
  const http = (async (url: string, init: { method?: string; body?: unknown } = {}) => {
    const c = { url, method: init.method ?? 'GET', body: init.body };
    calls.push(c);
    return routes(c);
  }) as Http;
  return { http, calls };
}

describe('write guard', () => {
  it('refuses to write to a sheet Training Hub did not create, and makes no write call', async () => {
    const { http, calls } = fakeHttp((c) => (c.url.includes('/drive/v3/files/') ? { name: 'Training Hub Data', appProperties: {} } : {}));
    const api = createSheetsApi(http);
    await expect(api.ensureSchema('ORIGINAL')).rejects.toBeInstanceOf(NotTrainingHubSheetError);
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });

  it('allows a Training Hub client sheet', async () => {
    const { http } = fakeHttp((c) => {
      if (c.url.includes('/drive/v3/files/')) return { name: 'Training Hub – Hari', appProperties: { th_kind: 'client' } };
      if (c.url.includes('fields=sheets.properties.title')) return { sheets: [] };
      return {};
    });
    const api = createSheetsApi(http);
    const fix = await api.ensureSchema('NEW');
    expect(fix.addTabs).toHaveLength(8);
  });
});

describe('createClientSheet', () => {
  it('creates in one call, then tags it as a Training Hub sheet', async () => {
    const { http, calls } = fakeHttp((c) => (c.method === 'POST' ? { spreadsheetId: 'NEW1' } : {}));
    const api = createSheetsApi(http);
    const ref = await api.createClientSheet('Hari', 'h@example.com');
    expect(ref).toEqual({ id: 'NEW1', name: 'Training Hub – Hari', url: 'https://docs.google.com/spreadsheets/d/NEW1/edit' });
    expect(calls.map((c) => `${c.method} ${c.url.split('?')[0]}`)).toEqual([
      'POST https://sheets.googleapis.com/v4/spreadsheets',
      'PATCH https://www.googleapis.com/drive/v3/files/NEW1',
    ]);
    expect(calls[1]!.body).toEqual({ appProperties: { th_kind: 'client', th_schema: '1' } });
  });
});
