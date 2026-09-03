import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, MapPin, UserX, CheckCircle2 } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { resolveDay } from '../lib/attendance'
import { PageContainer } from '../components/templates/PageContainer'
import { Badge } from '../components/atoms/Badge'
import type { Customer } from '../types'

interface Row {
  customer: Customer
  routeName: string
  boyName: string
  modified: boolean
}

export default function TodayStatus() {
  const navigate = useNavigate()
  const { customers, routes, deliveryBoys, products, exceptions, today } = useApp()

  const { absent, present } = useMemo(() => {
    const absentRows: Row[] = []
    const presentRows: Row[] = []

    for (const customer of customers) {
      if (customer.is_paused) continue
      const route = routes.find((r) => r.id === customer.route_id)
      const boy = deliveryBoys.find((b) => b.route_id === customer.route_id)
      const { status } = resolveDay(customer, today, exceptions, products, today)
      const row: Row = { customer, routeName: route?.name ?? 'Unassigned', boyName: boy?.name ?? '—', modified: status === 'modified' }
      if (status === 'skipped') absentRows.push(row)
      else if (status === 'delivered' || status === 'modified') presentRows.push(row)
    }

    absentRows.sort((a, b) => a.customer.name.localeCompare(b.customer.name))
    presentRows.sort((a, b) => a.customer.name.localeCompare(b.customer.name))
    return { absent: absentRows, present: presentRows }
  }, [customers, routes, deliveryBoys, products, exceptions, today])

  return (
    <PageContainer>
      <header className="mb-5 flex items-center gap-3">
        <button onClick={() => navigate(-1)} aria-label="Back" className="flex h-9 w-9 items-center justify-center rounded-full bg-crate-50 text-crate-600">
          <ArrowLeft size={16} />
        </button>
        <div>
          <p className="text-sm font-medium text-ink-600">
            {new Date(today).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
          </p>
          <h1 className="font-display text-xl font-extrabold text-ink-900">Today's status</h1>
        </div>
      </header>

      <section className="mb-6">
        <h2 className="mb-2 flex items-center gap-1.5 font-display text-sm font-bold text-red-500">
          <UserX size={15} /> Absent ({absent.length})
        </h2>
        {absent.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-crate-100 bg-white p-4 text-center text-sm text-ink-600">
            No one is marked absent today.
          </p>
        ) : (
          <div className="space-y-2">
            {absent.map(({ customer, routeName, boyName }) => (
              <div key={customer.id} className="flex items-center justify-between rounded-2xl border border-red-100 bg-red-50 p-3.5">
                <div className="min-w-0">
                  <p className="font-semibold text-ink-900">{customer.name}</p>
                  <p className="flex items-center gap-1 truncate text-xs text-ink-600">
                    <MapPin size={11} /> {routeName} · {boyName}
                  </p>
                </div>
                <Badge tone="red">Absent</Badge>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-1.5 font-display text-sm font-bold text-fresh-600">
          <CheckCircle2 size={15} /> Present ({present.length})
        </h2>
        {present.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-crate-100 bg-white p-4 text-center text-sm text-ink-600">
            No one is marked present yet.
          </p>
        ) : (
          <div className="space-y-2">
            {present.map(({ customer, routeName, boyName, modified }) => (
              <div key={customer.id} className="flex items-center justify-between rounded-2xl border border-crate-100 bg-white p-3.5">
                <div className="min-w-0">
                  <p className="font-semibold text-ink-900">{customer.name}</p>
                  <p className="flex items-center gap-1 truncate text-xs text-ink-600">
                    <MapPin size={11} /> {routeName} · {boyName}
                  </p>
                </div>
                {modified && <Badge tone="amber">Modified</Badge>}
              </div>
            ))}
          </div>
        )}
      </section>
    </PageContainer>
  )
}
