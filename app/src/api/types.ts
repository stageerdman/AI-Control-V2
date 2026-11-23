/* Wire types for the AI Studio server, mirrored by hand from server/src (db/*.ts, domain/*.ts,
   routes/*.ts, events) — the app never imports across packages. Keep in step when the server
   changes; add a resource here when a screen first needs it. Timestamps are ISO strings. */

/* ---------- studio health ---------- */
export type ServerHealth = {
  ok: boolean;
  version: string;
  paths: { home: string; sandbox: string; controlHome: string; db: string };
  /** Only from a backend that keeps the Mac app current: its commit, what's installed, the last install. */
  build?: BuildReport;
};
export type BuildReport = {
  running: string;
  installed: { commit: string; at?: string } | null;
  install: { state: 'installing' | 'installed' | 'failed'; at: string; error?: string } | null;
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
export type Toolset = {
  edit: 'any' | 'none' | string[];
  shell: 'studio' | 'git' | 'none';
  web: boolean;
  /** What it works with, in plain words (the design card's "works with" line). */
  works: string[];
};
/** An agent's tools in plain words (server domain/tool-list.ts): what its runs can edit, run and
    reach. An empty list means "nothing". Derived by the server — never worked out in the app. */
export type ToolList = { edit: string[]; run: string[]; reach: string[] };
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
  /** STUDIO LIFE: may send mail to other projects and HQ (default on). */
  canMail?: boolean;
  /** Working tools (server domain/toolset.ts); null/absent = the studio's full kit. */
  tools?: Toolset | null;
  /** The Cast API's plain tool list (every /agents reply carries it). */
  toolList?: ToolList;
  teamIds: string[];
  projectIds: string[];
  canDelete: DeleteVerdict;
  /** Invite another: the kin group (agents sharing one set of instructions); null = alone. Older servers omit it. */
  kinId?: string | null;
  /** The other live kin ids, first-made first ("like Blair" = kin[0]). */
  kin?: string[];
  createdAt: string;
  updatedAt: string;
};
/** GET /agents/:id/copy-draft — a fresh suggestion for a copy: a free family name and the family look. */
export type CopyDraft = { name: string; look: Look };
export type AgentCreate = {
  kind?: AgentKind;
  name: string;
  nick?: string | null;
  roleId?: string | null;
  look?: Look;
  prompt?: string;
};
export type AgentPatch = Partial<Omit<AgentCreate, 'kind'>> & { canMail?: boolean };

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
  /** The shape of the team's ready-made way (used while it has no drawing of its own). */
  wayShape?: WayShape;
  createdAt: string;
  updatedAt: string;
};
/** 'captain' = the captain checks all; 'chain' = members pass it along, the captain signs last. */
export type WayShape = 'captain' | 'chain';
export type TeamCreate = {
  wayShape?: WayShape;
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
  /** Where the picture came from: 'upload', a file path inside the project folder, or null (the tile). */
  imageSource?: string | null;
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
export type Gate = {
  after: string;
  reviewer: string;
  kind: GateKind;
  why: string;
  /** A soft branch label: "only if it touches the UI" (words for the orchestrator, not logic). */
  when?: string;
};
export type Collaboration = {
  orchestratorTalksTo: 'captains' | 'everyone';
  gates: Gate[];
  maxSendBacks: number;
  summary: string;
};
export type CollaborationView = { collaboration: Collaboration; designed: boolean };
/** A named way of working (WORKFLOWS). Stable ones live on the project (first = the usual way). */
export type Workflow = Collaboration & {
  id: string;
  name: string;
  when: string;
  lead?: string;
  crew?: string[];
  /* Drawn in the editor (wiki "The editor's shape"); the sign-off arrows are the `gates`. */
  /** Who starts (agent or team). */
  first?: string;
  /** Who signs last (an agent; one of the reviewers when there are gates). */
  final?: string;
  /** Hand-offs that aren't reviews (≤ 12). */
  steps?: Step[];
  /** Where each node sits on the canvas: x 0..1000, y 0..600. */
  layout?: Record<string, { x: number; y: number }>;
  /** Read-only: where it lives (a PUT ignores it). */
  scope?: 'office' | 'team' | 'temporary';
  teamId?: string;
  /** Read-only: the way in one plain paragraph ("Uncle Bob starts. … Elon signs last."). */
  inWords?: string;
};
/** A hand-off: `from` hands work to `to`, and why; `when` = a soft branch label. */
export type Step = { from: string; to: string; why: string; when?: string };
export type WorkflowsView = { workflows: Workflow[]; designed: boolean };
/** A team's own way, drawn in the Cast (GET/PUT /teams/:id/workflow): a workflow without lead or crew. */
export type TeamWorkflow = Workflow;
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
/** A running session an agent is part of (GET /agents/:id/busy, and the 409 'agent_busy' details). */
export type BusySession = {
  runId: string;
  projectId: string;
  projectName: string;
  task: string;
  startedAt: string;
};
export type AgentBusy = { busy: boolean; sessions: BusySession[] };
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
  /** In order: ≥ 1, except a folder access, which may have none. */
  fields: AccessField[];
  /** A folder access: the folder it shares, read and write (outside every project). */
  folder: string | null;
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
export type StudioSettings = {
  githubByDefault: boolean;
  autoApprove: boolean;
  /** STUDIO LIFE: the project that is HQ (the studio's own repo); null = none yet. */
  hqProjectId: string | null;
};

/* ---------- STUDIO LIFE ---------- */
/** An agent's note to its future self before it forgot (GET /projects/:id/desk-notes). */
export type DeskNote = {
  id: string;
  projectId: string;
  agentId: string;
  runId: string | null;
  where: string;
  doing: string;
  next: string;
  notes?: string;
  at: string;
};
/** One item on an agent's saved to-do list (GET /projects/:id/todos?agentId=): open first, in order. */
export type Todo = {
  id: string;
  projectId: string;
  agentId: string;
  /** Who asked (an agent id), or null for the agent's own reminder. */
  fromId: string | null;
  text: string;
  dueAt: string | null;
  notify: boolean;
  goalId: string | null;
  status: 'open' | 'done';
  createdAt: string;
  doneAt: string | null;
};
/** GET /projects/:id/principles — each team's principles folder (kept by its captain). */
export type PrinciplesTeam = {
  teamId: string;
  name: string;
  captainId: string | null;
  dir: string;
  files: { file: string; title: string; updatedAt: string }[];
};
/** A Cast agent the user brought into a project. */
export type Guest = {
  projectId: string;
  agentId: string;
  brief: string;
  orchestratorMay: boolean;
  addedAt: string;
};
export type MailKind = 'mail' | 'ticket' | 'idea';
export type MailStatus = 'new' | 'board' | 'discussed' | 'filed';
export type Mail = {
  id: string;
  fromProjectId: string | null;
  fromAgentId: string | null;
  /** A project id, or 'hq'. */
  to: string;
  kind: MailKind;
  subject: string;
  body: string;
  status: MailStatus;
  goalId: string | null;
  /** The director's line when it dealt with it. */
  note: string | null;
  at: string;
};
export type MailBox = { mail: Mail[]; unread: number; sent: number; triaging: boolean };
/** The draft on Tinker's table (all fields arrive once Tinker has a first sketch). */
export type CreatorDraft = Partial<{
  name: string;
  nick: string;
  role: string;
  summary: string;
  prompt: string;
  look: Partial<Look>;
}>;
export type CreatorSession = {
  id: string;
  chat: { from: 'user' | 'creator'; text: string }[];
  draft: CreatorDraft | null;
  /** What Tinker is doing during a turn (poll GET while waiting): thinking, or "Looking up “…”". */
  activity: { kind: string; label: string } | null;
  createdAt: string;
  updatedAt: string;
};
/** One message between agents (GET /comms, /projects/:id/comms). */
export type Comm = {
  id: number;
  scope: 'project' | 'draft' | 'studio';
  scopeId: string;
  kind: string;
  from: string | null;
  to: string | null;
  text: string;
  refs: Record<string, unknown>;
  at: string;
};
/** How often one agent used one office tool (GET /projects/:id/tool-use). */
export type ToolUse = { tool: string; agentId: string; uses: number; errors: number; lastAt: string };

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
  /** Who is on it right now (members on their parts of a split team item; the reviewer during a review). */
  workingNow?: TaskPerson[];
  /** Who finished it (done items only). */
  finishedBy?: TaskPerson | null;
  /** WORKFLOWS: one per review gate, in gate order; [] = no reviewer (show no strip). */
  signoffs?: Signoff[];
  /** Why it stopped, in plain words (failed / cancelled only); `details` is the raw note. */
  problem?: { message: string; details?: string } | null;
  createdAt: string;
  updatedAt: string;
};
/** A person on a whiteboard task: name + avatar (their look). */
export type TaskPerson = { id: string; name: string; look: Look };
export type SignoffState = 'pending' | 'signed' | 'sent-back';
export type Signoff = { reviewer: TaskPerson; kind: GateKind; state: SignoffState };
/** What a goal runs under, by name. `lead` / `crew`: temporary only. */
export type WorkflowTag = {
  id: string;
  name: string;
  temporary: boolean;
  lead?: string;
  crew?: string[];
};
/** A goal's workflow as the work list reads it: the tag plus the whole workflow (gates = the ones it really
    runs, a temporary lead's sign-offs included), so the editor can draw it read-only. Events carry the tag. */
export type GoalWorkflow = WorkflowTag & Partial<Omit<Workflow, 'id' | 'name' | 'lead' | 'crew'>>;
export type Goal = {
  id: string;
  projectId: string;
  text: string;
  summary: string;
  /** stopped: halted with stop_work, waits to be continued; cancelled: dropped. */
  status: 'running' | 'done' | 'failed' | 'stopped' | 'cancelled';
  items: ChecklistItem[];
  /** done / total, 0–100. */
  pct: number;
  caps: Partial<Caps> | null;
  /** F1c: the feature this goal works on, and whether finishing it ships that feature. */
  featureId?: string | null;
  ships?: boolean;
  /** The main storyline (the feature being built) or a side quest (a quick fix, a short research job). */
  quest?: 'main' | 'side';
  /** WORKFLOWS: null = an older goal (the usual way). Absent on old servers. */
  workflow?: GoalWorkflow | null;
  /** Who signed off its work, once each, in task order; [] unless done. */
  signedBy?: TaskPerson[];
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
  /** Nobody will read the answer any more: the question leaves. */
  'ask.withdrawn': { askId: string };
  'chat.message': {
    from: 'user' | 'orchestrator' | 'creator' | 'agent';
    agentId?: string;
    to?: string;
    text: string;
  };
  /** STUDIO LIFE */
  'desk.note': { agentId: string; noteId: string; runId?: string };
  'todo.changed': { agentId: string; todoId: string; change: 'added' | 'done' };
  /** An agent (or the director) used one of the office's tools. */
  'tool.used': { agentId: string; runId?: string; tool: string; ok: boolean };
  'guest.changed': { agentId: string; change: 'joined' | 'updated' | 'left' };
  /** The director staffed the project from chat. */
  'staff.changed': {
    teamIds: string[];
    agentIds: string[];
    added: string[];
    removed?: string[];
    moved?: string[];
  };
  'mail.changed': {
    mailId: string;
    change: 'arrived' | 'triaged' | 'filed' | 'reopened';
    status: 'new' | 'board' | 'discussed' | 'filed';
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
  /** A Cast agent on this project was edited (GET /agents/:id has the new values). */
  'agent.changed': {
    agentId: string;
    fields: ('name' | 'nick' | 'role' | 'look' | 'prompt' | 'canMail')[];
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
  'goal.changed': {
    goalId: string;
    status: Goal['status'];
    text?: string;
    summary?: string;
    quest?: Goal['quest'];
    workflow?: WorkflowTag | null;
  };
  /** WORKFLOWS: the project's stable workflows changed. */
  'workflows.changed': { count: number; names: string[] };
  /** A goal switched workflow mid-way; `regated` not-started tasks took the new checks. */
  'workflow.changed': WorkflowTag & { goalId: string; regated: number };
  /** A temporary goal settled: the crew ring fades. */
  'workflow.ended': {
    goalId: string;
    lead: string;
    crew: string[];
    status: 'done' | 'failed' | 'stopped' | 'cancelled';
  };
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
  /** An item passes between desks: to a reviewer, back to its builder (rework / merge-fix), or to a new owner (handover). */
  handoff: {
    itemId: string;
    goalId: string;
    from: string;
    to: string;
    kind: 'review' | 'rework' | 'merge-fix' | 'test-fix' | 'delegate' | 'deliver' | 'handover';
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
    status: 'now' | 'planned' | 'shipped' | 'shelved' | 'denied';
    order: number;
    closedAt?: string | null;
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
    /** When the line was said (its place in the chat); older servers leave it out → the event's time. */
    at?: string;
    runId?: string;
    /** The report this turn filed (the reply is one line pointing at it). */
    reportId?: string;
    /** The goal this line belongs to (the orchestrator's thread records every goal). */
    goalId?: string;
    /** A team rebuild the director's reply carries (the card shape lives in features/office/rebuild/api.ts). */
    rebuild?: {
      planId: string;
      needsConfirm: boolean;
      card: Record<string, unknown>;
      undoToken?: string;
      summary?: string;
    };
  };
  /** The director's chat started fresh; the old one is now a past chat in History. */
  'thread.reset': { agentId: string };
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
  'ask.withdrawn',
  'chat.message',
  'room.joined',
  'room.call',
  'desk.note',
  'todo.changed',
  'tool.used',
  'guest.changed',
  'staff.changed',
  'mail.changed',
  'plan.changed',
  'agent.changed',
  'cast.created',
  'health.checked',
  'goal.changed',
  'workflows.changed',
  'workflow.changed',
  'workflow.ended',
  'checklist.item',
  'feature.changed',
  'thread.message',
  'thread.reset',
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
