// Account state sync. The client POSTs its full local state; the server merges
// it with what's stored (lib/merge.mjs holds the rules), persists the result,
// and responds with the canonical merged state. First sync after sign-in is
// what migrates a device's localStorage data into the account.
import { db } from '../lib/db.mjs';
import { getUser, unauthorized } from '../lib/authz.mjs';
import { mergeStates, wordCount } from '../lib/merge.mjs';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const clampInt = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.trunc(Number(v) || 0)));
const ms = (v) => clampInt(v, 0, 4102444800000); // sane epoch-ms bound (2100)
const day = (v) => (typeof v === 'string' && DAY_RE.test(v) ? v : null);

// Distrust the wire: keep only well-formed fields, drop anything oversized.
function sanitize(raw) {
  const out = { prefs: {}, langs: {} };
  const p = raw?.prefs || {};
  out.prefs = {
    activeLang: typeof p.activeLang === 'string' ? p.activeLang.slice(0, 16) : null,
    accent: typeof p.accent === 'string' ? p.accent.slice(0, 32) : null,
    showMarks: typeof p.showMarks === 'boolean' ? p.showMarks : null,
    u: ms(p.u),
  };
  const langs = raw?.langs && typeof raw.langs === 'object' ? raw.langs : {};
  for (const [code, l] of Object.entries(langs).slice(0, 50)) {
    if (!/^[a-z-]{2,16}$/.test(code) || !l || typeof l !== 'object') continue;
    const dict = {};
    for (const [id, e] of Object.entries(l.dict || {}).slice(0, 60000)) {
      if (typeof id !== 'string' || id.length > 64 || !e) continue;
      const added = day(e.addedAt);
      const due = day(e.due);
      if (!added || !due) continue;
      dict[id] = {
        addedAt: added,
        box: clampInt(e.box, 0, 6),
        due,
        correct: clampInt(e.correct, 0, 1e6),
        wrong: clampInt(e.wrong, 0, 1e6),
        u: ms(e.u),
      };
    }
    const removed = {};
    for (const [id, at] of Object.entries(l.removed || {}).slice(0, 10000)) {
      if (typeof id !== 'string' || id.length > 64) continue;
      removed[id] = ms(at);
    }
    const byDay = {};
    for (const [d, c] of Object.entries(l.stats?.byDay || {}).slice(0, 800)) {
      if (!day(d)) continue;
      byDay[d] = { new: clampInt(c?.new, 0, 1e5), reviews: clampInt(c?.reviews, 0, 1e5) };
    }
    const checkins = (Array.isArray(l.checkins) ? l.checkins : [])
      .filter((c) => c && day(c.day))
      .slice(-24)
      .map((c) => ({
        day: c.day,
        rating: clampInt(c.rating, 1, 5),
        note: typeof c.note === 'string' ? c.note.slice(0, 240) : '',
        snap: c.snap && typeof c.snap === 'object' ? c.snap : {},
        u: ms(c.u),
      }));
    out.langs[code] = {
      goal: clampInt(l.goal, 1, 50) || 3,
      goalU: ms(l.goalU),
      unlocked: clampInt(l.unlocked, 0, 1e6),
      resetAt: ms(l.resetAt),
      stats: {
        streak: clampInt(l.stats?.streak, 0, 1e5),
        lastActive: day(l.stats?.lastActive),
        byDay,
      },
      dict,
      removed,
      checkins,
    };
  }
  return out;
}

async function loadServerState(sql, userId) {
  const [users, langs, words, tombs] = await Promise.all([
    sql`select * from app_users where id = ${userId}`,
    sql`select * from user_langs where user_id = ${userId}`,
    sql`select * from user_words where user_id = ${userId}`,
    sql`select * from word_tombstones where user_id = ${userId}`,
  ]);
  const u = users[0] || null;
  const state = {
    prefs: u
      ? { activeLang: u.active_lang, accent: u.accent, showMarks: u.show_marks, u: Number(u.prefs_u) }
      : { activeLang: null, accent: null, showMarks: null, u: 0 },
    langs: {},
  };
  const lang = (code) =>
    (state.langs[code] ||= {
      goal: 3, goalU: 0, unlocked: 0, resetAt: 0,
      stats: { streak: 0, lastActive: null, byDay: {} },
      dict: {}, removed: {}, checkins: [],
    });
  for (const r of langs) {
    Object.assign(lang(r.lang), {
      goal: r.goal,
      goalU: Number(r.goal_u),
      unlocked: r.unlocked,
      resetAt: Number(r.reset_at),
      stats: { streak: r.streak, lastActive: r.last_active, byDay: r.by_day || {} },
      checkins: r.checkins || [],
    });
  }
  for (const r of words) {
    lang(r.lang).dict[r.word_id] = {
      addedAt: r.added_at, box: r.box, due: r.due,
      correct: r.correct, wrong: r.wrong, u: Number(r.u),
    };
  }
  for (const r of tombs) lang(r.lang).removed[r.word_id] = Number(r.removed_at);
  return { state, profile: u };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }
  const user = await getUser(req);
  if (!user) return unauthorized(res);

  try {
    const sql = db();
    const clientState = sanitize(req.body?.state);
    const { state: serverState, profile } = await loadServerState(sql, user.id);

    const serverHadWords = wordCount(serverState) > 0;
    const merged = mergeStates(serverState, clientState);

    // ---- diff the merged state against what's stored ----
    const p = merged.prefs;
    const profileChanged =
      !profile ||
      (p.u > 0 &&
        (profile.active_lang !== (p.activeLang ?? profile.active_lang) ||
          profile.accent !== (p.accent ?? profile.accent) ||
          profile.show_marks !== (p.showMarks ?? profile.show_marks) ||
          Number(profile.prefs_u) !== p.u));

    const langUpserts = [];
    const wordUpserts = [];
    const wordDeletes = [];
    const tombUpserts = [];
    const tombDeletes = [];

    for (const [code, ml] of Object.entries(merged.langs)) {
      const sl = serverState.langs[code];
      const langMetaChanged =
        !sl ||
        sl.goal !== ml.goal ||
        sl.goalU !== ml.goalU ||
        sl.unlocked !== ml.unlocked ||
        sl.resetAt !== ml.resetAt ||
        sl.stats.streak !== ml.stats.streak ||
        sl.stats.lastActive !== ml.stats.lastActive ||
        JSON.stringify(sl.stats.byDay) !== JSON.stringify(ml.stats.byDay) ||
        JSON.stringify(sl.checkins || []) !== JSON.stringify(ml.checkins || []);
      if (langMetaChanged) {
        langUpserts.push({
          lang: code, goal: ml.goal, goal_u: ml.goalU, unlocked: ml.unlocked,
          reset_at: ml.resetAt, streak: ml.stats.streak,
          last_active: ml.stats.lastActive, by_day: ml.stats.byDay,
          checkins: ml.checkins || [],
        });
      }
      for (const [id, e] of Object.entries(ml.dict)) {
        const se = sl?.dict?.[id];
        if (!se || se.u !== e.u || se.box !== e.box || se.due !== e.due) {
          wordUpserts.push({
            lang: code, word_id: id, added_at: e.addedAt, box: e.box,
            due: e.due, correct: e.correct, wrong: e.wrong, u: e.u,
          });
        }
      }
      for (const id of Object.keys(sl?.dict || {})) {
        if (!ml.dict[id]) wordDeletes.push({ lang: code, word_id: id });
      }
      for (const [id, at] of Object.entries(ml.removed)) {
        if (sl?.removed?.[id] !== at) tombUpserts.push({ lang: code, word_id: id, removed_at: at });
      }
      for (const id of Object.keys(sl?.removed || {})) {
        if (!ml.removed[id]) tombDeletes.push({ lang: code, word_id: id });
      }
    }

    const incomingWords = wordCount(clientState) > 0;
    const migratedNow = !serverHadWords && incomingWords && !profile?.migrated_local_at;

    const stmts = [];
    if (!profile || profileChanged || migratedNow || !profile?.email) {
      stmts.push(sql`
        insert into app_users (id, email, display_name, native_lang, accent, show_marks, active_lang, prefs_u, migrated_local_at, updated_at)
        values (${user.id}, ${user.email}, ${profile?.display_name || user.name || ''}, ${profile?.native_lang || ''},
                ${p.accent ?? 'lilac'}, ${p.showMarks ?? true}, ${p.activeLang ?? 'la'}, ${p.u},
                ${migratedNow ? new Date() : profile?.migrated_local_at || null}, now())
        on conflict (id) do update set
          email = excluded.email,
          accent = excluded.accent,
          show_marks = excluded.show_marks,
          active_lang = excluded.active_lang,
          prefs_u = excluded.prefs_u,
          migrated_local_at = coalesce(app_users.migrated_local_at, excluded.migrated_local_at),
          updated_at = now()`);
    }
    if (langUpserts.length) {
      stmts.push(sql`
        insert into user_langs (user_id, lang, goal, goal_u, unlocked, reset_at, streak, last_active, by_day, checkins, updated_at)
        select ${user.id}, x.lang, x.goal, x.goal_u, x.unlocked, x.reset_at, x.streak, x.last_active, x.by_day, x.checkins, now()
        from jsonb_to_recordset(${JSON.stringify(langUpserts)}::jsonb)
          as x(lang text, goal int, goal_u bigint, unlocked int, reset_at bigint, streak int, last_active text, by_day jsonb, checkins jsonb)
        on conflict (user_id, lang) do update set
          goal = excluded.goal, goal_u = excluded.goal_u, unlocked = excluded.unlocked,
          reset_at = excluded.reset_at, streak = excluded.streak,
          last_active = excluded.last_active, by_day = excluded.by_day,
          checkins = excluded.checkins, updated_at = now()`);
    }
    if (wordUpserts.length) {
      stmts.push(sql`
        insert into user_words (user_id, lang, word_id, added_at, box, due, correct, wrong, u)
        select ${user.id}, x.lang, x.word_id, x.added_at, x.box, x.due, x.correct, x.wrong, x.u
        from jsonb_to_recordset(${JSON.stringify(wordUpserts)}::jsonb)
          as x(lang text, word_id text, added_at text, box int, due text, correct int, wrong int, u bigint)
        on conflict (user_id, lang, word_id) do update set
          added_at = excluded.added_at, box = excluded.box, due = excluded.due,
          correct = excluded.correct, wrong = excluded.wrong, u = excluded.u`);
    }
    if (wordDeletes.length) {
      stmts.push(sql`
        delete from user_words using jsonb_to_recordset(${JSON.stringify(wordDeletes)}::jsonb)
          as x(lang text, word_id text)
        where user_words.user_id = ${user.id}
          and user_words.lang = x.lang and user_words.word_id = x.word_id`);
    }
    if (tombUpserts.length) {
      stmts.push(sql`
        insert into word_tombstones (user_id, lang, word_id, removed_at)
        select ${user.id}, x.lang, x.word_id, x.removed_at
        from jsonb_to_recordset(${JSON.stringify(tombUpserts)}::jsonb)
          as x(lang text, word_id text, removed_at bigint)
        on conflict (user_id, lang, word_id) do update set removed_at = excluded.removed_at`);
    }
    if (tombDeletes.length) {
      stmts.push(sql`
        delete from word_tombstones using jsonb_to_recordset(${JSON.stringify(tombDeletes)}::jsonb)
          as x(lang text, word_id text)
        where word_tombstones.user_id = ${user.id}
          and word_tombstones.lang = x.lang and word_tombstones.word_id = x.word_id`);
    }
    if (stmts.length) await sql.transaction(() => stmts);

    return res.json({
      state: merged,
      migrated: migratedNow,
      profile: {
        email: user.email || profile?.email || '',
        displayName: profile?.display_name || user.name || '',
        nativeLang: profile?.native_lang || '',
        onboardedAt: profile?.onboarded_at || null,
        tosAcceptedAt: profile?.tos_accepted_at || null,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal error' });
  }
}
