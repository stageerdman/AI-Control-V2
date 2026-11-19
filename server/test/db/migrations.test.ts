import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { openDb } from '../../src/db/connection.ts';
import { MIGRATIONS, migrate } from '../../src/db/migrations.ts';
import { workRepo } from '../../src/db/work.ts';
import { DEFAULT_WORKFLOW } from '../../src/domain/workflows.ts';
import { testApp } from '../helpers.ts';

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

  it('13 marks the starter reporters in a database seeded before reports existed', () => {
    const db = new DatabaseSync(':memory:');
    for (const sql of MIGRATIONS.slice(0, 12)) db.exec(sql);
    db.exec('PRAGMA user_version = 12');
    db.exec(
      "INSERT INTO roles (id, name, name_key, position, created_at) VALUES ('r-research', 'Research', 'research', 0, ''), ('r-qa', 'QA', 'qa', 1, '')",
    );
    db.exec(
      "INSERT INTO teams (id, name, color, emblem, position, created_at, updated_at) VALUES ('expedition', 'The Expedition', 'teal', 'compass', 0, '', ''), ('polish', 'P', 'x', 'y', 1, '', '')",
    );
    migrate(db);
    const flags = (t: string) =>
      (
        db.prepare(`SELECT id, reporter FROM ${t} ORDER BY id`).all() as { id: string; reporter: number }[]
      ).map((r) => [r.id, r.reporter]);
    expect(flags('roles')).toEqual([
      ['r-qa', 0],
      ['r-research', 1],
    ]);
    expect(flags('teams')).toEqual([
      ['expedition', 1],
      ['polish', 0],
    ]);
    db.close();
  });

  it('40: a stored collaboration reads as workflows[0]; goals keep their workflow', async () => {
    const h = testApp({ seed: true });
    const design = { orchestratorTalksTo: 'everyone', gates: [], maxSendBacks: 1, summary: 'Old design.' };
    h.db
      .prepare("UPDATE projects SET collaboration = ?, workflows = NULL WHERE id = 'aurora'")
      .run(JSON.stringify(design));
    expect(h.store.projects.require('aurora').workflows).toEqual([
      { ...design, id: 'usual', name: 'Our usual way', when: 'everything' },
    ]);
    h.store.projects.update('aurora', { note: 'touched' }); // a write keeps it readable
    expect(h.store.projects.require('aurora').workflows?.[0]?.summary).toBe('Old design.');

    const work = workRepo(h.db);
    const flow = { ...DEFAULT_WORKFLOW, id: 'temp', name: 'Prof leads', lead: 'a-prof', crew: ['a-semic'] };
    const g = work.insertGoal({ id: 'g1', projectId: 'aurora', text: 't', summary: 's', workflow: flow }, []);
    expect(g.workflow).toEqual(flow);
    work.setGoalWorkflow('g1', null);
    expect(work.goal('g1')?.workflow).toBeNull();
    await h.close();
  });

  it('46: vision folds into description, shipped rows get their shipping day, "Shelved: X" moves to Shelved', () => {
    const db = new DatabaseSync(':memory:');
    for (const sql of MIGRATIONS.slice(0, 45)) db.exec(sql);
    db.exec('PRAGMA user_version = 45');
    db.exec(`INSERT INTO agents (id, kind, name, look, position, created_at, updated_at)
             VALUES ('o', 'orchestrator', 'O', '{}', 0, '', '')`);
    db.exec(`INSERT INTO projects (id, name, status, orchestrator_id, tile, position, created_at, updated_at)
             VALUES ('p', 'P', 'idle', 'o', '{}', 0, '', '')`);
    const feature = db.prepare(
      `INSERT INTO features (id, project_id, name, status, position, description, vision, created_at, updated_at)
       VALUES (?, 'p', ?, ?, ?, ?, ?, 'c', ?)`,
    );
    feature.run('f-both', 'Both', 'planned', 1, ' Desc. ', ' Vis. ', 'u1');
    feature.run('f-vis', 'Vision only', 'planned', 2, '', 'Vis.', 'u2');
    feature.run('f-none', 'Neither', 'planned', 3, 'Kept as is ', '  ', 'u3');
    feature.run('f-park', 'Shelved: Agent Thinking Power', 'planned', 4, '', '', 'u4');
    feature.run('f-ship', 'Shipped by events', 'shipped', 1, '', '', 'u5');
    feature.run('f-quiet', 'Shipped, no events', 'shipped', 2, '', '', 'u6');
    const ev = db.prepare(
      "INSERT INTO events (scope, scope_id, type, payload, at) VALUES ('project', 'p', ?, ?, ?)",
    );
    const changed = (status: string, at: string) =>
      ev.run('feature.changed', JSON.stringify({ featureId: 'f-ship', status }), at);
    changed('shipped', 't1'); // shipped once…
    changed('now', 't2'); // …reopened…
    changed('shipped', 't3'); // …shipped again: this is the day
    changed('shipped', 't4'); // a later edit while shipped doesn't move it
    migrate(db);

    const got = db
      .prepare('SELECT id, name, status, position, description, closed_at FROM features ORDER BY id')
      .all();
    expect(got).toEqual([
      { id: 'f-both', name: 'Both', status: 'planned', position: 1, description: 'Desc.\n\nVis.', closed_at: null },
      { id: 'f-none', name: 'Neither', status: 'planned', position: 3, description: 'Kept as is ', closed_at: null },
      { id: 'f-park', name: 'Agent Thinking Power', status: 'shelved', position: 1, description: '', closed_at: 'u4' },
      { id: 'f-quiet', name: 'Shipped, no events', status: 'shipped', position: 2, description: '', closed_at: 'u6' },
      { id: 'f-ship', name: 'Shipped by events', status: 'shipped', position: 1, description: '', closed_at: 't3' },
      { id: 'f-vis', name: 'Vision only', status: 'planned', position: 2, description: 'Vis.', closed_at: null },
    ]);
    const cols = (db.prepare('PRAGMA table_info(features)').all() as { name: string }[]).map((c) => c.name);
    expect(cols).not.toContain('vision');
    expect(() =>
      db.exec(`INSERT INTO features (id, project_id, name, status, position, created_at, updated_at)
               VALUES ('x', 'p', 'x', 'later', 1, '', '')`),
    ).toThrow(/CHECK/);
    db.close();
  });

  it('45: a database that stored thinking power drops it and keeps the rows', () => {
    const db = new DatabaseSync(':memory:');
    const dropped = MIGRATIONS.findIndex((sql) => sql.includes('DROP COLUMN thinking'));
    for (const sql of MIGRATIONS.slice(0, dropped)) db.exec(sql);
    db.exec(`PRAGMA user_version = ${dropped}`);
    db.exec(
      "INSERT INTO agents (id, kind, name, look, position, thinking, created_at, updated_at) VALUES ('a', 'agent', 'x', '{}', 0, 'deepest', '', '')",
    );
    migrate(db);
    const cols = (t: string) =>
      (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
    for (const t of ['agents', 'checklist_items', 'runs', 'crew_time']) expect(cols(t)).not.toContain('thinking');
    expect(db.prepare('SELECT id FROM agents').all()).toEqual([{ id: 'a' }]);
    db.close();
  });
});
