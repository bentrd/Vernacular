// Shared merge logic for account sync. Runs on the server (api/sync.js) and on
// the client (src/sync.js), so both sides converge on the same state no matter
// which direction the data flows.
//
// Sync state shape (a subset of the localStorage store, plus sync metadata):
// {
//   prefs: { activeLang, accent, showMarks, u },        // u = ms of last change
//   langs: {
//     <code>: {
//       goal, goalU, unlocked, resetAt,
//       stats: { streak, lastActive, byDay: { day: { new, reviews } } },
//       dict: { <wordId>: { addedAt, box, due, correct, wrong, u } },
//       removed: { <wordId>: <removedAtMs> },           // tombstones
//     }
//   }
// }
//
// Rules: per-word last-write-wins on `u`; tombstones beat entries stamped
// before the removal; `resetAt` is a language-wide tombstone; day stats merge
// by max per counter; unlocked merges by max; goal and prefs are LWW.

const TOMBSTONE_TTL_MS = 90 * 24 * 3600 * 1000;

export function emptySyncState() {
  return { prefs: { activeLang: null, accent: null, showMarks: null, u: 0 }, langs: {} };
}

function mergePrefs(a, b) {
  const pa = a || {};
  const pb = b || {};
  const winner = (pb.u || 0) > (pa.u || 0) ? pb : pa;
  return {
    activeLang: winner.activeLang ?? pa.activeLang ?? pb.activeLang ?? null,
    accent: winner.accent ?? pa.accent ?? pb.accent ?? null,
    showMarks: winner.showMarks ?? pa.showMarks ?? pb.showMarks ?? null,
    u: Math.max(pa.u || 0, pb.u || 0),
  };
}

function mergeByDay(a = {}, b = {}) {
  const out = {};
  for (const day of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const da = a[day] || {};
    const db = b[day] || {};
    out[day] = {
      new: Math.max(da.new || 0, db.new || 0),
      reviews: Math.max(da.reviews || 0, db.reviews || 0),
    };
  }
  return out;
}

function mergeStats(a, b) {
  const sa = a || { streak: 0, lastActive: null, byDay: {} };
  const sb = b || { streak: 0, lastActive: null, byDay: {} };
  let streak, lastActive;
  if (!sa.lastActive && !sb.lastActive) {
    streak = 0;
    lastActive = null;
  } else if (!sb.lastActive || (sa.lastActive && sa.lastActive > sb.lastActive)) {
    ({ streak, lastActive } = sa);
  } else if (!sa.lastActive || sb.lastActive > sa.lastActive) {
    ({ streak, lastActive } = sb);
  } else {
    // same day on both sides: keep the longer streak
    streak = Math.max(sa.streak || 0, sb.streak || 0);
    lastActive = sa.lastActive;
  }
  return { streak: streak || 0, lastActive, byDay: mergeByDay(sa.byDay, sb.byDay) };
}

const MAX_CHECKINS = 24;

// One check-in per day; the freshest write for a day wins across devices.
function mergeCheckins(a = [], b = [], resetAt) {
  const byDay = new Map();
  for (const c of [...a, ...b]) {
    if (!c?.day) continue;
    if ((c.u || 0) < resetAt) continue;
    const prev = byDay.get(c.day);
    if (!prev || (c.u || 0) > (prev.u || 0)) byDay.set(c.day, c);
  }
  return [...byDay.values()].sort((x, y) => (x.day < y.day ? -1 : 1)).slice(-MAX_CHECKINS);
}

function mergeLang(a, b, now) {
  const la = a || {};
  const lb = b || {};
  const resetAt = Math.max(la.resetAt || 0, lb.resetAt || 0);

  // tombstones: union by latest removal, drop expired ones
  const removed = {};
  for (const [id, at] of [
    ...Object.entries(la.removed || {}),
    ...Object.entries(lb.removed || {}),
  ]) {
    if (now - at > TOMBSTONE_TTL_MS) continue;
    if (!removed[id] || at > removed[id]) removed[id] = at;
  }

  const dict = {};
  for (const id of new Set([...Object.keys(la.dict || {}), ...Object.keys(lb.dict || {})])) {
    const ea = la.dict?.[id];
    const eb = lb.dict?.[id];
    const e = !ea ? eb : !eb ? ea : (eb.u || 0) > (ea.u || 0) ? eb : ea;
    if (!e) continue;
    if ((e.u || 0) < resetAt) continue; // erased by a language reset
    if (removed[id] && removed[id] >= (e.u || 0)) continue; // deleted
    dict[id] = e;
    // a re-add newer than the tombstone supersedes it
    if (removed[id] && removed[id] < (e.u || 0)) delete removed[id];
  }

  const goal = (lb.goalU || 0) > (la.goalU || 0) ? lb.goal : (la.goal ?? lb.goal);
  return {
    goal: goal ?? 3,
    goalU: Math.max(la.goalU || 0, lb.goalU || 0),
    unlocked: Math.max(la.unlocked || 0, lb.unlocked || 0),
    resetAt,
    stats: mergeStats(la.stats, lb.stats),
    dict,
    removed,
    checkins: mergeCheckins(la.checkins, lb.checkins, resetAt),
  };
}

export function mergeStates(a, b, now = Date.now()) {
  const out = { prefs: mergePrefs(a?.prefs, b?.prefs), langs: {} };
  for (const code of new Set([
    ...Object.keys(a?.langs || {}),
    ...Object.keys(b?.langs || {}),
  ])) {
    out.langs[code] = mergeLang(a?.langs?.[code], b?.langs?.[code], now);
  }
  return out;
}

// How many dictionary entries a state carries, across languages.
export function wordCount(state) {
  let n = 0;
  for (const l of Object.values(state?.langs || {})) n += Object.keys(l.dict || {}).length;
  return n;
}
