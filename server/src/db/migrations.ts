/* Ordered, append-only migrations tracked by PRAGMA user_version.
   Never edit a shipped migration — add a new one. */
import type { DatabaseSync } from 'node:sqlite';

export const MIGRATIONS: readonly string[] = [
  /* 1 — meta */
  `CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,

  /* 2 — cast (roles, agents, teams), projects, setup drafts, trash (restore tokens).
     Rules that need context (≥1 orchestrator, captain ∈ members, ≤7 seats) live in
     src/domain; the schema backs up what it can express on its own. */
  `
  CREATE TABLE roles (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    name_key   TEXT NOT NULL UNIQUE,          -- lower(name): roles are unique case-insensitively
    position   INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE agents (
    id         TEXT PRIMARY KEY,
    kind       TEXT NOT NULL CHECK (kind IN ('agent', 'setter', 'orchestrator', 'creator')),
    name       TEXT NOT NULL,
    nick       TEXT,
    role_id    TEXT REFERENCES roles(id) ON DELETE SET NULL,
    look       TEXT NOT NULL,                 -- JSON {hat, tool, body, antenna, face, hue, decal?}
    prompt     TEXT NOT NULL DEFAULT '',
    position   INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  -- at most one Project Setter and one Agent Creator, whatever the code does
  CREATE UNIQUE INDEX agents_one_per_singleton_kind ON agents(kind) WHERE kind IN ('setter', 'creator');

  CREATE TABLE teams (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL,
    emblem     TEXT NOT NULL,
    blurb      TEXT NOT NULL DEFAULT '',
    instr      TEXT NOT NULL DEFAULT '',      -- what the team does
    code       TEXT NOT NULL DEFAULT '',      -- how the team codes
    captain_id TEXT,                          -- ∈ members (enforced in domain); NULL only when empty
    position   INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE team_members (
    team_id  TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    instr    TEXT NOT NULL DEFAULT '',        -- this member's job on this team
    PRIMARY KEY (team_id, agent_id)
  );

  CREATE TABLE projects (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    note             TEXT NOT NULL DEFAULT '',
    status           TEXT NOT NULL CHECK (status IN ('live', 'needs', 'idle', 'draft', 'archived')),
    progress         INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    folder           TEXT UNIQUE,             -- relative to the sandbox root
    orchestrator_id  TEXT NOT NULL REFERENCES agents(id),
    github_connected INTEGER NOT NULL DEFAULT 0,
    github_private   INTEGER NOT NULL DEFAULT 1,
    tile             TEXT NOT NULL,           -- JSON {g1, g2, glyph}
    position         INTEGER NOT NULL,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
  );

  CREATE TABLE project_teams (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    team_id    TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    position   INTEGER NOT NULL,
    PRIMARY KEY (project_id, team_id)
  );

  -- individual specialists on a project (teams come first; these are the exceptions)
  CREATE TABLE project_agents (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    position   INTEGER NOT NULL,
    PRIMARY KEY (project_id, agent_id)
  );

  CREATE TABLE drafts (
    id              TEXT PRIMARY KEY,
    mode            TEXT NOT NULL CHECK (mode IN ('new', 'adopt')),
    step            INTEGER NOT NULL DEFAULT 1,
    name            TEXT NOT NULL DEFAULT '',
    about           TEXT NOT NULL DEFAULT '',
    folder          TEXT,
    orchestrator_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
    plan            TEXT,                     -- JSON, shape owned by B6
    chat            TEXT NOT NULL DEFAULT '[]',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );

  CREATE TABLE trash (
    token      TEXT PRIMARY KEY,
    kind       TEXT NOT NULL CHECK (kind IN ('agent', 'role', 'team', 'draft')),
    item_id    TEXT NOT NULL,
    payload    TEXT NOT NULL,                 -- JSON snapshot needed to restore
    created_at TEXT NOT NULL
  );
  `,

  /* 3 — secrets & access (B3). Metadata only: secret VALUES live in the global .env,
     never here. last4 is NULL when the value is too short to show any of it. */
  `
  CREATE TABLE credentials (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    env_var      TEXT NOT NULL UNIQUE,        -- the key in ~/.ai-control/.env
    serves       TEXT NOT NULL DEFAULT '',
    docs_url     TEXT,
    instructions TEXT NOT NULL DEFAULT '',
    has_value    INTEGER NOT NULL DEFAULT 0,
    last4        TEXT,
    position     INTEGER NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
  );

  -- a project reaches nothing until a credential is granted here
  CREATE TABLE project_access (
    project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    credential_id TEXT NOT NULL REFERENCES credentials(id) ON DELETE CASCADE,
    granted_at    TEXT NOT NULL,
    PRIMARY KEY (project_id, credential_id)
  );
  `,

  /* 4 — live events (B4): an append-only log per project (and per setup draft, so the
     setup screen can watch the Project Setter before the project exists). AUTOINCREMENT
     keeps ids strictly increasing and never reused — they are the SSE Last-Event-ID. */
  `
  CREATE TABLE events (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    scope    TEXT NOT NULL CHECK (scope IN ('project', 'draft')),
    scope_id TEXT NOT NULL,
    type     TEXT NOT NULL,
    payload  TEXT NOT NULL,                 -- JSON, validated by src/domain/events.ts, secrets redacted
    at       TEXT NOT NULL
  );
  CREATE INDEX events_by_scope ON events(scope, scope_id, id);
  -- a log never outlives what it describes
  CREATE TRIGGER events_project_gone AFTER DELETE ON projects
    BEGIN DELETE FROM events WHERE scope = 'project' AND scope_id = OLD.id; END;
  CREATE TRIGGER events_draft_gone AFTER DELETE ON drafts
    BEGIN DELETE FROM events WHERE scope = 'draft' AND scope_id = OLD.id; END;
  `,

  /* 5 — agent runs (B5): one row per headless Claude Code run, plus the questions an agent
     asked the user through the ask_user tool. */
  `
  CREATE TABLE runs (
    id            TEXT PRIMARY KEY,
    project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    agent_id      TEXT NOT NULL,              -- no FK: a run's history outlives a deleted agent
    team_id       TEXT,
    task          TEXT NOT NULL,
    status        TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'cancelled')),
    runner        TEXT NOT NULL,              -- 'claude-cli' | 'fake'
    model         TEXT,
    caps          TEXT NOT NULL,              -- JSON {maxTurns, maxBudgetUsd}
    session_id    TEXT,                       -- Claude Code session, for --resume
    result        TEXT,
    error         TEXT,
    input_tokens  INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd      REAL,
    turns         INTEGER NOT NULL DEFAULT 0,
    started_at    TEXT NOT NULL,
    ended_at      TEXT
  );
  -- one live run per agent per project
  CREATE UNIQUE INDEX runs_one_live_per_agent ON runs(project_id, agent_id) WHERE status = 'running';

  CREATE TABLE asks (
    id          TEXT PRIMARY KEY,
    run_id      TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    project_id  TEXT NOT NULL,
    agent_id    TEXT NOT NULL,
    question    TEXT NOT NULL,
    options     TEXT,                         -- JSON string[] or NULL
    status      TEXT NOT NULL CHECK (status IN ('open', 'answered', 'cancelled')),
    answer      TEXT,
    created_at  TEXT NOT NULL,
    answered_at TEXT
  );
  `,

  /* 6 — the whiteboard (B6 dispatch): a goal the orchestrator broke into checklist items,
     each assigned to a team captain or a project specialist and worked off as an agent run. */
  `
  CREATE TABLE goals (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    text       TEXT NOT NULL,                 -- what the user asked for
    summary    TEXT NOT NULL DEFAULT '',      -- the orchestrator's one-line plan
    status     TEXT NOT NULL CHECK (status IN ('running', 'done', 'failed', 'cancelled')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE checklist_items (
    id         TEXT PRIMARY KEY,
    goal_id    TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL,
    position   INTEGER NOT NULL,
    text       TEXT NOT NULL,                 -- the whiteboard line
    brief      TEXT NOT NULL,                 -- what the assignee is told
    agent_id   TEXT NOT NULL,                 -- a captain or a specialist (no FK: history outlives the agent)
    team_id    TEXT,                          -- set when the assignee captains a team on the project
    status     TEXT NOT NULL CHECK (status IN ('todo', 'running', 'done', 'failed', 'cancelled')),
    run_id     TEXT,
    note       TEXT,                          -- the run's summary or error
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX checklist_by_project ON checklist_items(project_id, status);
  `,

  /* 7 — per-goal run caps (JSON {maxTurns?, maxBudgetUsd?}) for the runs a goal dispatches */
  `ALTER TABLE goals ADD COLUMN caps TEXT;`,

  /* 8 — checklist items run in order unless marked parallel (found live: two agents in one working tree
     wrote the same file at once). parallel = may start alongside the item before it. */
  `ALTER TABLE checklist_items ADD COLUMN parallel INTEGER NOT NULL DEFAULT 0;`,

  /* 9 — health reports (B7): one row per finished check — grades + the git/GitHub snapshot */
  `
  CREATE TABLE health_reports (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    report     TEXT NOT NULL,                 -- JSON {modularity, cleanliness, reusability, summary}
    git        TEXT NOT NULL,                 -- JSON GitStatus at check time
    usage      TEXT NOT NULL,                 -- JSON {attempts, turns, input, output}
    created_at TEXT NOT NULL
  );
  CREATE INDEX health_by_project ON health_reports(project_id, created_at);
  `,

  /* 10 — the features folder (U1): Now / Planned / Shipped, each a plain description + vision.
     position = order within its status (1-based, kept dense by src/db/features.ts). */
  `
  CREATE TABLE features (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    status      TEXT NOT NULL CHECK (status IN ('now', 'planned', 'shipped')),
    position    INTEGER NOT NULL,
    pct         INTEGER CHECK (pct BETWEEN 0 AND 100),
    owner       TEXT,                         -- an agent or team id (no FK: a plain label that may outlive it)
    description TEXT NOT NULL DEFAULT '',
    vision      TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE INDEX features_by_project ON features(project_id, status, position);
  `,

  /* 11 — project conversations (U1): one thread per (project, agent) — the user chatting with the
     project's orchestrator or any agent on it. Each user message starts/resumes that agent's run. */
  `
  CREATE TABLE thread_messages (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    agent_id   TEXT NOT NULL,                 -- the thread (no FK: history outlives a deleted agent)
    sender     TEXT NOT NULL CHECK (sender IN ('user', 'agent')),
    kind       TEXT NOT NULL CHECK (kind IN ('text', 'error')),
    text       TEXT NOT NULL,                 -- secrets redacted before it is stored
    run_id     TEXT,                          -- the run this turn started (user) / came from (agent)
    created_at TEXT NOT NULL
  );
  CREATE INDEX thread_messages_by_thread ON thread_messages(project_id, agent_id, created_at);
  `,

  /* 12 — the pager (U1): an open ask you already went to see (opened its office and left) is quiet
     until a NEW ask arrives there. seen_at = when you visited while it was open. */
  `ALTER TABLE asks ADD COLUMN seen_at TEXT;`,

  /* 13 — reports (U1, spec-reports.md): finished write-ups filed by reporter roles/teams through the
     file_report tool. author is a snapshot (survives deletes/renames); body is markdown, secrets masked. */
  `
  ALTER TABLE roles ADD COLUMN reporter INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE teams ADD COLUMN reporter INTEGER NOT NULL DEFAULT 0;
  -- a dispatched item that asks for knowledge, not change: done when its report is filed
  ALTER TABLE checklist_items ADD COLUMN report INTEGER NOT NULL DEFAULT 0;
  -- the one-line thread reply that points at the report a chat turn filed
  ALTER TABLE thread_messages ADD COLUMN report_id TEXT;
  CREATE TABLE reports (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL CHECK (kind IN ('research', 'review', 'status', 'other')),
    title       TEXT NOT NULL,
    summary     TEXT NOT NULL,
    body        TEXT NOT NULL,
    question    TEXT,
    sources     TEXT NOT NULL DEFAULT '[]',   -- JSON [{title, url?, path?}]
    author      TEXT NOT NULL,                -- JSON {agentId, name, teamId, teamName}
    run_id      TEXT,
    goal_id     TEXT,
    item_id     TEXT,
    thread_id   TEXT,                         -- the thread's agent id when a chat turn filed it
    created_at  TEXT NOT NULL,
    read_at     TEXT,
    archived_at TEXT
  );
  CREATE INDEX reports_by_project ON reports(project_id, created_at);
  CREATE INDEX reports_by_run ON reports(run_id);
  -- the starter cast's reporters (fresh databases get them from the seed)
  UPDATE roles SET reporter = 1 WHERE name_key = 'research';
  UPDATE teams SET reporter = 1 WHERE id = 'expedition';
  `,
  /* 14 — the Setter runs on the draft (U2, user's v5 order: Setter first, then the orchestrator picks the
     team). setup_at = when the folder was set up (the draft owns it from then on), setup_commit = its
     commit (null when nothing was added). finish then only creates the project. */
  `
  ALTER TABLE drafts ADD COLUMN setup_at TEXT;
  ALTER TABLE drafts ADD COLUMN setup_commit TEXT;
  `,
  /* 15 — collaboration design (F1b/B8): the orchestrator's plan for who talks to whom and which review gates
     work passes through (JSON, src/domain/collaboration.ts). A checklist item now flows build → review(s) → done:
     stage = where it is, gates = its review steps (snapshot at dispatch), gate_index = the next one,
     send_backs = how often a reviewer sent it back, notes = the last notes, reviews = the history (JSON),
     build_run_id = the builder's last run (rework resumes its session). */
  `
  ALTER TABLE projects ADD COLUMN collaboration TEXT;
  ALTER TABLE checklist_items ADD COLUMN stage TEXT NOT NULL DEFAULT 'build' CHECK (stage IN ('build', 'review', 'merge'));
  ALTER TABLE checklist_items ADD COLUMN gates TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE checklist_items ADD COLUMN gate_index INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE checklist_items ADD COLUMN send_backs INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE checklist_items ADD COLUMN notes TEXT;
  ALTER TABLE checklist_items ADD COLUMN reviews TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE checklist_items ADD COLUMN build_run_id TEXT;
  `,
  /* 16 — toolsmiths (F1b): agents holding a toolsmith role (quality / test) get a persistent toolkit folder
     (<data dir>/toolkits/<agentId>/) and build their own small checks. Starter cast: QA + Quality. */
  `
  ALTER TABLE roles ADD COLUMN toolsmith INTEGER NOT NULL DEFAULT 0;
  UPDATE roles SET toolsmith = 1 WHERE name_key IN ('qa', 'quality');
  `,
  /* 17 — git worktrees per item (F1b): workspace = the item's own checkout + branch (JSON {cwd, branch, base, main}),
     merge_tries = how often merging it back hit a conflict the builder had to fix. */
  `
  ALTER TABLE checklist_items ADD COLUMN workspace TEXT;
  ALTER TABLE checklist_items ADD COLUMN merge_tries INTEGER NOT NULL DEFAULT 0;
  `,
  /* 18 — overall progress (F1b): an optional target label the progress counts towards ("v1.0"). */
  `ALTER TABLE projects ADD COLUMN target TEXT;`,
  /* 19 — the orchestrator's thread records goals (F1b): the user's goal and the orchestrator's plan reply carry the goal. */
  `ALTER TABLE thread_messages ADD COLUMN goal_id TEXT;`,
  /* 20 — real team work (F1c): a captain splits a team item into member sub-tasks. A sub-task is a checklist item
     with parent_id = the team item (same goal; never on the whiteboard's top level). team_phase on the team item:
     NULL (the captain works it, or it isn't split) · 'members' (sub-tasks running) · 'integrate' (the captain pulls
     their work together). team_rounds = rework rounds the captain sent back, team_plan = the captain's split in a
     sentence. Goals link to a feature (feature_id); ships = finishing the goal ships the feature. */
  `
  ALTER TABLE checklist_items ADD COLUMN parent_id TEXT REFERENCES checklist_items(id) ON DELETE CASCADE;
  ALTER TABLE checklist_items ADD COLUMN team_phase TEXT CHECK (team_phase IN ('members', 'integrate'));
  ALTER TABLE checklist_items ADD COLUMN team_rounds INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE checklist_items ADD COLUMN team_plan TEXT;
  CREATE INDEX checklist_by_parent ON checklist_items(parent_id);
  ALTER TABLE goals ADD COLUMN feature_id TEXT;
  ALTER TABLE goals ADD COLUMN ships INTEGER NOT NULL DEFAULT 1;
  `,
  /* 21 — accesses (G1): an access is a named bundle of fields (keys, tokens, usernames, URLs…), granted per
     project as a whole. Every B3 credential becomes a one-field access with the same id (field 'f-<id>', label
     'Key', secret), its grants carried over as they were. Values still live only in the global .env; a field
     row holds metadata + last-4. access_seen_at = when the project last looked at its access (the "new" dot). */
  `
  CREATE TABLE accesses (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    serves       TEXT NOT NULL DEFAULT '',
    docs_url     TEXT,
    instructions TEXT NOT NULL DEFAULT '',
    position     INTEGER NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
  );
  INSERT INTO accesses (id, name, serves, docs_url, instructions, position, created_at, updated_at)
    SELECT id, name, serves, docs_url, instructions, position, created_at, updated_at FROM credentials;

  CREATE TABLE access_fields (
    id         TEXT PRIMARY KEY,
    access_id  TEXT NOT NULL REFERENCES accesses(id) ON DELETE CASCADE,
    label      TEXT NOT NULL,
    env_var    TEXT NOT NULL UNIQUE,          -- the key in ~/.ai-control/.env (one namespace for every field)
    secret     INTEGER NOT NULL DEFAULT 1,    -- 0 = may be shown (a username, a URL)
    has_value  INTEGER NOT NULL DEFAULT 0,
    last4      TEXT,
    position   INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  INSERT INTO access_fields (id, access_id, label, env_var, secret, has_value, last4, position, created_at, updated_at)
    SELECT 'f-' || id, id, 'Key', env_var, 1, has_value, last4, 0, created_at, updated_at FROM credentials;

  CREATE TABLE access_grants (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    access_id  TEXT NOT NULL REFERENCES accesses(id) ON DELETE CASCADE,
    granted_at TEXT NOT NULL,
    PRIMARY KEY (project_id, access_id)
  );
  INSERT INTO access_grants (project_id, access_id, granted_at)
    SELECT project_id, credential_id, granted_at FROM project_access;

  DROP TABLE project_access;
  DROP TABLE credentials;
  ALTER TABLE projects ADD COLUMN access_seen_at TEXT;
  `,
  /* 22 — GitHub (G1): the repo the studio created (or adopted) for a sandbox folder — keyed by folder so a draft's
     setup and the project it becomes share it. last_push = JSON {ok, at, note?, commit?} of the latest auto-push.
     drafts.github = this draft's choice at setup (NULL = the studio default, meta 'github_by_default').
     The B0 seed's github_connected / github_private flags were placeholders: the project payload now reads this table. */
  `
  CREATE TABLE github_repos (
    folder     TEXT PRIMARY KEY,
    url        TEXT NOT NULL,
    visibility TEXT CHECK (visibility IN ('public', 'private', 'internal')),
    last_push  TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  ALTER TABLE drafts ADD COLUMN github INTEGER;
  `,
  /* 23 — ports (G1): each project owns a stable block of 5 ports in 3100–3999: base = its app's port ("Run the app"),
     base+1…base+4 = spares for agents' own servers (each run gets one as PORT). Blocks never overlap. */
  `
  CREATE TABLE port_blocks (
    project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    base       INTEGER NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  );
  `,
  /* 24 — director chat freshness (G1): the orchestrator's thread runs as one resumed CLI session at a time.
     started_at = when the current session began (its turns = user turns since then); rotate = start a fresh one on
     the next turn (a new goal was posted after one had finished). A rotation carries a short recap of the thread. */
  `
  CREATE TABLE thread_sessions (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    agent_id   TEXT NOT NULL,
    started_at TEXT NOT NULL,
    rotate     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (project_id, agent_id)
  );
  `,
  /* 25 — the office's work clock (OFFICE): a run's kind of work (thinking | building | reviewing | research |
     setup; NULL = read from the row, older runs), and crew_time — the crew calls that never become runs (goal
     planning, a captain's split, team design, health checks, the setup chat, the Agent Creator, Rivet's setup),
     on a draft until it's finished, then on its project. */
  `
  ALTER TABLE runs ADD COLUMN kind TEXT;
  CREATE TABLE crew_time (
    id         TEXT PRIMARY KEY,
    scope      TEXT NOT NULL CHECK (scope IN ('project', 'draft')),
    owner_id   TEXT NOT NULL,
    agent_id   TEXT NOT NULL,
    kind       TEXT NOT NULL,
    turns      INTEGER NOT NULL DEFAULT 0,
    started_at TEXT NOT NULL,
    ended_at   TEXT
  );
  CREATE INDEX crew_time_owner ON crew_time(scope, owner_id);
  CREATE TRIGGER crew_time_project_gone AFTER DELETE ON projects
    BEGIN DELETE FROM crew_time WHERE scope = 'project' AND owner_id = OLD.id; END;
  CREATE TRIGGER crew_time_draft_gone AFTER DELETE ON drafts
    BEGIN DELETE FROM crew_time WHERE scope = 'draft' AND owner_id = OLD.id; END;
  `,
  /* 26 — the project's picture (OFFICE portrait): JSON {ext, v} of <data dir>/images/<id>.<ext>; NULL = the tile. */
  `
  ALTER TABLE projects ADD COLUMN image TEXT;
  `,
  /* 27 — auto-approve (AGENTS): who answered an ask — 'user', or 'auto' (the studio said yes to a permission check). */
  `
  ALTER TABLE asks ADD COLUMN answered_by TEXT;
  `,
  /* 28 — STUDIO LIFE: the comms log (every agent-to-agent message, for later analysis), desk notes (willing forget),
     guests the user brought in, inter-project mail (HQ = the project in meta 'hq_project'), Tinker design chats,
     and who may send mail. */
  `
  CREATE TABLE comms (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    scope    TEXT NOT NULL CHECK (scope IN ('project', 'draft', 'studio')),
    scope_id TEXT NOT NULL,
    kind     TEXT NOT NULL,
    from_id  TEXT,
    to_id    TEXT,
    text     TEXT NOT NULL,
    refs     TEXT NOT NULL DEFAULT '{}',
    at       TEXT NOT NULL
  );
  CREATE INDEX comms_scope ON comms(scope, scope_id, id);
  CREATE TABLE desk_notes (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    agent_id   TEXT NOT NULL,
    run_id     TEXT,
    body       TEXT NOT NULL,
    at         TEXT NOT NULL
  );
  CREATE INDEX desk_notes_agent ON desk_notes(project_id, agent_id, at);
  CREATE TABLE project_guests (
    project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    agent_id         TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    brief            TEXT NOT NULL,
    orchestrator_may INTEGER NOT NULL DEFAULT 0,
    added_at         TEXT NOT NULL,
    PRIMARY KEY (project_id, agent_id)
  );
  CREATE TABLE mail (
    id           TEXT PRIMARY KEY,
    from_project TEXT,
    from_agent   TEXT,
    to_project   TEXT NOT NULL,
    kind         TEXT NOT NULL CHECK (kind IN ('mail', 'ticket', 'idea')),
    subject      TEXT NOT NULL,
    body         TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'board', 'discussed', 'filed')),
    goal_id      TEXT,
    note         TEXT,
    at           TEXT NOT NULL
  );
  CREATE INDEX mail_to ON mail(to_project, at);
  CREATE TABLE creator_sessions (
    id         TEXT PRIMARY KEY,
    chat       TEXT NOT NULL DEFAULT '[]',
    draft      TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  ALTER TABLE agents ADD COLUMN can_mail INTEGER NOT NULL DEFAULT 1;
  `,
  /* 29 — chat history: every message of a run (its opening task = seq 0, the agent's words, short tool lines,
     the user's answers, how it ended), kept after the run ends so the user can read it back or ask about it. */
  `
  CREATE TABLE chat_messages (
    id         TEXT PRIMARY KEY,
    run_id     TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL,
    agent_id   TEXT NOT NULL,
    seq        INTEGER NOT NULL,
    role       TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
    text       TEXT NOT NULL,
    meta       TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX chat_messages_agent ON chat_messages(agent_id, created_at);
  CREATE UNIQUE INDEX chat_messages_run ON chat_messages(run_id, seq);
  `,
  /* 30 — carry on: an item stopped at its turn cap (or by a restart) picks up where it was.
     resume_run_id = the stopped run whose session the next run resumes; continues = turn-cap pick-ups so far. */
  `
  ALTER TABLE checklist_items ADD COLUMN resume_run_id TEXT;
  ALTER TABLE checklist_items ADD COLUMN continues INTEGER NOT NULL DEFAULT 0;
  `,
  /* 31 — team rebuild: a director reply may carry a rebuild offer (plan id, card, undo token). */
  `ALTER TABLE thread_messages ADD COLUMN rebuild TEXT;`,
  /* 32 — working tools per agent: JSON Toolset (src/domain/toolset.ts) — what it may edit and run.
     NULL = the studio's full kit, as every agent had before. */
  `ALTER TABLE agents ADD COLUMN tools TEXT;`,
  /* 33 — soft delete: a deleted agent is hidden (deleted_at set) for the trash's keep time, so nothing
     cascades and its chats, work and comms stay linked to the same id. Every agent read skips these rows. */
  `ALTER TABLE agents ADD COLUMN deleted_at TEXT;`,
  /* 34 — the whiteboard's change log: every change the director's tools make (who, what, when). A removal
     keeps the rows it took off (snapshot) for a while, so it can be undone; undone_at marks one put back. */
  `
  CREATE TABLE board_changes (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    actor      TEXT NOT NULL,
    action     TEXT NOT NULL,
    summary    TEXT NOT NULL,
    snapshot   TEXT,
    undone_at  TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX board_changes_by_project ON board_changes(project_id, created_at);
  `,
  /* 35 — each agent's to-do list on its desk: callers' requests and its own reminders, kept across sessions.
     due_at = when it is scheduled (optional); notify = page the user when it is done; goal_id = done when that
     goal ends ("page me when it's done"). */
  `
  CREATE TABLE todos (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    agent_id   TEXT NOT NULL,
    from_id    TEXT,
    text       TEXT NOT NULL,
    due_at     TEXT,
    notify     INTEGER NOT NULL DEFAULT 0,
    goal_id    TEXT,
    status     TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL,
    done_at    TEXT
  );
  CREATE INDEX todos_agent ON todos(project_id, agent_id, status, created_at);
  `,
];

export function migrate(db: DatabaseSync): number {
  const current = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v] as string);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  return MIGRATIONS.length;
}
