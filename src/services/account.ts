import { useSyncExternalStore } from 'react';
import { SaveSummary, decodeCloudSave, deleteSaveGame, listSaveSummaries, loadSaveGame, persistSaveGame, readSaveForUpload, setSaveListener } from './db';
import type { GameSaveRecord } from './db';

// ---------------------------------------------------------------------------
// The player's optional account (the sign-in server, auth-worker/, on /api/auth) and cloud saves. Signed out, the
// game works exactly as before: saves stay on this device. Signed in, every save also uploads to the account, and
// the load screen offers the newest copy of each slot, from this device or the cloud.
// ---------------------------------------------------------------------------

const API = '/api/auth';

export interface Account {
  id: string;
  email: string | null;
  name: string | null;
  marketing: boolean;
  providers: string[];
}
export interface SignInOptions {
  google: boolean;
  facebook: boolean;
  email: boolean;
  cloudSaves: boolean;
  ducats: boolean; // the ducat store is open (Stripe is set up on the server)
}
export type SignInResult = 'ok' | 'failed' | 'expired' | 'unavailable';

interface AccountState {
  ready: boolean; // the session check finished (or the server couldn't be reached)
  user: Account | null;
  options: SignInOptions;
  result: SignInResult | null; // how the last sign-in went (from the page address after the provider sent the player back)
  sync: { status: 'idle' | 'syncing' | 'synced' | 'error'; at: number | null };
}

const NO_OPTIONS: SignInOptions = { google: false, facebook: false, email: false, cloudSaves: false, ducats: false };
let state: AccountState = { ready: false, user: null, options: NO_OPTIONS, result: null, sync: { status: 'idle', at: null } };
const listeners = new Set<() => void>();
const update = (patch: Partial<AccountState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export const accountState = () => state;
/** Calls back on every change to the account (sign-in, sign-out, the session check finishing). */
export function subscribeAccount(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function useAccount(): AccountState {
  return useSyncExternalStore(subscribeAccount, () => state);
}

/** Whether any way to sign in is on (the sign-in button hides when none is, e.g. on the dev server). */
export const signInAvailable = (o: SignInOptions) => o.google || o.facebook || o.email;
/** Cloud saves run for a signed-in player when the server has them on. */
const cloudOn = () => !!state.user && state.options.cloudSaves;

/** Asks the server who is signed in. Offline or without the server, the player is simply signed out. */
export async function refreshAccount(): Promise<void> {
  try {
    const res = await fetch(`${API}/session`, { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as { user: Account | null; options: SignInOptions };
    update({ ready: true, user: body.user, options: { ...NO_OPTIONS, ...body.options } });
  } catch {
    update({ ready: true, user: null, options: NO_OPTIONS });
  }
}

/** Google or Facebook: off to the provider, back to this page. */
export function signInWith(provider: 'google' | 'facebook', marketing: boolean): void {
  const query = new URLSearchParams({ marketing: marketing ? '1' : '0', return: location.pathname || '/' });
  location.assign(`${API}/signin/${provider}?${query}`);
}

/** Emails a sign-in link. Resolves to an error message, or null when the email is on its way. */
export async function sendSignInLink(email: string, marketing: boolean): Promise<string | null> {
  try {
    const res = await fetch(`${API}/email`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, marketing, return: location.pathname || '/' })
    });
    if (res.ok) return null;
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return body.error ?? "We couldn't send the email. Try again in a minute.";
  } catch {
    return "We couldn't reach the server. Check your connection and try again.";
  }
}

export async function signOut(): Promise<void> {
  await fetch(`${API}/signout`, { method: 'POST', credentials: 'same-origin' }).catch(() => undefined);
  update({ user: null, sync: { status: 'idle', at: null } });
}

/** Game news on or off. Resolves to false when the server couldn't be reached. */
export async function setMarketing(optIn: boolean): Promise<boolean> {
  try {
    const res = await fetch(`${API}/marketing`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ optIn }) });
    if (!res.ok) return false;
    const body = (await res.json()) as { user: Account };
    update({ user: body.user });
    return true;
  } catch {
    return false;
  }
}

/** Deletes the account, its cloud saves and its sign-ins. Saves on this device stay. */
export async function deleteAccount(): Promise<boolean> {
  try {
    const res = await fetch(`${API}/delete`, { method: 'POST', credentials: 'same-origin' });
    if (!res.ok) return false;
    update({ user: null, sync: { status: 'idle', at: null } });
    return true;
  } catch {
    return false;
  }
}

export const clearSignInResult = () => update({ result: null });

// --- Cloud saves ---------------------------------------------------------------

/** A load-screen line: the newest copy of a slot, and where it lives. */
export interface SaveEntry extends SaveSummary {
  inCloud: boolean; // the account has a copy
  cloudNewer: boolean; // the account's copy is newer than this device's (or this device has none)
}

async function cloudList(): Promise<SaveSummary[]> {
  if (!cloudOn()) return [];
  const res = await fetch(`${API}/saves`, { credentials: 'same-origin', cache: 'no-store' });
  if (!res.ok) throw new Error(String(res.status));
  return ((await res.json()) as { saves: SaveSummary[] }).saves;
}

/** Every save slot, newest first: this device's and the account's, the newer copy of each. */
export async function listAllSaves(): Promise<SaveEntry[]> {
  const local = await listSaveSummaries();
  const cloud = await cloudList().catch(() => [] as SaveSummary[]);
  const byId = new Map<string, SaveEntry>(local.map((s) => [s.id, { ...s, inCloud: false, cloudNewer: false }]));
  cloud.forEach((c) => {
    const mine = byId.get(c.id);
    if (!mine) byId.set(c.id, { ...c, inCloud: true, cloudNewer: true });
    else byId.set(c.id, c.timestamp > mine.timestamp ? { ...c, inCloud: true, cloudNewer: true } : { ...mine, inCloud: true });
  });
  return [...byId.values()].sort((a, b) => b.timestamp - a.timestamp);
}

/** Loads a slot, downloading the account's copy first when it's the newer one (and keeping it on this device). */
export async function loadAnySave(entry: Pick<SaveEntry, 'id' | 'cloudNewer'>): Promise<GameSaveRecord | undefined> {
  if (entry.cloudNewer && cloudOn()) {
    const res = await fetch(`${API}/saves/${encodeURIComponent(entry.id)}`, { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const record = await decodeCloudSave(new Uint8Array(await res.arrayBuffer()));
    await persistSaveGame(record, { fromCloud: true });
    return record;
  }
  return loadSaveGame(entry.id);
}

/** Deletes a slot on this device and in the account. */
export async function deleteAnySave(id: string): Promise<void> {
  await deleteSaveGame(id);
  if (cloudOn()) await fetch(`${API}/saves/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => undefined);
}

// Uploads go one at a time; a slot saved again while waiting sends only its newest copy
const pending = new Map<string, { summary: SaveSummary; payload: Uint8Array }>();
let uploading = false;

async function uploadNext(): Promise<void> {
  if (uploading) return;
  uploading = true;
  try {
    while (pending.size > 0 && cloudOn()) {
      const [id, save] = pending.entries().next().value as [string, { summary: SaveSummary; payload: Uint8Array }];
      pending.delete(id);
      update({ sync: { status: 'syncing', at: state.sync.at } });
      const res = await fetch(`${API}/saves/${encodeURIComponent(id)}`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/gzip', 'X-Save-Summary': encodeURIComponent(JSON.stringify(save.summary)) },
        body: save.payload as BodyInit
      }).catch(() => null);
      update({ sync: res?.ok ? { status: 'synced', at: Date.now() } : { status: 'error', at: state.sync.at } });
    }
  } finally {
    uploading = false;
  }
}

function queueUpload(summary: SaveSummary, payload: Uint8Array): void {
  if (!cloudOn()) return;
  pending.set(summary.id, { summary, payload });
  void uploadNext();
}

/** After signing in: this device's saves that the account doesn't have (or has older) go up. */
export async function uploadLocalSaves(): Promise<void> {
  if (!cloudOn()) return;
  const cloud = await cloudList().catch(() => null);
  if (!cloud) return;
  const local = await listSaveSummaries();
  for (const s of local) {
    const theirs = cloud.find((c) => c.id === s.id);
    if (theirs && theirs.timestamp >= s.timestamp) continue;
    const save = await readSaveForUpload(s.id);
    if (save) queueUpload(save.summary, save.payload);
  }
}

// --- Start-up ------------------------------------------------------------------

/** Reads ?signin= from the page address (set by the server after a sign-in) and removes it. */
function takeSignInResult(): SignInResult | null {
  const url = new URL(location.href);
  const value = url.searchParams.get('signin');
  if (!value) return null;
  url.searchParams.delete('signin');
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  return value === 'ok' || value === 'failed' || value === 'expired' || value === 'unavailable' ? value : 'failed';
}

/** Runs once as the game loads. */
export function initAccount(): void {
  const result = takeSignInResult();
  if (result) update({ result });
  setSaveListener(queueUpload);
  void refreshAccount().then(() => {
    if (result === 'ok') void uploadLocalSaves();
  });
}
