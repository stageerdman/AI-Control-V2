/* Shared zod pieces for request bodies. Bodies are strict: unknown keys → 422. */
import { z } from 'zod';

export const Name = z.string().trim().min(1).max(60);
export const Text = z.string().max(20_000);
export const Id = z.string().trim().min(1).max(80);
export const Short = z.string().trim().min(1).max(32);
export const IdParams = z.object({ id: Id });
