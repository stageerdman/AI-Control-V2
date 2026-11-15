/* Every cast pack the studio ships, in the order they are added. Append new packs; never remove one. */
import { ARCHETYPES } from './archetypes.ts';
import type { CastPack } from './pack.ts';

export const CAST_PACKS: readonly CastPack[] = [ARCHETYPES];
