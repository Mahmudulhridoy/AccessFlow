import { PRIORITY_COLORS, firstSentence, fixOf, priorityBadge, priorityInfo } from '../utils/findings';
import { CopyButton } from './CodeBlock';

// The three issues to tackle first, with a one-line fix each. Uses the same order as the findings list (ML priority, then
// scanner impact), so it never disagrees with the list below it.
export default function FixFirst({ findings, numbers, onSelect }) {
  const top = findings.slice(0, 3);
  if (top.length === 0) return null;

  return (
    <section aria-labelledby="fix-first" className="print-avoid-break rounded-2xl border border-line bg-white p-5 shadow-sm">
      <h2 id="fix-first" className="text-[15px] font-bold">Fix these first</h2>
      <p className="text-[12px] text-muted">The most urgent issues on this page, in order.</p>
      <ol className="mt-3 space-y-2.5">
        {top.map((f) => {
          const fix = fixOf(f);
          const p = priorityInfo(f.prediction);
          const color = PRIORITY_COLORS[f.prediction?.priority] || PRIORITY_COLORS.NONE;
          return (
            <li key={f.id} className="flex flex-wrap items-start gap-3 rounded-xl bg-page p-3.5" style={{ borderLeft: `4px solid ${color}` }}>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-[13px] font-bold ring-1 ring-line">
                <span className="sr-only">Issue </span>{numbers.get(f.id)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-bold">
                  {f.help || f.description}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${priorityBadge(f.prediction?.priority)}`}>
                    {p.source === 'NONE' ? 'Not prioritised' : `${p.label}${p.source === 'FALLBACK' ? ' (estimated)' : ''}`}
                  </span>
                </p>
                <p className="mt-1 text-[13px]">
                  <span className="font-semibold text-muted">{fix.isAi ? 'AI fix: ' : 'Scanner guidance: '}</span>
                  {firstSentence(fix.text)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => onSelect(f.id)}
                  className="no-print min-h-9 rounded-lg border border-line bg-white px-3 text-[12px] font-semibold hover:bg-page focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  Details
                </button>
                <CopyButton text={fix.code || fix.text} label="Copy fix" done={fix.code ? 'Fixed code copied' : 'Fix text copied'} />
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
