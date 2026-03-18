/**
 * React Query hooks for users.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usersService } from '@/services/usersService'
import type { UserCreate } from '@/types/api'

export function useUsers(params: { page?: number; page_size?: number; search?: string } = {}) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: () => usersService.list(params),
  })
}

export function useUser(id: string) {
  return useQuery({
    queryKey: ['users', id],
    queryFn: () => usersService.get(id),
    enabled: !!id,
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: UserCreate) => usersService.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<UserCreate & { active?: boolean }> }) =>
      usersService.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
    },
  })
}
