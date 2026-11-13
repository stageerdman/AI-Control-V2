/* Project logo tiles — the prototype's tileGlyph() (data-studio.js) and the setup space's
   name → tile hash (studio-new.js npTile), so a draft card, the setup stage and the finished
   project all show the same tile. */
import type { Tile } from '../../api';

export const TILE_GLYPHS: Record<string, string> = {
  bag: '<path d="M7 9h10l-1 11a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2L7 9Z" fill="none" stroke="#fff" stroke-width="1.8"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0" fill="none" stroke="#fff" stroke-width="1.8"/>',
  chart:
    '<circle cx="7" cy="17" r="1.6" fill="#fff"/><circle cx="12" cy="11" r="1.6" fill="#fff"/><circle cx="17" cy="14" r="1.6" fill="#fff"/><path d="M7 17 12 11 17 14" stroke="#fff" stroke-width="1.4" fill="none"/>',
  leaf: '<path d="M12 6c5 1 6 7 2 10-4 3-8-1-6-6" fill="none" stroke="#fff" stroke-width="1.8"/><path d="M12 6c-4 2-4 8 0 10" stroke="#fff" stroke-width="1.6" fill="none"/>',
  quill:
    '<path d="M17 7C11 8 8 13 8 17l2-1c0-3 3-7 7-9Z" fill="#fff"/><path d="M8 17l-1 1" stroke="#fff" stroke-width="1.6"/>',
  tree: '<path d="M12 6v12" stroke="#fff" stroke-width="1.8"/><path d="M12 10c-3 0-4-2-4-2m4 2c3 0 4-2 4-2M12 14c-3 0-4-2-4-2m4 2c3 0 4-2 4-2" stroke="#fff" stroke-width="1.6" fill="none"/>',
  pebbles:
    '<ellipse cx="12" cy="17" rx="6" ry="2.4" fill="#fff" opacity=".9"/><ellipse cx="11" cy="13" rx="4" ry="2" fill="#fff" opacity=".7"/><ellipse cx="13" cy="9.5" rx="2.6" ry="1.5" fill="#fff"/>',
  cloud: '<path d="M8 16a3 3 0 0 1 .4-6A4 4 0 0 1 16 10a3 3 0 0 1 0 6Z" fill="#fff"/>',
  fern: '<path d="M12 18c0-6 3-9 6-10-1 4-3 6-6 6 0-4 2-6 2-6" stroke="#fff" stroke-width="1.5" fill="none"/>',
  satellite:
    '<rect x="10" y="10" width="4" height="4" rx="1" fill="#fff"/><path d="M7 7l3 3M14 14l3 3M6 12h2M16 12h2" stroke="#fff" stroke-width="1.6"/>',
};
export const tileGlyph = (kind: string): string => TILE_GLYPHS[kind] ?? TILE_GLYPHS.bag;

const TILES: [string, string][] = [
  ['#ff6f73', '#ffc24b'],
  ['#2e3a66', '#4ea8ff'],
  ['#2fd3c3', '#8be88b'],
  ['#9b6cff', '#4ea8ff'],
  ['#ff9b3d', '#ffc24b'],
  ['#5b5280', '#9b6cff'],
  ['#6a3fd0', '#ff9ecf'],
  ['#2b8a3e', '#8be88b'],
];
const GLYPHS = ['bag', 'chart', 'leaf', 'quill', 'tree', 'pebbles', 'cloud', 'fern', 'satellite'];

const hash = (s: string) => {
  let h = 0;
  for (const ch of s) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return h;
};

/** A stable tile for a project name (same as the prototype's npTile). */
export function tileFor(name: string): Tile {
  const h = hash(name);
  const [g1, g2] = TILES[h % TILES.length];
  return { g1, g2, glyph: GLYPHS[(h >>> 3) % GLYPHS.length] };
}
