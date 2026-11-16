/* The director answers agents' open questions for the user: "tell Uncle Bob to use option 2". A thin adapter over
   the runtime's asks — `answer_question` goes through `runtime.answer`, the same path as the user's own answer, so
   the waiting run continues and the agent's chat shows the question and the answer like any other. */
import type { Ask } from '../db/runs.ts';
import type { Store } from '../db/store.ts';
import { invalid } from '../errors.ts';
import type { CapableTool } from '../room/bridge.ts';
import type { Runtime } from '../runtime/service.ts';

export type QuestionServices = { store: Store; runtime: Pick<Runtime, 'asks' | 'answer'> };

type Args = Record<string, unknown>;
const text = (a: Args, k: string) => (typeof a[k] === 'string' ? (a[k] as string).trim() : '');

/** An open question as the director sees it (summary and `open_questions` share it). */
export function questionView(store: Store, a: Ask) {
  return {
    id: a.id,
    from: store.agents.get(a.agentId)?.name ?? a.agentId,
    question: a.question,
    ...(a.options?.length ? { options: a.options.map((o, i) => `${i + 1}. ${o}`) } : {}),
  };
}

/** The words to answer with: option `n` (1-based) of the question's options, or the user's own words. */
function answerFor(ask: Ask, a: Args): string {
  const words = text(a, 'answer');
  if (a.option === undefined || a.option === null) {
    if (!words) throw invalid('Give "answer" (the user’s words) or "option" (its number).');
    return words;
  }
  const n = Number(a.option);
  const options = ask.options ?? [];
  if (!Number.isInteger(n) || n < 1 || n > options.length)
    throw invalid(
      options.length
        ? `Option ${String(a.option)} doesn’t exist — this question has ${options.length} (1–${options.length}).`
        : 'This question has no options — pass the user’s words as "answer".',
    );
  const picked = options[n - 1] as string;
  return words ? `${picked} — ${words}` : picked;
}

export function questionTools(s: QuestionServices, projectId: string): CapableTool[] {
  const open = () => s.runtime.asks(projectId, 'open');

  function answerQuestion(a: Args): string {
    const id = text(a, 'id');
    if (!id) throw invalid('"id" is required: the question’s id from `open_questions`.');
    const ask = open().find((q) => q.id === id);
    if (!ask) throw invalid(`No open question ${id} — it may be answered already; check \`open_questions\`.`);
    const done = s.runtime.answer(projectId, ask.id, answerFor(ask, a));
    const them = s.store.agents.get(done.agentId);
    const nick = them?.nick || them?.name.split(' ')[0] || done.agentId;
    return `Answered ${nick}: “${done.answer}” — their work carries on.`;
  }

  return [
    {
      name: 'open_questions',
      can: 'see the questions agents are waiting on the user for, with their ids and options',
      description:
        'List the open questions agents asked the user (they wait until answered): id, who asked, the question and its numbered options.',
      inputSchema: { type: 'object', properties: {} },
      run: async () => JSON.stringify(open().map((q) => questionView(s.store, q))),
    },
    {
      name: 'answer_question',
      can: 'answer an agent’s open question when the user tells you what to say ("tell Uncle Bob to use option 2") — never on your own',
      description:
        'Answer an open question for the user, exactly as the user would: the agent gets it and carries on. Only pass on what the user actually said in this chat; when they have not said, ask them instead. Pick by `option` number, or give the user’s words as `answer` (both: the option plus their note).',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The question’s id, from `open_questions`.' },
          option: { type: 'number', description: 'The option’s number (1 = the first).' },
          answer: { type: 'string', description: 'The user’s words, when not (only) an option.' },
        },
        required: ['id'],
      },
      run: async (a) => answerQuestion(a),
    },
  ];
}
