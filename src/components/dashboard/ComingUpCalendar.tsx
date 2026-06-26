import { useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'

export interface UpcomingRdv {
  id: number
  date_rdv: string
  heure_rdv: string
  client_nom: string
  statut: string
}

interface ComingUpCalendarProps {
  rdvs: UpcomingRdv[]
}

function toDateLocale(lang: string): string {
  if (lang.startsWith('ar')) return 'ar-MA'
  if (lang.startsWith('en')) return 'en-US'
  return 'fr-FR'
}

/**
 * ComingUpCalendar — month grid that highlights days with upcoming
 * appointments (rendez-vous). Pure presentation: it receives the already
 * fetched `rdvs` and renders them; it does not fetch or mutate any data.
 *
 * RTL-aware: weekday/day order follows the document direction naturally
 * because the grid uses logical flow; numbers stay dir="ltr".
 */
export function ComingUpCalendar({ rdvs }: ComingUpCalendarProps) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language ?? 'fr'
  const locale = toDateLocale(lang)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // The visible month starts on the current month.
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))

  // Map "YYYY-MM-DD" → count of appointments on that day.
  const countsByDay = new Map<string, number>()
  for (const r of rdvs) {
    if (!r.date_rdv) continue
    const key = String(r.date_rdv).split('T')[0]
    countsByDay.set(key, (countsByDay.get(key) || 0) + 1)
  }

  // Localised weekday short labels (Mon-first).
  const weekdayLabels: string[] = []
  // 2024-01-01 is a Monday — use it to derive locale-aware short names.
  const monday = new Date(2024, 0, 1)
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    weekdayLabels.push(d.toLocaleDateString(locale, { weekday: 'short' }))
  }

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const monthLabel = cursor.toLocaleDateString(locale, { month: 'long', year: 'numeric' })

  // Build the day grid (Mon-first). getDay(): 0=Sun..6=Sat → shift to Mon=0.
  const firstOfMonth = new Date(year, month, 1)
  const startOffset = (firstOfMonth.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  type Cell = { day: number; dateKey: string; isToday: boolean; count: number } | null
  const cells: Cell[] = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day)
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    cells.push({
      day,
      dateKey,
      isToday: d.getTime() === today.getTime(),
      count: countsByDay.get(dateKey) || 0,
    })
  }

  const goPrev = () => setCursor(new Date(year, month - 1, 1))
  const goNext = () => setCursor(new Date(year, month + 1, 1))

  const totalUpcoming = rdvs.length

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={goPrev}
          aria-label="Previous month"
          className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-[#F2F2FA] dark:hover:bg-white/5 hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
        </button>
        <span className="text-sm font-bold text-foreground capitalize">{monthLabel}</span>
        <button
          onClick={goNext}
          aria-label="Next month"
          className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-[#F2F2FA] dark:hover:bg-white/5 hover:text-foreground transition-colors"
        >
          <ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </button>
      </div>

      {/* Weekday row */}
      <div className="grid grid-cols-7 gap-0.5 mb-1.5">
        {weekdayLabels.map((w, i) => (
          <div key={i} className="text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((cell, i) => {
          if (!cell) return <div key={i} className="h-8" />
          const hasRdv = cell.count > 0
          return (
            <div key={i} className="h-8 flex items-center justify-center">
              <div
                className={cn(
                  'relative h-7 w-7 rounded-md flex items-center justify-center text-[13px] transition-colors',
                  cell.isToday && !hasRdv && 'ring-1 ring-[#6D5BF6]/40 text-[#4A3FCF] dark:text-[#A78BFA] font-bold',
                  hasRdv && 'bg-[#6D5BF6] text-white font-bold shadow-[0_4px_12px_-6px_rgba(109,91,246,0.6)]',
                  !hasRdv && !cell.isToday && 'text-foreground/80',
                )}
                title={hasRdv ? t('dashboard.coming_up.appointments_other', { count: cell.count }) : undefined}
              >
                <span dir="ltr">{cell.day}</span>
                {hasRdv && cell.count > 1 && (
                  <span
                    className="absolute -top-1 -end-1 h-3.5 min-w-3.5 px-1 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center"
                    dir="ltr"
                  >
                    {cell.count}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer summary */}
      <div className="mt-3 pt-3 border-t border-[#EAEAF4] dark:border-white/10">
        {totalUpcoming > 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="h-7 w-7 rounded-lg bg-[#EEEDFB] dark:bg-[#6D5BF6]/10 flex items-center justify-center shrink-0">
              <CalendarDays className="h-4 w-4 text-[#6D5BF6] dark:text-[#A78BFA]" />
            </span>
            <span className="font-medium text-foreground">
              {t('dashboard.coming_up.appointments_other', { count: totalUpcoming })}
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-1">
            {t('dashboard.coming_up.none')}
          </p>
        )}
      </div>
    </div>
  )
}
