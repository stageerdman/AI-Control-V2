/* An agent's saved chats: open one, read it like a Claude chat, keep writing.
   The app uses ChatList + ChatView inside the chat panel's History (Panel.tsx owns that flow);
   the sheet wrapper below is kept only for its own tests.
   One action: the composer pinned at the bottom (Enter sends, Shift+Enter = new line). A running
   chat has no composer — you can't write into a live run. */
import {
  type FormEvent,
  Fragment,
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
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
  /* history in the chat panel (spec-ux-chat-history §2) */
  historyTitle: 'History',
  backToChat: 'Back to chat',
  current: 'Current chat',
  now: 'Now',
  needsYou: '❗ Needs you',
  emptyTitle: (short: string) => `No past chats with ${short} yet`,
  emptyBody: 'When they finish a task, it’ll show up here.',
  continuePh: 'Continue this chat…',
  pastDivider: 'past chat',
  startIt: 'Start it',
  starting: 'Starting…',
};

/** Plain text from a little markdown: no marks, no link targets, one line. */
export const plain = (s: string) =>
  s
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_`~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const DAY = 86_400_000;
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const daysAgo = (d: Date, now: Date) => Math.round((dayStart(now) - dayStart(d)) / DAY);

/** Day group label: Today · Yesterday · Tuesday (this week) · Nov 3 · Nov 3, 2025. */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const n = daysAgo(d, now);
  if (n <= 0) return 'Today';
  if (n === 1) return 'Yesterday';
  if (n < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/** Row time: 2:14 pm today or yesterday, else the usual relative day. */
export function rowWhen(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (daysAgo(d, now) > 1) return relWhen(iso, now);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
}

const STATUS_TAG: Record<ChatSummary['status'], string | null> = {
  running: CHAT_COPY.working,
  succeeded: null,
  failed: 'Didn’t finish',
  cancelled: 'Stopped by you',
};

type Props = {
  /** The project whose chats these are: an agent's chats elsewhere never show here. */
  pid: string;
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

export function ChatHistoryBody({ pid, agentId, name, chat }: Props & { agentId: string }) {
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
    <ChatList pid={pid} agentId={agentId} name={name} onOpen={setCurrent} />
  );
}

/* ---------- All chats: task, when, status */

export type CurrentRow = { preview: string | null; needsYou: boolean; onSelect: () => void };

export function ChatList({
  pid,
  agentId,
  name,
  onOpen,
  current,
}: {
  pid: string;
  agentId: string;
  name: string;
  onOpen: (c: ChatSummary) => void;
  /** In the chat panel: the live chat pinned on top; the list groups by day with previews. */
  current?: CurrentRow;
}) {
  const q = useQuery(keys.chats(pid, agentId), () => officeApi.listAgentChats(pid, agentId));
  const { refetch } = q;
  // biome-ignore lint/correctness/useExhaustiveDependencies: read fresh once, when the list shows
  useEffect(() => {
    void refetch().catch(() => undefined);
  }, []);
  const now = new Date();
  if (current) return <PanelList q={q} name={name} onOpen={onOpen} current={current} now={now} />;
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

/* ---------- History in the chat panel: Current chat pinned, then day groups, newest first */

/** One past chat in the panel's History: an agent's run, or a closed window of the director's thread. */
export type HistoryRow = {
  id: string;
  title: string;
  lastText: string | null;
  /** When it ended (ISO): groups by day, sorts newest first. */
  at: string;
  /** After the time: a status tag, or "· 14 messages". */
  tag?: string | null;
  extra?: string;
};
export type HistoryQuery = { data?: HistoryRow[]; fetching: boolean; refetch: () => Promise<void> };

const rowOfRun = (c: ChatSummary): HistoryRow => ({
  id: c.runId,
  title: c.task,
  lastText: c.lastText,
  at: c.endedAt ?? c.startedAt,
  tag: STATUS_TAG[c.status],
});
function PanelList({
  q,
  name,
  onOpen,
  current,
  now,
}: {
  q: { data?: ChatSummary[]; fetching: boolean; refetch: () => Promise<void> };
  name: string;
  onOpen: (c: ChatSummary) => void;
  current: CurrentRow;
  now: Date;
}) {
  const rows = q.data?.map(rowOfRun);
  const open = (id: string) => {
    const c = q.data?.find((x) => x.runId === id);
    if (c) onOpen(c);
  };
  return <HistoryList q={{ ...q, data: rows }} name={name} onOpen={open} current={current} now={now} />;
}

/** Current chat pinned on top, then the past chats grouped by day, newest first. */
export function HistoryList({
  q,
  name,
  onOpen,
  current,
  now,
  emptyBody = CHAT_COPY.emptyBody,
}: {
  q: HistoryQuery;
  name: string;
  onOpen: (id: string) => void;
  current: CurrentRow;
  now: Date;
  emptyBody?: string;
}) {
  const runs = [...(q.data ?? [])].sort((a, b) => b.at.localeCompare(a.at));
  const groups: { label: string; runs: HistoryRow[] }[] = [];
  for (const c of runs) {
    const label = dayLabel(c.at, now);
    const g = groups[groups.length - 1];
    if (g?.label === label) g.runs.push(c);
    else groups.push({ label, runs: [c] });
  }
  const preview = current.preview ? plain(current.preview) : '';
  return (
    <div className="ch-body ch-panel">
      <div className="ch-scroll" aria-busy={!q.data && q.fetching}>
        <ul className="ch-list">
          <li>
            <button
              type="button"
              className="ch-row ch-current"
              data-testid="history-current"
              onClick={current.onSelect}
            >
              <span className="ch-row-top">
                <span className={current.needsYou ? 'ch-tag ch-tag-ask' : 'ch-tag ch-tag-now'}>
                  {current.needsYou ? CHAT_COPY.needsYou : CHAT_COPY.now}
                </span>
                <span className="ch-row-t">{CHAT_COPY.current}</span>
              </span>
              {preview && <span className="ch-prev">{preview}</span>}
            </button>
          </li>
          {groups.map((g) => (
            <Fragment key={g.label}>
              <li role="presentation">
                <h3 className="ch-sub ch-day">{g.label}</h3>
              </li>
              {g.runs.map((c) => {
                const text = c.lastText ? plain(c.lastText) : '';
                return (
                  <li key={c.id}>
                    <button type="button" className="ch-row" data-run={c.id} onClick={() => onOpen(c.id)}>
                      <span className="ch-row-t">{c.title}</span>
                      {text && <span className="ch-prev">{text}</span>}
                      <span className="ch-meta">
                        {rowWhen(c.at, now)}
                        {c.extra}
                        {c.tag && <span className="rc-tag">{c.tag}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </Fragment>
          ))}
        </ul>
        {!q.data && q.fetching ? (
          <Placeholder label={CHAT_COPY.listLoading} />
        ) : !q.data ? (
          <ErrorRow text={CHAT_COPY.listError} onRetry={() => void q.refetch()} />
        ) : (
          runs.length === 0 && (
            <div className="ch-empty" data-testid="history-empty">
              <span className="ch-empty-i" aria-hidden="true">
                🕘
              </span>
              <p className="ch-empty-t">{CHAT_COPY.emptyTitle(name)}</p>
              <p className="ch-empty-b">{emptyBody}</p>
              <Button variant="hero" onClick={current.onSelect}>
                {CHAT_COPY.backToChat}
              </Button>
            </div>
          )
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

/** Replies whose offered work ("Start it") hasn't been started yet, by seq. */
export function openOffers(messages: readonly ChatMessage[]): Set<number> {
  const started = new Set(
    messages
      .map((m) => (m.meta?.started as { offer?: number } | undefined)?.offer)
      .filter((s) => s !== undefined),
  );
  return new Set(messages.filter((m) => m.meta?.offer && !started.has(m.seq)).map((m) => m.seq));
}

/** One tap: the offered work goes on the whiteboard for them; the chat gains their "On the whiteboard now" line. */
function StartIt({ chat, seq }: { chat: ChatSummary; seq: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const { message } = await officeApi.startChatWork(chat.projectId, chat.runId, seq);
      setQueryData<ChatMessage[]>(keys.chat(chat.projectId, chat.runId), (prev) => [
        ...(prev ?? []),
        message,
      ]);
    } catch (e) {
      setError(isApiError(e) && e.code !== 'network' ? e.message : CHAT_COPY.offline);
      setBusy(false);
    }
  };
  return (
    <div className="ch-start">
      <Button small variant="hero" disabled={busy} onClick={() => void start()}>
        {busy ? CHAT_COPY.starting : CHAT_COPY.startIt}
      </Button>
      {error && <span role="alert">{error}</span>}
    </div>
  );
}

const sendError = (e: unknown) => {
  if (isApiError(e) && e.code === 'chat_running') return CHAT_COPY.running;
  if (isApiError(e) && e.code === 'network') return CHAT_COPY.offline;
  return CHAT_COPY.sendFailed;
};

export function ChatView({
  agentId,
  name,
  chat,
  onBack,
  inPanel,
}: {
  agentId: string;
  name: string;
  chat: ChatSummary;
  onBack: () => void;
  /** In the chat panel: its nav bar is the way back and its header says who. */
  inPanel?: boolean;
}) {
  const pid = chat.projectId;
  const q = useQuery(keys.chat(pid, chat.runId), () => officeApi.getChatMessages(pid, chat.runId));
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
      const { sent, reply } = await officeApi.sendChatMessage(pid, chat.runId, v);
      setQueryData<ChatMessage[]>(keys.chat(pid, chat.runId), (prev) => [...(prev ?? []), sent, reply]);
      void invalidate(keys.chats(pid, agentId));
      void invalidate(keys.recap(pid, agentId));
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
  const offers = openOffers(q.data ?? []);

  return (
    <div className={`ch-body ch-chat${inPanel ? ' ch-panel' : ''}`}>
      <div className="ch-head">
        {!inPanel && (
          <>
            <button type="button" className="ch-back" onClick={onBack}>
              <span aria-hidden="true">‹ </span>
              {CHAT_COPY.allChats}
            </button>
            <h2>{name}</h2>
          </>
        )}
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
          {inPanel && (
            <p className="ch-divider">
              <span>{CHAT_COPY.pastDivider}</span>
            </p>
          )}
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
              <Fragment key={l.m.id}>
                <div className="ch-msg them">
                  <span className="sr-only">{name}: </span>
                  <Markdown source={l.m.text} />
                </div>
                {!running && offers.has(l.m.seq) && <StartIt chat={chat} seq={l.m.seq} />}
              </Fragment>
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
              aria-label={inPanel ? `Continue this chat with ${name}` : `Message ${name}`}
              placeholder={inPanel ? CHAT_COPY.continuePh : `Message ${name}…`}
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

export function Placeholder({ label }: { label: string }) {
  return (
    <div className="rc-think">
      <p className="rc-think-l">{label}</p>
      <span className="rc-line" aria-hidden="true" />
      <span className="rc-line" aria-hidden="true" />
      <span className="rc-line short" aria-hidden="true" />
    </div>
  );
}

export function ErrorRow({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div className="rp-error" role="alert">
      <span>{text}</span>
      <Button onClick={onRetry}>Try again</Button>
    </div>
  );
}
