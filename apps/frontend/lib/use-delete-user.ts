'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'

import { jsonBody } from '@/lib/api-fetch'

// Deleting a user from the admin area, confirmed with the admin's password. `remove` resolves to
// the text to show in the dialog (a wrong password) or null; on success the lists reload and the
// page goes to `listHref`. Other failures show as a toast and resolve to null.
export function useDeleteUser(userId: string, fallback: string, listHref: string) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: async (password: string) => {
      const response = await fetch(`/api/users/${userId}`, jsonBody('DELETE', { password }))
      if (response.status === 403) return 'Password non corretta.'
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { message?: string } | null
        throw new Error(payload?.message ?? fallback)
      }
      return null
    }
  })

  async function remove(password: string): Promise<string | null> {
    if (!userId) return null
    let failed = false
    const wrongPassword = await mutation.mutateAsync(password).catch(() => {
      failed = true
      return null
    })
    if (wrongPassword || failed) return wrongPassword
    await queryClient.invalidateQueries({ queryKey: ['users'] })
    router.push(listHref)
    return null
  }

  return { remove, isDeleting: mutation.isPending }
}
