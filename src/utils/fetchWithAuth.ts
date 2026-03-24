const API_URL = 'https://divine-warmth-production.up.railway.app/'

export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('token')

  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (response.status === 401) {
    const refreshToken = localStorage.getItem('refreshToken')
    const refreshResponse = await fetch(`${API_URL}api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })

    if (refreshResponse.ok) {
      const data = await refreshResponse.json()
      localStorage.setItem('token', data.data.accessToken)
      localStorage.setItem('refreshToken', data.data.refreshToken)

      return fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${data.data.accessToken}`,
          'Content-Type': 'application/json',
        },
      })
    } else {
      localStorage.removeItem('token')
      localStorage.removeItem('refreshToken')
      window.location.href = '/login'
      return refreshResponse
    }
  }

  return response
}
