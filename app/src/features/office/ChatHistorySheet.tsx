/* An agent's saved chats: open one, read it like a Claude chat, keep writing.
   Opens on the chat it's given (Open chat in the recap); a quiet All chats link shows the others.
   One action: the composer pinned at the bottom (Enter sends, Shift+Enter = new line). A running
   chat has no composer — you can't write into a live run. */
import { type FormEvent, type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { invalidate, isApiError, setQueryData, useQuery } from '../../api';
import { Button, Sheet } from '../../ui';
import { Markdown, relWhen } from '../reports';
import { type ChatMessage, type ChatSummary, keys, officeApi } from './api';
import './chat-history.css';

export const CHAT_COPY = {
  allChats: 'All chats',
  listLoading: 'Finding their chats…',
  listEmpty: 'No chats yet. They haven’t finished a task.',
  listError: 'Couldn’t load their chats',
  loading: 'Opening the chat…',
  empty: 'Nothing was saved in this chat.',
  error: 'Couldn’t open this chat',
  working: 'Still working',
  workingNote: 'They’re still on this task. You can write here when they’re done.',
  tools: 'Used tools',
  sendFailed: 'They couldn’t answer just now.',
  running: 'They’re still working in this chat.',
  offline: 'Couldn’t send. Check the studio is running.',
};

const STATUS_TAG: Record<ChatSummary['status'], string | null> = {
  running: CHAT_COPY.working,
  succeeded: null,
  failed: 'Didn’t finish',
  cancelled: 'Stopped',
};

type Props = {
  agentId: string | null;
  /** Their full name (heading, labels). */
  name: string;
  /** The chat to open; null = start on All chats. */
  chat: ChatSummary | null;
};

export function ChatHistorySheet({ open, onClose, ...p }: Props & { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open && !!p.agentId} onClose={onClose} label={`${p.name}’s chats`} wide className="ch">
      {open && p.agentId && <ChatHistoryBody {...p} agentId={p.agentId} />}
    </Sheet>
  );
}

export function ChatHistoryBody({ agentId, name, chat }: Props & { agentId: string }) {
  const [current, setCurrent] = useState<ChatSummary | null>(chat);
  return current ? (
    <ChatView
      key={current.runId}
      agentId={agentId}
      name={name}
      chat={current}
      onBack={() => setCurrent(null)}
    />
  ) : (
    <ChatList agentId={agentId} name={name} onOpen={setCurrent} />
  );
}

/* ---------- All chats: task, when, status */

function ChatList({
  agentId,
  name,
  onOpen,
}: {
  agentId: string;
  name: string;
  onOpen: (c: ChatSummary) => void;
}) {
  const q = useQuery(keys.chats(agentId), () => officeApi.listAgentChats(agentId));
  const { refetch } = q;
  // biome-ignore lint/correctness/useExhaustiveDependencies: read fresh once, when the list shows
  useEffect(() => {
    void refetch().catch(() => undefined);
  }, []);
  const now = new Date();
  return (
    <div className="ch-body">
      <h2>{name}</h2>
      <p className="ch-sub">{CHAT_COPY.allChats}</p>
      <div className="ch-scroll" aria-busy={!q.data && q.fetching}>
        {!q.data && q.fetching ? (
          <Placeholder label={CHAT_COPY.listLoading} />
        ) : !q.data ? (
          <ErrorRow text={CHAT_COPY.listError} onRetry={() => void refetch()} />
        ) : q.data.length === 0 ? (
          <p className="rp-empty">{CHAT_COPY.listEmpty}</p>
        ) : (
          <ul className="ch-list">
            {q.data.map((c) => {
              const tag = STATUS_TAG[c.status];
              return (
                <li key={c.runId}>
                  <button type="button" className="ch-row" onClick={() => onOpen(c)}>
                    <span className="ch-row-t">{c.task}</span>
                    <span className="ch-meta">
                      {relWhen(c.endedAt ?? c.startedAt, now)}
                      {tag && <span className="rc-tag">{tag}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ---------- One chat: read it, keep writing */

type Line = { kind: 'msg'; m: ChatMessage } | { kind: 'tools'; key: string; lines: ChatMessage[] };

/** Tool and system lines in a row fold into one quiet 'Used tools' line. */
export function foldLines(messages: readonly ChatMessage[]): Line[] {
  const out: Line[] = [];
  for (const m of messages) {
    if (m.role === 'user' || m.role === 'assistant') {
      out.push({ kind: 'msg', m });
      continue;
    }
    const last = out[out.length - 1];
    if (last?.kind === 'tools') last.lines.push(m);
    else out.push({ kind: 'tools', key: m.id, lines: [m] });
  }
  return out;
}

const sendError = (e: unknown) => {
  if (isApiError(e) && e.code === 'chat_running') return CHAT_COPY.running;
  if (isApiError(e) && e.code === 'network') return CHAT_COPY.offline;
  return CHAT_COPY.sendFailed;
};

function ChatView({
  agentId,
  name,
  chat,
  onBack,
}: {
  agentId: string;
  name: string;
  chat: ChatSummary;
  onBack: () => void;
}) {
  const q = useQuery(keys.chat(chat.runId), () => officeApi.getChatMessages(chat.runId));
  const { refetch } = q;
  const [status, setStatus] = useState(chat.status);
  const [text, setText] = useState('');
  /** My line while they answer. */
  const [mine, setMine] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const running = status === 'running';

  // biome-ignore lint/correctness/useExhaustiveDependencies: read fresh once, when the chat opens
  useEffect(() => {
    void refetch().catch(() => undefined);
  }, []);
  // the composer is the one action: put the cursor there (after the Sheet's own first-focus)
  useEffect(() => {
    if (running) return;
    const t = setTimeout(() => box.current?.focus({ preventScroll: true }), 80);
    return () => clearTimeout(t);
  }, [running]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll to the newest line whenever one lands
  useLayoutEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [q.data?.length, mine, error]);

  const send = async () => {
    const v = text.trim();
    if (!v || mine !== null) return box.current?.focus();
    setText('');
    setError(null);
    setMine(v);
    try {
      const { sent, reply } = await officeApi.sendChatMessage(chat.runId, v);
      setQueryData<ChatMessage[]>(keys.chat(chat.runId), (prev) => [...(prev ?? []), sent, reply]);
      void invalidate(keys.chats(agentId));
      void invalidate(keys.recap(agentId));
    } catch (e) {
      setText((t) => t || v);
      setError(sendError(e));
      if (isApiError(e) && e.code === 'chat_running') setStatus('running');
    } finally {
      setMine(null);
      box.current?.focus({ preventScroll: true });
    }
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send();
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    void send();
  };

  const tag = STATUS_TAG[status];
  const lines = q.data ? foldLines(q.data) : [];

  return (
    <div className="ch-body ch-chat">
      <div className="ch-head">
        <button type="button" className="ch-back" onClick={onBack}>
          <span aria-hidden="true">‹ </span>
          {CHAT_COPY.allChats}
        </button>
        <h2>{name}</h2>
        <p className="rc-task">
          <span className="rc-task-t">{chat.task}</span>
          <span className="rc-meta">
            {relWhen(chat.endedAt ?? chat.startedAt, new Date())}
            {tag && <span className="rc-tag">{tag}</span>}
          </span>
        </p>
      </div>

      {!q.data && q.fetching ? (
        <div className="ch-scroll" aria-busy="true">
          <Placeholder label={CHAT_COPY.loading} />
        </div>
      ) : !q.data ? (
        <div className="ch-scroll">
          <ErrorRow text={CHAT_COPY.error} onRetry={() => void refetch()} />
        </div>
      ) : (
        <div className="ch-log" role="log" aria-live="polite" aria-label={`Chat with ${name}`} ref={log}>
          {lines.length === 0 && !mine && <p className="rp-empty">{CHAT_COPY.empty}</p>}
          {lines.map((l) =>
            l.kind === 'tools' ? (
              <details key={l.key} className="ch-tools">
                <summary>
                  {CHAT_COPY.tools}
                  <span className="ch-n">{l.lines.length}</span>
                </summary>
                <ul>
                  {l.lines.map((t) => (
                    <li key={t.id}>{t.text}</li>
                  ))}
                </ul>
              </details>
            ) : l.m.role === 'user' ? (
              <div key={l.m.id} className="ch-msg me">
                <span className="sr-only">You: </span>
                {l.m.text}
              </div>
            ) : (
              <div key={l.m.id} className="ch-msg them">
                <span className="sr-only">{name}: </span>
                <Markdown source={l.m.text} />
              </div>
            ),
          )}
          {mine && (
            <>
              <div className="ch-msg me">
                <span className="sr-only">You: </span>
                {mine}
              </div>
              <div className="ch-thinking">
                <span className="sr-only">{name} is thinking</span>
                <span className="ch-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            </>
          )}
          {error && (
            <div className="ch-err" role="alert">
              <span>{error}</span>
              {!running && (
                <Button small onClick={() => void send()}>
                  Retry
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {running ? (
        <p className="ch-working">
          <span className="rc-tag">{CHAT_COPY.working}</span>
          {CHAT_COPY.workingNote}
        </p>
      ) : (
        q.data && (
          <form className="ch-composer" onSubmit={onSubmit}>
            <textarea
              ref={box}
              rows={1}
              aria-label={`Message ${name}`}
              placeholder={`Message ${name}…`}
              value={text}
              maxLength={8000}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKey}
            />
            <Button variant="hero" type="submit" disabled={mine !== null}>
              Send
            </Button>
          </form>
        )
      )}
    </div>
  );
}

/* ---------- shared bits */

function Placeholder({ label }: { label: string }) {
  return (
    <div className="rc-think">
      <p className="rc-think-l">{label}</p>
      <span className="rc-line" aria-hidden="true" />
      <span className="rc-line" aria-hidden="true" />
      <span className="rc-line short" aria-hidden="true" />
    </div>
  );
}

function ErrorRow({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div className="rp-error" role="alert">
      <span>{text}</span>
      <Button onClick={onRetry}>Try again</Button>
    </div>
  );
}
