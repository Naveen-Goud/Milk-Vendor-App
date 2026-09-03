import { useNavigate, Link } from 'react-router-dom'
import { UserRound, Store, Phone, MapPin, LogOut, Settings as SettingsIcon } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { PageContainer } from '../components/templates/PageContainer'
import { IconCircle } from '../components/atoms/IconCircle'

export default function Profile() {
  const { currentUser, vendor, deliveryBoys, routes, customers, logout } = useApp()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  if (currentUser?.role === 'vendor') {
    return (
      <PageContainer>
        <header className="mb-5">
          <h1 className="font-display text-2xl font-extrabold text-ink-900">Profile</h1>
        </header>

        <div className="rounded-2xl border border-crate-100 bg-white p-5 text-center">
          <div className="mx-auto mb-3 w-fit"><IconCircle size="lg"><Store size={28} /></IconCircle></div>
          <p className="font-display text-lg font-bold text-ink-900">{vendor?.name}</p>
          <p className="text-sm text-ink-600">Vendor Admin</p>
        </div>

        <Link to="/settings" className="mt-4 flex items-center gap-3 rounded-2xl border border-crate-100 bg-white p-4 active:bg-crate-50">
          <IconCircle><SettingsIcon size={18} /></IconCircle>
          <span className="text-sm font-semibold text-ink-900">Business settings</span>
        </Link>

        <button onClick={handleLogout} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 py-3 text-sm font-semibold text-red-500">
          <LogOut size={16} /> Log out
        </button>
      </PageContainer>
    )
  }

  const boy = deliveryBoys.find((b) => b.id === currentUser?.deliveryBoyId)
  const route = routes.find((r) => r.id === boy?.route_id)
  const assignedCount = customers.filter((c) => c.route_id === boy?.route_id).length

  return (
    <PageContainer>
      <header className="mb-5">
        <h1 className="font-display text-2xl font-extrabold text-ink-900">Profile</h1>
      </header>

      <div className="rounded-2xl border border-crate-100 bg-white p-5 text-center">
        <div className="mx-auto mb-3 w-fit"><IconCircle size="lg"><UserRound size={28} /></IconCircle></div>
        <p className="font-display text-lg font-bold text-ink-900">{boy?.name}</p>
        <p className="text-sm text-ink-600">Delivery Boy</p>
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-3 rounded-2xl border border-crate-100 bg-white p-4">
          <IconCircle><Phone size={16} /></IconCircle>
          <div>
            <p className="text-xs text-ink-600">Phone</p>
            <p className="text-sm font-semibold text-ink-900">{boy?.phone || '—'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-crate-100 bg-white p-4">
          <IconCircle><MapPin size={16} /></IconCircle>
          <div>
            <p className="text-xs text-ink-600">Route</p>
            <p className="text-sm font-semibold text-ink-900">{route?.name ?? 'Unassigned'} · {assignedCount} customer{assignedCount !== 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      <p className="mt-4 rounded-xl bg-crate-50 p-3 text-xs text-ink-600">
        For pricing, billing, or customer changes, please contact {vendor?.name}.
      </p>

      <button onClick={handleLogout} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 py-3 text-sm font-semibold text-red-500">
        <LogOut size={16} /> Log out
      </button>
    </PageContainer>
  )
}
