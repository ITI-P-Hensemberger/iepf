import { expect } from '@playwright/test'

// Every email goes to the local Mailpit, which keeps earlier runs' messages: the link in the
// newest email to an address sent after `since`, waiting for the backend's fire-and-forget send.
export async function linkSentTo(address: string, path: string, since: number) {
  const base = process.env.MAILPIT_URL ?? 'http://127.0.0.1:8025'
  let link = ''
  await expect.poll(async () => {
    const search = await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`).then(r => r.json())
    const latest = search.messages?.[0]
    if (!latest || Date.parse(latest.Created) < since) return ''
    const message = await fetch(`${base}/api/v1/message/${latest.ID}`).then(r => r.json())
    link = message.Text.match(new RegExp(`https?://\\S+${path}\\S*`))?.[0] ?? ''
    return link
  }, { timeout: 15_000 }).not.toBe('')
  const url = new URL(link)
  return url.pathname + url.search
}
