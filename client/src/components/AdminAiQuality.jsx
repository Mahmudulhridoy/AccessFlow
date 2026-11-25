import { useEffect, useState } from 'react';
import api from '../api/axios';
import { alertBox } from '../utils/ui';
import AppLayout from './AppLayout';
import { ChartCard, Donut, HBars, RateLine } from './Charts';
import EmptyState from './EmptyState';
import { Loading, Skeleton } from './Skeleton';

const REASON_LABELS = {
  WRONG_FIX: 'Wrong fix',
  NOT_APPLICABLE: 'Does not apply',
  TOO_VAGUE: 'Too vague',
  CODE_DOES_NOT_WORK: 'Code does not work',
  OTHER: 'Other',
};

const pct = (n) => (n === null ? '–' : `${Math.round(n * 100)}%`);
const dayLabel = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

// Words people use most in "not helpful" comments. Size shows how often, and the count is written out too.
function WordList({ words }) {
  const max = Math.max(1, ...words.map((w) => w.count));
  return (
    <ul className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
      {words.map((w) => (
        <li key={w.word} className="rounded-lg bg-page px-2 py-0.5" style={{ fontSize: `${13 + Math.round((w.count / max) * 9)}px` }}>
          <span className="font-semibold">{w.word}</span> <span className="text-[12px] text-muted">×{w.count}</span>
        </li>
      ))}
    </ul>
  );
}

function Tile({ label, value, note }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <p className="text-[12px] font-bold uppercase tracking-widest text-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold leading-none">{value}</p>
      {note && <p className="mt-1.5 text-[12px] text-muted">{note}</p>}
    </div>
  );
}

// Read-only. Shows what users thought of the AI explanations. These are opinions, not proof that a fix is correct.
export default function AdminAiQuality() {
  const [s, setS] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/admin/ai-feedback').then((r) => setS(r.data.summary)).catch(() => setError('Could not load the feedback summary'));
  }, []);

  const rate = (b) => (b.helpful + b.notHelpful ? b.helpful / (b.helpful + b.notHelpful) : null);

  return (
    <AppLayout title="AI Quality">
      <h1 className="text-[22px] font-bold">AI suggestion quality</h1>
      <p className="mt-1 max-w-2xl text-muted">
        How users rated the explanations and fix suggestions. Ratings are opinions from the people who tried the fixes; they are a
        useful signal, not proof that a fix is correct.
      </p>
      {error && <p role="alert" className={`${alertBox} mt-4`}>{error}</p>}
      {!s && !error && (
        <Loading label="Loading the feedback summary">
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
          <div className="mt-5 grid gap-5 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}</div>
        </Loading>
      )}

      {s && s.total === 0 && (
        <div className="mt-5">
          <EmptyState art="chart" title="No ratings yet">Ask users to rate the AI suggestions on a scan report. Trends and common complaints appear here once they do.</EmptyState>
        </div>
      )}

      {s && s.total > 0 && (
        <>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Ratings" value={s.total} />
            <Tile label="Helpful" value={pct(s.helpfulRate)} note={`${s.helpful} helpful · ${s.notHelpful} not helpful`} />
            <Tile label="AI (Gemini) helpful" value={pct(rate(s.bySource.LLM))} note={`${s.bySource.LLM.helpful + s.bySource.LLM.notHelpful} ratings`} />
            <Tile label="Scanner guidance helpful" value={pct(rate(s.bySource.AXE_FALLBACK))} note={`${s.bySource.AXE_FALLBACK.helpful + s.bySource.AXE_FALLBACK.notHelpful} ratings`} />
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <ChartCard title="Overall" subtitle="Helpful vs not helpful">
              <Donut
                data={[{ name: 'Helpful', value: s.helpful, color: '#12b76a' }, { name: 'Not helpful', value: s.notHelpful, color: '#d92d20' }]}
                centerValue={pct(s.helpfulRate)}
                centerLabel="helpful"
              />
            </ChartCard>
            <ChartCard title="Why it was not helpful" subtitle="Reasons chosen by users">
              <HBars
                data={Object.entries(REASON_LABELS).map(([k, name]) => ({ name, value: s.reasons[k] || 0, color: '#d92d20' }))}
                height={200}
              />
            </ChartCard>
            <ChartCard title="Rules that need work" subtitle="Most 'not helpful' ratings">
              {s.worstRules.length === 0 ? (
                <p className="mt-3 text-[13px] text-muted">No negative ratings yet.</p>
              ) : (
                <HBars data={s.worstRules.map((r) => ({ name: r.ruleId, value: r.notHelpful, color: '#f79009' }))} height={Math.max(120, s.worstRules.length * 34)} />
              )}
            </ChartCard>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <ChartCard title="Helpful rate over time" subtitle="Share of ratings each day that said helpful">
              {s.trend.length < 2 ? (
                <p className="mt-3 text-[13px] text-muted">
                  A trend needs ratings from at least two different days.
                  {s.trend.length === 1 && ` So far: ${Math.round(s.trend[0].rate * 100)}% helpful on ${dayLabel(s.trend[0].date)} (${s.trend[0].total} rating${s.trend[0].total === 1 ? '' : 's'}).`}
                </p>
              ) : (
                <RateLine data={s.trend.map((d) => ({ name: dayLabel(d.date), rate: Math.round(d.rate * 100), total: d.total }))} />
              )}
            </ChartCard>
            <ChartCard title="What people complain about" subtitle="Most used words in 'not helpful' comments">
              {s.complaintWords.length === 0 ? (
                <p className="mt-3 text-[13px] text-muted">No written complaints yet.</p>
              ) : (
                <WordList words={s.complaintWords} />
              )}
            </ChartCard>
          </div>

          <section className="mt-5 rounded-2xl border border-line bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold">Recent comments</h2>
            {s.recentComments.length === 0 ? (
              <p className="mt-2 text-muted">No comments yet.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {s.recentComments.map((c, i) => (
                  <li key={i} className="rounded-xl bg-page p-3 text-[13px]">
                    <p className="text-muted">
                      {c.rating === 'HELPFUL' ? 'Helpful' : 'Not helpful'}
                      {c.reason ? ` · ${REASON_LABELS[c.reason] || c.reason}` : ''}
                      {c.ruleId ? ` · ${c.ruleId}` : ''} · {new Date(c.createdAt).toLocaleDateString()}
                    </p>
                    <p className="mt-1">{c.comment}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </AppLayout>
  );
}
