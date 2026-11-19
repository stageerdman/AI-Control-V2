/* Small pieces the zoom cards share: the back link, a feature's stage mark, the features query. */
import { useQuery } from '../../api';
import { type Feature, type FeatureStatus, keys, officeApi } from './api';

export const Back = ({ label, aria, onClick }: { label: string; aria: string; onClick: () => void }) => (
  <button type="button" className="ob-back" aria-label={aria} onClick={onClick}>
    ← {label}
  </button>
);

const MARK_PATH: Partial<Record<FeatureStatus, { d: string; stroke: string }>> = {
  shipped: { d: 'M4 8.5l2.6 2.6L12 5.6', stroke: '#fff' },
  /* a pause sign */
  shelved: { d: 'M6.3 5.2v5.6M9.7 5.2v5.6', stroke: 'rgba(36,26,68,.45)' },
  /* ⊘ */
  denied: { d: 'M5 11L11 5', stroke: 'rgba(36,26,68,.45)' },
};

/** One mark per stage, shape-coded (never colour alone). */
export const Mark = ({ st }: { st: FeatureStatus }) => {
  const p = MARK_PATH[st];
  return (
    <span className={`ob-mark m-${st}`} aria-hidden="true">
      {p && (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            d={p.d}
            fill="none"
            stroke={p.stroke}
            strokeWidth={st === 'shipped' ? 2.4 : 2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
};

export const useFeatures = (pid: string) =>
  useQuery<Feature[]>(keys.features(pid), () => officeApi.features(pid));
