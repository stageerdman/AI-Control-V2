/* Research spike: how big is the fixed part of every agent's system prompt?
   Composes a typical build run's prompt with the real composer and prints the size of each section.
   Run: node prompt-size.ts (Node ≥ 23 strips the types). ~4 chars ≈ 1 token. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORKING_WITH_OTHERS, YOUR_MEMORY } from '../../../server/src/room/context.ts';
import { composePrompt } from '../../../server/src/runtime/compose.ts';
import { GITHUB_PRINCIPLES_SECTION } from '../../../server/src/runtime/github-principles.ts';
import { READY_TO_TEST_SECTION } from '../../../server/src/runtime/ready-to-test.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const tok = (s: string) => Math.round(s.length / 4);

const prompt = composePrompt({
  agent: { name: 'Builder', role: 'Engineer', prompt: 'x'.repeat(800) },
  project: { name: 'HQ' },
  shell: ['git', 'ls', 'cat', 'pwd', 'mkdir', 'npm', 'npx', 'node'],
  ports: { port: 3568, app: 3567, spares: [3568, 3569, 3570, 3571] },
  room: WORKING_WITH_OTHERS,
  memory: YOUR_MEMORY,
  principles: "Before you start, read the team principles in `principles/` (one folder per team) that touch your work, and follow them. Don't edit them — tell the team's captain if one is wrong.",
});
const claudeMd = readFileSync(join(root, 'CLAUDE.md'), 'utf8');

const parts = {
  'whole composed prompt (800-char persona)': prompt,
  'Working with others': WORKING_WITH_OTHERS,
  'Your memory': YOUR_MEMORY,
  'GitHub working principles': GITHUB_PRINCIPLES_SECTION,
  'Always ready to test': READY_TO_TEST_SECTION,
  'CLAUDE.md (HQ, read by the CLI itself)': claudeMd,
};
for (const [k, v] of Object.entries(parts)) console.log(`${k}: ${v.length} chars ≈ ${tok(v)} tokens`);
