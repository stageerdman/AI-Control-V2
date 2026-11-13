// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Agent, Role, Team } from '../../api/types';
import { RoleCombo } from './RoleCombo';
import { TeamPanel } from './TeamPanels';

const store = vi.hoisted(() => ({
  ensureRole: vi.fn(),
  renameRole: vi.fn(),
  setRoleReporter: vi.fn(),
  setRoleToolsmith: vi.fn(),
  deleteRole: vi.fn(),
}));
vi.mock('./store', () => store);
vi.mock('./fx', () => ({ announce: () => {}, reducedMotion: () => true }));
afterEach(cleanup);
beforeEach(() => {
  for (const f of Object.values(store)) f.mockReset();
});

const ROLES: Role[] = [
  { id: 'r1', name: 'Frontend', agentCount: 2, reporter: false },
  { id: 'r2', name: 'Research', agentCount: 1, reporter: true },
];

function combo(roleId: string | null = 'r1') {
  const onRole = vi.fn();
  const onSaved = vi.fn();
  render(<RoleCombo roles={ROLES} roleId={roleId} onRole={onRole} onSaved={onSaved} />);
  return { onRole, onSaved, input: screen.getByRole('combobox') as HTMLInputElement };
}

describe('RoleCombo — pick or type', () => {
  it('shows the current role; typing a new name offers Create and Enter creates + assigns it', async () => {
    const { onRole, input } = combo();
    expect(input.value).toBe('Frontend');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Sound  Design' } });
    expect(screen.getByRole('option').textContent).toBe('Create “Sound  Design”');
    const created = { id: 'r9', name: 'Sound Design', agentCount: 0, reporter: false };
    store.ensureRole.mockResolvedValue(created);
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(store.ensureRole).toHaveBeenCalledWith('Sound Design');
    expect(onRole).toHaveBeenCalledWith(created);
  });
  it('typing part of a name + Enter picks the existing role (no create)', async () => {
    const { onRole, input } = combo(null);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'resea' } });
    await act(async () => fireEvent.keyDown(input, { key: 'Enter' }));
    expect(store.ensureRole).not.toHaveBeenCalled();
    expect(onRole).toHaveBeenCalledWith(ROLES[1]);
  });
  it('clearing + Enter removes the role; Escape restores the text', async () => {
    const { onRole, input } = combo();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRole).toHaveBeenCalledWith(null);
    fireEvent.change(input, { target: { value: 'zzz' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('Frontend');
  });
});

describe('Edit roles — rename, delete, Files reports', () => {
  it('lists every role with usage and its reporter switch', () => {
    combo();
    fireEvent.click(screen.getByRole('button', { name: 'Edit roles' }));
    const sw = screen.getAllByRole('switch');
    expect(sw.map((s) => [s.getAttribute('aria-label'), s.getAttribute('aria-checked')])).toEqual([
      ['Frontend files reports', 'false'],
      ['Frontend builds own tools', 'false'],
      ['Research files reports', 'true'],
      ['Research builds own tools', 'false'],
    ]);
    expect(screen.getByText('2 agents')).toBeTruthy();
  });
  it('the switch saves reporter for that role', () => {
    combo();
    fireEvent.click(screen.getByRole('button', { name: 'Edit roles' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Frontend files reports' }));
    expect(store.setRoleReporter).toHaveBeenCalledWith('r1', true, expect.any(Function));
  });
  it('the toolsmith switch saves toolsmith for that role', () => {
    combo();
    fireEvent.click(screen.getByRole('button', { name: 'Edit roles' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Research builds own tools' }));
    expect(store.setRoleToolsmith).toHaveBeenCalledWith('r2', true, expect.any(Function));
  });
  it('rename on Enter (normalised); a taken name reverts', async () => {
    const { onSaved } = combo();
    fireEvent.click(screen.getByRole('button', { name: 'Edit roles' }));
    const field = screen.getByRole('textbox', { name: 'Rename role Frontend' }) as HTMLInputElement;
    store.renameRole.mockResolvedValueOnce(true);
    fireEvent.change(field, { target: { value: ' Interface  UI ' } });
    await act(async () => fireEvent.keyDown(field, { key: 'Enter' }));
    expect(store.renameRole).toHaveBeenCalledWith('r1', 'Interface UI');
    expect(onSaved).toHaveBeenCalled();
    store.renameRole.mockResolvedValueOnce(false);
    fireEvent.change(field, { target: { value: 'Research' } });
    await act(async () => fireEvent.keyDown(field, { key: 'Enter' }));
    expect(field.value).toBe('Frontend');
  });
  it('× deletes the role (the store shows the Undo toast)', () => {
    combo();
    fireEvent.click(screen.getByRole('button', { name: 'Edit roles' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete role Research' }));
    expect(store.deleteRole).toHaveBeenCalledWith(ROLES[1], expect.any(Function));
  });
});

describe('TeamPanel — Files reports', () => {
  it('reflects the team flag and saves the flip through onField', () => {
    const team = {
      id: 'expedition',
      name: 'The Expedition',
      blurb: '',
      color: 'teal',
      emblem: 'compass',
      instr: '',
      code: '',
      reporter: true,
      captainId: null,
      members: [],
    } as unknown as Team;
    const onField = vi.fn();
    render(
      <TeamPanel
        team={team}
        teams={[team]}
        byId={new Map<string, Agent>()}
        drill={false}
        picker={false}
        setPicker={() => {}}
        onPreview={() => {}}
        onField={onField}
        onSelect={() => {}}
        onAdd={() => {}}
        onDelete={() => {}}
      />,
    );
    const sw = screen.getByRole('switch', { name: 'Files reports' });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(sw);
    expect(onField).toHaveBeenCalledWith({ reporter: false });
    expect(screen.getByText('What this team does')).toBeTruthy();
    expect(screen.getByText('How this team codes')).toBeTruthy();
  });
});
