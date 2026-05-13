import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, AlertCircle, Info, Clock, FileWarning, Flame, TrendingDown, Activity, RefreshCw } from 'lucide-react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts'
import Navbar from '../components/Navbar'
import { fetchWithAuth } from '../utils/fetchWithAuth'

const API_URL = import.meta.env.VITE_API_URL as string
const LS_DIAGNOSIS_KEY = 'rw_diagnosis_history'
const MAX_HISTORY = 30

interface ComponentScore {
  name: string
  label?: string
  score: number
  maxScore: number
  description?: string
}

interface DiagnosisData {
  score: number
  grade?: string
  components?: ComponentScore[]
  summary?: string
}

interface RootCause {
  id?: string
  title: string
  description?: string
  severity: 'high' | 'medium' | 'low'
  action?: string
}

interface HistoryEntry {
  date: string
  score: number
}

function scoreConfig(score: number) {
  if (score >= 80) return { grade: 'A', stroke: '#16a34a', textColor: 'text-green-600', label: 'Utmärkt',  bg: 'bg-green-50'  }
  if (score >= 65) return { grade: 'B', stroke: '#65a30d', textColor: 'text-lime-600',  label: 'Bra',       bg: 'bg-lime-50'   }
  if (score >= 50) return { grade: 'C', stroke: '#ca8a04', textColor: 'text-yellow-600',label: 'Godkänt',  bg: 'bg-yellow-50' }
  if (score >= 35) return { grade: 'D', stroke: '#ea580c', textColor: 'text-orange-600',label: 'Svagt',    bg: 'bg-orange-50' }
  return               { grade: 'F', stroke: '#dc2626', textColor: 'text-red-600',    label: 'Kritiskt', bg: 'bg-red-50'    }
}

function barColor(score: number, max: number): string {
  const pct = max > 0 ? score / max : 0
  if (pct >= 0.7) return 'bg-green-500'
  if (pct >= 0.4) return 'bg-yellow-400'
  return 'bg-red-500'
}

function loadHistory(): HistoryEntry[] {
  try {
    const saved = localStorage.getItem(LS_DIAGNOSIS_KEY)
    return saved ? (JSON.parse(saved) as HistoryEntry[]) : []
  } catch { return [] }
}

function pushHistory(score: number): HistoryEntry[] {
  const today = new Date().toISOString().slice(0, 10)
  const history = loadHistory().filter(e => e.date !== today)
  const updated = [...history, { date: today, score }].slice(-MAX_HISTORY)
  try { localStorage.setItem(LS_DIAGNOSIS_KEY, JSON.stringify(updated)) } catch { /* quota */ }
  return updated
}

const COMPONENT_META: Record<string, { label: string; icon: React.ReactNode }> = {
  runway:           { label: 'Runway',             icon: <Clock className="w-4 h-4" /> },
  overdue_invoices: { label: 'Förfallna fakturor', icon: <FileWarning className="w-4 h-4" /> },
  cashflow_trend:   { label: 'Kassaflödestrender', icon: <TrendingDown className="w-4 h-4" /> },
  burn_rate:        { label: 'Burn rate',           icon: <Flame className="w-4 h-4" /> },
}

const SEVERITY_CONFIG = {
  high:   { label: 'Hög',    bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700',    iconBg: 'bg-red-100'    },
  medium: { label: 'Medium', bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', iconBg: 'bg-yellow-100' },
  low:    { label: 'Låg',    bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   iconBg: 'bg-blue-100'   },
}

const MOCK_DIAGNOSIS: DiagnosisData = {
  score: 62,
  summary: 'Din ekonomi är i relativt gott skick men det finns förbättringsområden — framförallt gällande förfallna fakturor och burn rate.',
  components: [
    { name: 'runway',           score: 18, maxScore: 25, description: '47 dagars runway' },
    { name: 'overdue_invoices', score: 12, maxScore: 25, description: '3 förfallna fakturor' },
    { name: 'cashflow_trend',   score: 17, maxScore: 25, description: 'Positivt nettokassaflöde' },
    { name: 'burn_rate',        score: 15, maxScore: 25, description: 'Burn rate ökar månad över månad' },
  ],
}

const MOCK_ROOT_CAUSES: RootCause[] = [
  {
    title: 'Förfallna fakturor',
    description: '3 fakturor är mer än 30 dagar förfallna och riskerar att bli osäkra fordringar.',
    severity: 'high',
    action: 'Skicka betalningspåminnelse omgående och erbjud delbetalning om kunden har betalningsproblem.',
  },
  {
    title: 'Ökande burn rate',
    description: 'Kostnadskvoten har ökat med 8% senaste månaden och är nu 78% av inflödet.',
    severity: 'medium',
    action: 'Granska fasta kostnader och identifiera möjliga besparingar, t.ex. abonnemang och leasingkostnader.',
  },
  {
    title: 'Kortare runway',
    description: 'Runway har minskat från 65 till 47 dagar under senaste månaden.',
    severity: 'medium',
    action: 'Påskynda fakturering av pågående projekt och förhandla om betalningsvillkor med leverantörer.',
  },
]

export default function Diagnosis() {
  const navigate = useNavigate()
  const [diagnosis, setDiagnosis]   = useState<DiagnosisData | null>(null)
  const [rootCauses, setRootCauses] = useState<RootCause[]>([])
  const [loading, setLoading]       = useState(true)
  const [loadingRC, setLoadingRC]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [history, setHistory]       = useState<HistoryEntry[]>(loadHistory)

  const fetchData = (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else { setLoading(true); setLoadingRC(true) }

    fetchWithAuth(`${API_URL}api/v1/diagnosis`)
      .then(r => r.json())
      .then(json => {
        const d: DiagnosisData = json?.data ?? json
        setDiagnosis(d)
        if (typeof d?.score === 'number') setHistory(pushHistory(d.score))
      })
      .catch(() => {
        setDiagnosis(MOCK_DIAGNOSIS)
        setHistory(pushHistory(MOCK_DIAGNOSIS.score))
      })
      .finally(() => { setLoading(false); setRefreshing(false) })

    fetchWithAuth(`${API_URL}api/v1/diagnosis/root-cause`)
      .then(r => r.json())
      .then(json => {
        const causes = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : []
        setRootCauses(causes.length > 0 ? causes : MOCK_ROOT_CAUSES)
      })
      .catch(() => setRootCauses(MOCK_ROOT_CAUSES))
      .finally(() => setLoadingRC(false))
  }

  useEffect(() => {
    const token = localStorage.getItem('accessToken')
    if (!token || token === 'undefined' || token === 'null') {
      window.location.href = '/login'
      return
    }
    fetchData()
  }, [])

  const cfg = useMemo(() => diagnosis ? scoreConfig(diagnosis.score) : null, [diagnosis])

  const components = useMemo<ComponentScore[]>(() => {
    if (diagnosis?.components && diagnosis.components.length > 0) return diagnosis.components
    return [
      { name: 'runway',           score: 0, maxScore: 25 },
      { name: 'overdue_invoices', score: 0, maxScore: 25 },
      { name: 'cashflow_trend',   score: 0, maxScore: 25 },
      { name: 'burn_rate',        score: 0, maxScore: 25 },
    ]
  }, [diagnosis])

  const historyChartData = useMemo(() =>
    history.map(e => ({
      label: new Date(e.date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }),
      score: e.score,
    })),
  [history])

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-10 flex flex-col gap-8">

        {/* Header */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <button
              onClick={() => navigate('/dashboard')}
              className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1.5 mb-4"
            >
              ← Tillbaka
            </button>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Finansiell hälsodiagnos</h1>
            <p className="text-sm text-gray-500">En samlad bedömning av ditt företags ekonomiska hälsa.</p>
          </div>
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing || loading}
            className="flex items-center gap-2 text-sm font-medium text-accent border border-accent/30 px-4 py-2.5 rounded-xl hover:bg-blue-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Uppdatera
          </button>
        </div>

        {/* Loading skeleton */}
        {loading ? (
          <div className="flex flex-col gap-6">
            <div className="h-72 bg-gray-100 rounded-2xl animate-pulse" />
            <div className="h-52 bg-gray-100 rounded-2xl animate-pulse" />
            <div className="h-40 bg-gray-100 rounded-2xl animate-pulse" />
          </div>
        ) : !diagnosis || !cfg ? (
          <div className="text-center text-gray-400 text-sm py-16">Ingen diagnosdata tillgänglig.</div>
        ) : (
          <>
            {/* Score + Component breakdown */}
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 md:p-8">
              <div className="grid md:grid-cols-[200px_1fr] gap-8 items-start">

                {/* Circular score */}
                <div className="flex flex-col items-center gap-3 md:border-r md:border-gray-100 md:pr-8">
                  <CircularScore score={diagnosis.score} />
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full ${cfg.bg} ${cfg.textColor}`}>
                    {cfg.label}
                  </span>
                  {diagnosis.summary && (
                    <p className="text-xs text-gray-500 text-center leading-relaxed max-w-[190px]">
                      {diagnosis.summary}
                    </p>
                  )}
                </div>

                {/* Component bars */}
                <div className="flex flex-col gap-5">
                  <h2 className="text-sm font-bold text-gray-700">Komponent-breakdown</h2>
                  {components.map(c => {
                    const meta = COMPONENT_META[c.name] ?? { label: c.label ?? c.name, icon: <Activity className="w-4 h-4" /> }
                    const label = c.label ?? meta.label
                    const pct = c.maxScore > 0 ? (c.score / c.maxScore) * 100 : 0
                    const color = barColor(c.score, c.maxScore)
                    return (
                      <div key={c.name}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                            <span className="text-gray-400">{meta.icon}</span>
                            {label}
                          </div>
                          <span className="text-sm font-bold text-gray-900 tabular-nums">
                            {c.score}
                            <span className="text-gray-400 font-normal text-xs"> / {c.maxScore}</span>
                          </span>
                        </div>
                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${color} rounded-full transition-all duration-700`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        {c.description && (
                          <p className="text-xs text-gray-400 mt-1.5">{c.description}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Root causes */}
            <div>
              <h2 className="text-base font-bold text-gray-800 mb-4">Rotorsaker</h2>
              {loadingRC ? (
                <div className="grid sm:grid-cols-2 gap-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-32 bg-gray-100 rounded-2xl animate-pulse" />
                  ))}
                </div>
              ) : rootCauses.length === 0 ? (
                <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center text-gray-400 text-sm">
                  Inga rotorsaker identifierade — din ekonomi ser bra ut!
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                  {rootCauses.map((rc, i) => (
                    <RootCauseCard key={rc.id ?? i} rc={rc} />
                  ))}
                </div>
              )}
            </div>

            {/* History chart */}
            {historyChartData.length >= 2 && (
              <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-base font-bold text-gray-800">Hälsoscorehistorik</h2>
                  <span className="text-xs text-gray-400">{historyChartData.length} mätpunkter</span>
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={historyChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={26} />
                    <Tooltip
                      content={({ active, payload, label }) =>
                        active && payload?.length ? (
                          <div className="bg-white border border-gray-100 rounded-xl shadow px-3 py-2 text-xs">
                            <p className="text-gray-500 mb-0.5">{label}</p>
                            <p className="font-bold text-gray-900">Score: {payload[0].value}</p>
                          </div>
                        ) : null
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="score"
                      stroke="#2563eb"
                      strokeWidth={2}
                      fill="url(#scoreGrad)"
                      dot={{ r: 3.5, fill: '#2563eb', strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {historyChartData.length === 1 && (
              <div className="bg-white border border-gray-100 rounded-2xl shadow-sm px-6 py-5">
                <h2 className="text-base font-bold text-gray-800 mb-1">Hälsoscorehistorik</h2>
                <p className="text-xs text-gray-400">
                  Historiken byggs upp automatiskt varje dag du besöker sidan. Kom tillbaka imorgon för att se din trend.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function CircularScore({ score }: { score: number }) {
  const cfg = scoreConfig(score)
  const r = 75
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.max(0, Math.min(100, score)) / 100)

  return (
    <svg width="180" height="180" viewBox="0 0 180 180">
      <circle cx="90" cy="90" r={r} fill="none" stroke="#e5e7eb" strokeWidth="13" />
      <circle
        cx="90" cy="90" r={r}
        fill="none"
        stroke={cfg.stroke}
        strokeWidth="13"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        transform="rotate(-90 90 90)"
        style={{ transition: 'stroke-dashoffset 1.2s ease' }}
      />
      <text x="90" y="82" textAnchor="middle" fontSize="38" fontWeight="700" fill="#111827" fontFamily="system-ui,sans-serif">
        {score}
      </text>
      <text x="90" y="112" textAnchor="middle" fontSize="20" fontWeight="700" fill={cfg.stroke} fontFamily="system-ui,sans-serif">
        {cfg.grade}
      </text>
      <text x="90" y="130" textAnchor="middle" fontSize="11" fill="#9ca3af" fontFamily="system-ui,sans-serif">
        av 100
      </text>
    </svg>
  )
}

function RootCauseCard({ rc }: { rc: RootCause }) {
  const sev = SEVERITY_CONFIG[rc.severity ?? 'low']
  const Icon = rc.severity === 'high' ? AlertTriangle : rc.severity === 'medium' ? AlertCircle : Info

  return (
    <div className={`border ${sev.border} ${sev.bg} rounded-2xl p-5 flex flex-col gap-3`}>
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-full ${sev.iconBg} flex items-center justify-center shrink-0 mt-0.5`}>
          <Icon className={`w-4 h-4 ${sev.text}`} />
        </div>
        <div>
          <p className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 ${sev.text}`}>
            {sev.label} prioritet
          </p>
          <h3 className={`font-semibold text-sm leading-snug ${sev.text}`}>{rc.title}</h3>
        </div>
      </div>
      {rc.description && (
        <p className="text-xs text-gray-600 leading-relaxed">{rc.description}</p>
      )}
      {rc.action && (
        <div className="bg-white/70 rounded-xl px-3 py-2.5 border border-white/80">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">Rekommenderad åtgärd</p>
          <p className="text-xs text-gray-700 font-medium leading-snug">{rc.action}</p>
        </div>
      )}
    </div>
  )
}