import * as React from 'react'
import { TriangleAlert } from 'lucide-react'

// Actions that cannot be undone, kept apart from the everyday ones in a section of their own,
// each with what it does and its button. The confirmation stays with the page's dialog.
export function DangerZone({ children }: { children: React.ReactNode }) {
  return (
    <section className='rounded-lg border border-destructive/40 bg-card'>
      <header className='flex items-center gap-2 border-b border-destructive/30 px-4 py-3 sm:px-6'>
        <TriangleAlert className='size-4 text-destructive' aria-hidden />
        <h2 className='font-semibold text-destructive'>Danger zone</h2>
      </header>
      <div className='divide-y'>{children}</div>
    </section>
  )
}

export function DangerAction({ title, description, action }: { title: string, description: React.ReactNode, action: React.ReactNode }) {
  return (
    <div className='flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6'>
      <div className='space-y-1'>
        <p className='font-medium'>{title}</p>
        <p className='text-sm text-muted-foreground'>{description}</p>
      </div>
      <div className='shrink-0'>{action}</div>
    </div>
  )
}
