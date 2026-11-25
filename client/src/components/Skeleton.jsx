// Grey placeholder shapes shown while data loads. The pulse stops for people who ask for reduced motion (see index.css).
export function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`skeleton rounded-lg ${className}`} />;
}

export function SkeletonText({ lines = 3, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`h-3.5 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  );
}

// One screen-reader announcement for the whole loading block, instead of reading every placeholder.
export function Loading({ label, children }) {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function ReportSkeleton() {
  return (
    <Loading label="Loading the scan report">
      <Skeleton className="mt-4 h-52 w-full rounded-3xl" />
      <div className="mt-5 grid gap-5 md:grid-cols-3">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
      <Skeleton className="mt-5 h-40 rounded-2xl" />
    </Loading>
  );
}

export function FindingsSkeleton() {
  return (
    <Loading label="Loading findings">
      <ul className="space-y-3">
        {[0, 1, 2].map((i) => (
          <li key={i} className="rounded-2xl border border-line bg-white p-4">
            <Skeleton className="h-4 w-3/4" />
            <div className="mt-3 flex gap-2">
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-5 w-32 rounded-full" />
            </div>
          </li>
        ))}
      </ul>
    </Loading>
  );
}
