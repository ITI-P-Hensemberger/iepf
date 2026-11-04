'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'
import { useSettings } from '@/components/settings-provider'
import { useSession } from '@/lib/use-session'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'

const levelStyles: Record<string, string> = {
  info: 'border-blue-200 bg-blue-50 text-blue-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  error: 'border-red-200 bg-red-50 text-red-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900'
}

const levelIcons: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
  success: CheckCircle2
}

export function ServiceMessageBanner() {
  const { settings } = useSettings()
  const { profile } = useSession()

  if (!settings || !profile?.role) {
    return null
  }

  const message = settings.serviceMessage
  if (!message || !message.enabled) {
    return null
  }

  const Icon = levelIcons[message.level] ?? Info

  return (
    <div className='w-full'>
      <div className='container mx-auto px-4 py-3 flex justify-center'>
        <div
          className={cn(
            'w-full max-w-6xl rounded-lg border px-4 py-3 text-sm',
            levelStyles[message.level] ?? levelStyles.info
          )}
        >
          <div className='flex items-start gap-3'>
            <Icon className='mt-0.5 h-4 w-4 shrink-0' />
            <div className='space-y-1'>
              <div className='text-sm font-semibold'>{message.title}</div>
              <div className='text-sm opacity-90'>{message.body}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
