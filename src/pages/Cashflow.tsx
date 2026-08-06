import { useEffect, useState, useMemo } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts'
import { AlertTriangle, AlertCircle, TrendingUp, TrendingDown, Banknote, ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { fetchWithAuth } from '../utils/fetchWithAuth'

const API_URL = import.meta.env.VITE_API_URL as string

type Tab = 'now' | 'history' | 'forecast'
type RangePreset = '7' | '30' | '90' | 'custom'

interface CashflowPoint {
  date: string
  inflow: number
  outflow: number
}

interface ForecastPoint {
  date: string
  balance: number
}

interface RunwayData {
  currentBalance: number
  monthlyBurnRate: number
  runwayDays: number
  forecast: ForecastPoint[]
}

function fmt(n: number) {
  return n.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK', minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function toDateInput(d: Date) {
  return d.toISOString().slice(0, 10)
}

function fmtDate(dateStr: string) {
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}

function fmtDateFull(dateStr: string) {
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })
}

function normalizeSeries(raw: Record<string, unknown>[]): CashflowPoint[] {
  return raw.map(r => ({
    date:    String(r.date    ?? r.Date    ?? r.day     ?? ''),
    inflow:  Number(r.inflow  ?? r.in      ?? r.income  ?? 0),
    outflow: Number(r.outflow ?? r.out     ?? r.expense ?? 0),
  }))
}

const MOCK_SERIES: CashflowPoint[] = Array.from({ length: 60 }, (_, i) => {
  const d = new Date()
  d.setDate(d.getDate() - (59 - i))
  return {
    date: toDateInput(d),
    inflow: 8000 + Math.random() * 4000,
    outflow: 6000 + Math.random() * 3000,
  }
})

const MOCK_RUNWAY: RunwayData = {
  currentBalance: 255000,
  monthlyBurnRate: 120000,
  runwayDays: 47,
  forecast: Array.from({ length: 90 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    return { date: toDateInput(d), balance: Math.max(0, 255000 - i * 2700) }
  }),
}

const RANGE_PRESETS: { label: string; value: RangePreset }[] = [
  { label: '7 dagar',  value: '7' },
  { label: '30 dagar', value: '30' },
  { label: '90 dagar', value: '90' },
  { label: 'Anpassat', value: 'custom' },
]

export default function Cashflow() {
  const today = toDateInput(new Date())

  const [tab, setTab]                   = useState<Tab>('now')
  const [allSeries, setAllSeries]       = useState<CashflowPoint[]>([])
  const [runwayData, setRunwayData]     = useState<RunwayData | null>(null)
  const [loadingSeries, setLoadingSeries] = useState(true)
  const [loadingRunway, setLoadingRunway] = useState(true)
  const [preset, setPreset]             = useState<RangePreset>('30')
  const [customFrom, setCustomFrom]     = useState(toDateInput(new Date(Date.now() - 30 * 86400000)))
  const [customTo, setCustomTo]         = useState(today)

  useEffect(() => {
    const token = localStorage.getItem('accessToken')
    if (!token || token === 'undefined' || token === 'null') {
      window.location.href = '/login'
      return
    }

    fetchWithAuth(`${API_URL}api/v1/cashflow/current`)
      .then(r => r.json())
      .then(json => {
        const raw: Record<string, unknown>[] = Array.isArray(json?.data?.series) ? json.data.series : []
        const normalized = normalizeSeries(raw)
        setAllSeries(normalized.length > 0 ? normalized : MOCK_SERIES)
      })
      .catch(() => setAllSeries(MOCK_SERIES))
      .finally(() => setLoadingSeries(false))

    fetchWithAuth(`${API_URL}api/v1/cashflow/runway`)
      .then(r => r.json())
      .then(json => setRunwayData(json?.data ?? MOCK_RUNWAY))
      .catch(() => setRunwayData(MOCK_RUNWAY))
      .finally(() => setLoadingRunway(false))
  }, [])

  // Filtered series for Historik tab
  const filtered = useMemo(() => {
    if (allSeries.length === 0) return []
    if (preset === 'custom') {
      const from = new Date(customFrom).getTime()
      const to   = new Date(customTo).getTime() + 86400000
      return allSeries.filter(p => { const t = new Date(p.date).getTime(); return t >= from && t <= to })
    }
    const cutoff = Date.now() - Number(preset) * 86400000
    return allSeries.filter(p => new Date(p.date).getTime() >= cutoff)
  }, [allSeries, preset, customFrom, customTo])

  const historyChartData = filtered.map(p => ({ ...p, label: fmtDate(p.date) }))

  // Summary for selected period
  const periodSummary = useMemo(() => {
    const totalInflow  = filtered.reduce((s, p) => s + p.inflow,  0)
    const totalOutflow = filtered.reduce((s, p) => s + p.outflow, 0)
    return { totalInflow, totalOutflow, net: totalInflow - totalOutflow }
  }, [filtered])

  // Last-30-day stats for Nuläge
  const last30 = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400000
    return allSeries.filter(p => new Date(p.date).getTime() >= cutoff)
  }, [allSeries])

  const monthlyInflow  = last30.reduce((s, p) => s + p.inflow,  0)
  const monthlyOutflow = last30.reduce((s, p) => s + p.outflow, 0)
  const monthlyNet     = monthlyInflow - monthlyOutflow
  const burnRatio      = monthlyInflow > 0 ? (monthlyOutflow / monthlyInflow) * 100 : 0

  // Forecast + zero-crossing
  const forecastData = useMemo(() =>
    (runwayData?.forecast ?? []).map(p => ({ ...p, label: fmtDate(p.date) })),
  [runwayData])

  const zeroCrossing = useMemo(() => {
    const pts = runwayData?.forecast ?? []
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].balance <= 0) return pts[i].date
    }
    return null
  }, [runwayData])

  // Alerts
  const alerts = useMemo(() => {
    const list: { severity: 'high' | 'medium'; title: string; message: string; action: string }[] = []
    const rd = runwayData?.runwayDays
    if (rd != null && rd < 30) {
      list.push({
        severity: 'high',
        title: 'Kritiskt låg runway',
        message: `Saldot räcker bara ${rd} dagar till med nuvarande burn rate.`,
        action: 'Kontakta din bank för kreditlina och påskynda utestående fakturor omgående.',
      })
    } else if (rd != null && rd < 60) {
      list.push({
        severity: 'medium',
        title: 'Runway under 60 dagar',
        message: `${rd} dagar kvar med nuvarande kostnadstakt. Bevaka noggrant.`,
        action: 'Identifiera kostnader som kan skjutas fram och öka faktureringstakten.',
      })
    }
    if (!loadingSeries && monthlyNet < 0) {
      list.push({
        severity: 'high',
        title: 'Negativt kassaflöde',
        message: 'Utgifterna överstiger intäkterna de senaste 30 dagarna.',
        action: 'Granska fasta kostnader och prioritera intäktsgenerande aktiviteter.',
      })
    }
    return list
  }, [runwayData, monthlyNet, loadingSeries])

  const TABS: { key: Tab; label: string }[] = [
    { key: 'now',      label: 'Nuläge'  },
    { key: 'history',  label: 'Historik' },
    { key: 'forecast', label: 'Prognos'  },
  ]

  return (
    <div className="font-sans">
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-10 flex flex-col gap-6">

        {/* Header */}
        <div>
          <h1 className="text-3xl tracking-tight text-slate-900 mb-1">Kassaflöde</h1>
          <p className="text-sm text-gray-500">Likviditetsöversikt, historik och 90-dagars prognos.</p>
        </div>

        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="flex flex-col gap-2">
            {alerts.map((a, i) => (
              <div key={i} className={`flex items-start gap-3 px-4 py-3.5 rounded-xl border ${
                a.severity === 'high'
                  ? 'bg-red-50 border-red-200'
                  : 'bg-yellow-50 border-yellow-200'
              }`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                  a.severity === 'high' ? 'bg-red-100' : 'bg-yellow-100'
                }`}>
                  {a.severity === 'high'
                    ? <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                    : <AlertCircle className="w-3.5 h-3.5 text-yellow-600" />}
                </div>
                <div>
                  <p className={`text-sm font-semibold mb-0.5 ${a.severity === 'high' ? 'text-red-700' : 'text-yellow-700'}`}>
                    {a.title}
                  </p>
                  <p className={`text-xs mb-1 ${a.severity === 'high' ? 'text-red-600' : 'text-yellow-700'}`}>
                    {a.message}
                  </p>
                  <p className={`text-xs font-medium ${a.severity === 'high' ? 'text-red-700' : 'text-yellow-800'}`}>
                    → {a.action}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                tab === t.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ─── NULÄGE ─── */}
        {tab === 'now' && (
          <>
            {loadingRunway || loadingSeries ? (
              <div className="grid sm:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-gray-100 rounded-2xl animate-pulse" />)}
              </div>
            ) : (
              <>
                {/* 3 main KPI cards */}
                <div className="grid sm:grid-cols-3 gap-4">
                  {/* Current balance */}
                  <div className="glass rounded-2xl p-6 shadow-[0_4px_28px_rgba(37,99,235,0.12)]">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mb-4">
                      <Banknote className="w-5 h-5 text-blue-600" />
                    </div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Aktuellt saldo</p>
                    <p className="text-2xl font-bold text-gray-900">{fmt(runwayData?.currentBalance ?? 0)}</p>
                    <p className="text-xs text-gray-400 mt-2">{runwayData?.runwayDays ?? 0} dagar runway</p>
                  </div>

                  {/* Monthly inflow */}
                  <div className="glass rounded-2xl p-6 shadow-[0_4px_28px_rgba(22,163,74,0.12)]">
                    <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center mb-4">
                      <ArrowUpRight className="w-5 h-5 text-green-600" />
                    </div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Månadsintäkter</p>
                    <p className="text-2xl font-bold text-green-600">{fmt(monthlyInflow)}</p>
                    <p className="text-xs text-gray-400 mt-2">Senaste 30 dagarna</p>
                  </div>

                  {/* Monthly outflow */}
                  <div className="glass rounded-2xl p-6 shadow-[0_4px_28px_rgba(239,68,68,0.12)]">
                    <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center mb-4">
                      <ArrowDownRight className="w-5 h-5 text-red-500" />
                    </div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Månadsutgifter</p>
                    <p className="text-2xl font-bold text-red-500">{fmt(monthlyOutflow)}</p>
                    <p className="text-xs text-gray-400 mt-2">Burn rate {fmt(runwayData?.monthlyBurnRate ?? monthlyOutflow)}/mån</p>
                  </div>
                </div>

                {/* Net + ratio cards */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="glass rounded-2xl shadow-sm px-6 py-5 flex items-center gap-4">
                    {monthlyNet >= 0
                      ? <TrendingUp className="w-8 h-8 text-green-500 shrink-0" />
                      : <TrendingDown className="w-8 h-8 text-red-500 shrink-0" />}
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Nettokassaflöde (30 dagar)</p>
                      <p className={`text-xl font-bold ${monthlyNet >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {monthlyNet >= 0 ? '+' : ''}{fmt(monthlyNet)}
                      </p>
                    </div>
                  </div>

                  <div className="glass rounded-2xl shadow-sm px-6 py-5">
                    <p className="text-xs text-gray-400 mb-2">Kostnadskvot (utgifter / intäkter)</p>
                    <div className="flex items-end gap-3">
                      <p className={`text-xl font-bold ${burnRatio > 90 ? 'text-red-600' : burnRatio > 70 ? 'text-yellow-600' : 'text-green-600'}`}>
                        {burnRatio.toLocaleString('sv-SE', { maximumFractionDigits: 1 })}%
                      </p>
                      <span className={`text-xs font-medium mb-0.5 ${burnRatio > 90 ? 'text-red-500' : burnRatio > 70 ? 'text-yellow-600' : 'text-green-600'}`}>
                        {burnRatio > 90 ? 'Kritisk' : burnRatio > 70 ? 'Bevaka' : 'Bra'}
                      </span>
                    </div>
                    <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${burnRatio > 90 ? 'bg-red-500' : burnRatio > 70 ? 'bg-yellow-400' : 'bg-green-500'}`}
                        style={{ width: `${Math.min(burnRatio, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ─── HISTORIK ─── */}
        {tab === 'history' && (
          <>
            {/* Period filter */}
            <div className="flex flex-wrap items-center gap-2">
              {RANGE_PRESETS.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPreset(p.value)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    preset === p.value
                      ? 'bg-accent text-white border-accent'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {p.label}
                </button>
              ))}
              {preset === 'custom' && (
                <div className="flex items-center gap-2 ml-1">
                  <input type="date" value={customFrom} max={customTo}
                    onChange={e => setCustomFrom(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 outline-none focus:border-accent" />
                  <span className="text-gray-400 text-sm">—</span>
                  <input type="date" value={customTo} min={customFrom} max={today}
                    onChange={e => setCustomTo(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 outline-none focus:border-accent" />
                </div>
              )}
            </div>

            {/* Summary pills */}
            {!loadingSeries && (
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2 glass rounded-xl px-4 py-2.5 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-xs text-gray-500">Inflöde</span>
                  <span className="text-sm font-bold text-blue-600">{fmt(periodSummary.totalInflow)}</span>
                </div>
                <div className="flex items-center gap-2 glass rounded-xl px-4 py-2.5 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-xs text-gray-500">Utflöde</span>
                  <span className="text-sm font-bold text-red-500">{fmt(periodSummary.totalOutflow)}</span>
                </div>
                <div className={`flex items-center gap-2 bg-white border rounded-xl px-4 py-2.5 shadow-sm ${
                  periodSummary.net >= 0 ? 'border-green-100' : 'border-red-100'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${periodSummary.net >= 0 ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="text-xs text-gray-500">Netto</span>
                  <span className={`text-sm font-bold ${periodSummary.net >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {periodSummary.net >= 0 ? '+' : ''}{fmt(periodSummary.net)}
                  </span>
                </div>
              </div>
            )}

            {/* Area chart */}
            <div className="glass rounded-2xl shadow-sm p-6">
              {loadingSeries ? (
                <div className="h-72 bg-gray-100 rounded-xl animate-pulse" />
              ) : historyChartData.length === 0 ? (
                <div className="h-72 flex items-center justify-center text-gray-400 text-sm">
                  Ingen data tillgänglig för vald period.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={288}>
                  <AreaChart data={historyChartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="inflowGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="outflowGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.13} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={42} />
                    <ReferenceLine y={0} stroke="#e5e7eb" strokeWidth={1.5} strokeDasharray="4 3" />
                    <Tooltip content={<CashflowTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                    <Area type="monotone" dataKey="inflow"  name="Inflöde"  stroke="#2563eb" strokeWidth={2} fill="url(#inflowGrad)"  dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                    <Area type="monotone" dataKey="outflow" name="Utflöde"  stroke="#ef4444" strokeWidth={2} fill="url(#outflowGrad)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </>
        )}

        {/* ─── PROGNOS ─── */}
        {tab === 'forecast' && (
          <>
            {/* Forecast KPIs */}
            {loadingRunway ? (
              <div className="grid sm:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}
              </div>
            ) : runwayData && (
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="glass rounded-2xl shadow-sm px-5 py-4">
                  <p className="text-xs text-gray-400 mb-1">Runway</p>
                  <p className={`text-xl font-bold ${runwayData.runwayDays < 30 ? 'text-red-600' : runwayData.runwayDays < 60 ? 'text-yellow-600' : 'text-green-600'}`}>
                    {runwayData.runwayDays} dagar
                  </p>
                  <p className="text-xs text-gray-400 mt-1">{runwayData.runwayDays < 30 ? 'Kritiskt lågt' : runwayData.runwayDays < 60 ? 'Bevaka noggrant' : 'Bra likviditet'}</p>
                </div>
                <div className="glass rounded-2xl shadow-sm px-5 py-4">
                  <p className="text-xs text-gray-400 mb-1">Burn rate</p>
                  <p className="text-xl font-bold text-red-500">{fmt(runwayData.monthlyBurnRate)}<span className="text-sm font-normal text-gray-400">/mån</span></p>
                  <p className="text-xs text-gray-400 mt-1">Aktuell kostnadstakt</p>
                </div>
                <div className={`border rounded-2xl shadow-sm px-5 py-4 ${zeroCrossing ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                  <p className="text-xs text-gray-400 mb-1">Saldo når noll</p>
                  {zeroCrossing ? (
                    <>
                      <p className="text-xl font-bold text-red-600">{fmtDateFull(zeroCrossing)}</p>
                      <p className="text-xs text-red-500 mt-1">Åtgärd krävs inom 90 dagar</p>
                    </>
                  ) : (
                    <>
                      <p className="text-xl font-bold text-green-600">Ej inom 90 dagar</p>
                      <p className="text-xs text-green-600 mt-1">Prognosen ser stabil ut</p>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Zero-crossing alert */}
            {zeroCrossing && (
              <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl border bg-red-50 border-red-200">
                <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-red-700 mb-0.5">Saldot beräknas nå noll {fmtDateFull(zeroCrossing)}</p>
                  <p className="text-xs text-red-600 mb-1">Med nuvarande burn rate kommer likvida medel ta slut inom prognoshorisonten.</p>
                  <p className="text-xs font-medium text-red-700">→ Kontakta bank för kreditlina, påskynda fakturering och se över möjligheter att sänka fasta kostnader.</p>
                </div>
              </div>
            )}

            {/* Forecast line chart */}
            <div className="glass rounded-2xl shadow-sm p-6">
              <h3 className="text-sm font-bold text-gray-700 mb-5">90-dagars saldoprognos</h3>
              {loadingRunway ? (
                <div className="h-72 bg-gray-100 rounded-xl animate-pulse" />
              ) : forecastData.length === 0 ? (
                <div className="h-72 flex items-center justify-center text-gray-400 text-sm">
                  Ingen prognosdata tillgänglig.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={288}>
                  <LineChart data={forecastData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={42} />
                    <ReferenceLine y={0} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 3" label={{ value: 'Nollpunkt', fill: '#ef4444', fontSize: 11, position: 'insideTopLeft' }} />
                    {zeroCrossing && (
                      <ReferenceLine
                        x={fmtDate(zeroCrossing)}
                        stroke="#ef4444"
                        strokeDasharray="4 3"
                        label={{ value: 'Saldo = 0', fill: '#ef4444', fontSize: 11, position: 'top' }}
                      />
                    )}
                    <Tooltip
                      content={({ active, payload, label }) =>
                        active && payload?.length ? (
                          <div className="glass rounded-xl shadow px-3 py-2 text-xs">
                            <p className="text-gray-500 mb-0.5">{label}</p>
                            <p className="font-bold text-gray-900">{fmt(Number(payload[0].value ?? 0))}</p>
                          </div>
                        ) : null
                      }
                    />
                    <Line type="monotone" dataKey="balance" name="Saldo" stroke="#2563eb" strokeWidth={2.5} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </>
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
    <div className="glass rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2 mb-1 last:mb-0">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
          <span className="text-gray-500 w-14">{p.name}:</span>
          <span className="font-semibold" style={{ color: p.color }}>
            {p.value.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
        </div>
      ))}
    </div>
  )
}