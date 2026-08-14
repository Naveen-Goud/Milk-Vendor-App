import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  TenantData, Vendor, Customer, Product, Company, RouteRecord, DeliveryBoy,
  DeliveryException, DeliveryItem, Invoice, Payment, PaymentMethod, ProductUnit, ExceptionStatus,
} from '../types'

// Thin data-access layer: every function here is a direct, typed wrapper
// around a Supabase query. AppContext calls these and holds the results in
// React state as a client-side cache — it never talks to `supabase` directly
// itself, which keeps all the query/mapping logic in one place.

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message)
  if (result.data === null) throw new Error('No data returned')
  return result.data
}

export async function fetchVendor(db: SupabaseClient, vendorId: string): Promise<Vendor> {
  const res = await db.from('vendors').select('*').eq('id', vendorId).single()
  const row = unwrap(res)
  return {
    id: row.id, vendorCode: row.vendor_code, name: row.business_name, ownerName: row.owner_name,
    phone: row.phone ?? '', address: row.address ?? '', tagline: row.tagline ?? '', deliveryCharge: row.delivery_charge ?? 0,
  }
}

export async function updateVendor(db: SupabaseClient, vendorId: string, patch: Partial<Vendor>): Promise<void> {
  const dbPatch: Record<string, unknown> = {}
  if (patch.name !== undefined) dbPatch.business_name = patch.name
  if (patch.ownerName !== undefined) dbPatch.owner_name = patch.ownerName
  if (patch.phone !== undefined) dbPatch.phone = patch.phone
  if (patch.address !== undefined) dbPatch.address = patch.address
  if (patch.tagline !== undefined) dbPatch.tagline = patch.tagline
  if (patch.deliveryCharge !== undefined) dbPatch.delivery_charge = patch.deliveryCharge
  const res = await db.from('vendors').update(dbPatch).eq('id', vendorId)
  if (res.error) throw new Error(res.error.message)
}

export async function fetchTenantData(db: SupabaseClient, vendorId: string): Promise<TenantData> {
  const [companiesRes, productsRes, routesRes, boysRes, customersRes, exceptionsRes, invoicesRes, paymentsRes] = await Promise.all([
    db.from('companies').select('*').eq('vendor_id', vendorId),
    db.from('products').select('*').eq('vendor_id', vendorId),
    db.from('routes').select('*').eq('vendor_id', vendorId),
    db.from('profiles').select('id, full_name, phone, route_id').eq('vendor_id', vendorId).eq('role', 'delivery_boy'),
    db.from('customers').select('*, customer_subscriptions(product_id, default_qty)').eq('vendor_id', vendorId),
    db.from('delivery_exceptions').select('*, delivery_exception_items(product_id, quantity, price_at_delivery)').eq('vendor_id', vendorId),
    db.from('invoices').select('*').eq('vendor_id', vendorId),
    db.from('payments').select('*').eq('vendor_id', vendorId),
  ])

  for (const r of [companiesRes, productsRes, routesRes, boysRes, customersRes, exceptionsRes, invoicesRes, paymentsRes]) {
    if (r.error) throw new Error(r.error.message)
  }

  const companies: Company[] = (companiesRes.data ?? []).map((c) => ({ id: c.id, name: c.name, code: c.code }))

  const products: Product[] = (productsRes.data ?? []).map((p) => ({
    id: p.id, company_id: p.company_id, full_name: p.full_name, acronym: p.acronym,
    unit: p.unit as ProductUnit, price: Number(p.price), is_active: p.is_active,
  }))

  const routes: RouteRecord[] = (routesRes.data ?? []).map((r) => ({ id: r.id, name: r.name }))

  const deliveryBoys: DeliveryBoy[] = (boysRes.data ?? []).map((b) => ({
    id: b.id, name: b.full_name, phone: b.phone ?? '', route_id: b.route_id,
  }))

  const customers: Customer[] = (customersRes.data ?? []).map((c) => ({
    id: c.id, name: c.name, phone: c.phone ?? '', email: c.email ?? '', address: c.address ?? '',
    route_id: c.route_id, is_paused: c.is_paused,
    subscriptions: (c.customer_subscriptions ?? []).map((s: { product_id: string; default_qty: number }) => ({
      product_id: s.product_id, quantity: Number(s.default_qty),
    })),
  }))

  const exceptions: DeliveryException[] = (exceptionsRes.data ?? []).map((e) => ({
    id: e.id, customer_id: e.customer_id, date: e.date, status: e.status as ExceptionStatus,
    items: (e.delivery_exception_items ?? []).map((i: { product_id: string; quantity: number; price_at_delivery: number }) => ({
      product_id: i.product_id, quantity: Number(i.quantity), price_at_delivery: Number(i.price_at_delivery),
    })) as DeliveryItem[],
  }))

  const invoices: Invoice[] = (invoicesRes.data ?? []).map((i) => ({
    id: i.id, customer_id: i.customer_id, period_start: i.period_start, period_end: i.period_end,
    status: i.status, sent_via: i.sent_via, sent_at: i.sent_at,
  }))

  const payments: Payment[] = (paymentsRes.data ?? []).map((p) => ({
    id: p.id, customer_id: p.customer_id, amount: Number(p.amount), date: p.date, method: p.method as PaymentMethod, note: p.note ?? undefined,
  }))

  return { companies, products, routes, deliveryBoys, customers, exceptions, invoices, payments }
}

// ---- Companies -----------------------------------------------------------

export async function insertCompany(db: SupabaseClient, vendorId: string, name: string, code: string): Promise<Company> {
  const res = await db.from('companies').insert({ vendor_id: vendorId, name, code }).select().single()
  const row = unwrap(res)
  return { id: row.id, name: row.name, code: row.code }
}

export async function deleteCompany(db: SupabaseClient, id: string): Promise<void> {
  const res = await db.from('companies').delete().eq('id', id)
  if (res.error) throw new Error(res.error.message)
}

// ---- Products --------------------------------------------------------------

export async function insertProduct(db: SupabaseClient, vendorId: string, product: Omit<Product, 'id'>): Promise<Product> {
  const res = await db.from('products').insert({
    vendor_id: vendorId, company_id: product.company_id, full_name: product.full_name,
    acronym: product.acronym, unit: product.unit, price: product.price, is_active: product.is_active,
  }).select().single()
  const row = unwrap(res)
  return { id: row.id, company_id: row.company_id, full_name: row.full_name, acronym: row.acronym, unit: row.unit, price: Number(row.price), is_active: row.is_active }
}

export async function updateProduct(db: SupabaseClient, id: string, patch: Partial<Product>): Promise<void> {
  const res = await db.from('products').update(patch).eq('id', id)
  if (res.error) throw new Error(res.error.message)
}

export async function deleteProduct(db: SupabaseClient, id: string): Promise<void> {
  const res = await db.from('products').delete().eq('id', id)
  if (res.error) throw new Error(res.error.message)
}

// ---- Customers ----------------------------------------------------------------

export async function insertCustomer(db: SupabaseClient, vendorId: string, customer: Omit<Customer, 'id'>): Promise<Customer> {
  const res = await db.from('customers').insert({
    vendor_id: vendorId, name: customer.name, phone: customer.phone, email: customer.email,
    address: customer.address, route_id: customer.route_id, is_paused: customer.is_paused,
  }).select().single()
  const row = unwrap(res)

  if (customer.subscriptions.length > 0) {
    const subRes = await db.from('customer_subscriptions').insert(
      customer.subscriptions.map((s) => ({ vendor_id: vendorId, customer_id: row.id, product_id: s.product_id, default_qty: s.quantity }))
    )
    if (subRes.error) throw new Error(subRes.error.message)
  }

  return { ...customer, id: row.id }
}

export async function updateCustomer(db: SupabaseClient, vendorId: string, id: string, patch: Partial<Customer>): Promise<void> {
  const { subscriptions, ...rest } = patch
  if (Object.keys(rest).length > 0) {
    const res = await db.from('customers').update(rest).eq('id', id)
    if (res.error) throw new Error(res.error.message)
  }
  if (subscriptions !== undefined) {
    const delRes = await db.from('customer_subscriptions').delete().eq('customer_id', id)
    if (delRes.error) throw new Error(delRes.error.message)
    if (subscriptions.length > 0) {
      const insRes = await db.from('customer_subscriptions').insert(
        subscriptions.map((s) => ({ vendor_id: vendorId, customer_id: id, product_id: s.product_id, default_qty: s.quantity }))
      )
      if (insRes.error) throw new Error(insRes.error.message)
    }
  }
}

export async function deleteCustomer(db: SupabaseClient, id: string): Promise<void> {
  const res = await db.from('customers').delete().eq('id', id)
  if (res.error) throw new Error(res.error.message)
}

// ---- Attendance exceptions -------------------------------------------------------

export async function upsertException(
  db: SupabaseClient, vendorId: string, customerId: string, date: string, status: ExceptionStatus, items: DeliveryItem[]
): Promise<DeliveryException> {
  const res = await db.from('delivery_exceptions')
    .upsert({ vendor_id: vendorId, customer_id: customerId, date, status }, { onConflict: 'customer_id,date' })
    .select().single()
  const row = unwrap(res)

  const delRes = await db.from('delivery_exception_items').delete().eq('exception_id', row.id)
  if (delRes.error) throw new Error(delRes.error.message)

  if (items.length > 0) {
    const insRes = await db.from('delivery_exception_items').insert(
      items.map((i) => ({ vendor_id: vendorId, exception_id: row.id, product_id: i.product_id, quantity: i.quantity, price_at_delivery: i.price_at_delivery }))
    )
    if (insRes.error) throw new Error(insRes.error.message)
  }

  return { id: row.id, customer_id: customerId, date, status, items }
}

export async function deleteException(db: SupabaseClient, customerId: string, date: string): Promise<void> {
  const res = await db.from('delivery_exceptions').delete().eq('customer_id', customerId).eq('date', date)
  if (res.error) throw new Error(res.error.message)
}

// ---- Invoices & payments -----------------------------------------------------------

export async function updateInvoiceStatus(
  db: SupabaseClient, id: string, patch: { status: Invoice['status']; sent_via?: Invoice['sent_via']; sent_at?: string | null }
): Promise<void> {
  const res = await db.from('invoices').update(patch).eq('id', id)
  if (res.error) throw new Error(res.error.message)
}

export async function insertPayment(
  db: SupabaseClient, vendorId: string, customerId: string, amount: number, date: string, method: PaymentMethod, note?: string
): Promise<Payment> {
  const res = await db.from('payments').insert({ vendor_id: vendorId, customer_id: customerId, amount, date, method, note }).select().single()
  const row = unwrap(res)
  return { id: row.id, customer_id: customerId, amount, date, method, note }
}
