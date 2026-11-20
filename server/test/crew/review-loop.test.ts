import { describe, expect, it } from 'vitest';
import type { ItemReview } from '../../src/db/work.ts';
import { repeatedNote, sameNote } from '../../src/crew/review-loop.ts';

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
    expect(sameNote(NOTE, 'Tests fail: sqlite is still not installed and npm install is refused.')).toBe(true);
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
    expect(repeatedNote({ sendBacks: 1, reviews: [review(NOTE, { reviewer: 'a-sec' })] }, gate, NOTE)).toBeNull();
    const approved = [review(NOTE), review('Good.', { verdict: 'approve' })];
    expect(repeatedNote({ sendBacks: 1, reviews: approved }, gate, NOTE)).toBeNull();
  });
});
