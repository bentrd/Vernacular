// First-party Google sign-in. The whole OAuth dance runs on our own domain,
// so Google's consent screen names verbum.study rather than the managed auth
// server's neon.tech hostname (which is what it shows for an unverified
// brand, and neon.tech is not ours to verify). No Neon Auth session is
// involved: the callback verifies Google's ID token, finds or creates the
// user in the same neon_auth schema the managed server uses, and hands the
// browser a long-lived device session in the URL fragment.
//
//   GET ?op=start        302 to Google's consent screen
//   GET ?code=&state=    the OAuth callback; 302 to /#gauth=<token>
import { randomBytes, randomUUID } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { db } from '../lib/db.mjs';
import { mintDeviceSession } from '../lib/device.mjs';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const STATE_COOKIE = 'gauth_state';

const CLIENT_ID =
  process.env.GOOGLE_OAUTH_CLIENT_ID ||
  '276126244658-vshacdoni31ha18nu9dfvdbjj7tmr1jd.apps.googleusercontent.com';

// The hosts this route may build its redirect URI on; each needs a matching
// authorized redirect URI in the Google Cloud client. Keeps a spoofed Host
// header from steering the callback anywhere else.
const HOSTS = new Set(['verbum.study', 'www.verbum.study', 'vernacular-five.vercel.app']);

let jwks = null;

function requestHost(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  return HOSTS.has(host) ? host : null;
}

const redirectUri = (host) => `https://${host}/api/google-oauth`;

function readStateCookie(req) {
  const raw = req.headers.cookie || '';
  const m = raw.match(/(?:^|;\s*)gauth_state=([^;]+)/);
  const [state, nonce] = m ? decodeURIComponent(m[1]).split('.') : [];
  return state && nonce ? { state, nonce } : null;
}

function stateCookie(value, maxAge) {
  return `${STATE_COOKIE}=${value}; Max-Age=${maxAge}; Path=/api/google-oauth; HttpOnly; Secure; SameSite=Lax`;
}

// Sign-in outcomes travel in the fragment: it never reaches a server log,
// and src/auth.js consumes it before anything else touches the URL.
function finish(res, fragment) {
  res.setHeader('Set-Cookie', stateCookie('', 0));
  res.statusCode = 302;
  res.setHeader('Location', fragment ? `/#${fragment}` : '/');
  res.end();
}

async function handleStart(req, res) {
  const host = requestHost(req);
  if (!host) return res.status(400).json({ error: 'unknown host' });
  if (!process.env.GOOGLE_OAUTH_CLIENT_SECRET) {
    return res.status(500).json({ error: 'GOOGLE_OAUTH_CLIENT_SECRET is not set' });
  }
  const state = randomBytes(16).toString('base64url');
  const nonce = randomBytes(16).toString('base64url');
  const url = new URL(GOOGLE_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(host),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    prompt: 'select_account',
  });
  res.setHeader('Set-Cookie', stateCookie(`${state}.${nonce}`, 600));
  res.statusCode = 302;
  res.setHeader('Location', url.toString());
  res.end();
}

// The account rows the managed Better Auth server writes are plain tables in
// our own database, so a first-party sign-in resolves users in place: by the
// Google account link first, then by verified email, creating the user (and
// always the link) when needed.
async function resolveUser(sql, { sub, email, name }) {
  const linked = await sql`
    select u.id, u.email, u.name from neon_auth.account a
    join neon_auth."user" u on u.id = a."userId"
    where a."providerId" = 'google' and a."accountId" = ${sub}`;
  if (linked[0]) return linked[0];

  const now = new Date();
  let user = (
    await sql`select id, email, name from neon_auth."user" where lower(email) = ${email.toLowerCase()}`
  )[0];
  if (!user) {
    user = { id: randomUUID(), email, name: name || email.split('@')[0] };
    await sql`
      insert into neon_auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
      values (${user.id}, ${user.name}, ${email}, true, ${now}, ${now})`;
  }
  await sql`
    insert into neon_auth.account (id, "accountId", "providerId", "userId", "createdAt", "updatedAt")
    values (${randomUUID()}, ${sub}, 'google', ${user.id}, ${now}, ${now})`;
  return user;
}

async function handleCallback(req, res) {
  const host = requestHost(req);
  if (!host) return res.status(400).json({ error: 'unknown host' });
  if (req.query.error) return finish(res, req.query.error === 'access_denied' ? '' : 'gauth_error=1');

  const expected = readStateCookie(req);
  if (!expected || req.query.state !== expected.state) return finish(res, 'gauth_error=1');

  const exchange = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
      code: String(req.query.code || ''),
      grant_type: 'authorization_code',
      redirect_uri: redirectUri(host),
    }),
  });
  if (!exchange.ok) {
    console.error('google token exchange failed', exchange.status, await exchange.text());
    return finish(res, 'gauth_error=1');
  }
  const { id_token: idToken } = await exchange.json();

  if (!jwks) jwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: CLIENT_ID,
  });
  if (payload.nonce !== expected.nonce) return finish(res, 'gauth_error=1');
  if (!payload.email || payload.email_verified === false) return finish(res, 'gauth_error=1');

  const user = await resolveUser(db(), {
    sub: payload.sub,
    email: payload.email,
    name: typeof payload.name === 'string' ? payload.name : '',
  });
  const { token } = await mintDeviceSession(user);
  return finish(res, `gauth=${token}`);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }
  try {
    if (req.query.op === 'start') return await handleStart(req, res);
    if (req.query.code || req.query.error) return await handleCallback(req, res);
    return res.status(400).json({ error: 'bad request' });
  } catch (err) {
    console.error(err);
    return finish(res, 'gauth_error=1');
  }
}
