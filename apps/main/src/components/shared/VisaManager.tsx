import { Stamp } from 'lucide-react'
import { SubModelManager, type FieldDef } from './SubModelManager'
import { useVisas, useCreateVisa, useUpdateVisa, useDeleteVisa } from '@/hooks/useUserSubModels'
import { useDictionaryOptions, useDictionaryColumnOptions, useDictionary } from '@/hooks/useDictionary'
import { CountryFlag } from '@/components/ui/CountryFlag'
import type { UserVisaRead, UserVisaCreate } from '@/types/api'

export function VisaManager({ userId, compact, hideAddButton, onAddRef }: { userId: string; compact?: boolean; hideAddButton?: boolean; onAddRef?: (fn: () => void) => void }) {
  const { data: items, isLoading } = useVisas(userId)
  const create = useCreateVisa()
  const update = useUpdateVisa()
  const del = useDeleteVisa()
  const visaTypeOptions = useDictionaryOptions('visa_type')
  const countryOptions = useDictionaryColumnOptions('nationality', 'country')
  const { data: natEntries } = useDictionary('nationality')

  const FIELDS: FieldDef<UserVisaCreate>[] = [
    visaTypeOptions.length > 0
      ? { key: 'visa_type', label: 'Type', required: true, type: 'combobox' as const, options: visaTypeOptions }
      : { key: 'visa_type', label: 'Type', required: true, placeholder: 'Travail, Touriste...' },
    countryOptions.length > 0
      ? { key: 'country', label: 'Pays', required: true, type: 'combobox' as const, options: countryOptions }
      : { key: 'country', label: 'Pays', required: true, placeholder: 'Angola' },
    { key: 'number', label: 'Numéro', placeholder: 'V123456' },
    { key: 'issue_date', label: 'Délivré le', type: 'date' as const },
    { key: 'expiry_date', label: 'Expiré le', type: 'date' as const },
  ]

  const countryLabels: Record<string, string> = {}
  if (natEntries?.length) {
    for (const e of natEntries) countryLabels[e.code] = (e.metadata_json?.country as string) ?? e.label
  }

  const DISPLAY_COLUMNS = [
    { key: 'visa_type' as const, label: 'Type' },
    { key: 'country' as const, label: 'Pays', render: (v: unknown) => <CountryFlag code={v as string} label={countryLabels[v as string] ?? (v as string)} size={14} /> },
    { key: 'expiry_date' as const, label: 'Expiration' },
  ]

  return (
    <SubModelManager<UserVisaRead, UserVisaCreate>
      items={items as UserVisaRead[] | undefined}
      isLoading={isLoading}
      fields={FIELDS}
      displayColumns={DISPLAY_COLUMNS}
      emptyLabel="Aucun visa"
      emptyIcon={Stamp}
      onCreate={(p) => create.mutate({ userId, payload: p })}
      onUpdate={(itemId, p) => update.mutate({ userId, itemId, payload: p })}
      onDelete={(itemId) => del.mutate({ userId, itemId })}
      createPending={create.isPending}
      compact={compact}
      hideAddButton={hideAddButton}
      onAddRef={onAddRef}
    />
  )
}
