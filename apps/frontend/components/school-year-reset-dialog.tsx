'use client'

import { CheckCircle2, Download } from 'lucide-react'
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
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

// The reset deletes the whole year: the report is downloaded first, here, and the backend
// refuses the reset unless the same admin downloaded it in the last 15 minutes.
export function SchoolYearResetDialog() {
  const [open, setOpen] = React.useState(false)
  const [confirmation, setConfirmation] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [resetting, setResetting] = React.useState(false)
  const report = useYearReportDownload()
  const [reportReady, setReportReady] = React.useState(false)

  function close(next: boolean) {
    setOpen(next)
    if (!next) {
      setConfirmation('')
      setPassword('')
      setReportReady(false)
    }
  }

  async function reset() {
    setResetting(true)
    try {
      const response = await fetch('/api/settings/school-year/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'RESET', password })
      })
      const payload = await response.json().catch(() => ({})) as { message?: string, deletedStudents?: number, deletedTutors?: number }
      if (response.status === 409) {
        // The report is too old: download it again.
        setReportReady(false)
      }
      if (!response.ok) throw new Error(payload.message ?? 'Reset non riuscito.')
      toast.success(`Anno scolastico azzerato: eliminati ${payload.deletedStudents ?? 0} studenti e ${payload.deletedTutors ?? 0} tutor.`)
      close(false)
    }
    catch (error) {
      toast.error(error instanceof Error ? error.message : 'Reset non riuscito.')
    }
    finally {
      setResetting(false)
    }
  }

  return (
    <>
      <Button variant='destructive' onClick={() => setOpen(true)}>Resetta dati anno scolastico</Button>
      <AlertDialog open={open} onOpenChange={close}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resettare l&apos;anno scolastico?</AlertDialogTitle>
            <AlertDialogDescription>
              Elimina definitivamente studenti, tutor, lezioni, prenotazioni, feedback e inviti tutor. Admin e impostazioni
              globali restano. Dopo, i dati si recuperano solo da un backup: quello automatico risale alle 02:00.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <ol className='space-y-4'>
            <li className='space-y-2'>
              <p className='text-sm font-medium'>1. Scarica il report dell&apos;anno</p>
              {reportReady
                ? (
                    <p className='flex items-center gap-2 text-sm text-muted-foreground' role='status'>
                      <CheckCircle2 className='size-4 text-foreground' aria-hidden />
                      Salvato come <span className='font-medium text-foreground'>{report.saved}</span>. Vale 15 minuti.
                    </p>
                  )
                : (
                    <Button
                      type='button'
                      variant='outline'
                      disabled={report.busy}
                      onClick={() => void report.download().then(ok => setReportReady(ok))}
                    >
                      <Download className='size-4' aria-hidden />
                      {report.busy ? 'Preparazione...' : 'Scarica il report (.xlsx)'}
                    </Button>
                  )}
            </li>
            <li className='space-y-3'>
              <p className={reportReady ? 'text-sm font-medium' : 'text-sm font-medium text-muted-foreground'}>2. Conferma</p>
              <fieldset disabled={!reportReady} className='space-y-3 disabled:opacity-50'>
                <Field className='gap-2'>
                  <FieldLabel htmlFor='school-year-reset-confirmation'>Digita RESET per confermare</FieldLabel>
                  <Input id='school-year-reset-confirmation' value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete='off' />
                </Field>
                <Field className='gap-2'>
                  <FieldLabel htmlFor='school-year-reset-password'>La tua password admin</FieldLabel>
                  <Input id='school-year-reset-password' type='password' value={password} onChange={event => setPassword(event.target.value)} autoComplete='current-password' />
                </Field>
              </fieldset>
            </li>
          </ol>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={(event) => {
                event.preventDefault()
                void reset()
              }}
              disabled={!reportReady || confirmation !== 'RESET' || !password || resetting}
            >
              {resetting ? 'Reset in corso...' : 'Elimina dati'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
