// Account profile: read on boot, written by onboarding and Settings.
import { db } from '../lib/db.mjs';
import { getUser, unauthorized } from '../lib/authz.mjs';

const shape = (row, user) => ({
  email: row?.email || user.email || '',
  displayName: row?.display_name || user.name || '',
  nativeLang: row?.native_lang || '',
  onboardedAt: row?.onboarded_at || null,
  tosAcceptedAt: row?.tos_accepted_at || null,
});

export default async function handler(req, res) {
  const user = await getUser(req);
  if (!user) return unauthorized(res);
  const sql = db();

  try {
    if (req.method === 'GET') {
      const rows = await sql`select * from app_users where id = ${user.id}`;
      return res.json({ profile: shape(rows[0], user) });
    }

    if (req.method === 'PUT') {
      const b = req.body || {};
      const displayName =
        typeof b.displayName === 'string' ? b.displayName.trim().slice(0, 80) : null;
      const nativeLang =
        typeof b.nativeLang === 'string' && /^[a-z-]{0,16}$/.test(b.nativeLang)
          ? b.nativeLang
          : null;
      const onboarded = b.onboarded === true;
      const acceptTos = b.acceptTos === true;
      const rows = await sql`
        insert into app_users (id, email, display_name, native_lang, onboarded_at, tos_accepted_at, updated_at)
        values (${user.id}, ${user.email}, ${displayName || user.name || ''}, ${nativeLang || ''},
                ${onboarded ? new Date() : null}, ${acceptTos ? new Date() : null}, now())
        on conflict (id) do update set
          email = excluded.email,
          display_name = coalesce(nullif(${displayName}, ''), app_users.display_name),
          native_lang = coalesce(nullif(${nativeLang}, ''), app_users.native_lang),
          onboarded_at = coalesce(app_users.onboarded_at, excluded.onboarded_at),
          tos_accepted_at = coalesce(app_users.tos_accepted_at, excluded.tos_accepted_at),
          updated_at = now()
        returning *`;
      return res.json({ profile: shape(rows[0], user) });
    }

    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal error' });
  }
}
