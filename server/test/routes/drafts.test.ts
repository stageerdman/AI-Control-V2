import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testApp } from '../helpers.ts';

describe('setup drafts API', () => {
  let h: ReturnType<typeof testApp>;
  beforeEach(() => {
    h = testApp({ seed: true });
  });
  afterEach(() => h.close());

  it('creates a draft that defaults to the first orchestrator at step 1', async () => {
    const { status, body } = await h.call('POST', '/drafts', {
      mode: 'adopt',
      name: 'Old Blog',
      folder: 'old-blog',
    });
    expect(status).toBe(201);
    expect(body).toMatchObject({
      mode: 'adopt',
      step: 1,
      name: 'Old Blog',
      folder: 'old-blog',
      orchestratorId: 'a-pixel',
      plan: null,
      chat: [],
    });
    expect(body.id).toMatch(/^d-[0-9a-f]{8}$/);
    expect((await h.call('GET', '/drafts')).body).toHaveLength(1);
  });

  it('saves progress as you go: step, orchestrator, plan, chat', async () => {
    const d = (await h.call('POST', '/drafts', { mode: 'new' })).body;
    const plan = {
      teams: [{ teamId: 'ship-it', why: 'builds it' }],
      specialists: [{ agentId: 'a-prof', why: 'research first' }],
      newAgents: [],
      newTeams: [],
      summary: 'small web app',
    };
    const chat = [
      { from: 'user', text: 'Why these?' },
      { from: 'orchestrator', text: 'Ship-It builds, Professor researches.' },
    ];
    const p = await h.call('PATCH', `/drafts/${d.id}`, { step: 3, orchestratorId: 'a-maestro', plan, chat });
    expect(p.body).toMatchObject({ step: 3, orchestratorId: 'a-maestro', plan, chat });
    expect((await h.call('GET', `/drafts/${d.id}`)).body.plan).toEqual(plan);
    expect((await h.call('PATCH', `/drafts/${d.id}`, { plan: null })).body.plan).toBeNull();
  });

  it('validates mode, orchestrator kind, chat shape, folder and immutable mode', async () => {
    expect((await h.call('POST', '/drafts', { mode: 'clone' })).status).toBe(422);
    expect((await h.call('POST', '/drafts', { mode: 'new', orchestratorId: 'a-pete' })).status).toBe(409);
    expect((await h.call('POST', '/drafts', { mode: 'new', folder: '../x' })).status).toBe(422);
    const d = (await h.call('POST', '/drafts', { mode: 'new' })).body;
    expect((await h.call('PATCH', `/drafts/${d.id}`, { chat: [{ from: 'robot', text: 'hi' }] })).status).toBe(
      422,
    );
    expect((await h.call('PATCH', `/drafts/${d.id}`, { mode: 'adopt' })).status).toBe(422);
    expect((await h.call('PATCH', '/drafts/d-nope', { step: 2 })).status).toBe(404);
  });

  it('delete returns a token; restore brings the draft back intact', async () => {
    const d = (await h.call('POST', '/drafts', { mode: 'new', name: 'Kite' })).body;
    await h.call('PATCH', `/drafts/${d.id}`, { step: 4, chat: [{ from: 'user', text: 'keep me' }] });
    const del = await h.call('DELETE', `/drafts/${d.id}`);
    expect(del.body.deleted).toEqual({ kind: 'draft', id: d.id });
    expect((await h.call('GET', `/drafts/${d.id}`)).status).toBe(404);
    await h.call('POST', `/trash/${del.body.restoreToken}/restore`);
    expect((await h.call('GET', `/drafts/${d.id}`)).body).toMatchObject({
      name: 'Kite',
      step: 4,
      chat: [{ from: 'user', text: 'keep me' }],
    });
  });
});
