// Domain model. Mirrors supabase/schema.sql — keep these in sync if the
// schema changes.

export type Role = 'vendor' | 'delivery_boy'

export interface CurrentUser {
  id: string
  role: Role
  vendorId: string
  deliveryBoyId?: string // === id when role is 'delivery_boy'; kept as a separate field so pages can read it without a role check
}

export interface Vendor {
  id: string
  vendorCode: string
  name: string
  ownerName: string
  phone: string
  address: string
  tagline: string
  deliveryCharge: number
}

export interface Company {
  id: string
  name: string
  code: string
}

export type ProductUnit = 'litre' | 'packet' | 'kg'

export interface Product {
  id: string
  company_id: string
  full_name: string
  acronym: string
  unit: ProductUnit
  price: number
  is_active: boolean
}

export interface RouteRecord {
  id: string
  name: string
}

// Note: no `pin` field here — a delivery boy's PIN is their Supabase Auth
// password, which is never readable back from the client. Setting or
// resetting it goes through the manage-delivery-boy Edge Function.
export interface DeliveryBoy {
  id: string
  name: string
  phone: string
  route_id: string
}

export interface Subscription {
  product_id: string
  quantity: number
}

export interface Customer {
  id: string
  name: string
  phone: string
  email: string
  address: string
  route_id: string | null
  is_paused: boolean
  createdAt: string // ISO yyyy-mm-dd — days before this were never "their" day, so the calendar shouldn't show them as present
  subscriptions: Subscription[]
}

export interface DeliveryItem {
  product_id: string
  quantity: number
  price_at_delivery: number
}

export type ExceptionStatus = 'skipped' | 'modified'

// Attendance is "default present": a customer is assumed delivered-as-usual
// every active day. Only deviations are ever stored.
export interface DeliveryException {
  id: string
  customer_id: string
  date: string // ISO yyyy-mm-dd
  status: ExceptionStatus
  items: DeliveryItem[] // empty for 'skipped'
}

export type DayStatus = 'delivered' | 'modified' | 'skipped' | 'upcoming' | 'inactive'

export interface DayResolution {
  status: DayStatus
  items: DeliveryItem[]
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid'
export type NotificationChannel = 'email' | 'whatsapp' | 'sms'

export interface Invoice {
  id: string
  customer_id: string
  period_start: string
  period_end: string
  status: InvoiceStatus
  sent_via: NotificationChannel | null
  sent_at: string | null
}

export type PaymentMethod = 'cash' | 'upi' | 'other'

export interface Payment {
  id: string
  customer_id: string
  amount: number
  date: string
  method: PaymentMethod
  note?: string
}

// All the vendor-scoped operational data for the signed-in tenant. Fetched
// from Supabase once auth resolves — see AppContext.
export interface TenantData {
  companies: Company[]
  products: Product[]
  routes: RouteRecord[]
  deliveryBoys: DeliveryBoy[]
  customers: Customer[]
  exceptions: DeliveryException[]
  invoices: Invoice[]
  payments: Payment[]
}

// ---- Billing ----------------------------------------------------------

export interface InvoiceLineItem {
  productId: string
  label: string
  tag: string
  unit: ProductUnit
  rate: number
  regularQty: number
  regularAmount: number
  extraQty: number
  extraAmount: number
}

export interface ComputedInvoice {
  customer: Customer
  periodStart: string
  periodEnd: string
  deliveredDays: number
  skippedDays: number
  lineItems: InvoiceLineItem[]
  deliveryCharge: number
  cuttingAmount: number
  subtotal: number
  total: number
}

// ---- Stock / milk allocation -------------------------------------------

export interface StockRow {
  productId: string
  label: string
  tag: string
  unit: ProductUnit
  allottedQty: number
  returnedQty: number
  extraQty: number
  netQty: number
}

// ---- Customer payment ledger --------------------------------------------

export interface CustomerLedger {
  billed: number
  paid: number
  pending: number
}

// ---- Vendor's own email sending setup (BYOK) -----------------------------
// The vendor's actual Resend API key is never present here or anywhere on
// the client — it lives encrypted in Supabase Vault. This is just the
// display-safe status of that connection.
export interface EmailSettings {
  fromEmail: string
  fromName: string | null
  keyLast4: string
  verifiedAt: string | null
  updatedAt: string
}
