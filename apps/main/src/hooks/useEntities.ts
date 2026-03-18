/**
 * React Query hooks for entity management.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { entityService } from '@/services/entityService'
import { useAuthStore } from '@/stores/authStore'

export function useMyEntities() {
  return useQuery({
    queryKey: ['entities', 'mine'],
    queryFn: () => entityService.getMyEntities(),
  })
}

export function useSwitchEntity() {
  const qc = useQueryClient()
  const { setCurrentEntity } = useAuthStore()

  return useMutation({
    mutationFn: (entityId: string) => entityService.switchEntity(entityId),
    onSuccess: (_, entityId) => {
      // Update localStorage and auth store
      localStorage.setItem('entity_id', entityId)
      setCurrentEntity(entityId)
      // Invalidate all queries to reload data for the new entity
      qc.invalidateQueries()
    },
  })
}
