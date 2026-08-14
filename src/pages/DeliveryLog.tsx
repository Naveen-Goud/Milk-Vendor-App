import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { resolveDay, computeRouteStock } from '../lib/attendance'
import { productTag } from '../lib/productTag'
import { PageContainer } from '../components/templates/PageContainer'
import { AttendanceRow } from '../components/organisms/AttendanceRow'
import { StockSummaryCard } from '../components/organisms/StockSummaryCard'
import type { Product } from '../types'

export default function DeliveryLog() {
  const { currentUser, deliveryBoys, routes, customers, products, companies, exceptions, today, markAbsent, modifyDelivery, undoException } = useApp()

  const isDeliveryBoy = currentUser?.role === 'delivery_boy'
  const [selectedBoyId, setSelectedBoyId] = useState(deliveryBoys[0]?.id ?? '')

  // A delivery boy can only ever see their own route — the switcher below
  // is a vendor-only convenience for spot-checking any boy's day.
  const boyId = isDeliveryBoy ? currentUser.deliveryBoyId : selectedBoyId
  const boy = deliveryBoys.find((b) => b.id === boyId)
  const route = routes.find((r) => r.id === boy?.route_id)

  const stops = useMemo(() => {
    if (!route) return []
    return customers
      .filter((c) => c.route_id === route.id && !c.is_paused)
      .map((customer) => {
        const resolution = resolveDay(customer, today, exceptions, products, today)
        const usualItems = customer.subscriptions
          .map((s) => ({ product: products.find((p) => p.id === s.product_id), quantity: s.quantity }))
          .filter((i): i is { product: Product; quantity: number } => !!i.product)
        return { customer, resolution, usualItems }
      })
  }, [route, customers, products, exceptions, today])

  const stock = useMemo(
    () => (route ? computeRouteStock(route, customers, exceptions, products, companies, today) : []),
    [route, customers, exceptions, products, companies, today]
  )

  const tagFor = (product: Product) => productTag(product, companies)

  const presentCount = stops.filter((s) => s.resolution.status === 'delivered' || s.resolution.status === 'modified').length
  const exceptionCount = stops.length - presentCount

  return (
    <PageContainer>
      <header className="mb-4">
        <p className="text-sm font-medium text-ink-600">
          {new Date(today).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
        </p>
        {isDeliveryBoy ? (
          <h1 className="font-display text-lg font-extrabold text-ink-900">Hi {boy?.name?.split(' ')[0]} 👋</h1>
        ) : (
          <select
            value={boyId}
            onChange={(e) => setSelectedBoyId(e.target.value)}
            aria-label="Delivery boy"
            className="w-full rounded-xl border border-crate-100 bg-white px-3 py-2 font-display text-lg font-extrabold text-ink-900 focus:border-crate-500 focus:outline-none"
          >
            {deliveryBoys.length === 0 && <option>No delivery boys yet</option>}
            {deliveryBoys.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        {route && (
          <p className="mt-1 text-sm text-ink-600">
            {route.name} · {presentCount} present{exceptionCount > 0 ? `, ${exceptionCount} need attention` : ', all set ✓'}
          </p>
        )}
      </header>

      {deliveryBoys.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-crate-100 bg-white p-6 text-center text-sm text-ink-600">
          Add a delivery boy from Manage → Delivery Boys to get started.
        </p>
      ) : stops.length === 0 ? (
        <p className="rounded-2xl border border-crate-100 bg-white p-6 text-center text-sm text-ink-600">
          No active customers assigned to this route yet.
        </p>
      ) : (
        <div className="space-y-4">
          <StockSummaryCard rows={stock} />

          <div>
            <p className="mb-2 text-xs font-medium text-ink-600">
              Everyone is marked present by default. Only tap a customer if they're absent or want something different today.
            </p>
            <div className="space-y-3">
              {stops.map(({ customer, resolution, usualItems }) => (
                <AttendanceRow
                  key={customer.id}
                  customer={customer}
                  resolution={resolution}
                  usualItems={usualItems}
                  tagFor={tagFor}
                  onMarkAbsent={() => markAbsent(customer.id, today)}
                  onModify={(items) => modifyDelivery(customer.id, today, items)}
                  onUndo={() => undoException(customer.id, today)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}
