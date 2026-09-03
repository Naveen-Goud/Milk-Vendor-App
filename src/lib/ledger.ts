import type { Company, Customer, CustomerLedger, DeliveryException, Invoice, Payment, Product } from '../types'
import { computeInvoice } from './billing'

/**
 * A customer's running account: everything they've ever been billed (across
 * every invoice period on record) minus everything they've actually paid.
 * "Billed" is always recomputed live from delivery history via
 * computeInvoice — never read from a stored total — so it can never drift.
 */
export function getCustomerLedger(
  customer: Customer,
  invoices: Invoice[],
  payments: Payment[],
  exceptions: DeliveryException[],
  products: Product[],
  companies: Company[],
  deliveryCharge: number,
  todayISO: string
): CustomerLedger {
  const customerInvoices = invoices.filter((inv) => inv.customer_id === customer.id)

  const billed = customerInvoices.reduce((sum, inv) => {
    const bill = computeInvoice({
      customer, exceptions, products, companies,
      periodStart: inv.period_start, periodEnd: inv.period_end,
      deliveryCharge, todayISO,
    })
    return sum + bill.total
  }, 0)

  const paid = payments
    .filter((p) => p.customer_id === customer.id)
    .reduce((sum, p) => sum + p.amount, 0)

  return {
    billed: +billed.toFixed(2),
    paid: +paid.toFixed(2),
    pending: +(billed - paid).toFixed(2),
  }
}
