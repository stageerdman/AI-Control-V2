/* The workflow editor's routes (Phase 5b): the drawn fields on /projects/:id/workflows, and a team's own
   workflow on /teams/:id/workflow. Aurora: ship-it (a-semic, a-pete, a-scar) + polish (a-lint, …). */
import { afterEach, describe, expect, it } from 'vitest';
import { testApp } from '../helpers.ts';

const WAY = {
  id: 'usual',
  name: 'Our usual way',
  summary: 'Scar checks Pete.',
  gates: [{ after: 'a-pete', reviewer: 'a-scar', kind: 'quality', why: 'Test it.', when: 'if it ships' }],
};
const steps = [{ from: 'a-semic', to: 'a-pete', why: 'API first.' }];

describe('project workflows: the drawn fields', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());
  const put = (w: object) => h.call('PUT', '/projects/aurora/workflows', { workflows: [w] });

  it('saves first/final/steps/layout, drops stray positions, ignores scope on PUT', async () => {
    h = testApp({ seed: true });
    const layout = { 'a-pete': { x: 10, y: 20 }, 'a-ghost': { x: 0, y: 0 } };
    const r = await put({
      ...WAY,
      first: 'a-semic',
      final: 'a-scar',
      steps,
      layout,
      scope: 'team',
      teamId: 'x',
    });
    expect(r.status).toBe(200);
    expect(r.body.workflows[0]).toMatchObject({ first: 'a-semic', final: 'a-scar', steps, scope: 'office' });
    expect(r.body.workflows[0].layout).toEqual({ 'a-pete': { x: 10, y: 20 } });
    expect(r.body.workflows[0].teamId).toBeUndefined();
    expect((await h.call('GET', '/projects/aurora/workflows')).body.workflows[0].scope).toBe('office');
  });

  it('a rule problem is a 409 whose details carry the path', async () => {
    h = testApp({ seed: true });
    const r = await put({ ...WAY, steps: [{ from: 'a-pete', to: 'a-pete', why: 'Loop.' }] });
    expect(r.status).toBe(409);
    expect(r.body.error.details).toEqual([
      { path: 'workflows.0.steps.0.to', message: "Pixel Pete can't hand work to themselves" },
    ]);
  });

  it('a shape problem is a 422 whose path starts at the body', async () => {
    h = testApp({ seed: true });
    const r = await put({ ...WAY, steps: [{ from: 'a-semic', to: 'a-pete', why: 'x'.repeat(301) }] });
    expect(r.status).toBe(422);
    expect(r.body.error.details[0].path).toBe('workflows.0.steps.0.why');
  });

  it('where a node sits never blocks a save: an odd position is clamped', async () => {
    h = testApp({ seed: true });
    const r = await put({ ...WAY, layout: { 'a-pete': { x: 2000, y: 10.6 } } });
    expect(r.status).toBe(200);
    expect(r.body.workflows[0].layout).toEqual({ 'a-pete': { x: 1000, y: 11 } });
  });

  it('the director on a drawing is a 409 pinned to that arrow end', async () => {
    h = testApp({ seed: true });
    const r = await put({ ...WAY, steps: [{ from: 'a-pixel', to: 'a-pete', why: 'Brief.' }] });
    expect(r.status).toBe(409);
    expect(r.body.error.details.map((d: { path: string }) => d.path)).toEqual(['workflows.0.steps.0.from']);
  });

  it('keeps steps and gates in the order sent (the editor pins problems by index)', async () => {
    h = testApp({ seed: true });
    const gates = [
      { after: 'a-semic', reviewer: 'a-scar', kind: 'review', why: 'Look.' },
      { after: 'a-pete', reviewer: 'a-lint', kind: 'quality', why: 'Lint.' },
    ];
    const order = [steps[0], { from: 'a-pete', to: 'a-scar', why: 'Then test.' }].reverse();
    const r = await put({ ...WAY, gates, steps: order, final: 'a-scar' });
    expect(r.status).toBe(200);
    expect(r.body.workflows[0]).toMatchObject({ gates, steps: order });
  });
});

describe('a team’s own workflow', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());
  const url = '/teams/ship-it/workflow';

  it('reads the default until saved; saves whole with scope team; null returns to the default', async () => {
    h = testApp({ seed: true });
    const before = (await h.call('GET', url)).body;
    expect(before).toMatchObject({ own: false, shape: 'captain' });
    expect(before.workflow).toMatchObject({ name: 'Captain checks all', scope: 'team', gates: [] });
    const r = await h.call('PUT', url, {
      workflow: { ...WAY, id: undefined, steps, scope: 'office', inWords: 'ignored' },
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ own: true, shape: 'captain' });
    expect(r.body.workflow).toMatchObject({ id: 'team', steps, scope: 'team', teamId: 'ship-it' });
    expect(r.body.workflow.inWords).toMatch(/^Captain hands to Pete: API first\./);
    expect((await h.call('GET', url)).body).toEqual(r.body);
    expect((await h.call('PUT', url, { workflow: null })).body).toEqual(before);
    expect((await h.call('GET', url)).body).toEqual(before);
  });

  it('is checked against the team’s members only (409, with the path)', async () => {
    h = testApp({ seed: true });
    const lint = { ...WAY, gates: [{ ...WAY.gates[0], reviewer: 'a-lint' }] };
    const r = await h.call('PUT', url, { workflow: lint });
    expect(r.status).toBe(409);
    expect(r.body.error.details[0].path).toBe('workflow.gates.0.reviewer');
    expect(r.body.error.details[0].message).toMatch(/is not on this team/);
    const led = await h.call('PUT', url, { workflow: { ...WAY, lead: 'a-semic', crew: ['a-pete'] } });
    expect(led.status).toBe(409);
  });

  it('the workflow key must be sent (a forgotten field never clears it)', async () => {
    h = testApp({ seed: true });
    expect((await h.call('PUT', url, {})).status).toBe(422);
    expect((await h.call('PUT', url, { workflow: { name: '' } })).body.error.details[0].path).toMatch(
      /^workflow\./,
    );
  });

  it('every office the team works in hears team.workflow.changed', async () => {
    h = testApp({ seed: true });
    await h.call('PUT', url, { workflow: WAY });
    await h.call('PUT', url, { workflow: null });
    const said = h.events
      .after('project', 'aurora')
      .filter((e) => e.type === 'team.workflow.changed')
      .map((e) => e.payload);
    expect(said).toEqual([
      { teamId: 'ship-it', name: 'Our usual way' },
      { teamId: 'ship-it', name: null },
    ]);
  });
});

describe('a team’s shown way follows the team (v2 S2, S4)', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());
  const url = '/teams/ship-it/workflow';
  const said = () =>
    h.events
      .after('project', 'aurora')
      .filter((e) => e.type === 'team.workflow.changed')
      .map((e) => e.payload);
  const arrows = (w: { steps?: { from: string; to: string }[] }) =>
    (w.steps ?? []).map((s) => `${s.from}>${s.to}`);

  it('a wayShape patch redraws the default and is announced', async () => {
    h = testApp({ seed: true });
    expect((await h.call('PATCH', '/teams/ship-it', { wayShape: 'chain' })).body.wayShape).toBe('chain');
    const got = (await h.call('GET', url)).body;
    expect(got).toMatchObject({ own: false, shape: 'chain', workflow: { name: 'Pass it along' } });
    expect(arrows(got.workflow)).toEqual(['a-semic>a-pete', 'a-pete>a-scar', 'a-scar>a-semic']);
    expect(said()).toEqual([{ teamId: 'ship-it', name: 'Pass it along' }]);
  });

  it('adding a member or changing the captain redraws the default and is announced', async () => {
    h = testApp({ seed: true });
    await h.call('POST', '/teams/ship-it/members', { agentId: 'a-lint' });
    expect(arrows((await h.call('GET', url)).body.workflow)).toContain('a-semic>a-lint');
    await h.call('PATCH', '/teams/ship-it', { captainId: 'a-pete' });
    expect((await h.call('GET', url)).body.workflow.first).toBe('a-pete');
    expect(said()).toHaveLength(2);
  });

  it('an unrelated patch says nothing', async () => {
    h = testApp({ seed: true });
    await h.call('PATCH', '/teams/ship-it', { blurb: 'We ship.' });
    expect(said()).toEqual([]);
  });

  it('removing a member prunes the own way (never refused) and is announced', async () => {
    h = testApp({ seed: true });
    const way = {
      name: 'Ours',
      summary: 'Pete builds, Scar checks.',
      gates: [{ after: 'a-pete', reviewer: 'a-scar', kind: 'quality', why: 'Test it.' }],
      steps: [
        { from: 'a-semic', to: 'a-pete', why: 'Build.' },
        { from: 'a-pete', to: 'a-scar', why: 'Check.' },
      ],
      first: 'a-semic',
      final: 'a-scar',
      layout: { 'a-semic': { x: 1, y: 1 }, 'a-scar': { x: 2, y: 2 } },
    };
    expect((await h.call('PUT', url, { workflow: way })).status).toBe(200);
    expect((await h.call('DELETE', '/teams/ship-it/members/a-scar')).status).toBe(200);
    const got = (await h.call('GET', url)).body;
    expect(got.own).toBe(true);
    expect(got.workflow).toMatchObject({ gates: [], first: 'a-semic', final: 'a-semic' });
    expect(arrows(got.workflow)).toEqual(['a-semic>a-pete']);
    expect(Object.keys(got.workflow.layout)).toEqual(['a-semic']);
    expect(said().at(-1)).toEqual({ teamId: 'ship-it', name: 'Ours' });

    expect((await h.call('DELETE', '/teams/ship-it/members/a-pete')).status).toBe(200);
    expect((await h.call('GET', url)).body.own).toBe(false); // nothing left: back on the default
  });
});

describe('an empty why saves with a plain default (v2 S5)', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());
  const way = {
    id: 'usual',
    name: 'Usual',
    summary: 'Pete builds, Scar checks.',
    gates: [{ after: 'a-pete', reviewer: 'a-scar', kind: 'security', why: '' }],
    steps: [{ from: 'a-semic', to: 'a-pete' }],
  };
  const whys = (w: { gates: { why: string }[]; steps: { why: string }[] }) => [
    w.gates[0]?.why,
    w.steps[0]?.why,
  ];

  it('on an office way', async () => {
    h = testApp({ seed: true });
    const r = await h.call('PUT', '/projects/aurora/workflows', { workflows: [way] });
    expect(r.status).toBe(200);
    expect(whys(r.body.workflows[0])).toEqual(['Checks it’s safe', 'Hands the work on']);
  });

  it('on a team way', async () => {
    h = testApp({ seed: true });
    const r = await h.call('PUT', '/teams/ship-it/workflow', { workflow: way });
    expect(r.status).toBe(200);
    expect(whys(r.body.workflow)).toEqual(['Checks it’s safe', 'Hands the work on']);
  });
});
