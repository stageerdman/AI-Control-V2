// @vitest-environment happy-dom
/* Invite another — the invite card (InviteDialog, the Cast door), the ＋ Invite another chip + Kin row in the
   zoom panel, and the whole flow from the zoom — against a fake server. */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearQueryCache } from '../../api';
import type { Agent, Look } from '../../api/types';
import { AgentPanel, type PanelAgent } from './AgentPanel';
import { HeroZoom } from './HeroZoom';
import { InviteDialog } from './InviteCard';

const fx = vi.hoisted(() => ({ announce: vi.fn() }));
vi.mock('./fx', async (orig) => ({
  ...(await orig<typeof import('./fx')>()),
  announce: fx.announce,
  reducedMotion: () => true,
}));

const LOOK: Look = { hat: 'beret', tool: 'palette', body: 'hero', antenna: 'bob', face: 'none', hue: 'sun' };
const FAMILY: Look = { ...LOOK, antenna: 'tuft', hue: 'teal' };
const ag = (id: string, name: string, p: Partial<Agent> = {}) =>
  ({
    id,
    name,
    nick: null,
    kind: 'agent',
    look: LOOK,
    role: 'Studio Design',
    roleId: null,
    prompt: 'Design calmly.',
    teamIds: [],
    projectIds: [],
    canDelete: { ok: true },
    canMail: true,
    createdAt: '2026-11-01T00:00:00Z',
    ...p,
  }) as unknown as Agent;
const BLAIR = ag('a-blair', 'Blair');
const MOSS = ag('a-moss', 'Moss', { look: { ...LOOK, hue: 'grape' } });
const CAST = [BLAIR, MOSS];

type Srv = { drafts: { name: string; look: Look }[]; copy: (body: { name: string; look: Look }) => Response };
let srv: Srv;
let calls: { method: string; url: string; body?: unknown }[];
const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
const made = (body: { name: string; look: Look }) =>
  json(ag('a-bea', body.name, { look: body.look, kinId: 'a-blair', kin: ['a-blair'] }), 201);

beforeEach(() => {
  clearQueryCache();
  fx.announce.mockReset();
  calls = [];
  srv = {
    drafts: [
      { name: 'Bea', look: FAMILY },
      { name: 'Bix', look: FAMILY },
    ],
    copy: made,
  };
  location.hash = '#cast/agent/a-blair';
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input).replace(/^https?:\/\/[^/]+/, '');
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url, body });
      if (url === '/agents/a-blair/copy-draft') {
        const d = srv.drafts.shift() ?? { name: 'Bo', look: FAMILY };
        return json(d);
      }
      if (url === '/agents/a-blair/copies' && method === 'POST') return srv.copy(body);
      if (url === '/agents') return json(CAST);
      if (url === '/roles') return json([]);
      return json({ error: { code: 'not_found', message: url } }, 404);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const open = async (agents: Agent[] = CAST) => {
  const onClose = vi.fn();
  const onDone = vi.fn();
  render(<InviteDialog original={BLAIR} agents={agents} onClose={onClose} onDone={onDone} />);
  const name = (await screen.findByDisplayValue('Bea')) as HTMLInputElement;
  return { onClose, onDone, name };
};
const newBot = () => document.querySelector<HTMLElement>('.ic-new .hero');
const addBtn = (label: string) => screen.getByRole('button', { name: label }) as HTMLButtonElement;

describe('the invite card', () => {
  it('opens as a dialog named for the original, in the family look, the name suggested and selected', async () => {
    const { name } = await open();
    expect(screen.getByRole('dialog', { name: 'Invite another agent like Blair' })).toBeTruthy();
    expect(newBot()?.dataset.hue).toBe('teal');
    expect(document.activeElement).toBe(name);
    expect([name.selectionStart, name.selectionEnd]).toEqual([0, 3]);
    expect(screen.getByText('Same role and instructions as Blair.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back to the family look' })).toBeNull();
    expect(addBtn('Add Bea to the Cast').disabled).toBe(false);
  });

  it('the look dice rolls a new look; ↺ Family look brings the first one back', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Random look' }));
    expect(fx.announce).toHaveBeenCalledWith(expect.stringMatching(/^New look: /));
    fireEvent.click(screen.getByRole('button', { name: 'Back to the family look' }));
    expect(newBot()?.dataset.hue).toBe('teal');
    expect(screen.queryByRole('button', { name: 'Back to the family look' })).toBeNull();
    expect(fx.announce).toHaveBeenLastCalledWith(expect.stringMatching(/^Back to the family look: Teal/));
  });

  it('rename it, or let the name dice suggest another; the look never changes with the name', async () => {
    const { name } = await open();
    fireEvent.change(name, { target: { value: 'Juniper' } });
    expect(addBtn('Add Juniper to the Cast')).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Suggest another name' })));
    expect(name.value).toBe('Bix');
    expect(fx.announce).toHaveBeenCalledWith('Name: Bix');
    expect(newBot()?.dataset.hue).toBe('teal');
  });

  it('an empty name can’t be added; a name in the Cast says so under the field', async () => {
    const { name } = await open();
    fireEvent.change(name, { target: { value: '  ' } });
    expect(addBtn('Add them to the Cast').disabled).toBe(true);
    fireEvent.change(name, { target: { value: 'moss' } });
    expect(screen.getByRole('alert').textContent).toBe('There’s already a moss in the Cast.');
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(addBtn('Add moss to the Cast').disabled).toBe(true);
  });

  it('adds the copy with its name and look, once, and hands it back', async () => {
    const { name, onDone } = await open();
    fireEvent.change(name, { target: { value: 'Bea ' } });
    fireEvent.click(addBtn('Add Bea to the Cast'));
    await waitFor(() =>
      expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ id: 'a-bea', name: 'Bea' })),
    );
    expect(calls.filter((c) => c.method === 'POST')).toEqual([
      { method: 'POST', url: '/agents/a-blair/copies', body: { name: 'Bea', look: FAMILY } },
    ]);
    expect(fx.announce).toHaveBeenCalledWith('Bea joined the Cast');
  });

  it('the server says the name was just taken: the field says so', async () => {
    srv.copy = () => json({ error: { code: 'name_taken', message: 'Taken' } }, 409);
    await open();
    fireEvent.click(addBtn('Add Bea to the Cast'));
    expect((await screen.findByRole('alert')).textContent).toBe('There’s already a Bea in the Cast.');
  });

  it('a failed save: the reason in one line and Try again, which works', async () => {
    srv.copy = () => json({ error: { code: 'internal', message: 'The studio hiccuped.' } }, 500);
    const { onDone } = await open();
    fireEvent.click(addBtn('Add Bea to the Cast'));
    expect(await screen.findByText('The studio hiccuped.')).toBeTruthy();
    srv.copy = made;
    fireEvent.click(addBtn('Try again'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('a look identical to a kin: one quiet line and Change colour (never blocks)', async () => {
    srv.drafts = [{ name: 'Bea', look: LOOK }];
    await open();
    expect(screen.getByText('Looks just like Blair. Hard to tell apart in the office.')).toBeTruthy();
    expect(addBtn('Add Bea to the Cast').disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Change colour' }));
    expect(newBot()?.dataset.hue).toBe('coral');
    expect(screen.queryByText(/Looks just like/)).toBeNull();
  });

  it('kin already there: the shares line names them all', async () => {
    const blair = { ...BLAIR, kinId: 'a-blair', kin: ['a-pip'] } as Agent;
    const pip = ag('a-pip', 'Pip', { kinId: 'a-blair', kin: ['a-blair'] });
    render(<InviteDialog original={blair} agents={[blair, pip]} onClose={() => {}} onDone={() => {}} />);
    expect(await screen.findByText('Same role and instructions as Blair and Pip.')).toBeTruthy();
  });

  it('Esc closes only the card (the key never reaches the zoom); × closes too', async () => {
    const zoomKeys = vi.fn();
    document.addEventListener('keydown', zoomKeys);
    const { onClose, name } = await open();
    fireEvent.keyDown(name, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(zoomKeys).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    document.removeEventListener('keydown', zoomKeys);
  });

  it('a click on the dimmed background closes it; clicks inside never do', async () => {
    const { onClose, name } = await open();
    const press = (el: Element) => {
      fireEvent.mouseDown(el);
      fireEvent.click(el);
    };
    press(screen.getByRole('dialog'));
    press(name);
    expect(onClose).not.toHaveBeenCalled();
    press(document.querySelector('.ic-scrim') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('the zoom panel: ＋ Invite another and the Kin row', () => {
  const panel = (agent: PanelAgent, p: { onInvite?: () => void; kin?: Agent[] } = {}) =>
    render(
      <AgentPanel
        agent={agent}
        isNew={false}
        roles={[]}
        teams={[]}
        onName={() => {}}
        onRole={() => {}}
        onPrompt={() => {}}
        onDelete={() => {}}
        onSaved={() => {}}
        {...p}
      />,
    );
  it('the chip opens the card; the Kin row links to each kin', () => {
    const onInvite = vi.fn();
    panel(BLAIR as PanelAgent, { onInvite, kin: [ag('a-bea', 'Bea'), ag('a-pip', 'Pip')] });
    fireEvent.click(screen.getByRole('button', { name: 'Invite another agent like Blair' }));
    expect(onInvite).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Open Bea' }).getAttribute('href')).toBe('#cast/agent/a-bea');
    expect(screen.getByRole('link', { name: 'Open Pip' })).toBeTruthy();
  });
  it('no kin, no row; no door, no chip', () => {
    panel(BLAIR as PanelAgent, { kin: [] });
    expect(screen.queryByRole('navigation', { name: 'Kin' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Invite another/ })).toBeNull();
  });
});

describe('the Cast door, end to end', () => {
  const zoom = (agents: Agent[]) =>
    render(
      <HeroZoom
        id={agents[0]?.id as string}
        animate={false}
        closing={false}
        onClosed={() => {}}
        onCreated={() => {}}
        prefill={null}
        agents={agents}
        roles={[]}
        teams={[]}
      />,
    );
  it('＋ Invite another → the card → Add → the zoom opens the new copy', async () => {
    zoom(CAST);
    fireEvent.click(screen.getByRole('button', { name: 'Invite another agent like Blair' }));
    const name = await screen.findByDisplayValue('Bea');
    fireEvent.change(name, { target: { value: 'Bo' } });
    fireEvent.click(addBtn('Add Bo to the Cast'));
    await waitFor(() => expect(location.hash).toBe('#cast/agent/a-bea'));
    expect(screen.queryByRole('dialog', { name: /Invite another/ })).toBeNull();
  });
  it('crew get no door', () => {
    zoom([ag('a-max', 'Max', { kind: 'orchestrator' }), BLAIR]);
    expect(screen.queryByRole('button', { name: /Invite another/ })).toBeNull();
  });
  it('Esc in the card closes the card, not the zoom', async () => {
    zoom(CAST);
    fireEvent.click(screen.getByRole('button', { name: 'Invite another agent like Blair' }));
    fireEvent.keyDown(await screen.findByDisplayValue('Bea'), { key: 'Escape' });
    expect(screen.queryByDisplayValue('Bea')).toBeNull();
    expect(location.hash).toBe('#cast/agent/a-blair');
  });
});
