import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

const STEPS = ['Ekonomi', 'Fakturor', 'Kostnader', 'Villkor']

type BankRow = { date: string; description: string; amount: string }
type InvoiceRow = { customer: string; invoiceNr: string; amount: string; dueDate: string; status: 'Betald' | 'Obetald' }

export default function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<boolean[]>([false, false, false, false])

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

  const parseBankCsv = (file: File) => {
    setBankFile(file)
    const reader = new FileReader()
    reader.onload = (e) => {
      const lines = (e.target?.result as string).split('\n').filter(Boolean).slice(1)
      setBankRows(lines.slice(0, 5).map((line) => {
        const [date, description, amount] = line.split(',')
        return { date: date?.trim() ?? '', description: description?.trim() ?? '', amount: amount?.trim() ?? '' }
      }))
    }
    reader.readAsText(file)
  }

  const parseInvoiceCsv = (file: File) => {
    setInvoiceFile(file)
    const reader = new FileReader()
    reader.onload = (e) => {
      const lines = (e.target?.result as string).split('\n').filter(Boolean).slice(1)
      setInvoiceRows(lines.slice(0, 5).map((line) => {
        const [customer, invoiceNr, amount, dueDate, status] = line.split(',')
        return {
          customer: customer?.trim() ?? '',
          invoiceNr: invoiceNr?.trim() ?? '',
          amount: amount?.trim() ?? '',
          dueDate: dueDate?.trim() ?? '',
          status: (status?.trim() === 'Betald' ? 'Betald' : 'Obetald') as 'Betald' | 'Obetald',
        }
      }))
    }
    reader.readAsText(file)
  }

  const goNext = () => {
    markComplete(step)
    setStep((s) => s + 1)
  }

  const goBack = () => setStep((s) => Math.max(0, s - 1))

  const reset = () => {
    setStep(0)
    setCompletedSteps([false, false, false, false])
    setBankFile(null); setBankRows([])
    setInvoiceFile(null); setInvoiceRows([])
    setCosts({ rent: '', staff: '', leasing: '', other: '' })
    setPaymentDays('30'); setPaymentType('Per projekt')
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-8 py-4 flex items-center justify-between">
        <span
          className="font-bold text-xl text-primary cursor-pointer"
          onClick={() => navigate('/')}
        >
          RW Systems
        </span>
        <span className="text-sm text-gray-400">Steg {step + 1} av {STEPS.length}</span>
      </div>

      <div className="max-w-2xl mx-auto px-8 py-10">
        {/* Progress-bar */}
        <div className="flex items-center gap-2 mb-10">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2 flex-1 min-w-0">
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
                <div className={`flex-1 h-0.5 ${completedSteps[i] ? 'bg-green-400' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Steg-innehåll */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          {step === 0 && (
            <StepWrapper
              title="Importera bankdata"
              description="Ladda upp din kontoutdrag i CSV- eller Excel-format."
              onBack={goBack} onReset={reset} isFirst
            >
              <DropZone
                accept=".csv,.xlsx,.xls"
                file={bankFile}
                inputRef={bankRef}
                onFile={parseBankCsv}
                label="Dra och släpp CSV/Excel här, eller klicka för att välja"
              />
              {bankRows.length > 0 && (
                <div className="mt-6 overflow-x-auto">
                  <p className="text-xs text-gray-400 mb-2">Förhandsgranskning (5 rader)</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-gray-500 text-xs">
                        <th className="text-left py-2 pr-4 font-medium">Datum</th>
                        <th className="text-left py-2 pr-4 font-medium">Beskrivning</th>
                        <th className="text-right py-2 font-medium">Belopp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bankRows.map((r, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="py-2 pr-4 text-gray-600">{r.date}</td>
                          <td className="py-2 pr-4 text-gray-800">{r.description}</td>
                          <td className="py-2 text-right text-gray-800">{r.amount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <button onClick={goNext} className="mt-6 w-full bg-accent text-white font-semibold py-3 rounded-lg hover:opacity-90 transition-opacity text-sm">
                Spara import →
              </button>
            </StepWrapper>
          )}

          {step === 1 && (
            <StepWrapper
              title="Importera fakturor / kundreskontra"
              description="Ladda upp fakturadata för att identifiera sena betalare."
              onBack={goBack} onReset={reset}
            >
              <DropZone
                accept=".csv,.xlsx,.xls"
                file={invoiceFile}
                inputRef={invoiceRef}
                onFile={parseInvoiceCsv}
                label="Dra och släpp CSV/Excel här, eller klicka för att välja"
              />
              {invoiceRows.length > 0 && (
                <div className="mt-6 overflow-x-auto">
                  <p className="text-xs text-gray-400 mb-2">Förhandsgranskning (5 rader)</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-gray-500 text-xs">
                        <th className="text-left py-2 pr-3 font-medium">Kund</th>
                        <th className="text-left py-2 pr-3 font-medium">Faktura nr</th>
                        <th className="text-right py-2 pr-3 font-medium">Belopp</th>
                        <th className="text-left py-2 pr-3 font-medium">Förfaller</th>
                        <th className="text-left py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoiceRows.map((r, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="py-2 pr-3 text-gray-800">{r.customer}</td>
                          <td className="py-2 pr-3 text-gray-600">{r.invoiceNr}</td>
                          <td className="py-2 pr-3 text-right text-gray-800">{r.amount}</td>
                          <td className="py-2 pr-3 text-gray-600">{r.dueDate}</td>
                          <td className="py-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.status === 'Betald' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <button onClick={goNext} className="mt-6 w-full bg-accent text-white font-semibold py-3 rounded-lg hover:opacity-90 transition-opacity text-sm">
                Spara fakturadata →
              </button>
            </StepWrapper>
          )}

          {step === 2 && (
            <StepWrapper
              title="Fasta kostnader"
              description="Ange dina månatliga fasta kostnader för en korrekt analys."
              onBack={goBack} onReset={reset}
            >
              <div className="grid grid-cols-2 gap-4 mt-2">
                <CostField label="Hyra (kr/mån)" value={costs.rent} onChange={(v) => setCosts({ ...costs, rent: v })} />
                <CostField label="Personal totalt (kr/mån)" value={costs.staff} onChange={(v) => setCosts({ ...costs, staff: v })} />
                <CostField label="Leasing / Lån (kr/mån)" value={costs.leasing} onChange={(v) => setCosts({ ...costs, leasing: v })} />
                <CostField label="Övrigt (kr/mån)" value={costs.other} onChange={(v) => setCosts({ ...costs, other: v })} />
              </div>
              <button onClick={goNext} className="mt-6 w-full bg-accent text-white font-semibold py-3 rounded-lg hover:opacity-90 transition-opacity text-sm">
                Spara fasta kostnader →
              </button>
            </StepWrapper>
          )}

          {step === 3 && (
            <StepWrapper
              title="Betalningsvillkor"
              description="Berätta hur du fakturerar dina kunder."
              onBack={goBack} onReset={reset}
            >
              <div className="flex flex-col gap-5 mt-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Standard betalningsvillkor (dagar)
                  </label>
                  <input
                    type="number"
                    value={paymentDays}
                    onChange={(e) => setPaymentDays(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Hur tar du betalt?
                  </label>
                  <select
                    value={paymentType}
                    onChange={(e) => setPaymentType(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent bg-white"
                  >
                    <option>Per projekt</option>
                    <option>Löpande</option>
                    <option>Annat</option>
                  </select>
                </div>
              </div>
              <button
                onClick={() => { markComplete(3); navigate('/dashboard') }}
                className="mt-6 w-full bg-primary text-white font-semibold py-3 rounded-lg hover:opacity-90 transition-opacity text-sm"
              >
                Skapa min diagnos →
              </button>
            </StepWrapper>
          )}
        </div>
      </div>
    </div>
  )
}

function StepWrapper({
  title, description, children, onBack, onReset, isFirst,
}: {
  title: string
  description: string
  children: React.ReactNode
  onBack: () => void
  onReset: () => void
  isFirst?: boolean
}) {
  return (
    <div>
      <h2 className="text-xl font-bold text-primary mb-1">{title}</h2>
      <p className="text-gray-500 text-sm mb-6">{description}</p>
      {children}
      <div className="mt-6 flex items-center justify-between text-xs text-gray-400">
        {!isFirst ? (
          <button onClick={onBack} className="hover:text-gray-600 transition-colors">← Tillbaka</button>
        ) : <span />}
        <div className="flex items-center gap-4">
          <span>Du kan alltid komma tillbaka och uppdatera detta senare.</span>
          <button onClick={onReset} className="hover:text-gray-600 transition-colors">↺ Börja om</button>
        </div>
      </div>
    </div>
  )
}

function DropZone({
  file, accept, inputRef, onFile, label,
}: {
  file: File | null
  accept: string
  inputRef: React.RefObject<HTMLInputElement | null>
  onFile: (f: File) => void
  label: string
}) {
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={() => inputRef.current?.click()}
      className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center cursor-pointer hover:border-accent hover:bg-blue-50/30 transition-colors"
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }}
      />
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

function CostField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type="number"
        placeholder="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
      />
    </div>
  )
}
