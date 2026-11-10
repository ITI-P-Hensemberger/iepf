'use client'

import { BlockSkeleton } from '@/components/loading'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell,
  CalendarCheck,
  CalendarClock,
  Clock,
  type LucideIcon,
  MessageSquare,
  ShieldAlert,
  Sparkles,
  UserCheck,
  X
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
import { apiFetch } from '@/lib/api-fetch'
import { type InfiniteData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { watchUnread } from '@/lib/notification-stream'
import { isImpersonating } from '@/lib/push-client'
import { track } from '@/lib/usage-analytics'
import { cn } from '@/lib/utils'

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  bookings: CalendarCheck,
  updates: CalendarClock,
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
  return apiFetch<InboxPage>(`/api/notifications/inbox${query}`, 'Impossibile caricare le notifiche.')
}

async function fetchUnread() {
  const payload = await apiFetch<{ count?: number }>('/api/notifications/inbox/unread', 'Impossibile caricare le notifiche.')
  if (typeof payload.count !== 'number') throw new Error('Impossibile caricare le notifiche.')
  return payload.count
}

const UNREAD_KEY = ['notifications', 'unread']
const INBOX_KEY = ['notifications', 'inbox']
type Inbox = InfiniteData<InboxPage, string | null>
const noItems: InboxItem[] = []

// Fire and forget: the panel already shows the change, and the counter is read again after.
function inboxAction(path: string) {
  return fetch(path, { method: 'POST' }).then((response) => {
    if (!response.ok) throw new Error('Impossibile aggiornare le notifiche.')
  })
}

export function NotificationBell() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)

  // Undefined until the first real count: the initial 0 must not clear the icon badge.
  const unreadQuery = useQuery({
    queryKey: UNREAD_KEY,
    queryFn: fetchUnread,
    retry: false,
    meta: { inline: true }
  })
  const unread = unreadQuery.data ?? 0
  const countKnown = unreadQuery.data !== undefined
  const setUnread = React.useCallback(
    (update: (count: number) => number) => queryClient.setQueryData<number>(UNREAD_KEY, (count) => update(count ?? 0)),
    [queryClient]
  )
  const refreshUnread = React.useCallback(
    () => queryClient.invalidateQueries({ queryKey: UNREAD_KEY }),
    [queryClient]
  )

  // The panel's pages, loaded while it is open; each page also brings the current count.
  const inbox = useInfiniteQuery({
    queryKey: INBOX_KEY,
    queryFn: async ({ pageParam }) => {
      const page = await fetchInbox(pageParam)
      queryClient.setQueryData(UNREAD_KEY, page.unread)
      return page
    },
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: open,
    retry: false,
    meta: { inline: true }
  })
  const items = React.useMemo(() => {
    if (!inbox.data) return noItems
    // A notification can move to the next page while it loads: each one once.
    const seen = new Set<string>()
    return inbox.data.pages.flatMap((page) => page.items).filter((item) => !seen.has(item.id) && Boolean(seen.add(item.id)))
  }, [inbox.data])

  // The counter follows the page being opened, a return to the tab and every push.
  React.useEffect(() => {
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
            queryClient.setQueryData(UNREAD_KEY, count)
            // A new lesson chat message also wakes the stream: open chats and their counts reload.
            void queryClient.invalidateQueries({ queryKey: ['lesson-chat'] })
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
  }, [queryClient])

  // The icon of the installed app shows the same count as the bell, but never the count of
  // someone an admin is impersonating on the admin's own device.
  React.useEffect(() => {
    if (countKnown && !isImpersonating()) void syncAppBadge(unread)
  }, [countKnown, unread])

  // Opening the panel reloads from the first page; it never marks anything as read.
  function handleOpenChange(next: boolean) {
    if (next) {
      track('bell_open')
      queryClient.setQueryData<Inbox>(INBOX_KEY, (data) => data && {
        pages: data.pages.slice(0, 1),
        pageParams: data.pageParams.slice(0, 1)
      })
    }
    setOpen(next)
  }

  function editItems(edit: (items: InboxItem[]) => InboxItem[]) {
    queryClient.setQueryData<Inbox>(INBOX_KEY, (data) => data && {
      ...data,
      pages: data.pages.map((page) => ({ ...page, items: edit(page.items) }))
    })
  }

  function markLocallyRead(id: string | null) {
    const now = new Date().toISOString()
    editItems((list) => list.map((item) =>
      (id === null || item.id === id) && !item.readAt ? { ...item, readAt: now } : item
    ))
  }

  const markRead = useMutation({
    mutationFn: (item: InboxItem) => inboxAction(`/api/notifications/inbox/${item.id}/read`),
    meta: { inline: true }
  })
  // "Elimina": gone from the panel and counted as read; the server keeps it archived.
  const archive = useMutation({
    mutationFn: (item: InboxItem) => inboxAction(`/api/notifications/inbox/${item.id}/archive`),
    onSettled: refreshUnread,
    meta: { inline: true }
  })
  const readAll = useMutation({
    mutationFn: () => inboxAction('/api/notifications/inbox/read-all'),
    onSettled: refreshUnread,
    meta: { inline: true }
  })

  function openItem(item: InboxItem) {
    track('inbox_click', item.category)
    if (!item.readAt) {
      markLocallyRead(item.id)
      setUnread(count => Math.max(0, count - 1))
      markRead.mutate(item)
    }
    setOpen(false)
    router.push(safeNotificationPath(item.url))
  }

  function removeItem(item: InboxItem) {
    editItems((list) => list.filter(other => other.id !== item.id))
    if (!item.readAt) setUnread(count => Math.max(0, count - 1))
    archive.mutate(item)
  }

  function markAllRead() {
    markLocallyRead(null)
    setUnread(() => 0)
    readAll.mutate()
  }

  const nextCursor = inbox.hasNextPage
  const loadingMore = inbox.isFetchingNextPage
  const status = inbox.isPending && open ? 'loading' : inbox.isError ? 'error' : 'idle'
  function loadMore() {
    void inbox.fetchNextPage()
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
          <div className='flex items-center gap-1'>
            {unread > 0 && (
              <Button variant='ghost' size='sm' className='h-7 px-2 text-xs' onClick={() => void markAllRead()}>
                Segna tutte come lette
              </Button>
            )}
          </div>
        </div>

        <div className='min-h-0 flex-1 overflow-y-auto'>
          {status === 'loading' && items.length === 0 ? (
            <div className='px-4 py-4'><BlockSkeleton lines={3} /></div>
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
                  <li key={item.id} className='group relative border-b last:border-b-0'>
                    <button
                      type='button'
                      onClick={() => openItem(item)}
                      className='flex w-full items-start gap-3 py-3 pr-11 pl-4 text-left hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none'
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
                        <span className='block text-xs text-muted-foreground break-words whitespace-pre-line'>{item.body}</span>
                        <span className='mt-1 block text-[11px] text-muted-foreground/80'>
                          {formatNotificationTime(item.createdAt)}
                        </span>
                      </span>
                    </button>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      aria-label={`Elimina la notifica: ${item.title}`}
                      title='Elimina'
                      onClick={() => removeItem(item)}
                      className='absolute top-2 right-2 size-7 text-muted-foreground hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100'
                    >
                      <X className='size-4' />
                    </Button>
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
