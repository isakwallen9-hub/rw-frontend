import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
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

// Which types need a category dropdown
const NEEDS_CATEGORY: ScenarioType[] = ['remove_category', 'change_amount']
// Which types need a percent input
const NEEDS_PERCENT: ScenarioType[] = ['change_amount', 'change_revenue_percent', 'change_expenses_percent']
// Which types need amount + frequency
const NEEDS_AMOUNT_FREQ: ScenarioType[] = ['add_revenue']
// Which types need amount + date
const NEEDS_AMOUNT_DATE: ScenarioType[] = ['one_time_expense']

export default function Simulate() {
  const navigate = useNavigate()
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
  const [result, setResult] = useState<SimulateResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [granularity, setGranularity] = useState<Granularity>('month')
  const [savedSims, setSavedSims] = useState<SavedSim[]>(loadSavedSims)
  const [saveSimName, setSaveSimName] = useState('')
  const [saveSimOpen, setSaveSimOpen] = useState(false)

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

  const handleSimulate = () => {
    if (scenarios.length === 0) return
    setLoading(true)
    setError('')

    const payload = scenarios.map(({ id: _id, ...rest }) => {
      // Map frontend-only types to the backend's accepted types
      if (rest.type === 'change_revenue_percent') {
        return { type: 'change_amount', category: 'all', changePercent: rest.changePercent }
      }
      if (rest.type === 'change_expenses_percent') {
        return { type: 'change_amount', category: 'expenses', changePercent: rest.changePercent }
      }
      if (rest.type === 'one_time_expense') {
        // Backend doesn't have a one-time type; send as add_revenue with a negative amount
        return { type: 'add_revenue', amount: -(rest.amount ?? 0), frequency: 'monthly' }
      }
      return rest
    })

    fetchWithAuth(`${API_URL}api/v1/analytics/simulate`, {
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
            baseline: b.balance ?? b.value ?? 0,
            simulated: s ? (s.balance ?? s.value ?? 0) : 0,
          }
        })
        const summary = data.summary ?? {}
        const baselineNet         = summary.baseline?.netCashflow  ?? 0
        const simulatedNet        = summary.simulated?.netCashflow ?? 0
        // Prefer summary closingBalance; fall back to last forecast point if missing
        const lastBaseline   = forecast.length > 0 ? forecast[forecast.length - 1].baseline  : 0
        const lastSimulated  = forecast.length > 0 ? forecast[forecast.length - 1].simulated : 0
        const baselineEndBalance  = summary.baseline?.closingBalance  ?? lastBaseline
        const simulatedEndBalance = summary.simulated?.closingBalance ?? lastSimulated
        setResult({ forecast, baselineNet, simulatedNet, baselineEndBalance, simulatedEndBalance })
      })
      .catch(() => setError('Kunde inte köra simulering. Kontrollera din anslutning och försök igen.'))
      .finally(() => setLoading(false))
  }

  const displayData = useMemo(
    () => result ? aggregateForecast(result.forecast, granularity) : [],
    [result, granularity]
  )

  const netDiff = result ? result.simulatedNet - result.baselineNet : 0
  const balanceDiff = result ? result.simulatedEndBalance - result.baselineEndBalance : 0
  const monthlyDiff = Math.round(netDiff / 3)

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10">

        <button onClick={() => navigate('/dashboard')} className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1.5 mb-6">
          ← Tillbaka
        </button>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">Vad händer om...?</h1>
        <p className="text-sm text-gray-500 mb-8">Bygg scenarion och se hur de påverkar din ekonomi de nästa 90 dagarna.</p>

        {/* Saved simulations */}
        {savedSims.length > 0 && (
          <div className="mb-6">
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

        {/* Scenario builder */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 mb-6">

          {/* Quick templates */}
          <div className="mb-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Snabb-scenarion</p>
            <div className="grid grid-cols-3 gap-3">
              {([
                { key: 'remove_worst',   icon: '✕', label: 'Ta bort sämsta produkten', color: 'border-red-200 hover:border-red-400 hover:bg-red-50' },
                { key: 'increase_prices', icon: '↑', label: 'Öka alla priser 10%',      color: 'border-green-200 hover:border-green-400 hover:bg-green-50' },
                { key: 'cut_costs',      icon: '↓', label: 'Minska kostnader 15%',     color: 'border-orange-200 hover:border-orange-400 hover:bg-orange-50' },
              ] as const).map(t => (
                <button key={t.key} onClick={() => applyTemplate(t.key)}
                  className={`flex flex-col items-center gap-1.5 px-3 py-3 bg-white border rounded-xl text-center transition-colors ${t.color}`}>
                  <span className="text-lg font-bold text-gray-600">{t.icon}</span>
                  <span className="text-xs font-medium text-gray-600 leading-tight">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-100 pt-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Anpassat scenario</h2>

            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Typ</label>
                <select value={addType} onChange={e => setAddType(e.target.value as ScenarioType)}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-500 bg-white">
                  {(Object.entries(SCENARIO_LABELS) as [ScenarioType, string][]).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>

              {NEEDS_CATEGORY.includes(addType) && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Kategori</label>
                  <select value={addCategory} onChange={e => setAddCategory(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-500 bg-white">
                    {categories.length === 0
                      ? <option value="">Laddar...</option>
                      : categories.map(cat => <option key={cat} value={cat}>{cat}</option>)
                    }
                  </select>
                </div>
              )}

              {NEEDS_PERCENT.includes(addType) && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Förändring (%)</label>
                  <input type="number" value={addPercent} onChange={e => setAddPercent(e.target.value)}
                    placeholder="t.ex. -20"
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-500 w-28" />
                </div>
              )}

              {NEEDS_AMOUNT_FREQ.includes(addType) && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Belopp (SEK)</label>
                    <input type="number" value={addAmount} onChange={e => setAddAmount(e.target.value)}
                      placeholder="t.ex. 10000"
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-500 w-32" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Frekvens</label>
                    <select value={addFrequency} onChange={e => setAddFrequency(e.target.value as Frequency)}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-500 bg-white">
                      <option value="daily">Dagligen</option>
                      <option value="weekly">Veckovis</option>
                      <option value="monthly">Månadsvis</option>
                    </select>
                  </div>
                </>
              )}

              {NEEDS_AMOUNT_DATE.includes(addType) && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Belopp (SEK)</label>
                    <input type="number" value={addAmount} onChange={e => setAddAmount(e.target.value)}
                      placeholder="t.ex. 5000"
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-500 w-32" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Datum</label>
                    <input type="date" value={addDate} onChange={e => setAddDate(e.target.value)}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-500" />
                  </div>
                </>
              )}

              <button onClick={handleAdd}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors">
                + Lägg till
              </button>
            </div>
          </div>

          {/* Scenario cards */}
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

              <div className="flex gap-2">
                <button onClick={handleSimulate} disabled={loading}
                  className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50">
                  {loading ? 'Simulerar...' : 'Kör simulering →'}
                </button>
                {!saveSimOpen ? (
                  <button onClick={() => setSaveSimOpen(true)} disabled={scenarios.length === 0}
                    className="px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:border-gray-300 transition-colors disabled:opacity-40">
                    Spara
                  </button>
                ) : (
                  <div className="flex gap-2 flex-1">
                    <input autoFocus value={saveSimName} onChange={e => setSaveSimName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveSim(); if (e.key === 'Escape') setSaveSimOpen(false) }}
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
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 rounded-xl px-5 py-4 text-sm mb-6">
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <>
            {/* Big monthly diff banner */}
            <div className={`rounded-2xl border shadow-sm p-6 mb-6 text-center ${netDiff >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">Effekt per månad</p>
              <p className={`text-5xl font-bold mb-2 ${netDiff >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {netDiff >= 0 ? '↑' : '↓'} {fmt(Math.abs(monthlyDiff))}
              </p>
              <p className="text-sm text-gray-600">
                Med detta scenario {netDiff >= 0 ? 'tjänar du' : 'förlorar du'}{' '}
                <strong>{fmt(Math.abs(monthlyDiff))}</strong>{' '}
                {netDiff >= 0 ? 'mer' : 'mindre'} per månad
              </p>
            </div>

            {/* Detail cards */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className={`bg-white rounded-2xl border shadow-sm px-5 py-4 border-l-4 ${netDiff >= 0 ? 'border-l-green-400 border-gray-100' : 'border-l-red-400 border-gray-100'}`}>
                <p className="text-xs text-gray-400 mb-2">Netto (90 dagar)</p>
                <p className={`text-xl font-bold ${netDiff >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {fmt(result.simulatedNet)}
                </p>
                <p className="text-xs text-gray-400 mt-1">vs {fmt(result.baselineNet)} baseline</p>
                <p className={`text-xs font-semibold mt-2 ${netDiff >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {netDiff >= 0 ? '+' : ''}{fmt(netDiff)} · {fmtPct(result.simulatedNet, result.baselineNet)}
                </p>
              </div>
              <div className={`bg-white rounded-2xl border shadow-sm px-5 py-4 border-l-4 ${balanceDiff >= 0 ? 'border-l-green-400 border-gray-100' : 'border-l-red-400 border-gray-100'}`}>
                <p className="text-xs text-gray-400 mb-2">Slutsaldo (dag 90)</p>
                <p className={`text-xl font-bold ${balanceDiff >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {fmt(result.simulatedEndBalance)}
                </p>
                <p className="text-xs text-gray-400 mt-1">vs {fmt(result.baselineEndBalance)} baseline</p>
                <p className={`text-xs font-semibold mt-2 ${balanceDiff >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {balanceDiff >= 0 ? '+' : ''}{fmt(balanceDiff)} · {fmtPct(result.simulatedEndBalance, result.baselineEndBalance)}
                </p>
              </div>
            </div>

            {/* Forecast chart */}
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6">
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
                <div className="h-[320px] flex items-center justify-center text-gray-400 text-sm">
                  Ingen prognosdata returnerades.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={displayData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={55} />
                    <Tooltip formatter={(v: unknown) => fmt(Number(v ?? 0))} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <ReferenceLine y={0} stroke="#e5e7eb" strokeWidth={1.5} strokeDasharray="4 3"
                      label={{ value: 'Break-even', position: 'insideTopRight', fontSize: 10, fill: '#9ca3af' }} />
                    <Line type="monotone" dataKey="baseline" name="Baseline" stroke="#9ca3af" strokeWidth={2} dot={false} strokeDasharray="5 3" />
                    <Line type="monotone" dataKey="simulated" name="Simulerat" stroke="#2563eb" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </>
        )}

        {!result && scenarios.length === 0 && (
          <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-10 text-center text-gray-400 text-sm">
            Välj ett snabb-scenario ovan eller bygg ett eget — klicka sedan "Kör simulering" för att se prognosen.
          </div>
        )}

      </div>
    </div>
  )
}