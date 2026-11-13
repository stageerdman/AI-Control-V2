import { describe, expect, it } from 'vitest';
import { openDb } from '../../src/db/connection.ts';
import { MIGRATIONS, migrate } from '../../src/db/migrations.ts';

describe('migrations', () => {
  it('bring a fresh db to the latest version and are idempotent', () => {
    const db = openDb(':memory:');
    const v = () => (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
    expect(v()).toBe(MIGRATIONS.length);
    migrate(db);
    expect(v()).toBe(MIGRATIONS.length);
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {
        name: string;
      }[]
    ).map((r) => r.name);
    expect(tables).toEqual(
      expect.arrayContaining([
        'agents',
        'drafts',
        'meta',
        'project_agents',
        'project_teams',
        'projects',
        'roles',
        'team_members',
        'teams',
        'trash',
      ]),
    );
    db.close();
  });

  it('enforce foreign keys and one setter / one creator at the schema level', () => {
    const db = openDb(':memory:');
    const ins = db.prepare(
      "INSERT INTO agents (id, kind, name, look, position, created_at, updated_at) VALUES (?, ?, 'x', '{}', 0, '', '')",
    );
    ins.run('s1', 'setter');
    expect(() => ins.run('s2', 'setter')).toThrow(/UNIQUE/);
    ins.run('c1', 'creator');
    expect(() => ins.run('c2', 'creator')).toThrow(/UNIQUE/);
    ins.run('o1', 'orchestrator');
    ins.run('o2', 'orchestrator'); // many orchestrators are fine
    expect(() => ins.run('k', 'wizard')).toThrow(/CHECK/);
    expect(() =>
      db.prepare("INSERT INTO team_members (team_id, agent_id, position) VALUES ('ghost', 's1', 0)").run(),
    ).toThrow(/FOREIGN KEY/);
    db.close();
  });
});
