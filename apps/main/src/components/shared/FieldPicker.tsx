/**
 * FieldPicker — Searchable dropdown for selecting an oil/gas field.
 *
 * Server-side typeahead (cf. SUP-0038 followup): la racine de la
 * hierarchie asset-registry. Typiquement 5-50 fields par tenant, mais
 * une compagnie majeure peut en avoir 100+ — autant ne pas tronquer.
 */
import { Globe2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFields } from '@/hooks/useAssetRegistry'
import type { OilField } from '@/types/assetRegistry'
import { EntityPickerBase } from '@/components/shared/EntityPickerBase'

interface FieldPickerProps {
  value?: string | null
  onChange: (id: string | null, item?: OilField) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  label?: string
  clearable?: boolean
}

const PAGE_SIZE = 100

export function FieldPicker({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  label,
  clearable = true,
}: FieldPickerProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const { data, isLoading } = useFields({
    page: 1,
    page_size: PAGE_SIZE,
    search: search.trim() || undefined,
  })
  const items = data?.items ?? []
  const total = data?.total ?? items.length
  const truncated = !search.trim() && total > PAGE_SIZE

  return (
    <EntityPickerBase
      value={value}
      onChange={onChange}
      items={items}
      isLoading={isLoading}
      disabled={disabled}
      className={className}
      label={label}
      clearable={clearable}
      placeholder={placeholder || t('asset_registry.select_field', 'Sélectionner un champ pétrolier...')}
      icon={Globe2}
      recentKey="opsflux:field-picker:recent"
      onSearchChange={setSearch}
      truncated={truncated}
      toItem={(item) => ({
        id: item.id,
        label: item.name,
        secondary: item.code,
        badge: item.country || null,
        keywords: [item.code, item.name, item.country, item.basin ?? '', item.operator ?? ''],
      })}
    />
  )
}
