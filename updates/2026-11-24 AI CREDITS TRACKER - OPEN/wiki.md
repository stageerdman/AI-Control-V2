# AI Credits Tracker: wiki

## Lessons
- **A subscription limit is a percentage, not a number.** Pro/Max windows (5-hour, 7-day, and per-model 7-day)
  are only exposed as utilization plus reset time. Never show an absolute "credits" figure for them.
- **The truth is already on our pipe.** `claude -p --output-format stream-json` writes `rate_limit_event` lines.
  `rate_limit_info.unifiedWindows.{five_hour,seven_day}.utilization` is a fraction from 0 to 1, and `resetsAt` is
  in epoch seconds. Verified on CLI 2.1.322 (see `server/test/fixtures/live-*.jsonl`). The CLI only writes one
  when a value changes.
- **Undocumented means optional.** Parse every field defensively. A shape we don't recognise gives "no reading",
  never a wrong number. Re-check against a fresh live line when the CLI version jumps.
- **Our own token log is not the limit.** The user's other Claude use shares the same windows. Use our log only
  for "the studio's share", and as the estimated fallback for accounts with no windows (API key, Bedrock, Vertex).
- **Don't read OAuth tokens to call `/api/oauth/usage`.** It's undocumented, and it touches secret values.
- **Don't install status-line scripts** into the user's Claude Code just to get data we already have.

## Sources
- Status-line docs (official `rate_limits` fields): https://code.claude.com/docs/en/statusline
- Stream-json `rate_limit_event` field notes (third party): https://littlebearapps.com/help/untether/claude-stream-json-cheatsheet/
