// Purpose: Short link slugs: "Iscrizioni 2026/27" becomes "iscrizioni-2026-27".
// The frontend has the same function (lib/slug.ts) to format the field as the admin types.
export const SLUG_MAX = 80
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/, '')
}
