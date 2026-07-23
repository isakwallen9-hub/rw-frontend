import { useEffect, useState, useMemo, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchWithAuth } from '../utils/fetchWithAuth'
import { useUser } from '../contexts/UserContext'
import { SkeletonCard } from '../components/Skeleton'

const API_URL = import.meta.env.VITE_API_URL as string

const INDUSTRY_BADGE: Record<string, { label: string; cls: string }> = {
  restaurant: { label: 'Restaurang', cls: 'bg-orange-50 text-orange-700 border border-orange-100' },
  salon:      { label: 'Frisör',     cls: 'bg-purple-50 text-purple-700 border border-purple-100' },
  retail:     { label: 'Butik',      cls: 'bg-blue-50 text-blue-700 border border-blue-100' },
  cafe:       { label: 'Café',       cls: 'bg-amber-50 text-amber-800 border border-amber-100' },
  gym:        { label: 'Gym',        cls: 'bg-green-50 text-green-700 border border-green-100' },
  other:      { label: 'Annat',      cls: 'bg-gray-100 text-gray-500 border border-gray-200' },
}

interface AdminStats {
  orgCount: number
  userCount: number
  txCount: number
  activeToday: number
}

interface AdminOrg {
  id: string
  name: string
  industry?: string
  userCount: number
  transactionCount: number
  totalInflow?: number
  lastTransactionAt?: string
  createdAt: string
  lastActiveAt?: string
}

interface AdminUser {
  id: string
  email: string
  organisationName?: string
  orgName?: string
  organisation?: { name: string }
  organisationId?: string
  isAdmin: boolean
  createdAt: string
}

function cap(s: string | undefined) {
  if (!s) return '—'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function fmtDate(iso: string | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('sv-SE', { year: 'numeric', month: 'short', day: 'numeric' })
}

function timeAgo(iso: string | undefined): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return fmtDate(iso)
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Just nu'
  if (mins < 60) return `${mins} min sedan`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} tim sedan`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days} dag${days > 1 ? 'ar' : ''} sedan`
  return fmtDate(iso)
}

function fmt(n: number | undefined) {
  return (n ?? 0).toLocaleString('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 })
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
  const [expandedOrgId, setExpandedOrgId] = useState<string | null>(null)
  const [orgSearch, setOrgSearch] = useState('')
  const [userSearch, setUserSearch] = useState('')

  useEffect(() => {
    if (userLoading || !isAdmin) return

    fetchWithAuth(`${API_URL}api/v1/admin/stats`)
      .then(r => r.json())
      .then(json => setStats(json.data ?? json))
      .catch(() => {})
      .finally(() => setLoadingStats(false))

    fetchWithAuth(`${API_URL}api/v1/admin/organisations`)
      .then(r => r.json())
      .then(json => {
        const list = json.data?.organisations ?? json.data ?? json ?? []
        setOrgs(Array.isArray(list) ? list : [])
      })
      .catch(() => {})
      .finally(() => setLoadingOrgs(false))

    fetchWithAuth(`${API_URL}api/v1/admin/users`)
      .then(r => r.json())
      .then(json => {
        const list = json.data?.users ?? json.data ?? json ?? []
        setUsers(Array.isArray(list) ? list : [])
      })
      .catch(() => {})
      .finally(() => setLoadingUsers(false))
  }, [isAdmin, userLoading])

  const filteredOrgs = useMemo(() =>
    orgs.filter(o => o.name?.toLowerCase().includes(orgSearch.toLowerCase())),
    [orgs, orgSearch]
  )

  const filteredUsers = useMemo(() =>
    users.filter(u => u.email?.toLowerCase().includes(userSearch.toLowerCase())),
    [users, userSearch]
  )

  const deleteOrg = async () => {
    if (!deleteConfirm) return
    setDeleting(true)
    try {
      const res = await fetchWithAuth(`${API_URL}api/v1/admin/organisations/${deleteConfirm.id}`, { method: 'DELETE' })
      if (res.ok) {
        setOrgs(prev => prev.filter(o => o.id !== deleteConfirm.id))
        if (expandedOrgId === deleteConfirm.id) setExpandedOrgId(null)
      }
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
      <div className="font-sans">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-10 flex flex-col gap-4">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} className="h-10 w-full" />)}
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="font-sans">
        <div className="max-w-md mx-auto px-4 py-24 flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center text-2xl">🔒</div>
          <h1 className="text-xl font-bold text-gray-900">Åtkomst nekad</h1>
          <p className="text-gray-400 text-sm">Du har inte behörighet att visa den här sidan.</p>
        </div>
      </div>
    )
  }

  const STAT_CARDS = [
    { label: 'Organisationer', value: stats?.orgCount    ?? '—', icon: '🏢' },
    { label: 'Användare',      value: stats?.userCount   ?? '—', icon: '👥' },
    { label: 'Transaktioner',  value: stats?.txCount     ?? '—', icon: '💳' },
    { label: 'Aktiva idag',    value: stats?.activeToday ?? '—', icon: '📈' },
  ]

  return (
    <div className="font-sans">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-10 flex flex-col gap-10">

        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Administration</h1>
          <p className="text-sm text-slate-500 mt-1">Systemöversikt och hantering</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {loadingStats
            ? [...Array(4)].map((_, i) => <SkeletonCard key={i} className="h-24" />)
            : STAT_CARDS.map(card => (
              <div key={card.label} className="glass rounded-xl px-5 py-5 shadow-sm">
                <div className="text-2xl mb-2">{card.icon}</div>
                <div className="text-2xl font-bold text-gray-900">
                  {typeof card.value === 'number' ? card.value.toLocaleString('sv-SE') : card.value}
                </div>
                <div className="text-xs text-gray-400 mt-1">{card.label}</div>
              </div>
            ))
          }
        </div>

        {/* Organisations */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-800">Organisationer</h2>
            {!loadingOrgs && orgs.length > 0 && (
              <SearchInput value={orgSearch} onChange={setOrgSearch} placeholder="Sök organisation..." />
            )}
          </div>
          {loadingOrgs ? (
            <div className="flex flex-col gap-2">{[...Array(3)].map((_, i) => <SkeletonCard key={i} className="h-12" />)}</div>
          ) : orgs.length === 0 ? (
            <div className="glass rounded-xl px-5 py-8 text-center text-gray-400 text-sm">Inga organisationer.</div>
          ) : (
            <div className="glass rounded-xl overflow-hidden">
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
                    {filteredOrgs.length === 0 ? (
                      <tr><td colSpan={7} className="px-5 py-6 text-center text-gray-400 text-sm">Inga träffar.</td></tr>
                    ) : filteredOrgs.map((org, i) => {
                      const expanded = expandedOrgId === org.id
                      const orgUsers = users.filter(u =>
                        u.organisationId === org.id ||
                        (u.organisationName ?? u.organisation?.name ?? u.orgName) === org.name
                      )
                      const badge = org.industry ? INDUSTRY_BADGE[org.industry] : null
                      return (
                        <Fragment key={org.id}>
                          <tr
                            onClick={() => setExpandedOrgId(expanded ? null : org.id)}
                            className={`cursor-pointer transition-colors ${i !== 0 ? 'border-t border-gray-50' : ''} ${expanded ? 'bg-blue-50/40' : 'hover:bg-gray-50/60'}`}
                          >
                            <td className="px-5 py-3 font-semibold text-gray-900">
                              <span className="flex items-center gap-2">
                                <span className={`text-gray-400 text-xs transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}>▶</span>
                                {cap(org.name)}
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              {badge
                                ? <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badge.cls}`}>{badge.label}</span>
                                : <span className="text-gray-300 text-xs">—</span>}
                            </td>
                            <td className="px-5 py-3 text-right text-gray-700">{org.userCount ?? 0}</td>
                            <td className="px-5 py-3 text-right text-gray-700">{(org.transactionCount ?? 0).toLocaleString('sv-SE')}</td>
                            <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{fmtDate(org.createdAt)}</td>
                            <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{timeAgo(org.lastActiveAt)}</td>
                            <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
                              <button
                                onClick={() => setDeleteConfirm({ id: org.id, name: cap(org.name) })}
                                className="text-xs font-semibold text-red-500 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors whitespace-nowrap"
                              >
                                Ta bort
                              </button>
                            </td>
                          </tr>
                          {expanded && (
                            <tr className="border-t border-blue-100">
                              <td colSpan={7} className="px-5 py-4 bg-blue-50/30">
                                <div className="flex flex-wrap gap-6 mb-3 text-sm">
                                  {org.totalInflow != null && (
                                    <div><span className="text-xs text-gray-400 block">Totalt inflöde</span><span className="font-semibold text-gray-800">{fmt(org.totalInflow)}</span></div>
                                  )}
                                  {org.lastTransactionAt && (
                                    <div><span className="text-xs text-gray-400 block">Senaste transaktion</span><span className="font-semibold text-gray-800">{timeAgo(org.lastTransactionAt)}</span></div>
                                  )}
                                  {badge && (
                                    <div><span className="text-xs text-gray-400 block">Bransch</span><span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badge.cls}`}>{badge.label}</span></div>
                                  )}
                                </div>
                                {orgUsers.length > 0 ? (
                                  <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Användare ({orgUsers.length})</p>
                                    <div className="flex flex-wrap gap-2">
                                      {orgUsers.map(u => (
                                        <span key={u.id} className="flex items-center gap-1.5 text-xs bg-white border border-gray-200 rounded-lg px-3 py-1.5">
                                          {u.email}
                                          {u.isAdmin && <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">Admin</span>}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-xs text-gray-400">Inga matchande användare i listan.</p>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Users */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-800">Användare</h2>
            {!loadingUsers && users.length > 0 && (
              <SearchInput value={userSearch} onChange={setUserSearch} placeholder="Sök email..." />
            )}
          </div>
          {loadingUsers ? (
            <div className="flex flex-col gap-2">{[...Array(3)].map((_, i) => <SkeletonCard key={i} className="h-12" />)}</div>
          ) : users.length === 0 ? (
            <div className="glass rounded-xl px-5 py-8 text-center text-gray-400 text-sm">Inga användare.</div>
          ) : (
            <div className="glass rounded-xl overflow-hidden">
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
                    {filteredUsers.length === 0 ? (
                      <tr><td colSpan={5} className="px-5 py-6 text-center text-gray-400 text-sm">Inga träffar.</td></tr>
                    ) : filteredUsers.map((user, i) => {
                      const orgName = user.organisationName ?? user.organisation?.name ?? user.orgName
                      return (
                        <tr key={user.id} className={`${i !== 0 ? 'border-t border-gray-50' : ''} hover:bg-gray-50/60 transition-colors`}>
                          <td className="px-5 py-3 text-gray-900 font-medium">{user.email}</td>
                          <td className="px-5 py-3 text-gray-500">{orgName ? cap(orgName) : <span className="text-gray-300">—</span>}</td>
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
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/20 backdrop-blur-md" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white/60 backdrop-blur-3xl border border-slate-200/60 rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-xl shrink-0">🗑️</div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Ta bort organisation?</h2>
                <p className="text-sm text-gray-400 mt-0.5">Detta går inte att ångra.</p>
              </div>
            </div>
            <p className="text-sm text-gray-700 bg-gray-50 rounded-xl px-4 py-3 mb-5 font-medium">{deleteConfirm.name}</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">
                Avbryt
              </button>
              <button onClick={deleteOrg} disabled={deleting} className="flex-1 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2">
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

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-8 pr-4 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors bg-white w-52"
      />
    </div>
  )
}

function AdminToggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex w-10 h-5 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${checked ? 'bg-primary' : 'bg-gray-200'}`}
    >
      <span className={`inline-block w-4 h-4 rounded-full bg-white shadow transform transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  )
}
