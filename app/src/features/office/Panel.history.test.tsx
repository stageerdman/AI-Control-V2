// @vitest-environment happy-dom
/* History in the chat panel (spec-ux-chat-history): every state of the History view, keyboard and
   focus, and the §5 checklist (names, list structure, 44px targets, AA contrast). The server is
   `officeApi` mocked per test: a list of chats, [] (empty), a request that never answers (loading),
   and an error. Manual checks still needed: a real screen reader pass and a zoomed / narrow drawer. */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../characters', () => ({ Hero: () => null }));

import { clearQueryCache, setQueryData } from '../../api';
import { type ChatMessage, type ChatSummary, keys, officeApi, type Thread } from './api';
import { CHAT_COPY } from './ChatHistorySheet';
import { Panel, type PanelProps } from './Panel';

const here = import.meta.dirname; // happy-dom swaps the global URL, so use paths
const themeCss = readFileSync(join(here, '../../design/theme.css'), 'utf8');
const historyCss = readFileSync(join(here, 'chat-history.css'), 'utf8');
const officeCss = readFileSync(join(here, 'office.css'), 'utf8');
const protoCss = readFileSync(join(here, '../../design/prototype.css'), 'utf8');

/* ---------- fixtures */

const look = { hat: 'none', tool: 'none', body: 'hero', antenna: 'none', face: 'none', hue: 'sun' };
const agents: PanelProps['agents'] = {
  'a-ada': { id: 'a-ada', name: 'Ada Lane', role: 'Orchestrator', look },
  'a-mira': { id: 'a-mira', name: 'Mira Vale', role: 'Builder', look },
  'a-bo': { id: 'a-bo', name: 'Bo Reed', role: 'Design', look },
};
const RUN1 = '11111111-1111-4111-8111-111111111111';
const RUN2 = '22222222-2222-4222-8222-222222222222';
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const run = (p: Partial<ChatSummary> = {}): ChatSummary => ({
  runId: RUN1,
  agentId: 'a-mira',
  projectId: 'p1',
  task: 'Fix the signup form',
  status: 'succeeded',
  sessionId: 's1',
  startedAt: ago(40),
  endedAt: ago(5),
  messageCount: 3,
  lastText: 'I moved the **check** to the server.',
  ...p,
});
const thread = (agentId: string, text = 'Sure, on it — the form is next.'): Thread => ({
  projectId: 'p1',
  agentId,
  busy: false,
  messages: [
    { id: `${agentId}-1`, from: agentId, kind: 'text', text, runId: null, reportId: null, at: ago(2) },
  ],
});
const lines = (runId: string): ChatMessage[] => [
  {
    id: `${runId}-u`,
    runId,
    projectId: 'p1',
    agentId: 'a-mira',
    seq: 1,
    role: 'user',
    text: 'Fix it',
    meta: null,
    createdAt: ago(30),
  },
  {
    id: `${runId}-a`,
    runId,
    projectId: 'p1',
    agentId: 'a-mira',
    seq: 2,
    role: 'assistant',
    text: 'Fixed.',
    meta: null,
    createdAt: ago(29),
  },
];

type Chats = ChatSummary[] | 'hang' | 'fail';
let chats: Record<string, Chats>;
const answer = (c: Chats) =>
  c === 'hang'
    ? new Promise<ChatSummary[]>(() => {})
    : c === 'fail'
      ? Promise.reject(new Error('boom'))
      : Promise.resolve(structuredClone(c));

beforeEach(() => {
  clearQueryCache();
  chats = {
    'a-mira': [
      run(),
      run({
        runId: RUN2,
        task: 'Add dark mode',
        status: 'cancelled',
        endedAt: ago(60 * 26),
        lastText: 'Paused before the toggle.',
      }),
    ],
    'a-ada': [],
    'a-bo': [],
  };
  vi.spyOn(officeApi, 'thread').mockImplementation((_pid, id) => Promise.resolve(thread(id)));
  vi.spyOn(officeApi, 'listAgentChats').mockImplementation((_pid, id) => answer(chats[id] ?? []));
  vi.spyOn(officeApi, 'getChatMessages').mockImplementation((_pid, id) => Promise.resolve(lines(id)));
  /* the director's History lists its past chats (design/new-chat), not its runs */
  vi.spyOn(officeApi, 'threadChats').mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const props = (over: Partial<PanelProps> = {}): PanelProps => ({
  pid: 'p1',
  thread: 'a-mira',
  director: 'a-ada',
  agents,
  teamName: () => 'The Founders',
  actor: undefined,
  asks: [],
  context: null,
  clearContext: () => {},
  open: vi.fn(),
  openReport: () => {},
  answered: () => {},
  onGrab: () => {},
  ...over,
});
const flush = () => act(async () => {});
const mount = async (over: Partial<PanelProps> = {}) => {
  const r = render(<Panel {...props(over)} />);
  await screen.findByText(/Sure, on it/);
  return r;
};
const pill = () => screen.getByRole('button', { name: 'History' });
const openHistory = async () => {
  fireEvent.click(pill());
  await flush();
  return screen.getByTestId('history-nav');
};
const pastRow = (task: RegExp) => screen.findByRole('button', { name: task });
const esc = (el: Element = document.activeElement ?? document.body) =>
  fireEvent.keyDown(el, { key: 'Escape' });
const isLive = () => !!screen.queryByRole('textbox', { name: /^Message / });

/* ---------- the pill */

describe('History pill', () => {
  it('is a plain button named History, for another agent; the ← director pill sits with it', async () => {
    await mount();
    const b = pill();
    expect(b.tagName).toBe('BUTTON');
    expect(b.getAttribute('type')).toBe('button');
    expect(b).toBe(screen.getByTestId('history-pill'));
    /* navigation, not a toggle: no expanded / pressed state */
    expect(b.hasAttribute('aria-expanded')).toBe(false);
    expect(b.hasAttribute('aria-pressed')).toBe(false);
    /* the clock is decoration */
    expect(b.querySelector('[aria-hidden="true"]')?.textContent).toContain('🕘');
    expect(screen.getByRole('button', { name: 'Back to Ada' })).toBeTruthy();
  });

  it('shows for the director too (History only, no back pill)', async () => {
    await mount({ thread: 'a-ada' });
    expect(pill().tagName).toBe('BUTTON');
    expect(screen.queryByRole('button', { name: /^Back to / })).toBeNull();
  });

  it('live view is unchanged: the log and the Message composer, no history nav', async () => {
    await mount();
    expect(screen.getByRole('log')).toBeTruthy();
    expect(isLive()).toBe(true);
    expect(screen.queryByTestId('history-nav')).toBeNull();
  });
});

/* ---------- the list */

describe('History list (a list of chats)', () => {
  it('opening History moves focus to the first row (Current chat)', async () => {
    await mount();
    await openHistory();
    expect(document.activeElement).toBe(screen.getByTestId('history-current'));
    expect(isLive()).toBe(false);
  });

  it("lists this project's chats only: it asks with the panel's project", async () => {
    await mount();
    await openHistory();
    expect(officeApi.listAgentChats).toHaveBeenCalledWith('p1', 'a-mira');
  });

  it('rows are buttons in a <ul>; day groups are <h3>; newest first', async () => {
    await mount();
    await openHistory();
    await pastRow(/Fix the signup form/);
    const list = screen.getByTestId('history-current').closest('ul') as HTMLElement;
    expect(list.tagName).toBe('UL');
    const rows = within(list).getAllByRole('button');
    expect(rows.map((r) => r.tagName)).toEqual(['BUTTON', 'BUTTON', 'BUTTON']);
    for (const r of rows) expect(r.closest('li')?.parentElement).toBe(list);
    const days = within(list).getAllByRole('heading', { level: 3 });
    expect(days.map((h) => h.textContent)).toEqual(['Today', 'Yesterday']);
    /* the day label's <li> is not counted as a list item */
    for (const h of days) expect(h.closest('li')?.getAttribute('role')).toBe('presentation');
    expect(rows[1].textContent).toContain('Fix the signup form');
    expect(rows[2].textContent).toContain('Add dark mode');
  });

  it('row names read task + preview (plain text) + when + status', async () => {
    await mount();
    await openHistory();
    const row = await pastRow(/Add dark mode/);
    expect(row.textContent).toContain('Paused before the toggle.');
    expect(row.textContent).toContain('Stopped');
    const first = await pastRow(/Fix the signup form/);
    expect(first.textContent).toContain('I moved the check to the server.');
    expect(first.textContent).not.toContain('**');
    /* Current chat: a Now tag and the live line as preview */
    const cur = screen.getByTestId('history-current');
    expect(cur.textContent).toContain(CHAT_COPY.now);
    expect(cur.textContent).toContain(CHAT_COPY.current);
    expect(cur.textContent).toContain('Sure, on it');
  });

  it('a pending ask shows ❗ Needs you on the Current chat row', async () => {
    await mount({
      asks: [
        {
          id: 'k1',
          agentId: 'a-mira',
          question: 'Which form?',
          options: ['A', 'B'],
        } as PanelProps['asks'][number],
      ],
    });
    await openHistory();
    expect(screen.getByTestId('history-current').textContent).toContain(CHAT_COPY.needsYou);
  });

  it('the nav is a named landmark with Back to chat', async () => {
    await mount();
    const nav = await openHistory();
    expect(nav.tagName).toBe('NAV');
    expect(screen.getByRole('navigation', { name: 'Mira Vale’s history' })).toBe(nav);
    expect(within(nav).getByRole('button', { name: CHAT_COPY.backToChat })).toBe(
      screen.getByTestId('back-to-chat'),
    );
  });
});

/* ---------- a past chat */

describe('Past chat', () => {
  it('clicking a row opens it; the composer says Continue this chat…; it gets focus', async () => {
    await mount();
    await openHistory();
    fireEvent.click(await pastRow(/Fix the signup form/));
    await screen.findByText('Fixed.');
    const box = screen.getByRole('textbox', { name: 'Continue this chat with Mira Vale' });
    expect(box.getAttribute('placeholder')).toBe('Continue this chat…');
    expect(screen.getByText(CHAT_COPY.pastDivider)).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(box));
    /* two ways out, both named */
    const nav = screen.getByTestId('history-nav');
    expect(within(nav).getByRole('button', { name: 'History' })).toBeTruthy();
    expect(within(nav).getByRole('button', { name: CHAT_COPY.backToChat })).toBe(
      screen.getByTestId('back-to-chat'),
    );
  });
});

/* ---------- ways home */

describe('Back to the live chat', () => {
  it('Back to chat (from the list) returns to live and focuses the History pill', async () => {
    await mount();
    await openHistory();
    fireEvent.click(screen.getByTestId('back-to-chat'));
    await flush();
    expect(isLive()).toBe(true);
    expect(document.activeElement).toBe(pill());
  });

  it('a trip to History keeps the live chat’s drafts (ask answer, composer)', async () => {
    await mount({
      asks: [{ id: 'k2', agentId: 'a-mira', question: 'Which form?' } as PanelProps['asks'][number]],
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Your answer' }), {
      target: { value: 'The signup one' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Message Mira Vale' }), {
      target: { value: 'half a thought' },
    });
    await openHistory();
    fireEvent.click(await pastRow(/Fix the signup form/));
    await screen.findByText('Fixed.');
    fireEvent.click(screen.getByTestId('back-to-chat'));
    await flush();
    expect(isLive()).toBe(true);
    expect((screen.getByRole('textbox', { name: 'Your answer' }) as HTMLInputElement).value).toBe(
      'The signup one',
    );
    expect((screen.getByRole('textbox', { name: 'Message Mira Vale' }) as HTMLInputElement).value).toBe(
      'half a thought',
    );
  });

  it('the Current chat row returns to live and focuses the History pill', async () => {
    await mount();
    await openHistory();
    fireEvent.click(screen.getByTestId('history-current'));
    await flush();
    expect(isLive()).toBe(true);
    expect(document.activeElement).toBe(pill());
  });

  it('Back to chat (from a past chat) returns to live', async () => {
    await mount();
    await openHistory();
    fireEvent.click(await pastRow(/Fix the signup form/));
    await screen.findByText('Fixed.');
    fireEvent.click(screen.getByTestId('back-to-chat'));
    await flush();
    expect(isLive()).toBe(true);
    expect(document.activeElement).toBe(pill());
  });

  it('‹ History (from a past chat) returns to the list with focus on the row you opened', async () => {
    await mount();
    await openHistory();
    fireEvent.click(await pastRow(/Add dark mode/));
    await screen.findByText('Fixed.');
    fireEvent.click(within(screen.getByTestId('history-nav')).getByRole('button', { name: 'History' }));
    await flush();
    expect(document.activeElement).toBe(await pastRow(/Add dark mode/));
  });
});

/* ---------- Esc */

describe('Esc steps back one level', () => {
  it('past chat → history (focus on that row) → live (focus on the pill)', async () => {
    await mount();
    await openHistory();
    fireEvent.click(await pastRow(/Add dark mode/));
    const box = await screen.findByRole('textbox', { name: 'Continue this chat with Mira Vale' });
    esc(box);
    await flush();
    expect(screen.queryByRole('textbox')).toBeNull();
    const row = await pastRow(/Add dark mode/);
    expect(document.activeElement).toBe(row);
    esc(row);
    await flush();
    expect(isLive()).toBe(true);
    expect(document.activeElement).toBe(pill());
  });

  it('Esc in a past chat with a draft keeps you there (no lost text)', async () => {
    await mount();
    await openHistory();
    fireEvent.click(await pastRow(/Fix the signup form/));
    const box = await screen.findByRole('textbox', { name: 'Continue this chat with Mira Vale' });
    fireEvent.change(box, { target: { value: 'One more thing' } });
    esc(box);
    await flush();
    expect(screen.getByRole('textbox', { name: 'Continue this chat with Mira Vale' })).toBe(box);
  });

  it('Esc in history does not leak to the live composer’s “back to director”', async () => {
    const open = vi.fn();
    await mount({ open });
    await openHistory();
    esc();
    await flush();
    expect(isLive()).toBe(true);
    expect(open).not.toHaveBeenCalled();
  });
});

/* ---------- agent change */

describe('switching agent', () => {
  it('resets the view to live (from the list and from a past chat)', async () => {
    const { rerender } = await mount();
    await openHistory();
    rerender(<Panel {...props({ thread: 'a-bo' })} />);
    await screen.findByText(/Sure, on it/);
    expect(isLive()).toBe(true);
    expect(screen.queryByTestId('history-nav')).toBeNull();

    rerender(<Panel {...props({ thread: 'a-mira' })} />);
    await openHistory();
    fireEvent.click(await pastRow(/Fix the signup form/));
    await screen.findByText('Fixed.');
    rerender(<Panel {...props({ thread: 'a-bo' })} />);
    await flush();
    expect(isLive()).toBe(true);
    expect(screen.getByRole('textbox', { name: 'Message Bo Reed' })).toBeTruthy();
    /* and back again: Mira opens live too, not on her old past chat */
    rerender(<Panel {...props({ thread: 'a-mira' })} />);
    await flush();
    expect(isLive()).toBe(true);
  });

  it('A → B → A from History: A is live, nothing is announced, focus is not moved', async () => {
    const { rerender } = await mount();
    await openHistory();
    rerender(<Panel {...props({ thread: 'a-bo' })} />);
    await screen.findByText(/Sure, on it/);
    /* the user clicked a robot: focus lives outside the panel */
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    rerender(<Panel {...props({ thread: 'a-mira' })} />);
    await flush();
    expect(isLive()).toBe(true);
    expect(screen.queryByTestId('history-nav')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('');
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});

/* ---------- empty, loading, error */

describe('list states', () => {
  it('empty: No past chats with <name> yet, a way home, Current chat still first', async () => {
    chats['a-mira'] = [];
    await mount();
    await openHistory();
    const empty = await screen.findByTestId('history-empty');
    expect(within(empty).getByText('No past chats with Mira yet')).toBeTruthy();
    expect(within(empty).getByText(CHAT_COPY.emptyBody)).toBeTruthy();
    expect(empty.querySelector('[aria-hidden="true"]')?.textContent).toContain('🕘');
    expect(document.activeElement).toBe(screen.getByTestId('history-current'));
    fireEvent.click(within(empty).getByRole('button', { name: CHAT_COPY.backToChat }));
    await flush();
    expect(isLive()).toBe(true);
    expect(document.activeElement).toBe(pill());
  });

  it('empty for the director uses their short name', async () => {
    await mount({ thread: 'a-ada' });
    await openHistory();
    expect(await screen.findByText('No past chats with Ada yet')).toBeTruthy();
    expect(screen.getByText('Start a new chat and this one shows up here.')).toBeTruthy();
  });

  it('loading: Finding their chats…, marked busy, Current chat still reachable', async () => {
    chats['a-mira'] = 'hang';
    await mount();
    await openHistory();
    expect(screen.getByText(CHAT_COPY.listLoading)).toBeTruthy();
    expect(screen.getByText(CHAT_COPY.listLoading).closest('[aria-busy]')?.getAttribute('aria-busy')).toBe(
      'true',
    );
    expect(screen.queryByTestId('history-empty')).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('history-current'));
  });

  it('error: said in words as an alert, with Try again that works', async () => {
    chats['a-mira'] = 'fail';
    await mount();
    await openHistory();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(CHAT_COPY.listError);
    expect(screen.queryByTestId('history-empty')).toBeNull();
    chats['a-mira'] = [run()];
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await pastRow(/Fix the signup form/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

/* ---------- new message while away */

describe('new message while in history', () => {
  it('Back to chat gets “, new message” and a polite status says who', async () => {
    await mount();
    await openHistory();
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('');
    /* a fresh line lands in the live thread (as the SSE refresh would write it) */
    const text = 'Done — the form is fixed.';
    await act(async () =>
      setQueryData<Thread>(keys.thread('p1', 'a-mira'), {
        ...thread('a-mira'),
        messages: [
          ...thread('a-mira').messages,
          { id: 'new', from: 'a-mira', kind: 'text', text, runId: null, reportId: null, at: ago(0) },
        ],
      }),
    );
    expect(screen.getByTestId('history-current').textContent).toContain(text);
    expect(screen.getByRole('button', { name: 'Back to chat, new message' })).toBe(
      screen.getByTestId('back-to-chat'),
    );
    expect(screen.getByRole('status').textContent).toBe('New message from Mira Vale');
    /* never jumps you back */
    expect(isLive()).toBe(false);
  });
});

/* ---------- §5: 44px targets and AA contrast (from the stylesheets; layout isn't real in happy-dom) */

const rule = (css: string, selector: string) => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|[}\\s,])${esc}\\s*\\{([^}]*)\\}`, 'm').exec(css);
  if (!m) throw new Error(`no rule for ${selector}`);
  return m[1];
};
const prop = (block: string, name: string) =>
  new RegExp(`(?:^|;|\\s)${name}\\s*:\\s*([^;]+)`).exec(block)?.[1].trim();
const token = (name: string) => {
  const v = new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(themeCss)?.[1];
  if (!v) throw new Error(`no token ${name}`);
  return v;
};
type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as RGB;
const over = (fg: RGB, a: number, bg: RGB): RGB => fg.map((c, i) => c * a + bg[i] * (1 - a)) as RGB;
const lum = (c: RGB) => {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: RGB, b: RGB) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const px = (v: string | undefined) => Number.parseFloat(v ?? '0');

describe('§5 touch targets ≥ 44px', () => {
  it.each([
    ['.op-pill', historyCss], // History + ← director (visible pill ~28px, hit area 44)
    ['.ch-back', historyCss], // ‹ Back to chat / ‹ History
    ['.op-nav .op-nav-home', historyCss], // Back to chat (sun pill)
    ['.ch-panel .btn', historyCss], // empty-state Back to chat, Send, Try again
    ['.ch-composer textarea', historyCss],
  ])('%s has min-height ≥ 44px', (sel, css) => {
    expect(px(prop(rule(css, sel), 'min-height'))).toBeGreaterThanOrEqual(44);
  });

  it('list rows are at least 56px tall', () => {
    expect(px(prop(rule(historyCss, '.ch-row'), 'min-height'))).toBeGreaterThanOrEqual(56);
  });

  it('the nav bar is 48px and the stacked pills keep their hit areas apart (overlap ≤ visible gap)', () => {
    expect(px(prop(rule(historyCss, '.op-nav'), 'min-height'))).toBeGreaterThanOrEqual(48);
    const overlap = -px(prop(rule(historyCss, '.op-pill + .op-pill'), 'margin-top'));
    const visible = px(prop(rule(historyCss, '.op-pill-v'), 'min-height'));
    /* 44px hit areas overlap by `overlap`; the visible 28px pills still have (44 − 28) − overlap between them */
    expect(44 - visible - overlap).toBeGreaterThanOrEqual(6);
  });
});

describe('§5 contrast is AA', () => {
  const white: RGB = [255, 255, 255];
  const ink = hex(token('ink'));
  const inkSoft = hex(token('ink-soft'));
  const cream = hex(token('cream'));
  const sun = hex(token('sun'));
  const sunDeep = hex(token('sun-deep'));
  const brown = hex('#4a2600');
  const header = hex(/\.op-head\{[^}]*background:(#[0-9a-f]{6})/i.exec(officeCss)?.[1] ?? '#000000');
  const panelLow = hex('#fff3e2'); // the darker end of .o-panel's gradient
  const curRow = over([255, 196, 0], 0.14, panelLow);

  it('the stylesheet still uses the colours checked here', () => {
    expect(prop(rule(historyCss, '.op-pill-v'), 'color')).toBe('var(--cream)');
    expect(prop(rule(historyCss, '.op-nav'), 'background')).toBe('var(--cream)');
    expect(prop(rule(historyCss, '.ch-sub'), 'color')).toBe('var(--ink-soft)');
    expect(prop(rule(historyCss, '.ch-back'), 'color')).toBe('var(--ink-soft)');
    expect(prop(rule(historyCss, '.ch-prev'), 'color')).toBe('var(--ink-soft)');
    expect(prop(rule(historyCss, '.ch-tag-now'), 'color')).toBe('#4a2600');
    expect(prop(rule(historyCss, '.ch-tag-ask'), 'color')).toBe('#9b2c33');
    expect(protoCss).toMatch(
      /\.btn-hero\{background:linear-gradient\(180deg,var\(--sun\),var\(--sun-deep\)\);color:#4a2600/,
    );
  });

  it.each<[string, () => number, number]>([
    ['History pill: cream on 10% white over the header', () => ratio(cream, over(white, 0.1, header)), 4.5],
    ['History pill hover: cream on 18% white', () => ratio(cream, over(white, 0.18, header)), 4.5],
    ['nav label + ‹ Back to chat: ink-soft on cream', () => ratio(inkSoft, cream), 4.5],
    ['row task: ink on white', () => ratio(ink, white), 4.5],
    ['row preview + meta: ink-soft on white', () => ratio(inkSoft, white), 4.5],
    ['Current chat preview: ink-soft on the sun tint', () => ratio(inkSoft, curRow), 4.5],
    ['day label: ink-soft on the panel', () => ratio(inkSoft, panelLow), 4.5],
    ['Now tag: brown on sun', () => ratio(brown, sun), 4.5],
    [
      'Needs you tag: #9b2c33 on coral tint',
      () => ratio(hex('#9b2c33'), over(hex(token('coral')), 0.16, curRow)),
      4.5,
    ],
    ['Back to chat sun pill: brown on sun-deep (darker end)', () => ratio(brown, sunDeep), 4.5],
    ['empty title: ink on the panel', () => ratio(ink, panelLow), 4.5],
    ['row focus ring: grape on white (UI 3:1)', () => ratio(hex(token('grape')), white), 3],
    ['row focus ring: grape on the panel (UI 3:1)', () => ratio(hex(token('grape')), panelLow), 3],
    ['pill focus ring: sun on the header (UI 3:1)', () => ratio(sun, header), 3],
  ])('%s', (_name, r, min) => {
    expect(r()).toBeGreaterThanOrEqual(min);
  });

  it('reduced motion turns off the view slide', () => {
    expect(historyCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.op-hist-body\s*\{\s*animation:\s*none/,
    );
  });
});
