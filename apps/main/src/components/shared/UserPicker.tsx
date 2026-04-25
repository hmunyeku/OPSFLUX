import { User } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUsers } from '@/hooks/useUsers'
import type { UserRead } from '@/types/api'
import { EntityPickerBase } from '@/components/shared/EntityPickerBase'

interface UserPickerProps {
  value?: string | null
  onChange: (id: string | null, item?: UserRead) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  label?: string
  clearable?: boolean
}

export function UserPicker({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  label,
  clearable = true,
}: UserPickerProps) {
  const { t } = useTranslation()
  const { data, isLoading } = useUsers({ page: 1, page_size: 200, active: true })
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
      placeholder={placeholder || t('users.select_user', 'Selectionner un utilisateur...')}
      icon={User}
      recentKey="opsflux:user-picker:recent"
      toItem={(item) => ({
        id: item.id,
        label: `${item.first_name} ${item.last_name}`.trim() || item.email,
        secondary: item.email,
        badge: item.user_type || null,
        keywords: [item.first_name, item.last_name, item.email, item.user_type ?? ''],
      })}
    />
  )
}
