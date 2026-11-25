import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/axios';
import { GRADE_COLORS, PRIORITY_LABELS, priorityBadge } from '../utils/findings';
import { alertBox, btnLight } from '../utils/ui';
import AppLayout from './AppLayout';
import EmptyState from './EmptyState';
import { Loading, Skeleton } from './Skeleton';

function ScoreTile({ title, scan }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <p className="text-[12px] font-bold uppercase tracking-widest text-muted">{title}</p>
      <p className="mt-1 font-semibold">
        <Link to={`/scans/${scan.id}`} className="underline">Scan #{scan.id}</Link>
        <span className="font-normal text-muted"> · {new Date(scan.createdAt).toLocaleString()}</span>
      </p>
      <p className="mt-3 flex items-baseline gap-3">
        <span className="text-4xl font-bold leading-none">{scan.score.value}</span>
        <span className="text-2xl font-bold" style={{ color: GRADE_COLORS[scan.score.grade] }}>Grade {scan.score.grade}</span>
      </p>
      <p className="mt-1 text-[13px] text-muted">{scan.total} issue{scan.total === 1 ? '' : 's'} found</p>
    </div>
  );
}

function Column({ title, tone, note, rows, empty, showCounts }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm" aria-label={title}>
      <h2 className="flex items-center gap-2 text-[15px] font-bold">
        <span aria-hidden="true" className={`grid h-6 w-6 place-items-center rounded-full text-[12px] text-white ${tone}`}>{rows.length}</span>
        {title}
      </h2>
      <p className="text-[12px] text-muted">{note}</p>
      {rows.length === 0 ? (
        <p className="mt-3 rounded-xl bg-page p-3 text-[13px] text-muted">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((r) => (
            <li key={r.ruleId} className="rounded-xl bg-page p-3">
              <p className="font-semibold leading-snug">{r.help || r.ruleId}</p>
              <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px]">
                {r.priority && <span className={`rounded-full px-2 py-0.5 font-semibold ${priorityBadge(r.priority)}`}>{PRIORITY_LABELS[r.priority]} priority</span>}
                <code className="text-muted">{r.ruleId}</code>
                {showCounts && (
                  <span className="text-muted">
                    {r.before} → {r.after} element{r.after === 1 ? '' : 's'}
                    {r.after < r.before ? ' (fewer)' : r.after > r.before ? ' (more)' : ' (same)'}
                  </span>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Two finished scans of one project, side by side: what was fixed, what is new, and what is still there.
export default function ComparePage() {
  const { id, otherId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError('');
    api.get(`/scans/${id}/compare/${otherId}`)
      .then((r) => { if (!cancelled) setData(r.data); })
      .catch((err) => { if (!cancelled) setError(err.response?.data?.error || 'Could not compare these scans'); });
    return () => { cancelled = true; };
  }, [id, otherId]);

  const delta = data ? data.current.score.value - data.base.score.value : 0;

  return (
    <AppLayout title="Compare scans">
      <p className="text-muted">
        <Link to="/dashboard" className="underline">My Projects</Link> / Compare scans #{otherId} and #{id}
      </p>
      <h1 className="mt-2 text-[22px] font-bold">Compare scans</h1>

      {error && (
        <div className="mt-4">
          <p role="alert" className={alertBox}>{error}</p>
          <Link to={`/scans/${id}`} className={`${btnLight} mt-3`}>Back to scan #{id}</Link>
        </div>
      )}

      {!data && !error && (
        <Loading label="Comparing the two scans">
          <div className="mt-4 grid gap-4 sm:grid-cols-2"><Skeleton className="h-36 rounded-2xl" /><Skeleton className="h-36 rounded-2xl" /></div>
          <div className="mt-5 grid gap-5 lg:grid-cols-3"><Skeleton className="h-56 rounded-2xl" /><Skeleton className="h-56 rounded-2xl" /><Skeleton className="h-56 rounded-2xl" /></div>
        </Loading>
      )}

      {data && (
        <>
          <p className="mt-1 break-all text-muted">{data.current.scannedUrl}</p>

          <div className="mt-4 grid items-stretch gap-4 sm:grid-cols-[1fr_auto_1fr]">
            <ScoreTile title="Before (earlier scan)" scan={data.base} />
            <div className="grid place-items-center">
              <p
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-bold ${delta > 0 ? 'bg-green-100 text-green-900' : delta < 0 ? 'bg-[#fee4e2] text-[#912018]' : 'bg-slate-100 text-slate-800'}`}
                aria-label={delta === 0 ? 'Score did not change' : `Score ${delta > 0 ? 'went up' : 'went down'} by ${Math.abs(delta)}`}
              >
                <span aria-hidden="true">{delta > 0 ? '▲ +' : delta < 0 ? '▼ −' : '= '}{Math.abs(delta)}</span>
              </p>
            </div>
            <ScoreTile title="After (later scan)" scan={data.current} />
          </div>

          {data.fixed.length + data.new.length + data.unchanged.length === 0 ? (
            <div className="mt-5">
              <EmptyState art="clean" title="Neither scan found any violations">
                There is nothing to compare. Automated rules cannot check everything, so this is not proof the page is fully accessible.
              </EmptyState>
            </div>
          ) : (
            <div className="mt-5 grid gap-5 lg:grid-cols-3">
              <Column title="Fixed" tone="bg-green-600" note="Found before, gone now" rows={data.fixed} empty="Nothing was fixed between these scans." />
              <Column title="New" tone="bg-[#d92d20]" note="Not there before, found now" rows={data.new} empty="No new issues appeared." showCounts />
              <Column title="Still there" tone="bg-slate-500" note="Found in both scans" rows={data.unchanged} empty="No issue is common to both scans." showCounts />
            </div>
          )}

          <p className="mt-4 text-[12px] text-muted">
            Issues are matched by rule, not by element, so fixing one of three elements shows as "fewer" and not as fixed.
          </p>
          <Link to={`/scans/${data.current.id}`} className={`${btnLight} mt-3`}>Open scan #{data.current.id}</Link>
        </>
      )}
    </AppLayout>
  );
}
