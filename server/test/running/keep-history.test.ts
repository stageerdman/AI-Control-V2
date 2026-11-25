/* RUNNING: stopping never loses anything. A stopped agent's chat and session are kept — after the stop and
   after a restart — the stop reads "Stopped by you" (not an error), the agent can look back at what it did
   (my_history) and continue in the same session. A studio that closes mid-run is not a user's stop. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { STOPPED_BY_YOU, STUDIO_CLOSED } from '../../src/runtime/service.ts';
import { scriptedCrew, worked } from '../crew/brain.ts';
import { tempDir, testApp } from '../helpers.ts';

type H = ReturnType<typeof testApp>;
type Msg = { role: string; text: string; meta: Record<string, unknown> | null };

const LONG: FakeStep[] = [{ text: 'Starting the long job.' }, { wait: 10_000 }, { result: 'never' }];
const STOPPED_LINE = `${STOPPED_BY_YOU}. The chat and the work so far are kept — ask to continue any time.`;

const boot = (at: string, script: (spec: RunSpec) => FakeStep[], first = false) => {
  const h = testApp({ seed: true, at, runner: fakeRunner(script) });
  if (first) {
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
  }
  return h;
};
const start = async (h: H, task: string, extra: Record<string, unknown> = {}) => {
  const r = await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task, ...extra });
  expect(r.status).toBe(201);
  return r.body.id as string;
};
const messages = async (h: H, runId: string) =>
  (await h.call('GET', `/projects/aurora/chats/${runId}/messages`)).body as Msg[];
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

describe('stopped agents keep their history and can continue', () => {
  let h: H | undefined;
  let dir: ReturnType<typeof tempDir>;
  afterEach(async () => {
    await h?.close();
    h = undefined;
    dir.cleanup();
  });

  it('keeps the chat and session through a stop and a restart, then resumes the same session', async () => {
    dir = tempDir();
    const specs: RunSpec[] = [];
    const script = (spec: RunSpec) => {
      specs.push(spec);
      return spec.resumeSessionId ? [{ text: 'Picking up where I was.' }, { result: 'Done now.' }] : LONG;
    };
    h = boot(dir.dir, script, true);
    const id = await start(h, 'Build the long thing');
    await tick();
    expect((await h.call('POST', '/projects/aurora/agents/a-pete/stop')).status).toBe(202);
    await h.runtime.settled(id);

    const run = h.runtime.get('aurora', id);
    expect([run.status, run.error, run.sessionId]).toEqual(['cancelled', STOPPED_BY_YOU, `fake-${id}`]);
    const before = await messages(h, id);
    expect(before.map((m) => [m.role, m.text])).toEqual([
      ['user', 'Build the long thing'],
      ['assistant', 'Starting the long job.'],
      ['system', STOPPED_LINE],
    ]);

    await h.close();
    h = boot(dir.dir, script);
    expect(await messages(h, id)).toEqual(before);
    expect((await h.call('GET', '/projects/aurora/agents/a-pete/chats')).body[0]).toMatchObject({
      runId: id,
      status: 'cancelled',
      sessionId: `fake-${id}`,
    });

    const again = await start(h, 'Please carry on', { resumeRunId: id });
    expect((await h.runtime.settled(again)).status).toBe('succeeded');
    expect(specs.at(-1)?.resumeSessionId).toBe(`fake-${id}`);
  });

  it('a studio that closes mid-run is not "stopped by you": the restart marks it interrupted', async () => {
    dir = tempDir();
    h = boot(dir.dir, () => LONG, true);
    const id = await start(h, 'Build the long thing');
    await tick();
    await h.close();

    h = boot(dir.dir, () => LONG);
    const run = h.runtime.get('aurora', id);
    expect(run.status).toBe('failed');
    expect(run.error).toMatch(/Interrupted/);
    const texts = (await messages(h, id)).map((m) => m.text);
    expect(texts.at(-1)).toBe(STUDIO_CLOSED);
    expect(texts.join('\n')).not.toContain(STOPPED_BY_YOU);
  });

  it('my_history lets the agent look back at its own chats — and only its own', async () => {
    dir = tempDir();
    let stoppedId = '';
    h = boot(
      dir.dir,
      (spec) =>
        spec.task === 'Look back'
          ? [
              { tool: 'my_history', args: {} },
              { tool: 'my_history', args: { runId: stoppedId } },
              { result: 'ok' },
            ]
          : spec.task === 'Snoop'
            ? [{ tool: 'my_history', args: { runId: stoppedId } }, { result: 'ok' }]
            : LONG,
      true,
    );
    stoppedId = await start(h, 'Build the long thing');
    await tick();
    await h.call('POST', '/projects/aurora/agents/a-pete/stop');
    await h.runtime.settled(stoppedId);

    const look = await start(h, 'Look back');
    await h.runtime.settled(look);
    const [list, transcript] = (await messages(h, look))
      .filter((m) => m.role === 'assistant')
      .map((m) => m.text);
    expect(list).toContain(stoppedId);
    expect(list).toContain('stopped by the user');
    expect(list).toContain('Starting the long job.');
    expect(transcript).toContain('[user] Build the long thing');
    expect(transcript).toContain(`[system] ${STOPPED_LINE}`);

    const snoop = (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-scar', task: 'Snoop' })).body
      .id as string;
    await h.runtime.settled(snoop);
    const said = (await messages(h, snoop)).find((m) => m.role === 'assistant')?.text;
    expect(said).toMatch(/^my_history refused: No chat of yours/);
  });

  it('a stopped checklist item says "Stopped by you" and, when continued, its agent is told why', async () => {
    dir = tempDir();
    const crew = scriptedCrew(
      {
        dispatch: [
          { summary: 'One step.', items: [{ text: 'Step one', assignee: 'a-baron', brief: 'One.' }] },
        ],
      },
      (spec) => (spec.resumeSessionId ? worked('Finished it.') : LONG),
    );
    h = testApp({ seed: true, at: dir.dir, runner: crew.runner });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    const goal = (await h.call('POST', '/projects/aurora/work', { goal: 'Do one thing' })).body;
    for (let i = 0; i < 100 && !(await h.call('GET', '/projects/aurora/running')).body.length; i++)
      await tick(5);

    await h.call('POST', '/projects/aurora/stop');
    let g = (await h.call('GET', `/projects/aurora/work/${goal.id}`)).body;
    for (let i = 0; i < 100 && g.items[0].status !== 'cancelled'; i++) {
      await tick(5);
      g = (await h.call('GET', `/projects/aurora/work/${goal.id}`)).body;
    }
    expect(g.items[0].status).toBe('cancelled');
    expect(g.items[0].note).toContain(STOPPED_BY_YOU);

    expect((await h.call('POST', `/projects/aurora/work/${goal.id}/resume`)).status).toBe(202);
    for (let i = 0; i < 200 && g.status !== 'done'; i++) {
      await tick(5);
      g = (await h.call('GET', `/projects/aurora/work/${goal.id}`)).body;
    }
    expect(g.status).toBe('done');
    const resumed = crew.calls.find((s) => s.resumeSessionId);
    expect(resumed?.task).toContain('the user stopped you, and has now asked you to continue');
  });
});
