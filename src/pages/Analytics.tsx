import { useMemo } from 'react'
import { TrendingUp, Users, PackageSearch, AlertCircle } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { getDailyRevenue, getProductRevenue, getAttendanceStats, getOutstandingTotal, getTopCustomers } from '../lib/analytics'
import { PageContainer } from '../components/templates/PageContainer'
import { StatCard } from '../components/molecules/StatCard'
import { TrendBars } from '../components/molecules/TrendBars'
import { RankedBarList } from '../components/molecules/RankedBarList'
import { getCurrentMonthRange } from '../lib/attendance'
import { IconCircle } from '../components/atoms/IconCircle'
import { BackButton } from '../components/atoms/BackButton'

export default function Analytics() {
  const { customers, exceptions, products, companies, invoices, payments, vendor, today } = useApp()
  const range = useMemo(() => getCurrentMonthRange(today), [today])

  const dailyRevenue = useMemo(
    () => getDailyRevenue(customers, exceptions, products, range.start, range.end, today),
    [customers, exceptions, products, range, today]
  )
  const productRevenue = useMemo(
    () => getProductRevenue(customers, exceptions, products, companies, range.start, range.end, today),
    [customers, exceptions, products, companies, range, today]
  )
  const attendance = useMemo(
    () => getAttendanceStats(customers, exceptions, products, range.start, range.end, today),
    [customers, exceptions, products, range, today]
  )
  const topCustomers = useMemo(
    () => getTopCustomers(customers, exceptions, products, range.start, range.end, today),
    [customers, exceptions, products, range, today]
  )
  const outstanding = useMemo(
    () => getOutstandingTotal(customers, invoices, payments, exceptions, products, companies, vendor?.deliveryCharge ?? 0, today),
    [customers, invoices, payments, exceptions, products, companies, vendor, today]
  )

  if (!vendor) return null

  const totalRevenue = dailyRevenue.reduce((sum, p) => sum + p.revenue, 0)

  return (
    <PageContainer>
      <header className="mb-5 flex items-center gap-3">
        <BackButton to="/" />
        <div>
          <p className="text-sm font-medium text-ink-600">{range.label}</p>
          <h1 className="font-display text-2xl font-extrabold text-ink-900">Analytics</h1>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3">
        <StatCard label="Revenue this month" value={`₹${totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} tone="crate" />
        <StatCard label="Attendance rate" value={`${attendance.rate}%`} tone="fresh" />
      </section>

      {outstanding > 0 && (
        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-amber-100 bg-amber-100/40 p-4">
          <IconCircle tone="amber"><AlertCircle size={18} /></IconCircle>
          <div>
            <p className="font-display font-bold text-ink-900">₹{outstanding.toLocaleString('en-IN')} outstanding</p>
            <p className="text-xs text-ink-600">Across all customers with pending dues</p>
          </div>
        </div>
      )}

      <section className="mt-5 rounded-2xl border border-crate-100 bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp size={16} className="text-crate-600" />
          <h2 className="font-display text-sm font-bold text-ink-900">Daily revenue</h2>
        </div>
        {dailyRevenue.length === 0 ? (
          <p className="text-sm text-ink-600">No delivery history yet.</p>
        ) : (
          <TrendBars points={dailyRevenue} />
        )}
      </section>

      <section className="mt-4 rounded-2xl border border-crate-100 bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <PackageSearch size={16} className="text-crate-600" />
          <h2 className="font-display text-sm font-bold text-ink-900">Revenue by product</h2>
        </div>
        {productRevenue.length === 0 ? (
          <p className="text-sm text-ink-600">No deliveries recorded yet.</p>
        ) : (
          <RankedBarList rows={productRevenue.slice(0, 6).map((p) => ({ key: p.productId, label: p.label, value: p.revenue }))} />
        )}
      </section>

      <section className="mt-4 rounded-2xl border border-crate-100 bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <Users size={16} className="text-crate-600" />
          <h2 className="font-display text-sm font-bold text-ink-900">Top customers by revenue</h2>
        </div>
        {topCustomers.length === 0 ? (
          <p className="text-sm text-ink-600">No customers yet.</p>
        ) : (
          <RankedBarList rows={topCustomers.map((c) => ({ key: c.customerId, label: c.name, value: c.revenue }))} />
        )}
      </section>

      <p className="mt-4 text-center text-xs text-ink-600">
        {attendance.presentDays} deliveries · {attendance.absentDays} absences recorded this period
      </p>
    </PageContainer>
  )
}
