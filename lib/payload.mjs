// Turns one due reminder into a push payload.
//
// Everything a reminder needs to know about the subscriber lives in the
// language record the app syncs: how many words have been delivered, when they
// were last active, where they are against today's goal. Reminders that have
// nothing to say (a goal already met, a streak already kept) return null and
// are quietly skipped, which is what makes "only if the day is empty" work.

const str = (pack, key, fallback) => pack?.strings?.[key] || fallback;

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// The word tier the subscriber has reached: pushed words plus anything they
// unlocked by hand in the app.
function poolSize(ls, pack) {
  const delivered = Math.max(Number(ls?.index) || 0, Number(ls?.stats?.unlocked) || 0);
  return Math.min(delivered, pack.words.length);
}

/**
 * @returns {{ payload: object, advance: number } | null}
 *   `advance` is how many words to move the delivery index on by, once the
 *   push actually goes out.
 */
export function buildPayload({ pack, code, reminder, ls = {}, today }) {
  const stats = ls.stats || {};
  const custom = reminder.text || '';
  const activeToday = !!today && stats.lastActive === today;
  const freshStats = !today || stats.day === today;
  const doneToday = freshStats ? Number(stats.newToday) || 0 : 0;
  const goal = Math.max(1, Number(stats.goal) || 3);

  if (reminder.onlyIfIdle && activeToday) return null;

  switch (reminder.type) {
    case 'word': {
      const start = Number(ls.index) || 0;
      if (start >= pack.words.length) return null;
      const picked = pack.words.slice(start, start + (reminder.count || 1));
      if (!picked.length) return null;

      if (picked.length === 1) {
        const w = picked[0];
        return {
          advance: 1,
          payload: {
            title: `${w.hw} · ${str(pack, 'newWord', 'new word')}`,
            body:
              custom ||
              [w.g, [w.rom, w.en, w.fr].filter(Boolean).join(' · ')].filter(Boolean).join('\n'),
            url: `/?lang=${code}&word=${w.id}`,
            tag: `word-${code}-${w.id}`,
          },
        };
      }
      return {
        advance: picked.length,
        payload: {
          title: `${picked.length} ${str(pack, 'newWords', 'new words')}`,
          body:
            custom ||
            picked.map((w) => `${w.hw} · ${w.en || w.fr || ''}`.trim()).join('\n'),
          url: `/?lang=${code}`,
          tag: `word-${code}-${start}`,
        },
      };
    }

    case 'review': {
      const pool = poolSize(ls, pack);
      if (pool < 3) return null;
      const w = pack.words[Math.floor(Math.random() * pool)];
      return {
        advance: 0,
        payload: {
          title: str(pack, 'whatMeans', 'What does “%s” mean?').replace('%s', w.hw),
          body: custom || str(pack, 'reviewBody', 'Tap to test yourself.'),
          url: `/?lang=${code}&review=1`,
          tag: `review-${code}`,
        },
      };
    }

    case 'assess': {
      return {
        advance: 0,
        payload: {
          title: str(pack, 'checkIn', 'How is it going?'),
          body: custom || 'Rate your confidence and see how your week went.',
          url: `/?lang=${code}&assess=1`,
          tag: `assess-${code}`,
        },
      };
    }

    case 'streak': {
      if (activeToday) return null;
      const n = Number(stats.streak) || 0;
      return {
        advance: 0,
        payload: {
          title: str(pack, 'streakTitle', 'Your streak'),
          body:
            custom ||
            (n > 0
              ? `${plural(n, 'day', 'days')} so far. A minute keeps it alive.`
              : 'Nothing yet today. One word is enough to start.'),
          url: `/?lang=${code}`,
          tag: `streak-${code}`,
        },
      };
    }

    case 'goal': {
      if (doneToday >= goal) return null;
      const left = goal - doneToday;
      return {
        advance: 0,
        payload: {
          title: str(pack, 'goalTitle', 'Today’s goal'),
          body:
            custom ||
            `${doneToday} of ${goal} new words so far. ${plural(left, 'word', 'words')} to go.`,
          url: `/?lang=${code}`,
          tag: `goal-${code}`,
        },
      };
    }

    default:
      return null;
  }
}
