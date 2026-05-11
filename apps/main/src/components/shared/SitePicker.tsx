/**
 * SitePicker — Searchable dropdown for selecting an oil/gas site.
 *
 * Server-side typeahead (cf. SUP-0038 followup). Filtrage cascade
 * optionnel par fieldId — typique du flow 'Creer une installation:
 * d'abord choisir le champ, puis le site'.
 */
import { MapPin } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSites } from '@/hooks/useAssetRegistry'
import type { OilSite } from '@/types/assetRegistry'
import { EntityPickerBase } from '@/components/shared/EntityPickerBase'

interface SitePickerProps {
  value?: string | null
  onChange: (id: string | null, item?: OilSite) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  label?: string
  clearable?: boolean
  /** Restreint la liste aux sites d'un field donne (cascade). */
  fieldId?: string | null
}

const PAGE_SIZE = 100

export function SitePicker({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  label,
  clearable = true,
  fieldId,
}: SitePickerProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const { data, isLoading } = useSites({
    page: 1,
    page_size: PAGE_SIZE,
    search: search.trim() || undefined,
    field_id: fieldId ?? undefined,
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
      placeholder={placeholder || t('asset_registry.select_site', 'Sélectionner un site...')}
      icon={MapPin}
      recentKey="opsflux:site-picker:recent"
      onSearchChange={setSearch}
      truncated={truncated}
      toItem={(item) => ({
        id: item.id,
        label: item.name,
        secondary: item.code,
        badge: item.environment || item.site_type || null,
        keywords: [item.code, item.name, item.country, item.region ?? '', item.site_type, item.environment],
      })}
    />
  )
}
