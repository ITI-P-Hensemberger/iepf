import { redirect } from 'next/navigation'

// Old address: the popups are now a section of the global settings.
export default function AdminAnnouncementsRedirect() {
  redirect('/admin/settings?tab=popup')
}
