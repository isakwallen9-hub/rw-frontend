import { useNavigate } from 'react-router-dom'

export default function Landing() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-white font-sans antialiased">

      {/* ── Navbar ─────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="font-bold text-xl text-gray-900 tracking-tight select-none cursor-pointer" onClick={() => navigate('/')}>
            RW Systems
          </span>

          <nav className="hidden md:flex items-center gap-8 text-sm text-gray-600 font-medium">
            <a href="#features" className="hover:text-gray-900 transition-colors">Produkt</a>
            <a href="#how"      className="hover:text-gray-900 transition-colors">Så fungerar det</a>
            <a href="#pricing"  className="hover:text-gray-900 transition-colors">Priser</a>
          </nav>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/login')}
              className="text-sm font-medium text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Logga in
            </button>
            <button
              onClick={() => navigate('/register')}
              className="text-sm font-medium bg-[#0f2544] text-white px-4 py-2 rounded-lg hover:bg-[#1a3a6b] transition-all hover:-translate-y-0.5 shadow-sm"
            >
              Testa gratis
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────── */}
      <section className="bg-[#0f2544] relative overflow-hidden">
        {/* Subtle grid overlay */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '48px 48px' }} />
        {/* Gradient fade bottom */}
        <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-[#0a1e38] to-transparent" />

        <div className="relative max-w-6xl mx-auto px-6 py-28 flex flex-col lg:flex-row items-center gap-16">
          {/* Text */}
          <div className="flex-1 text-center lg:text-left">
            <span className="inline-block text-xs font-semibold text-blue-300 uppercase tracking-widest mb-5 border border-blue-400/30 rounded-full px-3 py-1">
              Cashflow Intelligence
            </span>
            <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight mb-6">
              Få kontroll på kassaflödet.<br className="hidden sm:block" />
              Agera innan det är försent.
            </h1>
            <p className="text-blue-200 text-lg leading-relaxed mb-10 max-w-lg mx-auto lg:mx-0">
              RW Systems analyserar din ekonomi i realtid och ger dig konkreta åtgärder — så du vet exakt vad du ska göra härnäst.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <button
                onClick={() => navigate('/register')}
                className="bg-white text-[#0f2544] font-semibold text-sm px-7 py-3 rounded-lg hover:bg-blue-50 transition-all hover:-translate-y-0.5 shadow-md"
              >
                Kom igång gratis
              </button>
              <a
                href="#how"
                className="border border-white/30 text-white font-medium text-sm px-7 py-3 rounded-lg hover:bg-white/10 transition-all hover:-translate-y-0.5"
              >
                Se hur det fungerar
              </a>
            </div>
          </div>

          {/* App mockup */}
          <div className="flex-1 w-full max-w-lg lg:max-w-none">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-1 shadow-2xl backdrop-blur-sm">
              {/* Window chrome */}
              <div className="bg-white/8 rounded-xl overflow-hidden">
                <div className="flex items-center gap-1.5 px-4 py-3 bg-white/5 border-b border-white/10">
                  <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
                  <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
                  <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
                  <span className="ml-3 text-xs text-white/30 font-mono">app.rwsystems.se/dashboard</span>
                </div>
                <div className="p-5 space-y-4">
                  {/* KPI row */}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Likvida medel',    value: '142 500 kr', color: 'text-white' },
                      { label: 'Förfallna fakturor', value: '76 300 kr',  color: 'text-red-400' },
                      { label: 'Break-even',        value: '143 000 kr', color: 'text-white' },
                      { label: 'Runway',            value: '47 dagar',   color: 'text-blue-300' },
                    ].map(k => (
                      <div key={k.label} className="bg-white/5 rounded-lg p-3 border border-white/10">
                        <p className="text-white/40 text-xs mb-1">{k.label}</p>
                        <p className={`text-sm font-bold ${k.color}`}>{k.value}</p>
                      </div>
                    ))}
                  </div>
                  {/* Chart placeholder */}
                  <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                    <p className="text-white/40 text-xs mb-3">Kassaflöde per månad</p>
                    <div className="flex items-end gap-2 h-14">
                      {[65, 45, 80, 55, 90, 70].map((h, i) => (
                        <div key={i} className="flex-1 rounded-sm bg-gradient-to-t from-blue-500/60 to-blue-400/30" style={{ height: `${h}%` }} />
                      ))}
                    </div>
                  </div>
                  {/* Action item */}
                  <div className="bg-white/5 rounded-lg p-3 border border-white/10 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                        <p className="text-white text-xs font-medium">Påminn om förfallna fakturor</p>
                      </div>
                      <p className="text-white/40 text-xs pl-3.5">Estimerat värde: 76 300 kr</p>
                    </div>
                    <span className="text-xs text-blue-300 border border-blue-400/30 rounded px-2 py-1">Hög</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Social proof ───────────────────────────────── */}
      <section className="bg-gray-50 border-y border-gray-100 py-8">
        <div className="max-w-4xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-12">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest whitespace-nowrap">Används av</p>
          <div className="flex flex-wrap items-center justify-center gap-8">
            {['Bergström & Co', 'Lindqvist AB', 'Nordin Group', 'Strand Consulting'].map(name => (
              <span key={name} className="text-sm font-medium text-gray-400">{name}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────── */}
      <section id="features" className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 id="how" className="text-3xl font-bold text-gray-900 mb-4">Allt du behöver. Inget du inte behöver.</h2>
            <p className="text-gray-500 text-base max-w-xl mx-auto">
              Från rådata till konkreta åtgärder på minuter — inte timmar.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon={
                <svg className="w-5 h-5 text-[#0f2544]" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.5l5-5 4 4 5-6 4 3" />
                </svg>
              }
              title="Förstå läget"
              description="Importera bankdata och fakturor. RWS ger dig omedelbart en tydlig bild av din ekonomiska situation."
            />
            <FeatureCard
              icon={
                <svg className="w-5 h-5 text-[#0f2544]" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
                </svg>
              }
              title="Upptäck problemen"
              description="Se vilka kunder som betalar sent, var likviditeten är tight och vilka fakturor som riskerar att bli gamla."
            />
            <FeatureCard
              icon={
                <svg className="w-5 h-5 text-[#0f2544]" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              }
              title="Agera direkt"
              description="Prioriterade, konkreta åtgärder med estimerat värde i kronor. Vet alltid vad som ger mest effekt."
            />
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────── */}
      <section id="pricing" className="bg-[#0f2544] py-24">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Redo att ta kontrollen?</h2>
          <p className="text-blue-200 text-base mb-10 max-w-lg mx-auto">
            Kom igång på fem minuter. Inga långa installationer, ingen bindningstid.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => navigate('/register')}
              className="bg-white text-[#0f2544] font-semibold text-sm px-8 py-3 rounded-lg hover:bg-blue-50 transition-all hover:-translate-y-0.5 shadow-md"
            >
              Skapa gratis konto
            </button>
            <button
              onClick={() => navigate('/login')}
              className="border border-white/30 text-white font-medium text-sm px-8 py-3 rounded-lg hover:bg-white/10 transition-all hover:-translate-y-0.5"
            >
              Logga in
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────── */}
      <footer className="bg-gray-900 py-16">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
            <div className="col-span-2 md:col-span-1">
              <p className="font-bold text-white mb-3">RW Systems</p>
              <p className="text-gray-400 text-sm leading-relaxed">Cashflow intelligence för moderna B2B-företag.</p>
            </div>
            <FooterCol title="Produkt" links={['Dashboard', 'Kassaflöde', 'Rekommendationer', 'AI-guide']} />
            <FooterCol title="Företag"  links={['Om oss', 'Karriär', 'Press']} />
            <FooterCol title="Kontakt"  links={['Integritetspolicy', 'Användarvillkor', 'Support']} />
          </div>
          <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-gray-500">
            <span>© 2026 RW Systems AB. Alla rättigheter förbehållna.</span>
            <span>Byggd i Sverige</span>
          </div>
        </div>
      </footer>

    </div>
  )
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="group p-7 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all">
      <div className="w-10 h-10 rounded-lg bg-[#0f2544]/6 flex items-center justify-center mb-5">
        {icon}
      </div>
      <h3 className="font-semibold text-gray-900 text-base mb-2">{title}</h3>
      <p className="text-gray-500 text-sm leading-relaxed">{description}</p>
    </div>
  )
}

function FooterCol({ title, links }: { title: string; links: string[] }) {
  return (
    <div>
      <p className="font-semibold text-gray-300 text-sm mb-4">{title}</p>
      <ul className="space-y-2.5">
        {links.map(l => (
          <li key={l}><a href="#" className="text-gray-500 text-sm hover:text-gray-300 transition-colors">{l}</a></li>
        ))}
      </ul>
    </div>
  )
}
