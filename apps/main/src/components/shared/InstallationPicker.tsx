/**
 * InstallationPicker — Searchable dropdown for selecting an installation.
 *
 * Server-side typeahead (cf. SUP-0038 followup). Filtrage cascade
 * optionnel par siteId. Une installation = plateforme fixe, FPSO,
 * tete de puits, station de compression, etc.
 */
import { Factory } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useInstallations } from '@/hooks/useAssetRegistry'
import type { Installation } from '@/types/assetRegistry'
import { EntityPickerBase } from '@/components/shared/EntityPickerBase'

interface InstallationPickerProps {
  value?: string | null
  onChange: (id: string | null, item?: Installation) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  label?: string
  clearable?: boolean
  /** Restreint la liste aux installations d'un site donne (cascade). */
  siteId?: string | null
}

const PAGE_SIZE = 100

export function InstallationPicker({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  label,
  clearable = true,
  siteId,
}: InstallationPickerProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const { data, isLoading } = useInstallations({
    page: 1,
    page_size: PAGE_SIZE,
    search: search.trim() || undefined,
    site_id: siteId ?? undefined,
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
      placeholder={placeholder || t('asset_registry.select_installation', 'Sélectionner une installation...')}
      icon={Factory}
      recentKey="opsflux:installation-picker:recent"
      onSearchChange={setSearch}
      truncated={truncated}
      toItem={(item) => ({
        id: item.id,
        label: item.name,
        secondary: item.code,
        badge: item.installation_type || item.environment || null,
        keywords: [item.code, item.name, item.installation_type, item.environment],
      })}
    />
  )
}
