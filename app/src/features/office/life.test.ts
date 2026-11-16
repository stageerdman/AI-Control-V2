// @vitest-environment happy-dom
/* STUDIO LIFE in the office: desk-note trays (seen per viewer), principles words, mail words, who can come in;
   plus the room's new art (letterbox envelopes, HQ plaque, the binder, the guest's tent). */
import { afterEach, describe, expect, it } from 'vitest';
import type { Agent, DeskNote, Mail } from '../../api';
import { binderSeat, deskSpot, officeLayout } from './layout';
import {
  bringable,
  clip,
  firstParagraph,
  mailFrom,
  mailStatusLine,
  mailTo,
  noteCounts,
  noteLabel,
  principlesLabel,
  readSeen,
  sortInbox,
  trays,
  whoGrid,
  writeSeen,
} from './life';
import { boardFacts } from './state';
import { desk, officeArt, syncArt } from './theme';

const note = (agentId: string, at: string, id = `${agentId}-${at}`): DeskNote => ({
  id,
  projectId: 'p',
  agentId,
  runId: null,
  where: 'w',
  doing: 'd',
  next: 'n',
  at,
});
const mail = (id: string, p: Partial<Mail> = {}): Mail => ({
  id,
  fromProjectId: 'other',
  fromAgentId: 'a1',
  to: 'p',
  kind: 'mail',
  subject: `S ${id}`,
  body: 'b',
  status: 'new',
  goalId: null,
  note: null,
  at: '2026-11-15T10:00:00Z',
  ...p,
});

describe('desk notes: one paper per desk, new until this viewer opens it', () => {
  const notes = [
    note('pixel', '2026-11-15T10:00:00Z'),
    note('pixel', '2026-11-15T09:00:00Z'),
    note('ada', '2026-11-14T09:00:00Z'),
  ];
  it('nothing seen: every desk with a note glows', () => {
    expect(trays(notes, {})).toEqual({ pixel: 'new', ada: 'new' });
    expect(noteCounts(notes, {}).pixel).toEqual({ n: 2, fresh: 2, latest: '2026-11-15T10:00:00Z' });
  });
  it('seen up to the newest: plain paper; a newer note glows again', () => {
    const seen = { pixel: '2026-11-15T10:00:00Z', ada: '2026-11-14T09:00:00Z' };
    expect(trays(notes, seen)).toEqual({ pixel: 'note', ada: 'note' });
    const more = [note('ada', '2026-11-15T11:00:00Z'), ...notes];
    expect(trays(more, seen).ada).toBe('new');
    expect(noteCounts(more, seen).ada).toMatchObject({ n: 2, fresh: 1 });
  });
  it('the aria-label counts notes and new ones', () => {
    expect(noteLabel('Pixel', { n: 3, fresh: 1 })).toBe('Pixel’s notes to self — 3, 1 new');
    expect(noteLabel('Pixel', { n: 3, fresh: 0 })).toBe('Pixel’s notes to self — 3');
  });
  afterEach(() => localStorage.clear());
  it('seen-state lives in this browser per project, and never throws', () => {
    expect(readSeen('p')).toEqual({});
    writeSeen('p', { pixel: 'x' });
    expect(readSeen('p')).toEqual({ pixel: 'x' });
    expect(readSeen('q')).toEqual({});
    localStorage.setItem('office:notes-seen:p', '{broken');
    expect(readSeen('p')).toEqual({});
  });
});

describe('principles', () => {
  it('labels the binder with its files and keeper', () => {
    expect(principlesLabel('Design', 4, 'Pixel')).toBe('Design principles — 4 files, kept by Pixel');
    expect(principlesLabel('Design', 1, null)).toBe('Design principles — 1 file');
    expect(principlesLabel('Design', 0, 'Pixel')).toBe('Design principles — none yet');
  });
  it('a file’s summary is its first plain paragraph, clipped', () => {
    expect(firstParagraph('# Title\n\nKeep it **calm** and [short](x).\n\nMore.')).toBe(
      'Keep it calm and short.',
    );
    expect(firstParagraph('# Only a title')).toBe('');
    expect(firstParagraph('- one\n- two')).toBe('one two');
    expect(firstParagraph(`# T\n\n${'word '.repeat(40)}`)).toHaveLength(90);
    expect(clip('a   b', 10)).toBe('a b');
  });
});

describe('mail', () => {
  const names = {
    project: (id: string | null) => (id === 'hq' || id === 'studio' ? 'HQ' : id === 'other' ? 'Aurora' : '?'),
    agent: (id: string | null) => (id === 'a1' ? 'Pixel' : null),
  };
  it('the inbox: new first, then newest', () => {
    const list = sortInbox([
      mail('old-filed', { status: 'filed', at: '2026-11-15T12:00:00Z' }),
      mail('new-old', { at: '2026-11-14T10:00:00Z' }),
      mail('new-new', { at: '2026-11-15T09:00:00Z' }),
    ]);
    expect(list.map((m) => m.id)).toEqual(['new-new', 'new-old', 'old-filed']);
  });
  it('from / to lines', () => {
    expect(mailFrom(mail('x'), names)).toBe('Aurora · Pixel');
    expect(mailFrom(mail('x', { fromAgentId: null }), names)).toBe('Aurora · You');
    expect(mailTo(mail('x', { to: 'hq' }), names)).toBe('To HQ');
    expect(mailTo(mail('x', { to: 'other' }), names)).toBe('To Aurora');
  });
  it('the status line in the reading view', () => {
    expect(mailStatusLine(mail('x'), 'Max', null).text).toBe('New — Max reads it while you’re here.');
    expect(mailStatusLine(mail('x', { status: 'board' }), 'Max', 'Dark mode')).toEqual({
      text: 'On the board — ',
      goal: 'Dark mode',
    });
    expect(mailStatusLine(mail('x', { status: 'discussed' }), 'Max', null).text).toBe('Discussed with you');
    expect(mailStatusLine(mail('x', { status: 'filed', note: 'Not for us' }), 'Max', null).text).toBe(
      'Filed by Max',
    );
    expect(mailStatusLine(mail('x', { status: 'filed' }), 'Max', null).text).toBe('Filed');
  });
});

describe('bring someone in', () => {
  const a = (id: string, kind: Agent['kind'] = 'agent') => ({ id, kind, name: id }) as Agent;
  it('only Cast agents (not crew) who are not here yet, by name', () => {
    const roster = [a('zed'), a('ada'), a('max', 'orchestrator'), a('pixel'), a('tinker', 'creator')];
    expect(bringable(roster, new Set(['pixel'])).map((x) => x.id)).toEqual(['ada', 'zed']);
  });
  it('the Who grid keeps the ones already here, tagged (so you can invite another like them)', () => {
    const roster = [a('zed'), a('ada'), a('max', 'orchestrator'), a('pixel'), a('tinker', 'creator')];
    expect(whoGrid(roster, new Set(['pixel'])).map((x) => [x.agent.id, x.here])).toEqual([
      ['ada', false],
      ['pixel', true],
      ['zed', false],
    ]);
  });
});

describe('the room: guests, the binder seat, desk spots', () => {
  const plan = officeLayout({
    teams: [{ id: 'ux', members: ['u1', 'u2'] }],
    solo: ['s1'],
    guests: ['g1', 'g2'],
  });
  it('guests sit on their own hot desks', () => {
    expect(plan.home.g1).toBe('guest-1');
    expect(plan.home.g2).toBe('guest-2');
    expect(plan.home.s1).toBe('solo-1');
    const pod = plan.pods.find((p) => p.seats.includes('guest-1'));
    expect(pod?.teamId).toBeNull();
    expect(pod?.seats).toEqual(['guest-1', 'guest-2']);
  });
  it('the binder sits on the captain’s desk, else the team’s first', () => {
    expect(binderSeat(plan, 'ux', 'u2')).toBe(plan.home.u2);
    expect(binderSeat(plan, 'ux', null)).toBe(plan.home.u1);
    expect(binderSeat(plan, 'ux', 's1')).toBe(plan.home.u1);
    expect(binderSeat(plan, 'gone', null)).toBeNull();
  });
  it('desk spots sit on the desk (near the seat), scaled by depth', () => {
    const s = plan.seats[plan.home.u1];
    const n = deskSpot(plan, plan.home.u1, 'note');
    const b = deskSpot(plan, plan.home.u1, 'binder');
    expect(n && b).toBeTruthy();
    expect(n?.x).toBeGreaterThan(s.x);
    expect(b?.x).toBeLessThan(s.x);
    expect((n?.y ?? 0) + (n?.h ?? 0)).toBeLessThanOrEqual(s.y);
    expect(deskSpot(plan, 'nope', 'note')).toBeNull();
  });
  it('the mailbox and the bell fit the free wall: clear of the door, the portrait and the console', () => {
    const o = plan.objects;
    expect(o.mailbox.x + o.mailbox.w).toBeLessThanOrEqual(o.portrait.x);
    expect(o.mailbox.x + o.mailbox.w).toBeLessThanOrEqual(o.console.x);
    expect(o.mailbox.y + o.mailbox.h).toBeLessThanOrEqual(o.outbox.y);
    expect(o.bell.x).toBeGreaterThanOrEqual(o.door.x + o.door.w - 2);
    expect(o.mailbox.stand).toBeUndefined();
  });
});

describe('the art', () => {
  const plan = officeLayout({ teams: [], solo: ['a'] });
  const art = (hq: boolean, newMail: number) => {
    const host = document.createElement('div');
    host.innerHTML = officeArt(plan, { title: 'T', teams: {}, hq });
    syncArt(host, boardFacts({ newMail }));
    return host;
  };
  it('new mail = envelopes peeking from the slot (max 3), the top one sealed', () => {
    expect(art(false, 0).querySelector('#mailSlot')?.children.length).toBe(0);
    const two = art(false, 2).querySelector('#mailSlot');
    expect(two?.children.length).toBe(2);
    expect(two?.querySelectorAll('circle').length).toBe(1);
    expect(art(false, 9).querySelector('#mailSlot')?.children.length).toBe(3);
  });
  it('HQ wears a plaque; other offices don’t', () => {
    expect(art(true, 0).querySelector('#mailHq')).not.toBeNull();
    expect(art(false, 0).querySelector('#mailHq')).toBeNull();
    expect(art(false, 0).querySelector('#otBell')).not.toBeNull();
  });
  it('desks can carry a binder or a guest’s tent', () => {
    expect(desk('pod', { item: 'binder', hue: 'teal' })).toContain('<rect x="-3" y="-32"');
    expect(desk('hot', { item: 'tent' })).toContain('M-10 0 L-2 -14');
  });
});
