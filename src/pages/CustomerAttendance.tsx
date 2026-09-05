import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Wallet, Plus } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { resolveDay } from '../lib/attendance'
import { productTag } from '../lib/productTag'
import { getCustomerLedger } from '../lib/ledger'
import { PageContainer } from '../components/templates/PageContainer'
import { AttendanceCalendar } from '../components/organisms/AttendanceCalendar'
import { Sheet } from '../components/organisms/Sheet'
import { Badge } from '../components/atoms/Badge'
import { FormField } from '../components/molecules/FormField'
import { TextInput, Select } from '../components/atoms/Inputs'
import { PrimaryButton } from '../components/atoms/Button'
import type { PaymentMethod } from '../types'

export default function CustomerAttendance() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { customers, products, companies, exceptions, invoices, payments, vendor, today, addPayment } = useApp()
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [paySheetOpen, setPaySheetOpen] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash')

  const customer = customers.find((c) => c.id === id)

  if (!customer || !vendor) {
    return (
      <PageContainer>
        <p className="rounded-2xl border border-dashed border-crate-100 bg-white p-6 text-center text-sm text-ink-600">
          Customer not found.
        </p>
      </PageContainer>
    )
  }

  const ledger = getCustomerLedger(customer, invoices, payments, exceptions, products, companies, vendor.deliveryCharge, today)
  const customerPayments = payments.filter((p) => p.customer_id === customer.id).sort((a, b) => b.date.localeCompare(a.date))

  function handleRecordPayment(e: FormEvent) {
    e.preventDefault()
    const amount = Number(payAmount)
    if (!amount || amount <= 0) return
    addPayment(customer!.id, amount, payMethod)
    setPayAmount('')
    setPaySheetOpen(false)
  }

  const dayDetail = selectedDate ? resolveDay(customer, selectedDate, exceptions, products, today) : null
  const [defaultYear, defaultMonth] = today.slice(0, 7).split('-').map(Number)

  return (
    <PageContainer>
      <header className="mb-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} aria-label="Back" className="flex h-9 w-9 items-center justify-center rounded-full bg-crate-50 text-crate-600">
          <ArrowLeft size={16} />
        </button>
        <div className="min-w-0">
          <h1 className="truncate font-display text-xl font-extrabold text-ink-900">{customer.name}</h1>
          <p className="truncate text-sm text-ink-600">{customer.address}</p>
        </div>
      </header>

      <section className="mb-4 rounded-2xl border border-crate-100 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet size={16} className="text-crate-600" />
            <h2 className="font-display text-sm font-bold text-ink-900">Payments</h2>
          </div>
          <button
            onClick={() => { setPayAmount(ledger.pending > 0 ? String(ledger.pending) : ''); setPaySheetOpen(true) }}
            className="flex items-center gap-1 rounded-full bg-crate-500 px-3 py-1.5 text-xs font-semibold text-white"
          >
            <Plus size={13} /> Record payment
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-crate-50 py-2">
            <p className="font-mono text-sm font-bold text-ink-900">₹{ledger.billed.toLocaleString('en-IN')}</p>
            <p className="text-[10px] font-semibold uppercase text-ink-600">Billed</p>
          </div>
          <div className="rounded-xl bg-fresh-50 py-2">
            <p className="font-mono text-sm font-bold text-fresh-600">₹{ledger.paid.toLocaleString('en-IN')}</p>
            <p className="text-[10px] font-semibold uppercase text-ink-600">Paid</p>
          </div>
          <div className={`rounded-xl py-2 ${ledger.pending > 0 ? 'bg-red-100' : 'bg-crate-50'}`}>
            <p className={`font-mono text-sm font-bold ${ledger.pending > 0 ? 'text-red-500' : 'text-ink-900'}`}>₹{Math.max(0, ledger.pending).toLocaleString('en-IN')}</p>
            <p className="text-[10px] font-semibold uppercase text-ink-600">Pending</p>
          </div>
        </div>

        {customerPayments.length > 0 && (
          <ul className="mt-3 space-y-1.5 border-t border-crate-100 pt-3">
            {customerPayments.slice(0, 4).map((p) => (
              <li key={p.id} className="flex items-center justify-between text-xs text-ink-600">
                <span>{p.date} · {p.method}</span>
                <span className="font-mono font-semibold text-ink-900">₹{p.amount.toLocaleString('en-IN')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AttendanceCalendar
        customer={customer}
        exceptions={exceptions}
        products={products}
        todayISO={today}
        initialYear={defaultYear ?? 2026}
        initialMonth={(defaultMonth ?? 7) - 1}
        onSelectDay={setSelectedDate}
      />

      <p className="mt-3 text-center text-xs text-ink-600">Tap any day to see what was delivered.</p>

      <Sheet open={!!selectedDate} title={selectedDate ?? ''} onClose={() => setSelectedDate(null)}>
        {dayDetail && (
          <div>
            <div className="mb-3">
              {dayDetail.status === 'skipped' && <Badge tone="red">Absent this day</Badge>}
              {dayDetail.status === 'modified' && <Badge tone="amber">Modified order</Badge>}
              {dayDetail.status === 'delivered' && <Badge tone="fresh">Delivered as usual</Badge>}
            </div>
            {dayDetail.items.length === 0 ? (
              <p className="text-sm text-ink-600">Nothing was delivered this day.</p>
            ) : (
              <ul className="space-y-2">
                {dayDetail.items.map((item) => {
                  const product = products.find((p) => p.id === item.product_id)
                  return (
                    <li key={item.product_id} className="flex items-center justify-between rounded-xl bg-crate-50 px-3 py-2">
                      <span className="text-sm text-ink-900">{product ? productTag(product, companies) : 'Unknown'}</span>
                      <span className="font-mono text-sm font-semibold">{item.quantity}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </Sheet>

      <Sheet open={paySheetOpen} title="Record payment" onClose={() => setPaySheetOpen(false)}>
        <form onSubmit={handleRecordPayment}>
          <FormField label="Amount (₹)">
            <TextInput required type="number" min="1" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
          </FormField>
          <FormField label="Method">
            <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="other">Other</option>
            </Select>
          </FormField>
          {ledger.pending > 0 && (
            <p className="mb-4 text-xs text-ink-600">Pending balance is ₹{ledger.pending.toLocaleString('en-IN')} — pre-filled above.</p>
          )}
          <PrimaryButton type="submit">Save payment</PrimaryButton>
        </form>
      </Sheet>
    </PageContainer>
  )
}
