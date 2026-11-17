/* The office's endpoints + wire types (server/README.md: office view, threads, features, asks inbox).
   Everything else the office reads (work, health, access, asks, agents, teams) is in api/studio.ts. */
import {
  type Collaboration,
  type CollaborationView,
  http,
  type ProjectApp,
  type ProjectStatus,
  type Workflow,
  type WorkflowsView,
} from '../../api';
import type { RebuildOffer } from './rebuild/api';

const e = encodeURIComponent;

export type AgentStatusName = 'idle' | 'working' | 'waiting' | 'blocked' | 'done';
export type ServerActivity = { kind: string; label: string; detail?: string; target?: string };
/** An agent's latest status as the office view reports it (no `since` = never reported here). */
export type AgentStatus = {
  status: AgentStatusName;
  activity?: ServerActivity;
  runId?: string;
  since?: string;
};
export type OfficeTeam = {
  id: string;
  name: string;
  color: string;
  emblem: string;
  captain: string | null;
  members: string[];
};
/** GET /projects/:id/office — the prototype's office-config shape + live status. */
export type OfficeView = {
  project: string;
  name: string;
  /** The orchestrator's agent id. */
  director: string;
  teams: OfficeTeam[];
  solo: string[];
  /** STUDIO LIFE: who the user brought in (they're also in `solo`). */
  guests?: { agentId: string; brief: string; orchestratorMay: boolean }[];
  agents: Record<string, AgentStatus>;
  lastEventId: number;
  /** F1b lifecycle: moves on its own (live / needs / idle). */
  status?: ProjectStatus;
  /** Overall progress: features shipped / total, else the current goal's %; `target` labels it. */
  progress?: OfficeProgress;
};
export type OfficeProgress = {
  pct: number;
  shipped: number;
  total: number;
  target: string | null;
  goal: { id: string; text: string; pct: number; status: string } | null;
};

export type FeatureStatus = 'now' | 'planned' | 'shipped';
export type Feature = {
  id: string;
  projectId: string;
  name: string;
  status: FeatureStatus;
  /** 1-based inside its status group. */
  order: number;
  pct: number | null;
  owner: string | null;
  description: string;
  vision: string;
  createdAt: string;
  updatedAt: string;
};
export type FeatureCreate = Partial<
  Pick<Feature, 'status' | 'order' | 'pct' | 'owner' | 'description' | 'vision'>
> & {
  name: string;
};
export type FeaturePatch = Partial<Omit<FeatureCreate, never>>;

export type ThreadMessage = {
  id: string;
  /** 'user' or the thread's agent id. */
  from: string;
  kind: 'text' | 'error';
  text: string;
  runId: string | null;
  reportId: string | null;
  /** The goal this line belongs to (the orchestrator's thread records goals). */
  goalId?: string | null;
  /** A team rebuild a director reply carries: the confirm card, or (applied at once) its Undo. */
  rebuild?: RebuildOffer | null;
  at: string;
};
export type Thread = { projectId: string; agentId: string; busy: boolean; messages: ThreadMessage[] };
/** A past chat of the director's thread (server/src/office/thread-chats.ts). */
export type ThreadChat = {
  id: string;
  /** Its first user line ('' when the user never wrote in it). */
  title: string;
  lastText: string | null;
  startedAt: string;
  endedAt: string;
  messageCount: number;
};

/** GET /asks — the pager's view of open asks across every project. */
export type StudioAsk = {
  id: string;
  projectId: string;
  projectName: string;
  agentId: string;
  agentName: string;
  runId: string;
  question: string;
  options: string[] | null;
  status: 'open' | 'answered' | 'cancelled';
  since: string;
  seen: boolean;
  /** A page from the director (news about finished work), not a question — clears when you visit the office. */
  news?: boolean;
};

/** The office's work clock (GET /projects/:id/time): agent time, by kind and by agent; runs and turns, no money. */
export type WorkKind = 'thinking' | 'building' | 'reviewing' | 'research' | 'setup';
export type WorkTime = {
  totalMs: number;
  byKind: { kind: WorkKind; label: string; ms: number }[];
  byAgent: { agentId: string; ms: number; runs: number }[];
  runs: number;
  turns: number;
  since: string | null;
  /** Runs going on right now (the clock counts up while > 0). */
  live: number;
};

/** How the team works (GET /projects/:id/performance — server/src/performance/tally.ts). No money anywhere. */
export type PerfRange = '7d' | '30d' | 'all';
export type Measures = { ms: number; tokens: number; requests: number };
export type AgentPerformance = Measures & {
  agentId: string;
  turns: number;
  /** fresh = input + output + cache write; reread = cache read. */
  split: { fresh: number; reread: number };
  asked: { task: number; call: number; chat: number };
  stopped: number;
  lastAskedAt: string;
  live: boolean;
  previous: Measures | null;
  kinds: Record<WorkKind, number>;
};
export type Performance = {
  range: PerfRange;
  from: string;
  to: string;
  since: string | null;
  live: number;
  totals: Measures;
  previous: Measures | null;
  /** Spans in the range without a token count (older crew calls). */
  unmeasured: number;
  agents: AgentPerformance[];
  /** Every local day of the range, oldest first; `day` = YYYY-MM-DD. */
  days: (Measures & { day: string; byAgent: Record<string, Measures> })[];
};

/** One saved chat (a run) — server/src/db/chats.ts. */
export type ChatSummary = {
  runId: string;
  agentId: string;
  projectId: string;
  task: string;
  status: 'running' | 'succeeded' | 'failed' | 'cancelled';
  sessionId: string | null;
  startedAt: string;
  endedAt: string | null;
  messageCount: number;
  lastText: string | null;
};
/** GET /agents/:id/recap — the agent's own words about its last chat. */
export type Recap = { recap: string | null; chat: ChatSummary | null; cached: boolean };

/** One saved line of a chat — server/src/db/chats.ts. */
export type ChatMessage = {
  id: string;
  runId: string;
  projectId: string;
  agentId: string;
  seq: number;
  role: 'user' | 'assistant' | 'tool' | 'system';
  text: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
};
/** POST /chats/:runId/messages — my line and the agent's answer, both saved. */
export type ChatReply = { sent: ChatMessage; reply: ChatMessage };

const recap = (agentId: string) => http.get<Recap>(`/agents/${e(agentId)}/recap`);
/** The server's largest page (server/src/routes/chats.ts). */
export const CHAT_PAGE = 100;
type ChatPage = (before: string | undefined) => Promise<ChatSummary[]>;
/** Every chat, newest first: pages back by `startedAt` until a short page — History lists them all, not the first 20. */
export async function collectChats(page: ChatPage): Promise<ChatSummary[]> {
  const all: ChatSummary[] = [];
  for (;;) {
    const next = await page(all.at(-1)?.startedAt);
    all.push(...next);
    if (next.length < CHAT_PAGE) return all;
  }
}
const chatPage = (agentId: string) => (before: string | undefined) =>
  http.get<ChatSummary[]>(
    `/agents/${e(agentId)}/chats?limit=${CHAT_PAGE}${before ? `&before=${encodeURIComponent(before)}` : ''}`,
  );
/** Newest first, all of them. */
export const listAgentChats = (agentId: string) => collectChats(chatPage(agentId));
export const getChatMessages = (runId: string) => http.get<ChatMessage[]>(`/chats/${e(runId)}/messages`);
/** Keep writing in a finished chat. 409 `chat_running` (live run), 502 `agent_error` (model failed). */
export const sendChatMessage = (runId: string, text: string) =>
  http.post<ChatReply>(`/chats/${e(runId)}/messages`, { text });
/** "Start it" under a reply that offered work (meta.offer): a whiteboard goal for this agent + the chat's new line. */
export const startChatWork = (runId: string, seq: number) =>
  http.post<{ message: ChatMessage; goalId: string }>(`/chats/${e(runId)}/start`, { seq });

export const officeApi = {
  recap,
  listAgentChats,
  getChatMessages,
  sendChatMessage,
  startChatWork,
  office: (pid: string) => http.get<OfficeView>(`/projects/${e(pid)}/office`),
  features: (pid: string) => http.get<Feature[]>(`/projects/${e(pid)}/features`),
  createFeature: (pid: string, body: FeatureCreate) =>
    http.post<Feature>(`/projects/${e(pid)}/features`, body),
  updateFeature: (pid: string, fid: string, body: FeaturePatch) =>
    http.patch<Feature>(`/projects/${e(pid)}/features/${e(fid)}`, body),
  deleteFeature: (pid: string, fid: string) => http.del<void>(`/projects/${e(pid)}/features/${e(fid)}`),
  thread: (pid: string, agentId: string) =>
    http.get<Thread>(`/projects/${e(pid)}/threads/${e(agentId)}/messages`),
  /** One turn; `reportId` = a follow-up on that report (the run gets the report itself). */
  say: (pid: string, agentId: string, text: string, reportId?: string) =>
    http.post<{ message: ThreadMessage; runId: string }>(
      `/projects/${e(pid)}/threads/${e(agentId)}/messages`,
      reportId ? { text, reportId } : { text },
    ),
  /** "New chat with Pixel": closes the live chat (201 = the chat that closed); 409 work_running / chat_empty. */
  newChat: (pid: string, agentId: string) =>
    http.post<ThreadChat>(`/projects/${e(pid)}/threads/${e(agentId)}/new`, {}),
  /** The director's past chats, newest first. */
  threadChats: (pid: string, agentId: string) =>
    http.get<ThreadChat[]>(`/projects/${e(pid)}/threads/${e(agentId)}/chats`),
  threadChatMessages: (pid: string, agentId: string, chatId: string) =>
    http.get<ThreadMessage[]>(`/projects/${e(pid)}/threads/${e(agentId)}/chats/${e(chatId)}/messages`),
  collaboration: (pid: string) => http.get<CollaborationView>(`/projects/${e(pid)}/collaboration`),
  setCollaboration: (pid: string, c: Collaboration) =>
    http.put<CollaborationView>(`/projects/${e(pid)}/collaboration`, c),
  workflows: (pid: string) => http.get<WorkflowsView>(`/projects/${e(pid)}/workflows`),
  /** The whole list (the first is the usual way); 422 details pin to `workflows.N.graph.…`. */
  saveWorkflows: (pid: string, workflows: Workflow[]) =>
    http.put<WorkflowsView>(`/projects/${e(pid)}/workflows`, {
      workflows: workflows.map(({ id, name, when, orchestratorTalksTo, gates, maxSendBacks, summary, graph }) => ({
        id,
        name,
        when,
        orchestratorTalksTo,
        gates,
        maxSendBacks,
        summary,
        ...(graph ? { graph } : {}),
      })),
    }),
  designCollaboration: (pid: string, ask?: string) =>
    http.post<{ reply: string; collaboration: Collaboration; workflows?: Workflow[] }>(
      `/projects/${e(pid)}/collaboration/design`,
      ask ? { ask } : {},
    ),
  progress: (pid: string) =>
    http.get<OfficeView>(`/projects/${e(pid)}/office`).then((o) => o.progress ?? null),
  app: (pid: string) => http.get<ProjectApp>(`/projects/${e(pid)}/app`),
  startApp: (pid: string) => http.post<ProjectApp>(`/projects/${e(pid)}/app/start`, {}),
  stopApp: (pid: string) => http.post<ProjectApp>(`/projects/${e(pid)}/app/stop`, {}),
  setAppCommand: (pid: string, command: string) =>
    http.patch<ProjectApp>(`/projects/${e(pid)}/app`, { command }),
  time: (pid: string) => http.get<WorkTime>(`/projects/${e(pid)}/time`),
  /** `tz` = this browser's getTimezoneOffset(), so days are the user's local days. */
  performance: (pid: string, range: PerfRange) =>
    http.get<Performance>(
      `/projects/${e(pid)}/performance?range=${range}&tz=${new Date().getTimezoneOffset()}`,
    ),
  studioAsks: () => http.get<StudioAsk[]>('/asks?unseen=true'),
  seen: (projectId: string) => http.post<{ seen: number }>('/asks/seen', { projectId }),
};

/** Query keys (strings; invalidate by prefix). */
export const keys = {
  office: (pid: string) => `officeview:${pid}`,
  features: (pid: string) => `office:${pid}:features`,
  work: (pid: string) => `office:${pid}:work`,
  health: (pid: string) => `office:${pid}:health`,
  asks: (pid: string) => `office:${pid}:asks`,
  access: (pid: string) => `office:${pid}:access`,
  thread: (pid: string, agentId: string) => `office:${pid}:thread:${agentId}`,
  threadChats: (pid: string, agentId: string) => `office:${pid}:threadchats:${agentId}`,
  threadChat: (pid: string, agentId: string, chatId: string) =>
    `office:${pid}:threadchats:${agentId}:${chatId}`,
  collaboration: (pid: string) => `office:${pid}:collaboration`,
  /** Under `collaboration`: a (re)design reads both again. */
  workflows: (pid: string) => `office:${pid}:collaboration:workflows`,
  progress: (pid: string) => `office:${pid}:progress`,
  app: (pid: string) => `office:${pid}:app`,
  time: (pid: string) => `office:${pid}:time`,
  /** Under `time`: the clock's events read it again too. */
  performance: (pid: string, range: PerfRange) => `office:${pid}:time:perf:${range}`,
  project: (pid: string) => `office:${pid}:project`,
  /* STUDIO LIFE */
  deskNotes: (pid: string, agentId?: string) => `office:${pid}:desknotes${agentId ? `:${agentId}` : ''}`,
  todos: (pid: string, agentId: string) => `office:${pid}:todos:${agentId}`,
  principles: (pid: string) => `office:${pid}:principles`,
  recap: (agentId: string) => `recap:${agentId}`,
  chats: (agentId: string) => `chats:${agentId}`,
  chat: (runId: string) => `chat:${runId}`,
  principle: (pid: string, teamId: string, file: string) => `office:${pid}:principles:${teamId}:${file}`,
  mail: (pid: string, box: 'in' | 'sent' = 'in') => `office:${pid}:mail:${box}`,
  pager: 'pager:asks',
};
