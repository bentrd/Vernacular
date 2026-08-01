import { useCallback, useEffect, useState } from 'react';
import * as db from '../store.js';
import * as push from '../push.js';
import { useStore } from '../useStore.js';
import {
  PRESETS,
  TYPE_META,
  describeDays,
  formatTime,
  presetSummary,
} from '../../lib/reminders.mjs';
import { Group, ActionRow, StaticRow } from '../ui/Row.jsx';
import { Toggle } from '../ui/Toggle.jsx';
import { ReminderSheet } from '../sheets/ReminderSheet.jsx';
import { toast } from '../ui/toast.js';
import { BellIcon, ChevronIcon, PlusIcon, SpinnerIcon } from '../icons.jsx';

const niceDay = (day) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
};

function detail(r) {
  const bits = [describeDays(r.days)];
  if (r.type === 'word' && r.count > 1) bits.push(`${r.count} words`);
  if (r.onlyIfIdle) bits.push('only if the day is empty');
  if (r.text) bits.push('custom message');
  if (!r.enabled) bits.push('off');
  return bits.join(' · ');
}

export function Reminders({ onBack, onOpenInstall }) {
  useStore();
  const [index, setIndex] = useState([]);
  const [status, setStatus] = useState({ subscribed: false, langs: {} });
  const [code, setCode] = useState(() => db.getState().activeLang);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // a reminder, or {} for a new one

  const supported = push.pushSupported();
  const denied = supported && Notification.permission === 'denied';
  const iosNotInstalled = push.isIOS() && !push.isStandalone();
  const usable = supported && !denied;

  useEffect(() => {
    let live = true;
    db.loadIndex()
      .then((i) => live && setIndex(i))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!usable) return undefined;
    let live = true;
    push.getStatus().then((s) => live && setStatus(s));
    return () => {
      live = false;
    };
  }, [usable]);

  // Every edit lands in localStorage first, then goes to the server, which is
  // what actually decides when to send.
  const sync = useCallback(
    async (target = code) => {
      const on = !!status.langs?.[target]?.enabled;
      const ok = await push.saveSchedule(target);
      if (on && !ok) toast('Saved on this device. Could not reach the server');
    },
    [code, status]
  );

  async function toggleLang(target, enable) {
    setBusy(true);
    try {
      if (enable) {
        await push.enableLang(target);
        toast('Reminders on');
      } else {
        await push.disableLang(target);
        toast('Reminders off');
      }
      setStatus(await push.getStatus());
    } catch (err) {
      toast(err.message === 'denied' ? 'Permission was denied' : 'Could not update, try again');
    } finally {
      setBusy(false);
    }
  }

  const list = db.reminders(code);
  const enabled = !!status.langs?.[code]?.enabled;
  const paused = db.pausedUntil(code);
  const packName = index.find((p) => p.code === code)?.native || code.toUpperCase();

  const header = (
    <>
      <button type="button" className="back-link" onClick={onBack}>
        <ChevronIcon className="flip" />
        <span>Settings</span>
      </button>
      <div className="eyebrow">Notifications</div>
      <h1 className="title">Reminders</h1>
    </>
  );

  if (!usable) {
    return (
      <>
        {header}
        <p className="subtitle">
          {iosNotInstalled
            ? 'Reminders arrive as push notifications, which iPhone only allows once the app is on your Home Screen.'
            : denied
              ? 'Notifications are blocked for Vernacular. Allow them in iOS Settings, then come back.'
              : 'This browser does not support web push.'}
        </p>
        {iosNotInstalled ? (
          <Group>
            <ActionRow
              title="Add to Home Screen"
              subtitle="Takes about ten seconds. Tap for the steps."
              value={<ChevronIcon />}
              onClick={onOpenInstall}
            />
          </Group>
        ) : null}
      </>
    );
  }

  return (
    <>
      {header}
      <p className="subtitle">
        Choose what arrives, at what time, and on which days. Every language keeps its own
        schedule.
      </p>

      {index.length > 1 ? (
        <div className="chips lang-chips" role="group" aria-label="Language">
          {index.map((p) => (
            <button
              key={p.code}
              type="button"
              className="chip"
              data-pressed={p.code === code ? '' : undefined}
              onClick={() => setCode(p.code)}
            >
              {p.native}
              {status.langs?.[p.code]?.enabled ? <span className="chip-dot" /> : null}
            </button>
          ))}
        </div>
      ) : null}

      <Group>
        <StaticRow
          title={`Reminders for ${packName}`}
          subtitle={
            enabled
              ? paused
                ? `Paused until ${niceDay(paused)}`
                : `${list.filter((r) => r.enabled).length} scheduled`
              : 'Off. Nothing is sent for this language.'
          }
        >
          {busy ? (
            <SpinnerIcon />
          ) : (
            <Toggle
              checked={enabled}
              disabled={busy}
              onCheckedChange={(v) => toggleLang(code, v)}
              aria-label={`Reminders for ${packName}`}
            />
          )}
        </StaticRow>
      </Group>

      <div className="section-label">Schedule</div>
      <Group>
        {list.length ? (
          list.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`setting-row reminder-row${r.enabled ? '' : ' is-off'}`}
              onClick={() => setEditing(r)}
            >
              <span className="rm-time">{formatTime(r.time)}</span>
              <span className="s-main">
                <span className="s-title">{TYPE_META[r.type].label}</span>
                <span className="s-sub">{detail(r)}</span>
              </span>
              <span className="s-value">
                <ChevronIcon />
              </span>
            </button>
          ))
        ) : (
          <StaticRow
            title="Nothing scheduled"
            subtitle="Add a reminder, or start from one of the setups below."
          />
        )}
        <ActionRow
          title="Add a reminder"
          className="add-row"
          value={<PlusIcon />}
          onClick={() => setEditing({})}
        />
      </Group>

      <div className="section-label">Start from a setup</div>
      <Group>
        {PRESETS.map((p) => (
          <ActionRow
            key={p.id}
            title={p.label}
            subtitle={`${p.blurb} · ${presetSummary(p)}`}
            value={<ChevronIcon />}
            onClick={() => {
              db.setReminders(code, p.build());
              sync();
              toast(`${p.label} schedule applied`);
            }}
          />
        ))}
      </Group>

      <div className="section-label">Pause</div>
      <Group>
        <StaticRow
          title="Take a break"
          subtitle={
            paused
              ? `Reminders resume on ${niceDay(db.addDays(paused, 1))}`
              : 'Keeps the schedule, sends nothing until it is over'
          }
        />
        <div className="setting-row pause-row">
          {[
            { label: 'Today', days: 1 },
            { label: '3 days', days: 3 },
            { label: 'A week', days: 7 },
          ].map((opt) => (
            <button
              key={opt.days}
              type="button"
              className="btn quiet small"
              onClick={() => {
                db.pauseReminders(code, opt.days);
                sync();
                toast(`Paused until ${niceDay(db.pausedUntil(code))}`);
              }}
            >
              {opt.label}
            </button>
          ))}
          {paused ? (
            <button
              type="button"
              className="btn ghost small"
              onClick={() => {
                db.pauseReminders(code, 0);
                sync();
                toast('Reminders resumed');
              }}
            >
              Resume now
            </button>
          ) : null}
        </div>
      </Group>

      <div className="section-label">Delivery</div>
      <Group>
        <StaticRow
          title="Time zone"
          subtitle="Reminder times follow this clock, and move with you"
          value={db.timeZone()}
        />
        <StaticRow
          title="Accuracy"
          subtitle="The scheduler runs every 15 minutes, so a reminder can land a few minutes late."
        />
        <ActionRow
          title="Send a test notification"
          value={<BellIcon />}
          onClick={async () => {
            try {
              await push.sendTestPush();
              toast('Test sent. Check in a few seconds');
            } catch {
              toast('Could not send a test');
            }
          }}
        />
      </Group>

      <ReminderSheet
        reminder={editing}
        lang={code}
        onOpenChange={(open) => !open && setEditing(null)}
        onSave={(draft) => {
          if (draft.id) db.updateReminder(code, draft.id, draft);
          else db.addReminder(code, draft);
          sync();
          toast('Reminder saved');
        }}
        onDelete={(id) => {
          db.removeReminder(code, id);
          sync();
          toast('Reminder removed');
        }}
      />
    </>
  );
}
