// Headless-Chrome screenshot of states.html → shots/states.png. usage: node shoot.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(here, 'shots'), { recursive: true });
execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,2300', '--virtual-time-budget=1500',
  '--allow-file-access-from-files', `--screenshot=${join(here, 'shots', 'states.png')}`,
  `file://${join(here, 'states.html')}`,
], { stdio: 'ignore' });
console.log('shots/states.png');
