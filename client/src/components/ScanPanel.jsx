import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { ACTIVE_STATUSES, STATUS_LABELS, statusBadge } from '../utils/scanStatus';
import { alertBox } from '../utils/ui';
import { ChartCard, TrendBars } from './Charts';
import EmptyState from './EmptyState';
import ScanProgress from './ScanProgress';
import { Loading, Skeleton } from './Skeleton';

const isDone = (s) => s.status === 'COMPLETED' || s.status === 'COMPLETED_WITH_WARNINGS';

// A compact scan history. Details, charts and findings live on the scan report page, so this list stays short.
export default function ScanPanel({ projectId, refreshKey }) {
  const [scans, setScans] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let timer;

    const load = async () => {
      try {
        const res = await api.get(`/projects/${projectId}/scans`);
        if (cancelled) return;
        setScans(res.data.scans);
        setError('');
        if (res.data.scans.some((s) => ACTIVE_STATUSES.includes(s.status))) {
          timer = setTimeout(load, 2000);
        }
      } catch {
        if (!cancelled) setError('Could not load scan status');
      }
    };

    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [projectId, refreshKey]);

  if (error) return <p role="alert" className={`${alertBox} mt-4`}>{error}</p>;
  if (!scans) {
    return (
      <Loading label="Loading scans">
        <div className="mt-4 space-y-2.5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      </Loading>
    );
  }
  if (scans.length === 0) {
    return (
      <div className="mt-4">
        <EmptyState art="scan" title="No scans yet">Tick the permission box and start your first scan. Results appear here as soon as it finishes.</EmptyState>
      </div>
    );
  }

  const trend = scans
    .filter((s) => isDone(s) && typeof s.findingCount === 'number')
    .slice(0, 8)
    .reverse()
    .map((s) => ({ name: `#${s.id}`, issues: s.findingCount }));

  return (
    <div className="mt-4">
      <p role="status" className="sr-only">Latest scan (#{scans[0].id}): {STATUS_LABELS[scans[0].status]}</p>

      {trend.length >= 2 && (
        <ChartCard title="Issues per scan" subtitle="Are things getting better?">
          <TrendBars data={trend} />
        </ChartCard>
      )}

      <ul className="mt-4 space-y-2.5">
        {scans.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-line bg-white p-4 shadow-sm">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                Scan #{s.id}
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadge(s.status)}`}>{STATUS_LABELS[s.status]}</span>
              </p>
              <p className="mt-0.5 break-all text-[13px] text-muted">{s.scannedUrl}</p>
              <p className="text-[12px] text-muted">{new Date(s.createdAt).toLocaleString()}</p>
              {s.status === 'FAILED' && <p className="mt-1 text-[13px] text-[#912018]">{s.errorMessage}</p>}
              {ACTIVE_STATUSES.includes(s.status) && <div className="max-w-md"><ScanProgress status={s.status} compact /></div>}
            </div>
            {isDone(s) && typeof s.findingCount === 'number' && (
              <div className="text-center">
                <p className="text-2xl font-bold leading-none">{s.findingCount}</p>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">issues</p>
              </div>
            )}
            {(isDone(s) || ACTIVE_STATUSES.includes(s.status)) && (
              <Link
                to={`/scans/${s.id}`}
                className="inline-flex min-h-10 items-center rounded-[10px] bg-brand px-4 text-[13px] font-semibold text-white hover:bg-[#5849d6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {isDone(s) ? 'View report' : 'Watch progress'}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
