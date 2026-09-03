import type { ReactNode } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import { BottomNav } from './components/organisms/BottomNav'
import Onboarding from './pages/Onboarding'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import DeliveryLog from './pages/DeliveryLog'
import Billing from './pages/Billing'
import Manage from './pages/Manage'
import Customers from './pages/Customers'
import CustomerAttendance from './pages/CustomerAttendance'
import Products from './pages/Products'
import DeliveryBoys from './pages/DeliveryBoys'
import Settings from './pages/Settings'
import Profile from './pages/Profile'
import Analytics from './pages/Analytics'
import TodayStatus from './pages/TodayStatus'
import type { Role } from './types'

// HashRouter is used deliberately: GitHub Pages serves static files with no
// server-side rewrite rules, so BrowserRouter routes would 404 on refresh.

function Toast() {
  const { toast } = useApp()
  if (!toast) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-4">
      <div className="rounded-full bg-ink-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">{toast}</div>
    </div>
  )
}

function NotConfigured() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <h1 className="mb-2 font-display text-xl font-bold text-ink-900">Supabase isn't configured yet</h1>
      <p className="max-w-sm text-sm text-ink-600">
        This app needs a Supabase project to store data. Copy <code className="font-mono">.env.example</code> to{' '}
        <code className="font-mono">.env</code>, fill in your project URL and anon key, run{' '}
        <code className="font-mono">supabase/schema.sql</code>, and deploy the{' '}
        <code className="font-mono">manage-delivery-boy</code> Edge Function. See the README for the full setup.
      </p>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-crate-100 border-t-crate-500" />
    </div>
  )
}

function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { currentUser } = useApp()
  if (!currentUser) return <Navigate to="/login" replace />
  if (roles && !roles.includes(currentUser.role)) {
    return <Navigate to={currentUser.role === 'vendor' ? '/' : '/delivery-log'} replace />
  }
  return <>{children}</>
}

function Shell() {
  const { configured, authStatus } = useApp()

  if (!configured) return <NotConfigured />
  if (authStatus === 'loading') return <LoadingScreen />

  if (authStatus === 'needs-profile') {
    return (
      <div className="mx-auto min-h-screen max-w-md bg-cream-50 font-body">
        <Onboarding />
      </div>
    )
  }

  if (authStatus === 'signed-out') {
    return (
      <div className="mx-auto min-h-screen max-w-md bg-cream-50 font-body">
        <Routes>
          <Route path="/signup" element={<Onboarding />} />
          <Route path="*" element={<Login />} />
        </Routes>
      </div>
    )
  }

  return (
    <div className="mx-auto min-h-screen max-w-md bg-cream-50 font-body">
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/signup" element={<Navigate to="/" replace />} />
        <Route path="/" element={<RequireAuth roles={['vendor']}><Dashboard /></RequireAuth>} />
        <Route path="/delivery-log" element={<RequireAuth roles={['vendor', 'delivery_boy']}><DeliveryLog /></RequireAuth>} />
        <Route path="/billing" element={<RequireAuth roles={['vendor']}><Billing /></RequireAuth>} />
        <Route path="/analytics" element={<RequireAuth roles={['vendor']}><Analytics /></RequireAuth>} />
        <Route path="/today-status" element={<RequireAuth roles={['vendor']}><TodayStatus /></RequireAuth>} />
        <Route path="/manage" element={<RequireAuth roles={['vendor']}><Manage /></RequireAuth>} />
        <Route path="/customers" element={<RequireAuth roles={['vendor']}><Customers /></RequireAuth>} />
        <Route path="/customers/:id/attendance" element={<RequireAuth roles={['vendor']}><CustomerAttendance /></RequireAuth>} />
        <Route path="/products" element={<RequireAuth roles={['vendor']}><Products /></RequireAuth>} />
        <Route path="/delivery-boys" element={<RequireAuth roles={['vendor']}><DeliveryBoys /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth roles={['vendor']}><Settings /></RequireAuth>} />
        <Route path="/profile" element={<RequireAuth roles={['vendor', 'delivery_boy']}><Profile /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toast />
      <BottomNav />
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
    </AppProvider>
  )
}
