import * as db from './store.js';
import { cachedAccount } from './auth.js';

// Which gloss language leads (onboarding choice); both always show.
export const glossFirst = () => (cachedAccount()?.profile?.nativeLang === 'fr' ? 'fr' : 'en');

const FALLBACK_STRINGS = {
  greeting: 'Hello.',
  libraryEyebrow: 'Dictionary',
  practiceEyebrow: 'Practice',
  settingsEyebrow: 'Settings',
  allDone: 'All done!',
  perfect: 'Perfect!',
  good: 'Well done!',
  tryAgain: 'Repetition is the mother of learning.',
  typeHere: 'type here',
  madeWith: 'Made with love',
};

// diacritic-aware display
export const D = (s) => db.display(s);

// localized UI flavor from the active pack
export const S = (key) => D(db.packStrings()[key] || FALLBACK_STRINGS[key] || key);

// fold for comparisons: lowercase, strip combining marks (macrons, accents,
// pinyin tones, Greek breathings), final sigma folded so ς and σ match
export const fold = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ς/g, 'σ')
    .trim();

export const shuffle = (a) => {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};
