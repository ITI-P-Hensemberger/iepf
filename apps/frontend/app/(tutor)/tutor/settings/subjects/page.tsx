import { redirect } from 'next/navigation'

// Old address, still in emails and bookmarks: subjects are now a section of the settings.
export default function TutorSubjectsRedirect() {
  redirect('/tutor/settings?tab=subjects')
}
