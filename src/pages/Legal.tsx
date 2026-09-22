import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchLegalDocument, type LegalDocType, type LegalDocument } from '../utils/legal'

// Renders a legal document fetched from GET /api/v1/legal/documents/:type. The
// raw archived text is shown verbatim — the same text that is submitted for
// hashing — so the page and the hash can never drift apart.
function LegalPage({ type }: { type: LegalDocType }) {
  const [doc, setDoc] = useState<LegalDocument | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setDoc(null)
    setError(false)
    fetchLegalDocument(type)
      .then(d => { if (!cancelled) setDoc(d) })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [type])

  return (
    <div className="font-sans min-h-screen">
      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-12">
        <Link to="/dashboard" className="text-sm text-ink-400 hover:text-ink-700 transition-colors">← Tillbaka</Link>

        {error ? (
          <p className="mt-6 text-sm text-negative-600">Kunde inte hämta dokumentet just nu. Försök igen senare.</p>
        ) : !doc ? (
          <div className="mt-6 flex flex-col gap-3">
            {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-4 rounded-2xl" style={{ width: `${90 - i * 8}%` }} />)}
          </div>
        ) : (
          <>
            <p className="text-xs text-ink-400 mt-6 mb-4">Version {doc.version}</p>
            <div className="text-sm text-ink-700 leading-relaxed whitespace-pre-wrap">{doc.text}</div>
          </>
        )}
      </div>
    </div>
  )
}

export function Terms() {
  return <LegalPage type="terms" />
}

export function DataProcessingAgreement() {
  return <LegalPage type="dpa" />
}

export function PrivacyPolicy() {
  return <LegalPage type="privacy" />
}
