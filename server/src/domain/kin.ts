/* Kin: copies of one Cast agent (updates/2026-11-16 INVITE ANOTHER). A copy keeps the original's kit (hat, tool,
   decal: what they do) and gets a new identity (colour, antenna, body, face: who they are), plus a short, sayable
   name that sounds like family. Pure: randomness comes in as `rand` so tests can pin it. */
import { ANTENNAS, BODIES, FACES, HUES } from './catalog.ts';
import type { Look } from './look.ts';

/** A number in [0, 1), like Math.random. */
export type Rand = () => number;

const pick = <T>(list: readonly T[], rand: Rand): T => list[Math.floor(rand() * list.length)] as T;

/** Colour first: a hue no kin wears; with all seven taken, any hue but the original's. */
function kinHue(original: Look, kinLooks: readonly Look[], rand: Rand): string {
  const worn = new Set([original.hue, ...kinLooks.map((l) => l.hue)]);
  const free = HUES.filter((h) => !worn.has(h));
  return pick(free.length ? free : HUES.filter((h) => h !== original.hue), rand);
}

/** The family look: same kit as the original, a colour and antenna that tell the copy apart. */
export function familyLook(original: Look, kinLooks: readonly Look[], rand: Rand): Look {
  return {
    hat: original.hat,
    tool: original.tool,
    ...(original.decal ? { decal: original.decal } : {}),
    hue: kinHue(original, kinLooks, rand),
    antenna: pick(
      ANTENNAS.filter((a) => a !== original.antenna),
      rand,
    ),
    body: pick(BODIES, rand),
    face: rand() < 0.35 ? 'none' : pick(FACES, rand),
  };
}

/** Invented, short, sayable names (no famous characters), 2–3 per letter. */
export const KIN_NAMES = [
  'Ada', 'Alba', 'Bea', 'Bix', 'Bo', 'Cleo', 'Cub', 'Dot', 'Dex', 'Echo', 'Elm', 'Fen', 'Fig', 'Gus', 'Gem', 'Hal',
  'Hazel', 'Ivo', 'Iris', 'Jun', 'Juno', 'Kit', 'Kip', 'Lark', 'Lou', 'Moss', 'Mabel', 'Nell', 'Nico', 'Ollie', 'Opal',
  'Pip', 'Pia', 'Quill', 'Remy', 'Rue', 'Sol', 'Suki', 'Tam', 'Tilly', 'Uma', 'Uno', 'Vik', 'Vida', 'Wren', 'Wim',
  'Xan', 'Yuki', 'Yara', 'Zed', 'Zia',
] as const; // prettier-ignore

/** A free name for a copy of `original`: same first letter if one is free, else any free pool name, else "Name 2". */
export function suggestKinName(original: string, taken: readonly string[], rand: Rand): string {
  const used = new Set(taken.map((n) => n.trim().toLowerCase()));
  const free = KIN_NAMES.filter((n) => !used.has(n.toLowerCase()));
  const letter = original.trim().charAt(0).toUpperCase();
  const family = free.filter((n) => n.startsWith(letter));
  if (family.length) return pick(family, rand);
  if (free.length) return pick(free, rand);
  for (let n = 2; ; n++) if (!used.has(`${original} ${n}`.toLowerCase())) return `${original} ${n}`;
}
