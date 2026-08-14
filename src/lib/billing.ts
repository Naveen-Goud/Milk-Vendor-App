import type { Customer, DeliveryException, Product, Company, ComputedInvoice, InvoiceLineItem } from '../types'
import { productTag, productFullLabel } from './productTag'
import { daysInclusive, resolveDay } from './attendance'

interface ComputeInvoiceArgs {
  customer: Customer
  exceptions: DeliveryException[]
  products: Product[]
  companies: Company[]
  periodStart: string
  periodEnd: string
  deliveryCharge?: number
  todayISO: string
}

/**
 * Computes a full itemized invoice for one customer over a date range.
 * Walks every day in the period through `resolveDay` (the same function the
 * calendar and delivery log use) rather than reading raw logs — since most
 * days are implicit "delivered as usual", this is the only way to get a
 * correct total under the default-present attendance model.
 *
 * Per day, per product:
 *   - "regular" portion = min(delivered qty, subscribed daily qty)
 *   - "extra" portion   = anything delivered beyond the subscribed qty
 * Skipped days are never billed, but are surfaced as a "cutting" line so
 * the customer can see what they saved / confirm their leave days were
 * recorded correctly — standard practice on real dairy vendor bills.
 */
export function computeInvoice({
  customer, exceptions, products, companies, periodStart, periodEnd, deliveryCharge = 0, todayISO,
}: ComputeInvoiceArgs): ComputedInvoice {
  const baseline = new Map(customer.subscriptions.map((s) => [s.product_id, s.quantity]))
  const acc = new Map<string, { regularQty: number; regularAmount: number; extraQty: number; extraAmount: number; rate: number }>()

  let deliveredDays = 0
  let skippedDays = 0

  for (const date of daysInclusive(periodStart, periodEnd)) {
    if (date > todayISO) continue // don't bill days that haven't happened yet
    const { status, items } = resolveDay(customer, date, exceptions, products, todayISO)
    if (status === 'inactive' || status === 'upcoming') continue
    if (status === 'skipped') {
      skippedDays += 1
      continue
    }
    deliveredDays += 1
    for (const item of items) {
      const rate = item.price_at_delivery || products.find((p) => p.id === item.product_id)?.price || 0
      const base = baseline.get(item.product_id) ?? 0
      const regularQty = Math.min(item.quantity, base)
      const extraQty = Math.max(0, item.quantity - base)

      const entry = acc.get(item.product_id) ?? { regularQty: 0, regularAmount: 0, extraQty: 0, extraAmount: 0, rate }
      entry.regularQty += regularQty
      entry.regularAmount += regularQty * rate
      entry.extraQty += extraQty
      entry.extraAmount += extraQty * rate
      entry.rate = rate
      acc.set(item.product_id, entry)
    }
  }

  const lineItems: InvoiceLineItem[] = [...acc.entries()]
    .map(([productId, v]) => {
      const product = products.find((p) => p.id === productId)
      if (!product) return null
      const li: InvoiceLineItem = {
        productId,
        label: productFullLabel(product, companies),
        tag: productTag(product, companies),
        unit: product.unit,
        rate: v.rate,
        regularQty: +v.regularQty.toFixed(2),
        regularAmount: +v.regularAmount.toFixed(2),
        extraQty: +v.extraQty.toFixed(2),
        extraAmount: +v.extraAmount.toFixed(2),
      }
      return li
    })
    .filter((li): li is InvoiceLineItem => li !== null)
    .sort((a, b) => a.label.localeCompare(b.label))

  // Informational only — nothing was actually charged for skipped days,
  // this just shows the customer what their subscription would have cost
  // on the days they were skipped, for transparency.
  const dailySubscriptionValue = customer.subscriptions.reduce((sum, s) => {
    const product = products.find((p) => p.id === s.product_id)
    return sum + (product ? product.price * s.quantity : 0)
  }, 0)
  const cuttingAmount = +(skippedDays * dailySubscriptionValue).toFixed(2)

  const subtotal = +lineItems.reduce((sum, li) => sum + li.regularAmount + li.extraAmount, 0).toFixed(2)
  const total = +(subtotal + deliveryCharge).toFixed(2)

  return {
    customer, periodStart, periodEnd, deliveredDays, skippedDays,
    lineItems, deliveryCharge, cuttingAmount, subtotal, total,
  }
}
