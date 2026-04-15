import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
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
  const navigate = useNavigate()
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
    <div className="min-h-screen bg-gray-50 font-sans">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10">
        <button
          onClick={() => navigate('/dashboard')}
          className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1.5 mb-6"
        >
          ← Tillbaka
        </button>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">Förfallna fakturor</h1>
        <p className="text-sm text-gray-500 mb-8">Fakturor som passerat förfallodatum.</p>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="p-6">
              <div className="bg-red-50 border border-red-100 text-red-600 rounded-xl px-5 py-4 text-sm">
                {error}
              </div>
            </div>
          ) : invoices.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">
              Inga förfallna fakturor hittades.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3 font-medium text-gray-500 uppercase tracking-wide text-xs">
                    Kund
                  </th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500 uppercase tracking-wide text-xs">
                    Fakturanummer
                  </th>
                  <th className="text-right px-5 py-3 font-medium text-gray-500 uppercase tracking-wide text-xs">
                    Belopp
                  </th>
                  <th className="text-right px-5 py-3 font-medium text-gray-500 uppercase tracking-wide text-xs">
                    Dagar försenad
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, i) => (
                  <tr
                    key={i}
                    className={`border-b border-gray-50 last:border-0 ${
                      inv.daysOverdue > 30 ? 'bg-red-50' : ''
                    }`}
                  >
                    <td className="px-5 py-4 text-gray-800 font-medium">{inv.customerName}</td>
                    <td className="px-5 py-4 text-gray-500">
                      {inv.invoiceNumber ?? '—'}
                    </td>
                    <td className="px-5 py-4 text-gray-800 text-right">{fmt(inv.amount)}</td>
                    <td className="px-5 py-4 text-right">
                      <span
                        className={`font-semibold ${
                          inv.daysOverdue > 30 ? 'text-red-600' : 'text-gray-700'
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

        <div className="mt-8 bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-8 text-center text-gray-400 text-sm">
          Egna grafer — kommer snart
        </div>
      </div>
    </div>
  )
}
