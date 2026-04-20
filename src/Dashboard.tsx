import { useEffect, useState, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Banknote, AlertCircle, BarChart2, Clock } from 'lucide-react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from 'recharts'
import Navbar from './components/Navbar'
import { SkeletonKpiCards, SkeletonChart, SkeletonList } from './components/Skeleton'
import { fetchWithAuth } from './utils/fetchWithAuth'

const API_URL = import.meta.env.VITE_API_URL as string

const MOCK_OVERVIEW: OverviewData = {
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

interface CashflowDay {
  date: string
  inflow: number
  outflow: number
}

interface Transaction {
  date: string
  description: string
  amount: number
}

interface Recommendation {
  id?: string
  title: string
  description: string
  how?: string
  estimatedValue: number
  priority: 'high' | 'medium' | 'low'
  targets?: { type: string; id: string; label: string; value: number }[]
}

interface Alert {
  id?: string
  severity: 'high' | 'medium' | 'low'
  message: string
  link?: string
  linkLabel?: string
}

interface OverviewData {
  data?: {
    summary?: { totalInflow: number; totalOutflow: number; netCashflow: number; currency: string }
    lateInvoiceCount?: number
    runwayDays?: number | null
    latestSnapshot?: unknown
    alerts?: Alert[]
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

function formatLabel(dateStr: string): string {
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}

const ALERT_CONFIG: Record<'high' | 'medium' | 'low', { bg: string; border: string; text: string; icon: string; iconBg: string }> = {
  high:   { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700',    icon: '⚠',  iconBg: 'bg-red-100' },
  medium: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', icon: '!',  iconBg: 'bg-yellow-100' },
  low:    { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   icon: 'i',  iconBg: 'bg-blue-100' },
}

const PRIORITY_CONFIG = {
  high:   { label: 'Hög prioritet', badge: 'bg-red-100 text-red-700 border-red-200',    bar: 'bg-red-500',    urgencyPct: 100, symbol: '!' },
  medium: { label: 'Medium',        badge: 'bg-yellow-100 text-yellow-700 border-yellow-200', bar: 'bg-yellow-400', urgencyPct: 60,  symbol: '~' },
  low:    { label: 'Låg',           badge: 'bg-green-100 text-green-700 border-green-200', bar: 'bg-green-400',  urgencyPct: 25,  symbol: '✓' },
}

export default function Dashboard({ onLogout: _onLogout }: { onLogout?: () => void }) {
  const navigate = useNavigate()
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [loadingOverview, setLoadingOverview] = useState(true)
  const [loadingRec, setLoadingRec] = useState(true)
  const [cashflowDays, setCashflowDays] = useState<CashflowDay[]>([])
  const [loadingCashflow, setLoadingCashflow] = useState(true)
  const [cashflowError, setCashflowError] = useState('')
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set())

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
        console.log('[DASHBOARD] summary:', json.data?.summary)
        console.log('[DASHBOARD] totalInflow:', json.data?.summary?.totalInflow)
        console.log('[DASHBOARD] totalOutflow:', json.data?.summary?.totalOutflow)
        console.log('[DASHBOARD] netCashflow:', json.data?.summary?.netCashflow)
        console.log('[DASHBOARD] lateInvoiceCount:', json.data?.lateInvoiceCount)
        console.log('[DASHBOARD] runwayDays:', json.data?.runwayDays)
        console.log('[KPI CHECK] liquidAssets:', json?.data?.summary?.totalInflow)
        console.log('[KPI CHECK] overdueInvoices:', json?.data?.lateInvoiceCount)
        console.log('[KPI CHECK] breakEven:', json?.data?.summary?.totalOutflow)
        setOverview(json)
      })
      .catch(() => { setOverview(MOCK_OVERVIEW) })
      .finally(() => setLoadingOverview(false))

    fetchWithAuth(`${API_URL}api/v1/cashflow/current`)
      .then((r) => r.json())
      .then((json) => {
        console.log('[CASHFLOW] raw response:', json)
        console.log('[CASHFLOW] json.data:', json.data)
        console.log('[CASHFLOW] json.data.series:', json.data?.series)
        const rows: CashflowDay[] = Array.isArray(json.data?.series) ? json.data.series : []
        console.log('[CASHFLOW] rows set:', rows.length, rows[0])
        setCashflowDays(rows)
      })
      .catch(() => setCashflowError('Kunde inte hämta kassaflödesdata.'))
      .finally(() => setLoadingCashflow(false))

    fetchWithAuth(`${API_URL}api/v1/recommendations/top3`)
      .then((r) => r.json())
      .then((json) => {
        console.log('[DASHBOARD] recommendations:', json)
        const actions = json.data?.actions ?? json.data ?? json ?? []
        setRecommendations(actions.map((a: Record<string, unknown>) => ({
          id: a.id,
          title: a.title,
          description: a.description,
          how: a.how,
          estimatedValue: Array.isArray(a.targets) ? (a.targets as { value: number }[]).reduce((sum, t) => sum + (t.value ?? 0), 0) : 0,
          priority: (a.impact as 'high' | 'medium' | 'low') ?? 'medium',
          targets: a.targets,
        })))
      })
      .catch(() => { setRecommendations(MOCK_RECOMMENDATIONS) })
      .finally(() => setLoadingRec(false))
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [coachHistory, coachLoading])

  const cashflowData: CashflowMonth[] = overview?.data?.cashflow ?? []

  console.log('[DASHBOARD] overview state at render:', overview)
  const kpi = useMemo(() => ({
    liquidAssets: overview?.data?.summary?.totalInflow ?? 0,
    overdueInvoices: overview?.data?.lateInvoiceCount ?? 0,
    breakEven: overview?.data?.summary?.totalOutflow ?? 0,
    runwayDays: overview?.data?.runwayDays ?? 0,
  }), [overview])
  console.log('[DASHBOARD] kpi mapped:', { liquidAssets: kpi.liquidAssets, breakEven: kpi.breakEven, overdueInvoices: kpi.overdueInvoices, runwayDays: kpi.runwayDays })

  const transactions: Transaction[] = overview?.data?.recentTransactions ?? []

  const recentCashflowRows = useMemo(() => {
    const fmtDate = (d: string) => {
      const date = new Date(d)
      return isNaN(date.getTime()) ? d : date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
    }
    return cashflowDays
      .filter(d => d.inflow > 0 || d.outflow > 0)
      .slice(-10)
      .reverse()
      .flatMap(d => {
        const rows: { label: string; type: string; amount: number }[] = []
        if (d.inflow > 0) rows.push({ label: fmtDate(d.date), type: 'Inflöde', amount: d.inflow })
        if (d.outflow > 0) rows.push({ label: fmtDate(d.date), type: 'Utflöde', amount: -d.outflow })
        return rows
      })
  }, [cashflowDays])

  const periodLabel = useMemo(() => {
    if (cashflowDays.length < 2) return ''
    const toLabel = (d: Date) => d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
    return `${toLabel(new Date(cashflowDays[0].date))} till ${toLabel(new Date(cashflowDays[cashflowDays.length - 1].date))}`
  }, [cashflowDays])

  const alerts = useMemo(() => {
    const raw = overview?.data?.alerts ?? []
    return raw.filter(a => !dismissedAlerts.has(a.id ?? a.message))
  }, [overview, dismissedAlerts])

  const quickStats = useMemo(() => {
    const active = cashflowDays.filter(d => d.inflow > 0 || d.outflow > 0)
    const totalTx = active.length
    const avgInflow = active.length > 0 ? active.reduce((s, d) => s + d.inflow, 0) / active.length : 0
    const bestDay = active.reduce<CashflowDay | null>((best, d) => (!best || d.inflow > best.inflow ? d : best), null)
    return { totalTx, avgInflow, bestDay }
  }, [cashflowDays])

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

        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="flex flex-col gap-2">
            {alerts.map((alert, i) => {
              const cfg = ALERT_CONFIG[alert.severity ?? 'low']
              const key = alert.id ?? alert.message ?? String(i)
              return (
                <div key={key} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${cfg.bg} ${cfg.border}`}>
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${cfg.iconBg} ${cfg.text}`}>
                    {cfg.icon}
                  </span>
                  <p className={`text-sm flex-1 font-medium ${cfg.text}`}>{alert.message}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    {alert.link && (
                      <button onClick={() => navigate(alert.link!)} className={`text-xs font-semibold underline ${cfg.text} hover:opacity-70`}>
                        {alert.linkLabel ?? 'Visa →'}
                      </button>
                    )}
                    <button
                      onClick={() => setDismissedAlerts(s => new Set([...s, key]))}
                      className={`${cfg.text} opacity-40 hover:opacity-70 text-xl leading-none`}
                    >
                      ×
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* KPI-kort */}
        {loadingOverview ? (
          <SkeletonKpiCards />
        ) : (() => {
          const netCashflow = overview?.data?.summary?.netCashflow ?? 0
          const liquidTrend: KpiTrend = netCashflow > 0 ? 'up' : netCashflow < 0 ? 'down' : 'neutral'
          const overdueTrend: KpiTrend = kpi.overdueInvoices === 0 ? 'up' : 'down'
          const breakEvenTrend: KpiTrend = kpi.liquidAssets > kpi.breakEven ? 'up' : kpi.liquidAssets < kpi.breakEven ? 'down' : 'neutral'
          const runwayTrend: KpiTrend = kpi.runwayDays > 90 ? 'up' : kpi.runwayDays > 30 ? 'neutral' : 'down'
          const runwayAccent: KpiAccent = kpi.runwayDays > 90 ? 'green' : kpi.runwayDays > 30 ? 'yellow' : 'red'
          return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard
                icon={<Banknote className="w-5 h-5" />}
                label="Likvida medel"
                value={fmt(kpi.liquidAssets)}
                subtitle="Totalt inflöde"
                trend={liquidTrend}
                trendLabel={netCashflow >= 0 ? 'Positivt netto' : 'Negativt netto'}
                accent="blue"
                onClick={() => navigate('/cashflow')}
                onExplain={() => explainThis('cashflow', { type: 'liquidAssets', value: kpi.liquidAssets })}
              />
              <KpiCard
                icon={<AlertCircle className="w-5 h-5" />}
                label="Förfallna fakturor"
                value={`${kpi.overdueInvoices} st`}
                subtitle="Kräver uppföljning"
                trend={overdueTrend}
                trendLabel={kpi.overdueInvoices === 0 ? 'Allt i ordning' : 'Kräver åtgärd'}
                accent={kpi.overdueInvoices === 0 ? 'green' : 'red'}
                onClick={() => navigate('/invoices')}
                onExplain={() => explainThis('diagnosis', { type: 'overdueInvoices', value: kpi.overdueInvoices })}
              />
              <KpiCard
                icon={<BarChart2 className="w-5 h-5" />}
                label="Break-even"
                value={fmt(kpi.breakEven)}
                subtitle="Totalt utflöde"
                trend={breakEvenTrend}
                trendLabel={breakEvenTrend === 'up' ? 'Inflöde > utflöde' : breakEvenTrend === 'down' ? 'Utflöde > inflöde' : 'I balans'}
                accent="purple"
                onClick={() => navigate('/breakeven')}
                onExplain={() => explainThis('diagnosis', { type: 'breakEven', value: kpi.breakEven })}
              />
              <KpiCard
                icon={<Clock className="w-5 h-5" />}
                label="Runway"
                value={`${kpi.runwayDays} dagar`}
                subtitle="Beräknat kassaflöde"
                trend={runwayTrend}
                trendLabel={kpi.runwayDays > 90 ? 'Stark likviditet' : kpi.runwayDays > 30 ? 'Bevaka noggrant' : 'Kritiskt lågt'}
                accent={runwayAccent}
                onClick={() => navigate('/runway')}
                onExplain={() => explainThis('diagnosis', { type: 'runway', value: kpi.runwayDays })}
              />
            </div>
          )
        })()}

        {/* Snabb-statistik */}
        {!loadingCashflow && cashflowDays.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white border border-gray-100 rounded-xl px-5 py-4 shadow-sm text-center">
              <p className="text-2xl font-bold text-gray-900">{quickStats.totalTx}</p>
              <p className="text-xs text-gray-400 mt-1">Aktiva dagar</p>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl px-5 py-4 shadow-sm text-center">
              <p className="text-xl font-bold text-gray-900">{fmt(Math.round(quickStats.avgInflow))}</p>
              <p className="text-xs text-gray-400 mt-1">Genomsnittligt dagligt inflöde</p>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl px-5 py-4 shadow-sm text-center">
              <p className="text-xl font-bold text-gray-900">{fmt(quickStats.bestDay?.inflow ?? 0)}</p>
              <p className="text-xs text-gray-400 mt-1">
                Bästa dag{quickStats.bestDay?.date ? ` — ${new Date(quickStats.bestDay.date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}` : ''}
              </p>
            </div>
          </div>
        )}

        {/* Kassaflödes-graf */}
        {loadingCashflow ? (
          <SkeletonChart />
        ) : cashflowError ? (
          <div className="bg-white border border-gray-100 rounded-xl p-6 text-center text-red-400 text-sm">
            {cashflowError}
          </div>
        ) : cashflowDays.length > 0 ? (
          <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-sm font-bold text-gray-700 mb-0.5">Kassaflöde</h2>
                {periodLabel && <p className="text-xs text-gray-400">{periodLabel}</p>}
              </div>
              <button
                onClick={() => explainThis('cashflow', { cashflow: cashflowDays })}
                className="flex items-center gap-1.5 text-xs font-medium text-accent border border-accent/30 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
              >
                <SparkleIcon /> Förklara detta
              </button>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={cashflowDays.map(p => ({ ...p, label: formatLabel(p.date) }))} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="inflowGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="outflowGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.13} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} width={42} />
                <ReferenceLine y={0} stroke="#e5e7eb" strokeWidth={1.5} strokeDasharray="4 3" />
                <Tooltip content={<CashflowTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                <Area type="monotone" dataKey="inflow" name="Inflöde" stroke="#2563eb" strokeWidth={2} fill="url(#inflowGrad)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                <Area type="monotone" dataKey="outflow" name="Utflöde" stroke="#ef4444" strokeWidth={2} fill="url(#outflowGrad)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
              </AreaChart>
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
            <h2 className="text-base font-bold text-gray-800 mb-4">Rekommenderade åtgärder</h2>
            {loadingRec ? (
              <SkeletonList rows={3} />
            ) : recommendations.length > 0 ? (
              <div className="flex flex-col gap-3">
                {recommendations.map((r, i) => (
                  <RecommendationCard key={r.id ?? i} r={r} onExplain={() => explainThis('recommendation', { title: r.title, description: r.description, estimatedValue: r.estimatedValue })} />
                ))}
              </div>
            ) : (
              <div className="bg-white border border-gray-100 rounded-xl p-6 text-center text-gray-400 text-sm">
                Inga rekommendationer just nu.
              </div>
            )}
          </div>

          {/* Senaste transaktioner */}
          <div>
            <h2 className="text-base font-bold text-gray-800 mb-4">Senaste transaktioner</h2>
            {loadingCashflow ? (
              <SkeletonList rows={5} />
            ) : recentCashflowRows.length > 0 ? (
              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs text-gray-400">
                      <th className="text-left px-5 py-3 font-medium">Datum</th>
                      <th className="text-left px-5 py-3 font-medium">Typ</th>
                      <th className="text-right px-5 py-3 font-medium">Belopp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentCashflowRows.map((t, i) => (
                      <tr key={i} className={`${i !== 0 ? 'border-t border-gray-50' : ''} ${i % 2 === 1 ? 'bg-gray-50/60' : ''}`}>
                        <td className="px-5 py-3 text-gray-400 whitespace-nowrap">{t.label}</td>
                        <td className="px-5 py-3 text-gray-700">{t.type}</td>
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

function CashflowTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2 mb-1 last:mb-0">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
          <span className="text-gray-500 w-16">{p.name}:</span>
          <span className="font-semibold" style={{ color: p.color }}>{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

function RecommendationCard({ r, onExplain }: { r: Recommendation; onExplain: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const p = PRIORITY_CONFIG[r.priority ?? 'medium']

  return (
    <div className="group bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200">
      {/* Urgency strip */}
      <div className="h-1 w-full bg-gray-100">
        <div className={`h-full ${p.bar} transition-all`} style={{ width: `${p.urgencyPct}%` }} />
      </div>

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border mb-1.5 ${p.badge}`}>
              <span className="font-mono">{p.symbol}</span> {p.label}
            </span>
            <h3 className="font-semibold text-gray-900 text-sm leading-snug">{r.title}</h3>
          </div>
          <button
            onClick={onExplain}
            className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-accent hover:text-accent/70 mt-1"
            title="Förklara med AI"
          >
            <SparkleIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Description */}
        <p className="text-gray-500 text-sm leading-relaxed mb-4">{r.description}</p>

        {/* Potential value */}
        {(r.estimatedValue ?? 0) > 0 && (
          <div className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-xl px-3 py-2.5 mb-4">
            <span className="text-green-500 text-xl font-bold leading-none">↑</span>
            <div>
              <p className="text-[10px] font-bold text-green-600 uppercase tracking-widest">Möjlig förbättring</p>
              <p className="text-base font-bold text-green-700 leading-tight">{fmt(r.estimatedValue)}</p>
            </div>
          </div>
        )}

        {/* How to */}
        {r.how && (
          <div className="mb-4">
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-xs text-accent font-semibold flex items-center gap-1.5 hover:underline"
            >
              <span className="text-[9px]">{expanded ? '▼' : '▶'}</span> Hur gör jag?
            </button>
            {expanded && (
              <p className="text-gray-600 text-sm mt-2 leading-relaxed border-l-2 border-accent/30 pl-3">{r.how}</p>
            )}
          </div>
        )}

        {/* Targets */}
        {r.targets && r.targets.length > 0 && (
          <div className="mb-4 border border-gray-100 rounded-xl overflow-hidden">
            {r.targets.slice(0, 3).map((t, i) => (
              <div key={t.id ?? i} className={`flex items-center justify-between px-3 py-2 text-xs ${i !== 0 ? 'border-t border-gray-50' : ''}`}>
                <span className="text-gray-600 font-medium truncate mr-2">{t.label}</span>
                <span className="font-semibold text-gray-800 shrink-0">{fmt(t.value)}</span>
              </div>
            ))}
            {r.targets.length > 3 && (
              <div className="px-3 py-1.5 text-xs text-gray-400 border-t border-gray-50 bg-gray-50">
                +{r.targets.length - 3} till
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onExplain}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-accent border border-accent/30 px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors"
          >
            <SparkleIcon className="w-3 h-3" /> Förklara
          </button>
          <button className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-accent px-3 py-2 rounded-lg hover:bg-blue-700 active:scale-95 transition-all duration-150">
            Åtgärda <span className="text-sm leading-none">→</span>
          </button>
        </div>
      </div>
    </div>
  )
}

type KpiAccent = 'blue' | 'green' | 'red' | 'orange' | 'purple' | 'yellow'
type KpiTrend = 'up' | 'down' | 'neutral'

const ACCENT_STYLES: Record<KpiAccent, { border: string; iconBg: string; iconText: string }> = {
  blue:   { border: 'border-l-blue-500',   iconBg: 'bg-blue-50',   iconText: 'text-blue-600' },
  green:  { border: 'border-l-green-500',  iconBg: 'bg-green-50',  iconText: 'text-green-600' },
  red:    { border: 'border-l-red-500',    iconBg: 'bg-red-50',    iconText: 'text-red-500' },
  orange: { border: 'border-l-orange-500', iconBg: 'bg-orange-50', iconText: 'text-orange-600' },
  purple: { border: 'border-l-purple-500', iconBg: 'bg-purple-50', iconText: 'text-purple-600' },
  yellow: { border: 'border-l-yellow-400', iconBg: 'bg-yellow-50', iconText: 'text-yellow-600' },
}

const TREND_STYLES: Record<KpiTrend, { arrow: string; text: string; bg: string }> = {
  up:      { arrow: '↑', text: 'text-green-600', bg: 'bg-green-50' },
  down:    { arrow: '↓', text: 'text-red-500',   bg: 'bg-red-50' },
  neutral: { arrow: '→', text: 'text-yellow-600', bg: 'bg-yellow-50' },
}

function KpiCard({ icon, label, value, subtitle, trend, trendLabel, accent = 'blue', onExplain, onClick }: {
  icon: React.ReactNode
  label: string
  value: string
  subtitle?: string
  trend?: KpiTrend
  trendLabel?: string
  accent?: KpiAccent
  onExplain?: () => void
  onClick?: () => void
}) {
  const c = ACCENT_STYLES[accent]
  const t = trend ? TREND_STYLES[trend] : null

  return (
    <div
      onClick={onClick}
      className={`bg-white border border-gray-100 border-l-4 ${c.border} rounded-2xl px-5 py-6 group relative shadow-sm hover:shadow-lg transition-all duration-200 ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.iconBg} ${c.iconText}`}>
          {icon}
        </div>
        {onExplain && (
          <button
            onClick={e => { e.stopPropagation(); onExplain() }}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-accent hover:text-accent/70"
            title="Förklara med AI"
          >
            <SparkleIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">{label}</p>
      <p className="text-2xl font-bold text-gray-900 tracking-tight mb-3">{value}</p>

      <div className="flex items-center justify-between gap-2">
        {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
        {t && trendLabel && (
          <span className={`ml-auto shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${t.text} ${t.bg}`}>
            {t.arrow} {trendLabel}
          </span>
        )}
      </div>
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
