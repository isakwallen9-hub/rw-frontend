const LS_IMPORT_HISTORY_PREFIX = 'rw_import_history'

export function getUserId(): string | null {
  try {
    const token = localStorage.getItem('accessToken')
    if (!token || token === 'null' || token === 'undefined') return null
    const payload = token.split('.')[1]
    if (!payload) return null
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return json.sub ?? json.userId ?? json.id ?? null
  } catch {
    return null
  }
}

export function getImportHistoryKey(): string {
  const userId = getUserId()
  return userId ? `${LS_IMPORT_HISTORY_PREFIX}_${userId}` : LS_IMPORT_HISTORY_PREFIX
}

export function clearUserImportHistory(): void {
  localStorage.removeItem(getImportHistoryKey())
}
