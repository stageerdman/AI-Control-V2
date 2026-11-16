/* One line of a thread with an agent: the live chat (Panel) and a past director chat (PastThreadChat). */
import type { ThreadMessage } from './api';

/* titles of reports followed up here (a user message keeps only the reportId) */
export const aboutTitles = new Map<string, string>();

export function Bubble({
  m,
  who,
  openReport,
}: {
  m: ThreadMessage;
  who: string;
  openReport: (id: string) => void;
}) {
  const me = m.from === 'user';
  /* a follow-up: the message keeps its reportId (older ones carried a text prefix) */
  const legacy = me ? /^About (?:the report )?“(.+?)”: /.exec(m.text) : null;
  const aboutTitle = me && m.reportId ? (aboutTitles.get(m.reportId) ?? 'a report') : legacy?.[1];
  return (
    <div className={`bubble ${me ? 'me' : 'them'}${m.kind === 'error' ? ' err' : ''}`}>
      <span className="who">{who}</span>
      {aboutTitle && <span className="op-about">About: {aboutTitle}</span>}
      <span className="t">{fmt(legacy ? m.text.slice(legacy[0].length) : m.text)}</span>
      {m.reportId && !me && (
        <button type="button" className="op-link" onClick={() => openReport(m.reportId as string)}>
          Open report
        </button>
      )}
    </div>
  );
}

/** **bold** and `code` only (the prototype's _fmt), as elements — never raw HTML. */
function fmt(s: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let k = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(m[1] ? <b key={k++}>{m[1]}</b> : <code key={k++}>{m[2]}</code>);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
