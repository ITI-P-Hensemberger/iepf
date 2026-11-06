// The unread count on the installed app's icon (Badging API). Browsers without it, or
// without permission, just keep no badge: nothing here may break the page.
type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

export async function syncAppBadge(count: number, nav: BadgeNavigator = navigator) {
  try {
    if (count > 0) await nav.setAppBadge?.(count)
    else await nav.clearAppBadge?.()
  } catch {
    // Not allowed here (no notification permission, not installed): nothing to show.
  }
}
