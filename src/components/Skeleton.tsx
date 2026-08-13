// Loading skeletons that mirror the real content's shape, with a soft shimmer
// (see `.skeleton` in index.css). Prefer these over spinners.

export function SkeletonCard({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-xl ${className}`} />
}

/** KPI card skeleton — same footprint as the real KpiCard (min-h, icon, value). */
export function SkeletonKpiCards({ count = 5 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {[...Array(count)].map((_, i) => (
        <div key={i} className="glass-kpi rounded-2xl px-5 py-5 min-h-[160px] flex flex-col">
          <div className="skeleton w-10 h-10 rounded-xl mb-3" />
          <div className="skeleton h-3 w-20 rounded mb-3" />
          <div className="skeleton h-7 w-28 rounded-lg" />
          <div className="skeleton h-3 w-16 rounded mt-auto" />
        </div>
      ))}
    </div>
  )
}

/** Chart skeleton — a rectangle at the chart's real height. */
export function SkeletonChart({ height = 288 }: { height?: number }) {
  return (
    <div className="glass rounded-2xl p-6">
      <div className="skeleton h-4 w-40 rounded mb-6" />
      <div className="skeleton rounded-lg w-full" style={{ height }} />
    </div>
  )
}

/** Table skeleton — header row + body rows matching a data table. */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="glass rounded-2xl overflow-hidden">
      {[...Array(rows)].map((_, i) => (
        <div key={i} className={`flex items-center justify-between px-5 py-4 gap-4 ${i !== 0 ? 'border-t border-ink-100/70' : ''}`}>
          <div className="flex flex-col gap-2 flex-1">
            <div className="skeleton h-3.5 w-32 rounded" />
            <div className="skeleton h-3 w-48 rounded" />
          </div>
          <div className="skeleton h-4 w-20 rounded" />
        </div>
      ))}
    </div>
  )
}
