export type AnnouncementStatus = 'active' | 'scheduled' | 'expired' | 'disabled'

// Same rule as the backend's visibleNow(): the switch first, then the time window.
export function announcementStatus(
  announcement: { active: boolean, startsAt: string | null, expiresAt: string | null },
  now = new Date()
): AnnouncementStatus {
  if (!announcement.active) {
    return 'disabled'
  }
  if (announcement.expiresAt && new Date(announcement.expiresAt) <= now) {
    return 'expired'
  }
  if (announcement.startsAt && new Date(announcement.startsAt) > now) {
    return 'scheduled'
  }
  return 'active'
}
