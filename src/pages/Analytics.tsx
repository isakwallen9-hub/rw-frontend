import { useEffect, useState, useCallback, useMemo } from 'react'
import { Sparkles } from 'lucide-react'
import { fetchWithAuth } from '../utils/fetchWithAuth'
import { useCurrency } from '../contexts/CurrencyContext'
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
  Cell,
} from 'recharts'

const API_URL = import.meta.env.VITE_API_URL as string
const LS_KEY = 'rw_saved_charts'
const MAX_CATS = 5
// Shared categorical order — same index maps to the same colour on every page.
const CAT_COLORS = ['#3A5CD8', '#0E9C6B', '#C9821F', '#7C5BD9', '#CE4646']
const CHIP_PALETTE = [
  { light: 'bg-brand-50 text-brand-700 border-brand-200',          full: '#3A5CD8' },
  { light: 'bg-positive-50 text-positive-700 border-positive-200', full: '#0E9C6B' },
  { light: 'bg-caution-50 text-caution-800 border-caution-200',    full: '#C9821F' },
  { light: 'bg-purple-50 text-purple-700 border-purple-200',       full: '#7C5BD9' },
  { light: 'bg-negative-50 text-negative-700 border-negative-200', full: '#CE4646' },
]
const CATS_COLLAPSED = 8
const MONTH_NAMES = ['Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni', 'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December']
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec']

type GroupBy = 'category' | 'day' | 'week' | 'month'
type ShowType = 'inflow' | 'outflow' | 'net'
type Period = '30d' | '90d' | '6m' | '1y' | 'custom'
type ChartType = 'bar' | 'line'

interface SavedChart {
  id: string
  name: string
  groupBy: GroupBy
  series: ShowType[]
  period: Period
  chartType: ChartType
  customFrom: string
  customTo: string
  selectedCats: string[]
}

interface AnalyticsRow {
  label: string
  inflow?: number
  outflow?: number
  net?: number
  [key: string]: unknown
}

interface SeasonalMonth {
  month: number
  label?: string
  avgInflow: number
  avgOutflow: number
  avgNet: number
}

interface InsightItem {
  type: string
  category?: string
}

interface AiChip {
  id: string
  label: string
  chipType: 'trend_break' | 'seasonal' | 'best_worst'
  category?: string
}

function fmt(amount: number): string {
  return amount.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 })
}

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function exportCsv(rows: AnalyticsRow[], columns: { key: string; label: string }[]) {
  const headers = ['Period/Kategori', ...columns.map(c => c.label)]
  const lines = [
    headers.join(';'),
    ...rows.map(r => [r.label, ...columns.map(c => String(r[c.key] ?? 0))].join(';')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `analys-${toDateInput(new Date())}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

const GROUP_OPTIONS: { label: string; value: GroupBy }[] = [
  { label: 'Kategori', value: 'category' },
  { label: 'Dag', value: 'day' },
  { label: 'Vecka', value: 'week' },
  { label: 'Månad', value: 'month' },
]

const SHOW_OPTIONS: { label: string; value: ShowType }[] = [
  { label: 'Inflöde', value: 'inflow' },
  { label: 'Utflöde', value: 'outflow' },
  { label: 'Netto', value: 'net' },
]

const PERIOD_OPTIONS: { label: string; value: Period }[] = [
  { label: 'Senaste 30 dagar', value: '30d' },
  { label: 'Senaste 90 dagar', value: '90d' },
  { label: 'Senaste 6 månader', value: '6m' },
  { label: 'Senaste 1 år', value: '1y' },
  { label: 'Anpassat', value: 'custom' },
]

const SERIES_COLOR: Record<ShowType, string> = {
  inflow: '#3A5CD8',
  outflow: '#CE4646',
  net: '#0E9C6B',
}

const SHOW_LABEL: Record<ShowType, string> = {
  inflow: 'Inflöde',
  outflow: 'Utflöde',
  net: 'Netto',
}

function parseAnalyticsData(json: unknown): { label: string; value?: number }[] {
  if (!json || typeof json !== 'object') return []
  const j = json as Record<string, unknown>
  const inner = j.data
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    const nested = (inner as Record<string, unknown>).data
    if (Array.isArray(nested)) return nested as { label: string; value?: number }[]
  }
  if (Array.isArray(inner)) return inner as { label: string; value?: number }[]
  if (Array.isArray(j)) return j as { label: string; value?: number }[]
  return []
}

function loadSaved(): SavedChart[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') } catch { return [] }
}

function saveTo(chart: SavedChart) {
  const existing = loadSaved().filter(c => c.id !== chart.id)
  localStorage.setItem(LS_KEY, JSON.stringify([chart, ...existing]))
}

function deleteSaved(id: string) {
  localStorage.setItem(LS_KEY, JSON.stringify(loadSaved().filter(c => c.id !== id)))
}

function computePrevDates(period: Period, customFrom: string, customTo: string) {
  const { fromISO, toISO } = computeDates(period, customFrom, customTo)
  const duration = new Date(toISO).getTime() - new Date(fromISO).getTime()
  const prevFrom = new Date(new Date(fromISO).getTime() - duration)
  const prevTo   = new Date(new Date(toISO).getTime()  - duration)
  return {
    fromISO: prevFrom.toISOString().split('T')[0] + 'T00:00:00Z',
    toISO:   prevTo.toISOString().split('T')[0]   + 'T00:00:00Z',
  }
}

function computeDates(period: Period, customFrom: string, customTo: string) {
  const now = new Date()
  let fromDate: Date
  if (period === 'custom') {
    fromDate = new Date(customFrom)
  } else if (period === '30d') {
    fromDate = new Date(now.getTime() - 30 * 86400000)
  } else if (period === '90d') {
    fromDate = new Date(now.getTime() - 90 * 86400000)
  } else if (period === '6m') {
    fromDate = new Date(now); fromDate.setMonth(fromDate.getMonth() - 6)
  } else {
    fromDate = new Date(now); fromDate.setFullYear(fromDate.getFullYear() - 1)
  }
  const toDate = period === 'custom' ? new Date(customTo) : now
  return {
    fromISO: fromDate.toISOString().split('T')[0] + 'T00:00:00Z',
    toISO: toDate.toISOString().split('T')[0] + 'T00:00:00Z',
  }
}

export default function Analytics() {
  const { formatAmount } = useCurrency()
  const today = toDateInput(new Date())

  const [groupBy, setGroupBy] = useState<GroupBy>('month')
  const [series, setSeries] = useState<ShowType[]>(['inflow'])
  const [period, setPeriod] = useState<Period>('1y')
  const [chartType, setChartType] = useState<ChartType>('bar')
  const [customFrom, setCustomFrom] = useState(toDateInput(new Date(Date.now() - 30 * 86400000)))
  const [customTo, setCustomTo] = useState(today)

  const [categories, setCategories] = useState<string[]>([])
  const [selectedCats, setSelectedCats] = useState<string[]>([])

  const [seasonalData, setSeasonalData] = useState<SeasonalMonth[]>([])
  const [seasonalLoading, setSeasonalLoading] = useState(true)
  const [seasonalError, setSeasonalError] = useState('')
  const [seasonalMetric, setSeasonalMetric] = useState<ShowType>('net')
  const [seasonalCategory, setSeasonalCategory] = useState('')
  const [seasonalCategoryB, setSeasonalCategoryB] = useState('')
  const [seasonalDataB, setSeasonalDataB] = useState<SeasonalMonth[]>([])
  const [seasonalLoadingB, setSeasonalLoadingB] = useState(false)

  const [rows, setRows] = useState<AnalyticsRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [savedCharts, setSavedCharts] = useState<SavedChart[]>(loadSaved)
  const [saveName, setSaveName] = useState('')
  const [saveOpen, setSaveOpen] = useState(false)
  const [showAllCats, setShowAllCats] = useState(false)

  // Period comparison state
  const [compareMode, setCompareMode] = useState(false)
  const [periodAFrom, setPeriodAFrom] = useState(toDateInput(new Date(Date.now() - 60 * 86400000)))
  const [periodATo, setPeriodATo] = useState(toDateInput(new Date(Date.now() - 30 * 86400000)))
  const [periodBFrom, setPeriodBFrom] = useState(toDateInput(new Date(Date.now() - 30 * 86400000)))
  const [periodBTo, setPeriodBTo] = useState(today)
  const [compareRows, setCompareRows] = useState<{ label: string; a: number; b: number }[]>([])
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareError, setCompareError] = useState('')
  const [summaryTotals, setSummaryTotals] = useState<{ inflow: number; outflow: number } | null>(null)
  const [trends, setTrends] = useState<{ label: string; pct: number }[]>([])
  const [rankData, setRankData] = useState<{ label: string; value: number }[]>([])
  const [aiChips, setAiChips] = useState<AiChip[]>([])

  // Fetch available categories on mount — abort on unmount
  useEffect(() => {
    const controller = new AbortController()
    fetchWithAuth(`${API_URL}api/v1/analytics/categories`, { signal: controller.signal })
      .then(r => r.json())
      .then(json => {
        if (controller.signal.aborted) return
        const cats = Array.isArray(json?.data?.categories) ? json.data.categories
                   : Array.isArray(json?.data)             ? json.data
                   : []
        setCategories(cats)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  // Fetch AI insights on mount to generate suggestion chips
  useEffect(() => {
    const controller = new AbortController()
    fetchWithAuth(`${API_URL}api/v1/insights`, { signal: controller.signal })
      .then(r => r.json())
      .then(json => {
        if (controller.signal.aborted) return
        const items: InsightItem[] = Array.isArray(json?.data) ? json.data
                                   : Array.isArray(json?.insights) ? json.insights
                                   : []
        const chips: AiChip[] = []
        const trendBreak = items.find(i => i.type === 'TREND_BREAK' && i.category)
        if (trendBreak?.category) {
          chips.push({ id: 'trend', label: `Varför avviker ${trendBreak.category}?`, chipType: 'trend_break', category: trendBreak.category })
        }
        const seasonal = items.find(i => i.type === 'SEASONAL_ANOMALY')
        if (seasonal) {
          chips.push({ id: 'seasonal', label: 'Jämför denna månad mot förra året', chipType: 'seasonal' })
        }
        chips.push({ id: 'best_worst', label: 'Visa min bästa vs sämsta kategori', chipType: 'best_worst' })
        setAiChips(chips)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  // Seasonal A — debounced 300ms, abortable
  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    const timer = setTimeout(async () => {
      setSeasonalLoading(true)
      setSeasonalError('')
      try {
        const params = seasonalCategory ? new URLSearchParams({ category: seasonalCategory }) : null
        const url = params ? `${API_URL}api/v1/analytics/seasonal?${params}` : `${API_URL}api/v1/analytics/seasonal`
        const r = await fetchWithAuth(url, { signal })
        const json = await r.json()
        if (signal.aborted) return
        const months: SeasonalMonth[] = Array.isArray(json?.data) ? json.data
          : Array.isArray(json?.data?.months) ? json.data.months : []
        setSeasonalData(months)
      } catch {
        if (!signal.aborted) setSeasonalError('Kunde inte hämta säsongsdata.')
      } finally {
        if (!signal.aborted) setSeasonalLoading(false)
      }
    }, 300)
    return () => { clearTimeout(timer); controller.abort() }
  }, [seasonalCategory])

  // Seasonal B comparison — debounced 300ms, abortable
  useEffect(() => {
    if (!seasonalCategoryB) { setSeasonalDataB([]); return }
    const controller = new AbortController()
    const { signal } = controller
    const timer = setTimeout(async () => {
      setSeasonalLoadingB(true)
      try {
        const url = `${API_URL}api/v1/analytics/seasonal?${new URLSearchParams({ category: seasonalCategoryB })}`
        const r = await fetchWithAuth(url, { signal })
        const json = await r.json()
        if (signal.aborted) return
        const months: SeasonalMonth[] = Array.isArray(json?.data) ? json.data
          : Array.isArray(json?.data?.months) ? json.data.months : []
        setSeasonalDataB(months)
      } catch {}
      finally { if (!signal.aborted) setSeasonalLoadingB(false) }
    }, 300)
    return () => { clearTimeout(timer); controller.abort() }
  }, [seasonalCategoryB])

  const toggleCat = (cat: string) => {
    setSelectedCats(prev =>
      prev.includes(cat)
        ? prev.filter(c => c !== cat)
        : prev.length < MAX_CATS ? [...prev, cat] : prev
    )
  }

  const toggleSeries = (s: ShowType) => {
    setSeries(prev =>
      prev.includes(s) ? (prev.length > 1 ? prev.filter(x => x !== s) : prev) : [...prev, s]
    )
  }

  const catMode = selectedCats.length > 0

  // Build per-category series definitions (stable keys: cat_0, cat_1, ...)
  const catSeriesDef = selectedCats.map((cat, idx) => ({
    key: `cat_${idx}`,
    label: cat,
    color: CAT_COLORS[idx],
  }))

  // Single debounced effect for chart data + summary — sequential, abortable
  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    const timer = setTimeout(async () => {
      const { fromISO, toISO } = computeDates(period, customFrom, customTo)

      // ── Chart data ──────────────────────────────────────────────────────────
      setLoading(true)
      setError('')
      try {
        if (selectedCats.length > 0) {
          const metric = series[0]
          const results = await Promise.all(
            selectedCats.map(async (cat, idx) => {
              const params = new URLSearchParams({ groupBy, metric, from: fromISO, to: toISO, category: cat })
              const r = await fetchWithAuth(`${API_URL}api/v1/analytics/compare?${params}`, { signal })
              const json = await r.json()
              return { key: `cat_${idx}`, data: parseAnalyticsData(json) }
            })
          )
          if (signal.aborted) return
          const merged: Record<string, AnalyticsRow> = {}
          for (const { key, data } of results) {
            for (const row of data) {
              if (!merged[row.label]) merged[row.label] = { label: row.label }
              merged[row.label][key] = row.value ?? 0
            }
          }
          setRows(Object.values(merged))
        } else {
          const results = await Promise.all(
            series.map(async metric => {
              const params = new URLSearchParams({ groupBy, metric, from: fromISO, to: toISO })
              const r = await fetchWithAuth(`${API_URL}api/v1/analytics/compare?${params}`, { signal })
              const json = await r.json()
              return { metric, data: parseAnalyticsData(json) }
            })
          )
          if (signal.aborted) return
          const merged: Record<string, AnalyticsRow> = {}
          for (const { metric, data } of results) {
            for (const row of data) {
              if (!merged[row.label]) merged[row.label] = { label: row.label }
              merged[row.label][metric] = row.value ?? 0
            }
          }
          setRows(Object.values(merged))
        }
      } catch {
        if (!signal.aborted) setError('Kunde inte hämta analysdata. Kontrollera din anslutning och försök igen.')
      } finally {
        if (!signal.aborted) setLoading(false)
      }

      // ── Summary totals (sequential — runs after chart data) ─────────────────
      if (signal.aborted) return
      const sumValues = (data: { value?: number }[]) => data.reduce((s, r) => s + (r.value ?? 0), 0)
      const fetchMetric = async (metric: 'inflow' | 'outflow'): Promise<number> => {
        if (selectedCats.length > 0) {
          const sums = await Promise.all(
            selectedCats.map(async cat => {
              const params = new URLSearchParams({ groupBy, metric, from: fromISO, to: toISO, category: cat })
              const r = await fetchWithAuth(`${API_URL}api/v1/analytics/compare?${params}`, { signal })
              return sumValues(parseAnalyticsData(await r.json()))
            })
          )
          return sums.reduce((a, b) => a + b, 0)
        }
        const params = new URLSearchParams({ groupBy, metric, from: fromISO, to: toISO })
        const r = await fetchWithAuth(`${API_URL}api/v1/analytics/compare?${params}`, { signal })
        return sumValues(parseAnalyticsData(await r.json()))
      }
      try {
        const [inflow, outflow] = await Promise.all([fetchMetric('inflow'), fetchMetric('outflow')])
        if (!signal.aborted) setSummaryTotals({ inflow, outflow })
      } catch {
        // summary errors are non-fatal
      }

      // ── Trend analysis — current vs previous period, per category ────────────
      if (signal.aborted) return
      try {
        const prevDates = computePrevDates(period, customFrom, customTo)
        const trendMetric = series[0]
        const fetchCatTotals = async (from: string, to: string) => {
          const params = new URLSearchParams({ groupBy: 'category', metric: trendMetric, from, to })
          const r = await fetchWithAuth(`${API_URL}api/v1/analytics/compare?${params}`, { signal })
          const data = parseAnalyticsData(await r.json())
          return new Map(data.map(d => [d.label, d.value ?? 0]))
        }
        const [currMap, prevMap] = await Promise.all([
          fetchCatTotals(fromISO, toISO),
          fetchCatTotals(prevDates.fromISO, prevDates.toISO),
        ])
        if (signal.aborted) return
        const items: { label: string; pct: number }[] = []
        for (const [label, curr] of currMap) {
          const prev = prevMap.get(label)
          if (prev != null && prev !== 0) {
            items.push({ label, pct: ((curr - prev) / Math.abs(prev)) * 100 })
          }
        }
        items.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
        setTrends(items.slice(0, 3))
        setRankData(
          [...currMap.entries()]
            .map(([label, value]) => ({ label, value }))
            .filter(d => d.value > 0)
            .sort((a, b) => b.value - a.value)
            .slice(0, 5)
        )
      } catch {
        // trend errors are non-fatal
      }
    }, 500)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [groupBy, series, period, customFrom, customTo, selectedCats])

  const fetchCompare = useCallback(() => {
    if (!compareMode) return
    setCompareLoading(true)
    setCompareError('')
    const metric = series[0]
    const fromAISO = periodAFrom + 'T00:00:00Z'
    const toAISO   = periodATo   + 'T00:00:00Z'
    const fromBISO = periodBFrom + 'T00:00:00Z'
    const toBISO   = periodBTo   + 'T00:00:00Z'
    Promise.all([
      fetchWithAuth(`${API_URL}api/v1/analytics/compare?${new URLSearchParams({ groupBy, metric, from: fromAISO, to: toAISO })}`)
        .then(r => r.json())
        .then(json => Array.isArray(json?.data?.data) ? json.data.data : []),
      fetchWithAuth(`${API_URL}api/v1/analytics/compare?${new URLSearchParams({ groupBy, metric, from: fromBISO, to: toBISO })}`)
        .then(r => r.json())
        .then(json => Array.isArray(json?.data?.data) ? json.data.data : []),
    ])
      .then(([dataA, dataB]) => {
        const merged: Record<string, { label: string; a: number; b: number }> = {}
        for (const row of dataA) {
          if (!merged[row.label]) merged[row.label] = { label: row.label, a: 0, b: 0 }
          merged[row.label].a = row.value ?? 0
        }
        for (const row of dataB) {
          if (!merged[row.label]) merged[row.label] = { label: row.label, a: 0, b: 0 }
          merged[row.label].b = row.value ?? 0
        }
        setCompareRows(Object.values(merged))
      })
      .catch(() => setCompareError('Kunde inte hämta jämförelsedata. Försök igen.'))
      .finally(() => setCompareLoading(false))
  }, [compareMode, groupBy, series, periodAFrom, periodATo, periodBFrom, periodBTo])

  useEffect(() => { fetchCompare() }, [fetchCompare])

  const compareSummary = useMemo(() => {
    const totalA = compareRows.reduce((s, r) => s + r.a, 0)
    const totalB = compareRows.reduce((s, r) => s + r.b, 0)
    const diff = totalB - totalA
    const pct = totalA !== 0 ? ((totalB - totalA) / Math.abs(totalA)) * 100 : null
    return { totalA, totalB, diff, pct }
  }, [compareRows])

  const handleSave = () => {
    if (!saveName.trim()) return
    const chart: SavedChart = {
      id: Date.now().toString(),
      name: saveName.trim(),
      groupBy, series, period, chartType, customFrom, customTo, selectedCats,
    }
    saveTo(chart)
    setSavedCharts(loadSaved())
    setSaveName('')
    setSaveOpen(false)
  }

  const handleLoad = (c: SavedChart) => {
    setGroupBy(c.groupBy)
    setSeries(c.series)
    setPeriod(c.period)
    setChartType(c.chartType)
    setCustomFrom(c.customFrom)
    setCustomTo(c.customTo)
    setSelectedCats(c.selectedCats ?? [])
  }

  const handleDelete = (id: string) => {
    deleteSaved(id)
    setSavedCharts(loadSaved())
  }

  const commonAxisProps = {
    tick: { fontSize: 11, fill: '#8B8A93' },
    axisLine: false as const,
    tickLine: false as const,
  }

  // Seasonal derived values
  const getSeasonalValue = (m: SeasonalMonth) =>
    seasonalMetric === 'inflow' ? m.avgInflow : seasonalMetric === 'outflow' ? m.avgOutflow : m.avgNet
  const seasonalAvg = seasonalData.length
    ? seasonalData.reduce((s, m) => s + getSeasonalValue(m), 0) / seasonalData.length
    : 0
  const seasonalChartData = seasonalData.map(m => {
    const mb = seasonalDataB.find(d => d.month === m.month)
    return {
      label: m.label ?? MONTH_SHORT[(m.month - 1) % 12],
      fullLabel: m.label ?? MONTH_NAMES[(m.month - 1) % 12],
      value: getSeasonalValue(m),
      valueB: mb ? getSeasonalValue(mb) : undefined,
      avgInflow: m.avgInflow,
      avgOutflow: m.avgOutflow,
      avgNet: m.avgNet,
    }
  })
  const hasSeasonalCompare = seasonalCategoryB !== '' && seasonalDataB.length > 0
  const bestMonth = seasonalChartData.length
    ? seasonalChartData.reduce((a, b) => b.avgNet > a.avgNet ? b : a)
    : null
  const worstMonth = seasonalChartData.length
    ? seasonalChartData.reduce((a, b) => b.avgNet < a.avgNet ? b : a)
    : null
  const overallAvgNet = seasonalData.length
    ? seasonalData.reduce((s, m) => s + m.avgNet, 0) / seasonalData.length
    : 0

  const exportColumns = catMode
    ? catSeriesDef.map(cs => ({ key: cs.key, label: cs.label }))
    : series.map(s => ({ key: s, label: SHOW_LABEL[s] }))

  const renderChart = () => (
    <ResponsiveContainer width="100%" height={300}>
      {chartType === 'bar' ? (
        <BarChart data={rows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#EEEDEC" />
          <XAxis dataKey="label" {...commonAxisProps} />
          <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} {...commonAxisProps} width={50} />
          <Tooltip formatter={(v: unknown) => fmt(Number(v ?? 0))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {catMode
            ? catSeriesDef.map(cs => <Bar key={cs.key} dataKey={cs.key} name={cs.label} fill={cs.color} radius={[4, 4, 0, 0]} />)
            : series.map(s => <Bar key={s} dataKey={s} name={SHOW_LABEL[s]} fill={SERIES_COLOR[s]} radius={[4, 4, 0, 0]} />)
          }
        </BarChart>
      ) : (
        <LineChart data={rows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#EEEDEC" />
          <XAxis dataKey="label" {...commonAxisProps} />
          <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} {...commonAxisProps} width={50} />
          <Tooltip formatter={(v: unknown) => fmt(Number(v ?? 0))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {catMode
            ? catSeriesDef.map(cs => <Line key={cs.key} type="monotone" dataKey={cs.key} name={cs.label} stroke={cs.color} strokeWidth={2} dot={false} />)
            : series.map(s => <Line key={s} type="monotone" dataKey={s} name={SHOW_LABEL[s]} stroke={SERIES_COLOR[s]} strokeWidth={2} dot={false} />)
          }
        </LineChart>
      )}
    </ResponsiveContainer>
  )

  return (
    <div className="font-sans">
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-10">

        <h1 className="text-4xl tracking-tight text-ink-900 mb-1">Analys</h1>
        <p className="text-sm text-ink-500 mb-6">Jämför och filtrera din ekonomidata.</p>

        {/* Saved charts */}
        {savedCharts.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-medium text-ink-500 mb-2">Sparade grafer</p>
            <div className="flex flex-wrap gap-2">
              {savedCharts.map(c => (
                <div key={c.id} className="flex items-center gap-1 bg-white border border-ink-200 rounded-lg px-3 py-1.5 text-sm">
                  <button onClick={() => handleLoad(c)} className="text-ink-700 hover:text-brand-600 font-medium">
                    {c.name}
                  </button>
                  <button onClick={() => handleDelete(c.id)} className="text-ink-300 hover:text-negative-400 ml-1 leading-none">×</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI-föreslagna jämförelser */}
        {aiChips.length > 0 && (
          <div className="mb-5">
            <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-2.5">AI föreslår</p>
            <div className="flex flex-wrap gap-2">
              {aiChips.map(chip => (
                <button
                  key={chip.id}
                  onClick={() => {
                    if (chip.chipType === 'trend_break' && chip.category) {
                      setSelectedCats([chip.category])
                      window.dispatchEvent(new CustomEvent('rw:ai:open', { detail: { question: `Varför avviker kategorin "${chip.category}"?` } }))
                    } else if (chip.chipType === 'seasonal') {
                      const now = new Date()
                      const thisStart = new Date(now.getFullYear(), now.getMonth(), 1)
                      const thisEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
                      const prevStart = new Date(now.getFullYear() - 1, now.getMonth(), 1)
                      const prevEnd = new Date(now.getFullYear() - 1, now.getMonth() + 1, 0)
                      setCompareMode(true)
                      setPeriodAFrom(toDateInput(prevStart))
                      setPeriodATo(toDateInput(prevEnd))
                      setPeriodBFrom(toDateInput(thisStart))
                      setPeriodBTo(toDateInput(thisEnd))
                      window.dispatchEvent(new CustomEvent('rw:ai:open', { detail: { question: 'Jämför denna månads kassaflöde mot samma period förra året.' } }))
                    } else if (chip.chipType === 'best_worst') {
                      const best = rankData[0]?.label
                      const worst = rankData[rankData.length - 1]?.label
                      if (best && worst && best !== worst) setSelectedCats([best, worst])
                      window.dispatchEvent(new CustomEvent('rw:ai:open', { detail: { question: 'Jämför min bästa och sämsta intäktskategori.' } }))
                    }
                  }}
                  className="bg-white/40 backdrop-blur border border-ink-200/60 rounded-xl px-3.5 py-2 flex items-center gap-2 text-sm font-medium text-ink-700 hover:bg-white/60 hover:border-brand-300 hover:text-brand-700 transition-all cursor-pointer min-h-[44px]"
                >
                  <Sparkles className="w-3.5 h-3.5 text-brand-500 shrink-0" aria-hidden="true" />
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="glass rounded-2xl shadow-sm p-5 mb-4">
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-3 sm:gap-5 items-end">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium text-ink-500 mb-1.5">Gruppera efter</label>
              <select value={groupBy} onChange={e => setGroupBy(e.target.value as GroupBy)}
                className="w-full border border-ink-200 rounded-lg px-3 py-2.5 text-sm text-ink-700 outline-none focus:border-brand-500 bg-white min-h-[44px]">
                {GROUP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium text-ink-500 mb-1.5">
                {catMode ? 'Visa metric' : 'Visa'}
              </label>
              <div className="flex gap-1">
                {SHOW_OPTIONS.map(o => (
                  <button key={o.value}
                    onClick={() => catMode ? setSeries([o.value]) : toggleSeries(o.value)}
                    className={`flex-1 sm:flex-none px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors min-h-[44px] ${
                      (catMode ? series[0] === o.value : series.includes(o.value))
                        ? 'text-white border-transparent'
                        : 'bg-white text-ink-500 border-ink-200 hover:border-ink-300'
                    }`}
                    style={(catMode ? series[0] === o.value : series.includes(o.value))
                      ? { backgroundColor: SERIES_COLOR[o.value], borderColor: SERIES_COLOR[o.value] }
                      : {}}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-500 mb-1.5">Period</label>
              <select value={period} onChange={e => setPeriod(e.target.value as Period)}
                className="w-full border border-ink-200 rounded-lg px-3 py-2.5 text-sm text-ink-700 outline-none focus:border-brand-500 bg-white min-h-[44px]">
                {PERIOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-500 mb-1.5">Graftyp</label>
              <div className="flex gap-1">
                {(['bar', 'line'] as ChartType[]).map(t => (
                  <button key={t} onClick={() => setChartType(t)}
                    className={`flex-1 sm:flex-none px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors min-h-[44px] ${
                      chartType === t ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-ink-500 border-ink-200 hover:border-ink-300'
                    }`}>
                    {t === 'bar' ? 'Stapel' : 'Linje'}
                  </button>
                ))}
              </div>
            </div>

            {period === 'custom' && (
              <div className="col-span-2 sm:col-span-1 flex flex-col sm:flex-row items-start sm:items-center gap-2">
                <div className="w-full sm:w-auto">
                  <label className="block text-xs font-medium text-ink-500 mb-1.5">Från</label>
                  <input type="date" value={customFrom} max={customTo}
                    onChange={e => setCustomFrom(e.target.value)}
                    className="w-full border border-ink-200 rounded-lg px-3 py-2.5 text-sm text-ink-700 outline-none focus:border-brand-500 min-h-[44px]" />
                </div>
                <div className="w-full sm:w-auto">
                  <label className="block text-xs font-medium text-ink-500 mb-1.5">Till</label>
                  <input type="date" value={customTo} min={customFrom} max={today}
                    onChange={e => setCustomTo(e.target.value)}
                    className="w-full border border-ink-200 rounded-lg px-3 py-2.5 text-sm text-ink-700 outline-none focus:border-brand-500 min-h-[44px]" />
                </div>
              </div>
            )}
          </div>

          {/* Period comparison date pickers */}
          {compareMode && (
            <div className="mt-4 pt-4 border-t border-ink-100 flex flex-col sm:flex-row flex-wrap gap-4 sm:gap-6">
              <div>
                <p className="text-xs font-semibold text-brand-600 mb-1.5">Period A</p>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                  <input type="date" value={periodAFrom} max={periodATo}
                    onChange={e => setPeriodAFrom(e.target.value)}
                    className="w-full sm:w-auto border border-ink-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-brand-500 min-h-[44px]" />
                  <span className="text-xs text-ink-400 hidden sm:inline">till</span>
                  <input type="date" value={periodATo} min={periodAFrom} max={today}
                    onChange={e => setPeriodATo(e.target.value)}
                    className="w-full sm:w-auto border border-ink-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-brand-500 min-h-[44px]" />
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-purple-600 mb-1.5">Period B</p>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                  <input type="date" value={periodBFrom} max={periodBTo}
                    onChange={e => setPeriodBFrom(e.target.value)}
                    className="w-full sm:w-auto border border-ink-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-brand-500 min-h-[44px]" />
                  <span className="text-xs text-ink-400 hidden sm:inline">till</span>
                  <input type="date" value={periodBTo} min={periodBFrom} max={today}
                    onChange={e => setPeriodBTo(e.target.value)}
                    className="w-full sm:w-auto border border-ink-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-brand-500 min-h-[44px]" />
                </div>
              </div>
            </div>
          )}

          {/* Category multi-select chips */}
          {categories.length > 0 && (
            <div className="mt-4 pt-4 border-t border-ink-100">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink-700">Välj kategorier</span>
                  {selectedCats.length > 0 && (
                    <span className="text-xs bg-brand-100 text-brand-700 font-semibold px-2 py-0.5 rounded-full">
                      {selectedCats.length} valda
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {selectedCats.length >= MAX_CATS && (
                    <span className="text-xs text-caution-600 font-medium">Max {MAX_CATS} valda</span>
                  )}
                  {selectedCats.length > 0 && (
                    <button onClick={() => setSelectedCats([])}
                      className="text-xs text-ink-400 hover:text-ink-600 font-medium transition-colors">
                      Rensa val
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {(showAllCats ? categories : categories.slice(0, CATS_COLLAPSED)).map((cat, catIdx) => {
                  const selIdx = selectedCats.indexOf(cat)
                  const isSelected = selIdx !== -1
                  const isDisabled = !isSelected && selectedCats.length >= MAX_CATS
                  const palette = CHIP_PALETTE[catIdx % CHIP_PALETTE.length]
                  return (
                    <button
                      key={cat}
                      onClick={() => !isDisabled && toggleCat(cat)}
                      disabled={isDisabled}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                        isSelected
                          ? 'text-white border-transparent shadow-sm'
                          : isDisabled
                          ? 'opacity-30 cursor-not-allowed ' + palette.light
                          : palette.light + ' hover:opacity-80'
                      }`}
                      style={isSelected ? { backgroundColor: palette.full, borderColor: palette.full } : {}}
                    >
                      {isSelected && <span className="mr-1 opacity-80">✓</span>}
                      {cat}
                    </button>
                  )
                })}
                {categories.length > CATS_COLLAPSED && (
                  <button
                    onClick={() => setShowAllCats(v => !v)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold border border-dashed border-ink-300 text-ink-500 hover:border-ink-400 hover:text-ink-700 transition-colors"
                  >
                    {showAllCats ? 'Visa färre' : `+${categories.length - CATS_COLLAPSED} fler`}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Summary cards */}
        {summaryTotals !== null && (() => {
          const { inflow, outflow } = summaryTotals
          const net = inflow - outflow
          return (
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="glass rounded-xl px-4 py-4 shadow-sm">
                <p className="text-xs text-ink-400 mb-1">Totalt inflöde</p>
                <p className="text-lg font-bold text-positive-600">{formatAmount(inflow)}</p>
              </div>
              <div className="glass rounded-xl px-4 py-4 shadow-sm">
                <p className="text-xs text-ink-400 mb-1">Totalt utflöde</p>
                <p className="text-lg font-bold text-negative-600">{formatAmount(outflow)}</p>
              </div>
              <div className="glass rounded-xl px-4 py-4 shadow-sm">
                <p className="text-xs text-ink-400 mb-1">Netto</p>
                <p className={`text-lg font-bold ${net >= 0 ? 'text-positive-600' : 'text-negative-600'}`}>
                  {net >= 0 ? '+' : ''}{formatAmount(net)}
                </p>
              </div>
            </div>
          )
        })()}

        {/* Trend analysis */}
        {trends.length > 0 && (
          <div className="glass rounded-xl px-5 py-4 shadow-sm mb-4">
            <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-3">Trender: jämfört med föregående period</p>
            <div className="flex flex-col gap-2">
              {trends.map(t => (
                <div key={t.label} className="flex items-center gap-2 text-sm">
                  <span className={`text-lg leading-none ${t.pct >= 0 ? 'text-positive-500' : 'text-negative-600'}`}>
                    {t.pct >= 0 ? '↑' : '↓'}
                  </span>
                  <span className="font-semibold text-ink-800">{t.label}</span>
                  <span className={`font-bold ${t.pct >= 0 ? 'text-positive-600' : 'text-negative-600'}`}>
                    {t.pct >= 0 ? '+' : ''}{t.pct.toFixed(1)}%
                  </span>
                  <span className="text-ink-400 text-xs">jämfört med förra perioden</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Chart + Category ranking */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4 mb-4">
        <div className="glass rounded-2xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-ink-700">
              {catMode
                ? `${selectedCats.join(', ')}: ${SHOW_LABEL[series[0]]}`
                : series.map(s => SHOW_LABEL[s]).join(' & ')
              }, {PERIOD_OPTIONS.find(p => p.value === period)?.label}
            </p>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setCompareMode(v => !v)}
                className={`text-xs font-medium border px-3 py-1.5 rounded-lg transition-colors ${
                  compareMode
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'border-ink-200 text-ink-600 hover:border-ink-300'
                }`}
              >
                {compareMode ? '× Stäng jämförelse' : 'Jämför perioder'}
              </button>
              {!saveOpen && !compareMode && (
                <button onClick={() => setSaveOpen(true)}
                  className="text-xs font-medium border border-ink-200 text-ink-600 px-3 py-1.5 rounded-lg hover:border-ink-300 transition-colors">
                  Spara graf
                </button>
              )}
              {!compareMode && rows.length > 0 && (
                <button onClick={() => exportCsv(rows, exportColumns)}
                  className="text-xs font-medium border border-ink-200 text-ink-600 px-3 py-1.5 rounded-lg hover:border-ink-300 transition-colors">
                  Exportera CSV
                </button>
              )}
            </div>
          </div>

          {saveOpen && (
            <div className="flex gap-2 items-center mb-4">
              <input
                autoFocus
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setSaveOpen(false) }}
                placeholder="Namn på grafen..."
                className="flex-1 border border-ink-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-brand-500"
              />
              <button onClick={handleSave}
                className="text-xs font-semibold bg-brand-600 text-white px-3 py-1.5 rounded-lg hover:bg-brand-700 transition-colors">
                Spara
              </button>
              <button onClick={() => { setSaveOpen(false); setSaveName('') }}
                className="text-xs text-ink-400 hover:text-ink-600 px-2 py-1.5">
                Avbryt
              </button>
            </div>
          )}

          {compareMode ? (
            compareLoading ? (
              <div className="h-[300px] bg-ink-100 rounded-xl animate-pulse" />
            ) : compareError ? (
              <div className="bg-negative-50 border border-negative-100 text-negative-600 rounded-xl px-5 py-4 text-sm">{compareError}</div>
            ) : compareRows.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-ink-400 text-sm">
                Ingen data. Välj datumintervall för Period A och Period B ovan.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                {chartType === 'bar' ? (
                  <BarChart data={compareRows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EEEDEC" />
                    <XAxis dataKey="label" {...commonAxisProps} />
                    <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} {...commonAxisProps} width={50} />
                    <Tooltip formatter={(v: unknown) => fmt(Number(v ?? 0))} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="a" name="Period A" fill="#3A5CD8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="b" name="Period B" fill="#7C5BD9" radius={[4, 4, 0, 0]} />
                  </BarChart>
                ) : (
                  <LineChart data={compareRows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EEEDEC" />
                    <XAxis dataKey="label" {...commonAxisProps} />
                    <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} {...commonAxisProps} width={50} />
                    <Tooltip formatter={(v: unknown) => fmt(Number(v ?? 0))} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="a" name="Period A" stroke="#3A5CD8" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="b" name="Period B" stroke="#7C5BD9" strokeWidth={2} dot={false} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            )
          ) : loading ? (
            <div className="h-[300px] bg-ink-100 rounded-xl animate-pulse" />
          ) : error ? (
            <div className="bg-negative-50 border border-negative-100 text-negative-600 rounded-xl px-5 py-4 text-sm">{error}</div>
          ) : rows.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-ink-400 text-sm">
              Ingen data tillgänglig för valda filter.
            </div>
          ) : renderChart()}
        </div>

        {/* Category ranking */}
        <div className="glass rounded-2xl shadow-sm p-5 flex flex-col">
          <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-4">
            Topp kategorier: {SHOW_LABEL[series[0]]}
          </p>
          {rankData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-ink-300 text-sm">Ingen data</div>
          ) : (
            <div className="flex flex-col gap-4">
              {rankData.map((item, i) => {
                const max = rankData[0].value
                const pct = max > 0 ? (item.value / max) * 100 : 0
                const medals = ['🥇', '🥈', '🥉']
                return (
                  <div key={item.label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm shrink-0">
                          {i < 3 ? medals[i] : <span className="text-xs font-bold text-ink-400 w-5 inline-block text-center">#{i + 1}</span>}
                        </span>
                        <span className="text-sm text-ink-700 font-medium truncate">{item.label}</span>
                      </div>
                      <span className="text-xs font-semibold text-ink-600 ml-2 shrink-0 whitespace-nowrap">{formatAmount(item.value)}</span>
                    </div>
                    <div className="h-1.5 bg-ink-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: CAT_COLORS[i % CAT_COLORS.length] }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        </div>{/* end grid */}

        {/* Period comparison summary */}
        {compareMode && !compareLoading && !compareError && compareRows.length > 0 && (
          <div className="glass rounded-2xl shadow-sm p-5 mb-4">
            <h3 className="text-sm font-bold text-ink-700 mb-4">
              Sammanfattning: {SHOW_LABEL[series[0]]}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-[11px] text-brand-500 font-semibold uppercase tracking-widest mb-1">Period A</p>
                <p className="text-3xl font-bold tabular text-ink-900">{fmt(compareSummary.totalA)}</p>
                <p className="text-xs text-ink-400 mt-0.5">{periodAFrom} till {periodATo}</p>
              </div>
              <div className="text-center">
                <p className="text-[11px] text-purple-500 font-semibold uppercase tracking-widest mb-1">Period B</p>
                <p className="text-3xl font-bold tabular text-ink-900">{fmt(compareSummary.totalB)}</p>
                <p className="text-xs text-ink-400 mt-0.5">{periodBFrom} till {periodBTo}</p>
              </div>
              <div className="text-center">
                <p className="text-[11px] text-ink-400 font-semibold uppercase tracking-widest mb-1">Förändring</p>
                <p className={`text-2xl font-bold ${compareSummary.diff >= 0 ? 'text-positive-600' : 'text-negative-600'}`}>
                  {compareSummary.diff >= 0 ? '+' : ''}{fmt(compareSummary.diff)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[11px] text-ink-400 font-semibold uppercase tracking-widest mb-1">Förändring %</p>
                <p className={`text-2xl font-bold ${(compareSummary.pct ?? 0) >= 0 ? 'text-positive-600' : 'text-negative-600'}`}>
                  {compareSummary.pct !== null
                    ? `${compareSummary.pct >= 0 ? '+' : ''}${compareSummary.pct.toFixed(1)}%`
                    : '—'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        {!loading && !error && rows.length > 0 && (
          <div className="glass rounded-2xl shadow-sm overflow-hidden mb-8">
            <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
              <p className="text-sm font-semibold text-ink-700">Datatabell</p>
              <button
                onClick={() => exportCsv(rows, exportColumns)}
                className="text-xs font-medium border border-ink-200 text-ink-600 px-3 py-1.5 rounded-lg hover:border-ink-300 transition-colors"
              >
                Exportera CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-base min-w-[360px]">
                <thead>
                  <tr className="border-b border-white/40 text-xs text-ink-400 bg-white/30">
                    <th className="text-left px-5 py-4 font-medium">Period / Kategori</th>
                    {exportColumns.map(col => (
                      <th key={col.key} className="text-right px-5 py-4 font-medium">{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className={i !== 0 ? 'border-t border-white/40' : ''}>
                      <td className="px-5 py-4 text-ink-700">{row.label}</td>
                      {exportColumns.map(col => (
                        <td key={col.key} className={`px-5 py-4 text-right font-medium ${
                          catMode
                            ? 'text-ink-800'
                            : col.key === 'net'
                            ? Number(row[col.key] ?? 0) >= 0 ? 'text-positive-600' : 'text-negative-600'
                            : col.key === 'outflow' ? 'text-negative-600' : 'text-brand-600'
                        }`}>
                          {fmt(Number(row[col.key] ?? 0))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-ink-200 bg-ink-50/80">
                    <td className="px-5 py-4 text-sm font-bold text-ink-900">Totalt</td>
                    {exportColumns.map(col => {
                      const total = rows.reduce((s, r) => s + Number(r[col.key] ?? 0), 0)
                      return (
                        <td key={col.key} className={`px-5 py-4 text-right text-sm font-bold ${
                          catMode
                            ? 'text-ink-900'
                            : col.key === 'net'
                            ? total >= 0 ? 'text-positive-700' : 'text-negative-600'
                            : col.key === 'outflow' ? 'text-negative-600' : 'text-brand-700'
                        }`}>
                          {fmt(total)}
                        </td>
                      )
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Seasonal analysis */}
        <div className="mt-8">
          <h2 className="text-2xl text-ink-900 mb-1">Säsongsmönster</h2>
          <p className="text-sm text-ink-500 mb-4">Genomsnittliga värden per månad baserat på din historiska data.</p>

          {/* Controls row: metric toggle + category dropdowns */}
          <div className="flex flex-wrap items-end gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-ink-500 mb-1.5">Metric</label>
              <div className="flex gap-1">
                {SHOW_OPTIONS.map(o => (
                  <button key={o.value} onClick={() => setSeasonalMetric(o.value)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      seasonalMetric === o.value ? 'text-white border-transparent' : 'bg-white text-ink-500 border-ink-200 hover:border-ink-300'
                    }`}
                    style={seasonalMetric === o.value ? { backgroundColor: SERIES_COLOR[o.value], borderColor: SERIES_COLOR[o.value] } : {}}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-500 mb-1.5">Kategori A</label>
              <select
                value={seasonalCategory}
                onChange={e => { setSeasonalCategory(e.target.value); setSeasonalCategoryB('') }}
                className="border border-ink-200 rounded-lg px-3 py-2 text-sm text-ink-700 outline-none focus:border-brand-500 bg-white"
              >
                <option value="">Alla produkter</option>
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-500 mb-1.5">Jämför med (B)</label>
              <select
                value={seasonalCategoryB}
                onChange={e => setSeasonalCategoryB(e.target.value)}
                className="border border-ink-200 rounded-lg px-3 py-2 text-sm text-ink-700 outline-none focus:border-brand-500 bg-white"
              >
                <option value="">Ingen jämförelse</option>
                {categories.filter(c => c !== seasonalCategory).map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          {seasonalLoading ? (
            <div className="h-[260px] bg-ink-100 rounded-2xl animate-pulse" />
          ) : seasonalError ? (
            <div className="bg-negative-50 border border-negative-100 text-negative-600 rounded-xl px-5 py-4 text-sm">{seasonalError}</div>
          ) : seasonalData.length === 0 ? (
            <div className="glass rounded-2xl shadow-sm h-[260px] flex items-center justify-center text-ink-400 text-sm">
              Ingen säsongsdata tillgänglig.
            </div>
          ) : (
            <>
              {/* Summary cards — only for single category view */}
              {!hasSeasonalCompare && (
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="bg-white rounded-2xl border border-ink-100 shadow-sm px-5 py-4">
                    <p className="text-xs text-ink-400 mb-1">Bästa månaden</p>
                    <p className="text-base font-bold text-positive-600">{bestMonth?.fullLabel ?? '—'}</p>
                    <p className="text-xs text-ink-400 mt-0.5">{bestMonth ? fmt(bestMonth.avgNet) + ' i snitt' : ''}</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-ink-100 shadow-sm px-5 py-4">
                    <p className="text-xs text-ink-400 mb-1">Sämsta månaden</p>
                    <p className="text-base font-bold text-negative-600">{worstMonth?.fullLabel ?? '—'}</p>
                    <p className="text-xs text-ink-400 mt-0.5">{worstMonth ? fmt(worstMonth.avgNet) + ' i snitt' : ''}</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-ink-100 shadow-sm px-5 py-4">
                    <p className="text-xs text-ink-400 mb-1">Genomsnittligt netto</p>
                    <p className={`text-base font-bold ${overallAvgNet >= 0 ? 'text-positive-600' : 'text-negative-600'}`}>
                      {fmt(overallAvgNet)}
                    </p>
                    <p className="text-xs text-ink-400 mt-0.5">per månad</p>
                  </div>
                </div>
              )}

              {/* Bar chart */}
              <div className="glass rounded-2xl shadow-sm p-6 mb-4">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-ink-700">
                    {hasSeasonalCompare
                      ? `${seasonalCategory || 'Alla produkter'} vs ${seasonalCategoryB}: ${SHOW_LABEL[seasonalMetric]}`
                      : `${seasonalCategory || 'Alla produkter'}: ${SHOW_LABEL[seasonalMetric]}`}
                  </p>
                  {seasonalLoadingB && (
                    <span className="text-xs text-ink-400 animate-pulse">Laddar Period B...</span>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={seasonalChartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EEEDEC" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8B8A93' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#8B8A93' }} axisLine={false} tickLine={false} width={50} />
                    <Tooltip
                      formatter={(v: unknown) => fmt(Number(v ?? 0))}
                      labelFormatter={(label: unknown) => {
                        const m = seasonalChartData.find(d => d.label === String(label))
                        return m?.fullLabel ?? String(label)
                      }}
                    />
                    {hasSeasonalCompare ? (
                      <>
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="value" name={seasonalCategory || 'Alla produkter'} fill="#3A5CD8" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="valueB" name={seasonalCategoryB} fill="#7C5BD9" radius={[4, 4, 0, 0]} />
                      </>
                    ) : (
                      <Bar dataKey="value" name={SHOW_LABEL[seasonalMetric]} radius={[4, 4, 0, 0]}>
                        {seasonalChartData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.value >= seasonalAvg ? '#0E9C6B' : '#CE4646'} />
                        ))}
                      </Bar>
                    )}
                  </BarChart>
                </ResponsiveContainer>
                {!hasSeasonalCompare && (
                  <p className="text-xs text-ink-400 mt-3 text-center">
                    Grönt = över genomsnittet ({fmt(Math.round(seasonalAvg))}) · Rött = under genomsnittet
                  </p>
                )}
              </div>

              {/* Insight text */}
              {!hasSeasonalCompare && bestMonth && (
                <div className="bg-brand-50 border border-brand-100 rounded-xl px-5 py-4 text-sm text-brand-700">
                  Baserat på din historiska data brukar <strong>{bestMonth.fullLabel}</strong> vara din starkaste månad
                  {seasonalCategory ? ` för ${seasonalCategory}` : ''} med ett genomsnittligt netto på {fmt(bestMonth.avgNet)}.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}