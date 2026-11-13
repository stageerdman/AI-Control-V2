/* The `ask_user` MCP server (stdio, newline-delimited JSON-RPC). Claude Code starts one
   per run; a call blocks until the user answers in AI Studio. Standalone on purpose —
   no imports from the backend, so plain `node ask-server.ts` runs it (type stripping).
   Env: AI_STUDIO_ASK_URL (…/internal/runs/<runId>/asks), AI_STUDIO_RUN_TOKEN. */
import { createInterface } from 'node:readline';

const URL_BASE = process.env.AI_STUDIO_ASK_URL ?? '';
const TOKEN = process.env.AI_STUDIO_RUN_TOKEN ?? '';

const TOOL = {
  name: 'ask_user',
  description:
    'Ask the user (the human running this AI Studio project) a question and wait for their answer. Use it for decisions, missing information, or access you need. Offer short options when the answer is a choice.',
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

type Rpc = { jsonrpc: '2.0'; id?: number | string; method?: string; params?: Record<string, unknown> };
const send = (msg: unknown) => process.stdout.write(`${JSON.stringify(msg)}\n`);
const reply = (id: Rpc['id'], result: unknown) => send({ jsonrpc: '2.0', id, result });
const fail = (id: Rpc['id'], code: number, message: string) =>
  send({ jsonrpc: '2.0', id, error: { code, message } });

async function call(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const res = await fetch(`${URL_BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-run-token': TOKEN, ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`AI Studio answered ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
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
      return reply(m.id, { tools: [TOOL] });
    case 'tools/call': {
      const name = m.params?.name;
      if (name !== 'ask_user') return fail(m.id, -32602, `Unknown tool ${String(name)}`);
      try {
        const answer = await askUser((m.params?.arguments as Record<string, unknown>) ?? {});
        return reply(m.id, { content: [{ type: 'text', text: answer }] });
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
