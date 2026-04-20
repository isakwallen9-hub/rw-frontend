import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Navbar() {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleLogout = () => {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    navigate('/login')
  }

  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-5 shadow-sm">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <span
          onClick={() => navigate('/dashboard')}
          className="font-bold text-xl text-primary cursor-pointer tracking-tight"
        >
          RW Systems
        </span>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-6 text-sm text-gray-500">
          <button onClick={() => navigate('/dashboard')} className="hover:text-primary transition-colors">Dashboard</button>
          <button onClick={() => navigate('/analytics')} className="hover:text-primary transition-colors">Analys</button>
          <button onClick={() => navigate('/simulate')} className="hover:text-primary transition-colors">Simulera</button>
          <button onClick={() => navigate('/import')} className="hover:text-primary transition-colors">Importera</button>
          <button onClick={() => navigate('/profile')} className="hover:text-primary transition-colors">Profil</button>
          <button onClick={handleLogout} className="text-red-500 hover:text-red-600 transition-colors">Logga ut</button>
        </div>

        {/* Hamburger */}
        <button
          className="md:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Meny"
        >
          {menuOpen ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-100 mt-3 pt-3 flex flex-col gap-1 px-2">
          <button
            onClick={() => { navigate('/dashboard'); setMenuOpen(false) }}
            className="text-left px-4 py-3 text-sm text-gray-600 hover:bg-gray-50 rounded-lg"
          >
            Dashboard
          </button>
          <button
            onClick={() => { navigate('/analytics'); setMenuOpen(false) }}
            className="text-left px-4 py-3 text-sm text-gray-600 hover:bg-gray-50 rounded-lg"
          >
            Analys
          </button>
          <button
            onClick={() => { navigate('/simulate'); setMenuOpen(false) }}
            className="text-left px-4 py-3 text-sm text-gray-600 hover:bg-gray-50 rounded-lg"
          >
            Simulera
          </button>
          <button
            onClick={() => { navigate('/import'); setMenuOpen(false) }}
            className="text-left px-4 py-3 text-sm text-gray-600 hover:bg-gray-50 rounded-lg"
          >
            Importera
          </button>
          <button
            onClick={() => { navigate('/profile'); setMenuOpen(false) }}
            className="text-left px-4 py-3 text-sm text-gray-600 hover:bg-gray-50 rounded-lg"
          >
            Profil
          </button>
          <button
            onClick={handleLogout}
            className="text-left px-4 py-3 text-sm text-red-500 hover:bg-red-50 rounded-lg"
          >
            Logga ut
          </button>
        </div>
      )}
    </nav>
  )
}
