import { Building2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTiers } from '@/hooks/useTiers'
import type { Tier } from '@/types/api'
import { EntityPickerBase } from '@/components/shared/EntityPickerBase'

interface CompanyPickerProps {
  value?: string | null
  onChange: (id: string | null, item?: Tier) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  label?: string
  clearable?: boolean
}

export function CompanyPicker({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  label,
  clearable = true,
}: CompanyPickerProps) {
  const { t } = useTranslation()
  const { data, isLoading } = useTiers({ page_size: 200 })
  const items = data?.items ?? []

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
      placeholder={placeholder || t('tiers.select_company', 'Selectionner une entreprise...')}
      icon={Building2}
      recentKey="opsflux:company-picker:recent"
      toItem={(item) => ({
        id: item.id,
        label: item.name,
        secondary: item.code,
        badge: item.type || null,
        keywords: [item.code, item.name, item.alias ?? '', item.trade_name ?? '', item.email ?? ''],
      })}
    />
  )
}
