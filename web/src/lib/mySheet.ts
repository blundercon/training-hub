/** The signed-in user's own client sheet: remembered per Google account on this device. */
import { sheets } from './api';
import { type SheetRef } from './sheets';
import { createStore, local } from './store';

export interface MySheetState {
  status: 'unknown' | 'looking' | 'none' | 'ready' | 'creating' | 'error';
  sheet?: SheetRef;
  error?: string;
}

export const mySheet = createStore<MySheetState>({ status: 'unknown' });
const key = (email: string) => `th.mySheet.${email}`;

export async function loadMySheet(email: string): Promise<void> {
  const cached = local.get<SheetRef>(key(email));
  if (cached) return mySheet.set({ status: 'ready', sheet: cached, error: undefined });
  mySheet.set({ status: 'looking', error: undefined });
  try {
    const found = await sheets.findOwnClientSheets();
    const sheet = found[0];
    if (sheet) local.set(key(email), sheet);
    mySheet.set({ status: sheet ? 'ready' : 'none', sheet });
  } catch (e) {
    mySheet.set({ status: 'error', error: (e as Error).message });
  }
}

export async function createMySheet(name: string, email: string): Promise<void> {
  mySheet.set({ status: 'creating', error: undefined });
  try {
    const sheet = await sheets.createClientSheet(name, email);
    local.set(key(email), sheet);
    mySheet.set({ status: 'ready', sheet });
  } catch (e) {
    mySheet.set({ status: 'none', error: (e as Error).message });
  }
}

export function forgetMySheet(email: string): void {
  local.remove(key(email));
  mySheet.set({ status: 'unknown', sheet: undefined });
}
