// Purpose: Pretend it is another moment, to try the booking rules on any weekday in local
// development. FAKE_NOW=2026-11-10T10:00:00+01:00 moves `new Date()` and `Date.now()` there and
// keeps the clock ticking. Never in production or tests: it refuses to start there.
/* eslint-disable node/no-process-env */
const fakeNow = process.env.FAKE_NOW

if (fakeNow) {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('FAKE_NOW is only for local development')
  }
  const target = Date.parse(fakeNow)
  if (Number.isNaN(target)) {
    throw new TypeError(`FAKE_NOW is not a date: ${fakeNow}`)
  }
  const RealDate = Date
  const offset = target - RealDate.now()
  class FakeDate extends RealDate {
    constructor(...args: ConstructorParameters<typeof Date> | []) {
      if (args.length === 0) {
        super(RealDate.now() + offset)
      }
      else {
        super(...(args as ConstructorParameters<typeof Date>))
      }
    }

    static override now() {
      return RealDate.now() + offset
    }
  }
  globalThis.Date = FakeDate as DateConstructor
  process.stdout.write(`Fake clock: it is now ${new Date().toISOString()}\n`)
}

export {}
