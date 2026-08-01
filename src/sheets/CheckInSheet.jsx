import { useEffect, useState } from 'react';
import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import * as db from '../store.js';
import * as push from '../push.js';
import { useStore } from '../useStore.js';
import { Sheet } from '../ui/Sheet.jsx';
import { toast } from '../ui/toast.js';

// Confidence over the last few check-ins. Small enough to read at a glance,
// which is the whole point: you are looking for the shape, not the numbers.
function Trend({ entries }) {
  if (entries.length < 2) return null;
  const points = entries.slice(-8);
  const w = 320;
  const h = 44;
  const step = points.length > 1 ? w / (points.length - 1) : 0;
  const y = (r) => h - ((r - 1) / 4) * h;
  const coords = points.map((c, i) => [i * step, y(c.rating)]);
  const path = coords.map(([x, yy], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${yy.toFixed(1)}`).join(' ');
  const first = points[0];
  const last = points[points.length - 1];
  const drift = last.rating - first.rating;

  return (
    <div className="trend">
      <div className="section-label">How you have felt</div>
      <svg className="trend-svg" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        <path className="trend-line" d={path} vectorEffect="non-scaling-stroke" />
        {coords.map(([x, yy], i) => (
          <circle key={i} className="trend-dot" cx={x} cy={yy} r={i === coords.length - 1 ? 4 : 2.5} />
        ))}
      </svg>
      <div className="trend-caption">
        {drift > 0
          ? `Up ${drift} step${drift === 1 ? '' : 's'} across your last ${points.length} check-ins.`
          : drift < 0
            ? `Down ${-drift} step${drift === -1 ? '' : 's'} across your last ${points.length} check-ins.`
            : `Steady across your last ${points.length} check-ins.`}
      </div>
    </div>
  );
}

export function CheckInSheet({ open, onOpenChange, onStartReview }) {
  useStore();
  const code = db.getState().activeLang;
  const pack = db.activePack();
  const snap = db.weekSnapshot(code);
  const history = db.checkIns(code);
  const last = db.lastCheckIn(code);
  const [rating, setRating] = useState(null);
  const [note, setNote] = useState('');

  // A fresh sheet every time it opens.
  useEffect(() => {
    if (open) {
      setRating(null);
      setNote('');
    }
  }, [open]);

  const daysSince = last ? db.dayDiff(last.day, db.dayStr()) : null;
  const lastLabel = last ? db.RATINGS.find((r) => r.value === last.rating)?.label : null;

  function save() {
    db.recordCheckIn(code, rating, note);
    // The streak may have moved, and streak reminders read it off the server.
    push.saveSchedule(code);
    onOpenChange(false);
    toast('Check-in saved');
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Check in"
      description={`An honest read on your ${pack?.name || ''} week. It stays on this device.`}
    >
      <div className="stat-grid">
        <div className="stat">
          <div className="n">{snap.new}</div>
          <div className="l">New this week</div>
        </div>
        <div className="stat">
          <div className="n">{snap.reviews}</div>
          <div className="l">Reviews</div>
        </div>
        <div className="stat">
          <div className="n">{snap.activeDays}/7</div>
          <div className="l">Days shown up</div>
        </div>
      </div>
      <div className="stat-grid">
        <div className="stat">
          <div className="n">{snap.total}</div>
          <div className="l">In library</div>
        </div>
        <div className="stat">
          <div className="n">{snap.mastered}</div>
          <div className="l">Mastered</div>
        </div>
        <div className="stat">
          <div className="n">{snap.accuracy == null ? '-' : `${snap.accuracy}%`}</div>
          <div className="l">Answers right</div>
        </div>
      </div>

      {last ? (
        <p className="checkin-note">
          {daysSince === 0
            ? `Earlier today you said “${lastLabel}”. Saving again replaces it.`
            : `${daysSince} day${daysSince === 1 ? '' : 's'} ago you said “${lastLabel}”.`}
          {last.note ? ` “${last.note}”` : ''}
        </p>
      ) : null}

      <div className="section-label">How does it feel right now?</div>
      <RadioGroup
        className="checkin-scale"
        value={rating}
        onValueChange={setRating}
        aria-label="Confidence"
      >
        {db.RATINGS.map((r) => (
          <Radio.Root
            key={r.value}
            value={r.value}
            className="rating-row"
            render={<button type="button" />}
            nativeButton
          >
            <span className="r-face">{r.value}</span>
            <span className="r-text">
              <span className="r-title">{r.label}</span>
              <span className="r-sub">{r.blurb}</span>
            </span>
          </Radio.Root>
        ))}
      </RadioGroup>

      <div className="field">
        <label className="field-label" htmlFor="checkin-note">
          What is tripping you up?
        </label>
        <input
          id="checkin-note"
          className="field-input"
          value={note}
          maxLength={240}
          placeholder="Optional. Verb endings, plurals, nothing at all…"
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <Trend entries={history} />

      <div className="btn-row">
        <button type="button" className="btn quiet" onClick={() => onOpenChange(false)}>
          Not now
        </button>
        <button type="button" className="btn accent" disabled={!rating} onClick={save}>
          Save check-in
        </button>
      </div>

      {snap.due > 0 ? (
        <div className="sheet-links">
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              if (rating) db.recordCheckIn(code, rating, note);
              onOpenChange(false);
              onStartReview?.();
            }}
          >
            {rating ? 'Save and review' : 'Review'} {snap.due} due word{snap.due === 1 ? '' : 's'}
          </button>
        </div>
      ) : null}
    </Sheet>
  );
}
