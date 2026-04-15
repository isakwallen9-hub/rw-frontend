import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const API_URL = import.meta.env.VITE_API_URL as string

export default function Register() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', password: '', organisationName: '', organisationSlug: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleRegister = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      console.log('[REGISTER] response:', JSON.stringify(json, null, 2))
      if (!res.ok) throw new Error(json?.error?.message ?? 'Registrering misslyckades')
      navigate('/login', { state: { message: 'Konto skapat! Logga in.' } })
    } catch (err: any) {
      setError(err.message ?? 'Något gick fel. Kontrollera uppgifterna.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex font-sans">
      {/* Vänster — mörkblå, döljs på mobil */}
      <div className="hidden lg:flex flex-col justify-center px-16 bg-primary text-white w-1/2">
        <div className="mb-6">
          <span className="font-bold text-2xl tracking-tight">RW Systems</span>
        </div>
        <h2 className="text-3xl font-bold leading-snug mb-8">
          Kom igång med kassaflödeskontroll på 5 minuter
        </h2>
        <ul className="flex flex-col gap-4">
          {[
            'Importera bankdata och fakturor enkelt',
            'Se din ekonomiska status direkt',
            'Få prioriterade åtgärder med estimerat värde',
          ].map((point) => (
            <li key={point} className="flex items-start gap-3 text-blue-100 text-sm">
              <svg className="w-4 h-4 mt-0.5 text-blue-300 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              {point}
            </li>
          ))}
        </ul>
      </div>

      {/* Höger — register-form */}
      <div className="flex flex-col justify-center items-center w-full lg:w-1/2 px-6 sm:px-8 bg-white">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8">
            <span className="font-bold text-xl text-primary tracking-tight">RW Systems</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Skapa konto</h1>
          <p className="text-gray-500 text-sm mb-8">Gratis att komma igång</p>

          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Förnamn</label>
                <input type="text" placeholder="Anna" value={form.firstName} onChange={set('firstName')}
                  className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Efternamn</label>
                <input type="text" placeholder="Svensson" value={form.lastName} onChange={set('lastName')}
                  className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">E-post</label>
              <input type="email" placeholder="du@foretaget.se" value={form.email} onChange={set('email')}
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Lösenord</label>
              <input type="password" placeholder="••••••••" value={form.password} onChange={set('password')}
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Organisationsnamn</label>
              <input type="text" placeholder="Acme AB" value={form.organisationName} onChange={set('organisationName')}
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Workspace (slug)</label>
              <input type="text" placeholder="acme-ab" value={form.organisationSlug} onChange={set('organisationSlug')}
                onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors" />
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button onClick={handleRegister} disabled={loading}
              className="w-full bg-primary text-white font-semibold py-3 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 text-sm mt-1 flex items-center justify-center gap-2">
              {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {loading ? 'Skapar konto...' : 'Skapa konto'}
            </button>

            <p className="text-center text-sm text-gray-500">
              Har du redan ett konto?{' '}
              <span onClick={() => navigate('/login')} className="text-accent font-medium cursor-pointer hover:underline">
                Logga in
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
