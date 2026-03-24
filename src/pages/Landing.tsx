import { useNavigate } from 'react-router-dom'

export default function Landing() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* Navbar */}
      <nav className="border-b border-gray-100 px-8 py-4 flex items-center justify-between max-w-7xl mx-auto">
        <span className="text-primary font-bold text-xl tracking-tight">RW Systems</span>
        <div className="hidden md:flex items-center gap-8 text-sm text-gray-600">
          <a href="#features" className="hover:text-primary transition-colors">Produkt</a>
          <a href="#how" className="hover:text-primary transition-colors">Så fungerar det</a>
          <a href="#business" className="hover:text-primary transition-colors">För företag</a>
          <a href="#pricing" className="hover:text-primary transition-colors">Priser</a>
        </div>
        <button
          onClick={() => navigate('/login')}
          className="text-sm font-medium text-primary border border-primary rounded-lg px-4 py-2 hover:bg-primary hover:text-white transition-colors"
        >
          Logga in
        </button>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-8 py-24 text-center">
        <h1 className="text-5xl font-bold text-primary leading-tight mb-6">
          Få kontroll på företagets ekonomi och tydliga åtgärder för bättre kassaflöde
        </h1>
        <p className="text-gray-500 text-lg mb-10 max-w-2xl mx-auto">
          RW Systems analyserar din ekonomi i realtid och ger dig konkreta åtgärder — så du vet exakt vad du ska göra härnäst.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => navigate('/onboarding')}
            className="bg-primary text-white font-semibold px-8 py-3 rounded-lg hover:opacity-90 transition-opacity"
          >
            Testa gratis
          </button>
          <a
            href="#how"
            className="border border-gray-300 text-gray-700 font-semibold px-8 py-3 rounded-lg hover:border-primary hover:text-primary transition-colors"
          >
            Se hur det fungerar
          </a>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-gray-50 py-20">
        <div className="max-w-5xl mx-auto px-8">
          <h2 id="how" className="text-2xl font-bold text-primary text-center mb-12">Så fungerar det</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <FeatureCard
              icon="📊"
              title="Förstå läget"
              description="Importera bankdata och fakturor. RWS ger dig en omedelbar bild av din ekonomiska situation."
            />
            <FeatureCard
              icon="🔍"
              title="Upptäck problemen"
              description="Se vilka kunder som betalar sent, vilka fakturor som riskerar att bli gamla och var pengarna försvinner."
            />
            <FeatureCard
              icon="⚡"
              title="Agera direkt"
              description="Få prioriterade, konkreta åtgärder med estimerat värde i kronor — och följ upp resultatet."
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8 px-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-gray-400">
          <span>© 2026 RW Systems</span>
          <div className="flex gap-6">
            <a href="#" className="hover:text-gray-600 transition-colors">Integritet</a>
            <a href="#" className="hover:text-gray-600 transition-colors">Villkor</a>
            <a href="#" className="hover:text-gray-600 transition-colors">Kontakt</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
      <div className="text-3xl mb-4">{icon}</div>
      <h3 className="font-semibold text-primary text-lg mb-2">{title}</h3>
      <p className="text-gray-500 text-sm leading-relaxed">{description}</p>
    </div>
  )
}
