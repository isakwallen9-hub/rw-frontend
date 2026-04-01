import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { fetchWithAuth } from '../utils/fetchWithAuth'

const API_URL = 'https://divine-warmth-production.up.railway.app/'

const STEPS = ['Bankdata', 'Fakturor', 'Kostnader', 'Villkor']

type BankRow    = { date: string; description: string; amount: string }
type InvoiceRow = { customer: string; invoiceNr: string; amount: string; dueDate: string; status: 'Betald' | 'Obetald' }

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const json = await res.json()
    return json?.error?.message ?? json?.message ?? `HTTP ${res.status}`
  } catch { return `HTTP ${res.status}` }
}

function readFileAsRows(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target?.result, { type: 'array' })
        resolve(XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]))
      } catch (err) { reject(err) }
    }
    reader.onerror = () => reject(new Error('Kunde inte läsa filen.'))
    reader.readAsArrayBuffer(file)
  })
}

async function getOrgId(): Promise<string> {
  const res = await fetchWithAuth(`${API_URL}api/v1/organisation`)
  if (!res.ok) throw new Error(`Kunde inte hämta organisation: HTTP ${res.status}`)
  const json = await res.json()
  console.log('[ORG] Full response:', json)
  console.log('[ORG] data.id:', json?.data?.id)
  const orgId = json?.data?.id
  if (!orgId) throw new Error(`Inget orgId i svaret. Fick: ${JSON.stringify(json)}`)
  return String(orgId)
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<boolean[]>([false, false, false, false])
  const [stepLoading, setStepLoading] = useState(false)
  const [stepError, setStepError] = useState('')
  const [progressLabel, setProgressLabel] = useState('')

  const [bankFile, setBankFile]       = useState<File | null>(null)
  const [bankRows, setBankRows]       = useState<BankRow[]>([])
  const bankRef                       = useRef<HTMLInputElement>(null)

  const [invoiceFile, setInvoiceFile] = useState<File | null>(null)
  const [invoiceRows, setInvoiceRows] = useState<InvoiceRow[]>([])
  const invoiceRef                    = useRef<HTMLInputElement>(null)

  const [costs, setCosts]             = useState({ rent: '', staff: '', leasing: '', other: '' })
  const [paymentDays, setPaymentDays] = useState('30')
  const [paymentType, setPaymentType] = useState('Per projekt')

  const markComplete = (i: number) =>
    setCompletedSteps(prev => { const n = [...prev]; n[i] = true; return n })

  const handleBankFile = (file: File) => {
    setBankFile(file)
    readFileAsRows(file).then(rows => setBankRows(rows.slice(0, 5).map(r => ({
      date:        String(r['Datum']       ?? r['Date']        ?? ''),
      description: String(r['Text']        ?? r['Beskrivning'] ?? r['Description'] ?? ''),
      amount:      String(r['Belopp']      ?? r['Amount']      ?? ''),
    })))).catch(() => {})
  }

  const handleInvoiceFile = (file: File) => {
    setInvoiceFile(file)
    readFileAsRows(file).then(rows => setInvoiceRows(rows.slice(0, 5).map(r => {
      const status = String(r['Status'] ?? '')
      return {
        customer:  String(r['Kund']          ?? r['Customer']  ?? ''),
        invoiceNr: String(r['Fakturanr']     ?? r['Invoice']   ?? r['Faktura'] ?? ''),
        amount:    String(r['Belopp']        ?? r['Amount']    ?? ''),
        dueDate:   String(r['Förfallodatum'] ?? r['DueDate']   ?? r['Due']     ?? ''),
        status:    status === 'Betald' ? 'Betald' : 'Obetald',
      }
    }))).catch(() => {})
  }

  const runImportFlow = async (file: File) => {
    setProgressLabel('Läser fil...')
    const rows = await readFileAsRows(file)
    console.log(`[IMPORT] Parsed ${rows.length} rows from ${file.name}`)

    const orgId = await getOrgId()
    const fileType = file.name.toLowerCase().endsWith('.csv') ? 'CSV' : 'XLSX'

    setProgressLabel('Laddar upp...')
    const uploadRes = await fetchWithAuth(`${API_URL}api/v1/data-import/upload`, {
      method: 'POST',
      body: JSON.stringify({ orgId, fileName: file.name, fileType, rows }),
    })
    if (!uploadRes.ok) throw new Error(`Uppladdning misslyckades: ${await parseErrorMessage(uploadRes)}`)
    const { data: { sessionId } } = await uploadRes.json()
    if (!sessionId) throw new Error('Ingen sessionId i svaret från servern.')

    setProgressLabel('Validerar...')
    const validateRes = await fetchWithAuth(`${API_URL}api/v1/data-import/${sessionId}/validate`, { method: 'POST' })
    if (!validateRes.ok) throw new Error(`Validering misslyckades: ${await parseErrorMessage(validateRes)}`)

    setProgressLabel('Bekräftar...')
    const commitRes = await fetchWithAuth(`${API_URL}api/v1/data-import/${sessionId}/commit`, { method: 'POST' })
    if (!commitRes.ok) throw new Error(`Bekräftelse misslyckades: ${await parseErrorMessage(commitRes)}`)
  }

  const goBack  = () => { setStepError(''); setProgressLabel(''); setStep(s => Math.max(0, s - 1)) }
  const doReset = () => {
    setStep(0); setCompletedSteps([false, false, false, false])
    setStepError(''); setProgressLabel('')
    setBankFile(null); setBankRows([])
    setInvoiceFile(null); setInvoiceRows([])
    setCosts({ rent: '', staff: '', leasing: '', other: '' })
    setPaymentDays('30'); setPaymentType('Per projekt')
  }

  const run = async (fn: () => Promise<void>) => {
    setStepLoading(true); setStepError('')
    try { await fn() }
    catch (err) { setStepError(err instanceof Error ? err.message : 'Okänt fel') }
    setStepLoading(false); setProgressLabel('')
  }

  const saveStep1 = () => run(async () => {
    if (!bankFile) throw new Error('Välj en fil innan du fortsätter.')
    await runImportFlow(bankFile); markComplete(0); setStep(1)
  })

  const saveStep2 = () => run(async () => {
    if (!invoiceFile) throw new Error('Välj en fil innan du fortsätter.')
    await runImportFlow(invoiceFile); markComplete(1); setStep(2)
  })

  const saveStep3 = () => run(async () => {
    const entries = [
      { name: 'Hyra',           amount: Number(costs.rent) },
      { name: 'Personal',       amount: Number(costs.staff) },
      { name: 'Leasing / Lån',  amount: Number(costs.leasing) },
      { name: 'Övrigt',         amount: Number(costs.other) },
    ]
    for (const entry of entries) {
      const res = await fetchWithAuth(`${API_URL}api/v1/data-import/fixed-costs`, {
        method: 'POST',
        body: JSON.stringify({ name: entry.name, amount: entry.amount, frequency: 'MONTHLY' }),
      })
      if (!res.ok) throw new Error(`${entry.name}: ${await parseErrorMessage(res)}`)
    }
    markComplete(2); setStep(3)
  })

  const saveStep4 = () => run(async () => {
    const terms = [
      { type: 'CUSTOMER', name: 'Standardvillkor kund',        daysUntilDue: Number(paymentDays), customerName: 'Standard' },
      { type: 'SUPPLIER', name: 'Standardvillkor leverantör',  daysUntilDue: Number(paymentDays), supplierName: 'Standard' },
    ]
    for (const term of terms) {
      const res = await fetchWithAuth(`${API_URL}api/v1/data-import/payment-terms`, {
        method: 'POST',
        body: JSON.stringify(term),
      })
      if (!res.ok) throw new Error(`${term.type}: ${await parseErrorMessage(res)}`)
    }
    markComplete(3); navigate('/dashboard')
  })

  const handlers   = [saveStep1, saveStep2, saveStep3, saveStep4]
  const saveLabels = ['Fortsätt', 'Fortsätt', 'Fortsätt', 'Skapa diagnos']

  const stepTitles = [
    'Importera bankdata',
    'Importera fakturor',
    'Fasta kostnader',
    'Betalningsvillkor',
  ]
  const stepDescriptions = [
    'Ladda upp ett kontoutdrag i CSV- eller Excel-format.',
    'Ladda upp fakturadata för att identifiera sena betalare.',
    'Ange dina månatliga fasta kostnader.',
    'Berätta hur du fakturerar dina kunder.',
  ]

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Topbar */}
      <div className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
        <span onClick={() => navigate('/')} className="font-semibold text-gray-900 cursor-pointer select-none tracking-tight">
          RW Systems
        </span>
        <span className="text-sm text-gray-400">Steg {step + 1} av {STEPS.length}</span>
      </div>

      <div className="max-w-xl mx-auto px-4 py-12">

        {/* Progress */}
        <div className="flex items-center mb-10">
          {STEPS.map((label, i) => (
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
                <span className={`text-xs font-medium whitespace-nowrap ${i === step ? 'text-gray-900' : completedSteps[i] ? 'text-green-600' : 'text-gray-400'}`}>
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px mx-3 mb-5 transition-colors ${completedSteps[i] ? 'bg-green-400' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">{stepTitles[step]}</h2>
          <p className="text-sm text-gray-500 mb-8">{stepDescriptions[step]}</p>

          {/* Step 1 */}
          {step === 0 && (
            <>
              <UploadZone file={bankFile} inputRef={bankRef} onFile={handleBankFile} />
              {bankRows.length > 0 && (
                <PreviewTable headers={['Datum', 'Beskrivning', 'Belopp']}>
                  {bankRows.map((r, i) => (
                    <tr key={i} className="border-t border-gray-100 text-sm">
                      <td className="py-2.5 pr-4 text-gray-500 whitespace-nowrap">{r.date}</td>
                      <td className="py-2.5 pr-4 text-gray-700">{r.description}</td>
                      <td className="py-2.5 text-right text-gray-900 font-medium whitespace-nowrap">{r.amount}</td>
                    </tr>
                  ))}
                </PreviewTable>
              )}
            </>
          )}

          {/* Step 2 */}
          {step === 1 && (
            <>
              <UploadZone file={invoiceFile} inputRef={invoiceRef} onFile={handleInvoiceFile} />
              {invoiceRows.length > 0 && (
                <PreviewTable headers={['Kund', 'Faktura', 'Belopp', 'Förfaller', 'Status']}>
                  {invoiceRows.map((r, i) => (
                    <tr key={i} className="border-t border-gray-100 text-sm">
                      <td className="py-2.5 pr-3 text-gray-900 font-medium">{r.customer}</td>
                      <td className="py-2.5 pr-3 text-gray-500">{r.invoiceNr}</td>
                      <td className="py-2.5 pr-3 text-right text-gray-900">{r.amount}</td>
                      <td className="py-2.5 pr-3 text-gray-500 whitespace-nowrap">{r.dueDate}</td>
                      <td className="py-2.5">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${r.status === 'Betald' ? 'bg-green-50 text-green-700 ring-1 ring-green-200' : 'bg-red-50 text-red-600 ring-1 ring-red-200'}`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </PreviewTable>
              )}
            </>
          )}

          {/* Step 3 */}
          {step === 2 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CostField label="Hyra"          sublabel="kr / månad" value={costs.rent}    onChange={v => setCosts({ ...costs, rent: v })} />
              <CostField label="Personal"      sublabel="kr / månad" value={costs.staff}   onChange={v => setCosts({ ...costs, staff: v })} />
              <CostField label="Leasing / Lån" sublabel="kr / månad" value={costs.leasing} onChange={v => setCosts({ ...costs, leasing: v })} />
              <CostField label="Övrigt"        sublabel="kr / månad" value={costs.other}   onChange={v => setCosts({ ...costs, other: v })} />
            </div>
          )}

          {/* Step 4 */}
          {step === 3 && (
            <div className="flex flex-col gap-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Standard betalningsvillkor
                  <span className="text-gray-400 font-normal ml-1">(dagar)</span>
                </label>
                <input type="number" value={paymentDays} onChange={e => setPaymentDays(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Faktureringsmodell</label>
                <select value={paymentType} onChange={e => setPaymentType(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition bg-white cursor-pointer">
                  <option>Per projekt</option>
                  <option>Löpande</option>
                  <option>Annat</option>
                </select>
              </div>
            </div>
          )}

          {/* Error */}
          {stepError && (
            <div className="mt-6 flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 8v4m0 4h.01" />
              </svg>
              <p className="text-sm text-red-600">{stepError}</p>
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

            <button onClick={handlers[step]} disabled={stepLoading}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50">
              {stepLoading
                ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />{progressLabel || 'Sparar...'}</>
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
      className={`rounded-lg border-2 border-dashed px-8 py-10 text-center cursor-pointer transition-colors select-none
        ${dragging ? 'border-blue-400 bg-blue-50/50' : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50'}`}
    >
      <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />

      {file ? (
        <div className="flex flex-col items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-900">{file.name}</p>
          <p className="text-xs text-gray-400">{formatBytes(file.size)} — klicka för att byta</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700">Dra och släpp filen här</p>
            <p className="text-xs text-gray-400 mt-0.5">CSV, XLSX eller XLS — max 10 MB</p>
          </div>
          <span className="text-xs text-blue-600 font-medium">eller välj fil</span>
        </div>
      )}
    </div>
  )
}

function PreviewTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="mt-6 overflow-x-auto rounded-lg border border-gray-200">
      <p className="text-xs text-gray-400 px-4 py-2.5 border-b border-gray-100 font-medium bg-gray-50">
        Förhandsgranskning — 5 rader
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500 border-b border-gray-100">
            {headers.map(h => <th key={h} className="text-left px-4 py-2.5 font-medium last:text-right">{h}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function CostField({ label, sublabel, value, onChange }: {
  label: string; sublabel: string; value: string; onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label} <span className="text-gray-400 font-normal text-xs">{sublabel}</span>
      </label>
      <input type="number" placeholder="0" value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition" />
    </div>
  )
}
