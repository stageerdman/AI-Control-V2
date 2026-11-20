/* Tasks that touch the Features list. Only the orchestrator has the full feature tools, so a task that only edits
   the list is theirs whoever was named; a task that edits it alongside other work stays with its owner, and its
   brief lists the features it names (by id) so the owner can use their `feature` tool on them. Pure. */
export type NamedFeature = { id: string; name: string };

const literal = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** `phrase` as a whole word or phrase (not inside a longer word), any case. */
const mentions = (words: string, phrase: string) =>
  new RegExp(`(^|[^\\p{L}\\p{N}-])${literal(phrase)}($|[^\\p{L}\\p{N}-])`, 'iu').test(words);

/* a shorter name ("UI", "API") turns up in ordinary sentences, so it never counts as naming the feature */
const MIN_NAME = 4;
const clearName = (name: string) => name.trim().length >= MIN_NAME;

/** The features `words` name, by id or by a name long enough to be clear, in list order. */
export function featuresNamed(words: string, all: readonly NamedFeature[]): NamedFeature[] {
  return all.filter((f) => mentions(words, f.id) || (clearName(f.name) && mentions(words, f.name.trim())));
}

/** The features a task names in its text or brief: the ones it is linked to when created. */
export const taskFeatures = (t: { text: string; brief: string }, all: readonly NamedFeature[]) =>
  featuresNamed(`${t.text}\n${t.brief}`, all);

/** The line a mixed task's brief gains: which features it names, and how to change them. */
export const featureLinkLine = (named: readonly NamedFeature[]) =>
  `Features this task names — update them with your \`feature\` tool by id: ${named.map((f) => `${f.id} (“${f.name}”)`).join(', ')}.`;

/** A task's brief once its owner is known: unchanged for the orchestrator (they hold every feature tool), when it
    names no feature, or when it is linked already; otherwise it ends with the features it names. */
export function linkedBrief(
  t: { text: string; brief: string },
  all: readonly NamedFeature[],
  toDirector: boolean,
): string {
  const { brief } = t;
  const named = taskFeatures(t, all);
  const line = featureLinkLine(named);
  if (toDirector || !named.length || brief.includes(line)) return brief;
  return `${brief}\n\n${line}`;
}
