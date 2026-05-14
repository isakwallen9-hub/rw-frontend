const API_URL = import.meta.env.VITE_API_URL as string

function getToken(key: 'accessToken' | 'refreshToken'): string | null {
  const val = localStorage.getItem(key)
  // Guard against the literal strings "null" / "undefined" that can end up in storage
  return val && val !== 'null' && val !== 'undefined' ? val : null
}

function clearSession() {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
  window.location.href = '/login'
}

export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken('accessToken')

  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    },
  })

  if (response.status === 401) {
    const refreshToken = getToken('refreshToken')
    if (!refreshToken) {
      clearSession()
      return response
    }

    const refreshResponse = await fetch(`${API_URL}api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })

    if (refreshResponse.ok) {
      const json = await refreshResponse.json()
      const d = json.data ?? json
      const newAccess  = d.accessToken  ?? d.access_token  ?? d.token
      const newRefresh = d.refreshToken ?? d.refresh_token

      if (!newAccess) { clearSession(); return refreshResponse }

      localStorage.setItem('accessToken', newAccess)
      if (newRefresh) localStorage.setItem('refreshToken', newRefresh)

      return fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${newAccess}`,
          'Content-Type': 'application/json',
        },
      })
    } else {
      clearSession()
      return refreshResponse
    }
  }

  return response
}

export async function fetchFormWithAuth(url: string, formData: FormData): Promise<Response> {
  const token = getToken('accessToken')

  const response = await fetch(url, {
    method: 'POST',
    headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
    body: formData,
  })

  if (response.status === 401) clearSession()

  return response
}
