'use client'

import { StickyBar } from '@/components/sticky-bar'
import * as React from 'react'
import type { LucideIcon } from 'lucide-react'

import { PageHeader } from '@/components/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

export interface SectionItem {
  value: string
  label: string
  icon?: LucideIcon
  // A thin line above the item, to group the sections.
  separatorBefore?: boolean
}

// A page split into sections. On a computer the sections are a menu on the left that stays in
// place while the open section scrolls. Below 1024px they become a dropdown that stops under the
// header, while the back button and the title scroll away.
export function SectionLayout({
  title,
  description,
  actions,
  backHref,
  sections,
  value,
  onValueChange,
  children
}: {
  title: React.ReactNode
  // A line under the title, and buttons beside it (below it on a phone).
  description?: React.ReactNode
  actions?: React.ReactNode
  backHref: string
  sections: readonly SectionItem[]
  value: string
  onValueChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 pt-10 pb-16'>
        <div className='mx-auto w-full max-w-6xl'>
          <PageHeader title={title} description={description} actions={actions} backHref={backHref} />
          <StickyBar className='mt-1 lg:hidden'>
            <div>
              <Select value={value} onValueChange={onValueChange}>
                <SelectTrigger className='w-full' aria-label='Sezione'>
                  <SelectValue placeholder='Seleziona sezione' />
                </SelectTrigger>
                <SelectContent>
                  {sections.map(section => (
                    <SelectItem key={section.value} value={section.value}>{section.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </StickyBar>
          <div className='mt-6 grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)]'>
            <nav
              aria-label='Sezioni'
              className='sticky top-[calc(var(--app-header-bottom)+1.5rem)] hidden max-h-[calc(100dvh-var(--app-header-bottom)-3rem)] flex-col gap-0.5 self-start overflow-y-auto lg:flex'
            >
              {sections.map((section) => {
                const Icon = section.icon
                const active = section.value === value
                return (
                  <React.Fragment key={section.value}>
                    {section.separatorBefore && <div className='mx-1 my-1.5 h-px bg-border' aria-hidden />}
                    <button
                      type='button'
                      aria-current={active ? 'page' : undefined}
                      onClick={() => onValueChange(section.value)}
                      className={cn(
                        'flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors',
                        active
                          ? 'bg-muted font-medium text-foreground'
                          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                      )}
                    >
                      {Icon && <Icon className='size-4 shrink-0' aria-hidden />}
                      {section.label}
                    </button>
                  </React.Fragment>
                )
              })}
            </nav>
            <div className='min-w-0'>{children}</div>
          </div>
        </div>
      </div>
    </main>
  )
}
