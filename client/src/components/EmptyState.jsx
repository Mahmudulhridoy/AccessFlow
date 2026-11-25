// Small inline illustrations (no image files, so they follow the theme colours). Decorative, so hidden from screen readers.
const ART = {
  clean: (
    <>
      <circle cx="60" cy="60" r="38" fill="var(--color-brand)" opacity=".12" />
      <circle cx="60" cy="60" r="26" fill="none" stroke="var(--color-brand)" strokeWidth="4" />
      <path d="M48 61l9 9 17-20" fill="none" stroke="var(--color-brand)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  scan: (
    <>
      <rect x="22" y="26" width="76" height="62" rx="9" fill="var(--color-brand)" opacity=".12" />
      <rect x="22" y="26" width="76" height="62" rx="9" fill="none" stroke="var(--color-brand)" strokeWidth="4" />
      <path d="M22 42h76" stroke="var(--color-brand)" strokeWidth="4" />
      <circle cx="33" cy="34" r="2.5" fill="var(--color-brand)" />
      <path d="M36 62h48M36 74h30" stroke="var(--color-brand)" strokeWidth="4" strokeLinecap="round" opacity=".55" />
    </>
  ),
  search: (
    <>
      <circle cx="53" cy="53" r="24" fill="var(--color-brand)" opacity=".12" />
      <circle cx="53" cy="53" r="24" fill="none" stroke="var(--color-brand)" strokeWidth="5" />
      <path d="M71 71l22 22" stroke="var(--color-brand)" strokeWidth="6" strokeLinecap="round" />
    </>
  ),
  chart: (
    <>
      <rect x="24" y="58" width="16" height="34" rx="4" fill="var(--color-brand)" opacity=".45" />
      <rect x="52" y="38" width="16" height="54" rx="4" fill="var(--color-brand)" opacity=".7" />
      <rect x="80" y="22" width="16" height="70" rx="4" fill="var(--color-brand)" />
    </>
  ),
};

export default function EmptyState({ art = 'scan', title, children, action }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-6 text-center">
      <svg viewBox="0 0 120 110" aria-hidden="true" className="mx-auto h-24 w-24">{ART[art]}</svg>
      <p className="mt-2 text-base font-bold">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-[13px] text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
