/* Project conversations (U1): the user chats with the project's orchestrator or any agent on
   the project. One thread per (project, agent); every user message is one turn = one run that
   resumes the thread's last session, in the project folder:

   - an agent runs with its normal composed prompt + tools (team context from its team on this project);
   - the orchestrator runs big picture: its own brain + altitude, NO tools, no secrets, and a fresh
     summary of the whiteboard, features and health in every message.

   One turn at a time per thread; the runtime's rules still hold (one live run per agent per
   project, caps). The reply arrives later as a `thread.message` event and is stored; asks the run
   opens are answered on the existing asks endpoint. Secrets are redacted before anything is stored. */
import { randomUUID } from 'node:crypto';
import { ORCHESTRATOR_ALTITUDE } from '../crew/prompts.ts';
import { CREW_CAPS } from '../crew/structured.ts';
import type { Agent } from '../db/agents.ts';
import type { Db } from '../db/connection.ts';
import type { Project } from '../db/projects.ts';
import type { Run } from '../db/runs.ts';
import type { Store } from '../db/store.ts';
import { now, type Row, rows } from '../db/util.ts';
import { workRepo } from '../db/work.ts';
import { conflict } from '../errors.ts';
import type { EventLog } from '../events/log.ts';
import { redactSecrets } from '../events/redact.ts';
import type { Health } from '../health/health.ts';
import type { Runtime } from '../runtime/service.ts';
import type { Features } from './features.ts';

export type ThreadMessage = {
  id: string;
  /** 'user' or the thread's agent id (the prototype's `from`). */
  from: string;
  kind: 'text' | 'error';
  text: string;
  runId: string | null;
  at: string;
};
export type Thread = { projectId: string; agentId: string; busy: boolean; messages: ThreadMessage[] };

const HISTORY = 200;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const json = (v: unknown) => JSON.stringify(v);

/** The orchestrator's office-chat prompt: its brain, big-picture altitude, plain-words replies. */
export function orchestratorChatPrompt(
  orch: Pick<Agent, 'name' | 'role' | 'prompt'>,
  project: string,
): string {
  return [
    `# ${orch.name}`,
    `You are ${orch.name} (${orch.role}), the orchestrator of the project "${project}" in AI Studio.\n\n${orch.prompt.trim()}`,
    `## Your altitude\n\n${ORCHESTRATOR_ALTITUDE}`,
    [
      '## How you talk here',
      '',
      'The user is chatting with you in the project’s office. You have no tools: every message carries a fresh summary of the whiteboard, the features folder and the latest health check — that is what you know about the work.',
      'Answer in plain, friendly words, a few short sentences, no jargon. Steer: priorities, who carries what, what is next.',
      'You do not do the work yourself. When the user wants something built, suggest they post it as a goal on the whiteboard, and say which team or specialist you would brief. Details belong to the teams — the user can tap any agent to talk to them directly.',
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
  /** Every known secret value (the global cabinet) — scrubbed from stored text. */
  secretValues: () => string[];
}) {
  const { db, store, events, runtime } = deps;
  const work = workRepo(db);
  /** runId → the thread its reply belongs to */
  const turns = new Map<string, { projectId: string; agentId: string }>();
  const key = (projectId: string, agentId: string) => `${projectId}\u0000${agentId}`;
  const busy = new Set<string>();
  const scrub = (s: string) => redactSecrets(s, deps.secretValues()).value;

  const toMessage = (r: Row): ThreadMessage => ({
    id: r.id as string,
    from: r.sender === 'user' ? 'user' : (r.agent_id as string),
    kind: r.kind as ThreadMessage['kind'],
    text: r.text as string,
    runId: (r.run_id as string | null) ?? null,
    at: r.created_at as string,
  });
  const insert = (
    projectId: string,
    agentId: string,
    m: { sender: 'user' | 'agent'; kind: ThreadMessage['kind']; text: string; runId: string | null },
  ): ThreadMessage => {
    const id = randomUUID();
    const text = scrub(m.text);
    const at = now();
    db.prepare(
      'INSERT INTO thread_messages (id, project_id, agent_id, sender, kind, text, run_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(id, projectId, agentId, m.sender, m.kind, text, m.runId, at);
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
        },
      });
    } catch {
      /* the message is stored; a bad event line never loses it */
    }
    return { id, from: m.sender === 'user' ? 'user' : agentId, kind: m.kind, text, runId: m.runId, at };
  };

  /** Who the user may talk to here: the orchestrator, a specialist, or a member of a project team. */
  function seat(p: Project, agentId: string): { agent: Agent; teamId: string | null; orchestrator: boolean } {
    const agent = store.agents.require(store.agents.ref(agentId).id);
    if (agent.id === p.orchestratorId) return { agent, teamId: null, orchestrator: true };
    const teamId = p.teamIds.find((t) => store.teams.get(t)?.members.some((m) => m.agentId === agent.id));
    if (teamId) return { agent, teamId, orchestrator: false };
    if (p.agentIds.includes(agent.id)) return { agent, teamId: null, orchestrator: false };
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

  /** What the orchestrator knows, fresh each turn: whiteboard, features, health, open asks. */
  function summary(p: Project) {
    const name = (id: string) => store.agents.get(id)?.name ?? store.teams.get(id)?.name ?? id;
    const goals = work.goals(p.id).slice(0, 3);
    const health = deps.health.latest(p.id);
    return {
      project: { name: p.name, about: p.note, progress: p.progress },
      whiteboard: goals.map((g) => ({
        goal: clip(g.text, 300),
        status: g.status,
        pct: g.pct,
        items: g.items.map((i) => ({ text: i.text, owner: name(i.agentId), status: i.status })),
      })),
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
      openQuestions: runtime
        .asks(p.id, 'open')
        .map((a) => ({ from: name(a.agentId), question: clip(a.question, 200) })),
    };
  }

  function taskFor(p: Project, s: ReturnType<typeof seat>, text: string): string {
    if (s.orchestrator)
      return [`Studio summary right now: ${json(summary(p))}`, `The user says: ${json(text)}`].join('\n\n');
    const orch = store.agents.get(p.orchestratorId)?.name ?? 'the orchestrator';
    return [
      'The user is talking with you directly in the AI Studio office chat — a conversation, not a checklist item.',
      `The user says: ${json(text)}`,
      `Reply in plain, friendly words. If they ask you to change something, do it here in the project folder, then say what you did. Big-picture questions (priorities, scope, who does what) belong to ${orch}, the orchestrator — point them there.`,
    ].join('\n\n');
  }

  runtime.onFinished((run: Run) => {
    const t = turns.get(run.id);
    if (!t) return;
    turns.delete(run.id);
    busy.delete(key(t.projectId, t.agentId));
    const ok = run.status === 'succeeded' && !!run.result?.trim();
    insert(t.projectId, t.agentId, {
      sender: 'agent',
      kind: ok ? 'text' : 'error',
      text: ok
        ? (run.result as string)
        : run.status === 'cancelled'
          ? 'Stopped before I could answer.'
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
    say(projectId: string, agentId: string, text: string): { message: ThreadMessage; runId: string } {
      const p = store.projects.require(projectId);
      const s = seat(p, agentId);
      const k = key(projectId, s.agent.id);
      if (busy.has(k)) throw conflict(`${s.agent.name} is still answering your last message`);
      const resumeRunId = lastRunWithSession(projectId, s.agent.id);
      /* start first: if the runtime says no (agent busy with work, no folder…), nothing is stored */
      const run = runtime.start(projectId, {
        agentId: s.agent.id,
        ...(s.teamId ? { teamId: s.teamId } : {}),
        task: taskFor(p, s, text),
        ...(resumeRunId ? { resumeRunId } : {}),
        ...(s.orchestrator
          ? { caps: CREW_CAPS, bigPicture: { systemPrompt: orchestratorChatPrompt(s.agent, p.name) } }
          : {}),
      });
      busy.add(k);
      turns.set(run.id, { projectId, agentId: s.agent.id });
      const message = insert(projectId, s.agent.id, { sender: 'user', kind: 'text', text, runId: run.id });
      return { message, runId: run.id };
    },
  };
}
export type Threads = ReturnType<typeof createThreads>;
