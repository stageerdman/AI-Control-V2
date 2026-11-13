/* The project's logo tile (.logo-tile): gradient + white glyph. `tile: null` = the dashed
   empty tile of an unnamed draft. */
import type { Tile } from '../../api';
import { tileGlyph } from './tile';

export function LogoTile({
  tile,
  small,
  className,
}: {
  tile: Tile | null;
  small?: boolean;
  className?: string;
}) {
  const cls = ['logo-tile', small && 'sm', !tile && 'np-tile-empty', className].filter(Boolean).join(' ');
  if (!tile) return <span className={cls} aria-hidden="true" />;
  return (
    <span
      className={cls}
      aria-hidden="true"
      style={{ background: `linear-gradient(145deg,${tile.g1},${tile.g2})` }}
    >
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static glyph art from tile.ts */}
      <svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: tileGlyph(tile.glyph) }} />
    </span>
  );
}
