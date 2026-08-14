import { Link } from 'react-router-dom'
import { UserPlus, Package, Users, Receipt, UserRound, BarChart3 } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { resolveDay, computeRouteStock } from '../lib/attendance'
import { PageContainer } from '../components/templates/PageContainer'
import { StatCard } from '../components/molecules/StatCard'
import { ProgressRing } from '../components/atoms/ProgressRing'
import { IconCircle } from '../components/atoms/IconCircle'

const quickActions = [
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/billing', label: 'Billing', icon: Receipt },
  { to: '/customers', label: 'Add customer', icon: UserPlus },
  { to: '/products', label: 'Add product', icon: Package },
  { to: '/delivery-boys', label: 'Delivery boys', icon: Users },
]

export default function Dashboard() {
  const { vendor, routes, deliveryBoys, customers, products, companies, exceptions, today } = useApp()
  if (!vendor) return null

  const activeCustomers = customers.filter((c) => !c.is_paused)

  let presentCount = 0
  let todayRevenue = 0
  for (const c of activeCustomers) {
    const { status, items } = resolveDay(c, today, exceptions, products, today)
    if (status === 'delivered' || status === 'modified') {
      presentCount += 1
      for (const item of items) todayRevenue += item.quantity * item.price_at_delivery
    }
  }

  const routeStats = routes.map((r) => {
    const routeCustomers = customers.filter((c) => c.route_id === r.id && !c.is_paused)
    const present = routeCustomers.filter((c) => {
      const { status } = resolveDay(c, today, exceptions, products, today)
      return status === 'delivered' || status === 'modified'
    }).length
    const boy = deliveryBoys.find((b) => b.route_id === r.id)
    const stock = computeRouteStock(r, customers, exceptions, products, companies, today)
    const totalReturned = stock.reduce((sum, row) => sum + row.returnedQty, 0)
    return { ...r, present, total: routeCustomers.length, boyName: boy?.name, totalReturned }
  })

  return (
    <PageContainer>
      <header className="mb-5 flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-ink-600">{vendor.tagline}</p>
          <h1 className="font-display text-2xl font-extrabold text-ink-900">{vendor.name}</h1>
        </div>
        <Link to="/profile" aria-label="Profile">
          <IconCircle><UserRound size={18} /></IconCircle>
        </Link>
      </header>

      <section aria-label="Today's snapshot" className="flex gap-3">
        <StatCard label="Present today" value={`${presentCount}/${activeCustomers.length}`} tone="fresh" />
        <StatCard label="Revenue today" value={`₹${todayRevenue.toFixed(0)}`} tone="crate" />
      </section>

      <section className="mt-6" aria-label="Quick actions">
        <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-ink-600">Quick actions</h2>
        <div className="grid grid-cols-2 gap-3">
          {quickActions.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className="flex items-center gap-3 rounded-2xl border border-crate-100 bg-white p-4 active:bg-crate-50">
              <IconCircle><Icon size={18} /></IconCircle>
              <span className="text-sm font-semibold text-ink-900">{label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-6" aria-label="Routes overview">
        <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-ink-600">Routes overview</h2>
        {routeStats.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-crate-100 bg-white p-6 text-center text-sm text-ink-600">
            No routes yet. Add a delivery boy to create your first route.
          </p>
        ) : (
          <div className="space-y-3">
            {routeStats.map((route) => (
              <div key={route.id} className="flex items-center justify-between rounded-2xl border border-crate-100 bg-white p-4">
                <div>
                  <p className="font-semibold text-ink-900">{route.name}</p>
                  <p className="text-sm text-ink-600">
                    {route.boyName ? `${route.boyName} · ` : ''}
                    {route.total === 0 ? 'No customers' : `${route.totalReturned}L returning today`}
                  </p>
                </div>
                <ProgressRing value={route.present} total={route.total || 1} size={56} />
              </div>
            ))}
          </div>
        )}
      </section>
    </PageContainer>
  )
}
