// @vitest-environment happy-dom
/* Drafts in the office chat: what you typed comes back after leaving, a send clears it,
   and a draft never shows in another person's or another project's chat. */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../characters', () => ({ Hero: () => null }));

import { ApiError, clearQueryCache, studio } from '../../api';
import { draftKey, loadDraft, resetDraftsForTests } from '../../ui/drafts';
import { officeApi, type Thread, type ThreadMessage } from './api';
import { Panel, type PanelProps } from './Panel';

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
const thread = (projectId: string, agentId: string): Thread => ({
  projectId,
  agentId,
  busy: false,
  messages: [line(`${agentId}-1`, 'user', 'Hi'), line(`${agentId}-2`, agentId, `Hello from ${agentId}`)],
});

beforeEach(() => {
  localStorage.clear();
  resetDraftsForTests();
  clearQueryCache();
  vi.spyOn(officeApi, 'thread').mockImplementation((pid, id) => Promise.resolve(thread(pid, id)));
  vi.spyOn(officeApi, 'threadChats').mockResolvedValue([]);
  vi.spyOn(officeApi, 'threadChatMessages').mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const flush = () => act(async () => {});
const panel = (pid: string, who: string, asks: PanelProps['asks'] = []) => (
  <Panel
    pid={pid}
    thread={who}
    director="a-ada"
    agents={agents}
    teamName={() => null}
    actor={undefined}
    asks={asks}
    context={null}
    clearContext={() => {}}
    open={() => {}}
    openReport={() => {}}
    answered={() => {}}
    onGrab={() => {}}
    running={[]}
  />
);
const mount = async (pid = 'p1', who = 'a-ada') => {
  const r = render(panel(pid, who));
  await screen.findByText(`Hello from ${who}`);
  return r;
};
const box = (name = 'Ada Lane') =>
  screen.getByRole('textbox', { name: `Message ${name}` }) as HTMLTextAreaElement;
const type = (text: string, name?: string) => fireEvent.change(box(name), { target: { value: text } });

describe('office chat drafts', () => {
  it('come back after the chat closes and opens again', async () => {
    const r = await mount();
    type('half a thought');
    r.unmount();
    await mount();
    expect(box().value).toBe('half a thought');
  });

  it('are cleared by a send', async () => {
    vi.spyOn(officeApi, 'say').mockResolvedValue({ message: line('m3', 'user', 'ship it'), runId: 'r1' });
    const r = await mount();
    type('ship it');
    fireEvent.submit(box());
    await flush();
    expect(box().value).toBe('');
    expect(loadDraft(draftKey('p1', 'a-ada'))).toBe('');
    r.unmount();
    await mount();
    expect(box().value).toBe('');
  });

  it('stay with their own person when you switch chats', async () => {
    const r = await mount();
    type('for Ada only');
    r.rerender(panel('p1', 'a-mira'));
    await screen.findByText('Hello from a-mira');
    expect(box('Mira Vale').value).toBe('');
    r.rerender(panel('p1', 'a-ada'));
    await screen.findByText('Hello from a-ada');
    expect(box().value).toBe('for Ada only');
  });

  it('never show in another project', async () => {
    const r = await mount('p1');
    type('p1 words');
    r.unmount();
    await mount('p2');
    expect(box().value).toBe('');
  });

  it('keep the words when a send fails', async () => {
    vi.spyOn(officeApi, 'say').mockRejectedValue(new Error('offline'));
    await mount();
    type('try again later');
    fireEvent.submit(box());
    await flush();
    expect(box().value).toBe('try again later');
    expect(loadDraft(draftKey('p1', 'a-ada'))).toBe('try again later');
  });

  it('keep the words when a typed answer fails', async () => {
    vi.spyOn(studio.projects, 'answer').mockRejectedValue(new ApiError(500, 'internal', 'Server error'));
    const say = vi.spyOn(officeApi, 'say');
    const ask = { id: 'k1', agentId: 'a-ada', question: 'Which colour?', options: null };
    render(panel('p1', 'a-ada', [ask]));
    await screen.findByText('Hello from a-ada');
    type('teal, please');
    fireEvent.submit(box());
    await flush();
    expect(box().value).toBe('teal, please');
    expect(loadDraft(draftKey('p1', 'a-ada'))).toBe('teal, please');
    expect(say).not.toHaveBeenCalled();
  });
});
