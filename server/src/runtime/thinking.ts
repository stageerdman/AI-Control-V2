/* Thinking power (updates/2026-11-19 AGENT THINKING POWER): one dial with four steps. Each step is a fixed
   (model, effort) pair — this table is the only place both are named. Pure: no I/O, no framework.

   Who decides, most specific wins: this task → the agent's own default → the kind of work → Normal.
   The run caps stay the hard ceiling: thinking harder never lifts a budget. */
import { z } from 'zod';

export const THINKING_STEPS = ['light', 'normal', 'deep', 'deepest'] as const;
export type ThinkingStep = (typeof THINKING_STEPS)[number];
/** Claude Code's `--effort` levels the dial uses. */
export type Effort = 'low' | 'medium' | 'high' | 'max';
export type ThinkingPair = { model: string; effort: Effort };

export const ThinkingSchema = z.enum(THINKING_STEPS);
export const DEFAULT_THINKING: ThinkingStep = 'normal';
/** The Light step's model, whatever the studio's is. */
export const LIGHT_MODEL = 'claude-sonnet-5-5';

const EFFORT: Record<ThinkingStep, Effort> = { light: 'low', normal: 'medium', deep: 'high', deepest: 'max' };

/** The (model, effort) a step runs with; every step but Light runs on the studio's model. */
export function thinkingPair(step: ThinkingStep, studioModel: string): ThinkingPair {
  return { model: step === 'light' ? LIGHT_MODEL : studioModel, effort: EFFORT[step] };
}

export const isThinkingStep = (v: unknown): v is ThinkingStep =>
  (THINKING_STEPS as readonly unknown[]).includes(v);

type Choice = ThinkingStep | null | undefined;
/** The step a run uses: the task's override, else the agent's default, else the kind of work's, else Normal. */
export function resolveThinking(c: { task?: Choice; agent?: Choice; work?: Choice }): ThinkingStep {
  return c.task ?? c.agent ?? c.work ?? DEFAULT_THINKING;
}

/** The kind of work's default for an agent run: a review looks harder. */
export const workThinking = (kind: string | null | undefined): ThinkingStep | null =>
  kind === 'reviewing' ? 'deep' : null;
