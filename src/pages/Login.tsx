import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

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
      const res = await axios.post(`${API_URL}api/v1/auth/login`, payload)
      console.log('[LOGIN] full response:', JSON.stringify(res.data, null, 2))
      const data = res.data.data ?? res.data
      const token = data.accessToken ?? data.token ?? data.access_token
      console.log('[LOGIN] extracted token:', token)
      if (!token) {
        setError('Inloggning lyckades men ingen token returnerades. Kontakta support.')
        setLoading(false)
        return
      }
      localStorage.setItem('token', token)
      navigate('/dashboard')
    } catch (err: any) {
      console.error('[LOGIN] error status:', err.response?.status)
      console.error('[LOGIN] error data:', JSON.stringify(err.response?.data, null, 2))
      setError('Fel workspace, e-post eller lösenord.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex font-sans">
      {/* Vänster — mörkblå */}
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
              <span className="mt-0.5 text-accent text-base">✓</span>
              {point}
            </li>
          ))}
        </ul>
      </div>

      {/* Höger — login-form */}
      <div className="flex flex-col justify-center items-center w-full lg:w-1/2 px-8 bg-white">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Logga in</h1>
          <p className="text-gray-500 text-sm mb-8">Välkommen tillbaka till RW Systems</p>

          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Workspace</label>
              <input
                type="text"
                placeholder="ditt-foretag"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">E-post</label>
              <input
                type="email"
                placeholder="du@foretaget.se"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Lösenord</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
              />
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-accent text-white font-semibold py-3 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 text-sm mt-1"
            >
              {loading ? 'Loggar in...' : 'Logga in'}
            </button>

            <p className="text-center text-sm text-gray-500">
              Inget konto?{' '}
              <span
                onClick={() => navigate('/onboarding')}
                className="text-accent font-medium cursor-pointer hover:underline"
              >
                Skapa gratis konto
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
