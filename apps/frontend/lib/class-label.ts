// A class as the school writes it: year and section together, like "2D2". Either part alone
// when the other is missing.
export function classLabel(year: number | null | undefined, sectionName: string | null | undefined): string | null {
  const section = sectionName?.replace(/\s+/g, '') || null
  if (year && section) return `${year}${section}`
  if (section) return section
  return year ? `${year}ª` : null
}
