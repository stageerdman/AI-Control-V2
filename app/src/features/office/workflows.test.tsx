// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChecklistItem, Goal, Signoff } from '../../api';
import { QuestBoard } from './QuestBoard';
import { SignoffStrip } from './SignoffStrip';
import { TaskCard } from './TaskCard';
import { WorkflowChip } from './WorkflowChip';

const NOW = new Date('2026-11-17T15:30:00');
const look = { hat: 'none', tool: 'none', body: 'hero', antenna: 'none', face: 'none', hue: 'teal' } as never;
const pete = { id: 'a', name: 'Pete', look };
const ava = { id: 'b', name: 'Ava', look };
const nameOf = (id: string) => ({ a: 'Pete', b: 'Ava' })[id] ?? id;
const who = (id: string) => (id === 'e' ? { name: 'Elon', look } : null);
const item = (o: Partial<ChecklistItem>): ChecklistItem =>
  ({
    id: 'i',
    goalId: 'g',
    agentId: 'a',
    text: 'Step',
    status: 'todo',
    stage: 'build',
    note: null,
    subtasks: [],
    ...o,
  }) as never;
const goal = (o: Partial<Goal>): Goal =>
  ({
    id: 'g',
    text: 'Goal',
    status: 'running',
    items: [],
    pct: 0,
    quest: 'main',
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...o,
  }) as Goal;
const so = (person: typeof pete, state: Signoff['state']): Signoff => ({
  reviewer: person,
  kind: 'review',
  state,
});
const TEMP = { id: 'temp', name: 'Elon leads', temporary: true, lead: 'e', crew: ['e', 'a'] };

afterEach(cleanup);

describe('SignoffStrip', () => {
  it('no reviewer: nothing', () => {
    const { container } = render(<SignoffStrip signoffs={[]} />);
    expect(container.innerHTML).toBe('');
  });
  it('faces with a glyph per state, the words for screen readers, +N past three', () => {
    const { container } = render(
      <SignoffStrip
        signoffs={[so(pete, 'signed'), so(ava, 'sent-back'), so(pete, 'pending'), so(ava, 'pending')]}
      />,
    );
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe(
      'Sign-offs: Pete: signed, Ava: sent it back, Pete: not signed yet, Ava: not signed yet',
    );
    expect(container.querySelectorAll('.so-face')).toHaveLength(3);
    expect(container.querySelector('.s-signed .so-badge')?.textContent).toBe('✓');
    expect(container.querySelector('.s-sent-back .so-badge')?.textContent).toBe('↩');
    expect(container.querySelector('.s-pending .so-badge')).toBeNull();
    expect(container.querySelector('.so-more')?.textContent).toBe('+1');
  });
  it('sits at the right end of a task card, after who has it', () => {
    const { container } = render(
      <ul>
        <TaskCard
          item={item({ status: 'running', workingNow: [pete], signoffs: [so(ava, 'pending')] })}
          nameOf={nameOf}
        />
      </ul>,
    );
    const right = container.querySelector('.ob-task > .ob-right');
    expect(right?.firstElementChild?.className).toBe('ob-people');
    expect(right?.lastElementChild?.className).toBe('so');
  });
});

describe('WorkflowChip', () => {
  it('nothing for the usual way', () => {
    const { container } = render(<WorkflowChip chip={null} />);
    expect(container.innerHTML).toBe('');
  });
  it('plain for another stable workflow', () => {
    const { container } = render(
      <WorkflowChip chip={{ name: 'Hotfix', temporary: false, lead: null, way: 'w2' }} />,
    );
    expect(container.querySelector('.wf-chip.temp')).toBeNull();
    expect(screen.getByText('Way: Hotfix')).toBeTruthy();
  });
  it('dashed with the lead’s face for a temporary one', () => {
    const { container } = render(
      <WorkflowChip chip={{ name: 'Elon leads', temporary: true, lead: 'e', way: 'goal-g' }} who={who} />,
    );
    expect(container.querySelector('.wf-chip.temp .wf-lead svg')).toBeTruthy();
    expect(screen.getByText('Temporary way: Elon leads')).toBeTruthy();
  });
  it('with onOpen it is a button that opens its way', () => {
    const open = vi.fn();
    render(<WorkflowChip chip={{ name: 'Hotfix', temporary: false, lead: null, way: 'w2' }} onOpen={open} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open the way: Hotfix' }));
    expect(open).toHaveBeenCalledWith('w2');
  });
});

describe('Quest Board', () => {
  const board = (goals: Goal[], defaultWorkflowId?: string) =>
    render(
      <QuestBoard
        pid="p"
        dir="Pixel"
        goals={goals}
        features={[]}
        go={vi.fn()}
        nameOf={nameOf}
        who={who}
        defaultWorkflowId={defaultWorkflowId}
        now={NOW}
      />,
    ).container;

  it('a temporary workflow taking over shows on the main card; the switch back hides it', () => {
    const items = [item({ id: 's1', goalId: 'm', status: 'running', workingNow: [pete] })];
    const c = board([goal({ id: 'm', items, workflow: TEMP })], 'w1');
    expect(c.querySelector('.qb-top .wf-chip.temp')?.textContent).toContain('Elon leads');
    cleanup();
    const back = board(
      [goal({ id: 'm', items, workflow: { id: 'w1', name: 'Usual', temporary: false } })],
      'w1',
    );
    expect(back.querySelector('.wf-chip')).toBeNull();
  });

  it('“Signed by” only once the goal is done', () => {
    const items = [item({ id: 's1', goalId: 'm', status: 'done', finishedBy: pete })];
    const running = board([goal({ id: 'm', items, signedBy: [ava] })]);
    expect(running.querySelector('.so-line')).toBeNull();
    cleanup();
    const done = board([goal({ id: 'm', items, status: 'done', signedBy: [ava, pete] })]);
    expect(done.querySelector('.qb-main .so-line')?.textContent).toBe('Signed by Ava, Pete');
  });

  it('a side quest carries its chip on the who row and its signed line', () => {
    const side = goal({
      id: 's',
      quest: 'side',
      text: 'Fix the login',
      status: 'done',
      workflow: TEMP,
      signedBy: [ava],
      items: [item({ id: 'x', goalId: 's', status: 'done', finishedBy: pete })],
    });
    const c = board([side], 'w1');
    expect(c.querySelector('.qb-side .qb-who .wf-chip.temp')).toBeTruthy();
    expect(c.querySelector('.qb-side .so-line')?.textContent).toBe('Signed by Ava');
  });

  it('the chip opens How we work on its way: how/<id> for a stable one, how/goal-<id> for a temporary one', () => {
    const go = vi.fn();
    const hot = { id: 'w2', name: 'Hotfix', temporary: false };
    render(
      <QuestBoard
        pid="p"
        dir="Pixel"
        goals={[
          goal({ id: 'm', workflow: hot }),
          goal({ id: 's', quest: 'side', text: 'Side', workflow: TEMP }),
        ]}
        features={[]}
        go={go}
        nameOf={nameOf}
        who={who}
        defaultWorkflowId="w1"
        now={NOW}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open the way: Hotfix' }));
    expect(go).toHaveBeenLastCalledWith('how', 'w2');
    fireEvent.click(screen.getByRole('button', { name: 'Open the way: Elon leads' }));
    expect(go).toHaveBeenLastCalledWith('how', 'goal-s');
  });
});
