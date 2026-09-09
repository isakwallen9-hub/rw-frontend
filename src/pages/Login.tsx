import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import RWLogo from '../assets/RWLogo'

const API_URL = import.meta.env.VITE_API_URL as string

const inputClass =
  'w-full border border-ink-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const successMessage = (location.state as { message?: string } | null)?.message ?? ''

  const [step, setStep] = useState<'credentials' | 'totp' | 'recovered'>('credentials')

  // Step 1 — credentials
  const [slug, setSlug] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Step 2 — two-factor
  const [challengeToken, setChallengeToken] = useState('')
  const [useRecovery, setUseRecovery] = useState(false)
  const [totpCode, setTotpCode] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [twoFaError, setTwoFaError] = useState('')
  const [twoFaLoading, setTwoFaLoading] = useState(false)

  // Step 3 — recovered notice
  const [recoveredNotice, setRecoveredNotice] = useState('')

  const finishLogin = (accessToken: string) => {
    localStorage.setItem('accessToken', accessToken)
    navigate('/dashboard')
  }

  const handleLogin = async () => {
    if (!slug.trim() || !email.trim() || !password) {
      setError('Fyll i workspace, e-post och lösenord.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}api/v1/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password, organisationSlug: slug.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message ?? 'Login failed')
      const data = json.data ?? {}

      // Accounts with 2FA return a challenge instead of a session.
      if (data.twoFactorRequired === true) {
        setChallengeToken(String(data.challengeToken ?? ''))
        setUseRecovery(false)
        setTotpCode(''); setRecoveryCode(''); setTwoFaError('')
        setStep('totp')
        setLoading(false)
        return
      }

      const accessToken = data.accessToken
      if (!accessToken) {
        setError('Inloggning lyckades men ingen token returnerades. Kontakta support.')
        setLoading(false)
        return
      }
      finishLogin(accessToken)
    } catch {
      setError('Fel workspace, e-post eller lösenord.')
    }
    setLoading(false)
  }

  const submitTwoFactor = async () => {
    const recovery = useRecovery
    if (recovery ? !recoveryCode.trim() : !/^\d{6}$/.test(totpCode.trim())) {
      setTwoFaError(recovery ? 'Ange en återställningskod.' : 'Ange den sexsiffriga koden.')
      return
    }
    setTwoFaLoading(true)
    setTwoFaError('')
    try {
      const endpoint = recovery ? '2fa/recover' : '2fa/challenge'
      const body = recovery
        ? { challengeToken, recoveryCode: recoveryCode.trim() }
        : { challengeToken, code: totpCode.trim() }
      const res = await fetch(`${API_URL}api/v1/auth/${endpoint}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message ?? 'Verifiering misslyckades')
      const data = json.data ?? {}
      const accessToken = data.accessToken
      if (!accessToken) throw new Error('Ingen token returnerades.')

      // Recovery turns 2FA off — show a notice before continuing.
      if (recovery && data.twoFactorDisabled === true) {
        localStorage.setItem('accessToken', accessToken)
        setRecoveredNotice(String(data.twoFactorNotice ?? 'Tvåfaktorsautentiseringen är nu avstängd.'))
        setStep('recovered')
        setTwoFaLoading(false)
        return
      }
      finishLogin(accessToken)
    } catch (err) {
      setTwoFaError(err instanceof Error ? err.message : 'Verifiering misslyckades. Försök igen.')
    }
    setTwoFaLoading(false)
  }

  return (
    <div className="min-h-screen flex font-sans">
      {/* Vänster panel — döljs på mobil */}
      <div className="hidden lg:flex flex-col justify-center px-16 bg-primary text-white w-1/2">
        <div className="mb-6"><RWLogo className="w-28 h-auto" /></div>
        <p className="text-brand-300 text-sm font-medium tracking-wide mb-8 uppercase">The system for you</p>
        <ul className="flex flex-col gap-4">
          {[
            'Få omedelbar överblick över din ekonomi',
            'Se vilka kunder som kostar dig pengar',
            'Agera på prioriterade åtgärder direkt',
          ].map((point) => (
            <li key={point} className="flex items-start gap-3 text-brand-100 text-sm">
              <svg className="w-4 h-4 mt-0.5 text-brand-300 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              {point}
            </li>
          ))}
        </ul>
      </div>

      {/* Höger — formulär */}
      <div className="flex flex-col justify-center items-center w-full lg:w-1/2 px-6 sm:px-8 bg-white">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8 flex items-center gap-3">
            <RWLogo className="w-12 h-auto" />
            <div>
              <p className="font-bold text-lg text-primary tracking-tight leading-tight">RW Systems</p>
              <p className="text-xs text-ink-400">The system for you</p>
            </div>
          </div>

          {/* ── Step 1: credentials ──────────────────────────────────── */}
          {step === 'credentials' && (
            <>
              <h1 className="text-4xl tracking-tight text-ink-900 mb-1">Logga in</h1>
              <p className="text-ink-500 text-sm mb-8">Välkommen tillbaka till RW Systems</p>
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-medium text-ink-600 mb-1">Workspace</label>
                  <input type="text" placeholder="ditt-foretag" value={slug} onChange={(e) => setSlug(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-600 mb-1">E-post</label>
                  <input type="email" placeholder="du@foretaget.se" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-600 mb-1">Lösenord</label>
                  <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} className={inputClass} />
                </div>

                {successMessage && <p className="text-positive-600 text-sm">{successMessage}</p>}
                {error && <p className="text-negative-600 text-sm">{error}</p>}

                <button onClick={handleLogin} disabled={loading} className="w-full bg-accent text-white font-semibold py-3 rounded-lg shadow-md shadow-brand-500/20 hover:opacity-90 transition-opacity disabled:opacity-50 text-sm mt-1 flex items-center justify-center gap-2 min-h-[44px]">
                  {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {loading ? 'Loggar in...' : 'Logga in'}
                </button>

                <p className="text-center text-sm text-ink-500">
                  Inget konto?{' '}
                  <span onClick={() => navigate('/register')} className="text-accent font-medium cursor-pointer hover:underline">Skapa gratis konto</span>
                </p>
              </div>
            </>
          )}

          {/* ── Step 2: two-factor ───────────────────────────────────── */}
          {step === 'totp' && (
            <>
              <h1 className="text-4xl tracking-tight text-ink-900 mb-1">Verifiera din identitet</h1>
              <p className="text-ink-500 text-sm mb-8">
                {useRecovery
                  ? 'Ange en av dina återställningskoder för att logga in.'
                  : 'Ange den sexsiffriga koden från din autentiseringsapp.'}
              </p>

              <div className="flex flex-col gap-4">
                {useRecovery ? (
                  <div>
                    <label className="block text-xs font-medium text-ink-600 mb-1">Återställningskod</label>
                    <input
                      value={recoveryCode}
                      onChange={(e) => setRecoveryCode(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && void submitTwoFactor()}
                      placeholder="XXXX-XXXX-XXXX-XXXX"
                      autoComplete="one-time-code"
                      className={`${inputClass} font-mono tracking-wider`}
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-ink-600 mb-1">Sexsiffrig kod</label>
                    <input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                      onKeyDown={(e) => e.key === 'Enter' && void submitTwoFactor()}
                      placeholder="123456"
                      className={`${inputClass} font-mono tracking-[0.4em] text-center text-lg`}
                    />
                  </div>
                )}

                {twoFaError && <p className="text-negative-600 text-sm">{twoFaError}</p>}

                <button onClick={() => void submitTwoFactor()} disabled={twoFaLoading} className="w-full bg-accent text-white font-semibold py-3 rounded-lg shadow-md shadow-brand-500/20 hover:opacity-90 transition-opacity disabled:opacity-50 text-sm mt-1 flex items-center justify-center gap-2 min-h-[44px]">
                  {twoFaLoading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {twoFaLoading ? 'Verifierar...' : 'Verifiera och logga in'}
                </button>

                <button
                  onClick={() => { setUseRecovery(v => !v); setTwoFaError('') }}
                  className="text-sm text-accent font-medium hover:underline text-center min-h-[44px]"
                >
                  {useRecovery ? 'Använd koden från appen istället' : 'Använd återställningskod istället'}
                </button>

                <button
                  onClick={() => { setStep('credentials'); setPassword(''); setTwoFaError('') }}
                  className="text-sm text-ink-400 hover:text-ink-700 transition-colors text-center"
                >
                  ← Tillbaka
                </button>
              </div>
            </>
          )}

          {/* ── Step 3: recovered (2FA now off) ──────────────────────── */}
          {step === 'recovered' && (
            <>
              <div className="w-12 h-12 rounded-full bg-caution-50 flex items-center justify-center mb-4">
                <ShieldCheck className="w-6 h-6 text-caution-600" aria-hidden="true" />
              </div>
              <h1 className="text-3xl tracking-tight text-ink-900 mb-2">Tvåfaktor avstängd</h1>
              <div className="bg-caution-50 border border-caution-200 rounded-xl px-4 py-3 mb-4">
                <p className="text-sm text-caution-800 leading-relaxed">{recoveredNotice}</p>
              </div>
              <p className="text-sm text-ink-500 leading-relaxed mb-6">
                Du kan aktivera tvåfaktorsautentisering på nytt när som helst under <span className="font-medium text-ink-700">Profil</span>.
              </p>
              <button onClick={() => navigate('/dashboard')} className="w-full bg-accent text-white font-semibold py-3 rounded-lg shadow-md shadow-brand-500/20 hover:opacity-90 transition-opacity text-sm flex items-center justify-center gap-2 min-h-[44px]">
                Fortsätt till dashboard
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
