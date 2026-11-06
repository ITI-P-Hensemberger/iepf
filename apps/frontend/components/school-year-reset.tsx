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

const DELETED = ['Studenti e tutor, con i loro account', 'Lezioni e prenotazioni', 'Feedback', 'Ore di lezione degli studenti', 'Richieste di materie', 'Inviti tutor', 'Statistiche d\'uso (nel report restano i riepiloghi mensili)']
const KEPT = ['Admin e attivatori', 'Materie e sezioni', 'Impostazioni, messaggi e chiusure']

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
  const [resetting, setResetting] = React.useState(false)
  const [checking, setChecking] = React.useState(false)
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

  // The first confirmation is checked by the backend too: a wrong password shows here.
  async function confirm() {
    setChecking(true)
    setPasswordError(null)
    try {
      const response = await fetch('/api/settings/school-year/reset/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      })
      if (response.status === 204) {
        setConfirmed(true)
        return
      }
      const payload = await response.json().catch(() => ({})) as { message?: string }
      if (response.status === 409) reportTooOld()
      else if (response.status === 403) setPasswordError(payload.message ?? 'Password non corretta')
      else toast.error(payload.message ?? 'Verifica non riuscita.')
    }
    catch {
      toast.error('Verifica non riuscita.')
    }
    finally {
      setChecking(false)
    }
  }

  async function reset() {
    if (finalPassword !== password) {
      setFinalError('Le due password non coincidono.')
      return
    }
    setFinalError(null)
    setResetting(true)
    try {
      const response = await fetch('/api/settings/school-year/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'RESET', password })
      })
      const payload = await response.json().catch(() => ({})) as { message?: string, deletedStudents?: number, deletedTutors?: number }
      if (response.status === 403) {
        setFinalError(payload.message ?? 'Password non corretta')
        return
      }
      if (response.status === 409) {
        setFinalOpen(false)
        reportTooOld()
        return
      }
      if (!response.ok) throw new Error(payload.message ?? 'Reset non riuscito.')
      toast.success(`Anno scolastico azzerato: eliminati ${payload.deletedStudents ?? 0} studenti e ${payload.deletedTutors ?? 0} tutor.`)
      startOver()
      setFinalOpen(false)
    }
    catch (error) {
      setFinalOpen(false)
      toast.error(error instanceof Error ? error.message : 'Reset non riuscito.')
    }
    finally {
      setResetting(false)
    }
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
              void confirm()
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
                void reset()
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
