import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as db from './store.js';
import { App, applyAccent } from './App.jsx';
import './main.css';

const ROUTES = ['today', 'library', 'practice', 'settings'];

// Deep links from a notification tap: ?lang=&word=&review=
async function readLaunchParams() {
  const params = new URLSearchParams(location.search);
  const lang = params.get('lang');
  const wordId = params.get('word');
  const review = params.get('review');
  if (lang || wordId || review) history.replaceState(null, '', location.pathname);

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
  return {};
}

async function boot() {
  // Touch the store before the first render so its lazy init (and the save()
  // it performs) never fires while React is rendering.
  db.getState();
  applyAccent();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  try {
    await db.activatePack(db.getState().activeLang);
  } catch {
    await db.activatePack(db.DEFAULT_LANG);
  }

  const launch = await readLaunchParams();
  const hashRoute = location.hash.replace(/^#\//, '');

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App
        initialRoute={launch.initialRoute || (ROUTES.includes(hashRoute) ? hashRoute : 'today')}
        initialWordId={launch.initialWordId || null}
        initialSession={launch.initialSession || null}
      />
    </StrictMode>
  );
}

boot();
