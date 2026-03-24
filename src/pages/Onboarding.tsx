import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchWithAuth, fetchFormWithAuth } from '../utils/fetchWithAuth'

const API_URL = 'https://divine-warmth-production.up.railway.app/'
const STEPS = ['Ekonomi', 'Fakturor', 'Kostnader', 'Villkor']

type BankRow = { date: string; description: string; amount: string }
type InvoiceRow = { customer: string; invoiceNr: string; amount: string; dueDate: string; status: 'Betald' | 'Obetald' }

export default function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<boolean[]>([false, false, false, false])
  const [stepLoading, setStepLoading] = useState(false)
  const [stepError, setStepError] = useState('')

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

  const parseCsvPreview = (file: File, onRows: (rows: string[][]) => void) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const lines = (e.target?.result as string).split('\n').filter(Boolean).slice(1, 6)
      onRows(lines.map((l) => l.split(',')))
    }
    reader.readAsText(file)
  }

  const handleBankFile = (file: File) => {
    setBankFile(file)
    parseCsvPreview(file, (rows) => {
      setBankRows(rows.map(([date, description, amount]) => ({
        date: date?.trim() ?? '', description: description?.trim() ?? '', amount: amount?.trim() ?? '',
      })))
    })
  }

  const handleInvoiceFile = (file: File) => {
    setInvoiceFile(file)
    parseCsvPreview(file, (rows) => {
      setInvoiceRows(rows.map(([customer, invoiceNr, amount, dueDate, status]) => ({
        customer: customer?.trim() ?? '', invoiceNr: invoiceNr?.trim() ?? '',
        amount: amount?.trim() ?? '', dueDate: dueDate?.trim() ?? '',
        status: status?.trim() === 'Betald' ? 'Betald' : 'Obetald',
      })))
    })
  }

  const goBack = () => { setStepError(''); setStep((s) => Math.max(0, s - 1)) }

  const reset = () => {
    setStep(0); setCompletedSteps([false, false, false, false]); setStepError('')
    setBankFile(null); setBankRows([]); setInvoiceFile(null); setInvoiceRows([])
    setCosts({ rent: '', staff: '', leasing: '', other: '' })
    setPaymentDays('30'); setPaymentType('Per projekt')
  }

  const saveStep1 = async () => {
    if (!bankFile) { setStepError('Välj en fil innan du fortsätter.'); return }
    setStepLoading(true); setStepError('')
    try {
      const fd = new FormData()
      fd.append('file', bankFile)
      const res = await fetchFormWithAuth(`${API_URL}api/v1/bank-transactions/upload`, fd)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      markComplete(0); setStep(1)
    } catch {
      setStepError('Uppladdning misslyckades. Kontrollera filen och försök igen.')
    }
    setStepLoading(false)
  }

  const saveStep2 = async () => {
    if (!invoiceFile) { setStepError('Välj en fil innan du fortsätter.'); return }
    setStepLoading(true); setStepError('')
    try {
      const fd = new FormData()
      fd.append('file', invoiceFile)
      const res = await fetchFormWithAuth(`${API_URL}api/v1/invoices/upload`, fd)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      markComplete(1); setStep(2)
    } catch {
      setStepError('Uppladdning misslyckades. Kontrollera filen och försök igen.')
    }
    setStepLoading(false)
  }

  const saveStep3 = async () => {
    setStepLoading(true); setStepError('')
    try {
      const res = await fetchWithAuth(`${API_URL}api/v1/fixed-costs`, {
        method: 'POST',
        body: JSON.stringify({
          rent: Number(costs.rent), staff: Number(costs.staff),
          leasing: Number(costs.leasing), other: Number(costs.other),
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      markComplete(2); setStep(3)
    } catch {
      setStepError('Kunde inte spara kostnader. Försök igen.')
    }
    setStepLoading(false)
  }

  const saveStep4 = async () => {
    setStepLoading(true); setStepError('')
    try {
      const res = await fetchWithAuth(`${API_URL}api/v1/payment-terms`, {
        method: 'POST',
        body: JSON.stringify({ paymentDays: Number(paymentDays), billingType: paymentType }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      markComplete(3); navigate('/dashboard')
    } catch {
      setStepError('Kunde inte spara villkor. Försök igen.')
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
              onBack={goBack} onReset={reset} isFirst loading={stepLoading} error={stepError} onSave={saveStep1} saveLabel="Spara import">
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
              onBack={goBack} onReset={reset} loading={stepLoading} error={stepError} onSave={saveStep2} saveLabel="Spara fakturadata">
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
              onBack={goBack} onReset={reset} loading={stepLoading} error={stepError} onSave={saveStep3} saveLabel="Spara fasta kostnader">
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
              onBack={goBack} onReset={reset} loading={stepLoading} error={stepError} onSave={saveStep4} saveLabel="Skapa min diagnos">
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

function StepShell({ title, description, children, onBack, onReset, isFirst, loading, error, onSave, saveLabel }: {
  title: string; description: string; children: React.ReactNode
  onBack: () => void; onReset: () => void; isFirst?: boolean
  loading: boolean; error: string; onSave: () => void; saveLabel: string
}) {
  return (
    <div>
      <h2 className="text-xl font-bold text-primary mb-1">{title}</h2>
      <p className="text-gray-500 text-sm mb-6">{description}</p>
      {children}
      {error && <p className="mt-4 text-red-500 text-sm">{error}</p>}
      <button onClick={onSave} disabled={loading}
        className="mt-6 w-full bg-accent text-white font-semibold py-3 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 text-sm flex items-center justify-center gap-2">
        {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
        {loading ? 'Sparar...' : `${saveLabel} →`}
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
