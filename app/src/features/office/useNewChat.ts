/* The New chat pill's tap (design/new-chat, After tap): Starting… → done, refused (409: the server's reason
   for a moment, until the running data catches up) or failed (back to SHINING without replaying the sweep). */
import { useEffect, useRef, useState } from 'react';
import { invalidate, isApiError } from '../../api';
import { runningKey } from '../running/api';
import { keys, officeApi } from './api';
import type { NewChatPillProps } from './NewChatPill';
import type { NewChatLook } from './new-chat';

/** How long a 409's reason wins over the (polled) running data. */
const REFUSED_MS = 5000;

type Phase = { kind: 'starting' } | { kind: 'refused'; reason: string } | { kind: 'failed' } | null;

export type NewChatOutcome = 'started' | 'refused' | 'failed';

export function useNewChat(p: {
  pid: string;
  agentId: string;
  look: NewChatLook;
  onStarted: () => void;
  onFailed: () => void;
}): Pick<NewChatPillProps, 'state' | 'reason' | 'quiet'> & { start: () => Promise<NewChatOutcome> } {
  const [phase, setPhase] = useState<Phase>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  /* a failed start stays quiet only while it keeps shining; the next time it lights up, it sweeps */
  useEffect(() => {
    if (p.look.state !== 'shining') setPhase((ph) => (ph?.kind === 'failed' ? null : ph));
  }, [p.look.state]);

  const start = async (): Promise<NewChatOutcome> => {
    setPhase({ kind: 'starting' });
    try {
      await officeApi.newChat(p.pid, p.agentId);
      setPhase(null);
      p.onStarted();
      return 'started';
    } catch (e) {
      const why =
        isApiError(e) && e.status === 409 ? (e.details as { reason?: string } | undefined) : undefined;
      if (why?.reason) {
        setPhase({ kind: 'refused', reason: why.reason });
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setPhase(null), REFUSED_MS);
        void invalidate(runningKey(p.pid));
        return 'refused';
      }
      if (isApiError(e) && e.status === 409) {
        /* chat_empty: it was already started fresh elsewhere — read the (empty) chat again */
        setPhase(null);
        void invalidate(keys.thread(p.pid, p.agentId));
        return 'refused';
      }
      setPhase({ kind: 'failed' });
      p.onFailed();
      return 'failed';
    }
  };

  if (phase?.kind === 'starting') return { state: 'starting', start };
  if (phase?.kind === 'refused') return { state: 'disabled', reason: phase.reason, start };
  return { ...p.look, quiet: phase?.kind === 'failed', start };
}
