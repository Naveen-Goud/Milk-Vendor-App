import { Milk } from 'lucide-react'
import type { StockRow } from '../../types'
import { StockRowItem, STOCK_GRID_COLS } from '../molecules/StockRowItem'

export function StockSummaryCard({ rows }: { rows: StockRow[] }) {
  if (rows.length === 0) return null
  return (
    <div className="rounded-2xl border border-crate-100 bg-white p-4">
      <div className="mb-1 flex items-center gap-2">
        <Milk size={16} className="text-crate-600" />
        <h2 className="font-display text-sm font-bold text-ink-900">Today's milk stock</h2>
      </div>
      <div className={`grid ${STOCK_GRID_COLS} gap-1 text-[10px] font-semibold uppercase tracking-wide text-ink-600`}>
        <span />
        <span className="text-right">Alloc.</span>
        <span className="text-right">Return</span>
        <span className="text-right">Extra</span>
        <span className="text-right">Net</span>
      </div>
      <div className="divide-y divide-crate-50">
        {rows.map((row) => <StockRowItem key={row.productId} row={row} />)}
      </div>
    </div>
  )
}
