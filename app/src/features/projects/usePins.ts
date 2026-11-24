/* Pin / unpin from the home: optimistic (the card moves at once), saved with PUT /projects/pins,
   rolled back with a toast if that fails. `said` is the polite live-region line; `moved` is the
   project that just changed shelf (its pin gets focus back, its card plays the arrive motion). */
import { useCallback, useState } from 'react';
import { getQueryData, type Project, setQueryData, studio } from '../../api';
import { toast } from '../../ui';
import { pinned, togglePin, withPins } from './model';

const KEY = 'projects';
const order = (ps: Project[]) =>
  ps
    .filter(pinned)
    .sort((a, b) => (a.pinRank ?? 0) - (b.pinRank ?? 0))
    .map((p) => p.id);

export function usePins() {
  const [said, setSaid] = useState('');
  const [moved, setMoved] = useState<{ id: string; n: number } | null>(null);

  const toggle = useCallback(async (id: string) => {
    const before = getQueryData<Project[]>(KEY) ?? [];
    const p = before.find((x) => x.id === id);
    if (!p) return;
    const was = order(before);
    const ids = togglePin(before, id);
    const pinning = ids.includes(id);
    setQueryData<Project[]>(KEY, (cur) => withPins(cur ?? before, ids));
    setMoved((m) => ({ id, n: (m?.n ?? 0) + 1 }));
    setSaid(pinning ? `${p.name} pinned to My Workplace` : `${p.name} unpinned`);
    try {
      setQueryData(KEY, await studio.projects.setPins(ids));
    } catch {
      setQueryData<Project[]>(KEY, (cur) => withPins(cur ?? before, was));
      setMoved((m) => ({ id, n: (m?.n ?? 0) + 1 }));
      setSaid('');
      toast(`Couldn’t ${pinning ? 'pin' : 'unpin'} ${p.name}. Try again.`);
    }
  }, []);

  return { toggle, said, moved };
}
