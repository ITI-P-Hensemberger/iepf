'use client'

// The tutor's home: today's lessons with presence, the bookings coming up, and the way to
// the week and to availability and subjects.
import { withFrom } from '@/lib/back-link'
import { EmptyState } from '@/components/empty-state'
import * as React from 'react'
import Link from 'next/link'
import { BookOpen, CalendarClock, CalendarDays, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'

import { PushInviteCard, TUTOR_ONBOARDED_FLAG as ONBOARDED_FLAG } from '@/components/push-prompt'
import { TutorLessonList } from '@/components/tutor-lesson-list'
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

async function fetchSchedule(from: string, to: string) {
  const response = await fetch(`/api/lessons/schedule?${new URLSearchParams({ from, to })}`)
  if (!response.ok) throw new Error('Impossibile caricare le lezioni.')
  return extractPayloadArray<ScheduleLesson>(await response.json())
}

export default function TutorPage() {
  const { profile, isLoading: isProfileLoading } = useSession()
  // Set by the onboarding form right before it sends the tutor here.
  const [justOnboarded] = React.useState(() => {
    if (typeof window === 'undefined') return false
    try {
      const flag = window.sessionStorage.getItem(ONBOARDED_FLAG) === '1'
      window.sessionStorage.removeItem(ONBOARDED_FLAG)
      return flag
    } catch {
      return false
    }
  })
  const [today, setToday] = React.useState<ScheduleLesson[]>([])
  const [coming, setComing] = React.useState<ScheduleLesson[]>([])
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const todayKey = dayKeyOf(new Date())
      const [todayLessons, nextLessons] = await Promise.all([
        fetchSchedule(dayRange(todayKey).from, dayRange(todayKey).to),
        fetchSchedule(dayRange(addDaysToKey(todayKey, 1)).from, dayRange(addDaysToKey(todayKey, 14)).to)
      ])
      setToday(todayLessons)
      setComing(nextLessons)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossibile caricare le lezioni.')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const booked = coming.filter((lesson) => !isCanceled(lesson) && lesson.bookings.length > 0)
  const open = coming.filter((lesson) => !isCanceled(lesson) && lesson.bookings.length === 0).length

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10'>
        <div className='mx-auto max-w-3xl space-y-8'>
          <div>
            <h1 className='text-2xl font-bold'>{!isProfileLoading && `Bentornatə, ${profile?.firstName}`}</h1>
            <p className='text-muted-foreground'>Le tue lezioni di oggi e le prossime prenotazioni.</p>
          </div>
          {justOnboarded && (
            <PushInviteCard
              userId={profile?.id}
              role={profile?.role}
              title='Ti avvisiamo quando uno studente prenota'
              description='Hai scelto materie e orari: attiva le notifiche per sapere subito delle nuove prenotazioni.'
            />
          )}

          <div className='grid gap-3 sm:grid-cols-3'>
            <Button asChild size='lg' className='h-12 w-full'>
              <Link href='/tutor/lessons'><CalendarDays className='h-5 w-5' /> La mia settimana</Link>
            </Button>
            <Button asChild size='lg' variant='outline' className='h-12 w-full'>
              <Link href='/tutor/settings'><CalendarClock className='h-5 w-5' /> Disponibilità</Link>
            </Button>
            <Button asChild size='lg' variant='outline' className='h-12 w-full'>
              <Link href='/tutor/settings?tab=subjects'><BookOpen className='h-5 w-5' /> Materie</Link>
            </Button>
          </div>

          <section className='space-y-3'>
            <h2 className='flex items-center gap-2 text-lg font-semibold'>Oggi <Badge variant='secondary'>{capitalize(dayFormat.format(new Date()))}</Badge></h2>
            {loading ? (
              <Skeleton className='h-28' />
            ) : today.length === 0 ? (
              <EmptyState>Oggi non hai lezioni.</EmptyState>
            ) : (
              <div className='rounded-lg border bg-card'>
                <TutorLessonList lessons={today} onChanged={() => load(true)} />
              </div>
            )}
          </section>

          <section className='space-y-3'>
            <div className='flex items-center justify-between'>
              <h2 className='text-lg font-semibold'>Prossime prenotazioni</h2>
              <Button asChild variant='ghost' size='sm'>
                <Link href='/tutor/lessons'>La mia settimana <ChevronRight className='h-4 w-4' /></Link>
              </Button>
            </div>
            {loading ? (
              <Skeleton className='h-20' />
            ) : booked.length === 0 ? (
              <EmptyState>
                Nessuna prenotazione nei prossimi giorni{open > 0 ? `: hai ${open} ${open === 1 ? 'orario libero' : 'orari liberi'}.` : '.'}
              </EmptyState>
            ) : (
              <>
                <ul className='divide-y rounded-lg border bg-card'>
                  {booked.map((lesson) => (
                    <li key={lesson.id}>
                      <Link href={withFrom(`/tutor/lessons/${lesson.id}`, '/tutor')} className='flex items-center gap-3 px-4 py-3 hover:bg-muted/50'>
                        <div className='min-w-0 flex-1'>
                          <div className='font-medium'>
                            {capitalize(dayFormat.format(new Date(lesson.startAt)))} · {timeFormat.format(new Date(lesson.startAt))} · {subjectLabel(lesson)}
                          </div>
                          <div className='truncate text-sm text-muted-foreground'>
                            {lesson.bookings.map((booking) => booking.studentName).join(', ')}
                          </div>
                        </div>
                        <Badge variant='secondary'>{lesson.bookings.length}/{lesson.seats}</Badge>
                        <ChevronRight className='h-4 w-4 text-muted-foreground' />
                      </Link>
                    </li>
                  ))}
                </ul>
                {open > 0 && (
                  <p className='text-sm text-muted-foreground'>
                    Hai anche {open} {open === 1 ? 'orario ancora libero' : 'orari ancora liberi'} nei prossimi 14 giorni.
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
