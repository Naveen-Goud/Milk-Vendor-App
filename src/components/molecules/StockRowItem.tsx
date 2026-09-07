import type { StockRow } from '../../types'
import { unitLabel as getUnitLabel } from '../../lib/unitLabel'

// Shared column template — StockSummaryCard's header uses the exact same
// grid so labels line up with values regardless of which columns happen to
// be zero for a given row (previously, hiding a zero column shifted every
// column after it out of alignment with the header above).
export const STOCK_GRID_COLS = 'grid-cols-[1fr_48px_48px_48px_56px]'

export function StockRowItem({ row }: { row: StockRow }) {
  const unit = getUnitLabel(row.unit)
  return (
    <div className={`grid ${STOCK_GRID_COLS} items-center gap-1 py-2`}>
      <div className="min-w-0 pr-1">
        <p className="truncate text-sm font-semibold text-ink-900">{row.label}</p>
        <p className="font-mono text-xs text-crate-600">{row.tag}</p>
      </div>
      <span className="text-right font-mono text-xs text-ink-600" title="Allotted">
        {row.allottedQty}{unit}
      </span>
      <span className="text-right font-mono text-xs text-red-500" title="Returned">
        {row.returnedQty > 0 ? `-${row.returnedQty}${unit}` : '—'}
      </span>
      <span className="text-right font-mono text-xs text-fresh-600" title="Extra">
        {row.extraQty > 0 ? `+${row.extraQty}${unit}` : '—'}
      </span>
      <span className="text-right font-mono text-xs font-semibold text-crate-700" title="Net going out">
        {row.netQty}{unit}
      </span>
    </div>
  )
}
