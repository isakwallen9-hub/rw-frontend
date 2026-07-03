import { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import RWLogo from '../assets/RWLogo'
import {
  BarChart2, TrendingUp, Users, Zap, Shield, FileText,
  ArrowRight, Check, ChevronRight, Brain, Target, Clock,
} from 'lucide-react'

function useFadeIn() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('opacity-100', 'translate-y-0')
          el.classList.remove('opacity-0', 'translate-y-8')
          obs.unobserve(el)
        }
      },
      { threshold: 0.12 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return ref
}

function FadeSection({ children, className = '', delay = 0 }: {
  children: React.ReactNode
  className?: string
  delay?: number
}) {
  const ref = useFadeIn()
  return (
    <div
      ref={ref}
      className={`opacity-0 translate-y-8 transition-all duration-700 ease-out ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

const FEATURES = [
  {
    icon: BarChart2,
    title: 'Kassaflödesanalys',
    desc: 'Se exakt vart pengarna tar vägen — in- och utflöden per kategori, period och kund.',
    color: 'text-blue-600',
    bg: 'bg-blue-50/80',
  },
  {
    icon: Brain,
    title: 'AI-driven ekonomicoach',
    desc: 'Få personliga insikter och råd baserade på din faktiska ekonomiska data.',
    color: 'text-purple-600',
    bg: 'bg-purple-50/80',
  },
  {
    icon: TrendingUp,
    title: 'Scenariosimuleringar',
    desc: 'Testa olika affärsscenarier och se konsekvenserna innan du fattar beslut.',
    color: 'text-green-600',
    bg: 'bg-green-50/80',
  },
  {
    icon: Target,
    title: 'Budgetuppföljning',
    desc: 'Sätt budgetar per kategori och följ utfall mot plan i realtid.',
    color: 'text-orange-600',
    bg: 'bg-orange-50/80',
  },
  {
    icon: Users,
    title: 'Kundanalys',
    desc: 'Förstå vilka kunder som bidrar mest till din lönsamhet och tillväxt.',
    color: 'text-cyan-600',
    bg: 'bg-cyan-50/80',
  },
  {
    icon: FileText,
    title: 'Export & rapporter',
    desc: 'Exportera data till CSV, dela rapporter med revisorn — på ett klick.',
    color: 'text-rose-600',
    bg: 'bg-rose-50/80',
  },
]

const STEPS = [
  {
    num: '01',
    icon: FileText,
    title: 'Importera din data',
    desc: 'Ladda upp transaktioner från din bank eller bokföring — vi hanterar formateringen.',
  },
  {
    num: '02',
    icon: BarChart2,
    title: 'Analysera direkt',
    desc: 'Se grafer, trender och nyckeltal på sekunder. Inget kalkylark behövs.',
  },
  {
    num: '03',
    icon: Zap,
    title: 'Fatta bättre beslut',
    desc: 'Agera på data istället för magkänsla. Din AI-coach hjälper dig hela vägen.',
  },
]

const COMPARE_ROWS = [
  { label: 'Kassaflöde i realtid', us: true, them: false },
  { label: 'AI-ekonomicoach', us: true, them: false },
  { label: 'Scenariosimuleringar', us: true, them: false },
  { label: 'Kräver bokföringsprogram', us: false, them: true },
  { label: 'Komplicerad setup', us: false, them: true },
  { label: 'Gratis under beta', us: true, them: false },
]

export default function Landing() {
  const navigate = useNavigate()

  useEffect(() => {
    const token = localStorage.getItem('accessToken')
    if (token && token !== 'undefined' && token !== 'null') {
      navigate('/dashboard', { replace: true })
    }
  }, [navigate])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100 font-sans overflow-x-hidden">

      {/* Navbar */}
      <nav className="sticky top-0 z-30 bg-white/60 backdrop-blur-xl border-b border-white/40 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <RWLogo className="h-8 w-auto" />
            <span className="font-bold text-gray-900 tracking-tight text-sm hidden sm:block">RW Systems</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm font-semibold text-gray-600 hover:text-primary transition-colors px-3 py-2 rounded-lg hover:bg-white/60"
            >
              Logga in
            </Link>
            <Link
              to="/register"
              className="text-sm font-semibold text-white bg-primary px-4 py-2 rounded-lg shadow-md shadow-blue-500/20 hover:opacity-90 active:scale-[0.98] transition-all min-h-[44px] flex items-center"
            >
              Kom igång gratis
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-8 pt-20 pb-24 sm:pt-28 sm:pb-32 text-center">
        <FadeSection>
          <div className="inline-flex items-center gap-2 bg-blue-50/80 backdrop-blur border border-blue-100 text-blue-700 text-xs font-semibold px-4 py-2 rounded-full mb-8 shadow-sm">
            <Zap className="w-3.5 h-3.5" aria-hidden="true" />
            Gratis under beta — ingen kreditkortsinformation krävs
          </div>
        </FadeSection>

        <FadeSection delay={80}>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 tracking-tight leading-tight max-w-3xl mx-auto">
            Full koll på ekonomin —{' '}
            <span className="text-primary">utan att lägga en enda timme</span>{' '}
            på det.
          </h1>
        </FadeSection>

        <FadeSection delay={160}>
          <p className="mt-6 text-lg sm:text-xl text-gray-500 max-w-xl mx-auto leading-relaxed">
            RW Systems är affärssystemet som ger dig kassaflödesanalys, AI-råd och budgetuppföljning — utan att du behöver vara ekonom.
          </p>
        </FadeSection>

        <FadeSection delay={240}>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/register"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-primary text-white font-bold text-base px-8 py-4 rounded-xl shadow-md shadow-blue-500/20 hover:opacity-90 active:scale-[0.98] transition-all min-h-[52px]"
            >
              Kom igång gratis
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
            <Link
              to="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white/60 backdrop-blur border border-white/50 text-gray-700 font-semibold text-base px-8 py-4 rounded-xl shadow-sm hover:bg-white/80 active:scale-[0.98] transition-all min-h-[52px]"
            >
              Logga in
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>
        </FadeSection>

        {/* Dashboard preview card */}
        <FadeSection delay={340} className="mt-16">
          <div className="relative mx-auto max-w-3xl bg-white/70 backdrop-blur-xl border border-white/50 rounded-2xl shadow-xl p-6 sm:p-8">
            <div className="grid grid-cols-3 gap-4 mb-4">
              {[
                { label: 'Kassaflöde', value: '+124 500 kr', color: 'text-green-600' },
                { label: 'Kostnader', value: '87 200 kr', color: 'text-red-500' },
                { label: 'Runway', value: '8,4 mån', color: 'text-blue-600' },
              ].map((kpi) => (
                <div key={kpi.label} className="flex flex-col gap-1 bg-white/50 rounded-xl p-3 sm:p-4 border border-white/60 shadow-sm">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{kpi.label}</span>
                  <span className={`text-base sm:text-2xl font-bold tabular-nums tracking-tight ${kpi.color}`}>{kpi.value}</span>
                </div>
              ))}
            </div>
            <div className="h-24 sm:h-32 bg-gradient-to-r from-blue-50 via-blue-100/60 to-blue-50 rounded-xl border border-blue-100/60 flex items-end justify-center pb-3 gap-1.5 px-4">
              {[40, 65, 45, 80, 55, 90, 70, 95, 60, 85, 50, 75].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm bg-gradient-to-t from-primary to-blue-400/60 opacity-70"
                  style={{ height: `${h}%` }}
                  aria-hidden="true"
                />
              ))}
            </div>
          </div>
        </FadeSection>
      </section>

      {/* Så fungerar det */}
      <section className="max-w-6xl mx-auto px-4 sm:px-8 py-20 sm:py-24">
        <FadeSection className="text-center mb-14">
          <p className="text-xs font-bold uppercase tracking-widest text-primary mb-3">Enkelt som tre steg</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">Så fungerar det</h2>
        </FadeSection>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {STEPS.map((step, i) => (
            <FadeSection key={step.num} delay={i * 100}>
              <div className="relative bg-white/70 backdrop-blur-xl border border-white/50 rounded-2xl p-6 shadow-sm hover:shadow-md hover:bg-white/80 transition-all h-full">
                <div className="flex items-start gap-4">
                  <span className="text-5xl font-extrabold text-blue-100 tabular-nums select-none leading-none">{step.num}</span>
                  <div className="mt-1">
                    <step.icon className="w-6 h-6 text-primary mb-3" aria-hidden="true" />
                    <h3 className="font-bold text-gray-900 text-base mb-2 tracking-tight">{step.title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
                {i < STEPS.length - 1 && (
                  <ArrowRight
                    className="hidden sm:block absolute -right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300 z-10"
                    aria-hidden="true"
                  />
                )}
              </div>
            </FadeSection>
          ))}
        </div>
      </section>

      {/* Funktioner */}
      <section className="max-w-6xl mx-auto px-4 sm:px-8 py-20 sm:py-24">
        <FadeSection className="text-center mb-14">
          <p className="text-xs font-bold uppercase tracking-widest text-primary mb-3">Allt på ett ställe</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">Kraftfulla funktioner</h2>
          <p className="mt-4 text-gray-500 max-w-lg mx-auto">Byggt för dig som vill förstå din ekonomi — inte bara bokföra den.</p>
        </FadeSection>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((feat, i) => (
            <FadeSection key={feat.title} delay={i * 60}>
              <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-2xl p-6 shadow-sm hover:shadow-md hover:bg-white/80 active:scale-[0.98] transition-all h-full">
                <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${feat.bg} mb-4`}>
                  <feat.icon className={`w-5 h-5 ${feat.color}`} aria-hidden="true" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2 tracking-tight">{feat.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{feat.desc}</p>
              </div>
            </FadeSection>
          ))}
        </div>
      </section>

      {/* Varför RW Systems */}
      <section className="max-w-6xl mx-auto px-4 sm:px-8 py-20 sm:py-24">
        <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-3xl shadow-sm p-8 sm:p-12">
          <FadeSection className="text-center mb-10">
            <p className="text-xs font-bold uppercase tracking-widest text-primary mb-3">Jämförelse</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">Varför RW Systems?</h2>
            <p className="mt-4 text-gray-500 max-w-md mx-auto">Traditionella verktyg kräver bokföringserfarenhet. Vi gör det enkelt för alla.</p>
          </FadeSection>

          <FadeSection delay={100}>
            <div className="max-w-lg mx-auto">
              <div className="grid grid-cols-3 text-center text-xs font-bold uppercase tracking-wider text-gray-400 mb-4 px-2">
                <span />
                <span className="text-primary">RW Systems</span>
                <span>Övriga</span>
              </div>
              <div className="flex flex-col gap-2">
                {COMPARE_ROWS.map((row) => (
                  <div key={row.label} className="grid grid-cols-3 items-center bg-white/50 rounded-xl px-4 py-3 border border-white/60">
                    <span className="text-sm font-medium text-gray-700">{row.label}</span>
                    <span className="flex justify-center">
                      {row.us ? (
                        <Check className="w-5 h-5 text-green-500" aria-label="Ja" />
                      ) : (
                        <span className="text-gray-300 font-bold text-lg leading-none" aria-label="Nej">—</span>
                      )}
                    </span>
                    <span className="flex justify-center">
                      {row.them ? (
                        <Check className="w-5 h-5 text-gray-400" aria-label="Ja" />
                      ) : (
                        <span className="text-gray-300 font-bold text-lg leading-none" aria-label="Nej">—</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </FadeSection>

          <FadeSection delay={200} className="mt-10 flex flex-col sm:flex-row gap-6 justify-center items-center">
            {[
              { icon: Shield, text: 'Säker datalagring i Sverige' },
              { icon: Clock, text: 'Setup på under 5 minuter' },
              { icon: Zap, text: 'Inget kreditkort krävs' },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-2 text-sm font-medium text-gray-600">
                <item.icon className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                {item.text}
              </div>
            ))}
          </FadeSection>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-4 sm:px-8 py-20 sm:py-24">
        <FadeSection>
          <div className="relative bg-gradient-to-br from-primary to-blue-700 rounded-3xl p-10 sm:p-16 text-center overflow-hidden shadow-xl shadow-blue-500/20">
            <div className="absolute -top-16 -right-16 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" aria-hidden="true" />
            <div className="absolute -bottom-16 -left-16 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" aria-hidden="true" />

            <p className="text-xs font-bold uppercase tracking-widest text-blue-200 mb-4">Kom igång idag</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-4">
              Redo att få tillbaka din tid?
            </h2>
            <p className="text-blue-100 text-base max-w-md mx-auto mb-8 leading-relaxed">
              Sluta gissa — börja veta. Skapa ett konto på sekunder och koppla din ekonomidata direkt.
            </p>
            <Link
              to="/register"
              className="inline-flex items-center gap-2 bg-white text-primary font-bold text-base px-8 py-4 rounded-xl shadow-lg hover:opacity-95 active:scale-[0.98] transition-all min-h-[52px]"
            >
              Skapa gratis konto
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
            <p className="mt-4 text-sm text-blue-200">Gratis under beta — ingen betalningsinformation krävs.</p>
          </div>
        </FadeSection>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/40 bg-white/40 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <RWLogo className="h-8 w-auto" />
            <span className="font-bold text-gray-800 tracking-tight">RW Systems</span>
          </div>
          <a
            href="mailto:rhodinwallensystems@gmail.com"
            className="text-sm text-gray-500 hover:text-primary transition-colors"
          >
            rhodinwallensystems@gmail.com
          </a>
          <p className="text-xs text-gray-400">© 2026 RW Systems. Alla rättigheter förbehållna.</p>
        </div>
      </footer>
    </div>
  )
}
