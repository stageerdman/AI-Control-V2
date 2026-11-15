// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Agent, Draft, Team } from '../../api';
import { DraftCard } from './DraftCard';
import { joinLine, planView, ROOM0, roomDoing, roomFold, roomLabel } from './flow';
import { PlanStage, type StageRoom } from './PlanStage';
import { chatWho } from './TeamStep';

const noRoom: StageRoom = {
  guests: [],
  doing: {},
  entering: new Set(),
  label: 'In the room: Pixel',
  announce: '',
};

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
        busy="creator"
        room={{
          ...noRoom,
          guests: [{ agent: agent('a-creator', 'Tinker', 'creator'), why: 'design a new team' }],
          doing: { 'a-creator': { pose: 'pressing', label: 'designing' } },
          label: 'In the room: Pixel, Tinker',
        }}
      />,
    );
    expect(screen.getByText('Ship-It Squad')).toBeTruthy(); // "The " dropped, as in the prototype
    expect(container.querySelector('[title="builds features end to end"]')).toBeTruthy();
    expect(screen.getByText('New team')).toBeTruthy();
    expect(screen.getByText('A team for mobile')).toBeTruthy();
    expect(screen.getByText('A specialist for accessibility')).toBeTruthy();
    expect(screen.getByText('Querious')).toBeTruthy();
    expect(screen.getByText('Tinker')).toBeTruthy(); // the Creator stands in the room while it designs
    expect(screen.getByText('designing')).toBeTruthy();
    expect(container.querySelector('.np-room')?.getAttribute('aria-label')).toBe(
      'In the room: Pixel, Tinker',
    );
    expect(container.querySelector('.np-room .np-guest .hero')?.className).toContain('pose-pressing');
    expect(container.querySelector('.np-groups .np-guest')).toBeNull(); // the room is not a plan card
    expect(container.querySelectorAll('.np-gmem .hero').length).toBeGreaterThanOrEqual(2 + 2 + 2);
  });
  it('before the first proposal: just the orchestrator, thinking', () => {
    const { container } = render(<PlanStage view={null} orch={agents[3]} busy="orch" room={noRoom} />);
    expect(container.querySelectorAll('.np-group')).toHaveLength(0);
    expect(container.querySelector('.np-lead .hero')?.className).toContain('pose-thinking');
  });
});

describe('the room (AGENT MCP)', () => {
  const ev = (type: string, payload: object) => ({ type, payload });
  const joined = [
    ev('room.joined', { agentId: 'tinker', by: 'pixel', why: 'design a team' }),
    ev('room.call', { callId: 'c1', from: 'tinker', to: 'twinkle', status: 'asking', approver: 'pixel' }),
  ].reduce(roomFold, ROOM0);
  const nick = (id: string) => ({ pixel: 'Pixel', tinker: 'Tinker', twinkle: 'Twinkle' })[id] ?? id;
  it('folds joins once and follows each call', () => {
    const again = roomFold(joined, ev('room.joined', { agentId: 'tinker' }));
    expect(again.guests).toEqual([{ agentId: 'tinker', by: 'pixel', why: 'design a team' }]);
    expect(roomDoing(joined, true, 'tinker', nick)).toEqual({
      tinker: { pose: 'talking', label: 'asking Pixel' },
      pixel: { pose: 'thinking' },
    });
    const working = [
      ev('room.call', { callId: 'c1', from: 'tinker', to: 'twinkle', status: 'approved' }),
      ev('room.joined', { agentId: 'twinkle', by: 'tinker' }),
      ev('room.call', { callId: 'c1', from: 'tinker', to: 'twinkle', status: 'working' }),
    ].reduce(roomFold, joined);
    expect(working.guests.map((g) => g.agentId)).toEqual(['tinker', 'twinkle']);
    expect(roomDoing(working, true, 'tinker', nick)).toEqual({
      tinker: { pose: 'pressing', label: 'designing' },
      twinkle: { pose: 'writing', label: 'for Tinker' },
    });
  });
  it('a call left mid-way after a reload is stale: everyone idle', () => {
    expect(roomDoing(joined, false, 'tinker', nick)).toEqual({});
  });
  it('labels: the room, joins, and who said a line', () => {
    expect(roomLabel(['Pixel', 'Tinker'])).toBe('In the room: Pixel, Tinker');
    expect(joinLine('Twinkle', 'Tinker')).toBe('Twinkle joined the room, for Tinker.');
    expect(joinLine('Tinker')).toBe('Tinker joined the room.');
    const n = { orch: 'Pixel', creator: 'Tinker', nick };
    expect(chatWho({ from: 'agent', agentId: 'twinkle', to: 'tinker', text: 'Done' }, n)).toBe('Twinkle');
    expect(chatWho({ from: 'creator', text: 'x' }, n)).toBe('Tinker');
    expect(chatWho({ from: 'user', text: 'x' }, n)).toBe('You');
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
