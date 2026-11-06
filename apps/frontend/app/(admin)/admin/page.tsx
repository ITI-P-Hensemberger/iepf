'use client'

// The admin home: the way to every area, today's lessons at a glance and the bookings of
// the coming days.
import * as React from 'react'
import Link from 'next/link'
import { BookOpen, ChevronRight, GraduationCap, MessageSquare, Users } from 'lucide-react'
import { toast } from 'sonner'

import { DayOverview } from '@/components/admin-day-page'
import { PushInviteCard } from '@/components/push-prompt'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { extractPayloadArray } from '@/lib/backend-response'
import { isCanceled, subjectLabel, type ScheduleLesson } from '@/lib/lesson-schedule'
import { addDaysToKey, dayKeyOf, dayRange } from '@/lib/school-week'
import { useSession } from '@/lib/use-session'

const timeFormat = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

const AREAS = [
  { href: '/admin/students', label: 'Studenti', icon: GraduationCap },
  { href: '/admin/tutors', label: 'Tutor', icon: Users },
  { href: '/admin/lessons', label: 'Lezioni', icon: BookOpen },
  { href: '/admin/feedback', label: 'Feedback', icon: MessageSquare }
]

async function fetchSchedule(from: string, to: string) {
  const response = await fetch(`/api/lessons/schedule?${new URLSearchParams({ from, to })}`)
  if (!response.ok) throw new Error('Impossibile caricare le lezioni.')
  return extractPayloadArray<ScheduleLesson>(await response.json())
}

export default function AdminPage() {
  const { profile, isLoading: isProfileLoading } = useSession()
  const [today, setToday] = React.useState<ScheduleLesson[]>([])
  const [coming, setComing] = React.useState<ScheduleLesson[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let active = true
    const todayKey = dayKeyOf(new Date())
    Promise.all([
      fetchSchedule(dayRange(todayKey).from, dayRange(todayKey).to),
      fetchSchedule(dayRange(addDaysToKey(todayKey, 1)).from, dayRange(addDaysToKey(todayKey, 7)).to)
    ])
      .then(([todayLessons, nextLessons]) => {
        if (!active) return
        setToday(todayLessons)
        setComing(nextLessons)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Impossibile caricare le lezioni.'))
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const booked = coming.filter((lesson) => !isCanceled(lesson) && lesson.bookings.length > 0)
  // A slot nobody booked once bookings closed will not take place: today it is only noise.
  const todayShown = today.filter((lesson) => lesson.bookings.length > 0 || lesson.bookingsOpen)

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10'>
        <div className='mx-auto max-w-6xl space-y-8'>
          <div>
            <h1 className='text-2xl font-bold'>{!isProfileLoading && `Bentornatə, ${profile?.firstName}`}</h1>
            <p className='text-muted-foreground'>Gestisci il progetto InsiemeÈ+Facile</p>
          </div>
          <div className='empty:hidden'>
            <PushInviteCard
              userId={profile?.id}
              role={profile?.role}
              title='Notifiche spente su questo dispositivo'
              description='Ricevi subito gli avvisi su feedback bassi, assenze e richieste in attesa.'
            />
          </div>

          <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
            {AREAS.map((area) => (
              <Link key={area.href} href={area.href} className='flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary'>
                <span className='rounded-lg bg-primary/10 p-2'><area.icon className='h-4 w-4 text-primary' /></span>
                <span className='font-medium'>{area.label}</span>
                <ChevronRight className='ml-auto h-4 w-4 text-muted-foreground' />
              </Link>
            ))}
          </div>

          <section className='space-y-3'>
            <div className='flex items-center justify-between'>
              <h2 className='flex items-center gap-2 text-lg font-semibold'>Oggi <Badge variant='secondary'>{capitalize(dayFormat.format(new Date()))}</Badge></h2>
              <Button asChild variant='ghost' size='sm'>
                <Link href='/admin/lessons'>Apri la giornata <ChevronRight className='h-4 w-4' /></Link>
              </Button>
            </div>
            <DayOverview lessons={todayShown} loading={loading} grouping='tutor' from='home' />
          </section>

          <section className='space-y-3'>
            <h2 className='text-lg font-semibold'>Prenotazioni dei prossimi 7 giorni</h2>
            {loading ? (
              <Skeleton className='h-24' />
            ) : booked.length === 0 ? (
              <p className='rounded-lg border bg-card px-4 py-6 text-sm text-muted-foreground'>Nessuna prenotazione nei prossimi 7 giorni.</p>
            ) : (
              <ul className='divide-y rounded-lg border bg-card'>
                {booked.map((lesson) => (
                  <li key={lesson.id}>
                    <Link href={`/admin/lessons/${lesson.id}?from=home`} className='flex items-center gap-3 px-4 py-3 hover:bg-muted/50'>
                      <div className='min-w-0 flex-1'>
                        <div className='font-medium'>
                          {capitalize(dayFormat.format(new Date(lesson.startAt)))} · {timeFormat.format(new Date(lesson.startAt))} · {subjectLabel(lesson)}
                        </div>
                        <div className='truncate text-sm text-muted-foreground'>
                          {lesson.tutorName} con {lesson.bookings.map((booking) => booking.studentName).join(', ')}
                        </div>
                      </div>
                      <Badge variant='secondary'>{lesson.bookings.length}/{lesson.seats}</Badge>
                      <ChevronRight className='h-4 w-4 text-muted-foreground' />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
