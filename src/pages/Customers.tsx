import { useEffect, useState, useMemo } from 'react'
import Navbar from '../components/Navbar'
import { fetchWithAuth } from '../utils/fetchWithAuth'
import { SkeletonCard } from '../components/Skeleton'

const API_URL = import.meta.env.VITE_API_URL as string

type SortKey = 'totalRevenue' | 'transactionCount' | 'lastPurchase'
type PaymentBehavior = 'regular' | 'sporadic' | 'inactive'

interface Customer {
  name: string
  totalRevenue: number
  transactionCount: number
  averageAmount: number
  lastPurchase: string
  paymentBehavior: PaymentBehavior
}

function fmt(n: number) {
  return n.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 })
}

function fmtDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('sv-SE', { year: 'numeric', month: 'short', day: 'numeric' })
}

const BEHAVIOR_CONFIG: Record<PaymentBehavior, { label: string; className: string }> = {
  regular:  { label: 'Regelbunden', className: 'bg-green-50 text-green-700 border border-green-100' },
  sporadic: { label: 'Sporadisk',   className: 'bg-yellow-50 text-yellow-700 border border-yellow-100' },
  inactive: { label: 'Inaktiv',     className: 'bg-red-50 text-red-600 border border-red-100' },
}

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'totalRevenue',     label: 'Totalt inflöde' },
  { value: 'transactionCount', label: 'Antal transaktioner' },
  { value: 'lastPurchase',     label: 'Senaste köp' },
]

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('totalRevenue')

  useEffect(() => {
    fetchWithAuth(`${API_URL}api/v1/customers`)
      .then((r) => r.json())
      .then((json) => setCustomers(json.data ?? json ?? []))
      .catch(() => setError('Kunde inte hämta kunddata.'))
      .finally(() => setLoading(false))
  }, [])

  const sorted = useMemo(() => {
    const filtered = customers.filter((c) =>
      c.name.toLowerCase().includes(search.toLowerCase())
    )
    return [...filtered].sort((a, b) => {
      if (sortBy === 'lastPurchase') {
        return new Date(b.lastPurchase).getTime() - new Date(a.lastPurchase).getTime()
      }
      return b[sortBy] - a[sortBy]
    })
  }, [customers, search, sortBy])

  const top3 = useMemo(
    () => [...customers].sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 3),
    [customers]
  )

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-10 flex flex-col gap-8">

        <div>
          <h1 className="text-2xl font-bold text-primary">Kunder</h1>
          <p className="text-sm text-gray-400 mt-1">Baserat på transaktionsbeskrivningar</p>
        </div>

        {/* Top 3 */}
        {!loading && !error && top3.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Topp 3 kunder</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {top3.map((c, i) => (
                <div key={c.name} className="bg-white border border-gray-100 rounded-xl p-5 flex flex-col gap-3 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-16 h-16 opacity-5">
                    <svg viewBox="0 0 64 64" fill="currentColor" className={i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : 'text-amber-700'}>
                      <path d="M32 4l7.6 15.4L56 22l-12 11.7 2.8 16.5L32 42.4 17.2 50.2 20 33.7 8 22l16.4-2.6z"/>
                    </svg>
                  </div>
                  <div className="flex items-start justify-between">
                    <div>
                      <span className={`text-xs font-bold uppercase tracking-widest ${i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : 'text-amber-700'}`}>
                        #{i + 1}
                      </span>
                      <p className="text-base font-bold text-gray-900 mt-0.5 leading-tight">{c.name}</p>
                    </div>
                    <BehaviorBadge behavior={c.paymentBehavior} />
                  </div>
                  <div className="text-2xl font-bold text-primary">{fmt(c.totalRevenue)}</div>
                  <div className="flex gap-4 text-xs text-gray-400">
                    <span>{c.transactionCount} köp</span>
                    <span>·</span>
                    <span>Snitt {fmt(c.averageAmount)}</span>
                  </div>
                  <div className="text-xs text-gray-400">Senaste: {fmtDate(c.lastPurchase)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search + sort */}
        {!loading && !error && (
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                placeholder="Sök kundnamn..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors bg-white"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 whitespace-nowrap">Sortera på</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors bg-white"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Customer list */}
        {loading ? (
          <div className="flex flex-col gap-3">
            {[...Array(6)].map((_, i) => (
              <SkeletonCard key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-100 text-red-600 rounded-xl px-5 py-4 text-sm">{error}</div>
        ) : sorted.length === 0 ? (
          <EmptyState hasSearch={search.length > 0} />
        ) : (
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            {/* Table header */}
            <div className="hidden sm:grid grid-cols-[1fr_130px_100px_130px_130px_110px] gap-4 px-5 py-3 border-b border-gray-50 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              <span>Kund</span>
              <span className="text-right">Totalt inflöde</span>
              <span className="text-right">Köp</span>
              <span className="text-right">Snitt/köp</span>
              <span className="text-right">Senaste köp</span>
              <span className="text-right">Beteende</span>
            </div>

            {sorted.map((c, i) => (
              <div
                key={c.name}
                className={`flex flex-col sm:grid sm:grid-cols-[1fr_130px_100px_130px_130px_110px] gap-2 sm:gap-4 px-5 py-4 ${i < sorted.length - 1 ? 'border-b border-gray-50' : ''}`}
              >
                <span className="font-semibold text-gray-900 text-sm">{c.name}</span>
                <span className="sm:text-right text-sm font-bold text-primary">
                  <span className="sm:hidden text-xs text-gray-400 font-normal mr-1">Inflöde:</span>
                  {fmt(c.totalRevenue)}
                </span>
                <span className="sm:text-right text-sm text-gray-600">
                  <span className="sm:hidden text-xs text-gray-400 mr-1">Köp:</span>
                  {c.transactionCount}
                </span>
                <span className="sm:text-right text-sm text-gray-600">
                  <span className="sm:hidden text-xs text-gray-400 mr-1">Snitt:</span>
                  {fmt(c.averageAmount)}
                </span>
                <span className="sm:text-right text-sm text-gray-500">
                  <span className="sm:hidden text-xs text-gray-400 mr-1">Senaste:</span>
                  {fmtDate(c.lastPurchase)}
                </span>
                <div className="sm:flex sm:justify-end">
                  <BehaviorBadge behavior={c.paymentBehavior} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function BehaviorBadge({ behavior }: { behavior: PaymentBehavior }) {
  const cfg = BEHAVIOR_CONFIG[behavior] ?? BEHAVIOR_CONFIG.inactive
  return (
    <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  if (hasSearch) {
    return (
      <div className="bg-white border border-gray-100 rounded-xl px-6 py-12 flex flex-col items-center text-center gap-2">
        <p className="text-gray-500 text-sm">Inga kunder matchade din sökning.</p>
      </div>
    )
  }
  return (
    <div className="bg-white border border-gray-100 rounded-xl px-6 py-12 flex flex-col items-center text-center gap-3">
      <svg className="w-10 h-10 text-gray-200" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
      <p className="text-gray-800 font-semibold text-sm">Inga kundnamn hittades i din data.</p>
      <p className="text-gray-400 text-sm max-w-sm">Se till att dina transaktioner innehåller kundnamn i beskrivningsfältet.</p>
    </div>
  )
}
