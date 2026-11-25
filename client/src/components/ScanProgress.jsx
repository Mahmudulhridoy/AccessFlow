import { STATUS_LABELS } from '../utils/scanStatus';

// Four steps the person can follow. The server has six statuses; validating and rendering both mean "loading the page".
const STEPS = ['Loading page', 'Running axe', 'Classifying', 'Explaining'];
const STEP_OF = { QUEUED: -1, VALIDATING: 0, RENDERING: 0, ANALYZING: 1, CLASSIFYING: 2, EXPLAINING: 3 };

export default function ScanProgress({ status, compact = false }) {
  const current = STEP_OF[status] ?? STEPS.length; // finished or unknown: every step shows as done
  const waiting = current === -1;

  return (
    <div role="status" className={compact ? 'mt-2' : 'rounded-2xl border border-line bg-white p-5 shadow-sm'}>
      {!compact && (
        <>
          <p className="text-[15px] font-bold">{waiting ? 'Waiting for a free scanner' : `${STATUS_LABELS[status]}…`}</p>
          <p className="mt-0.5 text-[12px] text-muted">This page updates by itself. You can leave and come back.</p>
        </>
      )}
      <ol className={`flex items-start ${compact ? '' : 'mt-4'}`}>
        {STEPS.map((name, i) => {
          const state = i < current ? 'done' : i === current ? 'active' : 'todo';
          return (
            <li key={name} aria-current={state === 'active' ? 'step' : undefined} className="relative flex-1 text-center">
              {i > 0 && (
                <span aria-hidden="true" className={`absolute right-1/2 top-3.5 h-0.5 w-full -translate-y-1/2 ${i <= current ? 'bg-brand' : 'bg-line'}`} />
              )}
              <span
                className={`relative mx-auto grid h-7 w-7 place-items-center rounded-full text-[12px] font-bold ${
                  state === 'done' ? 'bg-brand text-white' : state === 'active' ? 'step-active bg-brand text-white' : 'border-2 border-line bg-white text-muted'
                }`}
              >
                {state === 'done' ? '✓' : i + 1}
              </span>
              <span className={`mt-1.5 block text-[12px] ${state === 'todo' ? 'text-muted' : 'font-semibold'}`}>
                {name}
                <span className="sr-only">{state === 'done' ? ' (done)' : state === 'active' ? ' (in progress)' : ' (not started)'}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
