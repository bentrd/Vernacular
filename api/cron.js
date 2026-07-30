// Called on a schedule (GitHub Actions) to push new words / review prompts.
// GET /api/cron?mode=word|review — requires Authorization: Bearer CRON_SECRET.
import { readFileSync } from 'node:fs';
import { loadSubs, saveSubs } from '../lib/subs.mjs';
import { sendPush } from '../lib/webpush.mjs';

const words = JSON.parse(
  readFileSync(new URL('../public/data/words.json', import.meta.url), 'utf8')
);

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.authorization || '';
  return header === `Bearer ${secret}` || req.query.key === secret;
}

export default async function handler(req, res) {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });

  const mode = req.query.mode === 'review' ? 'review' : 'word';
  try {
    const subs = await loadSubs();
    if (!subs.length) return res.json({ mode, sent: 0, subscribers: 0 });

    let sent = 0;
    const alive = [];

    for (const sub of subs) {
      let payload = null;

      if (mode === 'word') {
        const w = words[sub.index % words.length];
        payload = {
          title: `${w.la} — novum verbum`,
          body: `${w.g}\n${w.en}`,
          url: `/?word=${w.id}`,
          tag: `word-${w.id}`,
        };
      } else {
        // review: quiz the user on a word they've already received
        const delivered = Math.min(sub.index, words.length);
        if (delivered < 3) {
          alive.push(sub);
          continue;
        }
        const w = words[Math.floor(Math.random() * delivered)];
        payload = {
          title: `Quid significat “${w.la}”?`,
          body: 'Time for your daily review — tap to test yourself.',
          url: '/?review=1',
          tag: 'review',
        };
      }

      const result = await sendPush(sub.subscription, payload);
      if (result === 'gone') continue; // drop dead subscriptions
      if (result === true) {
        sent++;
        if (mode === 'word') sub.index += 1;
      }
      alive.push(sub);
    }

    await saveSubs(alive);
    return res.json({ mode, sent, subscribers: alive.length });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal error' });
  }
}
