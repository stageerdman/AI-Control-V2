import { describe, expect, it } from 'vitest';
import { DeskNoteSchema } from '../../src/office/desk.ts';
import { quitNote } from '../../src/runtime/quit-note.ts';

describe('quitNote', () => {
  it('builds a valid note from the brief alone', () => {
    const n = quitNote({ task: 'Build the login page\nwith passkeys', cwd: '/w/a' });
    expect(DeskNoteSchema.parse(n)).toEqual(n);
    expect(n.where).toContain('/w/a');
    expect(n.doing).toBe('Build the login page');
    expect(n.next).toContain('git status');
    expect(n.notes).toBeUndefined();
  });

  it("carries on from the agent's own last note and last words", () => {
    const n = quitNote({
      task: 'x',
      cwd: '/w/a',
      said: 'Tests pass, pushing next.',
      note: { where: 'phase 1 done', doing: 'phase 2', next: 'write the reaper', notes: 'port 3568' },
    });
    expect(n.where).toContain('phase 1 done');
    expect(n.doing).toBe('phase 2');
    expect(n.next).toBe('write the reaper');
    expect(n.notes).toContain('Tests pass, pushing next.');
    expect(n.notes).toContain('port 3568');
  });

  it('stays inside the desk note limits for huge inputs', () => {
    const big = 'y'.repeat(10_000);
    const n = quitNote({
      task: big,
      cwd: big,
      said: big,
      note: { where: big, doing: big, next: big, notes: big },
    });
    expect(DeskNoteSchema.safeParse(n).success).toBe(true);
  });

  it('never leaves doing empty', () => {
    expect(quitNote({ task: '   ', cwd: '/w' }).doing).toBe('My task');
  });
});
