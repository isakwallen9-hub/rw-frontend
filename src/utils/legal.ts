import { fetchWithAuth } from './fetchWithAuth'

const API_URL = import.meta.env.VITE_API_URL as string

// Backend enum (src/modules/legal/schema.ts): terms, dpa, privacy.
export type LegalDocType = 'terms' | 'dpa' | 'privacy'
export const LEGAL_DOC_TYPES: LegalDocType[] = ['terms', 'dpa', 'privacy']

// GET /api/v1/legal/documents/:type → { success, data: { documentType, version, text, documentHash } }
export interface LegalDocument {
  documentType: LegalDocType
  version: string
  text: string
  documentHash: string
}

// Fetches the archived raw text + current version for a document. The frontend
// never derives its own text or hash — it displays and submits exactly this.
export async function fetchLegalDocument(type: LegalDocType): Promise<LegalDocument> {
  const res = await fetchWithAuth(`${API_URL}api/v1/legal/documents/${type}`)
  if (!res.ok) throw new Error(`legal document ${type} http ${res.status}`)
  const d = (await res.json())?.data ?? {}
  return {
    documentType: type,
    version: String(d.version ?? ''),
    text: String(d.text ?? ''),
    documentHash: String(d.documentHash ?? ''),
  }
}
