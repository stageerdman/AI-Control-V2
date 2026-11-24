import { expect, describe as group, it } from 'vitest';
import { ABOUT_MAX, aboutOf, describe, JOB_MAX, jobOn } from '../../src/domain/agent-about.ts';

group('aboutOf', () => {
  it('takes the first sentence of the prompt', () => {
    expect(aboutOf("You are Sola Simplex, the studio's product visionary. You review every plan.")).toBe(
      "You are Sola Simplex, the studio's product visionary.",
    );
  });

  it('skips headings, joins lines, and does not stop at initials or e.g.', () => {
    const prompt =
      '# Uncle Bob\n\nYou are Uncle Bob, modeled on Robert C. Martin,\ne.g. clean code. HOW YOU THINK';
    expect(aboutOf(prompt)).toBe('You are Uncle Bob, modeled on Robert C. Martin, e.g. clean code.');
  });

  it('clips a long first sentence to one short line', () => {
    const about = aboutOf(`You are ${'very '.repeat(60)}busy.`);
    expect(about.length).toBeLessThanOrEqual(ABOUT_MAX);
    expect(about.endsWith('…')).toBe(true);
  });

  it('keeps a prompt with no sentence end, and an empty prompt stays empty', () => {
    expect(aboutOf('Builds iOS apps')).toBe('Builds iOS apps');
    expect(aboutOf('  ')).toBe('');
  });
});

group('describe', () => {
  it('gives about and job, leaving out empty ones', () => {
    expect(describe({ prompt: 'You test. More.' }, ' Checks  every\nPR ')).toEqual({
      about: 'You test.',
      job: 'Checks every PR',
    });
    expect(describe({ prompt: '' }, '')).toEqual({});
    expect(describe(undefined)).toEqual({});
  });

  it('clips a long job', () => {
    expect(describe(undefined, 'x'.repeat(500)).job?.length).toBe(JOB_MAX);
  });
});

group('jobOn', () => {
  const teams = [
    { members: [{ agentId: 'a', instr: '' }] },
    { members: [{ agentId: 'a', instr: 'Draws the UI' }] },
  ];
  it('finds the first non-empty seat instructions, or undefined', () => {
    expect(jobOn(teams, 'a')).toBe('Draws the UI');
    expect(jobOn(teams, 'b')).toBeUndefined();
  });
});
