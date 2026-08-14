interface RankedRow {
  key: string
  label: string
  sublabel?: string
  value: number
}

export function RankedBarList({ rows, valuePrefix = '₹', formatValue }: { rows: RankedRow[]; valuePrefix?: string; formatValue?: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.key}>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium text-ink-900">{row.label}</span>
            <span className="shrink-0 font-mono text-xs font-semibold text-ink-900">
              {formatValue ? formatValue(row.value) : `${valuePrefix}${row.value.toLocaleString('en-IN')}`}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-crate-50">
            <div className="h-full rounded-full bg-crate-500" style={{ width: `${Math.max(3, (row.value / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}
