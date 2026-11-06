// Edits behind the popup editor's toolbar: each one wraps or prefixes the selected text with
// the markdown of lib/markdown.ts and says where the selection goes next.

export type ToolbarFormat = 'bold' | 'italic' | 'code' | 'heading' | 'bulletList' | 'numberedList' | 'link'

export type EditorState = { value: string, selectionStart: number, selectionEnd: number }

const WRAPPERS: Partial<Record<ToolbarFormat, { marker: string, placeholder: string }>> = {
  bold: { marker: '**', placeholder: 'testo in grassetto' },
  italic: { marker: '*', placeholder: 'testo in corsivo' },
  code: { marker: '`', placeholder: 'codice' }
}

function wrap(state: EditorState, marker: string, placeholder: string): EditorState {
  const { value, selectionStart: start, selectionEnd: end } = state
  const selected = value.slice(start, end)
  const before = value.slice(0, start)
  const after = value.slice(end)

  // Pressing it again on wrapped text takes the markers away.
  if (selected && before.endsWith(marker) && after.startsWith(marker)) {
    return {
      value: before.slice(0, -marker.length) + selected + after.slice(marker.length),
      selectionStart: start - marker.length,
      selectionEnd: end - marker.length
    }
  }

  const text = selected || placeholder
  return {
    value: before + marker + text + marker + after,
    selectionStart: start + marker.length,
    selectionEnd: start + marker.length + text.length
  }
}

// Whole lines touched by the selection get the prefix; an empty line gets a placeholder.
function prefixLines(state: EditorState, prefixFor: (index: number) => string, placeholder: string): EditorState {
  const { value, selectionStart, selectionEnd } = state
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1
  const nextBreak = value.indexOf('\n', selectionEnd)
  const lineEnd = nextBreak === -1 ? value.length : nextBreak
  const lines = value.slice(lineStart, lineEnd).split('\n')

  const updated = lines
    .map((line, index) => prefixFor(index) + (line.replace(/^(#{1,6}\s+|\s*[-*]\s+|\s*\d+[.)]\s+)/, '') || placeholder))
    .join('\n')

  // A block needs a blank line before it, or it would join the paragraph above.
  const needsGap = lineStart > 0 && value.slice(0, lineStart) !== '' && !value.slice(0, lineStart).endsWith('\n\n')
  const gap = needsGap ? '\n' : ''
  return {
    value: value.slice(0, lineStart) + gap + updated + value.slice(lineEnd),
    selectionStart: lineStart + gap.length,
    selectionEnd: lineStart + gap.length + updated.length
  }
}

export function applyFormat(state: EditorState, format: ToolbarFormat, url?: string): EditorState {
  const wrapper = WRAPPERS[format]
  if (wrapper) {
    return wrap(state, wrapper.marker, wrapper.placeholder)
  }
  if (format === 'heading') {
    return prefixLines(state, () => '### ', 'Titolo')
  }
  if (format === 'bulletList') {
    return prefixLines(state, () => '- ', 'elemento')
  }
  if (format === 'numberedList') {
    return prefixLines(state, index => `${index + 1}. `, 'elemento')
  }

  const { value, selectionStart: start, selectionEnd: end } = state
  const label = value.slice(start, end) || 'testo del link'
  const inserted = `[${label}](${url ?? 'https://'})`
  return {
    value: value.slice(0, start) + inserted + value.slice(end),
    selectionStart: start + 1,
    selectionEnd: start + 1 + label.length
  }
}
