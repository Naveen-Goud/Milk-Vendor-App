import type {
  Customer, DeliveryException, DeliveryItem, DayResolution,
  Product, RouteRecord, StockRow,
} from '../types'
import { productFullLabel, productTag } from './productTag'
import type { Company } from '../types'

/**
 * The core idea of the whole attendance model: a customer is assumed
 * delivered-as-usual every day by default. Nothing needs to be recorded for
 * a normal day — only exceptions (absent, or a modified quantity) are ever
 * stored. This function is the single place that resolves "what actually
 * happened on this date" by checking for a stored exception first and
 * falling back to the customer's standing subscription.
 */
export function resolveDay(
  customer: Customer,
  date: string,
  exceptions: DeliveryException[],
  products: Product[],
  todayISO: string
): DayResolution {
  if (customer.is_paused) return { status: 'inactive', items: [] }

  const exception = exceptions.find((e) => e.customer_id === customer.id && e.date === date)
  if (exception) {
    return { status: exception.status, items: exception.items }
  }

  if (date > todayISO) return { status: 'upcoming', items: [] }

  const items: DeliveryItem[] = customer.subscriptions.map((s) => ({
    product_id: s.product_id,
    quantity: s.quantity,
    price_at_delivery: products.find((p) => p.id === s.product_id)?.price ?? 0,
  }))
  return { status: 'delivered', items }
}

export function daysInclusive(startISO: string, endISO: string): string[] {
  const out: string[] = []
  const d = new Date(startISO + 'T00:00:00Z')
  const end = new Date(endISO + 'T00:00:00Z')
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

export interface CalendarDay {
  date: string | null // null = padding cell (keeps weekday columns aligned)
  dayNumber: number | null
  status: DayResolution['status'] | null
}

/** Builds a full calendar grid (padded to whole weeks, Sun–Sat) for one month. */
export function getMonthGrid(
  year: number,
  month: number, // 0-11
  customer: Customer,
  exceptions: DeliveryException[],
  products: Product[],
  todayISO: string
): CalendarDay[] {
  const firstOfMonth = new Date(Date.UTC(year, month, 1))
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const leadingBlanks = firstOfMonth.getUTCDay() // 0 = Sunday

  const cells: CalendarDay[] = []
  for (let i = 0; i < leadingBlanks; i++) cells.push({ date: null, dayNumber: null, status: null })

  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const { status } = resolveDay(customer, date, exceptions, products, todayISO)
    cells.push({ date, dayNumber: day, status })
  }

  while (cells.length % 7 !== 0) cells.push({ date: null, dayNumber: null, status: null })
  return cells
}

/**
 * A delivery boy's daily milk stock: how much of each product their route's
 * customers are subscribed to in total ("allotted"), how much is coming
 * back because someone was absent or took less than usual ("returned"),
 * and what's actually going out the door net of that ("net").
 */
export function computeRouteStock(
  route: RouteRecord,
  customers: Customer[],
  exceptions: DeliveryException[],
  products: Product[],
  companies: Company[],
  dateISO: string
): StockRow[] {
  const routeCustomers = customers.filter((c) => c.route_id === route.id && !c.is_paused)
  const rows = new Map<string, StockRow>()

  const ensureRow = (productId: string): StockRow => {
    let row = rows.get(productId)
    if (!row) {
      const product = products.find((p) => p.id === productId)
      row = {
        productId,
        label: product ? productFullLabel(product, companies) : 'Unknown product',
        tag: product ? productTag(product, companies) : '?',
        unit: product?.unit ?? 'litre',
        allottedQty: 0,
        returnedQty: 0,
        extraQty: 0,
        netQty: 0,
      }
      rows.set(productId, row)
    }
    return row
  }

  for (const customer of routeCustomers) {
    for (const sub of customer.subscriptions) {
      ensureRow(sub.product_id).allottedQty += sub.quantity
    }
    const { items } = resolveDay(customer, dateISO, exceptions, products, dateISO)
    const deliveredByProduct = new Map(items.map((i) => [i.product_id, i.quantity]))
    for (const sub of customer.subscriptions) {
      const delivered = deliveredByProduct.get(sub.product_id) ?? 0
      const row = ensureRow(sub.product_id)
      if (delivered < sub.quantity) row.returnedQty += sub.quantity - delivered
      if (delivered > sub.quantity) row.extraQty += delivered - sub.quantity
      // Net is the true total actually going out the door — allotment minus
      // what came back, plus anything delivered beyond the usual amount.
      // Computing it this way (rather than a separate running total) means
      // an extra litre added mid-day immediately shows up here.
      row.netQty += delivered
    }
    // Any delivered product outside the customer's standing subscription
    // entirely (rare, but possible via "Modify") still counts as net/extra.
    for (const item of items) {
      if (!customer.subscriptions.some((s) => s.product_id === item.product_id)) {
        const row = ensureRow(item.product_id)
        row.extraQty += item.quantity
        row.netQty += item.quantity
      }
    }
  }

  for (const row of rows.values()) {
    row.allottedQty = +row.allottedQty.toFixed(2)
    row.returnedQty = +row.returnedQty.toFixed(2)
    row.extraQty = +row.extraQty.toFixed(2)
    row.netQty = +row.netQty.toFixed(2)
  }

  return [...rows.values()].sort((a, b) => a.label.localeCompare(b.label))
}
