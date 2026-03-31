import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { fetchWithAuth } from '../utils/fetchWithAuth'

const API_URL = 'https://divine-warmth-production.up.railway.app/'
const STEPS = ['Ekonomi', 'Fakturor', 'Kostnader', 'Villkor']

type BankRow = { date: string; description: string; amount: string }
type InvoiceRow = { customer: string; invoiceNr: string; amount: string; dueDate: string; status: 'Betald' | 'Obetald' }

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const json = await res.json()
    return json?.error?.message ?? json?.message ?? `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

function readFileAsRows(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        const workbook = XLSX.read(data, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        resolve(XLSX.utils.sheet_to_json(sheet))
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('Kunde inte läsa filen.'))
    reader.readAsArrayBuffer(file)
  })
}

async function getOrgId(): Promise<string> {
  const res = await fetchWithAuth(`${API_URL}api/v1/organisation`)
  if (!res.ok) throw new Error(`Kunde inte hämta organisation: HTTP ${res.status}`)
  const json = await res.json()
  const orgId = json?.data?.id ?? json?.data?.orgId ?? json?.id
  if (!orgId) throw new Error('Inget orgId i svaret från /api/v1/organisation')
  return String(orgId)
}

export default function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<boolean[]>([false, false, false, false])
  const [stepLoading, setStepLoading] = useState(false)
  const [stepError, setStepError] = useState('')
  const [progressLabel, setProgressLabel] = useState('')

  // Step 1
  const [bankFile, setBankFile] = useState<File | null>(null)
  const [bankRows, setBankRows] = useState<BankRow[]>([])
  const bankRef = useRef<HTMLInputElement>(null)

  // Step 2
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null)
  const [invoiceRows, setInvoiceRows] = useState<InvoiceRow[]>([])
  const invoiceRef = useRef<HTMLInputElement>(null)

  // Step 3
  const [costs, setCosts] = useState({ rent: '', staff: '', leasing: '', other: '' })

  // Step 4
  const [paymentDays, setPaymentDays] = useState('30')
  const [paymentType, setPaymentType] = useState('Per projekt')

  const markComplete = (i: number) => {
    setCompletedSteps((prev) => { const next = [...prev]; next[i] = true; return next })
  }

  const handleBankFile = (file: File) => {
    setBankFile(file)
    readFileAsRows(file).then((rows) => {
      setBankRows(rows.slice(0, 5).map((r) => ({
        date: String(r['Datum'] ?? r['Date'] ?? r['datum'] ?? ''),
        description: String(r['Text'] ?? r['Beskrivning'] ?? r['Description'] ?? ''),
        amount: String(r['Belopp'] ?? r['Amount'] ?? r['belopp'] ?? ''),
      })))
    }).catch(() => {})
  }

  const handleInvoiceFile = (file: File) => {
    setInvoiceFile(file)
    readFileAsRows(file).then((rows) => {
      setInvoiceRows(rows.slice(0, 5).map((r) => {
        const status = String(r['Status'] ?? r['status'] ?? '')
        return {
          customer: String(r['Kund'] ?? r['Customer'] ?? ''),
          invoiceNr: String(r['Fakturanr'] ?? r['Invoice'] ?? r['Faktura'] ?? ''),
          amount: String(r['Belopp'] ?? r['Amount'] ?? ''),
          dueDate: String(r['Förfallodatum'] ?? r['DueDate'] ?? r['Due'] ?? ''),
          status: status === 'Betald' ? 'Betald' : 'Obetald',
        }
      }))
    }).catch(() => {})
  }

  const runImportFlow = async (file: File, type: 'bank' | 'invoice'): Promise<void> => {
    // Read file with SheetJS
    console.log(`[IMPORT] Reading ${type} file:`, file.name)
    setProgressLabel('Läser fil...')
    const rows = await readFileAsRows(file)
    console.log(`[IMPORT] Parsed ${rows.length} rows`)

    // Fetch orgId
    console.log('[IMPORT] Fetching orgId...')
    const orgId = await getOrgId()
    console.log('[IMPORT] orgId:', orgId)

    const fileType = file.name.toLowerCase().endsWith('.csv') ? 'CSV' : 'XLSX'
    const body = { orgId, fileName: file.name, fileType, rows }

    // Step 1: Upload JSON
    console.log(`[IMPORT] Uploading ${type} data...`)
    setProgressLabel('Laddar upp...')
    const uploadRes = await fetchWithAuth(`${API_URL}api/v1/data-import/upload`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    console.log('[IMPORT] Upload status:', uploadRes.status)

    if (!uploadRes.ok) {
      const msg = await parseErrorMessage(uploadRes)
      console.error('[IMPORT] Upload failed:', msg)
      throw new Error(`Uppladdning misslyckades: ${msg}`)
    }

    const uploadData = await uploadRes.json()
    console.log('[IMPORT] Upload response:', uploadData)
    const sessionId = uploadData?.data?.sessionId
    console.log('[IMPORT] SessionId:', sessionId)

    if (!sessionId) {
      throw new Error('Ingen sessionId i svaret från servern. Kontrollera att filen är giltig.')
    }

    // Step 2: Validate
    console.log('[IMPORT] Validating session:', sessionId)
    setProgressLabel('Validerar...')
    const validateRes = await fetchWithAuth(`${API_URL}api/v1/data-import/${sessionId}/validate`, {
      method: 'POST',
    })
    console.log('[IMPORT] Validate status:', validateRes.status)

    if (!validateRes.ok) {
      const msg = await parseErrorMessage(validateRes)
      console.error('[IMPORT] Validate failed:', msg)
      throw new Error(`Validering misslyckades: ${msg}`)
    }

    const validateData = await validateRes.json()
    console.log('[IMPORT] Validate response:', validateData)

    // Step 3: Commit
    console.log('[IMPORT] Committing session:', sessionId)
    setProgressLabel('Bekräftar...')
    const commitRes = await fetchWithAuth(`${API_URL}api/v1/data-import/${sessionId}/commit`, {
      method: 'POST',
    })
    console.log('[IMPORT] Commit status:', commitRes.status)

    if (!commitRes.ok) {
      const msg = await parseErrorMessage(commitRes)
      console.error('[IMPORT] Commit failed:', msg)
      throw new Error(`Bekräftelse misslyckades: ${msg}`)
    }

    const commitData = await commitRes.json()
    console.log('[IMPORT] Commit response:', commitData)
  }

  const goBack = () => { setStepError(''); setProgressLabel(''); setStep((s) => Math.max(0, s - 1)) }

  const reset = () => {
    setStep(0); setCompletedSteps([false, false, false, false])
    setStepError(''); setProgressLabel('')
    setBankFile(null); setBankRows([])
    setInvoiceFile(null); setInvoiceRows([])
    setCosts({ rent: '', staff: '', leasing: '', other: '' })
    setPaymentDays('30'); setPaymentType('Per projekt')
  }

  const saveStep1 = async () => {
    if (!bankFile) { setStepError('Välj en fil innan du fortsätter.'); return }
    setStepLoading(true); setStepError('')
    try {
      await runImportFlow(bankFile, 'bank')
      markComplete(0); setStep(1)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Okänt fel'
      setStepError(msg)
      console.error('[STEP 1] Error:', msg)
    }
    setStepLoading(false); setProgressLabel('')
  }

  const saveStep2 = async () => {
    if (!invoiceFile) { setStepError('Välj en fil innan du fortsätter.'); return }
    setStepLoading(true); setStepError('')
    try {
      await runImportFlow(invoiceFile, 'invoice')
      markComplete(1); setStep(2)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Okänt fel'
      setStepError(msg)
      console.error('[STEP 2] Error:', msg)
    }
    setStepLoading(false); setProgressLabel('')
  }

  const saveStep3 = async () => {
    setStepLoading(true); setStepError('')
    const body = {
      rent: Number(costs.rent), staff: Number(costs.staff),
      leasing: Number(costs.leasing), other: Number(costs.other),
    }
    console.log('[STEP 3] Posting fixed costs:', body)
    try {
      const res = await fetchWithAuth(`${API_URL}api/v1/data-import/fixed-costs`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      console.log('[STEP 3] Response status:', res.status)
      if (!res.ok) {
        const msg = await parseErrorMessage(res)
        console.error('[STEP 3] Failed:', msg)
        throw new Error(msg)
      }
      const data = await res.json()
      console.log('[STEP 3] Response data:', data)
      markComplete(2); setStep(3)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Okänt fel'
      setStepError(`Kunde inte spara kostnader: ${msg}`)
    }
    setStepLoading(false)
  }

  const saveStep4 = async () => {
    setStepLoading(true); setStepError('')
    const body = { paymentDays: Number(paymentDays), billingType: paymentType }
    console.log('[STEP 4] Posting payment terms:', body)
    try {
      const res = await fetchWithAuth(`${API_URL}api/v1/data-import/payment-terms`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      console.log('[STEP 4] Response status:', res.status)
      if (!res.ok) {
        const msg = await parseErrorMessage(res)
        console.error('[STEP 4] Failed:', msg)
        throw new Error(msg)
      }
      const data = await res.json()
      console.log('[STEP 4] Response data:', data)
      markComplete(3); navigate('/dashboard')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Okänt fel'
      setStepError(`Kunde inte spara villkor: ${msg}`)
    }
    setStepLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <span onClick={() => navigate('/')} className="font-bold text-xl text-primary cursor-pointer tracking-tight">RW Systems</span>
        <span className="text-sm text-gray-400">Steg {step + 1} av {STEPS.length}</span>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-10">
        {/* Progress */}
        <div className="flex items-center gap-1 mb-10">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-1 flex-1 min-w-0">
              <div className="flex items-center gap-1.5 shrink-0">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                  ${completedSteps[i] ? 'bg-green-500 text-white' : i === step ? 'bg-primary text-white' : 'bg-gray-200 text-gray-400'}`}>
                  {completedSteps[i] ? '✓' : i + 1}
                </div>
                <span className={`text-xs font-medium hidden sm:block ${i === step ? 'text-primary' : completedSteps[i] ? 'text-green-600' : 'text-gray-400'}`}>
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-1 ${completedSteps[i] ? 'bg-green-400' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8">
          {step === 0 && (
            <StepShell title="Importera bankdata" description="Ladda upp kontoutdrag i CSV- eller Excel-format."
              onBack={goBack} onReset={reset} isFirst loading={stepLoading} error={stepError}
              progressLabel={progressLabel} onSave={saveStep1} saveLabel="Spara import">
              <DropZone accept=".csv,.xlsx,.xls" file={bankFile} inputRef={bankRef} onFile={handleBankFile}
                label="Dra och släpp CSV/Excel här, eller klicka för att välja" />
              {bankRows.length > 0 && (
                <PreviewTable headers={['Datum', 'Beskrivning', 'Belopp']}>
                  {bankRows.map((r, i) => (
                    <tr key={i} className="border-t border-gray-50 text-sm">
                      <td className="py-2 pr-4 text-gray-500">{r.date}</td>
                      <td className="py-2 pr-4 text-gray-800">{r.description}</td>
                      <td className="py-2 text-right text-gray-800">{r.amount}</td>
                    </tr>
                  ))}
                </PreviewTable>
              )}
            </StepShell>
          )}

          {step === 1 && (
            <StepShell title="Importera fakturor / kundreskontra" description="Ladda upp fakturadata för att identifiera sena betalare."
              onBack={goBack} onReset={reset} loading={stepLoading} error={stepError}
              progressLabel={progressLabel} onSave={saveStep2} saveLabel="Spara fakturadata">
              <DropZone accept=".csv,.xlsx,.xls" file={invoiceFile} inputRef={invoiceRef} onFile={handleInvoiceFile}
                label="Dra och släpp CSV/Excel här, eller klicka för att välja" />
              {invoiceRows.length > 0 && (
                <PreviewTable headers={['Kund', 'Faktura nr', 'Belopp', 'Förfaller', 'Status']}>
                  {invoiceRows.map((r, i) => (
                    <tr key={i} className="border-t border-gray-50 text-sm">
                      <td className="py-2 pr-3 text-gray-800">{r.customer}</td>
                      <td className="py-2 pr-3 text-gray-500">{r.invoiceNr}</td>
                      <td className="py-2 pr-3 text-right text-gray-800">{r.amount}</td>
                      <td className="py-2 pr-3 text-gray-500">{r.dueDate}</td>
                      <td className="py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.status === 'Betald' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </PreviewTable>
              )}
            </StepShell>
          )}

          {step === 2 && (
            <StepShell title="Fasta kostnader" description="Ange dina månatliga fasta kostnader."
              onBack={goBack} onReset={reset} loading={stepLoading} error={stepError}
              progressLabel={progressLabel} onSave={saveStep3} saveLabel="Spara fasta kostnader">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <CostField label="Hyra (kr/mån)" value={costs.rent} onChange={(v) => setCosts({ ...costs, rent: v })} />
                <CostField label="Personal totalt (kr/mån)" value={costs.staff} onChange={(v) => setCosts({ ...costs, staff: v })} />
                <CostField label="Leasing / Lån (kr/mån)" value={costs.leasing} onChange={(v) => setCosts({ ...costs, leasing: v })} />
                <CostField label="Övrigt (kr/mån)" value={costs.other} onChange={(v) => setCosts({ ...costs, other: v })} />
              </div>
            </StepShell>
          )}

          {step === 3 && (
            <StepShell title="Betalningsvillkor" description="Berätta hur du fakturerar dina kunder."
              onBack={goBack} onReset={reset} loading={stepLoading} error={stepError}
              progressLabel={progressLabel} onSave={saveStep4} saveLabel="Skapa min diagnos">
              <div className="flex flex-col gap-5">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Standard betalningsvillkor (dagar)</label>
                  <input type="number" value={paymentDays} onChange={(e) => setPaymentDays(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Hur tar du betalt?</label>
                  <select value={paymentType} onChange={(e) => setPaymentType(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent bg-white">
                    <option>Per projekt</option>
                    <option>Löpande</option>
                    <option>Annat</option>
                  </select>
                </div>
              </div>
            </StepShell>
          )}
        </div>
      </div>
    </div>
  )
}

function StepShell({ title, description, children, onBack, onReset, isFirst, loading, error, progressLabel, onSave, saveLabel }: {
  title: string; description: string; children: React.ReactNode
  onBack: () => void; onReset: () => void; isFirst?: boolean
  loading: boolean; error: string; progressLabel: string; onSave: () => void; saveLabel: string
}) {
  return (
    <div>
      <h2 className="text-xl font-bold text-primary mb-1">{title}</h2>
      <p className="text-gray-500 text-sm mb-6">{description}</p>
      {children}
      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <p className="text-red-600 text-sm font-medium">Fel: {error}</p>
        </div>
      )}
      <button onClick={onSave} disabled={loading}
        className="mt-6 w-full bg-accent text-white font-semibold py-3 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 text-sm flex items-center justify-center gap-2">
        {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
        {loading ? (progressLabel || 'Sparar...') : `${saveLabel} →`}
      </button>
      <div className="mt-5 flex items-center justify-between text-xs text-gray-400">
        {!isFirst ? (
          <button onClick={onBack} className="hover:text-gray-600 transition-colors">← Tillbaka</button>
        ) : <span />}
        <div className="flex items-center gap-4">
          <span className="hidden sm:block">Du kan alltid komma tillbaka och uppdatera detta senare.</span>
          <button onClick={onReset} className="hover:text-gray-600 transition-colors">↺ Börja om</button>
        </div>
      </div>
    </div>
  )
}

function DropZone({ file, accept, inputRef, onFile, label }: {
  file: File | null; accept: string; inputRef: React.RefObject<HTMLInputElement | null>
  onFile: (f: File) => void; label: string
}) {
  return (
    <div onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
      onDragOver={(e) => e.preventDefault()} onClick={() => inputRef.current?.click()}
      className="border-2 border-dashed border-gray-200 rounded-xl p-8 sm:p-10 text-center cursor-pointer hover:border-accent hover:bg-blue-50/30 transition-colors">
      <input ref={inputRef} type="file" accept={accept} className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
      {file ? (
        <div>
          <p className="text-sm font-medium text-primary">📄 {file.name}</p>
          <p className="text-xs text-gray-400 mt-1">Klicka för att byta fil</p>
        </div>
      ) : (
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-xs text-gray-400 mt-1">CSV, XLSX eller XLS</p>
        </div>
      )}
    </div>
  )
}

function PreviewTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="mt-5 overflow-x-auto">
      <p className="text-xs text-gray-400 mb-2">Förhandsgranskning (5 rader)</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-gray-400 text-xs">
            {headers.map((h) => <th key={h} className="text-left py-2 pr-4 font-medium last:text-right">{h}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function CostField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input type="number" placeholder="0" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
    </div>
  )
}
