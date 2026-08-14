import type { StockRow } from '../../types'

export function StockRowItem({ row }: { row: StockRow }) {
  const unitLabel = row.unit === 'litre' ? 'L' : row.unit === 'kg' ? 'kg' : 'pkt'
  return (
    <div className="flex items-center justify-between py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink-900">{row.label}</p>
        <p className="font-mono text-xs text-crate-600">{row.tag}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2.5 font-mono text-xs">
        <span className="text-ink-600" title="Allotted">{row.allottedQty}{unitLabel}</span>
        {row.returnedQty > 0 && <span className="text-red-500" title="Returned">-{row.returnedQty}{unitLabel}</span>}
        {row.extraQty > 0 && <span className="text-fresh-600" title="Extra">+{row.extraQty}{unitLabel}</span>}
        <span className="w-14 text-right font-semibold text-crate-700" title="Net going out">{row.netQty}{unitLabel}</span>
      </div>
    </div>
  )
}
