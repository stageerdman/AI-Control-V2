/* Thinking power in plain words (design/cast/thinking.md). Pure: the four steps, what each means, and
   how the dial maps to what is stored. The server's runtime/thinking.ts owns the model + effort pairs. */
import type { ThinkingStep } from '../../api/types';

export type ThinkingOption = { step: ThinkingStep; label: string; about: string };

export const THINKING: readonly ThinkingOption[] = [
  { step: 'light', label: 'Light', about: 'Quick and light. A faster model for simple chores.' },
  {
    step: 'normal',
    label: 'Normal',
    about: 'Balanced, right for most work. Thinks harder on its own for reviews and planning.',
  },
  { step: 'deep', label: 'Deep', about: 'Thinks it through. For design and hard bugs — slower, more tokens.' },
  {
    step: 'deepest',
    label: 'Deepest',
    about: 'As hard as it can. For rare, stuck problems — slowest, the most tokens.',
  },
];

/** The step the dial shows: nothing stored reads as Normal. */
export const shownStep = (t: ThinkingStep | null | undefined): ThinkingStep => t ?? 'normal';

/** What a pick saves: Normal clears the agent's own setting, so the kind of work still decides
    (reviews and planning go Deep by themselves). */
export const savedStep = (s: ThinkingStep): ThinkingStep | null => (s === 'normal' ? null : s);

export const thinkingAbout = (s: ThinkingStep): string => THINKING.find((o) => o.step === s)?.about ?? '';
