import { useEffect, useMemo, useRef, useState } from 'react';
import { PRIORITY_COLORS, PRIORITY_LABELS } from '../utils/findings';
import { Skeleton } from './Skeleton';

const MAX_OUTLINES = 20;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const shapeFor = (priority) => (priority === 'HIGH' ? 'rounded-full' : priority === 'MEDIUM' ? 'rounded-md' : 'rounded-[4px] rotate-45');

// The page screenshot with a numbered marker on every issue that has a known position. Hover or focus a marker (or its
// issue in the list) to see every affected element outlined; click a marker to jump to the issue.
export default function AnnotatedSnapshot({ scan, findings, numbers, activeId, hoverId, onSelect, onHover, focusId, focusKey }) {
  const [broken, setBroken] = useState(false);
  const [dims, setDims] = useState(null);
  const box = useRef(null);
  const img = useRef(null);

  const placed = useMemo(
    () =>
      findings.map((f) => {
        const boxes = (f.nodes || []).map((n) => n.bbox).filter((b) => b && b.w > 0 && b.h > 0);
        return { finding: f, boxes };
      }),
    [findings],
  );
  const withBoxes = placed.filter((p) => p.boxes.length > 0);

  // Scroll the screenshot so the marker for the issue the person just picked in the list is in view.
  useEffect(() => {
    if (!focusId || !dims || !box.current || !img.current) return;
    const target = placed.find((p) => p.finding.id === focusId)?.boxes[0];
    if (!target) return;
    const top = (target.y / dims.h) * img.current.clientHeight;
    box.current.scrollTo({ top: Math.max(0, top - box.current.clientHeight / 3), behavior: reducedMotion() ? 'auto' : 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  if (!scan.screenshotFile) return <p className="mt-3 text-[13px] text-muted">No screenshot was saved for this scan.</p>;
  if (broken) {
    return (
      <p className="mt-3 rounded-xl bg-page p-3 text-[13px] text-muted">
        The screenshot file is missing on the server. Screenshots are stored in <code>server/uploads/screenshots</code>; if that
        folder was not copied when you moved the project, run a new scan to get a fresh image.
      </p>
    );
  }

  const src = `/api/screenshots/${scan.screenshotFile}`;
  const missing = findings.length - withBoxes.length;
  const live = hoverId ?? activeId;

  return (
    <div className="mt-3">
      <div ref={box} className="print-full max-h-[560px] overflow-auto rounded-xl border border-line">
        {!dims && <Skeleton className="h-64 w-full rounded-none" />}
        <div className="relative" style={dims ? undefined : { display: 'none' }}>
          <img
            ref={img}
            src={src}
            alt={`Screenshot of ${scan.scannedUrl}`}
            onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            onError={() => setBroken(true)}
            className="block w-full"
          />
          {dims &&
            withBoxes.map(({ finding: f, boxes }) => {
              const color = PRIORITY_COLORS[f.prediction?.priority] || PRIORITY_COLORS.NONE;
              const on = live === f.id;
              const shown = on ? boxes.slice(0, MAX_OUTLINES) : boxes.slice(0, 1);
              return shown.map((b, i) => (
                <span
                  key={`${f.id}-${i}`}
                  aria-hidden="true"
                  className="pointer-events-none absolute"
                  style={{
                    left: `${(b.x / dims.w) * 100}%`,
                    top: `${(b.y / dims.h) * 100}%`,
                    width: `${(b.w / dims.w) * 100}%`,
                    height: `${(b.h / dims.h) * 100}%`,
                    border: `2px solid ${color}`,
                    background: on ? `${color}33` : 'transparent',
                    opacity: on ? 1 : 0.55,
                    borderRadius: 3,
                  }}
                />
              ));
            })}
          {dims &&
            withBoxes.map(({ finding: f, boxes }) => {
              const b = boxes[0];
              const color = PRIORITY_COLORS[f.prediction?.priority] || PRIORITY_COLORS.NONE;
              const on = live === f.id;
              const n = numbers.get(f.id);
              const label = `Issue ${n}: ${f.help || f.ruleId}. ${PRIORITY_LABELS[f.prediction?.priority] || 'Not prioritised'} priority. Show details.`;
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-label={label}
                  onClick={() => onSelect(f.id)}
                  onMouseEnter={() => onHover(f.id)}
                  onMouseLeave={() => onHover(null)}
                  onFocus={() => onHover(f.id)}
                  onBlur={() => onHover(null)}
                  className="marker absolute grid h-7 w-7 place-items-center border-2 border-white text-[12px] font-bold text-white shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  style={{
                    left: `${Math.min(98, Math.max(1, (b.x / dims.w) * 100))}%`,
                    top: `${(b.y / dims.h) * 100}%`,
                    background: color,
                    transform: `translate(-40%, -40%) scale(${on ? 1.3 : 1})`,
                    zIndex: on ? 20 : 10,
                    boxShadow: on ? `0 0 0 3px var(--color-brand)` : undefined,
                  }}
                >
                  <span className={f.prediction?.priority === 'LOW' ? '-rotate-45' : ''}>{n}</span>
                </button>
              );
            })}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
        {[['HIGH', 'High'], ['MEDIUM', 'Medium'], ['LOW', 'Low'], ['NONE', 'Not prioritised']].map(([k, t]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`inline-block h-3 w-3 ${shapeFor(k === 'NONE' ? 'MEDIUM' : k)}`} style={{ background: PRIORITY_COLORS[k] }} />
            {t}
          </span>
        ))}
        <a href={src} target="_blank" rel="noreferrer" className="no-print ml-auto font-semibold text-brand underline">Open the full image</a>
      </div>
      {dims && withBoxes.length === 0 && findings.length > 0 && (
        <p className="mt-2 rounded-xl bg-page p-3 text-[12px] text-muted">
          Marker positions were not saved for this scan, so the issues cannot be placed on the image. Run a new scan to see them.
        </p>
      )}
      {dims && withBoxes.length > 0 && missing > 0 && (
        <p className="mt-2 text-[12px] text-muted">
          {missing} issue{missing === 1 ? '' : 's'} not shown on the image: the element is hidden or sits inside an embedded frame.
        </p>
      )}
    </div>
  );
}
