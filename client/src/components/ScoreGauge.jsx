import { useEffect, useState } from 'react';
import { GRADE_COLORS } from '../utils/findings';

const R = 52;
const CIRC = 2 * Math.PI * R;
const ARC = CIRC * 0.75; // a three-quarter ring, open at the bottom

// The score ring for the top of a report. Sits on the dark hero, so the track and text are light.
export default function ScoreGauge({ score }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(score.value)); // animates from empty to the real value
    return () => cancelAnimationFrame(id);
  }, [score.value]);

  const color = GRADE_COLORS[score.grade] || '#fff';
  const offset = ARC - (ARC * shown) / 100;
  const delta = score.delta;
  const trend =
    delta === null || delta === undefined
      ? null
      : delta === 0
        ? { text: `No change since scan #${score.previous.scanId}`, sign: '=' }
        : { text: `${delta > 0 ? '+' : '−'}${Math.abs(delta)} since scan #${score.previous.scanId}`, sign: delta > 0 ? '▲' : '▼' };

  const label =
    `Accessibility score ${score.value} out of 100, grade ${score.grade}` +
    (trend ? `, ${delta > 0 ? 'up' : delta < 0 ? 'down' : 'unchanged'} ${Math.abs(delta)} since scan ${score.previous.scanId}` : '');

  return (
    <div className="flex items-center gap-4 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15">
      <div className="relative h-32 w-32 shrink-0" role="img" aria-label={label}>
        <svg viewBox="0 0 128 128" className="h-full w-full" aria-hidden="true">
          <g transform="rotate(135 64 64)">
            <circle cx="64" cy="64" r={R} fill="none" stroke="rgb(255 255 255 / .18)" strokeWidth="11" strokeLinecap="round" strokeDasharray={`${ARC} ${CIRC}`} />
            <circle
              className="gauge-arc"
              cx="64" cy="64" r={R} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round"
              strokeDasharray={`${ARC} ${CIRC}`} strokeDashoffset={offset}
            />
          </g>
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center" aria-hidden="true">
          <div>
            <p className="text-4xl font-bold leading-none">{score.value}</p>
            <p className="mt-1 text-[11px] font-semibold text-white/70">out of 100</p>
          </div>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-white/70">Accessibility score</p>
        <p className="mt-0.5 flex items-baseline gap-2">
          <span className="text-3xl font-bold leading-none" style={{ color }}>Grade {score.grade}</span>
        </p>
        {trend && (
          <p className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold ${delta > 0 ? 'bg-green-400/20 text-green-200' : delta < 0 ? 'bg-red-400/20 text-red-200' : 'bg-white/15 text-white/80'}`}>
            <span aria-hidden="true">{trend.sign}</span>
            {trend.text}
          </p>
        )}
        <p className="mt-2 max-w-[15rem] text-[11px] leading-snug text-white/60">
          Based on the automated rules only. It helps you compare scans of this page and is not a WCAG conformance result.
        </p>
      </div>
    </div>
  );
}
