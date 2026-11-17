// @vitest-environment happy-dom
/* An open question in the chat panel (STUCK ANSWERS, reload check): after a reload the office passes the
   open asks in, so the card shows with its options; the turn behind it is still busy on the server, but it
   waits for you — no "typing" dots under the question. Answering lets the dots come back (it carries on). */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../characters', () => ({ Hero: () => null }));

import { clearQueryCache, studio } from '../../api';
import { officeApi, type Thread } from './api';
import { Panel, type PanelProps } from './Panel';

const look = { hat: 'none', tool: 'none', body: 'hero', antenna: 'none', face: 'none', hue: 'sun' };
const agents: PanelProps['agents'] = {
  'a-ada': { id: 'a-ada', name: 'Ada Lane', role: 'Orchestrator', look },
  'a-mira': { id: 'a-mira', name: 'Mira Vale', role: 'Builder', look },
};
const busy: Thread = {
  projectId: 'p1',
  agentId: 'a-mira',
  busy: true,
  messages: [
    {
      id: 'm1',
      from: 'user',
      kind: 'text',
      text: 'Fix the reload bug',
      runId: 'r1',
      reportId: null,
      at: new Date().toISOString(),
    },
  ],
};
const ask = {
  id: 'k1',
  agentId: 'a-mira',
  question: 'Reload the app — did the fix work?',
  options: ['Yes', 'No'],
  runId: 'r1',
} as PanelProps['asks'][number];

const props = (over: Partial<PanelProps> = {}): PanelProps => ({
  pid: 'p1',
  thread: 'a-mira',
  director: 'a-ada',
  agents,
  teamName: () => null,
  actor: undefined,
  asks: [],
  context: null,
  clearContext: () => {},
  open: () => {},
  openReport: () => {},
  answered: () => {},
  onGrab: () => {},
  ...over,
});
const typing = () => document.querySelector('.op-log .typing');

beforeEach(() => {
  clearQueryCache();
  vi.spyOn(officeApi, 'thread').mockResolvedValue(structuredClone(busy));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('an open question in the chat', () => {
  it('shows with its options and no typing dots while it waits for you', async () => {
    render(<Panel {...props({ asks: [ask] })} />);
    await screen.findByText('Fix the reload bug');
    const card = screen.getByRole('group', { name: /Mira Vale is asking: Reload the app/ });
    expect(screen.getAllByRole('button', { name: /^(Yes|No)$/ }).map((b) => b.textContent)).toEqual([
      'Yes',
      'No',
    ]);
    expect(card).toBeTruthy();
    expect(typing()).toBeNull();
  });

  it('a busy turn with no open question still types', async () => {
    render(<Panel {...props()} />);
    await screen.findByText('Fix the reload bug');
    expect(typing()).not.toBeNull();
  });

  it('answering shows the answer and the dots come back (the agent carries on)', async () => {
    const send = vi.spyOn(studio.projects, 'answer').mockResolvedValue({} as never);
    render(<Panel {...props({ asks: [ask] })} />);
    await screen.findByText('Fix the reload bug');
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    await waitFor(() => expect(screen.getByText('✓ Yes')).toBeTruthy());
    expect(send).toHaveBeenCalledWith('p1', 'k1', 'Yes');
    expect(typing()).not.toBeNull();
  });
});
