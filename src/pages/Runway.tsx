import { useEffect, useState } from 'react'
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
  ReferenceLine,
} from 'recharts'

const API_URL = 'https://divine-warmth-production.up.railway.app/'

interface ForecastPoint {
  date: string
  balance: number
}

interface RunwayData {
  currentBalance: number
  monthlyBurnRate: number
  runwayDays: number
  forecast: ForecastPoint[]
}

function fmt(amount: number): string {
  return amount.toLocaleString('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  })
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}

export default function Runway() {
  const navigate = useNavigate()
  const [data, setData] = useState<RunwayData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchWithAuth(`${API_URL}api/v1/cashflow/runway`)
      .then((r) => r.json())
      .then((json) => {
        setData(json?.data ?? null)
      })
      .catch(() => setError('Kunde inte hämta runway-data.'))
      .finally(() => setLoading(false))
  }, [])

  const chartData =
    data?.forecast?.map((p) => ({
      ...p,
      label: formatDate(p.date),
    })) ?? []

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10">
        <button
          onClick={() => navigate('/dashboard')}
          className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1.5 mb-6"
        >
          ← Tillbaka
        </button>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">Runway — 90-dagarsprognos</h1>
        <p className="text-sm text-gray-500 mb-8">
          Prognos för hur länge nuvarande likviditet räcker.
        </p>

        {loading ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
              ))}
            </div>
            <div className="h-[300px] bg-gray-100 rounded-2xl animate-pulse" />
          </>
        ) : error ? (
          <div className="bg-red-50 border border-red-100 text-red-600 rounded-xl px-5 py-4 text-sm">
            {error}
          </div>
        ) : !data ? (
          <div className="text-center text-gray-400 text-sm py-16">
            Ingen data tillgänglig.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                  Nuvarande saldo
                </p>
                <p className="text-xl font-bold text-gray-900">{fmt(data.currentBalance)}</p>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                  Burn rate/mån
                </p>
                <p className="text-xl font-bold text-red-600">{fmt(data.monthlyBurnRate)}</p>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                  Runway
                </p>
                <p className="text-xl font-bold text-blue-600">{data.runwayDays} dagar</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              {chartData.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center text-gray-400 text-sm">
                  Ingen prognosdata tillgänglig.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v) => fmt(v)} tick={{ fontSize: 11 }} width={90} />
                    <Tooltip formatter={(value: unknown) => fmt(Number(value ?? 0))} />
                    <Legend />
                    <ReferenceLine
                      y={0}
                      stroke="#ef4444"
                      strokeDasharray="4 4"
                      label={{ value: 'Noll', fill: '#ef4444', fontSize: 12 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="balance"
                      name="Saldo"
                      stroke="#2563eb"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </>
        )}

        <div className="mt-8 bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-8 text-center text-gray-400 text-sm">
          Egna grafer — kommer snart
        </div>
      </div>
    </div>
  )
}
