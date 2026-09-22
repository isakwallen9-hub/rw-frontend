// Shared recharts styling — one visual language for every chart in the app.
// No new dependencies: pure recharts + Tailwind tokens.
import type { ReactNode } from 'react'

// Horizontal-only grid, hairline dashed ink at ~6% opacity.
export const GRID = {
  vertical: false as const,
  horizontal: true as const,
  stroke: '#1A192010',
  strokeDasharray: '2 6',
}

// Axes: no line, no ticks — just labels in ink-400 at text-sm.
export const AXIS_TICK = { fill: '#72717C', fontSize: 14 } // ink-400
export const xAxisProps = { axisLine: false, tickLine: false, tick: AXIS_TICK, dy: 8 } as const
export const yAxisProps = { axisLine: false, tickLine: false, tick: AXIS_TICK, width: 64 } as const

// Compute a "nice" Y-axis scale from a series' values: a [min, max] domain plus
// an explicit list of tick values spaced by a round step. Leaves ~10% headroom
// above the highest and below the lowest value, snaps the bounds to a round step
// (1 / 2 / 2.5 / 5 × 10ⁿ), and returns evenly-spaced ticks so the gaps are always
// round numbers (5000, 10000, 20000, …) rather than the uneven spacing Recharts
// would otherwise pick on its own (e.g. 420k, 412k, 403k, 394k, 385k). Zero is
// only pulled into the range when a value actually goes below zero — an all-
// positive series keeps its floor near its own minimum, so a curve that only
// moves between, say, 388k and 421k fills most of the chart height instead of
// hugging the top edge.
export function niceScale(values: number[], targetTicks = 5): { domain: [number, number]; ticks: number[] } {
  const finite = values.filter((v) => Number.isFinite(v))
  if (finite.length === 0) return { domain: [0, 1], ticks: [0, 1] }
  const dataMin = Math.min(...finite)
  const dataMax = Math.max(...finite)
  const span = dataMax - dataMin || Math.abs(dataMax) || 1
  const pad = span * 0.1
  let lower = dataMin - pad
  let upper = dataMax + pad
  // Never show a negative axis for an all-positive series.
  if (dataMin >= 0) lower = Math.max(0, lower)

  // Pick a round step (1 / 2 / 2.5 / 5 × 10ⁿ) close to range / targetTicks.
  const rawStep = (upper - lower) / Math.max(1, targetTicks)
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep || 1)))
  const norm = rawStep / mag
  const niceMult = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10
  const step = niceMult * mag

  // Snap the padded bounds outward to whole multiples of the step.
  lower = Math.floor(lower / step) * step
  upper = Math.ceil(upper / step) * step
  if (dataMin >= 0) lower = Math.max(0, lower)

  const count = Math.round((upper - lower) / step)
  const ticks = Array.from({ length: count + 1 }, (_, i) => lower + i * step)
  return { domain: [lower, upper], ticks }
}

// Line/area defaults.
export const LINE_PROPS = { type: 'monotone' as const, strokeWidth: 2.5, dot: false }
export const activeDot = (color: string) => ({ r: 5, fill: '#fff', strokeWidth: 2, stroke: color })

// Rounded bar tops.
export const BAR_RADIUS: [number, number, number, number] = [6, 6, 0, 0]

// Vertical area gradient 18% -> 0. Render <defs>{areaGradient('id','#3A5CD8')}</defs>
// and set fill={`url(#id)`} on the <Area>.
export function areaGradient(id: string, color: string): ReactNode {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity={0.18} />
      <stop offset="100%" stopColor={color} stopOpacity={0} />
    </linearGradient>
  )
}

interface TipItem { name?: string; value?: number | string; color?: string; stroke?: string; fill?: string; dataKey?: string }
interface TooltipProps {
  active?: boolean
  payload?: TipItem[]
  label?: string | number
  format?: (v: number) => string
  hideLabel?: boolean
}

// Custom tooltip: white card, soft shadow, ink-800 title, colored dot per row,
// tabular figures. Pass `format` for currency/number formatting.
export function ChartTooltip({ active, payload, label, format, hideLabel }: TooltipProps) {
  if (!active || !payload?.length) return null
  const fmt = (v: number | string | undefined) =>
    format ? format(Number(v ?? 0)) : Number(v ?? 0).toLocaleString('sv-SE')
  return (
    <div className="bg-white rounded-2xl border border-ink-100 shadow-md px-4 py-3 min-w-[8rem]">
      {!hideLabel && label != null && label !== '' && (
        <div className="text-xs font-semibold text-ink-900 mb-1.5">{label}</div>
      )}
      <div className="flex flex-col gap-1">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: p.color || p.stroke || p.fill || '#3A5CD8' }}
            />
            {p.name != null && <span className="text-ink-500">{p.name}</span>}
            <span className="ml-auto font-semibold text-ink-900 tabular">{fmt(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
