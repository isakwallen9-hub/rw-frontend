import { useEffect, useState } from 'react'
import axios from 'axios'

const API_URL = 'https://divine-warmth-production.up.railway.app/'

interface LatePayor {
  name: string
  amount: number
  daysSince: number
}

interface Overview {
  totalOutstanding: number
  totalOverdue: number
  avgPaymentDays: number
  bestCustomer: string
  topLatePayors: LatePayor[]
}

interface Recommendation {
  title: string
  description: string
  estimatedValue: number
}

function fmt(amount: number) {
  return amount.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 })
}

export default function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('token')
    console.log('[DASHBOARD] token från localStorage:', token)

    if (!token || token === 'undefined' || token === 'null') {
      console.error('[DASHBOARD] Ingen giltig token — skickar tillbaka till login')
      setError('Din session har gått ut. Logga in igen.')
      setLoading(false)
      return
    }

    const headers = { Authorization: `Bearer ${token}` }
    console.log('[DASHBOARD] Authorization header (exakt):', JSON.stringify(headers.Authorization))

    Promise.all([
      axios.get(`${API_URL}api/v1/dashboard/overview`, { headers }),
      axios.get(`${API_URL}api/v1/recommendations/top3`, { headers }),
    ])
      .then(([ovRes, recRes]) => {
        console.log('[DASHBOARD] overview:', JSON.stringify(ovRes.data, null, 2))
        console.log('[DASHBOARD] recommendations:', JSON.stringify(recRes.data, null, 2))
        setOverview(ovRes.data.data ?? ovRes.data)
        setRecommendations(recRes.data.data ?? recRes.data ?? [])
      })
      .catch((err) => {
        console.error('[DASHBOARD] HTTP status:', err.response?.status)
        console.error('[DASHBOARD] error body:', JSON.stringify(err.response?.data, null, 2))
        setError(`Kunde inte hämta data (${err.response?.status ?? 'nätverksfel'}). Kontrollera konsolen.`)
      })
      .finally(() => setLoading(false))
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('token')
    onLogout()
  }

  const latePayors: LatePayor[] = overview?.topLatePayors ?? []

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Navbar */}
      <div className="border-b border-gray-800 px-8 py-4 flex justify-between items-center">
        <span className="font-semibold text-lg tracking-tight">RWS</span>
        <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-white transition-colors">
          Logga ut
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-8 py-8 flex flex-col gap-8">

        {loading && (
          <div className="text-gray-500 text-sm text-center py-16">Laddar dashboard...</div>
        )}

        {!loading && error && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {!loading && overview && (
          <>
            {/* Alert — förfallna fordringar */}
            {overview.totalOverdue > 0 && (
              <div className="bg-amber-900/40 border border-amber-700 rounded-lg px-5 py-4 flex items-center gap-3">
                <span className="text-amber-400 text-lg">⚠</span>
                <p className="text-amber-200 text-sm">
                  Du har totalt <span className="font-semibold">{fmt(overview.totalOverdue)}</span> i förfallna fordringar som kräver åtgärd.
                </p>
              </div>
            )}

            {/* KPI-kort */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label="Totalt utestående" value={fmt(overview.totalOutstanding)} />
              <KpiCard label="Förfallet" value={fmt(overview.totalOverdue)} highlight />
              <KpiCard label="Snitt betalningstid" value={`${overview.avgPaymentDays} dagar`} />
              <KpiCard label="Bästa kund" value={overview.bestCustomer ?? '—'} />
            </div>

            {/* Top 5 sena betalare */}
            <div>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Top 5 sena betalare</h2>
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                {latePayors.length > 0 ? (
                  latePayors.slice(0, 5).map((p, i) => (
                    <div key={i} className={`flex items-center justify-between px-5 py-4 ${i !== 0 ? 'border-t border-gray-800' : ''}`}>
                      <div className="flex items-center gap-3">
                        <span className="text-gray-600 text-sm w-4">{i + 1}</span>
                        <span className="text-white text-sm font-medium">{p.name}</span>
                      </div>
                      <div className="flex items-center gap-6 text-sm">
                        <span className="text-white font-medium">{fmt(p.amount)}</span>
                        <span className="text-red-400">{p.daysSince} dagar sen</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-5 py-8 text-center text-gray-600 text-sm">Inga sena betalare.</div>
                )}
              </div>
            </div>

            {/* Rekommenderade åtgärder */}
            <div>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Rekommenderade åtgärder</h2>
              <div className="flex flex-col gap-3">
                {recommendations.length > 0 ? (
                  recommendations.map((r, i) => (
                    <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 flex items-start justify-between gap-4">
                      <div>
                        <p className="text-white text-sm font-medium">{r.title}</p>
                        <p className="text-gray-400 text-sm mt-1">{r.description}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-green-400 text-sm font-semibold">{fmt(r.estimatedValue)}</p>
                        <p className="text-gray-600 text-xs mt-0.5">est. värde</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-8 text-center text-gray-600 text-sm">
                    Inga rekommendationer just nu.
                  </div>
                )}
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  )
}

function KpiCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`bg-gray-900 border rounded-xl px-5 py-4 ${highlight ? 'border-red-800' : 'border-gray-800'}`}>
      <p className="text-gray-400 text-xs mb-2">{label}</p>
      <p className={`text-lg font-semibold ${highlight ? 'text-red-400' : 'text-white'}`}>{value}</p>
    </div>
  )
}
