import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, AlertTriangle, AlertCircle, Info, FileSpreadsheet, Files, Check } from 'lucide-react'
import ExcelJS from 'exceljs'
import { fetchWithAuth } from '../utils/fetchWithAuth'
import { useCurrency } from '../contexts/CurrencyContext'

const API_URL = import.meta.env.VITE_API_URL as string

// ── Column auto-detection ───────────────────────────────────────────────────
const DATE_HINTS     = ['datum', 'date', 'dag', 'tid', 'bokf', 'trans', 'time']
const AMOUNT_HINTS   = ['belopp', 'amount', 'summa', 'sum', 'värde', 'value', 'kr', 'sek', 'debet', 'kredit']
const CATEGORY_HINTS = ['kategori', 'category', 'typ', 'type', 'konto', 'account', 'text', 'beskrivning', 'description']

function detectColumn(headers: string[], hints: string[]): string | null {
  for (const hint of hints) {
    const match = headers.find(h => h.toLowerCase().includes(hint))
    if (match) return match
  }
  return null
}

// ── Types ─────────────────────────────────────────────────────────────────
interface Anomaly {
  severity: 'critical' | 'warning' | 'info'
  title: string
  description: string
  affectedAmount?: number
}

interface DetectedCost {
  category: string
  amount: number
  frequency: string
  occurrences: number
  confidence: number
}

interface ContentAnalysis {
  transactionCount: number
  fromDate: string
  toDate: string
  detectedInvoices: number
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function extractCellValue(raw: unknown): unknown {
  if (raw === null || raw === undefined) return ''
  if (raw instanceof Date) return raw.toISOString().slice(0, 10)
  if (typeof raw !== 'object') return raw
  const v = raw as Record<string, unknown>
  if (Array.isArray(v.richText)) return (v.richText as { text: string }[]).map(r => r.text).join('')
  if (v.result !== undefined) return extractCellValue(v.result)
  if (typeof v.text === 'string') return v.text
  if (typeof v.error === 'string') return ''
  return String(raw)
}

function parseCsv(buffer: ArrayBuffer): Record<string, unknown>[] {
  const text = new TextDecoder('utf-8').decode(buffer)
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const delim = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : ','
  const parseRow = (line: string): string[] => {
    const out: string[] = []; let cur = '', inQ = false
    for (const ch of line) {
      if (ch === '"') inQ = !inQ
      else if (ch === delim && !inQ) { out.push(cur.trim()); cur = '' }
      else cur += ch
    }
    return [...out, cur.trim()]
  }
  const headers = parseRow(lines[0]).map(h => h.replace(/^"|"$/g, ''))
  return lines.slice(1)
    .map(line => {
      const vals = parseRow(line)
      const obj: Record<string, unknown> = {}
      headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').replace(/^"|"$/g, '') })
      return obj
    })
    .filter(row => Object.values(row).some(v => v !== ''))
}

async function readFileAsRows(file: File): Promise<Record<string, unknown>[]> {
  const buffer = await file.arrayBuffer()
  try {
    if (file.name.toLowerCase().endsWith('.csv')) return parseCsv(buffer)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)
    const ws = workbook.worksheets[0]
    if (!ws || ws.rowCount < 2) return []
    const headers: string[] = []
    ws.getRow(1).eachCell({ includeEmpty: false }, cell => {
      headers.push(String(extractCellValue(cell.value) ?? ''))
    })
    if (!headers.length) return []
    const rows: Record<string, unknown>[] = []
    ws.eachRow((row, n) => {
      if (n === 1) return
      const obj: Record<string, unknown> = {}
      headers.forEach((h, i) => { obj[h] = extractCellValue(row.getCell(i + 1).value) })
      if (Object.values(obj).some(v => v !== '' && v !== null)) rows.push(obj)
    })
    return rows
  } catch {
    throw new Error('kunde inte läsa filen')
  }
}

async function getOrgId(): Promise<string> {
  const res = await fetchWithAuth(`${API_URL}api/v1/organisation`)
  if (!res.ok) throw new Error(`organisation http ${res.status}`)
  const json = await res.json()
  const orgId = json?.data?.id
  if (!orgId) throw new Error('organisation orgid missing')
  return String(orgId)
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const json = await res.json()
    const raw = json?.error?.message ?? json?.message ?? ''
    if (raw) return toSwedishError(raw)
  } catch { /* ignore */ }
  return `Något gick fel. Försök igen.`
}

function toSwedishError(msg: string): string {
  const r = msg.toLowerCase()
  if (/unauthorized|401/.test(r)) return 'Du är inte inloggad. Logga in och försök igen.'
  if (/forbidden|403/.test(r))    return 'Du saknar behörighet att utföra denna åtgärd.'
  if (/not found|404/.test(r))    return 'Resursen hittades inte. Kontakta support om felet kvarstår.'
  if (/timeout|etimedout/.test(r)) return 'Anslutningen tog för lång tid. Kontrollera din internetanslutning.'
  if (/network|fetch/.test(r))    return 'Nätverksfel. Kontrollera din internetanslutning och försök igen.'
  if (/session/.test(r))          return 'Din session är ogiltig. Logga in på nytt.'
  if (/datum|date/.test(r))       return 'Vi kunde inte hitta datumkolumnen. Kontrollera att filen innehåller en kolumn med datum.'
  if (/belopp|amount/.test(r))    return 'Vi kunde inte hitta beloppkolumnen. Kontrollera att filen innehåller en kolumn med belopp.'
  if (/invalid.*file|file.*invalid/.test(r)) return 'Filen verkar ha fel format. Kontrollera att det är en giltig CSV- eller Excel-fil.'
  return 'Vi kunde inte importera filen. Kontrollera att den innehåller kolumner för datum och belopp.'
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fmtDateLong(d: string): string {
  if (!d) return ''
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })
}

function frequencyLabel(freq: string): string {
  switch ((freq || '').toUpperCase()) {
    case 'WEEKLY':    return 'per vecka'
    case 'QUARTERLY': return 'per kvartal'
    case 'YEARLY':
    case 'ANNUAL':    return 'per år'
    default:          return 'per månad'
  }
}

// ── Step config (separate-files path) ────────────────────────────────────────
const STEP_LABELS = ['Bankdata', 'Fakturor', 'Fasta kostnader', 'Betalningsvillkor']

const STEP_TITLES = [
  'Ladda upp din bankfil',
  'Ladda upp dina fakturor',
  'Vad betalar du varje månad?',
  'Hur fakturerar du dina kunder?',
]

const STEP_HINTS = [
  'Tips: Du hittar din bankfil i nätbankens exportfunktion. Välj CSV eller Excel-format och exportera de senaste 3 till 12 månaderna.',
  'Tips: Exportera fakturalistan från ditt faktureringsprogram (t.ex. Fortnox eller Visma). Se till att filen visar förfallodatum och betald/obetald-status.',
  'Ange ungefärliga månadsbelopp. Det behöver inte vara exakt. Du kan alltid ändra detta senare.',
  'Standardvärdet är 30 dagar. Du kan ändra detta senare i inställningarna.',
]

// ── Main component ──────────────────────────────────────────────────────────
export default function Onboarding() {
  const navigate  = useNavigate()
  const { formatAmount: fmt } = useCurrency()

  // Path selection
  const [path, setPath]                 = useState<'choose' | 'easy' | 'separate'>('choose')
  const [selectedPath, setSelectedPath] = useState<'easy' | 'separate'>('easy')

  // Shared busy / feedback
  const [stepLoading, setStepLoading]   = useState(false)
  const [stepError, setStepError]       = useState('')
  const [stepSuccess, setStepSuccess]   = useState('')
  const [progressLabel, setProgressLabel] = useState('')

  // Shared completion
  const [completedAll, setCompletedAll]         = useState(false)
  const [aiSummary, setAiSummary]               = useState<string | null>(null)
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false)
  const [anomalies, setAnomalies]               = useState<Anomaly[]>([])
  const [anomaliesLoading, setAnomaliesLoading] = useState(false)
  const anomalyAbortRef                         = useRef<AbortController | null>(null)

  // Separate-path step machine
  const [step, setStep]                     = useState(0)
  const [completedSteps, setCompletedSteps] = useState<boolean[]>([false, false, false, false])
  const [bankUploaded, setBankUploaded]     = useState(false)
  const [invoiceUploaded, setInvoiceUploaded] = useState(false)
  const [bankSessionId, setBankSessionId]   = useState<string | null>(null)

  // Bank / single-file state (reused as the single file on the easy path)
  const [bankFile, setBankFile]                   = useState<File | null>(null)
  const [bankTotalRows, setBankTotalRows]         = useState(0)
  const [bankPreviewHeaders, setBankPreviewHeaders] = useState<string[]>([])
  const [bankPreviewRows, setBankPreviewRows]     = useState<Record<string, unknown>[]>([])
  const [bankDetectedDate, setBankDetectedDate]   = useState<string | null>(null)
  const [bankDetectedAmount, setBankDetectedAmount] = useState<string | null>(null)
  const [bankDetectedCategory, setBankDetectedCategory] = useState<string | null>(null)
  const [bankMappedDate, setBankMappedDate]       = useState('')
  const [bankMappedAmount, setBankMappedAmount]   = useState('')
  const [bankMappedCategory, setBankMappedCategory] = useState('')
  const bankRef = useRef<HTMLInputElement>(null)

  // Invoice file state
  const [invoiceFile, setInvoiceFile]                 = useState<File | null>(null)
  const [invoiceTotalRows, setInvoiceTotalRows]       = useState(0)
  const [invoicePreviewHeaders, setInvoicePreviewHeaders] = useState<string[]>([])
  const [invoicePreviewRows, setInvoicePreviewRows]   = useState<Record<string, unknown>[]>([])
  const [invoiceDetectedDate, setInvoiceDetectedDate] = useState<string | null>(null)
  const [invoiceDetectedAmount, setInvoiceDetectedAmount] = useState<string | null>(null)
  const [invoiceMappedDate, setInvoiceMappedDate]     = useState('')
  const [invoiceMappedAmount, setInvoiceMappedAmount] = useState('')
  const invoiceRef = useRef<HTMLInputElement>(null)

  // Fixed costs + payment terms
  const [costs, setCosts]             = useState({ rent: '', staff: '', leasing: '', other: '' })
  const [paymentDays, setPaymentDays] = useState('30')
  const [paymentType, setPaymentType] = useState('Per projekt')

  // Easy path
  const [easyStage, setEasyStage]       = useState<'upload' | 'review' | 'payment'>('upload')
  const [easySessionId, setEasySessionId] = useState<string | null>(null)
  const [analysis, setAnalysis]         = useState<ContentAnalysis | null>(null)
  const [detectedCosts, setDetectedCosts] = useState<DetectedCost[]>([])
  const [costSelected, setCostSelected] = useState<boolean[]>([])

  // ── File handlers ──────────────────────────────────────────────────────
  const handleBankFile = (file: File) => {
    setBankFile(file)
    setBankTotalRows(0); setBankPreviewHeaders([]); setBankPreviewRows([])
    setBankDetectedDate(null); setBankDetectedAmount(null); setBankDetectedCategory(null)
    setBankMappedDate(''); setBankMappedAmount(''); setBankMappedCategory('')
    readFileAsRows(file).then(rows => {
      setBankTotalRows(rows.length)
      if (rows.length > 0) {
        const headers  = Object.keys(rows[0])
        const date     = detectColumn(headers, DATE_HINTS)
        const amount   = detectColumn(headers, AMOUNT_HINTS)
        const category = detectColumn(headers, CATEGORY_HINTS)
        setBankPreviewHeaders(headers)
        setBankPreviewRows(rows.slice(0, 5))
        setBankDetectedDate(date); setBankDetectedAmount(amount); setBankDetectedCategory(category)
        setBankMappedDate(date ?? ''); setBankMappedAmount(amount ?? ''); setBankMappedCategory(category ?? '')
      }
    }).catch(() => {})
  }

  const handleInvoiceFile = (file: File) => {
    setInvoiceFile(file)
    setInvoiceTotalRows(0); setInvoicePreviewHeaders([]); setInvoicePreviewRows([])
    setInvoiceDetectedDate(null); setInvoiceDetectedAmount(null)
    setInvoiceMappedDate(''); setInvoiceMappedAmount('')
    readFileAsRows(file).then(rows => {
      setInvoiceTotalRows(rows.length)
      if (rows.length > 0) {
        const headers = Object.keys(rows[0])
        const date    = detectColumn(headers, DATE_HINTS)
        const amount  = detectColumn(headers, AMOUNT_HINTS)
        setInvoicePreviewHeaders(headers)
        setInvoicePreviewRows(rows.slice(0, 5))
        setInvoiceDetectedDate(date); setInvoiceDetectedAmount(amount)
        setInvoiceMappedDate(date ?? ''); setInvoiceMappedAmount(amount ?? '')
      }
    }).catch(() => {})
  }

  // ── Import primitives ──────────────────────────────────────────────────
  // Upload + validate, no commit. Returns sessionId.
  const runUploadValidate = async (file: File, columnMapping: Record<string, string>): Promise<string> => {
    setProgressLabel('Läser fil…')
    const rows = await readFileAsRows(file)
    const orgId = await getOrgId()
    const fileType = file.name.toLowerCase().endsWith('.csv') ? 'CSV' : 'XLSX'

    setProgressLabel('Laddar upp…')
    const uploadRes = await fetchWithAuth(`${API_URL}api/v1/data-import/upload`, {
      method: 'POST',
      body: JSON.stringify({ orgId, fileName: file.name, fileType, rows, columnMapping }),
    })
    if (!uploadRes.ok) throw new Error(await parseErrorMessage(uploadRes))
    const sId = (await uploadRes.json())?.data?.sessionId
    if (!sId) throw new Error('session')

    setProgressLabel('Analyserar…')
    const validateRes = await fetchWithAuth(`${API_URL}api/v1/data-import/${sId}/validate`, { method: 'POST' })
    if (!validateRes.ok) throw new Error(await parseErrorMessage(validateRes))
    return sId
  }

  const commitSession = async (sId: string) => {
    setProgressLabel('Sparar…')
    const res = await fetchWithAuth(`${API_URL}api/v1/data-import/${sId}/commit`, { method: 'POST' })
    if (!res.ok) throw new Error(await parseErrorMessage(res))
  }

  // Full flow used by the separate-files path.
  const runImportFlow = async (file: File, columnMapping: Record<string, string>): Promise<string> => {
    const sId = await runUploadValidate(file, columnMapping)
    await commitSession(sId)
    return sId
  }

  // Easy path: read the content summary + detected fixed costs.
  // Exact backend contract — no alternative-key guessing, only null-guards.
  const analyzeContentCall = async (sId: string) => {
    setProgressLabel('Läser igenom din data…')
    const res = await fetchWithAuth(`${API_URL}api/v1/data-import/${sId}/analyze-content`, { method: 'POST' })
    if (!res.ok) throw new Error(await parseErrorMessage(res))
    const d = await res.json()
    const parsed: DetectedCost[] = (Array.isArray(d?.detectedFixedCosts) ? d.detectedFixedCosts : []).map((c: {
      category?: string; amount?: number; frequency?: string; occurrences?: number; confidence?: number
    }) => ({
      category: c.category ?? '',
      amount: Number(c.amount ?? 0),
      frequency: c.frequency ?? '',
      occurrences: Number(c.occurrences ?? 0),
      confidence: Number(c.confidence ?? 0),
    }))
    setAnalysis({
      transactionCount: Number(d?.transactionCount ?? 0),
      fromDate: d?.dateRange?.from ?? '',
      toDate: d?.dateRange?.to ?? '',
      detectedInvoices: Number(d?.detectedInvoices ?? 0),
    })
    setDetectedCosts(parsed)
    setCostSelected(parsed.map(() => true))
  }

  const applyDetected = async (sId: string, selected: DetectedCost[]) => {
    const res = await fetchWithAuth(`${API_URL}api/v1/data-import/${sId}/apply-detected`, {
      method: 'POST',
      body: JSON.stringify({ fixedCosts: selected.map(c => ({ category: c.category, amount: c.amount, frequency: c.frequency })) }),
    })
    if (!res.ok) throw new Error(await parseErrorMessage(res))
  }

  const savePaymentTerms = async () => {
    const terms = [
      { type: 'CUSTOMER', name: 'Standardvillkor kund',       daysUntilDue: Number(paymentDays) || 30, customerName: 'Standard' },
      { type: 'SUPPLIER', name: 'Standardvillkor leverantör', daysUntilDue: Number(paymentDays) || 30, supplierName: 'Standard' },
    ]
    for (const term of terms) {
      const res = await fetchWithAuth(`${API_URL}api/v1/data-import/payment-terms`, {
        method: 'POST',
        body: JSON.stringify(term),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
    }
  }

  // ── Small helpers ──────────────────────────────────────────────────────
  const markComplete = (i: number) => setCompletedSteps(prev => { const n = [...prev]; n[i] = true; return n })
  const goBack       = () => { setStepError(''); setStepSuccess(''); setProgressLabel(''); setStep(s => Math.max(0, s - 1)) }
  const advanceAfter = (msg: string, next: number) => {
    setStepSuccess(msg)
    setTimeout(() => { setStepSuccess(''); setStep(next) }, 1500)
  }
  const run = (fn: () => Promise<void>) => {
    setStepLoading(true); setStepError(''); setStepSuccess('')
    fn()
      .catch(err => setStepError(toSwedishError(err instanceof Error ? err.message : 'okänt fel')))
      .finally(() => { setStepLoading(false); setProgressLabel('') })
  }

  // ── Completion: kick off anomaly / AI summary polling ──────────────────
  const finalize = (sessionId: string | null, txCount: number) => {
    setCompletedAll(true)

    const controller = new AbortController()
    anomalyAbortRef.current?.abort()
    anomalyAbortRef.current = controller
    const { signal } = controller

    setAnomaliesLoading(true); setAnomalies([]); setAiSummary(null)

    const sleep = (ms: number) => new Promise<void>(res => {
      const t = setTimeout(res, ms)
      signal.addEventListener('abort', () => { clearTimeout(t); res() }, { once: true })
    })

    const startPolling = async () => {
      const MAX_MS = 15_000
      const start = Date.now()
      let foundAnomalies = false

      if (sessionId) {
        while (!signal.aborted && Date.now() - start < MAX_MS) {
          try {
            const res = await fetchWithAuth(`${API_URL}api/v1/data-import/${sessionId}/anomalies`)
            if (!signal.aborted && res.ok) {
              const json = await res.json()
              const data = json?.data ?? json
              const count: number = data?.count ?? 0
              const summary: string | undefined = data?.aiSummary || undefined
              const items: Anomaly[] = Array.isArray(data?.anomalies) ? data.anomalies : []
              if (count > 0 || summary) {
                if (items.length > 0) { setAnomalies(items); foundAnomalies = true }
                if (summary) { setAnomaliesLoading(false); setAiSummary(summary); return }
                break
              }
            }
          } catch { /* keep polling */ }
          if (Date.now() - start + 2_000 >= MAX_MS) break
          await sleep(2_000)
        }
      }

      if (signal.aborted) return
      setAnomaliesLoading(false)
      void foundAnomalies

      setAiSummaryLoading(true)
      fetchWithAuth(`${API_URL}api/v1/ai/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: 'general',
          question: `Jag importerade just ${txCount} transaktioner. Sammanfatta kort vad datan visar och om något sticker ut.`,
        }),
      })
        .then(r => r.json())
        .then(json => {
          if (signal.aborted) return
          const answer = json?.data?.answer ?? json?.answer ?? ''
          if (answer) setAiSummary(answer)
        })
        .catch(() => {})
        .finally(() => { if (!signal.aborted) setAiSummaryLoading(false) })
    }

    void startPolling()
  }

  // ── Easy-path handlers ─────────────────────────────────────────────────
  const analyzeEasy = () => run(async () => {
    if (!bankFile) throw new Error('Välj en fil innan du fortsätter.')
    if (!bankMappedDate || !bankMappedAmount) throw new Error('Välj vilka kolumner som är datum och belopp innan du fortsätter.')
    const mapping: Record<string, string> = { date: bankMappedDate, amount: bankMappedAmount }
    if (bankMappedCategory) mapping.category = bankMappedCategory
    const sId = await runUploadValidate(bankFile, mapping)
    setEasySessionId(sId)
    await analyzeContentCall(sId)
    setEasyStage('review')
  })

  const confirmEasy = () => run(async () => {
    if (!easySessionId) throw new Error('Din session är ogiltig. Logga in på nytt.')
    await commitSession(easySessionId)
    const selected = detectedCosts.filter((_, i) => costSelected[i])
    if (selected.length > 0) await applyDetected(easySessionId, selected)
    setEasyStage('payment')
  })

  const finishEasy = (savePayment: boolean) => run(async () => {
    if (savePayment) await savePaymentTerms()
    finalize(easySessionId, analysis?.transactionCount ?? bankTotalRows)
  })

  // ── Separate-path handlers ─────────────────────────────────────────────
  const saveStep1 = () => run(async () => {
    if (!bankFile) throw new Error('Välj en fil innan du fortsätter.')
    if (!bankMappedDate || !bankMappedAmount) throw new Error('Välj vilka kolumner som är datum och belopp innan du fortsätter.')
    const mapping: Record<string, string> = { date: bankMappedDate, amount: bankMappedAmount }
    if (bankMappedCategory) mapping.category = bankMappedCategory
    const sId = await runImportFlow(bankFile, mapping)
    setBankSessionId(sId); setBankUploaded(true); markComplete(0)
    advanceAfter(`Bankfilen importerad: ${bankTotalRows} rader uppladdade.`, 1)
  })

  const saveStep2 = () => run(async () => {
    if (!invoiceFile) throw new Error('Välj en fil innan du fortsätter.')
    if (!invoiceMappedDate || !invoiceMappedAmount) throw new Error('Välj vilka kolumner som är datum och belopp innan du fortsätter.')
    const mapping: Record<string, string> = { date: invoiceMappedDate, amount: invoiceMappedAmount }
    await runImportFlow(invoiceFile, mapping)
    setInvoiceUploaded(true); markComplete(1)
    advanceAfter(`Fakturor importerade: ${invoiceTotalRows} rader uppladdade.`, 2)
  })

  const saveStep3 = () => run(async () => {
    const entries = [
      { name: 'Hyra',          amount: Number(costs.rent) },
      { name: 'Personal',      amount: Number(costs.staff) },
      { name: 'Leasing / Lån', amount: Number(costs.leasing) },
      { name: 'Övrigt',        amount: Number(costs.other) },
    ].filter(e => e.amount > 0)
    for (const entry of entries) {
      const res = await fetchWithAuth(`${API_URL}api/v1/data-import/fixed-costs`, {
        method: 'POST',
        body: JSON.stringify({ name: entry.name, amount: entry.amount, frequency: 'MONTHLY' }),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
    }
    markComplete(2)
    advanceAfter('Fasta kostnader sparade.', 3)
  })

  const saveStep4 = () => run(async () => {
    await savePaymentTerms()
    markComplete(3)
    finalize(bankSessionId, bankTotalRows + invoiceTotalRows)
  })

  const separateHandlers = [saveStep1, saveStep2, saveStep3, saveStep4]
  const saveLabels       = ['Fortsätt', 'Fortsätt', 'Fortsätt', 'Skapa diagnos']

  // Skip: optional steps. Leaving the invoices step requires transactions.
  const skipStep = () => {
    setStepError(''); setStepSuccess('')
    if (step === 1 && !bankUploaded && !invoiceUploaded) {
      setStepError('Du behöver ladda upp minst en fil med transaktioner, bankdata eller fakturor, för att fortsätta.')
      return
    }
    if (step < 3) setStep(step + 1)
    else finalize(bankSessionId, bankTotalRows + invoiceTotalRows)
  }

  const progressPct = ((step + (completedSteps[step] ? 1 : 0)) / STEP_LABELS.length) * 100
  const selectedCostCount = costSelected.filter(Boolean).length

  // ── Completion screen ──────────────────────────────────────────────────
  if (completedAll) {
    return (
      <div className="min-h-screen font-sans">
        <div className="bg-white border-b border-ink-200 px-8 py-4 flex items-center justify-between">
          <span className="font-semibold text-ink-900 tracking-tight">RW Systems</span>
          <span className="text-sm text-positive-600 font-medium">Klar!</span>
        </div>
        <div className="max-w-xl mx-auto px-4 py-16">
          <div className="text-center mb-8 animate-in">
            <div className="w-16 h-16 bg-positive-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-positive-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-3xl text-ink-900 mb-2">Allt är klart!</h1>
            <p className="text-ink-500">Din data är uppladdad och redo att analyseras.</p>
          </div>

          {anomaliesLoading && (
            <div className="glass rounded-2xl px-6 py-5 mb-4 flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-brand-400 shrink-0 animate-pulse" aria-hidden="true" />
              <p className="text-sm text-ink-500 italic">AI:n letar efter avvikelser i din data...</p>
            </div>
          )}
          {!anomaliesLoading && aiSummaryLoading && (
            <div className="glass rounded-2xl px-6 py-5 mb-4 flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-brand-400 shrink-0 animate-pulse" aria-hidden="true" />
              <p className="text-sm text-ink-500 italic">AI:n tittar på din nya data...</p>
            </div>
          )}
          {!anomaliesLoading && !aiSummaryLoading && aiSummary && (
            <div className="glass rounded-2xl px-6 py-5 mb-4 animate-in">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-brand-500 shrink-0" aria-hidden="true" />
                <p className="text-sm font-semibold text-ink-700">AI:ns första intryck</p>
              </div>
              <p className="text-sm text-ink-600 leading-relaxed">{aiSummary}</p>
            </div>
          )}
          {anomalies.length > 0 && (
            <div className="space-y-2 mb-6 stagger-in">
              {anomalies.map((a, i) => <AnomalyCard key={i} anomaly={a} fmt={fmt} />)}
            </div>
          )}

          <div className="text-center">
            <button
              onClick={() => navigate('/dashboard')}
              className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 active:scale-[0.98] transition-[transform,background-color] duration-150 shadow-sm"
            >
              Fortsätt till dashboard →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Path choice ────────────────────────────────────────────────────────
  if (path === 'choose') {
    return (
      <div className="min-h-screen font-sans">
        <div className="bg-white border-b border-ink-200 px-8 py-4 flex items-center justify-between">
          <span onClick={() => navigate('/dashboard')} className="font-semibold text-ink-900 cursor-pointer select-none tracking-tight">RW Systems</span>
        </div>
        <div className="max-w-xl mx-auto px-4 py-14">
          <div className="text-center mb-8 animate-in">
            <h1 className="text-4xl text-ink-900 mb-2">Välkommen till RW Systems</h1>
            <p className="text-ink-500 text-base">Hur ser din data ut? Välj det som passar dig bäst.</p>
          </div>

          <div className="flex flex-col gap-3">
            <PathOption
              selected={selectedPath === 'easy'}
              onSelect={() => setSelectedPath('easy')}
              large
              icon={<FileSpreadsheet className="w-6 h-6" />}
              title="Jag har en fil med alla mina siffror"
              badge="Rekommenderat"
              hint="Ladda upp en enda fil så hittar vi automatiskt transaktioner, fakturor och återkommande kostnader åt dig."
            />
            <PathOption
              selected={selectedPath === 'separate'}
              onSelect={() => setSelectedPath('separate')}
              icon={<Files className="w-5 h-5" />}
              title="Jag har separata filer"
              hint="Ladda upp bankdata, fakturor och kostnader var för sig, steg för steg."
            />
          </div>

          <button
            onClick={() => { setStepError(''); setPath(selectedPath); if (selectedPath === 'separate') setStep(0) }}
            className="mt-8 w-full inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-3 rounded-xl active:scale-[0.98] transition-[transform,background-color] duration-150 shadow-sm"
          >
            Fortsätt →
          </button>
        </div>
      </div>
    )
  }

  // ── Main shell (easy + separate) ───────────────────────────────────────
  return (
    <div className="min-h-screen font-sans">
      <div className="bg-white border-b border-ink-200 px-8 py-4 flex items-center justify-between">
        <span onClick={() => navigate('/dashboard')} className="font-semibold text-ink-900 cursor-pointer select-none tracking-tight">RW Systems</span>
        {path === 'separate'
          ? <span className="text-sm text-ink-400">Steg {step + 1} av {STEP_LABELS.length}</span>
          : <button onClick={() => { setPath('choose'); setEasyStage('upload') }} className="text-sm text-ink-400 hover:text-ink-700 transition-colors">Byt sätt</button>}
      </div>

      <div className="max-w-xl mx-auto px-4 py-10">

        {/* ══════════════ EASY PATH ══════════════ */}
        {path === 'easy' && (
          <>
            <div className="text-center mb-8 animate-in">
              <h1 className="text-4xl text-ink-900 mb-2">Ladda upp din fil</h1>
              <p className="text-ink-500 text-base">En fil räcker. Vi läser igenom den och sammanfattar vad vi hittar.</p>
            </div>

            <div className="bg-white border border-ink-200 rounded-2xl shadow-sm p-8 animate-in">
              {/* Upload + column detection */}
              {easyStage === 'upload' && (
                <>
                  <UploadZone file={bankFile} inputRef={bankRef} onFile={handleBankFile} />
                  {bankPreviewRows.length > 0 && (
                    <div className="mt-5 space-y-4">
                      <p className="text-sm font-semibold text-ink-700">
                        Ser detta rätt ut?{' '}
                        <span className="font-normal text-ink-400">{bankTotalRows} rader hittade, visar 5 nedan</span>
                      </p>
                      <PreviewTable headers={bankPreviewHeaders} rows={bankPreviewRows} />
                      <div className="glass rounded-xl p-4">
                        <p className="text-xs font-bold text-ink-500 uppercase tracking-widest mb-3">Vi hittade</p>
                        <div className="space-y-3">
                          <ColumnRow label="Datum"  detected={bankDetectedDate}   mapped={bankMappedDate}   headers={bankPreviewHeaders} onMap={setBankMappedDate} />
                          <ColumnRow label="Belopp" detected={bankDetectedAmount} mapped={bankMappedAmount} headers={bankPreviewHeaders} onMap={setBankMappedAmount} />
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Review: summary + recurring costs */}
              {easyStage === 'review' && analysis && (
                <div className="space-y-6">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-positive-50 flex items-center justify-center shrink-0">
                      <Check className="w-5 h-5 text-positive-600" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-base font-semibold text-ink-900">
                        Vi hittade {analysis.transactionCount.toLocaleString('sv-SE')} transaktioner
                        {analysis.fromDate && analysis.toDate ? ` mellan ${fmtDateLong(analysis.fromDate)} och ${fmtDateLong(analysis.toDate)}` : ''}.
                      </p>
                      {analysis.detectedInvoices > 0 && (
                        <p className="text-sm text-ink-500 mt-1">Varav {analysis.detectedInvoices.toLocaleString('sv-SE')} ser ut att vara fakturor.</p>
                      )}
                    </div>
                  </div>

                  {detectedCosts.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold text-ink-800 mb-1">Vi hittade dessa återkommande kostnader. Stämmer det?</p>
                      <p className="text-xs text-ink-400 mb-3">Avmarkera det som inte ska läggas till.</p>
                      <div className="glass rounded-xl divide-y divide-ink-100/70">
                        {detectedCosts.map((c, i) => (
                          <label key={i} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/40 transition-colors">
                            <input
                              type="checkbox"
                              checked={costSelected[i] ?? false}
                              onChange={() => setCostSelected(prev => { const n = [...prev]; n[i] = !n[i]; return n })}
                              className="w-4 h-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500/40 shrink-0"
                            />
                            <span className="text-sm font-medium text-ink-800 flex-1">{c.category}</span>
                            <span className="text-sm text-ink-600 tabular whitespace-nowrap">{fmt(c.amount)} {frequencyLabel(c.frequency)}</span>
                          </label>
                        ))}
                      </div>
                      <p className="text-xs text-ink-400 mt-2">{selectedCostCount} av {detectedCosts.length} kommer att läggas till.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Optional payment terms */}
              {easyStage === 'payment' && (
                <PaymentTermsFields
                  days={paymentDays} onDays={setPaymentDays}
                  type={paymentType} onType={setPaymentType}
                />
              )}

              {stepSuccess && <SuccessBanner msg={stepSuccess} />}
              {stepError && <ErrorBanner msg={stepError} />}

              {/* Footer */}
              <div className="mt-8 flex items-center justify-between gap-3">
                <button onClick={() => { setPath('choose'); setEasyStage('upload') }} className="text-sm text-ink-400 hover:text-ink-700 transition-colors">Tillbaka</button>
                {easyStage === 'upload' && (
                  <PrimaryButton loading={stepLoading} label="Analysera min fil" progress={progressLabel} onClick={analyzeEasy} />
                )}
                {easyStage === 'review' && (
                  <PrimaryButton loading={stepLoading} label={detectedCosts.length > 0 ? 'Bekräfta och fortsätt' : 'Fortsätt'} progress={progressLabel} onClick={confirmEasy} />
                )}
                {easyStage === 'payment' && (
                  <div className="flex items-center gap-3">
                    <button onClick={() => finishEasy(false)} disabled={stepLoading} className="text-sm font-medium text-ink-500 hover:text-ink-800 transition-colors disabled:opacity-50">Hoppa över</button>
                    <PrimaryButton loading={stepLoading} label="Spara och slutför" progress={progressLabel} onClick={() => finishEasy(true)} />
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ══════════════ SEPARATE PATH ══════════════ */}
        {path === 'separate' && (
          <>
            <div className="text-center mb-8">
              <h1 className="text-4xl text-ink-900 mb-2">Kom igång steg för steg</h1>
              <p className="text-ink-500 text-base">Ladda upp det du har. Alla steg utom transaktioner är valfria.</p>
            </div>

            {/* Step dots */}
            <div className="flex items-start mb-4">
              {STEP_LABELS.map((label, i) => (
                <div key={label} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-1.5">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-[transform,box-shadow,background-color,border-color,color,opacity]
                      ${completedSteps[i] ? 'bg-positive-500 border-positive-500' : i === step ? 'bg-brand-900 border-brand-900' : 'bg-white border-ink-300'}`}>
                      {completedSteps[i]
                        ? <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        : <span className={`text-xs font-semibold ${i === step ? 'text-white' : 'text-ink-400'}`}>{i + 1}</span>}
                    </div>
                    <span className={`text-[11px] font-medium whitespace-nowrap text-center leading-tight ${i === step ? 'text-ink-900' : completedSteps[i] ? 'text-positive-600' : 'text-ink-400'}`}>{label}</span>
                  </div>
                  {i < STEP_LABELS.length - 1 && <div className={`flex-1 h-px mx-2 mb-5 transition-colors ${completedSteps[i] ? 'bg-positive-400' : 'bg-ink-200'}`} />}
                </div>
              ))}
            </div>

            <div className="w-full bg-ink-200 rounded-full h-1.5 mb-8">
              <div className="bg-brand-600 h-1.5 rounded-full transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]" style={{ width: `${progressPct}%` }} />
            </div>

            <div className="bg-white border border-ink-200 rounded-2xl shadow-sm p-8">
              <h2 className="text-2xl text-ink-900 mb-1">{STEP_TITLES[step]}</h2>

              <div className="flex gap-2.5 items-start bg-ink-50 border border-ink-100 rounded-xl px-4 py-3 mb-6 mt-3">
                <svg className="w-4 h-4 text-ink-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <p className="text-sm text-ink-500 leading-relaxed">{STEP_HINTS[step]}</p>
              </div>

              {/* Step 1: bank */}
              {step === 0 && (
                <>
                  <UploadZone file={bankFile} inputRef={bankRef} onFile={handleBankFile} />
                  {bankPreviewRows.length > 0 && (
                    <div className="mt-5 space-y-4">
                      <p className="text-sm font-semibold text-ink-700">Ser detta rätt ut?{' '}<span className="font-normal text-ink-400">{bankTotalRows} rader hittade, visar 5 nedan</span></p>
                      <PreviewTable headers={bankPreviewHeaders} rows={bankPreviewRows} />
                      <div className="glass rounded-xl p-4">
                        <p className="text-xs font-bold text-ink-500 uppercase tracking-widest mb-3">Vi hittade</p>
                        <div className="space-y-3">
                          <ColumnRow label="Datum"  detected={bankDetectedDate}   mapped={bankMappedDate}   headers={bankPreviewHeaders} onMap={setBankMappedDate} />
                          <ColumnRow label="Belopp" detected={bankDetectedAmount} mapped={bankMappedAmount} headers={bankPreviewHeaders} onMap={setBankMappedAmount} />
                          <div className="flex items-center gap-3">
                            {bankDetectedCategory
                              ? <><span className="flex items-center gap-1.5 text-sm text-positive-700 font-medium min-w-[80px]"><span>✓</span> Kategori</span><span className="text-sm text-ink-400 bg-ink-50 px-2 py-0.5 rounded font-mono">{bankDetectedCategory}</span></>
                              : <span className="text-sm text-ink-400"><span className="text-ink-300 mr-1">✗</span> Kategori saknas (valfritt)</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Step 2: invoices */}
              {step === 1 && (
                <>
                  <UploadZone file={invoiceFile} inputRef={invoiceRef} onFile={handleInvoiceFile} />
                  {invoicePreviewRows.length > 0 && (
                    <div className="mt-5 space-y-4">
                      <p className="text-sm font-semibold text-ink-700">Ser detta rätt ut?{' '}<span className="font-normal text-ink-400">{invoiceTotalRows} rader hittade, visar 5 nedan</span></p>
                      <PreviewTable headers={invoicePreviewHeaders} rows={invoicePreviewRows} />
                      <div className="glass rounded-xl p-4">
                        <p className="text-xs font-bold text-ink-500 uppercase tracking-widest mb-3">Vi hittade</p>
                        <div className="space-y-3">
                          <ColumnRow label="Datum"  detected={invoiceDetectedDate}   mapped={invoiceMappedDate}   headers={invoicePreviewHeaders} onMap={setInvoiceMappedDate} />
                          <ColumnRow label="Belopp" detected={invoiceDetectedAmount} mapped={invoiceMappedAmount} headers={invoicePreviewHeaders} onMap={setInvoiceMappedAmount} />
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Step 3: fixed costs */}
              {step === 2 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <CostField label="Hyra"          value={costs.rent}    onChange={v => setCosts({ ...costs, rent: v })} />
                  <CostField label="Personal"      value={costs.staff}   onChange={v => setCosts({ ...costs, staff: v })} />
                  <CostField label="Leasing / Lån" value={costs.leasing} onChange={v => setCosts({ ...costs, leasing: v })} />
                  <CostField label="Övrigt"        value={costs.other}   onChange={v => setCosts({ ...costs, other: v })} />
                </div>
              )}

              {/* Step 4: payment terms */}
              {step === 3 && (
                <PaymentTermsFields days={paymentDays} onDays={setPaymentDays} type={paymentType} onType={setPaymentType} />
              )}

              {stepSuccess && <SuccessBanner msg={stepSuccess} />}
              {stepError && <ErrorBanner msg={stepError} />}

              {/* Footer */}
              <div className="mt-8 flex items-center justify-between gap-3">
                <div className="flex items-center gap-4 text-sm text-ink-400">
                  {step > 0 && <button onClick={goBack} className="hover:text-ink-700 transition-colors">Tillbaka</button>}
                  <button onClick={() => setPath('choose')} className="hover:text-ink-700 transition-colors">Börja om</button>
                </div>

                <div className="flex items-center gap-3">
                  <button onClick={skipStep} disabled={stepLoading} className="text-sm font-medium text-ink-500 hover:text-ink-800 transition-colors disabled:opacity-50">
                    {step === 3 ? 'Hoppa över' : 'Hoppa över'}
                  </button>
                  <PrimaryButton loading={stepLoading} label={saveLabels[step]} progress={progressLabel} onClick={separateHandlers[step]} />
                </div>
              </div>
            </div>

            <p className="mt-4 text-center text-xs text-ink-400">Du kan alltid komma tillbaka och uppdatera detta senare.</p>
          </>
        )}
      </div>
    </div>
  )
}

// ── Small presentational pieces ──────────────────────────────────────────────
function PrimaryButton({ loading, label, progress, onClick }: { loading: boolean; label: string; progress: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl active:scale-[0.98] transition-[transform,background-color] duration-150 disabled:opacity-50"
    >
      {loading
        ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />{progress || 'Sparar…'}</>
        : label}
    </button>
  )
}

function SuccessBanner({ msg }: { msg: string }) {
  return (
    <div className="mt-6 flex items-center gap-2.5 bg-positive-50 border border-positive-200 rounded-xl px-4 py-3">
      <svg className="w-4 h-4 text-positive-600 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
      <p className="text-sm text-positive-700 font-medium">{msg}</p>
    </div>
  )
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div className="mt-6 flex items-start gap-2.5 bg-negative-50 border border-negative-200 rounded-xl px-4 py-3">
      <svg className="w-4 h-4 text-negative-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      <div>
        <p className="text-sm font-semibold text-negative-700 mb-0.5">Något gick fel</p>
        <p className="text-sm text-negative-600">{msg}</p>
      </div>
    </div>
  )
}

function PathOption({ selected, onSelect, icon, title, hint, badge, large }: {
  selected: boolean; onSelect: () => void; icon: React.ReactNode; title: string; hint: string; badge?: string; large?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-left w-full rounded-2xl border transition-[transform,box-shadow,background-color,border-color] duration-150 flex items-start gap-4 ${large ? 'p-6' : 'p-4'}
        ${selected ? 'border-brand-500 bg-brand-50/60 shadow-sm ring-1 ring-brand-500/30' : 'border-ink-200 bg-white hover:border-brand-300'}`}
    >
      <div className={`rounded-xl flex items-center justify-center shrink-0 ${large ? 'w-12 h-12' : 'w-10 h-10'} ${selected ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500'}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-semibold text-ink-900 ${large ? 'text-lg' : 'text-base'}`}>{title}</span>
          {badge && <span className="text-[10px] font-bold uppercase tracking-wide bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">{badge}</span>}
        </div>
        <p className="text-sm text-ink-500 mt-1 leading-relaxed">{hint}</p>
      </div>
      <div className={`w-5 h-5 rounded-full border-2 shrink-0 mt-1 flex items-center justify-center ${selected ? 'border-brand-600 bg-brand-600' : 'border-ink-300'}`}>
        {selected && <span className="w-2 h-2 rounded-full bg-white" />}
      </div>
    </button>
  )
}

function PaymentTermsFields({ days, onDays, type, onType }: {
  days: string; onDays: (v: string) => void; type: string; onType: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className="block text-sm font-medium text-ink-700 mb-1.5">
          Hur många dagar brukar dina kunder ta på sig att betala?
          <span className="text-ink-400 font-normal ml-1 text-xs">(dagar)</span>
        </label>
        <input
          type="number"
          value={days}
          onChange={e => onDays(e.target.value)}
          className="w-full border border-ink-200 rounded-lg px-3.5 py-2.5 text-sm text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10"
        />
        <p className="text-xs text-ink-400 mt-1.5">Standardvärdet är 30 dagar. Du kan ändra detta senare i inställningarna.</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-ink-700 mb-1.5">Hur fakturerar du?</label>
        <select
          value={type}
          onChange={e => onType(e.target.value)}
          className="w-full border border-ink-200 rounded-lg px-3.5 py-2.5 text-sm text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 bg-white cursor-pointer"
        >
          <option>Per projekt</option>
          <option>Löpande</option>
          <option>Annat</option>
        </select>
      </div>
    </div>
  )
}

function PreviewTable({ headers, rows }: { headers: string[]; rows: Record<string, unknown>[] }) {
  return (
    <div className="glass rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50">
              {headers.map(h => <th key={h} className="text-left px-3 py-2 font-semibold text-ink-500 whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={`${i !== 0 ? 'border-t border-ink-50' : ''} ${i % 2 === 1 ? 'bg-white/20' : ''}`}>
                {headers.map(h => <td key={h} className="px-3 py-2 text-ink-600 whitespace-nowrap max-w-[140px] truncate">{String(row[h] ?? '')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Anomaly card ────────────────────────────────────────────────────────────
const ANOMALY_CONFIG = {
  critical: { border: 'border-l-negative-500', iconBg: 'bg-negative-50', iconColor: 'text-negative-600', Icon: AlertTriangle },
  warning:  { border: 'border-l-caution-500',  iconBg: 'bg-caution-50',  iconColor: 'text-caution-600',  Icon: AlertCircle   },
  info:     { border: 'border-l-brand-500',    iconBg: 'bg-brand-50',    iconColor: 'text-brand-500',    Icon: Info          },
} as const

function AnomalyCard({ anomaly, fmt }: { anomaly: Anomaly; fmt: (n: number) => string }) {
  const c = ANOMALY_CONFIG[anomaly.severity]
  return (
    <div className={`glass border-l-[3px] ${c.border} rounded-xl px-4 py-3.5 flex gap-3 items-start`}>
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${c.iconBg}`}>
        <c.Icon className={`w-3.5 h-3.5 ${c.iconColor}`} aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink-800">{anomaly.title}</p>
        <p className="text-xs text-ink-500 mt-0.5 leading-relaxed">{anomaly.description}</p>
        {anomaly.affectedAmount !== undefined && (
          <p className="text-xs font-medium text-ink-600 mt-1">Belopp: {fmt(anomaly.affectedAmount)}</p>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────
function UploadZone({ file, inputRef, onFile }: {
  file: File | null
  inputRef: React.RefObject<HTMLInputElement | null>
  onFile: (f: File) => void
}) {
  const [dragging, setDragging] = useState(false)
  return (
    <div
      onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onClick={() => inputRef.current?.click()}
      className={`rounded-2xl border-2 border-dashed py-12 px-8 text-center cursor-pointer transition-colors select-none
        ${dragging ? 'border-brand-400 bg-brand-50' : file ? 'border-brand-300 bg-brand-50 hover:border-brand-400' : 'border-ink-300 bg-white hover:border-brand-400 hover:bg-brand-50/50'}`}
    >
      <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
      {file ? (
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 bg-brand-100 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          </div>
          <p className="text-sm font-semibold text-ink-900 mt-1">{file.name}</p>
          <p className="text-xs text-ink-400">{formatBytes(file.size)}, klicka för att byta fil</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 bg-ink-100 rounded-2xl flex items-center justify-center">
            <svg className="w-7 h-7 text-ink-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
          </div>
          <div>
            <p className="text-base font-semibold text-ink-700">Dra hit din fil eller klicka för att välja</p>
            <p className="text-sm text-ink-400 mt-0.5">Excel (.xlsx) eller CSV</p>
          </div>
        </div>
      )}
    </div>
  )
}

function ColumnRow({ label, detected, mapped, headers, onMap }: {
  label: string
  detected: string | null
  mapped: string
  headers: string[]
  onMap: (v: string) => void
}) {
  return (
    <div className="flex items-start gap-3">
      <span className={`flex items-center gap-1.5 text-sm font-medium min-w-[80px] shrink-0 ${detected ? 'text-positive-700' : 'text-negative-600'}`}>
        <span>{detected ? '✓' : '✗'}</span> {label}
      </span>
      {detected ? (
        <span className="text-sm text-ink-400 bg-ink-50 px-2 py-0.5 rounded font-mono">{detected}</span>
      ) : (
        <div className="flex-1">
          <p className="text-xs text-negative-600 mb-1">{label} hittades inte. Välj rätt kolumn:</p>
          <select value={mapped} onChange={e => onMap(e.target.value)} className="w-full text-sm border border-ink-200 rounded-lg px-3 py-1.5 text-ink-700 focus:outline-none focus:ring-2 focus:ring-brand-300 bg-white">
            <option value="">Välj kolumn</option>
            {headers.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>
      )}
    </div>
  )
}

function CostField({ label, value, onChange }: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink-700 mb-1.5">
        {label} <span className="text-ink-400 font-normal text-xs">kr / månad</span>
      </label>
      <input type="number" placeholder="0" value={value} onChange={e => onChange(e.target.value)} className="w-full border border-ink-200 rounded-lg px-3.5 py-2.5 text-sm text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10" />
    </div>
  )
}
