// @vitest-environment happy-dom
/* Accessibility of the rebuild confirm card (spec-ux-team-rebuild §3; notes in a11y-team-rebuild.md):
   focus starts on Keep as is, every control has a name, focus never drops to the page after Keep / Rebuild /
   Undo, a voice answer is still announced, and a failed Rebuild keeps focus on the button. */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = { id: string; name: string; role: string };
let wire: { teams: unknown[]; specialists: Row[]; left?: Row[] } = { teams: [], specialists: [] };
const apply = vi.fn();
const undo = vi.fn();
const bringBack = vi.fn();
vi.mock('./api', async (orig) => {
  const real = await orig<typeof import('./api')>();
  return {
    ...real,
    rebuildApi: {
      plan: vi.fn(),
      apply: (...a: unknown[]) => apply(...a),
      undo: (...a: unknown[]) => undo(...a),
      lineup: () => Promise.resolve(structuredClone(wire)),
      bringBack: (...a: unknown[]) => bringBack(...a),
    },
  };
});
vi.mock('../../../characters', () => ({ Hero: () => null }));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RebuildCard as Card } from './api';
import { answerByVoice, RebuildCard, resetRebuildCards } from './RebuildCard';
import { Rearrange } from './Rearrange';

const here = import.meta.dirname; // happy-dom swaps the global URL, so use paths
const themeCss = readFileSync(join(here, '../../../design/theme.css'), 'utf8');
const rebuildCss = readFileSync(join(here, 'rebuild.css'), 'utf8');

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

/* ---------- 'Left this project' + Bring back (Rearrange) ---------- */

/** WCAG relative-luminance contrast of two #rrggbb colours. */
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
/** a colour laid over white at an alpha (e.g. the .rr-bot pill tint) */
const over = (hex: string, alpha: number) =>
  `#${[1, 3, 5]
    .map((i) => Math.round(255 + (Number.parseInt(hex.slice(i, i + 2), 16) - 255) * alpha).toString(16).padStart(2, '0'))
    .join('')}`;
const token = (name: string) => (themeCss.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`)) ?? [])[1] as string;
const rule = (sel: string) => {
  const at = rebuildCss.indexOf(`${sel}{`);
  return at < 0 ? '' : rebuildCss.slice(at, rebuildCss.indexOf('}', at));
};

const TEAMS = [{ id: 't1', name: 'Founders', captainId: 'jony', members: [{ id: 'jony', name: 'Jony', role: 'ui' }] }];
const ELON = { id: 'elon', name: 'Elon Engineer', role: 'dev' };
const CY = { id: 'cy', name: 'Cy Tester', role: 'qa' };
const flushAll = () => act(async () => {});
const openRearrange = async () => {
  render(<Rearrange pid="x" faceOf={() => null} director="Dee" onClose={() => {}} />);
  await flushAll();
};
const leftZone = () => screen.getByRole('region', { name: 'Left this project' });
const backBtn = (who: string) => screen.getByRole('button', { name: `Bring back ${who} as a specialist` });

describe('Bring back — keyboard and screen readers', () => {
  beforeEach(() => {
    wire = { teams: structuredClone(TEAMS), specialists: [], left: [ELON, CY] };
    bringBack.mockReset();
  });
  afterEach(cleanup);

  it('the section is a named region with a heading and a list of who left', async () => {
    await openRearrange();
    const zone = leftZone();
    expect(zone.tagName).toBe('SECTION');
    const h = within(zone).getByRole('heading', { name: 'Left this project' });
    expect(zone.getAttribute('aria-labelledby')).toBe(h.id);
    const items = within(within(zone).getByRole('list')).getAllByRole('listitem');
    expect(items.map((li) => li.querySelector('b')?.textContent)).toEqual(['Elon Engineer', 'Cy Tester']);
  });

  it('each Bring back is a real, focusable button whose name says who', async () => {
    await openRearrange();
    for (const who of ['Elon Engineer', 'Cy Tester']) {
      const b = backBtn(who);
      expect(b.tagName).toBe('BUTTON'); // Enter and Space work natively
      expect(b.getAttribute('type')).toBe('button');
      expect(b.hasAttribute('disabled')).toBe(false); // stays in the Tab order
      expect(b.getAttribute('tabindex')).toBeNull();
      b.focus();
      expect(document.activeElement).toBe(b);
    }
  });

  it('tap targets are at least 44px and the text passes 4.5:1', () => {
    const to = rule('.rr-to');
    expect(to).toMatch(/min-height:44px/);
    expect(to).toMatch(/min-width:44px/);
    expect(rule('.rr-to:focus-visible')).toMatch(/outline:3px solid/); // a visible focus ring
    expect(rule('.rr-bot')).toMatch(/min-height:44px/);
    expect(to).toMatch(/color:var\(--ink\)/);

    const ink = token('ink');
    const soft = token('ink-soft');
    const panel = token('panel');
    const err = (rule('.rb-err').match(/color:(#[0-9a-fA-F]{6})/) ?? [])[1] as string;
    const pill = over(ink, 0.05); // .rr-bot background: rgba(36,26,68,.05) on the white panel
    expect(rule('.rr-bot')).toMatch(/background:rgba\(36,26,68,\.05\)/);
    for (const bg of [panel, pill]) {
      expect(contrast(ink, bg)).toBeGreaterThanOrEqual(4.5); // name + button
      expect(contrast(soft, bg)).toBeGreaterThanOrEqual(4.5); // role
      expect(contrast(err, bg)).toBeGreaterThanOrEqual(4.5); // error
    }
    expect(contrast(ink, panel)).toBeGreaterThanOrEqual(4.5); // the heading
  });

  it('while busy: aria-busy on that button, every Bring back is aria-disabled, and a second press does nothing', async () => {
    let done: (v: unknown) => void = () => {};
    bringBack.mockReturnValue(new Promise((r) => (done = r)));
    await openRearrange();
    const b = backBtn('Elon Engineer');
    b.focus();
    fireEvent.click(b);
    expect(b.getAttribute('aria-busy')).toBe('true');
    expect(b.getAttribute('aria-disabled')).toBe('true');
    expect(backBtn('Cy Tester').getAttribute('aria-disabled')).toBe('true');
    expect(backBtn('Cy Tester').getAttribute('aria-busy')).toBeNull();
    expect(document.activeElement).toBe(b); // focus is not lost while it works
    fireEvent.click(b);
    fireEvent.click(backBtn('Cy Tester'));
    expect(bringBack).toHaveBeenCalledTimes(1);
    await act(async () => done({ ok: false, error: 'Try later.' }));
    expect(b.getAttribute('aria-busy')).toBeNull();
    expect(b.getAttribute('aria-disabled')).toBeNull();
  });

  it('after it works: focus goes to their new row under Solo desks and the status says so (politely)', async () => {
    bringBack.mockImplementation(async () => {
      wire = { ...wire, specialists: [{ ...ELON }], left: [CY] };
      return { ok: true, name: 'Elon Engineer' };
    });
    await openRearrange();
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).not.toBe('assertive'); // role=status is polite
    expect(status.textContent).toBe('');
    backBtn('Elon Engineer').focus();
    fireEvent.click(backBtn('Elon Engineer'));
    await flushAll();
    await flushAll();
    const solo = screen.getByRole('region', { name: 'Solo desks' });
    expect(document.activeElement).toBe(within(solo).getByRole('button', { name: 'Move elon to…' }));
    expect(screen.getByRole('status')).toBe(status); // same live region, already in the page
    expect(status.textContent).toBe('Elon Engineer is back as a specialist');
  });

  it('if their row is not there: focus goes to the "Left this project" heading', async () => {
    bringBack.mockImplementation(async () => {
      wire = { ...wire, left: [CY] }; // not (yet) in the lineup as a specialist
      return { ok: true, name: 'Elon Engineer' };
    });
    await openRearrange();
    fireEvent.click(backBtn('Elon Engineer'));
    await flushAll();
    await flushAll();
    expect(document.activeElement).toBe(within(leftZone()).getByRole('heading', { name: 'Left this project' }));
    expect(screen.getByRole('status').textContent).toBe('Elon Engineer is back as a specialist');
  });

  it('if the section is gone too: focus goes to the Solo desks heading, never the page', async () => {
    wire.left = [ELON];
    bringBack.mockImplementation(async () => {
      wire = { ...wire, left: [] };
      return { ok: true, name: 'Elon Engineer' };
    });
    await openRearrange();
    fireEvent.click(backBtn('Elon Engineer'));
    await flushAll();
    await flushAll();
    expect(screen.queryByRole('region', { name: 'Left this project' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Solo desks' }));
  });

  it('an error is spoken, tied to that row with aria-describedby, and focus stays on the button', async () => {
    bringBack.mockResolvedValue({ ok: false, error: 'Elon Engineer is on a break.' });
    await openRearrange();
    const b = backBtn('Elon Engineer');
    b.focus();
    fireEvent.click(b);
    await flushAll();
    const msg = screen.getByRole('alert');
    expect(msg.textContent).toBe('Elon Engineer is on a break.');
    expect(b.getAttribute('aria-describedby')).toBe(msg.id);
    expect(msg.closest('li')).toBe(b.closest('li'));
    expect(backBtn('Cy Tester').getAttribute('aria-describedby')).toBeNull();
    expect(document.activeElement).toBe(b);

    // trying again clears the old error first
    let done: (v: unknown) => void = () => {};
    bringBack.mockReturnValue(new Promise((r) => (done = r)));
    fireEvent.click(b);
    expect(b.getAttribute('aria-describedby')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    await act(async () => done({ ok: false, error: 'Still busy.' }));
  });
});
