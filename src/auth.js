// Neon Auth client (managed Better Auth). Sessions live in a partitioned
// HTTP-only cookie on the auth server's domain; after magic-link or Google
// redirects, the SDK exchanges the one-time `neon_auth_session_verifier`
// URL param during getSession(), so getSession() must run before any code
// that rewrites the URL.
import { createAuthClient } from '@neondatabase/neon-js/auth';
import { BetterAuthReactAdapter } from '@neondatabase/neon-js/auth/react/adapters';

const AUTH_URL = import.meta.env.VITE_NEON_AUTH_URL;
const ACCOUNT_KEY = 'vernacular:account';
const DEVICE_KEY = 'vernacular:device-session';

export const authClient = createAuthClient(AUTH_URL, {
  adapter: BetterAuthReactAdapter({
    fetchOptions: { credentials: 'include' },
  }),
});

// Cached account snapshot so an installed PWA still opens offline.
export function cachedAccount() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNT_KEY) || 'null');
  } catch {
    return null;
  }
}

export function cacheAccount(data) {
  if (data) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(data));
  else localStorage.removeItem(ACCOUNT_KEY);
}

// The Neon session lives in a cross-site cookie that Safari evicts within
// days inside the installed app. A device session is our own long-lived,
// first-party token: minted server-side while the Neon session is alive,
// kept in localStorage (which installed apps retain), honored by every API
// route, and slid forward on each use.
function deviceToken() {
  try {
    return localStorage.getItem(DEVICE_KEY) || null;
  } catch {
    return null;
  }
}

function storeDeviceToken(token) {
  try {
    if (token) localStorage.setItem(DEVICE_KEY, token);
    else localStorage.removeItem(DEVICE_KEY);
  } catch {
    /* private mode: sessions just stay cookie-bound */
  }
}

// Mint a device session (or slide the stored one) off the live Neon session.
// Fire-and-forget at boot; a failure simply retries on the next launch.
async function ensureDeviceSession(neonToken) {
  try {
    const res = await fetch('/api/device-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${neonToken}` },
      body: JSON.stringify({ token: deviceToken() }),
    });
    if (!res.ok) return;
    const { token } = await res.json();
    if (token) storeDeviceToken(token);
  } catch {
    /* offline */
  }
}

// The auth server says there is no session, but this device may still hold a
// long-lived token. Answers a resolveSession() result, or null to fall
// through to signed-out.
async function resolveDeviceSession() {
  const token = deviceToken();
  if (!token) return null;
  let res;
  try {
    res = await fetch('/api/device-session', {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    const account = cachedAccount();
    return account?.user ? { status: 'offline', account } : null;
  }
  if (res.status === 401) {
    // Revoked or expired for real: give the token up.
    storeDeviceToken(null);
    return null;
  }
  try {
    if (!res.ok) throw new Error(`api ${res.status}`);
    const { user } = await res.json();
    if (!user?.id) throw new Error('malformed');
    cacheAccount({ ...(cachedAccount() || {}), user });
    return { status: 'signed-in', user };
  } catch {
    const account = cachedAccount();
    return account?.user ? { status: 'offline', account } : null;
  }
}

export const GAUTH_ERROR_KEY = 'vernacular:gauth-error';

// A first-party Google sign-in returns with the device token in the URL
// fragment (fragments never reach a server). Consume it before the session
// is resolved and before anything else rewrites the URL.
function consumeGoogleHandoff() {
  const m = location.hash.match(/^#gauth=([A-Za-z0-9_-]+)$/);
  if (m) storeDeviceToken(m[1]);
  else if (location.hash === '#gauth_error=1') {
    try {
      sessionStorage.setItem(GAUTH_ERROR_KEY, '1');
    } catch {
      /* private mode */
    }
  } else return;
  history.replaceState(null, '', location.pathname + location.search);
}

// Resolves the auth state once at boot.
// -> { status: 'signed-in', user } | { status: 'signed-out' } | { status: 'offline', account }
export async function resolveSession() {
  consumeGoogleHandoff();
  try {
    const { data, error } = await authClient.getSession();
    if (data?.user) {
      const account = cachedAccount() || {};
      cacheAccount({ ...account, user: { id: data.user.id, email: data.user.email, name: data.user.name } });
      if (data.session?.token) void ensureDeviceSession(data.session.token);
      return { status: 'signed-in', user: data.user };
    }
    if (error) throw error;
    // The auth cookie is gone, but an installed device keeps its own session.
    const device = await resolveDeviceSession();
    if (device) return device;
    cacheAccount(null);
    return { status: 'signed-out' };
  } catch {
    // Auth server unreachable; the device session talks to our own API and
    // may well still work (it always does right after a Google sign-in).
    const device = await resolveDeviceSession();
    if (device) return device;
    const account = cachedAccount();
    if (account?.user) return { status: 'offline', account };
    return { status: 'signed-out' };
  }
}

// Bearer for our API routes: the short-lived Neon JWT while the session is
// alive (the SDK caches getSession() and refreshes the token as it nears
// expiry), the long-lived device token once the cookie is gone.
export async function getToken() {
  try {
    const { data } = await authClient.getSession();
    if (data?.session?.token) return data.session.token;
  } catch {
    /* fall through to the device session */
  }
  return deviceToken();
}

export async function sendMagicLink(email) {
  const { error } = await authClient.signIn.magicLink({
    email,
    callbackURL: `${location.origin}/`,
  });
  if (error) throw new Error(error.message || 'Could not send the link');
}

// Google runs through our own /api/google-oauth (first-party consent screen
// and a device session), not through the Neon Auth social flow.
export async function signInWithGoogle() {
  location.assign('/api/google-oauth?op=start');
}

export async function signOut() {
  const token = deviceToken();
  if (token) {
    // Best effort: revoke this device's long-lived session server-side.
    await fetch('/api/device-session', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ token }),
    }).catch(() => {});
  }
  try {
    await authClient.signOut();
  } finally {
    cacheAccount(null);
    storeDeviceToken(null);
  }
}

// Deletes the auth user record (app data is wiped separately via the API).
export async function deleteAuthUser() {
  await authClient.deleteUser({});
}
