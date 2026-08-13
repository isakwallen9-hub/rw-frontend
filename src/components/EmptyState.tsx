import type { ReactNode } from 'react'

// A considered empty state: a simple ink-300 icon, a clear line about what is
// missing, and an optional action — never just grey text.
export function EmptyState({
  icon,
  title,
  hint,
  action,
  className = '',
}: {
  icon: ReactNode
  title: string
  hint?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center px-6 py-12 animate-in ${className}`}>
      <div className="text-ink-300 mb-3 [&>svg]:w-8 [&>svg]:h-8" aria-hidden="true">{icon}</div>
      <p className="text-sm font-semibold text-ink-700">{title}</p>
      {hint && <p className="text-sm text-ink-400 mt-1 max-w-xs leading-relaxed">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
