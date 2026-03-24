import { Syringe } from 'lucide-react'
import { SubModelManager, type FieldDef } from './SubModelManager'
import { useVaccines, useCreateVaccine, useUpdateVaccine, useDeleteVaccine } from '@/hooks/useUserSubModels'
import { useDictionaryOptions, useDictionary } from '@/hooks/useDictionary'
import type { UserVaccineRead, UserVaccineCreate } from '@/types/api'

export function VaccineManager({ userId, compact, hideAddButton }: { userId: string; compact?: boolean; hideAddButton?: boolean }) {
  const { data: items, isLoading } = useVaccines(userId)
  const create = useCreateVaccine()
  const update = useUpdateVaccine()
  const del = useDeleteVaccine()
  const vaccineTypeOptions = useDictionaryOptions('vaccine_type')
  const { data: vaccEntries } = useDictionary('vaccine_type')

  const FIELDS: FieldDef<UserVaccineCreate>[] = [
    vaccineTypeOptions.length > 0
      ? { key: 'vaccine_type', label: 'Type', required: true, type: 'combobox' as const, options: vaccineTypeOptions }
      : { key: 'vaccine_type', label: 'Type', required: true, placeholder: 'Fièvre jaune, COVID-19...' },
    { key: 'date_administered', label: 'Date', type: 'date' as const },
    { key: 'expiry_date', label: 'Expire le', type: 'date' as const },
    { key: 'batch_number', label: 'N° Lot', placeholder: 'AB1234' },
  ]

  const vaccLabels: Record<string, string> = {}
  if (vaccEntries?.length) {
    for (const e of vaccEntries) vaccLabels[e.code] = e.label
  }

  const DISPLAY_COLUMNS = [
    { key: 'vaccine_type' as const, label: 'Vaccin', format: (v: unknown) => vaccLabels[v as string] ?? String(v ?? '') },
    { key: 'date_administered' as const, label: 'Date' },
    { key: 'expiry_date' as const, label: 'Expiration' },
  ]

  return (
    <SubModelManager<UserVaccineRead, UserVaccineCreate>
      items={items as UserVaccineRead[] | undefined}
      isLoading={isLoading}
      fields={FIELDS}
      displayColumns={DISPLAY_COLUMNS}
      emptyLabel="Aucun vaccin"
      emptyIcon={Syringe}
      onCreate={(p) => create.mutate({ userId, payload: p })}
      onUpdate={(itemId, p) => update.mutate({ userId, itemId, payload: p })}
      onDelete={(itemId) => del.mutate({ userId, itemId })}
      createPending={create.isPending}
      compact={compact}
      hideAddButton={hideAddButton}
    />
  )
}
