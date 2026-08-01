import { useEffect, useState } from 'react';
import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { Toggle as BaseToggle } from '@base-ui/react/toggle';
import * as push from '../push.js';
import {
  DAY_INITIALS,
  DAY_NAMES,
  EVERY_DAY,
  MAX_TEXT,
  TYPES,
  TYPE_META,
  WEEKDAYS,
  WEEKENDS,
  clampTime,
} from '../../lib/reminders.mjs';
import { Sheet } from '../ui/Sheet.jsx';
import { Group, StaticRow } from '../ui/Row.jsx';
import { Toggle } from '../ui/Toggle.jsx';
import { Stepper } from '../ui/Stepper.jsx';
import { toast } from '../ui/toast.js';
import { CheckIcon } from '../icons.jsx';

const BLANK = {
  type: 'word',
  time: '09:00',
  days: [...EVERY_DAY],
  count: 1,
  onlyIfIdle: false,
  enabled: true,
  text: '',
};

// Monday first: how a week reads on a calendar.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const PLACEHOLDER = {
  word: 'The word, its gloss, and the translations',
  review: 'Tap to test yourself.',
  assess: 'Rate your confidence and see how your week went.',
  streak: 'A minute keeps it alive.',
  goal: 'How far off today’s goal you are',
};

// Streak and goal reminders already stay quiet on days you have shown up,
// so the switch would be saying the same thing twice.
const CAN_SKIP = new Set(['word', 'review', 'assess']);

export function ReminderSheet({ reminder, lang, onOpenChange, onSave, onDelete }) {
  const [draft, setDraft] = useState(BLANK);
  const [previewing, setPreviewing] = useState(false);
  const open = !!reminder;

  // Load a copy on open, and keep it through the closing animation.
  useEffect(() => {
    if (reminder) setDraft({ ...BLANK, ...reminder });
  }, [reminder]);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const isNew = !draft.id;

  async function preview() {
    setPreviewing(true);
    try {
      const res = await push.previewReminder(lang, draft);
      toast(res?.quiet ? 'Sent. This one would stay quiet right now' : 'Preview sent');
    } catch {
      toast('Turn reminders on for this language first');
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={isNew ? 'New reminder' : 'Edit reminder'}
      className="reminder-sheet"
    >
      <div className="section-label">What arrives</div>
      <RadioGroup
        className="setting-group"
        value={draft.type}
        onValueChange={(v) => set({ type: v, onlyIfIdle: CAN_SKIP.has(v) ? draft.onlyIfIdle : false })}
        aria-label="Reminder type"
      >
        {TYPES.map((t) => (
          // A real <button>, like every other row in the app: on iOS Safari a
          // bare element with a listener is not a reliable tap target.
          <Radio.Root
            key={t}
            value={t}
            className="setting-row pick-row"
            render={<button type="button" />}
            nativeButton
          >
            <span className="s-main">
              <span className="s-title">{TYPE_META[t].label}</span>
              <span className="s-sub">{TYPE_META[t].blurb}</span>
            </span>
            <Radio.Indicator className="pick-check">
              <CheckIcon />
            </Radio.Indicator>
          </Radio.Root>
        ))}
      </RadioGroup>

      <div className="section-label">When</div>
      <Group>
        <StaticRow title="Time">
          <input
            type="time"
            className="time-input"
            value={clampTime(draft.time)}
            onChange={(e) => set({ time: clampTime(e.target.value, draft.time) })}
            aria-label="Time"
          />
        </StaticRow>
        <div className="setting-row days-row">
          <ToggleGroup
            className="chips days"
            value={draft.days.map(String)}
            onValueChange={(v) => set({ days: v.map(Number) })}
            aria-label="Days"
          >
            {DAY_ORDER.map((d) => (
              <BaseToggle key={d} value={String(d)} className="chip day-chip" aria-label={DAY_NAMES[d]}>
                {DAY_INITIALS[d]}
              </BaseToggle>
            ))}
          </ToggleGroup>
        </div>
        <div className="setting-row pause-row">
          {[
            { label: 'Every day', days: EVERY_DAY },
            { label: 'Weekdays', days: WEEKDAYS },
            { label: 'Weekends', days: WEEKENDS },
          ].map((opt) => (
            <button
              key={opt.label}
              type="button"
              className="btn quiet small"
              onClick={() => set({ days: [...opt.days] })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Group>

      <div className="section-label">Options</div>
      <Group>
        {draft.type === 'word' ? (
          <StaticRow title="Words per push" subtitle="One notification, up to three words">
            <Stepper
              value={draft.count}
              min={1}
              max={3}
              onValueChange={(n) => set({ count: n })}
              label="Words per push"
            />
          </StaticRow>
        ) : null}
        {CAN_SKIP.has(draft.type) ? (
          <StaticRow
            title="Only if the day is empty"
            subtitle="Stays quiet once you have practiced today"
          >
            <Toggle
              checked={draft.onlyIfIdle}
              onCheckedChange={(v) => set({ onlyIfIdle: v })}
              aria-label="Only if the day is empty"
            />
          </StaticRow>
        ) : null}
        <StaticRow title="Enabled" subtitle="Keep the reminder without sending it">
          <Toggle
            checked={draft.enabled}
            onCheckedChange={(v) => set({ enabled: v })}
            aria-label="Enabled"
          />
        </StaticRow>
      </Group>

      <div className="field">
        <label className="field-label" htmlFor="reminder-text">
          Your own words
        </label>
        <input
          id="reminder-text"
          className="field-input"
          value={draft.text}
          maxLength={MAX_TEXT}
          placeholder={PLACEHOLDER[draft.type]}
          onChange={(e) => set({ text: e.target.value })}
        />
        <div className="field-hint">
          Replaces the message body. Leave it empty for the standard wording.
        </div>
      </div>

      <div className="btn-row">
        <button type="button" className="btn quiet" onClick={() => onOpenChange(false)}>
          Cancel
        </button>
        <button
          type="button"
          className="btn accent"
          disabled={!draft.days.length}
          onClick={() => {
            onSave(draft);
            onOpenChange(false);
          }}
        >
          Save
        </button>
      </div>

      <div className="sheet-links">
        <button type="button" className="btn ghost" onClick={preview} disabled={previewing}>
          {previewing ? 'Sending…' : 'Send this one now'}
        </button>
        {!isNew ? (
          <button
            type="button"
            className="btn ghost danger-text"
            onClick={() => {
              onDelete(draft.id);
              onOpenChange(false);
            }}
          >
            Delete
          </button>
        ) : null}
      </div>
    </Sheet>
  );
}
