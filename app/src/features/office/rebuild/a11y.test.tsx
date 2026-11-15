// @vitest-environment happy-dom
/* Accessibility of the rebuild confirm card (spec-ux-team-rebuild §3; notes in a11y-team-rebuild.md):
   focus starts on Keep as is, every control has a name, focus never drops to the page after Keep / Rebuild /
   Undo, a voice answer is still announced, and a failed Rebuild keeps focus on the button. */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apply = vi.fn();
const undo = vi.fn();
vi.mock('./api', async (orig) => {
  const real = await orig<typeof import('./api')>();
  return { ...real, rebuildApi: { plan: vi.fn(), apply: (...a: unknown[]) => apply(...a), undo: (...a: unknown[]) => undo(...a) } };
});
vi.mock('../../../characters', () => ({ Hero: () => null }));

import type { RebuildCard as Card } from './api';
import { answerByVoice, RebuildCard, resetRebuildCards } from './RebuildCard';

const card = (over: Partial<Card> = {}): Card => ({
  planId: `p${Math.random()}`,
  projectId: 'x',
  stale: false,
  leaves: [
    {
      kind: 'agent',
      id: 'elon',
      name: 'Elon Engineer',
      running: false,
      openItems: [{ id: 'i1', title: 'Wire the API', to: 'captain', toName: 'Jony' }],
    },
  ],
  specialists: [{ id: 'hum', name: 'Humanitarian' }],
  moves: [{ agentId: 'bob', name: 'Uncle Bob', fromTeam: 'The Founders', toTeam: 'Build' }],
  captains: [
    { teamId: 't1', teamName: 'Design', agentId: 'jony', name: 'Jony', choices: [{ id: 'hr', name: 'HR' }] },
  ],
  ...over,
});
const faceOf = () => null;
const flush = () => act(async () => {});

describe('rebuild card — keyboard and screen readers', () => {
  beforeEach(() => {
    resetRebuildCards();
    apply.mockReset();
    undo.mockReset();
  });
  afterEach(cleanup);

  it('focus starts on Keep as is; the card and every control have a name', () => {
    render(<RebuildCard card={card()} faceOf={faceOf} director="Ada" />);
    expect(screen.getByRole('region', { name: 'Rebuild the team?' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep as is' }));
    expect(screen.getByRole('button', { name: 'Rebuild' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Change where Elon Engineer’s work goes' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Captain of Design' })).toBeTruthy();
  });

  it('a move reads in words, not as an arrow; lists are not named twice', () => {
    const { container } = render(<RebuildCard card={card()} faceOf={faceOf} director="Ada" />);
    const line = screen.getByText('Uncle Bob').closest('li') as HTMLElement;
    /* every text node in reading (document) order, minus what is hidden from screen readers */
    const walk = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    const parts: string[] = [];
    for (let n = walk.nextNode(); n; n = walk.nextNode())
      if (!n.parentElement?.closest('[aria-hidden="true"]')) parts.push(n.textContent ?? '');
    const spoken = parts
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    expect(spoken).toBe('Uncle Bob from The Founders to Build');
    expect(container.querySelector('ul[aria-label]')).toBeNull();
  });

  it('Keep as is: focus moves to the "Kept as is." line instead of dropping to the page', () => {
    render(<RebuildCard card={card()} faceOf={faceOf} director="Ada" />);
    fireEvent.click(screen.getByRole('button', { name: 'Keep as is' }));
    expect(document.activeElement).toBe(screen.getByText('Kept as is.'));
  });

  it('Rebuild then Undo: focus follows to the Done line, and stays there after Undo', async () => {
    apply.mockResolvedValue({ ok: true, undoToken: 'u1', summary: 'Elon left' });
    undo.mockResolvedValue({ ok: true });
    render(<RebuildCard card={card()} faceOf={faceOf} director="Ada" />);
    const go = screen.getByRole('button', { name: 'Rebuild' });
    go.focus();
    fireEvent.click(go);
    await flush();
    const line = screen.getByText('Done — Elon left').closest('p');
    expect(document.activeElement).toBe(line);
    const u = screen.getByRole('button', { name: 'Undo' });
    u.focus();
    fireEvent.click(u);
    await flush();
    expect(document.activeElement).toBe(screen.getByText('Undone — the team is back as it was.'));
  });

  it('while rebuilding the button keeps focus; a failure says why and Try again is still focused', async () => {
    let done: (v: unknown) => void = () => {};
    apply.mockReturnValue(new Promise((r) => (done = r)));
    render(<RebuildCard card={card()} faceOf={faceOf} director="Ada" />);
    const go = screen.getByRole('button', { name: 'Rebuild' });
    go.focus();
    fireEvent.click(go);
    await flush();
    const busy = screen.getByRole('button', { name: 'Rebuilding…' });
    expect(busy.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(busy);
    fireEvent.click(screen.getByRole('button', { name: 'Keep as is' })); // ignored while busy
    expect(screen.queryByText('Kept as is.')).toBeNull();
    await act(async () => done({ ok: false, error: 'The server is busy.' }));
    expect(screen.getByRole('alert').textContent).toBe('The server is busy.');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Try again' }));
  });

  it('a voice "no" (focus elsewhere) is announced in a status region that was already there', () => {
    const { container } = render(
      <>
        <input aria-label="Message" />
        <RebuildCard card={card()} faceOf={faceOf} director="Ada" focus={false} />
      </>,
    );
    const status = container.querySelector('.rb-say') as HTMLElement;
    expect(status.getAttribute('role')).toBe('status');
    expect(status.textContent).toBe('');
    screen.getByRole('textbox', { name: 'Message' }).focus();
    act(() => {
      expect(answerByVoice('no')).toBe(true);
    });
    expect(container.querySelector('.rb-say')).toBe(status);
    expect(status.textContent).toBe('Kept as is.');
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Message' }));
  });

  it('a card going stale while focused moves focus to "Plan changed — ask again"', () => {
    const c = card();
    const { rerender } = render(<RebuildCard card={c} faceOf={faceOf} director="Ada" />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep as is' }));
    rerender(<RebuildCard card={c} faceOf={faceOf} director="Ada" stale />);
    expect(document.activeElement).toBe(screen.getByText('Plan changed — ask again.'));
  });
});
