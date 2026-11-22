/* Spike helper: print comms-log entries that talk about unmerged work. Arg: the saved comms_log JSON file. */
import { readFileSync } from 'node:fs';

const raw = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const lines = raw.flatMap((b) => b.text.split('\n')).filter(Boolean);
const hit = /not (pushed or )?merged|say the word|waiting for (review|merge)|merge (it|them) |into master/i;
for (const l of lines) {
  const e = JSON.parse(l);
  if (hit.test(e.text)) console.log(`${e.at} ${e.kind} ${e.from}->${e.to}: ${e.text.slice(0, 500)}\n`);
}
