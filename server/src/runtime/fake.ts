/* FakeRunner: plays a script — deterministic, free, no process. Every test and UI
   flow can run end-to-end on it (events, asks, cancel) without spending tokens. */
import type { Activity, RunHandle, RunIO, Runner, RunOutcome, RunSpec } from './runner.ts';

export type FakeStep =
  | { activity: Activity; status?: 'working' | 'waiting' }
  | { tokens: { input: number; output: number } }
  | { text: string }
  | { ask: string; options?: string[] }
  /** Call file_report with this input (refused → the run goes on, like a tool error). */
  | { report: Record<string, unknown> }
  /** Call a studio tool (call_agent, create_agent…); its answer (or refusal) is a text line, like a tool result. */
  | { tool: string; args: Record<string, unknown> }
  | { wait: number }
  | { fail: string }
  | { result: string };

export const DEFAULT_SCRIPT: FakeStep[] = [
  { activity: { kind: 'reading', label: 'Reading CLAUDE.md', target: 'CLAUDE.md' } },
  { tokens: { input: 1200, output: 80 } },
  { activity: { kind: 'editing', label: 'Writing hello.txt', target: 'hello.txt' } },
  { tokens: { input: 300, output: 40 } },
  { result: 'Done (fake run).' },
];

export function fakeRunner(script: (spec: RunSpec) => FakeStep[] = () => DEFAULT_SCRIPT): Runner {
  return {
    name: 'fake',
    start(spec: RunSpec, io: RunIO): RunHandle {
      const steps = script(spec);
      let cancelled = false;
      let wake: (() => void) | null = null;
      const sleep = (ms: number) =>
        new Promise<void>((r) => {
          const t = setTimeout(r, ms);
          wake = () => {
            clearTimeout(t);
            r();
          };
        });
      const done = (async (): Promise<RunOutcome> => {
        const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
        let turns = 0;
        const sessionId = `fake-${spec.runId}`;
        const end = (o: Partial<RunOutcome> & Pick<RunOutcome, 'status'>): RunOutcome => ({
          turns,
          usage,
          sessionId,
          ...o,
        });
        io.emit({ kind: 'session', sessionId });
        await sleep(0);
        for (const step of steps) {
          if (cancelled) return end({ status: 'cancelled' });
          if ('activity' in step)
            io.emit({ kind: 'activity', status: step.status ?? 'working', activity: step.activity });
          else if ('tokens' in step) {
            turns++;
            usage.input += step.tokens.input;
            usage.output += step.tokens.output;
            io.emit({ kind: 'tokens', ...step.tokens });
          } else if ('text' in step) io.emit({ kind: 'text', text: step.text });
          else if ('ask' in step) {
            io.emit({
              kind: 'activity',
              status: 'waiting',
              activity: { kind: 'asking', label: 'Waiting for your answer', detail: step.ask },
            });
            const answer = await Promise.race([
              io.ask(step.ask, step.options),
              new Promise<null>((r) => {
                wake = () => r(null);
              }),
            ]);
            if (answer === null || cancelled) return end({ status: 'cancelled' });
            io.emit({ kind: 'text', text: `User answered: ${answer}` });
          } else if ('report' in step) {
            io.emit({
              kind: 'activity',
              status: 'working',
              activity: { kind: 'writing', label: 'Filing a report' },
            });
            try {
              if (!io.report) throw new Error('file_report is not available in this run');
              const { id } = await io.report(step.report);
              io.emit({ kind: 'text', text: `Filed report ${id}` });
            } catch (e) {
              io.emit({ kind: 'text', text: `file_report refused: ${(e as Error).message}` });
            }
          } else if ('tool' in step) {
            try {
              if (!io.tool) throw new Error('studio tools are not available in this run');
              io.emit({ kind: 'text', text: await io.tool(step.tool, step.args) });
            } catch (e) {
              io.emit({ kind: 'text', text: `${step.tool} refused: ${(e as Error).message}` });
            }
          } else if ('wait' in step) await sleep(step.wait);
          else if ('fail' in step) return end({ status: 'failed', error: step.fail });
          else if ('result' in step) return end({ status: 'succeeded', result: step.result });
          await sleep(0);
        }
        return end({ status: cancelled ? 'cancelled' : 'succeeded' });
      })();
      return {
        done,
        cancel: () => {
          cancelled = true;
          wake?.();
        },
      };
    },
  };
}
