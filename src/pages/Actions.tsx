import { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle, Circle, ChevronDown, ChevronUp,
  TrendingUp, AlertTriangle, AlertCircle, Info,
  Clock, FileText,
} from 'lucide-react'
import { fetchWithAuth } from '../utils/fetchWithAuth'

const API_URL = import.meta.env.VITE_API_URL as string
const LS_PROGRESS_KEY = 'rw_action_progress'

type Tab = 'all' | 'active' | 'done'
type Priority = 'high' | 'medium' | 'low'

interface Target {
  type: string
  id?: string
  label: string
  value: number
}

interface Action {
  id: string
  title: string
  description: string
  how?: string
  priority: Priority
  estimatedValue: number
  targets?: Target[]
}

interface LateInvoice {
  customerName: string
  invoiceNumber?: string
  amount: number
  daysOverdue: number
}

function fmt(n: number) {
  return n.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK', minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function loadProgress(): Set<string> {
  try {
    const s = localStorage.getItem(LS_PROGRESS_KEY)
    return new Set(s ? (JSON.parse(s) as string[]) : [])
  } catch { return new Set() }
}

function saveProgress(ids: Set<string>) {
  try { localStorage.setItem(LS_PROGRESS_KEY, JSON.stringify([...ids])) } catch { /* quota */ }
}

function extractCompletedIds(json: unknown): string[] {
  if (!json || typeof json !== 'object') return []
  const r = (json as Record<string, unknown>)
  const data = r.data ?? json
  if (!data || typeof data !== 'object') return []
  const d = data as Record<string, unknown>
  const ids = d.completedIds ?? d.completed_ids ?? d.completedActions ?? d.completed_actions
  return Array.isArray(ids) ? ids.map(String) : []
}

const PRIORITY_CONFIG: Record<Priority, {
  label: string; badge: string; bar: string; urgencyPct: number; symbol: string; icon: React.ReactNode
}> = {
  high:   { label: 'Hög prioritet', badge: 'bg-red-100 text-red-700 border-red-200',         bar: 'bg-red-500',    urgencyPct: 100, symbol: '!', icon: <AlertTriangle className="w-3 h-3" /> },
  medium: { label: 'Medium',         badge: 'bg-yellow-100 text-yellow-700 border-yellow-200', bar: 'bg-yellow-400', urgencyPct: 60,  symbol: '~', icon: <AlertCircle className="w-3 h-3" /> },
  low:    { label: 'Låg',            badge: 'bg-green-100 text-green-700 border-green-200',    bar: 'bg-green-400',  urgencyPct: 25,  symbol: '✓', icon: <Info className="w-3 h-3" /> },
}

const MOCK_ACTIONS: Action[] = [
  {
    id: 'mock-1',
    title: 'Påminn om förfallna fakturor',
    description: '3 fakturor är >30 dagar förfallna. Skicka betalningspåminnelse omgående för att undvika att fordringarna blir osäkra.',
    how: '1. Logga in i ditt faktureringssystem\n2. Filtrera på fakturor med förfallodatum > 0 dagar\n3. Skicka påminnelse via e-post med betalningsuppgifter\n4. Följ upp telefonsamtal om ingen respons efter 5 dagar\n5. Erbjud betalningsplan om kunden har tillfälliga likviditetsproblem',
    priority: 'high',
    estimatedValue: 76300,
    targets: [
      { type: 'invoice', id: 'inv-1', label: 'Bergström & Co', value: 48500 },
      { type: 'invoice', id: 'inv-2', label: 'Lindqvist AB', value: 27800 },
    ],
  },
  {
    id: 'mock-2',
    title: 'Förhandla betalningsvillkor',
    description: 'Minska standard betalningstid från 30 till 14 dagar för nya kunder för att förbättra kassaflödescykeln.',
    how: '1. Uppdatera fakturamallar med ny betalningstid (14 dagar)\n2. Informera befintliga kunder i nästa faktura\n3. Erbjud 2% rabatt vid betalning inom 7 dagar som incitament\n4. Följ upp avtal och dokumentera eventuella undantag',
    priority: 'medium',
    estimatedValue: 32000,
    targets: [
      { type: 'customer', id: 'c-1', label: 'Nya kundavtal', value: 32000 },
    ],
  },
  {
    id: 'mock-3',
    title: 'Se över fasta kostnader',
    description: 'Leasingkostnad kan minskas med ~15% vid omförhandling i april. Kontakta leverantören i god tid.',
    how: '1. Samla alla löpande fasta kostnader och avtal\n2. Identifiera avtal som löper ut inom 6 månader\n3. Inhämta konkurrerande offerter\n4. Förhandla med nuvarande leverantörer med offert som förhandlingskort',
    priority: 'low',
    estimatedValue: 8400,
  },
]

const MOCK_INVOICES: LateInvoice[] = [
  { customerName: 'Bergström & Co',  invoiceNumber: 'INV-2024-089', amount: 48500, daysOverdue: 42 },
  { customerName: 'Lindqvist AB',    invoiceNumber: 'INV-2024-091', amount: 27800, daysOverdue: 31 },
  { customerName: 'Nordin Group',    invoiceNumber: 'INV-2024-094', amount: 15200, daysOverdue: 18 },
]

export default function Actions() {
  const navigate  = useNavigate()
  const [actions, setActions]           = useState<Action[]>([])
  const [invoices, setInvoices]         = useState<LateInvoice[]>([])
  const [completedIds, setCompletedIds] = useState<Set<string>>(loadProgress)
  const [loading, setLoading]           = useState(true)
  const [tab, setTab]                   = useState<Tab>('all')

  useEffect(() => {
    const token = localStorage.getItem('accessToken')
    if (!token || token === 'undefined' || token === 'null') {
      window.location.href = '/login'
      return
    }

    // Fetch recommendations
    fetchWithAuth(`${API_URL}api/v1/recommendations/top3`)
      .then(r => r.json())
      .then(json => {
        const raw = json.data?.actions ?? json.data ?? json ?? []
        const parsed: Action[] = (Array.isArray(raw) ? raw : []).map((a: Record<string, unknown>) => ({
          id: String(a.id ?? Math.random()),
          title: String(a.title ?? ''),
          description: String(a.description ?? ''),
          how: a.how ? String(a.how) : undefined,
          priority: (['high', 'medium', 'low'].includes(a.impact as string)
            ? a.impact
            : ['high', 'medium', 'low'].includes(a.priority as string)
            ? a.priority
            : 'medium') as Priority,
          estimatedValue: Array.isArray(a.targets)
            ? (a.targets as { value: number }[]).reduce((s, t) => s + (t.value ?? 0), 0)
            : Number(a.estimatedValue ?? 0),
          targets: Array.isArray(a.targets) ? a.targets as Target[] : undefined,
        }))
        setActions(parsed.length > 0 ? parsed : MOCK_ACTIONS)
        const lateInv: LateInvoice[] = json.data?.lateInvoices ?? []
        setInvoices(lateInv.length > 0 ? lateInv : MOCK_INVOICES)
      })
      .catch(() => { setActions(MOCK_ACTIONS); setInvoices(MOCK_INVOICES) })
      .finally(() => setLoading(false))

    // Fetch saved progress from API
    fetchWithAuth(`${API_URL}api/v1/progress`)
      .then(r => r.json())
      .then(json => {
        const ids = extractCompletedIds(json)
        if (ids.length > 0) {
          const s = new Set(ids)
          setCompletedIds(s)
          saveProgress(s)
        }
      })
      .catch(() => { /* keep localStorage state */ })
  }, [])

  const toggleComplete = useCallback((id: string) => {
    setCompletedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      saveProgress(next)
      // Best-effort sync to API
      fetchWithAuth(`${API_URL}api/v1/progress`, {
        method: 'PUT',
        body: JSON.stringify({ completedIds: [...next] }),
      }).catch(() => { /* already saved to localStorage */ })
      return next
    })
  }, [])

  const filtered = useMemo(() => {
    if (tab === 'active') return actions.filter(a => !completedIds.has(a.id))
    if (tab === 'done')   return actions.filter(a =>  completedIds.has(a.id))
    return actions
  }, [actions, completedIds, tab])

  const totalValue   = useMemo(() => actions.reduce((s, a) => s + a.estimatedValue, 0), [actions])
  const doneCount    = actions.filter(a => completedIds.has(a.id)).length
  const activeCount  = actions.length - doneCount

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: 'all',    label: 'Alla åtgärder', count: actions.length },
    { key: 'active', label: 'Pågående',      count: activeCount },
    { key: 'done',   label: 'Slutförda',     count: doneCount },
  ]

  return (
    <div className="font-sans">
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10 flex flex-col gap-8">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-1">Åtgärder</h1>
          <p className="text-sm text-gray-500">Konkreta steg för att förbättra din ekonomiska hälsa.</p>
        </div>

        {/* Summary bar */}
        {!loading && actions.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white/40 backdrop-blur-2xl border border-slate-200/60 relative shadow-[0_8px_32px_rgba(15,23,42,0.06)] before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/80 before:to-transparent rounded-xl px-5 py-4 shadow-sm text-center">
              <p className="text-2xl font-bold text-gray-900">{actions.length}</p>
              <p className="text-xs text-gray-400 mt-0.5">Åtgärder totalt</p>
            </div>
            <div className="bg-white/40 backdrop-blur-2xl border border-slate-200/60 relative shadow-[0_8px_32px_rgba(15,23,42,0.06)] before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/80 before:to-transparent rounded-xl px-5 py-4 shadow-sm text-center">
              <p className="text-2xl font-bold text-green-600">{doneCount}</p>
              <p className="text-xs text-gray-400 mt-0.5">Slutförda</p>
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-400 rounded-full transition-all duration-500"
                  style={{ width: `${actions.length > 0 ? (doneCount / actions.length) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div className="bg-white/40 backdrop-blur-2xl border border-slate-200/60 relative shadow-[0_8px_32px_rgba(15,23,42,0.06)] before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/80 before:to-transparent rounded-xl px-5 py-4 shadow-sm text-center">
              <p className="text-lg font-bold text-blue-600">{fmt(totalValue)}</p>
              <p className="text-xs text-gray-400 mt-0.5">Potentiellt värde</p>
            </div>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                tab === t.key
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                tab === t.key ? 'bg-accent/10 text-accent' : 'bg-gray-200 text-gray-500'
              }`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* Action list */}
        {loading ? (
          <div className="flex flex-col gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-36 bg-gray-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white/40 backdrop-blur-2xl border border-slate-200/60 relative shadow-[0_8px_32px_rgba(15,23,42,0.06)] before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/80 before:to-transparent rounded-2xl p-10 text-center text-gray-400 text-sm">
            {tab === 'done' ? 'Inga slutförda åtgärder ännu.' : 'Inga pågående åtgärder — bra jobbat!'}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filtered.map(action => (
              <ActionCard
                key={action.id}
                action={action}
                done={completedIds.has(action.id)}
                onToggle={() => toggleComplete(action.id)}
              />
            ))}
          </div>
        )}

        {/* Late invoices */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-gray-400" />
            <h2 className="text-base font-bold text-gray-800">Förfallna fakturor</h2>
            {invoices.length > 0 && (
              <span className="text-xs bg-red-100 text-red-600 font-semibold px-2 py-0.5 rounded-full">{invoices.length} st</span>
            )}
          </div>

          {loading ? (
            <div className="h-32 bg-gray-100 rounded-2xl animate-pulse" />
          ) : invoices.length === 0 ? (
            <div className="bg-white/40 backdrop-blur-2xl border border-slate-200/60 relative shadow-[0_8px_32px_rgba(15,23,42,0.06)] before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/80 before:to-transparent rounded-2xl p-8 text-center text-gray-400 text-sm">
              Inga förfallna fakturor — allt är i ordning!
            </div>
          ) : (
            <div className="bg-white/40 backdrop-blur-2xl border border-slate-200/60 relative shadow-[0_8px_32px_rgba(15,23,42,0.06)] before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/80 before:to-transparent rounded-2xl overflow-hidden shadow-sm">
              <div className="grid grid-cols-[1fr_auto_auto_auto] text-xs font-semibold text-gray-400 uppercase tracking-widest px-5 py-3 border-b border-gray-50">
                <span>Kund</span>
                <span className="text-right pr-6">Fakturanr</span>
                <span className="text-right pr-6">Belopp</span>
                <span className="text-right">Försenad</span>
              </div>
              {invoices.map((inv, i) => (
                <InvoiceRow key={i} inv={inv} isLast={i === invoices.length - 1} />
              ))}
              <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-between">
                <span className="text-xs text-gray-400">Totalt utestående</span>
                <span className="text-sm font-bold text-red-600">
                  {fmt(invoices.reduce((s, inv) => s + inv.amount, 0))}
                </span>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

function ActionCard({ action, done, onToggle }: { action: Action; done: boolean; onToggle: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const p = PRIORITY_CONFIG[action.priority]
  const howLines = action.how
    ? action.how.split('\n').map(l => l.trim()).filter(Boolean)
    : []

  return (
    <div className={`bg-white/40 backdrop-blur-2xl border border-slate-200/60 relative shadow-[0_8px_32px_rgba(15,23,42,0.06)] before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/80 before:to-transparent rounded-2xl overflow-hidden shadow-sm transition-all duration-300 ${done ? 'opacity-70' : 'hover:shadow-md'}`}>
      {/* Urgency strip */}
      <div className="h-1 w-full bg-gray-100">
        <div className={`h-full ${done ? 'bg-green-400' : p.bar} transition-all duration-500`} style={{ width: `${done ? 100 : p.urgencyPct}%` }} />
      </div>

      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${done ? 'bg-green-100 text-green-700 border-green-200' : p.badge}`}>
                {done ? <CheckCircle className="w-3 h-3" /> : p.icon} {done ? 'Slutförd' : p.label}
              </span>
            </div>
            <h3 className={`font-semibold text-sm leading-snug ${done ? 'line-through text-gray-400' : 'text-gray-900'}`}>
              {action.title}
            </h3>
          </div>
          <button
            onClick={onToggle}
            className={`shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border transition-all duration-200 ${
              done
                ? 'border-green-200 bg-green-50 text-green-700 hover:bg-red-50 hover:border-red-200 hover:text-red-600'
                : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-green-300 hover:bg-green-50 hover:text-green-700'
            }`}
            title={done ? 'Ångra' : 'Markera som klar'}
          >
            {done
              ? <><CheckCircle className="w-3.5 h-3.5" /> Klar</>
              : <><Circle className="w-3.5 h-3.5" /> Markera som klar</>
            }
          </button>
        </div>

        {/* Description */}
        <p className="text-gray-500 text-sm leading-relaxed mb-4">{action.description}</p>

        {/* Potential value */}
        {action.estimatedValue > 0 && (
          <div className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-xl px-3 py-2.5 mb-4">
            <TrendingUp className="w-4 h-4 text-green-500 shrink-0" />
            <div>
              <p className="text-[10px] font-bold text-green-600 uppercase tracking-widest">Potentiell förbättring</p>
              <p className="text-base font-bold text-green-700 leading-tight">{fmt(action.estimatedValue)}</p>
            </div>
          </div>
        )}

        {/* Targets */}
        {action.targets && action.targets.length > 0 && (
          <div className="mb-4 border border-gray-100 rounded-xl overflow-hidden">
            <div className="grid grid-cols-[1fr_auto] text-[10px] font-bold uppercase tracking-widest text-gray-400 px-3 py-2 border-b border-gray-50 bg-gray-50/60">
              <span>Berör</span>
              <span className="text-right">Värde</span>
            </div>
            {action.targets.map((t, i) => (
              <div key={t.id ?? i} className={`grid grid-cols-[1fr_auto] items-center px-3 py-2.5 text-xs ${i !== 0 ? 'border-t border-gray-50' : ''}`}>
                <span className="text-gray-700 font-medium truncate mr-3">{t.label}</span>
                <span className="font-semibold text-gray-800 whitespace-nowrap">{fmt(t.value)}</span>
              </div>
            ))}
          </div>
        )}

        {/* How to — expandable */}
        {howLines.length > 0 && (
          <div>
            <button
              onClick={() => setExpanded(v => !v)}
              className="flex items-center gap-2 text-xs font-semibold text-accent hover:underline mb-2"
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              Hur gör jag?
            </button>
            {expanded && (
              <ol className="flex flex-col gap-2 border-l-2 border-accent/30 pl-4 ml-1.5 mt-2">
                {howLines.map((line, i) => {
                  const text = line.replace(/^\d+\.\s*/, '').trim()
                  return (
                    <li key={i} className="flex gap-2.5 items-start">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-accent/10 text-accent text-[10px] font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-sm text-gray-600 leading-snug">{text}</span>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function InvoiceRow({ inv, isLast }: { inv: LateInvoice; isLast: boolean }) {
  const urgent = inv.daysOverdue > 30
  const daysColor = inv.daysOverdue > 60
    ? 'text-red-600 bg-red-100'
    : inv.daysOverdue > 30
    ? 'text-orange-600 bg-orange-100'
    : 'text-yellow-700 bg-yellow-100'

  return (
    <div className={`grid grid-cols-[1fr_auto_auto_auto] items-center px-5 py-4 gap-2 ${!isLast ? 'border-b border-gray-50' : ''} ${urgent ? 'bg-red-50/40' : ''}`}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{inv.customerName}</p>
        {urgent && (
          <div className="flex items-center gap-1 mt-0.5">
            <AlertTriangle className="w-3 h-3 text-red-500" />
            <span className="text-[10px] text-red-500 font-medium">Kräver omedelbar åtgärd</span>
          </div>
        )}
      </div>
      <span className="text-xs text-gray-400 text-right pr-6 whitespace-nowrap">{inv.invoiceNumber ?? '—'}</span>
      <span className="text-sm font-semibold text-gray-900 text-right pr-6 whitespace-nowrap">{fmt(inv.amount)}</span>
      <span className={`text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap flex items-center gap-1 ${daysColor}`}>
        <Clock className="w-3 h-3" /> {inv.daysOverdue} dagar
      </span>
    </div>
  )
}