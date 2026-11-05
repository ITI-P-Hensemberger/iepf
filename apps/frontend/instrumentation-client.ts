import { config } from 'zod/v4/core'

// Zod probes for eval with `Function('')` on first use. The CSP forbids eval, so the probe
// would be reported as a violation on every page with a form, hiding the real ones.
config({ jitless: true })
