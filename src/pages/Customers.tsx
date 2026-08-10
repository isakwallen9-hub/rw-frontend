import { useEffect, useState, useMemo } from 'react'
import { Sparkles } from 'lucide-react'
import { fetchWithAuth } from '../utils/fetchWithAuth'
import { SkeletonCard } from '../components/Skeleton'

const API_URL = import.meta.env.VITE_API_URL as string

type SortKey = 'totalRevenue' | 'transactionCount' | 'lastPurchase'
type PaymentBehavior = 'regular' | 'sporadic' | 'inactive'

interface Customer {
  name: string
  totalRevenue: number
  transactionCount: number
  averageAmount: number
  lastPurchase: string
  paymentBehavior: PaymentBehavior
}

interface InsightItem {
  type: string
  category?: string
  description?: string
  impact?: number
  impactAmount?: number
}

interface ReminderForm {
  email: string
  amount: string
  dueDate: string
  message: string
}

function fmt(n: number | undefined | null) {
  return (n ?? 0).toLocaleString('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 })
}

function fmtDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('sv-SE', { year: 'numeric', month: 'short', day: 'numeric' })
}

const BEHAVIOR_CONFIG: Record<PaymentBehavior, { label: string; className: string }> = {
  regular:  { label: 'Regelbunden', className: 'bg-positive-50 text-positive-700 border border-positive-100' },
  sporadic: { label: 'Sporadisk',   className: 'bg-caution-50 text-caution-700 border border-caution-100' },
  inactive: { label: 'Inaktiv',     className: 'bg-negative-50 text-negative-600 border border-negative-100' },
}

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'totalRevenue',     label: 'Totalt inflöde' },
  { value: 'transactionCount', label: 'Antal transaktioner' },
  { value: 'lastPurchase',     label: 'Senaste köp' },
]

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('totalRevenue')

  const [customerRisk, setCustomerRisk] = useState<InsightItem | null>(null)

  const [reminderCustomer, setReminderCustomer] = useState<Customer | null>(null)
  const [reminderForm, setReminderForm] = useState<ReminderForm>({ email: '', amount: '', dueDate: '', message: '' })
  const [reminderSending, setReminderSending] = useState(false)
  const [reminderToast, setReminderToast] = useState('')
  const [aiReminderLoading, setAiReminderLoading] = useState<string | null>(null)
  const [reminderIsAiPrepared, setReminderIsAiPrepared] = useState(false)

  useEffect(() => {
    fetchWithAuth(`${API_URL}api/v1/customers`)
      .then((r) => r.json())
      .then((json) => {
        const list = json.data?.customers
        setCustomers(Array.isArray(list) ? list : [])
      })
      .catch(() => setError('Kunde inte hämta kunddata.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchWithAuth(`${API_URL}api/v1/insights`, { signal: controller.signal })
      .then(r => r.json())
      .then(json => {
        if (controller.signal.aborted) return
        const items: InsightItem[] = Array.isArray(json?.data) ? json.data
                                   : Array.isArray(json?.insights) ? json.insights
                                   : []
        const risk = items.find(i => i.type === 'CUSTOMER_RISK')
        if (risk) setCustomerRisk(risk)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  const openAiWith = (question: string) =>
    window.dispatchEvent(new CustomEvent('rw:ai:open', { detail: { question } }))

  const sorted = useMemo(() => {
    const filtered = customers.filter((c) =>
      (c.name ?? '').toLowerCase().includes(search.toLowerCase())
    )
    return [...filtered].sort((a, b) => {
      if (sortBy === 'lastPurchase') {
        return new Date(b.lastPurchase).getTime() - new Date(a.lastPurchase).getTime()
      }
      return (b[sortBy] ?? 0) - (a[sortBy] ?? 0)
    })
  }, [customers, search, sortBy])

  const top3 = useMemo(
    () => [...customers].sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 3),
    [customers]
  )

  const openReminder = (c: Customer) => {
    setReminderCustomer(c)
    setReminderForm({
      email: '',
      amount: String(Math.round(c.averageAmount ?? 0)),
      dueDate: '',
      message: '',
    })
  }

  const closeReminder = () => { setReminderCustomer(null); setReminderIsAiPrepared(false) }

  const openAiReminder = async (c: Customer) => {
    setAiReminderLoading(c.name)
    try {
      const res = await fetchWithAuth(`${API_URL}api/v1/ai/prepare-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType: 'payment_reminder', customerName: c.name, averageAmount: c.averageAmount }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const d = json?.data ?? json
      setReminderIsAiPrepared(true)
      setReminderCustomer(c)
      setReminderForm({
        email: d.recipient ?? d.email ?? '',
        amount: String(d.amount ?? Math.round(c.averageAmount ?? 0)),
        dueDate: d.dueDate ?? '',
        message: d.body ?? d.message ?? '',
      })
    } catch {
      setReminderIsAiPrepared(false)
      openReminder(c)
    }
    setAiReminderLoading(null)
  }

  const sendReminder = async () => {
    if (!reminderCustomer || !reminderForm.email || !reminderForm.amount || !reminderForm.dueDate) return
    setReminderSending(true)
    try {
      const res = await fetchWithAuth(`${API_URL}api/v1/reminders/send`, {
        method: 'POST',
        body: JSON.stringify({
          customerName: reminderCustomer.name,
          email: reminderForm.email,
          amount: parseFloat(reminderForm.amount),
          dueDate: reminderForm.dueDate,
          ...(reminderForm.message.trim() ? { message: reminderForm.message.trim() } : {}),
        }),
      })
      if (!res.ok) throw new Error('Misslyckades')
      closeReminder()
      setReminderToast('Påminnelse skickad!')
      setTimeout(() => setReminderToast(''), 3000)
    } catch {
      // keep modal open so user can retry
    }
    setReminderSending(false)
  }

  return (
    <div className="font-sans">
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-10 flex flex-col gap-8">

        <div>
          <h1 className="text-4xl tracking-tight text-ink-900">Kunder</h1>
          <p className="text-sm text-ink-500 mt-1">Baserat på transaktionsbeskrivningar</p>
        </div>

        {/* AI kundrisk-banner */}
        {customerRisk && (
          <div className="bg-caution-50/70 backdrop-blur border border-caution-200/70 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <Sparkles className="w-5 h-5 text-caution-500 shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-caution-800 leading-snug">
                {customerRisk.description ?? 'AI har identifierat en kundrisk i din data.'}
              </p>
              {(customerRisk.impact ?? customerRisk.impactAmount) != null && (
                <p className="text-xs text-caution-600 mt-0.5">
                  Potentiell påverkan: {fmt(customerRisk.impact ?? customerRisk.impactAmount ?? 0)}
                </p>
              )}
            </div>
            <button
              onClick={() => openAiWith('Vilka kunder riskerar jag att tappa och vad bör jag göra?')}
              className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-caution-700 border border-caution-300 rounded-xl px-4 py-2.5 hover:bg-caution-100 transition-colors whitespace-nowrap min-h-[44px]"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              Fråga AI om detta
            </button>
          </div>
        )}

        {/* Top 3 */}
        {!loading && !error && top3.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-ink-500 uppercase tracking-wide mb-3 font-sans">Topp 3 kunder</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {top3.map((c, i) => (
                <div key={c.name} className="glass rounded-xl p-5 flex flex-col gap-3 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-16 h-16 opacity-5">
                    <svg viewBox="0 0 64 64" fill="currentColor" className={i === 0 ? 'text-caution-500' : i === 1 ? 'text-ink-400' : 'text-caution-700'}>
                      <path d="M32 4l7.6 15.4L56 22l-12 11.7 2.8 16.5L32 42.4 17.2 50.2 20 33.7 8 22l16.4-2.6z"/>
                    </svg>
                  </div>
                  <div className="flex items-start justify-between">
                    <div>
                      <span className={`text-xs font-bold uppercase tracking-widest ${i === 0 ? 'text-caution-500' : i === 1 ? 'text-ink-400' : 'text-caution-700'}`}>
                        #{i + 1}
                      </span>
                      <p className="text-base font-bold text-ink-900 mt-0.5 leading-tight">{c.name}</p>
                    </div>
                    <BehaviorBadge behavior={c.paymentBehavior} />
                  </div>
                  <div className="text-2xl font-bold text-primary">{fmt(c.totalRevenue)}</div>
                  <div className="flex gap-4 text-xs text-ink-400">
                    <span>{c.transactionCount ?? 0} köp</span>
                    <span>·</span>
                    <span>Snitt {fmt(c.averageAmount)}</span>
                  </div>
                  <div className="text-xs text-ink-400">Senaste: {fmtDate(c.lastPurchase)}</div>
                  {c.paymentBehavior === 'inactive' && (
                    <div className="mt-1 flex flex-col gap-2">
                      <button
                        onClick={() => void openAiReminder(c)}
                        disabled={aiReminderLoading === c.name}
                        className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 border border-brand-200 rounded-lg px-3 py-2 hover:bg-brand-50 transition-colors text-left disabled:opacity-60"
                      >
                        {aiReminderLoading === c.name ? (
                          <span className="w-3 h-3 border-2 border-brand-500 border-t-transparent rounded-full animate-spin shrink-0" />
                        ) : (
                          <Sparkles className="w-3 h-3 shrink-0" aria-hidden="true" />
                        )}
                        {aiReminderLoading === c.name ? 'AI:n förbereder...' : 'Låt AI skriva påminnelsen'}
                      </button>
                      <button
                        onClick={() => openReminder(c)}
                        className="text-[11px] text-ink-400 hover:text-ink-600 transition-colors text-left"
                      >
                        Skicka manuellt
                      </button>
                      <button
                        onClick={() => openAiWith(`Hur vinner jag tillbaka ${c.name}?`)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-ink-400 border border-ink-200 rounded-lg px-3 py-2 hover:bg-ink-50 transition-colors"
                      >
                        <Sparkles className="w-3 h-3 shrink-0" aria-hidden="true" />
                        Fråga AI om återaktivering
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search + sort */}
        {!loading && !error && (
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                placeholder="Sök kundnamn..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-ink-200 rounded-lg text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors bg-white"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-400 whitespace-nowrap">Sortera på</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="border border-ink-200 rounded-lg px-3 py-2.5 text-sm text-ink-700 outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors bg-white"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Customer list */}
        {loading ? (
          <div className="flex flex-col gap-3">
            {[...Array(6)].map((_, i) => (
              <SkeletonCard key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="bg-negative-50 border border-negative-100 text-negative-600 rounded-xl px-5 py-4 text-sm">{error}</div>
        ) : sorted.length === 0 ? (
          <EmptyState hasSearch={search.length > 0} />
        ) : (
          <div className="glass rounded-xl overflow-hidden">
            {/* Table header */}
            <div className="hidden sm:grid grid-cols-[1fr_130px_100px_130px_130px_110px_150px] gap-4 px-5 py-4 border-b border-ink-50 text-xs font-semibold text-ink-400 uppercase tracking-wide">
              <span>Kund</span>
              <span className="text-right">Totalt inflöde</span>
              <span className="text-right">Köp</span>
              <span className="text-right">Snitt/köp</span>
              <span className="text-right">Senaste köp</span>
              <span className="text-right">Beteende</span>
              <span></span>
            </div>

            {sorted.map((c, i) => (
              <div
                key={c.name}
                className={`flex flex-col sm:grid sm:grid-cols-[1fr_130px_100px_130px_130px_110px_150px] sm:items-center gap-2 sm:gap-4 px-5 py-4 ${i < sorted.length - 1 ? 'border-b border-ink-50' : ''}`}
              >
                <span className="font-semibold text-ink-900 text-sm">{c.name}</span>
                <span className="sm:text-right text-sm font-bold text-primary">
                  <span className="sm:hidden text-xs text-ink-400 font-normal mr-1">Inflöde:</span>
                  {fmt(c.totalRevenue)}
                </span>
                <span className="sm:text-right text-sm text-ink-600">
                  <span className="sm:hidden text-xs text-ink-400 mr-1">Köp:</span>
                  {c.transactionCount ?? 0}
                </span>
                <span className="sm:text-right text-sm text-ink-600">
                  <span className="sm:hidden text-xs text-ink-400 mr-1">Snitt:</span>
                  {fmt(c.averageAmount)}
                </span>
                <span className="sm:text-right text-sm text-ink-500">
                  <span className="sm:hidden text-xs text-ink-400 mr-1">Senaste:</span>
                  {fmtDate(c.lastPurchase)}
                </span>
                <div className="sm:flex sm:justify-end">
                  <BehaviorBadge behavior={c.paymentBehavior} />
                </div>
                <div className="flex flex-col items-start sm:items-end gap-1.5">
                  {c.paymentBehavior === 'inactive' && (
                    <>
                      <button
                        onClick={() => void openAiReminder(c)}
                        disabled={aiReminderLoading === c.name}
                        className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 border border-brand-200 rounded-lg px-3 py-2 hover:bg-brand-50 transition-colors whitespace-nowrap disabled:opacity-60"
                      >
                        {aiReminderLoading === c.name ? (
                          <span className="w-3 h-3 border-2 border-brand-500 border-t-transparent rounded-full animate-spin shrink-0" />
                        ) : (
                          <Sparkles className="w-3 h-3 shrink-0" aria-hidden="true" />
                        )}
                        {aiReminderLoading === c.name ? 'AI:n förbereder...' : 'Låt AI skriva påminnelsen'}
                      </button>
                      <button
                        onClick={() => openReminder(c)}
                        className="text-[11px] text-ink-400 hover:text-ink-600 transition-colors whitespace-nowrap"
                      >
                        Skicka manuellt
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reminder modal */}
      {reminderCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={closeReminder}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-2xl text-ink-900">Skicka påminnelse</h2>
              <button onClick={closeReminder} className="text-ink-400 hover:text-ink-600 text-2xl leading-none">&times;</button>
            </div>
            <p className="text-sm text-ink-400 mb-3">{reminderCustomer.name}</p>

            {reminderIsAiPrepared && (
              <div className="flex items-center gap-2 bg-brand-50 border border-brand-100 rounded-xl px-4 py-2.5 mb-4">
                <Sparkles className="w-4 h-4 text-brand-500 shrink-0" aria-hidden="true" />
                <p className="text-xs font-medium text-brand-700">AI-förslag: granska och redigera innan du skickar</p>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-medium text-ink-500 mb-1">Kund-email</label>
                <input
                  type="email"
                  placeholder="kund@foretag.se"
                  value={reminderForm.email}
                  onChange={e => setReminderForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-ink-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-500 mb-1">Belopp (SEK)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={reminderForm.amount}
                  onChange={e => setReminderForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full border border-ink-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-500 mb-1">Förfallodatum</label>
                <input
                  type="date"
                  value={reminderForm.dueDate}
                  onChange={e => setReminderForm(f => ({ ...f, dueDate: e.target.value }))}
                  className="w-full border border-ink-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-500 mb-1">
                  Personligt meddelande <span className="text-ink-300">(valfritt)</span>
                </label>
                <textarea
                  placeholder="T.ex. Hej! Vi ser att vi inte hört från dig på ett tag..."
                  value={reminderForm.message}
                  onChange={e => setReminderForm(f => ({ ...f, message: e.target.value }))}
                  rows={3}
                  className="w-full border border-ink-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={closeReminder}
                className="flex-1 py-2.5 text-sm font-semibold text-ink-600 bg-ink-100 rounded-xl hover:bg-ink-200 transition-colors"
              >
                Avbryt
              </button>
              <button
                onClick={sendReminder}
                disabled={reminderSending || !reminderForm.email || !reminderForm.amount || !reminderForm.dueDate}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-negative-600 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {reminderSending && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {reminderSending ? 'Skickar...' : 'Skicka'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success toast */}
      {reminderToast && (
        <div className="fixed bottom-6 left-6 z-50 flex items-center gap-2 bg-positive-700 text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-lg">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {reminderToast}
        </div>
      )}
    </div>
  )
}

function BehaviorBadge({ behavior }: { behavior: PaymentBehavior }) {
  const cfg = BEHAVIOR_CONFIG[behavior] ?? BEHAVIOR_CONFIG.inactive
  return (
    <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  if (hasSearch) {
    return (
      <div className="glass rounded-xl px-6 py-12 flex flex-col items-center text-center gap-2">
        <p className="text-ink-500 text-sm">Inga kunder matchade din sökning.</p>
      </div>
    )
  }
  return (
    <div className="glass rounded-xl px-6 py-12 flex flex-col items-center text-center gap-3">
      <svg className="w-10 h-10 text-ink-200" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
      <p className="text-ink-800 font-semibold text-sm">Inga kundnamn hittades i din data.</p>
      <p className="text-ink-400 text-sm max-w-sm">Se till att dina transaktioner innehåller kundnamn i beskrivningsfältet.</p>
    </div>
  )
}
