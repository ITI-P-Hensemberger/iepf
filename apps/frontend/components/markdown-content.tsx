import * as React from 'react'

import { cn } from '@/lib/utils'
import { type InlineNode, isExternalHref, parseMarkdown } from '@/lib/markdown'

function renderInline(nodes: InlineNode[]): React.ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.type) {
      case 'text':
        return <React.Fragment key={index}>{node.text}</React.Fragment>
      case 'break':
        return <br key={index} />
      case 'strong':
        return <strong key={index} className='font-semibold'>{renderInline(node.children)}</strong>
      case 'em':
        return <em key={index}>{renderInline(node.children)}</em>
      case 'code':
        return (
          <code key={index} className='rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]'>
            {node.text}
          </code>
        )
      case 'link':
        return (
          <a
            key={index}
            href={node.href}
            className='font-medium text-primary underline underline-offset-4 break-words'
            {...(isExternalHref(node.href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          >
            {renderInline(node.children)}
          </a>
        )
    }
  })
}

// Renders the markdown subset of lib/markdown.ts as React elements, never as HTML.
export function MarkdownContent({ source, className }: { source: string, className?: string }) {
  const blocks = React.useMemo(() => parseMarkdown(source), [source])

  return (
    <div className={cn('space-y-3 text-sm leading-relaxed break-words', className)}>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const Tag = block.level === 3 ? 'h3' : 'h4'
          return (
            <Tag key={index} className={block.level === 3 ? 'text-base font-semibold' : 'text-sm font-semibold'}>
              {renderInline(block.children)}
            </Tag>
          )
        }
        if (block.type === 'list') {
          const Tag = block.ordered ? 'ol' : 'ul'
          return (
            <Tag key={index} className={cn('space-y-1 pl-5', block.ordered ? 'list-decimal' : 'list-disc')}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInline(item)}</li>
              ))}
            </Tag>
          )
        }
        return <p key={index}>{renderInline(block.children)}</p>
      })}
    </div>
  )
}
