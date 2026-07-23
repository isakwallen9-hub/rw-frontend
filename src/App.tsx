import { BrowserRouter, Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom'
import { CurrencyProvider } from './contexts/CurrencyContext'
import { UserProvider } from './contexts/UserContext'
import ErrorBoundary from './components/ErrorBoundary'
import Sidebar from './components/Sidebar'
import AiAssistant from './components/AiAssistant'
import Admin from './pages/Admin'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import Onboarding from './pages/Onboarding'
import Profile from './pages/Profile'
import Dashboard from './Dashboard'
import Cashflow from './pages/Cashflow'
import Invoices from './pages/Invoices'
import Runway from './pages/Runway'
import Breakeven from './pages/Breakeven'
import Analytics from './pages/Analytics'
import Simulate from './pages/Simulate'
import Import from './pages/Import'
import Diagnosis from './pages/Diagnosis'
import Actions from './pages/Actions'
import Budget from './pages/Budget'
import Customers from './pages/Customers'
import Insights from './pages/Insights'

const SKIP_AI = ['/', '/login', '/register', '/onboarding']

function AiAssistantGate() {
  const location = useLocation()
  const token = localStorage.getItem('accessToken')
  if (!token || token === 'undefined' || token === 'null') return null
  if (SKIP_AI.includes(location.pathname)) return null
  return <AiAssistant />
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('accessToken')
  if (!token || token === 'undefined' || token === 'null') {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

function SidebarLayout() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:ml-60 min-w-0">
        <Outlet />
      </main>
    </div>
  )
}

export default function App() {
  return (
    <>
      {/* ── Global animated background ──────────────────────────────── */}
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50/30" aria-hidden="true">
        <div className="absolute top-[-12%] left-[8%] w-[680px] h-[680px] bg-blue-100/60 rounded-full blur-[150px] animate-orb-1" />
        <div className="absolute bottom-[2%] right-[4%] w-[540px] h-[540px] bg-slate-200/50 rounded-full blur-[140px] animate-orb-2" />
        <div className="absolute top-[30%] left-[52%] w-[440px] h-[440px] bg-indigo-100/40 rounded-full blur-[130px] animate-orb-3" />
        <div className="absolute top-[58%] left-[15%] w-[300px] h-[300px] bg-sky-100/30 rounded-full blur-[110px] animate-orb-4" />
        {/* Edge vignette — brightens center, grounds edges */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 90% 80% at 62% 40%, transparent 35%, rgba(15,23,42,0.04) 100%)' }} />
      </div>

      <ErrorBoundary>
        <UserProvider>
          <CurrencyProvider>
            <BrowserRouter>
              <Routes>
                {/* ── Public routes — full width, no sidebar ─────────── */}
                <Route path="/"           element={<Landing />} />
                <Route path="/login"      element={<Login />} />
                <Route path="/register"   element={<Register />} />
                <Route path="/onboarding" element={<Onboarding />} />

                {/* ── Sidebar layout routes ──────────────────────────── */}
                <Route element={<SidebarLayout />}>
                  <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
                  <Route path="/cashflow"  element={<PrivateRoute><Cashflow /></PrivateRoute>} />
                  <Route path="/invoices"  element={<PrivateRoute><Invoices /></PrivateRoute>} />
                  <Route path="/runway"    element={<PrivateRoute><Runway /></PrivateRoute>} />
                  <Route path="/breakeven" element={<PrivateRoute><Breakeven /></PrivateRoute>} />
                  <Route path="/analytics" element={<PrivateRoute><Analytics /></PrivateRoute>} />
                  <Route path="/simulate"  element={<PrivateRoute><Simulate /></PrivateRoute>} />
                  <Route path="/import"    element={<PrivateRoute><Import /></PrivateRoute>} />
                  <Route path="/actions"   element={<PrivateRoute><Actions /></PrivateRoute>} />
                  <Route path="/diagnosis" element={<PrivateRoute><Diagnosis /></PrivateRoute>} />
                  <Route path="/budget"    element={<PrivateRoute><Budget /></PrivateRoute>} />
                  <Route path="/customers" element={<PrivateRoute><Customers /></PrivateRoute>} />
                  <Route path="/insights"  element={<PrivateRoute><Insights /></PrivateRoute>} />
                  <Route path="/profile"   element={<PrivateRoute><Profile /></PrivateRoute>} />
                  <Route path="/admin"     element={<PrivateRoute><Admin /></PrivateRoute>} />
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              <AiAssistantGate />
            </BrowserRouter>
          </CurrencyProvider>
        </UserProvider>
      </ErrorBoundary>
    </>
  )
}
