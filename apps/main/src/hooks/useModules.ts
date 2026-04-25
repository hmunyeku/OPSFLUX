import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { modulesService } from '@/services/modulesService'
import { useAuthStore } from '@/stores/authStore'

export function useModules() {
  const currentEntityId = useAuthStore((state) => state.currentEntityId)
  return useQuery({
    queryKey: ['modules', 'states', currentEntityId],
    queryFn: () => modulesService.list(),
    staleTime: 60_000,
    enabled: Boolean(currentEntityId),
  })
}

export function useUpdateModuleState() {
  const qc = useQueryClient()
  const currentEntityId = useAuthStore((state) => state.currentEntityId)
  return useMutation({
    mutationFn: ({ slug, enabled }: { slug: string; enabled: boolean }) =>
      modulesService.update(slug, enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['modules', 'states', currentEntityId] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
