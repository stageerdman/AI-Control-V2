/* An agent's costume — independent of its role (v5). Slot values are hero.js ids;
   the backend stores them as opaque short strings and the UI renders them. */
import { z } from 'zod';

const slot = z.string().trim().min(1).max(32);

export const LookSchema = z.object({
  hat: slot,
  tool: slot,
  body: slot,
  antenna: slot,
  face: slot,
  hue: slot,
  decal: slot.optional(),
});
export type Look = z.infer<typeof LookSchema>;

export const DEFAULT_LOOK: Look = {
  hat: 'none',
  tool: 'none',
  body: 'hero',
  antenna: 'none',
  face: 'none',
  hue: 'sun',
};
