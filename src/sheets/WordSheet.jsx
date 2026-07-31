import * as db from '../store.js';
import { useStore } from '../useStore.js';
import { Sheet } from '../ui/Sheet.jsx';
import { WordCard } from '../components/WordCard.jsx';
import { toast } from '../ui/toast.js';

const D = (s) => db.display(s);
const BOX_LABELS = ['New', 'I', 'II', 'III', 'IV', 'V', 'VI'];

export function WordSheet({ wordId, onOpenChange }) {
  useStore();
  const open = !!wordId;
  const word = wordId ? db.wordById(wordId) : null;
  const entry = wordId ? db.langState().dict[wordId] : null;
  const status = db.statusOf(entry);

  function close() {
    onOpenChange(false);
  }

  return (
    <Sheet open={open && !!word} onOpenChange={onOpenChange} title={word ? D(word.hw) : ''}>
      {word ? (
        <>
          <WordCard word={word} />
          {entry ? (
            <>
              <div className="stat-grid">
                <div className="stat">
                  <div className="n">{BOX_LABELS[entry.box] ?? entry.box}</div>
                  <div className="l">Level</div>
                </div>
                <div className="stat">
                  <div className="n">{entry.correct}</div>
                  <div className="l">Correct</div>
                </div>
                <div className="stat">
                  <div className="n">{entry.wrong}</div>
                  <div className="l">Missed</div>
                </div>
              </div>
              <div className="btn-row">
                {status !== 'mastered' ? (
                  <button
                    type="button"
                    className="btn quiet"
                    onClick={() => {
                      db.setMastered(wordId);
                      close();
                      toast('Marked as mastered');
                    }}
                  >
                    Mark mastered
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn quiet"
                    onClick={() => {
                      db.resetProgress(wordId);
                      close();
                      toast('Progress reset');
                    }}
                  >
                    Reset progress
                  </button>
                )}
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => {
                    db.removeWord(wordId);
                    close();
                    toast(`“${D(word.hw)}” removed`);
                  }}
                >
                  Remove
                </button>
              </div>
            </>
          ) : (
            <div className="btn-row">
              <button
                type="button"
                className="btn accent full"
                onClick={() => {
                  db.addWord(wordId);
                  close();
                  toast(`“${D(word.hw)}” added to your library`);
                }}
              >
                Add to library
              </button>
            </div>
          )}
        </>
      ) : null}
    </Sheet>
  );
}
