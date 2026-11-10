'use client'

import { CheckCircle2, Download, TriangleAlert } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { useYearReportDownload } from '@/components/admin-stats/exports-tab'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { jsonBody } from '@/lib/api-fetch'

const DELETED = ['Studenti e tutor, con i loro account', 'Lezioni e prenotazioni', 'Feedback', 'Ore di lezione degli studenti', 'Richieste di materie', 'Inviti tutor', 'Tutte le statistiche: utilizzo, notifiche nel pannello e click sui link (restano nel report)']
const KEPT = ['Admin e attivatori', 'Materie e sezioni', 'Impostazioni, messaggi e chiusure', 'FAQ e link']

function Step({ number, title, done, active, children }: { number: number, title: string, done: boolean, active: boolean, children: React.ReactNode }) {
  return (
    <li className={cn('space-y-3 rounded-lg border p-4', !active && !done && 'opacity-50')}>
      <p className='flex items-center gap-2 font-medium'>
        {done
          ? <CheckCircle2 className='size-5 text-foreground' aria-hidden />
          : <span className='flex size-5 items-center justify-center rounded-full border text-xs' aria-hidden>{number}</span>}
        {title}
      </p>
      {children}
    </li>
  )
}

// The reset deletes the whole year, so it takes three steps: the report (the backend refuses
// the reset unless the same admin downloaded it in the last 15 minutes), a first confirmation
// with RESET and the password, and a final one that asks for the password again.
export function SchoolYearReset() {
  const report = useYearReportDownload()
  const [reportReady, setReportReady] = React.useState(false)
  const [confirmation, setConfirmation] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [confirmed, setConfirmed] = React.useState(false)
  const [finalOpen, setFinalOpen] = React.useState(false)
  const [finalPassword, setFinalPassword] = React.useState('')
  const queryClient = useQueryClient()
  const [passwordError, setPasswordError] = React.useState<string | null>(null)
  const [finalError, setFinalError] = React.useState<string | null>(null)
  const [reportExpired, setReportExpired] = React.useState(false)

  function startOver() {
    setReportReady(false)
    setConfirmation('')
    setPassword('')
    setConfirmed(false)
    setFinalPassword('')
    setPasswordError(null)
    setFinalError(null)
    setReportExpired(false)
  }

  // Only an expired report sends back to step 1; what was typed stays.
  function reportTooOld() {
    setReportReady(false)
    setConfirmed(false)
    setReportExpired(true)
  }

  // Both steps answer with a status the dialog shows itself (wrong password, report too old):
  // only an unexpected failure throws, and shows as a toast.
  const post = async (url: string, body: unknown, fallback: string) => {
    const response = await fetch(url, jsonBody('POST', body)).catch(() => {
      throw new Error(fallback)
    })
    const payload = await response.json().catch(() => ({})) as { message?: string, deletedStudents?: number, deletedTutors?: number }
    if (!response.ok && ![403, 409].includes(response.status)) throw new Error(payload.message ?? fallback)
    return { status: response.status, payload }
  }

  // The first confirmation is checked by the backend too: a wrong password shows here.
  const check = useMutation({
    mutationFn: () => post('/api/settings/school-year/reset/check', { password }, 'Verifica non riuscita.'),
    onSuccess: ({ status, payload }) => {
      if (status === 409) reportTooOld()
      else if (status === 403) setPasswordError(payload.message ?? 'Password non corretta')
      else setConfirmed(true)
    }
  })
  const checking = check.isPending
  function confirm() {
    setPasswordError(null)
    check.mutate()
  }

  const resetYear = useMutation({
    mutationFn: () => post('/api/settings/school-year/reset', { confirmation: 'RESET', password }, 'Reset non riuscito.'),
    onSuccess: ({ status, payload }) => {
      if (status === 403) {
        setFinalError(payload.message ?? 'Password non corretta')
        return
      }
      setFinalOpen(false)
      if (status === 409) {
        reportTooOld()
        return
      }
      toast.success(`Anno scolastico azzerato: eliminati ${payload.deletedStudents ?? 0} studenti e ${payload.deletedTutors ?? 0} tutor.`)
      startOver()
      // Users, lessons and bookings are gone: every list reloads.
      return queryClient.invalidateQueries()
    },
    onError: () => setFinalOpen(false)
  })
  const resetting = resetYear.isPending
  function reset() {
    if (finalPassword !== password) {
      setFinalError('Le due password non coincidono.')
      return
    }
    setFinalError(null)
    resetYear.mutate()
  }

  return (
    <div className='space-y-6'>
      <Card className='border-destructive'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <TriangleAlert className='size-5 text-destructive' aria-hidden />
            Nuovo anno scolastico
          </CardTitle>
          <CardDescription>
            Azzera i dati dell&apos;anno per ricominciare. Non si annulla: dopo, i dati si recuperano solo dal report
            e da un backup (quello automatico risale alle 02:00).
          </CardDescription>
        </CardHeader>
        <CardContent className='grid gap-4 sm:grid-cols-2'>
          <div className='space-y-2'>
            <p className='text-sm font-medium'>Viene eliminato</p>
            <ul className='list-disc space-y-1 pl-5 text-sm text-muted-foreground'>{DELETED.map(item => <li key={item}>{item}</li>)}</ul>
          </div>
          <div className='space-y-2'>
            <p className='text-sm font-medium'>Resta</p>
            <ul className='list-disc space-y-1 pl-5 text-sm text-muted-foreground'>{KEPT.map(item => <li key={item}>{item}</li>)}</ul>
          </div>
        </CardContent>
      </Card>

      <ol className='space-y-4'>
        <Step number={1} title={'Scarica il report dell\'anno'} done={reportReady} active>
          {reportExpired && !reportReady && (
            <p className='text-sm text-destructive' role='alert'>Il report è di più di 15 minuti fa: scaricalo di nuovo, poi premi Continua.</p>
          )}
          {reportReady
            ? <p className='text-sm text-muted-foreground' role='status'>Salvato come <span className='font-medium text-foreground'>{report.saved}</span>. Vale 15 minuti per il reset.</p>
            : (
                <Button type='button' variant='outline' disabled={report.busy} onClick={() => void report.download().then(ok => setReportReady(ok))}>
                  <Download className='size-4' aria-hidden />
                  {report.busy ? 'Preparazione...' : 'Scarica il report (.xlsx)'}
                </Button>
              )}
        </Step>

        <Step number={2} title='Prima conferma' done={confirmed} active={reportReady}>
          <form
            className='space-y-3'
            onSubmit={(event) => {
              event.preventDefault()
              confirm()
            }}
          >
            <fieldset disabled={!reportReady || confirmed} className='grid gap-3 sm:grid-cols-2'>
              <Field className='gap-2'>
                <FieldLabel htmlFor='school-year-reset-confirmation'>Digita RESET</FieldLabel>
                <Input id='school-year-reset-confirmation' value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete='off' />
              </Field>
              <Field className='gap-2'>
                <FieldLabel htmlFor='school-year-reset-password'>La tua password</FieldLabel>
                <Input
                  id='school-year-reset-password'
                  type='password'
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value)
                    setPasswordError(null)
                  }}
                  autoComplete='current-password'
                  aria-invalid={passwordError ? true : undefined}
                  aria-describedby={passwordError ? 'school-year-reset-password-error' : undefined}
                />
                {passwordError && <p id='school-year-reset-password-error' className='text-sm text-destructive' role='alert'>{passwordError}</p>}
              </Field>
            </fieldset>
            {!confirmed && (
              <Button type='submit' variant='outline' disabled={!reportReady || confirmation !== 'RESET' || !password || checking}>{checking ? 'Verifica...' : 'Continua'}</Button>
            )}
          </form>
        </Step>

        <Step number={3} title='Conferma definitiva' done={false} active={confirmed}>
          <div className='flex flex-wrap gap-2'>
            <Button variant='destructive' disabled={!confirmed} onClick={() => setFinalOpen(true)}>Elimina i dati dell&apos;anno</Button>
            {(reportReady || confirmed) && <Button variant='ghost' onClick={startOver}>Ricomincia</Button>}
          </div>
        </Step>
      </ol>

      <AlertDialog
        open={finalOpen}
        onOpenChange={(open) => {
          setFinalOpen(open)
          if (!open) {
            setFinalPassword('')
            setFinalError(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ultima conferma</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per eliminare studenti, tutor, lezioni, prenotazioni e feedback di tutto l&apos;anno. Per confermare,
              inserisci di nuovo la tua password.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field className='gap-2'>
            <FieldLabel htmlFor='school-year-reset-final-password'>La tua password, di nuovo</FieldLabel>
            <Input
              id='school-year-reset-final-password'
              type='password'
              value={finalPassword}
              onChange={(event) => {
                setFinalPassword(event.target.value)
                setFinalError(null)
              }}
              autoComplete='current-password'
              aria-invalid={finalError ? true : undefined}
              aria-describedby={finalError ? 'school-year-reset-final-error' : undefined}
            />
            {finalError && <p id='school-year-reset-final-error' className='text-sm text-destructive' role='alert'>{finalError}</p>}
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={!finalPassword || resetting}
              onClick={(event) => {
                event.preventDefault()
                reset()
              }}
            >
              {resetting ? 'Eliminazione...' : 'Elimina definitivamente'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
