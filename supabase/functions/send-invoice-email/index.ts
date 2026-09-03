// Supabase Edge Function: send-invoice-email
//
// Sends one itemized bill by email via Resend (https://resend.com — free
// tier covers a small dairy vendor's monthly volume comfortably). The
// browser computes the bill (see src/lib/billing.ts — same logic used on
// screen) and sends the already-computed numbers here; this function's job
// is just to verify the caller actually owns this invoice, then format and
// send the email. It does NOT recompute billing server-side, so the emailed
// bill always matches exactly what the vendor saw before hitting send.
//
// Requires a Resend API key set as a secret:
//   supabase secrets set RESEND_API_KEY=re_xxxxxxxx
//   supabase secrets set RESEND_FROM_EMAIL="billing@yourdomain.com"
// RESEND_FROM_EMAIL must be on a domain you've verified with Resend —
// see https://resend.com/domains. Until you verify a domain, Resend's
// sandbox `onboarding@resend.dev` sender only delivers to your own
// Resend account email, which is fine for testing but not for real vendors.
//
// Deploy with: supabase functions deploy send-invoice-email

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface LineItem {
  label: string
  tag: string
  unit: string
  rate: number
  regularQty: number
  regularAmount: number
  extraQty: number
  extraAmount: number
}

interface Payload {
  invoiceId: string
  toEmail: string
  customerName: string
  periodLabel: string
  periodStart: string
  periodEnd: string
  lineItems: LineItem[]
  deliveryCharge: number
  skippedDays: number
  subtotal: number
  total: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
    const { data: userData, error: userErr } = await callerClient.auth.getUser()
    if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401)

    const { data: profile } = await callerClient.from('profiles').select('role, vendor_id').eq('id', userData.user.id).single()
    if (!profile || profile.role !== 'vendor') return json({ error: 'Only a vendor account can send bills' }, 403)

    const payload = (await req.json()) as Payload
    if (!payload.invoiceId || !payload.toEmail || !payload.lineItems) return json({ error: 'Missing required fields' }, 400)

    // Confirm this invoice actually belongs to the caller's own tenant —
    // without this, any authenticated vendor could email an arbitrary
    // invoiceId's data (which they supply themselves) to any address.
    const { data: invoice } = await callerClient.from('invoices').select('id, vendor_id').eq('id', payload.invoiceId).single()
    if (!invoice || invoice.vendor_id !== profile.vendor_id) return json({ error: 'Invoice not found' }, 404)

    const { data: vendor } = await callerClient.from('vendors').select('business_name').eq('id', profile.vendor_id).single()
    const businessName = vendor?.business_name ?? 'Your Dairy'

    const html = renderInvoiceEmail(businessName, payload)

    const sendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${businessName} <${RESEND_FROM_EMAIL}>`,
        to: [payload.toEmail],
        subject: `${businessName} — Bill for ${payload.periodLabel}`,
        html,
      }),
    })

    if (!sendRes.ok) {
      const errBody = await sendRes.text()
      return json({ error: `Resend error: ${errBody}` }, 502)
    }

    return json({ ok: true })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500)
  }
})

function renderInvoiceEmail(businessName: string, p: Payload): string {
  const rows = p.lineItems.map((li) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #eee;">${escapeHtml(li.label)} <span style="color:#888;font-family:monospace;font-size:12px;">(${escapeHtml(li.tag)})</span></td>
      <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${li.regularQty}${li.unit === 'litre' ? 'L' : ''}</td>
      <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;">₹${li.rate}</td>
      <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:600;">₹${li.regularAmount.toFixed(2)}</td>
    </tr>
    ${li.extraQty > 0 ? `
    <tr>
      <td style="padding:4px 0 8px 12px;border-bottom:1px solid #eee;color:#2F9E68;font-size:13px;">↳ Extra</td>
      <td style="padding:4px 0 8px 0;border-bottom:1px solid #eee;text-align:right;color:#2F9E68;font-size:13px;">${li.extraQty}${li.unit === 'litre' ? 'L' : ''}</td>
      <td style="padding:4px 0 8px 0;border-bottom:1px solid #eee;text-align:right;color:#2F9E68;font-size:13px;">₹${li.rate}</td>
      <td style="padding:4px 0 8px 0;border-bottom:1px solid #eee;text-align:right;color:#2F9E68;font-size:13px;font-weight:600;">₹${li.extraAmount.toFixed(2)}</td>
    </tr>` : ''}
  `).join('')

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#0B1F1A;">
    <h2 style="color:#175E9E;">${escapeHtml(businessName)}</h2>
    <p>Hi ${escapeHtml(p.customerName)}, here's your bill for <strong>${escapeHtml(p.periodLabel)}</strong> (${p.periodStart} to ${p.periodEnd}).</p>
    <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:14px;">
      <thead>
        <tr style="text-align:left;font-size:11px;text-transform:uppercase;color:#666;">
          <th style="padding-bottom:6px;">Product</th><th style="text-align:right;">Qty</th><th style="text-align:right;">Rate</th><th style="text-align:right;">Amount</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:16px;font-size:14px;">
      <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Items subtotal</span><span>₹${p.subtotal.toFixed(2)}</span></div>
      ${p.deliveryCharge > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Delivery charge</span><span>₹${p.deliveryCharge.toFixed(2)}</span></div>` : ''}
      ${p.skippedDays > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 0;color:#2F9E68;"><span>${p.skippedDays} day(s) skipped</span><span>not charged</span></div>` : ''}
      <div style="display:flex;justify-content:space-between;padding:10px 0;border-top:2px solid #175E9E;margin-top:8px;font-size:18px;font-weight:700;"><span>Total</span><span>₹${p.total.toFixed(2)}</span></div>
    </div>
    <p style="margin-top:24px;font-size:12px;color:#888;">Sent by ${escapeHtml(businessName)} via their delivery management app.</p>
  </div>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
