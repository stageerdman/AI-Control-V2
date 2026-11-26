import { describe, expect, it } from 'vitest';
import type { ReportRow } from './api';
import {
  applyReportEvent,
  fullWhen,
  relWhen,
  reportMarkdown,
  rowLabel,
  shortName,
  unreadCount,
} from './model';

const NOW = new Date(2026, 10, 13, 15, 0, 0); // 13 Nov 2026 15:00 local
const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).toISOString();
const row = (id: string, p: Partial<ReportRow> = {}): ReportRow => ({
  id,
  projectId: 'aurora',
  kind: 'research',
  title: `Report ${id}`,
  summary: 'Stripe wins on fees.',
  question: null,
  sources: [],
  author: { agentId: 'a-scout', name: 'Scout', teamId: 't-r', teamName: 'Research Crew' },
  runId: null,
  goalId: null,
  itemId: null,
  threadId: null,
  createdAt: at(13, 13),
  readAt: null,
  archivedAt: null,
  ...p,
});

describe('report times', () => {
  it('relWhen: just now · minutes · hours · yesterday · date', () => {
    expect(relWhen(new Date(NOW.getTime() - 20_000).toISOString(), NOW)).toBe('Just now');
    expect(relWhen(at(13, 14, 55), NOW)).toBe('5 min ago');
    expect(relWhen(at(13, 13), NOW)).toBe('2 h ago');
    expect(relWhen(at(13, 13), NOW, true)).toBe('2 hours ago');
    expect(relWhen(at(12, 23), NOW)).toBe('Yesterday');
    expect(relWhen(at(10, 9), NOW)).toBe('10 Nov');
    expect(relWhen(new Date(2025, 0, 3).toISOString(), NOW)).toBe('3 Jan 2025');
  });
  it('fullWhen: Today / Yesterday / date + time', () => {
    expect(fullWhen(at(13, 14, 5), NOW)).toBe('Today 14:05');
    expect(fullWhen(at(12, 9, 30), NOW)).toBe('Yesterday 09:30');
    expect(fullWhen(at(2, 8, 0), NOW)).toBe('2 Nov 08:00');
  });
});

describe('unread + live events', () => {
  const rows = [row('1'), row('2', { readAt: at(13, 14) }), row('3')];
  it('counts unread', () => expect(unreadCount(rows)).toBe(2));
  it('report.read marks a row read (and back), unknown ids leave the list as is', () => {
    const r1 = applyReportEvent(rows, {
      type: 'report.read',
      payload: { reportId: '1', read: true },
      at: at(13, 15),
    });
    expect(r1[0].readAt).toBe(at(13, 15));
    expect(unreadCount(r1)).toBe(1);
    expect(
      applyReportEvent(r1, { type: 'report.read', payload: { reportId: '1', read: false } })[0].readAt,
    ).toBeNull();
    expect(applyReportEvent(rows, { type: 'report.read', payload: { reportId: 'x', read: true } })).toBe(
      rows,
    );
    expect(applyReportEvent(rows, { type: 'report.read', payload: { reportId: '2', read: true } })).toBe(
      rows,
    );
  });
  it('report.archived leaves the active list; unarchive leaves the archive', () => {
    const a = applyReportEvent(rows, { type: 'report.archived', payload: { reportId: '3', archived: true } });
    expect(a.map((r) => r.id)).toEqual(['1', '2']);
    expect(
      applyReportEvent(rows, { type: 'report.archived', payload: { reportId: '3', archived: false } }),
    ).toBe(rows);
    const arch = [row('9', { archivedAt: at(13, 1) })];
    expect(
      applyReportEvent(
        arch,
        { type: 'report.archived', payload: { reportId: '9', archived: false } },
        'archived',
      ),
    ).toEqual([]);
  });
});

describe('labels + names', () => {
  it('rowLabel says unread in words, who, when and the summary', () => {
    expect(rowLabel(row('1'), NOW)).toBe(
      'Unread. Report 1, by Scout, Research Crew, 2 hours ago. Stripe wins on fees.',
    );
    expect(rowLabel(row('2', { readAt: at(13, 14) }), NOW)).toBe(
      'Report 2, by Scout, Research Crew, 2 hours ago. Stripe wins on fees.',
    );
    expect(
      rowLabel(row('3', { author: { agentId: 'x', name: 'Solo Sam', teamId: null, teamName: null } }), NOW),
    ).toContain('by Solo Sam, 2 hours ago');
  });
  it('shortName: nick, else first word', () => {
    expect(shortName({ name: 'Scout Ranger', nick: null })).toBe('Scout');
    expect(shortName({ name: 'Professor Prompt', nick: 'Prof' })).toBe('Prof');
  });
});

describe('reportMarkdown', () => {
  it('title, question, summary, whole body, sources — in reading order', () => {
    const md = reportMarkdown({
      title: 'Payments',
      question: 'Which provider?\nAnd why?',
      summary: 'Stripe.',
      body: '## Fees\n\nLow.\n\n## Risks\n\nNone.\n',
      sources: [
        { title: 'Stripe pricing', url: 'https://stripe.com/pricing' },
        { title: 'Code', path: 'src/pay.ts' },
      ],
    });
    expect(md).toBe(
      '# Payments\n\n> Which provider?\n> And why?\n\nStripe.\n\n## Fees\n\nLow.\n\n## Risks\n\nNone.\n\n' +
        '## Sources\n\n1. [Stripe pricing](https://stripe.com/pricing)\n2. Code `src/pay.ts`\n',
    );
  });

  it('skips the parts a report does not have', () => {
    expect(reportMarkdown({ title: 'T', question: null, summary: 'S', body: 'B', sources: [] })).toBe(
      '# T\n\nS\n\nB\n',
    );
  });
});
