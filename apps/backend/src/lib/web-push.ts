// Purpose: Web Push transport on the web-push library (VAPID and payload encryption), plus
// the checks on what browsers send us.
import { Buffer } from 'node:buffer'
import { createECDH, createHash } from 'node:crypto'
import webpush, { WebPushError } from 'web-push'

export interface VapidKeys {
  publicKey: string
  privateKey: string
  subject: string
}

export interface WebPushTarget {
  endpoint: string
  p256dh: string
  auth: string
}

export interface WebPushOptions {
  ttlSeconds: number
  urgency?: 'very-low' | 'low' | 'normal' | 'high'
  // A newer message with the same topic replaces one the device has not received yet.
  topic?: string
}

export interface WebPushResponse {
  status: number
}

export type WebPushTransport = (target: WebPushTarget, payload: Buffer, options: WebPushOptions) => Promise<WebPushResponse>

// Push services the backend may contact. The endpoint comes from the browser, so without this
// list a client could make the server send requests to any address, internal ones included.
const PUSH_SERVICE_SUFFIXES = [
  '.googleapis.com',
  '.push.services.mozilla.com',
  '.push.apple.com',
  '.notify.windows.com'
]

export function isAllowedPushEndpoint(endpoint: string) {
  let url: URL
  try {
    url = new URL(endpoint)
  }
  catch {
    return false
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password) {
    return false
  }
  const host = url.hostname.toLowerCase()
  return PUSH_SERVICE_SUFFIXES.some(suffix => host.endsWith(suffix))
}

function decodeBase64Url(value: string) {
  if (!/^[\w-]+$/.test(value)) {
    throw new Error('Invalid base64url value')
  }
  return Buffer.from(value, 'base64url')
}

export function isValidSubscriptionKeys(p256dh: string, auth: string) {
  try {
    const publicKey = decodeBase64Url(p256dh)
    return publicKey.length === 65 && publicKey[0] === 0x04 && decodeBase64Url(auth).length === 16
  }
  catch {
    return false
  }
}

export function isValidVapidKeys(publicKey: string, privateKey: string) {
  try {
    // Rejects a pair whose halves do not belong together, which would fail every send.
    const ecdh = createECDH('prime256v1')
    ecdh.setPrivateKey(decodeBase64Url(privateKey))
    return ecdh.getPublicKey().equals(decodeBase64Url(publicKey))
  }
  catch {
    return false
  }
}

// Push services accept at most 32 base64url characters as a topic.
// Apple refuses the VAPID token (403 BadJwtToken) when the subject names a reserved domain.
const RESERVED_SUBJECT_DOMAIN = /(?:^|\.)(?:test|example|invalid|localhost|local)$|^example\.(?:com|net|org)$/i

export function isValidVapidSubject(subject: string) {
  let domain: string
  if (subject.startsWith('mailto:')) {
    domain = subject.slice('mailto:'.length).split('@')[1] ?? ''
  }
  else if (subject.startsWith('https://')) {
    try {
      domain = new URL(subject).hostname
    }
    catch {
      return false
    }
  }
  else {
    return false
  }
  return domain.includes('.') && !RESERVED_SUBJECT_DOMAIN.test(domain)
}

function topicHeader(topic: string) {
  return createHash('sha256').update(topic).digest('base64url').slice(0, 32)
}

export function createWebPushTransport(keys: VapidKeys): WebPushTransport {
  return async (target, payload, options) => {
    if (!isAllowedPushEndpoint(target.endpoint)) {
      throw new Error('Push endpoint is not an allowed push service')
    }
    try {
      const response = await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        payload,
        {
          vapidDetails: keys,
          TTL: options.ttlSeconds,
          urgency: options.urgency ?? 'normal',
          topic: options.topic ? topicHeader(options.topic) : undefined,
          contentEncoding: 'aes128gcm',
          timeout: 10_000
        }
      )
      return { status: response.statusCode }
    }
    catch (error) {
      // The library throws on any non-2xx answer; the caller decides what each status means.
      if (error instanceof WebPushError) {
        return { status: error.statusCode }
      }
      throw error
    }
  }
}
