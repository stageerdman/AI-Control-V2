/* Invite another — pure rules for kin (agents sharing one set of instructions; see
   updates/2026-11-16 INVITE ANOTHER design.md). No DOM, no I/O: kin.test.ts covers it. */
import type { Agent, Look } from '../../api/types';
import { HUES } from '../../design/palette';
import { sameLook } from './model';

type Named = Pick<Agent, 'id' | 'name'>;
type KinRef = Pick<Agent, 'id' | 'kinId' | 'kin' | 'createdAt'>;

/** Only regular agents get "Invite another" (crew have one job each). */
export const canInvite = (a: Pick<Agent, 'kind'>) => a.kind === 'agent';

/** The other live kin of `a`, first-made first (the server's `kin` order; else by kinId + createdAt). */
export function kinOf<A extends KinRef>(a: KinRef, agents: readonly A[]): A[] {
  const byId = new Map(agents.map((x) => [x.id, x]));
  if (a.kin?.length) return a.kin.flatMap((id) => byId.get(id) ?? []);
  if (!a.kinId) return [];
  return agents
    .filter((x) => x.id !== a.id && x.kinId === a.kinId)
    .sort((x, y) => x.createdAt.localeCompare(y.createdAt));
}

/** "Blair" · "Blair and Pip" · "Blair and 2 others". */
export function namesLine(names: readonly string[]): string {
  const [first, ...rest] = names;
  if (!first) return '';
  if (!rest.length) return first;
  if (rest.length === 1) return `${first} and ${rest[0]}`;
  return `${first} and ${rest.length} others`;
}

/** The line under the name on the invite card: who the copy will share instructions with. */
export const sharesLine = (original: Named, kin: readonly Named[]) =>
  `Same role and instructions as ${namesLine([original.name, ...kin.filter((k) => k.id !== original.id).map((k) => k.name)])}.`;

/** The kin whose look is identical to `look` (all slots), if any: "Looks just like Blair". */
export const twinOf = <A extends { look: Look }>(look: Look, family: readonly A[]): A | undefined =>
  family.find((k) => sameLook(k.look, look));

/** "Change colour": the next hue after the current one that no kin wears (else just the next hue). */
export function nextFreeHue(look: Look, family: readonly { look: Look }[]): Look {
  const worn = new Set(family.map((k) => k.look.hue));
  const at = Math.max(0, HUES.indexOf(look.hue as (typeof HUES)[number]));
  const order = HUES.map((_, i) => HUES[(at + 1 + i) % HUES.length] as string).filter((h) => h !== look.hue);
  return { ...look, hue: order.find((h) => !worn.has(h)) ?? (order[0] as string) };
}

/** A name already used in the Cast (name or nick, case-insensitive) — the server's own rule. */
export function nameTaken(name: string, agents: readonly Pick<Agent, 'name' | 'nick'>[]): boolean {
  const n = name.trim().toLowerCase();
  return !!n && agents.some((a) => a.name.toLowerCase() === n || a.nick?.toLowerCase() === n);
}
