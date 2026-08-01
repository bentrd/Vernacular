// Mirrors the local store into the signed-in account via /api/sync.
//
// Every sync is a round trip: the client posts its full state, the server
// merges (lib/merge.mjs) and answers with the canonical result, which is
// merged back into the store. The first sync after sign-in is the localStorage
// migration: the server has nothing, so the device's data is uploaded as is.
import * as db from './store.js';
import { mergeStates } from '../lib/merge.mjs';
import { getToken } from './auth.js';
import { toast } from './ui/toast.js';

const DEBOUNCE_MS = 2500;
const state = {
  started: false,
  timer: null,
  inFlight: false,
  again: false, // a change arrived while a sync was in flight
  clean: null, // snapshot JSON at last successful sync; null = never synced
  lastError: null,
  lastSyncedAt: 0,
  listeners: new Set(),
};

export function onSyncChange(fn) {
  state.listeners.add(fn);
  return () => state.listeners.delete(fn);
}
const notify = () => state.listeners.forEach((fn) => fn());

export const syncStatus = () => ({
  pending: !!state.timer || state.inFlight || isDirty(),
  lastSyncedAt: state.lastSyncedAt,
  lastError: state.lastError,
});

function isDirty() {
  if (state.clean === null) return true;
  return JSON.stringify(db.syncSnapshot()) !== state.clean;
}

export async function apiFetch(path, options = {}) {
  const token = await getToken();
  if (!token) throw new Error('signed-out');
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (res.status === 401) throw new Error('signed-out');
  if (!res.ok) throw new Error(`api ${res.status}`);
  return res.json();
}

export async function syncNow({ keepalive = false } = {}) {
  if (state.inFlight) {
    state.again = true;
    return;
  }
  clearTimeout(state.timer);
  state.timer = null;
  state.inFlight = true;
  notify();
  try {
    const snapshot = db.syncSnapshot();
    const res = await apiFetch('/api/sync', {
      method: 'POST',
      body: JSON.stringify({ state: snapshot }),
      keepalive,
    });
    // Server state goes first so timestamp ties resolve exactly the way the
    // server resolved them (otherwise the two sides never converge). Changes
    // made while the request was in flight carry newer stamps and survive
    // this merge; the next pass sends them up.
    const merged = mergeStates(res.state, db.syncSnapshot());
    db.applyMerged(merged);
    state.clean = JSON.stringify(db.syncSnapshot());
    state.lastSyncedAt = Date.now();
    state.lastError = null;
    if (res.migrated) toast('Your progress is now saved to your account');
    if (isDirty()) schedule();
  } catch (err) {
    state.lastError = err.message || 'sync failed';
  } finally {
    state.inFlight = false;
    if (state.again) {
      state.again = false;
      schedule();
    }
    notify();
  }
}

function schedule() {
  clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    state.timer = null;
    syncNow();
  }, DEBOUNCE_MS);
  notify();
}

// Starts the engine for a signed-in session: one immediate pull+push, then
// debounced pushes on store changes, plus retries when the app comes back.
export function startSync() {
  if (state.started) return;
  state.started = true;

  db.subscribe(() => {
    if (isDirty()) schedule();
  });

  window.addEventListener('online', () => {
    if (isDirty() || state.lastError) syncNow();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      // last chance before iOS freezes the PWA
      if (isDirty() && !state.inFlight) syncNow({ keepalive: true });
    } else if (isDirty() || state.lastError || Date.now() - state.lastSyncedAt > 60_000) {
      syncNow();
    }
  });

  return syncNow();
}
