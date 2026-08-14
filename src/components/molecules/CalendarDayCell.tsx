import type { CalendarDay } from '../../lib/attendance'
import { attendanceColor } from '../../theme/theme'

export function CalendarDayCell({ cell, onSelect }: { cell: CalendarDay; onSelect?: (date: string) => void }) {
  if (!cell.date || !cell.status) {
    return <div className="aspect-square" />
  }

  const palette = attendanceColor[cell.status]
  const isInteractive = cell.status !== 'upcoming' && cell.status !== 'inactive'

  return (
    <button
      type="button"
      disabled={!isInteractive}
      onClick={() => cell.date && onSelect?.(cell.date)}
      className="relative flex aspect-square flex-col items-center justify-center rounded-lg text-xs font-semibold disabled:opacity-50"
      style={{ backgroundColor: palette.bg, color: palette.fg }}
    >
      {cell.dayNumber}
      {cell.status === 'modified' && (
        <span
          className="absolute bottom-1 h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: palette.dot }}
          aria-hidden="true"
        />
      )}
    </button>
  )
}
