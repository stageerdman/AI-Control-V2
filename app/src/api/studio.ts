/* Typed endpoints for the stable server resources (see server/README.md "API"). Feature builders
   add their own here when they need a new one — keep it one line per endpoint. */
import { http } from './client';
import type {
  AccessSync,
  Agent,
  AgentCreate,
  AgentPatch,
  Ask,
  Blueprint,
  Caps,
  ChatMessage,
  Credential,
  CredentialCreate,
  CredentialDeleted,
  Deleted,
  Draft,
  DraftCreate,
  DraftPatch,
  FinishResult,
  Goal,
  HealthReport,
  Minted,
  Plan,
  Project,
  ProjectAccess,
  ProjectHealth,
  ProjectPatch,
  Restored,
  Role,
  Run,
  SandboxFolder,
  ScaffoldReport,
  Team,
  TeamCreate,
  TeamPatch,
} from './types';

const e = encodeURIComponent;

export const studio = {
  roles: {
    list: () => http.get<Role[]>('/roles'),
    create: (name: string) => http.post<Role>('/roles', { name }),
    rename: (id: string, name: string) => http.patch<Role>(`/roles/${e(id)}`, { name }),
    remove: (id: string) => http.del<Deleted>(`/roles/${e(id)}`),
  },
  agents: {
    list: () => http.get<Agent[]>('/agents'),
    get: (id: string) => http.get<Agent>(`/agents/${e(id)}`),
    create: (body: AgentCreate) => http.post<Agent>('/agents', body),
    update: (id: string, body: AgentPatch) => http.patch<Agent>(`/agents/${e(id)}`, body),
    remove: (id: string) => http.del<Deleted>(`/agents/${e(id)}`),
  },
  teams: {
    list: () => http.get<Team[]>('/teams'),
    get: (id: string) => http.get<Team>(`/teams/${e(id)}`),
    create: (body: TeamCreate) => http.post<Team>('/teams', body),
    update: (id: string, body: TeamPatch) => http.patch<Team>(`/teams/${e(id)}`, body),
    remove: (id: string) => http.del<Deleted>(`/teams/${e(id)}`),
    addMember: (id: string, agentId: string, instr?: string) =>
      http.post<Team>(`/teams/${e(id)}/members`, instr === undefined ? { agentId } : { agentId, instr }),
    setJob: (id: string, agentId: string, instr: string) =>
      http.patch<Team>(`/teams/${e(id)}/members/${e(agentId)}`, { instr }),
    removeMember: (id: string, agentId: string) => http.del<Team>(`/teams/${e(id)}/members/${e(agentId)}`),
  },
  projects: {
    list: () => http.get<Project[]>('/projects'),
    get: (id: string) => http.get<Project>(`/projects/${e(id)}`),
    update: (id: string, body: ProjectPatch) => http.patch<Project>(`/projects/${e(id)}`, body),
    remove: (id: string) => http.del<void>(`/projects/${e(id)}`),
    scaffold: (id: string) => http.get<ScaffoldReport>(`/projects/${e(id)}/scaffold`),
    work: (id: string) => http.get<Goal[]>(`/projects/${e(id)}/work`),
    startWork: (id: string, goal: string, caps?: Partial<Caps>) =>
      http.post<Goal>(`/projects/${e(id)}/work`, caps ? { goal, caps } : { goal }),
    cancelGoal: (id: string, goalId: string) =>
      http.post<Goal>(`/projects/${e(id)}/work/${e(goalId)}/cancel`),
    health: (id: string) => http.get<ProjectHealth>(`/projects/${e(id)}/health`),
    checkHealth: (id: string, caps?: Partial<Caps>) =>
      http.post<HealthReport>(`/projects/${e(id)}/health`, caps ? { caps } : {}),
    runs: (id: string) => http.get<Run[]>(`/projects/${e(id)}/runs`),
    asks: (id: string, open = false) =>
      http.get<Ask[]>(`/projects/${e(id)}/asks${open ? '?status=open' : ''}`),
    answer: (id: string, askId: string, answer: string) =>
      http.post<Ask>(`/projects/${e(id)}/asks/${e(askId)}/answer`, { answer }),
    access: (id: string) => http.get<ProjectAccess>(`/projects/${e(id)}/access`),
    setAccess: (id: string, grants: Record<string, boolean>) =>
      http.put<ProjectAccess>(`/projects/${e(id)}/access`, { grants }),
    syncAccess: (id: string) => http.post<AccessSync>(`/projects/${e(id)}/access/sync`),
    eventsUrl: (id: string) => `/projects/${e(id)}/events`,
  },
  drafts: {
    list: () => http.get<Draft[]>('/drafts'),
    get: (id: string) => http.get<Draft>(`/drafts/${e(id)}`),
    create: (body: DraftCreate) => http.post<Draft>('/drafts', body),
    update: (id: string, body: DraftPatch) => http.patch<Draft>(`/drafts/${e(id)}`, body),
    remove: (id: string) => http.del<Deleted>(`/drafts/${e(id)}`),
    chat: (id: string, text?: string) =>
      http.post<{ reply: string; plan: Plan; chat: ChatMessage[] }>(
        `/drafts/${e(id)}/chat`,
        text ? { text } : {},
      ),
    accept: (id: string) => http.post<{ plan: Plan; minted: Minted }>(`/drafts/${e(id)}/accept`),
    finish: (id: string) => http.post<FinishResult>(`/drafts/${e(id)}/finish`),
    eventsUrl: (id: string) => `/drafts/${e(id)}/events`,
  },
  credentials: {
    list: () => http.get<Credential[]>('/credentials'),
    create: (body: CredentialCreate) => http.post<Credential>('/credentials', body),
    update: (id: string, body: Partial<Omit<CredentialCreate, 'value' | 'envVar'>>) =>
      http.patch<Credential>(`/credentials/${e(id)}`, body),
    setValue: (id: string, value: string) => http.put<Credential>(`/credentials/${e(id)}/value`, { value }),
    remove: (id: string) => http.del<CredentialDeleted>(`/credentials/${e(id)}`),
  },
  blueprint: () => http.get<Blueprint>('/blueprint'),
  sandboxFolders: () => http.get<SandboxFolder[]>('/sandbox/folders'),
  restore: (token: string) => http.post<Restored>(`/trash/${e(token)}/restore`),
};
