'use client'

// Purpose: Dialogs to move a lesson to another tutor, subject, date or time.
import { CalendarIcon } from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Field } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { format } from 'date-fns'
import type { RescheduleLesson } from './use-reschedule-lesson'
import type { Lesson } from './shared'
import { AVAILABLE_TIMES, OPEN_SUBJECT_VALUE, tutorLabel } from './shared'

export function RescheduleLessonDialog({ reschedule, lesson }: { reschedule: RescheduleLesson; lesson: Lesson | null }) {
  const { isRescheduleOpen, setIsRescheduleOpen, isRescheduleDateOpen, setIsRescheduleDateOpen, rescheduleForm, setRescheduleForm, isRescheduling, rescheduleTutorsLoading, rescheduleSubjectsLoading, rescheduleTutorSubjectsLoading, sortedRescheduleTutors, rescheduleSubjectSplit, handleReschedule } = reschedule

  return (
    <>
        <AlertDialog
          open={isRescheduleOpen}
          onOpenChange={(open) => {
            setIsRescheduleOpen(open)
          }}
        >
          <AlertDialogContent className='max-w-[calc(100%-3rem)] max-h-[calc(100vh-3rem)] overflow-y-auto sm:max-w-xl'>
            <AlertDialogHeader>
              <AlertDialogTitle>Riprogramma lezione</AlertDialogTitle>
              <AlertDialogDescription>
                Modifica i dettagli della lezione selezionata.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className='space-y-4'>
              <div className='grid gap-4 sm:grid-cols-2'>
                <Field className='gap-2'>
                  <Label htmlFor='reschedule-tutor'>Tutor</Label>
                  <Select
                    value={rescheduleForm.tutorId || '__none__'}
                    onValueChange={(value) =>
                      setRescheduleForm((prev) => ({
                        ...prev,
                        tutorId: value === '__none__' ? '' : value
                      }))
                    }
                  >
                    <SelectTrigger id='reschedule-tutor' className='w-full'>
                      <SelectValue
                        placeholder={
                          rescheduleTutorsLoading
                            ? 'Caricamento...'
                            : 'Seleziona tutor'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='__none__'>Seleziona tutor</SelectItem>
                      {sortedRescheduleTutors.map((tutor) => (
                        <SelectItem key={tutor.id} value={tutor.id}>
                          {tutorLabel(tutor) ?? 'Caricamento...'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field className='gap-2'>
                  <Label htmlFor='reschedule-subject'>Materia</Label>
                  <Select
                    value={rescheduleForm.subjectId || '__none__'}
                    onValueChange={(value) =>
                      setRescheduleForm((prev) => ({
                        ...prev,
                        subjectId: value === '__none__' ? '' : value
                      }))
                    }
                  >
                    <SelectTrigger id='reschedule-subject' className='w-full'>
                      <SelectValue
                        placeholder={
                          rescheduleTutorSubjectsLoading || rescheduleSubjectsLoading
                            ? 'Caricamento...'
                            : 'Seleziona materia'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='__none__'>Seleziona materia</SelectItem>
                      {lesson?.subjectFromBooking ? (
                        <SelectItem value={OPEN_SUBJECT_VALUE}>
                          Nessuna: la sceglie la prima prenotazione
                        </SelectItem>
                      ) : null}
                      {rescheduleSubjectSplit.preferred.length > 0 ? (
                        <SelectItem value='__preferred__' disabled>
                          Materie del tutor
                        </SelectItem>
                      ) : null}
                      {rescheduleSubjectSplit.preferred.map((subject) => (
                        <SelectItem key={subject.id} value={subject.id}>
                          {subject.name}
                        </SelectItem>
                      ))}
                      {rescheduleSubjectSplit.preferred.length > 0 &&
                      rescheduleSubjectSplit.others.length > 0 ? (
                        <SelectSeparator />
                      ) : null}
                      {rescheduleSubjectSplit.preferred.length > 0 &&
                      rescheduleSubjectSplit.others.length > 0 ? (
                        <SelectItem value='__others__' disabled>
                          Altre materie
                        </SelectItem>
                      ) : null}
                      {rescheduleSubjectSplit.others.map((subject) => (
                        <SelectItem key={subject.id} value={subject.id}>
                          {subject.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field className='gap-2'>
                  <Label htmlFor='reschedule-date-time'>Data e ora</Label>
                  <Button
                    variant='outline'
                    id='reschedule-date-time'
                    className='w-full justify-start px-2.5 font-normal'
                    onClick={() => setIsRescheduleDateOpen(true)}
                  >
                    <CalendarIcon className='mr-2 h-4 w-4' />
                    {rescheduleForm.date ? (
                      <>
                        {format(rescheduleForm.date, 'dd/MM/yyyy')}{' '}
                        {rescheduleForm.time}
                      </>
                    ) : (
                      <span>Seleziona data</span>
                    )}
                  </Button>
                </Field>
              </div>
            </div>
            <AlertDialogFooter className='pt-2 sm:pt-0'>
              <AlertDialogCancel>Chiudi</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault()
                  void handleReschedule()
                }}
                disabled={isRescheduling}
              >
                {isRescheduling ? 'Salvataggio...' : 'Salva modifiche'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={isRescheduleDateOpen}
          onOpenChange={setIsRescheduleDateOpen}
        >
          <AlertDialogContent className='max-w-[calc(100%-3rem)] max-h-[calc(100vh-3rem)] overflow-y-auto sm:max-w-md'>
            <AlertDialogHeader>
              <AlertDialogTitle>Seleziona data e ora</AlertDialogTitle>
              <AlertDialogDescription>
                Scegli la nuova data e l&apos;orario della lezione.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className='space-y-4'>
              <div className='flex justify-center'>
                <Calendar
                  mode='single'
                  selected={rescheduleForm.date}
                  onSelect={(date) =>
                    setRescheduleForm((prev) => ({
                      ...prev,
                      date: date ?? undefined
                    }))
                  }
                  defaultMonth={rescheduleForm.date ?? new Date()}
                  initialFocus
                />
              </div>
              <Field className='gap-2'>
                <Label htmlFor='reschedule-time-dialog'>Orario</Label>
                <Select
                  value={rescheduleForm.time}
                  onValueChange={(value) =>
                    setRescheduleForm((prev) => ({ ...prev, time: value }))
                  }
                >
                  <SelectTrigger id='reschedule-time-dialog' className='w-full'>
                    <SelectValue placeholder='Seleziona orario' />
                  </SelectTrigger>
                  <SelectContent>
                    {AVAILABLE_TIMES.map((time) => (
                      <SelectItem key={time} value={time}>
                        {time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <AlertDialogFooter className='pt-2 sm:pt-0'>
              <AlertDialogCancel>Chiudi</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault()
                  setIsRescheduleDateOpen(false)
                }}
              >
                Applica
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
    </>
  )
}
