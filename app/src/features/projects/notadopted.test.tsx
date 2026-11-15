// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Draft, studio } from '../../api';
import type { SandboxFolder } from '../setup/api';
import { folderHint, unadopted } from './model';
import { NotAdoptedShelf } from './NotAdoptedShelf';

const F: SandboxFolder[] = [
  { folder: 'cook-ai', git: true, marked: false, remote: { url: 'u', github: 'stage/cook-ai' } },
  { folder: 'MAN 20', git: false, marked: false, remote: null },
  { folder: 'pensieve', git: true, marked: true, remote: null },
];
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('not adopted (pure)', () => {
  it('leaves out folders a draft already picked; search matches folder or GitHub repo', () => {
    const drafts = [{ folder: 'pensieve' }, { folder: null }] as Pick<Draft, 'folder'>[];
    expect(unadopted(F, drafts, '').map((f) => f.folder)).toEqual(['cook-ai', 'MAN 20']);
    expect(unadopted(F, [], 'man').map((f) => f.folder)).toEqual(['MAN 20']);
    expect(unadopted(F, [], 'stage/').map((f) => f.folder)).toEqual(['cook-ai']);
  });
  it('hint: "GitHub", else "git", else nothing', () => {
    expect(F.map(folderHint)).toEqual(['GitHub', '', 'git']);
  });
});

describe('Not adopted shelf', () => {
  const shelf = (over: Partial<Parameters<typeof NotAdoptedShelf>[0]> = {}) =>
    render(
      <NotAdoptedShelf
        folders={F}
        error={null}
        onRetry={() => {}}
        forceOpen={false}
        orchestratorId="o1"
        {...over}
      />,
    );

  it('collapsed by default with a count; Show opens it', () => {
    shelf();
    expect(screen.getByText('3 folders')).toBeTruthy();
    expect(screen.queryByLabelText('Adopt cook-ai')).toBeNull();
    const t = screen.getByRole('button', { name: 'Show' });
    expect(t.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(t);
    expect(screen.getByLabelText('Adopt cook-ai')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hide' })); // leave the remembered state closed
  });

  it('forced open (searching / empty studio): rows, no toggle', () => {
    shelf({ forceOpen: true });
    expect(screen.getByLabelText('Adopt MAN 20')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Show|Hide/ })).toBeNull();
  });

  it('nothing to show: no shelf at all', () => {
    const { container } = shelf({ folders: [] });
    expect(container.innerHTML).toBe('');
  });

  it('a read error: one line and Retry', () => {
    const onRetry = vi.fn();
    shelf({ folders: [], error: new Error('x'), onRetry });
    expect(screen.getByText('Couldn’t read ~/dev.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('click = an adopt draft with the folder and its name, opened on the Name step', async () => {
    const create = vi.spyOn(studio.drafts, 'create').mockResolvedValue({ id: 'd9' } as Draft);
    const assign = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, assign } as Location);
    shelf({ forceOpen: true });
    fireEvent.click(screen.getByLabelText('Adopt cook-ai'));
    expect(create).toHaveBeenCalledWith({
      mode: 'adopt',
      folder: 'cook-ai',
      name: 'Cook Ai',
      step: 1,
      orchestratorId: 'o1',
    });
    await waitFor(() => expect(assign).toHaveBeenCalledWith('#new/d9'));
  });
});
