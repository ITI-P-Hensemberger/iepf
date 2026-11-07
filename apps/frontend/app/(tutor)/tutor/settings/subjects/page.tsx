import { redirect } from 'next/navigation'

// Old address, still in emails and bookmarks: subjects are now a section of the settings.
export default function TutorSubjectsRedirect() {
  redirect('/profile?tab=subjects')
}
