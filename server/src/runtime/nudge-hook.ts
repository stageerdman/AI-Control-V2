/* The forget nudge (STUDIO LIFE), a PostToolUse hook run by Claude Code after every tool: asks the studio whether
   this run's context is past the threshold and, once, adds a reminder to write a desk note and `forget`.
   Env (the run's): AI_STUDIO_NUDGE_URL, AI_STUDIO_RUN_TOKEN. Silent on any error — a nudge is never worth a failure. */
const url = process.env.AI_STUDIO_NUDGE_URL;
const token = process.env.AI_STUDIO_RUN_TOKEN ?? '';
process.stdin.resume();
process.stdin.on('data', () => {});
process.stdin.on('end', async () => {
  if (!url) return;
  try {
    const res = await fetch(url, { headers: { 'x-run-token': token }, signal: AbortSignal.timeout(3000) });
    const { nudge } = (await res.json()) as { nudge?: string | null };
    if (nudge)
      process.stdout.write(
        JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: nudge } }),
      );
  } catch {
    /* no nudge */
  }
});
