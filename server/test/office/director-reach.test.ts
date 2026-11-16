/* The director reaches beyond the office chat: it reads and sends mail (`read_mail`, `send_mail`), pages the user
   (`page_user`), pages when a goal ends (`page_when_done`), and can propose a new Cast agent. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeBrain } from '../../src/crew/fake-brain.ts';
import { contractOf } from '../../src/crew/structured.ts';
import { getChatMessages } from '../../src/db/chats.ts';
import { workRepo } from '../../src/db/work.ts';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { testApp } from '../helpers.ts';

const isChat = (s: RunSpec) => s.task.startsWith('Studio summary right now: ');
type Call = { tool: string; args: Record<string, unknown> };

function studio() {
  const prompts: string[] = [];
  const turns: Call[][] = [];
  const h = testApp({
    seed: true,
    runner: fakeRunner((spec): FakeStep[] => {
      if (isChat(spec)) {
        prompts.push(spec.systemPrompt ?? '');
        return [...(turns.shift() ?? []), { result: '{"reply":"Done."}' }];
      }
      if (contractOf(spec.task)) return fakeBrain(spec);
      return [{ result: 'Built.' }];
    }),
  });
  mkdirSync(join(h.config.sandbox, 'lumi'), { recursive: true });
  h.store.projects.update('lumi', { folder: 'lumi' });
  const orch = h.store.projects.require('lumi').orchestratorId;
  const turn = async (call: Call) => {
    turns.push([call]);
    const r = await h.call('POST', `/projects/lumi/threads/${orch}/messages`, { text: 'go' });
    await h.runtime.settled(r.body.runId);
    return getChatMessages(h.db, r.body.runId).find((m) => m.role === 'assistant')?.text;
  };
  const pages = async () =>
    ((await h.call('GET', '/asks?status=open')).body as { question: string; news?: boolean }[])
      .filter((a) => a.news)
      .map((a) => a.question);
  return { h, prompts, turn, pages };
}

describe('the director reaches out from chat', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('reads the mail, sends mail, and can propose a new agent', async () => {
    const s = studio();
    h = s.h;
    h.db
      .prepare(
        "INSERT INTO mail (id, from_project, from_agent, to_project, kind, subject, body, at) VALUES ('m1', NULL, NULL, 'lumi', 'ticket', 'Login is slow', 'It takes 9 seconds.', ?)",
      )
      .run(new Date().toISOString());
    const read = await s.turn({ tool: 'read_mail', args: {} });
    expect(JSON.parse(read ?? '[]')[0]).toMatchObject({
      from: 'the user',
      subject: 'Login is slow',
      body: 'It takes 9 seconds.',
    });
    expect(await s.turn({ tool: 'send_mail', args: { to: 'HQ', subject: 'Hi', body: 'From Lumi.' } })).toBe(
      'Sent to HQ.',
    );
    for (const t of ['read_mail', 'send_mail', 'page_user', 'page_when_done', 'propose_agent'])
      expect(s.prompts[0]).toContain(`\`${t}\``);
  });

  it('pages the user now, and once when a watched goal ends', async () => {
    const s = studio();
    h = s.h;
    expect(await s.turn({ tool: 'page_user', args: { message: 'The demo is ready.' } })).toBe('Paged.');
    expect(await s.pages()).toEqual(['The demo is ready.']);

    expect(await s.turn({ tool: 'page_when_done', args: { message: 'Your login fix' } })).toBe(
      'Nothing is running to watch.',
    );
    workRepo(h.db).insertGoal({ id: 'g1', projectId: 'lumi', text: 'Fix login', summary: 'Login is fast.' }, []);
    expect(await s.turn({ tool: 'page_when_done', args: { message: 'Your login fix' } })).toBe(
      'I’ll page the user when “Login is fast.” ends.',
    );
    const ended = { type: 'goal.changed' as const, payload: { goalId: 'g1', status: 'done' as const } };
    h.events.append('project', 'lumi', ended);
    h.events.append('project', 'lumi', ended); // one-shot: a second end pages nothing
    expect(await s.pages()).toEqual(['The demo is ready.', 'Your login fix — “Login is fast.” is done.']);
  });
});
