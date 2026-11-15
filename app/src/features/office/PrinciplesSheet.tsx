/* The binder on the captain's desk (STUDIO LIFE, spec-ux-office §2): the team's principles — short markdown files
   the captain keeps in `principles/<team>/` and the team reads first. List → read. Read-only: changes go through
   the captain ("Talk to {captain}"). Read fresh each time the binder opens. */
import { useEffect, useState } from 'react';
import { type PrinciplesTeam, studio, useQuery } from '../../api';
import { Emblem } from '../../characters';
import { Button, Sheet } from '../../ui';
import { Markdown, relWhen } from '../reports';
import { keys } from './api';
import { firstParagraph } from './life';

export type BinderTeam = { id: string; name: string; emblem: string; color: string };
type File = PrinciplesTeam['files'][number];

export function PrinciplesSheet({
  pid,
  team,
  captain,
  open,
  onClose,
  onTalk,
}: {
  pid: string;
  team: BinderTeam | null;
  /** The keeper's short name; null = the team has no captain. */
  captain: string | null;
  open: boolean;
  onClose: () => void;
  onTalk: () => void;
}) {
  const name = team?.name.replace(/^The /, '') ?? '';
  return (
    <Sheet open={open && !!team} onClose={onClose} label={`${name} principles`}>
      {open && team && <PrinciplesBody pid={pid} team={team} captain={captain} onTalk={onTalk} />}
    </Sheet>
  );
}

export function PrinciplesBody({
  pid,
  team,
  captain,
  onTalk,
}: {
  pid: string;
  team: BinderTeam;
  captain: string | null;
  onTalk: () => void;
}) {
  const q = useQuery(keys.principles(pid), () => studio.principles.list(pid));
  const { refetch } = q;
  const [file, setFile] = useState<File | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: read fresh once, when the binder opens
  useEffect(() => {
    void refetch().catch(() => undefined);
  }, []);
  const name = team.name.replace(/^The /, '');
  const files = q.data?.teams.find((t) => t.teamId === team.id)?.files ?? [];

  let body: React.ReactNode;
  if (file)
    body = (
      <Principle
        pid={pid}
        teamId={team.id}
        file={file}
        dir={q.data?.teams.find((t) => t.teamId === team.id)?.dir}
      />
    );
  else if (!q.data && q.error)
    body = (
      <div className="rp-error" role="alert">
        <span>Couldn’t open the binder.</span>
        <Button small onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  else if (!q.data) body = <p className="hint">Opening the binder…</p>;
  else if (!files.length)
    body = (
      <p className="rp-empty">
        No principles yet. {captain ?? 'The captain'} writes them down as the team learns what works.
      </p>
    );
  else body = <FileRows pid={pid} teamId={team.id} files={files} onOpen={setFile} />;

  return (
    <div className="lf">
      {file && (
        <button type="button" className="ob-back" onClick={() => setFile(null)}>
          ← All principles
        </button>
      )}
      <h2>
        <Emblem team={team} size={16} decorative />
        {name} principles
      </h2>
      {!file && <p className="hint">{captain ? `Kept by ${captain}. ` : ''}The team reads these first.</p>}
      {body}
      {captain && (
        <footer className="lf-foot">
          <Button variant="ghost" onClick={onTalk}>
            Talk to {captain}
          </Button>
        </footer>
      )}
    </div>
  );
}

/* the rows: title + updated; the summary line is each file's first paragraph (read alongside) */
function FileRows({
  pid,
  teamId,
  files,
  onOpen,
}: {
  pid: string;
  teamId: string;
  files: File[];
  onOpen: (f: File) => void;
}) {
  const sig = files.map((f) => `${f.file}@${f.updatedAt}`).join('|');
  const sums = useQuery(`${keys.principles(pid)}:sums:${teamId}:${sig}`, () =>
    Promise.all(
      files.map((f) =>
        studio.principles
          .read(pid, teamId, f.file)
          .then((r) => firstParagraph(r.body))
          .catch(() => ''),
      ),
    ),
  );
  const now = new Date();
  return (
    <ul className="rp-rows">
      {files.map((f, i) => (
        <li key={f.file}>
          <button type="button" className="rp-row" onClick={() => onOpen(f)}>
            <span className="rp-r1">
              <span className="rp-title">{f.title}</span>
              <span className="rp-when">{relWhen(f.updatedAt, now)}</span>
            </span>
            {sums.data?.[i] && <span className="rp-sum">{sums.data[i]}</span>}
            <span className="rp-chev" aria-hidden="true">
              ›
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Principle({ pid, teamId, file, dir }: { pid: string; teamId: string; file: File; dir?: string }) {
  const q = useQuery(keys.principle(pid, teamId, file.file), () =>
    studio.principles.read(pid, teamId, file.file),
  );
  if (!q.data && q.error)
    return (
      <div className="rp-error" role="alert">
        <span>Couldn’t read this one.</span>
        <Button small onClick={() => void q.refetch()}>
          Try again
        </Button>
      </div>
    );
  if (!q.data) return <p className="hint">Reading…</p>;
  return (
    <>
      <p className="rp-meta">
        {dir ?? 'principles'}/{file.file} · {relWhen(file.updatedAt)}
      </p>
      <div className="rp-body">
        <Markdown source={q.data.body} />
      </div>
    </>
  );
}
