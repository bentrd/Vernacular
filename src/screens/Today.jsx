import { useState } from 'react';
import * as db from '../store.js';
import * as push from '../push.js';
import { useStore } from '../useStore.js';
import { D, S } from '../lang.js';
import { WordCard } from '../components/WordCard.jsx';
import { ProgressBar } from '../ui/Progress.jsx';
import { toast } from '../ui/toast.js';
import { GlobeIcon, LandmarkIcon, PhoneIcon, SparklesIcon, TrophyIcon } from '../icons.jsx';

function LearnSlot({ skipped, onSkip }) {
  const [revealed, setRevealed] = useState(false);
  const ls = db.langState();

  let next = null;
  for (const w of db.allWords()) {
    if (!ls.dict[w.id] && !skipped.has(w.id)) {
      next = w;
      break;
    }
  }
  if (!next) next = db.nextLockedWord();

  if (!next) {
    return (
      <div className="card empty">
        <div className="e-icon">
          <LandmarkIcon />
        </div>
        <div className="e-title">{S('allDone')}</div>
        <div className="e-sub">You've collected every word in this pack.</div>
      </div>
    );
  }

  const skip = () => {
    setRevealed(false);
    onSkip(next.id);
  };

  return (
    <>
      <WordCard
        key={next.id}
        word={next}
        veiled={!revealed}
        onClick={revealed ? undefined : () => setRevealed(true)}
      />
      <div className="btn-row">
        <button type="button" className="btn quiet" onClick={skip}>
          {revealed ? 'Not now' : 'Skip'}
        </button>
        {revealed ? (
          <button
            type="button"
            className="btn accent"
            onClick={() => {
              db.addWord(next.id);
              setRevealed(false);
              toast(`“${D(next.hw)}” added to your library`);
            }}
          >
            Add to library
          </button>
        ) : (
          <button type="button" className="btn accent" onClick={() => setRevealed(true)}>
            Reveal
          </button>
        )}
      </div>
    </>
  );
}

export function Today({
  onOpenLanguages,
  onOpenInstall,
  onOpenCheckIn,
  onStartDueReview,
  skipped,
  onSkip,
}) {
  useStore();
  const ls = db.langState();
  const t = db.todayCounts();
  const c = db.counts();
  const pack = db.activePack();
  const dateLine = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const goalPct = Math.min(100, Math.round((t.new / ls.goal) * 100));
  const needsInstall = push.isIOS() && !push.isStandalone();

  return (
    <>
      <div className="today-head">
        <div>
          <div className="eyebrow">{dateLine}</div>
          <h1 className="title">{S('greeting')}</h1>
        </div>
        <div className="head-pills">
          <button type="button" className="streak-pill lang-pill" onClick={onOpenLanguages}>
            <GlobeIcon />
            <span>{pack?.native || ''}</span>
          </button>
          <div className="streak-pill">
            <span className="dot">●</span> {ls.stats.streak || 0}&nbsp;day
            {ls.stats.streak === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      <div className="progress-wrap">
        <div className="progress-row">
          <span className="label">Today’s goal</span>
          <span className="value">
            {t.new} of {ls.goal} new words
          </span>
        </div>
        <ProgressBar value={goalPct} label="Today’s goal" />
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="n">{c.total}</div>
          <div className="l">In library</div>
        </div>
        <div className="stat">
          <div className="n">{c.mastered}</div>
          <div className="l">Mastered</div>
        </div>
        <div className="stat">
          <div className="n">{c.due}</div>
          <div className="l">Due today</div>
        </div>
      </div>

      {needsInstall ? (
        <button type="button" className="banner" onClick={onOpenInstall}>
          <span className="b-icon">
            <PhoneIcon />
          </span>
          <span className="b-text">
            <span className="b-title">Add Vernacular to your Home Screen</span>
            <span className="b-sub">Required for push notifications on iPhone</span>
          </span>
        </button>
      ) : null}

      {c.due > 0 ? (
        <button type="button" className="banner" onClick={onStartDueReview}>
          <span className="b-icon">
            <SparklesIcon />
          </span>
          <span className="b-text">
            <span className="b-title">
              {c.due} word{c.due === 1 ? '' : 's'} due for review
            </span>
            <span className="b-sub">A quick quiz keeps them in memory</span>
          </span>
        </button>
      ) : null}

      {db.checkInDue() ? (
        <button type="button" className="banner" onClick={onOpenCheckIn}>
          <span className="b-icon">
            <TrophyIcon />
          </span>
          <span className="b-text">
            <span className="b-title">Time to check in</span>
            <span className="b-sub">Rate how {pack?.name || 'it'} is going and see your week</span>
          </span>
        </button>
      ) : null}

      <div className="section-label">{t.new < ls.goal ? 'Next word' : 'Keep going'}</div>
      <LearnSlot skipped={skipped} onSkip={onSkip} />
    </>
  );
}
