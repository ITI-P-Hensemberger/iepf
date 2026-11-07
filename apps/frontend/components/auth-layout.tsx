import * as React from 'react'
import Image from 'next/image'

import { BackButton } from '@/components/back-button'
import { cn } from '@/lib/utils'

// Every page before the dashboard where someone signs in or signs up (login, registrations,
// password reset, email check): a narrow centred column with the back button at its edge, the logo, the title, a line on what to do, and the form.
export function AuthLayout({
  title,
  description,
  backHref = '/',
  wide = false,
  children,
  footer
}: {
  title: string
  description?: React.ReactNode
  // null: no back button (a step the user must complete, like the tutor onboarding).
  backHref?: string | null
  // A wider column, for long forms.
  wide?: boolean
  children: React.ReactNode
  // Links under the form: "Non hai un account? Registrati", the privacy policy…
  footer?: React.ReactNode
}) {
  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 pt-10 pb-16'>
        <div className={cn('mx-auto flex w-full flex-col items-center text-center', wide ? 'max-w-2xl' : 'max-w-md')}>
          {/* Lined up with the column below, as on the FAQ. */}
          {backHref !== null && <BackButton href={backHref} className='self-start' />}
          <Image
            src='/logo.png'
            alt='IEPF'
            width={72}
            height={72}
            style={{ width: 'auto', height: 'auto', maxHeight: 72 }}
            draggable={false}
            priority
            className='mt-6'
          />
          <h1 className='mt-6 text-2xl font-semibold tracking-tight'>{title}</h1>
          {description && <p className='mt-2 text-muted-foreground'>{description}</p>}
          <div className='mt-8 w-full text-left'>{children}</div>
          {footer && <div className='mt-6 space-y-2 text-sm text-muted-foreground'>{footer}</div>}
        </div>
      </div>
    </main>
  )
}
