import { loadSubs, saveSubs, findSub, migrateSub } from '../lib/subs.mjs';
import { sendPush } from '../lib/webpush.mjs';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const endpoint = req.query.endpoint;
      if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
      const subs = (await loadSubs()).map(migrateSub);
      const sub = findSub(subs, endpoint);
      if (!sub) return res.json({ subscribed: false, langs: {} });
      const langs = {};
      for (const [code, ls] of Object.entries(sub.langs)) {
        langs[code] = { enabled: ls.enabled !== false, delivered: ls.index || 0 };
      }
      return res.json({ subscribed: true, langs });
    }

    if (req.method === 'POST') {
      const body = req.body || {};

      if (body.op === 'test') {
        if (!body.endpoint) return res.status(400).json({ error: 'endpoint required' });
        const subs = (await loadSubs()).map(migrateSub);
        const sub = findSub(subs, body.endpoint);
        if (!sub) return res.status(404).json({ error: 'not subscribed' });
        const ok = await sendPush(sub.subscription, {
          title: 'Vernacular',
          body: 'Notifications are working. New words will arrive daily.',
          url: '/',
          tag: 'test',
        });
        return res.json({ sent: ok === true });
      }

      if (body.op === 'disableLang') {
        if (!body.endpoint || !body.lang) return res.status(400).json({ error: 'endpoint and lang required' });
        const subs = (await loadSubs()).map(migrateSub);
        const sub = findSub(subs, body.endpoint);
        if (sub?.langs?.[body.lang]) {
          sub.langs[body.lang].enabled = false;
          await saveSubs(subs);
        }
        return res.json({ ok: true });
      }

      const { subscription, lang, startAt } = body;
      if (!subscription?.endpoint || !subscription?.keys || !lang) {
        return res.status(400).json({ error: 'subscription and lang required' });
      }
      const subs = (await loadSubs()).map(migrateSub);
      const existing = findSub(subs, subscription.endpoint);
      if (existing) {
        existing.subscription = subscription;
        const ls = existing.langs[lang] || { index: 0 };
        ls.index = Math.max(ls.index || 0, Number(startAt) || 0);
        ls.enabled = true;
        existing.langs[lang] = ls;
      } else {
        subs.push({
          subscription,
          langs: { [lang]: { index: Number(startAt) || 0, enabled: true } },
          createdAt: new Date().toISOString(),
        });
      }
      await saveSubs(subs);
      return res.json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const endpoint = req.body?.endpoint;
      if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
      const subs = (await loadSubs()).map(migrateSub);
      const next = subs.filter((s) => s.subscription?.endpoint !== endpoint);
      if (next.length !== subs.length) await saveSubs(next);
      return res.json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal error' });
  }
}
