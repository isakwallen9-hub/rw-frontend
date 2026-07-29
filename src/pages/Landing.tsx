import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import RWLogo from '../assets/RWLogo'
import {
  ArrowRight, Brain, BarChart2, TrendingUp, Target, Users,
  FileText, Sparkles, ShieldCheck, Clock, ArrowUpRight,
} from 'lucide-react'

/* ══════════════════════════════════════════════════════════════════════
   Motion helpers
   ══════════════════════════════════════════════════════════════════════ */

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Reveal-on-scroll — settles content in as it enters the viewport. */
function useFadeIn() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (prefersReducedMotion()) {
      el.classList.add('opacity-100', 'translate-y-0')
      el.classList.remove('opacity-0', 'translate-y-6')
      return
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('opacity-100', 'translate-y-0')
          el.classList.remove('opacity-0', 'translate-y-6')
          obs.unobserve(el)
        }
      },
      { threshold: 0.14 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return ref
}

function FadeIn({ children, className = '', delay = 0 }: {
  children: React.ReactNode
  className?: string
  delay?: number
}) {
  const ref = useFadeIn()
  return (
    <div
      ref={ref}
      className={`opacity-0 translate-y-6 transition-all duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

/** Counts a number up from 0 on mount (eased), honoring reduced-motion. */
function useCountUp(target: number, duration = 1500) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (prefersReducedMotion()) { setVal(target); return }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
      setVal(Math.round(target * eased))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return val
}

/* ══════════════════════════════════════════════════════════════════════
   Chart primitives — hand-drawn SVG so we control the craft & motion
   ══════════════════════════════════════════════════════════════════════ */

/** Catmull-Rom → cubic bézier: a premium, smooth curve through points. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return ''
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x} ${p2.y}`
  }
  return d
}

function toPoints(series: number[], w: number, h: number, pad = 6) {
  const max = Math.max(...series)
  const min = Math.min(...series)
  const span = max - min || 1
  const stepX = (w - pad * 2) / (series.length - 1)
  return series.map((v, i) => ({
    x: pad + i * stepX,
    y: pad + (h - pad * 2) * (1 - (v - min) / span),
  }))
}

const HERO_SERIES = [38, 52, 44, 61, 54, 72, 66, 83, 78, 96]

/** The hero's live cashflow instrument: filled area + self-drawing line. */
function CashflowInstrument() {
  const W = 320, H = 128
  const pts = toPoints(HERO_SERIES, W, H)
  const line = smoothPath(pts)
  const area = `${line} L ${pts[pts.length - 1].x} ${H} L ${pts[0].x} ${H} Z`
  const last = pts[pts.length - 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" aria-hidden="true">
      <defs>
        <linearGradient id="rwHeroArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2563eb" stopOpacity="0.26" />
          <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#rwHeroArea)" className="rw-area-in" />
      <path
        d={line}
        fill="none"
        stroke="#2563eb"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={100}
        className="rw-draw"
      />
      <circle cx={last.x} cy={last.y} r="4.5" fill="#2563eb" className="rw-area-in" />
      <circle cx={last.x} cy={last.y} r="8" fill="#2563eb" fillOpacity="0.18" className="rw-area-in" />
    </svg>
  )
}

/** Tiny static sparkline for feature cells. */
function Sparkline({ series, className = '', stroke = '#2563eb' }: {
  series: number[]; className?: string; stroke?: string
}) {
  const W = 120, H = 36
  const pts = toPoints(series, W, H, 3)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden="true" preserveAspectRatio="none">
      <path d={smoothPath(pts)} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   Page
   ══════════════════════════════════════════════════════════════════════ */

export default function Landing() {
  // Landing is ALWAYS shown on `/` — never redirect. When already signed in,
  // the auth CTAs collapse into a single "Gå till dashboard" action.
  const token = localStorage.getItem('accessToken')
  const loggedIn = !!token && token !== 'undefined' && token !== 'null'

  const cashflow = useCountUp(124500)

  return (
    <div className="relative min-h-screen font-sans overflow-x-hidden">

      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-30 bg-white/55 backdrop-blur-xl border-b border-white/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <RWLogo className="h-7 w-auto" />
            <span className="font-bold text-slate-900 tracking-tight text-sm">RW Systems</span>
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-3">
            {loggedIn ? (
              <Link
                to="/dashboard"
                className="group inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-primary px-4 py-2 rounded-lg shadow-md shadow-blue-900/15 hover:shadow-lg hover:-translate-y-px active:translate-y-0 transition-all min-h-[44px]"
              >
                Gå till dashboard
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors px-3 py-2 rounded-lg hover:bg-white/60 min-h-[44px] flex items-center"
                >
                  Logga in
                </Link>
                <Link
                  to="/register"
                  className="text-sm font-semibold text-white bg-primary px-4 py-2 rounded-lg shadow-md shadow-blue-900/15 hover:shadow-lg hover:-translate-y-px active:translate-y-0 transition-all min-h-[44px] flex items-center"
                >
                  Kom igång gratis
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero — asymmetric, numbers-first ─────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-8 pt-16 pb-20 sm:pt-24 sm:pb-28">
        <div className="lg:grid lg:grid-cols-12 lg:gap-14 lg:items-center">

          {/* Left — the thesis */}
          <div className="lg:col-span-6">
            <FadeIn>
              <div className="inline-flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-70 motion-safe:animate-ping" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600" />
                </span>
                Realtidsekonomi
              </div>
            </FadeIn>

            <FadeIn delay={90}>
              <h1 className="mt-6 text-[2.6rem] leading-[1.04] sm:text-6xl sm:leading-[1.03] font-extrabold text-slate-900 tracking-tight text-balance">
                Se vart pengarna tar vägen&nbsp;—{' '}
                <span className="text-primary">medan det händer.</span>
              </h1>
            </FadeIn>

            <FadeIn delay={170}>
              <p className="mt-6 text-lg text-slate-500 leading-relaxed max-w-md">
                RW Systems samlar kassaflöde, budget, kundanalys och en AI-ekonomicoach i en enda vy.
                För dig som vill <span className="text-slate-700 font-medium">förstå</span> siffrorna — inte bara bokföra dem.
              </p>
            </FadeIn>

            <FadeIn delay={250}>
              <div className="mt-9 flex flex-col sm:flex-row sm:items-center gap-3">
                {loggedIn ? (
                  <Link
                    to="/dashboard"
                    className="group inline-flex items-center justify-center gap-2 bg-primary text-white font-bold text-base px-7 py-4 rounded-xl shadow-lg shadow-blue-900/15 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all min-h-[52px]"
                  >
                    Gå till dashboard
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
                  </Link>
                ) : (
                  <>
                    <Link
                      to="/register"
                      className="group inline-flex items-center justify-center gap-2 bg-primary text-white font-bold text-base px-7 py-4 rounded-xl shadow-lg shadow-blue-900/15 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all min-h-[52px]"
                    >
                      Kom igång gratis
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
                    </Link>
                    <Link
                      to="/login"
                      className="inline-flex items-center justify-center gap-2 text-slate-700 font-semibold text-base px-6 py-4 rounded-xl border border-slate-200/70 bg-white/50 backdrop-blur hover:bg-white/80 hover:border-slate-300 active:scale-[0.99] transition-all min-h-[52px]"
                    >
                      Logga in
                    </Link>
                  </>
                )}
              </div>
            </FadeIn>

            <FadeIn delay={330}>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2.5 text-sm text-slate-500">
                {['Gratis under beta', 'Setup under 5 min', 'Data lagrad i Sverige'].map((t) => (
                  <span key={t} className="inline-flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-600/80 shrink-0" aria-hidden="true" />
                    {t}
                  </span>
                ))}
              </div>
            </FadeIn>
          </div>

          {/* Right — the living instrument */}
          <div className="lg:col-span-6 mt-14 lg:mt-0">
            <FadeIn delay={200}>
              <div className="relative">
                {/* brand glow */}
                <div
                  className="absolute -inset-6 sm:-inset-8 bg-gradient-to-tr from-blue-400/25 via-indigo-300/15 to-transparent blur-3xl rounded-[2.5rem] pointer-events-none"
                  aria-hidden="true"
                />

                {/* primary panel */}
                <div className="relative glass-kpi rounded-3xl p-5 sm:p-7 shadow-xl">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Kassaflöde · Juli</p>
                      <p className="mt-1 text-sm font-semibold text-slate-500">Netto denna månad</p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-green-700 bg-green-50 border border-green-100 rounded-full px-2.5 py-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 motion-safe:animate-pulse" aria-hidden="true" />
                      LIVE
                    </span>
                  </div>

                  <div className="flex items-end gap-2">
                    <span className="text-4xl sm:text-5xl font-extrabold text-green-600 tabular-nums tracking-tight leading-none">
                      +{cashflow.toLocaleString('sv-SE')}
                    </span>
                    <span className="text-lg font-bold text-green-600/70 mb-0.5">kr</span>
                    <span className="ml-auto inline-flex items-center gap-1 text-sm font-bold text-green-600 mb-1">
                      <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
                      18%
                    </span>
                  </div>

                  <div className="mt-4">
                    <CashflowInstrument />
                  </div>

                  {/* AI insight row — the product's voice */}
                  <div className="mt-4 flex items-start gap-3 rounded-2xl bg-gradient-to-r from-blue-50/90 to-indigo-50/60 border border-blue-100/70 px-4 py-3">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-sm">
                      <Sparkles className="w-3.5 h-3.5 text-white" aria-hidden="true" />
                    </div>
                    <p className="text-[13px] text-slate-600 leading-snug">
                      <span className="font-semibold text-slate-800">Din AI-coach:</span>{' '}
                      Intäkterna ökade 18% mot juni — starkast från återkommande kunder.
                    </p>
                  </div>
                </div>

                {/* offset secondary card — layered depth (lg only) */}
                <div className="hidden lg:block absolute -bottom-9 -left-10 w-48 glass rounded-2xl p-4 shadow-lg">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Runway</p>
                  <p className="mt-1.5 text-2xl font-extrabold text-slate-900 tabular-nums tracking-tight">8,4 <span className="text-base font-bold text-slate-400">mån</span></p>
                  <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-semibold text-blue-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" aria-hidden="true" />
                    Trygg buffert
                  </div>
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ── Metrics band — editorial, hairline-divided ───────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-8 pb-4">
        <FadeIn>
          <div className="glass rounded-2xl overflow-hidden">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-200/45">
              {[
                { big: '90', unit: 'dagar', label: 'Kassaflödesprognos' },
                { big: '5', unit: 'min', label: 'Från import till insikt' },
                { big: '1', unit: 'klick', label: 'Export till revisorn' },
                { big: '0', unit: 'kr', label: 'Under hela betan' },
              ].map((s) => (
                <div key={s.label} className="bg-white/55 backdrop-blur px-5 py-6 sm:px-6 sm:py-7">
                  <p className="text-3xl sm:text-4xl font-extrabold text-slate-900 tabular-nums tracking-tight leading-none">
                    {s.big}<span className="text-lg font-bold text-slate-400 ml-1">{s.unit}</span>
                  </p>
                  <p className="mt-2 text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </FadeIn>
      </section>

      {/* ── Features — bento with real hierarchy ─────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-8 py-20 sm:py-28">
        <FadeIn className="max-w-xl mb-12">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600 mb-3">Allt på ett ställe</p>
          <h2 className="text-3xl sm:text-[2.75rem] sm:leading-[1.08] font-extrabold text-slate-900 tracking-tight text-balance">
            Ett system. Hela ekonomin.
          </h2>
          <p className="mt-4 text-slate-500 leading-relaxed">
            Sex verktyg som pratar med varandra — och en AI som förklarar vad siffrorna faktiskt betyder.
          </p>
        </FadeIn>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">

          {/* Focal cell — AI coach (spans 2) */}
          <FadeIn className="lg:col-span-2">
            <div className="group relative h-full glass rounded-3xl p-7 sm:p-8 overflow-hidden hover:-translate-y-1 hover:shadow-xl transition-all duration-500">
              <div className="absolute -top-10 -right-10 w-48 h-48 bg-gradient-to-br from-blue-400/15 to-indigo-400/10 rounded-full blur-2xl pointer-events-none" aria-hidden="true" />
              <div className="relative flex flex-col sm:flex-row sm:items-start gap-6">
                <div className="flex-1 min-w-0">
                  <div className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-500/25 mb-5">
                    <Brain className="w-5 h-5 text-white" aria-hidden="true" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 tracking-tight">Din AI-ekonomicoach</h3>
                  <p className="mt-2 text-slate-500 leading-relaxed max-w-sm">
                    Ställ en fråga i klarspråk. Få svar grundade i din faktiska data — med konkreta åtgärder, inte floskler.
                  </p>
                </div>

                {/* mini insight stack */}
                <div className="sm:w-56 shrink-0 flex flex-col gap-2.5">
                  {[
                    { t: 'Sänk kostnaderna 8%', s: 'Tre abonnemang överlappar' },
                    { t: 'Påminn 4 kunder', s: 'Förfallet: 62 400 kr' },
                  ].map((m) => (
                    <div key={m.t} className="flex items-start gap-2.5 rounded-xl bg-white/60 border border-white/70 px-3.5 py-3 shadow-sm">
                      <Sparkles className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-slate-800 leading-tight">{m.t}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{m.s}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </FadeIn>

          {/* Kassaflöde — with sparkline */}
          <FadeIn delay={80}>
            <div className="group h-full glass rounded-3xl p-7 flex flex-col hover:-translate-y-1 hover:shadow-xl transition-all duration-500">
              <div className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-blue-50 border border-blue-100 mb-5">
                <BarChart2 className="w-5 h-5 text-blue-600" aria-hidden="true" />
              </div>
              <h3 className="font-bold text-slate-900 tracking-tight">Kassaflödesanalys</h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">In- och utflöden per kategori, period och kund.</p>
              <Sparkline series={[30, 45, 38, 55, 48, 66, 60]} className="mt-auto pt-5 w-full h-9 text-blue-600" />
            </div>
          </FadeIn>

          {/* Budget — with bar */}
          <FadeIn delay={120}>
            <div className="group h-full glass rounded-3xl p-7 flex flex-col hover:-translate-y-1 hover:shadow-xl transition-all duration-500">
              <div className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-orange-50 border border-orange-100 mb-5">
                <Target className="w-5 h-5 text-orange-600" aria-hidden="true" />
              </div>
              <h3 className="font-bold text-slate-900 tracking-tight">Budgetuppföljning</h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">Sätt mål per kategori, följ utfall mot plan i realtid.</p>
              <div className="mt-auto pt-5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 mb-1.5">
                  <span>Utfall</span><span className="tabular-nums text-slate-600">92%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-green-500" style={{ width: '92%' }} />
                </div>
              </div>
            </div>
          </FadeIn>

          {/* Simulering */}
          <FadeIn delay={80}>
            <div className="group h-full glass rounded-3xl p-7 hover:-translate-y-1 hover:shadow-xl transition-all duration-500">
              <div className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-100 mb-5">
                <TrendingUp className="w-5 h-5 text-indigo-600" aria-hidden="true" />
              </div>
              <h3 className="font-bold text-slate-900 tracking-tight">Scenariosimulering</h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">Testa beslut innan du fattar dem — se utfallet direkt.</p>
            </div>
          </FadeIn>

          {/* Kundanalys */}
          <FadeIn delay={120}>
            <div className="group h-full glass rounded-3xl p-7 hover:-translate-y-1 hover:shadow-xl transition-all duration-500">
              <div className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-cyan-50 border border-cyan-100 mb-5">
                <Users className="w-5 h-5 text-cyan-600" aria-hidden="true" />
              </div>
              <h3 className="font-bold text-slate-900 tracking-tight">Kundanalys</h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">Se vilka kunder som driver lönsamheten — och vilka som kostar.</p>
            </div>
          </FadeIn>

          {/* Export — wide slim */}
          <FadeIn delay={160} className="lg:col-span-3">
            <div className="group glass rounded-3xl p-7 flex flex-col sm:flex-row sm:items-center gap-5 hover:-translate-y-1 hover:shadow-xl transition-all duration-500">
              <div className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-slate-100 border border-slate-200/70 shrink-0">
                <FileText className="w-5 h-5 text-slate-600" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-900 tracking-tight">Export & rapporter</h3>
                <p className="mt-1 text-sm text-slate-500 leading-relaxed">Exportera till CSV och dela snygga rapporter med revisorn — på ett klick.</p>
              </div>
              <Link
                to={loggedIn ? '/dashboard' : '/register'}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:gap-2.5 transition-all shrink-0"
              >
                Prova det <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── Closing — editorial, not another gradient box ────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-8 pb-24">
        <FadeIn>
          <div className="relative glass rounded-[2rem] overflow-hidden px-6 py-14 sm:px-16 sm:py-20">
            {/* faint instrument echo */}
            <Sparkline
              series={HERO_SERIES}
              className="absolute inset-x-0 bottom-0 w-full h-40 text-blue-500/10"
            />
            <div className="relative max-w-xl">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600 mb-4">Kom igång idag</p>
              <h2 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-[1.06] text-balance">
                Redo att se klart?
              </h2>
              <p className="mt-5 text-lg text-slate-500 leading-relaxed">
                Skapa ett konto på sekunder, koppla din data och få den första AI-analysen samma dag.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-3">
                {loggedIn ? (
                  <Link
                    to="/dashboard"
                    className="group inline-flex items-center justify-center gap-2 bg-primary text-white font-bold text-base px-8 py-4 rounded-xl shadow-lg shadow-blue-900/15 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all min-h-[52px]"
                  >
                    Gå till dashboard
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
                  </Link>
                ) : (
                  <>
                    <Link
                      to="/register"
                      className="group inline-flex items-center justify-center gap-2 bg-primary text-white font-bold text-base px-8 py-4 rounded-xl shadow-lg shadow-blue-900/15 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all min-h-[52px]"
                    >
                      Skapa gratis konto
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
                    </Link>
                    <span className="inline-flex items-center gap-2 text-sm text-slate-500">
                      <Clock className="w-4 h-4 text-blue-600/80" aria-hidden="true" />
                      Ingen betalningsinformation krävs
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </FadeIn>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="border-t border-white/50 bg-white/40 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-9 flex flex-col sm:flex-row items-center justify-between gap-5">
          <div className="flex items-center gap-2.5">
            <RWLogo className="h-7 w-auto" />
            <span className="font-bold text-slate-800 tracking-tight text-sm">RW Systems</span>
          </div>
          <a
            href="mailto:rhodinwallensystems@gmail.com"
            className="text-sm text-slate-500 hover:text-primary transition-colors"
          >
            rhodinwallensystems@gmail.com
          </a>
          <p className="text-xs text-slate-400">© 2026 RW Systems. Alla rättigheter förbehållna.</p>
        </div>
      </footer>
    </div>
  )
}
