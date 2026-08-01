import * as db from '../store.js';
import { useStore } from '../useStore.js';
import { S } from '../lang.js';
import {
  CardsIcon,
  ChevronIcon,
  KeyboardIcon,
  ListIcon,
  SparklesIcon,
  TrophyIcon,
} from '../icons.jsx';
import { toast } from '../ui/toast.js';

const MODES = [
  { mode: 'flash', Icon: CardsIcon, title: 'Flashcards', sub: 'Flip through, grade yourself' },
  { mode: 'choice', Icon: ListIcon, title: 'Multiple choice', sub: 'Both directions, four options' },
  { mode: 'type', Icon: KeyboardIcon, title: 'Type the word', sub: 'The hardest: spell it out' },
];

export function Practice({ onStart, onOpenCheckIn }) {
  useStore();
  const c = db.counts();
  const enough = c.total >= 4;
  const last = db.lastCheckIn();
  const since = last ? db.dayDiff(last.day, db.dayStr()) : null;

  return (
    <>
      <div className="eyebrow">{S('practiceEyebrow')}</div>
      <h1 className="title">Practice</h1>
      <p className="subtitle">
        {c.due > 0
          ? `${c.due} word${c.due === 1 ? '' : 's'} due for review.`
          : 'Nothing due. Free practice below.'}
      </p>

      {c.due > 0 ? (
        <button
          type="button"
          className="banner"
          onClick={() => onStart('choice', { dueOnly: true })}
        >
          <span className="b-icon">
            <SparklesIcon />
          </span>
          <span className="b-text">
            <span className="b-title">Daily review</span>
            <span className="b-sub">{c.due} due · multiple choice</span>
          </span>
        </button>
      ) : null}

      <div className="section-label">Modes</div>
      {MODES.map(({ mode, Icon, title, sub }) => (
        <button
          key={mode}
          type="button"
          className="card tappable mode-card"
          onClick={() => {
            if (!enough) {
              toast('Learn a few more words first');
              return;
            }
            onStart(mode);
          }}
        >
          <span className="m-icon">
            <Icon />
          </span>
          <span className="m-text">
            <span className="m-title">{title}</span>
            <span className="m-sub">{sub}</span>
          </span>
          <span className="m-chev">
            <ChevronIcon />
          </span>
        </button>
      ))}

      <div className="section-label">Yourself</div>
      <button type="button" className="card tappable mode-card" onClick={onOpenCheckIn}>
        <span className="m-icon">
          <TrophyIcon />
        </span>
        <span className="m-text">
          <span className="m-title">Check in</span>
          <span className="m-sub">
            {since == null
              ? 'Rate your confidence, see the week behind you'
              : since === 0
                ? 'Done today. Open it again to change your answer'
                : `Last one ${since} day${since === 1 ? '' : 's'} ago`}
          </span>
        </span>
        <span className="m-chev">
          <ChevronIcon />
        </span>
      </button>

      {!enough ? (
        <p className="subtitle spaced">Collect at least 4 words to start practicing.</p>
      ) : null}
    </>
  );
}
