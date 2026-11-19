// @vitest-environment happy-dom
/* Thinking power in the Cast panel (design/cast/thinking.md): four steps, one plain line, saves on pick;
   Normal clears the agent's own setting so the kind of work still decides. */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentPanel, type PanelAgent } from './AgentPanel';
import { savedStep, shownStep, THINKING, thinkingAbout } from './thinking';
import { ThinkingDial } from './ThinkingDial';

const agentsApi = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock('./api', () => ({
  castApi: { agents: agentsApi, roles: { list: vi.fn() }, teams: { list: vi.fn() }, restore: vi.fn() },
  KEYS: { agents: 'agents', roles: 'roles', teams: 'teams', tinker: 'tk' },
}));
afterEach(cleanup);
beforeEach(() => {
  agentsApi.update.mockReset();
  agentsApi.update.mockImplementation(async (id: string, patch: object) => ({ id, ...patch }));
});

describe('thinking (pure)', () => {
  it('four steps, light to deepest, each with a plain line', () => {
    expect(THINKING.map((o) => o.label)).toEqual(['Light', 'Normal', 'Deep', 'Deepest']);
    for (const o of THINKING) expect(thinkingAbout(o.step).length).toBeGreaterThan(20);
  });
  it('nothing stored reads as Normal; picking Normal stores nothing', () => {
    expect(shownStep(null)).toBe('normal');
    expect(shownStep(undefined)).toBe('normal');
    expect(shownStep('deep')).toBe('deep');
    expect(savedStep('normal')).toBeNull();
    expect(savedStep('light')).toBe('light');
    expect(savedStep('deepest')).toBe('deepest');
  });
});

describe('ThinkingDial', () => {
  const dial = (onPick = vi.fn()) => {
    render(<ThinkingDial id="t" value="normal" onPick={onPick} />);
    return onPick;
  };
  const group = () => screen.getByRole('radiogroup', { name: 'Thinking power' });

  it('the chosen step is checked and its line describes the group', () => {
    dial();
    expect(screen.getByRole('radio', { name: 'Normal' }).getAttribute('aria-checked')).toBe('true');
    const about = document.getElementById(group().getAttribute('aria-describedby') ?? '');
    expect(about?.textContent).toBe(thinkingAbout('normal'));
  });

  it('hovering a step previews its line; leaving brings the chosen one back', () => {
    dial();
    fireEvent.mouseEnter(screen.getByRole('radio', { name: 'Deepest' }));
    expect(screen.getByText(thinkingAbout('deepest'))).toBeTruthy();
    fireEvent.mouseLeave(group());
    expect(screen.getByText(thinkingAbout('normal'))).toBeTruthy();
  });

  it('click or arrow keys pick a step', () => {
    const onPick = dial();
    fireEvent.click(screen.getByRole('radio', { name: 'Deep' }));
    expect(onPick).toHaveBeenLastCalledWith('deep');
    const normal = screen.getByRole('radio', { name: 'Normal' });
    normal.focus();
    fireEvent.keyDown(normal, { key: 'ArrowLeft' });
    expect(onPick).toHaveBeenLastCalledWith('light');
  });
});

describe('AgentPanel → Thinking', () => {
  const noop = () => {};
  const base: PanelAgent = {
    id: 'a-1',
    kind: 'agent',
    name: 'Brisk',
    roleId: null,
    role: '',
    prompt: '',
    teamIds: [],
    projectIds: [],
    canDelete: { ok: true, why: '' },
    canMail: true,
  };
  const panel = (agent: PanelAgent, draft?: boolean, onSaved = noop) =>
    render(
      <AgentPanel
        agent={agent}
        isNew={!agent.id}
        roles={[]}
        teams={[]}
        onName={noop}
        onRole={noop}
        onPrompt={noop}
        onDelete={noop}
        onSaved={onSaved}
        draft={draft}
      />,
    );
  const region = () => screen.getByRole('region', { name: /Thinking/ });

  it('sits right after the Brain and shows the agent’s own step', () => {
    panel({ ...base, thinking: 'deep' });
    expect(within(region()).getByRole('radio', { name: 'Deep' }).getAttribute('aria-checked')).toBe('true');
    const secs = [...document.querySelectorAll('.zp-sec')];
    expect(secs[secs.indexOf(region()) - 1]?.querySelector('#zpPrompt')).toBeTruthy();
  });

  it('picking a step saves it; picking Normal clears it', async () => {
    const onSaved = vi.fn();
    panel({ ...base, thinking: 'deep' }, false, onSaved);
    fireEvent.click(screen.getByRole('radio', { name: 'Deepest' }));
    await waitFor(() => expect(agentsApi.update).toHaveBeenCalledWith('a-1', { thinking: 'deepest' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Normal' }));
    await waitFor(() => expect(agentsApi.update).toHaveBeenLastCalledWith('a-1', { thinking: null }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2));
  });

  it('crew can be tuned too; hidden for a new recruit or a Tinker draft', () => {
    panel({ ...base, kind: 'orchestrator' });
    expect(screen.getByRole('radio', { name: 'Normal' }).getAttribute('aria-checked')).toBe('true');
    cleanup();
    panel({ ...base, id: '', name: '' });
    expect(screen.queryByRole('radiogroup', { name: 'Thinking power' })).toBeNull();
    cleanup();
    panel(base, true);
    expect(screen.queryByRole('radiogroup', { name: 'Thinking power' })).toBeNull();
  });
});
