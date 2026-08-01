// Push subscriptions and the reminder schedules attached to them.
// Requires a signed-in user; subscriptions are linked to the account.
//
//   GET  ?endpoint=…                              current server state
//   POST { subscription, lang, startAt, tz, reminders }  subscribe / enable a language
//   POST { op: 'schedule', … }                    replace one language's schedule
//   POST { op: 'sync', … }                        heartbeat: time zone + progress
//   POST { op: 'preview', … }                     send one reminder right now
//   POST { op: 'test' | 'disableLang', … }
//   DELETE { endpoint }                           forget the subscription
import {
  ensureLegacyImport,
  findSub,
  upsertSub,
  saveSub,
  deleteSub,
  pruneSentAt,
  sanitizeReminders,
  sanitizeStats,
} from '../lib/subs.mjs';
import { sendPush } from '../lib/webpush.mjs';
import { getPack } from '../lib/packs.mjs';
import { buildPayload } from '../lib/payload.mjs';
import { defaultReminders, isValidZone, normalizeReminder, zonedNow } from '../lib/reminders.mjs';
import { getUser, unauthorized } from '../lib/authz.mjs';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function publicLangs(sub) {
  const langs = {};
  for (const [code, ls] of Object.entries(sub.langs || {})) {
    langs[code] = {
      enabled: ls.enabled !== false,
      delivered: ls.index || 0,
      reminders: ls.reminders || [],
      pausedUntil: ls.pausedUntil || null,
    };
  }
  return langs;
}

function langRecord(sub, lang) {
  if (!sub.langs) sub.langs = {};
  if (!sub.langs[lang]) {
    // Seeded with the standard schedule, which the app's own list replaces in
    // the same request. It only shows through if a client ever enables a
    // language without sending one.
    sub.langs[lang] = {
      index: 0,
      enabled: true,
      reminders: defaultReminders(),
      sentAt: {},
      stats: {},
    };
  }
  const ls = sub.langs[lang];
  if (!ls.sentAt) ls.sentAt = {};
  if (!ls.stats) ls.stats = {};
  return ls;
}

export default async function handler(req, res) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized(res);
    await ensureLegacyImport();

    if (req.method === 'GET') {
      const endpoint = req.query.endpoint;
      if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
      const sub = await findSub(endpoint);
      if (!sub) return res.json({ subscribed: false, langs: {} });
      return res.json({ subscribed: true, tz: sub.tz, langs: publicLangs(sub) });
    }

    if (req.method === 'POST') {
      const body = req.body || {};

      if (body.op === 'test') {
        if (!body.endpoint) return res.status(400).json({ error: 'endpoint required' });
        const sub = await findSub(body.endpoint);
        if (!sub) return res.status(404).json({ error: 'not subscribed' });
        const ok = await sendPush(sub.subscription, {
          title: 'Verbum',
          body: 'Notifications are working. Your reminders will arrive on schedule.',
          url: '/',
          tag: 'test',
        });
        return res.json({ sent: ok === true });
      }

      // Send one reminder immediately, exactly as the cron would build it.
      if (body.op === 'preview') {
        if (!body.endpoint || !body.lang) {
          return res.status(400).json({ error: 'endpoint and lang required' });
        }
        const sub = await findSub(body.endpoint);
        if (!sub) return res.status(404).json({ error: 'not subscribed' });
        const pack = getPack(body.lang);
        if (!pack) return res.status(404).json({ error: 'unknown language' });

        const ls = langRecord(sub, body.lang);
        const reminder = normalizeReminder({ ...body.reminder, onlyIfIdle: false });
        const today = zonedNow(sub.tz).day;
        const built = buildPayload({ pack, code: body.lang, reminder, ls, today });
        // A preview never consumes a word and never fires the skip conditions
        // silently: if there is nothing to say, say that instead.
        const payload = built?.payload || {
          title: 'Nothing to send yet',
          body: 'This reminder has nothing to say right now. It stays quiet on days like this.',
          url: `/?lang=${body.lang}`,
          tag: `preview-${body.lang}`,
        };
        const ok = await sendPush(sub.subscription, payload);
        return res.json({ sent: ok === true, quiet: !built });
      }

      if (body.op === 'disableLang') {
        if (!body.endpoint || !body.lang) {
          return res.status(400).json({ error: 'endpoint and lang required' });
        }
        const sub = await findSub(body.endpoint);
        if (sub?.langs?.[body.lang]) {
          sub.langs[body.lang].enabled = false;
          await saveSub(sub);
        }
        return res.json({ ok: true });
      }

      // Replace one language's schedule.
      if (body.op === 'schedule') {
        if (!body.endpoint || !body.lang) {
          return res.status(400).json({ error: 'endpoint and lang required' });
        }
        const sub = await findSub(body.endpoint);
        if (!sub) return res.status(404).json({ error: 'not subscribed' });
        if (isValidZone(body.tz)) sub.tz = body.tz;

        const ls = langRecord(sub, body.lang);
        const reminders = sanitizeReminders(body.reminders);
        if (reminders) ls.reminders = reminders;
        if (body.pausedUntil === null || DAY_RE.test(String(body.pausedUntil || ''))) {
          ls.pausedUntil = body.pausedUntil || null;
        }
        if (body.stats) ls.stats = sanitizeStats(body.stats);
        pruneSentAt(ls);
        await saveSub(sub);
        return res.json({ ok: true, reminders: ls.reminders });
      }

      // Heartbeat from the app: keeps the time zone and progress fresh so
      // conditional reminders (streak, goal, "only if idle") stay honest.
      if (body.op === 'sync') {
        if (!body.endpoint) return res.status(400).json({ error: 'endpoint required' });
        const sub = await findSub(body.endpoint);
        if (!sub) return res.json({ subscribed: false, langs: {} });
        let touched = false;
        if (isValidZone(body.tz) && sub.tz !== body.tz) {
          sub.tz = body.tz;
          touched = true;
        }
        for (const [code, incoming] of Object.entries(body.langs || {})) {
          if (!sub.langs?.[code]) continue; // only languages that are subscribed
          sub.langs[code].stats = sanitizeStats(incoming?.stats);
          touched = true;
        }
        if (touched) await saveSub(sub);
        return res.json({ subscribed: true, tz: sub.tz, langs: publicLangs(sub) });
      }

      const { subscription, lang, startAt, tz, reminders, stats } = body;
      if (!subscription?.endpoint || !subscription?.keys || !lang) {
        return res.status(400).json({ error: 'subscription and lang required' });
      }
      const existing = await findSub(subscription.endpoint);
      const sub = existing || {
        endpoint: subscription.endpoint,
        subscription,
        tz: isValidZone(tz) ? tz : 'UTC',
        langs: {},
      };
      sub.subscription = subscription;
      if (isValidZone(tz)) sub.tz = tz;

      const ls = langRecord(sub, lang);
      ls.index = Math.max(Number(ls.index) || 0, Number(startAt) || 0);
      ls.enabled = true;
      ls.pausedUntil = null;
      const clean = sanitizeReminders(reminders);
      if (clean) ls.reminders = clean;
      if (stats) ls.stats = sanitizeStats(stats);
      pruneSentAt(ls);

      await upsertSub({
        endpoint: sub.endpoint,
        userId: user.id,
        subscription,
        tz: sub.tz,
        langs: sub.langs,
      });
      return res.json({ ok: true, reminders: ls.reminders });
    }

    if (req.method === 'DELETE') {
      const endpoint = req.body?.endpoint;
      if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
      await deleteSub(endpoint);
      return res.json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal error' });
  }
}
