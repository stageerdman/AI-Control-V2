/* The editor's fields on a workflow (Phase 5b): first / final / steps / layout and Gate.when — shape and rules. */
import { describe, expect, it } from 'vitest';
import { drawingInWords, drawingIssues, tidyLayout } from '../../src/domain/workflow-drawing.ts';
import { type Gate, GateSchema, type Workflow, WorkflowSchema } from '../../src/domain/workflows.ts';

const who = {
  isAgent: (id: string) => ['a-ann', 'a-bo', 'a-cy'].includes(id),
  isTeam: (id: string) => id === 'team-x',
  name: (id: string) => id.replace('a-', ''),
  where: 'on this project',
};
const review: Gate = { after: 'a-ann', reviewer: 'a-bo', kind: 'review', why: 'Check it.' };
const base = { gates: [review] };
const issues = (w: Partial<Workflow>) => drawingIssues({ ...base, ...w }, who, 'workflows.0');
const step = (from: string, to: string) => ({ from, to, why: 'Hand it over.' });

describe('drawing rules', () => {
  it('a plain workflow and a valid drawing pass', () => {
    expect(issues({})).toEqual([]);
    expect(issues({ first: 'a-ann', final: 'a-bo', steps: [step('a-cy', 'a-ann')] })).toEqual([]);
  });

  it('first: not "*", someone on the project, a node; a team may start', () => {
    expect(issues({ first: '*' })).toEqual([
      "workflows.0.first: name who starts — '*' is any work, not someone",
    ]);
    expect(issues({ first: 'a-ghost' })).toEqual([
      "workflows.0.first: 'a-ghost' is not an agent or team on this project",
    ]);
    expect(issues({ first: 'a-cy' })).toEqual(['workflows.0.first: cy has no arrow in this workflow']);
    expect(issues({ first: 'team-x', steps: [step('team-x', 'a-ann')] })).toEqual([]);
  });

  it('final: an agent and a node', () => {
    expect(issues({ final: 'team-x', steps: [step('team-x', 'a-ann')] })).toEqual([
      "workflows.0.final: 'team-x' is not an agent on this project",
    ]);
    expect(issues({ final: 'a-cy' })).toEqual(['workflows.0.final: cy has no arrow in this workflow']);
    expect(issues({ gates: [], final: 'a-ann', steps: [step('a-cy', 'a-ann')] })).toEqual([]);
  });

  /* live check 2026-11-17: the default team way sets final = captain; adding one sign-off made the save a 409 */
  it('final who signs nothing off is fine (it only orders sign-offs)', () => {
    expect(issues({ final: 'a-ann' })).toEqual([]);
  });

  it('steps: ends on the project, no hand-off to oneself, no pair twice', () => {
    expect(issues({ steps: [step('a-ann', 'a-ghost')] })).toEqual([
      "workflows.0.steps.0.to: 'a-ghost' is not an agent or team on this project",
    ]);
    expect(issues({ steps: [step('a-ann', 'a-ann')] })).toEqual([
      "workflows.0.steps.0.to: ann can't hand work to themselves",
    ]);
    expect(issues({ steps: [step('a-ann', 'a-cy'), step('a-ann', 'a-cy')] })).toEqual([
      'workflows.0.steps.1: ann → cy is listed twice',
    ]);
  });
});

describe('drawing shape', () => {
  const w = { id: 'w', name: 'W', summary: 'S.', gates: [review] };
  const fails = (extra: object) => !WorkflowSchema.safeParse({ ...w, ...extra }).success;

  it('at most 12 steps; why and when bounded', () => {
    expect(fails({ steps: Array.from({ length: 12 }, (_, i) => step('a-ann', `a-${i}`)) })).toBe(false);
    expect(fails({ steps: Array.from({ length: 13 }, (_, i) => step('a-ann', `a-${i}`)) })).toBe(true);
    expect(fails({ steps: [{ ...step('a-ann', 'a-bo'), why: 'x'.repeat(301) }] })).toBe(true);
    expect(fails({ steps: [{ ...step('a-ann', 'a-bo'), when: 'x'.repeat(121) }] })).toBe(true);
  });

  it('layout never fails a save: odd positions are clamped and rounded, unreadable ones dropped', () => {
    const layoutOf = (layout: unknown) => WorkflowSchema.parse({ ...w, layout }).layout;
    const many = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`a-${i}`, { x: 1, y: 1 }]));
    expect(Object.keys(layoutOf(many) ?? {})).toHaveLength(40);
    expect(layoutOf({ 'a-ann': { x: 1001.6, y: -5 }, 'a-bo': { x: 12.4, y: 900 } })).toEqual({
      'a-ann': { x: 1000, y: 0 },
      'a-bo': { x: 12, y: 600 },
    });
    expect(layoutOf({ 'a-ann': { x: 'left', y: 0 }, '': { x: 0, y: 0 }, 'a-bo': null })).toEqual({});
    expect(fails({ layout: 'everywhere' })).toBe(true);
  });

  it('Gate.when is 1–120 characters', () => {
    expect(GateSchema.safeParse({ ...review, when: 'if it touches payments' }).success).toBe(true);
    expect(GateSchema.safeParse({ ...review, when: '' }).success).toBe(false);
    expect(GateSchema.safeParse({ ...review, when: 'x'.repeat(121) }).success).toBe(false);
  });
});

describe('drawingInWords', () => {
  const w = {
    gates: [review, { ...review, after: '*', when: 'if it touches payments' }],
    first: 'a-ann',
    final: 'a-bo',
    steps: [{ ...step('a-ann', 'a-cy'), when: 'if it needs data' }],
  };

  it('says who starts, hands to whom (and when), every sign-off, who signs last; null when nothing at all', () => {
    expect(drawingInWords(w, who.name)).toBe(
      'ann starts. ann hands to cy (only if it needs data): Hand it over. bo checks ann. bo checks all work (only if it touches payments). bo signs last.',
    );
    expect(drawingInWords(base, who.name)).toBe('bo checks ann.');
    expect(drawingInWords({ gates: [] }, who.name)).toBeNull();
  });

  it('signOffs: false leaves the sign-offs to notes that list them', () => {
    expect(drawingInWords(w, who.name, { signOffs: false })).toBe(
      'ann starts. ann hands to cy (only if it needs data): Hand it over. bo signs last.',
    );
    expect(drawingInWords(base, who.name, { signOffs: false })).toBeNull();
  });

  /* live check 2026-11-17: "Scarlett checks Captain (only it touches payments)" */
  it('a bare branch label reads "only when …"', () => {
    const gates = [{ ...review, when: 'it touches payments' }];
    expect(drawingInWords({ gates }, who.name)).toBe('bo checks ann (only when it touches payments).');
  });
});

describe('tidyLayout', () => {
  it('drops positions of anything that is not a node, quietly', () => {
    const layout = { 'a-ann': { x: 1, y: 2 }, 'a-gone': { x: 3, y: 4 } };
    expect(tidyLayout({ ...base, layout }).layout).toEqual({ 'a-ann': { x: 1, y: 2 } });
    expect(tidyLayout({ gates: [], layout: { 'a-gone': { x: 0, y: 0 } } })).toEqual({ gates: [] });
  });
});
