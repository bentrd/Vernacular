import { useEffect, useState } from 'react';
import * as db from '../store.js';
import { useStore } from '../useStore.js';
import { Sheet } from '../ui/Sheet.jsx';
import { Group } from '../ui/Row.jsx';
import { toast } from '../ui/toast.js';
import { CheckIcon, ChevronIcon, SpinnerIcon } from '../icons.jsx';

export function LanguageSheet({ open, onOpenChange, onSwitched }) {
  useStore();
  const [index, setIndex] = useState([]);
  const [pending, setPending] = useState(null);
  const active = db.getState().activeLang;

  useEffect(() => {
    if (!open) return;
    let live = true;
    db.loadIndex()
      .then((i) => live && setIndex(i))
      .catch(() => live && toast('Could not load the language list'));
    return () => {
      live = false;
    };
  }, [open]);

  // Dictionary packs are 1-4 MB, so switching can take a few seconds on a phone.
  // The old sheet gave no feedback at all during that wait, which is exactly
  // why tapping a language read as "nothing happens".
  async function pick(code) {
    if (pending) return;
    if (code === active) {
      onOpenChange(false);
      return;
    }
    setPending(code);
    try {
      await db.activatePack(code);
      onSwitched?.(code);
      onOpenChange(false);
    } catch {
      toast('Could not load that language pack');
    } finally {
      setPending(null);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        // Don't let a swipe or backdrop press strand a half-finished switch.
        if (pending && !next) return;
        onOpenChange(next);
      }}
      title="Languages"
      description="Your library, streak, and goal are tracked separately per language."
    >
      <Group className="lang-group">
        {index.map((p) => {
          const isActive = p.code === active;
          const isPending = pending === p.code;
          return (
            <button
              key={p.code}
              type="button"
              className="setting-row lang-row"
              data-code={p.code}
              onClick={() => pick(p.code)}
              disabled={!!pending && !isPending}
              aria-current={isActive ? 'true' : undefined}
              aria-busy={isPending || undefined}
            >
              <span className="s-main">
                <span className="s-title">{p.native}</span>
                <span className="s-sub">
                  {isPending
                    ? `Loading ${p.name} dictionary…`
                    : `${p.name} · ${db.wordCountFor(p.code)} of ${p.count} words collected`}
                </span>
              </span>
              <span className={isActive ? 'lang-check' : 's-value'}>
                {isPending ? <SpinnerIcon /> : isActive ? <CheckIcon /> : <ChevronIcon />}
              </span>
            </button>
          );
        })}
      </Group>
    </Sheet>
  );
}
