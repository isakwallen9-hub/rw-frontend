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
      } catch { reject(new Error('Kunde inte läsa filen. Kontrollera att det är en giltig Excel- eller CSV-fil.')) }
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

const STEP_LABELS: Record<Step, string> = {
  idle: '',
  reading: 'Läser fil...',
  uploading: 'Laddar upp...',
  validating: 'Validerar data...',
  committing: 'Bekräftar import...',
  done: 'Import klar!',
  error: '',
}

export default function Import() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [rowCount, setRowCount] = useState<number | null>(null)
  const [step, setStep] = useState<Step>('idle')
  const [error, setError] = useState('')

  const handleFileChange = async (f: File) => {
    setFile(f)
    setStep('idle')
    setError('')
    setRowCount(null)
    try {
      const rows = await readFileAsRows(f)
      setRowCount(rows.length)
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
    setStep('idle')
    setError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const isRunning = ['reading', 'uploading', 'validating', 'committing'].includes(step)
  const progress = { reading: 10, uploading: 35, validating: 65, committing: 90, done: 100, idle: 0, error: 0 }[step]

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <Navbar />
      <div className="max-w-xl mx-auto px-4 sm:px-8 py-10">

        <button onClick={() => navigate('/dashboard')} className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1.5 mb-6">
          ← Tillbaka
        </button>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">Importera data</h1>
        <p className="text-sm text-gray-500 mb-8">Ladda upp en Excel- eller CSV-fil med transaktioner för att uppdatera din data.</p>

        {step === 'done' ? (
          /* Success state */
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-8 text-center">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Import klar!</h2>
            <p className="text-sm text-gray-500 mb-6">
              {rowCount !== null ? `${rowCount} rader` : 'Datan'} har importerats och är nu tillgänglig i dashboarden.
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => navigate('/dashboard')}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors">
                Gå till dashboard
              </button>
              <button onClick={reset}
                className="px-5 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:border-gray-300 transition-colors">
                Importera igen
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6">

            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => !isRunning && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl px-6 py-10 text-center transition-colors mb-5 ${
                isRunning ? 'border-gray-100 bg-gray-50 cursor-default' : 'border-gray-200 hover:border-blue-400 cursor-pointer'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileChange(f) }}
              />
              {file ? (
                <div>
                  <p className="text-sm font-semibold text-gray-800">{file.name}</p>
                  {rowCount !== null && (
                    <p className="text-xs text-gray-400 mt-1">{rowCount} rader hittades</p>
                  )}
                  {!isRunning && (
                    <button
                      onClick={e => { e.stopPropagation(); reset() }}
                      className="mt-3 text-xs text-gray-400 hover:text-gray-600 underline">
                      Välj annan fil
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm font-medium text-gray-600 mb-1">Dra och släpp en fil här</p>
                  <p className="text-xs text-gray-400">eller klicka för att välja — Excel (.xlsx) eller CSV</p>
                </div>
              )}
            </div>

            {/* Progress bar */}
            {isRunning && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-gray-500">{STEP_LABELS[step]}</span>
                  <span className="text-xs text-gray-400">{progress}%</span>
                </div>
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Error */}
            {step === 'error' && error && (
              <div className="mb-4 bg-red-50 border border-red-100 text-red-600 rounded-xl px-4 py-3 text-sm">
                {error}
              </div>
            )}

            {/* Action button */}
            <button
              onClick={runImport}
              disabled={!file || isRunning}
              className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isRunning ? STEP_LABELS[step] : 'Importera'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}