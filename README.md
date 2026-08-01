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
- **Reminders you actually choose**: build your own schedule per language. Any number of reminders, each with its own time, days of the week, and type: a new word (up to three per push), a quick review quiz, a self check-in, a streak nudge, or your progress against today's goal. Any reminder can be set to stay quiet on days you have already practiced, and can carry your own wording instead of the standard message. Pause everything for a day, three days, or a week without losing the schedule. Times follow your own time zone.
- **Self-assessment**: a check-in that shows the week behind you (new words, reviews, days shown up, accuracy, mastery) and asks how confident you feel on a five-point scale, with an optional note. Past check-ins plot as a confidence trend.
- **Spaced repetition**: Leitner boxes decide when each word is due for review.
- **Practice modes**: flashcards, multiple choice (both directions), and type-the-word (accent- and tone-mark insensitive; pinyin and transliteration accepted).
- **Localized flavor**: greetings, section titles, and verdicts follow the language you're learning.
- **Your taste**: six accent colors (lilac by default), optional macrons for Latin, light and dark mode.
- **Local-first**: everything lives in `localStorage`; export/import per-language JSON backups. No accounts, no database.

## Architecture

```
index.html              Vite entry
src/                    React app; UI is built on Base UI primitives
src/ui/                 shared components (Sheet, Toggle, Stepper, chips, toasts…)
src/screens/            Today, Library, Practice, Settings, Reminders, Session
src/sheets/             the bottom sheets (languages, word, install, reminder, check-in, confirm)
src/store.js            all app state; localStorage-backed, framework-agnostic
lib/reminders.mjs       the schedule model and its engine; shared by app and API
lib/payload.mjs         turns a due reminder into a push payload
lib/subs.mjs            the subscription blob: load, save, migrate, sanitize
public/                 static assets copied to dist/ verbatim
public/data/packs/      dictionary packs (index.json + one file per language)
public/sw.js            service worker (offline shell, push handling)
api/subscribe.js        push subscriptions, schedules, and progress sync (Vercel Blob)
api/cron.js             the reminder tick: works out what is due and sends it
.github/workflows/notify.yml   GitHub Actions cron that hits /api/cron
```

### Reminders

Schedules are per subscription and per language. A reminder is
`{ id, type, time, days, enabled, count, onlyIfIdle, text }`, where `time` is
local to the subscriber's IANA time zone and `days` uses `Date#getDay` numbering.
The app owns the schedule in `localStorage` so the editor is instant and works
offline, and mirrors every change to the server, which is what decides when to
send.

`/api/cron` runs every 15 minutes. For each reminder it finds the most recent
occurrence at or before now, delivers it if that occurrence is within 55 minutes
and has not been delivered yet (`sentAt` records the exact occurrence), and
otherwise leaves it alone. That tolerates GitHub's cron drift and the occasional
skipped tick, and never sends the same occurrence twice.

Conditional reminders (`streak`, `goal`, and anything with `onlyIfIdle`) need to
know how the day is going, so the app posts a small progress summary
(`op: 'sync'`) whenever it opens or comes back to the foreground. When a
reminder has nothing to say, nothing is sent.

Manual sends: run the workflow by hand with a `force` type, or
`GET /api/cron?force=word` with the cron secret.

### UI components

The interface is built on [Base UI](https://base-ui.com) — Dialog/Drawer, Toast,
Switch, NumberField, Progress, Tabs, ToggleGroup, RadioGroup, and Field. Base UI
supplies behavior and accessibility (focus trapping, dismissal, roving focus,
ARIA); all styling lives in `src/main.css` and the design tokens are unchanged.

The bottom sheets use `Drawer`, which brings swipe-to-dismiss, backdrop and
Escape dismissal, background scroll locking, and proper exit animations.

## Development

```sh
npm install
npm run dev      # vite dev server
npm run build    # -> dist/
npm run preview  # serve the production build
```

## Dictionary data

Packs are built by [tools/build-packs.mjs](tools/build-packs.mjs) from open sources:

- [WikDict](https://www.wikdict.com) SQLite exports (Wiktionary-derived, CC BY-SA): bilingual pairs to English and French
- [CC-CEDICT](https://cc-cedict.org) (CC BY-SA): Chinese, including pinyin, traditional forms, and measure words
- [FrequencyWords](https://github.com/hermitdave/FrequencyWords) (OpenSubtitles corpus): 50k frequency lists for teaching order

The curated cores live in `tools/core/`. To rebuild, download the sources into a directory and run `node tools/build-packs.mjs <dir>`.

## Pack format

Each pack is a single JSON file: `{ code, name, native, marks, strings, words }`.
`strings` holds the localized UI flavor (greeting, verdicts, and the reminder
titles: `newWord`, `newWords`, `whatMeans`, `reviewBody`, `checkIn`,
`streakTitle`, `goalTitle`). Every one of them has an English fallback, so a new
pack can ship with none of them. Each word:
`{ id, hw, g, pos, en, fr, ex, exEn, exFr, rom? }`.
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

Reminder times are chosen in the app, not in the workflow.
[.github/workflows/notify.yml](.github/workflows/notify.yml) only sets how often
the schedule is checked (every 15 minutes). Widen that interval and reminders
land later; the 55 minute catch-up window in `lib/reminders.mjs` should stay
comfortably larger than it.

## iPhone setup

1. Open the app in Safari.
2. Share, then **Add to Home Screen**.
3. Open it from the Home Screen, go to **Settings**, then **Reminders**, and turn them on for the languages you want.
4. Set the times, days, and types you want, or start from one of the four setups.
