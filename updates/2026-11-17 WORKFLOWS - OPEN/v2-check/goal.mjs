// Compact view of a goal's items + sub-tasks: node goal.mjs <projectId> [goalId]  (no goalId = latest)
const base = `http://127.0.0.1:${process.env.CHECK_PORT ?? 3569}`;
const [project = 'aurora', goalId] = process.argv.slice(2);
const list = await (await fetch(`${base}/projects/${project}/work`)).json();
const goal = goalId ? list.find((g) => g.id === goalId) : list[0];
if (!goal) throw new Error('no goal');
console.log(`${goal.id} ${goal.status} "${goal.text}" workflow=${goal.workflowId ?? goal.workflow?.id ?? '?'}`);
const line = (it, pad) =>
  console.log(
    `${pad}#${it.position} ${it.agentId}${it.teamId ? `@${it.teamId}` : ''} ${it.status}/${it.stage}` +
      ` parallel=${it.parallel} gates=[${it.gates.map((g) => `${g.reviewer}:${g.kind}`).join(',')}]` +
      `${it.teamPhase ? ` phase=${it.teamPhase}` : ''}${it.teamPlan ? ` plan="${it.teamPlan}"` : ''}` +
      `${it.note ? ` note="${it.note.slice(0, 120)}"` : ''} — ${it.text.slice(0, 60)}`,
  );
for (const it of goal.items) {
  line(it, '');
  for (const s of it.subtasks ?? []) line(s, '    ');
}
