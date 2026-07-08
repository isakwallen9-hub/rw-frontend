import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { CurrencyProvider } from './contexts/CurrencyContext'
import { UserProvider } from './contexts/UserContext'
import ErrorBoundary from './components/ErrorBoundary'
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

export default function App() {
  return (
    <>
    {/* ── Global animated background — makes glassmorphism visible on all pages ── */}
    <div className="fixed inset-0 -z-10 bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100" aria-hidden="true">
      <div className="absolute top-[-15%] left-[10%] w-[600px] h-[600px] bg-blue-300/30 rounded-full blur-[130px] animate-pulse" style={{animationDuration:'8s'}} />
      <div className="absolute bottom-[5%] right-[5%] w-[500px] h-[500px] bg-indigo-300/25 rounded-full blur-[120px] animate-pulse" style={{animationDuration:'10s'}} />
      <div className="absolute top-[35%] left-[55%] w-[400px] h-[400px] bg-cyan-200/30 rounded-full blur-[100px] animate-pulse" style={{animationDuration:'12s'}} />
    </div>
    <ErrorBoundary>
    <UserProvider>
    <CurrencyProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/cashflow" element={<PrivateRoute><Cashflow /></PrivateRoute>} />
        <Route path="/invoices" element={<PrivateRoute><Invoices /></PrivateRoute>} />
        <Route path="/runway" element={<PrivateRoute><Runway /></PrivateRoute>} />
        <Route path="/breakeven" element={<PrivateRoute><Breakeven /></PrivateRoute>} />
        <Route path="/analytics" element={<PrivateRoute><Analytics /></PrivateRoute>} />
        <Route path="/simulate" element={<PrivateRoute><Simulate /></PrivateRoute>} />
        <Route path="/import" element={<PrivateRoute><Import /></PrivateRoute>} />
        <Route path="/actions" element={<PrivateRoute><Actions /></PrivateRoute>} />
        <Route path="/diagnosis" element={<PrivateRoute><Diagnosis /></PrivateRoute>} />
        <Route path="/budget" element={<PrivateRoute><Budget /></PrivateRoute>} />
        <Route path="/customers" element={<PrivateRoute><Customers /></PrivateRoute>} />
        <Route path="/insights" element={<PrivateRoute><Insights /></PrivateRoute>} />
        <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
        <Route path="/admin" element={<PrivateRoute><Admin /></PrivateRoute>} />
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
