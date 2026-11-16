/* Invite another (updates/2026-11-16 INVITE ANOTHER design.md §2): one card, two doors. The original stands
   small and faded in the corner, the new bot big in the family look (same kit, new colour + antenna, from the
   server's copy-draft); a look dice rolls a fully random look, ↺ Family look brings the first one back; a name
   (suggested, all selected so typing replaces it) with its own dice. The card never knows which door opened it:
   `useInvite` holds the choice and makes the copy, `InviteStage` draws it, `InviteDialog` is the Cast door. */
import { type KeyboardEvent, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { type Agent, type CopyDraft, isApiError, type Look, studio } from '../../api';
import { Hero, LOOK_SLOTS, randomLook, setPose } from '../../characters';
import { hueHex } from '../../design/palette';
import { Button } from '../../ui';
import { announce, hop, poof, reducedMotion, trapTab } from './fx';
import { kinOf, nameTaken, nextFreeHue, sharesLine, twinOf } from './kin';
import { DICE } from './LookRig';
import { inviteCopy } from './store';
import './cast.css'; // the dice, the sun chip and the poof (the office door has no Cast page loaded)
import './invite.css';

type Change = 'open' | 'dice' | 'family' | 'hue' | null;
const slotName = (id: 'hue' | 'antenna', v: string) => LOOK_SLOTS.find((s) => s.id === id)?.name(v) ?? v;
const lookName = (l: Look) => `${slotName('hue', l.hue)}, ${slotName('antenna', l.antenna)} antenna`;

/** The card's state: the suggested name + family look, the user's changes, and making the copy. */
export function useInvite(original: Agent, agents: readonly Agent[]) {
  const [name, setName] = useState('');
  const [look, setLook] = useState<Look | null>(null);
  const [family, setFamily] = useState<Look | null>(null);
  const [clash, setClash] = useState(''); // a name the server said is taken (a race the local check missed)
  const [saveErr, setSaveErr] = useState('');
  const [saving, setSaving] = useState(false);
  const change = useRef<Change>(null);
  const made = useRef<Agent | null>(null);
  const kin = kinOf(original, agents);

  // biome-ignore lint/correctness/useExhaustiveDependencies: one suggestion per original
  useEffect(() => {
    let off = false;
    const fallback: CopyDraft = {
      name: '',
      look: {
        ...randomLook(original.look),
        hat: original.look.hat,
        tool: original.look.tool,
        decal: original.look.decal,
      },
    };
    studio.agents
      .copyDraft(original.id)
      .catch(() => fallback)
      .then((d) => {
        if (off) return;
        change.current = 'open';
        setName(d.name);
        setLook(d.look);
        setFamily(d.look);
      });
    return () => {
      off = true;
    };
  }, [original.id]);

  const trimmed = name.trim();
  const mine = made.current; // the copy already made: its own name doesn't count as taken
  const others = mine ? agents.filter((a) => a.id !== mine.id) : agents;
  const taken =
    !!trimmed && (nameTaken(trimmed, others) || (!mine && clash.toLowerCase() === trimmed.toLowerCase()));

  return {
    original,
    kin,
    name,
    look,
    ready: !!look,
    rolled: !!look && !!family && look !== family,
    taken,
    saving,
    saveErr,
    change,
    canSubmit: !!mine || (!!look && !!trimmed && !taken && !saving),
    setName: (v: string) => {
      setName(v);
      setSaveErr('');
    },
    /** A fully random look (nothing pinned). */
    roll() {
      if (!look) return;
      const next = randomLook(look);
      change.current = 'dice';
      setLook(next);
      announce(`New look: ${lookName(next)}`);
    },
    /** ↺ Family look: the look the card opened with. */
    backToFamily() {
      if (!family) return;
      change.current = 'family';
      setLook(family);
      announce(`Back to the family look: ${lookName(family)}`);
    },
    /** "Change colour" (the same-look warning): the next hue no kin wears. */
    freeColour() {
      if (!look) return;
      const next = nextFreeHue(look, [original, ...kin]);
      change.current = 'hue';
      setLook(next);
      announce(`New colour: ${slotName('hue', next.hue)}`);
    },
    /** Another free name from the server's pool (tries a few times for a different one). */
    async suggestName() {
      for (let i = 0; i < 4; i++) {
        const d = await studio.agents.copyDraft(original.id).catch(() => null);
        if (!d) return;
        if (d.name !== name || i === 3) {
          setName(d.name);
          setSaveErr('');
          announce(`Name: ${d.name}`);
          return d.name;
        }
      }
    },
    /** Make the copy (once — a retry after a later step failed reuses it). null = shown in place. */
    async submit(): Promise<Agent | null> {
      if (made.current) return made.current;
      if (!look || !trimmed || taken || saving) return null;
      setSaving(true);
      setSaveErr('');
      try {
        const a = await inviteCopy(original.id, { name: trimmed, look });
        made.current = a;
        announce(`${a.name} joined the Cast`);
        return a;
      } catch (e) {
        if (isApiError(e) && e.code === 'name_taken') setClash(trimmed);
        else setSaveErr(isApiError(e) ? e.message : 'Couldn’t reach the studio.');
        return null;
      } finally {
        setSaving(false);
      }
    },
  };
}
export type Invite = ReturnType<typeof useInvite>;

/** The card's body: the stage strip (original, new bot, dice), the name and the shared-instructions line. */
export function InviteStage({ inv, titleId }: { inv: Invite; titleId?: string }) {
  const { original, kin, look } = inv;
  const stage = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const oldRef = useRef<HTMLSpanElement>(null);
  const errId = useId();
  const nameId = useId();
  const twin = look ? twinOf(look, [original, ...kin]) : undefined;

  /* motion: poof + hop as it arrives, crossfade + poof per roll, hop back to the family look */
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs per look change
  useLayoutEffect(() => {
    const c = inv.change.current;
    inv.change.current = null;
    const fig = stage.current?.querySelector<HTMLElement>('.ic-new');
    const bot = fig?.querySelector<HTMLElement>('.hero');
    if (!c || !fig || !bot || reducedMotion()) return;
    if (c === 'open' || c === 'dice') poof(fig);
    if (c === 'dice' && bot.animate)
      bot.animate(
        [
          { opacity: 0, transform: 'scale(.94)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' },
      );
    else hop(bot);
    if (c === 'open') {
      const old = oldRef.current?.querySelector<HTMLElement>('.hero');
      if (old) {
        setPose(old, 'waving');
        setTimeout(() => old.isConnected && setPose(old, 'idle'), 900);
      }
    }
  }, [look]);

  /* focus starts in the name, all selected, once the suggestion is in */
  useEffect(() => {
    if (!inv.ready) return;
    nameRef.current?.focus();
    nameRef.current?.select();
  }, [inv.ready]);

  return (
    <div className="ic-body">
      <h2 className="sr-only" id={titleId}>
        Invite another agent like {original.name}
      </h2>
      <div
        className="ic-stage"
        ref={stage}
        style={{ '--accent': hueHex(look?.hue ?? original.look.hue) } as React.CSSProperties}
      >
        <div className="ic-floor" aria-hidden="true" />
        <figure className="ic-old" aria-hidden="true">
          <span ref={oldRef} style={{ display: 'contents' }}>
            <Hero agent={original} size={72} facing="three-quarter" pose="idle" />
          </span>
          <figcaption>{original.name}</figcaption>
        </figure>
        <div className="ic-new" aria-hidden="true">
          {look ? (
            <Hero
              agent={{ id: 'invite', name: inv.name || original.name, look }}
              size={160}
              facing="front"
              pose="idle"
            />
          ) : (
            <span className="ic-wait" />
          )}
        </div>
        <div className="ic-tools">
          <button
            type="button"
            className="lk-dice ic-dice"
            aria-label="Random look"
            title="Random look"
            disabled={!look}
            onClick={inv.roll}
          >
            {DICE}
          </button>
          {inv.rolled && (
            <button
              type="button"
              className="zp-chip ic-family"
              aria-label="Back to the family look"
              onClick={inv.backToFamily}
            >
              ↺ Family look
            </button>
          )}
        </div>
      </div>
      {twin && (
        <p className="ic-twin">
          <span>Looks just like {twin.name}. Hard to tell apart in the office.</span>
          <button type="button" className="zp-chip" onClick={inv.freeColour}>
            Change colour
          </button>
        </p>
      )}
      <div className="ic-name">
        <label htmlFor={nameId}>Name</label>
        <div className="ic-name-row">
          <input
            ref={nameRef}
            id={nameId}
            maxLength={22}
            autoComplete="off"
            spellCheck={false}
            value={inv.name}
            disabled={!inv.ready}
            aria-invalid={inv.taken || undefined}
            aria-describedby={inv.taken ? errId : undefined}
            onChange={(e) => inv.setName(e.target.value)}
          />
          <button
            type="button"
            className="lk-dice ic-name-dice"
            aria-label="Suggest another name"
            title="Suggest another name"
            disabled={!inv.ready}
            onClick={() => void inv.suggestName().then(() => nameRef.current?.select())}
          >
            {DICE}
          </button>
        </div>
        {inv.taken && (
          <p className="ic-err" id={errId} role="alert">
            There’s already a {inv.name.trim()} in the Cast.
          </p>
        )}
      </div>
      <p className="ic-shares">{sharesLine(original, kin)}</p>
    </div>
  );
}

/** The Cast door: the card as a dialog over the zoom. Esc closes only the card; focus goes back to the door. */
export function InviteDialog({
  original,
  agents,
  onClose,
  onDone,
}: {
  original: Agent;
  agents: readonly Agent[];
  onClose: () => void;
  onDone: (a: Agent) => void;
}) {
  const inv = useInvite(original, agents);
  const card = useRef<HTMLFormElement>(null);
  const titleId = useId();
  const door = useRef<Element | null>(typeof document !== 'undefined' ? document.activeElement : null);
  const close = () => {
    onClose();
    setTimeout(() => (door.current as HTMLElement | null)?.focus?.(), 0);
  };
  /* every key stays in the card (the zoom behind it steps on [ / ] and closes on Esc) */
  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab' && card.current) trapTab(e.nativeEvent, card.current);
  };
  const label = inv.name.trim() || 'them';
  return (
    <div className="ic-scrim">
      <form
        ref={card}
        className="ic"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKey}
        onSubmit={(e) => {
          e.preventDefault();
          void inv.submit().then((a) => a && onDone(a));
        }}
      >
        <button type="button" className="ic-close" aria-label="Close" onClick={close}>
          ×
        </button>
        <InviteStage inv={inv} titleId={titleId} />
        {inv.saveErr && (
          <p className="ic-err" role="alert">
            {inv.saveErr}
          </p>
        )}
        <footer className="ic-foot">
          <Button type="submit" variant="hero" disabled={!inv.canSubmit}>
            {inv.saving ? `Adding ${label}…` : inv.saveErr ? 'Try again' : `Add ${label} to the Cast`}
          </Button>
        </footer>
      </form>
    </div>
  );
}
