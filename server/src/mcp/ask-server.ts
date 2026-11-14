/* The `ask_user` MCP server (stdio, newline-delimited JSON-RPC). Claude Code starts one
   per run; a call blocks until the user answers in AI Studio. Standalone on purpose —
   no imports from the backend, so plain `node ask-server.ts` runs it (type stripping).
   Env: AI_STUDIO_ASK_URL (…/internal/runs/<runId>/asks), AI_STUDIO_RUN_TOKEN, and — only for runs
   whose role/team files reports — AI_STUDIO_REPORT_URL (…/reports): then `file_report` is listed too. */
import { createInterface } from 'node:readline';

const URL_BASE = process.env.AI_STUDIO_ASK_URL ?? '';
const TOKEN = process.env.AI_STUDIO_RUN_TOKEN ?? '';
const REPORT_URL = process.env.AI_STUDIO_REPORT_URL ?? '';

const TOOL = {
  name: 'ask_user',
  description:
    'Ask the user (the human running this AI Studio project) a question and wait for their answer. Only for information only the user has: a missing credential, or a genuine product choice with no sensible default. Never use it for permission or confirmation — you are pre-approved for anything your tools allow; decide and proceed. Offer short options when the answer is a choice.',
  inputSchema: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The question, in plain words.' },
      options: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional short answers to pick from.',
      },
    },
    required: ['question'],
  },
};

const REPORT_TOOL = {
  name: 'file_report',
  description:
    'File a finished, human-readable report for the user (it lands in the project’s Reports tray). Use it when the task asks for knowledge rather than change: research, a comparison, an investigation, a review, a status write-up. Write for a non-engineer: a clear title, a 1–2 sentence summary that answers the question, then the full report in markdown. At most two per run — one report per question.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Plain-text title, 4–80 characters.' },
      summary: { type: 'string', description: 'The answer in 1–2 plain sentences (≤ 280 characters).' },
      body: {
        type: 'string',
        description: 'The full report in markdown (headings, lists; no raw HTML, no images).',
      },
      kind: { type: 'string', enum: ['research', 'review', 'status', 'other'] },
      question: { type: 'string', description: 'What it answers, in the asker’s words (≤ 200).' },
      sources: {
        type: 'array',
        maxItems: 20,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            url: { type: 'string', description: 'An http(s) link.' },
            path: { type: 'string', description: 'A file path relative to the project folder.' },
          },
          required: ['title'],
        },
      },
    },
    required: ['title', 'summary', 'body', 'kind'],
  },
};

type Rpc = { jsonrpc: '2.0'; id?: number | string; method?: string; params?: Record<string, unknown> };
const send = (msg: unknown) => process.stdout.write(`${JSON.stringify(msg)}\n`);
const reply = (id: Rpc['id'], result: unknown) => send({ jsonrpc: '2.0', id, result });
const fail = (id: Rpc['id'], code: number, message: string) =>
  send({ jsonrpc: '2.0', id, error: { code, message } });

async function call(path: string, init: RequestInit = {}, base = URL_BASE): Promise<Record<string, unknown>> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-run-token': TOKEN, ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    /* pass the studio's reason on (it's written for the agent: limits, a malformed field…) */
    const body = (await res.json().catch(() => null)) as {
      error?: { message?: string; details?: unknown };
    } | null;
    const why = body?.error?.message ? `: ${body.error.message}` : '';
    const details = body?.error?.details ? ` ${JSON.stringify(body.error.details)}` : '';
    throw new Error(`AI Studio answered ${res.status}${why}${details}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

async function fileReport(args: Record<string, unknown>): Promise<string> {
  const { id } = await call('', { method: 'POST', body: JSON.stringify(args) }, REPORT_URL);
  return `Filed report ${String(id)} — it is in the user's Reports tray.`;
}

async function askUser(args: Record<string, unknown>): Promise<string> {
  const question = typeof args.question === 'string' ? args.question : '';
  const options = Array.isArray(args.options) ? args.options.filter((o) => typeof o === 'string') : undefined;
  const { askId } = await call('', {
    method: 'POST',
    body: JSON.stringify({ question, ...(options ? { options } : {}) }),
  });
  for (;;) {
    const r = await call(`/${String(askId)}/wait`); // long-poll: returns when answered, or after a while
    if (r.status === 'answered') return String(r.answer);
    if (r.status === 'cancelled') throw new Error('The question was withdrawn (run ended)');
  }
}

async function handle(m: Rpc) {
  if (m.id === undefined) return; // notifications (initialized, cancelled…) need no reply
  switch (m.method) {
    case 'initialize':
      return reply(m.id, {
        protocolVersion: (m.params?.protocolVersion as string) ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'ai-studio', version: '0.1.0' },
      });
    case 'ping':
      return reply(m.id, {});
    case 'tools/list':
      return reply(m.id, { tools: REPORT_URL ? [TOOL, REPORT_TOOL] : [TOOL] });
    case 'tools/call': {
      const name = m.params?.name;
      const run = name === 'ask_user' ? askUser : name === 'file_report' && REPORT_URL ? fileReport : null;
      if (!run) return fail(m.id, -32602, `Unknown tool ${String(name)}`);
      try {
        const text = await run((m.params?.arguments as Record<string, unknown>) ?? {});
        return reply(m.id, { content: [{ type: 'text', text }] });
      } catch (e) {
        return reply(m.id, { content: [{ type: 'text', text: (e as Error).message }], isError: true });
      }
    }
    default:
      return fail(m.id, -32601, `Method not found: ${String(m.method)}`);
  }
}

createInterface({ input: process.stdin }).on('line', (line) => {
  let m: Rpc;
  try {
    m = JSON.parse(line) as Rpc;
  } catch {
    return;
  }
  void handle(m);
});
