import { useEffect, useState, useRef } from 'react'
import { Banknote, AlertCircle, BarChart2, Clock } from 'lucide-react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import Navbar from './components/Navbar'
import { SkeletonKpiCards, SkeletonChart, SkeletonList } from './components/Skeleton'
import { fetchWithAuth } from './utils/fetchWithAuth'

const API_URL = 'https://divine-warmth-production.up.railway.app/'

const MOCK_OVERVIEW = {
  data: {
    summary: { totalInflow: 255000, totalOutflow: 198000, netCashflow: 65000, currency: 'SEK' },
    lateInvoiceCount: 3,
    runwayDays: 47,
    cashflow: [
      { month: 'Okt', in: 210000, out: 175000 },
      { month: 'Nov', in: 195000, out: 188000 },
      { month: 'Dec', in: 240000, out: 160000 },
      { month: 'Jan', in: 178000, out: 202000 },
      { month: 'Feb', in: 220000, out: 191000 },
      { month: 'Mar', in: 255000, out: 198000 },
    ],
    recentTransactions: [
      { date: '2026-03-22', description: 'Inbetalning — Bergström & Co', amount: 48500 },
      { date: '2026-03-20', description: 'Hyra mars', amount: -24000 },
      { date: '2026-03-18', description: 'Inbetalning — Lindqvist AB', amount: 31200 },
      { date: '2026-03-15', description: 'Löner', amount: -87000 },
      { date: '2026-03-12', description: 'Inbetalning — Nordin Group', amount: 19800 },
    ],
  },
}

const MOCK_RECOMMENDATIONS: Recommendation[] = [
  { priority: 'high', title: 'Påminn om förfallna fakturor', description: '3 fakturor är >30 dagar förfallna. Skicka betalningspåminnelse omgående.', estimatedValue: 76300 },
  { priority: 'medium', title: 'Förhandla betalningsvillkor', description: 'Minska standard betalningstid från 30 till 14 dagar för nya kunder.', estimatedValue: 32000 },
  { priority: 'low', title: 'Se över fasta kostnader', description: 'Leasingkostnad kan minskas med ~15% vid omförhandling i april.', estimatedValue: 8400 },
]

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
  data?: {
    summary?: { totalInflow: number; totalOutflow: number; netCashflow: number; currency: string }
    lateInvoiceCount?: number
    runwayDays?: number | null
    latestSnapshot?: unknown
    alerts?: unknown[]
    cashflow?: CashflowMonth[]
    recentTransactions?: Transaction[]
  }
}

interface ChatMessage {
  role: 'user' | 'ai'
  text: string
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

  // AI Explain modal
  const [explainOpen, setExplainOpen] = useState(false)
  const [explainLoading, setExplainLoading] = useState(false)
  const [explainMessage, setExplainMessage] = useState('')
  const [explainError, setExplainError] = useState('')

  // AI Coach panel
  const [coachOpen, setCoachOpen] = useState(false)
  const [coachHistory, setCoachHistory] = useState<ChatMessage[]>([])
  const [coachInput, setCoachInput] = useState('')
  const [coachLoading, setCoachLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const token = localStorage.getItem('accessToken')
    if (!token || token === 'undefined' || token === 'null') {
      window.location.href = '/login'
      return
    }

    fetchWithAuth(`${API_URL}api/v1/dashboard/overview`)
      .then((r) => r.json())
      .then((json) => {
        console.log('[DASHBOARD] overview raw:', json)
        console.log('[DASHBOARD] overview.data:', json.data)
        console.log('[DASHBOARD] summary:', json.data?.data?.summary)
        console.log('[DASHBOARD] totalInflow:', json.data?.data?.summary?.totalInflow)
        console.log('[DASHBOARD] totalOutflow:', json.data?.data?.summary?.totalOutflow)
        console.log('[DASHBOARD] netCashflow:', json.data?.data?.summary?.netCashflow)
        console.log('[DASHBOARD] lateInvoiceCount:', json.data?.data?.lateInvoiceCount)
        console.log('[DASHBOARD] runwayDays:', json.data?.data?.runwayDays)
        setOverview(json.data ?? json)
      })
      .catch(() => { setOverview(MOCK_OVERVIEW) })
      .finally(() => setLoadingOverview(false))

    fetchWithAuth(`${API_URL}api/v1/recommendations/top3`)
      .then((r) => r.json())
      .then((json) => {
        console.log('[DASHBOARD] recommendations:', json)
        setRecommendations(json.data ?? json ?? [])
      })
      .catch(() => { setRecommendations(MOCK_RECOMMENDATIONS) })
      .finally(() => setLoadingRec(false))
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [coachHistory, coachLoading])

  const cashflowData: CashflowMonth[] = overview?.data?.cashflow ?? []

  const kpi = {
    liquidAssets: overview?.data?.summary?.netCashflow ?? 0,
    overdueInvoices: overview?.data?.lateInvoiceCount ?? 0,
    breakEven: overview?.data?.summary?.totalOutflow ?? 0,
    runwayDays: overview?.data?.runwayDays ?? 0,
  }
  console.log('[DASHBOARD] kpi mapped:', kpi)

  const transactions: Transaction[] = overview?.data?.recentTransactions ?? []

  const hasData = !loadingOverview && (
    kpi.liquidAssets !== 0 || kpi.overdueInvoices !== 0 || kpi.runwayDays !== 0 || cashflowData.length > 0 || transactions.length > 0
  )

  const explainThis = async (contextType: string, data: object) => {
    setExplainOpen(true)
    setExplainLoading(true)
    setExplainMessage('')
    setExplainError('')
    try {
      const res = await fetchWithAuth(`${API_URL}api/v1/ai-explanations/explain`, {
        method: 'POST',
        body: JSON.stringify({ contextType, data }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`)
      setExplainMessage(json.data?.message ?? 'Ingen förklaring tillgänglig.')
    } catch (err) {
      setExplainError(err instanceof Error ? err.message : 'Kunde inte hämta förklaring.')
    }
    setExplainLoading(false)
  }

  const sendCoachMessage = async () => {
    const question = coachInput.trim()
    if (!question || coachLoading) return
    setCoachInput('')
    setCoachHistory((prev) => [...prev, { role: 'user', text: question }])
    setCoachLoading(true)
    try {
      const res = await fetchWithAuth(`${API_URL}api/v1/ai-explanations/assist`, {
        method: 'POST',
        body: JSON.stringify({ question, context: { kpi, cashflow: cashflowData } }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`)
      setCoachHistory((prev) => [...prev, { role: 'ai', text: json.data?.message ?? 'Inget svar.' }])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Fel vid anrop.'
      setCoachHistory((prev) => [...prev, { role: 'ai', text: `Kunde inte svara: ${msg}` }])
    }
    setCoachLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8 flex flex-col gap-8">

        {/* Onboarding-banner */}
        {!loadingOverview && !hasData && (
          <div className="rounded-2xl bg-primary px-8 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 shadow-lg">
            <div>
              <p className="text-white font-bold text-xl mb-1">Kom igång med RW Systems</p>
              <p className="text-blue-200 text-sm leading-relaxed max-w-md">
                Ladda upp din ekonomidata för att se din kassaflödesanalys och få konkreta åtgärder.
              </p>
            </div>
            <a href="/onboarding"
              className="shrink-0 bg-white text-primary font-bold text-sm px-6 py-3 rounded-xl hover:bg-blue-50 transition-colors shadow-sm whitespace-nowrap">
              Starta onboarding →
            </a>
          </div>
        )}

        {/* KPI-kort */}
        {loadingOverview ? (
          <SkeletonKpiCards />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard icon={<Banknote className="w-4 h-4" />} label="Likvida medel" value={fmt(kpi.liquidAssets)}
              onExplain={() => explainThis('cashflow', { type: 'liquidAssets', value: kpi.liquidAssets })} />
            <KpiCard icon={<AlertCircle className="w-4 h-4" />} label="Förfallna fakturor" value={fmt(kpi.overdueInvoices)} highlight="red"
              onExplain={() => explainThis('diagnosis', { type: 'overdueInvoices', value: kpi.overdueInvoices })} />
            <KpiCard icon={<BarChart2 className="w-4 h-4" />} label="Break-even" value={fmt(kpi.breakEven)}
              onExplain={() => explainThis('diagnosis', { type: 'breakEven', value: kpi.breakEven })} />
            <KpiCard icon={<Clock className="w-4 h-4" />} label="Runway" value={`${kpi.runwayDays} dagar`} highlight="blue"
              onExplain={() => explainThis('diagnosis', { type: 'runway', value: kpi.runwayDays })} />
          </div>
        )}

        {/* Kassaflödes-graf */}
        {loadingOverview ? (
          <SkeletonChart />
        ) : cashflowData.length > 0 ? (
          <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wider">Kassaflöde per månad</h2>
              <button
                onClick={() => explainThis('cashflow', { cashflow: cashflowData })}
                className="flex items-center gap-1.5 text-xs font-medium text-accent border border-accent/30 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
              >
                <SparkleIcon /> Förklara detta
              </button>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={cashflowData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmt(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="in" name="In" stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="out" name="Ut" stroke="#ef4444" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="bg-white border border-gray-100 rounded-xl p-6 text-center text-gray-400 text-sm">
            Ingen kassaflödesdata tillgänglig — importera bankdata i <a href="/onboarding" className="text-accent underline">onboarding</a>.
          </div>
        )}

        {/* Åtgärder + Transaktioner */}
        <div className="grid md:grid-cols-2 gap-6">

          {/* Rekommendationer */}
          <div>
            <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wider mb-3">Rekommenderade åtgärder</h2>
            {loadingRec ? (
              <SkeletonList rows={3} />
            ) : recommendations.length > 0 ? (
              <div className="flex flex-col gap-3">
                {recommendations.map((r, i) => {
                  const p = PRIORITY_COLORS[r.priority ?? 'medium']
                  return (
                    <div key={i} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
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
                        <div className="flex gap-2">
                          <button
                            onClick={() => explainThis('recommendation', { title: r.title, description: r.description, estimatedValue: r.estimatedValue })}
                            className="text-xs font-medium text-accent border border-accent/30 px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition-colors flex items-center gap-1"
                          >
                            <SparkleIcon /> Förklara
                          </button>
                          <button className="text-xs font-semibold text-white bg-accent px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity">
                            Åtgärda
                          </button>
                        </div>
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
            <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wider mb-3">Senaste transaktioner</h2>
            {loadingOverview ? (
              <SkeletonList rows={5} />
            ) : transactions.length > 0 ? (
              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
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

      {/* AI Explain Modal */}
      {explainOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setExplainOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-primary font-semibold">
                <SparkleIcon className="w-4 h-4 text-accent" /> AI-förklaring
              </div>
              <button onClick={() => setExplainOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            {explainLoading ? (
              <div className="flex items-center gap-3 py-6 text-gray-400 text-sm">
                <span className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0" />
                Hämtar förklaring...
              </div>
            ) : explainError ? (
              <p className="text-red-500 text-sm py-2">{explainError}</p>
            ) : (
              <p className="text-gray-700 text-sm leading-relaxed">{explainMessage}</p>
            )}
            <button onClick={() => setExplainOpen(false)} className="mt-5 w-full text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-lg transition-colors">
              Stäng
            </button>
          </div>
        </div>
      )}

      {/* AI Coach Panel */}
      <div className={`fixed bottom-0 right-0 z-40 flex flex-col transition-all duration-300 ${coachOpen ? 'w-full sm:w-96 h-[520px]' : 'w-auto h-auto'}`}>
        {coachOpen && (
          <div className="flex flex-col h-full bg-white border border-gray-200 rounded-t-2xl sm:rounded-2xl sm:mb-20 sm:mr-6 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 bg-primary">
              <div className="flex items-center gap-2 text-white font-semibold text-sm">
                <SparkleIcon className="w-4 h-4" /> Ekonomicoach
              </div>
              <button onClick={() => setCoachOpen(false)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
              {coachHistory.length === 0 && (
                <div className="text-center text-gray-400 text-sm mt-4">
                  <p className="font-medium text-gray-500 mb-1">Hej! Jag är din ekonomicoach.</p>
                  <p>Ställ en fråga om ditt kassaflöde, fakturor eller åtgärder.</p>
                  <div className="flex flex-col gap-2 mt-4">
                    {['Vad betyder runway 47 dagar?', 'Hur förbättrar jag mitt kassaflöde?', 'Vilka fakturor bör jag prioritera?'].map((q) => (
                      <button key={q} onClick={() => { setCoachInput(q) }} className="text-xs text-left border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors text-gray-600">
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {coachHistory.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-accent text-white rounded-br-sm'
                      : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {coachLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            {/* Input */}
            <div className="border-t border-gray-100 px-4 py-3 flex gap-2">
              <input
                value={coachInput}
                onChange={(e) => setCoachInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCoachMessage() } }}
                placeholder="Skriv din fråga..."
                className="flex-1 text-sm border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              <button
                onClick={sendCoachMessage}
                disabled={coachLoading || !coachInput.trim()}
                className="bg-accent text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                Skicka
              </button>
            </div>
          </div>
        )}

        {/* Floating button */}
        {!coachOpen && (
          <button
            onClick={() => setCoachOpen(true)}
            className="fixed bottom-6 right-6 bg-primary text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors"
            title="Öppna ekonomicoach"
          >
            <SparkleIcon className="w-6 h-6" />
          </button>
        )}
      </div>
    </div>
  )
}

function KpiCard({ icon, label, value, highlight, onExplain }: {
  icon?: React.ReactNode; label: string; value: string; highlight?: 'red' | 'blue'; onExplain?: () => void
}) {
  return (
    <div className={`bg-white border rounded-2xl px-5 py-5 group relative shadow-sm hover:shadow-md transition-shadow ${highlight === 'red' ? 'border-red-100' : highlight === 'blue' ? 'border-blue-100' : 'border-gray-100'}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon && <span className="text-lg leading-none">{icon}</span>}
          <p className="text-gray-500 text-xs font-medium">{label}</p>
        </div>
        {onExplain && (
          <button
            onClick={onExplain}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-accent hover:text-accent/70 shrink-0"
            title="Förklara med AI"
          >
            <SparkleIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <p className={`text-xl font-bold ${highlight === 'red' ? 'text-red-500' : highlight === 'blue' ? 'text-accent' : 'text-primary'}`}>{value}</p>
    </div>
  )
}

function SparkleIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    </svg>
  )
}
