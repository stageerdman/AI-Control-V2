/* Project conversations (U1): the user chats with the project's orchestrator or any agent on
   the project. One thread per (project, agent); every user message is one turn = one run that
   resumes the thread's last session, in the project folder:

   - an agent runs with its normal composed prompt + tools (team context from its team on this project);
   - the orchestrator runs big picture: its own brain + altitude, only its whiteboard and features tools, no secrets, and a fresh
     summary of the whiteboard, features and health in every message. It decides whether the message is
     work (OFFICE: one Send): its answer is `{reply, work}` (director-reply.ts); work becomes a goal exactly
     as `POST /work` would, linked to this thread by goalId. It can also ask someone on the project a question
     (`ask`): the studio calls them (room.call — the office shows it) and relays their answer here.

   One turn at a time per thread; the runtime's rules still hold (one live run per agent per
   project, caps). The reply arrives later as a `thread.message` event and is stored; asks the run
   opens are answered on the existing asks endpoint. Secrets are redacted before anything is stored. */
import { randomUUID } from 'node:crypto';
import { planReply } from '../crew/dispatch.ts';
import { ORCHESTRATOR_ALTITUDE } from '../crew/prompts.ts';
import { CREW_CAPS } from '../crew/structured.ts';
import type { Agent } from '../db/agents.ts';
import type { Db } from '../db/connection.ts';
import type { Project } from '../db/projects.ts';
import type { Run } from '../db/runs.ts';
import type { Store } from '../db/store.ts';
import { now, type Row, rows } from '../db/util.ts';
import { type Goal, workRepo } from '../db/work.ts';
import { conflict } from '../errors.ts';
import type { EventLog } from '../events/log.ts';
import { redactSecrets } from '../events/redact.ts';
import type { Health } from '../health/health.ts';
import type { Reports } from '../reports/reports.ts';
import type { BridgeTool } from '../room/bridge.ts';
import type { Caps } from '../runtime/runner.ts';
import type { Runtime } from '../runtime/service.ts';
import { DIRECTOR_ANSWER, parseDirectorReply } from './director-reply.ts';
import { agentByName, type DirectorStopper } from './director-stop.ts';
import type { Features } from './features.ts';
import type { Offer, Rebuilds } from './rebuild-service.ts';
import { castAvailable, type Staffing } from './staffing.ts';

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
  hasTools = false,
): string {
  const know = hasTools
    ? 'The user is chatting with you in the project’s office, mostly by voice. Every message carries a fresh summary of the whiteboard, the features list, the team and the latest health check — that is what you know about the work. Your only tools are the whiteboard tools and the features tools.'
    : 'The user is chatting with you in the project’s office, mostly by voice. You have no tools: every message carries a fresh summary of the whiteboard, the features list, the team and the latest health check — that is what you know about the work.';
  const tools = hasTools
    ? [
        'Whiteboard tools — every change shows on the board at once and is logged under your name. Look with `whiteboard` first to get ids.',
        '- New work the user wants: `add_goal` (1–8 tasks you choose, in order, each for a team captain or specialist). A step missing from a goal: `add_task`.',
        '- Wording, brief, owner, order, parallel or status of something already there: `edit_task` / `edit_goal`. A failed task to try again: `edit_task` status todo. A goal to stop: `edit_goal` status cancelled.',
        '- Something wrong, duplicate or no longer wanted: `remove_from_board`.',
        '- Tidying: after a goal ships, or when finished or stopped goals crowd the board, `clean_board` (finished or stopped; all only when the user asks for a fresh board).',
        '- Took off the wrong thing, or the user wants it back: `undo_board` (within a day); `board_history` shows who changed what and when.',
        'A change that touches running work is refused unless you pass force: true — do that only when the user clearly wants the work stopped, and say whose work you stopped.',
        '',
        'Features tools — the features list (Now / Planned / Shipped) is separate from the whiteboard: it is what the product has and will have, not work in progress. Look with `features` first to get ids.',
        '- "Add X to the features list" / "put X on the roadmap": `add_feature` (Planned unless the user says otherwise). It does not start work — never also put it on the whiteboard unless the user asks for the work.',
        '- Rename, describe, move between Now / Planned / Shipped, reorder, progress or owner: `edit_feature`. Wrong or no longer wanted: `remove_feature`.',
      ].join('\n')
    : '';
  return [
    `# ${orch.name}`,
    `You are ${orch.name} (${orch.role}), the orchestrator of the project "${project}" in AI Studio.\n\n${orch.prompt.trim()}`,
    `## Your altitude\n\n${ORCHESTRATOR_ALTITUDE}`,
    [
      '## How you talk here',
      '',
      know,
      `What you can do from here (each message says how): put work on the whiteboard, ${hasTools ? 'add and change features on the features list, ' : ''}continue work that stopped partway, stop anyone’s work (or everything) at once, bring Cast people and teams onto the project, and ask anyone on the project a question — the studio relays their answer into this chat. When the user wants one of these, do it in this answer instead of saying you can’t or offering to. Only for something truly outside these, say so in one line and offer ${hasTools ? 'to add it to the features list as Planned, or ' : ''}to put the work on the whiteboard as a goal.`,
      ...(tools ? [tools] : []),
      'How the whiteboard runs: items run in checklist order. An item is "running" once its owner has been briefed and is working; a "todo" item is waiting its turn — `waitsFor` names the step it waits on, and its owner is briefed automatically the moment that step is done. A captain splits a team item into `team` sub-tasks for members. Explain waiting and progress from this, plainly ("Jony starts when Blair’s design lands").',
      'Names come from voice and can be misheard ("Ivy" for "Ally", "Johnny" for "Jony"). Match an unknown name to the closest person on the project, say who you took it as, and carry on — ask only when two people fit.',
      'The summary is the truth about the project right now. Where it disagrees with anything said earlier in this chat — how many goals there are, what they are, who is on the project, what shipped — trust the summary and drop the older idea. Never bring back a goal or plan the summary does not show as active unless the user asks for it.',
      'Answer in plain, friendly words, a few short sentences, no jargon. Steer: priorities, who carries what, what is next.',
      'You do not do the work yourself. When the user clearly asks for work, you put it on the whiteboard as ONE goal (each message says how) and break it into checklist items right after — the user does not split it; say which of the people on the project (the summary’s "people") you will brief. When it is only an idea or a question, answer and ask first. Details belong to the teams — the user can tap any agent to talk to them directly.',
      'Research, comparisons, reviews and write-ups end in a report in the Reports tray, filed by a reporter (a role or team marked "files reports"). Route such requests to a reporter on the project; if nobody on it files reports, say so in one line and offer to add one. You never write reports yourself. "Any new reports?" → list the unread titles from the summary.',
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
  /** Make a goal exactly as `POST /work` would (dispatch.start), without its own thread lines. Absent → the
      director's work answers are replies only. */
  startWork?: (projectId: string, goal: string) => Promise<Goal>;
  /** The director staffs the project from chat (office/staffing.ts). */
  staffing?: Staffing;
  /** The director rebuilds teams from chat (office/rebuild-service.ts). */
  rebuilds?: Rebuilds;
  /** Continue a stopped goal where it was (dispatch.resume). Absent → the director can't. */
  resumeGoal?: (projectId: string, goalId: string) => Goal;
  /** The director asks someone a question (room.call from the director) → their answer. */
  ask?: (projectId: string, directorId: string, to: string, request: string) => Promise<string>;
  /** The director sees what is running and stops it (one agent, or everything). Absent → it can't. */
  stops?: DirectorStopper;
  /** The director's chat tools for this project: whiteboard (src/whiteboard/tools.ts) and features
      (office/feature-tools.ts). Absent → it has none. */
  directorTools?: (projectId: string, directorId: string) => BridgeTool[];
}) {
  const { db, store, events, runtime } = deps;
  const work = workRepo(db);
  /** runId → the thread its reply belongs to (+ the user's message, for the orchestrator's work) */
  const turns = new Map<
    string,
    { projectId: string; agentId: string; orchestrator: boolean; messageId?: string }
  >();
  const key = (projectId: string, agentId: string) => `${projectId}\u0000${agentId}`;
  const busy = new Set<string>();
  const scrub = (s: string) => redactSecrets(s, deps.secretValues()).value;

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

  /** Who the user may talk to here: the orchestrator, a specialist, or a member of a project team. */
  function seat(p: Project, agentId: string): { agent: Agent; teamId: string | null; orchestrator: boolean } {
    const agent = store.agents.require(store.agents.ref(agentId).id);
    if (agent.id === p.orchestratorId) return { agent, teamId: null, orchestrator: true };
    const teamId = p.teamIds.find((t) => store.teams.get(t)?.members.some((m) => m.agentId === agent.id));
    if (teamId) return { agent, teamId, orchestrator: false };
    if (p.agentIds.includes(agent.id)) return { agent, teamId: null, orchestrator: false };
    if (store.guests.get(p.id, agent.id)) return { agent, teamId: null, orchestrator: false }; // brought in by the user
    throw conflict(`${agent.name} isn’t on ${p.name}`, { agentId: agent.id });
  }

  /** The last session of this thread, to resume (null → a fresh one). */
  const lastRunWithSession = (projectId: string, agentId: string): string | null =>
    rows<{ run_id: string }>(
      db
        .prepare(
          `SELECT m.run_id FROM thread_messages m JOIN runs r ON r.id = m.run_id
           WHERE m.project_id = ? AND m.agent_id = ? AND r.agent_id = m.agent_id AND r.session_id IS NOT NULL
           ORDER BY m.created_at DESC, m.rowid DESC LIMIT 1`,
        )
        .all(projectId, agentId),
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
           ORDER BY created_at DESC, rowid DESC LIMIT ?`,
        )
        .all(projectId, agentId, RECAP),
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
        howWeWork: p.collaboration?.summary ?? 'You brief the team captains; no review gates.',
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
      /* stopped partway (still on the board): the director can continue them — `resume` by n */
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
      ...(deps.stops ? { runningNow: deps.stops.runningNow(p.id) } : {}),
      unreadReports: deps.reports.unreadTitles(p.id),
      openQuestions: runtime
        .asks(p.id, 'open')
        .map((a) => ({ from: name(a.agentId), question: clip(a.question, 200) })),
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
    s: ReturnType<typeof seat>,
    text: string,
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
        DIRECTOR_ANSWER,
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

  /** The director said "work": the goal goes on the whiteboard (dispatch), the turn's lines carry its goalId,
      then the plan reply — or why it couldn't be planned. */
  function startWork(t: { projectId: string; agentId: string }, goal: string, lines: (string | undefined)[]) {
    const name = (id: string) => store.agents.get(id)?.name ?? id;
    (deps.startWork as NonNullable<typeof deps.startWork>)(t.projectId, goal).then(
      (g) => {
        const ids = lines.filter((x): x is string => !!x);
        for (const id of ids) db.prepare('UPDATE thread_messages SET goal_id = ? WHERE id = ?').run(g.id, id);
        noteNewGoal(t.projectId, t.agentId, g.id);
        insert(t.projectId, t.agentId, {
          sender: 'agent',
          kind: 'text',
          text: clip(planReply(g, name), 20_000),
          runId: null,
          goalId: g.id,
        });
      },
      (e: unknown) =>
        insert(t.projectId, t.agentId, {
          sender: 'agent',
          kind: 'error',
          text: `I couldn’t plan that: ${clip(e instanceof Error ? e.message : String(e), 2000)}`,
          runId: null,
        }),
    );
  }

  /** The director continues stopped goals (the summary's `stopped`, by number): each says what's back on, or why not. */
  function resumeFor(t: { projectId: string; agentId: string }, picks: number[]) {
    const stopped = work.goals(t.projectId).filter((g) => g.status === 'failed');
    for (const n of new Set(picks)) {
      const g = stopped[n - 1];
      if (!g) continue;
      try {
        (deps.resumeGoal as NonNullable<typeof deps.resumeGoal>)(t.projectId, g.id);
        insert(t.projectId, t.agentId, {
          sender: 'agent',
          kind: 'text',
          text: clip(`Back on the whiteboard: ${g.summary}`, 2000),
          runId: null,
          goalId: g.id,
        });
      } catch (e) {
        insert(t.projectId, t.agentId, {
          sender: 'agent',
          kind: 'error',
          text: `I couldn’t continue “${clip(g.text, 80)}”: ${clip(e instanceof Error ? e.message : String(e), 500)}`,
          runId: null,
        });
      }
    }
  }

  /** The director asks someone on the project: their answer (or why not) lands in the director's thread. */
  function askFor(t: { projectId: string; agentId: string }, a: { to: string; question: string }) {
    const p = store.projects.require(t.projectId);
    const fail = (why: string) =>
      insert(t.projectId, t.agentId, { sender: 'agent', kind: 'error', text: clip(why, 2000), runId: null });
    const who = agentByName(store, a.to);
    let callee: Agent;
    try {
      if (!who || who.id === p.orchestratorId) throw new Error();
      callee = seat(p, who.id).agent;
    } catch {
      fail(`I couldn’t ask ${a.to}: nobody by that name is on ${p.name}.`);
      return;
    }
    const director = store.agents.get(t.agentId)?.name ?? 'The director';
    /* running goals, and stopped ones (still on the board: "my whiteboard is empty" was wrong) */
    const theirs = work
      .goals(p.id)
      .filter((g) => g.status === 'running' || g.status === 'failed')
      .flatMap((g) =>
        g.items.flatMap((i) => [i, ...i.subtasks]).map((i) => ({ i, stopped: g.status === 'failed' })),
      )
      .filter(({ i }) => i.agentId === callee.id)
      .map(({ i, stopped }) => ({
        step: clip(i.text, 160),
        status: i.status,
        ...(stopped ? { goal: 'stopped partway — the director can continue it' } : {}),
      }));
    const request = [
      `${director}, your orchestrator, asks you this for the user: ${json(a.question)}`,
      `Your steps on the whiteboard now: ${json(theirs)}`,
      'Answer in two to four short, plain sentences — the user reads it in the office chat.',
    ].join('\n');
    const nick = callee.nick || callee.name.split(' ')[0];
    (deps.ask as NonNullable<typeof deps.ask>)(p.id, t.agentId, callee.name, request).then(
      (answer) =>
        insert(t.projectId, t.agentId, {
          sender: 'agent',
          kind: 'text',
          text: `${nick}: “${clip(answer.trim(), 600)}”`,
          runId: null,
        }),
      () => fail(`Couldn’t reach ${nick} just now — want me to try again?`),
    );
  }

  runtime.onFinished((run: Run) => {
    const t = turns.get(run.id);
    if (!t) return;
    turns.delete(run.id);
    busy.delete(key(t.projectId, t.agentId));
    /* a turn that filed a report answers in one line pointing at it (spec-reports §1.2) */
    const filed = deps.reports.byRun(run.id).at(-1);
    if (filed) {
      const a = store.agents.get(t.agentId);
      const who = a?.nick ?? a?.name.split(' ')[0] ?? filed.author.name;
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
    if (ok && t.orchestrator) {
      const d = parseDirectorReply(run.result as string);
      /* a rebuild rides on the reply: a confirm card, or (nothing to decide) applied at once with its Undo */
      let rebuild: Offer | null = null;
      let rebuildError: string | null = null;
      if (d.rebuild && deps.rebuilds) {
        try {
          const offer = deps.rebuilds.plan(t.projectId, d.rebuild);
          if (offer.needsConfirm) rebuild = offer;
          else {
            const done = deps.rebuilds.apply(offer.planId, {}, t.agentId);
            rebuild = { ...offer, card: done.card, undoToken: done.undoToken, summary: done.summary };
          }
        } catch (e) {
          rebuildError = clip(e instanceof Error ? e.message : String(e), 2000);
        }
      }
      const reply = insert(t.projectId, t.agentId, {
        sender: 'agent',
        kind: 'text',
        text: d.reply,
        runId: run.id,
        rebuild,
      });
      if (rebuildError)
        insert(t.projectId, t.agentId, {
          sender: 'agent',
          kind: 'error',
          text: `I couldn’t change the teams: ${rebuildError}`,
          runId: null,
        });
      if (d.stop && deps.stops)
        for (const line of deps.stops.apply(t.projectId, d.stop))
          insert(t.projectId, t.agentId, { sender: 'agent', ...line, runId: null });
      if (d.staff && deps.staffing) {
        try {
          deps.staffing.apply(t.projectId, d.staff, t.agentId);
        } catch (e) {
          insert(t.projectId, t.agentId, {
            sender: 'agent',
            kind: 'error',
            text: `I couldn’t set up the people: ${clip(e instanceof Error ? e.message : String(e), 2000)}`,
            runId: null,
          });
          return; // no work on a team that isn't there
        }
      }
      if (d.goal && deps.startWork) startWork(t, d.goal, [t.messageId, reply.id]);
      if (d.resume && deps.resumeGoal) resumeFor(t, d.resume);
      if (d.ask && deps.ask) askFor(t, d.ask);
      return;
    }
    insert(t.projectId, t.agentId, {
      sender: 'agent',
      kind: ok ? 'text' : 'error',
      text: ok
        ? (run.result as string)
        : run.status === 'cancelled'
          ? 'Stopped by you before I could answer. Ask me to carry on any time.'
          : `I couldn’t finish that: ${clip(run.error ?? 'no answer', 2000)}`,
      runId: run.id,
    });
  });

  return {
    get(projectId: string, agentId: string): Thread {
      const p = store.projects.require(projectId);
      const { agent } = seat(p, agentId);
      const messages = rows<Row>(
        db
          .prepare(
            `SELECT * FROM (SELECT *, rowid AS rid FROM thread_messages WHERE project_id = ? AND agent_id = ?
             ORDER BY created_at DESC, rid DESC LIMIT ?) ORDER BY created_at, rid`,
          )
          .all(projectId, agent.id, HISTORY),
      ).map(toMessage);
      return { projectId, agentId: agent.id, busy: busy.has(key(projectId, agent.id)), messages };
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
      const task = taskFor(p, s, text, opts.reportId, recap); // an unknown report is a 404 before anything starts
      const k = key(projectId, s.agent.id);
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
        ...(resumeRunId ? { resumeRunId } : {}),
        ...(s.orchestrator
          ? {
              caps: deps.orchestratorCaps ?? CREW_CAPS,
              bigPicture: {
                systemPrompt: orchestratorChatPrompt(s.agent, p.name, !!deps.directorTools),
                ...(deps.directorTools ? { tools: deps.directorTools(projectId, s.agent.id) } : {}),
              },
            }
          : {}),
      });
      busy.add(k);
      const turn: { projectId: string; agentId: string; orchestrator: boolean; messageId?: string } = {
        projectId,
        agentId: s.agent.id,
        orchestrator: s.orchestrator,
      };
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
