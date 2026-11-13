/* Roles are user-defined labels (v5): free names, unique ignoring case. */
import { invalid } from '../errors.ts';

export const ROLE_NAME_MAX = 28;

/** Trim, collapse whitespace, cap length. Empty → 422. */
export function normalizeRoleName(name: string): string {
  const n = name.trim().replace(/\s+/g, ' ').slice(0, ROLE_NAME_MAX).trim();
  if (!n) throw invalid('Role name cannot be empty');
  return n;
}

export const roleKey = (name: string) => normalizeRoleName(name).toLowerCase();
