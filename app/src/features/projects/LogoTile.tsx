/* The project's logo tile (.logo-tile): gradient + white glyph, or the project's picture when it has one (OFFICE).
   `tile: null` = the dashed empty tile of an unnamed draft. */
import { apiUrl, type Tile } from '../../api';
import { tileGlyph } from './tile';

export function LogoTile({
  tile,
  small,
  className,
  imageUrl,
}: {
  tile: Tile | null;
  small?: boolean;
  className?: string;
  /** The project's picture (a server path); shown instead of the tile. */
  imageUrl?: string | null;
}) {
  const cls = ['logo-tile', small && 'sm', !tile && 'np-tile-empty', className].filter(Boolean).join(' ');
  const src = apiUrl(imageUrl);
  if (src)
    return (
      <span className={`${cls} has-pic`} aria-hidden="true">
        <img src={src} alt="" draggable={false} />
      </span>
    );
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
