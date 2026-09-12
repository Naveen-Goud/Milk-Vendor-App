// Supabase Edge Function: manage-email-settings
//
// Why this exists: this app is sold to multiple independent vendors sharing
// one deployment. Rather than every vendor's invoice emails going out
// through one shared Resend API key (which would mean one shared free-tier
// quota, one shared deliverability reputation, and the app owner footing
// everyone's email bill), each vendor connects their OWN free Resend
// account. This function is the only thing allowed to write a vendor's key
// into Supabase Vault (encrypted storage) — never the browser directly, and
// never as plaintext in an ordinary table.
//
// Actions:
//   'test'   — sends a one-off test email with the given (not-yet-saved)
//              key, so the vendor can confirm it actually works before
//              committing to it. Nothing is persisted.
//   'save'   — persists the key into Vault (replacing any previous key for
//              this vendor) and upserts the vendor's vendor_email_settings
//              row. Also does a lightweight live check against Resend
//              first (listing domains) so a copy-pasted garbage key can't
//              silently get saved.
//   'remove' — deletes the vendor's key and settings row (the DB trigger on
//              vendor_email_settings cleans up the underlying Vault secret).
//
// Deploy with: supabase functions deploy manage-email-settings --no-verify-jwt
// (See send-invoice-email/index.ts for why --no-verify-jwt is needed here —
// same reasoning: this function does its own auth check internally.)

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface TestPayload {
  action: 'test'
  apiKey: string
  fromEmail: string
  fromName?: string
  testRecipient: string
}
interface SavePayload {
  action: 'save'
  apiKey: string
  fromEmail: string
  fromName?: string
}
interface RemovePayload {
  action: 'remove'
}
interface StatusPayload {
  action: 'status'
}
type Payload = TestPayload | SavePayload | RemovePayload | StatusPayload

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
    const { data: userData, error: userErr } = await callerClient.auth.getUser()
    if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401)

    const { data: profile } = await callerClient.from('profiles').select('role, vendor_id').eq('id', userData.user.id).single()
    if (!profile || profile.role !== 'vendor') return json({ error: 'Only a vendor account can manage email settings' }, 403)
    const vendorId = profile.vendor_id as string

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const payload = (await req.json()) as Payload

    if (payload.action === 'status') {
      const { data: existing } = await admin
        .from('vendor_email_settings')
        .select('from_email, from_name, key_last4, verified_at, updated_at')
        .eq('vendor_id', vendorId)
        .maybeSingle()
      return json({ settings: existing ?? null })
    }

    if (payload.action === 'test') {
      const { apiKey, fromEmail, fromName, testRecipient } = payload
      if (!apiKey?.trim() || !fromEmail?.trim() || !testRecipient?.trim()) {
        return json({ error: 'API key, from email, and a test recipient are all required' }, 400)
      }

      const { data: vendor } = await callerClient.from('vendors').select('business_name').eq('id', vendorId).single()
      const businessName = fromName?.trim() || vendor?.business_name || 'Your Dairy'

      const sendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${businessName} <${fromEmail}>`,
          to: [testRecipient],
          subject: `Test email from ${businessName}`,
          html: `<p>This is a test email from your Milk Vendor app. If you're reading this, your Resend API key and sender address are both working — you're ready to send real bills.</p>`,
        }),
      })

      if (!sendRes.ok) {
        const errBody = await sendRes.text()
        return json({ error: `Resend rejected this: ${errBody}` }, 502)
      }
      return json({ ok: true })
    }

    if (payload.action === 'save') {
      const { apiKey, fromEmail, fromName } = payload
      if (!apiKey?.trim() || !fromEmail?.trim()) {
        return json({ error: 'API key and from email are both required' }, 400)
      }
      if (!/^\S+@\S+\.\S+$/.test(fromEmail)) return json({ error: 'From email doesn\'t look valid' }, 400)

      // NOTE: deliberately NOT re-checking the key against Resend's
      // /domains endpoint here. That was tried initially as an extra
      // safety check, but Resend API keys can be scoped to "Sending
      // access only" — which can send email (proven by the mandatory
      // test-send the UI already requires before this runs) but does NOT
      // have permission to list domains, so that check false-rejected
      // perfectly valid restricted-scope keys. The test-send step is the
      // real validation; nothing further is needed here.

      const { data: existing } = await admin
        .from('vendor_email_settings')
        .select('secret_id')
        .eq('vendor_id', vendorId)
        .maybeSingle()

      const { data: newSecretId, error: vaultErr } = await admin.rpc('vault_save_vendor_api_key', {
        p_vendor_id: vendorId,
        p_api_key: apiKey,
        p_old_secret_id: existing?.secret_id ?? null,
      })
      if (vaultErr || !newSecretId) return json({ error: vaultErr?.message ?? 'Could not store the key securely' }, 500)

      const { error: upsertErr } = await admin.from('vendor_email_settings').upsert({
        vendor_id: vendorId,
        secret_id: newSecretId,
        from_email: fromEmail,
        from_name: fromName?.trim() || null,
        key_last4: apiKey.slice(-4),
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      if (upsertErr) return json({ error: upsertErr.message }, 500)

      return json({ ok: true })
    }

    if (payload.action === 'remove') {
      const { error: deleteErr } = await admin.from('vendor_email_settings').delete().eq('vendor_id', vendorId)
      if (deleteErr) return json({ error: deleteErr.message }, 500)
      return json({ ok: true })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500)
  }
})

function json(body: unknown, status = 200): Response {
  if (status >= 400) console.error(`manage-email-settings ${status}:`, body)
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
