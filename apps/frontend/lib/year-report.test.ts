import { describe, expect, it } from 'vitest'

import { filenameFrom } from './year-report'

describe('filenameFrom', () => {
  it('reads the name the backend gives the report', () => {
    expect(filenameFrom('attachment; filename="iepf-report-2025-26-2026-06-20.xlsx"')).toBe('iepf-report-2025-26-2026-06-20.xlsx')
    expect(filenameFrom(null)).toBe('iepf-report.xlsx')
  })
})
