import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Banknote, AlertCircle, BarChart2, Clock, TrendingUp, FileDown, Sheet } from 'lucide-react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from 'recharts'
import { SkeletonKpiCards, SkeletonChart, SkeletonList } from './components/Skeleton'
import Tour from './components/Tour'
import { fetchWithAuth } from './utils/fetchWithAuth'
import { isTourCompleted, markTourCompleted } from './utils/tourStorage'
import { useCurrency } from './contexts/CurrencyContext'

const API_URL = import.meta.env.VITE_API_URL as string

const MOCK_OVERVIEW: OverviewData = {
  data: {
    summary: { totalInflow: 255000, totalOutflow: 198000, netCashflow: 65000, currency: 'SEK' },
    lateInvoiceCount: 3,
    runwayDays: 47,
    cashflow: [
      { month: 'Okt', in: 210000, out: 175000 },
      { month: 'Nov', in: 195000, out: 188000 },
      { month: 'Dec', in: 240000, out: 160000 },
      { month: 'Jan', in: 178000, out: 202000 },
      { month: 'Feb', in: 220000, out: 191000 },
      { month: 'Mar', in: 255000, out: 198000 },
    ],
    recentTransactions: [
      { date: '2026-03-22', description: 'Inbetalning: Bergström & Co', amount: 48500 },
      { date: '2026-03-20', description: 'Hyra mars', amount: -24000 },
      { date: '2026-03-18', description: 'Inbetalning: Lindqvist AB', amount: 31200 },
      { date: '2026-03-15', description: 'Löner', amount: -87000 },
      { date: '2026-03-12', description: 'Inbetalning: Nordin Group', amount: 19800 },
    ],
  },
}

const MOCK_RECOMMENDATIONS: Recommendation[] = [
  { priority: 'high', title: 'Påminn om förfallna fakturor', description: '3 fakturor är >30 dagar förfallna. Skicka betalningspåminnelse omgående.', estimatedValue: 76300 },
  { priority: 'medium', title: 'Förhandla betalningsvillkor', description: 'Minska standard betalningstid från 30 till 14 dagar för nya kunder.', estimatedValue: 32000 },
  { priority: 'low', title: 'Se över fasta kostnader', description: 'Leasingkostnad kan minskas med ~15% vid omförhandling i april.', estimatedValue: 8400 },
]

interface CashflowMonth {
  month: string
  in: number
  out: number
}

interface CashflowDay {
  date: string
  inflow: number
  outflow: number
}

interface Transaction {
  date: string
  description?: string
  amount: number
  type?: string
  category?: string
}

interface Recommendation {
  id?: string
  title: string
  description: string
  how?: string
  estimatedValue: number
  priority: 'high' | 'medium' | 'low'
  targets?: { type: string; id: string; label: string; value: number }[]
}

interface Alert {
  id?: string
  severity: 'high' | 'medium' | 'low'
  message: string
  link?: string
  linkLabel?: string
}

interface TopProduct {
  name?: string
  category?: string
  totalInflow: number
  transactionCount: number
}

interface TopCustomer {
  name?: string
  customerName?: string
  totalInflow: number
  transactionCount: number
}

interface CostTrend {
  direction: 'up' | 'down' | 'stable'
  changePercent?: number | null
  currentPeriod?: number | null
  previousPeriod?: number | null
}

interface OverviewData {
  data?: {
    summary?: { totalInflow: number; totalOutflow: number; netCashflow: number; currency: string; grossMarginPercent?: number | null; costTrend?: CostTrend | null }
    lateInvoiceCount?: number
    runwayDays?: number | null
    latestSnapshot?: unknown
    alerts?: Alert[]
    cashflow?: CashflowMonth[]
    recentTransactions?: Transaction[]
    topProducts?: TopProduct[]
    topCustomers?: TopCustomer[]
  }
}

interface InsightItem {
  title: string
  severity: 'critical' | 'warning' | 'info'
  impact?: number | null
  category?: string
  description?: string
}
interface BriefingData {
  summary?: string | null
  insights?: InsightItem[]
}

function translateAlert(msg: string): string {
  // "3 invoices are overdue based on your 30-day payment terms"
  const m1 = msg.match(/(\d+)\s+invoices?\s+(?:is|are)\s+overdue\s+based\s+on\s+your\s+(\d+)-day\s+payment\s+terms?/i)
  if (m1) return `${m1[1]} fakturor är förfallna baserat på dina ${m1[2]} dagars betalningsvillkor.`

  // "X overdue invoices"
  const m2 = msg.match(/(\d+)\s+overdue\s+invoices?/i)
  if (m2) return `${m2[1]} förfallna fakturor kräver uppföljning.`

  // "Cash runway is below X days"
  const m3 = msg.match(/cash\s+runway\s+is\s+below\s+(\d+)\s+days?/i)
  if (m3) return `Kassaflödet räcker i mindre än ${m3[1]} dagar. Åtgärda snarast.`

  // Generic English patterns
  if (/negative\s+cashflow/i.test(msg)) return 'Negativt kassaflöde: utgifterna överstiger inkomsterna.'
  if (/low\s+cash\s+balance/i.test(msg)) return 'Lågt kassasaldo: bevaka likviditeten.'
  if (/overdue/i.test(msg)) return 'Du har förfallna fakturor som kräver uppföljning.'
  if (/runway/i.test(msg)) return 'Låg likviditet: kontrollera ditt kassaflöde.'

  return msg
}

function formatLabel(dateStr: string): string {
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}

const ALERT_CONFIG: Record<'high' | 'medium' | 'low', { bg: string; border: string; text: string; icon: string; iconBg: string }> = {
  high:   { bg: 'bg-negative-50',    border: 'border-negative-200',    text: 'text-negative-700',    icon: '⚠',  iconBg: 'bg-negative-100' },
  medium: { bg: 'bg-caution-50', border: 'border-caution-200', text: 'text-caution-700', icon: '!',  iconBg: 'bg-caution-100' },
  low:    { bg: 'bg-brand-50',   border: 'border-brand-200',   text: 'text-brand-700',   icon: 'i',  iconBg: 'bg-brand-100' },
}

const PRIORITY_CONFIG = {
  high:   { label: 'Hög prioritet', badge: 'bg-negative-100 text-negative-700 border-negative-200',    bar: 'bg-negative-500',    urgencyPct: 100, symbol: '!' },
  medium: { label: 'Medium',        badge: 'bg-caution-100 text-caution-700 border-caution-200', bar: 'bg-caution-400', urgencyPct: 60,  symbol: '~' },
  low:    { label: 'Låg',           badge: 'bg-positive-100 text-positive-700 border-positive-200', bar: 'bg-positive-400',  urgencyPct: 25,  symbol: '✓' },
}

export default function Dashboard({ onLogout: _onLogout }: { onLogout?: () => void }) {
  const navigate = useNavigate()
  const { formatAmount: fmt } = useCurrency()
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [loadingOverview, setLoadingOverview] = useState(true)
  const [loadingRec, setLoadingRec] = useState(true)
  const [cashflowDays, setCashflowDays] = useState<CashflowDay[]>([])
  const [loadingCashflow, setLoadingCashflow] = useState(true)
  const [cashflowError, setCashflowError] = useState('')
  const [cashflowView, setCashflowView] = useState<'day' | 'week' | 'month'>('week')
  const [runwayDays, setRunwayDays] = useState<number | null>(null)
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set())
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [exportingExcel, setExportingExcel] = useState(false)
  const [exportError, setExportError] = useState('')
  const [showTour, setShowTour] = useState(false)

  // AI briefing (parallel fetch, never blocks)
  const [briefing, setBriefing]               = useState<BriefingData | null>(null)
  const [briefingLoading, setBriefingLoading] = useState(true)

  // AI Explain modal
  const [explainOpen, setExplainOpen] = useState(false)
  const [explainLoading, setExplainLoading] = useState(false)
  const [explainMessage, setExplainMessage] = useState('')
  const [explainError, setExplainError] = useState('')

  // Quick-add transaction
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickAddSaving, setQuickAddSaving] = useState(false)
  const [quickAddToast, setQuickAddToast] = useState('')
  const [quickForm, setQuickForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    amount: '',
    description: '',
    category: '',
    type: 'income' as 'income' | 'expense',
  })

  const fetchOverview = () =>
    fetchWithAuth(`${API_URL}api/v1/dashboard/overview`)
      .then((r) => r.json())
      .then((json) => setOverview(json))
      .catch(() => setOverview(MOCK_OVERVIEW))
      .finally(() => setLoadingOverview(false))

  const fetchCashflow = () =>
    fetchWithAuth(`${API_URL}api/v1/cashflow/current`)
      .then((r) => r.json())
      .then((json) => {
        const raw: Record<string, unknown>[] = Array.isArray(json.data?.series) ? json.data.series : []
        const rows: CashflowDay[] = raw.map(r => ({
          date:    String(r.date    ?? r.Date    ?? r.day  ?? ''),
          inflow:  Number(r.inflow  ?? r.in      ?? r.income  ?? 0),
          outflow: Number(r.outflow ?? r.out     ?? r.expense ?? 0),
        }))
        setCashflowDays(rows)
      })
      .catch(() => setCashflowError('Kunde inte hämta kassaflödesdata.'))
      .finally(() => setLoadingCashflow(false))

  const fetchRunway = () =>
    fetchWithAuth(`${API_URL}api/v1/cashflow/runway`)
      .then(r => r.json())
      .then(json => {
        const rd = json?.data?.runwayDays ?? null
        if (rd !== null) setRunwayDays(Number(rd))
      })
      .catch(() => {})

  const fetchRecommendations = () =>
    fetchWithAuth(`${API_URL}api/v1/recommendations/top3`)
      .then((r) => r.json())
      .then((json) => {
        const rawRec = json.data?.actions ?? json.data ?? json ?? []
        const actions = Array.isArray(rawRec) ? rawRec : []
        setRecommendations(actions.map((a: Record<string, unknown>) => ({
          id: a.id != null ? String(a.id) : undefined,
          title: String(a.title ?? ''),
          description: String(a.description ?? ''),
          how: a.how != null ? String(a.how) : undefined,
          estimatedValue: Array.isArray(a.targets) ? (a.targets as { value: number }[]).reduce((sum, t) => sum + (t.value ?? 0), 0) : 0,
          priority: (['high', 'medium', 'low'].includes(a.impact as string) ? a.impact : 'medium') as 'high' | 'medium' | 'low',
          targets: Array.isArray(a.targets) ? (a.targets as Recommendation['targets']) : undefined,
        })))
      })
      .catch(() => setRecommendations(MOCK_RECOMMENDATIONS))
      .finally(() => setLoadingRec(false))

  const refreshAllData = () => Promise.all([fetchOverview(), fetchCashflow(), fetchRunway(), fetchRecommendations()])

  useEffect(() => {
    const token = localStorage.getItem('accessToken')
    if (!token || token === 'undefined' || token === 'null') {
      window.location.href = '/login'
      return
    }
    if (!isTourCompleted()) setShowTour(true)
    let cancelled = false
    const guard = <T,>(fn: (v: T) => void) => (v?: T) => { if (!cancelled) fn(v as T) }

    fetchWithAuth(`${API_URL}api/v1/dashboard/overview`)
      .then(r => r.json())
      .then(guard(json => setOverview(json)))
      .catch(guard(() => setOverview(MOCK_OVERVIEW)))
      .finally(guard(() => setLoadingOverview(false)))

    fetchWithAuth(`${API_URL}api/v1/cashflow/current`)
      .then(r => r.json())
      .then(guard((json) => {
        const raw: Record<string, unknown>[] = Array.isArray(json.data?.series) ? json.data.series : []
        setCashflowDays(raw.map(r => ({
          date:    String(r.date    ?? r.Date    ?? r.day  ?? ''),
          inflow:  Number(r.inflow  ?? r.in      ?? r.income  ?? 0),
          outflow: Number(r.outflow ?? r.out     ?? r.expense ?? 0),
        })))
      }))
      .catch(guard(() => setCashflowError('Kunde inte hämta kassaflödesdata.')))
      .finally(guard(() => setLoadingCashflow(false)))

    fetchWithAuth(`${API_URL}api/v1/cashflow/runway`)
      .then(r => r.json())
      .then(guard(json => {
        const rd = json?.data?.runwayDays ?? null
        if (rd !== null) setRunwayDays(Number(rd))
      }))
      .catch(() => {})

    fetchWithAuth(`${API_URL}api/v1/recommendations/top3`)
      .then(r => r.json())
      .then(guard(json => {
        const rawRec = json.data?.actions ?? json.data ?? json ?? []
        const actions = Array.isArray(rawRec) ? rawRec : []
        setRecommendations(actions.map((a: Record<string, unknown>) => ({
          id: a.id != null ? String(a.id) : undefined,
          title: String(a.title ?? ''),
          description: String(a.description ?? ''),
          how: a.how != null ? String(a.how) : undefined,
          estimatedValue: Array.isArray(a.targets) ? (a.targets as { value: number }[]).reduce((sum, t) => sum + (t.value ?? 0), 0) : 0,
          priority: (['high', 'medium', 'low'].includes(a.impact as string) ? a.impact : 'medium') as 'high' | 'medium' | 'low',
          targets: Array.isArray(a.targets) ? (a.targets as Recommendation['targets']) : undefined,
        })))
      }))
      .catch(guard(() => setRecommendations(MOCK_RECOMMENDATIONS)))
      .finally(guard(() => setLoadingRec(false)))

    // AI briefing — parallel, never blocks dashboard
    fetchWithAuth(`${API_URL}api/v1/insights`)
      .then(r => r.json())
      .then(guard(json => {
        const d = json.data ?? json
        setBriefing({
          summary:  typeof d.summary === 'string' ? d.summary : null,
          insights: Array.isArray(d.insights) ? (d.insights as InsightItem[]) : [],
        })
      }))
      .catch(guard(() => setBriefing(null))) // graceful degradation
      .finally(guard(() => setBriefingLoading(false)))

    return () => { cancelled = true }
  }, [])

  const cashflowData: CashflowMonth[] = overview?.data?.cashflow ?? []

  const kpi = useMemo(() => ({
    liquidAssets: overview?.data?.summary?.totalInflow ?? 0,
    overdueInvoices: overview?.data?.lateInvoiceCount ?? 0,
    breakEven: overview?.data?.summary?.totalOutflow ?? 0,
    runwayDays: runwayDays ?? overview?.data?.runwayDays ?? null,
    grossMargin: overview?.data?.summary?.grossMarginPercent ?? null,
    costTrend: overview?.data?.summary?.costTrend ?? null,
  }), [overview, runwayDays])

  const transactions: Transaction[] = overview?.data?.recentTransactions ?? []

  const topProducts = useMemo(() => {
    const raw = overview?.data?.topProducts ?? []
    return raw.slice(0, 5).map(p => ({ ...p, label: p.name ?? p.category ?? 'Okänd' }))
  }, [overview])

  const topCustomers = useMemo(() => {
    const raw = overview?.data?.topCustomers ?? []
    return raw.slice(0, 5).map(c => ({ ...c, label: c.name ?? c.customerName ?? 'Okänd' }))
  }, [overview])

  const recentCashflowRows = useMemo(() => {
    const fmtDate = (d: string) => {
      const date = new Date(d)
      return isNaN(date.getTime()) ? d : date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
    }
    return cashflowDays
      .filter(d => d.inflow > 0 || d.outflow > 0)
      .slice(-10)
      .reverse()
      .flatMap(d => {
        const rows: { label: string; type: string; amount: number }[] = []
        if (d.inflow > 0) rows.push({ label: fmtDate(d.date), type: 'Inflöde', amount: d.inflow })
        if (d.outflow > 0) rows.push({ label: fmtDate(d.date), type: 'Utflöde', amount: -d.outflow })
        return rows
      })
  }, [cashflowDays])

  const recentTransactionRows = useMemo(() => {
    const fmtDate = (d: string) => {
      const date = new Date(d)
      return isNaN(date.getTime()) ? d : date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
    }
    return transactions.slice(0, 10).map(t => {
      const desc = t.description ?? null
      return {
        label:       fmtDate(t.date),
        typeLabel:   t.type === 'INCOME' ? 'Inflöde' : t.type === 'EXPENSE' ? 'Utflöde' : t.amount >= 0 ? 'Inflöde' : 'Utflöde',
        amount:      t.amount,
        description: desc && desc.length > 30 ? desc.slice(0, 30) + '…' : desc,
        category:    t.category ?? null,
      }
    })
  }, [transactions])

  const periodLabel = useMemo(() => {
    if (cashflowDays.length < 2) return ''
    const toLabel = (d: Date) => d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
    return `${toLabel(new Date(cashflowDays[0].date))} till ${toLabel(new Date(cashflowDays[cashflowDays.length - 1].date))}`
  }, [cashflowDays])

  const aggregatedCashflow = useMemo(() => {
    if (cashflowView === 'day') {
      return cashflowDays.map(d => ({ label: formatLabel(d.date), inflow: d.inflow, outflow: d.outflow }))
    }
    const buckets = new Map<string, { label: string; inflow: number; outflow: number }>()
    for (const d of cashflowDays) {
      const date = new Date(d.date)
      if (isNaN(date.getTime())) continue
      let key: string
      let label: string
      if (cashflowView === 'week') {
        const day = date.getDay()
        const diff = day === 0 ? -6 : 1 - day
        const monday = new Date(date)
        monday.setDate(date.getDate() + diff)
        key = monday.toISOString().split('T')[0]
        const sunday = new Date(monday)
        sunday.setDate(monday.getDate() + 6)
        const f = (dt: Date) => dt.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
        label = `${f(monday)} till ${f(sunday)}`
      } else {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        label = date.toLocaleDateString('sv-SE', { month: 'short', year: '2-digit' })
      }
      if (!buckets.has(key)) buckets.set(key, { label, inflow: 0, outflow: 0 })
      const b = buckets.get(key)!
      b.inflow += d.inflow
      b.outflow += d.outflow
    }
    return Array.from(buckets.values())
  }, [cashflowDays, cashflowView])

  const alerts = useMemo(() => {
    const raw: Alert[] = overview?.data?.alerts ?? []
    const active = raw.filter(a => !dismissedAlerts.has(a.id ?? a.message))

    const isInvoiceAlert = (a: Alert) => /overdue|förfallna\s+fakturor/i.test(a.message)
    const invoiceAlerts = active.filter(isInvoiceAlert)
    const rest = active.filter(a => !isInvoiceAlert(a))

    if (invoiceAlerts.length === 0) return rest

    if (dismissedAlerts.has('overdue-invoices-merged')) return rest

    const count = overview?.data?.lateInvoiceCount ?? 0
    const merged: Alert = {
      id: 'overdue-invoices-merged',
      severity: 'high',
      message: count > 0
        ? `${count} fakturor är förfallna och kräver uppföljning.`
        : 'Du har förfallna fakturor som kräver uppföljning.',
      link: '/actions',
      linkLabel: 'Åtgärda →',
    }
    return [merged, ...rest]
  }, [overview, dismissedAlerts])

  const quickStats = useMemo(() => {
    const active = cashflowDays.filter(d => d.inflow > 0 || d.outflow > 0)
    const totalTx = active.length
    const avgInflow = active.length > 0 ? active.reduce((s, d) => s + d.inflow, 0) / active.length : 0
    const bestDay = active.reduce<CashflowDay | null>((best, d) => (!best || d.inflow > best.inflow ? d : best), null)
    return { totalTx, avgInflow, bestDay }
  }, [cashflowDays])

  const hasData = !loadingOverview && (
    kpi.liquidAssets !== 0 || kpi.overdueInvoices !== 0 || (kpi.runwayDays !== null && kpi.runwayDays !== 0) || cashflowData.length > 0 || transactions.length > 0
  )

  const explainThis = async (contextType: string, data: object) => {
    setExplainOpen(true)
    setExplainLoading(true)
    setExplainMessage('')
    setExplainError('')
    try {
      const res = await fetchWithAuth(`${API_URL}api/v1/ai-explanations/explain`, {
        method: 'POST',
        body: JSON.stringify({ contextType, data }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`)
      setExplainMessage(json.data?.message ?? 'Ingen förklaring tillgänglig.')
    } catch (err) {
      setExplainError(err instanceof Error ? err.message : 'Kunde inte hämta förklaring.')
    }
    setExplainLoading(false)
  }



  const handleQuickAdd = async () => {
    if (!quickForm.description.trim() || !quickForm.amount) return
    setQuickAddSaving(true)
    try {
      const payload = {
        date: quickForm.date,
        amount: parseFloat(quickForm.amount),
        description: quickForm.description.trim(),
        ...(quickForm.category.trim() ? { category: quickForm.category.trim() } : {}),
        type: quickForm.type === 'income' ? 'INCOME' : 'EXPENSE',
      }
      const res = await fetchWithAuth(`${API_URL}api/v1/transactions/quick`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Misslyckades')
      setQuickAddOpen(false)
      setQuickForm({ date: new Date().toISOString().slice(0, 10), amount: '', description: '', category: '', type: 'income' })
      setQuickAddToast('Transaktion sparad!')
      setTimeout(() => setQuickAddToast(''), 3000)
      refreshAllData()
    } catch {
      // keep modal open so user can retry
    }
    setQuickAddSaving(false)
  }

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const showExportError = (msg: string) => {
    setExportError(msg)
    setTimeout(() => setExportError(''), 4000)
  }

  const exportExcel = async () => {
    setExportingExcel(true)
    try {
      const res = await fetchWithAuth(`${API_URL}api/v1/export/excel`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      triggerDownload(await res.blob(), `transaktioner-${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch {
      showExportError('Exporten misslyckades. Försök igen.')
    }
    setExportingExcel(false)
  }

  const downloadReport = async () => {
    setDownloadingPdf(true)
    try {
      const res = await fetchWithAuth(`${API_URL}api/v1/export/pdf`, { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      triggerDownload(await res.blob(), `ekonomirapport-${new Date().toISOString().slice(0, 10)}.pdf`)
    } catch {
      showExportError('Rapporten kunde inte genereras. Försök igen.')
    }
    setDownloadingPdf(false)
  }

  return (
    <div className="font-sans">

      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8 flex flex-col gap-6">

        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h1 className="text-4xl tracking-tight text-ink-900">Översikt</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={exportExcel}
              disabled={exportingExcel}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 text-sm font-medium text-ink-700 bg-white/60 backdrop-blur border border-ink-200/60 px-4 py-2.5 rounded-lg hover:bg-white/40 hover:shadow-md active:scale-[0.98] transition-all duration-200 disabled:opacity-60 shadow-sm min-h-[44px]"
            >
              {exportingExcel ? (
                <>
                  <span className="w-4 h-4 border-2 border-ink-400 border-t-transparent rounded-full animate-spin shrink-0" />
                  <span className="hidden sm:inline">Exporterar...</span>
                </>
              ) : (
                <>
                  <Sheet className="w-4 h-4 text-positive-600 shrink-0" />
                  <span className="hidden sm:inline">Exportera transaktioner</span>
                  <span className="sm:hidden">Exportera</span>
                </>
              )}
            </button>
            <button
              onClick={downloadReport}
              disabled={downloadingPdf}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 text-sm font-medium text-white bg-primary shadow-md shadow-brand-500/20 px-4 py-2.5 rounded-lg hover:opacity-90 active:scale-[0.98] transition-all duration-200 disabled:opacity-60 min-h-[44px]"
            >
              {downloadingPdf ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                  <span className="hidden sm:inline">Genererar rapport...</span>
                </>
              ) : (
                <>
                  <FileDown className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">Ladda ner rapport</span>
                  <span className="sm:hidden">Rapport</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Export error */}
        {exportError && (
          <div className="bg-negative-50 border border-negative-100 text-negative-600 text-sm rounded-xl px-4 py-3">
            {exportError}
          </div>
        )}

        {/* Onboarding-banner */}
        {!loadingOverview && !hasData && (
          <div className="rounded-2xl bg-primary px-8 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 shadow-lg">
            <div>
              <p className="text-white font-bold text-2xl mb-1">Kom igång med RW Systems</p>
              <p className="text-brand-200 text-sm leading-relaxed max-w-md">
                Ladda upp din ekonomidata för att se din kassaflödesanalys och få konkreta åtgärder.
              </p>
            </div>
            <a href="/onboarding"
              className="shrink-0 bg-white text-primary font-bold text-sm px-6 py-3 rounded-xl hover:bg-brand-50 transition-colors shadow-sm whitespace-nowrap">
              Starta onboarding →
            </a>
          </div>
        )}

        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="flex flex-col gap-2">
            {alerts.map((alert, i) => {
              const cfg = ALERT_CONFIG[alert.severity ?? 'low']
              const key = alert.id ?? alert.message ?? String(i)
              return (
                <div key={key} className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200 ${cfg.bg} ${cfg.border}`}>
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${cfg.iconBg} ${cfg.text}`}>
                    {cfg.icon}
                  </span>
                  <p className={`text-sm flex-1 font-medium ${cfg.text}`}>{translateAlert(alert.message)}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    {alert.link && (
                      <button onClick={() => navigate(alert.link!)} className={`text-xs font-semibold underline ${cfg.text} hover:opacity-70`}>
                        {alert.linkLabel ?? 'Visa →'}
                      </button>
                    )}
                    <button
                      onClick={() => setDismissedAlerts(s => new Set([...s, key]))}
                      className={`${cfg.text} opacity-40 hover:opacity-70 text-2xl leading-none`}
                    >
                      ×
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* AI-briefing */}
        <AiBriefing
          data={briefing}
          loading={briefingLoading}
          onNavigate={navigate}
          formatAmount={fmt}
        />

        {/* Veckans fokus */}
        <WeeklyFocusSection />

        {/* KPI-kort */}
        {loadingOverview ? (
          <SkeletonKpiCards />
        ) : (() => {
          const netCashflow = overview?.data?.summary?.netCashflow ?? 0
          const liquidTrend: KpiTrend = netCashflow > 0 ? 'up' : netCashflow < 0 ? 'down' : 'neutral'
          const overdueTrend: KpiTrend = kpi.overdueInvoices === 0 ? 'up' : 'down'
          const ct = kpi.costTrend
          const breakEvenTrend: KpiTrend = ct
            ? (ct.direction === 'up' ? 'down' : ct.direction === 'down' ? 'up' : 'neutral')
            : (kpi.liquidAssets > kpi.breakEven ? 'up' : kpi.liquidAssets < kpi.breakEven ? 'down' : 'neutral')
          const fmtPct = (n: number) => n.toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
          const breakEvenTrendLabel = ct
            ? (ct.direction === 'up'
                ? `↑ Kostnader ökar${ct.changePercent != null ? ` ${fmtPct(ct.changePercent)}%` : ''}`
                : ct.direction === 'down'
                ? `↓ Kostnader minskar${ct.changePercent != null ? ` ${fmtPct(Math.abs(ct.changePercent))}%` : ''}`
                : '→ Kostnader stabila')
            : (kpi.liquidAssets > kpi.breakEven ? 'Inflöde > utflöde' : kpi.liquidAssets < kpi.breakEven ? 'Utflöde > inflöde' : 'I balans')
          const runwayNull = kpi.runwayDays === null
          const hasAnyData = transactions.length > 0 || cashflowDays.length > 0
          const rd = kpi.runwayDays ?? 0
          const runwayValue = runwayNull
            ? (hasAnyData ? 'Beräknas...' : 'Importera data')
            : rd === 0 ? '0 dagar'
            : `${rd} dagar`
          const runwaySubtitleVal = runwayNull ? '' : rd === 0 ? 'Saldot är negativt' : 'Beräknat kassaflöde'
          const runwayTrend: KpiTrend = runwayNull ? 'neutral' : rd === 0 ? 'down' : rd > 90 ? 'up' : rd > 30 ? 'neutral' : 'down'
          const runwayAccent: KpiAccent = runwayNull ? 'blue' : rd === 0 ? 'red' : rd > 90 ? 'green' : rd > 30 ? 'yellow' : 'red'
          const runwayTrendLabel = runwayNull
            ? (hasAnyData ? 'Beräknas' : 'Importera data')
            : rd === 0 ? 'Kritiskt läge'
            : rd > 90 ? 'Stark likviditet'
            : rd > 30 ? 'Bevaka noggrant'
            : 'Kritiskt lågt'
          const gm = kpi.grossMargin
          const gmOutOfRange = gm !== null && (gm < -200 || gm > 200)
          const gmTrend: KpiTrend = (gm === null || gmOutOfRange) ? 'neutral' : gm > 30 ? 'up' : gm >= 10 ? 'neutral' : 'down'
          const gmAccent: KpiAccent = (gm === null || gmOutOfRange) ? 'blue' : gm < 0 ? 'red' : gm > 30 ? 'green' : gm >= 10 ? 'yellow' : 'red'
          const gmValue = gm === null ? 'Ingen data' : gmOutOfRange ? 'Kontrollera data' : `${gm.toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
          const gmSubtitle = (gm === null || gmOutOfRange) ? '' : gm < 0 ? 'Kostnader överstiger intäkter' : 'Av totalt inflöde'
          const gmTrendLabel = gm === null ? 'Ingen data' : gmOutOfRange ? 'Kontrollera data' : gm < 0 ? 'Kostnader överstiger intäkter' : gm > 30 ? 'Bra marginal' : gm >= 10 ? 'Acceptabel marginal' : 'Låg marginal'
          return (
            <>
            <div className="flex items-center gap-3 -mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-400 shrink-0">Nyckeltal</p>
              <div className="h-px bg-ink-200/70 flex-1" />
              <AskAiButton question="Förklara mina nyckeltal och vad jag bör agera på" />
            </div>
            <div data-tour="kpi-cards" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <KpiCard
                icon={<Banknote className="w-5 h-5" />}
                label="Likvida medel"
                value={fmt(kpi.liquidAssets)}
                subtitle="Totalt inflöde"
                trend={liquidTrend}
                trendLabel={netCashflow >= 0 ? 'Positivt netto' : 'Negativt netto'}
                accent="blue"
                onClick={() => navigate('/cashflow')}
                onExplain={() => explainThis('cashflow', { type: 'liquidAssets', value: kpi.liquidAssets })}
              />
              <KpiCard
                icon={<AlertCircle className="w-5 h-5" />}
                label="Förfallna fakturor"
                value={`${kpi.overdueInvoices} st`}
                subtitle="Kräver uppföljning"
                trend={overdueTrend}
                trendLabel={kpi.overdueInvoices === 0 ? 'Allt i ordning' : 'Kräver åtgärd'}
                accent={kpi.overdueInvoices === 0 ? 'green' : 'red'}
                onClick={() => navigate('/invoices')}
                onExplain={() => explainThis('diagnosis', { type: 'overdueInvoices', value: kpi.overdueInvoices })}
              />
              <KpiCard
                icon={<BarChart2 className="w-5 h-5" />}
                label="Break-even"
                value={fmt(kpi.breakEven)}
                subtitle="Totalt utflöde"
                trend={breakEvenTrend}
                trendLabel={breakEvenTrendLabel}
                accent="purple"
                onClick={() => navigate('/breakeven')}
                onExplain={() => explainThis('diagnosis', { type: 'breakEven', value: kpi.breakEven })}
              />
              <KpiCard
                icon={<Clock className="w-5 h-5" />}
                label="Runway"
                value={runwayValue}
                subtitle={runwaySubtitleVal}
                trend={runwayTrend}
                trendLabel={runwayTrendLabel}
                accent={runwayAccent}
                isPlaceholder={runwayNull}
                onClick={() => navigate('/runway')}
                onExplain={() => explainThis('diagnosis', { type: 'runway', value: rd })}
              />
              <KpiCard
                icon={<TrendingUp className="w-5 h-5" />}
                label="Bruttomarginal"
                value={gmValue}
                subtitle={gmSubtitle}
                trend={gmTrend}
                trendLabel={gmTrendLabel}
                accent={gmAccent}
                isPlaceholder={gm === null || gmOutOfRange}
                onExplain={() => explainThis('diagnosis', { type: 'grossMargin', value: gm })}
              />
            </div>
            </>
          )
        })()}

        {/* Kostnadsutveckling info-kort */}
        {!loadingOverview && kpi.costTrend && (
          kpi.costTrend.currentPeriod != null && kpi.costTrend.previousPeriod != null
        ) && (() => {
          const ct = kpi.costTrend!
          const dirConfig = {
            up:     { label: '↑ Ökning',    cls: 'text-negative-600 bg-negative-50' },
            down:   { label: '↓ Minskning', cls: 'text-positive-700 bg-positive-50' },
            stable: { label: '→ Stabil',    cls: 'text-ink-500 bg-ink-100' },
          }[ct.direction]
          return (
            <div className="glass rounded-xl px-5 py-4 shadow-sm flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="text-ink-400 font-medium">Kostnadsutveckling</span>
              <span className="text-ink-300">·</span>
              <span className="text-ink-700">
                Denna period <span className="font-semibold">{fmt(ct.currentPeriod!)}</span>
              </span>
              <span className="text-ink-300">vs</span>
              <span className="text-ink-500">
                Förra perioden <span className="font-medium">{fmt(ct.previousPeriod!)}</span>
              </span>
              <span className={`ml-auto text-xs font-semibold px-2.5 py-0.5 rounded-full ${dirConfig.cls}`}>
                {dirConfig.label}{ct.changePercent != null ? ` ${Math.abs(ct.changePercent).toLocaleString('sv-SE', { maximumFractionDigits: 1 })}%` : ''}
              </span>
            </div>
          )
        })()}

        {/* Snabb-statistik */}
        {!loadingCashflow && cashflowDays.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <div className="glass rounded-xl px-3 sm:px-5 py-4 sm:py-4 shadow-sm text-center hover:shadow-md transition-all duration-200">
              <p className="text-2xl sm:text-3xl font-bold tabular text-ink-900 tracking-tight">{quickStats.totalTx}</p>
              <p className="text-xs text-ink-400 mt-1">Aktiva dagar</p>
            </div>
            <div className="glass rounded-xl px-5 py-4 shadow-sm text-center hover:shadow-md transition-all duration-200">
              <p className="text-3xl font-bold tabular text-ink-900 tracking-tight">{fmt(Math.round(quickStats.avgInflow))}</p>
              <p className="text-xs text-ink-400 mt-1">Genomsnittligt dagligt inflöde</p>
            </div>
            <div className="glass rounded-xl px-5 py-4 shadow-sm text-center hover:shadow-md transition-all duration-200">
              <p className="text-3xl font-bold tabular text-ink-900 tracking-tight">{fmt(quickStats.bestDay?.inflow ?? 0)}</p>
              <p className="text-xs text-ink-400 mt-1">
                Bästa dag{quickStats.bestDay?.date ? `: ${new Date(quickStats.bestDay.date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}` : ''}
              </p>
            </div>
          </div>
        )}

        {/* Kassaflödes-graf */}
        {loadingCashflow ? (
          <SkeletonChart />
        ) : cashflowError ? (
          <div className="glass rounded-xl p-6 text-center text-negative-400 text-sm">
            {cashflowError}
          </div>
        ) : cashflowDays.length > 0 ? (
          <div data-tour="cashflow-chart" className="glass rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg text-ink-700 mb-0.5 tracking-tight">Kassaflöde</h2>
                {periodLabel && <p className="text-xs text-ink-400">{periodLabel}</p>}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-ink-100 rounded-lg p-0.5 text-xs font-semibold">
                  {(['day', 'week', 'month'] as const).map(v => (
                    <button
                      key={v}
                      onClick={() => setCashflowView(v)}
                      className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${cashflowView === v ? 'bg-white text-ink-800 shadow-sm' : 'text-ink-500 hover:text-ink-700'}`}
                    >
                      {v === 'day' ? 'Dag' : v === 'week' ? 'Vecka' : 'Månad'}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => explainThis('cashflow', { cashflow: cashflowDays })}
                  className="flex items-center gap-1.5 text-xs font-medium text-accent border border-accent/30 px-3 py-1.5 rounded-lg hover:bg-brand-50 transition-colors"
                >
                  <SparkleIcon /> Förklara detta
                </button>
                <AskAiButton question="Förklara mitt kassaflöde just nu och vad jag bör göra" />
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={aggregatedCashflow} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="inflowGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3A5CD8" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#3A5CD8" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="outflowGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#CE4646" stopOpacity={0.13} />
                    <stop offset="95%" stopColor="#CE4646" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEEDEC" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8B8A93' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: '#8B8A93' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} width={42} />
                <ReferenceLine y={0} stroke="#DEDCDC" strokeWidth={1.5} strokeDasharray="4 3" />
                <Tooltip content={<CashflowTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                <Area type="monotone" dataKey="inflow" name="Inflöde" stroke="#3A5CD8" strokeWidth={2} fill="url(#inflowGrad)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                <Area type="monotone" dataKey="outflow" name="Utflöde" stroke="#CE4646" strokeWidth={2} fill="url(#outflowGrad)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="glass rounded-xl p-6 text-center text-ink-400 text-sm">
            Ingen kassaflödesdata tillgänglig. Importera bankdata i <a href="/onboarding" className="text-accent underline">onboarding</a>.
          </div>
        )}

        {/* Åtgärder + Transaktioner */}
        <div className="grid md:grid-cols-2 gap-6">

          {/* Rekommendationer */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-2xl text-ink-800 tracking-tight shrink-0">Rekommenderade åtgärder</h2>
              <div className="h-px bg-ink-200/70 flex-1" />
            </div>
            {loadingRec ? (
              <SkeletonList rows={3} />
            ) : recommendations.length > 0 ? (
              <div className="flex flex-col gap-3">
                {recommendations.map((r, i) => (
                  <RecommendationCard key={r.id ?? i} r={r} onExplain={() => explainThis('recommendation', { title: r.title, description: r.description, estimatedValue: r.estimatedValue })} />
                ))}
              </div>
            ) : (
              <div className="glass rounded-xl p-6 text-center text-ink-400 text-sm">
                Inga rekommendationer just nu.
              </div>
            )}
          </div>

          {/* Senaste transaktioner */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-2xl text-ink-800 tracking-tight shrink-0">Senaste transaktioner</h2>
              <div className="h-px bg-ink-200/70 flex-1" />
            </div>
            {loadingOverview ? (
              <SkeletonList rows={5} />
            ) : recentTransactionRows.length > 0 ? (
              <div className="glass rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  {(() => {
                    const hasCategory = recentTransactionRows.some(t => t.category !== null)
                    return (
                      <table className="w-full text-base min-w-[420px]">
                        <thead>
                          <tr className="border-b border-ink-100 bg-ink-50/40">
                            <th className="text-left px-5 py-4 text-xs font-semibold uppercase tracking-wide text-ink-500">Datum</th>
                            <th className="text-left px-5 py-4 text-xs font-semibold uppercase tracking-wide text-ink-500">Beskrivning</th>
                            {hasCategory && <th className="text-left px-5 py-4 text-xs font-semibold uppercase tracking-wide text-ink-500">Kategori</th>}
                            <th className="text-left px-5 py-4 text-xs font-semibold uppercase tracking-wide text-ink-500">Typ</th>
                            <th className="text-right px-5 py-4 text-xs font-semibold uppercase tracking-wide text-ink-500">Belopp</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentTransactionRows.map((t, i) => (
                            <tr key={i} className={`${i !== 0 ? 'border-t border-ink-100' : ''} ${i % 2 === 1 ? 'bg-ink-50/30' : ''} hover:bg-white/50 transition-colors`}>
                              <td className="px-5 py-4 text-ink-400 whitespace-nowrap">{t.label}</td>
                              <td className="px-5 py-4 text-ink-700">
                                {t.description ?? <span className="text-ink-300">—</span>}
                              </td>
                              {hasCategory && (
                                <td className="px-5 py-4">
                                  {t.category
                                    ? <span className="text-xs font-medium bg-ink-100 text-ink-600 border border-ink-200 px-2 py-0.5 rounded-full whitespace-nowrap">{t.category}</span>
                                    : <span className="text-ink-300">—</span>}
                                </td>
                              )}
                              <td className="px-5 py-4 text-ink-600 whitespace-nowrap">{t.typeLabel}</td>
                              <td className={`px-5 py-4 text-right font-medium whitespace-nowrap tabular-nums ${t.amount < 0 ? 'text-negative-600' : 'text-positive-600'}`}>
                                {fmt(t.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  })()}
                </div>
              </div>
            ) : recentCashflowRows.length > 0 ? (
              <div className="glass rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-base min-w-[320px]">
                    <thead>
                      <tr className="border-b border-ink-100 bg-ink-50/40">
                        <th className="text-left px-5 py-4 text-xs font-semibold uppercase tracking-wide text-ink-500">Datum</th>
                        <th className="text-left px-5 py-4 text-xs font-semibold uppercase tracking-wide text-ink-500">Typ</th>
                        <th className="text-right px-5 py-4 text-xs font-semibold uppercase tracking-wide text-ink-500">Belopp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentCashflowRows.map((t, i) => (
                        <tr key={i} className={`${i !== 0 ? 'border-t border-ink-100' : ''} ${i % 2 === 1 ? 'bg-ink-50/30' : ''} hover:bg-white/50 transition-colors`}>
                          <td className="px-5 py-4 text-ink-400 whitespace-nowrap">{t.label}</td>
                          <td className="px-5 py-4 text-ink-700">{t.type}</td>
                          <td className={`px-5 py-4 text-right font-medium whitespace-nowrap tabular-nums ${t.amount < 0 ? 'text-negative-600' : 'text-positive-600'}`}>
                            {fmt(t.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="glass rounded-xl p-6 text-center text-ink-400 text-sm">
                Inga transaktioner. Importera bankdata i <a href="/onboarding" className="text-accent underline">onboarding</a>.
              </div>
            )}
          </div>
        </div>

        {/* Toppprodukter + Toppkunder */}
        {!loadingOverview && (
          <div className="grid md:grid-cols-2 gap-6">

            {/* Toppprodukter */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-2xl text-ink-800 tracking-tight shrink-0">Toppprodukter</h2>
                <div className="h-px bg-ink-200/70 flex-1" />
                <AskAiButton question="Analysera mina toppprodukter och kategorier. Vad driver intäkterna?" />
              </div>
              <RankList items={topProducts} emptyText="Importera data för att se dina toppprodukter." rowLabel="Kategori" barColor="bg-brand-50" />
            </div>

            {/* Toppkunder */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-2xl text-ink-800 tracking-tight shrink-0">Toppkunder</h2>
                <div className="h-px bg-ink-200/70 flex-1" />
                <AskAiButton question="Analysera mina toppkunder. Vem bör jag prioritera och varför?" />
              </div>
              <RankList items={topCustomers} emptyText="Importera data för att se dina toppkunder." rowLabel="Kund" barColor="bg-purple-50" />
            </div>

          </div>
        )}

      </div>


      {/* Quick-add toast */}
      {quickAddToast && (
        <div role="status" aria-live="polite" className="fixed bottom-6 left-6 z-50 flex items-center gap-2 bg-positive-700 text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-lg">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {quickAddToast}
        </div>
      )}

      {/* Quick-add modal */}
      {quickAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/20 backdrop-blur-md" onClick={() => setQuickAddOpen(false)}>
          <div className="bg-white/60 backdrop-blur-3xl border border-ink-200/60 rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-2xl text-ink-900">Ny transaktion</h2>
              <button onClick={() => setQuickAddOpen(false)} className="text-ink-400 hover:text-ink-600 text-2xl leading-none">&times;</button>
            </div>

            {/* Type toggle */}
            <div className="flex rounded-xl border border-ink-200 overflow-hidden mb-4">
              <button
                onClick={() => setQuickForm(f => ({ ...f, type: 'income' }))}
                className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${quickForm.type === 'income' ? 'bg-positive-600 text-white' : 'text-ink-500 hover:bg-ink-50'}`}
              >
                Inkomst
              </button>
              <button
                onClick={() => setQuickForm(f => ({ ...f, type: 'expense' }))}
                className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${quickForm.type === 'expense' ? 'bg-negative-500 text-white' : 'text-ink-500 hover:bg-ink-50'}`}
              >
                Utgift
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-medium text-ink-500 mb-1">Datum</label>
                <input
                  type="date"
                  value={quickForm.date}
                  onChange={e => setQuickForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full border border-ink-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-500 mb-1">Belopp (SEK)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={quickForm.amount}
                  onChange={e => setQuickForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full border border-ink-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-500 mb-1">Beskrivning</label>
                <input
                  type="text"
                  placeholder="T.ex. Hyra, Kundbetalning..."
                  value={quickForm.description}
                  onChange={e => setQuickForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-ink-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-500 mb-1">Kategori <span className="text-ink-300">(valfri)</span></label>
                <input
                  type="text"
                  placeholder="T.ex. Hyra, Lön..."
                  value={quickForm.category}
                  onChange={e => setQuickForm(f => ({ ...f, category: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') handleQuickAdd() }}
                  className="w-full border border-ink-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setQuickAddOpen(false)}
                className="flex-1 py-2.5 text-sm font-semibold text-ink-600 bg-ink-100 rounded-xl hover:bg-ink-200 transition-colors"
              >
                Avbryt
              </button>
              <button
                onClick={handleQuickAdd}
                disabled={quickAddSaving || !quickForm.description.trim() || !quickForm.amount}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-primary rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {quickAddSaving && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {quickAddSaving ? 'Sparar...' : 'Spara'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Explain Modal */}
      {explainOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/20 backdrop-blur-md" onClick={() => setExplainOpen(false)}>
          <div className="bg-white/60 backdrop-blur-3xl border border-ink-200/60 rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-primary font-semibold">
                <SparkleIcon className="w-4 h-4 text-accent" /> AI-förklaring
              </div>
              <button onClick={() => setExplainOpen(false)} className="text-ink-400 hover:text-ink-600 text-2xl leading-none">&times;</button>
            </div>
            {explainLoading ? (
              <div className="flex items-center gap-3 py-6 text-ink-400 text-sm">
                <span className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0" />
                Hämtar förklaring...
              </div>
            ) : explainError ? (
              <p className="text-negative-600 text-sm py-2">{explainError}</p>
            ) : (
              <p className="text-ink-700 text-sm leading-relaxed">{explainMessage}</p>
            )}
            <button onClick={() => setExplainOpen(false)} className="mt-5 w-full text-sm font-medium bg-ink-100 hover:bg-ink-200 text-ink-700 py-2.5 rounded-lg transition-colors">
              Stäng
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setQuickAddOpen(true)}
        className="fixed bottom-6 right-24 bg-white border border-ink-200 text-ink-700 rounded-full w-14 h-14 flex items-center justify-center shadow-lg hover:bg-ink-50 active:scale-95 transition-all duration-200"
        title="Lägg till transaktion"
        aria-label="Lägg till transaktion"
      >
        <span className="text-3xl font-light leading-none pb-0.5" aria-hidden="true">+</span>
      </button>

      {/* Onboarding tour */}
      {showTour && (
        <Tour
          onComplete={() => {
            markTourCompleted()
            setShowTour(false)
          }}
        />
      )}
    </div>
  )
}

function CashflowTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}) {
  const { formatAmount: fmt } = useCurrency()
  if (!active || !payload?.length) return null
  return (
    <div className="glass rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-ink-700 mb-2">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2 mb-1 last:mb-0">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
          <span className="text-ink-500 w-16">{p.name}:</span>
          <span className="font-semibold" style={{ color: p.color }}>{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

function RecommendationCard({ r, onExplain }: { r: Recommendation; onExplain: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const { formatAmount: fmt } = useCurrency()
  const p = PRIORITY_CONFIG[r.priority ?? 'medium']

  return (
    <div className="group glass rounded-2xl overflow-hidden hover:bg-white/82 hover:shadow-[0_12px_40px_rgba(26,25,32,0.09)] transition-all duration-200 cursor-default">
      {/* Urgency strip */}
      <div className="h-1 w-full bg-ink-100">
        <div className={`h-full ${p.bar} transition-all`} style={{ width: `${p.urgencyPct}%` }} />
      </div>

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border mb-1.5 ${p.badge}`}>
              <span className="font-mono">{p.symbol}</span> {p.label}
            </span>
            <h3 className="font-semibold text-ink-900 text-sm leading-snug">{r.title}</h3>
          </div>
          <button
            onClick={onExplain}
            className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-accent hover:text-accent/70 mt-1"
            title="Förklara med AI"
          >
            <SparkleIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Description */}
        <p className="text-ink-500 text-sm leading-relaxed mb-4">{r.description}</p>

        {/* Potential value */}
        {(r.estimatedValue ?? 0) > 0 && (
          <div className="flex items-center gap-3 bg-positive-50 border border-positive-100 rounded-xl px-3 py-2.5 mb-4">
            <span className="text-positive-500 text-2xl font-bold leading-none">↑</span>
            <div>
              <p className="text-[10px] font-bold text-positive-600 uppercase tracking-widest">Möjlig förbättring</p>
              <p className="text-base font-bold text-positive-700 leading-tight">{fmt(r.estimatedValue)}</p>
            </div>
          </div>
        )}

        {/* How to */}
        {r.how && (
          <div className="mb-4">
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-xs text-accent font-semibold flex items-center gap-1.5 hover:underline"
            >
              <span className="text-[9px]">{expanded ? '▼' : '▶'}</span> Hur gör jag?
            </button>
            {expanded && (
              <p className="text-ink-600 text-sm mt-2 leading-relaxed border-l-2 border-accent/30 pl-3">{r.how}</p>
            )}
          </div>
        )}

        {/* Targets */}
        {r.targets && r.targets.length > 0 && (
          <div className="mb-4 border border-ink-100 rounded-xl overflow-hidden">
            {r.targets.slice(0, 3).map((t, i) => (
              <div key={t.id ?? i} className={`flex items-center justify-between px-3 py-2 text-xs ${i !== 0 ? 'border-t border-ink-50' : ''}`}>
                <span className="text-ink-600 font-medium truncate mr-2">{t.label}</span>
                <span className="font-semibold text-ink-800 shrink-0">{fmt(t.value)}</span>
              </div>
            ))}
            {r.targets.length > 3 && (
              <div className="px-3 py-1.5 text-xs text-ink-400 border-t border-ink-50 bg-ink-50">
                +{r.targets.length - 3} till
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onExplain}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-accent border border-accent/30 px-3 py-2 rounded-lg hover:bg-brand-50 transition-all duration-200"
          >
            <SparkleIcon className="w-3 h-3" /> Förklara
          </button>
          <button className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-white bg-accent px-3 py-2 rounded-lg hover:bg-brand-700 active:scale-95 transition-all duration-200">
            Åtgärda <span className="text-sm leading-none">→</span>
          </button>
        </div>
      </div>
    </div>
  )
}

type KpiAccent = 'blue' | 'green' | 'red' | 'orange' | 'purple' | 'yellow'
type KpiTrend = 'up' | 'down' | 'neutral'

const ACCENT_STYLES: Record<KpiAccent, { shadow: string; shadowHover: string; iconBg: string; iconText: string; accentBorder: string }> = {
  blue:   { shadow: 'shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_4px_16px_rgba(0,0,0,0.04),0_4px_28px_rgba(58,92,216,0.12)]',   shadowHover: 'hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_8px_28px_rgba(0,0,0,0.06),0_8px_36px_rgba(58,92,216,0.16)]',   iconBg: 'bg-brand-50   border border-brand-100',   iconText: 'text-brand-600',   accentBorder: 'border-l-brand-500'   },
  green:  { shadow: 'shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_4px_16px_rgba(0,0,0,0.04),0_4px_28px_rgba(14,156,107,0.12)]',   shadowHover: 'hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_8px_28px_rgba(0,0,0,0.06),0_8px_36px_rgba(14,156,107,0.16)]',   iconBg: 'bg-positive-50  border border-positive-100',  iconText: 'text-positive-600',  accentBorder: 'border-l-positive-500'  },
  red:    { shadow: 'shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_4px_16px_rgba(0,0,0,0.04),0_4px_28px_rgba(206,70,70,0.12)]',   shadowHover: 'hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_8px_28px_rgba(0,0,0,0.06),0_8px_36px_rgba(206,70,70,0.16)]',   iconBg: 'bg-negative-50    border border-negative-100',    iconText: 'text-negative-600',    accentBorder: 'border-l-negative-500'    },
  orange: { shadow: 'shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_4px_16px_rgba(0,0,0,0.04),0_4px_28px_rgba(201,130,31,0.12)]',  shadowHover: 'hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_8px_28px_rgba(0,0,0,0.06),0_8px_36px_rgba(201,130,31,0.16)]',  iconBg: 'bg-caution-50 border border-caution-100', iconText: 'text-caution-600', accentBorder: 'border-l-caution-500' },
  purple: { shadow: 'shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_4px_16px_rgba(0,0,0,0.04),0_4px_28px_rgba(124,91,217,0.12)]',  shadowHover: 'hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_8px_28px_rgba(0,0,0,0.06),0_8px_36px_rgba(124,91,217,0.16)]',  iconBg: 'bg-purple-50 border border-purple-100', iconText: 'text-purple-600', accentBorder: 'border-l-purple-500' },
  yellow: { shadow: 'shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_4px_16px_rgba(0,0,0,0.04),0_4px_28px_rgba(201,130,31,0.12)]',   shadowHover: 'hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_8px_28px_rgba(0,0,0,0.06),0_8px_36px_rgba(201,130,31,0.16)]',   iconBg: 'bg-caution-50 border border-caution-100', iconText: 'text-caution-600', accentBorder: 'border-l-caution-500' },
}

const TREND_STYLES: Record<KpiTrend, { arrow: string; text: string; bg: string }> = {
  up:      { arrow: '↑', text: 'text-positive-600', bg: 'bg-positive-50' },
  down:    { arrow: '↓', text: 'text-negative-600',   bg: 'bg-negative-50' },
  neutral: { arrow: '→', text: 'text-caution-600', bg: 'bg-caution-50' },
}

function KpiCard({ icon, label, value, subtitle, trend, trendLabel, accent = 'blue', isPlaceholder = false, onExplain, onClick }: {
  icon: React.ReactNode
  label: string
  value: string
  subtitle?: string
  trend?: KpiTrend
  trendLabel?: string
  accent?: KpiAccent
  isPlaceholder?: boolean
  onExplain?: () => void
  onClick?: () => void
}) {
  const c = ACCENT_STYLES[accent]
  const t = trend ? TREND_STYLES[trend] : null

  return (
    <div
      onClick={onClick}
      className={`glass-kpi border-l-[3px] ${c.accentBorder} rounded-2xl px-5 py-5 group relative transition-all duration-300 min-h-[160px] flex flex-col ${c.shadow} ${c.shadowHover} hover:bg-white/90 ${onClick ? 'cursor-pointer active:scale-[0.98]' : ''}`}
    >
      {/* Icon row */}
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.iconBg} ${c.iconText}`}>
          {icon}
        </div>
        {onExplain && (
          <button
            onClick={e => { e.stopPropagation(); onExplain() }}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-accent hover:text-accent/70"
            title="Förklara med AI"
          >
            <SparkleIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Label */}
      <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-1.5">{label}</p>

      {/* Value — flex-1 so it fills space, overflow-hidden so it never breaks layout */}
      <div className="flex-1 min-h-0 overflow-hidden mb-2">
        {isPlaceholder ? (
          <p className="text-sm text-ink-500 font-medium leading-snug break-words">{value}</p>
        ) : (
          <p className="text-3xl font-extrabold text-ink-900 tracking-tight tabular-nums leading-none">{value}</p>
        )}
      </div>

      {/* Footer row — pinned to bottom */}
      <div className="flex items-center justify-between gap-2 mt-auto">
        {subtitle && <p className="text-xs text-ink-400 truncate">{subtitle}</p>}
        {t && trendLabel && (
          <span className={`ml-auto shrink-0 text-[10.5px] font-semibold px-2 py-0.5 rounded-md tracking-wide ${t.text} ${t.bg}`}>
            {t.arrow} {trendLabel}
          </span>
        )}
      </div>
    </div>
  )
}

function RankList({ items, emptyText, rowLabel, barColor }: {
  items: { label: string; totalInflow: number; transactionCount: number }[]
  emptyText: string
  rowLabel: string
  barColor: string
}) {
  const { formatAmount: fmt } = useCurrency()
  if (items.length === 0) {
    return (
      <div className="glass rounded-2xl p-6 text-center text-ink-400 text-sm">
        {emptyText}
      </div>
    )
  }
  const maxInflow = Math.max(...items.map(p => p.totalInflow), 1)
  return (
    <div className="glass rounded-2xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <div className="min-w-[360px]">
          <div className="grid grid-cols-[1fr_auto_auto_auto] text-xs font-semibold text-ink-400 uppercase tracking-widest px-5 py-4 border-b border-ink-100">
            <span>{rowLabel}</span>
            <span className="text-right pr-6">Inflöde</span>
            <span className="text-right pr-6">Antal</span>
            <span className="text-right">Snitt</span>
          </div>
          {items.map((p, i) => {
            const barPct = (p.totalInflow / maxInflow) * 100
            const avg = p.transactionCount > 0 ? p.totalInflow / p.transactionCount : 0
            return (
              <div key={i} className={`relative grid grid-cols-[1fr_auto_auto_auto] items-center px-5 py-4 hover:bg-white/40 transition-colors ${i !== 0 ? 'border-t border-ink-100/60' : ''}`}>
                <div className={`absolute inset-y-0 left-0 ${barColor} transition-all duration-500`} style={{ width: `${barPct}%` }} />
                <span className="relative text-sm font-semibold text-ink-800 truncate pr-4">{p.label}</span>
                <span className="relative text-sm font-semibold text-ink-900 text-right pr-6 whitespace-nowrap tabular-nums">{fmt(p.totalInflow)}</span>
                <span className="relative text-sm text-ink-400 text-right pr-6 whitespace-nowrap tabular-nums">{p.transactionCount} st</span>
                <span className="relative text-sm text-ink-500 text-right whitespace-nowrap tabular-nums">{fmt(avg)}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function SparkleIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    </svg>
  )
}

// ── Veckans fokus ─────────────────────────────────────────────────────────────

interface FocusItem {
  title: string
  why?: string
  estimatedImpact?: number
}

const WEEKLY_FOCUS_SS = 'rw_weekly_focus'

function WeeklyFocusSection() {
  const { formatAmount: fmt } = useCurrency()
  const [items, setItems] = useState<FocusItem[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(WEEKLY_FOCUS_SS) ?? '[]') as FocusItem[] }
    catch { return [] }
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetchWithAuth(`${API_URL}api/v1/ai/prepare-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType: 'weekly_focus' }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const d = json?.data ?? json
      const focus: FocusItem[] = Array.isArray(d?.items) ? d.items : Array.isArray(d) ? d : []
      setItems(focus)
      sessionStorage.setItem(WEEKLY_FOCUS_SS, JSON.stringify(focus))
    } catch {
      setError('Kunde inte hämta veckofokus. Försök igen.')
    } finally {
      setLoading(false)
    }
  }

  const openAiWith = (q: string) =>
    window.dispatchEvent(new CustomEvent('rw:ai:open', { detail: { question: q } }))

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-500 to-brand-600 flex items-center justify-center shrink-0">
          <SparkleIcon className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-0.5">Veckans fokus</p>
          <p className="text-sm font-bold text-ink-900 tracking-tight">Vad bör du prioritera denna vecka?</p>
        </div>
        {items.length > 0 && !loading && (
          <button
            onClick={() => void load()}
            className="text-xs text-ink-400 hover:text-ink-600 transition-colors shrink-0"
          >
            Uppdatera
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-3 py-2 text-ink-500">
          <span className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin shrink-0" />
          <p className="text-sm">AI:n förbereder...</p>
        </div>
      )}

      {error && !loading && (
        <p className="text-sm text-negative-600">{error}</p>
      )}

      {!loading && !error && items.length === 0 && (
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white text-sm font-semibold rounded-xl hover:bg-purple-700 transition-colors min-h-[44px]"
        >
          <SparkleIcon className="w-4 h-4 text-white" />
          Vad ska jag fokusera på denna vecka?
        </button>
      )}

      {!loading && items.length > 0 && (
        <ol className="flex flex-col gap-3.5">
          {items.map((item, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-ink-900">{item.title}</p>
                    {item.why && (
                      <p className="text-xs text-ink-500 mt-0.5 leading-relaxed">{item.why}</p>
                    )}
                    {item.estimatedImpact != null && item.estimatedImpact > 0 && (
                      <p className="text-xs font-semibold text-positive-600 mt-1">+{fmt(item.estimatedImpact)}</p>
                    )}
                  </div>
                  <button
                    onClick={() => openAiWith(`Berätta mer om detta fokusområde: ${item.title}`)}
                    className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-brand-600 border border-brand-200 rounded-lg px-2.5 py-1 hover:bg-brand-50 transition-colors whitespace-nowrap mt-0.5"
                  >
                    <SparkleIcon className="w-3 h-3" />
                    Fråga AI om detta
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

// ─── AI helpers ───────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'God morgon'
  if (h < 18) return 'God eftermiddag'
  return 'God kväll'
}

function openAiWith(question: string) {
  window.dispatchEvent(new CustomEvent('rw:ai:open', { detail: { question } }))
}

function AskAiButton({ question }: { question: string }) {
  return (
    <button
      onClick={() => openAiWith(question)}
      className="flex items-center gap-1.5 text-xs font-medium text-ink-400 hover:text-brand-600 transition-colors px-2 py-1 rounded-lg hover:bg-brand-50/60 min-h-[32px]"
    >
      <SparkleIcon className="w-3 h-3" />
      Fråga AI
    </button>
  )
}

const SEVERITY_CFG = {
  critical: { dot: 'bg-negative-500',   text: 'text-negative-700',   bg: 'bg-negative-50/80',   border: 'border-negative-200/80'   },
  warning:  { dot: 'bg-caution-400', text: 'text-caution-700', bg: 'bg-caution-50/80', border: 'border-caution-200/80' },
  info:     { dot: 'bg-brand-400',  text: 'text-brand-700',  bg: 'bg-brand-50/80',  border: 'border-brand-200/80'  },
} as const

function AiBriefing({ data, loading, onNavigate, formatAmount: fmt }: {
  data: BriefingData | null
  loading: boolean
  onNavigate: (to: string) => void
  formatAmount: (v: number) => string
}) {
  if (!loading && !data) return null

  if (loading) {
    return (
      <div className="glass rounded-2xl px-6 py-5 flex items-center gap-4">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500/20 to-brand-500/20 flex items-center justify-center shrink-0">
          <SparkleIcon className="w-4 h-4 text-brand-500 animate-pulse" />
        </div>
        <div className="flex flex-col gap-1.5 flex-1">
          <div className="h-3.5 bg-ink-200/80 rounded-full w-48 animate-pulse" />
          <div className="h-3 bg-ink-100/80 rounded-full w-80 max-w-full animate-pulse" />
          <div className="h-3 bg-ink-100/80 rounded-full w-64 max-w-full animate-pulse" />
        </div>
        <p className="text-xs text-ink-400 shrink-0 hidden sm:block">AI:n analyserar din ekonomi...</p>
      </div>
    )
  }

  const topInsights = [...(data?.insights ?? [])]
    .sort((a, b) => {
      const order: Record<string, number> = { critical: 0, warning: 1, info: 2 }
      return (order[a.severity] ?? 2) - (order[b.severity] ?? 2)
    })
    .slice(0, 2)

  return (
    <div className="relative rounded-2xl p-[1px] bg-gradient-to-r from-brand-400/40 via-brand-300/30 to-purple-300/20">
      <div className="bg-white/70 backdrop-blur-2xl rounded-2xl px-6 py-5 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-600 to-brand-600 flex items-center justify-center shrink-0 shadow-sm">
              <SparkleIcon className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold text-brand-600 uppercase tracking-wider mb-0.5">AI-sammanfattning</p>
              <p className="text-base font-bold text-ink-900 tracking-tight">{getGreeting()}, här är läget</p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('/insights')}
            className="text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline transition-colors shrink-0 mt-1"
          >
            Se alla insikter →
          </button>
        </div>

        {/* Summary */}
        {data?.summary && (
          <p className="text-sm text-ink-600 leading-relaxed border-l-2 border-brand-200 pl-3">
            {data.summary}
          </p>
        )}

        {/* Top insights */}
        {topInsights.length > 0 && (
          <div className="grid sm:grid-cols-2 gap-2">
            {topInsights.map((ins, i) => {
              const cfg = SEVERITY_CFG[ins.severity] ?? SEVERITY_CFG.info
              return (
                <button
                  key={i}
                  onClick={() => onNavigate('/insights')}
                  className={`flex items-start gap-3 px-3.5 py-3 rounded-xl border text-left transition-all hover:shadow-sm active:scale-[0.99] ${cfg.bg} ${cfg.border}`}
                >
                  <span className={`w-2 h-2 rounded-full ${cfg.dot} shrink-0 mt-1.5`} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-semibold leading-snug ${cfg.text}`}>{ins.title}</p>
                    {ins.impact != null && (
                      <p className="text-xs text-ink-500 mt-0.5">
                        Påverkan: <span className="font-semibold">{fmt(ins.impact)}</span>
                      </p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
