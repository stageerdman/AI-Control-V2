/* A project's logo tile from its name — the same hash as the prototype's npTile (and the app's
   features/projects/tile.ts), so the draft card, the setup stage and the project all match. */
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

export function tileFor(name: string): { g1: string; g2: string; glyph: string } {
  let h = 0;
  for (const ch of name) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  const [g1, g2] = TILES[h % TILES.length] as [string, string];
  return { g1, g2, glyph: GLYPHS[(h >>> 3) % GLYPHS.length] as string };
}
