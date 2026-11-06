'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'

import { AnnouncementPopup } from '@/components/announcement-popup'
import { NoHoursPopup } from '@/components/no-hours-notice'
import { isPushRole, PushPrompt } from '@/components/push-prompt'
import type { SessionProfile } from '@/lib/use-session'
import { hasNoHoursLeft } from '@/lib/lesson-hours'

// One popup at a time: the admin ones first, then, on a student's home with no lesson hours
// left, the warning to buy a new package, then the request to turn on push.
// Users waiting for activation skip the admin popups but still get the push request,
// which tells them when the account is activated.
export function PopupStack({ profile }: { profile: SessionProfile | null }) {
  const pathname = usePathname()
  const [announcementsDone, setAnnouncementsDone] = React.useState(false)
  const [noHoursDone, setNoHoursDone] = React.useState(false)
  const handleEmpty = React.useCallback(() => setAnnouncementsDone(true), [])
  const handleNoHoursDone = React.useCallback(() => setNoHoursDone(true), [])

  if (!profile?.id) {
    return null
  }
  const showAnnouncements = profile.isActive !== false
  const announcementsClear = announcementsDone || !showAnnouncements
  const showNoHours = profile.role === 'student'
    && profile.isActive !== false
    && pathname === '/student'
    && hasNoHoursLeft(profile.lessonTokens)

  return (
    <>
      {showAnnouncements && <AnnouncementPopup userId={profile.id} onEmpty={handleEmpty} />}
      {announcementsClear && showNoHours && !noHoursDone && (
        <NoHoursPopup userId={profile.id} onDone={handleNoHoursDone} />
      )}
      {announcementsClear && (!showNoHours || noHoursDone) && isPushRole(profile.role) && (
        <PushPrompt userId={profile.id} role={profile.role} />
      )}
    </>
  )
}
