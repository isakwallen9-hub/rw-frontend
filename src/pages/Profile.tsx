import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { fetchWithAuth } from '../utils/fetchWithAuth'
import { SkeletonCard } from '../components/Skeleton'

const API_URL = import.meta.env.VITE_API_URL as string

interface UserProfile {
  firstName: string
  lastName: string
  email: string
  organisationName: string
  organisationSlug: string
}

export default function Profile() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchWithAuth(`${API_URL}api/v1/auth/me`)
      .then((r) => r.json())
      .then((json) => {
        console.log('[PROFILE] me response:', json)
        setProfile(json.data ?? json)
      })
      .catch(() => setError('Kunde inte hämta profilinformation.'))
      .finally(() => setLoading(false))
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <Navbar />
      <div className="max-w-xl mx-auto px-4 sm:px-8 py-10">
        <h1 className="text-2xl font-bold text-primary mb-6">Profil</h1>

        {loading ? (
          <div className="bg-white border border-gray-100 rounded-xl p-6 flex flex-col gap-4">
            {[...Array(5)].map((_, i) => (
              <SkeletonCard key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-100 text-red-600 rounded-xl px-5 py-4 text-sm">{error}</div>
        ) : profile ? (
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <ProfileRow label="Förnamn" value={profile.firstName} />
            <ProfileRow label="Efternamn" value={profile.lastName} />
            <ProfileRow label="E-post" value={profile.email} />
            <ProfileRow label="Organisation" value={profile.organisationName} />
            <ProfileRow label="Workspace (slug)" value={profile.organisationSlug} last />
          </div>
        ) : null}

        <button
          onClick={handleLogout}
          className="mt-6 w-full border border-red-200 text-red-600 font-semibold py-3 rounded-xl hover:bg-red-50 transition-colors text-sm"
        >
          Logga ut
        </button>
      </div>
    </div>
  )
}

function ProfileRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-5 py-4 ${!last ? 'border-b border-gray-50' : ''}`}>
      <span className="text-xs font-medium text-gray-400 uppercase tracking-wide w-32 shrink-0">{label}</span>
      <span className="text-sm text-gray-800 text-right">{value}</span>
    </div>
  )
}
