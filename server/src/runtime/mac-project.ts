/* Is this a native Mac project? A Package.swift or an .xcodeproj in the project folder (checked live, so a
   project that gains one mid-run gets the Mac build rules from then on). */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function isMacProject(dir: string): boolean {
  try {
    return existsSync(join(dir, 'Package.swift')) || readdirSync(dir).some((n) => n.endsWith('.xcodeproj'));
  } catch {
    return false; // no such folder: not a Mac project
  }
}
