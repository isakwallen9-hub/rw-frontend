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
    <div className="bg-white rounded-xl border border-ink-100 shadow-[0_8px_24px_rgba(26,25,32,0.12)] px-3.5 py-2.5 min-w-[8rem]">
      {!hideLabel && label != null && label !== '' && (
        <div className="text-xs font-semibold text-ink-800 mb-1.5">{label}</div>
      )}
      <div className="flex flex-col gap-1">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: p.color || p.stroke || p.fill || '#3A5CD8' }}
            />
            {p.name != null && <span className="text-ink-500">{p.name}</span>}
            <span className="ml-auto font-semibold text-ink-800 tabular">{fmt(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
