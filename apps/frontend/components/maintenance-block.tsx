'use client'

import * as React from 'react'
import Link from 'next/link'
import { Wrench } from 'lucide-react'

import { StatusBlock } from '@/components/status-block'
import { Button } from '@/components/ui/button'

type MaintenanceBlockProps = {
  message?: string | null
  // For visitors who are not signed in: the login stays open so an admin can turn maintenance off.
  showLogin?: boolean
}

// Shown alone, without the header: nothing else on the site can be used during maintenance.
export function MaintenanceBlock({ message, showLogin = false }: MaintenanceBlockProps) {
  return (
    <StatusBlock
      icon={Wrench}
      title='Siamo in manutenzione'
      actions={
        <Button asChild variant='outline'>
          <Link href='/faq'>Consulta le domande frequenti</Link>
        </Button>
      }
      footer={showLogin && (
        <p className='text-xs text-muted-foreground'>
          Sei un amministratore?{' '}
          <Link href='/auth/login' className='underline underline-offset-4'>
            Accedi
          </Link>
        </p>
      )}
    >
      <p className='whitespace-pre-line'>
        {message ||
          'Il servizio è temporaneamente non disponibile. Riprova più tardi.'}
      </p>
    </StatusBlock>
  )
}
