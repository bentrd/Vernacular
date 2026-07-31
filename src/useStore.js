import { useSyncExternalStore } from 'react';
import * as db from './store.js';

// Every screen reads straight off the store module; this just re-renders them
// whenever it changes. `save()` is the single write path, so one hook covers all.
export function useStore() {
  return useSyncExternalStore(db.subscribe, db.getRevision, db.getRevision);
}
