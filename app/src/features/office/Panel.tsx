/* The chat side panel (prototype office-panel.js, spec-office §3.2–3.4) on the real backend.
   Calm: header + conversation + a text composer. No mic, no office updates, no suggestions.
   One thread per agent (threads API + `thread.message` events); the director is the default; the
   office is the switcher (click a robot). "!" asks arrive as cards in the agent's thread and are
   answered on the asks endpoint. One Send (OFFICE): the director decides — a clear ask becomes a goal on the
   whiteboard (the server posts it, the board follows its events), a question or a maybe gets a reply. */
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { isApiError, setQueryData, studio, useQuery } from '../../api';
import { Hero } from '../../characters';
import { Button } from '../../ui';
import { keys, officeApi, type Thread, type ThreadMessage } from './api';
import { type Actor, activityOf, mergeMessage, type PendingAsk } from './state';

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
};

/** A follow-up on a report (`reportId`), or just a subject (a letter, a team's principles): the message says
    `About “{title}”: …` so the agent knows what it's about. */
export type FollowUpContext = { title: string; reportId?: string };
/* titles of reports followed up here (a user message keeps only the reportId) */
const aboutTitles = new Map<string, string>();

export const shortOf = (a: { name: string; nick?: string | null } | undefined) =>
  a ? a.nick || a.name.replace(/^(Sir|Dr\.?|The)\s+/i, '').split(/\s+/)[0] : 'them';

/* local lines (answered asks, messages that didn't go through) survive switching threads */
const local = new Map<string, ThreadMessage[]>();
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
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const lkey = `${pid}:${id}`;
  const addLocal = (m: ThreadMessage) => {
    local.set(lkey, [...(local.get(lkey) ?? []), m]);
    bump((n) => n + 1);
  };

  const messages = [...(t.data?.messages ?? []), ...(local.get(lkey) ?? [])].sort((a, b) =>
    a.at < b.at ? -1 : a.at > b.at ? 1 : 0,
  );
  const typing = !!t.data?.busy;
  const asks = p.asks.filter((a) => a.agentId === id);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll to the newest line
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, typing, asks.length, id]);
  useEffect(() => {
    if (p.context) input.current?.focus({ preventScroll: true });
  }, [p.context]);

  const short = shortOf(ag);
  const dirShort = shortOf(p.agents[director]);

  const send = async (raw: string) => {
    const v = raw.trim();
    if (!v) {
      input.current?.focus();
      return;
    }
    setText('');
    const ctx = p.context;
    if (ctx?.reportId) aboutTitles.set(ctx.reportId, ctx.title);
    p.clearContext();
    const said = ctx && !ctx.reportId ? `About “${ctx.title}”: ${v}` : v;
    try {
      const r = await officeApi.say(pid, id, said, ctx?.reportId);
      setQueryData<Thread>(key, (prev) => ({
        projectId: pid,
        agentId: id,
        busy: true,
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
  const answer = async (a: PendingAsk, value: string) => {
    try {
      await studio.projects.answer(pid, a.id, value);
      setAnswers((m) => ({ ...m, [a.id]: value }));
      addLocal(note('user', `Go with ${value}.`));
      p.answered(a.id);
    } catch (e) {
      addLocal(note(a.agentId, isApiError(e) ? e.message : 'The answer didn’t go through.', 'error'));
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
        {!isDir && (
          <button
            type="button"
            className="op-backpix"
            aria-label={`Back to ${dirShort}`}
            onClick={() => p.open(director)}
          >
            ← {dirShort}
          </button>
        )}
      </header>
      <div className="op-log" ref={log} role="log" aria-live="polite">
        {t.loading && <p className="op-note">…</p>}
        {t.error && !t.data && <p className="op-note">Couldn’t load this conversation.</p>}
        {t.data && !messages.length && !asks.length && (
          <p className="op-note">
            {isDir
              ? `${short} keeps the big picture. Say what you want built and it goes on the whiteboard.`
              : `Ask ${short} about their work.`}
          </p>
        )}
        {messages.map((m) => (
          <Bubble
            key={m.id}
            m={m}
            who={m.from === 'user' ? 'You' : (p.agents[m.from]?.name ?? ag.name)}
            openReport={p.openReport}
          />
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
        <div className="op-ctx">
          <span>About: {p.context.title}</span>
          <button type="button" aria-label="Drop the context" onClick={p.clearContext}>
            ✕
          </button>
        </div>
      )}
      <form className="op-composer" onSubmit={submit}>
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
  );
}

function Bubble({ m, who, openReport }: { m: ThreadMessage; who: string; openReport: (id: string) => void }) {
  const me = m.from === 'user';
  /* a follow-up: the message keeps its reportId (older ones carried a text prefix) */
  const legacy = me ? /^About (?:the report )?“(.+?)”: /.exec(m.text) : null;
  const aboutTitle = me && m.reportId ? (aboutTitles.get(m.reportId) ?? 'a report') : legacy?.[1];
  return (
    <div className={`bubble ${me ? 'me' : 'them'}${m.kind === 'error' ? ' err' : ''}`}>
      <span className="who">{who}</span>
      {aboutTitle && <span className="op-about">About: {aboutTitle}</span>}
      <span className="t">{fmt(legacy ? m.text.slice(legacy[0].length) : m.text)}</span>
      {m.reportId && !me && (
        <button type="button" className="op-link" onClick={() => openReport(m.reportId as string)}>
          Open report
        </button>
      )}
    </div>
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

/** **bold** and `code` only (the prototype's _fmt), as elements — never raw HTML. */
function fmt(s: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let k = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(m[1] ? <b key={k++}>{m[1]}</b> : <code key={k++}>{m[2]}</code>);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
