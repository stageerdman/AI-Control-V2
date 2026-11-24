/* Teammates look different at a glance (the studio's design rules, from Studio Design): no two share a hue, any two
   differ in at least two of hat, tool and body, and the captain's hats ('captain', 'helm') belong to the captain
   alone. Pure: the caller passes each member's look. Only new agents can still change, so a rule is checked only
   where a new agent is involved — two Cast agents already alike are left as they are. */

export type MemberLook = {
  name: string;
  /** Designed in this build (its look can still change). */
  fresh: boolean;
  captain: boolean;
  look: { hat: string; tool: string; body: string; hue: string };
};

const CAPTAIN_HATS = new Set(['captain', 'helm']);
const SHAPE = ['hat', 'tool', 'body'] as const;

export function teamLookIssues(members: readonly MemberLook[]): string[] {
  const out: string[] = [];
  members.forEach((a, i) => {
    if (a.fresh && !a.captain && CAPTAIN_HATS.has(a.look.hat))
      out.push(`${a.name}: the '${a.look.hat}' hat marks the captain — pick another hat`);
    for (const b of members.slice(i + 1)) {
      if (!a.fresh && !b.fresh) continue;
      if (a.look.hue === b.look.hue)
        out.push(`${a.name} and ${b.name} share the hue '${a.look.hue}' — give each their own`);
      if (SHAPE.filter((k) => a.look[k] !== b.look[k]).length < 2)
        out.push(`${a.name} and ${b.name} look alike — make at least two of hat, tool and body differ`);
    }
  });
  return out;
}
