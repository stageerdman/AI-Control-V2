// @vitest-environment happy-dom
/* "How this team works" on the team panel (design/workflows/team-way.md): the states table row by row,
   shape saves and redraws, roster changes redraw, Back to the default + Undo, Adjust pre-drawn. */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, clearQueryCache } from '../../api';
import type { Agent, Team, TeamWorkflow } from '../../api/types';
import { Toaster } from '../../ui';
import type { TeamWayView } from './api';

vi.mock('../../characters', async (orig) => ({
  ...(await orig<typeof import('../../characters')>()),
  Hero: () => null,
}));

const DEF: TeamWorkflow = {
  id: 'team',
  name: 'Builders way',
  when: 'everything',
  orchestratorTalksTo: 'captains',
  gates: [],
  maxSendBacks: 2,
  summary: '',
  inWords: 'Ada starts. Ada hands to Elon and Jony. They hand back to Ada. Ada signs last.',
  first: 'ada',
  final: 'ada',
  steps: [
    { from: 'ada', to: 'elon', why: 'their part' },
    { from: 'elon', to: 'ada', why: 'brings it back' },
    { from: 'ada', to: 'jony', why: 'their part' },
    { from: 'jony', to: 'ada', why: 'brings it back' },
  ],
  layout: { ada: { x: 200, y: 300 }, elon: { x: 600, y: 200 }, jony: { x: 600, y: 400 } },
} as TeamWorkflow;
const OWN: TeamWorkflow = {
  ...DEF,
  inWords: 'Ada starts. Ada hands to Elon. Elon signs last.',
  final: 'elon',
  steps: [{ from: 'ada', to: 'elon', why: 'builds it' }],
  layout: { ada: { x: 200, y: 300 }, elon: { x: 600, y: 300 } },
} as TeamWorkflow;

let view: TeamWayView;
const api = {
  workflow: vi.fn(async () => view),
  saveWorkflow: vi.fn(async (_id: string, w: TeamWorkflow | null) => {
    view = w ? { ...view, workflow: w, own: true } : { ...view, workflow: DEF, own: false };
    return view;
  }),
};
vi.mock('./api', async (orig) => {
  const real = await orig<typeof import('./api')>();
  return { ...real, castApi: { ...real.castApi, teams: { ...real.castApi.teams, ...api } } };
});

const { TeamWay } = await import('./TeamWay');

const look = { hat: 'none', tool: 'none', body: 'hero', antenna: 'none', face: 'none', hue: 'teal' } as never;
const agent = (id: string, name: string) => ({ id, name, look, role: 'x' }) as unknown as Agent;
const byId = new Map(
  [agent('ada', 'Ada'), agent('elon', 'Elon'), agent('jony', 'Jony'), agent('ana', 'Ana')].map((a) => [a.id, a]),
);
const team = (members: string[], over: Partial<Team> = {}): Team =>
  ({
    id: 't1',
    name: 'Builders',
    captainId: members[0] ?? null,
    members: members.map((agentId) => ({ agentId, instr: '' })),
    wayShape: 'captain',
    updatedAt: '1',
    ...over,
  }) as Team;

function show(t: Team) {
  const onShape = vi.fn();
  const r = render(
    <>
      <TeamWay team={t} byId={byId} onShape={onShape} />
      <Toaster />
    </>,
  );
  return {
    onShape,
    update: (t2: Team) =>
      r.rerender(
        <>
          <TeamWay team={t2} byId={byId} onShape={onShape} />
          <Toaster />
        </>,
      ),
  };
}
const thumb = () => screen.getByRole('button', { name: /^Adjust how Builders works/ });

beforeEach(() => {
  clearQueryCache();
  vi.clearAllMocks();
  view = { workflow: DEF, own: false, shape: 'captain' };
});
afterEach(cleanup);

describe('How this team works: states', () => {
  it('0 members: nothing', () => {
    const { container } = render(<TeamWay team={team([])} byId={byId} onShape={() => {}} />);
    expect(container.textContent).toBe('');
  });
  it('1 member: one line, no box, no Adjust', () => {
    show(team(['ada']));
    expect(screen.getByText('Add one more and we’ll sketch how they work together.')).toBeTruthy();
    expect(screen.queryByText('Adjust')).toBeNull();
    expect(api.workflow).not.toHaveBeenCalled();
  });
  it('unsaved draft with 2+: asks for a name, loads nothing', () => {
    show(team(['ada', 'elon'], { id: '' }));
    expect(screen.getByText('Name the crew and we’ll sketch how they work together.')).toBeTruthy();
    expect(api.workflow).not.toHaveBeenCalled();
  });
  it('loading: heading + thumb skeleton', () => {
    api.workflow.mockReturnValueOnce(new Promise(() => {}));
    show(team(['ada', 'elon', 'jony']));
    expect(screen.getByText('How this team works')).toBeTruthy();
    expect(screen.getByTestId('wt-skel')).toBeTruthy();
    expect(screen.queryByText('Adjust')).toBeNull();
  });
  it('default: Adjust, shape control, thumb and words; the words are the thumb label', async () => {
    show(team(['ada', 'elon', 'jony']));
    await screen.findByText(DEF.inWords as string);
    expect(screen.getByRole('button', { name: 'Adjust' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Captain checks all' }).getAttribute('aria-checked')).toBe('true');
    expect(thumb().getAttribute('aria-label')).toBe(`Adjust how Builders works: ${DEF.inWords}`);
    expect(document.querySelectorAll('.wt-face')).toHaveLength(3);
    expect(screen.queryByText('Back to the default')).toBeNull();
  });
  it('own way: "Your own way.", Back to the default, no shape control', async () => {
    view = { workflow: OWN, own: true, shape: 'captain' };
    show(team(['ada', 'elon']));
    await screen.findByText('Back to the default');
    expect(screen.getByText(/Your own way\. Ada starts/)).toBeTruthy();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });
  it('own way with a member not on it: "isn’t connected yet" + Connect opens with that card', async () => {
    view = { workflow: OWN, own: true, shape: 'captain' };
    show(team(['ada', 'elon', 'ana']));
    await screen.findByText(/Ana isn’t connected yet/);
    expect(document.querySelectorAll('.wt-ghost')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    const loose = await waitFor(() => {
      const n = document.querySelector('.fe-node.loose');
      if (!n) throw new Error('no loose card');
      return n;
    });
    expect(loose.textContent).toContain('Ana');
  });
  it('load error: one line + Try again', async () => {
    api.workflow.mockRejectedValueOnce(new Error('down'));
    show(team(['ada', 'elon']));
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await screen.findByText(DEF.inWords as string);
  });
});

describe('How this team works: changes', () => {
  it('picking a shape saves it on the team, and the thumb redraws once it lands', async () => {
    const t = team(['ada', 'elon', 'jony']);
    const { onShape, update } = show(t);
    await screen.findByText(DEF.inWords as string);
    fireEvent.click(screen.getByRole('radio', { name: 'Pass it along' }));
    expect(onShape).toHaveBeenCalledWith('chain');
    const chain = { ...DEF, inWords: 'Ada hands to Elon, Elon to Jony, Jony back to Ada.' };
    view = { workflow: chain, own: false, shape: 'chain' };
    update({ ...t, wayShape: 'chain' });
    update({ ...t, wayShape: 'chain', updatedAt: '2' });
    await screen.findByText(chain.inWords);
    expect(screen.getByRole('radio', { name: 'Pass it along' }).getAttribute('aria-checked')).toBe('true');
  });
  it('adding a member redraws the default', async () => {
    const t = team(['ada', 'elon']);
    const { update } = show(t);
    await screen.findByText(DEF.inWords as string);
    const calls = api.workflow.mock.calls.length;
    update(team(['ada', 'elon', 'jony'], { updatedAt: '2' }));
    await waitFor(() => expect(api.workflow.mock.calls.length).toBeGreaterThan(calls));
  });
  it('removing a member from an own way: says how many arrows went', async () => {
    view = {
      workflow: { ...OWN, steps: [...(OWN.steps ?? []), { from: 'elon', to: 'jony', why: 'x' }] },
      own: true,
      shape: 'captain',
    } as TeamWayView;
    const t = team(['ada', 'elon', 'jony']);
    const { update } = show(t);
    await screen.findByText('Back to the default');
    view = { workflow: OWN, own: true, shape: 'captain' };
    update(team(['ada', 'jony']));
    update(team(['ada', 'jony'], { updatedAt: '2' }));
    await screen.findByText('Removed Elon’s 2 arrows.');
  });
  it('an own way emptied by removals goes back to the default and says so', async () => {
    view = { workflow: OWN, own: true, shape: 'captain' };
    const { update } = show(team(['ada', 'elon', 'jony']));
    await screen.findByText('Back to the default');
    view = { workflow: DEF, own: false, shape: 'captain' };
    update(team(['ada', 'jony']));
    update(team(['ada', 'jony'], { updatedAt: '2' }));
    await screen.findByText('Back to the default: nobody was left on your way.');
  });
  it('Back to the default PUTs null; Undo puts the own way back', async () => {
    view = { workflow: OWN, own: true, shape: 'captain' };
    show(team(['ada', 'elon']));
    fireEvent.click(await screen.findByText('Back to the default'));
    await waitFor(() => expect(api.saveWorkflow).toHaveBeenCalledWith('t1', null));
    await screen.findByText(DEF.inWords as string);
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(api.saveWorkflow).toHaveBeenLastCalledWith('t1', OWN));
    await screen.findByText('Back to the default');
  });
  it('a refused save turns the words line into the server’s message', async () => {
    view = { workflow: OWN, own: true, shape: 'captain' };
    api.saveWorkflow.mockRejectedValueOnce(new ApiError(409, 'conflict', 'Elon is busy on another way.'));
    show(team(['ada', 'elon']));
    fireEvent.click(await screen.findByText('Back to the default'));
    expect((await screen.findByRole('alert')).textContent).toBe('Elon is busy on another way.');
  });
  it('Adjust opens pre-drawn with the default; saving makes it your own way', async () => {
    show(team(['ada', 'elon', 'jony']));
    fireEvent.click(await screen.findByRole('button', { name: 'Adjust' }));
    await waitFor(() => expect(document.querySelectorAll('.fe-node')).toHaveLength(3));
    const node = document.querySelector<HTMLButtonElement>('.fe-node');
    if (!node) throw new Error('no node');
    fireEvent.keyDown(node, { key: 'ArrowRight' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    await waitFor(() => expect(api.saveWorkflow).toHaveBeenCalledTimes(1));
    expect(api.saveWorkflow.mock.calls[0]?.[1]?.steps).toHaveLength(4);
    await screen.findByText(/Your own way\./);
  });
});
