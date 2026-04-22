import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { fetchWithAuth } from '../utils/fetchWithAuth'

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

// ── Helpers ─────────────────────────────────────────────────────────────────
function readFileAsRows(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target?.result, { type: 'array' })
        resolve(XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]))
      } catch { reject(new Error('kunde inte läsa filen')) }
    }
    reader.onerror = () => reject(new Error('kunde inte läsa filen'))
    reader.readAsArrayBuffer(file)
  })
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

// ── Step config ─────────────────────────────────────────────────────────────
const STEP_LABELS = ['Bankdata', 'Fakturor', 'Fasta kostnader', 'Betalningsvillkor']

const STEP_TITLES = [
  'Ladda upp din bankfil',
  'Ladda upp dina fakturor',
  'Vad betalar du varje månad?',
  'Hur fakturerar du dina kunder?',
]

const STEP_HINTS = [
  'Tips: Du hittar din bankfil i nätbankens exportfunktion. Välj CSV eller Excel-format och exportera de senaste 3–12 månaderna.',
  'Tips: Exportera fakturalistan från ditt faktureringsprogram (t.ex. Fortnox eller Visma). Se till att filen visar förfallodatum och betald/obetald-status.',
  'Ange ungefärliga månadsbelopp — det behöver inte vara exakt. Du kan alltid ändra detta senare.',
  'Dessa inställningar används för att beräkna hur snabbt pengar flödar in och ut ur ditt företag.',
]

// ── Main component ──────────────────────────────────────────────────────────
export default function Onboarding() {
  const navigate  = useNavigate()
  const [step, setStep]                       = useState(0)
  const [completedSteps, setCompletedSteps]   = useState<boolean[]>([false, false, false, false])
  const [stepLoading, setStepLoading]         = useState(false)
  const [stepError, setStepError]             = useState('')
  const [stepSuccess, setStepSuccess]         = useState('')
  const [progressLabel, setProgressLabel]     = useState('')

  // ── Bank file state ────────────────────────────────────────────────────
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

  // ── Invoice file state ─────────────────────────────────────────────────
  const [invoiceFile, setInvoiceFile]                 = useState<File | null>(null)
  const [invoiceTotalRows, setInvoiceTotalRows]       = useState(0)
  const [invoicePreviewHeaders, setInvoicePreviewHeaders] = useState<string[]>([])
  const [invoicePreviewRows, setInvoicePreviewRows]   = useState<Record<string, unknown>[]>([])
  const [invoiceDetectedDate, setInvoiceDetectedDate] = useState<string | null>(null)
  const [invoiceDetectedAmount, setInvoiceDetectedAmount] = useState<string | null>(null)
  const [invoiceMappedDate, setInvoiceMappedDate]     = useState('')
  const [invoiceMappedAmount, setInvoiceMappedAmount] = useState('')
  const invoiceRef = useRef<HTMLInputElement>(null)

  // ── Step 3 & 4 state ───────────────────────────────────────────────────
  const [costs, setCosts]             = useState({ rent: '', staff: '', leasing: '', other: '' })
  const [paymentDays, setPaymentDays] = useState('30')
  const [paymentType, setPaymentType] = useState('Per projekt')

  // ── File handlers ──────────────────────────────────────────────────────
  const handleBankFile = (file: File) => {
    setBankFile(file)
    setBankTotalRows(0)
    setBankPreviewHeaders([])
    setBankPreviewRows([])
    setBankDetectedDate(null)
    setBankDetectedAmount(null)
    setBankDetectedCategory(null)
    setBankMappedDate('')
    setBankMappedAmount('')
    setBankMappedCategory('')
    readFileAsRows(file).then(rows => {
      setBankTotalRows(rows.length)
      if (rows.length > 0) {
        const headers  = Object.keys(rows[0])
        const date     = detectColumn(headers, DATE_HINTS)
        const amount   = detectColumn(headers, AMOUNT_HINTS)
        const category = detectColumn(headers, CATEGORY_HINTS)
        setBankPreviewHeaders(headers)
        setBankPreviewRows(rows.slice(0, 5))
        setBankDetectedDate(date)
        setBankDetectedAmount(amount)
        setBankDetectedCategory(category)
        setBankMappedDate(date ?? '')
        setBankMappedAmount(amount ?? '')
        setBankMappedCategory(category ?? '')
      }
    }).catch(() => {})
  }

  const handleInvoiceFile = (file: File) => {
    setInvoiceFile(file)
    setInvoiceTotalRows(0)
    setInvoicePreviewHeaders([])
    setInvoicePreviewRows([])
    setInvoiceDetectedDate(null)
    setInvoiceDetectedAmount(null)
    setInvoiceMappedDate('')
    setInvoiceMappedAmount('')
    readFileAsRows(file).then(rows => {
      setInvoiceTotalRows(rows.length)
      if (rows.length > 0) {
        const headers = Object.keys(rows[0])
        const date    = detectColumn(headers, DATE_HINTS)
        const amount  = detectColumn(headers, AMOUNT_HINTS)
        setInvoicePreviewHeaders(headers)
        setInvoicePreviewRows(rows.slice(0, 5))
        setInvoiceDetectedDate(date)
        setInvoiceDetectedAmount(amount)
        setInvoiceMappedDate(date ?? '')
        setInvoiceMappedAmount(amount ?? '')
      }
    }).catch(() => {})
  }

  // ── Import flow ────────────────────────────────────────────────────────
  const runImportFlow = async (
    file: File,
    columnMapping: Record<string, string>,
  ) => {
    setProgressLabel('Läser fil…')
    const rows = await readFileAsRows(file)
    const orgId    = await getOrgId()
    const fileType = file.name.toLowerCase().endsWith('.csv') ? 'CSV' : 'XLSX'

    setProgressLabel('Laddar upp…')
    const uploadRes = await fetchWithAuth(`${API_URL}api/v1/data-import/upload`, {
      method: 'POST',
      body: JSON.stringify({ orgId, fileName: file.name, fileType, rows, columnMapping }),
    })
    if (!uploadRes.ok) throw new Error(await parseErrorMessage(uploadRes))
    const uploadJson = await uploadRes.json()
    const sessionId  = uploadJson?.data?.sessionId
    if (!sessionId) throw new Error('session')

    setProgressLabel('Analyserar…')
    const validateRes = await fetchWithAuth(`${API_URL}api/v1/data-import/${sessionId}/validate`, { method: 'POST' })
    if (!validateRes.ok) throw new Error(await parseErrorMessage(validateRes))

    setProgressLabel('Sparar…')
    const commitRes = await fetchWithAuth(`${API_URL}api/v1/data-import/${sessionId}/commit`, { method: 'POST' })
    if (!commitRes.ok) throw new Error(await parseErrorMessage(commitRes))
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  const markComplete    = (i: number) => setCompletedSteps(prev => { const n = [...prev]; n[i] = true; return n })
  const goBack          = () => { setStepError(''); setStepSuccess(''); setProgressLabel(''); setStep(s => Math.max(0, s - 1)) }
  const advanceAfter    = (msg: string, next: number) => {
    setStepSuccess(msg)
    setTimeout(() => { setStepSuccess(''); setStep(next) }, 1500)
  }
  const run = async (fn: () => Promise<void>) => {
    setStepLoading(true); setStepError(''); setStepSuccess('')
    try { await fn() }
    catch (err) { setStepError(toSwedishError(err instanceof Error ? err.message : 'okänt fel')) }
    setStepLoading(false); setProgressLabel('')
  }
  const doReset = () => {
    setStep(0); setCompletedSteps([false, false, false, false])
    setStepError(''); setStepSuccess(''); setProgressLabel('')
    setBankFile(null); setBankTotalRows(0); setBankPreviewHeaders([]); setBankPreviewRows([])
    setBankDetectedDate(null); setBankDetectedAmount(null); setBankDetectedCategory(null)
    setBankMappedDate(''); setBankMappedAmount(''); setBankMappedCategory('')
    setInvoiceFile(null); setInvoiceTotalRows(0); setInvoicePreviewHeaders([]); setInvoicePreviewRows([])
    setInvoiceDetectedDate(null); setInvoiceDetectedAmount(null)
    setInvoiceMappedDate(''); setInvoiceMappedAmount('')
    setCosts({ rent: '', staff: '', leasing: '', other: '' })
    setPaymentDays('30'); setPaymentType('Per projekt')
  }

  // ── Step save handlers ─────────────────────────────────────────────────
  const saveStep1 = () => run(async () => {
    if (!bankFile) throw new Error('Välj en fil innan du fortsätter.')
    if (!bankMappedDate || !bankMappedAmount) throw new Error('Välj vilka kolumner som är datum och belopp innan du fortsätter.')
    const mapping: Record<string, string> = { date: bankMappedDate, amount: bankMappedAmount }
    if (bankMappedCategory) mapping.category = bankMappedCategory
    await runImportFlow(bankFile, mapping)
    markComplete(0)
    advanceAfter(`Bankfilen importerad — ${bankTotalRows} rader uppladdade.`, 1)
  })

  const saveStep2 = () => run(async () => {
    if (!invoiceFile) throw new Error('Välj en fil innan du fortsätter.')
    if (!invoiceMappedDate || !invoiceMappedAmount) throw new Error('Välj vilka kolumner som är datum och belopp innan du fortsätter.')
    const mapping: Record<string, string> = { date: invoiceMappedDate, amount: invoiceMappedAmount }
    await runImportFlow(invoiceFile, mapping)
    markComplete(1)
    advanceAfter(`Fakturor importerade — ${invoiceTotalRows} rader uppladdade.`, 2)
  })

  const saveStep3 = () => run(async () => {
    const entries = [
      { name: 'Hyra',          amount: Number(costs.rent) },
      { name: 'Personal',      amount: Number(costs.staff) },
      { name: 'Leasing / Lån', amount: Number(costs.leasing) },
      { name: 'Övrigt',        amount: Number(costs.other) },
    ]
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
    const terms = [
      { type: 'CUSTOMER', name: 'Standardvillkor kund',       daysUntilDue: Number(paymentDays), customerName: 'Standard' },
      { type: 'SUPPLIER', name: 'Standardvillkor leverantör', daysUntilDue: Number(paymentDays), supplierName: 'Standard' },
    ]
    for (const term of terms) {
      const res = await fetchWithAuth(`${API_URL}api/v1/data-import/payment-terms`, {
        method: 'POST',
        body: JSON.stringify(term),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
    }
    markComplete(3)
    navigate('/dashboard')
  })

  const handlers   = [saveStep1, saveStep2, saveStep3, saveStep4]
  const saveLabels = ['Fortsätt', 'Fortsätt', 'Fortsätt', 'Skapa diagnos']

  const progressPct = ((step + (completedSteps[step] ? 1 : 0)) / STEP_LABELS.length) * 100

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 font-sans">

      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
        <span onClick={() => navigate('/')} className="font-semibold text-gray-900 cursor-pointer select-none tracking-tight">
          RW Systems
        </span>
        <span className="text-sm text-gray-400">Steg {step + 1} av {STEP_LABELS.length}</span>
      </div>

      <div className="max-w-xl mx-auto px-4 py-10">

        {/* Welcome heading */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Välkommen till RW Systems</h1>
          <p className="text-gray-500 text-base">Kom igång på 4 enkla steg — det tar bara några minuter.</p>
        </div>

        {/* Step dots + labels */}
        <div className="flex items-start mb-4">
          {STEP_LABELS.map((label, i) => (
            <div key={label} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all
                  ${completedSteps[i]
                    ? 'bg-green-500 border-green-500'
                    : i === step
                    ? 'bg-[#1e3a5f] border-[#1e3a5f]'
                    : 'bg-white border-gray-300'}`}>
                  {completedSteps[i] ? (
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className={`text-xs font-semibold ${i === step ? 'text-white' : 'text-gray-400'}`}>{i + 1}</span>
                  )}
                </div>
                <span className={`text-[11px] font-medium whitespace-nowrap text-center leading-tight ${
                  i === step ? 'text-gray-900' : completedSteps[i] ? 'text-green-600' : 'text-gray-400'
                }`}>
                  {label}
                </span>
              </div>
              {i < STEP_LABELS.length - 1 && (
                <div className={`flex-1 h-px mx-2 mb-5 transition-colors ${completedSteps[i] ? 'bg-green-400' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-200 rounded-full h-1.5 mb-8">
          <div
            className="bg-blue-600 h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Card */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-1">{STEP_TITLES[step]}</h2>

          {/* Help text */}
          <div className="flex gap-2.5 items-start bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 mb-6 mt-3">
            <svg className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-gray-500 leading-relaxed">{STEP_HINTS[step]}</p>
          </div>

          {/* ── Step 1: Bank file ──────────────────────────────────────── */}
          {step === 0 && (
            <>
              <UploadZone file={bankFile} inputRef={bankRef} onFile={handleBankFile} />

              {bankPreviewRows.length > 0 && (
                <div className="mt-5 space-y-4">
                  <p className="text-sm font-semibold text-gray-700">
                    Ser detta rätt ut?{' '}
                    <span className="font-normal text-gray-400">{bankTotalRows} rader hittade — visar 5 nedan</span>
                  </p>

                  {/* Dynamic preview table */}
                  <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-100 bg-gray-50">
                            {bankPreviewHeaders.map(h => (
                              <th key={h} className="text-left px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {bankPreviewRows.map((row, i) => (
                            <tr key={i} className={`${i !== 0 ? 'border-t border-gray-50' : ''} ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}>
                              {bankPreviewHeaders.map(h => (
                                <td key={h} className="px-3 py-2 text-gray-600 whitespace-nowrap max-w-[140px] truncate">
                                  {String(row[h] ?? '')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Column detection */}
                  <div className="bg-white border border-gray-100 rounded-xl p-4">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Vi hittade</p>
                    <div className="space-y-3">
                      <ColumnRow
                        label="Datum"
                        detected={bankDetectedDate}
                        mapped={bankMappedDate}
                        headers={bankPreviewHeaders}
                        onMap={setBankMappedDate}
                      />
                      <ColumnRow
                        label="Belopp"
                        detected={bankDetectedAmount}
                        mapped={bankMappedAmount}
                        headers={bankPreviewHeaders}
                        onMap={setBankMappedAmount}
                      />
                      <div className="flex items-center gap-3">
                        {bankDetectedCategory ? (
                          <>
                            <span className="flex items-center gap-1.5 text-sm text-green-700 font-medium min-w-[80px]">
                              <span>✓</span> Kategori
                            </span>
                            <span className="text-sm text-gray-400 bg-gray-50 px-2 py-0.5 rounded font-mono">{bankDetectedCategory}</span>
                          </>
                        ) : (
                          <span className="text-sm text-gray-400">
                            <span className="text-gray-300 mr-1">✗</span> Kategori — saknas (valfritt)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Step 2: Invoice file ───────────────────────────────────── */}
          {step === 1 && (
            <>
              <UploadZone file={invoiceFile} inputRef={invoiceRef} onFile={handleInvoiceFile} />

              {invoicePreviewRows.length > 0 && (
                <div className="mt-5 space-y-4">
                  <p className="text-sm font-semibold text-gray-700">
                    Ser detta rätt ut?{' '}
                    <span className="font-normal text-gray-400">{invoiceTotalRows} rader hittade — visar 5 nedan</span>
                  </p>

                  {/* Dynamic preview table */}
                  <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-100 bg-gray-50">
                            {invoicePreviewHeaders.map(h => (
                              <th key={h} className="text-left px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {invoicePreviewRows.map((row, i) => (
                            <tr key={i} className={`${i !== 0 ? 'border-t border-gray-50' : ''} ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}>
                              {invoicePreviewHeaders.map(h => (
                                <td key={h} className="px-3 py-2 text-gray-600 whitespace-nowrap max-w-[140px] truncate">
                                  {String(row[h] ?? '')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Column detection */}
                  <div className="bg-white border border-gray-100 rounded-xl p-4">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Vi hittade</p>
                    <div className="space-y-3">
                      <ColumnRow
                        label="Datum"
                        detected={invoiceDetectedDate}
                        mapped={invoiceMappedDate}
                        headers={invoicePreviewHeaders}
                        onMap={setInvoiceMappedDate}
                      />
                      <ColumnRow
                        label="Belopp"
                        detected={invoiceDetectedAmount}
                        mapped={invoiceMappedAmount}
                        headers={invoicePreviewHeaders}
                        onMap={setInvoiceMappedAmount}
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Step 3: Fixed costs ────────────────────────────────────── */}
          {step === 2 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CostField label="Hyra"          value={costs.rent}    onChange={v => setCosts({ ...costs, rent: v })} />
              <CostField label="Personal"      value={costs.staff}   onChange={v => setCosts({ ...costs, staff: v })} />
              <CostField label="Leasing / Lån" value={costs.leasing} onChange={v => setCosts({ ...costs, leasing: v })} />
              <CostField label="Övrigt"        value={costs.other}   onChange={v => setCosts({ ...costs, other: v })} />
            </div>
          )}

          {/* ── Step 4: Payment terms ──────────────────────────────────── */}
          {step === 3 && (
            <div className="flex flex-col gap-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Hur många dagar brukar dina kunder ta på sig att betala?
                  <span className="text-gray-400 font-normal ml-1 text-xs">(dagar)</span>
                </label>
                <input
                  type="number"
                  value={paymentDays}
                  onChange={e => setPaymentDays(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Hur fakturerar du?</label>
                <select
                  value={paymentType}
                  onChange={e => setPaymentType(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition bg-white cursor-pointer"
                >
                  <option>Per projekt</option>
                  <option>Löpande</option>
                  <option>Annat</option>
                </select>
              </div>
            </div>
          )}

          {/* Success */}
          {stepSuccess && (
            <div className="mt-6 flex items-center gap-2.5 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-sm text-green-700 font-medium">{stepSuccess}</p>
            </div>
          )}

          {/* Error */}
          {stepError && (
            <div className="mt-6 flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-red-700 mb-0.5">Något gick fel</p>
                <p className="text-sm text-red-600">{stepError}</p>
              </div>
            </div>
          )}

          {/* Footer actions */}
          <div className="mt-8 flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm text-gray-400">
              {step > 0 && (
                <button onClick={goBack} className="hover:text-gray-700 transition-colors">
                  Tillbaka
                </button>
              )}
              <button onClick={doReset} className="hover:text-gray-700 transition-colors">
                Börja om
              </button>
            </div>

            <button
              onClick={handlers[step]}
              disabled={stepLoading}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50"
            >
              {stepLoading
                ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />{progressLabel || 'Sparar…'}</>
                : saveLabels[step]
              }
            </button>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          Du kan alltid komma tillbaka och uppdatera detta senare.
        </p>
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
        ${dragging
          ? 'border-blue-400 bg-blue-50'
          : file
          ? 'border-blue-300 bg-blue-50 hover:border-blue-400'
          : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50/50'
        }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }}
      />

      {file ? (
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-900 mt-1">{file.name}</p>
          <p className="text-xs text-gray-400">{formatBytes(file.size)} — klicka för att byta fil</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center">
            <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <div>
            <p className="text-base font-semibold text-gray-700">Dra hit din fil eller klicka för att välja</p>
            <p className="text-sm text-gray-400 mt-0.5">Excel (.xlsx) eller CSV</p>
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
      <span className={`flex items-center gap-1.5 text-sm font-medium min-w-[80px] shrink-0 ${detected ? 'text-green-700' : 'text-red-600'}`}>
        <span>{detected ? '✓' : '✗'}</span> {label}
      </span>
      {detected ? (
        <span className="text-sm text-gray-400 bg-gray-50 px-2 py-0.5 rounded font-mono">{detected}</span>
      ) : (
        <div className="flex-1">
          <p className="text-xs text-red-500 mb-1">{label} hittades inte — välj rätt kolumn:</p>
          <select
            value={mapped}
            onChange={e => onMap(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
          >
            <option value="">— Välj kolumn —</option>
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
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label} <span className="text-gray-400 font-normal text-xs">kr / månad</span>
      </label>
      <input
        type="number"
        placeholder="0"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition"
      />
    </div>
  )
}