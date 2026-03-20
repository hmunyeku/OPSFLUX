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

export function useCreateEntity() {
  const qc = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: (payload: EntityCreate) => entityService.createEntity(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entities'] })
      toast({ title: 'Entit\u00e9 cr\u00e9\u00e9e', variant: 'success' })
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Impossible de cr\u00e9er l\u2019entit\u00e9.', variant: 'error' })
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
      toast({ title: 'Entit\u00e9 mise \u00e0 jour', variant: 'success' })
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Impossible de mettre \u00e0 jour l\u2019entit\u00e9.', variant: 'error' })
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
      toast({ title: 'Entit\u00e9 archiv\u00e9e', variant: 'success' })
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Impossible d\u2019archiver l\u2019entit\u00e9.', variant: 'error' })
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
      toast({ title: 'Utilisateur ajout\u00e9', variant: 'success' })
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Impossible d\u2019ajouter l\u2019utilisateur.', variant: 'error' })
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
      toast({ title: 'Utilisateur retir\u00e9', variant: 'success' })
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Impossible de retirer l\u2019utilisateur.', variant: 'error' })
    },
  })
}
