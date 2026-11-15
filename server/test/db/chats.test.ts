import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  appendChatMessage,
  getChatMessages,
  latestAgentChat,
  listAgentChats,
} from '../../src/db/chats.ts';
import { type Db, openDb } from '../../src/db/connection.ts';
import { MIGRATIONS, migrate } from '../../src/db/migrations.ts';
import { runsRepo } from '../../src/db/runs.ts';
import { tempDir } from '../helpers.ts';

const addProject = (db: DatabaseSync, id = 'kite') =>
  db
    .prepare(
      "INSERT INTO projects (id, name, status, orchestrator_id, tile, position, created_at, updated_at) VALUES (?, 'Kite', 'live', 'o', '{}', 0, '', '')",
    )
    .run(id);
const addRun = (db: Db, id: string, agentId = 'a-pete', task = 'Make hello.txt') =>
  runsRepo(db).insert({
    id,
    projectId: 'kite',
    agentId,
    teamId: null,
    task,
    runner: 'fake',
    model: null,
    caps: { maxTurns: 1, maxBudgetUsd: 1 },
  });
const say = (db: Db, runId: string, role: 'user' | 'assistant' | 'tool' | 'system', text: string, meta?: Record<string, unknown>) =>
  appendChatMessage(db, { runId, projectId: 'kite', agentId: 'a-pete', role, text, ...(meta ? { meta } : {}) });

describe('chat history (db)', () => {
  const tmp = tempDir();
  afterAll(() => tmp.cleanup());

  it('appends in seq order from 0 and summarises each run, newest first', () => {
    const db = openDb(':memory:');
    addProject(db);
    addRun(db, 'r1');
    expect(say(db, 'r1', 'user', 'Make hello.txt').seq).toBe(0);
    say(db, 'r1', 'tool', 'Writing hello.txt', { tool: 'Write', summary: 'Writing hello.txt' });
    expect(say(db, 'r1', 'assistant', 'Done.').seq).toBe(2);
    runsRepo(db).finish('r1', { status: 'succeeded', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, turns: 1 });
    addRun(db, 'r2', 'a-pete', 'Second task');

    const msgs = getChatMessages(db, 'r1');
    expect(msgs.map((m) => [m.seq, m.role, m.text])).toEqual([
      [0, 'user', 'Make hello.txt'],
      [1, 'tool', 'Writing hello.txt'],
      [2, 'assistant', 'Done.'],
    ]);
    expect(msgs[1]?.meta).toEqual({ tool: 'Write', summary: 'Writing hello.txt' });
    expect(msgs[0]?.meta).toBeNull();

    const chats = listAgentChats(db, 'a-pete');
    expect(chats.map((c) => c.runId)).toEqual(['r2', 'r1']);
    expect(chats[1]).toMatchObject({
      task: 'Make hello.txt',
      status: 'succeeded',
      messageCount: 3,
      lastText: 'Done.',
      projectId: 'kite',
    });
    expect(chats[1]?.endedAt).not.toBeNull();
    expect(latestAgentChat(db, 'a-pete')?.runId).toBe('r2');
    expect(listAgentChats(db, 'a-pete', { limit: 1 })).toHaveLength(1);
    expect(latestAgentChat(db, 'nobody')).toBeNull();
    expect(getChatMessages(db, 'ghost')).toEqual([]);
    db.close();
  });

  it('pages back with `before`', () => {
    const db = openDb(':memory:');
    addProject(db);
    addRun(db, 'old');
    db.prepare("UPDATE runs SET started_at = '2026-01-01T00:00:00.000Z' WHERE id = 'old'").run();
    addRun(db, 'new');
    expect(listAgentChats(db, 'a-pete', { before: '2026-06-01T00:00:00.000Z' }).map((c) => c.runId)).toEqual([
      'old',
    ]);
    db.close();
  });

  it('survives a restart: reopening the same file brings every chat back', () => {
    const path = join(tmp.dir, 'studio.db');
    const first = openDb(path);
    addProject(first);
    addRun(first, 'r1');
    say(first, 'r1', 'user', 'Make hello.txt');
    say(first, 'r1', 'assistant', 'Halfway there');
    first.close();

    const again = openDb(path);
    expect(runsRepo(again).failInterrupted()).toBe(1); // what boot does after a crash
    expect(getChatMessages(again, 'r1').map((m) => m.text)).toEqual(['Make hello.txt', 'Halfway there']);
    expect(listAgentChats(again, 'a-pete')).toEqual([
      expect.objectContaining({ runId: 'r1', status: 'failed', messageCount: 2, lastText: 'Halfway there' }),
    ]);
    again.close();
  });

  it('migrates a database from before chat history without losing its runs', () => {
    const db = new DatabaseSync(':memory:');
    const before = MIGRATIONS.length - 1;
    for (const sql of MIGRATIONS.slice(0, before)) db.exec(sql);
    db.exec(`PRAGMA user_version = ${before}`);
    addProject(db);
    addRun(db, 'legacy');
    runsRepo(db).finish('legacy', {
      status: 'succeeded',
      result: 'Old answer',
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      turns: 1,
    });
    migrate(db);
    expect(listAgentChats(db, 'a-pete')).toEqual([
      expect.objectContaining({ runId: 'legacy', messageCount: 0, lastText: 'Old answer' }),
    ]);
    expect(say(db, 'legacy', 'user', 'a follow-up').seq).toBe(0);
    db.close();
  });

  it('a run deleted with its project takes its chat along', () => {
    const db = openDb(':memory:');
    addProject(db);
    addRun(db, 'r1');
    say(db, 'r1', 'user', 'x');
    db.prepare("DELETE FROM projects WHERE id = 'kite'").run();
    expect(getChatMessages(db, 'r1')).toEqual([]);
    db.close();
  });
});
