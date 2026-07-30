// Push subscriptions live in a single JSON blob on Vercel Blob storage.
// Shape: [{ subscription: PushSubscriptionJSON, index: number, createdAt: string }]
import { put, list } from '@vercel/blob';

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
