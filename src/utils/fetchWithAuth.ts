import { clearUserImportHistory } from './jwtUser'

const API_URL = import.meta.env.VITE_API_URL as string

function getToken(): string | null {
  const val = localStorage.getItem('accessToken')
  return val && val !== 'null' && val !== 'undefined' ? val : null
}

async function clearSession() {
  clearUserImportHistory()
  localStorage.removeItem('accessToken')
  try {
    await fetch(`${API_URL}api/v1/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    })
  } catch {
    // best-effort — navigate regardless
  }
  window.location.href = '/login'
}

export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken()

  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    },
  })

  if (response.status === 401) {
    const refreshResponse = await fetch(`${API_URL}api/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })

    if (refreshResponse.ok) {
      const json = await refreshResponse.json()
      const d = json.data ?? json
      const newAccess = d.accessToken ?? d.access_token ?? d.token

      if (!newAccess) { await clearSession(); return refreshResponse }

      localStorage.setItem('accessToken', newAccess)

      return fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${newAccess}`,
          'Content-Type': 'application/json',
        },
      })
    } else {
      await clearSession()
      return refreshResponse
    }
  }

  return response
}

export async function fetchFormWithAuth(url: string, formData: FormData): Promise<Response> {
  const token = getToken()

  const response = await fetch(url, {
    method: 'POST',
    headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
    body: formData,
  })

  if (response.status === 401) await clearSession()

  return response
}