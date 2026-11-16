import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testApp } from '../helpers.ts';

const look = { hat: 'beret', tool: 'palette', body: 'lanky', antenna: 'curl', face: 'none', hue: 'coral' };

describe('invite another (copies API)', () => {
  let h: ReturnType<typeof testApp>;
  beforeEach(() => {
    h = testApp({ seed: true });
  });
  afterEach(() => h.close());

  it('a draft is a free family name and the family look (kit kept, colour and antenna new)', async () => {
    const pete = (await h.call('GET', '/agents/a-pete')).body;
    const names = new Set((await h.call('GET', '/agents')).body.map((a: { name: string }) => a.name));
    for (let i = 0; i < 10; i++) {
      const { status, body } = await h.call('GET', '/agents/a-pete/copy-draft');
      expect(status).toBe(200);
      expect(body.name.startsWith('P')).toBe(true);
      expect(names.has(body.name)).toBe(false);
      expect(body.look).toMatchObject({ hat: pete.look.hat, tool: pete.look.tool });
      expect(body.look.hue).not.toBe(pete.look.hue);
      expect(body.look.antenna).not.toBe(pete.look.antenna);
    }
  });

  it('copies with a chosen name and look: 201, same instructions, kin both ways', async () => {
    const pete = (await h.call('GET', '/agents/a-pete')).body;
    const { status, body } = await h.call('POST', '/agents/a-pete/copies', { name: 'Bea', look });
    expect(status).toBe(201);
    expect(body).toMatchObject({
      id: 'a-bea',
      name: 'Bea',
      look,
      prompt: pete.prompt,
      role: pete.role,
      kin: ['a-pete'],
    });
    expect(body.toolList).toEqual(pete.toolList);
    expect((await h.call('GET', '/agents/a-pete')).body.kin).toEqual(['a-bea']);
  });

  it('fills in what the user left out from a draft', async () => {
    const { status, body } = await h.call('POST', '/agents/a-pete/copies', {});
    expect(status).toBe(201);
    expect(body.name).toMatch(/^P/);
    expect(body.kinId).toBe('a-pete');
  });

  it('refuses a taken name (409 name_taken), crew (409) and bad input (422)', async () => {
    const taken = await h.call('POST', '/agents/a-pete/copies', { name: 'pixel pete' });
    expect(taken.status).toBe(409);
    expect(taken.body.error).toMatchObject({
      code: 'name_taken',
      message: "There's already a pixel pete in the Cast.",
    });
    expect((await h.call('POST', '/agents/a-pixel/copies', {})).status).toBe(409);
    expect((await h.call('GET', '/agents/a-setter/copy-draft')).status).toBe(409);
    expect((await h.call('POST', '/agents/a-pete/copies', { name: 'X', prompt: 'other brain' })).status).toBe(
      422,
    );
    expect((await h.call('POST', '/agents/a-ghost/copies', {})).status).toBe(404);
  });

  it('the office door: a copy joins the office its kin works in, and an instruction edit redraws both', async () => {
    h.store.projects.update('aurora', { folder: 'aurora' }); // Pete is staff on aurora
    const bea = (await h.call('POST', '/agents/a-pete/copies', { name: 'Bea', look })).body;
    const came = await h.call('POST', '/projects/aurora/guests', {
      agentId: bea.id,
      brief: 'Help out',
      start: false,
    });
    expect(came.status).toBe(201);
    expect(
      (await h.call('GET', '/projects/aurora/guests')).body.guests.map((g: { agentId: string }) => g.agentId),
    ).toEqual(['a-bea']);

    await h.call('PATCH', `/agents/${bea.id}`, { prompt: 'Shared brain v3' });
    const changed = h.events
      .after('project', 'aurora')
      .filter((e) => e.type === 'agent.changed')
      .map((e) => e.payload);
    expect(changed).toEqual([
      { agentId: 'a-bea', fields: ['prompt'] },
      { agentId: 'a-pete', fields: ['prompt'] },
    ]);
  });
});
