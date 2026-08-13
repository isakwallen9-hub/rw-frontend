import { useEffect, useState, useRef, useCallback } from 'react'
import { fetchWithAuth } from '../utils/fetchWithAuth'
import { useCurrency } from '../contexts/CurrencyContext'
import { ChartTooltip } from '../components/chart'
import { EmptyState } from '../components/EmptyState'
import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart, Bar,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
  Legend, ReferenceLine,
} from 'recharts'
import {
  Sparkles, Info, X, Send,
  AlertTriangle, AlertCircle, TrendingUp,
  Lightbulb,
} from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL as string
const CHART_COLORS = ['#3A5CD8', '#0E9C6B', '#C9821F', '#7C5BD9', '#CE4646']

// ─── Types ───────────────────────────────────────────────────────────────────

type Severity = 'critical' | 'warning' | 'opportunity' | 'info'
type ChartType = 'line' | 'bar'

interface DataPoint {
  label: string
  value: number
}

interface Dataset {
  label: string
  data: DataPoint[]
  isZeroReference?: boolean
}

interface FeaturedChart {
  title: string
  chartType: ChartType
  datasets: Dataset[]
  reason: string
}

interface ChartDataV2 {
  labels: string[]
  datasets: Array<{
    label: string
    data: Array<number | DataPoint>
    isZeroReference?: boolean
  }>
}

interface Insight {
  id: string
  title: string
  description: string
  severity: Severity
  impact?: number
  suggestedAction?: string
  chartData?: DataPoint[] | ChartDataV2
}

interface InsightsData {
  summary: string
  featuredCharts: FeaturedChart[]
  insights: Insight[]
}

interface GeneratedChart extends FeaturedChart {
  query: string
}

interface GenerateError {
  error: string
  suggestions?: string[]
}

// ─── Config ──────────────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, opportunity: 2, info: 3 }

const SEVERITY_STYLES: Record<Severity, {
  border: string
  badge: string
  label: string
  Icon: React.ElementType
  iconColor: string
}> = {
  critical: {
    border: 'border-l-negative-500',
    badge: 'bg-negative-100 text-negative-700',
    label: 'Kritisk',
    Icon: AlertCircle,
    iconColor: 'text-negative-600',
  },
  warning: {
    border: 'border-l-caution-400',
    badge: 'bg-caution-100 text-caution-700',
    label: 'Varning',
    Icon: AlertTriangle,
    iconColor: 'text-caution-500',
  },
  opportunity: {
    border: 'border-l-positive-500',
    badge: 'bg-positive-100 text-positive-700',
    label: 'Möjlighet',
    Icon: TrendingUp,
    iconColor: 'text-positive-600',
  },
  info: {
    border: 'border-l-brand-400',
    badge: 'bg-brand-100 text-brand-700',
    label: 'Info',
    Icon: Info,
    iconColor: 'text-brand-500',
  },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toErrorString(raw: unknown, fallback: string): string {
  if (!raw) return fallback
  if (typeof raw === 'string') return raw || fallback
  if (typeof raw === 'object' && 'message' in raw) return String((raw as { message: unknown }).message) || fallback
  return fallback
}

function pivotDatasets(datasets: Dataset[] | null | undefined): Record<string, unknown>[] {
  if (!datasets?.length) return []
  const nonZero = datasets.filter(d => !d.isZeroReference)
  if (!nonZero.length) return []
  const firstData = nonZero[0]?.data
  if (!firstData?.length) return []
  const labels = firstData.map(p => p.label)
  return labels.map((lbl, i) => {
    const row: Record<string, unknown> = { label: lbl }
    nonZero.forEach(ds => { row[ds.label] = ds.data?.[i]?.value ?? 0 })
    return row
  })
}

function normalizeToDatasets(chartData: DataPoint[] | ChartDataV2 | null | undefined): Dataset[] {
  if (!chartData) return []

  // Old format: [{label, value}, ...]
  if (Array.isArray(chartData)) {
    return chartData.length ? [{ label: 'Värde', data: chartData }] : []
  }

  // New { labels, datasets } format
  const { labels = [], datasets = [] } = chartData
  if (!labels.length || !datasets?.length) return []

  return datasets.map(ds => ({
    label: ds.label ?? '',
    isZeroReference: ds.isZeroReference,
    data: labels.map((lbl, i) => {
      const raw = ds.data?.[i]
      const value = typeof raw === 'number' ? raw : ((raw as DataPoint)?.value ?? 0)
      return { label: lbl, value }
    }),
  }))
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="flex flex-col gap-3 animate-pulse">
      <div className="h-4 bg-ink-200/80 rounded-lg w-3/4" />
      <div className="h-4 bg-ink-200/80 rounded-lg w-full" />
      <div className="h-4 bg-ink-200/80 rounded-lg w-5/6" />
      <div className="h-4 bg-ink-200/80 rounded-lg w-2/3" />
    </div>
  )
}

function ChartBlock({ chart, height = 240 }: { chart: FeaturedChart; height?: number }) {
  const datasets = chart.datasets ?? []
  const pivoted = pivotDatasets(datasets)
  const nonZero = datasets.filter(d => !d.isZeroReference)
  const hasZeroRef = datasets.some(d => d.isZeroReference)

  if (!pivoted.length) {
    return (
      <div className="flex items-center justify-center text-sm text-ink-400" style={{ height }}>
        Ingen grafdata
      </div>
    )
  }

  const sharedProps = {
    data: pivoted,
    margin: { top: 4, right: 8, left: 0, bottom: 0 },
  }

  const axes = (
    <>
      <CartesianGrid strokeDasharray="2 6" stroke="#1A192010" vertical={false} />
      <XAxis
        dataKey="label"
        tick={{ fontSize: 13, fill: '#72717C' }}
        axisLine={false}
        tickLine={false}
      />
      <YAxis
        tick={{ fontSize: 13, fill: '#72717C' }}
        axisLine={false}
        tickLine={false}
        width={52}
        tickFormatter={v => Math.abs(Number(v)) >= 1000
          ? `${(Number(v) / 1000).toFixed(0)}k`
          : String(v)
        }
      />
      <Tooltip content={<ChartTooltip format={(v) => Number(v).toLocaleString('sv-SE')} />} cursor={{ fill: 'rgba(26,25,32,0.04)' }} />
      {nonZero.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
      {hasZeroRef && (
        <ReferenceLine y={0} stroke="#CE4646" strokeDasharray="4 2" strokeWidth={1.5} />
      )}
    </>
  )

  if (chart.chartType === 'bar') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart {...sharedProps}>
          {axes}
          {nonZero.map((ds, i) => (
            <Bar
              key={ds.label}
              dataKey={ds.label}
              fill={CHART_COLORS[i % CHART_COLORS.length]}
              radius={[6, 6, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart {...sharedProps}>
        {axes}
        {nonZero.map((ds, i) => (
          <Line
            key={ds.label}
            type="monotone"
            dataKey={ds.label}
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5, fill: "#fff", strokeWidth: 2 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

function FeaturedChartCard({ chart }: { chart: FeaturedChart }) {
  return (
    <div className="glass rounded-2xl p-5 sm:p-6 shadow-sm hover:shadow-md transition-[transform,box-shadow] duration-250">
      <h3 className="font-bold text-ink-900 tracking-tight mb-1">{chart.title}</h3>
      <div className="mt-4">
        <ChartBlock chart={chart} height={240} />
      </div>
      {chart.reason && (
        <div className="mt-3 flex items-start gap-2 text-xs text-ink-400">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{chart.reason}</span>
        </div>
      )}
    </div>
  )
}

function InsightCard({ insight, formatAmount }: { insight: Insight; formatAmount: (n: number) => string }) {
  const s = SEVERITY_STYLES[insight.severity] ?? SEVERITY_STYLES.info
  const normalizedDatasets = normalizeToDatasets(insight.chartData)
  const inlineChart: FeaturedChart | null = normalizedDatasets.length
    ? { title: '', chartType: 'bar', datasets: normalizedDatasets, reason: '' }
    : null

  return (
    <div className={`glass border-l-4 ${s.border} rounded-2xl p-5 shadow-sm hover:shadow-md transition-[transform,box-shadow] duration-250`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <s.Icon className={`w-4 h-4 shrink-0 ${s.iconColor}`} aria-hidden="true" />
          <h3 className="font-bold text-ink-900 tracking-tight text-sm leading-snug">{insight.title}</h3>
        </div>
        <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${s.badge}`}>
          {s.label}
        </span>
      </div>

      <p className="text-sm text-ink-600 leading-relaxed mb-3">{insight.description}</p>

      {insight.impact !== undefined && (
        <p className="text-sm font-semibold text-ink-700 tabular-nums mb-3">
          Påverkan:{' '}
          <span className={insight.impact >= 0 ? 'text-positive-600' : 'text-negative-600'}>
            {insight.impact >= 0 ? '+' : ''}{formatAmount(insight.impact)}
          </span>
        </p>
      )}

      {inlineChart && (
        <div className="mb-3">
          <ChartBlock chart={inlineChart} height={120} />
        </div>
      )}

      {insight.suggestedAction && (
        <div className="bg-brand-50/60 border border-brand-100 rounded-xl px-4 py-3 flex items-start gap-2.5">
          <Lightbulb className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-xs font-semibold text-brand-700 mb-0.5">Rekommenderad åtgärd</p>
            <p className="text-xs text-brand-600 leading-relaxed">{insight.suggestedAction}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Insights() {
  const { formatAmount } = useCurrency()

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<InsightsData | null>(null)
  const [fetchError, setFetchError] = useState('')

  const [query, setQuery] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatedChart, setGeneratedChart] = useState<GeneratedChart | null>(null)
  const [generateError, setGenerateError] = useState<GenerateError | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchWithAuth(`${API_URL}api/v1/insights`)
      .then(r => r.json())
      .then(json => {
        const d = json.data ?? json
        setData(d)
      })
      .catch(() => setFetchError('Kunde inte hämta insikter. Försök igen.'))
      .finally(() => setLoading(false))
  }, [])

  const handleGenerate = useCallback(async () => {
    const q = query.trim()
    if (!q || generating) return
    setGenerating(true)
    setGeneratedChart(null)
    setGenerateError(null)
    try {
      const res = await fetchWithAuth(`${API_URL}api/v1/insights/generate-chart`, {
        method: 'POST',
        body: JSON.stringify({ query: q }),
      })
      const json = await res.json()
      if (res.status === 422) {
        setGenerateError({
          error: toErrorString(json.error, 'Kunde inte tolka frågan.'),
          suggestions: Array.isArray(json.suggestions) ? json.suggestions : undefined,
        })
      } else if (!res.ok) {
        setGenerateError({ error: toErrorString(json.error, 'Något gick fel.') })
      } else {
        const chart = json.data ?? json
        setGeneratedChart({ ...chart, query: q })
        setQuery('')
      }
    } catch {
      setGenerateError({ error: 'Nätverksfel. Försök igen.' })
    }
    setGenerating(false)
  }, [query, generating])

  const sortedInsights = Array.isArray(data?.insights)
    ? [...data.insights].sort(
        (a, b) =>
          (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
      )
    : []

  return (
    <div className="font-sans">
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-8 flex flex-col gap-8">

        {/* ── Page header ── */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-50/80 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-4xl tracking-tight text-ink-900">AI-insikter</h1>
            <p className="text-xs text-ink-400 mt-0.5">Genererat utifrån din ekonomidata</p>
          </div>
        </div>

        {/* ── AI Chart Generator ── */}
        <div className="glass rounded-2xl p-5 sm:p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-400 mb-3">Fråga AI om en graf</p>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setGenerateError(null) }}
              onKeyDown={e => e.key === 'Enter' && handleGenerate()}
              placeholder="t.ex. visa Olaplex vs Redken senaste 6 månaderna"
              disabled={generating}
              className="flex-1 border border-ink-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors disabled:opacity-50 bg-white/80 min-h-[44px]"
            />
            <button
              onClick={handleGenerate}
              disabled={!query.trim() || generating}
              aria-label="Generera graf"
              className="px-4 py-3 bg-primary text-white rounded-xl shadow-md shadow-brand-500/20 hover:opacity-90 active:scale-[0.98] transition-[transform,box-shadow,background-color,border-color,color,opacity] disabled:opacity-40 min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              {generating ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              ) : (
                <Send className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          </div>

          {generating && (
            <p className="mt-3 text-sm text-ink-400 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary animate-pulse" aria-hidden="true" />
              AI:n bygger din graf...
            </p>
          )}

          {generateError && (
            <div className="mt-3 bg-negative-50 border border-negative-100 rounded-xl px-4 py-3">
              <p className="text-sm font-semibold text-negative-700 mb-1">{String(generateError.error)}</p>
              {generateError.suggestions?.length ? (
                <ul className="text-xs text-negative-600 list-disc list-inside space-y-0.5">
                  {generateError.suggestions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </div>

        {/* ── Generated chart result ── */}
        {generatedChart && (
          <div className="glass rounded-2xl p-5 sm:p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <Sparkles className="w-4 h-4 text-primary" aria-hidden="true" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary">AI-genererad graf</span>
                </div>
                <h3 className="font-bold text-ink-900 tracking-tight">{generatedChart.title || generatedChart.query}</h3>
              </div>
              <button
                onClick={() => setGeneratedChart(null)}
                aria-label="Stäng graf"
                className="p-2 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-white/60 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <ChartBlock chart={generatedChart} height={280} />
            {generatedChart.reason && (
              <div className="mt-3 flex items-start gap-2 text-xs text-ink-400">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{generatedChart.reason}</span>
              </div>
            )}
          </div>
        )}

        {/* ── AI Summary ── */}
        <div className="glass rounded-2xl p-5 sm:p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-md shadow-brand-500/20">
              <Sparkles className="w-4 h-4 text-white" aria-hidden="true" />
            </div>
            <h2 className="text-2xl text-ink-900 tracking-tight">Läget just nu</h2>
          </div>

          {loading ? (
            <div>
              <p className="text-sm text-ink-400 mb-4 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary animate-pulse" aria-hidden="true" />
                Analyserar din ekonomi...
              </p>
              <Skeleton />
            </div>
          ) : fetchError ? (
            <p className="text-sm text-negative-600">{fetchError}</p>
          ) : (
            <p className="text-sm text-ink-700 leading-relaxed whitespace-pre-line">{data?.summary}</p>
          )}
        </div>

        {/* ── Featured charts ── */}
        {!loading && !fetchError && data?.featuredCharts?.length ? (
          <section>
            <h2 className="text-2xl text-ink-900 tracking-tight mb-4">Utvalda grafer</h2>
            <div className="flex flex-col gap-5">
              {data.featuredCharts.map((chart, i) => (
                <FeaturedChartCard key={i} chart={chart} />
              ))}
            </div>
          </section>
        ) : null}

        {/* Loading skeletons for charts */}
        {loading && (
          <section>
            <div className="h-5 skeleton rounded-lg w-40 mb-4" />
            {[0, 1].map(i => (
              <div key={i} className="glass rounded-2xl p-5 mb-5 shadow-sm">
                <div className="h-4 skeleton rounded-lg w-48 mb-4" />
                <div className="h-56 skeleton rounded-xl" />
              </div>
            ))}
          </section>
        )}

        {/* ── Insights list ── */}
        {!loading && !fetchError && sortedInsights.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl text-ink-900 tracking-tight">Insikter</h2>
              <span className="text-xs font-semibold text-ink-400 bg-ink-100 px-2.5 py-1 rounded-full">
                {sortedInsights.length} st
              </span>
            </div>
            <div className="flex flex-col gap-4">
              {sortedInsights.map(insight => (
                <InsightCard key={insight.id} insight={insight} formatAmount={formatAmount} />
              ))}
            </div>
          </section>
        )}

        {/* Loading skeletons for insights */}
        {loading && (
          <section>
            <div className="h-5 skeleton rounded-lg w-28 mb-4" />
            {[0, 1, 2].map(i => (
              <div key={i} className="glass border-l-4 border-l-ink-200 rounded-2xl p-5 mb-4 shadow-sm animate-pulse">
                <div className="flex justify-between mb-3">
                  <div className="h-4 bg-ink-200/80 rounded-lg w-48" />
                  <div className="h-5 bg-ink-200/80 rounded-full w-16" />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="h-3 bg-ink-200/80 rounded-lg w-full" />
                  <div className="h-3 bg-ink-200/80 rounded-lg w-5/6" />
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Empty state */}
        {!loading && !fetchError && !sortedInsights.length && !data?.featuredCharts?.length && (
          <div className="glass rounded-2xl shadow-sm">
            <EmptyState
              icon={<Sparkles />}
              title="Inga insikter ännu"
              hint="Importera mer data så aktiverar AI:n automatiska insikter och grafer."
              action={
                <a href="/import" className="inline-flex items-center min-h-[40px] px-4 rounded-xl bg-brand-600 text-white text-sm font-semibold shadow-sm hover:bg-brand-700 active:scale-[0.98] transition-[transform,background-color] duration-150">
                  Importera data
                </a>
              }
            />
          </div>
        )}

      </div>
    </div>
  )
}
