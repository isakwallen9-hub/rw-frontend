import { createContext, useContext, useEffect, useState } from 'react'
import { fetchWithAuth } from '../utils/fetchWithAuth'

const API_URL = import.meta.env.VITE_API_URL as string

interface UserContextValue {
  isAdmin: boolean
  email: string | null
  loading: boolean
}

const UserContext = createContext<UserContextValue>({ isAdmin: false, email: null, loading: true })

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('accessToken')
    if (!token || token === 'undefined' || token === 'null') {
      setLoading(false)
      return
    }
    fetchWithAuth(`${API_URL}api/v1/auth/me`)
      .then(r => r.json())
      .then(json => {
        const data = json.data ?? json
        setIsAdmin(data.isAdmin === true)
        setEmail(data.email ?? null)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <UserContext.Provider value={{ isAdmin, email, loading }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  return useContext(UserContext)
}
