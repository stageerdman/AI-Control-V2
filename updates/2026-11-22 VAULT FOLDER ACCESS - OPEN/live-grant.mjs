// Live grant: Presentation Builders gets /Users/stage/dev and /Users/stage/Downloads, read only, for that
// project only. Safe to run twice (an existing grant is left alone). Refuses to run against a studio that
// doesn't know folder modes yet, so it can never save a read-only folder as read and write.
// Usage: node "updates/2026-11-22 VAULT FOLDER ACCESS - OPEN/live-grant.mjs" [studio url]
const STUDIO = process.argv[2] ?? 'http://127.0.0.1:4319';
const PROJECT = 'presentation-builders';
const OTHER = 'pensieve';
const GRANTS = [
  { name: 'dev (read only)', folder: '/Users/stage/dev' },
  { name: 'Downloads (read only)', folder: '/Users/stage/Downloads' },
];

async function call(method, path, body) {
  const res = await fetch(STUDIO + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json;
}

const listAccesses = async () => {
  const a = await call('GET', '/accesses');
  return a.accesses ?? a;
};

async function requireNewStudio() {
  const all = await listAccesses();
  if (all.length && !all.every((a) => 'localTo' in a))
    throw new Error('The live studio has no folder modes yet (no localTo on /accesses): rebuild it first');
}

async function grant({ name, folder }) {
  const have = (await listAccesses()).find((a) => a.folder === folder && a.localTo === PROJECT);
  if (have) return `kept   ${folder} (${have.id}, ${have.folderMode})`;
  const made = await call('POST', `/projects/${PROJECT}/accesses`, { name, folder, folderMode: 'read', fields: [] });
  return `added  ${folder} (${made.id})`;
}

const folderIn = async (project) =>
  (await call('GET', `/projects/${project}/access`)).accesses
    .filter((a) => a.folder)
    .map((a) => `${a.folder} ${a.folderMode} ${a.granted ? 'on' : 'off'}`);

await requireNewStudio();
for (const g of GRANTS) console.log(await grant(g));
console.log(`${PROJECT} sees:`, await folderIn(PROJECT));
console.log(`${OTHER} sees:`, await folderIn(OTHER));
