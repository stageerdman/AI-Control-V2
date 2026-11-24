/* Typed endpoints for the stable server resources (see server/README.md "API"). Feature builders
   add their own here when they need a new one — keep it one line per endpoint. */
import { http } from './client';
import type {
  Access,
  AccessCreate,
  AccessDeleted,
  AccessFieldCreate,
  AccessMeta,
  AccessSync,
  Agent,
  AgentBusy,
  AgentCreate,
  AgentPatch,
  Ask,
  Blueprint,
  Caps,
  ChatMessage,
  ClaudeMdRebuild,
  Comm,
  CopyDraft,
  CreatorDraft,
  CreatorSession,
  Deleted,
  DeskNote,
  Draft,
  DraftCreate,
  DraftPatch,
  FinishResult,
  GhStatus,
  GithubView,
  Goal,
  Guest,
  HealthReport,
  Mail,
  MailBox,
  MailKind,
  Minted,
  Plan,
  PortsView,
  PrinciplesTeam,
  Project,
  ProjectAccess,
  ProjectAccessItem,
  ProjectHealth,
  ProjectPatch,
  Restored,
  Role,
  Run,
  SandboxFolder,
  ScaffoldReport,
  StudioSettings,
  Team,
  TeamCreate,
  TeamPatch,
  Todo,
  ToolUse,
  WaitingNote,
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
    /** In a running session right now? (Delete is refused with 409 'agent_busy' while it is.) */
    busy: (id: string) => http.get<AgentBusy>(`/agents/${e(id)}/busy`),
    /** Invite another: a fresh name + family look for a copy (each call re-rolls). */
    copyDraft: (id: string) => http.get<CopyDraft>(`/agents/${e(id)}/copy-draft`),
    /** Make the copy (same instructions); 409 name_taken for a name already in the Cast. */
    copy: (id: string, body: Partial<CopyDraft>) => http.post<Agent>(`/agents/${e(id)}/copies`, body),
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
    /** My Workplace, whole and in order (pin, unpin and reorder are this one call); returns every project. */
    setPins: (ids: string[]) => http.put<Project[]>('/projects/pins', { ids }),
    /** The project's picture (raw bytes; the app's only — never the project folder) / back to the tile. */
    setImage: (id: string, image: Blob) => http.put<Project>(`/projects/${e(id)}/image`, image),
    /** Use an icon file inside the project folder (relative to it); a copy is kept and refreshed when it changes. */
    linkImage: (id: string, path: string) => http.put<Project>(`/projects/${e(id)}/image/source`, { path }),
    clearImage: (id: string) => http.del<Project>(`/projects/${e(id)}/image`),
    /** Icon files found in the project folder, best first. */
    iconFiles: (id: string) => http.get<{ paths: string[] }>(`/projects/${e(id)}/image/candidates`),
    /** One of them as it would show (a server path for <img>; nothing saved). */
    iconPreviewPath: (id: string, path: string) => `/projects/${e(id)}/image/preview?path=${e(path)}`,
    remove: (id: string) => http.del<void>(`/projects/${e(id)}`),
    scaffold: (id: string) => http.get<ScaffoldReport>(`/projects/${e(id)}/scaffold`),
    work: (id: string) => http.get<Goal[]>(`/projects/${e(id)}/work`),
    startWork: (id: string, goal: string, caps?: Partial<Caps>) =>
      http.post<Goal>(`/projects/${e(id)}/work`, caps ? { goal, caps } : { goal }),
    cancelGoal: (id: string, goalId: string) =>
      http.post<Goal>(`/projects/${e(id)}/work/${e(goalId)}/cancel`),
    /** Continue a stopped goal: its unfinished items carry on where they were. */
    resumeGoal: (id: string, goalId: string) =>
      http.post<Goal>(`/projects/${e(id)}/work/${e(goalId)}/resume`),
    /** Start a stopped task over from main's tip; earlier unmerged work is kept on `keptOn`. */
    restartFresh: (id: string, itemId: string) =>
      http.post<{ goal: Goal; keptOn: string | null }>(`/projects/${e(id)}/tasks/${e(itemId)}/restart-fresh`),
    /** Notes still waiting to reach running agents at their next step. */
    notes: (id: string) => http.get<WaitingNote[]>(`/projects/${e(id)}/notes`),
    clearNotes: (id: string, agentId: string) =>
      http.del<{ cleared: number }>(`/projects/${e(id)}/agents/${e(agentId)}/notes`),
    health: (id: string) => http.get<ProjectHealth>(`/projects/${e(id)}/health`),
    checkHealth: (id: string, caps?: Partial<Caps>) =>
      http.post<HealthReport>(`/projects/${e(id)}/health`, caps ? { caps } : {}),
    runs: (id: string) => http.get<Run[]>(`/projects/${e(id)}/runs`),
    asks: (id: string, open = false) =>
      http.get<Ask[]>(`/projects/${e(id)}/asks${open ? '?status=open' : ''}`),
    answer: (id: string, askId: string, answer: string) =>
      http.post<Ask>(`/projects/${e(id)}/asks/${e(askId)}/answer`, { answer }),
    access: (id: string) => http.get<ProjectAccess>(`/projects/${e(id)}/access`),
    grant: (id: string, accessId: string) =>
      http.put<ProjectAccess>(`/projects/${e(id)}/access/${e(accessId)}`, {}),
    revoke: (id: string, accessId: string) =>
      http.del<ProjectAccess>(`/projects/${e(id)}/access/${e(accessId)}`),
    accessSeen: (id: string) =>
      http.post<{ projectId: string; seenAt: string }>(`/projects/${e(id)}/access/seen`),
    syncAccess: (id: string) => http.post<AccessSync>(`/projects/${e(id)}/access/sync`),
    /** An access of this project only (no other project sees it), switched on at once. */
    addLocalAccess: (id: string, body: AccessCreate) =>
      http.post<ProjectAccessItem>(`/projects/${e(id)}/accesses`, body),
    github: (id: string) => http.get<GithubView>(`/projects/${e(id)}/github`),
    publish: (id: string, body: { name?: string; visibility: 'private' | 'public' }) =>
      http.post<GithubView & { pushed: boolean }>(`/projects/${e(id)}/github/publish`, body),
    pushGithub: (id: string) => http.post<GithubView>(`/projects/${e(id)}/github/push`),
    setVisibility: (id: string, visibility: 'private' | 'public') =>
      http.patch<GithubView>(`/projects/${e(id)}/github`, { visibility }),
    rebuildClaudeMd: (id: string) => http.post<ClaudeMdRebuild>(`/projects/${e(id)}/claude-md/rebuild`),
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
  accesses: {
    list: () => http.get<Access[]>('/accesses'),
    /** The Mac's own folder picker (opened by the server); path null = cancelled. */
    pickFolder: () => http.post<{ path: string | null }>('/folders/pick'),
    create: (body: AccessCreate) => http.post<Access>('/accesses', body),
    update: (id: string, body: Partial<AccessMeta>) => http.patch<Access>(`/accesses/${e(id)}`, body),
    remove: (id: string) => http.del<AccessDeleted>(`/accesses/${e(id)}`),
    addField: (id: string, body: AccessFieldCreate) => http.post<Access>(`/accesses/${e(id)}/fields`, body),
    updateField: (id: string, fieldId: string, body: { label?: string; envVar?: string; secret?: boolean }) =>
      http.patch<Access>(`/accesses/${e(id)}/fields/${e(fieldId)}`, body),
    removeField: (id: string, fieldId: string) => http.del<Access>(`/accesses/${e(id)}/fields/${e(fieldId)}`),
    /** Write-only: the value goes out once and never comes back. */
    setValue: (id: string, fieldId: string, value: string) =>
      http.put<Access>(`/accesses/${e(id)}/fields/${e(fieldId)}/value`, { value }),
  },
  settings: () => http.get<StudioSettings>('/settings'),
  setSettings: (body: Partial<StudioSettings>) => http.patch<StudioSettings>('/settings', body),
  ghStatus: () => http.get<GhStatus>('/github/status'),
  ports: () => http.get<PortsView>('/ports'),
  blueprint: () => http.get<Blueprint>('/blueprint'),
  sandboxFolders: () => http.get<SandboxFolder[]>('/sandbox/folders'),
  restore: (token: string) => http.post<Restored>(`/trash/${e(token)}/restore`),

  /* ---------- STUDIO LIFE ---------- */
  deskNotes: (projectId: string, agentId?: string) =>
    http.get<{ notes: DeskNote[] }>(
      `/projects/${e(projectId)}/desk-notes${agentId ? `?agentId=${e(agentId)}` : ''}`,
    ),
  todos: (projectId: string, agentId: string) =>
    http.get<{ todos: Todo[] }>(`/projects/${e(projectId)}/todos?agentId=${e(agentId)}`),
  principles: {
    list: (projectId: string) =>
      http.get<{ teams: PrinciplesTeam[] }>(`/projects/${e(projectId)}/principles`),
    read: (projectId: string, teamId: string, file: string) =>
      http.get<{ teamId: string; file: string; body: string }>(
        `/projects/${e(projectId)}/principles/${e(teamId)}/${e(file)}`,
      ),
  },
  guests: {
    list: (projectId: string) => http.get<{ guests: Guest[] }>(`/projects/${e(projectId)}/guests`),
    add: (projectId: string, body: { agentId: string; brief: string; orchestratorMay?: boolean }) =>
      http.post<{ guest: Guest; runId: string | null }>(`/projects/${e(projectId)}/guests`, body),
    update: (projectId: string, agentId: string, body: { brief?: string; orchestratorMay?: boolean }) =>
      http.patch<Guest>(`/projects/${e(projectId)}/guests/${e(agentId)}`, body),
    remove: (projectId: string, agentId: string) =>
      http.del<void>(`/projects/${e(projectId)}/guests/${e(agentId)}`),
  },
  mail: {
    box: (projectId: string, box: 'in' | 'sent' = 'in') =>
      http.get<MailBox>(`/projects/${e(projectId)}/mail?box=${box}`),
    get: (projectId: string, mailId: string) => http.get<Mail>(`/projects/${e(projectId)}/mail/${e(mailId)}`),
    setStatus: (projectId: string, mailId: string, status: 'filed' | 'new') =>
      http.patch<Mail>(`/projects/${e(projectId)}/mail/${e(mailId)}`, { status }),
    send: (projectId: string, body: { to: string; subject: string; body: string; kind?: MailKind }) =>
      http.post<Mail>(`/projects/${e(projectId)}/mail`, body),
    /** The office opened: the director reads new mail on its own. */
    open: (projectId: string) =>
      http.post<{ unread: number; triaging: boolean }>(`/projects/${e(projectId)}/mail/open`),
  },
  creatorChat: {
    list: () => http.get<{ sessions: CreatorSession[] }>('/creator/sessions'),
    create: (text?: string) => http.post<CreatorSession>('/creator/sessions', text ? { text } : {}),
    get: (id: string) => http.get<CreatorSession>(`/creator/sessions/${e(id)}`),
    say: (id: string, text: string) =>
      http.post<{ reply: string; draft: CreatorDraft | null; chat: CreatorSession['chat'] }>(
        `/creator/sessions/${e(id)}/chat`,
        { text },
      ),
    edit: (id: string, draft: CreatorDraft) =>
      http.patch<CreatorSession>(`/creator/sessions/${e(id)}`, { draft }),
    accept: (id: string) => http.post<{ agent: Agent }>(`/creator/sessions/${e(id)}/accept`),
    drop: (id: string) => http.del<void>(`/creator/sessions/${e(id)}`),
  },
  comms: (projectId: string) => http.get<{ comms: Comm[] }>(`/projects/${e(projectId)}/comms`),
  toolUse: (projectId: string) => http.get<{ uses: ToolUse[] }>(`/projects/${e(projectId)}/tool-use`),
  /** The HTML how-to page: every office object, how the AIs use it and how often. */
  howToPath: (projectId: string) => `/projects/${e(projectId)}/how-to`,
};
