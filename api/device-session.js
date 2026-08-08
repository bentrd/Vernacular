// Long-lived sessions for installed devices. Minted while the Neon Auth
// session is alive; from then on the token authenticates every API route via
// lib/authz.mjs, so the app stays signed in after the auth cookie is evicted.
//
//   POST { token? }   mint a device session, or slide the presented one
//   GET               validate the bearer, answer { user }
//   DELETE { token }  revoke one device session (sign-out)
import { getUser, unauthorized } from '../lib/authz.mjs';
import {
  mintDeviceSession,
  refreshDeviceSession,
  revokeDeviceToken,
} from '../lib/device.mjs';

export default async function handler(req, res) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized(res);

    if (req.method === 'GET') {
      return res.json({ user: { id: user.id, email: user.email, name: user.name } });
    }

    if (req.method === 'POST') {
      const prior = typeof req.body?.token === 'string' ? req.body.token : null;
      if (prior && (await refreshDeviceSession(user.id, prior))) {
        return res.json({ token: prior });
      }
      const { token } = await mintDeviceSession(user);
      return res.json({ token });
    }

    if (req.method === 'DELETE') {
      const token = typeof req.body?.token === 'string' ? req.body.token : null;
      if (token) await revokeDeviceToken(user.id, token);
      return res.json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal error' });
  }
}
