// Purpose: A subject's canonical name, made from its name: lowercase, without accents, words
// joined by underscores ("Inglese - Lingua" -> "inglese_lingua"). Two subjects whose names give
// the same canonical name are the same subject.
export function canonicalSubjectName(name: string) {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}
