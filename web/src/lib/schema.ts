/**
 * The Training Hub sheet layout, version 1.
 *
 * Changes are append-only: new tabs or new columns at the end. Existing columns are never
 * renamed, moved or removed, so older app versions and hand edits keep working.
 */

export const SCHEMA_VERSION = 1;

/** Drive appProperties that mark a sheet as created by Training Hub. Writes are refused without them. */
export const APP_PROPS = { kind: 'th_kind', schema: 'th_schema' } as const;
export type SheetKind = 'client' | 'coach-index';

export const TABS = {
  Profile: ['field', 'value'],
  Plan: ['Key', 'day', 'order', 'exercise', 'sets', 'reps', 'target RPE', 'note', 'written by', 'updated at'],
  // Fixed by the spec. "sets" keeps the raw string, e.g. "40kg*12 40kg*12"; units are never converted.
  Logs: ['Key', 'date', 'exercise', 'unit', 'sets', 'RPE', 'note', 'source', 'written by', 'logged at'],
  Body: ['Key', 'date', 'weight', 'unit', 'body fat %', 'muscle mass', 'waist', 'source', 'note', 'written by', 'logged at'],
  Meals: ['Key', 'date', 'meal', 'description', 'kcal', 'protein g', 'carbs g', 'fat g', 'source', 'written by', 'logged at'],
  Checkins: ['Key', 'date', 'sleep h', 'energy', 'soreness', 'stress', 'steps', 'note', 'written by', 'logged at'],
  Notes: ['Key', 'date', 'kind', 'text', 'written by', 'logged at'],
  Exercises: ['name', 'aliases', 'muscle', 'equipment', 'unit'],
} as const satisfies Record<string, readonly string[]>;

export type TabName = keyof typeof TABS;
export const TAB_NAMES = Object.keys(TABS) as TabName[];

export const COACH_INDEX_TABS = {
  Clients: ['sheet id', 'name', 'email', 'added at', 'active'],
} as const satisfies Record<string, readonly string[]>;

export interface SchemaFix {
  addTabs: string[];
  /** Headers to write after the last existing header, per tab. */
  addColumns: { tab: string; startColumn: number; headers: string[] }[];
}

/**
 * Compares the header rows found in a sheet with the expected layout and lists what to append.
 * Extra tabs and extra columns the user added by hand are left alone.
 */
export function planSchemaFix(
  existing: Record<string, string[] | undefined>,
  expected: Record<string, readonly string[]> = TABS,
): SchemaFix {
  const fix: SchemaFix = { addTabs: [], addColumns: [] };
  for (const [tab, headers] of Object.entries(expected)) {
    const have = existing[tab];
    if (!have) {
      fix.addTabs.push(tab);
      fix.addColumns.push({ tab, startColumn: 0, headers: [...headers] });
      continue;
    }
    const norm = new Set(have.map((h) => h.trim().toLowerCase()));
    const missing = headers.filter((h) => !norm.has(h.toLowerCase()));
    if (missing.length) fix.addColumns.push({ tab, startColumn: have.length, headers: missing });
  }
  return fix;
}

/** 0 -> A, 25 -> Z, 26 -> AA. */
export function columnLetter(index: number): string {
  let s = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Quotes a tab name for A1 notation. */
export function a1(tab: string, range: string): string {
  return `'${tab.replace(/'/g, "''")}'!${range}`;
}

type Cell = { userEnteredValue: { stringValue: string }; userEnteredFormat?: object };
const bold = { textFormat: { bold: true } };
const row = (values: readonly string[], header = false) => ({
  values: values.map((v): Cell => ({ userEnteredValue: { stringValue: v }, ...(header ? { userEnteredFormat: bold } : {}) })),
});

/** Body for spreadsheets.create: every tab with a bold, frozen header row, plus the Profile values. One API call. */
export function buildCreateRequest(
  title: string,
  tabs: Record<string, readonly string[]>,
  profile: [string, string][] = [],
): object {
  return {
    properties: { title },
    sheets: Object.entries(tabs).map(([name, headers], i) => ({
      properties: { sheetId: i, title: name, index: i, gridProperties: { frozenRowCount: 1 } },
      data: [
        {
          startRow: 0,
          startColumn: 0,
          // Keep Profile values as typed text so dates and IDs aren't reformatted.
          rowData: [row(headers, true), ...(name === 'Profile' ? profile.map(([k, v]) => row([k, v])) : [])],
        },
      ],
    })),
  };
}
