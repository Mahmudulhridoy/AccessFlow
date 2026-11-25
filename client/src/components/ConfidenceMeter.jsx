import { PRIORITY_COLORS, PRIORITY_LABELS, PRIORITY_ORDER, confidenceOf, modelInputs, priorityInfo } from '../utils/findings';

// How sure the model is, and the inputs it was given. Only shown for real ML predictions: an estimate made from the
// scanner's impact level has no probability, and pretending otherwise would be misleading.
export default function ConfidenceMeter({ finding }) {
  const p = priorityInfo(finding.prediction);
  const conf = confidenceOf(finding.prediction);

  if (p.source === 'NONE') return null;
  if (!conf) {
    return (
      <p className="rounded-xl bg-white p-3 text-[12px] text-muted ring-1 ring-line">
        This priority is estimated from the scanner's impact level, so there is no model confidence to show.
      </p>
    );
  }

  const pct = Math.round(conf.chosen * 100);
  const level = pct >= 75 ? 'High confidence' : pct >= 50 ? 'Medium confidence' : 'Low confidence';
  const color = PRIORITY_COLORS[finding.prediction.priority];

  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-line">
      <p className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-bold">Model confidence: {pct}%</span>
        <span className="text-[12px] text-muted">{level}</span>
      </p>
      <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-page" role="img" aria-label={PRIORITY_ORDER.map((k) => `${PRIORITY_LABELS[k]} ${Math.round(conf.probs[k] * 100)}%`).join(', ')}>
        {PRIORITY_ORDER.map((k) => (
          <span key={k} style={{ width: `${conf.probs[k] * 100}%`, background: PRIORITY_COLORS[k] }} className={k === finding.prediction.priority ? '' : 'opacity-40'} />
        ))}
      </div>
      <p className="mt-1.5 text-[12px] text-muted">
        {PRIORITY_ORDER.map((k) => `${PRIORITY_LABELS[k]} ${Math.round(conf.probs[k] * 100)}%`).join(' · ')}
      </p>
      <p className="mt-3 text-[11px] font-bold uppercase tracking-widest text-muted">What the model looked at</p>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-[12px]">
        {modelInputs(finding).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[11px] text-muted" style={{ borderLeft: `3px solid ${color}`, paddingLeft: 8 }}>
        These are the inputs the model received. It does not report how much each one mattered, so none are ranked here.
      </p>
    </div>
  );
}
