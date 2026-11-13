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
