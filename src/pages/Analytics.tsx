import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { fetchWithAuth } from '../utils/fetchWithAuth'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'

const API_URL = import.meta.env.VITE_API_URL as string

type GroupBy = 'category' | 'day' | 'week' | 'month'
type ShowType = 'inflow' | 'outflow' | 'net'
type Period = '30d' | '90d' | '6m' | '1y' | 'custom'

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

const BAR_COLOR: Record<ShowType, string> = {
  inflow: '#2563eb',
  outflow: '#ef4444',
  net: '#10b981',
}

const SHOW_LABEL: Record<ShowType, string> = {
  inflow: 'Inflöde',
  outflow: 'Utflöde',
  net: 'Netto',
}

export default function Analytics() {
  const navigate = useNavigate()
  const [groupBy, setGroupBy] = useState<GroupBy>('month')
  const [showType, setShowType] = useState<ShowType>('inflow')
  const [period, setPeriod] = useState<Period>('30d')
  const today = toDateInput(new Date())
  const [customFrom, setCustomFrom] = useState(toDateInput(new Date(Date.now() - 30 * 86400000)))
  const [customTo, setCustomTo] = useState(today)

  const [rows, setRows] = useState<AnalyticsRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchData = useCallback(() => {
    setLoading(true)
    setError('')

    const params = new URLSearchParams({ groupBy, show: showType, period })
    if (period === 'custom') {
      params.set('from', customFrom)
      params.set('to', customTo)
    }

    fetchWithAuth(`${API_URL}api/v1/analytics/compare?${params}`)
      .then(r => r.json())
      .then(json => {
        const data = json?.data ?? json ?? []
        setRows(Array.isArray(data) ? data : [])
      })
      .catch(() => setError('Kunde inte hämta analysdata. Kontrollera din anslutning och försök igen.'))
      .finally(() => setLoading(false))
  }, [groupBy, showType, period, customFrom, customTo])

  useEffect(() => { fetchData() }, [fetchData])

  const dataKey = showType

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-10">

        <button onClick={() => navigate('/dashboard')} className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1.5 mb-6">
          ← Tillbaka
        </button>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">Analys</h1>
        <p className="text-sm text-gray-500 mb-8">Jämför och filtrera din ekonomidata.</p>

        {/* Filters */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 mb-6 flex flex-wrap gap-5 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Gruppera efter</label>
            <select
              value={groupBy}
              onChange={e => setGroupBy(e.target.value as GroupBy)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-500 bg-white"
            >
              {GROUP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Visa</label>
            <select
              value={showType}
              onChange={e => setShowType(e.target.value as ShowType)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-500 bg-white"
            >
              {SHOW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Period</label>
            <select
              value={period}
              onChange={e => setPeriod(e.target.value as Period)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-500 bg-white"
            >
              {PERIOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {period === 'custom' && (
            <div className="flex items-center gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Från</label>
                <input
                  type="date" value={customFrom} max={customTo}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Till</label>
                <input
                  type="date" value={customTo} min={customFrom} max={today}
                  onChange={e => setCustomTo(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Chart */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 mb-6">
          {loading ? (
            <div className="h-[300px] bg-gray-100 rounded-xl animate-pulse" />
          ) : error ? (
            <div className="bg-red-50 border border-red-100 text-red-600 rounded-xl px-5 py-4 text-sm">{error}</div>
          ) : rows.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-gray-400 text-sm">
              Ingen data tillgänglig för valda filter.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={rows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={50} />
                <Tooltip formatter={(v: unknown) => fmt(Number(v ?? 0))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey={dataKey} name={SHOW_LABEL[showType]} fill={BAR_COLOR[showType]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Table */}
        {!loading && !error && rows.length > 0 && (
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden mb-8">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400">
                  <th className="text-left px-5 py-3 font-medium">Period / Kategori</th>
                  <th className="text-right px-5 py-3 font-medium">{SHOW_LABEL[showType]}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className={i !== 0 ? 'border-t border-gray-50' : ''}>
                    <td className="px-5 py-3 text-gray-700">{row.label}</td>
                    <td className={`px-5 py-3 text-right font-medium ${
                      showType === 'net'
                        ? Number(row[dataKey] ?? 0) >= 0 ? 'text-green-600' : 'text-red-500'
                        : showType === 'outflow' ? 'text-red-500' : 'text-blue-600'
                    }`}>
                      {fmt(Number(row[dataKey] ?? 0))}
                    </td>
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