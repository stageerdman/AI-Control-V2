import { describe, expect, it } from 'vitest';
import { emptyTries, repeatedNote, sameNote } from '../../src/crew/review-loop.ts';
import type { ItemReview } from '../../src/db/work.ts';

const gate = { kind: 'review' as const, reviewer: 'a-lint' };
const review = (notes: string, over: Partial<ItemReview> = {}): ItemReview => ({
  reviewer: 'a-lint',
  gate: 'review',
  verdict: 'changes',
  notes,
  runId: 'r1',
  at: '2026-01-01T00:00:00Z',
  ...over,
});
const NOTE = 'Tests fail: sqlite is not installed and npm install is refused.';

describe('sameNote', () => {
  it('ignores case, punctuation and a changed word', () => {
    expect(sameNote(NOTE, 'tests fail — sqlite is not installed, and npm install is refused!')).toBe(true);
    expect(sameNote(NOTE, 'Tests fail: sqlite is still not installed and npm install is refused.')).toBe(
      true,
    );
  });
  it('tells different notes apart', () => {
    expect(sameNote(NOTE, 'Rename the store module and add a test for empty input.')).toBe(false);
    expect(sameNote('', NOTE)).toBe(false);
  });
});

describe('repeatedNote', () => {
  it("→ the gate's earlier note when this send-back repeats it", () => {
    expect(repeatedNote({ sendBacks: 1, reviews: [review(NOTE)] }, gate, NOTE)).toBe(NOTE);
  });
  it('null on the first send-back to this builder (after a handover the history stays, sendBacks resets)', () => {
    expect(repeatedNote({ sendBacks: 0, reviews: [review(NOTE)] }, gate, NOTE)).toBeNull();
  });
  it("null when another gate's reviewer said it, or the last word was an approve", () => {
    expect(
      repeatedNote({ sendBacks: 1, reviews: [review(NOTE, { reviewer: 'a-sec' })] }, gate, NOTE),
    ).toBeNull();
    const approved = [review(NOTE), review('Good.', { verdict: 'approve' })];
    expect(repeatedNote({ sendBacks: 1, reviews: approved }, gate, NOTE)).toBeNull();
  });
});

describe('emptyTries', () => {
  const at = (head: string | null | undefined, over: Partial<ItemReview> = {}) =>
    review(`note on ${head}`, { head, ...over });

  it('counts send-backs in a row that found the branch where the last one left it', () => {
    expect(emptyTries([at('a'), at('b')], 2)).toBe(0);
    expect(emptyTries([at('a'), at('b'), at('b')], 3)).toBe(1);
    expect(emptyTries([at('a'), at('b'), at('b'), at('b')], 4)).toBe(2);
  });
  it('a new commit in between starts the count over', () => {
    expect(emptyTries([at('a'), at('a'), at('b'), at('b')], 4)).toBe(1);
  });
  it("only the current builder's send-backs count (a handover resets sendBacks)", () => {
    expect(emptyTries([at('a'), at('a'), at('a')], 1)).toBe(0);
    expect(emptyTries([at('a'), at('a'), at('a')], 2)).toBe(1);
  });
  it('approvals in between are skipped; reviews without a head never match', () => {
    expect(emptyTries([at('a'), at('a', { verdict: 'approve' }), at('a')], 2)).toBe(1);
    expect(emptyTries([at(null), at(null), at(undefined)], 3)).toBe(0);
  });
});
