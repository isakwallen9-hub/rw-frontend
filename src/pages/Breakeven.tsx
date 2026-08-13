import { useEffect, useState } from 'react'
import { fetchWithAuth } from '../utils/fetchWithAuth'
import { ChartTooltip } from '../components/chart'
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
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchWithAuth(`${API_URL}api/v1/dashboard/overview`)
      .then((r) => r.json())
      .then((json) => {
        setSummary(json?.data?.summary ?? null)
      })
      .catch(() => setError('Kunde inte hämta break-even-data.'))
      .finally(() => setLoading(false))
  }, [])

  const chartData = summary
    ? [
        { name: 'Inflöde', value: summary.totalInflow, fill: '#3A5CD8' },
        { name: 'Utflöde', value: summary.totalOutflow, fill: '#CE4646' },
      ]
    : []

  const isPositive = summary ? summary.netCashflow >= 0 : false

  return (
    <div className="font-sans">
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10">

        <h1 className="text-4xl tracking-tight text-ink-900 mb-1">Break-even</h1>
        <p className="text-sm text-ink-500 mb-8">
          Jämförelse mellan totalt inflöde och utflöde.
        </p>

        <div className="bg-white rounded-2xl shadow-sm border border-ink-100 p-6">
          {loading ? (
            <div className="h-[300px] skeleton rounded-xl" />
          ) : error ? (
            <div className="bg-negative-50 border border-negative-100 text-negative-600 rounded-xl px-5 py-4 text-sm">
              {error}
            </div>
          ) : !summary ? (
            <div className="h-[300px] flex items-center justify-center text-ink-400 text-sm">
              Ingen data tillgänglig.
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="2 6" stroke="#1A192010" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 13 }} />
                  <YAxis tickFormatter={(v) => fmt(v)} tick={{ fontSize: 11 }} width={90} />
                  <Tooltip content={<ChartTooltip format={fmt} />} cursor={{ fill: "rgba(26,25,32,0.04)" }} />
                  <Legend />
                  <Bar dataKey="value" name="Belopp" radius={[6, 6, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <rect key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <div className="mt-6 pt-5 border-t border-ink-100 flex items-center justify-between">
                <span className="text-sm text-ink-500 font-medium">Nettokassaflöde</span>
                <span
                  className={`text-lg font-bold ${
                    isPositive ? 'text-positive-600' : 'text-negative-600'
                  }`}
                >
                  {fmt(summary.netCashflow)}
                </span>
              </div>
            </>
          )}
        </div>

        <div className="mt-8 bg-ink-50 border border-dashed border-ink-200 rounded-2xl p-8 text-center text-ink-400 text-sm">
          Egna grafer: kommer snart
        </div>
      </div>
    </div>
  )
}
