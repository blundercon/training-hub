/**
 * Drive and Sheets calls.
 *
 * Safety: with the drive.file scope Google only lets this app see files it created or that
 * the user explicitly picked in Google Picker. On top of that, every write first checks the
 * file carries Training Hub's own app properties, so a picked file that is not a Training Hub
 * sheet (for example the old "Training Hub Data" sheet) can be read but never written.
 */
import { ApiError, type Http } from './http';
import { APP_PROPS, SCHEMA_VERSION, TABS, a1, buildCreateRequest, columnLetter, planSchemaFix, type SchemaFix, type SheetKind } from './schema';

const DRIVE = 'https://www.googleapis.com/drive/v3';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';

export interface SheetRef {
  id: string;
  name: string;
  url: string;
}

export class NotTrainingHubSheetError extends Error {
  constructor(name: string) {
    super(`"${name}" was not created by Training Hub, so the app will only read it, never write to it.`);
  }
}

export function sheetUrl(id: string): string {
  return `https://docs.google.com/spreadsheets/d/${id}/edit`;
}

export function createSheetsApi(http: Http) {
  const verified = new Map<string, SheetKind>();

  /** Throws unless the file was created by Training Hub. Cached per session. */
  async function assertWritable(id: string): Promise<SheetKind> {
    const cached = verified.get(id);
    if (cached) return cached;
    const f = await http<{ name: string; appProperties?: Record<string, string> }>(
      `${DRIVE}/files/${encodeURIComponent(id)}?fields=name,appProperties&supportsAllDrives=true`,
    );
    const kind = f.appProperties?.[APP_PROPS.kind];
    if (kind !== 'client' && kind !== 'coach-index') throw new NotTrainingHubSheetError(f.name);
    verified.set(id, kind);
    return kind;
  }

  /** Finds client sheets this user owns that Training Hub created (works on a new phone too). */
  async function findOwnClientSheets(): Promise<SheetRef[]> {
    const q = `appProperties has { key='${APP_PROPS.kind}' and value='client' } and 'me' in owners and trashed=false`;
    const r = await http<{ files: { id: string; name: string }[] }>(
      `${DRIVE}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&orderBy=createdTime&pageSize=10`,
    );
    return r.files.map((f) => ({ ...f, url: sheetUrl(f.id) }));
  }

  /** Creates a brand-new client sheet in the user's Drive: 2 API calls. */
  async function createClientSheet(clientName: string, email: string): Promise<SheetRef> {
    const title = `Training Hub – ${clientName}`;
    const profile: [string, string][] = [
      ['name', clientName],
      ['email', email],
      ['role', 'client'],
      ['coach email', ''],
      ['units', 'Logged as entered: kg for machines/cables, lb for dumbbells/plate-loaded. Never converted.'],
      ['schema version', String(SCHEMA_VERSION)],
      ['created at', new Date().toISOString()],
    ];
    const created = await http<{ spreadsheetId: string }>(SHEETS, { method: 'POST', body: buildCreateRequest(title, TABS, profile) });
    await http(`${DRIVE}/files/${created.spreadsheetId}?fields=id`, {
      method: 'PATCH',
      body: { appProperties: { [APP_PROPS.kind]: 'client', [APP_PROPS.schema]: String(SCHEMA_VERSION) } },
    });
    verified.set(created.spreadsheetId, 'client');
    return { id: created.spreadsheetId, name: title, url: sheetUrl(created.spreadsheetId) };
  }

  /** Reads header rows of all tabs in one call. */
  async function readHeaders(id: string): Promise<Record<string, string[] | undefined>> {
    const meta = await http<{ sheets: { properties: { title: string } }[] }>(`${SHEETS}/${id}?fields=sheets.properties.title`);
    const titles = meta.sheets.map((s) => s.properties.title);
    if (!titles.length) return {};
    const qs = titles.map((t) => `ranges=${encodeURIComponent(a1(t, '1:1'))}`).join('&');
    const r = await http<{ valueRanges: { values?: string[][] }[] }>(`${SHEETS}/${id}/values:batchGet?${qs}`);
    return Object.fromEntries(titles.map((t, i) => [t, r.valueRanges[i]?.values?.[0] ?? []]));
  }

  /** Adds any missing tabs or columns (append-only). Returns what was changed. At most 2 extra calls. */
  async function ensureSchema(id: string): Promise<SchemaFix> {
    await assertWritable(id);
    const fix = planSchemaFix(await readHeaders(id));
    if (fix.addTabs.length) {
      await http(`${SHEETS}/${id}:batchUpdate`, {
        method: 'POST',
        body: { requests: fix.addTabs.map((title) => ({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } })) },
      });
    }
    if (fix.addColumns.length) {
      await http(`${SHEETS}/${id}/values:batchUpdate`, {
        method: 'POST',
        body: {
          valueInputOption: 'RAW',
          data: fix.addColumns.map((c) => ({ range: a1(c.tab, `${columnLetter(c.startColumn)}1`), values: [c.headers] })),
        },
      });
    }
    return fix;
  }

  /** Profile tab as a field -> value map. */
  async function readProfile(id: string): Promise<Record<string, string>> {
    const r = await http<{ values?: string[][] }>(`${SHEETS}/${id}/values/${encodeURIComponent(a1('Profile', 'A2:B'))}`);
    return Object.fromEntries((r.values ?? []).filter((row) => row[0]).map((row) => [row[0]!, row[1] ?? '']));
  }

  return { assertWritable, findOwnClientSheets, createClientSheet, readHeaders, ensureSchema, readProfile };
}

export type SheetsApi = ReturnType<typeof createSheetsApi>;
export { ApiError };
