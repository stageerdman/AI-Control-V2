/* Workflows phase 2: goals run under a chosen stable workflow and keep their own copy of it; the director's
   workflow tools; the /workflows and /collaboration routes over the same list. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeBrain } from '../../src/crew/fake-brain.ts';
import { contractOf } from '../../src/crew/structured.ts';
import { getChatMessages } from '../../src/db/chats.ts';
import type { Workflow } from '../../src/domain/workflows.ts';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { testApp } from '../helpers.ts';
import { scriptedCrew } from './brain.ts';

/* Aurora: ship-it (captain a-semic) + polish (captain a-lint) */
const USUAL: Workflow = {
  id: 'usual',
  name: 'Our usual way',
  when: 'features',
  orchestratorTalksTo: 'captains',
  gates: [{ after: 'ship-it', reviewer: 'a-lint', kind: 'quality', why: 'Keep it clean.' }],
  maxSendBacks: 1,
  summary: 'Lint checks Ship-It.',
};
const QUICK: Workflow = { ...USUAL, id: 'quick-fix', name: 'Quick fix', when: 'small fixes', gates: [] };

const isChat = (s: RunSpec) => s.task.startsWith('Studio summary right now: ');
const isReview = (s: RunSpec) => s.task.startsWith('You are reviewing');
const chatUrl = '/projects/aurora/threads/a-pixel/messages';
type Gates = { reviewer: string }[];
type GoalBody = { id: string; text: string; workflow: { id: string } | null; items: { gates: Gates }[] };

/** Each director turn plays the next script, built when the turn runs (so it can name goals made before). */
function studio(scripts: (() => FakeStep[])[]) {
  const h = testApp({
    seed: true,
    runner: fakeRunner((spec): FakeStep[] => {
      if (isChat(spec)) return scripts.shift()?.() ?? [{ result: 'Hm.' }];
      if (contractOf(spec.task)) return fakeBrain(spec);
      if (isReview(spec)) return [{ result: '{"verdict":"approve","notes":"Good."}' }];
      return [{ result: 'Built.' }];
    }),
  });
  mkdirSync(join(h.config.sandbox, 'aurora'));
  h.store.projects.update('aurora', { folder: 'aurora', workflows: [USUAL, QUICK] });
  return h;
}
const addGoal = (text: string, workflow?: string): FakeStep => ({
  tool: 'add_goal',
  args: { text, tasks: [{ text, owner: 'a-semic' }], ...(workflow ? { workflow } : {}) },
});

describe('workflows: goals run under a chosen stable workflow', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  const say = async (text: string) => {
    const r = await h.call('POST', chatUrl, { text });
    expect(r.status).toBe(202);
    await h.runtime.settled(r.body.runId);
    return r.body.runId as string;
  };
  const goals = async () => (await h.call('GET', '/projects/aurora/work')).body as GoalBody[];
  const goal = async (text: string) => (await goals()).find((g) => g.text === text) as GoalBody;
  const toolSaid = (runId: string) =>
    getChatMessages(h.db, runId)
      .filter((m) => m.role === 'assistant')
      .map((m) => m.text);
  let goalId = '';
  const reviewers = (g: GoalBody) => g.items.map((i) => i.gates.map((x) => x.reviewer));

  it('a goal snapshots its workflow: its tasks get that workflow’s sign-offs, not the default’s', async () => {
    h = studio([() => [addGoal('Fix the typo', 'quick-fix'), addGoal('Build search'), { result: 'On it.' }]]);
    await say('Fix the typo, and build search');
    const quick = await goal('Fix the typo');
    expect(quick.workflow).toMatchObject({ id: 'quick-fix', name: 'Quick fix', temporary: false });
    expect(quick.workflow).toMatchObject({ scope: 'office', inWords: expect.stringMatching(/\S/) }); // v2 S1
    expect(reviewers(quick)).toEqual([[]]);
    const usual = await goal('Build search');
    expect(usual.workflow).toMatchObject({ id: 'usual' });
    expect(reviewers(usual)).toEqual([['a-lint']]);
  });

  it('changing the project’s workflows never changes a running goal: a new task uses the goal’s copy', async () => {
    h = studio([
      () => [addGoal('Build search'), { result: 'On it.' }],
      () => [
        {
          tool: 'set_workflow',
          args: { id: 'usual', name: 'Our usual way', when: 'features', gates: [], summary: 'No checks.' },
        },
        { result: 'Done.' },
      ],
      () => [
        { tool: 'add_task', args: { goal: goalId, text: 'Filters', owner: 'a-semic' } },
        { result: 'Added.' },
      ],
    ]);
    await say('Build search');
    goalId = (await goal('Build search')).id;
    await say('No more checks from now on');
    expect(h.store.projects.require('aurora').workflows?.[0]?.gates).toEqual([]);
    await say('Add filters to search');
    expect(reviewers(await goal('Build search'))).toEqual([['a-lint'], ['a-lint']]);
  });

  it('a goal from before workflows (no copy) runs under the project’s usual way', async () => {
    h = studio([
      () => [addGoal('Build search', 'quick-fix'), { result: 'On it.' }],
      () => [
        { tool: 'add_task', args: { goal: goalId, text: 'Filters', owner: 'a-semic' } },
        { result: 'Added.' },
      ],
    ]);
    await say('Build search');
    goalId = (await goal('Build search')).id;
    h.db.prepare('UPDATE goals SET workflow = NULL').run();
    await say('Add filters');
    const g = await goal('Build search');
    expect(g.workflow).toBeNull();
    expect(reviewers(g)).toEqual([[], ['a-lint']]);
  });

  it('an unknown workflow is refused in the turn, naming the known ones', async () => {
    h = studio([() => [addGoal('Build search', 'nope'), { result: 'I couldn’t.' }]]);
    const runId = await say('Build search the nope way');
    expect(toolSaid(runId)[0]).toMatch(
      /^add_goal refused: .*'nope' is not a workflow of this project — known: 'usual', 'quick-fix'/,
    );
    expect(await goals()).toEqual([]);
  });

  it('planning: the orchestrator picks a workflow by id; an unknown one is repaired', async () => {
    const plan = {
      summary: 'Fix it.',
      items: [{ text: 'Fix the typo', assignee: 'a-semic', teamId: 'ship-it', brief: 'b' }],
    };
    const crew = scriptedCrew(
      {
        dispatch: [
          { ...plan, workflow: 'nope' },
          { ...plan, workflow: 'quick-fix' },
        ],
      },
      () => [{ result: 'Fixed.' }],
    );
    h = testApp({ seed: true, runner: crew.runner });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora', workflows: [USUAL, QUICK] });
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Fix the typo' });
    expect(r.status).toBe(201);
    expect(r.body.workflow).toMatchObject({ id: 'quick-fix' });
    expect(r.body.items[0].gates).toEqual([]);
    const [first, repair] = crew.crewCalls();
    expect(first?.task).toContain('"quick-fix"');
    expect(repair?.task).toContain("'nope' is not a workflow of this project");
  });

  it('the drawing reaches the planner and the builder in words (live check: it reached nobody)', async () => {
    const plan = {
      summary: 'S.',
      items: [{ text: 'Build it', assignee: 'a-semic', teamId: 'ship-it', brief: 'b' }],
    };
    const crew = scriptedCrew({ dispatch: [{ ...plan, workflow: 'usual' }] }, () => [{ result: 'Built.' }]);
    h = testApp({ seed: true, runner: crew.runner });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    const drawn = {
      ...USUAL,
      gates: [],
      first: 'a-semic',
      steps: [{ from: 'a-semic', to: 'a-pete', why: 'API first.' }],
    };
    h.store.projects.update('aurora', { folder: 'aurora', workflows: [drawn] });
    await h.call('POST', '/projects/aurora/work', { goal: 'Build it' });
    const flow = 'Captain Semicolon starts. Captain Semicolon hands to Pixel Pete: API first.';
    expect(crew.crewCalls()[0]?.task).toContain(
      'Order items this way: Captain Semicolon (a-semic) starts. Captain Semicolon (a-semic) hands to Pixel Pete',
    );
    const built = () => crew.calls.find((s) => s.task.includes('Your checklist item: Build it'));
    for (let i = 0; i < 200 && !built(); i++) await new Promise((x) => setTimeout(x, 5));
    expect(built()?.task).toContain(`How work flows on this goal: ${flow}`);
  });
});

describe('workflows: the director’s tools', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  const turn = async (steps: FakeStep[]) => {
    const r = await h.call('POST', chatUrl, { text: 'Change how we work' });
    await h.runtime.settled(r.body.runId);
    return getChatMessages(h.db, r.body.runId)
      .filter((m) => m.role === 'assistant')
      .map((m) => m.text)
      .slice(0, steps.length - 1);
  };
  const ids = () => h.store.projects.require('aurora').workflows?.map((w) => w.id);

  it('set_workflow resolves names to ids, adds, changes, and `first` makes it the usual one', async () => {
    const steps: FakeStep[] = [
      {
        tool: 'set_workflow',
        args: {
          name: 'Careful build',
          when: 'risky work',
          gates: [{ after: 'The Ship-It Squad', reviewer: 'Sir Lint-a-lot', kind: 'quality', why: 'Risky.' }],
          summary: 'Lint checks.',
          first: true,
        },
      },
      { tool: 'workflows', args: {} },
      { result: 'Done.' },
    ];
    h = studio([() => steps]);
    const said = await turn(steps);
    expect(said[0]).toMatch(/^Added 'Careful build'/);
    expect(ids()).toEqual(['careful-build', 'usual', 'quick-fix']);
    expect(h.store.projects.require('aurora').workflows?.[0]?.gates[0]).toMatchObject({
      after: 'ship-it',
      reviewer: 'a-lint',
    });
    expect(said[0]).toMatch(/^Added 'Careful build'/);
    expect(said[1]).toMatch(/^\(usual\) Careful build \[id: careful-build\]/);
    expect(h.events.after('project', 'aurora').some((e) => e.type === 'workflows.changed')).toBe(true);
  });

  it('set_workflow changing a drawn workflow keeps the editor’s drawing (live check: it erased it)', async () => {
    const steps: FakeStep[] = [
      {
        tool: 'set_workflow',
        args: { id: 'usual', name: 'Our usual way', when: 'features', gates: [], summary: 'No checks.' },
      },
      { result: 'Done.' },
    ];
    h = studio([() => steps]);
    const drawing = {
      first: 'a-semic',
      steps: [{ from: 'a-semic', to: 'a-pete', why: 'API first.' }],
      layout: { 'a-semic': { x: 1, y: 2 } },
    };
    h.store.projects.update('aurora', { workflows: [{ ...USUAL, ...drawing }, QUICK] });
    const said = await turn(steps);
    expect(h.store.projects.require('aurora').workflows?.[0]).toMatchObject({ gates: [], ...drawing });
    expect(said[0]).toContain('Kept its drawing');
  });

  it('set_workflow whose checks no longer fit the drawing clears it and says why (never silently)', async () => {
    const steps: FakeStep[] = [
      {
        tool: 'set_workflow',
        args: { id: 'usual', name: 'Our usual way', when: 'features', gates: [], summary: 'No checks.' },
      },
      { result: 'Done.' },
    ];
    h = studio([() => steps]);
    /* Lint signs last, but the new checks drop Lint's sign-off: the drawing can't stand */
    const drawn = { ...USUAL, final: 'a-lint', layout: { 'a-lint': { x: 1, y: 2 } } };
    h.store.projects.update('aurora', { workflows: [drawn, QUICK] });
    const said = await turn(steps);
    const saved = h.store.projects.require('aurora').workflows?.[0];
    expect(saved).toMatchObject({ gates: [] });
    expect(saved?.final).toBeUndefined();
    expect(said[0]).toMatch(/drawing no longer fit these checks \(.*final.*\), so it was cleared/);
  });

  it('remove_workflow takes one off, refuses an unknown id and the last one', async () => {
    const steps: FakeStep[] = [
      { tool: 'remove_workflow', args: { id: 'quick-fix' } },
      { tool: 'remove_workflow', args: { id: 'ghost' } },
      { tool: 'remove_workflow', args: { id: 'usual' } },
      { result: 'Done.' },
    ];
    h = studio([() => steps]);
    const said = await turn(steps);
    expect(ids()).toEqual(['usual']);
    expect(said[0]).toMatch(/^Removed 'Quick fix'/);
    expect(said[1]).toMatch(/refused: No workflow 'ghost'/);
    expect(said[2]).toMatch(/refused: 'usual' is the only workflow/);
  });
});

describe('workflows: routes', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('GET/PUT /workflows read and replace the list (422 malformed, 409 someone not on the project)', async () => {
    h = testApp({ seed: true });
    expect((await h.call('GET', '/projects/aurora/workflows')).body).toEqual({
      workflows: [expect.objectContaining({ id: 'usual', gates: [] })],
      designed: false,
    });
    expect((await h.call('PUT', '/projects/aurora/workflows', { workflows: 'x' })).status).toBe(422);
    const ghost = { ...USUAL, gates: [{ ...USUAL.gates[0], reviewer: 'a-ghost' }] };
    expect((await h.call('PUT', '/projects/aurora/workflows', { workflows: [ghost] })).status).toBe(409);
    const ok = await h.call('PUT', '/projects/aurora/workflows', { workflows: [QUICK, USUAL] });
    /* the way in words: its sign-offs said; nothing at all to say → its summary */
    const office = (w: Workflow, inWords: string) => ({ ...w, scope: 'office', inWords });
    expect(ok.body).toEqual({
      workflows: [office(QUICK, QUICK.summary), office(USUAL, 'Lint checks The Ship-It Squad.')],
      designed: true,
    });
    // B8's design is the first workflow
    expect((await h.call('GET', '/projects/aurora/collaboration')).body.collaboration.gates).toEqual([]);
    await h.call('PUT', '/projects/aurora/collaboration', {
      ...QUICK,
      id: undefined,
      name: undefined,
      when: undefined,
      gates: USUAL.gates,
    });
    const after = (await h.call('GET', '/projects/aurora/workflows')).body.workflows as Workflow[];
    expect(after.map((w) => [w.id, w.gates.length])).toEqual([
      ['quick-fix', 1],
      ['usual', 1],
    ]);
  });

  it('design returns a validated list (the fake orchestrator adds a quick-fix way)', async () => {
    h = testApp({ seed: true });
    const r = await h.call('POST', '/projects/aurora/collaboration/design', {});
    expect(r.status).toBe(200);
    expect(r.body.workflows[0]).toMatchObject({ id: 'usual' });
    expect(r.body.collaboration).toMatchObject({ orchestratorTalksTo: expect.any(String) });
    expect(h.store.projects.require('aurora').workflows).toEqual(r.body.workflows);
  });
});
