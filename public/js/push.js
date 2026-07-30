// Web Push subscription management, per language. Real pushes require the app
// to be installed to the iOS home screen (iOS 16.4+).
import { VAPID_PUBLIC_KEY } from './config.js';
import * as db from './store.js';

function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

export function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export async function getSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

// Server status: { subscribed, langs: { code: { enabled, delivered } } }
export async function getStatus() {
  const sub = await getSubscription().catch(() => null);
  if (!sub) return { subscribed: false, langs: {} };
  try {
    const res = await fetch(`/api/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`);
    if (!res.ok) return { subscribed: false, langs: {} };
    return await res.json();
  } catch {
    return { subscribed: false, langs: {} };
  }
}

export async function enableLang(lang) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('denied');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  const res = await fetch('/api/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscription: sub.toJSON(),
      lang,
      startAt: db.langState(lang).unlocked,
    }),
  });
  if (!res.ok) throw new Error('server');
}

export async function disableLang(lang) {
  const sub = await getSubscription();
  if (!sub) return;
  await fetch('/api/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'disableLang', endpoint: sub.endpoint, lang }),
  }).catch(() => {});
}

export async function sendTestPush() {
  const sub = await getSubscription();
  if (!sub) throw new Error('no-sub');
  const res = await fetch('/api/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'test', endpoint: sub.endpoint }),
  });
  if (!res.ok) throw new Error('server');
}

// Pull delivered-word counts for every language so words pushed while the app
// was closed appear in their libraries even if notifications were never tapped.
export async function syncFromServer() {
  const status = await getStatus();
  let added = 0;
  for (const [code, info] of Object.entries(status.langs || {})) {
    const delivered = info?.delivered ?? 0;
    if (delivered > 0) {
      try {
        const packForCode = await db.loadPack(code);
        added += db.ensureUnlocked(code, packForCode, delivered);
      } catch {
        /* unknown pack */
      }
    }
  }
  return added;
}
