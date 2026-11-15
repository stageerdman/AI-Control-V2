import { describe, expect, it } from 'vitest';
import type { ChatMessage, ChatRole, ChatSummary } from '../../src/db/chats.ts';
import { recapTranscript } from '../../src/runtime/recap.ts';

const chat: ChatSummary = {
  runId: 'r1',
  agentId: 'a1',
  projectId: 'p1',
  task: 'Build the login page',
  status: 'succeeded',
  sessionId: null,
  startedAt: '2026-11-15T10:00:00.000Z',
  endedAt: '2026-11-15T10:05:00.000Z',
  messageCount: 0,
  lastText: null,
};
const msg = (seq: number, role: ChatRole, text: string): ChatMessage => ({
  id: `m${seq}`,
  runId: 'r1',
  projectId: 'p1',
  agentId: 'a1',
  seq,
  role,
  text,
  meta: null,
  createdAt: chat.startedAt,
});

describe('recapTranscript', () => {
  it('shows the task once, then every message in order', () => {
    const t = recapTranscript(chat, [
      msg(0, 'user', 'Build the login page'),
      msg(1, 'assistant', 'Starting.'),
      msg(2, 'system', 'Finished'),
    ]);
    expect(t).toBe('Task: Build the login page\n[assistant] Starting.\n[system] Finished');
  });

  it('a long chat keeps the task and the latest messages with the outcome, and says what it left out', () => {
    const middle = Array.from({ length: 200 }, (_, i) =>
      msg(i + 1, 'assistant', `step ${i} ${'x'.repeat(500)}`),
    );
    const t = recapTranscript(chat, [
      msg(0, 'user', 'Build the login page'),
      ...middle,
      msg(201, 'assistant', 'The login page works.'),
      msg(202, 'system', 'Finished'),
    ]);
    expect(t.length).toBeLessThan(10_000);
    expect(t.startsWith('Task: Build the login page\n(')).toBe(true);
    expect(t).toMatch(/\(\d+ earlier messages left out\)/);
    expect(t.endsWith('[assistant] The login page works.\n[system] Finished')).toBe(true);
    expect(t).not.toContain('step 0 ');
  });

  it('an older run without saved messages falls back to its result', () => {
    expect(recapTranscript({ ...chat, lastText: 'Done.' }, [])).toBe(
      'Task: Build the login page\n[assistant] Done.',
    );
  });
});
