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

const DELETED = ['Studenti e tutor, con i loro account', 'Lezioni e prenotazioni', 'Feedback', 'Ore di lezione degli studenti', 'Richieste di materie', 'Inviti tutor']
const KEPT = ['Admin e attivatori', 'Materie e sezioni', 'Impostazioni, messaggi e chiusure', 'Statistiche d\'uso anonime']

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

  function startOver() {
    setReportReady(false)
    setConfirmation('')
    setPassword('')
    setConfirmed(false)
    setFinalPassword('')
  }

  async function reset() {
    if (finalPassword !== password) {
      toast.error('Le due password non coincidono.')
      return
    }
    setResetting(true)
    try {
      const response = await fetch('/api/settings/school-year/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'RESET', password })
      })
      const payload = await response.json().catch(() => ({})) as { message?: string, deletedStudents?: number, deletedTutors?: number }
      if (!response.ok) {
        // A report older than 15 minutes, or a wrong password: start again from the top.
        if (response.status === 409 || response.status === 403) startOver()
        throw new Error(payload.message ?? 'Reset non riuscito.')
      }
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
              setConfirmed(true)
            }}
          >
            <fieldset disabled={!reportReady || confirmed} className='grid gap-3 sm:grid-cols-2'>
              <Field className='gap-2'>
                <FieldLabel htmlFor='school-year-reset-confirmation'>Digita RESET</FieldLabel>
                <Input id='school-year-reset-confirmation' value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete='off' />
              </Field>
              <Field className='gap-2'>
                <FieldLabel htmlFor='school-year-reset-password'>La tua password</FieldLabel>
                <Input id='school-year-reset-password' type='password' value={password} onChange={event => setPassword(event.target.value)} autoComplete='current-password' />
              </Field>
            </fieldset>
            {!confirmed && (
              <Button type='submit' variant='outline' disabled={!reportReady || confirmation !== 'RESET' || !password}>Continua</Button>
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
          if (!open) setFinalPassword('')
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
            <Input id='school-year-reset-final-password' type='password' value={finalPassword} onChange={event => setFinalPassword(event.target.value)} autoComplete='current-password' />
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
