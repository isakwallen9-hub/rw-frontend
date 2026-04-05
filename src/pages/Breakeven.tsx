import { useEffect, useState } from 'react'
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

const API_URL = 'https://divine-warmth-production.up.railway.app/'

interface Summary {
  totalInflow: number
  totalOutflow: number
  netCashflow: number
}

function fmt(amount: number): string {
  return amount.toLocaleString('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  })
}

export default function Breakeven() {
  const navigate = useNavigate()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchWithAuth(`${API_URL}api/v1/dashboard/overview`)
      .then((r) => r.json())
      .then((json) => {
        const s: Summary = json?.data?.summary ?? null
        setSummary(s)
      })
      .catch(() => setError('Kunde inte hämta break-even-data.'))
      .finally(() => setLoading(false))
  }, [])

  const chartData = summary
    ? [
        { name: 'Inflöde', value: summary.totalInflow, fill: '#2563eb' },
        { name: 'Utflöde', value: summary.totalOutflow, fill: '#ef4444' },
      ]
    : []

  const isPositive = summary ? summary.netCashflow >= 0 : false

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

        <h1 className="text-2xl font-bold text-gray-900 mb-1">Break-even</h1>
        <p className="text-sm text-gray-500 mb-8">
          Jämförelse mellan totalt inflöde och utflöde.
        </p>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          {loading ? (
            <div className="h-[300px] bg-gray-100 rounded-xl animate-pulse" />
          ) : error ? (
            <div className="bg-red-50 border border-red-100 text-red-600 rounded-xl px-5 py-4 text-sm">
              {error}
            </div>
          ) : !summary ? (
            <div className="h-[300px] flex items-center justify-center text-gray-400 text-sm">
              Ingen data tillgänglig.
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 13 }} />
                  <YAxis tickFormatter={(v) => fmt(v)} tick={{ fontSize: 11 }} width={90} />
                  <Tooltip formatter={(value: unknown) => fmt(Number(value ?? 0))} />
                  <Legend />
                  <Bar dataKey="value" name="Belopp" radius={[6, 6, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <rect key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <div className="mt-6 pt-5 border-t border-gray-100 flex items-center justify-between">
                <span className="text-sm text-gray-500 font-medium">Nettokassaflöde</span>
                <span
                  className={`text-lg font-bold ${
                    isPositive ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {fmt(summary.netCashflow)}
                </span>
              </div>
            </>
          )}
        </div>

        <div className="mt-8 bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-8 text-center text-gray-400 text-sm">
          Egna grafer — kommer snart
        </div>
      </div>
    </div>
  )
}
