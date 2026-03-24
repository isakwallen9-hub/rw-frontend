import { useState } from 'react'
import axios from 'axios'
import Dashboard from './Dashboard'

const API_URL = 'https://divine-warmth-production.up.railway.app/'

function App() {
  const [view, setView] = useState<'login' | 'register' | 'dashboard'>('login')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [slug, setSlug] = useState('')
  const [orgName, setOrgName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    setLoading(true)
    setError('')
    const payload = { email, password, organisationSlug: slug }
    console.log('[LOGIN] POST', `${API_URL}api/v1/auth/login`, payload)
    try {
      const res = await axios.post(`${API_URL}api/v1/auth/login`, payload)
      console.log('[LOGIN] success', res.data)
      const { accessToken } = res.data.data
      localStorage.setItem('token', accessToken)
      setView('dashboard')
    } catch (err: any) {
      console.error('[LOGIN] error', err.response?.status, err.response?.data)
      setError('Fel e-post, lösenord eller företagsnamn.')
    }
    setLoading(false)
  }

  const handleRegister = async () => {
    setLoading(true)
    setError('')
    const payload = { organisationName: orgName, organisationSlug: slug, email, password, firstName, lastName }
    console.log('[REGISTER] POST', `${API_URL}api/v1/auth/register`, payload)
    try {
      const res = await axios.post(`${API_URL}api/v1/auth/register`, payload)
      console.log('[REGISTER] success', res.data)
      alert('Konto skapat! Logga in nu.')
      setView('login')
    } catch (err: any) {
      console.error('[REGISTER] error', err.response?.status, err.response?.data)
      setError('Något gick fel. Kontrollera uppgifterna.')
    }
    setLoading(false)
  }

  if (view === 'dashboard') {
    return <Dashboard onLogout={() => setView('login')} />
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-full max-w-md px-8 py-10 bg-gray-900 rounded-2xl border border-gray-800">

        {view === 'login' ? (
          <>
            <h1 className="text-white text-2xl font-semibold mb-2">Logga in</h1>
            <p className="text-gray-400 text-sm mb-8">Välkommen tillbaka till RWS</p>
            <div className="flex flex-col gap-4">
              <input type="text" placeholder="Företagets slug (t.ex. acme-ab)" value={slug} onChange={(e) => setSlug(e.target.value)} className="bg-gray-800 text-white rounded-lg px-4 py-3 text-sm outline-none border border-gray-700 focus:border-blue-500" />
              <input type="email" placeholder="E-post" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-gray-800 text-white rounded-lg px-4 py-3 text-sm outline-none border border-gray-700 focus:border-blue-500" />
              <input type="password" placeholder="Lösenord" value={password} onChange={(e) => setPassword(e.target.value)} className="bg-gray-800 text-white rounded-lg px-4 py-3 text-sm outline-none border border-gray-700 focus:border-blue-500" />
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button onClick={handleLogin} disabled={loading} className="bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-lg text-sm transition-colors disabled:opacity-50">
                {loading ? 'Loggar in...' : 'Logga in'}
              </button>
              <p className="text-gray-400 text-sm text-center">Inget konto? <span onClick={() => setView('register')} className="text-blue-400 cursor-pointer hover:underline">Registrera dig</span></p>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-white text-2xl font-semibold mb-2">Skapa konto</h1>
            <p className="text-gray-400 text-sm mb-8">Kom igång med RWS</p>
            <div className="flex flex-col gap-4">
              <input type="text" placeholder="Företagsnamn (t.ex. Acme AB)" value={orgName} onChange={(e) => setOrgName(e.target.value)} className="bg-gray-800 text-white rounded-lg px-4 py-3 text-sm outline-none border border-gray-700 focus:border-blue-500" />
              <input type="text" placeholder="Företagets slug (t.ex. acme-ab)" value={slug} onChange={(e) => setSlug(e.target.value)} className="bg-gray-800 text-white rounded-lg px-4 py-3 text-sm outline-none border border-gray-700 focus:border-blue-500" />
              <input type="text" placeholder="Förnamn" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="bg-gray-800 text-white rounded-lg px-4 py-3 text-sm outline-none border border-gray-700 focus:border-blue-500" />
              <input type="text" placeholder="Efternamn" value={lastName} onChange={(e) => setLastName(e.target.value)} className="bg-gray-800 text-white rounded-lg px-4 py-3 text-sm outline-none border border-gray-700 focus:border-blue-500" />
              <input type="email" placeholder="E-post" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-gray-800 text-white rounded-lg px-4 py-3 text-sm outline-none border border-gray-700 focus:border-blue-500" />
              <input type="password" placeholder="Lösenord (minst 8 tecken)" value={password} onChange={(e) => setPassword(e.target.value)} className="bg-gray-800 text-white rounded-lg px-4 py-3 text-sm outline-none border border-gray-700 focus:border-blue-500" />
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button onClick={handleRegister} disabled={loading} className="bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-lg text-sm transition-colors disabled:opacity-50">
                {loading ? 'Skapar konto...' : 'Skapa konto'}
              </button>
              <p className="text-gray-400 text-sm text-center">Har du redan ett konto? <span onClick={() => setView('login')} className="text-blue-400 cursor-pointer hover:underline">Logga in</span></p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default App