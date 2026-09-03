interface StatCardProps {
  label: string
  value: string
  tone?: 'crate' | 'fresh'
}

const tones = {
  crate: 'bg-crate-50 text-crate-700',
  fresh: 'bg-fresh-50 text-fresh-600',
}

export function StatCard({ label, value, tone = 'crate' }: StatCardProps) {
  return (
    <div className={`flex-1 rounded-2xl p-4 ${tones[tone]}`}>
      <p className="font-display text-2xl font-bold leading-none">{value}</p>
      <p className="mt-1.5 text-xs font-medium text-ink-600">{label}</p>
    </div>
  )
}
