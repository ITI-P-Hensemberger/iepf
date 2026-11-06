// Word by word comparison of two versions of a text, for the feedback history: what the newer
// version removed and what it added. Spaces stay attached to the words, so joining the parts
// gives back each text exactly.
export type DiffPart = { kind: 'same' | 'added' | 'removed', text: string }

function tokens(text: string) {
  return text.match(/\s+|[^\s]+/g) ?? []
}

export function diffWords(before: string, after: string): DiffPart[] {
  const a = tokens(before)
  const b = tokens(after)
  // Longest common subsequence, from the end, so the walk below goes forward.
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => Array.from({ length: b.length + 1 }, () => 0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
    }
  }
  const parts: DiffPart[] = []
  const push = (kind: DiffPart['kind'], text: string) => {
    const last = parts.at(-1)
    if (last && last.kind === kind) last.text += text
    else parts.push({ kind, text })
  }
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push('same', a[i]!)
      i++
      j++
    }
    else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      push('removed', a[i++]!)
    }
    else {
      push('added', b[j++]!)
    }
  }
  while (i < a.length) push('removed', a[i++]!)
  while (j < b.length) push('added', b[j++]!)
  return parts
}
