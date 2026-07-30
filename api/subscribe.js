import { loadSubs, saveSubs, findSub } from '../lib/subs.mjs';
import { sendPush } from '../lib/webpush.mjs';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const endpoint = req.query.endpoint;
      if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
      const subs = await loadSubs();
      const sub = findSub(subs, endpoint);
      return res.json({ subscribed: !!sub, delivered: sub?.index ?? 0 });
    }

    if (req.method === 'POST') {
      const body = req.body || {};

      if (body.op === 'test') {
        if (!body.endpoint) return res.status(400).json({ error: 'endpoint required' });
        const subs = await loadSubs();
        const sub = findSub(subs, body.endpoint);
        if (!sub) return res.status(404).json({ error: 'not subscribed' });
        const ok = await sendPush(sub.subscription, {
          title: 'Salvē! 👋',
          body: 'Notifications are working. New Latin words will arrive daily.',
          url: '/',
          tag: 'test',
        });
        return res.json({ sent: ok === true });
      }

      const { subscription, startAt } = body;
      if (!subscription?.endpoint || !subscription?.keys) {
        return res.status(400).json({ error: 'invalid subscription' });
      }
      const subs = await loadSubs();
      const existing = findSub(subs, subscription.endpoint);
      if (existing) {
        existing.subscription = subscription;
        existing.index = Math.max(existing.index || 0, Number(startAt) || 0);
      } else {
        subs.push({
          subscription,
          index: Number(startAt) || 0,
          createdAt: new Date().toISOString(),
        });
      }
      await saveSubs(subs);
      return res.json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const endpoint = req.body?.endpoint;
      if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
      const subs = await loadSubs();
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
