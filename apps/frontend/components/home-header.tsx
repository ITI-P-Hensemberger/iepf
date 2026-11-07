import * as React from 'react'

import { Skeleton } from '@/components/ui/skeleton'

// The top of a role's home: the greeting, in the same type as every other page title, a line
// on what the page is for and, beside it, what the user should see at once (the hours left).
export function HomeHeader({
  firstName,
  loading,
  subtitle,
  aside
}: {
  firstName?: string | null
  loading: boolean
  subtitle: string
  aside?: React.ReactNode
}) {
  return (
    <div className='flex flex-wrap items-center justify-between gap-3'>
      <div className='min-w-0'>
        {loading
          ? <Skeleton className='h-8 w-56' />
          : <h1 className='text-2xl break-words'>{firstName ? `Bentornatə, ${firstName}` : 'Bentornatə'}</h1>}
        <p className='mt-1 text-muted-foreground'>{subtitle}</p>
      </div>
      {aside}
    </div>
  )
}
