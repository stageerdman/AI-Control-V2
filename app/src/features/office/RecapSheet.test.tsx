// @vitest-environment happy-dom
/* RecapSheet: tap an agent → what they did. Every state against a fake server. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearQueryCache } from '../../api';
import type { ChatSummary, Recap } from './api';
import { RECAP_COPY, RecapBody, RecapSheet } from './RecapSheet';

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const chat = (p: Partial<ChatSummary> = {}): ChatSummary => ({
  runId: '11111111-1111-4111-8111-111111111111',
  agentId: 'a-pixel',
  projectId: 'aurora',
  task: 'Add a dark mode toggle',
  status: 'succeeded',
  sessionId: 's1',
  startedAt: ago(30),
  endedAt: ago(5),
  messageCount: 12,
  lastText: 'Toggle shipped.',
  ...p,
});

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
const RECAP = '/projects/aurora/agents/a-pixel/recap';
/** What the server answers for Pixel's recap in Aurora: a Recap, 'fail' or 'hang'. */
let answer: Recap | 'fail' | 'hang';
let calls: string[];

beforeEach(() => {
  clearQueryCache();
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = String(input).replace(/^https?:\/\/[^/]+/, '');
      calls.push(url);
      if (url === '/projects/atlas/agents/a-pixel/recap') return json({ recap: null, chat: null, cached: false });
      if (url === RECAP) {
        if (answer === 'hang') return new Promise<Response>(() => {});
        if (answer === 'fail') return json({ error: { code: 'agent_error', message: 'boom' } }, 500);
        return json(answer);
      }
      return json({ error: { code: 'not_found', message: url } }, 404);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('RecapBody', () => {
  it('loading: thinking back, busy, no action yet', () => {
    answer = 'hang';
    render(<RecapBody pid="aurora" agentId="a-pixel" name="Pixel" onOpenChat={() => {}} />);
    expect(screen.getByText(RECAP_COPY.loading)).toBeTruthy();
    expect(screen.getByText(RECAP_COPY.loading).closest('[aria-live]')?.getAttribute('aria-busy')).toBe(
      'true',
    );
    expect(screen.queryByRole('button', { name: 'Open chat' })).toBeNull();
  });

  it('recap: name, task line, their words (announced politely), Open chat hands over the chat', async () => {
    answer = { recap: 'I added the toggle and tested both themes.', chat: chat(), cached: false };
    const onOpenChat = vi.fn();
    render(<RecapBody pid="aurora" agentId="a-pixel" name="Pixel" onOpenChat={onOpenChat} />);
    const words = await screen.findByText('I added the toggle and tested both themes.');
    expect(words.closest('[aria-live="polite"]')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Pixel' })).toBeTruthy();
    expect(screen.getByText('Add a dark mode toggle')).toBeTruthy();
    expect(screen.getByText('5 min ago')).toBeTruthy();
    expect(screen.queryByText(RECAP_COPY.working)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open chat' }));
    expect(onOpenChat).toHaveBeenCalledWith(expect.objectContaining({ runId: chat().runId }));
  });

  it('no chat yet: says so in their voice', async () => {
    answer = { recap: null, chat: null, cached: false };
    render(<RecapBody pid="aurora" agentId="a-pixel" name="Pixel" />);
    expect(await screen.findByText(RECAP_COPY.empty)).toBeTruthy();
  });

  it('still working: the recap with a quiet tag', async () => {
    answer = {
      recap: 'Halfway: the toggle works, themes next.',
      chat: chat({ status: 'running', endedAt: null }),
      cached: true,
    };
    render(<RecapBody pid="aurora" agentId="a-pixel" name="Pixel" />);
    expect(await screen.findByText('Halfway: the toggle works, themes next.')).toBeTruthy();
    expect(screen.getByText(RECAP_COPY.working)).toBeTruthy();
  });

  it('error: couldn’t remember, Try again reads again', async () => {
    answer = 'fail';
    render(<RecapBody pid="aurora" agentId="a-pixel" name="Pixel" onOpenChat={() => {}} />);
    expect((await screen.findByRole('alert')).textContent).toContain(RECAP_COPY.error);
    expect(screen.queryByRole('button', { name: 'Open chat' })).toBeNull();
    answer = { recap: 'Back now.', chat: chat(), cached: false };
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Back now.')).toBeTruthy();
  });

  it('no Open chat when there is nowhere to open it', async () => {
    answer = { recap: 'Done.', chat: chat(), cached: false };
    render(<RecapBody pid="aurora" agentId="a-pixel" name="Pixel" />);
    await screen.findByText('Done.');
    expect(screen.queryByRole('button', { name: 'Open chat' })).toBeNull();
  });

  it('reads /recap only (no fallback)', async () => {
    answer = { recap: 'Done.', chat: chat(), cached: true };
    render(<RecapBody pid="aurora" agentId="a-pixel" name="Pixel" />);
    await screen.findByText('Done.');
    expect(calls).toEqual([RECAP]);
  });

  it("in another project: asks about that project's work only, never shows this one's", async () => {
    answer = { recap: 'I added the toggle.', chat: chat(), cached: false };
    render(<RecapBody pid="aurora" agentId="a-pixel" name="Pixel" />);
    await screen.findByText('I added the toggle.');
    cleanup();
    render(<RecapBody pid="atlas" agentId="a-pixel" name="Pixel" />);
    expect(await screen.findByText(RECAP_COPY.empty)).toBeTruthy();
    expect(screen.queryByText('I added the toggle.')).toBeNull();
    expect(calls).toEqual([RECAP, '/projects/atlas/agents/a-pixel/recap']);
  });
});

describe('RecapSheet', () => {
  it('is a labelled dialog; Escape closes it', async () => {
    answer = { recap: 'Done.', chat: chat(), cached: false };
    const onClose = vi.fn();
    render(<RecapSheet pid="aurora" agentId="a-pixel" name="Pixel" open onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'What Pixel did' })).toBeTruthy();
    await screen.findByText('Done.');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
