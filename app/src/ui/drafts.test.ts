// @vitest-environment happy-dom
/* The draft store: per key, debounced, empty removes, clear cancels a waiting save, flush writes now,
   broken storage never breaks typing. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDraft, draftKey, flushDrafts, loadDraft, resetDraftsForTests, saveDraft } from './drafts';

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  resetDraftsForTests();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const a = draftKey('p1', 'a-ada');

describe('drafts', () => {
  it('keys apart projects and people', () => {
    expect(new Set([draftKey('p1', 'a'), draftKey('p2', 'a'), draftKey('p1', 'b')]).size).toBe(3);
  });

  it('saves after a pause and loads it back', () => {
    saveDraft(a, 'hello');
    expect(localStorage.getItem(a)).toBeNull();
    expect(loadDraft(a)).toBe('hello'); // a waiting save is already readable
    vi.advanceTimersByTime(300);
    expect(localStorage.getItem(a)).toBe('hello');
    resetDraftsForTests();
    expect(loadDraft(a)).toBe('hello'); // as after a restart
  });

  it('writes once for a burst of typing', () => {
    const set = vi.spyOn(localStorage, 'setItem');
    for (const t of ['h', 'he', 'hel', 'hell', 'hello']) saveDraft(a, t);
    vi.advanceTimersByTime(300);
    expect(set).toHaveBeenCalledTimes(1);
    expect(loadDraft(a)).toBe('hello');
  });

  it('empty text removes the draft', () => {
    localStorage.setItem(a, 'old');
    saveDraft(a, '');
    vi.advanceTimersByTime(300);
    expect(localStorage.getItem(a)).toBeNull();
  });

  it('clear removes it now and cancels a waiting save', () => {
    saveDraft(a, 'hello');
    clearDraft(a);
    vi.advanceTimersByTime(300);
    expect(loadDraft(a)).toBe('');
    expect(localStorage.getItem(a)).toBeNull();
  });

  it('flush writes every waiting save at once', () => {
    const b = draftKey('p1', 'a-mira');
    saveDraft(a, 'one');
    saveDraft(b, 'two');
    flushDrafts();
    expect(localStorage.getItem(a)).toBe('one');
    expect(localStorage.getItem(b)).toBe('two');
  });

  it('leaving the page flushes', () => {
    saveDraft(a, 'bye');
    window.dispatchEvent(new Event('pagehide'));
    expect(localStorage.getItem(a)).toBe('bye');
  });

  it('broken storage reads as empty and never throws', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(loadDraft(a)).toBe('');
    saveDraft(a, 'x');
    expect(() => flushDrafts()).not.toThrow();
  });
});
