/* Wire types for the AI Studio server, mirrored by hand from server/src (db/*.ts, domain/*.ts,
   routes/*.ts, events) — the app never imports across packages. Keep in step when the server
   changes; add a resource here when a screen first needs it. Timestamps are ISO strings. */

/* ---------- studio health ---------- */
export type ServerHealth = {
  ok: boolean;
  version: string;
  paths: { home: string; sandbox: string; controlHome: string; db: string };
};

/* ---------- the Cast ---------- */
export type Look = {
  hat: string;
  tool: string;
  body: string;
  antenna: string;
  face: string;
  hue: string;
  decal?: string;
};
export type AgentKind = 'agent' | 'setter' | 'orchestrator' | 'creator';
export type DeleteVerdict = { ok: true; why: '' } | { ok: false; why: string };

/** reporter: agents holding the role file reports (file_report). */
/** toolsmith: agents holding the role (quality / test) keep a persistent toolkit folder of checks. */
export type Role = { id: string; name: string; agentCount: number; reporter: boolean; toolsmith?: boolean };

export type Agent = {
  id: string;
  kind: AgentKind;
  /** Studio crew (setter / orchestrator / creator) — never joins teams. */
  system: boolean;
  name: string;
  nick: string | null;
  roleId: string | null;
  /** Display role: the role's name; crew fall back to their kind label. */
  role: string;
  look: Look;
  prompt: string;
  teamIds: string[];
  projectIds: string[];
  canDelete: DeleteVerdict;
  createdAt: string;
  updatedAt: string;
};
export type AgentCreate = {
  kind?: AgentKind;
  name: string;
  nick?: string | null;
  roleId?: string | null;
  look?: Look;
  prompt?: string;
};
export type AgentPatch = Partial<Omit<AgentCreate, 'kind'>>;

export type Member = { agentId: string; instr: string };
export type Team = {
  id: string;
  name: string;
  /** Palette key or hex. */
  color: string;
  /** Emblem id (characters/emblem-svg.ts EMBLEMS). */
  emblem: string;
  blurb: string;
  /** What the team does. */
  instr: string;
  /** How the team codes. */
  code: string;
  captainId: string | null;
  members: Member[];
  /** Runs for this team file reports. */
  reporter: boolean;
  projectIds: string[];
  createdAt: string;
  updatedAt: string;
};
export type TeamCreate = {
  name: string;
  color?: string;
  emblem?: string;
  blurb?: string;
  instr?: string;
  code?: string;
  members?: { agentId: string; instr?: string }[];
  captainId?: string | null;
  reporter?: boolean;
};
export type TeamPatch = Partial<Omit<TeamCreate, 'members' | 'captainId'>> & { captainId?: string };

/* ---------- projects + setup ---------- */
export type ProjectStatus = 'live' | 'needs' | 'idle' | 'draft' | 'archived';
export type Tile = { g1: string; g2: string; glyph: string };
export type Project = {
  id: string;
  name: string;
  note: string;
  status: ProjectStatus;
  progress: number;
  /** Sandbox-relative; null until the Project Setter gives it one. */
  folder: string | null;
  orchestratorId: string;
  github: { connected: boolean; private: boolean };
  tile: Tile;
  teamIds: string[];
  /** Specialists (teams come first). */
  agentIds: string[];
  /** How its people work together (F1b); null = the default (captains, no review gates). */
  collaboration?: Collaboration | null;
  /** What `progress` is towards ("v1.0"); null = no label. */
  target?: string | null;
  createdAt: string;
  updatedAt: string;
};
export type ProjectPatch = Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'collaboration'>>;

/* ---------- collaboration (F1b): who the orchestrator briefs + review gates ---------- */
export type GateKind = 'quality' | 'user-test' | 'crash-test' | 'security' | 'review';
/** After a build item by `after` (team id, agent id or "*") is done, `reviewer` checks it. */
export type Gate = { after: string; reviewer: string; kind: GateKind; why: string };
export type Collaboration = {
  orchestratorTalksTo: 'captains' | 'everyone';
  gates: Gate[];
  maxSendBacks: number;
  summary: string;
};
export type CollaborationView = { collaboration: Collaboration; designed: boolean };
export type ItemReview = {
  reviewer: string;
  gate: number;
  verdict: 'approve' | 'changes';
  notes: string;
  runId: string | null;
  at: string;
};

export type Plan = {
  teams: { teamId: string; why: string }[];
  specialists: { agentId: string; why: string }[];
  newAgents: { brief: string }[];
  newTeams: { brief: string }[];
  summary: string;
  /** The orchestrator's collaboration design (`new-agent:N` / `new-team:N` before accept). */
  collaboration?: Collaboration | null;
};
export type ChatMessage = { from: 'user' | 'orchestrator' | 'creator'; text: string };
export type Draft = {
  id: string;
  mode: 'new' | 'adopt';
  step: number;
  name: string;
  about: string;
  folder: string | null;
  orchestratorId: string | null;
  plan: Plan | null;
  chat: ChatMessage[];
  /** When the Project Setter set up `folder` (POST /drafts/:id/setup); null until then. */
  setupAt?: string | null;
  setupCommit?: string | null;
  createdAt: string;
  updatedAt: string;
};
export type DraftCreate = {
  mode: 'new' | 'adopt';
  step?: number;
  name?: string;
  about?: string;
  folder?: string | null;
  orchestratorId?: string | null;
};
export type DraftPatch = Partial<Omit<DraftCreate, 'mode'>> & { plan?: Plan | null; chat?: ChatMessage[] };
export type SetupStep = { step: string; status: 'running' | 'done' | 'kept' | 'skipped'; detail: string };
export type FinishResult = { project: Project; steps: SetupStep[]; commit: string | null };
export type Minted = { roles: Role[]; agents: Agent[]; teams: Team[] };
export type SandboxFolder = { name: string; [k: string]: unknown };
export type ScaffoldReport = {
  folder: string;
  exists: boolean;
  items: { path: string; kind: 'file' | 'dir'; desc: string; present: boolean }[];
  complete: boolean;
  git: { repo: boolean; head: string | null; commits: number };
};

/* ---------- delete / undo ---------- */
export type Deleted = { deleted: { kind: string; id: string }; restoreToken: string };
export type Restored = { restored: { kind: string; id: string } };

/* ---------- Access (Key Cabinet) — values never come back, only hasValue + last4 ---------- */
export type Credential = {
  id: string;
  name: string;
  envVar: string;
  serves: string;
  docsUrl: string | null;
  instructions: string;
  hasValue: boolean;
  last4: string | null;
  projectIds: string[];
  createdAt: string;
  updatedAt: string;
};
export type CredentialCreate = {
  name: string;
  envVar?: string;
  serves?: string;
  docsUrl?: string | null;
  instructions?: string;
  /** Write-only. */
  value?: string;
};
export type CredentialDeleted = {
  deleted: { kind: 'credential'; id: string };
  restorable: false;
  projectIds: string[];
};
export type AccessEntry = {
  credentialId: string;
  name: string;
  envVar: string;
  serves: string;
  hasValue: boolean;
  last4: string | null;
  granted: boolean;
};
export type ProjectAccess = { projectId: string; granted: number; total: number; entries: AccessEntry[] };
export type AccessSync = {
  file: string;
  written: string[];
  removed: string[];
  missing: string[];
  gitignore: 'present' | 'added';
};

/* ---------- work: runs, asks, the whiteboard ---------- */
export type Caps = { maxTurns: number; maxBudgetUsd: number };
export type RunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled';
export type Run = {
  id: string;
  projectId: string;
  agentId: string;
  teamId: string | null;
  task: string;
  status: RunStatus;
  runner: string;
  model: string | null;
  caps: Caps;
  sessionId: string | null;
  result: string | null;
  error: string | null;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
  costUsd: number | null;
  turns: number;
  startedAt: string;
  endedAt: string | null;
};
export type Ask = {
  id: string;
  runId: string;
  projectId: string;
  agentId: string;
  question: string;
  options: string[] | null;
  status: 'open' | 'answered' | 'cancelled';
  answer: string | null;
  createdAt: string;
  answeredAt: string | null;
};
export type ItemStatus = 'todo' | 'running' | 'done' | 'failed' | 'cancelled';
export type ChecklistItem = {
  id: string;
  goalId: string;
  projectId: string;
  position: number;
  text: string;
  brief: string;
  agentId: string;
  teamId: string | null;
  parallel: boolean;
  status: ItemStatus;
  runId: string | null;
  note: string | null;
  /** F1b review flow: build → review (gates in order) → merge. Absent on old servers. */
  stage?: 'build' | 'review' | 'merge';
  gates?: { reviewer: string; kind: GateKind; why: string }[];
  gateIndex?: number;
  sendBacks?: number;
  notes?: string | null;
  reviews?: ItemReview[];
  workspace?: { cwd: string; branch: string; base: string; main: string } | null;
  createdAt: string;
  updatedAt: string;
};
export type Goal = {
  id: string;
  projectId: string;
  text: string;
  summary: string;
  status: 'running' | 'done' | 'failed' | 'cancelled';
  items: ChecklistItem[];
  /** done / total, 0–100. */
  pct: number;
  caps: Partial<Caps> | null;
  createdAt: string;
  updatedAt: string;
};

/* ---------- health check ---------- */
export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';
export type HealthAspect = { grade: Grade; good: string; fix: string };
export type GitStatus = {
  repo: boolean;
  branch: string | null;
  clean: boolean | null;
  changes: number;
  lastCommit: { hash: string; subject: string; date: string } | null;
  commits: number;
  remote: { name: string; url: string } | null;
  github: { repo: string | null; visibility: 'public' | 'private' | 'internal' | null; note?: string };
};
export type HealthReport = {
  id: string;
  projectId: string;
  modularity: HealthAspect;
  cleanliness: HealthAspect;
  reusability: HealthAspect;
  summary: string;
  git: GitStatus;
  usage: { attempts: number; turns: number; input: number; output: number };
  createdAt: string;
};
export type ProjectHealth = { latest: HealthReport | null; history: HealthReport[]; git: GitStatus };

/* ---------- Blueprint ---------- */
export type Blueprint = {
  modulesDir: string;
  modules: { name: string; description: string }[];
  tree: { path: string; kind: 'file' | 'dir'; desc: string }[];
};

/* ---------- events (SSE: GET /projects/:id/events, /drafts/:id/events) ---------- */
type Activity = { kind: string; label: string; detail?: string; target?: string };
export type EventPayloads = {
  'setup.step': SetupStep;
  'setup.failed': { message: string };
  'agent.status': {
    agentId: string;
    runId?: string;
    status: 'idle' | 'working' | 'waiting' | 'blocked' | 'done';
    activity?: Activity;
  };
  'ask.opened': {
    askId: string;
    agentId: string;
    kind: 'question' | 'approval' | 'credential';
    question: string;
    options?: string[];
    runId?: string;
    credentialId?: string;
  };
  'ask.answered': { askId: string; answer: string };
  'chat.message': { from: 'user' | 'orchestrator' | 'creator'; agentId?: string; text: string };
  'plan.changed': {
    summary: string;
    teamIds: string[];
    agentIds: string[];
    newAgents: number;
    newTeams: number;
  };
  'cast.created': { kind: 'agent' | 'team' | 'role'; id: string; name: string; by?: string };
  'health.checked': {
    reportId: string;
    modularity: Grade;
    cleanliness: Grade;
    reusability: Grade;
    summary: string;
    dirty?: boolean;
  };
  'goal.changed': { goalId: string; status: Goal['status']; text?: string; summary?: string };
  'checklist.item': {
    itemId: string;
    text: string;
    done: boolean;
    owner?: string;
    goalId?: string;
    status?: ItemStatus;
    runId?: string;
    stage?: 'build' | 'review' | 'merge';
    /** Who has it now (only when the item has gates). */
    holder?: string;
  };
  /** An item passes between desks: to a reviewer, back to its builder (rework / merge-fix). */
  handoff: {
    itemId: string;
    goalId: string;
    from: string;
    to: string;
    kind: 'review' | 'rework' | 'merge-fix';
    gate?: number;
    note?: string;
  };
  'review.approved': { itemId: string; goalId: string; reviewerId: string; gate: number; notes?: string };
  'review.changes': {
    itemId: string;
    goalId: string;
    reviewerId: string;
    gate: number;
    notes: string;
    sendBacks: number;
    final?: boolean;
  };
  'item.merged': { itemId: string; goalId: string; branch: string; commit?: string };
  'collaboration.changed': { orchestratorTalksTo: 'captains' | 'everyone'; gates: number; summary: string };
  'project.status': { status: ProjectStatus };
  'project.progress': {
    pct: number;
    shipped: number;
    total: number;
    target?: string | null;
    goalId?: string;
    goalPct?: number;
  };
  'feature.changed': {
    featureId: string;
    name: string;
    status: 'now' | 'planned' | 'shipped';
    order: number;
    pct?: number | null;
    owner?: string | null;
    deleted?: true;
  };
  /** A message in the user's thread with an agent (U1 project conversations). */
  'thread.message': {
    agentId: string;
    messageId: string;
    from: 'user' | 'agent';
    kind: 'text' | 'error';
    text: string;
    runId?: string;
    /** The report this turn filed (the reply is one line pointing at it). */
    reportId?: string;
    /** The goal this line belongs to (the orchestrator's thread records every goal). */
    goalId?: string;
  };
  /** Reports: title only, never the body. */
  'report.filed': { reportId: string; projectId: string; authorAgentId: string; title: string };
  'report.read': { reportId: string; read: boolean };
  'report.archived': { reportId: string; archived: boolean };
  progress: { pct: number; label?: string };
  tokens: { agentId: string; runId?: string; input: number; output: number };
  'run.started': { runId: string; agentId: string; teamId?: string; task: string };
  'run.finished': {
    runId: string;
    agentId: string;
    status: Exclude<RunStatus, 'running'>;
    result?: string;
    error?: string;
    turns: number;
    input: number;
    output: number;
    costUsd?: number;
  };
};
export type EventType = keyof EventPayloads;
/** Every type the SSE hook listens for by default (named SSE events need explicit listeners). */
export const EVENT_TYPES = [
  'setup.step',
  'setup.failed',
  'agent.status',
  'ask.opened',
  'ask.answered',
  'chat.message',
  'plan.changed',
  'cast.created',
  'health.checked',
  'goal.changed',
  'checklist.item',
  'feature.changed',
  'thread.message',
  'report.filed',
  'report.read',
  'report.archived',
  'progress',
  'tokens',
  'run.started',
  'run.finished',
  'handoff',
  'review.approved',
  'review.changes',
  'item.merged',
  'collaboration.changed',
  'project.status',
  'project.progress',
] as const satisfies readonly EventType[];

/** One stored event as the stream sends it (`projectId` or `draftId` names the scope). */
export type StudioEvent<T extends EventType = EventType> = {
  [K in T]: {
    id: number;
    projectId?: string;
    draftId?: string;
    type: K;
    payload: EventPayloads[K];
    at: string;
  };
}[T];
