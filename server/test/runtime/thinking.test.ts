/* Thinking power: the dial's (model, effort) pairs, who decides, and that runs and crew calls really use it —
   the run row records the step, the runner gets the model and `--effort`. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCrew } from '../../src/crew/structured.ts';
import { cliArgs } from '../../src/runtime/claude-cli.ts';
import { fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { LIGHT_MODEL, resolveThinking, thinkingPair, workThinking } from '../../src/runtime/thinking.ts';
import { tempDir, testApp } from '../helpers.ts';

const STUDIO = 'claude-opus-5-5';

describe('the dial', () => {
  it('pairs each step with a model and an effort; only Light changes the model', () => {
    expect(thinkingPair('light', STUDIO)).toEqual({ model: LIGHT_MODEL, effort: 'low' });
    expect(thinkingPair('normal', STUDIO)).toEqual({ model: STUDIO, effort: 'medium' });
    expect(thinkingPair('deep', STUDIO)).toEqual({ model: STUDIO, effort: 'high' });
    expect(thinkingPair('deepest', STUDIO)).toEqual({ model: STUDIO, effort: 'max' });
  });

  it('most specific wins: task → agent → kind of work → Normal', () => {
    expect(resolveThinking({ task: 'light', agent: 'deepest', work: 'deep' })).toBe('light');
    expect(resolveThinking({ task: null, agent: 'deepest', work: 'deep' })).toBe('deepest');
    expect(resolveThinking({ agent: null, work: workThinking('reviewing') })).toBe('deep');
    expect(resolveThinking({ work: workThinking('building') })).toBe('normal');
  });

  it('the CLI gets --effort right after the model', () => {
    const args = cliArgs({ ...spec(), model: STUDIO, effort: 'max' }, { askServer: 'x' });
    expect(args.slice(args.indexOf('--model'), args.indexOf('--model') + 4)).toEqual([
      '--model',
      STUDIO,
      '--effort',
      'max',
    ]);
    expect(cliArgs(spec(), { askServer: 'x' })).not.toContain('--effort');
  });
});

describe('runs use it', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  const app = () => {
    const specs: RunSpec[] = [];
    h = testApp({ seed: true, runner: fakeRunner((s) => (specs.push(s), [{ result: 'ok' }])) });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    return specs;
  };
  const start = async (body: object) => {
    const r = await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'go', ...body });
    expect(r.status).toBe(201);
    return h.runtime.settled(r.body.id);
  };

  it('Normal by default; the agent’s own default next; a run’s own choice over both', async () => {
    const specs = app();
    const plain = await start({});
    expect(plain.thinking).toBe('normal');
    expect(specs[0]?.effort).toBe('medium');
    const studioModel = specs[0]?.model as string;
    expect(plain.model).toBe(studioModel);

    expect((await h.call('PATCH', '/agents/a-pete', { thinking: 'deepest' })).status).toBe(200);
    expect((await start({})).thinking).toBe('deepest');
    expect(specs[1]).toMatchObject({ model: studioModel, effort: 'max' });

    const light = await start({ thinking: 'light' });
    expect(light).toMatchObject({ thinking: 'light', model: LIGHT_MODEL });
    expect(specs[2]).toMatchObject({ model: LIGHT_MODEL, effort: 'low' });

    expect((await h.call('PATCH', '/agents/a-pete', { thinking: null })).status).toBe(200);
    expect((await start({})).thinking).toBe('normal');
  });

  it('a review thinks Deep unless the agent set its own', async () => {
    const specs = app();
    const r = h.runtime.start('aurora', { agentId: 'a-pete', task: 'review it', kind: 'reviewing' });
    expect((await h.runtime.settled(r.id)).thinking).toBe('deep');
    expect(specs[0]?.effort).toBe('high');
  });

  it('refuses a step that is not on the dial', async () => {
    app();
    expect((await h.call('PATCH', '/agents/a-pete', { thinking: 'turbo' })).status).toBe(422);
    const r = await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'go', thinking: 'x' });
    expect(r.status).toBe(422);
  });
});

describe('crew calls use it', () => {
  it('the call’s kind of work sets the step, the agent’s own wins, the clock row records it', async () => {
    const specs: RunSpec[] = [];
    const tracked: unknown[] = [];
    const own: Record<string, 'light' | 'deepest'> = { 'a-tinker': 'deepest' };
    const tmp = tempDir();
    const crew = createCrew({
      runner: fakeRunner((s) => (specs.push(s), [{ result: '{"ok":true}' }])),
      model: STUDIO,
      scratchDir: join(tmp.dir, 'scratch'),
      thinkingOf: (id) => own[id],
      clock: {
        start: (t: unknown) => (tracked.push(t), 'id'),
        end: () => {},
      } as never,
    });
    const call = (agentId: string) =>
      crew.call({
        who: 'Pixel',
        contract: 'test',
        systemPrompt: 's',
        task: 't',
        thinking: 'deep',
        track: { scope: 'project', ownerId: 'p', agentId, kind: 'thinking' },
        validate: (raw) => ({ ok: true, value: raw }),
      });
    await call('a-pixel');
    expect(specs[0]).toMatchObject({ model: STUDIO, effort: 'high' });
    expect(tracked[0]).toMatchObject({ agentId: 'a-pixel', thinking: 'deep' });
    await call('a-tinker');
    expect(specs[1]).toMatchObject({ model: STUDIO, effort: 'max' });
    expect(tracked[1]).toMatchObject({ thinking: 'deepest' });
    tmp.cleanup();
  });
});

function spec(): RunSpec {
  return {
    runId: 'r',
    cwd: '/tmp',
    systemPrompt: 's',
    task: 't',
    model: STUDIO,
    caps: { maxTurns: 5, maxBudgetUsd: 1 },
    env: {},
    secretValues: [],
  };
}
