// node api.mjs METHOD /path [json] — call the check server (port 3569) and print the reply.
const [method, path, body] = process.argv.slice(2);
const r = await fetch(`http://127.0.0.1:3569${path}`, {
  method,
  headers: body ? { 'content-type': 'application/json', origin: 'http://localhost:1420' } : { origin: 'http://localhost:1420' },
  ...(body ? { body } : {}),
});
const t = await r.text();
try {
  console.log(r.status, JSON.stringify(JSON.parse(t), null, 1).slice(0, 6000));
} catch {
  console.log(r.status, t.slice(0, 3000));
}
