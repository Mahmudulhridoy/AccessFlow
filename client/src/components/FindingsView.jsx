import { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';
import {
  IMPACT_LABELS,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  PRINCIPLE_NAMES,
  describeWarnings,
  impactBadge,
  numberFindings,
  principlesOf,
  priorityBadge,
  priorityInfo,
  sortFindings,
} from '../utils/findings';
import { btnLight } from '../utils/ui';
import CodeDiff from './CodeDiff';
import ConfidenceMeter from './ConfidenceMeter';
import EmptyState from './EmptyState';
import { useToast } from './Toast';

const MAX_NODES = 5;

const REASONS = [
  ['WRONG_FIX', 'The fix is wrong'],
  ['NOT_APPLICABLE', 'It does not apply to my page'],
  ['TOO_VAGUE', 'Too vague to act on'],
  ['CODE_DOES_NOT_WORK', 'The example code does not work'],
  ['OTHER', 'Something else'],
];

const CHANGE_BADGES = {
  NEW: ['New since the previous scan', 'bg-[#fee4e2] text-[#912018]'],
  WORSE: ['More elements than the previous scan', 'bg-[#fee4e2] text-[#912018]'],
  IMPROVED: ['Fewer elements than the previous scan', 'bg-green-100 text-green-900'],
  SAME: ['Still present', 'bg-slate-100 text-slate-800'],
};

// Lets the user say whether the explanation / fix was useful. This is how the AI text gets validated by real people.
function Feedback({ finding, isAi }) {
  const { toast } = useToast();
  const [saved, setSaved] = useState(finding.explanation?.myFeedback || null);
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async (rating) => {
    setBusy(true);
    setError('');
    try {
      const res = await api.post(`/findings/${finding.id}/feedback`, {
        rating,
        ...(rating === 'NOT_HELPFUL' && reason ? { reason } : {}),
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      });
      setSaved(res.data.feedback);
      setEditing(false);
      toast(rating === 'HELPFUL' ? 'Thanks! Your rating was saved.' : 'Thanks, your feedback was saved. It helps us improve.');
    } catch (err) {
      const message = err.response?.data?.error || 'Could not save your rating. Try again.';
      setError(message);
      toast(message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const btn = 'min-h-10 rounded-[10px] border border-line bg-white px-4 text-[13px] font-semibold hover:bg-page disabled:opacity-60';

  return (
    <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-line">
      <p className="font-bold">Was this {isAi ? 'AI suggestion' : 'guidance'} helpful?</p>
      <p className="mt-0.5 text-[12px] text-muted">Your rating helps us check how good the suggestions really are. Try the fix, scan again, and see if the issue is gone.</p>

      {saved && !editing ? (
        <p role="status" className="mt-3 text-[13px]">
          Thanks! You rated this <b>{saved.rating === 'HELPFUL' ? 'helpful' : 'not helpful'}</b>.{' '}
          <button type="button" onClick={() => setEditing(true)} className="font-semibold text-brand underline">Change</button>
        </p>
      ) : (
        <div className="mt-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => send('HELPFUL')} className={btn}>👍 Helpful</button>
            <button type="button" disabled={busy} aria-expanded={reason !== ""} onClick={() => setReason((r) => (r === null || r === '' ? 'WRONG_FIX' : r))} className={btn}>👎 Not helpful</button>
          </div>
          {reason !== '' && reason !== null && (
            <div className="mt-3 space-y-2">
              <label className="block text-[13px] font-semibold">
                What was wrong?
                <select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 block h-10 w-full max-w-sm rounded-[10px] border border-line bg-white px-2 font-normal">
                  {REASONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </label>
              <label className="block text-[13px] font-semibold">
                Comment (optional)
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} rows={2} className="mt-1 block w-full rounded-[10px] border border-line bg-white p-2 font-normal" />
              </label>
              <button type="button" disabled={busy} onClick={() => send('NOT_HELPFUL')} className="min-h-10 rounded-[10px] bg-brand px-4 text-[13px] font-semibold text-white hover:bg-[#5849d6] disabled:opacity-60">
                {busy ? 'Saving...' : 'Send rating'}
              </button>
            </div>
          )}
          {error && <p role="alert" className="mt-2 text-[13px] text-[#912018]">{error}</p>}
        </div>
      )}
    </div>
  );
}

export function ScanWarnings({ warnings }) {
  const messages = describeWarnings(warnings);
  if (messages.length === 0) return null;
  return (
    <div role="note" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-900">
      <p className="font-bold">Completed with notes</p>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {messages.map((m) => <li key={m}>{m}</li>)}
      </ul>
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div className="mt-4 first:mt-0">
      <h5 className="text-[11px] font-bold uppercase tracking-widest text-muted">{label}</h5>
      <div className="mt-1.5 whitespace-pre-line leading-relaxed">{children}</div>
    </div>
  );
}

function FindingItem({ finding, aiDisclaimer, number, open, onToggle, flash, onHover }) {
  const panelId = `finding-${finding.id}`;
  const p = priorityInfo(finding.prediction);
  const ex = finding.explanation;
  const isAi = ex?.source === 'LLM';
  const nodes = finding.nodes || [];
  // When there is no AI fix, axe-core's own per-element advice ("Fix any of the following: ...") is the next best thing.
  const scannerFixes = [...new Set(nodes.map((n) => n.failureSummary).filter(Boolean))].slice(0, 3);
  const color = PRIORITY_COLORS[finding.prediction?.priority] || PRIORITY_COLORS.NONE;

  return (
    <li
      id={`finding-card-${finding.id}`}
      onMouseEnter={() => onHover(finding.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(finding.id)}
      onBlur={() => onHover(null)}
      className={`print-avoid-break overflow-hidden rounded-2xl border border-line bg-white shadow-sm transition-shadow ${flash ? 'ring-2 ring-brand' : ''}`}
      style={{ borderLeft: `5px solid ${color}` }}
    >
      <h4 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex w-full items-start gap-3 p-4 text-left hover:bg-page focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-bold text-white" style={{ background: color }} title={`Marker ${number} on the screenshot`}>
            <span className="sr-only">Issue </span>{number}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold leading-snug">{finding.help || finding.description}</span>
            <span className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${priorityBadge(finding.prediction?.priority)}`}>
                {p.source === 'NONE' ? 'Not prioritised' : `${p.label} priority${p.source === 'FALLBACK' ? ' (estimated)' : ''}`}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${impactBadge}`}>
                Scanner impact: {IMPACT_LABELS[finding.axeImpact] || 'Unknown'}
              </span>
              {(finding.wcag || []).map((c) => (
                <span key={c.criterion} className="rounded-full bg-[#efedff] px-2.5 py-0.5 text-xs font-semibold text-[#3b2fa8]">
                  WCAG {c.criterion}{c.level ? ` (${c.level})` : ''}
                </span>
              ))}
              {finding.change && CHANGE_BADGES[finding.change.change] && (
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${CHANGE_BADGES[finding.change.change][1]}`}>
                  {CHANGE_BADGES[finding.change.change][0]}
                  {finding.change.change === 'IMPROVED' || finding.change.change === 'WORSE' ? ` (was ${finding.change.previousNodeCount})` : ''}
                </span>
              )}
              <code className="text-[12px] text-muted">{finding.ruleId}</code>
            </span>
          </span>
          <span className="shrink-0 text-right text-[13px] text-muted">
            <b className="block text-lg text-ink">{finding.nodeCount}</b>
            element{finding.nodeCount === 1 ? '' : 's'}
            <span aria-hidden="true" className="block">{open ? '▲' : '▼'}</span>
          </span>
        </button>
      </h4>

      {open && (
        <div id={panelId} className="border-t border-line bg-[#fbfbfe] p-4 text-[13px]">
          <Section label={isAi ? 'What is wrong (AI explanation)' : 'What is wrong'}>
            {ex?.explanation || finding.description}
          </Section>

          {isAi && ex.userImpact && <Section label="Who this affects">{ex.userImpact}</Section>}

          <Section label={isAi ? 'How to fix (AI suggestion)' : 'How to fix (from axe-core)'}>
            {isAi && ex.suggestedFix
              ? ex.suggestedFix
              : scannerFixes.length
                ? scannerFixes.join('\n\n')
                : finding.help}
          </Section>

          {isAi && ex.exampleCode && (
            <Section label="Before and after">
              <CodeDiff before={nodes.find((n) => n.htmlSnippet)?.htmlSnippet} after={ex.exampleCode} />
            </Section>
          )}

          {p.source !== 'NONE' && (
            <Section label="Why this priority">
              <ConfidenceMeter finding={finding} />
            </Section>
          )}

          <p className="mt-4 rounded-xl bg-white p-3 text-[12px] text-muted ring-1 ring-line">
            {isAi
              ? aiDisclaimer
              : 'AI-written fixes are not available for this issue. The guidance above comes from axe-core itself.'}{' '}
            {p.source === 'ML' && `Priority predicted by the ML model${p.version ? ` (version ${p.version})` : ''}. `}
            {p.source === 'FALLBACK' && 'Priority is estimated from the scanner impact level; it is not an ML prediction. '}
            {p.dev && <b>This is a development model and has not been validated. </b>}
          </p>

          {ex && <Feedback finding={finding} isAi={isAi} />}

          <Section label={`Affected elements (${finding.nodeCount})`}>
            <ul className="space-y-2">
              {nodes.slice(0, MAX_NODES).map((n) => (
                <li key={n.id ?? n.ordinal} className="rounded-xl bg-white p-3 ring-1 ring-line">
                  <code className="break-all font-semibold">{n.selector}</code>
                  {n.htmlSnippet && <code className="mt-1 block break-all text-muted">{n.htmlSnippet}</code>}
                </li>
              ))}
            </ul>
            {finding.nodeCount > MAX_NODES && (
              <p className="mt-1 text-muted">Showing {Math.min(MAX_NODES, nodes.length)} of {finding.nodeCount} elements.</p>
            )}
          </Section>

          {finding.helpUrl && (
            <p className="mt-4">
              <a href={finding.helpUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline">
                Read the rule documentation (opens in a new tab)
              </a>
            </p>
          )}
        </div>
      )}
    </li>
  );
}

const chip = (on) =>
  `min-h-9 rounded-full border px-3.5 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
    on ? 'border-brand bg-brand text-white' : 'border-line bg-white hover:bg-page'
  }`;

/**
 * selected = { id, key } asks the list to open one finding and scroll to it (used by the screenshot markers and the
 * "Fix these first" card). onHover tells the screenshot which finding the pointer is over. forceOpen expands everything
 * (used while printing, so the exported report contains the details).
 */
export default function FindingsView({ data, selected = null, onHover = () => {}, onOpen = () => {}, forceOpen = false }) {
  const { summary, findings, aiDisclaimer, disclaimer } = data;
  const [priority, setPriority] = useState('ALL');
  const [principle, setPrinciple] = useState('ALL');
  const [rule, setRule] = useState('ALL');
  const [query, setQuery] = useState('');
  const [openIds, setOpenIds] = useState(() => new Set());
  const [flashId, setFlashId] = useState(null);
  const fallbackCount = (summary.prioritySources || {}).FALLBACK_AXE_IMPACT || 0;

  const sorted = useMemo(() => sortFindings(findings), [findings]);
  const numbers = useMemo(() => numberFindings(sorted), [sorted]);
  const rules = useMemo(() => [...new Set(sorted.map((f) => f.ruleId))].sort(), [sorted]);

  // The first finding starts open, so a new report is not a wall of closed cards.
  useEffect(() => {
    if (sorted[0]) setOpenIds(new Set([sorted[0].id]));
  }, [sorted]);

  const matches = (f, over = {}) => {
    const pr = over.priority ?? priority;
    const pc = over.principle ?? principle;
    const ru = over.rule ?? rule;
    const q = (over.query ?? query).trim().toLowerCase();
    if (pr !== 'ALL' && (f.prediction?.priority || 'NONE') !== pr) return false;
    if (pc !== 'ALL' && !principlesOf(f).includes(pc)) return false;
    if (ru !== 'ALL' && f.ruleId !== ru) return false;
    return !q || `${f.ruleId} ${f.help || ''} ${f.description}`.toLowerCase().includes(q);
  };
  const visible = sorted.filter((f) => matches(f));
  const activeFilters = [priority !== 'ALL', principle !== 'ALL', rule !== 'ALL', query.trim() !== ''].filter(Boolean).length;
  const clearFilters = () => { setPriority('ALL'); setPrinciple('ALL'); setRule('ALL'); setQuery(''); };

  // Open and scroll to a finding that was picked somewhere else on the page.
  useEffect(() => {
    if (!selected) return undefined;
    const target = sorted.find((f) => f.id === selected.id);
    if (!target) return undefined;
    if (!matches(target)) clearFilters();
    setOpenIds((prev) => new Set(prev).add(target.id));
    setFlashId(target.id);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const scroll = setTimeout(() => document.getElementById(`finding-card-${target.id}`)?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' }), 60);
    const stop = setTimeout(() => setFlashId(null), 1600);
    return () => { clearTimeout(scroll); clearTimeout(stop); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.key]);

  const toggle = (id) => {
    if (!openIds.has(id)) onOpen(id);
    setOpenIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const allOpen = visible.length > 0 && visible.every((f) => openIds.has(f.id));

  const priorityChips = [['ALL', 'All', summary.total], ...PRIORITY_ORDER.map((k) => [k, PRIORITY_LABELS[k], summary.byPriority?.[k] || 0])];
  const principleChips = [...PRINCIPLE_NAMES, 'Best practice']
    .map((name) => [name, sorted.filter((f) => principlesOf(f).includes(name)).length])
    .filter(([, n]) => n > 0);

  return (
    <div>
      {fallbackCount > 0 && (
        <p role="note" className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-900">
          {fallbackCount === summary.total ? 'All priorities' : `${fallbackCount} of ${summary.total} priorities`} are estimated from the
          scanner's impact level because the ML model was not used. They are not ML predictions.
        </p>
      )}

      {summary.total === 0 ? (
        <EmptyState art="clean" title="No violations found by the selected rules">
          This only means the selected automated rules found nothing on this page. It does not mean the page is fully accessible:
          automated tools cannot check everything. Try a page with known problems to see findings.
        </EmptyState>
      ) : (
        <>
          <div className="no-print space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div role="group" aria-label="Filter by priority" className="flex flex-wrap gap-2">
                {priorityChips.map(([key, text, n]) => (
                  <button key={key} type="button" aria-pressed={priority === key} onClick={() => setPriority(key)} className={chip(priority === key)}>
                    {text} <span className="opacity-70">{n}</span>
                  </button>
                ))}
              </div>
              <label className="ml-auto block">
                <span className="sr-only">Search findings</span>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search rule or problem..."
                  className="h-9 w-full min-w-[200px] rounded-full border border-line bg-white px-4 text-[13px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div role="group" aria-label="Filter by WCAG principle" className="flex flex-wrap gap-2">
                {principleChips.map(([name, n]) => (
                  <button key={name} type="button" aria-pressed={principle === name} onClick={() => setPrinciple(principle === name ? 'ALL' : name)} className={chip(principle === name)}>
                    {name} <span className="opacity-70">{n}</span>
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-[13px] font-semibold">
                Rule
                <select value={rule} onChange={(e) => setRule(e.target.value)} className="h-9 max-w-[220px] rounded-full border border-line bg-white px-3 font-normal focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30">
                  <option value="ALL">All rules</option>
                  {rules.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[13px]">
              <p role="status" className="text-muted">
                Showing {visible.length} of {summary.total} issue{summary.total === 1 ? '' : 's'}
                {activeFilters > 0 && <> · <b className="text-ink">{activeFilters} filter{activeFilters === 1 ? '' : 's'} on</b></>}
              </p>
              {activeFilters > 0 && (
                <button type="button" onClick={clearFilters} className="font-semibold text-brand underline">Clear filters</button>
              )}
              <button
                type="button"
                disabled={visible.length === 0}
                onClick={() => setOpenIds(allOpen ? new Set() : new Set(visible.map((f) => f.id)))}
                className="ml-auto min-h-9 rounded-full border border-line bg-white px-3.5 font-semibold hover:bg-page disabled:opacity-50"
              >
                {allOpen ? 'Collapse all' : 'Expand all'}
              </button>
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="mt-4">
              <EmptyState art="search" title="No findings match these filters" action={<button type="button" onClick={clearFilters} className={btnLight}>Clear filters</button>}>
                Try a different priority, principle or rule, or clear the search box.
              </EmptyState>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {visible.map((f) => (
                <FindingItem
                  key={f.id}
                  finding={f}
                  aiDisclaimer={aiDisclaimer}
                  number={numbers.get(f.id)}
                  open={forceOpen || openIds.has(f.id)}
                  onToggle={() => toggle(f.id)}
                  flash={flashId === f.id}
                  onHover={onHover}
                />
              ))}
            </ul>
          )}
        </>
      )}

      <p className="mt-4 text-[12px] text-muted">{disclaimer}</p>
    </div>
  );
}
