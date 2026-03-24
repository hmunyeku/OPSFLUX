import { Stethoscope } from 'lucide-react'
import { SubModelManager, type FieldDef } from './SubModelManager'
import { useMedicalChecks, useCreateMedicalCheck, useUpdateMedicalCheck, useDeleteMedicalCheck } from '@/hooks/useUserSubModels'
import { useDictionaryOptions, useDictionary } from '@/hooks/useDictionary'
import type { MedicalCheckRead, MedicalCheckCreate } from '@/types/api'

interface MedicalCheckManagerProps {
  ownerType: string
  ownerId: string
  compact?: boolean
  hideAddButton?: boolean
}

export function MedicalCheckManager({ ownerType, ownerId, compact, hideAddButton }: MedicalCheckManagerProps) {
  const { data: items, isLoading } = useMedicalChecks(ownerType, ownerId)
  const create = useCreateMedicalCheck()
  const update = useUpdateMedicalCheck()
  const del = useDeleteMedicalCheck()
  const checkTypeOptions = useDictionaryOptions('medical_check_type')
  const { data: checkEntries } = useDictionary('medical_check_type')

  const FIELDS: FieldDef<MedicalCheckCreate>[] = [
    checkTypeOptions.length > 0
      ? { key: 'check_type', label: 'Type', required: true, type: 'combobox' as const, options: checkTypeOptions }
      : { key: 'check_type', label: 'Type', required: true, placeholder: 'Standard, International...' },
    { key: 'check_date', label: 'Date', required: true, type: 'date' as const },
    { key: 'expiry_date', label: 'Expire le', type: 'date' as const },
    { key: 'provider', label: 'Médecin / Centre', placeholder: 'Dr. Martin, Centre médical...' },
    { key: 'notes', label: 'Notes', placeholder: 'Observations...' },
  ]

  const checkLabels: Record<string, string> = {}
  if (checkEntries?.length) {
    for (const e of checkEntries) checkLabels[e.code] = e.label
  }

  const DISPLAY_COLUMNS = [
    { key: 'check_type' as const, label: 'Type', format: (v: unknown) => checkLabels[v as string] ?? String(v ?? '') },
    { key: 'check_date' as const, label: 'Date' },
    { key: 'expiry_date' as const, label: 'Expiration' },
    { key: 'provider' as const, label: 'Médecin' },
  ]

  return (
    <SubModelManager<MedicalCheckRead, MedicalCheckCreate>
      items={items as MedicalCheckRead[] | undefined}
      isLoading={isLoading}
      fields={FIELDS}
      displayColumns={DISPLAY_COLUMNS}
      emptyLabel="Aucune visite médicale"
      emptyIcon={Stethoscope}
      onCreate={(p) => create.mutate({ ownerType, ownerId, payload: p })}
      onUpdate={(itemId, p) => update.mutate({ ownerType, ownerId, checkId: itemId, payload: p })}
      onDelete={(itemId) => del.mutate({ ownerType, ownerId, checkId: itemId })}
      createPending={create.isPending}
      compact={compact}
      hideAddButton={hideAddButton}
    />
  )
}
