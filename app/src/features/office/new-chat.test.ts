import { describe, expect, it } from 'vitest';
import type { RunningItem } from '../running/api';
import type { ThreadMessage } from './api';
import { asksForNewChat, type NewChatFacts, newChatState } from './new-chat';
import type { RebuildOffer } from './rebuild/api';

const msg = (from: string, extra: Partial<ThreadMessage> = {}): ThreadMessage => ({
  id: `m${Math.random()}`,
  from,
  kind: 'text',
  text: 'hi',
  runId: null,
  reportId: null,
  at: new Date().toISOString(),
  ...extra,
});
const run = (
  agentId: string | null,
  kind: RunningItem['kind'] = 'session',
  projectId = 'p',
): RunningItem => ({
  id: `r${Math.random()}`,
  kind,
  projectId,
  agentId,
  label: '',
  startedAt: '',
});
const NAMES: Record<string, string> = { pixel: 'Pixel', mira: 'Mira', bob: 'Bob' };
const facts = (over: Partial<NewChatFacts> = {}): NewChatFacts => ({
  pid: 'p',
  director: 'pixel',
  busy: false,
  running: [],
  asks: [],
  messages: [msg('user'), msg('pixel')],
  nameOf: (id) => NAMES[id] ?? id,
  settled: () => false,
  ...over,
});
const card = (over: Partial<RebuildOffer> = {}): RebuildOffer =>
  ({ planId: 'plan1', needsConfirm: true, card: { stale: false }, ...over }) as RebuildOffer;

describe('newChatState', () => {
  it('shines when nothing runs and the chat has messages', () => {
    expect(newChatState(facts())).toEqual({ state: 'shining' });
  });
  it('is idle when the chat is already new', () => {
    expect(newChatState(facts({ messages: [] }))).toEqual({ state: 'idle' });
  });
  it('Pixel replying: the thread is busy, or Pixel’s own run is live', () => {
    expect(newChatState(facts({ busy: true }))).toEqual({ state: 'disabled', reason: 'Pixel is replying' });
    expect(newChatState(facts({ running: [run('pixel'), run('mira')] })).reason).toBe('Pixel is replying');
  });
  it('Pixel asking you: “needs you”, not “replying”, though the turn still runs', () => {
    const f = facts({ busy: true, running: [run('pixel')], asks: [{ agentId: 'pixel' }] });
    expect(newChatState(f)).toEqual({ state: 'disabled', reason: 'Pixel needs you' });
  });
  it('an open ask: one agent by name, more by count', () => {
    expect(newChatState(facts({ asks: [{ agentId: 'mira' }, { agentId: 'mira' }] })).reason).toBe(
      'Mira needs you',
    );
    expect(newChatState(facts({ asks: [{ agentId: 'mira' }, { agentId: 'bob' }] })).reason).toBe(
      '2 agents need you',
    );
  });
  it('agents working, counted once each', () => {
    expect(newChatState(facts({ running: [run('mira'), run('mira')] })).reason).toBe('1 agent working');
    expect(newChatState(facts({ running: [run('mira'), run('bob'), run(null)] })).reason).toBe(
      '2 agents working',
    );
  });
  it('studio work with no agent', () => {
    expect(newChatState(facts({ running: [run(null)] })).reason).toBe('The studio is working');
  });
  it('the app, code alone and other projects never block', () => {
    const running = [run(null, 'app'), run('mira', 'code'), run('mira', 'session', 'other')];
    expect(newChatState(facts({ running }))).toEqual({ state: 'shining' });
  });
  it('an unanswered rebuild card blocks until answered, applied, stale or followed by a user line', () => {
    const withCard = [msg('user'), msg('pixel', { rebuild: card() })];
    expect(newChatState(facts({ messages: withCard })).reason).toBe('Answer the card first');
    expect(newChatState(facts({ messages: withCard, settled: (id) => id === 'plan1' })).state).toBe(
      'shining',
    );
    expect(newChatState(facts({ messages: [...withCard, msg('user')] })).state).toBe('shining');
    const applied = [msg('pixel', { rebuild: card({ undoToken: 'u' }) })];
    expect(newChatState(facts({ messages: applied })).state).toBe('shining');
    const stale = [msg('pixel', { rebuild: card({ card: { stale: true } } as Partial<RebuildOffer>) })];
    expect(newChatState(facts({ messages: stale })).state).toBe('shining');
  });
  it('work wins over the card (first true row)', () => {
    const messages = [msg('pixel', { rebuild: card() })];
    expect(newChatState(facts({ messages, running: [run('mira')] })).reason).toBe('1 agent working');
  });
});

describe('asksForNewChat', () => {
  it.each([
    'New chat',
    'new chat with Pixel',
    'Start fresh!',
    'clear the chat',
    'new session',
    "let's start a new chat",
  ])('%s', (t) => expect(asksForNewChat(t)).toBe(true));
  it.each(['new chat button is broken', 'build a chat app', 'clear the cache'])('not: %s', (t) =>
    expect(asksForNewChat(t)).toBe(false),
  );
});
