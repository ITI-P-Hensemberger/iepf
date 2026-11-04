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

export async function sendMail(payload: MailPayload) {
  const info = await transport.sendMail({
    from: env.SMTP_FROM ?? 'no-reply@example.com',
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html
  })

  // eslint-disable-next-line no-console
  console.log('SMTP sendMail result', {
    messageId: info.messageId,
    envelope: info.envelope,
    accepted: info.accepted,
    rejected: info.rejected,
    response: (info as { response?: string }).response
  })

  if (!env.SMTP_HOST) {
    const preview = (info as { message?: Buffer | string }).message?.toString()
    if (preview) {
      // eslint-disable-next-line no-console
      console.log(`Email preview to ${payload.to}: ${preview}`)
    }
  }
}

export function closeMailer() {
  if ('close' in transport && typeof transport.close === 'function') {
    transport.close()
  }
}
