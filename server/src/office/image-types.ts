/* Which picture formats the office icon takes, told from the bytes (never the name or header alone).
   Pure: no files, no db. A Mac .icns is unwrapped to the largest PNG it carries, so only browser-ready types are kept. */
import { invalid } from '../errors.ts';

/** The server's hard cap on a stored picture. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
/** The cap on what comes in (an .icns holds many sizes; only its largest PNG is kept, ≤ MAX_IMAGE_BYTES). */
export const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

/** Stored types → file extension. */
export const IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
} as const;
export type ImageType = keyof typeof IMAGE_TYPES;
export const ICNS = 'image/x-icns';
type SourceType = ImageType | typeof ICNS;
/** What a browser sends for a file it can't name (an .icns, often): the bytes alone decide. */
const UNTYPED = 'application/octet-stream';
/** Content types an upload may declare. */
export const UPLOAD_TYPES = [...Object.keys(IMAGE_TYPES), ICNS, 'image/icns', UNTYPED];

/** The image type a Content-Type header claims, or undefined when it claims none. */
export function declaredType(header: string | undefined): string | undefined {
  const t = header?.split(';')[0]?.trim().toLowerCase();
  return t && t !== UNTYPED ? t : undefined;
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const startsWith = (b: Uint8Array, at: number, magic: readonly number[]) =>
  magic.every((x, k) => b[at + k] === x);

/** An SVG document: text that opens with markup and has an <svg> element near the top. */
function isSvg(b: Uint8Array): boolean {
  const head = Buffer.from(b.subarray(0, 4096)).toString('utf8').replace(/^﻿/, '').trimStart();
  return head.startsWith('<') && /<svg[\s>]/i.test(head);
}

/** What the bytes are (magic numbers), or null. */
export function sniff(b: Uint8Array): SourceType | null {
  if (startsWith(b, 0, PNG_MAGIC)) return 'image/png';
  if (startsWith(b, 0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(b, 0, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (startsWith(b, 0, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, 8, [0x57, 0x45, 0x42, 0x50]))
    return 'image/webp';
  if (startsWith(b, 0, [0x69, 0x63, 0x6e, 0x73])) return ICNS; // 'icns'
  if (isSvg(b)) return 'image/svg+xml';
  return null;
}

/** The largest PNG inside an .icns (entries: 4-byte type, 4-byte big-endian length incl. its 8-byte header). */
export function largestPngInIcns(b: Uint8Array): Uint8Array | null {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let best: Uint8Array | null = null;
  for (let at = 8; at + 8 <= b.length; ) {
    const len = view.getUint32(at + 4);
    if (len < 8 || at + len > b.length) break; // a broken entry ends the walk
    const data = b.subarray(at + 8, at + len);
    if (startsWith(data, 0, PNG_MAGIC) && (!best || data.length > best.length)) best = data;
    at += len;
  }
  return best;
}

const LABEL = 'PNG, JPEG, WebP, GIF, SVG or ICNS';
const sameType = (a: string, b: string) => a === b || (a === 'image/icns' && b === ICNS);

/** Check incoming bytes and turn them into a picture the browser shows. `declared`: the upload's content type. */
export function toStorable(bytes: Uint8Array, declared?: string): { bytes: Uint8Array; type: ImageType } {
  if (!bytes.length) throw invalid('The picture is empty');
  if (bytes.length > MAX_SOURCE_BYTES)
    throw invalid('The file is over 8 MB — pick a smaller one', { maxBytes: MAX_SOURCE_BYTES });
  const found = sniff(bytes);
  if (!found) throw invalid(`That isn’t a ${LABEL} picture`);
  if (declared && !sameType(declared, found)) throw invalid(`The picture is a ${found}, not ${declared}`);
  const out =
    found === ICNS ? { bytes: largestPngInIcns(bytes), type: 'image/png' as const } : { bytes, type: found };
  if (!out.bytes) throw invalid('That .icns has no PNG inside — export the icon as a PNG instead');
  if (out.bytes.length > MAX_IMAGE_BYTES)
    throw invalid('The picture is over 2 MB — pick a smaller one', { maxBytes: MAX_IMAGE_BYTES });
  return { bytes: out.bytes, type: out.type };
}
