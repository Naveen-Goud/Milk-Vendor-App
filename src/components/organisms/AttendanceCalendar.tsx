import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Customer, DeliveryException, Product } from '../../types'
import { getMonthGrid } from '../../lib/attendance'
import { CalendarDayCell } from '../molecules/CalendarDayCell'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface AttendanceCalendarProps {
  customer: Customer
  exceptions: DeliveryException[]
  products: Product[]
  todayISO: string
  initialYear: number
  initialMonth: number // 0-11
  onSelectDay?: (date: string) => void
}

export function AttendanceCalendar({ customer, exceptions, products, todayISO, initialYear, initialMonth, onSelectDay }: AttendanceCalendarProps) {
  const [year, setYear] = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)

  const grid = useMemo(
    () => getMonthGrid(year, month, customer, exceptions, products, todayISO),
    [year, month, customer, exceptions, products, todayISO]
  )

  function goPrev() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11) } else { setMonth((m) => m - 1) }
  }
  function goNext() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0) } else { setMonth((m) => m + 1) }
  }

  const presentCount = grid.filter((c) => c.status === 'delivered' || c.status === 'modified').length
  const absentCount = grid.filter((c) => c.status === 'skipped').length

  return (
    <div className="rounded-2xl border border-crate-100 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <button onClick={goPrev} aria-label="Previous month" className="flex h-8 w-8 items-center justify-center rounded-full bg-crate-50 text-crate-600">
          <ChevronLeft size={16} />
        </button>
        <p className="font-display text-sm font-bold text-ink-900">{MONTH_NAMES[month]} {year}</p>
        <button onClick={goNext} aria-label="Next month" className="flex h-8 w-8 items-center justify-center rounded-full bg-crate-50 text-crate-600">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-semibold uppercase text-ink-600">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {grid.map((cell, i) => <CalendarDayCell key={cell.date ?? `pad-${i}`} cell={cell} onSelect={onSelectDay} />)}
      </div>

      <div className="mt-4 flex items-center justify-center gap-4 text-xs text-ink-600">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-fresh-500" /> Present ({presentCount})</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Absent ({absentCount})</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Modified</span>
      </div>
    </div>
  )
}
