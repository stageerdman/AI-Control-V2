/* The prototype's fireConfetti() / sparkle() (core.js) on the shared .confetti layer
   (design/prototype.css). Nothing under reduced motion. */
import { PALETTE, reducedMotion } from '../../design/palette';

function layer(): HTMLElement {
  let c = document.querySelector<HTMLElement>('body > .confetti');
  if (!c) {
    c = document.createElement('div');
    c.className = 'confetti';
    c.setAttribute('aria-hidden', 'true');
    document.body.appendChild(c);
  }
  return c;
}

/** A burst across the screen (a project is born). */
export function fireConfetti(): void {
  if (reducedMotion()) return;
  const c = layer();
  const cols = Object.values(PALETTE);
  for (let i = 0; i < 60; i++) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}vw`;
    p.style.background = cols[i % cols.length];
    p.style.animationDuration = `${1.4 + Math.random() * 1.4}s`;
    p.style.animationDelay = `${Math.random() * 0.3}s`;
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    c.appendChild(p);
    setTimeout(() => p.remove(), 3200);
  }
}

/** A small sparkle at (x vw, y vh) — a step done, someone minted. */
export function sparkle(x = 50, y = 40): void {
  if (reducedMotion()) return;
  const c = layer();
  const cols = [PALETTE.mint, PALETTE.sun, PALETTE.teal];
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('i');
    p.style.left = `${x - 15 + Math.random() * 30}vw`;
    p.style.top = `${y}vh`;
    p.style.background = cols[i % cols.length];
    p.style.animationDuration = `${1 + Math.random()}s`;
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    c.appendChild(p);
    setTimeout(() => p.remove(), 2200);
  }
}
