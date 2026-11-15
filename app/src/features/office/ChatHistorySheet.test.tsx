// @vitest-environment happy-dom
/* ChatHistorySheet: open a saved chat, read it, keep writing — every state against a fake server
   (the POST is mocked until the server route lands). */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearQueryCache } from '../../api';
import type { ChatMessage, ChatSummary } from './api';
import { CHAT_COPY, ChatHistoryBody, ChatHistorySheet, foldLines } from './ChatHistorySheet';

const RUN = '11111111-1111-4111-8111-111111111111';
const RUN2 = '22222222-2222-4222-8222-222222222222';
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const chat = (p: Partial<ChatSummary> = {}): ChatSummary => ({
  runId: RUN,
  agentId: 'a-pixel',
  projectId: 'aurora',
  task: 'Add a dark mode toggle',
  status: 'succeeded',
  sessionId: 's1',
  startedAt: ago(30),
  endedAt: ago(5),
  messageCount: 4,
  lastText: 'Toggle shipped.',
  ...p,
});
let seq = 0;
const msg = (role: ChatMessage['role'], text: string, runId = RUN): ChatMessage => ({
  id: `m${++seq}`,
  runId,
  projectId: 'aurora',
  agentId: 'a-pixel',
  seq,
  role,
  text,
  meta: null,
  createdAt: ago(10),
});

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
const fail = (status: number, code: string) => json({ error: { code, message: code } }, status);

type Answer<T> = T | 'fail' | 'hang';
let chats: Answer<ChatSummary[]>;
let messages: Record<string, Answer<ChatMessage[]>>;
/** What POST /chats/:runId/messages answers. */
let post: (text: string) => Response | Promise<Response>;
let calls: { method: string; url: string; body?: unknown }[];

const answer = <T,>(a: Answer<T>) =>
  a === 'hang' ? new Promise<Response>(() => {}) : a === 'fail' ? fail(500, 'boom') : json(a);

beforeEach(() => {
  clearQueryCache();
  seq = 0;
  calls = [];
  chats = [chat(), chat({ runId: RUN2, task: 'Fix the login bug', status: 'failed', endedAt: ago(60 * 30) })];
  messages = {
    [RUN]: [
      msg('user', 'Add a dark mode toggle'),
      msg('tool', 'Read src/theme.ts'),
      msg('tool', 'Edit src/theme.ts'),
      msg('system', 'Context trimmed'),
      msg('assistant', 'Toggle shipped. Both **themes** pass.'),
    ],
    [RUN2]: [msg('user', 'Fix the login bug', RUN2), msg('assistant', 'Fixed the redirect.', RUN2)],
  };
  post = (text) =>
    json({
      sent: { ...msg('user', text), meta: { followUp: true } },
      reply: {
        ...msg('assistant', 'It lives in the header, next to your avatar.'),
        meta: { followUp: true },
      },
    });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input).replace(/^https?:\/\/[^/]+/, '');
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url, body });
      if (url.startsWith('/agents/a-pixel/chats?')) return answer(chats);
      const m = url.match(/^\/chats\/([^/]+)\/messages$/);
      if (m && method === 'POST') return post(body.text);
      if (m && messages[m[1]]) return answer(messages[m[1]]);
      return fail(404, 'not_found');
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const openChat = async (c: ChatSummary = chat()) => {
  render(<ChatHistoryBody agentId="a-pixel" name="Pixel" chat={c} />);
  return screen.findByRole('log');
};
const box = () => screen.getByRole('textbox', { name: 'Message Pixel' }) as HTMLTextAreaElement;

describe('foldLines', () => {
  it('folds tool and system lines in a row into one', () => {
    const lines = foldLines(messages[RUN] as ChatMessage[]);
    expect(lines.map((l) => (l.kind === 'tools' ? `tools:${l.lines.length}` : l.m.role))).toEqual([
      'user',
      'tools:3',
      'assistant',
    ]);
  });
});

describe('a chat', () => {
  it('opens straight on the chat it was given: me right, them left, tools folded, one composer', async () => {
    const log = await openChat();
    expect(log.getAttribute('aria-live')).toBe('polite');
    expect(await screen.findByText('Add a dark mode toggle', { selector: '.ch-msg.me' })).toBeTruthy();
    const them = screen.getByText(/Toggle shipped/).closest('.ch-msg');
    expect(them?.className).toContain('them');
    expect(them?.querySelector('strong')?.textContent).toBe('themes');
    const tools = screen.getByText(CHAT_COPY.tools).closest('details');
    expect(tools?.textContent).toContain('3');
    expect(tools?.hasAttribute('open')).toBe(false);
    expect(screen.getByText('Add a dark mode toggle', { selector: '.rc-task-t' })).toBeTruthy();
    expect(screen.getByText('5 min ago')).toBeTruthy();
    expect(box()).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Send' })).toHaveLength(1);
    expect(calls.map((c) => c.url)).toEqual([`/chats/${RUN}/messages`]);
  });

  it('send: my line shows at once, then thinking, then the reply; the box clears', async () => {
    await openChat();
    await screen.findByText(/Toggle shipped/);
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const real = post;
    post = async (t) => {
      await gate;
      return real(t);
    };
    fireEvent.change(box(), { target: { value: '  Where is the toggle?  ' } });
    fireEvent.submit(box().closest('form') as HTMLFormElement);
    expect(screen.getByText('Where is the toggle?', { selector: '.ch-msg.me' })).toBeTruthy();
    expect(screen.getByText('Pixel is thinking')).toBeTruthy();
    expect(box().value).toBe('');
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => release());
    expect(await screen.findByText('It lives in the header, next to your avatar.')).toBeTruthy();
    expect(screen.queryByText('Pixel is thinking')).toBeNull();
    expect(screen.getAllByText('Where is the toggle?')).toHaveLength(1);
    expect(calls.find((c) => c.method === 'POST')).toEqual({
      method: 'POST',
      url: `/chats/${RUN}/messages`,
      body: { text: 'Where is the toggle?' },
    });
  });

  it('Enter sends; Shift+Enter does not', async () => {
    await openChat();
    await screen.findByText(/Toggle shipped/);
    fireEvent.change(box(), { target: { value: 'line one' } });
    fireEvent.keyDown(box(), { key: 'Enter', shiftKey: true });
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(await screen.findByText('It lives in the header, next to your avatar.')).toBeTruthy();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('empty text does not send', async () => {
    await openChat();
    await screen.findByText(/Toggle shipped/);
    fireEvent.change(box(), { target: { value: '   ' } });
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('failure: the text stays in the box, Retry sends it again', async () => {
    await openChat();
    await screen.findByText(/Toggle shipped/);
    const ok = post;
    post = () => fail(502, 'agent_error');
    fireEvent.change(box(), { target: { value: 'Where is the toggle?' } });
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect((await screen.findByRole('alert')).textContent).toContain(CHAT_COPY.sendFailed);
    expect(box().value).toBe('Where is the toggle?');
    expect(screen.queryByText('Where is the toggle?', { selector: '.ch-msg.me' })).toBeNull();
    post = ok;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('It lives in the header, next to your avatar.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(box().value).toBe('');
  });

  it('409 chat_running: says so and hides the composer', async () => {
    await openChat();
    await screen.findByText(/Toggle shipped/);
    post = () => fail(409, 'chat_running');
    fireEvent.change(box(), { target: { value: 'Hi' } });
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect((await screen.findByRole('alert')).textContent).toContain(CHAT_COPY.running);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.getAllByText(CHAT_COPY.working).length).toBeGreaterThan(0);
  });

  it('a running chat: Still working, no composer', async () => {
    await openChat(chat({ status: 'running', endedAt: null }));
    await screen.findByText(/Toggle shipped/);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText(CHAT_COPY.workingNote)).toBeTruthy();
  });

  it('loading, then error with Try again', async () => {
    messages[RUN] = 'hang';
    render(<ChatHistoryBody agentId="a-pixel" name="Pixel" chat={chat()} />);
    expect(screen.getByText(CHAT_COPY.loading)).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    cleanup();
    clearQueryCache();
    messages[RUN] = 'fail';
    render(<ChatHistoryBody agentId="a-pixel" name="Pixel" chat={chat()} />);
    expect((await screen.findByRole('alert')).textContent).toContain(CHAT_COPY.error);
    messages[RUN] = [msg('assistant', 'Back now.')];
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Back now.')).toBeTruthy();
  });

  it('empty chat: says so, can still write', async () => {
    messages[RUN] = [];
    await openChat();
    expect(await screen.findByText(CHAT_COPY.empty)).toBeTruthy();
    expect(box()).toBeTruthy();
  });
});

describe('All chats', () => {
  it('the quiet back link lists their chats (task, when, status); tapping one opens it', async () => {
    await openChat();
    fireEvent.click(screen.getByRole('button', { name: CHAT_COPY.allChats }));
    const row = await screen.findByRole('button', { name: /Fix the login bug/ });
    expect(row.textContent).toContain('Didn’t finish');
    expect(screen.getByRole('button', { name: /Add a dark mode toggle/ }).textContent).toContain('5 min ago');
    fireEvent.click(row);
    expect(await screen.findByText('Fixed the redirect.')).toBeTruthy();
  });

  it('no chat given: starts on the list; empty, loading and error states', async () => {
    chats = [];
    render(<ChatHistoryBody agentId="a-pixel" name="Pixel" chat={null} />);
    expect(screen.getByText(CHAT_COPY.listLoading)).toBeTruthy();
    expect(await screen.findByText(CHAT_COPY.listEmpty)).toBeTruthy();
    cleanup();
    clearQueryCache();
    chats = 'fail';
    render(<ChatHistoryBody agentId="a-pixel" name="Pixel" chat={null} />);
    expect((await screen.findByRole('alert')).textContent).toContain(CHAT_COPY.listError);
    chats = [chat()];
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: /Add a dark mode toggle/ })).toBeTruthy();
  });
});

describe('ChatHistorySheet', () => {
  it('is a labelled dialog; Escape closes it', async () => {
    const onClose = vi.fn();
    render(<ChatHistorySheet agentId="a-pixel" name="Pixel" chat={chat()} open onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'Pixel’s chats' })).toBeTruthy();
    await screen.findByText(/Toggle shipped/);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
