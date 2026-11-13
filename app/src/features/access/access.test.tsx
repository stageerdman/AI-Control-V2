// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { clearQueryCache } from '../../api/query';
import { Toaster } from '../../ui';
import type { Credential } from './api';
import { credLook, envVarFor, initials, masked } from './mark';

const SECRET = 'sk-live-SUPERSECRET-0000-1234abcd';
const SECRET2 = 'sk-live-ROTATED-SECRET-9999-zz77';

const now = '2026-11-13T10:00:00.000Z';
let cabinet: Credential[] = [];
const cred = (over: Partial<Credential>): Credential => ({
  id: 'c1',
  name: 'Stripe',
  envVar: 'STRIPE',
  serves: 'Payments',
  docsUrl: null,
  instructions: '',
  hasValue: false,
  last4: null,
  projectIds: [],
  createdAt: now,
  updatedAt: now,
  ...over,
});

const api = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  replaceKey: vi.fn(),
  remove: vi.fn(),
  importFromEnv: vi.fn(),
  project: vi.fn(),
  setGrants: vi.fn(),
  sync: vi.fn(),
}));
vi.mock('./api', () => ({
  accessApi: api,
  keys: { cabinet: 'credentials', project: (id: string) => `credentials:project:${id}` },
}));
vi.mock('../../api/studio', () => ({
  studio: { projects: { list: async () => [{ id: 'aurora', name: 'Aurora' }] } },
}));

const { AccessPage, importSummary } = await import('./AccessPage');
const { ProjectAccessPanel, syncSummary, withGrant } = await import('./ProjectAccessPanel');

/** The secret must not be anywhere a user (or a screenshot, or devtools' Elements) could see it. */
function expectNoLeak(...secrets: string[]) {
  const html = document.documentElement.outerHTML;
  for (const s of secrets) {
    expect(html).not.toContain(s);
    expect(html).not.toContain(s.slice(0, 12));
  }
  for (const input of document.querySelectorAll('input'))
    for (const s of secrets) expect(input.value).not.toContain(s);
}

beforeEach(() => {
  clearQueryCache();
  vi.clearAllMocks();
  cabinet = [];
  api.list.mockImplementation(async () => cabinet);
});
afterEach(cleanup);

describe('mark + mask mapping', () => {
  it('known services get the prototype marks; others initials + a stable colour', () => {
    expect(credLook({ name: 'GitHub' }).mark).toBe('GH');
    expect(credLook({ name: 'OPENAI_API_KEY' }).mark).toBe('AI');
    expect(credLook({ name: 'Anthropic' }).mark).toBe('✳');
    expect(credLook({ name: 'Sentry' }).mark).toBe('Se');
    expect(credLook({ name: 'Sentry' })).toEqual(credLook({ name: 'Sentry' }));
    expect(initials('my api')).toBe('MA');
    expect(initials('SOME_KEY')).toBe('SK');
    expect(initials('  ')).toBe('?');
  });
  it('masked shows only the last 4, or nothing', () => {
    expect(masked({ hasValue: true, last4: '7Qx2' })).toBe('••••7Qx2');
    expect(masked({ hasValue: true, last4: null })).toBe('••••');
    expect(masked({ hasValue: false, last4: null })).toBeNull();
  });
  it('env var preview follows the server rule', () => {
    expect(envVarFor('Open AI key')).toBe('OPEN_AI_KEY');
    expect(envVarFor('3d secure')).toBe('_3D_SECURE');
    expect(envVarFor('')).toBe('KEY');
  });
  it('summaries name keys, never values', () => {
    expect(importSummary({ imported: [1, 2], refreshed: [1] })).toBe(
      '🔑 2 new keys imported · 1 entry refreshed — masked',
    );
    expect(importSummary({ imported: [], refreshed: [] })).toMatch(/already matches/);
    expect(
      syncSummary({
        file: '/x/.env',
        written: ['A', 'B'],
        removed: ['C'],
        missing: ['D'],
        gitignore: 'added',
      }),
    ).toBe('Wrote A, B · removed C · no value yet for D · added .env to .gitignore.');
    expect(syncSummary({ file: '', written: [], removed: [], missing: [], gitignore: 'present' })).toBe(
      'No keys to write.',
    );
  });
  it('withGrant flips one entry and recounts', () => {
    const e = (id: string, granted: boolean) => ({
      credentialId: id,
      name: id,
      envVar: id,
      serves: '',
      hasValue: true,
      last4: null,
      granted,
    });
    const a = { projectId: 'p', granted: 1, total: 2, entries: [e('a', true), e('b', false)] };
    expect(withGrant(a, 'b', true).granted).toBe(2);
    expect(withGrant(a, 'a', false).entries[0]?.granted).toBe(false);
  });
});

describe('Key Cabinet (UI leak test)', () => {
  const page = () =>
    render(
      <>
        <AccessPage route={{ name: 'access' }} />
        <Toaster />
      </>,
    );
  const keyInput = () => screen.getByLabelText(/key \(write-only/i) as HTMLInputElement;

  it('add: the key goes out once, the field clears, the list shows last-4 only', async () => {
    api.create.mockImplementation(async (body: { name: string; value?: string }) => {
      expect(body.value).toBe(SECRET); // sent once, verbatim
      cabinet = [cred({ name: body.name, hasValue: true, last4: SECRET.slice(-4) })];
      return cabinet[0];
    });
    page();
    await screen.findByText('The cabinet is empty');
    fireEvent.click(screen.getAllByRole('button', { name: '＋ Add access' })[0] as HTMLElement);
    const dialog = screen.getByRole('dialog', { name: 'Add access' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Stripe' } });
    fireEvent.change(keyInput(), { target: { value: SECRET } });
    expect(keyInput().type).toBe('password');
    expect(document.documentElement.outerHTML).not.toContain(SECRET); // the value property isn't markup
    fireEvent.submit(dialog.querySelector('form') as HTMLFormElement);
    expect(keyInput().value).toBe(''); // cleared before the request even resolves
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.create).toHaveBeenCalledOnce();
    expect(await screen.findByText('••••abcd')).toBeTruthy();
    expectNoLeak(SECRET);
  });

  it('replace: write-only, cleared, never shown; failed save keeps nothing either', async () => {
    cabinet = [cred({ hasValue: true, last4: 'abcd', projectIds: ['aurora'] })];
    api.replaceKey.mockRejectedValueOnce(new ApiError(422, 'invalid', 'Request validation failed', []));
    api.replaceKey.mockImplementationOnce(async () => {
      cabinet = [cred({ hasValue: true, last4: 'zz77', projectIds: ['aurora'] })];
      return cabinet[0];
    });
    page();
    fireEvent.click(await screen.findByRole('button', { name: 'Replace key' }));
    const dialog = screen.getByRole('dialog', { name: 'Replace key' });
    expect((within(dialog).getByLabelText('Name') as HTMLInputElement).disabled).toBe(true);

    fireEvent.change(keyInput(), { target: { value: SECRET2 } });
    fireEvent.submit(dialog.querySelector('form') as HTMLFormElement);
    expect(await within(dialog).findByRole('alert')).toBeTruthy(); // the error, not the value
    expect(keyInput().value).toBe('');
    expectNoLeak(SECRET2);

    fireEvent.change(keyInput(), { target: { value: SECRET2 } });
    fireEvent.submit(dialog.querySelector('form') as HTMLFormElement);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.replaceKey).toHaveBeenLastCalledWith('c1', SECRET2);
    expect(await screen.findByText('••••zz77')).toBeTruthy();
    expectNoLeak(SECRET2);
  });

  it('closing the form discards a typed key', async () => {
    page();
    await screen.findByText('The cabinet is empty');
    fireEvent.click(screen.getAllByRole('button', { name: '＋ Add access' })[0] as HTMLElement);
    fireEvent.change(keyInput(), { target: { value: SECRET } });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: '＋ Add access' })[0] as HTMLElement);
    expect(keyInput().value).toBe('');
    expect(api.create).not.toHaveBeenCalled();
    expectNoLeak(SECRET);
  });

  it('delete: confirms, says it is not restorable and who still holds it', async () => {
    cabinet = [cred({ hasValue: true, last4: 'abcd', projectIds: ['aurora'] })];
    api.remove.mockImplementation(async () => {
      cabinet = [];
      return { deleted: { kind: 'credential', id: 'c1' }, restorable: false, projectIds: ['aurora'] };
    });
    page();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete from cabinet…' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toMatch(/can't be restored/);
    await waitFor(() => expect(dialog.textContent).toMatch(/Still held by Aurora/));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete for good' }));
    await screen.findByText('The cabinet is empty');
    expect(document.body.textContent).toMatch(/still in the .env of Aurora until their next sync/);
  });

  it('details show env var, instructions and holders — never more than last 4', async () => {
    cabinet = [
      cred({ hasValue: true, last4: 'abcd', instructions: 'Test key only', projectIds: ['aurora'] }),
    ];
    page();
    fireEvent.click(await screen.findByRole('button', { name: /Details/ }));
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/Instructions: Test key only/);
    expect(text).toMatch(/Granted to Aurora/);
    expect(text).toMatch(/Used by 1 project/);
  });
});

describe('ProjectAccessPanel', () => {
  it('toggles a grant (auto-save) and syncs, showing names only', async () => {
    const entry = {
      credentialId: 'c1',
      name: 'Stripe',
      envVar: 'STRIPE',
      serves: 'Payments',
      hasValue: true,
      last4: 'abcd',
    };
    let granted = false;
    const view = () => ({
      projectId: 'aurora',
      granted: +granted,
      total: 1,
      entries: [{ ...entry, granted }],
    });
    api.project.mockImplementation(async () => view());
    api.setGrants.mockImplementation(async (_id: string, g: Record<string, boolean>) => {
      granted = g.c1 as boolean;
      return view();
    });
    api.sync.mockResolvedValue({
      file: '/s/aurora/.env',
      written: ['STRIPE'],
      removed: [],
      missing: [],
      gitignore: 'present',
    });
    render(
      <>
        <ProjectAccessPanel projectId="aurora" projectName="Aurora" />
        <Toaster />
      </>,
    );
    const sw = await screen.findByRole('switch', { name: 'Grant Stripe to Aurora' });
    expect(screen.getByText(/0 of 1/)).toBeTruthy();
    await act(async () => fireEvent.click(sw));
    expect(api.setGrants).toHaveBeenCalledWith('aurora', { c1: true });
    expect(screen.getByText(/1 of 1/)).toBeTruthy();
    expect(screen.getByText('Granted')).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sync to .env' })));
    expect(await screen.findByText('Wrote STRIPE.')).toBeTruthy();
  });
});
