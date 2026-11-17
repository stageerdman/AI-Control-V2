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
    const r = await put({ ...WAY, steps: [{ from: 'a-semic', to: 'a-pete', why: '' }] });
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

  it('reads null until saved; saves whole with scope team; null clears it', async () => {
    h = testApp({ seed: true });
    expect((await h.call('GET', url)).body).toEqual({ workflow: null });
    const r = await h.call('PUT', url, { workflow: { ...WAY, id: undefined, steps, scope: 'office' } });
    expect(r.status).toBe(200);
    expect(r.body.workflow).toMatchObject({ id: 'team', steps, scope: 'team', teamId: 'ship-it' });
    expect((await h.call('GET', url)).body).toEqual(r.body);
    expect((await h.call('PUT', url, { workflow: null })).body).toEqual({ workflow: null });
    expect((await h.call('GET', url)).body).toEqual({ workflow: null });
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
