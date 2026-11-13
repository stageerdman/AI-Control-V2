/* #gallery dev route — every agent × pose × facing × size, all looks, extras and every emblem × 7
   hues. A React port of the prototype's gallery.js, cell for cell, so the two can be compared
   side by side (prototype shots: concepts/disney-v3/shots/g-*.png, r-*.png). Not in the nav. */
import { type ReactNode, useRef, useState } from 'react';
import {
  ACCESSORIES,
  BUILDS,
  CaptainPip,
  EMBLEMS,
  Emblem,
  HAIR,
  HATS,
  Hero,
  type HeroAgent,
  type HeroHandle,
  type HeroProps,
  HOLDINGS,
  hatDecal,
  lookSlot,
  POSES,
  type Pose,
  randomLook,
  TOOLS,
} from '../characters';
import { COLOR_NAMES, HUES, PALETTE } from '../design/palette';
import type { PageProps } from '../shell/pages';
import cast from './demo-cast.json';
import './gallery.css';

const SECTIONS = ['roster', 'zoom', 'poses', 'facings', 'sizes', 'looks', 'extras', 'emblems'] as const;
const agents = cast as (HeroAgent & { id: string; name: string; role: string })[];
const byId = (id: string) => agents.find((a) => a.id === id) as HeroAgent;

function Sec({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="gal-sec" id={`gal-${id}`}>
      <h2>{title}</h2>
      {note && <p>{note}</p>}
      {children}
    </section>
  );
}
const Row = ({ cls = '', label, children }: { cls?: string; label?: string; children: ReactNode }) => (
  <div className={`gal-row ${cls}`}>
    {label && <span className="gal-rl">{label}</span>}
    {children}
  </div>
);
function Cell({ cap, desk, children }: { cap?: string; desk?: boolean; children: ReactNode }) {
  return (
    <figure className={`gal-cell${desk ? ' desk' : ''}`}>
      {children}
      {cap && <figcaption>{cap}</figcaption>}
    </figure>
  );
}
const H = (agent: HeroAgent, p: Omit<HeroProps, 'agent'>, cap?: string, desk?: boolean) => (
  <Cell cap={cap} desk={desk}>
    <Hero agent={agent} {...p} />
  </Cell>
);

export function Gallery({ route }: PageProps<'gallery'>) {
  const section = route.section;
  const only: readonly string[] = (SECTIONS as readonly string[]).includes(section) ? [section] : SECTIONS;
  const on = (s: string) => only.includes(s);
  const base = { hat: 'none', tool: 'none', body: 'hero', antenna: 'swoop', face: 'none', hue: 'sky' };
  const [random] = useState(() => randomLook());
  return (
    <>
      <header className="gal-head">
        <b>Character gallery</b>
        <nav>
          {SECTIONS.map((s) => (
            <a key={s} href={`#gallery/${s}`} aria-current={s === section ? 'page' : undefined}>
              {s}
            </a>
          ))}
          <a href="#gallery">all</a>
          <a href="#projects">← studio</a>
        </nav>
      </header>
      <main className="gal-body">
        {on('roster') && (
          <Sec
            id="roster"
            title="Roster at 48px (legibility) · colour / greyscale"
            note="Studio crew first. Each costume must be readable from hat + tool alone."
          >
            <Row>
              {agents.map((a) => (
                <Frag key={a.id}>{H(a, { size: 'xs' }, a.role)}</Frag>
              ))}
            </Row>
            <Row cls="gray">
              {agents.map((a) => (
                <Frag key={a.id}>{H(a, { size: 'xs' }, a.role)}</Frag>
              ))}
            </Row>
            <Row>
              {agents.map((a) => (
                <Frag key={a.id}>{H(a, { size: 'sm' }, a.name)}</Frag>
              ))}
            </Row>
          </Sec>
        )}
        {on('zoom') && (
          <Sec id="zoom" title="Hero zoom size (xl 360) — front, looking at you">
            <Row>
              {['a-pete', 'a-semic', 'a-scar', 'a-lint'].map((id) => (
                <Frag key={id}>
                  {H(
                    byId(id),
                    id === 'a-semic'
                      ? { size: 'xl', facing: 'front', captain: true, armband: PALETTE.sun }
                      : { size: 'xl', facing: 'front' },
                    byId(id).name,
                  )}
                </Frag>
              ))}
            </Row>
          </Sec>
        )}
        {on('poses') && (
          <Sec
            id="poses"
            title="Every role × every pose (sm 96, three-quarter)"
            note="Seated poses (typing, chilling) sit on a desk stub here; the Office supplies real desks."
          >
            <div className="gal-row gal-poses-head">
              <span />
              {POSES.map((p) => (
                <span key={p}>{p}</span>
              ))}
            </div>
            {agents.map((a) => (
              <Row key={a.id} cls="gal-poses" label={a.name}>
                {POSES.map((p) => (
                  <Frag key={p}>
                    {H(a, { size: 'sm', pose: p }, undefined, p === 'typing' || p === 'chilling')}
                  </Frag>
                ))}
              </Row>
            ))}
          </Sec>
        )}
        {on('facings') && (
          <Sec id="facings" title="Facings × dir (md 128): ¾ right · side right · front · ¾ left · side left">
            {agents.map((a) => (
              <Row key={a.id} label={a.name}>
                {(
                  [
                    ['three-quarter', 'right'],
                    ['side', 'right'],
                    ['front', 'right'],
                    ['three-quarter', 'left'],
                    ['side', 'left'],
                  ] as const
                ).map(([f, d]) => (
                  <Frag key={f + d}>{H(a, { size: 128, facing: f, dir: d })}</Frag>
                ))}
                {H(a, { size: 128, pose: 'walking', facing: 'side' }, 'walk')}
                {H(a, { size: 128, pose: 'talking', facing: 'side', dir: 'left' }, 'talk ←')}
              </Row>
            ))}
          </Sec>
        )}
        {on('sizes') && (
          <Sec
            id="sizes"
            title="Sizes: 40 · 48 (xs) · 56 · 64 · 72 · 96 (sm) · 160 (md) · 360 (xl)"
            note="LOD (lod-xs) applies below 64px: no badge/blush/trim, thicker ink, keeps headgear, tool, eyes, catch-light."
          >
            {['a-baron', 'a-twinkle'].map((id) => (
              <Row key={id} cls="gal-bottom">
                {[40, 48, 56, 64, 72, 96, 160, 360].map((px) => (
                  <Frag key={px}>{H(byId(id), { size: px }, `${px}px`)}</Frag>
                ))}
              </Row>
            ))}
          </Sec>
        )}
        {on('looks') && (
          <Sec
            id="looks"
            title="Looks (independent of role): bodies × antennas · faces · hats · tools · hues"
          >
            {BUILDS.map((b) => (
              <Row key={b} label={b}>
                {HAIR.map((h, i) => (
                  <Frag key={h}>
                    {H({ name: b, hue: HUES[i % 7], build: b, hair: h }, { size: 'sm' }, h)}
                  </Frag>
                ))}
              </Row>
            ))}
            <Row label="extra">
              {ACCESSORIES.map((acc, i) => (
                <Frag key={acc}>
                  {H(
                    { name: acc, hue: HUES[(i + 3) % 7], build: 'hero', hair: 'tuft', accessory: acc },
                    { size: 'sm', facing: 'front' },
                    acc,
                  )}
                </Frag>
              ))}
            </Row>
            <Row label="hats">
              {Object.keys(HATS).map((h, i) => (
                <Frag key={h}>
                  {H(
                    { name: h, look: { ...base, hat: h, decal: hatDecal(h), hue: HUES[i % 7] } },
                    { size: 'sm', facing: 'front' },
                    lookSlot('hat').name(h),
                  )}
                </Frag>
              ))}
            </Row>
            <Row label="tools">
              {Object.keys(TOOLS).map((t, i) => (
                <Frag key={t}>
                  {H(
                    { name: t, look: { ...base, tool: t, hue: HUES[(i + 2) % 7] } },
                    { size: 'sm' },
                    lookSlot('tool').name(t),
                  )}
                </Frag>
              ))}
            </Row>
            <Row label="hues">
              {HUES.map((hk) => (
                <Frag key={hk}>
                  {H(
                    {
                      name: hk,
                      look: {
                        ...base,
                        hat: 'mortarboard',
                        tool: 'book',
                        decal: 'Research',
                        antenna: 'curl',
                        hue: hk,
                      },
                    },
                    { size: 'sm' },
                    COLOR_NAMES[hk],
                  )}
                </Frag>
              ))}
            </Row>
          </Sec>
        )}
        {on('extras') && (
          <Sec id="extras" title="Captain · ghost · holding · seated · role override · turn demo">
            <Row cls="gal-bottom">
              {H(byId('a-semic'), { size: 'xs', captain: true, armband: PALETTE.sun }, 'captain xs (pip)')}
              {H(byId('a-semic'), { size: 'sm', captain: true, armband: PALETTE.sun }, 'captain sm (pip)')}
              {H(
                byId('a-semic'),
                { size: 'md', captain: true, armband: PALETTE.sun, facing: 'front' },
                'captain md (armband)',
              )}
              {H(
                byId('a-lint'),
                { size: 'md', captain: true, armband: PALETTE.mint, pose: 'salute' },
                'captain salute',
              )}
              {H({}, { size: 'md', ghost: true }, 'ghost / + New')}
              {H(byId('a-twinkle'), { size: 'md' }, 'Twinkle')}
              {H({ name: 'Random', look: random }, { size: 'md' }, 'randomLook()')}
            </Row>
            <Row cls="gal-bottom">
              {HOLDINGS.map((h) => (
                <Frag key={h}>
                  {H(
                    byId('a-scar'),
                    {
                      size: 128,
                      pose:
                        h === 'envelope'
                          ? 'carrying'
                          : h === 'pen'
                            ? 'writing'
                            : h === 'binder'
                              ? 'reading'
                              : 'idle',
                      holding: h,
                    },
                    `holding ${h}`,
                  )}
                </Frag>
              ))}
            </Row>
            <Row cls="gal-bottom">
              {(['typing', 'chilling', 'sleeping', 'needs-input'] as Pose[]).map((p) => (
                <Frag key={p}>
                  {H(
                    byId('a-pete'),
                    { size: 128, pose: p, seated: true, label: true },
                    `${p} · seated`,
                    true,
                  )}
                </Frag>
              ))}
              <TurnDemo />
            </Row>
          </Sec>
        )}
        {on('emblems') && (
          <Sec id="emblems" title="Emblems × 7 hues (88px) · 24px · 16px · captain pips">
            {EMBLEMS.map((e) => (
              <Row key={e.id} label={e.name}>
                {HUES.map((hk) => (
                  <Cell key={hk}>
                    <Emblem id={e.id} color={hk} size={88} />
                  </Cell>
                ))}
                <div className="gal-small">
                  {HUES.map((hk) => (
                    <Emblem key={hk} id={e.id} color={hk} size={24} />
                  ))}
                  <Emblem id={e.id} color="sun" size={16} />
                </div>
              </Row>
            ))}
            <Row>
              {HUES.map((hk) => (
                <CaptainPip key={hk} hue={hk} />
              ))}
            </Row>
          </Sec>
        )}
      </main>
    </>
  );
}

const Frag = ({ children }: { children: ReactNode }) => <>{children}</>;

/** setFacing on a ref — the office's "turn to me" move. */
function TurnDemo() {
  const ref = useRef<HeroHandle>(null);
  const [front, setFront] = useState(false);
  return (
    <figure className="gal-cell desk">
      <Hero ref={ref} agent={byId('a-scar')} size={160} pose="typing" seated />
      <figcaption>setFacing turn demo</figcaption>
      <button
        type="button"
        className="btn btn-ghost on-dark btn-sm"
        onClick={() => {
          ref.current?.setFacing(front ? 'three-quarter' : 'front');
          setFront(!front);
        }}
      >
        {front ? 'Back to work' : 'Turn to me'}
      </button>
    </figure>
  );
}
