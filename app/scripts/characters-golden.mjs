// Golden markup for the character port: runs the PROTOTYPE's own hero.js / emblem.js (in happy-dom)
// over a fixed set of cases and writes their sha256 to src/characters/__fixtures__/golden.json
// (+ the prototype's cast to src/gallery/demo-cast.json for the #gallery route).
// src/characters/parity.test.ts replays every case through the TS port and must match byte for byte.
// Re-run only if the prototype art itself changes:  node scripts/characters-golden.mjs
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { Window } from 'happy-dom';

const here = dirname(fileURLToPath(import.meta.url));
const proto = join(here, '../../updates/2026-10-17 INIT - OPEN/concepts/disney-v3/src/js');
const src = ['core.js', 'hero.js', 'emblem.js', 'data-cast.js'].map((f) => readFileSync(join(proto, f), 'utf8')).join('\n;\n');

const win = new Window();
const ctx = vm.createContext({ document: win.document, matchMedia: () => ({ matches: false }), console });
vm.runInContext(src, ctx);
vm.runInContext('Math.random = () => 0.5;', ctx);
const run = (code) => vm.runInContext(code, ctx);

const agents = JSON.parse(run('JSON.stringify(castOrder())')).map(({ id, name, role, hue, build, hair, accessory, look }) =>
  ({ id, name, role, hue, build, hair, accessory, look }));
const C = JSON.parse(run(`JSON.stringify({ POSES, BUILDS, HAIR, ACCESSORIES, HOLDINGS, HUES, HATS: Object.keys(HATS), TOOLS: Object.keys(TOOLS),
  EMBLEMS: EMBLEMS.map(e => e.id) })`));
const byId = (id) => agents.find((a) => a.id === id);

/* ---- cases ---- */
const cases = [];
const H = (key, agent, opts, ops) => cases.push({ key, kind: 'hero', agent, opts, ...(ops ? { ops } : {}) });
for (const a of agents) {
  for (const size of ['xs', 'sm', 'md', 'xl', 40, 56, 72, 128]) H(`size/${a.id}/${size}`, a, { size });
  for (const pose of C.POSES) H(`pose/${a.id}/${pose}`, a, { size: 'sm', pose });
  for (const [facing, dir] of [['three-quarter', 'right'], ['side', 'right'], ['front', 'right'], ['three-quarter', 'left'], ['side', 'left']])
    H(`facing/${a.id}/${facing}/${dir}`, a, { size: 128, facing, dir });
  H(`label/${a.id}`, a, { size: 'md', label: true, pose: 'needs-input' });
}
const base = { hat: 'none', tool: 'none', body: 'hero', antenna: 'swoop', face: 'none', hue: 'sky' };
C.BUILDS.forEach((b) => C.HAIR.forEach((h, i) => H(`look/build/${b}/${h}`, { name: b, hue: C.HUES[i % 7], build: b, hair: h }, { size: 'sm' })));
C.ACCESSORIES.forEach((acc, i) => H(`look/acc/${acc}`, { name: acc, hue: C.HUES[(i + 3) % 7], build: 'hero', hair: 'tuft', accessory: acc }, { size: 'sm', facing: 'front' }));
C.HATS.forEach((h, i) => H(`look/hat/${h}`, { name: h, look: { ...base, hat: h, hue: C.HUES[i % 7] } }, { size: 'sm', facing: 'front' }));
C.TOOLS.forEach((t, i) => H(`look/tool/${t}`, { name: t, look: { ...base, tool: t, hue: C.HUES[(i + 2) % 7] } }, { size: 'sm' }));
C.HUES.forEach((hk) => H(`look/hue/${hk}`, { name: hk, look: { ...base, hat: 'mortarboard', tool: 'book', decal: 'Research', antenna: 'curl', hue: hk } }, { size: 'sm' }));
['Frontend', 'Backend', 'Design', 'QA', 'Data', 'DevOps', 'Research', 'Writer', 'Release', 'Quality'].forEach((r) => {
  H(`legacy/${r}`, { name: r, role: r, hue: 'grape', build: 'lanky', hair: 'bun', accessory: 'glasses' }, { size: 'md' });
  H(`override/${r}`, byId('a-pete'), { size: 'sm', role: r });
});
const semi = byId('a-semic');
H('extra/captain-xs', semi, { size: 'xs', captain: true, armband: '#ffc24b' });
H('extra/captain-sm', semi, { size: 'sm', captain: true, armband: '#ffc24b' });
H('extra/captain-md', semi, { size: 'md', captain: true, armband: '#ffc24b', facing: 'front' });
H('extra/captain-salute', byId('a-lint'), { size: 'md', captain: true, armband: '#8be88b', pose: 'salute' });
H('extra/captain-key', semi, { size: 'sm', captain: true, armband: 'teal' });
H('extra/ghost', {}, { size: 'md', ghost: true });
H('extra/ghost-sm', {}, { size: 'sm', ghost: true, role: 'Frontend' });
H('extra/empty', undefined, { size: 'sm' });
for (const h of C.HOLDINGS) for (const pose of ['idle', 'carrying', 'writing', 'reading'])
  H(`extra/hold/${h}/${pose}`, byId('a-scar'), { size: 128, pose, holding: h });
for (const pose of ['typing', 'chilling', 'sleeping', 'needs-input'])
  H(`extra/seated/${pose}`, byId('a-pete'), { size: 128, pose, seated: true, label: true });
H('extra/unseated-typing', byId('a-pete'), { size: 128, pose: 'typing', seated: false, props: false });
H('extra/look-xy', byId('a-pete'), { size: 128, look: { x: -0.5, y: 0.4 } });
H('extra/look-viewer', byId('a-pete'), { size: 128, look: 'viewer' });
H('extra/moving', byId('a-baron'), { size: 128, pose: 'carrying', moving: true });
/* imperative helpers: build, then mutate, compare the element's outerHTML */
const ops = [
  [['pose', 'typing']], [['pose', 'walking', { moving: true }]], [['pose', 'chilling', { holding: 'none' }]],
  [['facing', 'front']], [['facing', 'side', { dir: 'left' }]], [['facing', 'three-quarter', { look: { x: 0.2, y: -0.3 } }]],
  [['pose', 'needs-input'], ['facing', 'front'], ['look', null]], [['pose', 'reading', { seated: true, props: false }]],
];
ops.forEach((o, i) => {
  H(`ops/${i}`, byId('a-scar'), { size: 160, pose: 'typing', seated: true, label: true }, o);
  H(`ops-sm/${i}`, byId('a-semic'), { size: 'sm', captain: true, armband: '#4ea8ff' }, o);
});
for (const id of C.EMBLEMS) {
  C.HUES.forEach((hk) => cases.push({ key: `emblem/${id}/${hk}`, kind: 'emblem', team: { emblem: id, color: hk }, size: 88 }));
  for (const size of [16, 24, 'xs', 'md', 'xl']) cases.push({ key: `emblem/${id}/size/${size}`, kind: 'emblem', team: { emblem: id, color: 'sun' }, size });
  cases.push({ key: `emblem/${id}/decorative`, kind: 'emblem', team: { emblem: id, color: '#123456' }, size: 32, opts: { decorative: true } });
}
cases.push({ key: 'emblem/unknown', kind: 'emblem', team: { emblem: 'nope' }, size: 48 });
C.HUES.forEach((hk) => cases.push({ key: `pip/${hk}`, kind: 'pip', hue: hk }));

/* ---- render with the prototype ---- */
ctx.__case = null;
const render = (c) => {
  ctx.__case = c;
  return run(`(() => { const c = __case; _heroSeq = 0;
    if (c.kind === 'emblem') return emblemSVG(c.team, c.size, c.opts || {});
    if (c.kind === 'pip') return captainPip(c.hue).outerHTML;
    if (!c.ops) return heroSVG(c.agent, c.opts);
    const el = hero(c.agent, c.opts);
    for (const [op, a, b] of c.ops) { if (op === 'pose') setPose(el, a, b); else if (op === 'facing') setFacing(el, a, b); else setLook(el, a); }
    return el.outerHTML; })()`);
};
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 20);
/* cast agents are stored once and referenced by id */
const slim = (c) => (c.agent && agents.includes(c.agent) ? (({ agent, ...rest }) => ({ ...rest, agentId: agent.id }))(c) : c);
const golden = { note: 'generated by scripts/characters-golden.mjs from the prototype — do not edit', agents,
  cases: cases.map((c) => ({ ...slim(c), sha: sha(render(c)) })) };
writeFileSync(join(here, '../src/characters/__fixtures__/golden.json'), `${JSON.stringify(golden)}\n`);
/* the prototype's cast (studio crew first), for the #gallery dev route */
writeFileSync(join(here, '../src/gallery/demo-cast.json'), `${JSON.stringify(agents, null, 1)}\n`);
console.log(`${golden.cases.length} cases`);
