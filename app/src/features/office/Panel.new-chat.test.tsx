// @vitest-environment happy-dom
/* New chat with Pixel (design/new-chat): the pill's states from real running data, the tap (fresh chat,
   draft kept, old chat in History), the server's refusal, a failed start, and the voice path. */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../characters', () => ({ Hero: () => null }));

import { ApiError, clearQueryCache } from '../../api';
import type { RunningItem } from '../running/api';
import { officeApi, type Thread, type ThreadChat, type ThreadMessage } from './api';
import { NEW_CHAT_COPY, Panel, type PanelProps } from './Panel';

const look = { hat: 'none', tool: 'none', body: 'hero', antenna: 'none', face: 'none', hue: 'sun' };
const agents: PanelProps['agents'] = {
  'a-ada': { id: 'a-ada', name: 'Ada Lane', role: 'Orchestrator', look },
  'a-mira': { id: 'a-mira', name: 'Mira Vale', role: 'Builder', look },
};
const line = (id: string, from: string, text: string): ThreadMessage => ({
  id,
  from,
  kind: 'text',
  text,
  runId: null,
  reportId: null,
  at: new Date(Date.now() - 60_000).toISOString(),
});
const thread = (agentId: string): Thread => ({
  projectId: 'p1',
  agentId,
  busy: false,
  messages: [
    line(`${agentId}-1`, 'user', 'Add dark mode'),
    line(`${agentId}-2`, agentId, 'Done — it shipped.'),
  ],
});
const session = (agentId: string | null): RunningItem => ({
  id: `s-${agentId}`,
  kind: 'session',
  projectId: 'p1',
  agentId,
  label: 'work',
  startedAt: new Date().toISOString(),
});
const past: ThreadChat = {
  id: 'c1',
  title: 'Add dark mode',
  lastText: 'Done — it shipped.',
  startedAt: '',
  endedAt: new Date().toISOString(),
  messageCount: 2,
};

let pastChats: ThreadChat[];
beforeEach(() => {
  clearQueryCache();
  pastChats = [];
  vi.spyOn(officeApi, 'thread').mockImplementation((_pid, id) => Promise.resolve(thread(id)));
  vi.spyOn(officeApi, 'threadChats').mockImplementation(() => Promise.resolve(pastChats));
  vi.spyOn(officeApi, 'threadChatMessages').mockResolvedValue(thread('a-ada').messages);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const flush = () => act(async () => {});
const mount = async (over: Partial<PanelProps> = {}) => {
  render(
    <Panel
      pid="p1"
      thread="a-ada"
      director="a-ada"
      agents={agents}
      teamName={() => null}
      actor={undefined}
      asks={[]}
      context={null}
      clearContext={() => {}}
      open={() => {}}
      openReport={() => {}}
      answered={() => {}}
      onGrab={() => {}}
      running={[]}
      {...over}
    />,
  );
  await screen.findByText('Done — it shipped.');
};
const newPill = () => screen.getByTestId('new-chat-pill');
const composer = () => screen.getByRole('textbox', { name: 'Message Ada Lane' }) as HTMLInputElement;

describe('the pill', () => {
  it('shines when nothing runs here and the chat has something to clear', async () => {
    /* the user's app and another project's work never hold it back */
    await mount({
      running: [
        { ...session(null), kind: 'app' },
        { ...session('a-mira'), projectId: 'other' },
      ],
    });
    expect(newPill().getAttribute('aria-label')).toBe('New chat with Ada');
    expect(newPill().className).toContain('is-shining');
    expect(newPill().getAttribute('aria-disabled')).toBeNull();
  });

  it('is dimmed with its reason while an agent works, stays focusable, and a tap does nothing', async () => {
    const start = vi.spyOn(officeApi, 'newChat');
    await mount({ running: [session('a-mira')] });
    expect(newPill().getAttribute('aria-disabled')).toBe('true');
    expect(newPill().getAttribute('aria-label')).toBe(
      'New chat — available when work finishes. 1 agent working',
    );
    expect(screen.getByText('1 agent working').getAttribute('aria-hidden')).toBe('true');
    fireEvent.click(newPill());
    expect(start).not.toHaveBeenCalled();
  });

  it('only in the director’s chat', async () => {
    render(
      <Panel
        pid="p1"
        thread="a-mira"
        director="a-ada"
        agents={agents}
        teamName={() => null}
        actor={undefined}
        asks={[]}
        context={null}
        clearContext={() => {}}
        open={() => {}}
        openReport={() => {}}
        answered={() => {}}
        onGrab={() => {}}
      />,
    );
    await screen.findByText('Done — it shipped.');
    expect(screen.queryByTestId('new-chat-pill')).toBeNull();
  });
});

describe('a tap', () => {
  it('starts a fresh chat: empty log with the new note, focus on the composer, draft kept, old chat in History', async () => {
    const start = vi.spyOn(officeApi, 'newChat').mockResolvedValue(past);
    await mount();
    fireEvent.change(composer(), { target: { value: 'half a thought' } });
    fireEvent.click(newPill());
    await flush();
    expect(start).toHaveBeenCalledWith('p1', 'a-ada');
    expect(screen.queryByText('Done — it shipped.')).toBeNull();
    expect(screen.getByText(NEW_CHAT_COPY.empty('Ada'))).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe(NEW_CHAT_COPY.started);
    expect(document.activeElement).toBe(composer());
    expect(composer().value).toBe('half a thought');
    expect(newPill().className).toContain('is-idle');

    pastChats = [past];
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    fireEvent.click(await screen.findByRole('button', { name: /Add dark mode/ }));
    expect(await screen.findByText('Done — it shipped.')).toBeTruthy();
    expect(screen.getByTestId('past-readonly').textContent).toBe(
      'Past chat. To pick it up, say it in your new chat.',
    );
  });

  it('refused by the server (work started in between): dimmed with the server’s reason, chat untouched', async () => {
    vi.spyOn(officeApi, 'newChat').mockRejectedValue(
      new ApiError(409, 'conflict', '2 agents working', { code: 'work_running', reason: '2 agents working' }),
    );
    await mount();
    fireEvent.click(newPill());
    await flush();
    expect(newPill().getAttribute('aria-label')).toContain('2 agents working');
    expect(screen.getByText('Done — it shipped.')).toBeTruthy();
  });

  it('a failed start says so in the log and shines again without replaying the sweep', async () => {
    vi.spyOn(officeApi, 'newChat').mockRejectedValue(new Error('offline'));
    await mount();
    fireEvent.click(newPill());
    await flush();
    expect(screen.getByText(NEW_CHAT_COPY.failed)).toBeTruthy();
    expect(newPill().className).toContain('is-shining');
    expect(newPill().className).toContain('no-sweep');
  });
});

describe('saying it', () => {
  it('“new chat” while work runs: the director answers with the reason, nothing is cleared', async () => {
    const start = vi.spyOn(officeApi, 'newChat');
    const say = vi.spyOn(officeApi, 'say');
    await mount({ running: [session('a-mira')] });
    fireEvent.change(composer(), { target: { value: 'new chat' } });
    fireEvent.submit(composer());
    await flush();
    expect(start).not.toHaveBeenCalled();
    expect(say).not.toHaveBeenCalled();
    expect(screen.getByText(NEW_CHAT_COPY.blocked('1 agent working'))).toBeTruthy();
    expect(screen.getByText('Done — it shipped.')).toBeTruthy();
  });

  it('“start fresh” when nothing runs: the same action as the pill', async () => {
    const start = vi.spyOn(officeApi, 'newChat').mockResolvedValue(past);
    await mount();
    fireEvent.change(composer(), { target: { value: 'Start fresh' } });
    fireEvent.submit(composer());
    await flush();
    expect(start).toHaveBeenCalled();
    expect(screen.getByText(NEW_CHAT_COPY.empty('Ada'))).toBeTruthy();
  });
});
