// @vitest-environment happy-dom
/* Look editor: the parts tray (see all, try on, pick), its keyboard, and in the hero zoom — tried-on
   looks never save, a pick saves once, Esc closes only the tray, and ↺ Undo look returns the
   look the agent had when you opened them. */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearQueryCache, setQueryData, useQuery } from '../../api';
import type { Agent, Look } from '../../api/types';
import { LOOK_SLOTS } from '../../characters';
import { HeroZoom } from './HeroZoom';
import { LookRig } from './LookRig';
import { flushAll } from './store';

const agentsApi = vi.hoisted(() => ({
  list: vi.fn(),
  busy: vi.fn(),
  remove: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
}));
vi.mock('./api', () => ({
  castApi: { agents: agentsApi, roles: { list: vi.fn() }, teams: { list: vi.fn() }, restore: vi.fn() },
  KEYS: { agents: 'agents', roles: 'roles', teams: 'teams', tinker: 'tk' },
}));
vi.mock('./fx', async (orig) => ({
  ...(await orig<typeof import('./fx')>()),
  announce: vi.fn(),
  reducedMotion: () => true,
}));
afterEach(cleanup);
beforeEach(() => {
  for (const f of Object.values(agentsApi)) f.mockReset();
  agentsApi.busy.mockResolvedValue({ busy: false, sessions: [] });
  agentsApi.update.mockImplementation(async (id: string, patch: Partial<Agent>) => ({
    ...HA,
    id,
    ...patch,
  }));
  clearQueryCache();
  location.hash = '#cast/agent/a-c';
});

const look: Look = { hat: 'none', tool: 'none', body: 'hero', antenna: 'none', face: 'none', hue: 'mint' };
const HA = {
  id: 'a-c',
  kind: 'agent',
  name: 'Health Analyst',
  roleId: null,
  role: 'Code Reviewer',
  prompt: '',
  teamIds: [],
  projectIds: [],
  canDelete: { ok: true },
  canMail: true,
  look,
} as unknown as Agent;
const HATS = LOOK_SLOTS.find((s) => s.id === 'hat')?.options ?? [];

describe('LookRig — parts tray', () => {
  const rig = () => {
    const onTry = vi.fn();
    const onPick = vi.fn();
    render(
      <LookRig
        look={look}
        px={300}
        name="Health Analyst"
        onSlot={() => {}}
        onDice={() => {}}
        onTry={onTry}
        onPick={onPick}
      />,
    );
    return { onTry, onPick };
  };
  const hatTag = () => screen.getByRole('button', { name: /^Hat: .* — show all hats$/ });

  it('the slot tag opens a listbox of every option; the current one is selected and focused', () => {
    rig();
    expect(hatTag().getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(hatTag());
    expect(hatTag().getAttribute('aria-expanded')).toBe('true');
    const box = screen.getByRole('listbox', { name: 'Hats' });
    const opts = within(box).getAllByRole('option');
    expect(opts).toHaveLength(HATS.length);
    const cur = opts.filter((o) => o.getAttribute('aria-selected') === 'true');
    expect(cur).toHaveLength(1);
    expect(cur[0]?.getAttribute('aria-label')).toMatch(/, current$/);
    expect(document.activeElement).toBe(cur[0]);
  });

  it('hover tries an option on, never picks it; click picks once and closes', () => {
    const { onTry, onPick } = rig();
    fireEvent.click(hatTag());
    const beret = screen.getByRole('option', { name: 'Beret' });
    fireEvent.pointerEnter(beret);
    expect(onTry).toHaveBeenLastCalledWith(expect.objectContaining({ hat: 'beret' }));
    expect(onPick).not.toHaveBeenCalled();
    fireEvent.click(beret);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('hat', expect.objectContaining({ hat: 'beret' }));
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(hatTag());
  });

  it('picking the current option changes nothing', () => {
    const { onPick } = rig();
    fireEvent.click(hatTag());
    fireEvent.click(screen.getByRole('option', { name: /, current$/ }));
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('arrows / Home / End move focus and try on; Enter picks', () => {
    const { onTry, onPick } = rig();
    fireEvent.click(hatTag());
    const opts = screen.getAllByRole('option');
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(opts[1]);
    expect(onTry).toHaveBeenLastCalledWith(expect.objectContaining({ hat: HATS[1] }));
    fireEvent.keyDown(document.activeElement as Element, { key: 'End' });
    expect(document.activeElement).toBe(opts.at(-1));
    fireEvent.keyDown(document.activeElement as Element, { key: 'Home' });
    expect(document.activeElement).toBe(opts[0]);
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(opts[5]);
    fireEvent.keyDown(document.activeElement as Element, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith('hat', expect.objectContaining({ hat: HATS[5] }));
  });

  it('Esc closes the tray only: back to the saved look, focus on the tag, the key is consumed', () => {
    const { onTry, onPick } = rig();
    fireEvent.click(hatTag());
    fireEvent.pointerEnter(screen.getByRole('option', { name: 'Beret' }));
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => {
      (document.activeElement as Element).dispatchEvent(ev);
    });
    expect(ev.defaultPrevented).toBe(true);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onTry).toHaveBeenLastCalledWith(null);
    expect(onPick).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(hatTag());
  });

  it('a click outside closes it', () => {
    rig();
    fireEvent.click(hatTag());
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('colour: seven named swatches', () => {
    rig();
    fireEvent.click(screen.getByRole('button', { name: /show all colours$/ }));
    const names = screen.getAllByRole('option').map((o) => o.getAttribute('aria-label'));
    expect(names).toHaveLength(7);
    expect(names.every((n) => n && /^[A-Z][a-z]+(, current)?$/.test(n))).toBe(true);
  });

  it('without onPick the tags are plain labels (no tray)', () => {
    render(<LookRig look={look} px={300} onSlot={() => {}} onDice={() => {}} />);
    expect(screen.queryByRole('button', { name: /show all/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Undo look/ })).toBeNull();
  });
});

/* the Cast page's part: the zoom reads the live roster (saves show at once) */
function Harness() {
  const { data } = useQuery<Agent[]>('agents', agentsApi.list);
  /* the zoom sizes its bot (and shows the rig) from the scene it opens in */
  return (
    <div className="scene">
      <div className="cast-world" />
      <HeroZoom
        id="a-c"
        animate={false}
        closing={false}
        onClosed={() => {}}
        onCreated={() => {}}
        prefill={null}
        agents={data ?? []}
        roles={[]}
        teams={[]}
      />
    </div>
  );
}

describe('HeroZoom — try on, pick, Undo look', () => {
  const zoom = async () => {
    setQueryData<Agent[]>('agents', [HA]);
    await act(async () => {
      render(<Harness />);
    });
    /* the zoom finishes opening (focus lands on its title) before anyone touches the rig */
    await waitFor(() => expect(document.activeElement?.id).toBe('zhTitle'));
  };
  const hatTag = () => screen.getByRole('button', { name: /show all hats$/ });
  const undoBtn = () => screen.queryByRole('button', { name: /^Undo look changes/ });
  const settle = () =>
    act(async () => {
      flushAll();
      await Promise.resolve();
    });

  it('hovering tray options never saves; a pick saves once', async () => {
    await zoom();
    fireEvent.click(hatTag());
    fireEvent.pointerEnter(screen.getByRole('option', { name: 'Beret' }));
    expect(screen.getByRole('listbox', { name: 'Hats' })).toBeTruthy();
    fireEvent.pointerEnter(screen.getByRole('option', { name: 'Little crown' }));
    expect(screen.getByRole('listbox', { name: 'Hats' })).toBeTruthy();
    await settle();
    expect(screen.getByRole('listbox', { name: 'Hats' })).toBeTruthy();
    expect(agentsApi.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('option', { name: 'Little crown' }));
    await settle();
    expect(agentsApi.update).toHaveBeenCalledTimes(1);
    expect(agentsApi.update).toHaveBeenCalledWith('a-c', { look: expect.objectContaining({ hat: 'crown' }) });
    expect(hatTag().getAttribute('aria-label')).toMatch(/^Hat: Little crown/);
  });

  it('Esc in the tray keeps the zoom open and saves nothing', async () => {
    await zoom();
    fireEvent.click(hatTag());
    fireEvent.pointerEnter(screen.getByRole('option', { name: 'Beret' }));
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    await settle();
    expect(location.hash).toBe('#cast/agent/a-c');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(agentsApi.update).not.toHaveBeenCalled();
    expect(undoBtn()).toBeNull();
  });

  it('Undo look: hidden on open, shown after a change, returns the opening look', async () => {
    await zoom();
    expect(undoBtn()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next hat' }));
    const u = undoBtn();
    expect(u).not.toBeNull();
    expect(u?.getAttribute('aria-label')).toContain('Health Analyst');
    await settle();
    fireEvent.click(u as HTMLElement);
    await settle();
    expect(agentsApi.update).toHaveBeenLastCalledWith('a-c', { look });
    expect(undoBtn()).toBeNull();
  });

  it('Undo look: a tray pick shows it; changing back by hand hides it', async () => {
    await zoom();
    fireEvent.click(hatTag());
    fireEvent.click(screen.getByRole('option', { name: 'Beret' }));
    expect(undoBtn()).not.toBeNull();
    fireEvent.click(hatTag());
    fireEvent.click(screen.getByRole('option', { name: 'No hat' }));
    expect(undoBtn()).toBeNull();
  });
});
