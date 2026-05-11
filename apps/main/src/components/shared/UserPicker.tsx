import { User } from 'lucide-react'
import { useState } from 'react'
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

const PAGE_SIZE = 100

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
  // Server-side search (cf. SUP-0038 followup): avant page_size:200 en bulk,
  // silently tronque. Maintenant search debounced.
  const [search, setSearch] = useState('')
  const { data, isLoading } = useUsers({
    page: 1,
    page_size: PAGE_SIZE,
    active: true,
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
      placeholder={placeholder || t('users.select_user', 'Sélectionner un utilisateur...')}
      icon={User}
      recentKey="opsflux:user-picker:recent"
      onSearchChange={setSearch}
      truncated={truncated}
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
