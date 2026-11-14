import { describe, expect, it } from 'vitest';
import type { Draft, Project, Team } from '../../api';
import { backLotTag, castOf, editedAgo, ghBadge, isOnSet, progressLine, shelfCount, shelves } from './model';
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
  it('splits on set / back lot / in setup and counts', () => {
    const s = shelves(ps, [draft('d1', 'Kite')], '');
    expect(s.onSet.map((p) => p.id)).toEqual(['Aurora Storefront', 'Lumi Health']);
    expect(s.backLot.map((p) => p.id)).toEqual(['Muse Docs', 'Pebble', 'Orchard']);
    expect(shelfCount(s)).toBe('1 in setup · 2 on set · 3 in the back lot');
  });
  it('an idle real project worked on this week stays on set; old or folderless idle → back lot', () => {
    const now = Date.parse('2026-11-14T08:00:00Z');
    const idle = (updatedAt: string, folder: string | null) =>
      project('x', { status: 'idle', folder, updatedAt });
    expect(isOnSet(idle('2026-11-13T20:00:00Z', 'x'), now)).toBe(true);
    expect(isOnSet(idle('2026-10-01T20:00:00Z', 'x'), now)).toBe(false);
    expect(isOnSet(idle('2026-11-13T20:00:00Z', null), now)).toBe(false);
  });
  it('search matches names and notes, and drafts by name (untitled too)', () => {
    expect(shelves(ps, [], 'checkout').onSet).toHaveLength(1);
    expect(shelfCount(shelves(ps, [draft('d1', ''), draft('d2', 'Kite')], 'UNTITLED'))).toBe(
      '1 in setup · 0 on set · 0 in the back lot',
    );
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

describe('progress line', () => {
  it('to the target when there is one, else done (no made-up "launch")', () => {
    expect(progressLine({ progress: 63.6, target: 'v1.0' })).toBe('64% to v1.0');
    expect(progressLine({ progress: 30, target: null })).toBe('30% done');
    expect(progressLine({ progress: 30, target: '  ' })).toBe('30% done');
  });
});
