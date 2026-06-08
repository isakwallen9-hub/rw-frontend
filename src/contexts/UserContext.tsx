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
        console.log('UserContext /auth/me raw response:', json)
        const data = json.data?.user ?? json.data ?? json
        console.log('UserContext resolved data:', data)
        console.log('UserContext isAdmin value:', data.isAdmin, '| role:', data.role)
        const admin =
          data.isAdmin === true ||
          data.is_admin === true ||
          data.role === 'admin' ||
          data.role === 'ADMIN'
        setIsAdmin(admin)
        setEmail(data.email ?? null)
      })
      .catch((err) => { console.error('UserContext /auth/me error:', err) })
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
