import { useEffect, useState } from 'react'
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
} from 'recharts'

const API_URL = import.meta.env.VITE_API_URL as string

type ScenarioType = 'remove_category' | 'change_amount' | 'add_revenue'
type Frequency = 'daily' | 'weekly' | 'monthly'

interface Scenario {
  id: string
  type: ScenarioType
  category?: string
  changePercent?: number
  amount?: number
  frequency?: Frequency
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
  return amount.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 })
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}

const SCENARIO_LABELS: Record<ScenarioType, string> = {
  remove_category: 'Ta bort kategori',
  change_amount: 'Ändra belopp',
  add_revenue: 'Lägg till intäkt',
}

const FREQ_LABELS: Record<Frequency, string> = {
  daily: 'dagligen',
  weekly: 'veckovis',
  monthly: 'månadsvis',
}

function scenarioChip(s: Scenario): string {
  if (s.type === 'remove_category') return `Ta bort: ${s.category}`
  if (s.type === 'change_amount') {
    const sign = (s.changePercent ?? 0) >= 0 ? '+' : ''
    return `${s.category}: ${sign}${s.changePercent}%`
  }
  return `+${fmt(s.amount ?? 0)} ${FREQ_LABELS[s.frequency ?? 'monthly']}`
}

export default function Simulate() {
  const navigate = useNavigate()

  const [categories, setCategories] = useState<string[]>([])
  const [scenarios, setScenarios] = useState<Scenario[]>([])

  // Add-scenario form state
  const [addType, setAddType] = useState<ScenarioType>('remove_category')
  const [addCategory, setAddCategory] = useState('')
  const [addPercent, setAddPercent] = useState('0')
  const [addAmount, setAddAmount] = useState('')
  const [addFrequency, setAddFrequency] = useState<Frequency>('monthly')

  // Simulation
  const [result, setResult] = useState<SimulateResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchWithAuth(`${API_URL}api/v1/analytics/categories`)
      .then(r => r.json())
      .then(json => {
        const cats = Array.isArray(json?.data?.categories) ? json.data.categories : []
        setCategories(cats)
        if (cats.length > 0) setAddCategory(cats[0])
      })
      .catch(() => {})
  }, [])

  const handleAdd = () => {
    const scenario: Scenario = { id: Date.now().toString(), type: addType }
    if (addType === 'remove_category' || addType === 'change_amount') {
      if (!addCategory) return
      scenario.category = addCategory
      if (addType === 'change_amount') scenario.changePercent = Number(addPercent)
    } else {
      const amt = Number(addAmount)
      if (!amt) return
      scenario.amount = amt
      scenario.frequency = addFrequency
    }
    setScenarios(prev => [...prev, scenario])
    setResult(null)
  }

  const handleRemove = (id: string) => {
    setScenarios(prev => prev.filter(s => s.id !== id))
    setResult(null)
  }

  const handleSimulate = () => {
    if (scenarios.length === 0) return
    setLoading(true)
    setError('')

    // Strip internal id before sending to API
    const payload = scenarios.map(({ id: _id, ...rest }) => rest)

    fetchWithAuth(`${API_URL}api/v1/analytics/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarios: payload, days: 90 }),
    })
      .then(r => r.json())
      .then(json => {
        console.log('simulate response:', JSON.stringify(json))
        console.log('summary:', JSON.stringify(json?.data?.summary))
        const data = json?.data ?? {}
        const baseline: { date: string; balance?: number; value?: number }[] = Array.isArray(data.baseline) ? data.baseline : []
        const simulated: { date: string; balance?: number; value?: number }[] = Array.isArray(data.simulated) ? data.simulated : []
        const forecast: ForecastPoint[] = baseline.map((b, i) => ({
          date: b.date,
          label: formatDate(b.date),
          baseline: b.balance ?? b.value ?? 0,
          simulated: simulated[i] ? (simulated[i].balance ?? simulated[i].value ?? 0) : 0,
        }))
        const summary = data.summary ?? {}
        setResult({
          forecast,
          baselineNet: summary.baseline?.netCashflow ?? 0,
          simulatedNet: summary.simulated?.netCashflow ?? 0,
          baselineEndBalance: summary.baseline?.closingBalance ?? 0,
          simulatedEndBalance: summary.simulated?.closingBalance ?? 0,
        })
      })
      .catch(() => setError('Kunde inte köra simulering. Kontrollera din anslutning och försök igen.'))
      .finally(() => setLoading(false))
  }

  const netDiff = result ? result.simulatedNet - result.baselineNet : 0
  const balanceDiff = result ? result.simulatedEndBalance - result.baselineEndBalance : 0

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10">

        <button onClick={() => navigate('/dashboard')} className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1.5 mb-6">
          ← Tillbaka
        </button>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">Vad händer om...?</h1>
        <p className="text-sm text-gray-500 mb-8">Bygg scenarion och se hur de påverkar din ekonomi de nästa 90 dagarna.</p>

        {/* Scenario builder */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Lägg till scenario</h2>

          <div className="flex flex-wrap gap-3 items-end">
            {/* Type */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Typ</label>
              <select value={addType} onChange={e => setAddType(e.target.value as ScenarioType)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-500 bg-white">
                {(Object.entries(SCENARIO_LABELS) as [ScenarioType, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>

            {/* Category (remove_category + change_amount) */}
            {(addType === 'remove_category' || addType === 'change_amount') && (
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

            {/* Percent (change_amount) */}
            {addType === 'change_amount' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Förändring (%)</label>
                <input
                  type="number"
                  value={addPercent}
                  onChange={e => setAddPercent(e.target.value)}
                  placeholder="t.ex. -20"
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-500 w-28"
                />
              </div>
            )}

            {/* Amount + frequency (add_revenue) */}
            {addType === 'add_revenue' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Belopp (SEK)</label>
                  <input
                    type="number"
                    value={addAmount}
                    onChange={e => setAddAmount(e.target.value)}
                    placeholder="t.ex. 10000"
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-500 w-32"
                  />
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

            <button onClick={handleAdd}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors">
              + Lägg till
            </button>
          </div>

          {/* Scenario list */}
          {scenarios.length > 0 && (
            <div className="mt-5 pt-4 border-t border-gray-100 flex flex-col gap-2">
              {scenarios.map(s => (
                <div key={s.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5">
                  <div>
                    <span className="text-xs text-gray-400 mr-2">{SCENARIO_LABELS[s.type]}</span>
                    <span className="text-sm font-medium text-gray-700">{scenarioChip(s)}</span>
                  </div>
                  <button onClick={() => handleRemove(s.id)}
                    className="text-gray-300 hover:text-red-400 text-xl leading-none ml-4">×</button>
                </div>
              ))}

              <button onClick={handleSimulate} disabled={loading}
                className="mt-3 w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50">
                {loading ? 'Simulerar...' : 'Kör simulering'}
              </button>
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
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
                <p className="text-xs text-gray-400 mb-2">Netto (90 dagar)</p>
                <div className="flex items-end gap-4">
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Baseline</p>
                    <p className="text-base font-bold text-gray-700">{fmt(result.baselineNet)}</p>
                  </div>
                  <span className="text-gray-300 mb-1 text-lg">→</span>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Simulerat</p>
                    <p className={`text-base font-bold ${result.simulatedNet >= result.baselineNet ? 'text-green-600' : 'text-red-500'}`}>
                      {fmt(result.simulatedNet)}
                    </p>
                  </div>
                </div>
                <p className={`text-xs mt-2 font-semibold ${netDiff >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {netDiff >= 0 ? '+' : ''}{fmt(netDiff)} skillnad
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
                <p className="text-xs text-gray-400 mb-2">Slutsaldo (dag 90)</p>
                <div className="flex items-end gap-4">
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Baseline</p>
                    <p className="text-base font-bold text-gray-700">{fmt(result.baselineEndBalance)}</p>
                  </div>
                  <span className="text-gray-300 mb-1 text-lg">→</span>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Simulerat</p>
                    <p className={`text-base font-bold ${result.simulatedEndBalance >= result.baselineEndBalance ? 'text-green-600' : 'text-red-500'}`}>
                      {fmt(result.simulatedEndBalance)}
                    </p>
                  </div>
                </div>
                <p className={`text-xs mt-2 font-semibold ${balanceDiff >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {balanceDiff >= 0 ? '+' : ''}{fmt(balanceDiff)} skillnad
                </p>
              </div>
            </div>

            {/* Forecast chart */}
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6">
              <p className="text-sm font-semibold text-gray-700 mb-4">Prognos — nästa 90 dagar</p>
              {result.forecast.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center text-gray-400 text-sm">
                  Ingen prognosdata returnerades.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={result.forecast} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={55} />
                    <Tooltip formatter={(v: unknown) => fmt(Number(v ?? 0))} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="baseline" name="Baseline" stroke="#9ca3af" strokeWidth={2} dot={false} strokeDasharray="5 3" />
                    <Line type="monotone" dataKey="simulated" name="Simulerat" stroke="#2563eb" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </>
        )}

        {!result && scenarios.length === 0 && (
          <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-10 text-center text-gray-400 text-sm">
            Lägg till ett eller flera scenarion ovan och klicka "Kör simulering" för att se prognosen.
          </div>
        )}

      </div>
    </div>
  )
}