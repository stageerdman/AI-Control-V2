// Live check helper: send one message to Pixel in a project's office chat, wait for the reply, print state.
const [, , project, text] = process.argv;
const base = 'http://127.0.0.1:3570';
const url = `${base}/projects/${project}/threads/a-pixel/messages`;
const j = (r) => r.json();
const before = (await fetch(url).then(j)).messages?.length ?? 0;
const post = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ text }),
}).then(j);
if (post.error) {
  console.log('POST error', JSON.stringify(post));
  process.exit(1);
}
for (let i = 0; i < 90; i++) {
  await new Promise((r) => setTimeout(r, 4000));
  const t = await fetch(url).then(j);
  const msgs = t.messages.slice(before);
  if (!t.busy && msgs.length > 1) {
    for (const m of msgs) console.log(`> ${m.text}`);
    break;
  }
}
const f = await fetch(`${base}/projects/${project}/features`).then(j);
console.log('FEATURES:', JSON.stringify((f.features ?? f).map((x) => [x.id, x.status])));
const o = await fetch(`${base}/projects/${project}/office`).then(j);
console.log('GOALS:', JSON.stringify((o.goals ?? o.whiteboard ?? []).map((g) => g.text ?? g.summary)));
