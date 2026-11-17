/* Project conversations (U1): the user chats with the project's orchestrator or any agent on
   the project. One thread per (project, agent); every user message is one turn = one run that
   resumes the thread's last session, in the project folder:

   - an agent runs with its normal composed prompt + tools (team context from its team on this project);
   - the orchestrator runs big picture: its own brain + altitude, only its director tools (whiteboard, features,
     ask / resume / stop, staff / rebuild, agents' open questions), no secrets, and a fresh summary of the whiteboard, features and health
     in every message. It acts with its tools during the turn and answers in plain words (director-reply.ts); a
     goal it puts on the whiteboard is linked to the turn's lines by goalId, and a rebuild card rides on its reply.

   One turn at a time per thread; the runtime's rules still hold (one live run per agent per
   project, caps). The reply arrives later as a `thread.message` event and is stored; asks the run
   opens are answered on the existing asks endpoint. Secrets are redacted before anything is stored. */
import { randomUUID } from 'node:crypto';
import { ORCHESTRATOR_ALTITUDE } from '../crew/prompts.ts';
import { CREW_CAPS } from '../crew/structured.ts';
import type { Agent } from '../db/agents.ts';
import type { Db } from '../db/connection.ts';
import type { Project } from '../db/projects.ts';
import { INTERRUPTED, type Run, runsRepo } from '../db/runs.ts';
import type { Store } from '../db/store.ts';
import { now, type Row, rows } from '../db/util.ts';
import { workRepo } from '../db/work.ts';
import { wayInWords } from '../domain/workflows.ts';
import { conflict, notFound } from '../errors.ts';
import type { EventLog } from '../events/log.ts';
import { redactSecrets } from '../events/redact.ts';
import type { Health } from '../health/health.ts';
import type { Reports } from '../reports/reports.ts';
import type { CapableTool } from '../room/bridge.ts';
import { ROADMAP_RULE } from '../room/context.ts';
import type { Caps } from '../runtime/runner.ts';
import type { Runtime } from '../runtime/service.ts';
import { type Capabilities, canStartWork, capabilityText, NO_CAPABILITIES } from './capabilities.ts';
import { directorAnswer, replyText } from './director-reply.ts';
import type { DirectorStopper } from './director-stop.ts';
import type { Features } from './features.ts';
import { canStartNew } from './new-chat.ts';
import { type Seat, seatOf } from './people.ts';
import { questionView } from './question-tools.ts';
import type { Offer, Rebuilds } from './rebuild-service.ts';
import { castAvailable } from './staffing.ts';
import type { TurnHooks } from './team-tools.ts';
import { type ChatWindow, type ThreadChat, threadChats } from './thread-chats.ts';

export type ThreadMessage = {
  id: string;
  /** 'user' or the thread's agent id (the prototype's `from`). */
  from: string;
  kind: 'text' | 'error';
  text: string;
  runId: string | null;
  /** Set when this turn filed a report: the reply is one line pointing at it ("Open report") — or, on a user
      message, the report the follow-up is about. */
  reportId: string | null;
  /** A goal on the whiteboard: the user's goal line and the orchestrator's plan reply. */
  goalId: string | null;
  /** A team rebuild the director's reply carries: the confirm card, or (applied at once) its Undo. */
  rebuild?: Offer | null;
  at: string;
};
export type Thread = { projectId: string; agentId: string; busy: boolean; messages: ThreadMessage[] };

const HISTORY = 200;
/** G1: the orchestrator's resumed session is rotated after this many turns (it drifts back to old ideas). */
export const ROTATE_AFTER_TURNS = 12;
/** How many recent messages a rotated session's recap carries. */
const RECAP = 6;
/** How much of a report's body a follow-up turn carries. */
const REPORT_EXCERPT = 4000;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const json = (v: unknown) => JSON.stringify(v);
/** What the user calls an agent: its nick, else its first name. */
const shortName = (a: Pick<Agent, 'name' | 'nick'> | null | undefined) =>
  a?.nick ?? a?.name.split(' ')[0] ?? 'Someone';

/** A thread's reply when the run ended without an answer: stopped, cut off by a restart, or failed. */
export function whyNoAnswer(run: Pick<Run, 'status' | 'error'>): string {
  if (run.status === 'cancelled') return 'Stopped by you before I could answer. Ask me to carry on any time.';
  if (run.error === INTERRUPTED) return 'The studio restarted before I could answer. Ask me again any time.';
  return `I couldn’t finish that: ${clip(run.error ?? 'no answer', 2000)}`;
}

/** The step a todo item waits on (checklist order, as dispatch's orderGate): the first unfinished item before
    its parallel group. */
export function waitsFor<T extends { status: string; parallel: boolean }>(
  items: T[],
  index: number,
): T | null {
  let start = index;
  while (start > 0 && items[start]?.parallel) start--;
  return items.slice(0, start).find((b) => b.status !== 'done') ?? null;
}

/** The orchestrator's office-chat prompt: its brain, big-picture altitude, plain-words replies. */
export function orchestratorChatPrompt(
  orch: Pick<Agent, 'name' | 'role' | 'prompt'>,
  project: string,
  can: Capabilities = NO_CAPABILITIES,
): string {
  const doesWork = canStartWork(can)
    ? 'You do not do the work yourself. When the user clearly asks for work, you put it on the whiteboard as ONE goal with its tasks (`add_goal`) — the user does not split it; say which of the people on the project (the summary’s "people") you briefed. When it is only an idea or a question, answer and ask first.'
    : 'You do not do the work yourself.';
  return [
    `# ${orch.name}`,
    `You are ${orch.name} (${orch.role}), the orchestrator of the project "${project}" in AI Studio.\n\n${orch.prompt.trim()}`,
    `## Your altitude\n\n${ORCHESTRATOR_ALTITUDE}`,
    [
      '## How you talk here',
      '',
      'The user is chatting with you in the project’s office, mostly by voice. Every message carries a fresh summary of the whiteboard, the features list, the team and the latest health check — that is what you know about the work.',
      capabilityText(can),
      'How the whiteboard runs: items run in checklist order. An item is "running" once its owner has been briefed and is working; a "todo" item is waiting its turn — `waitsFor` names the step it waits on, and its owner is briefed automatically the moment that step is done. A captain splits a team item into `team` sub-tasks for members. Explain waiting and progress from this, plainly ("Jony starts when Blair’s design lands").',
      'Names come from voice and can be misheard ("Ivy" for "Ally", "Johnny" for "Jony"). Match an unknown name to the closest person on the project, say who you took it as, and carry on — ask only when two people fit.',
      'The summary is the truth about the project right now. Where it disagrees with anything said earlier in this chat — how many goals there are, what they are, who is on the project, what shipped — trust the summary and drop the older idea. Never bring back a goal or plan the summary does not show as active unless the user asks for it.',
      'Answer in plain, friendly words, a few short sentences, no jargon. Steer: priorities, who carries what, what is next.',
      `${doesWork} Details belong to the teams — the user can tap any agent to talk to them directly.`,
      'Research, comparisons, reviews and write-ups end in a report in the Reports tray. Route research to a reporter (a role or team marked "files reports": they also search the web); anyone else on the project can still put what they made in Reports when asked. You never write reports yourself. "Any new reports?" → list the unread titles from the summary.',
      ROADMAP_RULE,
    ].join('\n'),
  ].join('\n\n');
}

export function createThreads(deps: {
  db: Db;
  store: Store;
  events: EventLog;
  runtime: Runtime;
  features: Features;
  health: Health;
  reports: Reports;
  /** Every known secret value (the global cabinet) — scrubbed from stored text. */
  secretValues: () => string[];
  /** Caps for the orchestrator's chat turns (default CREW_CAPS). */
  orchestratorCaps?: Caps;
  /** Open rebuild cards go stale when a newer message reaches the director (office/rebuild-service.ts). */
  rebuilds?: Pick<Rebuilds, 'staleAll'>;
  /** Who is working on what right now (the summary's `runningNow`, for the director's `stop_work`). */
  runningNow?: DirectorStopper['runningNow'];
  /** Live sessions in a project (running registry, kind 'session'): "New chat" waits until there are none. */
  liveSessions?: (projectId: string) => { agentId: string | null }[];
  /** The director's chat tools for this project: whiteboard (src/whiteboard/tools.ts), features
      (office/feature-tools.ts), ask / resume / stop (office/action-tools.ts), staff / rebuild
      (office/team-tools.ts, which hand their card to `turn`) and agents' open questions
      (office/question-tools.ts). Absent → it has none. */
  directorTools?: (projectId: string, directorId: string, turn: TurnHooks) => CapableTool[];
}) {
  const { db, store, events, runtime } = deps;
  const work = workRepo(db);
  const chats = threadChats(db);
  /** runId → the thread its reply belongs to (+ for the director: the user's message, the goals there were
      before the turn, and the rebuild card a tool handed over) */
  type Turn = {
    projectId: string;
    agentId: string;
    orchestrator: boolean;
    messageId?: string;
    goalsBefore?: Set<string>;
    card?: Offer;
  };
  const turns = new Map<string, Turn>();
  const key = (projectId: string, agentId: string) => `${projectId}\u0000${agentId}`;
  const busy = new Set<string>();
  const scrub = (s: string) => redactSecrets(s, deps.secretValues()).value;
  const seat = (p: Project, agentId: string) => seatOf(store, p, agentId);

  const toMessage = (r: Row): ThreadMessage => ({
    id: r.id as string,
    from: r.sender === 'user' ? 'user' : (r.agent_id as string),
    kind: r.kind as ThreadMessage['kind'],
    text: r.text as string,
    runId: (r.run_id as string | null) ?? null,
    reportId: (r.report_id as string | null) ?? null,
    goalId: (r.goal_id as string | null) ?? null,
    ...(r.rebuild ? { rebuild: JSON.parse(r.rebuild as string) as Offer } : {}),
    at: r.created_at as string,
  });
  const insert = (
    projectId: string,
    agentId: string,
    m: {
      sender: 'user' | 'agent';
      kind: ThreadMessage['kind'];
      text: string;
      runId: string | null;
      reportId?: string | null;
      goalId?: string | null;
      rebuild?: Offer | null;
    },
  ): ThreadMessage => {
    const id = randomUUID();
    const text = scrub(m.text);
    const at = now();
    db.prepare(
      'INSERT INTO thread_messages (id, project_id, agent_id, sender, kind, text, run_id, report_id, goal_id, rebuild, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      id,
      projectId,
      agentId,
      m.sender,
      m.kind,
      text,
      m.runId,
      m.reportId ?? null,
      m.goalId ?? null,
      m.rebuild ? JSON.stringify(m.rebuild) : null,
      at,
    );
    try {
      events.append('project', projectId, {
        type: 'thread.message',
        payload: {
          agentId,
          messageId: id,
          from: m.sender,
          kind: m.kind,
          text: clip(text, 20_000),
          ...(m.runId ? { runId: m.runId } : {}),
          ...(m.reportId ? { reportId: m.reportId } : {}),
          ...(m.goalId ? { goalId: m.goalId } : {}),
          ...(m.rebuild ? { rebuild: m.rebuild } : {}),
        },
      });
    } catch {
      /* the message is stored; a bad event line never loses it */
    }
    return {
      id,
      from: m.sender === 'user' ? 'user' : agentId,
      kind: m.kind,
      text,
      runId: m.runId,
      reportId: m.reportId ?? null,
      goalId: m.goalId ?? null,
      ...(m.rebuild ? { rebuild: m.rebuild } : {}),
      at,
    };
  };

  /** The last session of this thread's current chat, to resume (null → a fresh one: a new chat starts clean). */
  const lastRunWithSession = (projectId: string, agentId: string): string | null =>
    rows<{ run_id: string }>(
      db
        .prepare(
          `SELECT m.run_id FROM thread_messages m JOIN runs r ON r.id = m.run_id
           WHERE m.project_id = ? AND m.agent_id = ? AND m.created_at >= ? AND r.agent_id = m.agent_id
             AND r.session_id IS NOT NULL
           ORDER BY m.created_at DESC, m.rowid DESC LIMIT 1`,
        )
        .all(projectId, agentId, chats.currentStart(projectId, agentId)),
    )[0]?.run_id ?? null;

  /* ---- the orchestrator's session (G1): rotate after ROTATE_AFTER_TURNS turns, or when a new goal follows a finished one */
  const sessionOf = (projectId: string, agentId: string) =>
    rows<{ started_at: string; rotate: number }>(
      db
        .prepare('SELECT started_at, rotate FROM thread_sessions WHERE project_id = ? AND agent_id = ?')
        .all(projectId, agentId),
    )[0] ?? null;
  const turnsSince = (projectId: string, agentId: string, since: string) =>
    (
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM thread_messages WHERE project_id = ? AND agent_id = ? AND sender = 'user' AND run_id IS NOT NULL AND created_at >= ?",
        )
        .get(projectId, agentId, since) as { n: number }
    ).n;
  const setSession = (projectId: string, agentId: string, patch: { startedAt?: string; rotate: boolean }) =>
    db
      .prepare(
        `INSERT INTO thread_sessions (project_id, agent_id, started_at, rotate) VALUES (?, ?, ?, ?)
         ON CONFLICT(project_id, agent_id) DO UPDATE SET rotate = excluded.rotate${patch.startedAt ? ', started_at = excluded.started_at' : ''}`,
      )
      .run(projectId, agentId, patch.startedAt ?? '', patch.rotate ? 1 : 0);
  /** A fresh session's memory of the thread: the last few lines, clipped. */
  function recapOf(projectId: string, agentId: string): string | null {
    const last = rows<Row>(
      db
        .prepare(
          `SELECT sender, text FROM thread_messages WHERE project_id = ? AND agent_id = ? AND kind = 'text'
             AND created_at >= ?
           ORDER BY created_at DESC, rowid DESC LIMIT ?`,
        )
        .all(projectId, agentId, chats.currentStart(projectId, agentId), RECAP),
    ).reverse();
    if (!last.length) return null;
    return [
      'This is a fresh session. A short recap of this chat so far (older details are gone on purpose — the summary above is what is true now):',
      ...last.map(
        (m) =>
          `- ${m.sender === 'user' ? 'The user' : 'You'}: ${clip(String(m.text).replace(/\s+/g, ' '), 300)}`,
      ),
    ].join('\n');
  }

  /** What the orchestrator knows, fresh each turn: whiteboard, features, health, open asks. */
  function summary(p: Project) {
    const name = (id: string) => store.agents.get(id)?.name ?? store.teams.get(id)?.name ?? id;
    const all = work.goals(p.id);
    const active = all.filter((g) => g.status === 'running');
    const stopped = all.filter((g) => g.status === 'failed');
    const finished = all.filter((g) => g.status !== 'running' && g.status !== 'failed').slice(0, 3);
    const health = deps.health.latest(p.id);
    /* name + role, and `reporter` when the role files reports (only reporters may take research) */
    const person = (id: string) => {
      const a = store.agents.get(id);
      const reporter = !!a?.roleId && !!store.roles.get(a.roleId)?.reporter;
      return { name: name(id), role: a?.role ?? '', ...(reporter ? { reporter: true } : {}) };
    };
    return {
      project: { name: p.name, about: p.note, progress: p.progress },
      /* who is on the project — without it the orchestrator told a staffed project "I don't see a team yet" (F3) */
      people: {
        teams: p.teamIds.flatMap((tid) => {
          const t = store.teams.get(tid);
          if (!t) return [];
          return [
            {
              name: t.name,
              captain: t.captainId ? name(t.captainId) : null,
              members: t.members.map((m) => person(m.agentId)),
              ...(t.reporter ? { reporter: true } : {}),
            },
          ];
        }),
        specialists: p.agentIds.map(person),
        /* who the director may staff the project with (by name; never invent anyone) */
        castAvailable: castAvailable(store, p.id),
        /* derived, not `summary`: a summary goes stale once the way is redrawn in the editor */
        howWeWork: p.workflows?.[0]
          ? wayInWords(p.workflows[0], name)
          : 'You brief the team captains; no review gates.',
      },
      /* active goals only, with their items (G1: finished ones made the orchestrator count old goals as current) */
      whiteboard: active.map((g) => ({
        goal: clip(g.text, 300),
        status: g.status,
        pct: g.pct,
        items: g.items.map((i, n) => {
          const waits = i.status === 'todo' ? waitsFor(g.items, n) : null;
          return {
            text: i.text,
            owner: name(i.agentId),
            status: i.status,
            ...(waits ? { waitsFor: `${clip(waits.text, 120)} (${name(waits.agentId)})` } : {}),
            ...(i.subtasks.length
              ? {
                  team: i.subtasks.map((t) => ({
                    text: clip(t.text, 120),
                    owner: name(t.agentId),
                    status: t.status,
                  })),
                }
              : {}),
          };
        }),
      })),
      activeGoals: active.length,
      /* stopped partway (still on the board): the director can continue them — `resume_goal` by n */
      stopped: stopped.map((g, n) => ({
        n: n + 1,
        goal: clip(g.text, 300),
        pct: g.pct,
        unfinished: g.items
          .filter((i) => i.status !== 'done')
          .map((i) => ({ text: clip(i.text, 120), owner: name(i.agentId), status: i.status })),
      })),
      finishedGoals: finished.map((g) => ({ goal: clip(g.text, 200), status: g.status })),
      features: deps.features.repo.list(p.id).map((f) => ({
        name: f.name,
        status: f.status,
        ...(f.pct === null ? {} : { pct: f.pct }),
        ...(f.owner ? { owner: name(f.owner) } : {}),
        description: clip(f.description, 300),
      })),
      health: health
        ? {
            modularity: health.modularity.grade,
            cleanliness: health.cleanliness.grade,
            reusability: health.reusability.grade,
            summary: health.summary,
            when: health.createdAt,
          }
        : null,
      /* who is working on what this moment — what the director can stop */
      ...(deps.runningNow ? { runningNow: deps.runningNow(p.id) } : {}),
      unreadReports: deps.reports.unreadTitles(p.id),
      /* with ids and options: the director answers one for the user (`answer_question`) */
      openQuestions: runtime
        .asks(p.id, 'open')
        .map((a) => questionView(store, { ...a, question: clip(a.question, 200) })),
    };
  }

  /** A follow-up on a report: what the report said, so the agent answers about it (title, summary, body excerpt). */
  function aboutReport(projectId: string, reportId: string): string {
    const r = deps.reports.get(projectId, reportId);
    return [
      `The user is following up on this report (${r.author.name}, ${r.createdAt.slice(0, 10)}):`,
      `Title: ${json(r.title)}`,
      `Summary: ${json(r.summary)}`,
      `Report (excerpt): ${json(clip(r.body, REPORT_EXCERPT))}`,
    ].join('\n');
  }

  function taskFor(
    p: Project,
    s: Seat,
    text: string,
    can: Capabilities,
    reportId?: string,
    recap?: string | null,
  ): string {
    const about = reportId ? aboutReport(p.id, reportId) : '';
    if (s.orchestrator) {
      const now = summary(p);
      const n = now.activeGoals;
      return [
        `Studio summary right now: ${json(now)}`,
        `This summary is the truth right now: ${n === 0 ? 'no goal is' : n === 1 ? 'exactly 1 goal is' : `exactly ${n} goals are`} active on the whiteboard. Where it disagrees with anything said earlier in this chat, trust it.`,
        recap ?? '',
        about,
        `The user says: ${json(text)}`,
        directorAnswer(can),
      ]
        .filter(Boolean)
        .join('\n\n');
    }
    const orch = store.agents.get(p.orchestratorId)?.name ?? 'the orchestrator';
    return [
      'The user is talking with you directly in the AI Studio office chat — a conversation, not a checklist item.',
      about,
      `The user says: ${json(text)}`,
      `Reply in plain, friendly words. If they ask you to change something, do it here in the project folder, then say what you did. Big-picture questions (priorities, scope, who does what) belong to ${orch}, the orchestrator — point them there.`,
    ].join('\n\n');
  }

  /** A new goal after a finished one: the orchestrator's next chat turn starts a fresh session (with a recap). */
  function noteNewGoal(projectId: string, agentId: string, goalId: string) {
    const finishedBefore = work.goals(projectId).some((g) => g.id !== goalId && g.status !== 'running');
    if (finishedBefore) setSession(projectId, agentId, { rotate: true });
  }

  /** The goal the director's turn put on the whiteboard (add_goal), if any: the first one that wasn't there. */
  const goalAddedIn = (t: Turn) =>
    t.goalsBefore ? (work.goals(t.projectId).find((g) => !t.goalsBefore?.has(g.id)) ?? null) : null;

  /** The director's reply: plain words, with the rebuild card a tool handed over; a goal it added links the
      user's message and the reply, and a goal after a finished one rotates the session. */
  function directorReplied(t: Turn, run: Run) {
    const goal = goalAddedIn(t);
    if (goal && t.messageId) {
      db.prepare('UPDATE thread_messages SET goal_id = ? WHERE id = ?').run(goal.id, t.messageId);
      noteNewGoal(t.projectId, t.agentId, goal.id);
    }
    insert(t.projectId, t.agentId, {
      sender: 'agent',
      kind: 'text',
      text: replyText(run.result as string),
      runId: run.id,
      goalId: goal?.id ?? null,
      rebuild: t.card ?? null,
    });
  }

  /* an agent's question the user answered stays in the agent's thread as two lines: the question, then the
     answer (the open-ask card is gone once answered). No runId: these lines never pick the session to resume. */
  runtime.onAnswered((ask) => {
    if (!ask.answer?.trim()) return;
    insert(ask.projectId, ask.agentId, { sender: 'agent', kind: 'text', text: ask.question, runId: null });
    insert(ask.projectId, ask.agentId, {
      sender: 'user',
      kind: 'text',
      text: clip(ask.answer.trim(), 20_000),
      runId: null,
    });
  });

  /** The thread a run answers, from the stored user line carrying its id (memory is lost on a restart, and a
      note told to running work never had a turn). Null: not a chat run, or it already replied. */
  const turnOf = (run: Run): Turn | null => {
    const line = rows<{ project_id: string; agent_id: string; replied: number }>(
      db
        .prepare(
          `SELECT project_id, agent_id, EXISTS (SELECT 1 FROM thread_messages a WHERE a.run_id = m.run_id
             AND a.sender = 'agent') AS replied
           FROM thread_messages m WHERE m.run_id = ? AND m.sender = 'user' LIMIT 1`,
        )
        .all(run.id),
    )[0];
    if (!line || line.replied) return null;
    const p = store.projects.get(line.project_id);
    return {
      projectId: line.project_id,
      agentId: line.agent_id,
      orchestrator: p?.orchestratorId === line.agent_id,
    };
  };

  runtime.onFinished((run: Run) => {
    const t = turns.get(run.id) ?? turnOf(run);
    turns.delete(run.id);
    if (!t) return;
    busy.delete(key(t.projectId, t.agentId));
    replied(t, run);
  });

  /** The run's answer in its thread: a filed report, the director's plain words, the agent's result, or why not. */
  function replied(t: Turn, run: Run) {
    /* a turn that filed a report answers in one line pointing at it (spec-reports §1.2) */
    const filed = deps.reports.byRun(run.id).at(-1);
    if (filed) {
      const a = store.agents.get(t.agentId);
      const who = a ? shortName(a) : filed.author.name;
      insert(t.projectId, t.agentId, {
        sender: 'agent',
        kind: 'text',
        text: `${who} filed it — ${filed.title}.`,
        runId: run.id,
        reportId: filed.id,
      });
      return;
    }
    const ok = run.status === 'succeeded' && !!run.result?.trim();
    if (ok && t.orchestrator) return directorReplied(t, run);
    insert(t.projectId, t.agentId, {
      sender: 'agent',
      kind: ok ? 'text' : 'error',
      text: ok ? (run.result as string) : whyNoAnswer(run),
      runId: run.id,
    });
  }

  /** The newest HISTORY messages of one chat window, oldest first. */
  const messagesIn = (projectId: string, agentId: string, w: ChatWindow): ThreadMessage[] =>
    rows<Row>(
      db
        .prepare(
          `SELECT * FROM (SELECT *, rowid AS rid FROM thread_messages
             WHERE project_id = ? AND agent_id = ? AND created_at >= ? AND (? IS NULL OR created_at < ?)
             ORDER BY created_at DESC, rid DESC LIMIT ?) ORDER BY created_at, rid`,
        )
        .all(projectId, agentId, w.from, w.to, w.to, HISTORY),
    ).map(toMessage);
  const current = (projectId: string, agentId: string): ChatWindow => ({
    from: chats.currentStart(projectId, agentId),
    to: null,
  });
  /** The director's thread only (404 for anyone else's: other agents' chats are already split by run). */
  const directorOf = (projectId: string, agentId: string): Agent => {
    const p = store.projects.require(projectId);
    const s = seat(p, agentId);
    if (!s.orchestrator) throw notFound('Chat', `${agentId} new chat`);
    return s.agent;
  };

  return {
    /** After a restart: every chat turn the restart cut off (`runIds`, just marked interrupted) gets its reply. */
    recover(runIds: readonly string[]) {
      const runs = runsRepo(db);
      for (const id of runIds) {
        const run = runs.get(id);
        const t = run && turnOf(run);
        if (run && t) replied(t, run);
      }
    },

    /** The current chat (everything since the last New chat). */
    get(projectId: string, agentId: string): Thread {
      const p = store.projects.require(projectId);
      const { agent } = seat(p, agentId);
      const messages = messagesIn(projectId, agent.id, current(projectId, agent.id));
      return { projectId, agentId: agent.id, busy: busy.has(key(projectId, agent.id)), messages };
    },

    /** "New chat with Pixel": close the director's current chat when nothing runs; the next turn starts a fresh
        session. Throws 409 `work_running` (with the reason line) or `chat_empty`. */
    startNew(projectId: string, agentId: string): ThreadChat {
      const director = directorOf(projectId, agentId);
      const verdict = canStartNew({
        busy: busy.has(key(projectId, director.id)),
        sessions: deps.liveSessions?.(projectId) ?? [],
        asks: runtime.asks(projectId, 'open'),
        hasMessages: messagesIn(projectId, director.id, current(projectId, director.id)).length > 0,
        directorId: director.id,
        nameOf: (id) => shortName(store.agents.get(id)),
      });
      if (!verdict.ok)
        throw verdict.code === 'chat_empty'
          ? conflict('This chat is already new', { code: 'chat_empty' })
          : conflict(verdict.reason, { code: 'work_running', reason: verdict.reason });
      const closed = chats.close(projectId, director.id);
      setSession(projectId, director.id, { startedAt: now(), rotate: false });
      events.append('project', projectId, { type: 'thread.reset', payload: { agentId: director.id } });
      return closed;
    },

    /** The director's past chats, newest first. */
    chats(projectId: string, agentId: string): ThreadChat[] {
      return chats.list(projectId, directorOf(projectId, agentId).id);
    },

    /** One past chat's messages (read-only). */
    chatMessages(projectId: string, agentId: string, chatId: string): ThreadMessage[] {
      const id = directorOf(projectId, agentId).id;
      return messagesIn(projectId, id, chats.windowOf(projectId, id, chatId));
    },

    /** One user turn → a run. Resolves once the run started (the reply comes as an event). */
    say(
      projectId: string,
      agentId: string,
      text: string,
      opts: { reportId?: string } = {},
    ): { message: ThreadMessage; runId: string } {
      const p = store.projects.require(projectId);
      const s = seat(p, agentId);
      let resumeRunId = lastRunWithSession(projectId, s.agent.id);
      /* the orchestrator's long-resumed session drifts back to old ideas (F3: "four goals" after being told one) */
      let recap: string | null = null;
      let fresh = false;
      if (s.orchestrator) {
        const sess = sessionOf(projectId, s.agent.id);
        const turns = turnsSince(projectId, s.agent.id, sess?.started_at ?? '');
        if (!resumeRunId) fresh = true;
        else if (sess?.rotate || turns >= ROTATE_AFTER_TURNS) {
          recap = recapOf(projectId, s.agent.id);
          resumeRunId = null;
          fresh = true;
        }
      }
      const turn: Turn = {
        projectId,
        agentId: s.agent.id,
        orchestrator: s.orchestrator,
        ...(s.orchestrator ? { goalsBefore: new Set(work.goals(projectId).map((g) => g.id)) } : {}),
      };
      const tools = s.orchestrator
        ? (deps.directorTools?.(projectId, s.agent.id, { card: (o) => (turn.card = o) }) ?? [])
        : [];
      // an unknown report is a 404 before anything starts
      const task = taskFor(p, s, text, { tools }, opts.reportId, recap);
      const k = key(projectId, s.agent.id);
      /* an agent already at work (its chat turn or dispatched work): the message is a note it reads after its next step */
      const told = s.orchestrator ? null : runtime.tell(projectId, s.agent.id, 'the user', text);
      if (told) {
        const message = insert(projectId, s.agent.id, { sender: 'user', kind: 'text', text, runId: told.id });
        return { message, runId: told.id };
      }
      if (busy.has(k)) throw conflict(`${s.agent.name} is still answering your last message`);
      /* a newer message to the director: any open rebuild card goes stale (spec §3) */
      if (s.orchestrator) deps.rebuilds?.staleAll(projectId);
      /* start first: if the runtime says no (agent busy with work, no folder…), nothing is stored */
      const reporter = !!s.agent.roleId && !!store.roles.get(s.agent.roleId)?.reporter;
      const run = runtime.start(projectId, {
        agentId: s.agent.id,
        ...(s.teamId ? { teamId: s.teamId } : {}),
        task,
        /* the work clock: the director thinks; an agent's chat turn builds (a reporter's researches) */
        kind: s.orchestrator ? 'thinking' : reporter ? 'research' : 'building',
        asked: 'chat',
        ...(resumeRunId ? { resumeRunId } : {}),
        ...(s.orchestrator
          ? {
              caps: deps.orchestratorCaps ?? CREW_CAPS,
              bigPicture: {
                systemPrompt: orchestratorChatPrompt(s.agent, p.name, { tools }),
                ...(tools.length ? { tools } : {}),
              },
            }
          : {}),
      });
      busy.add(k);
      turns.set(run.id, turn);
      if (fresh) setSession(projectId, s.agent.id, { startedAt: now(), rotate: false });
      const message = insert(projectId, s.agent.id, {
        sender: 'user',
        kind: 'text',
        text,
        runId: run.id,
        ...(opts.reportId ? { reportId: opts.reportId } : {}),
      });
      turn.messageId = message.id;
      return { message, runId: run.id };
    },

    /** Record a line in a thread without a run: the user's goal and the orchestrator's plan reply (dispatch),
        the orchestrator's collaboration (re)design. */
    record(
      projectId: string,
      agentId: string,
      m: { sender: 'user' | 'agent'; kind?: ThreadMessage['kind']; text: string; goalId?: string | null },
    ): ThreadMessage {
      /* a new goal after one finished: the orchestrator's next chat turn starts a fresh session (with a recap) */
      if (m.sender === 'user' && m.goalId && agentId === store.projects.get(projectId)?.orchestratorId)
        noteNewGoal(projectId, agentId, m.goalId);
      return insert(projectId, agentId, {
        sender: m.sender,
        kind: m.kind ?? 'text',
        text: clip(m.text, 20_000),
        runId: null,
        goalId: m.goalId ?? null,
      });
    },
  };
}
export type Threads = ReturnType<typeof createThreads>;
