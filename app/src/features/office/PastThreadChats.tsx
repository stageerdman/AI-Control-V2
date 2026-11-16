/* The director's History (design/new-chat): one row per closed chat of its thread, not one per turn.
   A past chat is for reading — to pick something up, you say it in the new chat. */
import { useEffect } from 'react';
import { useQuery } from '../../api';
import { keys, officeApi, type ThreadChat, type ThreadMessage } from './api';
import { Bubble } from './Bubble';
import {
  CHAT_COPY,
  type CurrentRow,
  ErrorRow,
  HistoryList,
  type HistoryRow,
  Placeholder,
} from './ChatHistorySheet';

export const PAST_COPY = {
  untitled: (who: string) => `Chat with ${who}`,
  emptyBody: 'Start a new chat and this one shows up here.',
  readOnly: 'Past chat. To pick it up, say it in your new chat.',
};

const messagesLabel = (n: number) => ` · ${n === 1 ? '1 message' : `${n} messages`}`;
export const rowOfThreadChat = (c: ThreadChat, who: string): HistoryRow => ({
  id: c.id,
  title: c.title || PAST_COPY.untitled(who),
  lastText: c.lastText,
  at: c.endedAt,
  extra: messagesLabel(c.messageCount),
});

export function ThreadChatList({
  pid,
  agentId,
  name,
  onOpen,
  current,
}: {
  pid: string;
  agentId: string;
  name: string;
  onOpen: (c: ThreadChat) => void;
  current: CurrentRow;
}) {
  const q = useQuery(keys.threadChats(pid, agentId), () => officeApi.threadChats(pid, agentId));
  const { refetch } = q;
  // biome-ignore lint/correctness/useExhaustiveDependencies: read fresh once, when the list shows
  useEffect(() => {
    void refetch().catch(() => undefined);
  }, []);
  const open = (id: string) => {
    const c = q.data?.find((x) => x.id === id);
    if (c) onOpen(c);
  };
  return (
    <HistoryList
      q={{ ...q, data: q.data?.map((c) => rowOfThreadChat(c, name)) }}
      name={name}
      onOpen={open}
      current={current}
      now={new Date()}
      emptyBody={PAST_COPY.emptyBody}
    />
  );
}

export function PastThreadChat({
  pid,
  agentId,
  chat,
  nameOf,
  openReport,
}: {
  pid: string;
  agentId: string;
  chat: ThreadChat;
  /** Who said a line (the agent's full name). */
  nameOf: (from: string) => string;
  openReport: (id: string) => void;
}) {
  const q = useQuery<ThreadMessage[]>(keys.threadChat(pid, agentId, chat.id), () =>
    officeApi.threadChatMessages(pid, agentId, chat.id),
  );
  return (
    <div className="ch-body ch-chat ch-panel">
      {!q.data && q.fetching ? (
        <div className="ch-scroll" aria-busy="true">
          <Placeholder label={CHAT_COPY.loading} />
        </div>
      ) : !q.data ? (
        <div className="ch-scroll">
          <ErrorRow text={CHAT_COPY.error} onRetry={() => void q.refetch()} />
        </div>
      ) : (
        <div className="ch-log op-log" role="log" aria-label={`Past chat with ${nameOf(agentId)}`}>
          <p className="ch-divider">
            <span>{CHAT_COPY.pastDivider}</span>
          </p>
          {q.data.length === 0 && <p className="rp-empty">{CHAT_COPY.empty}</p>}
          {q.data.map((m) => (
            <Bubble
              key={m.id}
              m={m}
              who={m.from === 'user' ? 'You' : nameOf(m.from)}
              openReport={openReport}
            />
          ))}
        </div>
      )}
      <p className="ch-working" data-testid="past-readonly">
        {PAST_COPY.readOnly}
      </p>
    </div>
  );
}
