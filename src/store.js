// Local state, one namespace per language. Packs are fetched on demand.
// localStorage 'vernacular:v2' = {
//   activeLang, accent, showMarks, prefsU,
//   langs: { <code>: { dict, unlocked, goal, goalU, resetAt, removed, stats,
//                      reminders, pausedUntil, checkins } }
// }
// The store stays the app's working copy (so the PWA works offline and every
// interaction is instant); src/sync.js mirrors it into the account via
// /api/sync. Mutations stamp `u` / `prefsU` / `goalU` (epoch ms) so devices
// merge by last-write-wins, and removals leave tombstones in `removed`.
// Reminder schedules and pauses stay device-local: they belong to this
// device's push subscription, not to the account.
import {
  defaultReminders,
  normalizeReminder,
  normalizeReminders,
  sortReminders,
  newId,
} from '../lib/reminders.mjs';

const KEY = 'vernacular:v2';
const LEGACY_KEY = 'vernacular:v1';

// Leitner-style intervals in days, indexed by box. Box 0 = brand new (due today).
const INTERVALS = [0, 1, 2, 4, 7, 15, 30];
export const MASTERED_BOX = 4;
export const DEFAULT_LANG = 'la';

// packs
const packCache = new Map();
const packInFlight = new Map();
let pack = null; // active pack {code, name, native, marks, strings, words}
let byId = null;
let index = null; // [{code, name, native, count, marks}]

// Subscription layer, so React can render off this module via useSyncExternalStore.
const listeners = new Set();
let revision = 0;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function getRevision() {
  return revision;
}
let emitScheduled = false;
// Deferred + batched: several save() calls in one turn wake subscribers once,
// and a save() that happens during a render never re-enters React mid-render.
function emit() {
  revision += 1;
  if (emitScheduled) return;
  emitScheduled = true;
  queueMicrotask(() => {
    emitScheduled = false;
    for (const fn of listeners) fn();
  });
}

export async function loadIndex() {
  if (index) return index;
  const res = await fetch('/data/packs/index.json');
  index = await res.json();
  return index;
}

export function loadedPackCodes() {
  return new Set(packCache.keys());
}

export async function loadPack(code) {
  if (packCache.has(code)) return packCache.get(code);
  // Packs are 1-4 MB. Share one request per code so a second tap on the same
  // language doesn't kick off a second multi-megabyte download.
  if (packInFlight.has(code)) return packInFlight.get(code);
  const promise = (async () => {
    const res = await fetch(`/data/packs/${code}.json`);
    if (!res.ok) throw new Error(`pack ${code} not found`);
    const p = await res.json();
    p.byId = new Map(p.words.map((w) => [w.id, w]));
    packCache.set(code, p);
    return p;
  })().finally(() => packInFlight.delete(code));
  packInFlight.set(code, promise);
  return promise;
}

export async function activatePack(code) {
  const loaded = await loadPack(code);
  pack = loaded;
  byId = loaded.byId;
  const s = getState();
  if (s.activeLang !== code) {
    s.activeLang = code;
    s.prefsU = Date.now();
    save();
  } else {
    emit();
  }
  return pack;
}

export const activePack = () => pack;
export const allWords = () => pack?.words || [];
export const wordById = (id) => byId?.get(id);
export const packStrings = () => pack?.strings || {};

const foldKey = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function searchDictionary(q, limit = 50) {
  if (!pack || !q) return [];
  if (!pack.searchIndex) {
    pack.searchIndex = pack.words.map((w) =>
      foldKey([w.hw, w.en || '', w.fr || '', w.rom || ''].join(' ')));
  }
  const out = [];
  for (let i = 0; i < pack.words.length && out.length < limit; i++) {
    if (pack.searchIndex[i].includes(q)) out.push(pack.words[i]);
  }
  return out;
}

// diacritic display (e.g. Latin macrons), toggled in settings
const stripCombining = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
export function display(s) {
  const st = getState();
  if (st.showMarks || !pack?.marks) return s;
  return stripCombining(s);
}

// date helpers (local time)
const pad = (n) => String(n).padStart(2, '0');
export function dayStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function addDays(day, n) {
  const [y, m, dd] = day.split('-').map(Number);
  return dayStr(new Date(y, m - 1, dd + n));
}
export function dayDiff(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

// state
function langDefaults() {
  return {
    dict: {}, // id -> { addedAt, box, due, correct, wrong, u }
    unlocked: 0,
    goal: 3,
    goalU: 0,
    resetAt: 0,
    removed: {}, // id -> removedAt ms (sync tombstones)
    stats: { streak: 0, lastActive: null, byDay: {} },
    reminders: defaultReminders(),
    pausedUntil: null,
    checkins: [], // [{ day, rating, note, snap, u }]
  };
}

// Language records written before reminders or account sync existed are
// filled in on read.
function fillLang(ls) {
  if (!Array.isArray(ls.reminders)) ls.reminders = defaultReminders();
  if (!Array.isArray(ls.checkins)) ls.checkins = [];
  if (ls.pausedUntil === undefined) ls.pausedUntil = null;
  if (typeof ls.goalU !== 'number') ls.goalU = 0;
  if (typeof ls.resetAt !== 'number') ls.resetAt = 0;
  if (!ls.removed) ls.removed = {};
  return ls;
}

function defaults() {
  return { activeLang: DEFAULT_LANG, accent: 'lilac', showMarks: true, prefsU: 0, langs: {} };
}

let state = null;

function migrateLegacy() {
  try {
    const old = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
    if (!old || !old.dict) return null;
    const s = defaults();
    s.langs[DEFAULT_LANG] = {
      ...langDefaults(),
      dict: old.dict || {},
      unlocked: old.unlocked || 0,
      goal: old.goal || 3,
      stats: old.stats || langDefaults().stats,
    };
    localStorage.removeItem(LEGACY_KEY);
    return s;
  } catch {
    return null;
  }
}

export function getState() {
  if (!state) {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      state = raw ? { ...defaults(), ...raw } : migrateLegacy() || defaults();
    } catch {
      state = defaults();
    }
    if (!state.langs) state.langs = {};
    if (typeof state.prefsU !== 'number') state.prefsU = 0;
    save();
  }
  return state;
}

export function langState(code = getState().activeLang) {
  const s = getState();
  if (!s.langs[code]) {
    s.langs[code] = langDefaults();
    save();
  }
  return fillLang(s.langs[code]);
}

// Every language the device knows about, active or not.
export function knownLangs() {
  return Object.keys(getState().langs);
}

export function timeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
  emit();
}

export function setAccent(name) {
  const s = getState();
  s.accent = name;
  s.prefsU = Date.now();
  save();
}
export function setShowMarks(v) {
  const s = getState();
  s.showMarks = !!v;
  s.prefsU = Date.now();
  save();
}
export function setGoal(n) {
  const ls = langState();
  ls.goal = n;
  ls.goalU = Date.now();
  save();
}

// reminders, per language (device-local; mirrored to the push subscription)
export function reminders(code = getState().activeLang) {
  return sortReminders(normalizeReminders(langState(code).reminders));
}

export function addReminder(code, draft) {
  const ls = langState(code);
  ls.reminders = [...normalizeReminders(ls.reminders), normalizeReminder({ id: newId(), ...draft })];
  save();
  return ls.reminders[ls.reminders.length - 1];
}

export function updateReminder(code, id, patch) {
  const ls = langState(code);
  ls.reminders = normalizeReminders(ls.reminders).map((r) =>
    r.id === id ? normalizeReminder({ ...r, ...patch, id }) : r
  );
  save();
}

export function removeReminder(code, id) {
  const ls = langState(code);
  ls.reminders = normalizeReminders(ls.reminders).filter((r) => r.id !== id);
  save();
}

export function setReminders(code, list) {
  langState(code).reminders = normalizeReminders(list);
  save();
}

// Pause everything for a language for a few days, without losing the schedule.
export function pauseReminders(code, days) {
  const ls = langState(code);
  ls.pausedUntil = days > 0 ? addDays(dayStr(), days - 1) : null;
  save();
}

export function pausedUntil(code = getState().activeLang) {
  const until = langState(code).pausedUntil;
  return until && until >= dayStr() ? until : null;
}

// What the server needs to decide whether a conditional reminder has anything
// to say: where today stands, and how far the library has come.
export function statsPayload(code) {
  const ls = langState(code);
  const today = dayStr();
  const t = ls.stats.byDay[today] || { new: 0, reviews: 0 };
  const entries = Object.values(ls.dict);
  return {
    day: today,
    lastActive: ls.stats.lastActive,
    streak: ls.stats.streak || 0,
    newToday: t.new || 0,
    goal: ls.goal || 3,
    due: entries.filter((e) => e.due <= today).length,
    unlocked: ls.unlocked || 0,
    learned: entries.length,
  };
}

// self-assessment
export const RATINGS = [
  { value: 1, label: 'Lost', blurb: 'None of it is sticking' },
  { value: 2, label: 'Shaky', blurb: 'I recognize more than I recall' },
  { value: 3, label: 'Steady', blurb: 'Slow, but it is going in' },
  { value: 4, label: 'Solid', blurb: 'Most words come back to me' },
  { value: 5, label: 'Sharp', blurb: 'I could use these in a sentence' },
];

const MAX_CHECKINS = 24;

// A week at a glance, computed without the pack so it works for any language.
export function weekSnapshot(code = getState().activeLang) {
  const ls = langState(code);
  const today = dayStr();
  let fresh = 0;
  let reviews = 0;
  let activeDays = 0;
  for (let i = 0; i < 7; i++) {
    const rec = ls.stats.byDay[addDays(today, -i)];
    if (!rec) continue;
    fresh += rec.new || 0;
    reviews += rec.reviews || 0;
    if ((rec.new || 0) + (rec.reviews || 0) > 0) activeDays++;
  }
  const entries = Object.values(ls.dict);
  const correct = entries.reduce((n, e) => n + (e.correct || 0), 0);
  const wrong = entries.reduce((n, e) => n + (e.wrong || 0), 0);
  return {
    new: fresh,
    reviews,
    activeDays,
    total: entries.length,
    mastered: entries.filter((e) => (e.box || 0) >= MASTERED_BOX).length,
    due: entries.filter((e) => e.due <= today).length,
    streak: ls.stats.streak || 0,
    accuracy: correct + wrong ? Math.round((correct / (correct + wrong)) * 100) : null,
  };
}

export function checkIns(code = getState().activeLang) {
  return langState(code).checkins;
}

export function lastCheckIn(code = getState().activeLang) {
  const list = checkIns(code);
  return list.length ? list[list.length - 1] : null;
}

export function recordCheckIn(code, rating, note = '') {
  const ls = langState(code);
  const day = dayStr();
  const entry = {
    day,
    rating,
    note: String(note || '').trim().slice(0, 240),
    snap: weekSnapshot(code),
    u: Date.now(),
  };
  // One check-in per day: a second one that day replaces the first.
  const rest = ls.checkins.filter((c) => c.day !== day);
  ls.checkins = [...rest, entry].slice(-MAX_CHECKINS);
  // Sitting down to assess yourself counts as showing up.
  touchActivity(code);
  save();
  return entry;
}

// Only nag when the language actually asked for check-ins.
export function checkInDue(code = getState().activeLang) {
  const wants = reminders(code).some((r) => r.type === 'assess' && r.enabled);
  if (!wants) return false;
  const last = lastCheckIn(code);
  return !last || dayDiff(last.day, dayStr()) >= 6;
}

function touchActivity(code = getState().activeLang) {
  const ls = langState(code);
  const today = dayStr();
  if (ls.stats.lastActive !== today) {
    ls.stats.streak =
      ls.stats.lastActive && dayDiff(ls.stats.lastActive, today) === 1 ? ls.stats.streak + 1 : 1;
    ls.stats.lastActive = today;
  }
  if (!ls.stats.byDay[today]) ls.stats.byDay[today] = { new: 0, reviews: 0 };
  return ls.stats.byDay[today];
}

export function todayCounts() {
  return langState().stats.byDay[dayStr()] || { new: 0, reviews: 0 };
}

// dictionary (always the active language)
export function addWord(id) {
  const ls = langState();
  if (ls.dict[id]) return false;
  ls.dict[id] = { addedAt: dayStr(), box: 0, due: dayStr(), correct: 0, wrong: 0, u: Date.now() };
  delete ls.removed[id];
  touchActivity().new += 1;
  const idx = pack ? pack.words.findIndex((w) => w.id === id) : -1;
  if (idx >= 0 && idx + 1 > ls.unlocked) ls.unlocked = idx + 1;
  save();
  return true;
}

export function nextLockedWord() {
  const ls = langState();
  if (!pack) return null;
  for (const w of pack.words) {
    if (!ls.dict[w.id]) return w;
  }
  return null;
}

// Server has delivered `count` words for language `code`; make sure they're in that library.
export function ensureUnlocked(code, packForCode, count) {
  const ls = langState(code);
  let added = 0;
  for (let i = 0; i < Math.min(count, packForCode.words.length); i++) {
    const id = packForCode.words[i].id;
    if (!ls.dict[id] && !ls.removed[id]) {
      ls.dict[id] = { addedAt: dayStr(), box: 0, due: dayStr(), correct: 0, wrong: 0, u: Date.now() };
      added++;
    }
  }
  if (count > ls.unlocked) ls.unlocked = count;
  if (added) save();
  return added;
}

export function removeWord(id) {
  const ls = langState();
  delete ls.dict[id];
  ls.removed[id] = Date.now();
  save();
}

export function statusOf(entry) {
  if (!entry || entry.box === 0) return 'new';
  return entry.box >= MASTERED_BOX ? 'mastered' : 'learning';
}

export function dictEntries() {
  return Object.entries(langState().dict)
    .map(([id, e]) => ({ id, word: wordById(id), entry: e }))
    .filter((x) => x.word);
}

export function dueWords() {
  const today = dayStr();
  return dictEntries().filter(({ entry }) => entry.due <= today);
}

export function counts() {
  const entries = dictEntries();
  return {
    total: entries.length,
    new: entries.filter((x) => statusOf(x.entry) === 'new').length,
    learning: entries.filter((x) => statusOf(x.entry) === 'learning').length,
    mastered: entries.filter((x) => statusOf(x.entry) === 'mastered').length,
    due: dueWords().length,
  };
}

export function wordCountFor(code) {
  return Object.keys(getState().langs[code]?.dict || {}).length;
}

// reviews (SRS)
export function recordReview(id, ok) {
  const e = langState().dict[id];
  if (!e) return;
  if (ok) {
    e.box = Math.min(e.box + 1, INTERVALS.length - 1);
    e.correct += 1;
  } else {
    e.box = 1;
    e.wrong += 1;
  }
  e.due = addDays(dayStr(), INTERVALS[e.box]);
  e.u = Date.now();
  touchActivity().reviews += 1;
  save();
}

export function resetProgress(id) {
  const e = langState().dict[id];
  if (!e) return;
  Object.assign(e, { box: 0, due: dayStr(), correct: 0, wrong: 0, u: Date.now() });
  save();
}

export function setMastered(id) {
  const e = langState().dict[id];
  if (!e) return;
  e.box = MASTERED_BOX;
  e.due = addDays(dayStr(), INTERVALS[MASTERED_BOX]);
  e.u = Date.now();
  save();
}

// export / import, per language
export function exportData(code = getState().activeLang) {
  return JSON.stringify(
    {
      app: 'vernacular',
      version: 2,
      lang: code,
      exportedAt: new Date().toISOString(),
      data: langState(code),
    },
    null,
    2
  );
}

// Imports replace the language wholesale: `resetAt` fences off anything older
// (including this account's server copy), and the imported entries are
// restamped at the fence so they survive it.
function restoreLang(code, data) {
  const s = getState();
  const t = Date.now();
  const ls = fillLang({ ...langDefaults(), ...data, goalU: t, resetAt: t, removed: {} });
  ls.dict = { ...ls.dict };
  for (const [id, e] of Object.entries(ls.dict)) ls.dict[id] = { ...e, u: t };
  ls.checkins = ls.checkins.map((c) => ({ ...c, u: t }));
  s.langs[code] = ls;
  save();
}

export function importData(json) {
  const parsed = JSON.parse(json);
  if (parsed?.app !== 'vernacular') throw new Error('Not a Vernacular backup file.');
  if (parsed.version === 2 && parsed.lang && parsed.data) {
    restoreLang(parsed.lang, parsed.data);
    return parsed.lang;
  }
  if (parsed.state?.dict) {
    // legacy v1 backup: Latin
    restoreLang(DEFAULT_LANG, {
      dict: parsed.state.dict,
      unlocked: parsed.state.unlocked || 0,
      goal: parsed.state.goal || 3,
      stats: parsed.state.stats || langDefaults().stats,
    });
    return DEFAULT_LANG;
  }
  throw new Error('Unrecognized backup format.');
}

export function resetLang(code = getState().activeLang) {
  getState().langs[code] = { ...langDefaults(), resetAt: Date.now() };
  save();
}

// ---- account sync bridge (used by src/sync.js) ----

// The store state in the wire shape shared with the server (lib/merge.mjs).
// Reminders and pauses are deliberately absent: they are device-local.
export function syncSnapshot() {
  const s = getState();
  const langs = {};
  for (const [code, raw] of Object.entries(s.langs)) {
    const ls = fillLang(raw);
    langs[code] = {
      goal: ls.goal,
      goalU: ls.goalU,
      unlocked: ls.unlocked || 0,
      resetAt: ls.resetAt,
      stats: ls.stats,
      dict: ls.dict,
      removed: ls.removed,
      checkins: ls.checkins,
    };
  }
  return {
    prefs: { activeLang: s.activeLang, accent: s.accent, showMarks: s.showMarks, u: s.prefsU || 0 },
    langs,
  };
}

// Replaces the synced fields with a merged state from the server, leaving the
// device-local fields (reminders, pausedUntil) of each language untouched.
export function applyMerged(merged) {
  const s = getState();
  const p = merged.prefs || {};
  s.activeLang = p.activeLang ?? s.activeLang;
  s.accent = p.accent ?? s.accent;
  s.showMarks = p.showMarks ?? s.showMarks;
  s.prefsU = p.u || 0;
  const langs = {};
  for (const [code, ml] of Object.entries(merged.langs || {})) {
    const local = s.langs[code] ? fillLang(s.langs[code]) : langDefaults();
    langs[code] = {
      ...local,
      dict: ml.dict || {},
      unlocked: ml.unlocked || 0,
      goal: ml.goal ?? 3,
      goalU: ml.goalU || 0,
      resetAt: ml.resetAt || 0,
      removed: ml.removed || {},
      stats: ml.stats || langDefaults().stats,
      checkins: Array.isArray(ml.checkins) ? ml.checkins : local.checkins,
    };
  }
  // Languages the server doesn't know yet keep their local record.
  for (const [code, ls] of Object.entries(s.langs)) {
    if (!langs[code]) langs[code] = ls;
  }
  s.langs = langs;
  save();
}

// A full local wipe (used when signing out of the device).
export function clearLocalState() {
  state = defaults();
  save();
}
