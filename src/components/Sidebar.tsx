import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Sparkles, BarChart2, TrendingUp, Activity,
  Upload, Target, Users, Zap, User, Shield, LogOut, Menu, X,
} from 'lucide-react'
import { useUser } from '../contexts/UserContext'
import { clearUserImportHistory } from '../utils/jwtUser'

const API_URL = import.meta.env.VITE_API_URL as string

interface NavItem {
  to: string
  label: string
  icon: React.ElementType
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'ÖVERSIKT',
    items: [
      { to: '/dashboard', label: 'Dashboard',  icon: LayoutDashboard },
      { to: '/insights',  label: 'Insikter',   icon: Sparkles },
    ],
  },
  {
    label: 'ANALYS',
    items: [
      { to: '/analytics', label: 'Analys',   icon: BarChart2  },
      { to: '/simulate',  label: 'Simulera', icon: TrendingUp },
      { to: '/diagnosis', label: 'Diagnos',  icon: Activity   },
    ],
  },
  {
    label: 'HANTERA',
    items: [
      { to: '/import',    label: 'Importera', icon: Upload },
      { to: '/budget',    label: 'Budget',    icon: Target },
      { to: '/customers', label: 'Kunder',    icon: Users  },
      { to: '/actions',   label: 'Åtgärder',  icon: Zap    },
    ],
  },
]

function NavItem({ to, label, icon: Icon, onNav }: NavItem & { onNav?: () => void }) {
  return (
    <NavLink
      to={to}
      onClick={onNav}
      className={({ isActive }) =>
        `relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ease-apple min-h-[44px] ${
          isActive
            ? 'bg-brand-600/[.07] text-brand-700 shadow-[inset_0_0_0_1px_rgba(58,92,216,0.12)]'
            : 'text-ink-500 hover:bg-white/75 hover:text-ink-900 hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.6)]'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-brand-600 rounded-full" />
          )}
          <Icon className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
          {label}
        </>
      )}
    </NavLink>
  )
}

function SidebarContent({ onNav }: { onNav?: () => void }) {
  const navigate = useNavigate()
  const { isAdmin } = useUser()

  const handleLogout = async () => {
    clearUserImportHistory()
    localStorage.removeItem('accessToken')
    try {
      await fetch(`${API_URL}api/v1/auth/logout`, { method: 'POST', credentials: 'include' })
    } catch {}
    onNav?.()
    navigate('/login')
  }

  return (
    <div className="flex flex-col h-full select-none">
      {/* Logo */}
      <div className="px-4 pt-5 pb-3 shrink-0">
        <NavLink to="/dashboard" className="flex items-center gap-2.5 group" onClick={onNav}>
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shrink-0 shadow-[0_2px_10px_rgba(58,92,216,0.45)]">
            <span className="text-white text-[11px] font-black tracking-tight">RW</span>
          </div>
          <span className="font-bold tracking-tight text-ink-900 text-sm group-hover:text-brand-700 transition-colors">
            RW Systems
          </span>
        </NavLink>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-2 pb-4" aria-label="Huvudmeny">
        {NAV_GROUPS.map((g, gi) => (
          <div key={g.label}>
            <p className={`text-[9.5px] font-bold uppercase tracking-[0.12em] text-ink-400 px-3 mb-1.5 ${gi === 0 ? 'mt-4' : 'mt-1 pt-4 border-t border-ink-200/50'}`}>
              {g.label}
            </p>
            {g.items.map(item => (
              <NavItem key={item.to} {...item} onNav={onNav} />
            ))}
          </div>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="px-2 pb-5 shrink-0 border-t border-ink-200/50 pt-3">
        <NavItem to="/profile" label="Profil" icon={User} onNav={onNav} />
        {isAdmin && (
          <NavItem to="/admin" label="Admin" icon={Shield} onNav={onNav} />
        )}
        <button
          onClick={() => void handleLogout()}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-ink-600 hover:bg-negative-50/60 hover:text-negative-700 transition-colors w-full mt-1 min-h-[44px]"
        >
          <LogOut className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
          Logga ut
        </button>
      </div>
    </div>
  )
}

export default function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* ── Desktop sidebar ──────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col fixed inset-y-0 left-0 w-60 z-30 glass-sidebar">
        <SidebarContent />
      </aside>

      {/* ── Mobile hamburger ─────────────────────────────────────────── */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 p-2 rounded-lg bg-white/80 backdrop-blur-xl border border-ink-200/60 shadow-sm"
        aria-label="Öppna meny"
        aria-expanded={mobileOpen}
      >
        <Menu className="w-5 h-5 text-ink-700" aria-hidden="true" />
      </button>

      {/* ── Mobile overlay ───────────────────────────────────────────── */}
      {mobileOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 bg-ink-900/30 backdrop-blur-sm z-40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="lg:hidden fixed inset-y-0 left-0 w-72 bg-white/95 backdrop-blur-2xl border-r border-ink-200/60 z-50 shadow-2xl flex flex-col">
            <div className="absolute top-3.5 right-3.5">
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-lg text-ink-500 hover:bg-ink-100 transition-colors"
                aria-label="Stäng meny"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <SidebarContent onNav={() => setMobileOpen(false)} />
          </aside>
        </>
      )}
    </>
  )
}
