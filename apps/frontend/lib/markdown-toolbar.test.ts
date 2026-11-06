import { describe, expect, it } from 'vitest'

import { applyFormat, type EditorState } from './markdown-toolbar'

function select(value: string, selected: string): EditorState {
  const start = value.indexOf(selected)
  return { value, selectionStart: start, selectionEnd: start + selected.length }
}

describe('applyFormat', () => {
  it('wraps the selection and keeps it selected', () => {
    const result = applyFormat(select('ciao mondo', 'mondo'), 'bold')
    expect(result.value).toBe('ciao **mondo**')
    expect(result.value.slice(result.selectionStart, result.selectionEnd)).toBe('mondo')
  })

  it('takes the markers away when pressed again', () => {
    const once = applyFormat(select('ciao mondo', 'mondo'), 'italic')
    expect(applyFormat(once, 'italic').value).toBe('ciao mondo')
  })

  it('inserts a selected placeholder at the cursor', () => {
    const result = applyFormat({ value: 'a ', selectionStart: 2, selectionEnd: 2 }, 'code')
    expect(result.value).toBe('a `codice`')
    expect(result.value.slice(result.selectionStart, result.selectionEnd)).toBe('codice')
  })

  it('turns the selected lines into a list, after a blank line', () => {
    const value = 'Intro\nuno\ndue'
    const result = applyFormat({ value, selectionStart: value.indexOf('uno'), selectionEnd: value.length }, 'numberedList')
    expect(result.value).toBe('Intro\n\n1. uno\n2. due')
  })

  it('swaps one line prefix for another', () => {
    expect(applyFormat(select('- voce', 'voce'), 'heading').value).toBe('### voce')
    expect(applyFormat(select('### voce', 'voce'), 'bulletList').value).toBe('- voce')
  })

  it('makes a link of the selection with the given url', () => {
    const result = applyFormat(select('vedi qui', 'qui'), 'link', 'https://example.com')
    expect(result.value).toBe('vedi [qui](https://example.com)')
    expect(result.value.slice(result.selectionStart, result.selectionEnd)).toBe('qui')
  })
})
