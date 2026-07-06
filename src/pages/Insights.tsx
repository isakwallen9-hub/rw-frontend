import { useEffect, useState, useRef, useCallback } from 'react'
import Navbar from '../components/Navbar'
import { fetchWithAuth } from '../utils/fetchWithAuth'
import { useCurrency } from '../contexts/CurrencyContext'
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
const CHART_COLORS = ['#2563eb', '#7c3aed', '#f59e0b', '#10b981', '#ef4444', '#06b6d4']

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

interface Insight {
  id: string
  title: string
  description: string
  severity: Severity
  impact?: number
  suggestedAction?: string
  chartData?: DataPoint[]
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
    border: 'border-l-red-500',
    badge: 'bg-red-100 text-red-700',
    label: 'Kritisk',
    Icon: AlertCircle,
    iconColor: 'text-red-500',
  },
  warning: {
    border: 'border-l-yellow-400',
    badge: 'bg-yellow-100 text-yellow-700',
    label: 'Varning',
    Icon: AlertTriangle,
    iconColor: 'text-yellow-500',
  },
  opportunity: {
    border: 'border-l-green-500',
    badge: 'bg-green-100 text-green-700',
    label: 'Möjlighet',
    Icon: TrendingUp,
    iconColor: 'text-green-600',
  },
  info: {
    border: 'border-l-blue-400',
    badge: 'bg-blue-100 text-blue-700',
    label: 'Info',
    Icon: Info,
    iconColor: 'text-blue-500',
  },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pivotDatasets(datasets: Dataset[]): Record<string, unknown>[] {
  const nonZero = datasets.filter(d => !d.isZeroReference)
  if (!nonZero.length) return []
  const labels = nonZero[0].data.map(p => p.label)
  return labels.map((lbl, i) => {
    const row: Record<string, unknown> = { label: lbl }
    nonZero.forEach(ds => { row[ds.label] = ds.data[i]?.value ?? 0 })
    return row
  })
}

function simpleChartAsFeatured(data: DataPoint[], title = ''): FeaturedChart {
  return {
    title,
    chartType: 'bar',
    datasets: [{ label: 'Värde', data }],
    reason: '',
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="flex flex-col gap-3 animate-pulse">
      <div className="h-4 bg-gray-200/80 rounded-lg w-3/4" />
      <div className="h-4 bg-gray-200/80 rounded-lg w-full" />
      <div className="h-4 bg-gray-200/80 rounded-lg w-5/6" />
      <div className="h-4 bg-gray-200/80 rounded-lg w-2/3" />
    </div>
  )
}

function ChartBlock({ chart, height = 240 }: { chart: FeaturedChart; height?: number }) {
  const pivoted = pivotDatasets(chart.datasets)
  const nonZero = chart.datasets.filter(d => !d.isZeroReference)
  const hasZeroRef = chart.datasets.some(d => d.isZeroReference)

  const sharedProps = {
    data: pivoted,
    margin: { top: 4, right: 8, left: 0, bottom: 0 },
  }

  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
      <XAxis
        dataKey="label"
        tick={{ fontSize: 11, fill: '#9ca3af' }}
        axisLine={false}
        tickLine={false}
      />
      <YAxis
        tick={{ fontSize: 11, fill: '#9ca3af' }}
        axisLine={false}
        tickLine={false}
        width={52}
        tickFormatter={v => Math.abs(Number(v)) >= 1000
          ? `${(Number(v) / 1000).toFixed(0)}k`
          : String(v)
        }
      />
      <Tooltip
        contentStyle={{
          background: 'rgba(255,255,255,0.97)',
          border: '1px solid #e5e7eb',
          borderRadius: 10,
          fontSize: 12,
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
        }}
        formatter={(v: number) => [v.toLocaleString('sv-SE'), undefined]}
      />
      {nonZero.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
      {hasZeroRef && (
        <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1.5} />
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
              radius={[3, 3, 0, 0]}
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
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

function FeaturedChartCard({ chart }: { chart: FeaturedChart }) {
  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-2xl p-5 sm:p-6 shadow-sm hover:shadow-md transition-all">
      <h3 className="font-bold text-gray-900 tracking-tight mb-1">{chart.title}</h3>
      <div className="mt-4">
        <ChartBlock chart={chart} height={240} />
      </div>
      {chart.reason && (
        <div className="mt-3 flex items-start gap-2 text-xs text-gray-400">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{chart.reason}</span>
        </div>
      )}
    </div>
  )
}

function InsightCard({ insight, formatAmount }: { insight: Insight; formatAmount: (n: number) => string }) {
  const s = SEVERITY_STYLES[insight.severity] ?? SEVERITY_STYLES.info
  const inlineChart = insight.chartData?.length
    ? simpleChartAsFeatured(insight.chartData)
    : null

  return (
    <div className={`bg-white/70 backdrop-blur-xl border border-white/50 border-l-4 ${s.border} rounded-2xl p-5 shadow-sm hover:shadow-md transition-all`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <s.Icon className={`w-4 h-4 shrink-0 ${s.iconColor}`} aria-hidden="true" />
          <h3 className="font-bold text-gray-900 tracking-tight text-sm leading-snug">{insight.title}</h3>
        </div>
        <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${s.badge}`}>
          {s.label}
        </span>
      </div>

      <p className="text-sm text-gray-600 leading-relaxed mb-3">{insight.description}</p>

      {insight.impact !== undefined && (
        <p className="text-sm font-semibold text-gray-700 tabular-nums mb-3">
          Påverkan:{' '}
          <span className={insight.impact >= 0 ? 'text-green-600' : 'text-red-600'}>
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
        <div className="bg-blue-50/60 border border-blue-100 rounded-xl px-4 py-3 flex items-start gap-2.5">
          <Lightbulb className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-xs font-semibold text-blue-700 mb-0.5">Rekommenderad åtgärd</p>
            <p className="text-xs text-blue-600 leading-relaxed">{insight.suggestedAction}</p>
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
        setGenerateError({ error: json.error ?? 'Kunde inte tolka frågan.', suggestions: json.suggestions })
      } else if (!res.ok) {
        setGenerateError({ error: json.error ?? 'Något gick fel.' })
      } else {
        const chart = json.data ?? json
        setGeneratedChart({ ...chart, query: q })
        setQuery('')
      }
    } catch {
      setGenerateError({ error: 'Nätverksfel — försök igen.' })
    }
    setGenerating(false)
  }, [query, generating])

  const sortedInsights = data?.insights
    ? [...data.insights].sort(
        (a, b) =>
          (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
      )
    : []

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100 font-sans">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-8 flex flex-col gap-8">

        {/* ── Page header ── */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50/80 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight leading-none">AI-insikter</h1>
            <p className="text-xs text-gray-400 mt-0.5">Genererat utifrån din ekonomidata</p>
          </div>
        </div>

        {/* ── AI Chart Generator ── */}
        <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-2xl p-5 sm:p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Fråga AI om en graf</p>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setGenerateError(null) }}
              onKeyDown={e => e.key === 'Enter' && handleGenerate()}
              placeholder="t.ex. visa Olaplex vs Redken senaste 6 månaderna"
              disabled={generating}
              className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors disabled:opacity-50 bg-white/80 min-h-[44px]"
            />
            <button
              onClick={handleGenerate}
              disabled={!query.trim() || generating}
              aria-label="Generera graf"
              className="px-4 py-3 bg-primary text-white rounded-xl shadow-md shadow-blue-500/20 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40 min-h-[44px] min-w-[44px] flex items-center justify-center"
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
            <p className="mt-3 text-sm text-gray-400 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary animate-pulse" aria-hidden="true" />
              AI:n bygger din graf...
            </p>
          )}

          {generateError && (
            <div className="mt-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <p className="text-sm font-semibold text-red-700 mb-1">{generateError.error}</p>
              {generateError.suggestions?.length ? (
                <ul className="text-xs text-red-600 list-disc list-inside space-y-0.5">
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
          <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-2xl p-5 sm:p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <Sparkles className="w-4 h-4 text-primary" aria-hidden="true" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary">AI-genererad graf</span>
                </div>
                <h3 className="font-bold text-gray-900 tracking-tight">{generatedChart.title || generatedChart.query}</h3>
              </div>
              <button
                onClick={() => setGeneratedChart(null)}
                aria-label="Stäng graf"
                className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white/60 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <ChartBlock chart={generatedChart} height={280} />
            {generatedChart.reason && (
              <div className="mt-3 flex items-start gap-2 text-xs text-gray-400">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{generatedChart.reason}</span>
              </div>
            )}
          </div>
        )}

        {/* ── AI Summary ── */}
        <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-2xl p-5 sm:p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-md shadow-blue-500/20">
              <Sparkles className="w-4 h-4 text-white" aria-hidden="true" />
            </div>
            <h2 className="font-bold text-gray-900 tracking-tight">Läget just nu</h2>
          </div>

          {loading ? (
            <div>
              <p className="text-sm text-gray-400 mb-4 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary animate-pulse" aria-hidden="true" />
                Analyserar din ekonomi...
              </p>
              <Skeleton />
            </div>
          ) : fetchError ? (
            <p className="text-sm text-red-600">{fetchError}</p>
          ) : (
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{data?.summary}</p>
          )}
        </div>

        {/* ── Featured charts ── */}
        {!loading && !fetchError && data?.featuredCharts?.length ? (
          <section>
            <h2 className="text-lg font-bold text-gray-900 tracking-tight mb-4">Utvalda grafer</h2>
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
            <div className="h-5 bg-gray-200/80 rounded-lg w-40 animate-pulse mb-4" />
            {[0, 1].map(i => (
              <div key={i} className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-2xl p-5 mb-5 shadow-sm">
                <div className="h-4 bg-gray-200/80 rounded-lg w-48 animate-pulse mb-4" />
                <div className="h-56 bg-gray-100/80 rounded-xl animate-pulse" />
              </div>
            ))}
          </section>
        )}

        {/* ── Insights list ── */}
        {!loading && !fetchError && sortedInsights.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 tracking-tight">Insikter</h2>
              <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
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
            <div className="h-5 bg-gray-200/80 rounded-lg w-28 animate-pulse mb-4" />
            {[0, 1, 2].map(i => (
              <div key={i} className="bg-white/70 backdrop-blur-xl border border-white/50 border-l-4 border-l-gray-200 rounded-2xl p-5 mb-4 shadow-sm animate-pulse">
                <div className="flex justify-between mb-3">
                  <div className="h-4 bg-gray-200/80 rounded-lg w-48" />
                  <div className="h-5 bg-gray-200/80 rounded-full w-16" />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="h-3 bg-gray-200/80 rounded-lg w-full" />
                  <div className="h-3 bg-gray-200/80 rounded-lg w-5/6" />
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Empty state */}
        {!loading && !fetchError && !sortedInsights.length && !data?.featuredCharts?.length && (
          <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-2xl p-10 text-center shadow-sm">
            <Sparkles className="w-8 h-8 text-gray-300 mx-auto mb-3" aria-hidden="true" />
            <p className="text-sm text-gray-400">Inga insikter ännu — importera mer data för att aktivera AI-analysen.</p>
          </div>
        )}

      </div>
    </div>
  )
}
