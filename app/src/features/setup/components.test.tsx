// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Agent, Draft, Team } from '../../api';
import { DraftCard } from './DraftCard';
import { planView } from './flow';
import { PlanStage } from './PlanStage';

const remove = vi.fn();
vi.mock('./drafts', () => ({ deleteDraft: (...a: unknown[]) => remove(...a), DRAFTS_KEY: 'drafts' }));
afterEach(cleanup);

const look = { hat: 'none', tool: 'none', body: 'hero', antenna: 'none', face: 'none', hue: 'sun' };
const agent = (id: string, name: string, kind: Agent['kind'] = 'agent') =>
  ({ id, name, nick: null, kind, look, prompt: '' }) as unknown as Agent;
const agents = [
  agent('a1', 'Captain'),
  agent('a2', 'Pete'),
  agent('a4', 'Querious'),
  agent('a-pixel', 'Pixel', 'orchestrator'),
];
const teams = [
  {
    id: 'ship-it',
    name: 'The Ship-It Squad',
    color: 'sun',
    emblem: 'rocket',
    captainId: 'a1',
    members: [
      { agentId: 'a1', instr: '' },
      { agentId: 'a2', instr: '' },
    ],
  },
] as unknown as Team[];

describe('PlanStage (the plan as the API sends it)', () => {
  it('teams with their own captain, specialists, the Creator’s briefs as ghosts', () => {
    const view = planView(
      {
        teams: [{ teamId: 'ship-it', why: 'builds features end to end' }],
        specialists: [{ agentId: 'a4', why: 'data' }],
        newAgents: [{ brief: 'A specialist for accessibility' }],
        newTeams: [{ brief: 'A team for mobile' }],
        summary: 'Ship-It leads.',
      },
      teams,
      agents,
    );
    const { container } = render(
      <PlanStage
        view={view}
        orch={agents[3]}
        creator={agent('a-creator', 'Tinker', 'creator')}
        busy="creator"
      />,
    );
    expect(screen.getByText('Ship-It Squad')).toBeTruthy(); // "The " dropped, as in the prototype
    expect(container.querySelector('[title="builds features end to end"]')).toBeTruthy();
    expect(screen.getByText('New team')).toBeTruthy();
    expect(screen.getByText('A team for mobile')).toBeTruthy();
    expect(screen.getByText('A specialist for accessibility')).toBeTruthy();
    expect(screen.getByText('Querious')).toBeTruthy();
    expect(screen.getByText('Tinker')).toBeTruthy(); // the Creator on stage while it designs
    expect(container.querySelectorAll('.np-gmem .hero').length).toBeGreaterThanOrEqual(2 + 2 + 2);
  });
  it('before the first proposal: just the orchestrator, thinking', () => {
    const { container } = render(<PlanStage view={null} orch={agents[3]} creator={undefined} busy="orch" />);
    expect(container.querySelectorAll('.np-group')).toHaveLength(0);
    expect(container.querySelector('.np-lead .hero')?.className).toContain('pose-thinking');
  });
});

describe('DraftCard', () => {
  const d = { id: 'd-1', mode: 'adopt', step: 2, name: 'Kiln', orchestratorId: 'a-pixel' } as Draft;
  it('resumes at its step and deletes (with undo, via deleteDraft)', () => {
    render(<DraftCard draft={d} orchestrators={[agents[3]]} />);
    const resume = screen.getByRole('button', { name: 'Resume Kiln — step 3 of 5, Orchestrator' });
    expect(resume.textContent).toContain('Adopting · Orchestrator · Pixel');
    fireEvent.click(resume);
    expect(location.hash).toBe('#new/d-1');
    fireEvent.click(screen.getByRole('button', { name: 'Delete draft Kiln' }));
    expect(remove).toHaveBeenCalledWith('d-1', 'Kiln');
  });
});
