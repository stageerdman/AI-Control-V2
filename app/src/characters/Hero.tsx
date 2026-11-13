/* <Hero> — the React face of hero.ts. The markup is the prototype's string (byte-identical, see
   parity.test.ts); it's rebuilt only when the character's identity changes. Pose / facing / gaze
   changes are applied in place with setPose / setFacing / setLook, so the 250 ms screen-face turn
   and the arm follow-through animate exactly like the prototype. */
import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef } from 'react';
import {
  type Facing,
  type FacingOpts,
  type HeroAgent,
  type HeroOpts,
  type HeroSize,
  heroHeadAnchor,
  heroSVG,
  type Look,
  type Pose,
  type PoseOpts,
  setFacing,
  setLook,
  setPose,
} from './hero-svg';
import './hero.css';
import './guard.css';

export type HeroProps = {
  /** Anything with a name + look — a server Agent fits. */
  agent?: HeroAgent | null;
  /** Costume override merged over agent.look (e.g. a live preview in the look editor). */
  look?: Partial<Look> | null;
  size?: HeroSize;
  pose?: Pose;
  facing?: Facing;
  dir?: 'right' | 'left';
  /** Where the eyes point: {x, y} in −1…1, 'viewer', or null (the pose's default). */
  gaze?: HeroOpts['look'];
  seated?: boolean;
  holding?: HeroOpts['holding'];
  /** false hides the pose's desk + hand props. */
  props?: boolean;
  moving?: boolean;
  /** Re-dress as a role's kit (legacy prototype behaviour). */
  role?: string;
  captain?: boolean;
  /** Captain armband colour (palette key or hex). */
  armband?: string | null;
  ghost?: boolean;
  /** true → role="img" with "<name>, <role>, <what it's doing>"; otherwise decorative. */
  label?: boolean;
};

/** Imperative handle for scenes that drive characters directly (the office). */
export type HeroHandle = {
  el: HTMLElement | null;
  setPose: (pose: Pose, o?: PoseOpts) => void;
  setFacing: (facing: Facing, o?: FacingOpts) => void;
  setLook: (gaze: HeroOpts['look']) => void;
  headAnchor: () => { x: number; y: number } | null;
};

export const Hero = forwardRef<HeroHandle, HeroProps>(function Hero(p, ref) {
  const host = useRef<HTMLSpanElement>(null);
  const el = () => host.current?.firstElementChild as HTMLElement | null;
  const agent = p.look ? { ...p.agent, look: { ...p.agent?.look, ...p.look } } : (p.agent ?? {});

  /* identity: anything that changes the drawing itself (not the pose/facing state) */
  const identity = JSON.stringify([
    agent.id,
    agent.name,
    agent.role,
    agent.look,
    agent.hue,
    agent.build,
    agent.hair,
    agent.accessory,
    p.size,
    p.role,
    p.captain,
    p.armband,
    p.ghost,
    p.label,
  ]);
  const live = {
    pose: p.pose,
    facing: p.facing,
    dir: p.dir,
    gaze: p.gaze,
    seated: p.seated,
    holding: p.holding,
    props: p.props,
    moving: p.moving,
  };
  const liveRef = useRef(live);
  liveRef.current = live;

  // biome-ignore lint/correctness/useExhaustiveDependencies: rebuilt on identity only; live state is applied below
  const html = useMemo(() => {
    const l = liveRef.current;
    const opts: HeroOpts = {
      size: p.size,
      pose: l.pose,
      facing: l.facing,
      dir: l.dir,
      look: l.gaze,
      seated: l.seated,
      holding: l.holding,
      props: l.props,
      moving: l.moving,
      role: p.role,
      captain: p.captain,
      armband: p.armband,
      ghost: p.ghost,
      label: p.label,
    };
    for (const k of Object.keys(opts) as (keyof HeroOpts)[]) if (opts[k] === undefined) delete opts[k];
    return heroSVG(agent, opts);
  }, [identity]);

  /* apply pose / facing / gaze changes in place (skip what the fresh markup already has) */
  const applied = useRef<{ html: string; live: typeof live } | null>(null);
  useLayoutEffect(() => {
    const prev = applied.current;
    applied.current = { html, live };
    const node = el();
    if (!node || !prev || prev.html !== html) return;
    const was = prev.live;
    if (
      was.pose !== live.pose ||
      was.seated !== live.seated ||
      was.holding !== live.holding ||
      was.props !== live.props ||
      was.moving !== live.moving
    )
      setPose(node, live.pose ?? 'idle', {
        seated: live.seated,
        holding: live.holding,
        props: live.props,
        moving: live.moving,
      });
    if (was.facing !== live.facing || was.dir !== live.dir)
      setFacing(node, live.facing ?? 'three-quarter', {
        dir: live.dir ?? 'right',
        ...(live.gaze !== undefined ? { look: live.gaze } : {}),
      });
    else if (JSON.stringify(was.gaze) !== JSON.stringify(live.gaze)) setLook(node, live.gaze ?? null);
  });

  useImperativeHandle(ref, () => ({
    get el() {
      return el();
    },
    setPose: (pose, o) => void setPose(el(), pose, o),
    setFacing: (facing, o) => void setFacing(el(), facing, o),
    setLook: (gaze) => void setLook(el(), gaze),
    headAnchor: () => {
      const node = el();
      return node ? heroHeadAnchor(node) : null;
    },
  }));

  // biome-ignore lint/security/noDangerouslySetInnerHtml: the prototype's own generated SVG (escaped inputs)
  return <span ref={host} style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: html }} />;
});
