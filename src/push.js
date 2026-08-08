// Web Push subscription management, per language. Real pushes require the app
// to be installed to the iOS home screen (iOS 16.4+).
//
// The schedule lives in two places on purpose: localStorage owns it so the
// editor is instant and works offline, and every change is mirrored to the
// server, which is what actually decides when to send. Server calls carry the
// account's bearer token; subscriptions are linked to the signed-in user.
import { VAPID_PUBLIC_KEY } from './config.js';
import * as db from './store.js';
import { apiFetch } from './sync.js';

function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// Which languages this device wants reminders for, remembered locally so a
// lost subscription can be rebuilt without asking the user anything.
const PUSH_LANGS_KEY = 'vernacular:push-langs';

function pushLangs() {
  try {
    const list = JSON.parse(localStorage.getItem(PUSH_LANGS_KEY) || '[]');
    return Array.isArray(list) ? list.filter((c) => typeof c === 'string') : [];
  } catch {
    return [];
  }
}

function rememberPushLang(code, on) {
  try {
    const list = new Set(pushLangs());
    if (on) list.add(code);
    else list.delete(code);
    localStorage.setItem(PUSH_LANGS_KEY, JSON.stringify([...list]));
  } catch {
    /* private mode */
  }
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
  try {
    return await apiFetch('/api/subscribe', { method: 'POST', body: JSON.stringify(body) });
  } catch {
    throw new Error('server');
  }
}

// Server status: { subscribed, tz, langs: { code: { enabled, delivered, reminders, pausedUntil } } }
export async function getStatus() {
  const sub = await getSubscription().catch(() => null);
  if (!sub) return { subscribed: false, langs: {} };
  try {
    return await apiFetch(`/api/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`, {
      method: 'GET',
    });
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
  rememberPushLang(lang, true);
}

export async function disableLang(lang) {
  rememberPushLang(lang, false);
  const sub = await getSubscription();
  if (!sub) return;
  await post({ op: 'disableLang', endpoint: sub.endpoint, lang }).catch(() => {});
}

// iOS drops or rotates push subscriptions from time to time, and the cron
// deletes an endpoint the moment Apple reports it dead; either way reminders
// stop and nothing used to bring them back. Called on every app open: if this
// device wants reminders but the server no longer has a live row for the
// current endpoint, subscribe again and re-post the local schedule.
export async function repairSubscription() {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  const wanted = pushLangs();
  if (!wanted.length) return;
  try {
    const status = await getStatus();
    if (status.subscribed) return;
    for (const lang of wanted) await enableLang(lang);
  } catch {
    /* offline or signed out: the next open tries again */
  }
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
    // Mirror the server's enabled flags: devices subscribed before the local
    // memory existed learn their own state here, so a later loss is repairable.
    rememberPushLang(code, !!info?.enabled);
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
