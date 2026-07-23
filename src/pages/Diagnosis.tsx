import { useEffect, useState, useMemo } from 'react'
import {
  AlertTriangle, AlertCircle, Info, Clock, FileWarning, Flame,
  TrendingDown, Activity, RefreshCw, Sparkles, CheckCircle, XCircle, Lightbulb,
} from 'lucide-react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts'
import { fetchWithAuth } from '../utils/fetchWithAuth'

const API_URL = import.meta.env.VITE_API_URL as string
const LS_DIAGNOSIS_KEY = 'rw_diagnosis_history'
const SS_AI_DIAGNOSIS_KEY = 'rw_ai_diagnosis'
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

interface ParsedDiagnosis {
  raw: string
  assessment: string
  strengths: string[]
  problems: string[]
  action: string
}

interface AiDiagnosisCache {
  answer: string
  timestamp: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function loadAiCache(): AiDiagnosisCache | null {
  try {
    const saved = sessionStorage.getItem(SS_AI_DIAGNOSIS_KEY)
    return saved ? (JSON.parse(saved) as AiDiagnosisCache) : null
  } catch { return null }
}

function saveAiCache(answer: string, timestamp: Date) {
  try {
    sessionStorage.setItem(SS_AI_DIAGNOSIS_KEY, JSON.stringify({ answer, timestamp: timestamp.toISOString() }))
  } catch { /* quota */ }
}

function formatRunTime(t: Date): string {
  const now = new Date()
  const time = t.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
  if (t.toDateString() === now.toDateString()) return time
  return t.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }) + ' ' + time
}

function parseBullets(text: string): string[] {
  const lines = text
    .split('\n')
    .map(l => l.replace(/^[-*•·]\s*/, '').replace(/^\d+[).]\s*/, '').trim())
    .filter(Boolean)
  return lines.length > 0 ? lines : text ? [text] : []
}

function parseAiDiagnosis(text: string): ParsedDiagnosis {
  const parts = text.split(/\n?(?=\b[1-4][).]\s)/).map(p => p.trim()).filter(Boolean)

  let assessment = ''
  let rawStrengths = ''
  let rawProblems = ''
  let action = ''

  for (const part of parts) {
    if (part.match(/^1[).]/)) {
      assessment = part.replace(/^1[).][^\n]*\n?/, '').trim() || part.replace(/^1[).]\s*/, '').trim()
    } else if (part.match(/^2[).]/)) {
      rawStrengths = part.replace(/^2[).][^\n]*\n?/, '').trim()
    } else if (part.match(/^3[).]/)) {
      rawProblems = part.replace(/^3[).][^\n]*\n?/, '').trim()
    } else if (part.match(/^4[).]/)) {
      action = part.replace(/^4[).][^\n]*\n?/, '').trim()
    }
  }

  return {
    raw: text,
    assessment: assessment || text,
    strengths: parseBullets(rawStrengths),
    problems: parseBullets(rawProblems),
    action,
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const AI_QUESTION =
  'Gör en fullständig hälsodiagnos av mitt företag. Analysera kassaflöde, marginaler, kostnader och risker. ' +
  'Ge mig: 1) En övergripande bedömning i en mening, 2) De 2-3 största styrkorna, 3) De 2-3 största problemen, ' +
  '4) Den viktigaste åtgärden att göra denna vecka.'

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

// ── Main component ────────────────────────────────────────────────────────────

export default function Diagnosis() {
  // Technical section state
  const [diagnosis, setDiagnosis]   = useState<DiagnosisData | null>(null)
  const [rootCauses, setRootCauses] = useState<RootCause[]>([])
  const [loading, setLoading]       = useState(false)
  const [loadingRC, setLoadingRC]   = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [history, setHistory]       = useState<HistoryEntry[]>(loadHistory)
  const [techOpen, setTechOpen]     = useState(false)
  const [techLoaded, setTechLoaded] = useState(false)

  // AI section state
  const [aiLoading, setAiLoading]         = useState(false)
  const [aiDiagnosis, setAiDiagnosis]     = useState<ParsedDiagnosis | null>(null)
  const [lastRunTime, setLastRunTime]     = useState<Date | null>(null)

  // ── Functions ─────────────────────────────────────────────────────────────

  const openAiWith = (question: string) => {
    window.dispatchEvent(new CustomEvent('rw:ai:open', { detail: { question } }))
  }

  const runAiDiagnosis = async () => {
    setAiLoading(true)
    setAiDiagnosis(null)
    try {
      const res = await fetchWithAuth(`${API_URL}api/v1/ai/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: 'general', question: AI_QUESTION }),
      })
      const json = await res.json()
      const data = json?.data ?? json
      const answer = (data?.answer as string | undefined) ?? ''
      if (answer) {
        const parsed = parseAiDiagnosis(answer)
        setAiDiagnosis(parsed)
        const now = new Date()
        setLastRunTime(now)
        saveAiCache(answer, now)
      }
    } catch {
      // silent fail — user can retry
    } finally {
      setAiLoading(false)
    }
  }

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

  const handleOpenTech = () => {
    const next = !techOpen
    setTechOpen(next)
    if (next && !techLoaded) {
      setTechLoaded(true)
      fetchData()
    }
  }

  // ── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const token = localStorage.getItem('accessToken')
    if (!token || token === 'undefined' || token === 'null') {
      window.location.href = '/login'
      return
    }

    // Restore cached AI diagnosis from this session
    const cached = loadAiCache()
    if (cached) {
      setAiDiagnosis(parseAiDiagnosis(cached.answer))
      setLastRunTime(new Date(cached.timestamp))
      return
    }

    // Auto-run if insights are available (cached = fast response means data exists)
    fetchWithAuth(`${API_URL}api/v1/insights`)
      .then(r => r.json())
      .then(json => {
        const hasData =
          json?.fromCache === true ||
          json?.data?.fromCache === true ||
          (Array.isArray(json?.data) && json.data.length > 0) ||
          (Array.isArray(json) && json.length > 0)
        if (hasData) void runAiDiagnosis()
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Derived ──────────────────────────────────────────────────────────────

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

  // ── JSX ──────────────────────────────────────────────────────────────────

  return (
    <div className="font-sans">
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-10 flex flex-col gap-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-1">Finansiell hälsodiagnos</h1>
          <p className="text-sm text-gray-500">En samlad bedömning av ditt företags ekonomiska hälsa.</p>
        </div>

        {/* ── AI main card ──────────────────────────────────────────────── */}
        <div className="glass rounded-2xl p-6 sm:p-8">

          {/* Card header */}
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-white" aria-hidden="true" />
              </div>
              <div>
                <p className="text-base font-semibold text-slate-800">Låt AI:n undersöka ditt företags hälsa</p>
                {lastRunTime && (
                  <p className="text-xs text-slate-400 mt-0.5">Senast körd: {formatRunTime(lastRunTime)}</p>
                )}
              </div>
            </div>
            {(aiDiagnosis !== null) && !aiLoading && (
              <button
                onClick={() => void runAiDiagnosis()}
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 border border-slate-200 hover:border-blue-300 rounded-xl px-3 py-2 transition-colors shrink-0 min-h-[44px]"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                Kör igen
              </button>
            )}
          </div>

          {/* Loading animation */}
          {aiLoading && (
            <div className="flex flex-col items-center gap-5 py-10">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                <Activity className="w-8 h-8 text-white animate-pulse" aria-hidden="true" />
              </div>
              <div className="text-center">
                <p className="text-base font-semibold text-slate-800">AI:n undersöker ditt företag...</p>
                <p className="text-sm text-slate-500 mt-1">Analyserar kassaflöde, marginaler och risker</p>
              </div>
              <div className="flex gap-1.5">
                {[0, 1, 2, 3].map(i => (
                  <div
                    key={i}
                    className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty state — no diagnosis yet */}
          {!aiLoading && !aiDiagnosis && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <p className="text-sm text-slate-500 max-w-sm">
                AI:n analyserar ditt kassaflöde, marginaler, kostnader och risker — och ger dig en tydlig bild av ditt företags hälsa.
              </p>
              <button
                onClick={() => void runAiDiagnosis()}
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors min-h-[44px]"
              >
                <Sparkles className="w-4 h-4" aria-hidden="true" />
                Kör AI-diagnos →
              </button>
            </div>
          )}

          {/* AI diagnosis result */}
          {aiDiagnosis && !aiLoading && (
            <div className="flex flex-col gap-5">

              {/* Assessment */}
              <p className="text-lg font-medium text-slate-800 leading-relaxed">
                {aiDiagnosis.assessment}
              </p>

              {/* Strengths & Problems */}
              {(aiDiagnosis.strengths.length > 0 || aiDiagnosis.problems.length > 0) && (
                <div className="grid sm:grid-cols-2 gap-4">
                  {aiDiagnosis.strengths.length > 0 && (
                    <div className="bg-green-50/70 border border-green-200/70 rounded-xl p-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-green-700 mb-3 flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        Styrkor
                      </p>
                      <div className="flex flex-col gap-2.5">
                        {aiDiagnosis.strengths.map((s, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" aria-hidden="true" />
                            <p className="text-sm text-slate-700 leading-relaxed">{s}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {aiDiagnosis.problems.length > 0 && (
                    <div className="bg-red-50/70 border border-red-200/70 rounded-xl p-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-red-700 mb-3 flex items-center gap-1.5">
                        <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        Problem
                      </p>
                      <div className="flex flex-col gap-2.5">
                        {aiDiagnosis.problems.map((p, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <XCircle
                              className={`w-4 h-4 shrink-0 mt-0.5 ${i === 0 ? 'text-red-500' : 'text-amber-500'}`}
                              aria-hidden="true"
                            />
                            <p className="text-sm text-slate-700 leading-relaxed">{p}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Weekly action */}
              {aiDiagnosis.action && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                    <Lightbulb className="w-4 h-4 text-blue-600" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-blue-600 mb-1">Veckans viktigaste åtgärd</p>
                    <p className="text-sm text-slate-700 leading-relaxed">{aiDiagnosis.action}</p>
                  </div>
                </div>
              )}

              {/* Follow-up chips */}
              <div className="pt-4 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">Fråga AI mer</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    'Varför är min marginal låg?',
                    'Hur förbättrar jag mitt kassaflöde?',
                    'Vad är min största risk?',
                  ].map(q => (
                    <button
                      key={q}
                      onClick={() => openAiWith(q)}
                      className="bg-white border border-slate-200 rounded-xl px-3.5 py-2 flex items-center gap-2 text-sm font-medium text-slate-600 hover:bg-white/80 hover:border-blue-300 hover:text-blue-700 transition-all min-h-[44px]"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-blue-400 shrink-0" aria-hidden="true" />
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Technical section toggle ───────────────────────────────────── */}
        <button
          onClick={handleOpenTech}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors self-start"
        >
          <span className={`transition-transform inline-block ${techOpen ? 'rotate-90' : ''}`}>›</span>
          {techOpen ? 'Dölj teknisk diagnos' : 'Eller se den tekniska diagnosen →'}
        </button>

        {/* ── Technical section (collapsible) ───────────────────────────── */}
        {techOpen && (
          <div className="flex flex-col gap-6">

            {/* Technical header with refresh */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <h2 className="text-base font-semibold text-slate-700">Teknisk diagnos</h2>
              <button
                onClick={() => fetchData(true)}
                disabled={refreshing || loading}
                className="flex items-center gap-2 text-sm font-medium text-accent border border-accent/30 px-4 py-2.5 rounded-xl hover:bg-blue-50 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                Uppdatera
              </button>
            </div>

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
                <div className="glass rounded-2xl shadow-sm p-6 md:p-8">
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
                    <div className="glass rounded-2xl p-8 text-center text-gray-400 text-sm">
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
                  <div className="glass rounded-2xl shadow-sm p-6">
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
                              <div className="glass rounded-xl shadow px-3 py-2 text-xs">
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
                  <div className="glass rounded-2xl shadow-sm px-6 py-5">
                    <h2 className="text-base font-bold text-gray-800 mb-1">Hälsoscorehistorik</h2>
                    <p className="text-xs text-gray-400">
                      Historiken byggs upp automatiskt varje dag du besöker sidan. Kom tillbaka imorgon för att se din trend.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

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
