/* The office's endpoints + wire types (server/README.md: office view, threads, features, asks inbox).
   Everything else the office reads (work, health, access, asks, agents, teams) is in api/studio.ts. */
import { http } from '../../api';

const e = encodeURIComponent;

export type AgentStatusName = 'idle' | 'working' | 'waiting' | 'blocked' | 'done';
export type ServerActivity = { kind: string; label: string; detail?: string; target?: string };
/** An agent's latest status as the office view reports it (no `since` = never reported here). */
export type AgentStatus = { status: AgentStatusName; activity?: ServerActivity; runId?: string; since?: string };
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
  agents: Record<string, AgentStatus>;
  lastEventId: number;
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
export type FeatureCreate = Partial<Pick<Feature, 'status' | 'order' | 'pct' | 'owner' | 'description' | 'vision'>> & {
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
  at: string;
};
export type Thread = { projectId: string; agentId: string; busy: boolean; messages: ThreadMessage[] };

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
};

export const officeApi = {
  office: (pid: string) => http.get<OfficeView>(`/projects/${e(pid)}/office`),
  features: (pid: string) => http.get<Feature[]>(`/projects/${e(pid)}/features`),
  createFeature: (pid: string, body: FeatureCreate) => http.post<Feature>(`/projects/${e(pid)}/features`, body),
  updateFeature: (pid: string, fid: string, body: FeaturePatch) =>
    http.patch<Feature>(`/projects/${e(pid)}/features/${e(fid)}`, body),
  deleteFeature: (pid: string, fid: string) => http.del<void>(`/projects/${e(pid)}/features/${e(fid)}`),
  thread: (pid: string, agentId: string) => http.get<Thread>(`/projects/${e(pid)}/threads/${e(agentId)}/messages`),
  say: (pid: string, agentId: string, text: string) =>
    http.post<{ message: ThreadMessage; runId: string }>(`/projects/${e(pid)}/threads/${e(agentId)}/messages`, {
      text,
    }),
  studioAsks: () => http.get<StudioAsk[]>('/asks?unseen=true'),
  seen: (projectId: string) => http.post<{ seen: number }>('/asks/seen', { projectId }),
};

/** Query keys (strings; invalidate by prefix). */
export const keys = {
  office: (pid: string) => `office:${pid}`,
  features: (pid: string) => `office:${pid}:features`,
  work: (pid: string) => `office:${pid}:work`,
  health: (pid: string) => `office:${pid}:health`,
  asks: (pid: string) => `office:${pid}:asks`,
  access: (pid: string) => `office:${pid}:access`,
  thread: (pid: string, agentId: string) => `office:${pid}:thread:${agentId}`,
  pager: 'pager:asks',
};
