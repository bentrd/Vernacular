// Request authentication for API routes. The bearer is either a Neon Auth
// JWT (verified against the auth server's JWKS) or a long-lived device
// session token (vds_…, looked up in Postgres), so an installed app keeps
// working after Safari evicts the cross-site auth cookie.
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { TOKEN_PREFIX, verifyDeviceToken } from './device.mjs';

let jwks = null;
let expectedOrigin = null;

function init() {
  const base = process.env.NEON_AUTH_BASE_URL;
  if (!base) throw new Error('NEON_AUTH_BASE_URL is not set');
  expectedOrigin = new URL(base).origin;
  jwks = createRemoteJWKSet(new URL(`${base}/.well-known/jwks.json`));
}

// Returns { id, email, name, emailVerified } or null when unauthenticated.
export async function getUser(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7);
  if (token.startsWith(TOKEN_PREFIX)) {
    try {
      const user = await verifyDeviceToken(token);
      // Device sessions are only ever minted from a verified live session.
      return user ? { ...user, emailVerified: true } : null;
    } catch {
      return null;
    }
  }
  try {
    if (!jwks) init();
    const { payload } = await jwtVerify(token, jwks, {
      issuer: expectedOrigin,
      audience: expectedOrigin,
    });
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      email: payload.email || '',
      name: payload.name || '',
      emailVerified: !!payload.emailVerified,
    };
  } catch {
    return null;
  }
}

export function unauthorized(res) {
  return res.status(401).json({ error: 'unauthorized' });
}
