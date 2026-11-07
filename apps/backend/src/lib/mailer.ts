// Purpose: Centralized SMTP mail sending with safe fallbacks for dev/test.
import type { Buffer } from 'node:buffer'

import nodemailer from 'nodemailer'

import env from '@/env'

export interface MailPayload {
  to: string
  subject: string
  text?: string
  html?: string
}

const localSmtp = env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1', '::1'].includes(env.SMTP_HOST ?? '')

const transport = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      pool: true,
      maxConnections: 3,
      rateLimit: localSmtp ? undefined : 10,
      rateDelta: 60_000,
      auth: env.SMTP_USER && env.SMTP_PASS
        ? {
            user: env.SMTP_USER,
            pass: env.SMTP_PASS
          }
        : undefined,
      logger: Boolean(env.SMTP_DEBUG),
      debug: Boolean(env.SMTP_DEBUG)
    })
  // For local/testing without SMTP configured, keep output in-memory.
  : nodemailer.createTransport({
      streamTransport: true,
      newline: 'unix',
      buffer: true
    })

const pendingMail = new Set<Promise<void>>()

// Most emails are sent without being awaited, so shutdown has to know what is in flight.
export function sendMail(payload: MailPayload) {
  const delivery = deliverMail(payload)
  pendingMail.add(delivery)
  const forget = () => pendingMail.delete(delivery)
  delivery.then(forget, forget)
  return delivery
}

export async function waitForPendingMail() {
  await Promise.allSettled(pendingMail)
}

async function deliverMail(payload: MailPayload) {
  const info = await retryTemporarySmtpErrors(async () => transport.sendMail({
    from: env.SMTP_FROM ?? 'no-reply@example.com',
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html
  })).catch((error: unknown) => {
    throw redactSendError(error)
  })

  // eslint-disable-next-line no-console
  console.log('SMTP sendMail result', {
    messageId: info.messageId,
    accepted: info.accepted?.length ?? 0,
    rejected: info.rejected?.length ?? 0
  })

  if (!env.SMTP_HOST) {
    const preview = (info as { message?: Buffer | string }).message?.toString()
    if (preview) {
      // eslint-disable-next-line no-console
      console.log(`Email preview to ${payload.to}: ${preview}`)
    }
  }
}

// A 4xx reply means "not now": Office 365 answers 432 when the mailbox has too many connections
// or messages in flight at once, which happens when a job and the backend send together.
export function isTemporarySmtpError(error: unknown) {
  const { responseCode } = (error ?? {}) as { responseCode?: number }
  return typeof responseCode === 'number' && responseCode >= 400 && responseCode < 500
}

const RETRY_DELAYS_MS = [5_000, 20_000]

export async function retryTemporarySmtpErrors<T>(
  attempt: () => Promise<T>,
  delays: readonly number[] = RETRY_DELAYS_MS,
  wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))
) {
  for (let tried = 0; ; tried++) {
    try {
      return await attempt()
    }
    catch (error) {
      if (tried >= delays.length || !isTemporarySmtpError(error)) {
        throw error
      }
      console.warn(`SMTP temporary failure (${(error as { responseCode: number }).responseCode}), retrying in ${delays[tried] / 1000}s`)
      await wait(delays[tried])
    }
  }
}

// Nodemailer errors carry the recipients in their fields and message, and callers log them.
export function redactSendError(error: unknown) {
  const { code, responseCode } = (error ?? {}) as { code?: string, responseCode?: number }
  return new Error(`SMTP send failed: ${code ?? 'unknown'}${responseCode ? ` (${responseCode})` : ''}`)
}

export function closeMailer() {
  if ('close' in transport && typeof transport.close === 'function') {
    transport.close()
  }
}
