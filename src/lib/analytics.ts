import type { Company, Customer, DeliveryException, Invoice, Payment, Product } from '../types'
import { daysInclusive, resolveDay } from './attendance'
import { productFullLabel, productTag } from './productTag'
import { getCustomerLedger } from './ledger'

export interface DailyRevenuePoint {
  date: string
  revenue: number
}

export function getDailyRevenue(
  customers: Customer[], exceptions: DeliveryException[], products: Product[],
  startISO: string, endISO: string, todayISO: string
): DailyRevenuePoint[] {
  const active = customers.filter((c) => !c.is_paused)
  return daysInclusive(startISO, endISO)
    .filter((date) => date <= todayISO)
    .map((date) => {
      let revenue = 0
      for (const customer of active) {
        const { items } = resolveDay(customer, date, exceptions, products, todayISO)
        for (const item of items) revenue += item.quantity * item.price_at_delivery
      }
      return { date, revenue: +revenue.toFixed(2) }
    })
}

export interface ProductRevenuePoint {
  productId: string
  tag: string
  label: string
  revenue: number
  quantity: number
}

export function getProductRevenue(
  customers: Customer[], exceptions: DeliveryException[], products: Product[], companies: Company[],
  startISO: string, endISO: string, todayISO: string
): ProductRevenuePoint[] {
  const active = customers.filter((c) => !c.is_paused)
  const acc = new Map<string, { revenue: number; quantity: number }>()

  for (const date of daysInclusive(startISO, endISO)) {
    if (date > todayISO) continue
    for (const customer of active) {
      const { items } = resolveDay(customer, date, exceptions, products, todayISO)
      for (const item of items) {
        const entry = acc.get(item.product_id) ?? { revenue: 0, quantity: 0 }
        entry.revenue += item.quantity * item.price_at_delivery
        entry.quantity += item.quantity
        acc.set(item.product_id, entry)
      }
    }
  }

  return [...acc.entries()]
    .map(([productId, v]) => {
      const product = products.find((p) => p.id === productId)
      return {
        productId,
        tag: product ? productTag(product, companies) : '?',
        label: product ? productFullLabel(product, companies) : 'Unknown product',
        revenue: +v.revenue.toFixed(2),
        quantity: +v.quantity.toFixed(2),
      }
    })
    .sort((a, b) => b.revenue - a.revenue)
}

export interface AttendanceStats {
  presentDays: number
  absentDays: number
  totalDays: number
  rate: number // 0-100
}

export function getAttendanceStats(
  customers: Customer[], exceptions: DeliveryException[], products: Product[],
  startISO: string, endISO: string, todayISO: string
): AttendanceStats {
  const active = customers.filter((c) => !c.is_paused)
  let presentDays = 0
  let absentDays = 0

  for (const date of daysInclusive(startISO, endISO)) {
    if (date > todayISO) continue
    for (const customer of active) {
      const { status } = resolveDay(customer, date, exceptions, products, todayISO)
      if (status === 'delivered' || status === 'modified') presentDays += 1
      else if (status === 'skipped') absentDays += 1
    }
  }

  const totalDays = presentDays + absentDays
  return { presentDays, absentDays, totalDays, rate: totalDays > 0 ? +((presentDays / totalDays) * 100).toFixed(1) : 0 }
}

export function getOutstandingTotal(
  customers: Customer[], invoices: Invoice[], payments: Payment[],
  exceptions: DeliveryException[], products: Product[], companies: Company[],
  deliveryCharge: number, todayISO: string
): number {
  let total = 0
  for (const customer of customers) {
    const ledger = getCustomerLedger(customer, invoices, payments, exceptions, products, companies, deliveryCharge, todayISO)
    total += Math.max(0, ledger.pending)
  }
  return +total.toFixed(2)
}

export interface TopCustomerPoint {
  customerId: string
  name: string
  revenue: number
}

export function getTopCustomers(
  customers: Customer[], exceptions: DeliveryException[], products: Product[],
  startISO: string, endISO: string, todayISO: string, limit = 5
): TopCustomerPoint[] {
  const active = customers.filter((c) => !c.is_paused)
  const rows = active.map((customer) => {
    let revenue = 0
    for (const date of daysInclusive(startISO, endISO)) {
      if (date > todayISO) continue
      const { items } = resolveDay(customer, date, exceptions, products, todayISO)
      for (const item of items) revenue += item.quantity * item.price_at_delivery
    }
    return { customerId: customer.id, name: customer.name, revenue: +revenue.toFixed(2) }
  })
  return rows.sort((a, b) => b.revenue - a.revenue).slice(0, limit)
}
