/* One CLI session's context, turn by turn (pure). Each turn's context = what the model was sent: fresh input +
   cache read + cache write. The first turn is the cold prefix; the last is what a --resume would reload. */

/** Why a session began: a fresh item or call, a fresh rework from a handoff, a --resume of an old transcript,
    a forget, a step-limit carry-on. */
export type StartedBy = 'new' | 'rework' | 'resume' | 'forget' | 'limit';

export type Meter = {
  /** One model turn whose context was `context` tokens. */
  see(context: number): void;
  readonly turns: number;
  /** null until the first turn. */
  readonly first: number | null;
  readonly peak: number | null;
  /** 0 until the first turn (the forget nudge compares it). */
  readonly last: number;
};

export function createMeter(): Meter {
  let turns = 0;
  let first: number | null = null;
  let peak: number | null = null;
  let last = 0;
  return {
    see(context) {
      turns++;
      first ??= context;
      peak = Math.max(peak ?? 0, context);
      last = context;
    },
    get turns() {
      return turns;
    },
    get first() {
      return first;
    },
    get peak() {
      return peak;
    },
    get last() {
      return last;
    },
  };
}
