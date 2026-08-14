interface TrendBarsProps {
  points: { date: string; revenue: number }[]
}

// Lightweight custom bar chart — no charting library needed for a single
// series like this, which keeps the bundle small.
export function TrendBars({ points }: TrendBarsProps) {
  const max = Math.max(1, ...points.map((p) => p.revenue))
  return (
    <div className="flex h-32 items-end gap-[3px] overflow-x-auto">
      {points.map((p) => (
        <div key={p.date} className="group relative flex h-full flex-1 min-w-[6px] items-end">
          <div
            className="w-full rounded-t bg-crate-500 transition-colors group-hover:bg-crate-600"
            style={{ height: `${Math.max(4, (p.revenue / max) * 100)}%` }}
            title={`${p.date}: ₹${p.revenue.toFixed(0)}`}
          />
        </div>
      ))}
    </div>
  )
}
