// @vitest-environment happy-dom
/* Where the tokens go: on its own in every state, and its one way in on the sheet (the Tokens card). */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Performance, TokenUse } from '../../api';
import { agents, crew, NOW, quiet, week } from '../fixtures';
import { TeamView } from '../TeamSheet';
import { EMPTY, NOT_MEASURED } from './model';
import { TokensView } from './TokensView';

afterEach(cleanup);

const nameOf = (id: string) => agents[id]?.name ?? 'A retired agent';
const use: TokenUse = {
  usd: { 'a-rivet': 3.2, 'a-blair': 0.4 },
  fresh: 11,
  pickedUp: 2,
  pickedUpTokens: 1_480_000,
  ready: 111_000,
  readyOf: 3_700_000,
};
const p: Performance = { ...week, tokenUse: use };

describe('TokensView', () => {
  it('a sentence, then spent on · starts · per hour of work, then one hint', () => {
    const { container } = render(<TokensView p={p} nameOf={nameOf} />);
    expect(screen.getByRole('heading', { name: 'Where the tokens go' })).toBeTruthy();
    expect(container.querySelector('.pf-tk-lead')?.textContent).toBe(
      'About $4 in all, at pay-as-you-go prices: Rivet about $3, Blair under $1.',
    );
    expect([...container.querySelectorAll('dt')].map((d) => d.textContent)).toEqual([
      'Spent on',
      'Starts',
      'Per hour of work',
    ]);
    expect(screen.getByText('97% working · 3% getting ready')).toBeTruthy();
    expect((container.querySelector('.pf-tk-split span') as HTMLElement).style.width).toBe('97%');
    expect(screen.getByText(/766k tokens/).textContent).toBe('766k tokens · ↑ 2% vs last week');
    expect(container.querySelectorAll('.pf-tk-hint')).toHaveLength(1);
    expect(container.querySelectorAll('button, input, select')).toHaveLength(0);
  });

  it('nothing measured yet: one calm line', () => {
    const { container } = render(
      <TokensView p={{ ...p, totals: { ...p.totals, tokens: 0 } }} nameOf={nameOf} />,
    );
    expect(screen.getByText(EMPTY)).toBeTruthy();
    expect(container.querySelector('dl')).toBeNull();
  });

  it('getting ready not measured: no bar, no hint', () => {
    const { container } = render(
      <TokensView
        p={{ ...p, tokenUse: { ...use, ready: null, readyOf: 0, pickedUp: 0, pickedUpTokens: 0 } }}
        nameOf={nameOf}
      />,
    );
    expect(screen.getByText(NOT_MEASURED)).toBeTruthy();
    expect(container.querySelector('.pf-tk-split')).toBeNull();
    expect(container.querySelector('.pf-tk-hint')).toBeNull();
  });
});

describe('on the sheet', () => {
  const sheet = (perf: Performance) =>
    render(
      <TeamView p={perf} name="Aurora" agents={agents} crew={crew} range="7d" onRange={() => {}} now={NOW} />,
    );

  it('hidden until the Tokens card is picked; then right under the chart', () => {
    const { container } = sheet(p);
    expect(screen.queryByRole('heading', { name: 'Where the tokens go' })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /^Tokens:/ }));
    const h3s = [...container.querySelectorAll('h3')].map((h) => h.textContent);
    expect(h3s.slice(0, 2)).toEqual(['Tokens per day', 'Where the tokens go']);
    fireEvent.click(screen.getByRole('radio', { name: /^Agent time:/ }));
    expect(screen.queryByRole('heading', { name: 'Where the tokens go' })).toBeNull();
  });

  it('a quiet range keeps its own line, no token view', () => {
    sheet(quiet);
    fireEvent.click(screen.getByRole('radio', { name: /^Tokens:/ }));
    expect(screen.queryByRole('heading', { name: 'Where the tokens go' })).toBeNull();
  });
});
