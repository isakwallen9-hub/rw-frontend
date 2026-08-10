import { useEffect, useState, useRef, useCallback } from 'react'
import { Target, TrendingUp, TrendingDown, ChevronLeft, ChevronRight, Sparkles, Lightbulb } from 'lucide-react'
import { fetchWithAuth } from '../utils/fetchWithAuth'

const API_URL = import.meta.env.VITE_API_URL as string

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 })
}

function fmtPct(actual: number, budget: number): string {
  if (budget === 0) return '—'
  const pct = ((actual - budget) / budget) * 100
  return (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%'
}

function toPeriodStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number)
  const months = ['Januari','Februari','Mars','April','Maj','Juni','Juli','Augusti','September','Oktober','November','December']
  return `${months[m - 1]} ${y}`
}

function addMonths(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return toPeriodStr(d)
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface BudgetLine {
  budget: number
  actual: number
}

interface BudgetData {
  revenue: BudgetLine
  costs: BudgetLine
}

interface AiProposal {
  revenueTarget: number
  costCap: number
  revenueReasoning?: string
  costReasoning?: string
  focusTip?: string
}

type StatusKey = 'achieved' | 'on_track' | 'behind'

const STATUS_CONFIG: Record<StatusKey, { label: string; bg: string; text: string; border: string }> = {
  achieved: { label: 'Uppnått',      bg: 'bg-positive-50',  text: 'text-positive-700',  border: 'border-positive-200' },
  on_track: { label: 'På spåret',   bg: 'bg-caution-50', text: 'text-caution-700', border: 'border-caution-200' },
  behind:   { label: 'Efter budget', bg: 'bg-negative-50',    text: 'text-negative-700',    border: 'border-negative-200' },
}

function revenueStatus(actual: number, budget: number): StatusKey {
  if (budget === 0) return 'on_track'
  if (actual >= budget) return 'achieved'
  if (actual >= budget * 0.9) return 'on_track'
  return 'behind'
}

function costsStatus(actual: number, budget: number): StatusKey {
  if (budget === 0) return 'on_track'
  if (actual <= budget) return 'achieved'
  if (actual <= budget * 1.1) return 'on_track'
  return 'behind'
}

function pct(actual: number, budget: number): number {
  if (budget === 0) return 0
  return Math.min((actual / budget) * 100, 150)
}

// ── Sub-components ────────────────────────────────────────────────────────────

function BudgetBar({
  label, icon, line, statusFn, higherIsBetter,
}: {
  label: string
  icon: React.ReactNode
  line: BudgetLine
  statusFn: (a: number, b: number) => StatusKey
  higherIsBetter: boolean
}) {
  const status = statusFn(line.actual, line.budget)
  const cfg = STATUS_CONFIG[status]
  const fillPct = pct(line.actual, line.budget)
  const diff = line.actual - line.budget
  const positive = higherIsBetter ? diff >= 0 : diff <= 0
  const barColor =
    status === 'achieved' ? 'bg-positive-500' :
    status === 'on_track' ? 'bg-caution-400' :
    'bg-negative-500'

  return (
    <div className="glass rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-ink-50 flex items-center justify-center text-ink-500">{icon}</div>
          <h3 className="text-sm font-bold text-ink-800">{label}</h3>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
          {cfg.label}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-ink-50 rounded-xl px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-ink-400 mb-1">Budget</p>
          <p className="text-base font-bold text-ink-800">{line.budget > 0 ? fmt(line.budget) : '—'}</p>
        </div>
        <div className="bg-ink-50 rounded-xl px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-ink-400 mb-1">Faktiskt</p>
          <p className="text-base font-bold text-ink-800">{fmt(line.actual)}</p>
        </div>
      </div>
      {line.budget > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-ink-400 mb-1.5">
            <span>Utfall</span>
            <span className="font-semibold">{fillPct.toFixed(0)}%</span>
          </div>
          <div className="w-full h-2.5 bg-ink-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${Math.min(fillPct, 100)}%` }} />
          </div>
        </div>
      )}
      {line.budget > 0 && (
        <div className={`flex items-center gap-1.5 text-sm font-semibold ${positive ? 'text-positive-600' : 'text-negative-600'}`}>
          {positive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          <span>{diff >= 0 ? '+' : ''}{fmt(diff)} ({fmtPct(line.actual, line.budget)})</span>
          <span className="text-xs font-normal text-ink-400 ml-1">vs budget</span>
        </div>
      )}
      {line.budget === 0 && (
        <p className="text-sm text-ink-400">Ingen budget satt för denna månad.</p>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Budget() {
  const [period, setPeriod] = useState(() => toPeriodStr(new Date()))
  const [data, setData]     = useState<BudgetData | null>(null)
  const [loading, setLoading]     = useState(false)
  const [fetchError, setFetchError] = useState('')

  // Manual form state
  const [formRevenue, setFormRevenue] = useState('')
  const [formCosts, setFormCosts]     = useState('')
  const [saving, setSaving]           = useState(false)
  const [savedMsg, setSavedMsg]       = useState('')
  const [saveError, setSaveError]     = useState('')
  const [manualOpen, setManualOpen]   = useState(false)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // AI proposal state
  const [aiLoading, setAiLoading]     = useState(false)
  const [aiProposal, setAiProposal]   = useState<AiProposal | null>(null)
  const [applying, setApplying]       = useState(false)
  const [applyError, setApplyError]   = useState('')
  const [aiSaved, setAiSaved]         = useState(false)

  // ── Data fetching ─────────────────────────────────────────────────────────

  const fetchBudget = useCallback(async (p: string, prefill = false) => {
    setLoading(true)
    setFetchError('')
    setData(null)
    try {
      const res = await fetchWithAuth(`${API_URL}api/v1/goals/budget?period=${p}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const d = json.data ?? json
      const inflow  = d.budgetVsActual?.inflow
      const outflow = d.budgetVsActual?.outflow
      const budget: BudgetData = {
        revenue: { budget: Number(inflow?.budget  ?? 0), actual: Number(inflow?.actual  ?? 0) },
        costs:   { budget: Number(outflow?.budget ?? 0), actual: Number(outflow?.actual ?? 0) },
      }
      setData(budget)
      if (prefill) {
        if (budget.revenue.budget > 0) setFormRevenue(String(budget.revenue.budget))
        if (budget.costs.budget > 0)   setFormCosts(String(budget.costs.budget))
      }
    } catch {
      setFetchError('Kunde inte hämta budgetdata. Prova igen.')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    setFormRevenue('')
    setFormCosts('')
    setAiProposal(null)
    setAiSaved(false)
    setApplyError('')
    fetchBudget(period, true)
  }, [period, fetchBudget])

  // ── Save logic ────────────────────────────────────────────────────────────

  const handleSave = async (overrideRevenue?: string, overrideCosts?: string): Promise<boolean> => {
    const rev   = overrideRevenue ?? formRevenue
    const costs = overrideCosts   ?? formCosts
    if (!rev && !costs) return false
    setSaving(true)
    setSaveError('')
    let success = false
    try {
      const goals: { type: string; targetAmount: number; period: string }[] = []
      if (rev)   goals.push({ type: 'monthly_budget', targetAmount: Number(rev),   period })
      if (costs) goals.push({ type: 'reduce_costs',   targetAmount: Number(costs), period })
      for (const payload of goals) {
        const res = await fetchWithAuth(`${API_URL}api/v1/goals`, {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}))
          throw new Error(errJson?.error?.message ?? errJson?.message ?? `HTTP ${res.status}`)
        }
      }
      if (savedTimer.current) clearTimeout(savedTimer.current)
      setSavedMsg('Budget sparad!')
      savedTimer.current = setTimeout(() => setSavedMsg(''), 3500)
      await fetchBudget(period, false)
      success = true
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Kunde inte spara budgeten.')
    }
    setSaving(false)
    return success
  }

  // ── AI logic ──────────────────────────────────────────────────────────────

  const runAiProposal = async () => {
    setAiLoading(true)
    setAiProposal(null)
    setAiSaved(false)
    setApplyError('')
    try {
      const res = await fetchWithAuth(`${API_URL}api/v1/ai/prepare-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType: 'budget_proposal', period }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const d = json?.data ?? json
      setAiProposal({
        revenueTarget: Number(d.revenueTarget ?? 0),
        costCap: Number(d.costCap ?? 0),
        revenueReasoning: d.revenueReasoning ?? d.reasoning,
        costReasoning: d.costReasoning,
        focusTip: d.focusTip,
      })
    } catch {
      // silent fail — button stays visible for retry
    } finally {
      setAiLoading(false)
    }
  }

  const applyAiBudget = async () => {
    if (!aiProposal) return
    setApplying(true)
    setApplyError('')
    const ok = await handleSave(String(aiProposal.revenueTarget), String(aiProposal.costCap))
    if (ok) setAiSaved(true)
    else setApplyError('Kunde inte spara budgeten. Försök igen.')
    setApplying(false)
  }

  // ── Navigation helpers ────────────────────────────────────────────────────

  const openAiWith = (question: string) =>
    window.dispatchEvent(new CustomEvent('rw:ai:open', { detail: { question } }))

  const prevMonth = () => setPeriod(p => addMonths(p, -1))
  const nextMonth = () => {
    const next = addMonths(period, 1)
    if (next <= toPeriodStr(new Date())) setPeriod(next)
  }
  const isCurrentMonth = period === toPeriodStr(new Date())

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <div className="font-sans">
      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-8 flex flex-col gap-6">

        {/* Page header + month picker */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl tracking-tight text-ink-900">Budget</h1>
            <p className="text-sm text-ink-500 mt-0.5">Sätt och följ upp månatliga mål</p>
          </div>
          <div className="flex items-center gap-1 bg-white border border-ink-200 rounded-xl shadow-sm px-2 py-1.5 self-start sm:self-auto">
            <button onClick={prevMonth} className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-500 hover:bg-ink-100 hover:text-ink-800 transition-colors" aria-label="Föregående månad">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-ink-800 px-3 min-w-[130px] text-center">{periodLabel(period)}</span>
            <button onClick={nextMonth} disabled={isCurrentMonth} className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-500 hover:bg-ink-100 hover:text-ink-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed" aria-label="Nästa månad">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── AI main card ──────────────────────────────────────────────── */}
        <div className="glass rounded-2xl p-6">

          {/* Card header */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-white" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-800">Låt AI:n sätta din budget</p>
              <p className="text-xs text-ink-400">Baserat på din historik och säsongsmönster</p>
            </div>
          </div>

          {/* Empty state */}
          {!aiLoading && !aiProposal && (
            <button
              onClick={() => void runAiProposal()}
              className="inline-flex items-center gap-2 px-5 py-4 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition-colors min-h-[44px]"
            >
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              Föreslå budget för {periodLabel(period)} →
            </button>
          )}

          {/* Loading */}
          {aiLoading && (
            <div className="flex items-center gap-3 py-4 text-ink-600">
              <span className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin shrink-0" />
              <p className="text-sm font-medium">AI:n förbereder...</p>
            </div>
          )}

          {/* AI proposal result */}
          {aiProposal && !aiLoading && (
            <div className="flex flex-col gap-4">

              {/* AI badge */}
              <div className="flex items-center gap-2 bg-brand-50 border border-brand-100 rounded-xl px-4 py-2.5">
                <Sparkles className="w-4 h-4 text-brand-500 shrink-0" aria-hidden="true" />
                <p className="text-xs font-medium text-brand-700">AI-förslag: granska och godkänn innan du sparar</p>
              </div>

              {/* Revenue + cost cards */}
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="bg-positive-50/80 border border-positive-200/80 rounded-xl p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-positive-600 mb-1.5 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" aria-hidden="true" />
                    Föreslaget intäktsmål
                  </p>
                  <p className="text-3xl font-bold tabular text-positive-700 mb-2">{fmt(aiProposal.revenueTarget)}</p>
                  {aiProposal.revenueReasoning && (
                    <p className="text-xs text-ink-600 leading-relaxed">{aiProposal.revenueReasoning}</p>
                  )}
                </div>
                <div className="bg-caution-50/80 border border-caution-200/80 rounded-xl p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-caution-600 mb-1.5 flex items-center gap-1">
                    <TrendingDown className="w-3 h-3" aria-hidden="true" />
                    Föreslaget kostnadstak
                  </p>
                  <p className="text-3xl font-bold tabular text-caution-700 mb-2">{fmt(aiProposal.costCap)}</p>
                  {aiProposal.costReasoning && (
                    <p className="text-xs text-ink-600 leading-relaxed">{aiProposal.costReasoning}</p>
                  )}
                </div>
              </div>

              {/* Focus tip */}
              {aiProposal.focusTip && (
                <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 flex gap-3">
                  <div className="w-7 h-7 rounded-lg bg-brand-100 flex items-center justify-center shrink-0 mt-0.5">
                    <Lightbulb className="w-3.5 h-3.5 text-brand-600" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-brand-600 mb-1">Fokus för att nå målet</p>
                    <p className="text-sm text-ink-700 leading-relaxed">{aiProposal.focusTip}</p>
                  </div>
                </div>
              )}

              {/* AI saved confirmation */}
              {aiSaved && (
                <div className="bg-positive-50 border border-positive-200 rounded-xl px-4 py-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-positive-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="text-sm font-medium text-positive-700">Budget satt av AI. Följ upp här nedanför</p>
                </div>
              )}

              {applyError && (
                <p className="text-sm text-negative-600">{applyError}</p>
              )}

              {/* Action buttons */}
              {!aiSaved && (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => void applyAiBudget()}
                    disabled={applying}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition-colors disabled:opacity-50 min-h-[44px]"
                  >
                    {applying ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                        Sparar...
                      </>
                    ) : 'Använd dessa mål →'}
                  </button>
                  <button
                    onClick={() => void runAiProposal()}
                    disabled={aiLoading}
                    className="px-4 py-2.5 border border-ink-200 text-ink-600 text-sm font-medium rounded-xl hover:border-ink-300 hover:text-ink-800 transition-colors min-h-[44px]"
                  >
                    Prova igen
                  </button>
                </div>
              )}
              {aiSaved && (
                <button
                  onClick={() => void runAiProposal()}
                  className="self-start text-sm text-ink-500 hover:text-ink-700 transition-colors"
                >
                  Föreslå ny budget →
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Manual mode toggle ─────────────────────────────────────────── */}
        <button
          onClick={() => setManualOpen(o => !o)}
          className="flex items-center gap-2 text-sm font-medium text-ink-500 hover:text-ink-800 transition-colors self-start"
        >
          <span className={`transition-transform inline-block ${manualOpen ? 'rotate-90' : ''}`}>›</span>
          {manualOpen ? 'Dölj manuell budget' : 'Eller sätt budgeten själv →'}
        </button>

        {/* ── Manual form (collapsed) ─────────────────────────────────────── */}
        {manualOpen && (
          <div className="glass rounded-2xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-9 h-9 bg-brand-50 rounded-xl flex items-center justify-center">
                <Target className="w-5 h-5 text-brand-600" />
              </div>
              <div>
                <h2 className="text-lg text-ink-800">Sätt budget manuellt</h2>
                <p className="text-xs text-ink-400">för {periodLabel(period)}</p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 mb-5">
              <div>
                <label className="block text-xs font-semibold text-ink-500 mb-1.5">Intäktsmål (SEK)</label>
                <input
                  type="number" min="0" placeholder="t.ex. 250000"
                  value={formRevenue} onChange={e => setFormRevenue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && void handleSave()}
                  className="w-full border border-ink-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                />
                <p className="text-[11px] text-ink-400 mt-1">Förväntat totalt inflöde</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-500 mb-1.5">Kostnadsmål (SEK)</label>
                <input
                  type="number" min="0" placeholder="t.ex. 180000"
                  value={formCosts} onChange={e => setFormCosts(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && void handleSave()}
                  className="w-full border border-ink-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                />
                <p className="text-[11px] text-ink-400 mt-1">Max tillåtet utflöde</p>
              </div>
            </div>

            {saveError && <p className="text-sm text-negative-600 mb-3">{saveError}</p>}

            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => void handleSave()}
                disabled={saving || (!formRevenue && !formCosts)}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl shadow-md shadow-brand-500/20 hover:opacity-90 transition-opacity disabled:opacity-50 min-h-[44px]"
              >
                {saving ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                    Sparar...
                  </>
                ) : 'Spara budget'}
              </button>
              {savedMsg && (
                <div className="flex items-center gap-1.5 text-positive-700 text-sm font-medium">
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {savedMsg}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Budget vs actual (always visible) ─────────────────────────── */}
        <div>
          <h2 className="text-2xl text-ink-800 mb-3">Budget vs utfall: {periodLabel(period)}</h2>

          {loading ? (
            <div className="grid sm:grid-cols-2 gap-4">
              {[0, 1].map(i => (
                <div key={i} className="glass rounded-2xl p-5 shadow-sm">
                  <div className="space-y-3 animate-pulse">
                    <div className="h-4 bg-ink-100 rounded w-1/2" />
                    <div className="h-10 bg-ink-100 rounded" />
                    <div className="h-2.5 bg-ink-100 rounded-full" />
                    <div className="h-4 bg-ink-100 rounded w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : fetchError ? (
            <div className="bg-negative-50 border border-negative-100 text-negative-600 rounded-xl px-5 py-4 text-sm">{fetchError}</div>
          ) : data ? (
            <>
              <div className="grid sm:grid-cols-2 gap-4">
                <BudgetBar label="Intäkter" icon={<TrendingUp className="w-5 h-5" />} line={data.revenue} statusFn={revenueStatus} higherIsBetter={true} />
                <BudgetBar label="Kostnader" icon={<TrendingDown className="w-5 h-5" />} line={data.costs} statusFn={costsStatus} higherIsBetter={false} />
              </div>
              {(() => {
                const revDev = data.revenue.budget > 0
                  ? Math.abs((data.revenue.actual - data.revenue.budget) / data.revenue.budget) : 0
                const costDev = data.costs.budget > 0
                  ? Math.abs((data.costs.actual - data.costs.budget) / data.costs.budget) : 0
                if (revDev <= 0.2 && costDev <= 0.2) return null
                const revUnder = data.revenue.budget > 0 && data.revenue.actual < data.revenue.budget * 0.8
                const costsOver = data.costs.budget > 0 && data.costs.actual > data.costs.budget * 1.2
                const direction = (!revUnder && costsOver) ? 'över' : 'under'
                return (
                  <button
                    onClick={() => openAiWith(`Varför ligger jag ${direction} budget för ${periodLabel(period)}?`)}
                    className="mt-2 w-full flex items-center gap-2 bg-white/40 backdrop-blur border border-ink-200/60 rounded-xl px-4 py-3 text-sm font-medium text-ink-700 hover:bg-white/60 hover:border-brand-300 hover:text-brand-700 transition-all min-h-[44px]"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-brand-500 shrink-0" aria-hidden="true" />
                    Fråga AI varför du ligger {direction} budget
                  </button>
                )
              })()}
            </>
          ) : null}
        </div>

        {/* ── Summary card ───────────────────────────────────────────────── */}
        {data && (data.revenue.budget > 0 || data.costs.budget > 0) && (
          <div className="glass rounded-2xl shadow-sm p-5">
            <h3 className="text-sm font-bold text-ink-700 mb-4">Sammanfattning</h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-ink-400 mb-1">Netto budget</p>
                <p className="text-base font-bold text-ink-800">
                  {data.revenue.budget > 0 && data.costs.budget > 0 ? fmt(data.revenue.budget - data.costs.budget) : '—'}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-ink-400 mb-1">Netto faktiskt</p>
                <p className={`text-base font-bold ${(data.revenue.actual - data.costs.actual) >= 0 ? 'text-positive-600' : 'text-negative-600'}`}>
                  {fmt(data.revenue.actual - data.costs.actual)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-ink-400 mb-1">Avvikelse</p>
                {(() => {
                  const budgetNet = data.revenue.budget - data.costs.budget
                  const actualNet = data.revenue.actual - data.costs.actual
                  const diff = actualNet - budgetNet
                  return (
                    <p className={`text-base font-bold ${diff >= 0 ? 'text-positive-600' : 'text-negative-600'}`}>
                      {budgetNet !== 0 ? `${diff >= 0 ? '+' : ''}${fmt(diff)}` : '—'}
                    </p>
                  )
                })()}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
