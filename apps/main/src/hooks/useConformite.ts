/**
 * React Query hooks for Conformite (compliance) module.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { conformiteService } from '@/services/conformiteService'
import type {
  ComplianceTypeCreate, ComplianceTypeUpdate,
  ComplianceRuleCreate, ComplianceRuleUpdate,
  ComplianceRecordCreate, ComplianceRecordUpdate,
  ComplianceExemptionCreate, ComplianceExemptionUpdate,
  JobPositionCreate, JobPositionUpdate,
  TierContactTransferCreate,
} from '@/types/api'

// ── Dashboard KPIs ──

export function useComplianceKPIs() {
  return useQuery({
    queryKey: ['compliance-kpis'],
    queryFn: () => conformiteService.getKPIs(),
  })
}

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
    queryKey: ['compliance-rules', complianceTypeId ?? 'all'],
    queryFn: () => conformiteService.listRules(complianceTypeId),
  })
}

export function useCreateComplianceRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: ComplianceRuleCreate) => conformiteService.createRule(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['compliance-rules'] }) },
  })
}

export function useUpdateComplianceRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ComplianceRuleUpdate }) =>
      conformiteService.updateRule(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['compliance-rules'] }) },
  })
}

export function useDeleteComplianceRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, force }: { id: string; force?: boolean }) =>
      conformiteService.deleteRule(id, force),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['compliance-rules'] }) },
  })
}

export function useRuleHistory(ruleId?: string) {
  return useQuery({
    queryKey: ['compliance-rule-history', ruleId],
    queryFn: () => conformiteService.getRuleHistory(ruleId!),
    enabled: !!ruleId,
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

// ── Exemptions ──

export function useExemptions(params: {
  page?: number; page_size?: number;
  status?: string; compliance_type_id?: string; search?: string;
} = {}) {
  return useQuery({
    queryKey: ['compliance-exemptions', params],
    queryFn: () => conformiteService.listExemptions(params),
  })
}

export function useCreateExemption() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: ComplianceExemptionCreate) => conformiteService.createExemption(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['compliance-exemptions'] }) },
  })
}

export function useUpdateExemption() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ComplianceExemptionUpdate }) =>
      conformiteService.updateExemption(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['compliance-exemptions'] }) },
  })
}

export function useApproveExemption() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => conformiteService.approveExemption(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['compliance-exemptions'] }) },
  })
}

export function useRejectExemption() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      conformiteService.rejectExemption(id, reason),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['compliance-exemptions'] }) },
  })
}

export function useDeleteExemption() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => conformiteService.deleteExemption(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['compliance-exemptions'] }) },
  })
}

// ── Job Positions (fiches de poste) ──

export function useJobPositions(params: { page?: number; page_size?: number; department?: string; search?: string } = {}) {
  return useQuery({
    queryKey: ['job-positions', params],
    queryFn: () => conformiteService.listJobPositions(params),
  })
}

export function useCreateJobPosition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: JobPositionCreate) => conformiteService.createJobPosition(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['job-positions'] }) },
  })
}

export function useUpdateJobPosition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: JobPositionUpdate }) =>
      conformiteService.updateJobPosition(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['job-positions'] }) },
  })
}

export function useDeleteJobPosition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => conformiteService.deleteJobPosition(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['job-positions'] }) },
  })
}

// ── Employee Transfers ──

export function useTransfers(params: { page?: number; page_size?: number; contact_id?: string; from_tier_id?: string; to_tier_id?: string } = {}) {
  return useQuery({
    queryKey: ['transfers', params],
    queryFn: () => conformiteService.listTransfers(params),
  })
}

export function useCreateTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: TierContactTransferCreate) => conformiteService.createTransfer(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfers'] })
      qc.invalidateQueries({ queryKey: ['tier-contacts'] })
    },
  })
}

// ── Verification ──

export function usePendingVerifications() {
  return useQuery({
    queryKey: ['pending-verifications'],
    queryFn: () => conformiteService.listPendingVerifications(),
  })
}

export function useVerifyRecord() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ recordType, recordId, action, rejectionReason }: {
      recordType: string; recordId: string; action: 'verify' | 'reject'; rejectionReason?: string
    }) => conformiteService.verifyRecord(recordType, recordId, action, rejectionReason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-verifications'] })
      qc.invalidateQueries({ queryKey: ['verification-history'] })
      qc.invalidateQueries({ queryKey: ['compliance-records'] })
      qc.invalidateQueries({ queryKey: ['user-passports'] })
      qc.invalidateQueries({ queryKey: ['user-visas'] })
      qc.invalidateQueries({ queryKey: ['user-vaccines'] })
      qc.invalidateQueries({ queryKey: ['medical-checks'] })
    },
  })
}

export function useVerificationHistory(page = 1, pageSize = 50) {
  return useQuery({
    queryKey: ['verification-history', page, pageSize],
    queryFn: () => conformiteService.listVerificationHistory({ page, page_size: pageSize }),
  })
}
