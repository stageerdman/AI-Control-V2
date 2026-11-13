// @vitest-environment happy-dom
/* The port must draw exactly what the prototype draws: every golden case (generated from the
   prototype's own JS by scripts/characters-golden.mjs) is replayed here and compared by hash. */
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import golden from './__fixtures__/golden.json';
import { captainPipHTML, type EmblemSize, emblemSVG } from './emblem-svg';
import {
  _resetHeroSeq,
  type HeroAgent,
  type HeroOpts,
  hero,
  heroSVG,
  setFacing,
  setLook,
  setPose,
} from './hero-svg';

type Case = {
  key: string;
  kind: 'hero' | 'emblem' | 'pip';
  sha: string;
  agent?: HeroAgent;
  agentId?: string;
  opts?: HeroOpts & { decorative?: boolean };
  ops?: [string, unknown, unknown?][];
  team?: { emblem?: string; color?: string };
  size?: EmblemSize;
  hue?: string;
};
const agents = new Map((golden.agents as HeroAgent[]).map((a) => [a.id, a]));
const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 20);

function render(c: Case): string {
  _resetHeroSeq();
  if (c.kind === 'emblem') return emblemSVG(c.team, c.size, c.opts ?? {});
  if (c.kind === 'pip') return captainPipHTML(c.hue as string);
  const agent = c.agentId ? agents.get(c.agentId) : c.agent;
  if (!c.ops) return heroSVG(agent, c.opts);
  const el = hero(agent, c.opts);
  for (const [op, a, b] of c.ops) {
    if (op === 'pose') setPose(el, a as string, b as object);
    else if (op === 'facing') setFacing(el, a as 'front', b as object);
    else setLook(el, a as null);
  }
  return el.outerHTML;
}

describe('character port matches the prototype byte for byte', () => {
  beforeAll(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });
  afterAll(() => vi.restoreAllMocks());

  it('covers every case', () => {
    expect((golden.cases as Case[]).length).toBeGreaterThan(800);
  });
  it('every hero / emblem / pip case is identical', () => {
    const misses = (golden.cases as Case[]).filter((c) => sha(render(c)) !== c.sha).map((c) => c.key);
    expect(misses).toEqual([]);
  });
});
