/**
 * React Query hooks for entity management.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { entityService, type EntityListParams, type EntityCreate, type EntityUpdate } from '@/services/entityService'
import { useAuthStore } from '@/stores/authStore'
import { useToast } from '@/components/ui/Toast'

export function useMyEntities() {
  return useQuery({
    queryKey: ['entities', 'mine'],
    queryFn: () => entityService.getMyEntities(),
  })
}

export function useSwitchEntity() {
  const qc = useQueryClient()
  const { setCurrentEntity, setActingContext } = useAuthStore()

  return useMutation({
    mutationFn: (entityId: string) => entityService.switchEntity(entityId),
    onSuccess: (_, entityId) => {
      // Reset acting context and update active entity before any refetch.
      localStorage.setItem('acting_context', 'own')
      localStorage.setItem('entity_id', entityId)
      setActingContext('own')
      setCurrentEntity(entityId)
      // Purge the most sensitive entity-scoped caches first.
      qc.removeQueries({ queryKey: ['dashboard'] })
      qc.removeQueries({ queryKey: ['modules', 'states'] })
      qc.removeQueries({ queryKey: ['rbac', 'my-permissions'] })
      qc.removeQueries({ queryKey: ['acting-context'] })
      qc.removeQueries({ queryKey: ['acting-contexts'] })
      // Then invalidate the rest to reload under the new entity context.
      qc.invalidateQueries()
    },
  })
}

// ── Admin CRUD hooks ─────────────────────────────────────────

export function useAllEntities(params?: EntityListParams) {
  return useQuery({
    queryKey: ['entities', 'all', params],
    queryFn: () => entityService.listEntities(params),
  })
}

export function useEntity(id: string | undefined) {
  return useQuery({
    queryKey: ['entities', 'detail', id],
    queryFn: () => entityService.getEntity(id!),
    enabled: !!id,
  })
}

/** Convenience: returns the entity object currently selected in the auth
 *  store. Reads `currentEntityId` from useAuthStore and resolves the
 *  corresponding entity from useMyEntities (which is cached). Returns
 *  undefined while the data is loading or if no entity is selected. */
export function useCurrentEntity() {
  const currentEntityId = useAuthStore((s) => s.currentEntityId)
  const { data: myEntities } = useMyEntities()
  if (!currentEntityId || !myEntities) return undefined
  return myEntities.find((e) => e.id === currentEntityId)
}

export function useCreateEntity() {
  const qc = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: (payload: EntityCreate) => entityService.createEntity(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entities'] })
      toast({ title: 'Entité créée', variant: 'success' })
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Impossible de créer l’entité.', variant: 'error' })
    },
  })
}

export function useUpdateEntity() {
  const qc = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: EntityUpdate }) =>
      entityService.updateEntity(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entities'] })
      toast({ title: 'Entité mise à jour', variant: 'success' })
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Impossible de mettre à jour l’entité.', variant: 'error' })
    },
  })
}

export function useDeleteEntity() {
  const qc = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: (id: string) => entityService.deleteEntity(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entities'] })
      toast({ title: 'Entité archivée', variant: 'success' })
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Impossible d’archiver l’entité.', variant: 'error' })
    },
  })
}

// ── Entity Users ─────────────────────────────────────────────

export function useEntityUsers(entityId: string | undefined) {
  return useQuery({
    queryKey: ['entities', 'users', entityId],
    queryFn: () => entityService.getEntityUsers(entityId!),
    enabled: !!entityId,
  })
}

export function useAddEntityUser() {
  const qc = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: ({ entityId, userId }: { entityId: string; userId: string }) =>
      entityService.addEntityUser(entityId, userId),
    onSuccess: (_, { entityId }) => {
      qc.invalidateQueries({ queryKey: ['entities', 'users', entityId] })
      qc.invalidateQueries({ queryKey: ['entities', 'all'] })
      toast({ title: 'Utilisateur ajouté', variant: 'success' })
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Impossible d’ajouter l’utilisateur.', variant: 'error' })
    },
  })
}

export function useRemoveEntityUser() {
  const qc = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: ({ entityId, userId }: { entityId: string; userId: string }) =>
      entityService.removeEntityUser(entityId, userId),
    onSuccess: (_, { entityId }) => {
      qc.invalidateQueries({ queryKey: ['entities', 'users', entityId] })
      qc.invalidateQueries({ queryKey: ['entities', 'all'] })
      toast({ title: 'Utilisateur retiré', variant: 'success' })
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Impossible de retirer l’utilisateur.', variant: 'error' })
    },
  })
}
