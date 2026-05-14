/**
 * JobPositionPicker — picker basé sur EntityPickerBase pour les fiches de
 * poste (Conformité). Ferme le TODO existant dans CreateTransferPanel.tsx:49
 * et complète le fix Bug #89 (picker UX au lieu d'UUID brut sur owner_id).
 *
 * Avant : `useJobPositions({ page_size: 100 })` en bulk + `SearchableSelect`,
 * silencieusement tronqué au-delà de 100 positions.
 * Après : server-side search debounced via EntityPickerBase, scale aux
 * tenants avec milliers de fiches de poste.
 */
import { Briefcase } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useJobPositions } from '@/hooks/useConformite'
import type { JobPosition } from '@/types/api'
import { EntityPickerBase } from '@/components/shared/EntityPickerBase'

interface JobPositionPickerProps {
  value?: string | null
  onChange: (id: string | null, item?: JobPosition) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  label?: string
  clearable?: boolean
}

const PAGE_SIZE = 100

export function JobPositionPicker({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  label,
  clearable = true,
}: JobPositionPickerProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const { data, isLoading } = useJobPositions({
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
      placeholder={placeholder || t('conformite.job_positions.select', 'Sélectionner une fiche de poste...')}
      icon={Briefcase}
      recentKey="opsflux:job-position-picker:recent"
      onSearchChange={setSearch}
      truncated={truncated}
      toItem={(item) => ({
        id: item.id,
        label: `${item.code} — ${item.name}`,
        secondary: item.department || null,
        keywords: [item.code, item.name, item.department ?? ''],
      })}
    />
  )
}
