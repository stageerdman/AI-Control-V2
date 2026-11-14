// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { clearQueryCache } from '../../api/query';
import { Sheet, Toaster } from '../../ui';
import type { Access, AccessField, ProjectAccess } from './api';
import {
  flipsOffSavedSecret,
  metaOf,
  planSave,
  type Row,
  removalNote,
  rowsOf,
  secretByDefault,
  suggestEnvVar,
  templateRows,
  withLabel,
} from './editor';
import { accessMeta, credLook, envVarFor, fieldShown, initials, masked } from './mark';

const SECRET = 'sk-live-SUPERSECRET-0000-1234abcd';
const SECRET2 = 'whsec-ROTATED-SECRET-9999-zz77';

const now = '2026-11-14T10:00:00.000Z';
const field = (over: Partial<AccessField> = {}): AccessField => ({
  id: 'f1',
  label: 'Secret key',
  envVar: 'STRIPE_SECRET_KEY',
  secret: true,
  hasValue: false,
  last4: null,
  ...over,
});
const access = (over: Partial<Access> = {}): Access => ({
  id: 'a-stripe',
  name: 'Stripe',
  serves: 'Payments',
  docsUrl: null,
  instructions: '',
  fields: [field()],
  projectIds: [],
  createdAt: now,
  updatedAt: now,
  ...over,
});
let cabinet: Access[] = [];

const api = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  addField: vi.fn(),
  updateField: vi.fn(),
  removeField: vi.fn(),
  setValue: vi.fn(),
  project: vi.fn(),
  grant: vi.fn(),
  revoke: vi.fn(),
  seen: vi.fn(),
  sync: vi.fn(),
}));
vi.mock('./api', () => ({
  accessApi: api,
  keys: { cabinet: 'accesses', project: (id: string) => `accesses:project:${id}` },
}));
vi.mock('../../api/studio', () => ({
  studio: {
    projects: { list: async () => [{ id: 'aurora', name: 'Aurora' }] },
    accesses: { list: async () => cabinet },
  },
}));

const { AccessPage } = await import('./AccessPage');
const { fieldError } = await import('./AccessEditor');
const { ProjectAccessPanel, syncSummary, withGrant, sortForSafe, fieldLine } = await import(
  './ProjectAccessPanel'
);

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
  api.seen.mockResolvedValue({ projectId: 'aurora', seenAt: now });
});
afterEach(cleanup);

describe('marks, masks and lines', () => {
  it('known services get the prototype marks; others initials + a stable colour', () => {
    expect(credLook({ name: 'GitHub' }).mark).toBe('GH');
    expect(credLook({ name: 'Anthropic' }).mark).toBe('✳');
    expect(credLook({ name: 'Sentry' }).mark).toBe('Se');
    expect(credLook({ name: 'Sentry' })).toEqual(credLook({ name: 'Sentry' }));
    expect(initials('my api')).toBe('MA');
    expect(initials('  ')).toBe('?');
  });
  it('masked shows only the last 4; a field shows masked, plain (clipped) or "no value yet"', () => {
    expect(masked({ hasValue: true, last4: '7Qx2' })).toBe('••••7Qx2');
    expect(masked({ hasValue: false, last4: null })).toBeNull();
    expect(fieldShown(field({ hasValue: true, last4: 'wxyz' }))).toEqual({
      text: '••••wxyz',
      kind: 'masked',
    });
    expect(fieldShown(field({ secret: false, hasValue: true, value: 'stage' }))).toEqual({
      text: 'stage',
      kind: 'plain',
    });
    const long = fieldShown(
      field({ secret: false, hasValue: true, value: 'pk_test_51HxABCDEFGHIJKLMNOPQRSTUV' }),
    );
    expect(long.text).toHaveLength(24);
    expect(long.full).toBe('pk_test_51HxABCDEFGHIJKLMNOPQRSTUV');
    expect(fieldShown(field())).toEqual({ text: 'no value yet', kind: 'none' });
  });
  it('the cabinet meta line: fields, missing values, usage (one field = usage only)', () => {
    const three = access({
      fields: [field({ hasValue: true }), field({ id: 'f2' }), field({ id: 'f3', hasValue: true })],
      projectIds: ['a', 'b'],
    });
    expect(accessMeta(three)).toEqual({
      fields: '3 fields',
      missing: '1 without a value',
      used: 'Used by 2 projects',
    });
    expect(accessMeta(access({ projectIds: ['a'] }))).toEqual({
      fields: null,
      missing: null,
      used: 'Used by 1 project',
    });
    expect(accessMeta(access()).used).toBe('Used by no projects');
  });
  it('env var preview follows the server rule: name + label', () => {
    expect(envVarFor('Open AI key')).toBe('OPEN_AI_KEY');
    expect(suggestEnvVar('Stripe', 'Secret key')).toBe('STRIPE_SECRET_KEY');
    expect(suggestEnvVar('', '')).toBe('ACCESS_KEY');
  });
  it('summaries name accesses and env vars, never values', () => {
    expect(
      syncSummary({
        file: '/x/.env',
        written: ['A', 'B'],
        removed: ['C'],
        missing: ['D'],
        gitignore: 'added',
      }),
    ).toBe('Wrote A, B · removed C · no value yet for D · added .env to .gitignore.');
  });
  it('the safe field line: names, ••••last4 for secrets, (no value yet), then …N more', () => {
    const a = access({
      fields: [
        field({ hasValue: true, last4: 'wxyz' }),
        field({ id: 'f2', envVar: 'STRIPE_PUBLISHABLE_KEY', secret: false, hasValue: true, value: 'pk' }),
        field({ id: 'f3', envVar: 'STRIPE_WEBHOOK_SECRET' }),
        field({ id: 'f4', envVar: 'STRIPE_ACCOUNT', secret: false, hasValue: true, value: 'acct' }),
      ],
    });
    const l = fieldLine(a);
    expect(l.shown.map((f) => [f.envVar, f.extra])).toEqual([
      ['STRIPE_SECRET_KEY', '••••wxyz'],
      ['STRIPE_PUBLISHABLE_KEY', null],
      ['STRIPE_WEBHOOK_SECRET', '(no value yet)'],
    ]);
    expect(l.more).toBe(1);
    expect(fieldLine(access()).more).toBe(0);
  });
});

describe('the editor model', () => {
  it('templates set labels and the secret flags correctly', () => {
    const pick = (id: Parameters<typeof templateRows>[0]) => templateRows(id).map((r) => [r.label, r.secret]);
    expect(pick('api')).toEqual([['API key', true]]);
    expect(pick('userpass')).toEqual([
      ['Username', false],
      ['Password', true],
    ]);
    expect(pick('urltoken')).toEqual([
      ['URL', false],
      ['Token', true],
    ]);
  });
  it('the label decides Secret until the toggle is touched', () => {
    expect(['API key', 'Token', 'Webhook secret', 'Password', 'db pwd'].every(secretByDefault)).toBe(true);
    expect(['Username', 'URL', 'Account'].some(secretByDefault)).toBe(false);
    const r: Row = { key: 'k', label: '', envVar: '', secret: false, secretSet: false, value: '' };
    expect(withLabel(r, 'Secret key').secret).toBe(true);
    expect(withLabel({ ...r, secretSet: true }, 'Secret key').secret).toBe(false);
  });
  it('create: one request, secrets from the map, plain values from the rows, env var only when typed', () => {
    const rows = templateRows('userpass');
    const [user, pass] = rows as [Row, Row];
    user.value = 'stage';
    const ops = planSave(undefined, { ...metaOf(), name: ' Postgres ' }, rows, new Map([[pass.key, SECRET]]));
    expect(ops).toEqual([
      {
        op: 'create',
        body: {
          name: 'Postgres',
          serves: '',
          docsUrl: null,
          instructions: '',
          fields: [
            { label: 'Username', secret: false, value: 'stage' },
            { label: 'Password', secret: true, value: SECRET },
          ],
        },
      },
    ]);
  });
  it('edit: meta diff, label/secret patches, pasted secrets, plain value only when changed, adds, removes', () => {
    const before = access({
      fields: [
        field({ hasValue: true, last4: 'abcd' }),
        field({
          id: 'f2',
          label: 'Account',
          envVar: 'STRIPE_ACCOUNT',
          secret: false,
          hasValue: true,
          value: 'acct',
        }),
        field({ id: 'f3', label: 'Old', envVar: 'STRIPE_OLD' }),
      ],
    });
    const rows = rowsOf(before);
    const [key, acct] = rows as [Row, Row, Row];
    acct.label = 'Account id';
    const added = { ...templateRows('api')[0], label: 'Webhook secret' } as Row;
    const ops = planSave(
      before,
      { ...metaOf(before), serves: 'Payments: checkout' },
      [key, acct, added],
      new Map([
        [key.key, SECRET],
        [added.key, SECRET2],
      ]),
    );
    expect(ops).toEqual([
      { op: 'meta', body: { serves: 'Payments: checkout' } },
      { op: 'setValue', fieldId: 'f1', value: SECRET },
      { op: 'patchField', fieldId: 'f2', body: { label: 'Account id' } },
      { op: 'removeField', fieldId: 'f3' },
      { op: 'addField', key: added.key, body: { label: 'Webhook secret', secret: true, value: SECRET2 } },
    ]);
    expect(planSave(before, metaOf(before), rowsOf(before), new Map())).toEqual([]); // nothing changed
  });
  it('replacing every saved field removes the last one only after the adds (an access keeps ≥ 1 field)', () => {
    const before = access();
    const fresh = templateRows('urltoken');
    const ops = planSave(before, metaOf(before), fresh, new Map());
    expect(ops.map((o) => o.op)).toEqual(['addField', 'addField', 'removeField']);
  });
  it('turning Secret off on a saved secret: moved aside, re-added plain under its env var, the old one dropped', () => {
    const before = access({ fields: [field({ hasValue: true, last4: 'abcd' })] });
    const [r] = rowsOf(before) as [Row];
    r.secret = false;
    expect(flipsOffSavedSecret(r)).toBe(true);
    expect(planSave(before, metaOf(before), [r], new Map())).toEqual([
      { op: 'patchField', fieldId: 'f1', body: { envVar: 'STRIPE_SECRET_KEY_OLD' } },
      {
        op: 'addField',
        key: r.key,
        body: { label: 'Secret key', envVar: 'STRIPE_SECRET_KEY', secret: false },
      },
      { op: 'removeField', fieldId: 'f1' },
    ]);
  });
  it('the removal note names the env vars projects still hold', () => {
    const before = access({
      projectIds: ['aurora'],
      fields: [field(), field({ id: 'f2', envVar: 'STRIPE_HOOK' })],
    });
    expect(removalNote(before, rowsOf(before).slice(0, 1))).toBe(
      'Removing STRIPE_HOOK — projects keep it in their .env until their next sync.',
    );
    expect(removalNote({ ...before, projectIds: [] }, [])).toBeNull();
  });
  it('server errors become the row line the spec asks for', () => {
    expect(
      fieldError(
        new ApiError(409, 'conflict', "'DATABASE_URL' is already in the cabinet as 'Postgres prod'"),
      ),
    ).toBe('Already used by Postgres prod');
    expect(
      fieldError(
        new ApiError(422, 'invalid', 'Request validation failed', [
          { path: 'fields.0.envVar', message: 'x' },
        ]),
      ),
    ).toBe('Letters, digits and _ only');
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
  const openAdd = async () => {
    await screen.findByText('The cabinet is empty');
    fireEvent.click(screen.getAllByRole('button', { name: '＋ Add new access' })[0] as HTMLElement);
    return screen.getByRole('dialog', { name: 'Add new access' });
  };

  it('add (Username + password): secrets cleared before the request, list shows last-4 and the plain value only', async () => {
    let sawCleared = false;
    api.create.mockImplementation(
      async (body: { name: string; fields: { label: string; value?: string }[] }) => {
        sawCleared = [...document.querySelectorAll<HTMLInputElement>('input[type=password]')].every(
          (i) => !i.value,
        );
        expect(body.fields.map((f) => f.value)).toEqual(['stage', SECRET]); // sent once, verbatim
        cabinet = [
          access({
            name: body.name,
            fields: [
              field({
                id: 'f1',
                label: 'Username',
                envVar: 'PG_USERNAME',
                secret: false,
                hasValue: true,
                value: 'stage',
              }),
              field({
                id: 'f2',
                label: 'Password',
                envVar: 'PG_PASSWORD',
                hasValue: true,
                last4: SECRET.slice(-4),
              }),
            ],
          }),
        ];
        return cabinet[0];
      },
    );
    page();
    const dialog = await openAdd();
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Username + password' }));
    expect(
      within(dialog).getByRole('button', { name: 'Secret: Username' }).getAttribute('aria-pressed'),
    ).toBe('false');
    expect(
      within(dialog).getByRole('button', { name: 'Secret: Password' }).getAttribute('aria-pressed'),
    ).toBe('true');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'PG' } });
    fireEvent.change(within(dialog).getByLabelText('Value for Username'), { target: { value: 'stage' } });
    const pw = within(dialog).getByLabelText('Value for Password') as HTMLInputElement;
    expect(pw.type).toBe('password');
    fireEvent.input(pw, { target: { value: SECRET } });
    expect(within(dialog).queryByRole('radiogroup')).toBeNull(); // templates step aside once a value is typed
    expect(document.documentElement.outerHTML).not.toContain(SECRET);
    fireEvent.submit(dialog.querySelector('form') as HTMLFormElement);
    expect(pw.value).toBe(''); // cleared before the request resolves
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sawCleared).toBe(true);
    expect(api.create).toHaveBeenCalledOnce();
    fireEvent.click(await screen.findByRole('button', { name: /Details/ }));
    expect(await screen.findByText('••••abcd')).toBeTruthy();
    expect(screen.getByText('stage')).toBeTruthy();
    expect(document.body.textContent).toMatch(/2 fields · Used by no projects/);
    expectNoLeak(SECRET);
  });

  it('edit: a failed save clears the secret and says so; replacing per field never shows the old value', async () => {
    cabinet = [access({ fields: [field({ hasValue: true, last4: 'abcd' })], projectIds: ['aurora'] })];
    api.setValue.mockRejectedValueOnce(new ApiError(422, 'invalid', 'A key must be a single line'));
    api.setValue.mockImplementationOnce(async () => {
      cabinet = [access({ fields: [field({ hasValue: true, last4: 'zz77' })], projectIds: ['aurora'] })];
      return cabinet[0];
    });
    page();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Stripe' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit Stripe' });
    const v = within(dialog).getByLabelText('Value for Secret key') as HTMLInputElement;
    expect(v.placeholder).toBe('••••abcd — paste to replace');
    expect((within(dialog).getByLabelText('Env var for Secret key') as HTMLInputElement).readOnly).toBe(true);
    fireEvent.input(v, { target: { value: SECRET2 } });
    fireEvent.submit(dialog.querySelector('form') as HTMLFormElement);
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(
      /Nothing was saved — paste the secrets again/,
    );
    expect(v.value).toBe('');
    expectNoLeak(SECRET2);

    fireEvent.input(v, { target: { value: SECRET2 } });
    fireEvent.submit(dialog.querySelector('form') as HTMLFormElement);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.setValue).toHaveBeenLastCalledWith('a-stripe', 'f1', SECRET2);
    expect(await screen.findByText('••••zz77')).toBeTruthy();
    expect(document.body.textContent).toMatch(/Stripe saved — 1 new secret in, still masked/);
    expectNoLeak(SECRET2);
  });

  it('turning Secret off on a saved field clears its value input and says why', async () => {
    cabinet = [access({ fields: [field({ hasValue: true, last4: 'abcd' })] })];
    page();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Stripe' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.input(within(dialog).getByLabelText('Value for Secret key'), { target: { value: SECRET } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Secret: Secret key' }));
    const plain = within(dialog).getByLabelText('Value for Secret key') as HTMLInputElement;
    expect(plain.type).not.toBe('password');
    expect(plain.value).toBe('');
    expect(dialog.textContent).toMatch(/Not secret any more — paste the value again/);
    expectNoLeak(SECRET);
  });

  it('closing the sheet discards typed secrets; ✕ is disabled on the only field', async () => {
    page();
    const dialog = await openAdd();
    expect(
      (within(dialog).getByRole('button', { name: 'Remove API key' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.input(within(dialog).getByLabelText('Value for API key'), { target: { value: SECRET } });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    const again = await openAdd();
    expect((within(again).getByLabelText('Value for API key') as HTMLInputElement).value).toBe('');
    expect(api.create).not.toHaveBeenCalled();
    expectNoLeak(SECRET);
  });

  it('delete: confirms, says it is not restorable and which env vars holders keep', async () => {
    cabinet = [
      access({ projectIds: ['aurora'], fields: [field(), field({ id: 'f2', envVar: 'STRIPE_HOOK' })] }),
    ];
    api.remove.mockImplementation(async () => {
      cabinet = [];
      return { deleted: { kind: 'access', id: 'a-stripe' }, restorable: false, projectIds: ['aurora'] };
    });
    page();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Stripe' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete access…' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toMatch(/all 2 fields .* can't be restored/);
    await waitFor(() =>
      expect(dialog.textContent).toMatch(/Still held by Aurora .*STRIPE_SECRET_KEY, STRIPE_HOOK/),
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete for good' }));
    await screen.findByText('The cabinet is empty');
  });
});

describe('ProjectAccessPanel (the safe)', () => {
  const view = (over: Partial<ProjectAccess> = {}, granted = false, isNew = false): ProjectAccess => ({
    projectId: 'aurora',
    granted: +granted,
    total: 1,
    seenAt: now,
    newCount: +isNew,
    accesses: [{ ...access({ fields: [field({ hasValue: true, last4: 'abcd' })] }), granted, isNew }],
    ...over,
  });

  it('grants a whole access (auto-save) and syncs, names only', async () => {
    let granted = false;
    api.project.mockImplementation(async () => view({}, granted));
    api.grant.mockImplementation(async () => {
      granted = true;
      return view({}, true);
    });
    api.sync.mockResolvedValue({
      file: '/s/.env',
      written: ['STRIPE_SECRET_KEY'],
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
    expect(screen.getByText(/0 of 1 access/)).toBeTruthy();
    expect(screen.getByText('STRIPE_SECRET_KEY')).toBeTruthy();
    await act(async () => fireEvent.click(sw));
    expect(api.grant).toHaveBeenCalledWith('aurora', 'a-stripe');
    expect(screen.getByText('Granted')).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sync to .env' })));
    expect(await screen.findByText('Wrote STRIPE_SECRET_KEY.')).toBeTruthy();
  });

  it('the "new" dot: marked seen on open, stays until the sheet closes, gone on the next open', async () => {
    let isNew = true;
    api.project.mockImplementation(async () => view({}, false, isNew));
    api.seen.mockImplementation(async () => {
      isNew = false;
      return { projectId: 'aurora', seenAt: now };
    });
    const ui = (open: boolean) => (
      <Sheet open={open} onClose={() => {}} label="Aurora access">
        {open && <ProjectAccessPanel projectId="aurora" projectName="Aurora" />}
      </Sheet>
    );
    const { rerender } = render(ui(true));
    await screen.findByRole('switch');
    await waitFor(() => expect(api.seen).toHaveBeenCalledOnce());
    expect(screen.getByText(/New since you last looked/)).toBeTruthy();
    expect(document.querySelector('.pa-new.on')).toBeTruthy();
    rerender(ui(false));
    clearQueryCache(); // what closing the safe does: refetch
    rerender(ui(true));
    await screen.findByRole('switch');
    expect(screen.queryByText(/New since you last looked/)).toBeNull();
    expect(document.querySelector('.pa-new.on')).toBeNull();
  });

  it('withGrant flips one access and recounts; new ones sort first, then A–Z', () => {
    const a = view({ total: 2 });
    const two = {
      ...a,
      accesses: [...a.accesses, { ...a.accesses[0], id: 'b', name: 'Anthropic' }],
    } as ProjectAccess;
    expect(withGrant(two, 'b', true).granted).toBe(1);
    expect(sortForSafe(two.accesses, new Set()).map((x) => x.name)).toEqual(['Anthropic', 'Stripe']);
    expect(sortForSafe(two.accesses, new Set(['a-stripe'])).map((x) => x.name)).toEqual([
      'Stripe',
      'Anthropic',
    ]);
  });
});
