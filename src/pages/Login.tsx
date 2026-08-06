import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import RWLogo from '../assets/RWLogo'

const API_URL = import.meta.env.VITE_API_URL as string

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const successMessage = (location.state as any)?.message ?? ''
  const [slug, setSlug] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    if (!slug.trim() || !email.trim() || !password) {
      setError('Fyll i workspace, e-post och lösenord.')
      return
    }
    setLoading(true)
    setError('')
    const payload = { email: email.trim(), password, organisationSlug: slug.trim() }
    try {
      const res = await fetch(`${API_URL}api/v1/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message ?? 'Login failed')
      const data = json.data ?? json
      const accessToken = data.accessToken ?? data.token ?? data.access_token
      if (!accessToken) {
        setError('Inloggning lyckades men ingen token returnerades. Kontakta support.')
        setLoading(false)
        return
      }
      localStorage.setItem('accessToken', accessToken)
      navigate('/dashboard')
    } catch (err: any) {
      setError('Fel workspace, e-post eller lösenord.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex font-sans">
      {/* Vänster — mörkblå, döljs på mobil */}
      <div className="hidden lg:flex flex-col justify-center px-16 bg-primary text-white w-1/2">
        <div className="mb-6">
          <RWLogo className="w-28 h-auto" />
        </div>
        <p className="text-blue-300 text-sm font-medium tracking-wide mb-8 uppercase">The system for you</p>
        <ul className="flex flex-col gap-4">
          {[
            'Få omedelbar överblick över din ekonomi',
            'Se vilka kunder som kostar dig pengar',
            'Agera på prioriterade åtgärder direkt',
          ].map((point) => (
            <li key={point} className="flex items-start gap-3 text-blue-100 text-sm">
              <svg className="w-4 h-4 mt-0.5 text-blue-300 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              {point}
            </li>
          ))}
        </ul>
      </div>

      {/* Höger — login-form */}
      <div className="flex flex-col justify-center items-center w-full lg:w-1/2 px-6 sm:px-8 bg-white">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8 flex items-center gap-3">
            <RWLogo className="w-12 h-auto" />
            <div>
              <p className="font-bold text-lg text-primary tracking-tight leading-tight">RW Systems</p>
              <p className="text-xs text-gray-400">The system for you</p>
            </div>
          </div>
          <h1 className="text-3xl tracking-tight text-slate-900 mb-1">Logga in</h1>
          <p className="text-gray-500 text-sm mb-8">Välkommen tillbaka till RW Systems</p>

          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Workspace</label>
              <input type="text" placeholder="ditt-foretag" value={slug} onChange={(e) => setSlug(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">E-post</label>
              <input type="email" placeholder="du@foretaget.se" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Lösenord</label>
              <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors" />
            </div>

            {successMessage && <p className="text-green-600 text-sm">{successMessage}</p>}
            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button onClick={handleLogin} disabled={loading}
              className="w-full bg-accent text-white font-semibold py-3 rounded-lg shadow-md shadow-blue-500/20 hover:opacity-90 transition-opacity disabled:opacity-50 text-sm mt-1 flex items-center justify-center gap-2">
              {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {loading ? 'Loggar in...' : 'Logga in'}
            </button>

            <p className="text-center text-sm text-gray-500">
              Inget konto?{' '}
              <span onClick={() => navigate('/register')} className="text-accent font-medium cursor-pointer hover:underline">
                Skapa gratis konto
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
