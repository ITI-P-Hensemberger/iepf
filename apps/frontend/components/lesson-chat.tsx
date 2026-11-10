'use client'

// The chat between a booking's student and the lesson's tutor. Both write from the booking until
// the lesson ends; afterwards (or once canceled) it stays readable. The organizers read it only.
// New messages arrive through the notification stream: the bell invalidates ['lesson-chat'].
import * as React from 'react'
import { MessagesSquare, Send } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { BlockSkeleton } from '@/components/loading'
import type { ApiResponse } from '@/lib/api'
import { apiFetch, jsonBody } from '@/lib/api-fetch'
import { capitalizeFirst } from '@/lib/capitalize'
import { cn } from '@/lib/utils'

type Chat = ApiResponse<'/lessons/{lessonId}/bookings/{bookingId}/messages'>
type Unread = ApiResponse<'/lesson-messages/unread'>

export const CHAT_PARAM = 'chat'
const MESSAGE_MAX = 2_000

const timeFormat = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

// Unread messages per booking, for the "Chat" buttons. Admins get none.
export function useChatUnread(enabled = true) {
  const { data } = useQuery({
    queryKey: ['lesson-chat', 'unread'],
    queryFn: () => apiFetch<Unread>('/api/lesson-messages/unread', 'Impossibile caricare i messaggi.'),
    enabled
  })
  return React.useMemo(() => new Map((data ?? []).map((row) => [row.bookingId, row.count])), [data])
}

export function ChatButton({ unread = 0, className, onClick }: { unread?: number, className?: string, onClick: () => void }) {
  return (
    <Button size='sm' variant='outline' className={className} onClick={onClick}>
      <MessagesSquare className='h-4 w-4' /> Chat
      {unread > 0 && <Badge className='ml-1 h-5 min-w-5 px-1.5'>{unread}<span className='sr-only'> non letti</span></Badge>}
    </Button>
  )
}

export function LessonChatDialog({
  target,
  title,
  description,
  readOnly = false,
  onClose
}: {
  target: { lessonId: string, bookingId: string } | null
  title: string
  description?: string
  // The organizers: they read, with the sender named on each message.
  readOnly?: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [text, setText] = React.useState('')
  const listRef = React.useRef<HTMLDivElement>(null)
  const base = target ? `/api/lessons/${target.lessonId}/bookings/${target.bookingId}/messages` : ''

  const chat = useQuery({
    queryKey: ['lesson-chat', target?.bookingId],
    queryFn: () => apiFetch<Chat>(base, 'Impossibile caricare la chat.'),
    enabled: target !== null
  })
  const messages = chat.data?.messages
  const unreadFromOther = Boolean(messages?.some((message) => !message.mine && !message.readAt))

  // What the other person wrote counts as read once it is on screen.
  const markRead = useMutation({
    mutationFn: () => apiFetch(`${base}/read`, 'Impossibile aggiornare la chat.', jsonBody('POST')),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lesson-chat', 'unread'] })
  })
  const { mutate: markReadNow } = markRead
  React.useEffect(() => {
    if (!readOnly && unreadFromOther) markReadNow()
  }, [readOnly, unreadFromOther, markReadNow, messages])

  React.useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages?.length])

  const send = useMutation({
    mutationFn: (body: string) => apiFetch(base, 'Impossibile inviare il messaggio.', jsonBody('POST', { body })),
    onSuccess: async () => {
      setText('')
      await queryClient.invalidateQueries({ queryKey: ['lesson-chat', target?.bookingId] })
    },
    // The lesson may have just ended: the chat shows that it closed.
    onError: () => queryClient.invalidateQueries({ queryKey: ['lesson-chat', target?.bookingId] })
  })

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const body = text.trim()
    if (body && !send.isPending) send.mutate(body)
  }

  const close = () => {
    setText('')
    onClose()
  }

  const open = chat.data?.open ?? false

  return (
    <AlertDialog open={target !== null} onOpenChange={(next) => !next && close()}>
      <AlertDialogContent className='max-w-[calc(100%-2rem)] sm:max-w-lg'>
        <AlertDialogHeader className='text-left sm:text-left'>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className='text-left'>
            {description ? `${description} ` : ''}
            {readOnly ? 'Solo lettura.' : 'Gli organizzatori possono leggere la chat.'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div ref={listRef} className='max-h-[50vh] min-h-32 space-y-2 overflow-y-auto rounded-md border bg-muted/30 p-3' aria-live='polite'>
          {chat.isPending ? (
            <BlockSkeleton lines={2} />
          ) : !messages?.length ? (
            <p className='py-8 text-center text-sm text-muted-foreground'>
              {readOnly || !open ? 'Nessun messaggio.' : 'Nessun messaggio. Scrivi per chiedere un chiarimento sulla lezione.'}
            </p>
          ) : (
            messages.map((message) => {
              // For the organizers the student sits on the left, the tutor on the right.
              const right = readOnly ? message.senderRole === 'tutor' : message.mine
              return (
                <div key={message.id} className={cn('flex flex-col', right ? 'items-end' : 'items-start')}>
                  <div className={cn(
                    'max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words',
                    right && !readOnly ? 'bg-primary text-primary-foreground' : 'bg-card border'
                  )}
                  >
                    {message.body}
                  </div>
                  <span className='mt-0.5 text-xs text-muted-foreground'>
                    {readOnly && `${message.senderRole === 'tutor' ? 'Tutor' : 'Studente'} · `}
                    {timeFormat.format(new Date(message.createdAt))}
                  </span>
                </div>
              )
            })
          )}
        </div>

        {!readOnly && (open ? (
          <form onSubmit={submit} className='flex items-end gap-2'>
            <Textarea
              aria-label='Messaggio'
              value={text}
              maxLength={MESSAGE_MAX}
              rows={2}
              placeholder='Scrivi un messaggio'
              onChange={(event) => setText(capitalizeFirst(event.target.value))}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit(event)
              }}
              className='min-h-0 flex-1 resize-none'
            />
            <Button type='submit' size='icon' aria-label='Invia' disabled={!text.trim() || send.isPending}>
              <Send className='h-4 w-4' />
            </Button>
          </form>
        ) : chat.data && (
          <p className='text-sm text-muted-foreground'>La chat è chiusa: la lezione è finita o è stata annullata.</p>
        ))}

        <AlertDialogFooter>
          <AlertDialogCancel>Chiudi</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
