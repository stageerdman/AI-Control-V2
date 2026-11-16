// HR: show every run that forgot — how it ended, its error, and the chat around the forget.
const base = 'http://127.0.0.1:4319';
const pid = process.argv[2] ?? 'ai-studio';
const runs = await (await fetch(`${base}/projects/${pid}/runs`)).json();
const { notes } = await (await fetch(`${base}/projects/${pid}/desk-notes`)).json();
const ids = [...new Set(notes.map((n) => n.runId))];
for (const id of ids) {
  const r = runs.find((x) => x.id === id);
  const full = await (await fetch(`${base}/projects/${pid}/runs/${id}`)).json();
  console.log('\n=== run', id, r?.agentId, r?.status, 'turns', r?.turns, 'cost', r?.costUsd, r?.startedAt, '→', r?.endedAt);
  console.log('notes at:', notes.filter((n) => n.runId === id).map((n) => n.at).join(', '));
  console.log('error:', (r?.error ?? '').slice(0, 400));
  console.log('result:', (r?.result ?? '').slice(0, 300));
  const msgs = full.messages ?? full.chat ?? [];
  if (!Array.isArray(msgs)) { console.log('detail keys:', Object.keys(full).join(',')); continue; }
  console.log('messages:', msgs.length, 'kinds:', msgs.map((m) => m.meta?.kind ?? m.role).join(' '));
  const tail = msgs.slice(-3);
  for (const m of tail) console.log('  tail>', m.role, m.meta?.kind ?? '', (m.text ?? '').slice(0, 200).replace(/\n/g, ' '));
}
