/* Invite another, phase 5: copies share instructions but are kept apart — their own runs, and a prompt that
   tells each one who its kin are. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { testApp } from '../helpers.ts';

describe('kin kept apart', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('a copy runs as itself: its own run, its own name, its kin named as kin', async () => {
    const specs: RunSpec[] = [];
    h = testApp({ seed: true, runner: fakeRunner((s) => (specs.push(s), [{ result: 'ok' }])) });
    mkdirSync(join(h.config.sandbox, 'aurora'), { recursive: true });
    h.store.projects.update('aurora', { folder: 'aurora' });
    await h.call('POST', '/agents/a-pete/copies', { name: 'Bea' });

    const runOf = async (agentId: string) => {
      const { status, body: r } = await h.call('POST', '/projects/aurora/runs', { agentId, task: 'go' });
      expect(status, JSON.stringify(r)).toBeLessThan(300);
      await h.runtime.settled(r.id);
      return r;
    };
    const bea = await runOf('a-bea');
    const pete = await runOf('a-pete');

    expect([bea.agentId, pete.agentId]).toEqual(['a-bea', 'a-pete']);
    expect(bea.id).not.toBe(pete.id);
    const [beaPrompt, petePrompt] = specs.map((s) => s.systemPrompt);
    expect(beaPrompt).toContain('# Bea');
    expect(beaPrompt).toContain('your kin Pixel Pete');
    expect(beaPrompt).toContain('read it as you, Bea.');
    expect(petePrompt).toContain('your kin Bea');
    expect(petePrompt).toContain('read it as you, Pixel Pete.');
  });
});
