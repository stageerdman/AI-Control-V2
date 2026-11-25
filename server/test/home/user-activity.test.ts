/* HOME "Today": lastUserAt moves only when the user gave work (a message, a goal, a task, an answer, a chat
   follow-up) — never on a visit, a read, or anything an agent did. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { contractOf } from '../../src/crew/structured.ts';
import { MIGRATIONS, migrate } from '../../src/db/migrations.ts';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import { scriptedCrew } from '../crew/brain.ts';
import { testApp } from '../helpers.ts';

type H = ReturnType<typeof testApp>;
type AskView = { id: string };

const last = (h: H, id = 'aurora') => h.store.projects.require(id).lastUserAt;
const forget = (h: H) => h.db.prepare('UPDATE projects SET last_user_at = NULL').run();
const withFolder = (h: H) => {
  mkdirSync(join(h.config.sandbox, 'aurora'));
  const { agentIds } = h.store.projects.require('aurora');
  h.store.projects.update('aurora', { folder: 'aurora', agentIds: [...new Set([...agentIds, 'a-prof'])] });
  forget(h);
  return h;
};
const asking: FakeStep[] = [
  { ask: 'Reload the app — did the fix work?', options: ['Yes', 'No'] }, // not a permission check: never auto-answered
  { result: 'ok' },
];
const tick = () => new Promise((r) => setTimeout(r, 5));
async function openAsk(h: H): Promise<AskView> {
  for (let i = 0; i < 200; i++) {
    const [a] = (await h.call('GET', '/projects/aurora/asks?status=open')).body as AskView[];
    if (a) return a;
    await tick();
  }
  throw new Error('no open ask');
}

describe('lastUserAt: the user gave work here', () => {
  let h: H;
  afterEach(() => h.close());

  it('opening the office, reading and "seen" marks never count', async () => {
    h = withFolder(testApp({ seed: true, runner: fakeRunner(() => [{ result: 'ok' }]) }));
    for (const url of [
      '/projects',
      '/projects/aurora',
      '/projects/aurora/threads/a-pixel/messages',
      '/projects/aurora/asks',
      '/projects/aurora/work',
    ])
      expect((await h.call('GET', url)).status).toBe(200);
    expect((await h.call('POST', '/asks/seen', { projectId: 'aurora' })).status).toBe(200);
    expect((await h.call('POST', '/projects/aurora/access/seen')).status).toBe(200);
    expect(last(h)).toBeNull();
  });

  it('the stamp is not an edit: updatedAt stays', () => {
    h = testApp({ seed: true });
    const edited = h.store.projects.require('aurora').updatedAt;
    h.store.projects.markUserActive('aurora', '2099-01-01T00:00:00.000Z');
    expect(h.store.projects.require('aurora')).toMatchObject({
      updatedAt: edited,
      lastUserAt: '2099-01-01T00:00:00.000Z',
    });
  });

  it('a message to an agent stamps that project only; the agent’s reply does not', async () => {
    h = withFolder(testApp({ seed: true, runner: fakeRunner(() => [{ result: 'ok' }]) }));
    const r = await h.call('POST', '/projects/aurora/threads/a-prof/messages', { text: 'Add search' });
    expect(r.status).toBe(202);
    const stamp = last(h);
    expect(stamp).not.toBeNull();
    await h.runtime.settled(r.body.runId);
    expect(last(h)).toBe(stamp); // the agent's reply is not the user's
    expect(last(h, 'atlas')).toBeNull();
  });

  it('a refused action does not count', async () => {
    h = withFolder(testApp({ seed: true, runner: fakeRunner(() => [{ result: 'ok' }]) }));
    expect((await h.call('POST', '/projects/aurora/threads/a-ghost/messages', { text: 'x' })).status).toBe(
      422,
    );
    expect((await h.call('POST', '/projects/aurora/work', {})).status).toBe(422);
    expect(last(h)).toBeNull();
  });

  it('a goal the user gives counts', async () => {
    const crew = scriptedCrew({
      dispatch: [{ summary: 'Do it.', items: [{ text: 'Build it', assignee: 'a-baron', brief: 'b' }] }],
    });
    h = withFolder(testApp({ seed: true, runner: crew.runner }));
    expect((await h.call('POST', '/projects/aurora/work', { goal: 'Ship search' })).status).toBe(201);
    expect(last(h)).not.toBeNull();
  });

  it('an agent-started run and its questions do not count; the user starting a task or answering does', async () => {
    h = withFolder(testApp({ seed: true, runner: fakeRunner(() => asking) }));
    const agentRun = h.runtime.start('aurora', { agentId: 'a-baron', task: 'Check it' });
    h.runtime.answer('aurora', (await openAsk(h)).id, 'Yes'); // an agent answering for the user
    await h.runtime.settled(agentRun.id);
    expect(last(h)).toBeNull();

    const r = await h.call('POST', '/projects/aurora/runs', { agentId: 'a-prof', task: 'Fix it' });
    expect(r.status).toBe(201);
    expect(last(h)).not.toBeNull();
    const ask = await openAsk(h);
    forget(h);
    expect((await h.call('POST', `/projects/aurora/asks/${ask.id}/answer`, { answer: 'Yes' })).status).toBe(
      200,
    );
    expect(last(h)).not.toBeNull();
    await h.runtime.settled(r.body.id);
  });

  it('a follow-up in a past chat counts for the chat’s project', async () => {
    const runner = fakeRunner((spec) =>
      contractOf(spec.task)?.name === 'agent-chat-reply'
        ? [{ result: '{"reply":"Sure."}' }]
        : [{ result: 'ok' }],
    );
    h = withFolder(testApp({ seed: true, runner }));
    const run = h.runtime.start('aurora', { agentId: 'a-baron', task: 'Make it' });
    await h.runtime.settled(run.id);
    expect(last(h)).toBeNull();
    expect((await h.call('POST', `/projects/aurora/chats/${run.id}/messages`, { text: 'Why?' })).status).toBe(
      200,
    );
    expect(last(h)).not.toBeNull();
  });
});

describe('migration 56 backfills lastUserAt from the user’s words on record', () => {
  it('takes the newest user message, user answer or chat follow-up; agents’ rows are ignored', () => {
    const db = new DatabaseSync(':memory:');
    const until = 55; // migration 56 is MIGRATIONS[55]
    for (let v = 0; v < until; v++) db.exec(MIGRATIONS[v] as string);
    db.exec(`PRAGMA user_version = ${until}`);
    const t = '2026-01-01T00:00:00.000Z';
    db.exec(`
      INSERT INTO agents (id, kind, name, look, position, created_at, updated_at) VALUES ('o', 'orchestrator', 'O', '{}', 0, '${t}', '${t}');
      INSERT INTO projects (id, name, status, orchestrator_id, tile, position, created_at, updated_at)
        VALUES ('a', 'A', 'idle', 'o', '{}', 0, '${t}', '${t}'), ('b', 'B', 'idle', 'o', '{}', 1, '${t}', '${t}'),
               ('c', 'C', 'idle', 'o', '{}', 2, '${t}', '${t}');
      INSERT INTO runs (id, project_id, agent_id, task, status, runner, caps, started_at)
        VALUES ('r', 'a', 'o', 't', 'succeeded', 'fake', '{}', '${t}');
      INSERT INTO thread_messages (id, project_id, agent_id, sender, kind, text, created_at) VALUES
        ('m1', 'a', 'o', 'user', 'text', 'hi', '2026-03-01T00:00:00.000Z'),
        ('m2', 'a', 'o', 'agent', 'text', 'yo', '2026-09-01T00:00:00.000Z'),
        ('m3', 'c', 'o', 'agent', 'text', 'yo', '2026-09-01T00:00:00.000Z');
      INSERT INTO asks (id, run_id, project_id, agent_id, question, status, answered_at, answered_by, created_at) VALUES
        ('k1', 'r', 'a', 'o', 'q', 'answered', '2026-05-01T00:00:00.000Z', 'user', '${t}'),
        ('k2', 'r', 'a', 'o', 'q', 'answered', '2026-10-01T00:00:00.000Z', 'auto', '${t}'),
        ('k3', 'r', 'b', 'o', 'q', 'answered', '2026-02-01T00:00:00.000Z', NULL, '${t}');
      INSERT INTO chat_messages (id, run_id, project_id, agent_id, seq, role, text, meta, created_at) VALUES
        ('c1', 'r', 'a', 'o', 0, 'user', 'brief', NULL, '2026-11-01T00:00:00.000Z'),
        ('c2', 'r', 'b', 'o', 1, 'user', 'why?', '{"followUp":true}', '2026-04-01T00:00:00.000Z'),
        ('c3', 'r', 'b', 'o', 2, 'user', 'bad', 'not json', '2026-12-01T00:00:00.000Z');
    `);
    migrate(db);
    const at = (id: string) =>
      (db.prepare('SELECT last_user_at AS v FROM projects WHERE id = ?').get(id) as { v: string | null }).v;
    expect(at('a')).toBe('2026-05-01T00:00:00.000Z');
    expect(at('b')).toBe('2026-04-01T00:00:00.000Z');
    expect(at('c')).toBeNull();
    db.close();
  });
});
