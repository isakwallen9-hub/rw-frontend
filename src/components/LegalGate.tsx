import { useEffect, useState, type ReactNode } from 'react'
import { fetchWithAuth } from '../utils/fetchWithAuth'
import { fetchLegalDocument, LEGAL_DOC_TYPES, type LegalDocument } from '../utils/legal'

const API_URL = import.meta.env.VITE_API_URL as string

// The short consent paragraph shown in the modal as display text only. It is NOT
// what gets hashed — each document's full archived text is submitted instead.
const CONSENT_TEXT =
  'Genom att fortsätta bekräftar du att du har rätt att företräda ditt företag och accepterar RW Systems ' +
  'användarvillkor och personuppgiftsbiträdesavtal. Du bekräftar också att du har tagit del av integritetspolicyn.'

const CONSENT_LINKS: { phrase: string; href: string }[] = [
  { phrase: 'användarvillkor', href: '/villkor' },
  { phrase: 'personuppgiftsbiträdesavtal', href: '/personuppgiftsbitradesavtal' },
  { phrase: 'integritetspolicyn', href: '/integritetspolicy' },
]

// Render CONSENT_TEXT with the document names turned into links.
function renderConsent(): ReactNode {
  const out: ReactNode[] = []
  let rest = CONSENT_TEXT
  let key = 0
  while (rest.length) {
    let best: { idx: number; phrase: string; href: string } | null = null
    for (const l of CONSENT_LINKS) {
      const idx = rest.indexOf(l.phrase)
      if (idx !== -1 && (best === null || idx < best.idx)) best = { idx, phrase: l.phrase, href: l.href }
    }
    if (!best) { out.push(rest); break }
    if (best.idx > 0) out.push(rest.slice(0, best.idx))
    out.push(<LegalLink key={key++} href={best.href}>{best.phrase}</LegalLink>)
    rest = rest.slice(best.idx + best.phrase.length)
  }
  return out
}

// Blocks the authenticated app with a consent modal until the legal documents
// are accepted. Renders children underneath the (optional) modal.
export default function LegalGate({ children }: { children: ReactNode }) {
  const [needsAcceptance, setNeedsAcceptance] = useState(false)
  const [docs, setDocs] = useState<LegalDocument[] | null>(null)
  const [checked, setChecked] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('accessToken')
    if (!token || token === 'undefined' || token === 'null') return
    let cancelled = false
    fetchWithAuth(`${API_URL}api/v1/legal/status`)
      .then(r => r.json())
      .then(json => {
        if (cancelled) return
        // GET /legal/status → { data: { allAccepted, documents: {...} } }
        const needs = (json as { data?: { allAccepted?: boolean } })?.data?.allAccepted === false
        setNeedsAcceptance(needs)
        if (!needs) return
        // Fetch each document's archived text + version so they can be submitted
        // verbatim on accept.
        return Promise.all(LEGAL_DOC_TYPES.map(fetchLegalDocument))
          .then(list => { if (!cancelled) setDocs(list) })
      })
      .catch(() => { /* fail open — never lock the user out on a status error */ })
    return () => { cancelled = true }
  }, [])

  const accept = async () => {
    if (!docs) return
    setSubmitting(true)
    setError('')
    try {
      // Submit each document's text and version exactly as received from the
      // documents endpoint — no client-side hashing or transformation.
      await Promise.all(docs.map(async doc => {
        const res = await fetchWithAuth(`${API_URL}api/v1/legal/accept`, {
          method: 'POST',
          body: JSON.stringify({ documentType: doc.documentType, version: doc.version, documentText: doc.text }),
        })
        if (!res.ok) throw new Error(`accept ${doc.documentType} failed`)
      }))
      setNeedsAcceptance(false)
    } catch {
      setError('Något gick fel när villkoren skulle accepteras. Försök igen.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {children}
      {needsAcceptance && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-ink-900/25 backdrop-blur-md">
          <div className="bg-white rounded-2xl shadow-[0_24px_64px_rgba(26,25,32,0.18)] w-full max-w-lg p-7 animate-in" role="alertdialog" aria-modal="true">
            <h2 className="text-2xl text-ink-900 mb-4">Innan du fortsätter</h2>

            <p className="text-sm text-ink-600 leading-relaxed">{renderConsent()}</p>

            <label className="flex items-start gap-3 mt-5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={checked}
                onChange={e => setChecked(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500/40 shrink-0"
              />
              <span className="text-sm text-ink-700">Jag har läst och accepterar villkoren ovan.</span>
            </label>

            {error && <p className="mt-4 text-sm text-negative-600">{error}</p>}

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => void accept()}
                disabled={!checked || submitting || !docs}
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 active:scale-[0.98] transition-[transform,background-color] duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {submitting ? 'Sparar…' : 'Acceptera och fortsätt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function LegalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand-600 font-medium underline hover:text-brand-700 transition-colors">
      {children}
    </a>
  )
}
