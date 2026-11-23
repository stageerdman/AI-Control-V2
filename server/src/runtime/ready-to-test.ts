/* READY TO TEST: the studio-wide "always ready to test" rule, the same words in every agent's run on every
   project (compose.ts) and in the orchestrator's (threads.ts). The project office's Start button
   (POST /projects/:id/start) opens the newest built app or the running site; this rule keeps it working. */
export const READY_TO_TEST_TITLE = 'Always ready to test';

export const READY_TO_TEST_RULE = [
  "- Set up a build or a running website early and keep it working, so the project's Start button always opens the newest app or site.",
  '- A website starts from the `run:` line in `.project` and reads its port from PORT; a desktop app keeps its newest build where Start finds it.',
  '- Never ask the user to run commands, install things or set anything up: do it yourself.',
  '- After a change, make sure Start still works (build again, or check the site still answers) before you finish.',
].join('\n');

/** The rule as a prompt section. */
export const READY_TO_TEST_SECTION = `## ${READY_TO_TEST_TITLE}\n\n${READY_TO_TEST_RULE}`;
