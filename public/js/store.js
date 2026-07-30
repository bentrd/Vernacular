// Local state: dictionary, spaced repetition, streaks. Everything lives in localStorage.
const KEY = 'vernacular:v1';

// Leitner-style intervals in days, indexed by box. Box 0 = brand new (due today).
const INTERVALS = [0, 1, 2, 4, 7, 15, 30];
export const MASTERED_BOX = 4;

let words = null;
let byId = null;

export async function loadWords() {
  if (words) return words;
  const res = await fetch('/data/words.json');
  words = await res.json();
  byId = new Map(words.map((w) => [w.id, w]));
  return words;
}
export const allWords = () => words;
export const wordById = (id) => byId?.get(id);

// date helpers (local time)
const pad = (n) => String(n).padStart(2, '0');
export function dayStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function addDays(day, n) {
  const [y, m, dd] = day.split('-').map(Number);
  const d = new Date(y, m - 1, dd + n);
  return dayStr(d);
}
export function dayDiff(a, b) {
  // b - a in days
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

// state
function defaults() {
  return {
    unlocked: 0,
    dict: {}, // id -> { addedAt, box, due, correct, wrong }
    goal: 3,
    stats: { streak: 0, lastActive: null, byDay: {} },
  };
}

let state = null;

export function getState() {
  if (!state) {
    try {
      state = { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    } catch {
      state = defaults();
    }
  }
  return state;
}

export function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

function touchActivity() {
  const s = getState();
  const today = dayStr();
  if (s.stats.lastActive !== today) {
    s.stats.streak =
      s.stats.lastActive && dayDiff(s.stats.lastActive, today) === 1 ? s.stats.streak + 1 : 1;
    s.stats.lastActive = today;
  }
  if (!s.stats.byDay[today]) s.stats.byDay[today] = { new: 0, reviews: 0 };
  return s.stats.byDay[today];
}

export function todayCounts() {
  const s = getState();
  return s.stats.byDay[dayStr()] || { new: 0, reviews: 0 };
}

// dictionary
export function addWord(id) {
  const s = getState();
  if (s.dict[id]) return false;
  s.dict[id] = { addedAt: dayStr(), box: 0, due: dayStr(), correct: 0, wrong: 0 };
  touchActivity().new += 1;
  const idx = words ? words.findIndex((w) => w.id === id) : -1;
  if (idx >= 0 && idx + 1 > s.unlocked) s.unlocked = idx + 1;
  save();
  return true;
}

export function nextLockedWord() {
  const s = getState();
  if (!words) return null;
  // first word (in canonical order) not yet in the dictionary
  for (let i = 0; i < words.length; i++) {
    if (!s.dict[words[i].id]) return words[i];
  }
  return null;
}

export function ensureUnlocked(count) {
  // Server has delivered `count` words via push; make sure they're all in the library.
  const s = getState();
  let added = 0;
  for (let i = 0; i < Math.min(count, words?.length || 0); i++) {
    const id = words[i].id;
    if (!s.dict[id]) {
      s.dict[id] = { addedAt: dayStr(), box: 0, due: dayStr(), correct: 0, wrong: 0 };
      added++;
    }
  }
  if (count > s.unlocked) s.unlocked = count;
  if (added) save();
  return added;
}

export function removeWord(id) {
  const s = getState();
  delete s.dict[id];
  save();
}

export function statusOf(entry) {
  if (!entry || entry.box === 0) return 'new';
  return entry.box >= MASTERED_BOX ? 'mastered' : 'learning';
}

export function dictEntries() {
  const s = getState();
  return Object.entries(s.dict)
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

// reviews (SRS)
export function recordReview(id, ok) {
  const s = getState();
  const e = s.dict[id];
  if (!e) return;
  if (ok) {
    e.box = Math.min(e.box + 1, INTERVALS.length - 1);
    e.correct += 1;
  } else {
    e.box = 1;
    e.wrong += 1;
  }
  e.due = addDays(dayStr(), INTERVALS[e.box]);
  touchActivity().reviews += 1;
  save();
}

export function resetProgress(id) {
  const s = getState();
  const e = s.dict[id];
  if (!e) return;
  Object.assign(e, { box: 0, due: dayStr(), correct: 0, wrong: 0 });
  save();
}

export function setMastered(id) {
  const s = getState();
  const e = s.dict[id];
  if (!e) return;
  e.box = MASTERED_BOX;
  e.due = addDays(dayStr(), INTERVALS[MASTERED_BOX]);
  save();
}

export function setGoal(n) {
  getState().goal = n;
  save();
}

// export / import
export function exportData() {
  return JSON.stringify(
    { app: 'vernacular', version: 1, exportedAt: new Date().toISOString(), state: getState() },
    null,
    2
  );
}

export function importData(json) {
  const parsed = JSON.parse(json);
  if (parsed?.app !== 'vernacular' || !parsed.state) throw new Error('Not a Vernacular backup file.');
  state = { ...defaults(), ...parsed.state };
  save();
}

export function resetAll() {
  state = defaults();
  save();
}
