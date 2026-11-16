/* "New chat with Pixel": the rule (each block alone, the empty chat) and the flow — a fresh session for the
   next turn, the old chat kept in History, and a refusal while work runs. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { canStartNew, type NewChatInput } from '../../src/office/new-chat.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { scriptedCrew } from '../crew/brain.ts';
import { testApp } from '../helpers.ts';

describe('canStartNew', () => {
  const names: Record<string, string> = { pixel: 'Pixel', mira: 'Mira', bob: 'Bob' };
  const base: NewChatInput = {
    busy: false,
    sessions: [],
    asks: [],
    hasMessages: true,
    directorId: 'pixel',
    nameOf: (id) => names[id] ?? id,
  };
  const reason = (patch: Partial<NewChatInput>) => {
    const v = canStartNew({ ...base, ...patch });
    return v.ok ? null : v.code === 'chat_empty' ? 'empty' : v.reason;
  };

  it('is ok when nothing runs and the chat has messages', () => {
    expect(canStartNew(base)).toEqual({ ok: true });
  });
  it('an empty chat is already new', () => {
    expect(reason({ hasMessages: false })).toBe('empty');
  });
  it('blocks while the director replies (its turn, or its own live session)', () => {
    expect(reason({ busy: true })).toBe('Pixel is replying');
    expect(reason({ sessions: [{ agentId: 'pixel' }] })).toBe('Pixel is replying');
  });
  it('names one agent waiting on the user, counts more', () => {
    expect(reason({ sessions: [{ agentId: 'mira' }], asks: [{ agentId: 'mira' }] })).toBe('Mira needs you');
    expect(reason({ asks: [{ agentId: 'mira' }, { agentId: 'bob' }, { agentId: 'mira' }] })).toBe(
      '2 agents need you',
    );
  });
  it('counts working agents, once each', () => {
    expect(reason({ sessions: [{ agentId: 'mira' }] })).toBe('1 agent working');
    expect(reason({ sessions: [{ agentId: 'mira' }, { agentId: 'bob' }, { agentId: 'bob' }] })).toBe(
      '2 agents working',
    );
  });
  it('studio work with no agent still blocks', () => {
    expect(reason({ sessions: [{ agentId: null }] })).toBe('The studio is working');
  });
  it('the first true row wins: replying, then asks, then working', () => {
    expect(reason({ busy: true, asks: [{ agentId: 'mira' }], sessions: [{ agentId: 'bob' }] })).toBe(
      'Pixel is replying',
    );
    expect(reason({ asks: [{ agentId: 'mira' }], sessions: [{ agentId: 'bob' }] })).toBe('Mira needs you');
  });
});

describe('POST /projects/:id/threads/:agentId/new', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());
  const base = '/projects/aurora/threads/a-pixel';
  const CHAT = 'Studio summary right now: ';
  const isChat = (s: RunSpec) => s.task.startsWith(CHAT);

  function studio(opts: { slow?: RegExp } = {}) {
    const crew = scriptedCrew({ dispatch: [] }, (s) =>
      opts.slow?.test(s.task) ? [{ wait: 400 }, { result: 'Done.' }] : [{ result: `Re: ${s.task.length}` }],
    );
    h = testApp({ seed: true, runner: crew.runner });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    return crew;
  }
  const say = async (text: string, agent = 'a-pixel') => {
    const r = await h.call('POST', `/projects/aurora/threads/${agent}/messages`, { text });
    expect(r.status).toBe(202);
    return r.body.runId as string;
  };

  it('starts a fresh session, keeps the old chat in History, and refuses an empty chat', async () => {
    const crew = studio();
    await h.runtime.settled(await say('Plan the launch'));
    await h.runtime.settled(await say('And then?'));

    const r = await h.call('POST', `${base}/new`);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ title: 'Plan the launch', messageCount: 4 });
    expect((await h.call('GET', `${base}/messages`)).body.messages).toEqual([]);
    expect((await h.call('POST', `${base}/new`)).body.error.details).toEqual({ code: 'chat_empty' });

    await h.runtime.settled(await say('Something new'));
    const chats = crew.calls.filter(isChat);
    expect(chats[1]?.resumeSessionId).toBeTruthy(); // the old chat resumed its session
    expect(chats[2]?.resumeSessionId).toBeUndefined(); // the new chat starts clean…
    expect(chats[2]?.task).not.toContain('This is a fresh session. A short recap'); // …with no recap of the old
    expect(
      (await h.call('GET', `${base}/messages`)).body.messages.map((m: { text: string }) => m.text),
    ).toContain('Something new');

    const list = (await h.call('GET', `${base}/chats`)).body;
    expect(list).toHaveLength(1);
    const old = (await h.call('GET', `${base}/chats/${list[0].id}/messages`)).body;
    expect(old.map((m: { text: string }) => m.text).filter((t: string) => !t.startsWith('Re:'))).toEqual([
      'Plan the launch',
      'And then?',
    ]);
  });

  it('refuses while an agent works (409 with the reason line), and nothing is cleared', async () => {
    studio({ slow: /Ship it/ });
    await h.runtime.settled(await say('Hello'));
    const run = await say('Ship it', 'a-semic');
    const r = await h.call('POST', `${base}/new`);
    expect(r.status).toBe(409);
    expect(r.body.error.details).toEqual({ code: 'work_running', reason: '1 agent working' });
    expect((await h.call('GET', `${base}/messages`)).body.messages).toHaveLength(2);
    await h.runtime.settled(run);
    expect((await h.call('POST', `${base}/new`)).status).toBe(201);
  });

  it('is the director’s only: another agent’s thread is 404', async () => {
    studio();
    expect((await h.call('POST', '/projects/aurora/threads/a-semic/new')).status).toBe(404);
  });
});
