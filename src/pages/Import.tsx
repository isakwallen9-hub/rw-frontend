import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import Navbar from '../components/Navbar'
import { fetchWithAuth } from '../utils/fetchWithAuth'

const API_URL = import.meta.env.VITE_API_URL as string

function readFileAsRows(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target?.result, { type: 'array' })
        resolve(XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]))
      } catch {
        reject(new Error('Kunde inte läsa filen. Kontrollera att det är en giltig Excel- eller CSV-fil.'))
      }
    }
    reader.onerror = () => reject(new Error('Kunde inte läsa filen.'))
    reader.readAsArrayBuffer(file)
  })
}

async function getOrgId(): Promise<string> {
  const res = await fetchWithAuth(`${API_URL}api/v1/organisation`)
  if (!res.ok) throw new Error(`Kunde inte hämta organisation (HTTP ${res.status}).`)
  const json = await res.json()
  const orgId = json?.data?.id
  if (!orgId) throw new Error('Inget orgId i svaret från servern.')
  return String(orgId)
}

type Step = 'idle' | 'reading' | 'uploading' | 'validating' | 'committing' | 'done' | 'error'

const STEP_MESSAGES: Record<Step, { heading: string; sub: string }> = {
  idle:       { heading: '',                    sub: '' },
  reading:    { heading: 'Läser din fil…',      sub: 'Ett ögonblick.' },
  uploading:  { heading: 'Laddar upp…',         sub: 'Vi skickar filen till servern.' },
  validating: { heading: 'Analyserar din fil…', sub: 'Vi kontrollerar att allt ser bra ut.' },
  committing: { heading: 'Sparar datan…',       sub: 'Snart klart!' },
  done:       { heading: 'Import klar!',        sub: '' },
  error:      { heading: '',                    sub: '' },
}

const PROGRESS: Record<Step, number> = {
  idle: 0, reading: 15, uploading: 40, validating: 70, committing: 92, done: 100, error: 0,
}

const STEPS = [
  {
    num: '1',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    label: 'Välj din fil',
  },
  {
    num: '2',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    label: 'Vi analyserar automatiskt',
  },
  {
    num: '3',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    label: 'Klart!',
  },
]

export default function Import() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [rowCount, setRowCount] = useState<number | null>(null)
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([])
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([])
  const [step, setStep] = useState<Step>('idle')
  const [error, setError] = useState('')

  const handleFileChange = async (f: File) => {
    setFile(f)
    setStep('idle')
    setError('')
    setRowCount(null)
    setPreviewRows([])
    setPreviewHeaders([])
    try {
      const rows = await readFileAsRows(f)
      setRowCount(rows.length)
      if (rows.length > 0) {
        setPreviewHeaders(Object.keys(rows[0]))
        setPreviewRows(rows.slice(0, 5))
      }
    } catch {
      setRowCount(null)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) handleFileChange(f)
  }

  const runImport = async () => {
    if (!file) return
    setError('')

    try {
      setStep('reading')
      const rows = await readFileAsRows(file)

      const orgId = await getOrgId()
      const fileType = file.name.toLowerCase().endsWith('.csv') ? 'CSV' : 'XLSX'

      setStep('uploading')
      const uploadRes = await fetchWithAuth(`${API_URL}api/v1/data-import/upload`, {
        method: 'POST',
        body: JSON.stringify({ orgId, fileName: file.name, fileType, rows }),
      })
      if (!uploadRes.ok) {
        const json = await uploadRes.json().catch(() => ({}))
        throw new Error(json?.error?.message ?? json?.message ?? `Uppladdning misslyckades (HTTP ${uploadRes.status}).`)
      }
      const uploadJson = await uploadRes.json()
      const sessionId = uploadJson?.data?.sessionId
      if (!sessionId) throw new Error('Ingen sessionId i svaret från servern.')

      setStep('validating')
      const validateRes = await fetchWithAuth(`${API_URL}api/v1/data-import/${sessionId}/validate`, { method: 'POST' })
      if (!validateRes.ok) {
        const json = await validateRes.json().catch(() => ({}))
        throw new Error(json?.error?.message ?? json?.message ?? `Validering misslyckades (HTTP ${validateRes.status}).`)
      }

      setStep('committing')
      const commitRes = await fetchWithAuth(`${API_URL}api/v1/data-import/${sessionId}/commit`, { method: 'POST' })
      if (!commitRes.ok) {
        const json = await commitRes.json().catch(() => ({}))
        throw new Error(json?.error?.message ?? json?.message ?? `Bekräftelse misslyckades (HTTP ${commitRes.status}).`)
      }

      setStep('done')
    } catch (err) {
      setStep('error')
      setError(err instanceof Error ? err.message : 'Något gick fel. Försök igen.')
    }
  }

  const reset = () => {
    setFile(null)
    setRowCount(null)
    setPreviewRows([])
    setPreviewHeaders([])
    setStep('idle')
    setError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const isRunning = ['reading', 'uploading', 'validating', 'committing'].includes(step)
  const progress = PROGRESS[step]
  const msg = STEP_MESSAGES[step]

  // ── Done state ─────────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className="min-h-screen bg-gray-50 font-sans">
        <Navbar />
        <div className="max-w-lg mx-auto px-4 sm:px-8 py-16 text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Import klar!</h1>
          <p className="text-gray-500 mb-8">
            {rowCount !== null ? `${rowCount} rader` : 'Datan'} är nu importerade och tillgängliga i dashboarden.
          </p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => navigate('/dashboard')}
              className="px-6 py-3 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-sm">
              Gå till dashboard →
            </button>
            <button onClick={reset}
              className="px-6 py-3 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:border-gray-300 transition-colors">
              Importera igen
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Main flow ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-10">

        <button onClick={() => navigate('/dashboard')} className="text-sm text-gray-400 hover:text-gray-700 flex items-center gap-1.5 mb-8">
          ← Tillbaka
        </button>

        {/* Welcome heading */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Ladda upp din ekonomifil</h1>
          <p className="text-gray-500 text-base">Vi tar hand om resten automatiskt.</p>
        </div>

        {/* Step guide */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {STEPS.map((s, i) => (
            <div key={s.num} className="flex flex-col items-center text-center gap-2">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                i === 0 ? 'bg-blue-100 text-blue-600' :
                i === 1 ? 'bg-purple-100 text-purple-600' :
                'bg-green-100 text-green-600'
              }`}>
                {s.icon}
              </div>
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">{s.num}</span>
              <p className="text-sm font-medium text-gray-700 leading-tight">{s.label}</p>
            </div>
          ))}
        </div>

        {/* File requirements */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-6 flex gap-3 items-start">
          <svg className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-blue-700 leading-relaxed">
            Din fil kan vara en <strong>Excel-fil (.xlsx)</strong> eller <strong>CSV-fil</strong>.
            Den behöver ha kolumner för datum och belopp — det spelar ingen roll vad de heter, vi hittar dem automatiskt!
          </p>
        </div>

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => !isRunning && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl flex flex-col items-center justify-center py-16 px-8 text-center transition-colors mb-6 ${
            isRunning
              ? 'border-gray-200 bg-gray-50 cursor-default'
              : file
              ? 'border-blue-300 bg-blue-50 cursor-pointer hover:border-blue-400'
              : 'border-gray-300 bg-white cursor-pointer hover:border-blue-400 hover:bg-blue-50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFileChange(f) }}
          />

          {/* Running state */}
          {isRunning ? (
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              <div>
                <p className="text-base font-semibold text-gray-800">{msg.heading}</p>
                <p className="text-sm text-gray-400 mt-1">{msg.sub}</p>
              </div>
              <div className="w-48">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400">{progress}%</span>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-700"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>
          ) : file ? (
            /* File selected */
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-1">
                <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-base font-semibold text-gray-900">{file.name}</p>
              {rowCount !== null && (
                <p className="text-sm text-gray-500">{rowCount} rader hittades</p>
              )}
              <button
                onClick={e => { e.stopPropagation(); reset() }}
                className="mt-2 text-xs text-gray-400 hover:text-gray-600 underline">
                Välj en annan fil
              </button>
            </div>
          ) : (
            /* Empty state */
            <>
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <p className="text-lg font-semibold text-gray-700 mb-1">Dra hit din fil eller klicka för att välja</p>
              <p className="text-sm text-gray-400">Excel (.xlsx) eller CSV</p>
            </>
          )}
        </div>

        {/* Preview table */}
        {file && previewRows.length > 0 && !isRunning && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-sm font-semibold text-gray-700">
                Stämmer detta? Klicka <em>Importera</em> för att fortsätta.
              </p>
            </div>
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {previewHeaders.map(h => (
                        <th key={h} className="text-left px-4 py-2.5 font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} className={`${i !== 0 ? 'border-t border-gray-50' : ''} ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}>
                        {previewHeaders.map(h => (
                          <td key={h} className="px-4 py-2.5 text-gray-600 whitespace-nowrap max-w-[160px] truncate">
                            {String(row[h] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rowCount !== null && rowCount > 5 && (
                <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
                  Visar de 5 första raderna av {rowCount} totalt
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error */}
        {step === 'error' && error && (
          <div className="mb-5 bg-red-50 border border-red-100 text-red-600 rounded-xl px-4 py-3 text-sm flex gap-2 items-start">
            <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        {/* Import button */}
        <button
          onClick={runImport}
          disabled={!file || isRunning}
          className="w-full py-3.5 bg-blue-600 text-white text-base font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
        >
          {isRunning ? msg.heading : 'Importera'}
        </button>

      </div>
    </div>
  )
}