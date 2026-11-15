/* The bell by the door (STUDIO LIFE, spec-ux-office §4): bring a Cast agent into this office with your own brief —
   no director approval. They start on it at once; the director may plan with them only if you let him. "Here now"
   lists the guests, each with Send home. Arrivals and departures play in the room (guest.changed). */
import { type FormEvent, useId, useState } from 'react';
import { type Agent, isApiError, studio } from '../../api';
import { Hero } from '../../characters';
import { Button, Sheet, Switch, TextArea } from '../../ui';
import { shortName } from '../reports';
import type { OfficeView } from './api';
import { bringable, clip } from './life';

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
  const pick = bringable(roster, here);
  const [who, setWho] = useState<string | null>(null);
  const [brief, setBrief] = useState('');
  const [may, setMay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const hintId = useId();
  const chosen = who ? byId.get(who) : undefined;
  const nick = chosen ? shortName(chosen) : '';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!chosen || !brief.trim() || busy) return;
    setBusy(true);
    setErr('');
    try {
      await studio.guests.add(pid, { agentId: chosen.id, brief: brief.trim(), orchestratorMay: may });
      onBrought(chosen);
    } catch (x) {
      setErr(isApiError(x) || x instanceof Error ? x.message : `Couldn’t bring ${nick} in.`);
      setBusy(false);
    }
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
      {!pick.length ? (
        <p className="rp-empty">Everyone in the Cast is already here.</p>
      ) : (
        <form onSubmit={submit}>
          {/* native radios (arrow keys move, Space picks); each card is the radio's label */}
          <fieldset className="bi-who-set">
            <legend className="bi-lbl">Who</legend>
            <div className="bi-pick">
              {pick.map((a) => (
                <label key={a.id} className={who === a.id ? 'on' : undefined}>
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
              ))}
            </div>
          </fieldset>
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
            <Switch
              checked={may}
              onChange={setMay}
              label="Director may give them work"
              describedBy={hintId}
            />
          </div>
          {err && (
            <p className="bi-err" role="alert">
              {err}
            </p>
          )}
          <footer className="lf-foot">
            <Button type="submit" variant="hero" disabled={!chosen || !brief.trim() || busy}>
              {busy ? `Calling ${nick}…` : chosen ? `Bring ${nick} in` : 'Bring them in'}
            </Button>
          </footer>
        </form>
      )}
    </div>
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
