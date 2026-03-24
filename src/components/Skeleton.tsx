export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-gray-100 rounded-xl animate-pulse ${className}`} />
  )
}

export function SkeletonKpiCards() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-white border border-gray-100 rounded-xl p-5">
          <div className="h-3 w-24 bg-gray-200 rounded animate-pulse mb-3" />
          <div className="h-6 w-32 bg-gray-200 rounded animate-pulse" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonChart() {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-6">
      <div className="h-4 w-40 bg-gray-200 rounded animate-pulse mb-6" />
      <div className="h-48 bg-gray-100 rounded-lg animate-pulse" />
    </div>
  )
}

export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      {[...Array(rows)].map((_, i) => (
        <div key={i} className={`flex items-center justify-between px-5 py-4 gap-4 ${i !== 0 ? 'border-t border-gray-50' : ''}`}>
          <div className="flex flex-col gap-2 flex-1">
            <div className="h-3 w-32 bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-48 bg-gray-100 rounded animate-pulse" />
          </div>
          <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
        </div>
      ))}
    </div>
  )
}
