import { describe, expect, it } from 'vitest';
import type { Draft, Project, Team } from '../../api';
import {
  backLotTag,
  castOf,
  editedAgo,
  ghBadge,
  homeShelves,
  isOnSet,
  progressLine,
  togglePin,
  withPins,
  workedToday,
} from './model';
import { tileFor } from './tile';

const project = (id: string, p: Partial<Project> = {}): Project => ({
  id,
  name: id,
  note: '',
  status: 'idle',
  progress: 0,
  folder: null,
  orchestratorId: 'a-pixel',
  github: { connected: false, private: false },
  tile: { g1: '#000', g2: '#fff', glyph: 'bag' },
  teamIds: [],
  agentIds: [],
  createdAt: '',
  updatedAt: '',
  ...p,
});
const draft = (id: string, name: string): Draft => ({
  id,
  mode: 'new',
  step: 1,
  name,
  about: '',
  folder: null,
  orchestratorId: null,
  plan: null,
  chat: [],
  createdAt: '',
  updatedAt: '',
});

describe('projects home', () => {
  const ps = [
    project('Aurora Storefront', { status: 'live', note: 'Rebuilding checkout' }),
    project('Lumi Health', { status: 'needs' }),
    project('Muse Docs', { status: 'draft' }),
    project('Pebble', { status: 'archived' }),
    project('Orchard', { status: 'idle' }),
  ];
  it('an idle real project worked on this week is on set (ports board); old or folderless idle is not', () => {
    const now = Date.parse('2026-11-14T08:00:00Z');
    const idle = (updatedAt: string, folder: string | null) =>
      project('x', { status: 'idle', folder, updatedAt });
    expect(isOnSet(idle('2026-11-13T20:00:00Z', 'x'), now)).toBe(true);
    expect(isOnSet(idle('2026-10-01T20:00:00Z', 'x'), now)).toBe(false);
    expect(isOnSet(idle('2026-11-13T20:00:00Z', null), now)).toBe(false);
  });
  it('search matches names and notes, and drafts by name (untitled too)', () => {
    expect(homeShelves(ps, [], 'checkout').rest.map((p) => p.id)).toEqual(['Aurora Storefront']);
    const u = homeShelves(ps, [draft('d1', ''), draft('d2', 'Kite')], 'UNTITLED');
    expect([u.drafts.length, u.workplace.length, u.today.length, u.rest.length]).toEqual([1, 0, 0, 0]);
  });
  it('the cast: team members first (once each), then specialists', () => {
    const teams = [
      { id: 't1', members: [{ agentId: 'a1' }, { agentId: 'a2' }] },
      { id: 't2', members: [{ agentId: 'a2' }, { agentId: 'a3' }] },
    ] as Team[];
    expect(castOf({ teamIds: ['t1', 't2', 'gone'], agentIds: ['a4', 'a1'] }, teams)).toEqual([
      'a1',
      'a2',
      'a3',
      'a4',
    ]);
  });
  it('badges, tags, edited-ago', () => {
    expect(ghBadge({ connected: true, private: true })).toBe('🔒 GitHub · private');
    expect(backLotTag(project('x', { status: 'archived' }))).toEqual({ label: 'Archived', tone: 'archived' });
    const now = Date.parse('2026-11-13T12:00:00Z');
    expect(editedAgo('2026-11-11T12:00:00Z', now)).toBe('edited 2d ago');
    expect(editedAgo('2026-09-01T12:00:00Z', now)).toBe('edited 2mo ago');
    expect(editedAgo('2026-11-13T11:59:30Z', now)).toBe('edited just now');
  });
  it('tileFor is stable and from the palette', () => {
    expect(tileFor('Kite Notes')).toEqual(tileFor('Kite Notes'));
    // the prototype's shot: Kite Notes = coral→sun quill
    expect(tileFor('Kite Notes')).toEqual({ g1: '#ff6f73', g2: '#ffc24b', glyph: 'quill' });
  });
});

describe('home shelves: My Workplace · Today · All other', () => {
  /* local times: the rule is the user's own calendar day, whatever the time zone */
  const at = (y: number, mo: number, d: number, h: number, mi = 0) =>
    new Date(y, mo - 1, d, h, mi).toISOString();
  const now = new Date(2026, 10, 24, 15, 0).getTime();
  const ids = (xs: Project[]) => xs.map((p) => p.id);

  it('today = on or after local midnight: 23:59 yesterday is not, 00:00 today is', () => {
    expect(workedToday(project('x', { lastUserAt: at(2026, 11, 23, 23, 59) }), now)).toBe(false);
    expect(workedToday(project('x', { lastUserAt: at(2026, 11, 24, 0, 0) }), now)).toBe(true);
    expect(workedToday(project('x', { lastUserAt: null }), now)).toBe(false);
    expect(workedToday(project('x'), now)).toBe(false);
  });

  it('each project lands in one shelf; pinned + worked today stays in My Workplace only', () => {
    const s = homeShelves(
      [
        project('pinned-today', { pinRank: 1, lastUserAt: at(2026, 11, 24, 9) }),
        project('pinned', { pinRank: 0 }),
        project('today', { lastUserAt: at(2026, 11, 24, 8) }),
        project('old', { lastUserAt: at(2026, 11, 20, 8), updatedAt: at(2026, 11, 24, 14) }),
      ],
      [],
      '',
      now,
    );
    expect(ids(s.workplace)).toEqual(['pinned', 'pinned-today']); // pin order kept
    expect(ids(s.today)).toEqual(['today']);
    expect(ids(s.rest)).toEqual(['old']); // an agent's edit today doesn't count
  });

  it('Today is newest first', () => {
    const s = homeShelves(
      [project('a', { lastUserAt: at(2026, 11, 24, 8) }), project('b', { lastUserAt: at(2026, 11, 24, 12) })],
      [],
      '',
      now,
    );
    expect(ids(s.today)).toEqual(['b', 'a']);
  });

  it('All other: needs input, then live, then most recent; archived last', () => {
    const s = homeShelves(
      [
        project('arch', { status: 'archived', updatedAt: at(2026, 11, 23, 9) }),
        project('old-idle', { updatedAt: at(2026, 10, 1, 9) }),
        project('new-idle', { updatedAt: at(2026, 10, 2, 9), lastUserAt: at(2026, 11, 22, 9) }),
        project('live', { status: 'live', updatedAt: at(2026, 9, 1, 9) }),
        project('needs', { status: 'needs', updatedAt: at(2026, 9, 1, 9) }),
      ],
      [],
      '',
      now,
    );
    expect(ids(s.rest)).toEqual(['needs', 'live', 'new-idle', 'old-idle', 'arch']);
  });

  it('search filters every shelf alike', () => {
    const ps = [
      project('Sea GPS', { pinRank: 0 }),
      project('Sea notes', { lastUserAt: at(2026, 11, 24, 9) }),
      project('Seaside'),
      project('Ledger', { pinRank: 1 }),
    ];
    const s = homeShelves(ps, [], 'sea', now);
    expect([ids(s.workplace), ids(s.today), ids(s.rest)]).toEqual([['Sea GPS'], ['Sea notes'], ['Seaside']]);
  });

  it('togglePin: pin goes to the end, unpin keeps the others in order; withPins re-ranks', () => {
    const ps = [project('a', { pinRank: 5 }), project('b'), project('c', { pinRank: 2 })];
    expect(togglePin(ps, 'b')).toEqual(['c', 'a', 'b']);
    expect(togglePin(ps, 'c')).toEqual(['a']);
    expect(withPins(ps, ['a']).map((p) => p.pinRank)).toEqual([0, null, null]);
  });
});

describe('progress line', () => {
  it('to the target when there is one, else done (no made-up "launch")', () => {
    expect(progressLine({ progress: 63.6, target: 'v1.0' })).toBe('64% to v1.0');
    expect(progressLine({ progress: 30, target: null })).toBe('30% done');
    expect(progressLine({ progress: 30, target: '  ' })).toBe('30% done');
  });
});
