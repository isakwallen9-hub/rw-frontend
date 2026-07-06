import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearUserImportHistory } from '../utils/jwtUser'
import { useUser } from '../contexts/UserContext'
import { Sparkles } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL as string

export default function Navbar() {
  const navigate = useNavigate()
  const { isAdmin } = useUser()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleLogout = async () => {
    clearUserImportHistory()
    localStorage.removeItem('accessToken')
    localStorage.removeItem('rw_coach_history')
    try {
      await fetch(`${API_URL}api/v1/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      })
    } catch {
      // best-effort
    }
    navigate('/login')
  }

  return (
    <nav className="bg-white/60 backdrop-blur-xl border-b border-white/40 px-6 py-5 sticky top-0 z-30 shadow-sm">
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
          <button onClick={() => navigate('/insights')} className="hover:text-primary transition-colors flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            Insikter
          </button>
          <button onClick={() => navigate('/analytics')} className="hover:text-primary transition-colors">Analys</button>
          <button onClick={() => navigate('/simulate')} className="hover:text-primary transition-colors">Simulera</button>
          <button data-tour="import-link" onClick={() => navigate('/import')} className="hover:text-primary transition-colors">Importera</button>
          <button onClick={() => navigate('/budget')} className="hover:text-primary transition-colors">Budget</button>
          <button onClick={() => navigate('/customers')} className="hover:text-primary transition-colors">Kunder</button>
          <button onClick={() => navigate('/actions')} className="hover:text-primary transition-colors">Åtgärder</button>
          <button onClick={() => navigate('/diagnosis')} className="hover:text-primary transition-colors">Diagnos</button>
          <button onClick={() => navigate('/profile')} className="hover:text-primary transition-colors">Profil</button>
          {isAdmin && (
            <button onClick={() => navigate('/admin')} className="text-purple-600 hover:text-purple-700 font-semibold transition-colors">Admin</button>
          )}
          <button onClick={handleLogout} className="text-red-500 hover:text-red-600 transition-colors">Logga ut</button>
        </div>

        {/* Hamburger */}
        <button
          className="md:hidden p-2 rounded-lg text-gray-500 hover:bg-white/60 transition-colors"
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
        <div className="md:hidden border-t border-white/40 mt-3 pt-3 flex flex-col gap-1 px-2">
          <button
            onClick={() => { navigate('/dashboard'); setMenuOpen(false) }}
            className="text-left px-4 py-3 text-sm text-gray-600 hover:bg-white/50 rounded-lg transition-colors"
          >
            Dashboard
          </button>
          <button
            onClick={() => { navigate('/insights'); setMenuOpen(false) }}
            className="text-left px-4 py-3 text-sm text-gray-600 hover:bg-white/50 rounded-lg transition-colors flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-primary" aria-hidden="true" />
            Insikter
          </button>
          <button
            onClick={() => { navigate('/analytics'); setMenuOpen(false) }}
            className="text-left px-4 py-3 text-sm text-gray-600 hover:bg-white/50 rounded-lg transition-colors"
          >
            Analys
          </button>
          <button
            onClick={() => { navigate('/simulate'); setMenuOpen(false) }}
            className="text-left px-4 py-3 text-sm text-gray-600 hover:bg-white/50 rounded-lg transition-colors"
          >
            Simulera
          </button>
          <button
            onClick={() => { navigate('/import'); setMenuOpen(false) }}
            className="text-left px-4 py-3 text-sm text-gray-600 hover:bg-white/50 rounded-lg transition-colors"
          >
            Importera
          </button>
          <button
            onClick={() => { navigate('/budget'); setMenuOpen(false) }}
            className="text-left px-4 py-3 text-sm text-gray-600 hover:bg-white/50 rounded-lg transition-colors"
          >
            Budget
          </button>
          <button
            onClick={() => { navigate('/customers'); setMenuOpen(false) }}
            className="text-left px-4 py-3 text-sm text-gray-600 hover:bg-white/50 rounded-lg transition-colors"
          >
            Kunder
          </button>
          <button
            onClick={() => { navigate('/actions'); setMenuOpen(false) }}
            className="text-left px-4 py-3 text-sm text-gray-600 hover:bg-white/50 rounded-lg transition-colors"
          >
            Åtgärder
          </button>
          <button
            onClick={() => { navigate('/diagnosis'); setMenuOpen(false) }}
            className="text-left px-4 py-3 text-sm text-gray-600 hover:bg-white/50 rounded-lg transition-colors"
          >
            Diagnos
          </button>
          <button
            onClick={() => { navigate('/profile'); setMenuOpen(false) }}
            className="text-left px-4 py-3 text-sm text-gray-600 hover:bg-white/50 rounded-lg transition-colors"
          >
            Profil
          </button>
          {isAdmin && (
            <button
              onClick={() => { navigate('/admin'); setMenuOpen(false) }}
              className="text-left px-4 py-3 text-sm text-purple-600 font-semibold hover:bg-purple-50 rounded-lg"
            >
              Admin
            </button>
          )}
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
