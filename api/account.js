// Account deletion: wipes all app data for the signed-in user. The auth
// record itself is deleted client-side via the Neon Auth SDK afterwards.
import { db } from '../lib/db.mjs';
import { getUser, unauthorized } from '../lib/authz.mjs';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).json({ error: 'method not allowed' });
  }
  const user = await getUser(req);
  if (!user) return unauthorized(res);

  try {
    const sql = db();
    await sql.transaction((txn) => [
      txn`delete from push_subs where user_id = ${user.id}`,
      txn`delete from app_users where id = ${user.id}`, // cascades langs/words/tombstones
    ]);
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal error' });
  }
}
