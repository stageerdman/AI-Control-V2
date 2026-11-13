/* <Emblem> + <CaptainPip> — React faces of emblem.ts (same markup as the prototype). */
import { useMemo } from 'react';
import { captainPipHTML, type EmblemSize, type EmblemTeam, emblemSVG } from './emblem-svg';
import './emblem.css';

export type EmblemProps = {
  /** A team (uses its emblem + color) … */
  team?: EmblemTeam | null;
  /** … or an emblem id + colour (palette key or hex). */
  id?: string;
  color?: string;
  size?: EmblemSize;
  /** Hide from screen readers when a visible name sits next to it. */
  decorative?: boolean;
};

export function Emblem({ team, id, color, size = 48, decorative }: EmblemProps) {
  const emblem = id ?? team?.emblem;
  const hue = color ?? team?.color;
  const html = useMemo(
    () => emblemSVG({ emblem, color: hue }, size, { decorative }),
    [emblem, hue, size, decorative],
  );
  // biome-ignore lint/security/noDangerouslySetInnerHtml: static emblem art from emblem.ts
  return <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Captain star pip (xs/sm heroes, team rows). */
export function CaptainPip({ hue = 'sun' }: { hue?: string }) {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: static pip art from emblem.ts
  return <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: captainPipHTML(hue) }} />;
}
