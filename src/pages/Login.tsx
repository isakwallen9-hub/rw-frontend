import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const API_URL = 'https://divine-warmth-production.up.railway.app/'

export default function Login() {
  const navigate = useNavigate()
  const [slug, setSlug] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    setLoading(true)
    setError('')
    const payload = { email, password, organisationSlug: slug }
    console.log('[LOGIN] POST', `${API_URL}api/v1/auth/login`, payload)
    try {
      const res = await fetch(`${API_URL}api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      console.log('[LOGIN] full response:', JSON.stringify(json, null, 2))
      if (!res.ok) throw new Error(json?.error?.message ?? 'Login failed')
      const data = json.data ?? json
      const accessToken = data.accessToken ?? data.token ?? data.access_token
      const refreshToken = data.refreshToken ?? data.refresh_token
      console.log('[LOGIN] extracted accessToken:', accessToken)
      if (!accessToken) {
        setError('Inloggning lyckades men ingen token returnerades. Kontakta support.')
        setLoading(false)
        return
      }
      localStorage.setItem('accessToken', accessToken)
      if (refreshToken) localStorage.setItem('refreshToken', refreshToken)
      console.log('[LOGIN] localStorage accessToken:', localStorage.getItem('accessToken'))
      navigate('/dashboard')
    } catch (err: any) {
      console.error('[LOGIN] error:', err.message)
      setError('Fel workspace, e-post eller lösenord.')
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
          Kassaflödeskontroll för moderna B2B-företag
        </h2>
        <ul className="flex flex-col gap-4">
          {[
            'Få omedelbar överblick över din ekonomi',
            'Se vilka kunder som kostar dig pengar',
            'Agera på prioriterade åtgärder direkt',
          ].map((point) => (
            <li key={point} className="flex items-start gap-3 text-blue-100 text-sm">
              <span className="mt-0.5 text-blue-300 text-base">✓</span>
              {point}
            </li>
          ))}
        </ul>
      </div>

      {/* Höger — login-form */}
      <div className="flex flex-col justify-center items-center w-full lg:w-1/2 px-6 sm:px-8 bg-white">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8">
            <span className="font-bold text-xl text-primary tracking-tight">RW Systems</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Logga in</h1>
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

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button onClick={handleLogin} disabled={loading}
              className="w-full bg-accent text-white font-semibold py-3 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 text-sm mt-1 flex items-center justify-center gap-2">
              {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {loading ? 'Loggar in...' : 'Logga in'}
            </button>

            <p className="text-center text-sm text-gray-500">
              Inget konto?{' '}
              <span onClick={() => navigate('/onboarding')} className="text-accent font-medium cursor-pointer hover:underline">
                Skapa gratis konto
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
