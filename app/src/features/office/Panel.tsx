/* The chat side panel (prototype office-panel.js, spec-office §3.2–3.4) on the real backend.
   Calm: header + conversation + a text composer. No mic, no office updates, no suggestions.
   One thread per agent (threads API + `thread.message` events); the director is the default; the
   office is the switcher (click a robot). "!" asks arrive as cards in the agent's thread and are
   answered on the asks endpoint. One Send (OFFICE): the director decides — a clear ask becomes a goal on the
   whiteboard (the server posts it, the board follows its events), a question or a maybe gets a reply.
   The director's chat can start fresh (design/new-chat): the New chat pill, or saying "new chat". */
import { type FormEvent, Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { invalidate, isApiError, setQueryData, studio, useQuery } from '../../api';
import { Hero } from '../../characters';
import { Button } from '../../ui';
import type { RunningItem } from '../running/api';
import { type ChatSummary, keys, officeApi, type Thread, type ThreadChat, type ThreadMessage } from './api';
import { aboutTitles, Bubble } from './Bubble';
import { BuiltCard } from './built/BuiltCard';
import { CHAT_COPY, ChatList, ChatView } from './ChatHistorySheet';
import { NewChatPill } from './NewChatPill';
import { asksForNewChat, newChatState } from './new-chat';
import { PastThreadChat, ThreadChatList } from './PastThreadChats';
import { answerByVoice, isRebuildSettled, RebuildCard, UndoLine } from './rebuild/RebuildCard';
import { type Actor, activityOf, mergeMessage, type PendingAsk } from './state';
import { useNewChat } from './useNewChat';

export type PanelAgent = {
  id: string;
  name: string;
  nick?: string | null;
  role?: string;
  look: import('../../api').Look;
};
export type PanelProps = {
  pid: string;
  thread: string;
  director: string;
  agents: Record<string, PanelAgent>;
  teamName: (id: string) => string | null;
  actor: Actor | undefined;
  asks: PendingAsk[];
  /** A follow-up on a report: the next message carries `reportId` (the run gets the report). */
  context: FollowUpContext | null;
  clearContext: () => void;
  open: (id: string) => void;
  openReport: (reportId: string) => void;
  /** An ask answered here (the page drops it from the scene right away). */
  answered: (askId: string) => void;
  onGrab: () => void;
  /** Narrow screens: raise the drawer (History opens on a raised drawer). */
  raise?: () => void;
  /** What runs in the studio now (useRunning): the director's New chat shines only when none of it is here. */
  running?: RunningItem[];
};

/** What the panel body shows under the header (spec-ux-chat-history §1): an agent's run, or a director's past chat. */
export type PanelView = 'live' | 'history' | { run: ChatSummary } | { chat: ThreadChat };
const pastId = (v: { run: ChatSummary } | { chat: ThreadChat }) => ('run' in v ? v.run.runId : v.chat.id);

export const NEW_CHAT_COPY = {
  empty: (who: string) =>
    `New chat. ${who} still sees the board — say what you want built. Your last chat is in History.`,
  started: 'New chat started. Your last chat is in History.',
  failed: 'Couldn’t start a new chat. Try again.',
  alreadyNew: 'This chat is already new — say what you want built.',
  blocked: (reason: string) => `${reason} — I can start fresh when that’s done.`,
};

/** A follow-up on a report (`reportId`), or just a subject (a letter, a team's principles): the message says
    `About “{title}”: …` so the agent knows what it's about. */
export type FollowUpContext = { title: string; reportId?: string };

export const shortOf = (a: { name: string; nick?: string | null } | undefined) =>
  a ? a.nick || a.name.replace(/^(Sir|Dr\.?|The)\s+/i, '').split(/\s+/)[0] : 'them';

/* local lines (answered asks, messages that didn't go through) survive switching threads */
const local = new Map<string, ThreadMessage[]>();
/* threads started fresh in this session: their empty chat says where the last one went */
const restarted = new Set<string>();

/** The director's chat started fresh (here or on `thread.reset`): an empty live chat, the old one in History. */
export function resetThread(pid: string, agentId: string) {
  const lkey = `${pid}:${agentId}`;
  local.delete(lkey);
  restarted.add(lkey);
  setQueryData<Thread>(keys.thread(pid, agentId), { projectId: pid, agentId, busy: false, messages: [] });
  void invalidate(keys.threadChats(pid, agentId));
}
let seq = 0;
const note = (from: string, text: string, kind: 'text' | 'error' = 'text'): ThreadMessage => ({
  id: `local-${++seq}`,
  from,
  kind,
  text,
  runId: null,
  reportId: null,
  at: new Date().toISOString(),
});

export function Panel(p: PanelProps) {
  const { pid, thread: id, director } = p;
  const ag = p.agents[id];
  const isDir = id === director;
  const key = keys.thread(pid, id);
  const t = useQuery<Thread>(key, () => officeApi.thread(pid, id));
  const [text, setText] = useState('');
  const [, bump] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  /* the history view belongs to one agent, so switching agent is back to live at once */
  const [nav, setNav] = useState<{ for: string; view: PanelView }>({ for: id, view: 'live' });
  /* reset during render (not an effect): coming back to an agent never brings back its old history view */
  if (nav.for !== id) setNav({ for: id, view: 'live' });
  const view: PanelView = nav.for === id ? nav.view : 'live';
  const pill = useRef<HTMLButtonElement>(null);
  const hist = useRef<HTMLDivElement>(null);
  /** Where focus goes after the next view change. */
  const focusTo = useRef<'pill' | 'input' | 'first' | { run: string } | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const openedAt = useRef(Date.now());
  const lkey = `${pid}:${id}`;
  const addLocal = (m: ThreadMessage) => {
    local.set(lkey, [...(local.get(lkey) ?? []), m]);
    bump((n) => n + 1);
  };

  const messages = [...(t.data?.messages ?? []), ...(local.get(lkey) ?? [])].sort((a, b) =>
    a.at < b.at ? -1 : a.at > b.at ? 1 : 0,
  );
  const asks = p.asks.filter((a) => a.agentId === id);
  /* a turn waiting on your answer isn't typing: the question card says what it waits for (no dots under it) */
  const typing = !!t.data?.busy && !asks.some((a) => !answers[a.id]);

  const live = view === 'live';
  /** Where the live log was when you left for history (null: at the bottom). */
  const keptScroll = useRef<number | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll to the newest line
  useEffect(() => {
    const el = log.current;
    if (el && live) el.scrollTop = el.scrollHeight;
  }, [messages.length, typing, asks.length, id]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only leaving or coming back to live
  useLayoutEffect(() => {
    const el = log.current;
    if (!el || !live) return;
    /* coming back: land where you left, unless you were at the bottom (then follow new lines) */
    el.scrollTop = keptScroll.current ?? el.scrollHeight;
    keptScroll.current = null;
  }, [live]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new context moves you
  useEffect(() => {
    if (!p.context) return;
    /* a follow-up is written in the live chat */
    if (view !== 'live') {
      focusTo.current = 'input';
      setNav({ for: id, view: 'live' });
    } else input.current?.focus({ preventScroll: true });
  }, [p.context]);

  const short = shortOf(ag);
  const dirShort = shortOf(p.agents[director]);

  /* ---------- history */
  const go = (v: PanelView, focus: typeof focusTo.current) => {
    const el = log.current;
    if (live && v !== 'live' && el)
      keptScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24 ? null : el.scrollTop;
    focusTo.current = focus;
    setNav({ for: id, view: v });
  };
  const openHistory = () => {
    p.raise?.();
    go('history', 'first');
  };
  const backToLive = () => go('live', 'pill');
  const backOne = () => {
    if (view === 'history') backToLive();
    else if (typeof view === 'object') go('history', { run: pastId(view) });
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: after the view swaps in
  useEffect(() => {
    const f = focusTo.current;
    focusTo.current = null;
    if (!f) return;
    if (f === 'pill') return pill.current?.focus({ preventScroll: true });
    if (f === 'input') return input.current?.focus({ preventScroll: true });
    const box = hist.current;
    const row =
      (typeof f === 'object' && box?.querySelector<HTMLElement>(`[data-run="${CSS.escape(f.run)}"]`)) ||
      box?.querySelector<HTMLElement>('.ch-row');
    row?.focus({ preventScroll: true });
  }, [nav]);

  /* a new line in the live thread while you're away: a coral dot on Back to chat, said politely */
  const last = messages[messages.length - 1];
  const seen = useRef<string | undefined>(last?.id);
  const [fresh, setFresh] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the newest line and the view
  useEffect(() => {
    if (view === 'live') {
      seen.current = last?.id;
      setFresh(false);
      if (last) setSaid('');
    } else if (last && last.id !== seen.current) {
      seen.current = last.id;
      if (last.from !== 'user') setFresh(true);
    }
  }, [last?.id, view === 'live', id]);

  /* ---------- New chat (director only) */
  const nameOf = (aid: string) => shortOf(p.agents[aid]);
  const look = newChatState({
    pid,
    director,
    busy: typing,
    running: p.running ?? [],
    asks: p.asks,
    /* saved lines only: a local note (a send that failed) is not a chat to clear */
    messages: t.data?.messages ?? [],
    nameOf,
    settled: isRebuildSettled,
  });
  const [said, setSaid] = useState('');
  const newChat = useNewChat({
    pid,
    agentId: director,
    look,
    onStarted: () => {
      resetThread(pid, director);
      setSaid(NEW_CHAT_COPY.started);
      input.current?.focus({ preventScroll: true });
    },
    onFailed: () => addLocal(note(director, NEW_CHAT_COPY.failed, 'error')),
  });
  /** "new chat" said in the director's chat: the same action and the same rule as the pill. */
  const newChatByVoice = (v: string) => {
    if (look.state === 'shining') return void newChat.start();
    addLocal(note('user', v));
    addLocal(note(director, look.reason ? NEW_CHAT_COPY.blocked(look.reason) : NEW_CHAT_COPY.alreadyNew));
  };

  const send = async (raw: string) => {
    const v = raw.trim();
    if (!v) {
      input.current?.focus();
      return;
    }
    setText('');
    /* a plain yes / no while a rebuild card waits answers the card, not the director */
    if (isDir && !p.context && answerByVoice(v)) return;
    if (isDir && !p.context && asksForNewChat(v)) return newChatByVoice(v);
    const ctx = p.context;
    if (ctx?.reportId) aboutTitles.set(ctx.reportId, ctx.title);
    p.clearContext();
    const said = ctx && !ctx.reportId ? `About “${ctx.title}”: ${v}` : v;
    /* the agent waits on your answer: what you type answers it, like the card (a note would never reach it) */
    const waiting = ctx?.reportId ? undefined : asks.find((a) => !answers[a.id]);
    /* a question nobody waits on any more leaves, and the words go out as a plain message instead */
    if (waiting && (await answer(waiting, said, true))) return;
    try {
      const r = await officeApi.say(pid, id, said, ctx?.reportId);
      setQueryData<Thread>(key, (prev) => ({
        projectId: pid,
        agentId: id,
        /* a line without a run answered a question (the server saw it first): typing stays as it was */
        busy: r.message.runId ? true : (prev?.busy ?? false),
        messages: mergeMessage(prev?.messages ?? [], r.message),
      }));
    } catch (e) {
      addLocal({ ...note('user', said), reportId: ctx?.reportId ?? null });
      addLocal(note(id, isApiError(e) ? e.message : 'That message didn’t go through.', 'error'));
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send(text);
  };
  /** True when the answer went in. A 409 means the question is closed (answered elsewhere, or withdrawn): its
      card leaves either way; typed words (`typed`) then go out as a message, a card's answer says why not. */
  const answer = async (a: PendingAsk, value: string, typed = false): Promise<boolean> => {
    try {
      await studio.projects.answer(pid, a.id, value);
      setAnswers((m) => ({ ...m, [a.id]: value }));
      /* the server saves the question and this answer in the thread (two `thread.message` lines) */
      p.answered(a.id);
      return true;
    } catch (e) {
      const closed = isApiError(e) && e.status === 409;
      if (closed) p.answered(a.id);
      if (!(closed && typed))
        addLocal(note(a.agentId, isApiError(e) ? e.message : 'The answer didn’t go through.', 'error'));
      return !closed;
    }
  };

  if (!ag) return null;
  const actor = p.actor;
  const team = p.teamName(id);
  const status = isDir
    ? 'Your director · big picture only'
    : actor?.kind === 'needs-input'
      ? '❗ Needs you'
      : actor?.session === 'asleep'
        ? `💤 Off shift — ${dirShort} can bring them in`
        : actor
          ? `${activityOf(actor.kind).icon} ${actor.label}`
          : '';
  const pose =
    actor?.kind === 'sleeping' ? 'sleeping' : actor?.kind === 'needs-input' ? 'needs-input' : 'talking';
  return (
    <>
      <button className="op-grab" type="button" aria-label="Expand chat" onClick={p.onGrab}>
        <i />
      </button>
      <header className="op-head">
        <div className="op-portrait">
          <Hero agent={ag} size={72} pose={pose} facing="front" />
        </div>
        <div className="op-who">
          <b>{ag.name}</b>
          <span className="op-role">
            {isDir ? 'Orchestrator' : ag.role || 'Agent'}
            {isDir ? '' : team ? ` · ${team.replace(/^The /, '')}` : ' · Solo'}
          </span>
          <span className="op-status">{status}</span>
        </div>
        {view === 'live' && (
          <div className="op-tools">
            {isDir && (
              <NewChatPill
                state={newChat.state}
                reason={newChat.reason}
                quiet={newChat.quiet}
                who={dirShort}
                onStart={() => void newChat.start()}
              />
            )}
            <button
              ref={pill}
              type="button"
              className="op-pill"
              data-testid="history-pill"
              onClick={openHistory}
            >
              <span className="op-pill-v">
                <span aria-hidden="true">🕘 </span>
                {CHAT_COPY.historyTitle}
              </span>
            </button>
            {!isDir && (
              <button
                type="button"
                className="op-pill"
                aria-label={`Back to ${dirShort}`}
                onClick={() => p.open(director)}
              >
                <span className="op-pill-v">← {dirShort}</span>
              </button>
            )}
          </div>
        )}
      </header>
      <p className="sr-only" role="status" aria-live="polite">
        {fresh ? `New message from ${ag.name}` : isDir ? said : ''}
      </p>
      {view !== 'live' && (
        // biome-ignore lint/a11y/noStaticElementInteractions: Esc steps back one level from anywhere in history
        <div
          className="op-hist"
          ref={hist}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            const tg = e.target as HTMLElement;
            if (tg instanceof HTMLTextAreaElement && tg.value) return;
            e.stopPropagation();
            e.preventDefault();
            backOne();
          }}
        >
          <nav className="op-nav" data-testid="history-nav" aria-label={`${ag.name}’s history`}>
            {view === 'history' ? (
              <>
                <BackToChat fresh={fresh} onClick={backToLive} />
                <span className="ch-sub op-nav-l">{CHAT_COPY.historyTitle}</span>
              </>
            ) : (
              <>
                <button type="button" className="ch-back op-nav-back" onClick={backOne}>
                  <span aria-hidden="true">‹ </span>
                  {CHAT_COPY.historyTitle}
                </button>
                <BackToChat fresh={fresh} onClick={backToLive} hero />
              </>
            )}
          </nav>
          <div className="op-hist-body">
            {view === 'history' && isDir ? (
              <ThreadChatList
                pid={pid}
                agentId={id}
                name={short}
                onOpen={(c) => go({ chat: c }, null)}
                current={{
                  preview: last ? last.text : null,
                  needsYou: asks.some((a) => !answers[a.id]),
                  onSelect: backToLive,
                }}
              />
            ) : view === 'history' ? (
              <ChatList
                pid={pid}
                agentId={id}
                name={short}
                onOpen={(c) => go({ run: c }, null)}
                current={{
                  preview: last ? last.text : null,
                  needsYou: asks.some((a) => !answers[a.id]),
                  onSelect: backToLive,
                }}
              />
            ) : 'chat' in view ? (
              <PastThreadChat
                key={view.chat.id}
                pid={pid}
                agentId={id}
                chat={view.chat}
                nameOf={(from) => p.agents[from]?.name ?? ag.name}
                openReport={p.openReport}
              />
            ) : (
              <ChatView
                key={view.run.runId}
                agentId={id}
                name={ag.name}
                chat={view.run}
                onBack={backOne}
                inPanel
              />
            )}
          </div>
        </div>
      )}
      {/* the live chat stays mounted while you're in history, so drafts in its cards survive */}
      <>
        <div className="op-log" ref={log} role="log" aria-live="polite" hidden={!live}>
          {t.loading && <p className="op-note">…</p>}
          {t.error && !t.data && <p className="op-note">Couldn’t load this conversation.</p>}
          {t.data && !messages.length && !asks.length && (
            <p className="op-note">
              {isDir && restarted.has(lkey)
                ? NEW_CHAT_COPY.empty(short)
                : isDir
                  ? `${short} keeps the big picture. Say what you want built and it goes on the whiteboard.`
                  : `Ask ${short} about their work.`}
            </p>
          )}
          {messages.map((m, i) => (
            <Fragment key={m.id}>
              {isDir && m.teamRequestId ? (
                <BuiltCard pid={pid} requestId={m.teamRequestId} text={m.text} />
              ) : (
                <Bubble
                  m={m}
                  who={m.from === 'user' ? 'You' : (p.agents[m.from]?.name ?? ag.name)}
                  openReport={p.openReport}
                />
              )}
              {isDir && m.rebuild && (
                <div className="op-rebuild">
                  {m.rebuild.undoToken ? (
                    <UndoLine
                      token={m.rebuild.undoToken}
                      summary={m.rebuild.summary}
                      since={Date.parse(m.at)}
                    />
                  ) : (
                    <RebuildCard
                      card={m.rebuild.card}
                      closed={m.rebuild.closed}
                      summary={m.rebuild.summary}
                      faceOf={(aid) => p.agents[aid] ?? null}
                      director={dirShort}
                      /* a newer message to the director: this card is out of date (spec §3) */
                      stale={messages.slice(i + 1).some((x) => x.from === 'user')}
                      /* only a card that just arrived takes focus — not one in the history */
                      focus={Date.parse(m.at) > openedAt.current}
                      /* an answered card no longer holds New chat back */
                      onApplied={() => bump((n) => n + 1)}
                      onKept={() => bump((n) => n + 1)}
                      onExpired={() => bump((n) => n + 1)}
                    />
                  )}
                </div>
              )}
            </Fragment>
          ))}
          {asks.map((a) => (
            <AskCard
              key={a.id}
              ask={a}
              answered={answers[a.id]}
              onAnswer={(v) => void answer(a, v)}
              who={ag.name}
            />
          ))}
          {typing && (
            <div className="bubble them">
              <span className="sr-only">{short} is typing</span>
              <span className="typing" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </div>
          )}
        </div>
        {p.context && (
          <div className="op-ctx" hidden={!live}>
            <span>About: {p.context.title}</span>
            <button type="button" aria-label="Drop the context" onClick={p.clearContext}>
              ✕
            </button>
          </div>
        )}
        <form className="op-composer" onSubmit={submit} hidden={!live}>
          <input
            ref={input}
            autoComplete="off"
            value={text}
            placeholder={`Message ${short}…`}
            aria-label={`Message ${ag.name}`}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && !text && !isDir) {
                e.stopPropagation();
                p.open(director);
              }
            }}
          />
          <Button small variant="hero" type="submit">
            Send
          </Button>
        </form>
      </>
    </>
  );
}

/** The way home from history; a coral dot when the live chat has a new line. */
function BackToChat({ fresh, onClick, hero }: { fresh: boolean; onClick: () => void; hero?: boolean }) {
  const label = `${CHAT_COPY.backToChat}${fresh ? ', new message' : ''}`;
  return hero ? (
    <Button
      small
      variant="hero"
      className="op-nav-home"
      data-testid="back-to-chat"
      aria-label={label}
      onClick={onClick}
    >
      {CHAT_COPY.backToChat}
      {fresh && <i className="op-dot" aria-hidden="true" />}
    </Button>
  ) : (
    <button
      type="button"
      className="ch-back op-nav-back"
      data-testid="back-to-chat"
      aria-label={label}
      onClick={onClick}
    >
      <span aria-hidden="true">‹ </span>
      {CHAT_COPY.backToChat}
      {fresh && <i className="op-dot" aria-hidden="true" />}
    </button>
  );
}

function AskCard({
  ask,
  answered,
  onAnswer,
  who,
}: {
  ask: PendingAsk;
  answered?: string;
  onAnswer: (v: string) => void;
  who: string;
}) {
  const [v, setV] = useState('');
  if (answered)
    return (
      <div className="op-ask done">
        <div className="op-aq">{ask.question}</div>
        <div className="op-adone">✓ {answered}</div>
      </div>
    );
  return (
    // biome-ignore lint/a11y/useSemanticElements: a labelled group of answer buttons, not a form fieldset
    <div className="op-ask live" role="group" aria-label={`${who} is asking: ${ask.question}`}>
      <div className="op-aq">{ask.question}</div>
      <div className="op-ain">
        {ask.options?.length ? (
          <div className="op-arow">
            {ask.options.map((o) => (
              <button key={o} type="button" className="chip" onClick={() => onAnswer(o)}>
                {o}
              </button>
            ))}
          </div>
        ) : (
          <form
            className="op-free"
            onSubmit={(e) => {
              e.preventDefault();
              if (v.trim()) onAnswer(v.trim());
            }}
          >
            <input
              aria-label="Your answer"
              placeholder="Your answer…"
              value={v}
              onChange={(e) => setV(e.target.value)}
            />
            <Button small variant="hero" type="submit" disabled={!v.trim()}>
              Answer
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
