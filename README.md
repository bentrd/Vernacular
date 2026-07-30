# Vernacular

**Learn a language, one word at a time.**

A minimal, installable web app (PWA) that grows your vocabulary with push
notifications throughout the day, plus flashcards, quizzes, and a
spaced-repetition review system. Ships with seven dictionary packs: Latin,
Spanish, English, French, Italian, Russian, and Mandarin Chinese. Designed in
the spirit of Apple and OpenAI: quiet, warm, typographic.

## Features

- **Seven full dictionaries**: 207,000+ words total (32,000 each for Spanish, English, French, Italian, Russian, and Chinese; 15,000 for Latin). A hand-curated core of ~400 words per language carries example sentences and rich grammar notes; behind it sits the full dictionary tier built from real lexicographic data, ordered by corpus frequency. English and French meanings, pinyin for Chinese, transliteration and stress marks for Russian, macrons for Latin.
- **Dictionary search**: searching the Library also searches the entire dictionary; any word can be added to your learning queue from there.
- **Per-language everything**: library, streak, daily goal, notifications, and backups are tracked separately for each language. Switch languages from the Today screen.
- **Installable on iPhone**: add to Home Screen from Safari; it looks and feels native.
- **Push notifications**: three new words a day and one evening review prompt, per enabled language (iOS 16.4+, once installed).
- **Spaced repetition**: Leitner boxes decide when each word is due for review.
- **Practice modes**: flashcards, multiple choice (both directions), and type-the-word (accent- and tone-mark insensitive; pinyin and transliteration accepted).
- **Localized flavor**: greetings, section titles, and verdicts follow the language you're learning.
- **Your taste**: six accent colors (lilac by default), optional macrons for Latin, light and dark mode.
- **Local-first**: everything lives in `localStorage`; export/import per-language JSON backups. No accounts, no database.

## Architecture

```
public/                 static PWA (vanilla JS, no build step)
public/data/packs/      dictionary packs (index.json + one file per language)
api/subscribe.js        per-language push subscriptions (stored in Vercel Blob)
api/cron.js             sends the pushes; called on a schedule
.github/workflows/notify.yml   GitHub Actions cron that hits /api/cron
```

## Dictionary data

Packs are built by [tools/build-packs.mjs](tools/build-packs.mjs) from open sources:

- [WikDict](https://www.wikdict.com) SQLite exports (Wiktionary-derived, CC BY-SA): bilingual pairs to English and French
- [CC-CEDICT](https://cc-cedict.org) (CC BY-SA): Chinese, including pinyin, traditional forms, and measure words
- [FrequencyWords](https://github.com/hermitdave/FrequencyWords) (OpenSubtitles corpus): 50k frequency lists for teaching order

The curated cores live in `tools/core/`. To rebuild, download the sources into a directory and run `node tools/build-packs.mjs <dir>`.

## Pack format

Each pack is a single JSON file: `{ code, name, native, marks, strings, words }`.
`strings` holds the localized UI flavor (greeting, verdicts, notification
titles). Each word: `{ id, hw, g, pos, en, fr, ex, exEn, exFr, rom? }`.
Adding a language = adding one pack file and re-running the index build.

## Configuration

Vercel environment variables:

| Variable | Purpose |
| --- | --- |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web Push (VAPID) keypair |
| `VAPID_SUBJECT` | `mailto:` contact for push services |
| `CRON_SECRET` | shared secret protecting `/api/cron` |
| `BLOB_READ_WRITE_TOKEN` | added automatically when the Blob store is connected |

GitHub repo settings:

- **Variable** `APP_URL`: the production URL
- **Secret** `CRON_SECRET`: same value as on Vercel

Notification times are plain cron lines in
[.github/workflows/notify.yml](.github/workflows/notify.yml) (UTC): edit and push to change them.

## iPhone setup

1. Open the app in Safari.
2. Share, then **Add to Home Screen**.
3. Open it from the Home Screen, go to **Settings**, and enable notifications for the languages you want.
