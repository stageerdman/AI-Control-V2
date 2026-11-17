/* The editor's fields on a workflow (Phase 5b): first / final / steps / layout and Gate.when — shape and rules. */
import { describe, expect, it } from 'vitest';
import { drawingIssues, tidyLayout } from '../../src/domain/workflow-drawing.ts';
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

  it('final: an agent, a node, and one of the reviewers when there are gates', () => {
    expect(issues({ final: 'team-x', steps: [step('team-x', 'a-ann')] })).toEqual([
      "workflows.0.final: 'team-x' is not an agent on this project",
    ]);
    expect(issues({ final: 'a-cy' })).toEqual(['workflows.0.final: cy has no arrow in this workflow']);
    expect(issues({ final: 'a-ann' })[0]).toMatch(/^workflows\.0\.final: ann signs nothing off here/);
    expect(issues({ gates: [], final: 'a-ann', steps: [step('a-cy', 'a-ann')] })).toEqual([]);
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
    expect(fails({ steps: [{ ...step('a-ann', 'a-bo'), why: '' }] })).toBe(true);
    expect(fails({ steps: [{ ...step('a-ann', 'a-bo'), when: 'x'.repeat(121) }] })).toBe(true);
  });

  it('layout: at most 24 positions, x 0..1000, y 0..600', () => {
    const many = (n: number) =>
      Object.fromEntries(Array.from({ length: n }, (_, i) => [`a-${i}`, { x: 1, y: 1 }]));
    expect(fails({ layout: many(24) })).toBe(false);
    expect(fails({ layout: many(25) })).toBe(true);
    expect(fails({ layout: { 'a-ann': { x: 1001, y: 0 } } })).toBe(true);
    expect(fails({ layout: { 'a-ann': { x: 0, y: 601 } } })).toBe(true);
  });

  it('Gate.when is 1–120 characters', () => {
    expect(GateSchema.safeParse({ ...review, when: 'if it touches payments' }).success).toBe(true);
    expect(GateSchema.safeParse({ ...review, when: '' }).success).toBe(false);
    expect(GateSchema.safeParse({ ...review, when: 'x'.repeat(121) }).success).toBe(false);
  });
});

describe('tidyLayout', () => {
  it('drops positions of anything that is not a node, quietly', () => {
    const layout = { 'a-ann': { x: 1, y: 2 }, 'a-gone': { x: 3, y: 4 } };
    expect(tidyLayout({ ...base, layout }).layout).toEqual({ 'a-ann': { x: 1, y: 2 } });
    expect(tidyLayout({ gates: [], layout: { 'a-gone': { x: 0, y: 0 } } })).toEqual({ gates: [] });
  });
});
