import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { fetchWithAuth } from '../utils/fetchWithAuth'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'

const API_URL = import.meta.env.VITE_API_URL as string

interface CashflowPoint {
  date: string
  inflow: number
  outflow: number
}

type RangePreset = '7' | '30' | '90' | 'custom'

function fmt(amount: number): string {
  return amount.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 })
}

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function formatLabel(dateStr: string): string {
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}

export default function Cashflow() {
  const navigate = useNavigate()
  const [allSeries, setAllSeries] = useState<CashflowPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [preset, setPreset] = useState<RangePreset>('30')
  const today = toDateInput(new Date())
  const [customFrom, setCustomFrom] = useState(toDateInput(new Date(Date.now() - 30 * 86400000)))
  const [customTo, setCustomTo] = useState(today)

  useEffect(() => {
    fetchWithAuth(`${API_URL}api/v1/cashflow/current`)
      .then(r => r.json())
      .then(json => setAllSeries(json?.data?.series ?? []))
      .catch(() => setError('Kunde inte hämta kassaflödesdata. Kontrollera din anslutning och försök igen.'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    if (allSeries.length === 0) return []
    if (preset === 'custom') {
      const from = new Date(customFrom).getTime()
      const to = new Date(customTo).getTime() + 86400000
      return allSeries.filter(p => {
        const t = new Date(p.date).getTime()
        return t >= from && t <= to
      })
    }
    const days = Number(preset)
    const cutoff = Date.now() - days * 86400000
    return allSeries.filter(p => new Date(p.date).getTime() >= cutoff)
  }, [allSeries, preset, customFrom, customTo])

  const chartData = filtered.map(p => ({ ...p, label: formatLabel(p.date) }))

  const summary = useMemo(() => {
    const totalInflow = filtered.reduce((s, p) => s + (p.inflow ?? 0), 0)
    const totalOutflow = filtered.reduce((s, p) => s + (p.outflow ?? 0), 0)
    return { totalInflow, totalOutflow, net: totalInflow - totalOutflow }
  }, [filtered])

  const presets: { label: string; value: RangePreset }[] = [
    { label: '7 dagar', value: '7' },
    { label: '30 dagar', value: '30' },
    { label: '90 dagar', value: '90' },
    { label: 'Anpassat', value: 'custom' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10">

        <button onClick={() => navigate('/dashboard')} className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1.5 mb-6">
          ← Tillbaka
        </button>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">Kassaflöde</h1>
        <p className="text-sm text-gray-500 mb-6">Inflöde och utflöde per dag för vald period.</p>

        {/* Period filter */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {presets.map(p => (
            <button
              key={p.value}
              onClick={() => setPreset(p.value)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                preset === p.value
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {p.label}
            </button>
          ))}
          {preset === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <input
                type="date"
                value={customFrom}
                max={customTo}
                onChange={e => setCustomFrom(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 outline-none focus:border-blue-500"
              />
              <span className="text-gray-400 text-sm">—</span>
              <input
                type="date"
                value={customTo}
                min={customFrom}
                max={today}
                onChange={e => setCustomTo(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 outline-none focus:border-blue-500"
              />
            </div>
          )}
        </div>

        {/* Summary cards */}
        {!loading && !error && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
              <p className="text-xs text-gray-400 mb-1">Totalt inflöde</p>
              <p className="text-lg font-bold text-blue-600">{fmt(summary.totalInflow)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
              <p className="text-xs text-gray-400 mb-1">Totalt utflöde</p>
              <p className="text-lg font-bold text-red-500">{fmt(summary.totalOutflow)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
              <p className="text-xs text-gray-400 mb-1">Netto</p>
              <p className={`text-lg font-bold ${summary.net >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {fmt(summary.net)}
              </p>
            </div>
          </div>
        )}

        {/* Chart */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          {loading ? (
            <div className="h-[300px] bg-gray-100 rounded-xl animate-pulse" />
          ) : error ? (
            <div className="bg-red-50 border border-red-100 text-red-600 rounded-xl px-5 py-4 text-sm">
              {error}
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-gray-400 text-sm">
              Ingen data tillgänglig för vald period.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={50} />
                <Tooltip formatter={(v: unknown) => fmt(Number(v ?? 0))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="inflow" name="Inflöde" stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="outflow" name="Utflöde" stroke="#ef4444" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="mt-8 bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-8 text-center text-gray-400 text-sm">
          Egna grafer — kommer snart
        </div>
      </div>
    </div>
  )
}