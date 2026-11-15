// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChecklistItem } from '../../api';
import { TaskCard } from './TaskCard';

const look = { hat: 'none', tool: 'none', body: 'hero', antenna: 'none', face: 'none', hue: 'teal' } as never;
const pete = { id: 'a', name: 'Pete', look };
const ava = { id: 'b', name: 'Ava', look };
const bo = { id: 'c', name: 'Bo', look };
const nameOf = (id: string) => ({ a: 'Pete', b: 'Ava', c: 'Bo' })[id] ?? id;
const item = (o: Partial<ChecklistItem>) =>
  ({
    id: 'i',
    agentId: 'a',
    text: 'Add the login screen',
    status: 'running',
    stage: 'build',
    note: null,
    subtasks: [],
    ...o,
  }) as ChecklistItem;
const card = (o: Partial<ChecklistItem>) =>
  render(
    <ul>
      <TaskCard item={item(o)} nameOf={nameOf} />
    </ul>,
  ).container;

afterEach(cleanup);

describe('TaskCard', () => {
  it('running: avatar + name, no status word while building', () => {
    const c = card({ workingNow: [pete] });
    expect(c.querySelector('.ob-task.m-active')).toBeTruthy();
    expect(c.querySelectorAll('.ob-face svg')).toHaveLength(1);
    expect(c.querySelector('.ob-pn')?.textContent).toBe('Pete');
    expect(c.querySelector('.ob-stage')).toBeNull();
    expect(c.textContent).toContain('In progress, Pete working:');
  });
  it('done: who finished it, tick', () => {
    const c = card({ status: 'done', finishedBy: ava });
    expect(c.querySelector('.m-done .ob-box svg')).toBeTruthy();
    expect(c.querySelector('.ob-pn')?.textContent).toBe('Ava');
  });
  it('failed: the plain message only; raw text behind Details', () => {
    const raw = 'Claude Code exited (1): error_max_turns\n  at run.ts:88';
    const c = card({ status: 'failed', note: raw, problem: { message: 'Ran out of steps.', details: raw } });
    expect(c.querySelector('.ob-problem.bad')?.textContent).toContain('Ran out of steps.');
    expect(c.textContent).not.toContain('error_max_turns');
    expect(c.querySelector('.ob-people')).toBeNull();
    const btn = screen.getByRole('button', { name: 'Details' });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(btn);
    expect(c.querySelector('.ob-raw')?.textContent).toBe(raw);
    expect(screen.getByRole('button', { name: 'Hide details' }).getAttribute('aria-expanded')).toBe('true');
  });
  it('a problem without details has no Details button', () => {
    card({ status: 'cancelled', problem: { message: 'Stopped.' } });
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('team item: 3 faces max, "Ava +3", parts underneath with their own people; no plan line', () => {
    const c = card({
      teamPlan: 'Ava does the form, Bo the API',
      workingNow: [ava, bo, pete, { ...pete, id: 'd', name: 'Dee' }],
      subtasks: [
        item({ id: 's1', agentId: 'b', text: 'Form', workingNow: [ava] }),
        item({ id: 's2', agentId: 'c', text: 'API', status: 'done', finishedBy: bo }),
      ],
    });
    const top = c.querySelector('.ob-tasks, ul > .ob-task') as HTMLElement;
    expect(top.querySelector(':scope > .ob-people .ob-pn')?.textContent).toBe('Ava +3');
    expect(top.querySelectorAll(':scope > .ob-people .ob-face')).toHaveLength(3);
    expect(c.querySelectorAll('.ob-sub > .ob-task')).toHaveLength(2);
    expect(c.textContent).not.toContain('Ava does the form');
  });
});
