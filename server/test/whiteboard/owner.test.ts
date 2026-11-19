import { describe, expect, it } from 'vitest';
import { type Roster, resolveOwner } from '../../src/whiteboard/owner.ts';

const roster = (everyone = false): Roster => ({
  people: [
    { id: 'cap', name: 'Captain Semicolon', nick: 'Captain' },
    { id: 'pete', name: 'Pixel Pete', nick: 'Pete' },
    { id: 'baron', name: 'Baron von Backup', nick: 'Baron' },
    { id: 'both', name: 'Twin Lead' },
    { id: 'pixel', name: 'Pixel' },
    { id: 'guest', name: 'Quiet Guest' },
  ],
  teams: [
    { id: 'ship', name: 'Ship It', captainId: 'cap', memberIds: ['cap', 'pete'] },
    { id: 'polish', name: 'Polish', captainId: 'both', memberIds: ['both'] },
    { id: 'more', name: 'More', captainId: 'both', memberIds: ['both'] },
  ],
  directorId: 'pixel',
  specialists: new Set(['baron']),
  everyone,
});

describe('resolveOwner', () => {
  it('finds captains (with their team) and specialists by name, nickname or id, any case', () => {
    expect(resolveOwner(roster(), 'captain')).toEqual({ agentId: 'cap', teamId: 'ship' });
    expect(resolveOwner(roster(), ' Baron von Backup ')).toEqual({ agentId: 'baron', teamId: null });
    expect(resolveOwner(roster(), 'baron')).toEqual({ agentId: 'baron', teamId: null });
  });

  it('a plain member goes through the captain, unless the director talks to everyone', () => {
    expect(() => resolveOwner(roster(), 'Pete')).toThrow(
      'Pixel Pete is on Ship It — brief it through its captain Captain Semicolon.',
    );
    expect(resolveOwner(roster(true), 'Pete')).toEqual({ agentId: 'pete', teamId: 'ship' });
  });

  it('someone leading two teams must say which', () => {
    expect(() => resolveOwner(roster(), 'Twin Lead')).toThrow('say which team');
    expect(resolveOwner(roster(), 'Twin Lead', 'more')).toEqual({ agentId: 'both', teamId: 'more' });
  });

  it('an unknown name lists who is on the project', () => {
    expect(() => resolveOwner(roster(), 'Ivy')).toThrow(
      "Nobody called 'Ivy' works on this project. On it: Captain Semicolon (captain of Ship It), Twin Lead (captain of Polish), Twin Lead (captain of More), Baron von Backup (specialist).",
    );
    expect(() => resolveOwner(roster(), 'Baron', 'Nope')).toThrow("no team called 'Nope'");
  });

  it('the orchestrator may hold a task (it waits with them); a member who can’t own work is told so', () => {
    expect(resolveOwner(roster(), 'pixel')).toEqual({ agentId: 'pixel', teamId: null });
    expect(() => resolveOwner(roster(), 'Quiet Guest')).toThrow(
      'Quiet Guest is on this project but can’t own tasks here yet.',
    );
  });
});
