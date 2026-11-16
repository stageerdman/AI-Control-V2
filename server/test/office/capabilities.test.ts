/* The director's "what you can do from here" list is built from what is really attached: every tool and every
   answer field has one plain line, the prompt shows exactly those, and nothing missing is promised. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type Capabilities, capabilityLines } from '../../src/office/capabilities.ts';
import {
  ANSWER_FIELDS,
  type AnswerField,
  DirectorReplySchema,
  directorAnswer,
} from '../../src/office/director-reply.ts';
import { featureTools } from '../../src/office/feature-tools.ts';
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
];
const allFields = Object.keys(DirectorReplySchema.shape).filter((k) => k !== 'reply') as AnswerField[];
/** The capability lines a prompt shows. */
const shown = (prompt: string) =>
  prompt.split('\n').filter((l) => /^- (`[a-z_]+`|"[a-z]+" in your answer): /.test(l));

describe('honest capability list', () => {
  it('every answer field and every director tool has one plain capability line', () => {
    for (const f of allFields) expect(ANSWER_FIELDS[f]?.can, f).toMatch(/\w{3}/);
    for (const t of allTools()) expect(t.can, t.name).toMatch(/\w{3}/);
  });

  it('the prompt shows exactly the attached tools and fields', () => {
    const can: Capabilities = { tools: allTools(), fields: allFields };
    expect(shown(orchestratorChatPrompt(pixel, 'Aurora', can))).toEqual(capabilityLines(can));
    expect(shown(orchestratorChatPrompt(pixel, 'Aurora', can))).toHaveLength(
      can.tools.length + allFields.length,
    );
  });

  it('promises nothing that is not attached: no stop without `stop`, no offers it cannot make', () => {
    const prompt = orchestratorChatPrompt(pixel, 'Aurora', { tools: [], fields: ['ask'] });
    expect(shown(prompt)).toEqual([`- "ask" in your answer: ${ANSWER_FIELDS.ask.can}`]);
    expect(prompt).not.toContain(ANSWER_FIELDS.stop.can);
    expect(prompt).not.toMatch(/features list as Planned|whiteboard as a goal|ONE goal/);
    expect(directorAnswer(['ask'])).not.toMatch(/- (STOP|WORK|CONTINUE):/);
    // nothing at all → it can only talk
    expect(orchestratorChatPrompt(pixel, 'Aurora')).toContain('you have no tools and no actions');
  });

  it('for a request outside the list it offers the real next steps it has', () => {
    const tools = allTools().filter((t) => t.name === 'add_feature');
    expect(orchestratorChatPrompt(pixel, 'Aurora', { tools, fields: [] })).toMatch(
      /can’t do it from here, and offer to add it to the features list as Planned\./,
    );
    expect(orchestratorChatPrompt(pixel, 'Aurora', { tools, fields: ['work'] })).toMatch(
      /offer to add it to the features list as Planned, or to put the work on the whiteboard as a goal\./,
    );
  });

  describe('in the studio', () => {
    let h: ReturnType<typeof testApp>;
    afterEach(() => h.close());

    it('the director’s chat prompt lists every tool it is given and every field the studio carries out', async () => {
      const seen: RunSpec[] = [];
      const crew = scriptedCrew({}, (s) => {
        seen.push(s);
        return [{ result: '{"reply":"Hi."}' }];
      });
      h = testApp({ seed: true, runner: crew.runner });
      mkdirSync(join(h.config.sandbox, 'aurora'));
      h.store.projects.update('aurora', { folder: 'aurora' });
      const r = await h.call('POST', '/projects/aurora/threads/a-pixel/messages', { text: 'Hi' });
      await h.runtime.settled(r.body.runId);
      const spec = seen.find((s) => s.task.startsWith('Studio summary right now: ')) as RunSpec;
      // the studio attaches the whiteboard and features tools and carries out every answer field
      expect(shown(spec.systemPrompt ?? '')).toEqual(
        capabilityLines({ tools: allTools(), fields: allFields }),
      );
    });
  });
});
