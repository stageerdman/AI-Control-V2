/* The features folder: one field that searches and adds, stage chips with counts, dated rows grouped by
   stage. Design: updates/2026-11-19 FEATURE LIST - OPEN/design.md §2. Logic: feature-list.ts. */
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { isApiError, useMutation } from '../../api';
import type { OfficeSub } from '../../shell/router';
import { type Feature, type FeatureStatus, keys, officeApi } from './api';
import { Mark, useFeatures } from './board-parts';
import { featureTags } from './estimates';
import {
  enterAction,
  exactMatch,
  featureDate,
  filterFeatures,
  newStage,
  STAGE_LABEL,
  STAGE_TITLE,
  STAGES,
  type StageFilter,
  stageCounts,
  visibleChips,
} from './feature-list';
import { TimeTag, useTimesheet } from './TimeTag';

type Props = { pid: string; dir: string; go: (sub: OfficeSub, id?: string) => void };

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (/input|textarea|select/i.test(t.tagName) || t.isContentEditable);

export function FeatureList({ pid, dir, go }: Props) {
  const features = useFeatures(pid);
  const times = featureTags(useTimesheet(pid).data);
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState<StageFilter>('all');
  const field = useRef<HTMLInputElement>(null);
  const listEl = useRef<HTMLDivElement>(null);
  const chipsEl = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const create = useMutation(
    (v: { name: string; status: 'now' | 'planned' }) => officeApi.createFeature(pid, v),
    { invalidate: [keys.features(pid)] },
  );

  const loaded = !!features.data;
  const list = features.data ?? [];
  const q = query.trim();
  const rows = filterFeatures(list, q, stage);
  const counts = stageCounts(list, q);
  const chips = visibleChips(list, stage);
  const action = loaded ? enterAction(list, q, stage) : ({ kind: 'none' } as const);
  const canAdd = loaded && !!q && !exactMatch(list, q);
  const today = new Date();

  /* "/" focuses the field while the card is open */
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector('.scrim')) return;
      e.preventDefault();
      field.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* the result count and what Enter does, announced once typing settles */
  const said =
    !q || !loaded
      ? ''
      : `${rows.length} feature${rows.length === 1 ? '' : 's'}. ${
          action.kind === 'open' ? `Enter opens ${action.feature.name}.` : `Enter adds ${q}.`
        }`;
  const [announce, setAnnounce] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setAnnounce(said), 300);
    return () => clearTimeout(t);
  }, [said]);

  const add = async (name: string) => {
    if (create.pending) return;
    try {
      const f = await create.mutateAsync({ name, status: newStage(stage) });
      setQuery('');
      go('feature', f.id);
    } catch {
      /* shown under the field */
    }
  };
  const rowButtons = () => [
    ...(listEl.current?.querySelectorAll<HTMLButtonElement>('.ob-row,.ob-add') ?? []),
  ];

  const onField = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (action.kind === 'open') go('feature', action.feature.id);
      else if (action.kind === 'add') void add(action.name);
    } else if (e.key === 'Escape' && query) {
      e.preventDefault();
      e.stopPropagation();
      setQuery('');
      create.reset();
    } else if (e.key === 'ArrowDown') {
      const first = rowButtons()[0];
      if (first) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  /* ↑ / ↓ between rows; ↑ from the first goes back to the field */
  const onRows = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const all = rowButtons();
    const i = all.indexOf(e.target as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    const next = e.key === 'ArrowDown' ? all[i + 1] : i === 0 ? field.current : all[i - 1];
    next?.focus();
  };
  const pick = (s: StageFilter) => setStage(s !== 'all' && s === stage ? 'all' : s);
  /* ← / → move through the chips and select (a radio group) */
  const onChips = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = chips.indexOf(stage);
    const next = chips[(i + (e.key === 'ArrowRight' ? 1 : -1) + chips.length) % chips.length];
    setStage(next);
    requestAnimationFrame(() =>
      chipsEl.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus(),
    );
  };

  const target = action.kind === 'open' ? action.feature.id : null;
  const row = (f: Feature) => {
    const date = featureDate(f, today);
    return (
      <li key={f.id}>
        <button type="button" className="ob-row" onClick={() => go('feature', f.id)}>
          <Mark st={f.status} />
          <span className="sr-only">{STAGE_LABEL[f.status]}:</span>
          <span className={`ob-rn${f.status === 'shelved' || f.status === 'denied' ? ' quiet' : ''}`}>
            {f.name}
          </span>
          <TimeTag tag={times.get(f.id)} />
          <span className="ob-time ob-date" title={date.spoken}>
            <span aria-hidden="true">{date.text}</span>
            <span className="sr-only">, {date.spoken}</span>
          </span>
          {target === f.id && <Enter />}
          <span className="ob-chev" aria-hidden="true">
            ›
          </span>
        </button>
      </li>
    );
  };
  const group = (st: FeatureStatus) => {
    const these = rows.filter((f) => f.status === st);
    if (!these.length) return null;
    return (
      <section key={st} aria-label={STAGE_TITLE[st]}>
        <h3>{STAGE_TITLE[st]}</h3>
        <ul className="ob-rows">{these.map(row)}</ul>
      </section>
    );
  };
  const failed = features.error && !features.data;
  const empty = loaded && !list.length;

  return (
    <>
      <header className="ob-hhead">
        <h2>Features</h2>
      </header>
      {!failed && (
        <div className="ob-find">
          <svg className="ob-find-i" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            ref={field}
            type="search"
            aria-label={empty ? 'Add a feature' : 'Search or add a feature'}
            aria-describedby={hintId}
            placeholder={empty ? 'Add a feature' : 'Search or add a feature'}
            value={query}
            maxLength={120}
            onChange={(e) => {
              setQuery(e.target.value);
              if (create.error) create.reset();
            }}
            onKeyDown={onField}
          />
          {!query && (
            <span className="ob-find-k" aria-hidden="true">
              /
            </span>
          )}
          <span id={hintId} className="sr-only">
            {action.kind === 'open'
              ? `Enter opens ${action.feature.name}`
              : action.kind === 'add'
                ? `Enter adds ${action.name}`
                : 'Type to search; press / to come back here'}
          </span>
        </div>
      )}
      {create.error && (
        <p className="ob-err ob-find-err" role="alert">
          {isApiError(create.error) ? create.error.message : 'Couldn’t add it.'}
        </p>
      )}
      {chips.length > 0 && (
        <div className="ob-chips" role="radiogroup" aria-label="Stage" ref={chipsEl} onKeyDown={onChips}>
          {chips.map((s) => (
            // biome-ignore lint/a11y/useSemanticElements: button radios (roving tabindex), as in cast/Radios
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={stage === s}
              tabIndex={stage === s ? 0 : -1}
              onClick={() => pick(s)}
            >
              {s === 'all' ? 'All' : STAGE_TITLE[s]}
              <span className="ob-chip-n">{counts[s]}</span>
            </button>
          ))}
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: arrow keys between the row buttons inside */}
      <div className="ob-scroll" ref={listEl} onKeyDown={onRows}>
        {features.loading && <p className="ob-empty">Loading…</p>}
        {failed && <p className="ob-err">Couldn’t load the features.</p>}
        {empty && !q && (
          <p className="ob-empty">No features yet. Type one above, or tell {dir} what to build first.</p>
        )}
        {canAdd && (
          <button
            type="button"
            className="ob-add"
            disabled={create.pending}
            onClick={() => void add(q.replace(/\s+/g, ' '))}
          >
            <span className="ob-rn">{create.pending ? 'Adding…' : `+ Add “${q}”`}</span>
            {action.kind === 'add' && !create.pending && <Enter />}
          </button>
        )}
        {loaded && !!list.length && !rows.length && (
          <p className="ob-empty ob-none">
            {stage === 'all' ? (
              <>Nothing matches “{q}”.</>
            ) : (
              <>
                {q ? `Nothing in ${STAGE_TITLE[stage]} matches “${q}”.` : `Nothing in ${STAGE_TITLE[stage]}.`}{' '}
                <button type="button" className="ob-linkbtn ob-all" onClick={() => setStage('all')}>
                  {q ? 'Search all stages' : 'Show all stages'}
                </button>
              </>
            )}
          </p>
        )}
        {stage === 'all'
          ? STAGES.map(group)
          : rows.length > 0 && <ul className="ob-rows">{rows.map(row)}</ul>}
      </div>
    </>
  );
}

const Enter = () => (
  <span className="ob-enter" aria-hidden="true">
    ↵
  </span>
);
