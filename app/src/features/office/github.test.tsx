// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { clearQueryCache } from '../../api/query';
import type { GhStatus, GithubView, GitStatus, ProjectHealth } from '../../api/types';
import { Toaster } from '../../ui';
import { ghHint, ghRowState, publishError, publishSentence, repoOf } from './github';

const NOW = Date.parse('2026-11-14T12:00:00Z');
const git = (over: Partial<GitStatus> = {}): GitStatus => ({
  repo: true,
  branch: 'main',
  clean: true,
  changes: 0,
  lastCommit: null,
  commits: 12,
  remote: null,
  github: { repo: null, visibility: null },
  ...over,
});
const view = (over: Partial<GithubView> = {}): GithubView => ({
  published: true,
  url: 'https://github.com/stage/tip-splitter',
  visibility: 'private',
  lastPush: { ok: true, at: '2026-11-14T11:58:00Z' },
  ...over,
});
const off: GithubView = {
  published: false,
  url: null,
  visibility: null,
  lastPush: null,
  note: 'GitHub not connected — Publish',
};
const ready: GhStatus = { gh: 'ready', login: 'stage' };

describe('the GitHub row: every state says its exact words', () => {
  const text = (v: GithubView, g = git(), gh: GhStatus = ready) => {
    const s = ghRowState(v, g, gh, NOW);
    return s.kind === 'published' ? [s.repo, s.public ? 'Public' : 'Private', s.push].join(' · ') : s.text;
  };
  it('published: repo · switch word · last push', () => {
    expect(text(view())).toBe('stage/tip-splitter · Private · pushed 2 min ago');
    expect(text(view({ visibility: 'public', lastPush: null }))).toBe(
      'stage/tip-splitter · Public · not pushed yet',
    );
    const failed = ghRowState(
      view({ lastPush: { ok: false, at: '2026-11-14T11:00:00Z', note: 'x' } }),
      git(),
      ready,
      NOW,
    );
    expect(failed).toMatchObject({ push: 'last push didn’t go through', pushFailed: true });
  });
  it('not published: CLI ready / missing / signed out; other remote; no repo; loading', () => {
    expect(text(off)).toBe('Not on GitHub yet');
    expect(text(off, git(), { gh: 'missing', login: null })).toBe('Not on GitHub yet · needs the GitHub CLI');
    expect(text(off, git(), { gh: 'signed-out', login: null })).toBe(
      'Not on GitHub yet · sign in to the GitHub CLI',
    );
    expect(text(off, git({ remote: { name: 'origin', url: 'https://gitlab.com/x/y.git' } }))).toBe(
      'Has another remote (origin) — publishing is off',
    );
    expect(text(off, git({ repo: false }))).toBe('No git repository yet');
    expect(ghRowState(undefined, undefined, undefined).kind).toBe('loading');
  });
  it('the how-to hints, the confirm sentence, the error lines', () => {
    expect(ghHint('missing')).toBe(
      'Install the GitHub CLI (brew install gh), then sign in with gh auth login in Terminal.',
    );
    expect(ghHint('signed-out')).toBe('Run gh auth login in Terminal, then come back.');
    expect(ghHint('ready')).toBeNull();
    expect(publishSentence('stage', 'tip-splitter', false, 12)).toBe(
      'Create github.com/stage/tip-splitter as a private repo and push main (12 commits)?',
    );
    expect(publishSentence('stage', 'tip-splitter', true, 1)).toBe(
      'Create github.com/stage/tip-splitter as a public repo — anyone can see the code and its full history — and push main (1 commit)?',
    );
    expect(
      publishError(new ApiError(409, 'conflict', 'GitHub didn’t create the repo: Name already exists'), 'x'),
    ).toBe('You already have a repo called x — pick another name.');
    expect(publishError(new ApiError(0, 'network', 'down'), 'x')).toBe(
      'Couldn’t reach GitHub — nothing was published.',
    );
    expect(repoOf('https://github.com/a/b.git')).toBe('a/b');
  });
});

/* ---------- the component: going public needs a confirm, going private doesn't ---------- */
const api = vi.hoisted(() => ({
  ghStatus: vi.fn(),
  setVisibility: vi.fn(),
  publish: vi.fn(),
  pushGithub: vi.fn(),
}));
vi.mock('../../api/studio', () => ({
  studio: {
    ghStatus: api.ghStatus,
    projects: { setVisibility: api.setVisibility, publish: api.publish, pushGithub: api.pushGithub },
  },
}));
const { GithubRow } = await import('./GithubRow');
const health = (v: GithubView): ProjectHealth => ({ latest: null, history: [], git: git(), github: v });

beforeEach(() => {
  clearQueryCache();
  vi.clearAllMocks();
  api.ghStatus.mockResolvedValue(ready);
});
afterEach(cleanup);

const mount = (v: GithubView) =>
  render(
    <>
      <ul>
        <GithubRow pid="tip" name="Tip Splitter" folder="tip-splitter" health={health(v)} />
      </ul>
      <Toaster />
    </>,
  );

describe('GithubRow', () => {
  it('going public asks first (focus on Keep private); Keep private changes nothing', async () => {
    api.setVisibility.mockResolvedValue(view({ visibility: 'public' }));
    mount(view());
    fireEvent.click(screen.getByRole('switch', { name: 'Public on GitHub' }));
    expect(api.setVisibility).not.toHaveBeenCalled();
    expect(
      screen.getByText('Make tip-splitter public? Anyone will see its code and full history.'),
    ).toBeTruthy();
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Keep private'));
    fireEvent.click(screen.getByRole('button', { name: 'Keep private' }));
    expect(api.setVisibility).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('switch', { name: 'Public on GitHub' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Make public' })));
    expect(api.setVisibility).toHaveBeenCalledWith('tip', 'public');
  });
  it('going private happens at once; a failure says it stayed', async () => {
    api.setVisibility.mockRejectedValueOnce(new ApiError(409, 'conflict', 'nope'));
    mount(view({ visibility: 'public' }));
    await act(async () => fireEvent.click(screen.getByRole('switch', { name: 'Public on GitHub' })));
    expect(api.setVisibility).toHaveBeenCalledWith('tip', 'private');
    expect((await screen.findByRole('alert')).textContent).toBe('GitHub didn’t change it — still public.');
  });
  it('publish: name + visibility → one confirm sentence → Publish (private by default)', async () => {
    api.publish.mockResolvedValue({ ...view(), pushed: true });
    mount(off);
    await waitFor(() => expect(api.ghStatus).toHaveBeenCalled());
    await screen.findByText('Not on GitHub yet');
    fireEvent.click(screen.getByRole('button', { name: 'Publish to GitHub…' }));
    const name = (await screen.findByLabelText('Name')) as HTMLInputElement;
    expect(name.value).toBe('tip-splitter');
    fireEvent.change(name, { target: { value: 'bad name!' } });
    expect(screen.getByText('Use letters, numbers, - _ or . only')).toBeTruthy();
    fireEvent.change(name, { target: { value: 'tips' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
      screen.getByText('Create github.com/stage/tips as a private repo and push main (12 commits)?'),
    ).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Publish' })));
    expect(api.publish).toHaveBeenCalledWith('tip', { name: 'tips', visibility: 'private' });
  });
  it('gh not ready: the hint instead of the form, Check again moves straight on', async () => {
    api.ghStatus.mockResolvedValueOnce({ gh: 'signed-out', login: null });
    mount(off);
    await screen.findByText('Not on GitHub yet · sign in to the GitHub CLI');
    fireEvent.click(screen.getByRole('button', { name: 'Publish to GitHub…' }));
    expect(screen.getByText(/then come back/)).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Check again' })));
    expect(await screen.findByLabelText('Name')).toBeTruthy();
  });
});
