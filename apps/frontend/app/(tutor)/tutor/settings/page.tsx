import { redirect } from 'next/navigation'

// Old address, still in bookmarks: availability and subjects are now sections of the profile.
export default async function TutorSettingsRedirect({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams
  redirect(tab === 'subjects' ? '/profile?tab=subjects' : '/profile?tab=availability')
}
