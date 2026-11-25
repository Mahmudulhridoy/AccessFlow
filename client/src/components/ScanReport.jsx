import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/axios';
import { ACTIVE_STATUSES, STATUS_LABELS, statusBadge } from '../utils/scanStatus';
import {
  IMPACT_COLORS, IMPACT_LABELS, OUTCOME_COLORS, PRIORITY_COLORS, PRIORITY_LABELS, PRIORITY_ORDER, numberFindings, principleCounts, sortFindings,
} from '../utils/findings';
import { alertBox, btnLight } from '../utils/ui';
import AnnotatedSnapshot from './AnnotatedSnapshot';
import AppLayout from './AppLayout';
import { ChartCard, Donut, HBars, PrincipleRadar } from './Charts';
import Confetti from './Confetti';
import FindingsView, { ScanWarnings } from './FindingsView';
import FixFirst from './FixFirst';
import ScanProgress from './ScanProgress';
import ScoreGauge from './ScoreGauge';
import { FindingsSkeleton, ReportSkeleton } from './Skeleton';
import { useToast } from './Toast';

const isDone = (s) => s.status === 'COMPLETED' || s.status === 'COMPLETED_WITH_WARNINGS';

function Kpi({ label, value, note }) {
  return (
    <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/15">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-white/70">{label}</p>
      <p className="mt-1 text-3xl font-bold leading-none">{value}</p>
      {note && <p className="mt-1.5 text-[12px] text-white/70">{note}</p>}
    </div>
  );
}

function Panel({ title, children, className = '' }) {
  return (
    <section className={`print-avoid-break rounded-2xl border border-line bg-white p-5 shadow-sm ${className}`}>
      <h2 className="text-[15px] font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Detail({ label, children }) {
  return (
    <div className="mt-3">
      <dt className="text-[11px] font-bold uppercase tracking-widest text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-[13px]">{children}</dd>
    </div>
  );
}

// Lets the person pick another finished scan of the same project to compare with this one.
function CompareMenu({ scan }) {
  const navigate = useNavigate();
  const [others, setOthers] = useState([]);
  useEffect(() => {
    let cancelled = false;
    api.get(`/projects/${scan.projectId}/scans`)
      .then((r) => { if (!cancelled) setOthers(r.data.scans.filter((s) => s.id !== scan.id && isDone(s))); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [scan.projectId, scan.id]);

  if (others.length === 0) return null;
  return (
    <label className="no-print flex items-center gap-2 text-[13px] font-semibold text-white/85">
      Compare with
      <select
        value=""
        onChange={(e) => {
          const other = Number(e.target.value);
          if (!other) return;
          // The later scan is always "current", so the page reads as before and after.
          navigate(other < scan.id ? `/scans/${scan.id}/compare/${other}` : `/scans/${other}/compare/${scan.id}`);
        }}
        className="h-10 rounded-[10px] border border-white/25 bg-white/15 px-2 font-normal text-white focus:outline-2 focus:outline-white"
      >
        <option value="" className="text-ink">Choose a scan…</option>
        {others.map((s) => (
          <option key={s.id} value={s.id} className="text-ink">
            Scan #{s.id} · {new Date(s.createdAt).toLocaleDateString()}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function ScanReport() {
  const { id } = useParams();
  const { toast } = useToast();
  const [scan, setScan] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [hoverId, setHoverId] = useState(null);
  const [selected, setSelected] = useState(null); // asks the findings list to open + scroll to one finding
  const [focus, setFocus] = useState({ id: null, key: 0 }); // asks the screenshot to scroll to one marker
  const [printing, setPrinting] = useState(false);
  const [party, setParty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer;
    const load = async () => {
      try {
        const res = await api.get(`/scans/${id}`);
        if (cancelled) return;
        setScan(res.data.scan);
        setError('');
        if (ACTIVE_STATUSES.includes(res.data.scan.status)) {
          timer = setTimeout(load, 2000);
        } else if (res.data.scan.status !== 'FAILED') {
          const f = await api.get(`/scans/${id}/findings`);
          if (!cancelled) setData(f.data);
        }
      } catch (err) {
        if (!cancelled) setError(err.response?.status === 404 ? 'Scan not found' : 'Could not load this scan');
      }
    };
    setScan(null);
    setData(null);
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);

  const findings = data?.findings || [];
  const summary = data?.summary;
  const sorted = useMemo(() => sortFindings(findings), [findings]);
  const numbers = useMemo(() => numberFindings(sorted), [sorted]);

  // A small celebration the first time a person sees a scan with no high-priority issues (once per scan per browser session).
  useEffect(() => {
    if (!scan || !summary || !isDone(scan)) return undefined;
    if ((summary.byPriority?.HIGH || 0) > 0) return undefined;
    const key = `accessflow-celebrated-${scan.id}`;
    try {
      if (sessionStorage.getItem(key)) return undefined;
      sessionStorage.setItem(key, '1');
    } catch { /* storage blocked: celebrate once per page view instead */ }
    toast(summary.total === 0 ? 'No violations found by the selected rules.' : 'No high-priority issues on this page. Nice work!');
    setParty(true);
    const stop = setTimeout(() => setParty(false), 3800);
    return () => clearTimeout(stop);
  }, [scan, summary, toast]);

  const pick = useCallback((findingId, { scrollImage = false } = {}) => {
    const key = Date.now();
    setSelected({ id: findingId, key });
    if (scrollImage) setFocus({ id: findingId, key });
  }, []);

  const exportPdf = () => {
    const wasDark = document.documentElement.classList.contains('dark');
    const oldTitle = document.title;
    if (wasDark) document.documentElement.classList.remove('dark'); // paper is white
    document.title = `AccessFlow report - scan ${scan.id}`;
    setPrinting(true); // opens every finding so the printed report has the details
    const restore = () => {
      setPrinting(false);
      document.title = oldTitle;
      if (wasDark) document.documentElement.classList.add('dark');
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);
    setTimeout(() => window.print(), 250);
  };

  if (!scan) {
    return (
      <AppLayout title="Scan report">
        {error ? <p role="alert" className={alertBox}>{error}</p> : <ReportSkeleton />}
        <Link to="/dashboard" className="mt-4 inline-block font-semibold underline">Back to dashboard</Link>
      </AppLayout>
    );
  }

  const result = scan.result;
  const axe = result?.axe;
  const elements = findings.reduce((n, f) => n + f.nodeCount, 0);
  const active = ACTIVE_STATUSES.includes(scan.status);
  const done = isDone(scan);
  const durations = Object.entries(scan.stageDurations || {});

  const priorityData = [...PRIORITY_ORDER, 'NONE']
    .map((k) => ({ name: k === 'NONE' ? 'Not prioritised' : PRIORITY_LABELS[k], value: summary?.byPriority?.[k] || 0, color: PRIORITY_COLORS[k] }))
    .filter((d) => d.value > 0 || d.name !== 'Not prioritised');
  const impactData = Object.keys(IMPACT_LABELS).map((k) => ({ name: IMPACT_LABELS[k], value: summary?.byScannerImpact?.[k] || 0, color: IMPACT_COLORS[k] }));
  const principles = principleCounts(findings);
  const radarData = principles.filter((d) => d.name !== 'Best practice').map((d) => ({ name: d.name, value: d.count }));
  const bestPractice = principles.find((d) => d.name === 'Best practice')?.count || 0;
  const outcomeData = axe
    ? [
        { name: 'Passed', value: axe.passed, color: OUTCOME_COLORS.Passed },
        { name: 'Violated', value: axe.violated, color: OUTCOME_COLORS.Violated },
        { name: 'Needs review', value: axe.needsReview, color: OUTCOME_COLORS['Needs review'] },
        { name: 'Not applicable', value: axe.notApplicable, color: OUTCOME_COLORS['Not applicable'] },
      ]
    : null;

  return (
    <AppLayout title="Scan report">
      {party && <Confetti />}
      <p className="no-print text-muted">
        <Link to="/dashboard" className="underline">My Projects</Link> /{' '}
        <Link to={`/projects/${scan.projectId}`} className="underline">Project</Link> / Scan #{scan.id}
      </p>

      <section className="print-avoid-break mt-4 overflow-hidden rounded-3xl bg-gradient-to-br from-navy via-[#26215c] to-brand p-6 text-white shadow-lg md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[12px] font-bold uppercase tracking-widest text-white/60">Accessibility report</p>
            <h1 className="mt-1 break-all text-2xl font-bold md:text-3xl">{scan.scannedUrl}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-white/75">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadge(scan.status)}`}>{STATUS_LABELS[scan.status]}</span>
              Scan #{scan.id} · {new Date(scan.createdAt).toLocaleString()}
              {axe && ` · axe-core ${axe.version}`}
            </p>
            <div className="no-print mt-4 flex flex-wrap items-center gap-3">
              <a href={scan.scannedUrl} target="_blank" rel="noopener noreferrer" className="rounded-[10px] bg-white/15 px-4 py-2.5 text-[13px] font-semibold ring-1 ring-white/25 hover:bg-white/25">
                Open the page ↗
              </a>
              {done && data && (
                <button type="button" onClick={exportPdf} className="rounded-[10px] bg-white/15 px-4 py-2.5 text-[13px] font-semibold ring-1 ring-white/25 hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white">
                  Export as PDF
                </button>
              )}
              {done && <CompareMenu scan={scan} />}
            </div>
          </div>
          {done && data?.score && <ScoreGauge score={data.score} />}
        </div>

        {done && summary && (
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Issues found" value={summary.total} note={`${elements} element${elements === 1 ? '' : 's'} affected`} />
            <Kpi label="High priority" value={summary.byPriority?.HIGH || 0} note="Fix these first" />
            <Kpi label="Rules passed" value={axe ? `${axe.passed}/${axe.rulesRun}` : '–'} note="of the selected rules" />
            <Kpi label="Needs a human look" value={axe ? axe.needsReview : '–'} note="axe could not decide" />
          </div>
        )}
      </section>

      {error && <p role="alert" className={`${alertBox} mt-4`}>{error}</p>}

      {active && <div className="mt-5"><ScanProgress status={scan.status} /></div>}
      {scan.status === 'FAILED' && <p role="alert" className={`${alertBox} mt-5`}>{scan.errorMessage}</p>}

      {done && (
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-5">
            <ScanWarnings warnings={scan.warnings} />

            {data?.comparison && (
              <section aria-label="Comparison with the previous scan" className="print-avoid-break rounded-2xl border border-line bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-[15px] font-bold">Compared with scan #{data.comparison.previousScanId}</h2>
                  <Link to={`/scans/${scan.id}/compare/${data.comparison.previousScanId}`} className="no-print text-[13px] font-semibold text-brand underline">
                    See side by side
                  </Link>
                </div>
                <p className="text-[12px] text-muted">Applied a fix? This shows whether it worked.</p>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {[
                    ['Resolved', data.comparison.resolved.length, 'text-green-700'],
                    ['Fewer elements', data.comparison.improved, 'text-green-700'],
                    ['Unchanged', data.comparison.same, ''],
                    ['More elements', data.comparison.worse, 'text-[#912018]'],
                    ['New', data.comparison.new, 'text-[#912018]'],
                  ].map(([label, n, tone]) => (
                    <div key={label} className="rounded-xl bg-page p-3 text-center">
                      <p className={`text-2xl font-bold ${tone}`}>{n}</p>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
                    </div>
                  ))}
                </div>
                {data.comparison.resolved.length > 0 && (
                  <p className="mt-3 text-[13px]">Resolved rules: {data.comparison.resolved.map((r) => <code key={r} className="mr-1.5 rounded bg-green-50 px-1.5 py-0.5">{r}</code>)}</p>
                )}
              </section>
            )}

            {data && <FixFirst findings={sorted} numbers={numbers} onSelect={(fid) => pick(fid, { scrollImage: true })} />}

            <Panel title="Where the issues are">
              <p className="text-[12px] text-muted">Each number matches an issue in the list below. Hover or focus a marker to outline every affected element.</p>
              <AnnotatedSnapshot
                scan={scan}
                findings={sorted}
                numbers={numbers}
                activeId={selected?.id ?? null}
                hoverId={hoverId}
                onSelect={(fid) => pick(fid)}
                onHover={setHoverId}
                focusId={focus.id}
                focusKey={focus.key}
              />
            </Panel>

            {summary && (
              <div className="grid gap-5 md:grid-cols-3">
                <ChartCard title="By priority" subtitle="How urgent each issue is">
                  <Donut data={priorityData} centerValue={summary.total} centerLabel="issues" />
                </ChartCard>
                <ChartCard title="By scanner impact" subtitle="Severity reported by axe-core">
                  <HBars data={impactData} />
                </ChartCard>
                <ChartCard title="By WCAG principle" subtitle="Which kind of barrier">
                  <PrincipleRadar data={radarData} extra={bestPractice} />
                </ChartCard>
              </div>
            )}

            <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-bold">Findings</h2>
              {data ? (
                <FindingsView data={data} selected={selected} onHover={setHoverId} onOpen={(fid) => setFocus({ id: fid, key: Date.now() })} forceOpen={printing} />
              ) : (
                <FindingsSkeleton />
              )}
            </section>
          </div>

          <aside aria-label="Page details" className="print-flat min-w-0 space-y-5 xl:sticky xl:top-5 xl:self-start">
            {outcomeData && (
              <ChartCard title="Rule outcomes" subtitle={`${axe.rulesRun} selected rules checked`}>
                <Donut data={outcomeData} centerValue={axe.rulesRun} centerLabel="rules" />
              </ChartCard>
            )}

            {result && (
              <Panel title="Page details">
                <dl>
                  <Detail label="Title">{result.title || '(none)'}</Detail>
                  <Detail label="Language">{result.language || 'not set'}</Detail>
                  <Detail label="Description">{result.description || 'not set'}</Detail>
                  {scan.finalUrl && <Detail label="Final URL">{scan.finalUrl}</Detail>}
                  <Detail label="Contents">
                    {result.counts.links} links · {result.counts.images} images · {result.counts.buttons} buttons ·{' '}
                    {result.counts.forms} forms · {result.counts.inputs} inputs
                  </Detail>
                </dl>
                {result.headings?.length > 0 && (
                  <>
                    <h3 className="mt-4 text-[11px] font-bold uppercase tracking-widest text-muted">Heading outline</h3>
                    <ul className="mt-1.5 space-y-0.5 text-[13px]">
                      {result.headings.slice(0, 10).map((h, i) => (
                        <li key={i} style={{ paddingLeft: (Number(h.level[1]) - 1) * 10 }}>
                          <code className="text-muted">{h.level}</code> {h.text}
                        </li>
                      ))}
                      {result.headings.length > 10 && <li className="text-muted">+ {result.headings.length - 10} more</li>}
                    </ul>
                  </>
                )}
              </Panel>
            )}

            {durations.length > 0 && (
              <Panel title="Where the time went">
                <ul className="mt-3 space-y-1.5 text-[13px]">
                  {durations.map(([k, ms]) => (
                    <li key={k} className="flex justify-between"><span className="capitalize text-muted">{k}</span><b>{(ms / 1000).toFixed(1)} s</b></li>
                  ))}
                </ul>
              </Panel>
            )}

            <Link to={`/projects/${scan.projectId}`} className={`${btnLight} no-print w-full`}>← Back to project</Link>
          </aside>
        </div>
      )}
    </AppLayout>
  );
}
