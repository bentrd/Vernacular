import * as db from '../store.js';
import { glossFirst } from '../lang.js';

const D = (s) => db.display(s);

const ordered = (w) => (glossFirst() === 'fr' ? [w.fr, w.en] : [w.en, w.fr]);

export const gloss = (w) => ordered(w).filter(Boolean).join(' · ');

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
          {(() => {
            const [first, second] = ordered(word);
            return (
              <>
                {first ? <span className="w-en">{first}</span> : null}
                {second ? <span className={first ? 'w-fr' : 'w-en'}>{second}</span> : null}
              </>
            );
          })()}
          {word.ex ? (
            <span className="w-ex">
              <span className="la">“{D(word.ex)}”</span>
              {glossFirst() === 'fr' ? (
                <>
                  <span className="fr">{word.exFr}</span>
                  <span className="en">{word.exEn}</span>
                </>
              ) : (
                <>
                  <span className="en">{word.exEn}</span>
                  <span className="fr">{word.exFr}</span>
                </>
              )}
            </span>
          ) : null}
        </span>
      ) : null}
      {veiled ? <span className="reveal-hint">Tap to reveal meaning</span> : null}
    </Tag>
  );
}
