// Tiny API helper for the live check: node api.mjs METHOD /path ['json body']
const base = `http://127.0.0.1:${process.env.CHECK_PORT ?? 3569}`;
const [method = 'GET', path = '/health', body] = process.argv.slice(2);
const r = await fetch(base + path, {
  method,
  headers: body ? { 'content-type': 'application/json' } : {},
  body,
});
const t = await r.text();
let out = t;
try {
  out = JSON.stringify(JSON.parse(t), null, 1);
} catch {}
console.log(r.status, out.slice(0, Number(process.env.MAX ?? 4000)));
