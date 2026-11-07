'use client'

import { MarkdownContent } from '@/components/markdown-content'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion'

export type FaqItem = { id: string, question: string, answer: string, position: number }

// The questions as the admins wrote and ordered them in the settings; answers are markdown.
export default function FAQ({ items }: { items: FaqItem[] }) {
  return (
    <Accordion type='single' collapsible>
      {items.map(item => (
        <AccordionItem key={item.id} value={item.id}>
          <AccordionTrigger className='text-base font-semibold'>{item.question}</AccordionTrigger>
          {/* The answer reads apart from the question: softer, indented, with an orange edge. */}
          <AccordionContent>
            <div className='border-l-2 border-primary/50 pl-4 text-muted-foreground'>
              <MarkdownContent source={item.answer} />
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
