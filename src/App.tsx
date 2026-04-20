import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('accessToken')
  if (!token || token === 'undefined' || token === 'null') {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

export default function App() {
  return (
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
        <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
