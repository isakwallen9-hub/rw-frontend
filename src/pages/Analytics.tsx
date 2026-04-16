import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { fetchWithAuth } from '../utils/fetchWithAuth'
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts'

const API_URL = import.meta.env.VITE_API_URL as string
const LS_KEY = 'rw_saved_charts'

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
}

interface AnalyticsRow {
  label: string
  inflow?: number
  outflow?: number
  net?: number
  [key: string]: unknown
}

function fmt(amount: number): string {
  return amount.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 })
}

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function exportCsv(rows: AnalyticsRow[], series: ShowType[]) {
  const headers = ['Period/Kategori', ...series.map(s => SHOW_LABEL[s])]
  const lines = [
    headers.join(';'),
    ...rows.map(r => [r.label, ...series.map(s => String(r[s] ?? 0))].join(';')),
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

export default function Analytics() {
  const navigate = useNavigate()
  const today = toDateInput(new Date())

  const [groupBy, setGroupBy] = useState<GroupBy>('month')
  const [series, setSeries] = useState<ShowType[]>(['inflow'])
  const [period, setPeriod] = useState<Period>('30d')
  const [chartType, setChartType] = useState<ChartType>('bar')
  const [customFrom, setCustomFrom] = useState(toDateInput(new Date(Date.now() - 30 * 86400000)))
  const [customTo, setCustomTo] = useState(today)

  const [rows, setRows] = useState<AnalyticsRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [savedCharts, setSavedCharts] = useState<SavedChart[]>(loadSaved)
  const [saveName, setSaveName] = useState('')
  const [saveOpen, setSaveOpen] = useState(false)

  const toggleSeries = (s: ShowType) => {
    setSeries(prev =>
      prev.includes(s) ? (prev.length > 1 ? prev.filter(x => x !== s) : prev) : [...prev, s]
    )
  }

  const fetchData = useCallback(() => {
    setLoading(true)
    setError('')

    const now = new Date()
    let fromDate: Date
    if (period === 'custom') {
      fromDate = new Date(customFrom)
    } else if (period === '30d') {
      fromDate = new Date(now.getTime() - 30 * 86400000)
    } else if (period === '90d') {
      fromDate = new Date(now.getTime() - 90 * 86400000)
    } else if (period === '6m') {
      fromDate = new Date(now)
      fromDate.setMonth(fromDate.getMonth() - 6)
    } else {
      fromDate = new Date(now)
      fromDate.setFullYear(fromDate.getFullYear() - 1)
    }
    const toDate = period === 'custom' ? new Date(customTo) : now
    const fromISO = fromDate.toISOString().replace(/\.\d{3}Z$/, 'Z').split('T')[0] + 'T00:00:00Z'
    const toISO = toDate.toISOString().replace(/\.\d{3}Z$/, 'Z').split('T')[0] + 'T00:00:00Z'

    Promise.all(
      series.map(metric =>
        fetchWithAuth(`${API_URL}api/v1/analytics/compare?${new URLSearchParams({ groupBy, metric, from: fromISO, to: toISO })}`)
          .then(r => r.json())
          .then(json => {
            console.log('analytics response:', JSON.stringify(json))
            const data = Array.isArray(json?.data) ? json.data : []
            return { metric, data }
          })
      )
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
  }, [groupBy, series, period, customFrom, customTo])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSave = () => {
    if (!saveName.trim()) return
    const chart: SavedChart = {
      id: Date.now().toString(),
      name: saveName.trim(),
      groupBy, series, period, chartType, customFrom, customTo,
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

  const renderChart = () => (
    <ResponsiveContainer width="100%" height={300}>
      {chartType === 'bar' ? (
        <BarChart data={rows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="label" {...commonAxisProps} />
          <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} {...commonAxisProps} width={50} />
          <Tooltip formatter={(v: unknown) => fmt(Number(v ?? 0))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map(s => (
            <Bar key={s} dataKey={s} name={SHOW_LABEL[s]} fill={SERIES_COLOR[s]} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      ) : (
        <LineChart data={rows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="label" {...commonAxisProps} />
          <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} {...commonAxisProps} width={50} />
          <Tooltip formatter={(v: unknown) => fmt(Number(v ?? 0))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map(s => (
            <Line key={s} type="monotone" dataKey={s} name={SHOW_LABEL[s]} stroke={SERIES_COLOR[s]} strokeWidth={2} dot={false} />
          ))}
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
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 mb-6">
          <div className="flex flex-wrap gap-5 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Gruppera efter</label>
              <select value={groupBy} onChange={e => setGroupBy(e.target.value as GroupBy)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-500 bg-white">
                {GROUP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Visa</label>
              <div className="flex gap-1">
                {SHOW_OPTIONS.map(o => (
                  <button key={o.value} onClick={() => toggleSeries(o.value)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      series.includes(o.value)
                        ? 'text-white border-transparent'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}
                    style={series.includes(o.value) ? { backgroundColor: SERIES_COLOR[o.value], borderColor: SERIES_COLOR[o.value] } : {}}
                  >
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
        </div>

        {/* Chart */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-gray-700">
              {series.map(s => SHOW_LABEL[s]).join(' & ')} — {PERIOD_OPTIONS.find(p => p.value === period)?.label}
            </p>
            <div className="flex gap-2">
              {!saveOpen && (
                <button onClick={() => setSaveOpen(true)}
                  className="text-xs font-medium border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:border-gray-300 transition-colors">
                  Spara graf
                </button>
              )}
              {rows.length > 0 && (
                <button onClick={() => exportCsv(rows, series)}
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

          {loading ? (
            <div className="h-[300px] bg-gray-100 rounded-xl animate-pulse" />
          ) : error ? (
            <div className="bg-red-50 border border-red-100 text-red-600 rounded-xl px-5 py-4 text-sm">{error}</div>
          ) : rows.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-gray-400 text-sm">
              Ingen data tillgänglig för valda filter.
            </div>
          ) : renderChart()}
        </div>

        {/* Table */}
        {!loading && !error && rows.length > 0 && (
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden mb-8">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400">
                  <th className="text-left px-5 py-3 font-medium">Period / Kategori</th>
                  {series.map(s => (
                    <th key={s} className="text-right px-5 py-3 font-medium">{SHOW_LABEL[s]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className={i !== 0 ? 'border-t border-gray-50' : ''}>
                    <td className="px-5 py-3 text-gray-700">{row.label}</td>
                    {series.map(s => (
                      <td key={s} className={`px-5 py-3 text-right font-medium ${
                        s === 'net'
                          ? Number(row[s] ?? 0) >= 0 ? 'text-green-600' : 'text-red-500'
                          : s === 'outflow' ? 'text-red-500' : 'text-blue-600'
                      }`}>
                        {fmt(Number(row[s] ?? 0))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-8 text-center text-gray-400 text-sm">
          Egna grafer — kommer snart
        </div>
      </div>
    </div>
  )
}