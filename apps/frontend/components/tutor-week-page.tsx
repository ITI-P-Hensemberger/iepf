'use client'

// The tutor's week: every lesson by day with who booked it and what for, presence for the
// lesson under way, and cancelling a slot nobody booked.
import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'

import { TutorLessonList } from '@/components/tutor-lesson-list'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { extractPayloadArray } from '@/lib/backend-response'
import { isCanceled, lessonsByDay, type ScheduleLesson } from '@/lib/lesson-schedule'
import { addDaysToKey, dateOfKey, dayKeyOf, mondayOf, schoolDays, weekRange } from '@/lib/school-week'
import { cn } from '@/lib/utils'

const dayFormat = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
const shortFormat = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' })

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export default function TutorWeekPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const todayKey = dayKeyOf(new Date())
  const mondayKey = mondayOf(searchParams.get('week') ?? todayKey)

  const [lessons, setLessons] = React.useState<ScheduleLesson[]>([])
  const [loading, setLoading] = React.useState(true)

  const goToWeek = (key: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('week', key)
    router.replace(`${pathname}?${params}`, { scroll: false })
  }

  // After an action the week refreshes in place, without the skeleton that would scroll it away.
  const load = React.useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const response = await fetch(`/api/lessons/schedule?${new URLSearchParams(weekRange(mondayKey))}`)
      if (!response.ok) throw new Error('Impossibile caricare le lezioni.')
      setLessons(extractPayloadArray<ScheduleLesson>(await response.json()))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossibile caricare le lezioni.')
    } finally {
      setLoading(false)
    }
  }, [mondayKey])

  React.useEffect(() => {
    void load()
  }, [load])

  const byDay = lessonsByDay(lessons)
  const days = schoolDays(mondayKey)
  const running = lessons.filter((lesson) => !isCanceled(lesson))
  const students = running.reduce((sum, lesson) => sum + lesson.bookings.length, 0)
  const capacity = lessons[0]?.tutorDailyCapacity
  const subjects = [...new Set(lessons.flatMap((lesson) => lesson.subjectOptions.map((option) => option.name)))]

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <Button variant='outline' size='icon' aria-label='Settimana precedente' onClick={() => goToWeek(addDaysToKey(mondayKey, -7))}>
          <ChevronLeft className='h-4 w-4' />
        </Button>
        <span className='min-w-40 text-center font-medium'>
          {shortFormat.format(dateOfKey(days[0]))} – {shortFormat.format(dateOfKey(days[4]))}
        </span>
        <Button variant='outline' size='icon' aria-label='Settimana successiva' onClick={() => goToWeek(addDaysToKey(mondayKey, 7))}>
          <ChevronRight className='h-4 w-4' />
        </Button>
        {mondayKey !== mondayOf(todayKey) && (
          <Button variant='ghost' size='sm' onClick={() => goToWeek(todayKey)}>Questa settimana</Button>
        )}
        <span className='ml-auto text-sm text-muted-foreground'>
          {running.length} {running.length === 1 ? 'lezione' : 'lezioni'} · {students} {students === 1 ? 'studente' : 'studenti'}
          {capacity ? ` · ${capacity} ${capacity === 1 ? 'posto' : 'posti'} al giorno` : ''}
        </span>
      </div>
      {subjects.length > 0 && (
        <p className='text-sm text-muted-foreground'>
          Le lezioni senza materia la ricevono dal primo studente che prenota, tra: {subjects.join(', ')}.
        </p>
      )}

      {loading ? (
        <div className='space-y-3'>
          <Skeleton className='h-24' />
          <Skeleton className='h-24' />
        </div>
      ) : (
        days.map((day) => {
          const dayLessons = byDay.get(day) ?? []
          return (
            <section key={day} className={cn('rounded-lg border bg-card', day < todayKey && 'opacity-80')}>
              <header className='flex items-center gap-2 border-b px-4 py-2'>
                <h3 className='font-medium'>{capitalize(dayFormat.format(dateOfKey(day)))}</h3>
                {day === todayKey && <Badge>Oggi</Badge>}
              </header>
              {dayLessons.length === 0 ? (
                <p className='px-4 py-3 text-sm text-muted-foreground'>Nessuna lezione.</p>
              ) : (
                <TutorLessonList lessons={dayLessons} onChanged={() => load(true)} />
              )}
            </section>
          )
        })
      )}

    </div>
  )
}
