// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, clearQueryCache, type Goal, type Workflow } from '../../api';

vi.mock('../../characters', async (orig) => ({
  ...(await orig<typeof import('../../characters')>()),
  Hero: () => null,
}));

const W1: Workflow = {
  id: 'w1',
  name: 'Usual',
  when: '',
  orchestratorTalksTo: 'captains',
  gates: [{ after: 'a', reviewer: 'b', kind: 'review', why: 'checks it' }],
  maxSendBacks: 2,
  summary: 'Pete builds, Ava checks.',
  inWords: 'Pete starts. Ava signs last.',
  first: 'a',
  layout: { a: { x: 200, y: 300 }, b: { x: 600, y: 300 } },
};
const W2: Workflow = {
  ...W1,
  id: 'w2',
  name: 'Hotfix',
  when: 'urgent fixes',
  inWords: 'Pete fixes it alone.',
};
const BLANK: Workflow = { ...W1, gates: [], first: undefined, layout: undefined, inWords: '' };
const TEMP_GOAL = {
  id: 'g1',
  text: 'Ship the Q4 report',
  status: 'running',
  items: [],
  workflow: { id: 't', name: 'Elon leads', temporary: true, lead: 'a', crew: ['a', 'b'], gates: [] },
} as unknown as Goal;

let workflows: Workflow[] = [W1, W2];
let goals: Goal[] = [];
const api = {
  workflows: vi.fn(async () => ({ workflows, designed: true })),
  saveWorkflows: vi.fn(async (_pid: string, list: Workflow[]) => ({ workflows: list, designed: true })),
  designCollaboration: vi.fn(),
  features: vi.fn(async () => []),
  progress: vi.fn(async () => null),
  timesheet: vi.fn(async () => ({
    tasks: [],
    goals: [],
    features: [],
    estimates: { task: null, goal: null, feature: null },
  })),
};
vi.mock('./api', async (orig) => ({
  ...(await orig<typeof import('./api')>()),
  officeApi: new Proxy({}, { get: (_t, k: string) => (api as Record<string, unknown>)[k] }),
}));
vi.mock('../../api/studio', () => ({ studio: { projects: { work: async () => goals } } }));

const { HowWeWork } = await import('./HowWeWork');
const { Board } = await import('./Board');

const look = { hat: 'none', tool: 'none', body: 'hero', antenna: 'none', face: 'none', hue: 'teal' } as never;
const people = [
  { id: 'a', name: 'Pete', look },
  { id: 'b', name: 'Ava', look },
];
const resolve = { agent: () => null } as never;

function show(id?: string) {
  const go = vi.fn();
  const escapeRef = { current: null as (() => boolean) | null };
  render(
    <HowWeWork pid="p" id={id} dir="Pixel" go={go} escapeRef={escapeRef} resolve={resolve} people={people} />,
  );
  return { go, escapeRef };
}
const canvas = () => document.querySelector('.hw-canvas');
const nudge = () => {
  const node = document.querySelector<HTMLButtonElement>('.fe-node');
  if (!node) throw new Error('no node');
  fireEvent.keyDown(node, { key: 'ArrowRight' });
};

beforeEach(() => {
  clearQueryCache();
  vi.clearAllMocks();
  workflows = [W1, W2];
  goals = [];
});
afterEach(cleanup);

describe('Quest Board: the way in', () => {
  it('a header button with the live thumb opens How we work; its label carries the words; no bottom link', async () => {
    const go = vi.fn();
    render(
      <Board
        pid="p"
        sub="board"
        dir="Pixel"
        go={go}
        escapeRef={{ current: null }}
        onFollowUp={vi.fn()}
        nameOf={(id) => id}
        resolve={resolve}
        people={people}
      />,
    );
    const btn = await screen.findByRole('button', { name: 'How we work: Pete starts. Ava signs last.' });
    expect(btn.closest('.qb-head')).toBeTruthy();
    expect(btn.querySelector('.wt-sm')).toBeTruthy();
    expect(screen.queryByText('How we work →')).toBeNull();
    fireEvent.click(btn);
    expect(go).toHaveBeenCalledWith('how');
  });
});

describe('How we work: the drawing is the page', () => {
  it('opens on the usual way in view mode: kicker, words, no toolbar, nodes not tab stops', async () => {
    show();
    await screen.findByText('Pete starts. Ava signs last.');
    expect(document.querySelector('.hw-kicker')?.textContent).toContain(
      'every goal unless Pixel picks another',
    );
    expect(document.querySelector('.fe-tools')).toBeNull();
    expect(screen.getByRole('img', { name: 'The way, drawn' }).getAttribute('aria-describedby')).toBe(
      'hw-words-p',
    );
    for (const n of document.querySelectorAll('.fe-node')) expect(n.getAttribute('tabindex')).toBe('-1');
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
  });

  it('the list is folded but still in the accessibility tree; the toggle shows it', async () => {
    show();
    await screen.findByText('Pete starts. Ava signs last.');
    expect(screen.getByTestId('fe-arrows-list').className).toBe('sr-only');
    fireEvent.click(screen.getByRole('button', { name: 'Show as a list' }));
    expect(screen.getByTestId('fe-arrows-list').className).toBe('');
  });

  it('an unknown id shows the first way, no error', async () => {
    show('gone');
    await screen.findByText('Pete starts. Ava signs last.');
  });

  it('the Other ways row swaps the canvas, marks aria-current and replaces the URL', async () => {
    const replace = vi.spyOn(history, 'replaceState');
    show();
    await screen.findByText('Pete starts. Ava signs last.');
    const hot = screen.getByRole('button', { name: 'Hotfix' });
    fireEvent.click(hot);
    await screen.findByText('Pete fixes it alone.');
    expect(hot.getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('button', { name: 'Usual' }).getAttribute('aria-current')).toBeNull();
    expect(document.querySelector('.hw-kicker')?.textContent).toContain('Hotfix · for urgent fixes');
    expect(replace).toHaveBeenLastCalledWith(null, '', '#office/p/how/w2');
  });

  it('a temporary way: dashed, its own kicker, no Edit', async () => {
    goals = [TEMP_GOAL];
    show('goal-g1');
    await waitFor(() =>
      expect(document.querySelector('.hw-kicker')?.textContent).toContain('Just for this goal'),
    );
    expect(document.querySelector('.hw-kicker')?.textContent).toContain('ask Pixel to change it');
    expect(canvas()?.classList.contains('temp')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('Edit → in place; Cancel with changes asks; Discard goes back to view', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(document.querySelector('.fe-tools')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Ask Pixel to change how we work…')).toBeNull();
    nudge();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(false),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('This way isn’t saved.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(document.querySelector('.fe-tools')).toBeNull();
  });

  it('Save ok → back to view with Saved ✓', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    nudge();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(false),
    );
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })));
    await screen.findByText('Saved ✓');
    expect(api.saveWorkflows).toHaveBeenCalledTimes(1);
    expect(api.saveWorkflows.mock.calls[0][1].map((w: Workflow) => w.id)).toEqual(['w1', 'w2']);
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
  });

  it('a refused save stays in edit mode', async () => {
    api.saveWorkflows.mockRejectedValueOnce(new ApiError(409, 'conflict', 'Ava can’t sign that.', []));
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    nudge();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(false),
    );
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })));
    await screen.findByText('Ava can’t sign that.');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('nothing drawn: the empty state’s button goes straight into edit', async () => {
    workflows = [BLANK];
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Draw how we work' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(screen.getByText('Start with who picks the work up first.')).toBeTruthy();
    expect(document.querySelector('.hw-row')).toBeNull();
  });

  it('Esc goes back to the Quest Board; Back too', async () => {
    const { go, escapeRef } = show();
    await screen.findByText('Pete starts. Ava signs last.');
    act(() => void escapeRef.current?.());
    expect(go).toHaveBeenLastCalledWith('board');
    fireEvent.click(screen.getByRole('button', { name: 'Back to the Quest Board' }));
    expect(go).toHaveBeenCalledTimes(2);
  });

  it('a load error offers Try again', async () => {
    api.workflows.mockRejectedValueOnce(new Error('down'));
    show();
    await screen.findByText('Couldn’t load how this office works.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Pete starts. Ava signs last.');
  });
});
