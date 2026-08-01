// The reminder schedule model, shared by the app and the push API.
//
// A reminder is one recurring notification:
//   { id, type, time: 'HH:MM', days: [0..6], enabled, count, onlyIfIdle, text }
//
// Times are local to the subscriber's IANA time zone, which the app reports
// when it syncs. The cron endpoint ticks every 15 minutes and asks
// `dueReminders()` which occurrences have come round since the last tick, so a
// reminder fires once per occurrence even when a tick is late or skipped.
//
// Nothing here touches Node or the DOM: the app imports it for the editor UI,
// api/cron.js imports it for the schedule engine.

export const TYPES = ['word', 'review', 'assess', 'streak', 'goal'];

// Copy for the editor. The notification copy itself lives in lib/payload.mjs,
// where the language pack can localize it.
export const TYPE_META = {
  word: {
    label: 'New word',
    blurb: 'The next word from the dictionary',
    icon: 'sparkles',
  },
  review: {
    label: 'Quick review',
    blurb: 'Quizzes you on a word you already have',
    icon: 'cards',
  },
  assess: {
    label: 'Self check-in',
    blurb: 'Rate how it is going and see your week',
    icon: 'trophy',
  },
  streak: {
    label: 'Streak nudge',
    blurb: 'Only arrives if the day is still empty',
    icon: 'sun',
  },
  goal: {
    label: 'Goal progress',
    blurb: 'How far off today’s goal you are',
    icon: 'list',
  },
};

export const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
export const WEEKDAYS = [1, 2, 3, 4, 5];
export const WEEKENDS = [0, 6];

// Sunday first, matching Date#getDay.
export const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const MAX_REMINDERS = 12;
export const MAX_TEXT = 90;
// How far past its time an occurrence may still be delivered. Wide enough to
// survive a missed tick or GitHub's cron drift, short enough that a reminder
// never lands in the wrong part of the day.
export const CATCH_UP_MINUTES = 55;

export const newId = () => `r${Math.random().toString(36).slice(2, 9)}`;

// times
export function parseTime(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function clampTime(t, fallback = '09:00') {
  const mins = parseTime(t);
  if (mins == null) return fallback;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

// 'HH:MM' in the reader's own locale, so 21:00 shows as 9:00 PM where that is normal.
export function formatTime(t) {
  const mins = parseTime(t);
  if (mins == null) return t;
  const d = new Date(2000, 0, 1, Math.floor(mins / 60), mins % 60);
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(d);
  } catch {
    return clampTime(t);
  }
}

// days
export function cleanDays(days) {
  if (!Array.isArray(days)) return [...EVERY_DAY];
  const set = new Set(days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6));
  return set.size ? [...set].sort((a, b) => a - b) : [...EVERY_DAY];
}

const sameDays = (a, b) => a.length === b.length && a.every((d, i) => d === b[i]);

export function describeDays(days) {
  const d = cleanDays(days);
  if (sameDays(d, EVERY_DAY)) return 'Every day';
  if (sameDays(d, WEEKDAYS)) return 'Weekdays';
  if (sameDays(d, WEEKENDS)) return 'Weekends';
  if (d.length === 1) return `${DAY_NAMES[d[0]]}s`;
  // Monday-first reading order, which is how the chips are laid out.
  const order = [1, 2, 3, 4, 5, 6, 0].filter((n) => d.includes(n));
  return order.map((n) => DAY_NAMES[n].slice(0, 3)).join(' ');
}

// reminders
export function normalizeReminder(r, i = 0) {
  const type = TYPES.includes(r?.type) ? r.type : 'word';
  const text = typeof r?.text === 'string' ? r.text.trim().slice(0, MAX_TEXT) : '';
  return {
    id: typeof r?.id === 'string' && r.id ? r.id.slice(0, 24) : `r${i}${newId()}`,
    type,
    time: clampTime(r?.time),
    days: cleanDays(r?.days),
    enabled: r?.enabled !== false,
    count: type === 'word' ? Math.min(3, Math.max(1, Math.round(Number(r?.count) || 1))) : 1,
    onlyIfIdle: !!r?.onlyIfIdle,
    text,
  };
}

export function normalizeReminders(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_REMINDERS).map(normalizeReminder);
}

export function sortReminders(list) {
  return [...list].sort((a, b) => (parseTime(a.time) ?? 0) - (parseTime(b.time) ?? 0));
}

// The classic Vernacular rhythm: three words through the day, one evening quiz.
export function defaultReminders() {
  return [
    { id: 'w-morning', type: 'word', time: '09:30', days: [...EVERY_DAY] },
    { id: 'w-midday', type: 'word', time: '13:30', days: [...EVERY_DAY] },
    { id: 'w-evening', type: 'word', time: '17:30', days: [...EVERY_DAY] },
    { id: 'q-night', type: 'review', time: '21:00', days: [...EVERY_DAY] },
  ].map((r) => normalizeReminder(r));
}

export const PRESETS = [
  {
    id: 'light',
    label: 'Light',
    blurb: 'One word with your coffee',
    build: () => [{ id: 'w-morning', type: 'word', time: '08:30', days: [...EVERY_DAY] }],
  },
  {
    id: 'standard',
    label: 'Standard',
    blurb: 'Three words through the day, one evening quiz',
    build: defaultReminders,
  },
  {
    id: 'intense',
    label: 'Intense',
    blurb: 'Four words, two quizzes, a nudge if the day is empty',
    build: () => [
      { id: 'w-1', type: 'word', time: '08:00', days: [...EVERY_DAY] },
      { id: 'w-2', type: 'word', time: '12:00', days: [...EVERY_DAY] },
      { id: 'q-1', type: 'review', time: '14:30', days: [...EVERY_DAY] },
      { id: 'w-3', type: 'word', time: '16:30', days: [...EVERY_DAY] },
      { id: 'w-4', type: 'word', time: '19:00', days: [...EVERY_DAY] },
      { id: 'q-2', type: 'review', time: '21:00', days: [...EVERY_DAY] },
      { id: 's-1', type: 'streak', time: '21:45', days: [...EVERY_DAY] },
    ],
  },
  {
    id: 'coach',
    label: 'Coach',
    blurb: 'Words on weekdays, goal check, Sunday self-assessment',
    build: () => [
      { id: 'w-1', type: 'word', time: '09:00', days: [...WEEKDAYS], count: 2 },
      { id: 'q-1', type: 'review', time: '18:30', days: [...EVERY_DAY], onlyIfIdle: true },
      { id: 'g-1', type: 'goal', time: '20:30', days: [...WEEKDAYS] },
      { id: 'a-1', type: 'assess', time: '19:00', days: [0] },
    ],
  },
].map((p) => ({ ...p, build: () => p.build().map((r) => normalizeReminder(r)) }));

export function presetSummary(preset) {
  const list = preset.build();
  const words = list.filter((r) => r.type === 'word').reduce((n, r) => n + r.count, 0);
  const rest = list.length - list.filter((r) => r.type === 'word').length;
  const bits = [];
  if (words) bits.push(`${words} word${words === 1 ? '' : 's'}`);
  if (rest) bits.push(`${rest} prompt${rest === 1 ? '' : 's'}`);
  return bits.join(' · ');
}

// zoned clock
const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function isValidZone(tz) {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// { day: 'YYYY-MM-DD', weekday: 0..6, minutes: since local midnight }
export function zonedNow(tz, date = new Date()) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz || 'UTC',
      hour12: false,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(date);
  } catch {
    return zonedNow('UTC', date);
  }
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  // Some ICU builds report midnight as hour 24 under hour12:false.
  const hour = Number(get('hour')) % 24;
  return {
    day: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: WEEKDAY_INDEX[get('weekday')] ?? 0,
    minutes: hour * 60 + Number(get('minute')),
  };
}

export function prevDay(day) {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d - 1));
  const pad = (n) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/**
 * Which reminders have come due and have not been delivered yet.
 *
 * For every reminder we find the latest occurrence at or before now (today's,
 * or yesterday's when the time has not come round yet today), keep it if it is
 * inside the catch-up window and its weekday is selected, and drop it if
 * `sentAt` already records that exact occurrence.
 *
 * Returns [{ reminder, key, day }], earliest time first.
 */
export function dueReminders(reminders, tz, now = new Date(), sentAt = {}, windowMin = CATCH_UP_MINUTES) {
  const z = zonedNow(tz, now);
  const due = [];
  for (const r of sortReminders(normalizeReminders(reminders))) {
    if (!r.enabled) continue;
    const at = parseTime(r.time);
    if (at == null) continue;

    let day = z.day;
    let weekday = z.weekday;
    let elapsed = z.minutes - at;
    if (elapsed < 0) {
      day = prevDay(z.day);
      weekday = (weekday + 6) % 7;
      elapsed += 1440;
    }
    if (elapsed > windowMin) continue;
    if (!r.days.includes(weekday)) continue;

    const key = `${day}T${r.time}`;
    if (sentAt?.[r.id] === key) continue;
    due.push({ reminder: r, key, day });
  }
  return due;
}

// A one-line summary of a schedule, for the Settings row.
export function summarize(reminders) {
  const list = normalizeReminders(reminders).filter((r) => r.enabled);
  if (!list.length) return 'Off';
  const first = sortReminders(list)[0];
  return `${list.length} reminder${list.length === 1 ? '' : 's'} · from ${formatTime(first.time)}`;
}
