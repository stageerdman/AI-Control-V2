// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearQueryCache, type Draft, setQueryData } from '../../api';
import { NameStep } from './NameStep';

const draft = (over: Partial<Draft> = {}): Draft =>
  ({
    id: 'd1',
    mode: 'new',
    step: 1,
    name: 'Tip Splitter',
    about: '',
    folder: null,
    orchestratorId: null,
    plan: null,
    chat: [],
    createdAt: '',
    updatedAt: '',
    ...over,
  }) as Draft;
const seed = (gh: 'ready' | 'signed-out' = 'ready', byDefault = true) => {
  setQueryData('settings', { githubByDefault: byDefault });
  setQueryData('gh:status', { gh, login: gh === 'ready' ? 'stage' : null });
  setQueryData('sandbox:path', '/Users/me/dev/AI-Studio-Sandbox');
  setQueryData('sandbox:folders', [
    {
      folder: 'recipes',
      git: true,
      marked: false,
      remote: { url: 'https://github.com/stage/recipes.git', github: 'stage/recipes' },
    },
    { folder: 'plain', git: false, marked: false, remote: null },
  ]);
};
beforeEach(() => clearQueryCache());
afterEach(cleanup);
const step = (d: Draft, edit = vi.fn()) =>
  render(<NameStep d={d} edit={edit} onBack={() => {}} onNext={() => {}} />);

describe('Name step: GitHub', () => {
  it('the switch is on by default (the studio setting) and edits the draft', () => {
    seed();
    const edit = vi.fn();
    step(draft(), edit);
    const sw = screen.getByRole('switch', { name: 'Create a private GitHub repo' });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('GitHub · private repo')).toBeTruthy();
    fireEvent.click(sw);
    expect(edit).toHaveBeenCalledWith({ github: false });
  });
  it('off (draft or studio) reads "skipped"; gh not signed in = a quiet hint, never a block', () => {
    seed('signed-out', false);
    step(draft());
    expect(screen.getByText('GitHub · skipped — you can publish later from Health')).toBeTruthy();
    cleanup();
    step(draft({ github: true }));
    const sw = screen.getByRole('switch', { name: 'Create a private GitHub repo' });
    expect(document.getElementById(sw.getAttribute('aria-describedby') ?? '')?.textContent).toMatch(
      /GitHub CLI isn’t signed in — setup will finish without a repo/,
    );
    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('an adopted folder with a remote keeps origin — no switch', () => {
    seed();
    step(draft({ mode: 'adopt', folder: 'recipes', name: 'Recipes' }));
    expect(screen.getByText('GitHub · keeps origin (stage/recipes)')).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
    cleanup();
    step(draft({ mode: 'adopt', folder: 'plain', name: 'Plain' }));
    expect(screen.getByRole('switch', { name: 'Create a private GitHub repo' })).toBeTruthy();
  });
});
