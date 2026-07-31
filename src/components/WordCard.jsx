import * as db from '../store.js';

const D = (s) => db.display(s);

export const gloss = (w) => [w.en, w.fr].filter(Boolean).join(' · ');

export function WordCard({ word, veiled = false, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`card wordcard${veiled ? ' veiled' : ''}${onClick ? ' tappable' : ''}`}
      onClick={onClick}
    >
      <span className="w-la">{D(word.hw)}</span>
      {word.rom ? <span className="w-rom">{word.rom}</span> : null}
      {word.g ? <span className="w-g">{D(word.g)}</span> : null}
      {word.pos ? <span className="w-pos">{word.pos}</span> : null}
      {!veiled ? (
        <span className="hidden-part">
          {word.en ? <span className="w-en">{word.en}</span> : null}
          {word.fr ? <span className={word.en ? 'w-fr' : 'w-en'}>{word.fr}</span> : null}
          {word.ex ? (
            <span className="w-ex">
              <span className="la">“{D(word.ex)}”</span>
              <span className="en">{word.exEn}</span>
              <span className="fr">{word.exFr}</span>
            </span>
          ) : null}
        </span>
      ) : null}
      {veiled ? <span className="reveal-hint">Tap to reveal meaning</span> : null}
    </Tag>
  );
}
