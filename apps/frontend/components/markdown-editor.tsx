'use client'

import * as React from 'react'
import { Bold, Code, Heading, Italic, Link2, List, ListOrdered } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { safeHref } from '@/lib/markdown'
import { applyFormat, type ToolbarFormat } from '@/lib/markdown-toolbar'

// A textarea with a toolbar that writes the markdown subset of lib/markdown.ts.
const TOOLBAR: Array<{ format: ToolbarFormat, label: string, icon: React.ComponentType<{ className?: string }>, shortcut?: string }> = [
  { format: 'bold', label: 'Grassetto', icon: Bold, shortcut: 'b' },
  { format: 'italic', label: 'Corsivo', icon: Italic, shortcut: 'i' },
  { format: 'heading', label: 'Titoletto', icon: Heading },
  { format: 'bulletList', label: 'Elenco puntato', icon: List },
  { format: 'numberedList', label: 'Elenco numerato', icon: ListOrdered },
  { format: 'code', label: 'Codice', icon: Code }
]

export function MarkdownEditor({
  id,
  value,
  onChange,
  maxLength,
  rows = 10,
  placeholder = 'Scrivi qui il testo. Usa la barra sopra per **grassetto**, elenchi e link.'
}: {
  id: string
  value: string
  onChange: (value: string) => void
  maxLength: number
  rows?: number
  placeholder?: string
}) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const [linkOpen, setLinkOpen] = React.useState(false)
  const [linkUrl, setLinkUrl] = React.useState('https://')
  const selection = React.useRef({ start: 0, end: 0 })

  const apply = (formatName: ToolbarFormat, url?: string) => {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = formatName === 'link' ? selection.current.start : textarea.selectionStart
    const end = formatName === 'link' ? selection.current.end : textarea.selectionEnd
    const next = applyFormat({ value, selectionStart: start, selectionEnd: end }, formatName, url)
    onChange(next.value)
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(next.selectionStart, next.selectionEnd)
    })
  }

  return (
    <div className='rounded-md border focus-within:ring-[3px] focus-within:ring-ring/50'>
      <div className='flex flex-wrap items-center gap-1 border-b p-1' role='toolbar' aria-label='Formattazione'>
        {TOOLBAR.map(item => (
          <Button
            key={item.format}
            type='button'
            variant='ghost'
            size='icon'
            className='size-9'
            title={item.shortcut ? `${item.label} (Ctrl/⌘+${item.shortcut.toUpperCase()})` : item.label}
            aria-label={item.label}
            onMouseDown={event => event.preventDefault()}
            onClick={() => apply(item.format)}
          >
            <item.icon className='size-4' />
          </Button>
        ))}
        <Popover
          open={linkOpen}
          onOpenChange={open => {
            if (open && textareaRef.current) {
              selection.current = {
                start: textareaRef.current.selectionStart,
                end: textareaRef.current.selectionEnd
              }
              setLinkUrl('https://')
            }
            setLinkOpen(open)
          }}
        >
          <PopoverTrigger asChild>
            <Button type='button' variant='ghost' size='icon' className='size-9' title='Link' aria-label='Link'>
              <Link2 className='size-4' />
            </Button>
          </PopoverTrigger>
          <PopoverContent className='w-72' align='start'>
            <form
              className='space-y-2'
              onSubmit={event => {
                event.preventDefault()
                const href = safeHref(linkUrl)
                if (!href) {
                  toast.error('Usa un link https://, mailto: o un percorso che inizia con /.')
                  return
                }
                setLinkOpen(false)
                apply('link', href)
              }}
            >
              <Label htmlFor={`${id}-link-url`}>Indirizzo del link</Label>
              <Input
                id={`${id}-link-url`}
                value={linkUrl}
                onChange={event => setLinkUrl(event.target.value)}
                inputMode='url'
                autoFocus
              />
              <Button type='submit' size='sm' className='w-full'>Inserisci link</Button>
            </form>
          </PopoverContent>
        </Popover>
      </div>
      <Textarea
        ref={textareaRef}
        id={id}
        value={value}
        maxLength={maxLength}
        onChange={event => onChange(event.target.value)}
        onKeyDown={event => {
          if (!(event.metaKey || event.ctrlKey)) return
          const item = TOOLBAR.find(entry => entry.shortcut === event.key.toLowerCase())
          if (item) {
            event.preventDefault()
            apply(item.format)
          }
        }}
        rows={rows}
        className='min-h-32 resize-y rounded-none border-0 font-mono text-sm shadow-none focus-visible:ring-0'
        placeholder={placeholder}
      />
      <div className='flex justify-end border-t px-3 py-1 text-xs text-muted-foreground'>
        {value.length}/{maxLength}
      </div>
    </div>
  )
}
