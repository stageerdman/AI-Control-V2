/* A team captain leads their own team: `stop_work` and `tell_agent` in their runs, scoped to their team —
   the rest of the project is the director's. Members who aren't captains don't get them. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getChatMessages } from '../../src/db/chats.ts';
import type { FakeStep } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { scriptedCrew } from '../crew/brain.ts';
import { testApp } from '../helpers.ts';

describe('a captain leads their team', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('tells and stops their own team, never anyone outside it', async () => {
    const name = (id: string) => h.store.agents.require(id).name;
    const isRunOf = (spec: RunSpec, id: string) => spec.systemPrompt.startsWith(`# ${name(id)}\n`);
    const tools: Record<string, readonly string[] | undefined> = {};
    const crew = scriptedCrew({}, (spec): FakeStep[] => {
      for (const id of ['a-semic', 'a-pete']) if (isRunOf(spec, id)) tools[id] = spec.studioTools?.names;
      if (!isRunOf(spec, 'a-semic') || spec.task !== 'lead') return [{ wait: 10_000 }, { result: 'never' }];
      return [
        { tool: 'tell_agent', args: { to: name('a-pete'), message: 'Use the shared logger.' } },
        { tool: 'tell_agent', args: { to: name('a-lint'), message: 'hi' } },
        { tool: 'stop_work', args: { agents: [name('a-lint')] } },
        { tool: 'stop_work', args: { everyone: true, message: 'Wait for the new design.' } },
        { result: 'ok' },
      ];
    });
    h = testApp({ seed: true, runner: crew.runner });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    const run = async (agentId: string, task = 'long') =>
      (await h.call('POST', '/projects/aurora/runs', { agentId, task })).body.id as string;
    const peteRun = await run('a-pete');
    const lintRun = await run('a-lint'); // captain of another team on the same project
    const lead = await h.runtime.settled(await run('a-semic', 'lead'));

    expect(lead.status).toBe('succeeded');
    expect(tools['a-semic']).toEqual(expect.arrayContaining(['stop_work', 'tell_agent']));
    expect(tools['a-pete']).not.toContain('stop_work');
    const said = getChatMessages(h.db, lead.id)
      .map((m) => m.text)
      .join('\n');
    expect(said).toContain(`Nobody called ${name('a-lint')} is on your team.`);
    expect(said).toContain(`Couldn’t stop ${name('a-lint')}: they aren’t on your team.`);
    expect(said).toContain(`Stopped ${name('a-pete')}: 1 session. Your message is on their desk.`);
    expect(getChatMessages(h.db, peteRun).some((m) => m.text === 'Use the shared logger.')).toBe(true);
    expect((await h.runtime.settled(peteRun)).status).toBe('cancelled');
    expect(h.runtime.get('aurora', lintRun).status).toBe('running');
    const desk = (await h.call('GET', '/projects/aurora/desk-notes?agentId=a-pete')).body.notes;
    expect(desk[0]).toMatchObject({ next: 'Wait for the new design.' });
  });
});
