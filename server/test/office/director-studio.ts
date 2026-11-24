/* A studio where the director's chat turns play scripted tool calls (then a plain reply), for the director's
   action tools' tests. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fakeBrain } from '../../src/crew/fake-brain.ts';
import { contractOf } from '../../src/crew/structured.ts';
import { getChatMessages } from '../../src/db/chats.ts';
import type { FakeStep } from '../../src/runtime/fake.ts';
import { fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { worked } from '../crew/brain.ts';
import { testApp } from '../helpers.ts';

const isChat = (s: RunSpec) => s.task.startsWith('Studio summary right now: ');
export type Call = { tool: string; args: Record<string, unknown> };

/** Project "lumi" with Pete on it; `help` calls play `helper`, whiteboard builds play `build`. */
export function directorStudio(
  helper: (spec: RunSpec) => FakeStep[] = fakeBrain,
  build: (spec: RunSpec) => FakeStep[] = () => worked('Built.'),
) {
  const calls: RunSpec[] = [];
  const turns: Call[][] = [];
  const h = testApp({
    seed: true,
    runner: fakeRunner((spec): FakeStep[] => {
      calls.push(spec);
      if (isChat(spec)) return [...(turns.shift() ?? []), { result: '{"reply":"Done."}' }];
      if (contractOf(spec.task)?.name === 'help') return helper(spec);
      if (contractOf(spec.task)) return fakeBrain(spec);
      return build(spec);
    }),
  });
  mkdirSync(join(h.config.sandbox, 'lumi'), { recursive: true });
  h.store.projects.update('lumi', { folder: 'lumi', teamIds: [], agentIds: ['a-pete'] });
  const orch = h.store.projects.require('lumi').orchestratorId;
  /** One director turn on the user's `text`, running `call` (if any) → what the tool answered. */
  const turn = async (text: string, call?: Call) => {
    turns.push(call ? [call] : []);
    const r = await h.call('POST', `/projects/lumi/threads/${orch}/messages`, { text });
    await h.runtime.settled(r.body.runId);
    return getChatMessages(h.db, r.body.runId).find((m) => m.role === 'assistant')?.text;
  };
  return { h, calls, turn, orch };
}
