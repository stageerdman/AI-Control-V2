import { describe, expect, it } from 'vitest';
import { fakeBrain, pacedBrain } from '../../src/crew/fake-brain.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';

const spec = (task: string) =>
  ({
    runId: 'r',
    cwd: '/x',
    systemPrompt: '',
    task,
    model: 'm',
    caps: { maxTurns: 1, maxBudgetUsd: 0 },
    env: {},
    secretValues: [],
  }) as unknown as RunSpec;

describe('pacedBrain (free runner demo pacing)', () => {
  it('off by default: same steps as the fake brain', () => {
    expect(pacedBrain(0)(spec('Do the thing'))).toEqual(fakeBrain(spec('Do the thing')));
  });
  it('pace adds a wait after every step; "ask me" asks first', () => {
    const steps = pacedBrain(500)(spec('Build it, but ask me first'));
    expect(steps[0]).toMatchObject({ ask: expect.any(String), options: ['Go ahead', 'Hold on'] });
    expect(steps[1]).toEqual({ wait: 500 });
    expect(steps.filter((s) => 'wait' in s)).toHaveLength(steps.length / 2);
  });
});
