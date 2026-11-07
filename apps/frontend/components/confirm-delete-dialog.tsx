'use client'

import * as React from 'react'

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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Deleting an account cannot be undone, so the admin confirms it with their own password.
// onConfirm returns an error to show in the dialog (a wrong password), or null when done.
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  onConfirm: (password: string) => Promise<string | null>
}) {
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const change = (next: boolean) => {
    if (busy) return
    if (!next) {
      setPassword('')
      setError(null)
    }
    onOpenChange(next)
  }

  async function confirm() {
    if (!password) {
      setError('Inserisci la tua password.')
      return
    }
    setBusy(true)
    const problem = await onConfirm(password)
    setBusy(false)
    if (problem) {
      setError(problem)
      return
    }
    setPassword('')
    setError(null)
  }

  return (
    <AlertDialog open={open} onOpenChange={change}>
      <AlertDialogContent className='z-60'>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <form
          className='space-y-2'
          onSubmit={(event) => {
            event.preventDefault()
            void confirm()
          }}
        >
          <Label htmlFor='confirm-delete-password'>La tua password</Label>
          <Input
            id='confirm-delete-password'
            type='password'
            autoComplete='current-password'
            value={password}
            onChange={event => {
              setPassword(event.target.value)
              setError(null)
            }}
            aria-invalid={Boolean(error)}
            disabled={busy}
            autoFocus
          />
          {error && <p className='text-sm text-destructive'>{error}</p>}
        </form>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Annulla</AlertDialogCancel>
          <AlertDialogAction
            className='bg-destructive text-white hover:bg-destructive/90'
            onClick={(event) => {
              event.preventDefault()
              void confirm()
            }}
            disabled={busy}
          >
            {busy ? 'Eliminazione...' : 'Elimina account'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
