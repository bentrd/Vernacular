// Web Push subscription management. Real pushes require the app to be
// installed to the iOS home screen (iOS 16.4+).
import { VAPID_PUBLIC_KEY } from './config.js';
import { ensureUnlocked, getState } from './store.js';

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

export async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('denied');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY),
  });
  const res = await fetch('/api/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON(), startAt: getState().unlocked }),
  });
  if (!res.ok) {
    await sub.unsubscribe().catch(() => {});
    throw new Error('server');
  }
  return sub;
}

export async function disablePush() {
  const sub = await getSubscription();
  if (!sub) return;
  await fetch('/api/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {});
  await sub.unsubscribe();
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

// Pull the server's delivered-word count so words pushed while the app was
// closed appear in the library even if the notification was never tapped.
export async function syncFromServer() {
  const sub = await getSubscription().catch(() => null);
  if (!sub) return 0;
  try {
    const res = await fetch(`/api/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`);
    if (!res.ok) return 0;
    const data = await res.json();
    if (typeof data.delivered === 'number' && data.delivered > 0) {
      return ensureUnlocked(data.delivered);
    }
  } catch {
    /* offline is fine */
  }
  return 0;
}
