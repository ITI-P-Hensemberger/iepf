'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell,
  CalendarCheck,
  Clock,
  type LucideIcon,
  MessageSquare,
  ShieldAlert,
  Sparkles,
  UserCheck
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  badgeLabel,
  formatNotificationTime,
  type InboxItem,
  type InboxPage,
  NOTIFICATION_EVENT,
  safeNotificationPath
} from '@/lib/notification-inbox'
import { syncAppBadge } from '@/lib/app-badge'
import { watchUnread } from '@/lib/notification-stream'
import { isImpersonating } from '@/lib/push-client'
import { cn } from '@/lib/utils'

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  bookings: CalendarCheck,
  reminders: Clock,
  feedback: MessageSquare,
  account: UserCheck,
  lessons: Sparkles
}

function iconFor(category: string) {
  // Every admin* kind is an alert for the admins.
  return CATEGORY_ICONS[category] ?? (category.startsWith('admin') ? ShieldAlert : Bell)
}

async function fetchInbox(cursor: string | null): Promise<InboxPage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
  const response = await fetch(`/api/notifications/inbox${query}`, { cache: 'no-store' })
  if (!response.ok) throw new Error('Impossibile caricare le notifiche.')
  return (await response.json()) as InboxPage
}

async function fetchUnread() {
  const response = await fetch('/api/notifications/inbox/unread', { cache: 'no-store' })
  if (!response.ok) return null
  const payload = (await response.json()) as { count?: number }
  return typeof payload.count === 'number' ? payload.count : null
}

export function NotificationBell() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [unread, setUnread] = React.useState(0)
  // False until the first real count: the initial 0 must not clear the icon badge.
  const [countKnown, setCountKnown] = React.useState(false)
  const [items, setItems] = React.useState<InboxItem[]>([])
  const [nextCursor, setNextCursor] = React.useState<string | null>(null)
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'error'>('idle')
  const [loadingMore, setLoadingMore] = React.useState(false)

  const refreshUnread = React.useCallback(async () => {
    const count = await fetchUnread().catch(() => null)
    if (count !== null) {
      setUnread(count)
      setCountKnown(true)
    }
  }, [])

  // The counter follows the page being opened, a return to the tab and every push.
  React.useEffect(() => {
    void refreshUnread()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshUnread()
    }
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === NOTIFICATION_EVENT) void refreshUnread()
    }
    document.addEventListener('visibilitychange', onVisible)
    navigator.serviceWorker?.addEventListener('message', onMessage)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      navigator.serviceWorker?.removeEventListener('message', onMessage)
    }
  }, [refreshUnread])

  // While the tab is visible, a stream keeps the counter current as notifications arrive,
  // also on a computer with no push. A hidden tab closes it and frees the connection.
  React.useEffect(() => {
    let stop: (() => void) | null = null
    const follow = () => {
      if (document.visibilityState === 'visible') {
        stop ??= watchUnread({
          onCount: (count) => {
            setUnread(count)
            setCountKnown(true)
          }
        })
      } else {
        stop?.()
        stop = null
      }
    }
    follow()
    document.addEventListener('visibilitychange', follow)
    return () => {
      document.removeEventListener('visibilitychange', follow)
      stop?.()
    }
  }, [])

  // The icon of the installed app shows the same count as the bell, but never the count of
  // someone an admin is impersonating on the admin's own device.
  React.useEffect(() => {
    if (countKnown && !isImpersonating()) void syncAppBadge(unread)
  }, [countKnown, unread])

  // Opening the panel reloads the first page; it never marks anything as read.
  async function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) return
    setStatus('loading')
    try {
      const page = await fetchInbox(null)
      setItems(page.items)
      setNextCursor(page.nextCursor)
      setUnread(page.unread)
      setStatus('idle')
    } catch {
      setStatus('error')
    }
  }

  async function loadMore() {
    if (!nextCursor) return
    setLoadingMore(true)
    try {
      const page = await fetchInbox(nextCursor)
      setItems(previous => {
        const seen = new Set(previous.map(item => item.id))
        return [...previous, ...page.items.filter(item => !seen.has(item.id))]
      })
      setNextCursor(page.nextCursor)
      setUnread(page.unread)
    } catch {
      setStatus('error')
    } finally {
      setLoadingMore(false)
    }
  }

  function markLocallyRead(id: string | null) {
    const now = new Date().toISOString()
    setItems(previous => previous.map(item =>
      (id === null || item.id === id) && !item.readAt ? { ...item, readAt: now } : item
    ))
  }

  function openItem(item: InboxItem) {
    if (!item.readAt) {
      markLocallyRead(item.id)
      setUnread(count => Math.max(0, count - 1))
      void fetch(`/api/notifications/inbox/${item.id}/read`, { method: 'POST' })
    }
    setOpen(false)
    router.push(safeNotificationPath(item.url))
  }

  async function markAllRead() {
    markLocallyRead(null)
    setUnread(0)
    await fetch('/api/notifications/inbox/read-all', { method: 'POST' }).catch(() => undefined)
    void refreshUnread()
  }

  const label = unread > 0
    ? `Notifiche, ${unread} ${unread === 1 ? 'non letta' : 'non lette'}`
    : 'Notifiche'

  return (
    <Popover open={open} onOpenChange={next => void handleOpenChange(next)}>
      <PopoverTrigger asChild>
        <Button variant='ghost' size='icon' className='relative rounded-full' aria-label={label}>
          <Bell className='size-5' />
          {unread > 0 && (
            <span className='absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-medium leading-none text-white'>
              {badgeLabel(unread)}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align='end'
        collisionPadding={8}
        className='flex max-h-[calc(100dvh-5rem)] w-[calc(100vw-1rem)] flex-col p-0 sm:max-h-[32rem] sm:w-96'
      >
        <div className='flex items-center justify-between gap-2 border-b px-4 py-3'>
          <h2 className='text-sm font-semibold'>Notifiche</h2>
          {unread > 0 && (
            <Button variant='ghost' size='sm' className='h-7 px-2 text-xs' onClick={() => void markAllRead()}>
              Segna tutte come lette
            </Button>
          )}
        </div>

        <div className='min-h-0 flex-1 overflow-y-auto'>
          {status === 'loading' && items.length === 0 ? (
            <p className='px-4 py-8 text-center text-sm text-muted-foreground'>Caricamento...</p>
          ) : status === 'error' && items.length === 0 ? (
            <p className='px-4 py-8 text-center text-sm text-muted-foreground'>Impossibile caricare le notifiche.</p>
          ) : items.length === 0 ? (
            <p className='px-4 py-8 text-center text-sm text-muted-foreground'>Nessuna notifica.</p>
          ) : (
            <ul>
              {items.map((item) => {
                const Icon = iconFor(item.category)
                const isUnread = !item.readAt
                return (
                  <li key={item.id} className='border-b last:border-b-0'>
                    <button
                      type='button'
                      onClick={() => openItem(item)}
                      className='flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none'
                    >
                      <span
                        aria-hidden
                        className={cn('mt-3 size-2 shrink-0 rounded-full', isUnread ? 'bg-blue-500' : 'bg-transparent')}
                      />
                      <span className='flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground'>
                        <Icon className='size-4' />
                      </span>
                      <span className='min-w-0 flex-1'>
                        <span className={cn('block text-sm', isUnread ? 'font-semibold' : 'text-muted-foreground')}>
                          {item.title}
                          {isUnread && <span className='sr-only'> (non letta)</span>}
                        </span>
                        <span className='block text-xs text-muted-foreground break-words'>{item.body}</span>
                        <span className='mt-1 block text-[11px] text-muted-foreground/80'>
                          {formatNotificationTime(item.createdAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {nextCursor && (
          <div className='border-t p-2'>
            <Button
              variant='outline'
              size='sm'
              className='w-full'
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? 'Caricamento...' : 'Carica altro'}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
