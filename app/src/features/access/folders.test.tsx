// @vitest-environment happy-dom
/* The Vault's Folders: add one (Choose… or paste), Read only / Read & write, Only this project / All
   projects, and its on/off switch. */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { clearQueryCache } from '../../api/query';
import { Toaster } from '../../ui';
import type { Access, ProjectAccess, ProjectAccessItem } from './api';
import { cleanPath, emptyFolderDraft, folderBlocker, folderLine, folderName } from './folders';

const now = '2026-11-24T10:00:00.000Z';
const folderItem = (over: Partial<ProjectAccessItem> = {}): ProjectAccessItem => ({
  id: 'a-dev',
  name: 'dev',
  serves: '',
  docsUrl: null,
  instructions: '',
  fields: [],
  folder: '/Users/me/dev',
  folderMode: 'read',
  localTo: null,
  projectIds: [],
  createdAt: now,
  updatedAt: now,
  granted: false,
  isNew: false,
  ...over,
});
const view = (accesses: ProjectAccessItem[]): ProjectAccess => ({
  projectId: 'aurora',
  granted: accesses.filter((a) => a.granted).length,
  total: accesses.length,
  seenAt: now,
  newCount: 0,
  accesses,
});

const api = vi.hoisted(() => ({
  project: vi.fn(),
  grant: vi.fn(),
  revoke: vi.fn(),
  seen: vi.fn(),
  sync: vi.fn(),
  create: vi.fn(),
  addLocal: vi.fn(),
  pickFolder: vi.fn(),
}));
vi.mock('./api', () => ({
  accessApi: api,
  keys: { cabinet: 'accesses', project: (id: string) => `accesses:project:${id}` },
}));

const { ProjectAccessPanel } = await import('./ProjectAccessPanel');

let items: ProjectAccessItem[] = [];
beforeEach(() => {
  clearQueryCache();
  vi.clearAllMocks();
  items = [];
  api.project.mockImplementation(async () => view(items));
  api.seen.mockResolvedValue({ projectId: 'aurora', seenAt: now });
  api.grant.mockImplementation(async (_p: string, id: string) => {
    items = items.map((x) => (x.id === id ? { ...x, granted: true } : x));
    return view(items);
  });
  api.revoke.mockImplementation(async (_p: string, id: string) => {
    items = items.map((x) => (x.id === id ? { ...x, granted: false } : x));
    return view(items);
  });
});
afterEach(cleanup);

const open = async () => {
  render(
    <>
      <ProjectAccessPanel projectId="aurora" projectName="Aurora" />
      <Toaster />
    </>,
  );
  const region = await screen.findByRole('region', { name: 'Folders' });
  return region;
};
const startAdding = async () => {
  const region = await open();
  fireEvent.click(within(region).getByRole('button', { name: '＋ Add folder' }));
  return within(screen.getByRole('form', { name: 'Add a folder' }));
};

describe('folder words', () => {
  it('names a folder by its last part and cleans a pasted path', () => {
    expect(folderName('/Users/me/dev/')).toBe('dev');
    expect(cleanPath(' "/Users/me/My Notes/" ')).toBe('/Users/me/My Notes');
    expect(cleanPath('/')).toBe('/');
  });
  it('says what blocks Add', () => {
    expect(folderBlocker(emptyFolderDraft())).toMatch(/Choose a folder/);
    expect(folderBlocker({ ...emptyFolderDraft(), path: 'dev' })).toMatch(/full path/);
    expect(folderBlocker({ ...emptyFolderDraft(), path: '/Users/me/dev' })).toBeNull();
  });
  it('one line for mode and place', () => {
    expect(folderLine({ folderMode: 'read', localTo: null }, 'Aurora')).toBe('Read only · All projects');
    expect(folderLine({ folderMode: 'write', localTo: 'aurora' }, 'Aurora')).toBe(
      'Read & write · Only Aurora',
    );
  });
  it('starts at the safest choice: read only, this project only', () => {
    expect(emptyFolderDraft()).toEqual({ path: '', mode: 'read', scope: 'project' });
  });
});

describe('Folders in the Vault', () => {
  it('empty: says what a folder is for, one button to add', async () => {
    const region = await open();
    expect(within(region).getByText(/No folders yet/)).toBeTruthy();
  });

  it('a global folder shows off with a switch; switching it on and off', async () => {
    items = [folderItem()];
    const region = await open();
    const sw = within(region).getByRole('switch', { name: "Let Aurora's agents open dev" });
    expect(within(region).getByText('Read only · All projects')).toBeTruthy();
    expect(within(region).getByText('Off')).toBeTruthy();
    await act(async () => fireEvent.click(sw));
    expect(api.grant).toHaveBeenCalledWith('aurora', 'a-dev');
    expect(within(region).getByText('On')).toBeTruthy();
    expect(await screen.findByText('📁 dev on for Aurora')).toBeTruthy();
    await act(async () => fireEvent.click(sw));
    expect(api.revoke).toHaveBeenCalledWith('aurora', 'a-dev');
  });

  it('adds a folder for this project only, read only by default — pasted path', async () => {
    api.addLocal.mockImplementation(async (_p: string, body: { name: string; folder: string }) => {
      const x = folderItem({
        id: 'a-notes',
        name: body.name,
        folder: body.folder,
        localTo: 'aurora',
        granted: true,
      });
      items = [x];
      return x;
    });
    const form = await startAdding();
    expect(form.getByRole('radio', { name: 'Read only' }).getAttribute('aria-checked')).toBe('true');
    expect(form.getByRole('radio', { name: 'Only Aurora' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.change(form.getByLabelText('Folder'), { target: { value: '/Users/me/notes/' } });
    await act(async () => fireEvent.click(form.getByRole('button', { name: 'Add folder' })));
    expect(api.addLocal).toHaveBeenCalledWith('aurora', {
      name: 'notes',
      folder: '/Users/me/notes',
      folderMode: 'read',
      fields: [],
    });
    expect(api.create).not.toHaveBeenCalled();
    const region = screen.getByRole('region', { name: 'Folders' });
    await waitFor(() => expect(within(region).getByText('Read only · Only Aurora')).toBeTruthy());
    expect(screen.queryByRole('form', { name: 'Add a folder' })).toBeNull();
  });

  it('adds a folder for all projects, read and write, chosen with the picker — and switches it on here', async () => {
    api.pickFolder.mockResolvedValue({ path: '/Users/me/Downloads' });
    api.create.mockImplementation(async (body: { name: string; folder: string }): Promise<Access> => {
      const x = folderItem({ id: 'a-dl', name: body.name, folder: body.folder, folderMode: 'write' });
      items = [x];
      return x;
    });
    const form = await startAdding();
    await act(async () => fireEvent.click(form.getByRole('button', { name: 'Choose…' })));
    expect((form.getByLabelText('Folder') as HTMLInputElement).value).toBe('/Users/me/Downloads');
    fireEvent.click(form.getByRole('radio', { name: 'Read & write' }));
    fireEvent.click(form.getByRole('radio', { name: 'All projects' }));
    expect(form.getByText(/switched off until you turn it on there/)).toBeTruthy();
    await act(async () => fireEvent.click(form.getByRole('button', { name: 'Add folder' })));
    expect(api.create).toHaveBeenCalledWith({
      name: 'Downloads',
      folder: '/Users/me/Downloads',
      folderMode: 'write',
      fields: [],
    });
    expect(api.grant).toHaveBeenCalledWith('aurora', 'a-dl');
    const region = screen.getByRole('region', { name: 'Folders' });
    expect(within(region).getByText('On')).toBeTruthy();
    expect(await screen.findByText('📁 Downloads added for all projects — on in Aurora')).toBeTruthy();
  });

  it('cancelling the picker changes nothing', async () => {
    api.pickFolder.mockResolvedValue({ path: null });
    const form = await startAdding();
    fireEvent.change(form.getByLabelText('Folder'), { target: { value: '/Users/me/x' } });
    await act(async () => fireEvent.click(form.getByRole('button', { name: 'Choose…' })));
    expect((form.getByLabelText('Folder') as HTMLInputElement).value).toBe('/Users/me/x');
  });

  it('a path that is not absolute is stopped here; the server’s refusal is shown as said', async () => {
    api.addLocal.mockRejectedValue(
      new ApiError(422, 'invalid', "The folder /Users/me/nope doesn't exist (or isn't a folder)"),
    );
    const form = await startAdding();
    await act(async () => fireEvent.click(form.getByRole('button', { name: 'Add folder' })));
    expect(form.getByRole('alert').textContent).toMatch(/Choose a folder or paste its path/);
    expect(api.addLocal).not.toHaveBeenCalled();
    fireEvent.change(form.getByLabelText('Folder'), { target: { value: '/Users/me/nope' } });
    await act(async () => fireEvent.click(form.getByRole('button', { name: 'Add folder' })));
    expect(form.getByRole('alert').textContent).toMatch(/doesn't exist/);
  });

  it('a folder already in the Vault in that place is switched on instead', async () => {
    items = [folderItem()];
    api.create.mockRejectedValue(
      new ApiError(409, 'conflict', "The folder /Users/me/dev is already in the cabinet as 'dev'", {
        existingId: 'a-dev',
      }),
    );
    const form = await startAdding();
    fireEvent.click(form.getByRole('radio', { name: 'All projects' }));
    fireEvent.change(form.getByLabelText('Folder'), { target: { value: '/Users/me/dev' } });
    await act(async () => fireEvent.click(form.getByRole('button', { name: 'Add folder' })));
    expect(api.grant).toHaveBeenCalledWith('aurora', 'a-dev');
    expect(await screen.findByText("📁 dev was already in the Vault — it's on in Aurora")).toBeTruthy();
  });

  it('Cancel and Escape close the form', async () => {
    let form = await startAdding();
    fireEvent.click(form.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('form', { name: 'Add a folder' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '＋ Add folder' }));
    form = within(screen.getByRole('form', { name: 'Add a folder' }));
    fireEvent.keyDown(form.getByLabelText('Folder'), { key: 'Escape' });
    expect(screen.queryByRole('form', { name: 'Add a folder' })).toBeNull();
  });

  it('arrow keys move between the choices', async () => {
    const form = await startAdding();
    const read = form.getByRole('radio', { name: 'Read only' });
    fireEvent.keyDown(read, { key: 'ArrowRight' });
    expect(form.getByRole('radio', { name: 'Read & write' }).getAttribute('aria-checked')).toBe('true');
  });
});
