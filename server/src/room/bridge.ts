/* The bridge: studio tools for one run (an agent run or a crew call), reached by the studio MCP server
   (src/mcp/ask-server.ts) over HTTP with a per-bridge token, or directly by the FakeRunner (io.tool).
   A tool call can take minutes (a fellow agent's whole run): it starts as a job the MCP server long-polls. */
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { notFound } from '../errors.ts';

export type BridgeTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** The text the agent reads back. Throw to answer with an error (the agent sees the message). */
  run: (args: Record<string, unknown>) => Promise<string>;
};
type Job = { done: boolean; text?: string; isError?: boolean; wake: Set<() => void> };
type Open = { token: string; tools: Map<string, BridgeTool>; jobs: Map<string, Job> };

export function createBridges() {
  const open = new Map<string, Open>();
  let baseUrl: string | null = null;

  const authorized = (id: string, token: string | undefined): Open => {
    const b = open.get(id);
    const ok =
      !!b &&
      !!token &&
      token.length === b.token.length &&
      timingSafeEqual(Buffer.from(token), Buffer.from(b.token));
    if (!ok || !b) throw notFound('Bridge', id);
    return b;
  };

  /** Call a tool in-process (FakeRunner and tests). Errors come back as thrown Errors. */
  const call = async (b: Open, name: string, args: Record<string, unknown>): Promise<string> => {
    const t = b.tools.get(name);
    if (!t) throw new Error(`Unknown tool ${name}`);
    return t.run(args);
  };

  return {
    setBaseUrl: (url: string) => {
      baseUrl = url;
    },
    /** Open a bridge for one run. `close()` when the run is over. */
    open(tools: readonly BridgeTool[]) {
      const id = randomUUID();
      const b: Open = { token: randomUUID(), tools: new Map(tools.map((t) => [t.name, t])), jobs: new Map() };
      open.set(id, b);
      return {
        id,
        names: tools.map((t) => t.name),
        /** For the CLI runner's MCP server; null until the server listens (inject-only tests). */
        remote: baseUrl ? { url: `${baseUrl}/internal/bridges/${id}`, token: b.token } : null,
        call: (name: string, args: Record<string, unknown>) => call(b, name, args),
        close: () => open.delete(id),
      };
    },
    /* the MCP server's side door */
    internal: {
      tools(id: string, token: string | undefined) {
        const b = authorized(id, token);
        return [...b.tools.values()].map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        }));
      },
      start(id: string, token: string | undefined, name: string, args: Record<string, unknown>): string {
        const b = authorized(id, token);
        if (!b.tools.has(name)) throw notFound('Tool', name);
        const jobId = randomUUID();
        const job: Job = { done: false, wake: new Set() };
        b.jobs.set(jobId, job);
        const settle = (text: string, isError: boolean) => {
          Object.assign(job, { done: true, text, isError });
          for (const w of job.wake) w();
        };
        call(b, name, args).then(
          (t) => settle(t, false),
          (e: Error) => settle(e.message, true),
        );
        return jobId;
      },
      async wait(id: string, token: string | undefined, jobId: string, timeoutMs: number) {
        const b = authorized(id, token);
        const job = b.jobs.get(jobId);
        if (!job) throw notFound('Job', jobId);
        if (!job.done)
          await new Promise<void>((r) => {
            const t = setTimeout(r, timeoutMs);
            job.wake.add(() => {
              clearTimeout(t);
              r();
            });
          });
        if (!job.done) return { status: 'running' as const };
        b.jobs.delete(jobId);
        return { status: 'done' as const, text: job.text ?? '', isError: !!job.isError };
      },
    },
  };
}
export type Bridges = ReturnType<typeof createBridges>;
export type Bridge = ReturnType<Bridges['open']>;
