// @vitest-environment happy-dom
/* The Cast panel's Tools block (design/cast/tools.md): Edit / Run / Reach in plain rows, empty rows
   say "Nothing", and it only shows for a saved agent whose tool list the server sent. */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ToolList as Tools } from '../../api/types';
import { AgentPanel, type PanelAgent } from './AgentPanel';
import { ToolList } from './ToolList';

afterEach(cleanup);

const FULL: Tools = {
  edit: ['Any file in the project'],
  run: ['git', 'npm', 'node'],
  reach: [
    'Reads every file in the project',
    'Mail to other projects and HQ',
    'Keys granted to its project (never their values)',
  ],
};
const READ_ONLY: Tools = { edit: [], run: [], reach: ['Reads every file in the project'] };

/** Each row as the user reads it: label → its lines. */
function rows() {
  const lines = (t: HTMLElement) =>
    [...(t.parentElement?.querySelectorAll('dd') ?? [])].map((d) => d.textContent);
  return Object.fromEntries(screen.getAllByRole('term').map((t) => [t.textContent, lines(t)]));
}

describe('ToolList', () => {
  it('full kit: three labelled rows; the shell reads as one line', () => {
    render(<ToolList list={FULL} />);
    expect(screen.getAllByRole('term').map((t) => t.textContent)).toEqual(['Edit', 'Run', 'Reach']);
    expect(rows()).toEqual({
      Edit: ['Any file in the project'],
      Run: ['git · npm · node'],
      Reach: FULL.reach,
    });
  });

  it('read only, no shell: the empty rows say so in words, muted', () => {
    render(<ToolList list={READ_ONLY} />);
    expect(rows()).toEqual({
      Edit: ['Nothing — reads only'],
      Run: ['Nothing'],
      Reach: ['Reads every file in the project'],
    });
    expect(screen.getByText('Nothing').className).toBe('tl-none');
  });

  it('scoped edits: one path per line', () => {
    render(<ToolList list={{ ...READ_ONLY, edit: ['updates/**', 'design/**'] }} />);
    expect(rows().Edit).toEqual(['updates/**', 'design/**']);
  });
});

describe('AgentPanel → Tools', () => {
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
  const panel = (agent: PanelAgent, draft?: boolean) =>
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
        onSaved={noop}
        draft={draft}
      />,
    );

  it('a saved agent: a named Tools region right after the Brain, before mail', () => {
    panel({ ...base, toolList: FULL });
    const region = screen.getByRole('region', { name: 'Tools' });
    expect(within(region).getByText('Any file in the project')).toBeTruthy();
    const secs = [...document.querySelectorAll('.zp-sec')];
    const at = secs.indexOf(region);
    expect(secs[at - 1]?.querySelector('#zpPrompt')).toBeTruthy();
    expect(secs[at + 1]?.classList.contains('zp-reports')).toBe(true);
  });

  it('crew (an orchestrator) shows its tools too', () => {
    panel({ ...base, kind: 'orchestrator', toolList: FULL });
    expect(screen.getByRole('region', { name: 'Tools' })).toBeTruthy();
  });

  it('hidden for a new recruit, a Tinker draft, or when the server sent no list', () => {
    panel({ ...base, id: '', name: '', toolList: FULL });
    expect(screen.queryByRole('region', { name: 'Tools' })).toBeNull();
    cleanup();
    panel({ ...base, toolList: FULL }, true);
    expect(screen.queryByRole('region', { name: 'Tools' })).toBeNull();
    cleanup();
    panel(base);
    expect(screen.queryByRole('region', { name: 'Tools' })).toBeNull();
  });
});
