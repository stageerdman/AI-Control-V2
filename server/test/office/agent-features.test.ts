/* Agents keep features up to date: the director's `add_goal` names the feature a goal builds (Planned → Now, the
   link shows on the whiteboard and in the brief); the agent at work reads and updates it with its `feature` tool;
   when the goal finishes the feature ships by itself, unless the agent already set it. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { contractOf } from '../../src/crew/structured.ts';
import { getChatMessages } from '../../src/db/chats.ts';
import type { Feature } from '../../src/db/features.ts';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { testApp } from '../helpers.ts';

const isChat = (s: RunSpec) => s.task.startsWith('Studio summary right now: ');
const isBuild = (s: RunSpec) => s.task.includes('Your checklist item:');
type Goal = { id: string; status: string; featureId: string | null; ships: boolean };

/** Aurora, a Planned "Dark mode" feature, a director that adds one goal for it, and a builder playing `build`. */
async function studio(build: FakeStep[], ships?: boolean) {
  const briefs: string[] = [];
  const toolSaid: string[] = [];
  const h = testApp({
    seed: true,
    runner: fakeRunner((spec): FakeStep[] => {
      if (isChat(spec)) return director.shift() ?? [{ result: 'Hm.' }];
      if (contractOf(spec.task)) return [{ result: '{"verdict":"approve","notes":""}' }];
      if (isBuild(spec)) briefs.push(spec.task);
      return isBuild(spec) ? build : [{ result: 'Looks good.' }];
    }),
  });
  mkdirSync(join(h.config.sandbox, 'aurora'));
  h.store.projects.update('aurora', { folder: 'aurora' });
  const f = (await h.call('POST', '/projects/aurora/features', { name: 'Dark mode' })).body as Feature;
  const director: FakeStep[][] = [
    [
      {
        tool: 'add_goal',
        args: {
          text: 'Add a dark mode toggle',
          tasks: [{ text: 'Dark mode toggle', owner: 'a-semic' }],
          feature: f.id,
          ...(ships === undefined ? {} : { ships }),
        },
      },
      { result: 'On it.' },
    ],
  ];
  const r = await h.call('POST', '/projects/aurora/threads/a-pixel/messages', { text: 'Build dark mode' });
  await h.runtime.settled(r.body.runId);
  toolSaid.push(
    ...getChatMessages(h.db, r.body.runId)
      .filter((m) => m.role === 'assistant')
      .map((m) => m.text),
  );
  const goal = async (): Promise<Goal> =>
    ((await h.call('GET', '/projects/aurora/work')).body as Goal[])[0] as Goal;
  const finished = async () => {
    for (let i = 0; i < 300 && (await goal()).status === 'running'; i++)
      await new Promise((ok) => setTimeout(ok, 10));
    return goal();
  };
  const feature = async () => (await h.call('GET', `/projects/aurora/features/${f.id}`)).body as Feature;
  return { h, f, briefs, toolSaid, goal, finished, feature };
}

describe('agents keep features up to date', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('add_goal links the feature; the agent sets pct and a line; the finished goal ships it', async () => {
    const s = await studio([
      { tool: 'feature', args: {} },
      { tool: 'feature', args: { pct: 60, line: 'Toggle in Settings.' } },
      { result: 'Built.' },
    ]);
    h = s.h;
    expect(s.toolSaid[0]).toContain('It serves the feature “Dark mode”.');
    expect(s.toolSaid[0]).toContain(`Feature: ${s.f.id} (ships when this goal is done)`);
    const g = await s.goal();
    expect(g).toMatchObject({ featureId: s.f.id, ships: true });
    expect((await s.finished()).status).toBe('done');
    expect(s.briefs[0]).toContain(`This goal serves the feature “Dark mode” (${s.f.id};`);
    expect(s.briefs[0]).toContain('`feature` tool');
    const f = await s.feature();
    expect(f).toMatchObject({ status: 'shipped', pct: 100, description: 'Toggle in Settings.' });
  });

  it('the agent can ship it itself (pct 100 with it), even when the goal alone would not', async () => {
    const s = await studio([{ tool: 'feature', args: { status: 'shipped' } }, { result: 'Built.' }], false);
    h = s.h;
    expect((await s.finished()).status).toBe('done');
    expect(await s.feature()).toMatchObject({ status: 'shipped', pct: 100 });
  });

  it('one step of a feature (ships: false) leaves it in Now', async () => {
    const s = await studio([{ tool: 'feature', args: { pct: 40 } }, { result: 'Built.' }], false);
    h = s.h;
    expect((await s.finished()).status).toBe('done');
    expect(await s.feature()).toMatchObject({ status: 'now', pct: 40 });
  });

  it('add_goal with an unknown feature is refused, and nothing is added', async () => {
    h = testApp({
      seed: true,
      runner: fakeRunner((): FakeStep[] => [
        {
          tool: 'add_goal',
          args: { text: 'X', tasks: [{ text: 'X', owner: 'a-semic' }], feature: 'f-nope' },
        },
        { result: 'No.' },
      ]),
    });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    const r = await h.call('POST', '/projects/aurora/threads/a-pixel/messages', { text: 'Build X' });
    await h.runtime.settled(r.body.runId);
    const said = getChatMessages(h.db, r.body.runId).filter((m) => m.role === 'assistant');
    expect(said[0]?.text).toBe("add_goal refused: No feature 'f-nope' — look with features first.");
    expect((await h.call('GET', '/projects/aurora/work')).body).toEqual([]);
  });
});
