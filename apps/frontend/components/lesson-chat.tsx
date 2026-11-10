'use client'

// The chat between a booking's student and the lesson's tutor. Both write from the booking until
// the lesson ends; afterwards (or once canceled) it stays readable. The organizers read it only.
// Students and tutors find every chat behind the floating button at the bottom right: the "Chat"
// buttons on the pages and the ?chat=<booking> links of the notifications open it there.
// New messages arrive through the notification stream: the bell invalidates ['lesson-chat'].
import * as React from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { BellRing, ChevronLeft, MessagesSquare, Send, X } from 'lucide-react'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { BlockSkeleton } from '@/components/loading'
import { openPushSetup, usePushSetup } from '@/components/push-prompt'
import type { ApiResponse } from '@/lib/api'
import { apiFetch, jsonBody } from '@/lib/api-fetch'
import { useSetParam } from '@/lib/back-link'
import { capitalizeFirst } from '@/lib/capitalize'
import { useSession } from '@/lib/use-session'
import { cn } from '@/lib/utils'

type Chat = ApiResponse<'/lessons/{lessonId}/bookings/{bookingId}/messages'>
type ChatSummary = ApiResponse<'/lesson-messages'>[number]
type ChatRole = 'student' | 'tutor'
type Target = { lessonId: string, bookingId: string }

export const CHAT_PARAM = 'chat'
const MESSAGE_MAX = 2_000
const LIST_KEY = ['lesson-chat', 'list']
const noChats: ChatSummary[] = []

const timeFormat = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const lessonFormat = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function useChatList(enabled = true) {
  const { data = noChats, isPending } = useQuery({
    queryKey: LIST_KEY,
    queryFn: () => apiFetch<ChatSummary[]>('/api/lesson-messages', 'Impossibile caricare le chat.'),
    enabled
  })
  return { chats: data, isPending }
}

// Unread messages per booking, for the "Chat" buttons.
export function useChatUnread() {
  const { chats } = useChatList()
  return React.useMemo(() => new Map(chats.map((chat) => [chat.bookingId, chat.unread])), [chats])
}

const ChatContext = React.createContext<{ openChat: (bookingId: string) => void } | null>(null)

// Opens a chat in the floating panel; outside students' and tutors' pages it does nothing.
export function useOpenChat() {
  return React.useContext(ChatContext)?.openChat ?? (() => {})
}

export function ChatButton({ unread = 0, className, onClick }: { unread?: number, className?: string, onClick: () => void }) {
  return (
    <Button size='sm' variant='outline' className={className} onClick={onClick}>
      <MessagesSquare className='h-4 w-4' /> Chat
      {unread > 0 && <Badge className='ml-1 h-5 min-w-5 px-1.5'>{unread}<span className='sr-only'> non letti</span></Badge>}
    </Button>
  )
}

// Push is how a reply reaches someone who closed the page: asked for in every chat until it is on.
function PushBanner({ role }: { role: ChatRole }) {
  const needed = usePushSetup(role)
  if (!needed) return null
  return (
    <div className='flex items-center gap-3 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm'>
      <BellRing className='h-4 w-4 shrink-0 text-[var(--primary-text)]' />
      <span className='flex-1'>Attiva le notifiche per sapere subito quando ti rispondono.</span>
      <Button size='sm' variant='outline' onClick={openPushSetup}>Attiva</Button>
    </div>
  )
}

// The messages and, for the two people in it, the box to write: in the floating panel and,
// read-only, in the organizers' dialog.
function ChatConversation({ target, role, className }: { target: Target, role: ChatRole | 'admin', className?: string }) {
  const readOnly = role === 'admin'
  const queryClient = useQueryClient()
  const [text, setText] = React.useState('')
  const listRef = React.useRef<HTMLDivElement>(null)
  const base = `/api/lessons/${target.lessonId}/bookings/${target.bookingId}/messages`

  const chat = useQuery({
    queryKey: ['lesson-chat', target.bookingId],
    queryFn: () => apiFetch<Chat>(base, 'Impossibile caricare la chat.')
  })
  const messages = chat.data?.messages
  const unreadFromOther = Boolean(messages?.some((message) => !message.mine && !message.readAt))

  // What the other person wrote counts as read once it is on screen.
  const { mutate: markRead } = useMutation({
    mutationFn: () => apiFetch(`${base}/read`, 'Impossibile aggiornare la chat.', jsonBody('POST')),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY })
  })
  React.useEffect(() => {
    if (!readOnly && unreadFromOther) markRead()
  }, [readOnly, unreadFromOther, markRead, messages])

  React.useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages?.length])

  const send = useMutation({
    mutationFn: (body: string) => apiFetch(base, 'Impossibile inviare il messaggio.', jsonBody('POST', { body })),
    onSuccess: () => setText(''),
    // Also on error: the lesson may have just ended, and the chat shows that it closed.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['lesson-chat'] })
  })

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const body = text.trim()
    if (body && !send.isPending) send.mutate(body)
  }

  const open = chat.data?.open ?? false

  return (
    <div className={cn('flex min-h-0 flex-col gap-3', className)}>
      {!readOnly && open && <PushBanner role={role} />}
      <div ref={listRef} className='min-h-32 flex-1 space-y-2 overflow-y-auto overscroll-contain rounded-md border bg-muted/30 p-3' aria-live='polite'>
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
                  right && !readOnly ? 'bg-primary text-primary-foreground' : 'border bg-card'
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
    </div>
  )
}

// The organizers' read-only view, from the lesson page.
export function LessonChatDialog({ target, title, onClose }: { target: Target | null, title: string, onClose: () => void }) {
  return (
    <AlertDialog open={target !== null} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent className='max-w-[calc(100%-2rem)] sm:max-w-lg'>
        <AlertDialogHeader className='text-left sm:text-left'>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className='text-left'>Tra lo studente e il tutor della lezione. Solo lettura.</AlertDialogDescription>
        </AlertDialogHeader>
        {target && <ChatConversation target={target} role='admin' className='max-h-[50vh]' />}
        <AlertDialogFooter>
          <AlertDialogCancel>Chiudi</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function lessonLine(chat: ChatSummary) {
  return `${chat.subjectName} · ${lessonFormat.format(new Date(chat.startAt))}`
}

function ChatList({ chats, loading, role, onPick }: { chats: ChatSummary[], loading: boolean, role: ChatRole, onPick: (bookingId: string) => void }) {
  if (loading) return <BlockSkeleton lines={3} />
  if (chats.length === 0) {
    return (
      <p className='py-8 text-center text-sm text-muted-foreground'>
        {role === 'student'
          ? 'Nessuna chat. Ne trovi una per ogni lezione che prenoti.'
          : 'Nessuna chat. Ne trovi una per ogni studente che prenota una tua lezione.'}
      </p>
    )
  }
  return (
    <ul className='space-y-2'>
      {chats.map((chat) => (
        <li key={chat.bookingId}>
          <button
            type='button'
            onClick={() => onPick(chat.bookingId)}
            className={cn('flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:border-primary/50', !chat.open && 'opacity-70')}
          >
            <span className='min-w-0 flex-1'>
              <span className='block truncate font-medium'>{chat.otherName}</span>
              <span className='block truncate text-xs text-muted-foreground'>
                {lessonLine(chat)}{chat.open ? '' : ' · chiusa'}
              </span>
            </span>
            {chat.unread > 0 && <Badge className='h-5 min-w-5 px-1.5'>{chat.unread}<span className='sr-only'> non letti</span></Badge>}
          </button>
        </li>
      ))}
    </ul>
  )
}

// A ?chat=<booking> link (from a notification) opens that chat, then leaves the URL.
// In its own Suspense: reading the URL must not hold up the page.
function ChatLinkWatcher({ onLink }: { onLink: (bookingId: string) => void }) {
  const searchParams = useSearchParams()
  const setParam = useSetParam()
  const linked = searchParams.get(CHAT_PARAM)
  React.useEffect(() => {
    if (!linked) return
    onLink(linked)
    setParam(CHAT_PARAM, null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked])
  return null
}

// The floating chat button and its panel, for students and tutors, around their pages.
export function LessonChatProvider({ role, children }: { role: ChatRole, children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const [active, setActive] = React.useState<string | null>(null)
  const { profile } = useSession()
  const pathname = usePathname()
  // Not while waiting for activation or during the tutor's first setup: no lessons yet.
  const enabled = profile?.role === role && profile.isActive !== false && !pathname.endsWith('/pending') && pathname !== '/tutor/onboarding'
  const { chats, isPending } = useChatList(enabled)
  const unread = chats.reduce((total, chat) => total + chat.unread, 0)
  const current = active ? chats.find((chat) => chat.bookingId === active) : undefined

  const openChat = React.useCallback((bookingId: string) => {
    setActive(bookingId)
    setOpen(true)
  }, [])
  const context = React.useMemo(() => ({ openChat }), [openChat])

  return (
    <ChatContext.Provider value={context}>
      {children}
      {enabled && (
      <>
      <React.Suspense fallback={null}>
        <ChatLinkWatcher onLink={openChat} />
      </React.Suspense>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type='button'
            size='icon'
            // The button always starts from the list.
            onClick={() => setActive(null)}
            aria-label={unread > 0 ? `Chat, ${unread} ${unread === 1 ? 'messaggio non letto' : 'messaggi non letti'}` : 'Chat'}
            className='fixed right-4 bottom-4 z-40 size-14 rounded-full shadow-lg'
          >
            <MessagesSquare className='size-6' />
            {unread > 0 && (
              <span aria-hidden className='absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-xs font-semibold text-white'>
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side='top'
          align='end'
          sideOffset={12}
          // Opening the notifications setup from the banner must not close the chat behind it.
          onInteractOutside={(event) => {
            if ((event.target as Element | null)?.closest?.('[role="alertdialog"]')) event.preventDefault()
          }}
          className='flex h-[min(34rem,calc(100dvh-7rem))] w-[min(24rem,calc(100vw-2rem))] flex-col gap-3 p-3'
        >
          <div className='flex items-start gap-2'>
            {current && (
              <Button variant='ghost' size='icon' className='size-8 shrink-0' aria-label='Tutte le chat' onClick={() => setActive(null)}>
                <ChevronLeft className='h-4 w-4' />
              </Button>
            )}
            <div className='min-w-0 flex-1'>
              <h2 className='truncate font-semibold'>{current ? current.otherName : 'Chat'}</h2>
              <p className='truncate text-xs text-muted-foreground'>
                {current ? lessonLine(current) : 'Gli organizzatori possono leggere le chat.'}
              </p>
            </div>
            <Button variant='ghost' size='icon' className='size-8 shrink-0' aria-label='Chiudi' onClick={() => setOpen(false)}>
              <X className='h-4 w-4' />
            </Button>
          </div>
          {current ? (
            <ChatConversation key={current.bookingId} target={current} role={role} className='flex-1' />
          ) : (
            <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain'>
              <ChatList chats={chats} loading={isPending} role={role} onPick={setActive} />
            </div>
          )}
        </PopoverContent>
      </Popover>
      </>
      )}
    </ChatContext.Provider>
  )
}
