// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ChecklistItem, studio, type WaitingNote } from '../../api';
import { canStartFresh, notesOf, StartFresh, WaitingNotes } from './TaskTools';

const toast = vi.hoisted(() => vi.fn());
vi.mock('../../ui', async (orig) => ({ ...(await orig<object>()), toast }));

const item = (o: Partial<ChecklistItem>): ChecklistItem =>
  ({ id: 'i', goalId: 'g', agentId: 'a', text: 'Step', status: 'running', subtasks: [], ...o }) as never;
const note = (o: Partial<WaitingNote>): WaitingNote => ({
  runId: 'r',
  agentId: 'a',
  from: 'Uncle Bob',
  text: 'Use the new route.',
  at: '2026-11-23T10:00:00Z',
  ...o,
});
const nameOf = (id: string) => ({ a: 'Pete', b: 'Ava' })[id] ?? id;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  toast.mockReset();
});

describe('notesOf', () => {
  it("keeps the notes for who is on a running task, nobody else's", () => {
    const notes = [note({}), note({ agentId: 'b', at: '2' }), note({ agentId: 'z', at: '3' })];
    expect(notesOf(item({}), notes)).toHaveLength(1);
    expect(notesOf(item({ workingNow: [{ id: 'b' } as never] }), notes).map((n) => n.agentId)).toEqual([
      'a',
      'b',
    ]);
    expect(notesOf(item({ status: 'failed' }), notes)).toEqual([]);
    expect(notesOf(item({}), undefined)).toEqual([]);
  });
});

describe('canStartFresh', () => {
  it('stopped top-level tasks only', () => {
    expect(canStartFresh(item({ status: 'failed' }))).toBe(true);
    expect(canStartFresh(item({ status: 'cancelled' }))).toBe(true);
    expect(canStartFresh(item({ status: 'running' }))).toBe(false);
    expect(canStartFresh(item({ status: 'done' }))).toBe(false);
    expect(canStartFresh(item({ status: 'failed', parentId: 'p' }))).toBe(false);
    expect(canStartFresh(item({ status: 'failed', subtasks: [item({})] }))).toBe(false);
  });
});

describe('WaitingNotes', () => {
  it('nothing waiting: nothing shown', () => {
    const { container } = render(<WaitingNotes pid="p" notes={[]} nameOf={nameOf} />);
    expect(container.textContent).toBe('');
  });
  it('one line; See shows each note; Clear drops them', async () => {
    const clear = vi.spyOn(studio.projects, 'clearNotes').mockResolvedValue({ cleared: 2 });
    const { container } = render(
      <WaitingNotes pid="p" notes={[note({}), note({ at: '2', text: 'And rebase.' })]} nameOf={nameOf} />,
    );
    expect(container.textContent).toContain('2 notes waiting for Pete');
    const see = screen.getByRole('button', { name: 'See' });
    expect(see.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(see);
    expect(container.querySelectorAll('.ob-notelist li')).toHaveLength(2);
    expect(container.textContent).toContain('Uncle Bob Use the new route.');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Cleared 2 notes'));
    expect(clear).toHaveBeenCalledWith('p', 'a');
  });
});

describe('StartFresh', () => {
  it('restarts the task and says where the earlier work is kept', async () => {
    const restart = vi
      .spyOn(studio.projects, 'restartFresh')
      .mockResolvedValue({ goal: {} as never, keptOn: 'studio/x-before-restart-1' });
    render(<StartFresh pid="p" item={item({ status: 'failed' })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start fresh' }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        'Starting fresh from main. Earlier work kept on studio/x-before-restart-1',
      ),
    );
    expect(restart).toHaveBeenCalledWith('p', 'i');
  });
  it('a refusal is said plainly', async () => {
    const { ApiError } = await import('../../api');
    vi.spyOn(studio.projects, 'restartFresh').mockRejectedValue(
      new ApiError(409, 'conflict', 'That task is running — stop it first, then restart it fresh'),
    );
    render(<StartFresh pid="p" item={item({ status: 'failed' })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start fresh' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringMatching(/stop it first/)));
  });
});
