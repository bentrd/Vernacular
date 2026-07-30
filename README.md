# Vernacular

**Learn Latin, one word at a time.**

A minimal, installable web app (PWA) that broadens your Latin vocabulary with
push notifications throughout the day, plus flashcards, quizzes, and a
spaced-repetition review system. Designed in the spirit of Apple and OpenAI:
quiet, warm, typographic.

## Features

- 📲 **Installable on iPhone**: add to Home Screen from Safari; it looks and feels native.
- 🔔 **Push notifications**: three new words a day and one evening review prompt (iOS 16.4+, once installed).
- 📖 **Personal library**: every word you collect, searchable, with grammar info and example sentences.
- 🧠 **Spaced repetition**: Leitner boxes decide when each word is due for review.
- 🃏 **Practice modes**: flashcards, multiple choice (Latin ↔ English), and type-the-Latin.
- 🔥 **Streaks & daily goals**: gentle accountability.
- 💾 **Local-first**: everything lives in `localStorage`; export/import your library as JSON anytime. No accounts, no database.

## Architecture

```
public/          static PWA (vanilla JS, no build step)
api/subscribe.js manage push subscriptions (stored in Vercel Blob)
api/cron.js      sends the pushes; called on a schedule
.github/workflows/notify.yml   GitHub Actions cron that hits /api/cron
```

- Hosted on **Vercel** (static files + two serverless functions).
- Push subscriptions are the only server-side state, kept in a single JSON file on **Vercel Blob**.
- **GitHub Actions** provides the schedule (Vercel Hobby crons only run once daily).
- The word list (~280 curated words, frequency-ordered with macrons, principal parts, and example sentences) ships as `public/data/words.json`.

## Configuration

Vercel environment variables:

| Variable | Purpose |
| --- | --- |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web Push (VAPID) keypair |
| `VAPID_SUBJECT` | `mailto:` contact for push services |
| `CRON_SECRET` | shared secret protecting `/api/cron` |
| `BLOB_READ_WRITE_TOKEN` | added automatically when the Blob store is connected |

GitHub repo settings:

- **Variable** `APP_URL`: the production URL (e.g. `https://vernacular.vercel.app`)
- **Secret** `CRON_SECRET`: same value as on Vercel

Notification times are plain cron lines in
[.github/workflows/notify.yml](.github/workflows/notify.yml) (UTC): edit and push to change them.

## iPhone setup

1. Open the app in Safari.
2. Share → **Add to Home Screen**.
3. Open it from the Home Screen, go to **Settings → Daily word notifications**.

---

*Fēcit cum amōre. Omnia verba tua sunt.*
