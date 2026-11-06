// Pretend it is another moment in the browser, to try the booking pages on any weekday in local
// development. Set NEXT_PUBLIC_FAKE_NOW (and FAKE_NOW for the backend) to the same instant.
// Off in production builds: the value is only read when NODE_ENV is 'development'.

export function fakeNow(): string | null {
  const value = process.env.NEXT_PUBLIC_FAKE_NOW
  if (process.env.NODE_ENV !== 'development' || !value || Number.isNaN(Date.parse(value))) {
    return null
  }
  return value
}

// Runs before React: moves `new Date()` and `Date.now()` there, with the clock still ticking.
export function fakeClockScript(value: string) {
  return `(() => {
  const RealDate = Date
  const offset = RealDate.parse(${JSON.stringify(value)}) - RealDate.now()
  class FakeDate extends RealDate {
    constructor(...args) { if (args.length === 0) super(RealDate.now() + offset); else super(...args) }
    static now() { return RealDate.now() + offset }
  }
  window.Date = FakeDate
})()`
}
