// @vitest-environment happy-dom
/* How the team works: the sheet in every state, from fixtures and against a fake server. */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearQueryCache } from '../../../api';
import type { Performance, PerfRange } from '../api';
import { agents, crew, NOW, none, quiet, week } from './fixtures';
import { TeamSheet, TeamView } from './TeamSheet';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const view = (p: Performance, onRange: (r: PerfRange) => void = () => {}, range: PerfRange = p.range) =>
  render(
    <TeamView p={p} name="Aurora" agents={agents} crew={crew} range={range} onRange={onRange} now={NOW} />,
  );
const headings = (level: number) => screen.getAllByRole('heading', { level }).map((h) => h.textContent);

describe('TeamView', () => {
  it('three measures with their trends; the tokens star; who is working now', () => {
    view(week);
    const time = screen.getByRole('radio', { name: 'Agent time: 4h 50m, up 21% from last week' });
    expect(time.getAttribute('aria-checked')).toBe('true');
    expect(time.textContent).toContain('↑ 21% vs last week');
    expect(
      screen.getByRole('radio', {
        name: 'Tokens: 3.7M, up 23% from last week. Some early work wasn’t measured in tokens.',
      }).textContent,
    ).toContain('*');
    expect(screen.getByRole('radio', { name: 'Requests: 13, up 3 from last week' })).toBeTruthy();
    expect(screen.getByText('1 working')).toBeTruthy();
    expect(headings(3)[0]).toBe('Agent time per day');
  });

  it('no money anywhere', () => {
    const { container } = view(week);
    expect(container.textContent).not.toMatch(/\$|cost|price|spend/i);
  });

  it('the chart: seven bars, each says all three measures; arrows walk them', () => {
    view(week);
    const chart = screen.getByRole('group', {
      name: /^Agent time per day, the last 7 days: most on Monday, 2h$/,
    });
    const bars = within(chart).getAllByRole('button');
    expect(bars).toHaveLength(7);
    expect(bars[1]?.getAttribute('aria-label')).toBe('Wed, Nov 11 · 1h · 2.4M tokens · 4 requests');
    expect(bars.map((b) => b.tabIndex)).toEqual([-1, -1, -1, -1, -1, -1, 0]);
    bars[6]?.focus();
    fireEvent.keyDown(chart, { key: 'Home' });
    expect(document.activeElement).toBe(bars[0]);
    expect(screen.getByRole('tooltip').textContent).toMatch(/^Tue, Nov 10/);
  });

  it('a measure card is the chooser: chart title and team order follow it', () => {
    view(week);
    expect(headings(4)).toEqual([
      'Director · 30m',
      'Design · 3h',
      'Engineering · 1h',
      'Also on this office · 20m',
    ]);
    fireEvent.click(screen.getByRole('radio', { name: /^Tokens/ }));
    expect(headings(3)[0]).toBe('Tokens per day');
    expect(headings(4)).toEqual([
      'Director · 100k',
      'Engineering · 2.4M',
      'Design · 1.2M',
      'Also on this office · 0',
    ]);
  });

  it('worth a look: three hints; a name opens that agent everywhere', () => {
    view(week);
    const list = screen.getByRole('heading', { name: 'Worth a look' }).nextElementSibling as HTMLElement;
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      'Blair did 62% of the work. Another studio design agent could share it.',
      '2 of Rivet’s 4 jobs stopped early.',
      'Rivet used 65% of the tokens in 21% of the time.',
    ]);
    fireEvent.click(within(list).getByRole('button', { name: 'Blair' }));
    expect(headings(3)[0]).toBe('Blair · agent time per day');
    const chip = screen.getByRole('button', { name: 'Back to the whole team' });
    expect(chip.textContent).toBe('Blair ✕');
    const open = screen.getAllByRole('button', { expanded: true });
    expect(open).toHaveLength(1);
    expect(open[0]?.textContent).toContain('Blair');
    expect(
      screen.getByText(
        '140 turns · 300k new + 900k re-read tokens · 4 tasks · 1 call · 1 chat · last asked 2h ago',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Blair’s kind of work' })).toBeTruthy();
    fireEvent.click(chip);
    expect(headings(3)[0]).toBe('Agent time per day');
    expect(screen.queryAllByRole('button', { expanded: true })).toHaveLength(0);
    expect(screen.getByRole('heading', { name: 'Kind of work' })).toBeTruthy();
  });

  it('who does the work: by team with captains, a toggle to flatten, idle agents faded', () => {
    const { container } = view(week);
    expect(screen.getAllByText('★ Captain')).toHaveLength(2);
    const quill = [...container.querySelectorAll<HTMLButtonElement>('.pf-row')].find((b) =>
      b.textContent?.includes('Quill'),
    );
    expect(quill?.disabled).toBe(true);
    expect(quill?.textContent).toContain('—');
    expect(quill?.closest('li')?.className).toBe('faded');
    expect(screen.getByText('A retired agent')).toBeTruthy();
    const toggle = screen.getByRole('button', { name: 'by team ▾' });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(toggle);
    expect(screen.queryAllByRole('heading', { level: 4 })).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'everyone ▾' }).getAttribute('aria-pressed')).toBe('false');
    const names = [...container.querySelectorAll('.pf-row b')].map((b) => b.textContent);
    expect(names).toEqual(['Blair', 'Rivet', 'Pixel', 'A retired agent', 'Quill']);
  });

  it('a row opens and closes its detail line', () => {
    const { container } = view(week);
    const rivet = [...container.querySelectorAll<HTMLButtonElement>('.pf-row')].find((b) =>
      b.textContent?.includes('Rivet'),
    ) as HTMLButtonElement;
    fireEvent.click(rivet);
    expect(rivet.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(/2 stopped early · last asked yesterday$/)).toBeTruthy();
    fireEvent.click(rivet);
    expect(rivet.getAttribute('aria-expanded')).toBe('false');
  });

  it('quiet range: says so and offers all time', () => {
    const onRange = vi.fn();
    view(quiet, onRange);
    expect(screen.getByText(/Nobody worked on Aurora in the last 7 days\./)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Who does the work' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'See all time' }));
    expect(onRange).toHaveBeenCalledWith('all');
  });

  it('no work ever: one calm line', () => {
    view(none);
    expect(screen.getByText('No work yet. This fills in once the crew starts.')).toBeTruthy();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('range picker hands the choice up', () => {
    const onRange = vi.fn();
    view(week, onRange);
    const range = screen.getByRole('radiogroup', { name: 'Range' });
    fireEvent.click(within(range).getByRole('radio', { name: '30 days' }));
    expect(onRange).toHaveBeenCalledWith('30d');
  });
});

describe('TeamSheet', () => {
  let answer: Performance | 'fail' | 'hang';
  let calls: string[];
  beforeEach(() => {
    clearQueryCache();
    localStorage.clear();
    calls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const url = String(input).replace(/^https?:\/\/[^/]+/, '');
        calls.push(url);
        if (url.startsWith('/projects/aurora/performance?')) {
          if (answer === 'hang') return new Promise<Response>(() => {});
          if (answer === 'fail')
            return new Response(JSON.stringify({ error: { code: 'boom', message: 'boom' } }), {
              status: 500,
            });
          const range = new URLSearchParams(url.split('?')[1]).get('range') as PerfRange;
          return new Response(JSON.stringify({ ...answer, range }), {
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response('{}', { status: 404 });
      }),
    );
  });
  const sheet = () =>
    render(<TeamSheet pid="aurora" name="Aurora" open onClose={() => {}} agents={agents} crew={crew} />);

  it('a labelled dialog that reads the clock first', () => {
    answer = 'hang';
    sheet();
    expect(screen.getByRole('dialog', { name: 'How the team works on Aurora' })).toBeTruthy();
    expect(screen.getByText('Reading the clock…')).toBeTruthy();
    expect(calls[0]).toMatch(/^\/projects\/aurora\/performance\?range=7d&tz=-?\d+$/);
  });

  it('shows the real numbers once they land', async () => {
    answer = week;
    sheet();
    expect(await screen.findByRole('radio', { name: /^Agent time: 4h 50m/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Who does the work' })).toBeTruthy();
  });

  it('remembers the range per office', async () => {
    answer = week;
    sheet();
    await screen.findByRole('radio', { name: /^Agent time/ });
    fireEvent.click(screen.getByRole('radio', { name: '30 days' }));
    await waitFor(() => expect(calls.some((c) => c.includes('range=30d'))).toBe(true));
    expect(localStorage.getItem('ai-studio:team-range:aurora')).toBe('30d');
    cleanup();
    clearQueryCache();
    calls = [];
    sheet();
    expect(calls[0]).toContain('range=30d');
  });

  it('error: says so, Try again reads again', async () => {
    answer = 'fail';
    sheet();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Couldn’t read how the team works');
    answer = week;
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('radio', { name: /^Agent time: 4h 50m/ })).toBeTruthy();
  });
});
