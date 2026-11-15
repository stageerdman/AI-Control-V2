/* STUDIO LIFE: design an agent with Tinker — a saved chat, a live draft kept whole each turn, hand edits between
   turns, web research shown as activity, accept adds the agent to the Cast. */
import { afterEach, describe, expect, it } from 'vitest';
import { testApp } from '../helpers.ts';
import { scriptedCrew } from './brain.ts';

const LOOK = { hat: 'goggles', tool: 'cog', body: 'lanky', antenna: 'bob', face: 'freckles', hue: 'mint' };
const DRAFT = {
  name: 'Swift Sally',
  role: 'iOS',
  summary: 'An iOS builder who ships small.',
  prompt: 'You are Swift Sally, the iOS specialist. Build small SwiftUI screens, test them, keep it simple.',
  look: LOOK,
};

describe('designing an agent with Tinker', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('chat → draft → hand edit → another turn → accept into the Cast', async () => {
    const s = scriptedCrew({
      'creator-chat': [
        () => [
          { activity: { kind: 'research', label: 'Looking up “SwiftUI best practices”' } },
          { wait: 60 },
          { result: JSON.stringify({ reply: 'Here’s Sally.', draft: DRAFT }) },
        ],
        {
          reply: 'More playful now.',
          draft: { ...DRAFT, summary: 'A playful iOS builder.', look: { ...LOOK, hue: 'rose' } },
        },
      ],
    });
    h = testApp({ seed: true, runner: s.runner });
    const created = await h.call('POST', '/creator/sessions', {});
    expect(created.status).toBe(201);
    const id = created.body.id;

    const turn = h.call('POST', `/creator/sessions/${id}/chat`, { text: 'I need a Swift dev' });
    await new Promise((ok) => setTimeout(ok, 30));
    expect((await h.call('GET', `/creator/sessions/${id}`)).body.activity).toEqual({
      kind: 'research',
      label: 'Looking up “SwiftUI best practices”',
    });
    const first = (await turn).body;
    expect(first).toMatchObject({ reply: 'Here’s Sally.', draft: DRAFT });
    const call = s.crewCalls()[0];
    expect(call?.tools).toEqual(['WebSearch', 'WebFetch']); // Tinker may research
    expect((await h.call('GET', `/creator/sessions/${id}`)).body.activity).toBeNull();

    // the user renames her by hand; Tinker sees it next turn
    const edited = (
      await h.call('PATCH', `/creator/sessions/${id}`, { draft: { name: 'Sally', look: { hat: 'beret' } } })
    ).body;
    expect(edited.draft).toMatchObject({ name: 'Sally', look: { ...LOOK, hat: 'beret' } });
    await h.call('POST', `/creator/sessions/${id}/chat`, { text: 'more playful' });
    expect(s.crewCalls()[1]?.task).toContain('"name":"Sally"');
    expect((await h.call('GET', '/creator/sessions')).body.sessions).toHaveLength(1);

    const acc = await h.call('POST', `/creator/sessions/${id}/accept`);
    expect(acc.status).toBe(201);
    expect(acc.body.agent).toMatchObject({
      kind: 'agent',
      name: 'Swift Sally',
      role: 'iOS',
      look: { hue: 'rose' },
    });
    expect((await h.call('GET', '/creator/sessions')).body.sessions).toEqual([]);
    expect((await h.call('GET', `/agents/${acc.body.agent.id}`)).status).toBe(200);
  });

  it('accept refuses an unfinished draft; the free runner designs too', async () => {
    h = testApp({ seed: true });
    const s = (await h.call('POST', '/creator/sessions', { text: 'Someone for accessibility audits' })).body;
    expect(s.chat.map((m: { from: string }) => m.from)).toEqual(['user', 'creator']);
    expect(s.draft.name).toBeTruthy();
    await h.call('PATCH', `/creator/sessions/${s.id}`, { draft: { prompt: 'too short' } });
    const bad = await h.call('POST', `/creator/sessions/${s.id}/accept`);
    expect(bad.status).toBe(422);
    expect(bad.body.error.details.issues[0]).toMatch(/^prompt/);
    expect((await h.call('DELETE', `/creator/sessions/${s.id}`)).status).toBe(204);
  });
});

describe('hand edits during a turn', () => {
  it('win over Tinker’s draft, field by field and look slot by slot', async () => {
    const { keepHandEdits } = await import('../../src/crew/creator-chat.ts');
    const before = { name: 'Sally', role: 'iOS', look: { hat: 'none', hue: 'mint' } } as never;
    const now = { name: 'Sally', role: 'iOS', look: { hat: 'none', hue: 'rose' } } as never;
    const tinker = { name: 'Swift Sally', role: 'iOS dev', look: { hat: 'beret', hue: 'mint' } } as never;
    expect(keepHandEdits(before, now, tinker)).toEqual({
      name: 'Swift Sally',
      role: 'iOS dev',
      look: { hat: 'beret', hue: 'rose' },
    });
    expect(keepHandEdits(before, before, tinker)).toBe(tinker); // nothing edited
  });
});
