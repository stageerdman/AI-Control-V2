// Renders the archetype parts on real bots → ../preview.html (open it in a browser).
// Run from the repo root:
//   node --import "./updates/2026-11-15 AGENT ARCHETYPES - OPEN/spike/ts-resolve.mjs" "updates/2026-11-15 AGENT ARCHETYPES - OPEN/spike/render.mjs"
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILDS, HATS, heroSVG, ROLE_GEAR, TOOLS } from '../../../app/src/characters/hero-svg.ts';
import { HUES } from '../../../app/src/design/palette.ts';
import { ARCHETYPE_GEAR, ARCHETYPE_HATS, ARCHETYPE_LOOKS, ARCHETYPE_TOOLS } from '../parts/archetype-gear.ts';

Object.assign(ROLE_GEAR, ARCHETYPE_GEAR);
Object.assign(HATS, ARCHETYPE_HATS);
Object.assign(TOOLS, ARCHETYPE_TOOLS);

const here = dirname(fileURLToPath(import.meta.url));
const bot = (name, look, opts = {}) => heroSVG({ name, look }, { pose: 'idle', ...opts });
const cell = (inner, cap) => `<figure>${inner}<figcaption>${cap}</figcaption></figure>`;

const cast = Object.entries(ARCHETYPE_LOOKS).map(([name, look]) => `<section><h2>${name}</h2><div class="row">
  ${cell(bot(name, look, { size: 48 }), 'xs 48')}${cell(bot(name, look, { size: 96 }), 'sm 96')}
  ${cell(bot(name, look, { size: 160 }), 'md idle')}${cell(bot(name, look, { size: 160, pose: 'celebrating' }), 'celebrating')}
  ${cell(bot(name, look, { size: 160, pose: 'talking', facing: 'front' }), 'front')}${cell(bot(name, look, { size: 160, dir: 'left' }), 'left')}
  ${cell(bot(name, look, { size: 160, pose: 'typing' }), 'seated')}</div></section>`).join('');

const hatGrid = Object.keys(ARCHETYPE_HATS).map(h => `<div class="row">${BUILDS.map((b, i) =>
  cell(bot(h, { hat: h, tool: 'none', body: b, antenna: ['none', 'curl', 'spikes', 'bob'][i], face: 'none', hue: HUES[i * 2 % 7] }, { size: 96 }), `${h} · ${b}`)).join('')}</div>`).join('');
const toolGrid = Object.keys(ARCHETYPE_TOOLS).map(t => `<div class="row">${HUES.map((hue, i) =>
  cell(bot(t, { hat: 'none', tool: t, body: BUILDS[i % 4], antenna: 'none', face: 'none', hue }, { size: 96 }), `${t} · ${hue}`)).join('')}</div>`).join('');

const css = join(here, '../../../app/src/characters/hero.css');
writeFileSync(join(here, '../preview.html'), `<!doctype html><meta charset="utf-8"><title>Archetype parts — preview</title>
<link rel="stylesheet" href="${css}">
<style>body{background:#2b2150;color:#fff6e9;font:14px system-ui;margin:24px}h1,h2{font-weight:600}h2{margin:28px 0 6px}
.row{display:flex;gap:18px;align-items:flex-end;flex-wrap:wrap;margin:6px 0}figure{margin:0;text-align:center}
figcaption{font-size:11px;opacity:.7;margin-top:4px}.light{background:#fff6e9;color:#241a44;padding:12px;border-radius:12px}</style>
<h1>Archetype agents</h1>${cast}
<h1>Every new hat on every body</h1>${hatGrid}
<h1>Every new tool in every colour</h1>${toolGrid}
<h1>On a light card</h1><div class="light row">${Object.entries(ARCHETYPE_LOOKS).map(([n, l]) => cell(bot(n, l, { size: 48 }), n.split(' ')[0])).join('')}</div>`);
writeFileSync(join(here, '../closeup.html'), `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="${css}">
<style>body{background:#2b2150;margin:16px}.row{display:flex;flex-wrap:wrap;gap:10px}</style><div class="row">
${Object.entries(ARCHETYPE_LOOKS).map(([n, l]) => bot(n, l, { size: 300 })).join('')}</div>`);
writeFileSync(join(here, '../grids.html'), `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="${css}">
<style>body{background:#2b2150;margin:12px;display:flex;gap:30px}.row{display:flex;gap:4px;margin:2px 0}figure{margin:0}figcaption{display:none}</style>
<div>${hatGrid}</div><div>${toolGrid}</div>`);
console.log('wrote preview.html + closeup.html + grids.html');
