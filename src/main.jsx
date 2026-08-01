import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Toast } from '@base-ui/react/toast';
import * as db from './store.js';
import { resolveSession, cacheAccount, cachedAccount } from './auth.js';
import { apiFetch, startSync } from './sync.js';
import { App, applyAccent } from './App.jsx';
import { Welcome } from './screens/Welcome.jsx';
import { Onboarding } from './screens/Onboarding.jsx';
import { Legal } from './screens/Legal.jsx';
import { toastManager } from './ui/toast.js';
import { Toaster } from './ui/Toaster.jsx';
import './main.css';

const ROUTES = ['today', 'library', 'practice', 'settings'];

const legalFromHash = () => {
  const h = location.hash.replace(/^#\//, '');
  return h === 'terms' || h === 'privacy' ? h : null;
};

// Deep links from a notification tap: ?lang=&word=&review=&assess=
async function readLaunchParams() {
  const params = new URLSearchParams(location.search);
  const lang = params.get('lang');
  const wordId = params.get('word');
  const review = params.get('review');
  const assess = params.get('assess');
  if (lang || wordId || review || assess) history.replaceState(null, '', location.pathname);

  if (lang && lang !== db.getState().activeLang) {
    await db.activatePack(lang).catch(() => {});
  }
  if (wordId && db.wordById(wordId)) {
    db.addWord(wordId);
    return { initialRoute: 'today', initialWordId: wordId };
  }
  if (review && db.counts().total >= 1) {
    return {
      initialRoute: 'practice',
      initialSession: { mode: 'choice', options: { dueOnly: db.counts().due > 0 } },
    };
  }
  if (assess) return { initialRoute: 'today', initialCheckIn: true };
  return {};
}

function Root({ initialPhase, user, launch }) {
  const [phase, setPhase] = useState(initialPhase);
  const [legal, setLegal] = useState(legalFromHash);

  useEffect(() => {
    const onHash = () => setLegal(legalFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (phase === 'app') startSync();
  }, [phase]);

  const closeLegal = () => {
    if (history.length > 1) history.back();
    else location.hash = '';
  };
  const legalEl = legal ? <Legal page={legal} onClose={closeLegal} /> : null;

  if (phase === 'app') {
    return (
      <>
        <App
          initialRoute={launch.initialRoute || null}
          initialWordId={launch.initialWordId || null}
          initialSession={launch.initialSession || null}
          initialCheckIn={!!launch.initialCheckIn}
        />
        {legalEl}
      </>
    );
  }

  return (
    <Toast.Provider toastManager={toastManager}>
      {phase === 'onboarding' ? (
        <Onboarding
          user={user}
          onDone={(profile) => {
            cacheAccount({ ...(cachedAccount() || {}), profile });
            setPhase('app');
          }}
        />
      ) : (
        <Welcome />
      )}
      {legalEl}
      <Toaster />
    </Toast.Provider>
  );
}

async function boot() {
  // Touch the store before the first render so its lazy init (and the save()
  // it performs) never fires while React is rendering.
  db.getState();
  applyAccent();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // resolveSession() must run before anything rewrites the URL: returning
  // magic-link and OAuth redirects carry a one-time session verifier in the
  // query string that getSession() exchanges.
  const sess = await resolveSession();

  let phase = 'welcome';
  let user = null;
  if (sess.status === 'signed-in') {
    user = sess.user;
    let profile = null;
    try {
      ({ profile } = await apiFetch('/api/profile'));
      cacheAccount({ ...(cachedAccount() || {}), profile });
    } catch {
      profile = cachedAccount()?.profile || null; // offline: trust the cache
    }
    phase = profile?.onboardedAt ? 'app' : 'onboarding';
  } else if (sess.status === 'offline') {
    // Can't reach the auth server but this device has a signed-in account:
    // let them learn; sync catches up when the network returns.
    user = sess.account.user;
    phase = 'app';
  }

  try {
    await db.activatePack(db.getState().activeLang);
  } catch {
    await db.activatePack(db.DEFAULT_LANG).catch(() => {});
  }

  let launch = {};
  if (phase === 'app') {
    launch = await readLaunchParams();
  } else if (location.search) {
    history.replaceState(null, '', location.pathname + location.hash);
  }

  const hashRoute = location.hash.replace(/^#\//, '');
  if (!launch.initialRoute) {
    launch.initialRoute = ROUTES.includes(hashRoute) ? hashRoute : 'today';
  }

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <Root initialPhase={phase} user={user} launch={launch} />
    </StrictMode>
  );
}

boot();
