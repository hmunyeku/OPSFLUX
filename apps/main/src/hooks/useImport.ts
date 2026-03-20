import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { importService } from '@/services/importService'
import type { ImportTargetObject, ImportMappingCreate, DuplicateStrategy } from '@/types/api'

export function useImportTargets() {
  return useQuery({
    queryKey: ['import-targets'],
    queryFn: () => importService.getTargets(),
    staleTime: 5 * 60 * 1000,
  })
}

export function useImportMappings(targetObject?: ImportTargetObject) {
  return useQuery({
    queryKey: ['import-mappings', targetObject],
    queryFn: () => importService.listMappings(targetObject),
  })
}

export function useAutoDetectMapping() {
  return useMutation({
    mutationFn: (params: { targetObject: ImportTargetObject; fileHeaders: string[] }) =>
      importService.autoDetect(params.targetObject, params.fileHeaders),
  })
}

export function useValidateImport() {
  return useMutation({
    mutationFn: (params: {
      target_object: ImportTargetObject
      column_mapping: Record<string, string>
      rows: Record<string, unknown>[]
      duplicate_strategy: DuplicateStrategy
    }) => importService.validate(params),
  })
}

export function useExecuteImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: {
      target_object: ImportTargetObject
      column_mapping: Record<string, string>
      rows: Record<string, unknown>[]
      duplicate_strategy: DuplicateStrategy
      mapping_id?: string
    }) => importService.execute(params),
    onSuccess: (_data, vars) => {
      const moduleKeys: Record<string, string> = {
        asset: 'assets',
        tier: 'tiers',
        contact: 'tiers',
        pax_profile: 'pax-profiles',
        project: 'projects',
        compliance_record: 'compliance',
      }
      const key = moduleKeys[vars.target_object]
      if (key) qc.invalidateQueries({ queryKey: [key] })
    },
  })
}

export function useCreateImportMapping() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: ImportMappingCreate) => importService.createMapping(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['import-mappings'] })
    },
  })
}

export function useDeleteImportMapping() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => importService.deleteMapping(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['import-mappings'] })
    },
  })
}

export function useUserSyncProviders() {
  return useQuery({
    queryKey: ['user-sync', 'providers'],
    queryFn: () => importService.userSyncProviders(),
  })
}

export function useUserSyncPreview() {
  return useMutation({
    mutationFn: (provider: string) => importService.userSyncPreview(provider),
  })
}

export function useUserSyncExecute() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: Parameters<typeof importService.userSyncExecute>[0]) =>
      importService.userSyncExecute(params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: ['groups'] })
    },
  })
}
