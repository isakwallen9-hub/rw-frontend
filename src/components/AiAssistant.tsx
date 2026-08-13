import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Brain, Send, Sparkles, Trash2, X } from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { fetchWithAuth } from '../utils/fetchWithAuth'
import { ChartTooltip } from './chart'

const API_URL = import.meta.env.VITE_API_URL as string
const CHART_COLORS = ['#3A5CD8', '#0E9C6B', '#C9821F', '#7C5BD9', '#CE4646']
const SS_KEY           = 'rw_ai_history'
const MEMORY_NOTICE_KEY = 'rw_ai_memory_notice_dismissed'

// ─── Types ────────────────────────────────────────────────────────────────────

type AiContext = 'dashboard' | 'analytics' | 'cashflow' | 'customers' | 'budget' | 'simulate' | 'general'
type Intent    = 'answer'   | 'chart'     | 'forecast'  | 'action'

interface DataPoint { label: string; value: number }
interface Dataset   { label: string; data: DataPoint[]; isZeroReference?: boolean }

interface InlineChart {
  title?:     string
  chartType?: 'line' | 'bar'
  datasets:   Dataset[]
}
interface ActionItem {
  title:        string
  description?: string
  priority?:    'high' | 'medium' | 'low'
}
interface AiMessage {
  role:      'user' | 'ai' | 'error'
  text:      string
  intent?:   Intent
  chart?:    InlineChart
  forecast?: DataPoint[]
  actions?:  ActionItem[]
}
type HistoryMap = Partial<Record<AiContext, AiMessage[]>>

// ─── Config ───────────────────────────────────────────────────────────────────

const ROUTE_CTX: Record<string, AiContext> = {
  '/':          'dashboard',
  '/dashboard': 'dashboard',
  '/analys':    'analytics',
  '/analytics': 'analytics',
  '/cashflow':  'cashflow',
  '/kunder':    'customers',
  '/customers': 'customers',
  '/budget':    'budget',
  '/simulera':  'simulate',
  '/simulate':  'simulate',
}

const CTX_LABEL: Record<AiContext, string> = {
  dashboard: 'Dashboard',
  analytics: 'Analys',
  cashflow:  'Kassaflöde',
  customers: 'Kunder',
  budget:    'Budget',
  simulate:  'Simulering',
  general:   'Allmänt',
}

const QUICK_QS: Record<AiContext, string[]> = {
  dashboard: ['Hur mår mitt företag?', 'Visa intäktstrenden', 'Vad bör jag göra nu?'],
  analytics: ['Vilka kategorier kostar mest?', 'Visa min kostnadsutveckling', 'Jämför intäkter och kostnader'],
  cashflow:  ['Hur länge räcker likviditeten?', 'Finns det risker i kassaflödet?', 'Visa prognos nästa kvartal'],
  customers: ['Vilka kunder riskerar jag att tappa?', 'Vem är min bästa kund?', 'Vilka kunder är inaktiva?'],
  budget:    ['Håller jag budgeten?', 'Var överskrider jag mest?', 'Hur ser utfallet ut mot plan?'],
  simulate:  ['Vad händer om jag minskar kostnader 10%?', 'Simulera pessimistiskt scenario', 'Visa break-even'],
  general:   ['Hur mår mitt företag?', 'Vad bör jag prioritera?', 'Visa ekonomisk status'],
}

const PRIO_BADGE: Record<string, string> = {
  high:   'bg-negative-100 text-negative-700',
  medium: 'bg-caution-100 text-caution-700',
  low:    'bg-positive-100 text-positive-700',
}
const PRIO_LABEL: Record<string, string> = { high: 'Hög', medium: 'Medium', low: 'Låg' }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toErrStr(raw: unknown, fallback: string): string {
  if (!raw) return fallback
  if (typeof raw === 'string') return raw || fallback
  if (typeof raw === 'object' && 'message' in raw)
    return String((raw as { message: unknown }).message) || fallback
  return fallback
}

function normalizeDatasets(raw: unknown): Dataset[] {
  if (!raw) return []
  if (Array.isArray(raw)) {
    if (!raw.length) return []
    if (typeof (raw[0] as Record<string, unknown>)?.label === 'string')
      return [{ label: 'Värde', data: raw as DataPoint[] }]
    return []
  }
  const obj = raw as {
    labels?: string[]
    datasets?: Array<{ label?: string; data?: Array<number | DataPoint>; isZeroReference?: boolean }>
  }
  const { labels = [], datasets = [] } = obj
  if (!labels.length || !datasets?.length) return []
  return datasets.map(ds => ({
    label: ds.label ?? '',
    isZeroReference: ds.isZeroReference,
    data: labels.map((lbl, i) => {
      const v = ds.data?.[i]
      return { label: lbl, value: typeof v === 'number' ? v : ((v as DataPoint)?.value ?? 0) }
    }),
  }))
}

function pivotDs(datasets: Dataset[] | null | undefined): Record<string, unknown>[] {
  if (!datasets?.length) return []
  const nonZero = datasets.filter(d => !d.isZeroReference)
  if (!nonZero.length) return []
  const firstData = nonZero[0]?.data
  if (!firstData?.length) return []
  return firstData.map((p, i) => {
    const row: Record<string, unknown> = { label: p.label }
    nonZero.forEach(ds => { row[ds.label] = ds.data?.[i]?.value ?? 0 })
    return row
  })
}

function loadMap(): HistoryMap {
  try { return JSON.parse(sessionStorage.getItem(SS_KEY) ?? '{}') as HistoryMap } catch { return {} }
}
function saveMap(map: HistoryMap) {
  try { sessionStorage.setItem(SS_KEY, JSON.stringify(map)) } catch {}
}

// ─── ChartBlock ───────────────────────────────────────────────────────────────

function ChartBlock({ chart, height = 190 }: { chart: InlineChart; height?: number }) {
  const datasets = chart.datasets ?? []
  const pivoted  = pivotDs(datasets)
  const nonZero  = datasets.filter(d => !d.isZeroReference)
  const hasZRef  = datasets.some(d => d.isZeroReference)

  if (!pivoted.length) {
    return (
      <div className="flex items-center justify-center text-xs text-ink-400" style={{ height }}>
        Ingen grafdata
      </div>
    )
  }

  const shared = { data: pivoted, margin: { top: 4, right: 4, left: 0, bottom: 0 } }

  const axes = (
    <>
      <CartesianGrid strokeDasharray="2 6" stroke="#1A192010" vertical={false} />
      <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#72717C' }} axisLine={false} tickLine={false} />
      <YAxis
        tick={{ fontSize: 10, fill: '#72717C' }} axisLine={false} tickLine={false} width={40}
        tickFormatter={v => Math.abs(Number(v)) >= 1000 ? `${(Number(v) / 1000).toFixed(0)}k` : String(v)}
      />
      <Tooltip content={<ChartTooltip format={(v) => Number(v).toLocaleString('sv-SE')} />} cursor={{ fill: 'rgba(26,25,32,0.04)' }} />
      {hasZRef && <ReferenceLine y={0} stroke="#CE4646" strokeDasharray="4 2" strokeWidth={1.5} />}
    </>
  )

  if ((chart.chartType ?? 'bar') === 'bar') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart {...shared}>
          {axes}
          {nonZero.map((ds, i) => (
            <Bar key={ds.label} dataKey={ds.label} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[6, 6, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart {...shared}>
        {axes}
        {nonZero.map((ds, i) => (
          <Line
            key={ds.label} type="monotone" dataKey={ds.label}
            stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: "#fff", strokeWidth: 2 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function Bubble({ msg, onNavigate }: { msg: AiMessage; onNavigate: (to: string) => void }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-br-sm text-sm leading-relaxed bg-gradient-to-br from-brand-700 to-brand-700 text-white">
          {msg.text}
        </div>
      </div>
    )
  }

  if (msg.role === 'error') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[88%] px-3.5 py-2.5 rounded-2xl rounded-bl-sm text-sm leading-relaxed bg-negative-50 border border-negative-100 text-negative-700">
          {String(msg.text)}
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] flex flex-col gap-2">
        {msg.text && (
          <div className="px-3.5 py-2.5 rounded-2xl rounded-bl-sm text-sm leading-relaxed bg-white/70 border border-white/60 text-ink-800 shadow-sm whitespace-pre-line">
            {msg.text}
          </div>
        )}
        {msg.chart && (
          <div className="rounded-2xl bg-white/70 border border-white/60 shadow-sm p-3">
            {msg.chart.title && (
              <p className="text-xs font-semibold text-ink-700 mb-2">{msg.chart.title}</p>
            )}
            <ChartBlock chart={msg.chart} height={170} />
          </div>
        )}
        {msg.forecast && msg.forecast.length > 0 && (
          <div className="rounded-2xl bg-white/70 border border-white/60 shadow-sm p-3">
            <p className="text-xs font-semibold text-ink-600 mb-2">Prognos</p>
            <ChartBlock
              chart={{ chartType: 'line', datasets: [{ label: 'Prognos', data: msg.forecast }] }}
              height={130}
            />
          </div>
        )}
        {msg.actions && msg.actions.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {msg.actions.map((a, i) => (
              <button
                key={i}
                onClick={() => onNavigate('/actions')}
                className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-white/70 border border-white/60 shadow-sm hover:bg-brand-50/70 hover:border-brand-200 transition-colors text-left group w-full"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <p className="text-xs font-semibold text-ink-800 group-hover:text-brand-700 transition-colors leading-snug">
                      {a.title}
                    </p>
                    {a.priority && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${PRIO_BADGE[a.priority] ?? PRIO_BADGE.medium}`}>
                        {PRIO_LABEL[a.priority] ?? a.priority}
                      </span>
                    )}
                  </div>
                  {a.description && (
                    <p className="text-xs text-ink-500 leading-snug">{a.description}</p>
                  )}
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-ink-400 group-hover:text-brand-500 shrink-0 transition-colors" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AiAssistant() {
  const location = useLocation()
  const navigate = useNavigate()

  const ctx: AiContext = ROUTE_CTX[location.pathname] ?? 'general'

  const [open,           setOpen]           = useState(false)
  const [input,          setInput]          = useState('')
  const [loading,        setLoading]        = useState(false)
  const [historyMap,     setHistoryMap]     = useState<HistoryMap>(loadMap)
  const [memoryEnabled,  setMemoryEnabled]  = useState<boolean | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [noticeVisible,  setNoticeVisible]  = useState(() => !localStorage.getItem(MEMORY_NOTICE_KEY))

  const history    = historyMap[ctx] ?? []
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLInputElement>(null)

  // Persist all history to sessionStorage whenever it changes
  useEffect(() => { saveMap(historyMap) }, [historyMap])

  // Scroll to bottom when new messages or panel opens
  useEffect(() => {
    if (open) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history, loading, open])

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80)
  }, [open])

  // Fetch memory status once at mount
  useEffect(() => {
    fetchWithAuth(`${API_URL}api/v1/ai/memory-status`)
      .then(r => r.json())
      .then(json => setMemoryEnabled(!!(json?.data?.enabled ?? json?.enabled)))
      .catch(() => setMemoryEnabled(false))
  }, [])

  // Global open-with-question event (fired by dashboard sections)
  useEffect(() => {
    const handler = (e: Event) => {
      const q = (e as CustomEvent<{ question?: string }>).detail?.question ?? ''
      setOpen(true)
      if (q) setInput(q)
    }
    window.addEventListener('rw:ai:open', handler)
    return () => window.removeEventListener('rw:ai:open', handler)
  }, [])

  const clearHistory = () => {
    setHistoryMap(prev => ({ ...prev, [ctx]: [] }))
  }

  const send = useCallback(async (forcedQ?: string) => {
    const question = (forcedQ ?? input).trim()
    if (!question || loading) return
    if (!forcedQ) setInput('')

    setHistoryMap(prev => ({
      ...prev,
      [ctx]: [...(prev[ctx] ?? []), { role: 'user' as const, text: question }],
    }))
    setLoading(true)

    try {
      const body: Record<string, unknown> = { question, context: ctx }
      if (memoryEnabled && conversationId) body.conversationId = conversationId

      const res  = await fetchWithAuth(`${API_URL}api/v1/ai/ask`, {
        method: 'POST',
        body:   JSON.stringify(body),
      })
      const json = await res.json()

      if (!res.ok) {
        setHistoryMap(prev => ({
          ...prev,
          [ctx]: [...(prev[ctx] ?? []), {
            role: 'error' as const,
            text: toErrStr(json?.error, `Fel ${res.status}. Försök igen.`),
          }],
        }))
      } else {
        const d      = json.data ?? json
        if (memoryEnabled && d.conversationId) setConversationId(String(d.conversationId))
        const intent: Intent = d.intent ?? 'answer'
        const text   = String(d.message ?? d.answer ?? '')
        const aiMsg: AiMessage = { role: 'ai', text, intent }

        // chart intent
        if (intent === 'chart' && d.chartData) {
          const datasets = normalizeDatasets(d.chartData)
          if (datasets.length) {
            aiMsg.chart = {
              title:     typeof d.chartData?.title === 'string' ? d.chartData.title : undefined,
              chartType: d.chartData?.chartType === 'line' ? 'line' : 'bar',
              datasets,
            }
          }
        }

        // forecast intent
        if (intent === 'forecast' && d.forecastData) {
          const sets    = normalizeDatasets(d.forecastData)
          aiMsg.forecast = sets[0]?.data ?? []
        }

        // action intent
        if (intent === 'action' && Array.isArray(d.actions)) {
          aiMsg.actions = d.actions as ActionItem[]
        }

        setHistoryMap(prev => ({
          ...prev,
          [ctx]: [...(prev[ctx] ?? []), aiMsg],
        }))
      }
    } catch (err) {
      setHistoryMap(prev => ({
        ...prev,
        [ctx]: [...(prev[ctx] ?? []), {
          role: 'error' as const,
          text: toErrStr(err, 'Nätverksfel. Försök igen.'),
        }],
      }))
    }

    setLoading(false)
  // ctx is stable within the async call — captured correctly by the closure
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, loading, ctx, memoryEnabled, conversationId])

  return (
    <>
      {/* ── Floating button ─────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Öppna AI-assistent"
        aria-expanded={open}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-xl shadow-brand-900/30 transition-[transform,box-shadow,background-color,border-color,color] duration-200 hover:scale-105 active:scale-95 bg-gradient-to-br from-brand-600 to-brand-700"
      >
        {/* Pulse ring */}
        <span
          className="absolute inset-0 rounded-full bg-brand-400/30 animate-ping pointer-events-none"
          style={{ animationDuration: '2.8s' }}
          aria-hidden="true"
        />
        <Sparkles className="w-6 h-6 text-white relative z-10" aria-hidden="true" />
      </button>

      {/* ── Panel ───────────────────────────────────────────────────────────── */}
      {open && (
        <div
          role="dialog"
          aria-label="AI-assistent"
          className="fixed bottom-[88px] right-6 z-50 w-[calc(100vw-48px)] sm:w-[400px] max-h-[80vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl shadow-brand-900/20 border border-white/50 bg-white/60 backdrop-blur-3xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4.5 bg-gradient-to-r from-brand-700 to-brand-700 shrink-0">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-white/80" aria-hidden="true" />
              <span className="text-white font-semibold text-sm tracking-tight">AI-assistent</span>
              <span className="text-xs font-medium text-brand-200 bg-brand-950/30 px-2 py-0.5 rounded-full">
                {CTX_LABEL[ctx]}
              </span>
              {memoryEnabled && (
                <span title="AI-minne aktivt: jag kommer ihåg våra tidigare samtal" className="inline-flex">
                  <Brain className="w-3.5 h-3.5 text-brand-200" aria-label="AI-minne aktivt" />
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={clearHistory}
                aria-label="Rensa konversation"
                title="Rensa"
                className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setOpen(false)}
                aria-label="Stäng AI-assistent"
                className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 min-h-0">
            {/* One-time memory-off notice */}
            {history.length === 0 && !loading && memoryEnabled === false && noticeVisible && (
              <div className="bg-brand-50/80 border border-brand-100 rounded-xl px-4 py-3 mb-1">
                <p className="text-xs text-brand-700 leading-relaxed mb-2">
                  Vill du att jag ska komma ihåg våra samtal?{' '}
                  <button
                    onClick={() => navigate('/profile')}
                    className="font-semibold underline underline-offset-2 hover:text-brand-800 transition-colors"
                  >
                    Aktivera AI-minne i Profil →
                  </button>
                </p>
                <button
                  onClick={() => {
                    localStorage.setItem(MEMORY_NOTICE_KEY, '1')
                    setNoticeVisible(false)
                  }}
                  className="text-[10px] text-brand-400 hover:text-brand-600 transition-colors"
                >
                  Visa inte igen
                </button>
              </div>
            )}

            {history.length === 0 && !loading && (
              <div className="flex flex-col gap-1.5 mt-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400 px-1 mb-1">
                  Snabbfrågor
                </p>
                {QUICK_QS[ctx].map(q => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="text-xs text-left border border-white/60 bg-white/50 rounded-xl px-3 py-2.5 hover:bg-white/80 hover:border-brand-200 hover:text-brand-700 transition-[transform,box-shadow,background-color,border-color,color,opacity] text-ink-700 font-medium min-h-[44px]"
                  >
                    {q} →
                  </button>
                ))}
              </div>
            )}

            {history.map((msg, i) => (
              <Bubble key={i} msg={msg} onNavigate={navigate} />
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-white/70 border border-white/60 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2 shadow-sm">
                  <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '120ms' }} />
                  <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '240ms' }} />
                  <span className="text-xs text-ink-400 ml-1">AI:n tänker...</span>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-white/40 bg-white/30 px-4 py-3 flex gap-2 shrink-0">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
              placeholder="Fråga vad som helst om din ekonomi..."
              disabled={loading}
              className="flex-1 text-sm bg-white/60 border border-white/60 rounded-xl px-3.5 py-2.5 outline-none focus:border-brand-400 focus:bg-white/80 transition-[transform,box-shadow,background-color,border-color,color,opacity] disabled:opacity-50 placeholder-ink-400 min-h-[44px]"
            />
            <button
              onClick={() => void send()}
              disabled={loading || !input.trim()}
              aria-label="Skicka"
              className="px-4 bg-gradient-to-br from-brand-600 to-brand-700 text-white rounded-xl hover:opacity-90 disabled:opacity-40 active:scale-95 transition-[transform,box-shadow,background-color,border-color,color,opacity] min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
