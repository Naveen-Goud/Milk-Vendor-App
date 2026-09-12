// Supabase Edge Function: monthly-billing-run
//
// Meant to be triggered on a schedule (see the pg_cron SQL in schema.sql's
// comments, or the README) — NOT called from the browser. For every vendor,
// for every active customer, it creates a 'draft' invoice for last calendar
// month if one doesn't already exist, computes the bill, emails it via
// Resend, and marks it 'sent'.
//
// BYOK: each vendor sends through their OWN Resend key (see
// supabase/functions/manage-email-settings), not a shared platform key.
// This function looks up each vendor's key once per run, before looping
// over their customers. A vendor who hasn't connected a key yet simply has
// all of that period's invoices left as 'draft' (counted under `skipped`)
// so nothing is lost — they can send manually once they connect one.
//
// This duplicates the day-resolution and billing math from
// src/lib/attendance.ts and src/lib/billing.ts in Deno, since Edge
// Functions run in a separate runtime from the Vite app and can't share
// that TypeScript directly. If you change the attendance/billing logic on
// the client, mirror the change here too — see the comments marking each
// piece.
//
// Auth: since this has no logged-in user, it checks a shared secret header
// instead of a JWT. Set it as a secret and put the same value in your
// pg_cron schedule's Authorization header:
//   supabase secrets set CRON_SECRET=$(openssl rand -hex 24)
//
// Deploy with: supabase functions deploy monthly-billing-run --no-verify-jwt

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')!

interface Product { id: string; company_id: string; full_name: string; acronym: string; unit: string; price: number }
interface Company { id: string; name: string; code: string }
interface Subscription { product_id: string; quantity: number }
interface Customer { id: string; name: string; email: string | null; is_paused: boolean; created_at: string }
interface ExceptionItem { product_id: string; quantity: number; price_at_delivery: number }
interface Exception { customer_id: string; date: string; status: 'skipped' | 'modified'; items: ExceptionItem[] }

// --- Mirrors resolveDay() in src/lib/attendance.ts ---
function resolveDay(customer: Customer, date: string, exceptions: Exception[], subs: Subscription[], products: Product[], todayISO: string) {
  if (customer.is_paused) return { status: 'inactive' as const, items: [] as ExceptionItem[] }
  if (date < customer.created_at.slice(0, 10)) return { status: 'inactive' as const, items: [] }
  const exception = exceptions.find((e) => e.customer_id === customer.id && e.date === date)
  if (exception) return { status: exception.status, items: exception.items }
  if (date > todayISO) return { status: 'upcoming' as const, items: [] }
  const items = subs.map((s) => ({ product_id: s.product_id, quantity: s.quantity, price_at_delivery: products.find((p) => p.id === s.product_id)?.price ?? 0 }))
  return { status: 'delivered' as const, items }
}

function daysInclusive(startISO: string, endISO: string): string[] {
  const out: string[] = []
  const d = new Date(startISO + 'T00:00:00Z')
  const end = new Date(endISO + 'T00:00:00Z')
  while (d <= end) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1) }
  return out
}

function lastMonthRange(todayISO: string): { start: string; end: string; label: string } {
  const d = new Date(todayISO + 'T00:00:00Z')
  const firstOfThisMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
  const lastOfPrevMonth = new Date(firstOfThisMonth.getTime() - 86400000)
  const firstOfPrevMonth = new Date(Date.UTC(lastOfPrevMonth.getUTCFullYear(), lastOfPrevMonth.getUTCMonth(), 1))
  const label = firstOfPrevMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return { start: firstOfPrevMonth.toISOString().slice(0, 10), end: lastOfPrevMonth.toISOString().slice(0, 10), label }
}

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const todayISO = new Date().toISOString().slice(0, 10)
  const { start, end, label } = lastMonthRange(todayISO)

  const { data: vendors, error: vendorsErr } = await admin.from('vendors').select('id, business_name, delivery_charge')
  if (vendorsErr) return new Response(JSON.stringify({ error: vendorsErr.message }), { status: 500 })

  const results: { vendor: string; sent: number; skipped: number; failed: number }[] = []

  for (const vendor of vendors ?? []) {
    let sent = 0, skipped = 0, failed = 0

    // BYOK lookup: this vendor's own Resend key + from-address, decrypted
    // from Vault. If they haven't connected one, every invoice this run
    // generates for them stays 'draft' — see the `if (!emailAuth)` check
    // in the per-customer loop below.
    const { data: emailSettingsRow } = await admin
      .from('vendor_email_settings')
      .select('secret_id, from_email, from_name')
      .eq('vendor_id', vendor.id)
      .maybeSingle()
    let emailAuth: { apiKey: string; fromEmail: string; fromName: string } | null = null
    if (emailSettingsRow) {
      const { data: apiKey } = await admin.rpc('vault_get_secret', { p_secret_id: emailSettingsRow.secret_id })
      if (apiKey) {
        emailAuth = { apiKey, fromEmail: emailSettingsRow.from_email, fromName: emailSettingsRow.from_name || vendor.business_name }
      }
    }

    const [customersRes, productsRes, companiesRes, exceptionsRes, existingInvoicesRes] = await Promise.all([
      admin.from('customers').select('id, name, email, is_paused, created_at, customer_subscriptions(product_id, default_qty)').eq('vendor_id', vendor.id).eq('is_paused', false),
      admin.from('products').select('*').eq('vendor_id', vendor.id),
      admin.from('companies').select('*').eq('vendor_id', vendor.id),
      admin.from('delivery_exceptions').select('*, delivery_exception_items(product_id, quantity, price_at_delivery)').eq('vendor_id', vendor.id).gte('date', start).lte('date', end),
      admin.from('invoices').select('customer_id').eq('vendor_id', vendor.id).eq('period_start', start).eq('period_end', end),
    ])

    const products: Product[] = productsRes.data ?? []
    const companies: Company[] = companiesRes.data ?? []
    const exceptions: Exception[] = (exceptionsRes.data ?? []).map((e) => ({
      customer_id: e.customer_id, date: e.date, status: e.status, items: e.delivery_exception_items ?? [],
    }))
    const alreadyInvoiced = new Set((existingInvoicesRes.data ?? []).map((i) => i.customer_id))

    for (const row of customersRes.data ?? []) {
      const customer: Customer = { id: row.id, name: row.name, email: row.email, is_paused: row.is_paused, created_at: row.created_at }
      const subs: Subscription[] = (row.customer_subscriptions ?? []).map((s: { product_id: string; default_qty: number }) => ({ product_id: s.product_id, quantity: s.default_qty }))

      if (alreadyInvoiced.has(customer.id) || subs.length === 0) { skipped++; continue }

      // --- Mirrors computeInvoice() in src/lib/billing.ts ---
      const baseline = new Map(subs.map((s) => [s.product_id, s.quantity]))
      const acc = new Map<string, { regularQty: number; regularAmount: number; extraQty: number; extraAmount: number; rate: number }>()
      let deliveredDays = 0, skippedDays = 0

      for (const date of daysInclusive(start, end)) {
        const { status, items } = resolveDay(customer, date, exceptions, subs, products, todayISO)
        if (status === 'inactive' || status === 'upcoming') continue
        if (status === 'skipped') { skippedDays++; continue }
        deliveredDays++
        for (const item of items) {
          const rate = item.price_at_delivery || products.find((p) => p.id === item.product_id)?.price || 0
          const base = baseline.get(item.product_id) ?? 0
          const regularQty = Math.min(item.quantity, base)
          const extraQty = Math.max(0, item.quantity - base)
          const entry = acc.get(item.product_id) ?? { regularQty: 0, regularAmount: 0, extraQty: 0, extraAmount: 0, rate }
          entry.regularQty += regularQty; entry.regularAmount += regularQty * rate
          entry.extraQty += extraQty; entry.extraAmount += extraQty * rate
          entry.rate = rate
          acc.set(item.product_id, entry)
        }
      }

      const lineItems = [...acc.entries()].map(([productId, v]) => {
        const product = products.find((p) => p.id === productId)
        const company = companies.find((c) => c.id === product?.company_id)
        return {
          label: `${company ? company.name + ' ' : ''}${product?.full_name ?? ''}`,
          tag: `${company?.code ?? ''}${product?.acronym ?? ''}`,
          unit: product?.unit ?? 'litre',
          rate: v.rate, regularQty: +v.regularQty.toFixed(2), regularAmount: +v.regularAmount.toFixed(2),
          extraQty: +v.extraQty.toFixed(2), extraAmount: +v.extraAmount.toFixed(2),
        }
      })
      const subtotal = +lineItems.reduce((sum, li) => sum + li.regularAmount + li.extraAmount, 0).toFixed(2)
      const deliveryCharge = Number(vendor.delivery_charge) || 0
      const total = +(subtotal + deliveryCharge).toFixed(2)

      if (total <= 0) { skipped++; continue } // nothing delivered this period — no bill to send

      const { data: invoice, error: invErr } = await admin.from('invoices').insert({
        vendor_id: vendor.id, customer_id: customer.id, period_start: start, period_end: end, status: 'draft',
      }).select().single()
      if (invErr || !invoice) { failed++; continue }

      if (!customer.email) { skipped++; continue } // nothing to email — left as a draft for the vendor to handle manually
      if (!emailAuth) { skipped++; continue } // vendor hasn't connected their own Resend key yet — left as a draft

      try {
        const html = renderInvoiceEmail(vendor.business_name, {
          customerName: customer.name, periodLabel: label, periodStart: start, periodEnd: end,
          lineItems, deliveryCharge, skippedDays, subtotal, total,
        })
        const sendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${emailAuth.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: `${emailAuth.fromName} <${emailAuth.fromEmail}>`, to: [customer.email], subject: `${vendor.business_name} — Bill for ${label}`, html }),
        })
        if (!sendRes.ok) throw new Error(await sendRes.text())
        await admin.from('invoices').update({ status: 'sent', sent_via: 'email', sent_at: new Date().toISOString() }).eq('id', invoice.id)
        sent++
      } catch {
        failed++ // invoice stays 'draft' — vendor can retry manually from the Billing screen
      }
    }

    results.push({ vendor: vendor.business_name, sent, skipped, failed })
  }

  return new Response(JSON.stringify({ period: { start, end, label }, results }), { headers: { 'Content-Type': 'application/json' } })
})

function renderInvoiceEmail(businessName: string, p: {
  customerName: string; periodLabel: string; periodStart: string; periodEnd: string
  lineItems: { label: string; tag: string; unit: string; rate: number; regularQty: number; regularAmount: number; extraQty: number; extraAmount: number }[]
  deliveryCharge: number; skippedDays: number; subtotal: number; total: number
}): string {
  const rows = p.lineItems.map((li) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #eee;">${escapeHtml(li.label)} <span style="color:#888;font-family:monospace;font-size:12px;">(${escapeHtml(li.tag)})</span></td>
      <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${li.regularQty}${li.unit === 'litre' ? 'L' : ''}</td>
      <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;">₹${li.rate}</td>
      <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:600;">₹${li.regularAmount.toFixed(2)}</td>
    </tr>
    ${li.extraQty > 0 ? `<tr><td style="padding:4px 0 8px 12px;color:#2F9E68;font-size:13px;">↳ Extra</td><td style="text-align:right;color:#2F9E68;font-size:13px;">${li.extraQty}${li.unit === 'litre' ? 'L' : ''}</td><td style="text-align:right;color:#2F9E68;font-size:13px;">₹${li.rate}</td><td style="text-align:right;color:#2F9E68;font-size:13px;font-weight:600;">₹${li.extraAmount.toFixed(2)}</td></tr>` : ''}
  `).join('')

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#0B1F1A;">
    <h2 style="color:#175E9E;">${escapeHtml(businessName)}</h2>
    <p>Hi ${escapeHtml(p.customerName)}, here's your bill for <strong>${escapeHtml(p.periodLabel)}</strong> (${p.periodStart} to ${p.periodEnd}).</p>
    <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:14px;">
      <thead><tr style="text-align:left;font-size:11px;text-transform:uppercase;color:#666;"><th>Product</th><th style="text-align:right;">Qty</th><th style="text-align:right;">Rate</th><th style="text-align:right;">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:16px;font-size:14px;">
      <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Items subtotal</span><span>₹${p.subtotal.toFixed(2)}</span></div>
      ${p.deliveryCharge > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Delivery charge</span><span>₹${p.deliveryCharge.toFixed(2)}</span></div>` : ''}
      ${p.skippedDays > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 0;color:#2F9E68;"><span>${p.skippedDays} day(s) skipped</span><span>not charged</span></div>` : ''}
      <div style="display:flex;justify-content:space-between;padding:10px 0;border-top:2px solid #175E9E;margin-top:8px;font-size:18px;font-weight:700;"><span>Total</span><span>₹${p.total.toFixed(2)}</span></div>
    </div>
    <p style="margin-top:24px;font-size:12px;color:#888;">Sent automatically by ${escapeHtml(businessName)}'s delivery management app.</p>
  </div>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
