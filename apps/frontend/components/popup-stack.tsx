'use client'

import * as React from 'react'

import { AnnouncementPopup } from '@/components/announcement-popup'
import { isPushRole, PushPrompt } from '@/components/push-prompt'
import type { SessionProfile } from '@/lib/use-session'

// One popup at a time: the admin ones first, then the request to turn on push.
// Users waiting for activation skip the admin popups but still get the push request,
// which tells them when the account is activated.
export function PopupStack({ profile }: { profile: SessionProfile | null }) {
  const [announcementsDone, setAnnouncementsDone] = React.useState(false)
  const handleEmpty = React.useCallback(() => setAnnouncementsDone(true), [])

  if (!profile?.id) {
    return null
  }
  const showAnnouncements = profile.isActive !== false

  return (
    <>
      {showAnnouncements && <AnnouncementPopup userId={profile.id} onEmpty={handleEmpty} />}
      {(announcementsDone || !showAnnouncements) && isPushRole(profile.role) && (
        <PushPrompt userId={profile.id} role={profile.role} />
      )}
    </>
  )
}
