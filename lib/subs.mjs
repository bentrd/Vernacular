// Push subscriptions, one row per device endpoint in Postgres.
// Row: { endpoint, user_id, subscription, tz,
//        langs: { <code>: { index, enabled, reminders, sentAt, stats, pausedUntil } } }
//
// Historically these lived in a single JSON blob on Vercel Blob storage; the
// first call after deploy imports that blob once, then Postgres is the truth.
import { db } from './db.mjs';
import { EVERY_DAY, MAX_REMINDERS, isValidZone, normalizeReminder } from './reminders.mjs';

let legacyChecked = false;

async function importLegacyBlob(sql) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  const { list } = await import('@vercel/blob');
  const { blobs } = await list({ prefix: 'data/subs.json' });
  const blob = blobs.find((b) => b.pathname === 'data/subs.json');
  if (!blob) return;
  const res = await fetch(`${blob.url}?ts=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return;
  let subs;
  try {
    subs = await res.json();
  } catch {
    return;
  }
  if (!Array.isArray(subs) || !subs.length) return;
  const rows = subs
    .filter((s) => s.subscription?.endpoint)
    .map((s) => ({
      endpoint: s.subscription.endpoint,
      subscription: s.subscription,
      tz: isValidZone(s.tz) ? s.tz : 'UTC',
      // v1 blob entries had a single Latin word index instead of `langs`
      langs: s.langs || { la: { index: s.index || 0, enabled: true } },
    }));
  if (!rows.length) return;
  await sql`
    insert into push_subs (endpoint, subscription, tz, langs)
    select x.endpoint, x.subscription, x.tz, x.langs
    from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
      as x(endpoint text, subscription jsonb, tz text, langs jsonb)
    on conflict (endpoint) do nothing`;
}

// Runs at most once per function instance, and only does work while the
// push_subs table is still empty.
export async function ensureLegacyImport() {
  if (legacyChecked) return;
  const sql = db();
  const [{ count }] = await sql`select count(*)::int as count from push_subs`;
  if (count === 0) {
    try {
      await importLegacyBlob(sql);
    } catch (err) {
      console.error('legacy subs import failed', err);
    }
  }
  legacyChecked = true;
}

export async function findSub(endpoint) {
  const rows = await db()`select * from push_subs where endpoint = ${endpoint}`;
  return rows[0] ? migrateSub(rows[0]) : null;
}

export async function allSubs() {
  const rows = await db()`select * from push_subs order by created_at`;
  return rows.map(migrateSub);
}

// Insert or refresh a subscription row. `langs` and `tz` are written as given;
// user_id only ever fills in (a legacy row gains its owner on first use).
export async function upsertSub({ endpoint, userId = null, subscription, tz, langs }) {
  await db()`
    insert into push_subs (endpoint, user_id, subscription, tz, langs, updated_at)
    values (${endpoint}, ${userId}, ${subscription}, ${tz || 'UTC'}, ${langs}, now())
    on conflict (endpoint) do update set
      user_id = coalesce(excluded.user_id, push_subs.user_id),
      subscription = excluded.subscription,
      tz = excluded.tz,
      langs = excluded.langs,
      updated_at = now()`;
}

// Persist mutated schedule state (langs jsonb and, when it moved, tz).
export async function saveSub(sub) {
  await db()`
    update push_subs
    set langs = ${sub.langs}, tz = ${sub.tz || 'UTC'}, updated_at = now()
    where endpoint = ${sub.endpoint}`;
}

export async function deleteSub(endpoint) {
  await db()`delete from push_subs where endpoint = ${endpoint}`;
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
