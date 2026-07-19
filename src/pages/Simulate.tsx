import { useEffect, useState, useMemo } from 'react'
import { z } from 'zod'
import { Sparkles } from 'lucide-react'
import { fetchWithAuth } from '../utils/fetchWithAuth'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts'

const API_URL = import.meta.env.VITE_API_URL as string

type ScenarioType =
  | 'remove_category'
  | 'change_amount'
  | 'add_revenue'
  | 'change_revenue_percent'
  | 'change_expenses_percent'
  | 'one_time_expense'

type Frequency = 'daily' | 'weekly' | 'monthly'
type Granularity = 'day' | 'week' | 'month'

interface Scenario {
  id: string
  type: ScenarioType
  category?: string
  changePercent?: number
  amount?: number
  frequency?: Frequency
  date?: string
}

interface ForecastPoint {
  date: string
  label: string
  baseline: number
  simulated: number
}

interface SimulateResult {
  forecast: ForecastPoint[]
  baselineNet: number
  simulatedNet: number
  baselineEndBalance: number
  simulatedEndBalance: number
}

function fmt(amount: number): string {
  const n = Number(amount)
  if (!isFinite(n)) return '— kr'
  return n.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 })
}

function fmtPct(a: number, b: number): string {
  if (b === 0) return '—'
  const pct = ((a - b) / Math.abs(b)) * 100
  return (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%'
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// Aggregate daily forecast to weekly/monthly by taking last value per bucket
function aggregateForecast(data: ForecastPoint[], granularity: Granularity): ForecastPoint[] {
  if (granularity === 'day') return data
  const buckets = new Map<string, ForecastPoint>()
  for (const point of data) {
    const d = new Date(point.date)
    let key: string
    let label: string
    if (granularity === 'week') {
      const dow = d.getDay()
      const monday = new Date(d)
      monday.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
      key = monday.toISOString().slice(0, 10)
      label = monday.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
    } else {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      label = d.toLocaleDateString('sv-SE', { month: 'short', year: '2-digit' })
    }
    buckets.set(key, { ...point, label })
  }
  return Array.from(buckets.values())
}

const LS_SIM_KEY = 'rw_saved_sims'

interface SavedSim {
  id: string
  name: string
  scenarios: Scenario[]
}

interface InsightItem {
  type: string
  category?: string
  direction?: string
  changePercent?: number
}

interface AiSuggestion {
  id: string
  label: string
  subLabel: string
  scenario: Omit<Scenario, 'id'>
}

function loadSavedSims(): SavedSim[] {
  try { return JSON.parse(localStorage.getItem(LS_SIM_KEY) ?? '[]') } catch { return [] }
}

const SCENARIO_LABELS: Record<ScenarioType, string> = {
  remove_category: 'Ta bort kategori',
  change_amount: 'Ändra belopp',
  add_revenue: 'Lägg till intäkt',
  change_revenue_percent: 'Ändra alla intäkter med %',
  change_expenses_percent: 'Ändra alla kostnader med %',
  one_time_expense: 'Lägg till engångskostnad',
}

const SCENARIO_CONFIG: Record<ScenarioType, { icon: string; bg: string; border: string; iconBg: string; labelColor: string }> = {
  remove_category:         { icon: '✕', bg: 'bg-red-50',     border: 'border-red-200',    iconBg: 'bg-red-100 text-red-600',     labelColor: 'text-red-600' },
  change_amount:           { icon: '%', bg: 'bg-blue-50',    border: 'border-blue-200',   iconBg: 'bg-blue-100 text-blue-600',   labelColor: 'text-blue-600' },
  add_revenue:             { icon: '+', bg: 'bg-green-50',   border: 'border-green-200',  iconBg: 'bg-green-100 text-green-600', labelColor: 'text-green-600' },
  change_revenue_percent:  { icon: '↑', bg: 'bg-emerald-50', border: 'border-emerald-200', iconBg: 'bg-emerald-100 text-emerald-600', labelColor: 'text-emerald-600' },
  change_expenses_percent: { icon: '↓', bg: 'bg-orange-50',  border: 'border-orange-200', iconBg: 'bg-orange-100 text-orange-600', labelColor: 'text-orange-600' },
  one_time_expense:        { icon: '−', bg: 'bg-purple-50',  border: 'border-purple-200', iconBg: 'bg-purple-100 text-purple-600', labelColor: 'text-purple-600' },
}

const FREQ_LABELS: Record<Frequency, string> = {
  daily: 'dagligen',
  weekly: 'veckovis',
  monthly: 'månadsvis',
}

const CATEGORY_DISPLAY: Record<string, string> = {
  all: 'Alla intäkter',
  expenses: 'Alla kostnader',
}

function scenarioChip(s: Scenario): string {
  const sign = (s.changePercent ?? 0) >= 0 ? '+' : ''
  const catLabel = s.category ? (CATEGORY_DISPLAY[s.category] ?? s.category) : ''
  switch (s.type) {
    case 'remove_category': return `Ta bort: ${catLabel}`
    case 'change_amount':   return `${catLabel}: ${sign}${s.changePercent}%`
    case 'add_revenue':     return `+${fmt(s.amount ?? 0)} ${FREQ_LABELS[s.frequency ?? 'monthly']}`
    case 'change_revenue_percent':  return `Alla intäkter: ${sign}${s.changePercent}%`
    case 'change_expenses_percent': return `Alla kostnader: ${sign}${s.changePercent}%`
    case 'one_time_expense':        return `-${fmt(s.amount ?? 0)} den ${s.date ?? ''}`
  }
}

function cleanScenarioLabel(label: string): string {
  return label
    .replace(/^(vad händer om\s+(?:jag|du|vi|man)\s+)/i, '')
    .replace(/^om\s+(?:jag|du|vi|man)\s+/i, '')
    .replace(/\?$/, '')
    .trim()
}

// Zod schema for AI-extracted scenario validation
const ScenarioSchema = z.object({
  type: z.enum([
    'remove_category', 'change_amount', 'add_revenue',
    'change_revenue_percent', 'change_expenses_percent', 'one_time_expense',
  ]),
  category: z.string().optional(),
  changePercent: z.number().optional(),
  amount: z.number().optional(),
  frequency: z.enum(['daily', 'weekly', 'monthly']).optional(),
  date: z.string().optional(),
})

function parseAiForecast(data: Record<string, unknown>, cb: number): ForecastPoint[] | null {
  // Format 1: data.forecast = { baseline: [], simulated: [] }
  const fcast = data.forecast as Record<string, unknown> | null | undefined
  if (fcast && typeof fcast === 'object') {
    const bl = Array.isArray(fcast.baseline)
      ? (fcast.baseline as { date: string; balance?: number; value?: number }[])
      : []
    const sl = Array.isArray(fcast.simulated)
      ? (fcast.simulated as { date: string; balance?: number; value?: number }[])
      : []
    if (bl.length > 0) {
      return bl.map((b, i) => {
        const s = sl[i]
        return {
          date: b.date,
          label: formatDate(b.date),
          baseline: cb + (b.balance ?? b.value ?? 0),
          simulated: cb + (s ? (s.balance ?? s.value ?? 0) : (b.balance ?? b.value ?? 0)),
        }
      })
    }
  }
  // Format 2: datasets array (AiAssistant chart format)
  const tryDatasets = (src: Record<string, unknown>) => {
    const ds = Array.isArray(src.datasets)
      ? (src.datasets as { label: string; data: { x: string; y: number }[] }[])
      : null
    if (!ds || ds.length === 0) return null
    const blDs = ds[0].data ?? []
    const slDs = (ds[1] ?? ds[0]).data ?? []
    if (blDs.length === 0) return null
    return blDs.map((b, i) => ({
      date: b.x,
      label: formatDate(b.x),
      baseline: cb + (b.y ?? 0),
      simulated: cb + (slDs[i]?.y ?? b.y ?? 0),
    }))
  }
  const fromData = tryDatasets(data)
  if (fromData) return fromData
  const chart = data.chart as Record<string, unknown> | null | undefined
  if (chart && typeof chart === 'object') {
    const fromChart = tryDatasets(chart as Record<string, unknown>)
    if (fromChart) return fromChart
  }
  return null
}

function forecastToResult(forecast: ForecastPoint[]): SimulateResult {
  const first = forecast[0]
  const last = forecast[forecast.length - 1]
  return {
    forecast,
    baselineNet: last.baseline - first.baseline,
    simulatedNet: last.simulated - first.simulated,
    baselineEndBalance: last.baseline,
    simulatedEndBalance: last.simulated,
  }
}

// Which types need a category dropdown
const NEEDS_CATEGORY: ScenarioType[] = ['remove_category', 'change_amount']
// Which types need a percent input
const NEEDS_PERCENT: ScenarioType[] = ['change_amount', 'change_revenue_percent', 'change_expenses_percent']
// Which types need amount + frequency
const NEEDS_AMOUNT_FREQ: ScenarioType[] = ['add_revenue']
// Which types need amount + date
const NEEDS_AMOUNT_DATE: ScenarioType[] = ['one_time_expense']

export default function Simulate() {
  const todayStr = toDateInput(new Date())

  const [categories, setCategories] = useState<string[]>([])
  const [worstCategory, setWorstCategory] = useState('')
  const [scenarios, setScenarios] = useState<Scenario[]>([])

  // Form
  const [addType, setAddType] = useState<ScenarioType>('remove_category')
  const [addCategory, setAddCategory] = useState('')
  const [addPercent, setAddPercent] = useState('0')
  const [addAmount, setAddAmount] = useState('')
  const [addFrequency, setAddFrequency] = useState<Frequency>('monthly')
  const [addDate, setAddDate] = useState(todayStr)

  // Results
  const [currentBalance, setCurrentBalance] = useState(0)
  const [result, setResult] = useState<SimulateResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [granularity, setGranularity] = useState<Granularity>('month')
  const [savedSims, setSavedSims] = useState<SavedSim[]>(loadSavedSims)
  const [saveSimName, setSaveSimName] = useState('')
  const [saveSimOpen, setSaveSimOpen] = useState(false)
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>([])

  // AI-first path
  const [aiQuestion, setAiQuestion] = useState('')
  const [aiAnswer, setAiAnswer] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiSimFailed, setAiSimFailed] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [scenarioLabel, setScenarioLabel] = useState('')

  useEffect(() => {
    fetchWithAuth(`${API_URL}api/v1/analytics/categories`)
      .then(r => r.json())
      .then(json => {
        const cats = Array.isArray(json?.data?.categories) ? json.data.categories : []
        setCategories(cats)
        if (cats.length > 0) setAddCategory(cats[0])

        // Fetch inflow per category over the last 90 days to find the worst
        if (cats.length > 1) {
          const now = new Date()
          const from = new Date(now.getTime() - 90 * 86400000).toISOString().split('T')[0] + 'T00:00:00Z'
          const to   = now.toISOString().split('T')[0] + 'T00:00:00Z'
          fetchWithAuth(`${API_URL}api/v1/analytics/compare?${new URLSearchParams({ groupBy: 'category', metric: 'inflow', from, to })}`)
            .then(r => r.json())
            .then(json2 => {
              const data: { label: string; value: number }[] = Array.isArray(json2?.data?.data) ? json2.data.data : []
              // Only consider categories we actually know about
              const known = data.filter(d => cats.includes(d.label))
              if (known.length > 0) {
                const worst = known.reduce((a, b) => b.value < a.value ? b : a)
                setWorstCategory(worst.label)
              } else if (cats.length > 0) {
                setWorstCategory(cats[0])
              }
            })
            .catch(() => { if (cats.length > 0) setWorstCategory(cats[0]) })
        } else if (cats.length === 1) {
          setWorstCategory(cats[0])
        }
      })
      .catch(() => {})
  }, [])

  // Fetch current account balance for anchored chart
  useEffect(() => {
    fetchWithAuth(`${API_URL}api/v1/cashflow/runway`)
      .then(r => r.json())
      .then(json => {
        const bal =
          json?.data?.currentBalance ??
          json?.data?.openingBalance ??
          json?.data?.balance ??
          json?.currentBalance ?? 0
        if (typeof bal === 'number' && isFinite(bal)) setCurrentBalance(bal)
      })
      .catch(() => {})
  }, [])

  // Fetch insights on mount to derive AI scenario suggestions
  useEffect(() => {
    const controller = new AbortController()
    fetchWithAuth(`${API_URL}api/v1/insights`, { signal: controller.signal })
      .then(r => r.json())
      .then(json => {
        if (controller.signal.aborted) return
        const items: InsightItem[] = Array.isArray(json?.data) ? json.data
                                   : Array.isArray(json?.insights) ? json.insights
                                   : []
        const suggestions: AiSuggestion[] = []

        const priceErosion = items.find(i => i.type === 'PRICE_EROSION' && i.category)
        if (priceErosion?.category) {
          suggestions.push({
            id: 'price_erosion',
            label: 'AI: Snittpriset har sjunkit — testa en höjning',
            subLabel: `Höj ${priceErosion.category} med 10%`,
            scenario: { type: 'change_amount', category: priceErosion.category, changePercent: 10 },
          })
        }

        const trendBreak = items.find(i =>
          i.type === 'TREND_BREAK' && i.category &&
          (i.direction === 'negative' || (i.changePercent ?? 0) < 0)
        )
        if (trendBreak?.category) {
          suggestions.push({
            id: 'trend_break',
            label: `Vad händer om ${trendBreak.category} fortsätter tappa?`,
            subLabel: `Simulerar -20% på ${trendBreak.category}`,
            scenario: { type: 'change_amount', category: trendBreak.category, changePercent: -20 },
          })
        }

        const concentrationRisk = items.find(i => i.type === 'CONCENTRATION_RISK' && i.category)
        if (concentrationRisk?.category) {
          suggestions.push({
            id: 'concentration_risk',
            label: `Vad händer om jag tappar ${concentrationRisk.category}?`,
            subLabel: `Tar bort hela ${concentrationRisk.category}`,
            scenario: { type: 'remove_category', category: concentrationRisk.category },
          })
        }

        setAiSuggestions(suggestions)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  const handleAdd = () => {
    const scenario: Scenario = { id: Date.now().toString(), type: addType }

    if (NEEDS_CATEGORY.includes(addType)) {
      if (!addCategory) return
      scenario.category = addCategory
    }
    if (NEEDS_PERCENT.includes(addType)) {
      scenario.changePercent = Number(addPercent)
    }
    if (NEEDS_AMOUNT_FREQ.includes(addType)) {
      if (!addAmount) return
      scenario.amount = Number(addAmount)
      scenario.frequency = addFrequency
    }
    if (NEEDS_AMOUNT_DATE.includes(addType)) {
      if (!addAmount) return
      scenario.amount = Number(addAmount)
      scenario.date = addDate
    }

    setScenarios(prev => [...prev, scenario])
    setResult(null)
  }

  const handleRemove = (id: string) => {
    setScenarios(prev => prev.filter(s => s.id !== id))
    setResult(null)
  }

  const applyTemplate = (tpl: 'remove_worst' | 'increase_prices' | 'cut_costs') => {
    let scenario: Scenario
    if (tpl === 'remove_worst') {
      const cat = worstCategory || (categories.length > 0 ? categories[0] : '')
      if (!cat) return
      scenario = { id: Date.now().toString(), type: 'remove_category', category: cat }
    } else if (tpl === 'increase_prices') {
      // Map to backend type: change_amount with category='all'
      scenario = { id: Date.now().toString(), type: 'change_amount', category: 'all', changePercent: 10 }
    } else {
      // Map to backend type: change_amount with category='expenses'
      scenario = { id: Date.now().toString(), type: 'change_amount', category: 'expenses', changePercent: -15 }
    }
    setScenarios(prev => [...prev, scenario])
    setResult(null)
  }

  const handleSaveSim = () => {
    if (!saveSimName.trim() || scenarios.length === 0) return
    const sim: SavedSim = { id: Date.now().toString(), name: saveSimName.trim(), scenarios }
    const updated = [sim, ...savedSims.filter(s => s.name !== saveSimName.trim())]
    localStorage.setItem(LS_SIM_KEY, JSON.stringify(updated))
    setSavedSims(updated)
    setSaveSimName('')
    setSaveSimOpen(false)
  }

  const handleLoadSim = (sim: SavedSim) => {
    setScenarios(sim.scenarios)
    setResult(null)
  }

  const handleDeleteSim = (id: string) => {
    const updated = savedSims.filter(s => s.id !== id)
    localStorage.setItem(LS_SIM_KEY, JSON.stringify(updated))
    setSavedSims(updated)
  }

  const runSimulation = (scenariosToRun: Scenario[]): Promise<void> => {
    if (scenariosToRun.length === 0) return Promise.resolve()
    setLoading(true)
    setError('')

    const payload = scenariosToRun.map(({ id: _id, ...rest }) => {
      if (rest.type === 'change_revenue_percent') {
        return { type: 'change_amount', category: 'all', changePercent: rest.changePercent }
      }
      if (rest.type === 'change_expenses_percent') {
        return { type: 'change_amount', category: 'expenses', changePercent: rest.changePercent }
      }
      if (rest.type === 'one_time_expense') {
        return { type: 'add_revenue', amount: -(rest.amount ?? 0), frequency: 'monthly' }
      }
      return rest
    })

    return fetchWithAuth(`${API_URL}api/v1/analytics/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarios: payload, days: 90 }),
    })
      .then(r => r.json())
      .then(json => {
        const data = json?.data ?? {}
        const baseline: { date: string; balance?: number; value?: number }[] = Array.isArray(data.baseline) ? data.baseline : []
        const simulated: { date: string; balance?: number; value?: number }[] = Array.isArray(data.simulated) ? data.simulated : []
        const forecast: ForecastPoint[] = baseline.map((b, i) => {
          const s = simulated[i]
          return {
            date: b.date,
            label: formatDate(b.date),
            baseline: currentBalance + (b.balance ?? b.value ?? 0),
            simulated: currentBalance + (s ? (s.balance ?? s.value ?? 0) : 0),
          }
        })
        const summary = data.summary ?? {}
        const baselineNet    = summary.baseline?.netCashflow  ?? 0
        const simulatedNet   = summary.simulated?.netCashflow ?? 0
        const lastBaseline   = forecast.length > 0 ? forecast[forecast.length - 1].baseline  : currentBalance
        const lastSimulated  = forecast.length > 0 ? forecast[forecast.length - 1].simulated : currentBalance
        const apiBaseEnd     = summary.baseline?.closingBalance
        const apiSimEnd      = summary.simulated?.closingBalance
        const baselineEndBalance  = apiBaseEnd  != null ? currentBalance + apiBaseEnd  : lastBaseline
        const simulatedEndBalance = apiSimEnd   != null ? currentBalance + apiSimEnd   : lastSimulated
        setResult({ forecast, baselineNet, simulatedNet, baselineEndBalance, simulatedEndBalance })
      })
      .catch(() => setError('Kunde inte köra simulering. Kontrollera din anslutning och försök igen.'))
      .finally(() => setLoading(false))
  }

  const handleSimulate = () => {
    setScenarioLabel(scenarios.map(scenarioChip).join(' + '))
    void runSimulation(scenarios)
  }

  const applyAiSuggestion = (suggestion: AiSuggestion) => {
    const scenario: Scenario = { ...suggestion.scenario, id: Date.now().toString() }
    const next = [...scenarios, scenario]
    setScenarios(next)
    setResult(null)
    setScenarioLabel(suggestion.label)
    void runSimulation(next)
  }

  const tryParseScenario = (raw: unknown): Scenario | null => {
    try {
      let obj: unknown
      if (typeof raw === 'string') {
        const match = raw.match(/\{[\s\S]*\}/)
        if (!match) return null
        obj = JSON.parse(match[0])
      } else {
        obj = raw
      }
      const validated = ScenarioSchema.safeParse(obj)
      return validated.success ? { ...validated.data, id: `ai-extract-${Date.now()}` } : null
    } catch {
      return null
    }
  }

  const handleAiAsk = async () => {
    if (!aiQuestion.trim()) return
    setAiLoading(true)
    setAiAnswer(null)
    setResult(null)
    setScenarios([])
    setScenarioLabel(aiQuestion)
    setAiSimFailed(false)

    try {
      // ── First pass: AI interpretation ─────────────────────────────
      const res = await fetchWithAuth(`${API_URL}api/v1/ai/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: 'simulate', question: aiQuestion }),
      })
      const json = await res.json()
      const data = (json?.data ?? json) as Record<string, unknown>
      const answer = (data?.answer as string | undefined) ?? ''
      if (answer) setAiAnswer(answer)

      // Case 1: backend returned structured scenarios
      const aiScenarios = Array.isArray(data?.scenarios)
        ? (data.scenarios as Omit<Scenario, 'id'>[])
        : []
      if (aiScenarios.length > 0) {
        const withIds = aiScenarios.map((s, i) => ({ ...s, id: `ai-${Date.now()}-${i}` }))
        setScenarios(withIds)
        await runSimulation(withIds)
        return
      }

      // Case 2: backend returned forecast/chart data directly
      const directForecast = parseAiForecast(data, currentBalance)
      if (directForecast && directForecast.length > 0) {
        setResult(forecastToResult(directForecast))
        return
      }

      // ── Second pass: extract scenario from question ────────────────
      const extractRes = await fetchWithAuth(`${API_URL}api/v1/ai/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: 'simulate',
          question: `Konvertera till simuleringsscenario-JSON för: "${aiQuestion}". Svara ENBART med ett JSON-objekt: {"type":"remove_category|change_amount|add_revenue|change_revenue_percent|change_expenses_percent","category":"string","changePercent":number,"amount":number,"frequency":"daily|weekly|monthly"}. Inkludera bara relevanta fält.`,
        }),
      })
      const extractJson = await extractRes.json()
      const extractData = (extractJson?.data ?? extractJson) as Record<string, unknown>

      const extracted =
        tryParseScenario((extractData?.answer as string | undefined) ?? '') ??
        tryParseScenario(extractData?.scenario)

      if (extracted) {
        setScenarios([extracted])
        await runSimulation([extracted])
        return
      }

      // ── All paths failed: show fallback ───────────────────────────
      setAiSimFailed(true)
    } catch {
      setAiSimFailed(true)
    } finally {
      setAiLoading(false)
    }
  }

  const displayData = useMemo(
    () => result ? aggregateForecast(result.forecast, granularity) : [],
    [result, granularity]
  )

  const balanceDiff = result ? result.simulatedEndBalance - result.baselineEndBalance : 0
  // First forecast point where simulated balance goes negative → cash runs out
  const breakEvenPoint = result?.forecast.find(p => p.simulated < 0) ?? null
  const cleanedLabel = cleanScenarioLabel(scenarioLabel)

  return (
    <div className="font-sans">
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10">

        <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-1">Vad händer om...?</h1>
        <p className="text-sm text-gray-500 mb-6">Beskriv ett scenario och se hur det påverkar ditt saldo de nästa 90 dagarna.</p>

        {/* ── AI main card ─────────────────────────────────────────── */}
        <div className="bg-white/40 backdrop-blur-2xl border border-slate-200/60 relative shadow-[0_8px_32px_rgba(15,23,42,0.06)] before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/80 before:to-transparent rounded-2xl p-6 mb-4">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-white" aria-hidden="true" />
            </div>
            <p className="text-base font-semibold text-slate-800">Beskriv vad du funderar på — AI:n simulerar åt dig</p>
          </div>

          <textarea
            value={aiQuestion}
            onChange={e => setAiQuestion(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void handleAiAsk() }}
            placeholder="T.ex. Vad händer om jag anställer en person för 25 000 kr i månaden?"
            rows={3}
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition resize-none bg-white/60"
          />

          <div className="flex flex-wrap gap-2 mt-3 mb-4">
            {[
              'Om jag höjer priserna 10%?',
              'Om jag tappar min största kund?',
              'Om jag investerar 50 000 kr i marknadsföring?',
            ].map(q => (
              <button
                key={q}
                onClick={() => setAiQuestion(q)}
                className="text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-1.5 hover:border-blue-300 hover:text-blue-700 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>

          <button
            onClick={() => void handleAiAsk()}
            disabled={!aiQuestion.trim() || aiLoading || loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 min-h-[44px]"
          >
            {aiLoading ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                AI:n bygger ditt scenario...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" aria-hidden="true" />
                Simulera med AI →
              </>
            )}
          </button>

          {aiAnswer && !aiLoading && (
            <div className="mt-5 pt-5 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">AI:ns förklaring</p>
              <p className="text-sm text-slate-700 leading-relaxed">{aiAnswer}</p>
            </div>
          )}

          {aiSimFailed && !result && !aiLoading && (
            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-sm text-amber-800">
                Kunde inte bygga ett scenario automatiskt.{' '}
                <button
                  onClick={() => setManualOpen(true)}
                  className="font-semibold underline hover:text-amber-900 transition-colors"
                >
                  Prova det manuella läget
                </button>
                {' '}för att bygga ditt scenario grafiskt.
              </p>
            </div>
          )}
        </div>

        {/* ── Manual mode toggle ───────────────────────────────────── */}
        <button
          onClick={() => setManualOpen(o => !o)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors mb-6"
        >
          <span className={`transition-transform inline-block ${manualOpen ? 'rotate-90' : ''}`}>›</span>
          {manualOpen ? 'Stäng manuellt läge' : 'Eller bygg scenariot själv →'}
        </button>

        {/* ── Manual builder ───────────────────────────────────────── */}
        {manualOpen && (
          <div className="mb-6 flex flex-col gap-4">

            {aiSuggestions.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-purple-500" aria-hidden="true" />
                  <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider">AI föreslår baserat på din data</p>
                </div>
                <div className="flex flex-col sm:flex-row flex-wrap gap-3">
                  {aiSuggestions.map(s => (
                    <button
                      key={s.id}
                      onClick={() => applyAiSuggestion(s)}
                      className="flex items-start gap-3 bg-white/40 backdrop-blur border border-purple-200/60 rounded-xl px-4 py-3 text-left hover:bg-purple-50/60 hover:border-purple-300 transition-all cursor-pointer min-h-[44px] group"
                    >
                      <Sparkles className="w-4 h-4 text-purple-400 shrink-0 mt-0.5 group-hover:text-purple-600 transition-colors" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-semibold text-slate-800 leading-snug group-hover:text-purple-800 transition-colors">{s.label}</p>
                        <p className="text-xs text-purple-500/80 mt-0.5">{s.subLabel}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {savedSims.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Sparade simuleringar</p>
                <div className="flex flex-wrap gap-2">
                  {savedSims.map(sim => (
                    <div key={sim.id} className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm shadow-sm">
                      <button onClick={() => handleLoadSim(sim)} className="text-gray-700 hover:text-blue-600 font-medium">
                        {sim.name}
                      </button>
                      <button onClick={() => handleDeleteSim(sim.id)} className="text-gray-300 hover:text-red-400 ml-1 leading-none">×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white/40 backdrop-blur-2xl border border-slate-200/60 relative shadow-[0_8px_32px_rgba(15,23,42,0.06)] before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/80 before:to-transparent rounded-2xl p-6">

              <div className="mb-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Snabb-scenarion</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {([
                    { key: 'remove_worst',    icon: '✕', label: 'Ta bort sämsta produkten', color: 'border-red-200 hover:border-red-400 hover:bg-red-50' },
                    { key: 'increase_prices', icon: '↑', label: 'Öka alla priser 10%',       color: 'border-green-200 hover:border-green-400 hover:bg-green-50' },
                    { key: 'cut_costs',       icon: '↓', label: 'Minska kostnader 15%',      color: 'border-orange-200 hover:border-orange-400 hover:bg-orange-50' },
                  ] as const).map(t => (
                    <button key={t.key} onClick={() => applyTemplate(t.key)}
                      className={`flex sm:flex-col items-center gap-2 sm:gap-1.5 px-4 sm:px-3 py-3 bg-white border rounded-xl sm:text-center transition-colors min-h-[44px] ${t.color}`}>
                      <span className="text-lg font-bold text-gray-600">{t.icon}</span>
                      <span className="text-xs font-medium text-gray-600 leading-tight">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-100 pt-5">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Anpassat scenario</h2>
                <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-stretch sm:items-end">
                  <div className="w-full sm:w-auto">
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Typ</label>
                    <select value={addType} onChange={e => setAddType(e.target.value as ScenarioType)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-blue-500 bg-white min-h-[44px]">
                      {(Object.entries(SCENARIO_LABELS) as [ScenarioType, string][]).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>

                  {NEEDS_CATEGORY.includes(addType) && (
                    <div className="w-full sm:w-auto">
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Kategori</label>
                      <select value={addCategory} onChange={e => setAddCategory(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-blue-500 bg-white min-h-[44px]">
                        {categories.length === 0
                          ? <option value="">Laddar...</option>
                          : categories.map(cat => <option key={cat} value={cat}>{cat}</option>)
                        }
                      </select>
                    </div>
                  )}

                  {NEEDS_PERCENT.includes(addType) && (
                    <div className="w-full sm:w-auto">
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Förändring (%)</label>
                      <input type="number" value={addPercent} onChange={e => setAddPercent(e.target.value)}
                        placeholder="t.ex. -20"
                        className="w-full sm:w-28 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-blue-500 min-h-[44px]" />
                    </div>
                  )}

                  {NEEDS_AMOUNT_FREQ.includes(addType) && (
                    <>
                      <div className="w-full sm:w-auto">
                        <label className="block text-xs font-medium text-gray-500 mb-1.5">Belopp (SEK)</label>
                        <input type="number" value={addAmount} onChange={e => setAddAmount(e.target.value)}
                          placeholder="t.ex. 10000"
                          className="w-full sm:w-32 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-blue-500 min-h-[44px]" />
                      </div>
                      <div className="w-full sm:w-auto">
                        <label className="block text-xs font-medium text-gray-500 mb-1.5">Frekvens</label>
                        <select value={addFrequency} onChange={e => setAddFrequency(e.target.value as Frequency)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-blue-500 bg-white min-h-[44px]">
                          <option value="daily">Dagligen</option>
                          <option value="weekly">Veckovis</option>
                          <option value="monthly">Månadsvis</option>
                        </select>
                      </div>
                    </>
                  )}

                  {NEEDS_AMOUNT_DATE.includes(addType) && (
                    <>
                      <div className="w-full sm:w-auto">
                        <label className="block text-xs font-medium text-gray-500 mb-1.5">Belopp (SEK)</label>
                        <input type="number" value={addAmount} onChange={e => setAddAmount(e.target.value)}
                          placeholder="t.ex. 5000"
                          className="w-full sm:w-32 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-blue-500 min-h-[44px]" />
                      </div>
                      <div className="w-full sm:w-auto">
                        <label className="block text-xs font-medium text-gray-500 mb-1.5">Datum</label>
                        <input type="date" value={addDate} onChange={e => setAddDate(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-blue-500 min-h-[44px]" />
                      </div>
                    </>
                  )}

                  <button onClick={handleAdd}
                    className="w-full sm:w-auto px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors min-h-[44px]">
                    + Lägg till
                  </button>
                </div>
              </div>

              {scenarios.length > 0 && (
                <div className="mt-5 pt-4 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Aktiva scenarion</p>
                  <div className="grid sm:grid-cols-2 gap-3 mb-4">
                    {scenarios.map(s => {
                      const cfg = SCENARIO_CONFIG[s.type]
                      return (
                        <div key={s.id} className={`flex items-start gap-3 p-4 rounded-xl border ${cfg.bg} ${cfg.border}`}>
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${cfg.iconBg}`}>
                            {cfg.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 ${cfg.labelColor}`}>
                              {SCENARIO_LABELS[s.type]}
                            </p>
                            <p className="text-sm font-medium text-gray-800 leading-snug">{scenarioChip(s)}</p>
                          </div>
                          <button onClick={() => handleRemove(s.id)}
                            className="text-gray-300 hover:text-red-400 text-lg leading-none shrink-0 mt-0.5"
                            title="Ta bort">×</button>
                        </div>
                      )
                    })}
                  </div>
                  <button onClick={handleSimulate} disabled={loading}
                    className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50">
                    {loading ? 'Simulerar...' : 'Kör simulering →'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 rounded-xl px-5 py-4 text-sm mb-6">
            {error}
          </div>
        )}

        {/* ── Result ──────────────────────────────────────────────── */}
        {result && (
          <>
            {/* Narrative sentence */}
            <div className="bg-white/40 backdrop-blur-2xl border border-slate-200/60 relative shadow-[0_8px_32px_rgba(15,23,42,0.06)] before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/80 before:to-transparent rounded-2xl px-6 py-5 mb-4">
              <p className="text-xl sm:text-2xl font-bold text-slate-900 leading-snug">
                {cleanedLabel
                  ? <>Om du <span className="text-blue-700">{cleanedLabel}</span> förväntas</>
                  : <>Med ditt scenario förväntas</>
                }{' '}
                ditt saldo bli{' '}
                <span className={result.simulatedEndBalance >= 0 ? 'text-green-600' : 'text-red-500'}>
                  {fmt(result.simulatedEndBalance)}
                </span>
                {' '}om 90 dagar
                {balanceDiff !== 0 && (
                  <> — det är{' '}
                    <span className={balanceDiff >= 0 ? 'text-green-600' : 'text-red-500'}>
                      {fmt(Math.abs(balanceDiff))} {balanceDiff >= 0 ? 'mer' : 'mindre'}
                    </span>
                    {' '}än om du inte gör något
                  </>
                )}.
              </p>
            </div>

            {/* Chart */}
            <div className="bg-white/40 backdrop-blur-2xl border border-slate-200/60 relative shadow-[0_8px_32px_rgba(15,23,42,0.06)] before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/80 before:to-transparent rounded-2xl p-6 mb-2">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-gray-700">Prognos — nästa 90 dagar</p>
                <div className="flex gap-1">
                  {(['day', 'week', 'month'] as Granularity[]).map(g => (
                    <button key={g} onClick={() => setGranularity(g)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                        granularity === g ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                      }`}>
                      {g === 'day' ? 'Dag' : g === 'week' ? 'Vecka' : 'Månad'}
                    </button>
                  ))}
                </div>
              </div>

              {displayData.length === 0 ? (
                <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">
                  Ingen prognosdata returnerades.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={displayData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={55} />
                    <Tooltip formatter={(v: unknown) => fmt(Number(v ?? 0))} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <ReferenceLine y={0} stroke="#ef4444" strokeWidth={1} strokeDasharray="4 3"
                      label={{ value: 'Saldo noll', position: 'insideTopRight', fontSize: 10, fill: '#ef4444' }} />
                    <Line type="monotone" dataKey="baseline" name="Utan ändring" stroke="#9ca3af" strokeWidth={2} dot={false} strokeDasharray="5 3" />
                    <Line type="monotone" dataKey="simulated" name="Med scenario" stroke="#2563eb" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}

              {breakEvenPoint && (
                <div className="mt-4 flex items-start gap-2.5 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                  <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-red-700">
                    Med detta scenario tar kassan slut omkring{' '}
                    <strong>{new Date(breakEvenPoint.date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })}</strong>.
                  </p>
                </div>
              )}
            </div>

            {/* Detail line */}
            <p className="text-xs text-slate-400 text-center mb-5">
              Idag: {fmt(currentBalance)} · Utan ändring om 90 dagar: {fmt(result.baselineEndBalance)}
            </p>

            {/* Save simulation */}
            {scenarios.length > 0 && (
              <div className="flex justify-center">
                {!saveSimOpen ? (
                  <button onClick={() => setSaveSimOpen(true)}
                    className="text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-xl px-4 py-2 hover:border-slate-300 transition-colors min-h-[44px]">
                    Spara simulering
                  </button>
                ) : (
                  <div className="flex gap-2 w-full max-w-sm">
                    <input autoFocus value={saveSimName} onChange={e => setSaveSimName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveSim(); if (e.key === 'Escape') { setSaveSimOpen(false); setSaveSimName('') } }}
                      placeholder="Namn på simuleringen..."
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-500" />
                    <button onClick={handleSaveSim}
                      className="px-3 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
                      Spara
                    </button>
                    <button onClick={() => { setSaveSimOpen(false); setSaveSimName('') }}
                      className="text-gray-400 hover:text-gray-600 px-2 text-sm">
                      Avbryt
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Empty state */}
        {!result && !aiLoading && !aiAnswer && (
          <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-10 text-center text-gray-400 text-sm">
            Skriv in din fråga ovan och låt AI:n simulera, eller expandera det manuella läget.
          </div>
        )}

      </div>
    </div>
  )
}