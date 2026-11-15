/// <reference types="vitest/config" />
import { execFileSync } from 'node:child_process';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/* Which commit a build came from and when (src/shell/build.ts shows it), so the installed app can be
   matched to the latest merge — the `done` line of ~/.ai-studio/logs/self-install.log has the same commit. */
function headCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: import.meta.dirname,
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'unknown'; // a copy without git still builds
  }
}

// Tauri expects a fixed dev port and must not have its own files watched.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __BUILD__: JSON.stringify({ commit: headCommit(), builtAt: new Date().toISOString() }) },
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  test: { environment: 'node' },
});
