import type { ProductUnit } from '../types'

// Single source of truth for how a unit is abbreviated — used to be
// duplicated ad hoc (and inconsistently: litre products got "L" appended,
// packet/kg products got nothing at all, which read as a calculation bug
// even though the underlying math never treated units differently).
export function unitLabel(unit: ProductUnit): string {
  if (unit === 'litre') return 'L'
  if (unit === 'kg') return 'kg'
  return 'pkt'
}

export function formatQty(qty: number, unit: ProductUnit): string {
  return `${qty}${unitLabel(unit)}`
}
