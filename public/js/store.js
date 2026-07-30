// Local state, one namespace per language. Packs are fetched on demand.
// localStorage 'vernacular:v2' = {
//   activeLang, accent, showMarks,
//   langs: { <code>: { dict, unlocked, goal, stats } }
// }
const KEY = 'vernacular:v2';
const LEGACY_KEY = 'vernacular:v1';

// Leitner-style intervals in days, indexed by box. Box 0 = brand new (due today).
const INTERVALS = [0, 1, 2, 4, 7, 15, 30];
export const MASTERED_BOX = 4;
export const DEFAULT_LANG = 'la';

// packs
const packCache = new Map();
let pack = null; // active pack {code, name, native, marks, strings, words}
let byId = null;
let index = null; // [{code, name, native, count, marks}]

export async function loadIndex() {
  if (index) return index;
  const res = await fetch('/data/packs/index.json');
  index = await res.json();
  return index;
}

export async function loadPack(code) {
  if (packCache.has(code)) return packCache.get(code);
  const res = await fetch(`/data/packs/${code}.json`);
  if (!res.ok) throw new Error(`pack ${code} not found`);
  const p = await res.json();
  p.byId = new Map(p.words.map((w) => [w.id, w]));
  packCache.set(code, p);
  return p;
}

export async function activatePack(code) {
  pack = await loadPack(code);
  byId = pack.byId;
  const s = getState();
  if (s.activeLang !== code) {
    s.activeLang = code;
    save();
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
    dict: {}, // id -> { addedAt, box, due, correct, wrong }
    unlocked: 0,
    goal: 3,
    stats: { streak: 0, lastActive: null, byDay: {} },
  };
}

function defaults() {
  return { activeLang: DEFAULT_LANG, accent: 'lilac', showMarks: true, langs: {} };
}

let state = null;

function migrateLegacy() {
  try {
    const old = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
    if (!old || !old.dict) return null;
    const s = defaults();
    s.langs[DEFAULT_LANG] = {
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
  return s.langs[code];
}

export function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function setAccent(name) {
  getState().accent = name;
  save();
}
export function setShowMarks(v) {
  getState().showMarks = !!v;
  save();
}
export function setGoal(n) {
  langState().goal = n;
  save();
}

function touchActivity() {
  const ls = langState();
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
  ls.dict[id] = { addedAt: dayStr(), box: 0, due: dayStr(), correct: 0, wrong: 0 };
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
    if (!ls.dict[id]) {
      ls.dict[id] = { addedAt: dayStr(), box: 0, due: dayStr(), correct: 0, wrong: 0 };
      added++;
    }
  }
  if (count > ls.unlocked) ls.unlocked = count;
  if (added) save();
  return added;
}

export function removeWord(id) {
  delete langState().dict[id];
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
  touchActivity().reviews += 1;
  save();
}

export function resetProgress(id) {
  const e = langState().dict[id];
  if (!e) return;
  Object.assign(e, { box: 0, due: dayStr(), correct: 0, wrong: 0 });
  save();
}

export function setMastered(id) {
  const e = langState().dict[id];
  if (!e) return;
  e.box = MASTERED_BOX;
  e.due = addDays(dayStr(), INTERVALS[MASTERED_BOX]);
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

export function importData(json) {
  const parsed = JSON.parse(json);
  if (parsed?.app !== 'vernacular') throw new Error('Not a Vernacular backup file.');
  const s = getState();
  if (parsed.version === 2 && parsed.lang && parsed.data) {
    s.langs[parsed.lang] = { ...langDefaults(), ...parsed.data };
    save();
    return parsed.lang;
  }
  if (parsed.state?.dict) {
    // legacy v1 backup: Latin
    s.langs[DEFAULT_LANG] = {
      dict: parsed.state.dict,
      unlocked: parsed.state.unlocked || 0,
      goal: parsed.state.goal || 3,
      stats: parsed.state.stats || langDefaults().stats,
    };
    save();
    return DEFAULT_LANG;
  }
  throw new Error('Unrecognized backup format.');
}

export function resetLang(code = getState().activeLang) {
  getState().langs[code] = langDefaults();
  save();
}
