/* Workflows drawn as graphs, over the API Jony's editor uses: an office workflow (in the project's list), a
   team's own workflow (in the Cast), and a running temporary goal's drawing. Sign-off arrows become the gates. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeBrain } from '../../src/crew/fake-brain.ts';
import { contractOf } from '../../src/crew/structured.ts';
import { type Goal, workRepo } from '../../src/db/work.ts';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { testApp } from '../helpers.ts';

const isChat = (s: RunSpec) => s.task.startsWith('Studio summary right now: ');
const isReview = (s: RunSpec) => s.task.startsWith('You are reviewing');
const chatUrl = '/projects/aurora/threads/a-pixel/messages';

const agent = (id: string, who: string, x = 0) => ({ id, type: 'agent', agent: who, x, y: -40 });
const arrow = (id: string, from: string, to: string, more: object = {}) => ({ id, from, to, why: 'next', ...more });
/** `maker` builds, `checker` signs it off. */
const signedBy = (maker: string, checker: string) => ({
  nodes: [agent('build', maker), agent('check', checker, 200)],
  start: 'build',
  end: 'check',
  edges: [arrow('e1', 'build', 'check', { signoff: 'quality', why: 'keep it clean' })],
});

/** Director turns play `turns`; the first task of a goal (`slow`) takes a while so the rest stay to do. */
function studio(turns: FakeStep[][], slow = '') {
  const h = testApp({
    seed: true,
    runner: fakeRunner((spec): FakeStep[] => {
      if (isChat(spec)) return [...(turns.shift() ?? []), { result: 'Done.' }];
      if (contractOf(spec.task)) return fakeBrain(spec);
      if (isReview(spec)) return [{ result: '{"verdict":"approve","notes":"Good."}' }];
      if (slow && spec.task.includes(slow)) return [{ wait: 3000 }, { result: 'Built.' }];
      return [{ result: 'Built.' }];
    }),
  });
  mkdirSync(join(h.config.sandbox, 'aurora'));
  h.store.projects.update('aurora', { folder: 'aurora' });
  return h;
}

describe('workflow graphs over the API', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  const say = async (text: string) => {
    const r = await h.call('POST', chatUrl, { text });
    await h.runtime.settled(r.body.runId);
  };
  const goal = (text: string) => workRepo(h.db).goals('aurora').find((g) => g.text === text) as Goal;
  const addGoal = (text: string, tasks: { text: string; owner: string }[], workflow?: object): FakeStep => ({
    tool: 'add_goal',
    args: { text, tasks, ...(workflow ? { workflow } : {}) },
  });

  it('office: a drawn workflow saves with gates from its arrows; every problem comes back by path', async () => {
    h = studio([]);
    const usual = { id: 'usual', name: 'Our usual way', summary: 's', graph: signedBy('a-pete', 'a-lint') };
    const ok = await h.call('PUT', '/projects/aurora/workflows', { workflows: [usual] });
    expect(ok.status).toBe(200);
    expect(ok.body.workflows[0].gates).toEqual([
      { after: 'a-pete', reviewer: 'a-lint', kind: 'quality', why: 'keep it clean' },
    ]);
    expect((await h.call('GET', '/projects/aurora/workflows')).body.workflows[0].graph).toEqual(usual.graph);

    const broken = { ...usual.graph, edges: [arrow('e1', 'build', 'ghost'), arrow('e2', 'check', 'build')] };
    broken.nodes = [agent('build', 'a-pete'), agent('check', 'a-nobody')];
    const bad = await h.call('PUT', '/projects/aurora/workflows', { workflows: [{ ...usual, graph: broken }] });
    expect(bad.status).toBe(422);
    expect(bad.body.error.details.map((x: { path: string }) => x.path)).toEqual([
      'workflows.0.graph.nodes.1.agent',
      'workflows.0.graph.nodes.1', // the only arrow in points at a ghost
      'workflows.0.graph.edges.0.to',
    ]);
  });

  it('team: GET/PUT/DELETE round trip; only members stand on it; its gates land on a member’s new task', async () => {
    h = studio([[addGoal('Build the bar', [{ text: 'Build the bar', owner: 'a-semic' }])]]);
    const url = '/teams/ship-it/workflow';
    expect((await h.call('GET', url)).body).toEqual({ workflow: null });

    const outsider = await h.call('PUT', url, { name: 'Tested', graph: signedBy('a-pete', 'a-lint') });
    expect(outsider.status).toBe(422);
    expect(outsider.body.error.details).toEqual([
      { path: 'graph.nodes.1.agent', message: "'a-lint' is not on this team" },
    ]);

    const saved = await h.call('PUT', url, { name: 'Tested', graph: signedBy('a-semic', 'a-scar') });
    expect(saved.status).toBe(200);
    expect(saved.body.workflow).toMatchObject({ name: 'Tested', summary: '', gates: [{ reviewer: 'a-scar' }] });
    expect((await h.call('GET', url)).body).toEqual(saved.body);

    await say('Build the bar');
    const reviewers = goal('Build the bar').items[0]?.gates.map((g) => g.reviewer);
    expect(reviewers).toContain('a-scar');

    expect((await h.call('DELETE', url)).body).toEqual({ workflow: null });
    expect((await h.call('GET', url)).body).toEqual({ workflow: null });
  });

  it('temporary: 409 on a goal nobody leads; on a led goal it regates the tasks not started yet', async () => {
    const tasks = [
      { text: 'Plan backups', owner: 'a-baron' },
      { text: 'Build backups', owner: 'a-pete' },
    ];
    h = studio(
      [[addGoal('Fix the typo', [{ text: 'Fix the typo', owner: 'a-semic' }]), addGoal('Ship backups', tasks, {
        lead: 'a-baron',
        crew: ['a-pete', 'a-query'],
      })]],
      'Plan backups',
    );
    await say('Fix the typo, and Baron leads backups');
    const draw = (g: Goal, graph: object) => h.call('PUT', `/projects/aurora/work/${g.id}/workflow/graph`, graph);

    expect((await draw(goal('Fix the typo'), signedBy('a-pete', 'a-query'))).status).toBe(409);

    const led = goal('Ship backups');
    expect(led.status).toBe('running');
    const outsider = await draw(led, signedBy('a-pete', 'a-lint'));
    expect(outsider.status).toBe(422);
    expect(outsider.body.error.details.map((x: { path: string }) => x.path)).toEqual(['nodes.1.agent']);

    const r = await draw(led, signedBy('a-pete', 'a-query'));
    expect(r.status).toBe(200);
    expect(r.body.workflow.graph).toEqual(signedBy('a-pete', 'a-query'));
    const reloaded = (await h.call('GET', `/projects/aurora/work/${led.id}`)).body;
    expect(reloaded.workflow.graph).toEqual(signedBy('a-pete', 'a-query'));
    const [plan, build] = goal('Ship backups').items;
    expect(plan?.status).not.toBe('todo');
    expect(build?.gates.map((g) => g.reviewer).sort()).toEqual(['a-baron', 'a-query']);
  });
});
