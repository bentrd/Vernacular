// Neon Auth client (managed Better Auth). Sessions live in a partitioned
// HTTP-only cookie on the auth server's domain; after magic-link or Google
// redirects, the SDK exchanges the one-time `neon_auth_session_verifier`
// URL param during getSession(), so getSession() must run before any code
// that rewrites the URL.
import { createAuthClient } from '@neondatabase/neon-js/auth';
import { BetterAuthReactAdapter } from '@neondatabase/neon-js/auth/react/adapters';

const AUTH_URL = import.meta.env.VITE_NEON_AUTH_URL;
const ACCOUNT_KEY = 'vernacular:account';

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

// Resolves the auth state once at boot.
// -> { status: 'signed-in', user } | { status: 'signed-out' } | { status: 'offline', account }
export async function resolveSession() {
  try {
    const { data, error } = await authClient.getSession();
    if (data?.user) {
      const account = cachedAccount() || {};
      cacheAccount({ ...account, user: { id: data.user.id, email: data.user.email, name: data.user.name } });
      return { status: 'signed-in', user: data.user };
    }
    if (error) throw error;
    cacheAccount(null);
    return { status: 'signed-out' };
  } catch {
    const account = cachedAccount();
    if (account?.user) return { status: 'offline', account };
    return { status: 'signed-out' };
  }
}

// Short-lived JWT for our API routes; the SDK caches getSession() and
// refreshes the token as it nears expiry.
export async function getToken() {
  try {
    const { data } = await authClient.getSession();
    return data?.session?.token || null;
  } catch {
    return null;
  }
}

export async function sendMagicLink(email) {
  const { error } = await authClient.signIn.magicLink({
    email,
    callbackURL: `${location.origin}/`,
  });
  if (error) throw new Error(error.message || 'Could not send the link');
}

export async function signInWithGoogle() {
  await authClient.signIn.social({
    provider: 'google',
    callbackURL: `${location.origin}/`,
  });
}

export async function signOut() {
  try {
    await authClient.signOut();
  } finally {
    cacheAccount(null);
  }
}

// Deletes the auth user record (app data is wiped separately via the API).
export async function deleteAuthUser() {
  await authClient.deleteUser({});
}
