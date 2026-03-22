import { Car } from 'lucide-react'
import { SubModelManager, type FieldDef } from './SubModelManager'
import { useDrivingLicenses, useCreateDrivingLicense, useUpdateDrivingLicense, useDeleteDrivingLicense } from '@/hooks/useUserSubModels'
import { useDictionaryOptions, useDictionaryColumnOptions, useDictionary } from '@/hooks/useDictionary'
import { CountryFlag } from '@/components/ui/CountryFlag'
import type { DrivingLicenseRead, DrivingLicenseCreate } from '@/types/api'

export function DrivingLicenseManager({ userId, compact }: { userId: string; compact?: boolean }) {
  const { data: items, isLoading } = useDrivingLicenses(userId)
  const create = useCreateDrivingLicense()
  const update = useUpdateDrivingLicense()
  const del = useDeleteDrivingLicense()
  const licenseTypeOptions = useDictionaryOptions('license_type')
  const countryOptions = useDictionaryColumnOptions('nationality', 'country')
  const { data: natEntries } = useDictionary('nationality')

  const FIELDS: FieldDef<DrivingLicenseCreate>[] = [
    licenseTypeOptions.length > 0
      ? { key: 'license_type', label: 'Type', required: true, type: 'combobox' as const, options: licenseTypeOptions }
      : { key: 'license_type', label: 'Type', required: true, placeholder: 'B, C, D...' },
    countryOptions.length > 0
      ? { key: 'country', label: 'Pays', required: true, type: 'combobox' as const, options: countryOptions }
      : { key: 'country', label: 'Pays', required: true, placeholder: 'France' },
    { key: 'expiry_date', label: 'Expire le', type: 'date' as const },
  ]

  const countryLabels: Record<string, string> = {}
  if (natEntries?.length) {
    for (const e of natEntries) countryLabels[e.code] = (e.metadata_json?.country as string) ?? e.label
  }

  const DISPLAY_COLUMNS = [
    { key: 'license_type' as const, label: 'Type' },
    { key: 'country' as const, label: 'Pays', render: (v: unknown) => <CountryFlag code={v as string} label={countryLabels[v as string] ?? (v as string)} size={14} /> },
    { key: 'expiry_date' as const, label: 'Expiration' },
  ]

  return (
    <SubModelManager<DrivingLicenseRead, DrivingLicenseCreate>
      items={items as DrivingLicenseRead[] | undefined}
      isLoading={isLoading}
      fields={FIELDS}
      displayColumns={DISPLAY_COLUMNS}
      emptyLabel="Aucun permis de conduire"
      emptyIcon={Car}
      onCreate={(p) => create.mutate({ userId, payload: p })}
      onUpdate={(itemId, p) => update.mutate({ userId, itemId, payload: p })}
      onDelete={(itemId) => del.mutate({ userId, itemId })}
      createPending={create.isPending}
      compact={compact}
    />
  )
}
