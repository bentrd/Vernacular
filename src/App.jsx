import { useCallback, useEffect, useRef, useState } from 'react';
import { Drawer } from '@base-ui/react/drawer';
import { Tabs } from '@base-ui/react/tabs';
import { Toast } from '@base-ui/react/toast';

import * as db from './store.js';
import * as push from './push.js';
import { useStore } from './useStore.js';
import { toast, toastManager } from './ui/toast.js';
import { Toaster } from './ui/Toaster.jsx';
import { Today } from './screens/Today.jsx';
import { Library } from './screens/Library.jsx';
import { Practice } from './screens/Practice.jsx';
import { Settings } from './screens/Settings.jsx';
import { Session } from './screens/Session.jsx';
import { LanguageSheet } from './sheets/LanguageSheet.jsx';
import { WordSheet } from './sheets/WordSheet.jsx';
import { InstallSheet } from './sheets/InstallSheet.jsx';
import { CheckInSheet } from './sheets/CheckInSheet.jsx';
import {
  LibraryTabIcon,
  PracticeTabIcon,
  SettingsTabIcon,
  TodayTabIcon,
} from './icons.jsx';

const ROUTES = ['today', 'library', 'practice', 'settings'];
const TABS = [
  { value: 'today', label: 'Today', Icon: TodayTabIcon },
  { value: 'library', label: 'Library', Icon: LibraryTabIcon },
  { value: 'practice', label: 'Practice', Icon: PracticeTabIcon },
  { value: 'settings', label: 'Settings', Icon: SettingsTabIcon },
];

const routeFromHash = () => {
  const r = location.hash.replace(/^#\//, '');
  return ROUTES.includes(r) ? r : 'today';
};

export function applyAccent() {
  document.documentElement.dataset.accent = db.getState().accent || 'lilac';
}

export function App({
  initialRoute = 'today',
  initialWordId = null,
  initialSession = null,
  initialCheckIn = false,
}) {
  useStore();
  const [route, setRoute] = useState(initialRoute);
  const [session, setSession] = useState(initialSession);
  const [skipped, setSkipped] = useState(() => new Set());
  const [langOpen, setLangOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(initialCheckIn);
  const [wordId, setWordId] = useState(initialWordId);
  const scrollRef = useRef(null);

  const go = useCallback((next) => {
    setRoute(next);
    setSession(null);
    location.hash = `/${next}`;
  }, []);

  // Back/forward and service-worker-driven navigation.
  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    location.hash = `/${route}`;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [route]);

  // Words delivered by push while the app was closed.
  useEffect(() => {
    const sync = () => {
      if (session) return;
      push.syncFromServer().then((added) => {
        if (added > 0) toast(`${added} new word${added === 1 ? '' : 's'} from your notifications`);
      });
    };
    sync();
    const onVisible = () => document.visibilityState === 'visible' && sync();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Notification taps: the service worker posts a URL, we open that word.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = async (e) => {
      if (e.data?.type !== 'navigate' || typeof e.data.url !== 'string') return;
      const u = new URL(e.data.url, location.origin);
      history.replaceState(null, '', u.pathname);
      const params = u.searchParams;
      const lang = params.get('lang');
      const word = params.get('word');
      if (lang && lang !== db.getState().activeLang) {
        await db.activatePack(lang).catch(() => {});
      }
      if (word && db.wordById(word)) {
        db.addWord(word);
        go('today');
        setWordId(word);
      } else if (params.get('review')) {
        go('practice');
        if (db.counts().total >= 1) {
          setSession({ mode: 'choice', options: { dueOnly: db.counts().due > 0 } });
        }
      } else if (params.get('assess')) {
        go('today');
        setCheckInOpen(true);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [go]);

  const startSession = useCallback((mode, options = {}) => {
    if (!db.counts().total) {
      toast('Nothing to practice yet');
      return;
    }
    setRoute('practice');
    setSession({ mode, options });
  }, []);

  // The language sheet activates the pack itself (it owns the loading state);
  // this just resets the per-language view state afterwards.
  const onLangSwitched = useCallback(() => {
    setSkipped(new Set());
    setSession(null);
    push.syncFromServer().catch(() => {});
  }, []);

  // Used by the backup importer, which has to activate the pack on its own.
  const switchLang = useCallback(
    async (code) => {
      await db.activatePack(code).catch(() => toast('Could not load that language pack'));
      onLangSwitched();
    },
    [onLangSwitched]
  );

  const openLanguages = useCallback(() => setLangOpen(true), []);
  const openInstall = useCallback(() => setInstallOpen(true), []);
  const openCheckIn = useCallback(() => setCheckInOpen(true), []);

  return (
    <Toast.Provider toastManager={toastManager}>
      <Drawer.Provider>
        <Drawer.IndentBackground className="indent-bg" />
        <Drawer.Indent className="indent">
          <Tabs.Root className="shell" value={route} onValueChange={go}>
            <div className="scroll" ref={scrollRef}>
              <main className="view">
                <Tabs.Panel value="today" className="panel">
                  <Today
                    skipped={skipped}
                    onSkip={(id) => setSkipped((s) => new Set(s).add(id))}
                    onOpenLanguages={openLanguages}
                    onOpenInstall={openInstall}
                    onOpenCheckIn={openCheckIn}
                    onStartDueReview={() => startSession('choice', { dueOnly: true })}
                  />
                </Tabs.Panel>

                <Tabs.Panel value="library" className="panel">
                  <Library onOpenWord={setWordId} />
                </Tabs.Panel>

                <Tabs.Panel value="practice" className="panel">
                  {session ? (
                    <Session
                      key={session.mode}
                      mode={session.mode}
                      options={session.options}
                      onBackToMenu={() => setSession(null)}
                      onExitToToday={() => go('today')}
                    />
                  ) : (
                    <Practice onStart={startSession} onOpenCheckIn={openCheckIn} />
                  )}
                </Tabs.Panel>

                <Tabs.Panel value="settings" className="panel">
                  <Settings
                    onOpenLanguages={openLanguages}
                    onOpenInstall={openInstall}
                    onApplyAccent={applyAccent}
                    onSwitchLang={switchLang}
                  />
                </Tabs.Panel>
              </main>
            </div>

            <Tabs.List className="tabbar" render={<nav />} aria-label="Sections">
              {TABS.map(({ value, label, Icon }) => (
                <Tabs.Tab key={value} value={value} className="tab">
                  <Icon />
                  <span>{label}</span>
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs.Root>
        </Drawer.Indent>

        <LanguageSheet open={langOpen} onOpenChange={setLangOpen} onSwitched={onLangSwitched} />
        <InstallSheet open={installOpen} onOpenChange={setInstallOpen} />
        <CheckInSheet
          open={checkInOpen}
          onOpenChange={setCheckInOpen}
          onStartReview={() => startSession('choice', { dueOnly: true })}
        />
        <WordSheet wordId={wordId} onOpenChange={(o) => !o && setWordId(null)} />
      </Drawer.Provider>

      <Toaster />
    </Toast.Provider>
  );
}
