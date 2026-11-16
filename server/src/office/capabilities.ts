/* What the director can do from here, built from what is really attached: every tool carries one plain
   capability line next to its definition, and the prompt shows exactly those lines — so it never promises
   something that isn't wired, nor hides something that is. */
import type { CapableTool } from '../room/bridge.ts';

export type Capabilities = { tools: CapableTool[] };
export const NO_CAPABILITIES: Capabilities = { tools: [] };

/** One line per attached tool. */
export const capabilityLines = (c: Capabilities): string[] => c.tools.map((t) => `- \`${t.name}\`: ${t.can}`);

/** Can the director put work on the whiteboard from here? */
export const canStartWork = (c: Capabilities) => c.tools.some((t) => t.name === 'add_goal');

/** The nearest real step for a request outside the list — only steps that are attached. */
function fallback(c: Capabilities): string {
  const offers = [
    ...(c.tools.some((t) => t.name === 'add_feature') ? ['to add it to the features list as Planned'] : []),
    ...(canStartWork(c) ? ['to put the work on the whiteboard as a goal'] : []),
  ];
  const offer = offers.length ? `, and offer ${offers.join(', or ')}` : '';
  return `For anything not on this list, say plainly in one line that you can’t do it from here${offer}. Never say you did something this list can’t do.`;
}

/** The prompt's "what you can do from here" block. */
export function capabilityText(c: Capabilities): string {
  const lines = capabilityLines(c);
  if (!lines.length)
    return 'From here you can only talk: you have no tools and no actions. Never say you did or will do something yourself.';
  return [
    'What you can do from here — this list is complete:',
    ...lines,
    'When the user wants one of these, do it in this turn instead of saying you can’t or offering to.',
    fallback(c),
  ].join('\n');
}
