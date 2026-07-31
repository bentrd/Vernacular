import { useEffect, useMemo, useRef, useState } from 'react';
import * as db from '../store.js';
import { D, S, fold, shuffle } from '../lang.js';
import { gloss } from '../components/WordCard.jsx';
import { ProgressBar } from '../ui/Progress.jsx';
import { BookOpenIcon, SparklesIcon, TrophyIcon } from '../icons.jsx';

function buildDeck({ dueOnly = false } = {}) {
  const due = shuffle(db.dueWords());
  let deck = due;
  if (!dueOnly) {
    const rest = shuffle(db.dictEntries().filter((x) => !due.some((d) => d.id === x.id)));
    deck = [...due, ...rest];
  }
  return deck.slice(0, 10);
}

function Choice({ item, onAnswer }) {
  const { word } = item;
  const { targetFirst, options } = useMemo(() => {
    const first = Math.random() < 0.5;
    const pool = db.allWords().filter((w) => w.id !== word.id && w.pos === word.pos);
    const fallback = db.allWords().filter((w) => w.id !== word.id);
    const distractors = shuffle(pool.length >= 3 ? pool : fallback).slice(0, 3);
    return { targetFirst: first, options: shuffle([word, ...distractors]) };
  }, [word]);
  const [picked, setPicked] = useState(null);

  function choose(o) {
    if (picked) return;
    setPicked(o.id);
    onAnswer(o.id === word.id);
  }

  return (
    <>
      <div className="quiz-q">
        <div className="q-label">{targetFirst ? 'What does this mean?' : 'Which word is this?'}</div>
        <div className={`q-word${targetFirst ? '' : ' en-mode'}`}>
          {targetFirst ? D(word.hw) : gloss(word)}
        </div>
        {targetFirst ? <div className="q-hint">{word.rom || (word.g ? D(word.g) : '')}</div> : null}
      </div>
      <div className="options">
        {options.map((o) => {
          let state = '';
          if (picked) {
            if (o.id === word.id) state = ' correct';
            else if (o.id === picked) state = ' wrong';
            else state = ' dim';
          }
          return (
            <button
              key={o.id}
              type="button"
              className={`option${state}`}
              onClick={() => choose(o)}
              disabled={!!picked}
            >
              {targetFirst ? gloss(o) : D(o.hw)}
            </button>
          );
        })}
      </div>
    </>
  );
}

function Flash({ item, onAnswer }) {
  const { word } = item;
  const [flipped, setFlipped] = useState(false);

  return (
    <>
      <button
        type="button"
        className="flash-card"
        onClick={() => setFlipped(true)}
        disabled={flipped}
      >
        <span className="f-la">{D(word.hw)}</span>
        {word.rom ? <span className="f-rom">{word.rom}</span> : null}
        {word.g ? <span className="f-g">{D(word.g)}</span> : null}
        {flipped ? (
          <span className="f-back">
            <span className="f-en">{word.en || word.fr || ''}</span>
            {word.en && word.fr ? <span className="f-fr">{word.fr}</span> : null}
            {word.ex ? (
              <span className="f-ex">
                “{D(word.ex)}”<br />
                <span className="f-ex-en">{word.exEn}</span>
              </span>
            ) : null}
          </span>
        ) : (
          <span className="f-tap">Tap to flip</span>
        )}
      </button>
      <div className={`btn-row${flipped ? '' : ' invisible'}`}>
        <button type="button" className="btn danger" onClick={() => onAnswer(false)}>
          Again
        </button>
        <button type="button" className="btn success" onClick={() => onAnswer(true)}>
          I knew it
        </button>
      </div>
    </>
  );
}

function TypeIt({ item, onAnswer }) {
  const { word } = item;
  const inputRef = useRef(null);
  const [value, setValue] = useState('');
  const [result, setResult] = useState(null); // null | 'correct' | 'wrong'

  useEffect(() => {
    inputRef.current?.focus();
  }, [word.id]);

  const answerLine = (
    <>
      Answer: <span className="la">{D(word.hw)}</span>
      {word.rom ? <span className="rom"> {word.rom}</span> : null}
    </>
  );

  function check() {
    if (result) return;
    const guess = fold(value);
    if (!guess) return;
    const ok =
      guess === fold(word.hw) ||
      guess === word.id ||
      (word.rom && guess === fold(word.rom)) ||
      (word.rom && guess === fold(word.rom).replace(/[\s']/g, ''));
    setResult(ok ? 'correct' : 'wrong');
    onAnswer(ok);
  }

  function giveUp() {
    if (result) return;
    setResult('wrong');
    onAnswer(false);
  }

  return (
    <>
      <div className="quiz-q">
        <div className="q-label">Type the word for</div>
        <div className="q-word en-mode">{gloss(word)}</div>
        {word.g ? <div className="q-hint">{D(word.g).replace(D(word.hw), '…')}</div> : null}
      </div>
      <input
        ref={inputRef}
        className={`type-input${result ? ` ${result}` : ''}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') check();
        }}
        disabled={!!result}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck="false"
        placeholder={`${S('typeHere')}…`}
        enterKeyHint="done"
        aria-label="Type the word"
      />
      <div className="type-answer">{result === 'wrong' ? answerLine : null}</div>
      <div className="btn-row">
        <button type="button" className="btn quiet" onClick={giveUp} disabled={!!result}>
          Show answer
        </button>
        <button type="button" className="btn accent" onClick={check} disabled={!!result}>
          Check
        </button>
      </div>
    </>
  );
}

function Done({ right, total, onExit, onAgain }) {
  const pct = Math.round((right / total) * 100);
  const verdict = pct === 100 ? S('perfect') : pct >= 70 ? S('good') : S('tryAgain');
  const sub = pct === 100 ? 'A flawless round.' : pct >= 70 ? 'Keep the streak alive.' : 'Go again?';
  const Icon = pct === 100 ? TrophyIcon : pct >= 70 ? SparklesIcon : BookOpenIcon;

  return (
    <div className="session-done">
      <div className="d-icon">
        <Icon />
      </div>
      <div className="d-title">{verdict}</div>
      <div className="d-sub">
        {right} of {total} correct · {sub}
      </div>
      <div className="btn-row done-actions">
        <button type="button" className="btn quiet" onClick={onExit}>
          Done
        </button>
        <button type="button" className="btn accent" onClick={onAgain}>
          Practice again
        </button>
      </div>
    </div>
  );
}

export function Session({ mode, options, onBackToMenu, onExitToToday }) {
  const deck = useMemo(() => buildDeck(options), [mode, options]);
  const [i, setI] = useState(0);
  const [right, setRight] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  if (!deck.length) return null;

  function answer(ok) {
    db.recordReview(deck[i].id, ok);
    if (ok) setRight((r) => r + 1);
    timerRef.current = setTimeout(() => setI((n) => n + 1), ok ? 650 : 1400);
  }

  if (i >= deck.length) {
    return (
      <Done right={right} total={deck.length} onExit={onExitToToday} onAgain={onBackToMenu} />
    );
  }

  const item = deck[i];
  const progress = Math.round((i / deck.length) * 100);
  const Body = mode === 'flash' ? Flash : mode === 'type' ? TypeIt : Choice;

  return (
    <>
      <div className="session-top">
        <button type="button" className="close" onClick={onBackToMenu}>
          Close
        </button>
        <ProgressBar value={progress} label="Session progress" className="session-progress" />
        <span className="session-count">
          {i + 1}/{deck.length}
        </span>
      </div>
      <Body key={item.id} item={item} onAnswer={answer} />
    </>
  );
}
