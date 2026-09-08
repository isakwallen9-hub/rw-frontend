// Shared handling for the 409 conflict a commit can return when a file looks
// like it was already imported (duplicate) or partially overlaps existing data.
//
// Assumed 409 body shape (isolated here so it is a one-line change if it differs):
//   { error: { code?: string, message?: string, importedAt?: string, rowCount?: number } }
// A `code` containing "overlap" is treated as the softer overlap warning;
// anything else is treated as a full duplicate.

export interface ImportConflict {
  kind: 'duplicate' | 'overlap'
  importedAt?: string
  rowCount?: number
}

export async function parseImportConflict(res: Response): Promise<ImportConflict> {
  const body = await res.json().catch(() => null)
  const err = (body?.error ?? body ?? {}) as { code?: unknown; importedAt?: unknown; rowCount?: unknown }
  const code = String(err.code ?? '').toLowerCase()
  return {
    kind: code.includes('overlap') ? 'overlap' : 'duplicate',
    importedAt: typeof err.importedAt === 'string' ? err.importedAt : undefined,
    rowCount: typeof err.rowCount === 'number' ? err.rowCount : undefined,
  }
}

export function formatConflictDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('sv-SE', { year: 'numeric', month: 'long', day: 'numeric' })
}
