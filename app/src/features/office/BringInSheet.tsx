/* The bell by the door (STUDIO LIFE, spec-ux-office §4): bring a Cast agent into this office with your own brief —
   no director approval. They start on it at once; the director may plan with them only if you let him. "Here now"
   lists the guests, each with Send home. Arrivals and departures play in the room (guest.changed). */
import { type FormEvent, type ReactNode, useId, useState } from 'react';
import { type Agent, isApiError, studio } from '../../api';
import { Hero } from '../../characters';
import { Button, Sheet, Switch, TextArea } from '../../ui';
import { InviteStage, useInvite } from '../cast/InviteCard';
import { shortName } from '../reports';
import type { OfficeView } from './api';
import { clip, whoGrid } from './life';

type GuestRow = NonNullable<OfficeView['guests']>[number];

export type BringInProps = {
  pid: string;
  roster: Agent[];
  /** Everyone already in this office (staff and guests). */
  here: ReadonlySet<string>;
  guests: GuestRow[];
  director: string;
  open: boolean;
  onClose: () => void;
  /** They're on the way (the sheet closes; the room shows them coming in). */
  onBrought: (agent: Agent) => void;
};

export function BringInSheet(p: BringInProps) {
  return (
    <Sheet open={p.open} onClose={p.onClose} label="Bring someone in">
      {p.open && <BringInBody {...p} />}
    </Sheet>
  );
}

export function BringInBody({ pid, roster, here, guests, director, onBrought }: BringInProps) {
  const byId = new Map(roster.map((a) => [a.id, a]));
  const grid = whoGrid(roster, here);
  const [who, setWho] = useState<string | null>(null);
  /* ＋ Another: the agent a new copy is invited from (the grid folds away, the invite card takes its place) */
  const [another, setAnother] = useState<Agent | null>(null);
  const brief = useState('');
  const may = useState(false);
  const hintId = useId();
  const chosen = who ? byId.get(who) : undefined;
  const everyone = grid.length > 0 && grid.every((g) => g.here);
  const pickAnother = (a: Agent) => {
    setAnother(a);
    setWho(null);
  };

  return (
    <div className="lf">
      {guests.length > 0 && (
        <>
          <h3>Here now</h3>
          <ul className="bi-here">
            {guests.map((g) => (
              <HereRow key={g.agentId} pid={pid} guest={g} agent={byId.get(g.agentId)} />
            ))}
          </ul>
        </>
      )}
      <h2 style={{ marginTop: guests.length ? 22 : 0 }}>Bring someone in</h2>
      {!grid.length ? (
        <p className="rp-empty">There’s no one in the Cast to bring in yet.</p>
      ) : another ? (
        <AnotherForm
          key={another.id}
          pid={pid}
          original={another}
          agents={roster}
          brief={brief}
          may={may}
          director={director}
          onBack={() => setAnother(null)}
          onBrought={onBrought}
        />
      ) : (
        <PickForm pid={pid} chosen={chosen} brief={brief} may={may} director={director} onBrought={onBrought}>
          {everyone && (
            <p className="rp-empty bi-everyone">
              Everyone’s here. Need another pair of hands? Pick someone and tap ＋ Another.
            </p>
          )}
          {/* native radios (arrow keys move, Space picks); each card is the radio's label. The ones already here
              aren't a choice: their card holds ＋ Another instead. */}
          <fieldset className="bi-who-set">
            <legend className="bi-lbl">Who</legend>
            <div className="bi-pick">
              {grid.map(({ agent: a, here: isHere }) =>
                isHere ? (
                  <div key={a.id} className="bi-card is-here">
                    <Hero agent={a} size={40} pose="idle" facing="front" />
                    <b>{shortName(a)}</b>
                    <span className="bi-tag">Here</span>
                    <button
                      type="button"
                      className="bi-another"
                      aria-label={`Invite another agent like ${a.name}`}
                      onClick={() => pickAnother(a)}
                    >
                      ＋ Another
                    </button>
                  </div>
                ) : (
                  <div key={a.id} className="bi-card">
                    <label className={who === a.id ? 'on' : undefined}>
                      <input
                        type="radio"
                        className="sr-only"
                        name={`${hintId}-who`}
                        value={a.id}
                        checked={who === a.id}
                        onChange={() => setWho(a.id)}
                      />
                      <Hero agent={a} size={40} pose="idle" facing="front" />
                      <b>{shortName(a)}</b>
                      <span className="hint">{a.role || 'Agent'}</span>
                    </label>
                    <button
                      type="button"
                      className="bi-plus"
                      aria-label={`Invite another agent like ${a.name}`}
                      title="＋ Another"
                      onClick={() => pickAnother(a)}
                    >
                      ＋
                    </button>
                  </div>
                ),
              )}
            </div>
          </fieldset>
        </PickForm>
      )}
    </div>
  );
}

type Field<T> = [T, (v: T) => void];
type FormBits = {
  pid: string;
  brief: Field<string>;
  may: Field<boolean>;
  director: string;
  onBrought: (agent: Agent) => void;
};

/** Bring someone from the Cast: pick a card, write the brief. */
function PickForm({
  pid,
  chosen,
  brief,
  may,
  director,
  onBrought,
  children,
}: FormBits & { chosen?: Agent; children: ReactNode }) {
  const nick = chosen ? shortName(chosen) : '';
  return (
    <BriefForm
      brief={brief}
      may={may}
      director={director}
      ready={!!chosen}
      label={(busy) => (busy ? `Calling ${nick}…` : chosen ? `Bring ${nick} in` : 'Bring them in')}
      bring={async () => {
        if (!chosen) return null;
        await studio.guests.add(pid, { agentId: chosen.id, brief: brief[0].trim(), orchestratorMay: may[0] });
        return chosen;
      }}
      onBrought={onBrought}
      fallback={`Couldn’t bring ${nick} in.`}
    >
      {children}
    </BriefForm>
  );
}

/** ＋ Another: the invite card instead of the grid, then the brief. The copy is made once; a failed bring-in
    after that retries with the same copy. */
function AnotherForm({
  pid,
  original,
  agents,
  brief,
  may,
  director,
  onBack,
  onBrought,
}: FormBits & { original: Agent; agents: readonly Agent[]; onBack: () => void }) {
  const inv = useInvite(original, agents);
  const nick = inv.name.trim() || 'them';
  return (
    <BriefForm
      brief={brief}
      may={may}
      director={director}
      ready={inv.canSubmit}
      label={(busy) => (busy ? `Calling ${nick}…` : inv.saveErr ? 'Try again' : `Bring ${nick} in`)}
      bring={async () => {
        const copy = await inv.submit();
        if (!copy) return null;
        await studio.guests.add(pid, { agentId: copy.id, brief: brief[0].trim(), orchestratorMay: may[0] });
        return copy;
      }}
      onBrought={onBrought}
      fallback={`Couldn’t bring ${nick} in.`}
      error={inv.saveErr}
    >
      <InviteStage inv={inv} />
      <button type="button" className="bi-back" onClick={onBack}>
        Pick someone else
      </button>
    </BriefForm>
  );
}

/** The part both forms share: the brief, the director switch, the error line and the one button. */
function BriefForm({
  brief: [brief, setBrief],
  may: [may, setMay],
  director,
  ready,
  label,
  bring,
  onBrought,
  fallback,
  error,
  children,
}: Omit<FormBits, 'pid'> & {
  ready: boolean;
  label: (busy: boolean) => string;
  /** Do it; null = nothing happened (the reason is already shown). */
  bring: () => Promise<Agent | null>;
  fallback: string;
  error?: string;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const hintId = useId();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || !brief.trim() || busy) return;
    setBusy(true);
    setErr('');
    try {
      const a = await bring();
      if (a) onBrought(a);
      else setBusy(false);
    } catch (x) {
      setErr(isApiError(x) || x instanceof Error ? x.message : fallback);
      setBusy(false);
    }
  };
  const shown = err || error;
  return (
    <form onSubmit={submit}>
      {children}
      <TextArea
        label="Their brief"
        placeholder="Analyze the team’s communication and report to HQ"
        required
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
      />
      <div className="bi-switch">
        <div>
          <b>Director may give them work</b>
          <p className="hint" id={hintId}>
            {may ? `${director} can plan work with them too.` : 'They work only on your brief.'}
          </p>
        </div>
        <Switch checked={may} onChange={setMay} label="Director may give them work" describedBy={hintId} />
      </div>
      {shown && (
        <p className="bi-err" role="alert">
          {shown}
        </p>
      )}
      <footer className="lf-foot">
        <Button type="submit" variant="hero" disabled={!ready || !brief.trim() || busy}>
          {label(busy)}
        </Button>
      </footer>
    </form>
  );
}

function HereRow({ pid, guest, agent }: { pid: string; guest: GuestRow; agent?: Agent }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const nick = agent ? shortName(agent) : 'They';
  const home = async () => {
    setBusy(true);
    setErr('');
    try {
      await studio.guests.remove(pid, guest.agentId);
    } catch {
      setErr(`Couldn’t send ${nick} home.`);
      setBusy(false);
    }
  };
  return (
    <li>
      <span className="rp-face" aria-hidden="true">
        <Hero agent={agent ?? null} ghost={!agent} size={28} pose="idle" facing="front" />
      </span>
      <span className="bi-who">
        <b>{agent?.name ?? 'A retired agent'}</b>
        <span className="bi-brief" title={guest.brief}>
          {clip(guest.brief, 120)}
        </span>
        {guest.orchestratorMay && <span className="hint">Director may give them work</span>}
      </span>
      {!asking && (
        <Button small variant="ghost" onClick={() => setAsking(true)}>
          Send home
        </Button>
      )}
      {asking && (
        <span className="bi-confirm">
          <span>Send {nick} home? What they made stays.</span>
          <Button small variant="ghost" disabled={busy} onClick={() => void home()}>
            Send home
          </Button>
          <Button small variant="ghost" disabled={busy} onClick={() => setAsking(false)}>
            Keep
          </Button>
        </span>
      )}
      {err && (
        <span className="bi-err bi-confirm" role="alert">
          {err}
        </span>
      )}
    </li>
  );
}
