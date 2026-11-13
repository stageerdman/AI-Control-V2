/* Palette + tiny string helpers shared by the characters and the UI.
   Ported 1:1 from the prototype's core.js (concepts/disney-v3/src/js/core.js). */

/** The 7 character hues (+ sun-deep, a gear/UI accent only). */
export const PALETTE = {
  sun: '#ffc24b',
  'sun-deep': '#ff9b3d',
  coral: '#ff6f73',
  teal: '#2fd3c3',
  sky: '#4ea8ff',
  grape: '#9b6cff',
  mint: '#8be88b',
  rose: '#ff9ecf',
} as const;
export type PaletteKey = keyof typeof PALETTE;

export const COLOR_NAMES = {
  sun: 'Amber',
  coral: 'Coral',
  teal: 'Teal',
  sky: 'Sky',
  grape: 'Grape',
  mint: 'Mint',
  rose: 'Rose',
} as const;
export type Hue = keyof typeof COLOR_NAMES;
export const HUES = Object.keys(COLOR_NAMES) as Hue[];

/** palette key or hex → hex */
export function hueHex(k?: string | null): string {
  return (k && PALETTE[k as PaletteKey]) || k || PALETTE.sun;
}

/** lighten (+) / darken (−) a hex by a flat amount per channel */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hueHex(hex).slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function hexTint(key: string, a = 0.2): string {
  const n = parseInt(hueHex(key).slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

const HTML_ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const escapeHtml = (s: unknown): string => String(s ?? '').replace(/[&<>"]/g, (c) => HTML_ESC[c]);
export const escapeAttr = (s: unknown): string =>
  String(s ?? '')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');

export const reducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion:reduce)').matches;
