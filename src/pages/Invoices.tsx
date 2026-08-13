import { useEffect, useState } from 'react'
import { fetchWithAuth } from '../utils/fetchWithAuth'

const API_URL = import.meta.env.VITE_API_URL as string

interface LateInvoice {
  customerName: string
  amount: number
  daysOverdue: number
  invoiceNumber?: string
}

function fmt(amount: number): string {
  return amount.toLocaleString('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  })
}

export default function Invoices() {
  const [invoices, setInvoices] = useState<LateInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchWithAuth(`${API_URL}api/v1/recommendations/top3`)
      .then((r) => r.json())
      .then((json) => {
        const data: LateInvoice[] = json?.data?.lateInvoices ?? []
        setInvoices(data)
      })
      .catch(() => setError('Kunde inte hämta fakturadata.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-ink-50 font-sans">
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10">

        <h1 className="text-4xl tracking-tight text-ink-900 mb-1">Förfallna fakturor</h1>
        <p className="text-sm text-ink-500 mb-8">Fakturor som passerat förfallodatum.</p>

        <div className="bg-white rounded-2xl shadow-sm border border-ink-100 overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-10 skeleton rounded-xl" />
              ))}
            </div>
          ) : error ? (
            <div className="p-6">
              <div className="bg-negative-50 border border-negative-100 text-negative-600 rounded-xl px-5 py-4 text-sm">
                {error}
              </div>
            </div>
          ) : invoices.length === 0 ? (
            <div className="p-6 text-center text-ink-400 text-sm">
              Inga förfallna fakturor hittades.
            </div>
          ) : (
            <table className="w-full text-base">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50">
                  <th className="text-left px-5 py-4 font-medium text-ink-500 uppercase tracking-wide text-sm">
                    Kund
                  </th>
                  <th className="text-left px-5 py-4 font-medium text-ink-500 uppercase tracking-wide text-sm">
                    Fakturanummer
                  </th>
                  <th className="text-right px-5 py-4 font-medium text-ink-500 uppercase tracking-wide text-sm">
                    Belopp
                  </th>
                  <th className="text-right px-5 py-4 font-medium text-ink-500 uppercase tracking-wide text-sm">
                    Dagar försenad
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, i) => (
                  <tr
                    key={i}
                    className={`border-b border-ink-50 last:border-0 ${
                      inv.daysOverdue > 30 ? 'bg-negative-50' : ''
                    }`}
                  >
                    <td className="px-5 py-4 text-ink-800 font-medium">{inv.customerName}</td>
                    <td className="px-5 py-4 text-ink-500">
                      {inv.invoiceNumber ?? '—'}
                    </td>
                    <td className="px-5 py-4 text-ink-800 text-right">{fmt(inv.amount)}</td>
                    <td className="px-5 py-4 text-right">
                      <span
                        className={`font-semibold ${
                          inv.daysOverdue > 30 ? 'text-negative-600' : 'text-ink-700'
                        }`}
                      >
                        {inv.daysOverdue}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-8 bg-ink-50 border border-dashed border-ink-200 rounded-2xl p-8 text-center text-ink-400 text-sm">
          Egna grafer: kommer snart
        </div>
      </div>
    </div>
  )
}
