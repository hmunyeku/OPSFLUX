/**
 * EquipmentPicker — Searchable dropdown for selecting a piece of P&ID equipment.
 *
 * Server-side typeahead (cf. SUP-0038 followup): avant les <select> en
 * dur dans CreatePIDPanel / CreateDCSTagPanel chargeaient 500 equipements
 * en bulk avec un risque de troncature silencieuse sur les installations
 * complexes (un seul rig peut avoir des milliers de tags). Ce picker fait
 * un fetch debounce ?search=q + banner 'truncated' si la page est saturee.
 */
import { Wrench } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEquipment } from '@/hooks/usePidPfd'
import type { Equipment } from '@/services/pidPfdService'
import { EntityPickerBase } from '@/components/shared/EntityPickerBase'

interface EquipmentPickerProps {
  value?: string | null
  onChange: (id: string | null, item?: Equipment) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  label?: string
  clearable?: boolean
  /** Restreint la liste a un projet specifique */
  projectId?: string | null
  /** Restreint la liste a un P&ID specifique */
  pidId?: string | null
}

const PAGE_SIZE = 100

export function EquipmentPicker({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  label,
  clearable = true,
  projectId,
  pidId,
}: EquipmentPickerProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const { data, isLoading } = useEquipment({
    page: 1,
    page_size: PAGE_SIZE,
    search: search.trim() || undefined,
    project_id: projectId ?? undefined,
    pid_id: pidId ?? undefined,
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
      placeholder={placeholder || t('pidpfd.select_equipment', 'Sélectionner un équipement...')}
      icon={Wrench}
      recentKey="opsflux:equipment-picker:recent"
      onSearchChange={setSearch}
      truncated={truncated}
      toItem={(item) => ({
        id: item.id,
        label: item.tag,
        secondary: item.description || item.equipment_type,
        badge: item.equipment_type || null,
        keywords: [item.tag, item.description ?? '', item.equipment_type, item.service ?? ''],
      })}
    />
  )
}
