import { describe, expectTypeOf, it } from 'vitest'

import type { ApiResponse } from '@/lib/api'

describe('ApiResponse', () => {
  it('reads the 200 body of a backend route from the generated schema', () => {
    type LessonList = ApiResponse<'/lessons'>

    expectTypeOf<LessonList['total']>().toEqualTypeOf<number>()
    expectTypeOf<LessonList['data'][number]['dailyCapacity']>().toEqualTypeOf<number>()
    expectTypeOf<ApiResponse<'/lessons/{lessonId}'>['id']>().toEqualTypeOf<string>()
  })
})
