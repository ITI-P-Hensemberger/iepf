import { describe, expect, it } from 'vitest'

import { detectPlatform, type PushEnvironment, pushSetupState } from './push-platform'

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  // Opened from the Home Screen: no "Safari" token.
  iphoneHomeScreen: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  iphoneOld: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  iphoneFirefox: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',
  iphoneInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 337.0.3.23.54 (iPhone14,5; iOS 17_5; it_IT)',
  ipadOs: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  androidSamsung: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  androidWhatsApp: 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  windowsChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  windowsEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0'
}

function env(userAgent: string, overrides: Partial<PushEnvironment> = {}): PushEnvironment {
  return {
    userAgent,
    maxTouchPoints: /iPhone|Android/.test(userAgent) ? 5 : 0,
    standalone: false,
    hasPushApi: true,
    permission: 'default',
    hasSubscription: false,
    ...overrides
  }
}

describe('detectPlatform', () => {
  it('reads the system, the iOS version and the browser', () => {
    expect(detectPlatform(UA.iphoneSafari, 5)).toEqual({ os: 'ios', iosVersion: [17, 5], browser: 'safari', inApp: false, mobile: true })
    expect(detectPlatform(UA.iphoneHomeScreen, 5)).toMatchObject({ os: 'ios', browser: 'safari' })
    expect(detectPlatform(UA.iphoneChrome, 5)).toMatchObject({ os: 'ios', browser: 'chrome' })
    expect(detectPlatform(UA.androidSamsung, 5)).toMatchObject({ os: 'android', browser: 'samsung' })
    expect(detectPlatform(UA.windowsEdge)).toMatchObject({ os: 'other', browser: 'edge', mobile: false })
  })

  it('tells an iPad from a Mac by the touch screen', () => {
    expect(detectPlatform(UA.ipadOs, 5)).toMatchObject({ os: 'ios', iosVersion: [17, 5], mobile: true })
    expect(detectPlatform(UA.macSafari, 0)).toMatchObject({ os: 'other', mobile: false })
  })

  it('spots in-app browsers', () => {
    expect(detectPlatform(UA.iphoneInstagram, 5).inApp).toBe(true)
    expect(detectPlatform(UA.androidWhatsApp, 5).inApp).toBe(true)
    expect(detectPlatform(UA.androidChrome, 5).inApp).toBe(false)
  })
})

describe('pushSetupState', () => {
  it('sends computers to the phone', () => {
    expect(pushSetupState(env(UA.windowsChrome))).toBe('desktop')
    expect(pushSetupState(env(UA.macSafari))).toBe('desktop')
  })

  it('has nothing to do once this device is subscribed, computer included', () => {
    expect(pushSetupState(env(UA.androidChrome, { permission: 'granted', hasSubscription: true }))).toBe('enabled')
    expect(pushSetupState(env(UA.windowsChrome, { permission: 'granted', hasSubscription: true }))).toBe('enabled')
  })

  it('walks an iPhone through the Home Screen, from Safari only', () => {
    expect(pushSetupState(env(UA.iphoneSafari, { hasPushApi: false, permission: null }))).toBe('ios-needs-install')
    expect(pushSetupState(env(UA.iphoneChrome, { hasPushApi: false, permission: null }))).toBe('ios-other-browser')
    expect(pushSetupState(env(UA.iphoneFirefox, { hasPushApi: false, permission: null }))).toBe('ios-other-browser')
    expect(pushSetupState(env(UA.iphoneHomeScreen, { standalone: true }))).toBe('ask')
  })

  it('stays quiet on iOS before 16.4', () => {
    expect(pushSetupState(env(UA.iphoneOld, { hasPushApi: false, permission: null }))).toBe('unsupported')
  })

  it('asks to leave in-app browsers first', () => {
    expect(pushSetupState(env(UA.iphoneInstagram, { hasPushApi: false, permission: null }))).toBe('in-app-browser')
    expect(pushSetupState(env(UA.androidWhatsApp))).toBe('in-app-browser')
  })

  it('follows the permission on phones', () => {
    expect(pushSetupState(env(UA.androidChrome))).toBe('ask')
    expect(pushSetupState(env(UA.androidChrome, { permission: 'denied' }))).toBe('denied')
    expect(pushSetupState(env(UA.androidChrome, { permission: 'granted' }))).toBe('resubscribe')
    expect(pushSetupState(env(UA.androidChrome, { hasPushApi: false, permission: null }))).toBe('unsupported')
  })
})
