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
