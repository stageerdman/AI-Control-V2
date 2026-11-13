/* 3 — Team: the orchestrator's plan on stage + a side chat with it (v6 N2–N4). The first time,
   the orchestrator opens with a proposal. Each message is one real orchestrator turn
   (POST /drafts/:id/chat → reply + the whole updated plan). Accept → the Agent Creator mints every
   brief (POST /accept); what it made shows up tagged "new", then "Open the office →". Finishing
   (POST /finish) only creates the project — the Setter set the folder up in the step before. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { type Agent, type ChatMessage, type Draft, invalidate, studio, type Team } from '../../api';
import { Hero } from '../../characters/Hero';
import { reducedMotion } from '../../design/palette';
import { go } from '../../shell/router';
import { briefName, type Resolve, WorkDesign } from '../collab';
import { nickOf } from '../projects/model';
import { fireConfetti, sparkle } from './confetti';
import { DRAFTS_KEY } from './drafts';
import { briefLine, canContinue, pendingBriefs, planLine, planView, STEP } from './flow';
import { PlanStage } from './PlanStage';
import { Foot, StepCard, StepTitle } from './parts';
import { putDraft } from './useDraft';

/** Drafts whose opening proposal was asked for in this session (a remount must not ask twice). */
const opened = new Set<string>();

export function TeamStep({
  d,
  agents,
  teams,
  orch,
  creator,
}: {
  d: Draft;
  agents: Agent[];
  teams: Team[];
  orch: Agent | undefined;
  creator: Agent | undefined;
}) {
  const [busy, setBusy] = useState<false | 'orch' | 'creator' | 'accept'>(false);
  const [mine, setMine] = useState<string | null>(null); // my message while the orchestrator answers
  const [chatErr, setChatErr] = useState<string | null>(null);
  const [acceptErr, setAcceptErr] = useState<string | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const live = useRef(true);
  useEffect(() => {
    live.current = true; // (StrictMode unmounts + remounts the same instance)
    return () => {
      live.current = false;
    };
  }, []);

  const view = useMemo(
    () => (d.plan ? planView(d.plan, teams, agents, fresh) : null),
    [d.plan, teams, agents, fresh],
  );
  const minted = fresh.size > 0 && pendingBriefs(d.plan) === 0;
  const resolve = useMemo(() => planResolver(d, agents, teams), [d, agents, teams]);
  const oNick = nickOf(orch) || 'The orchestrator';
  const cNick = nickOf(creator) || 'The Agent Creator';

  const say = async (msg?: string) => {
    setBusy('orch');
    setChatErr(null);
    setMine(msg ?? null);
    try {
      const r = await studio.drafts.chat(d.id, msg);
      putDraft(d.id, { chat: r.chat, plan: r.plan });
      if (live.current) setFresh(new Set());
    } catch (e) {
      if (!live.current) return;
      if (msg) setText((t) => t || msg); // keep what you wrote
      setChatErr(`${oNick} couldn’t answer — ${(e as Error).message}`);
    } finally {
      if (live.current) {
        setBusy(false);
        setMine(null);
      }
    }
  };

  /* the orchestrator opens with its proposal — once per draft */
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per draft on entering the step
  useEffect(() => {
    if (d.plan || d.chat.length || opened.has(d.id) || !orch) return;
    opened.add(d.id);
    void say();
  }, [d.id]);

  /* draft → project, then walk into the office (the prototype's npFinish) */
  const finish = async () => {
    const r = await studio.drafts.finish(d.id);
    void invalidate('projects');
    void invalidate(DRAFTS_KEY);
    fireConfetti();
    go({ name: 'office', projectId: r.project.id, sub: 'room' });
  };

  const accept = async () => {
    if (minted) {
      setBusy('accept');
      setAcceptErr(null);
      try {
        await finish();
      } catch (e) {
        if (live.current) setAcceptErr(`Couldn’t open the project — ${(e as Error).message}`);
      } finally {
        if (live.current) setBusy(false);
      }
      return;
    }
    const briefs = pendingBriefs(d.plan);
    setBusy(briefs ? 'creator' : 'accept');
    setAcceptErr(null);
    try {
      /* the Creator stays on stage long enough to be seen, even when it's quick (prototype: 1.4 s) */
      const beat = briefs ? new Promise((ok) => setTimeout(ok, reducedMotion() ? 250 : 1200)) : null;
      const r = await studio.drafts.accept(d.id);
      await beat;
      const ids = [...r.minted.teams.map((t) => t.id), ...r.minted.agents.map((a) => a.id)];
      if (ids.length) {
        await Promise.all([invalidate('agents'), invalidate('teams')]); // the Cast grew
        const fresh = await studio.drafts.get(d.id); // + the Creator's chat lines
        putDraft(d.id, { plan: fresh.plan, chat: fresh.chat });
        if (!live.current) return;
        setFresh(new Set(ids));
        sparkle(45, 32);
        setTimeout(() => primary.current?.focus(), 60);
      } else {
        putDraft(d.id, { plan: r.plan });
        await finish();
      }
    } catch (e) {
      if (live.current)
        setAcceptErr(
          `${briefs ? `${cNick} couldn’t finish` : 'Couldn’t open the project'} — ${(e as Error).message}`,
        );
    } finally {
      if (live.current) setBusy(false);
    }
  };

  const ready = canContinue(STEP.team, d, []);
  const name = d.name.trim() || 'this project';
  return (
    <>
      <StepCard
        label="Team"
        stageClass="np-planstage"
        stage={
          <PlanStage
            view={view}
            orch={orch}
            creator={creator}
            busy={busy === 'creator' ? 'creator' : busy === 'orch' ? 'orch' : false}
          />
        }
        body={
          <>
            <StepTitle>{view ? `${oNick}’s plan for ${name}` : `${oNick} is reading the brief…`}</StepTitle>
            {view ? (
              <p className="np-sub">
                {planLine(view)}
                {view.captains.length > 0 &&
                  ` Captains come from each team’s own design (${view.captains.join(', ')}).`}{' '}
                This project runs its own copies — no shared memory.
                {briefLine(view, cNick) && (
                  <>
                    <br />
                    {briefLine(view, cNick)}
                  </>
                )}
              </p>
            ) : (
              <p className="np-sub">A proposal is on its way — whole teams first.</p>
            )}
            {view && <WorkDesign collab={d.plan?.collaboration} orch={oNick} resolve={resolve} />}
            {acceptErr && (
              <p className="np-err" role="alert">
                {acceptErr}
              </p>
            )}
          </>
        }
        foot={
          <Foot>
            <button
              ref={primary}
              type="button"
              className="btn btn-hero np-primary"
              disabled={!!busy || !ready}
              data-autofocus={view ? true : undefined}
              onClick={() => void accept()}
            >
              {busy === 'creator'
                ? `${cNick} is designing…`
                : minted
                  ? 'Open the office →'
                  : acceptErr
                    ? 'Try again'
                    : 'Accept the plan →'}
            </button>
          </Foot>
        }
      />
      <aside className="np-chat" aria-label={`Chat with ${orch?.name ?? 'the orchestrator'}`}>
        <header className="op-head">
          <div className="op-portrait">
            <Hero
              agent={orch}
              size={72}
              pose={busy === 'orch' ? 'thinking' : 'talking'}
              facing="front"
              props={false}
            />
          </div>
          <div className="op-who">
            <b>{orch?.name}</b>
            <span className="op-role">Orchestrator</span>
            <span className="op-status">Planning {name}’s teams</span>
          </div>
        </header>
        <ChatLog
          chat={d.chat}
          mine={mine}
          typing={busy === 'orch'}
          error={chatErr}
          orch={oNick}
          creator={cNick}
        />
        <form
          className="op-composer"
          onSubmit={(e) => {
            e.preventDefault();
            const v = text.trim();
            if (!v || busy) return input.current?.focus();
            setText('');
            void say(v);
          }}
        >
          <input
            ref={input}
            autoComplete="off"
            placeholder={`Message ${oNick}…`}
            aria-label={`Message ${orch?.name ?? 'the orchestrator'}`}
            value={text}
            readOnly={busy === 'creator' || busy === 'accept'}
            maxLength={4000}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            className="btn btn-hero btn-sm"
            type="submit"
            disabled={busy === 'creator' || busy === 'accept'}
          >
            Send
          </button>
        </form>
      </aside>
    </>
  );
}

function ChatLog({
  chat,
  mine,
  typing,
  error,
  orch,
  creator,
}: {
  chat: ChatMessage[];
  mine: string | null;
  typing: boolean;
  error: string | null;
  orch: string;
  creator: string;
}) {
  const log = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll to the newest line whenever one lands
  useLayoutEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [chat.length, mine, typing, error]);
  const who = (m: ChatMessage) => (m.from === 'user' ? 'You' : m.from === 'creator' ? creator : orch);
  return (
    <div className="op-log" role="log" aria-live="polite" ref={log}>
      {chat.map((m, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the chat is append-only
        <div key={i} className={`bubble ${m.from === 'user' ? 'me' : 'them'}`}>
          <span className="who">{who(m)}</span>
          <span className="t">{m.text}</span>
        </div>
      ))}
      {mine && (
        <div className="bubble me">
          <span className="who">You</span>
          <span className="t">{mine}</span>
        </div>
      )}
      {typing && (
        <div className="bubble them np-typing">
          <span className="sr-only">{orch} is typing</span>
          <span className="typing" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </div>
      )}
      {error && (
        <div className="bubble np-chaterr" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

/** Names for the collaboration chips: real agents/teams, or the plan's briefs before accept. */
export function planResolver(d: Draft, agents: Agent[], teams: Team[]): Resolve {
  const ph = /^new-(agent|team):(\d+)$/;
  return {
    agent: (id) => {
      const m = ph.exec(id);
      if (m) {
        const b = m[1] === 'agent' ? d.plan?.newAgents[+m[2]] : undefined;
        return b ? { name: briefName(b.brief), ghost: true } : null;
      }
      const a = agents.find((x) => x.id === id);
      return a ? { name: nickOf(a) || a.name, look: a.look } : null;
    },
    team: (id) => {
      const m = ph.exec(id);
      if (m) {
        const b = m[1] === 'team' ? d.plan?.newTeams[+m[2]] : undefined;
        return b ? { id, name: briefName(b.brief) } : null;
      }
      const t = teams.find((x) => x.id === id);
      return t ? { id: t.id, name: t.name, emblem: t.emblem, color: t.color } : null;
    },
  };
}
