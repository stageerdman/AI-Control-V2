/* Tap an agent in the room → what they did, in their own words: name, the task line, the recap.
   One action: Open chat (hidden when there's nowhere to open it). Read fresh every time it opens. */
import { useEffect } from 'react';
import { useQuery } from '../../api';
import { Button, Sheet } from '../../ui';
import { relWhen } from '../reports';
import { type ChatSummary, keys, officeApi } from './api';

export const RECAP_COPY = {
  loading: 'Thinking back…',
  empty: 'Nothing to tell yet. I haven’t finished a task.',
  error: 'Couldn’t remember just now',
  working: 'Still working',
};

type Props = {
  /** The office's project: the recap is of their work here, never elsewhere. */
  pid: string;
  agentId: string | null;
  /** Their full name (the heading). */
  name: string;
  /** Open their chat; omitted = no Open chat action. */
  onOpenChat?: (chat: ChatSummary | null) => void;
};

export function RecapSheet({ open, onClose, ...p }: Props & { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open && !!p.agentId} onClose={onClose} label={`What ${p.name} did`} className="rc">
      {open && p.agentId && <RecapBody {...p} agentId={p.agentId} />}
    </Sheet>
  );
}

export function RecapBody({ pid, agentId, name, onOpenChat }: Props & { agentId: string }) {
  const q = useQuery(keys.recap(pid, agentId), () => officeApi.recap(pid, agentId));
  const { refetch } = q;
  // biome-ignore lint/correctness/useExhaustiveDependencies: read fresh once, when the sheet opens
  useEffect(() => {
    void refetch().catch(() => undefined);
  }, []);

  const chat = q.data?.chat ?? null;
  const words = q.data ? (q.data.recap ?? chat?.lastText ?? null) : null;
  const working = chat?.status === 'running';
  const action = onOpenChat && q.data && (
    <div className="lf-foot">
      <Button variant="hero" onClick={() => onOpenChat(chat)}>
        Open chat
      </Button>
    </div>
  );

  return (
    <div className="lf">
      <h2>{name}</h2>
      {chat && (
        <p className="rc-task">
          <span className="rc-task-t">{chat.task}</span>
          <span className="rc-meta">
            {working ? (
              <span className="rc-tag">{RECAP_COPY.working}</span>
            ) : (
              relWhen(chat.endedAt ?? chat.startedAt, new Date())
            )}
          </span>
        </p>
      )}
      <div aria-live="polite" aria-busy={!q.data && q.fetching}>
        {!q.data && q.fetching ? (
          <div className="rc-think">
            <p className="rc-think-l">{RECAP_COPY.loading}</p>
            <span className="rc-line" aria-hidden="true" />
            <span className="rc-line" aria-hidden="true" />
            <span className="rc-line short" aria-hidden="true" />
          </div>
        ) : !q.data ? (
          <div className="rp-error" role="alert">
            <span>{RECAP_COPY.error}</span>
            <Button onClick={() => void refetch()}>Try again</Button>
          </div>
        ) : words ? (
          <p className="rc-recap">{words}</p>
        ) : (
          <p className="rp-empty">{working ? 'Just getting started.' : RECAP_COPY.empty}</p>
        )}
      </div>
      {action}
    </div>
  );
}
