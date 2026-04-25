import { FileText } from 'lucide-react'
import { SubModelManager, type FieldDef } from './SubModelManager'
import { usePassports, useCreatePassport, useUpdatePassport, useDeletePassport } from '@/hooks/useUserSubModels'
import { useDictionaryOptions, useDictionaryColumnOptions, useDictionary } from '@/hooks/useDictionary'
import { CountryFlag } from '@/components/ui/CountryFlag'
import type { UserPassportRead, UserPassportCreate } from '@/types/api'

export function PassportManager({ userId, compact, hideAddButton, onAddRef }: { userId: string; compact?: boolean; hideAddButton?: boolean; onAddRef?: (fn: () => void) => void }) {
  const { data: items, isLoading } = usePassports(userId)
  const create = useCreatePassport()
  const update = useUpdatePassport()
  const del = useDeletePassport()
  const passportTypeOptions = useDictionaryOptions('passport_type')
  const countryOptions = useDictionaryColumnOptions('nationality', 'country')
  const { data: natEntries } = useDictionary('nationality')

  const FIELDS: FieldDef<UserPassportCreate>[] = [
    passportTypeOptions.length > 0
      ? { key: 'passport_type', label: 'Type', required: true, type: 'combobox' as const, options: passportTypeOptions }
      : { key: 'passport_type', label: 'Type', required: true, placeholder: 'Ordinaire, Diplomatique...' },
    { key: 'number', label: 'N° Passeport', required: true, placeholder: 'AB1234567' },
    countryOptions.length > 0
      ? { key: 'country', label: 'Pays', required: true, type: 'combobox' as const, options: countryOptions }
      : { key: 'country', label: 'Pays', required: true, placeholder: 'France' },
    { key: 'passport_name', label: 'Nom sur passeport', placeholder: 'NOM PRENOM' },
    { key: 'issue_date', label: 'Délivré le', type: 'date' as const },
    { key: 'expiry_date', label: 'Expire le', type: 'date' as const },
  ]

  // Build country labels from nationality dictionary
  const countryLabels: Record<string, string> = {}
  if (natEntries?.length) {
    for (const e of natEntries) countryLabels[e.code] = (e.metadata_json?.country as string) ?? e.label
  }

  const DISPLAY_COLUMNS = [
    ...(passportTypeOptions.length > 0
      ? [{ key: 'passport_type' as const, label: 'Type', format: (v: unknown) => passportTypeOptions.find(o => o.value === v)?.label ?? String(v ?? '') }]
      : []),
    { key: 'number' as const, label: 'Numéro' },
    { key: 'country' as const, label: 'Pays', render: (v: unknown) => <CountryFlag code={v as string} label={countryLabels[v as string] ?? (v as string)} size={14} /> },
    { key: 'expiry_date' as const, label: 'Expiration' },
  ]

  return (
    <SubModelManager<UserPassportRead, UserPassportCreate>
      items={items as UserPassportRead[] | undefined}
      isLoading={isLoading}
      fields={FIELDS}
      displayColumns={DISPLAY_COLUMNS}
      emptyLabel="Aucun passeport"
      emptyIcon={FileText}
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
