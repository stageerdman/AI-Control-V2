/* The letterbox (STUDIO LIFE, spec-ux-office §3): letters from other projects (HQ's box also gets mail addressed
   to HQ). Inbox — new first — and Sent; read one; File it or put it back. Agents write the letters and the director
   triages new ones on his own while you're here, so there is no composing here. */
import { useEffect, useState } from 'react';
import { invalidate, type Mail, type MailBox, type Project, studio, useQuery } from '../../api';
import { Button, Sheet } from '../../ui';
import { LogoTile } from '../projects/LogoTile';
import { Markdown, relWhen } from '../reports';
import { keys } from './api';
import { MAIL_KIND, MAIL_STATUS, type MailNames, mailFrom, mailStatusLine, mailTo, sortInbox } from './life';

export type MailSheetProps = {
  pid: string;
  /** This office is HQ (the studio's own project). */
  hq: boolean;
  hqId: string | null;
  name: string;
  director: string;
  open: boolean;
  onClose: () => void;
  /** "Talk about it": the director's chat about this letter. */
  onTalk: (m: Mail) => void;
  /** The goal a letter became (its name, when it's on the board). */
  goalName: (goalId: string) => string | null;
  onGoal: () => void;
};

export const refreshMail = (pid: string) =>
  Promise.all([invalidate(keys.mail(pid, 'in')), invalidate(keys.mail(pid, 'sent'))]);

export function MailSheet(p: MailSheetProps) {
  return (
    <Sheet open={p.open} onClose={p.onClose} label={p.hq ? 'HQ mail' : 'Mail'}>
      {p.open && <MailBody {...p} />}
    </Sheet>
  );
}

export function MailBody({ pid, hq, hqId, name, director, onTalk, goalName, onGoal }: MailSheetProps) {
  const [box, setBox] = useState<'in' | 'sent'>('in');
  const [readId, setReadId] = useState<string | null>(null);
  const inbox = useQuery<MailBox>(keys.mail(pid, 'in'), () => studio.mail.box(pid, 'in'));
  const sent = useQuery<MailBox>(box === 'sent' ? keys.mail(pid, 'sent') : null, () =>
    studio.mail.box(pid, 'sent'),
  );
  const projects = useQuery<Project[]>('projects', studio.projects.list);
  const agents = useQuery('agents', studio.agents.list);
  const { refetch } = inbox;
  // biome-ignore lint/correctness/useExhaustiveDependencies: read fresh once, when the box opens
  useEffect(() => {
    void refetch().catch(() => undefined);
  }, []);

  const proj = (id: string | null) => projects.data?.find((x) => x.id === id);
  const names: MailNames = {
    project: (id) => (id === 'hq' || (id && id === hqId) ? 'HQ' : (proj(id)?.name ?? 'Another project')),
    agent: (id) => {
      const a = id ? agents.data?.find((x) => x.id === id) : undefined;
      return a ? a.nick || a.name.split(/\s+/)[0] : id ? 'Someone' : null;
    },
  };
  const q = box === 'in' ? inbox : sent;
  const list = box === 'in' ? sortInbox(q.data?.mail ?? []) : (q.data?.mail ?? []);
  const reading = readId ? list.find((m) => m.id === readId) : undefined;
  const nSent = inbox.data?.sent ?? 0;
  const now = new Date();

  if (reading)
    return (
      <Letter
        m={reading}
        mine={box === 'in'}
        names={names}
        director={director}
        goalName={goalName}
        onBack={() => setReadId(null)}
        onTalk={() => onTalk(reading)}
        onGoal={onGoal}
        onStatus={async (status) => {
          await studio.mail.setStatus(pid, reading.id, status);
          await refreshMail(pid);
        }}
      />
    );

  let body: React.ReactNode;
  if (q.error && !q.data)
    body = (
      <div className="rp-error" role="alert">
        <span>Couldn’t load the mail.</span>
        <Button small onClick={() => void q.refetch()}>
          Try again
        </Button>
      </div>
    );
  else if (!q.data)
    body = (
      <ul className="rp-rows" aria-busy="true" aria-label="Loading the mail">
        {[0, 1, 2].map((i) => (
          <li key={i}>
            <div className="rp-row rp-ph" aria-hidden="true">
              <span className="rp-bar" style={{ width: `${60 - i * 8}%`, height: 14 }} />
              <span className="rp-bar" style={{ width: '34%' }} />
            </div>
          </li>
        ))}
      </ul>
    );
  else if (!list.length)
    body = (
      <p className="rp-empty">
        {box === 'sent'
          ? 'Nothing sent yet.'
          : hq
            ? 'No mail yet. When an agent has an idea for AI Studio, it lands here.'
            : `No mail yet. When another project writes to ${name}, it lands here.`}
      </p>
    );
  else
    body = (
      <ul className="rp-rows">
        {list.map((m) => {
          const fresh = box === 'in' && m.status === 'new';
          const from = box === 'in' ? proj(m.fromProjectId) : proj(m.to);
          return (
            <li key={m.id}>
              <button
                type="button"
                className={`rp-row${fresh ? ' unread' : ''}`}
                aria-label={`${fresh ? 'New: ' : ''}${m.subject} — ${box === 'in' ? mailFrom(m, names) : mailTo(m, names)}, ${MAIL_STATUS[m.status]}`}
                onClick={() => setReadId(m.id)}
              >
                <span className="rp-r1">
                  {fresh && <span className="rp-dot" aria-hidden="true" />}
                  <span className="rp-title">{m.subject}</span>
                  <span className="rp-when">{relWhen(m.at, now)}</span>
                </span>
                <span className="rp-by">
                  <LogoTile small tile={from?.tile ?? null} imageUrl={from?.imageUrl} />
                  <span>{box === 'in' ? mailFrom(m, names) : mailTo(m, names)}</span>
                </span>
                <span className="ml-meta">
                  {MAIL_KIND[m.kind] && <span className="ml-kind">{MAIL_KIND[m.kind]}</span>}
                  <span>{MAIL_STATUS[m.status]}</span>
                </span>
                <span className="rp-chev" aria-hidden="true">
                  ›
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );

  return (
    <div className="lf">
      {box === 'sent' && (
        <button type="button" className="ob-back" onClick={() => setBox('in')}>
          ← Mail
        </button>
      )}
      <h2>{box === 'sent' ? 'Sent' : hq ? 'HQ mail' : 'Mail'}</h2>
      {body}
      {box === 'in' && nSent > 0 && (
        <footer className="rp-foot">
          <button type="button" className="rp-link" onClick={() => setBox('sent')}>
            Sent ({nSent})
          </button>
        </footer>
      )}
    </div>
  );
}

function Letter({
  m,
  mine,
  names,
  director,
  goalName,
  onBack,
  onTalk,
  onGoal,
  onStatus,
}: {
  m: Mail;
  /** In this office's inbox (only the receiving office files letters). */
  mine: boolean;
  names: MailNames;
  director: string;
  goalName: (goalId: string) => string | null;
  onBack: () => void;
  onTalk: () => void;
  onGoal: () => void;
  onStatus: (s: 'filed' | 'new') => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const st = mailStatusLine(m, director, m.goalId ? goalName(m.goalId) : null);
  const who = names.agent(m.fromAgentId) ?? 'You';
  const set = async (s: 'filed' | 'new') => {
    setBusy(true);
    setErr('');
    try {
      await onStatus(s);
    } catch {
      setErr('That didn’t go through.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="lf">
      <button type="button" className="ob-back" onClick={onBack}>
        ← Mail
      </button>
      <h2>{m.subject}</h2>
      <p className="rp-meta">
        {mine ? `From ${who} in ${names.project(m.fromProjectId)}` : `${mailTo(m, names)}`} · {relWhen(m.at)}
      </p>
      <div className="rp-body">
        <Markdown source={m.body} />
      </div>
      {mine && (
        <p className="ml-status">
          {st.text}
          {st.goal && (
            <button type="button" onClick={onGoal}>
              {st.goal}
            </button>
          )}
        </p>
      )}
      {err && (
        <p className="bi-err" role="alert">
          {err}
        </p>
      )}
      <footer className="lf-foot">
        {mine &&
          (m.status === 'filed' ? (
            <Button variant="ghost" disabled={busy} onClick={() => void set('new')}>
              Put back
            </Button>
          ) : (
            <Button variant="ghost" disabled={busy} onClick={() => void set('filed')}>
              File
            </Button>
          ))}
        {mine && (
          <Button variant="hero" onClick={onTalk}>
            Talk about it
          </Button>
        )}
      </footer>
    </div>
  );
}
