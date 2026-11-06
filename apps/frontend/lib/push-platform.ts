// What this device can do about push, from facts the browser exposes. Pure, so every case
// is tested with real user agents; the browser-reading wrapper is readPushEnvironment().

export type Platform = {
  os: 'ios' | 'android' | 'other'
  // Major and minor iOS version, null when unknown or not iOS.
  iosVersion: [number, number] | null
  browser: 'safari' | 'chrome' | 'firefox' | 'edge' | 'samsung' | 'other'
  // Instagram, WhatsApp, Telegram and other apps open links in their own view, without push.
  inApp: boolean
  // Phones and tablets: the devices where push is worth turning on.
  mobile: boolean
}

export type PushEnvironment = {
  userAgent: string
  maxTouchPoints: number
  standalone: boolean
  hasPushApi: boolean
  permission: NotificationPermission | null
  hasSubscription: boolean
}

export type PushSetupState =
  // Nothing to do, or nothing that can be done here.
  | 'enabled'
  | 'unsupported'
  // A computer: the popup sends the user to the phone.
  | 'desktop'
  // Phones.
  | 'ask'
  | 'resubscribe'
  | 'denied'
  | 'ios-needs-install'
  | 'ios-other-browser'
  | 'in-app-browser'

const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Telegram|Line\/|Snapchat|TikTok|musical_ly|LinkedInApp|GSA\/|; wv\)/

export function detectPlatform(userAgent: string, maxTouchPoints = 0): Platform {
  // iPadOS reports itself as a Mac, but a Mac has no touch screen.
  const ios = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
  const android = !ios && /Android/.test(userAgent)

  let iosVersion: [number, number] | null = null
  if (ios) {
    const osMatch = /OS (\d+)[_.](\d+)/.exec(userAgent)
    const versionMatch = /Version\/(\d+)\.(\d+)/.exec(userAgent)
    const match = osMatch ?? versionMatch
    iosVersion = match ? [Number(match[1]), Number(match[2])] : null
  }

  let browser: Platform['browser'] = 'other'
  if (/EdgiOS|EdgA|Edg\//.test(userAgent)) browser = 'edge'
  else if (/FxiOS|Firefox\//.test(userAgent)) browser = 'firefox'
  else if (/SamsungBrowser/.test(userAgent)) browser = 'samsung'
  else if (/CriOS|Chrome\//.test(userAgent)) browser = 'chrome'
  else if (/Safari\//.test(userAgent) || (ios && /AppleWebKit/.test(userAgent))) browser = 'safari'

  return {
    os: ios ? 'ios' : android ? 'android' : 'other',
    iosVersion,
    browser,
    inApp: IN_APP.test(userAgent),
    mobile: ios || android
  }
}

// Web push on iPhone and iPad arrived with iOS 16.4, for apps added to the Home Screen.
function iosSupportsPush(version: [number, number] | null) {
  if (!version) return true
  const [major, minor] = version
  return major > 16 || (major === 16 && minor >= 4)
}

// An iOS browser other than Safari: Chrome, Firefox, Edge and the others all say so in the UA.
const IOS_OTHER_BROWSER = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|YaBrowser|Brave/

export function pushSetupState(env: PushEnvironment): PushSetupState {
  const platform = detectPlatform(env.userAgent, env.maxTouchPoints)

  if (env.permission === 'granted' && env.hasSubscription) {
    return 'enabled'
  }
  if (!platform.mobile) {
    return 'desktop'
  }
  if (platform.os === 'ios' && !iosSupportsPush(platform.iosVersion)) {
    return 'unsupported'
  }
  if (platform.inApp) {
    return 'in-app-browser'
  }
  if (platform.os === 'ios' && !env.standalone) {
    return IOS_OTHER_BROWSER.test(env.userAgent) ? 'ios-other-browser' : 'ios-needs-install'
  }
  if (!env.hasPushApi) {
    return 'unsupported'
  }
  if (env.permission === 'denied') {
    return 'denied'
  }
  if (env.permission === 'granted') {
    return 'resubscribe'
  }
  return 'ask'
}
