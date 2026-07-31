import { useCallback, useEffect, useRef, useState } from 'react';
import * as db from '../store.js';
import * as push from '../push.js';
import { APP_VERSION } from '../config.js';
import { useStore } from '../useStore.js';
import { S } from '../lang.js';
import { Group, ActionRow, StaticRow } from '../ui/Row.jsx';
import { Toggle } from '../ui/Toggle.jsx';
import { Stepper } from '../ui/Stepper.jsx';
import { AccentPicker } from '../ui/AccentPicker.jsx';
import { ConfirmSheet } from '../sheets/ConfirmSheet.jsx';
import { toast } from '../ui/toast.js';
import { ChevronIcon, DownloadIcon, UploadIcon } from '../icons.jsx';

export function Settings({ onOpenLanguages, onOpenInstall, onApplyAccent, onSwitchLang }) {
  useStore();
  const st = db.getState();
  const ls = db.langState();
  const pack = db.activePack();

  const [index, setIndex] = useState([]);
  const [status, setStatus] = useState({ subscribed: false, langs: {} });
  const [busyLang, setBusyLang] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef(null);

  const supported = push.pushSupported();
  const denied = supported && Notification.permission === 'denied';
  const iosNotInstalled = push.isIOS() && !push.isStandalone();

  useEffect(() => {
    let live = true;
    db.loadIndex()
      .then((i) => live && setIndex(i))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const refreshStatus = useCallback(() => {
    if (!supported || denied) return;
    let live = true;
    push.getStatus().then((s) => live && setStatus(s));
    return () => {
      live = false;
    };
  }, [supported, denied]);

  useEffect(() => refreshStatus(), [refreshStatus]);

  async function toggleNotifications(code, enable) {
    setBusyLang(code);
    try {
      if (enable) {
        await push.enableLang(code);
        toast('Notifications on. First word coming soon');
      } else {
        await push.disableLang(code);
        toast('Notifications off');
      }
      setStatus(await push.getStatus());
    } catch (err) {
      toast(err.message === 'denied' ? 'Permission was denied' : 'Could not update, try again');
    } finally {
      setBusyLang(null);
    }
  }

  const anyEnabled = Object.values(status.langs || {}).some((l) => l?.enabled);
  const packName = pack?.name || '';

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
        {!supported && iosNotInstalled ? (
          <ActionRow
            title="Add to Home Screen first"
            subtitle="iPhone push notifications only work once Vernacular is installed. Tap for instructions."
            value={<ChevronIcon />}
            onClick={onOpenInstall}
          />
        ) : null}

        {!supported && !iosNotInstalled ? (
          <StaticRow
            title="Not supported here"
            subtitle="This browser doesn't support web push."
          />
        ) : null}

        {supported && denied ? (
          <StaticRow
            title="Notifications blocked"
            subtitle="Allow notifications for Vernacular in iOS Settings, then come back."
          />
        ) : null}

        {supported && !denied ? (
          <>
            <StaticRow
              title="Daily words, per language"
              subtitle="3 new words during the day and one evening review, for every language you enable."
            />
            {index.map((p) => (
              <StaticRow key={p.code} title={p.native}>
                <Toggle
                  checked={!!status.langs?.[p.code]?.enabled}
                  disabled={busyLang != null}
                  onCheckedChange={(v) => toggleNotifications(p.code, v)}
                  aria-label={`Notifications for ${p.name}`}
                />
              </StaticRow>
            ))}
            {anyEnabled ? (
              <ActionRow
                title="Send a test notification"
                value={<ChevronIcon />}
                onClick={async () => {
                  try {
                    await push.sendTestPush();
                    toast('Test sent. Check in a few seconds');
                  } catch {
                    toast('Could not send test');
                  }
                }}
              />
            ) : null}
          </>
        ) : null}
      </Group>

      <div className="section-label">Learning</div>
      <Group>
        <StaticRow title="Daily goal" subtitle={`New ${packName} words per day`}>
          <Stepper value={ls.goal} onValueChange={(n) => db.setGoal(n)} label="Daily goal" />
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
