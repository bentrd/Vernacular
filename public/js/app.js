import { APP_VERSION } from './config.js';
import * as db from './store.js';
import * as push from './push.js';

const view = document.getElementById('view');
const tabbar = document.getElementById('tabbar');

// tiny helpers
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const $ = (sel, root = view) => root.querySelector(sel);
const $$ = (sel, root = view) => [...root.querySelectorAll(sel)];

function toast(msg, ms = 2200) {
  const root = document.getElementById('toast-root');
  root.innerHTML = `<div class="toast">${esc(msg)}</div>`;
  const el = root.firstElementChild;
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 400);
}

function sheet(html) {
  const root = document.getElementById('sheet-root');
  root.innerHTML = `<div class="sheet-backdrop"><div class="sheet"><div class="grabber"></div>${html}</div></div>`;
  const backdrop = root.firstElementChild;
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeSheet();
  });
  return backdrop.querySelector('.sheet');
}
function closeSheet() {
  document.getElementById('sheet-root').innerHTML = '';
}

const shuffle = (a) => {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const stripMacrons = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const POS_LABEL = {
  noun: 'noun', verb: 'verb', adjective: 'adjective', adverb: 'adverb',
  pronoun: 'pronoun', preposition: 'preposition', conjunction: 'conjunction',
  interjection: 'interjection', phrase: 'phrase',
};

// routing
const routes = { today: renderToday, library: renderLibrary, practice: renderPractice, settings: renderSettings };
let current = 'today';
let sessionActive = false;

function go(route) {
  if (!routes[route]) route = 'today';
  current = route;
  sessionActive = false;
  location.hash = `/${route}`;
  render();
}

function render() {
  closeSheet();
  routes[current]();
  $$('.tab', tabbar).forEach((t) => t.classList.toggle('active', t.dataset.route === current));
  document.getElementById('scroll').scrollTop = 0;
}

tabbar.addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (tab) go(tab.dataset.route);
});

window.addEventListener('hashchange', () => {
  const r = location.hash.replace(/^#\//, '') || 'today';
  if (r !== current && routes[r]) {
    current = r;
    sessionActive = false;
    render();
  }
});

// word card fragment
function wordCardHTML(w, { veiled = false } = {}) {
  return `
    <div class="card wordcard ${veiled ? 'veiled' : ''}" data-word-card>
      <div class="w-la">${esc(w.la)}</div>
      <div class="w-g">${esc(w.g)}</div>
      <span class="w-pos">${esc(POS_LABEL[w.pos] || w.pos)}</span>
      <div class="hidden-part">
        <div class="w-en">${esc(w.en)}</div>
        <div class="w-fr">${esc(w.fr)}</div>
        <div class="w-ex">
          <div class="la">“${esc(w.ex)}”</div>
          <div class="en">${esc(w.exEn)}</div>
          <div class="fr">${esc(w.exFr)}</div>
        </div>
      </div>
      ${veiled ? '<div class="reveal-hint">Tap to reveal meaning</div>' : ''}
    </div>`;
}

// TODAY
function renderToday() {
  const s = db.getState();
  const t = db.todayCounts();
  const c = db.counts();
  const now = new Date();
  const dateLine = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const goalPct = Math.min(100, Math.round((t.new / s.goal) * 100));
  const needsInstall = push.isIOS() && !push.isStandalone();

  view.innerHTML = `
    <div class="today-head">
      <div>
        <div class="eyebrow">${esc(dateLine)}</div>
        <h1 class="title">Salvē.</h1>
      </div>
      <div class="streak-pill"><span class="dot">●</span> ${s.stats.streak || 0}&nbsp;day${s.stats.streak === 1 ? '' : 's'}</div>
    </div>

    <div class="progress-wrap">
      <div class="progress-row">
        <span class="label">Today’s goal</span>
        <span class="value">${t.new} of ${s.goal} new words</span>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${goalPct}%"></div></div>
    </div>

    <div class="stat-grid">
      <div class="stat"><div class="n">${c.total}</div><div class="l">In library</div></div>
      <div class="stat"><div class="n">${c.mastered}</div><div class="l">Mastered</div></div>
      <div class="stat"><div class="n">${c.due}</div><div class="l">Due today</div></div>
    </div>

    ${needsInstall ? `
      <button class="banner" id="install-banner" style="width:100%;text-align:left">
        <span class="b-icon">📲</span>
        <span class="b-text">
          <span class="b-title">Add Vernacular to your Home Screen</span>
          <span class="b-sub">Required for push notifications on iPhone</span>
        </span>
      </button>` : ''}

    ${c.due > 0 ? `
      <button class="banner" id="due-banner" style="width:100%;text-align:left">
        <span class="b-icon">✳︎</span>
        <span class="b-text">
          <span class="b-title">${c.due} word${c.due === 1 ? '' : 's'} due for review</span>
          <span class="b-sub">A quick quiz keeps them in memory</span>
        </span>
      </button>` : ''}

    <div class="section-label">${t.new < s.goal ? 'Next word' : 'Keep going'}</div>
    <div id="learn-slot"></div>
  `;

  $('#install-banner')?.addEventListener('click', showInstallSheet);
  $('#due-banner')?.addEventListener('click', () => startSession('choice', { dueOnly: true }));
  renderLearnSlot();
}

let skippedIds = new Set();

function renderLearnSlot() {
  const slot = $('#learn-slot');
  if (!slot) return;
  let next = null;
  const s = db.getState();
  for (const w of db.allWords()) {
    if (!s.dict[w.id] && !skippedIds.has(w.id)) { next = w; break; }
  }
  if (!next) {
    skippedIds = new Set();
    next = db.nextLockedWord();
  }
  if (!next) {
    slot.innerHTML = `<div class="card empty"><div class="e-icon">🏛</div>
      <div class="e-title">Omnia didicistī!</div>
      <div class="e-sub">You've collected every word. Incredible.</div></div>`;
    return;
  }
  slot.innerHTML = `
    ${wordCardHTML(next, { veiled: true })}
    <div class="btn-row" id="learn-actions">
      <button class="btn quiet" id="skip-btn">Skip</button>
      <button class="btn accent" id="reveal-btn">Reveal</button>
    </div>`;

  const card = $('[data-word-card]', slot);
  const reveal = () => {
    card.classList.remove('veiled');
    card.querySelector('.reveal-hint')?.remove();
    $('#learn-actions', slot).innerHTML = `
      <button class="btn quiet" id="skip-btn">Not now</button>
      <button class="btn accent" id="add-btn">Add to library</button>`;
    $('#add-btn', slot).addEventListener('click', () => {
      db.addWord(next.id);
      toast(`“${next.la}” added to your library`);
      renderToday();
    });
    $('#skip-btn', slot).addEventListener('click', () => { skippedIds.add(next.id); renderLearnSlot(); });
  };
  card.addEventListener('click', reveal);
  $('#reveal-btn', slot).addEventListener('click', reveal);
  $('#skip-btn', slot).addEventListener('click', () => { skippedIds.add(next.id); renderLearnSlot(); });
}

function showInstallSheet() {
  const el = sheet(`
    <h1 class="title" style="font-size:24px">Install Vernacular</h1>
    <p class="subtitle">To get word notifications on your iPhone:</p>
    <div class="card" style="margin-top:16px">
      <ol style="padding-left:20px;line-height:2;font-size:15px">
        <li>Tap the <strong>Share</strong> button in Safari</li>
        <li>Choose <strong>Add to Home Screen</strong></li>
        <li>Open Vernacular from your Home Screen</li>
        <li>Enable notifications in <strong>Settings</strong></li>
      </ol>
    </div>
    <button class="btn full quiet" style="margin-top:16px" id="close-install">Got it</button>`);
  $('#close-install', el).addEventListener('click', closeSheet);
}

// LIBRARY
let libFilter = 'all';
let libQuery = '';

function renderLibrary() {
  const c = db.counts();
  view.innerHTML = `
    <div class="eyebrow">Dictionary</div>
    <h1 class="title">Library</h1>
    <p class="subtitle">${c.total} word${c.total === 1 ? '' : 's'} collected · ${c.mastered} mastered</p>

    <div class="searchbar">
      <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8" stroke-linecap="round"/></svg>
      <input id="lib-search" type="search" placeholder="Search Latin or English…" value="${esc(libQuery)}" autocomplete="off" />
    </div>
    <div class="chips" id="lib-chips">
      ${['all', 'new', 'learning', 'mastered'].map((f) =>
        `<button class="chip ${libFilter === f ? 'on' : ''}" data-f="${f}">${f[0].toUpperCase() + f.slice(1)}</button>`).join('')}
    </div>
    <div id="lib-list"></div>
  `;

  $('#lib-search').addEventListener('input', (e) => { libQuery = e.target.value; renderLibList(); });
  $('#lib-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    libFilter = chip.dataset.f;
    $$('.chip').forEach((ch) => ch.classList.toggle('on', ch === chip));
    renderLibList();
  });
  renderLibList();
}

function renderLibList() {
  const list = $('#lib-list');
  const q = stripMacrons(libQuery);
  let entries = db.dictEntries();
  if (libFilter !== 'all') entries = entries.filter((x) => db.statusOf(x.entry) === libFilter);
  if (q) entries = entries.filter(({ word }) =>
    stripMacrons(word.la).includes(q) || word.en.toLowerCase().includes(q) || stripMacrons(word.fr).includes(q));
  entries.sort((a, b) => stripMacrons(a.word.la).localeCompare(stripMacrons(b.word.la)));

  if (!entries.length) {
    list.innerHTML = `<div class="card empty" style="margin-top:16px">
      <div class="e-icon">📜</div>
      <div class="e-title">${db.counts().total === 0 ? 'Your library is empty' : 'Nothing here'}</div>
      <div class="e-sub">${db.counts().total === 0
        ? 'Learn your first word from the Today tab,<br/>or wait for a notification to arrive.'
        : 'Try a different search or filter.'}</div>
    </div>`;
    return;
  }
  list.innerHTML = `<div class="wordlist">${entries.map(({ id, word, entry }) => `
    <button class="wordrow" data-id="${esc(id)}">
      <span class="status-dot ${db.statusOf(entry)}"></span>
      <span class="wr-main">
        <span class="wr-la">${esc(word.la)}</span>
        <span class="wr-en" style="display:block">${esc(word.en)} · ${esc(word.fr)}</span>
      </span>
    </button>`).join('')}</div>`;

  list.addEventListener('click', (e) => {
    const row = e.target.closest('.wordrow');
    if (row) showWordSheet(row.dataset.id);
  });
}

function showWordSheet(id) {
  const w = db.wordById(id);
  const entry = db.getState().dict[id];
  if (!w) return;
  const status = db.statusOf(entry);
  const el = sheet(`
    ${wordCardHTML(w)}
    ${entry ? `
    <div class="stat-grid">
      <div class="stat"><div class="n">${['New', 'I', 'II', 'III', 'IV', 'V', '★'][entry.box] || entry.box}</div><div class="l">Level</div></div>
      <div class="stat"><div class="n">${entry.correct}</div><div class="l">Correct</div></div>
      <div class="stat"><div class="n">${entry.wrong}</div><div class="l">Missed</div></div>
    </div>
    <div class="btn-row">
      ${status !== 'mastered' ? '<button class="btn quiet" id="ws-master">Mark mastered</button>' : '<button class="btn quiet" id="ws-reset">Reset progress</button>'}
      <button class="btn danger" id="ws-remove">Remove</button>
    </div>` : ''}
  `);
  $('#ws-master', el)?.addEventListener('click', () => { db.setMastered(id); closeSheet(); render(); toast('Marked as mastered'); });
  $('#ws-reset', el)?.addEventListener('click', () => { db.resetProgress(id); closeSheet(); render(); toast('Progress reset'); });
  $('#ws-remove', el)?.addEventListener('click', () => { db.removeWord(id); closeSheet(); render(); toast(`“${w.la}” removed`); });
}

// PRACTICE
function renderPractice() {
  const c = db.counts();
  const enough = c.total >= 4;
  view.innerHTML = `
    <div class="eyebrow">Exercitium</div>
    <h1 class="title">Practice</h1>
    <p class="subtitle">${c.due > 0 ? `${c.due} word${c.due === 1 ? '' : 's'} due for review.` : 'Nothing due. Free practice below.'}</p>

    ${c.due > 0 ? `
      <button class="banner" id="p-due" style="width:100%;text-align:left">
        <span class="b-icon">✳︎</span>
        <span class="b-text"><span class="b-title">Daily review</span>
        <span class="b-sub">${c.due} due · multiple choice</span></span>
      </button>` : ''}

    <div class="section-label">Modes</div>
    <div class="card tappable mode-card" data-mode="flash">
      <span class="m-icon">🃏</span>
      <span style="flex:1"><span class="m-title" style="display:block">Flashcards</span>
      <span class="m-sub">Flip through, grade yourself</span></span>
      <span class="m-chev">›</span>
    </div>
    <div class="card tappable mode-card" data-mode="choice">
      <span class="m-icon">☰</span>
      <span style="flex:1"><span class="m-title" style="display:block">Multiple choice</span>
      <span class="m-sub">Latin ↔ English, four options</span></span>
      <span class="m-chev">›</span>
    </div>
    <div class="card tappable mode-card" data-mode="type">
      <span class="m-icon">⌨️</span>
      <span style="flex:1"><span class="m-title" style="display:block">Type the Latin</span>
      <span class="m-sub">The hardest: spell it out</span></span>
      <span class="m-chev">›</span>
    </div>
    ${!enough ? `<p class="subtitle" style="margin-top:16px">Collect at least 4 words to start practicing.</p>` : ''}
  `;
  $('#p-due')?.addEventListener('click', () => startSession('choice', { dueOnly: true }));
  $$('.mode-card').forEach((mcard) =>
    mcard.addEventListener('click', () => {
      if (!enough) { toast('Learn a few more words first'); return; }
      startSession(mcard.dataset.mode);
    })
  );
}

function buildDeck({ dueOnly = false } = {}) {
  const due = shuffle(db.dueWords());
  let deck = due;
  if (!dueOnly) {
    const rest = shuffle(db.dictEntries().filter((x) => !due.some((d) => d.id === x.id)));
    deck = [...due, ...rest];
  }
  return deck.slice(0, 10);
}

function startSession(mode, opts = {}) {
  const deck = buildDeck(opts);
  if (!deck.length) { toast('Nothing to practice yet'); return; }
  sessionActive = true;
  let i = 0;
  let right = 0;

  const step = () => {
    if (!sessionActive) return;
    if (i >= deck.length) return sessionDone(right, deck.length);
    const item = deck[i];
    const progress = Math.round((i / deck.length) * 100);
    const shell = `
      <div class="session-top">
        <button class="close" id="s-close">Close</button>
        <div class="session-progress"><i style="width:${progress}%"></i></div>
        <span class="session-count">${i + 1}/${deck.length}</span>
      </div>
      <div id="s-body"></div>`;
    view.innerHTML = shell;
    $('#s-close').addEventListener('click', () => { sessionActive = false; renderPractice(); });
    const body = $('#s-body');
    const onAnswer = (ok) => {
      db.recordReview(item.id, ok);
      if (ok) right++;
      i++;
      setTimeout(step, ok ? 650 : 1400);
    };
    if (mode === 'flash') renderFlash(body, item, onAnswer);
    else if (mode === 'type') renderType(body, item, onAnswer);
    else renderChoice(body, item, onAnswer);
  };
  step();
}

function renderChoice(body, { word }, onAnswer) {
  const latinFirst = Math.random() < 0.5;
  const pool = db.allWords().filter((w) => w.id !== word.id && w.pos === word.pos);
  const fallback = db.allWords().filter((w) => w.id !== word.id);
  const distractors = shuffle(pool.length >= 3 ? pool : fallback).slice(0, 3);
  const options = shuffle([word, ...distractors]);
  body.innerHTML = `
    <div class="quiz-q">
      <div class="q-label">${latinFirst ? 'What does this mean?' : 'Which word is this?'}</div>
      <div class="q-word ${latinFirst ? '' : 'en-mode'}">${latinFirst ? esc(word.la) : `${esc(word.en)} · ${esc(word.fr)}`}</div>
      ${latinFirst ? `<div class="q-hint">${esc(word.g)}</div>` : ''}
    </div>
    <div class="options">
      ${options.map((o) => `<button class="option ${latinFirst ? '' : 'latin'}" data-id="${esc(o.id)}">
        ${latinFirst ? `${esc(o.en)} · ${esc(o.fr)}` : esc(o.la)}</button>`).join('')}
    </div>`;
  let answered = false;
  body.querySelector('.options').addEventListener('click', (e) => {
    const opt = e.target.closest('.option');
    if (!opt || answered) return;
    answered = true;
    const ok = opt.dataset.id === word.id;
    body.querySelectorAll('.option').forEach((el) => {
      if (el.dataset.id === word.id) el.classList.add('correct');
      else if (el === opt) el.classList.add('wrong');
      else el.classList.add('dim');
    });
    onAnswer(ok);
  });
}

function renderFlash(body, { word }, onAnswer) {
  body.innerHTML = `
    <div class="flash-card" id="fcard">
      <div class="f-la">${esc(word.la)}</div>
      <div class="f-g">${esc(word.g)}</div>
      <div class="f-back" style="display:none">
        <div class="f-en">${esc(word.en)}</div>
        <div class="f-fr">${esc(word.fr)}</div>
        <div class="f-ex">“${esc(word.ex)}”<br/><span style="font-style:normal;font-family:var(--sans);font-size:13px">${esc(word.exEn)}</span></div>
      </div>
      <div class="f-tap">Tap to flip</div>
    </div>
    <div class="btn-row" id="f-actions" style="visibility:hidden">
      <button class="btn danger" id="f-again">Again</button>
      <button class="btn" style="background:var(--green);color:#fff" id="f-good">I knew it</button>
    </div>`;
  const card = $('#fcard', body);
  card.addEventListener('click', () => {
    $('.f-back', card).style.display = '';
    $('.f-tap', card).style.display = 'none';
    $('#f-actions', body).style.visibility = 'visible';
  });
  $('#f-again', body).addEventListener('click', () => onAnswer(false));
  $('#f-good', body).addEventListener('click', () => onAnswer(true));
}

function renderType(body, { word }, onAnswer) {
  body.innerHTML = `
    <div class="quiz-q">
      <div class="q-label">Type the Latin for</div>
      <div class="q-word en-mode">${esc(word.en)} · ${esc(word.fr)}</div>
      <div class="q-hint">${esc(word.g.replace(word.la, '…'))}</div>
    </div>
    <input class="type-input" id="t-input" autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false" placeholder="scrībe hīc…" enterkeyhint="done" />
    <div class="type-answer" id="t-answer"></div>
    <div class="btn-row">
      <button class="btn quiet" id="t-show">Show answer</button>
      <button class="btn accent" id="t-check">Check</button>
    </div>`;
  const input = $('#t-input', body);
  input.focus();
  let done = false;
  const check = () => {
    if (done) return;
    const guess = stripMacrons(input.value);
    if (!guess) return;
    done = true;
    const ok = guess === stripMacrons(word.la) || guess === word.id;
    input.classList.add(ok ? 'correct' : 'wrong');
    input.disabled = true;
    if (!ok) $('#t-answer', body).innerHTML = `Answer: <span class="la">${esc(word.la)}</span>`;
    onAnswer(ok);
  };
  const giveUp = () => {
    if (done) return;
    done = true;
    input.disabled = true;
    input.classList.add('wrong');
    $('#t-answer', body).innerHTML = `Answer: <span class="la">${esc(word.la)}</span>`;
    onAnswer(false);
  };
  $('#t-check', body).addEventListener('click', check);
  $('#t-show', body).addEventListener('click', giveUp);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
}

function sessionDone(right, total) {
  sessionActive = false;
  const pct = Math.round((right / total) * 100);
  const verdict = pct === 100 ? 'Perfectum!' : pct >= 70 ? 'Bene factum!' : 'Repetītiō māter studiōrum.';
  const sub = pct === 100 ? 'A flawless round.' : pct >= 70 ? 'Well done. Keep the streak alive.' : 'Repetition is the mother of learning. Go again?';
  view.innerHTML = `
    <div class="session-done">
      <div class="d-icon">${pct === 100 ? '🏆' : pct >= 70 ? '🎉' : '📚'}</div>
      <div class="d-title">${verdict}</div>
      <div class="d-sub">${right} of ${total} correct · ${sub}</div>
      <div class="btn-row" style="max-width:340px;margin:28px auto 0">
        <button class="btn quiet" id="d-back">Done</button>
        <button class="btn accent" id="d-again">Practice again</button>
      </div>
    </div>`;
  $('#d-back').addEventListener('click', () => go('today'));
  $('#d-again').addEventListener('click', renderPractice);
}

// SETTINGS
async function renderSettings() {
  const s = db.getState();
  const supported = push.pushSupported();
  const sub = supported ? await push.getSubscription().catch(() => null) : null;
  const denied = supported && Notification.permission === 'denied';
  const iosNotInstalled = push.isIOS() && !push.isStandalone();

  view.innerHTML = `
    <div class="eyebrow">Praeferentiae</div>
    <h1 class="title">Settings</h1>

    <div class="section-label">Notifications</div>
    <div class="setting-group">
      ${!supported && iosNotInstalled ? `
        <button class="setting-row" id="n-install">
          <span class="s-main"><span class="s-title">Add to Home Screen first</span>
          <span class="s-sub">iPhone push notifications only work once Vernacular is installed. Tap for instructions.</span></span>
          <span class="s-value">›</span>
        </button>` : ''}
      ${!supported && !iosNotInstalled ? `
        <div class="setting-row"><span class="s-main"><span class="s-title">Not supported here</span>
        <span class="s-sub">This browser doesn't support web push.</span></span></div>` : ''}
      ${supported ? `
        <button class="setting-row" id="n-toggle-row">
          <span class="s-main"><span class="s-title">Daily word notifications</span>
          <span class="s-sub">${denied
            ? 'Blocked. Allow notifications for Vernacular in iOS Settings'
            : '3 new words during the day, one review prompt in the evening'}</span></span>
          <span class="toggle ${sub ? 'on' : ''}" id="n-toggle"></span>
        </button>
        ${sub ? `
        <button class="setting-row" id="n-test">
          <span class="s-main"><span class="s-title">Send a test notification</span></span>
          <span class="s-value">›</span>
        </button>` : ''}` : ''}
    </div>

    <div class="section-label">Learning</div>
    <div class="setting-group">
      <div class="setting-row">
        <span class="s-main"><span class="s-title">Daily goal</span>
        <span class="s-sub">New words per day</span></span>
        <span class="stepper">
          <button id="g-minus">−</button>
          <span class="st-v" id="g-val">${s.goal}</span>
          <button id="g-plus">+</button>
        </span>
      </div>
    </div>

    <div class="section-label">Data</div>
    <div class="setting-group">
      <button class="setting-row" id="d-export">
        <span class="s-main"><span class="s-title">Export library</span>
        <span class="s-sub">Download everything as a JSON backup</span></span>
        <span class="s-value">›</span>
      </button>
      <button class="setting-row" id="d-import">
        <span class="s-main"><span class="s-title">Import backup</span>
        <span class="s-sub">Restore from a Vernacular JSON file</span></span>
        <span class="s-value">›</span>
      </button>
      <button class="setting-row" id="d-reset">
        <span class="s-main"><span class="s-title" style="color:var(--red)">Erase everything</span>
        <span class="s-sub">Removes your library and progress on this device</span></span>
      </button>
    </div>
    <input type="file" id="d-file" accept="application/json,.json" style="display:none" />

    <div class="section-label">About</div>
    <div class="setting-group">
      <div class="setting-row"><span class="s-main"><span class="s-title">Version</span></span><span class="s-value">${APP_VERSION}</span></div>
      <div class="setting-row"><span class="s-main"><span class="s-title">Word list</span></span><span class="s-value">${db.allWords().length} words</span></div>
      <div class="setting-row"><span class="s-main"><span class="s-title">Vernacular</span>
        <span class="s-sub">Fēcit cum amōre · your data never leaves this device (except push subscriptions)</span></span></div>
    </div>
  `;

  $('#n-install')?.addEventListener('click', showInstallSheet);

  $('#n-toggle-row')?.addEventListener('click', async () => {
    if (denied) { toast('Enable notifications in iOS Settings → Vernacular'); return; }
    const toggle = $('#n-toggle');
    if (toggle.classList.contains('on')) {
      await push.disablePush().catch(() => {});
      toast('Notifications off');
    } else {
      toggle.classList.add('on');
      try {
        await push.enablePush();
        toast('Notifications on. First word coming soon');
      } catch (err) {
        toggle.classList.remove('on');
        toast(err.message === 'denied' ? 'Permission was denied' : 'Could not subscribe, try again');
      }
    }
    renderSettings();
  });

  $('#n-test')?.addEventListener('click', async () => {
    try { await push.sendTestPush(); toast('Test sent. Check in a few seconds'); }
    catch { toast('Could not send test'); }
  });

  const setG = (n) => { db.setGoal(Math.max(1, Math.min(10, n))); $('#g-val').textContent = db.getState().goal; };
  $('#g-minus').addEventListener('click', () => setG(db.getState().goal - 1));
  $('#g-plus').addEventListener('click', () => setG(db.getState().goal + 1));

  $('#d-export').addEventListener('click', () => {
    const blob = new Blob([db.exportData()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vernacular-backup-${db.dayStr()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $('#d-import').addEventListener('click', () => $('#d-file').click());
  $('#d-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      db.importData(await file.text());
      toast('Library restored');
      render();
    } catch { toast('That file doesn’t look like a Vernacular backup'); }
  });

  $('#d-reset').addEventListener('click', () => {
    const el = sheet(`
      <h1 class="title" style="font-size:22px">Erase everything?</h1>
      <p class="subtitle">Your library, progress, and streak on this device will be gone. Consider exporting first.</p>
      <div class="btn-row">
        <button class="btn quiet" id="r-cancel">Cancel</button>
        <button class="btn danger" id="r-yes">Erase</button>
      </div>`);
    $('#r-cancel', el).addEventListener('click', closeSheet);
    $('#r-yes', el).addEventListener('click', () => { db.resetAll(); closeSheet(); toast('Everything erased'); render(); });
  });
}

// boot
async function handleLaunchParams() {
  const params = new URLSearchParams(location.search);
  const wordId = params.get('word');
  const review = params.get('review');
  if (wordId || review) history.replaceState(null, '', location.pathname);
  if (wordId && db.wordById(wordId)) {
    db.addWord(wordId);
    go('today');
    showWordSheet(wordId);
    return true;
  }
  if (review) {
    go('practice');
    if (db.counts().total >= 1) startSession('choice', { dueOnly: db.counts().due > 0 });
    return true;
  }
  return false;
}

async function init() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'navigate' && typeof e.data.url === 'string') {
        const u = new URL(e.data.url, location.origin);
        history.replaceState(null, '', u.pathname + u.search);
        handleLaunchParams();
      }
    });
  }
  await db.loadWords();
  db.getState();

  const handled = await handleLaunchParams();
  if (!handled) {
    current = location.hash.replace(/^#\//, '') || 'today';
    if (!routes[current]) current = 'today';
    render();
  }

  push.syncFromServer().then((added) => {
    if (added > 0) {
      toast(`${added} new word${added === 1 ? '' : 's'} from your notifications`);
      if (!sessionActive) render();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !sessionActive) {
      push.syncFromServer().then((added) => { if (added > 0 && !sessionActive) render(); });
    }
  });
}

init();
