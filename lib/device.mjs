// Long-lived device sessions behind the Neon Auth session.
//
// The auth cookie lives on the auth server's domain, which makes it a
// cross-site cookie inside the installed iPhone app; Safari evicts those
// within days, signing the device out and silencing its reminders. So while
// the Neon session is alive the client trades it for an opaque device token
// it keeps in localStorage. Only the SHA-256 of the token is stored here, and
// every use slides the expiry forward, so a device stays signed in as long as
// the app is opened at least once per LIFETIME_DAYS.
import { createHash, randomBytes } from 'node:crypto';
import { db } from './db.mjs';

export const TOKEN_PREFIX = 'vds_';
const LIFETIME_DAYS = 180;
const TOUCH_EVERY_MS = 6 * 60 * 60 * 1000; // slide the expiry at most 4x/day

const hash = (token) => createHash('sha256').update(token).digest('hex');
const expiry = () => new Date(Date.now() + LIFETIME_DAYS * 86_400_000);

// The table ships with tools/schema.sql, but creating it on demand means a
// deploy needs no manual migration step. Runs once per function instance.
let ensured = false;
async function ensureTable() {
  if (ensured) return;
  const sql = db();
  await sql`
    create table if not exists device_sessions (
      token_hash text primary key,
      user_id text not null,
      email text not null default '',
      name text not null default '',
      created_at timestamptz not null default now(),
      last_seen_at timestamptz not null default now(),
      expires_at timestamptz not null
    )`;
  await sql`create index if not exists device_sessions_user_idx on device_sessions (user_id)`;
  ensured = true;
}

export async function mintDeviceSession(user) {
  await ensureTable();
  const token = TOKEN_PREFIX + randomBytes(32).toString('base64url');
  const sql = db();
  await sql`
    insert into device_sessions (token_hash, user_id, email, name, expires_at)
    values (${hash(token)}, ${user.id}, ${user.email || ''}, ${user.name || ''}, ${expiry()})`;
  await sql`delete from device_sessions where expires_at < now()`; // housekeeping
  return { token };
}

// Returns { id, email, name } while the token is valid, sliding the expiry
// when it has not been touched for a while; null otherwise.
export async function verifyDeviceToken(token) {
  await ensureTable();
  const h = hash(token);
  const rows = await db()`
    select user_id, email, name, last_seen_at from device_sessions
    where token_hash = ${h} and expires_at > now()`;
  const row = rows[0];
  if (!row) return null;
  if (Date.now() - new Date(row.last_seen_at).getTime() > TOUCH_EVERY_MS) {
    await db()`
      update device_sessions
      set last_seen_at = now(), expires_at = ${expiry()}
      where token_hash = ${h}`;
  }
  return { id: row.user_id, email: row.email, name: row.name };
}

// Force-slides the expiry of a token the client presented at boot. Returns
// false when the token is unknown, expired, or belongs to someone else.
export async function refreshDeviceSession(userId, token) {
  await ensureTable();
  const rows = await db()`
    update device_sessions
    set last_seen_at = now(), expires_at = ${expiry()}
    where token_hash = ${hash(token)} and user_id = ${userId} and expires_at > now()
    returning token_hash`;
  return !!rows[0];
}

export async function revokeDeviceToken(userId, token) {
  await ensureTable();
  await db()`delete from device_sessions where token_hash = ${hash(token)} and user_id = ${userId}`;
}

export async function revokeAllDeviceSessions(userId) {
  await ensureTable();
  await db()`delete from device_sessions where user_id = ${userId}`;
}
