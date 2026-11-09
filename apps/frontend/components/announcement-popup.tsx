'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from '@tanstack/react-query'

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
import { MarkdownContent } from '@/components/markdown-content'
import {
  type ActiveAnnouncement,
  isDismissedHere,
  rememberDismissal
} from '@/lib/announcement-dismissals'
import { isExternalHref, safeHref } from '@/lib/markdown'
import { cn } from '@/lib/utils'
import { apiFetch, jsonBody } from '@/lib/api-fetch'

// The layout every popup shares, here and in the admin preview: the height stops at the
// viewport (dvh, so mobile browser bars count) and only the body scrolls.
export function AnnouncementCard({
  announcement,
  position,
  onClose,
  onOpenLink,
  preview = false
}: {
  announcement: Pick<ActiveAnnouncement, 'title' | 'body' | 'linkUrl' | 'linkLabel'>
  position?: { index: number, total: number }
  onClose?: () => void
  onOpenLink?: (href: string) => void
  preview?: boolean
}) {
  const href = announcement.linkUrl ? safeHref(announcement.linkUrl) : null
  const Title = preview ? 'h2' : AlertDialogTitle
  const Footer = preview ? 'div' : AlertDialogFooter
  const closeButton = href ? 'Chiudi' : 'Ho capito'

  return (
    <>
      <AlertDialogHeader className='shrink-0 border-b px-5 pt-5 pb-3 text-left sm:px-6'>
        {position && position.total > 1 && (
          <p className='text-xs font-medium text-muted-foreground'>
            Novità {position.index + 1} di {position.total}
          </p>
        )}
        <Title className='text-lg font-semibold leading-snug break-words'>
          {announcement.title || 'Titolo del popup'}
        </Title>
      </AlertDialogHeader>
      <div
        className='min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6'
        tabIndex={0}
        aria-label='Contenuto del popup'
      >
        {preview ? (
          <MarkdownContent source={announcement.body || '_Il testo apparirà qui._'} />
        ) : (
          <AlertDialogDescription asChild>
            <div className='text-foreground'>
              <MarkdownContent source={announcement.body} />
            </div>
          </AlertDialogDescription>
        )}
      </div>
      <Footer
        className={cn(
          'shrink-0 border-t px-5 py-3 sm:px-6',
          preview && 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'
        )}
      >
        {preview ? (
          <>
            <span className='inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium'>
              {closeButton}
            </span>
            {href && (
              <span className='inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground'>
                {announcement.linkLabel || 'Scopri di più'}
              </span>
            )}
          </>
        ) : href ? (
          <>
            <AlertDialogCancel onClick={onClose}>{closeButton}</AlertDialogCancel>
            <AlertDialogAction onClick={() => onOpenLink?.(href)}>
              {announcement.linkLabel || 'Scopri di più'}
            </AlertDialogAction>
          </>
        ) : (
          <AlertDialogAction onClick={onClose}>{closeButton}</AlertDialogAction>
        )}
      </Footer>
    </>
  )
}

export const popupFrameClassName =
  'flex max-h-[min(85dvh,40rem)] flex-col gap-0 overflow-hidden p-0'

const noAnnouncements: ActiveAnnouncement[] = []

export function AnnouncementPopup({ userId, onEmpty }: { userId: string, onEmpty?: () => void }) {
  const router = useRouter()
  // A popup is never worth an error on screen. Nothing is kept once it unmounts: on the next
  // visit the list is read again, without the ones closed meanwhile.
  const active = useQuery({
    queryKey: ['announcements', 'active', userId],
    queryFn: async () => {
      const items = await apiFetch<ActiveAnnouncement[]>('/api/announcements/active', 'Impossibile caricare le novità.')
      return Array.isArray(items) ? items.filter(item => !isDismissedHere(window.localStorage, userId, item)) : []
    },
    gcTime: 0,
    retry: false,
    meta: { inline: true }
  })
  const queue = active.data ?? noAnnouncements
  const total = queue.length
  const loaded = !active.isPending
  const [shown, setShown] = React.useState(0)
  const current = queue[shown]
  const dismiss = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/announcements/${encodeURIComponent(id)}/dismiss`, 'Impossibile chiudere la novità.', jsonBody('POST')),
    meta: { inline: true }
  })
  const { mutate: dismissOnServer } = dismiss

  // The next popup in line (push setup) waits until these are all closed.
  React.useEffect(() => {
    if (loaded && !current) onEmpty?.()
  }, [loaded, current, onEmpty])
  // Radix closes the dialog after every action button too: handle each popup once.
  const handledId = React.useRef<string | null>(null)

  const dismissCurrent = React.useCallback(() => {
    if (!current || handledId.current === current.id) {
      return
    }
    handledId.current = current.id
    rememberDismissal(window.localStorage, userId, current)
    if (current.dismissMode === 'once_account') {
      dismissOnServer(current.id)
    }
    setShown(previous => previous + 1)
  }, [current, userId, dismissOnServer])

  const openLink = React.useCallback(
    (href: string) => {
      dismissCurrent()
      if (isExternalHref(href)) {
        window.open(href, '_blank', 'noopener,noreferrer')
      } else {
        router.push(href)
      }
    },
    [dismissCurrent, router]
  )

  if (!current) {
    return null
  }

  return (
    <AlertDialog
      // A new key per popup replays the open animation instead of swapping text in place.
      key={current.id}
      open
      onOpenChange={open => {
        if (!open) {
          dismissCurrent()
        }
      }}
    >
      <AlertDialogContent className={popupFrameClassName}>
        <AnnouncementCard
          announcement={current}
          position={{ index: shown, total }}
          onClose={dismissCurrent}
          onOpenLink={openLink}
        />
      </AlertDialogContent>
    </AlertDialog>
  )
}
