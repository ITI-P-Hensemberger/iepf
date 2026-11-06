// Free text the users write (topic, feedback, messages, titles) always starts with a capital
// letter. Only a letter at the very start is touched (after any spaces): text that opens with
// a symbol, a number or a link (a Markdown heading, "3 esercizi", "https://…") stays as it is.
export function capitalizeFirst(value: string) {
  const match = /^(\s*)(\p{Ll})/u.exec(value)
  if (!match || /^\s*(?:https?:|www\.)/i.test(value)) {
    return value
  }
  const [, spaces = '', letter = ''] = match
  return `${spaces}${letter.toLocaleUpperCase('it')}${value.slice(spaces.length + letter.length)}`
}
