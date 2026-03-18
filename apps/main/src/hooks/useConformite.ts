/**
 * React Query hooks for Conformite (compliance) module.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { conformiteService } from '@/services/conformiteService'
import type { ComplianceTypeCreate, ComplianceTypeUpdate, ComplianceRuleCreate, ComplianceRecordCreate, ComplianceRecordUpdate } from '@/types/api'

// ── Types (referentiel) ──

export function useComplianceTypes(params: { page?: number; page_size?: number; category?: string; search?: string } = {}) {
  return useQuery({
    queryKey: ['compliance-types', params],
    queryFn: () => conformiteService.listTypes(params),
  })
}

export function useCreateComplianceType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: ComplianceTypeCreate) => conformiteService.createType(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['compliance-types'] }) },
  })
}

export function useUpdateComplianceType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ComplianceTypeUpdate }) =>
      conformiteService.updateType(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['compliance-types'] }) },
  })
}

export function useDeleteComplianceType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => conformiteService.deleteType(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['compliance-types'] }) },
  })
}

// ── Rules ──

export function useComplianceRules(complianceTypeId?: string) {
  return useQuery({
    queryKey: ['compliance-rules', complianceTypeId],
    queryFn: () => conformiteService.listRules(complianceTypeId),
    enabled: complianceTypeId !== undefined,
  })
}

export function useCreateComplianceRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: ComplianceRuleCreate) => conformiteService.createRule(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['compliance-rules'] }) },
  })
}

export function useDeleteComplianceRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => conformiteService.deleteRule(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['compliance-rules'] }) },
  })
}

// ── Records ──

export function useComplianceRecords(params: {
  page?: number; page_size?: number;
  owner_type?: string; owner_id?: string;
  compliance_type_id?: string; status?: string; category?: string; search?: string;
} = {}) {
  return useQuery({
    queryKey: ['compliance-records', params],
    queryFn: () => conformiteService.listRecords(params),
  })
}

export function useCreateComplianceRecord() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: ComplianceRecordCreate) => conformiteService.createRecord(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['compliance-records'] }) },
  })
}

export function useUpdateComplianceRecord() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ComplianceRecordUpdate }) =>
      conformiteService.updateRecord(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['compliance-records'] }) },
  })
}

export function useDeleteComplianceRecord() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => conformiteService.deleteRecord(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['compliance-records'] }) },
  })
}

// ── Check ──

export function useComplianceCheck(ownerType: string | undefined, ownerId: string | undefined) {
  return useQuery({
    queryKey: ['compliance-check', ownerType, ownerId],
    queryFn: () => conformiteService.checkCompliance(ownerType!, ownerId!),
    enabled: !!ownerType && !!ownerId,
  })
}
