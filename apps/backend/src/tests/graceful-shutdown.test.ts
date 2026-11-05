import { describe, expect, it, vi } from 'vitest'

import { createShutdown } from '@/lib/graceful-shutdown'

describe('createShutdown', () => {
  it('runs the steps in order and exits cleanly', async () => {
    const calls: string[] = []
    const exit = vi.fn()
    await createShutdown({
      timeoutMs: 1000,
      exit,
      steps: [async () => calls.push('server'), () => calls.push('mail'), async () => calls.push('db')]
    })()
    expect(calls).toEqual(['server', 'mail', 'db'])
    expect(exit).toHaveBeenCalledExactlyOnceWith(0)
  })

  it('still runs the other steps when one fails, and exits with an error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const last = vi.fn()
    const exit = vi.fn()
    await createShutdown({ timeoutMs: 1000, exit, steps: [() => {
      throw new Error('nope')
    }, last] })()
    expect(last).toHaveBeenCalled()
    expect(exit).toHaveBeenCalledExactlyOnceWith(1)
    error.mockRestore()
  })

  it('runs once even if a second signal arrives', async () => {
    const step = vi.fn()
    const exit = vi.fn()
    const shutdown = createShutdown({ timeoutMs: 1000, exit, steps: [step] })
    await Promise.all([shutdown(), shutdown()])
    expect(step).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledOnce()
  })

  it('forces the exit when a step hangs', async () => {
    vi.useFakeTimers()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const exit = vi.fn()
    void createShutdown({ timeoutMs: 1000, exit, steps: [() => new Promise(() => {})] })()
    await vi.advanceTimersByTimeAsync(1000)
    expect(exit).toHaveBeenCalledExactlyOnceWith(1)
    error.mockRestore()
    vi.useRealTimers()
  })
})
