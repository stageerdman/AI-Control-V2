/* History lists every past chat: the server pages (≤ 100), so the client walks back by startedAt. */
import { describe, expect, it } from 'vitest';
import { CHAT_PAGE, type ChatSummary, collectChats } from './api';

const chats = (n: number): ChatSummary[] =>
  Array.from({ length: n }, (_, i) => ({
    runId: `r${i}`,
    agentId: 'a-pixel',
    projectId: 'p',
    task: `task ${i}`,
    status: 'succeeded',
    sessionId: null,
    startedAt: new Date(Date.UTC(2026, 0, 1) - i * 60_000).toISOString(),
    endedAt: null,
    messageCount: 0,
    lastText: null,
  }));

/** A fake server: newest first, `before` exclusive — like server/src/db/chats.ts. */
const serve = (all: ChatSummary[]) => {
  const asked: (string | undefined)[] = [];
  const page = async (before: string | undefined) => {
    asked.push(before);
    return all.filter((c) => !before || c.startedAt < before).slice(0, CHAT_PAGE);
  };
  return { page, asked };
};

describe('collectChats', () => {
  it('returns every chat across pages, newest first, none twice', async () => {
    const all = chats(CHAT_PAGE * 2 + 7);
    const { page, asked } = serve(all);
    expect(await collectChats(page)).toEqual(all);
    expect(asked).toEqual([undefined, all[CHAT_PAGE - 1]?.startedAt, all[CHAT_PAGE * 2 - 1]?.startedAt]);
  });

  it('one request when everything fits in a page', async () => {
    const { page, asked } = serve(chats(3));
    expect(await collectChats(page)).toHaveLength(3);
    expect(asked).toHaveLength(1);
  });

  it('an exact page asks once more and stops on the empty one', async () => {
    const { page, asked } = serve(chats(CHAT_PAGE));
    expect(await collectChats(page)).toHaveLength(CHAT_PAGE);
    expect(asked).toHaveLength(2);
  });
});
