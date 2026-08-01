import { useCallback, useEffect, useRef, useState } from 'react';
import * as db from '../store.js';
import * as push from '../push.js';
import { APP_VERSION } from '../config.js';
import { useStore } from '../useStore.js';
import { S } from '../lang.js';
import { summarize } from '../../lib/reminders.mjs';
import { Group, ActionRow, StaticRow } from '../ui/Row.jsx';
import { Toggle } from '../ui/Toggle.jsx';
import { Stepper } from '../ui/Stepper.jsx';
import { AccentPicker } from '../ui/AccentPicker.jsx';
import { ConfirmSheet } from '../sheets/ConfirmSheet.jsx';
import { Reminders } from './Reminders.jsx';
import { toast } from '../ui/toast.js';
import { ChevronIcon, DownloadIcon, UploadIcon } from '../icons.jsx';

export function Settings({ onOpenLanguages, onOpenInstall, onApplyAccent, onSwitchLang }) {
  useStore();
  const st = db.getState();
  const ls = db.langState();
  const pack = db.activePack();

  const [sub, setSub] = useState(null); // null | 'reminders'
  const [status, setStatus] = useState({ subscribed: false, langs: {} });
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef(null);

  const supported = push.pushSupported();
  const denied = supported && Notification.permission === 'denied';
  const iosNotInstalled = push.isIOS() && !push.isStandalone();

  const refreshStatus = useCallback(() => {
    if (!supported || denied) return undefined;
    let live = true;
    push.getStatus().then((s) => live && setStatus(s));
    return () => {
      live = false;
    };
  }, [supported, denied]);

  // Coming back from the Reminders screen: the toggles there may have changed.
  useEffect(() => refreshStatus(), [refreshStatus, sub]);

  // The sub-screen is not a route, so nothing else resets the scroll for it.
  useEffect(() => {
    const scroller = document.querySelector('.scroll');
    if (scroller) scroller.scrollTop = 0;
  }, [sub]);

  const activeCode = st.activeLang;
  const remindersOn = !!status.langs?.[activeCode]?.enabled;
  const packName = pack?.name || '';

  const reminderSummary = !supported
    ? iosNotInstalled
      ? 'Add to Home Screen to turn these on'
      : 'Not supported in this browser'
    : denied
      ? 'Blocked. Allow notifications in iOS Settings'
      : !remindersOn
        ? `Off for ${packName}`
        : db.pausedUntil(activeCode)
          ? 'Paused'
          : summarize(db.reminders(activeCode));

  if (sub === 'reminders') {
    return <Reminders onBack={() => setSub(null)} onOpenInstall={onOpenInstall} />;
  }

  return (
    <>
      <div className="eyebrow">{S('settingsEyebrow')}</div>
      <h1 className="title">Settings</h1>

      <div className="section-label">Language</div>
      <Group>
        <ActionRow
          title="Learning language"
          subtitle="Library, streak, and goal are per language"
          value={pack?.native || ''}
          onClick={onOpenLanguages}
        />
      </Group>

      <div className="section-label">Appearance</div>
      <Group>
        <StaticRow title="Accent color">
          <AccentPicker
            value={st.accent}
            onValueChange={(a) => {
              db.setAccent(a);
              onApplyAccent();
            }}
          />
        </StaticRow>
        {pack?.marks ? (
          <StaticRow title={pack.marks} subtitle="Show vowel-length marks on words">
            <Toggle
              checked={!!st.showMarks}
              onCheckedChange={(v) => db.setShowMarks(v)}
              aria-label={pack.marks}
            />
          </StaticRow>
        ) : null}
      </Group>

      <div className="section-label">Notifications</div>
      <Group>
        <ActionRow
          title="Reminders"
          subtitle={reminderSummary}
          value={<ChevronIcon />}
          onClick={() => setSub('reminders')}
        />
      </Group>

      <div className="section-label">Learning</div>
      <Group>
        <StaticRow title="Daily goal" subtitle={`New ${packName} words per day`}>
          <Stepper
            value={ls.goal}
            onValueChange={(n) => {
              db.setGoal(n);
              // Goal reminders compare against this number, so the server needs it.
              push.saveSchedule(activeCode);
            }}
            label="Daily goal"
          />
        </StaticRow>
      </Group>

      <div className="section-label">Data</div>
      <Group>
        <ActionRow
          title={`Export ${packName} library`}
          subtitle="Download this language's data as a JSON backup"
          value={<DownloadIcon />}
          onClick={() => {
            const code = db.getState().activeLang;
            const blob = new Blob([db.exportData(code)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `vernacular-${code}-${db.dayStr()}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
          }}
        />
        <ActionRow
          title="Import backup"
          subtitle="Restores into the language the file was exported from"
          value={<UploadIcon />}
          onClick={() => fileRef.current?.click()}
        />
        <ActionRow
          title={`Erase ${packName} data`}
          subtitle="Removes this language's library and progress on this device"
          className="danger-row"
          onClick={() => setConfirmReset(true)}
        />
      </Group>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          try {
            const lang = db.importData(await file.text());
            toast(`Restored ${lang.toUpperCase()} library`);
            if (lang !== db.getState().activeLang) await onSwitchLang(lang);
          } catch {
            toast('That file doesn’t look like a Vernacular backup');
          }
        }}
      />

      <div className="section-label">About</div>
      <Group>
        <StaticRow title="Version" value={APP_VERSION} />
        <StaticRow
          title={`${packName} dictionary`}
          subtitle={pack?.attribution || undefined}
          value={`${db.allWords().length.toLocaleString('en-US')} words`}
        />
        <StaticRow
          title="Vernacular"
          subtitle={`${S('madeWith')} · your data never leaves this device (except push subscriptions)`}
        />
      </Group>

      <ConfirmSheet
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={`Erase ${packName} data?`}
        description={`Your ${packName} library, progress, and streak on this device will be gone. Other languages are untouched. Consider exporting first.`}
        confirmLabel="Erase"
        destructive
        onConfirm={() => {
          db.resetLang(db.getState().activeLang);
          toast(`${packName} data erased`);
        }}
      />
    </>
  );
}
