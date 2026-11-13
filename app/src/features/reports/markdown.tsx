/* A sanitised markdown subset for reports (spec-reports §3) → React elements. Text is only ever
   rendered as React text nodes (no innerHTML), so raw HTML stays inert; no images in v1.
   Blocks: headings (# ## → h3, ### + → h4: the page title is the h2), paragraphs, - * + / 1. lists,
   > quotes, ``` fenced code, | tables |, --- rules. Inline: **bold**, *em* / _em_, `code`,
   [links](http…) — http(s) only, opened in the system browser; anything else stays text. */
import { Fragment, type ReactNode } from 'react';

const LIST = /^\s*([-*+]|\d+[.)])\s+(.*)$/;
const HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
const HEAD = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE = /^\s*```/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const isTableRow = (l: string) => l.includes('|');
const cells = (l: string) =>
  l
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

/** Only http(s) links are links. */
export const safeUrl = (u: string): string | null => {
  try {
    const url = new URL(u.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
};

const INLINE = /(`[^`\n]+`)|\[([^\]\n]+)\]\(([^)\s]+)\)|(\*\*|__)(.+?)\4|(\*|_)([^*_\s](?:.*?[^*_\s])?)\6/;

export function inline(text: string, key = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let n = 0;
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const k = `${key}.${n++}`;
    if (m[1]) out.push(<code key={k}>{m[1].slice(1, -1)}</code>);
    else if (m[2] !== undefined) {
      const href = safeUrl(m[3]);
      out.push(
        href ? (
          <a key={k} href={href} target="_blank" rel="noreferrer">
            {inline(m[2], k)}
          </a>
        ) : (
          <Fragment key={k}>{m[2]}</Fragment>
        ),
      );
    } else if (m[4]) out.push(<strong key={k}>{inline(m[5], k)}</strong>);
    else out.push(<em key={k}>{inline(m[7], k)}</em>);
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

const startsBlock = (l: string, next?: string) =>
  HEAD.test(l) ||
  FENCE.test(l) ||
  HR.test(l) ||
  LIST.test(l) ||
  /^\s*>/.test(l) ||
  (isTableRow(l) && next !== undefined && TABLE_SEP.test(next));

export function Markdown({ source }: { source: string }) {
  return <>{blocks(source.replace(/\r\n?/g, '\n'))}</>;
}

export function blocks(src: string, key = 'b'): ReactNode[] {
  const lines = src.split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  let n = 0;
  while (i < lines.length) {
    const l = lines[i];
    const k = `${key}${n++}`;
    if (!l.trim()) {
      i++;
      n--;
      continue;
    }
    if (FENCE.test(l)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i])) body.push(lines[i++]);
      i++;
      out.push(
        <pre key={k} className="rp-code">
          <code>{body.join('\n')}</code>
        </pre>,
      );
      continue;
    }
    const h = HEAD.exec(l);
    if (h) {
      out.push(h[1].length <= 2 ? <h3 key={k}>{inline(h[2], k)}</h3> : <h4 key={k}>{inline(h[2], k)}</h4>);
      i++;
      continue;
    }
    if (HR.test(l)) {
      out.push(<hr key={k} />);
      i++;
      continue;
    }
    if (/^\s*>/.test(l)) {
      const q: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(<blockquote key={k}>{blocks(q.join('\n'), k)}</blockquote>);
      continue;
    }
    if (isTableRow(l) && TABLE_SEP.test(lines[i + 1] ?? '')) {
      const head = cells(l);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i]) && lines[i].trim()) rows.push(cells(lines[i++]));
      out.push(
        <div key={k} className="rp-table">
          <table>
            <thead>
              <tr>
                {head.map((c, j) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static columns
                  <th key={j}>{inline(c, `${k}h${j}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static rows
                <tr key={ri}>
                  {head.map((_, j) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: static columns
                    <td key={j}>{inline(r[j] ?? '', `${k}r${ri}c${j}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const li = LIST.exec(l);
    if (li) {
      const ordered = /\d/.test(li[1]);
      const items: string[] = [];
      while (i < lines.length) {
        const m = LIST.exec(lines[i]);
        if (m) {
          items.push(m[2]);
          i++;
        } else if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) {
          items[items.length - 1] += ` ${lines[i++].trim()}`; /* continuation line */
        } else break;
      }
      const lis = items.map((t, j) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static list
        <li key={j}>{inline(t, `${k}.${j}`)}</li>
      ));
      out.push(ordered ? <ol key={k}>{lis}</ol> : <ul key={k}>{lis}</ul>);
      continue;
    }
    const para: string[] = [l.trim()];
    i++;
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i], lines[i + 1]))
      para.push(lines[i++].trim());
    out.push(<p key={k}>{inline(para.join(' '), k)}</p>);
  }
  return out;
}
