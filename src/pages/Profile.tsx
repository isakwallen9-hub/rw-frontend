import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { fetchWithAuth } from '../utils/fetchWithAuth'
import { SkeletonCard } from '../components/Skeleton'
import { useCurrency } from '../contexts/CurrencyContext'

const API_URL = import.meta.env.VITE_API_URL as string

const CURRENCIES = [
  { code: 'SEK', flag: '🇸🇪' },
  { code: 'EUR', flag: '🇪🇺' },
  { code: 'USD', flag: '🇺🇸' },
  { code: 'GBP', flag: '🇬🇧' },
]

const INDUSTRIES = [
  { value: 'restaurant', label: 'Restaurang', icon: '🍽️' },
  { value: 'salon', label: 'Frisör/Salong', icon: '✂️' },
  { value: 'retail', label: 'Butik/Detaljhandel', icon: '🛍️' },
  { value: 'cafe', label: 'Café', icon: '☕' },
  { value: 'gym', label: 'Gym/Träning', icon: '💪' },
  { value: 'other', label: 'Annat', icon: '🏢' },
]

interface UserProfile {
  firstName: string
  lastName: string
  email: string
  organisationName: string
  organisationSlug: string
  industry?: string
}

interface MemoryStatus {
  enabled: boolean
  activatedAt?: string
  conversationCount?: number
}

interface Conversation {
  id: string
  summary?: string
  firstQuestion?: string
  createdAt: string
}

interface NotificationSettings {
  email: string
  enabled: boolean
  runwayAlert: boolean
  overdueInvoiceAlert: boolean
  negativeCashflowAlert: boolean
}

const DEFAULT_NOTIF: NotificationSettings = {
  email: '',
  enabled: true,
  runwayAlert: true,
  overdueInvoiceAlert: true,
  negativeCashflowAlert: true,
}

export default function Profile() {
  const navigate = useNavigate()
  const { setCurrency: setContextCurrency } = useCurrency()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [industry, setIndustry] = useState('')
  const [industrySaving, setIndustrySaving] = useState(false)

  const [currency, setCurrencyState] = useState('SEK')
  const [currencySaving, setCurrencySaving] = useState(false)

  const [notif, setNotif] = useState<NotificationSettings>(DEFAULT_NOTIF)
  const [notifLoading, setNotifLoading] = useState(true)
  const [notifEmail, setNotifEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [memoryStatus, setMemoryStatus]             = useState<MemoryStatus | null>(null)
  const [memoryLoading, setMemoryLoading]           = useState(true)
  const [memoryActionLoading, setMemoryActionLoading] = useState(false)
  const [conversations, setConversations]           = useState<Conversation[]>([])
  const [convsLoading, setConvsLoading]             = useState(false)
  const [deletingConvId, setDeletingConvId]         = useState<string | null>(null)
  const [confirmTurnOff, setConfirmTurnOff]         = useState(false)
  const [confirmDeleteAll, setConfirmDeleteAll]     = useState(false)

  useEffect(() => {
    fetchWithAuth(`${API_URL}api/v1/auth/me`)
      .then((r) => r.json())
      .then((json) => {
        const data = json.data ?? json
        setProfile(data)
        setIndustry(data.industry ?? '')
        if (data.currency) setCurrencyState(data.currency)
      })
      .catch(() => setError('Kunde inte hämta profilinformation.'))
      .finally(() => setLoading(false))

    fetchWithAuth(`${API_URL}api/v1/notifications/settings`)
      .then((r) => r.json())
      .then((json) => {
        const s: NotificationSettings = { ...DEFAULT_NOTIF, ...(json.data ?? json) }
        setNotif(s)
        setNotifEmail(s.email ?? '')
      })
      .catch(() => {})
      .finally(() => setNotifLoading(false))

    fetchWithAuth(`${API_URL}api/v1/ai/memory-status`)
      .then((r) => r.json())
      .then((json) => setMemoryStatus(json?.data ?? json))
      .catch(() => setMemoryStatus({ enabled: false }))
      .finally(() => setMemoryLoading(false))
  }, [])

  useEffect(() => {
    if (!memoryStatus?.enabled) return
    setConvsLoading(true)
    fetchWithAuth(`${API_URL}api/v1/ai/conversations`)
      .then((r) => r.json())
      .then((json) => setConversations(json?.data ?? json?.conversations ?? []))
      .catch(() => {})
      .finally(() => setConvsLoading(false))
  }, [memoryStatus?.enabled])

  const showSaved = () => {
    setSavedMsg('Inställningar sparade!')
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSavedMsg(''), 3000)
  }

  const saveSettings = async (patch: Partial<NotificationSettings>) => {
    const updated = { ...notif, ...patch }
    setNotif(updated)
    setSaving(true)
    try {
      const res = await fetchWithAuth(`${API_URL}api/v1/notifications/settings`, {
        method: 'POST',
        body: JSON.stringify(updated),
      })
      if (res.ok) showSaved()
    } catch {
      // best-effort
    }
    setSaving(false)
  }

  const saveIndustry = async (value: string) => {
    setIndustry(value)
    setIndustrySaving(true)
    try {
      const res = await fetchWithAuth(`${API_URL}api/v1/organisation/industry`, {
        method: 'PUT',
        body: JSON.stringify({ industry: value }),
      })
      if (res.ok) showSaved()
    } catch {
      // best-effort
    }
    setIndustrySaving(false)
  }

  const saveCurrency = async (code: string) => {
    setCurrencyState(code)
    setContextCurrency(code)
    setCurrencySaving(true)
    try {
      const res = await fetchWithAuth(`${API_URL}api/v1/organisation/currency`, {
        method: 'PUT',
        body: JSON.stringify({ currency: code }),
      })
      if (res.ok) showSaved()
    } catch {
      // best-effort
    }
    setCurrencySaving(false)
  }

  const handleEmailSave = () => {
    saveSettings({ email: notifEmail })
  }

  const handleToggle = (key: keyof Omit<NotificationSettings, 'email'>) => {
    saveSettings({ [key]: !notif[key] })
  }

  const applyMemoryConsent = async (enabled: boolean) => {
    setMemoryActionLoading(true)
    try {
      const res = await fetchWithAuth(`${API_URL}api/v1/ai/memory-consent`, {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      })
      if (res.ok) {
        const json = await res.json()
        const updated = json?.data ?? json
        setMemoryStatus(prev => ({
          enabled,
          activatedAt: enabled ? (updated?.activatedAt ?? new Date().toISOString()) : undefined,
          conversationCount: enabled ? (prev?.conversationCount ?? 0) : 0,
        }))
        if (!enabled) setConversations([])
      }
    } catch { /* best-effort */ }
    setMemoryActionLoading(false)
  }

  const handleMemoryToggle = () => {
    if (memoryStatus?.enabled) {
      setConfirmTurnOff(true)
    } else {
      void applyMemoryConsent(true)
    }
  }

  const deleteConversation = async (id: string) => {
    setDeletingConvId(id)
    try {
      const res = await fetchWithAuth(`${API_URL}api/v1/ai/conversations/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setConversations(prev => prev.filter(c => c.id !== id))
        setMemoryStatus(prev => prev ? { ...prev, conversationCount: Math.max(0, (prev.conversationCount ?? 1) - 1) } : prev)
      }
    } catch { /* best-effort */ }
    setDeletingConvId(null)
  }

  const deleteAllConversations = async () => {
    setConfirmDeleteAll(false)
    setMemoryActionLoading(true)
    try {
      const res = await fetchWithAuth(`${API_URL}api/v1/ai/conversations`, { method: 'DELETE' })
      if (res.ok) {
        setConversations([])
        setMemoryStatus(prev => prev ? { ...prev, conversationCount: 0 } : prev)
      }
    } catch { /* best-effort */ }
    setMemoryActionLoading(false)
  }

  const handleLogout = () => {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    navigate('/login')
  }

  const currentIndustry = INDUSTRIES.find((i) => i.value === industry)

  return (
    <>
    <div className="font-sans">
      <div className="max-w-xl mx-auto px-4 sm:px-8 py-10 flex flex-col gap-8">

        {/* Profile card */}
        <div>
          <h1 className="text-3xl text-primary mb-4">Profil</h1>
          {loading ? (
            <div className="glass rounded-xl p-6 flex flex-col gap-4">
              {[...Array(5)].map((_, i) => (
                <SkeletonCard key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-100 text-red-600 rounded-xl px-5 py-4 text-sm">{error}</div>
          ) : profile ? (
            <div className="glass rounded-xl overflow-hidden">
              <ProfileRow label="Förnamn" value={profile.firstName} />
              <ProfileRow label="Efternamn" value={profile.lastName} />
              <ProfileRow label="E-post" value={profile.email} />
              <ProfileRow label="Organisation" value={profile.organisationName} />
              <ProfileRow label="Workspace (slug)" value={profile.organisationSlug} />
              <div className="flex items-center justify-between px-5 py-4">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide w-32 shrink-0">Bransch</span>
                {currentIndustry ? (
                  <span className="flex items-center gap-1.5 text-sm text-gray-800">
                    <span>{currentIndustry.icon}</span>
                    {currentIndustry.label}
                  </span>
                ) : (
                  <span className="text-sm text-gray-400">Ej vald</span>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* Industry picker */}
        <div>
          <h2 className="text-xl text-gray-800 mb-4">Bransch</h2>
          <div className="glass rounded-xl p-4">
            {loading ? (
              <SkeletonCard className="h-40 w-full" />
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {INDUSTRIES.map((ind) => (
                  <button
                    key={ind.value}
                    onClick={() => saveIndustry(ind.value)}
                    disabled={industrySaving}
                    className={`flex flex-col items-center gap-1.5 border-2 rounded-xl py-3 px-2 transition-all disabled:opacity-50 ${
                      industry === ind.value
                        ? 'border-accent bg-accent/5'
                        : 'border-gray-100 hover:border-accent/50 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-2xl">{ind.icon}</span>
                    <span className={`text-xs font-medium text-center leading-tight ${industry === ind.value ? 'text-accent' : 'text-gray-600'}`}>
                      {ind.label}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Currency picker */}
        <div>
          <h2 className="text-xl text-gray-800 mb-4">Valuta</h2>
          <div className="glass rounded-xl p-4">
            {loading ? (
              <SkeletonCard className="h-16 w-full" />
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {CURRENCIES.map((c) => (
                  <button
                    key={c.code}
                    onClick={() => saveCurrency(c.code)}
                    disabled={currencySaving}
                    className={`flex flex-col items-center gap-1.5 border-2 rounded-xl py-3 transition-all disabled:opacity-50 ${
                      currency === c.code
                        ? 'border-accent bg-accent/5'
                        : 'border-gray-100 hover:border-accent/50 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-2xl">{c.flag}</span>
                    <span className={`text-xs font-bold ${currency === c.code ? 'text-accent' : 'text-gray-600'}`}>
                      {c.code}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Notification settings */}
        <div>
          <h2 className="text-xl text-gray-800 mb-4">Notifikationer</h2>

          {notifLoading ? (
            <div className="glass rounded-xl p-6 flex flex-col gap-4">
              {[...Array(4)].map((_, i) => (
                <SkeletonCard key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : (
            <div className="glass rounded-xl overflow-hidden">

              {/* Master enable/disable */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Aktivera notifikationer</p>
                  <p className="text-xs text-gray-400 mt-0.5">Slår på eller av alla notifikationer</p>
                </div>
                <Toggle
                  checked={notif.enabled}
                  onChange={() => handleToggle('enabled')}
                  disabled={saving}
                />
              </div>

              {/* Email input */}
              <div className="px-5 py-4 border-b border-gray-50">
                <label className="block text-sm font-semibold text-gray-800 mb-1">Notifikations-email</label>
                <p className="text-xs text-gray-400 mb-3">Alerts skickas till denna adress</p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={notifEmail}
                    onChange={e => setNotifEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleEmailSave()}
                    placeholder="du@foretaget.se"
                    disabled={!notif.enabled}
                    className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors disabled:opacity-50 disabled:bg-gray-50"
                  />
                  <button
                    onClick={handleEmailSave}
                    disabled={saving || !notif.enabled}
                    className="px-4 py-2.5 bg-primary text-white text-sm font-semibold rounded-lg shadow-md shadow-blue-500/20 hover:opacity-90 transition-opacity disabled:opacity-50 min-h-[44px]"
                  >
                    Spara
                  </button>
                </div>
              </div>

              {/* Individual toggles */}
              <NotifRow
                label="Runway under 30 dagar"
                description="Varna när kassaflödet räcker i under 30 dagar"
                checked={notif.runwayAlert}
                onChange={() => handleToggle('runwayAlert')}
                disabled={saving || !notif.enabled}
              />
              <NotifRow
                label="Förfallna fakturor"
                description="Varna när fakturor är förfallna"
                checked={notif.overdueInvoiceAlert}
                onChange={() => handleToggle('overdueInvoiceAlert')}
                disabled={saving || !notif.enabled}
              />
              <NotifRow
                label="Negativt kassaflöde"
                description="Varna när utgifterna överstiger intäkterna"
                checked={notif.negativeCashflowAlert}
                onChange={() => handleToggle('negativeCashflowAlert')}
                disabled={saving || !notif.enabled}
                last
              />
            </div>
          )}

          {/* Save confirmation */}
          {savedMsg && (
            <div className="mt-3 flex items-center gap-2 text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-3 text-sm font-medium">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {savedMsg}
            </div>
          )}
        </div>

        {/* AI-minne */}
        <div>
          <h2 className="text-xl text-gray-800 mb-4">AI-minne</h2>

          {memoryLoading ? (
            <div className="glass rounded-xl p-6 flex flex-col gap-4">
              <SkeletonCard className="h-8 w-full" />
            </div>
          ) : (
            <div className="glass rounded-xl overflow-hidden">
              {/* Main toggle */}
              <div className="flex items-start justify-between px-5 py-4 border-b border-gray-50">
                <div className="flex-1 pr-4">
                  <p className="text-sm font-semibold text-gray-800">Låt AI:n komma ihåg våra samtal</p>
                  <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
                    När minnet är på kan AI-assistenten referera till tidigare frågor och ge mer träffsäkra svar över tid.
                    Dina samtal sparas krypterat och används aldrig för att träna AI-modeller.
                    Du kan när som helst stänga av minnet. Då raderas all sparad historik omedelbart.
                  </p>
                </div>
                <Toggle
                  checked={memoryStatus?.enabled ?? false}
                  onChange={handleMemoryToggle}
                  disabled={memoryActionLoading}
                />
              </div>

              {/* Status row — only when on */}
              {memoryStatus?.enabled && (
                <div className="px-5 py-3 flex gap-8 bg-green-50/50">
                  {memoryStatus.activatedAt && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Aktiverat sedan</p>
                      <p className="text-xs text-gray-700 mt-0.5">{fmtDate(memoryStatus.activatedAt)}</p>
                    </div>
                  )}
                  {memoryStatus.conversationCount !== undefined && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Sparade samtal</p>
                      <p className="text-xs text-gray-700 mt-0.5">{memoryStatus.conversationCount}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Conversation list — only when memory is on */}
          {!memoryLoading && memoryStatus?.enabled && (
            <div className="mt-4">
              {convsLoading ? (
                <div className="glass rounded-xl p-5">
                  <SkeletonCard className="h-16 w-full" />
                </div>
              ) : conversations.length === 0 ? (
                <div className="glass rounded-xl px-5 py-8 text-center text-sm text-gray-400">
                  Inga sparade samtal ännu
                </div>
              ) : (
                <div className="glass rounded-xl overflow-hidden">
                  {conversations.map((conv, i) => (
                    <div
                      key={conv.id}
                      className={`flex items-center gap-3 px-5 py-3.5 ${i !== 0 ? 'border-t border-gray-50' : ''}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 truncate">
                          {conv.summary ?? conv.firstQuestion ?? 'Samtal'}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">{fmtDate(conv.createdAt)}</p>
                      </div>
                      <button
                        onClick={() => void deleteConversation(conv.id)}
                        disabled={deletingConvId === conv.id}
                        aria-label="Radera samtal"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40 shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/50">
                    <button
                      onClick={() => setConfirmDeleteAll(true)}
                      disabled={memoryActionLoading}
                      className="text-xs font-medium text-red-600 hover:text-red-700 transition-colors disabled:opacity-40"
                    >
                      Radera all historik
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <button
          onClick={handleLogout}
          className="w-full border border-red-200 text-red-600 font-semibold py-3 rounded-xl hover:bg-red-50 transition-colors text-sm min-h-[44px]"
        >
          Logga ut
        </button>
      </div>
    </div>

    {/* ── Confirm: turn off memory ──────────────────────────────────────── */}
    {confirmTurnOff && (
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="glass rounded-2xl p-6 max-w-sm w-full shadow-xl">
          <h3 className="text-base font-bold text-gray-900 mb-2">Stäng av AI-minnet?</h3>
          <p className="text-sm text-gray-500 leading-relaxed mb-6">
            All sparad samtalshistorik raderas permanent och kan inte återställas.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setConfirmTurnOff(false)}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px]"
            >
              Avbryt
            </button>
            <button
              onClick={() => { setConfirmTurnOff(false); void applyMemoryConsent(false) }}
              className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors min-h-[44px]"
            >
              Radera
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Confirm: delete all conversations ────────────────────────────── */}
    {confirmDeleteAll && (
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="glass rounded-2xl p-6 max-w-sm w-full shadow-xl">
          <h3 className="text-base font-bold text-gray-900 mb-2">Radera all historik?</h3>
          <p className="text-sm text-gray-500 leading-relaxed mb-6">
            Alla sparade samtal raderas permanent. AI-minnet förblir aktivt.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setConfirmDeleteAll(false)}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px]"
            >
              Avbryt
            </button>
            <button
              onClick={() => void deleteAllConversations()}
              className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors min-h-[44px]"
            >
              Radera allt
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })
}

function ProfileRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-5 py-4 ${!last ? 'border-b border-gray-50' : ''}`}>
      <span className="text-xs font-medium text-gray-400 uppercase tracking-wide w-32 shrink-0">{label}</span>
      <span className="text-sm text-gray-800 text-right">{value}</span>
    </div>
  )
}

function NotifRow({
  label, description, checked, onChange, disabled, last,
}: {
  label: string
  description: string
  checked: boolean
  onChange: () => void
  disabled?: boolean
  last?: boolean
}) {
  return (
    <div className={`flex items-center justify-between px-5 py-4 ${!last ? 'border-b border-gray-50' : ''} ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex-1 min-w-0 pr-4">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{description}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  )
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex w-11 h-6 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed ${
        checked ? 'bg-accent' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block w-5 h-5 rounded-full bg-white shadow transform transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}
