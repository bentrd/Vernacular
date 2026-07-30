import webpush from 'web-push';

let configured = false;

export function getWebPush() {
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:hello@example.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    configured = true;
  }
  return webpush;
}

// Returns true on success, 'gone' when the subscription is dead, false otherwise.
export async function sendPush(subscription, payload) {
  try {
    await getWebPush().sendNotification(subscription, JSON.stringify(payload), { TTL: 6 * 3600 });
    return true;
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) return 'gone';
    console.error('push failed', err.statusCode, err.body || err.message);
    return false;
  }
}
