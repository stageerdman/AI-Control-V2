// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { clearQueryCache } from '../../api/query';
import type { Scaffold } from './api';
import { firstSentence, freshness, freshnessProjects, kitTree, localDay, principlesOf } from './model';

const TREE = [
  { path: '.project', kind: 'file', desc: 'marker' },
  { path: 'CLAUDE.md', kind: 'file', desc: 'rulebook' },
  { path: '.env', kind: 'file', desc: 'secrets' },
  { path: 'updates/', kind: 'dir', desc: 'updates' },
] as const;
const CODING = {
  name: 'CODING',
  description: 'How code is written.',
  body: '# Coding\n\n## Keep it minimal\n- Build **only what is needed**. Then stop.\n\n## Test what matters\n```\n## not a heading\n```\nCover core logic.\n',
  updatedAt: '2026-11-10T12:00:00.000Z',
};
const rep = (over: Partial<Scaffold> = {}): Scaffold => ({
  folder: 'p',
  exists: true,
  items: TREE.map((t) => ({ ...t, present: true })),
  complete: true,
  git: { repo: true, head: 'abc', commits: 1 },
  claudeMdGenerated: '2026-11-12',
  ...over,
});

describe('blueprint model', () => {
  it('kit tree: my-project root, glyphs, the first update under updates/', () => {
    const [root] = kitTree([...TREE], '2026-11-13');
    expect(root?.path).toBe('my-project/');
    expect(root?.children?.map((c) => [c.glyph, c.path])).toEqual([
      ['📄', '.project'],
      ['📘', 'CLAUDE.md'],
      ['🔑', '.env'],
      ['📁', 'updates/'],
    ]);
    const upd = root?.children?.[3]?.children?.[0];
    expect(upd?.path).toBe('2026-11-13 INIT - OPEN/');
    expect(upd?.children?.map((c) => c.path)).toEqual(['update v1.md', 'wiki.md']);
  });

  it('principles: one per ## section, first sentence, markdown stripped, fences skipped', () => {
    expect(principlesOf(CODING)).toEqual([
      { module: 'CODING', title: 'Keep it minimal', text: 'Build only what is needed.' },
      { module: 'CODING', title: 'Test what matters', text: 'Cover core logic.' },
    ]);
    expect(
      principlesOf({ name: 'S', body: '## Updates\nEach update is a folder named:\n```\nx\n```' })[0]?.text,
    ).toBe('');
    expect(firstSentence('a '.repeat(100), 20)).toMatch(/…$/);
  });

  it('freshness: up to date / module changed / missing / no folder', () => {
    const mods = [CODING];
    expect(freshness(rep(), mods)).toMatchObject({
      state: 'ok',
      label: '✓ Up to date · CLAUDE.md compiled on Nov 12, 2026',
    });
    const stale = freshness(rep({ claudeMdGenerated: '2026-11-01' }), mods);
    expect(stale).toMatchObject({ state: 'stale', changed: ['CODING'] });
    expect(stale.label).toBe('⚠ Needs rebuild — Coding changed since Nov 1, 2026');
    const missing = rep();
    missing.items[2] = { ...missing.items[2], present: false } as Scaffold['items'][number];
    expect(freshness(missing, mods)).toMatchObject({
      state: 'broken',
      label: '⚠ Missing .env',
      missing: ['.env'],
    });
    expect(freshness(rep({ exists: false }), mods).label).toBe('⚠ Folder not found on disk');
    expect(freshness(rep({ claudeMdGenerated: null }), mods).state).toBe('stale');
    // same day as the compile = can't tell → up to date
    expect(freshness(rep({ claudeMdGenerated: localDay(CODING.updatedAt) }), mods).state).toBe('ok');
  });

  it('only projects on a folder and not archived are checked', () => {
    const p = (id: string, folder: string | null, status: string) => ({ id, folder, status }) as never;
    expect(
      freshnessProjects([p('a', 'a', 'live'), p('b', null, 'draft'), p('c', 'c', 'archived')]).map(
        (x: { id: string }) => x.id,
      ),
    ).toEqual(['a']);
  });
});

const rebuild = vi.hoisted(() => vi.fn());
const setSettings = vi.hoisted(() =>
  vi.fn(async (b: Record<string, boolean>) => ({ githubByDefault: true, autoApprove: true, ...b })),
);
vi.mock('../../api/studio', () => ({
  studio: {
    settings: async () => ({ githubByDefault: true, autoApprove: true }),
    setSettings,
  },
}));
vi.mock('./api', () => ({
  blueprintApi: {
    rebuild,
    get: async () => ({ modulesDir: '/Users/x/.ai-control/modules', modules: [CODING], tree: [...TREE] }),
    projects: async () => [
      {
        id: 'aurora',
        name: 'Aurora',
        folder: 'aurora',
        status: 'live',
        tile: { g1: '#000', g2: '#fff', glyph: 'bag' },
      },
    ],
    scaffold: async () => rep({ claudeMdGenerated: '2026-11-01' }),
  },
  keys: { blueprint: 'blueprint', scaffold: (id: string) => `blueprint:scaffold:${id}` },
}));
const { BlueprintPage } = await import('./BlueprintPage');

describe('BlueprintPage', () => {
  afterEach(() => {
    cleanup();
    clearQueryCache();
  });
  it('starter kit tab renders the server tree; principles tab shows modules, text and freshness', async () => {
    render(<BlueprintPage route={{ name: 'blueprint' }} />);
    expect(await screen.findByText('my-project/')).toBeTruthy();
    expect(screen.getByText('rulebook')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Principles' }));
    expect(screen.getByText('Keep it minimal')).toBeTruthy();
    expect(screen.getByText(/~\/\.ai-control\/modules/, { selector: 'code' })).toBeTruthy();
    expect(await screen.findByText(/Needs rebuild — Coding changed since Nov 1, 2026/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Read the Coding module' }));
    const d = screen.getByRole('dialog', { name: 'Coding module' });
    expect(within(d).getByRole('heading', { name: 'Coding' })).toBeTruthy();
    expect(within(d).getByText('only what is needed').tagName).toBe('STRONG');
  });
  it('Rebuild: a stale project gets the button; a 409 is shown as the server wrote it', async () => {
    const msg =
      'CLAUDE.md has no "## Project-specific rules" section — add that heading above the project\'s own rules, then rebuild';
    rebuild.mockRejectedValueOnce(new ApiError(409, 'conflict', msg));
    rebuild.mockResolvedValueOnce({ file: 'CLAUDE.md', changed: true, modules: ['CODING'], commit: 'abc' });
    render(<BlueprintPage route={{ name: 'blueprint' }} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Principles' }));
    const btn = await screen.findByRole('button', { name: 'Rebuild Aurora’s CLAUDE.md' });
    await act(async () => fireEvent.click(btn));
    expect(rebuild).toHaveBeenCalledWith('aurora');
    expect((await screen.findByRole('alert')).textContent).toBe(msg);
    await act(async () => fireEvent.click(btn));
    expect(rebuild).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('starter kit: the auto-approve switch sits next to the GitHub default and flips only autoApprove', async () => {
    render(<BlueprintPage route={{ name: 'blueprint' }} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Starter Kit' })); // the page remembers the last tab
    const gh = await screen.findByRole('switch', { name: 'New projects get a private GitHub repo' });
    const auto = screen.getByRole('switch', { name: 'Auto-approve agents’ yes/no checks' });
    await vi.waitFor(() => expect(auto.hasAttribute('disabled')).toBe(false));
    expect(auto.getAttribute('aria-checked')).toBe('true');
    expect(gh.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(/Agents never stop to ask permission/)).toBeTruthy();
    await act(async () => fireEvent.click(auto));
    expect(setSettings).toHaveBeenCalledWith({ autoApprove: false });
    expect(auto.getAttribute('aria-checked')).toBe('false');
    expect(gh.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(/Off — agents may stop to ask/)).toBeTruthy();
  });
});
