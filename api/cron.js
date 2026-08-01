// The reminder tick. GitHub Actions calls this every 15 minutes; it works out
// which of each subscriber's reminders have come due in their own time zone and
// sends those, and only those.
//
//   GET /api/cron                 evaluate every schedule (the normal tick)
//   GET /api/cron?force=word      send one push of that type to everyone, now
//   GET /api/cron?mode=word       accepted for the pre-schedule workflow
//
// Requires Authorization: Bearer CRON_SECRET (or ?key=).
import { loadSubs, saveSubs, migrateSub, pruneSentAt } from '../lib/subs.mjs';
import { sendPush } from '../lib/webpush.mjs';
import { getPack } from '../lib/packs.mjs';
import { buildPayload } from '../lib/payload.mjs';
import { EVERY_DAY, TYPES, dueReminders, normalizeReminder, zonedNow } from '../lib/reminders.mjs';

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.authorization || '';
  return header === `Bearer ${secret}` || req.query.key === secret;
}

// A forced send behaves like a reminder that is due right now for everyone.
function forcedReminder(type) {
  return normalizeReminder({ id: `force-${type}`, type, time: '00:00', days: [...EVERY_DAY] });
}

export default async function handler(req, res) {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });

  const forceType = req.query.force || req.query.mode || null;
  const force = TYPES.includes(forceType) ? forceType : null;
  const now = new Date();

  try {
    const subs = (await loadSubs()).map(migrateSub);
    if (!subs.length) return res.json({ sent: 0, subscribers: 0, force });

    let sent = 0;
    let skipped = 0;
    const alive = [];

    outer: for (const sub of subs) {
      const clock = zonedNow(sub.tz, now);

      for (const [code, ls] of Object.entries(sub.langs || {})) {
        if (ls.enabled === false) continue;
        const pack = getPack(code);
        if (!pack) continue;
        if (!force && ls.pausedUntil && clock.day <= ls.pausedUntil) continue;

        const due = force
          ? [{ reminder: forcedReminder(force), key: null }]
          : dueReminders(ls.reminders, sub.tz, now, ls.sentAt);

        for (const { reminder, key } of due) {
          const built = buildPayload({ pack, code, reminder, ls, today: clock.day });
          if (!built) {
            // Nothing worth saying (goal already met, streak already kept).
            // Still mark the occurrence so it is not reconsidered next tick.
            if (key) ls.sentAt[reminder.id] = key;
            skipped++;
            continue;
          }

          const result = await sendPush(sub.subscription, built.payload);
          if (result === 'gone') continue outer; // drop dead subscriptions entirely
          if (result === true) {
            sent++;
            if (built.advance) ls.index = (Number(ls.index) || 0) + built.advance;
            if (key) ls.sentAt[reminder.id] = key;
          }
        }

        pruneSentAt(ls);
      }

      alive.push(sub);
    }

    await saveSubs(alive);
    return res.json({ sent, skipped, subscribers: alive.length, force });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal error' });
  }
}
