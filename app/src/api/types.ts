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
  /** G1: honest now — connected = published, private = visibility ≠ public. */
  github: {
    connected: boolean;
    private: boolean;
    published?: boolean;
    url?: string | null;
    visibility?: GithubView['visibility'];
  };
  tile: Tile;
  /** OFFICE: the project's picture (a server path, versioned); null/absent = show the tile. */
  imageUrl?: string | null;
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
export type ProjectPatch = Partial<
  Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'collaboration' | 'github'>
>;

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
/** `from: 'agent'` = a guest in the setup room (by agentId); `to` = an agent-to-agent line (AGENT MCP). */
export type ChatMessage = {
  from: 'user' | 'orchestrator' | 'creator' | 'agent';
  agentId?: string;
  to?: string;
  text: string;
};
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
  /** G1: a GitHub repo at setup; null = the studio default (GET /settings). */
  github?: boolean | null;
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
  github?: boolean | null;
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

/* ---------- Access (Key Cabinet, G1) — an access is a named bundle of fields. Secret values never
   come back: only hasValue + last4 (a non-secret field — a username, a URL — carries its `value`). ---------- */
export type AccessField = {
  id: string;
  label: string;
  /** Unique across the whole cabinet (one global .env). */
  envVar: string;
  secret: boolean;
  hasValue: boolean;
  /** null when there's no value or it is shorter than 12 characters. */
  last4: string | null;
  /** Only when secret === false and hasValue. */
  value?: string;
};
export type Access = {
  id: string;
  name: string;
  serves: string;
  docsUrl: string | null;
  instructions: string;
  /** ≥ 1, in order. */
  fields: AccessField[];
  /** Granted to. */
  projectIds: string[];
  createdAt: string;
  updatedAt: string;
};
export type AccessMeta = Pick<Access, 'name' | 'serves' | 'docsUrl' | 'instructions'>;
export type AccessFieldCreate = { label: string; envVar?: string; secret?: boolean; value?: string };
export type AccessCreate = Partial<Omit<AccessMeta, 'name'>> & { name: string; fields: AccessFieldCreate[] };
export type AccessDeleted = {
  deleted: { kind: 'access'; id: string };
  restorable: false;
  projectIds: string[];
};
export type ProjectAccessItem = Access & { granted: boolean; isNew: boolean };
export type ProjectAccess = {
  projectId: string;
  granted: number;
  total: number;
  /** Last POST …/access/seen (the project's createdAt before the first). */
  seenAt: string;
  /** Accesses created after seenAt → the "new" dot. */
  newCount: number;
  accesses: ProjectAccessItem[];
};
export type AccessSync = {
  file: string;
  written: string[];
  removed: string[];
  missing: string[];
  gitignore: 'present' | 'added';
};

/* ---------- GitHub (G1) ---------- */
export type GithubView = {
  published: boolean;
  /** https://github.com/owner/repo */
  url: string | null;
  visibility: 'public' | 'private' | 'internal' | null;
  lastPush: { ok: boolean; at: string; note?: string; commit?: string } | null;
  /** "GitHub not connected — Publish" | "Couldn’t push to GitHub: …"; absent = fine. */
  note?: string;
};
export type GhStatus = { gh: 'ready' | 'missing' | 'signed-out'; login: string | null };
/** Studio-wide switches (GET/PATCH /settings), both default on. autoApprove (AGENTS): the studio says yes to agents’ yes/no permission checks. */
export type StudioSettings = { githubByDefault: boolean; autoApprove: boolean };

/* ---------- Ports (G1): GET /ports ---------- */
export type PortsView = {
  range: { from: number; to: number };
  projects: {
    projectId: string;
    name: string;
    block: { app: number; spares: number[] };
    app: { status: AppStatus; port: number | null; url: string | null };
    ports: {
      port: number;
      role: 'app' | 'spare';
      listening: boolean;
      heldBy: { runId: string; agentId: string | null } | null;
    }[];
  }[];
};
export type ClaudeMdRebuild = { file: string; changed: boolean; modules: string[]; commit: string | null };

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
  /** F1c teams: a member's sub-task points at its team item; sub-tasks never sit at a goal's top level. */
  parentId?: string | null;
  /** A team item: members building their parts, or the captain integrating them. */
  teamPhase?: null | 'members' | 'integrate';
  teamRounds?: number;
  /** The captain's split in one sentence (also for "self"). */
  teamPlan?: string | null;
  subtasks?: ChecklistItem[];
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
  /** F1c: the feature this goal works on, and whether finishing it ships that feature. */
  featureId?: string | null;
  ships?: boolean;
  createdAt: string;
  updatedAt: string;
};

/* ---------- the project's app (run it) ---------- */
export type AppStatus = 'running' | 'stopped' | 'exited';
export type ProjectApp = {
  status: AppStatus;
  command: string | null;
  /** Where the command came from (`.project` run: line, package.json…). */
  source: string | null;
  url: string | null;
  pid: number | null;
  startedAt: string | null;
  exitCode: number | null;
  /** Last log lines, secrets masked server-side. */
  log: string[];
  /** The PORT the studio gave it while running (per project, 3100–3999); null otherwise. */
  port?: number | null;
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
export type ProjectHealth = {
  latest: HealthReport | null;
  history: HealthReport[];
  git: GitStatus;
  app?: { status: AppStatus; url: string | null; command: string | null };
  /** G1. */
  github?: GithubView;
};

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
  'chat.message': {
    from: 'user' | 'orchestrator' | 'creator' | 'agent';
    agentId?: string;
    to?: string;
    text: string;
  };
  /** AGENT MCP: someone joined the room (`by` brought them in). */
  'room.joined': { agentId: string; by?: string; why?: string };
  /** AGENT MCP: one agent calling another. */
  'room.call': {
    callId: string;
    from: string;
    to: string;
    status: 'asking' | 'approved' | 'declined' | 'working' | 'answered' | 'failed';
    approver?: string;
    note?: string;
  };
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
    parentId?: string;
    teamPhase?: 'members' | 'integrate' | null;
  };
  /** A captain split a team item into members' sub-tasks (mode 'self' = kept it). */
  'team.split': {
    itemId: string;
    goalId: string;
    captainId: string;
    teamId: string;
    mode: 'team' | 'self';
    summary: string;
    subtasks: { itemId: string; agentId: string; text: string }[];
    round: number;
  };
  'feature.shipped': { featureId: string; goalId: string; name: string };
  'app.status': { status: AppStatus; url?: string; exitCode?: number };
  /** G1: refetch GET /projects/:id/access. */
  'access.changed': { accessId: string; change: 'granted' | 'revoked' | 'updated' | 'deleted' };
  'project.changed': { imageUrl?: string | null; name?: string };
  'github.changed': { published: boolean; url: string | null; visibility: GithubView['visibility'] };
  'github.push': { ok: boolean; commit?: string; note?: string };
  /** An item passes between desks: to a reviewer, back to its builder (rework / merge-fix). */
  handoff: {
    itemId: string;
    goalId: string;
    from: string;
    to: string;
    kind: 'review' | 'rework' | 'merge-fix' | 'delegate' | 'deliver';
    gate?: number;
    note?: string;
    /** Team handoffs: `itemId` is the sub-task, this is its team item. */
    parentId?: string;
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
  'room.joined',
  'room.call',
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
  'team.split',
  'feature.shipped',
  'app.status',
  'access.changed',
  'project.changed',
  'github.changed',
  'github.push',
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
