import { describe, expect, it } from 'vitest';
import { TABS, a1, buildCreateRequest, columnLetter, planSchemaFix } from '../src/lib/schema';

describe('TABS', () => {
  it('has the 8 client tabs in order', () => {
    expect(Object.keys(TABS)).toEqual(['Profile', 'Plan', 'Logs', 'Body', 'Meals', 'Checkins', 'Notes', 'Exercises']);
  });
  it('keeps the Logs columns exactly as specified', () => {
    expect(TABS.Logs).toEqual(['Key', 'date', 'exercise', 'unit', 'sets', 'RPE', 'note', 'source', 'written by', 'logged at']);
  });
});

describe('planSchemaFix', () => {
  it('nothing to do on a complete sheet', () => {
    const existing = Object.fromEntries(Object.entries(TABS).map(([k, v]) => [k, [...v]]));
    expect(planSchemaFix(existing)).toEqual({ addTabs: [], addColumns: [] });
  });
  it('adds missing tabs with headers and appends missing columns after hand-added ones', () => {
    const existing: Record<string, string[]> = Object.fromEntries(Object.entries(TABS).map(([k, v]) => [k, [...v]]));
    delete existing.Meals;
    existing.Notes = ['Key', 'date', 'my own column', 'kind', 'TEXT'];
    existing.Extra = ['anything'];
    const fix = planSchemaFix(existing);
    expect(fix.addTabs).toEqual(['Meals']);
    expect(fix.addColumns).toEqual([
      { tab: 'Meals', startColumn: 0, headers: [...TABS.Meals] },
      { tab: 'Notes', startColumn: 5, headers: ['written by', 'logged at'] },
    ]);
  });
});

describe('A1 helpers', () => {
  it('column letters', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnLetter)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
  });
  it('quotes tab names', () => {
    expect(a1("Coach's", 'A1')).toBe("'Coach''s'!A1");
  });
});

describe('buildCreateRequest', () => {
  it('creates every tab with a frozen bold header and Profile values', () => {
    const req = buildCreateRequest('Training Hub – Hari', TABS, [['name', 'Hari']]) as {
      properties: { title: string };
      sheets: { properties: { title: string; gridProperties: { frozenRowCount: number } }; data: { rowData: { values: { userEnteredValue: { stringValue: string } }[] }[] }[] }[];
    };
    expect(req.properties.title).toBe('Training Hub – Hari');
    expect(req.sheets.map((s) => s.properties.title)).toEqual(Object.keys(TABS));
    expect(req.sheets.every((s) => s.properties.gridProperties.frozenRowCount === 1)).toBe(true);
    const logs = req.sheets[2]!.data[0]!.rowData;
    expect(logs).toHaveLength(1);
    expect(logs[0]!.values.map((v) => v.userEnteredValue.stringValue)).toEqual([...TABS.Logs]);
    const profile = req.sheets[0]!.data[0]!.rowData;
    expect(profile[1]!.values.map((v) => v.userEnteredValue.stringValue)).toEqual(['name', 'Hari']);
  });
});
