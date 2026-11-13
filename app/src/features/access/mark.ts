/* How a cabinet entry looks: the server stores no mark/colour, so they're derived from the name —
   well-known services get the prototype's marks, anything else gets initials + a stable hue. */
import { HUES, type Hue, hueHex } from '../../design/palette';

type Look = { mark: string; color: string };
const KNOWN: Record<string, [mark: string, hue: string]> = {
  github: ['GH', 'grape'],
  openai: ['AI', 'teal'],
  anthropic: ['✳', 'sun'],
  claude: ['✳', 'sun'],
  stripe: ['S', 'sky'],
  figma: ['Fi', 'coral'],
  postgres: ['DB', 'sun-deep'],
  vercel: ['▲', 'rose'],
  resend: ['@', 'mint'],
};

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Two-letter mark: "GitHub" → "GH" (capitals), "my api" → "MA", "stripe" → "St". */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/[\s_\-./]+/)
    .filter(Boolean);
  if (!words.length) return '?';
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
  const caps = words[0].match(/[A-Z]/g);
  if (caps && caps.length >= 2) return caps.slice(0, 2).join('');
  const w = words[0];
  return w.length === 1 ? w.toUpperCase() : w[0].toUpperCase() + w[1].toLowerCase();
}

export function credLook(c: { name: string; envVar?: string }): Look {
  const key = c.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  const known = Object.entries(KNOWN).find(([k]) => key === k || key.startsWith(k));
  if (known) return { mark: known[1][0], color: hueHex(known[1][1]) };
  const hue: Hue = HUES[hash(c.envVar || c.name) % HUES.length];
  return { mark: initials(c.name), color: hueHex(hue) };
}

/** The only representation of a key the UI ever shows: "••••7Qx2", or null when there's none. */
export function masked(c: { hasValue: boolean; last4: string | null }): string | null {
  if (!c.hasValue) return null;
  return c.last4 ? `••••${c.last4}` : '••••';
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Preview of the server's toEnvVar ("Open AI key" → OPEN_AI_KEY) — a placeholder only; the server decides. */
export function envVarFor(name: string): string {
  const v = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!v) return 'KEY';
  return /^[0-9]/.test(v) ? `_${v}` : v;
}
