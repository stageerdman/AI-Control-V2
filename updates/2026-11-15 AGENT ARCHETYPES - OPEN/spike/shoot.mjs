// Headless-Chrome screenshot of ../preview.html → ../shots/<name>.png
// usage: node shoot.mjs <name> [W,H]
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [name = 'preview', size = '1400,2400', page = 'preview'] = process.argv.slice(2);
mkdirSync(join(here, '../shots'), { recursive: true });
execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${size}`, '--virtual-time-budget=1500',
  '--force-prefers-reduced-motion', '--allow-file-access-from-files', `--screenshot=${join(here, '../shots', `${name}.png`)}`,
  `file://${join(here, `../${page}.html`)}`,
], { stdio: 'ignore' });
console.log(`shots/${name}.png`);
