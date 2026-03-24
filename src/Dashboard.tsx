import { useEffect, useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import Navbar from './components/Navbar'
import { SkeletonKpiCards, SkeletonChart, SkeletonList } from './components/Skeleton'
import { fetchWithAuth } from './utils/fetchWithAuth'

const API_URL = 'https://divine-warmth-production.up.railway.app/'

interface KpiData {
  liquidAssets: number
  overdueInvoices: number
  breakEven: number
  runwayDays: number
}

interface CashflowMonth {
  month: string
  in: number
  out: number
}

interface Transaction {
  date: string
  description: string
  amount: number
}

interface Recommendation {
  title: string
  description: string
  estimatedValue: number
  priority: 'high' | 'medium' | 'low'
}

interface OverviewData {
  kpi?: KpiData
  cashflow?: CashflowMonth[]
  recentTransactions?: Transaction[]
  // fallbacks from old structure
  totalOutstanding?: number
  totalOverdue?: number
  avgPaymentDays?: number
  bestCustomer?: string
  topLatePayors?: { name: string; amount: number; daysSince: number }[]
}

function fmt(amount: number) {
  return amount.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 })
}

const PRIORITY_COLORS = {
  high: { dot: 'bg-red-500', badge: 'bg-red-100 text-red-700', label: 'Hög' },
  medium: { dot: 'bg-yellow-400', badge: 'bg-yellow-100 text-yellow-700', label: 'Medium' },
  low: { dot: 'bg-green-500', badge: 'bg-green-100 text-green-700', label: 'Låg' },
}

export default function Dashboard({ onLogout: _onLogout }: { onLogout?: () => void }) {
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [loadingOverview, setLoadingOverview] = useState(true)
  const [loadingRec, setLoadingRec] = useState(true)
  const [errorOverview, setErrorOverview] = useState('')
  const [errorRec, setErrorRec] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('accessToken')
    if (!token || token === 'undefined' || token === 'null') {
      window.location.href = '/login'
      return
    }

    fetchWithAuth(`${API_URL}api/v1/dashboard/overview`)
      .then((r) => r.json())
      .then((json) => {
        console.log('[DASHBOARD] overview:', json)
        setOverview(json.data ?? json)
      })
      .catch(() => setErrorOverview('Kunde inte hämta översikt.'))
      .finally(() => setLoadingOverview(false))

    fetchWithAuth(`${API_URL}api/v1/recommendations/top3`)
      .then((r) => r.json())
      .then((json) => {
        console.log('[DASHBOARD] recommendations:', json)
        setRecommendations(json.data ?? json ?? [])
      })
      .catch(() => setErrorRec('Kunde inte hämta rekommendationer.'))
      .finally(() => setLoadingRec(false))
  }, [])

  // Build cashflow data — use API data or fallback placeholder
  const cashflowData: CashflowMonth[] = overview?.cashflow ?? []

  // KPI values — support both new and old API shape
  const kpi = {
    liquidAssets: overview?.kpi?.liquidAssets ?? overview?.totalOutstanding ?? 0,
    overdueInvoices: overview?.kpi?.overdueInvoices ?? overview?.totalOverdue ?? 0,
    breakEven: overview?.kpi?.breakEven ?? 0,
    runwayDays: overview?.kpi?.runwayDays ?? overview?.avgPaymentDays ?? 0,
  }

  const transactions: Transaction[] = overview?.recentTransactions ?? []

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8 flex flex-col gap-8">

        {/* KPI-kort */}
        {loadingOverview ? (
          <SkeletonKpiCards />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label="Likvida medel" value={fmt(kpi.liquidAssets)} />
            <KpiCard label="Förfallna fakturor" value={fmt(kpi.overdueInvoices)} highlight="red" />
            <KpiCard label="Break-even" value={fmt(kpi.breakEven)} />
            <KpiCard label="Runway" value={`${kpi.runwayDays} dagar`} highlight="blue" />
          </div>
        )}

        {/* Kassaflödes-graf */}
        {loadingOverview ? (
          <SkeletonChart />
        ) : cashflowData.length > 0 ? (
          <div className="bg-white border border-gray-100 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-6">Kassaflöde per månad</h2>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={cashflowData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => fmt(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="in" name="In" stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="out" name="Ut" stroke="#ef4444" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : !errorOverview ? (
          <div className="bg-white border border-gray-100 rounded-xl p-6 text-center text-gray-400 text-sm">
            Ingen kassaflödesdata tillgänglig — importera bankdata i <a href="/onboarding" className="text-accent underline">onboarding</a>.
          </div>
        ) : null}

        {/* Åtgärder + Transaktioner side-by-side på desktop */}
        <div className="grid md:grid-cols-2 gap-6">

          {/* Rekommendationer */}
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Rekommenderade åtgärder</h2>
            {loadingRec ? (
              <SkeletonList rows={3} />
            ) : errorRec ? (
              <ErrorBox message={errorRec} />
            ) : recommendations.length > 0 ? (
              <div className="flex flex-col gap-3">
                {recommendations.map((r, i) => {
                  const p = PRIORITY_COLORS[r.priority ?? 'medium']
                  return (
                    <div key={i} className="bg-white border border-gray-100 rounded-xl p-5">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full shrink-0 mt-0.5 ${p.dot}`} />
                          <span className="font-semibold text-primary text-sm">{r.title}</span>
                        </div>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${p.badge}`}>{p.label}</span>
                      </div>
                      <p className="text-gray-500 text-sm mb-4 pl-4">{r.description}</p>
                      <div className="flex items-center justify-between pl-4">
                        <span className="text-green-600 text-sm font-semibold">{fmt(r.estimatedValue ?? 0)}</span>
                        <button className="text-xs font-semibold text-white bg-accent px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity">
                          Åtgärda
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="bg-white border border-gray-100 rounded-xl p-6 text-center text-gray-400 text-sm">
                Inga rekommendationer just nu.
              </div>
            )}
          </div>

          {/* Senaste transaktioner */}
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Senaste transaktioner</h2>
            {loadingOverview ? (
              <SkeletonList rows={5} />
            ) : errorOverview ? (
              <ErrorBox message={errorOverview} />
            ) : transactions.length > 0 ? (
              <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs text-gray-400">
                      <th className="text-left px-5 py-3 font-medium">Datum</th>
                      <th className="text-left px-5 py-3 font-medium">Beskrivning</th>
                      <th className="text-right px-5 py-3 font-medium">Belopp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t, i) => (
                      <tr key={i} className={`${i !== 0 ? 'border-t border-gray-50' : ''}`}>
                        <td className="px-5 py-3 text-gray-400 whitespace-nowrap">{t.date}</td>
                        <td className="px-5 py-3 text-gray-700">{t.description}</td>
                        <td className={`px-5 py-3 text-right font-medium whitespace-nowrap ${t.amount < 0 ? 'text-red-500' : 'text-green-600'}`}>
                          {fmt(t.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-white border border-gray-100 rounded-xl p-6 text-center text-gray-400 text-sm">
                Inga transaktioner — importera bankdata i <a href="/onboarding" className="text-accent underline">onboarding</a>.
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

function KpiCard({ label, value, highlight }: { label: string; value: string; highlight?: 'red' | 'blue' }) {
  return (
    <div className={`bg-white border rounded-xl px-5 py-4 ${highlight === 'red' ? 'border-red-100' : highlight === 'blue' ? 'border-blue-100' : 'border-gray-100'}`}>
      <p className="text-gray-400 text-xs mb-2">{label}</p>
      <p className={`text-lg font-bold ${highlight === 'red' ? 'text-red-500' : highlight === 'blue' ? 'text-accent' : 'text-primary'}`}>{value}</p>
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="bg-red-50 border border-red-100 text-red-600 rounded-xl px-5 py-4 text-sm">{message}</div>
  )
}
