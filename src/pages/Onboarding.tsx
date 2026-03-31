import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { fetchWithAuth } from '../utils/fetchWithAuth'

const API_URL = 'https://divine-warmth-production.up.railway.app/'

const STEPS = [
  { label: 'Ekonomi',  icon: '🏦' },
  { label: 'Fakturor', icon: '🧾' },
  { label: 'Kostnader', icon: '📦' },
  { label: 'Villkor',  icon: '📋' },
]

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
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
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
        dueDate:   String(r['Förfallodatum'] ?? r['DueDate']   ?? r['Due'] ?? ''),
        status:    status === 'Betald' ? 'Betald' : 'Obetald',
      }
    }))).catch(() => {})
  }

  const runImportFlow = async (file: File, type: 'bank' | 'invoice') => {
    console.log(`[IMPORT] Reading ${type} file:`, file.name)
    setProgressLabel('Läser fil...')
    const rows = await readFileAsRows(file)
    console.log(`[IMPORT] Parsed ${rows.length} rows`)

    console.log('[IMPORT] Fetching orgId...')
    const orgId = await getOrgId()
    console.log('[IMPORT] orgId:', orgId)

    const fileType = file.name.toLowerCase().endsWith('.csv') ? 'CSV' : 'XLSX'
    const body = { orgId, fileName: file.name, fileType, rows }

    setProgressLabel('Laddar upp...')
    const uploadRes = await fetchWithAuth(`${API_URL}api/v1/data-import/upload`, { method: 'POST', body: JSON.stringify(body) })
    console.log('[IMPORT] Upload status:', uploadRes.status)
    if (!uploadRes.ok) throw new Error(`Uppladdning misslyckades: ${await parseErrorMessage(uploadRes)}`)

    const uploadData = await uploadRes.json()
    console.log('[IMPORT] Upload response:', uploadData)
    const sessionId = uploadData?.data?.sessionId
    if (!sessionId) throw new Error('Ingen sessionId i svaret från servern.')

    setProgressLabel('Validerar...')
    const validateRes = await fetchWithAuth(`${API_URL}api/v1/data-import/${sessionId}/validate`, { method: 'POST' })
    console.log('[IMPORT] Validate status:', validateRes.status)
    if (!validateRes.ok) throw new Error(`Validering misslyckades: ${await parseErrorMessage(validateRes)}`)
    console.log('[IMPORT] Validate response:', await validateRes.json())

    setProgressLabel('Bekräftar...')
    const commitRes = await fetchWithAuth(`${API_URL}api/v1/data-import/${sessionId}/commit`, { method: 'POST' })
    console.log('[IMPORT] Commit status:', commitRes.status)
    if (!commitRes.ok) throw new Error(`Bekräftelse misslyckades: ${await parseErrorMessage(commitRes)}`)
    console.log('[IMPORT] Commit response:', await commitRes.json())
  }

  const goBack  = () => { setStepError(''); setProgressLabel(''); setStep(s => Math.max(0, s - 1)) }
  const doReset = () => {
    setStep(0); setCompletedSteps([false,false,false,false]); setStepError(''); setProgressLabel('')
    setBankFile(null); setBankRows([]); setInvoiceFile(null); setInvoiceRows([])
    setCosts({ rent:'', staff:'', leasing:'', other:'' }); setPaymentDays('30'); setPaymentType('Per projekt')
  }

  const saveStep1 = async () => {
    if (!bankFile) { setStepError('Välj en fil innan du fortsätter.'); return }
    setStepLoading(true); setStepError('')
    try { await runImportFlow(bankFile, 'bank'); markComplete(0); setStep(1) }
    catch (err) { setStepError(err instanceof Error ? err.message : 'Okänt fel') }
    setStepLoading(false); setProgressLabel('')
  }

  const saveStep2 = async () => {
    if (!invoiceFile) { setStepError('Välj en fil innan du fortsätter.'); return }
    setStepLoading(true); setStepError('')
    try { await runImportFlow(invoiceFile, 'invoice'); markComplete(1); setStep(2) }
    catch (err) { setStepError(err instanceof Error ? err.message : 'Okänt fel') }
    setStepLoading(false); setProgressLabel('')
  }

  const saveStep3 = async () => {
    setStepLoading(true); setStepError('')
    const body = { rent: Number(costs.rent), staff: Number(costs.staff), leasing: Number(costs.leasing), other: Number(costs.other) }
    console.log('[STEP 3] Posting fixed costs:', body)
    try {
      const res = await fetchWithAuth(`${API_URL}api/v1/data-import/fixed-costs`, { method: 'POST', body: JSON.stringify(body) })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      markComplete(2); setStep(3)
    } catch (err) { setStepError(`Kunde inte spara kostnader: ${err instanceof Error ? err.message : 'Okänt fel'}`) }
    setStepLoading(false)
  }

  const saveStep4 = async () => {
    setStepLoading(true); setStepError('')
    const body = { paymentDays: Number(paymentDays), billingType: paymentType }
    console.log('[STEP 4] Posting payment terms:', body)
    try {
      const res = await fetchWithAuth(`${API_URL}api/v1/data-import/payment-terms`, { method: 'POST', body: JSON.stringify(body) })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      markComplete(3); navigate('/dashboard')
    } catch (err) { setStepError(`Kunde inte spara villkor: ${err instanceof Error ? err.message : 'Okänt fel'}`) }
    setStepLoading(false)
  }

  const handlers = [saveStep1, saveStep2, saveStep3, saveStep4]
  const saveLabels = ['Spara bankdata', 'Spara fakturadata', 'Spara kostnader', 'Skapa min diagnos']

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-8 py-5 flex items-center justify-between shadow-sm">
        <span onClick={() => navigate('/')} className="font-bold text-xl text-[#1e3a5f] cursor-pointer tracking-tight select-none">
          RW Systems
        </span>
        <span className="text-sm text-gray-400 font-medium">Steg {step + 1} av {STEPS.length}</span>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-12">

        {/* Progress bar */}
        <div className="flex items-start justify-between mb-12 relative">
          {/* connecting lines */}
          {STEPS.map((_, i) => i < STEPS.length - 1 && (
            <div key={`line-${i}`} className="absolute top-5 h-0.5 transition-colors duration-300"
              style={{
                left: `calc(${(i / (STEPS.length - 1)) * 100}% + 1.25rem)`,
                width: `calc(${100 / (STEPS.length - 1)}% - 2.5rem)`,
                backgroundColor: completedSteps[i] ? '#2563eb' : '#e5e7eb',
              }}
            />
          ))}
          {STEPS.map(({ label }, i) => (
            <div key={label} className="flex flex-col items-center gap-2 z-10" style={{ width: `${100 / STEPS.length}%` }}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all duration-300
                ${completedSteps[i]
                  ? 'bg-[#2563eb] border-[#2563eb] text-white'
                  : i === step
                  ? 'bg-[#1e3a5f] border-[#1e3a5f] text-white shadow-md'
                  : 'bg-white border-gray-300 text-gray-400'}`}>
                {completedSteps[i] ? '✓' : i + 1}
              </div>
              <span className={`text-xs font-semibold text-center leading-tight
                ${i === step ? 'text-[#1e3a5f]' : completedSteps[i] ? 'text-[#2563eb]' : 'text-gray-400'}`}>
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg p-8">

          {/* Step header */}
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">{STEPS[step].icon}</span>
            <h1 className="text-2xl font-bold text-[#1e3a5f]">
              {['Importera bankdata', 'Importera fakturor', 'Fasta kostnader', 'Betalningsvillkor'][step]}
            </h1>
          </div>
          <p className="text-gray-500 text-sm mb-8 pl-11">
            {[
              'Ladda upp ditt kontoutdrag i CSV- eller Excel-format.',
              'Ladda upp fakturadata för att identifiera sena betalare.',
              'Ange dina månatliga fasta kostnader.',
              'Berätta hur du fakturerar dina kunder.',
            ][step]}
          </p>

          {/* Step 1 */}
          {step === 0 && (
            <>
              <UploadZone file={bankFile} inputRef={bankRef} onFile={handleBankFile} />
              {bankRows.length > 0 && (
                <PreviewTable headers={['Datum', 'Beskrivning', 'Belopp']}>
                  {bankRows.map((r, i) => (
                    <tr key={i} className="border-t border-gray-50 text-sm">
                      <td className="py-2.5 pr-4 text-gray-500 whitespace-nowrap">{r.date}</td>
                      <td className="py-2.5 pr-4 text-gray-700">{r.description}</td>
                      <td className="py-2.5 text-right text-gray-800 font-medium whitespace-nowrap">{r.amount}</td>
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
                <PreviewTable headers={['Kund', 'Faktura nr', 'Belopp', 'Förfaller', 'Status']}>
                  {invoiceRows.map((r, i) => (
                    <tr key={i} className="border-t border-gray-50 text-sm">
                      <td className="py-2.5 pr-3 text-gray-800 font-medium">{r.customer}</td>
                      <td className="py-2.5 pr-3 text-gray-500">{r.invoiceNr}</td>
                      <td className="py-2.5 pr-3 text-right text-gray-800">{r.amount}</td>
                      <td className="py-2.5 pr-3 text-gray-500 whitespace-nowrap">{r.dueDate}</td>
                      <td className="py-2.5">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${r.status === 'Betald' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <CostField icon="🏢" label="Hyra (kr/mån)"           value={costs.rent}    onChange={v => setCosts({...costs, rent: v})} />
              <CostField icon="👥" label="Personal totalt (kr/mån)" value={costs.staff}   onChange={v => setCosts({...costs, staff: v})} />
              <CostField icon="🚗" label="Leasing / Lån (kr/mån)"  value={costs.leasing} onChange={v => setCosts({...costs, leasing: v})} />
              <CostField icon="📦" label="Övrigt (kr/mån)"         value={costs.other}   onChange={v => setCosts({...costs, other: v})} />
            </div>
          )}

          {/* Step 4 */}
          {step === 3 && (
            <div className="flex flex-col gap-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Standard betalningsvillkor (dagar)</label>
                <input type="number" value={paymentDays} onChange={e => setPaymentDays(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3.5 text-sm shadow-sm outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 transition" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Hur tar du betalt?</label>
                <select value={paymentType} onChange={e => setPaymentType(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3.5 text-sm shadow-sm outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 transition bg-white appearance-none cursor-pointer">
                  <option>Per projekt</option>
                  <option>Löpande</option>
                  <option>Annat</option>
                </select>
              </div>
            </div>
          )}

          {/* Error */}
          {stepError && (
            <div className="mt-6 bg-red-50 border border-red-200 rounded-xl px-4 py-3.5 flex items-start gap-3">
              <span className="text-red-500 mt-0.5 shrink-0">⚠</span>
              <p className="text-red-600 text-sm leading-relaxed">{stepError}</p>
            </div>
          )}

          {/* Actions */}
          <div className="mt-8 flex items-center justify-between">
            <div className="flex items-center gap-5 text-xs text-gray-400">
              {step > 0 && (
                <button onClick={goBack} className="hover:text-gray-600 transition-colors font-medium flex items-center gap-1">
                  ← Tillbaka
                </button>
              )}
              <button onClick={doReset} className="hover:text-gray-600 transition-colors">↺ Börja om</button>
            </div>

            <button onClick={handlers[step]} disabled={stepLoading}
              className="flex items-center gap-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-semibold px-7 py-3.5 rounded-xl shadow-md hover:shadow-lg transition-all disabled:opacity-50 text-sm">
              {stepLoading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {stepLoading ? (progressLabel || 'Sparar...') : `${saveLabels[step]} →`}
            </button>
          </div>

          <p className="mt-4 text-center text-xs text-gray-400">Du kan alltid komma tillbaka och uppdatera detta senare.</p>
        </div>
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
      className={`rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-all select-none
        ${dragging ? 'bg-blue-100 border-blue-500' : file ? 'bg-green-50 border-green-300' : 'bg-blue-50 border-blue-300 hover:bg-blue-100 hover:border-blue-400'}`}
    >
      <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />

      {file ? (
        <div className="flex flex-col items-center gap-2">
          <span className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-2xl">✓</span>
          <p className="font-semibold text-green-700 text-sm">{file.name}</p>
          <p className="text-xs text-gray-500">{formatBytes(file.size)} — Klicka för att byta fil</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <span className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </span>
          <div>
            <p className="text-base font-semibold text-gray-700">Dra och släpp din fil här</p>
            <p className="text-sm text-gray-500 mt-1">CSV, XLSX eller XLS — max 10 MB</p>
          </div>
          <span className="text-xs text-[#2563eb] font-medium border border-[#2563eb]/30 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors">
            Välj fil från datorn
          </span>
        </div>
      )}
    </div>
  )
}

function PreviewTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="mt-6 overflow-x-auto rounded-xl border border-gray-100">
      <p className="text-xs text-gray-400 px-4 pt-3 pb-1 font-medium">Förhandsgranskning — 5 rader</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-xs text-gray-400 bg-gray-50">
            {headers.map(h => <th key={h} className="text-left px-4 py-2.5 font-semibold last:text-right">{h}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function CostField({ icon, label, value, onChange }: {
  icon: string; label: string; value: string; onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
        <span>{icon}</span> {label}
      </label>
      <input type="number" placeholder="0" value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-xl px-4 py-3.5 text-sm shadow-sm outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 transition" />
    </div>
  )
}
