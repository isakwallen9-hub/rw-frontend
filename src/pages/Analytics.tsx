import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { fetchWithAuth } from '../utils/fetchWithAuth'
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
const CAT_COLORS = ['#2563eb', '#7c3aed', '#f59e0b', '#10b981', '#ef4444']
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
  inflow: '#2563eb',
  outflow: '#ef4444',
  net: '#10b981',
}

const SHOW_LABEL: Record<ShowType, string> = {
  inflow: 'Inflöde',
  outflow: 'Utflöde',
  net: 'Netto',
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
  const navigate = useNavigate()
  const today = toDateInput(new Date())

  const [groupBy, setGroupBy] = useState<GroupBy>('month')
  const [series, setSeries] = useState<ShowType[]>(['inflow'])
  const [period, setPeriod] = useState<Period>('30d')
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

  // Period comparison state
  const [compareMode, setCompareMode] = useState(false)
  const [periodAFrom, setPeriodAFrom] = useState(toDateInput(new Date(Date.now() - 60 * 86400000)))
  const [periodATo, setPeriodATo] = useState(toDateInput(new Date(Date.now() - 30 * 86400000)))
  const [periodBFrom, setPeriodBFrom] = useState(toDateInput(new Date(Date.now() - 30 * 86400000)))
  const [periodBTo, setPeriodBTo] = useState(today)
  const [compareRows, setCompareRows] = useState<{ label: string; a: number; b: number }[]>([])
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareError, setCompareError] = useState('')

  // Fetch seasonal data — re-runs when category A changes
  useEffect(() => {
    setSeasonalLoading(true)
    setSeasonalError('')
    const params = seasonalCategory ? new URLSearchParams({ category: seasonalCategory }) : null
    const url = params ? `${API_URL}api/v1/analytics/seasonal?${params}` : `${API_URL}api/v1/analytics/seasonal`
    fetchWithAuth(url)
      .then(r => r.json())
      .then(json => {
        const months: SeasonalMonth[] = Array.isArray(json?.data)
          ? json.data
          : Array.isArray(json?.data?.months)
          ? json.data.months
          : []
        setSeasonalData(months)
      })
      .catch(() => setSeasonalError('Kunde inte hämta säsongsdata.'))
      .finally(() => setSeasonalLoading(false))
  }, [seasonalCategory])

  // Fetch seasonal data for category B comparison
  useEffect(() => {
    if (!seasonalCategoryB) { setSeasonalDataB([]); return }
    setSeasonalLoadingB(true)
    const url = `${API_URL}api/v1/analytics/seasonal?${new URLSearchParams({ category: seasonalCategoryB })}`
    fetchWithAuth(url)
      .then(r => r.json())
      .then(json => {
        const months: SeasonalMonth[] = Array.isArray(json?.data)
          ? json.data
          : Array.isArray(json?.data?.months)
          ? json.data.months
          : []
        setSeasonalDataB(months)
      })
      .catch(() => {})
      .finally(() => setSeasonalLoadingB(false))
  }, [seasonalCategoryB])

  // Fetch available categories on mount
  useEffect(() => {
    console.log('fetching categories...')
    fetchWithAuth(`${API_URL}api/v1/analytics/categories`)
      .then(r => r.json())
      .then(json => {
        console.log('categories response:', JSON.stringify(json))
        const cats = Array.isArray(json?.data?.categories) ? json.data.categories : []
        console.log('categories to set:', cats)
        setCategories(cats)
      })
      .catch(() => {})
  }, [])

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

  const fetchData = useCallback(() => {
    setLoading(true)
    setError('')

    const { fromISO, toISO } = computeDates(period, customFrom, customTo)

    if (selectedCats.length > 0) {
      // Multi-category mode: one fetch per selected category, same metric
      const metric = series[0]
      Promise.all(
        selectedCats.map((cat, idx) => {
          const params = new URLSearchParams({ groupBy, metric, from: fromISO, to: toISO, category: cat })
          return fetchWithAuth(`${API_URL}api/v1/analytics/compare?${params}`)
            .then(r => r.json())
            .then(json => {
              console.log('analytics response:', JSON.stringify(json))
              const data = Array.isArray(json?.data?.data) ? json.data.data : []
              return { key: `cat_${idx}`, data }
            })
        })
      )
        .then(results => {
          const merged: Record<string, AnalyticsRow> = {}
          for (const { key, data } of results) {
            for (const row of data) {
              if (!merged[row.label]) merged[row.label] = { label: row.label }
              merged[row.label][key] = row.value ?? 0
            }
          }
          const mergedRows = Object.values(merged)
          console.log('analytics rows:', mergedRows)
          setRows(mergedRows)
        })
        .catch(() => setError('Kunde inte hämta analysdata. Kontrollera din anslutning och försök igen.'))
        .finally(() => setLoading(false))
    } else {
      // Normal mode: one fetch per selected metric
      Promise.all(
        series.map(metric => {
          const params = new URLSearchParams({ groupBy, metric, from: fromISO, to: toISO })
          return fetchWithAuth(`${API_URL}api/v1/analytics/compare?${params}`)
            .then(r => r.json())
            .then(json => {
              console.log('analytics response:', JSON.stringify(json))
              const data = Array.isArray(json?.data?.data) ? json.data.data : []
              return { metric, data }
            })
        })
      )
        .then(results => {
          const merged: Record<string, AnalyticsRow> = {}
          for (const { metric, data } of results) {
            for (const row of data) {
              if (!merged[row.label]) merged[row.label] = { label: row.label }
              merged[row.label][metric] = row.value ?? 0
            }
          }
          const mergedRows = Object.values(merged)
          console.log('analytics rows:', mergedRows)
          setRows(mergedRows)
        })
        .catch(() => setError('Kunde inte hämta analysdata. Kontrollera din anslutning och försök igen.'))
        .finally(() => setLoading(false))
    }
  }, [groupBy, series, period, customFrom, customTo, selectedCats])

  useEffect(() => { fetchData() }, [fetchData])

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
    tick: { fontSize: 11, fill: '#9ca3af' },
    axisLine: false as const,
    tickLine: false as const,
  }

  console.log('categories state:', categories)

  // Seasonal derived values
  const seasonalKey = seasonalMetric === 'inflow' ? 'avgInflow' : seasonalMetric === 'outflow' ? 'avgOutflow' : 'avgNet'
  const seasonalAvg = seasonalData.length
    ? seasonalData.reduce((s, m) => s + (m[seasonalKey as keyof SeasonalMonth] as number), 0) / seasonalData.length
    : 0
  const seasonalChartData = seasonalData.map(m => {
    const mb = seasonalDataB.find(d => d.month === m.month)
    return {
      label: m.label ?? MONTH_SHORT[(m.month - 1) % 12],
      fullLabel: m.label ?? MONTH_NAMES[(m.month - 1) % 12],
      value: m[seasonalKey as keyof SeasonalMonth] as number,
      valueB: mb ? (mb[seasonalKey as keyof SeasonalMonth] as number) : undefined,
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
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
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
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
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
    <div className="min-h-screen bg-gray-50 font-sans">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-10">

        <button onClick={() => navigate('/dashboard')} className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1.5 mb-6">
          ← Tillbaka
        </button>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">Analys</h1>
        <p className="text-sm text-gray-500 mb-6">Jämför och filtrera din ekonomidata.</p>

        {/* Saved charts */}
        {savedCharts.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-medium text-gray-500 mb-2">Sparade grafer</p>
            <div className="flex flex-wrap gap-2">
              {savedCharts.map(c => (
                <div key={c.id} className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm">
                  <button onClick={() => handleLoad(c)} className="text-gray-700 hover:text-blue-600 font-medium">
                    {c.name}
                  </button>
                  <button onClick={() => handleDelete(c.id)} className="text-gray-300 hover:text-red-400 ml-1 leading-none">×</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 mb-4">
          <div className="flex flex-wrap gap-5 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Gruppera efter</label>
              <select value={groupBy} onChange={e => setGroupBy(e.target.value as GroupBy)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-500 bg-white">
                {GROUP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                {catMode ? 'Visa metric' : 'Visa'}
              </label>
              <div className="flex gap-1">
                {SHOW_OPTIONS.map(o => (
                  <button key={o.value}
                    onClick={() => catMode ? setSeries([o.value]) : toggleSeries(o.value)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      (catMode ? series[0] === o.value : series.includes(o.value))
                        ? 'text-white border-transparent'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
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
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Period</label>
              <select value={period} onChange={e => setPeriod(e.target.value as Period)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-500 bg-white">
                {PERIOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Graftyp</label>
              <div className="flex gap-1">
                {(['bar', 'line'] as ChartType[]).map(t => (
                  <button key={t} onClick={() => setChartType(t)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      chartType === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}>
                    {t === 'bar' ? 'Stapel' : 'Linje'}
                  </button>
                ))}
              </div>
            </div>

            {period === 'custom' && (
              <div className="flex items-center gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Från</label>
                  <input type="date" value={customFrom} max={customTo}
                    onChange={e => setCustomFrom(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Till</label>
                  <input type="date" value={customTo} min={customFrom} max={today}
                    onChange={e => setCustomTo(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-500" />
                </div>
              </div>
            )}
          </div>

          {/* Period comparison date pickers */}
          {compareMode && (
            <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-6">
              <div>
                <p className="text-xs font-semibold text-blue-600 mb-1.5">Period A</p>
                <div className="flex items-center gap-2">
                  <input type="date" value={periodAFrom} max={periodATo}
                    onChange={e => setPeriodAFrom(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" />
                  <span className="text-xs text-gray-400">till</span>
                  <input type="date" value={periodATo} min={periodAFrom} max={today}
                    onChange={e => setPeriodATo(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" />
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-purple-600 mb-1.5">Period B</p>
                <div className="flex items-center gap-2">
                  <input type="date" value={periodBFrom} max={periodBTo}
                    onChange={e => setPeriodBFrom(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" />
                  <span className="text-xs text-gray-400">till</span>
                  <input type="date" value={periodBTo} min={periodBFrom} max={today}
                    onChange={e => setPeriodBTo(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" />
                </div>
              </div>
            </div>
          )}

          {/* Category multi-select chips */}
          {categories.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-gray-500">Kategorier</span>
                {selectedCats.length > 0 && (
                  <button onClick={() => setSelectedCats([])}
                    className="text-xs text-gray-400 hover:text-gray-600 underline">
                    Rensa
                  </button>
                )}
                {selectedCats.length >= MAX_CATS && (
                  <span className="text-xs text-amber-500">Max {MAX_CATS} kategorier valda</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {categories.map(cat => {
                  const idx = selectedCats.indexOf(cat)
                  const isSelected = idx !== -1
                  const isDisabled = !isSelected && selectedCats.length >= MAX_CATS
                  return (
                    <button
                      key={cat}
                      onClick={() => !isDisabled && toggleCat(cat)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                        isSelected
                          ? 'text-white border-transparent'
                          : isDisabled
                          ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                      }`}
                      style={isSelected ? { backgroundColor: CAT_COLORS[idx], borderColor: CAT_COLORS[idx] } : {}}>
                      {cat}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Chart */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-gray-700">
              {catMode
                ? `${selectedCats.join(', ')} — ${SHOW_LABEL[series[0]]}`
                : series.map(s => SHOW_LABEL[s]).join(' & ')
              } — {PERIOD_OPTIONS.find(p => p.value === period)?.label}
            </p>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setCompareMode(v => !v)}
                className={`text-xs font-medium border px-3 py-1.5 rounded-lg transition-colors ${
                  compareMode
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {compareMode ? '× Stäng jämförelse' : 'Jämför perioder'}
              </button>
              {!saveOpen && !compareMode && (
                <button onClick={() => setSaveOpen(true)}
                  className="text-xs font-medium border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:border-gray-300 transition-colors">
                  Spara graf
                </button>
              )}
              {!compareMode && rows.length > 0 && (
                <button onClick={() => exportCsv(rows, exportColumns)}
                  className="text-xs font-medium border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:border-gray-300 transition-colors">
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
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500"
              />
              <button onClick={handleSave}
                className="text-xs font-semibold bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors">
                Spara
              </button>
              <button onClick={() => { setSaveOpen(false); setSaveName('') }}
                className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5">
                Avbryt
              </button>
            </div>
          )}

          {compareMode ? (
            compareLoading ? (
              <div className="h-[300px] bg-gray-100 rounded-xl animate-pulse" />
            ) : compareError ? (
              <div className="bg-red-50 border border-red-100 text-red-600 rounded-xl px-5 py-4 text-sm">{compareError}</div>
            ) : compareRows.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-gray-400 text-sm">
                Ingen data — välj datumintervall för Period A och Period B ovan.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                {chartType === 'bar' ? (
                  <BarChart data={compareRows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" {...commonAxisProps} />
                    <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} {...commonAxisProps} width={50} />
                    <Tooltip formatter={(v: unknown) => fmt(Number(v ?? 0))} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="a" name="Period A" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="b" name="Period B" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                  </BarChart>
                ) : (
                  <LineChart data={compareRows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" {...commonAxisProps} />
                    <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} {...commonAxisProps} width={50} />
                    <Tooltip formatter={(v: unknown) => fmt(Number(v ?? 0))} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="a" name="Period A" stroke="#2563eb" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="b" name="Period B" stroke="#7c3aed" strokeWidth={2} dot={false} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            )
          ) : loading ? (
            <div className="h-[300px] bg-gray-100 rounded-xl animate-pulse" />
          ) : error ? (
            <div className="bg-red-50 border border-red-100 text-red-600 rounded-xl px-5 py-4 text-sm">{error}</div>
          ) : rows.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-gray-400 text-sm">
              Ingen data tillgänglig för valda filter.
            </div>
          ) : renderChart()}
        </div>

        {/* Period comparison summary */}
        {compareMode && !compareLoading && !compareError && compareRows.length > 0 && (
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 mb-4">
            <h3 className="text-sm font-bold text-gray-700 mb-4">
              Sammanfattning — {SHOW_LABEL[series[0]]}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-[11px] text-blue-500 font-semibold uppercase tracking-widest mb-1">Period A</p>
                <p className="text-xl font-bold text-gray-900">{fmt(compareSummary.totalA)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{periodAFrom} – {periodATo}</p>
              </div>
              <div className="text-center">
                <p className="text-[11px] text-purple-500 font-semibold uppercase tracking-widest mb-1">Period B</p>
                <p className="text-xl font-bold text-gray-900">{fmt(compareSummary.totalB)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{periodBFrom} – {periodBTo}</p>
              </div>
              <div className="text-center">
                <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-widest mb-1">Förändring</p>
                <p className={`text-xl font-bold ${compareSummary.diff >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {compareSummary.diff >= 0 ? '+' : ''}{fmt(compareSummary.diff)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-widest mb-1">Förändring %</p>
                <p className={`text-xl font-bold ${(compareSummary.pct ?? 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
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
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden mb-8">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400">
                  <th className="text-left px-5 py-3 font-medium">Period / Kategori</th>
                  {exportColumns.map(col => (
                    <th key={col.key} className="text-right px-5 py-3 font-medium">{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className={i !== 0 ? 'border-t border-gray-50' : ''}>
                    <td className="px-5 py-3 text-gray-700">{row.label}</td>
                    {exportColumns.map(col => (
                      <td key={col.key} className={`px-5 py-3 text-right font-medium ${
                        catMode
                          ? 'text-gray-800'
                          : col.key === 'net'
                          ? Number(row[col.key] ?? 0) >= 0 ? 'text-green-600' : 'text-red-500'
                          : col.key === 'outflow' ? 'text-red-500' : 'text-blue-600'
                      }`}>
                        {fmt(Number(row[col.key] ?? 0))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Seasonal analysis */}
        <div className="mt-8">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Säsongsmönster</h2>
          <p className="text-sm text-gray-500 mb-4">Genomsnittliga värden per månad baserat på din historiska data.</p>

          {/* Controls row: metric toggle + category dropdowns */}
          <div className="flex flex-wrap items-end gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Metric</label>
              <div className="flex gap-1">
                {SHOW_OPTIONS.map(o => (
                  <button key={o.value} onClick={() => setSeasonalMetric(o.value)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      seasonalMetric === o.value ? 'text-white border-transparent' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}
                    style={seasonalMetric === o.value ? { backgroundColor: SERIES_COLOR[o.value], borderColor: SERIES_COLOR[o.value] } : {}}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Kategori A</label>
              <select
                value={seasonalCategory}
                onChange={e => { setSeasonalCategory(e.target.value); setSeasonalCategoryB('') }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-500 bg-white"
              >
                <option value="">Alla produkter</option>
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Jämför med (B)</label>
              <select
                value={seasonalCategoryB}
                onChange={e => setSeasonalCategoryB(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-500 bg-white"
              >
                <option value="">Ingen jämförelse</option>
                {categories.filter(c => c !== seasonalCategory).map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          {seasonalLoading ? (
            <div className="h-[260px] bg-gray-100 rounded-2xl animate-pulse" />
          ) : seasonalError ? (
            <div className="bg-red-50 border border-red-100 text-red-600 rounded-xl px-5 py-4 text-sm">{seasonalError}</div>
          ) : seasonalData.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm h-[260px] flex items-center justify-center text-gray-400 text-sm">
              Ingen säsongsdata tillgänglig.
            </div>
          ) : (
            <>
              {/* Summary cards — only for single category view */}
              {!hasSeasonalCompare && (
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
                    <p className="text-xs text-gray-400 mb-1">Bästa månaden</p>
                    <p className="text-base font-bold text-green-600">{bestMonth?.fullLabel ?? '—'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{bestMonth ? fmt(bestMonth.avgNet) + ' i snitt' : ''}</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
                    <p className="text-xs text-gray-400 mb-1">Sämsta månaden</p>
                    <p className="text-base font-bold text-red-500">{worstMonth?.fullLabel ?? '—'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{worstMonth ? fmt(worstMonth.avgNet) + ' i snitt' : ''}</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
                    <p className="text-xs text-gray-400 mb-1">Genomsnittligt netto</p>
                    <p className={`text-base font-bold ${overallAvgNet >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {fmt(overallAvgNet)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">per månad</p>
                  </div>
                </div>
              )}

              {/* Bar chart */}
              <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 mb-4">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-gray-700">
                    {hasSeasonalCompare
                      ? `${seasonalCategory || 'Alla produkter'} vs ${seasonalCategoryB} — ${SHOW_LABEL[seasonalMetric]}`
                      : `${seasonalCategory || 'Alla produkter'} — ${SHOW_LABEL[seasonalMetric]}`}
                  </p>
                  {seasonalLoadingB && (
                    <span className="text-xs text-gray-400 animate-pulse">Laddar Period B...</span>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={seasonalChartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={50} />
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
                        <Bar dataKey="value" name={seasonalCategory || 'Alla produkter'} fill="#2563eb" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="valueB" name={seasonalCategoryB} fill="#7c3aed" radius={[4, 4, 0, 0]} />
                      </>
                    ) : (
                      <Bar dataKey="value" name={SHOW_LABEL[seasonalMetric]} radius={[4, 4, 0, 0]}>
                        {seasonalChartData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.value >= seasonalAvg ? '#10b981' : '#ef4444'} />
                        ))}
                      </Bar>
                    )}
                  </BarChart>
                </ResponsiveContainer>
                {!hasSeasonalCompare && (
                  <p className="text-xs text-gray-400 mt-3 text-center">
                    Grönt = över genomsnittet ({fmt(Math.round(seasonalAvg))}) · Rött = under genomsnittet
                  </p>
                )}
              </div>

              {/* Insight text */}
              {!hasSeasonalCompare && bestMonth && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-3 text-sm text-blue-700">
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