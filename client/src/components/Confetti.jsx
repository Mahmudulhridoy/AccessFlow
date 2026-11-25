import { useMemo } from 'react';

const COLORS = ['#6c5ce7', '#12b76a', '#f79009', '#2e90fa', '#d92d20'];

// A short burst of falling pieces, drawn with CSS only. It is decorative: hidden from assistive tech, ignores clicks, and
// not shown at all when the person has asked for reduced motion (the rule in index.css hides .confetti-piece).
export default function Confetti({ pieces = 44 }) {
  const items = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => ({
        id: i,
        left: Math.round(Math.random() * 100),
        delay: Math.round(Math.random() * 500),
        duration: 1800 + Math.round(Math.random() * 1400),
        drift: Math.round((Math.random() - 0.5) * 160),
        spin: Math.round(Math.random() * 720 - 360),
        color: COLORS[i % COLORS.length],
        size: 6 + Math.round(Math.random() * 6),
      })),
    [pieces],
  );
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-50 overflow-hidden print:hidden">
      {items.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.6,
            background: p.color,
            animationDelay: `${p.delay}ms`,
            animationDuration: `${p.duration}ms`,
            '--drift': `${p.drift}px`,
            '--spin': `${p.spin}deg`,
          }}
        />
      ))}
    </div>
  );
}
