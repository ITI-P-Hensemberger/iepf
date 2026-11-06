// A small markdown subset for admin-written popups, parsed into a tree the renderer turns
// into React elements. Nothing here ever becomes HTML: text stays text, so a popup cannot
// carry markup or scripts whatever the admin types.
//
// Blocks: paragraphs, ### and #### headings, "- " / "* " lists, "1. " lists.
// Inline: **bold**, *italic* or _italic_, `code`, [text](url), single line breaks.

export type InlineNode =
  | { type: 'text', text: string }
  | { type: 'strong', children: InlineNode[] }
  | { type: 'em', children: InlineNode[] }
  | { type: 'code', text: string }
  | { type: 'link', href: string, children: InlineNode[] }
  | { type: 'break' }

export type BlockNode =
  | { type: 'paragraph', children: InlineNode[] }
  | { type: 'heading', level: 3 | 4, children: InlineNode[] }
  | { type: 'list', ordered: boolean, items: InlineNode[][] }

// The same rule as the backend: https, mailto, or a path inside IEPF.
export function safeHref(value: string): string | null {
  const href = value.trim()
  if (href.startsWith('/')) {
    return href.startsWith('//') || href.startsWith('/\\') ? null : href
  }
  try {
    const protocol = new URL(href).protocol
    return protocol === 'https:' || protocol === 'mailto:' ? href : null
  } catch {
    return null
  }
}

export function isExternalHref(href: string) {
  return !href.startsWith('/')
}

function pushText(nodes: InlineNode[], text: string) {
  if (!text) {
    return
  }
  const last = nodes[nodes.length - 1]
  if (last?.type === 'text') {
    last.text += text
  } else {
    nodes.push({ type: 'text', text })
  }
}

export function parseInline(source: string): InlineNode[] {
  const nodes: InlineNode[] = []
  let index = 0

  while (index < source.length) {
    const rest = source.slice(index)
    const char = source[index]

    if (char === '\\' && index + 1 < source.length && /[\\*_`[\]()#-]/.test(source[index + 1])) {
      pushText(nodes, source[index + 1])
      index += 2
      continue
    }
    if (char === '\n') {
      nodes.push({ type: 'break' })
      index += 1
      continue
    }
    if (char === '`') {
      const end = source.indexOf('`', index + 1)
      if (end > index + 1) {
        nodes.push({ type: 'code', text: source.slice(index + 1, end) })
        index = end + 1
        continue
      }
    }
    if (rest.startsWith('**')) {
      const end = source.indexOf('**', index + 2)
      if (end > index + 2) {
        nodes.push({ type: 'strong', children: parseInline(source.slice(index + 2, end)) })
        index = end + 2
        continue
      }
    }
    if (char === '*' || char === '_') {
      const end = source.indexOf(char, index + 1)
      if (end > index + 1 && source[index + 1] !== ' ') {
        nodes.push({ type: 'em', children: parseInline(source.slice(index + 1, end)) })
        index = end + 1
        continue
      }
    }
    if (char === '[') {
      const match = /^\[([^\]\n]+)\]\(([^)\s]+)\)/.exec(rest)
      if (match) {
        const href = safeHref(match[2])
        const children = parseInline(match[1])
        if (href) {
          nodes.push({ type: 'link', href, children })
        } else {
          // An unsafe link keeps its words and loses the link.
          children.forEach(child => (child.type === 'text' ? pushText(nodes, child.text) : nodes.push(child)))
        }
        index += match[0].length
        continue
      }
    }
    pushText(nodes, char)
    index += 1
  }

  return nodes
}

const UNORDERED = /^\s*[-*]\s+(.*)$/
const ORDERED = /^\s*\d+[.)]\s+(.*)$/
const HEADING = /^(#{1,6})\s+(.*)$/

export function parseMarkdown(source: string): BlockNode[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: BlockNode[] = []
  let paragraph: string[] = []

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: 'paragraph', children: parseInline(paragraph.join('\n')) })
      paragraph = []
    }
  }

  let index = 0
  while (index < lines.length) {
    const line = lines[index]

    if (line.trim() === '') {
      flushParagraph()
      index += 1
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      flushParagraph()
      // # and ## would compete with the popup title: every heading is h3 or h4.
      blocks.push({ type: 'heading', level: heading[1].length <= 3 ? 3 : 4, children: parseInline(heading[2].trim()) })
      index += 1
      continue
    }

    const ordered = ORDERED.test(line)
    if (ordered || UNORDERED.test(line)) {
      flushParagraph()
      const pattern = ordered ? ORDERED : UNORDERED
      const items: InlineNode[][] = []
      while (index < lines.length && pattern.test(lines[index])) {
        items.push(parseInline(pattern.exec(lines[index])![1].trim()))
        index += 1
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }

    paragraph.push(line)
    index += 1
  }
  flushParagraph()
  return blocks
}
