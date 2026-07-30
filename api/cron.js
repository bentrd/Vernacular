// Called on a schedule (GitHub Actions) to push new words / review prompts,
// per subscriber and per enabled language.
// GET /api/cron?mode=word|review; requires Authorization: Bearer CRON_SECRET.
import { readFileSync, readdirSync } from 'node:fs';
import { loadSubs, saveSubs, migrateSub } from '../lib/subs.mjs';
import { sendPush } from '../lib/webpush.mjs';

const packsDir = new URL('../public/data/packs/', import.meta.url);
const packs = {};
for (const f of readdirSync(packsDir)) {
  if (f.endsWith('.json') && f !== 'index.json') {
    const p = JSON.parse(readFileSync(new URL(f, packsDir), 'utf8'));
    packs[p.code] = p;
  }
}

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
    const subs = (await loadSubs()).map(migrateSub);
    if (!subs.length) return res.json({ mode, sent: 0, subscribers: 0 });

    let sent = 0;
    const alive = [];

    outer: for (const sub of subs) {
      for (const [code, ls] of Object.entries(sub.langs)) {
        if (ls.enabled === false) continue;
        const pack = packs[code];
        if (!pack) continue;
        const words = pack.words;
        const strings = pack.strings || {};
        let payload = null;

        if (mode === 'word') {
          const w = words[(ls.index || 0) % words.length];
          payload = {
            title: `${w.hw} · ${strings.newWord || 'new word'}`,
            body: [w.g, [w.rom, w.en, w.fr].filter(Boolean).join(' · ')].filter(Boolean).join('\n'),
            url: `/?lang=${code}&word=${w.id}`,
            tag: `word-${code}-${w.id}`,
          };
        } else {
          const delivered = Math.min(ls.index || 0, words.length);
          if (delivered < 3) continue;
          const w = words[Math.floor(Math.random() * delivered)];
          const template = strings.whatMeans || 'What does “%s” mean?';
          payload = {
            title: template.replace('%s', w.hw),
            body: 'Time for your daily review. Tap to test yourself.',
            url: `/?lang=${code}&review=1`,
            tag: `review-${code}`,
          };
        }

        const result = await sendPush(sub.subscription, payload);
        if (result === 'gone') continue outer; // drop dead subscriptions entirely
        if (result === true) {
          sent++;
          if (mode === 'word') ls.index = (ls.index || 0) + 1;
        }
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
