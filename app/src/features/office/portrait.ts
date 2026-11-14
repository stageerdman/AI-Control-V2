/* The project's portrait (OFFICE): the framed picture next to the features folder. Pure bits (tested) + the one
   browser step that turns a picked file into a square PNG before upload. The name is the display name only. */

export const PICK_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
/** What the user may pick (it's shrunk to a square before upload — the server's cap is 2 MB). */
export const MAX_PICK_BYTES = 10 * 1024 * 1024;
/** The uploaded square's side. */
export const PORTRAIT_PX = 512;

/** Why a picked file can't be used, or null. */
export function pickError(f: { type: string; size: number }): string | null {
  if (!(PICK_TYPES as readonly string[]).includes(f.type)) return 'Pick a PNG, JPEG, WebP or GIF picture.';
  if (f.size > MAX_PICK_BYTES) return 'That picture is over 10 MB — pick a smaller one.';
  if (!f.size) return 'That file is empty.';
  return null;
}

/** The centred square of a w×h picture (the part that's kept). */
export function squareCrop(w: number, h: number): { sx: number; sy: number; side: number } {
  const side = Math.min(w, h);
  return { sx: Math.round((w - side) / 2), sy: Math.round((h - side) / 2), side };
}

/** The display name as it will be saved, or why not (the server allows 1–60 characters). */
export function nameCheck(raw: string): { ok: true; name: string } | { ok: false; why: string } {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!name) return { ok: false, why: 'Give it a name.' };
  if (name.length > 60) return { ok: false, why: 'Keep it to 60 characters.' };
  return { ok: true, name };
}

/** The plaque under the frame fits ~11 characters. */
export const plaqueName = (name: string, max = 11): string =>
  name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name;

/** A picked file → a centred square PNG (PORTRAIT_PX) — the browser does the decoding. */
export async function toSquarePng(file: Blob, px = PORTRAIT_PX): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const { sx, sy, side } = squareCrop(bmp.width, bmp.height);
  const out = Math.min(px, side);
  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This window can’t draw pictures.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, sx, sy, side, side, 0, 0, out, out);
  bmp.close?.();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn’t read that picture.'))), 'image/png'),
  );
}
