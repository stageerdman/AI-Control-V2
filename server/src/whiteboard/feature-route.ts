/* Tasks that touch the Features list. Only the orchestrator has the full feature tools, so a task that only edits
   the list is theirs whoever was named; a task that edits it alongside other work stays with its owner, and its
   brief lists the features it names (by id) so the owner can use their `feature` tool on them. Pure. */
export type NamedFeature = { id: string; name: string };

const literal = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** `phrase` as a whole word or phrase (not inside a longer word), any case. */
const mentions = (words: string, phrase: string) =>
  new RegExp(`(^|[^\\p{L}\\p{N}-])${literal(phrase)}($|[^\\p{L}\\p{N}-])`, 'iu').test(words);

/** The features `words` name, by id or by name, in list order. */
export function featuresNamed(words: string, all: readonly NamedFeature[]): NamedFeature[] {
  return all.filter((f) => mentions(words, f.id) || (f.name.trim() && mentions(words, f.name.trim())));
}

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
  const named = featuresNamed(`${t.text}\n${brief}`, all);
  const line = featureLinkLine(named);
  if (toDirector || !named.length || brief.includes(line)) return brief;
  return `${brief}\n\n${line}`;
}
