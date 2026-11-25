/* PROJECT ISOLATION: my_history reads only this project's chats. It used to take the agent's latest chats from
   every project and filter afterwards, so a busy other project pushed this one's chats off the list. */
import { describe, expect, it } from 'vitest';
import { chatTranscript, recentChats } from '../../src/chats/tools.ts';
import { type Db, openDb } from '../../src/db/connection.ts';
import { runsRepo } from '../../src/db/runs.ts';

const addProject = (db: Db, id: string) => {
  db.prepare(
    "INSERT OR IGNORE INTO agents (id, kind, name, look, position, created_at, updated_at) VALUES ('o', 'orchestrator', 'O', '{}', 0, '', '')",
  ).run();
  db.prepare(
    "INSERT INTO projects (id, name, status, orchestrator_id, tile, position, created_at, updated_at) VALUES (?, ?, 'live', 'o', '{}', 0, '', '')",
  ).run(id, id);
};
const addFinishedRun = (db: Db, id: string, projectId: string, task: string, startedAt: string) => {
  const runs = runsRepo(db);
  runs.insert({
    id,
    projectId,
    agentId: 'a-pete',
    teamId: null,
    task,
    runner: 'fake',
    model: null,
    caps: { maxTurns: 1, maxBudgetUsd: 1 },
  });
  db.prepare('UPDATE runs SET started_at = ? WHERE id = ?').run(startedAt, id);
  runs.finish(id, {
    status: 'succeeded',
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    turns: 1,
  });
};

describe('my_history stays in its project', () => {
  it("lists this project's chats even when the agent has many newer ones elsewhere, and never another's", () => {
    const db = openDb(':memory:');
    addProject(db, 'kite');
    addProject(db, 'reef');
    addFinishedRun(db, 'here', 'kite', 'Make hello.txt', '2026-01-01T00:00:00.000Z');
    for (let i = 0; i < 60; i++)
      addFinishedRun(
        db,
        `there-${i}`,
        'reef',
        'Voice search',
        `2026-02-01T00:00:${String(i).padStart(2, '0')}.000Z`,
      );

    const me = { projectId: 'kite', agentId: 'a-pete', runId: 'now' };
    const list = recentChats(db, me);
    expect(list).toContain('here');
    expect(list).not.toContain('Voice search');
    expect(() => chatTranscript(db, me, 'there-0')).toThrow(/No chat of yours in this project/);
    expect(chatTranscript(db, me, 'here')).toContain('Make hello.txt');
    db.close();
  });
});
