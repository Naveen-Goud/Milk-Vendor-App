import { useState } from 'react'
import { Minus, Plus, MapPin, Phone, UserX, Pencil, Undo2 } from 'lucide-react'
import type { Customer, DeliveryItem, DayResolution, Product } from '../../types'
import { Badge } from '../atoms/Badge'

interface AttendanceRowProps {
  customer: Customer
  resolution: DayResolution
  usualItems: { product: Product; quantity: number }[]
  tagFor: (product: Product) => string
  onMarkAbsent: () => void
  onModify: (items: DeliveryItem[]) => void
  onUndo: () => void
}

export function AttendanceRow({ customer, resolution, usualItems, tagFor, onMarkAbsent, onModify, onUndo }: AttendanceRowProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<{ product: Product; quantity: number }[]>(
    usualItems.map((i) => ({ product: i.product, quantity: i.quantity }))
  )

  const { status } = resolution

  function updateQty(index: number, delta: number) {
    setDraft((items) => items.map((it, i) => (i === index ? { ...it, quantity: Math.max(0, +(it.quantity + delta).toFixed(1)) } : it)))
  }

  function submitModify() {
    onModify(draft.map((d) => ({ product_id: d.product.id, quantity: d.quantity, price_at_delivery: d.product.price })))
    setEditing(false)
  }

  const usualSummary = usualItems.map((i) => `${tagFor(i.product)} x${i.quantity}`).join(', ')
  const modifiedSummary = resolution.items
    .map((i) => {
      const product = usualItems.find((u) => u.product.id === i.product_id)?.product
      return product ? `${tagFor(product)} x${i.quantity}` : null
    })
    .filter(Boolean)
    .join(', ')

  const cardTone =
    status === 'skipped' ? 'border-red-100 bg-red-50' :
    status === 'modified' ? 'border-amber-100 bg-amber-100/30' :
    'border-fresh-100 bg-fresh-50'

  return (
    <div className={`rounded-2xl border p-4 transition-colors ${cardTone}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <p className="font-display text-base font-bold text-ink-900">{customer.name}</p>
            {status === 'delivered' && <Badge tone="fresh">Present</Badge>}
            {status === 'modified' && <Badge tone="amber">Modified</Badge>}
            {status === 'skipped' && <Badge tone="red">Absent</Badge>}
          </div>
          <p className="flex items-start gap-1 text-xs text-ink-600">
            <MapPin size={12} className="mt-0.5 shrink-0" />
            <span className="truncate">{customer.address}</span>
          </p>
          <p className="mt-0.5 truncate text-sm text-ink-600">
            {status === 'modified' ? `Today: ${modifiedSummary || 'none'}` : `Usual: ${usualSummary || 'No default order'}`}
          </p>
        </div>
        {customer.phone && (
          <a href={`tel:${customer.phone}`} aria-label={`Call ${customer.name}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-crate-600">
            <Phone size={15} />
          </a>
        )}
      </div>

      {status === 'delivered' && !editing && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={onMarkAbsent}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-white py-2.5 text-sm font-semibold text-red-500"
          >
            <UserX size={15} /> Mark absent
          </button>
          <button
            onClick={() => { setDraft(usualItems.map((i) => ({ product: i.product, quantity: i.quantity }))); setEditing(true) }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-crate-100 bg-white py-2.5 text-sm font-semibold text-crate-600"
          >
            <Pencil size={15} /> Modify
          </button>
        </div>
      )}

      {(status === 'modified' || status === 'skipped') && (
        <button
          onClick={onUndo}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-crate-100 bg-white py-2.5 text-sm font-semibold text-crate-600"
        >
          <Undo2 size={15} /> Undo — mark present again
        </button>
      )}

      {editing && (
        <div className="mt-3 space-y-2 border-t border-crate-100 pt-3">
          {draft.map((item, index) => (
            <div key={item.product.id} className="flex items-center justify-between">
              <span className="text-sm text-ink-900">{tagFor(item.product)}</span>
              <div className="flex items-center gap-3">
                <button onClick={() => updateQty(index, -0.5)} className="flex h-8 w-8 items-center justify-center rounded-full bg-crate-50 text-crate-600 active:bg-crate-100" aria-label={`Decrease ${item.product.acronym}`}>
                  <Minus size={14} />
                </button>
                <span className="w-10 text-center font-mono text-sm font-semibold">{item.quantity}</span>
                <button onClick={() => updateQty(index, 0.5)} className="flex h-8 w-8 items-center justify-center rounded-full bg-crate-50 text-crate-600 active:bg-crate-100" aria-label={`Increase ${item.product.acronym}`}>
                  <Plus size={14} />
                </button>
              </div>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <button onClick={() => setEditing(false)} className="flex-1 rounded-xl border border-crate-100 py-2.5 text-sm font-semibold text-ink-600">
              Cancel
            </button>
            <button onClick={submitModify} className="flex-1 rounded-xl bg-fresh-500 py-2.5 text-sm font-semibold text-white active:bg-fresh-600">
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
