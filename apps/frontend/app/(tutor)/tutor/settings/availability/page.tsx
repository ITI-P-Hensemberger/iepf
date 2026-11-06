import { redirect } from 'next/navigation'

// Old address, still in emails and bookmarks: availability is now a section of the settings.
export default function TutorAvailabilityRedirect() {
  redirect('/tutor/settings')
}
