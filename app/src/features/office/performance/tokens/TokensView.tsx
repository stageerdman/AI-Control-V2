/* Where the tokens go (design/token-view.md): shown under the chart while the Tokens card is picked — the one
   way in. A sentence first, then three quiet lines. All words come from model.ts; this file only draws them. */
import type { Performance } from '../../api';
import { tokenView } from './model';

export function TokensView({ p, nameOf }: { p: Performance; nameOf: (id: string) => string }) {
  const v = tokenView(p, nameOf);
  return (
    <section className="pf-tk" aria-labelledby="pf-tk">
      <h3 id="pf-tk">Where the tokens go</h3>
      {v.state === 'empty' ? (
        <p className="hint">{v.text}</p>
      ) : (
        <>
          <p className="pf-tk-lead">
            {v.lead}
            {v.cost && <span className="pf-tk-soft"> {v.cost}</span>}
          </p>
          <dl className="pf-tk-lines">
            <div>
              <dt>Spent on</dt>
              <dd>
                {v.ready.working != null && (
                  <span className="pf-tk-split" aria-hidden="true">
                    <span style={{ width: `${v.ready.working}%` }} />
                  </span>
                )}
                {v.ready.text}
              </dd>
            </div>
            {v.starts && (
              <div>
                <dt>Starts</dt>
                <dd>{v.starts.text}</dd>
              </div>
            )}
            {v.perHour && (
              <div>
                <dt>Per hour of work</dt>
                <dd>
                  {v.perHour.text}
                  {v.perHour.trend && <span className="pf-tk-soft"> · {v.perHour.trend.text}</span>}
                </dd>
              </div>
            )}
          </dl>
          {v.hint && <p className="pf-tk-hint">{v.hint}</p>}
        </>
      )}
    </section>
  );
}
