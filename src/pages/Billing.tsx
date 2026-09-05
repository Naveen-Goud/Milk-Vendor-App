import { Fragment, useMemo, useState } from 'react'
import { Mail, MessageCircle, FileText, Truck, Scissors, Plus } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { computeInvoice } from '../lib/billing'
import { getCurrentMonthRange, labelForPeriod } from '../lib/attendance'
import { PageContainer } from '../components/templates/PageContainer'
import { Sheet } from '../components/organisms/Sheet'
import { Badge } from '../components/atoms/Badge'
import { BackButton } from '../components/atoms/BackButton'
import type { ComputedInvoice, Customer, Invoice } from '../types'

const statusTone = { paid: 'fresh', sent: 'crate', draft: 'amber' } as const
const channelIcon = { email: Mail, whatsapp: MessageCircle, sms: Mail }

interface ComputedRow {
  invoice: Invoice
  customer: Customer
  bill: ComputedInvoice
  periodLabel: string
}

export default function Billing() {
  const {
    invoices, customers, products, companies, vendor, exceptions, today,
    markInvoiceSent, sendInvoiceEmail, markInvoicePaid, generateInvoicesForPeriod,
  } = useApp()
  const [viewing, setViewing] = useState<string | null>(null)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const currentMonth = useMemo(() => getCurrentMonthRange(today), [today])

  // Each invoice is computed using ITS OWN stored period, never a shared
  // hardcoded range — this is what makes the totals correct regardless of
  // when the invoice was actually generated (last month via the scheduled
  // job, this month via the button below, or any other period).
  const computed = useMemo<ComputedRow[]>(() => {
    return invoices
      .map((inv) => {
        const customer = customers.find((c) => c.id === inv.customer_id)
        if (!customer) return null
        const bill = computeInvoice({
          customer, exceptions, products, companies,
          periodStart: inv.period_start, periodEnd: inv.period_end,
          deliveryCharge: vendor?.deliveryCharge || 0,
          todayISO: today,
        })
        return { invoice: inv, customer, bill, periodLabel: labelForPeriod(inv.period_start, inv.period_end) }
      })
      .filter((row): row is ComputedRow => row !== null)
      .sort((a, b) => b.invoice.period_end.localeCompare(a.invoice.period_end) || a.customer.name.localeCompare(b.customer.name))
  }, [invoices, customers, exceptions, products, companies, vendor, today])

  if (!vendor) return null

  const hasThisMonth = invoices.some((i) => i.period_start === currentMonth.start && i.period_end === currentMonth.end)
  const pendingCount = invoices.filter((i) => i.status === 'draft').length
  const viewingRow = computed.find((c) => c.invoice.id === viewing)

  async function handleGenerateThisMonth() {
    setGenerating(true)
    try {
      await generateInvoicesForPeriod(currentMonth.start, currentMonth.end)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not generate invoices')
    } finally {
      setGenerating(false)
    }
  }

  async function sendBill(row: ComputedRow) {
    setSendingId(row.invoice.id)
    try {
      if (row.customer.email) {
        await sendInvoiceEmail(row.invoice.id, {
          toEmail: row.customer.email,
          customerName: row.customer.name,
          periodLabel: row.periodLabel,
          periodStart: row.bill.periodStart,
          periodEnd: row.bill.periodEnd,
          lineItems: row.bill.lineItems,
          deliveryCharge: row.bill.deliveryCharge,
          skippedDays: row.bill.skippedDays,
          subtotal: row.bill.subtotal,
          total: row.bill.total,
        })
      } else {
        // No email on file — WhatsApp/SMS sending isn't wired to a real
        // provider yet, so this still just marks the invoice sent. See
        // README "Known limitations".
        await markInvoiceSent(row.invoice.id, 'whatsapp')
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not send the bill')
    } finally {
      setSendingId(null)
    }
  }

  async function sendAllPending() {
    for (const row of computed) {
      if (row.invoice.status === 'draft') await sendBill(row)
    }
  }

  return (
    <PageContainer>
      <header className="mb-4 flex items-center gap-3">
        <BackButton to="/" />
        <div>
          <p className="text-sm font-medium text-ink-600">{currentMonth.label}</p>
          <h1 className="font-display text-2xl font-extrabold text-ink-900">Billing</h1>
        </div>
      </header>

      {!hasThisMonth && (
        <button
          onClick={handleGenerateThisMonth}
          disabled={generating}
          className="mb-5 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-crate-200 bg-crate-50 py-3 text-sm font-semibold text-crate-700 disabled:opacity-60"
        >
          <Plus size={16} /> {generating ? 'Generating…' : `Generate ${currentMonth.label} bills`}
        </button>
      )}

      {computed.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-crate-100 bg-white p-6 text-center text-sm text-ink-600">
          No invoices yet. Generate {currentMonth.label}'s bills above to get started.
        </p>
      ) : (
        <div className="space-y-3">
          {computed.map((row) => {
            const { invoice: inv, customer, bill, periodLabel } = row
            const Icon = inv.sent_via ? channelIcon[inv.sent_via] : null
            const busy = sendingId === inv.id
            return (
              <div key={inv.id} className="rounded-2xl border border-crate-100 bg-white p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-display font-bold text-ink-900">{customer.name}</p>
                    <p className="text-xs font-semibold text-crate-600">{periodLabel}</p>
                    <p className="mt-1 font-mono text-lg font-semibold text-ink-900">₹{bill.total.toLocaleString('en-IN')}</p>
                    <p className="text-xs text-ink-600">{bill.deliveredDays} days delivered · {bill.skippedDays} skipped</p>
                  </div>
                  <Badge tone={statusTone[inv.status]}>
                    {Icon && <Icon size={12} />}
                    {inv.status}
                  </Badge>
                </div>

                <div className="mt-3 flex gap-2">
                  <button onClick={() => setViewing(inv.id)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-crate-100 py-2.5 text-sm font-semibold text-crate-600">
                    <FileText size={15} /> View bill
                  </button>
                  {inv.status === 'draft' && (
                    <button
                      onClick={() => sendBill(row)}
                      disabled={busy}
                      className="flex-1 rounded-xl bg-crate-500 py-2.5 text-sm font-semibold text-white active:bg-crate-600 disabled:opacity-60"
                    >
                      {busy ? 'Sending…' : customer.email ? 'Generate & email' : 'Generate & send'}
                    </button>
                  )}
                  {inv.status === 'sent' && (
                    <>
                      <button onClick={() => sendBill(row)} disabled={busy} className="flex-1 rounded-xl bg-crate-500 py-2.5 text-sm font-semibold text-white active:bg-crate-600 disabled:opacity-60">
                        {busy ? 'Sending…' : 'Resend'}
                      </button>
                      <button onClick={() => markInvoicePaid(inv.id)} className="flex-1 rounded-xl bg-fresh-500 py-2.5 text-sm font-semibold text-white active:bg-fresh-600">
                        Mark paid
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}

          <div className="!mt-6 space-y-2">
            <button
              onClick={sendAllPending}
              disabled={pendingCount === 0}
              className="w-full rounded-xl bg-fresh-500 py-3 text-sm font-semibold text-white active:bg-fresh-600 disabled:opacity-50"
            >
              {pendingCount === 0 ? 'All invoices sent' : `Send ${pendingCount} pending invoice${pendingCount > 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}

      <Sheet open={!!viewingRow} title="Itemized bill" onClose={() => setViewing(null)}>
        {viewingRow && <InvoiceDetail row={viewingRow} />}
      </Sheet>
    </PageContainer>
  )
}

function InvoiceDetail({ row }: { row: ComputedRow }) {
  const { customer, bill, invoice, periodLabel } = row
  return (
    <div>
      <div className="mb-4 rounded-xl bg-crate-50 p-3.5">
        <p className="font-display font-bold text-ink-900">{customer.name}</p>
        <p className="text-sm text-ink-600">{customer.address}</p>
        <p className="text-sm text-ink-600">{customer.phone}</p>
        <p className="mt-1.5 text-xs font-semibold text-crate-600">{periodLabel} · {bill.periodStart} to {bill.periodEnd}</p>
      </div>

      <div className="overflow-x-auto">
      <table className="w-full min-w-[340px] text-sm">
        <thead>
          <tr className="border-b border-crate-100 text-left text-xs font-semibold uppercase tracking-wide text-ink-600">
            <th className="pb-2">Product</th>
            <th className="pb-2 text-right">Qty</th>
            <th className="pb-2 text-right">Rate</th>
            <th className="pb-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {bill.lineItems.length === 0 && (
            <tr><td colSpan={4} className="py-3 text-center text-ink-600">No deliveries this period.</td></tr>
          )}
          {bill.lineItems.map((li) => (
            <Fragment key={li.productId}>
              <tr className="border-b border-crate-50">
                <td className="py-2">
                  <p className="font-medium text-ink-900">{li.label}</p>
                  <p className="font-mono text-xs text-crate-600">{li.tag}</p>
                </td>
                <td className="py-2 text-right font-mono">{li.regularQty}{li.unit === 'litre' ? 'L' : ''}</td>
                <td className="py-2 text-right font-mono">₹{li.rate}</td>
                <td className="py-2 text-right font-mono font-semibold">₹{li.regularAmount.toFixed(2)}</td>
              </tr>
              {li.extraQty > 0 && (
                <tr className="border-b border-crate-50 bg-fresh-50/60">
                  <td className="py-2 pl-3 text-xs text-fresh-600">↳ Extra {li.tag}</td>
                  <td className="py-2 text-right font-mono text-xs text-fresh-600">{li.extraQty}{li.unit === 'litre' ? 'L' : ''}</td>
                  <td className="py-2 text-right font-mono text-xs text-fresh-600">₹{li.rate}</td>
                  <td className="py-2 text-right font-mono text-xs font-semibold text-fresh-600">₹{li.extraAmount.toFixed(2)}</td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      </div>

      <div className="mt-4 space-y-2 border-t border-crate-100 pt-3 text-sm">
        <div className="flex items-center justify-between text-ink-600">
          <span>Items subtotal</span>
          <span className="font-mono">₹{bill.subtotal.toFixed(2)}</span>
        </div>
        {bill.deliveryCharge > 0 && (
          <div className="flex items-center justify-between text-ink-600">
            <span className="flex items-center gap-1.5"><Truck size={13} /> Delivery charge</span>
            <span className="font-mono">₹{bill.deliveryCharge.toFixed(2)}</span>
          </div>
        )}
        {bill.skippedDays > 0 && (
          <div className="flex items-center justify-between text-fresh-600">
            <span className="flex items-center gap-1.5"><Scissors size={13} /> Cutting — {bill.skippedDays} day{bill.skippedDays > 1 ? 's' : ''} skipped</span>
            <span className="font-mono">not charged</span>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-crate-100 pt-2 text-base font-display font-bold text-ink-900">
          <span>Total</span>
          <span className="font-mono">₹{bill.total.toFixed(2)}</span>
        </div>
      </div>

      {invoice.sent_via && (
        <p className="mt-3 text-center text-xs text-ink-600">
          Last sent via {invoice.sent_via} on {invoice.sent_at ? new Date(invoice.sent_at).toLocaleDateString('en-IN') : '—'}
        </p>
      )}
    </div>
  )
}
