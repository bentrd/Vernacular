// Web Push subscription management, per language. Real pushes require the app
// to be installed to the iOS home screen (iOS 16.4+).
//
// The schedule lives in two places on purpose: localStorage owns it so the
// editor is instant and works offline, and every change is mirrored to the
// server, which is what actually decides when to send.
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

async function post(body) {
  const res = await fetch('/api/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('server');
  return res.json();
}

// Server status: { subscribed, tz, langs: { code: { enabled, delivered, reminders, pausedUntil } } }
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
  await post({
    subscription: sub.toJSON(),
    lang,
    startAt: db.langState(lang).unlocked,
    tz: db.timeZone(),
    reminders: db.reminders(lang),
    stats: db.statsPayload(lang),
  });
}

export async function disableLang(lang) {
  const sub = await getSubscription();
  if (!sub) return;
  await post({ op: 'disableLang', endpoint: sub.endpoint, lang }).catch(() => {});
}

// Mirror one language's schedule to the server. Returns false when it did not
// land, which for a language with reminders switched off is fine: the schedule
// travels with the next enable. Callers decide whether that is worth saying.
export async function saveSchedule(lang) {
  const sub = await getSubscription().catch(() => null);
  if (!sub) return false;
  try {
    await post({
      op: 'schedule',
      endpoint: sub.endpoint,
      lang,
      tz: db.timeZone(),
      reminders: db.reminders(lang),
      pausedUntil: db.langState(lang).pausedUntil || null,
      stats: db.statsPayload(lang),
    });
    return true;
  } catch {
    return false;
  }
}

export async function sendTestPush() {
  const sub = await getSubscription();
  if (!sub) throw new Error('no-sub');
  await post({ op: 'test', endpoint: sub.endpoint });
}

// Send one reminder now, built exactly the way the scheduler would build it.
export async function previewReminder(lang, reminder) {
  const sub = await getSubscription();
  if (!sub) throw new Error('no-sub');
  return post({ op: 'preview', endpoint: sub.endpoint, lang, reminder });
}

// Heartbeat: hands the server fresh progress (so streak and goal reminders stay
// honest) and pulls back the delivered-word counts, so words pushed while the
// app was closed appear in their libraries even if the pushes were never tapped.
export async function syncFromServer() {
  const sub = await getSubscription().catch(() => null);
  if (!sub) return 0;

  const langs = {};
  for (const code of db.knownLangs()) langs[code] = { stats: db.statsPayload(code) };

  let status;
  try {
    status = await post({ op: 'sync', endpoint: sub.endpoint, tz: db.timeZone(), langs });
  } catch {
    status = await getStatus();
  }

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
