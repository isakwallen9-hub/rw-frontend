import { createContext, useContext, useEffect, useState } from 'react'
import { fetchWithAuth } from '../utils/fetchWithAuth'

const API_URL = import.meta.env.VITE_API_URL as string

const LOCALES: Record<string, string> = {
  SEK: 'sv-SE',
  EUR: 'de-DE',
  USD: 'en-US',
  GBP: 'en-GB',
}

interface CurrencyContextValue {
  currency: string
  setCurrency: (c: string) => void
  formatAmount: (sekAmount: number | undefined | null) => string
}

const defaultFormat = (n: number | undefined | null) =>
  (n ?? 0).toLocaleString('sv-SE', { style: 'currency', currency: 'SEK', minimumFractionDigits: 0, maximumFractionDigits: 0 })

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: 'SEK',
  setCurrency: () => {},
  formatAmount: defaultFormat,
})

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrency] = useState('SEK')
  const [rates, setRates] = useState<Record<string, number>>({})

  useEffect(() => {
    const token = localStorage.getItem('accessToken')
    if (!token || token === 'undefined' || token === 'null') return

    fetchWithAuth(`${API_URL}api/v1/auth/me`)
      .then(r => r.json())
      .then(json => {
        const data = json.data ?? json
        const c = data.currency ?? data.organisation?.currency
        if (c) setCurrency(c)
      })
      .catch(() => {})

    fetchWithAuth(`${API_URL}api/v1/currency/rates`)
      .then(r => r.json())
      .then(json => setRates(json.data ?? json ?? {}))
      .catch(() => {})
  }, [])

  const formatAmount = (sekAmount: number | undefined | null): string => {
    const amount = sekAmount ?? 0
    const rate = currency === 'SEK' ? 1 : (rates[currency] ?? 1)
    const converted = amount * rate
    const locale = LOCALES[currency] ?? 'sv-SE'
    return converted.toLocaleString(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  }

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, formatAmount }}>
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency() {
  return useContext(CurrencyContext)
}
