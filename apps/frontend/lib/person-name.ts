// Names are letters, optionally joined by an apostrophe (D'Angelo, Dell'Orto). Phone keyboards
// type the curly ’ instead of ', so both are accepted.
export const PERSON_NAME_PATTERN = /^\p{L}+(?:['’]\p{L}+)*$/u

// Names are stored as "D'Angelo": a capital at the start and after every apostrophe, the rest lowercase.
export function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase('it').replace(/(^|['’])(\p{L})/gu, (_, before: string, letter: string) => `${before}${letter.toLocaleUpperCase('it')}`)
}
