import type { ComputedInvoice } from '../types'
import { unitLabel } from './unitLabel'

// Zero-cost, zero-setup WhatsApp sending via a wa.me click-to-chat link —
// no Meta Business API app, no phone number verification, no message
// template approval process. The tradeoff: it's not fully automated — it
// opens WhatsApp with the message pre-filled and the vendor taps Send
// themselves. That's a real limitation, but it works today with nothing to
// configure, unlike the email path (which needs Resend + a verified
// domain) or the WhatsApp Cloud API (which needs Meta Business approval
// and is a genuinely separate, bigger project — see README).

/** Normalizes an Indian phone number to the wa.me-required format:
 * digits only, with the country code. Assumes +91 (India) if a 10-digit
 * local number is given without one already. */
export function normalizePhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `91${digits}`
  return digits
}

export function buildWhatsAppLink(phone: string, message: string): string {
  const normalized = normalizePhoneForWhatsApp(phone)
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`
}

export function formatBillMessage(vendorName: string, periodLabel: string, bill: ComputedInvoice): string {
  const lines = [
    `*${vendorName}* — Bill for ${periodLabel}`,
    '',
    ...bill.lineItems.map((li) => {
      const base = `${li.label}: ${li.regularQty}${unitLabel(li.unit)} × ₹${li.rate} = ₹${li.regularAmount.toFixed(2)}`
      return li.extraQty > 0 ? `${base} (+${li.extraQty}${unitLabel(li.unit)} extra = ₹${li.extraAmount.toFixed(2)})` : base
    }),
    '',
    `Subtotal: ₹${bill.subtotal.toFixed(2)}`,
  ]
  if (bill.deliveryCharge > 0) lines.push(`Delivery charge: ₹${bill.deliveryCharge.toFixed(2)}`)
  if (bill.skippedDays > 0) lines.push(`(${bill.skippedDays} day(s) skipped — not charged)`)
  lines.push('', `*Total: ₹${bill.total.toFixed(2)}*`)
  return lines.join('\n')
}
