// Delivery boys log in with just a phone number + PIN, not a real email —
// but Supabase Auth needs *something* email-shaped for password auth. We
// synthesize one from their phone plus the vendor's short code, so it's
// unique across the whole shared database without ever being a real inbox.
// This same format must be used consistently by both the Edge Function
// (which creates the account) and the login screen (which signs into it).

export function syntheticDeliveryBoyEmail(phone: string, vendorCode: string): string {
  const cleanPhone = phone.replace(/\D/g, '')
  return `db.${cleanPhone}@${vendorCode.toLowerCase()}.deliveries.local`
}

export function generateVendorCode(businessName: string): string {
  const base = businessName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6) || 'VENDOR'
  const suffix = Math.random().toString(36).slice(2, 4).toUpperCase()
  return `${base}${suffix}`
}
