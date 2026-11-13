/* The Blueprint (prototype: renderBlueprint) — what every new project is born with (the Setter's
   scaffold), the principles it follows (the global modules, read-only here: their source is
   <AI Control home>/modules), and per-project freshness (GET /projects/:id/scaffold). */
import { useState } from 'react';
import { useQuery } from '../../api/query';
import type { Project } from '../../api/types';
import { Hero } from '../../characters/Hero';
import type { HeroAgent } from '../../characters/hero-svg';
import { hexTint, PALETTE, type PaletteKey, shade } from '../../design/palette';
import type { PageProps } from '../../shell/pages';
import { Button, ErrorState, Loading, Panel, Sheet } from '../../ui';
import { LogoTile } from '../projects/LogoTile';
import { Markdown } from '../reports/markdown';
import { type BlueprintModule, blueprintApi, keys } from './api';
import {
  freshness,
  freshnessProjects,
  type KitNode,
  kitTree,
  localDay,
  moduleHue,
  moduleLabel,
  prettyDay,
  principlesOf,
} from './model';
import './blueprint.css';

/* the quartermaster: a DevOps hard-hat in teal, reading the kit list */
const QUARTERMASTER: HeroAgent = {
  name: 'Quartermaster',
  look: { hat: 'hardhat', tool: 'wrench', body: 'hero', antenna: 'tuft', face: 'none', hue: 'teal' },
};

let lastTab: 'kit' | 'pri' = 'kit'; // survives leaving the page, like the prototype's bpTab

const tagStyle = (name: string) => {
  const hue = moduleHue(name);
  return { background: hexTint(hue), color: shade(PALETTE[hue as PaletteKey], -70) };
};
const tildeHome = (p: string) => p.replace(/^\/(Users|home)\/[^/]+/, '~');

export function BlueprintPage(_: PageProps<'blueprint'>) {
  const [tab, setTabState] = useState(lastTab);
  const setTab = (t: typeof tab) => {
    lastTab = t;
    setTabState(t);
  };
  const bp = useQuery(keys.blueprint, blueprintApi.get);

  return (
    <>
      <div className="scene-head">
        <div className="row" style={{ gap: 12 }}>
          <div className="bp-mascot" aria-hidden="true">
            <Hero agent={QUARTERMASTER} size={72} pose="idle" />
          </div>
          <div>
            <div className="kicker">The Starter Kit</div>
            <h1>What every new project is born with</h1>
          </div>
        </div>
        <div className="spacer" />
        <div className="lib-tabs" role="tablist" aria-label="Blueprint sections">
          {(
            [
              ['kit', 'Starter Kit'],
              ['pri', 'Principles'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`bp-tab-${id}`}
              aria-selected={tab === id}
              aria-controls="bp-body"
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div id="bp-body" role="tabpanel" aria-labelledby={`bp-tab-${tab}`}>
        {bp.loading && <Loading label="Unrolling the blueprint…" />}
        {bp.error && <ErrorState error={bp.error} onRetry={bp.refetch} />}
        {bp.data && tab === 'kit' && (
          <Panel>
            <p className="section-title">📁 Default files &amp; folder structure</p>
            <p className="hint" style={{ margin: '-6px 0 14px' }}>
              Every new project is born from this kit. The Project Setter only adds what's missing — it never
              overwrites a file that's already there.
            </p>
            <ul className="tree" aria-label="Starter kit">
              <TreeNodes nodes={kitTree(bp.data.tree, localDay(new Date().toISOString()))} />
            </ul>
          </Panel>
        )}
        {bp.data && tab === 'pri' && <Principles modules={bp.data.modules} modulesDir={bp.data.modulesDir} />}
      </div>
    </>
  );
}

function TreeNodes({ nodes }: { nodes: KitNode[] }) {
  return nodes.map((n) => (
    <li key={n.path}>
      <div className="node">
        <span className="glyph" aria-hidden="true">
          {n.glyph}
        </span>
        <span className="path">{n.path}</span>
        <span className="desc">{n.desc}</span>
      </div>
      {n.children && (
        <ul>
          <TreeNodes nodes={n.children} />
        </ul>
      )}
    </li>
  ));
}

function Principles({ modules, modulesDir }: { modules: BlueprintModule[]; modulesDir: string }) {
  const [reading, setReading] = useState<BlueprintModule | null>(null);
  const principles = modules.flatMap(principlesOf);
  const dir = tildeHome(modulesDir);
  return (
    <div className="bp-grid">
      <Panel>
        <p className="section-title">📐 Principles projects follow</p>
        {modules.length === 0 ? (
          <p className="hint">
            No modules yet — add <code>.md</code> files to <code>{dir}</code>.
          </p>
        ) : (
          <>
            <div className="bp-modules">
              {modules.map((m) => (
                <div className="bp-module" key={m.name}>
                  <span className="tag" style={tagStyle(m.name)}>
                    {moduleLabel(m.name)}
                  </span>
                  <span className="d">{m.description || `${m.name}.md`}</span>
                  <Button
                    small
                    onClick={() => setReading(m)}
                    aria-label={`Read the ${moduleLabel(m.name)} module`}
                  >
                    Read
                  </Button>
                </div>
              ))}
            </div>
            <div className="principle-grid">
              {principles.map((p) => (
                <div className="principle-card" key={`${p.module}:${p.title}`}>
                  <span className="tag" style={tagStyle(p.module)}>
                    {moduleLabel(p.module)}
                  </span>
                  <b>{p.title}</b>
                  {p.text && <p>{p.text}</p>}
                </div>
              ))}
            </div>
          </>
        )}
        <p className="hint bp-source">
          Read-only here. The source is <code>{dir}</code> — edit the module files there; new projects compile
          their CLAUDE.md from them.
        </p>
      </Panel>
      <Panel>
        <p className="section-title">🩺 Per-project freshness</p>
        <FreshnessList modules={modules} />
      </Panel>
      <Sheet
        open={reading !== null}
        onClose={() => setReading(null)}
        label={reading ? `${moduleLabel(reading.name)} module` : 'Module'}
        wide
      >
        {reading && (
          <>
            <p className="hint" style={{ margin: '0 0 12px' }}>
              <code>
                {dir}/{reading.name}.md
              </code>{' '}
              · read-only — edit it there
            </p>
            <div className="module-text">
              <Markdown source={reading.body} />
            </div>
          </>
        )}
      </Sheet>
    </div>
  );
}

function FreshnessList({ modules }: { modules: BlueprintModule[] }) {
  const projects = useQuery('projects', blueprintApi.projects);
  if (projects.loading) return <p className="hint">Checking projects…</p>;
  if (projects.error) return <ErrorState error={projects.error} onRetry={projects.refetch} />;
  const list = freshnessProjects(projects.data ?? []);
  if (!list.length) return <p className="hint">No projects on disk yet — new ones start up to date.</p>;
  return (
    <>
      {list.map((p) => (
        <FreshRow key={p.id} project={p} modules={modules} />
      ))}
      <p className="hint" style={{ margin: '4px 0 0' }}>
        A project is up to date when its CLAUDE.md was compiled after the last module change. Rebuild an
        outdated one with the <code>rebuild-claude-md</code> routine.
      </p>
    </>
  );
}

function FreshRow({ project: p, modules }: { project: Project; modules: BlueprintModule[] }) {
  const rep = useQuery(keys.scaffold(p.id), () => blueprintApi.scaffold(p.id));
  const f = rep.data && freshness(rep.data, modules);
  return (
    <div className="fresh-row">
      <LogoTile tile={p.tile} small />
      <div style={{ flex: 'none', maxWidth: '45%' }}>
        <b style={{ fontSize: 14 }}>{p.name}</b>
        {f?.state === 'broken' && f.generated && (
          <div className="more">CLAUDE.md compiled on {prettyDay(f.generated)}</div>
        )}
      </div>
      <div className={`st ${f?.state === 'ok' ? 'ok' : f ? 'stale' : ''}`}>
        {rep.loading ? 'Checking…' : rep.error ? `⚠ Can't check — ${rep.error.message}` : f?.label}
      </div>
    </div>
  );
}
