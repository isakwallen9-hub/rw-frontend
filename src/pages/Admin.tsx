import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { fetchWithAuth } from '../utils/fetchWithAuth'
import { useUser } from '../contexts/UserContext'
import { SkeletonCard } from '../components/Skeleton'

const API_URL = import.meta.env.VITE_API_URL as string

const INDUSTRY_ICONS: Record<string, string> = {
  restaurant: '🍽️', salon: '✂️', retail: '🛍️', cafe: '☕', gym: '💪', other: '🏢',
}

interface AdminStats {
  totalOrganisations: number
  totalUsers: number
  totalTransactions: number
  activeToday: number
}

interface AdminOrg {
  id: string
  name: string
  industry?: string
  userCount: number
  transactionCount: number
  createdAt: string
  lastActiveAt?: string
}

interface AdminUser {
  id: string
  email: string
  organisationName?: string
  isAdmin: boolean
  createdAt: string
}

function fmtDate(iso: string | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('sv-SE', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function Admin() {
  const navigate = useNavigate()
  const { isAdmin, loading: userLoading } = useUser()

  const [stats, setStats] = useState<AdminStats | null>(null)
  const [orgs, setOrgs] = useState<AdminOrg[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loadingStats, setLoadingStats] = useState(true)
  const [loadingOrgs, setLoadingOrgs] = useState(true)
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (userLoading || !isAdmin) return

    fetchWithAuth(`${API_URL}api/v1/admin/stats`)
      .then(r => r.json())
      .then(json => setStats(json.data ?? json))
      .catch(() => {})
      .finally(() => setLoadingStats(false))

    fetchWithAuth(`${API_URL}api/v1/admin/organisations`)
      .then(r => r.json())
      .then(json => setOrgs(json.data ?? json ?? []))
      .catch(() => {})
      .finally(() => setLoadingOrgs(false))

    fetchWithAuth(`${API_URL}api/v1/admin/users`)
      .then(r => r.json())
      .then(json => setUsers(json.data ?? json ?? []))
      .catch(() => {})
      .finally(() => setLoadingUsers(false))
  }, [isAdmin, userLoading])

  const deleteOrg = async () => {
    if (!deleteConfirm) return
    setDeleting(true)
    try {
      const res = await fetchWithAuth(`${API_URL}api/v1/admin/organisations/${deleteConfirm.id}`, { method: 'DELETE' })
      if (res.ok) setOrgs(prev => prev.filter(o => o.id !== deleteConfirm.id))
    } catch {}
    setDeleting(false)
    setDeleteConfirm(null)
  }

  const toggleAdmin = async (user: AdminUser) => {
    const next = !user.isAdmin
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isAdmin: next } : u))
    try {
      const res = await fetchWithAuth(`${API_URL}api/v1/admin/users/${user.id}/admin`, {
        method: 'PUT',
        body: JSON.stringify({ isAdmin: next }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isAdmin: user.isAdmin } : u))
    }
  }

  if (userLoading) {
    return (
      <div className="min-h-screen bg-gray-50 font-sans">
        <Navbar />
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-10 flex flex-col gap-4">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} className="h-10 w-full" />)}
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 font-sans">
        <Navbar />
        <div className="max-w-md mx-auto px-4 py-24 flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center text-2xl">🔒</div>
          <h1 className="text-xl font-bold text-gray-900">Åtkomst nekad</h1>
          <p className="text-gray-400 text-sm">Du har inte behörighet att visa den här sidan.</p>
          <button onClick={() => navigate('/dashboard')} className="mt-2 text-sm font-semibold text-accent hover:underline">
            ← Tillbaka till dashboarden
          </button>
        </div>
      </div>
    )
  }

  const STAT_CARDS = [
    { label: 'Organisationer', value: stats?.totalOrganisations ?? '—', icon: '🏢' },
    { label: 'Användare',      value: stats?.totalUsers        ?? '—', icon: '👥' },
    { label: 'Transaktioner',  value: stats?.totalTransactions ?? '—', icon: '💳' },
    { label: 'Aktiva idag',    value: stats?.activeToday       ?? '—', icon: '📈' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-10 flex flex-col gap-10">

        <div>
          <h1 className="text-2xl font-bold text-primary">Administration</h1>
          <p className="text-sm text-gray-400 mt-1">Systemöversikt och hantering</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {loadingStats
            ? [...Array(4)].map((_, i) => <SkeletonCard key={i} className="h-24" />)
            : STAT_CARDS.map(card => (
              <div key={card.label} className="bg-white border border-gray-100 rounded-xl px-5 py-5 shadow-sm">
                <div className="text-2xl mb-2">{card.icon}</div>
                <div className="text-2xl font-bold text-gray-900">{card.value.toLocaleString('sv-SE')}</div>
                <div className="text-xs text-gray-400 mt-1">{card.label}</div>
              </div>
            ))
          }
        </div>

        {/* Organisations */}
        <div>
          <h2 className="text-lg font-bold text-gray-800 mb-4">Organisationer</h2>
          {loadingOrgs ? (
            <div className="flex flex-col gap-2">{[...Array(3)].map((_, i) => <SkeletonCard key={i} className="h-12" />)}</div>
          ) : orgs.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-xl px-5 py-8 text-center text-gray-400 text-sm">Inga organisationer.</div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                      <th className="text-left px-5 py-3 font-semibold">Namn</th>
                      <th className="text-left px-5 py-3 font-semibold">Bransch</th>
                      <th className="text-right px-5 py-3 font-semibold">Användare</th>
                      <th className="text-right px-5 py-3 font-semibold">Transaktioner</th>
                      <th className="text-left px-5 py-3 font-semibold">Skapad</th>
                      <th className="text-left px-5 py-3 font-semibold">Senast aktiv</th>
                      <th className="px-5 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {orgs.map((org, i) => (
                      <tr key={org.id} className={`${i !== 0 ? 'border-t border-gray-50' : ''} hover:bg-gray-50/60 transition-colors`}>
                        <td className="px-5 py-3 font-semibold text-gray-900">{org.name}</td>
                        <td className="px-5 py-3 text-gray-500">
                          {org.industry
                            ? <span className="flex items-center gap-1.5">{INDUSTRY_ICONS[org.industry] ?? '🏢'} <span className="text-xs">{org.industry}</span></span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-5 py-3 text-right text-gray-700">{org.userCount ?? 0}</td>
                        <td className="px-5 py-3 text-right text-gray-700">{(org.transactionCount ?? 0).toLocaleString('sv-SE')}</td>
                        <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{fmtDate(org.createdAt)}</td>
                        <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{fmtDate(org.lastActiveAt)}</td>
                        <td className="px-5 py-3">
                          <button
                            onClick={() => setDeleteConfirm({ id: org.id, name: org.name })}
                            className="text-xs font-semibold text-red-500 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors whitespace-nowrap"
                          >
                            Ta bort
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Users */}
        <div>
          <h2 className="text-lg font-bold text-gray-800 mb-4">Användare</h2>
          {loadingUsers ? (
            <div className="flex flex-col gap-2">{[...Array(3)].map((_, i) => <SkeletonCard key={i} className="h-12" />)}</div>
          ) : users.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-xl px-5 py-8 text-center text-gray-400 text-sm">Inga användare.</div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                      <th className="text-left px-5 py-3 font-semibold">Email</th>
                      <th className="text-left px-5 py-3 font-semibold">Organisation</th>
                      <th className="text-left px-5 py-3 font-semibold">Roll</th>
                      <th className="text-left px-5 py-3 font-semibold">Skapad</th>
                      <th className="px-5 py-3 font-semibold text-right">Admin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user, i) => (
                      <tr key={user.id} className={`${i !== 0 ? 'border-t border-gray-50' : ''} hover:bg-gray-50/60 transition-colors`}>
                        <td className="px-5 py-3 text-gray-900 font-medium">{user.email}</td>
                        <td className="px-5 py-3 text-gray-500">{user.organisationName ?? <span className="text-gray-300">—</span>}</td>
                        <td className="px-5 py-3">
                          {user.isAdmin
                            ? <span className="text-xs font-bold bg-primary/10 text-primary px-2.5 py-1 rounded-full">Admin</span>
                            : <span className="text-xs text-gray-400">Användare</span>}
                        </td>
                        <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{fmtDate(user.createdAt)}</td>
                        <td className="px-5 py-3 text-right">
                          <AdminToggle checked={user.isAdmin} onChange={() => toggleAdmin(user)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-xl shrink-0">🗑️</div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Ta bort organisation?</h2>
                <p className="text-sm text-gray-400 mt-0.5">Detta går inte att ångra.</p>
              </div>
            </div>
            <p className="text-sm text-gray-700 bg-gray-50 rounded-xl px-4 py-3 mb-5 font-medium">
              {deleteConfirm.name}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
              >
                Avbryt
              </button>
              <button
                onClick={deleteOrg}
                disabled={deleting}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {deleting ? 'Tar bort...' : 'Ta bort'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AdminToggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex w-10 h-5 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
        checked ? 'bg-primary' : 'bg-gray-200'
      }`}
    >
      <span className={`inline-block w-4 h-4 rounded-full bg-white shadow transform transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  )
}
