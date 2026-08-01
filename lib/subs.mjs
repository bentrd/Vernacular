// Push subscriptions live in a single JSON blob on Vercel Blob storage.
// Shape: [{
//   subscription: PushSubscriptionJSON,
//   tz: 'Europe/Paris',
//   langs: { <code>: { index, enabled, reminders, sentAt, stats, pausedUntil } },
//   createdAt,
// }]
import { put, list } from '@vercel/blob';
import { EVERY_DAY, MAX_REMINDERS, isValidZone, normalizeReminder } from './reminders.mjs';

const PATH = 'data/subs.json';

export async function loadSubs() {
  const { blobs } = await list({ prefix: PATH });
  const blob = blobs.find((b) => b.pathname === PATH);
  if (!blob) return [];
  // cache-busting query param: blob URLs are edge-cached
  const res = await fetch(`${blob.url}?ts=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return [];
  try {
    return await res.json();
  } catch {
    return [];
  }
}

export async function saveSubs(subs) {
  await put(PATH, JSON.stringify(subs), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  });
}

export function findSub(subs, endpoint) {
  return subs.find((s) => s.subscription?.endpoint === endpoint);
}

// The fixed UTC cron times v2 shipped with. Subscribers who predate per-user
// schedules keep exactly the rhythm they had until their app syncs a real time
// zone and a schedule of their own.
function legacyReminders() {
  return [
    { id: 'w-morning', type: 'word', time: '07:30', days: [...EVERY_DAY] },
    { id: 'w-midday', type: 'word', time: '11:30', days: [...EVERY_DAY] },
    { id: 'w-evening', type: 'word', time: '15:30', days: [...EVERY_DAY] },
    { id: 'q-night', type: 'review', time: '19:00', days: [...EVERY_DAY] },
  ].map((r) => normalizeReminder(r));
}

// v1 subs had a single Latin word index. v2 tracks per-language state.
// v3 adds a time zone and a per-language reminder schedule.
export function migrateSub(sub) {
  if (!sub.langs) {
    sub.langs = { la: { index: sub.index || 0, enabled: true } };
    delete sub.index;
  }
  if (!isValidZone(sub.tz)) sub.tz = 'UTC';
  for (const ls of Object.values(sub.langs)) {
    if (!Array.isArray(ls.reminders)) ls.reminders = legacyReminders();
    if (!ls.sentAt || typeof ls.sentAt !== 'object') ls.sentAt = {};
    if (!ls.stats || typeof ls.stats !== 'object') ls.stats = {};
  }
  return sub;
}

// Trim delivery bookkeeping down to the reminders that still exist.
export function pruneSentAt(ls) {
  const ids = new Set((ls.reminders || []).map((r) => r.id));
  for (const id of Object.keys(ls.sentAt || {})) {
    if (!ids.has(id)) delete ls.sentAt[id];
  }
}

// Anything arriving from the app is untrusted: clamp it to the model.
export function sanitizeReminders(list) {
  if (!Array.isArray(list)) return null;
  return list.slice(0, MAX_REMINDERS).map((r, i) => normalizeReminder(r, i));
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function sanitizeStats(stats) {
  if (!stats || typeof stats !== 'object') return {};
  const num = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : 0);
  const day = (v) => (typeof v === 'string' && DAY_RE.test(v) ? v : null);
  return {
    day: day(stats.day),
    lastActive: day(stats.lastActive),
    streak: num(stats.streak),
    newToday: num(stats.newToday),
    goal: num(stats.goal) || 3,
    due: num(stats.due),
    unlocked: num(stats.unlocked),
    learned: num(stats.learned),
  };
}
