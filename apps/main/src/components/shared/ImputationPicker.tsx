import { ReceiptText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useImputationReferences } from '@/hooks/useSettings'
import type { ImputationReference } from '@/services/settingsService'
import { EntityPickerBase } from '@/components/shared/EntityPickerBase'

interface ImputationPickerProps {
  value?: string | null
  onChange: (id: string | null, item?: ImputationReference) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  label?: string
  clearable?: boolean
  types?: Array<'OPEX' | 'SOPEX' | 'CAPEX' | 'OTHER'>
}

export function ImputationPicker({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  label,
  clearable = true,
  types,
}: ImputationPickerProps) {
  const { t } = useTranslation()
  const { data = [], isLoading } = useImputationReferences()
  const items = types?.length ? data.filter((item) => types.includes(item.imputation_type)) : data

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
      placeholder={placeholder || t('settings.imputations.assignment_reference_placeholder')}
      icon={ReceiptText}
      recentKey="opsflux:imputation-picker:recent"
      toItem={(item) => ({
        id: item.id,
        label: item.name,
        secondary: item.code,
        badge: item.imputation_type,
        keywords: [item.code, item.name, item.description ?? '', item.imputation_type, item.otp_policy],
      })}
    />
  )
}
