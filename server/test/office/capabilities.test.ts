/* The director's "what you can do from here" list is built from what is really attached: every tool has one
   plain line, the prompt shows exactly those, and nothing missing is promised. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { actionTools } from '../../src/office/action-tools.ts';
import { capabilityLines } from '../../src/office/capabilities.ts';
import { directorAnswer } from '../../src/office/director-reply.ts';
import { featureTools } from '../../src/office/feature-tools.ts';
import { questionTools } from '../../src/office/question-tools.ts';
import { teamTools } from '../../src/office/team-tools.ts';
import { orchestratorChatPrompt } from '../../src/office/threads.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { whiteboardTools } from '../../src/whiteboard/tools.ts';
import { scriptedCrew } from '../crew/brain.ts';
import { testApp } from '../helpers.ts';

const pixel = { name: 'Pixel', role: 'Director', prompt: 'Steer.' };
/* tool definitions only — nothing runs, so the services are never touched */
const allTools = () => [
  ...whiteboardTools({} as never, 'p', 'a-pixel'),
  ...featureTools({} as never, {} as never, 'p'),
  ...actionTools({} as never, 'p', 'a-pixel'),
  ...teamTools({} as never, 'p', 'a-pixel', { card: () => {} }),
  ...questionTools({} as never, 'p'),
];
const named = (...names: string[]) => allTools().filter((t) => names.includes(t.name));
/** The capability lines a prompt shows. */
const shown = (prompt: string) => prompt.split('\n').filter((l) => /^- `[a-z_]+`: /.test(l));

describe('honest capability list', () => {
  it('every director tool has one plain capability line', () => {
    for (const t of allTools()) expect(t.can, t.name).toMatch(/\w{3}/);
  });

  it('the prompt shows exactly the attached tools', () => {
    const tools = allTools();
    expect(shown(orchestratorChatPrompt(pixel, 'Aurora', { tools }))).toEqual(capabilityLines({ tools }));
    expect(shown(orchestratorChatPrompt(pixel, 'Aurora', { tools }))).toHaveLength(tools.length);
  });

  it('promises nothing that is not attached: no stop without `stop_work`, no offers it cannot make', () => {
    const tools = named('ask_person', 'staff_project');
    const prompt = orchestratorChatPrompt(pixel, 'Aurora', { tools });
    expect(shown(prompt)).toEqual(capabilityLines({ tools }));
    expect(prompt).not.toContain('stop_work');
    expect(prompt).not.toMatch(/features list as Planned|whiteboard as a goal|ONE goal/);
    expect(directorAnswer({ tools })).not.toContain('want it on the whiteboard');
    // nothing at all → it can only talk
    expect(orchestratorChatPrompt(pixel, 'Aurora')).toContain('you have no tools and no actions');
  });

  it('for a request outside the list it offers the real next steps it has', () => {
    expect(orchestratorChatPrompt(pixel, 'Aurora', { tools: named('add_feature') })).toMatch(
      /can’t do it from here, and offer to add it to the features list as Planned\./,
    );
    expect(orchestratorChatPrompt(pixel, 'Aurora', { tools: named('add_feature', 'add_goal') })).toMatch(
      /offer to add it to the features list as Planned, or to put the work on the whiteboard as a goal\./,
    );
  });

  describe('in the studio', () => {
    let h: ReturnType<typeof testApp>;
    afterEach(() => h.close());

    it('the director’s chat prompt lists every tool it is given, and asks for plain words', async () => {
      const seen: RunSpec[] = [];
      const crew = scriptedCrew({}, (s) => {
        seen.push(s);
        return [{ result: 'Hi.' }];
      });
      h = testApp({ seed: true, runner: crew.runner });
      mkdirSync(join(h.config.sandbox, 'aurora'));
      h.store.projects.update('aurora', { folder: 'aurora' });
      const r = await h.call('POST', '/projects/aurora/threads/a-pixel/messages', { text: 'Hi' });
      await h.runtime.settled(r.body.runId);
      const spec = seen.find((s) => s.task.startsWith('Studio summary right now: ')) as RunSpec;
      expect(shown(spec.systemPrompt ?? '')).toEqual(capabilityLines({ tools: allTools() }));
      expect(spec.task).toMatch(/Never start work on a question[\s\S]*plain words only — no JSON/);
    });
  });
});
