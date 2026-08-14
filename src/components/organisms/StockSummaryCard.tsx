import { Milk } from 'lucide-react'
import type { StockRow } from '../../types'
import { StockRowItem } from '../molecules/StockRowItem'

export function StockSummaryCard({ rows }: { rows: StockRow[] }) {
  if (rows.length === 0) return null
  return (
    <div className="rounded-2xl border border-crate-100 bg-white p-4">
      <div className="mb-1 flex items-center gap-2">
        <Milk size={16} className="text-crate-600" />
        <h2 className="font-display text-sm font-bold text-ink-900">Today's milk stock</h2>
      </div>
      <div className="mb-2 flex justify-end gap-2.5 text-[10px] font-semibold uppercase tracking-wide text-ink-600">
        <span>Alloc.</span>
        <span>Return</span>
        <span>Extra</span>
        <span className="w-14 text-right">Net</span>
      </div>
      <div className="divide-y divide-crate-50">
        {rows.map((row) => <StockRowItem key={row.productId} row={row} />)}
      </div>
    </div>
  )
}
