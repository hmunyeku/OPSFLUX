import { ScrollText } from 'lucide-react'
import { SubModelManager, type FieldDef } from './SubModelManager'
import { useFieldLicenses, useCreateFieldLicense, useUpdateFieldLicense, useDeleteFieldLicense } from '@/hooks/useAssetRegistry'
import { useDictionaryOptions } from '@/hooks/useDictionary'
import type { FieldLicense, FieldLicenseCreate } from '@/types/assetRegistry'

const LICENSE_STATUS_FALLBACK = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'EXPIRED', label: 'Expirée' },
  { value: 'PENDING_RENEWAL', label: 'En renouvellement' },
  { value: 'SUSPENDED', label: 'Suspendue' },
  { value: 'REVOKED', label: 'Révoquée' },
]

export function FieldLicenseManager({ fieldId, compact, hideAddButton, onAddRef }: {
  fieldId: string
  compact?: boolean
  hideAddButton?: boolean
  onAddRef?: (fn: () => void) => void
}) {
  const { data: items, isLoading } = useFieldLicenses(fieldId)
  const create = useCreateFieldLicense()
  const update = useUpdateFieldLicense()
  const del = useDeleteFieldLicense()

  const dictType = useDictionaryOptions('field_license_type')
  const typeOptions = dictType.length > 0 ? dictType : [
    { value: 'PSC', label: 'PSC (Contrat de Partage de Production)' },
    { value: 'CONCESSION', label: 'Concession' },
    { value: 'JOA', label: 'JOA (Accord d\'opération conjointe)' },
    { value: 'SERVICE_CONTRACT', label: 'Contrat de service' },
    { value: 'EXPLORATION', label: 'Permis d\'exploration' },
    { value: 'EXPLOITATION', label: 'Permis d\'exploitation' },
    { value: 'RECONNAISSANCE', label: 'Autorisation de reconnaissance' },
    { value: 'TRANSPORT', label: 'Autorisation de transport' },
    { value: 'ENVIRONMENTAL', label: 'Permis environnemental' },
  ]

  const dictStatus = useDictionaryOptions('license_status')
  const statusOptions = dictStatus.length > 0 ? dictStatus : LICENSE_STATUS_FALLBACK

  const FIELDS: FieldDef<FieldLicenseCreate>[] = [
    { key: 'license_type', label: 'Type', required: true, type: 'combobox' as const, options: typeOptions },
    { key: 'license_number', label: 'N° Licence', required: true, placeholder: 'PSC-2015-001' },
    { key: 'authority', label: 'Autorité', placeholder: 'SNH, Ministère...' },
    { key: 'issue_date', label: 'Délivrée le', type: 'date' as const },
    { key: 'expiry_date', label: 'Expiré le', type: 'date' as const },
    { key: 'status', label: 'Statut', type: 'combobox' as const, options: statusOptions },
  ]

  const DISPLAY_COLUMNS = [
    { key: 'license_type' as const, label: 'Type', format: (v: unknown) => typeOptions.find(o => o.value === v)?.label ?? String(v ?? '') },
    { key: 'license_number' as const, label: 'Numéro' },
    { key: 'expiry_date' as const, label: 'Expiration' },
    { key: 'status' as const, label: 'Statut', format: (v: unknown) => statusOptions.find(o => o.value === v)?.label ?? String(v ?? '') },
  ]

  return (
    <SubModelManager<FieldLicense, FieldLicenseCreate>
      items={items as FieldLicense[] | undefined}
      isLoading={isLoading}
      fields={FIELDS}
      displayColumns={DISPLAY_COLUMNS}
      emptyLabel="Aucune licence"
      emptyIcon={ScrollText}
      onCreate={(p) => create.mutate({ fieldId, payload: p })}
      onUpdate={(itemId, p) => update.mutate({ fieldId, licenseId: itemId, payload: p })}
      onDelete={(itemId) => del.mutate({ fieldId, licenseId: itemId })}
      createPending={create.isPending}
      compact={compact}
      hideAddButton={hideAddButton}
      onAddRef={onAddRef}
    />
  )
}
