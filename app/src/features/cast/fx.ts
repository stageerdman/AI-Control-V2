/* Cast motion + a11y helpers — the prototype's cx* helpers (cast.js) and core.js effects,
   imperative on purpose: FLIP camera moves, hops, poofs and walks act on real DOM nodes. */

export const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion:reduce)').matches;

/* ---- screen-reader announcements (one polite live region, created on first use) ---- */
let live: HTMLElement | null = null;
export function announce(msg: string) {
  if (!live?.isConnected) {
    live = document.createElement('div');
    live.className = 'sr-only';
    live.setAttribute('aria-live', 'polite');
    live.id = 'cast-live';
    document.body.appendChild(live);
  }
  live.textContent = msg;
}

/** FLIP: animate el from `from` to where it is now (or back, reverse). Feet-anchored. */
export function flip(
  el: Element | null | undefined,
  from: DOMRect | null | undefined,
  { duration = 560, easing = 'cubic-bezier(.2,.8,.2,1)', reverse = false } = {},
): Animation | null {
  if (!el || !from?.width || reducedMotion() || !(el as HTMLElement).animate) return null;
  const to = el.getBoundingClientRect();
  if (!to.width) return null;
  const s = from.height / to.height;
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.bottom - to.bottom;
  const a = `translate(${dx}px,${dy}px) scale(${s})`;
  (el as HTMLElement).style.transformOrigin = '50% 100%';
  return (el as HTMLElement).animate(
    reverse ? [{ transform: 'none' }, { transform: a }] : [{ transform: a }, { transform: 'none' }],
    { duration, easing, fill: reverse ? 'forwards' : 'none' },
  );
}

/** Run fn once when an animation ends — with a timer fallback (throttled tabs never fire onfinish). */
export function after(anim: Animation | null | undefined, fn: () => void) {
  let done = false;
  const once = () => {
    if (!done) {
      done = true;
      fn();
    }
  };
  if (!anim) {
    once();
    return;
  }
  anim.onfinish = once;
  const t = anim.effect?.getTiming ? Number(anim.effect.getTiming().duration) || 0 : 600;
  setTimeout(once, t + 120);
}

export function hop(h: Element | null | undefined) {
  if (!h || reducedMotion()) return;
  h.classList.remove('hop');
  void (h as HTMLElement).offsetWidth;
  h.classList.add('hop');
  setTimeout(() => h.classList.remove('hop'), 420);
}

export function poof(holder: Element | null | undefined) {
  if (!holder || reducedMotion()) return;
  const p = document.createElement('div');
  p.className = 'cx-poof';
  p.innerHTML = '<i></i>'.repeat(8);
  p.setAttribute('aria-hidden', 'true');
  holder.appendChild(p);
  setTimeout(() => p.remove(), 650);
}

/** Keep Tab inside a dialog. */
export function trapTab(e: KeyboardEvent, root: Element) {
  if (e.key !== 'Tab') return;
  const f = [
    ...root.querySelectorAll<HTMLElement>(
      'button:not([disabled]),[href],input,textarea,select,[tabindex]:not([tabindex="-1"])',
    ),
  ].filter((x) => x.offsetParent !== null && !x.closest('[inert],[hidden]'));
  if (!f.length) return;
  const first = f[0] as HTMLElement;
  const last = f[f.length - 1] as HTMLElement;
  if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/** Overlays sit inside the scrolling scene: pin them to the visible box. */
export function place(z: HTMLElement, scene: HTMLElement) {
  z.style.top = `${scene.scrollTop}px`;
  z.style.height = `${scene.clientHeight}px`;
  scene.classList.add('zoomed');
}

/** Measure an element as if `world` had none of `classes` (the camera transform). */
export function rectUnpushed(world: HTMLElement, el: Element, classes: string[]) {
  world.style.transition = 'none';
  const had = classes.filter((c) => world.classList.contains(c));
  for (const c of had) world.classList.remove(c);
  const r = el.getBoundingClientRect();
  for (const c of had) world.classList.add(c);
  void world.offsetWidth;
  world.style.transition = '';
  return r;
}

/* ---- confetti (team birth) + sparkle (new captain) — core.js ---- */
const COLS = ['#ffc24b', '#ff9b3d', '#ff6f73', '#2fd3c3', '#4ea8ff', '#9b6cff', '#8be88b', '#ff9ecf'];
function confettiLayer() {
  let c = document.getElementById('confetti');
  if (!c) {
    c = document.createElement('div');
    c.id = 'confetti';
    c.className = 'confetti';
    c.setAttribute('aria-hidden', 'true');
    document.body.appendChild(c);
  }
  return c;
}
export function fireConfetti() {
  if (reducedMotion()) return;
  const c = confettiLayer();
  for (let i = 0; i < 60; i++) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}vw`;
    p.style.background = COLS[i % COLS.length] as string;
    p.style.animationDuration = `${1.4 + Math.random() * 1.4}s`;
    p.style.animationDelay = `${Math.random() * 0.3}s`;
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    c.appendChild(p);
    setTimeout(() => p.remove(), 3200);
  }
}
/** Small scoped burst; x/y in vw/vh. */
export function sparkle(x = 50, y = 40) {
  if (reducedMotion()) return;
  const c = confettiLayer();
  const cols = ['#8be88b', '#ffc24b', '#2fd3c3'];
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('i');
    p.style.left = `${x - 15 + Math.random() * 30}vw`;
    p.style.top = `${y}vh`;
    p.style.background = cols[i % cols.length] as string;
    p.style.animationDuration = `${1 + Math.random()}s`;
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    c.appendChild(p);
    setTimeout(() => p.remove(), 2200);
  }
}

/** Restart the quiet "Saved ✓" pip inside a panel. */
export function pingSaved(root: Element | null | undefined) {
  const p = root?.querySelector('.zp-saved');
  if (!p) return;
  p.classList.remove('on');
  void (p as HTMLElement).offsetWidth;
  p.classList.add('on');
}
