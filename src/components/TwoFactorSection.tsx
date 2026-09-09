import { useEffect, useState } from 'react'
import { ShieldCheck, KeyRound, Copy, Check } from 'lucide-react'
import { fetchWithAuth } from '../utils/fetchWithAuth'
import { SkeletonCard } from './Skeleton'
import { QrCode } from './QrCode'

const API_URL = import.meta.env.VITE_API_URL as string

interface TwoFaStatus { enabled: boolean; pending: boolean; recoveryCodesRemaining: number }
interface SetupData { otpauthUrl: string; secret: string }
interface RecoveryData { codes: string[]; warning: string }

async function errMessage(res: Response, fallback: string): Promise<string> {
  try {
    const j = await res.json()
    return j?.error?.message ?? j?.message ?? fallback
  } catch {
    return fallback
  }
}

export default function TwoFactorSection() {
  const [status, setStatus] = useState<TwoFaStatus | null>(null)
  const [loading, setLoading] = useState(true)

  const [phase, setPhase] = useState<'idle' | 'setup' | 'codes'>('idle')
  const [setup, setSetup] = useState<SetupData | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [recovery, setRecovery] = useState<RecoveryData | null>(null)
  const [copied, setCopied] = useState(false)

  const [disableOpen, setDisableOpen] = useState(false)
  const [disablePassword, setDisablePassword] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [disableBusy, setDisableBusy] = useState(false)
  const [disableErr, setDisableErr] = useState('')

  useEffect(() => {
    fetchWithAuth(`${API_URL}api/v1/auth/2fa/status`)
      .then(r => r.json())
      .then(json => setStatus(json?.data ?? null))
      .catch(() => setStatus(null))
      .finally(() => setLoading(false))
  }, [])

  const startSetup = async () => {
    setBusy(true); setErr('')
    try {
      const res = await fetchWithAuth(`${API_URL}api/v1/auth/2fa/setup`, { method: 'POST' })
      if (!res.ok) throw new Error(await errMessage(res, 'Kunde inte starta aktiveringen. Försök igen.'))
      const d = (await res.json())?.data ?? {}
      setSetup({ otpauthUrl: String(d.otpauthUrl ?? ''), secret: String(d.secret ?? '') })
      setCode(''); setPhase('setup')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Något gick fel.') }
    setBusy(false)
  }

  const verify = async () => {
    if (!/^\d{6}$/.test(code.trim())) { setErr('Ange den sexsiffriga koden från appen.'); return }
    setBusy(true); setErr('')
    try {
      const res = await fetchWithAuth(`${API_URL}api/v1/auth/2fa/verify`, {
        method: 'POST', body: JSON.stringify({ code: code.trim() }),
      })
      if (!res.ok) throw new Error(await errMessage(res, 'Ogiltig kod. Försök igen med den kod appen visar just nu.'))
      const d = (await res.json())?.data ?? {}
      setRecovery({
        codes: Array.isArray(d.recoveryCodes) ? d.recoveryCodes.map(String) : [],
        warning: String(d.warning ?? ''),
      })
      setPhase('codes')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Något gick fel.') }
    setBusy(false)
  }

  const confirmSavedCodes = () => {
    setStatus({ enabled: true, pending: false, recoveryCodesRemaining: recovery?.codes.length ?? 0 })
    setRecovery(null); setSetup(null); setCode(''); setCopied(false); setErr(''); setPhase('idle')
  }

  const copyCodes = async () => {
    if (!recovery) return
    try {
      await navigator.clipboard.writeText(recovery.codes.join('\n'))
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable — codes are still visible */ }
  }

  const disable = async () => {
    if (!disablePassword || !/^\d{6}$/.test(disableCode.trim())) { setDisableErr('Fyll i lösenord och den sexsiffriga koden.'); return }
    setDisableBusy(true); setDisableErr('')
    try {
      const res = await fetchWithAuth(`${API_URL}api/v1/auth/2fa/disable`, {
        method: 'POST', body: JSON.stringify({ password: disablePassword, code: disableCode.trim() }),
      })
      if (!res.ok) throw new Error(await errMessage(res, 'Fel lösenord eller kod.'))
      setStatus({ enabled: false, pending: false, recoveryCodesRemaining: 0 })
      setDisableOpen(false); setDisablePassword(''); setDisableCode('')
    } catch (e) { setDisableErr(e instanceof Error ? e.message : 'Något gick fel.') }
    setDisableBusy(false)
  }

  return (
    <div>
      <h2 className="text-2xl text-ink-800 mb-4">Tvåfaktorsautentisering</h2>
      <div className="glass rounded-xl p-5">
        {loading ? (
          <SkeletonCard className="h-16 w-full" />

        /* ── Recovery codes (shown once) ─────────────────────────────── */
        ) : phase === 'codes' && recovery ? (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <KeyRound className="w-5 h-5 text-caution-600 shrink-0" aria-hidden="true" />
              <h3 className="text-base font-semibold text-ink-900">Dina återställningskoder</h3>
            </div>
            <div className="bg-caution-50 border border-caution-200 rounded-xl p-4 mb-4">
              <p className="text-sm text-caution-800 leading-relaxed">{recovery.warning}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {recovery.codes.map((c, i) => (
                <div key={i} className="font-mono text-sm text-ink-800 bg-ink-50 border border-ink-100 rounded-lg px-3 py-2 text-center tracking-wider select-all">{c}</div>
              ))}
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
              <button
                onClick={() => void copyCodes()}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900 transition-colors min-h-[44px]"
              >
                {copied ? <Check className="w-4 h-4 text-positive-600" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Kopierat' : 'Kopiera alla'}
              </button>
              <button
                onClick={confirmSavedCodes}
                className="inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 active:scale-[0.98] transition-[transform,background-color] duration-150"
              >
                Jag har sparat koderna
              </button>
            </div>
          </div>

        /* ── Setup: QR + secret + code ───────────────────────────────── */
        ) : phase === 'setup' && setup ? (
          <div>
            <h3 className="text-base font-semibold text-ink-900 mb-1">Koppla en autentiseringsapp</h3>
            <p className="text-sm text-ink-500 mb-4 leading-relaxed">
              Skanna QR-koden med din autentiseringsapp (t.ex. Google Authenticator eller Authy), eller ange nyckeln manuellt. Skriv sedan in den sexsiffriga koden.
            </p>
            <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">
              <div className="border border-ink-100 rounded-xl p-2 bg-white shrink-0">
                <QrCode value={setup.otpauthUrl} size={168} />
              </div>
              <div className="flex-1 w-full min-w-0">
                <label className="block text-xs font-medium text-ink-500 mb-1">Nyckel för manuell inmatning</label>
                <p className="font-mono text-xs text-ink-800 bg-ink-50 border border-ink-100 rounded-lg px-3 py-2 mb-4 break-all select-all">{setup.secret}</p>

                <label className="block text-xs font-medium text-ink-500 mb-1">Sexsiffrig kod</label>
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={e => e.key === 'Enter' && void verify()}
                  placeholder="123456"
                  className="w-full border border-ink-200 rounded-lg px-4 py-2.5 text-sm tracking-[0.3em] font-mono outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition-colors"
                />
                {err && <p className="text-negative-600 text-sm mt-2">{err}</p>}
                <div className="flex items-center gap-3 mt-4">
                  <button
                    onClick={() => void verify()}
                    disabled={busy || code.length !== 6}
                    className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 active:scale-[0.98] transition-[transform,background-color] duration-150 disabled:opacity-40"
                  >
                    {busy && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                    Verifiera och aktivera
                  </button>
                  <button onClick={() => { setPhase('idle'); setSetup(null); setErr('') }} className="text-sm font-medium text-ink-500 hover:text-ink-800 transition-colors min-h-[44px]">Avbryt</button>
                </div>
              </div>
            </div>
          </div>

        /* ── Enabled ─────────────────────────────────────────────────── */
        ) : status?.enabled ? (
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-positive-50 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-positive-600" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-800">Aktiverad</p>
                <p className="text-xs text-ink-400 mt-0.5">
                  Ditt konto skyddas med en engångskod vid inloggning.
                  {typeof status.recoveryCodesRemaining === 'number' && ` ${status.recoveryCodesRemaining} återställningskoder kvar.`}
                </p>
              </div>
            </div>
            <button
              onClick={() => { setDisableErr(''); setDisablePassword(''); setDisableCode(''); setDisableOpen(true) }}
              className="text-sm font-semibold text-negative-600 border border-negative-200 rounded-xl px-4 py-2 hover:bg-negative-50 active:scale-[0.98] transition-[transform,background-color] duration-150 min-h-[44px] shrink-0"
            >
              Stäng av
            </button>
          </div>

        /* ── Not enabled ─────────────────────────────────────────────── */
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-ink-100 flex items-center justify-center shrink-0">
                <KeyRound className="w-5 h-5 text-ink-500" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-800">Inte aktiverad</p>
                <p className="text-xs text-ink-400 mt-0.5 leading-relaxed">Lägg till ett extra lager säkerhet med en engångskod från en app i telefonen.</p>
                {err && <p className="text-negative-600 text-sm mt-1">{err}</p>}
              </div>
            </div>
            <button
              onClick={() => void startSetup()}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 active:scale-[0.98] transition-[transform,background-color] duration-150 disabled:opacity-40 shrink-0"
            >
              {busy && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              Aktivera
            </button>
          </div>
        )}
      </div>

      {/* ── Disable modal (password + TOTP) ───────────────────────────── */}
      {disableOpen && (
        <div className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={disableBusy ? undefined : () => setDisableOpen(false)}>
          <div className="glass rounded-2xl p-6 max-w-sm w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-ink-900 mb-1">Stäng av tvåfaktorsautentisering?</h3>
            <p className="text-sm text-ink-500 leading-relaxed mb-4">Bekräfta med ditt lösenord och en aktuell kod från appen.</p>
            <div className="flex flex-col gap-3">
              <input
                type="password"
                value={disablePassword}
                onChange={e => setDisablePassword(e.target.value)}
                placeholder="Lösenord"
                autoComplete="current-password"
                className="w-full border border-ink-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition-colors"
              />
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={disableCode}
                onChange={e => setDisableCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && void disable()}
                placeholder="Sexsiffrig kod"
                className="w-full border border-ink-200 rounded-lg px-4 py-2.5 text-sm tracking-[0.3em] font-mono outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition-colors"
              />
              {disableErr && <p className="text-negative-600 text-sm">{disableErr}</p>}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setDisableOpen(false)} disabled={disableBusy} className="flex-1 py-2.5 border border-ink-200 rounded-xl text-sm font-medium text-ink-700 hover:bg-ink-50 transition-colors min-h-[44px] disabled:opacity-50">Avbryt</button>
              <button onClick={() => void disable()} disabled={disableBusy} className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 bg-negative-600 text-white rounded-xl text-sm font-semibold hover:bg-negative-700 transition-colors min-h-[44px] disabled:opacity-50">
                {disableBusy && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                Stäng av
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
