/* A scripted crew for tests: FakeRunner answers by the contract a task announces
   (queues per contract; repair asks pop the same queue). Agent runs (no contract) play `work` — by default one
   real-work step (an edit) and "Done.", so a build counts as done (domain/real-work.ts). */
import { contractOf } from '../../src/crew/structured.ts';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';

/** One real-work step (a file edit): a scripted build that does work. */
export const WORK_STEP: FakeStep = { activity: { kind: 'editing', label: 'Writing notes.md', target: 'notes.md' } };

/** A build that does one real-work step, then replies `result`. */
export const worked = (result: string): FakeStep[] => [WORK_STEP, { result }];

export type Answer = string | object | ((spec: RunSpec) => string | object | FakeStep[]);

export function scriptedCrew(
  answers: Record<string, Answer[]>,
  work: (spec: RunSpec) => FakeStep[] = () => [
    { tokens: { input: 10, output: 5 } },
    WORK_STEP,
    { result: 'Done.' },
  ],
) {
  const calls: RunSpec[] = [];
  const runner = fakeRunner((spec) => {
    calls.push(spec);
    const c = contractOf(spec.task);
    if (!c) return work(spec);
    const next = answers[c.name]?.shift();
    if (next === undefined) return [{ fail: `no scripted answer left for ${c.name}` }];
    const a = typeof next === 'function' ? next(spec) : next;
    if (Array.isArray(a)) return a;
    return [
      { tokens: { input: 200, output: 40 } },
      { result: typeof a === 'string' ? a : JSON.stringify(a) },
    ];
  });
  return { runner, calls, crewCalls: () => calls.filter((s) => contractOf(s.task)) };
}
