import { useMemo, useState } from 'react';
import * as db from '../store.js';
import { useStore } from '../useStore.js';
import { D, S, fold } from '../lang.js';
import { gloss } from '../components/WordCard.jsx';
import { SearchField } from '../ui/SearchField.jsx';
import { FilterChips } from '../ui/FilterChips.jsx';
import { BookOpenIcon } from '../icons.jsx';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'learning', label: 'Learning' },
  { value: 'mastered', label: 'Mastered' },
];

function WordRow({ id, word, entry, onOpen }) {
  return (
    <button type="button" className="wordrow" onClick={() => onOpen(id)}>
      <span className={`status-dot ${entry ? db.statusOf(entry) : 'locked'}`} />
      <span className="wr-main">
        <span className="wr-la">
          {D(word.hw)}
          {word.rom ? <span className="wr-rom"> {word.rom}</span> : null}
        </span>
        <span className="wr-en">{gloss(word)}</span>
      </span>
    </button>
  );
}

export function Library({ onOpenWord }) {
  const revision = useStore();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const c = db.counts();

  const { entries, dictMatches } = useMemo(() => {
    const q = fold(query);
    let list = db.dictEntries();
    if (filter !== 'all') list = list.filter((x) => db.statusOf(x.entry) === filter);
    if (q) {
      list = list.filter(
        ({ word }) =>
          fold(word.hw).includes(q) ||
          (word.en && word.en.toLowerCase().includes(q)) ||
          (word.fr && fold(word.fr).includes(q)) ||
          (word.rom && fold(word.rom).includes(q))
      );
    }
    list.sort((a, b) => fold(a.word.hw).localeCompare(fold(b.word.hw)));
    const dict = q ? db.searchDictionary(q, 50).filter((w) => !db.langState().dict[w.id]) : [];
    return { entries: list, dictMatches: dict };
    // `revision` is the store's change signal; results depend on it.
  }, [query, filter, revision]);

  return (
    <>
      <div className="eyebrow">{S('libraryEyebrow')}</div>
      <h1 className="title">Library</h1>
      <p className="subtitle">
        {c.total} word{c.total === 1 ? '' : 's'} collected · {c.mastered} mastered
      </p>

      <SearchField value={query} onValueChange={setQuery} label="Search your library" />
      <FilterChips
        value={filter}
        onValueChange={setFilter}
        options={FILTERS}
        label="Filter library"
      />

      {!entries.length && !dictMatches.length ? (
        <div className="card empty spaced">
          <div className="e-icon">
            <BookOpenIcon />
          </div>
          <div className="e-title">{c.total === 0 ? 'Your library is empty' : 'Nothing here'}</div>
          <div className="e-sub">
            {c.total === 0 ? (
              <>
                Learn your first word from the Today tab,
                <br />
                or wait for a notification to arrive.
              </>
            ) : (
              'Try a different search or filter.'
            )}
          </div>
        </div>
      ) : (
        <>
          {entries.length ? (
            <div className="wordlist">
              {entries.map((x) => (
                <WordRow key={x.id} {...x} onOpen={onOpenWord} />
              ))}
            </div>
          ) : null}
          {dictMatches.length ? (
            <>
              <div className="section-label">In the dictionary</div>
              <div className="wordlist">
                {dictMatches.map((w) => (
                  <WordRow key={w.id} id={w.id} word={w} entry={null} onOpen={onOpenWord} />
                ))}
              </div>
            </>
          ) : null}
        </>
      )}
    </>
  );
}
