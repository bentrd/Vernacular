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
import { Sheet } from '../ui/Sheet.jsx';
import { toast } from '../ui/toast.js';
import { cachedAccount, cacheAccount, signOut, deleteAuthUser } from '../auth.js';
import { apiFetch, syncNow, syncStatus, onSyncChange } from '../sync.js';
import { ChevronIcon, DownloadIcon, UploadIcon, SpinnerIcon } from '../icons.jsx';

export function Settings({ onOpenLanguages, onOpenInstall, onApplyAccent, onSwitchLang }) {
  useStore();
  const st = db.getState();
  const ls = db.langState();
  const pack = db.activePack();

  const [sub, setSub] = useState(null); // null | 'reminders'
  const [status, setStatus] = useState({ subscribed: false, langs: {} });
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef(null);

  const [account, setAccount] = useState(() => cachedAccount() || {});
  const [sync, setSync] = useState(() => syncStatus());
  const [nameOpen, setNameOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameBusy, setNameBusy] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);

  useEffect(() => onSyncChange(() => setSync(syncStatus())), []);

  async function saveName() {
    const name = nameDraft.trim();
    if (!name) return;
    setNameBusy(true);
    try {
      const res = await apiFetch('/api/profile', {
        method: 'PUT',
        body: JSON.stringify({ displayName: name }),
      });
      cacheAccount({ ...(cachedAccount() || {}), profile: res.profile });
      setAccount(cachedAccount() || {});
      setNameOpen(false);
    } catch {
      toast('Could not save your name');
    } finally {
      setNameBusy(false);
    }
  }

  async function doSignOut() {
    setAccountBusy(true);
    try {
      await syncNow(); // best effort: push the latest changes up first
    } catch {
      /* offline sign-out still allowed */
    }
    try {
      await signOut();
    } catch {
      /* cookie may already be gone */
    }
    db.clearLocalState();
    location.hash = '';
    location.reload();
  }

  async function doDeleteAccount() {
    setAccountBusy(true);
    try {
      await apiFetch('/api/account', { method: 'DELETE' });
      await deleteAuthUser().catch(() => {}); // auth record; app data is already gone
      await signOut().catch(() => {});
      db.clearLocalState();
      location.hash = '';
      location.reload();
    } catch {
      toast('Could not delete your account, try again');
      setAccountBusy(false);
    }
  }

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

      <div className="section-label">Account</div>
      <Group>
        <ActionRow
          title={account.profile?.displayName || account.user?.name || 'Your account'}
          subtitle={account.user?.email || ''}
          value={
            sync.pending ? (
              <span className="sync-badge">
                <SpinnerIcon /> Syncing
              </span>
            ) : sync.lastError ? (
              <span className="sync-badge">Offline</span>
            ) : (
              <span className="sync-badge ok">Synced</span>
            )
          }
          onClick={() => {
            setNameDraft(account.profile?.displayName || account.user?.name || '');
            setNameOpen(true);
          }}
        />
        <ActionRow
          title="Sign out"
          subtitle="Your words stay saved to your account"
          onClick={() => setConfirmSignOut(true)}
          disabled={accountBusy}
        />
        <ActionRow
          title="Delete account"
          subtitle="Erases your account and all synced data, permanently"
          className="danger-row"
          onClick={() => setConfirmDelete(true)}
          disabled={accountBusy}
        />
      </Group>

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
          <StaticRow title={pack.marks} subtitle="Show these marks on words">
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
            toast('That file doesn’t look like a Verbum backup');
          }
        }}
      />

      <div className="section-label">Legal</div>
      <Group>
        <ActionRow
          title="Terms of Service"
          value={<ChevronIcon />}
          onClick={() => (location.hash = '/terms')}
        />
        <ActionRow
          title="Privacy Policy"
          value={<ChevronIcon />}
          onClick={() => (location.hash = '/privacy')}
        />
      </Group>

      <div className="section-label">About</div>
      <Group>
        <StaticRow title="Version" value={APP_VERSION} />
        <StaticRow
          title={`${packName} dictionary`}
          subtitle={pack?.attribution || undefined}
          value={`${db.allWords().length.toLocaleString('en-US')} words`}
        />
        <StaticRow
          title="Verbum"
          subtitle={`${S('madeWith')} · your words sync to your account and stay on this device for offline use`}
        />
      </Group>

      <ConfirmSheet
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={`Erase ${packName} data?`}
        description={`Your ${packName} library, progress, and streak will be erased from your account and your devices. Other languages are untouched. Consider exporting first.`}
        confirmLabel="Erase"
        destructive
        onConfirm={() => {
          db.resetLang(db.getState().activeLang);
          toast(`${packName} data erased`);
        }}
      />

      <ConfirmSheet
        open={confirmSignOut}
        onOpenChange={setConfirmSignOut}
        title="Sign out?"
        description="Your words are saved to your account and come back next time you sign in. This device's copy is cleared."
        confirmLabel="Sign out"
        onConfirm={doSignOut}
      />

      <ConfirmSheet
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete your account?"
        description="Your account, library, progress, and notification subscriptions are permanently erased from our servers. There is no undo. Consider exporting your languages first."
        confirmLabel="Delete forever"
        destructive
        onConfirm={doDeleteAccount}
      />

      <Sheet open={nameOpen} onOpenChange={setNameOpen} title="Your name">
        <div className="setting-group" style={{ marginTop: 16 }}>
          <div className="setting-row">
            <input
              className="auth-input bare"
              type="text"
              placeholder="What should we call you?"
              maxLength={80}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
            />
          </div>
        </div>
        <div className="btn-row">
          <button
            type="button"
            className="btn accent full"
            disabled={!nameDraft.trim() || nameBusy}
            onClick={saveName}
          >
            {nameBusy ? <SpinnerIcon /> : null}
            Save
          </button>
        </div>
      </Sheet>
    </>
  );
}
