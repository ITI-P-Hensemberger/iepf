// Purpose: Finish in-flight work before the process exits.
export interface ShutdownOptions {
  steps: Array<() => Promise<unknown> | unknown>
  timeoutMs: number
  exit: (code: number) => void
}

export function createShutdown({ steps, timeoutMs, exit }: ShutdownOptions) {
  let started = false

  return async () => {
    if (started) {
      return
    }
    started = true

    const timer = setTimeout(() => {
      console.error('Shutdown timed out')
      exit(1)
    }, timeoutMs)
    timer.unref()

    let code = 0
    for (const step of steps) {
      try {
        await step()
      }
      catch (error) {
        console.error('Shutdown step failed:', error)
        code = 1
      }
    }
    clearTimeout(timer)
    exit(code)
  }
}
