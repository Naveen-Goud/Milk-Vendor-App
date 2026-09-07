// Supabase Edge Function: manage-delivery-boy
//
// Why this exists: delivery boys log in with just a PIN, not a real email.
// Creating or resetting their Supabase Auth account requires the
// service-role key (to set a password and mark the account pre-confirmed
// without ever sending a real confirmation email) — that key must NEVER be
// shipped to the browser. This function runs on Supabase's servers, reads
// the service-role key from its own environment (provided automatically by
// Supabase, no manual secret needed), and is invoked by the vendor's
// authenticated client via `supabase.functions.invoke('manage-delivery-boy', ...)`.
//
// Deploy with: supabase functions deploy manage-delivery-boy --no-verify-jwt
//
// The --no-verify-jwt flag matters: without it, Supabase's platform-level
// gateway checks the JWT before this function's own code runs, which can
// mishandle the browser's CORS preflight and show up as a confusing CORS
// error even though the real cause is the platform layer. This function
// already verifies the caller itself (see callerClient.auth.getUser() +
// the vendor-role check below), so the platform check is redundant here.
//
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected
// automatically into every Edge Function's environment by Supabase — you do
// not need to set these as secrets yourself.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface CreatePayload {
  action: 'create'
  name: string
  phone: string
  pin: string
  routeName: string
}

interface UpdatePayload {
  action: 'update'
  boyId: string
  name: string
  phone: string
  pin?: string // omit to leave the PIN unchanged
  routeName: string
}

interface DeletePayload {
  action: 'delete'
  boyId: string
}

type Payload = CreatePayload | UpdatePayload | DeletePayload

function syntheticEmail(phone: string, vendorCode: string): string {
  const cleanPhone = phone.replace(/\D/g, '')
  return `db.${cleanPhone}@${vendorCode.toLowerCase()}.deliveries.local`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    // Client scoped to the CALLER's own JWT — used only to verify who's
    // asking and that they're actually a vendor for their own tenant.
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await callerClient.auth.getUser()
    if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401)

    const { data: profile, error: profileErr } = await callerClient
      .from('profiles')
      .select('role, vendor_id')
      .eq('id', userData.user.id)
      .single()
    if (profileErr || !profile || profile.role !== 'vendor') {
      return json({ error: 'Only a vendor account can manage delivery boys' }, 403)
    }
    const vendorId = profile.vendor_id as string

    const { data: vendor } = await callerClient.from('vendors').select('vendor_code').eq('id', vendorId).single()
    if (!vendor) return json({ error: 'Vendor not found' }, 404)

    // Admin client — service role, bypasses RLS entirely. Only ever used
    // for the specific auth-admin and cross-tenant-safe operations below,
    // never to read/write arbitrary data.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const payload = (await req.json()) as Payload

    if (payload.action === 'create') {
      const { name, phone, pin, routeName } = payload
      if (!name?.trim() || !phone?.trim() || !/^\d{4,6}$/.test(pin) || !routeName?.trim()) {
        return json({ error: 'Missing or invalid fields' }, 400)
      }
      const email = syntheticEmail(phone, vendor.vendor_code as string)

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email, password: pin, email_confirm: true, // pre-confirmed: no real inbox exists to confirm from
      })
      if (createErr || !created.user) return json({ error: createErr?.message ?? 'Could not create account' }, 400)

      const { data: route, error: routeErr } = await admin
        .from('routes').insert({ vendor_id: vendorId, name: routeName }).select().single()
      if (routeErr || !route) {
        await admin.auth.admin.deleteUser(created.user.id) // roll back the auth account
        return json({ error: routeErr?.message ?? 'Could not create route' }, 400)
      }

      const { error: profileInsertErr } = await admin.from('profiles').insert({
        id: created.user.id, vendor_id: vendorId, role: 'delivery_boy', full_name: name, phone, route_id: route.id,
      })
      if (profileInsertErr) {
        await admin.auth.admin.deleteUser(created.user.id)
        await admin.from('routes').delete().eq('id', route.id)
        return json({ error: profileInsertErr.message }, 400)
      }

      await admin.from('routes').update({ delivery_boy_id: created.user.id }).eq('id', route.id)

      return json({ boyId: created.user.id, routeId: route.id })
    }

    if (payload.action === 'update') {
      const { boyId, name, phone, pin, routeName } = payload
      const { data: existingProfile } = await admin.from('profiles').select('vendor_id, route_id').eq('id', boyId).single()
      if (!existingProfile || existingProfile.vendor_id !== vendorId) return json({ error: 'Not found' }, 404)

      await admin.from('profiles').update({ full_name: name, phone }).eq('id', boyId)
      if (existingProfile.route_id) await admin.from('routes').update({ name: routeName }).eq('id', existingProfile.route_id)
      if (pin) {
        const { error: pwErr } = await admin.auth.admin.updateUserById(boyId, { password: pin })
        if (pwErr) return json({ error: pwErr.message }, 400)
      }
      return json({ ok: true })
    }

    if (payload.action === 'delete') {
      const { boyId } = payload
      const { data: existingProfile } = await admin.from('profiles').select('vendor_id, route_id').eq('id', boyId).single()
      if (!existingProfile || existingProfile.vendor_id !== vendorId) return json({ error: 'Not found' }, 404)

      if (existingProfile.route_id) await admin.from('routes').delete().eq('id', existingProfile.route_id)
      await admin.from('profiles').delete().eq('id', boyId)
      await admin.auth.admin.deleteUser(boyId)
      return json({ ok: true })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500)
  }
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
